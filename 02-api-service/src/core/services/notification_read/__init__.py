"""
Notification Read Service

Polars-powered read-only service for notification dashboard queries.
For CRUD operations, use notification_crud/ instead.
"""

from .service import NotificationReadService, get_notification_read_service
from .models import (
    NotificationQuery,
    NotificationStatsResponse,
    HistoryQueryParams,
)

__all__ = [
    "NotificationReadService",
    "get_notification_read_service",
    "NotificationQuery",
    "NotificationStatsResponse",
    "HistoryQueryParams",
]
