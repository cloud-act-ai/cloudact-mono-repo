"""
Pipeline Routes API Tests
Comprehensive unit tests for pipeline-service API endpoints.

Tests all pipeline management endpoints:
- POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline} - Run pipeline
- GET /api/v1/pipelines/runs - List pipeline runs
- GET /api/v1/pipelines/runs/{run_id} - Get run status
- DELETE /api/v1/pipelines/runs/{run_id} - Cancel pipeline run

Coverage includes:
- Authentication (401/403 errors)
- Valid responses
- Parameter validation
- Error handling
- Rate limiting

Note: These tests run with DISABLE_AUTH=true set in conftest.py,
so auth tests verify mocking behavior rather than actual auth enforcement.
"""

import pytest
import uuid
import os
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from fastapi import status

# Import app after env vars are set in conftest.py
from src.app.main import app


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_org_context():
    """Mock organization context for authenticated requests."""
    from src.app.dependencies.auth import OrgContext

    return OrgContext(
        org_slug="test_org_abc",
        org_api_key_hash="test_hash_123",
        org_api_key_id="test_key_123",
        user_id="user_123"
    )


@pytest.fixture
def mock_bq_client():
    """Mock BigQuery client."""
    client = MagicMock()
    client.client = MagicMock()
    # Default mock behavior - return empty results
    mock_query_job = MagicMock()
    mock_query_job.result.return_value = []
    client.client.query.return_value = mock_query_job
    return client


@pytest.fixture
def test_pipeline_logging_id():
    """Generate a test pipeline logging ID."""
    return str(uuid.uuid4())


@pytest.fixture(autouse=True)
def mock_bq_dependency():
    """
    Auto-mock BigQuery client for all tests in this module.
    This prevents tests from attempting real BigQuery connections.

    Mocks both the dependency function and the actual client usage.
    """
    with patch("src.core.engine.bq_client.get_bigquery_client") as mock_get_client:
        with patch("src.core.engine.bq_client.BigQueryClient") as mock_bq_class:
            # Create a mock client instance
            client = MagicMock()
            client.client = MagicMock()

            # Default: return empty results
            mock_query_job = MagicMock()
            mock_query_job.result.return_value = []
            mock_query_job.num_dml_affected_rows = 0
            client.client.query.return_value = mock_query_job

            # Make both return the mock client
            mock_get_client.return_value = client
            mock_bq_class.return_value = client

            # Also need to override app dependency
            app.dependency_overrides[get_bigquery_client] = lambda: client

            yield client

            # Cleanup
            app.dependency_overrides.clear()


@pytest.fixture
def mock_auth_for_org(org_slug: str = "test_org"):
    """
    Mock authentication dependency to return a specific org context.
    Use this in tests that need to authenticate as a specific org.
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug=org_slug,
            org_api_key_hash="test_hash_123",
            org_api_key_id="test_key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify
    yield mock_verify
    if verify_api_key_header in app.dependency_overrides:
        del app.dependency_overrides[verify_api_key_header]


# Need to import this for dependency override
from src.core.engine.bq_client import get_bigquery_client


# ============================================
# Test 1: Authentication Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_no_auth_header():
    """
    Test running pipeline without X-API-Key header.

    Note: With DISABLE_AUTH=true, this tests validation errors instead of 401.
    The endpoint requires valid parameters, so it will return 422 for missing org validation.

    Expected: 422 Unprocessable Entity (missing required params)
    """
    # Temporarily set DISABLE_AUTH to false for this test
    original_disable_auth = os.environ.get("DISABLE_AUTH")
    os.environ["DISABLE_AUTH"] = "false"

    try:
        # Reload app config to pick up new env var
        from importlib import reload
        import src.app.config
        reload(src.app.config)

        with patch("src.app.dependencies.auth.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_bq.return_value = mock_client
            # Simulate no matching API key in database
            mock_client.client.query.return_value.result.return_value = []

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                    json={"date": "2025-12-01"}
                )

                # With auth enabled, missing API key header should return 422 (FastAPI default)
                assert response.status_code in [401, 422]
    finally:
        # Restore original setting
        if original_disable_auth:
            os.environ["DISABLE_AUTH"] = original_disable_auth
        else:
            os.environ.pop("DISABLE_AUTH", None)
        # Reload config again
        from importlib import reload
        import src.app.config
        reload(src.app.config)


@pytest.mark.asyncio
async def test_run_pipeline_invalid_api_key():
    """
    Test running pipeline with invalid API key.

    With DISABLE_AUTH=true, auth is bypassed and we test org mismatch instead.
    Expected: 403 Forbidden (org mismatch) when using default dev org
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # With DISABLE_AUTH=true, default org is dev_org_local
        # Trying to access test_org should fail with 403 org mismatch
        response = await client.post(
            "/api/v1/pipelines/run/test_org/gcp/cost/billing",
            headers={"X-API-Key": "invalid_key_123"},
            json={"date": "2025-12-01"}
        )

        # Should get org mismatch error (dev_org_local != test_org)
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_get_runs_no_auth():
    """
    Test listing pipeline runs without authentication.

    With DISABLE_AUTH=true, this will use default dev org.
    Expected: 200 OK with empty list (no runs for dev org)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/pipelines/runs")

        # With DISABLE_AUTH=true, request succeeds with default org
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_run_status_no_auth():
    """
    Test getting run status without authentication.

    With DISABLE_AUTH=true, this will use default dev org.
    Expected: 404 Not Found (run doesn't exist)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        run_id = str(uuid.uuid4())
        response = await client.get(f"/api/v1/pipelines/runs/{run_id}")

        # With DISABLE_AUTH=true, request succeeds but run not found
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_cancel_run_no_auth():
    """
    Test canceling pipeline run without authentication.

    With DISABLE_AUTH=true, this will use default dev org.
    Expected: 200 OK (placeholder implementation)
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        run_id = str(uuid.uuid4())
        response = await client.delete(f"/api/v1/pipelines/runs/{run_id}")

        # With DISABLE_AUTH=true, request succeeds (placeholder returns 200)
        assert response.status_code == status.HTTP_200_OK


# ============================================
# Test 2: Authorization / Org Mismatch Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_org_mismatch():
    """
    Test running pipeline for different org than authenticated returns 403.

    User authenticated as org_a tries to run pipeline for org_b.
    Expected: 403 Forbidden with org mismatch error
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        # User authenticated as org_a
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="org_a",
            org_api_key_hash="hash_a",
            org_api_key_id="key_a",
            user_id="user_a"
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Try to run pipeline for org_b
            response = await client.post(
                "/api/v1/pipelines/run/org_b/gcp/cost/billing",
                headers={"X-API-Key": "valid_key_for_org_a"},
                json={"date": "2025-12-01"}
            )

            assert response.status_code == status.HTTP_403_FORBIDDEN
            data = response.json()
            assert "mismatch" in data["detail"].lower() or "forbidden" in data["detail"].lower()


# ============================================
# Test 3: Input Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_invalid_org_slug_format():
    """
    Test running pipeline with invalid org slug format returns 400.

    Org slug must match: ^[a-zA-Z0-9_]{3,50}$
    Expected: 400 Bad Request with format validation error
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Invalid characters: hyphens not allowed (only underscores)
            response = await client.post(
                "/api/v1/pipelines/run/invalid-org-slug/gcp/cost/billing",
                headers={"X-API-Key": "valid_key"},
                json={"date": "2025-12-01"}
            )

            assert response.status_code == status.HTTP_400_BAD_REQUEST
            data = response.json()
            assert "format" in data["detail"].lower()


@pytest.mark.asyncio
async def test_run_pipeline_extra_fields_forbidden():
    """
    Test that extra fields in request body are rejected.

    Security: Pydantic model uses extra='forbid' to prevent injection
    Expected: 422 Unprocessable Entity
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            mock_validate.return_value = {"valid": True}

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                    headers={"X-API-Key": "valid_key"},
                    json={
                        "date": "2025-12-01",
                        "malicious_field": "injection_attempt"
                    }
                )

                assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_list_runs_invalid_limit():
    """
    Test listing runs with invalid limit parameter returns 422.

    Limit must be between 1 and 100.
    Expected: 422 Unprocessable Entity
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Limit > 100
            response = await client.get(
                "/api/v1/pipelines/runs?limit=500",
                headers={"X-API-Key": "valid_key"}
            )

            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ============================================
# Test 4: API Service Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_api_service_unavailable():
    """
    Test pipeline run when API service is unavailable returns 503.

    Expected: 503 Service Unavailable
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            # Simulate API service unavailable
            mock_validate.return_value = {
                "valid": False,
                "error": "Cannot connect to validation service",
                "error_code": "VALIDATION_SERVICE_UNAVAILABLE"
            }

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                    headers={"X-API-Key": "valid_key"},
                    json={"date": "2025-12-01"}
                )

                assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


@pytest.mark.asyncio
async def test_run_pipeline_quota_exceeded():
    """
    Test pipeline run when quota is exceeded returns 429.

    Expected: 429 Too Many Requests
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            # Simulate quota exceeded
            mock_validate.return_value = {
                "valid": False,
                "error": "Daily pipeline quota exceeded",
                "error_code": "QUOTA_EXCEEDED"
            }

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                    headers={"X-API-Key": "valid_key"},
                    json={"date": "2025-12-01"}
                )

                assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
                data = response.json()
                assert "quota" in data["detail"].lower()
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


@pytest.mark.asyncio
async def test_run_pipeline_subscription_inactive():
    """
    Test pipeline run when subscription is inactive returns 403.

    Expected: 403 Forbidden
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            # Simulate inactive subscription
            mock_validate.return_value = {
                "valid": False,
                "error": "Subscription is inactive",
                "error_code": "SUBSCRIPTION_INACTIVE"
            }

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                    headers={"X-API-Key": "valid_key"},
                    json={"date": "2025-12-01"}
                )

                assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_run_pipeline_integration_not_configured():
    """
    Test pipeline run when integration is not configured returns 400.

    Expected: 400 Bad Request
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            # Simulate integration not configured
            mock_validate.return_value = {
                "valid": False,
                "error": "GCP integration not configured for organization",
                "error_code": "INTEGRATION_NOT_CONFIGURED"
            }

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                    headers={"X-API-Key": "valid_key"},
                    json={"date": "2025-12-01"}
                )

                assert response.status_code == status.HTTP_400_BAD_REQUEST
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


# ============================================
# Test 5: Template Not Found Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_template_not_found():
    """
    Test running pipeline with non-existent template returns 404.

    Expected: 404 Not Found
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            mock_validate.return_value = {"valid": True}

            with patch("src.app.routers.pipelines.get_template_path") as mock_get_path:
                mock_get_path.return_value = "/nonexistent/template.yml"

                with patch("src.app.routers.pipelines.resolve_template") as mock_resolve:
                    mock_resolve.side_effect = FileNotFoundError("Template not found")

                    transport = ASGITransport(app=app)
                    async with AsyncClient(transport=transport, base_url="http://test") as client:
                        response = await client.post(
                            "/api/v1/pipelines/run/test_org/gcp/cost/nonexistent",
                            headers={"X-API-Key": "valid_key"},
                            json={"date": "2025-12-01"}
                        )

                        assert response.status_code == status.HTTP_404_NOT_FOUND
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


# ============================================
# Test 6: Successful Pipeline Execution Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_success(mock_bq_dependency):
    """
    Test successfully running a pipeline returns 200 with pipeline details.

    Expected: 200 OK with pipeline_logging_id, pipeline_id, status
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            mock_validate.return_value = {"valid": True}

            with patch("src.app.routers.pipelines.get_template_path") as mock_get_path:
                mock_get_path.return_value = "/path/to/template.yml"

                with patch("src.app.routers.pipelines.resolve_template") as mock_resolve:
                    mock_resolve.return_value = {"pipeline_id": "test_pipeline"}

                    # Configure the mock BigQuery client (from fixture)
                    mock_query_job = MagicMock()
                    mock_query_job.num_dml_affected_rows = 1
                    mock_query_job.result.return_value = []
                    mock_bq_dependency.client.query.return_value = mock_query_job

                    with patch("src.app.routers.pipelines.rate_limit_by_org") as mock_rate_limit:
                        mock_rate_limit.return_value = None

                        transport = ASGITransport(app=app)
                        async with AsyncClient(transport=transport, base_url="http://test") as client:
                            response = await client.post(
                                "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                                headers={"X-API-Key": "valid_key"},
                                json={"date": "2025-12-01"}
                            )

                            assert response.status_code == status.HTTP_200_OK
                            data = response.json()
                            assert "pipeline_logging_id" in data
                            assert "pipeline_id" in data
                            assert "org_slug" in data
                            assert "status" in data
                            assert "message" in data
                            assert data["org_slug"] == "test_org"
                            assert data["status"] in ["PENDING", "RUNNING"]
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


@pytest.mark.asyncio
async def test_run_pipeline_already_running(mock_bq_dependency):
    """
    Test running pipeline that's already running returns existing execution.

    Expected: 200 OK with status=RUNNING and existing pipeline_logging_id
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            mock_validate.return_value = {"valid": True}

            with patch("src.app.routers.pipelines.get_template_path") as mock_get_path:
                mock_get_path.return_value = "/path/to/template.yml"

                with patch("src.app.routers.pipelines.resolve_template") as mock_resolve:
                    mock_resolve.return_value = {"pipeline_id": "test_pipeline"}

                    # First query: INSERT returns 0 rows (pipeline already running)
                    mock_insert_job = MagicMock()
                    mock_insert_job.num_dml_affected_rows = 0
                    mock_insert_job.result.return_value = []

                    # Second query: Check for existing run
                    existing_id = str(uuid.uuid4())
                    mock_check_job = MagicMock()
                    mock_check_job.result.return_value = [{"pipeline_logging_id": existing_id}]

                    mock_bq_dependency.client.query.side_effect = [mock_insert_job, mock_check_job]

                    with patch("src.app.routers.pipelines.rate_limit_by_org") as mock_rate_limit:
                        mock_rate_limit.return_value = None

                        transport = ASGITransport(app=app)
                        async with AsyncClient(transport=transport, base_url="http://test") as client:
                            response = await client.post(
                                "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                                headers={"X-API-Key": "valid_key"},
                                json={"date": "2025-12-01"}
                            )

                            assert response.status_code == status.HTTP_200_OK
                            data = response.json()
                            assert data["status"] == "RUNNING"
                            assert data["pipeline_logging_id"] == existing_id
                            assert "already running" in data["message"].lower()
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


# ============================================
# Test 7: Get Run Status Tests
# ============================================

@pytest.mark.asyncio
async def test_get_run_status_success(mock_bq_dependency):
    """
    Test getting run status for existing run returns 200 with details.

    Expected: 200 OK with run details
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        run_id = str(uuid.uuid4())
        mock_query_job = MagicMock()
        mock_query_job.result.return_value = [{
            "pipeline_logging_id": run_id,
            "pipeline_id": "test_org-gcp-cost-billing",
            "org_slug": "test_org",
            "status": "RUNNING",
            "trigger_type": "api",
            "trigger_by": "test_user",
            "start_time": datetime.now(),
            "end_time": None,
            "duration_ms": None
        }]
        mock_bq_dependency.client.query.return_value = mock_query_job

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/v1/pipelines/runs/{run_id}",
                headers={"X-API-Key": "valid_key"}
            )

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["pipeline_logging_id"] == run_id
            assert data["org_slug"] == "test_org"
            assert data["status"] == "RUNNING"
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


@pytest.mark.asyncio
async def test_get_run_status_not_found():
    """
    Test getting run status for non-existent run returns 404.

    Expected: 404 Not Found
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_query_job = MagicMock()
            mock_query_job.result.return_value = []  # No results
            mock_client.client.query.return_value = mock_query_job
            mock_bq.return_value = mock_client

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                run_id = str(uuid.uuid4())
                response = await client.get(
                    f"/api/v1/pipelines/runs/{run_id}",
                    headers={"X-API-Key": "valid_key"}
                )

                assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_get_run_status_different_org():
    """
    Test getting run status for run belonging to different org returns 404.

    Expected: 404 Not Found (query filtered by org_slug)
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        # User authenticated as org_a
        mock_verify.return_value = OrgContext(
            org_slug="org_a",
            org_api_key_hash="hash_a",
            org_api_key_id="key_a",
            user_id="user_a"
        )

        with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_query_job = MagicMock()
            # Query filters by org_slug, so no results for org_b's run
            mock_query_job.result.return_value = []
            mock_client.client.query.return_value = mock_query_job
            mock_bq.return_value = mock_client

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # Try to get run that belongs to org_b
                run_id = str(uuid.uuid4())
                response = await client.get(
                    f"/api/v1/pipelines/runs/{run_id}",
                    headers={"X-API-Key": "valid_key_for_org_a"}
                )

                assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================
# Test 8: List Runs Tests
# ============================================

@pytest.mark.asyncio
async def test_list_runs_success(mock_bq_dependency):
    """
    Test listing pipeline runs returns 200 with list of runs.

    Expected: 200 OK with array of runs
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        mock_query_job = MagicMock()
        mock_query_job.result.return_value = [
            {
                "pipeline_logging_id": str(uuid.uuid4()),
                "pipeline_id": "test_org-gcp-cost-billing",
                "org_slug": "test_org",
                "status": "COMPLETE",
                "trigger_type": "api",
                "trigger_by": "user_123",
                "start_time": datetime.now(),
                "end_time": datetime.now(),
                "duration_ms": 5000
            },
            {
                "pipeline_logging_id": str(uuid.uuid4()),
                "pipeline_id": "test_org-openai-cost-usage",
                "org_slug": "test_org",
                "status": "RUNNING",
                "trigger_type": "scheduled",
                "trigger_by": "cron",
                "start_time": datetime.now(),
                "end_time": None,
                "duration_ms": None
            }
        ]
        mock_bq_dependency.client.query.return_value = mock_query_job

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/pipelines/runs",
                headers={"X-API-Key": "valid_key"}
            )

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 2
            assert data[0]["status"] == "COMPLETE"
            assert data[1]["status"] == "RUNNING"
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


@pytest.mark.asyncio
async def test_list_runs_with_filters(mock_bq_dependency):
    """
    Test listing runs with filters (pipeline_id, status) returns filtered results.

    Expected: 200 OK with filtered runs
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        mock_query_job = MagicMock()
        mock_query_job.result.return_value = [
            {
                "pipeline_logging_id": str(uuid.uuid4()),
                "pipeline_id": "test_org-gcp-cost-billing",
                "org_slug": "test_org",
                "status": "FAILED",
                "trigger_type": "api",
                "trigger_by": "user_123",
                "start_time": datetime.now(),
                "end_time": datetime.now(),
                "duration_ms": 3000
            }
        ]
        mock_bq_dependency.client.query.return_value = mock_query_job

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/pipelines/runs?pipeline_id=test_org-gcp-cost-billing&status=FAILED",
                headers={"X-API-Key": "valid_key"}
            )

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 1
            assert data[0]["status"] == "FAILED"
            assert data[0]["pipeline_id"] == "test_org-gcp-cost-billing"
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


@pytest.mark.asyncio
async def test_list_runs_with_limit(mock_bq_dependency):
    """
    Test listing runs with limit parameter returns limited results.

    Expected: 200 OK with limited number of runs
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        mock_query_job = MagicMock()
        # Return only 5 results
        mock_query_job.result.return_value = [
            {
                "pipeline_logging_id": str(uuid.uuid4()),
                "pipeline_id": f"test_org-pipeline-{i}",
                "org_slug": "test_org",
                "status": "COMPLETE",
                "trigger_type": "api",
                "trigger_by": "user_123",
                "start_time": datetime.now(),
                "end_time": datetime.now(),
                "duration_ms": 1000 * i
            }
            for i in range(5)
        ]
        mock_bq_dependency.client.query.return_value = mock_query_job

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/pipelines/runs?limit=5",
                headers={"X-API-Key": "valid_key"}
            )

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 5
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]


@pytest.mark.asyncio
async def test_list_runs_empty():
    """
    Test listing runs when no runs exist returns empty array.

    Expected: 200 OK with empty array
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq:
            mock_client = MagicMock()
            mock_query_job = MagicMock()
            mock_query_job.result.return_value = []
            mock_client.client.query.return_value = mock_query_job
            mock_bq.return_value = mock_client

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/v1/pipelines/runs",
                    headers={"X-API-Key": "valid_key"}
                )

                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                assert isinstance(data, list)
                assert len(data) == 0


# ============================================
# Test 9: Cancel Run Tests
# ============================================

@pytest.mark.asyncio
async def test_cancel_run_success():
    """
    Test canceling a pipeline run returns success message.

    Note: Current implementation is a placeholder.
    Expected: 200 OK with cancellation message
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            run_id = str(uuid.uuid4())
            response = await client.delete(
                f"/api/v1/pipelines/runs/{run_id}",
                headers={"X-API-Key": "valid_key"}
            )

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert "pipeline_logging_id" in data
            assert "message" in data
            assert data["pipeline_logging_id"] == run_id


# ============================================
# Test 10: Rate Limiting Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_rate_limit_exceeded():
    """
    Test running pipeline when rate limit is exceeded returns 429.

    Expected: 429 Too Many Requests
    """
    with patch("src.app.dependencies.auth.verify_api_key_header") as mock_verify:
        from src.app.dependencies.auth import OrgContext
        mock_verify.return_value = OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

        with patch("src.app.routers.pipelines.rate_limit_by_org") as mock_rate_limit:
            from fastapi import HTTPException
            # Simulate rate limit exceeded
            mock_rate_limit.side_effect = HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded"
            )

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                    headers={"X-API-Key": "valid_key"},
                    json={"date": "2025-12-01"}
                )

                assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


# ============================================
# Test 11: Error Handling Tests
# ============================================

@pytest.mark.asyncio
async def test_run_pipeline_bigquery_error(mock_bq_dependency):
    """
    Test pipeline run when BigQuery fails returns 500.

    Expected: 500 Internal Server Error
    """
    from src.app.dependencies.auth import OrgContext, verify_api_key_header

    def mock_verify():
        return OrgContext(
            org_slug="test_org",
            org_api_key_hash="hash_123",
            org_api_key_id="key_123",
            user_id="user_123"
        )

    app.dependency_overrides[verify_api_key_header] = mock_verify

    try:
        with patch("src.app.routers.pipelines.validate_pipeline_with_api_service") as mock_validate:
            mock_validate.return_value = {"valid": True}

            with patch("src.app.routers.pipelines.get_template_path") as mock_get_path:
                mock_get_path.return_value = "/path/to/template.yml"

                with patch("src.app.routers.pipelines.resolve_template") as mock_resolve:
                    mock_resolve.return_value = {"pipeline_id": "test_pipeline"}

                    # Simulate BigQuery error
                    mock_bq_dependency.client.query.side_effect = Exception("BigQuery connection failed")

                    with patch("src.app.routers.pipelines.rate_limit_by_org") as mock_rate_limit:
                        mock_rate_limit.return_value = None

                        transport = ASGITransport(app=app)
                        async with AsyncClient(transport=transport, base_url="http://test") as client:
                            response = await client.post(
                                "/api/v1/pipelines/run/test_org/gcp/cost/billing",
                                headers={"X-API-Key": "valid_key"},
                                json={"date": "2025-12-01"}
                            )

                            # Should return internal server error
                            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    finally:
        if verify_api_key_header in app.dependency_overrides:
            del app.dependency_overrides[verify_api_key_header]
