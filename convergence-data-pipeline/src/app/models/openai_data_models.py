"""
OpenAI Data Models

Pydantic models for OpenAI pricing and subscription CRUD operations.
"""

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


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

    model_config = ConfigDict(extra="forbid")


class OpenAIPricingResponse(BaseModel):
    """Response model for pricing records."""
    model_id: str
    model_name: Optional[str]
    input_price_per_1k: float
    output_price_per_1k: float
    effective_date: date
    notes: Optional[str]
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
    unit_price_usd: float = Field(
        ...,
        ge=0,
        description="Price per unit in USD"
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

    model_config = ConfigDict(extra="forbid")


class OpenAISubscriptionUpdate(BaseModel):
    """Request model for updating an existing subscription record."""
    quantity: Optional[int] = Field(
        None,
        ge=0,
        description="Number of subscriptions"
    )
    unit_price_usd: Optional[float] = Field(
        None,
        ge=0,
        description="Price per unit in USD"
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

    model_config = ConfigDict(extra="forbid")


class OpenAISubscriptionResponse(BaseModel):
    """Response model for subscription records."""
    subscription_id: str
    plan_name: str
    quantity: int
    unit_price_usd: float
    effective_date: date
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class OpenAISubscriptionListResponse(BaseModel):
    """Response model for listing all subscription records."""
    org_slug: str
    subscriptions: List[OpenAISubscriptionResponse]
    count: int
