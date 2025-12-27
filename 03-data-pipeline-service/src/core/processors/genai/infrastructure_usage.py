"""
GenAI Infrastructure Usage Processor

Extracts GPU/TPU infrastructure usage from cloud providers.
Reads from: Cloud monitoring APIs (GCP, AWS, Azure)
Writes to: {org_slug}_{env}.genai_infrastructure_usage_raw

Usage in pipeline:
    ps_type: genai.infrastructure_usage

Idempotency:
    Uses MERGE (upsert) pattern to prevent duplicate data on re-runs.
    Deduplication key: (org_slug, provider, resource_id, usage_date)
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
        """Get cloud credentials."""
        cloud_provider = provider.split("_")[0]  # gcp, aws, azure
        query = f"""
            SELECT credential_id, encrypted_credential
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
        encrypted = results[0].get("encrypted_credential")
        decrypted = await decrypt_credentials(encrypted)
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
            # If table doesn't exist or query fails, assume not processed
            self.logger.warning(
                f"Idempotency check failed (assuming not processed): {type(e).__name__}"
            )
            return False

    async def _insert_usage(self, bq_client, table_id, records):
        """
        CRITICAL FIX #3: Insert records using MERGE for idempotency.

        Uses MERGE (upsert) instead of streaming inserts to prevent duplicate
        data on re-runs. Deduplication key: (org_slug, provider, resource_id, usage_date)

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
                        "resource_id": record.get("resource_id"),
                        "instance_type": record.get("instance_type"),
                        "gpu_type": record.get("gpu_type"),
                        "gpu_count": record.get("gpu_count") or 0,
                        "usage_date": record.get("usage_date"),
                        "region": record.get("region") or "global",
                        "gpu_hours": record.get("gpu_hours") or 0.0,
                        "spot_hours": record.get("spot_hours") or 0.0,
                        "on_demand_hours": record.get("on_demand_hours") or 0.0,
                        "preemptible_hours": record.get("preemptible_hours") or 0.0,
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
                temp_table = f"_temp_infra_usage_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
                create_temp = f"""
                    CREATE TEMP TABLE `{temp_table}` (
                        org_slug STRING, provider STRING, resource_id STRING, instance_type STRING,
                        gpu_type STRING, gpu_count INT64, usage_date DATE, region STRING,
                        gpu_hours FLOAT64, spot_hours FLOAT64, on_demand_hours FLOAT64,
                        preemptible_hours FLOAT64, credential_id STRING,
                        hierarchy_dept_id STRING, hierarchy_dept_name STRING,
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
                        AND T.resource_id = S.resource_id
                        AND T.usage_date = S.usage_date
                    WHEN MATCHED THEN
                        UPDATE SET
                            gpu_hours = S.gpu_hours,
                            spot_hours = S.spot_hours,
                            on_demand_hours = S.on_demand_hours,
                            preemptible_hours = S.preemptible_hours,
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
                        INSERT (org_slug, provider, resource_id, instance_type, gpu_type, gpu_count,
                                usage_date, region, gpu_hours, spot_hours, on_demand_hours,
                                preemptible_hours, credential_id, hierarchy_dept_id, hierarchy_dept_name,
                                hierarchy_project_id, hierarchy_project_name, hierarchy_team_id,
                                hierarchy_team_name, x_pipeline_id, x_credential_id, x_pipeline_run_date,
                                x_run_id, x_ingested_at)
                        VALUES (S.org_slug, S.provider, S.resource_id, S.instance_type, S.gpu_type, S.gpu_count,
                                S.usage_date, S.region, S.gpu_hours, S.spot_hours, S.on_demand_hours,
                                S.preemptible_hours, S.credential_id, S.hierarchy_dept_id, S.hierarchy_dept_name,
                                S.hierarchy_project_id, S.hierarchy_project_name, S.hierarchy_team_id,
                                S.hierarchy_team_name, S.x_pipeline_id, S.x_credential_id, S.x_pipeline_run_date,
                                S.x_run_id, S.x_ingested_at)
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
