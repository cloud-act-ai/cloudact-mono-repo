"""
Notification Service

Main notification service with:
- Org-specific configuration lookup with root fallback
- Multi-provider support (Email, Slack)
- Async batch notifications
- Configuration caching
"""

import json
import os
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
import logging
from datetime import datetime
import asyncio

from .config import (
    NotificationConfig,
    NotificationMessage,
    NotificationProvider,
    NotificationEvent,
    NotificationSeverity
)
from .base import BaseNotificationProvider
from .providers import EmailNotificationProvider, SlackNotificationProvider

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Main notification service

    Features:
    - Loads org-specific configurations with root fallback
    - Manages multiple notification providers
    - Supports async batch notifications
    - Caches configurations for performance
    """

    def __init__(self, config_base_path: Optional[Path] = None):
        """
        Initialize notification service

        Args:
            config_base_path: Base path for configuration files
                             Defaults to ./configs relative to project root
        """
        self.config_base_path = config_base_path or Path("./configs")
        self._config_cache: Dict[str, NotificationConfig] = {}
        self._provider_cache: Dict[str, Dict[str, BaseNotificationProvider]] = {}
        self._root_config: Optional[NotificationConfig] = None

        # Load root configuration
        self._load_root_config()

    def _resolve_env_vars(self, obj: Any) -> Any:
        """
        Recursively resolve environment variables in config data.

        Supports ${VAR_NAME} syntax. Unresolved vars are replaced with empty string.

        Args:
            obj: Config data (dict, list, or scalar)

        Returns:
            Config data with env vars resolved
        """
        if isinstance(obj, dict):
            return {k: self._resolve_env_vars(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._resolve_env_vars(item) for item in obj]
        elif isinstance(obj, str):
            # Match ${VAR_NAME} pattern
            pattern = r'\$\{([^}]+)\}'

            def replace_var(match):
                var_name = match.group(1)
                value = os.environ.get(var_name, "")
                if not value:
                    logger.warning(f"Environment variable {var_name} not set, using empty string")
                return value

            resolved = re.sub(pattern, replace_var, obj)
            return resolved
        else:
            return obj

    def _load_root_config(self):
        """Load root/global notification configuration"""
        root_config_path = self.config_base_path / "notifications" / "config.json"

        try:
            if root_config_path.exists():
                with open(root_config_path, "r") as f:
                    config_data = json.load(f)
                    # Resolve environment variables in config
                    config_data = self._resolve_env_vars(config_data)
                    # Filter out empty email addresses
                    if "email" in config_data and "to_emails" in config_data["email"]:
                        config_data["email"]["to_emails"] = [
                            e for e in config_data["email"]["to_emails"]
                            if e and "@" in e
                        ]
                        # If no valid emails, disable email notifications
                        if not config_data["email"]["to_emails"]:
                            config_data["email"]["enabled"] = False
                            logger.warning("No valid email addresses configured, disabling email notifications")
                    self._root_config = NotificationConfig(**config_data)
                    logger.info(f"Loaded root notification configuration from {root_config_path}")
            else:
                # Create default root configuration
                self._root_config = NotificationConfig(
                    enabled=False,
                    description="Root/global notification configuration (fallback)"
                )
                logger.warning(
                    f"Root notification configuration not found at {root_config_path}. "
                    "Using default configuration."
                )
        except Exception as e:
            logger.error(f"Failed to load root notification configuration: {str(e)}", exc_info=True)
            self._root_config = NotificationConfig(enabled=False)

    def _load_org_config(self, org_slug: str) -> Optional[NotificationConfig]:
        """
        Load org-specific notification configuration

        Args:
            org_slug: Organization slug identifier

        Returns:
            NotificationConfig or None if not found
        """
        org_config_path = self.config_base_path / org_slug / "notifications.json"

        try:
            if org_config_path.exists():
                with open(org_config_path, "r") as f:
                    config_data = json.load(f)
                    # Resolve environment variables in config
                    config_data = self._resolve_env_vars(config_data)
                    # Filter out empty email addresses
                    if "email" in config_data and "to_emails" in config_data["email"]:
                        config_data["email"]["to_emails"] = [
                            e for e in config_data["email"]["to_emails"]
                            if e and "@" in e
                        ]
                    config = NotificationConfig(**config_data, org_slug=org_slug)
                    logger.info(
                        f"Loaded org-specific notification configuration for {org_slug} "
                        f"from {org_config_path}"
                    )
                    return config
            else:
                logger.debug(
                    f"Org-specific notification configuration not found for {org_slug} "
                    f"at {org_config_path}"
                )
                return None
        except Exception as e:
            logger.error(
                f"Failed to load org notification configuration for {org_slug}: {str(e)}",
                exc_info=True
            )
            return None

    def get_config(self, org_slug: str) -> NotificationConfig:
        """
        Get notification configuration for organization with fallback to root

        Resolution order:
        1. Org-specific configuration (./configs/{org_slug}/notifications.json)
        2. Root configuration (./configs/notifications/config.json)

        Args:
            org_slug: Organization slug identifier

        Returns:
            NotificationConfig: Org-specific or root configuration
        """
        # Check cache first
        if org_slug in self._config_cache:
            logger.debug(f"Using cached notification configuration for org: {org_slug}")
            return self._config_cache[org_slug]

        # Try to load org-specific configuration
        org_config = self._load_org_config(org_slug)

        if org_config and org_config.enabled:
            logger.info(f"Using org-specific notification configuration for: {org_slug}")
            self._config_cache[org_slug] = org_config
            return org_config

        # Fall back to root configuration
        if self._root_config:
            logger.info(
                f"Using root notification configuration (fallback) for org: {org_slug}"
            )
            self._config_cache[org_slug] = self._root_config
            return self._root_config

        # Return disabled configuration as last resort
        logger.warning(
            f"No notification configuration found for org {org_slug}. "
            "Notifications disabled."
        )
        disabled_config = NotificationConfig(enabled=False, org_slug=org_slug)
        self._config_cache[org_slug] = disabled_config
        return disabled_config

    def _get_provider(
        self,
        org_slug: str,
        provider_type: NotificationProvider
    ) -> Optional[BaseNotificationProvider]:
        """
        Get notification provider instance for organization

        Args:
            org_slug: Organization slug identifier
            provider_type: Type of notification provider

        Returns:
            BaseNotificationProvider instance or None
        """
        # Check provider cache
        cache_key = f"{org_slug}:{provider_type.value}"
        if cache_key in self._provider_cache:
            return self._provider_cache[cache_key]

        # Get configuration
        config = self.get_config(org_slug)

        if not config.enabled:
            logger.debug(f"Notifications disabled for org: {org_slug}")
            return None

        # Create provider instance
        try:
            provider: Optional[BaseNotificationProvider] = None

            if provider_type == NotificationProvider.EMAIL:
                if config.email and config.email.enabled:
                    provider = EmailNotificationProvider(config)
                else:
                    logger.debug(f"Email notifications disabled for org: {org_slug}")

            elif provider_type == NotificationProvider.SLACK:
                if config.slack and config.slack.enabled:
                    provider = SlackNotificationProvider(config)
                else:
                    logger.debug(f"Slack notifications disabled for org: {org_slug}")

            # Cache provider
            if provider:
                if org_slug not in self._provider_cache:
                    self._provider_cache[org_slug] = {}
                self._provider_cache[org_slug][provider_type.value] = provider

            return provider

        except Exception as e:
            logger.error(
                f"Failed to create {provider_type.value} provider for org {org_slug}: {str(e)}",
                exc_info=True
            )
            return None

    async def notify(
        self,
        org_slug: str,
        event: NotificationEvent,
        severity: NotificationSeverity,
        title: str,
        message: str,
        pipeline_id: Optional[str] = None,
        pipeline_logging_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        providers: Optional[List[NotificationProvider]] = None
    ) -> Dict[str, bool]:
        """
        Send notification to configured providers

        Args:
            org_slug: Organization slug identifier
            event: Notification event type
            severity: Notification severity
            title: Notification title
            message: Notification message
            pipeline_id: Optional pipeline ID
            pipeline_logging_id: Optional pipeline logging ID
            details: Optional additional details
            providers: Optional list of specific providers to use
                      If None, uses providers configured for the event

        Returns:
            Dict mapping provider name to success status
        """
        # Get configuration
        config = self.get_config(org_slug)

        if not config.enabled:
            logger.debug(f"Notifications disabled for org: {org_slug}")
            return {}

        # Get event configuration
        event_config = config.get_event_config(event)
        if not event_config:
            logger.debug(
                f"No configuration found for event {event.value} "
                f"(org: {org_slug})"
            )
            return {}

        # Determine which providers to use
        target_providers = providers or event_config.providers

        # Create notification message
        notification_message = NotificationMessage(
            event=event,
            severity=severity,
            org_slug=org_slug,
            title=title,
            message=message,
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            details=details,
            timestamp=datetime.utcnow().isoformat()
        )

        # Send notifications to all providers
        results = {}
        tasks = []

        for provider_type in target_providers:
            # Skip BOTH as it's not a real provider
            if provider_type == NotificationProvider.BOTH:
                # Send to both email and slack
                for actual_provider in [NotificationProvider.EMAIL, NotificationProvider.SLACK]:
                    provider = self._get_provider(org_slug, actual_provider)
                    if provider:
                        tasks.append(self._send_to_provider(provider, notification_message))
            else:
                provider = self._get_provider(org_slug, provider_type)
                if provider:
                    tasks.append(self._send_to_provider(provider, notification_message))

        # Execute all notification tasks concurrently
        if tasks:
            send_results = await asyncio.gather(*tasks, return_exceptions=True)

            for i, result in enumerate(send_results):
                provider_name = f"provider_{i}"
                if isinstance(result, Exception):
                    logger.error(f"Notification failed for {provider_name}: {str(result)}")
                    results[provider_name] = False
                else:
                    results[provider_name] = result

        return results

    async def _send_to_provider(
        self,
        provider: BaseNotificationProvider,
        message: NotificationMessage
    ) -> bool:
        """
        Send notification to a specific provider

        Args:
            provider: Notification provider instance
            message: Notification message

        Returns:
            bool: True if successful
        """
        try:
            return await provider.send(message)
        except Exception as e:
            logger.error(
                f"Failed to send notification via {provider.provider_name}: {str(e)}",
                exc_info=True
            )
            return False

    def clear_cache(self, org_slug: Optional[str] = None):
        """
        Clear configuration cache

        Args:
            org_slug: Optional organization slug to clear specific cache
                     If None, clears all caches
        """
        if org_slug:
            self._config_cache.pop(org_slug, None)
            self._provider_cache.pop(org_slug, None)
            logger.info(f"Cleared notification cache for org: {org_slug}")
        else:
            self._config_cache.clear()
            self._provider_cache.clear()
            self._load_root_config()
            logger.info("Cleared all notification caches and reloaded root configuration")

    async def notify_pipeline_started(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        **kwargs
    ):
        """Convenience method for pipeline started event"""
        return await self.notify(
            org_slug=org_slug,
            event=NotificationEvent.PIPELINE_STARTED,
            severity=NotificationSeverity.INFO,
            title=f"Pipeline Started: {pipeline_id}",
            message=f"Pipeline {pipeline_id} has started execution",
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            **kwargs
        )

    async def notify_pipeline_success(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        duration_ms: Optional[int] = None,
        **kwargs
    ):
        """Convenience method for pipeline success event"""
        # Build base details
        details = {}
        if duration_ms:
            details["duration_ms"] = duration_ms
            details["duration_readable"] = f"{duration_ms / 1000:.2f} seconds"

        # Merge with any details passed in kwargs
        if "details" in kwargs:
            details.update(kwargs.pop("details"))

        return await self.notify(
            org_slug=org_slug,
            event=NotificationEvent.PIPELINE_SUCCESS,
            severity=NotificationSeverity.INFO,
            title=f"Pipeline Completed: {pipeline_id}",
            message=f"Pipeline {pipeline_id} completed successfully",
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            details=details if details else None,
            **kwargs
        )

    async def notify_pipeline_failure(
        self,
        org_slug: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        error_message: str,
        **kwargs
    ):
        """Convenience method for pipeline failure event"""
        # Build base details
        details = {"error": error_message}

        # Merge with any details passed in kwargs
        if "details" in kwargs:
            details.update(kwargs.pop("details"))

        return await self.notify(
            org_slug=org_slug,
            event=NotificationEvent.PIPELINE_FAILURE,
            severity=NotificationSeverity.ERROR,
            title=f"Pipeline Failed: {pipeline_id}",
            message=f"Pipeline {pipeline_id} failed with error: {error_message}",
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            details=details,
            **kwargs
        )

    async def notify_data_quality_failure(
        self,
        org_slug: str,
        pipeline_id: str,
        table_name: str,
        failed_checks: List[str],
        **kwargs
    ):
        """Convenience method for data quality failure event"""
        # Build base details
        details = {
            "table": table_name,
            "failed_checks": ", ".join(failed_checks),
            "check_count": len(failed_checks)
        }

        # Merge with any details passed in kwargs
        if "details" in kwargs:
            details.update(kwargs.pop("details"))

        return await self.notify(
            org_slug=org_slug,
            event=NotificationEvent.DATA_QUALITY_FAILURE,
            severity=NotificationSeverity.WARNING,
            title=f"Data Quality Check Failed: {table_name}",
            message=f"Data quality checks failed for table {table_name}",
            pipeline_id=pipeline_id,
            details=details,
            **kwargs
        )


# Global service instance
_notification_service: Optional[NotificationService] = None


def get_notification_service(
    config_base_path: Optional[Path] = None
) -> NotificationService:
    """
    Get global notification service instance

    Args:
        config_base_path: Optional base path for configurations

    Returns:
        NotificationService instance
    """
    global _notification_service

    if _notification_service is None:
        _notification_service = NotificationService(config_base_path)

    return _notification_service
