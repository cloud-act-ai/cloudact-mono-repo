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
        self.metadata_schemas_path = Path("configs/metadata/schemas")

    def ensure_tenant_metadata(self, tenant_id: str) -> None:
        """
        Ensure tenant-specific metadata dataset and tables exist.
        Creates them if they don't exist.

        Args:
            tenant_id: The tenant identifier
        """
        logger.info(f"Ensuring metadata infrastructure for tenant: {tenant_id}")

        # Create tenant-specific metadata dataset
        dataset_name = settings.get_tenant_dataset_name(tenant_id, "metadata")
        self._ensure_dataset(dataset_name)

        # Create metadata tables
        self._ensure_api_keys_table(dataset_name)
        self._ensure_pipeline_runs_table(dataset_name)
        self._ensure_step_logs_table(dataset_name)
        self._ensure_dq_results_table(dataset_name)

        logger.info(f"Metadata infrastructure ready for tenant: {tenant_id}")

    def _load_schema_from_json(self, table_name: str) -> List[bigquery.SchemaField]:
        """
        Load BigQuery schema from JSON file in configs/metadata/schemas/.

        Args:
            table_name: Name of the table (e.g., 'pipeline_runs', 'step_logs')

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

    def _ensure_dataset(self, dataset_name: str) -> None:
        """Create dataset if it doesn't exist."""
        dataset_id = f"{self.project_id}.{dataset_name}"

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

    def _ensure_api_keys_table(self, dataset_name: str, recreate: bool = False) -> None:
        """
        Create api_keys table if it doesn't exist.

        Args:
            dataset_name: Dataset name
            recreate: If True, delete and recreate table even if it exists
        """
        table_id = f"{self.project_id}.{dataset_name}.api_keys"

        # Load schema from JSON configuration file
        schema = self._load_schema_from_json("api_keys")

        if recreate:
            logger.info(f"Recreating table (delete + create): {table_id}")
            self.client.delete_table(table_id, not_found_ok=True)

        try:
            self.client.get_table(table_id)
            logger.debug(f"Table {table_id} already exists")
        except exceptions.NotFound:
            logger.info(f"Creating table: {table_id}")

            table = bigquery.Table(table_id, schema=schema)
            table.description = "API keys for tenant authentication"
            self.client.create_table(table)
            logger.info(f"Created table: {table_id}")

    def _ensure_pipeline_runs_table(self, dataset_name: str, recreate: bool = False) -> None:
        """
        Create pipeline_runs table if it doesn't exist.

        Args:
            dataset_name: Dataset name
            recreate: If True, delete and recreate table even if it exists
        """
        table_id = f"{self.project_id}.{dataset_name}.pipeline_runs"

        # Load schema from JSON configuration file
        schema = self._load_schema_from_json("pipeline_runs")

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

    def _ensure_step_logs_table(self, dataset_name: str, recreate: bool = False) -> None:
        """
        Create step_logs table if it doesn't exist.

        Args:
            dataset_name: Dataset name
            recreate: If True, delete and recreate table even if it exists
        """
        table_id = f"{self.project_id}.{dataset_name}.step_logs"

        # Load schema from JSON configuration file
        schema = self._load_schema_from_json("step_logs")

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

    def _ensure_dq_results_table(self, dataset_name: str, recreate: bool = False) -> None:
        """
        Create dq_results table if it doesn't exist.

        Args:
            dataset_name: Dataset name
            recreate: If True, delete and recreate table even if it exists
        """
        table_id = f"{self.project_id}.{dataset_name}.dq_results"

        # Load schema from JSON configuration file
        schema = self._load_schema_from_json("dq_results")

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


def ensure_tenant_metadata(tenant_id: str, bq_client: bigquery.Client) -> None:
    """
    Convenience function to ensure tenant metadata exists.

    Args:
        tenant_id: The tenant identifier
        bq_client: BigQuery client instance
    """
    initializer = MetadataInitializer(bq_client)
    initializer.ensure_tenant_metadata(tenant_id)
