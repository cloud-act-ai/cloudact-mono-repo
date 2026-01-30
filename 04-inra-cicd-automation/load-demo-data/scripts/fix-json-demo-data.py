#!/usr/bin/env python3
"""
Fix JSON Demo Data Files

Adds missing required fields to demo data JSON files:
- x_genai_provider (from provider field)
- x_ingestion_id (generate UUID)
- x_ingestion_date (from usage_date or x_pipeline_run_date)

Usage:
    python fix-json-demo-data.py
"""

import json
import uuid
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"


def fix_genai_usage_json(filepath: Path) -> int:
    """Fix GenAI usage JSON file by adding missing required fields."""
    print(f"Fixing: {filepath.name}")

    records = []
    with open(filepath, 'r') as f:
        for line in f:
            if line.strip():
                record = json.loads(line)

                # Add x_genai_provider if missing (copy from provider)
                if 'x_genai_provider' not in record:
                    record['x_genai_provider'] = record.get('provider', 'unknown')

                # Add x_ingestion_id if missing (generate UUID)
                if 'x_ingestion_id' not in record:
                    record['x_ingestion_id'] = str(uuid.uuid4())

                # Add x_ingestion_date if missing (copy from usage_date or x_pipeline_run_date)
                if 'x_ingestion_date' not in record:
                    record['x_ingestion_date'] = record.get('usage_date') or record.get('x_pipeline_run_date')

                records.append(record)

    # Write back
    with open(filepath, 'w') as f:
        for record in records:
            f.write(json.dumps(record) + '\n')

    print(f"  Fixed {len(records)} records")
    return len(records)


def fix_cloud_billing_json(filepath: Path) -> int:
    """Fix Cloud billing JSON file - verify required fields exist."""
    print(f"Verifying: {filepath.name}")

    records = []
    with open(filepath, 'r') as f:
        for line in f:
            if line.strip():
                record = json.loads(line)

                # Add x_ingestion_id if missing
                if 'x_ingestion_id' not in record:
                    record['x_ingestion_id'] = str(uuid.uuid4())

                # Add x_ingestion_date if missing
                if 'x_ingestion_date' not in record:
                    # For cloud, derive from usage_start_time
                    usage_start = record.get('usage_start_time', '')
                    if usage_start:
                        record['x_ingestion_date'] = usage_start[:10]  # YYYY-MM-DD
                    else:
                        record['x_ingestion_date'] = record.get('x_pipeline_run_date')

                records.append(record)

    # Write back
    with open(filepath, 'w') as f:
        for record in records:
            f.write(json.dumps(record) + '\n')

    print(f"  Verified {len(records)} records")
    return len(records)


def main():
    print("=" * 60)
    print("Fix JSON Demo Data Files")
    print("=" * 60)

    total_fixed = 0

    # Fix GenAI usage files
    genai_dir = DATA_DIR / "genai"
    if genai_dir.exists():
        for json_file in genai_dir.glob("*_usage_raw.json"):
            total_fixed += fix_genai_usage_json(json_file)

    # Fix Cloud billing files
    cloud_dir = DATA_DIR / "cloud"
    if cloud_dir.exists():
        for json_file in cloud_dir.glob("*_billing_raw.json"):
            total_fixed += fix_cloud_billing_json(json_file)

    print("")
    print("=" * 60)
    print(f"Total records fixed: {total_fixed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
