#!/usr/bin/env python3
"""
BigQuery Test Dataset Cleanup Script

Safely removes test datasets while protecting production data.

Usage:
    # Dry-run (default) - list what would be deleted
    python cleanup_test_datasets.py

    # Actually delete
    python cleanup_test_datasets.py --delete

    # Use specific service account
    python cleanup_test_datasets.py --sa-file /path/to/sa.json

    # Specify project
    python cleanup_test_datasets.py --project your-project-id
"""

import argparse
import sys
from pathlib import Path
from typing import List, Tuple


def get_bigquery_client(project_id: str, sa_file: str = None):
    """Initialize BigQuery client with optional service account."""
    from google.cloud import bigquery

    if sa_file:
        from google.oauth2 import service_account
        credentials = service_account.Credentials.from_service_account_file(sa_file)
        return bigquery.Client(credentials=credentials, project=project_id)
    return bigquery.Client(project=project_id)


# Datasets to NEVER delete (protected)
PROTECTED_PATTERNS = [
    "organizations",      # Central metadata
    "billing",            # Billing data
    "usage",              # Usage data
    "cost",               # Cost data
    "cloudact",           # CloudAct system datasets
    "committed",          # Committed use discounts
]

# Patterns that indicate test datasets (delete candidates)
TEST_PATTERNS = [
    "_local",             # Local dev environment suffix
    "test_",              # Test prefix
    "_test",              # Test suffix
    "e2e_",               # E2E test prefix
]


def is_protected(dataset_id: str) -> bool:
    """Check if dataset should be protected from deletion."""
    ds_lower = dataset_id.lower()
    return any(pattern in ds_lower for pattern in PROTECTED_PATTERNS)


def is_test_dataset(dataset_id: str) -> bool:
    """Check if dataset appears to be a test dataset."""
    ds_lower = dataset_id.lower()
    return any(pattern in ds_lower for pattern in TEST_PATTERNS)


def categorize_datasets(datasets: List) -> Tuple[List[str], List[str], List[str]]:
    """Categorize datasets into protected, test, and unknown."""
    protected = []
    test = []
    unknown = []

    for ds in datasets:
        ds_id = ds.dataset_id
        if is_protected(ds_id):
            protected.append(ds_id)
        elif is_test_dataset(ds_id):
            test.append(ds_id)
        else:
            unknown.append(ds_id)

    return protected, test, unknown


def main():
    parser = argparse.ArgumentParser(description="Cleanup test BigQuery datasets")
    parser.add_argument("--project", default=None, help="GCP Project ID (or set GCP_PROJECT_ID env var)")
    parser.add_argument("--sa-file", help="Service account JSON file path")
    parser.add_argument("--delete", action="store_true", help="Actually delete (default is dry-run)")
    parser.add_argument("--include-unknown", action="store_true", help="Include unknown datasets in deletion")
    args = parser.parse_args()

    import os

    # Get project from arg or env var
    project = args.project or os.environ.get("GCP_PROJECT_ID")
    if not project:
        print("Error: --project argument or GCP_PROJECT_ID env var required")
        sys.exit(1)
    args.project = project

    # Find SA file from env var or arg
    if not args.sa_file:
        args.sa_file = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if args.sa_file:
            print(f"Using service account: {args.sa_file}")

    try:
        client = get_bigquery_client(args.project, args.sa_file)
    except Exception as e:
        print(f"Error connecting to BigQuery: {e}")
        print("\nTry: gcloud auth application-default login")
        sys.exit(1)

    print(f"\nListing datasets in {args.project}...")
    datasets = list(client.list_datasets())
    print(f"Found {len(datasets)} datasets\n")

    protected, test, unknown = categorize_datasets(datasets)

    # Display categorized datasets
    print("=" * 60)
    print(f"PROTECTED (will NEVER delete): {len(protected)}")
    print("=" * 60)
    for ds in sorted(protected):
        print(f"  [PROTECTED] {ds}")

    print()
    print("=" * 60)
    print(f"TEST DATASETS (candidates for deletion): {len(test)}")
    print("=" * 60)
    for ds in sorted(test):
        print(f"  [TEST] {ds}")

    print()
    print("=" * 60)
    print(f"UNKNOWN (not categorized): {len(unknown)}")
    print("=" * 60)
    for ds in sorted(unknown):
        print(f"  [UNKNOWN] {ds}")

    # Determine what to delete
    to_delete = test.copy()
    if args.include_unknown:
        to_delete.extend(unknown)

    print()
    print("=" * 60)
    print(f"SUMMARY")
    print("=" * 60)
    print(f"  Protected: {len(protected)}")
    print(f"  Test:      {len(test)}")
    print(f"  Unknown:   {len(unknown)}")
    print(f"  To delete: {len(to_delete)}")

    if not to_delete:
        print("\nNo datasets to delete.")
        return

    if not args.delete:
        print("\n[DRY-RUN MODE] No changes made.")
        print("Run with --delete to actually delete datasets.")
        return

    # Confirm deletion
    print(f"\nAbout to DELETE {len(to_delete)} datasets:")
    for ds in sorted(to_delete):
        print(f"  - {ds}")

    confirm = input("\nType 'yes' to confirm deletion: ")
    if confirm.lower() != "yes":
        print("Cancelled.")
        return

    # Delete datasets
    deleted = 0
    failed = 0
    for ds_id in to_delete:
        try:
            full_id = f"{args.project}.{ds_id}"
            client.delete_dataset(full_id, delete_contents=True, not_found_ok=True)
            print(f"  Deleted: {ds_id}")
            deleted += 1
        except Exception as e:
            print(f"  FAILED: {ds_id} - {e}")
            failed += 1

    print(f"\n--- Complete ---")
    print(f"Deleted: {deleted}")
    print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
