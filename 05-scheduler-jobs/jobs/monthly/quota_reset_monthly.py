#!/usr/bin/env python3
"""
Monthly Quota Reset Job
=======================
Resets monthly pipeline counters for all organizations.

Calls the API service's /api/v1/admin/quota/reset-monthly endpoint which:
1. Resets pipelines_run_month to 0 for all orgs with today's quota record
2. Only runs on the 1st of the month

Run at 00:05 UTC on the 1st of each month.

Usage:
    python jobs/monthly/quota_reset_monthly.py

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
    elif project_id == "cloudact-stage":
        return "https://cloudact-api-service-stage-667076943102.us-central1.run.app"
    else:  # cloudact-testing-1
        return "https://cloudact-api-service-test-667076943102.us-central1.run.app"


async def main():
    print("=" * 60)
    print("CloudAct Monthly Quota Reset Job")
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
    endpoint = f"{api_url}/api/v1/admin/quota/reset-monthly"

    now = datetime.now(timezone.utc)
    print(f"Project:   {project_id}")
    print(f"API URL:   {api_url}")
    print(f"Timestamp: {now.isoformat()}")
    print(f"Day:       {now.day}")
    print()

    # Safety check: only run on 1st of month
    if now.day != 1:
        print(f"⊘ Skipped: Not the 1st of the month (day={now.day})")
        print("=" * 60)
        return

    try:
        print("Calling API to reset monthly quotas...")
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
                print("✓ Monthly quota reset complete")
                print(f"  Orgs processed: {result.get('orgs_processed', 0)}")
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
        print(f"✗ Monthly quota reset failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
