#!/usr/bin/env python3
"""
Bootstrap Sync Job
==================
Adds new columns to existing meta tables.
Safe operation - BigQuery only allows adding columns, never deleting.

Usage:
    python jobs/bootstrap_sync.py

Environment:
    GCP_PROJECT_ID: GCP Project ID
"""

import asyncio
import os
import sys
import json
import yaml
from pathlib import Path

# Add parent paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '02-api-service'))


async def main():
    print("=" * 60)
    print("CloudAct Bootstrap Sync Job")
    print("=" * 60)

    project_id = os.environ.get("GCP_PROJECT_ID")
    if not project_id:
        print("ERROR: GCP_PROJECT_ID environment variable required")
        sys.exit(1)

    print(f"Project: {project_id}")
    print()

    try:
        from google.cloud import bigquery

        client = bigquery.Client(project=project_id)

        # Load bootstrap config
        api_service_path = Path(__file__).parent.parent.parent / "02-api-service"
        config_dir = api_service_path / "configs" / "setup" / "bootstrap"
        config_file = config_dir / "config.yml"
        schemas_dir = config_dir / "schemas"

        if not config_file.exists():
            print(f"ERROR: Config file not found: {config_file}")
            sys.exit(1)

        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        dataset_name = config.get('dataset', {}).get('name', 'organizations')
        dataset_id = f"{project_id}.{dataset_name}"

        # Check if dataset exists
        try:
            client.get_dataset(dataset_id)
        except Exception as e:
            if "not found" in str(e).lower():
                print(f"Dataset {dataset_name} not found. Run bootstrap first.")
                sys.exit(1)
            raise

        columns_added = {}
        tables_config = config.get('tables', {})

        for table_name in tables_config.keys():
            schema_file = schemas_dir / f"{table_name}.json"
            if not schema_file.exists():
                print(f"  Warning: Schema file not found for {table_name}")
                continue

            with open(schema_file, 'r') as f:
                schema_json = json.load(f)

            table_id = f"{dataset_id}.{table_name}"

            try:
                existing_table = client.get_table(table_id)
                existing_columns = {field.name for field in existing_table.schema}
                expected_columns = {field['name'] for field in schema_json}

                missing_columns = expected_columns - existing_columns

                if missing_columns:
                    for col_name in missing_columns:
                        col_def = next((f for f in schema_json if f['name'] == col_name), None)
                        if col_def:
                            col_type = col_def['type']
                            alter_sql = f"""
                            ALTER TABLE `{table_id}`
                            ADD COLUMN IF NOT EXISTS {col_name} {col_type}
                            """
                            client.query(alter_sql).result()

                            if table_name not in columns_added:
                                columns_added[table_name] = []
                            columns_added[table_name].append(col_name)
                            print(f"  + {table_name}.{col_name} ({col_type})")

            except Exception as e:
                if "not found" not in str(e).lower():
                    print(f"  Error syncing {table_name}: {e}")

        print()
        if columns_added:
            total_cols = sum(len(v) for v in columns_added.values())
            print(f"✓ Sync complete: Added {total_cols} columns to {len(columns_added)} tables")
        else:
            print("✓ Sync complete: Schema already up to date")
        print("=" * 60)

    except Exception as e:
        print(f"✗ Sync failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
