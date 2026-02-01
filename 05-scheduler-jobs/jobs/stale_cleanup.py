#!/usr/bin/env python3
"""
Stale Concurrent Cleanup Job
============================
Fixes stuck concurrent pipeline counters.
Run every 15 minutes.

Usage:
    python jobs/stale_cleanup.py

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
    print("CloudAct Stale Concurrent Cleanup Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project: {project_id}")
    print()

    try:
        from src.core.utils.quota_reset import reset_stale_concurrent_counts

        result = await reset_stale_concurrent_counts()

        status = result.get("status", "UNKNOWN")

        print()
        if status == "SUCCESS":
            print(f"✓ Stale cleanup complete")
            print(f"  Orgs fixed: {result.get('orgs_fixed', 0)}")
            print(f"  Pipelines marked failed: {result.get('pipelines_marked_failed', 0)}")
        else:
            print(f"✗ Stale cleanup failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)

        print("=" * 60)

    except Exception as e:
        print(f"✗ Stale cleanup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
