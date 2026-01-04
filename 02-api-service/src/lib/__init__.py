"""
CloudAct Calculation Libraries

Centralized calculation modules for cost, usage, and integration data.
Used by services to ensure consistent calculations across all endpoints.

Modules:
- costs: Cost aggregation, forecasting, and filtering
- usage: GenAI usage calculations (tokens, requests, latency)
- integrations: Provider status and health checks
"""

from src.lib.costs import (
    # Aggregations
    aggregate_by_provider,
    aggregate_by_service,
    aggregate_by_category,
    aggregate_by_date,
    # Calculations
    calculate_daily_rate,
    calculate_monthly_forecast,
    calculate_annual_forecast,
    calculate_percentage,
    calculate_mtd_cost,
    calculate_ytd_cost,
    # Filters
    filter_date_range,
    filter_providers,
    filter_categories,
)

from src.lib.usage import (
    # Aggregations
    aggregate_tokens_by_provider,
    aggregate_tokens_by_model,
    aggregate_requests_by_date,
    # Calculations
    calculate_daily_token_rate,
    calculate_monthly_token_forecast,
    calculate_tokens_per_request,
    calculate_success_rate,
    # Formatters
    format_token_count,
)

from src.lib.integrations import (
    # Aggregations
    aggregate_integration_status,
    aggregate_by_category as aggregate_integrations_by_category,
    aggregate_validation_history,
    # Calculations
    calculate_integration_health,
    calculate_status_counts,
    calculate_valid_rate,
    # Constants
    get_provider_category,
    get_provider_display_name,
    INTEGRATION_STATUS,
    PROVIDER_CATEGORIES,
)

__all__ = [
    # Costs
    "aggregate_by_provider",
    "aggregate_by_service",
    "aggregate_by_category",
    "aggregate_by_date",
    "calculate_daily_rate",
    "calculate_monthly_forecast",
    "calculate_annual_forecast",
    "calculate_percentage",
    "calculate_mtd_cost",
    "calculate_ytd_cost",
    "filter_date_range",
    "filter_providers",
    "filter_categories",
    # Usage
    "aggregate_tokens_by_provider",
    "aggregate_tokens_by_model",
    "aggregate_requests_by_date",
    "calculate_daily_token_rate",
    "calculate_monthly_token_forecast",
    "calculate_tokens_per_request",
    "calculate_success_rate",
    "format_token_count",
    # Integrations
    "aggregate_integration_status",
    "aggregate_integrations_by_category",
    "aggregate_validation_history",
    "calculate_integration_health",
    "calculate_status_counts",
    "calculate_valid_rate",
    "get_provider_category",
    "get_provider_display_name",
    "INTEGRATION_STATUS",
    "PROVIDER_CATEGORIES",
]
