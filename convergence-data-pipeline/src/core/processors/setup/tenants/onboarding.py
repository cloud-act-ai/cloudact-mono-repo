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
                await bq_client.create_dataset(dataset)
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
            if table_name in ["x_meta_pipeline_runs", "x_meta_step_logs"]:
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="start_time"
                )
            elif table_name == "x_meta_dq_results":
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="ingestion_date"
                )

            try:
                await bq_client.create_table(table)
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

        # Step 3: Create validation test table if configured
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

                    await bq_client.query(query)
                    self.logger.info(f"Inserted test record into {validation_table}")
                except Exception as e:
                    self.logger.warning(f"Failed to insert test record: {e}")

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

        self.logger.info(
            f"Onboarding completed for {tenant_id}",
            extra=result
        )

        return result


# Function for pipeline executor to call
async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor"""
    processor = TenantOnboardingProcessor()
    return await processor.execute(step_config, context)