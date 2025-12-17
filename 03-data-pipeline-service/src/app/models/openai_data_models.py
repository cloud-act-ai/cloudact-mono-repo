"""
OpenAI Data Models

Pydantic models for OpenAI pricing and subscription CRUD operations.
Enhanced with free tier, trial, volume discount, and rate limit tracking.
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


# ============================================
# Enums for Pricing and Subscription Types
# ============================================

class PricingTypeEnum(str, Enum):
    """Classification of pricing models following industry standards."""
    STANDARD = "standard"           # Regular published pricing
    FREE_TIER = "free_tier"         # Provider-offered free usage
    VOLUME_DISCOUNT = "volume_discount"  # Tiered pricing based on usage
    COMMITTED_USE = "committed_use"     # Pre-committed spend discounts (CUDs)
    PROMOTIONAL = "promotional"     # Time-bounded special offers
    NEGOTIATED = "negotiated"       # Custom enterprise agreements


class TierTypeEnum(str, Enum):
    """Classification of subscription tiers."""
    FREE = "free"           # Provider free tier (perpetual)
    TRIAL = "trial"         # Time-limited trial with credits
    PAID = "paid"           # Standard paid tier
    ENTERPRISE = "enterprise"  # Custom enterprise agreement
    COMMITTED_USE = "committed_use"  # CUD commitment


class FreeTierResetFrequency(str, Enum):
    """How often free tier allowance resets."""
    DAILY = "daily"       # Resets every day (e.g., Gemini)
    MONTHLY = "monthly"   # Resets every month
    NEVER = "never"       # One-time credit, no reset


class DiscountReasonEnum(str, Enum):
    """Reason for discounted pricing."""
    VOLUME = "volume"           # Volume-based discount
    COMMITMENT = "commitment"   # Committed use discount
    PROMOTION = "promotion"     # Promotional offer
    NEGOTIATED = "negotiated"   # Negotiated enterprise deal
    TRIAL = "trial"             # Trial discount


# ============================================
# Pricing Models
# ============================================

class OpenAIPricingCreate(BaseModel):
    """Request model for creating a new pricing record."""
    model_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Model identifier (e.g., 'gpt-4o')"
    )
    model_name: Optional[str] = Field(
        None,
        max_length=200,
        description="Human-readable model name"
    )
    input_price_per_1k: float = Field(
        ...,
        ge=0,
        description="Price per 1K input tokens in USD"
    )
    output_price_per_1k: float = Field(
        ...,
        ge=0,
        description="Price per 1K output tokens in USD"
    )
    effective_date: date = Field(
        ...,
        description="Date when this pricing became effective"
    )
    notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Additional notes"
    )
    # New fields for pricing type and free tier tracking
    pricing_type: PricingTypeEnum = Field(
        default=PricingTypeEnum.STANDARD,
        description="Pricing classification: standard, free_tier, volume_discount, committed_use, promotional, negotiated"
    )
    free_tier_input_tokens: Optional[int] = Field(
        None,
        ge=0,
        description="Free tier input token allowance per reset period"
    )
    free_tier_output_tokens: Optional[int] = Field(
        None,
        ge=0,
        description="Free tier output token allowance per reset period"
    )
    free_tier_reset_frequency: Optional[FreeTierResetFrequency] = Field(
        None,
        description="Free tier reset frequency: daily, monthly, never"
    )
    discount_percentage: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Percentage discount off standard price (0-100)"
    )
    discount_reason: Optional[DiscountReasonEnum] = Field(
        None,
        description="Reason for discount: volume, commitment, promotion, negotiated, trial"
    )
    volume_threshold_tokens: Optional[int] = Field(
        None,
        ge=0,
        description="Minimum monthly tokens to qualify for this pricing tier"
    )
    base_input_price_per_1k: Optional[float] = Field(
        None,
        ge=0,
        description="Reference standard price before discount"
    )
    base_output_price_per_1k: Optional[float] = Field(
        None,
        ge=0,
        description="Reference standard price before discount"
    )

    model_config = ConfigDict(extra="forbid")


class OpenAIPricingUpdate(BaseModel):
    """Request model for updating an existing pricing record."""
    model_name: Optional[str] = Field(
        None,
        max_length=200,
        description="Human-readable model name"
    )
    input_price_per_1k: Optional[float] = Field(
        None,
        ge=0,
        description="Price per 1K input tokens in USD"
    )
    output_price_per_1k: Optional[float] = Field(
        None,
        ge=0,
        description="Price per 1K output tokens in USD"
    )
    effective_date: Optional[date] = Field(
        None,
        description="Date when this pricing became effective"
    )
    notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Additional notes"
    )
    # New fields for pricing type and free tier tracking
    pricing_type: Optional[PricingTypeEnum] = Field(
        None,
        description="Pricing classification: standard, free_tier, volume_discount, committed_use, promotional, negotiated"
    )
    free_tier_input_tokens: Optional[int] = Field(
        None,
        ge=0,
        description="Free tier input token allowance per reset period"
    )
    free_tier_output_tokens: Optional[int] = Field(
        None,
        ge=0,
        description="Free tier output token allowance per reset period"
    )
    free_tier_reset_frequency: Optional[FreeTierResetFrequency] = Field(
        None,
        description="Free tier reset frequency: daily, monthly, never"
    )
    discount_percentage: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Percentage discount off standard price (0-100)"
    )
    discount_reason: Optional[DiscountReasonEnum] = Field(
        None,
        description="Reason for discount: volume, commitment, promotion, negotiated, trial"
    )
    volume_threshold_tokens: Optional[int] = Field(
        None,
        ge=0,
        description="Minimum monthly tokens to qualify for this pricing tier"
    )
    base_input_price_per_1k: Optional[float] = Field(
        None,
        ge=0,
        description="Reference standard price before discount"
    )
    base_output_price_per_1k: Optional[float] = Field(
        None,
        ge=0,
        description="Reference standard price before discount"
    )

    model_config = ConfigDict(extra="forbid")


class OpenAIPricingResponse(BaseModel):
    """Response model for pricing records."""
    model_id: str
    model_name: Optional[str]
    input_price_per_1k: float
    output_price_per_1k: float
    effective_date: date
    notes: Optional[str]
    # New fields for pricing type and free tier tracking
    pricing_type: str
    free_tier_input_tokens: Optional[int] = None
    free_tier_output_tokens: Optional[int] = None
    free_tier_reset_frequency: Optional[str] = None
    discount_percentage: Optional[float] = None
    discount_reason: Optional[str] = None
    volume_threshold_tokens: Optional[int] = None
    base_input_price_per_1k: Optional[float] = None
    base_output_price_per_1k: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class OpenAIPricingListResponse(BaseModel):
    """Response model for listing all pricing records."""
    org_slug: str
    pricing: List[OpenAIPricingResponse]
    count: int


# ============================================
# Subscription Models
# ============================================

class OpenAISubscriptionCreate(BaseModel):
    """Request model for creating a new subscription record."""
    subscription_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Unique subscription identifier"
    )
    plan_name: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Plan name (e.g., 'FREE', 'TIER1', 'TIER2')"
    )
    quantity: int = Field(
        ...,
        ge=0,
        description="Number of subscriptions"
    )
    unit_price: float = Field(
        ...,
        ge=0,
        description="Price per unit in org's currency"
    )
    effective_date: date = Field(
        ...,
        description="Date when this subscription became effective"
    )
    notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Additional notes"
    )
    # New fields for tier type, rate limits, and commitments
    tier_type: TierTypeEnum = Field(
        default=TierTypeEnum.PAID,
        description="Tier classification: free, trial, paid, enterprise, committed_use"
    )
    trial_end_date: Optional[date] = Field(
        None,
        description="Trial expiration date (null = not a trial)"
    )
    trial_credit_usd: Optional[float] = Field(
        None,
        ge=0,
        description="Trial credit amount in USD"
    )
    monthly_token_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Monthly token usage cap (null = unlimited)"
    )
    daily_token_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Daily token usage cap (null = unlimited)"
    )
    rpm_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Requests per minute rate limit"
    )
    tpm_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Tokens per minute rate limit"
    )
    rpd_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Requests per day rate limit"
    )
    tpd_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Tokens per day rate limit"
    )
    concurrent_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Maximum concurrent requests"
    )
    committed_spend_usd: Optional[float] = Field(
        None,
        ge=0,
        description="Committed monthly spend for CUD pricing"
    )
    commitment_term_months: Optional[int] = Field(
        None,
        ge=0,
        description="Commitment duration in months (12, 24, 36)"
    )
    discount_percentage: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Discount percentage for this tier (0-100)"
    )

    model_config = ConfigDict(extra="forbid")


class OpenAISubscriptionUpdate(BaseModel):
    """Request model for updating an existing subscription record."""
    quantity: Optional[int] = Field(
        None,
        ge=0,
        description="Number of subscriptions"
    )
    unit_price: Optional[float] = Field(
        None,
        ge=0,
        description="Price per unit in org's currency"
    )
    effective_date: Optional[date] = Field(
        None,
        description="Date when this subscription became effective"
    )
    notes: Optional[str] = Field(
        None,
        max_length=1000,
        description="Additional notes"
    )
    # New fields for tier type, rate limits, and commitments
    tier_type: Optional[TierTypeEnum] = Field(
        None,
        description="Tier classification: free, trial, paid, enterprise, committed_use"
    )
    trial_end_date: Optional[date] = Field(
        None,
        description="Trial expiration date (null = not a trial)"
    )
    trial_credit_usd: Optional[float] = Field(
        None,
        ge=0,
        description="Trial credit amount in USD"
    )
    monthly_token_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Monthly token usage cap (null = unlimited)"
    )
    daily_token_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Daily token usage cap (null = unlimited)"
    )
    rpm_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Requests per minute rate limit"
    )
    tpm_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Tokens per minute rate limit"
    )
    rpd_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Requests per day rate limit"
    )
    tpd_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Tokens per day rate limit"
    )
    concurrent_limit: Optional[int] = Field(
        None,
        ge=0,
        description="Maximum concurrent requests"
    )
    committed_spend_usd: Optional[float] = Field(
        None,
        ge=0,
        description="Committed monthly spend for CUD pricing"
    )
    commitment_term_months: Optional[int] = Field(
        None,
        ge=0,
        description="Commitment duration in months (12, 24, 36)"
    )
    discount_percentage: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Discount percentage for this tier (0-100)"
    )

    model_config = ConfigDict(extra="forbid")


class OpenAISubscriptionResponse(BaseModel):
    """Response model for subscription records."""
    subscription_id: str
    plan_name: str
    quantity: int
    unit_price: float
    effective_date: date
    notes: Optional[str]
    # New fields for tier type, rate limits, and commitments
    tier_type: str
    trial_end_date: Optional[date] = None
    trial_credit_usd: Optional[float] = None
    monthly_token_limit: Optional[int] = None
    daily_token_limit: Optional[int] = None
    rpm_limit: Optional[int] = None
    tpm_limit: Optional[int] = None
    rpd_limit: Optional[int] = None
    tpd_limit: Optional[int] = None
    concurrent_limit: Optional[int] = None
    committed_spend_usd: Optional[float] = None
    commitment_term_months: Optional[int] = None
    discount_percentage: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class OpenAISubscriptionListResponse(BaseModel):
    """Response model for listing all subscription records."""
    org_slug: str
    subscriptions: List[OpenAISubscriptionResponse]
    count: int
