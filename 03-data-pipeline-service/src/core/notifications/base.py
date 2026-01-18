"""
Notification Exception Classes

Defines exception types for notification errors.
"""


class NotificationError(Exception):
    """Base exception for notification errors"""
    pass


class NotificationTimeoutError(NotificationError):
    """Raised when notification times out"""
    pass


class NotificationProviderError(NotificationError):
    """Raised when provider-specific error occurs"""
    pass
