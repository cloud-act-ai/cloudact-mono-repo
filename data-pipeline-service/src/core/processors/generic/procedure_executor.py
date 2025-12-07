"""
BigQuery Procedure Executor Processor
Part of 'Pipeline as Config' Architecture.

Executes stored procedures in BigQuery with dynamic parameters.
Designed for calling procedures in the organizations dataset that operate on per-org datasets.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import date, datetime
from google.cloud import bigquery

from src.app.config import get_settings
from src.core.engine.bq_client import BigQueryClient


class ProcedureExecutorProcessor:
    """
    Processor for executing BigQuery stored procedures.

    Configuration Example:
        processor: generic.procedure_executor
        config:
          procedure:
            name: sp_run_saas_subscription_costs_pipeline
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

        # 1. Get procedure details
        procedure_name = procedure_config.get("name")
        if not procedure_name:
            return {"status": "FAILED", "error": "procedure.name is required"}

        procedure_dataset = procedure_config.get("dataset", "organizations")

        # 2. Build context for parameter resolution
        project_id = self.settings.gcp_project_id
        org_dataset = self.settings.get_org_dataset_name(org_slug)

        # Build resolution context
        resolution_context = {
            "project_id": project_id,
            "org_slug": org_slug,
            "org_dataset": org_dataset,
            "dataset": org_dataset,  # Alias for convenience
            # Include pipeline parameters
            **context.get("parameters", {}),
            # Include step config values
            **config
        }

        # Handle date parameters - support both single date and date range
        if "date" in resolution_context and isinstance(resolution_context["date"], str):
            resolution_context["start_date"] = resolution_context.get("start_date", resolution_context["date"])
            resolution_context["end_date"] = resolution_context.get("end_date", resolution_context["date"])

        # 3. Build parameters list
        parameters_config = config.get("parameters", [])
        query_parameters = []

        for param in parameters_config:
            param_name = param.get("name")
            param_type = param.get("type", "STRING").upper()
            param_value = param.get("value")

            if not param_name:
                continue

            # Resolve value from context if it's a template variable
            resolved_value = self._resolve_value(param_value, resolution_context)

            if resolved_value is None:
                self.logger.warning(f"Parameter {param_name} resolved to None")
                continue

            # Convert to appropriate BigQuery parameter type
            bq_param = self._create_bq_parameter(param_name, param_type, resolved_value)
            if bq_param:
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

        # 5. Execute the procedure
        bq_client = BigQueryClient(project_id=project_id)

        job_config = bigquery.QueryJobConfig(
            query_parameters=query_parameters
        )

        try:
            query_job = bq_client.client.query(call_sql, job_config=job_config)

            # Wait for completion and get results
            results = list(query_job.result())

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

            return {
                "status": "SUCCESS",
                "procedure": procedure_name,
                "job_id": query_job.job_id,
                "results": result_data,
                "rows_returned": len(result_data),
                "org_slug": org_slug,
                "parameters": {p.name: str(p.value) for p in query_parameters}
            }

        except Exception as e:
            error_msg = str(e)
            self.logger.error(
                f"Procedure execution failed: {procedure_name}",
                exc_info=True,
                extra={
                    "procedure": procedure_name,
                    "org_slug": org_slug,
                    "error": error_msg
                }
            )
            return {
                "status": "FAILED",
                "procedure": procedure_name,
                "error": error_msg,
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
                # Convert string to date if needed
                if isinstance(value, str):
                    value = datetime.strptime(value, "%Y-%m-%d").date()
                elif isinstance(value, datetime):
                    value = value.date()
                return bigquery.ScalarQueryParameter(name, "DATE", value)

            elif param_type == "TIMESTAMP":
                if isinstance(value, str):
                    value = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return bigquery.ScalarQueryParameter(name, "TIMESTAMP", value)

            elif param_type == "INT64":
                return bigquery.ScalarQueryParameter(name, "INT64", int(value))

            elif param_type == "FLOAT64":
                return bigquery.ScalarQueryParameter(name, "FLOAT64", float(value))

            elif param_type == "BOOL":
                if isinstance(value, str):
                    value = value.lower() in ("true", "1", "yes")
                return bigquery.ScalarQueryParameter(name, "BOOL", bool(value))

            else:  # STRING and default
                return bigquery.ScalarQueryParameter(name, "STRING", str(value))

        except Exception as e:
            self.logger.error(f"Failed to create parameter {name}: {e}")
            return None


def get_engine():
    """Factory function for dynamic processor loading."""
    return ProcedureExecutorProcessor()
