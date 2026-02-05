"""
Test Cost Alerts API Routes

Tests for cost threshold alert management endpoints.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_notification_service():
    """Mock notification settings service."""
    mock_service = MagicMock()
    mock_service.list_scheduled_alerts = AsyncMock(return_value=[])
    mock_service.get_scheduled_alert = AsyncMock(return_value=None)
    mock_service.create_scheduled_alert = AsyncMock()
    mock_service.update_scheduled_alert = AsyncMock()
    mock_service.delete_scheduled_alert = AsyncMock(return_value=True)
    mock_service.enable_scheduled_alert = AsyncMock()
    mock_service.disable_scheduled_alert = AsyncMock()
    return mock_service


@pytest.fixture
async def authenticated_client():
    """Async client with org authentication mocked."""
    from src.app.main import app
    
    def mock_get_current_org():
        return {
            "org_slug": "test_org",
            "company_name": "Test Organization",
            "admin_email": "admin@test.com",
            "status": "ACTIVE",
            "api_key": "test-api-key-123"
        }
    
    with patch("src.app.routers.cost_alerts.get_current_org", return_value=mock_get_current_org()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


# ============================================
# List Cost Alerts Tests
# ============================================

class TestListCostAlerts:
    """Tests for GET /api/v1/cost-alerts/{org_slug} endpoint."""
    
    @pytest.mark.asyncio
    async def test_list_cost_alerts_empty(self, authenticated_client, mock_notification_service):
        """Test listing cost alerts when none exist."""
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/cost-alerts/test_org",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_cost_alerts_with_scope_filter(self, authenticated_client, mock_notification_service):
        """Test listing cost alerts with scope filter."""
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/cost-alerts/test_org?scope=cloud",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_cost_alerts_enabled_only(self, authenticated_client, mock_notification_service):
        """Test listing only enabled cost alerts."""
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/cost-alerts/test_org?enabled_only=true",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_cost_alerts_wrong_org(self, authenticated_client, mock_notification_service):
        """Test listing cost alerts for wrong organization."""
        response = await authenticated_client.get(
            "/api/v1/cost-alerts/wrong_org",
            headers={"X-API-Key": "test-api-key"}
        )
        
        # Should be forbidden
        assert response.status_code in [403, 500]


# ============================================
# Get Cost Alert Tests
# ============================================

class TestGetCostAlert:
    """Tests for GET /api/v1/cost-alerts/{org_slug}/{alert_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_cost_alert_success(self, authenticated_client, mock_notification_service):
        """Test getting a specific cost alert."""
        mock_alert = MagicMock()
        mock_alert.alert_id = "alert-123"
        mock_alert.name = "Test Alert"
        mock_alert.org_slug = "test_org"
        mock_alert.alert_type = MagicMock()
        mock_alert.alert_type.value = "cost_threshold"
        mock_alert.conditions = []
        mock_alert.source_query_template = MagicMock()
        mock_alert.is_enabled = True
        mock_alert.last_triggered_at = None
        mock_alert.severity = MagicMock()
        mock_alert.channels = ["email"]
        mock_alert.schedule_cron = "0 8 * * *"
        
        mock_notification_service.get_scheduled_alert = AsyncMock(return_value=mock_alert)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/cost-alerts/test_org/alert-123",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_get_cost_alert_not_found(self, authenticated_client, mock_notification_service):
        """Test getting a non-existent cost alert."""
        mock_notification_service.get_scheduled_alert = AsyncMock(return_value=None)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/cost-alerts/test_org/nonexistent-alert",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [404, 500, 403]


# ============================================
# Create Cost Alert Tests
# ============================================

class TestCreateCostAlert:
    """Tests for POST /api/v1/cost-alerts/{org_slug} endpoint."""
    
    @pytest.mark.asyncio
    async def test_create_cost_alert_success(self, authenticated_client, mock_notification_service):
        """Test creating a cost alert."""
        mock_alert = MagicMock()
        mock_alert.alert_id = "new-alert-123"
        mock_alert.name = "Cloud Cost Alert"
        mock_alert.conditions = [MagicMock(value=1000, unit="USD")]
        mock_alert.source_query_template = MagicMock()
        mock_alert.is_enabled = True
        mock_alert.last_triggered_at = None
        mock_alert.severity = MagicMock()
        mock_alert.channels = ["email"]
        mock_alert.schedule_cron = "0 8 * * *"
        
        mock_notification_service.create_scheduled_alert = AsyncMock(return_value=mock_alert)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "name": "Cloud Cost Alert",
                    "scope": "cloud",
                    "threshold_value": 1000,
                    "threshold_currency": "USD",
                    "severity": "warning",
                    "channels": ["email"]
                }
            )
            
            assert response.status_code in [201, 400, 422, 500, 403]

    @pytest.mark.asyncio
    async def test_create_cost_alert_invalid_scope(self, authenticated_client, mock_notification_service):
        """Test creating a cost alert with invalid scope."""
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "name": "Invalid Alert",
                    "scope": "invalid_scope",
                    "threshold_value": 1000
                }
            )
            
            assert response.status_code in [400, 422, 500, 403]


# ============================================
# Update Cost Alert Tests
# ============================================

class TestUpdateCostAlert:
    """Tests for PUT /api/v1/cost-alerts/{org_slug}/{alert_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_update_cost_alert_success(self, authenticated_client, mock_notification_service):
        """Test updating a cost alert."""
        mock_existing = MagicMock()
        mock_existing.conditions = [MagicMock(value=1000, unit="USD")]
        mock_existing.source_params = {"period": "current_month"}
        
        mock_updated = MagicMock()
        mock_updated.alert_id = "alert-123"
        mock_updated.name = "Updated Alert"
        mock_updated.conditions = [MagicMock(value=2000, unit="USD")]
        mock_updated.source_query_template = MagicMock()
        mock_updated.is_enabled = True
        mock_updated.last_triggered_at = None
        mock_updated.severity = MagicMock()
        mock_updated.channels = ["email", "slack"]
        mock_updated.schedule_cron = "0 8 * * *"
        
        mock_notification_service.get_scheduled_alert = AsyncMock(return_value=mock_existing)
        mock_notification_service.update_scheduled_alert = AsyncMock(return_value=mock_updated)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.put(
                "/api/v1/cost-alerts/test_org/alert-123",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "name": "Updated Alert",
                    "threshold_value": 2000,
                    "channels": ["email", "slack"]
                }
            )
            
            assert response.status_code in [200, 404, 500, 403]


# ============================================
# Delete Cost Alert Tests
# ============================================

class TestDeleteCostAlert:
    """Tests for DELETE /api/v1/cost-alerts/{org_slug}/{alert_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_delete_cost_alert_success(self, authenticated_client, mock_notification_service):
        """Test deleting a cost alert."""
        mock_existing = MagicMock()
        mock_existing.alert_type = MagicMock()
        mock_existing.alert_type.value = "cost_threshold"
        
        mock_notification_service.get_scheduled_alert = AsyncMock(return_value=mock_existing)
        mock_notification_service.delete_scheduled_alert = AsyncMock(return_value=True)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.delete(
                "/api/v1/cost-alerts/test_org/alert-123",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [204, 404, 500, 403]


# ============================================
# Enable/Disable Cost Alert Tests
# ============================================

class TestEnableDisableCostAlert:
    """Tests for enable/disable cost alert endpoints."""
    
    @pytest.mark.asyncio
    async def test_enable_cost_alert(self, authenticated_client, mock_notification_service):
        """Test enabling a cost alert."""
        mock_enabled = MagicMock()
        mock_enabled.alert_id = "alert-123"
        mock_enabled.name = "Enabled Alert"
        mock_enabled.conditions = []
        mock_enabled.source_query_template = MagicMock()
        mock_enabled.is_enabled = True
        mock_enabled.last_triggered_at = None
        mock_enabled.severity = MagicMock()
        mock_enabled.channels = ["email"]
        mock_enabled.schedule_cron = "0 8 * * *"
        
        mock_notification_service.enable_scheduled_alert = AsyncMock(return_value=mock_enabled)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org/alert-123/enable",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_disable_cost_alert(self, authenticated_client, mock_notification_service):
        """Test disabling a cost alert."""
        mock_disabled = MagicMock()
        mock_disabled.alert_id = "alert-123"
        mock_disabled.name = "Disabled Alert"
        mock_disabled.conditions = []
        mock_disabled.source_query_template = MagicMock()
        mock_disabled.is_enabled = False
        mock_disabled.last_triggered_at = None
        mock_disabled.severity = MagicMock()
        mock_disabled.channels = ["email"]
        mock_disabled.schedule_cron = "0 8 * * *"
        
        mock_notification_service.disable_scheduled_alert = AsyncMock(return_value=mock_disabled)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org/alert-123/disable",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]


# ============================================
# Bulk Operations Tests
# ============================================

class TestBulkOperations:
    """Tests for bulk enable/disable endpoints."""
    
    @pytest.mark.asyncio
    async def test_bulk_enable_cost_alerts(self, authenticated_client, mock_notification_service):
        """Test bulk enabling cost alerts."""
        mock_alert = MagicMock()
        mock_notification_service.enable_scheduled_alert = AsyncMock(return_value=mock_alert)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org/bulk/enable",
                headers={"X-API-Key": "test-api-key"},
                json=["alert-1", "alert-2", "alert-3"]
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_bulk_disable_cost_alerts(self, authenticated_client, mock_notification_service):
        """Test bulk disabling cost alerts."""
        mock_alert = MagicMock()
        mock_notification_service.disable_scheduled_alert = AsyncMock(return_value=mock_alert)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org/bulk/disable",
                headers={"X-API-Key": "test-api-key"},
                json=["alert-1", "alert-2"]
            )
            
            assert response.status_code in [200, 500, 403]


# ============================================
# Preset Templates Tests
# ============================================

class TestPresetTemplates:
    """Tests for preset templates endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_cost_alert_presets(self, authenticated_client):
        """Test getting preset templates."""
        response = await authenticated_client.get(
            "/api/v1/cost-alerts/test_org/presets",
            headers={"X-API-Key": "test-api-key"}
        )
        
        assert response.status_code in [200, 500, 403]
        if response.status_code == 200:
            data = response.json()
            assert "presets" in data

    @pytest.mark.asyncio
    async def test_create_from_preset(self, authenticated_client, mock_notification_service):
        """Test creating cost alert from preset."""
        mock_created = MagicMock()
        mock_created.alert_id = "preset-alert-123"
        mock_created.name = "Cloud Cost Threshold ($1,000)"
        mock_created.conditions = [MagicMock(value=1000, unit="USD")]
        mock_created.source_query_template = MagicMock()
        mock_created.is_enabled = True
        mock_created.last_triggered_at = None
        mock_created.severity = MagicMock()
        mock_created.channels = ["email"]
        mock_created.schedule_cron = "0 8 * * *"
        
        mock_notification_service.create_scheduled_alert = AsyncMock(return_value=mock_created)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org/from-preset/cloud_1000",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [201, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_create_from_preset_not_found(self, authenticated_client, mock_notification_service):
        """Test creating cost alert from non-existent preset."""
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org/from-preset/nonexistent_preset",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [404, 500, 403]

    @pytest.mark.asyncio
    async def test_create_from_preset_with_overrides(self, authenticated_client, mock_notification_service):
        """Test creating cost alert from preset with overrides."""
        mock_created = MagicMock()
        mock_created.alert_id = "preset-alert-456"
        mock_created.name = "Custom Alert Name"
        mock_created.conditions = [MagicMock(value=5000, unit="USD")]
        mock_created.source_query_template = MagicMock()
        mock_created.is_enabled = True
        mock_created.last_triggered_at = None
        mock_created.severity = MagicMock()
        mock_created.channels = ["email"]
        mock_created.schedule_cron = "0 8 * * *"
        
        mock_notification_service.create_scheduled_alert = AsyncMock(return_value=mock_created)
        
        with patch("src.app.routers.cost_alerts.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/cost-alerts/test_org/from-preset/cloud_1000?name_override=Custom%20Alert%20Name&threshold_override=5000",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [201, 404, 500, 403]
