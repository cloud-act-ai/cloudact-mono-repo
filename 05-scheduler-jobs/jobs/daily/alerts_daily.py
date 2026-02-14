#!/usr/bin/env python3
"""
Daily Alerts Job
================
Processes cost alerts for all organizations at scheduled time.

Calls the API service's /api/v1/admin/alerts/process-all endpoint which:
1. Gets all active organizations from BigQuery
2. For each org, fetches their alert rules from org_notification_rules
3. Calculates current costs and compares against thresholds
4. Triggers notifications (email/Slack) for exceeded thresholds

Run at 08:00 UTC daily (business hours for most users).

Usage:
    python jobs/daily/alerts_daily.py                              # All orgs (scheduled)
    python jobs/daily/alerts_daily.py --org-slug acme_inc_abc123   # Single org
    python jobs/daily/alerts_daily.py --dry-run                    # Dry run (no notifications)
    python jobs/daily/alerts_daily.py --org-slug acme_inc --dry-run

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


def parse_args():
    parser = argparse.ArgumentParser(description="CloudAct Daily Alerts Job")
    parser.add_argument("--org-slug", type=str, default=None,
                        help="Process alerts for a single org (default: all orgs)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Check thresholds without sending notifications")
    return parser.parse_args()


async def main():
    args = parse_args()

    print("=" * 60)
    print("CloudAct Daily Alerts Job")
    print(f"Started at: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    # Get configuration
    project_id = os.environ.get("GCP_PROJECT_ID")
    root_api_key = os.environ.get("CA_ROOT_API_KEY")

    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable not set")
        sys.exit(1)

    if not root_api_key:
        print("ERROR: CA_ROOT_API_KEY environment variable not set")
        sys.exit(1)

    api_url = get_api_service_url(project_id)
    endpoint = f"{api_url}/api/v1/admin/alerts/process-all"

    mode = f"single-org ({args.org_slug})" if args.org_slug else "all orgs"
    print(f"Project: {project_id}")
    print(f"API URL: {api_url}")
    print(f"Endpoint: {endpoint}")
    print(f"Mode: {mode}")
    if args.dry_run:
        print("Dry run: YES (no notifications will be sent)")
    print("-" * 60)

    # Build request body
    body = {
        "alert_types": [
            "cost_threshold", "absolute_threshold",
            "budget_percent", "budget_forecast", "hierarchy_budget",
            "anomaly_percent_change", "anomaly_std_deviation",
        ],
        "send_notifications": not args.dry_run,
        "dry_run": args.dry_run,
    }
    if args.org_slug:
        body["org_slug"] = args.org_slug

    # Call the alerts processing endpoint
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            print(f"Processing alerts for {mode}...")

            response = await client.post(
                endpoint,
                headers={
                    "X-CA-Root-Key": root_api_key,
                    "Content-Type": "application/json",
                },
                json=body,
            )

            if response.status_code == 200:
                result = response.json()
                dry_label = " (DRY RUN)" if args.dry_run else ""
                print(f"\n✅ Alerts processing completed successfully!{dry_label}")
                print(f"  - Organizations processed: {result.get('orgs_processed', 0)}")
                print(f"  - Alerts triggered: {result.get('alerts_triggered', 0)}")
                print(f"  - Notifications sent: {result.get('notifications_sent', 0)}")
                print(f"  - Errors: {result.get('errors', 0)}")

                # Log any org-specific errors
                if result.get("org_errors"):
                    print("\n⚠️ Organization-specific errors:")
                    for org_error in result.get("org_errors", [])[:10]:
                        print(f"  - {org_error.get('org_slug')}: {org_error.get('error')}")

            elif response.status_code == 404:
                if args.org_slug:
                    print(f"\n⚠️ Organization '{args.org_slug}' not found or not active (404)")
                else:
                    print("\n⚠️ Alerts endpoint not found (404)")
                    print("  The /api/v1/admin/alerts/process-all endpoint is not available.")
                sys.exit(1)

            else:
                print(f"\n❌ Alerts processing failed!")
                print(f"  Status: {response.status_code}")
                print(f"  Response: {response.text[:500]}")
                sys.exit(1)

        except httpx.TimeoutException:
            print("\n❌ Request timed out after 300 seconds")
            sys.exit(1)

        except httpx.RequestError as e:
            print(f"\n❌ Request error: {e}")
            sys.exit(1)

    print("-" * 60)
    print(f"Completed at: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
