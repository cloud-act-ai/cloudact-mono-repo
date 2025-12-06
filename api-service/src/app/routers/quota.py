"""
Quota Management API Routes
Provides quota usage information for organizations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import logging

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from src.app.dependencies.auth import get_org_or_admin_auth, AuthResult
from google.cloud import bigquery

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
    description="Returns current quota usage and limits for pipelines"
)
async def get_quota(
    org_slug: str,
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

    Args:
        org_slug: Organization identifier
        auth: Authentication result (org key or admin key)
        bq_client: BigQuery client instance

    Returns:
        QuotaResponse with current usage and limits

    Raises:
        HTTPException: If org not found or user not authorized
    """
    # Security check: if using org key, must match the org in URL
    if not auth.is_admin and auth.org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access quota for another organization"
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{org_slug}' not found or has no subscription"
            )

        row = results[0]

        # Extract values (handle NULL from LEFT JOIN when no usage record exists yet)
        pipelines_run_today = row.get("pipelines_run_today") or 0
        pipelines_run_month = row.get("pipelines_run_month") or 0
        concurrent_running = row.get("concurrent_pipelines_running") or 0
        daily_limit = row.get("daily_limit") or 10
        monthly_limit = row.get("monthly_limit") or 300
        concurrent_limit = row.get("concurrent_limit") or 1
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
        logger.error(f"Failed to get quota for org {org_slug}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve quota information. Please check server logs."
        )
