"""
Metadata Initialization Service
Automatically creates tenant-specific metadata infrastructure.
"""

import logging
from pathlib import Path
from typing import List, Optional
from google.cloud import bigquery
from google.api_core import exceptions

from src.app.config import settings

logger = logging.getLogger(__name__)


class MetadataInitializer:
    """Handles initialization of tenant-specific metadata infrastructure."""

    def __init__(self, bq_client: bigquery.Client):
        """
        Initialize metadata initializer.

        Args:
            bq_client: BigQuery client instance
        """
        self.client = bq_client
        self.project_id = settings.gcp_project_id
        self.location = settings.bigquery_location
        # Use the correct path to metadata schemas
        if not Path(settings.metadata_schemas_path).is_absolute():
            # If relative, make it relative to the project root
            self.metadata_schemas_path = Path(__file__).parent.parent.parent.parent / settings.metadata_schemas_path
        else:
            self.metadata_schemas_path = Path(settings.metadata_schemas_path)

    def ensure_tenant_metadata(
        self,
        tenant_id: str,
        force_recreate_dataset: bool = False,
        force_recreate_tables: bool = False
    ) -> None:
        """
        Ensure tenant-specific dataset and metadata tables exist.
        Creates them if they don't exist.

        Single-dataset-per-tenant architecture: All tables (metadata + data)
        are stored in a single dataset named after the tenant_id.

        Args:
            tenant_id: The tenant identifier
            force_recreate_dataset: If True, delete and recreate the entire dataset (default: False)
            force_recreate_tables: If True, delete and recreate all metadata tables (default: False)
        """
        logger.info(f"Ensuring metadata infrastructure for tenant: {tenant_id}")

        # Create single tenant dataset (not tenant_id_metadata)
        dataset_name = tenant_id
        self._ensure_dataset(dataset_name, force_recreate=force_recreate_dataset)

        # Create metadata tables in the tenant dataset
        # Note: API keys and credentials are now centralized in tenants dataset
        self._ensure_x_meta_pipeline_runs_table(dataset_name, recreate=force_recreate_tables)
        self._ensure_x_meta_step_logs_table(dataset_name, recreate=force_recreate_tables)
        self._ensure_x_meta_dq_results_table(dataset_name, recreate=force_recreate_tables)

        logger.info(f"Metadata infrastructure ready for tenant: {tenant_id}")

    def _load_schema_from_json(self, table_name: str) -> List[bigquery.SchemaField]:
        """
        Load BigQuery schema from JSON file in configs/metadata/schemas/.

        Args:
            table_name: Name of the table (e.g., 'x_meta_pipeline_runs', 'x_meta_step_logs')

        Returns:
            List of SchemaField objects

        Raises:
            FileNotFoundError: If schema file doesn't exist
            ValueError: If schema JSON is invalid
        """
        import json

        schema_file = self.metadata_schemas_path / f"{table_name}.json"

        if not schema_file.exists():
            raise FileNotFoundError(f"Metadata schema file not found: {schema_file}")

        try:
            with open(schema_file, 'r', encoding='utf-8') as f:
                schema_json = json.load(f)

            # Convert JSON schema to SchemaField objects
            schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

            logger.debug(f"Loaded schema from {schema_file}: {len(schema)} fields")
            return schema

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in schema file {schema_file}: {e}")
        except Exception as e:
            raise ValueError(f"Error loading schema from {schema_file}: {e}")

    def _ensure_dataset(self, dataset_name: str, force_recreate: bool = False) -> None:
        """
        Create dataset if it doesn't exist.

        Args:
            dataset_name: Dataset name
            force_recreate: If True, delete and recreate dataset even if it exists (default: False)
        """
        dataset_id = f"{self.project_id}.{dataset_name}"

        if force_recreate:
            logger.warning(f"Force recreating dataset (delete + create): {dataset_id}")
            self.client.delete_dataset(dataset_id, delete_contents=True, not_found_ok=True)
            logger.info(f"Deleted dataset: {dataset_id}")

        try:
            self.client.get_dataset(dataset_id)
            logger.debug(f"Dataset {dataset_id} already exists")
        except exceptions.NotFound:
            logger.info(f"Creating dataset: {dataset_id}")
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = self.location
            dataset.description = f"Metadata tracking for tenant"
            self.client.create_dataset(dataset, timeout=30)
            logger.info(f"Created dataset: {dataset_id}")

    def _ensure_x_meta_pipeline_runs_table(self, dataset_name: str, recreate: bool = False) -> None:
        """
        Create x_meta_pipeline_runs table if it doesn't exist.

        Args:
            dataset_name: Dataset name
            recreate: If True, delete and recreate table even if it exists
        """
        table_id = f"{self.project_id}.{dataset_name}.x_meta_pipeline_runs"

        # Load schema from JSON configuration file
        schema = self._load_schema_from_json("x_meta_pipeline_runs")

        if recreate:
            logger.info(f"Recreating table (delete + create): {table_id}")
            self.client.delete_table(table_id, not_found_ok=True)

        try:
            self.client.get_table(table_id)
            logger.debug(f"Table {table_id} already exists")
        except exceptions.NotFound:
            logger.info(f"Creating table: {table_id}")

            table = bigquery.Table(table_id, schema=schema)
            table.description = "Pipeline execution runs tracking"

            # Partition by start_time for efficient querying
            table.time_partitioning = bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.DAY,
                field="start_time"
            )

            # Cluster by tenant_id, pipeline_id, and status for query optimization
            table.clustering_fields = ["tenant_id", "pipeline_id", "status"]

            self.client.create_table(table)
            logger.info(f"Created table: {table_id}")

    def _ensure_x_meta_step_logs_table(self, dataset_name: str, recreate: bool = False) -> None:
        """
        Create x_meta_step_logs table if it doesn't exist.

        Args:
            dataset_name: Dataset name
            recreate: If True, delete and recreate table even if it exists
        """
        table_id = f"{self.project_id}.{dataset_name}.x_meta_step_logs"

        # Load schema from JSON configuration file
        schema = self._load_schema_from_json("x_meta_step_logs")

        if recreate:
            logger.info(f"Recreating table (delete + create): {table_id}")
            self.client.delete_table(table_id, not_found_ok=True)

        try:
            self.client.get_table(table_id)
            logger.debug(f"Table {table_id} already exists")
        except exceptions.NotFound:
            logger.info(f"Creating table: {table_id}")

            table = bigquery.Table(table_id, schema=schema)
            table.description = "Detailed step execution logs"

            # Partition by start_time for efficient querying
            table.time_partitioning = bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.DAY,
                field="start_time"
            )

            # Cluster by pipeline_logging_id and status for query optimization
            table.clustering_fields = ["pipeline_logging_id", "status"]

            self.client.create_table(table)
            logger.info(f"Created table: {table_id}")

    def _ensure_x_meta_dq_results_table(self, dataset_name: str, recreate: bool = False) -> None:
        """
        Create x_meta_dq_results table if it doesn't exist.

        Args:
            dataset_name: Dataset name
            recreate: If True, delete and recreate table even if it exists
        """
        table_id = f"{self.project_id}.{dataset_name}.x_meta_dq_results"

        # Load schema from JSON configuration file
        schema = self._load_schema_from_json("x_meta_dq_results")

        if recreate:
            logger.info(f"Recreating table (delete + create): {table_id}")
            self.client.delete_table(table_id, not_found_ok=True)

        try:
            self.client.get_table(table_id)
            logger.debug(f"Table {table_id} already exists")
        except exceptions.NotFound:
            logger.info(f"Creating table: {table_id}")

            table = bigquery.Table(table_id, schema=schema)
            table.description = "Data quality validation results"

            # Partition by ingestion_date for efficient querying
            table.time_partitioning = bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.DAY,
                field="ingestion_date"
            )

            # Cluster by tenant_id, target_table, and overall_status for query optimization
            table.clustering_fields = ["tenant_id", "target_table", "overall_status"]

            self.client.create_table(table)
            logger.info(f"Created table: {table_id}")


def ensure_tenant_metadata(
    tenant_id: str,
    bq_client: bigquery.Client,
    force_recreate_dataset: bool = False,
    force_recreate_tables: bool = False
) -> None:
    """
    Convenience function to ensure tenant metadata exists.

    Args:
        tenant_id: The tenant identifier
        bq_client: BigQuery client instance
        force_recreate_dataset: If True, delete and recreate the entire dataset (default: False)
        force_recreate_tables: If True, delete and recreate all metadata tables (default: False)
    """
    initializer = MetadataInitializer(bq_client)
    initializer.ensure_tenant_metadata(
        tenant_id=tenant_id,
        force_recreate_dataset=force_recreate_dataset,
        force_recreate_tables=force_recreate_tables
    )
