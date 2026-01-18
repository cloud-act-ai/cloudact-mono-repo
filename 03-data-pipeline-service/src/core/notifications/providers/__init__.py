"""
Notification Providers Package

DEPRECATION NOTICE:
These legacy providers are being replaced by the unified registry pattern.

For new code, please use:

    from core.notifications import (
        get_notification_registry,
        ProviderType,
        NotificationPayload,
    )

    # Get provider with org isolation
    registry = get_notification_registry()
    provider = registry.get_provider(ProviderType.EMAIL, org_slug="my_org")
    await provider.send(payload)

    # Or use the convenience function
    from core.notifications import send_notification
    await send_notification(payload, channels=["email", "slack"])

These legacy providers remain available for backwards compatibility but will
be removed in a future version.
"""

import warnings
from functools import wraps

from .email import EmailNotificationProvider
from .slack import SlackNotificationProvider


def _deprecated_class(cls, message):
    """Decorator to mark a class as deprecated."""
    original_init = cls.__init__

    @wraps(original_init)
    def new_init(self, *args, **kwargs):
        warnings.warn(
            f"{cls.__name__} is deprecated. {message}",
            DeprecationWarning,
            stacklevel=2
        )
        return original_init(self, *args, **kwargs)

    cls.__init__ = new_init
    return cls


# Apply deprecation warnings to legacy providers
EmailNotificationProvider = _deprecated_class(
    EmailNotificationProvider,
    "Use get_notification_registry().get_provider(ProviderType.EMAIL) instead."
)
SlackNotificationProvider = _deprecated_class(
    SlackNotificationProvider,
    "Use get_notification_registry().get_provider(ProviderType.SLACK) instead."
)


__all__ = [
    "EmailNotificationProvider",
    "SlackNotificationProvider",
]
