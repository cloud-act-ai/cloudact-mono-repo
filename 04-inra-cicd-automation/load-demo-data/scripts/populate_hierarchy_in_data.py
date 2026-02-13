#!/usr/bin/env python3
"""
Populate hierarchy fields in demo data files (GenAI + Cloud).

Assigns cost data to the 4 leaf teams from the demo hierarchy:
  Engineering > Platform > Backend     (TEAM-BACKEND)
  Engineering > Platform > Frontend    (TEAM-FRONTEND)
  Data Science > ML Pipeline > ML Ops  (TEAM-MLOPS)
  Data Science > ML Pipeline > Data Engineering (TEAM-DATAENG)

Distribution:
  GenAI:  OpenAI → Backend, Anthropic → ML Ops, Gemini → Data Engineering
  Cloud:  GCP → Backend, AWS → Frontend, Azure → ML Ops, OCI → Data Engineering

Usage:
  python3 scripts/populate_hierarchy_in_data.py
"""

import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')

# Hierarchy assignments matching hierarchy_template.csv
HIERARCHY = {
    "TEAM-BACKEND": {
        "entity_id": "TEAM-BACKEND",
        "entity_name": "Backend",
        "level_code": "function",
        "path": "/DEPT-ENG/PROJ-PLATFORM/TEAM-BACKEND",
        "path_names": "Engineering > Platform > Backend",
    },
    "TEAM-FRONTEND": {
        "entity_id": "TEAM-FRONTEND",
        "entity_name": "Frontend",
        "level_code": "function",
        "path": "/DEPT-ENG/PROJ-PLATFORM/TEAM-FRONTEND",
        "path_names": "Engineering > Platform > Frontend",
    },
    "TEAM-MLOPS": {
        "entity_id": "TEAM-MLOPS",
        "entity_name": "ML Ops",
        "level_code": "function",
        "path": "/DEPT-DS/PROJ-MLPIPE/TEAM-MLOPS",
        "path_names": "Data Science > ML Pipeline > ML Ops",
    },
    "TEAM-DATAENG": {
        "entity_id": "TEAM-DATAENG",
        "entity_name": "Data Engineering",
        "level_code": "function",
        "path": "/DEPT-DS/PROJ-MLPIPE/TEAM-DATAENG",
        "path_names": "Data Science > ML Pipeline > Data Engineering",
    },
}

# Provider → Team mapping
GENAI_PROVIDER_MAP = {
    "openai": "TEAM-BACKEND",
    "anthropic": "TEAM-MLOPS",
    "gemini": "TEAM-DATAENG",
}

CLOUD_PROVIDER_MAP = {
    "gcp": "TEAM-BACKEND",
    "aws": "TEAM-FRONTEND",
    "azure": "TEAM-MLOPS",
    "oci": "TEAM-DATAENG",
}


def set_hierarchy_fields(record: dict, team_id: str) -> dict:
    """Set the 5 x_hierarchy_* fields on a record."""
    h = HIERARCHY[team_id]
    record["x_hierarchy_entity_id"] = h["entity_id"]
    record["x_hierarchy_entity_name"] = h["entity_name"]
    record["x_hierarchy_level_code"] = h["level_code"]
    record["x_hierarchy_path"] = h["path"]
    record["x_hierarchy_path_names"] = h["path_names"]
    return record


def _set_json_field(record: dict, field_name: str, team_id: str) -> None:
    """Set cost_center and entity_id in a JSON string field."""
    val = record.get(field_name)
    if val:
        try:
            obj = json.loads(val)
            obj["cost_center"] = team_id
            obj["entity_id"] = team_id
            record[field_name] = json.dumps(obj)
        except (json.JSONDecodeError, TypeError):
            pass


def update_cloud_tags(record: dict, team_id: str, provider: str) -> dict:
    """Update provider-specific tag fields so FOCUS convert hierarchy JOIN matches.

    The stored procedure COALESCE checks these fields per provider:
      GCP:   labels_json → $.cost_center
      AWS:   resource_tags_json → $.cost_center, cost_category_json → $.cost_center
      Azure: cost_center (direct column), resource_tags_json → $.cost_center
      OCI:   freeform_tags_json → $.cost_center, defined_tags_json → $.cost_center
    """
    if provider == "gcp":
        _set_json_field(record, "labels_json", team_id)
    elif provider == "aws":
        _set_json_field(record, "resource_tags_json", team_id)
        _set_json_field(record, "cost_category_json", team_id)
    elif provider == "azure":
        record["cost_center"] = team_id  # Direct column checked first
        _set_json_field(record, "resource_tags_json", team_id)
    elif provider == "oci":
        _set_json_field(record, "freeform_tags_json", team_id)
        _set_json_field(record, "defined_tags_json", team_id)
    return record


def process_ndjson_file(filepath: str, team_id: str, cloud_provider: str = None) -> int:
    """Process a single NDJSON file, populating hierarchy fields."""
    records = []
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            record = set_hierarchy_fields(record, team_id)
            if cloud_provider:
                record = update_cloud_tags(record, team_id, cloud_provider)
            records.append(record)

    with open(filepath, 'w') as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')

    return len(records)


def main():
    print("Populating hierarchy in demo data files")
    print("=" * 60)

    total = 0

    # GenAI files
    genai_dir = os.path.join(DATA_DIR, 'genai')
    genai_files = {
        "openai_usage_raw.json": "openai",
        "anthropic_usage_raw.json": "anthropic",
        "gemini_usage_raw.json": "gemini",
    }

    print("\nGenAI data:")
    for filename, provider in genai_files.items():
        filepath = os.path.join(genai_dir, filename)
        if not os.path.exists(filepath):
            print(f"  SKIP: {filename} (not found)")
            continue
        team_id = GENAI_PROVIDER_MAP[provider]
        count = process_ndjson_file(filepath, team_id)
        h = HIERARCHY[team_id]
        print(f"  {filename}: {count} records → {h['entity_name']} ({team_id})")
        total += count

    # Cloud files
    cloud_dir = os.path.join(DATA_DIR, 'cloud')
    cloud_files = {
        "gcp_billing_raw.json": "gcp",
        "aws_billing_raw.json": "aws",
        "azure_billing_raw.json": "azure",
        "oci_billing_raw.json": "oci",
    }

    print("\nCloud data:")
    for filename, provider in cloud_files.items():
        filepath = os.path.join(cloud_dir, filename)
        if not os.path.exists(filepath):
            print(f"  SKIP: {filename} (not found)")
            continue
        team_id = CLOUD_PROVIDER_MAP[provider]
        count = process_ndjson_file(filepath, team_id, cloud_provider=provider)
        h = HIERARCHY[team_id]
        print(f"  {filename}: {count} records → {h['entity_name']} ({team_id})")
        total += count

    print(f"\nTotal: {total} records updated")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
