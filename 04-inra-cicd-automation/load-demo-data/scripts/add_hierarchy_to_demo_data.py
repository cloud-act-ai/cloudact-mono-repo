#!/usr/bin/env python3
"""
Assign hierarchies to all raw data (GenAI, Cloud, Subscriptions).
Distributes data across teams for realistic cost allocation.
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

# Hierarchy entity assignments (from hierarchy_template.csv)
# NOTE: level_code values MUST match level_service.py DEFAULT_LEVELS:
#   - c_suite (level 1, prefix DEPT-)
#   - business_unit (level 2, prefix PROJ-)
#   - function (level 3, prefix TEAM-)
HIERARCHY_ASSIGNMENTS = {
    # GenAI Usage distribution across teams
    "genai_platforms": {
        "entity_id": "TEAM-PLATFORMS",
        "entity_name": "Platforms",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-PLATFORMS",
        "path_names": "Group CIO > Engineering > Platforms",
        "description": "Platform engineering using OpenAI for code generation"
    },
    "genai_data": {
        "entity_id": "TEAM-DATA",
        "entity_name": "Data",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-DATA",
        "path_names": "Group CIO > Engineering > Data",
        "description": "Data team using GenAI for analytics"
    },
    "genai_bu1": {
        "entity_id": "TEAM-BU1APP",
        "entity_name": "BU1 Applications",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-BU1/TEAM-BU1APP",
        "path_names": "Group CIO > Business Unit 1 IT > BU1 Applications",
        "description": "BU1 applications using GenAI"
    },
    "genai_bu2": {
        "entity_id": "TEAM-BU2APP",
        "entity_name": "BU2 Applications",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-BU2/TEAM-BU2APP",
        "path_names": "Group CIO > Business Unit 2 IT > BU2 Applications",
        "description": "BU2 applications using GenAI"
    },
    "genai_arch": {
        "entity_id": "TEAM-ARCH",
        "entity_name": "Architecture",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-ARCH",
        "path_names": "Group CIO > Engineering > Architecture",
        "description": "Architecture team using GenAI for design"
    },

    # Cloud billing distribution
    "cloud_infra": {
        "entity_id": "TEAM-INFRA",
        "entity_name": "Infrastructure",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-INFRA",
        "path_names": "Group CIO > Engineering > Infrastructure",
        "description": "Cloud infrastructure and services"
    },
    "cloud_platforms": {
        "entity_id": "TEAM-PLATFORMS",
        "entity_name": "Platforms",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-PLATFORMS",
        "path_names": "Group CIO > Engineering > Platforms",
        "description": "Platform services on cloud"
    },
    "cloud_tc": {
        "entity_id": "TEAM-TECHCTR",
        "entity_name": "Technology Centres",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-TECHCTR",
        "path_names": "Group CIO > Engineering > Technology Centres",
        "description": "Technology centres innovation projects"
    },

    # Subscriptions distribution
    "sub_finops": {
        "entity_id": "TEAM-FINOPS",
        "entity_name": "FinOps",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-ITCOO/TEAM-FINOPS",
        "path_names": "Group CIO > IT Operations > FinOps",
        "description": "Cost management and FinOps tools"
    },
    "sub_support": {
        "entity_id": "TEAM-ITSUPPORT",
        "entity_name": "IT Support",
        "level_code": "function",
        "path": "/DEPT-CIO/PROJ-ITCOO/TEAM-ITSUPPORT",
        "path_names": "Group CIO > IT Operations > IT Support",
        "description": "IT support and monitoring tools"
    },
}

def update_genai_usage_hierarchies(client: bigquery.Client):
    """Assign hierarchies to GenAI PAYG usage raw data."""
    print("\n=== Updating GenAI Usage Hierarchies ===")

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
        hierarchy = HIERARCHY_ASSIGNMENTS[assignment_key]

        query = f"""
            UPDATE `{PROJECT_ID}.{DATASET}.genai_payg_usage_raw`
            SET
                hierarchy_entity_id = @entity_id,
                hierarchy_entity_name = @entity_name,
                hierarchy_level_code = @level_code,
                hierarchy_path = @path,
                hierarchy_path_names = @path_names
            WHERE
                org_slug = @org_slug
                AND ({condition})
                AND hierarchy_entity_id IS NULL
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG),
                bigquery.ScalarQueryParameter("entity_id", "STRING", hierarchy["entity_id"]),
                bigquery.ScalarQueryParameter("entity_name", "STRING", hierarchy["entity_name"]),
                bigquery.ScalarQueryParameter("level_code", "STRING", hierarchy["level_code"]),
                bigquery.ScalarQueryParameter("path", "STRING", hierarchy["path"]),
                bigquery.ScalarQueryParameter("path_names", "STRING", hierarchy["path_names"]),
            ]
        )

        job = client.query(query, job_config=job_config)
        job.result()  # Wait for completion

        rows_updated = job.num_dml_affected_rows or 0
        total_updated += rows_updated
        print(f"  {hierarchy['entity_name']}: {rows_updated} records")

    print(f"Total GenAI usage records updated: {total_updated}")
    return total_updated

def update_cloud_billing_hierarchies(client: bigquery.Client):
    """SKIPPED: Cloud billing raw tables don't have hierarchy columns.

    Hierarchies for cloud costs are assigned during FOCUS conversion pipeline.
    The raw billing tables (cloud_*_billing_raw_daily) only have basic billing fields.
    """
    print("\n=== Cloud Billing Hierarchies ===")
    print("  SKIPPED: Cloud raw tables don't have hierarchy columns")
    print("  Hierarchies will be assigned during FOCUS conversion pipeline")
    return 0

def update_subscription_hierarchies(client: bigquery.Client):
    """Assign hierarchies to subscription plans."""
    print("\n=== Updating Subscription Plan Hierarchies ===")

    # Distribute subscriptions: 50% FinOps tools, 30% IT Support, 20% Platforms
    updates = [
        ("sub_finops", "provider IN ('cloudability', 'cloudhealth', 'apptio') OR MOD(ABS(FARM_FINGERPRINT(subscription_id)), 100) < 50"),
        ("sub_support", "provider IN ('pagerduty', 'datadog', 'newrelic') OR MOD(ABS(FARM_FINGERPRINT(subscription_id)), 100) BETWEEN 50 AND 79"),
        ("cloud_platforms", "MOD(ABS(FARM_FINGERPRINT(subscription_id)), 100) >= 80"),
    ]

    total_updated = 0

    for assignment_key, condition in updates:
        hierarchy = HIERARCHY_ASSIGNMENTS[assignment_key]

        query = f"""
            UPDATE `{PROJECT_ID}.{DATASET}.subscription_plans`
            SET
                hierarchy_entity_id = @entity_id,
                hierarchy_entity_name = @entity_name,
                hierarchy_level_code = @level_code,
                hierarchy_path = @path,
                hierarchy_path_names = @path_names
            WHERE
                org_slug = @org_slug
                AND ({condition})
                AND hierarchy_entity_id IS NULL
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG),
                bigquery.ScalarQueryParameter("entity_id", "STRING", hierarchy["entity_id"]),
                bigquery.ScalarQueryParameter("entity_name", "STRING", hierarchy["entity_name"]),
                bigquery.ScalarQueryParameter("level_code", "STRING", hierarchy["level_code"]),
                bigquery.ScalarQueryParameter("path", "STRING", hierarchy["path"]),
                bigquery.ScalarQueryParameter("path_names", "STRING", hierarchy["path_names"]),
            ]
        )

        job = client.query(query, job_config=job_config)
        job.result()

        rows_updated = job.num_dml_affected_rows or 0
        total_updated += rows_updated
        print(f"  {hierarchy['entity_name']}: {rows_updated} subscriptions")

    print(f"Total subscription plans updated: {total_updated}")
    return total_updated

def main():
    """Run hierarchy assignments for all raw data."""
    print(f"Assigning hierarchies to raw data for {ORG_SLUG}")
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
