#!/usr/bin/env python3
"""
Daily Quota Reset Job
=====================
Resets daily pipeline counters at midnight UTC.

Calls the API service's /api/v1/quota/reset-daily endpoint which:
1. Gets active orgs from BigQuery org_profiles
2. Fetches subscription limits from Supabase (source of truth for billing)
3. Creates new usage quota records in BigQuery for today
4. Carries over monthly usage from yesterday

Run at 00:00 UTC daily.

Usage:
    python jobs/daily/quota_reset_daily.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
    CA_ROOT_API_KEY: Root API key for admin authentication
    API_SERVICE_URL: API service URL (optional, defaults based on environment)
"""

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


async def main():
    print("=" * 60)
    print("CloudAct Daily Quota Reset Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    root_api_key = os.environ.get("CA_ROOT_API_KEY")
    if not root_api_key:
        print("ERROR: CA_ROOT_API_KEY environment variable required")
        sys.exit(1)

    api_url = get_api_service_url(project_id)
    endpoint = f"{api_url}/api/v1/quota/reset-daily"

    print(f"Project:   {project_id}")
    print(f"API URL:   {api_url}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print()

    try:
        print("Calling API to reset daily quotas...")
        print(f"Endpoint: POST {endpoint}")
        print()

        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                endpoint,
                headers={
                    "X-CA-Root-Key": root_api_key,
                    "Content-Type": "application/json",
                },
            )

            if response.status_code == 200:
                result = response.json()
                print("✓ Daily quota reset complete")
                print(f"  Orgs processed: {result.get('orgs_processed', 0)}")
                print(f"  Orgs created:   {result.get('orgs_created', 0)}")
                print(f"  Orgs skipped:   {result.get('orgs_skipped', 0)}")
                print(f"  Message:        {result.get('message', '')}")
            else:
                print(f"✗ API call failed with status {response.status_code}")
                print(f"  Response: {response.text}")
                sys.exit(1)

        print("=" * 60)

    except httpx.TimeoutException:
        print("✗ API call timed out after 300 seconds")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Daily quota reset failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
