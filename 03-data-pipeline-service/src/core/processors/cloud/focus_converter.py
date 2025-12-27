"""
Cloud Costs to FOCUS 1.3 Converter

Converts cloud provider billing data (GCP, AWS, Azure, OCI) to FOCUS 1.3 standard format.
Uses stored procedure sp_convert_cloud_costs_to_focus_1_3 for the conversion.

Usage in pipeline:
    ps_type: cloud.focus_converter
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class CloudFOCUSConverterProcessor:
    """
    Converts cloud provider billing costs to FOCUS 1.3 format.

    Supports: GCP, AWS, Azure, OCI (or 'all' for all providers)
    """

    VALID_PROVIDERS = ["gcp", "aws", "azure", "oci", "all"]

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert cloud costs to FOCUS 1.3 format.

        Args:
            step_config: Step configuration containing:
                - config.date: Date to convert
                - config.provider: Provider to convert (gcp, aws, azure, oci, all)
            context: Execution context with org_slug

        Returns:
            Dict with status and row counts
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        # Parse date
        process_date = self._parse_date(config.get("date") or context.get("date"))
        if not process_date:
            return {"status": "FAILED", "error": "date is required"}

        # Get provider (default: all)
        provider = config.get("provider", "all").lower()
        if provider not in self.VALID_PROVIDERS:
            return {
                "status": "FAILED",
                "error": f"Invalid provider '{provider}'. Must be one of: {self.VALID_PROVIDERS}"
            }

        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(
            f"Converting {provider} cloud costs to FOCUS 1.3 for {org_slug}",
            extra={"date": str(process_date), "provider": provider}
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Get lineage context from pipeline execution
            credential_id = context.get("credential_id", "unknown")
            run_id = context.get("run_id", "unknown")

            # Call stored procedure with lineage parameters
            call_query = f"""
                CALL `{project_id}.organizations`.sp_convert_cloud_costs_to_focus_1_3(
                    @p_project_id,
                    @p_dataset_id,
                    @p_cost_date,
                    @p_provider,
                    @p_pipeline_id,
                    @p_credential_id,
                    @p_run_id
                )
            """

            job = bq_client.client.query(
                call_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("p_project_id", "STRING", project_id),
                        bigquery.ScalarQueryParameter("p_dataset_id", "STRING", dataset_id),
                        bigquery.ScalarQueryParameter("p_cost_date", "DATE", process_date),
                        bigquery.ScalarQueryParameter("p_provider", "STRING", provider),
                        bigquery.ScalarQueryParameter("p_pipeline_id", "STRING", "focus_convert_cloud"),
                        bigquery.ScalarQueryParameter("p_credential_id", "STRING", credential_id),
                        bigquery.ScalarQueryParameter("p_run_id", "STRING", run_id),
                    ]
                )
            )

            # Get result
            result = list(job.result())
            rows_inserted = result[0]["rows_inserted"] if result else 0

            self.logger.info(
                f"Converted {rows_inserted} {provider} records to FOCUS 1.3",
                extra={"rows_inserted": rows_inserted}
            )

            return {
                "status": "SUCCESS",
                "rows_inserted": rows_inserted,
                "date": str(process_date),
                "provider": provider,
                "target_table": "cost_data_standard_1_3"
            }

        except Exception as e:
            self.logger.error(f"Cloud FOCUS conversion failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    def _parse_date(self, date_str) -> Optional[date]:
        """Parse date from string or date object."""
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
    return CloudFOCUSConverterProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = CloudFOCUSConverterProcessor()
    return await processor.execute(step_config, context)
