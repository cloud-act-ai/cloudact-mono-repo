"""
Quota Management API Routes
Provides quota usage information for organizations.

Security Enhancements:
- Issue #29: Generic error messages (no details leaked)
- Issue #30: Rate limiting (100 req/min per org)
- Issue #47: org_slug validation
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import logging

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
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
    today = datetime.utcnow().date()

    try:
        # Query org_usage_quotas and org_subscriptions for complete quota info
        # Note: We use subscription limits as source of truth (handle subscription upgrades)
        query = f"""
        SELECT
            u.pipelines_run_today,
            u.pipelines_run_month,
            u.concurrent_pipelines_running,
            u.usage_date,
            s.daily_limit,
            s.monthly_limit,
            s.concurrent_limit,
            s.plan_name
        FROM `{settings.gcp_project_id}.organizations.org_subscriptions` s
        LEFT JOIN `{settings.gcp_project_id}.organizations.org_usage_quotas` u
            ON s.org_slug = u.org_slug
            AND u.usage_date = @usage_date
        WHERE s.org_slug = @org_slug
        LIMIT 1
        """

        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("usage_date", "DATE", today)
            ]
        ))

        if not results:
            # Issue #29: Generic error message
            raise handle_not_found(
                resource_type="Organization",
                resource_id=org_slug,
                context={"reason": "no_subscription"}
            )

        row = results[0]

        # Extract values (handle NULL from LEFT JOIN when no usage record exists yet)
        # Use explicit None checks to preserve 0 values (0 means disabled, not "use default")
        pipelines_run_today = row.get("pipelines_run_today")
        pipelines_run_today = pipelines_run_today if pipelines_run_today is not None else 0

        pipelines_run_month = row.get("pipelines_run_month")
        pipelines_run_month = pipelines_run_month if pipelines_run_month is not None else 0

        concurrent_running = row.get("concurrent_pipelines_running")
        concurrent_running = concurrent_running if concurrent_running is not None else 0

        # For limits, use SUBSCRIPTION_LIMITS defaults when NULL (not when 0)
        daily_limit = row.get("daily_limit")
        daily_limit = daily_limit if daily_limit is not None else _DEFAULT_LIMITS["max_pipelines_per_day"]

        monthly_limit = row.get("monthly_limit")
        monthly_limit = monthly_limit if monthly_limit is not None else _DEFAULT_LIMITS["max_pipelines_per_month"]

        concurrent_limit = row.get("concurrent_limit")
        concurrent_limit = concurrent_limit if concurrent_limit is not None else _DEFAULT_LIMITS["max_concurrent_pipelines"]

        usage_date = row.get("usage_date")

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
                "monthly_limit": monthly_limit
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
