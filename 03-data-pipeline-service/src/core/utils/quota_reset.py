"""
Quota Reset Functions

Provides daily and monthly quota reset functionality.
Should be called by a scheduler (Cloud Scheduler, cron, etc.)

Uses Supabase for quota tracking instead of BigQuery.
"""

import logging
from datetime import datetime, date, timedelta, timezone
from typing import Dict, Any, List

from src.app.config import settings
from src.core.utils.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


def get_utc_date() -> date:
    """Get current date in UTC timezone to ensure consistency with BigQuery."""
    return datetime.now(timezone.utc).date()


async def reset_daily_quotas() -> Dict[str, Any]:
    """
    Reset daily quota counters for all organizations via Supabase.

    This should be called at 00:00 UTC daily by a scheduler.

    The Supabase get_or_create_quota function handles daily record creation
    automatically. This function ensures all active orgs have today's record
    with fresh daily counters.

    Returns:
        Dict with reset statistics
    """
    today = get_utc_date()

    try:
        supabase = get_supabase_client()

        # Get all active organizations
        orgs_result = supabase.table("organizations").select("id, org_slug").eq("status", "ACTIVE").execute()

        if not orgs_result.data:
            logger.warning("No active organizations found for daily quota reset")
            return {
                "status": "SUCCESS",
                "date": today.isoformat(),
                "orgs_reset": 0
            }

        orgs_reset = 0
        errors = []

        for org in orgs_result.data:
            try:
                # Call get_or_create_quota to ensure today's record exists
                # This function creates a fresh record for today if it doesn't exist
                supabase.rpc("get_or_create_quota", {"p_org_id": org["id"]}).execute()
                orgs_reset += 1
            except Exception as org_error:
                errors.append(f"{org['org_slug']}: {str(org_error)}")
                logger.warning(f"Failed to reset quota for org {org['org_slug']}: {org_error}")

        logger.info(
            f"Daily quota reset complete",
            extra={
                "date": today.isoformat(),
                "orgs_reset": orgs_reset,
                "errors": len(errors)
            }
        )

        return {
            "status": "SUCCESS" if not errors else "PARTIAL",
            "date": today.isoformat(),
            "orgs_reset": orgs_reset,
            "errors": errors if errors else None
        }

    except Exception as e:
        logger.error(f"Daily quota reset failed: {e}", exc_info=True)
        return {
            "status": "FAILED",
            "date": today.isoformat(),
            "error": str(e)
        }


async def reset_monthly_quotas() -> Dict[str, Any]:
    """
    Reset monthly quota counters for all organizations via Supabase.

    This should be called on the 1st of each month at 00:00 UTC.

    The Supabase get_or_create_quota function handles monthly counter
    calculation automatically when creating new daily records.
    On the 1st of the month, new records start with pipelines_run_month = 0.

    Returns:
        Dict with reset statistics
    """
    today = get_utc_date()

    # Only run on the 1st of the month
    if today.day != 1:
        logger.warning(
            f"Monthly quota reset called on day {today.day}, skipping (should be day 1)"
        )
        return {
            "status": "SKIPPED",
            "reason": f"Not first of month (day={today.day})"
        }

    try:
        supabase = get_supabase_client()

        # Call the reset_monthly_quotas function in Supabase
        # Note: In our Supabase schema, monthly resets happen automatically
        # when get_or_create_quota creates a new record at the start of a new month
        # (it calculates pipelines_run_month from previous days in the current month)
        result = supabase.rpc("reset_monthly_quotas").execute()

        orgs_count = result.data if result.data else 0

        logger.info(
            f"Monthly quota reset complete",
            extra={
                "date": today.isoformat(),
                "orgs_with_quotas": orgs_count
            }
        )

        return {
            "status": "SUCCESS",
            "date": today.isoformat(),
            "orgs_reset": orgs_count
        }

    except Exception as e:
        logger.error(f"Monthly quota reset failed: {e}", exc_info=True)
        return {
            "status": "FAILED",
            "date": today.isoformat(),
            "error": str(e)
        }


async def reset_stale_concurrent_counts() -> Dict[str, Any]:
    """
    Reset concurrent pipeline counts that are stale via Supabase.

    This handles cases where pipelines crashed without decrementing
    the concurrent count. Any pipeline that's been "running" for more
    than 1 hour is considered stale.

    Should be called periodically (e.g., every 15 minutes).

    Note: Stale pipeline detection in BigQuery org_meta_pipeline_runs is still
    done via BigQuery since that table remains in BigQuery. Only the quota
    counters are reset via Supabase.

    Returns:
        Dict with reset statistics
    """
    from google.cloud import bigquery
    from src.core.engine.bq_client import get_bigquery_client

    today = get_utc_date()

    try:
        supabase = get_supabase_client()
        bq_client = get_bigquery_client()

        # Get all quota records with concurrent_running > 0
        # We need to check if these are actually stale
        quota_result = supabase.table("org_quotas").select(
            "id, org_id, usage_date, concurrent_running"
        ).gt("concurrent_running", 0).execute()

        if not quota_result.data:
            return {
                "status": "SUCCESS",
                "orgs_fixed": 0,
                "pipelines_marked_failed": 0
            }

        orgs_fixed = 0

        for quota in quota_result.data:
            org_id = quota["org_id"]
            usage_date = quota["usage_date"]
            current_count = quota["concurrent_running"]

            # Get org_slug for BigQuery lookup
            org_result = supabase.table("organizations").select("org_slug").eq("id", org_id).single().execute()
            if not org_result.data:
                continue
            org_slug = org_result.data["org_slug"]

            # For previous days, concurrent count should always be 0
            quota_date = datetime.strptime(usage_date, "%Y-%m-%d").date() if isinstance(usage_date, str) else usage_date
            if quota_date < today:
                actual_count = 0
            else:
                # For today, count actually running pipelines in BigQuery
                actual_query = f"""
                SELECT COUNT(*) as actual_count
                FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
                WHERE org_slug = @org_slug
                  AND status IN ('RUNNING', 'PENDING')
                  AND start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
                """

                actual_result = list(bq_client.client.query(
                    actual_query,
                    job_config=bigquery.QueryJobConfig(query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                    ])
                ).result())

                actual_count = actual_result[0]["actual_count"] if actual_result else 0

            if current_count != actual_count:
                # Fix the count in Supabase
                supabase.table("org_quotas").update({
                    "concurrent_running": actual_count,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", quota["id"]).execute()

                logger.info(
                    f"Fixed stale concurrent count for org",
                    extra={
                        "org_slug": org_slug,
                        "usage_date": str(usage_date),
                        "old_count": current_count,
                        "new_count": actual_count
                    }
                )

                orgs_fixed += 1

        # Mark stale pipelines as FAILED in BigQuery
        mark_stale_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        SET status = 'FAILED',
            end_time = CURRENT_TIMESTAMP(),
            error_message = 'Pipeline timed out (stale after 1 hour)'
        WHERE status IN ('RUNNING', 'PENDING')
          AND start_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
        """

        stale_job = bq_client.client.query(mark_stale_query)
        stale_job.result()
        pipelines_marked_failed = stale_job.num_dml_affected_rows or 0

        logger.info(
            f"Stale concurrent count reset complete",
            extra={
                "orgs_fixed": orgs_fixed,
                "pipelines_marked_failed": pipelines_marked_failed
            }
        )

        return {
            "status": "SUCCESS",
            "orgs_fixed": orgs_fixed,
            "pipelines_marked_failed": pipelines_marked_failed
        }

    except Exception as e:
        logger.error(f"Stale concurrent count reset failed: {e}", exc_info=True)
        return {
            "status": "FAILED",
            "error": str(e)
        }


async def cleanup_old_quota_records(days_to_keep: int = 90) -> Dict[str, Any]:
    """
    Clean up old quota records to prevent table bloat via Supabase.

    Keeps the last N days of quota records, deletes older ones.

    Args:
        days_to_keep: Number of days of records to retain

    Returns:
        Dict with cleanup statistics
    """
    cutoff_date = get_utc_date() - timedelta(days=days_to_keep)

    try:
        supabase = get_supabase_client()

        # Call the cleanup_old_quota_records function in Supabase
        result = supabase.rpc("cleanup_old_quota_records", {"p_days_to_keep": days_to_keep}).execute()

        rows_deleted = result.data if result.data else 0

        logger.info(
            f"Quota cleanup complete via Supabase",
            extra={
                "cutoff_date": cutoff_date.isoformat(),
                "rows_deleted": rows_deleted
            }
        )

        return {
            "status": "SUCCESS",
            "cutoff_date": cutoff_date.isoformat(),
            "rows_deleted": rows_deleted
        }

    except Exception as e:
        logger.error(f"Quota cleanup failed: {e}", exc_info=True)
        return {
            "status": "FAILED",
            "error": str(e)
        }
