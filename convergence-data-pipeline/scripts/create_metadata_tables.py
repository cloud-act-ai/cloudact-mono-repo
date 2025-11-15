#!/usr/bin/env python3
"""
Create Metadata Tables Script
Creates required metadata tables for the convergence data pipeline.
"""

import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from google.cloud import bigquery
from src.app.config import settings

def create_api_keys_table(client: bigquery.Client, dataset_id: str):
    """Create the api_keys table for authentication."""
    table_id = f"{settings.gcp_project_id}.{dataset_id}.api_keys"

    schema = [
        bigquery.SchemaField("api_key_id", "STRING", mode="REQUIRED", description="Unique API key identifier"),
        bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED", description="Tenant identifier"),
        bigquery.SchemaField("api_key_hash", "STRING", mode="REQUIRED", description="Hashed API key"),
        bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED", description="Creation timestamp"),
        bigquery.SchemaField("created_by", "STRING", mode="NULLABLE", description="Who created the key"),
        bigquery.SchemaField("expires_at", "TIMESTAMP", mode="NULLABLE", description="Expiration timestamp"),
        bigquery.SchemaField("is_active", "BOOLEAN", mode="REQUIRED", description="Whether key is active"),
        bigquery.SchemaField("last_used_at", "TIMESTAMP", mode="NULLABLE", description="Last usage timestamp"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE", description="Key description"),
    ]

    table = bigquery.Table(table_id, schema=schema)
    table.description = "API keys for tenant authentication"

    # Create or update table
    try:
        table = client.create_table(table)
        print(f"✅ Created table {table_id}")
    except Exception as e:
        if "Already Exists" in str(e):
            print(f"⏭️  Table {table_id} already exists")
        else:
            raise


def create_pipeline_runs_table(client: bigquery.Client, dataset_id: str):
    """Create the pipeline_runs table for pipeline execution tracking."""
    table_id = f"{settings.gcp_project_id}.{dataset_id}.pipeline_runs"

    schema = [
        bigquery.SchemaField("pipeline_logging_id", "STRING", mode="REQUIRED", description="Unique run identifier"),
        bigquery.SchemaField("pipeline_id", "STRING", mode="REQUIRED", description="Pipeline identifier"),
        bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED", description="Tenant identifier"),
        bigquery.SchemaField("status", "STRING", mode="REQUIRED", description="Run status (PENDING, RUNNING, COMPLETE, FAILED)"),
        bigquery.SchemaField("trigger_type", "STRING", mode="REQUIRED", description="Trigger type (api, scheduler, manual)"),
        bigquery.SchemaField("trigger_by", "STRING", mode="REQUIRED", description="Who triggered the pipeline"),
        bigquery.SchemaField("start_time", "TIMESTAMP", mode="REQUIRED", description="Start timestamp"),
        bigquery.SchemaField("end_time", "TIMESTAMP", mode="NULLABLE", description="End timestamp"),
        bigquery.SchemaField("duration_ms", "INTEGER", mode="NULLABLE", description="Duration in milliseconds"),
        bigquery.SchemaField("config_version", "STRING", mode="NULLABLE", description="Config version (git SHA)"),
        bigquery.SchemaField("worker_instance", "STRING", mode="NULLABLE", description="Worker instance ID"),
        bigquery.SchemaField("error_message", "STRING", mode="NULLABLE", description="Error message if failed"),
        bigquery.SchemaField("parameters", "JSON", mode="NULLABLE", description="Pipeline execution parameters"),
    ]

    table = bigquery.Table(table_id, schema=schema)
    table.description = "Pipeline execution runs tracking"

    # Partition by start_time (date)
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="start_time"
    )

    # Cluster by tenant_id and pipeline_id
    table.clustering_fields = ["tenant_id", "pipeline_id", "status"]

    # Create or update table
    try:
        table = client.create_table(table)
        print(f"✅ Created table {table_id}")
    except Exception as e:
        if "Already Exists" in str(e):
            print(f"⏭️  Table {table_id} already exists")
        else:
            raise


def create_step_logs_table(client: bigquery.Client, dataset_id: str):
    """Create the step_logs table for detailed step execution tracking."""
    table_id = f"{settings.gcp_project_id}.{dataset_id}.step_logs"

    schema = [
        bigquery.SchemaField("step_logging_id", "STRING", mode="REQUIRED", description="Unique step log identifier"),
        bigquery.SchemaField("pipeline_logging_id", "STRING", mode="REQUIRED", description="Parent pipeline run ID"),
        bigquery.SchemaField("step_name", "STRING", mode="REQUIRED", description="Step name"),
        bigquery.SchemaField("step_type", "STRING", mode="REQUIRED", description="Step type (ingest, dq_check, transform)"),
        bigquery.SchemaField("step_index", "INTEGER", mode="REQUIRED", description="Step order in pipeline"),
        bigquery.SchemaField("status", "STRING", mode="REQUIRED", description="Step status"),
        bigquery.SchemaField("start_time", "TIMESTAMP", mode="REQUIRED", description="Step start time"),
        bigquery.SchemaField("end_time", "TIMESTAMP", mode="NULLABLE", description="Step end time"),
        bigquery.SchemaField("duration_ms", "INTEGER", mode="NULLABLE", description="Duration in milliseconds"),
        bigquery.SchemaField("rows_processed", "INTEGER", mode="NULLABLE", description="Number of rows processed"),
        bigquery.SchemaField("error_message", "STRING", mode="NULLABLE", description="Error message if failed"),
        bigquery.SchemaField("metadata", "JSON", mode="NULLABLE", description="Additional step metadata"),
    ]

    table = bigquery.Table(table_id, schema=schema)
    table.description = "Detailed step execution logs"

    # Partition by start_time
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="start_time"
    )

    # Cluster by pipeline_logging_id
    table.clustering_fields = ["pipeline_logging_id", "status"]

    # Create or update table
    try:
        table = client.create_table(table)
        print(f"✅ Created table {table_id}")
    except Exception as e:
        if "Already Exists" in str(e):
            print(f"⏭️  Table {table_id} already exists")
        else:
            raise


def main():
    """Main execution."""
    print("=" * 60)
    print("Creating Metadata Tables")
    print("=" * 60)
    print(f"Project ID: {settings.gcp_project_id}")
    print(f"Location: {settings.bigquery_location}")
    print()

    # Initialize BigQuery client
    client = bigquery.Client(
        project=settings.gcp_project_id,
        location=settings.bigquery_location
    )

    metadata_dataset = "metadata"

    print(f"Creating tables in dataset: {metadata_dataset}")
    print()

    # Create tables
    create_api_keys_table(client, metadata_dataset)
    create_pipeline_runs_table(client, metadata_dataset)
    create_step_logs_table(client, metadata_dataset)

    print()
    print("=" * 60)
    print("✅ Metadata tables setup complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
