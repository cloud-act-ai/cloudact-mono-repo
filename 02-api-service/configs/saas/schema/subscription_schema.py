"""
Centralized SaaS Subscription Schema

This module defines the standardized schema for the saas_subscriptions table.
Can be reused across routers, seed scripts, and validation logic.

Schema covers:
- LLM API tiers (OpenAI, Anthropic, Gemini) - for rate limit tracking
- Consumer subscriptions (ChatGPT Plus, Claude Pro, Canva, Figma, etc.)
- Custom subscriptions defined by users

Category Mapping:
- llm_api: OpenAI, Anthropic, Gemini API tiers (TIER1-5, BUILD_TIER, etc.)
- ai: Consumer AI tools (ChatGPT Plus, Claude Pro, Copilot, Cursor, etc.)
- design: Design tools (Canva, Figma, Miro, Adobe CC)
- productivity: Productivity tools (Notion, Asana, Monday, Confluence)
- communication: Communication tools (Slack, Zoom, Teams)
- development: Development tools (GitHub, GitLab, Vercel, Supabase)
- cloud: Cloud platforms (GCP, AWS, Azure)
- other: Miscellaneous or custom

Tier Types:
- free: Free tier with limitations
- trial: Trial period with credits or time limit
- paid: Standard paid subscription
- enterprise: Enterprise/custom pricing
- committed_use: Committed spend discounts

Billing Periods:
- pay_as_you_go: Usage-based (LLM APIs)
- monthly: Monthly subscription
- quarterly: Quarterly subscription
- yearly: Annual subscription
- weekly: Weekly subscription
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, Literal
from datetime import date, datetime
from enum import Enum


# ============================================
# Enums
# ============================================

class CategoryEnum(str, Enum):
    """Subscription category types."""
    LLM_API = "llm_api"
    AI = "ai"
    DESIGN = "design"
    PRODUCTIVITY = "productivity"
    COMMUNICATION = "communication"
    DEVELOPMENT = "development"
    CLOUD = "cloud"
    OTHER = "other"


class StatusEnum(str, Enum):
    """Subscription status."""
    ACTIVE = "active"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class PricingModelEnum(str, Enum):
    """Pricing model types."""
    PER_SEAT = "PER_SEAT"
    FLAT_FEE = "FLAT_FEE"


class DiscountTypeEnum(str, Enum):
    """Discount types."""
    PERCENT = "percent"
    FIXED = "fixed"


class BillingCycleEnum(str, Enum):
    """Billing cycle types - replaces BillingPeriodEnum."""
    MONTHLY = "monthly"
    ANNUAL = "annual"
    QUARTERLY = "quarterly"


class TierTypeEnum(str, Enum):
    """Subscription tier types."""
    FREE = "free"
    TRIAL = "trial"
    PAID = "paid"
    ENTERPRISE = "enterprise"
    COMMITTED_USE = "committed_use"


class BillingPeriodEnum(str, Enum):
    """Billing period types."""
    PAY_AS_YOU_GO = "pay_as_you_go"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    ANNUAL = "annual"


class AuthTypeEnum(str, Enum):
    """Authentication types for integrations."""
    API_KEY = "api_key"
    SERVICE_ACCOUNT = "service_account"
    OAUTH = "oauth"
    SUBSCRIPTION = "subscription"


# ============================================
# Schema Models
# ============================================

class SaaSSubscriptionBase(BaseModel):
    """Base schema for SaaS subscriptions (shared fields)."""

    org_slug: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Organization slug identifier"
    )

    provider: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Provider identifier (openai, anthropic, gemini, chatgpt_plus, claude_pro, canva, etc.)"
    )

    plan_name: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Plan identifier (FREE, TIER1, PRO, TEAM, ENTERPRISE, etc.)"
    )

    unit_price: float = Field(
        ...,
        ge=0.0,
        description="Price per billing cycle in org's currency"
    )

    status: StatusEnum = Field(
        default=StatusEnum.ACTIVE,
        description="Subscription status: active, cancelled, expired"
    )

    start_date: Optional[date] = Field(
        default=None,
        description="Date when subscription becomes active"
    )

    end_date: Optional[date] = Field(
        default=None,
        description="Subscription end date (null = active/ongoing)"
    )

    billing_cycle: BillingCycleEnum = Field(
        ...,
        description="Billing cycle: monthly, annual, quarterly"
    )

    currency: str = Field(
        default="USD",
        max_length=3,
        description="Currency code (ISO 4217)"
    )

    pricing_model: PricingModelEnum = Field(
        default=PricingModelEnum.PER_SEAT,
        description="Pricing model: PER_SEAT or FLAT_FEE"
    )

    discount_type: Optional[DiscountTypeEnum] = Field(
        default=None,
        description="Discount type: percent or fixed"
    )

    discount_value: Optional[int] = Field(
        default=None,
        ge=0,
        description="Discount value (percentage 0-100 or fixed amount)"
    )

    auto_renew: bool = Field(
        default=True,
        description="Auto-renewal enabled"
    )

    payment_method: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Payment method (credit_card, invoice, etc.)"
    )

    invoice_id_last: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Last invoice ID"
    )

    owner_email: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Subscription owner email"
    )

    department: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Department responsible for subscription"
    )

    renewal_date: Optional[date] = Field(
        default=None,
        description="Next renewal date"
    )

    contract_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Contract or agreement ID"
    )

    notes: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="User notes, plan description, or limitations"
    )

    # Additional fields (not in BigQuery schema, but used in CSV and logic)
    category: CategoryEnum = Field(
        ...,
        description="Subscription category: llm_api, ai, design, productivity, communication, development, cloud, other"
    )

    seats: int = Field(
        default=1,
        ge=1,
        description="Default number of seats for this plan"
    )

    model_config = ConfigDict(
        use_enum_values=True,
        populate_by_name=True,
        str_strip_whitespace=True
    )

    @field_validator('provider', 'plan_name')
    @classmethod
    def uppercase_identifiers(cls, v: str) -> str:
        """Ensure provider and plan_name are lowercase for consistency."""
        return v.lower() if v else v


class SaaSSubscriptionCreate(SaaSSubscriptionBase):
    """Schema for creating a new SaaS subscription."""
    pass


class SaaSSubscriptionUpdate(BaseModel):
    """Schema for updating an existing SaaS subscription (partial updates)."""

    plan_name: Optional[str] = Field(None, min_length=1, max_length=50)
    unit_price: Optional[float] = Field(None, ge=0.0)
    status: Optional[StatusEnum] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    billing_cycle: Optional[BillingCycleEnum] = None
    currency: Optional[str] = Field(None, max_length=3)
    pricing_model: Optional[PricingModelEnum] = None
    discount_type: Optional[DiscountTypeEnum] = None
    discount_value: Optional[int] = Field(None, ge=0)
    auto_renew: Optional[bool] = None
    payment_method: Optional[str] = Field(None, max_length=50)
    invoice_id_last: Optional[str] = Field(None, max_length=100)
    owner_email: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=100)
    renewal_date: Optional[date] = None
    contract_id: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    seats: Optional[int] = Field(None, ge=1)

    model_config = ConfigDict(
        use_enum_values=True,
        extra="forbid"
    )


class SaaSSubscriptionResponse(SaaSSubscriptionBase):
    """Schema for SaaS subscription response (includes DB fields)."""

    subscription_id: str = Field(
        ...,
        min_length=1,
        description="Unique subscription identifier (UUID or custom ID)"
    )

    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last update timestamp"
    )

    model_config = ConfigDict(
        use_enum_values=True,
        from_attributes=True
    )


# ============================================
# Constants
# ============================================

# Valid provider identifiers
LLM_API_PROVIDERS = {"openai", "anthropic", "gemini"}

SAAS_PROVIDERS = {
    # AI Tools (consumer subscriptions, not API tiers)
    "chatgpt_plus", "claude_pro", "gemini_advanced", "copilot",
    "cursor", "windsurf", "replit", "v0", "lovable",
    # Design
    "canva", "adobe_cc", "figma", "miro",
    # Productivity
    "notion", "confluence", "asana", "monday",
    # Communication
    "slack", "zoom", "teams",
    # Development
    "github", "gitlab", "jira", "linear", "vercel", "netlify", "railway", "supabase",
    # Custom
    "custom"
}

ALL_PROVIDERS = LLM_API_PROVIDERS | SAAS_PROVIDERS

# Category to providers mapping
PROVIDER_CATEGORIES = {
    CategoryEnum.LLM_API: ["openai", "anthropic", "gemini"],
    CategoryEnum.AI: [
        "chatgpt_plus", "claude_pro", "gemini_advanced", "copilot",
        "cursor", "windsurf", "replit", "v0", "lovable"
    ],
    CategoryEnum.DESIGN: ["canva", "adobe_cc", "figma", "miro"],
    CategoryEnum.PRODUCTIVITY: ["notion", "confluence", "asana", "monday"],
    CategoryEnum.COMMUNICATION: ["slack", "zoom", "teams"],
    CategoryEnum.DEVELOPMENT: [
        "github", "gitlab", "jira", "linear",
        "vercel", "netlify", "railway", "supabase"
    ],
}

# Display names for providers
PROVIDER_DISPLAY_NAMES = {
    # LLM APIs
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Google Gemini",
    # AI Tools
    "chatgpt_plus": "ChatGPT Plus",
    "claude_pro": "Claude Pro",
    "gemini_advanced": "Gemini Advanced",
    "copilot": "GitHub Copilot",
    "cursor": "Cursor",
    "windsurf": "Windsurf",
    "replit": "Replit",
    "v0": "v0",
    "lovable": "Lovable",
    # Design
    "canva": "Canva",
    "adobe_cc": "Adobe Creative Cloud",
    "figma": "Figma",
    "miro": "Miro",
    # Productivity
    "notion": "Notion",
    "confluence": "Confluence",
    "asana": "Asana",
    "monday": "Monday.com",
    # Communication
    "slack": "Slack",
    "zoom": "Zoom",
    "teams": "Microsoft Teams",
    # Development
    "github": "GitHub",
    "gitlab": "GitLab",
    "jira": "Jira",
    "linear": "Linear",
    "vercel": "Vercel",
    "netlify": "Netlify",
    "railway": "Railway",
    "supabase": "Supabase",
    # Custom
    "custom": "Custom",
}


# ============================================
# Helper Functions
# ============================================

def get_provider_category(provider: str) -> CategoryEnum:
    """Get category for a given provider."""
    provider_lower = provider.lower()

    for category, providers in PROVIDER_CATEGORIES.items():
        if provider_lower in providers:
            return category

    return CategoryEnum.OTHER


def get_provider_display_name(provider: str) -> str:
    """Get human-readable display name for provider."""
    provider_lower = provider.lower()
    return PROVIDER_DISPLAY_NAMES.get(
        provider_lower,
        provider.replace("_", " ").title()
    )


def is_llm_api_provider(provider: str) -> bool:
    """Check if provider is an LLM API provider."""
    return provider.lower() in LLM_API_PROVIDERS


def is_saas_provider(provider: str) -> bool:
    """Check if provider is a SaaS consumer subscription provider."""
    return provider.lower() in SAAS_PROVIDERS
