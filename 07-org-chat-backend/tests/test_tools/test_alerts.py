"""
Tests for alert MCP tools.
Validates list_alerts, create_alert, alert_history, acknowledge_alert.
"""

import pytest
from unittest.mock import patch

from src.core.tools.alerts import (
    list_alerts,
    create_alert,
    alert_history,
    acknowledge_alert,
)


@pytest.fixture(autouse=True)
def _mock_bq(mock_validate_org, mock_guard_query, mock_execute_query, mock_streaming_insert):
    """Alerts tools need all BQ operations mocked."""
    pass


class TestListAlerts:
    def test_list_all_alerts(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"alert_id": "a1", "alert_name": "High GCP cost", "status": "active", "severity": "warning"},
        ]
        result = list_alerts("test_org")
        assert result["count"] == 1

    def test_filter_by_status(self, mock_execute_query):
        mock_execute_query.return_value = []
        list_alerts("test_org", status="active")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "@status" in query

    def test_invalid_status_raises(self):
        with pytest.raises(ValueError, match="Invalid status"):
            list_alerts("test_org", status="invalid")


class TestCreateAlert:
    def test_create_valid_alert(self, mock_streaming_insert):
        result = create_alert(
            "test_org",
            alert_name="GCP over budget",
            threshold_value=5000.0,
            provider="GCP",
            severity="warning",
        )
        assert result["status"] == "created"
        assert result["alert"]["alert_name"] == "GCP over budget"
        assert result["alert"]["threshold_value"] == 5000.0
        mock_streaming_insert.assert_called_once()

    def test_empty_name_raises(self):
        with pytest.raises(ValueError, match="alert_name cannot be empty"):
            create_alert("test_org", alert_name="   ", threshold_value=100.0)

    def test_negative_threshold_raises(self):
        with pytest.raises(ValueError, match="threshold_value must be positive"):
            create_alert("test_org", alert_name="Test", threshold_value=-100.0)

    def test_zero_threshold_raises(self):
        with pytest.raises(ValueError, match="threshold_value must be positive"):
            create_alert("test_org", alert_name="Test", threshold_value=0)

    def test_invalid_severity_raises(self):
        with pytest.raises(ValueError, match="Invalid severity"):
            create_alert("test_org", alert_name="Test", threshold_value=100.0, severity="extreme")

    def test_name_truncated_to_max_length(self, mock_streaming_insert):
        long_name = "A" * 300
        result = create_alert("test_org", alert_name=long_name, threshold_value=100.0)
        assert len(result["alert"]["alert_name"]) == 200

    def test_alert_id_has_chat_prefix(self, mock_streaming_insert):
        result = create_alert("test_org", alert_name="Test", threshold_value=100.0)
        assert result["alert_id"].startswith("chat_")


class TestAlertHistory:
    def test_list_history(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"alert_history_id": "h1", "alert_id": "a1", "status": "triggered"},
        ]
        result = alert_history("test_org")
        assert result["count"] == 1

    def test_date_filters(self, mock_execute_query):
        mock_execute_query.return_value = []
        alert_history("test_org", start_date="2025-01-01", end_date="2025-12-31")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "@start_date" in query
        assert "@end_date" in query

    def test_limit_clamped(self, mock_execute_query):
        mock_execute_query.return_value = []
        alert_history("test_org", limit=200)
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "LIMIT 100" in query


class TestAcknowledgeAlert:
    def test_acknowledge_success(self, mock_execute_query):
        mock_execute_query.return_value = []
        result = acknowledge_alert("test_org", "hist_123")
        assert result["status"] == "acknowledged"

    def test_acknowledge_error_returns_error(self):
        with patch("src.core.tools.alerts.execute_query", side_effect=Exception("BQ error")):
            result = acknowledge_alert("test_org", "hist_123")
        assert result["status"] == "error"
        assert "error" in result
