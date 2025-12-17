"""
Comprehensive Pydantic models for organization management entities.

This module provides:
- Request models for organization operations
- Response models with appropriate data exposure
- Enums for categorical fields
- Subscription plan limits and constants
- Validation rules for all organization-related data
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr, field_validator, computed_field, ConfigDict, model_validator
import re

# Import i18n models
from src.app.models.i18n_models import (
    SupportedCurrency,
    SupportedLanguage,
    SUPPORTED_TIMEZONES,
    DEFAULT_CURRENCY,
    DEFAULT_TIMEZONE,
    DEFAULT_LANGUAGE,
    DEFAULT_COUNTRY,
    get_country_from_currency,
    currency_validator,
    timezone_validator,
)


# ============================================================================
# ENUMS
# ============================================================================

class SubscriptionPlan(str, Enum):
    """Subscription tier levels.

    Maps to frontend plans:
    - starter -> STARTER
    - professional -> PROFESSIONAL
    - scale -> SCALE
    - enterprise -> ENTERPRISE
    """
    STARTER = "STARTER"
    PROFESSIONAL = "PROFESSIONAL"
    SCALE = "SCALE"
    ENTERPRISE = "ENTERPRISE"


class OrgStatus(str, Enum):
    """Organization account status."""
    ACTIVE = "ACTIVE"
    TRIAL = "TRIAL"
    SUSPENDED = "SUSPENDED"
    CANCELLED = "CANCELLED"


class Provider(str, Enum):
    """Cloud and AI service providers."""
    GCP = "GCP"
    AWS = "AWS"
    AZURE = "AZURE"
    OPENAI = "OPENAI"
    CLAUDE = "CLAUDE"


class CredentialType(str, Enum):
    """Types of credentials supported."""
    SERVICE_ACCOUNT = "SERVICE_ACCOUNT"
    ACCESS_KEY = "ACCESS_KEY"
    API_KEY = "API_KEY"


# TeamRole enum removed - User management is now handled by Supabase frontend
# The data pipeline only receives user_id via X-User-ID header for logging purposes


class Domain(str, Enum):
    """Pipeline domains for provider configurations."""
    COST = "COST"
    SECURITY = "SECURITY"
    COMPLIANCE = "COMPLIANCE"
    OBSERVABILITY = "OBSERVABILITY"


class SubscriptionStatus(str, Enum):
    """Subscription status values."""
    ACTIVE = "ACTIVE"
    TRIAL = "TRIAL"
    EXPIRED = "EXPIRED"
    SUSPENDED = "SUSPENDED"
    CANCELLED = "CANCELLED"


# UserStatus enum removed - User management is now handled by Supabase frontend


class ValidationStatus(str, Enum):
    """Credential validation status."""
    VALID = "VALID"
    INVALID = "INVALID"
    PENDING = "PENDING"
    EXPIRED = "EXPIRED"


# ============================================================================
# SUBSCRIPTION PLAN LIMITS (CONSTANTS)
# ============================================================================

SUBSCRIPTION_LIMITS = {
    SubscriptionPlan.STARTER: {
        "max_team_members": 2,
        "max_providers": 3,
        "max_pipelines_per_day": 6,
        "max_pipelines_per_month": 180,
        "max_concurrent_pipelines": 20,
        "price": 19
    },
    SubscriptionPlan.PROFESSIONAL: {
        "max_team_members": 6,
        "max_providers": 6,
        "max_pipelines_per_day": 25,
        "max_pipelines_per_month": 750,
        "max_concurrent_pipelines": 20,
        "price": None  # TBD
    },
    SubscriptionPlan.SCALE: {
        "max_team_members": 11,
        "max_providers": 10,
        "max_pipelines_per_day": 100,
        "max_pipelines_per_month": 3000,
        "max_concurrent_pipelines": 20,
        "price": 199
    },
    SubscriptionPlan.ENTERPRISE: {
        "max_team_members": 999999,  # Unlimited
        "max_providers": 999999,     # Unlimited
        "max_pipelines_per_day": 999999,   # Unlimited
        "max_pipelines_per_month": 999999, # Unlimited
        "max_concurrent_pipelines": 999999, # Unlimited
        "price": None  # Custom pricing
    }
}


# ============================================================================
# REQUEST MODELS
# ============================================================================

class OnboardOrgRequest(BaseModel):
    """Request model for organization onboarding."""
    org_slug: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Unique organization identifier (3-50 alphanumeric + underscore)"
    )
    company_name: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Company or organization name"
    )
    admin_email: EmailStr = Field(
        ...,
        description="Primary admin email address"
    )
    subscription_plan: SubscriptionPlan = Field(
        default=SubscriptionPlan.STARTER,
        description="Initial subscription plan"
    )
    # i18n fields (set at signup)
    default_currency: SupportedCurrency = Field(
        default=DEFAULT_CURRENCY,
        description="Default currency for cost display (ISO 4217). Selected at signup."
    )
    default_timezone: str = Field(
        default=DEFAULT_TIMEZONE,
        description="Default timezone (IANA format). Selected at signup."
    )

    @field_validator('org_slug')
    @classmethod
    def validate_org_slug(cls, v: str) -> str:
        """Validate org_slug format: alphanumeric + underscore only."""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', v):
            raise ValueError(
                'org_slug must be 3-50 characters containing only '
                'alphanumeric characters and underscores'
            )
        return v

    @field_validator('default_timezone')
    @classmethod
    def validate_default_timezone(cls, v: str) -> str:
        """Validate timezone is in supported list."""
        return timezone_validator(v)

    @computed_field
    @property
    def default_country(self) -> str:
        """Auto-infer country from currency."""
        return get_country_from_currency(self.default_currency.value)

    @computed_field
    @property
    def default_language(self) -> str:
        """Default language (English only for now)."""
        return DEFAULT_LANGUAGE.value

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "org_slug": "acme_corp_prod",
            "company_name": "Acme Corporation",
            "admin_email": "admin@acme.com",
            "subscription_plan": "STARTER",
            "default_currency": "USD",
            "default_timezone": "America/New_York"
        }
    })


class CreateAPIKeyRequest(BaseModel):
    """Request model for creating API keys."""
    key_name: str = Field(
        ...,
        min_length=3,
        max_length=100,
        description="Descriptive name for the API key"
    )
    scopes: List[str] = Field(
        default_factory=list,
        description="Permission scopes for the API key",
        examples=[["pipelines:run", "admin:read"]]
    )
    expires_in_days: Optional[int] = Field(
        default=365,
        ge=1,
        le=3650,
        description="Number of days until expiration (default: 365, max: 10 years)"
    )

    @field_validator('scopes')
    @classmethod
    def validate_scopes(cls, v: List[str]) -> List[str]:
        """Validate scopes are non-empty and properly formatted."""
        if not v:
            raise ValueError('At least one scope must be provided')
        for scope in v:
            if not re.match(r'^[a-z_]+:[a-z_]+$', scope):
                raise ValueError(
                    f'Invalid scope format: {scope}. '
                    f'Expected format: "resource:action"'
                )
        return v

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "key_name": "production_api_key",
            "scopes": ["pipelines:run", "pipelines:read", "credentials:read"],
            "expires_in_days": 365
        }
    })


class AddCredentialRequest(BaseModel):
    """Request model for adding provider credentials."""
    provider: Provider = Field(
        ...,
        description="Cloud or AI service provider"
    )
    credential_type: CredentialType = Field(
        ...,
        description="Type of credential"
    )
    credential_name: str = Field(
        ...,
        min_length=3,
        max_length=100,
        description="Descriptive name for the credential"
    )
    credentials: Dict[str, Any] = Field(
        ...,
        description="Credential data (will be encrypted at rest)"
    )
    project_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Project or account identifier"
    )
    region: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Cloud region (e.g., us-central1, us-east-1)"
    )
    scopes: Optional[List[str]] = Field(
        default=None,
        description="OAuth scopes or permissions for the credential"
    )

    @field_validator('credentials')
    @classmethod
    def validate_credentials(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Validate credentials dictionary is not empty."""
        if not v:
            raise ValueError('Credentials dictionary cannot be empty')
        return v

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "provider": "GCP",
            "credential_type": "SERVICE_ACCOUNT",
            "credential_name": "gcp_production_sa",
            "credentials": {
                "type": "service_account",
                "project_id": "my-project",
                "private_key_id": "key123",
                "private_key": "-----BEGIN PRIVATE KEY-----\n...",
                "client_email": "sa@project.iam.gserviceaccount.com"
            },
            "project_id": "my-gcp-project",
            "region": "us-central1",
            "scopes": ["https://www.googleapis.com/auth/cloud-platform"]
        }
    })


class CreateProviderConfigRequest(BaseModel):
    """Request model for creating provider configurations."""
    provider: Provider = Field(
        ...,
        description="Cloud or AI service provider"
    )
    domain: Domain = Field(
        ...,
        description="Pipeline domain (COST, SECURITY, etc.)"
    )
    source_project_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Source project/account identifier"
    )
    source_dataset: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Source dataset or database name"
    )
    notification_emails: List[EmailStr] = Field(
        default_factory=list,
        description="Email addresses for notifications"
    )
    default_parameters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Default parameters for pipeline execution"
    )

    @field_validator('notification_emails')
    @classmethod
    def validate_emails(cls, v: List[EmailStr]) -> List[EmailStr]:
        """Validate at least one notification email is provided."""
        if not v:
            raise ValueError('At least one notification email must be provided')
        if len(v) > 10:
            raise ValueError('Maximum 10 notification emails allowed')
        return v

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "provider": "GCP",
            "domain": "COST",
            "source_project_id": "billing-project-123",
            "source_dataset": "billing_export",
            "notification_emails": ["team@acme.com", "alerts@acme.com"],
            "default_parameters": {
                "lookback_days": 30,
                "currency": "USD"
            }
        }
    })


# InviteUserRequest removed - User management is now handled by Supabase frontend


class UpdateSubscriptionRequest(BaseModel):
    """Request model for updating subscriptions."""
    plan_name: SubscriptionPlan = Field(
        ...,
        description="New subscription plan"
    )
    max_team_members: int = Field(
        ...,
        ge=1,
        le=100,
        description="Maximum users allowed"
    )
    max_providers: int = Field(
        ...,
        ge=1,
        le=50,
        description="Maximum provider configurations"
    )
    max_pipelines_per_day: int = Field(
        ...,
        ge=1,
        le=10000,
        description="Daily pipeline execution limit"
    )
    max_pipelines_per_month: int = Field(
        ...,
        ge=1,
        le=300000,
        description="Monthly pipeline execution limit"
    )
    subscription_start_date: date = Field(
        ...,
        description="Subscription start date"
    )
    subscription_end_date: Optional[date] = Field(
        default=None,
        description="Subscription end date (None for ongoing)"
    )

    @field_validator('subscription_end_date')
    @classmethod
    def validate_end_date(cls, v: Optional[date], info) -> Optional[date]:
        """Validate end date is after start date."""
        if v and 'subscription_start_date' in info.data:
            if v <= info.data['subscription_start_date']:
                raise ValueError('subscription_end_date must be after subscription_start_date')
        return v

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "plan_name": "PROFESSIONAL",
            "max_team_members": 6,
            "max_providers": 6,
            "max_pipelines_per_day": 25,
            "max_pipelines_per_month": 750,
            "subscription_start_date": "2025-01-01",
            "subscription_end_date": "2025-12-31"
        }
    })


class UpgradeSubscriptionRequest(BaseModel):
    """Request model for subscription plan upgrades."""
    new_plan: SubscriptionPlan = Field(
        ...,
        description="Target subscription plan to upgrade to"
    )
    effective_immediately: bool = Field(
        default=True,
        description="Whether upgrade takes effect immediately or at next billing cycle"
    )

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "new_plan": "SCALE",
            "effective_immediately": True
        }
    })


class UpdateLimitsRequest(BaseModel):
    """Request model for updating subscription limits (admin only)."""
    max_team_members: Optional[int] = Field(
        default=None,
        ge=1,
        le=1000,
        description="Maximum users allowed"
    )
    max_providers: Optional[int] = Field(
        default=None,
        ge=1,
        le=100,
        description="Maximum provider configurations"
    )
    max_pipelines_per_day: Optional[int] = Field(
        default=None,
        ge=1,
        le=100000,
        description="Daily pipeline execution limit"
    )
    max_pipelines_per_month: Optional[int] = Field(
        default=None,
        ge=1,
        le=3000000,
        description="Monthly pipeline execution limit"
    )
    max_concurrent_pipelines: Optional[int] = Field(
        default=None,
        ge=1,
        le=100,
        description="Concurrent pipeline execution limit"
    )

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "max_team_members": 15,
            "max_pipelines_per_day": 150,
            "max_pipelines_per_month": 4500
        }
    })


# UpdateUserRequest removed - User management is now handled by Supabase frontend


class UpdateOrgLocaleRequest(BaseModel):
    """Request model for updating organization locale settings."""
    default_currency: Optional[SupportedCurrency] = Field(
        default=None,
        description="ISO 4217 currency code (e.g., USD, EUR, AED)"
    )
    default_timezone: Optional[str] = Field(
        default=None,
        description="IANA timezone identifier (e.g., UTC, Asia/Dubai)"
    )

    @field_validator('default_timezone')
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        """Validate timezone is in supported list."""
        if v is None:
            return v
        return timezone_validator(v)

    @model_validator(mode='after')
    def at_least_one_field_required(self) -> 'UpdateOrgLocaleRequest':
        """Ensure at least one field is provided for update."""
        if self.default_currency is None and self.default_timezone is None:
            raise ValueError("At least one of 'default_currency' or 'default_timezone' must be provided")
        return self

    @computed_field
    @property
    def default_country(self) -> Optional[str]:
        """Auto-infer country from currency if currency is provided."""
        if self.default_currency:
            return get_country_from_currency(self.default_currency.value)
        return None

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "default_currency": "AED",
            "default_timezone": "Asia/Dubai"
        }
    })


class OrgLocaleResponse(BaseModel):
    """Response model for organization locale settings."""
    org_slug: str
    default_currency: str
    default_country: str
    default_language: str
    default_timezone: str
    currency_symbol: str = Field(description="Currency symbol for display")
    currency_name: str = Field(description="Currency full name")
    currency_decimals: int = Field(description="Decimal places for currency")

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "org_slug": "acme_corp",
            "default_currency": "AED",
            "default_country": "AE",
            "default_language": "en",
            "default_timezone": "Asia/Dubai",
            "currency_symbol": "د.إ",
            "currency_name": "UAE Dirham",
            "currency_decimals": 2
        }
    })


# ============================================================================
# RESPONSE MODELS
# ============================================================================

class OrgProfileResponse(BaseModel):
    """Response model for organization profile."""
    org_slug: str
    company_name: str
    admin_email: EmailStr
    status: OrgStatus
    subscription_plan: SubscriptionPlan
    org_dataset_id: str
    # i18n fields
    default_currency: str = Field(default="USD", description="ISO 4217 currency code")
    default_country: str = Field(default="US", description="ISO 3166-1 alpha-2 country code")
    default_language: str = Field(default="en", description="BCP 47 language tag")
    default_timezone: str = Field(default="UTC", description="IANA timezone identifier")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "org_slug": "acme_corp_prod",
            "company_name": "Acme Corporation",
            "admin_email": "admin@acme.com",
            "status": "ACTIVE",
            "subscription_plan": "PROFESSIONAL",
            "org_dataset_id": "org_acme_corp_prod",
            "default_currency": "AED",
            "default_country": "AE",
            "default_language": "en",
            "default_timezone": "Asia/Dubai",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z"
        }
    })


class APIKeyResponse(BaseModel):
    """Response model for API keys."""
    org_api_key_id: str
    api_key: Optional[str] = Field(
        default=None,
        description="Full API key (only returned on creation)"
    )
    key_name: str
    scopes: List[str]
    created_at: datetime
    expires_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "org_api_key_id": "key_abc123xyz",
            "api_key": "ck_live_abc123xyz...",
            "key_name": "production_api_key",
            "scopes": ["pipelines:run", "pipelines:read"],
            "created_at": "2025-01-15T10:00:00Z",
            "expires_at": "2026-01-15T10:00:00Z",
            "is_active": True
        }
    })


class CredentialResponse(BaseModel):
    """Response model for credentials (excludes sensitive data)."""
    credential_id: str
    org_slug: str
    provider: Provider
    credential_type: CredentialType
    credential_name: str
    project_id: Optional[str]
    region: Optional[str]
    created_at: datetime
    last_validated_at: Optional[datetime]
    is_active: bool
    validation_status: ValidationStatus

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "credential_id": "cred_xyz789",
            "org_slug": "acme_corp_prod",
            "provider": "GCP",
            "credential_type": "SERVICE_ACCOUNT",
            "credential_name": "gcp_production_sa",
            "project_id": "my-gcp-project",
            "region": "us-central1",
            "created_at": "2025-01-15T10:00:00Z",
            "last_validated_at": "2025-01-16T08:30:00Z",
            "is_active": True,
            "validation_status": "VALID"
        }
    })


class SubscriptionResponse(BaseModel):
    """Response model for subscription details."""
    subscription_id: str
    org_slug: str
    plan_name: SubscriptionPlan
    status: SubscriptionStatus
    max_team_members: int
    max_providers: int
    max_pipelines_per_day: int
    max_pipelines_per_month: int
    trial_end_date: Optional[date]
    subscription_end_date: Optional[date]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "subscription_id": "sub_123abc",
            "org_slug": "acme_corp_prod",
            "plan_name": "PROFESSIONAL",
            "status": "ACTIVE",
            "max_team_members": 6,
            "max_providers": 6,
            "max_pipelines_per_day": 25,
            "max_pipelines_per_month": 750,
            "trial_end_date": None,
            "subscription_end_date": "2025-12-31",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z"
        }
    })


class UsageQuotaResponse(BaseModel):
    """Response model for usage quotas."""
    org_slug: str
    usage_date: date
    pipelines_run_today: int
    daily_limit: int
    pipelines_run_month: int
    monthly_limit: int
    concurrent_pipelines_running: int
    concurrent_limit: int
    quota_exceeded: bool

    @computed_field
    @property
    def quota_remaining(self) -> Dict[str, int]:
        """Compute remaining quotas."""
        return {
            "daily": max(0, self.daily_limit - self.pipelines_run_today),
            "monthly": max(0, self.monthly_limit - self.pipelines_run_month),
            "concurrent": max(0, self.concurrent_limit - self.concurrent_pipelines_running)
        }

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "org_slug": "acme_corp_prod",
            "usage_date": "2025-01-15",
            "pipelines_run_today": 12,
            "daily_limit": 25,
            "pipelines_run_month": 180,
            "monthly_limit": 750,
            "concurrent_pipelines_running": 1,
            "concurrent_limit": 3,
            "quota_exceeded": False,
            "quota_remaining": {
                "daily": 13,
                "monthly": 570,
                "concurrent": 2
            }
        }
    })


class LimitsResponse(BaseModel):
    """Response model for subscription limits."""
    org_slug: str
    subscription_plan: SubscriptionPlan
    max_team_members: int
    max_providers: int
    max_pipelines_per_day: int
    max_pipelines_per_month: int
    max_concurrent_pipelines: int
    current_usage: Dict[str, int]

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "org_slug": "acme_corp_prod",
            "subscription_plan": "PROFESSIONAL",
            "max_team_members": 6,
            "max_providers": 6,
            "max_pipelines_per_day": 25,
            "max_pipelines_per_month": 750,
            "max_concurrent_pipelines": 3,
            "current_usage": {
                "team_members": 3,
                "providers": 2,
                "pipelines_today": 12,
                "pipelines_month": 180,
                "concurrent_running": 1
            }
        }
    })


# UserResponse removed - User management is now handled by Supabase frontend


class ValidationResponse(BaseModel):
    """Response model for organization validation checks."""
    org_slug: str
    can_run_pipeline: bool
    subscription_status: SubscriptionStatus
    subscription_valid: bool
    quota_available: bool
    quota_remaining: Dict[str, int]
    credentials_configured: bool
    message: str

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "org_slug": "acme_corp_prod",
            "can_run_pipeline": True,
            "subscription_status": "ACTIVE",
            "subscription_valid": True,
            "quota_available": True,
            "quota_remaining": {
                "daily": 13,
                "monthly": 570,
                "concurrent": 2
            },
            "credentials_configured": True,
            "message": "Organization is valid and can run pipelines"
        }
    })


class ProviderConfigResponse(BaseModel):
    """Response model for provider configurations."""
    config_id: str
    org_slug: str
    provider: Provider
    domain: Domain
    source_project_id: str
    source_dataset: Optional[str]
    notification_emails: List[EmailStr]
    default_parameters: Optional[Dict[str, Any]]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "config_id": "config_abc123",
            "org_slug": "acme_corp_prod",
            "provider": "GCP",
            "domain": "COST",
            "source_project_id": "billing-project-123",
            "source_dataset": "billing_export",
            "notification_emails": ["team@acme.com"],
            "default_parameters": {"lookback_days": 30},
            "is_active": True,
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:00:00Z"
        }
    })


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_subscription_limits(plan: SubscriptionPlan) -> Dict[str, Any]:
    """
    Get subscription limits for a given plan.

    Args:
        plan: The subscription plan

    Returns:
        Dictionary containing limits for the plan
    """
    return SUBSCRIPTION_LIMITS[plan].copy()


def validate_quota_available(
    pipelines_run_today: int,
    daily_limit: int,
    pipelines_run_month: int,
    monthly_limit: int,
    concurrent_running: int,
    concurrent_limit: int
) -> tuple[bool, str]:
    """
    Check if organization has available quota.

    Args:
        pipelines_run_today: Number of pipelines run today
        daily_limit: Daily pipeline limit
        pipelines_run_month: Number of pipelines run this month
        monthly_limit: Monthly pipeline limit
        concurrent_running: Number of concurrent pipelines running
        concurrent_limit: Concurrent pipeline limit

    Returns:
        Tuple of (quota_available: bool, message: str)
    """
    if pipelines_run_today >= daily_limit:
        return False, "Daily pipeline limit exceeded"

    if pipelines_run_month >= monthly_limit:
        return False, "Monthly pipeline limit exceeded"

    if concurrent_running >= concurrent_limit:
        return False, "Concurrent pipeline limit exceeded"

    return True, "Quota available"
