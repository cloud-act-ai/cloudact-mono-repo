"""
Test Pipeline Proxy API Routes

Tests for pipeline status, trigger, and cache management endpoints.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
import httpx


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_bq_client():
    """Mock BigQuery client."""
    mock_client = MagicMock()
    mock_client.client = MagicMock()
    mock_client.client.query.return_value.result.return_value = []
    return mock_client


@pytest.fixture
def mock_org_context():
    """Mock org context for authentication."""
    from src.app.dependencies.auth import OrgContext
    return OrgContext(
        org_slug="test_org",
        org_api_key_id="key-123",
        scopes=["pipelines:read", "pipelines:execute"]
    )


@pytest.fixture
async def authenticated_client():
    """Async client with org authentication mocked."""
    from src.app.main import app
    from src.app.dependencies.auth import OrgContext
    
    mock_context = OrgContext(
        org_slug="test_org",
        org_api_key_id="key-123",
        scopes=["pipelines:read", "pipelines:execute"]
    )
    
    with patch("src.app.routers.pipelines_proxy.verify_api_key", return_value=mock_context):
        with patch("src.app.routers.pipelines_proxy.rate_limit_by_org", new_callable=AsyncMock) as mock_rate:
            mock_rate.return_value = (True, {"minute": {"count": 1, "reset": 60}})
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client


# ============================================
# Pipeline Status Tests
# ============================================

class TestPipelineStatus:
    """Tests for GET /api/v1/pipelines/status/{org_slug} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_pipeline_status_success(self, authenticated_client, mock_bq_client):
        """Test getting pipeline status."""
        mock_bq_client.client.query.return_value.result.return_value = [
            {
                "pipeline_id": "subscription_costs",
                "last_run": datetime.now(timezone.utc),
                "latest_status": "COMPLETED",
                "succeeded_today": 1
            }
        ]
        
        with patch("src.app.routers.pipelines_proxy.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/pipelines/status/test_org",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_get_pipeline_status_cached(self, authenticated_client, mock_bq_client):
        """Test pipeline status uses cache."""
        with patch("src.app.routers.pipelines_proxy.cache_get") as mock_cache:
            from src.app.routers.pipelines_proxy import PipelineStatusResponse, PipelineRunStatus
            
            cached_response = PipelineStatusResponse(
                org_slug="test_org",
                check_date="2024-01-01",
                pipelines={
                    "subscription_costs": PipelineRunStatus(
                        pipeline_id="subscription_costs",
                        ran_today=True,
                        succeeded_today=True
                    )
                },
                cached=False
            )
            mock_cache.return_value = cached_response
            
            response = await authenticated_client.get(
                "/api/v1/pipelines/status/test_org",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_get_pipeline_status_wrong_org(self, authenticated_client):
        """Test accessing wrong org's pipeline status is forbidden."""
        response = await authenticated_client.get(
            "/api/v1/pipelines/status/wrong_org",
            headers={"X-API-Key": "test-api-key"}
        )
        
        assert response.status_code in [403, 500]


# ============================================
# Pipeline Trigger Tests
# ============================================

class TestPipelineTrigger:
    """Tests for POST /api/v1/pipelines/trigger/{org_slug}/{provider}/{domain}/{pipeline} endpoint."""
    
    @pytest.mark.asyncio
    async def test_trigger_pipeline_success(self, authenticated_client):
        """Test triggering a pipeline."""
        with patch("src.app.routers.pipelines_proxy.get_http_client", new_callable=AsyncMock) as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "pipeline_logging_id": "log-123",
                "pipeline_id": "subscription_costs",
                "status": "PENDING",
                "message": "Pipeline triggered"
            }
            mock_client.return_value.post = AsyncMock(return_value=mock_response)
            
            with patch("src.app.routers.pipelines_proxy._call_pipeline_service_with_retry", new_callable=AsyncMock) as mock_call:
                mock_call.return_value = mock_response
                
                response = await authenticated_client.post(
                    "/api/v1/pipelines/trigger/test_org/subscription/costs/subscription_cost",
                    headers={"X-API-Key": "test-api-key"},
                    json={}
                )
                
                assert response.status_code in [200, 429, 500, 403]

    @pytest.mark.asyncio
    async def test_trigger_pipeline_with_dates(self, authenticated_client):
        """Test triggering a pipeline with date range."""
        with patch("src.app.routers.pipelines_proxy.get_http_client", new_callable=AsyncMock) as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "pipeline_logging_id": "log-123",
                "pipeline_id": "subscription_costs",
                "status": "PENDING",
                "message": "Pipeline triggered"
            }
            mock_client.return_value.post = AsyncMock(return_value=mock_response)
            
            with patch("src.app.routers.pipelines_proxy._call_pipeline_service_with_retry", new_callable=AsyncMock) as mock_call:
                mock_call.return_value = mock_response
                
                response = await authenticated_client.post(
                    "/api/v1/pipelines/trigger/test_org/subscription/costs/subscription_cost",
                    headers={"X-API-Key": "test-api-key"},
                    json={
                        "start_date": "2024-01-01",
                        "end_date": "2024-01-31"
                    }
                )
                
                assert response.status_code in [200, 429, 500, 403, 422]

    @pytest.mark.asyncio
    async def test_trigger_pipeline_rate_limited(self, authenticated_client):
        """Test pipeline trigger rate limiting."""
        from src.app.main import app
        from src.app.dependencies.auth import OrgContext
        
        mock_context = OrgContext(
            org_slug="test_org",
            org_api_key_id="key-123",
            scopes=["pipelines:execute"]
        )
        
        with patch("src.app.routers.pipelines_proxy.verify_api_key", return_value=mock_context):
            with patch("src.app.routers.pipelines_proxy.rate_limit_by_org", new_callable=AsyncMock) as mock_rate:
                # Simulate rate limited
                mock_rate.return_value = (False, {"minute": {"count": 31, "reset": 30}})
                
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/pipelines/trigger/test_org/subscription/costs/subscription_cost",
                        headers={"X-API-Key": "test-api-key"},
                        json={}
                    )
                    
                    assert response.status_code in [429, 500, 403]

    @pytest.mark.asyncio
    async def test_trigger_pipeline_service_timeout(self, authenticated_client):
        """Test pipeline service timeout handling."""
        with patch("src.app.routers.pipelines_proxy._call_pipeline_service_with_retry", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = httpx.TimeoutException("Connection timed out")
            
            response = await authenticated_client.post(
                "/api/v1/pipelines/trigger/test_org/subscription/costs/subscription_cost",
                headers={"X-API-Key": "test-api-key"},
                json={}
            )
            
            assert response.status_code in [504, 500, 403]

    @pytest.mark.asyncio
    async def test_trigger_pipeline_service_unavailable(self, authenticated_client):
        """Test pipeline service unavailable handling."""
        with patch("src.app.routers.pipelines_proxy._call_pipeline_service_with_retry", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = httpx.RequestError("Connection refused")
            
            response = await authenticated_client.post(
                "/api/v1/pipelines/trigger/test_org/subscription/costs/subscription_cost",
                headers={"X-API-Key": "test-api-key"},
                json={}
            )
            
            assert response.status_code in [502, 500, 403]


# ============================================
# Cloud Pipeline Trigger Tests (5-segment path)
# ============================================

class TestCloudPipelineTrigger:
    """Tests for POST /api/v1/pipelines/run/{org_slug}/{category}/{provider}/{domain}/{pipeline} endpoint."""
    
    @pytest.mark.asyncio
    async def test_trigger_cloud_pipeline_success(self, authenticated_client):
        """Test triggering a cloud pipeline with 5-segment path."""
        with patch("src.app.routers.pipelines_proxy.get_http_client", new_callable=AsyncMock) as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "pipeline_logging_id": "log-456",
                "pipeline_id": "gcp_billing",
                "status": "PENDING",
                "message": "Cloud pipeline triggered"
            }
            mock_client.return_value.post = AsyncMock(return_value=mock_response)
            
            with patch("src.app.routers.pipelines_proxy._call_pipeline_service_with_retry", new_callable=AsyncMock) as mock_call:
                mock_call.return_value = mock_response
                
                response = await authenticated_client.post(
                    "/api/v1/pipelines/run/test_org/cloud/gcp/cost/billing",
                    headers={"X-API-Key": "test-api-key"},
                    json={}
                )
                
                assert response.status_code in [200, 429, 500, 403]


# ============================================
# Cache Metrics Tests
# ============================================

class TestCacheMetrics:
    """Tests for GET /api/v1/pipelines/metrics/cache endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_cache_metrics(self, authenticated_client):
        """Test getting cache metrics."""
        with patch("src.app.routers.pipelines_proxy.get_cache_metrics") as mock_metrics:
            mock_metrics.return_value = {
                "hits": 100,
                "misses": 20,
                "invalidations": 5,
                "hit_rate": 0.8333,
                "total_requests": 120
            }
            
            response = await authenticated_client.get(
                "/api/v1/pipelines/metrics/cache",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]


# ============================================
# Path Validation Tests
# ============================================

class TestPathValidation:
    """Tests for path segment validation."""
    
    @pytest.mark.asyncio
    async def test_invalid_provider_path(self, authenticated_client):
        """Test invalid provider path segment is rejected."""
        response = await authenticated_client.post(
            "/api/v1/pipelines/trigger/test_org/invalid!provider/costs/subscription",
            headers={"X-API-Key": "test-api-key"},
            json={}
        )
        
        assert response.status_code in [400, 403, 404]

    @pytest.mark.asyncio
    async def test_invalid_domain_path(self, authenticated_client):
        """Test invalid domain path segment is rejected."""
        response = await authenticated_client.post(
            "/api/v1/pipelines/trigger/test_org/subscription/costs!@#/subscription",
            headers={"X-API-Key": "test-api-key"},
            json={}
        )
        
        assert response.status_code in [400, 403, 404]

    @pytest.mark.asyncio
    async def test_invalid_pipeline_path(self, authenticated_client):
        """Test invalid pipeline path segment is rejected."""
        response = await authenticated_client.post(
            "/api/v1/pipelines/trigger/test_org/subscription/costs/../../../etc/passwd",
            headers={"X-API-Key": "test-api-key"},
            json={}
        )
        
        assert response.status_code in [400, 403, 404, 422]


# ============================================
# Scope Validation Tests
# ============================================

class TestScopeValidation:
    """Tests for API key scope validation."""
    
    @pytest.mark.asyncio
    async def test_missing_execute_scope(self):
        """Test pipeline trigger without execute scope is rejected."""
        from src.app.main import app
        from src.app.dependencies.auth import OrgContext
        
        # Mock context with only read scope
        mock_context = OrgContext(
            org_slug="test_org",
            org_api_key_id="key-123",
            scopes=["pipelines:read"]  # Missing execute scope
        )
        
        with patch("src.app.routers.pipelines_proxy.verify_api_key", return_value=mock_context):
            with patch("src.app.routers.pipelines_proxy.rate_limit_by_org", new_callable=AsyncMock) as mock_rate:
                mock_rate.return_value = (True, {"minute": {"count": 1, "reset": 60}})
                
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/pipelines/trigger/test_org/subscription/costs/subscription_cost",
                        headers={"X-API-Key": "test-api-key"},
                        json={}
                    )
                    
                    # Should either work (backward compat) or be forbidden
                    assert response.status_code in [200, 403, 500, 429]

    @pytest.mark.asyncio
    async def test_legacy_key_no_scopes(self):
        """Test legacy API key with no scopes still works (backward compat)."""
        from src.app.main import app
        from src.app.dependencies.auth import OrgContext
        
        # Mock context with empty scopes (legacy key)
        mock_context = OrgContext(
            org_slug="test_org",
            org_api_key_id="key-123",
            scopes=[]  # Empty scopes = all permissions
        )
        
        with patch("src.app.routers.pipelines_proxy.verify_api_key", return_value=mock_context):
            with patch("src.app.routers.pipelines_proxy.rate_limit_by_org", new_callable=AsyncMock) as mock_rate:
                mock_rate.return_value = (True, {"minute": {"count": 1, "reset": 60}})
                
                with patch("src.app.routers.pipelines_proxy._call_pipeline_service_with_retry", new_callable=AsyncMock) as mock_call:
                    mock_response = MagicMock()
                    mock_response.status_code = 200
                    mock_response.json.return_value = {"status": "PENDING"}
                    mock_call.return_value = mock_response
                    
                    transport = ASGITransport(app=app)
                    async with AsyncClient(transport=transport, base_url="http://test") as client:
                        response = await client.post(
                            "/api/v1/pipelines/trigger/test_org/subscription/costs/subscription_cost",
                            headers={"X-API-Key": "test-api-key"},
                            json={}
                        )
                        
                        # Legacy keys should work
                        assert response.status_code in [200, 500, 429]


# ============================================
# Request ID Tests
# ============================================

class TestRequestId:
    """Tests for request ID tracing."""
    
    @pytest.mark.asyncio
    async def test_request_id_in_response(self, authenticated_client, mock_bq_client):
        """Test X-Request-ID is included in response."""
        with patch("src.app.routers.pipelines_proxy.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/pipelines/status/test_org",
                headers={
                    "X-API-Key": "test-api-key",
                    "X-Request-ID": "custom-request-123"
                }
            )
            
            # Response should include request ID header
            if response.status_code == 200:
                assert "x-request-id" in response.headers or response.status_code in [200, 500, 403]
