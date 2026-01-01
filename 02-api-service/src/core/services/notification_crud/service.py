"""
Notification Settings Service

Manages notification channels, rules, summaries, and history in BigQuery.
Reuses existing cost read service for data aggregation.
"""

import json
import uuid
import logging
import base64
from typing import Optional, List, Dict, Any, Set
from datetime import datetime, timedelta, timezone

from google.cloud import bigquery
from croniter import croniter

from src.core.security.kms_encryption import encrypt_value, decrypt_value
from .models import (
    ChannelType,
    RuleCategory,
    RuleType,
    RulePriority,
    SummaryType,
    NotificationStatus,
    NotificationChannel,
    NotificationChannelCreate,
    NotificationChannelUpdate,
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
    RuleConditions,
    NotificationSummary,
    NotificationSummaryCreate,
    NotificationSummaryUpdate,
    NotificationHistoryEntry,
    NotificationStats,
)

logger = logging.getLogger(__name__)


class NotificationSettingsService:
    """
    Service for managing notification settings.

    All data is stored in the organizations dataset in BigQuery:
    - org_notification_channels
    - org_notification_rules
    - org_notification_summaries
    - org_notification_history
    """

    def __init__(self, project_id: str, dataset_id: str = "organizations"):
        """
        Initialize the notification settings service.

        Args:
            project_id: GCP project ID
            dataset_id: BigQuery dataset ID (default: organizations)
        """
        self.project_id = project_id
        self.dataset_id = dataset_id
        self.client = bigquery.Client(project=project_id)

        # Table references
        self.channels_table = f"{project_id}.{dataset_id}.org_notification_channels"
        self.rules_table = f"{project_id}.{dataset_id}.org_notification_rules"
        self.summaries_table = f"{project_id}.{dataset_id}.org_notification_summaries"
        self.history_table = f"{project_id}.{dataset_id}.org_notification_history"

    # ==========================================================================
    # Encryption Helpers
    # ==========================================================================

    def _encrypt_credential(self, value: Optional[str]) -> Optional[str]:
        """
        Encrypt a credential value using KMS.

        ERR-001 FIX: Never return plaintext on encryption failure.
        Raises exception to prevent storing unencrypted credentials.
        """
        if not value:
            return None
        try:
            encrypted_bytes = encrypt_value(value)
            return base64.b64encode(encrypted_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"KMS encryption failed - credential NOT stored: {e}")
            raise ValueError(f"Failed to encrypt credential: {str(e)}") from e

    def _decrypt_credential(self, value: Optional[str]) -> Optional[str]:
        """
        Decrypt a credential value using KMS.

        SEC-004 FIX: Return None on failure instead of encrypted blob.
        Caller must handle None gracefully.
        """
        if not value:
            return None
        try:
            encrypted_bytes = base64.b64decode(value.encode('utf-8'))
            return decrypt_value(encrypted_bytes)
        except Exception as e:
            logger.error(f"KMS decryption failed - credential unavailable: {e}")
            return None  # Return None, not the encrypted value

    # ==========================================================================
    # Cron Helpers
    # ==========================================================================

    def _calculate_next_scheduled(
        self, cron_expression: str, schedule_timezone: str = "UTC"
    ) -> Optional[datetime]:
        """Calculate the next scheduled time from a cron expression."""
        try:
            import pytz
            tz = pytz.timezone(schedule_timezone)
            now = datetime.now(tz)
            cron = croniter(cron_expression, now)
            next_time = cron.get_next(datetime)
            return next_time.astimezone(timezone.utc).replace(tzinfo=None)
        except Exception as e:
            logger.warning(f"Failed to calculate next scheduled time: {e}")
            return None

    # ==========================================================================
    # Validation Helpers
    # ==========================================================================

    async def _get_channel_ids(self, org_slug: str) -> Set[str]:
        """Get all channel IDs for an organization."""
        channels = await self.list_channels(org_slug)
        return {c.channel_id for c in channels}

    async def _validate_channel_ids(
        self, org_slug: str, channel_ids: List[str]
    ) -> List[str]:
        """Validate that all channel IDs exist. Returns list of missing IDs."""
        if not channel_ids:
            return []
        existing_ids = await self._get_channel_ids(org_slug)
        return [cid for cid in channel_ids if cid not in existing_ids]

    async def _get_rules_using_channel(
        self, org_slug: str, channel_id: str
    ) -> List[str]:
        """Get rule IDs that reference a channel."""
        rules = await self.list_rules(org_slug)
        using_channel = []
        for rule in rules:
            if channel_id in (rule.notify_channel_ids or []):
                using_channel.append(rule.rule_id)
            elif channel_id in (rule.escalate_to_channel_ids or []):
                using_channel.append(rule.rule_id)
        return using_channel

    # ==========================================================================
    # Channel Operations
    # ==========================================================================

    async def list_channels(
        self,
        org_slug: str,
        channel_type: Optional[ChannelType] = None,
        active_only: bool = False,
    ) -> List[NotificationChannel]:
        """List notification channels for an organization."""
        query = f"""
            SELECT *
            FROM `{self.channels_table}`
            WHERE org_slug = @org_slug
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

        if channel_type:
            query += " AND channel_type = @channel_type"
            params.append(bigquery.ScalarQueryParameter("channel_type", "STRING", channel_type.value))

        if active_only:
            query += " AND is_active = TRUE"

        query += " ORDER BY created_at DESC"

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = self.client.query(query, job_config=job_config).result()
            channels = []
            for row in results:
                channel_data = dict(row)
                # Add computed fields
                channel_data["slack_webhook_configured"] = bool(channel_data.get("slack_webhook_url_encrypted"))
                channel_data["webhook_configured"] = bool(channel_data.get("webhook_url_encrypted"))
                channels.append(NotificationChannel(**channel_data))
            return channels
        except Exception as e:
            logger.error(f"Failed to list channels for {org_slug}: {e}")
            raise

    async def get_channel(self, org_slug: str, channel_id: str) -> Optional[NotificationChannel]:
        """Get a specific notification channel."""
        query = f"""
            SELECT *
            FROM `{self.channels_table}`
            WHERE org_slug = @org_slug AND channel_id = @channel_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("channel_id", "STRING", channel_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if not results:
                return None
            channel_data = dict(results[0])
            channel_data["slack_webhook_configured"] = bool(channel_data.get("slack_webhook_url_encrypted"))
            channel_data["webhook_configured"] = bool(channel_data.get("webhook_url_encrypted"))
            return NotificationChannel(**channel_data)
        except Exception as e:
            logger.error(f"Failed to get channel {channel_id}: {e}")
            raise

    async def _check_channel_exists(self, org_slug: str, name: str, channel_type: ChannelType) -> bool:
        """
        IDEM-001 FIX: Check if channel with same name and type already exists.
        """
        query = f"""
            SELECT COUNT(*) as cnt
            FROM `{self.channels_table}`
            WHERE org_slug = @org_slug AND name = @name AND channel_type = @channel_type
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("name", "STRING", name),
            bigquery.ScalarQueryParameter("channel_type", "STRING", channel_type.value),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        results = list(self.client.query(query, job_config=job_config).result())
        return results[0].cnt > 0 if results else False

    async def create_channel(
        self,
        org_slug: str,
        channel: NotificationChannelCreate,
        created_by: Optional[str] = None,
    ) -> NotificationChannel:
        """
        Create a new notification channel.

        IDEM-001 FIX: Check for duplicate before insert.
        """
        # Check for existing channel with same name and type
        if await self._check_channel_exists(org_slug, channel.name, channel.channel_type):
            raise ValueError(
                f"Channel with name '{channel.name}' and type '{channel.channel_type.value}' "
                f"already exists for organization '{org_slug}'"
            )

        channel_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # If setting as default, unset other defaults of same type
        if channel.is_default:
            await self._unset_default_channel(org_slug, channel.channel_type)

        row = {
            "channel_id": channel_id,
            "org_slug": org_slug,
            "channel_type": channel.channel_type.value,
            "name": channel.name,
            "is_default": channel.is_default,
            "is_active": channel.is_active,
            "email_recipients": channel.email_recipients or [],
            "email_cc_recipients": channel.email_cc_recipients or [],
            "email_subject_prefix": channel.email_subject_prefix,
            "slack_webhook_url_encrypted": self._encrypt_credential(channel.slack_webhook_url),
            "slack_channel": channel.slack_channel,
            "slack_mention_users": channel.slack_mention_users or [],
            "slack_mention_channel": channel.slack_mention_channel,
            "webhook_url_encrypted": self._encrypt_credential(channel.webhook_url),
            "webhook_headers_encrypted": self._encrypt_credential(
                json.dumps(channel.webhook_headers) if channel.webhook_headers else None
            ),
            "webhook_method": channel.webhook_method,
            "created_at": now.isoformat(),
            "updated_at": None,
            "created_by": created_by,
        }

        try:
            errors = self.client.insert_rows_json(self.channels_table, [row])
            if errors:
                raise Exception(f"BigQuery insert errors: {errors}")

            return await self.get_channel(org_slug, channel_id)
        except Exception as e:
            logger.error(f"Failed to create channel: {e}")
            raise

    async def update_channel(
        self,
        org_slug: str,
        channel_id: str,
        update: NotificationChannelUpdate,
    ) -> Optional[NotificationChannel]:
        """Update a notification channel."""
        existing = await self.get_channel(org_slug, channel_id)
        if not existing:
            return None

        # Build update fields
        updates = []
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("channel_id", "STRING", channel_id),
        ]

        update_data = update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                if field == "slack_webhook_url":
                    encrypted = self._encrypt_credential(value)
                    updates.append("slack_webhook_url_encrypted = @slack_webhook_url")
                    params.append(bigquery.ScalarQueryParameter("slack_webhook_url", "STRING", encrypted))
                elif field == "webhook_url":
                    encrypted = self._encrypt_credential(value)
                    updates.append("webhook_url_encrypted = @webhook_url")
                    params.append(bigquery.ScalarQueryParameter("webhook_url", "STRING", encrypted))
                elif field == "webhook_headers":
                    encrypted = self._encrypt_credential(json.dumps(value))
                    updates.append("webhook_headers_encrypted = @webhook_headers")
                    params.append(bigquery.ScalarQueryParameter("webhook_headers", "STRING", encrypted))
                elif isinstance(value, list):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ArrayQueryParameter(field, "STRING", value))
                elif isinstance(value, bool):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "BOOL", value))
                else:
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "STRING", str(value)))

        if not updates:
            return existing

        updates.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"""
            UPDATE `{self.channels_table}`
            SET {", ".join(updates)}
            WHERE org_slug = @org_slug AND channel_id = @channel_id
        """

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            self.client.query(query, job_config=job_config).result()
            return await self.get_channel(org_slug, channel_id)
        except Exception as e:
            logger.error(f"Failed to update channel {channel_id}: {e}")
            raise

    async def delete_channel(
        self, org_slug: str, channel_id: str, force: bool = False
    ) -> bool:
        """
        Delete a notification channel.

        Args:
            org_slug: Organization slug
            channel_id: Channel ID to delete
            force: If True, remove channel from rules instead of blocking

        Raises:
            ValueError: If channel is referenced by rules and force is False
        """
        # Check for rules using this channel
        rules_using = await self._get_rules_using_channel(org_slug, channel_id)
        if rules_using and not force:
            raise ValueError(
                f"Cannot delete channel: referenced by {len(rules_using)} rule(s). "
                f"Rule IDs: {', '.join(rules_using[:5])}{'...' if len(rules_using) > 5 else ''}"
            )

        # If force, remove channel from rules first
        if rules_using and force:
            for rule_id in rules_using:
                rule = await self.get_rule(org_slug, rule_id)
                if rule:
                    new_notify = [cid for cid in (rule.notify_channel_ids or []) if cid != channel_id]
                    new_escalate = [cid for cid in (rule.escalate_to_channel_ids or []) if cid != channel_id]
                    await self.update_rule(
                        org_slug,
                        rule_id,
                        NotificationRuleUpdate(
                            notify_channel_ids=new_notify,
                            escalate_to_channel_ids=new_escalate,
                        ),
                    )

        query = f"""
            DELETE FROM `{self.channels_table}`
            WHERE org_slug = @org_slug AND channel_id = @channel_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("channel_id", "STRING", channel_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            result = self.client.query(query, job_config=job_config).result()
            return result.num_dml_affected_rows > 0
        except Exception as e:
            logger.error(f"Failed to delete channel {channel_id}: {e}")
            raise

    async def _unset_default_channel(self, org_slug: str, channel_type: ChannelType):
        """Unset default flag for all channels of a type."""
        query = f"""
            UPDATE `{self.channels_table}`
            SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug AND channel_type = @channel_type AND is_default = TRUE
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("channel_type", "STRING", channel_type.value),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        self.client.query(query, job_config=job_config).result()

    # ==========================================================================
    # Rule Operations
    # ==========================================================================

    async def list_rules(
        self,
        org_slug: str,
        category: Optional[RuleCategory] = None,
        priority: Optional[RulePriority] = None,
        active_only: bool = False,
    ) -> List[NotificationRule]:
        """List notification rules for an organization."""
        query = f"""
            SELECT *
            FROM `{self.rules_table}`
            WHERE org_slug = @org_slug
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

        if category:
            query += " AND rule_category = @category"
            params.append(bigquery.ScalarQueryParameter("category", "STRING", category.value))

        if priority:
            query += " AND priority = @priority"
            params.append(bigquery.ScalarQueryParameter("priority", "STRING", priority.value))

        if active_only:
            query += " AND is_active = TRUE"

        query += " ORDER BY created_at DESC"

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = self.client.query(query, job_config=job_config).result()
            rules = []
            for row in results:
                rule_data = dict(row)
                # Parse conditions from JSON
                if rule_data.get("conditions"):
                    rule_data["conditions"] = RuleConditions.from_json(rule_data["conditions"])
                rules.append(NotificationRule(**rule_data))
            return rules
        except Exception as e:
            logger.error(f"Failed to list rules for {org_slug}: {e}")
            raise

    async def get_rule(self, org_slug: str, rule_id: str) -> Optional[NotificationRule]:
        """Get a specific notification rule."""
        query = f"""
            SELECT *
            FROM `{self.rules_table}`
            WHERE org_slug = @org_slug AND rule_id = @rule_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("rule_id", "STRING", rule_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if not results:
                return None
            rule_data = dict(results[0])
            if rule_data.get("conditions"):
                rule_data["conditions"] = RuleConditions.from_json(rule_data["conditions"])
            return NotificationRule(**rule_data)
        except Exception as e:
            logger.error(f"Failed to get rule {rule_id}: {e}")
            raise

    async def _check_rule_exists(self, org_slug: str, name: str) -> bool:
        """IDEM-002 FIX: Check if rule with same name already exists."""
        query = f"""
            SELECT COUNT(*) as cnt
            FROM `{self.rules_table}`
            WHERE org_slug = @org_slug AND name = @name
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("name", "STRING", name),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        results = list(self.client.query(query, job_config=job_config).result())
        return results[0].cnt > 0 if results else False

    async def create_rule(
        self,
        org_slug: str,
        rule: NotificationRuleCreate,
        created_by: Optional[str] = None,
    ) -> NotificationRule:
        """
        Create a new notification rule.

        IDEM-002 FIX: Check for duplicate before insert.

        Raises:
            ValueError: If any channel IDs don't exist or rule name is duplicate
        """
        # Check for existing rule with same name
        if await self._check_rule_exists(org_slug, rule.name):
            raise ValueError(
                f"Rule with name '{rule.name}' already exists for organization '{org_slug}'"
            )

        # Validate channel IDs exist
        all_channel_ids = list(rule.notify_channel_ids or [])
        if rule.escalate_to_channel_ids:
            all_channel_ids.extend(rule.escalate_to_channel_ids)

        if all_channel_ids:
            missing = await self._validate_channel_ids(org_slug, all_channel_ids)
            if missing:
                raise ValueError(
                    f"Invalid channel IDs: {', '.join(missing)}. "
                    "Channels must exist before being assigned to rules."
                )

        rule_id = str(uuid.uuid4())
        now = datetime.utcnow()

        row = {
            "rule_id": rule_id,
            "org_slug": org_slug,
            "name": rule.name,
            "description": rule.description,
            "is_active": rule.is_active,
            "priority": rule.priority.value,
            "rule_category": rule.rule_category.value,
            "rule_type": rule.rule_type.value,
            "conditions": rule.conditions.to_json(),
            "provider_filter": rule.provider_filter or [],
            "service_filter": rule.service_filter or [],
            "hierarchy_dept_id": rule.hierarchy_dept_id,
            "hierarchy_project_id": rule.hierarchy_project_id,
            "hierarchy_team_id": rule.hierarchy_team_id,
            "notify_channel_ids": rule.notify_channel_ids,
            "escalate_after_mins": rule.escalate_after_mins,
            "escalate_to_channel_ids": rule.escalate_to_channel_ids or [],
            "cooldown_minutes": rule.cooldown_minutes,
            "batch_window_minutes": rule.batch_window_minutes,
            "quiet_hours_start": rule.quiet_hours_start,
            "quiet_hours_end": rule.quiet_hours_end,
            "quiet_hours_timezone": rule.quiet_hours_timezone,
            "last_triggered_at": None,
            "trigger_count_today": 0,
            "acknowledged_at": None,
            "acknowledged_by": None,
            "created_at": now.isoformat(),
            "updated_at": None,
            "created_by": created_by,
        }

        try:
            errors = self.client.insert_rows_json(self.rules_table, [row])
            if errors:
                raise Exception(f"BigQuery insert errors: {errors}")

            return await self.get_rule(org_slug, rule_id)
        except Exception as e:
            logger.error(f"Failed to create rule: {e}")
            raise

    async def update_rule(
        self,
        org_slug: str,
        rule_id: str,
        update: NotificationRuleUpdate,
    ) -> Optional[NotificationRule]:
        """Update a notification rule."""
        existing = await self.get_rule(org_slug, rule_id)
        if not existing:
            return None

        # Build SET clause dynamically
        updates = []
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("rule_id", "STRING", rule_id),
        ]

        update_data = update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                if field == "conditions":
                    updates.append("conditions = @conditions")
                    params.append(bigquery.ScalarQueryParameter("conditions", "STRING", value.to_json()))
                elif field == "priority":
                    updates.append("priority = @priority")
                    params.append(bigquery.ScalarQueryParameter("priority", "STRING", value.value))
                elif isinstance(value, list):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ArrayQueryParameter(field, "STRING", value))
                elif isinstance(value, bool):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "BOOL", value))
                elif isinstance(value, int):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "INT64", value))
                else:
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "STRING", str(value)))

        if not updates:
            return existing

        updates.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"""
            UPDATE `{self.rules_table}`
            SET {", ".join(updates)}
            WHERE org_slug = @org_slug AND rule_id = @rule_id
        """

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            self.client.query(query, job_config=job_config).result()
            return await self.get_rule(org_slug, rule_id)
        except Exception as e:
            logger.error(f"Failed to update rule {rule_id}: {e}")
            raise

    async def delete_rule(self, org_slug: str, rule_id: str) -> bool:
        """Delete a notification rule."""
        query = f"""
            DELETE FROM `{self.rules_table}`
            WHERE org_slug = @org_slug AND rule_id = @rule_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("rule_id", "STRING", rule_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            result = self.client.query(query, job_config=job_config).result()
            return result.num_dml_affected_rows > 0
        except Exception as e:
            logger.error(f"Failed to delete rule {rule_id}: {e}")
            raise

    async def pause_rule(self, org_slug: str, rule_id: str) -> Optional[NotificationRule]:
        """Pause a notification rule."""
        return await self.update_rule(org_slug, rule_id, NotificationRuleUpdate(is_active=False))

    async def resume_rule(self, org_slug: str, rule_id: str) -> Optional[NotificationRule]:
        """Resume a notification rule."""
        return await self.update_rule(org_slug, rule_id, NotificationRuleUpdate(is_active=True))

    # ==========================================================================
    # Summary Operations
    # ==========================================================================

    async def list_summaries(
        self,
        org_slug: str,
        summary_type: Optional[SummaryType] = None,
        active_only: bool = False,
    ) -> List[NotificationSummary]:
        """List notification summaries for an organization."""
        query = f"""
            SELECT *
            FROM `{self.summaries_table}`
            WHERE org_slug = @org_slug
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

        if summary_type:
            query += " AND summary_type = @summary_type"
            params.append(bigquery.ScalarQueryParameter("summary_type", "STRING", summary_type.value))

        if active_only:
            query += " AND is_active = TRUE"

        query += " ORDER BY created_at DESC"

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = self.client.query(query, job_config=job_config).result()
            summaries = []
            for row in results:
                summary_data = dict(row)
                if summary_data.get("hierarchy_filter"):
                    summary_data["hierarchy_filter"] = json.loads(summary_data["hierarchy_filter"])
                summaries.append(NotificationSummary(**summary_data))
            return summaries
        except Exception as e:
            logger.error(f"Failed to list summaries for {org_slug}: {e}")
            raise

    async def get_summary(self, org_slug: str, summary_id: str) -> Optional[NotificationSummary]:
        """Get a specific notification summary."""
        query = f"""
            SELECT *
            FROM `{self.summaries_table}`
            WHERE org_slug = @org_slug AND summary_id = @summary_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("summary_id", "STRING", summary_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if not results:
                return None
            summary_data = dict(results[0])
            if summary_data.get("hierarchy_filter"):
                summary_data["hierarchy_filter"] = json.loads(summary_data["hierarchy_filter"])
            return NotificationSummary(**summary_data)
        except Exception as e:
            logger.error(f"Failed to get summary {summary_id}: {e}")
            raise

    async def _check_summary_exists(self, org_slug: str, name: str) -> bool:
        """IDEM-003 FIX: Check if summary with same name already exists."""
        query = f"""
            SELECT COUNT(*) as cnt
            FROM `{self.summaries_table}`
            WHERE org_slug = @org_slug AND name = @name
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("name", "STRING", name),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        results = list(self.client.query(query, job_config=job_config).result())
        return results[0].cnt > 0 if results else False

    async def create_summary(
        self,
        org_slug: str,
        summary: NotificationSummaryCreate,
        created_by: Optional[str] = None,
    ) -> NotificationSummary:
        """
        Create a new notification summary.

        IDEM-003 FIX: Check for duplicate before insert.
        """
        # Check for existing summary with same name
        if await self._check_summary_exists(org_slug, summary.name):
            raise ValueError(
                f"Summary with name '{summary.name}' already exists for organization '{org_slug}'"
            )

        summary_id = str(uuid.uuid4())
        now = datetime.utcnow()

        row = {
            "summary_id": summary_id,
            "org_slug": org_slug,
            "name": summary.name,
            "summary_type": summary.summary_type.value,
            "is_active": summary.is_active,
            "schedule_cron": summary.schedule_cron,
            "schedule_timezone": summary.schedule_timezone,
            "notify_channel_ids": summary.notify_channel_ids,
            "include_sections": summary.include_sections,
            "top_n_items": summary.top_n_items,
            "currency_display": summary.currency_display,
            "provider_filter": summary.provider_filter or [],
            "hierarchy_filter": json.dumps(summary.hierarchy_filter) if summary.hierarchy_filter else None,
            "last_sent_at": None,
            "next_scheduled_at": self._calculate_next_scheduled(
                summary.schedule_cron, summary.schedule_timezone
            ).isoformat() if summary.schedule_cron and summary.is_active else None,
            "created_at": now.isoformat(),
            "updated_at": None,
            "created_by": created_by,
        }

        try:
            errors = self.client.insert_rows_json(self.summaries_table, [row])
            if errors:
                raise Exception(f"BigQuery insert errors: {errors}")

            return await self.get_summary(org_slug, summary_id)
        except Exception as e:
            logger.error(f"Failed to create summary: {e}")
            raise

    async def update_summary(
        self,
        org_slug: str,
        summary_id: str,
        update: NotificationSummaryUpdate,
    ) -> Optional[NotificationSummary]:
        """Update a notification summary."""
        existing = await self.get_summary(org_slug, summary_id)
        if not existing:
            return None

        updates = []
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("summary_id", "STRING", summary_id),
        ]

        update_data = update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                if field == "hierarchy_filter":
                    updates.append("hierarchy_filter = @hierarchy_filter")
                    params.append(bigquery.ScalarQueryParameter("hierarchy_filter", "STRING", json.dumps(value)))
                elif isinstance(value, list):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ArrayQueryParameter(field, "STRING", value))
                elif isinstance(value, bool):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "BOOL", value))
                elif isinstance(value, int):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "INT64", value))
                else:
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "STRING", str(value)))

        if not updates:
            return existing

        updates.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"""
            UPDATE `{self.summaries_table}`
            SET {", ".join(updates)}
            WHERE org_slug = @org_slug AND summary_id = @summary_id
        """

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            self.client.query(query, job_config=job_config).result()
            return await self.get_summary(org_slug, summary_id)
        except Exception as e:
            logger.error(f"Failed to update summary {summary_id}: {e}")
            raise

    async def delete_summary(self, org_slug: str, summary_id: str) -> bool:
        """Delete a notification summary."""
        query = f"""
            DELETE FROM `{self.summaries_table}`
            WHERE org_slug = @org_slug AND summary_id = @summary_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("summary_id", "STRING", summary_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            result = self.client.query(query, job_config=job_config).result()
            return result.num_dml_affected_rows > 0
        except Exception as e:
            logger.error(f"Failed to delete summary {summary_id}: {e}")
            raise

    # ==========================================================================
    # History Operations
    # ==========================================================================

    async def list_history(
        self,
        org_slug: str,
        notification_type: Optional[str] = None,
        channel_id: Optional[str] = None,
        status: Optional[NotificationStatus] = None,
        days: int = 7,
        limit: int = 100,
        offset: int = 0,
    ) -> List[NotificationHistoryEntry]:
        """List notification history for an organization."""
        query = f"""
            SELECT *
            FROM `{self.history_table}`
            WHERE org_slug = @org_slug
            AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("days", "INT64", days),
        ]

        if notification_type:
            query += " AND notification_type = @notification_type"
            params.append(bigquery.ScalarQueryParameter("notification_type", "STRING", notification_type))

        if channel_id:
            query += " AND channel_id = @channel_id"
            params.append(bigquery.ScalarQueryParameter("channel_id", "STRING", channel_id))

        if status:
            query += " AND status = @status"
            params.append(bigquery.ScalarQueryParameter("status", "STRING", status.value))

        query += f" ORDER BY created_at DESC LIMIT {limit} OFFSET {offset}"

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = self.client.query(query, job_config=job_config).result()
            history = []
            for row in results:
                entry_data = dict(row)
                if entry_data.get("trigger_data"):
                    entry_data["trigger_data"] = json.loads(entry_data["trigger_data"])
                history.append(NotificationHistoryEntry(**entry_data))
            return history
        except Exception as e:
            logger.error(f"Failed to list history for {org_slug}: {e}")
            raise

    async def get_history_entry(self, org_slug: str, notification_id: str) -> Optional[NotificationHistoryEntry]:
        """Get a specific notification history entry."""
        query = f"""
            SELECT *
            FROM `{self.history_table}`
            WHERE org_slug = @org_slug AND notification_id = @notification_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("notification_id", "STRING", notification_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if not results:
                return None
            entry_data = dict(results[0])
            if entry_data.get("trigger_data"):
                entry_data["trigger_data"] = json.loads(entry_data["trigger_data"])
            return NotificationHistoryEntry(**entry_data)
        except Exception as e:
            logger.error(f"Failed to get history entry {notification_id}: {e}")
            raise

    async def acknowledge_notification(
        self,
        org_slug: str,
        notification_id: str,
        acknowledged_by: str,
    ) -> Optional[NotificationHistoryEntry]:
        """Acknowledge a notification."""
        query = f"""
            UPDATE `{self.history_table}`
            SET acknowledged_at = CURRENT_TIMESTAMP(), acknowledged_by = @acknowledged_by
            WHERE org_slug = @org_slug AND notification_id = @notification_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("notification_id", "STRING", notification_id),
            bigquery.ScalarQueryParameter("acknowledged_by", "STRING", acknowledged_by),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            self.client.query(query, job_config=job_config).result()
            return await self.get_history_entry(org_slug, notification_id)
        except Exception as e:
            logger.error(f"Failed to acknowledge notification {notification_id}: {e}")
            raise

    # ==========================================================================
    # Stats Operations
    # ==========================================================================

    async def get_stats(self, org_slug: str) -> NotificationStats:
        """Get notification statistics for an organization."""
        try:
            # Count channels
            channels = await self.list_channels(org_slug)
            active_channels = [c for c in channels if c.is_active]

            # Count rules
            rules = await self.list_rules(org_slug)
            active_rules = [r for r in rules if r.is_active]

            # Count summaries
            summaries = await self.list_summaries(org_slug)
            active_summaries = [s for s in summaries if s.is_active]

            # Get 24h history stats
            history_24h = await self.list_history(org_slug, days=1, limit=1000)
            alerts_24h = [h for h in history_24h if h.notification_type == "alert"]
            delivered = [h for h in history_24h if h.status == NotificationStatus.DELIVERED]
            pending_ack = [h for h in history_24h if h.notification_type == "alert" and not h.acknowledged_at]

            delivery_rate = len(delivered) / len(history_24h) if history_24h else 0.0

            return NotificationStats(
                total_channels=len(channels),
                active_channels=len(active_channels),
                total_rules=len(rules),
                active_rules=len(active_rules),
                total_summaries=len(summaries),
                active_summaries=len(active_summaries),
                notifications_24h=len(history_24h),
                alerts_24h=len(alerts_24h),
                delivery_rate=delivery_rate,
                pending_acknowledgments=len(pending_ack),
            )
        except Exception as e:
            logger.error(f"Failed to get stats for {org_slug}: {e}")
            raise


# Global service instance
_notification_settings_service: Optional[NotificationSettingsService] = None


def get_notification_settings_service(
    project_id: Optional[str] = None,
    dataset_id: str = "organizations",
) -> NotificationSettingsService:
    """Get or create the global notification settings service instance."""
    global _notification_settings_service

    if _notification_settings_service is None:
        import os
        project = project_id or os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
        _notification_settings_service = NotificationSettingsService(project, dataset_id)

    return _notification_settings_service
