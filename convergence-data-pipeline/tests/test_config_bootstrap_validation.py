"""
Test bootstrap configuration validation.

Validates that the central tenants dataset and all management tables
are properly configured and match the schema templates.
"""

import json
import os
import pytest
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

from google.cloud import bigquery
from google.api_core import exceptions


class TestBootstrapValidation:
    """Test suite for bootstrap configuration validation."""

    @pytest.fixture(scope="class")
    def config(self) -> Dict[str, Any]:
        """Load bootstrap test configuration."""
        config_path = Path(__file__).parent / "configs" / "tenants" / "bootstrap_test_config.json"
        with open(config_path, "r") as f:
            return json.load(f)

    @pytest.fixture(scope="class")
    def temp_log_dir(self, config: Dict[str, Any]) -> Path:
        """Create temporary log directory."""
        log_dir = Path(config["test_settings"]["temp_log_dir"])
        log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir

    @pytest.fixture(scope="class")
    def bq_client(self, config: Dict[str, Any]) -> bigquery.Client:
        """Create BigQuery client."""
        timeout = config["bigquery"]["client_timeout"]
        return bigquery.Client(default_query_job_config=bigquery.QueryJobConfig(
            use_legacy_sql=False,
            timeout_ms=timeout * 1000
        ))

    @pytest.fixture(scope="class")
    def project_id(self, bq_client: bigquery.Client) -> str:
        """Get project ID from BigQuery client."""
        return bq_client.project

    def _log_test_result(self, log_dir: Path, test_name: str, result: Dict[str, Any]):
        """Log test result to file."""
        timestamp = datetime.utcnow().isoformat()
        log_file = log_dir / f"{test_name}_{timestamp}.json"

        log_data = {
            "test_name": test_name,
            "timestamp": timestamp,
            "result": result
        }

        with open(log_file, "w") as f:
            json.dump(log_data, f, indent=2)

    def _load_schema_template(self, schema_file: str) -> Dict[str, Any]:
        """Load schema template from JSON file."""
        template_path = Path("ps_templates/setup/initial/schemas") / schema_file
        with open(template_path, "r") as f:
            return json.load(f)

    def _compare_schemas(
        self,
        actual_schema: List[bigquery.SchemaField],
        expected_schema: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Compare actual BigQuery schema with expected schema template.

        Returns:
            Dict with 'match' boolean and 'differences' list
        """
        differences = []

        # Create lookup for actual fields
        actual_fields = {field.name: field for field in actual_schema}
        expected_fields = {field["name"]: field for field in expected_schema}

        # Check for missing fields
        for field_name in expected_fields:
            if field_name not in actual_fields:
                differences.append({
                    "type": "missing_field",
                    "field": field_name
                })

        # Check for extra fields
        for field_name in actual_fields:
            if field_name not in expected_fields:
                differences.append({
                    "type": "extra_field",
                    "field": field_name
                })

        # Check field types for common fields
        for field_name in set(actual_fields.keys()) & set(expected_fields.keys()):
            actual_field = actual_fields[field_name]
            expected_field = expected_fields[field_name]

            if actual_field.field_type != expected_field["type"]:
                differences.append({
                    "type": "type_mismatch",
                    "field": field_name,
                    "actual": actual_field.field_type,
                    "expected": expected_field["type"]
                })

            if actual_field.mode != expected_field.get("mode", "NULLABLE"):
                differences.append({
                    "type": "mode_mismatch",
                    "field": field_name,
                    "actual": actual_field.mode,
                    "expected": expected_field.get("mode", "NULLABLE")
                })

        return {
            "match": len(differences) == 0,
            "differences": differences
        }

    def test_central_dataset_exists(
        self,
        config: Dict[str, Any],
        bq_client: bigquery.Client,
        project_id: str,
        temp_log_dir: Path
    ):
        """Test that central tenants dataset exists."""
        dataset_id = config["central_dataset"]["dataset_id"]
        dataset_ref = f"{project_id}.{dataset_id}"

        try:
            dataset = bq_client.get_dataset(dataset_ref)
            result = {
                "status": "success",
                "dataset_id": dataset_id,
                "location": dataset.location,
                "created": dataset.created.isoformat() if dataset.created else None
            }
            self._log_test_result(temp_log_dir, "central_dataset_exists", result)

            assert dataset is not None, f"Dataset {dataset_id} not found"
            assert dataset.location == config["central_dataset"]["location"], \
                f"Dataset location mismatch: {dataset.location} != {config['central_dataset']['location']}"

        except exceptions.NotFound:
            result = {
                "status": "failure",
                "dataset_id": dataset_id,
                "error": "Dataset not found"
            }
            self._log_test_result(temp_log_dir, "central_dataset_exists", result)
            pytest.fail(f"Central dataset {dataset_id} does not exist")

    def test_all_management_tables_exist(
        self,
        config: Dict[str, Any],
        bq_client: bigquery.Client,
        project_id: str,
        temp_log_dir: Path
    ):
        """Test that all 8 management tables exist in central dataset."""
        dataset_id = config["central_dataset"]["dataset_id"]
        required_tables = config["central_dataset"]["required_tables"]

        missing_tables = []
        existing_tables = []

        for table_name in required_tables:
            table_ref = f"{project_id}.{dataset_id}.{table_name}"
            try:
                table = bq_client.get_table(table_ref)
                existing_tables.append({
                    "name": table_name,
                    "num_rows": table.num_rows,
                    "created": table.created.isoformat() if table.created else None
                })
            except exceptions.NotFound:
                missing_tables.append(table_name)

        result = {
            "status": "success" if len(missing_tables) == 0 else "failure",
            "total_required": len(required_tables),
            "found": len(existing_tables),
            "missing": len(missing_tables),
            "existing_tables": existing_tables,
            "missing_tables": missing_tables
        }
        self._log_test_result(temp_log_dir, "management_tables_exist", result)

        assert len(missing_tables) == 0, \
            f"Missing management tables: {', '.join(missing_tables)}"
        assert len(existing_tables) == 8, \
            f"Expected 8 management tables, found {len(existing_tables)}"

    def test_table_schemas_match_templates(
        self,
        config: Dict[str, Any],
        bq_client: bigquery.Client,
        project_id: str,
        temp_log_dir: Path
    ):
        """Test that table schemas match ps_templates/setup/initial/schemas/*.json."""
        dataset_id = config["central_dataset"]["dataset_id"]
        schema_files = config["schema_validation"]["required_schema_files"]

        schema_results = []

        for schema_file in schema_files:
            # Extract table name from schema file (remove .json extension)
            table_name = schema_file.replace(".json", "")
            table_ref = f"{project_id}.{dataset_id}.{table_name}"

            try:
                # Get actual table schema
                table = bq_client.get_table(table_ref)
                actual_schema = table.schema

                # Load expected schema template
                expected_schema = self._load_schema_template(schema_file)

                # Compare schemas
                comparison = self._compare_schemas(actual_schema, expected_schema)

                schema_results.append({
                    "table": table_name,
                    "schema_file": schema_file,
                    "match": comparison["match"],
                    "differences": comparison["differences"]
                })

            except exceptions.NotFound:
                schema_results.append({
                    "table": table_name,
                    "schema_file": schema_file,
                    "match": False,
                    "error": "Table not found"
                })
            except FileNotFoundError:
                schema_results.append({
                    "table": table_name,
                    "schema_file": schema_file,
                    "match": False,
                    "error": "Schema template file not found"
                })

        # Log results
        result = {
            "status": "success" if all(r["match"] for r in schema_results) else "failure",
            "total_schemas": len(schema_files),
            "matched": sum(1 for r in schema_results if r["match"]),
            "mismatched": sum(1 for r in schema_results if not r["match"]),
            "schema_results": schema_results
        }
        self._log_test_result(temp_log_dir, "schema_validation", result)

        # Assert all schemas match
        mismatched = [r for r in schema_results if not r["match"]]
        assert len(mismatched) == 0, \
            f"Schema mismatches found: {json.dumps(mismatched, indent=2)}"

    def test_bigquery_client_connectivity(
        self,
        bq_client: bigquery.Client,
        temp_log_dir: Path
    ):
        """Test BigQuery client connectivity."""
        try:
            # Simple query to test connectivity
            query = "SELECT 1 as test"
            query_job = bq_client.query(query)
            results = list(query_job.result())

            result = {
                "status": "success",
                "project_id": bq_client.project,
                "location": bq_client.location,
                "query_result": results[0].test if results else None
            }
            self._log_test_result(temp_log_dir, "bigquery_connectivity", result)

            assert len(results) == 1
            assert results[0].test == 1

        except Exception as e:
            result = {
                "status": "failure",
                "error": str(e)
            }
            self._log_test_result(temp_log_dir, "bigquery_connectivity", result)
            pytest.fail(f"BigQuery connectivity test failed: {str(e)}")

    def test_bootstrap_config_integrity(
        self,
        config: Dict[str, Any],
        temp_log_dir: Path
    ):
        """Test that bootstrap configuration is valid and complete."""
        required_sections = [
            "bootstrap",
            "central_dataset",
            "per_tenant_dataset",
            "schema_validation",
            "test_settings",
            "bigquery"
        ]

        missing_sections = [s for s in required_sections if s not in config]

        result = {
            "status": "success" if len(missing_sections) == 0 else "failure",
            "required_sections": required_sections,
            "present_sections": list(config.keys()),
            "missing_sections": missing_sections
        }
        self._log_test_result(temp_log_dir, "config_integrity", result)

        assert len(missing_sections) == 0, \
            f"Missing configuration sections: {', '.join(missing_sections)}"

        # Validate bootstrap settings
        assert config["bootstrap"]["enabled"] is True, \
            "Bootstrap must be enabled"
        assert config["bootstrap"]["verify_schema"] is True, \
            "Schema verification must be enabled"

        # Validate central dataset settings
        assert "dataset_id" in config["central_dataset"], \
            "Central dataset ID must be specified"
        assert "required_tables" in config["central_dataset"], \
            "Required tables must be specified"
        assert len(config["central_dataset"]["required_tables"]) == 8, \
            "Must have exactly 8 required management tables"
