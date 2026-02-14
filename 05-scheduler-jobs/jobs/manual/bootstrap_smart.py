#!/usr/bin/env python3
"""
Smart Bootstrap Job
===================
Intelligent bootstrap that auto-detects whether to run fresh bootstrap or sync.

Logic:
1. Check if organizations dataset exists via API health/status endpoint
2. If NOT exists → Run fresh bootstrap (create dataset + 21 tables)
3. If EXISTS → Run sync (add new columns to existing tables)

This consolidates bootstrap.py and bootstrap_sync.py into ONE smart job.

Usage:
    python jobs/manual/bootstrap_smart.py
    python jobs/manual/bootstrap_smart.py --force-fresh  # Force fresh bootstrap
    python jobs/manual/bootstrap_smart.py --force-sync   # Force sync only

Environment:
    GCP_PROJECT_ID: GCP Project ID
    CA_ROOT_API_KEY: Root API key for admin authentication
    API_SERVICE_URL: API service URL (optional, defaults based on environment)
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
import httpx


def get_api_service_url(project_id: str) -> str:
    """Get API service URL based on environment."""
    # Check for explicit override
    if os.environ.get("API_SERVICE_URL"):
        return os.environ["API_SERVICE_URL"]

    # Determine URL based on project
    if project_id == "cloudact-prod":
        return "https://api.cloudact.ai"
    else:  # cloudact-testing-1 (stage + test)
        return "https://cloudact-api-service-test-2adubqjovq-uc.a.run.app"


async def check_bootstrap_status(api_url: str, root_api_key: str) -> dict:
    """Check if organizations dataset exists via API."""
    endpoint = f"{api_url}/api/v1/admin/bootstrap/status"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                endpoint,
                headers={
                    "X-CA-Root-Key": root_api_key,
                },
            )

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                # Status endpoint may not exist - assume fresh needed
                return {"dataset_exists": False, "tables_count": 0}
            else:
                print(f"  Warning: Status check returned {response.status_code}")
                return {"dataset_exists": False, "tables_count": 0, "error": response.text}

        except Exception as e:
            print(f"  Warning: Status check failed: {e}")
            return {"dataset_exists": False, "tables_count": 0, "error": str(e)}


async def run_fresh_bootstrap(api_url: str, root_api_key: str) -> bool:
    """Run fresh bootstrap (create dataset + tables)."""
    endpoint = f"{api_url}/api/v1/admin/bootstrap"

    print("Running FRESH bootstrap (creating dataset + 21 tables)...")
    print(f"Endpoint: POST {endpoint}")
    print()

    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post(
            endpoint,
            headers={
                "X-CA-Root-Key": root_api_key,
                "Content-Type": "application/json",
            },
            json={
                "force_recreate_dataset": False,
                "force_recreate_tables": False
            }
        )

        if response.status_code == 200:
            result = response.json()
            print("Fresh Bootstrap Complete")
            print(f"  Status:         {result.get('status', 'UNKNOWN')}")
            print(f"  Tables created: {len(result.get('tables_created', []))}")
            print(f"  Tables existed: {len(result.get('tables_existed', []))}")
            print(f"  Total tables:   {result.get('total_tables', 0)}")
            print(f"  Message:        {result.get('message', '')}")
            return True
        elif response.status_code == 409:
            print("Dataset already exists - will run sync instead")
            return False  # Signal to run sync
        else:
            print(f"Bootstrap failed with status {response.status_code}")
            print(f"  Response: {response.text}")
            sys.exit(1)


async def run_sync_bootstrap(api_url: str, root_api_key: str) -> bool:
    """Run bootstrap sync (add new columns to existing tables)."""
    endpoint = f"{api_url}/api/v1/admin/bootstrap/sync"

    print("Running SYNC bootstrap (adding new columns to existing tables)...")
    print(f"Endpoint: POST {endpoint}")
    print()

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            endpoint,
            headers={
                "X-CA-Root-Key": root_api_key,
                "Content-Type": "application/json",
            },
            json={
                "sync_missing_tables": True,
                "sync_missing_columns": True
            }
        )

        if response.status_code == 200:
            result = response.json()
            status = result.get("status", "UNKNOWN")
            tables_created = result.get("tables_created", [])
            columns_added = result.get("columns_added", {})
            errors = result.get("errors", [])

            print(f"Sync Complete (status: {status})")
            print(f"  Tables created: {len(tables_created)}")
            if tables_created:
                for t in tables_created:
                    print(f"    + {t}")

            total_cols = sum(len(v) for v in columns_added.values())
            print(f"  Columns added:  {total_cols}")
            if columns_added:
                for table, cols in columns_added.items():
                    for col in cols:
                        print(f"    + {table}.{col}")

            if errors:
                print(f"  Errors: {len(errors)}")
                for err in errors:
                    print(f"    - {err}")

            print(f"  Message: {result.get('message', '')}")
            return True
        else:
            print(f"Sync failed with status {response.status_code}")
            print(f"  Response: {response.text}")
            sys.exit(1)


async def main():
    # Parse arguments
    parser = argparse.ArgumentParser(description="Smart Bootstrap Job")
    parser.add_argument("--force-fresh", action="store_true", help="Force fresh bootstrap")
    parser.add_argument("--force-sync", action="store_true", help="Force sync only")
    args = parser.parse_args()

    print("=" * 60)
    print("CloudAct Smart Bootstrap Job")
    print("=" * 60)

    # Get configuration
    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    root_api_key = os.environ.get("CA_ROOT_API_KEY")
    if not root_api_key:
        print("ERROR: CA_ROOT_API_KEY environment variable required")
        sys.exit(1)

    api_url = get_api_service_url(project_id)

    print(f"Project:   {project_id}")
    print(f"API URL:   {api_url}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")

    if args.force_fresh:
        print(f"Mode:      FORCE FRESH")
    elif args.force_sync:
        print(f"Mode:      FORCE SYNC")
    else:
        print(f"Mode:      AUTO-DETECT")
    print()

    try:
        if args.force_fresh:
            # User forced fresh bootstrap
            print("=" * 60)
            await run_fresh_bootstrap(api_url, root_api_key)

        elif args.force_sync:
            # User forced sync only
            print("=" * 60)
            await run_sync_bootstrap(api_url, root_api_key)

        else:
            # Auto-detect mode
            print("Checking bootstrap status...")
            status = await check_bootstrap_status(api_url, root_api_key)

            dataset_exists = status.get("dataset_exists", False)
            tables_count = status.get("tables_count", 0)

            print(f"  Dataset exists: {dataset_exists}")
            print(f"  Tables count:   {tables_count}")
            print()

            print("=" * 60)

            if not dataset_exists or tables_count == 0:
                # Fresh bootstrap needed
                print("Decision: FRESH BOOTSTRAP (no existing data)")
                print()
                success = await run_fresh_bootstrap(api_url, root_api_key)

                # If bootstrap returned 409 (already exists), run sync
                if not success:
                    print()
                    print("=" * 60)
                    print("Decision: Running SYNC after bootstrap conflict")
                    print()
                    await run_sync_bootstrap(api_url, root_api_key)
            else:
                # Sync existing tables
                print("Decision: SYNC (existing data found)")
                print()
                await run_sync_bootstrap(api_url, root_api_key)

        print()
        print("=" * 60)
        print("Smart Bootstrap Complete")
        print("=" * 60)

    except httpx.TimeoutException:
        print("API call timed out")
        sys.exit(1)
    except Exception as e:
        print(f"Bootstrap failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
