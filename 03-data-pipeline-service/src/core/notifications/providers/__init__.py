"""
Notification Providers

Re-exports unified adapters from the main notifications package.

Usage:
    from core.notifications import (
        get_notification_registry,
        ProviderType,
        NotificationPayload,
    )

    # Get provider with org isolation
    registry = get_notification_registry()
    provider = registry.get_provider(ProviderType.EMAIL, org_slug="my_org")
    await provider.send(payload)
"""

from ..adapters import (
    EmailNotificationAdapter,
    SlackNotificationAdapter,
    WebhookNotificationAdapter,
)

__all__ = [
    "EmailNotificationAdapter",
    "SlackNotificationAdapter",
    "WebhookNotificationAdapter",
]
