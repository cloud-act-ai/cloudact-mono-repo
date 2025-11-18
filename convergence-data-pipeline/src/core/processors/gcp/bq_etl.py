"""
BigQuery ETL Engine (GCP)
Processes gcp.bq_etl ps_type for extract-transform-load operations with schema template support
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, date
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class BigQueryETLEngine:
    """
    Engine for BigQuery ETL (Extract-Transform-Load) operations
    Reads data from BigQuery source, optionally transforms via query, and loads to destination
    Supports schema templates, variable replacement, and table creation
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        # Templates are now at project root level, same as configs/
        self.template_dir = Path(__file__).parent.parent.parent.parent.parent / "ps_templates" / "gcp" / "bq_etl"
        self.schema_templates = self._load_schema_templates()

    def _load_schema_templates(self) -> Dict[str, Any]:
        """Load schema templates from template directory"""
        schema_file = self.template_dir / "schema_template.json"
        if schema_file.exists():
            with open(schema_file, 'r') as f:
                return json.load(f)
        return {"schemas": {}}

    def _get_schema_for_template(self, schema_name: str) -> Optional[List[bigquery.SchemaField]]:
        """Get BigQuery schema from template"""
        if schema_name not in self.schema_templates.get("schemas", {}):
            return None

        fields_data = self.schema_templates["schemas"][schema_name]["fields"]
        if not fields_data:  # Empty list means auto-detect
            return None

        schema = []
        for field in fields_data:
            schema.append(bigquery.SchemaField(
                name=field["name"],
                field_type=field["type"],
                mode=field.get("mode", "NULLABLE"),
                description=field.get("description", "")
            ))
        return schema

    def _replace_variables(self, text: str, variables: Dict[str, Any]) -> str:
        """Replace {variable} placeholders in text"""
        result = text
        for key, value in variables.items():
            placeholder = f"{{{key}}}"
            result = result.replace(placeholder, str(value))
        return result

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute BigQuery to BigQuery transfer

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context (tenant_id, pipeline_id, etc.)

        Returns:
            Execution result with metrics
        """
        # Extract configuration
        source = step_config.get("source", {})
        destination = step_config.get("destination", {})

        # Get variables for replacement
        variables = context.copy()
        variables.update(step_config.get("variables", {}))

        # Replace variables in query
        query = source.get("query", "")
        query = self._replace_variables(query, variables)

        # Initialize BigQuery client
        bq_client = BigQueryClient(
            project_id=source.get("bq_project_id", self.settings.gcp_project_id)
        )

        # Execute query
        self.logger.info(
            "Executing BigQuery query",
            extra={
                "query_preview": query[:100],
                "tenant_id": context.get("tenant_id"),
                "pipeline_id": context.get("pipeline_id"),
                "step_id": context.get("step_id")
            }
        )
        result_rows = bq_client.query_to_list(query)

        row_count = len(result_rows)
        self.logger.info(
            "Query execution completed",
            extra={
                "row_count": row_count,
                "tenant_id": context.get("tenant_id"),
                "pipeline_id": context.get("pipeline_id")
            }
        )

        # Get destination details and replace variables
        dest_project = destination.get("bq_project_id", self.settings.gcp_project_id)
        tenant_id = context.get("tenant_id")
        dataset_type = self._replace_variables(destination.get("dataset_type", "gcp"), variables)
        table = self._replace_variables(destination.get("table", ""), variables)

        # Build dataset name
        dataset_id = f"{tenant_id}_{dataset_type}" if dataset_type != "tenant" else tenant_id
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
                    "tenant_id": context.get("tenant_id"),
                    "pipeline_id": context.get("pipeline_id")
                }
            )

        # Ensure table exists with schema
        self._ensure_table_exists(
            bq_client=bq_client,
            project_id=dest_project,
            dataset_id=dataset_id,
            table_id=table_id,
            schema=schema
        )

        # Write data
        write_mode = destination.get("write_mode", "append")

        self.logger.info(
            "Writing data to BigQuery table",
            extra={
                "row_count": row_count,
                "destination_table": full_table_id,
                "write_mode": write_mode,
                "tenant_id": context.get("tenant_id"),
                "pipeline_id": context.get("pipeline_id")
            }
        )

        # Convert datetime objects to ISO format strings for JSON serialization
        json_rows = []
        for row in result_rows:
            json_row = {}
            for key, value in row.items():
                if isinstance(value, (datetime, date)):
                    json_row[key] = value.isoformat()
                else:
                    json_row[key] = value
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

        load_job = bq_client.client.load_table_from_file(
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
            "source_query": query[:200],
            "destination_table": full_table_id,
            "write_mode": write_mode,
            "schema_template": schema_template_name
        }

    def _ensure_table_exists(
        self,
        bq_client: BigQueryClient,
        project_id: str,
        dataset_id: str,
        table_id: str,
        schema: Optional[List[bigquery.SchemaField]] = None
    ):
        """Ensure destination table exists, create if needed"""
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
    """Get BigQueryETLEngine instance"""
    return BigQueryETLEngine()
