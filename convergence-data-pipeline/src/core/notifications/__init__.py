"""
Notification System

Multi-provider notification system with tenant-specific configuration support.

Features:
- Email notifications (SMTP)
- Slack notifications (Webhooks)
- Tenant-specific configuration with root fallback
- Event-based notification triggers
- Retry logic with exponential backoff
- Cooldown periods to prevent notification spam

Usage:
    from core.notifications import (
        get_notification_service,
        NotificationEvent,
        NotificationSeverity
    )

    # Get service instance
    service = get_notification_service()

    # Send notification
    await service.notify(
        tenant_id="acme_corp",
        event=NotificationEvent.PIPELINE_FAILURE,
        severity=NotificationSeverity.ERROR,
        title="Pipeline Failed",
        message="Pipeline execution failed with error",
        pipeline_id="daily_ingestion",
        pipeline_logging_id="abc123"
    )

    # Or use convenience methods
    await service.notify_pipeline_failure(
        tenant_id="acme_corp",
        pipeline_id="daily_ingestion",
        pipeline_logging_id="abc123",
        error_message="Connection timeout"
    )

Configuration:
    Root configuration: ./configs/notifications/config.json
    Tenant configuration: ./configs/{tenant_id}/notifications.json
"""

from .config import (
    NotificationConfig,
    NotificationMessage,
    NotificationProvider,
    NotificationEvent,
    NotificationSeverity,
    EmailConfig,
    SlackConfig,
    EventTriggerConfig,
    NotificationRetryConfig
)

from .service import (
    NotificationService,
    get_notification_service
)

from .base import (
    BaseNotificationProvider,
    NotificationError,
    NotificationTimeoutError,
    NotificationProviderError
)

from .providers import (
    EmailNotificationProvider,
    SlackNotificationProvider
)

__all__ = [
    # Configuration models
    "NotificationConfig",
    "NotificationMessage",
    "NotificationProvider",
    "NotificationEvent",
    "NotificationSeverity",
    "EmailConfig",
    "SlackConfig",
    "EventTriggerConfig",
    "NotificationRetryConfig",

    # Service
    "NotificationService",
    "get_notification_service",

    # Base classes
    "BaseNotificationProvider",
    "NotificationError",
    "NotificationTimeoutError",
    "NotificationProviderError",

    # Providers
    "EmailNotificationProvider",
    "SlackNotificationProvider",
]
