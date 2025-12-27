"""
GenAI Commitment Usage Processor

Extracts commitment (PTU/GSU) usage from cloud providers.
Reads from: Azure Monitor, AWS CloudWatch, GCP Monitoring
Writes to: {org_slug}_{env}.genai_commitment_usage_raw

Usage in pipeline:
    ps_type: genai.commitment_usage

Idempotency:
    Uses MERGE (upsert) pattern to prevent duplicate data on re-runs.
    Deduplication key: (org_slug, provider, commitment_id, usage_date)
    Use force_refresh=true to re-extract existing data.

Fixes Applied:
    CRITICAL #2: Replace streaming inserts with MERGE for idempotency
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings
from src.core.security.kms_decryption import decrypt_credentials
from src.core.utils.validators import is_valid_org_slug

from .provider_adapters import AzureOpenAIAdapter, AWSBedrockAdapter, GCPVertexAdapter


class CommitmentUsageProcessor:
    """
    Extracts commitment usage from cloud providers.

    Reads from: Provider monitoring APIs
    Writes to: {org_slug}_{env}.genai_commitment_usage_raw
    """

    ADAPTER_MAP = {
        "azure_openai": AzureOpenAIAdapter,
        "aws_bedrock": AWSBedrockAdapter,
        "gcp_vertex": GCPVertexAdapter
    }

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract commitment usage from provider.

        Args:
            step_config: Step configuration containing:
                - config.provider: Provider name (required)
                - config.start_date: Start date
                - config.end_date: End date
            context: Execution context with org_slug, run_id

        Returns:
            Dict with status, rows_inserted, provider
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
            return {"status": "FAILED", "error": f"Invalid commitment provider: {provider}"}

        start_date = self._parse_date(config.get("start_date") or context.get("start_date"))
        end_date = self._parse_date(config.get("end_date") or context.get("end_date") or start_date)

        if not start_date:
            return {"status": "FAILED", "error": "start_date is required"}

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(f"Extracting commitment usage for {org_slug}/{provider}")

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Get credentials
            credentials = await self._get_provider_credentials(bq_client, org_slug, provider)
            if not credentials:
                return {
                    "status": "SUCCESS",
                    "provider": provider,
                    "message": f"No credentials found for {provider}. Skipping."
                }

            # Check if we should skip (idempotency - optional based on config)
            force_refresh = config.get("force_refresh", False)
            if not force_refresh:
                already_processed = await self._check_already_processed(
                    bq_client, project_id, dataset_id, org_slug, start_date, provider
                )
                if already_processed:
                    self.logger.info(
                        f"Skipping {provider} commitment usage extraction - already processed for {start_date}. "
                        "Use force_refresh=true to re-extract."
                    )
                    return {
                        "status": "SUCCESS",
                        "provider": provider,
                        "rows_inserted": 0,
                        "skipped": True,
                        "message": f"Already processed for {start_date}"
                    }

            # Extract commitment usage
            adapter_class = self.ADAPTER_MAP[provider]
            adapter = adapter_class(credentials, org_slug)

            usage_records = await adapter.extract_commitment_usage(start_date, end_date)

            if not usage_records:
                return {
                    "status": "SUCCESS",
                    "provider": provider,
                    "rows_inserted": 0,
                    "message": f"No commitment usage for {provider}"
                }

            # Add lineage metadata (standardized x_ prefix columns)
            now = datetime.utcnow().isoformat() + "Z"
            pipeline_id = f"genai_commitment_usage_{provider}"
            credential_id = credentials.get("credential_id", "default")
            for record in usage_records:
                record["org_slug"] = org_slug
                record["x_pipeline_id"] = pipeline_id
                record["x_credential_id"] = credential_id
                record["x_pipeline_run_date"] = start_date.isoformat()
                record["x_run_id"] = run_id
                record["x_ingested_at"] = now

            # Write to BigQuery
            table_id = f"{project_id}.{dataset_id}.genai_commitment_usage_raw"
            insert_result = await self._insert_usage(bq_client, table_id, usage_records)

            rows_inserted = insert_result["inserted"]
            rows_failed = insert_result["failed"]

            self.logger.info(f"Inserted {rows_inserted} commitment usage records, {rows_failed} failed")
            result = {
                "status": "SUCCESS",
                "provider": provider,
                "rows_inserted": rows_inserted,
                "rows_failed": rows_failed
            }
            if rows_failed > 0:
                result["partial_failure"] = True
            return result

        except Exception as e:
            self.logger.error(f"Failed to extract commitment usage: {e}", exc_info=True)
            return {"status": "FAILED", "provider": provider, "error": str(e)}

    async def _get_provider_credentials(self, bq_client, org_slug, provider):
        """Get credentials for provider."""
        query = f"""
            SELECT credential_id, encrypted_credential
            FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
            LIMIT 1
        """
        results = list(bq_client.query(query, parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("provider", "STRING", provider)
        ]))
        if not results:
            return None
        encrypted = results[0].get("encrypted_credential")
        decrypted = await decrypt_credentials(encrypted)
        decrypted["credential_id"] = results[0].get("credential_id")
        return decrypted

    async def _check_already_processed(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        dataset_id: str,
        org_slug: str,
        process_date: date,
        provider: str
    ) -> bool:
        """
        Idempotency check: Verify if commitment usage data for this date/provider already exists.

        Args:
            bq_client: BigQuery client
            project_id: GCP project ID
            dataset_id: BigQuery dataset ID
            org_slug: Organization identifier
            process_date: Date to check
            provider: Provider name

        Returns:
            True if data already exists for this date/provider combination
        """
        try:
            query = f"""
                SELECT COUNT(*) as cnt
                FROM `{project_id}.{dataset_id}.genai_commitment_usage_raw`
                WHERE org_slug = @org_slug
                  AND provider = @provider
                  AND usage_date = @usage_date
                LIMIT 1
            """

            results = list(bq_client.query(query, parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("usage_date", "DATE", process_date.isoformat()),
            ]))

            if results and results[0].get("cnt", 0) > 0:
                return True
            return False

        except Exception as e:
            # If table doesn't exist or query fails, assume not processed
            self.logger.warning(
                f"Idempotency check failed (assuming not processed): {type(e).__name__}"
            )
            return False

    async def _insert_usage(self, bq_client, table_id, records):
        """
        CRITICAL FIX #2: Insert records using MERGE for idempotency.

        Uses MERGE (upsert) instead of streaming inserts to prevent duplicate
        data on re-runs. Deduplication key: (org_slug, provider, commitment_id, usage_date)

        Returns:
            Dict with inserted and failed counts
        """
        if not records:
            return {"inserted": 0, "failed": 0}

        for record in records:
            if isinstance(record.get("usage_date"), date):
                record["usage_date"] = record["usage_date"].isoformat()

        try:
            client = bigquery.Client(project=self.settings.gcp_project_id)
            total_affected = 0

            # Process in batches
            batch_size = 100
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]

                # Build values for temp table
                values_rows = []
                for record in batch:
                    values_rows.append({
                        "org_slug": record.get("org_slug"),
                        "provider": record.get("provider"),
                        "commitment_id": record.get("commitment_id"),
                        "commitment_type": record.get("commitment_type"),
                        "model": record.get("model"),
                        "usage_date": record.get("usage_date"),
                        "region": record.get("region") or "global",
                        "ptu_units": record.get("ptu_units") or 0,
                        "tokens_generated": record.get("tokens_generated") or 0,
                        "utilization_pct": record.get("utilization_pct") or 0.0,
                        "usage_hours": record.get("usage_hours") or 0.0,
                        "credential_id": record.get("credential_id"),
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

                # Create temp table
                temp_table = f"_temp_commitment_usage_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
                create_temp = f"""
                    CREATE TEMP TABLE `{temp_table}` (
                        org_slug STRING, provider STRING, commitment_id STRING, commitment_type STRING,
                        model STRING, usage_date DATE, region STRING, ptu_units INT64,
                        tokens_generated INT64, utilization_pct FLOAT64, usage_hours FLOAT64,
                        credential_id STRING, hierarchy_dept_id STRING, hierarchy_dept_name STRING,
                        hierarchy_project_id STRING, hierarchy_project_name STRING,
                        hierarchy_team_id STRING, hierarchy_team_name STRING,
                        x_pipeline_id STRING, x_credential_id STRING, x_pipeline_run_date DATE,
                        x_run_id STRING, x_ingested_at TIMESTAMP
                    )
                """
                client.query(create_temp).result()

                # Insert into temp table
                temp_table_ref = f"{client.project}.{temp_table}"
                client.insert_rows_json(temp_table_ref, values_rows)

                # MERGE from temp table to target
                merge_query = f"""
                    MERGE `{table_id}` T
                    USING `{temp_table}` S
                    ON T.org_slug = S.org_slug
                        AND T.provider = S.provider
                        AND T.commitment_id = S.commitment_id
                        AND T.usage_date = S.usage_date
                    WHEN MATCHED THEN
                        UPDATE SET
                            ptu_units = S.ptu_units,
                            tokens_generated = S.tokens_generated,
                            utilization_pct = S.utilization_pct,
                            usage_hours = S.usage_hours,
                            hierarchy_dept_id = S.hierarchy_dept_id,
                            hierarchy_dept_name = S.hierarchy_dept_name,
                            hierarchy_project_id = S.hierarchy_project_id,
                            hierarchy_project_name = S.hierarchy_project_name,
                            hierarchy_team_id = S.hierarchy_team_id,
                            hierarchy_team_name = S.hierarchy_team_name,
                            x_pipeline_id = S.x_pipeline_id,
                            x_credential_id = S.x_credential_id,
                            x_pipeline_run_date = S.x_pipeline_run_date,
                            x_run_id = S.x_run_id,
                            x_ingested_at = S.x_ingested_at
                    WHEN NOT MATCHED THEN
                        INSERT (org_slug, provider, commitment_id, commitment_type, model, usage_date, region,
                                ptu_units, tokens_generated, utilization_pct, usage_hours, credential_id,
                                hierarchy_dept_id, hierarchy_dept_name, hierarchy_project_id,
                                hierarchy_project_name, hierarchy_team_id, hierarchy_team_name,
                                x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
                        VALUES (S.org_slug, S.provider, S.commitment_id, S.commitment_type, S.model, S.usage_date, S.region,
                                S.ptu_units, S.tokens_generated, S.utilization_pct, S.usage_hours, S.credential_id,
                                S.hierarchy_dept_id, S.hierarchy_dept_name, S.hierarchy_project_id,
                                S.hierarchy_project_name, S.hierarchy_team_id, S.hierarchy_team_name,
                                S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date, S.x_run_id, S.x_ingested_at)
                """

                job = client.query(merge_query)
                job.result()
                total_affected += job.num_dml_affected_rows or len(batch)

            self.logger.info(f"MERGE completed: {total_affected} rows affected")
            return {"inserted": total_affected, "failed": 0}

        except Exception as e:
            self.logger.error(f"BigQuery MERGE failed: {type(e).__name__}: {e}")
            raise

    def _parse_date(self, date_str):
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
    return CommitmentUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = CommitmentUsageProcessor()
    return await processor.execute(step_config, context)
