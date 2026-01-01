"""
Email Notification Provider

Implements email notifications using SMTP with:
- HTML and plain text formatting
- SSL/TLS support
- Async SMTP operations
- Template rendering
"""

import smtplib
import ssl
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional
import logging
from datetime import datetime
from functools import partial

from ..base import BaseNotificationProvider, NotificationProviderError
from ..config import NotificationMessage, NotificationConfig, EmailConfig

logger = logging.getLogger(__name__)


class EmailNotificationProvider(BaseNotificationProvider):
    """
    Email notification provider using SMTP

    Supports:
    - HTML and plain text emails
    - TLS/SSL connections
    - Multiple recipients (To, CC)
    - Custom email templates
    """

    def __init__(self, config: NotificationConfig):
        """
        Initialize email provider

        Args:
            config: Notification configuration

        Raises:
            ValueError: If email configuration is missing or invalid
        """
        super().__init__(config)

        if not config.email:
            raise ValueError("Email configuration is required for EmailNotificationProvider")

        if not config.email.enabled:
            logger.warning("Email notifications are disabled in configuration")

        # EDGE-004 FIX: Validate to_emails is not empty
        if not config.email.to_emails:
            raise ValueError("Email configuration requires at least one recipient in to_emails")

        self.email_config: EmailConfig = config.email
        # EDGE-005 FIX: Add SMTP timeout (seconds)
        self._smtp_timeout = 30

    @property
    def provider_name(self) -> str:
        """Return provider name"""
        return "email"

    def _format_message(self, message: NotificationMessage) -> Dict[str, Any]:
        """
        Format notification message for email

        Args:
            message: Notification message

        Returns:
            Dict with 'subject', 'html_body', and 'text_body'
        """
        # Build subject
        subject_parts = []
        if self.email_config.subject_prefix:
            subject_parts.append(self.email_config.subject_prefix)

        subject_parts.append(f"{message.severity.value.upper()}: {message.title}")
        subject = " ".join(subject_parts)

        # Build HTML body
        html_body = self._build_html_body(message)

        # Build plain text body
        text_body = self._build_text_body(message)

        return {
            "subject": subject,
            "html_body": html_body,
            "text_body": text_body
        }

    def _build_html_body(self, message: NotificationMessage) -> str:
        """
        Build HTML email body

        Args:
            message: Notification message

        Returns:
            str: HTML formatted email body
        """
        severity_colors = {
            "info": "#36a64f",
            "warning": "#ff9900",
            "error": "#ff0000",
            "critical": "#8b0000"
        }
        color = severity_colors.get(message.severity.value, "#808080")

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: {color}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
        .content {{ background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }}
        .details {{ background-color: white; padding: 15px; margin-top: 15px; border-left: 4px solid {color}; }}
        .footer {{ text-align: center; padding: 15px; color: #888; font-size: 12px; }}
        .label {{ font-weight: bold; color: #555; }}
        .value {{ color: #333; }}
        table {{ width: 100%; border-collapse: collapse; }}
        td {{ padding: 8px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">{message.severity.value.upper()}: {message.title}</h2>
        </div>
        <div class="content">
            <table>
                <tr>
                    <td class="label">Event:</td>
                    <td class="value">{message.event.value.replace('_', ' ').title()}</td>
                </tr>
                <tr>
                    <td class="label">Org Slug:</td>
                    <td class="value">{message.org_slug}</td>
                </tr>
                <tr>
                    <td class="label">Timestamp:</td>
                    <td class="value">{message.timestamp or datetime.utcnow().isoformat()}</td>
                </tr>
"""

        if message.pipeline_id:
            html += f"""
                <tr>
                    <td class="label">Pipeline ID:</td>
                    <td class="value">{message.pipeline_id}</td>
                </tr>
"""

        if message.pipeline_logging_id:
            html += f"""
                <tr>
                    <td class="label">Pipeline Logging ID:</td>
                    <td class="value">{message.pipeline_logging_id}</td>
                </tr>
"""

        html += """
            </table>

            <div class="details">
                <h3>Message</h3>
                <p>{}</p>
            </div>
""".format(message.message)

        # Add additional details if present
        if message.details:
            html += """
            <div class="details">
                <h3>Additional Details</h3>
                <table>
"""
            for key, value in message.details.items():
                html += f"""
                    <tr>
                        <td class="label">{key.replace('_', ' ').title()}:</td>
                        <td class="value">{value}</td>
                    </tr>
"""
            html += """
                </table>
            </div>
"""

        current_year = datetime.now().year
        html += f"""
        </div>
        <div class="footer">
            <p>CloudAct.ai - Cloud Cost Analytics</p>
            <p>&copy; {current_year} CloudAct Inc. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
"""
        return html

    def _build_text_body(self, message: NotificationMessage) -> str:
        """
        Build plain text email body

        Args:
            message: Notification message

        Returns:
            str: Plain text formatted email body
        """
        text_parts = [
            f"{message.severity.value.upper()}: {message.title}",
            "=" * 60,
            "",
            f"Event: {message.event.value.replace('_', ' ').title()}",
            f"Org Slug: {message.org_slug}",
            f"Timestamp: {message.timestamp or datetime.utcnow().isoformat()}",
        ]

        if message.pipeline_id:
            text_parts.append(f"Pipeline ID: {message.pipeline_id}")

        if message.pipeline_logging_id:
            text_parts.append(f"Pipeline Logging ID: {message.pipeline_logging_id}")

        text_parts.extend([
            "",
            "MESSAGE",
            "-" * 60,
            message.message,
        ])

        # Add additional details if present
        if message.details:
            text_parts.extend([
                "",
                "ADDITIONAL DETAILS",
                "-" * 60,
            ])
            for key, value in message.details.items():
                text_parts.append(f"{key.replace('_', ' ').title()}: {value}")

        current_year = datetime.now().year
        text_parts.extend([
            "",
            "=" * 60,
            "CloudAct.ai - Cloud Cost Analytics",
            f"© {current_year} CloudAct Inc. All rights reserved.",
        ])

        return "\n".join(text_parts)

    async def _send_notification(self, message: NotificationMessage) -> bool:
        """
        Send email notification via SMTP

        Args:
            message: Notification message to send

        Returns:
            bool: True if successful

        Raises:
            NotificationProviderError: If SMTP operation fails
        """
        try:
            # Format message
            formatted = self._format_message(message)

            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = formatted["subject"]
            msg["From"] = f"{self.email_config.from_name} <{self.email_config.from_email}>"
            msg["To"] = ", ".join(self.email_config.to_emails)

            if self.email_config.cc_emails:
                msg["Cc"] = ", ".join(self.email_config.cc_emails)

            # Attach plain text and HTML parts
            msg.attach(MIMEText(formatted["text_body"], "plain"))
            msg.attach(MIMEText(formatted["html_body"], "html"))

            # Send email
            await self._send_smtp(msg)

            return True

        except Exception as e:
            logger.error(f"Email notification failed: {str(e)}", exc_info=True)
            raise NotificationProviderError(f"Failed to send email: {str(e)}") from e

    def _send_smtp_sync(self, msg: MIMEMultipart, recipients: list):
        """
        Synchronous SMTP send operation.

        Args:
            msg: Email message to send
            recipients: List of recipient email addresses

        Raises:
            NotificationProviderError: If SMTP operation fails
        """
        try:
            # EDGE-005 FIX: Use TLS with timeout
            if self.email_config.smtp_use_tls:
                context = ssl.create_default_context()
                with smtplib.SMTP(
                    self.email_config.smtp_host,
                    self.email_config.smtp_port,
                    timeout=self._smtp_timeout
                ) as server:
                    server.starttls(context=context)

                    # Login if credentials provided
                    if self.email_config.smtp_username and self.email_config.smtp_password:
                        server.login(self.email_config.smtp_username, self.email_config.smtp_password)

                    # Send email
                    server.send_message(msg, to_addrs=recipients)
            else:
                # Non-TLS connection with timeout
                with smtplib.SMTP(
                    self.email_config.smtp_host,
                    self.email_config.smtp_port,
                    timeout=self._smtp_timeout
                ) as server:
                    # Login if credentials provided
                    if self.email_config.smtp_username and self.email_config.smtp_password:
                        server.login(self.email_config.smtp_username, self.email_config.smtp_password)

                    # Send email
                    server.send_message(msg, to_addrs=recipients)

            logger.info(
                f"Email sent successfully to {len(recipients)} recipient(s): "
                f"{', '.join(recipients)}"
            )

        except smtplib.SMTPException as e:
            raise NotificationProviderError(f"SMTP error: {str(e)}") from e
        except Exception as e:
            raise NotificationProviderError(f"Email send error: {str(e)}") from e

    async def _send_smtp(self, msg: MIMEMultipart):
        """
        Send email via SMTP asynchronously using thread pool executor.

        Args:
            msg: Email message to send

        Raises:
            NotificationProviderError: If SMTP operation fails
        """
        # Determine all recipients (To + CC)
        recipients = self.email_config.to_emails.copy()
        if self.email_config.cc_emails:
            recipients.extend(self.email_config.cc_emails)

        # Run blocking SMTP operation in thread pool to avoid blocking event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,  # Use default ThreadPoolExecutor
            partial(self._send_smtp_sync, msg, recipients)
        )
