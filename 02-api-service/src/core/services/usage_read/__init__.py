"""
Usage Read Service

Read-only GenAI usage analytics service for dashboards.
Uses Polars + LRU Cache for high-performance aggregations.

Usage:
    from src.core.services.usage_read import get_usage_read_service, UsageQuery, DatePeriod

    service = get_usage_read_service()
    result = await service.get_usage_summary(UsageQuery(
        org_slug="my_org",
        period=DatePeriod.MTD  # or custom dates
    ))
"""

from src.core.services.usage_read.models import UsageQuery, UsageResponse
from src.core.services.usage_read.service import UsageReadService, get_usage_read_service
from src.core.services._shared.date_utils import DatePeriod

__all__ = [
    "UsageQuery",
    "UsageResponse",
    "UsageReadService",
    "get_usage_read_service",
    "DatePeriod",
]
