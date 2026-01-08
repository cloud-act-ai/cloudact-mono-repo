#!/usr/bin/env python3
"""Run GenAI consolidate pipeline directly."""

import asyncio
import sys
import os

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.core.processors.genai.unified_consolidator import UnifiedConsolidatorProcessor

ORG_SLUG = "acme_inc_01062026"
START_DATE = "2025-01-01"
END_DATE = "2025-12-31"

async def main():
    """Run GenAI consolidate for both usage and costs."""
    print("=" * 70)
    print("GenAI Consolidate Pipeline")
    print("=" * 70)

    processor = UnifiedConsolidatorProcessor()

    # Consolidate costs (we have 3,707 PAYG cost records ready)
    for target in ['costs']:  # Just costs for now
        print(f"\nConsolidating {target}...")

        # Calculate total days for progress tracking
        from datetime import datetime as dt
        start = dt.strptime(START_DATE, "%Y-%m-%d").date()
        end = dt.strptime(END_DATE, "%Y-%m-%d").date()
        total_days = (end - start).days + 1
        print(f"Processing {total_days} days from {START_DATE} to {END_DATE}...")

        step_config = {
            "config": {
                "target": target,
                "start_date": START_DATE,
                "end_date": END_DATE
            }
        }

        context = {
            "org_slug": ORG_SLUG,
            "run_id": f"manual-genai-consolidate-{target}",
            "credential_id": "demo-credential"
        }

        result = await processor.execute(step_config, context)

        print(f"\n" + "=" * 70)
        print("RESULT")
        print("=" * 70)
        print(f"Status: {result.get('status')}")
        print(f"Rows inserted: {result.get('rows_inserted', 0)}")
        print(f"Days processed: {result.get('days_processed', 0)}/{total_days}")

        if result.get('status') == 'FAILED':
            print(f"Error: {result.get('error')}")
            return 1

    print("\nAll consolidation complete!")
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
