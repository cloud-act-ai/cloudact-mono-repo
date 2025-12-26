"""
Gemini (Google AI) API Module

Complete usage tracking and cost calculation using advanced pricing.
"""
import os
import sys
import time
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from utils.pricing_loader import calculate_cost, get_model_pricing

# ============================================================================
# Configuration
# ============================================================================

AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-1.5-pro"


def get_api_key() -> str:
    """Get Gemini/Google API key from environment."""
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required")
    return key


# ============================================================================
# Traffic Generation with Complete Usage Tracking
# ============================================================================

def generate_traffic(
    prompt: str = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 100,
    temperature: float = 1.0,
    system_instruction: str = None,
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

    url = f"{AI_STUDIO_URL}/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {"key": api_key}

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature,
        }
    }

    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    if tools:
        payload["tools"] = tools

    # Make request
    resp = requests.post(url, headers=headers, params=params, json=payload, timeout=120)
    end_time = time.time()
    latency_ms = (end_time - start_time) * 1000

    resp.raise_for_status()
    data = resp.json()

    # Extract usage metadata
    usage = data.get("usageMetadata", {})

    prompt_tokens = usage.get("promptTokenCount", 0)
    candidates_tokens = usage.get("candidatesTokenCount", 0)
    total_tokens = usage.get("totalTokenCount", 0)
    cached_tokens = usage.get("cachedContentTokenCount", 0)

    # Calculate costs using advanced pricing
    cost_result = calculate_cost(
        provider="gemini",
        model=model,
        input_tokens=prompt_tokens,
        output_tokens=candidates_tokens,
        cached_input_tokens=cached_tokens,
    )

    # Extract response
    candidates = data.get("candidates", [])
    response_text = ""
    finish_reason = ""
    safety_ratings = []
    function_calls = []

    if candidates:
        candidate = candidates[0]
        content = candidate.get("content", {})
        parts = content.get("parts", [])

        for part in parts:
            if "text" in part:
                response_text += part["text"]
            elif "functionCall" in part:
                function_calls.append(part["functionCall"])

        finish_reason = candidate.get("finishReason", "")
        safety_ratings = candidate.get("safetyRatings", [])

    # Check for prompt feedback
    prompt_feedback = data.get("promptFeedback", {})
    block_reason = prompt_feedback.get("blockReason")
    safety_ratings_prompt = prompt_feedback.get("safetyRatings", [])

    # Build complete result
    result = {
        # Identifiers
        "provider": "gemini",
        "request_id": None,  # Gemini doesn't return request ID
        "model_version": data.get("modelVersion"),

        # Model info
        "model": model,
        "model_requested": model,

        # Token counts
        "input_tokens": prompt_tokens,
        "output_tokens": candidates_tokens,
        "total_tokens": total_tokens,
        "cached_tokens": cached_tokens,

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
        "system_instruction": system_instruction,
        "has_system_instruction": bool(system_instruction),
        "has_tools": bool(tools),
        "max_tokens_requested": max_tokens,
        "temperature": temperature,

        # Response details
        "response": response_text,
        "response_length_chars": len(response_text),
        "response_length_words": len(response_text.split()) if response_text else 0,
        "finish_reason": finish_reason,
        "function_calls_count": len(function_calls),
        "candidates_count": len(candidates),

        # Safety
        "safety_ratings": safety_ratings,
        "safety_ratings_prompt": safety_ratings_prompt,
        "block_reason": block_reason,
        "content_filtered": bool(block_reason),

        # Performance
        "latency_ms": round(latency_ms, 2),
        "tokens_per_second": round(candidates_tokens / (latency_ms / 1000), 2) if latency_ms > 0 else 0,

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
            "prompt": prompt,
            "latency_ms": round(latency_ms, 2),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "has_system_instruction": bool(system_instruction),
            "has_tools": bool(tools),
            "cached_tokens": cached_tokens,
            "finish_reason": finish_reason,
            "model_version": data.get("modelVersion"),
        }
    }

    return result


# ============================================================================
# Usage Fetching
# ============================================================================

def fetch_usage(start_date: str = None, end_date: str = None, limit: int = 100) -> List[Dict]:
    """
    Fetch usage for Gemini API.

    Note: AI Studio (generativelanguage.googleapis.com) doesn't have a direct usage API.
    This function attempts to get usage from:
    1. Cloud Monitoring metrics (requires google-cloud-monitoring and service account)
    2. If not available, provides guidance on checking the Cloud Console

    For Vertex AI usage, Cloud Monitoring provides token counts and request metrics.

    Requires: GOOGLE_APPLICATION_CREDENTIALS environment variable (service account JSON)
    """
    records = []

    if not end_date:
        end_dt = datetime.now(timezone.utc)
    else:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    if not start_date:
        start_dt = end_dt - timedelta(days=7)
    else:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    # Try Cloud Monitoring if credentials available
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    if creds_path:
        try:
            from google.cloud import monitoring_v3
            from google.protobuf.timestamp_pb2 import Timestamp

            with open(creds_path) as f:
                creds_data = json.load(f)
                project_id = creds_data.get("project_id")

            if project_id:
                client = monitoring_v3.MetricServiceClient()
                project_name = f"projects/{project_id}"

                # Create time interval
                interval = monitoring_v3.TimeInterval()
                end_timestamp = Timestamp()
                end_timestamp.FromDatetime(end_dt)
                start_timestamp = Timestamp()
                start_timestamp.FromDatetime(start_dt)
                interval.end_time = end_timestamp
                interval.start_time = start_timestamp

                # Gemini-specific metrics to query
                metrics = [
                    # AI Platform / Vertex AI metrics
                    "aiplatform.googleapis.com/publisher/online_serving/token_count",
                    "aiplatform.googleapis.com/publisher/online_serving/request_count",
                    "aiplatform.googleapis.com/publisher/online_serving/model_invocation_count",
                    # Generative Language API metrics (AI Studio)
                    "generativelanguage.googleapis.com/quota/generate_content_input_tokens/usage",
                    "generativelanguage.googleapis.com/quota/generate_content_output_tokens/usage",
                    "generativelanguage.googleapis.com/request_count",
                    # Service runtime metrics
                    "serviceruntime.googleapis.com/api/request_count",
                ]

                aggregated_data = {}

                for metric in metrics:
                    try:
                        results = client.list_time_series(
                            request={
                                "name": project_name,
                                "filter": f'metric.type="{metric}"',
                                "interval": interval,
                                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL
                            }
                        )

                        for series in results:
                            # Extract labels
                            model_name = (
                                series.metric.labels.get("model_id") or
                                series.metric.labels.get("model") or
                                series.resource.labels.get("model_id") or
                                "gemini-1.5-flash"
                            )
                            token_type = series.metric.labels.get("type", "")  # input, output, etc.

                            for point in series.points:
                                value = point.value.int64_value or point.value.double_value or 0
                                timestamp = point.interval.end_time.ToDatetime()
                                date_key = timestamp.strftime("%Y-%m-%d")

                                # Aggregate by date and model
                                key = f"{date_key}:{model_name}"
                                if key not in aggregated_data:
                                    aggregated_data[key] = {
                                        "date": date_key,
                                        "timestamp": timestamp.isoformat(),
                                        "provider": "gemini",
                                        "model": model_name,
                                        "input_tokens": 0,
                                        "output_tokens": 0,
                                        "requests": 0,
                                        "source": "cloud_monitoring"
                                    }

                                # Categorize metric values
                                if "input" in metric.lower() or token_type == "input":
                                    aggregated_data[key]["input_tokens"] += int(value)
                                elif "output" in metric.lower() or token_type == "output":
                                    aggregated_data[key]["output_tokens"] += int(value)
                                elif "request" in metric.lower() or "invocation" in metric.lower():
                                    aggregated_data[key]["requests"] += int(value)
                                elif "token" in metric.lower():
                                    # Generic token count - estimate split
                                    aggregated_data[key]["input_tokens"] += int(value * 0.6)
                                    aggregated_data[key]["output_tokens"] += int(value * 0.4)

                    except Exception as e:
                        # Silently continue if specific metric fails
                        continue

                # Calculate costs for aggregated data
                for key, data in aggregated_data.items():
                    cost_result = calculate_cost(
                        provider="gemini",
                        model=data["model"],
                        input_tokens=data["input_tokens"],
                        output_tokens=data["output_tokens"],
                    )
                    data["total_tokens"] = data["input_tokens"] + data["output_tokens"]
                    data["calculated_cost_usd"] = cost_result["total_cost"]
                    data["input_cost_usd"] = cost_result["input_cost"]
                    data["output_cost_usd"] = cost_result["output_cost"]
                    records.append(data)

                if records:
                    print(f"[Gemini] Fetched {len(records)} records from Cloud Monitoring")

        except ImportError:
            print("[Gemini] Install google-cloud-monitoring for usage tracking:")
            print("  pip install google-cloud-monitoring")
        except Exception as e:
            print(f"[Gemini] Cloud Monitoring error: {e}")

    if not records:
        print("[Gemini] No usage data retrieved.")
        print("  For AI Studio usage, check:")
        print("    https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/metrics")
        print("  For Vertex AI usage, check:")
        print("    https://console.cloud.google.com/vertex-ai/quotas")
        print("  Requirements:")
        print("    - GOOGLE_APPLICATION_CREDENTIALS pointing to service account JSON")
        print("    - Service account needs roles/monitoring.viewer permission")
        print("    - pip install google-cloud-monitoring")

    return records


# ============================================================================
# Utility Functions
# ============================================================================

def list_models() -> List[Dict]:
    """List available Gemini models."""
    api_key = get_api_key()
    url = f"{AI_STUDIO_URL}/models"
    params = {"key": api_key}

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()

    models = []
    for model in resp.json().get("models", []):
        methods = model.get("supportedGenerationMethods", [])
        if "generateContent" in methods:
            models.append({
                "name": model.get("name", "").replace("models/", ""),
                "displayName": model.get("displayName"),
                "inputTokenLimit": model.get("inputTokenLimit"),
                "outputTokenLimit": model.get("outputTokenLimit"),
            })

    return models


def count_tokens(text: str, model: str = DEFAULT_MODEL) -> Dict:
    """Count tokens in text using Gemini's countTokens endpoint."""
    api_key = get_api_key()
    url = f"{AI_STUDIO_URL}/models/{model}:countTokens"
    params = {"key": api_key}

    payload = {"contents": [{"parts": [{"text": text}]}]}

    resp = requests.post(url, params=params, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_model_info(model: str = DEFAULT_MODEL) -> Dict:
    """Get model pricing and capabilities."""
    pricing = get_model_pricing("gemini", model)
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
            "supports_video": pricing.supports_video,
            "supports_tools": pricing.supports_tools,
        }
    return {"model": model, "error": "Pricing not found"}
