#!/usr/bin/env python3
"""
List BigQuery datasets with categorization.

Usage:
    python list_datasets.py
    python list_datasets.py --project your-project-id
"""

import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="List BigQuery datasets")
    parser.add_argument("--project", default=None, help="GCP Project ID (or set GCP_PROJECT_ID env var)")
    parser.add_argument("--sa-file", help="Service account JSON file path")
    args = parser.parse_args()

    from google.cloud import bigquery

    import os

    # Get project from arg or env var
    project = args.project or os.environ.get("GCP_PROJECT_ID")
    if not project:
        print("Error: --project argument or GCP_PROJECT_ID env var required")
        return

    # Find SA file from env var or arg
    if not args.sa_file:
        args.sa_file = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

    if args.sa_file:
        from google.oauth2 import service_account
        credentials = service_account.Credentials.from_service_account_file(args.sa_file)
        client = bigquery.Client(credentials=credentials, project=project)
    else:
        client = bigquery.Client(project=project)

    print(f"Datasets in {project}:")
    print("-" * 50)

    datasets = list(client.list_datasets())
    for ds in sorted(datasets, key=lambda x: x.dataset_id):
        print(f"  {ds.dataset_id}")

    print("-" * 50)
    print(f"Total: {len(datasets)} datasets")


if __name__ == "__main__":
    main()
