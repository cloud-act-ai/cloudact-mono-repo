"""
Usage Calculation Library

Centralized GenAI usage aggregation, calculations, and formatting.
Handles token counts, request metrics, and latency data.

Usage:
    from src.lib.usage import (
        aggregate_tokens_by_provider,
        calculate_daily_token_rate,
        format_token_count,
    )

    # Aggregate tokens by provider
    provider_breakdown = aggregate_tokens_by_provider(df)

    # Calculate forecasts
    daily_rate = calculate_daily_token_rate(mtd_tokens, days_elapsed)
"""

from src.lib.usage.aggregations import (
    aggregate_tokens_by_provider,
    aggregate_tokens_by_model,
    aggregate_requests_by_date,
    aggregate_usage_by_date,
    aggregate_latency_by_provider,
)

from src.lib.usage.calculations import (
    # Token calculations
    calculate_total_tokens,
    calculate_tokens_per_request,
    calculate_token_ratio,
    calculate_cache_hit_rate,
    # Rate calculations
    calculate_daily_token_rate,
    calculate_monthly_token_forecast,
    calculate_annual_token_forecast,
    calculate_token_forecasts,
    # Request calculations
    calculate_success_rate,
    calculate_failure_rate,
    calculate_requests_per_day,
    # Latency calculations
    calculate_average_latency,
    calculate_p95_latency,
    # Cost calculations
    calculate_cost_per_token,
    calculate_cost_per_1m_tokens,
    estimate_token_cost,
    # Summary
    calculate_usage_summary,
    UsageSummary,
)

from src.lib.usage.formatters import (
    format_token_count,
    format_token_count_compact,
    format_requests,
    format_latency,
    format_success_rate,
)

from src.lib.usage.constants import (
    GENAI_PROVIDER_NAMES,
    GENAI_PROVIDER_COLORS,
    MODEL_NAMES,
    MODEL_PROVIDERS,
    get_provider_name,
    get_provider_color,
    get_model_name,
)

__all__ = [
    # Aggregations
    "aggregate_tokens_by_provider",
    "aggregate_tokens_by_model",
    "aggregate_requests_by_date",
    "aggregate_usage_by_date",
    "aggregate_latency_by_provider",
    # Token calculations
    "calculate_total_tokens",
    "calculate_tokens_per_request",
    "calculate_token_ratio",
    "calculate_cache_hit_rate",
    # Rate calculations
    "calculate_daily_token_rate",
    "calculate_monthly_token_forecast",
    "calculate_annual_token_forecast",
    "calculate_token_forecasts",
    # Request calculations
    "calculate_success_rate",
    "calculate_failure_rate",
    "calculate_requests_per_day",
    # Latency calculations
    "calculate_average_latency",
    "calculate_p95_latency",
    # Cost calculations
    "calculate_cost_per_token",
    "calculate_cost_per_1m_tokens",
    "estimate_token_cost",
    # Summary
    "calculate_usage_summary",
    "UsageSummary",
    # Formatters
    "format_token_count",
    "format_token_count_compact",
    "format_requests",
    "format_latency",
    "format_success_rate",
    # Constants
    "GENAI_PROVIDER_NAMES",
    "GENAI_PROVIDER_COLORS",
    "MODEL_NAMES",
    "MODEL_PROVIDERS",
    "get_provider_name",
    "get_provider_color",
    "get_model_name",
]
