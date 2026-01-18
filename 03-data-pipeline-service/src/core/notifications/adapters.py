"""
Notification Provider Adapters

Adapter implementations that wrap the existing providers
with the unified NotificationProviderInterface.
"""

import aiohttp
import asyncio
import smtplib
import ssl
import json
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import partial
from typing import Dict, Any, Optional, List
from datetime import datetime

from .registry import (
    NotificationProviderInterface,
    NotificationPayload,
    ProviderType,
    BaseProviderConfig,
    EmailProviderConfig,
    SlackProviderConfig,
    WebhookProviderConfig,
)

logger = logging.getLogger(__name__)


# ============================================
# Email Adapter
# ============================================

class EmailNotificationAdapter(NotificationProviderInterface):
    """
    Email notification provider adapter.

    Wraps SMTP operations with the unified interface.
    """

    def __init__(self, config: Optional[BaseProviderConfig] = None):
        self._config: EmailProviderConfig = config or EmailProviderConfig.from_env()

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.EMAIL

    @property
    def is_configured(self) -> bool:
        return bool(
            self._config.enabled
            and self._config.smtp_host
            and self._config.from_email
        )

    async def send(self, payload: NotificationPayload) -> bool:
        """Send email notification."""
        if not self.is_configured:
            logger.warning("Email provider not configured")
            return False

        if not payload.recipients:
            logger.warning("No recipients specified for email")
            return False

        try:
            # Build message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"{self._config.subject_prefix} {payload.title}"
            msg["From"] = f"{self._config.from_name} <{self._config.from_email}>"
            msg["To"] = ", ".join(payload.recipients)

            # Attach text body
            text_body = payload.text_body or self._build_text_body(payload)
            msg.attach(MIMEText(text_body, "plain"))

            # Attach HTML body
            html_body = payload.html_body or self._build_html_body(payload)
            msg.attach(MIMEText(html_body, "html"))

            # Send via SMTP in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                partial(self._send_smtp_sync, msg, payload.recipients)
            )

            logger.info(f"Email sent to {len(payload.recipients)} recipients")
            return True

        except Exception as e:
            logger.error(f"Email send failed: {e}", exc_info=True)
            return False

    def _send_smtp_sync(self, msg: MIMEMultipart, recipients: List[str]):
        """Synchronous SMTP send."""
        if self._config.smtp_use_tls:
            context = ssl.create_default_context()
            with smtplib.SMTP(
                self._config.smtp_host,
                self._config.smtp_port,
                timeout=self._config.timeout_seconds
            ) as server:
                server.starttls(context=context)
                if self._config.smtp_username and self._config.smtp_password:
                    server.login(self._config.smtp_username, self._config.smtp_password)
                server.send_message(msg, to_addrs=recipients)
        else:
            with smtplib.SMTP(
                self._config.smtp_host,
                self._config.smtp_port,
                timeout=self._config.timeout_seconds
            ) as server:
                if self._config.smtp_username and self._config.smtp_password:
                    server.login(self._config.smtp_username, self._config.smtp_password)
                server.send_message(msg, to_addrs=recipients)

    def _build_text_body(self, payload: NotificationPayload) -> str:
        """Build plain text email body."""
        lines = [
            f"{payload.severity.upper()}: {payload.title}",
            "=" * 60,
            "",
            payload.message,
            "",
        ]

        if payload.org_slug:
            lines.append(f"Organization: {payload.org_slug}")
        if payload.alert_id:
            lines.append(f"Alert ID: {payload.alert_id}")

        if payload.data:
            lines.extend(["", "Details:", "-" * 40])
            for key, value in payload.data.items():
                lines.append(f"  {key}: {value}")

        lines.extend([
            "",
            "=" * 60,
            "CloudAct.AI - Cloud Cost Analytics",
            f"(c) {datetime.now().year} CloudAct Inc.",
        ])

        return "\n".join(lines)

    def _build_html_body(self, payload: NotificationPayload) -> str:
        """Build HTML email body."""
        severity_colors = {
            "info": "#36a64f",
            "warning": "#ff9900",
            "error": "#ff0000",
            "critical": "#8b0000",
        }
        color = severity_colors.get(payload.severity, "#808080")

        data_rows = ""
        if payload.data:
            for key, value in payload.data.items():
                data_rows += f"""
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">{key}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">{value}</td>
                </tr>
                """

        return f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, {color} 0%, {color}cc 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">{payload.title}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">
            {payload.severity.upper()} ALERT
        </p>
    </div>
    <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e9ecef; border-top: none;">
        <p style="color: #3f3f46; line-height: 1.6; margin: 0 0 16px 0;">
            {payload.message}
        </p>
        {f'''
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            {data_rows}
        </table>
        ''' if data_rows else ''}
        {f'''
        <p style="color: #71717a; font-size: 12px; margin: 16px 0 0 0;">
            Organization: <strong>{payload.org_slug}</strong>
        </p>
        ''' if payload.org_slug else ''}
    </div>
    <div style="text-align: center; padding: 16px; color: #6c757d; font-size: 12px;">
        <p style="margin: 0;">CloudAct.AI - Cloud Cost Analytics</p>
        <p style="margin: 4px 0 0 0;">&copy; {datetime.now().year} CloudAct Inc.</p>
    </div>
</body>
</html>
        """

    async def validate_config(self) -> Dict[str, Any]:
        """Validate email configuration."""
        issues = []

        if not self._config.smtp_host:
            issues.append("SMTP host not configured")
        if not self._config.from_email:
            issues.append("From email not configured")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "config": {
                "smtp_host": self._config.smtp_host,
                "smtp_port": self._config.smtp_port,
                "from_email": self._config.from_email,
                "tls_enabled": self._config.smtp_use_tls,
            }
        }


# ============================================
# Slack Adapter
# ============================================

class SlackNotificationAdapter(NotificationProviderInterface):
    """
    Slack notification provider adapter.

    Uses Slack Incoming Webhooks for delivery.
    """

    def __init__(self, config: Optional[BaseProviderConfig] = None):
        self._config: SlackProviderConfig = config or SlackProviderConfig.from_env()

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.SLACK

    @property
    def is_configured(self) -> bool:
        return bool(self._config.enabled and self._config.webhook_url)

    async def send(self, payload: NotificationPayload) -> bool:
        """Send Slack notification."""
        webhook_url = payload.webhook_url or self._config.webhook_url

        if not webhook_url:
            logger.warning("Slack webhook URL not configured")
            return False

        try:
            # Build Slack message
            slack_payload = self._build_slack_message(payload)

            # Override channel if specified
            channel = payload.slack_channel or self._config.channel
            if channel:
                slack_payload["channel"] = channel

            # Send webhook
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    webhook_url,
                    json=slack_payload,
                    timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds)
                ) as response:
                    response_text = await response.text()

                    if response.status == 200 and response_text == "ok":
                        logger.info(f"Slack notification sent: {payload.title}")
                        return True
                    else:
                        logger.error(f"Slack webhook failed: {response.status} - {response_text}")
                        return False

        except Exception as e:
            logger.error(f"Slack send failed: {e}", exc_info=True)
            return False

    def _build_slack_message(self, payload: NotificationPayload) -> Dict[str, Any]:
        """Build Slack Block Kit message."""
        severity_colors = {
            "info": "#36a64f",
            "warning": "#ff9900",
            "error": "#ff0000",
            "critical": "#8b0000",
        }
        severity_emojis = {
            "info": ":information_source:",
            "warning": ":warning:",
            "error": ":x:",
            "critical": ":rotating_light:",
        }

        color = severity_colors.get(payload.severity, "#808080")
        emoji = severity_emojis.get(payload.severity, ":bell:")

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} {payload.title}",
                    "emoji": True
                }
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"*Severity:* {payload.severity.upper()}"},
                ]
            },
        ]

        if payload.org_slug:
            blocks[1]["elements"].append(
                {"type": "mrkdwn", "text": f"*Org:* `{payload.org_slug}`"}
            )

        blocks.extend([
            {"type": "divider"},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": payload.message}
            }
        ])

        # Add data fields
        if payload.data:
            fields_text = "*Details*\n"
            for key, value in payload.data.items():
                fields_text += f"• *{key}:* {value}\n"

            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": fields_text}
            })

        blocks.append({"type": "divider"})

        # Add mentions for critical
        mention_channel = payload.slack_mention_channel or self._config.mention_channel
        mention_users = payload.slack_mention_users or self._config.mention_users

        if payload.severity == "critical" and (mention_channel or mention_users):
            mentions = []
            if mention_channel:
                mentions.append("<!channel>")
            for user_id in mention_users:
                mentions.append(f"<@{user_id}>")

            if mentions:
                blocks.append({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f":rotating_light: *Attention Required* {' '.join(mentions)}"
                    }
                })

        # Add timestamp
        blocks.append({
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f":clock1: {datetime.utcnow().isoformat()} UTC"}
            ]
        })

        return {
            "text": f"{payload.severity.upper()}: {payload.title}",
            "blocks": blocks,
            "attachments": [{"color": color, "fallback": payload.title}],
            "username": self._config.username,
            "icon_emoji": self._config.icon_emoji,
        }

    async def validate_config(self) -> Dict[str, Any]:
        """Validate Slack configuration."""
        issues = []

        if not self._config.webhook_url:
            issues.append("Webhook URL not configured")
        elif not self._config.webhook_url.startswith("https://hooks.slack.com/"):
            issues.append("Invalid webhook URL format")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "config": {
                "webhook_configured": bool(self._config.webhook_url),
                "channel": self._config.channel,
                "username": self._config.username,
            }
        }


# ============================================
# Webhook Adapter
# ============================================

class WebhookNotificationAdapter(NotificationProviderInterface):
    """
    Generic webhook notification provider.

    Sends notifications to any HTTP endpoint.
    """

    def __init__(self, config: Optional[BaseProviderConfig] = None):
        self._config: WebhookProviderConfig = config or WebhookProviderConfig()

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.WEBHOOK

    @property
    def is_configured(self) -> bool:
        return bool(self._config.enabled and self._config.url)

    async def send(self, payload: NotificationPayload) -> bool:
        """Send webhook notification."""
        webhook_url = payload.webhook_url or self._config.url

        if not webhook_url:
            logger.warning("Webhook URL not configured")
            return False

        try:
            # Build webhook payload
            webhook_data = {
                "event": "notification",
                "timestamp": datetime.utcnow().isoformat(),
                "severity": payload.severity,
                "title": payload.title,
                "message": payload.message,
                "org_slug": payload.org_slug,
                "alert_id": payload.alert_id,
                "alert_name": payload.alert_name,
                "data": payload.data,
            }

            # Merge headers
            headers = {"Content-Type": "application/json"}
            headers.update(self._config.headers)
            headers.update(payload.webhook_headers)

            # Add auth if configured
            if self._config.auth_type == "bearer" and self._config.auth_token:
                headers["Authorization"] = f"Bearer {self._config.auth_token}"
            elif self._config.auth_type == "api_key" and self._config.auth_token:
                headers["X-API-Key"] = self._config.auth_token

            # Send request
            async with aiohttp.ClientSession() as session:
                method = self._config.method.upper()

                async with session.request(
                    method,
                    webhook_url,
                    json=webhook_data,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds)
                ) as response:
                    if 200 <= response.status < 300:
                        logger.info(f"Webhook sent: {webhook_url}")
                        return True
                    else:
                        response_text = await response.text()
                        logger.error(f"Webhook failed: {response.status} - {response_text[:200]}")
                        return False

        except Exception as e:
            logger.error(f"Webhook send failed: {e}", exc_info=True)
            return False

    async def validate_config(self) -> Dict[str, Any]:
        """Validate webhook configuration."""
        issues = []

        if not self._config.url:
            issues.append("Webhook URL not configured")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "config": {
                "url_configured": bool(self._config.url),
                "method": self._config.method,
                "auth_type": self._config.auth_type,
            }
        }


# ============================================
# Convenience Functions
# ============================================

async def send_notification(
    payload: NotificationPayload,
    channels: Optional[List[str]] = None
) -> Dict[str, bool]:
    """
    Send notification to specified channels.

    Args:
        payload: Notification payload
        channels: List of channels. Defaults to ["email"]

    Returns:
        Dict mapping channel name to success status
    """
    from .registry import get_notification_registry

    if channels is None:
        channels = ["email"]

    registry = get_notification_registry()
    return await registry.send_to_channels(payload, channels)
