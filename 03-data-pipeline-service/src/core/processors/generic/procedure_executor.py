"""
BigQuery Procedure Executor Processor
Part of 'Pipeline as Config' Architecture.

Executes stored procedures in BigQuery with dynamic parameters.
Designed for calling procedures in the organizations dataset that operate on per-org datasets.
"""

import logging
import re
import asyncio
from typing import Dict, Any, List, Optional
from datetime import date, datetime, timedelta
from google.cloud import bigquery
from google.api_core import retry
from google.api_core.exceptions import GoogleAPIError

from src.app.config import get_settings
from src.core.engine.bq_client import BigQueryClient
from src.core.utils.audit_logger import log_execute, AuditLogger

# Validation patterns for SQL injection prevention
PROCEDURE_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
PARAM_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
DATASET_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


class ProcedureExecutorProcessor:
    """
    Processor for executing BigQuery stored procedures.

    Configuration Example:
        processor: generic.procedure_executor
        config:
          procedure:
            name: sp_subscription_4_run_pipeline
            dataset: organizations  # Central dataset where procedure lives
            # Parameters are passed dynamically from pipeline context
          parameters:
            - name: p_project_id
              type: STRING
              value: "${project_id}"  # From context or config
            - name: p_dataset_id
              type: STRING
              value: "${org_dataset}"  # Resolved from org_slug
            - name: p_start_date
              type: DATE
              value: "${start_date}"  # From pipeline parameters
            - name: p_end_date
              type: DATE
              value: "${end_date}"  # From pipeline parameters

    Context Variables:
        - project_id: GCP project ID
        - org_slug: Organization slug
        - org_dataset: Full org dataset name ({org_slug}_{env})
        - start_date: Start date parameter
        - end_date: End date parameter
        - date: Single date parameter (for daily runs)
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a BigQuery stored procedure.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context including org_slug, parameters, etc.

        Returns:
            Dict with status, results, and metadata
        """
        org_slug = context.get("org_slug")
        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        config = step_config.get("config", {})
        procedure_config = config.get("procedure", {})

        # 1. Get and validate procedure details
        procedure_name = procedure_config.get("name")
        if not procedure_name:
            return {"status": "FAILED", "error": "procedure.name is required"}

        # SQL injection prevention - validate procedure name
        if not PROCEDURE_NAME_PATTERN.match(procedure_name):
            return {
                "status": "FAILED",
                "error": f"Invalid procedure name: {procedure_name}. Must match pattern [a-zA-Z_][a-zA-Z0-9_]*"
            }

        procedure_dataset = procedure_config.get("dataset", "organizations")

        # Validate dataset name
        if not DATASET_NAME_PATTERN.match(procedure_dataset):
            return {
                "status": "FAILED",
                "error": f"Invalid dataset name: {procedure_dataset}. Must match pattern [a-zA-Z_][a-zA-Z0-9_]*"
            }

        # 2. Build context for parameter resolution
        project_id = self.settings.gcp_project_id
        org_dataset = self.settings.get_org_dataset_name(org_slug)

        # Build resolution context
        resolution_context = {
            "project_id": project_id,
            "org_slug": org_slug,
            "org_dataset": org_dataset,
            "dataset": org_dataset,  # Alias for convenience
            # Include all top-level context values (start_date, end_date from API request)
            **{k: v for k, v in context.items() if k not in ("config", "step_config")},
            # Include nested pipeline parameters for backward compatibility
            **context.get("parameters", {}),
            # Include step config values
            **config
        }

        # Handle date parameters - support both single date and date range
        if "date" in resolution_context and isinstance(resolution_context["date"], str):
            resolution_context["start_date"] = resolution_context.get("start_date", resolution_context["date"])
            resolution_context["end_date"] = resolution_context.get("end_date", resolution_context["date"])

        # Validate date parameters
        start_date_str = resolution_context.get("start_date")
        end_date_str = resolution_context.get("end_date")

        if start_date_str and end_date_str:
            try:
                # Parse dates - handle both date objects and strings
                if isinstance(start_date_str, date):
                    start = start_date_str
                else:
                    start = datetime.strptime(str(start_date_str)[:10], "%Y-%m-%d").date()

                if isinstance(end_date_str, date):
                    end = end_date_str
                else:
                    end = datetime.strptime(str(end_date_str)[:10], "%Y-%m-%d").date()

                # Check if start_date is after end_date
                if start > end:
                    return {
                        "status": "FAILED",
                        "error": f"start_date ({start}) cannot be after end_date ({end})"
                    }

                # FIX: Max date range is 366 days (supports leap years, matches SQL procedure)
                date_diff = (end - start).days
                if date_diff > 366:
                    return {
                        "status": "FAILED",
                        "error": f"Date range too large ({date_diff} days). Maximum is 366 days (one year including leap year)."
                    }

                # Warn if dates are in the future
                today = date.today()
                if start > today:
                    self.logger.warning(f"start_date {start} is in the future")
                if end > today:
                    self.logger.warning(f"end_date {end} is in the future (projections may be inaccurate)")

            except ValueError as e:
                return {
                    "status": "FAILED",
                    "error": f"Invalid date format: {e}"
                }

        # 3. Build parameters list
        parameters_config = config.get("parameters", [])
        query_parameters = []

        for param in parameters_config:
            param_name = param.get("name")
            param_type = param.get("type", "STRING").upper()
            param_value = param.get("value")

            if not param_name or not param_name.strip():
                self.logger.warning("Skipping parameter with empty or whitespace name")
                continue

            # Validate parameter name to prevent SQL injection
            if not PARAM_NAME_PATTERN.match(param_name):
                return {
                    "status": "FAILED",
                    "error": f"Invalid parameter name: {param_name}. Must match pattern [a-zA-Z_][a-zA-Z0-9_]*"
                }

            # Resolve value from context if it's a template variable
            resolved_value = self._resolve_value(param_value, resolution_context)

            # Check for default value if resolved_value is None
            default_value = param.get("default")
            if resolved_value is None and default_value is not None:
                resolved_value = self._resolve_default_value(default_value, param_type)
                self.logger.info(f"Parameter {param_name} using default value: {resolved_value}")

            # Check if parameter is marked as optional
            is_optional = param.get("optional", False)

            if resolved_value is None:
                if is_optional:
                    bq_param = bigquery.ScalarQueryParameter(param_name, param_type, None)
                    query_parameters.append(bq_param)
                    continue  # Skip to next parameter after appending
                else:
                    self.logger.warning(f"Required parameter {param_name} resolved to None")
                    return {"status": "FAILED", "error": f"Missing required parameter: {param_name}"}

            # Convert to appropriate BigQuery parameter type
            bq_param = self._create_bq_parameter(param_name, param_type, resolved_value)
            if bq_param is None:
                return {
                    "status": "FAILED",
                    "error": f"Failed to convert parameter {param_name} to type {param_type}"
                }
            query_parameters.append(bq_param)

        # 4. Build CALL statement
        procedure_full_name = f"`{project_id}.{procedure_dataset}`.{procedure_name}"

        # Build parameter placeholders
        param_placeholders = ", ".join([f"@{p.name}" for p in query_parameters])

        call_sql = f"CALL {procedure_full_name}({param_placeholders})"

        self.logger.info(
            f"Executing procedure: {procedure_name} for org {org_slug}",
            extra={
                "procedure": procedure_name,
                "org_slug": org_slug,
                "parameters": {p.name: str(p.value) for p in query_parameters}
            }
        )

        # SEC-005: Audit logging - Log pipeline execution start
        run_id = context.get("run_id", "manual")
        pipeline_id = context.get("pipeline_id", f"procedure_{procedure_name}")
        await log_execute(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_PIPELINE,
            resource_id=pipeline_id,
            details={
                "run_id": run_id,
                "action": "START",
                "processor": "ProcedureExecutorProcessor",
                "procedure": procedure_name,
                "parameters": {p.name: str(p.value) for p in query_parameters}
            }
        )

        # 5. Execute the procedure with timeout and retry
        bq_client = BigQueryClient(project_id=project_id)

        # Get timeout from step config (default 10 minutes, min 1 minute, max 60 minutes)
        raw_timeout = step_config.get("timeout_minutes", 10)
        if not isinstance(raw_timeout, (int, float)) or raw_timeout <= 0:
            self.logger.warning(
                f"Invalid timeout_minutes={raw_timeout}, using default of 10",
                extra={"procedure": procedure_name, "org_slug": org_slug}
            )
            raw_timeout = 10
        timeout_minutes = max(1, min(raw_timeout, 60))  # Clamp to [1, 60]
        timeout_ms = int(timeout_minutes * 60 * 1000)

        job_config = bigquery.QueryJobConfig(
            query_parameters=query_parameters,
            job_timeout_ms=timeout_ms
        )

        try:
            # Use asyncio to run blocking BigQuery calls in executor
            loop = asyncio.get_event_loop()

            # Execute query with retry for transient errors
            @retry.Retry(
                predicate=retry.if_transient_error,
                initial=1.0,
                maximum=10.0,
                multiplier=2.0,
                deadline=timeout_minutes * 60
            )
            def execute_query():
                return bq_client.client.query(call_sql, job_config=job_config)

            query_job = await loop.run_in_executor(None, execute_query)

            # Wait for completion in executor
            def get_results():
                return list(query_job.result(timeout=timeout_minutes * 60))

            results = await loop.run_in_executor(None, get_results)

            # Parse result rows if any
            result_data = []
            for row in results:
                result_data.append(dict(row))

            self.logger.info(
                f"Procedure {procedure_name} completed successfully",
                extra={
                    "job_id": query_job.job_id,
                    "org_slug": org_slug,
                    "result_rows": len(result_data)
                }
            )

            # SEC-005: Audit logging - Log successful completion
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_SUCCESS,
                details={
                    "run_id": run_id,
                    "procedure": procedure_name,
                    "job_id": query_job.job_id,
                    "rows_returned": len(result_data)
                }
            )

            return {
                "status": "SUCCESS",
                "procedure": procedure_name,
                "job_id": query_job.job_id,
                "results": result_data,
                "rows_returned": len(result_data),
                "org_slug": org_slug,
                "parameters": {p.name: str(p.value) for p in query_parameters}
            }

        except GoogleAPIError as e:
            error_msg = str(e)
            self.logger.error(
                f"BigQuery API error executing procedure: {procedure_name}",
                exc_info=True,
                extra={
                    "procedure": procedure_name,
                    "org_slug": org_slug,
                    "error": error_msg,
                    "error_type": type(e).__name__
                }
            )

            # SEC-005: Audit logging - Log failure
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_FAILURE,
                error_message=error_msg,
                details={"run_id": run_id, "procedure": procedure_name, "error_type": "BigQueryAPIError"}
            )

            return {
                "status": "FAILED",
                "procedure": procedure_name,
                "error": error_msg,
                "error_type": "BigQueryAPIError",
                "org_slug": org_slug
            }

        except asyncio.TimeoutError:
            error_msg = f"Procedure execution timed out after {timeout_minutes} minutes"
            self.logger.error(
                error_msg,
                extra={
                    "procedure": procedure_name,
                    "org_slug": org_slug,
                    "timeout_minutes": timeout_minutes
                }
            )

            # SEC-005: Audit logging - Log timeout failure
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_FAILURE,
                error_message=error_msg,
                details={"run_id": run_id, "procedure": procedure_name, "error_type": "Timeout"}
            )

            return {
                "status": "FAILED",
                "procedure": procedure_name,
                "error": error_msg,
                "error_type": "Timeout",
                "org_slug": org_slug
            }

        except Exception as e:
            error_msg = str(e)
            self.logger.error(
                f"Procedure execution failed: {procedure_name}",
                exc_info=True,
                extra={
                    "procedure": procedure_name,
                    "org_slug": org_slug,
                    "error": error_msg,
                    "error_type": type(e).__name__
                }
            )

            # SEC-005: Audit logging - Log general failure
            await log_execute(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_PIPELINE,
                resource_id=pipeline_id,
                status=AuditLogger.STATUS_FAILURE,
                error_message=error_msg,
                details={"run_id": run_id, "procedure": procedure_name, "error_type": type(e).__name__}
            )
            return {
                "status": "FAILED",
                "procedure": procedure_name,
                "error": error_msg,
                "error_type": type(e).__name__,
                "org_slug": org_slug
            }

    def _resolve_value(self, value: Any, context: Dict[str, Any]) -> Any:
        """
        Resolve a value from context if it's a template variable.

        Supports:
            - "${variable}" - Direct variable substitution
            - "literal" - Return as-is
        """
        if value is None:
            return None

        if not isinstance(value, str):
            return value

        # Check for template variable ${var}
        if value.startswith("${") and value.endswith("}"):
            var_name = value[2:-1]
            return context.get(var_name)

        # Return literal value
        return value

    def _resolve_default_value(self, default: str, param_type: str) -> Any:
        """
        Resolve special default values for parameters.

        Supports:
            - "TODAY" - Current date
            - "MONTH_START" - First day of current month
            - "MONTH_END" - Last day of current month
            - "YEAR_START" - First day of current year
            - Date string like "2025-01-01" - Parsed as-is
        """
        today = date.today()

        if default.upper() == "TODAY":
            return today
        elif default.upper() == "MONTH_START":
            return today.replace(day=1)
        elif default.upper() == "MONTH_END":
            # Get last day of month
            if today.month == 12:
                return date(today.year + 1, 1, 1) - timedelta(days=1)
            else:
                return date(today.year, today.month + 1, 1) - timedelta(days=1)
        elif default.upper() == "YEAR_START":
            return date(today.year, 1, 1)
        elif default.upper() == "YEAR_END":
            return date(today.year, 12, 31)
        else:
            # Return as-is (will be parsed by _create_bq_parameter)
            return default

    def _create_bq_parameter(
        self,
        name: str,
        param_type: str,
        value: Any
    ) -> Optional[bigquery.ScalarQueryParameter]:
        """
        Create a BigQuery query parameter with proper type conversion.

        Args:
            name: Parameter name
            param_type: BigQuery type (STRING, DATE, INT64, FLOAT64, BOOL)
            value: Parameter value

        Returns:
            BigQuery ScalarQueryParameter or None if invalid
        """
        try:
            if param_type == "DATE":
                # Convert string to date if needed - support multiple formats
                if isinstance(value, str):
                    # Try ISO 8601 format with time first
                    if 'T' in value:
                        value = datetime.fromisoformat(value.replace("Z", "+00:00")).date()
                    else:
                        value = datetime.strptime(value, "%Y-%m-%d").date()
                elif isinstance(value, datetime):
                    value = value.date()
                elif not isinstance(value, date):
                    raise ValueError(f"Cannot convert {type(value).__name__} to DATE")
                return bigquery.ScalarQueryParameter(name, "DATE", value)

            elif param_type == "TIMESTAMP":
                if isinstance(value, str):
                    value = datetime.fromisoformat(value.replace("Z", "+00:00"))
                elif not isinstance(value, datetime):
                    raise ValueError(f"Cannot convert {type(value).__name__} to TIMESTAMP")
                return bigquery.ScalarQueryParameter(name, "TIMESTAMP", value)

            elif param_type == "INT64":
                if isinstance(value, float) and not value.is_integer():
                    raise ValueError(f"Cannot convert float {value} to INT64 (has decimal)")
                return bigquery.ScalarQueryParameter(name, "INT64", int(value))

            elif param_type == "FLOAT64":
                return bigquery.ScalarQueryParameter(name, "FLOAT64", float(value))

            elif param_type == "BOOL":
                if isinstance(value, str):
                    value = value.lower() in ("true", "1", "yes")
                return bigquery.ScalarQueryParameter(name, "BOOL", bool(value))

            else:  # STRING and default
                return bigquery.ScalarQueryParameter(name, "STRING", str(value))

        except (ValueError, TypeError) as e:
            self.logger.error(
                f"Failed to create parameter {name}: {e}",
                extra={
                    "param_name": name,
                    "param_type": param_type,
                    "value_type": type(value).__name__
                }
            )
            return None


def get_engine():
    """Factory function for dynamic processor loading."""
    return ProcedureExecutorProcessor()
