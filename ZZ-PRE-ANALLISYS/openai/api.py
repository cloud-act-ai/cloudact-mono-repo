"""
OpenAI API Module

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

BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"


def get_api_key() -> str:
    """Get OpenAI API key from environment."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY environment variable is required")
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
    response_format: Dict = None,
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
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Build messages
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    if tools:
        payload["tools"] = tools

    if response_format:
        payload["response_format"] = response_format

    # Make request
    resp = requests.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload, timeout=120)
    end_time = time.time()
    latency_ms = (end_time - start_time) * 1000

    resp.raise_for_status()
    data = resp.json()

    # Extract complete usage
    usage = data.get("usage", {})
    actual_model = data.get("model", model)

    # Token details
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", 0)

    # Detailed token breakdown (if available)
    prompt_details = usage.get("prompt_tokens_details", {})
    completion_details = usage.get("completion_tokens_details", {})

    cached_tokens = prompt_details.get("cached_tokens", 0)
    audio_tokens = prompt_details.get("audio_tokens", 0)
    reasoning_tokens = completion_details.get("reasoning_tokens", 0)

    # Calculate costs using advanced pricing
    cost_result = calculate_cost(
        provider="openai",
        model=actual_model,
        input_tokens=prompt_tokens,
        output_tokens=completion_tokens,
        cached_input_tokens=cached_tokens,
    )

    # Extract response
    choices = data.get("choices", [])
    response_text = ""
    finish_reason = ""
    tool_calls = []

    if choices:
        choice = choices[0]
        message = choice.get("message", {})
        response_text = message.get("content", "") or ""
        finish_reason = choice.get("finish_reason", "")
        tool_calls = message.get("tool_calls", [])

    # Build complete result
    result = {
        # Identifiers
        "provider": "openai",
        "request_id": data.get("id"),
        "system_fingerprint": data.get("system_fingerprint"),
        "object_type": data.get("object"),
        "created_timestamp": data.get("created"),

        # Model info
        "model": actual_model,
        "model_requested": model,

        # Token counts
        "input_tokens": prompt_tokens,
        "output_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cached_tokens": cached_tokens,
        "audio_tokens": audio_tokens,
        "reasoning_tokens": reasoning_tokens,

        # Costs (from advanced pricing)
        "total_cost_usd": cost_result["total_cost"],
        "input_cost_usd": cost_result["input_cost"],
        "output_cost_usd": cost_result["output_cost"],
        "cached_cost_usd": cost_result.get("cached_cost", 0),
        "cost_per_1m_input": cost_result.get("input_rate_per_1m", 0),
        "cost_per_1m_output": cost_result.get("output_rate_per_1m", 0),

        # Request details
        "prompt": prompt,
        "prompt_length_chars": len(prompt),
        "prompt_length_words": len(prompt.split()),
        "system_prompt": system_prompt,
        "has_system_prompt": bool(system_prompt),
        "has_tools": bool(tools),
        "has_response_format": bool(response_format),
        "max_tokens_requested": max_tokens,
        "temperature": temperature,

        # Response details
        "response": response_text,
        "response_length_chars": len(response_text),
        "response_length_words": len(response_text.split()) if response_text else 0,
        "finish_reason": finish_reason,
        "tool_calls_count": len(tool_calls),
        "choices_count": len(choices),

        # Performance
        "latency_ms": round(latency_ms, 2),
        "tokens_per_second": round(completion_tokens / (latency_ms / 1000), 2) if latency_ms > 0 else 0,

        # Context
        "context_window": cost_result.get("context_window", 0),
        "context_used_pct": round((prompt_tokens / cost_result.get("context_window", 1)) * 100, 2) if cost_result.get("context_window") else 0,

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
            "system_fingerprint": data.get("system_fingerprint"),
            "latency_ms": round(latency_ms, 2),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "has_system_prompt": bool(system_prompt),
            "has_tools": bool(tools),
            "cached_tokens": cached_tokens,
            "reasoning_tokens": reasoning_tokens,
            "finish_reason": finish_reason,
        }
    }

    return result


# ============================================================================
# Usage Fetching
# ============================================================================

def fetch_usage(start_date: str = None, end_date: str = None, limit: int = 100, bucket_width: str = "1d", group_by: List[str] = None) -> List[Dict]:
    """
    Fetch usage data from OpenAI's Usage API.

    Uses the official Usage API endpoints:
    - /v1/organization/usage/completions - for granular usage data by model
    - /v1/organization/costs - for cost data (reconciles with billing)

    Args:
        start_date: Start date (YYYY-MM-DD), defaults to 7 days ago
        end_date: End date (YYYY-MM-DD), defaults to today
        limit: Max number of buckets to return
        bucket_width: Aggregation width: '1m', '1h', or '1d' (default: '1d')
        group_by: Grouping fields: 'project_id', 'user_id', 'api_key_id', 'model', 'batch', 'service_tier'

    Requires: OPENAI_ADMIN_KEY environment variable (Admin API key)
    """
    api_key = os.getenv("OPENAI_ADMIN_KEY")
    if not api_key:
        print("[OpenAI] OPENAI_ADMIN_KEY required for Usage API.")
        print("  Get admin key: https://platform.openai.com/settings/organization/admin-keys")
        return []

    if not end_date:
        end_dt = datetime.now(timezone.utc)
    else:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    if not start_date:
        start_dt = end_dt - timedelta(days=7)
    else:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    records = []

    # 1. Fetch completions usage (granular token data by model)
    try:
        usage_url = f"{BASE_URL}/organization/usage/completions"
        params = {
            "start_time": int(start_dt.timestamp()),
            "end_time": int(end_dt.timestamp()),
            "bucket_width": bucket_width,
            "limit": limit
        }

        # Add grouping if specified (enables per-model breakdown)
        if group_by:
            params["group_by"] = group_by
        else:
            # Default: group by model for better granularity
            params["group_by"] = ["model"]

        usage_resp = requests.get(usage_url, headers=headers, params=params, timeout=30)

        if usage_resp.status_code == 200:
            data = usage_resp.json()

            for bucket in data.get("data", []):
                # Extract token counts
                input_tokens = bucket.get("input_tokens", 0)
                output_tokens = bucket.get("output_tokens", 0)
                cached_tokens = bucket.get("input_cached_tokens", 0)
                request_count = bucket.get("num_model_requests", 0)

                # Get model from grouping or default
                model = bucket.get("model", "gpt-4o-mini")
                if not model:
                    model = "gpt-4o-mini"

                # Calculate costs using pricing loader
                cost_result = calculate_cost(
                    provider="openai",
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_input_tokens=cached_tokens,
                )

                # Parse bucket timestamp
                bucket_start = bucket.get("start_time", 0)
                bucket_date = datetime.fromtimestamp(bucket_start, tz=timezone.utc).strftime("%Y-%m-%d") if bucket_start else start_dt.strftime("%Y-%m-%d")

                records.append({
                    "date": bucket_date,
                    "timestamp": bucket_start,
                    "bucket_start_time": bucket_start,
                    "bucket_end_time": bucket.get("end_time"),
                    "bucket_width": bucket_width,
                    "provider": "openai",
                    "model": model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                    "cached_tokens": cached_tokens,
                    "requests": request_count,
                    "calculated_cost_usd": cost_result["total_cost"],
                    "input_cost_usd": cost_result["input_cost"],
                    "output_cost_usd": cost_result["output_cost"],
                    "cached_cost_usd": cost_result.get("cached_cost", 0),
                    # Grouping dimensions from API
                    "project_id": bucket.get("project_id"),
                    "user_id": bucket.get("user_id"),
                    "api_key_id": bucket.get("api_key_id"),
                    "batch": bucket.get("batch"),
                    "service_tier": bucket.get("service_tier"),
                    "source": "usage_completions_api"
                })

            # Handle pagination
            if data.get("has_more"):
                print(f"[OpenAI] Fetched {len(records)} records, more available (pagination)")

        elif usage_resp.status_code == 403:
            print("[OpenAI] Access denied. Admin API key required.")
            print("  Get admin key: https://platform.openai.com/settings/organization/admin-keys")
        elif usage_resp.status_code == 404:
            print("[OpenAI] Usage API endpoint not found.")
        else:
            print(f"[OpenAI] Usage API error: {usage_resp.status_code} - {usage_resp.text[:200]}")

    except requests.exceptions.Timeout:
        print("[OpenAI] Request timeout. Try a smaller date range.")
    except Exception as e:
        print(f"[OpenAI] Error fetching usage: {e}")

    # 2. Fetch costs for reconciliation (this reconciles with billing)
    try:
        cost_url = f"{BASE_URL}/organization/costs"
        cost_params = {
            "start_time": int(start_dt.timestamp()),
            "end_time": int(end_dt.timestamp()),
            "bucket_width": "1d",  # Costs API only supports daily buckets
            "limit": limit
        }

        cost_resp = requests.get(cost_url, headers=headers, params=cost_params, timeout=30)

        if cost_resp.status_code == 200:
            cost_data = cost_resp.json()

            for bucket in cost_data.get("data", []):
                bucket_start = bucket.get("start_time", 0)
                bucket_date = datetime.fromtimestamp(bucket_start, tz=timezone.utc).strftime("%Y-%m-%d") if bucket_start else ""

                # Extract cost amount (comes as cents, convert to USD)
                amount_info = bucket.get("results", [{}])[0] if bucket.get("results") else {}
                cost_cents = amount_info.get("amount", {}).get("value", 0) if isinstance(amount_info.get("amount"), dict) else 0
                cost_usd = cost_cents / 100

                # Find matching usage records and add reported cost
                for record in records:
                    if record.get("date") == bucket_date:
                        record["reported_cost_usd"] = cost_usd
                        break
                else:
                    # If no matching usage record, add a costs-only record
                    if cost_usd > 0:
                        records.append({
                            "date": bucket_date,
                            "timestamp": bucket_start,
                            "provider": "openai",
                            "model": "aggregated",
                            "reported_cost_usd": cost_usd,
                            "source": "costs_api"
                        })

    except Exception:
        pass  # Costs API is supplementary for reconciliation

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
    return sorted([m["id"] for m in resp.json().get("data", [])])


def get_model_info(model: str = DEFAULT_MODEL) -> Dict:
    """Get model pricing and capabilities."""
    pricing = get_model_pricing("openai", model)
    if pricing:
        return {
            "model": pricing.model,
            "model_family": pricing.model_family,
            "input_per_1m": pricing.input_per_1m,
            "output_per_1m": pricing.output_per_1m,
            "context_window": pricing.context_window,
            "max_output_tokens": pricing.max_output_tokens,
            "supports_vision": pricing.supports_vision,
            "supports_audio": pricing.supports_audio,
            "supports_tools": pricing.supports_tools,
            "supports_json_mode": pricing.supports_json_mode,
        }
    return {"model": model, "error": "Pricing not found"}
