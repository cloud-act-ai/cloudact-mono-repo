"""
Slack Notification Provider

Implements Slack notifications using Incoming Webhooks with:
- Rich message formatting (blocks and attachments)
- User mentions for critical alerts
- Channel mentions
- Color-coded severity levels
"""

import aiohttp
from typing import Dict, Any, List
import logging
from datetime import datetime

from ..base import BaseNotificationProvider, NotificationProviderError
from ..config import NotificationMessage, NotificationConfig, SlackConfig, NotificationSeverity

logger = logging.getLogger(__name__)


class SlackNotificationProvider(BaseNotificationProvider):
    """
    Slack notification provider using Incoming Webhooks

    Supports:
    - Rich message formatting with Slack blocks
    - Color-coded severity levels
    - User and channel mentions
    - Custom username and emoji
    """

    def __init__(self, config: NotificationConfig):
        """
        Initialize Slack provider

        Args:
            config: Notification configuration

        Raises:
            ValueError: If Slack configuration is missing or invalid
        """
        super().__init__(config)

        if not config.slack:
            raise ValueError("Slack configuration is required for SlackNotificationProvider")

        if not config.slack.enabled:
            logger.warning("Slack notifications are disabled in configuration")

        self.slack_config: SlackConfig = config.slack

    @property
    def provider_name(self) -> str:
        """Return provider name"""
        return "slack"

    def _format_message(self, message: NotificationMessage) -> Dict[str, Any]:
        """
        Format notification message for Slack

        Uses Slack's Block Kit for rich formatting.
        See: https://api.slack.com/block-kit

        Args:
            message: Notification message

        Returns:
            Dict: Slack webhook payload
        """
        # Build blocks for rich formatting
        blocks = self._build_blocks(message)

        # Build fallback text for notifications
        fallback_text = f"{message.severity.value.upper()}: {message.title}"

        # Build payload
        payload: Dict[str, Any] = {
            "text": fallback_text,
            "blocks": blocks,
            "attachments": [
                {
                    "color": self._get_severity_color(message.severity),
                    "fallback": fallback_text,
                }
            ]
        }

        # Add optional fields
        if self.slack_config.username:
            payload["username"] = self.slack_config.username

        if self.slack_config.icon_emoji:
            payload["icon_emoji"] = self.slack_config.icon_emoji

        if self.slack_config.channel:
            payload["channel"] = self.slack_config.channel

        return payload

    def _build_blocks(self, message: NotificationMessage) -> List[Dict[str, Any]]:
        """
        Build Slack blocks for rich message formatting

        Args:
            message: Notification message

        Returns:
            List of Slack block dictionaries
        """
        blocks = []

        # Header block with severity emoji
        emoji = self._get_severity_emoji(message.severity)
        blocks.append({
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"{emoji} {message.title}",
                "emoji": True
            }
        })

        # Context block with metadata
        context_elements = [
            {
                "type": "mrkdwn",
                "text": f"*Event:* {message.event.value.replace('_', ' ').title()}"
            },
            {
                "type": "mrkdwn",
                "text": f"*Tenant:* `{message.tenant_id}`"
            },
            {
                "type": "mrkdwn",
                "text": f"*Severity:* {message.severity.value.upper()}"
            }
        ]
        blocks.append({
            "type": "context",
            "elements": context_elements
        })

        # Divider
        blocks.append({"type": "divider"})

        # Message section
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Message*\n{message.message}"
            }
        })

        # Pipeline details (if present)
        if message.pipeline_id or message.pipeline_logging_id:
            fields = []
            if message.pipeline_id:
                fields.append({
                    "type": "mrkdwn",
                    "text": f"*Pipeline ID:*\n`{message.pipeline_id}`"
                })
            if message.pipeline_logging_id:
                fields.append({
                    "type": "mrkdwn",
                    "text": f"*Logging ID:*\n`{message.pipeline_logging_id}`"
                })

            blocks.append({
                "type": "section",
                "fields": fields
            })

        # Additional details (if present)
        if message.details:
            details_text = "*Additional Details*\n"
            for key, value in message.details.items():
                details_text += f"• *{key.replace('_', ' ').title()}:* {value}\n"

            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": details_text
                }
            })

        # Divider
        blocks.append({"type": "divider"})

        # Footer with timestamp
        timestamp = message.timestamp or datetime.utcnow().isoformat()
        blocks.append({
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f":clock1: {timestamp} UTC"
                }
            ]
        })

        # Add mentions for critical alerts
        if message.severity == NotificationSeverity.CRITICAL:
            mention_text = self._build_mentions()
            if mention_text:
                blocks.append({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": mention_text
                    }
                })

        return blocks

    def _build_mentions(self) -> str:
        """
        Build mention text for critical alerts

        Returns:
            str: Mention text or empty string
        """
        mentions = []

        # Add channel mention if configured
        if self.slack_config.mention_channel:
            mentions.append("<!channel>")

        # Add user mentions if configured
        if self.slack_config.mention_users:
            for user_id in self.slack_config.mention_users:
                mentions.append(f"<@{user_id}>")

        if mentions:
            return f":rotating_light: *Attention Required* :rotating_light:\n{' '.join(mentions)}"

        return ""

    async def _send_notification(self, message: NotificationMessage) -> bool:
        """
        Send Slack notification via webhook

        Args:
            message: Notification message to send

        Returns:
            bool: True if successful

        Raises:
            NotificationProviderError: If webhook request fails
        """
        try:
            # Format message for Slack
            payload = self._format_message(message)

            # Send webhook request
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.slack_config.webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.timeout_seconds)
                ) as response:
                    response_text = await response.text()

                    if response.status == 200 and response_text == "ok":
                        logger.info(
                            f"Slack notification sent successfully "
                            f"(event: {message.event.value}, tenant: {message.tenant_id})"
                        )
                        return True
                    else:
                        error_msg = (
                            f"Slack webhook failed with status {response.status}: {response_text}"
                        )
                        logger.error(error_msg)
                        raise NotificationProviderError(error_msg)

        except aiohttp.ClientError as e:
            logger.error(f"Slack notification request failed: {str(e)}", exc_info=True)
            raise NotificationProviderError(f"Slack webhook request failed: {str(e)}") from e

        except Exception as e:
            logger.error(f"Slack notification failed: {str(e)}", exc_info=True)
            raise NotificationProviderError(f"Failed to send Slack notification: {str(e)}") from e
