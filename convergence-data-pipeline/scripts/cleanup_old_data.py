#!/usr/bin/env python3
"""
Cleanup script to remove old tenant datasets and keep only the 5 new customers.
This will delete all old tenant data except:
- acmeinc_23xv2
- techcorp_99zx4
- datasystems_45abc
- cloudworks_78def
- bytefactory_12ghi
"""
import os
from google.cloud import bigquery

# Keep these datasets (new architecture)
KEEP_DATASETS = {
    "acmeinc_23xv2",
    "techcorp_99zx4",
    "datasystems_45abc",
    "cloudworks_78def",
    "bytefactory_12ghi",
}

def main():
    # Initialize BigQuery client
    project_id = "gac-prod-471220"
    client = bigquery.Client(project=project_id)

    print("=" * 60)
    print("CLEANUP: Removing Old Tenant Datasets")
    print("=" * 60)
    print()

    # List all datasets
    datasets = list(client.list_datasets())

    if not datasets:
        print("No datasets found in project.")
        return

    print(f"Found {len(datasets)} dataset(s) in project {project_id}")
    print()

    datasets_to_delete = []
    datasets_to_keep = []

    for dataset in datasets:
        dataset_id = dataset.dataset_id

        if dataset_id in KEEP_DATASETS:
            datasets_to_keep.append(dataset_id)
            print(f"✓ KEEPING: {dataset_id} (new architecture)")
        else:
            datasets_to_delete.append(dataset_id)
            print(f"✗ DELETING: {dataset_id} (old data)")

    print()
    print("=" * 60)
    print(f"Summary: {len(datasets_to_keep)} to keep, {len(datasets_to_delete)} to delete")
    print("=" * 60)
    print()

    if not datasets_to_delete:
        print("No datasets to delete. Cleanup complete!")
        return

    # Delete old datasets
    for dataset_id in datasets_to_delete:
        try:
            print(f"Deleting dataset: {dataset_id}...")
            dataset_ref = client.dataset(dataset_id)
            # Delete all tables in dataset first
            client.delete_dataset(dataset_ref, delete_contents=True, not_found_ok=True)
            print(f"  ✓ Deleted: {dataset_id}")
        except Exception as e:
            print(f"  ✗ Failed to delete {dataset_id}: {e}")

    print()
    print("=" * 60)
    print("Cleanup Complete!")
    print("=" * 60)
    print()
    print("Remaining datasets (new architecture):")
    for dataset_id in sorted(datasets_to_keep):
        print(f"  - {dataset_id}")
    print()

if __name__ == "__main__":
    main()
