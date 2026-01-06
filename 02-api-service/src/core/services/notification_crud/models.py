"""
Notification Models

Pydantic models for notification channels, rules, summaries, and history.
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
import json
import re

# VAL-002 FIX: Email validation regex
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# VAL-004 FIX: URL validation regex
URL_REGEX = re.compile(r'^https?://[^\s/$.?#].[^\s]*$', re.IGNORECASE)

# VAL-005 FIX: Time format validation regex (HH:MM)
TIME_REGEX = re.compile(r'^([01]?[0-9]|2[0-3]):[0-5][0-9]$')

# VAL-003 FIX: Slack channel validation regex
SLACK_CHANNEL_REGEX = re.compile(r'^[#@]?[a-zA-Z0-9_-]+$')


# ==============================================================================
# Enums
# ==============================================================================

class ChannelType(str, Enum):
    """Notification channel types"""
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"


class RuleCategory(str, Enum):
    """Rule categories"""
    COST = "cost"
    PIPELINE = "pipeline"
    INTEGRATION = "integration"
    SUBSCRIPTION = "subscription"
    SYSTEM = "system"


class RuleType(str, Enum):
    """Rule types within categories"""
    # Cost rules
    BUDGET_PERCENT = "budget_percent"
    BUDGET_FORECAST = "budget_forecast"
    ABSOLUTE_THRESHOLD = "absolute_threshold"
    ANOMALY_PERCENT_CHANGE = "anomaly_percent_change"
    ANOMALY_STD_DEVIATION = "anomaly_std_deviation"
    HIERARCHY_BUDGET = "hierarchy_budget"
    # Pipeline rules
    PIPELINE_FAILURE = "pipeline_failure"
    PIPELINE_SUCCESS = "pipeline_success"
    DATA_FRESHNESS = "data_freshness"
    # Integration rules
    INTEGRATION_HEALTH = "integration_health"
    CREDENTIAL_EXPIRY = "credential_expiry"
    # Subscription rules
    SUBSCRIPTION_RENEWAL = "subscription_renewal"
    LICENSE_UTILIZATION = "license_utilization"


class RulePriority(str, Enum):
    """Rule priority levels"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class SummaryType(str, Enum):
    """Summary schedule types"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class NotificationStatus(str, Enum):
    """Notification delivery status"""
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    SKIPPED = "skipped"


# ==============================================================================
# Channel Models
# ==============================================================================

class NotificationChannelBase(BaseModel):
    """Base notification channel model"""
    name: str = Field(..., min_length=1, max_length=100, description="Channel name")
    channel_type: ChannelType = Field(..., description="Channel type")
    is_default: bool = Field(default=False, description="Default channel for org")
    is_active: bool = Field(default=True, description="Channel is active")

    # Email settings
    email_recipients: Optional[List[str]] = Field(default=None, description="Email recipients")
    email_cc_recipients: Optional[List[str]] = Field(default=None, description="Email CC recipients")
    email_subject_prefix: Optional[str] = Field(default=None, description="Email subject prefix")

    # Slack settings
    slack_webhook_url: Optional[str] = Field(default=None, description="Slack webhook URL")
    slack_channel: Optional[str] = Field(default=None, description="Slack channel")
    slack_mention_users: Optional[List[str]] = Field(default=None, description="Slack users to mention")
    slack_mention_channel: bool = Field(default=False, description="Mention @channel on critical")

    # Webhook settings
    webhook_url: Optional[str] = Field(default=None, description="Webhook URL")
    webhook_headers: Optional[Dict[str, str]] = Field(default=None, description="Webhook headers")
    webhook_method: Optional[str] = Field(default="POST", description="HTTP method")

    # VAL-002 FIX: Validate email addresses
    @field_validator("email_recipients", "email_cc_recipients", mode="before")
    @classmethod
    def validate_emails(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Validate email addresses in recipient lists."""
        if v is None:
            return None
        validated = []
        for email in v:
            if email and EMAIL_REGEX.match(email.strip()):
                validated.append(email.strip().lower())
            elif email:
                raise ValueError(f"Invalid email address: {email}")
        return validated if validated else None

    # VAL-003 FIX: Validate Slack channel name
    @field_validator("slack_channel", mode="before")
    @classmethod
    def validate_slack_channel(cls, v: Optional[str]) -> Optional[str]:
        """Validate Slack channel name format."""
        if v is None:
            return None
        v = v.strip()
        if not SLACK_CHANNEL_REGEX.match(v):
            raise ValueError(f"Invalid Slack channel format: {v}. Must start with # or be a valid channel ID")
        return v

    # VAL-004 FIX: Validate webhook URLs
    @field_validator("slack_webhook_url", "webhook_url", mode="before")
    @classmethod
    def validate_urls(cls, v: Optional[str]) -> Optional[str]:
        """Validate URL format for webhooks."""
        if v is None:
            return None
        v = v.strip()
        if not URL_REGEX.match(v):
            raise ValueError(f"Invalid URL format: {v}. Must be a valid HTTP/HTTPS URL")
        return v


class NotificationChannelCreate(NotificationChannelBase):
    """Create notification channel request"""
    pass


class NotificationChannelUpdate(BaseModel):
    """Update notification channel request"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    email_recipients: Optional[List[str]] = None
    email_cc_recipients: Optional[List[str]] = None
    email_subject_prefix: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    slack_channel: Optional[str] = None
    slack_mention_users: Optional[List[str]] = None
    slack_mention_channel: Optional[bool] = None
    webhook_url: Optional[str] = None
    webhook_headers: Optional[Dict[str, str]] = None
    webhook_method: Optional[str] = None


class NotificationChannel(NotificationChannelBase):
    """Full notification channel model"""
    channel_id: str = Field(..., description="Unique channel ID")
    org_slug: str = Field(..., description="Organization slug")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp")
    created_by: Optional[str] = Field(default=None, description="Creator user ID")

    # Don't expose sensitive fields in response
    slack_webhook_url: Optional[str] = Field(default=None, exclude=True)
    webhook_url: Optional[str] = Field(default=None, exclude=True)
    webhook_headers: Optional[Dict[str, str]] = Field(default=None, exclude=True)

    # Computed fields for display
    slack_webhook_configured: Optional[bool] = Field(default=None, description="Whether Slack webhook is configured")
    webhook_configured: Optional[bool] = Field(default=None, description="Whether webhook is configured")

    class Config:
        from_attributes = True


# ==============================================================================
# Rule Condition Models
# ==============================================================================

class RuleConditions(BaseModel):
    """Flexible rule conditions"""
    # Budget rules
    budget_amount: Optional[float] = Field(default=None, description="Budget amount")
    budget_period: Optional[str] = Field(default=None, description="monthly, quarterly, annual")
    threshold_percent: Optional[float] = Field(default=None, description="Threshold percentage (0-100)")
    forecast_threshold_percent: Optional[float] = Field(default=None, description="Forecast threshold %")

    # Absolute threshold
    period: Optional[str] = Field(default=None, description="daily, weekly, monthly")
    threshold_amount: Optional[float] = Field(default=None, description="Absolute $ threshold")

    # Anomaly detection
    comparison: Optional[str] = Field(default=None, description="dod, wow, mom")
    min_absolute_change: Optional[float] = Field(default=None, description="Min $ change to alert")
    lookback_days: Optional[int] = Field(default=None, description="Days to look back for std dev")
    std_dev_threshold: Optional[float] = Field(default=None, description="Std deviation threshold")

    # Hierarchy
    hierarchy_level: Optional[str] = Field(default=None, description="department, project, team")

    # Pipeline
    pipeline_patterns: Optional[List[str]] = Field(default=None, description="Pipeline patterns to match")
    consecutive_failures: Optional[int] = Field(default=None, description="N consecutive failures")

    # Data freshness
    max_hours_since_update: Optional[int] = Field(default=None, description="Max hours since data update")
    tables: Optional[List[str]] = Field(default=None, description="Tables to monitor")

    # Integration
    check_type: Optional[str] = Field(default=None, description="connection, credential_expiry, rate_limit")
    expiry_warning_days: Optional[int] = Field(default=None, description="Days before expiry to warn")

    # Subscription
    days_before_renewal: Optional[List[int]] = Field(default=None, description="Days before renewal to alert")
    utilization_threshold_percent: Optional[float] = Field(default=None, description="Utilization % threshold")

    def to_json(self) -> str:
        """Convert to JSON string for storage"""
        return json.dumps(self.model_dump(exclude_none=True))

    @classmethod
    def from_json(cls, json_str: str) -> "RuleConditions":
        """Create from JSON string"""
        return cls(**json.loads(json_str))


# ==============================================================================
# Rule Models
# ==============================================================================

class NotificationRuleBase(BaseModel):
    """Base notification rule model"""
    name: str = Field(..., min_length=1, max_length=100, description="Rule name")
    description: Optional[str] = Field(default=None, max_length=500, description="Rule description")
    is_active: bool = Field(default=True, description="Rule is active")
    priority: RulePriority = Field(default=RulePriority.MEDIUM, description="Priority level")

    rule_category: RuleCategory = Field(..., description="Rule category")
    rule_type: RuleType = Field(..., description="Rule type")
    conditions: RuleConditions = Field(..., description="Rule conditions")

    # Filters
    provider_filter: Optional[List[str]] = Field(default=None, description="Filter by providers")
    service_filter: Optional[List[str]] = Field(default=None, description="Filter by services")
    hierarchy_entity_id: Optional[str] = Field(default=None, description="N-level hierarchy entity ID")
    hierarchy_path: Optional[str] = Field(default=None, description="Materialized path for hierarchy filtering")

    # Delivery
    notify_channel_ids: List[str] = Field(..., min_length=1, description="Channels to notify")
    escalate_after_mins: Optional[int] = Field(default=None, ge=1, description="Escalation delay")
    escalate_to_channel_ids: Optional[List[str]] = Field(default=None, description="Escalation channels")

    # Throttling
    cooldown_minutes: Optional[int] = Field(default=60, ge=1, description="Cooldown between alerts")
    batch_window_minutes: Optional[int] = Field(default=None, ge=1, description="Batch window")
    quiet_hours_start: Optional[str] = Field(default=None, description="Quiet hours start (HH:MM)")
    quiet_hours_end: Optional[str] = Field(default=None, description="Quiet hours end (HH:MM)")
    quiet_hours_timezone: Optional[str] = Field(default=None, description="Quiet hours timezone")

    # VAL-005 FIX: Validate quiet hours time format
    @field_validator("quiet_hours_start", "quiet_hours_end", mode="before")
    @classmethod
    def validate_quiet_hours(cls, v: Optional[str]) -> Optional[str]:
        """Validate HH:MM time format for quiet hours."""
        if v is None:
            return None
        v = v.strip()
        if not TIME_REGEX.match(v):
            raise ValueError(f"Invalid time format: {v}. Must be HH:MM (e.g., '22:00')")
        return v


class NotificationRuleCreate(NotificationRuleBase):
    """Create notification rule request"""
    pass


class NotificationRuleUpdate(BaseModel):
    """Update notification rule request"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None
    priority: Optional[RulePriority] = None
    conditions: Optional[RuleConditions] = None
    provider_filter: Optional[List[str]] = None
    service_filter: Optional[List[str]] = None
    hierarchy_entity_id: Optional[str] = None
    hierarchy_path: Optional[str] = None
    notify_channel_ids: Optional[List[str]] = None
    escalate_after_mins: Optional[int] = None
    escalate_to_channel_ids: Optional[List[str]] = None
    cooldown_minutes: Optional[int] = None
    batch_window_minutes: Optional[int] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    quiet_hours_timezone: Optional[str] = None


class NotificationRule(NotificationRuleBase):
    """Full notification rule model"""
    rule_id: str = Field(..., description="Unique rule ID")
    org_slug: str = Field(..., description="Organization slug")
    last_triggered_at: Optional[datetime] = Field(default=None, description="Last trigger time")
    trigger_count_today: int = Field(default=0, description="Triggers today")
    acknowledged_at: Optional[datetime] = Field(default=None, description="Acknowledgment time")
    acknowledged_by: Optional[str] = Field(default=None, description="Acknowledger user ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp")
    created_by: Optional[str] = Field(default=None, description="Creator user ID")

    class Config:
        from_attributes = True


# ==============================================================================
# Summary Models
# ==============================================================================

class NotificationSummaryBase(BaseModel):
    """Base notification summary model"""
    name: str = Field(..., min_length=1, max_length=100, description="Summary name")
    summary_type: SummaryType = Field(..., description="Summary type")
    is_active: bool = Field(default=True, description="Summary is active")

    schedule_cron: str = Field(..., description="Cron expression")
    schedule_timezone: str = Field(default="UTC", description="Schedule timezone")

    notify_channel_ids: List[str] = Field(..., min_length=1, description="Channels to notify")

    include_sections: List[str] = Field(
        default=["total_cost", "wow_comparison", "top_providers", "top_services", "budget_status"],
        description="Sections to include"
    )
    top_n_items: int = Field(default=5, ge=1, le=20, description="Top N items to show")
    currency_display: Optional[str] = Field(default=None, description="Currency override")

    provider_filter: Optional[List[str]] = Field(default=None, description="Filter by providers")
    hierarchy_filter: Optional[Dict[str, str]] = Field(default=None, description="Hierarchy filter")

    @field_validator("schedule_cron")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        """
        VAL-001 FIX: Comprehensive cron validation with range checks.
        Format: minute(0-59) hour(0-23) day(1-31) month(1-12) weekday(0-6)
        """
        parts = v.split()
        if len(parts) != 5:
            raise ValueError("Cron expression must have 5 parts: minute hour day month weekday")

        # Define valid ranges for each field
        ranges = [
            (0, 59, "minute"),   # minute
            (0, 23, "hour"),     # hour
            (1, 31, "day"),      # day of month
            (1, 12, "month"),    # month
            (0, 6, "weekday"),   # day of week (0=Sunday)
        ]

        for i, part in enumerate(parts):
            min_val, max_val, field_name = ranges[i]
            # Handle wildcards and special characters
            if part == "*":
                continue
            # Handle step values like */5
            if part.startswith("*/"):
                try:
                    step = int(part[2:])
                    if step < 1 or step > max_val:
                        raise ValueError(f"Invalid step value for {field_name}: {step}")
                except ValueError:
                    raise ValueError(f"Invalid step format for {field_name}: {part}")
                continue
            # Handle ranges like 1-5
            if "-" in part:
                try:
                    start, end = map(int, part.split("-"))
                    if start < min_val or end > max_val or start > end:
                        raise ValueError(f"Invalid range for {field_name}: {part}")
                except ValueError:
                    raise ValueError(f"Invalid range format for {field_name}: {part}")
                continue
            # Handle lists like 1,3,5
            if "," in part:
                try:
                    values = [int(x) for x in part.split(",")]
                    for val in values:
                        if val < min_val or val > max_val:
                            raise ValueError(f"Value {val} out of range for {field_name}")
                except ValueError:
                    raise ValueError(f"Invalid list format for {field_name}: {part}")
                continue
            # Handle single values
            try:
                val = int(part)
                if val < min_val or val > max_val:
                    raise ValueError(f"Value {val} out of range for {field_name} (must be {min_val}-{max_val})")
            except ValueError:
                raise ValueError(f"Invalid value for {field_name}: {part}")

        return v


class NotificationSummaryCreate(NotificationSummaryBase):
    """Create notification summary request"""
    pass


class NotificationSummaryUpdate(BaseModel):
    """Update notification summary request"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    is_active: Optional[bool] = None
    schedule_cron: Optional[str] = None
    schedule_timezone: Optional[str] = None
    notify_channel_ids: Optional[List[str]] = None
    include_sections: Optional[List[str]] = None
    top_n_items: Optional[int] = Field(default=None, ge=1, le=20)
    currency_display: Optional[str] = None
    provider_filter: Optional[List[str]] = None
    hierarchy_filter: Optional[Dict[str, str]] = None


class NotificationSummary(NotificationSummaryBase):
    """Full notification summary model"""
    summary_id: str = Field(..., description="Unique summary ID")
    org_slug: str = Field(..., description="Organization slug")
    last_sent_at: Optional[datetime] = Field(default=None, description="Last send time")
    next_scheduled_at: Optional[datetime] = Field(default=None, description="Next scheduled time")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp")
    created_by: Optional[str] = Field(default=None, description="Creator user ID")

    class Config:
        from_attributes = True


# ==============================================================================
# History Models
# ==============================================================================

class NotificationHistoryEntry(BaseModel):
    """Notification history entry"""
    notification_id: str = Field(..., description="Unique notification ID")
    org_slug: str = Field(..., description="Organization slug")
    rule_id: Optional[str] = Field(default=None, description="Rule ID if alert")
    summary_id: Optional[str] = Field(default=None, description="Summary ID if summary")
    channel_id: str = Field(..., description="Channel used")
    notification_type: str = Field(..., description="alert, summary, system")
    priority: Optional[str] = Field(default=None, description="Priority level")
    subject: str = Field(..., description="Notification subject")
    body_preview: Optional[str] = Field(default=None, description="Body preview")
    status: NotificationStatus = Field(..., description="Delivery status")
    sent_at: Optional[datetime] = Field(default=None, description="Send time")
    delivered_at: Optional[datetime] = Field(default=None, description="Delivery confirmation time")
    error_message: Optional[str] = Field(default=None, description="Error message if failed")
    retry_count: int = Field(default=0, description="Retry count")
    trigger_data: Optional[Dict[str, Any]] = Field(default=None, description="Trigger data snapshot")
    recipients: List[str] = Field(default=[], description="Recipients list")
    acknowledged_at: Optional[datetime] = Field(default=None, description="Acknowledgment time")
    acknowledged_by: Optional[str] = Field(default=None, description="Acknowledger")
    escalated: bool = Field(default=False, description="Was escalated")
    escalated_at: Optional[datetime] = Field(default=None, description="Escalation time")
    created_at: datetime = Field(..., description="Creation timestamp")

    class Config:
        from_attributes = True


# ==============================================================================
# Stats Models
# ==============================================================================

class NotificationStats(BaseModel):
    """Notification statistics"""
    total_channels: int = Field(default=0, description="Total channels")
    active_channels: int = Field(default=0, description="Active channels")
    total_rules: int = Field(default=0, description="Total rules")
    active_rules: int = Field(default=0, description="Active rules")
    total_summaries: int = Field(default=0, description="Total summaries")
    active_summaries: int = Field(default=0, description="Active summaries")
    notifications_24h: int = Field(default=0, description="Notifications in last 24h")
    alerts_24h: int = Field(default=0, description="Alerts in last 24h")
    delivery_rate: float = Field(default=0.0, description="Delivery success rate (0-1)")
    pending_acknowledgments: int = Field(default=0, description="Pending acknowledgments")
