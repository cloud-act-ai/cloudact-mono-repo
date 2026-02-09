"""
Tests for cost MCP tools.
Validates query_costs, compare_periods, cost_breakdown, cost_forecast, top_cost_drivers.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import date

from src.core.tools.costs import (
    query_costs,
    compare_periods,
    cost_breakdown,
    cost_forecast,
    top_cost_drivers,
)


@pytest.fixture(autouse=True)
def _mock_bq(mock_validate_org, mock_guard_query, mock_execute_query):
    """All cost tools need validate_org, guard_query, and execute_query mocked."""
    pass


class TestQueryCosts:
    def test_returns_rows_grouped_by_provider(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"dimension": "GCP", "line_items": 10, "total_billed": 5000.0, "total_effective": 4500.0, "currency": "USD"},
            {"dimension": "AWS", "line_items": 5, "total_billed": 3000.0, "total_effective": 2800.0, "currency": "USD"},
        ]
        result = query_costs("test_org")
        assert result["count"] == 2
        assert result["rows"][0]["dimension"] == "GCP"
        assert result["rows"][0]["total_billed"] == 5000.0

    def test_filters_by_provider(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"dimension": "GCP", "line_items": 10, "total_billed": 5000.0, "total_effective": 4500.0, "currency": "USD"},
        ]
        result = query_costs("test_org", provider="GCP")
        assert result["count"] == 1
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "@provider" in query

    def test_filters_by_service_category(self, mock_execute_query):
        mock_execute_query.return_value = []
        result = query_costs("test_org", service_category="cloud")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "@category" in query

    def test_group_by_day(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"dimension": "2026-01-15", "line_items": 5, "total_billed": 100.0, "total_effective": 100.0, "currency": "USD"},
        ]
        result = query_costs("test_org", group_by="day")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "DATE(ChargePeriodStart)" in query

    def test_group_by_month(self, mock_execute_query):
        mock_execute_query.return_value = []
        query_costs("test_org", group_by="month")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "FORMAT_TIMESTAMP" in query

    def test_invalid_group_by_raises(self):
        with pytest.raises(ValueError, match="Invalid group_by"):
            query_costs("test_org", group_by="invalid")

    def test_limit_clamped_to_max(self, mock_execute_query):
        mock_execute_query.return_value = []
        query_costs("test_org", limit=9999)
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "LIMIT 500" in query

    def test_limit_minimum_is_1(self, mock_execute_query):
        mock_execute_query.return_value = []
        query_costs("test_org", limit=-5)
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "LIMIT 1" in query

    def test_default_date_range_used(self, mock_execute_query):
        mock_execute_query.return_value = []
        query_costs("test_org")
        call_args = mock_execute_query.call_args
        params = call_args[0][1]
        param_names = [p.name for p in params]
        assert "start_date" in param_names
        assert "end_date" in param_names

    def test_custom_date_range(self, mock_execute_query):
        mock_execute_query.return_value = []
        query_costs("test_org", start_date="2025-11-01", end_date="2026-04-30")
        call_args = mock_execute_query.call_args
        params = call_args[0][1]
        param_values = {p.name: p.value for p in params}
        assert param_values["start_date"] == "2025-11-01"
        assert param_values["end_date"] == "2026-04-30"

    def test_error_returns_error_dict(self, mock_execute_query):
        mock_execute_query.side_effect = Exception("BQ timeout")
        result = query_costs("test_org")
        assert "error" in result
        assert result["count"] == 0


class TestComparePeriods:
    def test_mtd_comparison(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"period": "current", "total_billed": 5000.0, "total_effective": 4500.0, "currency": "USD"},
            {"period": "previous", "total_billed": 4000.0, "total_effective": 3600.0, "currency": "USD"},
        ]
        result = compare_periods("test_org", "MTD")
        assert result["period_type"] == "MTD"
        assert result["current"]["total_billed"] == 5000.0
        assert result["previous"]["total_billed"] == 4000.0
        assert result["change_pct"] == 25.0

    def test_mom_comparison(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"period": "current", "total_billed": 3000.0, "total_effective": 3000.0, "currency": "USD"},
            {"period": "previous", "total_billed": 3000.0, "total_effective": 3000.0, "currency": "USD"},
        ]
        result = compare_periods("test_org", "MoM")
        assert result["change_pct"] == 0.0

    def test_qoq_uses_quarter_boundaries(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"period": "current", "total_billed": 10000.0, "total_effective": 10000.0, "currency": "USD"},
            {"period": "previous", "total_billed": 8000.0, "total_effective": 8000.0, "currency": "USD"},
        ]
        result = compare_periods("test_org", "QoQ")
        assert result["period_type"] == "QoQ"
        current_start = date.fromisoformat(result["current"]["start"])
        assert current_start.day == 1
        assert current_start.month in (1, 4, 7, 10)

    def test_yoy_comparison(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"period": "current", "total_billed": 50000.0, "total_effective": 50000.0, "currency": "USD"},
            {"period": "previous", "total_billed": 40000.0, "total_effective": 40000.0, "currency": "USD"},
        ]
        result = compare_periods("test_org", "YoY")
        assert result["period_type"] == "YoY"
        assert result["change_pct"] == 25.0

    def test_invalid_period_type_raises(self):
        with pytest.raises(ValueError, match="Invalid period_type"):
            compare_periods("test_org", "INVALID")

    def test_zero_previous_no_division_error(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"period": "current", "total_billed": 5000.0, "total_effective": 5000.0, "currency": "USD"},
        ]
        result = compare_periods("test_org", "MTD")
        assert result["change_pct"] == 0

    def test_provider_filter(self, mock_execute_query):
        mock_execute_query.return_value = []
        compare_periods("test_org", "MTD", provider="GCP")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "ServiceProviderName = @provider" in query


class TestCostBreakdown:
    def test_breakdown_by_provider(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"dimension": "GCP", "total_billed": 5000.0, "total_effective": 4500.0, "pct_of_total": 55.0, "currency": "USD"},
            {"dimension": "AWS", "total_billed": 4000.0, "total_effective": 3700.0, "pct_of_total": 45.0, "currency": "USD"},
        ]
        result = cost_breakdown("test_org", dimension="provider")
        assert result["count"] == 2

    def test_breakdown_by_service(self, mock_execute_query):
        mock_execute_query.return_value = []
        cost_breakdown("test_org", dimension="service")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "ServiceName" in query

    def test_breakdown_by_service_category(self, mock_execute_query):
        mock_execute_query.return_value = []
        cost_breakdown("test_org", dimension="service_category")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "ServiceCategory" in query

    def test_breakdown_by_team(self, mock_execute_query):
        mock_execute_query.return_value = []
        cost_breakdown("test_org", dimension="team")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "x_hierarchy_entity_name" in query

    def test_breakdown_by_region(self, mock_execute_query):
        mock_execute_query.return_value = []
        cost_breakdown("test_org", dimension="region")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "RegionName" in query

    def test_breakdown_by_model(self, mock_execute_query):
        mock_execute_query.return_value = []
        cost_breakdown("test_org", dimension="model")
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "x_genai_model" in query

    def test_invalid_dimension_raises(self):
        with pytest.raises(ValueError, match="Invalid dimension"):
            cost_breakdown("test_org", dimension="invalid_dim")


class TestCostForecast:
    def test_forecast_with_data(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"avg_daily": 100.0, "min_daily": 50.0, "max_daily": 200.0, "days_with_data": 30},
        ]
        result = cost_forecast("test_org", horizon_days=30)
        assert "forecast" in result
        assert result["forecast"]["projected_total"] == 3000.0
        assert result["forecast"]["avg_daily"] == 100.0
        assert result["forecast"]["confidence"] == "medium"

    def test_forecast_low_confidence(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"avg_daily": 100.0, "min_daily": 50.0, "max_daily": 200.0, "days_with_data": 5},
        ]
        result = cost_forecast("test_org")
        assert result["forecast"]["confidence"] == "low"

    def test_horizon_clamped(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"avg_daily": 100.0, "min_daily": 50.0, "max_daily": 200.0, "days_with_data": 30},
        ]
        result = cost_forecast("test_org", horizon_days=999)
        assert result["forecast"]["horizon_days"] == 90

    def test_no_data_returns_no_forecast(self, mock_execute_query):
        mock_execute_query.return_value = []
        result = cost_forecast("test_org")
        assert "forecast" not in result


class TestTopCostDrivers:
    def test_returns_top_drivers(self, mock_execute_query):
        mock_execute_query.return_value = [
            {"service": "Compute", "provider": "GCP", "current_cost": 3000.0, "previous_cost": 2500.0, "absolute_change": 500.0, "pct_change": 20.0},
            {"service": "S3", "provider": "AWS", "current_cost": 2000.0, "previous_cost": 1800.0, "absolute_change": 200.0, "pct_change": 11.1},
        ]
        result = top_cost_drivers("test_org")
        assert result["count"] == 2
        assert result["rows"][0]["service"] == "Compute"

    def test_days_clamped(self, mock_execute_query):
        mock_execute_query.return_value = []
        top_cost_drivers("test_org", days=999)
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "INTERVAL 90 DAY" in query

    def test_limit_clamped(self, mock_execute_query):
        mock_execute_query.return_value = []
        top_cost_drivers("test_org", limit=100)
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "LIMIT 20" in query
