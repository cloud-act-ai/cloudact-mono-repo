#!/usr/bin/env python3
"""Run GenAI to FOCUS 1.3 conversion."""

import sys
import os
from datetime import datetime, timedelta
from google.cloud import bigquery

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from src.app.config import get_settings

settings = get_settings()
ORG_SLUG = "acme_inc_01062026"
DATASET = settings.get_org_dataset_name(ORG_SLUG)
PROJECT_ID = settings.gcp_project_id
START_DATE = "2025-01-01"
END_DATE = "2025-12-31"

def main():
    """Convert GenAI costs to FOCUS 1.3 for all days."""
    print("=" * 70)
    print("GenAI to FOCUS 1.3 Conversion")
    print("=" * 70)
    print(f"Org: {ORG_SLUG}")
    print(f"Dataset: {DATASET}")
    print(f"Date Range: {START_DATE} to {END_DATE}")
    print("=" * 70)

    client = bigquery.Client(project=PROJECT_ID)

    # Generate date range
    start = datetime.strptime(START_DATE, "%Y-%m-%d").date()
    end = datetime.strptime(END_DATE, "%Y-%m-%d").date()
    dates = []
    current = start
    while current <= end:
        dates.append(current)
        current += timedelta(days=1)

    print(f"\nProcessing {len(dates)} days...")

    import time
    start_time = time.time()
    total_rows = 0

    for i, process_date in enumerate(dates, 1):
        # Call the conversion procedure for each date
        query = f"""
            CALL `{PROJECT_ID}.organizations.sp_genai_3_convert_to_focus`(
                @project_id,
                @dataset_id,
                @cost_date,
                @credential_id,
                @pipeline_id,
                @run_id
            )
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("project_id", "STRING", PROJECT_ID),
                bigquery.ScalarQueryParameter("dataset_id", "STRING", DATASET),
                bigquery.ScalarQueryParameter("cost_date", "DATE", process_date),
                bigquery.ScalarQueryParameter("credential_id", "STRING", "demo-credential"),
                bigquery.ScalarQueryParameter("pipeline_id", "STRING", "manual-genai-to-focus"),
                bigquery.ScalarQueryParameter("run_id", "STRING", f"manual-{process_date.isoformat()}")
            ]
        )

        job = client.query(query, job_config=job_config)
        job.result()  # Wait for completion

        # Progress reporting every 25 days
        if i % 25 == 0 or i == 1:
            elapsed = time.time() - start_time
            avg_time_per_day = elapsed / i
            remaining_days = len(dates) - i
            estimated_remaining = avg_time_per_day * remaining_days
            print(f"  [{i:3}/{len(dates)}] Processed {process_date} | Remaining: ~{int(estimated_remaining/60)}m {int(estimated_remaining%60)}s")

    print(f"\nProcessed all {len(dates)} days")

    # Count total FOCUS records
    count_query = f"""
        SELECT COUNT(*) as count
        FROM `{PROJECT_ID}.{DATASET}.cost_data_standard_1_3`
        WHERE x_genai_cost_type IS NOT NULL
    """
    result = list(client.query(count_query).result())
    total_rows = result[0].count if result else 0

    print("\n" + "=" * 70)
    print("RESULT")
    print("=" * 70)
    print(f"Status: SUCCESS")
    print(f"GenAI FOCUS records: {total_rows:,}")
    print("=" * 70)

    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
