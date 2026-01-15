#!/usr/bin/env python3
"""
Create organizational hierarchy for demo org.
Matches actual org_hierarchy table schema.

NOTE: level_code values MUST match level_service.py DEFAULT_LEVELS:
  - c_suite (level 1, prefix DEPT-)
  - business_unit (level 2, prefix PROJ-)
  - function (level 3, prefix TEAM-)
"""

import sys
from google.cloud import bigquery
import uuid

ORG_SLUG = "acme_inc_01062026"
PROJECT_ID = "cloudact-testing-1"

# Hierarchy structure matching actual schema
HIERARCHY_DATA = [
    # C-Suite: CIO (depth 1)
    {
        "entity_id": "DEPT-CIO",
        "entity_name": "Group CIO",
        "level": 1,
        "level_code": "c_suite",
        "parent_id": None,
        "path": "/DEPT-CIO",
        "path_ids": ["DEPT-CIO"],
        "path_names": ["Group CIO"],
        "depth": 1
    },

    # Business Units under CIO (depth 2)
    {
        "entity_id": "PROJ-CTO",
        "entity_name": "Engineering",
        "level": 2,
        "level_code": "business_unit",
        "parent_id": "DEPT-CIO",
        "path": "/DEPT-CIO/PROJ-CTO",
        "path_ids": ["DEPT-CIO", "PROJ-CTO"],
        "path_names": ["Group CIO", "Engineering"],
        "depth": 2
    },
    {
        "entity_id": "PROJ-BU1",
        "entity_name": "Business Unit 1 IT",
        "level": 2,
        "level_code": "business_unit",
        "parent_id": "DEPT-CIO",
        "path": "/DEPT-CIO/PROJ-BU1",
        "path_ids": ["DEPT-CIO", "PROJ-BU1"],
        "path_names": ["Group CIO", "Business Unit 1 IT"],
        "depth": 2
    },
    {
        "entity_id": "PROJ-BU2",
        "entity_name": "Business Unit 2 IT",
        "level": 2,
        "level_code": "business_unit",
        "parent_id": "DEPT-CIO",
        "path": "/DEPT-CIO/PROJ-BU2",
        "path_ids": ["DEPT-CIO", "PROJ-BU2"],
        "path_names": ["Group CIO", "Business Unit 2 IT"],
        "depth": 2
    },
    {
        "entity_id": "PROJ-ITCOO",
        "entity_name": "IT Operations",
        "level": 2,
        "level_code": "business_unit",
        "parent_id": "DEPT-CIO",
        "path": "/DEPT-CIO/PROJ-ITCOO",
        "path_ids": ["DEPT-CIO", "PROJ-ITCOO"],
        "path_names": ["Group CIO", "IT Operations"],
        "depth": 2
    },

    # Functions under Engineering (depth 3)
    {
        "entity_id": "TEAM-PLATFORMS",
        "entity_name": "Platforms",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-CTO",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-PLATFORMS",
        "path_ids": ["DEPT-CIO", "PROJ-CTO", "TEAM-PLATFORMS"],
        "path_names": ["Group CIO", "Engineering", "Platforms"],
        "depth": 3
    },
    {
        "entity_id": "TEAM-DATA",
        "entity_name": "Data",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-CTO",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-DATA",
        "path_ids": ["DEPT-CIO", "PROJ-CTO", "TEAM-DATA"],
        "path_names": ["Group CIO", "Engineering", "Data"],
        "depth": 3
    },
    {
        "entity_id": "TEAM-ARCH",
        "entity_name": "Architecture",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-CTO",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-ARCH",
        "path_ids": ["DEPT-CIO", "PROJ-CTO", "TEAM-ARCH"],
        "path_names": ["Group CIO", "Engineering", "Architecture"],
        "depth": 3
    },
    {
        "entity_id": "TEAM-INFRA",
        "entity_name": "Infrastructure",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-CTO",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-INFRA",
        "path_ids": ["DEPT-CIO", "PROJ-CTO", "TEAM-INFRA"],
        "path_names": ["Group CIO", "Engineering", "Infrastructure"],
        "depth": 3
    },
    {
        "entity_id": "TEAM-TECHCTR",
        "entity_name": "Technology Centres",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-CTO",
        "path": "/DEPT-CIO/PROJ-CTO/TEAM-TECHCTR",
        "path_ids": ["DEPT-CIO", "PROJ-CTO", "TEAM-TECHCTR"],
        "path_names": ["Group CIO", "Engineering", "Technology Centres"],
        "depth": 3
    },

    # Functions under BU1 (depth 3)
    {
        "entity_id": "TEAM-BU1APP",
        "entity_name": "BU1 Applications",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-BU1",
        "path": "/DEPT-CIO/PROJ-BU1/TEAM-BU1APP",
        "path_ids": ["DEPT-CIO", "PROJ-BU1", "TEAM-BU1APP"],
        "path_names": ["Group CIO", "Business Unit 1 IT", "BU1 Applications"],
        "depth": 3
    },

    # Functions under BU2 (depth 3)
    {
        "entity_id": "TEAM-BU2APP",
        "entity_name": "BU2 Applications",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-BU2",
        "path": "/DEPT-CIO/PROJ-BU2/TEAM-BU2APP",
        "path_ids": ["DEPT-CIO", "PROJ-BU2", "TEAM-BU2APP"],
        "path_names": ["Group CIO", "Business Unit 2 IT", "BU2 Applications"],
        "depth": 3
    },

    # Functions under IT Operations (depth 3)
    {
        "entity_id": "TEAM-FINOPS",
        "entity_name": "FinOps",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-ITCOO",
        "path": "/DEPT-CIO/PROJ-ITCOO/TEAM-FINOPS",
        "path_ids": ["DEPT-CIO", "PROJ-ITCOO", "TEAM-FINOPS"],
        "path_names": ["Group CIO", "IT Operations", "FinOps"],
        "depth": 3
    },
    {
        "entity_id": "TEAM-ITSUPPORT",
        "entity_name": "IT Support",
        "level": 3,
        "level_code": "function",
        "parent_id": "PROJ-ITCOO",
        "path": "/DEPT-CIO/PROJ-ITCOO/TEAM-ITSUPPORT",
        "path_ids": ["DEPT-CIO", "PROJ-ITCOO", "TEAM-ITSUPPORT"],
        "path_names": ["Group CIO", "IT Operations", "IT Support"],
        "depth": 3
    }
]

def main():
    """Create organizational hierarchy in BigQuery."""
    print(f"Creating organizational hierarchy for {ORG_SLUG}")
    print(f"Project: {PROJECT_ID}")
    print("=" * 70)

    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.organizations.org_hierarchy"

    # Delete existing hierarchy for this org (clean slate)
    delete_query = f"""
        DELETE FROM `{table_id}`
        WHERE org_slug = @org_slug
    """

    job = client.query(delete_query, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG)
        ]
    ))
    job.result()
    deleted_count = job.num_dml_affected_rows or 0
    print(f"Deleted {deleted_count} existing hierarchy records\n")

    # Insert new hierarchy
    for record in HIERARCHY_DATA:
        record_id = str(uuid.uuid4())

        insert_query = f"""
            INSERT INTO `{table_id}`
            (id, org_slug, entity_id, entity_name, level, level_code, parent_id,
             path, path_ids, path_names, depth, is_active, created_at, created_by, version)
            VALUES
            (@id, @org_slug, @entity_id, @entity_name, @level, @level_code, @parent_id,
             @path, @path_ids, @path_names, @depth, true, CURRENT_TIMESTAMP(), 'system', 1)
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("id", "STRING", record_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG),
                bigquery.ScalarQueryParameter("entity_id", "STRING", record["entity_id"]),
                bigquery.ScalarQueryParameter("entity_name", "STRING", record["entity_name"]),
                bigquery.ScalarQueryParameter("level", "INT64", record["level"]),
                bigquery.ScalarQueryParameter("level_code", "STRING", record["level_code"]),
                bigquery.ScalarQueryParameter("parent_id", "STRING", record["parent_id"]),
                bigquery.ScalarQueryParameter("path", "STRING", record["path"]),
                bigquery.ArrayQueryParameter("path_ids", "STRING", record["path_ids"]),
                bigquery.ArrayQueryParameter("path_names", "STRING", record["path_names"]),
                bigquery.ScalarQueryParameter("depth", "INT64", record["depth"])
            ]
        )

        job = client.query(insert_query, job_config=job_config)
        job.result()
        print(f"  {record['level_code']:15} {record['entity_id']:15} {record['entity_name']}")

    # Verify hierarchy
    verify_query = f"""
        SELECT level_code, COUNT(*) as count
        FROM `{table_id}`
        WHERE org_slug = @org_slug
        GROUP BY level_code
        ORDER BY
            CASE level_code
                WHEN 'c_suite' THEN 1
                WHEN 'business_unit' THEN 2
                WHEN 'function' THEN 3
            END
    """

    result = client.query(verify_query, job_config=bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", ORG_SLUG)
        ]
    )).result()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for row in result:
        print(f"{row.level_code:15}: {row.count} entities")

    print(f"\nTotal: {len(HIERARCHY_DATA)} hierarchy entities created")
    print("=" * 70)

    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
