"""
Schema Validation and x_* Column Standards Tests

Tests for:
- x_* lineage column ordering standards
- Schema-to-processor alignment
- Stored procedure column ordering
- GenAI processor column name validation

Run: python -m pytest tests/test_08_schema_validation.py -v
"""

import pytest
import json
import re
from pathlib import Path
from typing import Dict, List, Any, Set


# ============================================================================
# Configuration
# ============================================================================

BASE_DIR = Path(__file__).parent.parent
CONFIGS_DIR = BASE_DIR / "configs"
API_SCHEMAS_DIR = BASE_DIR.parent / "02-api-service" / "configs" / "setup" / "organizations" / "onboarding" / "schemas"
PROCESSORS_DIR = BASE_DIR / "src" / "core" / "processors"
PROCEDURES_DIR = CONFIGS_DIR / "system" / "procedures"

# Standard x_* column order (REQUIRED order for all pipeline tables)
STANDARD_X_COLUMNS_ORDER = [
    "x_pipeline_id",
    "x_credential_id",
    "x_pipeline_run_date",
    "x_run_id",
    "x_ingested_at",
    # Optional columns after required ones
    "x_data_quality_score",
    "x_created_at",
]

REQUIRED_X_COLUMNS = [
    "x_pipeline_id",
    "x_credential_id",
    "x_pipeline_run_date",
    "x_run_id",
    "x_ingested_at",
]

# Deprecated column names that should NOT be used
DEPRECATED_COLUMNS = [
    "x_pipeline_run_id",  # Use x_run_id instead
    "credential_id",      # Use x_credential_id in pipeline tables
]

# Tables that must have x_* columns
PIPELINE_TABLES = [
    "genai_payg_usage_raw",
    "genai_commitment_usage_raw",
    "genai_infrastructure_usage_raw",
    "genai_costs_daily_unified",
    "cost_data_standard_1_3",
    "subscription_plan_costs_daily",
    "cloud_gcp_billing_raw_daily",
    "cloud_aws_billing_raw_daily",
    "cloud_azure_billing_raw_daily",
]


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def schema_files() -> Dict[str, Path]:
    """Get all schema JSON files."""
    schemas = {}
    if API_SCHEMAS_DIR.exists():
        for schema_file in API_SCHEMAS_DIR.glob("*.json"):
            schemas[schema_file.stem] = schema_file
    return schemas


@pytest.fixture
def procedure_files() -> Dict[str, Path]:
    """Get all stored procedure SQL files."""
    procedures = {}
    if PROCEDURES_DIR.exists():
        for sql_file in PROCEDURES_DIR.rglob("*.sql"):
            procedures[sql_file.stem] = sql_file
    return procedures


@pytest.fixture
def processor_files() -> Dict[str, Path]:
    """Get all processor Python files."""
    processors = {}
    if PROCESSORS_DIR.exists():
        for py_file in PROCESSORS_DIR.rglob("*.py"):
            if not py_file.name.startswith("__"):
                relative_path = py_file.relative_to(PROCESSORS_DIR)
                processors[str(relative_path)] = py_file
    return processors


# ============================================================================
# SCHEMA VALIDATION TESTS
# ============================================================================

class TestSchemaXColumnOrder:
    """Test x_* column ordering in schema files."""

    def test_cost_data_standard_x_column_order(self, schema_files):
        """Test cost_data_standard_1_3 has correct x_* column order."""
        schema_path = schema_files.get("cost_data_standard_1_3")
        if not schema_path:
            pytest.skip("cost_data_standard_1_3.json not found")

        with open(schema_path) as f:
            schema = json.load(f)

        # Extract x_* column names in order
        x_columns = [col["name"] for col in schema if col["name"].startswith("x_")]

        # Check required columns are present
        for required in REQUIRED_X_COLUMNS:
            assert required in x_columns, f"Missing required column: {required}"

        # Check order of required columns
        required_indices = {col: x_columns.index(col) for col in REQUIRED_X_COLUMNS if col in x_columns}

        # x_pipeline_id should come before x_credential_id
        assert required_indices["x_pipeline_id"] < required_indices["x_credential_id"]
        # x_credential_id should come before x_pipeline_run_date
        assert required_indices["x_credential_id"] < required_indices["x_pipeline_run_date"]
        # x_pipeline_run_date should come before x_run_id
        assert required_indices["x_pipeline_run_date"] < required_indices["x_run_id"]
        # x_run_id should come before x_ingested_at
        assert required_indices["x_run_id"] < required_indices["x_ingested_at"]

    def test_subscription_plan_costs_x_column_order(self, schema_files):
        """Test subscription_plan_costs_daily has correct x_* column order."""
        schema_path = schema_files.get("subscription_plan_costs_daily")
        if not schema_path:
            pytest.skip("subscription_plan_costs_daily.json not found")

        with open(schema_path) as f:
            schema = json.load(f)

        x_columns = [col["name"] for col in schema if col["name"].startswith("x_")]

        for required in REQUIRED_X_COLUMNS:
            assert required in x_columns, f"Missing required column: {required}"

    def test_no_deprecated_columns_in_schemas(self, schema_files):
        """Test that no deprecated column names are used in schemas."""
        for schema_name, schema_path in schema_files.items():
            with open(schema_path) as f:
                schema = json.load(f)

            column_names = [col["name"] for col in schema]

            for deprecated in DEPRECATED_COLUMNS:
                assert deprecated not in column_names, \
                    f"Deprecated column '{deprecated}' found in {schema_name}"

    def test_pipeline_tables_have_x_columns(self, schema_files):
        """Test that pipeline tables have required x_* columns."""
        for table_name in PIPELINE_TABLES:
            schema_path = schema_files.get(table_name)
            if not schema_path:
                continue  # Skip if schema doesn't exist

            with open(schema_path) as f:
                schema = json.load(f)

            column_names = [col["name"] for col in schema]

            for required in REQUIRED_X_COLUMNS:
                assert required in column_names, \
                    f"Table {table_name} missing required column: {required}"


# ============================================================================
# STORED PROCEDURE VALIDATION TESTS
# ============================================================================

class TestStoredProcedureXColumns:
    """Test x_* column ordering in stored procedures."""

    def test_genai_focus_procedure_column_order(self, procedure_files):
        """Test sp_genai_3_convert_to_focus has correct x_* column order."""
        proc_path = procedure_files.get("sp_genai_3_convert_to_focus")
        if not proc_path:
            pytest.skip("sp_genai_3_convert_to_focus.sql not found")

        content = proc_path.read_text()

        # Check for correct order pattern in INSERT
        correct_pattern = r"x_pipeline_id.*x_credential_id.*x_pipeline_run_date.*x_run_id.*x_ingested_at"
        assert re.search(correct_pattern, content, re.DOTALL), \
            "INSERT columns not in standard order"

        # Check for deprecated columns
        assert "x_pipeline_run_id" not in content, \
            "Deprecated x_pipeline_run_id found (use x_run_id)"

    def test_subscription_focus_procedure_column_order(self, procedure_files):
        """Test sp_subscription_3_convert_to_focus has correct x_* column order."""
        proc_path = procedure_files.get("sp_subscription_3_convert_to_focus")
        if not proc_path:
            pytest.skip("sp_subscription_3_convert_to_focus.sql not found")

        content = proc_path.read_text()

        correct_pattern = r"x_pipeline_id.*x_credential_id.*x_pipeline_run_date.*x_run_id.*x_ingested_at"
        assert re.search(correct_pattern, content, re.DOTALL), \
            "INSERT columns not in standard order"

    def test_subscription_calculate_procedure_column_order(self, procedure_files):
        """Test sp_subscription_2_calculate_daily_costs has correct x_* column order."""
        proc_path = procedure_files.get("sp_subscription_2_calculate_daily_costs")
        if not proc_path:
            pytest.skip("sp_subscription_2_calculate_daily_costs.sql not found")

        content = proc_path.read_text()

        correct_pattern = r"x_pipeline_id.*x_credential_id.*x_pipeline_run_date.*x_run_id.*x_ingested_at"
        assert re.search(correct_pattern, content, re.DOTALL), \
            "INSERT columns not in standard order"

    def test_cloud_focus_procedure_column_order(self, procedure_files):
        """Test sp_cloud_1_convert_to_focus has correct x_* column order."""
        proc_path = procedure_files.get("sp_cloud_1_convert_to_focus")
        if not proc_path:
            pytest.skip("sp_cloud_1_convert_to_focus.sql not found")

        content = proc_path.read_text()

        correct_pattern = r"x_pipeline_id.*x_credential_id.*x_pipeline_run_date.*x_run_id.*x_ingested_at"
        assert re.search(correct_pattern, content, re.DOTALL), \
            "INSERT columns not in standard order"

    def test_no_deprecated_columns_in_procedures(self, procedure_files):
        """Test that no deprecated column names are used in procedures."""
        for proc_name, proc_path in procedure_files.items():
            content = proc_path.read_text()

            # Check for x_pipeline_run_id (should be x_run_id)
            if "x_pipeline_run_id" in content:
                # Allow in comments
                lines_with_deprecated = [
                    line for line in content.split('\n')
                    if "x_pipeline_run_id" in line and not line.strip().startswith("--")
                ]
                assert len(lines_with_deprecated) == 0, \
                    f"Deprecated x_pipeline_run_id found in {proc_name}"


# ============================================================================
# PROCESSOR VALIDATION TESTS
# ============================================================================

class TestProcessorColumnNames:
    """Test processor column names match schemas."""

    def test_genai_payg_cost_processor_columns(self, processor_files):
        """Test genai/payg_cost.py uses correct column names."""
        proc_path = processor_files.get("genai/payg_cost.py")
        if not proc_path:
            pytest.skip("genai/payg_cost.py not found")

        content = proc_path.read_text()

        # Should use x_credential_id, not credential_id from usage table
        assert "u.x_credential_id" in content or "x_credential_id" in content, \
            "Should reference x_credential_id"

        # Should not have bare credential_id reference from usage table
        if "u.credential_id" in content:
            pytest.fail("Using deprecated u.credential_id - use u.x_credential_id")

    def test_genai_commitment_usage_processor_columns(self, processor_files):
        """Test genai/commitment_usage.py uses correct column names."""
        proc_path = processor_files.get("genai/commitment_usage.py")
        if not proc_path:
            pytest.skip("genai/commitment_usage.py not found")

        content = proc_path.read_text()

        # Should use schema column names
        assert "provisioned_units" in content, "Should use provisioned_units (not ptu_units)"
        assert "tokens_processed" in content, "Should use tokens_processed (not tokens_generated)"
        assert "hours_active" in content, "Should use hours_active (not usage_hours)"

    def test_genai_infrastructure_usage_processor_columns(self, processor_files):
        """Test genai/infrastructure_usage.py uses correct column names."""
        proc_path = processor_files.get("genai/infrastructure_usage.py")
        if not proc_path:
            pytest.skip("genai/infrastructure_usage.py not found")

        content = proc_path.read_text()

        # Should use schema column names
        assert "instance_id" in content, "Should use instance_id (not resource_id)"
        assert "instance_count" in content, "Should use instance_count (not gpu_count)"

    def test_focus_converter_processor_columns(self, processor_files):
        """Test genai/focus_converter.py uses correct column names."""
        proc_path = processor_files.get("genai/focus_converter.py")
        if not proc_path:
            pytest.skip("genai/focus_converter.py not found")

        content = proc_path.read_text()

        # Should use x_run_id, not x_pipeline_run_id
        assert "x_run_id" in content, "Should use x_run_id"
        if "x_pipeline_run_id" in content:
            # Check it's not in a comment
            lines = [l for l in content.split('\n') if "x_pipeline_run_id" in l and not l.strip().startswith("#")]
            assert len(lines) == 0, "Using deprecated x_pipeline_run_id - use x_run_id"


# ============================================================================
# CROSS-VALIDATION TESTS
# ============================================================================

class TestSchemaProcessorAlignment:
    """Test schema and processor alignment."""

    def test_genai_unified_schema_has_all_x_columns(self, schema_files):
        """Test genai_costs_daily_unified schema has all required x_* columns."""
        schema_path = schema_files.get("genai_costs_daily_unified")
        if not schema_path:
            pytest.skip("genai_costs_daily_unified.json not found")

        with open(schema_path) as f:
            schema = json.load(f)

        column_names = [col["name"] for col in schema]

        for required in REQUIRED_X_COLUMNS:
            assert required in column_names, f"Missing required column: {required}"

    def test_focus_schema_extension_columns(self, schema_files):
        """Test cost_data_standard_1_3 has all extension columns."""
        schema_path = schema_files.get("cost_data_standard_1_3")
        if not schema_path:
            pytest.skip("cost_data_standard_1_3.json not found")

        with open(schema_path) as f:
            schema = json.load(f)

        column_names = [col["name"] for col in schema]

        # Check for GenAI extension columns
        genai_extensions = ["x_genai_cost_type", "x_genai_provider", "x_genai_model"]
        for ext in genai_extensions:
            assert ext in column_names, f"Missing GenAI extension: {ext}"

        # Check for 10-level hierarchy extension columns (v15.0+)
        hierarchy_extensions = [
            "x_hierarchy_level_1_id", "x_hierarchy_level_1_name",
            "x_hierarchy_level_2_id", "x_hierarchy_level_2_name",
            "x_hierarchy_level_3_id", "x_hierarchy_level_3_name"
            # Levels 4-10 are optional, so we only check 1-3
        ]
        for ext in hierarchy_extensions:
            assert ext in column_names, f"Missing 10-level hierarchy extension: {ext}"


# ============================================================================
# DATA TYPE VALIDATION TESTS
# ============================================================================

class TestSchemaDataTypes:
    """Test schema data types are correct."""

    def test_x_column_data_types(self, schema_files):
        """Test x_* columns have correct data types."""
        expected_types = {
            "x_pipeline_id": "STRING",
            "x_credential_id": "STRING",
            "x_pipeline_run_date": "DATE",
            "x_run_id": "STRING",
            "x_ingested_at": "TIMESTAMP",
            "x_data_quality_score": "FLOAT64",
            "x_created_at": "TIMESTAMP",
        }

        for schema_name, schema_path in schema_files.items():
            with open(schema_path) as f:
                schema = json.load(f)

            columns = {col["name"]: col for col in schema}

            for col_name, expected_type in expected_types.items():
                if col_name in columns:
                    actual_type = columns[col_name]["type"]
                    assert actual_type == expected_type, \
                        f"{schema_name}.{col_name} should be {expected_type}, got {actual_type}"

    def test_required_columns_are_required(self, schema_files):
        """Test required x_* columns have mode REQUIRED."""
        for schema_name, schema_path in schema_files.items():
            # Only check pipeline tables
            if schema_name not in PIPELINE_TABLES:
                continue

            with open(schema_path) as f:
                schema = json.load(f)

            columns = {col["name"]: col for col in schema}

            for required_col in REQUIRED_X_COLUMNS:
                if required_col in columns:
                    mode = columns[required_col].get("mode", "NULLABLE")
                    assert mode == "REQUIRED", \
                        f"{schema_name}.{required_col} should be REQUIRED, got {mode}"


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def extract_x_columns_from_sql(sql_content: str) -> List[str]:
    """Extract x_* column names from SQL content."""
    # Find all x_* column references
    pattern = r'\bx_[a-z_]+\b'
    matches = re.findall(pattern, sql_content, re.IGNORECASE)
    return list(dict.fromkeys(matches))  # Remove duplicates, preserve order


def validate_column_order(columns: List[str], standard_order: List[str]) -> bool:
    """Validate that columns appear in the correct relative order."""
    # Filter to only columns in both lists
    filtered = [c for c in columns if c in standard_order]
    expected = [c for c in standard_order if c in columns]
    return filtered == expected


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
