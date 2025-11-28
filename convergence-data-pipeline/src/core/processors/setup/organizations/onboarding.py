"""
Organization Onboarding Processor
Creates organization dataset and all required metadata tables
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from google.cloud import bigquery
from google.cloud.exceptions import NotFound, Conflict

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class OrgOnboardingProcessor:
    """
    Processor for organization onboarding
    Creates dataset and all metadata tables from configuration
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        # Path to configs/setup/organizations/onboarding/
        self.template_dir = Path(__file__).parent.parent.parent.parent.parent.parent / "configs" / "setup" / "organizations" / "onboarding"
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
            dataset.description = f"Dataset for organization {dataset_id}"

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
        description: str = None,
        partition_field: str = None,
        clustering_fields: List[str] = None
    ) -> bool:
        """Create a single table with schema, optional partitioning and clustering"""
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

            # Add partitioning if specified in table config
            if partition_field:
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field=partition_field
                )
            # Fallback for known table names (backwards compatibility)
            elif table_name == "org_meta_step_logs":
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="start_time"
                )
            elif table_name == "org_meta_dq_results":
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="ingestion_date"
                )

            # Add clustering if specified
            if clustering_fields:
                table.clustering_fields = clustering_fields

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
        Execute organization onboarding - create dataset and all metadata tables

        Args:
            step_config: Step configuration from pipeline YAML (contains metadata_tables list)
            context: Execution context (org_slug, etc.)

        Returns:
            Execution result with tables created
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        # Get configuration values
        # IMPORTANT: Use get_org_dataset_name to append environment suffix
        # Format: {org_slug}_{environment} (e.g., acme_corp_local, acme_corp_prod)
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        location = config.get("location", "US")
        metadata_tables = config.get("metadata_tables", [])

        # Initialize BigQuery client
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        self.logger.info(
            f"Starting organization onboarding for {org_slug}",
            extra={
                "org_slug": org_slug,
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
                "org_slug": org_slug
            }

        # Step 2: Create all metadata tables from configuration
        tables_created = []
        tables_failed = []

        for table_config in metadata_tables:
            table_name = table_config.get("table_name")
            schema_file = table_config.get("schema_file")
            description = table_config.get("description")
            partition_field = table_config.get("partition_field")
            clustering_fields = table_config.get("clustering_fields")

            self.logger.info(f"Creating table {table_name} from schema {schema_file}")

            # Load schema from file
            schema = self._load_schema_file(schema_file)
            if not schema:
                self.logger.error(f"Failed to load schema for {table_name}")
                tables_failed.append(table_name)
                continue

            # Create the table with optional partitioning and clustering
            success = await self._create_table(
                bq_client=bq_client,
                dataset_id=dataset_id,
                table_name=table_name,
                schema=schema,
                description=description,
                partition_field=partition_field,
                clustering_fields=clustering_fields
            )

            if success:
                tables_created.append(table_name)
            else:
                tables_failed.append(table_name)

        # Step 3: Initial quota record (SKIPPED - handled by API endpoint)
        # NOTE: When called from /api/v1/organizations/onboard, quota record is already created
        # This step is only for standalone processor execution (testing)
        create_quota = config.get("create_quota_record", False)
        if create_quota:
            self.logger.info(f"Creating initial quota record for organization {org_slug}")
            try:
                import uuid
                from datetime import datetime

                quota_table = f"{self.settings.gcp_project_id}.organizations.org_usage_quotas"
                usage_id = str(uuid.uuid4())

                # Default quotas for new organizations
                default_daily_limit = config.get("default_daily_limit", 50)
                default_monthly_limit = config.get("default_monthly_limit", 1000)
                default_concurrent_limit = config.get("default_concurrent_limit", 5)

                quota_insert_query = f"""
                INSERT INTO `{quota_table}` (
                    usage_id,
                    org_slug,
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
                    @usage_id,
                    @org_slug,
                    CURRENT_DATE(),
                    0,
                    0,
                    0,
                    0,
                    0,
                    @default_daily_limit,
                    @default_monthly_limit,
                    @default_concurrent_limit,
                    CURRENT_TIMESTAMP(),
                    CURRENT_TIMESTAMP()
                )
                """

                # Execute query with parameterized values (prevents SQL injection)
                query_params = [
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("default_daily_limit", "INT64", default_daily_limit),
                    bigquery.ScalarQueryParameter("default_monthly_limit", "INT64", default_monthly_limit),
                    bigquery.ScalarQueryParameter("default_concurrent_limit", "INT64", default_concurrent_limit),
                ]
                list(bq_client.query(quota_insert_query, parameters=query_params))
                self.logger.info(
                    f"Created initial quota record for organization {org_slug}",
                    extra={
                        "org_slug": org_slug,
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
                        "id": f"onboarding_test_{org_slug}",
                        "test_message": f"Onboarding successful for {org_slug}",
                        "created_at": "CURRENT_TIMESTAMP()"
                    }

                    query = f"""
                    INSERT INTO `{full_table_id}` (id, test_message, created_at)
                    VALUES (@test_id, @test_message, CURRENT_TIMESTAMP())
                    """

                    # Execute query with parameterized values (prevents SQL injection)
                    query_params = [
                        bigquery.ScalarQueryParameter("test_id", "STRING", test_row["id"]),
                        bigquery.ScalarQueryParameter("test_message", "STRING", test_row["test_message"]),
                    ]
                    list(bq_client.query(query, parameters=query_params))
                    self.logger.info(f"Inserted test record into {validation_table}")
                except Exception as e:
                    self.logger.warning(f"Failed to insert test record: {e}")

        # Step 5: Create organization-specific views (pipeline_logs, step_logs)
        # These views filter central metadata tables for this org's data only
        views_created, views_failed = self._create_org_views(org_slug, dataset_id)

        # Prepare result
        all_tables_failed = tables_failed + views_failed
        result = {
            "status": "SUCCESS" if not all_tables_failed else "PARTIAL",
            "org_slug": org_slug,
            "dataset_id": dataset_id,
            "dataset_created": dataset_created,
            "tables_created": tables_created,
            "views_created": views_created,
            "tables_failed": tables_failed,
            "views_failed": views_failed,
            "message": f"Created {len(tables_created)} tables and {len(views_created)} views for organization {org_slug}"
        }

        if all_tables_failed:
            result["error"] = f"Failed to create: {', '.join(all_tables_failed)}"

        # Log onboarding completion without using 'message' in extra dict
        # 'message' is a reserved field in Python's LogRecord
        log_context = {
            "org_slug": org_slug,
            "dataset_id": dataset_id,
            "dataset_created": dataset_created,
            "tables_created_count": len(tables_created),
            "views_created_count": len(views_created),
            "tables_failed_count": len(tables_failed),
            "views_failed_count": len(views_failed),
            "status": result["status"]
        }
        self.logger.info(
            f"Onboarding completed for {org_slug}: Created {len(tables_created)} tables, {len(views_created)} views",
            extra=log_context
        )

        return result

    def _create_org_views(self, org_slug: str, dataset_id: str):
        """Create organization-specific views in organization's dataset.

        Creates views that filter central metadata tables for this org's data:
        - pipeline_logs: View of org_meta_pipeline_runs filtered by org_slug
        - step_logs: View of org_meta_step_logs filtered by org_slug
        """
        from pathlib import Path

        views_dir = Path(__file__).parent.parent.parent.parent.parent.parent / "configs" / "setup" / "bootstrap" / "views"
        client = bigquery.Client(project=self.settings.gcp_project_id)

        # List of view files to create
        # Order matters: consolidated view depends on pipeline_logs and step_logs existing in central dataset
        view_files = [
            "pipeline_logs_view.sql",      # Filtered view of org_meta_pipeline_runs
            "step_logs_view.sql",          # Filtered view of org_meta_step_logs
            "org_consolidated_view.sql",   # Consolidated view joining pipelines + steps
        ]

        views_created = []
        views_failed = []

        for view_filename in view_files:
            view_file = views_dir / view_filename
            view_name = view_filename.replace("_view.sql", "")

            if not view_file.exists():
                self.logger.warning(f"View SQL file not found: {view_file}")
                views_failed.append(view_name)
                continue

            try:
                with open(view_file, 'r') as f:
                    view_sql = f.read()

                # Replace placeholders
                view_sql = view_sql.replace('{project_id}', self.settings.gcp_project_id)
                view_sql = view_sql.replace('{dataset_id}', dataset_id)
                view_sql = view_sql.replace('{org_slug}', org_slug)

                # Execute view creation
                query_job = client.query(view_sql)
                query_job.result()  # Wait for completion

                views_created.append(view_name)
                self.logger.info(
                    f"Created view: {self.settings.gcp_project_id}.{dataset_id}.{view_name}"
                )

            except Exception as e:
                views_failed.append(view_name)
                self.logger.error(f"Failed to create view {view_name}: {e}", exc_info=True)

        return views_created, views_failed


# Function for pipeline executor to call
async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = OrgOnboardingProcessor()
    return await processor.execute(step_config, context)
