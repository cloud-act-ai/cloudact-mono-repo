"""
BigQuery to BigQuery Engine (GCP)
Processes gcp.bigquery_to_bigquery ps_type with schema template support
"""
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from google.cloud import bigquery
from google.cloud.exceptions import NotFound
import polars as pl

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class BigQueryToBigQueryEngine:
    """
    Engine for processing BigQuery to BigQuery data transfers
    Supports schema templates, variable replacement, and table creation
    """

    def __init__(self):
        self.settings = get_settings()
        self.template_dir = Path(__file__).parent.parent.parent / "templates" / "gcp" / "bigquery_to_bigquery"
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
        print(f"[GCP BQ Engine] Executing query: {query[:100]}...")
        result_df = await bq_client.execute_query(query)

        row_count = len(result_df)
        print(f"[GCP BQ Engine] Query returned {row_count} rows")

        # Get destination details
        dest_project = destination.get("bq_project_id", self.settings.gcp_project_id)
        tenant_id = context.get("tenant_id")
        dataset_type = destination.get("dataset_type", "gcp")

        # Build dataset name
        dataset_id = f"{tenant_id}_{dataset_type}" if dataset_type != "tenant" else tenant_id
        table_id = destination.get("table")

        full_table_id = f"{dest_project}.{dataset_id}.{table_id}"

        # Get schema template if specified
        schema_template_name = destination.get("schema_template")
        schema = None
        if schema_template_name:
            schema = self._get_schema_for_template(schema_template_name)
            print(f"[GCP BQ Engine] Using schema template: {schema_template_name}")

        # Ensure table exists with schema
        await self._ensure_table_exists(
            bq_client=bq_client,
            project_id=dest_project,
            dataset_id=dataset_id,
            table_id=table_id,
            schema=schema
        )

        # Write data
        write_mode = destination.get("write_mode", "append")

        print(f"[GCP BQ Engine] Writing {row_count} rows to {full_table_id} (mode: {write_mode})")

        await bq_client.write_dataframe(
            df=result_df,
            dataset_id=dataset_id,
            table_id=table_id,
            write_mode=write_mode,
            schema=schema
        )

        return {
            "status": "SUCCESS",
            "rows_processed": row_count,
            "source_query": query[:200],
            "destination_table": full_table_id,
            "write_mode": write_mode,
            "schema_template": schema_template_name
        }

    async def _ensure_table_exists(
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
            print(f"[GCP BQ Engine] Table {full_table_id} already exists")
        except NotFound:
            # Create table with schema
            print(f"[GCP BQ Engine] Creating table {full_table_id}")
            table = bigquery.Table(full_table_id, schema=schema)
            table = bq_client.client.create_table(table)
            print(f"[GCP BQ Engine] Table {full_table_id} created successfully")


# Factory function to get engine instance
def get_engine():
    """Get BigQueryToBigQueryEngine instance"""
    return BigQueryToBigQueryEngine()
