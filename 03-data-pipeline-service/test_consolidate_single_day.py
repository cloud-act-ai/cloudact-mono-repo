#!/usr/bin/env python3
"""Test GenAI consolidate for a single day."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.core.processors.genai.unified_consolidator import UnifiedConsolidatorProcessor

ORG_SLUG = "acme_inc_01062026"
TEST_DATE = "2025-06-15"  # Test with a single mid-year date

async def main():
    """Run GenAI consolidate for a single day."""
    print("=" * 70)
    print("GenAI Consolidate - Single Day Test")
    print("=" * 70)
    print(f"Org: {ORG_SLUG}")
    print(f"Date: {TEST_DATE}")
    print()

    processor = UnifiedConsolidatorProcessor()

    step_config = {
        "config": {
            "target": "costs",
            "date": TEST_DATE
        }
    }

    context = {
        "org_slug": ORG_SLUG,
        "run_id": f"test-consolidate-{TEST_DATE}",
        "credential_id": "demo-credential"
    }

    print("Starting consolidation...")
    result = await processor.execute(step_config, context)

    print("\n" + "=" * 70)
    print("RESULT")
    print("=" * 70)
    print(f"Status: {result.get('status')}")
    print(f"Rows inserted: {result.get('rows_inserted', 0)}")
    print(f"Days processed: {result.get('days_processed', 0)}")

    if result.get('status') == 'FAILED':
        print(f"Error: {result.get('error')}")
        return 1

    print("\nSuccess!")
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
