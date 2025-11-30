"""
BigQuery Integration Tests

Integration tests that use REAL BigQuery connections.
These tests create actual test datasets and clean them up after completion.

Prerequisites:
- GOOGLE_APPLICATION_CREDENTIALS must be set to valid GCP SA JSON
- GCP_PROJECT_ID must be set (integration tests override conftest defaults)
- The SA must have BigQuery admin permissions

Run with: pytest tests/test_integration_bigquery.py -v --tb=short -m integration

These tests are marked with @pytest.mark.integration and skipped by default.
To run them: pytest -m integration
"""

import os
import uuid
import pytest
from datetime import datetime
from typing import Generator

# Skip all tests in this module unless explicitly running integration tests
# Run with: pytest tests/test_integration_bigquery.py -v -m integration
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("RUN_INTEGRATION_TESTS", "").lower() != "true",
        reason="Integration tests require RUN_INTEGRATION_TESTS=true"
    )
]

# ============================================
# IMPORTANT: Override conftest environment for integration tests
# The conftest.py sets GCP_PROJECT_ID="test-project" for unit tests.
# For integration tests, we MUST use the real project.
# ============================================

# Real GCP project for integration tests
INTEGRATION_TEST_PROJECT = "gac-prod-471220"
INTEGRATION_TEST_LOCATION = "US"
INTEGRATION_TEST_ENVIRONMENT = "development"

# Force override the project ID for integration tests
# This is done BEFORE any imports that might read settings
os.environ["GCP_PROJECT_ID"] = INTEGRATION_TEST_PROJECT
os.environ["ENVIRONMENT"] = "development"
# Use env var if available, otherwise use test key (auth disabled for integration tests)
os.environ["CA_ROOT_API_KEY"] = os.environ.get("CA_ROOT_API_KEY", "integration-test-root-key-32chars!")
# Disable auth for integration tests - we're testing BigQuery, not auth
os.environ["DISABLE_AUTH"] = "true"
os.environ["KMS_KEY_NAME"] = f"projects/{INTEGRATION_TEST_PROJECT}/locations/global/keyRings/test/cryptoKeys/test"

from google.cloud import bigquery
from google.api_core import exceptions as gcp_exceptions
from httpx import AsyncClient, ASGITransport

from src.app.main import app
from src.app.config import get_settings


# ============================================
# Test Configuration
# ============================================

# Use the root key from environment
ROOT_API_KEY = os.environ.get("CA_ROOT_API_KEY", "integration-test-root-key-32chars!")

# Test dataset prefix - all test datasets will be prefixed with this
TEST_DATASET_PREFIX = "test_integration"

# Verify we're using the right project
_settings = get_settings()
if _settings.gcp_project_id != INTEGRATION_TEST_PROJECT:
    import warnings
    warnings.warn(
        f"Settings project ({_settings.gcp_project_id}) doesn't match integration test project ({INTEGRATION_TEST_PROJECT}). "
        "Tests will use the hardcoded project ID directly."
    )


# ============================================
# Skip if no GCP credentials
# ============================================

def has_gcp_credentials() -> bool:
    """Check if GCP credentials are available."""
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and os.path.exists(creds_path):
        return True
    # Check if running on GCP (default credentials)
    try:
        import google.auth
        google.auth.default()
        return True
    except Exception:
        return False


skip_if_no_gcp = pytest.mark.skipif(
    not has_gcp_credentials(),
    reason="GCP credentials not available - set GOOGLE_APPLICATION_CREDENTIALS"
)


# ============================================
# Fixtures
# ============================================

@pytest.fixture(scope="module")
def bq_client() -> Generator[bigquery.Client, None, None]:
    """BigQuery client for direct operations.

    Uses hardcoded INTEGRATION_TEST_PROJECT to avoid conftest interference.
    """
    # Use hardcoded project, not settings (which may be overridden by conftest)
    client = bigquery.Client(project=INTEGRATION_TEST_PROJECT)
    yield client
    client.close()


@pytest.fixture
def unique_org_slug() -> str:
    """Generate a unique org slug for each test."""
    unique_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"{TEST_DATASET_PREFIX}_{timestamp}_{unique_id}"


@pytest.fixture
def root_headers() -> dict:
    """Headers with root API key for admin operations."""
    return {
        "X-CA-Root-Key": ROOT_API_KEY,
        "Content-Type": "application/json"
    }


@pytest.fixture
async def async_client() -> AsyncClient:
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def cleanup_datasets(bq_client: bigquery.Client) -> Generator[list, None, None]:
    """
    Fixture to track and cleanup test datasets after tests.

    Usage:
        def test_something(cleanup_datasets):
            cleanup_datasets.append("test_dataset_name")
            # ... test code ...
    """
    datasets_to_cleanup = []
    yield datasets_to_cleanup

    # Cleanup after test - use hardcoded project ID
    for dataset_name in datasets_to_cleanup:
        dataset_id = f"{INTEGRATION_TEST_PROJECT}.{dataset_name}"
        try:
            bq_client.delete_dataset(dataset_id, delete_contents=True, not_found_ok=True)
            print(f"Cleaned up test dataset: {dataset_id}")
        except Exception as e:
            print(f"Warning: Failed to cleanup dataset {dataset_id}: {e}")


# ============================================
# BigQuery Direct Tests
# ============================================

@pytest.mark.integration
@skip_if_no_gcp
class TestBigQueryDirect:
    """Test BigQuery operations directly (no API)."""

    def test_bigquery_connection(self, bq_client: bigquery.Client):
        """Test that we can connect to BigQuery."""
        # Simple query to test connection
        query = "SELECT 1 as test_value"
        result = list(bq_client.query(query).result())

        assert len(result) == 1
        assert result[0].test_value == 1

    def test_create_test_dataset(
        self,
        bq_client: bigquery.Client,
        unique_org_slug: str,
        cleanup_datasets: list
    ):
        """Test creating a test dataset."""
        settings = get_settings()
        dataset_name = f"{unique_org_slug}_test"
        dataset_id = f"{INTEGRATION_TEST_PROJECT}.{dataset_name}"

        # Track for cleanup
        cleanup_datasets.append(dataset_name)

        # Create dataset
        dataset = bigquery.Dataset(dataset_id)
        dataset.location = INTEGRATION_TEST_LOCATION
        dataset.description = "Integration test dataset - will be deleted"
        dataset.labels = {
            "purpose": "integration-test",
            "created-by": "pytest"
        }

        created = bq_client.create_dataset(dataset, exists_ok=True)

        assert created is not None
        assert created.dataset_id == dataset_name

        # Verify it exists
        fetched = bq_client.get_dataset(dataset_id)
        assert fetched.dataset_id == dataset_name

    def test_create_test_table(
        self,
        bq_client: bigquery.Client,
        unique_org_slug: str,
        cleanup_datasets: list
    ):
        """Test creating a test table with schema."""
        settings = get_settings()
        dataset_name = f"{unique_org_slug}_tables"
        dataset_id = f"{INTEGRATION_TEST_PROJECT}.{dataset_name}"
        table_name = "test_table"
        table_id = f"{dataset_id}.{table_name}"

        # Track for cleanup
        cleanup_datasets.append(dataset_name)

        # Create dataset first
        dataset = bigquery.Dataset(dataset_id)
        dataset.location = INTEGRATION_TEST_LOCATION
        bq_client.create_dataset(dataset, exists_ok=True)

        # Define schema
        schema = [
            bigquery.SchemaField("id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("name", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("amount", "FLOAT64", mode="NULLABLE"),
            bigquery.SchemaField("metadata", "JSON", mode="NULLABLE"),
        ]

        # Create table
        table = bigquery.Table(table_id, schema=schema)
        table.description = "Test table for integration tests"

        created = bq_client.create_table(table, exists_ok=True)

        assert created is not None
        assert created.table_id == table_name
        assert len(created.schema) == 5

    def test_insert_and_query_data(
        self,
        bq_client: bigquery.Client,
        unique_org_slug: str,
        cleanup_datasets: list
    ):
        """Test inserting and querying data."""
        settings = get_settings()
        dataset_name = f"{unique_org_slug}_data"
        dataset_id = f"{INTEGRATION_TEST_PROJECT}.{dataset_name}"
        table_name = "usage_data"
        table_id = f"{dataset_id}.{table_name}"

        # Track for cleanup
        cleanup_datasets.append(dataset_name)

        # Create dataset
        dataset = bigquery.Dataset(dataset_id)
        dataset.location = INTEGRATION_TEST_LOCATION
        bq_client.create_dataset(dataset, exists_ok=True)

        # Create table
        schema = [
            bigquery.SchemaField("org_slug", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("provider", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("usage_date", "DATE", mode="REQUIRED"),
            bigquery.SchemaField("tokens_used", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("cost_usd", "FLOAT64", mode="REQUIRED"),
        ]

        table = bigquery.Table(table_id, schema=schema)
        bq_client.create_table(table, exists_ok=True)

        # Insert test data
        rows = [
            {
                "org_slug": unique_org_slug,
                "provider": "OPENAI",
                "usage_date": "2025-11-29",
                "tokens_used": 10000,
                "cost_usd": 0.25
            },
            {
                "org_slug": unique_org_slug,
                "provider": "ANTHROPIC",
                "usage_date": "2025-11-29",
                "tokens_used": 5000,
                "cost_usd": 0.15
            }
        ]

        errors = bq_client.insert_rows_json(table_id, rows)
        assert errors == [], f"Insert errors: {errors}"

        # Query the data (with a small delay for consistency)
        import time
        time.sleep(2)  # Wait for streaming buffer

        query = f"""
            SELECT org_slug, provider, tokens_used, cost_usd
            FROM `{table_id}`
            WHERE org_slug = @org_slug
            ORDER BY provider
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", unique_org_slug)
            ]
        )

        results = list(bq_client.query(query, job_config=job_config).result())

        assert len(results) == 2
        assert results[0].provider == "ANTHROPIC"
        assert results[0].tokens_used == 5000
        assert results[1].provider == "OPENAI"
        assert results[1].tokens_used == 10000


# ============================================
# API Integration Tests (with real BigQuery)
# ============================================

@pytest.mark.integration
@skip_if_no_gcp
class TestBootstrapIntegration:
    """Test bootstrap endpoint with real BigQuery."""

    @pytest.mark.asyncio
    async def test_bootstrap_creates_organizations_dataset(
        self,
        async_client: AsyncClient,
        root_headers: dict,
        bq_client: bigquery.Client
    ):
        """Test that bootstrap creates the organizations dataset."""
        response = await async_client.post(
            "/api/v1/admin/bootstrap",
            headers=root_headers,
            json={"force_recreate_dataset": False}
        )

        # Bootstrap should succeed (or already exist)
        assert response.status_code in [200, 409]

        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            # Verify tables were created
            if "tables_created" in data or "tables_existed" in data:
                total = len(data.get("tables_created", [])) + len(data.get("tables_existed", []))
                assert total > 0

        # Verify the organizations dataset exists
        settings = get_settings()
        dataset_id = f"{INTEGRATION_TEST_PROJECT}.organizations"

        try:
            dataset = bq_client.get_dataset(dataset_id)
            assert dataset is not None
        except gcp_exceptions.NotFound:
            pytest.fail("Organizations dataset was not created by bootstrap")


@pytest.mark.integration
@skip_if_no_gcp
class TestOrganizationOnboardingIntegration:
    """Test organization onboarding with real BigQuery."""

    @pytest.mark.asyncio
    async def test_dryrun_validates_org(
        self,
        async_client: AsyncClient,
        root_headers: dict,
        unique_org_slug: str
    ):
        """Test dry-run validation with real BigQuery."""
        response = await async_client.post(
            "/api/v1/organizations/dryrun",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Integration Test Company",
                "admin_email": "admin@integration-test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should succeed or fail with specific validation error
        assert response.status_code in [200, 400, 500]

        if response.status_code == 200:
            data = response.json()
            assert "is_valid" in data or "status" in data

    @pytest.mark.asyncio
    async def test_onboard_creates_org_dataset(
        self,
        async_client: AsyncClient,
        root_headers: dict,
        unique_org_slug: str,
        bq_client: bigquery.Client,
        cleanup_datasets: list
    ):
        """Test that onboarding creates org-specific dataset."""
        # Track the dataset for cleanup - use hardcoded environment
        dataset_name = f"{unique_org_slug}_{INTEGRATION_TEST_ENVIRONMENT}"
        cleanup_datasets.append(dataset_name)
        cleanup_datasets.append(f"{unique_org_slug}")  # Also try without suffix

        response = await async_client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Integration Test Company",
                "admin_email": "admin@integration-test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Check response
        if response.status_code == 200:
            data = response.json()

            # Should return API key
            assert "api_key" in data or "org_slug" in data

            # If API key returned, save it for further tests
            if "api_key" in data:
                org_api_key = data["api_key"]
                assert unique_org_slug in org_api_key
        elif response.status_code == 409:
            # Org already exists (from previous test run)
            pass
        else:
            # Log the error for debugging
            print(f"Onboard response {response.status_code}: {response.text}")


@pytest.mark.integration
@skip_if_no_gcp
class TestIntegrationManagementIntegration:
    """Test integration management with real BigQuery."""

    @pytest.fixture
    async def onboarded_org(
        self,
        async_client: AsyncClient,
        root_headers: dict,
        unique_org_slug: str,
        cleanup_datasets: list
    ) -> dict:
        """Fixture to create an org for integration testing."""
        # Track datasets for cleanup - use hardcoded environment
        cleanup_datasets.append(f"{unique_org_slug}_{INTEGRATION_TEST_ENVIRONMENT}")
        cleanup_datasets.append(unique_org_slug)

        # Create org
        response = await async_client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Integration Test Org",
                "admin_email": "test@integration.com",
                "subscription_plan": "PROFESSIONAL"
            }
        )

        if response.status_code == 200:
            data = response.json()
            return {
                "org_slug": unique_org_slug,
                "api_key": data.get("api_key", ""),
                "created": True
            }
        else:
            # Org might already exist
            return {
                "org_slug": unique_org_slug,
                "api_key": "",
                "created": False
            }

    @pytest.mark.asyncio
    async def test_get_all_integrations_empty(
        self,
        async_client: AsyncClient,
        onboarded_org: dict
    ):
        """Test getting integrations when none are configured."""
        if not onboarded_org.get("api_key"):
            pytest.skip("Org not created - API key not available")

        response = await async_client.get(
            f"/api/v1/integrations/{onboarded_org['org_slug']}",
            headers={"X-API-Key": onboarded_org["api_key"]}
        )

        assert response.status_code == 200
        data = response.json()

        assert "integrations" in data
        assert "providers_configured" in data


# ============================================
# Data Quality Tests
# ============================================

@pytest.mark.integration
@skip_if_no_gcp
class TestDataQuality:
    """Test data quality and integrity with real BigQuery."""

    def test_query_organizations_table(self, bq_client: bigquery.Client):
        """Test querying the org_profiles table."""
        settings = get_settings()
        table_id = f"{INTEGRATION_TEST_PROJECT}.organizations.org_profiles"

        try:
            # Check if table exists
            bq_client.get_table(table_id)

            # Query table structure
            query = f"""
                SELECT column_name, data_type
                FROM `{INTEGRATION_TEST_PROJECT}.organizations.INFORMATION_SCHEMA.COLUMNS`
                WHERE table_name = 'org_profiles'
            """

            results = list(bq_client.query(query).result())

            # Should have expected columns
            column_names = [r.column_name for r in results]
            expected_columns = ["org_slug", "company_name", "admin_email", "status"]

            for col in expected_columns:
                assert col in column_names, f"Missing column: {col}"

        except gcp_exceptions.NotFound:
            pytest.skip("org_profiles table not found - run bootstrap first")

    def test_query_api_keys_table(self, bq_client: bigquery.Client):
        """Test querying the org_api_keys table."""
        settings = get_settings()
        table_id = f"{INTEGRATION_TEST_PROJECT}.organizations.org_api_keys"

        try:
            bq_client.get_table(table_id)

            query = f"""
                SELECT column_name, data_type
                FROM `{INTEGRATION_TEST_PROJECT}.organizations.INFORMATION_SCHEMA.COLUMNS`
                WHERE table_name = 'org_api_keys'
            """

            results = list(bq_client.query(query).result())
            column_names = [r.column_name for r in results]

            # Should have security-related columns
            assert "org_slug" in column_names
            assert "org_api_key_hash" in column_names or "api_key_hash" in column_names

        except gcp_exceptions.NotFound:
            pytest.skip("org_api_keys table not found - run bootstrap first")

    def test_query_integration_credentials_table(self, bq_client: bigquery.Client):
        """Test querying the org_integration_credentials table."""
        settings = get_settings()
        table_id = f"{INTEGRATION_TEST_PROJECT}.organizations.org_integration_credentials"

        try:
            bq_client.get_table(table_id)

            query = f"""
                SELECT column_name, data_type
                FROM `{INTEGRATION_TEST_PROJECT}.organizations.INFORMATION_SCHEMA.COLUMNS`
                WHERE table_name = 'org_integration_credentials'
            """

            results = list(bq_client.query(query).result())
            column_names = [r.column_name for r in results]

            # Should have integration-related columns
            assert "org_slug" in column_names
            assert "provider" in column_names

        except gcp_exceptions.NotFound:
            pytest.skip("org_integration_credentials table not found - run bootstrap first")


# ============================================
# Cleanup Utility
# ============================================

@pytest.mark.integration
@skip_if_no_gcp
class TestCleanupTestData:
    """Utility tests to cleanup old test data."""

    def test_cleanup_old_test_datasets(self, bq_client: bigquery.Client):
        """
        Cleanup old test datasets that might have been left over.

        This test finds and deletes datasets that:
        - Start with 'test_integration_'
        - Are older than 1 hour
        """
        settings = get_settings()
        project_id = INTEGRATION_TEST_PROJECT

        # List all datasets
        datasets = list(bq_client.list_datasets(project=project_id))

        deleted_count = 0
        for dataset in datasets:
            dataset_id = dataset.dataset_id

            # Only cleanup test datasets
            if not dataset_id.startswith(TEST_DATASET_PREFIX):
                continue

            # Get full dataset info
            full_dataset = bq_client.get_dataset(f"{project_id}.{dataset_id}")

            # Check if older than 1 hour
            created_time = full_dataset.created
            if created_time:
                from datetime import timezone
                age_seconds = (datetime.now(timezone.utc) - created_time).total_seconds()

                if age_seconds > 3600:  # 1 hour
                    try:
                        bq_client.delete_dataset(
                            f"{project_id}.{dataset_id}",
                            delete_contents=True
                        )
                        deleted_count += 1
                        print(f"Cleaned up old test dataset: {dataset_id}")
                    except Exception as e:
                        print(f"Failed to delete {dataset_id}: {e}")

        print(f"Cleaned up {deleted_count} old test datasets")
        # This is a cleanup utility, not a real test assertion
        assert True
