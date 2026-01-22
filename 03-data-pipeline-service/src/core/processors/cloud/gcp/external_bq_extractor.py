"""
BigQuery ETL Engine (GCP)
Processes gcp.bq_etl ps_type for extract-transform-load operations with schema template support.

Supports TWO modes:
1. CloudAct internal ETL: Uses CloudAct's default credentials
2. Customer GCP reads: Uses customer's Service Account credentials (via GCPAuthenticator)

For customer GCP billing data:
  - Source: Customer's GCP project (uses customer's SA credentials)
  - Destination: CloudAct's BigQuery (uses CloudAct's credentials)
"""
import json
import logging
import time
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, date
import uuid
from google.cloud import bigquery
from google.cloud.exceptions import NotFound
from google.api_core import exceptions as core_exceptions

from src.core.engine.bq_client import BigQueryClient
from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
from src.core.utils.bq_helpers import build_parameterized_query
from src.app.config import get_settings


def retry_on_transient_error(max_retries=3, backoff_seconds=1):
    """
    Decorator to retry BigQuery operations on transient errors.

    Supports both sync and async functions - uses asyncio.sleep for async
    to avoid blocking the event loop.

    Retries on:
    - InternalServerError (500)
    - BadGateway (502)
    - ServiceUnavailable (503)
    - GatewayTimeout (504)
    - TooManyRequests (429)
    """
    import functools
    import inspect

    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            retries = 0
            delay = backoff_seconds

            while retries < max_retries:
                try:
                    return await func(*args, **kwargs)
                except (
                    core_exceptions.InternalServerError,
                    core_exceptions.BadGateway,
                    core_exceptions.ServiceUnavailable,
                    core_exceptions.GatewayTimeout,
                    core_exceptions.TooManyRequests
                ) as e:
                    retries += 1
                    if retries >= max_retries:
                        raise

                    logging.warning(
                        f"BigQuery transient error (attempt {retries}/{max_retries}): {e}. "
                        f"Retrying in {delay}s..."
                    )
                    # Use asyncio.sleep to avoid blocking event loop
                    await asyncio.sleep(delay)
                    delay *= 2  # Exponential backoff
                except Exception:
                    raise

            return None

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            retries = 0
            delay = backoff_seconds

            while retries < max_retries:
                try:
                    return func(*args, **kwargs)
                except (
                    core_exceptions.InternalServerError,
                    core_exceptions.BadGateway,
                    core_exceptions.ServiceUnavailable,
                    core_exceptions.GatewayTimeout,
                    core_exceptions.TooManyRequests
                ) as e:
                    retries += 1
                    if retries >= max_retries:
                        raise

                    logging.warning(
                        f"BigQuery transient error (attempt {retries}/{max_retries}): {e}. "
                        f"Retrying in {delay}s..."
                    )
                    time.sleep(delay)
                    delay *= 2  # Exponential backoff
                except Exception:
                    raise

            return None

        # Return appropriate wrapper based on function type
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator


class ExternalBqExtractor:
    """
    Engine for External BigQuery Extraction (formerly BigQueryETLEngine)
    Reads data from external BigQuery source (e.g. customer project), optionally transforms via query, and loads to destination
    Supports schema templates, variable replacement, and table creation
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        # Templates now in configs/gcp/cost/schemas/ (Refactored)
        self.template_dir = Path(__file__).parent.parent.parent.parent.parent / "configs" / "gcp" / "cost" / "schemas"
        self.schema_templates = self._load_schema_templates()

    def _load_schema_templates(self) -> Dict[str, Any]:
        """Load schema templates from template directory"""
        # We renamed the file to billing_cost.json
        schema_file = self.template_dir / "billing_cost.json"
        if schema_file.exists():
            with open(schema_file, 'r') as f:
                # The original file had {"schemas": ...}. We should check if we kept that structure.
                # Assuming we just copied the file, it still has that structure.
                return json.load(f)
        return {"schemas": {}}

    def _get_schema_for_template(self, schema_name: str) -> Optional[List[bigquery.SchemaField]]:
        """Get BigQuery schema from template"""
        if schema_name not in self.schema_templates.get("schemas", {}):
            return None

        fields_data = self.schema_templates["schemas"][schema_name]["fields"]
        if not fields_data:  # Empty list means auto-detect
            return []

        schema = []
        for field in fields_data:
            schema.append(bigquery.SchemaField(
                name=field["name"],
                field_type=field["type"],
                mode=field.get("mode", "NULLABLE"),
                description=field.get("description", "")
            ))
        return schema if schema else []

    def _replace_variables(self, text: str, variables: Dict[str, Any]) -> str:
        """
        Replace {variable} placeholders in text for non-query strings (e.g., table names).

        WARNING: Do NOT use this for SQL queries - use _build_parameterized_query instead
        to prevent SQL injection.
        """
        result = text
        for key, value in variables.items():
            placeholder = f"{{{key}}}"
            result = result.replace(placeholder, str(value))
        return result

    def _build_parameterized_query(
        self,
        query_template: str,
        variables: Dict[str, Any]
    ) -> tuple:
        """
        Build a parameterized query for safe SQL execution.

        SECURITY: Prevents SQL injection by using BigQuery query parameters
        instead of string interpolation.

        Args:
            query_template: SQL query with {variable} placeholders
            variables: Dictionary of variable names to values

        Returns:
            Tuple of (parameterized_query, list_of_parameters)
        """
        return build_parameterized_query(query_template, variables)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute BigQuery to BigQuery transfer.

        Supports two credential modes:
        1. use_org_credentials: true → Use customer's GCP Service Account
        2. use_org_credentials: false/missing → Use CloudAct's default credentials

        Args:
            step_config: Step configuration from pipeline YAML containing:
                - source.use_org_credentials: If true, use customer's SA credentials
                - source.query: SQL query to execute
                - destination.table: Target table name
            context: Execution context (org_slug, pipeline_id, etc.)

        Returns:
            Execution result with metrics
        """
        # Extract configuration
        source = step_config.get("source", {})
        destination = step_config.get("destination", {})
        org_slug = context.get("org_slug")

        # Get variables for replacement
        # Combine: context variables + parameters + step-level variables
        variables = context.copy()
        # Add runtime parameters from context
        if 'parameters' in context:
            variables.update(context['parameters'])
        # Step-level variables have highest priority
        variables.update(step_config.get("variables", {}))

        # Add default date if not provided (critical for cost_billing pipeline)
        if 'date' not in variables:
            variables['date'] = date.today().isoformat()

        # Add system variables (project_id, etc.) for template substitution
        if 'gcp_project_id' not in variables:
            variables['gcp_project_id'] = self.settings.gcp_project_id
        if 'project_id' not in variables:
            variables['project_id'] = self.settings.gcp_project_id

        # Initialize SOURCE BigQuery client (customer's GCP or CloudAct's)
        # Handle string "true"/"false" values from YAML
        use_org_credentials_raw = source.get("use_org_credentials", False)
        if isinstance(use_org_credentials_raw, str):
            use_org_credentials = use_org_credentials_raw.lower() in ("true", "1", "yes")
        else:
            use_org_credentials = bool(use_org_credentials_raw)

        # Authenticate BEFORE query substitution to get integration metadata
        auth = None
        source_bq_client = None
        source_project_id = None

        if use_org_credentials:
            # Use customer's GCP Service Account credentials
            if not org_slug:
                raise ValueError("org_slug required when use_org_credentials is true")

            self.logger.info(
                "Using customer GCP credentials for source",
                extra={
                    "org_slug": org_slug,
                    "use_org_credentials": True
                }
            )

            auth = GCPAuthenticator(org_slug)
            source_bq_client = await auth.get_bigquery_client()
            source_project_id = auth.project_id  # Customer's project from SA

            # Add integration metadata to variables for query substitution
            # This provides billing_export_table and other customer-specific config
            # MT-FIX: Only allow specific metadata keys to prevent injection attacks
            # GCP Billing Export Table Types (configured in UI):
            # - billing_export_table: Standard export (gcp_billing_export_v1_*) - REQUIRED
            # - detailed_export_table: Resource export (gcp_billing_export_resource_v1_*) - Optional
            # - pricing_export_table: Pricing catalog (cloud_pricing_export) - Optional
            ALLOWED_METADATA_KEYS = {
                # GCP billing exports (primary)
                'billing_export_table',    # Standard billing export (REQUIRED for cost data)
                'detailed_export_table',   # Detailed/resource export (optional, resource-level data)
                'pricing_export_table',    # Pricing export (optional, pricing catalog)
                'committed_use_discount_table',  # CUD table (optional, for commitment analysis)
                # Multi-billing account support
                'additional_billing_accounts',  # Array of additional billing accounts
                'billing_dataset',         # GCP billing dataset (legacy)
                'billing_project',         # GCP billing project (if different from SA project)
                # AWS
                'cur_bucket',              # AWS CUR S3 bucket
                'cur_prefix',              # AWS CUR prefix
                # Azure
                'subscription_id',         # Azure subscription
                'resource_group',          # Azure resource group
                # OCI
                'compartment_id',          # OCI compartment
                'tenancy_ocid',            # OCI tenancy
            }
            if auth.metadata:
                allowed_metadata = {k: v for k, v in auth.metadata.items() if k in ALLOWED_METADATA_KEYS}
                blocked_keys = set(auth.metadata.keys()) - ALLOWED_METADATA_KEYS
                if blocked_keys:
                    self.logger.warning(
                        "Blocked potentially unsafe metadata keys",
                        extra={
                            "org_slug": org_slug,
                            "blocked_keys": list(blocked_keys)
                        }
                    )
                for key, value in allowed_metadata.items():
                    if key not in variables:
                        variables[key] = value
                self.logger.info(
                    "Added integration metadata to variables",
                    extra={
                        "org_slug": org_slug,
                        "metadata_keys": list(allowed_metadata.keys()),
                        "billing_export_table": auth.billing_export_table
                    }
                )
        else:
            # Use CloudAct's default credentials
            # Apply variable substitution to bq_project_id (handles {gcp_project_id} templates)
            raw_project_id = source.get("bq_project_id", self.settings.gcp_project_id)
            source_project_id = self._replace_variables(str(raw_project_id), variables)
            source_bq_client = BigQueryClient(project_id=source_project_id).client

        # Build query with variable substitution (AFTER credentials are loaded)
        # This ensures integration metadata (like billing_export_table) is available
        query_template = source.get("query", "")

        # MT-FIX: Validate date format before substitution to prevent SQL injection
        # Date must be YYYY-MM-DD format
        if 'date' in variables:
            date_str = str(variables['date'])
            import re
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
                raise ValueError(f"Invalid date format: {date_str}. Expected YYYY-MM-DD")

        # MT-FIX: Validate billing export tables format (must be project.dataset.table)
        def validate_export_table(table_name: str, table_path: str, required: bool = False) -> None:
            """Validate GCP billing export table path format."""
            if not table_path or table_path == 'None' or '{' in table_path:
                if required:
                    raise ValueError(
                        f"{table_name} is not configured. "
                        "Please configure the billing export table in Settings → Integrations → GCP → Billing Export Tables"
                    )
                return  # Skip validation for optional unconfigured tables

            if table_path.count('.') < 2:
                raise ValueError(f"Invalid {table_name} format: {table_path}. Expected project.dataset.table")
            # Check for path traversal attempts
            if '..' in table_path or table_path.startswith('/'):
                raise ValueError(f"Invalid {table_name}: path traversal detected")

        # Validate billing_export_table (REQUIRED)
        if 'billing_export_table' in variables:
            validate_export_table('billing_export_table', str(variables['billing_export_table']), required=True)

        # Validate detailed_export_table (optional)
        if 'detailed_export_table' in variables:
            validate_export_table('detailed_export_table', str(variables['detailed_export_table']), required=False)

        # Validate pricing_export_table (optional)
        if 'pricing_export_table' in variables:
            validate_export_table('pricing_export_table', str(variables['pricing_export_table']), required=False)

        # Validate committed_use_discount_table (optional)
        if 'committed_use_discount_table' in variables:
            validate_export_table('committed_use_discount_table', str(variables['committed_use_discount_table']), required=False)

        # MT-FIX: Pre-validate billing export table exists before executing query
        if use_org_credentials and 'billing_export_table' in variables:
            billing_table = str(variables['billing_export_table'])
            if billing_table and billing_table != 'None' and '{' not in billing_table:
                try:
                    table_parts = billing_table.split('.')
                    if len(table_parts) >= 3:
                        table_ref = f"{table_parts[0]}.{table_parts[1]}.{'.'.join(table_parts[2:])}"
                        source_bq_client.get_table(table_ref)
                        self.logger.info(
                            "Pre-validated billing export table exists",
                            extra={"table": billing_table, "org_slug": org_slug}
                        )
                except NotFound:
                    raise ValueError(
                        f"Billing export table not found: {billing_table}. "
                        "Please verify the table path in Settings → Integrations → GCP → Billing Export Tables. "
                        "Ensure the table exists and the Service Account has access."
                    )
                except Exception as e:
                    self.logger.warning(
                        f"Could not pre-validate billing table: {type(e).__name__}",
                        extra={"table": billing_table, "org_slug": org_slug}
                    )

        query = self._replace_variables(query_template, variables)
        query_params = []
        use_parameterized = False

        self.logger.info(
            "Query prepared with variable substitution",
            extra={"query_preview": query[:200], "org_slug": org_slug}
        )

        # Execute query on SOURCE (customer's GCP or CloudAct)
        self.logger.info(
            "Executing BigQuery query",
            extra={
                "query_preview": query[:100],
                "source_project": source_project_id,
                "use_org_credentials": use_org_credentials,
                "org_slug": org_slug,
                "pipeline_id": context.get("pipeline_id"),
                "step_id": context.get("step_id")
            }
        )

        # Execute query using source client with timeout configuration
        job_config = bigquery.QueryJobConfig()
        job_config.use_query_cache = True
        # Set job timeout and billing limit
        job_config.maximum_bytes_billed = 10 * 1024 * 1024 * 1024  # 10 GB limit

        # SECURITY: Use query parameters if available (prevents SQL injection)
        if use_parameterized and query_params:
            job_config.query_parameters = query_params
            self.logger.info(
                "Executing parameterized query",
                extra={"param_count": len(query_params), "org_slug": org_slug}
            )

        # GCP-005 FIX: Pre-check BigQuery quota before executing query
        try:
            # Check if we can list jobs (indicates quota is available)
            # This is a lightweight check that fails fast if quota exceeded
            list(source_bq_client.list_jobs(max_results=1, state_filter="RUNNING"))
            self.logger.debug(
                "BigQuery quota check passed",
                extra={"org_slug": org_slug, "source_project": source_project_id}
            )
        except core_exceptions.ResourceExhausted as e:
            self.logger.error(
                "BigQuery quota exceeded - cannot execute query",
                extra={
                    "org_slug": org_slug,
                    "source_project": source_project_id,
                    "error": str(e)
                }
            )
            raise ValueError(
                f"BigQuery quota exceeded for project {source_project_id}. "
                "Please wait and retry, or request quota increase in GCP Console."
            )
        except Exception as e:
            # Non-quota errors - log but continue (quota check is best-effort)
            self.logger.warning(
                f"BigQuery quota pre-check failed (non-blocking): {type(e).__name__}",
                extra={"org_slug": org_slug}
            )

        query_job = source_bq_client.query(query, job_config=job_config)
        job_id = query_job.job_id

        # GCP-010 FIX: Enhanced timeout logging with job details
        self.logger.info(
            "BigQuery job started",
            extra={
                "job_id": job_id,
                "org_slug": org_slug,
                "source_project": source_project_id,
                "timeout_seconds": 600
            }
        )

        # Wait for query to complete with timeout (10 minutes = 600 seconds)
        try:
            results = query_job.result(timeout=600)
            result_rows = [dict(row) for row in results]

            # Validate that we got results
            if not result_rows:
                return []
        except core_exceptions.ResourceExhausted as e:
            # GCP-005 FIX: Specific handling for quota exceeded during query
            self.logger.error(
                "BigQuery query failed due to quota exceeded",
                extra={
                    "job_id": job_id,
                    "org_slug": org_slug,
                    "source_project": source_project_id,
                    "error": str(e)
                }
            )
            raise ValueError(
                f"BigQuery quota exceeded during query execution. "
                f"Job ID: {job_id}. Please retry later or increase quota."
            )
        except Exception as e:
            # GCP-010 FIX: Enhanced error logging with job details
            error_type = type(e).__name__
            is_timeout = "timeout" in str(e).lower() or "deadline" in str(e).lower()

            self.logger.error(
                f"BigQuery query {'timed out' if is_timeout else 'failed'}",
                extra={
                    "job_id": job_id,
                    "org_slug": org_slug,
                    "source_project": source_project_id,
                    "error_type": error_type,
                    "error_message": str(e)[:500],
                    "is_timeout": is_timeout,
                    "query_preview": query[:200]
                },
                exc_info=True
            )

            if is_timeout:
                raise ValueError(
                    f"BigQuery query timed out after 10 minutes. "
                    f"Job ID: {job_id}. Consider filtering by smaller date range or optimizing query."
                )
            raise ValueError(f"BigQuery query failed: {str(e)}")

        row_count = len(result_rows)
        self.logger.info(
            "Query execution completed",
            extra={
                "row_count": row_count,
                "source_project": source_project_id,
                "org_slug": org_slug,
                "pipeline_id": context.get("pipeline_id")
            }
        )

        # Initialize DESTINATION BigQuery client (always CloudAct's credentials)
        dest_project = destination.get("bq_project_id", self.settings.gcp_project_id)
        dest_bq_client = BigQueryClient(project_id=dest_project)
        table = self._replace_variables(destination.get("table", ""), variables)

        # Build dataset name with environment suffix
        # Format: {org_slug}_{environment} (e.g., sri_482433_local, sri_482433_prod)
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        table_id = table

        full_table_id = f"{dest_project}.{dataset_id}.{table_id}"

        # Get schema template if specified
        schema_template_name = destination.get("schema_template")
        schema = None
        if schema_template_name:
            schema = self._get_schema_for_template(schema_template_name)
            self.logger.info(
                "Loading schema template",
                extra={
                    "schema_template": schema_template_name,
                    "field_count": len(schema) if schema else 0,
                    "org_slug": org_slug,
                    "pipeline_id": context.get("pipeline_id")
                }
            )

        # Ensure table exists with schema (using CloudAct credentials)
        self._ensure_table_exists(
            bq_client=dest_bq_client,
            project_id=dest_project,
            dataset_id=dataset_id,
            table_id=table_id,
            schema=schema
        )

        # Write data to DESTINATION (CloudAct's BQ)
        write_mode = destination.get("write_mode", "append")

        self.logger.info(
            "Writing data to CloudAct BigQuery",
            extra={
                "row_count": row_count,
                "source_project": source_project_id,
                "destination_table": full_table_id,
                "write_mode": write_mode,
                "org_slug": org_slug,
                "pipeline_id": context.get("pipeline_id")
            }
        )

        # Generate lineage metadata
        run_id = str(uuid.uuid4())
        pipeline_id = context.get("pipeline_id", "cloud_cost_gcp")
        credential_id = context.get("credential_id", "")
        pipeline_run_date = variables.get("date", date.today().isoformat())
        ingested_at = datetime.utcnow().isoformat()

        # Convert datetime objects to ISO format strings for JSON serialization
        # and add standardized lineage columns
        json_rows = []
        for row in result_rows:
            json_row = {}
            for key, value in row.items():
                if isinstance(value, (datetime, date)):
                    json_row[key] = value.isoformat()
                else:
                    json_row[key] = value
            # Add standardized lineage columns
            json_row["x_pipeline_id"] = pipeline_id
            json_row["x_credential_id"] = credential_id
            json_row["x_pipeline_run_date"] = pipeline_run_date
            json_row["x_run_id"] = run_id
            json_row["x_ingested_at"] = ingested_at
            json_rows.append(json_row)

        # Insert rows using load_table_from_json (more robust than insert_rows_json)
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND if write_mode == "append" else bigquery.WriteDisposition.WRITE_TRUNCATE,
        )

        # Convert to newline-delimited JSON format
        import io
        json_file = io.StringIO()
        for row in json_rows:
            import json as json_module
            json_file.write(json_module.dumps(row) + '\n')
        json_file.seek(0)

        # Write using CloudAct's credentials (dest_bq_client)
        load_job = dest_bq_client.client.load_table_from_file(
            json_file,
            full_table_id,
            job_config=job_config
        )

        # Wait for the load job to complete
        load_job.result()

        if load_job.errors:
            raise ValueError(f"Failed to load rows into {full_table_id}: {load_job.errors}")

        return {
            "status": "SUCCESS",
            "rows_processed": row_count,
            "source_project": source_project_id,
            "source_query": query[:200],
            "destination_table": full_table_id,
            "write_mode": write_mode,
            "schema_template": schema_template_name,
            "use_org_credentials": use_org_credentials
        }

    @retry_on_transient_error(max_retries=3, backoff_seconds=1)
    def _ensure_table_exists(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        dataset_id: str,
        table_id: str,
        schema: Optional[List[bigquery.SchemaField]] = None
    ):
        """Ensure destination table exists, create if needed (with retry on transient errors)"""
        full_table_id = f"{project_id}.{dataset_id}.{table_id}"

        try:
            # Check if table exists
            table = bq_client.client.get_table(full_table_id)
            self.logger.info(
                "BigQuery table already exists",
                extra={"table_id": full_table_id}
            )
        except NotFound:
            # Create table with schema
            self.logger.info(
                "Creating new BigQuery table",
                extra={
                    "table_id": full_table_id,
                    "schema_fields": len(schema) if schema else 0
                }
            )
            table = bigquery.Table(full_table_id, schema=schema)
            table = bq_client.client.create_table(table)
            self.logger.info(
                "BigQuery table created successfully",
                extra={"table_id": full_table_id}
            )


# Factory function to get engine instance
def get_engine():
    """Get ExternalBqExtractor instance"""
    return ExternalBqExtractor()
