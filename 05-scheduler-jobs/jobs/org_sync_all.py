#!/usr/bin/env python3
"""
Org Sync All Job
================
Syncs ALL organization datasets by looping through active orgs.
Adds new tables/columns to each org's dataset.

Usage:
    python jobs/org_sync_all.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
"""

import asyncio
import os
import sys

# Add parent paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '02-api-service'))


async def main():
    print("=" * 60)
    print("CloudAct Org Sync All Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project: {project_id}")
    print()

    try:
        from google.cloud import bigquery

        client = bigquery.Client(project=project_id)

        # Get all active orgs
        query = f"""
            SELECT org_slug
            FROM `{project_id}.organizations.org_profiles`
            WHERE status = 'ACTIVE'
            ORDER BY org_slug
        """

        print("Fetching active organizations...")
        results = list(client.query(query).result())
        print(f"Found {len(results)} active organizations")
        print()

        if not results:
            print("No active organizations found")
            sys.exit(0)

        # Import sync function
        from src.core.services._shared.org_sync import sync_one_org_dataset

        success = 0
        failed = 0
        failed_orgs = []

        for row in results:
            org_slug = row.org_slug
            try:
                await sync_one_org_dataset(org_slug)
                print(f"  ✓ {org_slug}")
                success += 1
            except Exception as e:
                print(f"  ✗ {org_slug}: {e}")
                failed += 1
                failed_orgs.append(org_slug)

        print()
        print("=" * 60)
        print(f"Sync complete: {success} success, {failed} failed")

        if failed_orgs:
            print(f"Failed orgs: {', '.join(failed_orgs)}")
            sys.exit(1)

    except Exception as e:
        print(f"✗ Org sync failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
