#!/usr/bin/env python3
"""
Billing Sync Job
================
Triggers the frontend billing sync endpoint to reconcile Stripe with BigQuery.

Two modes:
- retry: Process pending sync queue items (run every 5 min)
- reconcile: Full Stripe→BigQuery reconciliation (run daily)

Usage:
    python jobs/billing_sync.py retry
    python jobs/billing_sync.py reconcile

Environment:
    FRONTEND_URL: Frontend service URL (default: https://cloudact.ai)
    CRON_SECRET: Secret for authenticating cron requests
    ENVIRONMENT: test, stage, prod
"""

import asyncio
import os
import sys
import httpx


async def main():
    print("=" * 60)
    print("CloudAct Billing Sync Job")
    print("=" * 60)

    # Get action from args
    action = sys.argv[1] if len(sys.argv) > 1 else "retry"
    if action not in ("retry", "reconcile", "stats"):
        print(f"ERROR: Invalid action: {action}")
        print("  Valid actions: retry, reconcile, stats")
        sys.exit(1)

    # Environment config
    environment = os.environ.get("ENVIRONMENT", "test")
    cron_secret = os.environ.get("CRON_SECRET", "")

    # Frontend URL based on environment
    frontend_urls = {
        "test": "https://cloudact-frontend-test-553917282712.us-central1.run.app",
        "stage": "https://cloudact-frontend-stage-553917282712.us-central1.run.app",
        "prod": "https://cloudact.ai"
    }
    frontend_url = os.environ.get("FRONTEND_URL", frontend_urls.get(environment, frontend_urls["test"]))

    print(f"Environment:  {environment}")
    print(f"Frontend URL: {frontend_url}")
    print(f"Action:       {action}")
    print()

    if not cron_secret:
        print("WARNING: CRON_SECRET not set, may fail authentication")

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{frontend_url}/api/cron/billing-sync",
                headers={
                    "Content-Type": "application/json",
                    "x-cron-secret": cron_secret
                },
                json={"action": action}
            )

            print(f"Status: {response.status_code}")
            print()

            if response.status_code == 200:
                result = response.json()
                print("=" * 60)

                if action == "retry":
                    print(f"✓ Billing sync retry complete")
                    print(f"  Processed: {result.get('processed', 0)}")
                    print(f"  Succeeded: {result.get('succeeded', 0)}")
                    print(f"  Failed: {result.get('failed', 0)}")

                elif action == "reconcile":
                    print(f"✓ Billing reconciliation complete")
                    print(f"  Checked: {result.get('checked', 0)}")
                    print(f"  Synced: {result.get('synced', 0)}")
                    print(f"  Mismatches: {len(result.get('mismatches', []))}")
                    if result.get('errors'):
                        print(f"  Errors: {len(result.get('errors', []))}")
                        for err in result.get('errors', [])[:5]:
                            print(f"    - {err}")

                elif action == "stats":
                    print(f"✓ Billing sync stats")
                    print(f"  Pending: {result.get('pending', 0)}")
                    print(f"  Processing: {result.get('processing', 0)}")
                    print(f"  Failed: {result.get('failed', 0)}")

                print("=" * 60)

            elif response.status_code == 401:
                print("✗ Authentication failed - check CRON_SECRET")
                sys.exit(1)
            else:
                print(f"✗ Billing sync failed: {response.text}")
                sys.exit(1)

    except httpx.TimeoutException:
        print("✗ Request timed out")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Billing sync failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
