#!/usr/bin/env python3
"""
Migration Script: Add missing columns to tenant_usage_quotas table

This script fixes the schema mismatch between the deployment script and the actual
schema definition by adding missing columns that async_executor.py depends on.

Run this migration BEFORE deploying new code that uses these columns.
"""

import os
import sys
from google.cloud import bigquery
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.app.config import settings


def run_migration():
    """Run migration to add missing columns to tenant_usage_quotas table."""

    client = bigquery.Client(project=settings.gcp_project_id)
    table_id = f"{settings.gcp_project_id}.tenants.tenant_usage_quotas"

    print(f"Starting migration for table: {table_id}")
    print("-" * 80)

    # Define all ALTER TABLE statements
    migrations = [
        {
            "description": "Add pipelines_cancelled_today column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS pipelines_cancelled_today INT64 DEFAULT 0
            """
        },
        {
            "description": "Add max_concurrent_reached column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS max_concurrent_reached INT64 DEFAULT 0
            """
        },
        {
            "description": "Add quota_exceeded column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS quota_exceeded BOOL DEFAULT FALSE
            """
        },
        {
            "description": "Add quota_warning_sent column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS quota_warning_sent BOOL DEFAULT FALSE
            """
        },
        {
            "description": "Add quota_exceeded_at column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS quota_exceeded_at TIMESTAMP
            """
        },
        {
            "description": "Add total_api_calls_today column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS total_api_calls_today INT64 DEFAULT 0
            """
        },
        {
            "description": "Add total_storage_used_gb column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS total_storage_used_gb NUMERIC(10, 2) DEFAULT 0
            """
        },
        {
            "description": "Add last_pipeline_started_at column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS last_pipeline_started_at TIMESTAMP
            """
        },
        {
            "description": "Add last_pipeline_completed_at column",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ADD COLUMN IF NOT EXISTS last_pipeline_completed_at TIMESTAMP
            """
        },
        {
            "description": "Update concurrent_limit default to 3",
            "sql": f"""
            ALTER TABLE `{table_id}`
            ALTER COLUMN concurrent_limit SET DEFAULT 3
            """
        }
    ]

    # Execute each migration
    success_count = 0
    error_count = 0

    for i, migration in enumerate(migrations, 1):
        print(f"\n[{i}/{len(migrations)}] {migration['description']}")
        try:
            query_job = client.query(migration['sql'])
            query_job.result()  # Wait for completion
            print(f"    ✓ SUCCESS")
            success_count += 1
        except Exception as e:
            error_msg = str(e)
            # Check if column already exists (which is fine)
            if "already exists" in error_msg.lower() or "duplicate" in error_msg.lower():
                print(f"    ℹ SKIPPED (column already exists)")
                success_count += 1
            else:
                print(f"    ✗ ERROR: {error_msg}")
                error_count += 1

    print("\n" + "-" * 80)
    print(f"\nMigration Summary:")
    print(f"  Success: {success_count}/{len(migrations)}")
    print(f"  Errors:  {error_count}/{len(migrations)}")

    # Verify final schema
    print("\n" + "-" * 80)
    print("Verifying final schema...")

    verify_query = f"""
    SELECT
        column_name,
        data_type,
        is_nullable
    FROM `{settings.gcp_project_id}.tenants.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = 'tenant_usage_quotas'
    ORDER BY ordinal_position
    """

    try:
        results = client.query(verify_query).result()
        print("\nCurrent table schema:")
        print(f"{'Column Name':<40} {'Type':<20} {'Nullable':<10}")
        print("-" * 70)
        for row in results:
            print(f"{row.column_name:<40} {row.data_type:<20} {row.is_nullable:<10}")

        # Check for required columns
        required_columns = [
            'max_concurrent_reached',
            'last_pipeline_started_at',
            'last_pipeline_completed_at',
            'pipelines_cancelled_today',
            'quota_exceeded',
            'total_api_calls_today',
            'total_storage_used_gb'
        ]

        existing_columns = {row.column_name for row in client.query(verify_query).result()}
        missing_columns = [col for col in required_columns if col not in existing_columns]

        print("\n" + "-" * 80)
        if missing_columns:
            print(f"⚠ WARNING: Missing columns: {', '.join(missing_columns)}")
            print("\nMigration completed with warnings.")
            return 1
        else:
            print("✓ All required columns are present!")
            print("\nMigration completed successfully.")
            return 0

    except Exception as e:
        print(f"\n✗ ERROR verifying schema: {e}")
        return 1


if __name__ == "__main__":
    try:
        exit_code = run_migration()
        sys.exit(exit_code)
    except Exception as e:
        print(f"\n✗ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
