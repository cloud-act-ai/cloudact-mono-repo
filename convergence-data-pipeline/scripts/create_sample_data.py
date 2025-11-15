#!/usr/bin/env python3
"""
Create sample GCP billing export data for testing pipelines
"""
import os
from google.cloud import bigquery
from datetime import datetime, timedelta

# Set credentials
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/gurukallam/.gcp/gac-prod-471220-e34944040b62.json"
os.environ["GCP_PROJECT_ID"] = "gac-prod-471220"

def create_sample_billing_data():
    """Create a sample billing export table for testing"""
    client = bigquery.Client(project="gac-prod-471220")

    # Use acmeinc_23xv2 dataset for sample data
    dataset_id = "acmeinc_23xv2"
    table_id = "gcp_billing_export_source"
    full_table_id = f"gac-prod-471220.{dataset_id}.{table_id}"

    # Define schema matching GCP billing export
    schema = [
        bigquery.SchemaField("project", "RECORD", mode="NULLABLE", fields=[
            bigquery.SchemaField("id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("name", "STRING", mode="NULLABLE"),
        ]),
        bigquery.SchemaField("service", "RECORD", mode="NULLABLE", fields=[
            bigquery.SchemaField("id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("description", "STRING", mode="NULLABLE"),
        ]),
        bigquery.SchemaField("sku", "RECORD", mode="NULLABLE", fields=[
            bigquery.SchemaField("id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("description", "STRING", mode="NULLABLE"),
        ]),
        bigquery.SchemaField("usage", "RECORD", mode="NULLABLE", fields=[
            bigquery.SchemaField("amount", "FLOAT64", mode="NULLABLE"),
            bigquery.SchemaField("unit", "STRING", mode="NULLABLE"),
        ]),
        bigquery.SchemaField("usage_start_time", "TIMESTAMP", mode="NULLABLE"),
        bigquery.SchemaField("usage_end_time", "TIMESTAMP", mode="NULLABLE"),
        bigquery.SchemaField("cost", "FLOAT64", mode="NULLABLE"),
        bigquery.SchemaField("currency", "STRING", mode="NULLABLE"),
    ]

    # Create table
    table = bigquery.Table(full_table_id, schema=schema)
    table = client.create_table(table, exists_ok=True)
    print(f"✓ Created table {full_table_id}")

    # Insert sample data
    today = datetime.now().date()

    rows_to_insert = [
        {
            "project": {"id": "test-project-1", "name": "Test Project 1"},
            "service": {"id": "compute", "description": "Compute Engine"},
            "sku": {"id": "sku-001", "description": "N1 Predefined Instance Core running in Americas"},
            "usage": {"amount": 720.0, "unit": "hour"},
            "usage_start_time": datetime.combine(today, datetime.min.time()),
            "usage_end_time": datetime.combine(today, datetime.max.time()),
            "cost": 25.50,
            "currency": "USD",
        },
        {
            "project": {"id": "test-project-1", "name": "Test Project 1"},
            "service": {"id": "storage", "description": "Cloud Storage"},
            "sku": {"id": "sku-002", "description": "Standard Storage US"},
            "usage": {"amount": 1024.0, "unit": "gigabyte"},
            "usage_start_time": datetime.combine(today, datetime.min.time()),
            "usage_end_time": datetime.combine(today, datetime.max.time()),
            "cost": 20.48,
            "currency": "USD",
        },
        {
            "project": {"id": "test-project-2", "name": "Test Project 2"},
            "service": {"id": "bigquery", "description": "BigQuery"},
            "sku": {"id": "sku-003", "description": "Analysis"},
            "usage": {"amount": 500.0, "unit": "terabyte"},
            "usage_start_time": datetime.combine(today, datetime.min.time()),
            "usage_end_time": datetime.combine(today, datetime.max.time()),
            "cost": 250.00,
            "currency": "USD",
        },
        {
            "project": {"id": "test-project-2", "name": "Test Project 2"},
            "service": {"id": "pubsub", "description": "Cloud Pub/Sub"},
            "sku": {"id": "sku-004", "description": "Message Delivery Basic"},
            "usage": {"amount": 1000000.0, "unit": "request"},
            "usage_start_time": datetime.combine(today, datetime.min.time()),
            "usage_end_time": datetime.combine(today, datetime.max.time()),
            "cost": 40.00,
            "currency": "USD",
        },
        {
            "project": {"id": "test-project-3", "name": "Test Project 3"},
            "service": {"id": "kubernetes", "description": "Kubernetes Engine"},
            "sku": {"id": "sku-005", "description": "Cluster Management Fee"},
            "usage": {"amount": 730.0, "unit": "hour"},
            "usage_start_time": datetime.combine(today, datetime.min.time()),
            "usage_end_time": datetime.combine(today, datetime.max.time()),
            "cost": 72.00,
            "currency": "USD",
        },
    ]

    errors = client.insert_rows_json(full_table_id, rows_to_insert)
    if errors:
        print(f"✗ Errors inserting rows: {errors}")
        return False
    else:
        print(f"✓ Inserted {len(rows_to_insert)} sample rows into {full_table_id}")
        return True

if __name__ == "__main__":
    print("Creating sample billing export data...")
    success = create_sample_billing_data()
    if success:
        print("\n✓ Sample data created successfully!")
        print("  Table: gac-prod-471220.acmeinc_23xv2.gcp_billing_export_source")
        print("  This table can be used as a source for all pipeline tests")
    else:
        print("\n✗ Failed to create sample data")
