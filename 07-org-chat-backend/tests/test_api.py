"""
Tests for FastAPI endpoints — health, chat, conversations, settings.
Uses TestClient with auth bypass (DISABLE_AUTH=true, ENVIRONMENT=test).
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture()
def api_client():
    """Create test client with all BQ dependencies mocked."""
    with patch("src.core.engine.bigquery.get_bq_client") as mock_bq, \
         patch("src.core.engine.bigquery.execute_query") as mock_exec, \
         patch("src.core.engine.bigquery.dry_run_estimate", return_value=1024):
        mock_bq.return_value = MagicMock()
        mock_exec.return_value = []
        from src.app.main import app
        yield TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self, api_client):
        resp = api_client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["service"] == "org-chat-backend"

    def test_health_includes_version(self, api_client):
        resp = api_client.get("/health")
        assert "version" in resp.json()


class TestOrgSlugValidation:
    def test_invalid_org_slug_returns_400(self, api_client):
        resp = api_client.get(
            "/api/v1/chat/INVALID-ORG!/conversations",
            headers={"X-Org-Slug": "INVALID-ORG!", "X-API-Key": "key", "X-User-Id": "user"},
        )
        assert resp.status_code == 400

    def test_short_org_slug_returns_400(self, api_client):
        resp = api_client.get(
            "/api/v1/chat/ab/conversations",
            headers={"X-Org-Slug": "ab", "X-API-Key": "key", "X-User-Id": "user"},
        )
        assert resp.status_code == 400

    def test_sql_injection_slug_returns_400(self, api_client):
        slug = "'; DROP TABLE --"
        resp = api_client.get(
            f"/api/v1/chat/{slug}/conversations",
            headers={"X-Org-Slug": slug, "X-API-Key": "key", "X-User-Id": "user"},
        )
        assert resp.status_code == 400


class TestOrgMismatch:
    def test_header_path_mismatch_returns_403(self, api_client):
        resp = api_client.get(
            "/api/v1/chat/org_alpha/conversations",
            headers={"X-Org-Slug": "org_beta", "X-API-Key": "key", "X-User-Id": "user"},
        )
        assert resp.status_code == 403


class TestConversationsEndpoint:
    def test_list_conversations(self, api_client):
        with patch("src.app.main.list_conversations", return_value=[]):
            resp = api_client.get(
                "/api/v1/chat/test_org/conversations",
                headers={"X-Org-Slug": "test_org", "X-API-Key": "key", "X-User-Id": "user"},
            )
            assert resp.status_code == 200
            assert resp.json()["org_slug"] == "test_org"


class TestSettingsStatusEndpoint:
    def test_no_settings_returns_setup_required(self, api_client):
        with patch("src.app.main.load_chat_settings", return_value=None):
            resp = api_client.get(
                "/api/v1/chat/test_org/settings/status",
                headers={"X-Org-Slug": "test_org", "X-API-Key": "key", "X-User-Id": "user"},
            )
            assert resp.status_code == 200
            assert resp.json()["configured"] is False

    def test_configured_returns_provider(self, api_client):
        with patch("src.app.main.load_chat_settings", return_value={"provider": "OPENAI", "model_id": "gpt-4o"}):
            resp = api_client.get(
                "/api/v1/chat/test_org/settings/status",
                headers={"X-Org-Slug": "test_org", "X-API-Key": "key", "X-User-Id": "user"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["configured"] is True
            assert data["provider"] == "OPENAI"


class TestAgentCardEndpoint:
    def test_agent_card_returns_200(self, api_client):
        resp = api_client.get("/.well-known/agent.json")
        assert resp.status_code == 200
        data = resp.json()
        assert "name" in data or "capabilities" in data or "url" in data
