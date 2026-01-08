#!/usr/bin/env python3
"""Run subscription costs pipeline directly."""

import asyncio
import sys
import os
from datetime import datetime

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from google.cloud import bigquery
from src.app.config import get_settings

settings = get_settings()
ORG_SLUG = "acme_inc_01062026"
DATASET = settings.get_org_dataset_name(ORG_SLUG)
PROJECT_ID = settings.gcp_project_id
START_DATE = "2025-01-01"
END_DATE = "2025-12-31"

def main():
    """Run subscription costs pipeline."""
    print("=" * 70)
    print("Subscription Costs Pipeline")
    print("=" * 70)
    print(f"Org: {ORG_SLUG}")
    print(f"Dataset: {DATASET}")
    print(f"Date Range: {START_DATE} to {END_DATE}")
    print("=" * 70)

    client = bigquery.Client(project=PROJECT_ID)

    # Call the orchestrator stored procedure
    query = f"""
        CALL `{PROJECT_ID}.organizations.sp_subscription_4_run_pipeline`(
            @project_id,
            @dataset_id,
            @start_date,
            @end_date
        )
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("project_id", "STRING", PROJECT_ID),
            bigquery.ScalarQueryParameter("dataset_id", "STRING", DATASET),
            bigquery.ScalarQueryParameter("start_date", "DATE", datetime.strptime(START_DATE, "%Y-%m-%d").date()),
            bigquery.ScalarQueryParameter("end_date", "DATE", datetime.strptime(END_DATE, "%Y-%m-%d").date())
        ]
    )

    print("\nExecuting subscription costs pipeline...")
    job = client.query(query, job_config=job_config)
    job.result()  # Wait for completion

    print("\n" + "=" * 70)
    print("RESULT")
    print("=" * 70)
    print("Status: SUCCESS")
    print("Subscription costs calculated and converted to FOCUS 1.3")
    print("=" * 70)

    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
