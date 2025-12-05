
from google.cloud import bigquery
import json
import os

# Configuration
PROJECT_ID = "gac-prod-471220"
DATASET_ID = "test_org_12042025_local"
TABLE_ID = "saas_subscription_plans"
SCHEMA_PATH = "api-service/configs/saas/seed/schemas/saas_subscription_plans.json"

def create_table():
    client = bigquery.Client(project=PROJECT_ID)
    dataset_ref = client.dataset(DATASET_ID)
    table_ref = dataset_ref.table(TABLE_ID)

    try:
        client.get_dataset(dataset_ref)
        print(f"Dataset {DATASET_ID} exists.")
    except Exception:
        print(f"Dataset {DATASET_ID} not found or inaccessible. Attempting to create...")
        try:
            dataset = bigquery.Dataset(dataset_ref)
            dataset.location = "US"
            client.create_dataset(dataset)
            print(f"Dataset {DATASET_ID} created.")
        except Exception as e:
            print(f"Dataset creation failed (might already exist): {e}")

    # Load schema
    with open(SCHEMA_PATH, "r") as f:
        schema_json = json.load(f)
    
    schema = []
    for field in schema_json["fields"]:
        schema.append(bigquery.SchemaField(
            name=field["name"],
            field_type=field["type"],
            mode=field.get("mode", "NULLABLE"),
            description=field.get("description")
        ))

    table = bigquery.Table(table_ref, schema=schema)
    
    # Clustering
    table.clustering_fields = ["provider", "plan_name"]

    try:
        client.create_table(table)
        print(f"Table {TABLE_ID} created successfully.")
    except Exception as e:
        print(f"Failed to create table: {e}")

if __name__ == "__main__":
    create_table()
