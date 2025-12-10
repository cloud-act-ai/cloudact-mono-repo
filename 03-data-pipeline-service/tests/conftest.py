"""
Root conftest.py - Sets environment variables before any module imports.

This file is loaded by pytest before any test modules, ensuring environment
variables are set before the settings module is imported.
"""

import os

# Set environment variables BEFORE any imports that might load settings
# These must be set before src.app.config is imported anywhere
os.environ["GCP_PROJECT_ID"] = "test-project"
os.environ["ENVIRONMENT"] = "development"
os.environ["KMS_KEY_NAME"] = "projects/test/locations/global/keyRings/test/cryptoKeys/test"
os.environ["CA_ROOT_API_KEY"] = "test-ca-root-key-secure-32chars"
os.environ["DISABLE_AUTH"] = "true"

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import MagicMock, patch


# ============================================
# FastAPI Test Client
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
