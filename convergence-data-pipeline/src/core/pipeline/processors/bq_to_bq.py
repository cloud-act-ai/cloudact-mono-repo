"""
BigQuery to BigQuery Processor
Handles data transfer and transformation between BigQuery tables.
"""

from typing import Dict, Any, Optional, List
from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, QueryJobConfig, WriteDisposition

from src.core.engine.bq_client import BigQueryClient
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class BigQueryToBigQueryProcessor:
    """
    Processor for BigQuery-to-BigQuery data operations.

    Features:
    - Execute SQL queries against source tables
    - Create destination datasets automatically
    - Support table creation and recreation
    - Handle write modes (overwrite/append)
    - Schema management from JSON files
    """

    def __init__(
        self,
        step_config: Dict[str, Any],
        tenant_id: str,
        bq_client: BigQueryClient,
        parameters: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize BigQuery to BigQuery processor.

        Args:
            step_config: Step configuration from pipeline YAML
            tenant_id: Tenant identifier
            bq_client: BigQuery client instance
            parameters: Pipeline parameters for query templating
        """
        self.step_config = step_config
        self.tenant_id = tenant_id
        self.bq_client = bq_client
        self.parameters = parameters or {}

        self.step_id = step_config.get('step_id', 'unknown')
        self.source_config = step_config['source']
        self.destination_config = step_config['destination']

        logger.info(
            f"Initialized BigQueryToBigQueryProcessor",
            extra={
                "step_id": self.step_id,
                "tenant_id": self.tenant_id
            }
        )

    def execute(self) -> Dict[str, Any]:
        """
        Execute the BigQuery to BigQuery data transfer.

        Returns:
            Execution metadata (rows written, bytes processed, etc.)
        """
        logger.info(
            f"Starting BigQuery to BigQuery transfer",
            extra={"step_id": self.step_id}
        )

        # Step 1: Build source query
        query = self._build_source_query()

        # Step 2: Prepare destination
        dest_table_id = self._prepare_destination()

        # Step 3: Execute query and write to destination
        result = self._execute_query_to_table(query, dest_table_id)

        logger.info(
            f"BigQuery to BigQuery transfer complete",
            extra={
                "step_id": self.step_id,
                "rows_written": result['rows_written'],
                "bytes_processed": result['bytes_processed']
            }
        )

        return result

    def _build_source_query(self) -> str:
        """
        Build the source SQL query with parameter substitution.

        Returns:
            SQL query string
        """
        if 'query' in self.source_config:
            # Use provided query template
            query = self.source_config['query']

            # Replace parameters in query
            for param_name, param_value in self.parameters.items():
                query = query.replace(f"@{param_name}", str(param_value))

            logger.debug(
                f"Built query from template",
                extra={"step_id": self.step_id, "query_length": len(query)}
            )
        else:
            # Build simple SELECT * query from source table
            source_table = (
                f"{self.source_config['project_id']}."
                f"{self.source_config['dataset']}."
                f"{self.source_config['table']}"
            )
            query = f"SELECT * FROM `{source_table}`"

            logger.debug(
                f"Built simple SELECT query",
                extra={"step_id": self.step_id, "source_table": source_table}
            )

        return query

    def _prepare_destination(self) -> str:
        """
        Prepare destination dataset and table.

        Returns:
            Fully qualified destination table ID
        """
        dataset_type = self.destination_config['dataset_type']
        table_name = self.destination_config['table']

        # Create dataset if it doesn't exist
        logger.info(
            f"Creating/verifying destination dataset",
            extra={
                "step_id": self.step_id,
                "dataset_type": dataset_type
            }
        )

        self.bq_client.create_dataset(
            tenant_id=self.tenant_id,
            dataset_type=dataset_type,
            description=f"Dataset for {dataset_type} data"
        )

        # Get fully qualified table ID
        dataset_id = self.bq_client.get_tenant_dataset_id(self.tenant_id, dataset_type)
        dest_table_id = f"{dataset_id}.{table_name}"

        # Handle table recreation if requested
        recreate = self.destination_config.get('recreate', False)

        if recreate:
            logger.info(
                f"Recreate flag set - deleting existing table",
                extra={
                    "step_id": self.step_id,
                    "table": dest_table_id
                }
            )

            self.bq_client.delete_table(
                tenant_id=self.tenant_id,
                dataset_type=dataset_type,
                table_name=table_name,
                not_found_ok=True
            )

        # Load schema if provided
        schema = None
        if 'schema_file' in self.destination_config:
            schema_file = self.destination_config['schema_file']
            logger.info(
                f"Loading schema from file",
                extra={
                    "step_id": self.step_id,
                    "schema_file": schema_file
                }
            )
            schema = self.bq_client.load_schema_from_file(schema_file)

        # Create table if it doesn't exist (or was just deleted)
        table_exists = self.bq_client.table_exists(
            tenant_id=self.tenant_id,
            dataset_type=dataset_type,
            table_name=table_name
        )

        if not table_exists:
            if schema is None:
                logger.warning(
                    f"Creating table without schema - will be inferred from query",
                    extra={
                        "step_id": self.step_id,
                        "table": dest_table_id
                    }
                )
            else:
                logger.info(
                    f"Creating destination table with schema",
                    extra={
                        "step_id": self.step_id,
                        "table": dest_table_id,
                        "num_fields": len(schema)
                    }
                )

                self.bq_client.create_table(
                    tenant_id=self.tenant_id,
                    dataset_type=dataset_type,
                    table_name=table_name,
                    schema=schema,
                    partition_field=self.destination_config.get('partition_field'),  # None if not specified
                    cluster_fields=self.destination_config.get('cluster_fields'),
                    description=self.destination_config.get('description')
                )

        return dest_table_id

    def _execute_query_to_table(self, query: str, dest_table_id: str) -> Dict[str, Any]:
        """
        Execute query and write results to destination table.

        Args:
            query: SQL query to execute
            dest_table_id: Fully qualified destination table ID

        Returns:
            Execution metadata
        """
        # Determine write disposition based on write_mode
        write_mode = self.destination_config.get('write_mode', 'overwrite')

        if write_mode == 'append':
            write_disposition = WriteDisposition.WRITE_APPEND
        else:
            write_disposition = WriteDisposition.WRITE_TRUNCATE

        logger.info(
            f"Executing query to table",
            extra={
                "step_id": self.step_id,
                "destination": dest_table_id,
                "write_mode": write_mode
            }
        )

        # Configure query job
        job_config = QueryJobConfig(
            destination=dest_table_id,
            write_disposition=write_disposition,
            use_legacy_sql=False,
            allow_large_results=True
        )

        # Note: Schema is already set on the table when it was created
        # QueryJobConfig doesn't have a schema property - schema is inferred from query or table

        # Execute query
        query_job = self.bq_client.client.query(query, job_config=job_config)

        # Wait for completion
        query_job.result()

        # Collect execution metadata
        # For query jobs that write to a table, we need to get the destination table to count rows
        dest_table = self.bq_client.client.get_table(dest_table_id)

        result = {
            'rows_written': dest_table.num_rows or 0,
            'bytes_processed': query_job.total_bytes_processed or 0,
            'bytes_billed': query_job.total_bytes_billed or 0,
            'cache_hit': query_job.cache_hit or False,
            'destination_table': dest_table_id
        }

        logger.info(
            f"Query execution complete",
            extra={
                "step_id": self.step_id,
                "rows_written": result['rows_written'],
                "bytes_processed": result['bytes_processed'],
                "cache_hit": result['cache_hit']
            }
        )

        return result
