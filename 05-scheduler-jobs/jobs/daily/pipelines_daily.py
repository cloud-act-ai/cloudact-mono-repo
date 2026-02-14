#!/usr/bin/env python3
"""
Daily Pipelines Job
===================
Runs cost pipelines for all organizations with valid integrations.

Calls the API service's /api/v1/admin/pipelines/run-all endpoint which:
1. Gets all active organizations from BigQuery
2. For each org, finds active/validated integration credentials
3. Maps provider → pipeline path, decrypts org API key
4. Triggers each pipeline via Pipeline Service (quota-aware)

Run at 06:00 UTC daily (before alerts at 08:00 so alert data is fresh).

Usage:
    python jobs/daily/pipelines_daily.py                                      # All orgs (scheduled)
    python jobs/daily/pipelines_daily.py --org-slug acme_inc_abc123           # Single org
    python jobs/daily/pipelines_daily.py --categories cloud                   # Cloud only
    python jobs/daily/pipelines_daily.py --categories genai --dry-run         # GenAI dry run
    python jobs/daily/pipelines_daily.py --org-slug acme --providers GCP_SA   # Single org + provider
    python jobs/daily/pipelines_daily.py --date 2026-02-12                    # Specific date

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
        return "https://cloudact-api-service-test-667076943102.us-central1.run.app"


def parse_args():
    parser = argparse.ArgumentParser(description="CloudAct Daily Pipelines Job")
    parser.add_argument("--org-slug", type=str, default=None,
                        help="Run pipelines for a single org (default: all orgs)")
    parser.add_argument("--categories", type=str, nargs="+", default=None,
                        help="Filter by category: cloud, genai")
    parser.add_argument("--providers", type=str, nargs="+", default=None,
                        help="Filter by provider: GCP_SA, AWS_ROLE, OPENAI, etc.")
    parser.add_argument("--date", type=str, default=None,
                        help="Pipeline run date YYYY-MM-DD (default: yesterday)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would run without triggering pipelines")
    return parser.parse_args()


async def main():
    args = parse_args()

    print("=" * 60)
    print("CloudAct Daily Pipelines Job")
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
    endpoint = f"{api_url}/api/v1/admin/pipelines/run-all"

    mode = f"single-org ({args.org_slug})" if args.org_slug else "all orgs"
    print(f"Project: {project_id}")
    print(f"API URL: {api_url}")
    print(f"Endpoint: {endpoint}")
    print(f"Mode: {mode}")
    if args.categories:
        print(f"Categories: {', '.join(args.categories)}")
    if args.providers:
        print(f"Providers: {', '.join(args.providers)}")
    if args.date:
        print(f"Date: {args.date}")
    if args.dry_run:
        print("Dry run: YES (no pipelines will be triggered)")
    print("-" * 60)

    # Build request body
    body: dict = {"dry_run": args.dry_run}
    if args.org_slug:
        body["org_slug"] = args.org_slug
    if args.categories:
        body["categories"] = args.categories
    if args.providers:
        body["providers"] = args.providers
    if args.date:
        body["date"] = args.date

    # Call the pipeline run-all endpoint
    async with httpx.AsyncClient(timeout=600.0) as client:
        try:
            print(f"Running cost pipelines for {mode}...")

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
                print(f"\n✅ Pipeline run-all completed successfully!{dry_label}")
                print(f"  - Organizations processed: {result.get('orgs_processed', 0)}")
                print(f"  - Organizations skipped: {result.get('orgs_skipped', 0)}")
                print(f"  - Pipelines triggered: {result.get('pipelines_triggered', 0)}")
                print(f"  - Pipelines failed: {result.get('pipelines_failed', 0)}")
                print(f"  - Pipelines quota-skipped: {result.get('pipelines_skipped_quota', 0)}")
                print(f"  - Total integrations: {result.get('total_integrations', 0)}")
                print(f"  - Elapsed: {result.get('elapsed_seconds', 0)}s")

                # Log any org-specific errors
                if result.get("errors"):
                    print("\n⚠️ Organization-specific errors:")
                    for org_error in result.get("errors", [])[:20]:
                        print(f"  - {org_error.get('org_slug')}: {org_error.get('error')}")

            elif response.status_code == 404:
                if args.org_slug:
                    print(f"\n⚠️ Organization '{args.org_slug}' not found or not active (404)")
                else:
                    print("\n⚠️ Pipeline run-all endpoint not found (404)")
                    print("  The /api/v1/admin/pipelines/run-all endpoint is not available.")
                sys.exit(1)

            else:
                print(f"\n❌ Pipeline run-all failed!")
                print(f"  Status: {response.status_code}")
                print(f"  Response: {response.text[:500]}")
                sys.exit(1)

        except httpx.TimeoutException:
            print("\n❌ Request timed out after 600 seconds")
            sys.exit(1)

        except httpx.RequestError as e:
            print(f"\n❌ Request error: {e}")
            sys.exit(1)

    print("-" * 60)
    print(f"Completed at: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
