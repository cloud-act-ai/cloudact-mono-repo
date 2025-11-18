"""
Tenant Onboarding Processor
Validates tenant BigQuery infrastructure during onboarding
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class TenantOnboardingProcessor:
    """
    Processor for tenant onboarding validation
    Creates test table with schema and validates BigQuery access
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        # Navigate from src/core/processors/setup/tenants/onboarding.py to ps_templates/setup/tenants/onboarding
        # Path: src/core/processors/setup/tenants/ -> go up 6 levels to project root
        self.template_dir = Path(__file__).parent.parent.parent.parent.parent.parent / "ps_templates" / "setup" / "tenants" / "onboarding"
        self.schema_config = self._load_schema()

    def _load_schema(self) -> Dict[str, Any]:
        """Load onboarding schema from template"""
        schema_file = self.template_dir / "schema.json"
        if schema_file.exists():
            with open(schema_file, 'r') as f:
                return json.load(f)
        return {}

    def _get_bq_schema(self) -> List[bigquery.SchemaField]:
        """Convert schema config to BigQuery SchemaField list"""
        schema = []
        for field in self.schema_config.get("fields", []):
            schema.append(bigquery.SchemaField(
                name=field["name"],
                field_type=field["type"],
                mode=field.get("mode", "NULLABLE"),
                description=field.get("description", "")
            ))
        return schema

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute onboarding validation

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context (tenant_id, etc.)

        Returns:
            Execution result with validation status
        """
        tenant_id = context.get("tenant_id")

        # Initialize BigQuery client
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        self.logger.info(
            "Starting tenant onboarding validation",
            extra={
                "tenant_id": tenant_id,
                "pipeline_id": context.get("pipeline_id")
            }
        )

        # Get table name from schema config
        table_name = self.schema_config.get("table_name", "x_meta_onboarding_dryrun_test")
        dataset_id = tenant_id  # Use tenant_id as dataset

        # Get schema
        schema = self._get_bq_schema()

        # Create table with schema
        await self._create_table(
            bq_client=bq_client,
            dataset_id=dataset_id,
            table_id=table_name,
            schema=schema
        )

        # Insert test data directly
        full_table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{table_name}"
        self.logger.info(
            "Inserting onboarding test data",
            extra={
                "table_id": full_table_id,
                "tenant_id": tenant_id,
                "pipeline_id": context.get("pipeline_id")
            }
        )

        insert_query = f"""
        INSERT INTO `{full_table_id}`
        (test_timestamp, tenant_id, message)
        VALUES
        (CURRENT_TIMESTAMP(), '{tenant_id}', 'Onboarding dryrun successful')
        """

        # Execute insert
        query_job = bq_client.client.query(insert_query)
        query_job.result()  # Wait for completion

        self.logger.info(
            "Tenant onboarding validation completed successfully",
            extra={
                "tenant_id": tenant_id,
                "pipeline_id": context.get("pipeline_id"),
                "test_table": full_table_id
            }
        )

        return {
            "status": "SUCCESS",
            "rows_processed": 1,
            "test_table": full_table_id,
            "validation": "passed",
            "message": "Tenant BigQuery infrastructure validated successfully"
        }

    async def _create_table(
        self,
        bq_client: BigQueryClient,
        dataset_id: str,
        table_id: str,
        schema: List[bigquery.SchemaField]
    ):
        """Create table with schema if it doesn't exist"""
        full_table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{table_id}"

        try:
            # Check if table exists
            table = bq_client.client.get_table(full_table_id)
            self.logger.info(
                "Onboarding table already exists",
                extra={"table_id": full_table_id}
            )
        except NotFound:
            # Create table with schema
            self.logger.info(
                "Creating onboarding table with schema",
                extra={
                    "table_id": full_table_id,
                    "schema_fields": len(schema)
                }
            )
            table = bigquery.Table(full_table_id, schema=schema)
            table = bq_client.client.create_table(table)
            self.logger.info(
                "Onboarding table created successfully",
                extra={"table_id": full_table_id}
            )


# Factory function to get engine instance
def get_engine():
    """Get TenantOnboardingProcessor instance"""
    return TenantOnboardingProcessor()
