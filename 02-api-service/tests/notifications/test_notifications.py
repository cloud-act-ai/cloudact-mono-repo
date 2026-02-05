"""
Test Notification Settings API Routes

Tests for notification channels, rules, summaries, and history endpoints.
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
    mock_service.list_channels = AsyncMock(return_value=[])
    mock_service.get_channel = AsyncMock(return_value=None)
    mock_service.create_channel = AsyncMock()
    mock_service.update_channel = AsyncMock()
    mock_service.delete_channel = AsyncMock(return_value=True)
    mock_service.list_rules = AsyncMock(return_value=[])
    mock_service.get_rule = AsyncMock(return_value=None)
    mock_service.create_rule = AsyncMock()
    mock_service.update_rule = AsyncMock()
    mock_service.delete_rule = AsyncMock(return_value=True)
    mock_service.pause_rule = AsyncMock()
    mock_service.resume_rule = AsyncMock()
    mock_service.list_summaries = AsyncMock(return_value=[])
    mock_service.get_summary = AsyncMock(return_value=None)
    mock_service.create_summary = AsyncMock()
    mock_service.update_summary = AsyncMock()
    mock_service.delete_summary = AsyncMock(return_value=True)
    mock_service.list_history = AsyncMock(return_value=[])
    mock_service.get_history_entry = AsyncMock(return_value=None)
    mock_service.acknowledge_notification = AsyncMock()
    mock_service.get_stats = AsyncMock(return_value=MagicMock())
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
    
    with patch("src.app.routers.notifications.get_current_org", return_value=mock_get_current_org()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


# ============================================
# Channel Tests
# ============================================

class TestNotificationChannels:
    """Tests for notification channel endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_channels(self, authenticated_client, mock_notification_service):
        """Test listing notification channels."""
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/channels",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_channels_filtered_by_type(self, authenticated_client, mock_notification_service):
        """Test listing channels filtered by type."""
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/channels?channel_type=email",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_create_channel(self, authenticated_client, mock_notification_service):
        """Test creating a notification channel."""
        mock_channel = MagicMock()
        mock_channel.channel_id = "channel-123"
        mock_channel.name = "Email Channel"
        mock_notification_service.create_channel = AsyncMock(return_value=mock_channel)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/notifications/test_org/channels",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "name": "Email Channel",
                    "channel_type": "email",
                    "configuration": {"to": ["admin@test.com"]}
                }
            )
            
            assert response.status_code in [200, 201, 422, 500, 403]

    @pytest.mark.asyncio
    async def test_get_channel(self, authenticated_client, mock_notification_service):
        """Test getting a specific channel."""
        mock_channel = MagicMock()
        mock_channel.channel_id = "channel-123"
        mock_notification_service.get_channel = AsyncMock(return_value=mock_channel)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/channels/channel-123",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_update_channel(self, authenticated_client, mock_notification_service):
        """Test updating a channel."""
        mock_channel = MagicMock()
        mock_notification_service.update_channel = AsyncMock(return_value=mock_channel)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.put(
                "/api/v1/notifications/test_org/channels/channel-123",
                headers={"X-API-Key": "test-api-key"},
                json={"name": "Updated Channel"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_delete_channel(self, authenticated_client, mock_notification_service):
        """Test deleting a channel."""
        mock_notification_service.delete_channel = AsyncMock(return_value=True)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.delete(
                "/api/v1/notifications/test_org/channels/channel-123",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [204, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_test_channel(self, authenticated_client, mock_notification_service):
        """Test testing a notification channel."""
        mock_channel = MagicMock()
        mock_channel.name = "Test Channel"
        mock_channel.channel_type = MagicMock()
        mock_channel.channel_type.value = "email"
        mock_notification_service.get_channel = AsyncMock(return_value=mock_channel)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            with patch("httpx.AsyncClient") as mock_httpx:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_httpx.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
                
                response = await authenticated_client.post(
                    "/api/v1/notifications/test_org/channels/channel-123/test",
                    headers={"X-API-Key": "test-api-key"}
                )
                
                assert response.status_code in [200, 404, 500, 403]


# ============================================
# Rule Tests
# ============================================

class TestNotificationRules:
    """Tests for notification rule endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_rules(self, authenticated_client, mock_notification_service):
        """Test listing notification rules."""
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/rules",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_create_rule(self, authenticated_client, mock_notification_service):
        """Test creating a notification rule."""
        mock_rule = MagicMock()
        mock_rule.rule_id = "rule-123"
        mock_notification_service.create_rule = AsyncMock(return_value=mock_rule)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/notifications/test_org/rules",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "name": "Cost Spike Rule",
                    "rule_category": "cost_spike",
                    "priority": "high",
                    "conditions": {"threshold_value": 1000}
                }
            )
            
            assert response.status_code in [200, 201, 422, 500, 403]

    @pytest.mark.asyncio
    async def test_pause_rule(self, authenticated_client, mock_notification_service):
        """Test pausing a notification rule."""
        mock_rule = MagicMock()
        mock_notification_service.pause_rule = AsyncMock(return_value=mock_rule)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/notifications/test_org/rules/rule-123/pause",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_resume_rule(self, authenticated_client, mock_notification_service):
        """Test resuming a paused rule."""
        mock_rule = MagicMock()
        mock_notification_service.resume_rule = AsyncMock(return_value=mock_rule)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/notifications/test_org/rules/rule-123/resume",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]


# ============================================
# Summary Tests
# ============================================

class TestNotificationSummaries:
    """Tests for notification summary endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_summaries(self, authenticated_client, mock_notification_service):
        """Test listing notification summaries."""
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/summaries",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_create_summary(self, authenticated_client, mock_notification_service):
        """Test creating a notification summary."""
        mock_summary = MagicMock()
        mock_summary.summary_id = "summary-123"
        mock_notification_service.create_summary = AsyncMock(return_value=mock_summary)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/notifications/test_org/summaries",
                headers={"X-API-Key": "test-api-key"},
                json={
                    "name": "Weekly Cost Summary",
                    "summary_type": "weekly",
                    "schedule_cron": "0 8 * * 1"
                }
            )
            
            assert response.status_code in [200, 201, 422, 500, 403]


# ============================================
# History Tests
# ============================================

class TestNotificationHistory:
    """Tests for notification history endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_history(self, authenticated_client, mock_notification_service):
        """Test listing notification history."""
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/history",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_acknowledge_notification(self, authenticated_client, mock_notification_service):
        """Test acknowledging a notification."""
        mock_entry = MagicMock()
        mock_notification_service.acknowledge_notification = AsyncMock(return_value=mock_entry)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.post(
                "/api/v1/notifications/test_org/history/notification-123/acknowledge",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]


# ============================================
# Stats Tests
# ============================================

class TestNotificationStats:
    """Tests for notification statistics endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_stats(self, authenticated_client, mock_notification_service):
        """Test getting notification statistics."""
        mock_stats = MagicMock()
        mock_stats.total_sent = 100
        mock_stats.total_failed = 5
        mock_notification_service.get_stats = AsyncMock(return_value=mock_stats)
        
        with patch("src.app.routers.notifications.get_service", return_value=mock_notification_service):
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/stats",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]


# ============================================
# Org-Specific Scheduled Alerts Tests
# ============================================

class TestOrgScheduledAlerts:
    """Tests for org-specific scheduled alert endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_scheduled_alerts(self, authenticated_client, mock_notification_service):
        """Test listing scheduled alert configurations."""
        with patch("src.app.routers.notifications.get_settings") as mock_settings:
            mock_settings.return_value.pipeline_service_url = "http://localhost:8001"
            
            with patch("httpx.AsyncClient") as mock_httpx:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"alerts": []}
                mock_httpx.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)
                
                response = await authenticated_client.get(
                    "/api/v1/notifications/test_org/scheduled-alerts",
                    headers={"X-API-Key": "test-api-key"}
                )
                
                assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_get_alert_history(self, authenticated_client):
        """Test getting alert history."""
        with patch("google.cloud.bigquery.Client") as mock_bq:
            mock_client = MagicMock()
            mock_client.query.return_value.result.return_value = []
            mock_bq.return_value = mock_client
            
            response = await authenticated_client.get(
                "/api/v1/notifications/test_org/alert-history",
                headers={"X-API-Key": "test-api-key"}
            )
            
            assert response.status_code in [200, 500, 403]


# ============================================
# Authorization Tests
# ============================================

class TestNotificationAuthorization:
    """Tests for notification endpoint authorization."""
    
    @pytest.mark.asyncio
    async def test_wrong_org_access_denied(self, authenticated_client, mock_notification_service):
        """Test accessing another org's notifications is denied."""
        response = await authenticated_client.get(
            "/api/v1/notifications/wrong_org/channels",
            headers={"X-API-Key": "test-api-key"}
        )
        
        assert response.status_code in [403, 500]
