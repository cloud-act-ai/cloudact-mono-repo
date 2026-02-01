#!/usr/bin/env python3
"""
Quota Cleanup Job
=================
Deletes quota records older than 90 days to keep the table size manageable.
Run at 01:00 UTC daily.

Usage:
    python jobs/quota_cleanup.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
    DAYS_TO_KEEP: Days of records to keep (default: 90)
"""

import asyncio
import os
import sys
from datetime import datetime, timezone


async def main():
    print("=" * 60)
    print("CloudAct Quota Cleanup Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    days_to_keep = int(os.environ.get("DAYS_TO_KEEP", "90"))

    print(f"Project:      {project_id}")
    print(f"Days to keep: {days_to_keep}")
    print(f"Timestamp:    {datetime.now(timezone.utc).isoformat()}")
    print()

    try:
        from google.cloud import bigquery

        client = bigquery.Client(project=project_id)

        # Count records to be deleted first
        print(f"Checking for quota records older than {days_to_keep} days...")

        count_query = f"""
        SELECT COUNT(*) as count
        FROM `{project_id}.organizations.org_usage_quotas`
        WHERE usage_date < DATE_SUB(CURRENT_DATE(), INTERVAL @days_to_keep DAY)
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("days_to_keep", "INT64", days_to_keep),
            ]
        )

        count_result = list(client.query(count_query, job_config=job_config).result())
        rows_to_delete = count_result[0].count if count_result else 0

        print(f"  Records to delete: {rows_to_delete}")

        if rows_to_delete == 0:
            print()
            print("✓ No old quota records to delete")
            print("=" * 60)
            return

        # Delete old records
        print("  Deleting old records...")

        delete_query = f"""
        DELETE FROM `{project_id}.organizations.org_usage_quotas`
        WHERE usage_date < DATE_SUB(CURRENT_DATE(), INTERVAL @days_to_keep DAY)
        """

        client.query(delete_query, job_config=job_config).result()

        print()
        print(f"✓ Quota cleanup complete")
        print(f"  Rows deleted: {rows_to_delete}")
        print("=" * 60)

    except Exception as e:
        print(f"✗ Quota cleanup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
