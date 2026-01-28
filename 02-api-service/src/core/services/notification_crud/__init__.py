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
    # Scheduled Alerts (Unified)
    AlertType,
    SourceType,
    QueryTemplate,
    RecipientType,
    AlertSeverity,
    AlertCondition,
    RecipientConfig,
    SlackAlertConfig,
    ScheduledAlert,
    ScheduledAlertCreate,
    ScheduledAlertUpdate,
    AlertHistoryStatus,
    AlertHistoryEntry,
    # Cost Alert Frontend Models
    CostAlertScope,
    CostAlertSummary,
    CostAlertCreateRequest,
    CostAlertUpdateRequest,
    SCOPE_TO_QUERY_TEMPLATE,
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
    # Scheduled Alerts (Unified)
    "AlertType",
    "SourceType",
    "QueryTemplate",
    "RecipientType",
    "AlertSeverity",
    "AlertCondition",
    "RecipientConfig",
    "SlackAlertConfig",
    "ScheduledAlert",
    "ScheduledAlertCreate",
    "ScheduledAlertUpdate",
    "AlertHistoryStatus",
    "AlertHistoryEntry",
    # Cost Alert Frontend Models
    "CostAlertScope",
    "CostAlertSummary",
    "CostAlertCreateRequest",
    "CostAlertUpdateRequest",
    "SCOPE_TO_QUERY_TEMPLATE",
    # Service
    "NotificationSettingsService",
    "get_notification_settings_service",
]
