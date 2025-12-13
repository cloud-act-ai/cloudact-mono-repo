#!/usr/bin/env python3
"""
calculate_costs.py

Calculate costs from usage data for all 3 LLM providers.

Usage:
    python calculate_costs.py                           # From local logs
    python calculate_costs.py --file output/usage.csv   # From CSV file
    python calculate_costs.py --provider openai         # Specific provider

Each provider has its own pricing module with accurate rates.
"""
import sys
import csv
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from openai.pricing import calculate_cost as openai_cost, PRICING as OPENAI_PRICING
from anthropic.pricing import calculate_cost as anthropic_cost, PRICING as ANTHROPIC_PRICING
from gemini.pricing import calculate_cost as gemini_cost, PRICING as GEMINI_PRICING
from utils.usage_store import get_usage

OUTPUT_DIR = Path("output")


def calculate_for_record(record: Dict) -> Dict:
    """Calculate cost for a single usage record."""
    provider = record.get("provider", "").lower()
    model = record.get("model", "")
    input_tokens = int(record.get("input_tokens", 0))
    output_tokens = int(record.get("output_tokens", 0))
    cached_tokens = int(record.get("cached_tokens", record.get("cached_input_tokens", 0)))

    if provider == "openai":
        cost = openai_cost(model, input_tokens, output_tokens, cached_tokens)
    elif provider == "anthropic":
        cost = anthropic_cost(model, input_tokens, output_tokens, cached_tokens)
    elif provider == "gemini":
        cost = gemini_cost(model, input_tokens, output_tokens, cached_tokens)
    else:
        # Try to guess provider from model name
        if "gpt" in model.lower() or "o1" in model.lower():
            cost = openai_cost(model, input_tokens, output_tokens, cached_tokens)
            provider = "openai"
        elif "claude" in model.lower():
            cost = anthropic_cost(model, input_tokens, output_tokens, cached_tokens)
            provider = "anthropic"
        elif "gemini" in model.lower():
            cost = gemini_cost(model, input_tokens, output_tokens, cached_tokens)
            provider = "gemini"
        else:
            cost = 0.0

    return {
        **record,
        "provider": provider,
        "calculated_cost_usd": cost,
        "total_tokens": input_tokens + output_tokens
    }


def load_from_csv(file_path: Path) -> List[Dict]:
    """Load usage records from CSV file."""
    records = []
    with file_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
    return records


def load_from_jsonl(file_path: Path) -> List[Dict]:
    """Load usage records from JSONL file."""
    records = []
    with file_path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def calculate_from_local_logs(provider: str = None) -> List[Dict]:
    """Calculate costs from local usage logs."""
    events = get_usage(provider=provider)
    results = []

    for event in events:
        result = calculate_for_record(event)
        results.append(result)

    return results


def calculate_from_file(file_path: Path) -> List[Dict]:
    """Calculate costs from CSV or JSONL file."""
    if file_path.suffix == ".csv":
        records = load_from_csv(file_path)
    elif file_path.suffix in [".jsonl", ".json"]:
        records = load_from_jsonl(file_path)
    else:
        raise ValueError(f"Unsupported file format: {file_path.suffix}")

    results = []
    for record in records:
        result = calculate_for_record(record)
        results.append(result)

    return results


def export_results(results: List[Dict], output_format: str = "csv") -> Path:
    """Export calculated results to file."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if output_format == "csv":
        file_path = OUTPUT_DIR / f"costs_{timestamp}.csv"
        fieldnames = set()
        for r in results:
            fieldnames.update(r.keys())
        fieldnames = sorted(list(fieldnames))

        with file_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)

    elif output_format == "json":
        file_path = OUTPUT_DIR / f"costs_{timestamp}.json"
        with file_path.open("w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, default=str)

    return file_path


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
        by_provider[provider]["total_cost"] += r.get("calculated_cost_usd", 0)

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
            by_model[model]["input"] += int(r.get("input_tokens", 0))
            by_model[model]["output"] += int(r.get("output_tokens", 0))
            by_model[model]["cost"] += r.get("calculated_cost_usd", 0)
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
    """Print current pricing information for all providers."""
    print("\n" + "=" * 60)
    print("CURRENT PRICING (per 1K tokens)")
    print("=" * 60)

    print("\nOPENAI:")
    for model, rates in sorted(OPENAI_PRICING.items())[:10]:
        print(f"  {model}: input=${rates['input']}, output=${rates['output']}")

    print("\nANTHROPIC:")
    for model, rates in sorted(ANTHROPIC_PRICING.items())[:10]:
        print(f"  {model}: input=${rates['input']}, output=${rates['output']}")

    print("\nGEMINI:")
    for model, rates in sorted(GEMINI_PRICING.items())[:10]:
        if "input" in rates:
            print(f"  {model}: input=${rates['input']}, output=${rates['output']}")


def main():
    parser = argparse.ArgumentParser(description="Calculate costs from LLM usage data")
    parser.add_argument(
        "--file", "-f",
        type=Path,
        help="Input file (CSV or JSONL) to calculate costs from"
    )
    parser.add_argument(
        "--provider", "-p",
        choices=["openai", "anthropic", "gemini"],
        help="Filter by provider (for local logs)"
    )
    parser.add_argument(
        "--output", "-o",
        choices=["csv", "json"],
        default="csv",
        help="Output format (default: csv)"
    )
    parser.add_argument(
        "--pricing",
        action="store_true",
        help="Show current pricing information"
    )
    args = parser.parse_args()

    if args.pricing:
        print_pricing_info()
        return

    print("=" * 60)
    print("COST CALCULATION")
    print("=" * 60)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"Calculated at: {timestamp}\n")

    # Load records
    if args.file:
        print(f"Loading from file: {args.file}")
        results = calculate_from_file(args.file)
    else:
        print("Loading from local usage logs...")
        results = calculate_from_local_logs(args.provider)

    if not results:
        print("\nNo usage records found.")
        print("Try one of these options:")
        print("  1. Run 'python generate_traffic.py' first to generate usage")
        print("  2. Specify a file with --file")
        print("  3. Check output/usage_events.jsonl exists")
        return

    print(f"Processed {len(results)} records")

    # Export results
    output_path = export_results(results, args.output)
    print(f"Exported to: {output_path}")

    # Print summary
    print_summary(results)


if __name__ == "__main__":
    main()
