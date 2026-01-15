#!/usr/bin/env python3
"""
Convert demo data files from N-level hierarchy to 10-level hierarchy structure.

Usage:
    python3 convert_hierarchy_to_10_level.py
"""

import json
import csv
import sys
from pathlib import Path

# Hierarchy template mapping (from hierarchy_template.csv)
# NOTE: Entity IDs must match default_hierarchy.csv:
#   - TEAM-PLATFORMS (not TEAM-PLAT)
#   - TEAM-TECHCTR (not TEAM-TC)
HIERARCHY_MAP = {
    "DEPT-CFO": {"level": 1, "name": "Group CFO", "parent": None},
    "DEPT-CIO": {"level": 1, "name": "Group CIO", "parent": None},
    "DEPT-COO": {"level": 1, "name": "Group COO", "parent": None},
    "DEPT-BIZ": {"level": 1, "name": "Business Lines", "parent": None},
    "PROJ-BU1": {"level": 2, "name": "Business Unit 1 IT", "parent": "DEPT-CIO"},
    "PROJ-BU2": {"level": 2, "name": "Business Unit 2 IT", "parent": "DEPT-CIO"},
    "PROJ-CTO": {"level": 2, "name": "Engineering", "parent": "DEPT-CIO"},
    "PROJ-ITCOO": {"level": 2, "name": "IT Operations", "parent": "DEPT-CIO"},
    "PROJ-BIZCOO": {"level": 2, "name": "Business Operations", "parent": "DEPT-COO"},
    "PROJ-PROC": {"level": 2, "name": "Procurement", "parent": "DEPT-COO"},
    "PROJ-GRPOPS": {"level": 2, "name": "Group Operations", "parent": "DEPT-COO"},
    "TEAM-PLATFORMS": {"level": 3, "name": "Platforms", "parent": "PROJ-CTO"},
    "TEAM-ARCH": {"level": 3, "name": "Architecture", "parent": "PROJ-CTO"},
    "TEAM-INFRA": {"level": 3, "name": "Infrastructure", "parent": "PROJ-CTO"},
    "TEAM-TECHCTR": {"level": 3, "name": "Technology Centres", "parent": "PROJ-CTO"},
    "TEAM-DATA": {"level": 3, "name": "Data", "parent": "PROJ-CTO"},
    "TEAM-FINOPS": {"level": 3, "name": "FinOps", "parent": "PROJ-ITCOO"},
    "TEAM-ITSUPPORT": {"level": 3, "name": "IT Support", "parent": "PROJ-ITCOO"},
    "TEAM-BU1APP": {"level": 3, "name": "BU1 Applications", "parent": "PROJ-BU1"},
    "TEAM-BU2APP": {"level": 3, "name": "BU2 Applications", "parent": "PROJ-BU2"},
}


def parse_hierarchy_path(entity_id):
    """
    Parse hierarchy path from entity_id and build 10-level structure.
    Returns dict with hierarchy_level_N_id and hierarchy_level_N_name for levels 1-10.
    """
    result = {}

    # Initialize all 10 levels to null
    for i in range(1, 11):
        result[f"hierarchy_level_{i}_id"] = None
        result[f"hierarchy_level_{i}_name"] = None

    if not entity_id or entity_id not in HIERARCHY_MAP:
        return result

    # Build path from entity_id upwards
    path = []
    current_id = entity_id

    while current_id:
        if current_id not in HIERARCHY_MAP:
            break
        entity = HIERARCHY_MAP[current_id]
        path.insert(0, {"id": current_id, "name": entity["name"]})
        current_id = entity.get("parent")

    # Populate hierarchy levels
    for idx, node in enumerate(path, start=1):
        if idx <= 10:
            result[f"hierarchy_level_{idx}_id"] = node["id"]
            result[f"hierarchy_level_{idx}_name"] = node["name"]

    return result


def convert_json_file(input_path, output_path):
    """Convert a JSON file from N-level to 10-level hierarchy."""
    print(f"\nProcessing: {input_path}")

    # Read input file
    with open(input_path, 'r') as f:
        lines = f.readlines()

    records = [json.loads(line.strip()) for line in lines if line.strip()]
    print(f"  Found {len(records)} records")

    converted_count = 0
    for record in records:
        # Check if has old N-level fields
        if 'hierarchy_entity_id' in record:
            entity_id = record['hierarchy_entity_id']

            # Remove old N-level fields
            old_fields = [
                'hierarchy_entity_id',
                'hierarchy_entity_name',
                'hierarchy_level_code',
                'hierarchy_path',
                'hierarchy_path_names'
            ]
            for field in old_fields:
                record.pop(field, None)

            # Add 10-level fields
            hierarchy_levels = parse_hierarchy_path(entity_id)
            record.update(hierarchy_levels)

            converted_count += 1

    # Write output file
    with open(output_path, 'w') as f:
        for record in records:
            f.write(json.dumps(record) + '\n')

    print(f"  ✓ Converted {converted_count} records")
    print(f"  ✓ Saved to: {output_path}")


def convert_csv_file(input_path, output_path):
    """Convert a CSV file from N-level to 10-level hierarchy."""
    print(f"\nProcessing: {input_path}")

    # Read input CSV
    with open(input_path, 'r') as f:
        reader = csv.DictReader(f)
        records = list(reader)

    print(f"  Found {len(records)} records")

    if not records:
        print("  No records to convert")
        return

    converted_count = 0

    # Process each record
    for record in records:
        # Check if has old N-level fields
        if 'hierarchy_entity_id' in record:
            entity_id = record['hierarchy_entity_id']

            # Remove old N-level fields
            old_fields = [
                'hierarchy_entity_id',
                'hierarchy_entity_name',
                'hierarchy_level_code',
                'hierarchy_path',
                'hierarchy_path_names'
            ]
            for field in old_fields:
                record.pop(field, None)

            # Add 10-level fields
            hierarchy_levels = parse_hierarchy_path(entity_id)
            record.update(hierarchy_levels)

            converted_count += 1

    # Write output CSV
    if records:
        fieldnames = list(records[0].keys())
        with open(output_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)

        print(f"  ✓ Converted {converted_count} records")
        print(f"  ✓ Saved to: {output_path}")


def main():
    """Main conversion function."""
    base_dir = Path(__file__).parent.parent / "data"

    print("=" * 80)
    print("Converting Demo Data from N-level to 10-level Hierarchy")
    print("=" * 80)

    # GenAI files
    genai_files = [
        "genai/anthropic_usage_raw.json",
        "genai/openai_usage_raw.json",
        "genai/gemini_usage_raw.json",
    ]

    for file_path in genai_files:
        input_path = base_dir / file_path
        output_path = input_path  # Overwrite in place

        if input_path.exists():
            convert_json_file(input_path, output_path)
        else:
            print(f"\n⚠ File not found: {input_path}")

    # Cloud cost files
    cloud_files = [
        "cloud/gcp_billing_raw.json",
        "cloud/aws_billing_raw.json",
        "cloud/azure_billing_raw.json",
        "cloud/oci_billing_raw.json",
    ]

    for file_path in cloud_files:
        input_path = base_dir / file_path
        output_path = input_path  # Overwrite in place

        if input_path.exists():
            convert_json_file(input_path, output_path)
        else:
            print(f"\n⚠ File not found: {input_path}")

    # Subscription plans CSV
    csv_file = "subscriptions/subscription_plans.csv"
    input_path = base_dir / csv_file
    output_path = input_path  # Overwrite in place

    if input_path.exists():
        convert_csv_file(input_path, output_path)
    else:
        print(f"\n⚠ File not found: {input_path}")

    print("\n" + "=" * 80)
    print("Conversion Complete!")
    print("=" * 80)


if __name__ == "__main__":
    main()
