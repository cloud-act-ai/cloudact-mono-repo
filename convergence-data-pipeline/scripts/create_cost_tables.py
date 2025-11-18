#!/usr/bin/env python3
"""
Script to create cost-related tables in BigQuery for a tenant dataset.

This script creates the billing_cost_daily table in the specified tenant dataset
using the schema template defined in ps_templates/gcp/bq_etl/schema_template.json

Usage:
    python scripts/create_cost_tables.py --tenant-id guru_232342
    python scripts/create_cost_tables.py --tenant-id guru_232342 --project-id gac-prod-471220
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path
from typing import List

from google.cloud import bigquery
from google.cloud.exceptions import NotFound

# Add project root to path to import application modules
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def load_billing_cost_schema() -> List[bigquery.SchemaField]:
    """
    Load the billing_cost schema from the template file.

    Returns:
        List of BigQuery SchemaField objects
    """
    schema_file = project_root / "ps_templates" / "gcp" / "bq_etl" / "schema_template.json"

    if not schema_file.exists():
        raise FileNotFoundError(f"Schema template not found at {schema_file}")

    with open(schema_file, 'r') as f:
        schema_templates = json.load(f)

    billing_cost_schema = schema_templates["schemas"]["billing_cost"]["fields"]

    # Convert to BigQuery SchemaField objects
    schema = []
    for field in billing_cost_schema:
        schema.append(bigquery.SchemaField(
            name=field["name"],
            field_type=field["type"],
            mode=field.get("mode", "NULLABLE"),
            description=field.get("description", "")
        ))

    return schema


def create_billing_cost_table(
    project_id: str,
    tenant_id: str,
    table_name: str = "billing_cost_daily"
) -> None:
    """
    Create the billing_cost_daily table with partitioning and clustering.

    Args:
        project_id: GCP project ID
        tenant_id: Tenant identifier (dataset name)
        table_name: Table name (default: billing_cost_daily)
    """
    # Initialize BigQuery client
    client = bigquery.Client(project=project_id)

    # Full table ID
    dataset_id = tenant_id
    full_table_id = f"{project_id}.{dataset_id}.{table_name}"

    logger.info(f"Creating table: {full_table_id}")

    # Check if dataset exists
    try:
        dataset = client.get_dataset(dataset_id)
        logger.info(f"Dataset {dataset_id} exists")
    except NotFound:
        logger.error(f"Dataset {dataset_id} not found. Please create the dataset first.")
        raise

    # Load schema
    schema = load_billing_cost_schema()
    logger.info(f"Loaded schema with {len(schema)} fields")

    # Create table with partitioning and clustering
    table = bigquery.Table(full_table_id, schema=schema)

    # Configure time partitioning on ingestion_date
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="ingestion_date",
        expiration_ms=730 * 24 * 60 * 60 * 1000  # 730 days (2 years)
    )

    # Configure clustering for query performance
    table.clustering_fields = [
        "billing_account_id",
        "service_id",
        "project_id",
        "location_region"
    ]

    table.description = "Daily GCP billing cost data with usage metrics and pricing information"

    # Create table (idempotent - will not fail if exists)
    try:
        table = client.create_table(table, exists_ok=True)
        logger.info(f"Successfully created/verified table: {full_table_id}")
        logger.info(f"  - Partitioned by: ingestion_date (DAY, 730 days retention)")
        logger.info(f"  - Clustered by: {', '.join(table.clustering_fields)}")
        logger.info(f"  - Schema fields: {len(schema)}")
    except Exception as e:
        logger.error(f"Error creating table: {e}")
        raise


def verify_table(project_id: str, tenant_id: str, table_name: str) -> None:
    """
    Verify that the table was created successfully.

    Args:
        project_id: GCP project ID
        tenant_id: Tenant identifier (dataset name)
        table_name: Table name
    """
    client = bigquery.Client(project=project_id)
    full_table_id = f"{project_id}.{tenant_id}.{table_name}"

    try:
        table = client.get_table(full_table_id)
        logger.info(f"\nTable verification for {full_table_id}:")
        logger.info(f"  - Created: {table.created}")
        logger.info(f"  - Schema fields: {len(table.schema)}")
        logger.info(f"  - Partitioning: {table.time_partitioning}")
        logger.info(f"  - Clustering: {table.clustering_fields}")
        logger.info(f"  - Total rows: {table.num_rows}")
        logger.info(f"  - Size: {table.num_bytes} bytes")
        return True
    except NotFound:
        logger.error(f"Table {full_table_id} not found!")
        return False


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Create cost-related tables in BigQuery for a tenant dataset"
    )
    parser.add_argument(
        "--tenant-id",
        required=True,
        help="Tenant ID (dataset name), e.g., guru_232342"
    )
    parser.add_argument(
        "--project-id",
        help="GCP project ID (defaults to settings.gcp_project_id)"
    )
    parser.add_argument(
        "--table-name",
        default="billing_cost_daily",
        help="Table name (default: billing_cost_daily)"
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Verify table after creation"
    )

    args = parser.parse_args()

    # Get settings
    settings = get_settings()

    # Use provided project_id or fall back to settings
    project_id = args.project_id or settings.gcp_project_id

    logger.info("=" * 80)
    logger.info("Creating Cost Tables in BigQuery")
    logger.info("=" * 80)
    logger.info(f"Project ID: {project_id}")
    logger.info(f"Tenant ID (Dataset): {args.tenant_id}")
    logger.info(f"Table Name: {args.table_name}")
    logger.info("=" * 80)

    try:
        # Create the billing_cost_daily table
        create_billing_cost_table(
            project_id=project_id,
            tenant_id=args.tenant_id,
            table_name=args.table_name
        )

        # Verify if requested
        if args.verify:
            verify_table(
                project_id=project_id,
                tenant_id=args.tenant_id,
                table_name=args.table_name
            )

        logger.info("=" * 80)
        logger.info("SUCCESS: Cost tables created successfully!")
        logger.info("=" * 80)

    except Exception as e:
        logger.error(f"FAILED: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
