"""
Quota Management API Routes
Provides quota usage information for organizations.

ARCHITECTURE:
- Subscription limits (daily_limit, monthly_limit, etc.) are read from Supabase organizations table
- Usage tracking (pipelines_run_today, etc.) is read from BigQuery org_usage_quotas table
- Provider count is read from BigQuery org_integration_credentials table

Security Enhancements:
- Issue #29: Generic error messages (no details leaked)
- Issue #30: Rate limiting (100 req/min per org)
- Issue #47: org_slug validation
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, timezone
import logging

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.utils.supabase_client import get_supabase_client
from src.app.config import settings
from src.app.dependencies.auth import get_org_or_admin_auth, AuthResult
from src.app.dependencies.rate_limit_decorator import rate_limit_by_org
from src.core.utils.error_handling import safe_error_response, handle_not_found, handle_forbidden
from src.core.utils.validators import validate_org_slug
from src.app.models.org_models import SUBSCRIPTION_LIMITS, SubscriptionPlan
from google.cloud import bigquery

# Default limits from STARTER plan (used when subscription limits are missing)
_DEFAULT_LIMITS = SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER]

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Response Models
# ============================================

class QuotaResponse(BaseModel):
    """Response model for quota usage."""
    org_slug: str
    pipelinesRunToday: int
    dailyLimit: int
    pipelinesRunMonth: int
    monthlyLimit: int
    concurrentRunning: int
    concurrentLimit: int
    # Resource limits (for frontend quota display)
    seatLimit: int
    providersLimit: int
    # Resource usage counts (for frontend quota display)
    # configuredProvidersCount: count of valid integrations from BigQuery org_integration_credentials
    configuredProvidersCount: int = 0
    usageDate: Optional[str] = None
    dailyUsagePercent: Optional[float] = None
    monthlyUsagePercent: Optional[float] = None


# ============================================
# Get Quota Endpoint
# ============================================

@router.get(
    "/organizations/{org_slug}/quota",
    response_model=QuotaResponse,
    summary="Get quota usage for an organization",
    description="Returns current quota usage and limits for pipelines. Rate limited: 100 req/min per org."
)
async def get_quota(
    org_slug: str,
    request: Request,
    auth: AuthResult = Depends(get_org_or_admin_auth),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get quota usage for an organization.

    Returns current usage and limits for:
    - Daily pipeline runs
    - Monthly pipeline runs
    - Concurrent pipelines running

    ARCHITECTURE:
    - Limits are read from Supabase organizations table (source of truth for billing)
    - Usage is read from BigQuery org_usage_quotas table (where pipelines write)

    Accepts EITHER:
    - Organization API Key (X-API-Key header) - self-service access
    - Root API Key (X-CA-Root-Key header) - admin can access any org

    SECURITY ENHANCEMENTS:
    - Issue #29: Generic error messages
    - Issue #30: Rate limiting (100 req/min per org)
    - Issue #47: org_slug validation

    Args:
        org_slug: Organization identifier
        request: FastAPI request (for rate limiting)
        auth: Authentication result (org key or admin key)
        bq_client: BigQuery client instance

    Returns:
        QuotaResponse with current usage and limits

    Raises:
        HTTPException: If org not found or user not authorized
    """
    # Issue #47: Validate org_slug format
    validate_org_slug(org_slug)

    # Issue #30: Apply rate limiting (100 requests per minute per org)
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=100,
        endpoint_name="get_quota"
    )

    # Security check: if using org key, must match the org in URL
    if not auth.is_admin and auth.org_slug != org_slug:
        # Issue #29: Generic error message
        raise handle_forbidden(
            reason="Access denied",
            context={"org_slug": org_slug, "auth_org": auth.org_slug}
        )

    logger.info(f"Getting quota information for organization: {org_slug}")

    # Get current UTC date for quota lookup
    today = datetime.now(timezone.utc).date()

    try:
        # STEP 1: Get subscription limits from Supabase organizations table
        # NOTE: Column names match Stripe webhook updates (2026-02-01 consolidation)
        supabase = get_supabase_client()
        org_result = supabase.table("organizations").select(
            "pipelines_per_day_limit, pipelines_per_month_limit, concurrent_pipelines_limit, "
            "seat_limit, providers_limit, plan"
        ).eq("org_slug", org_slug).single().execute()

        if not org_result.data:
            raise handle_not_found(
                resource_type="Organization",
                resource_id=org_slug,
                context={"reason": "no_organization"}
            )

        org_data = org_result.data

        # Extract limits from Supabase (with defaults)
        # Column names: pipelines_per_day_limit, pipelines_per_month_limit, concurrent_pipelines_limit
        daily_limit = org_data.get("pipelines_per_day_limit") or _DEFAULT_LIMITS["daily_limit"]
        monthly_limit = org_data.get("pipelines_per_month_limit") or _DEFAULT_LIMITS["monthly_limit"]
        concurrent_limit = org_data.get("concurrent_pipelines_limit") or _DEFAULT_LIMITS["concurrent_limit"]
        seat_limit = org_data.get("seat_limit") or _DEFAULT_LIMITS["seat_limit"]
        providers_limit = org_data.get("providers_limit") or _DEFAULT_LIMITS["providers_limit"]

        # STEP 2: Get usage from BigQuery org_usage_quotas and provider count
        query = f"""
        WITH provider_count AS (
            SELECT COUNT(DISTINCT provider) as configured_providers_count
            FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug
              AND is_active = TRUE
              AND validation_status = 'VALID'
        )
        SELECT
            u.pipelines_run_today,
            u.pipelines_run_month,
            u.concurrent_pipelines_running,
            u.usage_date,
            COALESCE(p.configured_providers_count, 0) as configured_providers_count
        FROM `{settings.gcp_project_id}.organizations.org_usage_quotas` u
        CROSS JOIN provider_count p
        WHERE u.org_slug = @org_slug
            AND u.usage_date = @usage_date
        LIMIT 1
        """

        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("usage_date", "DATE", today)
            ]
        ))

        # Default usage values if no record exists yet
        pipelines_run_today = 0
        pipelines_run_month = 0
        concurrent_running = 0
        configured_providers_count = 0
        usage_date = today

        if results:
            row = results[0]
            pipelines_run_today = row.get("pipelines_run_today") or 0
            pipelines_run_month = row.get("pipelines_run_month") or 0
            concurrent_running = row.get("concurrent_pipelines_running") or 0
            configured_providers_count = row.get("configured_providers_count") or 0
            usage_date = row.get("usage_date") or today

        # Calculate usage percentages
        daily_usage_percent = (pipelines_run_today / daily_limit * 100) if daily_limit > 0 else 0
        monthly_usage_percent = (pipelines_run_month / monthly_limit * 100) if monthly_limit > 0 else 0

        logger.info(
            f"Quota retrieved for org {org_slug}",
            extra={
                "org_slug": org_slug,
                "pipelines_run_today": pipelines_run_today,
                "daily_limit": daily_limit,
                "pipelines_run_month": pipelines_run_month,
                "monthly_limit": monthly_limit,
                "seat_limit": seat_limit,
                "providers_limit": providers_limit,
                "configured_providers_count": configured_providers_count
            }
        )

        return QuotaResponse(
            org_slug=org_slug,
            pipelinesRunToday=pipelines_run_today,
            dailyLimit=daily_limit,
            pipelinesRunMonth=pipelines_run_month,
            monthlyLimit=monthly_limit,
            concurrentRunning=concurrent_running,
            concurrentLimit=concurrent_limit,
            seatLimit=seat_limit,
            providersLimit=providers_limit,
            configuredProvidersCount=configured_providers_count,
            usageDate=str(usage_date) if usage_date else str(today),
            dailyUsagePercent=round(daily_usage_percent, 2),
            monthlyUsagePercent=round(monthly_usage_percent, 2)
        )

    except HTTPException:
        raise
    except Exception as e:
        # Issue #29: Generic error message with server-side logging
        raise safe_error_response(
            error=e,
            operation="retrieve quota information",
            context={"org_slug": org_slug}
        )
