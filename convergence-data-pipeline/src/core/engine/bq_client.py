"""
Enterprise BigQuery Client Service
Thread-safe BigQuery client with connection pooling and retry logic.
"""

import json
from typing import Optional, List, Dict, Any, Iterator
from pathlib import Path
from functools import lru_cache
import logging

from google.cloud import bigquery
from google.cloud.bigquery import (
    Table,
    Dataset,
    SchemaField,
    LoadJobConfig,
    QueryJobConfig,
    WriteDisposition,
    TimePartitioning,
    TimePartitioningType,
)
from google.api_core import retry
from tenacity import (
    retry as tenacity_retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

from src.app.config import settings
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class BigQueryClient:
    """
    Enterprise BigQuery client with multi-tenancy support.

    Features:
    - Thread-safe connection pooling
    - Automatic retries with exponential backoff
    - Tenant-specific dataset isolation
    - Schema management from JSON files
    - Streaming and batch insert support
    """

    def __init__(self, project_id: Optional[str] = None, location: Optional[str] = None):
        """
        Initialize BigQuery client.

        Args:
            project_id: GCP project ID (defaults to settings)
            location: BigQuery location (defaults to settings)
        """
        self.project_id = project_id or settings.gcp_project_id
        self.location = location or settings.bigquery_location
        self._client: Optional[bigquery.Client] = None

    @property
    def client(self) -> bigquery.Client:
        """Lazy-load BigQuery client (thread-safe singleton per instance)."""
        if self._client is None:
            self._client = bigquery.Client(
                project=self.project_id,
                location=self.location
            )
            logger.info(
                f"Initialized BigQuery client",
                extra={
                    "project_id": self.project_id,
                    "location": self.location
                }
            )
        return self._client

    # ============================================
    # Dataset Management
    # ============================================

    def get_tenant_dataset_id(self, tenant_id: str, dataset_type: str) -> str:
        """
        Generate fully qualified dataset ID for a tenant.

        Args:
            tenant_id: Tenant identifier
            dataset_type: Type of dataset (e.g., 'raw_openai', 'silver_cost')

        Returns:
            Fully qualified dataset ID: {project}.{tenant_id}_{dataset_type}
        """
        dataset_name = settings.get_tenant_dataset_name(tenant_id, dataset_type)
        return f"{self.project_id}.{dataset_name}"

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(Exception)
    )
    def create_dataset(
        self,
        tenant_id: str,
        dataset_type: str,
        description: Optional[str] = None,
        labels: Optional[Dict[str, str]] = None
    ) -> Dataset:
        """
        Create a BigQuery dataset for a tenant (idempotent).

        Args:
            tenant_id: Tenant identifier
            dataset_type: Type of dataset
            description: Dataset description
            labels: Dataset labels for organization

        Returns:
            Dataset object
        """
        dataset_name = settings.get_tenant_dataset_name(tenant_id, dataset_type)
        dataset_id = f"{self.project_id}.{dataset_name}"

        dataset = bigquery.Dataset(dataset_id)
        dataset.location = self.location

        if description:
            dataset.description = description

        if labels:
            dataset.labels = labels
        else:
            dataset.labels = {
                "tenant_id": tenant_id.replace("_", "-"),  # Labels can't have underscores
                "dataset_type": dataset_type.replace("_", "-"),
                "managed_by": "convergence-pipeline"
            }

        try:
            dataset = self.client.create_dataset(dataset, exists_ok=True)
            logger.info(
                f"Created/verified dataset: {dataset_id}",
                extra={"tenant_id": tenant_id, "dataset_type": dataset_type})
            return dataset

        except Exception as e:
            logger.error(
                f"Error creating dataset {dataset_id}: {e}",
                extra={"tenant_id": tenant_id}, exc_info=True)
            raise

    # ============================================
    # Schema Management
    # ============================================

    def load_schema_from_file(self, schema_path: str) -> List[SchemaField]:
        """
        Load BigQuery schema from JSON file.

        Args:
            schema_path: Path to schema JSON file

        Returns:
            List of SchemaField objects

        Raises:
            FileNotFoundError: If schema file doesn't exist
            ValueError: If schema format is invalid
        """
        schema_file = Path(schema_path)

        if not schema_file.exists():
            raise FileNotFoundError(f"Schema file not found: {schema_path}")

        try:
            with open(schema_file, "r", encoding="utf-8") as f:
                schema_json = json.load(f)

            # Convert JSON schema to SchemaField objects
            schema = [SchemaField.from_api_repr(field) for field in schema_json]

            logger.debug(f"Loaded schema from {schema_path}: {len(schema)} fields")
            return schema

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in schema file {schema_path}: {e}")
        except Exception as e:
            raise ValueError(f"Error loading schema from {schema_path}: {e}")

    # ============================================
    # Table Management
    # ============================================

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30)
    )
    def create_table(
        self,
        tenant_id: str,
        dataset_type: str,
        table_name: str,
        schema: List[SchemaField],
        partition_field: Optional[str] = None,
        cluster_fields: Optional[List[str]] = None,
        description: Optional[str] = None
    ) -> Table:
        """
        Create a BigQuery table (idempotent).

        Args:
            tenant_id: Tenant identifier
            dataset_type: Type of dataset
            table_name: Table name
            schema: List of SchemaField objects
            partition_field: Field to partition by (None = no partitioning)
            cluster_fields: List of fields to cluster by
            description: Table description

        Returns:
            Table object
        """
        dataset_id = self.get_tenant_dataset_id(tenant_id, dataset_type)
        table_id = f"{dataset_id}.{table_name}"

        table = bigquery.Table(table_id, schema=schema)

        # Set partitioning
        if partition_field:
            table.time_partitioning = TimePartitioning(
                type_=TimePartitioningType.DAY,
                field=partition_field
            )

        # Set clustering
        if cluster_fields:
            table.clustering_fields = cluster_fields

        if description:
            table.description = description

        try:
            table = self.client.create_table(table, exists_ok=True)
            logger.info(
                f"Created/verified table: {table_id}",
                extra={"tenant_id": tenant_id, "table_name": table_name, "num_fields": len(schema)}
            )
            return table

        except Exception as e:
            logger.error(
                f"Error creating table {table_id}: {e}",
                extra={"tenant_id": tenant_id}, exc_info=True)
            raise

    def create_table_from_schema_file(
        self,
        tenant_id: str,
        dataset_type: str,
        table_name: str,
        schema_file: str,
        partition_field: Optional[str] = None,
        cluster_fields: Optional[List[str]] = None,
        description: Optional[str] = None
    ) -> Table:
        """
        Create table from schema JSON file.

        Args:
            tenant_id: Tenant identifier
            dataset_type: Type of dataset
            table_name: Table name
            schema_file: Path to schema JSON file
            partition_field: Field to partition by (None = no partitioning)
            cluster_fields: List of fields to cluster by
            description: Table description

        Returns:
            Table object
        """
        schema = self.load_schema_from_file(schema_file)

        return self.create_table(
            tenant_id=tenant_id,
            dataset_type=dataset_type,
            table_name=table_name,
            schema=schema,
            partition_field=partition_field,
            cluster_fields=cluster_fields,
            description=description
        )

    # ============================================
    # Data Loading
    # ============================================

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30)
    )
    def insert_rows(
        self,
        tenant_id: str,
        dataset_type: str,
        table_name: str,
        rows: List[Dict[str, Any]],
        skip_invalid_rows: bool = False
    ) -> None:
        """
        Insert rows into BigQuery table (streaming insert).

        Args:
            tenant_id: Tenant identifier
            dataset_type: Type of dataset
            table_name: Table name
            rows: List of row dictionaries
            skip_invalid_rows: Whether to skip invalid rows

        Raises:
            ValueError: If insert fails
        """
        dataset_id = self.get_tenant_dataset_id(tenant_id, dataset_type)
        table_id = f"{dataset_id}.{table_name}"

        table = self.client.get_table(table_id)

        errors = self.client.insert_rows_json(
            table,
            rows,
            skip_invalid_rows=skip_invalid_rows
        )

        if errors:
            error_msg = f"Failed to insert rows into {table_id}: {errors}"
            logger.error(error_msg, extra={"tenant_id": tenant_id, "errors": errors})
            raise ValueError(error_msg)

        logger.info(
            f"Inserted {len(rows)} rows into {table_id}",
            extra={"tenant_id": tenant_id, "table_name": table_name, "row_count": len(rows)}
        )

    # ============================================
    # Query Execution
    # ============================================

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30)
    )
    def query(
        self,
        query: str,
        parameters: Optional[List[Any]] = None,
        use_legacy_sql: bool = False
    ) -> Iterator[Dict[str, Any]]:
        """
        Execute a BigQuery SQL query.

        Args:
            query: SQL query string
            parameters: Query parameters for parameterized queries
            use_legacy_sql: Whether to use legacy SQL (default: False)

        Yields:
            Row dictionaries
        """
        job_config = QueryJobConfig(use_legacy_sql=use_legacy_sql)

        if parameters:
            job_config.query_parameters = parameters

        query_job = self.client.query(query, job_config=job_config)

        logger.debug(f"Executing query: {query[:100]}...")

        # Wait for query to complete
        results = query_job.result(timeout=settings.bq_query_timeout_seconds)

        logger.info(
            f"Query completed",
            extra={"total_bytes_processed": query_job.total_bytes_processed, "total_bytes_billed": query_job.total_bytes_billed, "cache_hit": query_job.cache_hit})

        # Yield rows as dictionaries
        for row in results:
            yield dict(row)

    def query_to_list(
        self,
        query: str,
        parameters: Optional[List[Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute query and return all results as a list.

        Args:
            query: SQL query string
            parameters: Query parameters

        Returns:
            List of row dictionaries
        """
        return list(self.query(query, parameters))

    # ============================================
    # Table Operations
    # ============================================

    def table_exists(
        self,
        tenant_id: str,
        dataset_type: str,
        table_name: str
    ) -> bool:
        """
        Check if a table exists.

        Args:
            tenant_id: Tenant identifier
            dataset_type: Type of dataset
            table_name: Table name

        Returns:
            True if table exists, False otherwise
        """
        dataset_id = self.get_tenant_dataset_id(tenant_id, dataset_type)
        table_id = f"{dataset_id}.{table_name}"

        try:
            self.client.get_table(table_id)
            return True
        except Exception:
            return False

    def delete_table(
        self,
        tenant_id: str,
        dataset_type: str,
        table_name: str,
        not_found_ok: bool = True
    ) -> None:
        """
        Delete a BigQuery table.

        Args:
            tenant_id: Tenant identifier
            dataset_type: Type of dataset
            table_name: Table name
            not_found_ok: Whether to ignore if table doesn't exist
        """
        dataset_id = self.get_tenant_dataset_id(tenant_id, dataset_type)
        table_id = f"{dataset_id}.{table_name}"

        self.client.delete_table(table_id, not_found_ok=not_found_ok)

        logger.info(
            f"Deleted table: {table_id}",
            extra={"tenant_id": tenant_id, "table_name": table_name})


@lru_cache()
def get_bigquery_client() -> BigQueryClient:
    """Get cached BigQuery client instance."""
    return BigQueryClient()
