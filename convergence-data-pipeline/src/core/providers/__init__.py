"""
Provider Registry Package

Single source of truth for provider configuration.
To add a new provider: update configs/system/providers.yml - no code changes needed.

Usage:
    from src.core.providers import provider_registry, validate_credential

    # Check provider
    if provider_registry.is_valid_provider("OPENAI"):
        ...

    # Validate any credential (works for any provider in config)
    result = await validate_credential("OPENAI", "sk-xxx")
"""

from src.core.providers.registry import provider_registry, get_provider_registry, ProviderConfig
from src.core.providers.validator import validate_credential, validate_credential_format

__all__ = [
    "provider_registry",
    "get_provider_registry",
    "ProviderConfig",
    "validate_credential",
    "validate_credential_format",
]
