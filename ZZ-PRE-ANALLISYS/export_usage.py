#!/usr/bin/env python3
"""
export_usage.py

Export comprehensive raw usage data to CSV with 50+ columns.
Appends to existing CSV file for ongoing analysis.

Output: output/usage/usage_raw.csv
"""
import sys
import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils.usage_store import get_usage

OUTPUT_DIR = Path("output/usage")
DATA_DIR = Path("data")
PRICING_CSV = DATA_DIR / "llm_pricing.csv"
RAW_USAGE_CSV = OUTPUT_DIR / "usage_raw.csv"

# Comprehensive column schema (50+ columns)
COLUMNS = [
    # === IDENTIFIERS ===
    "row_id",                    # Unique row identifier
    "request_id",                # Provider's request ID
    "provider",                  # openai, anthropic, gemini
    "api_version",               # API version used

    # === TIMESTAMPS ===
    "timestamp_utc",             # Full ISO timestamp
    "date",                      # YYYY-MM-DD
    "time",                      # HH:MM:SS
    "year",                      # Year
    "month",                     # Month (1-12)
    "day",                       # Day of month
    "hour",                      # Hour (0-23)
    "minute",                    # Minute (0-59)
    "second",                    # Second (0-59)
    "day_of_week",               # Monday=0, Sunday=6
    "day_name",                  # Monday, Tuesday, etc.
    "week_of_year",              # Week number
    "is_weekend",                # True/False
    "quarter",                   # Q1, Q2, Q3, Q4

    # === MODEL INFO ===
    "model",                     # Full model name
    "model_family",              # gpt-4, claude-3, gemini-1.5
    "model_version",             # mini, turbo, sonnet, flash
    "model_size",                # If applicable (8b, 70b, etc.)
    "is_preview",                # True if preview/experimental
    "is_legacy",                 # True if legacy/deprecated

    # === TOKEN COUNTS ===
    "input_tokens",              # Input/prompt tokens
    "output_tokens",             # Output/completion tokens
    "total_tokens",              # input + output
    "cached_input_tokens",       # Tokens read from cache
    "cached_write_tokens",       # Tokens written to cache
    "reasoning_tokens",          # For o1 models
    "audio_tokens",              # For audio models
    "image_tokens",              # For vision models
    "system_tokens",             # System prompt tokens
    "tool_tokens",               # Function/tool tokens

    # === COSTS ===
    "input_cost_usd",            # Cost for input tokens
    "output_cost_usd",           # Cost for output tokens
    "cached_cost_usd",           # Cost for cached tokens
    "total_cost_usd",            # Total cost
    "cost_per_1k_input",         # Rate used for input
    "cost_per_1k_output",        # Rate used for output

    # === PROMPT INFO ===
    "prompt_text",               # Full prompt (truncated)
    "prompt_length_chars",       # Character count
    "prompt_length_words",       # Word count
    "prompt_lines",              # Line count
    "has_system_prompt",         # True/False
    "has_images",                # True/False
    "has_tools",                 # True/False
    "has_json_mode",             # True/False

    # === RESPONSE INFO ===
    "response_text",             # Full response (truncated)
    "response_length_chars",     # Character count
    "response_length_words",     # Word count
    "response_lines",            # Line count
    "finish_reason",             # stop, length, tool_calls, etc.
    "stop_sequence",             # If stopped by sequence

    # === PERFORMANCE ===
    "latency_ms",                # Response time in ms
    "tokens_per_second",         # Generation speed
    "time_to_first_token_ms",    # TTFT if available

    # === REQUEST CONFIG ===
    "max_tokens",                # Max tokens requested
    "temperature",               # Temperature setting
    "top_p",                     # Top-p setting
    "frequency_penalty",         # Frequency penalty
    "presence_penalty",          # Presence penalty
    "stream",                    # True/False
    "n_choices",                 # Number of choices

    # === CONTEXT ===
    "context_window",            # Model's context window
    "context_used_pct",          # % of context used
    "conversation_turns",        # Number of turns
    "message_count",             # Messages in request

    # === STATUS ===
    "status",                    # success, error, rate_limited
    "http_status",               # HTTP status code
    "error_type",                # Error type if failed
    "error_message",             # Error message if failed
    "retry_count",               # Number of retries

    # === METADATA ===
    "endpoint",                  # API endpoint used
    "organization_id",           # Org ID if applicable
    "user_id",                   # User ID if set
    "session_id",                # Session identifier
    "environment",               # dev, staging, prod
    "source",                    # Script/app that made call
    "tags",                      # Custom tags (JSON)
    "custom_metadata",           # Any custom data (JSON)

    # === SAFETY ===
    "content_filter_triggered",  # True/False
    "safety_ratings",            # JSON of safety ratings
    "moderation_flagged",        # True/False

    # === EXPORT INFO ===
    "export_timestamp",          # When this row was exported
    "raw_response_json",         # Full API response (JSON)
]


def load_pricing() -> Dict[str, Dict]:
    """Load pricing from CSV file."""
    pricing = {}
    if not PRICING_CSV.exists():
        return pricing

    with PRICING_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['provider']}:{row['model']}"
            pricing[key] = {
                "input_per_1k": float(row.get("input_per_1k") or 0),
                "output_per_1k": float(row.get("output_per_1k") or 0),
                "cached_input_per_1k": float(row.get("cached_input_per_1k") or 0),
                "context_limit": int(row.get("context_limit") or 0),
            }
    return pricing


def get_pricing_for_model(pricing: Dict, provider: str, model: str) -> Dict:
    """Get pricing rates for a model."""
    key = f"{provider}:{model}"
    if key in pricing:
        return pricing[key]

    # Try prefix match
    for k, v in pricing.items():
        if k.startswith(f"{provider}:") and v.get("model", "") in model:
            return v

    return {"input_per_1k": 0, "output_per_1k": 0, "cached_input_per_1k": 0, "context_limit": 0}


def parse_model_info(model: str) -> Dict:
    """Extract model family, version, size from model name."""
    model_lower = model.lower()

    # Determine family
    if "gpt-4o" in model_lower:
        family = "gpt-4o"
    elif "gpt-4" in model_lower:
        family = "gpt-4"
    elif "gpt-3.5" in model_lower:
        family = "gpt-3.5"
    elif "o1" in model_lower:
        family = "o1"
    elif "claude-3-5" in model_lower or "claude-3.5" in model_lower:
        family = "claude-3.5"
    elif "claude-3" in model_lower:
        family = "claude-3"
    elif "gemini-2.5" in model_lower:
        family = "gemini-2.5"
    elif "gemini-2.0" in model_lower:
        family = "gemini-2.0"
    elif "gemini-1.5" in model_lower:
        family = "gemini-1.5"
    elif "gemini-1.0" in model_lower or "gemini-pro" in model_lower:
        family = "gemini-1.0"
    else:
        family = model.split("-")[0] if "-" in model else model

    # Determine version/variant
    version = ""
    if "mini" in model_lower:
        version = "mini"
    elif "turbo" in model_lower:
        version = "turbo"
    elif "sonnet" in model_lower:
        version = "sonnet"
    elif "opus" in model_lower:
        version = "opus"
    elif "haiku" in model_lower:
        version = "haiku"
    elif "flash" in model_lower:
        version = "flash"
    elif "pro" in model_lower:
        version = "pro"

    # Determine size
    size = ""
    for s in ["8b", "70b", "1b", "4b", "12b", "27b"]:
        if s in model_lower:
            size = s
            break

    # Flags
    is_preview = "preview" in model_lower or "exp" in model_lower
    is_legacy = "legacy" in model_lower or "0301" in model or "0314" in model

    return {
        "model_family": family,
        "model_version": version,
        "model_size": size,
        "is_preview": is_preview,
        "is_legacy": is_legacy
    }


def parse_timestamp(ts: str) -> Dict:
    """Parse timestamp into all date/time components."""
    result = {
        "timestamp_utc": ts,
        "date": "", "time": "", "year": "", "month": "", "day": "",
        "hour": "", "minute": "", "second": "", "day_of_week": "",
        "day_name": "", "week_of_year": "", "is_weekend": "", "quarter": ""
    }

    if not ts:
        return result

    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        result["date"] = dt.strftime("%Y-%m-%d")
        result["time"] = dt.strftime("%H:%M:%S")
        result["year"] = dt.year
        result["month"] = dt.month
        result["day"] = dt.day
        result["hour"] = dt.hour
        result["minute"] = dt.minute
        result["second"] = dt.second
        result["day_of_week"] = dt.weekday()
        result["day_name"] = dt.strftime("%A")
        result["week_of_year"] = dt.isocalendar()[1]
        result["is_weekend"] = dt.weekday() >= 5
        result["quarter"] = f"Q{(dt.month - 1) // 3 + 1}"
    except:
        pass

    return result


def get_existing_row_count() -> int:
    """Get number of existing rows in CSV."""
    if not RAW_USAGE_CSV.exists():
        return 0

    with RAW_USAGE_CSV.open("r", encoding="utf-8") as f:
        return sum(1 for _ in f) - 1  # Subtract header


def event_to_row(event: Dict, pricing: Dict, row_id: int) -> Dict:
    """Convert a usage event to a full row with all columns."""
    provider = event.get("provider", "unknown")
    model = event.get("model", "unknown")
    metadata = event.get("metadata", {})

    # Get pricing
    rates = get_pricing_for_model(pricing, provider, model)

    # Parse tokens
    input_tokens = int(event.get("input_tokens", 0))
    output_tokens = int(event.get("output_tokens", 0))
    cached_tokens = int(event.get("cached_tokens", metadata.get("cached_tokens", 0)))

    # Calculate costs
    input_cost = (input_tokens / 1000.0) * rates["input_per_1k"]
    output_cost = (output_tokens / 1000.0) * rates["output_per_1k"]
    cached_cost = (cached_tokens / 1000.0) * rates.get("cached_input_per_1k", 0)
    total_cost = input_cost + output_cost + cached_cost

    # Parse timestamp
    ts_info = parse_timestamp(event.get("timestamp_utc", ""))

    # Parse model info
    model_info = parse_model_info(model)

    # Get prompt/response info
    prompt = metadata.get("prompt", "") or ""
    response = event.get("response", "") or ""

    # Build full row
    row = {
        # Identifiers
        "row_id": row_id,
        "request_id": metadata.get("request_id", event.get("request_id", "")),
        "provider": provider,
        "api_version": metadata.get("api_version", ""),

        # Timestamps
        **ts_info,

        # Model info
        "model": model,
        **model_info,

        # Token counts
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cached_input_tokens": cached_tokens,
        "cached_write_tokens": int(metadata.get("cache_write_tokens", 0)),
        "reasoning_tokens": int(metadata.get("reasoning_tokens", 0)),
        "audio_tokens": int(metadata.get("audio_tokens", 0)),
        "image_tokens": int(metadata.get("image_tokens", 0)),
        "system_tokens": int(metadata.get("system_tokens", 0)),
        "tool_tokens": int(metadata.get("tool_tokens", 0)),

        # Costs
        "input_cost_usd": round(input_cost, 10),
        "output_cost_usd": round(output_cost, 10),
        "cached_cost_usd": round(cached_cost, 10),
        "total_cost_usd": round(total_cost, 10),
        "cost_per_1k_input": rates["input_per_1k"],
        "cost_per_1k_output": rates["output_per_1k"],

        # Prompt info
        "prompt_text": prompt[:2000],  # Truncate to 2000 chars
        "prompt_length_chars": len(prompt),
        "prompt_length_words": len(prompt.split()) if prompt else 0,
        "prompt_lines": prompt.count("\n") + 1 if prompt else 0,
        "has_system_prompt": bool(metadata.get("has_system_prompt", False)),
        "has_images": bool(metadata.get("has_images", False)),
        "has_tools": bool(metadata.get("has_tools", False)),
        "has_json_mode": bool(metadata.get("has_json_mode", False)),

        # Response info
        "response_text": response[:2000],  # Truncate to 2000 chars
        "response_length_chars": len(response),
        "response_length_words": len(response.split()) if response else 0,
        "response_lines": response.count("\n") + 1 if response else 0,
        "finish_reason": event.get("finish_reason", metadata.get("finish_reason", "")),
        "stop_sequence": metadata.get("stop_sequence", ""),

        # Performance
        "latency_ms": metadata.get("latency_ms", ""),
        "tokens_per_second": metadata.get("tokens_per_second", ""),
        "time_to_first_token_ms": metadata.get("ttft_ms", ""),

        # Request config
        "max_tokens": metadata.get("max_tokens", ""),
        "temperature": metadata.get("temperature", ""),
        "top_p": metadata.get("top_p", ""),
        "frequency_penalty": metadata.get("frequency_penalty", ""),
        "presence_penalty": metadata.get("presence_penalty", ""),
        "stream": metadata.get("stream", ""),
        "n_choices": metadata.get("n_choices", 1),

        # Context
        "context_window": rates.get("context_limit", ""),
        "context_used_pct": round((input_tokens / rates["context_limit"]) * 100, 2) if rates.get("context_limit") else "",
        "conversation_turns": metadata.get("conversation_turns", ""),
        "message_count": metadata.get("message_count", ""),

        # Status
        "status": event.get("status", "success"),
        "http_status": metadata.get("http_status", 200),
        "error_type": metadata.get("error_type", ""),
        "error_message": metadata.get("error_message", ""),
        "retry_count": metadata.get("retry_count", 0),

        # Metadata
        "endpoint": metadata.get("endpoint", ""),
        "organization_id": metadata.get("organization_id", ""),
        "user_id": metadata.get("user_id", ""),
        "session_id": metadata.get("session_id", ""),
        "environment": metadata.get("environment", os.getenv("ENVIRONMENT", "dev")),
        "source": metadata.get("source", "generate_traffic.py"),
        "tags": json.dumps(metadata.get("tags", [])),
        "custom_metadata": json.dumps({k: v for k, v in metadata.items()
                                       if k not in ["prompt", "request_id", "tags"]}),

        # Safety
        "content_filter_triggered": metadata.get("content_filter_triggered", False),
        "safety_ratings": json.dumps(metadata.get("safety_ratings", {})),
        "moderation_flagged": metadata.get("moderation_flagged", False),

        # Export info
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "raw_response_json": json.dumps(event.get("raw_response", {}))[:5000],
    }

    return row


def export_to_csv(events: List[Dict], pricing: Dict, append: bool = True):
    """Export events to CSV, appending to existing file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Check if file exists and has header
    file_exists = RAW_USAGE_CSV.exists() and RAW_USAGE_CSV.stat().st_size > 0

    # Get starting row_id
    start_row_id = get_existing_row_count() + 1 if append and file_exists else 1

    mode = "a" if append and file_exists else "w"

    with RAW_USAGE_CSV.open(mode, newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction='ignore')

        if not file_exists or mode == "w":
            writer.writeheader()

        for i, event in enumerate(events):
            row = event_to_row(event, pricing, start_row_id + i)
            writer.writerow(row)

    return start_row_id, len(events)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Export comprehensive raw usage data to CSV")
    parser.add_argument("--provider", "-p", choices=["openai", "anthropic", "gemini"],
                        help="Filter by provider")
    parser.add_argument("--fresh", "-f", action="store_true",
                        help="Create fresh CSV (don't append)")
    parser.add_argument("--columns", "-c", action="store_true",
                        help="Show all column names")
    args = parser.parse_args()

    if args.columns:
        print(f"CSV has {len(COLUMNS)} columns:\n")
        for i, col in enumerate(COLUMNS, 1):
            print(f"{i:3}. {col}")
        return

    print("=" * 70)
    print("EXPORT RAW USAGE DATA")
    print("=" * 70)
    print(f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Output: {RAW_USAGE_CSV}")
    print(f"Columns: {len(COLUMNS)}")
    print(f"Mode: {'Fresh' if args.fresh else 'Append'}")

    # Load pricing
    pricing = load_pricing()
    print(f"Pricing models loaded: {len(pricing)}")

    # Get events
    events = get_usage(provider=args.provider)
    print(f"Events found: {len(events)}")

    if not events:
        print("\nNo events to export. Run 'python generate_traffic.py' first.")
        return

    # Export
    start_id, count = export_to_csv(events, pricing, append=not args.fresh)

    print(f"\nExported {count} rows (IDs {start_id} to {start_id + count - 1})")
    print(f"File: {RAW_USAGE_CSV}")

    # Show sample
    print("\n" + "-" * 70)
    print("Sample row (key columns):")
    print("-" * 70)

    with RAW_USAGE_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key_cols = ["row_id", "date", "time", "provider", "model",
                       "input_tokens", "output_tokens", "total_cost_usd"]
            for col in key_cols:
                print(f"  {col}: {row.get(col, '')}")
            break


if __name__ == "__main__":
    main()
