#!/usr/bin/env python3
"""
Cleanup Script: Remove Duplicate tenant_pipeline_runs Tables

WHY: tenant_pipeline_runs should ONLY exist in central 'tenants' dataset
     for centralized logging across ALL tenants.

THIS SCRIPT: Deletes tenant_pipeline_runs from per-tenant datasets
             (it was mistakenly created there by old onboarding pipeline)

Usage:
    python scripts/cleanup_duplicate_meta_tables.py --dry-run   # Preview
    python scripts/cleanup_duplicate_meta_tables.py             # Execute
"""

import argparse
import sys
from pathlib import Path
from google.cloud import bigquery

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.app.config import get_settings

class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'


def find_tenant_datasets(client, project_id):
    """Find all tenant datasets (exclude 'tenants' central dataset)"""
    datasets = list(client.list_datasets(project_id))
    tenant_datasets = []

    for dataset in datasets:
        dataset_id = dataset.dataset_id
        # Skip central tenants dataset
        if dataset_id != "tenants":
            tenant_datasets.append(dataset_id)

    return tenant_datasets


def check_table_exists(client, project_id, dataset_id, table_name):
    """Check if table exists in dataset"""
    try:
        table_id = f"{project_id}.{dataset_id}.{table_name}"
        client.get_table(table_id)
        return True
    except Exception:
        return False


def delete_table(client, project_id, dataset_id, table_name, dry_run=False):
    """Delete table from dataset"""
    table_id = f"{project_id}.{dataset_id}.{table_name}"

    if dry_run:
        print(f"{Colors.YELLOW}[DRY-RUN]{Colors.NC} Would delete: {table_id}")
        return True

    try:
        client.delete_table(table_id, not_found_ok=True)
        print(f"{Colors.GREEN}✓ Deleted:{Colors.NC} {table_id}")
        return True
    except Exception as e:
        print(f"{Colors.RED}✗ Failed to delete {table_id}:{Colors.NC} {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Remove duplicate tenant_pipeline_runs tables from per-tenant datasets"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be deleted without actually deleting"
    )
    args = parser.parse_args()

    print(f"{Colors.BLUE}{'='*80}{Colors.NC}")
    print(f"{Colors.BLUE}Cleanup Duplicate tenant_pipeline_runs Tables{Colors.NC}")
    print(f"{Colors.BLUE}{'='*80}{Colors.NC}\n")

    if args.dry_run:
        print(f"{Colors.YELLOW}DRY-RUN MODE: No tables will be deleted{Colors.NC}\n")

    # Get settings
    settings = get_settings()
    project_id = settings.gcp_project_id

    print(f"Project ID: {project_id}")
    print(f"Central Dataset: tenants (tenant_pipeline_runs should ONLY be here)\n")

    # Initialize BigQuery client
    client = bigquery.Client(project=project_id)

    # Find all tenant datasets
    print(f"{Colors.BLUE}Finding tenant datasets...{Colors.NC}")
    tenant_datasets = find_tenant_datasets(client, project_id)
    print(f"Found {len(tenant_datasets)} tenant datasets\n")

    # Check each tenant dataset for tenant_pipeline_runs
    tables_to_delete = []

    for dataset_id in tenant_datasets:
        if check_table_exists(client, project_id, dataset_id, "tenant_pipeline_runs"):
            tables_to_delete.append(dataset_id)
            print(f"{Colors.RED}✗ DUPLICATE FOUND:{Colors.NC} {dataset_id}.tenant_pipeline_runs")

    # Summary
    print(f"\n{Colors.BLUE}{'='*80}{Colors.NC}")
    print(f"{Colors.BLUE}Summary{Colors.NC}")
    print(f"{Colors.BLUE}{'='*80}{Colors.NC}")
    print(f"Total tenant datasets scanned: {len(tenant_datasets)}")
    print(f"Duplicate tenant_pipeline_runs tables found: {len(tables_to_delete)}")

    if not tables_to_delete:
        print(f"\n{Colors.GREEN}✓ No cleanup needed! All tenant_pipeline_runs are properly in central dataset{Colors.NC}")
        return 0

    # Delete duplicates
    if not args.dry_run:
        print(f"\n{Colors.YELLOW}Proceeding with deletion...{Colors.NC}")
        response = input("Are you sure? Type 'yes' to continue: ")
        if response.lower() != 'yes':
            print("Aborted.")
            return 1

    print()
    deleted_count = 0
    for dataset_id in tables_to_delete:
        if delete_table(client, project_id, dataset_id, "tenant_pipeline_runs", args.dry_run):
            deleted_count += 1

    # Final summary
    print(f"\n{Colors.BLUE}{'='*80}{Colors.NC}")
    if args.dry_run:
        print(f"{Colors.YELLOW}DRY-RUN COMPLETE:{Colors.NC} {deleted_count} tables would be deleted")
        print(f"\nRun without --dry-run to actually delete tables")
    else:
        print(f"{Colors.GREEN}✓ CLEANUP COMPLETE:{Colors.NC} Deleted {deleted_count} duplicate tables")
        print(f"\ntenant_pipeline_runs now exists ONLY in central 'tenants' dataset")
    print(f"{Colors.BLUE}{'='*80}{Colors.NC}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
