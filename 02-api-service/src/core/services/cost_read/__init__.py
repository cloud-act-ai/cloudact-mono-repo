"""
Cost Read Service

Read-only cost analytics service for dashboards.
Uses Polars + LRU Cache + lib/costs/ for high-performance aggregations.

Features:
- All methods accept CostQuery with resolve_dates()
- Aggregations via lib/costs/ (aggregate_by_provider, aggregate_by_hierarchy, etc.)
- Forecasting via lib/costs/calculate_forecasts()
- Period comparisons via _shared/date_utils (get_comparison_ranges)

Usage:
    from src.core.services.cost_read import (
        get_cost_read_service,
        CostQuery,
        DatePeriod,
        ComparisonType,
    )

    service = get_cost_read_service()

    # Basic cost query
    result = await service.get_costs(CostQuery(
        org_slug="my_org",
        period=DatePeriod.MTD  # or custom dates
    ))

    # Forecasting
    forecast = await service.get_cost_forecast(CostQuery(org_slug="my_org"))

    # Hierarchy rollup
    hierarchy = await service.get_hierarchy_rollup(CostQuery(org_slug="my_org"))

    # Period comparison
    comparison = await service.get_cost_comparison(
        CostQuery(org_slug="my_org"),
        comparison_type=ComparisonType.MONTH_OVER_MONTH
    )
"""

from src.core.services.cost_read.models import CostQuery, CostResponse, CostSummary
from src.core.services.cost_read.service import CostReadService, get_cost_read_service
from src.core.services._shared.date_utils import DatePeriod, ComparisonType

__all__ = [
    "CostQuery",
    "CostResponse",
    "CostSummary",
    "CostReadService",
    "get_cost_read_service",
    "DatePeriod",
    "ComparisonType",
]
