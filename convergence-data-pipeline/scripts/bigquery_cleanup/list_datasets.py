#!/usr/bin/env python3
"""
List BigQuery datasets with categorization.

Usage:
    python list_datasets.py
    python list_datasets.py --project gac-prod-471220
"""

import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="List BigQuery datasets")
    parser.add_argument("--project", default="gac-prod-471220", help="GCP Project ID")
    parser.add_argument("--sa-file", help="Service account JSON file path")
    args = parser.parse_args()

    from google.cloud import bigquery

    # Find default SA file
    if not args.sa_file:
        default_sa = Path.home() / ".gcp" / "gac-prod-471220-7a1eb8cb0a6a.json"
        if default_sa.exists():
            args.sa_file = str(default_sa)

    if args.sa_file:
        from google.oauth2 import service_account
        credentials = service_account.Credentials.from_service_account_file(args.sa_file)
        client = bigquery.Client(credentials=credentials, project=args.project)
    else:
        client = bigquery.Client(project=args.project)

    print(f"Datasets in {args.project}:")
    print("-" * 50)

    datasets = list(client.list_datasets())
    for ds in sorted(datasets, key=lambda x: x.dataset_id):
        print(f"  {ds.dataset_id}")

    print("-" * 50)
    print(f"Total: {len(datasets)} datasets")


if __name__ == "__main__":
    main()
