"""
Customer management models package.

Exports all customer-related models, enums, and constants for use throughout the application.
"""

from .customer_models import (
    # Enums
    SubscriptionPlan,
    CustomerStatus,
    Provider,
    CredentialType,
    TeamRole,
    Domain,
    SubscriptionStatus,
    MemberStatus,
    ValidationStatus,

    # Constants
    SUBSCRIPTION_LIMITS,

    # Request Models
    OnboardCustomerRequest,
    CreateAPIKeyRequest,
    AddCredentialRequest,
    CreateProviderConfigRequest,
    InviteTeamMemberRequest,
    UpdateSubscriptionRequest,

    # Response Models
    CustomerProfileResponse,
    APIKeyResponse,
    CredentialResponse,
    SubscriptionResponse,
    UsageQuotaResponse,
    TeamMemberResponse,
    ValidationResponse,
    ProviderConfigResponse,

    # Helper Functions
    get_subscription_limits,
    validate_quota_available,
)

__all__ = [
    # Enums
    "SubscriptionPlan",
    "CustomerStatus",
    "Provider",
    "CredentialType",
    "TeamRole",
    "Domain",
    "SubscriptionStatus",
    "MemberStatus",
    "ValidationStatus",

    # Constants
    "SUBSCRIPTION_LIMITS",

    # Request Models
    "OnboardCustomerRequest",
    "CreateAPIKeyRequest",
    "AddCredentialRequest",
    "CreateProviderConfigRequest",
    "InviteTeamMemberRequest",
    "UpdateSubscriptionRequest",

    # Response Models
    "CustomerProfileResponse",
    "APIKeyResponse",
    "CredentialResponse",
    "SubscriptionResponse",
    "UsageQuotaResponse",
    "TeamMemberResponse",
    "ValidationResponse",
    "ProviderConfigResponse",

    # Helper Functions
    "get_subscription_limits",
    "validate_quota_available",
]
