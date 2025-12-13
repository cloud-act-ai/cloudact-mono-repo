"""
OpenAI API Module

Traffic generation and usage fetching for OpenAI.

Environment Variables:
- OPENAI_API_KEY: Standard API key for traffic generation
- OPENAI_ADMIN_KEY: Admin API key for usage data (optional, falls back to OPENAI_API_KEY)

API Endpoints:
- Chat Completions: POST /v1/chat/completions
- Usage/Costs: GET /v1/organization/costs (requires admin key)
"""
import os
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from .pricing import calculate_cost

# ============================================================================
# Configuration
# ============================================================================

BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"


def get_api_key() -> str:
    """Get OpenAI API key from environment."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY environment variable is required")
    return key


def get_admin_key() -> str:
    """Get OpenAI Admin API key (for usage data)."""
    return os.getenv("OPENAI_ADMIN_KEY") or os.getenv("OPENAI_API_KEY")


# ============================================================================
# Traffic Generation
# ============================================================================

def generate_traffic(
    prompt: str = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 100
) -> Dict:
    """
    Generate traffic by making a ChatCompletion request.

    Args:
        prompt: The prompt to send (if None, generates timestamped test prompt)
        model: Model to use (default: gpt-4o-mini)
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
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens
    }

    resp = requests.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    usage = data.get("usage", {})
    actual_model = data.get("model", model)

    result = {
        "provider": "openai",
        "model": actual_model,
        "input_tokens": usage.get("prompt_tokens", 0),
        "output_tokens": usage.get("completion_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
        "cached_tokens": usage.get("prompt_tokens_details", {}).get("cached_tokens", 0),
        "request_id": data.get("id"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "prompt": prompt,
        "response": data.get("choices", [{}])[0].get("message", {}).get("content", ""),
        "estimated_cost": calculate_cost(
            actual_model,
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0),
            usage.get("prompt_tokens_details", {}).get("cached_tokens", 0)
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
    Fetch usage data from OpenAI's organization costs endpoint.

    Requires admin API key for full access.
    Regular API keys may have limited or no access.

    Args:
        start_date: Start date (YYYY-MM-DD), defaults to 7 days ago
        end_date: End date (YYYY-MM-DD), defaults to today
        limit: Maximum number of records

    Returns:
        List of usage records
    """
    api_key = get_admin_key()
    if not api_key:
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
    else:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    records = []

    # Try the costs endpoint first (newer, more comprehensive)
    try:
        url = f"{BASE_URL}/organization/costs"
        params = {
            "start_time": int(start_dt.timestamp()),
            "end_time": int(end_dt.timestamp()),
            "bucket_width": "1d",
            "limit": limit
        }

        resp = requests.get(url, headers=headers, params=params, timeout=30)

        if resp.status_code == 200:
            data = resp.json()
            for bucket in data.get("data", []):
                records.append({
                    "date": datetime.fromtimestamp(bucket.get("start_time", 0)).strftime("%Y-%m-%d"),
                    "timestamp": bucket.get("start_time"),
                    "model": "aggregated",
                    "input_tokens": bucket.get("input_tokens", 0),
                    "output_tokens": bucket.get("output_tokens", 0),
                    "total_tokens": bucket.get("input_tokens", 0) + bucket.get("output_tokens", 0),
                    "requests": bucket.get("num_requests", 0),
                    "cost_usd": bucket.get("amount", {}).get("value", 0) / 100 if isinstance(bucket.get("amount"), dict) else 0,
                    "source": "costs_api"
                })
            return records

        elif resp.status_code == 403:
            print("[OpenAI] Costs API requires admin key.")
            print("  Get admin key from: https://platform.openai.com/settings/organization/admin-keys")

    except Exception as e:
        print(f"[OpenAI] Error with costs API: {e}")

    # Try the usage endpoint (legacy)
    try:
        url = f"{BASE_URL}/usage"
        params = {"date": start_date}

        resp = requests.get(url, headers=headers, params=params, timeout=30)

        if resp.status_code == 200:
            data = resp.json()
            for item in data.get("data", []):
                input_tokens = item.get("n_context_tokens_total", 0)
                output_tokens = item.get("n_generated_tokens_total", 0)
                records.append({
                    "date": start_date,
                    "timestamp": item.get("aggregation_timestamp"),
                    "model": item.get("snapshot_id", "unknown"),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                    "requests": item.get("n_requests", 0),
                    "cost_usd": calculate_cost(item.get("snapshot_id", "gpt-4o-mini"), input_tokens, output_tokens),
                    "source": "usage_api"
                })

    except Exception as e:
        print(f"[OpenAI] Error with usage API: {e}")

    return records


# ============================================================================
# Utility Functions
# ============================================================================

def list_models() -> List[str]:
    """List available models."""
    api_key = get_api_key()
    headers = {"Authorization": f"Bearer {api_key}"}

    resp = requests.get(f"{BASE_URL}/models", headers=headers, timeout=30)
    resp.raise_for_status()

    models = [m["id"] for m in resp.json().get("data", [])]
    return sorted(models)


def get_organization_info() -> Optional[Dict]:
    """Get organization information (requires admin key)."""
    api_key = get_admin_key()
    if not api_key:
        return None

    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        resp = requests.get(f"{BASE_URL}/organization", headers=headers, timeout=30)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass

    return None
