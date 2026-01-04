"""
Read-Only Cost API Endpoints

High-performance, Polars-powered cost data API for multi-tenant architecture.
All endpoints are read-only and designed for millions of requests per second.

Features:
- Multi-tenant isolation via org_slug
- Aggressive caching with configurable TTL
- Zero-copy data transfer via Arrow format
- Comprehensive cost analytics endpoints
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date
from enum import Enum
import logging
import re

from src.app.dependencies.auth import verify_api_key, OrgContext
from src.app.dependencies.rate_limit_decorator import rate_limit_by_org
from src.core.services.cost_read import (
    get_cost_read_service,
    CostQuery,
    CostResponse,
    CostReadService,
)
from src.app.models.i18n_models import DEFAULT_CURRENCY, validate_currency
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from google.cloud import bigquery

logger = logging.getLogger(__name__)


# ==============================================================================
# Multi-Tenancy Security Helpers
# ==============================================================================

# Valid org_slug pattern: alphanumeric + underscore, 3-50 chars
ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')


def validate_org_slug_format(org_slug: str) -> None:
    """
    Validate org_slug format to prevent SQL injection and path traversal.

    Raises:
        HTTPException: If org_slug format is invalid
    """
    if not ORG_SLUG_PATTERN.match(org_slug):
        logger.warning(f"Invalid org_slug format attempted: {org_slug[:50]}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid organization identifier format"
        )


def validate_date_range(start_date: Optional[date], end_date: Optional[date]) -> None:
    """
    Validate date range parameters.

    FIX: VAL-001 - Ensure start_date is before end_date

    Raises:
        HTTPException: If date range is invalid
    """
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date range: start_date must be before or equal to end_date"
        )


def validate_org_access(url_org_slug: str, auth_context: OrgContext) -> None:
    """
    CRITICAL MULTI-TENANCY CHECK: Ensure URL org_slug matches authenticated org.

    This prevents cross-tenant data access where customer A tries to access
    customer B's data by manipulating the URL.

    Args:
        url_org_slug: The org_slug from the URL path
        auth_context: The authenticated organization context from API key

    Raises:
        HTTPException: 403 Forbidden if org_slug mismatch (cross-tenant access attempt)
    """
    # First validate format
    validate_org_slug_format(url_org_slug)

    # CRITICAL: URL org_slug MUST match the API key's org_slug
    if url_org_slug != auth_context.org_slug:
        logger.warning(
            f"SECURITY: Cross-tenant access attempt blocked",
            extra={
                "event_type": "cross_tenant_access_blocked",
                "requested_org": url_org_slug,
                "authenticated_org": auth_context.org_slug,
                "severity": "HIGH"
            }
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only access your own organization's data"
        )

router = APIRouter(prefix="/costs", tags=["Costs"])


# ==============================================================================
# Request/Response Models
# ==============================================================================

class Granularity(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class CostQueryParams(BaseModel):
    """Query parameters for cost data retrieval."""
    start_date: Optional[date] = Field(None, description="Start date for cost data (inclusive)")
    end_date: Optional[date] = Field(None, description="End date for cost data (inclusive)")
    providers: Optional[List[str]] = Field(None, description="Filter by providers (e.g., openai, anthropic, gcp)")
    service_categories: Optional[List[str]] = Field(None, description="Filter by service categories (e.g., Subscriptions, Cloud)")
    department_id: Optional[str] = Field(None, description="Filter by department ID (hierarchy)")
    project_id: Optional[str] = Field(None, description="Filter by project ID (hierarchy)")
    team_id: Optional[str] = Field(None, description="Filter by team ID (hierarchy)")
    limit: int = Field(1000, ge=1, le=10000, description="Maximum records to return")
    offset: int = Field(0, ge=0, description="Offset for pagination")


class CostDataResponse(BaseModel):
    """Standard response wrapper for cost data."""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    summary: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, int]] = None
    cache_hit: bool = False
    query_time_ms: float = 0.0
    error: Optional[str] = None
    currency: Optional[str] = None  # Org's default currency (e.g., USD, INR, AED)

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "data": [
                    {
                        "Provider": "slack",
                        "ServiceCategory": "Subscription",
                        "BilledCost": 150.50,
                        "ChargePeriodStart": "2025-12-01"
                    }
                ],
                "pagination": {"limit": 1000, "offset": 0, "total": 1},
                "cache_hit": False,
                "query_time_ms": 45.2,
                "currency": "USD"
            }
        }


class CacheStat(BaseModel):
    """Cache statistics response."""
    hits: int
    misses: int
    evictions: int
    size: int
    max_size: int
    hit_rate: float


# ==============================================================================
# Helper Functions
# ==============================================================================

async def _get_org_currency(org_slug: str, bq_client: BigQueryClient) -> str:
    """
    Fetch organization's default currency from org_profiles table.

    Returns:
        Currency code (e.g., USD, INR, AED) or DEFAULT_CURRENCY if not found/invalid
    """
    try:
        query = f"""
        SELECT default_currency
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE org_slug = @org_slug
        LIMIT 1
        """

        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ]
        ))

        if results and results[0].get("default_currency"):
            currency = results[0]["default_currency"]
            # Validate the currency is in supported list
            if validate_currency(currency):
                return currency
            else:
                logger.warning(
                    f"Invalid currency '{currency}' for org {org_slug}, using default",
                    extra={"org_slug": org_slug, "invalid_currency": currency}
                )
                return DEFAULT_CURRENCY.value

        # Default if not found
        return DEFAULT_CURRENCY.value
    except Exception as e:
        logger.warning(
            f"Failed to fetch org currency for {org_slug}, using default",
            extra={"org_slug": org_slug, "error": str(e)}
        )
        return DEFAULT_CURRENCY.value


def _to_response(cost_response: CostResponse, currency: Optional[str] = None) -> CostDataResponse:
    """Convert internal CostResponse to API response model."""
    return CostDataResponse(
        success=cost_response.success,
        data=cost_response.data,
        summary=cost_response.summary,
        pagination=cost_response.pagination,
        cache_hit=cost_response.cache_hit,
        query_time_ms=cost_response.query_time_ms,
        error=cost_response.error,
        currency=currency
    )


# ==============================================================================
# Cost API Endpoints
# ==============================================================================

@router.get(
    "/{org_slug}",
    response_model=CostDataResponse,
    summary="Get Cost Data",
    description="Retrieve cost data for an organization with optional filters. Uses FOCUS 1.2 standard schema. Rate limited: 60 req/min per org."
)
async def get_costs(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    providers: Optional[str] = Query(None, description="Comma-separated list of providers"),
    service_categories: Optional[str] = Query(None, description="Comma-separated list of service categories"),
    department_id: Optional[str] = Query(None, description="Filter by department ID (hierarchy)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID (hierarchy)"),
    team_id: Optional[str] = Query(None, description="Filter by team ID (hierarchy)"),
    limit: int = Query(1000, ge=1, le=10000, description="Max records"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get cost data for an organization.

    - **org_slug**: Organization identifier (must match API key)
    - **start_date**: Filter costs from this date
    - **end_date**: Filter costs until this date
    - **providers**: Comma-separated provider filter (e.g., "openai,anthropic")
    - **service_categories**: Comma-separated category filter (e.g., "Subscriptions,Cloud")
    - **department_id**: Filter by department ID (hierarchy)
    - **project_id**: Filter by project ID (hierarchy)
    - **team_id**: Filter by team ID (hierarchy)
    - **limit**: Maximum records to return (default 1000, max 10000)
    - **offset**: Pagination offset
    """
    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    # FIX: VAL-001 - Validate date range
    validate_date_range(start_date, end_date)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_costs"
    )

    # Parse comma-separated filters
    provider_list = [p.strip() for p in providers.split(",")] if providers else None
    category_list = [c.strip() for c in service_categories.split(",")] if service_categories else None

    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date,
        providers=provider_list,
        service_categories=category_list,
        department_id=department_id,
        project_id=project_id,
        team_id=team_id,
        limit=limit,
        offset=offset
    )

    result = await cost_service.get_costs(query)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve cost data"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


@router.get(
    "/{org_slug}/summary",
    response_model=CostDataResponse,
    summary="Get Cost Summary",
    description="Get aggregated cost summary statistics for an organization. Rate limited: 60 req/min per org."
)
async def get_cost_summary(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    providers: Optional[str] = Query(None, description="Comma-separated list of providers"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get cost summary statistics for an organization.

    Returns:
    - Total billed cost
    - Total effective cost
    - Record count
    - Date range
    - Unique providers
    - Unique service categories
    """
    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_cost_summary"
    )

    provider_list = [p.strip() for p in providers.split(",")] if providers else None

    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date,
        providers=provider_list
    )

    result = await cost_service.get_cost_summary(query)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve cost summary"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


@router.get(
    "/{org_slug}/by-provider",
    response_model=CostDataResponse,
    summary="Get Cost by Provider",
    description="Get cost breakdown grouped by provider (OpenAI, Anthropic, GCP, etc.). Rate limited: 60 req/min per org."
)
async def get_cost_by_provider(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    providers: Optional[str] = Query(None, description="Comma-separated list of providers to filter"),
    department_id: Optional[str] = Query(None, description="Filter by department ID (hierarchy)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID (hierarchy)"),
    team_id: Optional[str] = Query(None, description="Filter by team ID (hierarchy)"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get cost breakdown by provider.

    Returns aggregated costs grouped by provider with:
    - Total billed cost
    - Total effective cost
    - Record count
    - Service categories per provider
    """
    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_cost_by_provider"
    )

    # Parse comma-separated providers filter
    provider_list = [p.strip() for p in providers.split(",")] if providers else None

    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date,
        providers=provider_list,
        department_id=department_id,
        project_id=project_id,
        team_id=team_id
    )
    result = await cost_service.get_cost_by_provider(query)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve cost by provider"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


@router.get(
    "/{org_slug}/by-service",
    response_model=CostDataResponse,
    summary="Get Cost by Service",
    description="Get cost breakdown grouped by service category and name. Rate limited: 60 req/min per org."
)
async def get_cost_by_service(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get cost breakdown by service.

    Returns aggregated costs grouped by:
    - Service category
    - Service name
    - Provider

    Limited to top 100 services by cost.
    """
    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_cost_by_service"
    )

    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date
    )
    result = await cost_service.get_cost_by_service(query)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve cost by service"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


@router.get(
    "/{org_slug}/trend",
    response_model=CostDataResponse,
    summary="Get Cost Trend",
    description="Get cost trend over time with configurable granularity. Rate limited: 60 req/min per org."
)
async def get_cost_trend(
    org_slug: str,
    request: Request,
    granularity: Granularity = Query(Granularity.DAILY, description="Time granularity"),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    category: Optional[str] = Query(None, description="Cost category filter: genai, cloud, or subscription"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get cost trend over time.

    - **granularity**: "daily", "weekly", or "monthly"
    - **days**: Number of days to look back (default 30, max 365)
    - **category**: Filter by cost category ("genai", "cloud", "subscription")

    Returns time series data with:
    - Period (date)
    - Total billed cost
    - Total effective cost
    - Record count
    - Providers active in period
    """
    from datetime import timedelta
    from src.core.services._shared import DatePeriod

    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_cost_trend"
    )

    # Build query with LAST_N_DAYS equivalent
    today = date.today()
    query = CostQuery(
        org_slug=org_slug,
        start_date=today - timedelta(days=days),
        end_date=today
    )
    result = await cost_service.get_cost_trend(query, granularity.value, category=category)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve cost trend"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


# ==============================================================================
# Subscription Costs Endpoint (Polars-powered)
# ==============================================================================

@router.get(
    "/{org_slug}/subscriptions",
    response_model=CostDataResponse,
    summary="Get Subscription Costs",
    description="Get actual calculated subscription costs from cost_data_standard_1_3 (pipeline output). Rate limited: 60 req/min per org."
)
async def get_subscription_costs(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD). Defaults to first of current month."),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD). Defaults to today."),
    department_id: Optional[str] = Query(None, description="Filter by department ID (hierarchy)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID (hierarchy)"),
    team_id: Optional[str] = Query(None, description="Filter by team ID (hierarchy)"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get subscription costs from the cost_data_standard_1_3 table.

    This is the **source of truth** for subscription costs, calculated by the
    subscription costs pipeline (sp_run_subscription_costs_pipeline).

    Returns:
    - Per-subscription monthly and annual run rates (calculated from daily costs)
    - Total monthly and annual costs across all subscriptions
    - Provider breakdown

    Use this for the Subscription Costs dashboard to show actual calculated costs,
    while using /subscriptions endpoints for plan details (seats, status, etc.).
    """
    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_subscription_costs"
    )

    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
        project_id=project_id,
        team_id=team_id
    )
    result = await cost_service.get_subscription_costs(query)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve subscription costs"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


# ==============================================================================
# Cloud Costs Endpoint
# ==============================================================================

@router.get(
    "/{org_slug}/cloud",
    response_model=CostDataResponse,
    summary="Get Cloud Costs",
    description="Get cloud infrastructure costs (GCP, AWS, Azure) from cost_data_standard_1_3. Rate limited: 60 req/min per org."
)
async def get_cloud_costs(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD). Defaults to first of current month."),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD). Defaults to today."),
    department_id: Optional[str] = Query(None, description="Filter by department ID (hierarchy)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID (hierarchy)"),
    team_id: Optional[str] = Query(None, description="Filter by team ID (hierarchy)"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get cloud infrastructure costs from cost_data_standard_1_3.

    Includes costs from:
    - Google Cloud Platform (GCP)
    - Amazon Web Services (AWS)
    - Microsoft Azure

    Returns:
    - Daily, monthly, and annual cost projections
    - Cost breakdown by provider and service
    """
    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_cloud_costs"
    )

    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
        project_id=project_id,
        team_id=team_id
    )
    result = await cost_service.get_cloud_costs(query)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve cloud costs"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


# ==============================================================================
# GenAI API Costs Endpoint
# ==============================================================================

@router.get(
    "/{org_slug}/genai",
    response_model=CostDataResponse,
    summary="Get GenAI API Costs",
    description="Get GenAI API costs (OpenAI, Anthropic, etc.) from cost_data_standard_1_3. Rate limited: 60 req/min per org."
)
async def get_genai_costs(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD). Defaults to first of current month."),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD). Defaults to today."),
    department_id: Optional[str] = Query(None, description="Filter by department ID (hierarchy)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID (hierarchy)"),
    team_id: Optional[str] = Query(None, description="Filter by team ID (hierarchy)"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get GenAI API costs from cost_data_standard_1_3.

    Includes costs from:
    - OpenAI (GPT-4, GPT-3.5, embeddings, etc.)
    - Anthropic (Claude)
    - Google (Gemini)
    - Cohere
    - Mistral
    - Other GenAI providers

    Returns:
    - Daily, monthly, and annual cost projections
    - Cost breakdown by provider and model
    """
    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_genai_costs"
    )

    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
        project_id=project_id,
        team_id=team_id
    )
    result = await cost_service.get_genai_costs(query)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.error or "Failed to retrieve GenAI costs"
        )

    # Fetch org currency
    currency = await _get_org_currency(org_slug, bq_client)

    return _to_response(result, currency=currency)


# ==============================================================================
# Total Costs Aggregation Endpoint
# ==============================================================================

class TotalCostSummary(BaseModel):
    """Aggregated cost summary across all cost types."""
    subscription: Dict[str, Any]
    cloud: Dict[str, Any]
    genai: Dict[str, Any]
    total: Dict[str, Any]
    date_range: Dict[str, str]
    query_time_ms: float
    currency: Optional[str] = None  # Org's default currency (e.g., USD, INR, AED)


@router.get(
    "/{org_slug}/total",
    response_model=TotalCostSummary,
    summary="Get Total Costs",
    description="Get aggregated costs across subscriptions, cloud infrastructure, and GenAI APIs. Rate limited: 60 req/min per org."
)
async def get_total_costs(
    org_slug: str,
    request: Request,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD). Defaults to first of current month."),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD). Defaults to today."),
    department_id: Optional[str] = Query(None, description="Filter by department ID (hierarchy)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID (hierarchy)"),
    team_id: Optional[str] = Query(None, description="Filter by team ID (hierarchy)"),
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get total costs aggregated from all sources.

    Combines costs from:
    - Subscriptions (ChatGPT Plus, Canva, Slack, etc.)
    - Cloud infrastructure (GCP, AWS, Azure)
    - LLM APIs (OpenAI, Anthropic, etc.)

    Returns:
    - Individual summaries for each cost type
    - Total daily, monthly, and annual projections
    """
    import asyncio
    import time

    validate_org_access(org_slug, auth_context)

    # Apply rate limiting (60 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="get_total_costs"
    )

    start_time = time.time()

    # Build query
    query = CostQuery(
        org_slug=org_slug,
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
        project_id=project_id,
        team_id=team_id
    )

    # Fetch all cost types in parallel + currency (single lookup, not 4)
    subscription_result, cloud_result, genai_result, currency = await asyncio.gather(
        cost_service.get_subscription_costs(query),
        cost_service.get_cloud_costs(query),
        cost_service.get_genai_costs(query),
        _get_org_currency(org_slug, bq_client)
    )

    # Validate date ranges match across cost types
    date_ranges = []
    for result_name, result in [("subscription", subscription_result), ("cloud", cloud_result), ("genai", genai_result)]:
        if result.success and result.summary and "date_range" in result.summary:
            date_ranges.append((result_name, result.summary["date_range"]))
        elif result.success and result.data:
            # Warn if a cost type returned data but has empty summary
            logger.warning(
                f"Cost aggregation: {result_name} returned data but missing date_range in summary",
                extra={
                    "org_slug": org_slug,
                    "cost_type": result_name,
                    "record_count": len(result.data) if result.data else 0
                }
            )

    # Log if date ranges don't match (potential data inconsistency)
    if len(date_ranges) > 1:
        first_range = date_ranges[0][1]
        for cost_type, dr in date_ranges[1:]:
            if dr != first_range:
                logger.warning(
                    f"Cost aggregation: Date range mismatch across cost types",
                    extra={
                        "org_slug": org_slug,
                        "base_range": first_range,
                        "mismatched_tyaspe": cost_type,
                        "mismatched_range": dr
                    }
                )

    # Extract summaries (default to zeros if failed)
    # Include both actual billed costs AND projections for flexibility
    def safe_summary(result) -> Dict[str, Any]:
        if result.success and result.summary:
            # Get actual billed cost (may be under different keys depending on service)
            total_billed = (
                result.summary.get("total_billed_cost") or
                result.summary.get("total_cost") or
                result.summary.get("mtd_cost") or
                0
            )
            return {
                "total_daily_cost": result.summary.get("total_daily_cost", result.summary.get("daily_rate", 0)),
                "total_monthly_cost": result.summary.get("total_monthly_cost", result.summary.get("monthly_forecast", 0)),
                "total_annual_cost": result.summary.get("total_annual_cost", result.summary.get("annual_forecast", 0)),
                "total_billed_cost": round(total_billed, 2),  # Actual sum of BilledCost
                "mtd_cost": result.summary.get("mtd_cost", 0),  # Month-to-date actual
                "record_count": result.summary.get("record_count", 0),
                "providers": result.summary.get("providers", []),
            }
        return {
            "total_daily_cost": 0,
            "total_monthly_cost": 0,
            "total_annual_cost": 0,
            "total_billed_cost": 0,
            "mtd_cost": 0,
            "record_count": 0,
            "providers": [],
        }

    subscription_summary = safe_summary(subscription_result)
    cloud_summary = safe_summary(cloud_result)
    genai_summary = safe_summary(genai_result)

    # Calculate totals (both projections and actual billed)
    total_daily = subscription_summary["total_daily_cost"] + cloud_summary["total_daily_cost"] + genai_summary["total_daily_cost"]
    total_monthly = subscription_summary["total_monthly_cost"] + cloud_summary["total_monthly_cost"] + genai_summary["total_monthly_cost"]
    total_annual = subscription_summary["total_annual_cost"] + cloud_summary["total_annual_cost"] + genai_summary["total_annual_cost"]
    total_billed = subscription_summary["total_billed_cost"] + cloud_summary["total_billed_cost"] + genai_summary["total_billed_cost"]

    query_time = (time.time() - start_time) * 1000

    # Determine date range from first successful result
    date_range = {"start": "", "end": ""}
    for result in [subscription_result, cloud_result, genai_result]:
        if result.success and result.summary and "date_range" in result.summary:
            date_range = result.summary["date_range"]
            break

    # Currency already fetched in parallel above

    return TotalCostSummary(
        subscription=subscription_summary,
        cloud=cloud_summary,
        genai=genai_summary,
        total={
            "total_daily_cost": round(total_daily, 2),
            "total_monthly_cost": round(total_monthly, 2),
            "total_annual_cost": round(total_annual, 2),
            "total_billed_cost": round(total_billed, 2),  # Actual sum for the period
        },
        date_range=date_range,
        query_time_ms=round(query_time, 2),
        currency=currency
    )


# ==============================================================================
# Cache Management Endpoints
# ==============================================================================

@router.get(
    "/{org_slug}/cache/stats",
    response_model=CacheStat,
    summary="Get Cache Statistics",
    description="Get cache performance statistics (hit rate, size, etc.)."
)
async def get_cache_stats(
    org_slug: str,
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service)
):
    """
    Get cache statistics.

    Returns:
    - hits: Number of cache hits
    - misses: Number of cache misses
    - evictions: Number of cache evictions
    - size: Current cache size
    - max_size: Maximum cache size
    - hit_rate: Cache hit rate (0.0 - 1.0)
    """
    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    stats = cost_service.cache_stats
    return CacheStat(**stats)


@router.post(
    "/{org_slug}/cache/invalidate",
    summary="Invalidate Cache",
    description="Invalidate all cached cost data for an organization."
)
async def invalidate_cache(
    org_slug: str,
    auth_context: OrgContext = Depends(verify_api_key),
    cost_service: CostReadService = Depends(get_cost_read_service)
):
    """
    Invalidate all cached data for the organization.

    Use this after data updates to ensure fresh data is returned.
    """
    # CRITICAL: Multi-tenancy security check
    validate_org_access(org_slug, auth_context)

    count = cost_service.invalidate_org_cache(org_slug)
    return {
        "success": True,
        "message": f"Invalidated {count} cache entries for {org_slug}"
    }
