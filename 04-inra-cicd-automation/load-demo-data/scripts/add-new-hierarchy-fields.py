#!/usr/bin/env python3
"""
Add NEW N-level hierarchy fields to ALL cost/usage schemas.
Inserts fields before x_pipeline_id or at the end if no x_pipeline_id exists.
"""

import json
from pathlib import Path
from typing import List, Dict, Any

# NEW N-level hierarchy fields to add
NEW_HIERARCHY_FIELDS = [
    {
        "name": "hierarchy_entity_id",
        "type": "STRING",
        "mode": "NULLABLE",
        "description": "N-level hierarchy: Leaf entity ID from org_hierarchy. Example: 'TEAM-001'."
    },
    {
        "name": "hierarchy_entity_name",
        "type": "STRING",
        "mode": "NULLABLE",
        "description": "N-level hierarchy: Leaf entity display name. Example: 'Platform Team'."
    },
    {
        "name": "hierarchy_level_code",
        "type": "STRING",
        "mode": "NULLABLE",
        "description": "N-level hierarchy: Entity level code. Example: 'team', 'project', 'department'."
    },
    {
        "name": "hierarchy_path",
        "type": "STRING",
        "mode": "NULLABLE",
        "description": "N-level hierarchy: Materialized path from root to leaf. Example: '/DEPT-001/PROJ-001/TEAM-001'."
    },
    {
        "name": "hierarchy_path_names",
        "type": "STRING",
        "mode": "NULLABLE",
        "description": "N-level hierarchy: Human-readable path. Example: 'Engineering > Platform > Backend Team'."
    }
]

def has_hierarchy_fields(schema: List[Dict[str, Any]]) -> bool:
    """Check if schema already has any hierarchy fields."""
    for field in schema:
        if field.get("name", "").startswith("hierarchy"):
            return True
    return False

def add_hierarchy_fields(schema: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add NEW N-level hierarchy fields before x_pipeline_id or at end."""
    if has_hierarchy_fields(schema):
        return schema  # Already has hierarchy fields

    # Find insertion point (before x_pipeline_id or x_hierarchy_validated_at)
    insert_index = len(schema)
    for i, field in enumerate(schema):
        field_name = field.get("name", "")
        if field_name in ["x_pipeline_id", "x_hierarchy_validated_at", "x_credential_id"]:
            insert_index = i
            break

    # Insert NEW hierarchy fields
    result = schema[:insert_index] + NEW_HIERARCHY_FIELDS + schema[insert_index:]
    return result

def process_schema_file(file_path: Path) -> bool:
    """Process a single schema file. Returns True if modified."""
    with open(file_path, 'r') as f:
        schema = json.load(f)

    if has_hierarchy_fields(schema):
        return False  # Already has hierarchy fields

    updated_schema = add_hierarchy_fields(schema)

    with open(file_path, 'w') as f:
        json.dump(updated_schema, f, indent=2)

    return True

def main():
    # Paths to schema directories
    base_dir = Path(__file__).parent.parent.parent.parent

    schema_dirs = [
        # Onboarding schemas
        base_dir / "02-api-service" / "configs" / "setup" / "organizations" / "onboarding" / "schemas",
    ]

    # Files that need hierarchy fields
    target_files = [
        # GenAI tables
        "genai_payg_usage_raw.json",
        "genai_payg_costs_daily.json",
        "genai_commitment_usage_raw.json",
        "genai_commitment_costs_daily.json",
        "genai_infrastructure_usage_raw.json",
        "genai_infrastructure_costs_daily.json",
        "genai_usage_daily_unified.json",
        "genai_costs_daily_unified.json",
        # Cloud tables
        "cloud_gcp_billing_raw_daily.json",
        "cloud_aws_billing_raw_daily.json",
        "cloud_azure_billing_raw_daily.json",
        "cloud_oci_billing_raw_daily.json",
        # Subscription tables
        "subscription_plans.json",
        "subscription_plan_costs_daily.json",
        # FOCUS 1.3
        "cost_data_standard_1_3.json",
        "contract_commitment_1_3.json",
    ]

    print("\n" + "="*70)
    print("  Adding NEW N-Level Hierarchy Fields to Schemas")
    print("="*70 + "\n")

    total_modified = 0

    for schema_dir in schema_dirs:
        if not schema_dir.exists():
            print(f"⚠ Directory not found: {schema_dir}")
            continue

        print(f"📁 {schema_dir.relative_to(base_dir)}/")
        print("-" * 70)

        for filename in target_files:
            file_path = schema_dir / filename
            if not file_path.exists():
                continue

            if process_schema_file(file_path):
                print(f"  ✓ {filename} - Added 5 NEW hierarchy fields")
                total_modified += 1
            else:
                print(f"  - {filename} - Already has hierarchy fields")

    print("\n" + "="*70)
    print(f"  ✓ Modified {total_modified} schema files")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
