"""
Shared fixtures for org-chat-backend tests.
Mocks BigQuery and external services so tests run without GCP credentials.

IMPORTANT: Patches must target the LOCAL binding (where the import is used),
not the original module. Python's `from X import Y` creates a new reference
in the importing module, so we patch at the consumer, not the provider.
"""

import os
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

from fastapi.testclient import TestClient


# Set test environment BEFORE any imports that read settings
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("DISABLE_AUTH", "true")
os.environ.setdefault("ORGANIZATIONS_DATASET", "organizations")


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """Clear lru_cache on settings between tests."""
    from src.app.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def test_settings():
    """Return a test Settings instance."""
    from src.app.config import Settings
    return Settings(
        gcp_project_id="test-project",
        environment="test",
        disable_auth=True,
        organizations_dataset="organizations",
        bq_max_bytes_gate=10 * 1024 * 1024 * 1024,
    )


# ─── Core engine mocks (patch at consumer module) ─────────────────────

@pytest.fixture()
def mock_execute_query():
    """Patch execute_query at ALL consumer modules so safe_query and direct callers work."""
    with patch("src.core.tools.shared.execute_query") as m1, \
         patch("src.core.tools.alerts.execute_query") as m2, \
         patch("src.core.engine.bigquery.execute_query") as m3:
        for m in (m1, m2, m3):
            m.return_value = []
        # Return the shared module mock (used by safe_query → cost tools)
        yield m1


@pytest.fixture()
def mock_streaming_insert():
    """Patch streaming_insert at alert tools module."""
    with patch("src.core.tools.alerts.streaming_insert") as mock:
        mock.return_value = None
        yield mock


@pytest.fixture()
def mock_validate_org():
    """Patch validate_org at ALL consumer modules."""
    with patch("src.core.tools.shared.validate_org") as m1, \
         patch("src.core.tools.alerts.validate_org") as m2:
        for m in (m1, m2):
            m.return_value = None
        yield m1


@pytest.fixture()
def mock_guard_query():
    """Patch guard_query at shared tools module (used by safe_query)."""
    with patch("src.core.tools.shared.guard_query") as mock:
        mock.return_value = 1024 * 1024
        yield mock


# ─── API test fixtures ────────────────────────────────────────────────

@pytest.fixture()
def app():
    """Create FastAPI test app with mocked dependencies."""
    with patch("src.core.engine.bigquery.get_bq_client") as mock_client:
        mock_client.return_value = MagicMock()
        from src.app.main import app
        yield app


@pytest.fixture()
def client(app):
    """FastAPI test client with auth bypass."""
    return TestClient(app)


@pytest.fixture()
def auth_headers():
    """Standard auth headers for test requests."""
    return {
        "X-Org-Slug": "test_org",
        "X-API-Key": "test-api-key",
        "X-User-Id": "test-user-123",
    }


# Test data constants
TEST_ORG_SLUG = "test_org"
TEST_USER_ID = "test-user-123"
TEST_API_KEY = "test-api-key"
