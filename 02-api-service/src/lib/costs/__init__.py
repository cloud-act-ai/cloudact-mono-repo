"""
Cost Calculation Library

Centralized cost aggregation, forecasting, and filtering functions.
Uses Polars for high-performance calculations.

Usage:
    from src.lib.costs import (
        aggregate_by_provider,
        calculate_daily_rate,
        calculate_monthly_forecast,
    )

    # Aggregate costs by provider
    provider_breakdown = aggregate_by_provider(df)

    # Calculate forecasts
    daily_rate = calculate_daily_rate(mtd_cost, days_elapsed)
    monthly_forecast = calculate_monthly_forecast(daily_rate, days_in_month)
"""

from src.lib.costs.aggregations import (
    aggregate_by_provider,
    aggregate_by_service,
    aggregate_by_category,
    aggregate_by_date,
    aggregate_by_hierarchy,
    aggregate_granular,
)

from src.lib.costs.calculations import (
    # Date helpers
    get_date_info,
    DateInfo,
    # Rate calculations
    calculate_daily_rate,
    calculate_monthly_forecast,
    calculate_annual_forecast,
    calculate_forecasts,
    # Period calculations
    calculate_mtd_cost,
    calculate_ytd_cost,
    calculate_qtd_cost,
    # Percentage calculations
    calculate_percentage,
    calculate_percentage_change,
    # Cost-specific calculations
    calculate_effective_cost,
    calculate_cost_per_unit,
)

from src.lib.costs.filters import (
    filter_date_range,
    filter_providers,
    filter_categories,
    filter_services,
    filter_hierarchy,
    apply_cost_filters,
    CostFilterParams,
)

__all__ = [
    # Aggregations
    "aggregate_by_provider",
    "aggregate_by_service",
    "aggregate_by_category",
    "aggregate_by_date",
    "aggregate_by_hierarchy",
    "aggregate_granular",
    # Date helpers
    "get_date_info",
    "DateInfo",
    # Rate calculations
    "calculate_daily_rate",
    "calculate_monthly_forecast",
    "calculate_annual_forecast",
    "calculate_forecasts",
    # Period calculations
    "calculate_mtd_cost",
    "calculate_ytd_cost",
    "calculate_qtd_cost",
    # Percentage calculations
    "calculate_percentage",
    "calculate_percentage_change",
    # Cost-specific calculations
    "calculate_effective_cost",
    "calculate_cost_per_unit",
    # Filters
    "filter_date_range",
    "filter_providers",
    "filter_categories",
    "filter_services",
    "filter_hierarchy",
    "apply_cost_filters",
    "CostFilterParams",
]
