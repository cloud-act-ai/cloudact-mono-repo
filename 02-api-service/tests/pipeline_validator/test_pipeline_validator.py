"""
Test Suite for Pipeline Validator Router

Tests the pipeline validator API endpoints:
- GET /api/v1/validator/pipelines - List all available pipelines
- GET /api/v1/validator/pipelines/{pipeline_id} - Get specific pipeline details
- POST /api/v1/validator/validate/{org_slug} - Validate pipeline execution
- POST /api/v1/validator/complete/{org_slug} - Report pipeline completion

These tests cover:
- Pipeline listing and filtering
- Organization validation (subscription status, quota, credentials)
- Pipeline validation before execution
- Authentication and authorization
- Input validation and error handling
"""

import os
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient, ASGITransport
from google.cloud import bigquery as bq

# Set environment variables BEFORE importing app
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("CA_ROOT_API_KEY", "test-root-key-for-testing-only-32chars")
os.environ.setdefault("KMS_KEY_NAME", "projects/test/locations/global/keyRings/test/cryptoKeys/test")

from src.app.main import app
from src.app.dependencies.auth import get_current_org


# ============================================
# Test Configuration
# ============================================

TEST_ORG_SLUG = "test_org_validator"
TEST_ORG_API_KEY = "test-org-api-key-validator-32chars"


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def org_headers():
    """Headers with org API key for authenticated operations."""
    return {
        "X-API-Key": TEST_ORG_API_KEY,
        "Content-Type": "application/json"
    }


@pytest.fixture
def no_auth_headers():
    """Headers without authentication."""
    return {
        "Content-Type": "application/json"
    }


@pytest.fixture
def mock_org():
    """Mock organization data with active subscription."""
    return {
        "org_slug": TEST_ORG_SLUG,
        "company_name": "Test Organization",
        "admin_email": "admin@test.com",
        "status": "ACTIVE",
        "org_dataset_id": f"{TEST_ORG_SLUG}_prod",
        "subscription": {
            "plan_name": "PRO",
            "status": "ACTIVE",
            "max_pipelines_per_day": 100,
            "max_pipelines_per_month": 2500,
            "max_concurrent_pipelines": 5
        },
        "org_api_key_id": "test-key-123"
    }


@pytest.fixture
def mock_org_suspended():
    """Mock organization with suspended subscription."""
    return {
        "org_slug": TEST_ORG_SLUG,
        "company_name": "Test Organization",
        "admin_email": "admin@test.com",
        "status": "ACTIVE",
        "org_dataset_id": f"{TEST_ORG_SLUG}_prod",
        "subscription": {
            "plan_name": "PRO",
            "status": "SUSPENDED",
            "max_pipelines_per_day": 100,
            "max_pipelines_per_month": 2500,
            "max_concurrent_pipelines": 5
        },
        "org_api_key_id": "test-key-123"
    }


@pytest.fixture
def mock_quota():
    """Mock quota information."""
    return {
        "daily_usage": 10,
        "monthly_usage": 150,
        "daily_limit": 100,
        "monthly_limit": 2500,
        "daily_remaining": 90,
        "monthly_remaining": 2350
    }


@pytest.fixture(autouse=True)
def cleanup_app_overrides():
    """Automatically clean up FastAPI dependency overrides after each test."""
    yield
    app.dependency_overrides.clear()


# ============================================
# Pipeline Listing Tests (Public Endpoints)
# ============================================

@pytest.mark.asyncio
async def test_list_all_pipelines():
    """
    Test listing all available pipelines.

    Endpoint: GET /api/v1/validator/pipelines
    Auth: None required (public endpoint)
    Expected: 200 OK with list of pipelines
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/validator/pipelines")

        assert response.status_code == 200
        data = response.json()

        # Verify response structure
        assert "success" in data
        assert data["success"] is True
        assert "pipelines" in data
        assert "total" in data

        # Should have multiple pipelines from pipelines.yml
        assert data["total"] > 0
        assert len(data["pipelines"]) == data["total"]

        # Verify pipeline structure
        if data["pipelines"]:
            pipeline = data["pipelines"][0]
            assert "id" in pipeline
            assert "name" in pipeline
            assert "description" in pipeline
            assert "provider" in pipeline
            assert "domain" in pipeline
            assert "pipeline" in pipeline
            assert "required_integration" in pipeline
            assert "enabled" in pipeline


@pytest.mark.asyncio
async def test_list_pipelines_by_provider():
    """
    Test filtering pipelines by provider.

    Endpoint: GET /api/v1/validator/pipelines?provider=gcp
    Auth: None required
    Expected: 200 OK with only GCP pipelines
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/validator/pipelines?provider=gcp")

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True

        # Verify all returned pipelines are for GCP
        for pipeline in data["pipelines"]:
            assert pipeline["provider"].lower() == "gcp"


@pytest.mark.asyncio
async def test_list_pipelines_include_disabled():
    """
    Test listing pipelines including disabled ones.

    Endpoint: GET /api/v1/validator/pipelines?enabled_only=false
    Auth: None required
    Expected: 200 OK with all pipelines (enabled and disabled)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get all pipelines
        response_all = await client.get("/api/v1/validator/pipelines?enabled_only=false")
        data_all = response_all.json()

        # Get enabled only
        response_enabled = await client.get("/api/v1/validator/pipelines?enabled_only=true")
        data_enabled = response_enabled.json()

        # All should include at least as many as enabled
        assert data_all["total"] >= data_enabled["total"]


@pytest.mark.asyncio
async def test_get_specific_pipeline():
    """
    Test getting details for a specific pipeline.

    Endpoint: GET /api/v1/validator/pipelines/{pipeline_id}
    Auth: None required
    Expected: 200 OK with pipeline details
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Use a known pipeline ID from pipelines.yml
        pipeline_id = "gcp_billing"
        response = await client.get(f"/api/v1/validator/pipelines/{pipeline_id}")

        assert response.status_code == 200
        data = response.json()

        # Verify pipeline details
        assert data["id"] == pipeline_id
        assert data["name"] == "GCP Billing"
        assert data["provider"] == "gcp"
        assert data["domain"] == "cost"
        assert data["pipeline"] == "billing"
        assert data["required_integration"] == "GCP_SA"


@pytest.mark.asyncio
async def test_get_nonexistent_pipeline():
    """
    Test getting a pipeline that doesn't exist.

    Endpoint: GET /api/v1/validator/pipelines/nonexistent
    Auth: None required
    Expected: 404 Not Found
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/validator/pipelines/nonexistent_pipeline")

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()


# ============================================
# Pipeline Validation Tests (Authenticated)
# ============================================

@pytest.mark.asyncio
async def test_validate_pipeline_success(mock_org, mock_quota):
    """
    Test successful pipeline validation.

    Endpoint: POST /api/v1/validator/validate/{org_slug}
    Auth: X-API-Key required
    Expected: 200 OK with validation result
    """
    # Override authentication dependency
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    with patch("src.app.dependencies.auth.validate_quota", new_callable=AsyncMock, return_value=mock_quota):
        with patch("src.app.dependencies.auth.reserve_pipeline_quota_atomic", new_callable=AsyncMock):
            with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq_client:
                # Mock BigQuery client for credential check
                mock_client = MagicMock()
                mock_query_result = [{"credential_id": "test-cred-123"}]
                mock_client.query.return_value = mock_query_result
                mock_bq_client.return_value = mock_client

                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
                        headers={"X-API-Key": "test-key"},
                        json={
                            "pipeline_id": "gcp_billing",
                            "include_credentials": False
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()

                    # Verify validation response
                    assert data["valid"] is True
                    assert data["org_slug"] == TEST_ORG_SLUG
                    assert data["pipeline_id"] == "gcp_billing"
                    assert data["org_dataset_id"] == f"{TEST_ORG_SLUG}_prod"
                    assert data["subscription"] is not None
                    assert data["quota"] is not None
                    assert data["pipeline_config"] is not None
                    assert data["error"] is None


@pytest.mark.asyncio
async def test_validate_pipeline_org_mismatch(mock_org):
    """
    Test validation fails when org_slug in URL doesn't match authenticated org.

    Expected: Validation response with valid=False and ORG_MISMATCH error
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Try to validate for a different org
        response = await client.post(
            "/api/v1/validator/validate/different_org",
            headers={"X-API-Key": "test-key"},
            json={
                "pipeline_id": "gcp_billing",
                "include_credentials": False
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Validation should fail with org mismatch
        assert data["valid"] is False
        assert data["error_code"] == "ORG_MISMATCH"
        assert "mismatch" in data["error"].lower()


@pytest.mark.asyncio
async def test_validate_pipeline_not_found(mock_org):
    """
    Test validation fails for nonexistent pipeline.

    Expected: Validation response with valid=False and PIPELINE_NOT_FOUND error
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
            headers={"X-API-Key": "test-key"},
            json={
                "pipeline_id": "nonexistent_pipeline",
                "include_credentials": False
            }
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is False
        assert data["error_code"] == "PIPELINE_NOT_FOUND"
        assert "not found" in data["error"].lower()


@pytest.mark.asyncio
async def test_validate_pipeline_subscription_inactive(mock_org_suspended):
    """
    Test validation fails when subscription is not active.

    Expected: Validation response with valid=False and SUBSCRIPTION_INACTIVE error
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org_suspended

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
            headers={"X-API-Key": "test-key"},
            json={
                "pipeline_id": "gcp_billing",
                "include_credentials": False
            }
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is False
        assert data["error_code"] == "SUBSCRIPTION_INACTIVE"
        assert data["subscription"]["status"] == "SUSPENDED"


@pytest.mark.asyncio
async def test_validate_pipeline_quota_exceeded(mock_org):
    """
    Test validation fails when quota is exceeded.

    Expected: Validation response with valid=False and QUOTA_EXCEEDED error
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    # Mock quota reservation to raise HTTPException
    from fastapi import HTTPException, status as http_status

    async def mock_reserve_quota(*args, **kwargs):
        raise HTTPException(
            status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily pipeline quota exceeded"
        )

    with patch("src.app.dependencies.auth.reserve_pipeline_quota_atomic", new_callable=AsyncMock, side_effect=mock_reserve_quota):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
                headers={"X-API-Key": "test-key"},
                json={
                    "pipeline_id": "gcp_billing",
                    "include_credentials": False
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert data["valid"] is False
            assert data["error_code"] == "QUOTA_EXCEEDED"


@pytest.mark.asyncio
async def test_validate_pipeline_integration_not_configured(mock_org, mock_quota):
    """
    Test validation fails when required integration is not configured.

    Expected: Validation response with valid=False and INTEGRATION_NOT_CONFIGURED error
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    with patch("src.app.dependencies.auth.validate_quota", new_callable=AsyncMock, return_value=mock_quota):
        with patch("src.app.dependencies.auth.reserve_pipeline_quota_atomic", new_callable=AsyncMock):
            with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq_client:
                # Mock BigQuery to return no credentials
                mock_client = MagicMock()
                mock_client.query.return_value = []  # No credentials found
                mock_bq_client.return_value = mock_client

                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
                        headers={"X-API-Key": "test-key"},
                        json={
                            "pipeline_id": "gcp_billing",
                            "include_credentials": False
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()

                    assert data["valid"] is False
                    assert data["error_code"] == "INTEGRATION_NOT_CONFIGURED"
                    assert "not configured" in data["error"].lower()


@pytest.mark.asyncio
async def test_validate_pipeline_with_credentials(mock_org, mock_quota):
    """
    Test validation with credentials retrieval.

    Expected: Valid response with decrypted credentials included
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    mock_credentials = {
        "provider": "GCP_SA",
        "service_account_key": {"type": "service_account"}
    }

    with patch("src.app.dependencies.auth.validate_quota", new_callable=AsyncMock, return_value=mock_quota):
        with patch("src.app.dependencies.auth.reserve_pipeline_quota_atomic", new_callable=AsyncMock):
            with patch("src.app.dependencies.auth.get_org_credentials",
                       new_callable=AsyncMock,
                       return_value=mock_credentials):
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
                        headers={"X-API-Key": "test-key"},
                        json={
                            "pipeline_id": "gcp_billing",
                            "include_credentials": True
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()

                    assert data["valid"] is True
                    assert data["credentials"] is not None
                    assert data["credentials"]["provider"] == "GCP_SA"


@pytest.mark.asyncio
async def test_validate_pipeline_no_integration_required(mock_org, mock_quota):
    """
    Test validation for pipeline with no required integration.

    Some pipelines like saas_cost don't require external integrations.
    Expected: Valid response without credential check
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    with patch("src.app.dependencies.auth.validate_quota", new_callable=AsyncMock, return_value=mock_quota):
        with patch("src.app.dependencies.auth.reserve_pipeline_quota_atomic", new_callable=AsyncMock):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
                    headers={"X-API-Key": "test-key"},
                    json={
                        "pipeline_id": "saas_subscription_saas_cost",
                        "include_credentials": False
                    }
                )

                assert response.status_code == 200
                data = response.json()

                # Should validate successfully without credentials
                assert data["valid"] is True
                assert data["credentials"] is None


# ============================================
# Pipeline Completion Tests
# ============================================

@pytest.mark.asyncio
async def test_report_pipeline_completion_success(mock_org):
    """
    Test reporting successful pipeline completion.

    Endpoint: POST /api/v1/validator/complete/{org_slug}?pipeline_status=SUCCESS
    Auth: X-API-Key required
    Expected: 200 OK with confirmation
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    with patch("src.app.dependencies.auth.increment_pipeline_usage", new_callable=AsyncMock) as mock_increment:
        with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq_client:
            mock_client = MagicMock()
            mock_bq_client.return_value = mock_client

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/validator/complete/{TEST_ORG_SLUG}?pipeline_status=SUCCESS",
                    headers={"X-API-Key": "test-key"}
                )

                assert response.status_code == 200
                data = response.json()

                assert data["success"] is True
                assert data["org_slug"] == TEST_ORG_SLUG
                assert data["pipeline_status"] == "SUCCESS"
                assert "updated" in data["message"].lower()

                # Verify increment_pipeline_usage was called
                mock_increment.assert_called_once()


@pytest.mark.asyncio
async def test_report_pipeline_completion_failed(mock_org):
    """
    Test reporting failed pipeline completion.

    Expected: 200 OK with FAILED status recorded
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    with patch("src.app.dependencies.auth.increment_pipeline_usage", new_callable=AsyncMock) as mock_increment:
        with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq_client:
            mock_client = MagicMock()
            mock_bq_client.return_value = mock_client

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/v1/validator/complete/{TEST_ORG_SLUG}?pipeline_status=FAILED",
                    headers={"X-API-Key": "test-key"}
                )

                assert response.status_code == 200
                data = response.json()

                assert data["success"] is True
                assert data["pipeline_status"] == "FAILED"


@pytest.mark.asyncio
async def test_report_pipeline_completion_org_mismatch(mock_org):
    """
    Test completion reporting fails with org mismatch.

    Expected: 403 Forbidden
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/validator/complete/different_org?pipeline_status=SUCCESS",
            headers={"X-API-Key": "test-key"}
        )

        assert response.status_code == 403


@pytest.mark.asyncio
async def test_report_pipeline_completion_invalid_status(mock_org):
    """
    Test completion reporting fails with invalid status.

    Expected: 400 Bad Request
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/validator/complete/{TEST_ORG_SLUG}?pipeline_status=INVALID",
            headers={"X-API-Key": "test-key"}
        )

        assert response.status_code == 400
        data = response.json()
        assert "Invalid pipeline_status" in data["detail"]


# ============================================
# Authentication Tests
# ============================================

@pytest.mark.asyncio
async def test_validate_pipeline_without_auth(no_auth_headers):
    """
    Test validation endpoint requires authentication.

    Expected: 401 Unauthorized or 403 Forbidden
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
            headers=no_auth_headers,
            json={
                "pipeline_id": "gcp_billing",
                "include_credentials": False
            }
        )

        # Should require authentication
        assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_complete_pipeline_without_auth(no_auth_headers):
    """
    Test completion endpoint requires authentication.

    Expected: 401 Unauthorized or 403 Forbidden
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/validator/complete/{TEST_ORG_SLUG}?pipeline_status=SUCCESS",
            headers=no_auth_headers
        )

        # Should require authentication
        assert response.status_code in [401, 403]


# ============================================
# Input Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_validate_pipeline_missing_pipeline_id(mock_org):
    """
    Test validation fails without pipeline_id.

    Expected: 422 Unprocessable Entity (validation error)
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
            headers={"X-API-Key": "test-key"},
            json={
                "include_credentials": False
                # Missing pipeline_id
            }
        )

        assert response.status_code == 422


@pytest.mark.asyncio
async def test_validate_pipeline_invalid_json(mock_org):
    """
    Test validation fails with invalid JSON.

    Expected: 422 Unprocessable Entity
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
            headers={"X-API-Key": "test-key"},
            content="invalid json"
        )

        assert response.status_code == 422


# ============================================
# Edge Cases and Error Handling
# ============================================

@pytest.mark.asyncio
async def test_list_pipelines_with_invalid_provider():
    """
    Test listing pipelines with nonexistent provider.

    Expected: 200 OK with empty list
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/validator/pipelines?provider=nonexistent")

        assert response.status_code == 200
        data = response.json()

        # Should return empty list for nonexistent provider
        assert data["success"] is True
        assert data["total"] == 0
        assert len(data["pipelines"]) == 0


@pytest.mark.asyncio
async def test_validate_disabled_pipeline(mock_org):
    """
    Test validation fails for disabled pipeline.

    Note: This test assumes there's a way to disable a pipeline in config.
    If all pipelines are enabled, this will need modification.
    """
    app.dependency_overrides[get_current_org] = lambda: mock_org

    transport = ASGITransport(app=app)

    # Mock the pipeline registry to return a disabled pipeline
    from src.app.routers.pipeline_validator import PipelineRegistry

    mock_pipeline = {
        "id": "disabled_pipeline",
        "name": "Disabled Pipeline",
        "description": "A disabled pipeline for testing",
        "provider": "test",
        "domain": "",
        "pipeline": "test",
        "required_integration": "TEST",
        "enabled": False
    }

    with patch.object(PipelineRegistry, 'get_pipeline', return_value=mock_pipeline):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
                headers={"X-API-Key": "test-key"},
                json={
                    "pipeline_id": "disabled_pipeline",
                    "include_credentials": False
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert data["valid"] is False
            assert data["error_code"] == "PIPELINE_DISABLED"
            assert "disabled" in data["error"].lower()


@pytest.mark.asyncio
async def test_pipeline_registry_singleton():
    """
    Test that PipelineRegistry is a singleton.

    Multiple calls should return the same instance.
    """
    from src.app.routers.pipeline_validator import get_pipeline_registry

    registry1 = get_pipeline_registry()
    registry2 = get_pipeline_registry()

    # Should be the same instance
    assert registry1 is registry2


@pytest.mark.asyncio
async def test_pipeline_registry_caching():
    """
    Test that pipeline registry caches loaded pipelines.

    Should only load from file once.
    """
    from src.app.routers.pipeline_validator import PipelineRegistry

    registry = PipelineRegistry()

    # Reset loaded flag to test loading
    registry._loaded = False
    registry._pipelines = []

    # First load
    pipelines1 = registry.get_pipelines()

    # Second load (should use cache)
    pipelines2 = registry.get_pipelines()

    # Should return same data
    assert pipelines1 == pipelines2

    # Loaded flag should be True
    assert registry._loaded is True


@pytest.mark.asyncio
async def test_list_openai_pipelines():
    """
    Test filtering for OpenAI pipelines specifically.

    Expected: Only OpenAI pipelines returned
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/validator/pipelines?provider=openai")

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True

        # Verify all are OpenAI pipelines
        for pipeline in data["pipelines"]:
            assert pipeline["provider"].lower() == "openai"
            assert pipeline["required_integration"] == "OPENAI"


@pytest.mark.asyncio
async def test_list_anthropic_pipelines():
    """
    Test filtering for Anthropic pipelines specifically.

    Expected: Only Anthropic pipelines returned
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/validator/pipelines?provider=anthropic")

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True

        # Verify all are Anthropic pipelines
        for pipeline in data["pipelines"]:
            assert pipeline["provider"].lower() == "anthropic"
            assert pipeline["required_integration"] == "ANTHROPIC"


@pytest.mark.asyncio
async def test_validate_pipeline_trial_subscription(mock_org, mock_quota):
    """
    Test validation succeeds with TRIAL subscription.

    Both ACTIVE and TRIAL subscriptions should be valid.
    """
    # Modify mock_org to have TRIAL subscription
    trial_org = mock_org.copy()
    trial_org["subscription"] = mock_org["subscription"].copy()
    trial_org["subscription"]["status"] = "TRIAL"

    app.dependency_overrides[get_current_org] = lambda: trial_org

    transport = ASGITransport(app=app)

    with patch("src.app.dependencies.auth.validate_quota", new_callable=AsyncMock, return_value=mock_quota):
        with patch("src.app.dependencies.auth.reserve_pipeline_quota_atomic", new_callable=AsyncMock):
            with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq_client:
                mock_client = MagicMock()
                mock_client.query.return_value = [{"credential_id": "test-cred"}]
                mock_bq_client.return_value = mock_client

                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        f"/api/v1/validator/validate/{TEST_ORG_SLUG}",
                        headers={"X-API-Key": "test-key"},
                        json={
                            "pipeline_id": "gcp_billing",
                            "include_credentials": False
                        }
                    )

                    assert response.status_code == 200
                    data = response.json()

                    # Should validate successfully with TRIAL subscription
                    assert data["valid"] is True
                    assert data["subscription"]["status"] == "TRIAL"
