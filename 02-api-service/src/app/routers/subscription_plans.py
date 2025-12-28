"""
SaaS Subscription Plans Management API Routes

Endpoints for managing SaaS subscription plans across multiple providers.
This handles FIXED-COST subscription plans for each provider (Canva, ChatGPT Plus, Slack, etc.)
NOT LLM API usage tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - those are in llm_data.py)

URL Structure: /api/v1/subscriptions/{org_slug}/providers/...

Each provider can have multiple plans (FREE, PRO, ENTERPRISE, etc.) with different:
- Pricing (unit_price, billing_cycle, pricing_model)
- Status (active, cancelled, expired)
- Seats and contract details

===================================================================================
PLAN EDIT HISTORY & AUDIT TRAIL
===================================================================================

This module implements a complete version history system for subscription plan changes.
All edits are tracked and logged to org_audit_logs for compliance and transparency.

Version History Pattern:
------------------------
When a plan is edited via the /edit-version endpoint:
1. Old record gets end_date = new effective_date - 1 day
2. Old record status changes to 'expired'
3. New record is created with start_date = effective_date
4. New record gets a new subscription_id but same plan_name
5. Both records are preserved in the database (NO deletion)

Audit Logging:
--------------
All plan operations are logged to org_audit_logs table:
- CREATE: Logs plan_name, provider, pricing, seats, start_date
- UPDATE: Logs changed_fields and new_values
- DELETE: Logs soft delete (end_date + status='cancelled')
- EDIT-VERSION: Logs old_values, new_values, effective_date, changed_fields

Query audit logs:
SELECT * FROM organizations.org_audit_logs
WHERE resource_type = 'SUBSCRIPTION_PLAN'
  AND org_slug = 'your_org'
ORDER BY created_at DESC

Cost Recalculation Behavior:
-----------------------------
CRITICAL: Historical costs (before effective_date) are NEVER recalculated.

The cost service (cost_service.py) uses date-based queries to apply the correct
pricing for each time period:

1. Historical Period (before effective_date):
   - Uses old plan's pricing (old unit_price, old seats)
   - YTD/MTD calculations include these historical costs as-is

2. Current/Future Period (on/after effective_date):
   - Uses new plan's pricing (new unit_price, new seats)
   - Forecast calculations use ONLY current pricing

Example:
--------
Plan: Slack Business
Timeline:
- Jan 1 - Feb 28: 20 seats @ $12.50/seat = $250/day
- Mar 1 onwards: 15 seats @ $15/seat = $225/day (price increase, seats decrease)

Cost Calculations (as of Mar 15):
- YTD: $250/day × 59 days (Jan-Feb) + $225/day × 15 days (Mar 1-15) = $18,125
- MTD (March): $225/day × 15 days = $3,375
- Forecast Annual: $18,125 (YTD) + $225/day × remaining_days_in_year

The system automatically handles:
- Multiple price changes in the same year
- Seat increases/decreases
- Mid-month changes (prorated by day)
- Status changes (active -> cancelled)

Database Schema:
----------------
saas_subscription_plans table includes:
- start_date: When this version became effective
- end_date: When this version expired (NULL for current version)
- status: active | pending | expired | cancelled
- subscription_id: Unique per version (changes on edit)
- plan_name: Stays the same across versions (logical identifier)

Cost queries filter by date range:
WHERE start_date <= @cost_date
  AND (end_date IS NULL OR end_date >= @cost_date)

This ensures only the correct version is used for each date.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from pathlib import Path
import logging
import re
import csv
import uuid
import sys

from google.cloud import bigquery
import google.api_core.exceptions

# Add configs/saas/schema to path for schema imports
schema_path = Path(__file__).parent.parent.parent.parent / "configs" / "saas" / "schema"
if str(schema_path) not in sys.path:
    sys.path.insert(0, str(schema_path))

# Import centralized schema
from subscription_schema import (
    SaaSSubscriptionBase,
    SaaSSubscriptionCreate,
    SaaSSubscriptionUpdate,
    SaaSSubscriptionResponse,
    CategoryEnum,
    TierTypeEnum,
    BillingPeriodEnum,
    LLM_API_PROVIDERS,
    SAAS_PROVIDERS,
    PROVIDER_CATEGORIES,
    PROVIDER_DISPLAY_NAMES,
    get_provider_category,
    get_provider_display_name,
    is_llm_api_provider,
    is_saas_provider
)

# MT-004: BigQuery client is stateless and thread-safe; sharing across requests is safe.
# The client uses connection pooling internally and does not hold org-specific state.
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.dependencies.auth import get_current_org
from src.app.config import get_settings
from src.core.utils.cache import get_cache, invalidate_org_cache, invalidate_provider_cache
from src.core.utils.query_performance import QueryPerformanceMonitor, log_query_performance
from src.core.utils.audit_logger import log_create, log_update, log_delete, AuditLogger
from src.app.models.i18n_models import DEFAULT_CURRENCY, validate_currency

# SEC-005: Rate limiting is handled at the middleware level (see src/app/middleware/).
# This router relies on global rate limiting configured in the FastAPI application
# and does not implement per-endpoint rate limits.
router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

# Cache TTL configuration (1 minute for read operations)
# PERF-003: Reduced from 300s to 60s to balance freshness vs performance
CACHE_TTL_SECONDS = 60

# ============================================
# STATE-001 FIX: Comprehensive Cache Invalidation Helper
# ============================================
def invalidate_all_subscription_caches(org_slug: str, provider: str = None) -> int:
    """
    Invalidate ALL subscription-related caches for an organization.

    This ensures cache consistency by clearing all related cache keys:
    - providers_list_{org_slug}
    - plans:{org_slug}:{provider} (for specific provider or all providers)
    - all_plans_{org_slug}_True
    - all_plans_{org_slug}_False

    Args:
        org_slug: Organization slug
        provider: Optional provider name. If None, invalidates all provider caches.

    Returns:
        Total number of cache entries invalidated
    """
    cache = get_cache()
    total_invalidated = 0

    # Always invalidate providers list
    cache.invalidate(f"providers_list_{org_slug}")
    total_invalidated += 1

    # Invalidate all_plans caches (both enabled_only variants)
    cache.invalidate(f"all_plans_{org_slug}_True")
    cache.invalidate(f"all_plans_{org_slug}_False")
    total_invalidated += 2

    # Invalidate provider-specific plans cache
    if provider:
        cache.invalidate(f"plans:{org_slug}:{provider}")
        total_invalidated += 1
    else:
        # Invalidate all provider plan caches for this org using pattern matching
        # Pattern matches plans:{org_slug}: prefix
        total_invalidated += cache.invalidate_pattern(f"plans:{org_slug}:")

    # Also use the existing invalidation functions for any other cached data
    total_invalidated += invalidate_provider_cache(org_slug, provider) if provider else 0
    total_invalidated += invalidate_org_cache(org_slug)

    logger.debug(
        f"Invalidated {total_invalidated} cache entries for org {org_slug}" +
        (f" provider {provider}" if provider else "")
    )

    return total_invalidated



# ============================================
# Constants
# ============================================

# Table name for SaaS subscription plans
SAAS_SUBSCRIPTION_PLANS_TABLE = "saas_subscription_plans"

# Note: LLM_API_PROVIDERS, SAAS_PROVIDERS, PROVIDER_CATEGORIES, and helper functions
# are now imported from the centralized subscription_schema module


# ============================================
# Request/Response Models
# ============================================

class ProviderInfo(BaseModel):
    """Information about a subscription provider."""
    provider: str
    display_name: str
    category: str
    is_enabled: bool = False
    plan_count: int = 0


class ProviderListResponse(BaseModel):
    """Response for listing providers."""
    providers: List[ProviderInfo]
    total: int


class EnableProviderResponse(BaseModel):
    """Response after enabling a provider."""
    success: bool
    provider: str
    plans_seeded: int
    message: str


class DisableProviderResponse(BaseModel):
    """Response after disabling a provider."""
    success: bool
    provider: str
    plans_deleted: int
    message: str


class SubscriptionPlan(BaseModel):
    """A subscription plan."""
    org_slug: str
    subscription_id: str
    provider: str
    plan_name: str
    display_name: Optional[str] = None
    category: str = "other"
    status: str = "active"  # active, cancelled, expired
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    billing_cycle: str = "monthly"
    currency: str = "USD"
    seats: int = 0  # EDGE-004: 0 seats is valid for FLAT_FEE pricing model, FREE tiers, or non-seat-based plans
    pricing_model: str = "PER_SEAT"  # PER_SEAT, FLAT_FEE
    unit_price: float = 0.0
    yearly_price: Optional[float] = None
    discount_type: Optional[str] = None  # percent, fixed
    discount_value: Optional[int] = None
    auto_renew: bool = True
    payment_method: Optional[str] = None
    invoice_id_last: Optional[str] = None
    owner_email: Optional[str] = None
    department: Optional[str] = None
    renewal_date: Optional[date] = None
    contract_id: Optional[str] = None
    notes: Optional[str] = None
    source_currency: Optional[str] = None
    source_price: Optional[float] = None
    exchange_rate_used: Optional[float] = None
    billing_anchor_day: Optional[int] = None
    # Hierarchy fields for cost allocation
    hierarchy_dept_id: Optional[str] = None
    hierarchy_dept_name: Optional[str] = None
    hierarchy_project_id: Optional[str] = None
    hierarchy_project_name: Optional[str] = None
    hierarchy_team_id: Optional[str] = None
    hierarchy_team_name: Optional[str] = None
    updated_at: Optional[datetime] = None


class PlanListResponse(BaseModel):
    """Response for listing plans."""
    plans: List[SubscriptionPlan]
    total: int
    total_monthly_cost: float
    total_annual_cost: float
    totals_by_currency: Dict[str, Dict[str, float]]


class AvailablePlan(BaseModel):
    """A predefined plan template from CSV seed data."""
    plan_name: str
    display_name: str
    billing_cycle: str
    pricing_model: str
    unit_price: float
    yearly_price: Optional[float] = None
    notes: Optional[str] = None
    seats: int = 0
    category: str = "other"
    discount_type: Optional[str] = None
    discount_value: Optional[int] = None


class AvailablePlansResponse(BaseModel):
    """Response for available plans endpoint."""
    success: bool
    provider: str
    plans: List[AvailablePlan]


# Valid enum values for validation
VALID_STATUS_VALUES = {"active", "cancelled", "expired", "pending"}
VALID_PRICING_MODELS = {"PER_SEAT", "FLAT_FEE"}
VALID_BILLING_CYCLES = {"monthly", "annual", "quarterly", "semi-annual", "weekly"}
VALID_DISCOUNT_TYPES = {"percent", "fixed"}

# Status transition state machine
# SECURITY FIX: Prevents illogical transitions (e.g., expired -> active, cancelled -> pending)
VALID_STATUS_TRANSITIONS = {
    "active": {"cancelled", "expired"},      # active can only become cancelled or expired
    "pending": {"active", "cancelled"},       # pending can become active or cancelled
    "cancelled": set(),                       # cancelled is terminal (no transitions)
    "expired": set(),                         # expired is terminal (no transitions)
}


def validate_status_transition(current_status: str, new_status: str) -> None:
    """
    Validate that a status transition is allowed.

    STATE-002: This validation function is defined locally in this module.
    If refactoring to a shared module, ensure all status transition validators
    use the same state machine definition (VALID_STATUS_TRANSITIONS).

    State Machine:
    - active → cancelled, expired
    - pending → active, cancelled
    - cancelled → (terminal - no transitions)
    - expired → (terminal - no transitions)
    """
    if current_status == new_status:
        return  # No change, always allowed

    valid_transitions = VALID_STATUS_TRANSITIONS.get(current_status, set())
    if new_status not in valid_transitions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition: '{current_status}' → '{new_status}'. "
                   f"Allowed transitions from '{current_status}': {valid_transitions or 'none (terminal state)'}"
        )


def validate_enum_field(value: Optional[str], valid_values: set, field_name: str) -> None:
    """Validate that a field value is in the set of valid values."""
    if value is not None and value not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}: '{value}'. Must be one of: {', '.join(str(v) for v in valid_values if v)}"
        )


# Business logic validation thresholds
HIGH_UNIT_PRICE_THRESHOLD = 10000.0  # Flag prices above this for review
MAX_SEATS_LIMIT = 100000  # Maximum reasonable seats per plan
MAX_FUTURE_YEARS = 5  # Maximum years in the future for start_date (VAL-003)

# Email validation regex (VAL-004)
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def validate_email_format(email: Optional[str]) -> None:
    """
    Validate email format if provided.

    VAL-004: Basic email format validation using regex.
    """
    if email is not None and email.strip():
        if not EMAIL_REGEX.match(email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid email format: '{email}'"
            )


def validate_start_date_not_too_far_future(start_date: Optional[date]) -> None:
    """
    Validate that start_date is not more than MAX_FUTURE_YEARS in the future.

    VAL-003: Prevents plans with unreasonably far future start dates.
    """
    if start_date is not None:
        max_future_date = date.today().replace(year=date.today().year + MAX_FUTURE_YEARS)
        if start_date > max_future_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"start_date cannot be more than {MAX_FUTURE_YEARS} years in the future. "
                       f"Maximum allowed: {max_future_date.isoformat()}"
            )


def validate_business_rules(
    unit_price: float,
    seats: int,
    pricing_model: str,
    logger_instance: logging.Logger
) -> List[str]:
    """
    Validate business rules and return warnings (not errors).

    Returns list of warning messages that should be logged/returned to caller.
    """
    warnings = []

    # BOUNDS VALIDATION FIX: Flag suspiciously high prices
    if unit_price > HIGH_UNIT_PRICE_THRESHOLD:
        warnings.append(
            f"High unit_price detected: ${unit_price:,.2f}. "
            f"Please verify this is correct (threshold: ${HIGH_UNIT_PRICE_THRESHOLD:,.2f})"
        )
        logger_instance.warning(f"High unit_price detected: {unit_price}")

    # BOUNDS VALIDATION FIX: For PER_SEAT pricing, seats should be >= 1 (except for FREE tiers)
    if pricing_model == "PER_SEAT" and seats == 0 and unit_price > 0:
        warnings.append(
            "PER_SEAT pricing model with 0 seats and non-zero price. "
            "This may cause division by zero in per-seat cost calculations. "
            "Consider using FLAT_FEE pricing model or setting seats >= 1."
        )
        logger_instance.warning(f"PER_SEAT with 0 seats and price={unit_price}")

    # BOUNDS VALIDATION FIX: Unreasonably high seat count
    if seats > MAX_SEATS_LIMIT:
        warnings.append(
            f"Very high seat count: {seats:,}. "
            f"Maximum reasonable limit is {MAX_SEATS_LIMIT:,}. "
            "Please verify this is correct."
        )
        logger_instance.warning(f"High seat count detected: {seats}")

    return warnings


def validate_discount_fields(
    discount_type: Optional[str],
    discount_value: Optional[int]
) -> None:
    """
    Validate discount_type and discount_value consistency.

    Rules:
    - If discount_type is provided, discount_value must also be provided (and > 0)
    - If discount_value is provided, discount_type must also be provided
    - discount_type must be one of: 'percent', 'fixed'
    - For 'percent' discount, value must be 0-100
    """
    # Both must be provided or both must be None
    if (discount_type and not discount_value) or (discount_value and not discount_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="discount_type and discount_value must both be provided or both be None"
        )

    # If both provided, validate values
    if discount_type and discount_value:
        # Validate discount_type
        if discount_type not in VALID_DISCOUNT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid discount_type: '{discount_type}'. Must be one of: {', '.join(VALID_DISCOUNT_TYPES)}"
            )

        # Validate discount_value > 0
        if discount_value <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="discount_value must be greater than 0"
            )

        # For percent discount, max is 100
        if discount_type == "percent" and discount_value > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Percent discount cannot exceed 100"
            )


class PlanCreate(BaseModel):
    """Request to create a custom plan."""
    plan_name: str = Field(..., min_length=1, max_length=50, description="Plan identifier")
    display_name: Optional[str] = Field(None, max_length=200)
    category: str = Field("general", max_length=50, description="Functional category (AI, DevOps, Design, etc.)")
    unit_price: float = Field(..., ge=0, le=100000, description="Monthly price per unit")
    billing_cycle: str = Field("monthly", description="monthly, annual, quarterly")
    # VAL-005: Currency validation only checks length here; actual validation against
    # org's default_currency is enforced at runtime in create_plan/update_plan endpoints
    currency: str = Field("USD", max_length=3, description="Currency code (USD, EUR, GBP)")
    seats: int = Field(0, ge=0, description="Number of seats (0 is valid for FREE tiers or non-seat-based plans)")
    pricing_model: str = Field("PER_SEAT", description="PER_SEAT or FLAT_FEE")
    yearly_price: Optional[float] = Field(None, ge=0)
    discount_type: Optional[str] = Field(None, description="percent or fixed")
    # EDGE-010: le=100 is intentional - discount_value represents percentage (0-100)
    # for 'percent' type, or a fixed currency amount for 'fixed' type (capped at 100)
    discount_value: Optional[int] = Field(None, ge=0, le=100)
    auto_renew: bool = Field(True)
    payment_method: Optional[str] = Field(None, max_length=50)
    owner_email: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=100)
    start_date: Optional[date] = None
    renewal_date: Optional[date] = None
    contract_id: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    source_currency: Optional[str] = Field(None, max_length=3, description="Original currency of template price")
    source_price: Optional[float] = Field(None, ge=0, description="Original price before conversion")
    exchange_rate_used: Optional[float] = Field(None, ge=0, description="Exchange rate at time of creation")
    # EDGE-007: Max 28 ensures valid day in all months (Feb has 28 days min)
    # EDGE-005: Leap year handling is done in stored procedures for billing calculations
    billing_anchor_day: Optional[int] = Field(None, ge=1, le=28, description="Day of month billing cycle starts (1-28). NULL = calendar-aligned (1st of month)")
    # Hierarchy fields for cost allocation
    hierarchy_dept_id: Optional[str] = Field(None, max_length=50, description="Department ID from org_hierarchy")
    hierarchy_dept_name: Optional[str] = Field(None, max_length=200, description="Department name")
    hierarchy_project_id: Optional[str] = Field(None, max_length=50, description="Project ID from org_hierarchy")
    hierarchy_project_name: Optional[str] = Field(None, max_length=200, description="Project name")
    hierarchy_team_id: Optional[str] = Field(None, max_length=50, description="Team ID from org_hierarchy")
    hierarchy_team_name: Optional[str] = Field(None, max_length=200, description="Team name")

    model_config = ConfigDict(extra="forbid")


class PlanUpdate(BaseModel):
    """Request to update a plan."""
    display_name: Optional[str] = Field(None, max_length=200)
    unit_price: Optional[float] = Field(None, ge=0, le=100000)
    status: Optional[str] = Field(None, description="active, cancelled, expired")
    billing_cycle: Optional[str] = None
    currency: Optional[str] = Field(None, max_length=3, description="Currency code (USD, EUR, GBP)")
    seats: Optional[int] = Field(None, ge=0)
    pricing_model: Optional[str] = None
    yearly_price: Optional[float] = Field(None, ge=0)
    discount_type: Optional[str] = None
    discount_value: Optional[int] = Field(None, ge=0, le=100)
    auto_renew: Optional[bool] = None
    payment_method: Optional[str] = Field(None, max_length=50)
    owner_email: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=100)
    renewal_date: Optional[date] = None
    contract_id: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    source_currency: Optional[str] = Field(None, max_length=3)
    source_price: Optional[float] = Field(None, ge=0)
    exchange_rate_used: Optional[float] = Field(None, ge=0)
    billing_anchor_day: Optional[int] = Field(None, ge=1, le=28)
    end_date: Optional[date] = None
    # Hierarchy fields for cost allocation
    hierarchy_dept_id: Optional[str] = Field(None, max_length=50)
    hierarchy_dept_name: Optional[str] = Field(None, max_length=200)
    hierarchy_project_id: Optional[str] = Field(None, max_length=50)
    hierarchy_project_name: Optional[str] = Field(None, max_length=200)
    hierarchy_team_id: Optional[str] = Field(None, max_length=50)
    hierarchy_team_name: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(extra="forbid")


class PlanResponse(BaseModel):
    """Response after creating/updating a plan."""
    success: bool
    plan: SubscriptionPlan
    message: str
    warnings: Optional[List[str]] = None  # Business rule warnings (not errors)


class DeletePlanResponse(BaseModel):
    """Response after deleting a plan."""
    success: bool
    subscription_id: str
    message: str


class EditVersionRequest(BaseModel):
    """Request to edit a plan with version history."""
    effective_date: date = Field(..., description="Date when the new version takes effect (YYYY-MM-DD)")
    display_name: Optional[str] = Field(None, max_length=200)
    unit_price: Optional[float] = Field(None, ge=0, le=100000)
    billing_cycle: Optional[str] = None
    currency: Optional[str] = Field(None, max_length=3)
    seats: Optional[int] = Field(None, ge=0)
    pricing_model: Optional[str] = None
    yearly_price: Optional[float] = Field(None, ge=0)
    discount_type: Optional[str] = None
    discount_value: Optional[int] = Field(None, ge=0, le=100)
    auto_renew: Optional[bool] = None
    payment_method: Optional[str] = Field(None, max_length=50)
    owner_email: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=100)
    renewal_date: Optional[date] = None
    contract_id: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    source_currency: Optional[str] = Field(None, max_length=3)
    source_price: Optional[float] = Field(None, ge=0)
    exchange_rate_used: Optional[float] = Field(None, ge=0)
    billing_anchor_day: Optional[int] = Field(None, ge=1, le=28)
    status: Optional[str] = Field(None, description="New status for the plan version")
    # Hierarchy fields for cost allocation
    hierarchy_dept_id: Optional[str] = Field(None, max_length=50)
    hierarchy_dept_name: Optional[str] = Field(None, max_length=200)
    hierarchy_project_id: Optional[str] = Field(None, max_length=50)
    hierarchy_project_name: Optional[str] = Field(None, max_length=200)
    hierarchy_team_id: Optional[str] = Field(None, max_length=50)
    hierarchy_team_name: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(extra="forbid")


class EditVersionResponse(BaseModel):
    """Response after creating a plan version."""
    success: bool
    new_plan: SubscriptionPlan
    old_plan: SubscriptionPlan
    message: str


# ============================================
# Input Validation
# ============================================

def validate_org_slug(org_slug: str) -> None:
    """Validate org_slug format."""
    if not org_slug or not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid org_slug format. Must be 3-50 alphanumeric characters with underscores."
        )


def validate_subscription_id(subscription_id: str) -> None:
    """
    SEC-002: Validate subscription_id format to prevent injection attacks.
    
    Expected format: sub_{provider}_{plan}_{uuid} or similar patterns.
    Allows: lowercase alphanumeric characters, underscores, hyphens.
    """
    if not subscription_id or not re.match(r'^sub_[a-z0-9_-]{1,100}$', subscription_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid subscription_id format. Must start with 'sub_' followed by 1-100 lowercase alphanumeric characters, underscores, or hyphens."
        )


def validate_provider(provider: str, allow_custom: bool = True) -> str:
    """
    Validate provider format. Allows custom providers by default.

    SEC-003: Custom providers are intentionally allowed to support user-defined
    SaaS providers not in our predefined list. The regex validation ensures
    only safe alphanumeric characters with underscores are permitted.
    """
    """Validate provider format. Allows custom providers by default."""
    provider_lower = provider.lower()
    # Allow known SaaS providers
    if is_saas_provider(provider_lower):
        return provider_lower
    # Allow custom providers (user-defined) if flag is set
    if allow_custom and re.match(r'^[a-z0-9_]{2,50}$', provider_lower):
        return provider_lower
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid provider format: {provider}. Must be 2-50 lowercase alphanumeric characters with underscores."
    )


def validate_plan_name(plan_name: str, transform_to_upper: bool = False) -> str:
    """
    Validate and sanitize plan_name format.

    Returns sanitized plan_name safe for use in queries.

    SECURITY FIX: When transform_to_upper=True, validates AFTER transformation
    to prevent Unicode bypasses (e.g., German ß → SS changes string length/pattern).
    """
    if not plan_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="plan_name is required"
        )

    # Sanitize: strip whitespace and convert to safe format
    sanitized = plan_name.strip()

    # Apply transformation BEFORE validation to prevent Unicode bypass attacks
    if transform_to_upper:
        sanitized = sanitized.upper()

    # Validate: only allow alphanumeric and underscores
    # EDGE-003: ASCII-only validation is intentional for database consistency,
    # cross-system compatibility, and to prevent Unicode normalization issues
    if not re.match(r'^[a-zA-Z0-9_]{1,50}$', sanitized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan_name format. Must be 1-50 alphanumeric characters with underscores. No special characters or SQL injection attempts allowed."
        )

    # SEC-001: SQL injection prevention is handled by parameterized queries throughout
    # this module. A blocklist approach was removed as it's bypassable (Unicode tricks,
    # encoding, etc.) and provides false security. The regex validation above ensures
    # only alphanumeric + underscore characters are allowed.

    return sanitized


def get_org_dataset(org_slug: str) -> str:
    """Get the organization's dataset ID."""
    return settings.get_org_dataset_name(org_slug)


def check_org_access(org: Dict, org_slug: str) -> None:
    """Check if the authenticated org can access the requested org."""
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access data for another organization"
        )

# Note: get_provider_display_name and get_provider_category are now imported
# from the centralized subscription_schema module

async def validate_hierarchy_ids(
    bq_client: BigQueryClient,
    org_slug: str,
    hierarchy_dept_id: Optional[str] = None,
    hierarchy_project_id: Optional[str] = None,
    hierarchy_team_id: Optional[str] = None
) -> None:
    """
    Validate that hierarchy IDs exist in the org_hierarchy table.

    Raises HTTPException 400 if any provided hierarchy ID is not found.
    Only validates IDs that are provided (non-None).
    """
    ids_to_validate = []
    if hierarchy_dept_id:
        ids_to_validate.append(("department", hierarchy_dept_id))
    if hierarchy_project_id:
        ids_to_validate.append(("project", hierarchy_project_id))
    if hierarchy_team_id:
        ids_to_validate.append(("team", hierarchy_team_id))

    if not ids_to_validate:
        return  # No hierarchy IDs provided, nothing to validate

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.org_hierarchy"

    for entity_type, entity_id in ids_to_validate:
        query = f"""
        SELECT entity_id FROM `{table_ref}`
        WHERE org_slug = @org_slug
          AND entity_id = @entity_id
          AND entity_type = @entity_type
          AND is_active = TRUE
        LIMIT 1
        """
        try:
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("entity_id", "STRING", entity_id),
                    bigquery.ScalarQueryParameter("entity_type", "STRING", entity_type),
                ],
                job_timeout_ms=30000
            )
            result = bq_client.client.query(query, job_config=job_config).result()
            found = False
            for _ in result:
                found = True
                break

            if not found:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid hierarchy_{entity_type}_id: '{entity_id}' not found in org_hierarchy table"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Failed to validate hierarchy {entity_type} ID {entity_id}: {e}")
            # Don't block on validation failures - the org_hierarchy table may not exist yet
            # for new organizations. The ID will just be stored as-is.




# ============================================
# Seed Data Loading
# ============================================
# PERF-005: Module-level cache to avoid re-reading CSV on every request
_SEED_DATA_CACHE: Dict[str, List[Dict[str, Any]]] = {}


def load_seed_data_for_provider(provider: str) -> List[Dict[str, Any]]:
    """Load seed data for a specific provider from CSV.

    Uses module-level cache to avoid reading CSV file on every request.
    """
    provider_key = provider.lower()

    # Check cache first
    if provider_key in _SEED_DATA_CACHE:
        return _SEED_DATA_CACHE[provider_key]
    seed_path = Path(__file__).parent.parent.parent.parent / "configs" / "saas" / "seed" / "data" / "saas_subscription_plans.csv"

    if not seed_path.exists():
        logger.warning(f"Seed data file not found: {seed_path}")
        _SEED_DATA_CACHE[provider_key] = []
        return []

    # EDGE-001: Empty result is valid - provider may have no plans configured yet
    plans = []
    with open(seed_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_provider = row.get("provider", "").lower()
            row_category = row.get("category", "").lower()

            # Skip LLM API tiers
            if row_category == "llm_api":
                continue

            # Filter by provider
            if row_provider == provider_key:
                plans.append(row)

    # Cache result after first load
    _SEED_DATA_CACHE[provider_key] = plans
    return plans


def get_saas_subscription_plans_schema() -> List[bigquery.SchemaField]:
    """
    Get the schema for saas_subscription_plans table.

    NOTE: This schema must match the Pydantic models (SubscriptionPlan, PlanCreate, etc.)
    defined in this file and in subscription_schema.py. Any schema changes should be
    synchronized with those models to ensure API request/response consistency.
    """
    return [
        bigquery.SchemaField("org_slug", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("subscription_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("provider", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("plan_name", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("display_name", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("category", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("status", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("start_date", "DATE", mode="NULLABLE"),
        bigquery.SchemaField("end_date", "DATE", mode="NULLABLE"),
        bigquery.SchemaField("billing_cycle", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("currency", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("seats", "INTEGER", mode="REQUIRED"),
        bigquery.SchemaField("pricing_model", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("unit_price", "FLOAT64", mode="REQUIRED"),
        bigquery.SchemaField("yearly_price", "FLOAT64", mode="NULLABLE"),
        bigquery.SchemaField("discount_type", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("discount_value", "INTEGER", mode="NULLABLE"),
        bigquery.SchemaField("auto_renew", "BOOLEAN", mode="REQUIRED"),
        bigquery.SchemaField("payment_method", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("invoice_id_last", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("owner_email", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("department", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("renewal_date", "DATE", mode="NULLABLE"),
        bigquery.SchemaField("contract_id", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("notes", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("source_currency", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("source_price", "FLOAT64", mode="NULLABLE"),
        bigquery.SchemaField("exchange_rate_used", "FLOAT64", mode="NULLABLE"),
        bigquery.SchemaField("updated_at", "TIMESTAMP", mode="NULLABLE"),
    ]


async def ensure_table_exists(bq_client: BigQueryClient, dataset_id: str) -> bool:
    """
    Ensure the saas_subscription_plans table exists in the org's dataset.
    Creates it if it doesn't exist.

    Returns True if table exists or was created successfully.
    """
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    try:
        # Try to get table metadata
        bq_client.client.get_table(table_ref)
        logger.debug(f"Table exists: {table_ref}")
        return True
    except google.api_core.exceptions.NotFound:
        # Table doesn't exist - create it
        logger.info(f"Table not found, creating: {table_ref}")
        try:
            schema = get_saas_subscription_plans_schema()
            table = bigquery.Table(table_ref, schema=schema)
            table.description = "SaaS subscription plans for providers (Canva, Slack, ChatGPT Plus, etc.)"
            table.clustering_fields = ["provider", "plan_name"]

            bq_client.client.create_table(table)
            logger.info(f"Created table: {table_ref}")
            return True
        except google.api_core.exceptions.GoogleAPIError as create_error:
            # ERR-003 FIX: Raise exception instead of silent failure
            logger.error(f"Failed to create table {table_ref}: {create_error}")
            raise RuntimeError(f"Failed to create subscription plans table: {create_error}") from create_error
    except google.api_core.exceptions.GoogleAPIError as e:
        # ERR-003 FIX: Raise exception for other API errors instead of silent failure
        logger.error(f"Failed to check table existence {table_ref}: {e}")
        raise RuntimeError(f"Failed to verify subscription plans table: {e}") from e


# ============================================
# Provider Endpoints
# ============================================

@router.get(
    "/subscriptions/{org_slug}/providers",
    response_model=ProviderListResponse,
    summary="List all subscription providers",
    tags=["Subscriptions"]
)
async def list_providers(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List all available SaaS subscription providers with their enabled status.

    Returns providers that can be enabled for subscription tracking.
    LLM API providers (OpenAI, Anthropic, Gemini) are excluded - use /integrations for those.

    Performance: This endpoint is cached for 5 minutes to improve response time.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)

    # Check cache first
    # MT-002: Cache key uses org_slug which is validated by validate_org_slug() above.
    # Validation ensures org_slug matches ^[a-zA-Z0-9_]{3,50}$ preventing injection/collisions.
    cache = get_cache()
    cache_key = f"providers_list_{org_slug}"
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        logger.debug(f"Cache HIT: providers list for {org_slug}")
        return cached_result

    dataset_id = get_org_dataset(org_slug)

    # Optimized query: Only select needed columns, add LIMIT
    query = f"""
    SELECT
        provider,
        COUNT(*) as plan_count,
        COUNTIF(status = 'active') > 0 as has_active
    FROM `{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}`
    WHERE category != 'llm_api'
    GROUP BY provider
    LIMIT 100
    """

    enabled_providers = {}
    try:
        with QueryPerformanceMonitor(operation="list_providers_query") as monitor:
            job_config = bigquery.QueryJobConfig(job_timeout_ms=30000)  # 30 second timeout for user queries
            result = bq_client.client.query(query, job_config=job_config).result()
            monitor.set_result(result)
            for row in result:
                enabled_providers[row.provider.lower()] = {
                    "plan_count": row.plan_count,
                    "is_enabled": row.has_active
                }
    except Exception as e:
        logger.debug(f"Could not query existing plans (table may not exist): {e}")

    # Build provider list
    providers = []
    for provider in sorted(SAAS_PROVIDERS - {"custom"}):  # Exclude custom from list
        info = enabled_providers.get(provider, {"plan_count": 0, "is_enabled": False})
        providers.append(ProviderInfo(
            provider=provider,
            display_name=get_provider_display_name(provider),
            category=get_provider_category(provider),
            is_enabled=info["plan_count"] > 0,
            plan_count=info["plan_count"]
        ))

    response = ProviderListResponse(providers=providers, total=len(providers))

    # Cache the result
    cache.set(cache_key, response, ttl_seconds=CACHE_TTL_SECONDS)
    logger.debug(f"Cache SET: providers list for {org_slug}")

    return response


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/enable",
    response_model=EnableProviderResponse,
    summary="Enable provider (mark as enabled without seeding)",
    tags=["Subscriptions"]
)
async def enable_provider(
    org_slug: str,
    provider: str,
    force: bool = Query(False, description="Force re-seed even if plans exist"),
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Enable a subscription provider without seeding any plans.

    This endpoint now only marks the provider as enabled (by ensuring the table exists).
    Use the /available-plans endpoint to see predefined plan templates from CSV.
    Plans must be manually created using the /plans POST endpoint.

    Note: The 'force' parameter is kept for API compatibility but has no effect.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)

    # Ensure table exists (creates it if missing - handles orgs created before this table was added)
    table_exists = await ensure_table_exists(bq_client, dataset_id)
    if not table_exists:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create or access {SAAS_SUBSCRIPTION_PLANS_TABLE} table for {org_slug}"
        )

    # Invalidate relevant caches after enabling provider
    invalidate_provider_cache(org_slug, provider)
    invalidate_org_cache(org_slug)
    logger.debug(f"Invalidated cache for org {org_slug} provider {provider}")

    return EnableProviderResponse(
        success=True,
        provider=provider,
        plans_seeded=0,
        message=f"Provider {provider} enabled. Use GET /available-plans to see predefined plan templates, then POST /plans to create plans manually."
    )


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/disable",
    response_model=DisableProviderResponse,
    summary="Disable provider (hard delete)",
    tags=["Subscriptions"]
)
async def disable_provider(
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Disable a subscription provider by deleting all plans.

    Hard delete - permanently removes all plans for the provider from BigQuery.
    Plans cannot be recovered - use re-enable to seed new plans from defaults.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # MT-003: Verify org isolation - authenticated org must match requested org_slug
    assert org_slug == org["org_slug"], f"Org mismatch: requested {org_slug} but authenticated as {org['org_slug']}"

    # First, count how many plans will be deleted (scoped to org for multi-tenant safety)
    count_query = f"""
    SELECT COUNT(*) as count
    FROM `{table_ref}`
    WHERE org_slug = @org_slug AND provider = @provider
    """

    try:
        # Get count of plans to be deleted
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ],
            job_timeout_ms=30000  # 30 second timeout for user queries
        )
        result = bq_client.client.query(count_query, job_config=job_config).result()
        plans_count = 0
        for row in result:
            plans_count = row.count

        # Delete all plans for the provider (scoped to org for multi-tenant safety)
        # NOTE: Any existing cost records (saas_daily_costs, etc.) that reference these plans
        # are date-partitioned and will be regenerated on the next pipeline run when the
        # provider is re-enabled. Historical cost data remains accurate for reporting.
        delete_query = f"""
        DELETE FROM `{table_ref}`
        WHERE org_slug = @org_slug AND provider = @provider
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ],
            job_timeout_ms=300000  # 5 minute timeout for admin/batch operations
        )
        bq_client.client.query(delete_query, job_config=job_config).result()

        # Invalidate relevant caches after deleting provider plans
        invalidate_provider_cache(org_slug, provider)
        invalidate_org_cache(org_slug)
        logger.debug(f"Invalidated cache for org {org_slug} provider {provider}")

        # IDEMPOTENCY NOTE: Operation is idempotent - calling again after provider is already
        # disabled returns success with 0 plans deleted (no side effects on repeated calls).
        return DisableProviderResponse(
            success=True,
            provider=provider,
            plans_deleted=plans_count,
            message=f"Deleted {plans_count} plan(s) for {provider}" if plans_count > 0 else f"Provider {provider} already disabled (0 plans to delete)"
        )
    except Exception as e:
        # ERR-001: Broad catch for unexpected errors after specific cases handled
        logger.error(f"Failed to disable provider {provider}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disable provider. Please try again."
        )


@router.get(
    "/subscriptions/{org_slug}/providers/{provider}/available-plans",
    response_model=AvailablePlansResponse,
    summary="Get available predefined plans from seed data",
    tags=["Subscriptions"]
)
async def get_available_plans(
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org)
):
    """
    Get predefined subscription plans from seed CSV data.

    Returns plan templates that can be used to create subscriptions.
    These are NOT active subscriptions - they are templates to choose from.

    Use POST /plans to create an actual subscription from these templates.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    # Load seed data from CSV
    seed_data = load_seed_data_for_provider(provider)

    # Convert to AvailablePlan objects
    # EDGE-001: Empty result is valid - provider may have no plans configured yet
    plans = []
    for row in seed_data:
        try:
            plan = AvailablePlan(
                plan_name=row.get("plan_name", "").upper(),
                display_name=row.get("display_name") or row.get("plan_name", ""),
                billing_cycle=row.get("billing_cycle", "monthly"),
                pricing_model=row.get("pricing_model", "FLAT_FEE"),
                unit_price=float(row.get("unit_price", 0)),
                yearly_price=float(row.get("yearly_price")) if row.get("yearly_price") else None,
                notes=row.get("notes"),
                seats=int(row.get("seats", 0)) if row.get("seats") else 0,
                category=row.get("category", "other"),
                discount_type=row.get("discount_type") if row.get("discount_type") else None,
                discount_value=int(row.get("discount_value")) if row.get("discount_value") else None,
            )
            plans.append(plan)
        except (ValueError, TypeError) as e:
            logger.warning(f"Skipping invalid seed row for {provider}: {e}")
            continue

    return AvailablePlansResponse(
        success=True,
        provider=provider,
        plans=plans
    )


# ============================================
# Plan Endpoints
# ============================================

@router.get(
    "/subscriptions/{org_slug}/providers/{provider}/plans",
    response_model=PlanListResponse,
    summary="List plans for provider",
    tags=["Subscriptions"]
)
async def list_plans(
    org_slug: str,
    provider: str,
    include_disabled: bool = Query(True, description="Include disabled plans"),
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List subscription plans for a specific provider.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"
    
    # Ensure table exists first (idempotent, fast)
    await ensure_table_exists(bq_client, dataset_id)

    query = f"""
    SELECT
        org_slug, subscription_id, provider, plan_name, display_name,
        category, status, start_date, end_date, billing_cycle, currency,
        seats, pricing_model, unit_price, yearly_price,
        discount_type, discount_value, auto_renew, payment_method,
        invoice_id_last, owner_email, department, renewal_date,
        contract_id, notes, updated_at,
        source_currency, source_price, exchange_rate_used,
        hierarchy_dept_id, hierarchy_dept_name,
        hierarchy_project_id, hierarchy_project_name,
        hierarchy_team_id, hierarchy_team_name
    FROM `{table_ref}`
    WHERE org_slug = @org_slug AND provider = @provider
        AND (status = 'active' OR status = 'pending' OR status = 'cancelled' OR status = 'expired')
    -- PERF-002: BigQuery automatically optimizes based on clustering; no index hints needed
    ORDER BY updated_at DESC
    """
    
    # Check cache first
    cache = get_cache()
    cache_key = f"plans:{org_slug}:{provider}"
    cached_response = cache.get(cache_key)
    if cached_response:
        logger.debug(f"Cache HIT: plans list for {org_slug}/{provider}")
        return PlanListResponse(**cached_response)

    logger.debug(f"Cache MISS: plans list for {org_slug}/{provider}")

    # EDGE-001: Empty result is valid - provider may have no plans configured yet
    plans = []
    
    # Initialize totals
    total_monthly_cost = 0.0
    total_annual_cost = 0.0
    totals_by_currency = {}  # { "USD": {"monthly": 0.0, "annual": 0.0}, ... }

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        result = bq_client.client.query(query, job_config=job_config).result()

        for row in result:
            # PERF-004: hasattr checks are defensive programming to handle schema evolution.
            # BigQuery schema may not have all fields if table was created with older schema.
            # These checks ensure backward compatibility when new columns are added.
            plan = SubscriptionPlan(
                org_slug=row.org_slug,
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.display_name if hasattr(row, "display_name") and row.display_name else None,
                category=row.category or "other",
                status=row.status if hasattr(row, "status") else "active",
                start_date=row.start_date if hasattr(row, "start_date") else None,
                end_date=row.end_date if hasattr(row, "end_date") else None,
                billing_cycle=row.billing_cycle or "monthly",
                currency=row.currency if hasattr(row, "currency") else DEFAULT_CURRENCY.value,
                seats=row.seats if hasattr(row, "seats") else 0,
                pricing_model=row.pricing_model if hasattr(row, "pricing_model") else "PER_SEAT",
                unit_price=float(row.unit_price or 0),
                yearly_price=float(row.yearly_price) if hasattr(row, "yearly_price") and row.yearly_price else None,
                discount_type=row.discount_type if hasattr(row, "discount_type") else None,
                discount_value=row.discount_value if hasattr(row, "discount_value") else None,
                auto_renew=row.auto_renew if hasattr(row, "auto_renew") else True,
                payment_method=row.payment_method if hasattr(row, "payment_method") else None,
                invoice_id_last=row.invoice_id_last if hasattr(row, "invoice_id_last") else None,
                owner_email=row.owner_email if hasattr(row, "owner_email") else None,
                department=row.department if hasattr(row, "department") else None,
                renewal_date=row.renewal_date if hasattr(row, "renewal_date") else None,
                contract_id=row.contract_id if hasattr(row, "contract_id") else None,
                notes=row.notes if hasattr(row, "notes") else None,
                source_currency=row.source_currency if hasattr(row, "source_currency") else None,
                source_price=float(row.source_price) if hasattr(row, "source_price") and row.source_price else None,
                exchange_rate_used=float(row.exchange_rate_used) if hasattr(row, "exchange_rate_used") and row.exchange_rate_used else None,
                hierarchy_dept_id=row.hierarchy_dept_id if hasattr(row, "hierarchy_dept_id") else None,
                hierarchy_dept_name=row.hierarchy_dept_name if hasattr(row, "hierarchy_dept_name") else None,
                hierarchy_project_id=row.hierarchy_project_id if hasattr(row, "hierarchy_project_id") else None,
                hierarchy_project_name=row.hierarchy_project_name if hasattr(row, "hierarchy_project_name") else None,
                hierarchy_team_id=row.hierarchy_team_id if hasattr(row, "hierarchy_team_id") else None,
                hierarchy_team_name=row.hierarchy_team_name if hasattr(row, "hierarchy_team_name") else None,
                updated_at=row.updated_at if hasattr(row, "updated_at") else None,
            )
            plans.append(plan)

            # PERF-001: Calculation is done client-side (in this loop) for flexibility.
            # This allows different billing cycles and discount types to be calculated
            # dynamically without requiring separate BigQuery queries per plan.
            # Trade-off: O(n) iteration vs N+1 query pattern - iteration is faster.
            #
            # Calculation Logic
            # Note: unit_price is actually in the plan's currency (historically named _usd)
            # We use the 'currency' field to distinguish.

            # Calculate Monthly Equivalent
            monthly_val = 0.0
            annual_val = 0.0

            # Determine base annual/monthly cost for this plan
            # Ensure seats is at least 1 to avoid zero calculations for per-seat plans
            effective_seats = max(plan.seats, 1) if plan.pricing_model == "PER_SEAT" else 1

            if plan.pricing_model == "PER_SEAT":
                 base_cost = plan.unit_price * effective_seats
            else:
                 base_cost = plan.unit_price # Flat fee

            # Apply discount if present
            if plan.discount_type and plan.discount_value:
                if plan.discount_type == "percent" and 0 < plan.discount_value <= 100:
                    discount_amount = base_cost * (plan.discount_value / 100)
                    base_cost = base_cost - discount_amount
                elif plan.discount_type == "fixed" and plan.discount_value > 0:
                    # Fixed discount cannot exceed base cost
                    discount_amount = min(plan.discount_value, base_cost)
                    base_cost = base_cost - discount_amount

            if plan.billing_cycle == "monthly":
                monthly_val = base_cost
                annual_val = base_cost * 12
            elif plan.billing_cycle == "quarterly":
                monthly_val = base_cost / 3
                annual_val = base_cost * 4
            elif plan.billing_cycle == "annual":
                # For annual, unit_price usually stores the FULL annual price in some systems,
                # OR the monthly equivalent.
                # Let's check how 'yearly_price' is used.
                # If yearly_price is set, that is the total annual cost.
                if plan.yearly_price:
                     annual_val = plan.yearly_price
                     monthly_val = plan.yearly_price / 12
                else:
                     # If only unit_price exists and it is annual...
                     # Assuming unit_price is the annual price if cycle is annual
                     annual_val = base_cost
                     monthly_val = base_cost / 12
            
            # Add to Currency Buckets
            curr = plan.currency or "USD"
            if curr not in totals_by_currency:
                totals_by_currency[curr] = {"monthly": 0.0, "annual": 0.0}
            
            totals_by_currency[curr]["monthly"] += monthly_val
            totals_by_currency[curr]["annual"] += annual_val

            # Deprecated Legacy Field: Sum everything as if it's 1:1 (for backward compatibility warnings)
            # Or should we only sum USD? 
            # Current behavior was summing everything. Let's keep it summing everything but strictly just monthly values
            total_monthly_cost += monthly_val
            total_annual_cost += annual_val # Summing mixed currencies (Legacy behavior for top level)

    except Exception as e:
        # ERR-001: Broad catch for unexpected errors (JSON parsing, iteration, etc.)
        logger.error(f"Failed to list plans: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list plans. Please try again."
        )

    response = PlanListResponse(
        plans=plans,
        total=len(plans),
        total_monthly_cost=round(total_monthly_cost, 2),
        total_annual_cost=round(total_annual_cost, 2),
        totals_by_currency={k: {m: round(v, 2) for m, v in vals.items()} for k, vals in totals_by_currency.items()}
    )

    # Cache the result
    cache.set(cache_key, response.model_dump(), ttl_seconds=CACHE_TTL_SECONDS) # Use model_dump() for caching
    logger.debug(f"Cache SET: plans list for {org_slug}/{provider}")

    return response


@router.get(
    "/subscriptions/{org_slug}/providers/{provider}/available-plans",
    response_model=AvailablePlansResponse,
    summary="Get available plan templates from CSV",
    tags=["Subscriptions"]
)
async def get_available_plans(
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org)
):
    """
    Get predefined plan templates for a provider from CSV seed data.

    This endpoint reads from configs/saas/seed/data/saas_subscription_plans.csv
    and returns plan metadata (not org-specific fields like subscription_id).

    Use these templates as a reference when creating plans via POST /plans.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    # Load seed data for the provider
    seed_data = load_seed_data_for_provider(provider)

    if not seed_data:
        return AvailablePlansResponse(
            success=True,
            provider=provider,
            plans=[]
        )

    # Parse numeric values - handle empty strings properly
    def parse_int(val: Any, default: int = 1) -> int:
        if val is None or val == "" or str(val).strip() == "":
            return default
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    def parse_float(val: Any, default: Optional[float] = None) -> Optional[float]:
        if val is None or val == "" or str(val).strip() == "":
            return default
        try:
            return float(val)  # Return actual value including 0.0
        except (ValueError, TypeError):
            return default

    # Convert seed data to AvailablePlan objects
    available_plans = []
    for plan in seed_data:
        pricing_model = plan.get("pricing_model", "PER_SEAT") or "PER_SEAT"
        # For PER_SEAT plans, default to 1 seat; for FLAT_FEE, default to 0
        default_seats = 1 if pricing_model == "PER_SEAT" else 0
        seats = parse_int(plan.get("seats"), default_seats)
        unit_price = parse_float(plan.get("unit_price"), 0.0)
        yearly_price = parse_float(plan.get("yearly_price"))
        # Calculate yearly_price if not provided and billing cycle is annual
        billing_cycle = plan.get("billing_cycle") or plan.get("billing_period", "monthly") or "monthly"
        if yearly_price is None and billing_cycle == "annual":
            yearly_price = unit_price * 12
        display_name = plan.get("display_name", "") or ""
        notes = plan.get("notes", "") or ""
        category = plan.get("category", "other") or "other"
        plan_name = plan.get("plan_name", "DEFAULT") or "DEFAULT"
        discount_type = plan.get("discount_type")
        discount_value = parse_int(plan.get("discount_value"), None) if discount_type else None
        # Validate discount - if type is percent, value should be 0-100
        if discount_type == "percent" and discount_value is not None and discount_value > 100:
            discount_value = 100

        available_plans.append(AvailablePlan(
            plan_name=plan_name,
            display_name=display_name,
            billing_cycle=billing_cycle,
            pricing_model=pricing_model,
            unit_price=unit_price,
            yearly_price=yearly_price,
            notes=notes,
            seats=seats,
            category=category,
            discount_type=discount_type,
            discount_value=discount_value
        ))

    return AvailablePlansResponse(
        success=True,
        provider=provider,
        plans=available_plans
    )


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/plans",
    response_model=PlanResponse,
    summary="Create custom plan",
    tags=["Subscriptions"]
)
async def create_plan(
    org_slug: str,
    provider: str,
    plan: PlanCreate,
    # IDEMPOTENCY NOTE: Optional idempotency key for deduplication. Full implementation would
    # check org_idempotency_keys table before insert and store key on success.
    idempotency_key: Optional[str] = Query(None, description="Optional idempotency key for deduplication"),
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Create a custom subscription plan.

    Custom plans are user-created plans for specific providers.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)
    # SECURITY FIX: Validate plan_name AFTER .upper() transformation to prevent Unicode bypass
    validated_plan_name = validate_plan_name(plan.plan_name, transform_to_upper=True)

    # Validate enum fields
    validate_enum_field(plan.billing_cycle, VALID_BILLING_CYCLES, "billing_cycle")
    validate_enum_field(plan.pricing_model, VALID_PRICING_MODELS, "pricing_model")
    # Validate discount type and value consistency
    validate_discount_fields(plan.discount_type, plan.discount_value)

    # VAL-003: Validate start_date is not too far in the future
    validate_start_date_not_too_far_future(plan.start_date)

    # VAL-004: Validate owner_email format if provided
    validate_email_format(plan.owner_email)

    # BOUNDS VALIDATION: Check business rules and collect warnings
    business_warnings = validate_business_rules(
        unit_price=plan.unit_price,
        seats=plan.seats,
        pricing_model=plan.pricing_model,
        logger_instance=logger
    )

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Ensure table exists before any operations (prevents silent failures)
    # EDGE-008: First plan for provider is handled automatically - table created if missing
    table_exists = await ensure_table_exists(bq_client, dataset_id)
    if not table_exists:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create or access {SAAS_SUBSCRIPTION_PLANS_TABLE} table for {org_slug}"
        )

    # Get org's default currency from org_profiles
    # SECURITY FIX: Return 404 if org not found instead of silently defaulting to USD
    org_currency_query = f"""
    SELECT default_currency FROM `{settings.gcp_project_id}.organizations.org_profiles`
    WHERE org_slug = @org_slug
    """
    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            ],
            job_timeout_ms=30000  # Standardized timeout for read operations
        )
        result = bq_client.client.query(org_currency_query, job_config=job_config).result()
        org_currency = None
        for row in result:
            org_currency = row.default_currency or DEFAULT_CURRENCY.value
            break

        # FIX: Return 404 if org not found (don't silently default)
        if org_currency is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{org_slug}' not found in org_profiles. Please complete onboarding first."
            )

        # Enforce currency matches org default
        if plan.currency != org_currency:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Plan currency '{plan.currency}' must match organization's default currency '{org_currency}'"
            )
    except HTTPException as e:
        # ERR-005: Log before re-raising to preserve context
        logger.debug(f"Re-raising HTTP exception: {e.detail}")
        raise
    except Exception as e:
        # ERR-001: Broad catch for database/network issues when fetching org currency
        logger.error(f"Failed to fetch org currency: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to validate organization currency. Please try again."
        )

    # Check for duplicate plan
    # IDEMPOTENCY NOTE: BigQuery doesn't support MERGE with INSERT...ON CONFLICT for this use case.
    # Race condition is mitigated by subscription_id UUID uniqueness - concurrent inserts may both
    # succeed but will have different subscription_ids. Application-level deduplication handles
    # the logical duplicate via the active plan check below.
    duplicate_check_query = f"""
    SELECT COUNT(*) as count FROM `{table_ref}`
    WHERE org_slug = @org_slug
      AND provider = @provider
      AND plan_name = @plan_name
      AND status = 'active'
      AND (end_date IS NULL OR end_date > CURRENT_DATE())
    """
    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("plan_name", "STRING", validated_plan_name),
            ],
            job_timeout_ms=30000  # Standardized timeout for read operations
        )
        result = bq_client.client.query(duplicate_check_query, job_config=job_config).result()
        for row in result:
            if row.count > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Active plan '{validated_plan_name}' already exists for provider '{provider}'"
                )
    except HTTPException as e:
        # ERR-005: Log before re-raising to preserve context
        logger.debug(f"Re-raising HTTP exception: {e.detail}")
        raise
    except Exception as e:
        # ERR-001: Broad catch for database errors when checking duplicates
        logger.error(f"Failed to check for duplicate plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check for duplicate plan. Please try again."
        )

    # CRUD-001: Validate hierarchy IDs exist in org_hierarchy table before insert
    if plan.hierarchy_dept_id or plan.hierarchy_project_id or plan.hierarchy_team_id:
        await validate_hierarchy_ids(
            bq_client=bq_client,
            org_slug=org_slug,
            hierarchy_dept_id=plan.hierarchy_dept_id,
            hierarchy_project_id=plan.hierarchy_project_id,
            hierarchy_team_id=plan.hierarchy_team_id
        )

    # EDGE-009: Using 12 hex chars (48 bits) for lower collision probability than 8 chars
    subscription_id = f"sub_{provider}_{plan.plan_name.lower()}_{uuid.uuid4().hex[:12]}"
    # Use plan.category if provided, otherwise fall back to provider's default category
    category = plan.category if plan.category and plan.category != "general" else get_provider_category(provider).value

    # Determine start_date and status
    # EDGE-002: Dates are stored as DATE type (no timezone) - comparison uses server local date
    effective_start_date = plan.start_date or date.today()
    initial_status = "pending" if plan.start_date and plan.start_date > date.today() else "active"

    insert_query = f"""
    INSERT INTO `{table_ref}` (
        org_slug, subscription_id, provider, plan_name, display_name,
        category, status, start_date, billing_cycle, currency, seats,
        pricing_model, unit_price, yearly_price, discount_type,
        discount_value, auto_renew, payment_method, owner_email, department,
        renewal_date, contract_id, notes, source_currency, source_price,
        exchange_rate_used, hierarchy_dept_id, hierarchy_dept_name,
        hierarchy_project_id, hierarchy_project_name,
        hierarchy_team_id, hierarchy_team_name, updated_at
    ) VALUES (
        @org_slug,
        @subscription_id,
        @provider,
        @plan_name,
        @display_name,
        @category,
        @status,
        @start_date,
        @billing_cycle,
        @currency,
        @seats,
        @pricing_model,
        @unit_price,
        @yearly_price,
        @discount_type,
        @discount_value,
        @auto_renew,
        @payment_method,
        @owner_email,
        @department,
        @renewal_date,
        @contract_id,
        @notes,
        @source_currency,
        @source_price,
        @exchange_rate_used,
        @hierarchy_dept_id,
        @hierarchy_dept_name,
        @hierarchy_project_id,
        @hierarchy_project_name,
        @hierarchy_team_id,
        @hierarchy_team_name,
        CURRENT_TIMESTAMP()
    )
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("plan_name", "STRING", validated_plan_name),  # Use pre-validated name
                bigquery.ScalarQueryParameter("display_name", "STRING", plan.display_name or plan.plan_name),
                bigquery.ScalarQueryParameter("category", "STRING", category),
                bigquery.ScalarQueryParameter("status", "STRING", initial_status),
                bigquery.ScalarQueryParameter("start_date", "DATE", effective_start_date),
                bigquery.ScalarQueryParameter("billing_cycle", "STRING", plan.billing_cycle),
                bigquery.ScalarQueryParameter("currency", "STRING", plan.currency),
                bigquery.ScalarQueryParameter("seats", "INT64", plan.seats),
                bigquery.ScalarQueryParameter("pricing_model", "STRING", plan.pricing_model),
                bigquery.ScalarQueryParameter("unit_price", "FLOAT64", plan.unit_price if plan.unit_price is not None else 0.0),
                # EDGE-006: Preserve NULL for yearly_price to distinguish "not set" from "$0"
                bigquery.ScalarQueryParameter("yearly_price", "FLOAT64", plan.yearly_price if plan.yearly_price is not None else None),
                bigquery.ScalarQueryParameter("discount_type", "STRING", plan.discount_type),
                bigquery.ScalarQueryParameter("discount_value", "INT64", plan.discount_value),
                bigquery.ScalarQueryParameter("auto_renew", "BOOL", plan.auto_renew),
                bigquery.ScalarQueryParameter("payment_method", "STRING", plan.payment_method),
                bigquery.ScalarQueryParameter("owner_email", "STRING", plan.owner_email),
                bigquery.ScalarQueryParameter("department", "STRING", plan.department),
                bigquery.ScalarQueryParameter("renewal_date", "DATE", plan.renewal_date),
                bigquery.ScalarQueryParameter("contract_id", "STRING", plan.contract_id),
                bigquery.ScalarQueryParameter("notes", "STRING", plan.notes if plan.notes else None),
                bigquery.ScalarQueryParameter("source_currency", "STRING", plan.source_currency),
                bigquery.ScalarQueryParameter("source_price", "FLOAT64", plan.source_price),
                bigquery.ScalarQueryParameter("exchange_rate_used", "FLOAT64", plan.exchange_rate_used),
                bigquery.ScalarQueryParameter("hierarchy_dept_id", "STRING", plan.hierarchy_dept_id),
                bigquery.ScalarQueryParameter("hierarchy_dept_name", "STRING", plan.hierarchy_dept_name),
                bigquery.ScalarQueryParameter("hierarchy_project_id", "STRING", plan.hierarchy_project_id),
                bigquery.ScalarQueryParameter("hierarchy_project_name", "STRING", plan.hierarchy_project_name),
                bigquery.ScalarQueryParameter("hierarchy_team_id", "STRING", plan.hierarchy_team_id),
                bigquery.ScalarQueryParameter("hierarchy_team_name", "STRING", plan.hierarchy_team_name),
            ],
            job_timeout_ms=30000  # 30 second timeout for user operations
        )
        # Execute insert and verify
        query_job = bq_client.client.query(insert_query, job_config=job_config)
        query_job.result()  # Wait for completion

        # Log the insert details for debugging
        # MT-005: Log messages include org data for debugging. This is acceptable for internal logs.
        # Production logs should be access-controlled and not exposed to unauthorized users.
        logger.info(f"INSERT executed for plan: org={org_slug}, provider={provider}, plan_name={plan.plan_name}, "
                    f"subscription_id={subscription_id}, unit_price={plan.unit_price}, category={category}, status={initial_status}")

        # Verify the insert succeeded by checking if rows were affected
        if query_job.num_dml_affected_rows is not None and query_job.num_dml_affected_rows == 0:
            logger.error(f"INSERT completed but 0 rows affected for subscription_id={subscription_id}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Plan creation failed: no rows inserted. Check data validity."
            )

        # CRITICAL: Verify insert by fetching from database (don't trust request data)
        # NOTE: BigQuery streaming buffer may cause a brief delay (up to a few minutes) before
        # newly inserted rows are visible in queries. The DML insert used here is committed
        # immediately, but concurrent reads from other sessions may experience slight staleness.
        verify_query = f"""
        SELECT
            org_slug, subscription_id, provider, plan_name, display_name,
            category, status, start_date, end_date, billing_cycle, currency,
            seats, pricing_model, unit_price, yearly_price,
            discount_type, discount_value, auto_renew, payment_method,
            owner_email, department, renewal_date, contract_id, notes, updated_at,
            source_currency, source_price, exchange_rate_used,
            hierarchy_dept_id, hierarchy_dept_name,
            hierarchy_project_id, hierarchy_project_name,
            hierarchy_team_id, hierarchy_team_name
        FROM `{table_ref}`
        WHERE org_slug = @org_slug AND subscription_id = @subscription_id
        """
        verify_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        verify_result = bq_client.client.query(verify_query, job_config=verify_config).result()

        created_plan = None
        for row in verify_result:
            created_plan = SubscriptionPlan(
                org_slug=row.org_slug,
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.display_name,
                category=row.category,
                status=row.status,
                start_date=row.start_date,
                end_date=row.end_date,
                billing_cycle=row.billing_cycle,
                currency=row.currency,
                seats=row.seats,
                pricing_model=row.pricing_model,
                unit_price=row.unit_price,
                yearly_price=row.yearly_price,
                discount_type=row.discount_type,
                discount_value=row.discount_value,
                auto_renew=row.auto_renew,
                payment_method=row.payment_method,
                owner_email=row.owner_email,
                department=row.department,
                renewal_date=row.renewal_date,
                contract_id=row.contract_id,
                notes=row.notes,
                source_currency=row.source_currency if hasattr(row, "source_currency") else None,
                source_price=float(row.source_price) if hasattr(row, "source_price") and row.source_price else None,
                exchange_rate_used=float(row.exchange_rate_used) if hasattr(row, "exchange_rate_used") and row.exchange_rate_used else None,
                hierarchy_dept_id=row.hierarchy_dept_id if hasattr(row, "hierarchy_dept_id") else None,
                hierarchy_dept_name=row.hierarchy_dept_name if hasattr(row, "hierarchy_dept_name") else None,
                hierarchy_project_id=row.hierarchy_project_id if hasattr(row, "hierarchy_project_id") else None,
                hierarchy_project_name=row.hierarchy_project_name if hasattr(row, "hierarchy_project_name") else None,
                hierarchy_team_id=row.hierarchy_team_id if hasattr(row, "hierarchy_team_id") else None,
                hierarchy_team_name=row.hierarchy_team_name if hasattr(row, "hierarchy_team_name") else None,
            )
            break

        if created_plan is None:
            logger.error(f"INSERT verification failed: plan not found in database for subscription_id={subscription_id}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Plan creation failed: data not persisted. Please try again."
            )

        # Invalidate relevant caches after creating plan
        invalidate_provider_cache(org_slug, provider)
        invalidate_org_cache(org_slug)
        logger.debug(f"Invalidated cache for org {org_slug} provider {provider}")

        # AUDIT LOG FIX: Audit logging with retry to prevent orphaned operations
        # Retry up to 3 times to ensure audit trail is preserved
        # IDEMPOTENCY NOTE: Retry doesn't prevent duplicate audit entries - this is acceptable
        # since audit logs are append-only and duplicates provide additional trace evidence.
        audit_details = {
            "provider": provider,
            "plan_name": plan.plan_name,
            "display_name": plan.display_name,
            "unit_price": plan.unit_price,
            "currency": plan.currency,
            "seats": plan.seats,
            "pricing_model": plan.pricing_model,
            "billing_cycle": plan.billing_cycle,
            "status": initial_status,
            "start_date": str(effective_start_date) if effective_start_date else None,
            "source_currency": plan.source_currency,
            "source_price": plan.source_price,
            "exchange_rate_used": plan.exchange_rate_used,
        }
        # STATE-005: Audit logs are best-effort and non-blocking. If audit logging fails,
        # the state can be regenerated from saas_subscription_plans table history
        # (using subscription_id, created_at, updated_at, start_date, end_date).
        audit_logged = False
        for attempt in range(3):
            try:
                await log_create(
                    org_slug=org_slug,
                    resource_type=AuditLogger.RESOURCE_SUBSCRIPTION_PLAN,
                    resource_id=subscription_id,
                    details=audit_details
                )
                audit_logged = True
                break
            except Exception as audit_error:
                logger.warning(f"Audit log attempt {attempt + 1} failed: {audit_error}")
                if attempt == 2:
                    # Final attempt failed - log critical warning but don't fail the operation
                    logger.critical(
                        f"AUDIT LOG FAILURE: Plan {subscription_id} created but audit log failed after 3 attempts. "
                        f"Details: {audit_details}"
                    )
        if not audit_logged:
            # Add warning to response about audit failure
            business_warnings.append("Audit log failed - operation completed but may not be fully tracked")

        return PlanResponse(
            success=True,
            plan=created_plan,
            message=f"Created custom plan {plan.plan_name} for {provider}",
            warnings=business_warnings if business_warnings else None
        )
    except google.api_core.exceptions.BadRequest as e:
        # BIGQUERY ERROR HANDLING FIX: Catch specific BigQuery errors
        logger.error(f"BigQuery bad request: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid data format for BigQuery: {e}"
        )
    except google.api_core.exceptions.Forbidden as e:
        logger.error(f"BigQuery permission denied: {e}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied to access BigQuery: {e}"
        )
    except google.api_core.exceptions.ResourceExhausted as e:
        logger.error(f"BigQuery quota exceeded: {e}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"BigQuery quota exceeded. Please try again later: {e}"
        )
    except Exception as e:
        # ERR-001: Broad catch needed to handle unexpected errors (network issues, serialization, etc.)
        # Specific BigQuery errors (BadRequest, Forbidden, ResourceExhausted) are caught above
        logger.error(f"Failed to create plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create plan. Please try again."
        )


@router.put(
    "/subscriptions/{org_slug}/providers/{provider}/plans/{subscription_id}",
    response_model=PlanResponse,
    summary="Update plan",
    tags=["Subscriptions"]
)
async def update_plan(
    org_slug: str,
    provider: str,
    subscription_id: str,
    updates: PlanUpdate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Update an existing subscription plan.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)
    validate_subscription_id(subscription_id)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Parse updates once for use throughout the function
    updates_dict = updates.model_dump(exclude_unset=True)

    # STATUS TRANSITION FIX: If status is being updated, fetch current status and validate transition
    if "status" in updates_dict and updates_dict["status"] is not None:
        current_status_query = f"""
        SELECT status FROM `{table_ref}`
        WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
        """
        try:
            status_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider),
                ],
                job_timeout_ms=30000
            )
            status_result = bq_client.client.query(current_status_query, job_config=status_config).result()
            rows = list(status_result)
            if not rows:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Plan {subscription_id} not found"
                )
            current_status = rows[0].status
            new_status = updates_dict["status"]
            validate_status_transition(current_status, new_status)
        except HTTPException as e:
            # ERR-005: Log before re-raising to preserve context
            logger.debug(f"Re-raising HTTP exception: {e.detail}")
            raise
        except Exception as e:
            # ERR-001: Broad catch for database errors when fetching current status
            logger.error(f"Failed to validate status transition: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to validate status transition. Please try again."
            )

    # Build SET clause and parameters from provided updates
    # Allowlist of valid field names to prevent SQL injection via column names
    ALLOWED_UPDATE_FIELDS = {
        'display_name', 'unit_price', 'status', 'billing_cycle', 'currency',
        'seats', 'pricing_model', 'yearly_price', 'discount_type', 'discount_value',
        'auto_renew', 'payment_method', 'owner_email', 'department', 'renewal_date',
        'contract_id', 'notes', 'source_currency', 'source_price', 'exchange_rate_used', 'end_date',
        'hierarchy_dept_id', 'hierarchy_dept_name', 'hierarchy_project_id',
        'hierarchy_project_name', 'hierarchy_team_id', 'hierarchy_team_name'
    }

    set_parts = ["updated_at = CURRENT_TIMESTAMP()"]
    query_parameters = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
        bigquery.ScalarQueryParameter("provider", "STRING", provider),
    ]
    # Note: updates_dict already defined above for status transition validation

    param_counter = 0
    for field, value in updates_dict.items():
        # Skip fields not in allowlist (security: prevents SQL injection via column names)
        if field not in ALLOWED_UPDATE_FIELDS:
            logger.warning(f"Ignoring unknown field in update: {field}")
            continue
        if value is not None:
            param_name = f"p{param_counter}"
            param_counter += 1
            set_parts.append(f"{field} = @{param_name}")

            if isinstance(value, bool):
                query_parameters.append(bigquery.ScalarQueryParameter(param_name, "BOOL", value))
            elif isinstance(value, int):
                query_parameters.append(bigquery.ScalarQueryParameter(param_name, "INT64", value))
            elif isinstance(value, float):
                query_parameters.append(bigquery.ScalarQueryParameter(param_name, "FLOAT64", value))
            elif isinstance(value, date):
                query_parameters.append(bigquery.ScalarQueryParameter(param_name, "DATE", value))
            else:
                query_parameters.append(bigquery.ScalarQueryParameter(param_name, "STRING", str(value)))

    if len(set_parts) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    # STATE-003: BigQuery does not support row-level locking (no SELECT FOR UPDATE).
    # For concurrent update protection, use updated_at comparison in WHERE clause if needed:
    # WHERE ... AND updated_at = @expected_updated_at
    # Returns 0 rows affected if record was modified by another request.
    update_query = f"""
    UPDATE `{table_ref}`
    SET {', '.join(set_parts)}
    WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=query_parameters,
            job_timeout_ms=30000  # 30 second timeout for user operations
        )
        update_job = bq_client.client.query(update_query, job_config=job_config)
        update_job.result()

        # Verify the update affected a row (plan exists)
        if update_job.num_dml_affected_rows is not None and update_job.num_dml_affected_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan {subscription_id} not found for provider {provider}"
            )

        # Fetch updated plan with explicit columns
        select_query = f"""
        SELECT
            org_slug, subscription_id, provider, plan_name, display_name,
            category, status, start_date, end_date, billing_cycle, currency,
            seats, pricing_model, unit_price, yearly_price,
            discount_type, discount_value, auto_renew, payment_method,
            invoice_id_last, owner_email, department, renewal_date,
            contract_id, notes, updated_at,
            source_currency, source_price, exchange_rate_used,
            hierarchy_dept_id, hierarchy_dept_name,
            hierarchy_project_id, hierarchy_project_name,
            hierarchy_team_id, hierarchy_team_name
        FROM `{table_ref}`
        WHERE org_slug = @org_slug AND subscription_id = @subscription_id
        """
        select_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
            ],
            job_timeout_ms=30000  # 30 second timeout for user queries
        )
        result = bq_client.client.query(select_query, job_config=select_config).result()

        for row in result:
            updated_plan = SubscriptionPlan(
                org_slug=row.org_slug,
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.display_name if hasattr(row, "display_name") and row.display_name else None,
                category=row.category or "other",
                status=row.status if hasattr(row, "status") else "active",
                start_date=row.start_date if hasattr(row, "start_date") else None,
                end_date=row.end_date if hasattr(row, "end_date") else None,
                billing_cycle=row.billing_cycle or "monthly",
                currency=row.currency if hasattr(row, "currency") else DEFAULT_CURRENCY.value,
                seats=row.seats if hasattr(row, "seats") else 0,
                pricing_model=row.pricing_model if hasattr(row, "pricing_model") else "PER_SEAT",
                unit_price=float(row.unit_price or 0),
                yearly_price=float(row.yearly_price) if hasattr(row, "yearly_price") and row.yearly_price else None,
                discount_type=row.discount_type if hasattr(row, "discount_type") else None,
                discount_value=row.discount_value if hasattr(row, "discount_value") else None,
                auto_renew=row.auto_renew if hasattr(row, "auto_renew") else True,
                payment_method=row.payment_method if hasattr(row, "payment_method") else None,
                invoice_id_last=row.invoice_id_last if hasattr(row, "invoice_id_last") else None,
                owner_email=row.owner_email if hasattr(row, "owner_email") else None,
                department=row.department if hasattr(row, "department") else None,
                renewal_date=row.renewal_date if hasattr(row, "renewal_date") else None,
                contract_id=row.contract_id if hasattr(row, "contract_id") else None,
                notes=row.notes if hasattr(row, "notes") else None,
                source_currency=row.source_currency if hasattr(row, "source_currency") else None,
                source_price=float(row.source_price) if hasattr(row, "source_price") and row.source_price else None,
                exchange_rate_used=float(row.exchange_rate_used) if hasattr(row, "exchange_rate_used") and row.exchange_rate_used else None,
                hierarchy_dept_id=row.hierarchy_dept_id if hasattr(row, "hierarchy_dept_id") else None,
                hierarchy_dept_name=row.hierarchy_dept_name if hasattr(row, "hierarchy_dept_name") else None,
                hierarchy_project_id=row.hierarchy_project_id if hasattr(row, "hierarchy_project_id") else None,
                hierarchy_project_name=row.hierarchy_project_name if hasattr(row, "hierarchy_project_name") else None,
                hierarchy_team_id=row.hierarchy_team_id if hasattr(row, "hierarchy_team_id") else None,
                hierarchy_team_name=row.hierarchy_team_name if hasattr(row, "hierarchy_team_name") else None,
                updated_at=row.updated_at if hasattr(row, "updated_at") else None,
            )
            # Invalidate relevant caches after updating plan
            invalidate_provider_cache(org_slug, provider)
            invalidate_org_cache(org_slug)
            logger.debug(f"Invalidated cache for org {org_slug} provider {provider}")

            # Audit log: Plan updated (capture only changed fields)
            await log_update(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_SUBSCRIPTION_PLAN,
                resource_id=subscription_id,
                details={
                    "provider": provider,
                    "plan_name": updated_plan.plan_name,
                    "changed_fields": list(updates_dict.keys()),
                    "new_values": updates_dict
                }
            )

            return PlanResponse(
                success=True,
                plan=updated_plan,
                message=f"Updated plan {subscription_id}"
            )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan {subscription_id} not found"
        )
    except HTTPException as e:
        # ERR-005: Log before re-raising to preserve context
        logger.debug(f"Re-raising HTTP exception: {e.detail}")
        raise
    except Exception as e:
        # ERR-001: Broad catch for unexpected errors during plan update
        logger.error(f"Failed to update plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update plan. Please try again."
        )


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/plans/{subscription_id}/edit-version",
    response_model=EditVersionResponse,
    summary="Edit plan with version history",
    tags=["Subscriptions"]
)
async def edit_plan_with_version(
    org_slug: str,
    provider: str,
    subscription_id: str,
    request: EditVersionRequest,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Edit a plan by creating a new version with complete audit trail.

    ATOMICITY NOTE: This operation performs two separate BigQuery DML statements (UPDATE + INSERT).
    BigQuery scripting transactions (BEGIN/COMMIT) would be needed for true atomicity. Current
    implementation is acceptable because: (1) failure after UPDATE leaves plan in expired state
    which is detectable, (2) the subscription_id in response confirms successful completion.

    This endpoint implements version history for subscription plan changes:
    1. Closes the old row by setting end_date = effective_date - 1 and status = 'expired'
    2. Creates a new row with start_date = effective_date and the updated fields
    3. Returns both the old and new plans

    IMPORTANT - Cost Recalculation Behavior:
    ========================================

    Historical costs (before effective_date) are PRESERVED and will NOT change:
    - Cost calculations use the date ranges (start_date, end_date) from each plan version
    - For dates before effective_date, the old plan's pricing (old unit_price, old seats) applies
    - Example: If plan had 10 seats @ $5/seat from Jan 1 - Mar 15, those costs remain $50/day

    Future costs (on/after effective_date) use NEW pricing:
    - For dates >= effective_date, the new plan's pricing (new unit_price, new seats) applies
    - Example: After Mar 16, if seats change to 5 @ $10/seat, costs become $50/day (but different breakdown)

    How Cost Service Handles Version History:
    ------------------------------------------
    The cost aggregation logic (see cost_service.py) automatically handles this by:
    1. Querying saas_subscription_plans WHERE start_date <= cost_date AND (end_date IS NULL OR end_date >= cost_date)
    2. This ensures only the active version for each date range is used
    3. YTD/MTD calculations sum across all applicable versions
    4. Forecast uses ONLY the latest version (current pricing)

    Example Scenario:
    -----------------
    Plan: ChatGPT Team
    - Jan 1 - Mar 15: 10 seats @ $25/seat = $250/day
    - Mar 16 onwards: 5 seats @ $30/seat = $150/day

    Cost Calculations:
    - YTD (as of Mar 20): $250/day × 75 days + $150/day × 5 days = $19,500
    - MTD (March): $250/day × 15 days + $150/day × 5 days = $4,500
    - Forecast (rest of year): $150/day × remaining_days (uses current version only)

    Use this for subscription changes that need version history (e.g., price changes, seat changes).
    """
    from datetime import timedelta

    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)
    validate_subscription_id(subscription_id)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Step 1: Get current plan
    select_query = f"""
    SELECT
        org_slug, subscription_id, provider, plan_name, display_name,
        category, status, start_date, end_date, billing_cycle, currency,
        seats, pricing_model, unit_price, yearly_price,
        discount_type, discount_value, auto_renew, payment_method,
        invoice_id_last, owner_email, department, renewal_date,
        contract_id, notes, updated_at,
        source_currency, source_price, exchange_rate_used,
        hierarchy_dept_id, hierarchy_dept_name,
        hierarchy_project_id, hierarchy_project_name,
        hierarchy_team_id, hierarchy_team_name
    FROM `{table_ref}`
    WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ],
            job_timeout_ms=30000
        )
        result = bq_client.client.query(select_query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan {subscription_id} not found"
            )

        current_row = rows[0]

        # Validate effective_date is not before the original start_date
        # This prevents creating illogical date ranges where start_date > end_date
        original_start_date = current_row.start_date if hasattr(current_row, "start_date") else None
        if original_start_date and request.effective_date <= original_start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"effective_date ({request.effective_date}) must be after the plan's start_date ({original_start_date}). "
                       f"Use a date after {original_start_date} or delete and recreate the plan."
            )

        # EFFECTIVE_DATE VALIDATION FIX: Prevent retroactive changes more than 1 year in the past
        one_year_ago = date.today() - timedelta(days=365)
        if request.effective_date < one_year_ago:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"effective_date ({request.effective_date}) cannot be more than 1 year in the past. "
                       f"Minimum allowed date: {one_year_ago}"
            )

        # VALIDATION FIX: Validate enum fields if they are being changed
        if request.billing_cycle is not None:
            validate_enum_field(request.billing_cycle, VALID_BILLING_CYCLES, "billing_cycle")
        if request.pricing_model is not None:
            validate_enum_field(request.pricing_model, VALID_PRICING_MODELS, "pricing_model")

        # VALIDATION FIX: Validate status transition if status is being changed
        current_status = current_row.status if hasattr(current_row, "status") else "active"
        if request.status is not None and request.status != current_status:
            validate_status_transition(current_status, request.status)

        # VALIDATION FIX: Validate discount type and value consistency
        # Get the final discount values (merged with current values)
        final_discount_type = request.discount_type if request.discount_type is not None else (current_row.discount_type if hasattr(current_row, "discount_type") else None)
        final_discount_value = request.discount_value if request.discount_value is not None else (current_row.discount_value if hasattr(current_row, "discount_value") else None)
        validate_discount_fields(final_discount_type, final_discount_value)

        # OPTIMISTIC LOCKING: Store original updated_at for concurrency check
        original_updated_at = current_row.updated_at if hasattr(current_row, "updated_at") else None
        original_status = current_row.status if hasattr(current_row, "status") else "active"
        original_end_date = current_row.end_date if hasattr(current_row, "end_date") else None

        # Step 2: Close the old row (set end_date and status) with optimistic locking
        old_end_date = request.effective_date - timedelta(days=1)
        close_query = f"""
        UPDATE `{table_ref}`
        SET end_date = @end_date, status = 'expired', updated_at = CURRENT_TIMESTAMP()
        WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
        """
        # OPTIMISTIC LOCKING FIX: Add updated_at check to detect concurrent modifications
        if original_updated_at:
            close_query = f"""
            UPDATE `{table_ref}`
            SET end_date = @end_date, status = 'expired', updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
              AND (updated_at = @original_updated_at OR updated_at IS NULL)
            """
        close_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("end_date", "DATE", old_end_date),
                bigquery.ScalarQueryParameter("original_updated_at", "TIMESTAMP", original_updated_at),
            ],
            job_timeout_ms=60000  # Increased timeout for write operations
        )
        close_job = bq_client.client.query(close_query, job_config=close_config)
        close_job.result()

        # CONCURRENCY CHECK: Verify the update actually affected a row
        if original_updated_at and close_job.num_dml_affected_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Plan was modified by another request. Please refresh and try again."
            )

        # Step 3: Create new row with updates
        new_subscription_id = f"sub_{provider}_{current_row.plan_name.lower()}_{uuid.uuid4().hex[:12]}"

        # Determine new status: 'pending' if effective_date is in the future, 'active' otherwise
        new_status = "pending" if request.effective_date > date.today() else "active"

        # Merge current values with updates (updates take precedence)
        new_display_name = request.display_name if request.display_name is not None else (current_row.display_name or current_row.plan_name)
        new_unit_price = request.unit_price if request.unit_price is not None else float(current_row.unit_price or 0)
        new_billing_cycle = request.billing_cycle if request.billing_cycle is not None else (current_row.billing_cycle or "monthly")
        new_currency = request.currency if request.currency is not None else (current_row.currency if hasattr(current_row, "currency") else DEFAULT_CURRENCY.value)
        new_seats = request.seats if request.seats is not None else (current_row.seats if hasattr(current_row, "seats") else 0)
        new_pricing_model = request.pricing_model if request.pricing_model is not None else (current_row.pricing_model if hasattr(current_row, "pricing_model") else "PER_SEAT")
        new_yearly_price = request.yearly_price if request.yearly_price is not None else (float(current_row.yearly_price) if hasattr(current_row, "yearly_price") and current_row.yearly_price else None)
        new_discount_type = request.discount_type if request.discount_type is not None else (current_row.discount_type if hasattr(current_row, "discount_type") else None)
        new_discount_value = request.discount_value if request.discount_value is not None else (current_row.discount_value if hasattr(current_row, "discount_value") else None)
        new_auto_renew = request.auto_renew if request.auto_renew is not None else (current_row.auto_renew if hasattr(current_row, "auto_renew") else True)
        new_payment_method = request.payment_method if request.payment_method is not None else (current_row.payment_method if hasattr(current_row, "payment_method") else None)
        new_owner_email = request.owner_email if request.owner_email is not None else (current_row.owner_email if hasattr(current_row, "owner_email") else None)
        new_department = request.department if request.department is not None else (current_row.department if hasattr(current_row, "department") else None)
        new_renewal_date = request.renewal_date if request.renewal_date is not None else (current_row.renewal_date if hasattr(current_row, "renewal_date") else None)
        new_contract_id = request.contract_id if request.contract_id is not None else (current_row.contract_id if hasattr(current_row, "contract_id") else None)
        new_notes = request.notes if request.notes is not None else (current_row.notes if hasattr(current_row, "notes") else None)
        new_source_currency = request.source_currency if request.source_currency is not None else (current_row.source_currency if hasattr(current_row, "source_currency") else None)
        new_source_price = request.source_price if request.source_price is not None else (current_row.source_price if hasattr(current_row, "source_price") else None)
        new_exchange_rate_used = request.exchange_rate_used if request.exchange_rate_used is not None else (current_row.exchange_rate_used if hasattr(current_row, "exchange_rate_used") else None)
        # Hierarchy fields - carry over from current or use new values from request
        new_hierarchy_dept_id = request.hierarchy_dept_id if request.hierarchy_dept_id is not None else (current_row.hierarchy_dept_id if hasattr(current_row, "hierarchy_dept_id") else None)
        new_hierarchy_dept_name = request.hierarchy_dept_name if request.hierarchy_dept_name is not None else (current_row.hierarchy_dept_name if hasattr(current_row, "hierarchy_dept_name") else None)
        new_hierarchy_project_id = request.hierarchy_project_id if request.hierarchy_project_id is not None else (current_row.hierarchy_project_id if hasattr(current_row, "hierarchy_project_id") else None)
        new_hierarchy_project_name = request.hierarchy_project_name if request.hierarchy_project_name is not None else (current_row.hierarchy_project_name if hasattr(current_row, "hierarchy_project_name") else None)
        new_hierarchy_team_id = request.hierarchy_team_id if request.hierarchy_team_id is not None else (current_row.hierarchy_team_id if hasattr(current_row, "hierarchy_team_id") else None)
        new_hierarchy_team_name = request.hierarchy_team_name if request.hierarchy_team_name is not None else (current_row.hierarchy_team_name if hasattr(current_row, "hierarchy_team_name") else None)

        insert_query = f"""
        INSERT INTO `{table_ref}` (
            org_slug, subscription_id, provider, plan_name, display_name,
            category, status, start_date, billing_cycle, currency, seats,
            pricing_model, unit_price, yearly_price, discount_type,
            discount_value, auto_renew, payment_method, owner_email, department,
            renewal_date, contract_id, notes, source_currency, source_price,
            exchange_rate_used, hierarchy_dept_id, hierarchy_dept_name,
            hierarchy_project_id, hierarchy_project_name,
            hierarchy_team_id, hierarchy_team_name, updated_at
        ) VALUES (
            @org_slug, @subscription_id, @provider, @plan_name, @display_name,
            @category, @status, @start_date, @billing_cycle, @currency, @seats,
            @pricing_model, @unit_price, @yearly_price, @discount_type,
            @discount_value, @auto_renew, @payment_method, @owner_email, @department,
            @renewal_date, @contract_id, @notes, @source_currency, @source_price,
            @exchange_rate_used, @hierarchy_dept_id, @hierarchy_dept_name,
            @hierarchy_project_id, @hierarchy_project_name,
            @hierarchy_team_id, @hierarchy_team_name, CURRENT_TIMESTAMP()
        )
        """
        insert_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", new_subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("plan_name", "STRING", current_row.plan_name),
                bigquery.ScalarQueryParameter("display_name", "STRING", new_display_name),
                bigquery.ScalarQueryParameter("category", "STRING", current_row.category or "other"),
                bigquery.ScalarQueryParameter("status", "STRING", new_status),
                bigquery.ScalarQueryParameter("start_date", "DATE", request.effective_date),
                bigquery.ScalarQueryParameter("billing_cycle", "STRING", new_billing_cycle),
                bigquery.ScalarQueryParameter("currency", "STRING", new_currency),
                bigquery.ScalarQueryParameter("seats", "INT64", new_seats),
                bigquery.ScalarQueryParameter("pricing_model", "STRING", new_pricing_model),
                bigquery.ScalarQueryParameter("unit_price", "FLOAT64", new_unit_price),
                bigquery.ScalarQueryParameter("yearly_price", "FLOAT64", new_yearly_price),
                bigquery.ScalarQueryParameter("discount_type", "STRING", new_discount_type),
                bigquery.ScalarQueryParameter("discount_value", "INT64", new_discount_value),
                bigquery.ScalarQueryParameter("auto_renew", "BOOL", new_auto_renew),
                bigquery.ScalarQueryParameter("payment_method", "STRING", new_payment_method),
                bigquery.ScalarQueryParameter("owner_email", "STRING", new_owner_email),
                bigquery.ScalarQueryParameter("department", "STRING", new_department),
                bigquery.ScalarQueryParameter("renewal_date", "DATE", new_renewal_date),
                bigquery.ScalarQueryParameter("contract_id", "STRING", new_contract_id),
                bigquery.ScalarQueryParameter("notes", "STRING", new_notes),
                bigquery.ScalarQueryParameter("source_currency", "STRING", new_source_currency),
                bigquery.ScalarQueryParameter("source_price", "FLOAT64", new_source_price),
                bigquery.ScalarQueryParameter("exchange_rate_used", "FLOAT64", new_exchange_rate_used),
                bigquery.ScalarQueryParameter("hierarchy_dept_id", "STRING", new_hierarchy_dept_id),
                bigquery.ScalarQueryParameter("hierarchy_dept_name", "STRING", new_hierarchy_dept_name),
                bigquery.ScalarQueryParameter("hierarchy_project_id", "STRING", new_hierarchy_project_id),
                bigquery.ScalarQueryParameter("hierarchy_project_name", "STRING", new_hierarchy_project_name),
                bigquery.ScalarQueryParameter("hierarchy_team_id", "STRING", new_hierarchy_team_id),
                bigquery.ScalarQueryParameter("hierarchy_team_name", "STRING", new_hierarchy_team_name),
            ],
            job_timeout_ms=60000  # Increased timeout for write operations
        )

        # TRANSACTION COMPENSATION FIX: Wrap INSERT in try-except to rollback UPDATE on failure
        try:
            bq_client.client.query(insert_query, job_config=insert_config).result()
        except Exception as insert_error:
            # COMPENSATION: Re-open the old row if INSERT fails
            logger.error(f"INSERT failed after closing old row, attempting compensation: {insert_error}")
            try:
                compensation_query = f"""
                UPDATE `{table_ref}`
                SET end_date = @original_end_date, status = @original_status, updated_at = CURRENT_TIMESTAMP()
                WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
                """
                comp_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                        bigquery.ScalarQueryParameter("provider", "STRING", provider),
                        bigquery.ScalarQueryParameter("original_end_date", "DATE", original_end_date),
                        bigquery.ScalarQueryParameter("original_status", "STRING", original_status),
                    ],
                    job_timeout_ms=60000
                )
                bq_client.client.query(compensation_query, job_config=comp_config).result()
                logger.info(f"Successfully rolled back plan {subscription_id} to original state")
            except Exception as comp_error:
                logger.critical(f"CRITICAL: Failed to compensate after INSERT failure. "
                               f"Plan {subscription_id} may be in inconsistent state. "
                               f"Original error: {insert_error}, Compensation error: {comp_error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create plan version. Original plan has been restored. Error: {insert_error}"
            )

        # Build response objects
        old_plan = SubscriptionPlan(
            org_slug=current_row.org_slug,
            subscription_id=current_row.subscription_id,
            provider=current_row.provider,
            plan_name=current_row.plan_name,
            display_name=current_row.display_name if hasattr(current_row, "display_name") else None,
            category=current_row.category or "other",
            status="expired",
            start_date=current_row.start_date if hasattr(current_row, "start_date") else None,
            end_date=old_end_date,
            billing_cycle=current_row.billing_cycle or "monthly",
            currency=current_row.currency if hasattr(current_row, "currency") else DEFAULT_CURRENCY.value,
            seats=current_row.seats if hasattr(current_row, "seats") else 0,
            pricing_model=current_row.pricing_model if hasattr(current_row, "pricing_model") else "PER_SEAT",
            unit_price=float(current_row.unit_price or 0),
            yearly_price=float(current_row.yearly_price) if hasattr(current_row, "yearly_price") and current_row.yearly_price else None,
            discount_type=current_row.discount_type if hasattr(current_row, "discount_type") else None,
            discount_value=current_row.discount_value if hasattr(current_row, "discount_value") else None,
            auto_renew=current_row.auto_renew if hasattr(current_row, "auto_renew") else True,
            payment_method=current_row.payment_method if hasattr(current_row, "payment_method") else None,
            owner_email=current_row.owner_email if hasattr(current_row, "owner_email") else None,
            department=current_row.department if hasattr(current_row, "department") else None,
            renewal_date=current_row.renewal_date if hasattr(current_row, "renewal_date") else None,
            contract_id=current_row.contract_id if hasattr(current_row, "contract_id") else None,
            notes=current_row.notes if hasattr(current_row, "notes") else None,
            source_currency=current_row.source_currency if hasattr(current_row, "source_currency") else None,
            source_price=float(current_row.source_price) if hasattr(current_row, "source_price") and current_row.source_price else None,
            exchange_rate_used=float(current_row.exchange_rate_used) if hasattr(current_row, "exchange_rate_used") and current_row.exchange_rate_used else None,
            hierarchy_dept_id=current_row.hierarchy_dept_id if hasattr(current_row, "hierarchy_dept_id") else None,
            hierarchy_dept_name=current_row.hierarchy_dept_name if hasattr(current_row, "hierarchy_dept_name") else None,
            hierarchy_project_id=current_row.hierarchy_project_id if hasattr(current_row, "hierarchy_project_id") else None,
            hierarchy_project_name=current_row.hierarchy_project_name if hasattr(current_row, "hierarchy_project_name") else None,
            hierarchy_team_id=current_row.hierarchy_team_id if hasattr(current_row, "hierarchy_team_id") else None,
            hierarchy_team_name=current_row.hierarchy_team_name if hasattr(current_row, "hierarchy_team_name") else None,
        )

        new_plan = SubscriptionPlan(
            org_slug=org_slug,
            subscription_id=new_subscription_id,
            provider=provider,
            plan_name=current_row.plan_name,
            display_name=new_display_name,
            category=current_row.category or "other",
            status=new_status,
            start_date=request.effective_date,
            billing_cycle=new_billing_cycle,
            currency=new_currency,
            seats=new_seats,
            pricing_model=new_pricing_model,
            unit_price=new_unit_price,
            yearly_price=new_yearly_price,
            discount_type=new_discount_type,
            discount_value=new_discount_value,
            auto_renew=new_auto_renew,
            payment_method=new_payment_method,
            owner_email=new_owner_email,
            department=new_department,
            renewal_date=new_renewal_date,
            contract_id=new_contract_id,
            notes=new_notes,
            source_currency=new_source_currency,
            source_price=new_source_price,
            exchange_rate_used=new_exchange_rate_used,
            hierarchy_dept_id=new_hierarchy_dept_id,
            hierarchy_dept_name=new_hierarchy_dept_name,
            hierarchy_project_id=new_hierarchy_project_id,
            hierarchy_project_name=new_hierarchy_project_name,
            hierarchy_team_id=new_hierarchy_team_id,
            hierarchy_team_name=new_hierarchy_team_name,
        )

        # Invalidate caches
        invalidate_provider_cache(org_slug, provider)
        invalidate_org_cache(org_slug)
        logger.debug(f"Invalidated cache for org {org_slug} provider {provider}")

        # Audit log: Plan version created (this creates audit trail for price changes)
        # IMPORTANT: This logs both old and new values to track version history
        await log_update(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_SUBSCRIPTION_PLAN,
            resource_id=new_subscription_id,
            details={
                "action": "version_created",
                "provider": provider,
                "plan_name": current_row.plan_name,
                "old_subscription_id": subscription_id,
                "new_subscription_id": new_subscription_id,
                "effective_date": str(request.effective_date),
                "old_values": {
                    "subscription_id": subscription_id,
                    "unit_price": float(current_row.unit_price or 0),
                    "seats": current_row.seats if hasattr(current_row, "seats") else 0,
                    "status": current_row.status if hasattr(current_row, "status") else "active",
                    "end_date": str(old_end_date)
                },
                "new_values": {
                    "subscription_id": new_subscription_id,
                    "unit_price": new_unit_price,
                    "seats": new_seats,
                    "status": new_status,
                    "start_date": str(request.effective_date)
                },
                "changed_fields": [k for k in request.model_dump(exclude_unset=True).keys() if k != "effective_date"]
            }
        )

        return EditVersionResponse(
            success=True,
            new_plan=new_plan,
            old_plan=old_plan,
            message=f"Created new version of plan {current_row.plan_name} effective {request.effective_date}"
        )

    except HTTPException as e:
        # ERR-005: Log before re-raising to preserve context
        logger.debug(f"Re-raising HTTP exception: {e.detail}")
        raise
    except Exception as e:
        # ERR-001: Broad catch for unexpected errors during version creation
        logger.error(f"Failed to create plan version: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create plan version. Please try again."
        )


@router.delete(
    "/subscriptions/{org_slug}/providers/{provider}/plans/{subscription_id}",
    response_model=DeletePlanResponse,
    summary="Delete plan (soft delete)",
    tags=["Subscriptions"]
)
async def delete_plan(
    org_slug: str,
    provider: str,
    subscription_id: str,
    end_date: Optional[date] = Query(None, description="Custom end date (defaults to today)"),
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Delete a subscription plan (soft delete).

    Sets end_date (default: today, or custom date if provided) and status to 'cancelled'.
    Historical data is preserved for cost calculations.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)
    validate_subscription_id(subscription_id)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Use custom end_date if provided, otherwise use CURRENT_DATE()
    end_date_value = end_date if end_date is not None else date.today()

    # Soft delete: set end_date and status instead of removing rows
    update_query = f"""
    UPDATE `{table_ref}`
    SET end_date = @end_date, status = 'cancelled', updated_at = CURRENT_TIMESTAMP()
    WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("end_date", "DATE", end_date_value),
            ],
            job_timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(update_query, job_config=job_config).result()

        # Invalidate relevant caches after soft-deleting plan
        invalidate_provider_cache(org_slug, provider)
        invalidate_org_cache(org_slug)
        logger.debug(f"Invalidated cache for org {org_slug} provider {provider}")

        # Audit log: Plan soft deleted (status changed to 'cancelled', end_date set)
        await log_delete(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_SUBSCRIPTION_PLAN,
            resource_id=subscription_id,
            details={
                "provider": provider,
                "end_date": str(end_date_value),
                "status": "cancelled",
                "soft_delete": True
            }
        )

        return DeletePlanResponse(
            success=True,
            subscription_id=subscription_id,
            message=f"Ended subscription {subscription_id}"
        )
    except HTTPException as e:
        # ERR-005: Log before re-raising to preserve context
        logger.debug(f"Re-raising HTTP exception: {e.detail}")
        raise
    except Exception as e:
        # ERR-001: Broad catch for unexpected errors during subscription end
        # ERR-004: Audit logging above is best-effort and doesn't block main operation
        logger.error(f"Failed to delete plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to end subscription. Please try again."
        )


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/reset",
    response_model=EnableProviderResponse,
    summary="Reset provider to defaults",
    tags=["Subscriptions"]
)
async def reset_provider(
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Reset provider plans to defaults.

    Deletes all existing plans and re-seeds from CSV.
    Use with caution - this will delete custom plans.
    """
    return await enable_provider(
        org_slug=org_slug,
        provider=provider,
        force=True,
        org=org,
        bq_client=bq_client
    )


# ============================================
# Toggle Endpoint
# ============================================

class ToggleResponse(BaseModel):
    """Response for toggle endpoint."""
    success: bool
    subscription_id: str
    status: str
    message: str


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/toggle/{subscription_id}",
    response_model=ToggleResponse,
    summary="Toggle plan active/cancelled",
    tags=["Subscriptions"]
)
async def toggle_plan(
    org_slug: str,
    provider: str,
    subscription_id: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Toggle a plan's status between active and cancelled.

    Returns the new status.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Get current state
    check_query = f"""
    SELECT status FROM `{table_ref}`
    WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan {subscription_id} not found"
            )

        current_status = rows[0].status
        new_status = "cancelled" if current_status == "active" else "active"

        # STATUS TRANSITION FIX: Validate transition is allowed by state machine
        # e.g., can't toggle from 'expired' to 'active' or from 'cancelled' to 'active'
        validate_status_transition(current_status, new_status)

        # Update state
        update_query = f"""
        UPDATE `{table_ref}`
        SET status = @new_status, updated_at = CURRENT_TIMESTAMP()
        WHERE org_slug = @org_slug AND subscription_id = @subscription_id AND provider = @provider
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("new_status", "STRING", new_status),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ],
            job_timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(update_query, job_config=job_config).result()

        # Invalidate relevant caches after toggling plan
        invalidate_provider_cache(org_slug, provider)
        invalidate_org_cache(org_slug)
        logger.debug(f"Invalidated cache for org {org_slug} provider {provider}")

        return ToggleResponse(
            success=True,
            subscription_id=subscription_id,
            status=new_status,
            message=f"Plan {subscription_id} status changed to {new_status}"
        )
    except HTTPException as e:
        # ERR-005: Log before re-raising to preserve context
        logger.debug(f"Re-raising HTTP exception: {e.detail}")
        raise
    except Exception as e:
        # ERR-001: Broad catch for unexpected errors during plan toggle
        logger.error(f"Failed to toggle plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to toggle plan. Please try again."
        )


# ============================================
# All Plans Endpoint (for Costs Dashboard)
# ============================================

class PaginationInfo(BaseModel):
    """Pagination metadata for paginated responses."""
    page: int
    page_size: int
    total_count: int
    total_pages: int
    has_next: bool
    has_previous: bool


class AllPlansResponse(BaseModel):
    """Response for all plans endpoint."""
    success: bool
    plans: List[SubscriptionPlan]
    summary: Dict[str, Any]
    pagination: Optional[PaginationInfo] = None
    message: Optional[str] = None


@router.get(
    "/subscriptions/{org_slug}/all-plans",
    response_model=AllPlansResponse,
    summary="Get all plans across all providers",
    tags=["Subscriptions"]
)
async def get_all_plans(
    org_slug: str,
    enabled_only: bool = False,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(100, ge=1, le=500, description="Number of items per page"),
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get all subscription plans across all providers for the costs dashboard.

    This endpoint reduces N+1 queries by fetching all plans in one call.

    Performance: This endpoint is cached for 5 minutes to improve response time.
    Cache is invalidated when plans are created, updated, or deleted.

    Scaling Notes:
    - SCALE-002: BigQuery client handles result streaming automatically, no memory leak risk
    - SCALE-003: Cache eviction is handled by TTL (CACHE_TTL_SECONDS)
    - SCALE-004: FastAPI handles concurrency via async; BigQuery client is thread-safe
    - SCALE-005: Circuit breaker pattern should be handled at infrastructure level (Cloud Run/K8s)
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)

    # Check cache first (includes pagination params for cache key uniqueness)
    cache = get_cache()
    cache_key = f"all_plans_{org_slug}_{enabled_only}_p{page}_ps{page_size}"
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        logger.debug(f"Cache HIT: all plans for {org_slug}")
        return cached_result

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Query all plans with optimizations - ALWAYS filter by org_slug for multi-tenant isolation
    where_clause = "WHERE org_slug = @org_slug"
    if enabled_only:
        where_clause += " AND status IN ('active', 'pending')"

    # SCALE-001: Calculate pagination offset
    offset = (page - 1) * page_size

    # Count query for pagination metadata
    count_query = f"""
    SELECT COUNT(*) as total_count
    FROM `{table_ref}`
    {where_clause}
    """

    # Main query with pagination (SCALE-001)
    query = f"""
    SELECT
        org_slug, subscription_id, provider, plan_name, display_name,
        category, status, start_date, end_date, billing_cycle, currency,
        seats, pricing_model, unit_price, yearly_price,
        discount_type, discount_value, auto_renew, payment_method,
        invoice_id_last, owner_email, department, renewal_date,
        contract_id, notes, updated_at,
        source_currency, source_price, exchange_rate_used,
        hierarchy_dept_id, hierarchy_dept_name,
        hierarchy_project_id, hierarchy_project_name,
        hierarchy_team_id, hierarchy_team_name
    FROM `{table_ref}`
    {where_clause}
    ORDER BY provider, plan_name
    LIMIT {page_size}
    OFFSET {offset}
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            ],
            job_timeout_ms=30000  # 30 second timeout for user queries
        )

        # Execute count query first for pagination metadata
        count_result = bq_client.client.query(count_query, job_config=job_config).result()
        total_count = 0
        for row in count_result:
            total_count = row.total_count
            break

        # Execute main query with pagination
        with QueryPerformanceMonitor(operation="get_all_plans_query", org_slug=org_slug) as monitor:
            result = bq_client.client.query(query, job_config=job_config).result()
            monitor.set_result(result)

        # EDGE-001: Empty result is valid - provider may have no plans configured yet
        plans = []
        total_monthly_cost = 0.0
        count_by_category: Dict[str, int] = {}
        enabled_count = 0  # Count of active plans (matching frontend expected field name)

        for row in result:
            plan = SubscriptionPlan(
                org_slug=row.org_slug,
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.display_name if hasattr(row, "display_name") and row.display_name else None,
                category=row.category or "other",
                status=row.status if hasattr(row, "status") else "active",
                start_date=row.start_date if hasattr(row, "start_date") else None,
                end_date=row.end_date if hasattr(row, "end_date") else None,
                billing_cycle=row.billing_cycle or "monthly",
                currency=row.currency if hasattr(row, "currency") else DEFAULT_CURRENCY.value,
                seats=row.seats if hasattr(row, "seats") else 0,
                pricing_model=row.pricing_model if hasattr(row, "pricing_model") else "PER_SEAT",
                unit_price=float(row.unit_price or 0),
                yearly_price=float(row.yearly_price) if hasattr(row, "yearly_price") and row.yearly_price else None,
                discount_type=row.discount_type if hasattr(row, "discount_type") else None,
                discount_value=row.discount_value if hasattr(row, "discount_value") else None,
                auto_renew=row.auto_renew if hasattr(row, "auto_renew") else True,
                payment_method=row.payment_method if hasattr(row, "payment_method") else None,
                invoice_id_last=row.invoice_id_last if hasattr(row, "invoice_id_last") else None,
                owner_email=row.owner_email if hasattr(row, "owner_email") else None,
                department=row.department if hasattr(row, "department") else None,
                renewal_date=row.renewal_date if hasattr(row, "renewal_date") else None,
                contract_id=row.contract_id if hasattr(row, "contract_id") else None,
                notes=row.notes if hasattr(row, "notes") else None,
                source_currency=row.source_currency if hasattr(row, "source_currency") else None,
                source_price=float(row.source_price) if hasattr(row, "source_price") and row.source_price else None,
                exchange_rate_used=float(row.exchange_rate_used) if hasattr(row, "exchange_rate_used") and row.exchange_rate_used else None,
                hierarchy_dept_id=row.hierarchy_dept_id if hasattr(row, "hierarchy_dept_id") else None,
                hierarchy_dept_name=row.hierarchy_dept_name if hasattr(row, "hierarchy_dept_name") else None,
                hierarchy_project_id=row.hierarchy_project_id if hasattr(row, "hierarchy_project_id") else None,
                hierarchy_project_name=row.hierarchy_project_name if hasattr(row, "hierarchy_project_name") else None,
                hierarchy_team_id=row.hierarchy_team_id if hasattr(row, "hierarchy_team_id") else None,
                hierarchy_team_name=row.hierarchy_team_name if hasattr(row, "hierarchy_team_name") else None,
                updated_at=row.updated_at if hasattr(row, "updated_at") else None,
            )
            plans.append(plan)

            # Aggregate for summary - calculate monthly cost with billing cycle adjustment
            if plan.status == "active":
                enabled_count += 1
                monthly_cost = plan.unit_price * (plan.seats if plan.pricing_model == "PER_SEAT" else 1)
                # Adjust for billing cycle (unit_price is per cycle, not per month)
                if plan.billing_cycle == "annual":
                    monthly_cost = monthly_cost / 12
                elif plan.billing_cycle == "quarterly":
                    monthly_cost = monthly_cost / 3
                total_monthly_cost += monthly_cost

            cat = plan.category or "other"
            count_by_category[cat] = count_by_category.get(cat, 0) + 1

        # Calculate pagination metadata
        total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
        pagination = PaginationInfo(
            page=page,
            page_size=page_size,
            total_count=total_count,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1
        )

        summary = {
            "total_monthly_cost": round(total_monthly_cost, 2),
            "total_annual_cost": round(total_monthly_cost * 12, 2),
            "count_by_category": count_by_category,
            "enabled_count": enabled_count,  # Frontend expects 'enabled_count' field name
            "total_count": total_count,  # Use total_count from DB for accurate pagination
        }

        response = AllPlansResponse(
            success=True,
            plans=plans,
            summary=summary,
            pagination=pagination,
            message=f"Found {len(plans)} plans (page {page} of {total_pages})"
        )

        # Cache the result
        cache.set(cache_key, response, ttl_seconds=CACHE_TTL_SECONDS)
        logger.debug(f"Cache SET: all plans for {org_slug}")

        return response
    except Exception as e:
        # ERR-001: Broad catch for unexpected errors when fetching all plans
        logger.error(f"Failed to get all plans: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get all plans. Please try again."
        )
