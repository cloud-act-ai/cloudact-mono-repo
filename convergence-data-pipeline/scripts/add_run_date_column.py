#!/usr/bin/env python3
"""
Add run_date column to pipeline_runs table
"""
import os
from google.cloud import bigquery

# Set credentials
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/gurukallam/.gcp/gac-prod-471220-e34944040b62.json"
os.environ["GCP_PROJECT_ID"] = "gac-prod-471220"

def main():
    client = bigquery.Client(project="gac-prod-471220")

    # Table reference
    table_id = "gac-prod-471220.metadata.pipeline_runs"

    print(f"Adding run_date column to {table_id}...")

    # Get current table
    table = client.get_table(table_id)

    # Check if run_date column already exists
    existing_columns = [field.name for field in table.schema]
    if "run_date" in existing_columns:
        print("✓ run_date column already exists!")
        return

    # Create new schema with run_date column
    new_schema = list(table.schema)
    new_field = bigquery.SchemaField(
        "run_date",
        "DATE",
        mode="NULLABLE",
        description="The business date this pipeline run is processing data for (e.g., '2025-11-15'). Extracted from parameters.date field. Used for data partitioning, deduplication by date, and business reporting. NULL if pipeline doesn't have a date parameter."
    )

    # Find the position to insert (before 'parameters' field)
    insert_position = None
    for i, field in enumerate(new_schema):
        if field.name == "parameters":
            insert_position = i
            break

    if insert_position is not None:
        new_schema.insert(insert_position, new_field)
    else:
        # If parameters field not found, append at end
        new_schema.append(new_field)

    # Update table schema
    table.schema = new_schema
    table = client.update_table(table, ["schema"])

    print(f"✓ Successfully added run_date column to {table_id}")
    print(f"✓ New schema has {len(table.schema)} columns")

if __name__ == "__main__":
    main()
