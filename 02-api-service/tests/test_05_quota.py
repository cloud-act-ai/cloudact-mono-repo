"""
Unit Tests for Quota API Endpoints

Tests quota usage retrieval endpoint with MOCKED BigQuery and Auth.
These are unit tests - for integration tests see: tests/quota_enforcement/

Test Coverage:
- Quota response structure validation
- Usage percentage calculations
- NULL value handling
- Zero division edge cases
"""

import os
import pytest
from unittest.mock import MagicMock
from datetime import date
from httpx import AsyncClient, ASGITransport

# Set environment variables BEFORE importing app
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("ENVIRONMENT", "development")
if "CA_ROOT_API_KEY" not in os.environ:
    os.environ["CA_ROOT_API_KEY"] = "test-root-key-for-testing-only-32chars"
os.environ.setdefault("KMS_KEY_NAME", "projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/api-key-encryption")

from src.app.main import app
from src.app.dependencies.auth import get_org_or_admin_auth, AuthResult

# Test constants
TEST_ORG_SLUG = "test_org_123"


# ============================================
# Mock Auth Dependency
# ============================================

def get_mock_auth():
    """Return a mock auth result for testing."""
    return AuthResult(
        is_admin=False,
        org_slug=TEST_ORG_SLUG,
        org_data={
            "org_slug": TEST_ORG_SLUG,
            "company_name": "Test Organization",
            "admin_email": "test@test.com",
            "status": "ACTIVE"
        }
    )


# ============================================
# Unit Tests with Mocked Dependencies
# ============================================

@pytest.mark.asyncio
async def test_get_quota_success():
    """Test getting quota with mocked BigQuery response."""
    today = date.today()

    # Mock the BigQuery client
    mock_client = MagicMock()
    mock_client.query.return_value = [
        {
            "pipelines_run_today": 5,
            "pipelines_run_month": 50,
            "concurrent_pipelines_running": 1,
            "usage_date": today,
            "daily_limit": 10,
            "monthly_limit": 300,
            "concurrent_limit": 3,
            "plan_name": "STARTER"
        }
    ]

    from src.core.engine.bq_client import get_bigquery_client

    # Override both auth and BigQuery client
    app.dependency_overrides[get_bigquery_client] = lambda: mock_client
    app.dependency_overrides[get_org_or_admin_auth] = get_mock_auth

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/organizations/{TEST_ORG_SLUG}/quota",
                headers={"X-API-Key": "mock-api-key"}
            )

        assert response.status_code == 200
        data = response.json()

        assert data["org_slug"] == TEST_ORG_SLUG
        assert data["pipelinesRunToday"] == 5
        assert data["dailyLimit"] == 10
        assert data["pipelinesRunMonth"] == 50
        assert data["monthlyLimit"] == 300
        assert data["concurrentRunning"] == 1
        assert data["concurrentLimit"] == 3
        assert "dailyUsagePercent" in data
        assert "monthlyUsagePercent" in data
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_quota_org_not_found():
    """Test getting quota when org subscription not found in BigQuery."""
    from src.core.engine.bq_client import get_bigquery_client

    mock_client = MagicMock()
    mock_client.query.return_value = []  # No results

    app.dependency_overrides[get_bigquery_client] = lambda: mock_client
    app.dependency_overrides[get_org_or_admin_auth] = get_mock_auth

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/organizations/{TEST_ORG_SLUG}/quota",
                headers={"X-API-Key": "mock-api-key"}
            )

        assert response.status_code == 404
        detail = response.json()["detail"]
        assert isinstance(detail, dict)
        assert detail["error"] == "not_found"
        assert "not found" in detail["message"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_quota_no_usage_record():
    """Test getting quota when no usage record exists yet (new org)."""
    from src.core.engine.bq_client import get_bigquery_client

    mock_client = MagicMock()
    mock_client.query.return_value = [
        {
            "pipelines_run_today": None,
            "pipelines_run_month": None,
            "concurrent_pipelines_running": None,
            "usage_date": None,
            "daily_limit": 6,
            "monthly_limit": 180,
            "concurrent_limit": 2,
            "plan_name": "STARTER"
        }
    ]

    app.dependency_overrides[get_bigquery_client] = lambda: mock_client
    app.dependency_overrides[get_org_or_admin_auth] = get_mock_auth

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/organizations/{TEST_ORG_SLUG}/quota",
                headers={"X-API-Key": "mock-api-key"}
            )

        assert response.status_code == 200
        data = response.json()

        # Should default to 0 for NULL usage values
        assert data["pipelinesRunToday"] == 0
        assert data["pipelinesRunMonth"] == 0
        assert data["concurrentRunning"] == 0
        assert data["dailyLimit"] == 6
        assert data["monthlyLimit"] == 180
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_quota_usage_percentages():
    """Test that usage percentages are calculated correctly."""
    from src.core.engine.bq_client import get_bigquery_client

    today = date.today()

    mock_client = MagicMock()
    mock_client.query.return_value = [
        {
            "pipelines_run_today": 8,
            "pipelines_run_month": 150,
            "concurrent_pipelines_running": 2,
            "usage_date": today,
            "daily_limit": 10,
            "monthly_limit": 300,
            "concurrent_limit": 3,
            "plan_name": "STARTER"
        }
    ]

    app.dependency_overrides[get_bigquery_client] = lambda: mock_client
    app.dependency_overrides[get_org_or_admin_auth] = get_mock_auth

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/organizations/{TEST_ORG_SLUG}/quota",
                headers={"X-API-Key": "mock-api-key"}
            )

        assert response.status_code == 200
        data = response.json()

        # 8/10 = 80%
        assert data["dailyUsagePercent"] == 80.0
        # 150/300 = 50%
        assert data["monthlyUsagePercent"] == 50.0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_quota_zero_limits_no_division_error():
    """Test that zero limits don't cause division by zero."""
    from src.core.engine.bq_client import get_bigquery_client

    today = date.today()

    mock_client = MagicMock()
    mock_client.query.return_value = [
        {
            "pipelines_run_today": 0,
            "pipelines_run_month": 0,
            "concurrent_pipelines_running": 0,
            "usage_date": today,
            "daily_limit": 0,
            "monthly_limit": 0,
            "concurrent_limit": 0,
            "plan_name": "STARTER"
        }
    ]

    app.dependency_overrides[get_bigquery_client] = lambda: mock_client
    app.dependency_overrides[get_org_or_admin_auth] = get_mock_auth

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/organizations/{TEST_ORG_SLUG}/quota",
                headers={"X-API-Key": "mock-api-key"}
            )

        assert response.status_code == 200
        data = response.json()

        # Should default to 0% for zero limits
        assert data["dailyUsagePercent"] == 0.0
        assert data["monthlyUsagePercent"] == 0.0
    finally:
        app.dependency_overrides.clear()
