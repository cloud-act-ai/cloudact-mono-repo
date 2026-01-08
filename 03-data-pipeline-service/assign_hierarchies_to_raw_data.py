#!/usr/bin/env python3
"""
Assign 10-level hierarchies to all raw data (GenAI, Cloud, Subscriptions).
Distributes data across teams for realistic cost allocation.

NEW in v15.0: Dynamically populates all 10 hierarchy levels from org_hierarchy table.
"""

import sys
import os
from google.cloud import bigquery
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from src.app.config import get_settings

settings = get_settings()
ORG_SLUG = "acme_inc_01062026"
DATASET = settings.get_org_dataset_name(ORG_SLUG)
PROJECT_ID = settings.gcp_project_id

# Hierarchy entity assignments (leaf-level entities only - levels populated from org_hierarchy)
HIERARCHY_ASSIGNMENTS = {
    # GenAI Usage distribution across teams (leaf entity IDs)
    "genai_platforms": "TEAM-PLAT",      # 40% - Platforms team
    "genai_data": "TEAM-DATA",            # 25% - Data team
    "genai_bu1": "TEAM-BU1APP",           # 15% - BU1 Applications
    "genai_bu2": "TEAM-BU2APP",           # 15% - BU2 Applications
    "genai_arch": "TEAM-ARCH",            # 5%  - Architecture team

    # Subscriptions distribution (leaf entities)
    "sub_finops": "TEAM-FINOPS",          # 50% - FinOps tools
    "sub_support": "TEAM-ITSUPPORT",      # 30% - IT Support
    "sub_platforms": "TEAM-PLAT",         # 20% - Platform tools
}


def build_hierarchy_lookup_cte(org_slug: str) -> str:
    """
    Build CTE that expands path_ids array into 10-level hierarchy.

    Returns SQL CTE that provides:
      entity_id, level_1_id, level_1_name, ..., level_10_id, level_10_name
    """
    return f"""
    WITH hierarchy_expanded AS (
        SELECT
            entity_id,
            entity_name,
            -- Extract IDs from path_ids array (1-indexed in BigQuery)
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
            -- Extract names from path_names array
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
        FROM `{PROJECT_ID}.organizations.org_hierarchy`
        WHERE org_slug = '{org_slug}'
          AND end_date IS NULL  -- Active entities only
    )
    """


def update_genai_usage_hierarchies(client: bigquery.Client):
    """Assign 10-level hierarchies to GenAI PAYG usage raw data."""
    print("\n=== Updating GenAI Usage Hierarchies (10-level) ===")

    # Distribute GenAI usage across 5 teams
    # 40% Platforms (OpenAI heavy), 25% Data, 15% BU1, 15% BU2, 5% Architecture
    updates = [
        ("genai_platforms", "provider = 'openai' AND MOD(ABS(FARM_FINGERPRINT(CAST(usage_date AS STRING))), 100) < 40"),
        ("genai_data", "provider IN ('anthropic', 'gemini') AND MOD(ABS(FARM_FINGERPRINT(CAST(usage_date AS STRING))), 100) BETWEEN 40 AND 64"),
        ("genai_bu1", "MOD(ABS(FARM_FINGERPRINT(CAST(usage_date AS STRING))), 100) BETWEEN 65 AND 79"),
        ("genai_bu2", "MOD(ABS(FARM_FINGERPRINT(CAST(usage_date AS STRING))), 100) BETWEEN 80 AND 94"),
        ("genai_arch", "MOD(ABS(FARM_FINGERPRINT(CAST(usage_date AS STRING))), 100) >= 95"),
    ]

    total_updated = 0

    for assignment_key, condition in updates:
        leaf_entity_id = HIERARCHY_ASSIGNMENTS[assignment_key]

        # Use CTE to get 10-level hierarchy for this entity
        hierarchy_cte = build_hierarchy_lookup_cte(ORG_SLUG)

        query = f"""
            {hierarchy_cte}
            UPDATE `{PROJECT_ID}.{DATASET}.genai_payg_usage_raw` AS target
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
            WHERE
                target.org_slug = @org_slug
                AND ({condition})
                AND target.hierarchy_level_1_id IS NULL  -- Only update if not already assigned
                AND h.entity_id = @leaf_entity_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG),
                bigquery.ScalarQueryParameter("leaf_entity_id", "STRING", leaf_entity_id),
            ]
        )

        job = client.query(query, job_config=job_config)
        job.result()  # Wait for completion

        rows_updated = job.num_dml_affected_rows or 0
        total_updated += rows_updated
        print(f"  {leaf_entity_id}: {rows_updated} records")

    print(f"Total GenAI usage records updated: {total_updated}")
    return total_updated


def update_cloud_billing_hierarchies(client: bigquery.Client):
    """SKIPPED: Cloud billing raw tables don't have hierarchy columns.

    Hierarchies for cloud costs are assigned during FOCUS conversion pipeline.
    The raw billing tables (cloud_*_billing_raw_daily) only have basic billing fields.
    """
    print("\n=== Cloud Billing Hierarchies ===")
    print("  SKIPPED: Cloud raw tables don't have hierarchy columns")
    print("  Hierarchies will be assigned during FOCUS conversion pipeline (resource tags)")
    return 0


def update_subscription_hierarchies(client: bigquery.Client):
    """Assign 10-level hierarchies to subscription plans."""
    print("\n=== Updating Subscription Plan Hierarchies (10-level) ===")

    # Distribute subscriptions: 50% FinOps tools, 30% IT Support, 20% Platforms
    updates = [
        ("sub_finops", "provider IN ('cloudability', 'cloudhealth', 'apptio') OR MOD(ABS(FARM_FINGERPRINT(subscription_id)), 100) < 50"),
        ("sub_support", "provider IN ('pagerduty', 'datadog', 'newrelic') OR MOD(ABS(FARM_FINGERPRINT(subscription_id)), 100) BETWEEN 50 AND 79"),
        ("sub_platforms", "MOD(ABS(FARM_FINGERPRINT(subscription_id)), 100) >= 80"),
    ]

    total_updated = 0

    for assignment_key, condition in updates:
        leaf_entity_id = HIERARCHY_ASSIGNMENTS[assignment_key]

        # Use CTE to get 10-level hierarchy for this entity
        hierarchy_cte = build_hierarchy_lookup_cte(ORG_SLUG)

        query = f"""
            {hierarchy_cte}
            UPDATE `{PROJECT_ID}.{DATASET}.subscription_plans` AS target
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
            WHERE
                target.org_slug = @org_slug
                AND ({condition})
                AND target.hierarchy_level_1_id IS NULL  -- Only update if not already assigned
                AND h.entity_id = @leaf_entity_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG),
                bigquery.ScalarQueryParameter("leaf_entity_id", "STRING", leaf_entity_id),
            ]
        )

        job = client.query(query, job_config=job_config)
        job.result()

        rows_updated = job.num_dml_affected_rows or 0
        total_updated += rows_updated
        print(f"  {leaf_entity_id}: {rows_updated} subscriptions")

    print(f"Total subscription plans updated: {total_updated}")
    return total_updated


def main():
    """Run hierarchy assignments for all raw data."""
    print(f"Assigning 10-level hierarchies to raw data for {ORG_SLUG}")
    print(f"Dataset: {DATASET}")
    print(f"Project: {PROJECT_ID}")

    client = bigquery.Client(project=PROJECT_ID)

    try:
        # Update all raw data tables
        genai_count = update_genai_usage_hierarchies(client)
        cloud_count = update_cloud_billing_hierarchies(client)
        sub_count = update_subscription_hierarchies(client)

        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"GenAI usage records updated: {genai_count}")
        print(f"Cloud billing records updated: {cloud_count}")
        print(f"Subscription plans updated: {sub_count}")
        print(f"TOTAL records updated: {genai_count + cloud_count + sub_count}")
        print("=" * 60)

        return 0

    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
