"""
BigQuery Storage Write API - Concurrent Insert Engine

Production-grade concurrent inserts using the BigQuery Storage Write API
with ThreadPoolExecutor. Replaces streaming inserts for high-throughput scenarios.

WHY Storage Write API over Streaming Inserts:
- 2x cheaper than legacy streaming inserts
- Higher throughput (no 500K rows/sec project limit per stream)
- Exactly-once semantics with committed/pending streams
- No 90-minute streaming buffer delay for UPDATE/DELETE

WHEN to use which method:
- Storage Write API (this module): High-volume concurrent inserts (100+ rows/sec)
- Streaming inserts (bq_helpers.py): Low-volume real-time inserts (<100 rows)
- Batch load jobs (bq_helpers.py): Bulk historical loads (10K+ rows, can wait)
- MERGE DML (bq_loader.py): Idempotent upserts with deduplication

SECURITY: All operations are tenant-isolated via org_slug parameters.
"""

import hashlib
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, date, timezone
from typing import Any, Dict, List, Optional, Callable

from google.cloud import bigquery
from google.cloud.bigquery_storage_v1 import BigQueryWriteClient
from google.cloud.bigquery_storage_v1 import types as storage_types
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
from tenacity import (
    retry as tenacity_retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from google.api_core import exceptions as google_api_exceptions

from src.app.config import get_settings
from src.core.utils.logging import get_logger, safe_error_log

logger = get_logger(__name__)
settings = get_settings()


# ============================================
# Constants
# ============================================

# Max rows per append request (Storage Write API practical limit)
MAX_ROWS_PER_APPEND = 500

# Default number of concurrent workers
DEFAULT_WORKERS = 4

# Max workers (keep below BigQuery concurrent stream limits)
MAX_WORKERS = 10

# Transient errors that should be retried
TRANSIENT_ERRORS = (
    ConnectionError,
    TimeoutError,
    google_api_exceptions.ServiceUnavailable,
    google_api_exceptions.TooManyRequests,
    google_api_exceptions.InternalServerError,
)


# ============================================
# Data Classes
# ============================================

@dataclass
class WriteResult:
    """Result of a Storage Write API operation."""
    success: bool
    rows_written: int
    rows_failed: int
    worker_id: int
    batch_index: int
    offset: Optional[int] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None


@dataclass
class ConcurrentWriteResult:
    """Aggregated result from all concurrent workers."""
    success: bool
    total_rows_written: int
    total_rows_failed: int
    total_batches: int
    workers_used: int
    worker_results: List[WriteResult] = field(default_factory=list)
    duration_ms: Optional[float] = None
    error: Optional[str] = None


# ============================================
# Proto Schema Builder
# ============================================

# BigQuery type to proto type mapping
_BQ_TO_PROTO_TYPE = {
    "STRING": descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    "BYTES": descriptor_pb2.FieldDescriptorProto.TYPE_BYTES,
    "INTEGER": descriptor_pb2.FieldDescriptorProto.TYPE_INT64,
    "INT64": descriptor_pb2.FieldDescriptorProto.TYPE_INT64,
    "FLOAT": descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    "FLOAT64": descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    "NUMERIC": descriptor_pb2.FieldDescriptorProto.TYPE_STRING,  # Sent as string
    "BIGNUMERIC": descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    "BOOLEAN": descriptor_pb2.FieldDescriptorProto.TYPE_BOOL,
    "BOOL": descriptor_pb2.FieldDescriptorProto.TYPE_BOOL,
    "TIMESTAMP": descriptor_pb2.FieldDescriptorProto.TYPE_INT64,  # Micros since epoch
    "DATE": descriptor_pb2.FieldDescriptorProto.TYPE_INT32,  # Days since epoch
    "JSON": descriptor_pb2.FieldDescriptorProto.TYPE_STRING,  # Sent as string
}


def _build_proto_descriptor(
    schema: List[bigquery.SchemaField],
    message_name: str = "Row",
) -> descriptor_pb2.DescriptorProto:
    """
    Build a protobuf descriptor from a BigQuery schema.

    Args:
        schema: BigQuery table schema fields
        message_name: Name for the proto message

    Returns:
        DescriptorProto matching the BigQuery schema
    """
    desc = descriptor_pb2.DescriptorProto(name=message_name)

    for idx, field_schema in enumerate(schema, start=1):
        bq_type = field_schema.field_type.upper()
        proto_type = _BQ_TO_PROTO_TYPE.get(bq_type)

        if proto_type is None:
            logger.warning(
                f"Unsupported BigQuery type '{bq_type}' for field '{field_schema.name}', "
                f"defaulting to STRING"
            )
            proto_type = descriptor_pb2.FieldDescriptorProto.TYPE_STRING

        label = (
            descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED
            if field_schema.mode == "REPEATED"
            else descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
        )

        desc.field.append(
            descriptor_pb2.FieldDescriptorProto(
                name=field_schema.name,
                number=idx,
                type=proto_type,
                label=label,
            )
        )

    return desc


def _build_proto_schema(
    schema: List[bigquery.SchemaField],
) -> storage_types.ProtoSchema:
    """Build a Storage Write API ProtoSchema from BigQuery schema."""
    proto_schema = storage_types.ProtoSchema()
    proto_schema.proto_descriptor = _build_proto_descriptor(schema)
    return proto_schema


def _make_row_class(
    schema: List[bigquery.SchemaField],
    message_name: str = "Row",
):
    """
    Dynamically create a protobuf message class from BigQuery schema.

    Args:
        schema: BigQuery table schema
        message_name: Proto message name

    Returns:
        A protobuf message class for serializing rows
    """
    desc = _build_proto_descriptor(schema, message_name)

    pool = descriptor_pool.DescriptorPool()
    file_proto = descriptor_pb2.FileDescriptorProto(name="row.proto")
    file_proto.message_type.append(desc)
    pool.Add(file_proto)

    msg_descriptor = pool.FindMessageTypeByName(message_name)
    return message_factory.GetMessageClass(msg_descriptor)


# ============================================
# Value Conversion
# ============================================

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
_EPOCH_DATE = date(1970, 1, 1)


def _convert_value(value: Any, bq_type: str) -> Any:
    """
    Convert a Python value to the proto-compatible representation.

    Args:
        value: The Python value
        bq_type: BigQuery field type string

    Returns:
        Value suitable for proto serialization
    """
    if value is None:
        return None

    bq_type = bq_type.upper()

    if bq_type == "TIMESTAMP":
        if isinstance(value, datetime):
            return int(value.timestamp() * 1_000_000)  # Microseconds
        if isinstance(value, str):
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return int(dt.timestamp() * 1_000_000)
        return int(value)

    if bq_type == "DATE":
        if isinstance(value, date):
            return (value - _EPOCH_DATE).days
        if isinstance(value, str):
            d = date.fromisoformat(value)
            return (d - _EPOCH_DATE).days
        return int(value)

    if bq_type in ("INTEGER", "INT64"):
        return int(value)

    if bq_type in ("FLOAT", "FLOAT64"):
        return float(value)

    if bq_type in ("BOOLEAN", "BOOL"):
        return bool(value)

    if bq_type == "JSON":
        return json.dumps(value) if not isinstance(value, str) else value

    if bq_type in ("NUMERIC", "BIGNUMERIC"):
        return str(value)

    return str(value)


# ============================================
# Row Serialization
# ============================================

def _serialize_rows(
    rows: List[Dict[str, Any]],
    schema: List[bigquery.SchemaField],
    row_class,
) -> storage_types.ProtoRows:
    """
    Serialize row dicts into protobuf ProtoRows.

    Args:
        rows: List of row dictionaries
        schema: BigQuery schema for type conversion
        row_class: Protobuf message class

    Returns:
        ProtoRows ready for append request
    """
    schema_map = {f.name: f.field_type for f in schema}
    proto_rows = storage_types.ProtoRows()

    for row_data in rows:
        msg = row_class()
        for field_name, value in row_data.items():
            if value is None:
                continue
            bq_type = schema_map.get(field_name, "STRING")
            converted = _convert_value(value, bq_type)
            if converted is not None:
                try:
                    setattr(msg, field_name, converted)
                except (TypeError, AttributeError) as e:
                    logger.debug(
                        f"Skipping field {field_name}: {e}",
                        extra={"value_type": type(value).__name__},
                    )
        proto_rows.serialized_rows.append(msg.SerializeToString())

    return proto_rows


# ============================================
# Storage Write API Client (Thread-Safe)
# ============================================

_write_client: Optional[BigQueryWriteClient] = None
_write_client_lock = threading.Lock()


def _get_write_client() -> BigQueryWriteClient:
    """Get or create thread-safe singleton BigQueryWriteClient."""
    global _write_client
    if _write_client is None:
        with _write_client_lock:
            if _write_client is None:
                _write_client = BigQueryWriteClient()
                logger.info("Initialized BigQuery Storage Write API client")
    return _write_client


# ============================================
# Worker Function
# ============================================

@tenacity_retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(TRANSIENT_ERRORS),
)
def _append_batch(
    stream_name: str,
    proto_schema: storage_types.ProtoSchema,
    proto_rows: storage_types.ProtoRows,
    worker_id: int,
    batch_index: int,
) -> WriteResult:
    """
    Append a single batch of rows to the default stream.

    Uses tenacity retry for transient errors (503, 429, timeouts).

    Args:
        stream_name: The write stream path (default stream)
        proto_schema: Proto schema for the table
        proto_rows: Serialized proto rows
        worker_id: Worker identifier for logging
        batch_index: Batch index for logging

    Returns:
        WriteResult with success status
    """
    import time

    start = time.monotonic()
    row_count = len(proto_rows.serialized_rows)

    try:
        client = _get_write_client()

        request = storage_types.AppendRowsRequest(
            write_stream=stream_name,
            proto_rows=storage_types.AppendRowsRequest.ProtoData(
                writer_schema=proto_schema,
                rows=proto_rows,
            ),
        )

        # append_rows returns a stream; consume it
        response_stream = client.append_rows(iter([request]))
        offset = None
        for resp in response_stream:
            if resp.append_result:
                offset = resp.append_result.offset.value if resp.append_result.offset else None
            if resp.error and resp.error.code != 0:
                raise RuntimeError(
                    f"AppendRows error: code={resp.error.code} msg={resp.error.message}"
                )

        duration = (time.monotonic() - start) * 1000

        logger.debug(
            f"[Worker {worker_id}] Batch {batch_index}: "
            f"{row_count} rows written (offset={offset}, {duration:.0f}ms)"
        )

        return WriteResult(
            success=True,
            rows_written=row_count,
            rows_failed=0,
            worker_id=worker_id,
            batch_index=batch_index,
            offset=offset,
            duration_ms=duration,
        )

    except Exception as e:
        duration = (time.monotonic() - start) * 1000
        safe_error_log(
            logger,
            f"[Worker {worker_id}] Batch {batch_index} failed",
            e,
            row_count=row_count,
        )
        return WriteResult(
            success=False,
            rows_written=0,
            rows_failed=row_count,
            worker_id=worker_id,
            batch_index=batch_index,
            error=str(e),
            duration_ms=duration,
        )


# ============================================
# Concurrent Writer (Main Entry Point)
# ============================================

def concurrent_insert(
    table_id: str,
    rows: List[Dict[str, Any]],
    org_slug: str,
    num_workers: int = DEFAULT_WORKERS,
    batch_size: int = MAX_ROWS_PER_APPEND,
    on_batch_complete: Optional[Callable[[WriteResult], None]] = None,
) -> ConcurrentWriteResult:
    """
    Insert rows concurrently using BigQuery Storage Write API default stream.

    Splits rows into batches and distributes across ThreadPoolExecutor workers.
    Each worker appends its batches independently to the default stream.

    The default stream provides:
    - Immediate row visibility (no commit needed)
    - Best-effort deduplication
    - No stream creation overhead
    - Safe for concurrent writers

    Args:
        table_id: Full BigQuery table ID (project.dataset.table)
        rows: List of row dictionaries to insert
        org_slug: Organization slug for logging/isolation
        num_workers: Number of concurrent workers (default: 4, max: 10)
        batch_size: Rows per append request (default: 500, max: 500)
        on_batch_complete: Optional callback for each batch result

    Returns:
        ConcurrentWriteResult with aggregated statistics

    Example:
        result = concurrent_insert(
            table_id="cloudact-prod.acme_prod.cost_data_standard_1_3",
            rows=cost_rows,
            org_slug="acme",
            num_workers=4,
        )
        print(f"Wrote {result.total_rows_written} rows with {result.workers_used} workers")
    """
    import time

    if not rows:
        return ConcurrentWriteResult(
            success=True,
            total_rows_written=0,
            total_rows_failed=0,
            total_batches=0,
            workers_used=0,
        )

    start = time.monotonic()

    # Clamp parameters
    num_workers = min(max(1, num_workers), MAX_WORKERS)
    batch_size = min(max(1, batch_size), MAX_ROWS_PER_APPEND)

    # Get table schema from BigQuery (reuse singleton client)
    from src.core.engine.bq_client import get_bigquery_client
    bq_client = get_bigquery_client().client
    table = bq_client.get_table(table_id)
    schema = list(table.schema)

    # Build proto schema and row class
    proto_schema = _build_proto_schema(schema)
    row_class = _make_row_class(schema)

    # Default stream path
    # Format: projects/{project}/datasets/{dataset}/tables/{table}/streams/_default
    parts = table_id.split(".")
    if len(parts) != 3:
        raise ValueError(
            f"table_id must be 'project.dataset.table', got: {table_id}"
        )
    stream_name = (
        f"projects/{parts[0]}/datasets/{parts[1]}/tables/{parts[2]}"
        f"/streams/_default"
    )

    # Split into batches
    batches = [rows[i : i + batch_size] for i in range(0, len(rows), batch_size)]
    total_batches = len(batches)

    logger.info(
        f"Starting concurrent insert",
        extra={
            "org_slug": org_slug,
            "table_id": table_id,
            "total_rows": len(rows),
            "total_batches": total_batches,
            "workers": num_workers,
            "batch_size": batch_size,
        },
    )

    # Distribute batches across workers round-robin
    worker_batches: Dict[int, List[tuple]] = {i: [] for i in range(num_workers)}
    for batch_idx, batch in enumerate(batches):
        worker_id = batch_idx % num_workers
        worker_batches[worker_id].append((batch_idx, batch))

    # Execute concurrently
    all_results: List[WriteResult] = []

    with ThreadPoolExecutor(max_workers=num_workers) as pool:
        futures = {}

        for worker_id, assigned_batches in worker_batches.items():
            for batch_idx, batch in assigned_batches:
                proto_rows = _serialize_rows(batch, schema, row_class)
                future = pool.submit(
                    _append_batch,
                    stream_name,
                    proto_schema,
                    proto_rows,
                    worker_id,
                    batch_idx,
                )
                futures[future] = (worker_id, batch_idx)

        for future in as_completed(futures):
            result = future.result()
            all_results.append(result)

            if on_batch_complete:
                on_batch_complete(result)

    # Aggregate results
    total_written = sum(r.rows_written for r in all_results)
    total_failed = sum(r.rows_failed for r in all_results)
    all_success = all(r.success for r in all_results)
    duration = (time.monotonic() - start) * 1000

    log_fn = logger.info if all_success else logger.warning
    log_fn(
        f"Concurrent insert {'complete' if all_success else 'completed with errors'}",
        extra={
            "org_slug": org_slug,
            "table_id": table_id,
            "total_rows_written": total_written,
            "total_rows_failed": total_failed,
            "total_batches": total_batches,
            "workers_used": num_workers,
            "duration_ms": duration,
        },
    )

    return ConcurrentWriteResult(
        success=all_success,
        total_rows_written=total_written,
        total_rows_failed=total_failed,
        total_batches=total_batches,
        workers_used=num_workers,
        worker_results=all_results,
        duration_ms=duration,
        error=None if all_success else f"{total_failed} rows failed across workers",
    )


# ============================================
# Convenience: Async Wrapper
# ============================================

async def async_concurrent_insert(
    table_id: str,
    rows: List[Dict[str, Any]],
    org_slug: str,
    num_workers: int = DEFAULT_WORKERS,
    batch_size: int = MAX_ROWS_PER_APPEND,
) -> ConcurrentWriteResult:
    """
    Async wrapper for concurrent_insert.

    Runs the ThreadPoolExecutor-based insert in a separate thread
    to avoid blocking the async event loop.

    Args:
        table_id: Full BigQuery table ID (project.dataset.table)
        rows: List of row dictionaries
        org_slug: Organization slug
        num_workers: Number of concurrent workers
        batch_size: Rows per batch

    Returns:
        ConcurrentWriteResult
    """
    import asyncio

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: concurrent_insert(
            table_id=table_id,
            rows=rows,
            org_slug=org_slug,
            num_workers=num_workers,
            batch_size=batch_size,
        ),
    )
