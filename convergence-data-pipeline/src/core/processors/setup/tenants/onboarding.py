"""
Tenant Onboarding Processor
Creates tenant dataset and all required metadata tables
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from google.cloud import bigquery
from google.cloud.exceptions import NotFound, Conflict

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class TenantOnboardingProcessor:
    """
    Processor for tenant onboarding
    Creates dataset and all metadata tables from configuration
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        # Path to schema files
        self.template_dir = Path(__file__).parent.parent.parent.parent.parent.parent / "ps_templates" / "setup" / "tenants" / "onboarding"
        self.schema_dir = self.template_dir / "schemas"

    def _load_schema_file(self, schema_filename: str) -> List[bigquery.SchemaField]:
        """Load schema from JSON file and convert to BigQuery SchemaField list"""
        schema_file = self.schema_dir / schema_filename

        if not schema_file.exists():
            self.logger.warning(f"Schema file not found: {schema_file}")
            return []

        try:
            with open(schema_file, 'r') as f:
                schema_json = json.load(f)

            # Convert JSON schema to SchemaField objects
            schema = []
            for field in schema_json:
                schema.append(bigquery.SchemaField.from_api_repr(field))

            return schema
        except Exception as e:
            self.logger.error(f"Error loading schema from {schema_file}: {e}")
            return []

    async def _create_dataset(self, bq_client: BigQueryClient, dataset_id: str, location: str) -> bool:
        """Create dataset if it doesn't exist"""
        full_dataset_id = f"{self.settings.gcp_project_id}.{dataset_id}"

        try:
            # Try to get the dataset first
            dataset = await bq_client.get_dataset(full_dataset_id)
            self.logger.info(f"Dataset already exists: {full_dataset_id}")
            return True
        except NotFound:
            # Dataset doesn't exist, create it
            dataset = bigquery.Dataset(full_dataset_id)
            dataset.location = location
            dataset.description = f"Dataset for tenant {dataset_id}"

            try:
                await bq_client.create_dataset_raw(dataset)
                self.logger.info(f"Created dataset: {full_dataset_id}")
                return True
            except Exception as e:
                self.logger.error(f"Failed to create dataset {full_dataset_id}: {e}")
                return False

    async def _create_table(
        self,
        bq_client: BigQueryClient,
        dataset_id: str,
        table_name: str,
        schema: List[bigquery.SchemaField],
        description: str = None
    ) -> bool:
        """Create a single table with schema"""
        full_table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{table_name}"

        try:
            # Check if table already exists
            table = await bq_client.get_table(full_table_id)
            self.logger.info(f"Table already exists: {full_table_id}")
            return True
        except NotFound:
            # Table doesn't exist, create it
            table = bigquery.Table(full_table_id, schema=schema)
            if description:
                table.description = description

            # Add partitioning for tables that need it
            # NOTE: tenant_pipeline_runs is in central dataset, not created here
            if table_name == "tenant_step_logs":
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="start_time"
                )
            elif table_name == "tenant_dq_results":
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="ingestion_date"
                )

            try:
                await bq_client.create_table_raw(table)
                self.logger.info(f"Created table: {full_table_id}")
                return True
            except Exception as e:
                self.logger.error(f"Failed to create table {full_table_id}: {e}")
                return False

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute tenant onboarding - create dataset and all metadata tables

        Args:
            step_config: Step configuration from pipeline YAML (contains metadata_tables list)
            context: Execution context (tenant_id, etc.)

        Returns:
            Execution result with tables created
        """
        tenant_id = context.get("tenant_id")
        config = step_config.get("config", {})

        # Get configuration values
        dataset_id = config.get("dataset_id", tenant_id)
        location = config.get("location", "US")
        metadata_tables = config.get("metadata_tables", [])

        # Initialize BigQuery client
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        self.logger.info(
            f"Starting tenant onboarding for {tenant_id}",
            extra={
                "tenant_id": tenant_id,
                "dataset_id": dataset_id,
                "tables_to_create": len(metadata_tables)
            }
        )

        # Step 1: Create dataset
        dataset_created = await self._create_dataset(bq_client, dataset_id, location)
        if not dataset_created:
            return {
                "status": "FAILED",
                "error": f"Failed to create dataset {dataset_id}",
                "tenant_id": tenant_id
            }

        # Step 2: Create all metadata tables from configuration
        tables_created = []
        tables_failed = []

        for table_config in metadata_tables:
            table_name = table_config.get("table_name")
            schema_file = table_config.get("schema_file")
            description = table_config.get("description")

            self.logger.info(f"Creating table {table_name} from schema {schema_file}")

            # Load schema from file
            schema = self._load_schema_file(schema_file)
            if not schema:
                self.logger.error(f"Failed to load schema for {table_name}")
                tables_failed.append(table_name)
                continue

            # Create the table
            success = await self._create_table(
                bq_client=bq_client,
                dataset_id=dataset_id,
                table_name=table_name,
                schema=schema,
                description=description
            )

            if success:
                tables_created.append(table_name)
            else:
                tables_failed.append(table_name)

        # Step 3: Initial quota record (SKIPPED - handled by API endpoint)
        # NOTE: When called from /api/v1/tenants/onboard, quota record is already created
        # This step is only for standalone processor execution (testing)
        create_quota = config.get("create_quota_record", False)
        if create_quota:
            self.logger.info(f"Creating initial quota record for tenant {tenant_id}")
            try:
                import uuid
                from datetime import datetime

                quota_table = f"{self.settings.gcp_project_id}.tenants.tenant_usage_quotas"
                usage_id = str(uuid.uuid4())

                # Default quotas for new tenants
                default_daily_limit = config.get("default_daily_limit", 50)
                default_monthly_limit = config.get("default_monthly_limit", 1000)
                default_concurrent_limit = config.get("default_concurrent_limit", 5)

                quota_insert_query = f"""
                INSERT INTO `{quota_table}` (
                    usage_id,
                    tenant_id,
                    usage_date,
                    pipelines_run_today,
                    pipelines_succeeded_today,
                    pipelines_failed_today,
                    pipelines_run_month,
                    concurrent_pipelines_running,
                    daily_limit,
                    monthly_limit,
                    concurrent_limit,
                    last_updated,
                    created_at
                )
                VALUES (
                    '{usage_id}',
                    '{tenant_id}',
                    CURRENT_DATE(),
                    0,
                    0,
                    0,
                    0,
                    0,
                    {default_daily_limit},
                    {default_monthly_limit},
                    {default_concurrent_limit},
                    CURRENT_TIMESTAMP(),
                    CURRENT_TIMESTAMP()
                )
                """

                # Execute query and consume results (query returns an iterator)
                list(bq_client.query(quota_insert_query))
                self.logger.info(
                    f"Created initial quota record for tenant {tenant_id}",
                    extra={
                        "tenant_id": tenant_id,
                        "daily_limit": default_daily_limit,
                        "monthly_limit": default_monthly_limit,
                        "concurrent_limit": default_concurrent_limit
                    }
                )
            except Exception as e:
                self.logger.error(f"Failed to create initial quota record: {e}", exc_info=True)
                # Don't fail onboarding if quota record creation fails
                # Admin can manually add it later
        else:
            self.logger.info(f"Skipping quota creation (handled by API endpoint)")

        # Step 4: Create validation test table if configured
        if config.get("create_validation_table", False):
            validation_table = config.get("validation_table_name", "onboarding_validation_test")

            # Simple test schema
            test_schema = [
                bigquery.SchemaField("id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("test_message", "STRING"),
                bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED"),
            ]

            success = await self._create_table(
                bq_client=bq_client,
                dataset_id=dataset_id,
                table_name=validation_table,
                schema=test_schema,
                description="Onboarding validation test table"
            )

            if success:
                tables_created.append(validation_table)

                # Insert test record
                try:
                    full_table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{validation_table}"
                    test_row = {
                        "id": f"onboarding_test_{tenant_id}",
                        "test_message": f"Onboarding successful for {tenant_id}",
                        "created_at": "CURRENT_TIMESTAMP()"
                    }

                    query = f"""
                    INSERT INTO `{full_table_id}` (id, test_message, created_at)
                    VALUES ('{test_row["id"]}', '{test_row["test_message"]}', {test_row["created_at"]})
                    """

                    # Execute query and consume results (query returns an iterator)
                    list(bq_client.query(query))
                    self.logger.info(f"Inserted test record into {validation_table}")
                except Exception as e:
                    self.logger.warning(f"Failed to insert test record: {e}")

        # Step 4: Create tenant-specific comprehensive view
        self._create_tenant_comprehensive_view(tenant_id, dataset_id)

        # Prepare result
        result = {
            "status": "SUCCESS" if not tables_failed else "PARTIAL",
            "tenant_id": tenant_id,
            "dataset_id": dataset_id,
            "dataset_created": dataset_created,
            "tables_created": tables_created,
            "tables_failed": tables_failed,
            "message": f"Created {len(tables_created)} tables for tenant {tenant_id}"
        }

        if tables_failed:
            result["error"] = f"Failed to create tables: {', '.join(tables_failed)}"

        # Log onboarding completion without using 'message' in extra dict
        # 'message' is a reserved field in Python's LogRecord
        log_context = {
            "tenant_id": tenant_id,
            "dataset_id": dataset_id,
            "dataset_created": dataset_created,
            "tables_created_count": len(tables_created),
            "tables_failed_count": len(tables_failed),
            "status": result["status"]
        }
        self.logger.info(
            f"Onboarding completed for {tenant_id}: Created {len(tables_created)} tables",
            extra=log_context
        )

        return result

    def _create_tenant_comprehensive_view(self, tenant_id: str, dataset_id: str):
        """Create tenant-specific comprehensive view in tenant's dataset."""
        from pathlib import Path

        # Navigate to view template
        view_file = Path(__file__).parent.parent.parent.parent.parent.parent / "ps_templates" / "setup" / "initial" / "views" / "tenant_comprehensive_view.sql"

        if not view_file.exists():
            self.logger.warning(f"View SQL file not found: {view_file}")
            return

        try:
            with open(view_file, 'r') as f:
                view_sql = f.read()

            # Replace placeholders
            view_sql = view_sql.replace('{project_id}', self.settings.gcp_project_id)
            view_sql = view_sql.replace('{tenant_id}', tenant_id)

            # Execute view creation
            from google.cloud import bigquery
            client = bigquery.Client(project=self.settings.gcp_project_id)
            query_job = client.query(view_sql)
            query_job.result()  # Wait for completion

            self.logger.info(
                f"Created comprehensive view: {self.settings.gcp_project_id}.{dataset_id}.tenant_comprehensive_view"
            )

        except Exception as e:
            self.logger.error(f"Failed to create tenant comprehensive view: {e}", exc_info=True)


# Function for pipeline executor to call
async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = TenantOnboardingProcessor()
    return await processor.execute(step_config, context)