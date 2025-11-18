#!/usr/bin/env python3
"""
Schema Verification Script: tenant_usage_quotas table

This script verifies that the tenant_usage_quotas table has all required columns
matching the authoritative schema definition.

Run this after migration to ensure schema is complete.
"""

import sys
from pathlib import Path
from google.cloud import bigquery

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.app.config import settings


# Required columns based on tenants_dataset.sql schema definition
REQUIRED_COLUMNS = {
    # Primary Identifiers
    'usage_id': 'STRING',
    'tenant_id': 'STRING',
    'usage_date': 'DATE',

    # Daily Pipeline Metrics
    'pipelines_run_today': 'INT64',
    'pipelines_failed_today': 'INT64',
    'pipelines_succeeded_today': 'INT64',
    'pipelines_cancelled_today': 'INT64',

    # Monthly Aggregates
    'pipelines_run_month': 'INT64',

    # Concurrent Execution
    'concurrent_pipelines_running': 'INT64',
    'max_concurrent_reached': 'INT64',

    # Cached Limits
    'daily_limit': 'INT64',
    'monthly_limit': 'INT64',
    'concurrent_limit': 'INT64',

    # Quota Status
    'quota_exceeded': 'BOOL',
    'quota_warning_sent': 'BOOL',
    'quota_exceeded_at': 'TIMESTAMP',

    # Additional Usage Metrics
    'total_api_calls_today': 'INT64',
    'total_storage_used_gb': 'NUMERIC',

    # Metadata
    'last_updated': 'TIMESTAMP',
    'last_pipeline_started_at': 'TIMESTAMP',
    'last_pipeline_completed_at': 'TIMESTAMP',
    'created_at': 'TIMESTAMP'
}


def verify_schema():
    """Verify that tenant_usage_quotas table has all required columns."""

    client = bigquery.Client(project=settings.gcp_project_id)
    table_id = f"{settings.gcp_project_id}.tenants.tenant_usage_quotas"

    print(f"Verifying schema for table: {table_id}")
    print("=" * 80)

    # Get current schema
    query = f"""
    SELECT
        column_name,
        data_type,
        is_nullable
    FROM `{settings.gcp_project_id}.tenants.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = 'tenant_usage_quotas'
    ORDER BY ordinal_position
    """

    try:
        results = client.query(query).result()

        # Build map of existing columns
        existing_columns = {}
        for row in results:
            existing_columns[row.column_name] = row.data_type

        print(f"\nFound {len(existing_columns)} columns in table")
        print(f"Expected {len(REQUIRED_COLUMNS)} columns\n")

        # Check for missing columns
        missing_columns = []
        type_mismatches = []

        for col_name, expected_type in REQUIRED_COLUMNS.items():
            if col_name not in existing_columns:
                missing_columns.append(col_name)
            else:
                actual_type = existing_columns[col_name]
                # Handle NUMERIC vs NUMERIC(10,2) difference
                if expected_type == 'NUMERIC' and actual_type.startswith('NUMERIC'):
                    continue
                # Allow INT64 vs INTEGER difference
                elif expected_type == 'INT64' and actual_type in ['INT64', 'INTEGER']:
                    continue
                # Allow BOOL vs BOOLEAN difference
                elif expected_type == 'BOOL' and actual_type in ['BOOL', 'BOOLEAN']:
                    continue
                elif actual_type != expected_type:
                    type_mismatches.append({
                        'column': col_name,
                        'expected': expected_type,
                        'actual': actual_type
                    })

        # Check for unexpected columns
        unexpected_columns = [col for col in existing_columns if col not in REQUIRED_COLUMNS]

        # Report results
        print("Schema Verification Results:")
        print("-" * 80)

        if not missing_columns and not type_mismatches:
            print("✓ SUCCESS: All required columns present with correct types!")
            success = True
        else:
            success = False

        if missing_columns:
            print(f"\n✗ MISSING COLUMNS ({len(missing_columns)}):")
            for col in sorted(missing_columns):
                print(f"  - {col} ({REQUIRED_COLUMNS[col]})")

        if type_mismatches:
            print(f"\n⚠ TYPE MISMATCHES ({len(type_mismatches)}):")
            for mismatch in type_mismatches:
                print(f"  - {mismatch['column']}: expected {mismatch['expected']}, got {mismatch['actual']}")

        if unexpected_columns:
            print(f"\nℹ UNEXPECTED COLUMNS ({len(unexpected_columns)}):")
            for col in sorted(unexpected_columns):
                print(f"  - {col} ({existing_columns[col]})")
            print("  (These columns are not in the schema definition)")

        if not missing_columns:
            print("\n✓ No missing columns")
        if not type_mismatches:
            print("✓ All types match")

        print("\n" + "=" * 80)

        # Print full schema for reference
        print("\nCurrent Table Schema:")
        print("-" * 80)
        print(f"{'Column Name':<40} {'Type':<20} {'Nullable':<10}")
        print("-" * 80)

        # Re-query to get fresh results in order
        results = client.query(query).result()
        for row in results:
            nullable = "YES" if row.is_nullable == "YES" else "NO"
            print(f"{row.column_name:<40} {row.data_type:<20} {nullable:<10}")

        print("\n" + "=" * 80)

        if success:
            print("\n✓ Schema verification PASSED")
            print("  The tenant_usage_quotas table is ready for production use.")
            return 0
        else:
            print("\n✗ Schema verification FAILED")
            print("  Run the migration script to fix schema issues:")
            print("  python deployment/migrate_tenant_usage_quotas.py")
            return 1

    except Exception as e:
        print(f"\n✗ ERROR: Failed to verify schema: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    try:
        exit_code = verify_schema()
        sys.exit(exit_code)
    except Exception as e:
        print(f"\n✗ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
