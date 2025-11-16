"""
BigQuery to BigQuery Processor
Handles data transfer and transformation between BigQuery tables.
"""

from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, QueryJobConfig, WriteDisposition

from src.core.engine.bq_client import BigQueryClient
from src.core.utils.logging import get_logger
from src.core.utils.sql_params import SQLParameterInjector

logger = get_logger(__name__)


# ============================================
# Schema Validation Module
# ============================================

class SchemaValidationError(Exception):
    """Raised when schema validation fails."""
    pass


class SchemaValidator:
    """
    Validates BigQuery table schemas to prevent data corruption.

    Prevents silent data corruption by:
    1. Detecting schema mismatches before write operations
    2. Validating schema evolution (new nullable fields OK, removed fields ERROR)
    3. Comparing field names, types, and modes precisely
    """

    @staticmethod
    def validate_schema_compatibility(
        expected_schema: List[SchemaField],
        existing_schema: List[SchemaField],
        table_id: str,
        allow_evolution: bool = True
    ) -> Tuple[bool, str]:
        """
        Validate that existing table schema matches expected schema.

        Validation rules:
        - Field names must match exactly (case-sensitive)
        - Field types must match exactly (STRING != BYTES, INT64 != FLOAT64)
        - Field modes must match (NULLABLE vs REPEATED vs REQUIRED)
        - Field description/order changes are OK

        Schema evolution rules (if allow_evolution=True):
        - New fields OK ONLY if NULLABLE mode
        - Removed fields are ERROR (data loss risk)
        - Modified field type/mode is ERROR (corruption risk)

        Args:
            expected_schema: Schema from config/schema_file
            existing_schema: Current table schema in BigQuery
            table_id: Table identifier for error messages
            allow_evolution: Allow adding nullable fields (default: True)

        Returns:
            Tuple of (is_valid: bool, validation_message: str)
            is_valid=True means schemas are compatible
            Message contains details of any mismatches
        """
        if not expected_schema:
            return False, "ERROR: Expected schema is empty or not provided"

        if not existing_schema:
            return False, "ERROR: Unable to read existing table schema"

        issues = []

        # Create field lookup maps for comparison
        expected_fields = {field.name: field for field in expected_schema}
        existing_fields = {field.name: field for field in existing_schema}

        # Check 1: Detect removed fields (DATA LOSS RISK)
        removed_fields = set(existing_fields.keys()) - set(expected_fields.keys())
        if removed_fields:
            issues.append(
                f"REMOVED FIELDS (DATA LOSS RISK): {sorted(removed_fields)} - "
                f"Existing table has fields not in expected schema. This indicates schema regression."
            )

        # Check 2: Validate existing fields match expected
        for field_name, expected_field in expected_fields.items():
            if field_name not in existing_fields:
                if allow_evolution:
                    # New field - only OK if NULLABLE
                    if expected_field.mode == 'NULLABLE' or expected_field.mode is None:
                        logger.info(
                            f"Schema evolution: New nullable field allowed",
                            extra={
                                "table": table_id,
                                "field": field_name,
                                "type": expected_field.field_type,
                                "mode": expected_field.mode
                            }
                        )
                    else:
                        issues.append(
                            f"INVALID NEW FIELD '{field_name}': mode='{expected_field.mode}' - "
                            f"New fields must be NULLABLE, cannot be REQUIRED or REPEATED"
                        )
                continue

            existing_field = existing_fields[field_name]

            # Check type match
            if expected_field.field_type != existing_field.field_type:
                issues.append(
                    f"TYPE MISMATCH for field '{field_name}': "
                    f"expected={expected_field.field_type}, existing={existing_field.field_type} - "
                    f"Type changes cause silent data corruption"
                )

            # Check mode match (NULLABLE vs REQUIRED vs REPEATED)
            expected_mode = expected_field.mode or 'NULLABLE'
            existing_mode = existing_field.mode or 'NULLABLE'
            if expected_mode != existing_mode:
                issues.append(
                    f"MODE MISMATCH for field '{field_name}': "
                    f"expected={expected_mode}, existing={existing_mode} - "
                    f"Mode changes cause silent data corruption"
                )

        # Check 3: Validate subfield schemas for RECORD types
        for field_name, expected_field in expected_fields.items():
            if field_name in existing_fields:
                existing_field = existing_fields[field_name]
                if expected_field.field_type == 'RECORD' and existing_field.field_type == 'RECORD':
                    # Recursively validate RECORD schema
                    sub_valid, sub_msg = SchemaValidator.validate_schema_compatibility(
                        expected_field.fields or [],
                        existing_field.fields or [],
                        f"{table_id}.{field_name}",
                        allow_evolution
                    )
                    if not sub_valid:
                        issues.append(f"RECORD SCHEMA MISMATCH for field '{field_name}': {sub_msg}")

        # Generate result
        if issues:
            combined_issues = "\n  ".join(issues)
            message = (
                f"SCHEMA VALIDATION FAILED for table {table_id}:\n"
                f"  {combined_issues}\n"
                f"\nAction required: Fix schema mismatch before proceeding.\n"
                f"Do NOT proceed with write operation - data corruption risk at scale."
            )
            return False, message

        message = f"Schema validation passed for {table_id}: {len(expected_fields)} fields match"
        return True, message

    @staticmethod
    def validate_and_log_schema(
        table_id: str,
        expected_schema: Optional[List[SchemaField]],
        existing_schema: Optional[List[SchemaField]],
        step_id: str
    ) -> bool:
        """
        Validate schema and log detailed results.

        Args:
            table_id: Fully qualified table ID
            expected_schema: Expected schema from config
            existing_schema: Actual schema from BigQuery
            step_id: Pipeline step identifier for logging context

        Returns:
            True if validation passed, False otherwise

        Raises:
            SchemaValidationError: If validation fails
        """
        if expected_schema is None:
            logger.warning(
                f"No schema validation: expected_schema is None",
                extra={"table": table_id, "step_id": step_id}
            )
            return True

        if existing_schema is None:
            logger.warning(
                f"No schema validation: unable to read existing schema",
                extra={"table": table_id, "step_id": step_id}
            )
            return True

        is_valid, message = SchemaValidator.validate_schema_compatibility(
            expected_schema, existing_schema, table_id
        )

        if is_valid:
            logger.info(
                f"Schema validation successful",
                extra={
                    "table": table_id,
                    "step_id": step_id,
                    "message": message,
                    "field_count": len(expected_schema)
                }
            )
            return True
        else:
            logger.error(
                f"Schema validation failed",
                extra={
                    "table": table_id,
                    "step_id": step_id,
                    "message": message
                }
            )
            raise SchemaValidationError(message)


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
        parameters: Optional[Dict[str, Any]] = None,
        pipeline_dir: Optional[Path] = None
    ):
        """
        Initialize BigQuery to BigQuery processor.

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

        logger.info(
            f"Initialized BigQueryToBigQueryProcessor",
            extra={
                "step_id": self.step_id,
                "tenant_id": self.tenant_id,
                "pipeline_dir": str(pipeline_dir) if pipeline_dir else None
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
        Build the source SQL query.

        Note: Query parameters are NOT substituted here - they are passed
        securely via QueryJobConfig in _execute_query_to_table.

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
            # SECURITY FIX: Validate source configuration components to prevent injection
            # These come from config files (not user input) but we validate them defensively
            project_id = self.source_config.get('project_id', '')
            dataset = self.source_config.get('dataset', '')
            table = self.source_config.get('table', '')

            # Validate identifiers using SQLParameterInjector
            safe_project = SQLParameterInjector.sanitize_identifier(project_id) if project_id else ''
            safe_dataset = SQLParameterInjector.sanitize_identifier(dataset) if dataset else ''
            safe_table = SQLParameterInjector.sanitize_identifier(table) if table else ''

            source_table = f"{safe_project}.{safe_dataset}.{safe_table}"
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
            schema = self.bq_client.load_schema_from_file(str(schema_path))

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
        else:
            # Table exists - validate schema before write
            self._validate_existing_table_schema(
                dest_table_id, schema, dataset_type, table_name
            )

        return dest_table_id

    def _validate_existing_table_schema(
        self,
        dest_table_id: str,
        expected_schema: Optional[List[SchemaField]],
        dataset_type: str,
        table_name: str
    ) -> None:
        """
        Validate that existing table schema matches expected schema.

        This is CRITICAL to prevent silent data corruption at scale.
        If a table exists with wrong schema, writes will corrupt data silently.

        Args:
            dest_table_id: Fully qualified destination table ID
            expected_schema: Schema from config (None = schema validation skipped)
            dataset_type: Type of dataset
            table_name: Table name

        Raises:
            SchemaValidationError: If schema mismatch detected
        """
        # Skip validation if no schema file provided
        if expected_schema is None:
            logger.warning(
                f"Schema validation skipped: no schema_file in config",
                extra={
                    "step_id": self.step_id,
                    "table": dest_table_id,
                    "risk": "Data corruption possible if table schema mismatches query results"
                }
            )
            return

        # Get existing table schema
        try:
            existing_table = self.bq_client.client.get_table(dest_table_id)
            existing_schema = existing_table.schema
        except Exception as e:
            logger.error(
                f"Failed to read existing table schema",
                extra={
                    "step_id": self.step_id,
                    "table": dest_table_id,
                    "error": str(e)
                },
                exc_info=True
            )
            raise SchemaValidationError(
                f"Cannot validate schema: unable to read existing table {dest_table_id}. "
                f"Error: {e}"
            )

        # Perform validation
        SchemaValidator.validate_and_log_schema(
            table_id=dest_table_id,
            expected_schema=expected_schema,
            existing_schema=existing_schema,
            step_id=self.step_id
        )

    def _execute_query_to_table(self, query: str, dest_table_id: str) -> Dict[str, Any]:
        """
        Execute query and write results to destination table.

        Args:
            query: SQL query to execute (with @parameter placeholders)
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
                "write_mode": write_mode,
                "parameter_count": len(self.parameters)
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
        if self.parameters:
            job_config = SQLParameterInjector.create_query_config(
                parameters=self.parameters,
                base_config=job_config
            )
            logger.info(
                f"Injected {len(self.parameters)} parameters securely",
                extra={
                    "step_id": self.step_id,
                    "param_names": list(self.parameters.keys())
                }
            )

        # Note: Schema is already set on the table when it was created
        # QueryJobConfig doesn't have a schema property - schema is inferred from query or table

        query_job = None
        dest_table = None

        try:
            # Execute query with parameterized config
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

        finally:
            # Clean up query job resources
            try:
                if query_job:
                    # Cancel job if still running (shouldn't happen, but defensive)
                    if query_job.state in ['PENDING', 'RUNNING']:
                        query_job.cancel()
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
