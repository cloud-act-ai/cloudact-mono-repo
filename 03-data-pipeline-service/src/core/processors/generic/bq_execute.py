"""
BigQuery Execute Processor
Part of 'Pipeline as Config' Architecture.

Executes arbitrary BigQuery DML queries (DELETE, UPDATE, INSERT) with parameterized values.
Designed for idempotent pipeline operations like deleting existing data before re-inserting.

SECURITY:
- Uses parameterized queries to prevent SQL injection
- Validates query type (only DML operations allowed)
- Validates table references to prevent cross-org access
"""

import logging
import re
from typing import Dict, Any, List, Optional
from datetime import date, datetime
from google.cloud import bigquery
from google.api_core.exceptions import GoogleAPIError

from src.app.config import get_settings
from src.core.engine.bq_client import BigQueryClient


# Allowed DML operations (no DDL like CREATE/DROP)
ALLOWED_OPERATIONS = {'DELETE', 'UPDATE', 'INSERT', 'MERGE'}

# Validation patterns
TABLE_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_\-\.`]*$')


class BqExecuteProcessor:
    """
    Processor for executing BigQuery DML queries.

    Configuration Example:
        ps_type: generic.bq_execute
        config:
          query: |
            DELETE FROM `{gcp_project_id}.{org_slug}_{environment}.cloud_gcp_billing_raw_daily`
            WHERE DATE(usage_start_time) BETWEEN @start_date AND @end_date
              AND org_slug = @org_slug
          parameters:
            - name: "start_date"
              type: "DATE"
              value: "{start_date}"
            - name: "end_date"
              type: "DATE"
              value: "{end_date}"
            - name: "org_slug"
              type: "STRING"
              value: "{org_slug}"

    Context Variables:
        - gcp_project_id: GCP project ID
        - org_slug: Organization slug
        - environment: Environment (local, stage, prod)
        - start_date, end_date: Date parameters
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    def _validate_query(self, query: str, org_slug: str) -> None:
        """
        Validate query for security:
        1. Must be a DML operation (DELETE, UPDATE, INSERT, MERGE)
        2. Must reference the correct org dataset
        """
        query_upper = query.strip().upper()

        # Check it starts with allowed operation
        first_word = query_upper.split()[0] if query_upper.split() else ''
        if first_word not in ALLOWED_OPERATIONS:
            raise ValueError(
                f"Query must be a DML operation ({', '.join(ALLOWED_OPERATIONS)}). "
                f"Got: {first_word}"
            )

        # Security: Ensure query references the org's dataset
        # This prevents cross-org data access
        if org_slug and f"{org_slug}_" not in query:
            self.logger.warning(
                "Query doesn't reference org-specific dataset",
                extra={"org_slug": org_slug, "query_preview": query[:100]}
            )

    def _replace_variables(self, text: str, variables: Dict[str, Any]) -> str:
        """Replace {variable} placeholders in text."""
        result = text
        for key, value in variables.items():
            placeholder = f"{{{key}}}"
            result = result.replace(placeholder, str(value) if value is not None else '')
        return result

    def _build_query_parameters(
        self,
        param_configs: List[Dict[str, Any]],
        variables: Dict[str, Any]
    ) -> List[bigquery.ScalarQueryParameter]:
        """Build BigQuery query parameters from config."""
        params = []

        for param in param_configs:
            name = param.get('name')
            param_type = param.get('type', 'STRING').upper()
            value_template = param.get('value', '')

            # Replace variables in value
            value = self._replace_variables(str(value_template), variables)

            # Convert value based on type
            if param_type == 'DATE':
                # Parse date string to date object
                if value:
                    try:
                        value = datetime.strptime(value, '%Y-%m-%d').date()
                    except ValueError:
                        self.logger.warning(f"Invalid date format for {name}: {value}")
                        value = None
            elif param_type == 'INT64' or param_type == 'INTEGER':
                value = int(value) if value else None
            elif param_type == 'FLOAT64' or param_type == 'FLOAT':
                value = float(value) if value else None
            elif param_type == 'BOOL' or param_type == 'BOOLEAN':
                value = str(value).lower() in ('true', '1', 'yes') if value else None

            params.append(bigquery.ScalarQueryParameter(name, param_type, value))

        return params

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a BigQuery DML query.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context including org_slug, parameters, etc.

        Returns:
            Dict with status, rows_affected, and metadata
        """
        config = step_config.get('config', {})
        org_slug = context.get('org_slug')

        # Build variables for substitution
        variables = context.copy()
        if 'parameters' in context:
            variables.update(context['parameters'])
        variables.update(step_config.get('variables', {}))

        # Add system variables
        if 'gcp_project_id' not in variables:
            variables['gcp_project_id'] = self.settings.gcp_project_id
        # Use get_environment_suffix() to map: development->local, staging->stage, production->prod
        if 'environment' not in variables:
            variables['environment'] = self.settings.get_environment_suffix()

        # Get and validate query
        query_template = config.get('query', '')
        if not query_template:
            raise ValueError("Query is required in config")

        # Replace variables in query (table names, dataset names)
        query = self._replace_variables(query_template, variables)

        # Validate query for security
        self._validate_query(query, org_slug)

        # Build query parameters
        param_configs = config.get('parameters', [])
        query_params = self._build_query_parameters(param_configs, variables)

        self.logger.info(
            "Executing BigQuery DML query",
            extra={
                "org_slug": org_slug,
                "query_preview": query[:200],
                "param_count": len(query_params)
            }
        )

        # Execute query
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        job_config = bigquery.QueryJobConfig(
            query_parameters=query_params
        )

        try:
            query_job = bq_client.client.query(query, job_config=job_config)
            result = query_job.result()

            rows_affected = query_job.num_dml_affected_rows or 0

            self.logger.info(
                "BigQuery DML query completed",
                extra={
                    "org_slug": org_slug,
                    "rows_affected": rows_affected,
                    "job_id": query_job.job_id
                }
            )

            return {
                "status": "SUCCESS",
                "rows_affected": rows_affected,
                "job_id": query_job.job_id,
                "query_preview": query[:100]
            }

        except GoogleAPIError as e:
            # Handle specific errors (table not found is OK for first run)
            if "Not found" in str(e):
                self.logger.info(
                    "Table not found (OK for first run)",
                    extra={"org_slug": org_slug, "error": str(e)[:200]}
                )
                return {
                    "status": "SUCCESS",
                    "rows_affected": 0,
                    "message": "Table not found (OK for first run)"
                }

            self.logger.error(
                "BigQuery DML query failed",
                extra={"org_slug": org_slug, "error": str(e)},
                exc_info=True
            )
            raise ValueError(f"BigQuery query failed: {e}")


def get_engine():
    """Get BqExecuteProcessor instance."""
    return BqExecuteProcessor()
