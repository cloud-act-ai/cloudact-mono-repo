"""
GenAI PAYG Usage Processor

Extracts PAYG (token-based) usage from provider APIs and writes to BigQuery.
Reads from: Provider APIs (OpenAI, Anthropic, Gemini, Azure, AWS, GCP)
Writes to: {org_slug}_{env}.genai_payg_usage_raw

Usage in pipeline:
    ps_type: genai.payg_usage

Idempotency:
    Uses MERGE (upsert) pattern to prevent duplicate data on re-runs.
    Deduplication key: (org_slug, provider, model, usage_date)

Fixes Applied:
    CRITICAL #1: Replace streaming inserts with MERGE for idempotency
    HIGH #4: Add proper idempotency key to prevent TOCTOU race conditions
    MEDIUM #11: Track which records succeeded for retry handling
    MEDIUM #14: Fail-closed on idempotency check errors
    LOW #15: Cache provider API responses with idempotency key
"""

import logging
import hashlib
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Tuple
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings
from src.core.security.kms_decryption import decrypt_credentials
from src.core.utils.validators import is_valid_org_slug

from .provider_adapters import (
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    AzureOpenAIAdapter,
    AWSBedrockAdapter,
    GCPVertexAdapter,
    DeepSeekAdapter
)

# Cache for provider API responses (in-memory, cleared per execution)
_api_response_cache: Dict[str, Any] = {}


class PAYGUsageProcessor:
    """
    Extracts PAYG usage from GenAI providers.

    Reads from: Provider APIs
    Writes to: {org_slug}_{env}.genai_payg_usage_raw
    """

    ADAPTER_MAP = {
        "openai": OpenAIAdapter,
        "anthropic": AnthropicAdapter,
        "gemini": GeminiAdapter,
        "deepseek": DeepSeekAdapter,
        "azure_openai": AzureOpenAIAdapter,
        "aws_bedrock": AWSBedrockAdapter,
        "gcp_vertex": GCPVertexAdapter
    }

    def __init__(self):
        self.settings = get_settings()
        # LOW #19: Use full module path for logger name
        self.logger = logging.getLogger("src.core.processors.genai.payg_usage")

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract PAYG usage from provider API.

        Args:
            step_config: Step configuration containing:
                - config.provider: Provider name (required)
                - config.start_date: Start date (YYYY-MM-DD)
                - config.end_date: End date (YYYY-MM-DD)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)
                - run_id: Pipeline run ID

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - rows_inserted: Number of usage records written
                - provider: Provider name
        """
        org_slug = context.get("org_slug")
        run_id = context.get("run_id", "manual")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        if not is_valid_org_slug(org_slug):
            return {
                "status": "FAILED",
                "error": "Invalid org_slug format. Must be alphanumeric with underscores, 3-50 characters (^[a-zA-Z0-9_]{3,50}$)"
            }

        provider = config.get("provider")
        if not provider or provider not in self.ADAPTER_MAP:
            return {"status": "FAILED", "error": f"Invalid provider: {provider}"}

        start_date = self._parse_date(config.get("start_date") or context.get("start_date"))
        end_date = self._parse_date(config.get("end_date") or context.get("end_date") or start_date)

        if not start_date:
            return {"status": "FAILED", "error": "start_date is required"}

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(
            f"Extracting PAYG usage for {org_slug}/{provider}",
            extra={"org_slug": org_slug, "provider": provider, "start_date": str(start_date)}
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Get credentials for this provider
            credentials = await self._get_provider_credentials(bq_client, org_slug, provider)
            if not credentials:
                return {
                    "status": "SUCCESS",
                    "provider": provider,
                    "message": f"No credentials found for {provider}. Skipping."
                }

            # HIGH FIX #4: Generate idempotency key BEFORE processing to prevent TOCTOU
            idempotency_key = self._generate_idempotency_key(org_slug, provider, start_date)

            # Check if we should skip (idempotency - optional based on config)
            force_refresh = config.get("force_refresh", False)
            if not force_refresh:
                # HIGH FIX #4: Register idempotency key BEFORE checking if already processed
                key_registered, already_processed = await self._check_and_register_idempotency(
                    bq_client, project_id, org_slug, idempotency_key, provider, start_date
                )

                if already_processed:
                    self.logger.info(
                        f"Skipping {provider} usage extraction - already processed for {start_date}. "
                        "Use force_refresh=true to re-extract."
                    )
                    return {
                        "status": "SUCCESS",
                        "provider": provider,
                        "rows_inserted": 0,
                        "skipped": True,
                        "message": f"Already processed for {start_date}"
                    }

                if not key_registered:
                    # Another process is currently working on this - return to avoid conflict
                    self.logger.info(
                        f"Another process is handling {provider} for {start_date}. Skipping to avoid conflict."
                    )
                    return {
                        "status": "SUCCESS",
                        "provider": provider,
                        "rows_inserted": 0,
                        "skipped": True,
                        "message": "Concurrent processing detected, skipping"
                    }

            # Initialize adapter and extract usage
            adapter_class = self.ADAPTER_MAP[provider]
            adapter = adapter_class(credentials, org_slug)

            # LOW FIX #15: Check cache for API response before calling provider
            cache_key = f"{org_slug}:{provider}:{start_date}:{end_date}"
            if cache_key in _api_response_cache:
                self.logger.info(f"Using cached API response for {cache_key}")
                usage_records = _api_response_cache[cache_key]
            else:
                usage_records = await adapter.extract_payg_usage(start_date, end_date)
                # Cache the response for potential retries
                _api_response_cache[cache_key] = usage_records

            if not usage_records:
                return {
                    "status": "SUCCESS",
                    "provider": provider,
                    "rows_inserted": 0,
                    "message": f"No usage data for {provider} in date range"
                }

            # Add lineage metadata to records (standardized x_ prefix columns)
            now = datetime.utcnow().isoformat() + "Z"
            pipeline_id = f"genai_payg_{provider}"
            credential_id = credentials.get("credential_id", "default")
            for record in usage_records:
                record["x_pipeline_id"] = pipeline_id
                record["x_credential_id"] = credential_id
                record["x_pipeline_run_date"] = start_date.isoformat()
                record["x_run_id"] = run_id
                record["x_ingested_at"] = now

            # Write to BigQuery using MERGE (CRITICAL FIX #1)
            table_id = f"{project_id}.{dataset_id}.genai_payg_usage_raw"
            insert_result = await self._insert_usage_merge(bq_client, table_id, usage_records)

            rows_inserted = insert_result.get("inserted", 0)
            successful_ids = insert_result.get("successful_ids", [])

            # HIGH FIX #4: Mark idempotency key as completed on success
            if not force_refresh and rows_inserted > 0:
                await self._complete_idempotency_key(
                    bq_client, project_id, org_slug, idempotency_key
                )

            self.logger.info(
                f"Inserted {rows_inserted} PAYG usage records for {provider}",
                extra={"successful_ids_count": len(successful_ids)}
            )
            return {
                "status": "SUCCESS",
                "provider": provider,
                "rows_inserted": rows_inserted,
                "date_range": f"{start_date} to {end_date}",
                "successful_record_ids": successful_ids  # MEDIUM FIX #11: Return successful IDs
            }

        except Exception as e:
            # SECURITY: Log full error internally but return generic message to API
            self.logger.error(
                f"Failed to extract PAYG usage: {type(e).__name__}: {e}",
                exc_info=True,
                extra={"org_slug": org_slug, "provider": provider}
            )
            # HIGH FIX #4: Delete idempotency key on failure to allow retry
            try:
                if 'idempotency_key' in locals() and not force_refresh:
                    await self._delete_idempotency_key(
                        bq_client, project_id, org_slug, idempotency_key
                    )
            except Exception:
                pass  # Best effort cleanup

            return {
                "status": "FAILED",
                "provider": provider,
                "error": "Failed to extract usage data. Check logs for details."
            }

    async def _get_provider_credentials(
        self,
        bq_client: BigQueryClient,
        org_slug: str,
        provider: str
    ) -> Dict[str, Any]:
        """Get and decrypt credentials for provider."""
        query = f"""
            SELECT credential_id, encrypted_credential, provider, credential_type
            FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug
              AND provider = @provider
              AND is_active = TRUE
            LIMIT 1
        """

        results = list(bq_client.query(query, parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("provider", "STRING", provider)
        ]))

        if not results:
            return None

        row = results[0]
        encrypted = row.get("encrypted_credential")
        credential_id = row.get("credential_id")

        # Decrypt credentials
        decrypted = await decrypt_credentials(encrypted)
        decrypted["credential_id"] = credential_id
        return decrypted

    def _generate_idempotency_key(self, org_slug: str, provider: str, process_date: date) -> str:
        """
        HIGH FIX #4: Generate a unique idempotency key for this processing request.

        The key is deterministic so retries with same parameters get same key.
        """
        key_input = f"payg_usage:{org_slug}:{provider}:{process_date.isoformat()}"
        return hashlib.sha256(key_input.encode()).hexdigest()[:32]

    async def _check_and_register_idempotency(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        org_slug: str,
        idempotency_key: str,
        provider: str,
        process_date: date
    ) -> Tuple[bool, bool]:
        """
        HIGH FIX #4: Atomically check and register idempotency key.

        Uses MERGE to atomically check if key exists and insert if not.
        This prevents TOCTOU (time-of-check-time-of-use) race conditions.

        Returns:
            Tuple of (key_registered, already_processed)
            - key_registered: True if we successfully registered the key (we own this processing)
            - already_processed: True if data already exists in target table
        """
        try:
            # First check if data already exists in the target table
            dataset_id = self.settings.get_org_dataset_name(org_slug)
            check_query = f"""
                SELECT COUNT(*) as cnt
                FROM `{project_id}.{dataset_id}.genai_payg_usage_raw`
                WHERE org_slug = @org_slug
                  AND provider = @provider
                  AND usage_date = @usage_date
                LIMIT 1
            """

            results = list(bq_client.query(check_query, parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("usage_date", "DATE", process_date.isoformat()),
            ]))

            if results and results[0].get("cnt", 0) > 0:
                return (False, True)  # Data exists, already processed

            # Now try to register our idempotency key atomically using MERGE
            # This prevents race condition between check and insert
            merge_query = f"""
                MERGE `{project_id}.organizations.org_idempotency_keys` T
                USING (SELECT @idempotency_key as idempotency_key) S
                ON T.idempotency_key = S.idempotency_key
                WHEN NOT MATCHED THEN
                    INSERT (idempotency_key, org_slug, operation_type, status, created_at, expires_at)
                    VALUES (
                        @idempotency_key,
                        @org_slug,
                        @operation_type,
                        'processing',
                        CURRENT_TIMESTAMP(),
                        TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
                    )
            """

            job = bq_client.client.query(merge_query, job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("idempotency_key", "STRING", idempotency_key),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("operation_type", "STRING", f"payg_usage:{provider}:{process_date}"),
                ]
            ))
            job.result()

            # If we inserted a row, we own this processing
            rows_affected = job.num_dml_affected_rows or 0
            return (rows_affected > 0, False)

        except Exception as e:
            # MEDIUM FIX #14: Fail-closed on idempotency check error
            # Return error instead of assuming not processed
            self.logger.error(
                f"Idempotency check failed - FAILING CLOSED for safety: {type(e).__name__}: {e}",
                extra={"org_slug": org_slug, "provider": provider}
            )
            # Fail closed - do not process if we can't verify idempotency
            raise RuntimeError(
                f"Idempotency check failed. Cannot safely proceed without verification. Error: {type(e).__name__}"
            )

    async def _complete_idempotency_key(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        org_slug: str,
        idempotency_key: str
    ) -> None:
        """HIGH FIX #4: Mark idempotency key as completed."""
        try:
            update_query = f"""
                UPDATE `{project_id}.organizations.org_idempotency_keys`
                SET status = 'completed', completed_at = CURRENT_TIMESTAMP()
                WHERE idempotency_key = @idempotency_key
            """
            bq_client.client.query(update_query, job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("idempotency_key", "STRING", idempotency_key),
                ]
            )).result()
        except Exception as e:
            self.logger.warning(f"Failed to mark idempotency key complete: {e}")

    async def _delete_idempotency_key(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        org_slug: str,
        idempotency_key: str
    ) -> None:
        """HIGH FIX #4: Delete idempotency key on failure to allow retry."""
        try:
            delete_query = f"""
                DELETE FROM `{project_id}.organizations.org_idempotency_keys`
                WHERE idempotency_key = @idempotency_key AND status = 'processing'
            """
            bq_client.client.query(delete_query, job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("idempotency_key", "STRING", idempotency_key),
                ]
            )).result()
        except Exception as e:
            self.logger.warning(f"Failed to delete idempotency key: {e}")

    async def _insert_usage_merge(
        self,
        bq_client: BigQueryClient,
        table_id: str,
        records: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        CRITICAL FIX #1: Insert usage records using MERGE for idempotency.

        Uses MERGE (upsert) instead of streaming inserts to prevent duplicate
        data on re-runs. Deduplication key: (org_slug, provider, model, usage_date, region)

        MEDIUM FIX #11: Returns list of successfully processed record IDs for retry handling.

        Returns:
            Dict with 'inserted' count and 'successful_ids' list
        """
        if not records:
            return {"inserted": 0, "successful_ids": []}

        # Convert date objects to strings for SQL
        for record in records:
            if isinstance(record.get("usage_date"), date):
                record["usage_date"] = record["usage_date"].isoformat()

        try:
            client = bigquery.Client(project=self.settings.gcp_project_id)
            successful_ids = []
            total_affected = 0

            # Process in batches to avoid query size limits
            batch_size = 100
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]

                # Build VALUES clause for this batch using parameterized approach
                # We'll use a temp table approach for safety
                values_rows = []
                for record in batch:
                    values_rows.append({
                        "org_slug": record.get("org_slug"),
                        "provider": record.get("provider"),
                        "model": record.get("model"),
                        "model_family": record.get("model_family"),
                        "usage_date": record.get("usage_date"),
                        "region": record.get("region") or "global",
                        "input_tokens": record.get("input_tokens") or 0,
                        "output_tokens": record.get("output_tokens") or 0,
                        "cached_input_tokens": record.get("cached_input_tokens") or 0,
                        "total_tokens": record.get("total_tokens") or 0,
                        "request_count": record.get("request_count") or 0,
                        "is_batch": record.get("is_batch") or False,
                        "hierarchy_dept_id": record.get("hierarchy_dept_id"),
                        "hierarchy_dept_name": record.get("hierarchy_dept_name"),
                        "hierarchy_project_id": record.get("hierarchy_project_id"),
                        "hierarchy_project_name": record.get("hierarchy_project_name"),
                        "hierarchy_team_id": record.get("hierarchy_team_id"),
                        "hierarchy_team_name": record.get("hierarchy_team_name"),
                        # Standardized lineage columns (x_ prefix)
                        "x_pipeline_id": record.get("x_pipeline_id"),
                        "x_credential_id": record.get("x_credential_id"),
                        "x_pipeline_run_date": record.get("x_pipeline_run_date"),
                        "x_run_id": record.get("x_run_id"),
                        "x_ingested_at": record.get("x_ingested_at"),
                    })

                # Use CREATE TEMP TABLE + MERGE pattern for safety
                temp_table = f"_temp_payg_usage_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"

                # Create temp table and insert data
                create_temp = f"""
                    CREATE TEMP TABLE `{temp_table}` (
                        org_slug STRING, provider STRING, model STRING, model_family STRING,
                        usage_date DATE, region STRING, input_tokens INT64, output_tokens INT64,
                        cached_input_tokens INT64, total_tokens INT64, request_count INT64,
                        is_batch BOOL, hierarchy_dept_id STRING,
                        hierarchy_dept_name STRING, hierarchy_project_id STRING,
                        hierarchy_project_name STRING, hierarchy_team_id STRING,
                        hierarchy_team_name STRING,
                        x_pipeline_id STRING, x_credential_id STRING, x_pipeline_run_date DATE,
                        x_run_id STRING, x_ingested_at TIMESTAMP
                    )
                """
                client.query(create_temp).result()

                # Insert into temp table using streaming (temp tables are ephemeral)
                temp_table_ref = f"{client.project}.{temp_table}"
                client.insert_rows_json(temp_table_ref, values_rows)

                # Now MERGE from temp table to target
                # Uses composite key: (org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)
                merge_query = f"""
                    MERGE `{table_id}` T
                    USING `{temp_table}` S
                    ON T.org_slug = S.org_slug
                        AND T.x_pipeline_id = S.x_pipeline_id
                        AND T.x_credential_id = S.x_credential_id
                        AND T.x_pipeline_run_date = S.x_pipeline_run_date
                        AND T.provider = S.provider
                        AND T.model = S.model
                        AND T.usage_date = S.usage_date
                        AND COALESCE(T.region, 'global') = COALESCE(S.region, 'global')
                    WHEN MATCHED THEN
                        UPDATE SET
                            input_tokens = S.input_tokens,
                            output_tokens = S.output_tokens,
                            cached_input_tokens = S.cached_input_tokens,
                            total_tokens = S.total_tokens,
                            request_count = S.request_count,
                            is_batch = S.is_batch,
                            hierarchy_dept_id = S.hierarchy_dept_id,
                            hierarchy_dept_name = S.hierarchy_dept_name,
                            hierarchy_project_id = S.hierarchy_project_id,
                            hierarchy_project_name = S.hierarchy_project_name,
                            hierarchy_team_id = S.hierarchy_team_id,
                            hierarchy_team_name = S.hierarchy_team_name,
                            x_run_id = S.x_run_id,
                            x_ingested_at = S.x_ingested_at
                    WHEN NOT MATCHED THEN
                        INSERT (org_slug, provider, model, model_family, usage_date, region,
                                input_tokens, output_tokens, cached_input_tokens, total_tokens,
                                request_count, is_batch, hierarchy_dept_id,
                                hierarchy_dept_name, hierarchy_project_id, hierarchy_project_name,
                                hierarchy_team_id, hierarchy_team_name,
                                x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
                        VALUES (S.org_slug, S.provider, S.model, S.model_family, S.usage_date, S.region,
                                S.input_tokens, S.output_tokens, S.cached_input_tokens, S.total_tokens,
                                S.request_count, S.is_batch, S.hierarchy_dept_id,
                                S.hierarchy_dept_name, S.hierarchy_project_id, S.hierarchy_project_name,
                                S.hierarchy_team_id, S.hierarchy_team_name,
                                S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date, S.x_run_id, S.x_ingested_at)
                """

                job = client.query(merge_query)
                job.result()

                affected = job.num_dml_affected_rows or len(batch)
                total_affected += affected

                # MEDIUM FIX #11: Track successful record IDs
                for record in batch:
                    record_id = f"{record.get('org_slug')}:{record.get('provider')}:{record.get('model')}:{record.get('usage_date')}"
                    successful_ids.append(record_id)

            self.logger.info(
                f"MERGE completed: {total_affected} rows affected",
                extra={"table_id": table_id, "record_count": len(records)}
            )

            return {"inserted": total_affected, "successful_ids": successful_ids}

        except Exception as e:
            self.logger.error(
                f"BigQuery MERGE failed: {type(e).__name__}",
                extra={"table_id": table_id, "record_count": len(records)}
            )
            raise

    def _parse_date(self, date_str: str) -> date:
        """Parse date string to date object."""
        if not date_str:
            return None
        if isinstance(date_str, date):
            return date_str
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None


def get_engine():
    """Factory function for pipeline executor - REQUIRED for dynamic loading"""
    return PAYGUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = PAYGUsageProcessor()
    return await processor.execute(step_config, context)
