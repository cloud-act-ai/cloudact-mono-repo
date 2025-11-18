"""
FastAPI Dependencies Module
Exports authentication, rate limiting, and other dependency injection functions.
"""

from src.app.dependencies.auth import (
    # Tenant authentication and authorization
    get_current_tenant,
    validate_subscription,
    validate_quota,
    increment_pipeline_usage,
    get_tenant_credentials,
    get_provider_config,

    # Core authentication components
    TenantContext,
    hash_api_key,
    verify_api_key,
    verify_api_key_header,
    optional_auth,
    verify_admin_key,
)

from src.app.dependencies.rate_limit_decorator import (
    rate_limit_by_tenant,
    rate_limit_global,
    get_tenant_from_request,
)

__all__ = [
    # Tenant authentication and authorization
    "get_current_tenant",
    "validate_subscription",
    "validate_quota",
    "increment_pipeline_usage",
    "get_tenant_credentials",
    "get_provider_config",

    # Core authentication components
    "TenantContext",
    "hash_api_key",
    "verify_api_key",
    "verify_api_key_header",
    "optional_auth",
    "verify_admin_key",

    # Rate limiting
    "rate_limit_by_tenant",
    "rate_limit_global",
    "get_tenant_from_request",
]
