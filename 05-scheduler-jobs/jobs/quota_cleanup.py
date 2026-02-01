#!/usr/bin/env python3
"""
Quota Cleanup Job
=================
Deletes quota records older than 90 days.
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

# Add parent paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '03-data-pipeline-service'))


async def main():
    print("=" * 60)
    print("CloudAct Quota Cleanup Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    days_to_keep = int(os.environ.get("DAYS_TO_KEEP", "90"))

    print(f"Project: {project_id}")
    print(f"Days to keep: {days_to_keep}")
    print()

    try:
        from src.core.utils.quota_reset import cleanup_old_quota_records

        result = await cleanup_old_quota_records(days_to_keep=days_to_keep)

        status = result.get("status", "UNKNOWN")

        print()
        if status == "SUCCESS":
            print(f"✓ Quota cleanup complete")
            print(f"  Cutoff date: {result.get('cutoff_date', '')}")
            print(f"  Rows deleted: {result.get('rows_deleted', 0)}")
        else:
            print(f"✗ Quota cleanup failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)

        print("=" * 60)

    except Exception as e:
        print(f"✗ Quota cleanup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
