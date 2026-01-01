"""
Notification Read Models

Query and response models for Polars-based notification reads.
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel, Field


class HistoryDatePeriod(str, Enum):
    """Date period presets for history queries"""
    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_7_DAYS = "last_7_days"
    LAST_30_DAYS = "last_30_days"
    LAST_90_DAYS = "last_90_days"
    CUSTOM = "custom"


class HistoryQueryParams(BaseModel):
    """Query parameters for notification history"""
    period: HistoryDatePeriod = Field(default=HistoryDatePeriod.LAST_30_DAYS)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notification_type: Optional[str] = None  # alert, summary, system
    status: Optional[str] = None  # delivered, failed, sent, queued
    priority: Optional[str] = None  # critical, high, medium, low, info
    channel_id: Optional[str] = None
    rule_id: Optional[str] = None
    limit: int = Field(default=100, le=1000)
    offset: int = Field(default=0, ge=0)

    def resolve_dates(self) -> tuple[date, date]:
        """Resolve date range from period or custom dates."""
        from datetime import timedelta
        today = date.today()

        if self.start_date and self.end_date:
            return self.start_date, self.end_date

        if self.period == HistoryDatePeriod.TODAY:
            return today, today
        elif self.period == HistoryDatePeriod.YESTERDAY:
            yesterday = today - timedelta(days=1)
            return yesterday, yesterday
        elif self.period == HistoryDatePeriod.LAST_7_DAYS:
            return today - timedelta(days=6), today
        elif self.period == HistoryDatePeriod.LAST_30_DAYS:
            return today - timedelta(days=29), today
        elif self.period == HistoryDatePeriod.LAST_90_DAYS:
            return today - timedelta(days=89), today
        else:
            # Default to last 30 days
            return today - timedelta(days=29), today


class NotificationQuery(BaseModel):
    """Base query for notification reads"""
    org_slug: str = Field(..., description="Organization slug")
    history_params: Optional[HistoryQueryParams] = None


class ChannelSummary(BaseModel):
    """Channel summary stats"""
    channel_id: str
    name: str
    channel_type: str
    is_active: bool
    is_default: bool
    notifications_24h: int = 0
    success_rate: float = 0.0


class RuleSummary(BaseModel):
    """Rule summary stats"""
    rule_id: str
    name: str
    rule_category: str
    rule_type: str
    priority: str
    is_active: bool
    triggers_today: int = 0
    last_triggered: Optional[datetime] = None


class SummarySummary(BaseModel):
    """Summary schedule stats"""
    summary_id: str
    name: str
    summary_type: str
    is_active: bool
    last_sent: Optional[datetime] = None
    next_scheduled: Optional[datetime] = None


class HistoryEntry(BaseModel):
    """Lightweight history entry for list views"""
    notification_id: str
    notification_type: str
    priority: Optional[str]
    subject: str
    body_preview: Optional[str]
    status: str
    channel_name: Optional[str]
    rule_name: Optional[str]
    summary_name: Optional[str]
    created_at: datetime
    delivered_at: Optional[datetime]
    acknowledged_at: Optional[datetime]
    error_message: Optional[str]


class NotificationStatsResponse(BaseModel):
    """Notification statistics response"""
    org_slug: str
    computed_at: datetime

    # Channel stats
    total_channels: int = 0
    active_channels: int = 0
    email_channels: int = 0
    slack_channels: int = 0
    webhook_channels: int = 0

    # Rule stats
    total_rules: int = 0
    active_rules: int = 0
    critical_rules: int = 0
    cost_rules: int = 0
    pipeline_rules: int = 0
    total_triggers_today: int = 0

    # Summary stats
    total_summaries: int = 0
    active_summaries: int = 0

    # History stats
    total_notifications: int = 0
    notifications_24h: int = 0
    alerts_24h: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    pending_acknowledgments: int = 0
    escalated_count: int = 0
    delivery_rate: float = 100.0


class HistoryListResponse(BaseModel):
    """Paginated history list response"""
    items: List[HistoryEntry]
    total: int
    limit: int
    offset: int
    has_more: bool
