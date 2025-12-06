"""
Tests for Quota API Endpoints

Tests quota usage retrieval endpoint.
"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import date
from httpx import AsyncClient, ASGITransport

# Set environment variables BEFORE importing app
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("CA_ROOT_API_KEY", "test-root-key-for-testing-only-32chars")
os.environ.setdefault("DISABLE_AUTH", "true")  # Disable auth for simpler testing
os.environ.setdefault("KMS_KEY_NAME", "projects/test/locations/global/keyRings/test/cryptoKeys/test")

from src.app.main import app

ROOT_API_KEY = "test-root-key-for-testing-only-32chars"


@pytest.mark.asyncio
async def test_get_quota_success():
    """Test getting quota with mocked BigQuery response."""
    today = date.today()

    with patch("src.app.routers.quota.get_bigquery_client") as mock_bq:
        mock_client = MagicMock()
        mock_bq.return_value = mock_client

        # Mock the query response
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

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/organizations/test_org/quota")

        assert response.status_code == 200
        data = response.json()

        assert data["org_slug"] == "test_org"
        assert data["pipelinesRunToday"] == 5
        assert data["dailyLimit"] == 10
        assert data["pipelinesRunMonth"] == 50
        assert data["monthlyLimit"] == 300
        assert data["concurrentRunning"] == 1
        assert data["concurrentLimit"] == 3
        assert "dailyUsagePercent" in data
        assert "monthlyUsagePercent" in data


@pytest.mark.asyncio
async def test_get_quota_org_not_found():
    """Test getting quota for non-existent org."""
    with patch("src.app.routers.quota.get_bigquery_client") as mock_bq:
        mock_client = MagicMock()
        mock_bq.return_value = mock_client

        # No results from query
        mock_client.query.return_value = []

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/organizations/nonexistent_org/quota")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_quota_no_usage_record():
    """Test getting quota when no usage record exists yet (new org)."""
    with patch("src.app.routers.quota.get_bigquery_client") as mock_bq:
        mock_client = MagicMock()
        mock_bq.return_value = mock_client

        today = date.today()

        # Return subscription limits but NULL usage (LEFT JOIN with no match)
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

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/organizations/new_org/quota")

        assert response.status_code == 200
        data = response.json()

        # Should default to 0 for NULL usage values
        assert data["pipelinesRunToday"] == 0
        assert data["pipelinesRunMonth"] == 0
        assert data["concurrentRunning"] == 0
        assert data["dailyLimit"] == 6
        assert data["monthlyLimit"] == 180


@pytest.mark.asyncio
async def test_get_quota_usage_percentages():
    """Test that usage percentages are calculated correctly."""
    today = date.today()

    with patch("src.app.routers.quota.get_bigquery_client") as mock_bq:
        mock_client = MagicMock()
        mock_bq.return_value = mock_client

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

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/organizations/test_org/quota")

        assert response.status_code == 200
        data = response.json()

        # 8/10 = 80%
        assert data["dailyUsagePercent"] == 80.0
        # 150/300 = 50%
        assert data["monthlyUsagePercent"] == 50.0


@pytest.mark.asyncio
async def test_get_quota_zero_limits_no_division_error():
    """Test that zero limits don't cause division by zero."""
    today = date.today()

    with patch("src.app.routers.quota.get_bigquery_client") as mock_bq:
        mock_client = MagicMock()
        mock_bq.return_value = mock_client

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

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/organizations/test_org/quota")

        assert response.status_code == 200
        data = response.json()

        # Should default to 0% for zero limits
        assert data["dailyUsagePercent"] == 0.0
        assert data["monthlyUsagePercent"] == 0.0
