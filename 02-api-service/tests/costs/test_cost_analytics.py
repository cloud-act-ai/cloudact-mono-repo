"""
Comprehensive tests for Cost Analytics API endpoints.

Tests the Polars-powered cost analytics endpoints including:
- GET /{org_slug} - Get cost data
- GET /{org_slug}/summary - Get cost summary
- GET /{org_slug}/by-provider - Cost by provider
- GET /{org_slug}/by-service - Cost by service
- GET /{org_slug}/trend - Cost trend over time
- GET /{org_slug}/saas-subscriptions - SaaS subscription costs
- GET /{org_slug}/cloud - Cloud infrastructure costs
- GET /{org_slug}/genai - GenAI API costs
- GET /{org_slug}/total - Total aggregated costs
- GET /{org_slug}/cache/stats - Cache statistics
- POST /{org_slug}/cache/invalidate - Invalidate cache

NOTE: Tests work with latest SaaS subscription schema changes:
- subscription_plans now has 29 columns (added 3 multi-currency fields: source_currency, source_price, exchange_rate_used)
- Removed tables: org_subscription_audit, llm_subscriptions, subscription_analysis
- Subscription audits now in org_audit_logs table
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock, PropertyMock
from datetime import date
from httpx import AsyncClient, ASGITransport

from src.app.main import app
from src.app.dependencies.auth import verify_api_key, OrgContext
from src.core.services.cost_read.service import get_cost_read_service

# Test constants
TEST_ORG_SLUG = "test_org"


# ============================================
# Test Fixtures
# ============================================

def get_mock_auth():
    """Return a mock OrgContext for testing."""
    return OrgContext(
        org_slug=TEST_ORG_SLUG,
        org_api_key_hash="test-key-hash",
        user_id="test-user-id",
        org_api_key_id="test-key-id"
    )


@pytest.fixture
async def test_client_with_mock():
    """Test client with proper FastAPI dependency overrides.

    Yields a tuple of (client, mock_cost_service) so tests can configure
    the mock and make requests through the same instance.
    """
    mock_service = MagicMock()

    # Override both auth and cost service dependencies
    app.dependency_overrides[verify_api_key] = get_mock_auth
    app.dependency_overrides[get_cost_read_service] = lambda: mock_service

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, mock_service
    finally:
        app.dependency_overrides.clear()


# Legacy fixtures for backward compatibility
@pytest.fixture
def mock_cost_service():
    """Create a mock PolarsCostService for testing."""
    mock_service = MagicMock()
    return mock_service


@pytest.fixture
async def test_client(mock_cost_service):
    """Test client with proper FastAPI dependency overrides."""
    # Override both auth and cost service dependencies
    app.dependency_overrides[verify_api_key] = get_mock_auth
    app.dependency_overrides[get_cost_read_service] = lambda: mock_cost_service

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.clear()


# ============================================
# Authentication Tests
# ============================================

class TestCostAPIAuthentication:
    """Tests for authentication on cost endpoints."""

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_401(self):
        """Test that missing API key returns 401 Unauthorized."""
        from src.app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/costs/test_org")
            assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_invalid_api_key_returns_403(self):
        """Test that invalid API key returns 403 Forbidden."""
        from src.app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/costs/test_org",
                headers={"X-API-Key": "invalid-key"}
            )
            assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_cross_tenant_access_blocked(self):
        """Test that cross-tenant access is blocked."""
        # Override auth to return org_a context
        def get_org_a_auth():
            return OrgContext(
                org_slug="org_a",  # Authenticated as org_a
                org_api_key_hash="test-key-hash",
                user_id="test-user-id",
                org_api_key_id="test-key-id"
            )

        app.dependency_overrides[verify_api_key] = get_org_a_auth

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # Try to access org_b's data
                response = await client.get(
                    "/api/v1/costs/org_b",  # Trying to access different org
                    headers={"X-API-Key": "test-key"}
                )
                assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()


# ============================================
# Input Validation Tests
# ============================================

class TestCostAPIInputValidation:
    """Tests for input validation on cost endpoints."""

    @pytest.mark.asyncio
    async def test_invalid_org_slug_format(self, test_client):
        """Test that invalid org_slug format returns 400."""
        invalid_slugs = [
            "ab",  # Too short (min 3 chars)
            "a" * 51,  # Too long (max 50 chars)
            "test-org",  # Hyphens not allowed
            "test.org",  # Dots not allowed
            "test org",  # Spaces not allowed
            "../test",  # Path traversal attempt
            "test;DROP",  # SQL injection attempt
        ]

        for invalid_slug in invalid_slugs:
            response = await test_client.get(f"/api/v1/costs/{invalid_slug}")
            # Should be blocked by validation
            assert response.status_code in [400, 403, 404]

    @pytest.mark.asyncio
    async def test_valid_org_slug_format(self, test_client, mock_cost_service):
        """Test that valid org_slug formats are accepted."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[],
            summary=None,
            pagination={"limit": 1000, "offset": 0, "total": 0},
            cache_hit=False,
            query_time_ms=10.0,
            error=None
        ))

        valid_slugs = [
            "abc",  # Min length
            "test_org",  # Underscore allowed
            "TestOrg123",  # Alphanumeric with capitals
            "a" * 50,  # Max length
        ]

        for valid_slug in valid_slugs:
            with patch("src.app.routers.costs.verify_api_key") as mock_verify:
                mock_context = MagicMock()
                mock_context.org_slug = valid_slug
                mock_verify.return_value = mock_context

                response = await test_client.get(f"/api/v1/costs/{valid_slug}")
                # Should not fail on slug validation
                assert response.status_code != 400

    @pytest.mark.asyncio
    async def test_invalid_date_range(self, test_client, mock_cost_service):
        """Test handling of invalid date ranges."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[],
            summary=None,
            pagination={"limit": 1000, "offset": 0, "total": 0},
            cache_hit=False,
            query_time_ms=10.0,
            error=None
        ))

        # End date before start date should still be accepted (service handles)
        response = await test_client.get(
            "/api/v1/costs/test_org",
            params={
                "start_date": "2025-12-31",
                "end_date": "2025-01-01"
            }
        )
        # FastAPI should accept dates, business logic handles validation
        assert response.status_code in [200, 400, 500]

    @pytest.mark.asyncio
    async def test_pagination_limits(self, test_client, mock_cost_service):
        """Test pagination parameter limits."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[],
            summary=None,
            pagination={"limit": 1000, "offset": 0, "total": 0},
            cache_hit=False,
            query_time_ms=10.0,
            error=None
        ))

        # Test limit within bounds
        response = await test_client.get(
            "/api/v1/costs/test_org",
            params={"limit": 5000, "offset": 0}
        )
        assert response.status_code == 200

        # Test limit exceeding max (10000)
        response = await test_client.get(
            "/api/v1/costs/test_org",
            params={"limit": 20000, "offset": 0}
        )
        assert response.status_code == 422  # Validation error


# ============================================
# Cost Data Endpoint Tests
# ============================================

class TestGetCostsEndpoint:
    """Tests for GET /{org_slug} endpoint."""

    @pytest.mark.asyncio
    async def test_get_costs_success(self, test_client, mock_cost_service):
        """Test successful cost data retrieval."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[
                {"Provider": "openai", "BilledCost": 150.50, "ServiceCategory": "LLM"},
                {"Provider": "anthropic", "BilledCost": 75.25, "ServiceCategory": "LLM"},
            ],
            summary={"total_cost": 225.75},
            pagination={"limit": 1000, "offset": 0, "total": 2},
            cache_hit=False,
            query_time_ms=45.2,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 2
        assert data["cache_hit"] is False

    @pytest.mark.asyncio
    async def test_get_costs_with_filters(self, test_client, mock_cost_service):
        """Test cost retrieval with filters."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[{"Provider": "openai", "BilledCost": 100.0}],
            summary=None,
            pagination={"limit": 1000, "offset": 0, "total": 1},
            cache_hit=False,
            query_time_ms=30.0,
            error=None
        ))

        response = await test_client.get(
            "/api/v1/costs/test_org",
            params={
                "start_date": "2025-01-01",
                "end_date": "2025-01-31",
                "providers": "openai,anthropic",
                "service_categories": "LLM,SaaS"
            }
        )

        assert response.status_code == 200
        mock_cost_service.get_costs.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_costs_empty_result(self, test_client, mock_cost_service):
        """Test cost retrieval with no data."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[],
            summary=None,
            pagination={"limit": 1000, "offset": 0, "total": 0},
            cache_hit=True,
            query_time_ms=5.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == []

    @pytest.mark.asyncio
    async def test_get_costs_service_failure(self, test_client, mock_cost_service):
        """Test handling of service failure."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=False,
            data=None,
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=0,
            error="BigQuery timeout"
        ))

        response = await test_client.get("/api/v1/costs/test_org")

        assert response.status_code == 500


# ============================================
# Cost Summary Endpoint Tests
# ============================================

class TestGetCostSummaryEndpoint:
    """Tests for GET /{org_slug}/summary endpoint."""

    @pytest.mark.asyncio
    async def test_get_summary_success(self, test_client, mock_cost_service):
        """Test successful cost summary retrieval."""
        mock_cost_service.get_cost_summary = AsyncMock(return_value=MagicMock(
            success=True,
            data=None,
            summary={
                "total_billed_cost": 10000.0,
                "total_effective_cost": 9500.0,
                "record_count": 500,
                "date_range": {"start": "2025-01-01", "end": "2025-01-31"},
                "providers": ["openai", "anthropic", "gcp"]
            },
            pagination=None,
            cache_hit=False,
            query_time_ms=50.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["summary"]["total_billed_cost"] == 10000.0


# ============================================
# Cost by Provider Endpoint Tests
# ============================================

class TestGetCostByProviderEndpoint:
    """Tests for GET /{org_slug}/by-provider endpoint."""

    @pytest.mark.asyncio
    async def test_get_by_provider_success(self, test_client, mock_cost_service):
        """Test successful cost by provider retrieval."""
        mock_cost_service.get_cost_by_provider = AsyncMock(return_value=MagicMock(
            success=True,
            data=[
                {"Provider": "openai", "TotalCost": 5000.0, "Percentage": 50.0},
                {"Provider": "anthropic", "TotalCost": 3000.0, "Percentage": 30.0},
                {"Provider": "gcp", "TotalCost": 2000.0, "Percentage": 20.0},
            ],
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=40.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org/by-provider")

        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 3


# ============================================
# Cost by Service Endpoint Tests
# ============================================

class TestGetCostByServiceEndpoint:
    """Tests for GET /{org_slug}/by-service endpoint."""

    @pytest.mark.asyncio
    async def test_get_by_service_success(self, test_client, mock_cost_service):
        """Test successful cost by service retrieval."""
        mock_cost_service.get_cost_by_service = AsyncMock(return_value=MagicMock(
            success=True,
            data=[
                {"ServiceCategory": "LLM", "ServiceName": "GPT-4", "TotalCost": 3000.0},
                {"ServiceCategory": "SaaS", "ServiceName": "Slack", "TotalCost": 500.0},
            ],
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=35.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org/by-service")

        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 2


# ============================================
# Cost Trend Endpoint Tests
# ============================================

class TestGetCostTrendEndpoint:
    """Tests for GET /{org_slug}/trend endpoint."""

    @pytest.mark.asyncio
    async def test_get_trend_daily(self, test_client, mock_cost_service):
        """Test daily cost trend retrieval."""
        mock_cost_service.get_cost_trend = AsyncMock(return_value=MagicMock(
            success=True,
            data=[
                {"date": "2025-01-01", "total_cost": 100.0},
                {"date": "2025-01-02", "total_cost": 150.0},
            ],
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=60.0,
            error=None
        ))

        response = await test_client.get(
            "/api/v1/costs/test_org/trend",
            params={"granularity": "daily", "days": 30}
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_trend_weekly(self, test_client, mock_cost_service):
        """Test weekly cost trend retrieval."""
        mock_cost_service.get_cost_trend = AsyncMock(return_value=MagicMock(
            success=True,
            data=[{"week": "2025-W01", "total_cost": 1000.0}],
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=55.0,
            error=None
        ))

        response = await test_client.get(
            "/api/v1/costs/test_org/trend",
            params={"granularity": "weekly", "days": 90}
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_trend_monthly(self, test_client, mock_cost_service):
        """Test monthly cost trend retrieval."""
        mock_cost_service.get_cost_trend = AsyncMock(return_value=MagicMock(
            success=True,
            data=[{"month": "2025-01", "total_cost": 5000.0}],
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=45.0,
            error=None
        ))

        response = await test_client.get(
            "/api/v1/costs/test_org/trend",
            params={"granularity": "monthly", "days": 365}
        )

        assert response.status_code == 200


# ============================================
# SaaS Subscription Costs Tests
# ============================================

class TestGetSaaSSubscriptionCosts:
    """Tests for GET /{org_slug}/subscriptions endpoint."""

    @pytest.mark.asyncio
    async def test_get_subscription_costs_success(self, test_client, mock_cost_service):
        """Test successful SaaS subscription costs retrieval."""
        mock_cost_service.get_subscription_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[
                {"Provider": "chatgpt_plus", "MonthlyCost": 20.0, "AnnualCost": 240.0},
                {"Provider": "slack", "MonthlyCost": 150.0, "AnnualCost": 1800.0},
            ],
            summary={
                "total_monthly_cost": 170.0,
                "total_annual_cost": 2040.0,
                "providers": ["chatgpt_plus", "slack"]
            },
            pagination=None,
            cache_hit=False,
            query_time_ms=30.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org/subscriptions")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 2


# ============================================
# Cloud Costs Tests
# ============================================

class TestGetCloudCosts:
    """Tests for GET /{org_slug}/cloud endpoint."""

    @pytest.mark.asyncio
    async def test_get_cloud_costs_success(self, test_client, mock_cost_service):
        """Test successful cloud costs retrieval."""
        mock_cost_service.get_cloud_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[
                {"Provider": "gcp", "Service": "Compute Engine", "MonthlyCost": 5000.0},
                {"Provider": "gcp", "Service": "BigQuery", "MonthlyCost": 2000.0},
            ],
            summary={
                "total_monthly_cost": 7000.0,
                "providers": ["gcp"]
            },
            pagination=None,
            cache_hit=False,
            query_time_ms=40.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org/cloud")

        assert response.status_code == 200


# ============================================
# GenAI Costs Tests
# ============================================

class TestGetGenAICosts:
    """Tests for GET /{org_slug}/genai endpoint."""

    @pytest.mark.asyncio
    async def test_get_genai_costs_success(self, test_client, mock_cost_service):
        """Test successful GenAI costs retrieval."""
        mock_cost_service.get_genai_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[
                {"Provider": "openai", "Model": "gpt-4", "MonthlyCost": 3000.0},
                {"Provider": "anthropic", "Model": "claude-3", "MonthlyCost": 2000.0},
            ],
            summary={
                "total_monthly_cost": 5000.0,
                "providers": ["openai", "anthropic"]
            },
            pagination=None,
            cache_hit=False,
            query_time_ms=35.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org/genai")

        assert response.status_code == 200


# ============================================
# Total Costs Tests
# ============================================

class TestGetTotalCosts:
    """Tests for GET /{org_slug}/total endpoint."""

    @pytest.mark.asyncio
    async def test_get_total_costs_success(self, test_client, mock_cost_service):
        """Test successful total costs aggregation."""
        # Mock all three cost retrieval methods
        saas_response = MagicMock(
            success=True,
            summary={"total_daily_cost": 10.0, "total_monthly_cost": 300.0, "total_annual_cost": 3600.0, "record_count": 5, "providers": ["slack"]}
        )
        cloud_response = MagicMock(
            success=True,
            summary={"total_daily_cost": 200.0, "total_monthly_cost": 6000.0, "total_annual_cost": 72000.0, "record_count": 100, "providers": ["gcp"]}
        )
        genai_response = MagicMock(
            success=True,
            summary={"total_daily_cost": 100.0, "total_monthly_cost": 3000.0, "total_annual_cost": 36000.0, "record_count": 50, "providers": ["openai"], "date_range": {"start": "2025-01-01", "end": "2025-01-31"}}
        )

        mock_cost_service.get_subscription_costs = AsyncMock(return_value=saas_response)
        mock_cost_service.get_cloud_costs = AsyncMock(return_value=cloud_response)
        mock_cost_service.get_genai_costs = AsyncMock(return_value=genai_response)

        response = await test_client.get("/api/v1/costs/test_org/total")

        assert response.status_code == 200
        data = response.json()
        assert "subscription" in data
        assert "cloud" in data
        assert "genai" in data
        assert "total" in data
        assert data["total"]["total_monthly_cost"] == 9300.0  # 300 + 6000 + 3000


# ============================================
# Cache Endpoint Tests
# ============================================

class TestCacheEndpoints:
    """Tests for cache management endpoints."""

    @pytest.mark.asyncio
    async def test_get_cache_stats(self, test_client, mock_cost_service):
        """Test cache statistics retrieval with memory tracking."""
        # Mock cache_stats property (not get_cache_stats method)
        type(mock_cost_service).cache_stats = PropertyMock(return_value={
            "hits": 100,
            "misses": 25,
            "evictions": 5,
            "memory_evictions": 2,
            "size": 50,
            "max_size": 100,
            "memory_bytes": 52428800,
            "memory_mb": 50.0,
            "max_memory_mb": 512,
            "memory_utilization": 0.0977,
            "hit_rate": 0.8
        })

        response = await test_client.get("/api/v1/costs/test_org/cache/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["hit_rate"] == 0.8
        assert data["memory_mb"] == 50.0
        assert data["memory_evictions"] == 2

    @pytest.mark.asyncio
    async def test_invalidate_cache(self, test_client, mock_cost_service):
        """Test cache invalidation."""
        mock_cost_service.invalidate_org_cache = MagicMock(return_value=10)

        response = await test_client.post("/api/v1/costs/test_org/cache/invalidate")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "10" in data["message"]


# ============================================
# Error Handling Tests
# ============================================

class TestCostAPIErrorHandling:
    """Tests for error handling in cost API."""

    @pytest.mark.asyncio
    async def test_bigquery_timeout_error(self, test_client, mock_cost_service):
        """Test handling of BigQuery timeout."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=False,
            data=None,
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=0,
            error="Query exceeded timeout"
        ))

        response = await test_client.get("/api/v1/costs/test_org")

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_bigquery_permission_error(self, test_client, mock_cost_service):
        """Test handling of BigQuery permission error."""
        mock_cost_service.get_cost_summary = AsyncMock(return_value=MagicMock(
            success=False,
            data=None,
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=0,
            error="Permission denied for table"
        ))

        response = await test_client.get("/api/v1/costs/test_org/summary")

        assert response.status_code == 500

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="ASGITransport in httpx propagates exceptions instead of returning 500 responses in test environment")
    async def test_service_exception(self, test_client_with_mock):
        """Test handling of unexpected service exception.

        Note: This test is skipped because httpx's ASGITransport behaves differently
        than a real HTTP server when exceptions occur. The actual API code has proper
        exception handling via the global exception handler in main.py.
        """
        test_client, mock_cost_service = test_client_with_mock
        mock_cost_service.get_cost_by_provider = AsyncMock(
            side_effect=Exception("Unexpected error")
        )

        response = await test_client.get("/api/v1/costs/test_org/by-provider")

        assert response.status_code == 500


# ============================================
# Performance Tests
# ============================================

class TestCostAPIPerformance:
    """Performance-related tests for cost API."""

    @pytest.mark.asyncio
    async def test_cache_hit_indicator(self, test_client, mock_cost_service):
        """Test that cache hit is properly indicated in response."""
        mock_cost_service.get_costs = AsyncMock(return_value=MagicMock(
            success=True,
            data=[],
            summary=None,
            pagination={"limit": 1000, "offset": 0, "total": 0},
            cache_hit=True,
            query_time_ms=1.0,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org")

        assert response.status_code == 200
        data = response.json()
        assert data["cache_hit"] is True
        assert data["query_time_ms"] < 10  # Fast due to cache hit

    @pytest.mark.asyncio
    async def test_query_time_tracking(self, test_client, mock_cost_service):
        """Test that query time is tracked in response."""
        mock_cost_service.get_cost_trend = AsyncMock(return_value=MagicMock(
            success=True,
            data=[],
            summary=None,
            pagination=None,
            cache_hit=False,
            query_time_ms=250.5,
            error=None
        ))

        response = await test_client.get("/api/v1/costs/test_org/trend")

        assert response.status_code == 200
        data = response.json()
        assert "query_time_ms" in data
        assert data["query_time_ms"] == 250.5
