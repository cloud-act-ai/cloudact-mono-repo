"""
One-Time Bootstrap Processor
Creates central tenants dataset and all tenant management tables.
This processor should be run ONCE during initial system setup.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from google.cloud import bigquery
from google.api_core import exceptions

from src.app.config import get_settings

logger = logging.getLogger(__name__)


class OnetimeBootstrapProcessor:
    """
    Processor for one-time system bootstrap.

    Creates:
    - Central 'tenants' dataset
    - All tenant management tables with proper schemas

    Features:
    - Idempotent execution (can be run multiple times safely)
    - Force recreation support for schema updates
    - Schema versioning via JSON files
    - Proper partitioning and clustering
    """

    def __init__(self):
        """Initialize bootstrap processor."""
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

        # Navigate to ps_templates/setup/initial/
        # From: src/core/processors/setup/initial/onetime_bootstrap_processor.py
        # To: ps_templates/setup/initial/
        # Path: src/core/processors/setup/initial/ -> go up 5 levels to src/, then up 1 more to project root
        self.template_dir = (
            Path(__file__).parent.parent.parent.parent.parent.parent
            / "ps_templates" / "setup" / "initial"
        )

        self.config = self._load_config()
        self.project_id = self.settings.gcp_project_id
        self.location = self.settings.bigquery_location

        # Initialize BigQuery client
        self.client = bigquery.Client(project=self.project_id)

    def _load_config(self) -> Dict[str, Any]:
        """Load bootstrap configuration from template."""
        config_file = self.template_dir / "config.yml"
        if config_file.exists():
            import yaml
            with open(config_file, 'r') as f:
                return yaml.safe_load(f)
        return {}

    def _load_table_schema(self, table_name: str) -> List[bigquery.SchemaField]:
        """
        Load BigQuery schema from JSON file.

        Args:
            table_name: Name of the table (e.g., 'tenant_profiles')

        Returns:
            List of SchemaField objects

        Raises:
            FileNotFoundError: If schema file doesn't exist
            ValueError: If schema JSON is invalid
        """
        schema_file = self.template_dir / "schemas" / f"{table_name}.json"

        if not schema_file.exists():
            raise FileNotFoundError(
                f"Schema file not found: {schema_file}. "
                f"Expected schema files in {self.template_dir / 'schemas'}/"
            )

        try:
            with open(schema_file, 'r', encoding='utf-8') as f:
                schema_json = json.load(f)

            # Convert JSON schema to SchemaField objects
            schema = [
                bigquery.SchemaField.from_api_repr(field)
                for field in schema_json
            ]

            self.logger.debug(
                f"Loaded schema from {schema_file}: {len(schema)} fields"
            )
            return schema

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in schema file {schema_file}: {e}")
        except Exception as e:
            raise ValueError(f"Error loading schema from {schema_file}: {e}")

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute bootstrap setup.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context

        Returns:
            Execution result with setup status
        """
        force_recreate_dataset = context.get('force_recreate_dataset', False)
        force_recreate_tables = context.get('force_recreate_tables', False)

        self.logger.info(
            "Starting one-time bootstrap setup",
            extra={
                "force_recreate_dataset": force_recreate_dataset,
                "force_recreate_tables": force_recreate_tables
            }
        )

        # Step 1: Ensure central tenants dataset exists
        dataset_created = self._ensure_tenants_dataset(
            force_recreate=force_recreate_dataset
        )

        # Step 2: Create all tenant management tables
        tables_config = self.config.get('tables', [])
        tables_created = []
        tables_existed = []

        for table_name in tables_config:
            table_existed = self._ensure_table(
                table_name=table_name,
                force_recreate=force_recreate_tables
            )

            if table_existed:
                tables_existed.append(table_name)
            else:
                tables_created.append(table_name)

        self.logger.info(
            "Bootstrap setup completed successfully",
            extra={
                "dataset_created": dataset_created,
                "tables_created": len(tables_created),
                "tables_existed": len(tables_existed),
                "total_tables": len(tables_config)
            }
        )

        return {
            "status": "SUCCESS",
            "dataset_created": dataset_created,
            "tables_created": tables_created,
            "tables_existed": tables_existed,
            "total_tables": len(tables_config),
            "message": "Bootstrap setup completed successfully"
        }

    def _ensure_tenants_dataset(self, force_recreate: bool = False) -> bool:
        """
        Create central tenants dataset if it doesn't exist.

        Args:
            force_recreate: If True, delete and recreate dataset

        Returns:
            True if dataset was created, False if it already existed
        """
        dataset_name = self.config.get('dataset', {}).get('name', 'tenants')
        dataset_description = self.config.get('dataset', {}).get(
            'description',
            'Central dataset for tenant management'
        )
        dataset_id = f"{self.project_id}.{dataset_name}"

        if force_recreate:
            self.logger.warning(
                f"Force recreating dataset (delete + create): {dataset_id}"
            )
            self.client.delete_dataset(
                dataset_id,
                delete_contents=True,
                not_found_ok=True
            )
            self.logger.info(f"Deleted dataset: {dataset_id}")

        try:
            dataset = self.client.get_dataset(dataset_id)
            self.logger.info(
                f"Dataset already exists: {dataset_id}",
                extra={
                    "dataset_id": dataset_id,
                    "created": dataset.created,
                    "location": dataset.location
                }
            )
            return False

        except exceptions.NotFound:
            self.logger.info(f"Creating dataset: {dataset_id}")
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = self.location
            dataset.description = dataset_description

            dataset = self.client.create_dataset(dataset, timeout=30)

            self.logger.info(
                f"Created dataset: {dataset_id}",
                extra={
                    "dataset_id": dataset_id,
                    "location": dataset.location,
                    "description": dataset_description
                }
            )
            return True

    def _ensure_table(
        self,
        table_name: str,
        force_recreate: bool = False
    ) -> bool:
        """
        Create table with schema if it doesn't exist.

        Args:
            table_name: Name of the table to create
            force_recreate: If True, delete and recreate table

        Returns:
            True if table already existed, False if it was created
        """
        dataset_name = self.config.get('dataset', {}).get('name', 'tenants')
        table_id = f"{self.project_id}.{dataset_name}.{table_name}"

        # Load schema from JSON file
        schema = self._load_table_schema(table_name)

        if force_recreate:
            self.logger.info(f"Force recreating table: {table_id}")
            self.client.delete_table(table_id, not_found_ok=True)
            self.logger.info(f"Deleted table: {table_id}")

        try:
            existing_table = self.client.get_table(table_id)
            self.logger.info(
                f"Table already exists: {table_id}",
                extra={
                    "table_id": table_id,
                    "num_rows": existing_table.num_rows,
                    "num_fields": len(existing_table.schema)
                }
            )
            return True

        except exceptions.NotFound:
            self.logger.info(
                f"Creating table: {table_id}",
                extra={
                    "table_id": table_id,
                    "schema_fields": len(schema)
                }
            )

            table = bigquery.Table(table_id, schema=schema)
            table.description = f"Tenant management table: {table_name}"

            # Add partitioning for specific tables
            if table_name == 'tenant_usage_quotas':
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="usage_date"
                )
                table.clustering_fields = ["tenant_id", "usage_date"]
            elif table_name == 'tenant_scheduled_pipeline_runs':
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="scheduled_time"
                )
                table.clustering_fields = ["tenant_id", "state", "config_id"]
            elif table_name == 'tenant_pipeline_execution_queue':
                table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="scheduled_time"
                )
                table.clustering_fields = ["state", "priority", "tenant_id"]

            # Create table
            table = self.client.create_table(table)

            self.logger.info(
                f"Created table: {table_id}",
                extra={
                    "table_id": table_id,
                    "num_fields": len(schema),
                    "partitioned": table.time_partitioning is not None,
                    "clustered": table.clustering_fields is not None
                }
            )
            return False


# Factory function to get processor instance
def get_engine():
    """Get OnetimeBootstrapProcessor instance."""
    return OnetimeBootstrapProcessor()
