"""
Notification System

Enterprise-grade multi-tenant notification system with:
- Unified provider registry pattern
- Org-specific configuration isolation
- Extensible provider architecture (Email, Slack, Webhook)

## Usage

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

## Architecture

    ┌─────────────────────────────────────────────────────────────┐
    │              NotificationProviderRegistry                   │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
    │  │  Email      │  │  Slack      │  │ Webhook     │         │
    │  │ Adapter     │  │ Adapter     │  │ Adapter     │         │
    │  └─────────────┘  └─────────────┘  └─────────────┘         │
    └─────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────────────────────────────────────────┐
    │                  AlertNotificationSender                    │
    │   send_cost_alert()  send_quota_alert()  send_anomaly()    │
    └─────────────────────────────────────────────────────────────┘

## Configuration

- Global config: Environment variables (EMAIL_*, SLACK_*)
- Org config: Set via registry.set_config(provider_type, config, org_slug)
"""

# ==============================================================================
# Core Unified System
# ==============================================================================

# Provider Registry - Central provider management
from .registry import (
    NotificationProviderRegistry,
    get_notification_registry,
    reset_registry,
    ProviderType,
    NotificationPayload,
    NotificationProviderInterface,
    # Provider Configs
    BaseProviderConfig,
    EmailProviderConfig,
    SlackProviderConfig,
    WebhookProviderConfig,
)

# Provider Adapters - Provider implementations
from .adapters import (
    EmailNotificationAdapter,
    SlackNotificationAdapter,
    WebhookNotificationAdapter,
    send_notification,
)

# Alert Sender - High-level alert helpers
from .alert_sender import (
    AlertNotificationSender,
    AlertNotificationData,
    get_alert_sender,
    reset_alert_sender,
)

# Notification Service - Convenience wrapper
from .service import (
    NotificationService,
    get_notification_service,
    reset_notification_service,
)

# Exception Classes
from .base import (
    NotificationError,
    NotificationTimeoutError,
    NotificationProviderError,
)

# ==============================================================================
# Public API
# ==============================================================================

__all__ = [
    # Core Registry
    "NotificationProviderRegistry",
    "get_notification_registry",
    "reset_registry",
    "ProviderType",
    "NotificationPayload",
    "NotificationProviderInterface",

    # Provider Configs
    "BaseProviderConfig",
    "EmailProviderConfig",
    "SlackProviderConfig",
    "WebhookProviderConfig",

    # Provider Adapters
    "EmailNotificationAdapter",
    "SlackNotificationAdapter",
    "WebhookNotificationAdapter",
    "send_notification",

    # Alert Sender
    "AlertNotificationSender",
    "AlertNotificationData",
    "get_alert_sender",
    "reset_alert_sender",

    # Notification Service
    "NotificationService",
    "get_notification_service",
    "reset_notification_service",

    # Exceptions
    "NotificationError",
    "NotificationTimeoutError",
    "NotificationProviderError",
]
