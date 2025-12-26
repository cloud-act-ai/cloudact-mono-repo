"""
usage_store.py

GenAI usage storage - routes usage to correct CSV based on pricing model.
Supports PAYG (token-based) and Commitment (PTU) usage tracking.
"""
import csv
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

from .pricing_loader import get_pricing_model, get_model_pricing

# Output directory
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "output")).expanduser()
USAGE_DIR = OUTPUT_DIR / "usage"

# Usage files by pricing model
PAYG_USAGE_CSV = USAGE_DIR / "genai_payg_usage.csv"
COMMITMENT_USAGE_CSV = USAGE_DIR / "genai_commitment_usage.csv"
ALL_USAGE_CSV = USAGE_DIR / "genai_all_usage.csv"

# PAYG usage schema
PAYG_USAGE_COLUMNS = [
    "date", "time", "provider", "model", "model_family",
    "input_tokens", "output_tokens", "cached_tokens", "total_tokens",
    "cost_usd", "request_id", "org_slug", "environment", "status", "latency_ms"
]

# Commitment (PTU) usage schema - different structure
COMMITMENT_USAGE_COLUMNS = [
    "date", "provider", "deployment_name", "model", "region",
    "ptu_count", "ptu_utilisation_avg", "ptu_utilisation_p50",
    "ptu_utilisation_p90", "ptu_utilisation_p99",
    "inference_tokens", "prompt_tokens", "completion_tokens",
    "api_calls", "daily_cost_usd", "org_slug"
]

# Normalized union schema for all usage
ALL_USAGE_COLUMNS = [
    "date", "provider", "pricing_model", "model",
    "usage_quantity", "usage_unit", "cost_usd", "org_slug", "source_table"
]


def _ensure_usage_dir():
    """Ensure usage output directory exists."""
    USAGE_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_csv_header(file_path: Path, columns: List[str]) -> None:
    """Ensure CSV file has header row."""
    if not file_path.exists():
        _ensure_usage_dir()
        with file_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=columns)
            writer.writeheader()


def log_payg_usage(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    cost_usd: float = 0.0,
    request_id: str = "",
    org_slug: str = "",
    environment: str = "dev",
    status: str = "success",
    latency_ms: int = 0,
) -> None:
    """
    Log PAYG (token-based) usage event to genai_payg_usage.csv.
    """
    _ensure_csv_header(PAYG_USAGE_CSV, PAYG_USAGE_COLUMNS)

    # Get model family from pricing data
    pricing = get_model_pricing(provider, model)
    model_family = pricing.model_family if pricing else ""

    now = datetime.now(timezone.utc)
    row = {
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "provider": provider,
        "model": model,
        "model_family": model_family,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cached_tokens": cached_tokens,
        "total_tokens": input_tokens + output_tokens + cached_tokens,
        "cost_usd": round(cost_usd, 10),
        "request_id": request_id,
        "org_slug": org_slug,
        "environment": environment,
        "status": status,
        "latency_ms": latency_ms,
    }

    with PAYG_USAGE_CSV.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=PAYG_USAGE_COLUMNS)
        writer.writerow(row)


def log_commitment_usage(
    provider: str,
    deployment_name: str,
    model: str,
    region: str,
    ptu_count: int,
    ptu_utilisation_avg: float = 0.0,
    ptu_utilisation_p50: float = 0.0,
    ptu_utilisation_p90: float = 0.0,
    ptu_utilisation_p99: float = 0.0,
    inference_tokens: int = 0,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    api_calls: int = 0,
    daily_cost_usd: float = 0.0,
    org_slug: str = "",
) -> None:
    """
    Log PTU/Commitment usage event to genai_commitment_usage.csv.
    """
    _ensure_csv_header(COMMITMENT_USAGE_CSV, COMMITMENT_USAGE_COLUMNS)

    now = datetime.now(timezone.utc)
    row = {
        "date": now.strftime("%Y-%m-%d"),
        "provider": provider,
        "deployment_name": deployment_name,
        "model": model,
        "region": region,
        "ptu_count": ptu_count,
        "ptu_utilisation_avg": round(ptu_utilisation_avg, 4),
        "ptu_utilisation_p50": round(ptu_utilisation_p50, 4),
        "ptu_utilisation_p90": round(ptu_utilisation_p90, 4),
        "ptu_utilisation_p99": round(ptu_utilisation_p99, 4),
        "inference_tokens": inference_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "api_calls": api_calls,
        "daily_cost_usd": round(daily_cost_usd, 2),
        "org_slug": org_slug,
    }

    with COMMITMENT_USAGE_CSV.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COMMITMENT_USAGE_COLUMNS)
        writer.writerow(row)


def log_usage(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    metadata: Optional[Dict[str, Any]] = None
) -> None:
    """
    Auto-route usage to correct file based on provider's pricing model.
    Backward compatible with old signature.
    """
    metadata = metadata or {}
    pricing_model = get_pricing_model(provider)

    if pricing_model == "commitment":
        # PTU usage - extract PTU-specific fields
        log_commitment_usage(
            provider=provider,
            deployment_name=metadata.get("deployment_name", ""),
            model=model,
            region=metadata.get("region", ""),
            ptu_count=metadata.get("ptu_count", 0),
            ptu_utilisation_avg=metadata.get("ptu_utilisation_avg", 0),
            inference_tokens=input_tokens + output_tokens,
            prompt_tokens=input_tokens,
            completion_tokens=output_tokens,
            api_calls=1,
            daily_cost_usd=metadata.get("cost_usd", 0),
            org_slug=metadata.get("org_slug", ""),
        )
    else:
        # Default: PAYG token-based usage
        log_payg_usage(
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=metadata.get("cached_tokens", 0),
            cost_usd=metadata.get("cost_usd", 0),
            request_id=metadata.get("request_id", ""),
            org_slug=metadata.get("org_slug", ""),
            environment=metadata.get("environment", "dev"),
            status=metadata.get("status", "success"),
            latency_ms=metadata.get("latency_ms", 0),
        )


def get_payg_usage(provider: Optional[str] = None) -> List[Dict[str, Any]]:
    """Read PAYG usage events, optionally filtered by provider."""
    if not PAYG_USAGE_CSV.exists():
        return []

    events = []
    with PAYG_USAGE_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if provider and row.get("provider") != provider:
                continue
            events.append(row)

    return events


def get_commitment_usage(provider: Optional[str] = None) -> List[Dict[str, Any]]:
    """Read commitment (PTU) usage events, optionally filtered by provider."""
    if not COMMITMENT_USAGE_CSV.exists():
        return []

    events = []
    with COMMITMENT_USAGE_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if provider and row.get("provider") != provider:
                continue
            events.append(row)

    return events


def get_usage(provider: Optional[str] = None, days: int = 1) -> List[Dict[str, Any]]:
    """
    Read all usage events (PAYG + Commitment), backward compatible.
    """
    payg = get_payg_usage(provider)
    commitment = get_commitment_usage(provider)
    return payg + commitment


def get_usage_summary() -> Dict:
    """Get summary of usage data."""
    payg = get_payg_usage()
    commitment = get_commitment_usage()

    payg_providers = set(e["provider"] for e in payg)
    commitment_providers = set(e["provider"] for e in commitment)

    return {
        "payg_events": len(payg),
        "commitment_events": len(commitment),
        "payg_providers": sorted(list(payg_providers)),
        "commitment_providers": sorted(list(commitment_providers)),
        "usage_files": {
            "payg": str(PAYG_USAGE_CSV),
            "commitment": str(COMMITMENT_USAGE_CSV),
        },
    }


def clear_usage_files() -> None:
    """Clear all usage files (for testing)."""
    for f in [PAYG_USAGE_CSV, COMMITMENT_USAGE_CSV, ALL_USAGE_CSV]:
        if f.exists():
            f.unlink()
