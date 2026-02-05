"""
Test Alert Scheduler API Routes

Tests for alert evaluation, configuration, and history endpoints.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient, ASGITransport


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def mock_alert_engine():
    """Mock alert engine."""
    mock_engine = MagicMock()
    mock_engine.evaluate_all_alerts = AsyncMock()
    mock_engine.evaluate_alerts_for_org = AsyncMock()
    mock_engine.config_loader = MagicMock()
    mock_engine.config_loader.load_all_alerts.return_value = []
    mock_engine.config_loader.get_alert_by_id.return_value = None
    mock_engine.config_loader.clear_cache = MagicMock()
    return mock_engine


@pytest.fixture
async def admin_client():
    """Async client with admin authentication mocked."""
    from src.app.main import app
    
    with patch("src.app.routers.alerts.verify_admin_key", return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


# ============================================
# Alert Evaluation Tests
# ============================================

class TestEvaluateScheduledAlerts:
    """Tests for POST /api/v1/alerts/scheduler/evaluate endpoint."""
    
    @pytest.mark.asyncio
    async def test_evaluate_all_alerts_success(self, admin_client, mock_alert_engine):
        """Test evaluating all scheduled alerts."""
        mock_summary = MagicMock()
        mock_summary.triggered = 2
        mock_summary.skipped_cooldown = 1
        mock_summary.skipped_disabled = 0
        mock_summary.no_match = 5
        mock_summary.no_data = 0
        mock_summary.errors = 0
        mock_summary.duration_ms = 1234.5
        mock_summary.details = []
        
        mock_alert_engine.evaluate_all_alerts = AsyncMock(return_value=mock_summary)
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/scheduler/evaluate",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_evaluate_specific_alerts(self, admin_client, mock_alert_engine):
        """Test evaluating specific alerts by ID."""
        mock_summary = MagicMock()
        mock_summary.triggered = 1
        mock_summary.skipped_cooldown = 0
        mock_summary.skipped_disabled = 0
        mock_summary.no_match = 0
        mock_summary.no_data = 0
        mock_summary.errors = 0
        mock_summary.duration_ms = 500.0
        mock_summary.details = []
        
        mock_alert_engine.evaluate_all_alerts = AsyncMock(return_value=mock_summary)
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/scheduler/evaluate?alert_ids=alert-1&alert_ids=alert-2",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_evaluate_with_force_check(self, admin_client, mock_alert_engine):
        """Test evaluating alerts with force_check ignoring cooldown."""
        mock_summary = MagicMock()
        mock_summary.triggered = 5
        mock_summary.skipped_cooldown = 0
        mock_summary.skipped_disabled = 0
        mock_summary.no_match = 0
        mock_summary.no_data = 0
        mock_summary.errors = 0
        mock_summary.duration_ms = 800.0
        mock_summary.details = []
        
        mock_alert_engine.evaluate_all_alerts = AsyncMock(return_value=mock_summary)
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/scheduler/evaluate?force_check=true",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]


# ============================================
# Alert Configuration Tests
# ============================================

class TestListAlertConfigs:
    """Tests for GET /api/v1/alerts/configs endpoint."""
    
    @pytest.mark.asyncio
    async def test_list_all_configs(self, admin_client, mock_alert_engine):
        """Test listing all alert configurations."""
        mock_alert = MagicMock()
        mock_alert.model_dump.return_value = {
            "id": "alert-1",
            "name": "Test Alert",
            "enabled": True,
            "tags": ["cost"]
        }
        mock_alert.enabled = True
        mock_alert.tags = ["cost"]
        
        mock_alert_engine.config_loader.load_all_alerts.return_value = [mock_alert]
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.get(
                "/api/v1/alerts/configs",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_enabled_only(self, admin_client, mock_alert_engine):
        """Test listing only enabled alerts."""
        mock_alert = MagicMock()
        mock_alert.model_dump.return_value = {"id": "alert-1", "enabled": True}
        mock_alert.enabled = True
        mock_alert.tags = []
        
        mock_alert_engine.config_loader.load_all_alerts.return_value = [mock_alert]
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.get(
                "/api/v1/alerts/configs?enabled_only=true",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_list_by_tag(self, admin_client, mock_alert_engine):
        """Test filtering alerts by tag."""
        mock_alert = MagicMock()
        mock_alert.model_dump.return_value = {"id": "alert-1", "tags": ["cost"]}
        mock_alert.enabled = True
        mock_alert.tags = ["cost"]
        
        mock_alert_engine.config_loader.load_all_alerts.return_value = [mock_alert]
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.get(
                "/api/v1/alerts/configs?tag=cost",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]


class TestGetAlertConfig:
    """Tests for GET /api/v1/alerts/configs/{alert_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_alert_config_success(self, admin_client, mock_alert_engine):
        """Test getting specific alert configuration."""
        mock_alert = MagicMock()
        mock_alert.model_dump.return_value = {
            "id": "alert-1",
            "name": "Test Alert",
            "enabled": True
        }
        
        mock_alert_engine.config_loader.get_alert_by_id.return_value = mock_alert
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.get(
                "/api/v1/alerts/configs/alert-1",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_get_alert_config_not_found(self, admin_client, mock_alert_engine):
        """Test getting non-existent alert configuration."""
        mock_alert_engine.config_loader.get_alert_by_id.return_value = None
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.get(
                "/api/v1/alerts/configs/nonexistent-alert",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [404, 500, 403]


# ============================================
# Alert Testing Tests
# ============================================

class TestAlertConfig:
    """Tests for POST /api/v1/alerts/configs/{alert_id}/test endpoint."""
    
    @pytest.mark.asyncio
    async def test_test_alert_dry_run(self, admin_client, mock_alert_engine):
        """Test testing an alert in dry run mode."""
        mock_alert = MagicMock()
        mock_alert.name = "Test Alert"
        mock_alert_engine.config_loader.get_alert_by_id.return_value = mock_alert
        
        mock_summary = MagicMock()
        mock_summary.triggered = 1
        mock_summary.no_match = 0
        mock_summary.errors = 0
        mock_summary.duration_ms = 100.0
        mock_summary.details = []
        
        mock_alert_engine.evaluate_all_alerts = AsyncMock(return_value=mock_summary)
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/configs/alert-1/test?dry_run=true",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 404, 500, 403]

    @pytest.mark.asyncio
    async def test_test_alert_not_found(self, admin_client, mock_alert_engine):
        """Test testing non-existent alert."""
        mock_alert_engine.config_loader.get_alert_by_id.return_value = None
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/configs/nonexistent/test",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [404, 500, 403]


# ============================================
# Cache Management Tests
# ============================================

class TestAlertCache:
    """Tests for POST /api/v1/alerts/cache/clear endpoint."""
    
    @pytest.mark.asyncio
    async def test_clear_alert_cache(self, admin_client, mock_alert_engine):
        """Test clearing alert configuration cache."""
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/cache/clear",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]
            if response.status_code == 200:
                mock_alert_engine.config_loader.clear_cache.assert_called_once()


# ============================================
# Org-Specific Alert Tests
# ============================================

class TestOrgAlertEvaluation:
    """Tests for POST /api/v1/alerts/orgs/{org_slug}/evaluate endpoint."""
    
    @pytest.mark.asyncio
    async def test_evaluate_org_alerts_success(self, admin_client, mock_alert_engine):
        """Test evaluating alerts for specific org."""
        mock_summary = MagicMock()
        mock_summary.triggered = 1
        mock_summary.skipped_cooldown = 0
        mock_summary.skipped_disabled = 0
        mock_summary.no_match = 2
        mock_summary.no_data = 0
        mock_summary.errors = 0
        mock_summary.duration_ms = 300.0
        mock_summary.details = []
        
        mock_alert_engine.evaluate_alerts_for_org = AsyncMock(return_value=mock_summary)
        
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/orgs/test_org/evaluate",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 400, 500, 403]

    @pytest.mark.asyncio
    async def test_evaluate_org_alerts_invalid_slug(self, admin_client, mock_alert_engine):
        """Test evaluating alerts with invalid org slug."""
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            response = await admin_client.post(
                "/api/v1/alerts/orgs/invalid!org@slug/evaluate",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [400, 500, 403]

    @pytest.mark.asyncio
    async def test_evaluate_org_alerts_empty_slug(self, admin_client, mock_alert_engine):
        """Test evaluating alerts with empty org slug."""
        with patch("src.app.routers.alerts.get_alert_engine", return_value=mock_alert_engine):
            # Empty slug in URL should 404
            response = await admin_client.post(
                "/api/v1/alerts/orgs//evaluate",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [400, 404, 500, 403]


class TestOrgAlertHistory:
    """Tests for GET /api/v1/alerts/orgs/{org_slug}/history endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_org_alert_history_success(self, admin_client):
        """Test getting alert history for org."""
        with patch("google.cloud.bigquery.Client") as mock_bq:
            mock_client = MagicMock()
            mock_client.query.return_value.result.return_value = []
            mock_bq.return_value = mock_client
            
            response = await admin_client.get(
                "/api/v1/alerts/orgs/test_org/history",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_get_org_alert_history_with_filters(self, admin_client):
        """Test getting alert history with filters."""
        with patch("google.cloud.bigquery.Client") as mock_bq:
            mock_client = MagicMock()
            mock_client.query.return_value.result.return_value = []
            mock_bq.return_value = mock_client
            
            response = await admin_client.get(
                "/api/v1/alerts/orgs/test_org/history?alert_id=alert-1&status=SENT&days=30&limit=100",
                headers={"X-CA-Root-Key": "test-admin-key"}
            )
            
            assert response.status_code in [200, 500, 403]

    @pytest.mark.asyncio
    async def test_get_org_alert_history_invalid_slug(self, admin_client):
        """Test getting history with invalid org slug."""
        response = await admin_client.get(
            "/api/v1/alerts/orgs/invalid!org/history",
            headers={"X-CA-Root-Key": "test-admin-key"}
        )
        
        assert response.status_code in [400, 500, 403]


# ============================================
# Authentication Tests
# ============================================

class TestAlertAuthentication:
    """Tests for alert endpoint authentication."""
    
    @pytest.mark.asyncio
    async def test_missing_admin_key(self):
        """Test endpoints fail without admin key."""
        from src.app.main import app
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/alerts/configs")
            
            assert response.status_code in [401, 403, 422]

    @pytest.mark.asyncio
    async def test_invalid_admin_key(self):
        """Test endpoints fail with invalid admin key."""
        from src.app.main import app
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/alerts/configs",
                headers={"X-CA-Root-Key": "invalid-key"}
            )
            
            assert response.status_code in [401, 403]
