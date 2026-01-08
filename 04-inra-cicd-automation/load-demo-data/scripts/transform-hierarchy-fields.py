#!/usr/bin/env python3
"""
Transform demo data files to add NEW N-level hierarchy fields.
Reads OLD 10-level hierarchy and generates NEW N-level fields.
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any

def transform_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Transform record: Remove OLD 10-level hierarchy, add NEW N-level hierarchy."""

    # First, extract all hierarchy data before removing fields
    leaf_level = None
    leaf_id = None
    leaf_name = None
    path_parts = []
    path_name_parts = []

    # Find the deepest populated level and collect path data
    for level in range(1, 11):
        level_id = record.get(f"hierarchy_level_{level}_id")
        level_name = record.get(f"hierarchy_level_{level}_name")

        if level_id:
            leaf_level = level
            leaf_id = level_id
            leaf_name = level_name
            path_parts.append(level_id)
            if level_name:
                path_name_parts.append(level_name)

    # Remove ALL OLD 10-level hierarchy fields
    for level in range(1, 11):
        record.pop(f"hierarchy_level_{level}_id", None)
        record.pop(f"hierarchy_level_{level}_name", None)

    # Add NEW N-level hierarchy fields
    if not leaf_level:
        # No hierarchy data, use defaults
        record["hierarchy_entity_id"] = "UNASSIGNED"
        record["hierarchy_entity_name"] = "Unassigned"
        record["hierarchy_level_code"] = "unassigned"
        record["hierarchy_path"] = "/UNASSIGNED"
        record["hierarchy_path_names"] = "Unassigned"
    else:
        # Determine level code based on position
        level_codes = {
            1: "department",
            2: "project",
            3: "team",
            4: "team",  # Deeper levels default to team
            5: "team",
            6: "team",
            7: "team",
            8: "team",
            9: "team",
            10: "team",
        }

        record["hierarchy_entity_id"] = leaf_id
        record["hierarchy_entity_name"] = leaf_name
        record["hierarchy_level_code"] = level_codes.get(leaf_level, "team")
        record["hierarchy_path"] = "/" + "/".join(path_parts) if path_parts else "/UNASSIGNED"
        record["hierarchy_path_names"] = " > ".join(path_name_parts) if path_name_parts else "Unassigned"

    return record

def transform_file(input_file: Path, output_file: Path):
    """Transform a JSONL file by adding NEW N-level hierarchy fields."""

    print(f"Transforming {input_file.name}...")

    records_processed = 0

    with open(input_file, 'r') as infile, open(output_file, 'w') as outfile:
        for line in infile:
            if not line.strip():
                continue

            record = json.loads(line)
            transformed = transform_record(record)
            outfile.write(json.dumps(transformed) + '\n')
            records_processed += 1

    print(f"  ✓ Processed {records_processed} records")
    print(f"  ✓ Output: {output_file}")

def main():
    # Define data directories
    base_dir = Path(__file__).parent.parent
    genai_dir = base_dir / "data" / "genai"
    cloud_dir = base_dir / "data" / "cloud"

    # Process GenAI usage files
    genai_files = [
        "openai_usage_raw.json",
        "anthropic_usage_raw.json",
        "gemini_usage_raw.json",
    ]

    print("\n" + "="*60)
    print("  Transforming GenAI Usage Files")
    print("="*60 + "\n")

    for filename in genai_files:
        input_file = genai_dir / filename
        output_file = genai_dir / f"{filename}.new"

        if input_file.exists():
            transform_file(input_file, output_file)
            # Replace original with transformed
            output_file.rename(input_file)
        else:
            print(f"  ⚠ File not found: {input_file}")

    # Process Cloud billing files
    cloud_files = [
        "gcp_billing_raw.json",
        "aws_billing_raw.json",
        "azure_billing_raw.json",
        "oci_billing_raw.json",
    ]

    print("\n" + "="*60)
    print("  Transforming Cloud Billing Files")
    print("="*60 + "\n")

    for filename in cloud_files:
        input_file = cloud_dir / filename
        output_file = cloud_dir / f"{filename}.new"

        if input_file.exists():
            transform_file(input_file, output_file)
            # Replace original with transformed
            output_file.rename(input_file)
        else:
            print(f"  ⚠ File not found: {input_file}")

    print("\n" + "="*60)
    print("  ✓ Transformation Complete!")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
