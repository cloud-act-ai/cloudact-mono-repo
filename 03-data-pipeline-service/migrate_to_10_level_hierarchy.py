#!/usr/bin/env python3
"""
10-Level Hierarchy Migration Script

This script helps migrate existing CloudAct organizations to the new 10-level
hierarchy design. It handles:
1. Schema synchronization (adding new columns to existing tables)
2. Data backfill (populating hierarchy columns from org_hierarchy table)
3. Validation (verifying migration completion)

Usage:
    # Dry run (check what would be done)
    python3 migrate_to_10_level_hierarchy.py --org acme_inc_01062026 --dry-run

    # Execute migration
    python3 migrate_to_10_level_hierarchy.py --org acme_inc_01062026

    # Validate only
    python3 migrate_to_10_level_hierarchy.py --org acme_inc_01062026 --validate-only

Environment:
    GCP_PROJECT_ID: Google Cloud Project ID
    GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON
    CA_ROOT_API_KEY: Root API key for schema sync endpoint
    API_SERVICE_URL: API service URL (default: http://localhost:8000)
"""

import os
import sys
import argparse
import requests
from typing import Dict, List, Optional
from google.cloud import bigquery
from datetime import datetime


class HierarchyMigration:
    """Handles 10-level hierarchy migration for CloudAct orgs."""

    def __init__(self, org_slug: str, project_id: str, dry_run: bool = False):
        self.org_slug = org_slug
        self.project_id = project_id
        self.dry_run = dry_run
        self.client = bigquery.Client(project=project_id)
        self.dataset_id = f"{org_slug}_prod"

        # Tables that need hierarchy columns
        self.target_tables = [
            "genai_payg_usage_raw",
            "genai_commitment_usage_raw",
            "genai_infrastructure_usage_raw",
            "genai_payg_costs_daily",
            "genai_commitment_costs_daily",
            "genai_infrastructure_costs_daily",
            "genai_costs_daily_unified",
            "genai_usage_daily_unified",
            "subscription_plan_costs_daily",
            "subscription_plans",
            "cost_data_standard_1_3",
        ]

    def check_schema_status(self) -> Dict[str, Dict]:
        """Check which tables have new hierarchy columns."""
        print(f"\n📊 Checking schema status for {self.dataset_id}...")

        status = {}
        for table_name in self.target_tables:
            table_ref = f"{self.project_id}.{self.dataset_id}.{table_name}"

            try:
                table = self.client.get_table(table_ref)
                schema_fields = {field.name for field in table.schema}

                # Check for new hierarchy columns
                new_columns = [
                    f"x_hierarchy_level_{i}_id" for i in range(1, 11)
                ] + [f"x_hierarchy_level_{i}_name" for i in range(1, 11)]

                present = [col for col in new_columns if col in schema_fields]
                missing = [col for col in new_columns if col not in schema_fields]

                status[table_name] = {
                    "exists": True,
                    "total_columns": len(new_columns),
                    "present_columns": len(present),
                    "missing_columns": len(missing),
                    "schema_complete": len(missing) == 0,
                }

                if missing:
                    print(
                        f"  ⚠️  {table_name}: Missing {len(missing)}/20 hierarchy columns"
                    )
                else:
                    print(f"  ✅ {table_name}: All 20 hierarchy columns present")

            except Exception as e:
                status[table_name] = {
                    "exists": False,
                    "error": str(e),
                }
                print(f"  ❌ {table_name}: Table not found or inaccessible")

        return status

    def sync_schemas(self, api_url: str, api_key: str) -> Dict:
        """Trigger schema sync via API endpoint."""
        print(f"\n🔄 Syncing schemas for {self.org_slug}...")

        if self.dry_run:
            print("  [DRY RUN] Would call POST /api/v1/organizations/{org}/sync")
            return {"dry_run": True}

        url = f"{api_url}/api/v1/organizations/{self.org_slug}/sync"
        headers = {"X-CA-Root-Key": api_key, "Content-Type": "application/json"}
        payload = {"sync_missing_columns": True, "sync_missing_tables": False}

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=300)
            response.raise_for_status()
            result = response.json()
            print(f"  ✅ Schema sync completed: {result}")
            return result
        except Exception as e:
            print(f"  ❌ Schema sync failed: {e}")
            raise

    def check_backfill_status(self) -> Dict[str, Dict]:
        """Check which tables have hierarchy data populated."""
        print(f"\n📊 Checking backfill status for {self.dataset_id}...")

        status = {}
        for table_name in self.target_tables:
            table_ref = f"{self.project_id}.{self.dataset_id}.{table_name}"

            try:
                # Check if table has rows and how many have hierarchy data
                query = f"""
                    SELECT
                        COUNT(*) as total_rows,
                        COUNT(x_hierarchy_level_1_id) as rows_with_hierarchy,
                        ROUND(COUNT(x_hierarchy_level_1_id) * 100.0 / COUNT(*), 2) as pct_filled
                    FROM `{table_ref}`
                """

                result = self.client.query(query).result()
                row = next(result)

                status[table_name] = {
                    "total_rows": row.total_rows,
                    "rows_with_hierarchy": row.rows_with_hierarchy,
                    "percentage_filled": row.pct_filled,
                    "backfill_complete": row.pct_filled == 100.0
                    if row.total_rows > 0
                    else None,
                }

                if row.total_rows == 0:
                    print(f"  ⚪ {table_name}: Empty table (0 rows)")
                elif row.pct_filled == 100.0:
                    print(
                        f"  ✅ {table_name}: Fully populated ({row.rows_with_hierarchy:,} rows)"
                    )
                elif row.pct_filled > 0:
                    print(
                        f"  ⚠️  {table_name}: Partially populated ({row.pct_filled}% - {row.rows_with_hierarchy:,}/{row.total_rows:,} rows)"
                    )
                else:
                    print(f"  ❌ {table_name}: Not populated (0/{row.total_rows:,} rows)")

            except Exception as e:
                status[table_name] = {"error": str(e)}
                print(f"  ❌ {table_name}: Query failed - {e}")

        return status

    def backfill_hierarchy_data(self) -> Dict[str, int]:
        """Backfill hierarchy data from org_hierarchy table."""
        print(f"\n🔄 Backfilling hierarchy data for {self.dataset_id}...")

        results = {}

        # CTE to expand hierarchy
        hierarchy_cte = f"""
            WITH hierarchy_expanded AS (
                SELECT
                    entity_id,
                    entity_name,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 1 THEN path_ids[OFFSET(0)] ELSE NULL END AS level_1_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 2 THEN path_ids[OFFSET(1)] ELSE NULL END AS level_2_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 3 THEN path_ids[OFFSET(2)] ELSE NULL END AS level_3_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 4 THEN path_ids[OFFSET(3)] ELSE NULL END AS level_4_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 5 THEN path_ids[OFFSET(4)] ELSE NULL END AS level_5_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 6 THEN path_ids[OFFSET(5)] ELSE NULL END AS level_6_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 7 THEN path_ids[OFFSET(6)] ELSE NULL END AS level_7_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 8 THEN path_ids[OFFSET(7)] ELSE NULL END AS level_8_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 9 THEN path_ids[OFFSET(8)] ELSE NULL END AS level_9_id,
                    CASE WHEN ARRAY_LENGTH(path_ids) >= 10 THEN path_ids[OFFSET(9)] ELSE NULL END AS level_10_id,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 1 THEN path_names[OFFSET(0)] ELSE NULL END AS level_1_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 2 THEN path_names[OFFSET(1)] ELSE NULL END AS level_2_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 3 THEN path_names[OFFSET(2)] ELSE NULL END AS level_3_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 4 THEN path_names[OFFSET(3)] ELSE NULL END AS level_4_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 5 THEN path_names[OFFSET(4)] ELSE NULL END AS level_5_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 6 THEN path_names[OFFSET(5)] ELSE NULL END AS level_6_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 7 THEN path_names[OFFSET(6)] ELSE NULL END AS level_7_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 8 THEN path_names[OFFSET(7)] ELSE NULL END AS level_8_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 9 THEN path_names[OFFSET(8)] ELSE NULL END AS level_9_name,
                    CASE WHEN ARRAY_LENGTH(path_names) >= 10 THEN path_names[OFFSET(9)] ELSE NULL END AS level_10_name
                FROM `{self.project_id}.organizations.org_hierarchy`
                WHERE org_slug = @org_slug
                  AND end_date IS NULL
            )
        """

        # Tables with different entity_id field names
        entity_field_mapping = {
            "genai_payg_usage_raw": "entity_id",
            "genai_commitment_usage_raw": "entity_id",
            "genai_infrastructure_usage_raw": "entity_id",
            "genai_payg_costs_daily": "entity_id",
            "genai_commitment_costs_daily": "entity_id",
            "genai_infrastructure_costs_daily": "entity_id",
            "genai_costs_daily_unified": "entity_id",
            "genai_usage_daily_unified": "entity_id",
            "subscription_plan_costs_daily": "entity_id",
            "subscription_plans": "entity_id",
            "cost_data_standard_1_3": None,  # Cloud costs use tag-based enrichment
        }

        for table_name, entity_field in entity_field_mapping.items():
            if entity_field is None:
                print(
                    f"  ⏭️  {table_name}: Skipped (uses tag-based enrichment in FOCUS conversion)"
                )
                continue

            table_ref = f"{self.project_id}.{self.dataset_id}.{table_name}"

            update_query = f"""
                {hierarchy_cte}
                UPDATE `{table_ref}` AS target
                SET
                    target.hierarchy_level_1_id = h.level_1_id,
                    target.hierarchy_level_1_name = h.level_1_name,
                    target.hierarchy_level_2_id = h.level_2_id,
                    target.hierarchy_level_2_name = h.level_2_name,
                    target.hierarchy_level_3_id = h.level_3_id,
                    target.hierarchy_level_3_name = h.level_3_name,
                    target.hierarchy_level_4_id = h.level_4_id,
                    target.hierarchy_level_4_name = h.level_4_name,
                    target.hierarchy_level_5_id = h.level_5_id,
                    target.hierarchy_level_5_name = h.level_5_name,
                    target.hierarchy_level_6_id = h.level_6_id,
                    target.hierarchy_level_6_name = h.level_6_name,
                    target.hierarchy_level_7_id = h.level_7_id,
                    target.hierarchy_level_7_name = h.level_7_name,
                    target.hierarchy_level_8_id = h.level_8_id,
                    target.hierarchy_level_8_name = h.level_8_name,
                    target.hierarchy_level_9_id = h.level_9_id,
                    target.hierarchy_level_9_name = h.level_9_name,
                    target.hierarchy_level_10_id = h.level_10_id,
                    target.hierarchy_level_10_name = h.level_10_name
                FROM hierarchy_expanded h
                WHERE target.org_slug = @org_slug
                  AND target.hierarchy_level_1_id IS NULL
                  AND target.{entity_field} = h.entity_id
            """

            if self.dry_run:
                print(f"  [DRY RUN] Would update {table_name}")
                results[table_name] = 0
                continue

            try:
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter(
                            "org_slug", "STRING", self.org_slug
                        )
                    ]
                )
                query_job = self.client.query(update_query, job_config=job_config)
                query_job.result()  # Wait for completion

                rows_updated = query_job.num_dml_affected_rows or 0
                results[table_name] = rows_updated
                print(f"  ✅ {table_name}: Updated {rows_updated:,} rows")

            except Exception as e:
                print(f"  ❌ {table_name}: Update failed - {e}")
                results[table_name] = -1

        return results


def main():
    parser = argparse.ArgumentParser(
        description="Migrate CloudAct org to 10-level hierarchy"
    )
    parser.add_argument("--org", required=True, help="Organization slug")
    parser.add_argument(
        "--project",
        default=os.getenv("GCP_PROJECT_ID"),
        help="GCP Project ID (default: $GCP_PROJECT_ID)",
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv("API_SERVICE_URL", "http://localhost:8000"),
        help="API Service URL (default: $API_SERVICE_URL or http://localhost:8000)",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("CA_ROOT_API_KEY"),
        help="Root API key (default: $CA_ROOT_API_KEY)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would be done without executing"
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate schema and backfill status",
    )
    parser.add_argument(
        "--skip-sync", action="store_true", help="Skip schema sync step"
    )
    parser.add_argument(
        "--skip-backfill", action="store_true", help="Skip backfill step"
    )

    args = parser.parse_args()

    if not args.project:
        print("❌ Error: GCP Project ID required (--project or $GCP_PROJECT_ID)")
        sys.exit(1)

    if not args.validate_only and not args.skip_sync and not args.api_key:
        print("❌ Error: API key required for schema sync (--api-key or $CA_ROOT_API_KEY)")
        sys.exit(1)

    print("=" * 80)
    print(f"🚀 10-Level Hierarchy Migration")
    print(f"   Organization: {args.org}")
    print(f"   Project: {args.project}")
    print(f"   Mode: {'DRY RUN' if args.dry_run else 'EXECUTE'}")
    print("=" * 80)

    migrator = HierarchyMigration(args.org, args.project, args.dry_run)

    # Step 1: Check current schema status
    schema_status = migrator.check_schema_status()

    # Step 2: Sync schemas (add missing columns)
    if not args.validate_only and not args.skip_sync:
        try:
            migrator.sync_schemas(args.api_url, args.api_key)
            print("\n⏳ Waiting 10 seconds for schema propagation...")
            import time
            time.sleep(10)
        except Exception as e:
            print(f"\n❌ Schema sync failed: {e}")
            sys.exit(1)

    # Step 3: Check backfill status
    backfill_status = migrator.check_backfill_status()

    # Step 4: Backfill data
    if not args.validate_only and not args.skip_backfill:
        backfill_results = migrator.backfill_hierarchy_data()

        # Step 5: Validate after backfill
        print("\n🔍 Validating migration...")
        final_status = migrator.check_backfill_status()

    print("\n" + "=" * 80)
    print("✅ Migration completed!")
    print("=" * 80)


if __name__ == "__main__":
    main()
