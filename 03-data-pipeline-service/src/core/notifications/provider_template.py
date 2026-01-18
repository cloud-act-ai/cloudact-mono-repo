"""
Provider Template

This file shows how to add new notification providers to the system.

To add a new provider (e.g., Teams, Jira, PagerDuty, SMS):

1. Add the provider type to ProviderType enum in registry.py
2. Create a config dataclass in registry.py
3. Implement the adapter class below
4. Register in _register_builtin_providers() in registry.py

Example providers that can be added:
- Microsoft Teams (via Incoming Webhooks)
- Jira (via REST API for issue creation)
- PagerDuty (via Events API v2)
- SMS (via Twilio or AWS SNS)
- Discord (via webhooks)
"""

import aiohttp
import asyncio
import logging
from typing import Dict, Any, Optional, List, ClassVar
from dataclasses import dataclass, field

from .registry import (
    NotificationProviderInterface,
    NotificationPayload,
    ProviderType,
    BaseProviderConfig,
)

logger = logging.getLogger(__name__)


# ==============================================================================
# Step 1: Add ProviderType in registry.py
# ==============================================================================
# class ProviderType(str, Enum):
#     ...existing...
#     TEAMS = "teams"
#     JIRA = "jira"
#     PAGERDUTY = "pagerduty"
#     SMS = "sms"


# ==============================================================================
# Step 2: Create Config Dataclass in registry.py
# ==============================================================================

@dataclass
class TeamsProviderConfig(BaseProviderConfig):
    """Microsoft Teams provider configuration."""
    webhook_url: Optional[str] = None
    title_prefix: str = "[CloudAct.AI]"
    theme_color: str = "0076D7"  # Microsoft blue

    @classmethod
    def from_env(cls) -> "TeamsProviderConfig":
        """Create config from environment variables."""
        import os
        return cls(
            enabled=os.environ.get("TEAMS_ENABLED", "true").lower() == "true",
            webhook_url=os.environ.get("TEAMS_WEBHOOK_URL"),
        )


@dataclass
class JiraProviderConfig(BaseProviderConfig):
    """Jira provider configuration for creating issues."""
    base_url: Optional[str] = None  # e.g., https://company.atlassian.net
    api_token: Optional[str] = None
    user_email: Optional[str] = None
    project_key: Optional[str] = None  # e.g., "OPS"
    issue_type: str = "Task"  # or "Bug", "Alert", etc.
    priority: str = "Medium"

    @classmethod
    def from_env(cls) -> "JiraProviderConfig":
        import os
        return cls(
            enabled=os.environ.get("JIRA_ENABLED", "false").lower() == "true",
            base_url=os.environ.get("JIRA_BASE_URL"),
            api_token=os.environ.get("JIRA_API_TOKEN"),
            user_email=os.environ.get("JIRA_USER_EMAIL"),
            project_key=os.environ.get("JIRA_PROJECT_KEY"),
        )


@dataclass
class PagerDutyProviderConfig(BaseProviderConfig):
    """PagerDuty provider configuration."""
    integration_key: Optional[str] = None  # PagerDuty service integration key
    source: str = "CloudAct.AI"

    @classmethod
    def from_env(cls) -> "PagerDutyProviderConfig":
        import os
        return cls(
            enabled=os.environ.get("PAGERDUTY_ENABLED", "false").lower() == "true",
            integration_key=os.environ.get("PAGERDUTY_INTEGRATION_KEY"),
        )


# ==============================================================================
# Step 3: Implement Adapter Class
# ==============================================================================

class TeamsNotificationAdapter(NotificationProviderInterface):
    """
    Microsoft Teams notification provider.

    Uses Teams Incoming Webhooks for delivery.
    See: https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/
    """

    # Shared session for connection reuse
    _session: ClassVar[Optional[aiohttp.ClientSession]] = None
    _session_lock: ClassVar[asyncio.Lock] = None

    def __init__(self, config: Optional[BaseProviderConfig] = None):
        if config is not None and not isinstance(config, TeamsProviderConfig):
            raise TypeError(f"Expected TeamsProviderConfig, got {type(config).__name__}")
        self._config: TeamsProviderConfig = config or TeamsProviderConfig.from_env()

    def __repr__(self) -> str:
        return f"<TeamsNotificationAdapter configured={self.is_configured}>"

    @classmethod
    async def _get_session(cls) -> aiohttp.ClientSession:
        """Get or create shared aiohttp session."""
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
        # Note: You need to add TEAMS to ProviderType enum
        return ProviderType.WEBHOOK  # Placeholder

    @property
    def is_configured(self) -> bool:
        return bool(self._config.enabled and self._config.webhook_url)

    async def send(self, payload: NotificationPayload) -> bool:
        """Send Teams notification via webhook."""
        if not self.is_configured:
            logger.warning("Teams provider not configured")
            return False

        try:
            # Build Teams Adaptive Card message
            teams_payload = self._build_teams_message(payload)

            session = await self._get_session()
            async with session.post(
                self._config.webhook_url,
                json=teams_payload,
                timeout=aiohttp.ClientTimeout(total=self._config.timeout_seconds)
            ) as response:
                if response.status == 200:
                    logger.info(f"Teams notification sent: {payload.title[:50]}")
                    return True
                else:
                    logger.error(f"Teams webhook failed: {response.status}")
                    return False

        except asyncio.TimeoutError:
            logger.error(f"Teams webhook timed out")
            return False
        except Exception as e:
            logger.error(f"Teams send failed: {e}", exc_info=True)
            return False

    def _build_teams_message(self, payload: NotificationPayload) -> Dict[str, Any]:
        """Build Teams Adaptive Card message."""
        severity_colors = {
            "info": "good",
            "warning": "warning",
            "error": "attention",
            "critical": "attention",
        }
        color = severity_colors.get(payload.severity, "default")

        # MessageCard format (legacy but widely supported)
        return {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": self._config.theme_color,
            "summary": payload.title,
            "sections": [{
                "activityTitle": f"{self._config.title_prefix} {payload.title}",
                "activitySubtitle": f"Severity: {payload.severity.upper()}",
                "facts": [
                    {"name": "Organization", "value": payload.org_slug or "N/A"},
                    {"name": "Alert ID", "value": payload.alert_id or "N/A"},
                ],
                "markdown": True,
                "text": payload.message,
            }],
        }

    async def validate_config(self) -> Dict[str, Any]:
        """Validate Teams configuration."""
        issues = []

        if not self._config.webhook_url:
            issues.append("Webhook URL not configured")
        elif not self._config.webhook_url.startswith("https://"):
            issues.append("Webhook URL must use HTTPS")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "config": {
                "webhook_configured": bool(self._config.webhook_url),
            }
        }


# ==============================================================================
# Step 4: Register in registry.py _register_builtin_providers()
# ==============================================================================
# def _register_builtin_providers(self):
#     from .adapters import (
#         EmailNotificationAdapter,
#         SlackNotificationAdapter,
#         WebhookNotificationAdapter,
#     )
#     from .provider_template import TeamsNotificationAdapter  # Add this
#
#     self.register(ProviderType.EMAIL, EmailNotificationAdapter)
#     self.register(ProviderType.SLACK, SlackNotificationAdapter)
#     self.register(ProviderType.WEBHOOK, WebhookNotificationAdapter)
#     self.register(ProviderType.TEAMS, TeamsNotificationAdapter)  # Add this
#
#     # Set default configs
#     self.set_global_config(ProviderType.EMAIL, EmailProviderConfig.from_env())
#     self.set_global_config(ProviderType.SLACK, SlackProviderConfig.from_env())
#     self.set_global_config(ProviderType.TEAMS, TeamsProviderConfig.from_env())  # Add this


# ==============================================================================
# Usage Example
# ==============================================================================
#
# from core.notifications import get_notification_registry, NotificationPayload, ProviderType
#
# # Configure Teams for an org
# registry = get_notification_registry()
# registry.set_org_config(
#     "acme_corp",
#     ProviderType.TEAMS,
#     TeamsProviderConfig(
#         enabled=True,
#         webhook_url="https://outlook.office.com/webhook/...",
#     )
# )
#
# # Send notification
# payload = NotificationPayload(
#     title="Cost Alert",
#     message="Your costs exceeded $100",
#     severity="warning",
#     org_slug="acme_corp",
# )
# provider = registry.get_provider(ProviderType.TEAMS, org_slug="acme_corp")
# await provider.send(payload)
