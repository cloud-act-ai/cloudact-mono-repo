"""
Notification Service

Main notification service with:
- Tenant-specific configuration lookup with root fallback
- Multi-provider support (Email, Slack)
- Async batch notifications
- Configuration caching
"""

import json
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
    - Loads tenant-specific configurations with root fallback
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

    def _load_root_config(self):
        """Load root/global notification configuration"""
        root_config_path = self.config_base_path / "notifications" / "config.json"

        try:
            if root_config_path.exists():
                with open(root_config_path, "r") as f:
                    config_data = json.load(f)
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

    def _load_tenant_config(self, tenant_id: str) -> Optional[NotificationConfig]:
        """
        Load tenant-specific notification configuration

        Args:
            tenant_id: Tenant identifier

        Returns:
            NotificationConfig or None if not found
        """
        tenant_config_path = self.config_base_path / tenant_id / "notifications.json"

        try:
            if tenant_config_path.exists():
                with open(tenant_config_path, "r") as f:
                    config_data = json.load(f)
                    config = NotificationConfig(**config_data, tenant_id=tenant_id)
                    logger.info(
                        f"Loaded tenant-specific notification configuration for {tenant_id} "
                        f"from {tenant_config_path}"
                    )
                    return config
            else:
                logger.debug(
                    f"Tenant-specific notification configuration not found for {tenant_id} "
                    f"at {tenant_config_path}"
                )
                return None
        except Exception as e:
            logger.error(
                f"Failed to load tenant notification configuration for {tenant_id}: {str(e)}",
                exc_info=True
            )
            return None

    def get_config(self, tenant_id: str) -> NotificationConfig:
        """
        Get notification configuration for tenant with fallback to root

        Resolution order:
        1. Tenant-specific configuration (./configs/{tenant_id}/notifications.json)
        2. Root configuration (./configs/notifications/config.json)

        Args:
            tenant_id: Tenant identifier

        Returns:
            NotificationConfig: Tenant-specific or root configuration
        """
        # Check cache first
        if tenant_id in self._config_cache:
            logger.debug(f"Using cached notification configuration for tenant: {tenant_id}")
            return self._config_cache[tenant_id]

        # Try to load tenant-specific configuration
        tenant_config = self._load_tenant_config(tenant_id)

        if tenant_config and tenant_config.enabled:
            logger.info(f"Using tenant-specific notification configuration for: {tenant_id}")
            self._config_cache[tenant_id] = tenant_config
            return tenant_config

        # Fall back to root configuration
        if self._root_config:
            logger.info(
                f"Using root notification configuration (fallback) for tenant: {tenant_id}"
            )
            self._config_cache[tenant_id] = self._root_config
            return self._root_config

        # Return disabled configuration as last resort
        logger.warning(
            f"No notification configuration found for tenant {tenant_id}. "
            "Notifications disabled."
        )
        disabled_config = NotificationConfig(enabled=False, tenant_id=tenant_id)
        self._config_cache[tenant_id] = disabled_config
        return disabled_config

    def _get_provider(
        self,
        tenant_id: str,
        provider_type: NotificationProvider
    ) -> Optional[BaseNotificationProvider]:
        """
        Get notification provider instance for tenant

        Args:
            tenant_id: Tenant identifier
            provider_type: Type of notification provider

        Returns:
            BaseNotificationProvider instance or None
        """
        # Check provider cache
        cache_key = f"{tenant_id}:{provider_type.value}"
        if cache_key in self._provider_cache:
            return self._provider_cache[cache_key]

        # Get configuration
        config = self.get_config(tenant_id)

        if not config.enabled:
            logger.debug(f"Notifications disabled for tenant: {tenant_id}")
            return None

        # Create provider instance
        try:
            provider: Optional[BaseNotificationProvider] = None

            if provider_type == NotificationProvider.EMAIL:
                if config.email and config.email.enabled:
                    provider = EmailNotificationProvider(config)
                else:
                    logger.debug(f"Email notifications disabled for tenant: {tenant_id}")

            elif provider_type == NotificationProvider.SLACK:
                if config.slack and config.slack.enabled:
                    provider = SlackNotificationProvider(config)
                else:
                    logger.debug(f"Slack notifications disabled for tenant: {tenant_id}")

            # Cache provider
            if provider:
                if tenant_id not in self._provider_cache:
                    self._provider_cache[tenant_id] = {}
                self._provider_cache[tenant_id][provider_type.value] = provider

            return provider

        except Exception as e:
            logger.error(
                f"Failed to create {provider_type.value} provider for tenant {tenant_id}: {str(e)}",
                exc_info=True
            )
            return None

    async def notify(
        self,
        tenant_id: str,
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
            tenant_id: Tenant identifier
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
        config = self.get_config(tenant_id)

        if not config.enabled:
            logger.debug(f"Notifications disabled for tenant: {tenant_id}")
            return {}

        # Get event configuration
        event_config = config.get_event_config(event)
        if not event_config:
            logger.debug(
                f"No configuration found for event {event.value} "
                f"(tenant: {tenant_id})"
            )
            return {}

        # Determine which providers to use
        target_providers = providers or event_config.providers

        # Create notification message
        notification_message = NotificationMessage(
            event=event,
            severity=severity,
            tenant_id=tenant_id,
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
                    provider = self._get_provider(tenant_id, actual_provider)
                    if provider:
                        tasks.append(self._send_to_provider(provider, notification_message))
            else:
                provider = self._get_provider(tenant_id, provider_type)
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

    def clear_cache(self, tenant_id: Optional[str] = None):
        """
        Clear configuration cache

        Args:
            tenant_id: Optional tenant ID to clear specific cache
                      If None, clears all caches
        """
        if tenant_id:
            self._config_cache.pop(tenant_id, None)
            self._provider_cache.pop(tenant_id, None)
            logger.info(f"Cleared notification cache for tenant: {tenant_id}")
        else:
            self._config_cache.clear()
            self._provider_cache.clear()
            self._load_root_config()
            logger.info("Cleared all notification caches and reloaded root configuration")

    async def notify_pipeline_started(
        self,
        tenant_id: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        **kwargs
    ):
        """Convenience method for pipeline started event"""
        return await self.notify(
            tenant_id=tenant_id,
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
        tenant_id: str,
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
            tenant_id=tenant_id,
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
        tenant_id: str,
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
            tenant_id=tenant_id,
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
        tenant_id: str,
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
            tenant_id=tenant_id,
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
