#!/usr/bin/env python3
"""
Fix hierarchy values in generated demo data files.

Updates old entity IDs and level_codes to match new hierarchy structure:
  - TEAM-PLAT → TEAM-PLATFORMS
  - TEAM-TC → TEAM-TECHCTR
  - level_code "team" → "function"
  - level_code "department" → "c_suite"
  - level_code "project" → "business_unit"

Usage:
    python fix_hierarchy_in_demo_data.py
"""

import json
import csv
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# Entity ID replacements
ENTITY_ID_REPLACEMENTS = {
    "TEAM-PLAT": "TEAM-PLATFORMS",
    "TEAM-TC": "TEAM-TECHCTR",
}

# Level code replacements
LEVEL_CODE_REPLACEMENTS = {
    "team": "function",
    "department": "c_suite",
    "project": "business_unit",
}

# Path replacements
PATH_REPLACEMENTS = {
    "/DEPT-CIO/PROJ-CTO/TEAM-PLAT": "/DEPT-CIO/PROJ-CTO/TEAM-PLATFORMS",
    "/DEPT-CIO/PROJ-CTO/TEAM-TC": "/DEPT-CIO/PROJ-CTO/TEAM-TECHCTR",
}


def fix_json_record(record: dict) -> dict:
    """Fix hierarchy values in a single JSON record."""
    # Fix entity ID (x_hierarchy_* fields per 5-field model)
    if "x_hierarchy_entity_id" in record and record["x_hierarchy_entity_id"]:
        old_id = record["x_hierarchy_entity_id"]
        if old_id in ENTITY_ID_REPLACEMENTS:
            record["x_hierarchy_entity_id"] = ENTITY_ID_REPLACEMENTS[old_id]

    # Fix level code
    if "x_hierarchy_level_code" in record and record["x_hierarchy_level_code"]:
        old_code = record["x_hierarchy_level_code"]
        if old_code in LEVEL_CODE_REPLACEMENTS:
            record["x_hierarchy_level_code"] = LEVEL_CODE_REPLACEMENTS[old_code]

    # Fix path
    if "x_hierarchy_path" in record and record["x_hierarchy_path"]:
        old_path = record["x_hierarchy_path"]
        for old, new in PATH_REPLACEMENTS.items():
            if old in old_path:
                record["x_hierarchy_path"] = old_path.replace(old, new)
                break

    return record


def fix_json_file(filepath: Path) -> int:
    """Fix hierarchy values in a JSON file. Returns number of records fixed."""
    if not filepath.exists():
        print(f"  Skipped: {filepath} (not found)")
        return 0

    with open(filepath, 'r') as f:
        lines = f.readlines()

    fixed_count = 0
    fixed_lines = []

    for line in lines:
        if not line.strip():
            fixed_lines.append(line)
            continue

        try:
            record = json.loads(line.strip())
            original = json.dumps(record)
            fixed_record = fix_json_record(record)
            fixed_json = json.dumps(fixed_record)

            if fixed_json != original:
                fixed_count += 1

            fixed_lines.append(fixed_json + '\n')
        except json.JSONDecodeError:
            fixed_lines.append(line)

    with open(filepath, 'w') as f:
        f.writelines(fixed_lines)

    print(f"  Fixed: {filepath.name} ({fixed_count} records)")
    return fixed_count


def fix_csv_file(filepath: Path) -> int:
    """Fix hierarchy values in a CSV file. Returns number of records fixed."""
    if not filepath.exists():
        print(f"  Skipped: {filepath} (not found)")
        return 0

    with open(filepath, 'r', newline='') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames

    if not rows or not fieldnames:
        print(f"  Skipped: {filepath} (empty)")
        return 0

    fixed_count = 0

    for row in rows:
        original = dict(row)

        # Fix entity ID (x_hierarchy_* fields per 5-field model)
        if "x_hierarchy_entity_id" in row and row["x_hierarchy_entity_id"]:
            old_id = row["x_hierarchy_entity_id"]
            if old_id in ENTITY_ID_REPLACEMENTS:
                row["x_hierarchy_entity_id"] = ENTITY_ID_REPLACEMENTS[old_id]

        # Fix level code
        if "x_hierarchy_level_code" in row and row["x_hierarchy_level_code"]:
            old_code = row["x_hierarchy_level_code"]
            if old_code in LEVEL_CODE_REPLACEMENTS:
                row["x_hierarchy_level_code"] = LEVEL_CODE_REPLACEMENTS[old_code]

        # Fix path
        if "x_hierarchy_path" in row and row["x_hierarchy_path"]:
            old_path = row["x_hierarchy_path"]
            for old, new in PATH_REPLACEMENTS.items():
                if old in old_path:
                    row["x_hierarchy_path"] = old_path.replace(old, new)
                    break

        if row != original:
            fixed_count += 1

    with open(filepath, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Fixed: {filepath.name} ({fixed_count} records)")
    return fixed_count


def main():
    """Main function to fix all demo data files."""
    print("=" * 70)
    print("Fixing Hierarchy Values in Demo Data Files")
    print("=" * 70)
    print()
    print("Replacements:")
    print("  Entity IDs:")
    for old, new in ENTITY_ID_REPLACEMENTS.items():
        print(f"    {old} → {new}")
    print("  Level Codes:")
    for old, new in LEVEL_CODE_REPLACEMENTS.items():
        print(f"    {old} → {new}")
    print()

    total_fixed = 0

    # Fix GenAI JSON files
    print("GenAI data files:")
    genai_dir = DATA_DIR / "genai"
    for json_file in genai_dir.glob("*.json"):
        total_fixed += fix_json_file(json_file)

    # Fix Cloud JSON files
    print("\nCloud data files:")
    cloud_dir = DATA_DIR / "cloud"
    for json_file in cloud_dir.glob("*.json"):
        total_fixed += fix_json_file(json_file)

    # Fix Subscription CSV file
    print("\nSubscription data files:")
    sub_dir = DATA_DIR / "subscriptions"
    for csv_file in sub_dir.glob("*.csv"):
        total_fixed += fix_csv_file(csv_file)

    print()
    print("=" * 70)
    print(f"Total records fixed: {total_fixed}")
    print("=" * 70)

    return 0


if __name__ == "__main__":
    exit(main())
