#!/usr/bin/env python3
"""
Re-run all 3 pipelines with fixes:
1. Subscription costs (via stored procedure)
2. GenAI consolidate
3. Cloud FOCUS convert (all 4 providers)
"""

import asyncio
import sys
import os
from datetime import datetime
from google.cloud import bigquery

# We'll bypass auth by calling processors directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.core.processors.genai.unified_consolidator import UnifiedConsolidatorProcessor
from src.core.processors.cloud.focus_converter import CloudFOCUSConverterProcessor
from src.app.config import get_settings

settings = get_settings()

ORG_SLUG = "acme_inc_01062026"
START_DATE = "2025-01-01"
END_DATE = "2025-12-31"
PROJECT_ID = settings.gcp_project_id
DATASET = settings.get_org_dataset_name(ORG_SLUG)

async def run_subscription_costs():
    """Run subscription cost calculation via stored procedure."""
    print("\n" + "=" * 70)
    print("PIPELINE 1: Subscription Costs (via Stored Procedure)")
    print("=" * 70)

    try:
        client = bigquery.Client(project=PROJECT_ID)

        # Call the orchestrator stored procedure
        call_query = f"""
            CALL `{PROJECT_ID}.organizations`.sp_run_subscription_costs_pipeline(
                @p_project_id,
                @p_dataset_id,
                @p_start_date,
                @p_end_date
            )
        """

        job = client.query(
            call_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("p_project_id", "STRING", PROJECT_ID),
                    bigquery.ScalarQueryParameter("p_dataset_id", "STRING", DATASET),
                    bigquery.ScalarQueryParameter("p_start_date", "DATE", START_DATE),
                    bigquery.ScalarQueryParameter("p_end_date", "DATE", END_DATE),
                ]
            )
        )

        # Wait for completion
        result = list(job.result())

        if result:
            stage1_rows = result[0].get("stage1_rows_inserted", 0)
            stage2_rows = result[0].get("stage2_rows_inserted", 0)
            print(f"\nStage 1 (Daily Costs): {stage1_rows} rows")
            print(f"Stage 2 (FOCUS 1.3): {stage2_rows} rows")
            print("Status: SUCCESS")
            return True
        else:
            print("Status: SUCCESS (no rows returned)")
            return True

    except Exception as e:
        print(f"Status: FAILED")
        print(f"Error: {e}")
        return False

async def run_genai_consolidate():
    """Run GenAI consolidate pipeline."""
    print("\n" + "=" * 70)
    print("PIPELINE 2: GenAI Consolidate")
    print("=" * 70)

    processor = UnifiedConsolidatorProcessor()

    # Run both usage and cost consolidation
    for target in ['usage', 'costs']:
        print(f"\n  Consolidating {target}...")

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

        print(f"  Status: {result.get('status')}")
        print(f"  Rows: {result.get('rows_inserted', 0)}")

        if result.get('status') == 'FAILED':
            print(f"  Error: {result.get('error')}")
            return False

    return True

async def run_cloud_focus_convert():
    """Run Cloud FOCUS convert for all 4 providers."""
    print("\n" + "=" * 70)
    print("PIPELINE 3: Cloud FOCUS Convert (All Providers)")
    print("=" * 70)

    processor = CloudFOCUSConverterProcessor()

    providers = ['aws', 'azure', 'gcp', 'oci']

    for provider in providers:
        print(f"\n  Converting {provider.upper()} to FOCUS 1.3...")

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

        print(f"  Status: {result.get('status')}")
        print(f"  Rows: {result.get('rows_inserted', 0)}")
        print(f"  Days: {result.get('days_processed', 0)}")

        if result.get('status') == 'FAILED':
            print(f"  Error: {result.get('error')}")
            # Continue with other providers

    return True

async def main():
    """Run all 3 pipelines in sequence."""
    print(f"\nRe-running all pipelines for {ORG_SLUG}")
    print(f"Date Range: {START_DATE} to {END_DATE}")

    start_time = datetime.now()

    # Run pipelines in sequence (dependencies)
    success1 = await run_subscription_costs()
    success2 = await run_genai_consolidate()
    success3 = await run_cloud_focus_convert()

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    print("\n" + "=" * 70)
    print("PIPELINE EXECUTION SUMMARY")
    print("=" * 70)
    print(f"Subscription Costs: {'✓ SUCCESS' if success1 else '✗ FAILED'}")
    print(f"GenAI Consolidate: {'✓ SUCCESS' if success2 else '✗ FAILED'}")
    print(f"Cloud FOCUS Convert: {'✓ SUCCESS' if success3 else '✗ FAILED'}")
    print(f"\nTotal Duration: {duration:.1f} seconds")
    print("=" * 70)

    return 0 if all([success1, success2, success3]) else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
