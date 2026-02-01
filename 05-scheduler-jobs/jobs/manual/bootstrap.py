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
from datetime import datetime, timezone


async def main():
    print("=" * 60)
    print("CloudAct Bootstrap Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project:   {project_id}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print()

    try:
        # Import from API service code (available via PYTHONPATH=/app)
        from src.core.processors.setup.initial.onetime_bootstrap_processor import OnetimeBootstrapProcessor

        processor = OnetimeBootstrapProcessor()
        result = await processor.execute(
            step_config={},
            context={
                "force_recreate_dataset": False,
                "force_recreate_tables": False
            }
        )

        status = result.get("status", "UNKNOWN")
        tables_created = result.get("tables_created", [])
        tables_existed = result.get("tables_existed", [])

        print()
        if status == "SUCCESS":
            print(f"✓ Bootstrap complete")
            print(f"  Tables created: {len(tables_created)}")
            print(f"  Tables existed: {len(tables_existed)}")
            print(f"  Total tables:   {result.get('total_tables', 0)}")
        else:
            print(f"✗ Bootstrap failed: {result.get('message', 'Unknown error')}")
            sys.exit(1)

        print("=" * 60)

    except Exception as e:
        print(f"✗ Bootstrap failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
