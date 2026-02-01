#!/usr/bin/env python3
"""
Monthly Quota Reset Job
=======================
Resets monthly pipeline counters for all organizations.
Run at 00:05 UTC on the 1st of each month.

Usage:
    python jobs/quota_reset_monthly.py

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
    print("CloudAct Monthly Quota Reset Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project: {project_id}")
    print()

    try:
        from src.core.utils.quota_reset import reset_monthly_quotas

        result = await reset_monthly_quotas()

        status = result.get("status", "UNKNOWN")

        print()
        if status == "SUCCESS":
            print(f"✓ Monthly quota reset complete")
            print(f"  Date: {result.get('date', '')}")
            print(f"  Orgs reset: {result.get('orgs_reset', 0)}")
        elif status == "SKIPPED":
            print(f"⊘ Monthly quota reset skipped: {result.get('reason', '')}")
        else:
            print(f"✗ Monthly quota reset failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)

        print("=" * 60)

    except Exception as e:
        print(f"✗ Monthly quota reset failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
