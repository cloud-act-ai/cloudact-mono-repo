"""
Alert Engine

Main orchestrator for scheduled alert evaluation.

Flow:
1. Load alert configs from YAML
2. For each enabled alert
3. Execute data source query
4. Evaluate conditions
5. Resolve recipients
6. Send notifications
7. Record alert history
"""

import json
import uuid
import threading
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging

from .models import (
    AlertConfig,
    AlertResult,
    AlertStatus,
    EvaluationSummary,
    AlertHistoryEntry,
)
from .config_loader import AlertConfigLoader
from .query_executor import AlertQueryExecutor
from .condition_evaluator import ConditionEvaluator
from .recipient_resolver import RecipientResolver

logger = logging.getLogger(__name__)


class AlertEngine:
    """
    Reusable alert evaluation engine.

    Coordinates the full alert lifecycle:
    Config -> Query -> Evaluate -> Resolve -> Notify -> Record
    """

    def __init__(
        self,
        config_path: Optional[Path] = None,
        bq_client=None
    ):
        """
        Initialize alert engine.

        Args:
            config_path: Base path for configs. Defaults to ./configs
            bq_client: Optional BigQuery client instance
        """
        self.config_loader = AlertConfigLoader(config_path)
        self.query_executor = AlertQueryExecutor(bq_client)
        self.condition_evaluator = ConditionEvaluator()
        self.recipient_resolver = RecipientResolver()
        self._bq_client = bq_client

    async def evaluate_all_alerts(
        self,
        alert_ids: Optional[List[str]] = None,
        force_check: bool = False
    ) -> EvaluationSummary:
        """
        Evaluate all enabled alerts (or specific ones if alert_ids provided).

        Args:
            alert_ids: Optional list of specific alert IDs to evaluate
            force_check: If True, ignore cooldown periods

        Returns:
            EvaluationSummary with results
        """
        start_time = datetime.now(timezone.utc)
        summary = EvaluationSummary()

        # Load all alert configurations
        alerts = self.config_loader.load_all_alerts()

        # Filter to specific alerts if provided
        if alert_ids:
            alerts = [a for a in alerts if a.id in alert_ids]

        for alert_config in alerts:
            try:
                if not alert_config.enabled:
                    summary.skipped_disabled += 1
                    continue

                # Evaluate this alert
                alert_results = await self.evaluate_alert(alert_config, force_check)

                for result in alert_results:
                    if result.status == AlertStatus.TRIGGERED:
                        summary.triggered += 1
                    elif result.status == AlertStatus.COOLDOWN:
                        summary.skipped_cooldown += 1
                    elif result.status == AlertStatus.NO_MATCH:
                        summary.no_match += 1
                    elif result.status == AlertStatus.NO_DATA:
                        summary.no_data += 1

                    summary.details.append(result.to_dict())

            except Exception as e:
                logger.error(f"Alert evaluation failed for {alert_config.id}: {e}", exc_info=True)
                summary.errors += 1
                summary.details.append({
                    "alert_id": alert_config.id,
                    "status": AlertStatus.ERROR.value,
                    "error": str(e)
                })

        summary.duration_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        return summary

    async def evaluate_alerts_for_org(
        self,
        org_slug: str,
        alert_ids: Optional[List[str]] = None,
        force_check: bool = False
    ) -> EvaluationSummary:
        """
        Evaluate alerts for a specific organization.

        CRITICAL-003 FIX: Org-isolated alert evaluation for multi-tenant security.

        Args:
            org_slug: Organization slug to evaluate alerts for
            alert_ids: Optional list of specific alert IDs to evaluate
            force_check: If True, ignore cooldown periods

        Returns:
            EvaluationSummary with results for this org only
        """
        start_time = datetime.now(timezone.utc)
        summary = EvaluationSummary()

        # Load all alert configurations
        alerts = self.config_loader.load_all_alerts()

        # Filter to specific alerts if provided
        if alert_ids:
            alerts = [a for a in alerts if a.id in alert_ids]

        for alert_config in alerts:
            try:
                if not alert_config.enabled:
                    summary.skipped_disabled += 1
                    continue

                # Evaluate this alert for specific org only
                alert_results = await self.evaluate_alert_for_org(
                    alert_config, org_slug, force_check
                )

                for result in alert_results:
                    if result.status == AlertStatus.TRIGGERED:
                        summary.triggered += 1
                    elif result.status == AlertStatus.COOLDOWN:
                        summary.skipped_cooldown += 1
                    elif result.status == AlertStatus.NO_MATCH:
                        summary.no_match += 1
                    elif result.status == AlertStatus.NO_DATA:
                        summary.no_data += 1

                    summary.details.append(result.to_dict())

            except Exception as e:
                logger.error(f"Alert evaluation failed for {alert_config.id} (org: {org_slug}): {e}", exc_info=True)
                summary.errors += 1
                summary.details.append({
                    "alert_id": alert_config.id,
                    "org_slug": org_slug,
                    "status": AlertStatus.ERROR.value,
                    "error": str(e)
                })

        summary.duration_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        return summary

    async def evaluate_alert_for_org(
        self,
        alert_config: AlertConfig,
        org_slug: str,
        force_check: bool = False
    ) -> List[AlertResult]:
        """
        Evaluate a single alert for a specific organization.

        CRITICAL-003 FIX: Isolates data and recipients to specific org.
        """
        results = []

        # Step 1: Execute query for this org only
        try:
            # Add org filter to params
            params = alert_config.source.params.copy() if alert_config.source.params else {}
            params["org_slug"] = org_slug

            query_results = await self.query_executor.execute(
                alert_config.source.query_template,
                params,
                org_filter=org_slug  # Enforce org isolation at query level
            )
        except Exception as e:
            logger.error(f"Query execution failed for alert {alert_config.id} (org: {org_slug}): {e}")
            return [AlertResult(
                alert_id=alert_config.id,
                org_slug=org_slug,
                status=AlertStatus.ERROR,
                message=f"Query execution failed: {e}"
            )]

        # Filter results to this org only
        org_data = [r for r in query_results if r.get("org_slug") == org_slug]

        if not org_data:
            return [AlertResult(
                alert_id=alert_config.id,
                org_slug=org_slug,
                status=AlertStatus.NO_DATA,
                message=f"No data found for organization"
            )]

        # Process the org's data
        for data in org_data:
            result = await self._evaluate_single_org(
                alert_config, org_slug, data, force_check
            )
            results.append(result)

        return results

    async def _evaluate_single_org(
        self,
        alert_config: AlertConfig,
        org_slug: str,
        org_data: Dict[str, Any],
        force_check: bool = False
    ) -> AlertResult:
        """
        Evaluate alert conditions for a single org's data.

        CRITICAL-003 FIX: Reusable method for org-isolated evaluation.
        """
        # Check cooldown
        if not force_check and alert_config.cooldown.enabled:
            if await self._is_in_cooldown(alert_config.id, org_slug, alert_config.cooldown.hours):
                return AlertResult(
                    alert_id=alert_config.id,
                    org_slug=org_slug,
                    status=AlertStatus.COOLDOWN,
                    message=f"Cooldown active ({alert_config.cooldown.hours}h)"
                )

        # Convert conditions to dict format for evaluator
        conditions = [c.model_dump() for c in alert_config.conditions]

        # Evaluate conditions
        eval_result = self.condition_evaluator.evaluate(org_data, conditions)

        if not eval_result.triggered:
            return AlertResult(
                alert_id=alert_config.id,
                org_slug=org_slug,
                status=AlertStatus.NO_MATCH,
                data=org_data,
                message=f"Conditions not met: {eval_result.conditions_failed}"
            )

        # Resolve recipients
        recipient_config = alert_config.recipients.model_dump()
        recipients = await self.recipient_resolver.resolve(org_slug, recipient_config)

        if not recipients:
            return AlertResult(
                alert_id=alert_config.id,
                org_slug=org_slug,
                status=AlertStatus.NO_RECIPIENTS,
                data=org_data,
                message="No recipients resolved"
            )

        # Send notification
        send_success = await self._send_alert(
            alert_config,
            org_slug,
            org_data,
            recipients,
            eval_result
        )

        # Record history
        await self._record_history(
            alert_config,
            org_slug,
            org_data,
            recipients,
            send_success
        )

        return AlertResult(
            alert_id=alert_config.id,
            org_slug=org_slug,
            status=AlertStatus.TRIGGERED if send_success else AlertStatus.SEND_FAILED,
            data=org_data,
            recipients=recipients,
            recipient_count=len(recipients),
            message=f"Alert sent to {len(recipients)} recipients" if send_success else "Send failed"
        )

    async def evaluate_alert(
        self,
        alert_config: AlertConfig,
        force_check: bool = False
    ) -> List[AlertResult]:
        """
        Evaluate a single alert configuration.

        Returns one result per org that triggers the alert.
        """
        results = []

        # Step 1: Execute query to get data for all orgs
        try:
            query_results = await self.query_executor.execute(
                alert_config.source.query_template,
                alert_config.source.params
            )
        except Exception as e:
            logger.error(f"Query execution failed for alert {alert_config.id}: {e}")
            return [AlertResult(
                alert_id=alert_config.id,
                org_slug="*",
                status=AlertStatus.ERROR,
                message=f"Query execution failed: {e}"
            )]

        if not query_results:
            return [AlertResult(
                alert_id=alert_config.id,
                org_slug="*",
                status=AlertStatus.NO_DATA,
                message="No data returned from query"
            )]

        # Step 2: Evaluate conditions for each org's data
        for org_data in query_results:
            org_slug = org_data.get("org_slug")

            if not org_slug:
                continue

            # Check cooldown
            if not force_check and alert_config.cooldown.enabled:
                if await self._is_in_cooldown(alert_config.id, org_slug, alert_config.cooldown.hours):
                    results.append(AlertResult(
                        alert_id=alert_config.id,
                        org_slug=org_slug,
                        status=AlertStatus.COOLDOWN,
                        message=f"Cooldown active ({alert_config.cooldown.hours}h)"
                    ))
                    continue

            # Convert conditions to dict format for evaluator
            conditions = [c.model_dump() for c in alert_config.conditions]

            # Evaluate conditions
            eval_result = self.condition_evaluator.evaluate(org_data, conditions)

            if not eval_result.triggered:
                results.append(AlertResult(
                    alert_id=alert_config.id,
                    org_slug=org_slug,
                    status=AlertStatus.NO_MATCH,
                    data=org_data,
                    message=f"Conditions not met: {eval_result.conditions_failed}"
                ))
                continue

            # Step 3: Resolve recipients
            recipient_config = alert_config.recipients.model_dump()
            recipients = await self.recipient_resolver.resolve(org_slug, recipient_config)

            if not recipients:
                results.append(AlertResult(
                    alert_id=alert_config.id,
                    org_slug=org_slug,
                    status=AlertStatus.NO_RECIPIENTS,
                    data=org_data,
                    message="No recipients resolved"
                ))
                continue

            # Step 4: Send notification
            send_success = await self._send_alert(
                alert_config,
                org_slug,
                org_data,
                recipients,
                eval_result
            )

            # Step 5: Record history
            await self._record_history(
                alert_config,
                org_slug,
                org_data,
                recipients,
                send_success
            )

            results.append(AlertResult(
                alert_id=alert_config.id,
                org_slug=org_slug,
                status=AlertStatus.TRIGGERED if send_success else AlertStatus.SEND_FAILED,
                data=org_data,
                recipients=recipients,
                recipient_count=len(recipients),
                message=f"Alert sent to {len(recipients)} recipients" if send_success else "Send failed"
            ))

        return results

    async def _is_in_cooldown(
        self,
        alert_id: str,
        org_slug: str,
        cooldown_hours: int
    ) -> bool:
        """
        Check if org is in cooldown period for this alert.

        Args:
            alert_id: Alert configuration ID
            org_slug: Organization slug
            cooldown_hours: Cooldown period in hours

        Returns:
            True if in cooldown period
        """
        try:
            from google.cloud import bigquery
            from src.app.config import settings

            if self._bq_client is None:
                from src.core.engine.bq_client import get_bigquery_client
                self._bq_client = get_bigquery_client()

            query = f"""
            SELECT 1
            FROM `{settings.gcp_project_id}.organizations.org_alert_history`
            WHERE alert_id = @alert_id
              AND org_slug = @org_slug
              AND status = 'SENT'
              AND created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @cooldown_hours HOUR)
            LIMIT 1
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("alert_id", "STRING", alert_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("cooldown_hours", "INT64", cooldown_hours),
                ]
            )

            job = self._bq_client.client.query(query, job_config=job_config)
            rows = list(job.result())
            return len(rows) > 0

        except Exception as e:
            # If table doesn't exist or query fails, assume no cooldown
            logger.debug(f"Cooldown check failed (ignoring): {e}")
            return False

    async def _send_alert(
        self,
        alert_config: AlertConfig,
        org_slug: str,
        data: Dict[str, Any],
        recipients: List[str],
        eval_result
    ) -> bool:
        """
        Send alert notification to recipients via configured channels.

        Uses the unified AlertNotificationSender for all channels.
        """
        try:
            from src.core.notifications.alert_sender import get_alert_sender, AlertNotificationData

            sender = get_alert_sender()

            # Extract cost data
            total_cost = data.get("total_cost", 0)
            currency = data.get("currency", "USD")
            threshold = alert_config.conditions[0].value if alert_config.conditions else 0

            # Get Slack config if present
            slack_channel = None
            slack_webhook_url = None
            slack_mention_channel = False
            slack_mention_users = []

            if alert_config.notification.slack:
                slack_channel = alert_config.notification.slack.channel
                slack_webhook_url = alert_config.notification.slack.webhook_url
                slack_mention_channel = alert_config.notification.slack.mention_channel
                slack_mention_users = alert_config.notification.slack.mention_users or []

            # Build notification data
            notification_data = AlertNotificationData(
                alert_id=alert_config.id,
                alert_name=alert_config.name,
                org_slug=org_slug,
                severity=alert_config.notification.severity.value,
                description=alert_config.description,
                total_cost=total_cost,
                threshold=threshold,
                currency=currency,
                recipients=recipients,
                channels=alert_config.notification.channels,
                slack_channel=slack_channel,
                slack_webhook_url=slack_webhook_url,
                slack_mention_channel=slack_mention_channel,
                slack_mention_users=slack_mention_users,
            )

            # Send via unified sender
            results = await sender.send(notification_data)

            # Check if at least one channel succeeded
            success_count = sum(1 for v in results.values() if v)
            logger.info(
                f"Alert {alert_config.id} sent: {success_count}/{len(results)} channels "
                f"for org {org_slug}"
            )

            return success_count > 0

        except Exception as e:
            logger.error(f"Failed to send alert: {e}", exc_info=True)
            return False

    async def _send_email_directly(
        self,
        recipients: List[str],
        subject: str,
        body: str,
        org_slug: str,
        alert_config: AlertConfig,
        data: Dict[str, Any]
    ):
        """
        Send email directly using the email notification provider.

        Args:
            recipients: List of email addresses
            subject: Email subject
            body: Email body (HTML)
            org_slug: Organization slug
            alert_config: Alert configuration
            data: Alert data for template
        """
        from src.core.notifications.providers.email import EmailNotificationProvider
        from src.core.notifications.config import (
            NotificationConfig,
            EmailConfig,
            NotificationMessage,
            NotificationEvent,
            NotificationSeverity,
        )
        import os

        # Build email config from environment
        email_config = EmailConfig(
            enabled=True,
            smtp_host=os.environ.get("EMAIL_SMTP_HOST", os.environ.get("SMTP_HOST", "smtp.gmail.com")),
            smtp_port=int(os.environ.get("EMAIL_SMTP_PORT", os.environ.get("SMTP_PORT", "587"))),
            smtp_username=os.environ.get("EMAIL_SMTP_USERNAME", os.environ.get("SMTP_USERNAME")),
            smtp_password=os.environ.get("EMAIL_SMTP_PASSWORD", os.environ.get("SMTP_PASSWORD")),
            from_email=os.environ.get("EMAIL_FROM_ADDRESS", "alerts@cloudact.ai"),
            to_emails=recipients,
        )

        # Create notification config with email settings
        config = NotificationConfig(
            enabled=True,
            email=email_config,
        )

        # Create email provider
        provider = EmailNotificationProvider(config)

        # Create message with alert details
        severity_map = {
            "info": NotificationSeverity.INFO,
            "warning": NotificationSeverity.WARNING,
            "critical": NotificationSeverity.ERROR,
        }

        message = NotificationMessage(
            event=NotificationEvent.PIPELINE_SUCCESS,  # Using existing event type
            severity=severity_map.get(alert_config.notification.severity.value, NotificationSeverity.WARNING),
            org_slug=org_slug,
            title=subject,
            message=body,
            details={
                "alert_id": alert_config.id,
                "alert_name": alert_config.name,
                "total_cost": data.get("total_cost"),
                "currency": data.get("currency", "USD"),
                "threshold": alert_config.conditions[0].value if alert_config.conditions else None,
            },
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        # Send email
        await provider.send(message)

    async def _send_slack_directly(
        self,
        org_slug: str,
        alert_config: AlertConfig,
        data: Dict[str, Any],
        eval_result
    ):
        """
        Send Slack notification directly using the Slack provider.

        Args:
            org_slug: Organization slug
            alert_config: Alert configuration
            data: Alert data
            eval_result: Condition evaluation result
        """
        from src.core.notifications.providers.slack import SlackNotificationProvider
        from src.core.notifications.config import (
            NotificationConfig as NotifConfig,
            SlackConfig,
            NotificationMessage,
            NotificationEvent,
            NotificationSeverity,
        )
        import os

        # Get webhook URL from alert config or environment
        webhook_url = None
        slack_channel = None
        mention_channel = False
        mention_users = None

        if alert_config.notification.slack:
            webhook_url = alert_config.notification.slack.webhook_url
            slack_channel = alert_config.notification.slack.channel
            mention_channel = alert_config.notification.slack.mention_channel
            mention_users = alert_config.notification.slack.mention_users

        # Fall back to environment variable
        if not webhook_url:
            webhook_url = os.environ.get("SLACK_WEBHOOK_URL")

        if not webhook_url:
            logger.warning("No Slack webhook URL configured, skipping Slack notification")
            return

        # Build Slack config
        slack_config = SlackConfig(
            enabled=True,
            webhook_url=webhook_url,
            channel=slack_channel,
            username="CloudAct Alerts",
            icon_emoji=":bell:",
            mention_channel=mention_channel,
            mention_users=mention_users
        )

        # Create notification config with Slack settings
        config = NotifConfig(
            enabled=True,
            slack=slack_config,
        )

        # Create Slack provider
        provider = SlackNotificationProvider(config)

        # Map severity
        severity_map = {
            "info": NotificationSeverity.INFO,
            "warning": NotificationSeverity.WARNING,
            "critical": NotificationSeverity.CRITICAL,
        }

        # Format cost data
        total_cost = data.get("total_cost", 0)
        currency = data.get("currency", "USD")
        threshold = alert_config.conditions[0].value if alert_config.conditions else 0

        if currency == "USD":
            cost_formatted = f"${total_cost:,.2f}"
            threshold_formatted = f"${threshold:,.2f}"
        else:
            cost_formatted = f"{total_cost:,.2f} {currency}"
            threshold_formatted = f"{threshold:,.2f} {currency}"

        # Create message
        message = NotificationMessage(
            event=NotificationEvent.PIPELINE_WARNING,
            severity=severity_map.get(alert_config.notification.severity.value, NotificationSeverity.WARNING),
            org_slug=org_slug,
            title=f"{alert_config.name}",
            message=f"Total cost {cost_formatted} exceeds threshold {threshold_formatted}",
            details={
                "Alert ID": alert_config.id,
                "Organization": org_slug,
                "Total Cost": cost_formatted,
                "Threshold": threshold_formatted,
                "Currency": currency,
            },
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        # Send Slack notification
        await provider.send(message)

    async def _record_history(
        self,
        alert_config: AlertConfig,
        org_slug: str,
        data: Dict[str, Any],
        recipients: List[str],
        success: bool
    ):
        """
        Record alert in history table for audit and cooldown.
        """
        try:
            from google.cloud import bigquery
            from src.app.config import settings

            if self._bq_client is None:
                from src.core.engine.bq_client import get_bigquery_client
                self._bq_client = get_bigquery_client()

            history_entry = AlertHistoryEntry(
                alert_history_id=str(uuid.uuid4()),
                alert_id=alert_config.id,
                org_slug=org_slug,
                status="SENT" if success else "FAILED",
                severity=alert_config.notification.severity.value,
                trigger_data=json.dumps(data),
                recipients=recipients,
                recipient_count=len(recipients),
                sent_at=datetime.now(timezone.utc) if success else None,
            )

            # Insert into BigQuery
            table_id = f"{settings.gcp_project_id}.organizations.org_alert_history"
            rows = [history_entry.model_dump()]

            # Convert datetime to ISO string for BigQuery
            for row in rows:
                if row.get("sent_at"):
                    row["sent_at"] = row["sent_at"].isoformat()
                row["created_at"] = row["created_at"].isoformat()

            errors = self._bq_client.client.insert_rows_json(table_id, rows)
            if errors:
                logger.error(f"Failed to insert alert history: {errors}")

        except Exception as e:
            # Don't fail the alert if history recording fails
            logger.warning(f"Failed to record alert history: {e}")

    def _format_title(self, config: AlertConfig, data: Dict) -> str:
        """Format alert title with data."""
        severity_emoji = {
            "info": "",
            "warning": "",
            "critical": "",
        }
        emoji = severity_emoji.get(config.notification.severity.value, "")
        return f"[CloudAct.AI] {emoji} {config.name}"

    def _format_message(
        self,
        config: AlertConfig,
        data: Dict,
        eval_result
    ) -> str:
        """Format alert message body as HTML."""
        total_cost = data.get("total_cost", 0)
        currency = data.get("currency", "USD")
        threshold = config.conditions[0].value if config.conditions else 0
        org_slug = data.get("org_slug", "")

        # Format currency
        if currency == "USD":
            cost_formatted = f"${total_cost:,.2f}"
            threshold_formatted = f"${threshold:,.2f}"
        else:
            cost_formatted = f"{total_cost:,.2f} {currency}"
            threshold_formatted = f"{threshold:,.2f} {currency}"

        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #FF6C5E 0%, #FF8570 100%); padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 20px;">{config.name}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">
                    {config.notification.severity.value.upper()} ALERT
                </p>
            </div>

            <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e9ecef;">
                <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #FF6C5E;">
                    <p style="color: #6c757d; font-size: 14px; margin: 0 0 4px 0;">Total Cost (This Month)</p>
                    <p style="font-size: 32px; font-weight: 700; color: #1a1a1a; margin: 0;">{cost_formatted}</p>
                </div>

                <div style="background: #fff3cd; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="margin: 0; color: #856404;">
                        <strong>Threshold exceeded:</strong> {threshold_formatted}
                    </p>
                </div>

                <p style="color: #3f3f46; line-height: 1.6;">
                    {config.description or f"Your subscription costs have exceeded the configured threshold."}
                </p>

                <div style="text-align: center; margin: 24px 0;">
                    <a href="https://cloudact.ai/{org_slug}/cost-dashboards/subscription-costs"
                       style="display: inline-block; background: #90FCA6; color: #0a0a0b; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                        View Subscription Costs
                    </a>
                </div>
            </div>

            <div style="text-align: center; padding: 16px; color: #6c757d; font-size: 12px;">
                <p style="margin: 0;">CloudAct.AI - Cloud Cost Analytics</p>
                <p style="margin: 4px 0 0 0;">&copy; 2026 CloudAct Inc. All rights reserved.</p>
            </div>
        </div>
        """
        return html


# ============================================
# Singleton Pattern
# ============================================

_alert_engine: Optional[AlertEngine] = None
_engine_lock = threading.Lock()


def get_alert_engine(config_path: Optional[Path] = None) -> AlertEngine:
    """
    Get global alert engine instance.

    Thread-safe singleton initialization.

    Args:
        config_path: Optional base path for configurations

    Returns:
        AlertEngine instance
    """
    global _alert_engine

    if _alert_engine is None:
        with _engine_lock:
            if _alert_engine is None:
                _alert_engine = AlertEngine(config_path)

    return _alert_engine
