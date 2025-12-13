"""
Gemini (Google AI) API Module

Traffic generation and usage fetching for Gemini.

Environment Variables:
- GOOGLE_API_KEY or GEMINI_API_KEY: API key for AI Studio
- GOOGLE_APPLICATION_CREDENTIALS: Service account JSON for Cloud Monitoring

API Endpoints:
- generateContent: POST /v1beta/models/{model}:generateContent
- Usage: Cloud Console or Cloud Monitoring API (for Vertex AI)

Documentation:
- AI Studio: https://ai.google.dev/docs
- Vertex AI: https://cloud.google.com/vertex-ai/docs
"""
import os
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from .pricing import calculate_cost

# ============================================================================
# Configuration
# ============================================================================

AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-2.5-flash"


def get_api_key() -> str:
    """Get Gemini/Google API key from environment."""
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required")
    return key


def get_credentials_path() -> Optional[str]:
    """Get path to service account credentials for Cloud APIs."""
    return os.getenv("GOOGLE_APPLICATION_CREDENTIALS")


# ============================================================================
# Traffic Generation
# ============================================================================

def generate_traffic(
    prompt: str = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 100
) -> Dict:
    """
    Generate traffic by making a generateContent request.

    Args:
        prompt: The prompt to send (if None, generates timestamped test prompt)
        model: Model to use (default: gemini-2.0-flash-lite)
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

    url = f"{AI_STUDIO_URL}/models/{model}:generateContent"

    headers = {"Content-Type": "application/json"}
    params = {"key": api_key}

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens}
    }

    resp = requests.post(url, headers=headers, params=params, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    usage = data.get("usageMetadata", {})

    # Extract response text
    response_text = ""
    if data.get("candidates"):
        content = data["candidates"][0].get("content", {})
        if content.get("parts"):
            response_text = content["parts"][0].get("text", "")

    result = {
        "provider": "gemini",
        "model": model,
        "input_tokens": usage.get("promptTokenCount", 0),
        "output_tokens": usage.get("candidatesTokenCount", 0),
        "total_tokens": usage.get("totalTokenCount", 0),
        "cached_tokens": usage.get("cachedContentTokenCount", 0),
        "request_id": None,  # Gemini doesn't return request ID
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "prompt": prompt,
        "response": response_text,
        "finish_reason": data.get("candidates", [{}])[0].get("finishReason"),
        "estimated_cost": calculate_cost(
            model,
            usage.get("promptTokenCount", 0),
            usage.get("candidatesTokenCount", 0),
            usage.get("cachedContentTokenCount", 0)
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
    Fetch usage data for Gemini API.

    For AI Studio (generativelanguage.googleapis.com):
    - No direct usage API available with API keys
    - Check Cloud Console: APIs & Services > Gemini API > Metrics

    For Vertex AI:
    - Requires Cloud Monitoring API access
    - Needs service account with monitoring.viewer role

    Args:
        start_date: Start date (YYYY-MM-DD), defaults to 7 days ago
        end_date: End date (YYYY-MM-DD), defaults to today
        limit: Maximum number of records

    Returns:
        List of usage records
    """
    records = []

    # Default date range
    if not end_date:
        end_dt = datetime.now(timezone.utc)
    else:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    if not start_date:
        start_dt = end_dt - timedelta(days=7)
    else:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    # Try Cloud Monitoring API if credentials available
    creds_path = get_credentials_path()

    if creds_path:
        try:
            cloud_records = _fetch_from_cloud_monitoring(start_dt, end_dt, creds_path)
            if cloud_records:
                return cloud_records
        except Exception as e:
            print(f"[Gemini] Cloud Monitoring error: {e}")

    # If no records, provide guidance
    print("[Gemini] Direct usage API not available for AI Studio.")
    print("  View usage at: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/metrics")
    print("")
    print("  For Vertex AI usage via Cloud Monitoring:")
    print("    1. Set GOOGLE_APPLICATION_CREDENTIALS to service account JSON")
    print("    2. Ensure service account has 'monitoring.viewer' role")
    print("    3. pip install google-cloud-monitoring")

    return records


def _fetch_from_cloud_monitoring(
    start_dt: datetime,
    end_dt: datetime,
    creds_path: str
) -> List[Dict]:
    """Fetch usage from Cloud Monitoring API (for Vertex AI)."""
    try:
        from google.cloud import monitoring_v3
    except ImportError:
        print("[Gemini] Install google-cloud-monitoring: pip install google-cloud-monitoring")
        return []

    # Read project ID from credentials
    with open(creds_path) as f:
        creds_data = json.load(f)
        project_id = creds_data.get("project_id")

    if not project_id:
        print("[Gemini] Could not determine project_id from credentials")
        return []

    client = monitoring_v3.MetricServiceClient()
    project_name = f"projects/{project_id}"

    interval = monitoring_v3.TimeInterval()
    interval.end_time.FromDatetime(end_dt)
    interval.start_time.FromDatetime(start_dt)

    records = []

    # Metrics to query
    metrics = [
        # Vertex AI Generative AI metrics
        "aiplatform.googleapis.com/publisher/online_serving/request_count",
        "aiplatform.googleapis.com/publisher/online_serving/consumed_throughput",
        "aiplatform.googleapis.com/publisher/online_serving/token_count",
        # General API metrics
        "serviceruntime.googleapis.com/api/request_count",
    ]

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
                model = series.metric.labels.get("model_id", series.metric.labels.get("model", "gemini"))

                for point in series.points:
                    value = point.value.int64_value or point.value.double_value or 0
                    timestamp = point.interval.end_time.ToDatetime()

                    records.append({
                        "date": timestamp.strftime("%Y-%m-%d"),
                        "timestamp": timestamp.isoformat(),
                        "model": model,
                        "metric": metric.split("/")[-1],
                        "value": value,
                        "input_tokens": value if "input" in metric.lower() else 0,
                        "output_tokens": value if "output" in metric.lower() else 0,
                        "total_tokens": value if "token" in metric.lower() else 0,
                        "requests": value if "request" in metric.lower() else 0,
                        "cost_usd": 0,  # Calculate separately based on token counts
                        "source": "cloud_monitoring"
                    })
        except Exception as e:
            # Skip metrics that don't exist
            continue

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
        models.append({
            "name": model.get("name", "").replace("models/", ""),
            "displayName": model.get("displayName"),
            "supportedGenerationMethods": model.get("supportedGenerationMethods", []),
            "inputTokenLimit": model.get("inputTokenLimit"),
            "outputTokenLimit": model.get("outputTokenLimit")
        })

    return models


def count_tokens(text: str, model: str = DEFAULT_MODEL) -> Dict:
    """Count tokens in text using Gemini's countTokens endpoint."""
    api_key = get_api_key()

    url = f"{AI_STUDIO_URL}/models/{model}:countTokens"
    params = {"key": api_key}

    payload = {
        "contents": [{"parts": [{"text": text}]}]
    }

    resp = requests.post(url, params=params, json=payload, timeout=30)
    resp.raise_for_status()

    return resp.json()


def get_model_info(model: str = DEFAULT_MODEL) -> Dict:
    """Get detailed information about a model."""
    api_key = get_api_key()

    url = f"{AI_STUDIO_URL}/models/{model}"
    params = {"key": api_key}

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()

    return resp.json()
