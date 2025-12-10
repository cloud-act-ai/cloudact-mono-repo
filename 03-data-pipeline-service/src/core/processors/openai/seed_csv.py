"""
OpenAI Seed CSV Processor

Loads CSV seed data (pricing, subscriptions) into per-org BigQuery tables.
One-time operation triggered on integration setup.

Usage in pipeline:
    ps_type: openai.seed_csv
"""

import csv
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings


class SeedCSVProcessor:
    """
    Loads CSV data into BigQuery tables for OpenAI.

    Creates table if not exists, then loads data from CSV.
    Supports write modes: truncate, append, error_if_exists
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        self.base_path = Path(__file__).parent.parent.parent.parent.parent

    def _resolve_variables(self, value: str, context: Dict[str, Any]) -> str:
        """Resolve {variable} placeholders from context."""
        if not value:
            return value
        for key, val in context.items():
            if isinstance(val, str):
                value = value.replace(f"{{{key}}}", val)
        return value

    def _validate_path(self, file_path: str) -> Path:
        """
        Validate file path stays within base_path (prevent path traversal).

        Args:
            file_path: Relative file path from config

        Returns:
            Resolved absolute Path

        Raises:
            ValueError: If path traversal detected
        """
        resolved = (self.base_path / file_path).resolve()

        if not str(resolved).startswith(str(self.base_path.resolve())):
            raise ValueError(
                f"Path traversal detected: {file_path} resolves outside base path"
            )

        return resolved

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Load CSV data into BigQuery table.

        Args:
            step_config: Step configuration containing:
                - config.csv_file: Path to CSV file (relative to project root)
                - config.schema_file: Path to JSON schema file
                - config.destination_table: Target table name
                - config.write_mode: truncate|append|error_if_exists (default: truncate)
                - config.add_timestamps: Add created_at/updated_at columns (default: true)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - rows_loaded: Number of rows loaded
                - table: Full table path
        """
        org_slug = context.get("org_slug")
        config = step_config.get("config", {})

        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        # Get config values and resolve variables from context
        csv_file = self._resolve_variables(config.get("csv_file", ""), context)
        schema_file = self._resolve_variables(config.get("schema_file", ""), context)
        destination_table = config.get("destination_table")
        write_mode = config.get("write_mode", "truncate")
        add_timestamps = config.get("add_timestamps", True)

        if not all([csv_file, schema_file, destination_table]):
            return {
                "status": "FAILED",
                "error": "csv_file, schema_file, and destination_table are required"
            }

        # Use settings.get_org_dataset_name() for consistency with onboarding
        dataset_id = self.settings.get_org_dataset_name(org_slug)
        project_id = self.settings.gcp_project_id

        self.logger.info(
            f"Loading CSV seed data for {org_slug}",
            extra={
                "org_slug": org_slug,
                "csv_file": csv_file,
                "destination_table": destination_table
            }
        )

        try:
            bq_client = BigQueryClient(project_id=project_id)

            # Load schema
            schema = self._load_schema(schema_file)
            if not schema:
                return {
                    "status": "FAILED",
                    "error": f"Could not load schema from {schema_file}"
                }

            # Ensure table exists
            table_id = f"{project_id}.{dataset_id}.{destination_table}"
            await self._ensure_table_exists(
                bq_client, table_id, schema, write_mode
            )

            # Load CSV data with org_slug injection
            rows = self._read_csv(csv_file, add_timestamps, org_slug)
            if not rows:
                return {
                    "status": "SUCCESS",
                    "rows_loaded": 0,
                    "table": table_id,
                    "message": "No data in CSV file"
                }

            # Insert rows
            errors = bq_client.client.insert_rows_json(table_id, rows)
            if errors:
                self.logger.error(f"Insert errors: {errors}")
                return {
                    "status": "FAILED",
                    "error": f"Insert errors: {errors[:3]}..."  # First 3 errors
                }

            return {
                "status": "SUCCESS",
                "rows_loaded": len(rows),
                "table": table_id,
                "message": f"Loaded {len(rows)} rows into {destination_table}"
            }

        except Exception as e:
            self.logger.error(f"Seed CSV error: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": str(e)
            }

    def _load_schema(self, schema_file: str) -> List[bigquery.SchemaField]:
        """Load BigQuery schema from JSON file."""
        try:
            schema_path = self._validate_path(schema_file)
        except ValueError as e:
            self.logger.error(f"Schema path validation failed: {e}")
            return []

        try:
            with open(schema_path, 'r') as f:
                schema_json = json.load(f)

            schema_fields = []
            for field in schema_json.get("schema", []):
                schema_fields.append(
                    bigquery.SchemaField(
                        name=field["name"],
                        field_type=field["type"],
                        mode=field.get("mode", "NULLABLE"),
                        description=field.get("description", "")
                    )
                )

            return schema_fields

        except Exception as e:
            self.logger.error(f"Could not load schema from {schema_path}: {e}")
            return []

    def _read_csv(self, csv_file: str, add_timestamps: bool, org_slug: str) -> List[Dict]:
        """Read CSV file and return list of row dicts with org_slug injected."""
        try:
            csv_path = self._validate_path(csv_file)
        except ValueError as e:
            self.logger.error(f"CSV path validation failed: {e}")
            return []

        try:
            rows = []
            now = datetime.utcnow().isoformat()

            with open(csv_path, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Convert empty strings to None
                    cleaned_row = {
                        k: (v if v != '' else None)
                        for k, v in row.items()
                    }

                    # Convert numeric fields
                    for key in cleaned_row:
                        if cleaned_row[key] is not None:
                            # Try to convert to float if it looks numeric
                            try:
                                if '.' in str(cleaned_row[key]):
                                    cleaned_row[key] = float(cleaned_row[key])
                                elif str(cleaned_row[key]).isdigit():
                                    cleaned_row[key] = int(cleaned_row[key])
                            except (ValueError, TypeError):
                                pass

                    # Inject org_slug for tenant identification
                    cleaned_row["org_slug"] = org_slug

                    if add_timestamps:
                        cleaned_row["created_at"] = now
                        cleaned_row["updated_at"] = now

                    rows.append(cleaned_row)

            return rows

        except Exception as e:
            self.logger.error(f"Could not read CSV from {csv_path}: {e}")
            return []

    async def _ensure_table_exists(
        self,
        bq_client: BigQueryClient,
        table_id: str,
        schema: List[bigquery.SchemaField],
        write_mode: str
    ) -> None:
        """Ensure table exists, create if needed, handle write mode."""
        try:
            table = bq_client.client.get_table(table_id)

            if write_mode == "truncate":
                # Delete all rows
                query = f"DELETE FROM `{table_id}` WHERE TRUE"
                bq_client.client.query(query).result()
                self.logger.info(f"Truncated table {table_id}")

            elif write_mode == "error_if_exists":
                raise ValueError(f"Table {table_id} already exists")

            # append mode: do nothing, table exists

        except Exception as e:
            if "Not found" in str(e):
                # Create table
                table = bigquery.Table(table_id, schema=schema)
                bq_client.client.create_table(table)
                self.logger.info(f"Created table {table_id}")
            else:
                raise


def get_engine():
    """Factory function for pipeline executor."""
    return SeedCSVProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = SeedCSVProcessor()
    return await processor.execute(step_config, context)
