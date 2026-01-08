#!/usr/bin/env python3
"""
Remove ALL OLD 10-level hierarchy fields from schema files.
Keeps ONLY NEW N-level hierarchy fields (hierarchy_entity_id, hierarchy_path, etc.)
"""

import json
from pathlib import Path
from typing import List, Dict, Any

# OLD fields to remove
OLD_HIERARCHY_FIELDS = []
for level in range(1, 11):
    OLD_HIERARCHY_FIELDS.append(f"hierarchy_level_{level}_id")
    OLD_HIERARCHY_FIELDS.append(f"hierarchy_level_{level}_name")

# NEW fields to keep
NEW_HIERARCHY_FIELDS = [
    "hierarchy_entity_id",
    "hierarchy_entity_name",
    "hierarchy_level_code",
    "hierarchy_path",
    "hierarchy_path_names",
]

def clean_schema(schema: List[Dict[str, Any]]):
    """Remove OLD hierarchy fields from schema."""
    cleaned = []
    removed_count = 0

    for field in schema:
        field_name = field.get("name", "")

        # Skip OLD hierarchy fields
        if field_name in OLD_HIERARCHY_FIELDS:
            removed_count += 1
            continue

        cleaned.append(field)

    return cleaned, removed_count

def process_schema_file(file_path: Path):
    """Process a single schema file."""
    print(f"Processing {file_path.name}...", end=" ")

    with open(file_path, 'r') as f:
        schema = json.load(f)

    cleaned_schema, removed_count = clean_schema(schema)

    if removed_count > 0:
        # Write back cleaned schema
        with open(file_path, 'w') as f:
            json.dump(cleaned_schema, f, indent=2)
        print(f"✓ Removed {removed_count} OLD fields")
    else:
        print("✓ No OLD fields found")

def main():
    # Paths to schema directories
    base_dir = Path(__file__).parent.parent.parent.parent

    schema_dirs = [
        # Demo data schemas
        base_dir / "04-inra-cicd-automation" / "load-demo-data" / "schemas",
        # Onboarding schemas
        base_dir / "02-api-service" / "configs" / "setup" / "organizations" / "onboarding" / "schemas",
    ]

    print("\n" + "="*70)
    print("  Removing OLD 10-Level Hierarchy Fields from ALL Schemas")
    print("="*70 + "\n")

    total_files = 0
    total_removed = 0

    for schema_dir in schema_dirs:
        if not schema_dir.exists():
            print(f"⚠ Directory not found: {schema_dir}")
            continue

        print(f"\n📁 {schema_dir.relative_to(base_dir)}/")
        print("-" * 70)

        for schema_file in sorted(schema_dir.glob("*.json")):
            process_schema_file(schema_file)
            total_files += 1

    print("\n" + "="*70)
    print(f"  ✓ Processed {total_files} schema files")
    print(f"  ✓ Schemas now contain ONLY NEW N-level hierarchy fields")
    print("="*70 + "\n")

    print("Next steps:")
    print("  1. Delete BigQuery dataset: acme_inc_01082026_local")
    print("  2. Re-onboard with updated schemas")
    print("  3. Transform demo data to remove OLD fields")
    print("  4. Load demo data\n")

if __name__ == "__main__":
    main()
