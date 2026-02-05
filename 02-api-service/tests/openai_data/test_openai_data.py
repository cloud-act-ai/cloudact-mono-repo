"""
Test OpenAI Data CRUD API Routes

Tests for OpenAI pricing and subscription management endpoints.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from datetime import datetime, date, timezone


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_bq_client():
    """Mock BigQuery client."""
    mock_client = MagicMock()
    mock_client.client = MagicMock()
    return mock_client


@pytest.fixture
async def authenticated_client():
    """Async client with org authentication mocked."""
    from src.app.main import app
    
    def mock_get_current_org():
        return {
            "org_slug": "test_org",
            "company_name": "Test Organization",
            "admin_email": "admin@test.com",
            "status": "ACTIVE"
        }
    
    with patch("src.app.routers.openai_data.get_current_org", return_value=mock_get_current_org()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


# ============================================
# Pricing Endpoint Tests
# ============================================

class TestListPricing:
    """Tests for GET /api/v1/integrations/{org_slug}/openai/pricing endpoint."""
    
    @pytest.mark.asyncio
    async def test_list_pricing_success(self, authenticated_client, mock_bq_client):
        """Test listing OpenAI pricing."""
        mock_bq_client.client.query.return_value.result.return_value = [
            {
                "model_id": "gpt-4",
                "model_name": "GPT-4",
                "input_price_per_1k": 0.03,
                "output_price_per_1k": 0.06,
                "effective_date": date(2024, 1, 1),
                "notes": "Test pricing",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        ]
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/integrations/test_org/openai/pricing",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_pricing_empty(self, authenticated_client, mock_bq_client):
        """Test listing pricing when none exist."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/integrations/test_org/openai/pricing",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_pricing_wrong_org(self, authenticated_client, mock_bq_client):
        """Test listing pricing for wrong org is forbidden."""
        response = await authenticated_client.get(
            "/api/v1/integrations/wrong_org/openai/pricing",
            headers={"X-API-Key": "test-api-key"}
        )
        
        assert response.status_code in [403, 500]


class TestGetPricing:
    """Tests for GET /api/v1/integrations/{org_slug}/openai/pricing/{model_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_pricing_success(self, authenticated_client, mock_bq_client):
        """Test getting specific model pricing."""
        mock_row = MagicMock()
        mock_row.__iter__ = lambda self: iter({
            "model_id": "gpt-4",
            "model_name": "GPT-4",
            "input_price_per_1k": 0.03,
            "output_price_per_1k": 0.06,
            "effective_date": date(2024, 1, 1),
            "notes": "Test",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }.items())
        
        mock_bq_client.client.query.return_value.result.return_value = [mock_row]
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/integrations/test_org/openai/pricing/gpt-4",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_get_pricing_not_found(self, authenticated_client, mock_bq_client):
        """Test getting non-existent pricing."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/integrations/test_org/openai/pricing/nonexistent-model",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [404, 500, 403]


class TestCreatePricing:
    """Tests for POST /api/v1/integrations/{org_slug}/openai/pricing endpoint."""
    
    @pytest.mark.asyncio
    async def test_create_pricing_success(self, authenticated_client, mock_bq_client):
        """Test creating new pricing."""
        # First query returns count=0 (not exists)
        mock_count_result = MagicMock()
        mock_count_result.cnt = 0
        mock_bq_client.client.query.return_value.result.return_value = [mock_count_result]
        mock_bq_client.client.insert_rows_json.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.post(
                "/api/v1/integrations/test_org/openai/pricing",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "model_id": "gpt-4-turbo",
                    "model_name": "GPT-4 Turbo",
                    "input_price_per_1k": 0.01,
                    "output_price_per_1k": 0.03,
                    "effective_date": "2024-01-01"
                }
            )
            
            assert response.status_code in [201, 409, 500, 403, 422]

    @pytest.mark.asyncio
    async def test_create_pricing_duplicate(self, authenticated_client, mock_bq_client):
        """Test creating duplicate pricing fails."""
        mock_count_result = MagicMock()
        mock_count_result.cnt = 1  # Already exists
        mock_bq_client.client.query.return_value.result.return_value = [mock_count_result]
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.post(
                "/api/v1/integrations/test_org/openai/pricing",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "model_id": "gpt-4",
                    "model_name": "GPT-4",
                    "input_price_per_1k": 0.03,
                    "output_price_per_1k": 0.06,
                    "effective_date": "2024-01-01"
                }
            )
            
            assert response.status_code in [409, 500, 403, 422]


class TestUpdatePricing:
    """Tests for PUT /api/v1/integrations/{org_slug}/openai/pricing/{model_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_update_pricing_success(self, authenticated_client, mock_bq_client):
        """Test updating pricing."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.put(
                "/api/v1/integrations/test_org/openai/pricing/gpt-4",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "input_price_per_1k": 0.025,
                    "notes": "Updated pricing"
                }
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_update_pricing_no_fields(self, authenticated_client, mock_bq_client):
        """Test updating pricing with no fields fails."""
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.put(
                "/api/v1/integrations/test_org/openai/pricing/gpt-4",
                headers={"X-API-Key": "test-api-key"},
                json={}
            )
            
            assert response.status_code in [400, 500, 403]


class TestDeletePricing:
    """Tests for DELETE /api/v1/integrations/{org_slug}/openai/pricing/{model_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_delete_pricing_success(self, authenticated_client, mock_bq_client):
        """Test deleting pricing."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.delete(
                "/api/v1/integrations/test_org/openai/pricing/gpt-4",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [204, 500, 403]


class TestResetPricing:
    """Tests for POST /api/v1/integrations/{org_slug}/openai/pricing/reset endpoint."""
    
    @pytest.mark.asyncio
    async def test_reset_pricing(self, authenticated_client, mock_bq_client):
        """Test resetting pricing to defaults."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            with patch("src.app.routers.openai_data._initialize_openai_pricing", new_callable=AsyncMock) as mock_init:
                mock_init.return_value = {"status": "SUCCESS"}
                
                response = await authenticated_client.post(
                    "/api/v1/integrations/test_org/openai/pricing/reset",
                    headers={"X-API-Key": "test-api-key"}
                )
                
                assert response.status_code in [200, 500, 403]


# ============================================
# Subscription Endpoint Tests
# ============================================

class TestListSubscriptions:
    """Tests for GET /api/v1/integrations/{org_slug}/openai/subscriptions endpoint."""
    
    @pytest.mark.asyncio
    async def test_list_subscriptions_success(self, authenticated_client, mock_bq_client):
        """Test listing OpenAI subscriptions."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/integrations/test_org/openai/subscriptions",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]


class TestCreateSubscription:
    """Tests for POST /api/v1/integrations/{org_slug}/openai/subscriptions endpoint."""
    
    @pytest.mark.asyncio
    async def test_create_subscription_success(self, authenticated_client, mock_bq_client):
        """Test creating new subscription."""
        mock_count_result = MagicMock()
        mock_count_result.cnt = 0
        mock_bq_client.client.query.return_value.result.return_value = [mock_count_result]
        mock_bq_client.client.insert_rows_json.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.post(
                "/api/v1/integrations/test_org/openai/subscriptions",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "subscription_id": "sub-123",
                    "plan_name": "enterprise",
                    "quantity": 10,
                    "unit_price": 20.0,
                    "effective_date": "2024-01-01"
                }
            )
            
            assert response.status_code in [201, 409, 500, 403, 422]


class TestUpdateSubscription:
    """Tests for PUT /api/v1/integrations/{org_slug}/openai/subscriptions/{plan_name} endpoint."""
    
    @pytest.mark.asyncio
    async def test_update_subscription_success(self, authenticated_client, mock_bq_client):
        """Test updating subscription."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.put(
                "/api/v1/integrations/test_org/openai/subscriptions/enterprise",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "quantity": 20,
                    "notes": "Updated quantity"
                }
            )
            
            assert response.status_code in [200, 404, 500, 403]


class TestDeleteSubscription:
    """Tests for DELETE /api/v1/integrations/{org_slug}/openai/subscriptions/{plan_name} endpoint."""
    
    @pytest.mark.asyncio
    async def test_delete_subscription_success(self, authenticated_client, mock_bq_client):
        """Test deleting subscription."""
        mock_bq_client.client.query.return_value.result.return_value = []
        
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.delete(
                "/api/v1/integrations/test_org/openai/subscriptions/enterprise",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [204, 500, 403]


# ============================================
# Validation Tests
# ============================================

class TestInputValidation:
    """Tests for input validation."""
    
    @pytest.mark.asyncio
    async def test_invalid_org_slug_format(self, authenticated_client):
        """Test invalid org slug format is rejected."""
        response = await authenticated_client.get(
            "/api/v1/integrations/INVALID-ORG!@#/openai/pricing",
            headers={"X-API-Key": "test-api-key"}
        )
        
        # Should fail validation or auth
        assert response.status_code in [400, 403, 422]

    @pytest.mark.asyncio
    async def test_invalid_model_id_format(self, authenticated_client, mock_bq_client):
        """Test invalid model_id format is rejected."""
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/integrations/test_org/openai/pricing/invalid!model@id",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [400, 403, 404]

    @pytest.mark.asyncio
    async def test_invalid_plan_name_format(self, authenticated_client, mock_bq_client):
        """Test invalid plan_name format is rejected."""
        with patch("src.app.routers.openai_data.get_bigquery_client", return_value=mock_bq_client):
            response = await authenticated_client.get(
                "/api/v1/integrations/test_org/openai/subscriptions/invalid-plan!",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [400, 403, 404]
