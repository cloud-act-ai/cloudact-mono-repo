"""
Notification Configuration Models

Defines the configuration schema for notification providers with support for:
- Tenant-specific configurations
- Root/global fallback configurations
- Multiple notification providers (Email, Slack)
- Event-based notification triggers
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, validator, EmailStr
from enum import Enum


class NotificationProvider(str, Enum):
    """Supported notification providers"""
    EMAIL = "email"
    SLACK = "slack"
    BOTH = "both"


class NotificationEvent(str, Enum):
    """Events that can trigger notifications"""
    PIPELINE_STARTED = "pipeline_started"
    PIPELINE_SUCCESS = "pipeline_success"
    PIPELINE_FAILURE = "pipeline_failure"
    PIPELINE_WARNING = "pipeline_warning"
    DATA_QUALITY_FAILURE = "data_quality_failure"
    DATA_QUALITY_WARNING = "data_quality_warning"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    SYSTEM_ERROR = "system_error"


class NotificationSeverity(str, Enum):
    """Notification severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class EmailConfig(BaseModel):
    """Email notification configuration"""
    enabled: bool = Field(default=False, description="Enable email notifications")
    smtp_host: str = Field(..., description="SMTP server hostname")
    smtp_port: int = Field(default=587, description="SMTP server port")
    smtp_username: Optional[str] = Field(default=None, description="SMTP authentication username")
    smtp_password: Optional[str] = Field(default=None, description="SMTP authentication password")
    smtp_use_tls: bool = Field(default=True, description="Use TLS for SMTP connection")
    from_email: EmailStr = Field(..., description="Sender email address")
    from_name: Optional[str] = Field(default="CloudAct Platform", description="Sender display name")
    to_emails: List[EmailStr] = Field(..., description="Recipient email addresses")
    cc_emails: Optional[List[EmailStr]] = Field(default=None, description="CC email addresses")
    subject_prefix: Optional[str] = Field(default="[CloudAct]", description="Email subject prefix")

    @validator('smtp_port')
    def validate_smtp_port(cls, v):
        if v not in [25, 465, 587, 2525]:
            raise ValueError('SMTP port must be one of: 25, 465, 587, 2525')
        return v


class SlackConfig(BaseModel):
    """Slack notification configuration"""
    enabled: bool = Field(default=False, description="Enable Slack notifications")
    webhook_url: str = Field(..., description="Slack webhook URL")
    channel: Optional[str] = Field(default=None, description="Override default channel (e.g., #alerts)")
    username: Optional[str] = Field(default="CloudAct Bot", description="Bot display name")
    icon_emoji: Optional[str] = Field(default=":robot_face:", description="Bot icon emoji")
    mention_users: Optional[List[str]] = Field(default=None, description="User IDs to mention on critical alerts")
    mention_channel: bool = Field(default=False, description="Mention @channel on critical alerts")

    @validator('webhook_url')
    def validate_webhook_url(cls, v):
        if not v.startswith('https://hooks.slack.com/'):
            raise ValueError('Invalid Slack webhook URL')
        return v


class EventTriggerConfig(BaseModel):
    """Configuration for event-based notification triggers"""
    event: NotificationEvent = Field(..., description="Event type")
    enabled: bool = Field(default=True, description="Enable notifications for this event")
    severity: NotificationSeverity = Field(default=NotificationSeverity.INFO, description="Notification severity")
    providers: List[NotificationProvider] = Field(
        default=[NotificationProvider.EMAIL],
        description="Which providers to use for this event"
    )
    template: Optional[str] = Field(default=None, description="Custom notification template name")
    cooldown_seconds: Optional[int] = Field(
        default=None,
        description="Minimum seconds between notifications for this event (prevents spam)"
    )


class NotificationRetryConfig(BaseModel):
    """Retry configuration for failed notifications"""
    max_attempts: int = Field(default=3, ge=1, le=10, description="Maximum retry attempts")
    initial_delay_seconds: int = Field(default=5, ge=1, description="Initial delay before first retry")
    max_delay_seconds: int = Field(default=300, ge=1, description="Maximum delay between retries")
    exponential_backoff: bool = Field(default=True, description="Use exponential backoff for retries")


class NotificationConfig(BaseModel):
    """
    Root notification configuration

    This configuration can exist at two levels:
    1. Root level: ./configs/notifications.json (global fallback)
    2. Tenant level: ./configs/{tenant_id}/notifications.json (tenant-specific)

    Tenant-specific configurations take precedence over root configurations.
    """

    # Global settings
    enabled: bool = Field(default=False, description="Master switch for all notifications")
    default_provider: NotificationProvider = Field(
        default=NotificationProvider.EMAIL,
        description="Default notification provider"
    )

    # Provider configurations
    email: Optional[EmailConfig] = Field(default=None, description="Email provider configuration")
    slack: Optional[SlackConfig] = Field(default=None, description="Slack provider configuration")

    # Event triggers
    event_triggers: List[EventTriggerConfig] = Field(
        default_factory=list,
        description="Event-based notification triggers"
    )

    # Retry and rate limiting
    retry_config: NotificationRetryConfig = Field(
        default_factory=NotificationRetryConfig,
        description="Retry configuration"
    )

    timeout_seconds: int = Field(default=30, ge=5, le=120, description="Notification timeout")

    # Additional metadata
    tenant_id: Optional[str] = Field(default=None, description="Tenant ID (if tenant-specific config)")
    description: Optional[str] = Field(default=None, description="Configuration description")

    @validator('event_triggers')
    def validate_event_triggers(cls, v):
        """Ensure no duplicate event configurations"""
        events = [trigger.event for trigger in v]
        if len(events) != len(set(events)):
            raise ValueError('Duplicate event triggers found')
        return v

    def get_event_config(self, event: NotificationEvent) -> Optional[EventTriggerConfig]:
        """Get configuration for a specific event"""
        for trigger in self.event_triggers:
            if trigger.event == event and trigger.enabled:
                return trigger
        return None

    def should_notify(self, event: NotificationEvent, provider: NotificationProvider) -> bool:
        """Check if notification should be sent for event and provider"""
        if not self.enabled:
            return False

        event_config = self.get_event_config(event)
        if not event_config:
            return False

        # Check if provider is enabled for this event
        if provider in event_config.providers or NotificationProvider.BOTH in event_config.providers:
            # Check if the specific provider is configured and enabled
            if provider == NotificationProvider.EMAIL:
                return self.email is not None and self.email.enabled
            elif provider == NotificationProvider.SLACK:
                return self.slack is not None and self.slack.enabled

        return False


class NotificationMessage(BaseModel):
    """Notification message data"""
    event: NotificationEvent
    severity: NotificationSeverity
    tenant_id: str
    title: str
    message: str
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional contextual details")
    pipeline_id: Optional[str] = None
    pipeline_logging_id: Optional[str] = None
    timestamp: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return self.dict(exclude_none=True)
