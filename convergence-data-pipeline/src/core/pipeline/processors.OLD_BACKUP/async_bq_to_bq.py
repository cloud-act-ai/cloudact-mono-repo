"""
Async BigQuery to BigQuery Processor
Non-blocking data transfer and transformation between BigQuery tables.
"""

import asyncio
from typing import Dict, Any, Optional, List
from pathlib import Path
from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, QueryJobConfig, WriteDisposition

from src.core.engine.bq_client import BigQueryClient
from src.core.utils.logging import get_logger
from src.core.utils.sql_params import SQLParameterInjector

logger = get_logger(__name__)


class AsyncBigQueryToBigQueryProcessor:
    """
    Async processor for BigQuery-to-BigQuery data operations.

    Features:
    - Non-blocking async query execution
    - Parallel partition processing
    - Automatic dataset/table creation
    - Schema management from JSON files
    - Support for petabyte-scale data
    """

    def __init__(
        self,
        step_config: Dict[str, Any],
        tenant_id: str,
        bq_client: BigQueryClient,
        parameters: Optional[Dict[str, Any]] = None,
        pipeline_dir: Optional[Path] = None
    ):
        """
        Initialize async BigQuery to BigQuery processor.

        Args:
            step_config: Step configuration from pipeline YAML
            tenant_id: Tenant identifier
            bq_client: BigQuery client instance
            parameters: Pipeline parameters for query templating
            pipeline_dir: Pipeline directory for resolving relative paths (optional for backward compatibility)
        """
        self.step_config = step_config
        self.tenant_id = tenant_id
        self.bq_client = bq_client
        self.parameters = parameters or {}
        self.pipeline_dir = pipeline_dir

        self.step_id = step_config.get('step_id', 'unknown')
        self.source_config = step_config['source']
        self.destination_config = step_config['destination']

        # Partition config for parallel processing
        self.partition_config = step_config.get('partition', {})

        logger.info(
            f"Initialized AsyncBigQueryToBigQueryProcessor",
            extra={
                "step_id": self.step_id,
                "tenant_id": self.tenant_id,
                "partitioned": bool(self.partition_config),
                "pipeline_dir": str(pipeline_dir) if pipeline_dir else None
            }
        )

    async def execute(self) -> Dict[str, Any]:
        """
        Execute the BigQuery to BigQuery data transfer asynchronously.

        Returns:
            Execution metadata (rows written, bytes processed, etc.)
        """
        logger.info(
            f"Starting async BigQuery to BigQuery transfer",
            extra={"step_id": self.step_id}
        )

        # Check if partition-based processing is enabled
        if self.partition_config:
            return await self._execute_partitioned()
        else:
            return await self._execute_standard()

    async def _execute_standard(self) -> Dict[str, Any]:
        """
        Execute standard (non-partitioned) query.

        Returns:
            Execution metadata
        """
        # Step 1: Build source query
        query = self._build_source_query()

        # Step 2: Prepare destination (async)
        dest_table_id = await self._prepare_destination_async()

        # Step 3: Execute query and write to destination (async)
        result = await self._execute_query_to_table_async(query, dest_table_id)

        logger.info(
            f"Async BigQuery to BigQuery transfer complete",
            extra={
                "step_id": self.step_id,
                "rows_written": result['rows_written'],
                "bytes_processed": result['bytes_processed']
            }
        )

        return result

    async def _execute_partitioned(self) -> Dict[str, Any]:
        """
        Execute partitioned query for parallel processing.

        Returns:
            Aggregated execution metadata
        """
        logger.info(
            f"Starting partitioned execution",
            extra={"step_id": self.step_id, "partition_config": self.partition_config}
        )

        # Detect partitions
        partitions = await self._detect_partitions()

        logger.info(
            f"Detected {len(partitions)} partitions to process",
            extra={"step_id": self.step_id, "partition_count": len(partitions)}
        )

        # Prepare destination once
        dest_table_id = await self._prepare_destination_async()

        # Process partitions in parallel batches
        batch_size = self.partition_config.get('parallel_batch_size', 10)
        total_rows = 0
        total_bytes = 0

        for i in range(0, len(partitions), batch_size):
            batch = partitions[i:i + batch_size]

            logger.info(
                f"Processing partition batch {i//batch_size + 1}",
                extra={
                    "step_id": self.step_id,
                    "batch_size": len(batch),
                    "partitions": batch
                }
            )

            # Execute partitions in parallel
            tasks = [
                self._execute_partition(partition, dest_table_id)
                for partition in batch
            ]

            results = await asyncio.gather(*tasks)

            # Aggregate results
            for result in results:
                total_rows += result.get('rows_written', 0)
                total_bytes += result.get('bytes_processed', 0)

        logger.info(
            f"Partitioned execution complete",
            extra={
                "step_id": self.step_id,
                "total_partitions": len(partitions),
                "total_rows": total_rows,
                "total_bytes": total_bytes
            }
        )

        return {
            'rows_written': total_rows,
            'bytes_processed': total_bytes,
            'bytes_billed': total_bytes,  # Approximation
            'cache_hit': False,
            'destination_table': dest_table_id,
            'partitions_processed': len(partitions)
        }

    async def _detect_partitions(self) -> List[str]:
        """
        Detect partitions from source table.

        Returns:
            List of partition identifiers
        """
        partition_field = self.partition_config.get('field', 'date')
        partition_type = self.partition_config.get('type', 'date')  # date, range, etc.

        # Query to get distinct partition values
        source_table = self._get_source_table_id()

        # SECURITY FIX: Sanitize partition_field identifier to prevent SQL injection
        # Use SQLParameterInjector to validate and sanitize the column name
        safe_partition_field = SQLParameterInjector.sanitize_identifier(partition_field)

        query = f"""
        SELECT DISTINCT {safe_partition_field} as partition_value
        FROM `{source_table}`
        ORDER BY partition_value
        """

        query_job = None
        results = None

        try:
            # Execute query asynchronously
            loop = asyncio.get_event_loop()
            query_job = await loop.run_in_executor(
                None,
                self.bq_client.client.query,
                query
            )

            # Wait for results asynchronously
            results = await loop.run_in_executor(None, query_job.result)

            # Extract partition values
            partitions = [str(row.partition_value) for row in results]

            return partitions

        finally:
            # Clean up query job resources
            try:
                if query_job:
                    if query_job.state in ['PENDING', 'RUNNING']:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, query_job.cancel)
                        logger.debug(f"Cancelled partition detection query job: {query_job.job_id}")
                    del query_job
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up partition detection query job: {cleanup_error}", exc_info=True)

            # Clear results reference
            try:
                if results:
                    del results
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up partition results: {cleanup_error}", exc_info=True)

    async def _execute_partition(self, partition_value: str, dest_table_id: str) -> Dict[str, Any]:
        """
        Execute query for a single partition.

        Args:
            partition_value: Partition identifier
            dest_table_id: Destination table ID

        Returns:
            Execution metadata for this partition
        """
        partition_field = self.partition_config.get('field', 'date')

        # Build partition-specific query
        base_query = self._build_source_query()

        # SECURITY FIX: Use parameterized filter instead of string interpolation
        # Build safe filter clause using SQLParameterInjector
        filter_clause, filter_params = SQLParameterInjector.build_safe_filter(
            field_name=partition_field,
            operator='=',
            value=partition_value
        )

        # Add partition filter to query
        has_where = "WHERE" in base_query.upper()
        partition_query = f"""
        {base_query}
        {"AND" if has_where else "WHERE"} {filter_clause}
        """

        # Merge partition filter parameters with existing parameters
        combined_params = {**self.parameters, **filter_params}

        # Execute with WRITE_APPEND since we're processing multiple partitions
        result = await self._execute_query_to_table_async(
            partition_query,
            dest_table_id,
            write_disposition=WriteDisposition.WRITE_APPEND,
            partition_parameters=combined_params
        )

        logger.info(
            f"Partition {partition_value} complete",
            extra={
                "step_id": self.step_id,
                "partition": partition_value,
                "rows": result.get('rows_written', 0)
            }
        )

        return result

    def _get_source_table_id(self) -> str:
        """Get fully qualified source table ID."""
        if 'table' in self.source_config:
            return (
                f"{self.source_config.get('project_id', self.bq_client.client.project)}."
                f"{self.source_config['dataset']}."
                f"{self.source_config['table']}"
            )
        else:
            # Extract from query if no direct table reference
            return None

    def _build_source_query(self) -> str:
        """
        Build the source SQL query.

        Note: Query parameters are NOT substituted here - they are passed
        securely via QueryJobConfig in _execute_query_to_table_async.

        Returns:
            SQL query string with @parameter placeholders intact
        """
        if 'query' in self.source_config:
            # Use provided query template
            # SECURITY: Parameters remain as @param_name placeholders
            # They will be safely injected via QueryJobConfig.query_parameters
            query = self.source_config['query']

            logger.debug(
                f"Built query from template with {len(self.parameters)} parameters",
                extra={
                    "step_id": self.step_id,
                    "query_length": len(query),
                    "param_names": list(self.parameters.keys())
                }
            )
        else:
            # Build simple SELECT * query from source table
            # SECURITY FIX: source_table ID is constructed from configuration (not user input)
            # Table IDs in BigQuery backticks are safe, but we validate the components
            source_table = self._get_source_table_id()

            # Validate source_table is properly formatted (defensive check)
            if source_table and '`' not in source_table:
                query = f"SELECT * FROM `{source_table}`"
            else:
                # If already backtick-quoted or None, use as-is
                query = f"SELECT * FROM {source_table}" if source_table else "SELECT * FROM `unknown_table`"

            logger.debug(
                f"Built simple SELECT query",
                extra={"step_id": self.step_id, "source_table": source_table}
            )

        return query

    async def _prepare_destination_async(self) -> str:
        """
        Prepare destination dataset and table asynchronously.

        Returns:
            Fully qualified destination table ID
        """
        dataset_type = self.destination_config['dataset_type']
        table_name = self.destination_config['table']

        # Run synchronous operations in executor
        loop = asyncio.get_event_loop()

        # Create dataset if it doesn't exist
        logger.info(
            f"Creating/verifying destination dataset",
            extra={
                "step_id": self.step_id,
                "dataset_type": dataset_type
            }
        )

        await loop.run_in_executor(
            None,
            self.bq_client.create_dataset,
            self.tenant_id,
            dataset_type,
            f"Dataset for {dataset_type} data"
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

            await loop.run_in_executor(
                None,
                self.bq_client.delete_table,
                self.tenant_id,
                dataset_type,
                table_name,
                True  # not_found_ok
            )

        # Load schema if provided
        schema = None
        if 'schema_file' in self.destination_config:
            schema_file = self.destination_config['schema_file']

            # Resolve schema file path relative to pipeline directory
            if self.pipeline_dir:
                schema_path = self.pipeline_dir / schema_file
            else:
                # Backward compatibility: use schema_file as-is
                schema_path = Path(schema_file)

            logger.info(
                f"Loading schema from file",
                extra={
                    "step_id": self.step_id,
                    "schema_file": schema_file,
                    "resolved_path": str(schema_path)
                }
            )
            schema = await loop.run_in_executor(
                None,
                self.bq_client.load_schema_from_file,
                str(schema_path)
            )

        # Create table if it doesn't exist
        table_exists = await loop.run_in_executor(
            None,
            self.bq_client.table_exists,
            self.tenant_id,
            dataset_type,
            table_name
        )

        if not table_exists:
            if schema:
                logger.info(
                    f"Creating destination table with schema",
                    extra={
                        "step_id": self.step_id,
                        "table": dest_table_id,
                        "num_fields": len(schema)
                    }
                )

                await loop.run_in_executor(
                    None,
                    self.bq_client.create_table,
                    self.tenant_id,
                    dataset_type,
                    table_name,
                    schema,
                    self.destination_config.get('partition_field'),
                    self.destination_config.get('cluster_fields'),
                    self.destination_config.get('description')
                )

        return dest_table_id

    async def _execute_query_to_table_async(
        self,
        query: str,
        dest_table_id: str,
        write_disposition: WriteDisposition = None,
        partition_parameters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute query and write results to destination table asynchronously.

        Args:
            query: SQL query to execute (with @parameter placeholders)
            dest_table_id: Fully qualified destination table ID
            write_disposition: How to write (overwrite/append)
            partition_parameters: Override parameters for partition processing

        Returns:
            Execution metadata
        """
        # Determine write disposition
        if write_disposition is None:
            write_mode = self.destination_config.get('write_mode', 'overwrite')
            write_disposition = (
                WriteDisposition.WRITE_APPEND if write_mode == 'append'
                else WriteDisposition.WRITE_TRUNCATE
            )

        # Use partition parameters if provided, otherwise use instance parameters
        parameters = partition_parameters if partition_parameters is not None else self.parameters

        logger.info(
            f"Executing query to table",
            extra={
                "step_id": self.step_id,
                "destination": dest_table_id,
                "write_disposition": str(write_disposition),
                "parameter_count": len(parameters)
            }
        )

        # Configure query job with SECURE parameter injection
        job_config = QueryJobConfig(
            destination=dest_table_id,
            write_disposition=write_disposition,
            use_legacy_sql=False,
            allow_large_results=True
        )

        # SECURITY FIX: Use parameterized queries instead of string replacement
        if parameters:
            job_config = SQLParameterInjector.create_query_config(
                parameters=parameters,
                base_config=job_config
            )
            logger.info(
                f"Injected {len(parameters)} parameters securely",
                extra={
                    "step_id": self.step_id,
                    "param_names": list(parameters.keys())
                }
            )

        query_job = None
        dest_table = None

        try:
            # Execute query asynchronously
            loop = asyncio.get_event_loop()

            # Start query job (non-blocking)
            query_job = await loop.run_in_executor(
                None,
                self.bq_client.client.query,
                query,
                job_config
            )

            # Wait for completion asynchronously
            await loop.run_in_executor(None, query_job.result)

            # Get destination table metadata
            dest_table = await loop.run_in_executor(
                None,
                self.bq_client.client.get_table,
                dest_table_id
            )

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

        finally:
            # Clean up query job resources
            try:
                if query_job:
                    # Cancel job if still running (shouldn't happen, but defensive)
                    if query_job.state in ['PENDING', 'RUNNING']:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, query_job.cancel)
                        logger.debug(f"Cancelled running query job: {query_job.job_id}")

                    # Clear job reference
                    del query_job
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up query job: {cleanup_error}", exc_info=True)

            # Clear table reference
            try:
                if dest_table:
                    del dest_table
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up table reference: {cleanup_error}", exc_info=True)
