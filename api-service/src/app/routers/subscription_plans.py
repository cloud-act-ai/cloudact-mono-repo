"""
SaaS Subscription Plans Management API Routes

Endpoints for managing SaaS subscription plans across multiple providers.
This handles FIXED-COST subscription plans for each provider (Canva, ChatGPT Plus, Slack, etc.)
NOT LLM API usage tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - those are in llm_data.py)

URL Structure: /api/v1/subscriptions/{org_slug}/providers/...

Each provider can have multiple plans (FREE, PRO, ENTERPRISE, etc.) with different:
- Pricing (unit_price_usd, billing_period)
- Limits (daily_limit, monthly_limit, storage_limit_gb)
- Seats and quantities
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
    storage_limit_gb: Optional[float] = Field(None, ge=0, description="Storage limit in GB")
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
    storage_limit_gb: Optional[float] = Field(None, ge=0)
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


def validate_provider(provider: str, allow_custom: bool = True) -> str:
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
    seed_path = Path(__file__).parent.parent.parent.parent / "configs" / "saas" / "seed" / "data" / "saas_subscription_plans.csv"

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
    FROM `{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}`
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
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Check if plans already exist
    if not force:
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{table_ref}`
        WHERE provider = @provider
        """
        try:
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("provider", "STRING", provider),
                ]
            )
            result = bq_client.client.query(check_query, job_config=job_config).result()
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
        WHERE provider = @provider
        """
        try:
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("provider", "STRING", provider),
                ]
            )
            bq_client.client.query(delete_query, job_config=job_config).result()
            logger.info(f"Deleted existing plans for {provider} in {org_slug}")
        except Exception as e:
            logger.warning(f"Could not delete existing plans: {e}")

    # Insert seed data using parameterized queries (prevents SQL injection)
    rows_inserted = 0
    insert_errors = []

    # Parse numeric values - handle empty strings properly
    def parse_int(val, default=1):
        if val is None or val == "" or str(val).strip() == "":
            return default
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    def parse_float(val, default=None):
        if val is None or val == "" or str(val).strip() == "":
            return default
        try:
            result = float(val)
            # Return None if value is 0 and we don't want zeros
            return result if result > 0 or default == 0.0 else default
        except (ValueError, TypeError):
            return default

    for plan in seed_data:
        try:
            # Generate new subscription ID
            subscription_id = f"sub_{provider}_{plan.get('plan_name', 'unknown').lower()}_{uuid.uuid4().hex[:8]}"

            # Parse values safely
            quantity = parse_int(plan.get("quantity"), 1)
            unit_price = parse_float(plan.get("unit_price_usd"), 0.0)
            yearly_price = parse_float(plan.get("yearly_price_usd"))
            yearly_discount = parse_float(plan.get("yearly_discount_pct"))
            seats = parse_int(plan.get("seats"), 1)
            display_name = plan.get("display_name", "") or ""
            notes = plan.get("notes", "") or ""
            category = plan.get("category", "other") or "other"
            billing_period = plan.get("billing_period", "monthly") or "monthly"
            plan_name = plan.get("plan_name", "DEFAULT") or "DEFAULT"
            storage_limit = parse_float(plan.get("storage_limit_gb"))
            # Map CSV column monthly_usage_limit to monthly_limit
            monthly_limit = parse_int(plan.get("monthly_usage_limit") or plan.get("monthly_limit"), None)

            # Use parameterized query to prevent SQL injection
            insert_query = f"""
            INSERT INTO `{table_ref}` (
                subscription_id, provider, plan_name, display_name, is_custom,
                quantity, unit_price_usd, yearly_price_usd, yearly_discount_pct,
                effective_date, is_enabled, billing_period, category, notes, seats,
                storage_limit_gb, monthly_limit,
                created_at, updated_at
            ) VALUES (
                @subscription_id,
                @provider,
                @plan_name,
                @display_name,
                false,
                @quantity,
                @unit_price,
                @yearly_price,
                @yearly_discount,
                CURRENT_DATE(),
                true,
                @billing_period,
                @category,
                @notes,
                @seats,
                @storage_limit,
                @monthly_limit,
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP()
            )
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider),
                    bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
                    bigquery.ScalarQueryParameter("display_name", "STRING", display_name),
                    bigquery.ScalarQueryParameter("quantity", "INT64", quantity),
                    bigquery.ScalarQueryParameter("unit_price", "FLOAT64", unit_price),
                    bigquery.ScalarQueryParameter("yearly_price", "FLOAT64", yearly_price),
                    bigquery.ScalarQueryParameter("yearly_discount", "FLOAT64", yearly_discount),
                    bigquery.ScalarQueryParameter("billing_period", "STRING", billing_period),
                    bigquery.ScalarQueryParameter("category", "STRING", category),
                    bigquery.ScalarQueryParameter("notes", "STRING", notes),
                    bigquery.ScalarQueryParameter("seats", "INT64", seats),
                    bigquery.ScalarQueryParameter("storage_limit", "FLOAT64", storage_limit),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", monthly_limit),
                ]
            )
            bq_client.client.query(insert_query, job_config=job_config).result()
            rows_inserted += 1
        except Exception as e:
            error_msg = f"Failed to insert plan {plan.get('plan_name')}: {e}"
            logger.error(error_msg)
            insert_errors.append(error_msg)

    # Build result message with error summary if any
    message = f"Enabled {provider} with {rows_inserted} default plans"
    if insert_errors:
        message += f" ({len(insert_errors)} errors: {'; '.join(insert_errors[:3])}{'...' if len(insert_errors) > 3 else ''})"

    return EnableProviderResponse(
        success=True,
        provider=provider,
        plans_seeded=rows_inserted,
        message=message
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
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    update_query = f"""
    UPDATE `{table_ref}`
    SET is_enabled = false, updated_at = CURRENT_TIMESTAMP()
    WHERE provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ]
        )
        bq_client.client.query(update_query, job_config=job_config).result()
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
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    where_clause = "WHERE provider = @provider"
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
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ]
        )
        result = bq_client.client.query(query, job_config=job_config).result()
        for row in result:
            plan = SubscriptionPlan(
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.display_name if hasattr(row, "display_name") and row.display_name else (row.notes if hasattr(row, "notes") else None),
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
                storage_limit_gb=float(row.storage_limit_gb) if hasattr(row, "storage_limit_gb") and row.storage_limit_gb else None,
                yearly_price_usd=float(row.yearly_price_usd) if hasattr(row, "yearly_price_usd") and row.yearly_price_usd else None,
                yearly_discount_pct=float(row.yearly_discount_pct) if hasattr(row, "yearly_discount_pct") and row.yearly_discount_pct else None,
                seats=row.seats if hasattr(row, "seats") else 1,
            )
            plans.append(plan)

            # Calculate monthly cost for enabled plans
            if plan.is_enabled:
                monthly_cost = plan.unit_price_usd * (plan.quantity or 1)
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
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Check for duplicate plan (same provider + plan_name)
    plan_name_upper = plan.plan_name.upper()
    check_query = f"""
    SELECT COUNT(*) as count FROM `{table_ref}`
    WHERE provider = @provider AND plan_name = @plan_name
    """
    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name_upper),
            ]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        for row in result:
            if row.count > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Plan '{plan_name_upper}' already exists for provider '{provider}'"
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"Could not check for duplicate plan (table may not exist): {e}")

    subscription_id = f"sub_{provider}_{plan.plan_name.lower()}_{uuid.uuid4().hex[:8]}"
    category = get_provider_category(provider).value  # Get enum value

    insert_query = f"""
    INSERT INTO `{table_ref}` (
        subscription_id, provider, plan_name, display_name, is_custom,
        quantity, unit_price_usd, effective_date, is_enabled,
        billing_period, category, notes, daily_limit, monthly_limit,
        storage_limit_gb, yearly_price_usd, yearly_discount_pct, seats,
        created_at, updated_at
    ) VALUES (
        @subscription_id,
        @provider,
        @plan_name,
        @display_name,
        true,
        @quantity,
        @unit_price_usd,
        CURRENT_DATE(),
        true,
        @billing_period,
        @category,
        @notes,
        @daily_limit,
        @monthly_limit,
        @storage_limit_gb,
        @yearly_price_usd,
        @yearly_discount_pct,
        @seats,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
    )
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
                bigquery.ScalarQueryParameter("plan_name", "STRING", plan.plan_name.upper()),
                bigquery.ScalarQueryParameter("display_name", "STRING", plan.display_name or plan.plan_name),
                bigquery.ScalarQueryParameter("quantity", "INT64", plan.quantity),
                bigquery.ScalarQueryParameter("unit_price_usd", "FLOAT64", plan.unit_price_usd),
                bigquery.ScalarQueryParameter("billing_period", "STRING", plan.billing_period),
                bigquery.ScalarQueryParameter("category", "STRING", category),
                bigquery.ScalarQueryParameter("notes", "STRING", plan.notes or ""),
                bigquery.ScalarQueryParameter("daily_limit", "INT64", plan.daily_limit),
                bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan.monthly_limit),
                bigquery.ScalarQueryParameter("storage_limit_gb", "FLOAT64", plan.storage_limit_gb),
                bigquery.ScalarQueryParameter("yearly_price_usd", "FLOAT64", plan.yearly_price_usd),
                bigquery.ScalarQueryParameter("yearly_discount_pct", "FLOAT64", plan.yearly_discount_pct),
                bigquery.ScalarQueryParameter("seats", "INT64", plan.seats),
            ]
        )
        bq_client.client.query(insert_query, job_config=job_config).result()

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
            storage_limit_gb=plan.storage_limit_gb,
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
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Build SET clause and parameters from provided updates
    # Allowlist of valid field names to prevent SQL injection via column names
    ALLOWED_UPDATE_FIELDS = {
        'display_name', 'quantity', 'unit_price_usd', 'is_enabled', 'billing_period',
        'notes', 'daily_limit', 'monthly_limit', 'storage_limit_gb', 'yearly_price_usd',
        'yearly_discount_pct', 'seats'
    }

    set_parts = ["updated_at = CURRENT_TIMESTAMP()"]
    query_parameters = [
        bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
        bigquery.ScalarQueryParameter("provider", "STRING", provider),
    ]
    updates_dict = updates.model_dump(exclude_unset=True)

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
            else:
                query_parameters.append(bigquery.ScalarQueryParameter(param_name, "STRING", str(value)))

    if len(set_parts) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    update_query = f"""
    UPDATE `{table_ref}`
    SET {', '.join(set_parts)}
    WHERE subscription_id = @subscription_id AND provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(query_parameters=query_parameters)
        bq_client.client.query(update_query, job_config=job_config).result()

        # Fetch updated plan
        select_query = f"""
        SELECT * FROM `{table_ref}`
        WHERE subscription_id = @subscription_id
        """
        select_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
            ]
        )
        result = bq_client.client.query(select_query, job_config=select_config).result()

        for row in result:
            updated_plan = SubscriptionPlan(
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.display_name if hasattr(row, "display_name") and row.display_name else None,
                is_custom=row.is_custom if hasattr(row, "is_custom") else False,
                quantity=row.quantity or 1,
                unit_price_usd=float(row.unit_price_usd or 0),
                is_enabled=row.is_enabled if hasattr(row, "is_enabled") else True,
                billing_period=row.billing_period or "monthly",
                category=row.category or "other",
                notes=row.notes if hasattr(row, "notes") else None,
                daily_limit=row.daily_limit if hasattr(row, "daily_limit") else None,
                monthly_limit=row.monthly_limit if hasattr(row, "monthly_limit") else None,
                storage_limit_gb=float(row.storage_limit_gb) if hasattr(row, "storage_limit_gb") and row.storage_limit_gb else None,
                yearly_price_usd=float(row.yearly_price_usd) if hasattr(row, "yearly_price_usd") and row.yearly_price_usd else None,
                yearly_discount_pct=float(row.yearly_discount_pct) if hasattr(row, "yearly_discount_pct") and row.yearly_discount_pct else None,
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
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    delete_query = f"""
    DELETE FROM `{table_ref}`
    WHERE subscription_id = @subscription_id AND provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ]
        )
        bq_client.client.query(delete_query, job_config=job_config).result()
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


# ============================================
# Toggle Endpoint
# ============================================

class ToggleResponse(BaseModel):
    """Response for toggle endpoint."""
    success: bool
    subscription_id: str
    is_enabled: bool
    message: str


@router.post(
    "/subscriptions/{org_slug}/providers/{provider}/toggle/{subscription_id}",
    response_model=ToggleResponse,
    summary="Toggle plan enabled/disabled",
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
    Toggle a plan's is_enabled status.

    Returns the new enabled state.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider = validate_provider(provider)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Get current state
    check_query = f"""
    SELECT is_enabled FROM `{table_ref}`
    WHERE subscription_id = @subscription_id AND provider = @provider
    """

    try:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan {subscription_id} not found"
            )

        current_enabled = rows[0].is_enabled
        new_enabled = not current_enabled

        # Update state
        update_query = f"""
        UPDATE `{table_ref}`
        SET is_enabled = @new_enabled, updated_at = CURRENT_TIMESTAMP()
        WHERE subscription_id = @subscription_id AND provider = @provider
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("new_enabled", "BOOL", new_enabled),
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider),
            ]
        )
        bq_client.client.query(update_query, job_config=job_config).result()

        return ToggleResponse(
            success=True,
            subscription_id=subscription_id,
            is_enabled=new_enabled,
            message=f"Plan {subscription_id} {'enabled' if new_enabled else 'disabled'}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle plan: {e}"
        )


# ============================================
# All Plans Endpoint (for Costs Dashboard)
# ============================================

class AllPlansResponse(BaseModel):
    """Response for all plans endpoint."""
    success: bool
    plans: List[SubscriptionPlan]
    summary: Dict[str, Any]
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
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get all subscription plans across all providers for the costs dashboard.

    This endpoint reduces N+1 queries by fetching all plans in one call.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)

    dataset_id = get_org_dataset(org_slug)
    table_ref = f"{settings.gcp_project_id}.{dataset_id}.{SAAS_SUBSCRIPTION_PLANS_TABLE}"

    # Query all plans
    where_clause = "WHERE is_enabled = true" if enabled_only else ""
    query = f"""
    SELECT
        subscription_id, provider, plan_name, display_name, is_custom,
        quantity, unit_price_usd, yearly_price_usd, yearly_discount_pct,
        billing_period, category, notes, seats, daily_limit, monthly_limit,
        storage_limit_gb, is_enabled, created_at, updated_at
    FROM `{table_ref}`
    {where_clause}
    ORDER BY provider, plan_name
    """

    try:
        result = bq_client.client.query(query).result()
        plans = []
        total_monthly_cost = 0.0
        count_by_category: Dict[str, int] = {}
        enabled_count = 0

        for row in result:
            plan = SubscriptionPlan(
                subscription_id=row.subscription_id,
                provider=row.provider,
                plan_name=row.plan_name,
                display_name=row.display_name if hasattr(row, "display_name") else None,
                is_custom=row.is_custom if hasattr(row, "is_custom") else False,
                quantity=row.quantity or 1,
                unit_price_usd=float(row.unit_price_usd or 0),
                yearly_price_usd=float(row.yearly_price_usd) if row.yearly_price_usd else None,
                yearly_discount_pct=float(row.yearly_discount_pct) if hasattr(row, "yearly_discount_pct") and row.yearly_discount_pct else None,
                is_enabled=row.is_enabled if hasattr(row, "is_enabled") else True,
                billing_period=row.billing_period or "monthly",
                category=row.category or "other",
                notes=row.notes if hasattr(row, "notes") else None,
                seats=row.seats if hasattr(row, "seats") else 1,
                daily_limit=row.daily_limit if hasattr(row, "daily_limit") else None,
                monthly_limit=row.monthly_limit if hasattr(row, "monthly_limit") else None,
                storage_limit_gb=float(row.storage_limit_gb) if hasattr(row, "storage_limit_gb") and row.storage_limit_gb else None,
            )
            plans.append(plan)

            # Aggregate for summary - calculate monthly cost with billing period adjustment
            if plan.is_enabled:
                enabled_count += 1
                monthly_cost = plan.unit_price_usd * (plan.quantity or 1)
                # Adjust for billing period (unit_price_usd is per period, not per month)
                if plan.billing_period == "yearly":
                    monthly_cost = monthly_cost / 12
                elif plan.billing_period == "quarterly":
                    monthly_cost = monthly_cost / 3
                total_monthly_cost += monthly_cost

            cat = plan.category or "other"
            count_by_category[cat] = count_by_category.get(cat, 0) + 1

        summary = {
            "total_monthly_cost": round(total_monthly_cost, 2),
            "total_annual_cost": round(total_monthly_cost * 12, 2),
            "count_by_category": count_by_category,
            "enabled_count": enabled_count,
            "total_count": len(plans),
        }

        return AllPlansResponse(
            success=True,
            plans=plans,
            summary=summary,
            message=f"Found {len(plans)} plans"
        )
    except Exception as e:
        logger.error(f"Failed to get all plans: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get all plans: {e}"
        )
