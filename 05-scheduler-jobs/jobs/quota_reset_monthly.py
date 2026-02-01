#!/usr/bin/env python3
"""
Monthly Quota Reset Job
=======================
Resets monthly pipeline counters for all organizations.
Run at 00:05 UTC on the 1st of each month.

Updates existing usage quota records to reset pipelines_run_month to 0.

Usage:
    python jobs/quota_reset_monthly.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
"""

import asyncio
import os
import sys
from datetime import datetime, timezone


async def main():
    print("=" * 60)
    print("CloudAct Monthly Quota Reset Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    now = datetime.now(timezone.utc)
    print(f"Project:   {project_id}")
    print(f"Timestamp: {now.isoformat()}")
    print(f"Day:       {now.day}")
    print()

    # Only run on 1st of month (safety check, scheduler should handle this)
    if now.day != 1:
        print(f"⊘ Skipped: Not the 1st of the month (day={now.day})")
        print("=" * 60)
        return

    try:
        from google.cloud import bigquery

        client = bigquery.Client(project=project_id)

        print("Resetting monthly quota counters for all active orgs...")

        # Reset pipelines_run_month to 0 for today's quota records
        update_query = f"""
        UPDATE `{project_id}.organizations.org_usage_quotas`
        SET pipelines_run_month = 0,
            updated_at = CURRENT_TIMESTAMP()
        WHERE usage_date = CURRENT_DATE()
        """

        job = client.query(update_query)
        job.result()

        # Get count of affected orgs
        count_query = f"""
        SELECT COUNT(DISTINCT org_slug) as count
        FROM `{project_id}.organizations.org_usage_quotas`
        WHERE usage_date = CURRENT_DATE()
        """
        count_result = list(client.query(count_query).result())
        orgs_reset = count_result[0].count if count_result else 0

        print()
        print(f"✓ Monthly quota reset complete")
        print(f"  Date: {now.strftime('%Y-%m-%d')}")
        print(f"  Orgs reset: {orgs_reset}")
        print("=" * 60)

    except Exception as e:
        print(f"✗ Monthly quota reset failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
