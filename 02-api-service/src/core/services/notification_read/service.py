"""
Notification Read Service

High-performance, read-only notification service using Polars DataFrames.
For dashboard reads only - CRUD operations are in notification_crud/.

Features:
- Polars lazy evaluation for optimal query performance
- LRU cache with TTL for hot data
- Multi-tenant isolation via org_slug
"""

import polars as pl
import logging
import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client
from src.app.config import settings
from src.core.services._shared import (
    LRUCache,
    validate_org_slug,
    create_cache,
)
from .models import (
    NotificationQuery,
    NotificationStatsResponse,
    HistoryQueryParams,
    HistoryListResponse,
    HistoryEntry,
    ChannelSummary,
    RuleSummary,
    SummarySummary,
)

logger = logging.getLogger(__name__)


class NotificationReadService:
    """
    High-performance notification read service using Polars.

    READ-ONLY service for dashboard notification analytics.
    For CRUD operations, use NotificationCrudService instead.

    Features:
    - Lazy evaluation for optimal query execution
    - Aggressive caching with TTL
    - Multi-tenant isolation
    """

    def __init__(self, cache: Optional[LRUCache] = None):
        self._cache = cache or create_cache("NOTIFICATION", max_size=500, default_ttl=60)
        self._bq_client = None
        self._project_id = settings.gcp_project_id
        self._dataset_id = "organizations"

    @property
    def bq_client(self):
        """Lazy-load BigQuery client."""
        if self._bq_client is None:
            self._bq_client = get_bigquery_client()
        return self._bq_client

    def _get_table_id(self, table_name: str) -> str:
        """Get full table ID."""
        return f"{self._project_id}.{self._dataset_id}.{table_name}"

    def _cache_key(self, org_slug: str, operation: str, **kwargs) -> str:
        """Generate cache key."""
        parts = [org_slug, operation]
        for k, v in sorted(kwargs.items()):
            if v is not None:
                parts.append(f"{k}={v}")
        return ":".join(parts)

    # =========================================================================
    # Channel Reads
    # =========================================================================

    async def list_channels(
        self,
        org_slug: str,
        active_only: bool = False,
    ) -> List[ChannelSummary]:
        """
        List notification channels with summary stats.

        Args:
            org_slug: Organization slug
            active_only: Filter to active channels only

        Returns:
            List of ChannelSummary
        """
        validate_org_slug(org_slug)

        cache_key = self._cache_key(org_slug, "channels", active_only=active_only)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        # Query channels with notification counts
        query = f"""
            WITH channel_stats AS (
                SELECT
                    channel_id,
                    COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) AS notifications_24h,
                    SAFE_DIVIDE(
                        COUNTIF(status = 'delivered'),
                        NULLIF(COUNT(*), 0)
                    ) AS success_rate
                FROM `{self._get_table_id('org_notification_history')}`
                WHERE org_slug = @org_slug
                GROUP BY channel_id
            )
            SELECT
                c.channel_id,
                c.name,
                c.channel_type,
                c.is_active,
                c.is_default,
                COALESCE(s.notifications_24h, 0) AS notifications_24h,
                COALESCE(s.success_rate, 1.0) AS success_rate
            FROM `{self._get_table_id('org_notification_channels')}` c
            LEFT JOIN channel_stats s ON c.channel_id = s.channel_id
            WHERE c.org_slug = @org_slug
            {"AND c.is_active = TRUE" if active_only else ""}
            ORDER BY c.is_default DESC, c.name ASC
        """

        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            # PERF-003 FIX: Reuse cached BigQuery client
            results = self.bq_client.query(query, job_config=job_config).result()

            channels = [
                ChannelSummary(
                    channel_id=row.channel_id,
                    name=row.name,
                    channel_type=row.channel_type,
                    is_active=row.is_active,
                    is_default=row.is_default,
                    notifications_24h=row.notifications_24h,
                    success_rate=round(row.success_rate * 100, 2),
                )
                for row in results
            ]

            self._cache.set(cache_key, channels, ttl=60)
            return channels

        except Exception as e:
            logger.error(f"Failed to list channels for {org_slug}: {e}")
            raise

    # =========================================================================
    # Rule Reads
    # =========================================================================

    async def list_rules(
        self,
        org_slug: str,
        category: Optional[str] = None,
        priority: Optional[str] = None,
        active_only: bool = False,
    ) -> List[RuleSummary]:
        """
        List notification rules with summary stats.

        Args:
            org_slug: Organization slug
            category: Filter by rule category
            priority: Filter by priority
            active_only: Filter to active rules only

        Returns:
            List of RuleSummary
        """
        validate_org_slug(org_slug)

        cache_key = self._cache_key(
            org_slug, "rules",
            category=category,
            priority=priority,
            active_only=active_only
        )
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        query = f"""
            SELECT
                rule_id,
                name,
                rule_category,
                rule_type,
                priority,
                is_active,
                COALESCE(trigger_count_today, 0) AS triggers_today,
                last_triggered_at
            FROM `{self._get_table_id('org_notification_rules')}`
            WHERE org_slug = @org_slug
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

        if category:
            query += " AND rule_category = @category"
            params.append(bigquery.ScalarQueryParameter("category", "STRING", category))

        if priority:
            query += " AND priority = @priority"
            params.append(bigquery.ScalarQueryParameter("priority", "STRING", priority))

        if active_only:
            query += " AND is_active = TRUE"

        query += " ORDER BY priority ASC, created_at DESC"

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            # PERF-003 FIX: Reuse cached BigQuery client
            results = self.bq_client.query(query, job_config=job_config).result()

            rules = [
                RuleSummary(
                    rule_id=row.rule_id,
                    name=row.name,
                    rule_category=row.rule_category,
                    rule_type=row.rule_type,
                    priority=row.priority,
                    is_active=row.is_active,
                    triggers_today=row.triggers_today,
                    last_triggered=row.last_triggered_at,
                )
                for row in results
            ]

            self._cache.set(cache_key, rules, ttl=60)
            return rules

        except Exception as e:
            logger.error(f"Failed to list rules for {org_slug}: {e}")
            raise

    # =========================================================================
    # Summary Reads
    # =========================================================================

    async def list_summaries(
        self,
        org_slug: str,
        active_only: bool = False,
    ) -> List[SummarySummary]:
        """
        List notification summaries.

        Args:
            org_slug: Organization slug
            active_only: Filter to active summaries only

        Returns:
            List of SummarySummary
        """
        validate_org_slug(org_slug)

        cache_key = self._cache_key(org_slug, "summaries", active_only=active_only)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        query = f"""
            SELECT
                summary_id,
                name,
                summary_type,
                is_active,
                last_sent_at,
                next_scheduled_at
            FROM `{self._get_table_id('org_notification_summaries')}`
            WHERE org_slug = @org_slug
            {"AND is_active = TRUE" if active_only else ""}
            ORDER BY is_active DESC, name ASC
        """

        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            # PERF-003 FIX: Reuse cached BigQuery client
            results = self.bq_client.query(query, job_config=job_config).result()

            summaries = [
                SummarySummary(
                    summary_id=row.summary_id,
                    name=row.name,
                    summary_type=row.summary_type,
                    is_active=row.is_active,
                    last_sent=row.last_sent_at,
                    next_scheduled=row.next_scheduled_at,
                )
                for row in results
            ]

            self._cache.set(cache_key, summaries, ttl=60)
            return summaries

        except Exception as e:
            logger.error(f"Failed to list summaries for {org_slug}: {e}")
            raise

    # =========================================================================
    # History Reads (Polars-powered)
    # =========================================================================

    async def list_history(
        self,
        org_slug: str,
        params: Optional[HistoryQueryParams] = None,
    ) -> HistoryListResponse:
        """
        List notification history with filtering and pagination.

        Uses Polars for efficient filtering and aggregation.

        Args:
            org_slug: Organization slug
            params: Query parameters

        Returns:
            Paginated history list
        """
        validate_org_slug(org_slug)
        params = params or HistoryQueryParams()

        start_date, end_date = params.resolve_dates()

        # Build query with filters
        query = f"""
            SELECT
                h.notification_id,
                h.notification_type,
                h.priority,
                h.subject,
                h.body_preview,
                h.status,
                c.name AS channel_name,
                r.name AS rule_name,
                s.name AS summary_name,
                h.created_at,
                h.delivered_at,
                h.acknowledged_at,
                h.error_message
            FROM `{self._get_table_id('org_notification_history')}` h
            LEFT JOIN `{self._get_table_id('org_notification_channels')}` c
                ON h.channel_id = c.channel_id AND h.org_slug = c.org_slug
            LEFT JOIN `{self._get_table_id('org_notification_rules')}` r
                ON h.rule_id = r.rule_id AND h.org_slug = r.org_slug
            LEFT JOIN `{self._get_table_id('org_notification_summaries')}` s
                ON h.summary_id = s.summary_id AND h.org_slug = s.org_slug
            WHERE h.org_slug = @org_slug
                AND DATE(h.created_at) BETWEEN @start_date AND @end_date
        """

        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", end_date),
        ]

        if params.notification_type:
            query += " AND h.notification_type = @notification_type"
            query_params.append(
                bigquery.ScalarQueryParameter("notification_type", "STRING", params.notification_type)
            )

        if params.status:
            query += " AND h.status = @status"
            query_params.append(
                bigquery.ScalarQueryParameter("status", "STRING", params.status)
            )

        if params.priority:
            query += " AND h.priority = @priority"
            query_params.append(
                bigquery.ScalarQueryParameter("priority", "STRING", params.priority)
            )

        if params.channel_id:
            query += " AND h.channel_id = @channel_id"
            query_params.append(
                bigquery.ScalarQueryParameter("channel_id", "STRING", params.channel_id)
            )

        if params.rule_id:
            query += " AND h.rule_id = @rule_id"
            query_params.append(
                bigquery.ScalarQueryParameter("rule_id", "STRING", params.rule_id)
            )

        # Count total
        count_query = f"SELECT COUNT(*) as total FROM ({query})"
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)

        try:
            # PERF-003 FIX: Reuse cached BigQuery client
            # Get total count
            count_result = list(self.bq_client.query(count_query, job_config=job_config).result())
            total = count_result[0].total if count_result else 0

            # Get paginated results
            query += f" ORDER BY h.created_at DESC LIMIT {params.limit} OFFSET {params.offset}"
            results = self.bq_client.query(query, job_config=job_config).result()

            # PERF-005 FIX: Direct row iteration without redundant Polars conversion
            entries = [
                HistoryEntry(
                    notification_id=row.notification_id,
                    notification_type=row.notification_type,
                    priority=row.priority,
                    subject=row.subject,
                    body_preview=row.body_preview,
                    status=row.status,
                    channel_name=row.channel_name,
                    rule_name=row.rule_name,
                    summary_name=row.summary_name,
                    created_at=row.created_at,
                    delivered_at=row.delivered_at,
                    acknowledged_at=row.acknowledged_at,
                    error_message=row.error_message,
                )
                for row in results
            ]

            return HistoryListResponse(
                items=entries,
                total=total,
                limit=params.limit,
                offset=params.offset,
                has_more=(params.offset + params.limit) < total,
            )

        except Exception as e:
            logger.error(f"Failed to list history for {org_slug}: {e}")
            raise

    # =========================================================================
    # Statistics
    # =========================================================================

    async def get_stats(self, org_slug: str) -> NotificationStatsResponse:
        """
        Get notification statistics for dashboard.

        Aggregates stats from channels, rules, summaries, and history.
        Results are cached for 30 seconds.

        Args:
            org_slug: Organization slug

        Returns:
            NotificationStatsResponse with all stats
        """
        validate_org_slug(org_slug)

        cache_key = self._cache_key(org_slug, "stats")
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        # Single query for all stats using CTEs
        query = f"""
            WITH channel_stats AS (
                SELECT
                    COUNT(*) AS total_channels,
                    COUNTIF(is_active = TRUE) AS active_channels,
                    COUNTIF(channel_type = 'email') AS email_channels,
                    COUNTIF(channel_type = 'slack') AS slack_channels,
                    COUNTIF(channel_type = 'webhook') AS webhook_channels
                FROM `{self._get_table_id('org_notification_channels')}`
                WHERE org_slug = @org_slug
            ),
            rule_stats AS (
                SELECT
                    COUNT(*) AS total_rules,
                    COUNTIF(is_active = TRUE) AS active_rules,
                    COUNTIF(priority = 'critical') AS critical_rules,
                    COUNTIF(rule_category = 'cost') AS cost_rules,
                    COUNTIF(rule_category = 'pipeline') AS pipeline_rules,
                    COALESCE(SUM(trigger_count_today), 0) AS total_triggers_today
                FROM `{self._get_table_id('org_notification_rules')}`
                WHERE org_slug = @org_slug
            ),
            summary_stats AS (
                SELECT
                    COUNT(*) AS total_summaries,
                    COUNTIF(is_active = TRUE) AS active_summaries
                FROM `{self._get_table_id('org_notification_summaries')}`
                WHERE org_slug = @org_slug
            ),
            history_stats AS (
                SELECT
                    COUNT(*) AS total_notifications,
                    COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) AS notifications_24h,
                    COUNTIF(notification_type = 'alert' AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) AS alerts_24h,
                    COUNTIF(status = 'delivered') AS delivered_count,
                    COUNTIF(status = 'failed') AS failed_count,
                    COUNTIF(status = 'delivered' AND acknowledged_at IS NULL) AS pending_acknowledgments,
                    COUNTIF(escalated = TRUE) AS escalated_count
                FROM `{self._get_table_id('org_notification_history')}`
                WHERE org_slug = @org_slug
            )
            SELECT
                c.total_channels,
                c.active_channels,
                c.email_channels,
                c.slack_channels,
                c.webhook_channels,
                r.total_rules,
                r.active_rules,
                r.critical_rules,
                r.cost_rules,
                r.pipeline_rules,
                r.total_triggers_today,
                s.total_summaries,
                s.active_summaries,
                h.total_notifications,
                h.notifications_24h,
                h.alerts_24h,
                h.delivered_count,
                h.failed_count,
                h.pending_acknowledgments,
                h.escalated_count,
                SAFE_DIVIDE(h.delivered_count, NULLIF(h.total_notifications, 0)) * 100 AS delivery_rate
            FROM channel_stats c
            CROSS JOIN rule_stats r
            CROSS JOIN summary_stats s
            CROSS JOIN history_stats h
        """

        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            # PERF-003 FIX: Reuse cached BigQuery client
            results = list(self.bq_client.query(query, job_config=job_config).result())

            if results:
                row = results[0]
                stats = NotificationStatsResponse(
                    org_slug=org_slug,
                    computed_at=datetime.utcnow(),
                    total_channels=row.total_channels or 0,
                    active_channels=row.active_channels or 0,
                    email_channels=row.email_channels or 0,
                    slack_channels=row.slack_channels or 0,
                    webhook_channels=row.webhook_channels or 0,
                    total_rules=row.total_rules or 0,
                    active_rules=row.active_rules or 0,
                    critical_rules=row.critical_rules or 0,
                    cost_rules=row.cost_rules or 0,
                    pipeline_rules=row.pipeline_rules or 0,
                    total_triggers_today=int(row.total_triggers_today or 0),
                    total_summaries=row.total_summaries or 0,
                    active_summaries=row.active_summaries or 0,
                    total_notifications=row.total_notifications or 0,
                    notifications_24h=row.notifications_24h or 0,
                    alerts_24h=row.alerts_24h or 0,
                    delivered_count=row.delivered_count or 0,
                    failed_count=row.failed_count or 0,
                    pending_acknowledgments=row.pending_acknowledgments or 0,
                    escalated_count=row.escalated_count or 0,
                    delivery_rate=round(row.delivery_rate or 100.0, 2),
                )
            else:
                stats = NotificationStatsResponse(
                    org_slug=org_slug,
                    computed_at=datetime.utcnow(),
                )

            self._cache.set(cache_key, stats, ttl=30)
            return stats

        except Exception as e:
            logger.error(f"Failed to get stats for {org_slug}: {e}")
            raise


# Singleton instance
_notification_read_service: Optional[NotificationReadService] = None
_service_lock = threading.Lock()


def get_notification_read_service() -> NotificationReadService:
    """
    Get or create the notification read service singleton.

    MT-005 FIX: Thread-safe singleton with double-check locking.
    """
    global _notification_read_service
    if _notification_read_service is None:
        with _service_lock:
            if _notification_read_service is None:
                _notification_read_service = NotificationReadService()
    return _notification_read_service
