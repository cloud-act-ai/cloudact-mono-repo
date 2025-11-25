"""
FastAPI Dependencies Module
Exports authentication, rate limiting, and other dependency injection functions.
"""

from src.app.dependencies.auth import (
    # Organization authentication and authorization
    get_current_org,
    validate_subscription,
    validate_quota,
    increment_pipeline_usage,
    get_org_credentials,
    get_provider_config,

    # Core authentication components
    OrgContext,
    hash_api_key,
    verify_api_key,
    verify_api_key_header,
    optional_auth,
    verify_admin_key,
)

from src.app.dependencies.rate_limit_decorator import (
    rate_limit_by_org,
    rate_limit_global,
    get_org_from_request,
)

__all__ = [
    # Organization authentication and authorization
    "get_current_org",
    "validate_subscription",
    "validate_quota",
    "increment_pipeline_usage",
    "get_org_credentials",
    "get_provider_config",

    # Core authentication components
    "OrgContext",
    "hash_api_key",
    "verify_api_key",
    "verify_api_key_header",
    "optional_auth",
    "verify_admin_key",

    # Rate limiting
    "rate_limit_by_org",
    "rate_limit_global",
    "get_org_from_request",
]
