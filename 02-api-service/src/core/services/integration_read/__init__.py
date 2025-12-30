"""
Integration Read Service

Read-only integration status service for dashboards.
Uses Polars + LRU Cache for high-performance aggregations.

Usage:
    from src.core.services.integration_read import get_integration_read_service, IntegrationQuery

    service = get_integration_read_service()
    result = await service.get_integrations(IntegrationQuery(org_slug="my_org"))
"""

from src.core.services.integration_read.models import IntegrationQuery, IntegrationResponse
from src.core.services.integration_read.service import IntegrationReadService, get_integration_read_service

__all__ = [
    "IntegrationQuery",
    "IntegrationResponse",
    "IntegrationReadService",
    "get_integration_read_service",
]
