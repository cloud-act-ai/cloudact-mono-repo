#!/usr/bin/env python3
"""
Bootstrap Job
=============
Initializes the organizations dataset and 21 meta tables.
Run this once during initial deployment or disaster recovery.

Usage:
    python jobs/bootstrap.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
"""

import asyncio
import os
import sys

# Add parent paths to allow imports from api-service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '02-api-service'))


async def main():
    print("=" * 60)
    print("CloudAct Bootstrap Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project: {project_id}")
    print()

    try:
        from src.core.processors.setup.initial.onetime_bootstrap_processor import OnetimeBootstrapProcessor

        processor = OnetimeBootstrapProcessor()
        result = await processor.execute(
            step_config={},
            context={
                "force_recreate_dataset": False,
                "force_recreate_tables": False
            }
        )

        tables_created = result.get("tables_created", 0)
        print()
        print(f"✓ Bootstrap complete: Created {tables_created} tables")
        print("=" * 60)

    except Exception as e:
        print(f"✗ Bootstrap failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
