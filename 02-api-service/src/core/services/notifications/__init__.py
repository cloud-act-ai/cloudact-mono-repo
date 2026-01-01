"""
Notification Service Module

Manages notification channels, rules, summaries, and history.
Uses existing cost read service for data aggregation.
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
