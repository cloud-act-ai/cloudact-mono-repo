#!/usr/bin/env python3
"""
Temporary script to run PAYG cost calculation for demo data.
Bypasses HTTP API authentication for local testing.
"""

import asyncio
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.core.processors.genai.payg_cost import PAYGCostProcessor

async def main():
    """Run PAYG cost calculation for all providers."""
    processor = PAYGCostProcessor()

    # Configuration
    step_config = {
        "config": {
            # No provider = process ALL providers
            "force_reprocess": False
        }
    }

    context = {
        "org_slug": "acme_inc_01062026",
        "start_date": "2025-01-01",
        "end_date": "2025-12-31",
        "run_id": "manual-test-payg-cost",
        "credential_id": "demo-credential"
    }

    print(f"Running PAYG cost calculation for {context['org_slug']}")
    print(f"Date range: {context['start_date']} to {context['end_date']}")
    print(f"Processing all providers...")
    print()

    # Execute
    result = await processor.execute(step_config, context)

    # Print results
    print("\n=== PAYG Cost Calculation Results ===")
    print(f"Status: {result.get('status')}")
    print(f"Rows Inserted: {result.get('rows_inserted', 0)}")
    print(f"Days Processed: {result.get('days_processed', 0)}")
    print(f"Total Cost USD: ${result.get('total_cost_usd', 0):.2f}")

    if result.get('status') == 'FAILED':
        print(f"Error: {result.get('error')}")
        return 1

    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
