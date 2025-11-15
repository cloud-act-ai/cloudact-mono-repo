#!/usr/bin/env python3
"""
Recreate pipeline_runs table with updated schema including run_date
"""
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from google.cloud import bigquery
from src.core.metadata.initializer import MetadataInitializer
from src.app.config import settings

# Set credentials
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/gurukallam/.gcp/gac-prod-471220-e34944040b62.json"
os.environ["GCP_PROJECT_ID"] = "gac-prod-471220"

def main():
    print("=" * 80)
    print("RECREATE PIPELINE_RUNS TABLE WITH RUN_DATE")
    print("=" * 80)
    print()

    # Create BigQuery client
    client = bigquery.Client(project="gac-prod-471220")

    # Create metadata initializer
    initializer = MetadataInitializer(client)

    # Get tenant dataset name (acme1281)
    tenant_id = "acme1281"
    dataset_name = settings.get_tenant_dataset_name(tenant_id, "metadata")
    table_id = f"{settings.gcp_project_id}.{dataset_name}.pipeline_runs"

    print(f"Table ID: {table_id}")
    print()

    # Check if table exists
    try:
        table = client.get_table(table_id)
        print(f"Current schema has {len(table.schema)} columns:")
        for field in table.schema:
            print(f"  - {field.name} ({field.field_type})")
        print()
    except Exception as e:
        print(f"Table does not exist yet: {e}")
        print()

    # Recreate table with updated schema
    print("Recreating table with updated schema (including run_date)...")
    print()

    initializer._ensure_pipeline_runs_table(dataset_name, recreate=True)

    print()
    print("=" * 80)
    print("TABLE RECREATED SUCCESSFULLY")
    print("=" * 80)

    # Verify new schema
    table = client.get_table(table_id)
    print(f"\nNew schema has {len(table.schema)} columns:")
    for field in table.schema:
        desc = field.description[:60] + "..." if len(field.description or "") > 60 else field.description
        print(f"  - {field.name:20s} {field.field_type:10s} {field.mode:10s} {desc}")

    print()
    print("✓ pipeline_runs table now includes run_date column")

if __name__ == "__main__":
    main()
