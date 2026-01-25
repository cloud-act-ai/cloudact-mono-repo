"""
Quota Reset Functions

Provides daily and monthly quota reset functionality.
Should be called by a scheduler (Cloud Scheduler, cron, etc.)
"""

import logging
from datetime import datetime, date, timedelta, timezone
from typing import Dict, Any, List
from google.cloud import bigquery

from src.app.config import settings
from src.core.engine.bq_client import get_bigquery_client

logger = logging.getLogger(__name__)


def get_utc_date() -> date:
    """Get current date in UTC timezone to ensure consistency with BigQuery."""
    return datetime.now(timezone.utc).date()


async def reset_daily_quotas() -> Dict[str, Any]:
    """
    Reset daily quota counters for all organizations.

    This should be called at 00:00 UTC daily by a scheduler.

    Creates new quota records for today with:
    - pipelines_run_today = 0
    - pipelines_failed_today = 0
    - pipelines_succeeded_today = 0
    - concurrent_pipelines_running = 0 (reset stale concurrent counts)

    Returns:
        Dict with reset statistics
    """
    bq_client = get_bigquery_client()
    today = get_utc_date()  # Use UTC date for consistency with BigQuery

    # MERGE to create new quota records OR reset existing ones for today
    # This handles both:
    # 1. Orgs that don't have a record for today yet (INSERT)
    # 2. Orgs that already have a record for today (UPDATE to reset counters)
    # BUG-008 FIX: Use CTE instead of correlated subquery for better performance
    merge_query = f"""
    MERGE `{settings.gcp_project_id}.organizations.org_usage_quotas` T
    USING (
        -- BUG-008 FIX: Pre-compute latest monthly counts for all orgs in one pass
        WITH latest_monthly AS (
            SELECT
                org_slug,
                pipelines_run_month,
                ROW_NUMBER() OVER (PARTITION BY org_slug ORDER BY usage_date DESC) as rn
            FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
            WHERE usage_date >= DATE_TRUNC(@today, MONTH)
              AND usage_date < @today
        )
        SELECT
            CONCAT(p.org_slug, '_', FORMAT_DATE('%Y%m%d', @today)) as usage_id,
            p.org_slug,
            @today as usage_date,
            -- Get monthly count from pre-computed CTE (much faster than correlated subquery)
            COALESCE(lm.pipelines_run_month, 0) as pipelines_run_month,
            s.daily_limit,
            s.monthly_limit,
            s.concurrent_limit
        FROM `{settings.gcp_project_id}.organizations.org_profiles` p
        INNER JOIN `{settings.gcp_project_id}.organizations.org_subscriptions` s
            -- FIX: Include TRIAL orgs, not just ACTIVE (matches auth.py validation)
            ON p.org_slug = s.org_slug AND s.status IN ('ACTIVE', 'TRIAL')
        LEFT JOIN latest_monthly lm
            ON p.org_slug = lm.org_slug AND lm.rn = 1
        WHERE p.status = 'ACTIVE'
    ) S
    ON T.usage_id = S.usage_id
    WHEN MATCHED THEN
        UPDATE SET
            pipelines_run_today = 0,
            pipelines_failed_today = 0,
            pipelines_succeeded_today = 0,
            concurrent_pipelines_running = 0,
            max_concurrent_reached = 0,
            daily_limit = S.daily_limit,
            monthly_limit = S.monthly_limit,
            concurrent_limit = S.concurrent_limit,
            updated_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
        INSERT (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_failed_today,
                pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
                max_concurrent_reached, daily_limit, monthly_limit, concurrent_limit,
                created_at, updated_at)
        VALUES (S.usage_id, S.org_slug, S.usage_date, 0, 0, 0, S.pipelines_run_month, 0, 0,
                S.daily_limit, S.monthly_limit, S.concurrent_limit,
                CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("today", "DATE", today)
        ]
    )

    try:
        query_job = bq_client.client.query(merge_query, job_config=job_config)
        query_job.result()

        rows_affected = query_job.num_dml_affected_rows or 0

        logger.info(
            f"Daily quota reset complete",
            extra={
                "date": today.isoformat(),
                "orgs_reset": rows_affected
            }
        )

        return {
            "status": "SUCCESS",
            "date": today.isoformat(),
            "orgs_reset": rows_affected
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
    Reset monthly quota counters for all organizations.

    This should be called on the 1st of each month at 00:00 UTC.

    Updates all quota records to set pipelines_run_month = 0

    Returns:
        Dict with reset statistics
    """
    bq_client = get_bigquery_client()
    today = get_utc_date()  # Use UTC date for consistency with BigQuery

    # Only run on the 1st of the month
    if today.day != 1:
        logger.warning(
            f"Monthly quota reset called on day {today.day}, skipping (should be day 1)"
        )
        return {
            "status": "SKIPPED",
            "reason": f"Not first of month (day={today.day})"
        }

    # Update today's records to reset monthly count
    update_query = f"""
    UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
    SET pipelines_run_month = 0,
        updated_at = CURRENT_TIMESTAMP()
    WHERE usage_date = @today
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("today", "DATE", today)
        ]
    )

    try:
        query_job = bq_client.client.query(update_query, job_config=job_config)
        query_job.result()

        rows_updated = query_job.num_dml_affected_rows or 0

        logger.info(
            f"Monthly quota reset complete",
            extra={
                "date": today.isoformat(),
                "orgs_reset": rows_updated
            }
        )

        return {
            "status": "SUCCESS",
            "date": today.isoformat(),
            "orgs_reset": rows_updated
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
    Reset concurrent pipeline counts that are stale.

    This handles cases where pipelines crashed without decrementing
    the concurrent count. Any pipeline that's been "running" for more
    than 1 hour is considered stale.

    BUG-004 FIX: Also checks previous days' quota records, not just today.
    This handles cross-midnight scenarios where a pipeline started on
    Day N but the concurrent counter was never decremented when it completed
    (or crashed) on Day N+1.

    Should be called periodically (e.g., every 15 minutes).

    Returns:
        Dict with reset statistics
    """
    bq_client = get_bigquery_client()
    today = get_utc_date()  # Use UTC date for consistency
    yesterday = today - timedelta(days=1)
    day_before = today - timedelta(days=2)

    # BUG-004 FIX: Check quotas from the last 3 days (today, yesterday, day before)
    # This handles cross-midnight scenarios where counters weren't decremented
    # Find orgs with stale concurrent counts
    # A pipeline is stale if it's been RUNNING/PENDING for > 1 hour
    query = f"""
    WITH stale_pipelines AS (
        SELECT
            org_slug,
            COUNT(*) as stale_count
        FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        WHERE status IN ('RUNNING', 'PENDING')
          AND start_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
        GROUP BY org_slug
    ),
    -- BUG-004 FIX: Check last 3 days of quota records
    recent_quotas AS (
        SELECT
            org_slug,
            usage_date,
            concurrent_pipelines_running
        FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
        WHERE usage_date IN (@today, @yesterday, @day_before)
    )
    SELECT
        q.org_slug,
        q.usage_date,
        q.concurrent_pipelines_running,
        COALESCE(s.stale_count, 0) as stale_count
    FROM recent_quotas q
    LEFT JOIN stale_pipelines s ON q.org_slug = s.org_slug
    WHERE q.concurrent_pipelines_running > 0
    """

    try:
        # BUG-004 FIX: Pass all 3 date parameters
        results = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("today", "DATE", today),
                bigquery.ScalarQueryParameter("yesterday", "DATE", yesterday),
                bigquery.ScalarQueryParameter("day_before", "DATE", day_before)
            ])
        ).result())

        orgs_fixed = 0

        for row in results:
            org_slug = row["org_slug"]
            row_usage_date = row["usage_date"]  # BUG-004 FIX: Get date from row
            current_count = row["concurrent_pipelines_running"]

            # BUG-004 FIX: For previous days, concurrent count should always be 0
            # (no pipelines should still be "running" from yesterday)
            if row_usage_date < today:
                # Reset old day's concurrent count to 0
                actual_count = 0
            else:
                # For today, calculate actual running count
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
                # Fix the count
                # BUG-004 FIX: Use row_usage_date instead of today
                update_query = f"""
                UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
                SET concurrent_pipelines_running = @actual_count,
                    updated_at = CURRENT_TIMESTAMP()
                WHERE org_slug = @org_slug AND usage_date = @usage_date
                """

                bq_client.client.query(
                    update_query,
                    job_config=bigquery.QueryJobConfig(query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("actual_count", "INT64", actual_count),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", row_usage_date)
                    ])
                ).result()

                logger.info(
                    f"Fixed stale concurrent count for org",
                    extra={
                        "org_slug": org_slug,
                        "usage_date": str(row_usage_date),
                        "old_count": current_count,
                        "new_count": actual_count
                    }
                )

                orgs_fixed += 1

        # Also mark stale pipelines as FAILED
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
    Clean up old quota records to prevent table bloat.

    Keeps the last N days of quota records, deletes older ones.

    Args:
        days_to_keep: Number of days of records to retain

    Returns:
        Dict with cleanup statistics
    """
    bq_client = get_bigquery_client()
    cutoff_date = get_utc_date() - timedelta(days=days_to_keep)

    delete_query = f"""
    DELETE FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
    WHERE usage_date < @cutoff_date
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("cutoff_date", "DATE", cutoff_date)
        ]
    )

    try:
        query_job = bq_client.client.query(delete_query, job_config=job_config)
        query_job.result()

        rows_deleted = query_job.num_dml_affected_rows or 0

        logger.info(
            f"Quota cleanup complete",
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
