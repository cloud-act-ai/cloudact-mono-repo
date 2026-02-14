"""
Notification Provider Adapters

Enterprise-grade provider implementations with:
- Thread-safe operations
- Session reuse for efficiency
- Input validation and sanitization
- Proper error handling
- Retry logic with exponential backoff
"""

import aiohttp
import asyncio
import smtplib
import ssl
import re
import logging
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import partial, wraps
from typing import Dict, Any, Optional, List, ClassVar, Callable, TypeVar
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

# ==============================================================================
# Retry Decorator with Exponential Backoff
# ==============================================================================

T = TypeVar('T')


async def retry_with_backoff(
    coro_func,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    retryable_exceptions: tuple = (Exception,),
    logger_name: str = "retry"
):
    """
    GAP-001 FIX: Retry async function with exponential backoff.

    Args:
        coro_func: Async callable (coroutine function) to retry
        max_attempts: Maximum number of attempts
        base_delay: Initial delay between retries (seconds)
        max_delay: Maximum delay between retries (seconds)
        retryable_exceptions: Tuple of exceptions to catch and retry
        logger_name: Logger name for retry messages

    Returns:
        Result of successful function call

    Raises:
        Last exception if all retries fail
    """
    import random
    retry_logger = logging.getLogger(logger_name)
    last_exception: Optional[Exception] = None

    for attempt in range(1, max_attempts + 1):
        try:
            return await coro_func()
        except retryable_exceptions as e:
            last_exception = e
            if attempt == max_attempts:
                retry_logger.error(f"All {max_attempts} attempts failed: {e}")
                raise

            # Calculate delay with exponential backoff and jitter
            delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
            # Add jitter (±25%)
            delay = delay * (0.75 + random.random() * 0.5)

            retry_logger.warning(
                f"Attempt {attempt}/{max_attempts} failed: {e}. "
                f"Retrying in {delay:.2f}s..."
            )
            await asyncio.sleep(delay)

    if last_exception:
        raise last_exception
    raise RuntimeError("Retry logic error: no exception captured")

from .registry import (
    NotificationProviderInterface,
    NotificationPayload,
    ProviderType,
    BaseProviderConfig,
    EmailProviderConfig,
    SlackProviderConfig,
    WebhookProviderConfig,
)

# ==============================================================================
# Validation Helpers
# ==============================================================================

# Email validation pattern (RFC 5322 simplified)
EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Maximum lengths for various fields
MAX_TITLE_LENGTH = 200
MAX_MESSAGE_LENGTH = 4000


def _sanitize_url_for_logging(url: str) -> str:
    """
    Remove sensitive query params from URL for safe logging.

    BUG-002 FIX: Prevent credential exposure in logs.
    """
    try:
        parsed = urlparse(url)
        # Keep only scheme, netloc, and path
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))
    except Exception:
        return "<invalid-url>"


def _validate_email(email: str) -> bool:
    """Validate email format."""
    return bool(EMAIL_PATTERN.match(email))


def _filter_valid_emails(emails: List[str]) -> List[str]:
    """
    Filter and return only valid email addresses.

    BUG-006 FIX: Validate email recipients.
    """
    valid = [e for e in emails if _validate_email(e)]
    if len(valid) != len(emails):
        logger.warning(f"Filtered {len(emails) - len(valid)} invalid email addresses")
    return valid


def _truncate(s: str, max_len: int) -> str:
    """Truncate string to max length with ellipsis."""
    if len(s) <= max_len:
        return s
    return s[:max_len - 3] + "..."


# ============================================
# Email Adapter
# ============================================

class EmailNotificationAdapter(NotificationProviderInterface):
    """
    Email notification provider adapter.

    Thread-safe SMTP operations with email validation.
    """

    def __init__(self, config: Optional[BaseProviderConfig] = None):
        # BUG-011 FIX: Type check config
        if config is not None and not isinstance(config, EmailProviderConfig):
            raise TypeError(f"Expected EmailProviderConfig, got {type(config).__name__}")
        self._config: EmailProviderConfig = config or EmailProviderConfig.from_env()

    def __repr__(self) -> str:
        return f"<EmailNotificationAdapter configured={self.is_configured}>"

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
        """Send email notification with retry logic."""
        if not self.is_configured:
            logger.warning("Email provider not configured")
            return False

        if not payload.recipients:
            logger.warning("No recipients specified for email")
            return False

        # BUG-006 FIX: Validate and filter email addresses
        valid_recipients = _filter_valid_emails(payload.recipients)
        if not valid_recipients:
            logger.error("No valid email addresses after filtering")
            return False

        # Build message with truncated title
        title = _truncate(payload.title, MAX_TITLE_LENGTH)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"{self._config.subject_prefix} {title}"
        msg["From"] = f"{self._config.from_name} <{self._config.from_email}>"
        msg["To"] = ", ".join(valid_recipients)
        msg["Reply-To"] = self._config.from_email

        # Attach text body
        text_body = payload.text_body or self._build_text_body(payload)
        msg.attach(MIMEText(text_body, "plain"))

        # Attach HTML body
        html_body = payload.html_body or self._build_html_body(payload)
        msg.attach(MIMEText(html_body, "html"))

        async def _send_with_timeout():
            """Inner function for retry wrapper."""
            loop = asyncio.get_running_loop()
            await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    partial(self._send_smtp_sync, msg, valid_recipients)
                ),
                timeout=self._config.timeout_seconds
            )

        try:
            # GAP-001 FIX: Apply retry logic with exponential backoff
            await retry_with_backoff(
                _send_with_timeout,
                max_attempts=self._config.retry_max_attempts,
                base_delay=1.0,
                retryable_exceptions=(smtplib.SMTPException, ConnectionError, OSError),
                logger_name="email_retry"
            )

            logger.info(f"Email sent to {len(valid_recipients)} recipients")
            return True

        except asyncio.TimeoutError:
            logger.error(f"Email send timed out after {self._config.timeout_seconds}s")
            return False
        except Exception as e:
            logger.error(f"Email send failed after retries: {e}", exc_info=True)
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
        """Build branded HTML email body matching frontend CloudAct template."""
        severity_colors = {
            "info": "#10b981",
            "warning": "#f59e0b",
            "error": "#ef4444",
            "critical": "#8b0000",
        }
        severity_labels = {
            "info": "Information",
            "warning": "Warning",
            "error": "Error",
            "critical": "Critical Alert",
        }
        color = severity_colors.get(payload.severity, "#808080")
        label = severity_labels.get(payload.severity, payload.severity.upper())
        year = datetime.now().year

        data_rows = ""
        if payload.data:
            for key, value in payload.data.items():
                data_rows += f"""
                <tr>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #e4e4e7; font-weight: 500; color: #3f3f46; font-size: 14px;">{key}</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #e4e4e7; color: #52525b; font-size: 14px;">{value}</td>
                </tr>
                """

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{payload.title} - CloudAct.ai</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <a href="https://cloudact.ai" style="text-decoration: none; display: inline-block;">
                <img src="https://cloudact.ai/logos/cloudact-logo-black.png" alt="CloudAct.ai" width="160" height="40" style="display: block; max-width: 160px; height: auto; border: 0;" />
              </a>
              <h1 style="margin: 20px 0 0 0; font-size: 22px; font-weight: 600; color: #18181b; line-height: 1.3;">{payload.title}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              <!-- Severity Badge -->
              <div style="margin: 0 0 20px 0; padding: 12px 16px; background-color: {color}15; border-radius: 8px; border-left: 4px solid {color};">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: {color};">{label}</p>
              </div>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                {payload.message}
              </p>
              {f'''<table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                {data_rows}
              </table>''' if data_rows else ''}
              {f'''<p style="margin: 16px 0 0 0; font-size: 13px; color: #71717a;">
                Organization: <strong>{payload.org_slug}</strong>
              </p>''' if payload.org_slug else ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <p style="margin: 0; font-size: 12px; color: #71717a;">
                      Enterprise GenAI, Cloud &amp; Subscription Cost Management
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- Legal Footer (CAN-SPAM) -->
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td align="center">
              <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.6;">
                This alert was sent by CloudAct.ai &bull;
                <a href="https://cloudact.ai/privacy" style="color: #71717a; text-decoration: none;">Privacy Policy</a> &bull;
                <a href="https://cloudact.ai/terms" style="color: #71717a; text-decoration: none;">Terms of Service</a><br>
                &copy; {year} CloudAct Inc. All rights reserved.<br>
                CloudAct Inc., 100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

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

    Uses Slack Incoming Webhooks with connection pooling.
    """

    # BUG-007 FIX: Shared session for connection reuse
    _session: ClassVar[Optional[aiohttp.ClientSession]] = None
    # BUG-002 FIX: Use threading.Lock for initial lock creation (thread-safe)
    _session_lock_init = threading.Lock()  # type: ClassVar[threading.Lock]
    _session_lock: ClassVar[Optional[asyncio.Lock]] = None

    def __init__(self, config: Optional[BaseProviderConfig] = None):
        # BUG-011 FIX: Type check config
        if config is not None and not isinstance(config, SlackProviderConfig):
            raise TypeError(f"Expected SlackProviderConfig, got {type(config).__name__}")
        self._config: SlackProviderConfig = config or SlackProviderConfig.from_env()

    def __repr__(self) -> str:
        return f"<SlackNotificationAdapter configured={self.is_configured}>"

    @classmethod
    async def _get_session(cls) -> aiohttp.ClientSession:
        """Get or create shared aiohttp session (thread-safe)."""
        # BUG-002 FIX: Thread-safe lock initialization
        if cls._session_lock is None:
            with cls._session_lock_init:
                if cls._session_lock is None:
                    cls._session_lock = asyncio.Lock()

        async with cls._session_lock:
            if cls._session is None or cls._session.closed:
                cls._session = aiohttp.ClientSession(
                    connector=aiohttp.TCPConnector(limit=10, limit_per_host=5)
                )
        return cls._session

    @classmethod
    async def close_session(cls):
        """Close the shared session (call on shutdown)."""
        if cls._session and not cls._session.closed:
            await cls._session.close()
            cls._session = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.SLACK

    @property
    def is_configured(self) -> bool:
        return bool(self._config.enabled and self._config.webhook_url)

    async def send(self, payload: NotificationPayload) -> bool:
        """Send Slack notification with retry logic."""
        webhook_url = payload.webhook_url or self._config.webhook_url

        if not webhook_url:
            logger.warning("Slack webhook URL not configured")
            return False

        # Build Slack message
        slack_payload = self._build_slack_message(payload)

        # Override channel if specified
        channel = payload.slack_channel or self._config.channel
        if channel:
            slack_payload["channel"] = channel

        async def _send_slack():
            """Inner function for retry wrapper."""
            session = await self._get_session()
            async with session.post(
                webhook_url,
                json=slack_payload,
                timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds)
            ) as response:
                response_text = await response.text()

                if response.status == 200 and response_text == "ok":
                    return True
                else:
                    # Raise exception to trigger retry for server errors
                    if response.status >= 500:
                        raise aiohttp.ClientResponseError(
                            response.request_info,
                            response.history,
                            status=response.status,
                            message=f"Slack webhook failed: {response.status}"
                        )
                    # Don't retry client errors (4xx)
                    logger.error(f"Slack webhook failed: {response.status}")
                    return False

        try:
            # GAP-001 FIX: Apply retry logic with exponential backoff
            result = await retry_with_backoff(
                _send_slack,
                max_attempts=self._config.retry_max_attempts,
                base_delay=1.0,
                retryable_exceptions=(aiohttp.ClientError, ConnectionError, OSError),
                logger_name="slack_retry"
            )

            if result:
                logger.info(f"Slack notification sent: {_truncate(payload.title, 50)}")
            return result

        except asyncio.TimeoutError:
            logger.error(f"Slack webhook timed out after {self._config.timeout_seconds}s")
            return False
        except Exception as e:
            logger.error(f"Slack send failed after retries: {e}", exc_info=True)
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
        # BUG-005 FIX: Use timezone-aware datetime instead of deprecated utcnow()
        blocks.append({
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f":clock1: {datetime.now(timezone.utc).isoformat()} UTC"}
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

        # BUG-013 FIX: Accept both regular and government Slack webhook URLs
        SLACK_WEBHOOK_PREFIXES = (
            "https://hooks.slack.com/",
            "https://hooks.slack-gov.com/",
        )

        if not self._config.webhook_url:
            issues.append("Webhook URL not configured")
        elif not any(self._config.webhook_url.startswith(p) for p in SLACK_WEBHOOK_PREFIXES):
            issues.append("Invalid webhook URL format (must be Slack webhook)")

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

    Sends notifications to any HTTP endpoint with connection pooling.
    """

    # BUG-007 FIX: Shared session for connection reuse
    _session: ClassVar[Optional[aiohttp.ClientSession]] = None
    # BUG-002 FIX: Use threading.Lock for initial lock creation (thread-safe)
    _session_lock_init = threading.Lock()  # type: ClassVar[threading.Lock]
    _session_lock: ClassVar[Optional[asyncio.Lock]] = None

    def __init__(self, config: Optional[BaseProviderConfig] = None):
        # BUG-011 FIX: Type check config
        if config is not None and not isinstance(config, WebhookProviderConfig):
            raise TypeError(f"Expected WebhookProviderConfig, got {type(config).__name__}")
        self._config: WebhookProviderConfig = config or WebhookProviderConfig()

    def __repr__(self) -> str:
        return f"<WebhookNotificationAdapter configured={self.is_configured}>"

    @classmethod
    async def _get_session(cls) -> aiohttp.ClientSession:
        """Get or create shared aiohttp session (thread-safe)."""
        # BUG-002 FIX: Thread-safe lock initialization
        if cls._session_lock is None:
            with cls._session_lock_init:
                if cls._session_lock is None:
                    cls._session_lock = asyncio.Lock()

        async with cls._session_lock:
            if cls._session is None or cls._session.closed:
                cls._session = aiohttp.ClientSession(
                    connector=aiohttp.TCPConnector(limit=10, limit_per_host=5)
                )
        return cls._session

    @classmethod
    async def close_session(cls):
        """Close the shared session."""
        if cls._session and not cls._session.closed:
            await cls._session.close()
            cls._session = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.WEBHOOK

    @property
    def is_configured(self) -> bool:
        return bool(self._config.enabled and self._config.url)

    async def send(self, payload: NotificationPayload) -> bool:
        """Send webhook notification with retry logic."""
        webhook_url = payload.webhook_url or self._config.url

        if not webhook_url:
            logger.warning("Webhook URL not configured")
            return False

        # Build webhook payload with timezone-aware timestamp
        webhook_data = {
            "event": "notification",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "severity": payload.severity,
            "title": _truncate(payload.title, MAX_TITLE_LENGTH),
            "message": _truncate(payload.message, MAX_MESSAGE_LENGTH),
            "org_slug": payload.org_slug,
            "alert_id": payload.alert_id,
            "alert_name": payload.alert_name,
            "data": payload.data,
        }

        # Merge headers (defensive copy)
        headers = {"Content-Type": "application/json"}
        headers.update(dict(self._config.headers))
        headers.update(dict(payload.webhook_headers))

        # Add auth if configured
        if self._config.auth_type == "bearer" and self._config.auth_token:
            headers["Authorization"] = f"Bearer {self._config.auth_token}"
        elif self._config.auth_type == "api_key" and self._config.auth_token:
            headers["X-API-Key"] = self._config.auth_token

        method = self._config.method.upper()

        async def _send_webhook():
            """Inner function for retry wrapper."""
            session = await self._get_session()
            async with session.request(
                method,
                webhook_url,
                json=webhook_data,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds)
            ) as response:
                if 200 <= response.status < 300:
                    return True
                else:
                    # Raise exception to trigger retry for server errors
                    if response.status >= 500:
                        raise aiohttp.ClientResponseError(
                            response.request_info,
                            response.history,
                            status=response.status,
                            message=f"Webhook failed: {response.status}"
                        )
                    # Don't retry client errors (4xx)
                    logger.error(f"Webhook failed: {response.status}")
                    return False

        try:
            # GAP-001 FIX: Apply retry logic with exponential backoff
            result = await retry_with_backoff(
                _send_webhook,
                max_attempts=self._config.retry_max_attempts,
                base_delay=1.0,
                retryable_exceptions=(aiohttp.ClientError, ConnectionError, OSError),
                logger_name="webhook_retry"
            )

            if result:
                logger.info(f"Webhook sent: {_sanitize_url_for_logging(webhook_url)}")
            return result

        except asyncio.TimeoutError:
            logger.error(f"Webhook timed out after {self._config.timeout_seconds}s")
            return False
        except Exception as e:
            logger.error(f"Webhook send failed after retries: {e}", exc_info=True)
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
