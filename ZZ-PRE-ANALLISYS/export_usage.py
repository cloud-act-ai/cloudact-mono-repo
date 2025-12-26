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
from utils.pricing_loader import calculate_cost, get_model_pricing

# Paths
DATA_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_DIR = Path("output")
USAGE_ADVANCED_CSV = OUTPUT_DIR / "usage_advanced.csv"
COST_ADVANCED_CSV = OUTPUT_DIR / "cost_advanced.csv"
EXCHANGE_RATES_CSV = DATA_DIR / "exchange-rates.csv"

# Exchange rate cache
EXCHANGE_RATES: Dict[str, Dict] = {}


def load_exchange_rates() -> Dict[str, Dict]:
    """Load exchange rates from CSV file."""
    global EXCHANGE_RATES
    if EXCHANGE_RATES:
        return EXCHANGE_RATES

    if not EXCHANGE_RATES_CSV.exists():
        print(f"Warning: Exchange rates file not found: {EXCHANGE_RATES_CSV}")
        EXCHANGE_RATES = {"USD": {"rate": 1.0, "symbol": "$", "name": "US Dollar", "last_updated": ""}}
        return EXCHANGE_RATES

    with EXCHANGE_RATES_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            EXCHANGE_RATES[row["currency_code"]] = {
                "rate": float(row["rate_to_usd"]),
                "symbol": row.get("symbol", ""),
                "name": row.get("currency_name", ""),
                "last_updated": row.get("last_updated", "")
            }

    return EXCHANGE_RATES


def convert_from_usd(amount_usd: float, target_currency: str) -> Dict:
    """Convert USD amount to target currency with audit trail.

    Returns dict with converted amount, exchange rate used, and audit info.
    """
    rates = load_exchange_rates()

    if target_currency == "USD" or target_currency not in rates:
        return {
            "converted_amount": amount_usd,
            "source_amount": amount_usd,
            "source_currency": "USD",
            "target_currency": target_currency,
            "exchange_rate": 1.0,
            "rate_date": rates.get("USD", {}).get("last_updated", ""),
        }

    rate_info = rates[target_currency]
    rate = rate_info["rate"]
    converted = round(amount_usd * rate, 6)

    return {
        "converted_amount": converted,
        "source_amount": amount_usd,
        "source_currency": "USD",
        "target_currency": target_currency,
        "exchange_rate": rate,
        "rate_date": rate_info.get("last_updated", ""),
    }

# Comprehensive column schema (50+ columns)
# ORDERED: run/update dates first, then most used columns, metadata/safety last
COLUMNS = [
    # === RUN & UPDATE TIMESTAMPS (FIRST - most important for pipelines) ===
    "run_date",                  # Date this pipeline/export was run (YYYY-MM-DD)
    "updated_at",                # When this record was last updated (ISO timestamp)
    "created_at",                # When this record was first created (ISO timestamp)
    "ingestion_date",            # BigQuery partition date (YYYY-MM-DD)

    # === ORGANIZATION (for multi-tenant) ===
    "org_slug",                  # Organization identifier

    # === PRIMARY IDENTIFIERS ===
    "row_id",                    # Unique row identifier
    "request_id",                # Provider's request ID
    "provider",                  # openai, anthropic, gemini

    # === CORE TIMESTAMPS ===
    "timestamp_utc",             # Full ISO timestamp of API call
    "date",                      # YYYY-MM-DD
    "time",                      # HH:MM:SS
    "hour",                      # Hour (0-23) - frequently used for analysis

    # === MODEL INFO (frequently queried) ===
    "model",                     # Full model name
    "model_family",              # gpt-4, claude-3, gemini-1.5
    "model_version",             # mini, turbo, sonnet, flash

    # === TOKEN COUNTS (core metrics) ===
    "input_tokens",              # Input/prompt tokens
    "output_tokens",             # Output/completion tokens
    "total_tokens",              # input + output
    "cached_input_tokens",       # Tokens read from cache

    # === COSTS - SOURCE (USD from pricing) ===
    "total_cost_usd",            # Total cost in USD (source)
    "input_cost_usd",            # Input cost in USD
    "output_cost_usd",           # Output cost in USD
    "cached_cost_usd",           # Cached cost in USD
    "cost_per_1k_input",         # Rate used for input (per 1K tokens)
    "cost_per_1k_output",        # Rate used for output (per 1K tokens)

    # === COSTS - CONVERTED (org currency) ===
    "display_currency",          # Target/display currency (org default)
    "total_cost_converted",      # Total cost in display currency
    "input_cost_converted",      # Input cost in display currency
    "output_cost_converted",     # Output cost in display currency
    "cached_cost_converted",     # Cached cost in display currency
    "exchange_rate_used",        # Exchange rate (1 USD = X display_currency)
    "exchange_rate_date",        # Date of exchange rate used

    # === STATUS (important for monitoring) ===
    "status",                    # success, error, rate_limited
    "http_status",               # HTTP status code
    "finish_reason",             # stop, length, tool_calls, etc.

    # === PERFORMANCE (monitoring) ===
    "latency_ms",                # Response time in ms
    "tokens_per_second",         # Generation speed
    "time_to_first_token_ms",    # TTFT if available

    # === EXTENDED TIMESTAMPS (less frequently used) ===
    "year",                      # Year
    "month",                     # Month (1-12)
    "day",                       # Day of month
    "minute",                    # Minute (0-59)
    "second",                    # Second (0-59)
    "day_of_week",               # Monday=0, Sunday=6
    "day_name",                  # Monday, Tuesday, etc.
    "week_of_year",              # Week number
    "is_weekend",                # True/False
    "quarter",                   # Q1, Q2, Q3, Q4

    # === EXTENDED MODEL INFO ===
    "model_size",                # If applicable (8b, 70b, etc.)
    "is_preview",                # True if preview/experimental
    "is_legacy",                 # True if legacy/deprecated
    "api_version",               # API version used

    # === EXTENDED TOKEN COUNTS ===
    "cached_write_tokens",       # Tokens written to cache
    "reasoning_tokens",          # For o1 models
    "audio_tokens",              # For audio models
    "image_tokens",              # For vision models
    "system_tokens",             # System prompt tokens
    "tool_tokens",               # Function/tool tokens

    # === CONTEXT ===
    "context_window",            # Model's context window
    "context_used_pct",          # % of context used
    "conversation_turns",        # Number of turns
    "message_count",             # Messages in request

    # === REQUEST CONFIG ===
    "max_tokens",                # Max tokens requested
    "temperature",               # Temperature setting
    "top_p",                     # Top-p setting
    "frequency_penalty",         # Frequency penalty
    "presence_penalty",          # Presence penalty
    "stream",                    # True/False
    "n_choices",                 # Number of choices

    # === ERROR DETAILS ===
    "error_type",                # Error type if failed
    "error_message",             # Error message if failed
    "retry_count",               # Number of retries
    "stop_sequence",             # If stopped by sequence

    # === PROMPT INFO (large text, less queried) ===
    "prompt_text",               # Full prompt (truncated)
    "prompt_length_chars",       # Character count
    "prompt_length_words",       # Word count
    "prompt_lines",              # Line count
    "has_system_prompt",         # True/False
    "has_images",                # True/False
    "has_tools",                 # True/False
    "has_json_mode",             # True/False

    # === RESPONSE INFO (large text, less queried) ===
    "response_text",             # Full response (truncated)
    "response_length_chars",     # Character count
    "response_length_words",     # Word count
    "response_lines",            # Line count

    # === METADATA (usually for debugging) ===
    "endpoint",                  # API endpoint used
    "organization_id",           # Provider org ID if applicable
    "user_id",                   # User ID if set
    "session_id",                # Session identifier
    "environment",               # dev, staging, prod
    "source",                    # Script/app that made call
    "tags",                      # Custom tags (JSON)
    "custom_metadata",           # Any custom data (JSON)

    # === SAFETY (rarely queried) ===
    "content_filter_triggered",  # True/False
    "safety_ratings",            # JSON of safety ratings
    "moderation_flagged",        # True/False

    # === EXPORT INFO (last - for auditing) ===
    "export_timestamp",          # When this row was exported
    "raw_response_json",         # Full API response (JSON)
]


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
    if not USAGE_ADVANCED_CSV.exists():
        return 0

    with USAGE_ADVANCED_CSV.open("r", encoding="utf-8") as f:
        return sum(1 for _ in f) - 1  # Subtract header


def event_to_row(event: Dict, row_id: int, run_date: str = None, org_slug: str = None, display_currency: str = "USD") -> Dict:
    """Convert a usage event to a full row with all columns.

    Args:
        event: The usage event dict
        row_id: Unique row identifier
        run_date: Pipeline run date (YYYY-MM-DD), defaults to today
        org_slug: Organization identifier for multi-tenant support
        display_currency: Target currency for cost conversion (org's default currency)
    """
    provider = event.get("provider", "unknown")
    model = event.get("model", "unknown")
    metadata = event.get("metadata", {})

    # Current timestamp for run/update tracking
    now = datetime.now(timezone.utc)
    run_date = run_date or now.strftime("%Y-%m-%d")
    ingestion_date = now.strftime("%Y-%m-%d")

    # Parse tokens
    input_tokens = int(event.get("input_tokens", 0))
    output_tokens = int(event.get("output_tokens", 0))
    cached_tokens = int(event.get("cached_tokens", metadata.get("cached_tokens", 0)))
    cached_write_tokens = int(metadata.get("cache_creation_tokens", metadata.get("cache_write_tokens", 0)))

    # Calculate costs using advanced pricing loader
    cost_result = calculate_cost(
        provider=provider,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_input_tokens=cached_tokens,
        cached_write_tokens=cached_write_tokens,
    )

    # Get pricing info
    pricing_info = get_model_pricing(provider, model)

    # Parse timestamp
    ts_info = parse_timestamp(event.get("timestamp_utc", ""))

    # Parse model info
    model_info = parse_model_info(model)

    # Get prompt/response info
    prompt = metadata.get("prompt", "") or ""
    response = event.get("response", "") or ""

    # Get event timestamp for created_at (original API call time)
    event_timestamp = event.get("timestamp_utc", now.isoformat())

    # Build full row - ordered to match COLUMNS
    row = {
        # === RUN & UPDATE TIMESTAMPS (FIRST) ===
        "run_date": run_date,
        "updated_at": now.isoformat(),
        "created_at": event_timestamp,
        "ingestion_date": ingestion_date,

        # === ORGANIZATION ===
        "org_slug": org_slug or metadata.get("org_slug", ""),

        # === PRIMARY IDENTIFIERS ===
        "row_id": row_id,
        "request_id": metadata.get("request_id", event.get("request_id", "")),
        "provider": provider,

        # === CORE TIMESTAMPS ===
        "timestamp_utc": ts_info.get("timestamp_utc", ""),
        "date": ts_info.get("date", ""),
        "time": ts_info.get("time", ""),
        "hour": ts_info.get("hour", ""),

        # === MODEL INFO ===
        "model": model,
        "model_family": model_info.get("model_family", ""),
        "model_version": model_info.get("model_version", ""),

        # === TOKEN COUNTS (core) ===
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cached_input_tokens": cached_tokens,

        # === COSTS - SOURCE (USD) ===
        "total_cost_usd": cost_result["total_cost"],
        "input_cost_usd": cost_result["input_cost"],
        "output_cost_usd": cost_result["output_cost"],
        "cached_cost_usd": cost_result["cached_cost"],
        "cost_per_1k_input": cost_result.get("input_rate_per_1m", 0) / 1000,
        "cost_per_1k_output": cost_result.get("output_rate_per_1m", 0) / 1000,

        # === COSTS - CONVERTED (org currency) ===
        "display_currency": display_currency,
        "total_cost_converted": convert_from_usd(cost_result["total_cost"], display_currency)["converted_amount"],
        "input_cost_converted": convert_from_usd(cost_result["input_cost"], display_currency)["converted_amount"],
        "output_cost_converted": convert_from_usd(cost_result["output_cost"], display_currency)["converted_amount"],
        "cached_cost_converted": convert_from_usd(cost_result["cached_cost"], display_currency)["converted_amount"],
        "exchange_rate_used": convert_from_usd(1.0, display_currency)["exchange_rate"],
        "exchange_rate_date": convert_from_usd(1.0, display_currency)["rate_date"],

        # === STATUS ===
        "status": event.get("status", "success"),
        "http_status": metadata.get("http_status", 200),
        "finish_reason": event.get("finish_reason", metadata.get("finish_reason", "")),

        # === PERFORMANCE ===
        "latency_ms": metadata.get("latency_ms", ""),
        "tokens_per_second": metadata.get("tokens_per_second", ""),
        "time_to_first_token_ms": metadata.get("ttft_ms", ""),

        # === EXTENDED TIMESTAMPS ===
        "year": ts_info.get("year", ""),
        "month": ts_info.get("month", ""),
        "day": ts_info.get("day", ""),
        "minute": ts_info.get("minute", ""),
        "second": ts_info.get("second", ""),
        "day_of_week": ts_info.get("day_of_week", ""),
        "day_name": ts_info.get("day_name", ""),
        "week_of_year": ts_info.get("week_of_year", ""),
        "is_weekend": ts_info.get("is_weekend", ""),
        "quarter": ts_info.get("quarter", ""),

        # === EXTENDED MODEL INFO ===
        "model_size": model_info.get("model_size", ""),
        "is_preview": model_info.get("is_preview", False),
        "is_legacy": model_info.get("is_legacy", False),
        "api_version": metadata.get("api_version", ""),

        # === EXTENDED TOKEN COUNTS ===
        "cached_write_tokens": cached_write_tokens,
        "reasoning_tokens": int(metadata.get("reasoning_tokens", 0)),
        "audio_tokens": int(metadata.get("audio_tokens", 0)),
        "image_tokens": int(metadata.get("image_tokens", 0)),
        "system_tokens": int(metadata.get("system_tokens", 0)),
        "tool_tokens": int(metadata.get("tool_tokens", 0)),

        # === CONTEXT ===
        "context_window": cost_result.get("context_window", pricing_info.context_window if pricing_info else 0),
        "context_used_pct": round((input_tokens / cost_result.get("context_window", 1)) * 100, 2) if cost_result.get("context_window") else "",
        "conversation_turns": metadata.get("conversation_turns", ""),
        "message_count": metadata.get("message_count", ""),

        # === REQUEST CONFIG ===
        "max_tokens": metadata.get("max_tokens", ""),
        "temperature": metadata.get("temperature", ""),
        "top_p": metadata.get("top_p", ""),
        "frequency_penalty": metadata.get("frequency_penalty", ""),
        "presence_penalty": metadata.get("presence_penalty", ""),
        "stream": metadata.get("stream", ""),
        "n_choices": metadata.get("n_choices", 1),

        # === ERROR DETAILS ===
        "error_type": metadata.get("error_type", ""),
        "error_message": metadata.get("error_message", ""),
        "retry_count": metadata.get("retry_count", 0),
        "stop_sequence": metadata.get("stop_sequence", ""),

        # === PROMPT INFO ===
        "prompt_text": prompt[:2000],  # Truncate to 2000 chars
        "prompt_length_chars": len(prompt),
        "prompt_length_words": len(prompt.split()) if prompt else 0,
        "prompt_lines": prompt.count("\n") + 1 if prompt else 0,
        "has_system_prompt": bool(metadata.get("has_system_prompt", False)),
        "has_images": bool(metadata.get("has_images", False)),
        "has_tools": bool(metadata.get("has_tools", False)),
        "has_json_mode": bool(metadata.get("has_json_mode", False)),

        # === RESPONSE INFO ===
        "response_text": response[:2000],  # Truncate to 2000 chars
        "response_length_chars": len(response),
        "response_length_words": len(response.split()) if response else 0,
        "response_lines": response.count("\n") + 1 if response else 0,

        # === METADATA ===
        "endpoint": metadata.get("endpoint", ""),
        "organization_id": metadata.get("organization_id", ""),
        "user_id": metadata.get("user_id", ""),
        "session_id": metadata.get("session_id", ""),
        "environment": metadata.get("environment", os.getenv("ENVIRONMENT", "dev")),
        "source": metadata.get("source", "generate_traffic.py"),
        "tags": json.dumps(metadata.get("tags", [])),
        "custom_metadata": json.dumps({k: v for k, v in metadata.items()
                                       if k not in ["prompt", "request_id", "tags"]}),

        # === SAFETY ===
        "content_filter_triggered": metadata.get("content_filter_triggered", False),
        "safety_ratings": json.dumps(metadata.get("safety_ratings", {})),
        "moderation_flagged": metadata.get("moderation_flagged", False),

        # === EXPORT INFO (last) ===
        "export_timestamp": now.isoformat(),
        "raw_response_json": json.dumps(event.get("raw_response", {}))[:5000],
    }

    return row


def export_to_csv(events: List[Dict], append: bool = True, run_date: str = None, org_slug: str = None, display_currency: str = "USD"):
    """Export events to CSV, appending to existing file.

    Args:
        events: List of usage events to export
        append: Whether to append to existing file (default True)
        run_date: Pipeline run date (YYYY-MM-DD), defaults to today
        org_slug: Organization identifier for multi-tenant support
        display_currency: Target currency for cost conversion (default USD)
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Check if file exists and has header
    file_exists = USAGE_ADVANCED_CSV.exists() and USAGE_ADVANCED_CSV.stat().st_size > 0

    # Get starting row_id
    start_row_id = get_existing_row_count() + 1 if append and file_exists else 1

    mode = "a" if append and file_exists else "w"

    with USAGE_ADVANCED_CSV.open(mode, newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction='ignore')

        if not file_exists or mode == "w":
            writer.writeheader()

        for i, event in enumerate(events):
            row = event_to_row(event, start_row_id + i, run_date=run_date, org_slug=org_slug, display_currency=display_currency)
            writer.writerow(row)

    return start_row_id, len(events)


def main():
    import argparse

    # Get available currencies for help text
    rates = load_exchange_rates()
    available_currencies = sorted(rates.keys())

    parser = argparse.ArgumentParser(description="Export comprehensive raw usage data to CSV")
    parser.add_argument("--provider", "-p", choices=["openai", "anthropic", "gemini"],
                        help="Filter by provider")
    parser.add_argument("--fresh", "-f", action="store_true",
                        help="Create fresh CSV (don't append)")
    parser.add_argument("--columns", "-c", action="store_true",
                        help="Show all column names")
    parser.add_argument("--run-date", "-r",
                        help="Pipeline run date (YYYY-MM-DD), defaults to today")
    parser.add_argument("--org", "-o",
                        help="Organization slug for multi-tenant support")
    parser.add_argument("--currency", "-C", default="USD",
                        help=f"Display currency for cost conversion (default: USD). Available: {', '.join(available_currencies)}")
    parser.add_argument("--currencies", action="store_true",
                        help="Show available currencies with exchange rates")
    args = parser.parse_args()

    if args.currencies:
        print(f"\nAvailable currencies ({len(rates)}):\n")
        print(f"{'Code':<6} {'Name':<25} {'Rate (1 USD)':<15} {'Symbol':<8} {'Updated'}")
        print("-" * 75)
        for code in available_currencies:
            info = rates[code]
            print(f"{code:<6} {info['name']:<25} {info['rate']:<15.4f} {info['symbol']:<8} {info['last_updated']}")
        return

    if args.columns:
        print(f"CSV has {len(COLUMNS)} columns:\n")
        for i, col in enumerate(COLUMNS, 1):
            print(f"{i:3}. {col}")
        return

    # Validate currency
    display_currency = args.currency.upper()
    if display_currency not in rates:
        print(f"Error: Unknown currency '{display_currency}'")
        print(f"Available: {', '.join(available_currencies)}")
        return

    # Default run_date to today
    run_date = args.run_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print("=" * 70)
    print("EXPORT RAW USAGE DATA")
    print("=" * 70)
    print(f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Run Date: {run_date}")
    if args.org:
        print(f"Org Slug: {args.org}")
    print(f"Display Currency: {display_currency} (1 USD = {rates[display_currency]['rate']} {display_currency})")
    print(f"Output: {USAGE_ADVANCED_CSV}")
    print(f"Columns: {len(COLUMNS)}")
    print(f"Mode: {'Fresh' if args.fresh else 'Append'}")
    print("Pricing: Advanced (llm_pricing_advanced.csv)")

    # Get events
    events = get_usage(provider=args.provider)
    print(f"Events found: {len(events)}")

    if not events:
        print("\nNo events to export. Run 'python generate_traffic.py' first.")
        return

    # Export with run_date, org_slug, and display_currency
    start_id, count = export_to_csv(
        events,
        append=not args.fresh,
        run_date=run_date,
        org_slug=args.org,
        display_currency=display_currency
    )

    print(f"\nExported {count} rows (IDs {start_id} to {start_id + count - 1})")
    print(f"File: {USAGE_ADVANCED_CSV}")

    # Show sample with new column order including currency
    print("\n" + "-" * 70)
    print("Sample row (key columns - with currency):")
    print("-" * 70)

    with USAGE_ADVANCED_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Show key columns including currency info
            key_cols = [
                "run_date", "org_slug", "provider", "model",
                "input_tokens", "output_tokens",
                "total_cost_usd", "display_currency", "total_cost_converted",
                "exchange_rate_used", "status"
            ]
            for col in key_cols:
                val = row.get(col, "")
                # Truncate long values
                if len(str(val)) > 40:
                    val = str(val)[:37] + "..."
                print(f"  {col}: {val}")
            break


if __name__ == "__main__":
    main()
