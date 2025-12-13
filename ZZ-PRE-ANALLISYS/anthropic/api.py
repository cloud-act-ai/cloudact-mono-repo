"""
Anthropic API Module

Traffic generation and usage fetching for Anthropic (Claude).

Environment Variables:
- ANTHROPIC_API_KEY: Standard API key for traffic generation
- ANTHROPIC_ADMIN_KEY: Admin API key for usage data (optional)

API Endpoints:
- Messages: POST /v1/messages
- Usage: GET /v1/organizations/{org_id}/usage (Admin API)

Documentation:
- API: https://docs.anthropic.com/en/api
- Admin API: https://docs.anthropic.com/en/api/admin-api
"""
import os
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from .pricing import calculate_cost

# ============================================================================
# Configuration
# ============================================================================

BASE_URL = "https://api.anthropic.com/v1"
DEFAULT_MODEL = "claude-3-haiku-20240307"  # Use haiku for testing (cheap), change to sonnet for production
ANTHROPIC_VERSION = "2023-06-01"


def get_api_key() -> str:
    """Get Anthropic API key from environment."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
    return key


def get_admin_key() -> str:
    """Get Anthropic Admin API key (for usage data)."""
    return os.getenv("ANTHROPIC_ADMIN_KEY") or os.getenv("ANTHROPIC_API_KEY")


# ============================================================================
# Traffic Generation
# ============================================================================

def generate_traffic(
    prompt: str = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 100
) -> Dict:
    """
    Generate traffic by making a Messages API request.

    Args:
        prompt: The prompt to send (if None, generates timestamped test prompt)
        model: Model to use (default: claude-3-5-sonnet-20241022)
        max_tokens: Maximum tokens in response

    Returns:
        Dict with request details and token usage
    """
    api_key = get_api_key()

    # Generate timestamped prompt if not provided
    if prompt is None:
        now = datetime.now(timezone.utc)
        timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")
        prompt = f"[Traffic Test - {timestamp_str}] Hello, this is a test request. Please respond briefly."

    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json"
    }

    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    }

    resp = requests.post(f"{BASE_URL}/messages", headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    usage = data.get("usage", {})

    result = {
        "provider": "anthropic",
        "model": data.get("model", model),
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        "request_id": data.get("id"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "prompt": prompt,
        "response": data.get("content", [{}])[0].get("text", "") if data.get("content") else "",
        "stop_reason": data.get("stop_reason"),
        "estimated_cost": calculate_cost(
            data.get("model", model),
            usage.get("input_tokens", 0),
            usage.get("output_tokens", 0),
            usage.get("cache_read_input_tokens", 0),
            usage.get("cache_creation_input_tokens", 0)
        )
    }

    return result


# ============================================================================
# Usage Fetching
# ============================================================================

def fetch_usage(
    start_date: str = None,
    end_date: str = None,
    limit: int = 100
) -> List[Dict]:
    """
    Fetch usage data from Anthropic's Admin API.

    Requires admin API key for access. Regular keys cannot fetch usage data.

    Admin API documentation:
    https://docs.anthropic.com/en/api/admin-api/get-organization-usage

    Args:
        start_date: Start date (YYYY-MM-DD), defaults to 7 days ago
        end_date: End date (YYYY-MM-DD), defaults to today
        limit: Maximum number of records

    Returns:
        List of usage records
    """
    api_key = get_admin_key()
    if not api_key:
        print("[Anthropic] No API key found")
        return []

    # Default date range: last 7 days
    if not end_date:
        end_dt = datetime.now(timezone.utc)
        end_date = end_dt.strftime("%Y-%m-%d")
    else:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")

    if not start_date:
        start_dt = end_dt - timedelta(days=7)
        start_date = start_dt.strftime("%Y-%m-%d")

    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json"
    }

    records = []

    # Try to fetch usage via Admin API
    # The Admin API endpoint is: GET /v1/organizations/{organization_id}/api_usage
    # We need to first get the organization ID

    try:
        # Attempt to get organization info first
        # Note: This requires admin key permissions
        org_resp = requests.get(
            f"{BASE_URL}/organizations",
            headers=headers,
            timeout=30
        )

        if org_resp.status_code == 200:
            orgs = org_resp.json().get("data", [])
            if orgs:
                org_id = orgs[0].get("id")

                # Fetch usage for this organization
                usage_url = f"{BASE_URL}/organizations/{org_id}/api_usage"
                params = {
                    "start_date": start_date,
                    "end_date": end_date,
                    "limit": limit
                }

                usage_resp = requests.get(usage_url, headers=headers, params=params, timeout=30)

                if usage_resp.status_code == 200:
                    usage_data = usage_resp.json()
                    for item in usage_data.get("data", []):
                        input_tokens = item.get("input_tokens", 0)
                        output_tokens = item.get("output_tokens", 0)
                        records.append({
                            "date": item.get("date", start_date),
                            "timestamp": item.get("timestamp"),
                            "model": item.get("model", "claude"),
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "total_tokens": input_tokens + output_tokens,
                            "requests": item.get("request_count", 0),
                            "cost_usd": item.get("cost_usd", 0) or calculate_cost(
                                item.get("model", "claude-3-5-sonnet-20241022"),
                                input_tokens,
                                output_tokens
                            ),
                            "source": "admin_api"
                        })
                    return records

        # If we get here, try a simpler approach
        # Try the usage endpoint directly (may not exist)
        usage_resp = requests.get(
            f"{BASE_URL}/usage",
            headers=headers,
            params={"start_date": start_date, "end_date": end_date},
            timeout=30
        )

        if usage_resp.status_code == 200:
            data = usage_resp.json()
            for item in data.get("data", data.get("usage", [])):
                input_tokens = item.get("input_tokens", 0)
                output_tokens = item.get("output_tokens", 0)
                records.append({
                    "date": item.get("date", start_date),
                    "timestamp": item.get("timestamp"),
                    "model": item.get("model", "claude"),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                    "requests": item.get("request_count", 1),
                    "cost_usd": calculate_cost(
                        item.get("model", "claude-3-5-sonnet-20241022"),
                        input_tokens,
                        output_tokens
                    ),
                    "source": "usage_api"
                })

        elif usage_resp.status_code in [403, 404]:
            print("[Anthropic] Usage API requires Admin API key.")
            print("  Admin keys: https://console.anthropic.com/settings/admin-keys")
            print("  Admin API docs: https://docs.anthropic.com/en/api/admin-api")

    except requests.exceptions.HTTPError as e:
        print(f"[Anthropic] HTTP Error: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"  Response: {e.response.text[:500]}")
    except Exception as e:
        print(f"[Anthropic] Error fetching usage: {e}")

    return records


# ============================================================================
# Utility Functions
# ============================================================================

def count_tokens(text: str) -> Dict:
    """
    Count tokens in text using Anthropic's token counting endpoint.

    Note: This is a beta feature and may not be available.
    """
    api_key = get_api_key()

    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": "token-counting-2024-11-01",
        "content-type": "application/json"
    }

    payload = {
        "model": DEFAULT_MODEL,
        "messages": [{"role": "user", "content": text}]
    }

    try:
        resp = requests.post(
            f"{BASE_URL}/messages/count_tokens",
            headers=headers,
            json=payload,
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[Anthropic] Token counting error: {e}")
        return {"error": str(e)}


def get_rate_limits() -> Optional[Dict]:
    """
    Get current rate limit status from a test request.

    Returns headers like:
    - anthropic-ratelimit-requests-limit
    - anthropic-ratelimit-requests-remaining
    - anthropic-ratelimit-tokens-limit
    - anthropic-ratelimit-tokens-remaining
    """
    api_key = get_api_key()

    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json"
    }

    # Make minimal request to get rate limit headers
    payload = {
        "model": "claude-3-haiku-20240307",  # Use cheapest model
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "Hi"}]
    }

    try:
        resp = requests.post(f"{BASE_URL}/messages", headers=headers, json=payload, timeout=30)
        resp.raise_for_status()

        rate_limits = {}
        for key, value in resp.headers.items():
            if key.lower().startswith("anthropic-ratelimit"):
                rate_limits[key] = value

        return rate_limits
    except Exception as e:
        print(f"[Anthropic] Error getting rate limits: {e}")
        return None
