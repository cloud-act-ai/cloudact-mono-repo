"""
Anthropic API Module

Complete usage tracking and cost calculation using advanced pricing.
"""
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from utils.pricing_loader import calculate_cost, get_model_pricing

# ============================================================================
# Configuration
# ============================================================================

BASE_URL = "https://api.anthropic.com/v1"
DEFAULT_MODEL = "claude-3-haiku-20240307"
ANTHROPIC_VERSION = "2023-06-01"


def get_api_key() -> str:
    """Get Anthropic API key from environment."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
    return key


# ============================================================================
# Traffic Generation with Complete Usage Tracking
# ============================================================================

def generate_traffic(
    prompt: str = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 100,
    temperature: float = 1.0,
    system_prompt: str = None,
    tools: List[Dict] = None,
) -> Dict:
    """
    Generate traffic with complete usage tracking.

    Returns comprehensive usage data for analysis.
    """
    api_key = get_api_key()
    start_time = time.time()

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
        "messages": [{"role": "user", "content": prompt}],
    }

    if temperature != 1.0:
        payload["temperature"] = temperature

    if system_prompt:
        payload["system"] = system_prompt

    if tools:
        payload["tools"] = tools

    # Make request
    resp = requests.post(f"{BASE_URL}/messages", headers=headers, json=payload, timeout=120)
    end_time = time.time()
    latency_ms = (end_time - start_time) * 1000

    resp.raise_for_status()
    data = resp.json()

    # Extract complete usage
    usage = data.get("usage", {})
    actual_model = data.get("model", model)

    # Token counts
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    cache_creation_tokens = usage.get("cache_creation_input_tokens", 0)
    cache_read_tokens = usage.get("cache_read_input_tokens", 0)

    # Calculate costs using advanced pricing
    cost_result = calculate_cost(
        provider="anthropic",
        model=actual_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_input_tokens=cache_read_tokens,
        cached_write_tokens=cache_creation_tokens,
    )

    # Extract response
    content = data.get("content", [])
    response_text = ""
    tool_use_count = 0

    for block in content:
        if block.get("type") == "text":
            response_text += block.get("text", "")
        elif block.get("type") == "tool_use":
            tool_use_count += 1

    stop_reason = data.get("stop_reason", "")
    stop_sequence = data.get("stop_sequence")

    # Build complete result
    result = {
        # Identifiers
        "provider": "anthropic",
        "request_id": data.get("id"),
        "object_type": data.get("type"),

        # Model info
        "model": actual_model,
        "model_requested": model,

        # Token counts
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cache_creation_tokens": cache_creation_tokens,
        "cache_read_tokens": cache_read_tokens,
        "cached_tokens": cache_read_tokens + cache_creation_tokens,

        # Costs (from advanced pricing)
        "total_cost_usd": cost_result["total_cost"],
        "input_cost_usd": cost_result["input_cost"],
        "output_cost_usd": cost_result["output_cost"],
        "cached_read_cost_usd": cost_result.get("cached_read_cost", 0),
        "cached_write_cost_usd": cost_result.get("cached_write_cost", 0),
        "cost_per_1m_input": cost_result.get("input_rate_per_1m", 0),
        "cost_per_1m_output": cost_result.get("output_rate_per_1m", 0),

        # Request details
        "prompt": prompt,
        "prompt_length_chars": len(prompt),
        "prompt_length_words": len(prompt.split()),
        "system_prompt": system_prompt,
        "has_system_prompt": bool(system_prompt),
        "has_tools": bool(tools),
        "max_tokens_requested": max_tokens,
        "temperature": temperature,

        # Response details
        "response": response_text,
        "response_length_chars": len(response_text),
        "response_length_words": len(response_text.split()) if response_text else 0,
        "finish_reason": stop_reason,
        "stop_sequence": stop_sequence,
        "tool_use_count": tool_use_count,
        "content_blocks_count": len(content),

        # Performance
        "latency_ms": round(latency_ms, 2),
        "tokens_per_second": round(output_tokens / (latency_ms / 1000), 2) if latency_ms > 0 else 0,

        # Context
        "context_window": cost_result.get("context_window", 0),
        "context_used_pct": round((input_tokens / cost_result.get("context_window", 1)) * 100, 2) if cost_result.get("context_window") else 0,

        # Timestamps
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),

        # Status
        "status": "success",
        "http_status": resp.status_code,

        # Raw data for debugging
        "raw_usage": usage,
        "raw_response": data,

        # Metadata for logging
        "metadata": {
            "request_id": data.get("id"),
            "prompt": prompt,
            "latency_ms": round(latency_ms, 2),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "has_system_prompt": bool(system_prompt),
            "has_tools": bool(tools),
            "cache_creation_tokens": cache_creation_tokens,
            "cache_read_tokens": cache_read_tokens,
            "finish_reason": stop_reason,
        }
    }

    return result


# ============================================================================
# Usage Fetching
# ============================================================================

def fetch_usage(start_date: str = None, end_date: str = None, limit: int = 100, bucket_width: str = "1d") -> List[Dict]:
    """
    Fetch usage data from Anthropic's Admin API.

    Uses the official Admin API endpoints:
    - /v1/organizations/usage_report/messages - for detailed usage metrics
    - /v1/organizations/cost_report - for cost data

    Args:
        start_date: Start date (YYYY-MM-DD), defaults to 7 days ago
        end_date: End date (YYYY-MM-DD), defaults to today
        limit: Max number of records to fetch
        bucket_width: Aggregation bucket width: '1m', '1h', or '1d' (default: '1d')

    Requires: ANTHROPIC_ADMIN_KEY (sk-ant-admin-...) environment variable
    """
    api_key = os.getenv("ANTHROPIC_ADMIN_KEY")
    if not api_key:
        print("[Anthropic] ANTHROPIC_ADMIN_KEY required for usage API.")
        print("  Get admin key: https://console.anthropic.com/settings/admin-keys")
        return []

    # Validate bucket_width
    if bucket_width not in ["1m", "1h", "1d"]:
        bucket_width = "1d"

    if not end_date:
        end_dt = datetime.now(timezone.utc)
    else:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    if not start_date:
        start_dt = end_dt - timedelta(days=7)
    else:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    # Format as ISO 8601 timestamps
    starting_at = start_dt.strftime("%Y-%m-%dT00:00:00Z")
    ending_at = end_dt.strftime("%Y-%m-%dT23:59:59Z")

    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json"
    }

    records = []

    # 1. Fetch usage report (token counts, request metrics)
    try:
        usage_url = f"{BASE_URL}/organizations/usage_report/messages"
        params = {
            "starting_at": starting_at,
            "ending_at": ending_at,
            "bucket_width": bucket_width,
            "limit": limit
        }

        usage_resp = requests.get(usage_url, headers=headers, params=params, timeout=30)

        if usage_resp.status_code == 200:
            data = usage_resp.json()

            for bucket in data.get("data", []):
                # Extract token counts
                input_tokens = bucket.get("input_tokens", 0)
                output_tokens = bucket.get("output_tokens", 0)
                cache_creation_tokens = bucket.get("cache_creation_input_tokens", 0)
                cache_read_tokens = bucket.get("cache_read_input_tokens", 0)
                request_count = bucket.get("request_count", 1)
                model = bucket.get("model", "claude-3-haiku-20240307")

                # Calculate costs using pricing loader
                cost_result = calculate_cost(
                    provider="anthropic",
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_input_tokens=cache_read_tokens,
                    cached_write_tokens=cache_creation_tokens,
                )

                # Parse bucket timestamp
                bucket_start = bucket.get("bucket_start_time", "")
                bucket_date = bucket_start[:10] if bucket_start else start_dt.strftime("%Y-%m-%d")

                records.append({
                    "date": bucket_date,
                    "timestamp": bucket_start,
                    "bucket_start_time": bucket_start,
                    "bucket_end_time": bucket.get("bucket_end_time", ""),
                    "bucket_width": bucket_width,
                    "provider": "anthropic",
                    "model": model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                    "cache_creation_tokens": cache_creation_tokens,
                    "cache_read_tokens": cache_read_tokens,
                    "requests": request_count,
                    "calculated_cost_usd": cost_result["total_cost"],
                    "input_cost_usd": cost_result["input_cost"],
                    "output_cost_usd": cost_result["output_cost"],
                    "cached_cost_usd": cost_result.get("cached_cost", 0),
                    # Grouping dimensions from API
                    "workspace_id": bucket.get("workspace_id"),
                    "api_key_id": bucket.get("api_key_id"),
                    "service_tier": bucket.get("service_tier"),
                    "source": "usage_report_api"
                })

            # Handle pagination
            next_page = data.get("next_page")
            if next_page and len(records) < limit:
                print(f"[Anthropic] Fetched {len(records)} records, more available (pagination)")

        elif usage_resp.status_code == 403:
            print("[Anthropic] Access denied. Admin API key required (sk-ant-admin-...).")
            print("  Get admin key: https://console.anthropic.com/settings/admin-keys")
        elif usage_resp.status_code == 404:
            print("[Anthropic] Usage API endpoint not found. Ensure you have admin access.")
        else:
            print(f"[Anthropic] Usage API error: {usage_resp.status_code} - {usage_resp.text[:200]}")

    except requests.exceptions.Timeout:
        print("[Anthropic] Request timeout. Try a smaller date range or increase timeout.")
    except Exception as e:
        print(f"[Anthropic] Error fetching usage: {e}")

    # 2. Optionally fetch cost report for reconciliation
    try:
        cost_url = f"{BASE_URL}/organizations/cost_report"
        cost_params = {
            "starting_at": starting_at,
            "ending_at": ending_at,
            "bucket_width": "1d",  # Cost report typically uses daily buckets
            "limit": limit
        }

        cost_resp = requests.get(cost_url, headers=headers, params=cost_params, timeout=30)

        if cost_resp.status_code == 200:
            cost_data = cost_resp.json()
            for bucket in cost_data.get("data", []):
                # Match with existing records or add cost info
                bucket_date = bucket.get("bucket_start_time", "")[:10]
                cost_usd = bucket.get("cost_usd", 0)

                # Find matching record and add reported cost
                for record in records:
                    if record.get("date") == bucket_date:
                        record["reported_cost_usd"] = cost_usd
                        break

    except Exception:
        pass  # Cost report is supplementary, don't fail if unavailable

    return records


# ============================================================================
# Utility Functions
# ============================================================================

def count_tokens(text: str) -> Dict:
    """Count tokens in text using Anthropic's token counting endpoint."""
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
        resp = requests.post(f"{BASE_URL}/messages/count_tokens", headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def get_model_info(model: str = DEFAULT_MODEL) -> Dict:
    """Get model pricing and capabilities."""
    pricing = get_model_pricing("anthropic", model)
    if pricing:
        return {
            "model": pricing.model,
            "model_family": pricing.model_family,
            "input_per_1m": pricing.input_per_1m,
            "output_per_1m": pricing.output_per_1m,
            "context_window": pricing.context_window,
            "max_output_tokens": pricing.max_output_tokens,
            "supports_vision": pricing.supports_vision,
            "supports_tools": pricing.supports_tools,
        }
    return {"model": model, "error": "Pricing not found"}
