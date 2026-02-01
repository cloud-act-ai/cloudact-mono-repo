#!/usr/bin/env python3
"""
Stale Concurrent Cleanup Job
============================
Fixes stuck concurrent pipeline counters.

When pipelines crash mid-execution, concurrent_pipelines_running counter
doesn't get decremented. This job finds pipelines stuck in RUNNING state
for too long and resets the counters.

Run every 15 minutes.

Usage:
    python jobs/stale_cleanup.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
"""

import asyncio
import os
import sys
from datetime import datetime, timezone


async def main():
    print("=" * 60)
    print("CloudAct Stale Concurrent Cleanup Job")
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

        print("Checking for stale concurrent pipeline counters...")
        print(f"  Threshold: pipelines running > 30 minutes")
        print()

        # Query for orgs with concurrent_pipelines_running > 0 but no recent RUNNING pipelines
        query = f"""
        WITH running_pipelines AS (
            SELECT
                org_slug,
                COUNT(*) as actual_running
            FROM `{project_id}.organizations.org_meta_pipeline_runs`
            WHERE status = 'RUNNING'
              AND start_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
            GROUP BY org_slug
        ),
        current_counters AS (
            SELECT
                org_slug,
                concurrent_pipelines_running
            FROM `{project_id}.organizations.org_usage_quotas`
            WHERE usage_date = CURRENT_DATE()
              AND concurrent_pipelines_running > 0
        )
        SELECT
            c.org_slug,
            c.concurrent_pipelines_running,
            COALESCE(r.actual_running, 0) as actual_running
        FROM current_counters c
        LEFT JOIN running_pipelines r ON c.org_slug = r.org_slug
        WHERE c.concurrent_pipelines_running > COALESCE(r.actual_running, 0)
        """

        results = list(client.query(query).result())

        if not results:
            print("✓ No stale concurrent counters found")
            print("=" * 60)
            return

        print(f"Found {len(results)} org(s) with stale counters:")
        orgs_fixed = 0

        for row in results:
            org_slug = row.org_slug
            current = row.concurrent_pipelines_running
            actual = row.actual_running

            print(f"  - {org_slug}: counter={current}, actual={actual}")

            # Update the counter to match actual running pipelines
            update_query = f"""
            UPDATE `{project_id}.organizations.org_usage_quotas`
            SET concurrent_pipelines_running = @actual_running,
                updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug
              AND usage_date = CURRENT_DATE()
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("actual_running", "INT64", actual),
                ]
            )

            client.query(update_query, job_config=job_config).result()
            orgs_fixed += 1
            print(f"    → Fixed: concurrent counter set to {actual}")

        # Mark old RUNNING pipelines as FAILED
        print()
        print("Marking stale RUNNING pipelines as FAILED...")

        mark_failed_query = f"""
        UPDATE `{project_id}.organizations.org_meta_pipeline_runs`
        SET status = 'FAILED',
            error_message = 'Marked failed by stale cleanup job - no completion after 30 minutes',
            end_time = CURRENT_TIMESTAMP()
        WHERE status = 'RUNNING'
          AND start_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
        """

        result = client.query(mark_failed_query).result()
        # Note: BigQuery doesn't return rows affected easily, but the update ran

        print()
        print(f"✓ Stale cleanup complete")
        print(f"  Orgs fixed: {orgs_fixed}")
        print("=" * 60)

    except Exception as e:
        print(f"✗ Stale cleanup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
