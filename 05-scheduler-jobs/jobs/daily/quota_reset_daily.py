#!/usr/bin/env python3
"""
Daily Quota Reset Job
=====================
Resets daily pipeline counters at midnight UTC.

Creates new usage quota records for each active org with reset daily counters.
Monthly counters are carried over from the previous day.

Run at 00:00 UTC daily.

Usage:
    python jobs/quota_reset_daily.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
"""

import asyncio
import os
import sys
from datetime import datetime, timezone


async def main():
    print("=" * 60)
    print("CloudAct Daily Quota Reset Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project:   {project_id}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print()

    try:
        from google.cloud import bigquery

        client = bigquery.Client(project=project_id)

        # Get all active orgs that need quota records for today
        print("Creating/resetting daily quota records for active orgs...")

        # Get active orgs with their subscription limits
        query = f"""
        WITH active_orgs AS (
            SELECT
                p.org_slug,
                s.daily_limit,
                s.monthly_limit,
                s.concurrent_limit,
                s.seat_limit,
                s.providers_limit
            FROM `{project_id}.organizations.org_profiles` p
            JOIN `{project_id}.organizations.org_subscriptions` s ON p.org_slug = s.org_slug
            WHERE p.status = 'ACTIVE'
              AND s.status = 'ACTIVE'
        ),
        existing_today AS (
            SELECT org_slug
            FROM `{project_id}.organizations.org_usage_quotas`
            WHERE usage_date = CURRENT_DATE()
        ),
        yesterday_usage AS (
            SELECT
                org_slug,
                pipelines_run_month
            FROM `{project_id}.organizations.org_usage_quotas`
            WHERE usage_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
        )
        SELECT
            a.*,
            COALESCE(y.pipelines_run_month, 0) as carry_over_monthly
        FROM active_orgs a
        LEFT JOIN existing_today e ON a.org_slug = e.org_slug
        LEFT JOIN yesterday_usage y ON a.org_slug = y.org_slug
        WHERE e.org_slug IS NULL
        """

        results = list(client.query(query).result())

        if not results:
            print("✓ All active orgs already have quota records for today")
            print("=" * 60)
            return

        print(f"Creating quota records for {len(results)} org(s)...")

        orgs_created = 0
        for row in results:
            org_slug = row.org_slug
            usage_id = f"{org_slug}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"

            insert_query = f"""
            INSERT INTO `{project_id}.organizations.org_usage_quotas`
            (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_succeeded_today,
             pipelines_failed_today, pipelines_run_month, concurrent_pipelines_running,
             daily_limit, monthly_limit, concurrent_limit, seat_limit, providers_limit,
             updated_at, created_at)
            VALUES
            (@usage_id, @org_slug, CURRENT_DATE(), 0, 0, 0, @pipelines_run_month, 0,
             @daily_limit, @monthly_limit, @concurrent_limit, @seat_limit, @providers_limit,
             CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("pipelines_run_month", "INT64", row.carry_over_monthly),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", row.daily_limit),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", row.monthly_limit),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", row.concurrent_limit),
                    bigquery.ScalarQueryParameter("seat_limit", "INT64", row.seat_limit or 2),
                    bigquery.ScalarQueryParameter("providers_limit", "INT64", row.providers_limit or 3),
                ]
            )

            client.query(insert_query, job_config=job_config).result()
            orgs_created += 1
            print(f"  ✓ {org_slug}")

        print()
        print(f"✓ Daily quota reset complete")
        print(f"  Orgs processed: {orgs_created}")
        print("=" * 60)

    except Exception as e:
        print(f"✗ Daily quota reset failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
