"""
GenAI Infrastructure Usage Processor

Extracts GPU/TPU infrastructure usage from cloud providers.
Reads from: Cloud monitoring APIs (GCP, AWS, Azure)
Writes to: {org_slug}_{env}.genai_infrastructure_usage_raw

Usage in pipeline:
    ps_type: genai.infrastructure_usage

Idempotency:
    Uses MERGE (upsert) pattern to prevent duplicate data on re-runs.
    Deduplication key: (org_slug, provider, instance_id, usage_date)
    Use force_refresh=true to re-extract existing data.

Fixes Applied:
    CRITICAL #3: Replace streaming inserts with MERGE for idempotency
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings
from src.core.security.kms_decryption import decrypt_credentials
from src.core.utils.validators import is_valid_org_slug


class InfrastructureUsageProcessor:
    """
    Extracts GPU/TPU infrastructure usage.

    Reads from: Cloud monitoring APIs
    Writes to: genai_infrastructure_usage_raw
    """

    SUPPORTED_PROVIDERS = ["gcp_gpu", "aws_gpu", "azure_gpu", "gcp_tpu"]

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract infrastructure usage."""
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
        if not provider or provider not in self.SUPPORTED_PROVIDERS:
            return {"status": "FAILED", "error": f"Invalid infrastructure provider: {provider}"}

        start_date = self._parse_date(config.get("start_date") or context.get("start_date"))
        end_date = self._parse_date(config.get("end_date") or start_date)

        if not start_date:
            return {"status": "FAILED", "error": "start_date is required"}

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(f"Extracting infrastructure usage for {org_slug}/{provider}")

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Get cloud credentials
            credentials = await self._get_cloud_credentials(bq_client, org_slug, provider)
            if not credentials:
                return {
                    "status": "SUCCESS",
                    "provider": provider,
                    "message": f"No cloud credentials for {provider}. Skipping."
                }

            # Check if we should skip (idempotency - optional based on config)
            force_refresh = config.get("force_refresh", False)
            if not force_refresh:
                already_processed = await self._check_already_processed(
                    bq_client, project_id, dataset_id, org_slug, start_date, provider
                )
                if already_processed:
                    self.logger.info(
                        f"Skipping {provider} infrastructure usage extraction - already processed for {start_date}. "
                        "Use force_refresh=true to re-extract."
                    )
                    return {
                        "status": "SUCCESS",
                        "provider": provider,
                        "rows_inserted": 0,
                        "skipped": True,
                        "message": f"Already processed for {start_date}"
                    }

            # Extract usage based on provider
            usage_records = await self._extract_infrastructure_usage(
                provider, credentials, start_date, end_date
            )

            if not usage_records:
                return {
                    "status": "SUCCESS",
                    "provider": provider,
                    "rows_inserted": 0,
                    "message": f"No infrastructure usage for {provider}"
                }

            # Add lineage metadata (standardized x_ prefix columns)
            now = datetime.utcnow().isoformat() + "Z"
            pipeline_id = f"genai_infrastructure_usage_{provider}"
            credential_id = credentials.get("credential_id", "default") if credentials else "default"
            for record in usage_records:
                record["org_slug"] = org_slug
                record["x_pipeline_id"] = pipeline_id
                record["x_credential_id"] = credential_id
                record["x_pipeline_run_date"] = start_date.isoformat()
                record["x_run_id"] = run_id
                record["x_ingested_at"] = now

                # Add hierarchy from credential (GenAI hierarchy assignment)
                for level in range(1, 11):
                    id_key = f"hierarchy_level_{level}_id"
                    name_key = f"hierarchy_level_{level}_name"
                    # Only set if not already present in record and credential has it
                    if not record.get(id_key):
                        record[id_key] = credentials.get(id_key)
                        record[name_key] = credentials.get(name_key)

            # Write to BigQuery
            table_id = f"{project_id}.{dataset_id}.genai_infrastructure_usage_raw"
            insert_result = await self._insert_usage(bq_client, table_id, usage_records)

            rows_inserted = insert_result["inserted"]
            rows_failed = insert_result["failed"]

            self.logger.info(f"Inserted {rows_inserted} infrastructure usage records, {rows_failed} failed")
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
            self.logger.error(f"Failed to extract infrastructure usage: {e}", exc_info=True)
            return {"status": "FAILED", "provider": provider, "error": str(e)}

    async def _extract_infrastructure_usage(
        self, provider: str, credentials: Dict, start_date: date, end_date: date
    ) -> List[Dict[str, Any]]:
        """Extract usage from cloud provider."""
        # STUB: Infrastructure usage extraction is not yet implemented
        # Required cloud SDKs per provider:
        # - GCP: google-cloud-monitoring for GPU/TPU metrics
        # - AWS: boto3 cloudwatch for EC2 GPU instances
        # - Azure: azure-mgmt-monitor for VM GPU metrics
        raise NotImplementedError(
            f"Infrastructure usage extraction for '{provider}' is not yet implemented. "
            f"Required SDKs: GCP (google-cloud-monitoring), AWS (boto3 cloudwatch), Azure (azure-mgmt-monitor). "
            f"Requested period: {start_date} to {end_date}."
        )

    async def _get_cloud_credentials(self, bq_client, org_slug, provider):
        """Get cloud credentials, including default hierarchy."""
        cloud_provider = provider.split("_")[0]  # gcp, aws, azure
        query = f"""
            SELECT
                credential_id, encrypted_credential,
                default_hierarchy_level_1_id, default_hierarchy_level_1_name,
                default_hierarchy_level_2_id, default_hierarchy_level_2_name,
                default_hierarchy_level_3_id, default_hierarchy_level_3_name,
                default_hierarchy_level_4_id, default_hierarchy_level_4_name,
                default_hierarchy_level_5_id, default_hierarchy_level_5_name,
                default_hierarchy_level_6_id, default_hierarchy_level_6_name,
                default_hierarchy_level_7_id, default_hierarchy_level_7_name,
                default_hierarchy_level_8_id, default_hierarchy_level_8_name,
                default_hierarchy_level_9_id, default_hierarchy_level_9_name,
                default_hierarchy_level_10_id, default_hierarchy_level_10_name
            FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
            LIMIT 1
        """
        results = list(bq_client.query(query, parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("provider", "STRING", cloud_provider)
        ]))
        if not results:
            return None

        row = results[0]
        encrypted = row.get("encrypted_credential")
        decrypted = await decrypt_credentials(encrypted)
        decrypted["credential_id"] = row.get("credential_id")

        # Add hierarchy fields from credentials (for GenAI hierarchy assignment)
        for level in range(1, 11):
            id_key = f"hierarchy_level_{level}_id"
            name_key = f"hierarchy_level_{level}_name"
            decrypted[id_key] = row.get(f"default_{id_key}")
            decrypted[name_key] = row.get(f"default_{name_key}")

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
        Idempotency check: Verify if infrastructure usage data for this date/provider already exists.

        Args:
            bq_client: BigQuery client
            project_id: GCP project ID
            dataset_id: BigQuery dataset ID
            org_slug: Organization identifier
            process_date: Date to check
            provider: Provider name (e.g., gcp_gpu, aws_gpu, gcp_tpu)

        Returns:
            True if data already exists for this date/provider combination
        """
        try:
            query = f"""
                SELECT COUNT(*) as cnt
                FROM `{project_id}.{dataset_id}.genai_infrastructure_usage_raw`
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
            # PROC-001 FIX: Fail-closed on idempotency check error
            # Return True (skip processing) instead of False (process anyway) to prevent duplicates
            # If table doesn't exist, BigQuery returns specific error we can handle
            error_msg = str(e).lower()
            if "not found" in error_msg or "does not exist" in error_msg:
                # Table doesn't exist - safe to process (first run)
                self.logger.info(
                    f"Target table not found - safe to process (first run): {type(e).__name__}"
                )
                return False
            else:
                # Other errors - fail closed to prevent duplicate processing
                self.logger.error(
                    f"Idempotency check failed - SKIPPING to prevent duplicates: {type(e).__name__}: {e}"
                )
                return True  # Skip processing to be safe

    async def _insert_usage(self, bq_client, table_id, records):
        """
        CRITICAL FIX #3: Insert records using MERGE for idempotency.

        Uses MERGE (upsert) instead of streaming inserts to prevent duplicate
        data on re-runs. Deduplication key: (org_slug, provider, instance_id, usage_date)

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

            # Process in batches - UNNEST has practical limits ~500 rows
            batch_size = 500
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]

                # Build UNNEST array for BigQuery MERGE (correct pattern, no temp tables)
                struct_values = []
                for record in batch:
                    def escape_str(v):
                        if v is None:
                            return "NULL"
                        return f"'{str(v).replace(chr(39), chr(39)+chr(39))}'"

                    def escape_int(v):
                        return str(v) if v is not None else "0"

                    def escape_float(v):
                        return str(v) if v is not None else "0.0"

                    struct_values.append(f"""STRUCT(
                        DATE('{record.get('usage_date')}') as usage_date,
                        {escape_str(record.get('org_slug'))} as org_slug,
                        {escape_str(record.get('provider'))} as provider,
                        {escape_str(record.get('resource_type') or 'gpu')} as resource_type,
                        {escape_str(record.get('instance_type'))} as instance_type,
                        {escape_str(record.get('instance_id') or record.get('resource_id'))} as instance_id,
                        {escape_str(record.get('gpu_type'))} as gpu_type,
                        {escape_str(record.get('region') or 'global')} as region,
                        {escape_int(record.get('instance_count') or record.get('gpu_count'))} as instance_count,
                        {escape_float(record.get('hours_used'))} as hours_used,
                        {escape_float(record.get('gpu_hours'))} as gpu_hours,
                        {escape_str(record.get('pricing_type') or 'on_demand')} as pricing_type,
                        {escape_float(record.get('avg_gpu_utilization_pct'))} as avg_gpu_utilization_pct,
                        {escape_float(record.get('avg_memory_utilization_pct'))} as avg_memory_utilization_pct,
                        {escape_str(record.get('x_pipeline_id'))} as x_pipeline_id,
                        {escape_str(record.get('x_credential_id'))} as x_credential_id,
                        DATE('{record.get('x_pipeline_run_date')}') as x_pipeline_run_date,
                        {escape_str(record.get('x_run_id'))} as x_run_id,
                        TIMESTAMP('{record.get('x_ingested_at')}') as x_ingested_at
                    )""")

                unnest_source = ",\n".join(struct_values)

                # MERGE using UNNEST - correct BigQuery pattern (no temp tables)
                # Deduplication key: (org_slug, provider, instance_id, usage_date)
                merge_query = f"""
                    MERGE `{table_id}` T
                    USING UNNEST([{unnest_source}]) S
                    ON T.org_slug = S.org_slug
                        AND T.provider = S.provider
                        AND T.instance_id = S.instance_id
                        AND T.usage_date = S.usage_date
                    WHEN MATCHED THEN
                        UPDATE SET
                            resource_type = S.resource_type,
                            instance_type = S.instance_type,
                            gpu_type = S.gpu_type,
                            region = S.region,
                            instance_count = S.instance_count,
                            hours_used = S.hours_used,
                            gpu_hours = S.gpu_hours,
                            pricing_type = S.pricing_type,
                            avg_gpu_utilization_pct = S.avg_gpu_utilization_pct,
                            avg_memory_utilization_pct = S.avg_memory_utilization_pct,
                            x_pipeline_id = S.x_pipeline_id,
                            x_credential_id = S.x_credential_id,
                            x_pipeline_run_date = S.x_pipeline_run_date,
                            x_run_id = S.x_run_id,
                            x_ingested_at = S.x_ingested_at
                    WHEN NOT MATCHED THEN
                        INSERT (usage_date, org_slug, provider, resource_type, instance_type,
                                instance_id, gpu_type, region, instance_count, hours_used,
                                gpu_hours, pricing_type, avg_gpu_utilization_pct, avg_memory_utilization_pct,
                                x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
                        VALUES (S.usage_date, S.org_slug, S.provider, S.resource_type, S.instance_type,
                                S.instance_id, S.gpu_type, S.region, S.instance_count, S.hours_used,
                                S.gpu_hours, S.pricing_type, S.avg_gpu_utilization_pct, S.avg_memory_utilization_pct,
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
    return InfrastructureUsageProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = InfrastructureUsageProcessor()
    return await processor.execute(step_config, context)
