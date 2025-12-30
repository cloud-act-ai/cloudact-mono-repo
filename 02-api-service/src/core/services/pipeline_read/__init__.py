"""
Pipeline Read Service

Read-only pipeline execution history service for dashboards.
Uses Polars + LRU Cache for high-performance aggregations.

Usage:
    from src.core.services.pipeline_read import get_pipeline_read_service, PipelineQuery, DatePeriod

    service = get_pipeline_read_service()
    result = await service.get_run_summary(PipelineQuery(
        org_slug="my_org",
        period=DatePeriod.LAST_7_DAYS  # or custom dates
    ))
"""

from src.core.services.pipeline_read.models import PipelineQuery, PipelineResponse
from src.core.services.pipeline_read.service import PipelineReadService, get_pipeline_read_service
from src.core.services._shared.date_utils import DatePeriod

__all__ = [
    "PipelineQuery",
    "PipelineResponse",
    "PipelineReadService",
    "get_pipeline_read_service",
    "DatePeriod",
]
