"""
Root conftest.py - Sets environment variables before any module imports.

This file is loaded by pytest before any test modules, ensuring environment
variables are set before the settings module is imported.

Test Modes:
1. Unit Tests (default) - Run with mocked BigQuery
2. Integration Tests - Run with real BigQuery (requires credentials from .env.local)

To run integration tests:
    pytest -m integration --run-integration

To run only unit tests:
    pytest -m "not integration"

Environment Setup:
    All credentials are loaded from .env.local file. Create this file with:

    GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
    GCP_PROJECT_ID=your-project-id
    CA_ROOT_API_KEY=your-api-key-min-32-chars
    KMS_KEY_NAME=projects/.../cryptoKeys/...
    ENVIRONMENT=development
    RUN_INTEGRATION_TESTS=true

    Note: Auth is always enabled. Use test_api_keys.json for test credentials.
"""

import os
from pathlib import Path

# Load .env.local file if it exists
def load_env_local():
    """Load environment variables from .env.local file."""
    env_local_path = Path(__file__).parent.parent / ".env.local"
    if env_local_path.exists():
        with open(env_local_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    # Only set if not already set (allows override from command line)
                    if key not in os.environ:
                        os.environ[key] = value

# Load .env.local FIRST before any other operations
load_env_local()

# Set environment variables BEFORE any imports that might load settings
# These must be set before src.app.config is imported anywhere
# Only set test defaults if GCP_PROJECT_ID is not already set (for integration tests)
if os.environ.get("GCP_PROJECT_ID") in [None, "", "test-project"]:
    os.environ["GCP_PROJECT_ID"] = "test-project"
    os.environ.setdefault("ENVIRONMENT", "development")
    os.environ.setdefault("KMS_KEY_NAME", "projects/test/locations/global/keyRings/test/cryptoKeys/test")
    os.environ.setdefault("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")
    # Auth is always enabled - use test_api_keys.json for test credentials
else:
    # Integration test mode - use real credentials from .env.local
    os.environ.setdefault("ENVIRONMENT", "development")
    # Auth is always enabled

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import MagicMock, patch


# ============================================
# Pytest Configuration
# ============================================

def pytest_addoption(parser):
    """Add custom pytest options."""
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run integration tests that require BigQuery"
    )


def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test requiring BigQuery"
    )


def pytest_collection_modifyitems(config, items):
    """Skip integration tests unless explicitly requested."""
    if config.getoption("--run-integration"):
        # Set environment flag for integration tests
        os.environ["RUN_INTEGRATION_TESTS"] = "true"
        return

    skip_integration = pytest.mark.skip(reason="Need --run-integration option to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)


def is_bigquery_available():
    """Check if real BigQuery credentials are available."""
    return (
        os.environ.get("GCP_PROJECT_ID") not in ["test-project", None] and
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") is not None
    )


# ============================================
# FastAPI Test Client (Unit Tests - Mocked)
# ============================================

@pytest.fixture
async def async_client():
    """
    Async HTTP client for testing FastAPI endpoints.

    Uses httpx.AsyncClient with ASGITransport for testing FastAPI.
    Mocks authentication to bypass X-API-Key validation in tests.
    """
    # Import app here to ensure env vars are set first
    from src.app.main import app

    # Mock the get_current_org dependency to return a test org
    def mock_get_current_org():
        return {
            "org_slug": "test_org_123",
            "company_name": "Test Organization",
            "admin_email": "admin@test.com",
            "status": "ACTIVE",
            "subscription": {
                "plan_name": "ENTERPRISE",
                "status": "ACTIVE",
                "max_pipelines_per_day": 999999,
                "max_pipelines_per_month": 999999,
                "max_concurrent_pipelines": 999999
            },
            "org_api_key_id": "test-key-123"
        }

    # Mock BigQuery client
    with patch("src.app.dependencies.auth.get_bigquery_client") as mock_bq_client:
        mock_client = MagicMock()
        mock_bq_client.return_value = mock_client

        # Mock get_current_org to return test org
        with patch("src.app.dependencies.auth.get_current_org", return_value=mock_get_current_org()):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client


# ============================================
# FastAPI Test Client (Integration Tests - Real BigQuery)
# ============================================

@pytest.fixture
async def integration_client():
    """
    Async HTTP client for integration tests with real BigQuery.

    Requires:
    - GOOGLE_APPLICATION_CREDENTIALS environment variable
    - GCP_PROJECT_ID set to a real project
    - An existing test organization in BigQuery

    Usage: pytest -m integration --run-integration
    """
    if not is_bigquery_available():
        pytest.skip("BigQuery credentials not available")

    from src.app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ============================================
# Mock Settings
# ============================================

@pytest.fixture
def mock_settings():
    """Mock application settings for tests."""
    with patch("src.app.config.get_settings") as mock_get_settings:
        settings = MagicMock()
        settings.gcp_project_id = "test-project"
        settings.environment = "development"
        settings.kms_key_name = "projects/test/locations/global/keyRings/test/cryptoKeys/test"
        settings.ca_root_api_key = "test-ca-root-key-secure-32chars"
        settings.disable_auth = True
        settings.default_org_slug = "test_org_123"
        settings.is_development = True

        mock_get_settings.return_value = settings
        yield settings
