"""
Generic BigQuery Data Loader Processor
Part of 'Pipeline as Config' Architecture.

Loads data from pipeline context (extracted rows) into BigQuery tables.
Supports schema templates, partitioning, and clustering.

ps_type: generic.bq_loader
"""

import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

from google.cloud import bigquery
from google.cloud.bigquery import SchemaField

from src.app.config import get_settings
from src.core.engine.bq_client import BigQueryClient

logger = logging.getLogger(__name__)


class BQLoader:
    """
    Generic processor for loading extracted data into BigQuery tables.

    Reads data from context["extracted_data"] and writes to destination table.

    Configuration:
        destination_table: "{org_slug}_prod.aws_billing_cost_daily"
        write_disposition: "WRITE_APPEND" | "WRITE_TRUNCATE"
        partition_field: "usage_date"
        schema_template: "aws_billing_cost"  # References schema JSON file
        table_config:
          time_partitioning:
            field: "usage_date"
            type: "DAY"
          clustering_fields: ["region", "service_code"]
    """

    def __init__(self, org_slug: str = None):
        self.settings = get_settings()
        self.org_slug = org_slug
        self._bq_client: Optional[BigQueryClient] = None

    @property
    def bq_client(self) -> BigQueryClient:
        if not self._bq_client:
            self._bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)
        return self._bq_client

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Load extracted data into BigQuery table.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Pipeline context containing extracted_data

        Returns:
            Dict with status and metadata
        """
        org_slug = context.get("org_slug") or self.org_slug
        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        config = step_config.get("config", {})

        # Get extracted data from context
        extracted_data = context.get("extracted_data", [])
        if not extracted_data:
            logger.warning(f"No data to load for {org_slug}")
            return {
                "status": "SUCCESS",
                "rows_loaded": 0,
                "message": "No data to load"
            }

        # Parse destination table
        dest_table_raw = config.get("destination_table", "")
        if not dest_table_raw:
            return {"status": "FAILED", "error": "destination_table is required"}

        # Replace {org_slug} placeholder
        dest_table_raw = dest_table_raw.replace("{org_slug}", org_slug)

        # Construct full table ID
        if "." not in dest_table_raw:
            dataset_id = self.settings.get_org_dataset_name(org_slug)
            dest_table_id = f"{self.settings.gcp_project_id}.{dataset_id}.{dest_table_raw}"
        elif dest_table_raw.count(".") == 1:
            # dataset.table format
            dest_table_id = f"{self.settings.gcp_project_id}.{dest_table_raw}"
        else:
            # Full project.dataset.table format
            dest_table_id = dest_table_raw

        # Determine write disposition
        write_disposition_str = config.get("write_disposition", "WRITE_APPEND")
        write_disposition = getattr(
            bigquery.WriteDisposition,
            write_disposition_str,
            bigquery.WriteDisposition.WRITE_APPEND
        )

        logger.info(
            f"Loading {len(extracted_data)} rows to {dest_table_id}",
            extra={"org_slug": org_slug, "write_disposition": write_disposition_str}
        )

        try:
            # Get or create table with schema
            table = await self._ensure_table_exists(
                dest_table_id,
                config,
                extracted_data[0] if extracted_data else {}
            )

            # Load data
            rows_loaded = await self._load_data(
                dest_table_id,
                extracted_data,
                write_disposition,
                config.get("partition_field")
            )

            return {
                "status": "SUCCESS",
                "rows_loaded": rows_loaded,
                "destination_table": dest_table_id,
                "write_disposition": write_disposition_str
            }

        except Exception as e:
            logger.error(f"BQ Load failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    async def _ensure_table_exists(
        self,
        table_id: str,
        config: Dict[str, Any],
        sample_row: Dict[str, Any]
    ) -> bigquery.Table:
        """Ensure destination table exists with correct schema."""
        try:
            table = self.bq_client.client.get_table(table_id)
            return table
        except Exception:
            # Table doesn't exist, create it
            pass

        # Build schema from sample data or schema template
        schema_template = config.get("schema_template")
        if schema_template:
            schema = await self._load_schema_template(schema_template, config)
        else:
            schema = self._infer_schema(sample_row)

        # Create table with partitioning and clustering
        table = bigquery.Table(table_id, schema=schema)

        table_config = config.get("table_config", {})

        # Time partitioning
        time_partitioning = table_config.get("time_partitioning", {})
        if time_partitioning:
            partition_type = getattr(
                bigquery.TimePartitioningType,
                time_partitioning.get("type", "DAY"),
                bigquery.TimePartitioningType.DAY
            )
            table.time_partitioning = bigquery.TimePartitioning(
                type_=partition_type,
                field=time_partitioning.get("field"),
                expiration_ms=time_partitioning.get("expiration_days", 730) * 24 * 60 * 60 * 1000
                if time_partitioning.get("expiration_days") else None
            )

        # Clustering
        clustering_fields = table_config.get("clustering_fields", [])
        if clustering_fields:
            table.clustering_fields = clustering_fields

        table = self.bq_client.client.create_table(table, exists_ok=True)
        logger.info(f"Created table {table_id}")
        return table

    async def _load_schema_template(
        self,
        template_name: str,
        config: Dict[str, Any]
    ) -> List[SchemaField]:
        """Load schema from template JSON file."""
        import os

        # Find schema file based on provider/domain from config
        # Schema files are in configs/{provider}/cost/schemas/{template_name}.json
        provider = config.get("provider", "generic")
        domain = config.get("domain", "cost")

        # Try multiple locations
        possible_paths = [
            f"configs/cloud/{provider}/{domain}/schemas/{template_name}.json",
            f"configs/cloud/{provider}/schemas/{template_name}.json",
            f"configs/{provider}/{domain}/schemas/{template_name}.json",
            f"configs/{provider}/schemas/{template_name}.json",
        ]

        schema_file = None
        for path in possible_paths:
            if os.path.exists(path):
                schema_file = path
                break

        if not schema_file:
            logger.warning(f"Schema template {template_name} not found, inferring schema")
            return []

        try:
            with open(schema_file, 'r') as f:
                schema_data = json.load(f)

            schemas = schema_data.get("schemas", {})
            template_schema = schemas.get(template_name, schemas.get("default", {}))
            fields = template_schema.get("fields", [])

            return [
                SchemaField(
                    name=f["name"],
                    field_type=f.get("type", "STRING"),
                    mode=f.get("mode", "NULLABLE"),
                    description=f.get("description", "")
                )
                for f in fields
            ]
        except Exception as e:
            logger.warning(f"Failed to load schema template: {e}")
            return []

    def _infer_schema(self, sample_row: Dict[str, Any]) -> List[SchemaField]:
        """Infer schema from sample row."""
        schema = []
        for key, value in sample_row.items():
            if isinstance(value, bool):
                field_type = "BOOLEAN"
            elif isinstance(value, int):
                field_type = "INTEGER"
            elif isinstance(value, float):
                field_type = "FLOAT64"
            elif isinstance(value, datetime):
                field_type = "TIMESTAMP"
            elif isinstance(value, dict):
                field_type = "JSON"
            else:
                field_type = "STRING"

            schema.append(SchemaField(
                name=key,
                field_type=field_type,
                mode="NULLABLE"
            ))
        return schema

    async def _load_data(
        self,
        table_id: str,
        rows: List[Dict[str, Any]],
        write_disposition: bigquery.WriteDisposition,
        partition_field: Optional[str] = None
    ) -> int:
        """Load rows into BigQuery table."""
        # Add ingestion timestamp if not present
        for row in rows:
            if "ingestion_timestamp" not in row:
                row["ingestion_timestamp"] = datetime.utcnow().isoformat()

        job_config = bigquery.LoadJobConfig(
            write_disposition=write_disposition,
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON
        )

        # Convert to JSON lines
        json_data = "\n".join(json.dumps(row) for row in rows)

        job = self.bq_client.client.load_table_from_json(
            rows,
            table_id,
            job_config=job_config
        )

        job.result()  # Wait for job to complete

        return len(rows)


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    loader = BQLoader()
    return await loader.execute(step_config, context)


def get_engine():
    """Factory function for pipeline executor."""
    return BQLoader
