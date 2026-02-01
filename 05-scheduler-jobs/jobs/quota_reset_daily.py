#!/usr/bin/env python3
"""
Daily Quota Reset Job
=====================
Resets daily pipeline counters for all organizations.
Run at 00:00 UTC daily.

Usage:
    python jobs/quota_reset_daily.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
"""

import asyncio
import os
import sys

# Add parent paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '03-data-pipeline-service'))


async def main():
    print("=" * 60)
    print("CloudAct Daily Quota Reset Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project: {project_id}")
    print()

    try:
        from src.core.utils.quota_reset import reset_daily_quotas

        result = await reset_daily_quotas()

        status = result.get("status", "UNKNOWN")
        orgs_reset = result.get("orgs_reset", 0)
        date = result.get("date", "")

        print()
        if status == "SUCCESS":
            print(f"✓ Daily quota reset complete")
            print(f"  Date: {date}")
            print(f"  Orgs reset: {orgs_reset}")
        else:
            print(f"✗ Daily quota reset failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)

        print("=" * 60)

    except Exception as e:
        print(f"✗ Daily quota reset failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
