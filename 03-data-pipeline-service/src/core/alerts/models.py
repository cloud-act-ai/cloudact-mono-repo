"""
Alert Framework Models

Pydantic models for alert configuration, results, and history.
"""

from enum import Enum
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class AlertStatus(str, Enum):
    """Alert evaluation status."""
    TRIGGERED = "triggered"
    COOLDOWN = "cooldown"
    NO_MATCH = "no_match"
    NO_DATA = "no_data"
    NO_RECIPIENTS = "no_recipients"
    SEND_FAILED = "send_failed"
    ERROR = "error"


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class RecipientType(str, Enum):
    """Recipient resolution types."""
    ORG_OWNERS = "org_owners"
    HIERARCHY_NODE = "hierarchy_node"
    ALL_MEMBERS = "all_members"
    CUSTOM = "custom"


class ConditionOperator(str, Enum):
    """Supported condition operators."""
    GT = "gt"
    LT = "lt"
    EQ = "eq"
    GTE = "gte"
    LTE = "lte"
    NE = "ne"
    BETWEEN = "between"
    CONTAINS = "contains"
    IN = "in"


# ============================================
# Configuration Models
# ============================================

class ScheduleConfig(BaseModel):
    """Alert schedule configuration."""
    cron: str = Field(..., description="Cron expression (e.g., '0 8 * * *')")
    timezone: str = Field(default="UTC", description="Timezone for schedule")


class SourceConfig(BaseModel):
    """Alert data source configuration."""
    type: str = Field(default="bigquery", description="Source type")
    query_template: str = Field(..., description="Query template name")
    params: Dict[str, Any] = Field(default_factory=dict, description="Query parameters")


class ConditionConfig(BaseModel):
    """Alert condition configuration."""
    field: str = Field(..., description="Field to evaluate")
    operator: str = Field(..., description="Comparison operator (gt, lt, eq, gte, lte, between)")
    value: Union[int, float, str, List[Any]] = Field(..., description="Threshold value")
    unit: Optional[str] = Field(default=None, description="Value unit (USD, percent, etc.)")


class RecipientConfig(BaseModel):
    """Alert recipient configuration."""
    type: str = Field(default="org_owners", description="Recipient type")
    node_code: Optional[str] = Field(default=None, description="Hierarchy node code for hierarchy_node type")
    include_children: bool = Field(default=False, description="Include child nodes for hierarchy")
    emails: Optional[List[str]] = Field(default=None, description="Custom email list for custom type")


class SlackChannelConfig(BaseModel):
    """Slack channel configuration for alerts."""
    webhook_url: Optional[str] = Field(default=None, description="Slack webhook URL (uses env if not set)")
    channel: Optional[str] = Field(default=None, description="Override Slack channel")
    mention_channel: bool = Field(default=False, description="Mention @channel on critical")
    mention_users: Optional[List[str]] = Field(default=None, description="User IDs to mention")


class NotificationConfig(BaseModel):
    """Alert notification configuration."""
    template: str = Field(..., description="Email template name")
    severity: AlertSeverity = Field(default=AlertSeverity.WARNING, description="Alert severity")
    channels: List[str] = Field(default=["email"], description="Notification channels (email, slack)")
    slack: Optional[SlackChannelConfig] = Field(default=None, description="Slack-specific configuration")


class CooldownConfig(BaseModel):
    """Alert cooldown configuration."""
    enabled: bool = Field(default=True, description="Enable cooldown")
    hours: int = Field(default=24, description="Cooldown hours")
    scope: str = Field(default="org", description="Cooldown scope (org, alert, global)")


class AlertConfig(BaseModel):
    """Complete alert configuration from YAML."""
    id: str = Field(..., description="Unique alert ID")
    name: str = Field(..., description="Alert name")
    description: Optional[str] = Field(default=None, description="Alert description")
    enabled: bool = Field(default=True, description="Alert enabled")

    schedule: ScheduleConfig = Field(..., description="Schedule configuration")
    source: SourceConfig = Field(..., description="Data source configuration")
    conditions: List[ConditionConfig] = Field(..., description="Evaluation conditions")
    recipients: RecipientConfig = Field(..., description="Recipient configuration")
    notification: NotificationConfig = Field(..., description="Notification configuration")
    cooldown: CooldownConfig = Field(default_factory=CooldownConfig, description="Cooldown configuration")

    tags: List[str] = Field(default_factory=list, description="Alert tags for categorization")


class AlertConfigFile(BaseModel):
    """Root structure of alert YAML config file."""
    version: str = Field(default="1.0", description="Config version")
    alerts: List[AlertConfig] = Field(default_factory=list, description="List of alert configurations")


# ============================================
# Result Models
# ============================================

class AlertResult(BaseModel):
    """Result of alert evaluation for a single org."""
    alert_id: str
    org_slug: str
    status: AlertStatus
    data: Optional[Dict[str, Any]] = None
    recipients: Optional[List[str]] = None
    recipient_count: int = 0
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = self.model_dump()
        result["timestamp"] = self.timestamp.isoformat()
        return result


class EvaluationSummary(BaseModel):
    """Summary of alert evaluation run."""
    triggered: int = 0
    skipped_cooldown: int = 0
    skipped_disabled: int = 0
    no_match: int = 0
    no_data: int = 0
    errors: int = 0
    duration_ms: float = 0
    details: List[Dict[str, Any]] = Field(default_factory=list)


class AlertHistoryEntry(BaseModel):
    """Alert history record for BigQuery storage."""
    alert_history_id: str
    alert_id: str
    org_slug: str
    status: str
    severity: str
    trigger_data: Optional[str] = None  # JSON string
    condition_results: Optional[str] = None  # JSON string
    recipients: List[str] = Field(default_factory=list)
    recipient_count: int = 0
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
