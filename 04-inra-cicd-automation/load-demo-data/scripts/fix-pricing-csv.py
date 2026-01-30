#!/usr/bin/env python3
"""
Fix GenAI Pricing CSV to Match Schema

Transforms genai_payg_pricing.csv to match the BigQuery schema exactly:
- Removes columns not in schema: volume_tier, free_tier_input_tokens, free_tier_output_tokens, notes
- Adds columns from schema: is_override, override_input_per_1m, override_output_per_1m, override_effective_from, override_notes

Usage:
    python fix-pricing-csv.py
"""

import csv
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "pricing"
SOURCE_FILE = DATA_DIR / "genai_payg_pricing.csv"
BACKUP_FILE = DATA_DIR / "genai_payg_pricing.csv.backup"

# Schema-defined columns in order (excluding x_* which are added at load time)
SCHEMA_COLUMNS = [
    "provider",
    "model",
    "model_family",
    "model_version",
    "region",
    "input_per_1m",
    "output_per_1m",
    "cached_input_per_1m",
    "cached_write_per_1m",
    "batch_input_per_1m",
    "batch_output_per_1m",
    "cached_discount_pct",
    "batch_discount_pct",
    "volume_discount_pct",
    "context_window",
    "max_output_tokens",
    "supports_vision",
    "supports_streaming",
    "supports_tools",
    "rate_limit_rpm",
    "rate_limit_tpm",
    "sla_uptime_pct",
    "effective_from",
    "effective_to",
    "status",
    "is_override",
    "override_input_per_1m",
    "override_output_per_1m",
    "override_effective_from",
    "override_notes",
    "last_updated",
]

# Columns to remove (not in schema)
COLUMNS_TO_REMOVE = {"volume_tier", "free_tier_input_tokens", "free_tier_output_tokens", "notes"}

# Columns to add (in schema but not in CSV)
COLUMNS_TO_ADD = {"is_override", "override_input_per_1m", "override_output_per_1m", "override_effective_from", "override_notes"}


def main():
    print("=" * 60)
    print("Fix GenAI Pricing CSV")
    print("=" * 60)

    if not SOURCE_FILE.exists():
        print(f"ERROR: Source file not found: {SOURCE_FILE}")
        return

    # Read CSV
    with open(SOURCE_FILE, 'r') as f:
        reader = csv.DictReader(f)
        original_headers = reader.fieldnames or []
        rows = list(reader)

    print(f"Original columns ({len(original_headers)}): {', '.join(original_headers[:5])}...")
    print(f"Rows: {len(rows)}")

    # Create backup
    with open(BACKUP_FILE, 'w') as f:
        writer = csv.DictWriter(f, fieldnames=list(original_headers))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Backup created: {BACKUP_FILE}")

    # Transform rows
    new_rows = []
    for row in rows:
        new_row = {}
        for col in SCHEMA_COLUMNS:
            if col in row:
                new_row[col] = row[col]
            elif col in COLUMNS_TO_ADD:
                # Add empty value for new columns
                new_row[col] = ""
            else:
                new_row[col] = row.get(col, "")
        new_rows.append(new_row)

    # Write transformed CSV
    with open(SOURCE_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=SCHEMA_COLUMNS)
        writer.writeheader()
        writer.writerows(new_rows)

    print(f"\nNew columns ({len(SCHEMA_COLUMNS)}): {', '.join(SCHEMA_COLUMNS[:5])}...")
    print(f"Removed: {', '.join(COLUMNS_TO_REMOVE)}")
    print(f"Added: {', '.join(COLUMNS_TO_ADD)}")

    print("\n" + "=" * 60)
    print("SUCCESS: CSV transformed to match schema")
    print("=" * 60)


if __name__ == "__main__":
    main()
