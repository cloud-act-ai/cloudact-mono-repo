#!/usr/bin/env python3
"""
Initialize BigQuery Metadata Tables
Creates all required metadata tables for the Convergence Data Pipeline.

Usage:
    python scripts/init_metadata_tables.py
"""

import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from google.cloud import bigquery
from src.app.config import settings
from src.core.utils.logging import setup_logging

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)


def create_metadata_dataset(client: bigquery.Client) -> bigquery.Dataset:
    """
    Create the metadata dataset (idempotent).

    Args:
        client: BigQuery client

    Returns:
        Dataset object
    """
    dataset_id = f"{settings.gcp_project_id}.metadata"

    dataset = bigquery.Dataset(dataset_id)
    dataset.location = settings.bigquery_location
    dataset.description = "Operational metadata for Convergence Data Pipeline"
    dataset.labels = {
        "managed-by": "convergence-pipeline",
        "purpose": "metadata"
    }

    dataset = client.create_dataset(dataset, exists_ok=True)
    logger.info(f"Created/verified metadata dataset: {dataset_id}")

    return dataset


def create_api_keys_table(client: bigquery.Client) -> bigquery.Table:
    """
    Create metadata.api_keys table for tenant authentication.

    Table schema:
    - api_key_hash (STRING): SHA256 hash of API key
    - tenant_id (STRING): Tenant identifier
    - created_at (TIMESTAMP): When API key was created
    - created_by (STRING): Who created the API key
    - is_active (BOOLEAN): Whether API key is active
    - last_used_at (TIMESTAMP): Last time API key was used
    - usage_count (INTEGER): Number of times API key was used
    """
    table_id = f"{settings.gcp_project_id}.metadata.api_keys"

    schema = [
        bigquery.SchemaField("api_key_hash", "STRING", mode="REQUIRED",
                            description="SHA256 hash of API key"),
        bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED",
                            description="Tenant identifier"),
        bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED",
                            description="When API key was created"),
        bigquery.SchemaField("created_by", "STRING", mode="NULLABLE",
                            description="Who created the API key"),
        bigquery.SchemaField("is_active", "BOOLEAN", mode="REQUIRED",
                            description="Whether API key is active"),
        bigquery.SchemaField("last_used_at", "TIMESTAMP", mode="NULLABLE",
                            description="Last time API key was used"),
        bigquery.SchemaField("usage_count", "INTEGER", mode="NULLABLE",
                            description="Number of times API key was used"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE",
                            description="API key description/purpose"),
    ]

    table = bigquery.Table(table_id, schema=schema)
    table.description = "API keys for tenant authentication"

    # Cluster by tenant_id and is_active for faster lookups
    table.clustering_fields = ["tenant_id", "is_active"]

    table = client.create_table(table, exists_ok=True)
    logger.info(f"Created/verified table: {table_id}")

    return table


def create_pipeline_runs_table(client: bigquery.Client) -> bigquery.Table:
    """
    Create metadata.pipeline_runs table for pipeline execution tracking.

    Table schema matches the design in README.md
    """
    table_id = f"{settings.gcp_project_id}.metadata.pipeline_runs"

    schema = [
        bigquery.SchemaField("pipeline_logging_id", "STRING", mode="REQUIRED",
                            description="UUID for this specific run"),
        bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED",
                            description="Tenant identifier"),
        bigquery.SchemaField("pipeline_id", "STRING", mode="REQUIRED",
                            description="Pipeline identifier (e.g., p_openai_billing)"),
        bigquery.SchemaField("status", "STRING", mode="REQUIRED",
                            description="PENDING, INGESTING, VALIDATING, TRANSFORMING, FAILED, COMPLETE"),
        bigquery.SchemaField("trigger_type", "STRING", mode="NULLABLE",
                            description="api, scheduler, webhook, manual"),
        bigquery.SchemaField("trigger_by", "STRING", mode="NULLABLE",
                            description="service-account@project.iam.gserviceaccount.com or user email"),
        bigquery.SchemaField("start_time", "TIMESTAMP", mode="REQUIRED",
                            description="When the run was created"),
        bigquery.SchemaField("end_time", "TIMESTAMP", mode="NULLABLE",
                            description="When the run finished"),
        bigquery.SchemaField("duration_ms", "INTEGER", mode="NULLABLE",
                            description="Total run time in milliseconds"),
        bigquery.SchemaField("run_metadata", "JSON", mode="NULLABLE",
                            description="Detailed step-by-step execution log"),
        bigquery.SchemaField("error_message", "STRING", mode="NULLABLE",
                            description="Full stack trace if failed"),
        bigquery.SchemaField("ingestion_date", "DATE", mode="REQUIRED",
                            description="Partition column (DATE(start_time))"),
    ]

    table = bigquery.Table(table_id, schema=schema)
    table.description = "Pipeline execution tracking and operational logs"

    # Partition by ingestion_date
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="ingestion_date"
    )

    # Cluster for fast queries
    table.clustering_fields = ["tenant_id", "pipeline_id", "status"]

    table = client.create_table(table, exists_ok=True)
    logger.info(f"Created/verified table: {table_id}")

    return table


def create_dq_results_table(client: bigquery.Client) -> bigquery.Table:
    """
    Create metadata.dq_results table for data quality results.
    """
    table_id = f"{settings.gcp_project_id}.metadata.dq_results"

    schema = [
        bigquery.SchemaField("dq_result_id", "STRING", mode="REQUIRED",
                            description="UUID for this DQ check result"),
        bigquery.SchemaField("pipeline_logging_id", "STRING", mode="REQUIRED",
                            description="Links to pipeline_runs table"),
        bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED",
                            description="Tenant identifier"),
        bigquery.SchemaField("target_table", "STRING", mode="REQUIRED",
                            description="Table that was validated"),
        bigquery.SchemaField("dq_config_id", "STRING", mode="REQUIRED",
                            description="DQ configuration ID"),
        bigquery.SchemaField("executed_at", "TIMESTAMP", mode="REQUIRED",
                            description="When DQ check was executed"),
        bigquery.SchemaField("expectations_passed", "INTEGER", mode="REQUIRED",
                            description="Number of expectations that passed"),
        bigquery.SchemaField("expectations_failed", "INTEGER", mode="REQUIRED",
                            description="Number of expectations that failed"),
        bigquery.SchemaField("failed_expectations", "JSON", mode="NULLABLE",
                            description="Details of failed expectations"),
        bigquery.SchemaField("overall_status", "STRING", mode="REQUIRED",
                            description="PASS, WARNING, FAIL"),
        bigquery.SchemaField("ingestion_date", "DATE", mode="REQUIRED",
                            description="Partition column"),
    ]

    table = bigquery.Table(table_id, schema=schema)
    table.description = "Data quality validation results"

    # Partition by ingestion_date
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="ingestion_date"
    )

    # Cluster for fast queries
    table.clustering_fields = ["tenant_id", "target_table", "overall_status"]

    table = client.create_table(table, exists_ok=True)
    logger.info(f"Created/verified table: {table_id}")

    return table


def main():
    """Main initialization function."""
    logger.info("=" * 80)
    logger.info("Initializing BigQuery Metadata Tables")
    logger.info("=" * 80)
    logger.info(f"Project: {settings.gcp_project_id}")
    logger.info(f"Location: {settings.bigquery_location}")
    logger.info("")

    try:
        # Create BigQuery client
        client = bigquery.Client(
            project=settings.gcp_project_id,
            location=settings.bigquery_location
        )

        logger.info("✓ BigQuery client initialized")
        logger.info("")

        # Create metadata dataset
        logger.info("Creating metadata dataset...")
        create_metadata_dataset(client)
        logger.info("")

        # Create tables
        logger.info("Creating metadata tables...")
        create_api_keys_table(client)
        create_pipeline_runs_table(client)
        create_dq_results_table(client)
        logger.info("")

        logger.info("=" * 80)
        logger.info("✅ Metadata tables initialized successfully!")
        logger.info("=" * 80)
        logger.info("")
        logger.info("Next steps:")
        logger.info("1. Create a tenant: python scripts/create_tenant.py")
        logger.info("2. Generate API key for tenant")
        logger.info("3. Configure tenant pipelines in configs/{tenant_id}/")
        logger.info("")

        return 0

    except Exception as e:
        logger.error("=" * 80)
        logger.error("❌ Failed to initialize metadata tables")
        logger.error("=" * 80)
        logger.exception(e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
