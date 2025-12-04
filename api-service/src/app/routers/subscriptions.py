"""
SaaS Subscription Provider Management API Routes

Endpoints for managing subscription providers and their plans.
Providers are fixed-cost SaaS subscriptions (Canva, ChatGPT Plus, Slack, etc.)
NOT LLM API tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - those are in llm_data.py)

URL Structure: /api/v1/subscriptions/{org_slug}/providers/...
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

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.dependencies.auth import get_current_org
from src.app.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

# ============================================
# Constants
# ============================================

# Table name for SaaS subscriptions
SAAS_SUBSCRIPTIONS_TABLE = "saas_subscriptions"

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
    message: str


class SubscriptionPlan(BaseModel):
    """A subscription plan."""
    subscription_id: str
    provider: str
    plan_name: str
    display_name: Optional[str] = None
    is_custom: bool = False
    quantity: int = 1
    unit_price_usd: float = 0.0
    effective_date: Optional[date] = None
    end_date: Optional[date] = None
    is_enabled: bool = True
    billing_period: str = "monthly"
    category: str = "other"
    notes: Optional[str] = None
    daily_limit: Optional[int] = None
    monthly_limit: Optional[int] = None
    storage_limit_gb: Optional[float] = None
    yearly_price_usd: Optional[float] = None
    yearly_discount_pct: Optional[float] = None
    seats: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PlanListResponse(BaseModel):
    """Response for listing plans."""
    plans: List[SubscriptionPlan]
    total: int
    total_monthly_cost: float


class PlanCreate(BaseModel):
    """Request to create a custom plan."""
    plan_name: str = Field(..., min_length=1, max_length=50, description="Plan identifier (e.g., 'PRO', 'TEAM')")
    display_name: Optional[str] = Field(None, max_length=200, description="Human-readable name")
    quantity: int = Field(1, ge=0, description="Number of seats/units")
    unit_price_usd: float = Field(..., ge=0, le=10000, description="Monthly price per unit")
    billing_period: str = Field("monthly", description="monthly, quarterly, yearly")
    notes: Optional[str] = Field(None, max_length=1000, description="Plan description or limits")
    daily_limit: Optional[int] = Field(None, ge=0, description="Daily usage limit")
    monthly_limit: Optional[int] = Field(None, ge=0, description="Monthly usage limit")
    yearly_price_usd: Optional[float] = Field(None, ge=0, description="Annual price (if different from monthly × 12)")
    yearly_discount_pct: Optional[float] = Field(None, ge=0, le=100, description="Annual discount percentage")
    seats: int = Field(1, ge=1, description="Default number of seats")

    model_config = ConfigDict(extra="forbid")


class PlanUpdate(BaseModel):
    """Request to update a plan."""
    display_name: Optional[str] = Field(None, max_length=200)
    quantity: Optional[int] = Field(None, ge=0)
    unit_price_usd: Optional[float] = Field(None, ge=0, le=10000)
    is_enabled: Optional[bool] = None
    billing_period: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)
    daily_limit: Optional[int] = Field(None, ge=0)
    monthly_limit: Optional[int] = Field(None, ge=0)
    yearly_price_usd: Optional[float] = Field(None, ge=0)
    yearly_discount_pct: Optional[float] = Field(None, ge=0, le=100)
    seats: Optional[int] = Field(None, ge=1)

    model_config = ConfigDict(extra="forbid")


class PlanResponse(BaseModel):
    """Response after creating/updating a plan."""
    success: bool
    plan: SubscriptionPlan
    message: str


class DeletePlanResponse(BaseModel):
    """Response after deleting a plan."""
    success: bool
    subscription_id: str
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


def validate_provider(provider: str) -> str:
    """Validate provider is a supported SaaS provider."""
    provider_lower = provider.lower()
    if not is_saas_provider(provider_lower):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}. For LLM API tiers, use /integrations endpoints."
        )
    return provider_lower


def validate_plan_name(plan_name: str) -> None:
    """Validate plan_name format."""
    if not plan_name or not re.match(r'^[a-zA-Z0-9_]{1,50}$', plan_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan_name format. Must be 1-50 alphanumeric characters with underscores."
        )


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


# ============================================
# Seed Data Loading
# ============================================

def load_seed_data_for_provider(provider: str) -> List[Dict[str, Any]]:
    """Load seed data for a specific provider from CSV."""
    seed_path = Path(__file__).parent.parent.parent.parent / "configs" / "saas" / "seed" / "data" / "default_subscriptions.csv"

    if not seed_path.exists():
        logger.warning(f"Seed data file not found: {seed_path}")
        return []

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
            if row_provider == provider.lower():
                plans.append(row)

    return plans


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
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)

    dataset_id = get_org_dataset(org_slug)

    # Get plan counts per provider from BigQuery
    query = f"""
    SELECT
        provider,
        COUNT(*) as plan_count,
        MAX(is_enabled) as has_enabled
    FROM `{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTIONS_TABLE}`
    WHERE category != 'llm_api'
    GROUP BY provider
    """

    enabled_providers = {}
    try:
        result = bq_client.client.query(query).result()
        for row in result:
            enabled_providers[row.provider.lower()] = {
                "plan_count": row.plan_count,
                "is_enabled": row.has_enabled
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

    return ProviderListResponse(providers=providers, total=len(providers))


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/enable",
    response_model=EnableProviderResponse,
    summary="Enable provider and seed default plans",
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
    Enable a subscription provider and seed default plans.

    - Checks if provider already has plans (skips seeding unless force=True)
    - Loads default plans from seed CSV
    - Inserts plans into BigQuery
    - Returns number of plans seeded
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTIONS_TABLE}"

    # Check if plans already exist
    if not force:
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{table_ref}`
        WHERE provider = '{provider}'
        """
        try:
            result = bq_client.client.query(check_query).result()
            for row in result:
                if row.count > 0:
                    return EnableProviderResponse(
                        success=True,
                        provider=provider,
                        plans_seeded=0,
                        message=f"Provider {provider} already has {row.count} plans. Use force=true to re-seed."
                    )
        except Exception as e:
            logger.debug(f"Could not check existing plans: {e}")

    # Load seed data
    seed_data = load_seed_data_for_provider(provider)
    if not seed_data:
        return EnableProviderResponse(
            success=True,
            provider=provider,
            plans_seeded=0,
            message=f"No seed data found for provider {provider}. Add plans manually."
        )

    # If force, delete existing plans first
    if force:
        delete_query = f"""
        DELETE FROM `{table_ref}`
        WHERE provider = '{provider}'
        """
        try:
            bq_client.client.query(delete_query).result()
            logger.info(f"Deleted existing plans for {provider} in {org_slug}")
        except Exception as e:
            logger.warning(f"Could not delete existing plans: {e}")

    # Insert seed data
    rows_inserted = 0
    for plan in seed_data:
        try:
            # Generate new subscription ID
            subscription_id = f"sub_{provider}_{plan.get('plan_name', 'unknown').lower()}_{uuid.uuid4().hex[:8]}"

            # Parse values safely
            quantity = int(plan.get("quantity", 1)) if plan.get("quantity") else 1
            unit_price = float(plan.get("unit_price_usd", 0)) if plan.get("unit_price_usd") else 0.0
            seats = int(plan.get("seats", 1)) if plan.get("seats") else 1

            insert_query = f"""
            INSERT INTO `{table_ref}` (
                subscription_id, provider, plan_name, display_name, is_custom,
                quantity, unit_price_usd, effective_date, is_enabled,
                billing_period, category, notes, seats
            ) VALUES (
                '{subscription_id}',
                '{provider}',
                '{plan.get("plan_name", "DEFAULT")}',
                '{plan.get("notes", "").replace("'", "''")}',
                false,
                {quantity},
                {unit_price},
                CURRENT_DATE(),
                true,
                '{plan.get("billing_period", "monthly")}',
                '{plan.get("category", "other")}',
                '{plan.get("notes", "").replace("'", "''")}',
                {seats}
            )
            """
            bq_client.client.query(insert_query).result()
            rows_inserted += 1
        except Exception as e:
            logger.error(f"Failed to insert plan {plan.get('plan_name')}: {e}")

    return EnableProviderResponse(
        success=True,
        provider=provider,
        plans_seeded=rows_inserted,
        message=f"Enabled {provider} with {rows_inserted} default plans"
    )


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/disable",
    response_model=DisableProviderResponse,
    summary="Disable provider (soft delete)",
    tags=["Subscriptions"]
)
async def disable_provider(
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Disable a subscription provider.

    Soft disables by setting is_enabled=false on all plans.
    Plans are not deleted - can be re-enabled later.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTIONS_TABLE}"

    update_query = f"""
    UPDATE `{table_ref}`
    SET is_enabled = false, updated_at = CURRENT_TIMESTAMP()
    WHERE provider = '{provider}'
    """

    try:
        bq_client.client.query(update_query).result()
        return DisableProviderResponse(
            success=True,
            provider=provider,
            message=f"Disabled all plans for {provider}"
        )
    except Exception as e:
        logger.error(f"Failed to disable provider {provider}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disable provider: {e}"
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
    List all subscription plans for a provider.

    Returns both seeded and custom plans from BigQuery.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTIONS_TABLE}"

    where_clause = f"WHERE provider = '{provider}'"
    if not include_disabled:
        where_clause += " AND is_enabled = true"

    query = f"""
    SELECT *
    FROM `{table_ref}`
    {where_clause}
    ORDER BY is_custom, plan_name
    """

    plans = []
    total_monthly_cost = 0.0

    try:
        result = bq_client.client.query(query).result()
        for row in result:
            plan = SubscriptionPlan(
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.get("display_name") or row.get("notes"),
                is_custom=row.is_custom if hasattr(row, "is_custom") else False,
                quantity=row.quantity or 1,
                unit_price_usd=float(row.unit_price_usd or 0),
                effective_date=row.effective_date if hasattr(row, "effective_date") else None,
                end_date=row.end_date if hasattr(row, "end_date") else None,
                is_enabled=row.is_enabled if hasattr(row, "is_enabled") else True,
                billing_period=row.billing_period or "monthly",
                category=row.category or "other",
                notes=row.notes if hasattr(row, "notes") else None,
                daily_limit=row.daily_limit if hasattr(row, "daily_limit") else None,
                monthly_limit=row.monthly_limit if hasattr(row, "monthly_limit") else None,
                seats=row.seats if hasattr(row, "seats") else 1,
            )
            plans.append(plan)

            # Calculate monthly cost for enabled plans
            if plan.is_enabled:
                monthly_cost = plan.unit_price_usd * plan.quantity
                if plan.billing_period == "yearly":
                    monthly_cost = monthly_cost / 12
                elif plan.billing_period == "quarterly":
                    monthly_cost = monthly_cost / 3
                total_monthly_cost += monthly_cost
    except Exception as e:
        logger.error(f"Failed to list plans: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list plans: {e}"
        )

    return PlanListResponse(
        plans=plans,
        total=len(plans),
        total_monthly_cost=round(total_monthly_cost, 2)
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
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Create a custom subscription plan.

    Custom plans are marked with is_custom=true.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)
    validate_plan_name(plan.plan_name)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTIONS_TABLE}"

    subscription_id = f"sub_{provider}_{plan.plan_name.lower()}_{uuid.uuid4().hex[:8]}"
    category = get_provider_category(provider).value  # Get enum value

    insert_query = f"""
    INSERT INTO `{table_ref}` (
        subscription_id, provider, plan_name, display_name, is_custom,
        quantity, unit_price_usd, effective_date, is_enabled,
        billing_period, category, notes, daily_limit, monthly_limit,
        yearly_price_usd, yearly_discount_percentage, seats
    ) VALUES (
        '{subscription_id}',
        '{provider}',
        '{plan.plan_name.upper()}',
        '{(plan.display_name or plan.plan_name).replace("'", "''")}',
        true,
        {plan.quantity},
        {plan.unit_price_usd},
        CURRENT_DATE(),
        true,
        '{plan.billing_period}',
        '{category}',
        '{(plan.notes or "").replace("'", "''")}',
        {plan.daily_limit or 'NULL'},
        {plan.monthly_limit or 'NULL'},
        {plan.yearly_price_usd or 'NULL'},
        {plan.yearly_discount_pct or 'NULL'},
        {plan.seats}
    )
    """

    try:
        bq_client.client.query(insert_query).result()

        created_plan = SubscriptionPlan(
            subscription_id=subscription_id,
            provider=provider,
            plan_name=plan.plan_name.upper(),
            display_name=plan.display_name or plan.plan_name,
            is_custom=True,
            quantity=plan.quantity,
            unit_price_usd=plan.unit_price_usd,
            is_enabled=True,
            billing_period=plan.billing_period,
            category=category,
            notes=plan.notes,
            daily_limit=plan.daily_limit,
            monthly_limit=plan.monthly_limit,
            yearly_price_usd=plan.yearly_price_usd,
            yearly_discount_pct=plan.yearly_discount_pct,
            seats=plan.seats,
        )

        return PlanResponse(
            success=True,
            plan=created_plan,
            message=f"Created custom plan {plan.plan_name} for {provider}"
        )
    except Exception as e:
        logger.error(f"Failed to create plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create plan: {e}"
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

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTIONS_TABLE}"

    # Build SET clause from provided updates
    set_parts = ["updated_at = CURRENT_TIMESTAMP()"]
    updates_dict = updates.model_dump(exclude_unset=True)

    for field, value in updates_dict.items():
        if value is not None:
            if isinstance(value, str):
                set_parts.append(f"{field} = '{value.replace(chr(39), chr(39)+chr(39))}'")
            elif isinstance(value, bool):
                set_parts.append(f"{field} = {str(value).lower()}")
            else:
                set_parts.append(f"{field} = {value}")

    if len(set_parts) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    update_query = f"""
    UPDATE `{table_ref}`
    SET {', '.join(set_parts)}
    WHERE subscription_id = '{subscription_id}' AND provider = '{provider}'
    """

    try:
        bq_client.client.query(update_query).result()

        # Fetch updated plan
        select_query = f"""
        SELECT * FROM `{table_ref}`
        WHERE subscription_id = '{subscription_id}'
        """
        result = bq_client.client.query(select_query).result()

        for row in result:
            updated_plan = SubscriptionPlan(
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.get("display_name"),
                is_custom=row.is_custom if hasattr(row, "is_custom") else False,
                quantity=row.quantity or 1,
                unit_price_usd=float(row.unit_price_usd or 0),
                is_enabled=row.is_enabled if hasattr(row, "is_enabled") else True,
                billing_period=row.billing_period or "monthly",
                category=row.category or "other",
                notes=row.notes if hasattr(row, "notes") else None,
                seats=row.seats if hasattr(row, "seats") else 1,
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update plan: {e}"
        )


@router.delete(
    "/subscriptions/{org_slug}/providers/{provider}/plans/{subscription_id}",
    response_model=DeletePlanResponse,
    summary="Delete plan",
    tags=["Subscriptions"]
)
async def delete_plan(
    org_slug: str,
    provider: str,
    subscription_id: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Delete a subscription plan.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTIONS_TABLE}"

    delete_query = f"""
    DELETE FROM `{table_ref}`
    WHERE subscription_id = '{subscription_id}' AND provider = '{provider}'
    """

    try:
        bq_client.client.query(delete_query).result()
        return DeletePlanResponse(
            success=True,
            subscription_id=subscription_id,
            message=f"Deleted plan {subscription_id}"
        )
    except Exception as e:
        logger.error(f"Failed to delete plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete plan: {e}"
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
