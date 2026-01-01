"""
Notification CRUD Service

Direct BigQuery operations for notification settings:
- Channels: create, update, delete
- Rules: create, update, delete
- Summaries: create, update, delete

For read operations (list, stats), use notification_read/ instead.
"""

from .models import (
    # Enums
    ChannelType,
    RuleCategory,
    RuleType,
    RulePriority,
    SummaryType,
    NotificationStatus,
    # Channel models
    NotificationChannel,
    NotificationChannelCreate,
    NotificationChannelUpdate,
    # Rule models
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
    RuleConditions,
    # Summary models
    NotificationSummary,
    NotificationSummaryCreate,
    NotificationSummaryUpdate,
    # History models
    NotificationHistoryEntry,
    # Stats
    NotificationStats,
)

from .service import (
    NotificationSettingsService,
    get_notification_settings_service,
)

__all__ = [
    # Enums
    "ChannelType",
    "RuleCategory",
    "RuleType",
    "RulePriority",
    "SummaryType",
    "NotificationStatus",
    # Channel models
    "NotificationChannel",
    "NotificationChannelCreate",
    "NotificationChannelUpdate",
    # Rule models
    "NotificationRule",
    "NotificationRuleCreate",
    "NotificationRuleUpdate",
    "RuleConditions",
    # Summary models
    "NotificationSummary",
    "NotificationSummaryCreate",
    "NotificationSummaryUpdate",
    # History models
    "NotificationHistoryEntry",
    # Stats
    "NotificationStats",
    # Service
    "NotificationSettingsService",
    "get_notification_settings_service",
]
