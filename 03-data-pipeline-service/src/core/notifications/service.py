"""
Notification Service

Simplified service that uses the unified provider registry.
Provides convenience methods for common notification patterns.
"""

import logging
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any

from .registry import (
    get_notification_registry,
    NotificationPayload,
)

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Notification service using the unified registry.

    Provides convenience methods for pipeline notifications.
    """

    def __init__(self, config_base_path: Optional[Path] = None):
        """Initialize notification service."""
        self._registry = get_notification_registry()

    async def notify(
        self,
        org_slug: str,
        title: str,
        message: str,
        severity: str = "info",
        pipeline_id: Optional[str] = None,
        pipeline_logging_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        channels: Optional[List[str]] = None,
        recipients: Optional[List[str]] = None,
    ) -> Dict[str, bool]:
        """
        Send notification using the unified registry.

        Args:
            org_slug: Organization slug
            title: Notification title
            message: Notification message
            severity: Notification severity (info, warning, error, critical)
            pipeline_id: Optional pipeline ID
            pipeline_logging_id: Optional pipeline logging ID
            details: Optional additional details
            channels: Channels to send to (default: ["email"])
            recipients: Email recipients (for email channel)

        Returns:
            Dict mapping channel name to success status
        """
        # Build unified payload
        data = details or {}
        if pipeline_id:
            data["pipeline_id"] = pipeline_id
        if pipeline_logging_id:
            data["pipeline_logging_id"] = pipeline_logging_id

        payload = NotificationPayload(
            title=title,
            message=message,
            severity=severity,
            org_slug=org_slug,
            recipients=recipients or [],
            data=data,
        )

        # Send via unified registry
        return await self._registry.send_to_channels(
            payload,
            channels or ["email"],
            org_slug=org_slug
        )

    async def notify_pipeline_started(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        recipients: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, bool]:
        """Convenience method for pipeline started event."""
        return await self.notify(
            org_slug=org_slug,
            title=f"Pipeline Started: {pipeline_id}",
            message=f"Pipeline {pipeline_id} has started execution",
            severity="info",
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            recipients=recipients,
            **kwargs
        )

    async def notify_pipeline_success(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        duration_ms: Optional[int] = None,
        recipients: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, bool]:
        """Convenience method for pipeline success event."""
        details = kwargs.pop("details", {}) or {}
        if duration_ms:
            details["duration_ms"] = duration_ms
            details["duration_readable"] = f"{duration_ms / 1000:.2f} seconds"

        return await self.notify(
            org_slug=org_slug,
            title=f"Pipeline Completed: {pipeline_id}",
            message=f"Pipeline {pipeline_id} completed successfully",
            severity="info",
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            details=details if details else None,
            recipients=recipients,
            **kwargs
        )

    async def notify_pipeline_failure(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        error_message: str,
        recipients: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, bool]:
        """Convenience method for pipeline failure event."""
        details = kwargs.pop("details", {}) or {}
        details["error"] = error_message

        return await self.notify(
            org_slug=org_slug,
            title=f"Pipeline Failed: {pipeline_id}",
            message=f"Pipeline {pipeline_id} failed with error: {error_message}",
            severity="error",
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            details=details,
            recipients=recipients,
            **kwargs
        )

    async def notify_data_quality_failure(
        self,
        org_slug: str,
        pipeline_id: str,
        table_name: str,
        failed_checks: List[str],
        recipients: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, bool]:
        """Convenience method for data quality failure event."""
        details = kwargs.pop("details", {}) or {}
        details["table"] = table_name
        details["failed_checks"] = ", ".join(failed_checks)
        details["check_count"] = len(failed_checks)

        return await self.notify(
            org_slug=org_slug,
            title=f"Data Quality Check Failed: {table_name}",
            message=f"Data quality checks failed for table {table_name}",
            severity="warning",
            pipeline_id=pipeline_id,
            details=details,
            recipients=recipients,
            **kwargs
        )

    def clear_cache(self, org_slug: Optional[str] = None):
        """Clear provider cache."""
        self._registry.clear_cache(org_slug)
        logger.info(f"Cleared notification cache{f' for org: {org_slug}' if org_slug else ''}")


# Thread-safe singleton
_notification_service: Optional[NotificationService] = None
_service_lock = threading.Lock()


def get_notification_service(
    config_base_path: Optional[Path] = None
) -> NotificationService:
    """Get global notification service instance."""
    global _notification_service

    if _notification_service is None:
        with _service_lock:
            if _notification_service is None:
                _notification_service = NotificationService(config_base_path)

    return _notification_service


def reset_notification_service():
    """Reset the global service (for testing)."""
    global _notification_service
    _notification_service = None
