"""
Integrations Library

Centralized integration status, health, and aggregation functions.
Handles provider configs, status tracking, and health metrics.

Usage:
    from src.lib.integrations import (
        aggregate_integration_status,
        calculate_integration_health,
        get_provider_category,
    )

    # Get integration health
    health = calculate_integration_health(integrations)

    # Aggregate status
    status_breakdown = aggregate_integration_status(df)
"""

from src.lib.integrations.constants import (
    INTEGRATION_STATUS,
    INTEGRATION_CATEGORIES,
    PROVIDER_CATEGORIES,
    PROVIDER_DISPLAY_NAMES,
    PROVIDER_ICONS,
    get_provider_category,
    get_provider_display_name,
    get_provider_icon,
    is_valid_status,
)

from src.lib.integrations.calculations import (
    calculate_integration_health,
    calculate_status_counts,
    calculate_valid_rate,
    calculate_provider_coverage,
    IntegrationHealth,
    IntegrationSummary,
)

from src.lib.integrations.aggregations import (
    aggregate_integration_status,
    aggregate_by_category,
    aggregate_by_provider,
    aggregate_validation_history,
)

__all__ = [
    # Constants
    "INTEGRATION_STATUS",
    "INTEGRATION_CATEGORIES",
    "PROVIDER_CATEGORIES",
    "PROVIDER_DISPLAY_NAMES",
    "PROVIDER_ICONS",
    "get_provider_category",
    "get_provider_display_name",
    "get_provider_icon",
    "is_valid_status",
    # Calculations
    "calculate_integration_health",
    "calculate_status_counts",
    "calculate_valid_rate",
    "calculate_provider_coverage",
    "IntegrationHealth",
    "IntegrationSummary",
    # Aggregations
    "aggregate_integration_status",
    "aggregate_by_category",
    "aggregate_by_provider",
    "aggregate_validation_history",
]
