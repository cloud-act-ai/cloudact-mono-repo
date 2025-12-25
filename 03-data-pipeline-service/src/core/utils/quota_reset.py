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

    # Insert new quota records for today for all active orgs
    # Copy limits from subscriptions
    insert_query = f"""
    INSERT INTO `{settings.gcp_project_id}.organizations.org_usage_quotas`
    (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_failed_today,
     pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
     daily_limit, monthly_limit, concurrent_limit, created_at, last_updated)
    SELECT
        CONCAT(p.org_slug, '_', FORMAT_DATE('%Y%m%d', @today)) as usage_id,
        p.org_slug,
        @today as usage_date,
        0 as pipelines_run_today,
        0 as pipelines_failed_today,
        0 as pipelines_succeeded_today,
        -- Carry over monthly count from yesterday
        COALESCE(y.pipelines_run_month, 0) as pipelines_run_month,
        0 as concurrent_pipelines_running,
        s.daily_limit,
        s.monthly_limit,
        s.concurrent_limit,
        CURRENT_TIMESTAMP() as created_at,
        CURRENT_TIMESTAMP() as last_updated
    FROM `{settings.gcp_project_id}.organizations.org_profiles` p
    INNER JOIN `{settings.gcp_project_id}.organizations.org_subscriptions` s
        ON p.org_slug = s.org_slug AND s.status = 'ACTIVE'
    LEFT JOIN `{settings.gcp_project_id}.organizations.org_usage_quotas` y
        ON p.org_slug = y.org_slug AND y.usage_date = DATE_SUB(@today, INTERVAL 1 DAY)
    WHERE p.status = 'ACTIVE'
      AND NOT EXISTS (
          SELECT 1 FROM `{settings.gcp_project_id}.organizations.org_usage_quotas` e
          WHERE e.org_slug = p.org_slug AND e.usage_date = @today
      )
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("today", "DATE", today)
        ]
    )

    try:
        query_job = bq_client.client.query(insert_query, job_config=job_config)
        query_job.result()

        rows_inserted = query_job.num_dml_affected_rows or 0

        logger.info(
            f"Daily quota reset complete",
            extra={
                "date": today.isoformat(),
                "orgs_reset": rows_inserted
            }
        )

        return {
            "status": "SUCCESS",
            "date": today.isoformat(),
            "orgs_reset": rows_inserted
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
        last_updated = CURRENT_TIMESTAMP()
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

    Should be called periodically (e.g., every 15 minutes).

    Returns:
        Dict with reset statistics
    """
    bq_client = get_bigquery_client()
    today = get_utc_date()  # Use UTC date for consistency

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
    current_quotas AS (
        SELECT
            org_slug,
            concurrent_pipelines_running
        FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
        WHERE usage_date = @usage_date
    )
    SELECT
        q.org_slug,
        q.concurrent_pipelines_running,
        COALESCE(s.stale_count, 0) as stale_count
    FROM current_quotas q
    LEFT JOIN stale_pipelines s ON q.org_slug = s.org_slug
    WHERE q.concurrent_pipelines_running > 0
    """

    try:
        results = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("usage_date", "DATE", today)
            ])
        ).result())

        orgs_fixed = 0

        for row in results:
            org_slug = row["org_slug"]
            current_count = row["concurrent_pipelines_running"]
            stale_count = row.get("stale_count", 0)

            # Calculate actual running count
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
                update_query = f"""
                UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
                SET concurrent_pipelines_running = @actual_count,
                    last_updated = CURRENT_TIMESTAMP()
                WHERE org_slug = @org_slug AND usage_date = @usage_date
                """

                bq_client.client.query(
                    update_query,
                    job_config=bigquery.QueryJobConfig(query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("actual_count", "INT64", actual_count),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", today)
                    ])
                ).result()

                logger.info(
                    f"Fixed stale concurrent count for org",
                    extra={
                        "org_slug": org_slug,
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
