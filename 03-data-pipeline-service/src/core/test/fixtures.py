"""
Test Fixtures and Mocks

Reusable mock objects for testing processors without external dependencies.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Callable, Union
from unittest.mock import MagicMock, AsyncMock
import json


@dataclass
class MockContext:
    """
    Mock execution context for processor testing.

    Usage:
        context = MockContext(org_slug="test_org")
        context.add_secret("OPENAI", "sk-test-key")
        result = await processor.execute(step_config, context.to_dict())
    """
    org_slug: str
    secrets: Dict[str, str] = field(default_factory=dict)
    variables: Dict[str, Any] = field(default_factory=dict)
    previous_step_results: Dict[str, Dict] = field(default_factory=dict)

    def add_secret(self, provider: str, value: str) -> "MockContext":
        """Add a decrypted secret for a provider."""
        self.secrets[provider.upper()] = value
        return self

    def add_variable(self, key: str, value: Any) -> "MockContext":
        """Add a runtime variable."""
        self.variables[key] = value
        return self

    def add_previous_result(self, step_id: str, result: Dict) -> "MockContext":
        """Add result from a previous step."""
        self.previous_step_results[step_id] = result
        return self

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for processor execution."""
        return {
            "org_slug": self.org_slug,
            "secrets": self.secrets,
            "variables": self.variables,
            "previous_step_results": self.previous_step_results,
            # Common context fields
            "pipeline_logging_id": "test-logging-id",
            "step_logging_id": "test-step-id",
        }


class MockBigQueryClient:
    """
    Mock BigQuery client for testing without GCP access.

    Usage:
        mock_bq = MockBigQueryClient()
        mock_bq.add_query_result("SELECT * FROM ...", [{"id": 1, "name": "test"}])

        # In test, patch the real client
        with patch("src.core.engine.bq_client.BigQueryClient", return_value=mock_bq):
            result = await processor.execute(...)
    """

    def __init__(self):
        self.query_results: Dict[str, List[Dict]] = {}
        self.inserted_rows: Dict[str, List[Dict]] = {}
        self.created_tables: List[str] = []
        self.executed_queries: List[str] = []
        self.client = MagicMock()  # For compatibility

    def add_query_result(
        self,
        query_pattern: str,
        rows: List[Dict[str, Any]]
    ) -> "MockBigQueryClient":
        """
        Add expected query result.

        Args:
            query_pattern: SQL query or pattern to match
            rows: Rows to return for this query
        """
        self.query_results[query_pattern] = rows
        return self

    def add_table_data(
        self,
        table_id: str,
        rows: List[Dict[str, Any]]
    ) -> "MockBigQueryClient":
        """Add data for a specific table."""
        self.query_results[f"SELECT * FROM `{table_id}`"] = rows
        return self

    async def query(
        self,
        sql: str,
        parameters: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        """Mock query execution."""
        self.executed_queries.append(sql)

        # Check for exact match
        if sql in self.query_results:
            return self.query_results[sql]

        # Check for pattern match
        for pattern, rows in self.query_results.items():
            if pattern in sql:
                return rows

        return []

    async def insert_rows(
        self,
        table_id: str,
        rows: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Mock insert rows."""
        if table_id not in self.inserted_rows:
            self.inserted_rows[table_id] = []
        self.inserted_rows[table_id].extend(rows)
        return {"success": True, "rows_inserted": len(rows)}

    async def create_table(
        self,
        table_id: str,
        schema: List[Dict]
    ) -> bool:
        """Mock table creation."""
        self.created_tables.append(table_id)
        return True

    async def table_exists(self, table_id: str) -> bool:
        """Mock table existence check."""
        return table_id in self.created_tables

    def get_inserted_rows(self, table_id: str) -> List[Dict]:
        """Get rows that were inserted to a table."""
        return self.inserted_rows.get(table_id, [])

    def assert_table_created(self, table_id: str) -> None:
        """Assert a table was created."""
        if table_id not in self.created_tables:
            raise AssertionError(f"Table {table_id} was not created")

    def assert_rows_inserted(self, table_id: str, min_count: int = 1) -> None:
        """Assert rows were inserted to a table."""
        rows = self.inserted_rows.get(table_id, [])
        if len(rows) < min_count:
            raise AssertionError(
                f"Expected at least {min_count} rows in {table_id}, got {len(rows)}"
            )


class MockHTTPResponse:
    """Mock HTTP response for API testing."""

    def __init__(
        self,
        status_code: int = 200,
        json_data: Optional[Dict] = None,
        text: str = "",
        headers: Optional[Dict] = None
    ):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.text = text or json.dumps(self._json_data)
        self.headers = headers or {}

    def json(self) -> Dict:
        return self._json_data


def mock_api_response(
    status_code: int = 200,
    data: Optional[Dict] = None,
    error: Optional[str] = None
) -> MockHTTPResponse:
    """
    Create a mock API response for testing.

    Usage:
        response = mock_api_response(200, {"data": [{"id": 1}]})
        # or for errors
        response = mock_api_response(401, error="Unauthorized")
    """
    if error:
        return MockHTTPResponse(
            status_code=status_code,
            json_data={"error": error},
            text=error
        )
    return MockHTTPResponse(status_code=status_code, json_data=data or {})


@dataclass
class MockKMSClient:
    """Mock KMS client for testing encryption/decryption."""

    decrypted_values: Dict[str, str] = field(default_factory=dict)

    def add_decrypted(self, encrypted: str, decrypted: str) -> "MockKMSClient":
        """Add a decryption mapping."""
        self.decrypted_values[encrypted] = decrypted
        return self

    async def decrypt(self, encrypted_value: str) -> str:
        """Mock decrypt."""
        if encrypted_value in self.decrypted_values:
            return self.decrypted_values[encrypted_value]
        # Default: return as-is (for testing)
        return encrypted_value

    async def encrypt(self, plaintext: str) -> str:
        """Mock encrypt."""
        return f"encrypted:{plaintext}"


# ==========================================
# Sample Test Data Factories
# ==========================================

def make_openai_usage_data(
    count: int = 5,
    date: str = "2025-01-01"
) -> List[Dict[str, Any]]:
    """Generate sample OpenAI usage data for testing."""
    return [
        {
            "snapshot_id": f"gpt-4-{i}",
            "n_context_tokens_total": 1000 * (i + 1),
            "n_generated_tokens_total": 500 * (i + 1),
            "n_requests": 10 * (i + 1),
            "date": date,
        }
        for i in range(count)
    ]


def make_gcp_billing_data(
    count: int = 5,
    date: str = "2025-01-01",
    include_credits: bool = True
) -> List[Dict[str, Any]]:
    """
    Generate sample GCP billing data for testing.

    Matches schema: 03-data-pipeline-service/configs/cloud/gcp/cost/schemas/billing_cost.json

    Args:
        count: Number of records to generate
        date: Usage date in YYYY-MM-DD format
        include_credits: If True, ~7% of records will be credits (negative costs)
    """
    import uuid as uuid_mod
    import random

    services = [
        {"service_id": "6F81-5844-456A", "service_description": "Cloud Run", "sku_id": "D2C2-5678-ABCD",
         "sku_description": "CPU Allocation Time", "usage_unit": "second", "usage_pricing_unit": "vCPU-second"},
        {"service_id": "24E6-581D-38E5", "service_description": "Cloud Build", "sku_id": "E4F5-6789-BCDE",
         "sku_description": "Build Time", "usage_unit": "second", "usage_pricing_unit": "build-minute"},
        {"service_id": "95FF-2EF5-5EA1", "service_description": "BigQuery", "sku_id": "F5G6-7890-CDEF",
         "sku_description": "Analysis", "usage_unit": "byte", "usage_pricing_unit": "tebibyte"},
        {"service_id": "152E-C115-5142", "service_description": "Cloud Storage", "sku_id": "G6H7-8901-DEFG",
         "sku_description": "Standard Storage US Multi-region", "usage_unit": "byte-seconds", "usage_pricing_unit": "gibibyte month"},
        {"service_id": "9662-B51E-5089", "service_description": "Cloud Key Management Service", "sku_id": "H7I8-9012-EFGH",
         "sku_description": "Active software symmetric key versions", "usage_unit": "requests", "usage_pricing_unit": "key version"},
    ]

    records = []
    for i in range(count):
        service = services[i % len(services)]
        is_credit = include_credits and random.random() < 0.07
        base_cost = 2.5 * (i + 1)
        cost = -abs(base_cost) if is_credit else abs(base_cost)

        records.append({
            # Required fields
            "billing_account_id": "01A2B3-C4D5E6-F7G8H9",
            "usage_start_time": f"{date}T00:00:00Z",
            "usage_end_time": f"{date}T23:59:59Z",
            "cost": cost,
            "ingestion_date": date,
            "org_slug": "test_org",
            "x_pipeline_id": "cloud_cost_gcp",
            "x_credential_id": "cred_gcp_test_001",
            "x_pipeline_run_date": date,
            "x_run_id": f"run_test_{uuid_mod.uuid4().hex[:8]}",
            "x_ingested_at": f"{date}T23:59:59Z",

            # Service identification
            "service_id": service["service_id"],
            "service_description": service["service_description"],
            "sku_id": service["sku_id"],
            "sku_description": service["sku_description"],

            # Project info
            "project_id": f"project-{i}",
            "project_name": f"Test Project {i}",
            "project_number": f"12345678901{i}",

            # Location
            "location_location": "us-central1",
            "location_region": "us-central1",
            "location_zone": "us-central1-a",

            # Resource
            "resource_name": f"{service['service_description'].lower().replace(' ', '-')}-{i}",
            "resource_global_name": f"//cloudresourcemanager.googleapis.com/projects/project-{i}",

            # Pricing and usage
            "currency": "USD",
            "currency_conversion_rate": 1.0,
            "usage_amount": 86400.0 * (i + 1),
            "usage_unit": service["usage_unit"],
            "usage_amount_in_pricing_units": 86.4 * (i + 1),
            "usage_pricing_unit": service["usage_pricing_unit"],

            # Cost categorization
            "cost_type": "credit" if is_credit else "regular",
            "credits_total": cost if is_credit else 0.0,
            "cost_at_list": abs(cost) * 1.1 if not is_credit else 0.0,

            # Invoice
            "invoice_month": date[:7].replace("-", ""),

            # Labels
            "labels_json": '{"env": "test", "team": "platform"}',
            "system_labels_json": None,

            # Hierarchy
            "x_hierarchy_entity_id": None,
            "x_hierarchy_entity_name": None,
            "x_hierarchy_level_code": None,
            "x_hierarchy_path": None,
            "x_hierarchy_path_names": None,
        })
    return records


def make_anthropic_usage_data(
    count: int = 5,
    date: str = "2025-01-01"
) -> List[Dict[str, Any]]:
    """Generate sample Anthropic usage data for testing."""
    return [
        {
            "model": f"claude-3-opus" if i % 2 == 0 else "claude-3-sonnet",
            "input_tokens": 2000 * (i + 1),
            "output_tokens": 800 * (i + 1),
            "requests": 5 * (i + 1),
            "date": date,
        }
        for i in range(count)
    ]
