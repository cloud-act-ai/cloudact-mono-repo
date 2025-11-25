"""
Base Notification Provider Interface

Defines abstract base classes for notification providers with:
- Async notification sending
- Retry logic with exponential backoff
- Timeout handling
- Provider-specific formatting
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import logging
from datetime import datetime
import asyncio
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)

from .config import (
    NotificationMessage,
    NotificationConfig,
    NotificationRetryConfig,
    NotificationSeverity
)

logger = logging.getLogger(__name__)


class NotificationError(Exception):
    """Base exception for notification errors"""
    pass


class NotificationTimeoutError(NotificationError):
    """Raised when notification times out"""
    pass


class NotificationProviderError(NotificationError):
    """Raised when provider-specific error occurs"""
    pass


class BaseNotificationProvider(ABC):
    """
    Abstract base class for notification providers

    All notification providers (Email, Slack, etc.) must implement this interface.
    Provides common functionality like retry logic, timeout handling, and logging.
    """

    def __init__(self, config: NotificationConfig):
        """
        Initialize notification provider

        Args:
            config: Notification configuration (root or org-specific)
        """
        self.config = config
        self.retry_config = config.retry_config
        self.timeout_seconds = config.timeout_seconds
        self._last_notification_time: Dict[str, datetime] = {}

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the name of the provider (e.g., 'email', 'slack')"""
        pass

    @abstractmethod
    async def _send_notification(self, message: NotificationMessage) -> bool:
        """
        Provider-specific notification sending logic

        This method must be implemented by each provider.
        Should return True if successful, False otherwise.

        Args:
            message: Notification message to send

        Returns:
            bool: True if successful, False otherwise

        Raises:
            NotificationProviderError: If provider-specific error occurs
        """
        pass

    @abstractmethod
    def _format_message(self, message: NotificationMessage) -> Dict[str, Any]:
        """
        Format message for provider-specific requirements

        Args:
            message: Notification message to format

        Returns:
            Dict containing formatted message data
        """
        pass

    def _check_cooldown(self, message: NotificationMessage) -> bool:
        """
        Check if notification is within cooldown period

        Args:
            message: Notification message

        Returns:
            bool: True if can send (not in cooldown), False if in cooldown
        """
        event_config = self.config.get_event_config(message.event)
        if not event_config or not event_config.cooldown_seconds:
            return True

        cooldown_key = f"{message.org_slug}:{message.event.value}"
        last_time = self._last_notification_time.get(cooldown_key)

        if last_time:
            elapsed = (datetime.utcnow() - last_time).total_seconds()
            if elapsed < event_config.cooldown_seconds:
                logger.info(
                    f"Notification cooldown active for {cooldown_key}: "
                    f"{elapsed:.0f}s elapsed, {event_config.cooldown_seconds}s required"
                )
                return False

        return True

    def _update_cooldown(self, message: NotificationMessage):
        """Update last notification time for cooldown tracking"""
        cooldown_key = f"{message.org_slug}:{message.event.value}"
        self._last_notification_time[cooldown_key] = datetime.utcnow()

    async def send(self, message: NotificationMessage) -> bool:
        """
        Send notification with retry logic and timeout

        Args:
            message: Notification message to send

        Returns:
            bool: True if successful, False otherwise
        """
        # Check cooldown
        if not self._check_cooldown(message):
            logger.info(
                f"Skipping {self.provider_name} notification for {message.event.value} "
                f"(org: {message.org_slug}) - cooldown active"
            )
            return False

        # Create retry decorator with config
        send_with_retry = retry(
            stop=stop_after_attempt(self.retry_config.max_attempts),
            wait=wait_exponential(
                multiplier=self.retry_config.initial_delay_seconds,
                max=self.retry_config.max_delay_seconds
            ) if self.retry_config.exponential_backoff else None,
            retry=retry_if_exception_type((NotificationProviderError, asyncio.TimeoutError)),
            before_sleep=before_sleep_log(logger, logging.WARNING),
            reraise=True
        )(self._send_with_timeout)

        try:
            logger.info(
                f"Sending {self.provider_name} notification for {message.event.value} "
                f"(org: {message.org_slug}, severity: {message.severity.value})"
            )

            success = await send_with_retry(message)

            if success:
                self._update_cooldown(message)
                logger.info(
                    f"Successfully sent {self.provider_name} notification for {message.event.value} "
                    f"(org: {message.org_slug})"
                )
            else:
                logger.warning(
                    f"Failed to send {self.provider_name} notification for {message.event.value} "
                    f"(org: {message.org_slug})"
                )

            return success

        except asyncio.TimeoutError:
            logger.error(
                f"{self.provider_name} notification timed out after {self.timeout_seconds}s "
                f"for {message.event.value} (org: {message.org_slug})"
            )
            return False

        except Exception as e:
            logger.error(
                f"Failed to send {self.provider_name} notification for {message.event.value} "
                f"(org: {message.org_slug}): {str(e)}",
                exc_info=True
            )
            return False

    async def _send_with_timeout(self, message: NotificationMessage) -> bool:
        """
        Send notification with timeout

        Args:
            message: Notification message to send

        Returns:
            bool: True if successful

        Raises:
            asyncio.TimeoutError: If send times out
        """
        try:
            return await asyncio.wait_for(
                self._send_notification(message),
                timeout=self.timeout_seconds
            )
        except asyncio.TimeoutError:
            raise NotificationTimeoutError(
                f"{self.provider_name} notification timed out after {self.timeout_seconds}s"
            )

    def _get_severity_color(self, severity: NotificationSeverity) -> str:
        """
        Get color code for severity level

        Args:
            severity: Notification severity

        Returns:
            str: Hex color code
        """
        severity_colors = {
            NotificationSeverity.INFO: "#36a64f",      # Green
            NotificationSeverity.WARNING: "#ff9900",   # Orange
            NotificationSeverity.ERROR: "#ff0000",     # Red
            NotificationSeverity.CRITICAL: "#8b0000"   # Dark Red
        }
        return severity_colors.get(severity, "#808080")  # Default gray

    def _get_severity_emoji(self, severity: NotificationSeverity) -> str:
        """
        Get emoji for severity level

        Args:
            severity: Notification severity

        Returns:
            str: Emoji character
        """
        severity_emojis = {
            NotificationSeverity.INFO: ":information_source:",
            NotificationSeverity.WARNING: ":warning:",
            NotificationSeverity.ERROR: ":x:",
            NotificationSeverity.CRITICAL: ":rotating_light:"
        }
        return severity_emojis.get(severity, ":bell:")
