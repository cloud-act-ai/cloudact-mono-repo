#!/usr/bin/env python3
"""
calculate_costs.py

Calculate costs from GenAI usage data using the new genai pricing structure.
Outputs to genai_payg_costs.csv.

Usage:
    python calculate_costs.py                                    # From genai_payg_usage.csv
    python calculate_costs.py --file output/usage/genai_payg_usage.csv
    python calculate_costs.py --provider openai                  # Specific provider
    python calculate_costs.py --consolidate                      # Run consolidation after
"""
import os
import sys
import csv
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict

# Add current directory to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Load .env file if exists
ENV_FILE = SCRIPT_DIR / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        if line.strip() and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())

from utils.pricing_loader import (
    calculate_cost,
    get_pricing_summary,
    list_models,
)
from utils.usage_store import get_payg_usage, PAYG_USAGE_CSV
from utils.consolidate import consolidate_all, get_consolidation_summary

OUTPUT_DIR = Path("output")
COSTS_DIR = OUTPUT_DIR / "costs"

# Cost output files
PAYG_COSTS_CSV = COSTS_DIR / "genai_payg_costs.csv"

# Cost output schema
PAYG_COSTS_COLUMNS = [
    "date", "provider", "model", "model_family",
    "input_tokens", "output_tokens", "cached_tokens", "total_tokens",
    "input_cost_usd", "output_cost_usd", "cached_cost_usd", "total_cost_usd",
    "request_count", "org_slug"
]


def _safe_int(val, default: int = 0) -> int:
    """Safely convert to int."""
    if val is None or val == "":
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _safe_float(val, default: float = 0.0) -> float:
    """Safely convert to float."""
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def calculate_for_record(record: Dict) -> Dict:
    """Calculate cost for a single usage record using genai pricing."""
    provider = record.get("provider", "").lower()
    model = record.get("model", "")
    input_tokens = _safe_int(record.get("input_tokens", 0))
    output_tokens = _safe_int(record.get("output_tokens", 0))
    cached_tokens = _safe_int(record.get("cached_tokens", 0))

    # Use new pricing loader
    cost_data = calculate_cost(
        provider=provider,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_input_tokens=cached_tokens,
    )

    return {
        "date": record.get("date", ""),
        "provider": provider,
        "model": cost_data.get("model_used", model),
        "model_family": cost_data.get("model_family", ""),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cached_tokens": cached_tokens,
        "total_tokens": input_tokens + output_tokens + cached_tokens,
        "input_cost_usd": cost_data.get("input_cost", 0),
        "output_cost_usd": cost_data.get("output_cost", 0),
        "cached_cost_usd": cost_data.get("cached_cost", 0),
        "total_cost_usd": cost_data.get("total_cost", 0),
        "request_count": 1,
        "org_slug": record.get("org_slug", ""),
        "pricing_found": cost_data.get("pricing_found", False),
    }


def load_from_csv(file_path: Path) -> List[Dict]:
    """Load usage records from CSV file."""
    records = []
    with file_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
    return records


def calculate_from_usage_file(file_path: Path = None, provider: str = None) -> List[Dict]:
    """Calculate costs from usage file."""
    if file_path:
        records = load_from_csv(file_path)
    else:
        records = get_payg_usage(provider=provider)

    results = []
    for record in records:
        if provider and record.get("provider", "").lower() != provider.lower():
            continue
        result = calculate_for_record(record)
        results.append(result)

    return results


def export_costs(results: List[Dict]) -> Path:
    """Export calculated costs to genai_payg_costs.csv."""
    COSTS_DIR.mkdir(parents=True, exist_ok=True)

    # Clean results for output
    clean_results = []
    for r in results:
        clean_r = {k: r.get(k, "") for k in PAYG_COSTS_COLUMNS}
        clean_results.append(clean_r)

    with PAYG_COSTS_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=PAYG_COSTS_COLUMNS)
        writer.writeheader()
        writer.writerows(clean_results)

    return PAYG_COSTS_CSV


def print_summary(results: List[Dict]):
    """Print cost summary by provider and model."""
    if not results:
        print("No records to summarize.")
        return

    # Group by provider
    by_provider = {}
    for r in results:
        provider = r.get("provider", "unknown")
        if provider not in by_provider:
            by_provider[provider] = {"records": [], "total_cost": 0}
        by_provider[provider]["records"].append(r)
        by_provider[provider]["total_cost"] += _safe_float(r.get("total_cost_usd", 0))

    print("\n" + "=" * 60)
    print("COST BREAKDOWN BY PROVIDER")
    print("=" * 60)

    grand_total = 0
    for provider, data in sorted(by_provider.items()):
        print(f"\n{provider.upper()}")
        print("-" * 40)

        # Group by model within provider
        by_model = {}
        for r in data["records"]:
            model = r.get("model", "unknown")
            if model not in by_model:
                by_model[model] = {"input": 0, "output": 0, "cost": 0, "count": 0}
            by_model[model]["input"] += _safe_int(r.get("input_tokens", 0))
            by_model[model]["output"] += _safe_int(r.get("output_tokens", 0))
            by_model[model]["cost"] += _safe_float(r.get("total_cost_usd", 0))
            by_model[model]["count"] += 1

        for model, stats in sorted(by_model.items()):
            print(f"  {model}:")
            print(f"    Requests: {stats['count']}")
            print(f"    Input tokens: {stats['input']:,}")
            print(f"    Output tokens: {stats['output']:,}")
            print(f"    Cost: ${stats['cost']:.6f}")

        print(f"\n  Provider Total: ${data['total_cost']:.6f}")
        grand_total += data["total_cost"]

    print("\n" + "=" * 60)
    print(f"GRAND TOTAL: ${grand_total:.6f}")
    print("=" * 60)


def print_pricing_info():
    """Print current pricing information from genai pricing files."""
    print("\n" + "=" * 60)
    print("GENAI PRICING SUMMARY")
    print("=" * 60)

    summary = get_pricing_summary()
    print(f"\nTotal PAYG models: {summary['total_payg_models']}")
    print(f"Total commitment entries: {summary['total_commitment_entries']}")
    print(f"Total registered providers: {summary['total_providers_registered']}")

    print("\nPAYG Providers:")
    for p in summary["payg_providers"]:
        print(f"  - {p}")

    print("\nCommitment Providers:")
    for p in summary["commitment_providers"]:
        print(f"  - {p}")

    # Show sample models per provider
    print("\n" + "-" * 40)
    print("SAMPLE MODELS (per 1M tokens)")
    print("-" * 40)

    for provider in ["openai", "anthropic", "gemini", "azure_openai"]:
        models = list_models(provider=provider, pricing_model="payg")
        if models:
            print(f"\n{provider.upper()}:")
            for m in models[:3]:  # Show top 3
                print(f"  {m['model']}: in=${m['input_per_1m']}, out=${m['output_per_1m']}")


def main():
    parser = argparse.ArgumentParser(description="Calculate costs from GenAI usage data")
    parser.add_argument(
        "--file", "-f",
        type=Path,
        help="Input usage file (defaults to genai_payg_usage.csv)"
    )
    parser.add_argument(
        "--provider", "-p",
        choices=["openai", "anthropic", "gemini", "azure_openai"],
        help="Filter by provider"
    )
    parser.add_argument(
        "--pricing",
        action="store_true",
        help="Show current pricing information"
    )
    parser.add_argument(
        "--consolidate",
        action="store_true",
        help="Run consolidation after cost calculation"
    )
    args = parser.parse_args()

    if args.pricing:
        print_pricing_info()
        return

    print("=" * 60)
    print("GENAI COST CALCULATION")
    print("=" * 60)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"Calculated at: {timestamp}\n")

    # Determine input file
    input_file = args.file
    if not input_file and PAYG_USAGE_CSV.exists():
        input_file = PAYG_USAGE_CSV

    if input_file:
        print(f"Loading from: {input_file}")
        results = calculate_from_usage_file(input_file, args.provider)
    else:
        print("Loading from usage store...")
        results = calculate_from_usage_file(provider=args.provider)

    if not results:
        print("\nNo usage records found.")
        print("Try one of these options:")
        print("  1. Run 'python generate_traffic.py' first to generate usage")
        print("  2. Specify a file with --file")
        print(f"  3. Check {PAYG_USAGE_CSV} exists")
        return

    print(f"Processed {len(results)} records")

    # Check for missing pricing
    missing_pricing = [r for r in results if not r.get("pricing_found")]
    if missing_pricing:
        print(f"\nWarning: {len(missing_pricing)} records missing pricing data")

    # Export results
    output_path = export_costs(results)
    print(f"Exported to: {output_path}")

    # Print summary
    print_summary(results)

    # Optionally consolidate
    if args.consolidate:
        print("\n" + "=" * 60)
        print("CONSOLIDATING TABLES")
        print("=" * 60)
        consolidate_result = consolidate_all()
        print(f"Usage consolidated: {consolidate_result['usage']}")
        print(f"Costs consolidated: {consolidate_result['costs']}")

        summary = get_consolidation_summary()
        print(f"\nTotal usage rows: {summary['usage_rows']}")
        print(f"Total cost rows: {summary['cost_rows']}")
        print(f"Total cost: ${summary['total_cost_usd']:.4f}")


if __name__ == "__main__":
    main()
