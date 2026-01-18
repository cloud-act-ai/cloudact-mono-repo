"""
Alert Notification Sender

Enterprise-grade alert notification helper with:
- XSS protection in HTML templates
- Multi-tenant isolation
- Multiple channel support
"""

import logging
import threading
from html import escape as html_escape
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, field

from .registry import (
    get_notification_registry,
    NotificationPayload,
    ProviderType,
    SlackProviderConfig,
    WebhookProviderConfig,
)

logger = logging.getLogger(__name__)


# ============================================
# Alert Notification Data
# ============================================

@dataclass
class AlertNotificationData:
    """
    Data structure for alert notifications.

    Provides all the context needed to send an alert through any channel.
    """
    # Alert identification
    alert_id: str
    alert_name: str
    org_slug: str

    # Alert content
    severity: str = "warning"  # info, warning, critical
    description: Optional[str] = None

    # Cost data
    total_cost: float = 0.0
    threshold: float = 0.0
    currency: str = "USD"
    period: str = "current_month"

    # Recipients (for email)
    recipients: List[str] = field(default_factory=list)

    # Channel configuration
    channels: List[str] = field(default_factory=lambda: ["email"])

    # Slack-specific overrides
    slack_channel: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    slack_mention_channel: bool = False
    slack_mention_users: List[str] = field(default_factory=list)

    # Webhook-specific overrides
    webhook_url: Optional[str] = None
    webhook_headers: Dict[str, str] = field(default_factory=dict)

    # Additional data
    extra_data: Dict[str, Any] = field(default_factory=dict)


# ============================================
# Alert Notification Sender
# ============================================

class AlertNotificationSender:
    """
    Sends alert notifications through the unified provider registry.

    Provides convenience methods for common alert patterns:
    - Cost threshold alerts
    - Quota alerts
    - Anomaly alerts

    Usage:
        sender = AlertNotificationSender()

        # Send cost threshold alert
        result = await sender.send_cost_alert(
            alert_id="subscription_cost_threshold_20",
            alert_name="Subscription Cost Alert",
            org_slug="acme_corp",
            severity="warning",
            total_cost=25.50,
            threshold=20.0,
            recipients=["user@example.com"],
            channels=["email", "slack"],
        )
    """

    def __init__(self):
        self._registry = get_notification_registry()

    async def send(self, data: AlertNotificationData) -> Dict[str, bool]:
        """
        Send alert notification to all configured channels.

        Args:
            data: Alert notification data

        Returns:
            Dict mapping channel name to success status
        """
        # Build notification payload
        payload = self._build_payload(data)

        # Configure Slack if specified (MT-FIX: org-specific config)
        if "slack" in data.channels and data.slack_webhook_url:
            slack_config = SlackProviderConfig(
                enabled=True,
                webhook_url=data.slack_webhook_url,
                channel=data.slack_channel,
                mention_channel=data.slack_mention_channel,
                mention_users=data.slack_mention_users,
            )
            self._registry.set_config(
                ProviderType.SLACK, slack_config, org_slug=data.org_slug
            )

        # Configure Webhook if specified (MT-FIX: org-specific config)
        if "webhook" in data.channels and data.webhook_url:
            webhook_config = WebhookProviderConfig(
                enabled=True,
                url=data.webhook_url,
                headers=data.webhook_headers,
            )
            self._registry.set_config(
                ProviderType.WEBHOOK, webhook_config, org_slug=data.org_slug
            )

        # Send to all channels (MT-FIX: use org_slug for multi-tenant isolation)
        results = await self._registry.send_to_channels(
            payload, data.channels, org_slug=data.org_slug
        )

        # Log results
        success_count = sum(1 for v in results.values() if v)
        total_count = len(results)
        logger.info(
            f"Alert {data.alert_id} sent: {success_count}/{total_count} channels succeeded"
        )

        return results

    async def send_cost_alert(
        self,
        alert_id: str,
        alert_name: str,
        org_slug: str,
        severity: str,
        total_cost: float,
        threshold: float,
        recipients: List[str],
        channels: Optional[List[str]] = None,
        currency: str = "USD",
        description: Optional[str] = None,
        slack_channel: Optional[str] = None,
        slack_webhook_url: Optional[str] = None,
        **kwargs
    ) -> Dict[str, bool]:
        """
        Send a cost threshold alert.

        Convenience method for the most common alert type.
        """
        data = AlertNotificationData(
            alert_id=alert_id,
            alert_name=alert_name,
            org_slug=org_slug,
            severity=severity,
            description=description or f"Cost threshold exceeded: {self._format_currency(total_cost, currency)} > {self._format_currency(threshold, currency)}",
            total_cost=total_cost,
            threshold=threshold,
            currency=currency,
            recipients=recipients,
            channels=channels or ["email"],
            slack_channel=slack_channel,
            slack_webhook_url=slack_webhook_url,
            **kwargs
        )

        return await self.send(data)

    async def send_quota_alert(
        self,
        org_slug: str,
        quota_type: str,
        current_usage: float,
        limit: float,
        recipients: List[str],
        channels: Optional[List[str]] = None,
        severity: str = "warning",
        **kwargs
    ) -> Dict[str, bool]:
        """
        Send a quota usage alert.
        """
        percentage = (current_usage / limit * 100) if limit > 0 else 0

        data = AlertNotificationData(
            alert_id=f"quota_{quota_type}",
            alert_name=f"Quota Alert: {quota_type.replace('_', ' ').title()}",
            org_slug=org_slug,
            severity=severity,
            description=f"Usage at {percentage:.1f}% ({current_usage:.0f}/{limit:.0f})",
            total_cost=current_usage,
            threshold=limit,
            recipients=recipients,
            channels=channels or ["email"],
            extra_data={
                "quota_type": quota_type,
                "usage_percentage": percentage,
            },
            **kwargs
        )

        return await self.send(data)

    async def send_anomaly_alert(
        self,
        org_slug: str,
        metric_name: str,
        current_value: float,
        expected_value: float,
        deviation_percent: float,
        recipients: List[str],
        channels: Optional[List[str]] = None,
        severity: str = "warning",
        **kwargs
    ) -> Dict[str, bool]:
        """
        Send an anomaly detection alert.
        """
        data = AlertNotificationData(
            alert_id=f"anomaly_{metric_name.lower().replace(' ', '_')}",
            alert_name=f"Anomaly Detected: {metric_name}",
            org_slug=org_slug,
            severity=severity,
            description=f"{metric_name} deviated {deviation_percent:+.1f}% from expected",
            total_cost=current_value,
            threshold=expected_value,
            recipients=recipients,
            channels=channels or ["email"],
            extra_data={
                "metric_name": metric_name,
                "deviation_percent": deviation_percent,
                "direction": "increase" if current_value > expected_value else "decrease",
            },
            **kwargs
        )

        return await self.send(data)

    def _build_payload(self, data: AlertNotificationData) -> NotificationPayload:
        """Build NotificationPayload from AlertNotificationData."""
        # Format cost strings
        cost_formatted = self._format_currency(data.total_cost, data.currency)
        threshold_formatted = self._format_currency(data.threshold, data.currency)

        # Build title
        severity_emoji = {"info": "", "warning": "", "critical": ""}
        emoji = severity_emoji.get(data.severity, "")
        title = f"{emoji} {data.alert_name}".strip()

        # Build message
        message = data.description or f"Alert triggered for organization {data.org_slug}"

        # Build data dict
        payload_data = {
            "Alert ID": data.alert_id,
            "Organization": data.org_slug,
            "Total Cost": cost_formatted,
            "Threshold": threshold_formatted,
            "Period": data.period.replace("_", " ").title(),
        }
        payload_data.update(data.extra_data)

        # Build HTML body for email
        html_body = self._build_html_body(data, cost_formatted, threshold_formatted)

        return NotificationPayload(
            title=title,
            message=message,
            severity=data.severity,
            org_slug=data.org_slug,
            alert_id=data.alert_id,
            alert_name=data.alert_name,
            recipients=data.recipients,
            data=payload_data,
            html_body=html_body,
            slack_channel=data.slack_channel,
            slack_mention_channel=data.slack_mention_channel,
            slack_mention_users=data.slack_mention_users,
            webhook_url=data.webhook_url,
            webhook_headers=data.webhook_headers,
        )

    def _build_html_body(
        self,
        data: AlertNotificationData,
        cost_formatted: str,
        threshold_formatted: str
    ) -> str:
        """Build HTML email body for cost alerts with XSS protection."""
        severity_colors = {
            "info": "#36a64f",
            "warning": "#FF6C5E",
            "critical": "#dc2626",
        }
        color = severity_colors.get(data.severity, "#FF6C5E")

        # BUG-008 FIX: Escape all user-provided content to prevent XSS
        safe_alert_name = html_escape(data.alert_name)
        safe_severity = html_escape(data.severity.upper())
        safe_description = html_escape(data.description or 'Your costs have exceeded the configured threshold.')
        safe_org_slug = html_escape(data.org_slug)
        safe_alert_id = html_escape(data.alert_id)
        safe_currency = html_escape(data.currency)
        safe_period = html_escape(data.period.replace('_', ' ').title())
        safe_cost = html_escape(cost_formatted)
        safe_threshold = html_escape(threshold_formatted)

        return f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 0;">
              <div style="background: linear-gradient(135deg, {color} 0%, {color}cc 100%); padding: 24px 40px; border-radius: 12px 12px 0 0;">
                <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.9);">
                  {safe_severity} ALERT
                </p>
                <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #ffffff;">
                  {safe_alert_name}
                </h1>
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <!-- Cost Card -->
              <div style="background: #f8f9fa; padding: 24px; border-radius: 12px; margin-bottom: 24px; border-left: 4px solid {color};">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Total Cost ({safe_period})</p>
                <p style="margin: 0; font-size: 36px; font-weight: 700; color: #18181b;">{safe_cost}</p>
              </div>

              <!-- Threshold Warning -->
              <div style="margin: 0 0 24px 0; padding: 16px; background-color: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  <strong>Threshold exceeded:</strong> {safe_threshold}
                </p>
              </div>

              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                {safe_description}
              </p>

              <p style="margin: 0 0 24px 0; font-size: 14px; color: #71717a;">
                Organization: <strong style="color: #18181b;">{safe_org_slug}</strong>
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="https://cloudact.ai/{safe_org_slug}/cost-dashboards/subscription-costs"
                       style="display: inline-block; padding: 14px 32px; background-color: #90FCA6; color: #000000; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      View Cost Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Alert Details -->
              <div style="margin: 24px 0; padding: 16px; background-color: #f4f4f5; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a; text-transform: uppercase;">Alert Details</p>
                <table style="width: 100%; font-size: 14px; color: #3f3f46;">
                  <tr>
                    <td style="padding: 4px 0;">Alert ID:</td>
                    <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #71717a;">{safe_alert_id}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">Currency:</td>
                    <td style="padding: 4px 0; text-align: right;">{safe_currency}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #71717a; text-align: center;">
                CloudAct.AI - Cloud Cost Analytics<br>
                &copy; {datetime.now().year} CloudAct Inc.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        """

    def _format_currency(self, amount: float, currency: str) -> str:
        """Format currency amount."""
        if currency == "USD":
            return f"${amount:,.2f}"
        else:
            return f"{amount:,.2f} {currency}"


# ============================================
# Global Instance (Thread-Safe Singleton)
# ============================================

_sender: Optional[AlertNotificationSender] = None
_sender_lock = threading.Lock()  # BUG-004 FIX: Thread-safe singleton


def get_alert_sender() -> AlertNotificationSender:
    """Get the global alert notification sender (thread-safe)."""
    global _sender
    if _sender is None:
        with _sender_lock:
            # Double-check inside lock
            if _sender is None:
                _sender = AlertNotificationSender()
    return _sender


def reset_alert_sender():
    """
    Reset the global alert sender (for testing).

    BUG-005 FIX: Provide reset mechanism for test isolation.
    """
    global _sender
    with _sender_lock:
        _sender = None
