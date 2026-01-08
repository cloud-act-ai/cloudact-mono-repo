#!/usr/bin/env python3
"""
Transform subscription_plans.csv to replace OLD hierarchy with NEW N-level hierarchy.
"""

import csv
from pathlib import Path

def get_new_hierarchy_fields(row):
    """Extract NEW N-level hierarchy from OLD 10-level hierarchy."""
    # Find the deepest populated level
    leaf_level = None
    leaf_id = None
    leaf_name = None
    path_parts = []
    path_name_parts = []

    for level in range(1, 11):
        level_id = row.get(f"hierarchy_level_{level}_id", "").strip()
        level_name = row.get(f"hierarchy_level_{level}_name", "").strip()

        if level_id:
            leaf_level = level
            leaf_id = level_id
            leaf_name = level_name
            path_parts.append(level_id)
            if level_name:
                path_name_parts.append(level_name)

    if not leaf_level:
        return {
            "hierarchy_entity_id": "UNASSIGNED",
            "hierarchy_entity_name": "Unassigned",
            "hierarchy_level_code": "unassigned",
            "hierarchy_path": "/UNASSIGNED",
            "hierarchy_path_names": "Unassigned"
        }

    # Determine level code
    level_codes = {
        1: "department",
        2: "project",
        3: "team",
    }

    return {
        "hierarchy_entity_id": leaf_id,
        "hierarchy_entity_name": leaf_name,
        "hierarchy_level_code": level_codes.get(leaf_level, "team"),
        "hierarchy_path": "/" + "/".join(path_parts),
        "hierarchy_path_names": " > ".join(path_name_parts)
    }

def main():
    base_dir = Path(__file__).parent.parent
    input_file = base_dir / "data" / "subscriptions" / "subscription_plans.csv"
    output_file = base_dir / "data" / "subscriptions" / "subscription_plans_new.csv"

    print("\n" + "="*70)
    print("  Transforming subscription_plans.csv")
    print("="*70 + "\n")

    with open(input_file, 'r') as infile, open(output_file, 'w', newline='') as outfile:
        reader = csv.DictReader(infile)

        # Build new fieldnames (remove OLD hierarchy, add NEW hierarchy)
        old_hierarchy_fields = []
        for level in range(1, 11):
            old_hierarchy_fields.append(f"hierarchy_level_{level}_id")
            old_hierarchy_fields.append(f"hierarchy_level_{level}_name")

        new_hierarchy_fields = [
            "hierarchy_entity_id",
            "hierarchy_entity_name",
            "hierarchy_level_code",
            "hierarchy_path",
            "hierarchy_path_names"
        ]

        # Filter out OLD hierarchy fields from original fieldnames
        new_fieldnames = [f for f in reader.fieldnames if f not in old_hierarchy_fields]

        # Insert NEW hierarchy fields before 'renewal_date' or at end
        insert_index = len(new_fieldnames)
        for i, f in enumerate(new_fieldnames):
            if f in ["renewal_date", "contract_id", "notes"]:
                insert_index = i
                break

        final_fieldnames = new_fieldnames[:insert_index] + new_hierarchy_fields + new_fieldnames[insert_index:]

        writer = csv.DictWriter(outfile, fieldnames=final_fieldnames)
        writer.writeheader()

        records_processed = 0
        for row in reader:
            # Get NEW hierarchy fields
            new_hierarchy = get_new_hierarchy_fields(row)

            # Remove OLD hierarchy fields
            for field in old_hierarchy_fields:
                row.pop(field, None)

            # Add NEW hierarchy fields
            row.update(new_hierarchy)

            writer.writerow(row)
            records_processed += 1

    print(f"  ✓ Processed {records_processed} subscription plans")
    print(f"  ✓ Removed {len(old_hierarchy_fields)} OLD hierarchy columns")
    print(f"  ✓ Added {len(new_hierarchy_fields)} NEW hierarchy columns")
    print(f"  ✓ Output: {output_file}")
    print("\n" + "="*70 + "\n")

    # Replace original with new file
    output_file.rename(input_file)
    print(f"  ✓ Replaced original file\n")

if __name__ == "__main__":
    main()
