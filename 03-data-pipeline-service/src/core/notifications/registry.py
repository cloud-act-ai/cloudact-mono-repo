"""
Notification Provider Registry

Unified provider management with:
- Dynamic provider registration
- Factory pattern for provider instantiation
- Configuration-driven provider selection
- Extensible for new providers (webhook, SMS, Teams, PagerDuty, etc.)
"""

import os
import re
import logging
import threading
from typing import Dict, Type, Optional, List, Any, Protocol
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

# ==============================================================================
# Validation Constants
# ==============================================================================

# Org slug: lowercase alphanumeric + underscores only, 3-50 chars
# Must match canonical pattern across all services
ORG_SLUG_PATTERN = re.compile(r'^[a-z0-9_]{3,50}$')


def _validate_org_slug(org_slug: str) -> str:
    """
    Validate org_slug format to prevent injection attacks.

    Args:
        org_slug: Organization slug to validate

    Returns:
        The validated org_slug

    Raises:
        ValueError: If org_slug format is invalid
    """
    if not org_slug:
        raise ValueError("org_slug cannot be empty")
    if not ORG_SLUG_PATTERN.match(org_slug):
        raise ValueError(f"Invalid org_slug format: {org_slug}")
    return org_slug


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
        """Create config from environment variables.

        Supports both EMAIL_* and SMTP_*/FROM_* prefixes for compatibility.
        """
        return cls(
            enabled=os.environ.get("EMAIL_ENABLED", "true").lower() == "true",
            smtp_host=os.environ.get("EMAIL_SMTP_HOST", os.environ.get("SMTP_HOST", "smtp.gmail.com")),
            smtp_port=int(os.environ.get("EMAIL_SMTP_PORT", os.environ.get("SMTP_PORT", "587"))),
            smtp_username=os.environ.get("EMAIL_SMTP_USERNAME", os.environ.get("SMTP_USERNAME")),
            smtp_password=os.environ.get("EMAIL_SMTP_PASSWORD", os.environ.get("SMTP_PASSWORD")),
            smtp_use_tls=os.environ.get("EMAIL_SMTP_USE_TLS", "true").lower() == "true",
            from_email=os.environ.get("EMAIL_FROM_ADDRESS", os.environ.get("FROM_EMAIL", "alerts@cloudact.ai")),
            from_name=os.environ.get("EMAIL_FROM_NAME", os.environ.get("FROM_NAME", "CloudAct.AI")),
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

    Thread-safe, multi-tenant aware with org-specific provider caching.

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
    _singleton_lock = threading.Lock()  # BUG-001 FIX: Thread-safe singleton
    MAX_CACHE_SIZE = 100  # Prevent memory exhaustion

    def __new__(cls) -> "NotificationProviderRegistry":
        """Thread-safe singleton pattern with double-checked locking."""
        if cls._instance is None:
            with cls._singleton_lock:
                # Double-check inside lock
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
        # BUG-004 FIX: Thread-safe cache operations
        self._cache_lock = threading.RLock()
        self._initialized = True

        # Auto-register built-in providers
        self._register_builtin_providers()

    def __repr__(self) -> str:
        """Return string representation for debugging."""
        return f"<NotificationProviderRegistry providers={list(self._providers.keys())} cached={len(self._instances)}>"

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
            # BUG-003 FIX: Validate org_slug before using in cache key
            validated_slug = _validate_org_slug(org_slug)
            return f"{validated_slug}:{provider_type.value}"
        return f"__global__:{provider_type.value}"

    def _evict_oldest_if_needed(self):
        """Thread-safe cache eviction to prevent memory exhaustion."""
        # BUG-004 FIX: Use lock for thread-safe cache operations
        with self._cache_lock:
            while len(self._instances) > self.MAX_CACHE_SIZE:
                try:
                    oldest_key = next(iter(self._instances))
                    del self._instances[oldest_key]
                    logger.debug(f"Evicted provider instance: {oldest_key}")
                except (StopIteration, KeyError):
                    break

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

        Thread-safe, org-aware provider caching for multi-tenant isolation.

        Args:
            provider_type: The type of provider
            org_slug: Optional org slug for org-specific provider

        Returns:
            Provider instance or None if not registered
        """
        if provider_type not in self._providers:
            logger.warning(f"Provider not registered: {provider_type.value}")
            return None

        try:
            cache_key = self._make_cache_key(provider_type, org_slug)
        except ValueError as e:
            logger.error(f"Invalid org_slug: {e}")
            return None

        # Thread-safe cache access
        with self._cache_lock:
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
        org_slug: Optional[str] = None,
        parallel: bool = True
    ) -> Dict[str, bool]:
        """
        Send notification to multiple channels.

        MT-FIX: Uses org-specific providers for multi-tenant isolation.
        GAP-007 FIX: Supports parallel channel sending for better performance.

        Args:
            payload: Notification payload
            channels: List of channel names ("email", "slack", "webhook")
            org_slug: Optional org slug for org-specific provider
            parallel: If True, send to all channels concurrently (default: True)

        Returns:
            Dict mapping channel name to success status
        """
        import asyncio

        # Use org_slug from payload if not provided
        if not org_slug and payload.org_slug:
            org_slug = payload.org_slug

        # Check config for parallel setting
        try:
            from src.app.config import settings
            parallel = settings.alert_parallel_channels
        except ImportError:
            pass  # Use default if settings not available

        async def _send_to_channel(channel: str) -> tuple:
            """Send to a single channel and return (channel, success)."""
            try:
                provider_type = ProviderType(channel)
                # MT-FIX: Get org-specific provider
                provider = self.get_provider(provider_type, org_slug)

                if not provider:
                    logger.warning(f"Provider not available: {channel}")
                    return (channel, False)

                if not provider.is_configured:
                    logger.warning(f"Provider not configured: {channel}")
                    return (channel, False)

                success = await provider.send(payload)
                return (channel, success)

            except ValueError:
                logger.warning(f"Unknown channel: {channel}")
                return (channel, False)
            except Exception as e:
                logger.error(f"Failed to send via {channel}: {e}")
                return (channel, False)

        if parallel and len(channels) > 1:
            # GAP-007 FIX: Send to all channels concurrently
            tasks = [_send_to_channel(ch) for ch in channels]
            results_list = await asyncio.gather(*tasks, return_exceptions=True)

            results = {}
            for i, result in enumerate(results_list):
                if isinstance(result, Exception):
                    logger.error(f"Channel {channels[i]} raised exception: {result}")
                    results[channels[i]] = False
                elif isinstance(result, tuple) and len(result) == 2:
                    results[result[0]] = result[1]
                else:
                    results[channels[i]] = False
        else:
            # Sequential sending (for single channel or when parallel=False)
            results = {}
            for channel in channels:
                channel_name, success = await _send_to_channel(channel)
                results[channel_name] = success

        return results

    async def close_all_sessions(self):
        """
        GAP-002/GAP-004 FIX: Close all adapter sessions gracefully.

        Call this on application shutdown to release resources.
        """
        from .adapters import SlackNotificationAdapter, WebhookNotificationAdapter

        try:
            await SlackNotificationAdapter.close_session()
            logger.debug("Closed Slack adapter session")
        except Exception as e:
            logger.warning(f"Error closing Slack session: {e}")

        try:
            await WebhookNotificationAdapter.close_session()
            logger.debug("Closed Webhook adapter session")
        except Exception as e:
            logger.warning(f"Error closing Webhook session: {e}")

    def clear_cache(self, org_slug: Optional[str] = None):
        """
        Clear cached provider instances (thread-safe).

        Args:
            org_slug: If provided, only clear cache for this org
        """
        with self._cache_lock:
            if org_slug:
                # Validate org_slug
                try:
                    validated = _validate_org_slug(org_slug)
                except ValueError:
                    logger.warning(f"Invalid org_slug for cache clear: {org_slug}")
                    return

                # Clear only org-specific entries
                keys_to_delete = [
                    k for k in self._instances
                    if k.startswith(f"{validated}:")
                ]
                for key in keys_to_delete:
                    del self._instances[key]
                logger.debug(f"Cleared {len(keys_to_delete)} cache entries for org: {validated}")
            else:
                # Clear all
                count = len(self._instances)
                self._instances.clear()
                logger.debug(f"Cleared all {count} provider cache entries")

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
