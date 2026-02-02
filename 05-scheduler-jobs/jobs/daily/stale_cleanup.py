#!/usr/bin/env python3
"""
Stale Concurrent Cleanup Job (Daily Safety Net)
================================================
Fixes stuck concurrent pipeline counters across ALL organizations.

This job serves as a DAILY SAFETY NET. Most stale counters are now fixed
automatically via self-healing in the quota reservation flow:
- When an org requests a pipeline, stale counters for THAT org are cleaned up
- This eliminates the need for frequent (every 15 min) scheduled cleanup

This daily job catches edge cases:
- Orgs that haven't run pipelines recently but have stale counters
- Any counters that slipped through self-healing

Calls the API service's /api/v1/admin/quota/cleanup-stale endpoint which:
1. Finds pipelines stuck in RUNNING state for too long (all orgs)
2. Resets the concurrent_pipelines_running counters
3. Marks stale RUNNING pipelines as FAILED

Schedule: Daily at 02:00 UTC (after quota reset at 00:00 UTC)

Usage:
    python jobs/daily/stale_cleanup.py

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
    print("CloudAct Stale Concurrent Cleanup Job")
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
    endpoint = f"{api_url}/api/v1/admin/quota/cleanup-stale"

    print(f"Project:   {project_id}")
    print(f"API URL:   {api_url}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print()

    try:
        print("Calling API to cleanup stale concurrent counters...")
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
                print("✓ Stale cleanup complete")
                print(f"  Orgs processed: {result.get('orgs_processed', 0)}")
                print(f"  Orgs fixed:     {result.get('orgs_created', 0)}")
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
        print(f"✗ Stale cleanup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
