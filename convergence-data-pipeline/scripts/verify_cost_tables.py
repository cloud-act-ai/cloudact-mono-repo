#!/usr/bin/env python3
"""
Script to verify cost tables exist and have correct configuration.

This script checks that the billing_cost_daily table exists in the tenant dataset
and verifies its schema, partitioning, and clustering configuration.

Usage:
    python scripts/verify_cost_tables.py --tenant-id guru_232342
    python scripts/verify_cost_tables.py --tenant-id guru_232342 --project-id gac-prod-471220
"""

import sys
import argparse
import logging
from pathlib import Path
from typing import Dict, Any

from google.cloud import bigquery
from google.cloud.exceptions import NotFound

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.app.config import get_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def verify_table_exists(
    client: bigquery.Client,
    project_id: str,
    tenant_id: str,
    table_name: str
) -> Dict[str, Any]:
    """
    Verify that a table exists and return its metadata.

    Args:
        client: BigQuery client
        project_id: GCP project ID
        tenant_id: Tenant identifier (dataset name)
        table_name: Table name

    Returns:
        Dictionary with table metadata
    """
    full_table_id = f"{project_id}.{tenant_id}.{table_name}"

    try:
        table = client.get_table(full_table_id)

        return {
            "exists": True,
            "full_table_id": full_table_id,
            "created": table.created,
            "modified": table.modified,
            "num_rows": table.num_rows,
            "num_bytes": table.num_bytes,
            "schema_fields": len(table.schema),
            "time_partitioning": table.time_partitioning,
            "clustering_fields": table.clustering_fields,
            "description": table.description,
            "table": table
        }
    except NotFound:
        return {
            "exists": False,
            "full_table_id": full_table_id,
            "error": "Table not found"
        }


def verify_schema_fields(table_metadata: Dict[str, Any]) -> bool:
    """
    Verify that the table has the expected schema fields.

    Args:
        table_metadata: Table metadata dictionary

    Returns:
        True if schema is valid, False otherwise
    """
    if not table_metadata.get("exists"):
        return False

    table = table_metadata["table"]
    schema_fields = {field.name: field for field in table.schema}

    # Expected required fields
    required_fields = [
        ("billing_account_id", "STRING", "REQUIRED"),
        ("usage_start_time", "TIMESTAMP", "REQUIRED"),
        ("usage_end_time", "TIMESTAMP", "REQUIRED"),
        ("cost", "FLOAT", "REQUIRED"),
        ("ingestion_date", "DATE", "REQUIRED"),
    ]

    all_valid = True
    for field_name, expected_type, expected_mode in required_fields:
        if field_name not in schema_fields:
            logger.error(f"❌ Missing required field: {field_name}")
            all_valid = False
        else:
            field = schema_fields[field_name]
            if field.field_type != expected_type:
                logger.error(
                    f"❌ Field {field_name} has wrong type: "
                    f"{field.field_type} (expected {expected_type})"
                )
                all_valid = False
            if field.mode != expected_mode:
                logger.error(
                    f"❌ Field {field_name} has wrong mode: "
                    f"{field.mode} (expected {expected_mode})"
                )
                all_valid = False

    if all_valid:
        logger.info(f"✓ All required fields present and correctly typed")

    return all_valid


def verify_partitioning(table_metadata: Dict[str, Any]) -> bool:
    """
    Verify that the table has correct partitioning configuration.

    Args:
        table_metadata: Table metadata dictionary

    Returns:
        True if partitioning is valid, False otherwise
    """
    if not table_metadata.get("exists"):
        return False

    partitioning = table_metadata["time_partitioning"]

    if not partitioning:
        logger.error("❌ Table is not partitioned")
        return False

    expected_field = "ingestion_date"
    expected_type = "DAY"
    expected_expiration_ms = 730 * 24 * 60 * 60 * 1000  # 730 days

    all_valid = True

    if partitioning.field != expected_field:
        logger.error(
            f"❌ Partition field is {partitioning.field}, expected {expected_field}"
        )
        all_valid = False

    if partitioning.type_ != expected_type:
        logger.error(
            f"❌ Partition type is {partitioning.type_}, expected {expected_type}"
        )
        all_valid = False

    if partitioning.expiration_ms != expected_expiration_ms:
        logger.warning(
            f"⚠ Partition expiration is {partitioning.expiration_ms}ms, "
            f"expected {expected_expiration_ms}ms (730 days)"
        )

    if all_valid:
        logger.info(
            f"✓ Partitioning configured correctly: "
            f"{partitioning.type_} on {partitioning.field}"
        )

    return all_valid


def verify_clustering(table_metadata: Dict[str, Any]) -> bool:
    """
    Verify that the table has correct clustering configuration.

    Args:
        table_metadata: Table metadata dictionary

    Returns:
        True if clustering is valid, False otherwise
    """
    if not table_metadata.get("exists"):
        return False

    clustering_fields = table_metadata["clustering_fields"]

    if not clustering_fields:
        logger.error("❌ Table is not clustered")
        return False

    expected_fields = [
        "billing_account_id",
        "service_id",
        "project_id",
        "location_region"
    ]

    if clustering_fields != expected_fields:
        logger.error(
            f"❌ Clustering fields are {clustering_fields}, "
            f"expected {expected_fields}"
        )
        return False

    logger.info(f"✓ Clustering configured correctly: {', '.join(clustering_fields)}")
    return True


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Verify cost tables configuration in BigQuery"
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

    args = parser.parse_args()

    # Get settings
    settings = get_settings()
    project_id = args.project_id or settings.gcp_project_id

    logger.info("=" * 80)
    logger.info("Verifying Cost Tables in BigQuery")
    logger.info("=" * 80)
    logger.info(f"Project ID: {project_id}")
    logger.info(f"Tenant ID (Dataset): {args.tenant_id}")
    logger.info(f"Table Name: {args.table_name}")
    logger.info("=" * 80)

    # Initialize BigQuery client
    client = bigquery.Client(project=project_id)

    # Verify table exists
    logger.info("\n1. Checking table existence...")
    table_metadata = verify_table_exists(
        client, project_id, args.tenant_id, args.table_name
    )

    if not table_metadata["exists"]:
        logger.error(f"❌ Table does not exist: {table_metadata['full_table_id']}")
        logger.error("Run 'python scripts/create_cost_tables.py' to create the table")
        sys.exit(1)

    logger.info(f"✓ Table exists: {table_metadata['full_table_id']}")
    logger.info(f"  - Created: {table_metadata['created']}")
    logger.info(f"  - Last Modified: {table_metadata['modified']}")
    logger.info(f"  - Rows: {table_metadata['num_rows']:,}")
    logger.info(f"  - Size: {table_metadata['num_bytes']:,} bytes")
    logger.info(f"  - Schema Fields: {table_metadata['schema_fields']}")

    # Verify schema
    logger.info("\n2. Verifying schema fields...")
    schema_valid = verify_schema_fields(table_metadata)

    # Verify partitioning
    logger.info("\n3. Verifying partitioning configuration...")
    partitioning_valid = verify_partitioning(table_metadata)

    # Verify clustering
    logger.info("\n4. Verifying clustering configuration...")
    clustering_valid = verify_clustering(table_metadata)

    # Summary
    logger.info("\n" + "=" * 80)
    logger.info("Verification Summary")
    logger.info("=" * 80)
    logger.info(f"Table Exists: {'✓' if table_metadata['exists'] else '❌'}")
    logger.info(f"Schema Valid: {'✓' if schema_valid else '❌'}")
    logger.info(f"Partitioning Valid: {'✓' if partitioning_valid else '❌'}")
    logger.info(f"Clustering Valid: {'✓' if clustering_valid else '❌'}")
    logger.info("=" * 80)

    all_valid = (
        table_metadata["exists"] and
        schema_valid and
        partitioning_valid and
        clustering_valid
    )

    if all_valid:
        logger.info("\n✓ ALL CHECKS PASSED - Table is correctly configured!")
        sys.exit(0)
    else:
        logger.error("\n❌ SOME CHECKS FAILED - Please review the errors above")
        sys.exit(1)


if __name__ == "__main__":
    main()
