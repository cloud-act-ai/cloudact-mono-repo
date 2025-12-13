#!/usr/bin/env python3
"""
fetch_usage.py

Fetches usage data from provider APIs (OpenAI, Anthropic, Gemini).
Outputs to CSV files for analysis.

Usage:
    python fetch_usage.py                           # All providers, last 7 days
    python fetch_usage.py --provider openai         # Specific provider
    python fetch_usage.py --start 2024-12-01 --end 2024-12-10  # Date range

API Requirements:
- OpenAI: Admin API key (OPENAI_ADMIN_KEY) for usage endpoint
- Anthropic: Admin API key (ANTHROPIC_ADMIN_KEY) for usage endpoint
- Gemini: Service account (GOOGLE_APPLICATION_CREDENTIALS) for Cloud Monitoring
"""
import sys
import csv
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from openai import api as openai_api
from anthropic import api as anthropic_api
from gemini import api as gemini_api

OUTPUT_DIR = Path("output")


def export_to_csv(records: List[Dict], provider: str, suffix: str = "") -> Optional[Path]:
    """Export usage records to CSV file."""
    if not records:
        return None

    OUTPUT_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{provider}_usage_{timestamp}{suffix}.csv"
    csv_path = OUTPUT_DIR / filename

    # Get all unique fields
    fieldnames = set()
    for record in records:
        fieldnames.update(record.keys())
    fieldnames = sorted(list(fieldnames))

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    return csv_path


def fetch_provider(provider: str, start_date: str = None, end_date: str = None) -> List[Dict]:
    """Fetch usage for a specific provider."""
    if provider == "openai":
        return openai_api.fetch_usage(start_date, end_date)
    elif provider == "anthropic":
        return anthropic_api.fetch_usage(start_date, end_date)
    elif provider == "gemini":
        return gemini_api.fetch_usage(start_date, end_date)
    else:
        raise ValueError(f"Unknown provider: {provider}")


def main():
    parser = argparse.ArgumentParser(description="Fetch usage data from LLM provider APIs")
    parser.add_argument(
        "--provider", "-p",
        choices=["openai", "anthropic", "gemini", "all"],
        default="all",
        help="Provider to fetch (default: all)"
    )
    parser.add_argument(
        "--start", "-s",
        help="Start date (YYYY-MM-DD), defaults to 7 days ago"
    )
    parser.add_argument(
        "--end", "-e",
        help="End date (YYYY-MM-DD), defaults to today"
    )
    parser.add_argument(
        "--output-format", "-f",
        choices=["csv", "json"],
        default="csv",
        help="Output format (default: csv)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("FETCH USAGE DATA")
    print("=" * 60)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"Fetching at: {timestamp}")
    print(f"Date range: {args.start or 'Last 7 days'} to {args.end or 'Today'}\n")

    results = {}
    providers = ["openai", "anthropic", "gemini"] if args.provider == "all" else [args.provider]

    for provider in providers:
        print(f"[{provider.upper()}] Fetching usage...")

        try:
            records = fetch_provider(provider, args.start, args.end)

            if records:
                csv_path = export_to_csv(records, provider)
                results[provider] = {"records": len(records), "file": csv_path}
                print(f"  Records: {len(records)}")
                print(f"  Exported: {csv_path}\n")
            else:
                results[provider] = {"records": 0, "file": None}
                print("  No records retrieved\n")

        except Exception as e:
            print(f"  Error: {e}\n")
            results[provider] = {"records": 0, "file": None, "error": str(e)}

    # Summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)

    total_records = sum(r.get("records", 0) for r in results.values())
    successful = sum(1 for r in results.values() if r.get("records", 0) > 0)

    if total_records > 0:
        print(f"Providers with data: {successful}/{len(providers)}")
        print(f"Total records: {total_records}")
        print("\nExported files:")
        for provider, info in results.items():
            if info.get("file"):
                print(f"  - {provider}: {info['file']}")
    else:
        print("No usage data retrieved from any provider.\n")
        print("Requirements for each provider:")
        print("  - OpenAI: OPENAI_ADMIN_KEY (admin key from platform.openai.com)")
        print("  - Anthropic: ANTHROPIC_ADMIN_KEY (admin key from console.anthropic.com)")
        print("  - Gemini: GOOGLE_APPLICATION_CREDENTIALS (service account JSON)")
        print("\nAlternatively, check each provider's console for usage data:")
        print("  - OpenAI: https://platform.openai.com/usage")
        print("  - Anthropic: https://console.anthropic.com/settings/usage")
        print("  - Gemini: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/metrics")


if __name__ == "__main__":
    main()
