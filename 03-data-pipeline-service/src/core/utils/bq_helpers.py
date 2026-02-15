"""
BigQuery Helper Utilities

Production-grade utilities for BigQuery operations:
- Idempotent inserts with insertId generation
- Dead Letter Queue (DLQ) for failed records
- Batch loads for large datasets (switching from streaming to load jobs)
- Parameterized SQL queries

SECURITY: All operations are tenant-isolated via org_slug parameters.
"""

import hashlib
import io
import json
import logging
from datetime import datetime, date, timezone
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, asdict

from google.cloud import bigquery
from google.cloud.bigquery import LoadJobConfig, WriteDisposition, SourceFormat

from src.app.config import get_settings
from src.core.utils.logging import get_logger, safe_error_log

logger = get_logger(__name__)
settings = get_settings()


# ============================================
# Constants
# ============================================

# Threshold for switching from streaming inserts to batch loads
BATCH_LOAD_THRESHOLD = 100

# Maximum rows per streaming insert batch
MAX_STREAMING_BATCH_SIZE = 500

# DLQ table suffix
DLQ_TABLE_SUFFIX = "_dlq"


# ============================================
# Data Classes
# ============================================

@dataclass
class DLQRecord:
    """Record for Dead Letter Queue."""
    org_slug: str
    source_table: str
    error_message: str
    error_type: str
    raw_data: str
    failed_at: str
    pipeline_id: Optional[str] = None
    step_id: Optional[str] = None
    retry_count: int = 0


@dataclass
class InsertResult:
    """Result of insert operation."""
    success: bool
    rows_inserted: int
    rows_failed: int
    dlq_records: int
    error: Optional[str] = None


# ============================================
# Idempotent Insert ID Generation
# ============================================

def generate_insert_id(row: Dict[str, Any], key_fields: Optional[List[str]] = None) -> str:
    """
    Generate a deterministic insertId for BigQuery streaming inserts.

    IDEMPOTENCY: BigQuery deduplicates rows with the same insertId within
    a 1-minute window. This prevents duplicate data on retries.

    Args:
        row: The row data to generate ID for
        key_fields: Optional list of field names to use as composite key.
                   If not provided, uses entire row content.

    Returns:
        A deterministic hash string suitable for insertId
    """
    if key_fields:
        # Use only specified key fields for deterministic ID
        key_data = {k: row.get(k) for k in key_fields if k in row}
    else:
        # Use entire row content
        key_data = row

    # Convert to stable JSON string (sorted keys for consistency)
    json_str = json.dumps(key_data, sort_keys=True, default=str)

    # Generate SHA256 hash truncated to 32 chars (BigQuery insertId limit is ~100 chars)
    return hashlib.sha256(json_str.encode()).hexdigest()[:32]


def add_insert_ids(
    rows: List[Dict[str, Any]],
    key_fields: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Add insertId to each row for idempotent streaming inserts.

    Args:
        rows: List of row dictionaries
        key_fields: Optional list of fields to use for ID generation

    Returns:
        List of rows with 'insertId' key added
    """
    result = []
    for row in rows:
        row_with_id = row.copy()
        row_with_id["insertId"] = generate_insert_id(row, key_fields)
        result.append(row_with_id)
    return result


# ============================================
# Dead Letter Queue (DLQ)
# ============================================

def create_dlq_record(
    org_slug: str,
    source_table: str,
    row: Dict[str, Any],
    error: Exception,
    pipeline_id: Optional[str] = None,
    step_id: Optional[str] = None
) -> DLQRecord:
    """
    Create a DLQ record for a failed row.

    Args:
        org_slug: Organization identifier
        source_table: Original target table
        row: The failed row data
        error: The exception that occurred
        pipeline_id: Optional pipeline identifier
        step_id: Optional step identifier

    Returns:
        DLQRecord ready for insertion
    """
    return DLQRecord(
        org_slug=org_slug,
        source_table=source_table,
        error_message=str(error)[:1000],  # Truncate long error messages
        error_type=type(error).__name__,
        raw_data=json.dumps(row, default=str)[:10000],  # Truncate large payloads
        failed_at=datetime.now(timezone.utc).isoformat() + "Z",
        pipeline_id=pipeline_id,
        step_id=step_id,
        retry_count=0
    )


async def send_to_dlq(
    bq_client: bigquery.Client,
    project_id: str,
    dataset_id: str,
    dlq_records: List[DLQRecord]
) -> bool:
    """
    Send failed records to the Dead Letter Queue table.

    Creates the DLQ table if it doesn't exist.

    Args:
        bq_client: BigQuery client
        project_id: GCP project ID
        dataset_id: Dataset ID
        dlq_records: List of DLQ records to insert

    Returns:
        True if successful, False otherwise
    """
    if not dlq_records:
        return True

    dlq_table_id = f"{project_id}.{dataset_id}.pipeline_dlq"

    # Ensure DLQ table exists
    _ensure_dlq_table_exists(bq_client, dlq_table_id)

    # Convert to row dicts
    rows = [asdict(record) for record in dlq_records]

    try:
        errors = bq_client.insert_rows_json(dlq_table_id, rows)
        if errors:
            logger.error(
                "Failed to insert DLQ records",
                extra={"errors": errors[:3], "record_count": len(rows)}  # Log first 3 errors
            )
            return False

        logger.warning(
            "Sent records to DLQ",
            extra={"record_count": len(rows), "dlq_table": dlq_table_id}
        )
        return True

    except Exception as e:
        safe_error_log(logger, "DLQ insert failed", e, record_count=len(rows))
        return False


def _ensure_dlq_table_exists(bq_client: bigquery.Client, table_id: str) -> None:
    """Ensure DLQ table exists with proper schema."""
    schema = [
        bigquery.SchemaField("org_slug", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("source_table", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("error_message", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("error_type", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("raw_data", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("failed_at", "TIMESTAMP", mode="REQUIRED"),
        bigquery.SchemaField("pipeline_id", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("step_id", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("retry_count", "INTEGER", mode="REQUIRED"),
    ]

    table = bigquery.Table(table_id, schema=schema)
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="failed_at"
    )

    try:
        bq_client.create_table(table, exists_ok=True)
    except Exception as e:
        logger.warning(f"Could not create DLQ table (may already exist): {e}")


# ============================================
# Batch Load vs Streaming Insert
# ============================================

def serialize_row_for_json(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize a row for JSON/BigQuery compatibility.

    Converts datetime objects to ISO format strings.

    Args:
        row: Row dictionary

    Returns:
        Serialized row dictionary
    """
    serialized = {}
    for key, value in row.items():
        if isinstance(value, (datetime, date)):
            serialized[key] = value.isoformat()
        elif isinstance(value, dict):
            serialized[key] = serialize_row_for_json(value)
        elif isinstance(value, list):
            serialized[key] = [
                serialize_row_for_json(v) if isinstance(v, dict) else v
                for v in value
            ]
        else:
            serialized[key] = value
    return serialized


async def insert_rows_smart(
    bq_client: bigquery.Client,
    table_id: str,
    rows: List[Dict[str, Any]],
    org_slug: str,
    key_fields: Optional[List[str]] = None,
    write_disposition: str = "WRITE_APPEND",
    pipeline_context: Optional[Dict[str, Any]] = None
) -> InsertResult:
    """
    Smart insert that chooses between streaming and batch load based on row count.

    - For small batches (<100 rows): Uses streaming insert with insertId for idempotency
    - For large batches (>=100 rows): Uses batch load job (more efficient, no insertId needed)

    IDEMPOTENCY:
    - Streaming inserts use insertId for deduplication
    - Batch loads should use WRITE_TRUNCATE for full replace or handle at query level

    Args:
        bq_client: BigQuery client
        table_id: Full table ID (project.dataset.table)
        rows: List of row dictionaries
        org_slug: Organization identifier for DLQ
        key_fields: Optional fields for insertId generation
        write_disposition: WRITE_APPEND or WRITE_TRUNCATE
        pipeline_context: Optional dict with pipeline_id and step_id

    Returns:
        InsertResult with success status and counts
    """
    if not rows:
        return InsertResult(success=True, rows_inserted=0, rows_failed=0, dlq_records=0)

    # Serialize all rows
    serialized_rows = [serialize_row_for_json(row) for row in rows]

    if len(rows) < BATCH_LOAD_THRESHOLD:
        # Use streaming insert with idempotent insertIds
        return await _streaming_insert_with_dlq(
            bq_client=bq_client,
            table_id=table_id,
            rows=serialized_rows,
            org_slug=org_slug,
            key_fields=key_fields,
            pipeline_context=pipeline_context
        )
    else:
        # Use batch load for large datasets
        return await _batch_load(
            bq_client=bq_client,
            table_id=table_id,
            rows=serialized_rows,
            write_disposition=write_disposition
        )


async def _streaming_insert_with_dlq(
    bq_client: bigquery.Client,
    table_id: str,
    rows: List[Dict[str, Any]],
    org_slug: str,
    key_fields: Optional[List[str]] = None,
    pipeline_context: Optional[Dict[str, Any]] = None
) -> InsertResult:
    """
    Streaming insert with insertId for idempotency and DLQ for failures.

    Args:
        bq_client: BigQuery client
        table_id: Full table ID
        rows: Serialized row dictionaries
        org_slug: Organization identifier
        key_fields: Fields for insertId generation
        pipeline_context: Optional pipeline/step context

    Returns:
        InsertResult with counts
    """
    # Add insertIds for idempotency
    rows_with_ids = add_insert_ids(rows, key_fields)

    # Extract just the data (remove insertId from row data, pass separately)
    row_data = []
    insert_ids = []
    for row in rows_with_ids:
        insert_id = row.pop("insertId")
        row_data.append(row)
        insert_ids.append(insert_id)

    # BigQuery insert_rows_json expects row_ids as separate parameter
    try:
        errors = bq_client.insert_rows_json(
            table_id,
            row_data,
            row_ids=insert_ids
        )
    except Exception as e:
        safe_error_log(logger, "Streaming insert failed", e, table=table_id, row_count=len(rows))
        return InsertResult(
            success=False,
            rows_inserted=0,
            rows_failed=len(rows),
            dlq_records=0,
            error=str(e)
        )

    if not errors:
        logger.info(
            "Streaming insert successful",
            extra={"table": table_id, "rows_inserted": len(rows)}
        )
        return InsertResult(
            success=True,
            rows_inserted=len(rows),
            rows_failed=0,
            dlq_records=0
        )

    # Handle partial failures - send failed rows to DLQ
    failed_indices = set()
    for error in errors:
        if "index" in error:
            failed_indices.add(error["index"])

    rows_inserted = len(rows) - len(failed_indices)

    # Create DLQ records for failed rows
    dataset_id = table_id.split(".")[1] if "." in table_id else "unknown"
    project_id = table_id.split(".")[0] if "." in table_id else settings.gcp_project_id

    dlq_records = []
    for idx in failed_indices:
        if idx < len(row_data):
            dlq_records.append(create_dlq_record(
                org_slug=org_slug,
                source_table=table_id,
                row=row_data[idx],
                error=ValueError(f"Insert error: {errors}"),
                pipeline_id=pipeline_context.get("pipeline_id") if pipeline_context else None,
                step_id=pipeline_context.get("step_id") if pipeline_context else None
            ))

    # Send to DLQ
    if dlq_records:
        await send_to_dlq(bq_client, project_id, dataset_id, dlq_records)

    logger.warning(
        "Streaming insert partially failed",
        extra={
            "table": table_id,
            "rows_inserted": rows_inserted,
            "rows_failed": len(failed_indices),
            "dlq_records": len(dlq_records)
        }
    )

    return InsertResult(
        success=rows_inserted > 0,
        rows_inserted=rows_inserted,
        rows_failed=len(failed_indices),
        dlq_records=len(dlq_records),
        error=f"{len(failed_indices)} rows failed"
    )


async def _batch_load(
    bq_client: bigquery.Client,
    table_id: str,
    rows: List[Dict[str, Any]],
    write_disposition: str = "WRITE_APPEND"
) -> InsertResult:
    """
    Batch load using load job (more efficient for large datasets).

    Args:
        bq_client: BigQuery client
        table_id: Full table ID
        rows: Serialized row dictionaries
        write_disposition: WRITE_APPEND or WRITE_TRUNCATE

    Returns:
        InsertResult with counts
    """
    # Convert to newline-delimited JSON (BytesIO required by load_table_from_file)
    json_buffer = io.BytesIO()
    for row in rows:
        json_buffer.write((json.dumps(row, default=str) + "\n").encode("utf-8"))
    json_buffer.seek(0)

    # Configure load job
    job_config = LoadJobConfig(
        source_format=SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=(
            WriteDisposition.WRITE_TRUNCATE
            if write_disposition == "WRITE_TRUNCATE"
            else WriteDisposition.WRITE_APPEND
        ),
        autodetect=False,  # Use existing table schema
    )

    try:
        # Execute load job
        load_job = bq_client.load_table_from_file(
            json_buffer,
            table_id,
            job_config=job_config
        )

        # Wait for completion
        load_job.result()

        if load_job.errors:
            logger.error(
                "Batch load completed with errors",
                extra={"table": table_id, "errors": load_job.errors[:3]}
            )
            return InsertResult(
                success=False,
                rows_inserted=0,
                rows_failed=len(rows),
                dlq_records=0,
                error=str(load_job.errors)
            )

        logger.info(
            "Batch load successful",
            extra={
                "table": table_id,
                "rows_loaded": len(rows),
                "bytes_processed": load_job.output_bytes
            }
        )

        return InsertResult(
            success=True,
            rows_inserted=len(rows),
            rows_failed=0,
            dlq_records=0
        )

    except Exception as e:
        safe_error_log(logger, "Batch load failed", e, table=table_id, row_count=len(rows))
        return InsertResult(
            success=False,
            rows_inserted=0,
            rows_failed=len(rows),
            dlq_records=0,
            error=str(e)
        )


# ============================================
# Parameterized SQL Queries
# ============================================

def build_parameterized_query(
    query_template: str,
    variables: Dict[str, Any]
) -> Tuple[str, List[bigquery.ScalarQueryParameter]]:
    """
    Convert a query template with {variable} placeholders to parameterized query.

    SECURITY: Prevents SQL injection by using BigQuery parameters instead of
    string interpolation.

    Args:
        query_template: SQL query with {variable} placeholders
        variables: Dictionary of variable names to values

    Returns:
        Tuple of (parameterized_query, list_of_parameters)

    Example:
        query = "SELECT * FROM table WHERE org_slug = {org_slug} AND date = {date}"
        variables = {"org_slug": "acme", "date": "2024-01-01"}

        Returns:
        ("SELECT * FROM table WHERE org_slug = @org_slug AND date = @date",
         [ScalarQueryParameter("org_slug", "STRING", "acme"),
          ScalarQueryParameter("date", "STRING", "2024-01-01")])
    """
    import re

    # Find all {variable} placeholders
    placeholders = re.findall(r'\{(\w+)\}', query_template)

    # Build parameters list and replace placeholders with @param syntax
    parameters = []
    parameterized_query = query_template

    for placeholder in set(placeholders):  # Use set to avoid duplicates
        if placeholder not in variables:
            raise ValueError(f"Missing variable for placeholder: {{{placeholder}}}")

        value = variables[placeholder]

        # Determine BigQuery type
        if isinstance(value, bool):
            param_type = "BOOL"
        elif isinstance(value, int):
            param_type = "INT64"
        elif isinstance(value, float):
            param_type = "FLOAT64"
        elif isinstance(value, (datetime, date)):
            param_type = "DATE" if isinstance(value, date) and not isinstance(value, datetime) else "TIMESTAMP"
            value = value.isoformat() if isinstance(value, (datetime, date)) else value
        else:
            param_type = "STRING"
            value = str(value)

        parameters.append(
            bigquery.ScalarQueryParameter(placeholder, param_type, value)
        )

        # Replace {placeholder} with @placeholder
        parameterized_query = parameterized_query.replace(
            f"{{{placeholder}}}",
            f"@{placeholder}"
        )

    return parameterized_query, parameters


async def execute_parameterized_query(
    bq_client: bigquery.Client,
    query_template: str,
    variables: Dict[str, Any],
    timeout: int = 300
) -> List[Dict[str, Any]]:
    """
    Execute a parameterized query safely.

    SECURITY: Uses BigQuery parameters to prevent SQL injection.

    Args:
        bq_client: BigQuery client
        query_template: SQL query with {variable} placeholders
        variables: Dictionary of variable names to values
        timeout: Query timeout in seconds

    Returns:
        List of result rows as dictionaries
    """
    parameterized_query, parameters = build_parameterized_query(query_template, variables)

    job_config = bigquery.QueryJobConfig(query_parameters=parameters)

    logger.debug(
        "Executing parameterized query",
        extra={"query_preview": parameterized_query[:100], "param_count": len(parameters)}
    )

    query_job = bq_client.query(parameterized_query, job_config=job_config)
    results = query_job.result(timeout=timeout)

    return [dict(row) for row in results]
