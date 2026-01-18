"""
Notification System

Multi-provider notification system with org-specific configuration support.
Includes unified registry pattern for multi-tenant isolation.

## Recommended Usage (New Pattern)

Use the unified registry for multi-tenant aware notifications:

    from core.notifications import (
        get_notification_registry,
        ProviderType,
        NotificationPayload,
        send_notification,
    )

    # Option 1: Use registry directly with org isolation
    registry = get_notification_registry()
    provider = registry.get_provider(ProviderType.EMAIL, org_slug="acme_corp")
    payload = NotificationPayload(
        title="Cost Alert",
        message="Your costs exceeded threshold",
        org_slug="acme_corp",
        recipients=["admin@acme.com"],
    )
    await provider.send(payload)

    # Option 2: Use convenience function
    results = await send_notification(payload, channels=["email", "slack"])

    # Option 3: Use AlertNotificationSender for alerts
    from core.notifications import get_alert_sender
    sender = get_alert_sender()
    await sender.send_cost_alert(
        alert_id="cost_threshold_20",
        alert_name="Cost Threshold Alert",
        org_slug="acme_corp",
        severity="warning",
        total_cost=25.50,
        threshold=20.0,
        recipients=["admin@acme.com"],
        channels=["email", "slack"],
    )

## Legacy Usage (Deprecated)

The following pattern is deprecated but still available:

    from core.notifications import (
        get_notification_service,
        NotificationEvent,
        NotificationSeverity
    )

    # Get service instance
    service = get_notification_service()

    # Send notification
    await service.notify(
        org_slug="acme_corp",
        event=NotificationEvent.PIPELINE_FAILURE,
        severity=NotificationSeverity.ERROR,
        title="Pipeline Failed",
        message="Pipeline execution failed with error",
        pipeline_id="daily_ingestion",
        pipeline_logging_id="abc123"
    )

## Configuration

Root configuration: ./configs/notifications/config.json
Org configuration: ./configs/{org_slug}/notifications.json
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

# New unified provider registry
from .registry import (
    NotificationProviderRegistry,
    get_notification_registry,
    ProviderType,
    NotificationPayload,
    EmailProviderConfig,
    SlackProviderConfig,
    WebhookProviderConfig,
)

from .adapters import (
    EmailNotificationAdapter,
    SlackNotificationAdapter,
    WebhookNotificationAdapter,
    send_notification,
)

from .alert_sender import (
    AlertNotificationSender,
    AlertNotificationData,
    get_alert_sender,
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

    # Unified Registry (new)
    "NotificationProviderRegistry",
    "get_notification_registry",
    "ProviderType",
    "NotificationPayload",
    "EmailProviderConfig",
    "SlackProviderConfig",
    "WebhookProviderConfig",

    # Adapters (new)
    "EmailNotificationAdapter",
    "SlackNotificationAdapter",
    "WebhookNotificationAdapter",
    "send_notification",

    # Alert Sender (new)
    "AlertNotificationSender",
    "AlertNotificationData",
    "get_alert_sender",
]
