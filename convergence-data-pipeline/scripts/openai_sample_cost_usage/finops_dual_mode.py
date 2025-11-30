#!/usr/bin/env python3
"""
finops_dual_mode.py

Single script, single API key.

- Auto-detects if the key has ORG usage/cost access.
- If ORG access:
    * Runs ORG MODE:
        - Fetch org usage:
            /v1/organization/usage/completions
            /v1/organization/usage/embeddings
            /v1/organization/usage/images
        - Fetch org costs:
            /v1/organization/costs
        - Uses advanced token fields to estimate cost per row:
            input_tokens, input_cached_tokens, output_tokens
        - Writes:
            finops_org_usage_daily_YYYY-MM-DD.csv
            finops_org_cost_daily_YYYY-MM-DD.csv
            finops_all_YYYY-MM-DD.csv

- If NO ORG access (personal / normal key):
    * Runs PERSONAL MODE:
        - Makes a single /v1/chat/completions call
        - Reads usage, including:
            prompt_tokens, completion_tokens,
            prompt_tokens_details.cached_tokens
        - Estimates cost with caching-aware breakdown
        - Writes:
            finops_personal_calls_YYYY-MM-DD.csv
            finops_all_YYYY-MM-DD.csv

Environment variables:

    OPENAI_API_KEY   (required)
    REPORT_DAYS      (optional, default 1)   # only used for ORG mode
    OUTPUT_DIR       (optional, default ".")
"""

import os
import csv
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

import requests

BASE_URL = "https://api.openai.com/v1"

# ---------------------------------------------------------------------
#  Pricing table (approximate – UPDATE with current official pricing)
# ---------------------------------------------------------------------
MODEL_PRICING_PER_1K: Dict[str, Dict[str, float]] = {
    # Example values – replace with your actual OpenAI pricing.
    "gpt-4o": {
        "input": 0.005,
        "output": 0.015,
        # "cached_input": 0.0025,  # if you know a cheaper cached rate
    },
    "gpt-4o-mini": {
        "input": 0.00015,
        "output": 0.0006,
        "cached_input": 0.000075,  # example: half price for cached tokens
    },
    "o1-mini": {
        "input": 0.003,
        "output": 0.012,
    },
    # Add more base model names if needed...
}


# ---------------------------------------------------------------------
#  Config helpers
# ---------------------------------------------------------------------
def get_api_key() -> str:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY environment variable is required.")
    return key


def get_output_dir() -> Path:
    path = Path(os.getenv("OUTPUT_DIR", ".")).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_report_days() -> int:
    try:
        return int(os.getenv("REPORT_DAYS", "1"))
    except ValueError:
        return 1


def get_date_range(days: int) -> Tuple[int, int, str, str]:
    now = datetime.now(timezone.utc)
    end_dt = now
    start_dt = (now - timedelta(days=days)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start_ts = int(start_dt.timestamp())
    end_ts = int(end_dt.timestamp())
    return start_ts, end_ts, start_dt.date().isoformat(), end_dt.date().isoformat()


def headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {get_api_key()}",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------
#  Helper: normalize model name (strip date suffix for pricing lookup)
# ---------------------------------------------------------------------
def base_model_name(model: Optional[str]) -> str:
    """
    Map full model IDs like 'gpt-4o-mini-2024-07-18' to 'gpt-4o-mini' for pricing.
    If derived base name not found, fall back to full name.
    """
    if not model:
        return ""
    if model in MODEL_PRICING_PER_1K:
        return model
    parts = model.split("-")
    # crude heuristic: last 3 parts look like YYYY-MM-DD
    if len(parts) >= 4:
        candidate = "-".join(parts[:-3])
        if candidate in MODEL_PRICING_PER_1K:
            return candidate
    return model


# ---------------------------------------------------------------------
#  Cost estimation helpers (advanced, caching-aware)
# ---------------------------------------------------------------------
def estimate_cost_breakdown(
    model: str,
    input_tokens: float,
    output_tokens: float,
    cached_input_tokens: float = 0.0,
) -> Dict[str, float]:
    """
    Use advanced columns to derive cost:

    - input_tokens           (total prompt tokens)
    - output_tokens          (completion tokens)
    - cached_input_tokens    (prompt tokens served from cache)

    Returns:
    - estimated_input_cost_usd
    - estimated_cached_input_cost_usd
    - estimated_output_cost_usd
    - estimated_total_cost_usd
    """
    model_key = base_model_name(model)
    pricing = MODEL_PRICING_PER_1K.get(model_key)
    if not pricing:
        return {
            "estimated_input_cost_usd": 0.0,
            "estimated_cached_input_cost_usd": 0.0,
            "estimated_output_cost_usd": 0.0,
            "estimated_total_cost_usd": 0.0,
        }

    input_rate = float(pricing.get("input", 0.0))
    output_rate = float(pricing.get("output", 0.0))
    cached_rate = float(pricing.get("cached_input", input_rate))

    non_cached_input = max(float(input_tokens) - float(cached_input_tokens), 0.0)
    cached_input = float(cached_input_tokens)
    out_tokens = float(output_tokens)

    input_cost = (non_cached_input / 1000.0) * input_rate
    cached_cost = (cached_input / 1000.0) * cached_rate
    output_cost = (out_tokens / 1000.0) * output_rate
    total = input_cost + cached_cost + output_cost

    return {
        "estimated_input_cost_usd": round(input_cost, 10),
        "estimated_cached_input_cost_usd": round(cached_cost, 10),
        "estimated_output_cost_usd": round(output_cost, 10),
        "estimated_total_cost_usd": round(total, 10),
    }


# ---------------------------------------------------------------------
#  CSV helpers
# ---------------------------------------------------------------------
def collect_fieldnames(rows: List[Dict[str, Any]]) -> List[str]:
    fieldnames: List[str] = []
    seen = set()
    for row in rows:
        for k in row.keys():
            if k not in seen:
                seen.add(k)
                fieldnames.append(k)
    return fieldnames


def write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        fieldnames = ["note"]
        rows = [{"note": "no rows"}]
    else:
        fieldnames = collect_fieldnames(rows)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


# ---------------------------------------------------------------------
#  ORG MODE: usage + costs APIs
# ---------------------------------------------------------------------
def _get_with_params(path: str, params_list: List[Tuple[str, Any]]) -> requests.Response:
    url = f"{BASE_URL}{path}"
    return requests.get(url, headers=headers(), params=params_list, timeout=60)


def has_org_access() -> bool:
    """
    Lightweight check: try a tiny /organization/usage/completions call.
    If 200: treat key as org-capable. If 401/403: no org access.
    """
    now = datetime.now(timezone.utc)
    end_ts = int(now.timestamp())
    start_ts = int((now - timedelta(hours=1)).timestamp())

    params_list: List[Tuple[str, Any]] = [
        ("start_time", start_ts),
        ("end_time", end_ts),
        ("bucket_width", "1h"),
        ("limit", 1),
        ("group_by", "model"),
    ]
    resp = _get_with_params("/organization/usage/completions", params_list)
    if resp.status_code == 200:
        print("[DETECT] ORG usage endpoint is accessible (status 200).")
        return True
    if resp.status_code in (401, 403):
        print(f"[DETECT] No org usage access (status {resp.status_code}).")
        return False
    print(f"[DETECT] Unexpected status for org usage test: {resp.status_code}")
    return False


def fetch_org_usage(days: int) -> List[Dict[str, Any]]:
    """
    Returns flattened org usage rows (completions, embeddings, images).
    """
    print(f"[ORG] Fetching usage for last {days} days...")
    start_ts, end_ts, _, _ = get_date_range(days)

    base_params = {
        "start_time": start_ts,
        "end_time": end_ts,
        "bucket_width": "1d",
        "limit": days + 1,
    }

    def fetch(endpoint: str, usage_type: str) -> List[Dict[str, Any]]:
        params_list: List[Tuple[str, Any]] = list(base_params.items())
        for g in ["model", "api_key_id", "project_id"]:
            params_list.append(("group_by", g))

        resp = _get_with_params(endpoint, params_list)
        resp.raise_for_status()
        data = resp.json().get("data", [])
        rows: List[Dict[str, Any]] = []
        for bucket in data:
            start_time = bucket.get("start_time")
            if start_time is None:
                continue
            date_str = datetime.fromtimestamp(
                start_time, tz=timezone.utc
            ).date().isoformat()
            for r in bucket.get("results", []):
                model = r.get("model")
                input_tokens = float(r.get("input_tokens", 0.0))
                output_tokens = float(r.get("output_tokens", 0.0))
                cached_input_tokens = float(r.get("input_cached_tokens", 0.0))

                breakdown = estimate_cost_breakdown(
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_input_tokens=cached_input_tokens,
                )

                row: Dict[str, Any] = {
                    "category": "org_usage",
                    "date": date_str,
                    "usage_type": usage_type,
                    "model": model,
                    "project_id": r.get("project_id"),
                    "user_id": r.get("user_id"),
                    "api_key_id": r.get("api_key_id"),
                    "request_path": r.get("request_path"),
                    "input_tokens": int(input_tokens),
                    "output_tokens": int(output_tokens),
                    "cached_input_tokens": int(cached_input_tokens),
                    "num_requests": int(r.get("num_model_requests", 0)),
                }
                row.update(breakdown)
                rows.append(row)
        return rows

    completions_rows = fetch("/organization/usage/completions", "completions")
    embeddings_rows = fetch("/organization/usage/embeddings", "embeddings")
    images_rows = fetch("/organization/usage/images", "images")

    all_rows = completions_rows + embeddings_rows + images_rows
    print(f"[ORG] Collected {len(all_rows)} org_usage rows.")
    return all_rows


def fetch_org_costs(days: int) -> List[Dict[str, Any]]:
    """
    Returns flattened org cost rows.
    """
    print(f"[ORG] Fetching costs for last {days} days...")
    start_ts, end_ts, _, _ = get_date_range(days)
    base_params = {
        "start_time": start_ts,
        "end_time": end_ts,
        "bucket_width": "1d",
        "limit": min(days + 1, 180),
    }
    params_list: List[Tuple[str, Any]] = list(base_params.items())
    params_list.append(("group_by", "line_item"))
    params_list.append(("group_by", "project_id"))

    resp = _get_with_params("/organization/costs", params_list)
    resp.raise_for_status()
    data = resp.json().get("data", [])
    rows: List[Dict[str, Any]] = []
    for bucket in data:
        start_time = bucket.get("start_time")
        if start_time is None:
            continue
        date_str = datetime.fromtimestamp(
            start_time, tz=timezone.utc
        ).date().isoformat()
        for r in bucket.get("results", []):
            amount = r.get("amount", {})
            row: Dict[str, Any] = {
                "category": "org_cost",
                "date": date_str,
                "line_item": r.get("line_item"),
                "project_id": r.get("project_id"),
                "cost_usd": float(amount.get("value", 0.0)),
                "currency": amount.get("currency", "usd"),
            }
            rows.append(row)
    print(f"[ORG] Collected {len(rows)} org_cost rows.")
    return rows


# ---------------------------------------------------------------------
#  PERSONAL MODE: just one chat completion, advanced usage + cost
# ---------------------------------------------------------------------
def run_personal_mode() -> List[Dict[str, Any]]:
    """
    Makes a single ChatCompletion call and logs advanced usage + cost.
    Uses:
      - usage.prompt_tokens
      - usage.completion_tokens
      - usage.prompt_tokens_details.cached_tokens
    """
    print("[PERSONAL] Running personal-mode test call...")

    url = f"{BASE_URL}/chat/completions"
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "user", "content": "Hello – test personal mode advanced usage."}
        ],
    }

    resp = requests.post(url, headers=headers(), json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    usage = data.get("usage", {}) or {}
    model = data.get("model", payload.get("model"))

    prompt_tokens = float(usage.get("prompt_tokens", 0))
    completion_tokens = float(usage.get("completion_tokens", 0))
    total_tokens = float(usage.get("total_tokens", prompt_tokens + completion_tokens))

    prompt_details = usage.get("prompt_tokens_details", {}) or {}
    completion_details = usage.get("completion_tokens_details", {}) or {}

    cached_tokens = float(prompt_details.get("cached_tokens", 0))
    audio_prompt_tokens = float(prompt_details.get("audio_tokens", 0))
    reasoning_tokens = float(completion_details.get("reasoning_tokens", 0))
    audio_completion_tokens = float(completion_details.get("audio_tokens", 0))

    breakdown = estimate_cost_breakdown(
        model=model,
        input_tokens=prompt_tokens,
        output_tokens=completion_tokens,
        cached_input_tokens=cached_tokens,
    )

    row: Dict[str, Any] = {
        "category": "personal_call",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "endpoint": "/chat/completions",
        "prompt_tokens": int(prompt_tokens),
        "completion_tokens": int(completion_tokens),
        "total_tokens": int(total_tokens),
        "prompt_cached_tokens": int(cached_tokens),
        "prompt_audio_tokens": int(audio_prompt_tokens),
        "completion_reasoning_tokens": int(reasoning_tokens),
        "completion_audio_tokens": int(audio_completion_tokens),
        "request_id": data.get("id"),
    }
    row.update(breakdown)

    print(
        "[PERSONAL] Cost breakdown:\n"
        f"  model={model}\n"
        f"  prompt_tokens={prompt_tokens}, completion_tokens={completion_tokens}\n"
        f"  cached_prompt_tokens={cached_tokens}\n"
        f"  estimated_input_cost_usd={breakdown['estimated_input_cost_usd']}\n"
        f"  estimated_cached_input_cost_usd={breakdown['estimated_cached_input_cost_usd']}\n"
        f"  estimated_output_cost_usd={breakdown['estimated_output_cost_usd']}\n"
        f"  estimated_total_cost_usd={breakdown['estimated_total_cost_usd']}"
    )

    return [row]


# ---------------------------------------------------------------------
#  MAIN
# ---------------------------------------------------------------------
def main() -> None:
    try:
        _ = get_api_key()
    except RuntimeError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    out_dir = get_output_dir()
    today_str = datetime.now(timezone.utc).date().isoformat()
    days = get_report_days()

    print(f"[INFO] OUTPUT_DIR={out_dir}")
    print(f"[INFO] REPORT_DAYS={days}")
    print("[INFO] Detecting key capabilities...")

    all_rows: List[Dict[str, Any]] = []

    if has_org_access():
        # ORG MODE
        print("[MODE] Running in ORG MODE (usage + costs).")
        org_usage_rows = fetch_org_usage(days)
        org_cost_rows = fetch_org_costs(days) if org_usage_rows else []

        all_rows.extend(org_usage_rows)
        all_rows.extend(org_cost_rows)

        # per-category files
        if org_usage_rows:
            usage_path = out_dir / f"finops_org_usage_daily_{today_str}.csv"
            write_csv(usage_path, org_usage_rows)
            print(f"[OUT] org_usage_daily -> {usage_path}")
        else:
            print("[OUT] No org_usage rows (possibly no data yet).")

        if org_cost_rows:
            cost_path = out_dir / f"finops_org_cost_daily_{today_str}.csv"
            write_csv(cost_path, org_cost_rows)
            print(f"[OUT] org_cost_daily -> {cost_path}")
        else:
            print("[OUT] No org_cost rows (costs may be delayed).")

        # simple summary
        total_org_estimated = sum(
            r.get("estimated_total_cost_usd", 0.0) for r in org_usage_rows
        )
        total_org_billed = sum(
            r.get("cost_usd", 0.0) for r in org_cost_rows
        )
        print("\n=== ORG COST SUMMARY (approximate) ===")
        print(f"Estimated cost from usage (window): {total_org_estimated:.6f} USD")
        print(f"Billed cost from /organization/costs (window): {total_org_billed:.6f} USD")
        print("Note: usage-based estimates vs billed cost may differ due to pricing changes, rounding, and processing delay.")

    else:
        # PERSONAL MODE
        print("[MODE] Running in PERSONAL MODE (no org endpoints).")
        personal_rows = run_personal_mode()
        all_rows.extend(personal_rows)

        if personal_rows:
            personal_path = out_dir / f"finops_personal_calls_{today_str}.csv"
            write_csv(personal_path, personal_rows)
            print(f"[OUT] personal_calls -> {personal_path}")
        else:
            print("[OUT] No personal rows to write (call may have failed).")

    # Master CSV
    if all_rows:
        master_path = out_dir / f"finops_all_{today_str}.csv"
        write_csv(master_path, all_rows)
        print(f"[OUT] all -> {master_path}")
    else:
        print("[OUT] No rows at all – nothing to write.")


if __name__ == "__main__":
    main()
