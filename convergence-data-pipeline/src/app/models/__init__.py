"""
Tenant management models package.

Exports all tenant-related models, enums, and constants for use throughout the application.
"""

from .tenant_models import (
    # Enums
    SubscriptionPlan,
    TenantStatus,
    Provider,
    CredentialType,
    Domain,
    SubscriptionStatus,
    ValidationStatus,

    # Constants
    SUBSCRIPTION_LIMITS,

    # Request Models
    OnboardTenantRequest,
    CreateAPIKeyRequest,
    AddCredentialRequest,
    CreateProviderConfigRequest,
    UpdateSubscriptionRequest,
    UpgradeSubscriptionRequest,
    UpdateLimitsRequest,

    # Response Models
    TenantProfileResponse,
    APIKeyResponse,
    CredentialResponse,
    SubscriptionResponse,
    UsageQuotaResponse,
    ValidationResponse,
    ProviderConfigResponse,
    LimitsResponse,
)

# Backward compatibility aliases
CustomerStatus = TenantStatus
OnboardCustomerRequest = OnboardTenantRequest
CustomerProfileResponse = TenantProfileResponse

__all__ = [
    # Enums
    "SubscriptionPlan",
    "TenantStatus",
    "CustomerStatus",  # Backward compat
    "Provider",
    "CredentialType",
    "Domain",
    "SubscriptionStatus",
    "ValidationStatus",

    # Constants
    "SUBSCRIPTION_LIMITS",

    # Request Models
    "OnboardTenantRequest",
    "OnboardCustomerRequest",  # Backward compat
    "CreateAPIKeyRequest",
    "AddCredentialRequest",
    "CreateProviderConfigRequest",
    "UpdateSubscriptionRequest",
    "UpgradeSubscriptionRequest",
    "UpdateLimitsRequest",

    # Response Models
    "TenantProfileResponse",
    "CustomerProfileResponse",  # Backward compat
    "APIKeyResponse",
    "CredentialResponse",
    "SubscriptionResponse",
    "UsageQuotaResponse",
    "ValidationResponse",
    "ProviderConfigResponse",
    "LimitsResponse",
]
