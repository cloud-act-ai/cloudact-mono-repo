#!/usr/bin/env python3
"""Run Cloud FOCUS conversion pipelines for all providers."""

import asyncio
import sys
import os

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.core.processors.cloud.focus_converter import CloudFOCUSConverterProcessor

ORG_SLUG = "acme_inc_01062026"
START_DATE = "2025-01-01"
END_DATE = "2025-12-31"

# Cloud providers to process
PROVIDERS = ["aws", "azure", "gcp", "oci"]

async def main():
    """Run FOCUS conversion for all cloud providers."""
    print("=" * 70)
    print("Cloud FOCUS Conversion Pipelines")
    print("=" * 70)
    print(f"Org: {ORG_SLUG}")
    print(f"Date Range: {START_DATE} to {END_DATE}")
    print(f"Providers: {', '.join(PROVIDERS)}")
    print("=" * 70)

    processor = CloudFOCUSConverterProcessor()
    total_days = 365
    all_results = {}

    for provider in PROVIDERS:
        print(f"\n{'='*70}")
        print(f"Processing {provider.upper()}...")
        print(f"{'='*70}")

        step_config = {
            "config": {
                "provider": provider,
                "start_date": START_DATE,
                "end_date": END_DATE
            }
        }

        context = {
            "org_slug": ORG_SLUG,
            "run_id": f"manual-cloud-focus-{provider}",
            "credential_id": "demo-credential"
        }

        result = await processor.execute(step_config, context)

        print(f"\nStatus: {result.get('status')}")
        print(f"Rows inserted: {result.get('rows_inserted', 0)}")
        print(f"Days processed: {result.get('days_processed', 0)}/{total_days}")

        if result.get('status') == 'FAILED':
            print(f"Error: {result.get('error')}")
            all_results[provider] = "FAILED"
        else:
            all_results[provider] = "SUCCESS"

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for provider, status in all_results.items():
        symbol = "✓" if status == "SUCCESS" else "✗"
        print(f"{symbol} {provider.upper():6} {status}")
    print("=" * 70)

    # Return 0 if all succeeded, 1 if any failed
    return 0 if all(status == "SUCCESS" for status in all_results.values()) else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
