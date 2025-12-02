"""
Generic BigQuery Transformer Processor
Part of 'Pipeline as Config' Architecture.

Executes SQL transformations defined in YAML configuration.
Supports Jinja2 templating for dynamic SQL generation.
"""

import logging
from typing import Dict, Any
from google.cloud import bigquery
from jinja2 import Template

from src.app.config import get_settings
from src.core.engine.bq_client import BigQueryClient

class LocalBqTransformerProcessor:
    """
    Generic processor for executing SQL transformations within the local BigQuery project.
    
    Configuration:
        transformation:
            type: "sql_template"
            sql: "SELECT * FROM ..."
        destination:
            table: "target_table"
            mode: "overwrite" | "append"
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
        Execute the SQL transformation.
        """
        org_slug = context.get("org_slug")
        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        config = step_config.get("config", {})
        transformation = step_config.get("transformation", {})
        destination = step_config.get("destination", {})

        # 1. Validate Config
        if transformation.get("type") != "sql_template":
            return {"status": "FAILED", "error": "Only 'sql_template' transformation type is supported"}
        
        raw_sql = transformation.get("sql")
        if not raw_sql:
            return {"status": "FAILED", "error": "Missing 'sql' in transformation config"}

        dest_table = destination.get("table")
        if not dest_table:
            return {"status": "FAILED", "error": "Missing 'table' in destination config"}

        write_disposition = bigquery.WriteDisposition.WRITE_TRUNCATE
        if destination.get("mode") == "append":
            write_disposition = bigquery.WriteDisposition.WRITE_APPEND

        # 2. Prepare Context for Templating
        # Inject project_id, dataset_id, and org_slug for template usage
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        template_context = {
            "project": self.settings.gcp_project_id,
            "dataset": dataset_id,
            "org_slug": org_slug,
            **config  # Allow passing arbitrary config vars to template
        }

        # 3. Render SQL
        try:
            template = Template(raw_sql)
            rendered_sql = template.render(**template_context)
        except Exception as e:
            return {"status": "FAILED", "error": f"SQL Template rendering failed: {str(e)}"}

        self.logger.info(f"Executing BQ Transformation for {org_slug} -> {dest_table}")
        
        # 4. Execute Query and Write to Destination
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)
        
        dest_table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{dest_table}"
        
        job_config = bigquery.QueryJobConfig(
            destination=dest_table_id,
            write_disposition=write_disposition,
            # Ensure we use the org's location if needed, usually defaults to client's
        )

        try:
            query_job = bq_client.client.query(rendered_sql, job_config=job_config)
            result = query_job.result()  # Wait for job to complete
            
            return {
                "status": "SUCCESS",
                "rows_affected": query_job.num_dml_affected_rows or 0, # Note: num_dml_affected_rows might be None for CREATE/SELECT INTO
                "destination_table": dest_table_id,
                "job_id": query_job.job_id
            }

        except Exception as e:
            self.logger.error(f"BQ Execution failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

def get_engine():
    return LocalBqTransformerProcessor()
