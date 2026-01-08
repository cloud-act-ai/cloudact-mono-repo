#!/usr/bin/env python3
"""
Create organizational hierarchy for demo org.
Org → Departments → Projects → Teams
"""

import sys
from google.cloud import bigquery

ORG_SLUG = "acme_inc_01062026"
PROJECT_ID = "cloudact-testing-1"

# Hierarchy structure matching the assignments we made
HIERARCHY_DATA = [
    # Department: CIO
    {
        "org_slug": ORG_SLUG,
        "entity_id": "DEPT-CIO",
        "entity_name": "Group CIO",
        "level_code": "department",
        "parent_entity_id": None,
        "entity_path": "/DEPT-CIO",
        "entity_path_names": "Group CIO",
        "is_active": True
    },

    # Projects under CIO
    {
        "org_slug": ORG_SLUG,
        "entity_id": "PROJ-CTO",
        "entity_name": "Engineering",
        "level_code": "project",
        "parent_entity_id": "DEPT-CIO",
        "entity_path": "/DEPT-CIO/PROJ-CTO",
        "entity_path_names": "Group CIO > Engineering",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "PROJ-BU1",
        "entity_name": "Business Unit 1 IT",
        "level_code": "project",
        "parent_entity_id": "DEPT-CIO",
        "entity_path": "/DEPT-CIO/PROJ-BU1",
        "entity_path_names": "Group CIO > Business Unit 1 IT",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "PROJ-BU2",
        "entity_name": "Business Unit 2 IT",
        "level_code": "project",
        "parent_entity_id": "DEPT-CIO",
        "entity_path": "/DEPT-CIO/PROJ-BU2",
        "entity_path_names": "Group CIO > Business Unit 2 IT",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "PROJ-ITCOO",
        "entity_name": "IT Operations",
        "level_code": "project",
        "parent_entity_id": "DEPT-CIO",
        "entity_path": "/DEPT-CIO/PROJ-ITCOO",
        "entity_path_names": "Group CIO > IT Operations",
        "is_active": True
    },

    # Teams under Engineering (PROJ-CTO)
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-PLAT",
        "entity_name": "Platforms",
        "level_code": "team",
        "parent_entity_id": "PROJ-CTO",
        "entity_path": "/DEPT-CIO/PROJ-CTO/TEAM-PLAT",
        "entity_path_names": "Group CIO > Engineering > Platforms",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-DATA",
        "entity_name": "Data",
        "level_code": "team",
        "parent_entity_id": "PROJ-CTO",
        "entity_path": "/DEPT-CIO/PROJ-CTO/TEAM-DATA",
        "entity_path_names": "Group CIO > Engineering > Data",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-ARCH",
        "entity_name": "Architecture",
        "level_code": "team",
        "parent_entity_id": "PROJ-CTO",
        "entity_path": "/DEPT-CIO/PROJ-CTO/TEAM-ARCH",
        "entity_path_names": "Group CIO > Engineering > Architecture",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-INFRA",
        "entity_name": "Infrastructure",
        "level_code": "team",
        "parent_entity_id": "PROJ-CTO",
        "entity_path": "/DEPT-CIO/PROJ-CTO/TEAM-INFRA",
        "entity_path_names": "Group CIO > Engineering > Infrastructure",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-TC",
        "entity_name": "Technology Centres",
        "level_code": "team",
        "parent_entity_id": "PROJ-CTO",
        "entity_path": "/DEPT-CIO/PROJ-CTO/TEAM-TC",
        "entity_path_names": "Group CIO > Engineering > Technology Centres",
        "is_active": True
    },

    # Teams under BU1 (PROJ-BU1)
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-BU1APP",
        "entity_name": "BU1 Applications",
        "level_code": "team",
        "parent_entity_id": "PROJ-BU1",
        "entity_path": "/DEPT-CIO/PROJ-BU1/TEAM-BU1APP",
        "entity_path_names": "Group CIO > Business Unit 1 IT > BU1 Applications",
        "is_active": True
    },

    # Teams under BU2 (PROJ-BU2)
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-BU2APP",
        "entity_name": "BU2 Applications",
        "level_code": "team",
        "parent_entity_id": "PROJ-BU2",
        "entity_path": "/DEPT-CIO/PROJ-BU2/TEAM-BU2APP",
        "entity_path_names": "Group CIO > Business Unit 2 IT > BU2 Applications",
        "is_active": True
    },

    # Teams under IT Operations (PROJ-ITCOO)
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-FINOPS",
        "entity_name": "FinOps",
        "level_code": "team",
        "parent_entity_id": "PROJ-ITCOO",
        "entity_path": "/DEPT-CIO/PROJ-ITCOO/TEAM-FINOPS",
        "entity_path_names": "Group CIO > IT Operations > FinOps",
        "is_active": True
    },
    {
        "org_slug": ORG_SLUG,
        "entity_id": "TEAM-ITSUPPORT",
        "entity_name": "IT Support",
        "level_code": "team",
        "parent_entity_id": "PROJ-ITCOO",
        "entity_path": "/DEPT-CIO/PROJ-ITCOO/TEAM-ITSUPPORT",
        "entity_path_names": "Group CIO > IT Operations > IT Support",
        "is_active": True
    }
]

def main():
    """Create organizational hierarchy in BigQuery."""
    print(f"Creating organizational hierarchy for {ORG_SLUG}")
    print(f"Project: {PROJECT_ID}")
    print("=" * 70)

    client = bigquery.Client(project=PROJECT_ID)

    # Insert hierarchy records
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
    print(f"Deleted {deleted_count} existing hierarchy records")

    # Insert new hierarchy
    for record in HIERARCHY_DATA:
        insert_query = f"""
            INSERT INTO `{table_id}`
            (org_slug, entity_id, entity_name, level_code, parent_entity_id,
             entity_path, entity_path_names, is_active, created_at, updated_at)
            VALUES
            (@org_slug, @entity_id, @entity_name, @level_code, @parent_entity_id,
             @entity_path, @entity_path_names, @is_active, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        job = client.query(insert_query, job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", record["org_slug"]),
                bigquery.ScalarQueryParameter("entity_id", "STRING", record["entity_id"]),
                bigquery.ScalarQueryParameter("entity_name", "STRING", record["entity_name"]),
                bigquery.ScalarQueryParameter("level_code", "STRING", record["level_code"]),
                bigquery.ScalarQueryParameter("parent_entity_id", "STRING", record["parent_entity_id"]),
                bigquery.ScalarQueryParameter("entity_path", "STRING", record["entity_path"]),
                bigquery.ScalarQueryParameter("entity_path_names", "STRING", record["entity_path_names"]),
                bigquery.ScalarQueryParameter("is_active", "BOOL", record["is_active"])
            ]
        ))
        job.result()
        print(f"  ✓ {record['level_code']:12} {record['entity_id']:15} {record['entity_name']}")

    # Verify hierarchy
    verify_query = f"""
        SELECT level_code, COUNT(*) as count
        FROM `{table_id}`
        WHERE org_slug = @org_slug
        GROUP BY level_code
        ORDER BY
            CASE level_code
                WHEN 'department' THEN 1
                WHEN 'project' THEN 2
                WHEN 'team' THEN 3
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
        print(f"{row.level_code:12}: {row.count} entities")

    print(f"\nTotal: {len(HIERARCHY_DATA)} hierarchy entities created")
    print("=" * 70)

    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
