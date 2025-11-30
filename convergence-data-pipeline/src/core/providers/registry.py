"""
Provider Registry - Single Source of Truth for Provider Configuration

Loads provider configuration from configs/system/providers.yml
All provider-related code should use this registry instead of hardcoded values.

Usage:
    from src.core.providers.registry import provider_registry

    # Check if provider is valid
    if provider_registry.is_valid_provider("OPENAI"):
        ...

    # Get all LLM providers
    llm_providers = provider_registry.get_llm_providers()

    # Get provider config
    config = provider_registry.get_provider("OPENAI")
    print(config.api_base_url)
"""

import yaml
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from functools import lru_cache

logger = logging.getLogger(__name__)


@dataclass
class ProviderConfig:
    """Configuration for a single provider."""
    name: str
    type: str  # "llm" or "cloud"
    credential_type: str  # "API_KEY" or "SERVICE_ACCOUNT_JSON"
    display_name: str
    context_key: str
    api_base_url: Optional[str] = None
    validation_endpoint: Optional[str] = None
    auth_header: Optional[str] = None
    auth_prefix: str = ""
    key_prefix: Optional[str] = None
    extra_headers: Dict[str, str] = field(default_factory=dict)
    required_fields: List[str] = field(default_factory=list)
    expected_type: Optional[str] = None
    # LLM data tables config (for pricing/subscriptions)
    data_tables: Dict[str, str] = field(default_factory=dict)


class ProviderRegistry:
    """
    Provider registry that loads configuration from YAML.

    Single source of truth for all provider-related information.
    To add a new provider: just update configs/system/providers.yml
    """

    _instance: Optional["ProviderRegistry"] = None
    _providers: Dict[str, ProviderConfig] = {}
    _config_path: Path = Path("configs/system/providers.yml")
    _loaded: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._loaded:
            self._load_config()

    def _load_config(self) -> None:
        """Load provider configuration from YAML file."""
        if not self._config_path.exists():
            logger.warning(f"Provider config not found at {self._config_path}, using defaults")
            self._load_defaults()
            return

        try:
            with open(self._config_path, 'r') as f:
                config = yaml.safe_load(f)

            providers_data = config.get("providers", {})
            for name, data in providers_data.items():
                self._providers[name] = ProviderConfig(
                    name=name,
                    type=data.get("type", "llm"),
                    credential_type=data.get("credential_type", "API_KEY"),
                    display_name=data.get("display_name", name),
                    context_key=data.get("context_key", f"{name.lower()}_credential"),
                    api_base_url=data.get("api_base_url"),
                    validation_endpoint=data.get("validation_endpoint"),
                    auth_header=data.get("auth_header"),
                    auth_prefix=data.get("auth_prefix", ""),
                    key_prefix=data.get("key_prefix"),
                    extra_headers=data.get("extra_headers", {}),
                    required_fields=data.get("required_fields", []),
                    expected_type=data.get("expected_type"),
                    data_tables=data.get("data_tables", {}),
                )

            self._provider_groups = config.get("provider_groups", {})
            self._defaults = config.get("defaults", {})
            self._loaded = True
            logger.info(f"Loaded {len(self._providers)} providers from {self._config_path}")

        except Exception as e:
            logger.error(f"Failed to load provider config: {e}")
            self._load_defaults()

    def _load_defaults(self) -> None:
        """Load default provider configuration (fallback)."""
        self._providers = {
            "OPENAI": ProviderConfig(
                name="OPENAI",
                type="llm",
                credential_type="API_KEY",
                display_name="OpenAI API Key",
                context_key="openai_api_key",
                api_base_url="https://api.openai.com/v1",
                validation_endpoint="/models",
                auth_header="Authorization",
                auth_prefix="Bearer ",
                key_prefix="sk-",
            ),
            "ANTHROPIC": ProviderConfig(
                name="ANTHROPIC",
                type="llm",
                credential_type="API_KEY",
                display_name="Anthropic API Key",
                context_key="anthropic_api_key",
                api_base_url="https://api.anthropic.com/v1",
                validation_endpoint="/models",
                auth_header="x-api-key",
                auth_prefix="",
                extra_headers={"anthropic-version": "2023-06-01"},
            ),
            "CLAUDE": ProviderConfig(
                name="CLAUDE",
                type="llm",
                credential_type="API_KEY",
                display_name="Claude API Key",
                context_key="claude_api_key",
                api_base_url="https://api.anthropic.com/v1",
                validation_endpoint="/models",
                auth_header="x-api-key",
                auth_prefix="",
                extra_headers={"anthropic-version": "2023-06-01"},
            ),
            "GCP_SA": ProviderConfig(
                name="GCP_SA",
                type="cloud",
                credential_type="SERVICE_ACCOUNT_JSON",
                display_name="GCP Service Account",
                context_key="gcp_sa_json",
                required_fields=["type", "project_id", "private_key", "client_email"],
                expected_type="service_account",
            ),
        }
        self._provider_groups = {
            "llm": ["OPENAI", "ANTHROPIC"],
            "cloud": ["GCP_SA"],
            "all": ["OPENAI", "ANTHROPIC", "GCP_SA"],
        }
        self._defaults = {"http_timeout": 15.0, "validation_timeout": 10.0}
        self._loaded = True

    def reload(self) -> None:
        """Force reload configuration from YAML file."""
        self._loaded = False
        self._providers = {}
        self._load_config()

    # =====================================================
    # Provider Lookup Methods
    # =====================================================

    def get_provider(self, name: str) -> Optional[ProviderConfig]:
        """Get provider configuration by name."""
        return self._providers.get(name.upper())

    def is_valid_provider(self, name: str) -> bool:
        """Check if provider name is valid."""
        return name.upper() in self._providers

    def get_all_providers(self) -> List[str]:
        """Get list of all valid provider names."""
        return list(self._providers.keys())

    def get_llm_providers(self) -> List[str]:
        """Get list of LLM provider names."""
        return [name for name, config in self._providers.items() if config.type == "llm"]

    def get_cloud_providers(self) -> List[str]:
        """Get list of cloud provider names."""
        return [name for name, config in self._providers.items() if config.type == "cloud"]

    def is_llm_provider(self, name: str) -> bool:
        """Check if provider is an LLM provider."""
        provider = self.get_provider(name)
        return provider is not None and provider.type == "llm"

    def is_cloud_provider(self, name: str) -> bool:
        """Check if provider is a cloud provider."""
        provider = self.get_provider(name)
        return provider is not None and provider.type == "cloud"

    # =====================================================
    # Credential Type Methods
    # =====================================================

    def get_credential_type(self, name: str) -> Optional[str]:
        """Get credential type for a provider."""
        provider = self.get_provider(name)
        return provider.credential_type if provider else None

    def get_credential_types_map(self) -> Dict[str, str]:
        """Get mapping of provider names to credential types."""
        return {name: config.credential_type for name, config in self._providers.items()}

    # =====================================================
    # Context Key Methods
    # =====================================================

    def get_context_key(self, name: str) -> Optional[str]:
        """Get context key for storing decrypted credential."""
        provider = self.get_provider(name)
        return provider.context_key if provider else None

    def get_context_keys_map(self) -> Dict[str, str]:
        """Get mapping of provider names to context keys."""
        return {name: config.context_key for name, config in self._providers.items()}

    # =====================================================
    # Display Name Methods
    # =====================================================

    def get_display_name(self, name: str) -> Optional[str]:
        """Get display name for a provider."""
        provider = self.get_provider(name)
        return provider.display_name if provider else None

    def get_display_names_map(self) -> Dict[str, str]:
        """Get mapping of provider names to display names."""
        return {name: config.display_name for name, config in self._providers.items()}

    # =====================================================
    # Validation Methods
    # =====================================================

    def get_validation_url(self, name: str) -> Optional[str]:
        """Get full validation URL for a provider."""
        provider = self.get_provider(name)
        if provider and provider.api_base_url and provider.validation_endpoint:
            return f"{provider.api_base_url}{provider.validation_endpoint}"
        return None

    def get_auth_headers(self, name: str, credential: str) -> Dict[str, str]:
        """Get authentication headers for a provider."""
        provider = self.get_provider(name)
        if not provider or not provider.auth_header:
            return {}

        headers = {provider.auth_header: f"{provider.auth_prefix}{credential}"}
        headers.update(provider.extra_headers or {})
        return headers

    # =====================================================
    # Data Tables Methods (LLM Pricing/Subscriptions)
    # =====================================================

    def get_data_tables(self, name: str) -> Optional[Dict[str, str]]:
        """Get data tables config for a provider."""
        provider = self.get_provider(name)
        return provider.data_tables if provider else None

    def get_pricing_table(self, name: str) -> Optional[str]:
        """Get pricing table name for a provider."""
        tables = self.get_data_tables(name)
        return tables.get("pricing_table") if tables else None

    def get_subscriptions_table(self, name: str) -> Optional[str]:
        """Get subscriptions table name for a provider."""
        tables = self.get_data_tables(name)
        return tables.get("subscriptions_table") if tables else None

    def get_seed_path(self, name: str) -> Optional[str]:
        """Get seed data path for a provider."""
        tables = self.get_data_tables(name)
        return tables.get("seed_path") if tables else None

    def get_pricing_schema(self, name: str) -> Optional[str]:
        """Get pricing schema filename for a provider."""
        tables = self.get_data_tables(name)
        return tables.get("pricing_schema") if tables else None

    def get_subscriptions_schema(self, name: str) -> Optional[str]:
        """Get subscriptions schema filename for a provider."""
        tables = self.get_data_tables(name)
        return tables.get("subscriptions_schema") if tables else None

    def has_data_tables(self, name: str) -> bool:
        """Check if provider has data tables config."""
        tables = self.get_data_tables(name)
        return bool(tables and tables.get("pricing_table"))

    # =====================================================
    # Provider Normalization
    # =====================================================

    def normalize_provider(self, name: str) -> Optional[str]:
        """
        Normalize provider name to internal format.
        Handles common aliases like 'gcp' -> 'GCP_SA', 'claude' -> 'ANTHROPIC'
        """
        name_upper = name.upper()

        # Direct match
        if name_upper in self._providers:
            return name_upper

        # Common aliases
        aliases = {
            "GCP": "GCP_SA",
            "GCP_SERVICE_ACCOUNT": "GCP_SA",
            "CLAUDE": "ANTHROPIC",  # Claude is an alias for Anthropic
        }

        return aliases.get(name_upper)

    def get_provider_aliases(self) -> Dict[str, str]:
        """Get all provider aliases mapped to canonical names."""
        return {
            "gcp": "GCP_SA",
            "gcp_sa": "GCP_SA",
            "gcp_service_account": "GCP_SA",
            "openai": "OPENAI",
            "anthropic": "ANTHROPIC",
            "claude": "ANTHROPIC",
        }

    # =====================================================
    # Default Settings
    # =====================================================

    def get_http_timeout(self) -> float:
        """Get default HTTP timeout."""
        return self._defaults.get("http_timeout", 15.0)

    def get_validation_timeout(self) -> float:
        """Get validation timeout."""
        return self._defaults.get("validation_timeout", 10.0)


# Singleton instance
provider_registry = ProviderRegistry()


@lru_cache()
def get_provider_registry() -> ProviderRegistry:
    """Get the provider registry singleton."""
    return provider_registry
