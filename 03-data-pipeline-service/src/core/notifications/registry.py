"""
Notification Provider Registry

Unified provider management with:
- Dynamic provider registration
- Factory pattern for provider instantiation
- Configuration-driven provider selection
- Extensible for new providers (webhook, SMS, Teams, PagerDuty, etc.)
"""

import os
import logging
from typing import Dict, Type, Optional, List, Any, Protocol
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


# ============================================
# Provider Types
# ============================================

class ProviderType(str, Enum):
    """Supported notification provider types."""
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    # Future providers
    # TEAMS = "teams"
    # PAGERDUTY = "pagerduty"
    # SMS = "sms"


# ============================================
# Provider Configuration
# ============================================

@dataclass
class BaseProviderConfig:
    """Base configuration for all providers."""
    enabled: bool = True
    timeout_seconds: int = 30
    retry_max_attempts: int = 3


@dataclass
class EmailProviderConfig(BaseProviderConfig):
    """Email provider configuration."""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True
    from_email: str = "alerts@cloudact.ai"
    from_name: str = "CloudAct.AI"
    subject_prefix: str = "[CloudAct.AI]"

    @classmethod
    def from_env(cls) -> "EmailProviderConfig":
        """Create config from environment variables."""
        return cls(
            enabled=os.environ.get("EMAIL_ENABLED", "true").lower() == "true",
            smtp_host=os.environ.get("EMAIL_SMTP_HOST", os.environ.get("SMTP_HOST", "smtp.gmail.com")),
            smtp_port=int(os.environ.get("EMAIL_SMTP_PORT", os.environ.get("SMTP_PORT", "587"))),
            smtp_username=os.environ.get("EMAIL_SMTP_USERNAME", os.environ.get("SMTP_USERNAME")),
            smtp_password=os.environ.get("EMAIL_SMTP_PASSWORD", os.environ.get("SMTP_PASSWORD")),
            smtp_use_tls=os.environ.get("EMAIL_SMTP_USE_TLS", "true").lower() == "true",
            from_email=os.environ.get("EMAIL_FROM_ADDRESS", "alerts@cloudact.ai"),
            from_name=os.environ.get("EMAIL_FROM_NAME", "CloudAct.AI"),
        )


@dataclass
class SlackProviderConfig(BaseProviderConfig):
    """Slack provider configuration."""
    webhook_url: Optional[str] = None
    channel: Optional[str] = None
    username: str = "CloudAct Alerts"
    icon_emoji: str = ":bell:"
    mention_channel: bool = False
    mention_users: List[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "SlackProviderConfig":
        """Create config from environment variables."""
        return cls(
            enabled=os.environ.get("SLACK_ENABLED", "true").lower() == "true",
            webhook_url=os.environ.get("SLACK_WEBHOOK_URL"),
            channel=os.environ.get("SLACK_DEFAULT_CHANNEL"),
            username=os.environ.get("SLACK_BOT_USERNAME", "CloudAct Alerts"),
        )


@dataclass
class WebhookProviderConfig(BaseProviderConfig):
    """Generic webhook provider configuration."""
    url: Optional[str] = None
    method: str = "POST"
    headers: Dict[str, str] = field(default_factory=dict)
    auth_type: Optional[str] = None  # "bearer", "basic", "api_key"
    auth_token: Optional[str] = None


# ============================================
# Notification Message (Provider-agnostic)
# ============================================

@dataclass
class NotificationPayload:
    """
    Provider-agnostic notification payload.

    Used to send notifications without coupling to a specific provider's message format.
    """
    # Core fields
    title: str
    message: str
    severity: str = "info"  # info, warning, error, critical

    # Context
    org_slug: Optional[str] = None
    alert_id: Optional[str] = None
    alert_name: Optional[str] = None

    # Recipients (for email)
    recipients: List[str] = field(default_factory=list)

    # Data
    data: Dict[str, Any] = field(default_factory=dict)

    # Formatting
    html_body: Optional[str] = None
    text_body: Optional[str] = None

    # Provider-specific overrides
    slack_channel: Optional[str] = None
    slack_mention_channel: bool = False
    slack_mention_users: List[str] = field(default_factory=list)

    webhook_url: Optional[str] = None
    webhook_headers: Dict[str, str] = field(default_factory=dict)


# ============================================
# Provider Interface
# ============================================

class NotificationProviderInterface(ABC):
    """
    Abstract interface for notification providers.

    All providers must implement this interface.
    """

    @property
    @abstractmethod
    def provider_type(self) -> ProviderType:
        """Return the provider type."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if provider is properly configured."""
        pass

    @abstractmethod
    async def send(self, payload: NotificationPayload) -> bool:
        """
        Send a notification.

        Args:
            payload: Provider-agnostic notification payload

        Returns:
            True if successful, False otherwise
        """
        pass

    @abstractmethod
    async def validate_config(self) -> Dict[str, Any]:
        """
        Validate provider configuration.

        Returns:
            Dict with validation results
        """
        pass


# ============================================
# Provider Registry
# ============================================

class NotificationProviderRegistry:
    """
    Central registry for notification providers.

    MT-FIX: Multi-tenant aware with org-specific provider caching.

    Provides:
    - Provider registration and lookup
    - Factory methods for creating providers
    - Configuration management
    - Org-specific provider isolation

    Usage:
        registry = NotificationProviderRegistry()
        registry.register(ProviderType.EMAIL, EmailNotificationAdapter)

        # Default provider (uses global config)
        provider = registry.get_provider(ProviderType.EMAIL)
        await provider.send(payload)

        # Org-specific provider (uses org config)
        provider = registry.get_provider(ProviderType.SLACK, org_slug="acme_corp")
        await provider.send(payload)
    """

    _instance: Optional["NotificationProviderRegistry"] = None
    MAX_CACHE_SIZE = 100  # Prevent memory exhaustion

    def __new__(cls) -> "NotificationProviderRegistry":
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._providers: Dict[ProviderType, Type[NotificationProviderInterface]] = {}
        # MT-FIX: Cache instances by composite key (org_slug:provider_type)
        self._instances: Dict[str, NotificationProviderInterface] = {}
        # MT-FIX: Store global configs (fallback) and org-specific configs separately
        self._global_configs: Dict[ProviderType, BaseProviderConfig] = {}
        self._org_configs: Dict[str, BaseProviderConfig] = {}  # key: org_slug:provider_type
        self._initialized = True

        # Auto-register built-in providers
        self._register_builtin_providers()

    def _register_builtin_providers(self):
        """Register built-in providers with default configs."""
        # Import adapters here to avoid circular imports
        from .adapters import (
            EmailNotificationAdapter,
            SlackNotificationAdapter,
            WebhookNotificationAdapter,
        )

        self.register(ProviderType.EMAIL, EmailNotificationAdapter)
        self.register(ProviderType.SLACK, SlackNotificationAdapter)
        self.register(ProviderType.WEBHOOK, WebhookNotificationAdapter)

        # Set default global configs from environment
        self.set_global_config(ProviderType.EMAIL, EmailProviderConfig.from_env())
        self.set_global_config(ProviderType.SLACK, SlackProviderConfig.from_env())

    def _make_cache_key(self, provider_type: ProviderType, org_slug: Optional[str] = None) -> str:
        """Create composite cache key for provider instances."""
        if org_slug:
            return f"{org_slug}:{provider_type.value}"
        return f"__global__:{provider_type.value}"

    def _evict_oldest_if_needed(self):
        """MT-FIX: Prevent memory exhaustion by evicting old entries."""
        while len(self._instances) > self.MAX_CACHE_SIZE:
            # Evict first entry (oldest)
            oldest_key = next(iter(self._instances))
            del self._instances[oldest_key]
            logger.debug(f"Evicted provider instance: {oldest_key}")

    def register(
        self,
        provider_type: ProviderType,
        provider_class: Type[NotificationProviderInterface]
    ):
        """
        Register a provider class.

        Args:
            provider_type: The type of provider
            provider_class: The provider class (must implement NotificationProviderInterface)
        """
        self._providers[provider_type] = provider_class
        logger.debug(f"Registered notification provider: {provider_type.value}")

    def set_config(
        self,
        provider_type: ProviderType,
        config: BaseProviderConfig,
        org_slug: Optional[str] = None
    ):
        """
        Set configuration for a provider.

        MT-FIX: Supports org-specific configurations for multi-tenant isolation.

        Args:
            provider_type: The type of provider
            config: Provider configuration
            org_slug: Optional org slug for org-specific config
        """
        if org_slug:
            # Org-specific config
            key = f"{org_slug}:{provider_type.value}"
            self._org_configs[key] = config
            # Clear org-specific cached instance
            cache_key = self._make_cache_key(provider_type, org_slug)
            if cache_key in self._instances:
                del self._instances[cache_key]
        else:
            # Global config
            self._global_configs[provider_type] = config
            # Clear global cached instance
            cache_key = self._make_cache_key(provider_type)
            if cache_key in self._instances:
                del self._instances[cache_key]

    def set_global_config(self, provider_type: ProviderType, config: BaseProviderConfig):
        """Set global (default) configuration for a provider."""
        self.set_config(provider_type, config, org_slug=None)

    def set_org_config(
        self,
        org_slug: str,
        provider_type: ProviderType,
        config: BaseProviderConfig
    ):
        """Set org-specific configuration for a provider."""
        self.set_config(provider_type, config, org_slug=org_slug)

    def get_config(
        self,
        provider_type: ProviderType,
        org_slug: Optional[str] = None
    ) -> Optional[BaseProviderConfig]:
        """
        Get configuration for a provider.

        MT-FIX: Returns org-specific config if available, otherwise global config.
        """
        if org_slug:
            key = f"{org_slug}:{provider_type.value}"
            org_config = self._org_configs.get(key)
            if org_config:
                return org_config
        # Fallback to global config
        return self._global_configs.get(provider_type)

    def get_provider(
        self,
        provider_type: ProviderType,
        org_slug: Optional[str] = None
    ) -> Optional[NotificationProviderInterface]:
        """
        Get or create a provider instance.

        MT-FIX: Org-aware provider caching for multi-tenant isolation.

        Args:
            provider_type: The type of provider
            org_slug: Optional org slug for org-specific provider

        Returns:
            Provider instance or None if not registered
        """
        if provider_type not in self._providers:
            logger.warning(f"Provider not registered: {provider_type.value}")
            return None

        cache_key = self._make_cache_key(provider_type, org_slug)

        # Return cached instance if exists
        if cache_key in self._instances:
            return self._instances[cache_key]

        # Create new instance with appropriate config
        provider_class = self._providers[provider_type]
        config = self.get_config(provider_type, org_slug)

        try:
            instance = provider_class(config)
            self._evict_oldest_if_needed()
            self._instances[cache_key] = instance
            return instance
        except Exception as e:
            logger.error(f"Failed to create provider {provider_type.value}: {e}")
            return None

    def get_available_providers(self) -> List[ProviderType]:
        """Get list of registered provider types."""
        return list(self._providers.keys())

    def get_configured_providers(
        self,
        org_slug: Optional[str] = None
    ) -> List[ProviderType]:
        """
        Get list of properly configured providers.

        MT-FIX: Check org-specific configuration.
        """
        configured = []
        for provider_type in self._providers:
            provider = self.get_provider(provider_type, org_slug)
            if provider and provider.is_configured:
                configured.append(provider_type)
        return configured

    async def send_to_channels(
        self,
        payload: NotificationPayload,
        channels: List[str],
        org_slug: Optional[str] = None
    ) -> Dict[str, bool]:
        """
        Send notification to multiple channels.

        MT-FIX: Uses org-specific providers for multi-tenant isolation.

        Args:
            payload: Notification payload
            channels: List of channel names ("email", "slack", "webhook")
            org_slug: Optional org slug for org-specific provider

        Returns:
            Dict mapping channel name to success status
        """
        # Use org_slug from payload if not provided
        if not org_slug and payload.org_slug:
            org_slug = payload.org_slug

        results = {}

        for channel in channels:
            try:
                provider_type = ProviderType(channel)
                # MT-FIX: Get org-specific provider
                provider = self.get_provider(provider_type, org_slug)

                if not provider:
                    logger.warning(f"Provider not available: {channel}")
                    results[channel] = False
                    continue

                if not provider.is_configured:
                    logger.warning(f"Provider not configured: {channel}")
                    results[channel] = False
                    continue

                success = await provider.send(payload)
                results[channel] = success

            except ValueError:
                logger.warning(f"Unknown channel: {channel}")
                results[channel] = False
            except Exception as e:
                logger.error(f"Failed to send via {channel}: {e}")
                results[channel] = False

        return results

    def clear_cache(self, org_slug: Optional[str] = None):
        """
        Clear cached provider instances.

        MT-FIX: Can clear all or org-specific cache.

        Args:
            org_slug: If provided, only clear cache for this org
        """
        if org_slug:
            # Clear only org-specific entries
            keys_to_delete = [
                k for k in self._instances
                if k.startswith(f"{org_slug}:")
            ]
            for key in keys_to_delete:
                del self._instances[key]
        else:
            # Clear all
            self._instances.clear()

    def clear_org_cache(self, org_slug: str):
        """Clear cache for a specific org."""
        self.clear_cache(org_slug)


# ============================================
# Global Registry Access
# ============================================

_registry: Optional[NotificationProviderRegistry] = None


def get_notification_registry() -> NotificationProviderRegistry:
    """Get the global notification provider registry."""
    global _registry
    if _registry is None:
        _registry = NotificationProviderRegistry()
    return _registry


def reset_registry():
    """Reset the global registry (for testing)."""
    global _registry
    _registry = None
    NotificationProviderRegistry._instance = None
