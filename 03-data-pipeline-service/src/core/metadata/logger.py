"""
Enterprise Metadata Logger
High-performance async batch logging for pipeline execution metadata.

Features:
- Async batch processing with configurable buffer and flush intervals
- Retry logic with exponential backoff using tenacity
- Circuit breaker pattern to prevent cascading failures
- Idempotency via insertId to prevent duplicate logs
- Graceful degradation if logging fails
- Background task for periodic flushing
- Non-blocking async writes

Usage Example:
    ```python
    import asyncio
    from datetime import datetime
    from google.cloud import bigquery
    from src.core.metadata.logger import (
        create_metadata_logger,
        generate_logging_id,
        PipelineStatus,
        StepStatus
    )

    async def main():
        # Initialize BigQuery client
        bq_client = bigquery.Client()
        org_slug = "acme_corp"

        # Create logger (automatically starts background flush worker)
        logger = await create_metadata_logger(bq_client, org_slug)

        try:
            # Generate unique IDs
            pipeline_logging_id = generate_logging_id()
            step_logging_id = generate_logging_id()

            # Log pipeline start
            pipeline_start = datetime.utcnow()
            await logger.log_pipeline_start(
                pipeline_logging_id=pipeline_logging_id,
                pipeline_id="data_ingestion_v1",
                trigger_type="api",
                trigger_by="user@example.com",
                parameters={"source": "salesforce", "mode": "incremental"}
            )

            # Log step start
            step_start = datetime.utcnow()
            await logger.log_step_start(
                step_logging_id=step_logging_id,
                pipeline_logging_id=pipeline_logging_id,
                step_name="extract_contacts",
                step_type="api_extract",
                step_index=0,
                metadata={"endpoint": "/api/contacts"}
            )

            # ... perform work ...

            # Log step end
            await logger.log_step_end(
                step_logging_id=step_logging_id,
                pipeline_logging_id=pipeline_logging_id,
                step_name="extract_contacts",
                step_type="api_extract",
                step_index=0,
                status=StepStatus.COMPLETED.value,
                start_time=step_start,
                rows_processed=1000,
                metadata={"records_fetched": 1000}
            )

            # Log pipeline end
            await logger.log_pipeline_end(
                pipeline_logging_id=pipeline_logging_id,
                pipeline_id="data_ingestion_v1",
                status=PipelineStatus.COMPLETED.value,
                start_time=pipeline_start,
                trigger_type="api",
                trigger_by="user@example.com",
                parameters={"source": "salesforce", "mode": "incremental"}
            )

        finally:
            # Stop logger and flush remaining logs
            await logger.stop()

    asyncio.run(main())
    ```

Configuration (in .env or environment variables):
    METADATA_LOG_BATCH_SIZE=100          # Number of logs to batch before flush
    METADATA_LOG_FLUSH_INTERVAL_SECONDS=5  # Seconds between automatic flushes
    METADATA_LOG_MAX_RETRIES=3           # Max retry attempts for failed writes
    METADATA_LOG_WORKERS=5               # Number of background workers for concurrent flushing
    METADATA_LOG_QUEUE_SIZE=1000         # Maximum queue size (backpressure when full)
"""

import asyncio
import json
import uuid
import socket
import subprocess
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum

from google.cloud import bigquery
from tenacity import (
    retry as tenacity_retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

from src.app.config import settings
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


def _serialize_datetime_values(obj: Any) -> Any:
    """
    Recursively convert datetime objects to ISO format strings for JSON serialization.

    Args:
        obj: Object to serialize (dict, list, datetime, or other types)

    Returns:
        Serialized object with all datetime values converted to ISO format strings
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: _serialize_datetime_values(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_serialize_datetime_values(item) for item in obj]
    else:
        return obj


class PipelineStatus(str, Enum):
    """Pipeline execution status."""
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class StepStatus(str, Enum):
    """Step execution status."""
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class CircuitBreaker:
    """
    Circuit breaker to prevent cascading failures.
    Opens circuit after N consecutive failures, preventing further writes.
    """

    def __init__(self, failure_threshold: int = 5, timeout_seconds: int = 60):
        """
        Initialize circuit breaker.

        Args:
            failure_threshold: Number of consecutive failures before opening circuit
            timeout_seconds: Seconds to wait before attempting to close circuit
        """
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.is_open = False

    def record_success(self):
        """Record a successful operation."""
        self.failure_count = 0
        self.is_open = False
        self.last_failure_time = None

    def record_failure(self):
        """Record a failed operation."""
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()

        if self.failure_count >= self.failure_threshold:
            self.is_open = True
            logger.error(
                f"Circuit breaker opened after {self.failure_count} consecutive failures",
                extra={"failure_threshold": self.failure_threshold}
            )

    def can_execute(self) -> bool:
        """
        Check if operation can be executed.

        Returns:
            True if circuit is closed or timeout has elapsed
        """
        if not self.is_open:
            return True

        # Check if timeout has elapsed
        if self.last_failure_time:
            elapsed = (datetime.utcnow() - self.last_failure_time).total_seconds()
            if elapsed >= self.timeout_seconds:
                logger.info(
                    "Circuit breaker attempting to close after timeout",
                    extra={"elapsed_seconds": elapsed}
                )
                self.is_open = False
                self.failure_count = 0
                return True

        return False


class MetadataLogger:
    """
    Enterprise metadata logger with async batch processing and high concurrency support.

    Optimized for 100+ parallel pipelines with:
    - Thread-safe asyncio.Queue for buffering (replaces deque + lock)
    - Multiple background workers for parallel flushing
    - Bounded queue with backpressure handling
    - Circuit breaker pattern for fault tolerance
    - JSON serialization of dict fields (parameters, metadata)
    """

    def __init__(self, bq_client: bigquery.Client, org_slug: str):
        """
        Initialize metadata logger.

        Args:
            bq_client: BigQuery client instance
            org_slug: Organization identifier (slug)
        """
        self.client = bq_client
        self.org_slug = org_slug
        self.project_id = settings.gcp_project_id

        # Use CENTRAL organizations dataset for ALL metadata (not per-org)
        self.metadata_dataset = "organizations"

        # Batch configuration from settings
        self.batch_size = settings.metadata_log_batch_size
        self.flush_interval = settings.metadata_log_flush_interval_seconds
        self.max_retries = settings.metadata_log_max_retries
        self.num_workers = settings.metadata_log_workers
        self.queue_size = settings.metadata_log_queue_size

        # Thread-safe bounded queues for batch processing (replaces deque + lock)
        self._pipeline_queue: asyncio.Queue = asyncio.Queue(maxsize=self.queue_size)
        self._step_queue: asyncio.Queue = asyncio.Queue(maxsize=self.queue_size)

        # Circuit breaker
        self._circuit_breaker = CircuitBreaker(failure_threshold=5, timeout_seconds=60)

        # Background worker tasks
        self._worker_tasks: List[asyncio.Task] = []
        self._running = False

        # Get worker instance and config version
        self.worker_instance = self._get_worker_instance()
        self.config_version = self._get_config_version()

        logger.info(
            "Initialized MetadataLogger",
            extra={
                "org_slug": org_slug,
                "batch_size": self.batch_size,
                "flush_interval": self.flush_interval,
                "num_workers": self.num_workers,
                "queue_size": self.queue_size
            }
        )

    def _get_worker_instance(self) -> str:
        """
        Get worker instance identifier.

        Returns:
            Hostname or Cloud Run instance ID
        """
        try:
            # Try to get Cloud Run instance ID from environment
            import os
            instance_id = os.environ.get('K_REVISION', None)
            if instance_id:
                return instance_id

            # Fallback to hostname
            return socket.gethostname()
        except Exception:
            return "unknown"

    def _get_config_version(self) -> str:
        """
        Get configuration version (git SHA).

        Returns:
            Git commit SHA or 'unknown'
        """
        try:
            result = subprocess.run(
                ['git', 'rev-parse', '--short', 'HEAD'],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass
        return "unknown"

    async def start(self):
        """Start background flush workers (multiple workers for high concurrency)."""
        if self._running:
            logger.warning("MetadataLogger already running")
            return

        self._running = True

        # Create multiple background workers for parallel processing
        for i in range(self.num_workers):
            task = asyncio.create_task(self._background_flush_worker(worker_id=i))
            self._worker_tasks.append(task)

        logger.info(
            f"Started {self.num_workers} background flush workers",
            extra={"num_workers": self.num_workers}
        )

    async def stop(self):
        """Stop background flush workers and flush remaining logs."""
        if not self._running:
            return

        self._running = False

        # Cancel all background worker tasks
        for task in self._worker_tasks:
            task.cancel()

        # Wait for all workers to finish
        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)

        self._worker_tasks.clear()

        # Final flush of remaining items in queues
        await self.flush()
        logger.info("Stopped MetadataLogger and flushed remaining logs")

    async def _background_flush_worker(self, worker_id: int):
        """
        Background worker that periodically flushes buffered logs.
        Multiple workers run concurrently for high-throughput processing.

        Args:
            worker_id: Unique identifier for this worker
        """
        logger.info(
            f"Background flush worker {worker_id} started",
            extra={"worker_id": worker_id}
        )

        try:
            while self._running:
                await asyncio.sleep(self.flush_interval)
                # Wrap flush with timeout to prevent hanging
                try:
                    await asyncio.wait_for(self.flush(), timeout=30)
                except asyncio.TimeoutError:
                    logger.error(
                        f"Flush operation timed out after 30s in worker {worker_id}",
                        extra={"worker_id": worker_id}
                    )

        except asyncio.CancelledError:
            logger.info(
                f"Background flush worker {worker_id} cancelled",
                extra={"worker_id": worker_id}
            )
        except Exception as e:
            logger.error(
                f"Background flush worker {worker_id} error: {e}",
                extra={"worker_id": worker_id},
                exc_info=True
            )

    async def log_pipeline_start(
        self,
        pipeline_logging_id: str,
        pipeline_id: str,
        trigger_type: str,
        trigger_by: str,
        parameters: Optional[Dict[str, Any]] = None,
        org_api_key_id: Optional[str] = None,
        user_id: Optional[str] = None
    ):
        """
        Log pipeline execution start (non-blocking).

        Args:
            pipeline_logging_id: Unique logging ID for this run
            pipeline_id: Pipeline identifier
            trigger_type: How pipeline was triggered (manual, scheduled, api)
            trigger_by: User or system that triggered the pipeline
            parameters: Pipeline parameters (kept as dict for BigQuery JSON type)
            org_api_key_id: API key ID used for authentication (for audit trail)
            user_id: User ID who triggered the pipeline
        """
        try:
            # Serialize datetime values in parameters dict then convert to JSON string
            # BigQuery insert_rows_json() requires JSON type fields to be JSON strings, not dicts
            parameters_serialized = _serialize_datetime_values(parameters) if parameters else None
            parameters_json_str = json.dumps(parameters_serialized) if parameters_serialized is not None else None

            log_entry = {
                "insertId": f"{pipeline_logging_id}_start",  # Idempotency
                "json": {
                    "pipeline_logging_id": pipeline_logging_id,
                    "pipeline_id": pipeline_id,
                    "org_slug": self.org_slug,
                    "org_api_key_id": org_api_key_id,
                    "user_id": user_id,
                    "status": PipelineStatus.RUNNING.value,
                    "trigger_type": trigger_type,
                    "trigger_by": trigger_by,
                    "start_time": datetime.utcnow().isoformat(),
                    "end_time": None,
                    "duration_ms": None,
                    "config_version": self.config_version,
                    "worker_instance": self.worker_instance,
                    "error_message": None,
                    "parameters": parameters_json_str
                }
            }

            # Queue put with 5s timeout for backpressure handling
            # CRITICAL: Use wait_for to fail pipeline if queue is full
            # This prevents silent log drops and ensures pipeline failures are visible
            try:
                await asyncio.wait_for(
                    self._pipeline_queue.put(log_entry),
                    timeout=5.0
                )

                logger.debug(
                    f"Queued pipeline start log",
                    extra={
                        "pipeline_logging_id": pipeline_logging_id,
                        "queue_size": self._pipeline_queue.qsize()
                    }
                )
            except asyncio.TimeoutError:
                # Queue is full after 5s timeout - FAIL the pipeline
                error_msg = f"Pipeline log queue full ({self.queue_size}) - cannot queue log entry after 5s timeout"
                logger.error(
                    error_msg,
                    extra={
                        "pipeline_logging_id": pipeline_logging_id,
                        "queue_size": self.queue_size
                    }
                )
                raise ValueError(error_msg)

        except Exception as e:
            logger.error(
                f"Error queuing pipeline start log: {e}",
                extra={"pipeline_logging_id": pipeline_logging_id},
                exc_info=True
            )

    async def log_pipeline_end(
        self,
        pipeline_logging_id: str,
        pipeline_id: str,
        status: str,
        start_time: datetime,
        trigger_type: str,
        trigger_by: str,
        error_message: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None
    ):
        """
        Log pipeline execution end using UPDATE to avoid duplicates.

        IMPORTANT: This method UPDATEs the existing row created by the API endpoint
        instead of INSERTing a new row to prevent duplicate records.

        Args:
            pipeline_logging_id: Unique logging ID for this run
            pipeline_id: Pipeline identifier
            status: Final status (COMPLETED, FAILED, CANCELLED)
            start_time: Pipeline start time
            trigger_type: How pipeline was triggered (manual, scheduled, api)
            trigger_by: User or system that triggered the pipeline
            error_message: Error message if failed
            parameters: Pipeline parameters (kept as dict for BigQuery JSON type)
        """
        try:
            end_time = datetime.utcnow()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)

            # Serialize datetime values in parameters dict then convert to JSON string
            parameters_serialized = _serialize_datetime_values(parameters) if parameters else None
            parameters_json_str = json.dumps(parameters_serialized) if parameters_serialized is not None else None

            # Use UPDATE query to update existing row instead of INSERT
            # NOTE: org_meta_pipeline_runs is in CENTRAL organizations dataset, not per-org dataset
            table_id = f"{self.project_id}.organizations.org_meta_pipeline_runs"

            update_query = f"""
            UPDATE `{table_id}`
            SET
                status = @status,
                end_time = @end_time,
                duration_ms = @duration_ms,
                error_message = @error_message,
                parameters = PARSE_JSON(@parameters)
            WHERE
                pipeline_logging_id = @pipeline_logging_id
                AND org_slug = @org_slug
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("status", "STRING", status),
                    bigquery.ScalarQueryParameter("end_time", "TIMESTAMP", end_time),
                    bigquery.ScalarQueryParameter("duration_ms", "INT64", duration_ms),
                    bigquery.ScalarQueryParameter("error_message", "STRING", error_message),
                    bigquery.ScalarQueryParameter("parameters", "STRING", parameters_json_str),
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug)
                ]
            )

            # Execute UPDATE in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            query_job = await loop.run_in_executor(
                None,
                lambda: self.client.query(update_query, job_config=job_config)
            )

            # Wait for query to complete
            await loop.run_in_executor(None, query_job.result)

            # CRITICAL FIX: Check if UPDATE actually affected any rows
            rows_updated = query_job.num_dml_affected_rows or 0

            if rows_updated == 0:
                # UPDATE failed - row doesn't exist, try INSERT as fallback
                logger.warning(
                    f"UPDATE affected 0 rows - pipeline row may not exist, attempting INSERT fallback",
                    extra={
                        "pipeline_logging_id": pipeline_logging_id,
                        "status": status,
                        "org_slug": self.org_slug
                    }
                )

                # Fallback: INSERT a new row with all the data
                insert_query = f"""
                INSERT INTO `{table_id}`
                (pipeline_logging_id, pipeline_id, org_slug, status, trigger_type, trigger_by,
                 start_time, end_time, duration_ms, error_message, parameters, run_date)
                VALUES
                (@pipeline_logging_id, @pipeline_id, @org_slug, @status, @trigger_type, @trigger_by,
                 @start_time, @end_time, @duration_ms, @error_message, PARSE_JSON(@parameters), CURRENT_DATE())
                """

                insert_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                        bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
                        bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                        bigquery.ScalarQueryParameter("status", "STRING", status),
                        bigquery.ScalarQueryParameter("trigger_type", "STRING", trigger_type),
                        bigquery.ScalarQueryParameter("trigger_by", "STRING", trigger_by),
                        bigquery.ScalarQueryParameter("start_time", "TIMESTAMP", start_time),
                        bigquery.ScalarQueryParameter("end_time", "TIMESTAMP", end_time),
                        bigquery.ScalarQueryParameter("duration_ms", "INT64", duration_ms),
                        bigquery.ScalarQueryParameter("error_message", "STRING", error_message),
                        bigquery.ScalarQueryParameter("parameters", "STRING", parameters_json_str),
                    ]
                )

                insert_job = await loop.run_in_executor(
                    None,
                    lambda: self.client.query(insert_query, job_config=insert_job_config)
                )
                await loop.run_in_executor(None, insert_job.result)

                logger.info(
                    f"INSERT fallback succeeded for pipeline end log",
                    extra={
                        "pipeline_logging_id": pipeline_logging_id,
                        "status": status,
                        "duration_ms": duration_ms
                    }
                )
            else:
                # Log at INFO level for visibility, especially for FAILED status
                log_level = logger.warning if status == "FAILED" else logger.info
                log_level(
                    f"Pipeline end logged: status={status}",
                    extra={
                        "pipeline_logging_id": pipeline_logging_id,
                        "status": status,
                        "duration_ms": duration_ms,
                        "num_updated_rows": rows_updated,
                        "error_message": error_message[:200] if error_message else None
                    }
                )

        except Exception as e:
            # CRITICAL: Log at ERROR level and include all context for debugging
            logger.error(
                f"CRITICAL: Failed to log pipeline end - status may be incorrect in BigQuery: {e}",
                extra={
                    "pipeline_logging_id": pipeline_logging_id,
                    "pipeline_id": pipeline_id,
                    "status": status,
                    "org_slug": self.org_slug,
                    "error_message": error_message[:200] if error_message else None
                },
                exc_info=True
            )
            # Re-raise so caller knows the logging failed
            raise

    async def log_step_start(
        self,
        step_logging_id: str,
        pipeline_logging_id: str,
        step_name: str,
        step_type: str,
        step_index: int,
        metadata: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None
    ):
        """
        Log step execution start (non-blocking).

        Args:
            step_logging_id: Unique logging ID for this step
            pipeline_logging_id: Parent pipeline logging ID
            step_name: Step name
            step_type: Step type (extract, transform, load)
            step_index: Step index in pipeline
            metadata: Additional step metadata (kept as dict for BigQuery JSON type)
            user_id: User UUID from frontend (X-User-ID header)
        """
        try:
            # Serialize datetime values in metadata dict then convert to JSON string
            # BigQuery insert_rows_json() requires JSON type fields to be JSON strings, not dicts
            metadata_serialized = _serialize_datetime_values(metadata) if metadata else None
            metadata_json_str = json.dumps(metadata_serialized) if metadata_serialized is not None else None

            log_entry = {
                "insertId": f"{step_logging_id}_start",  # Idempotency
                "json": {
                    "step_logging_id": step_logging_id,
                    "org_slug": self.org_slug,
                    "pipeline_logging_id": pipeline_logging_id,
                    "step_name": step_name,
                    "step_type": step_type,
                    "step_index": step_index,
                    "status": StepStatus.RUNNING.value,
                    "start_time": datetime.utcnow().isoformat(),
                    "end_time": None,
                    "duration_ms": None,
                    "rows_processed": None,
                    "error_message": None,
                    "user_id": user_id,
                    "metadata": metadata_json_str
                }
            }

            # Queue put with 5s timeout for backpressure handling
            # CRITICAL: Use wait_for to fail pipeline if queue is full
            # This prevents silent log drops and ensures pipeline failures are visible
            try:
                await asyncio.wait_for(
                    self._step_queue.put(log_entry),
                    timeout=5.0
                )

                logger.debug(
                    f"Queued step start log",
                    extra={
                        "step_logging_id": step_logging_id,
                        "step_name": step_name,
                        "queue_size": self._step_queue.qsize()
                    }
                )
            except asyncio.TimeoutError:
                # Queue is full after 5s timeout - FAIL the pipeline
                error_msg = f"Step log queue full ({self.queue_size}) - cannot queue log entry after 5s timeout"
                logger.error(
                    error_msg,
                    extra={
                        "step_logging_id": step_logging_id,
                        "queue_size": self.queue_size
                    }
                )
                raise ValueError(error_msg)

        except Exception as e:
            logger.error(
                f"Error queuing step start log: {e}",
                extra={"step_logging_id": step_logging_id},
                exc_info=True
            )

    async def log_step_end(
        self,
        step_logging_id: str,
        pipeline_logging_id: str,
        step_name: str,
        step_type: str,
        step_index: int,
        status: str,
        start_time: datetime,
        rows_processed: Optional[int] = None,
        error_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None
    ):
        """
        Log step execution end (non-blocking).

        IMPORTANT: BigQuery requires ALL fields for each row, not just the changed ones.
        This method must include all required fields from the schema.

        Args:
            step_logging_id: Unique logging ID for this step
            pipeline_logging_id: Parent pipeline logging ID
            step_name: Step name
            step_type: Step type (extract, transform, load)
            step_index: Step index in pipeline
            status: Final status (COMPLETED, FAILED, SKIPPED)
            start_time: Step start time
            rows_processed: Number of rows processed
            error_message: Error message if failed
            metadata: Additional step metadata (kept as dict for BigQuery JSON type)
            user_id: User UUID from frontend (X-User-ID header)
        """
        try:
            end_time = datetime.utcnow()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)

            # Serialize datetime values in metadata dict then convert to JSON string
            # BigQuery insert_rows_json() requires JSON type fields to be JSON strings, not dicts
            metadata_serialized = _serialize_datetime_values(metadata) if metadata else None
            metadata_json_str = json.dumps(metadata_serialized) if metadata_serialized is not None else None

            # BigQuery requires ALL fields for each row - include all required fields
            log_entry = {
                "insertId": f"{step_logging_id}_end",  # Idempotency
                "json": {
                    "step_logging_id": step_logging_id,
                    "org_slug": self.org_slug,
                    "pipeline_logging_id": pipeline_logging_id,
                    "step_name": step_name,
                    "step_type": step_type,
                    "step_index": step_index,
                    "status": status,
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat(),
                    "duration_ms": duration_ms,
                    "rows_processed": rows_processed,
                    "error_message": error_message,
                    "user_id": user_id,
                    "metadata": metadata_json_str
                }
            }

            # Queue put with 5s timeout for backpressure handling
            # CRITICAL: Use wait_for to fail pipeline if queue is full
            # This prevents silent log drops and ensures pipeline failures are visible
            try:
                await asyncio.wait_for(
                    self._step_queue.put(log_entry),
                    timeout=5.0
                )

                logger.debug(
                    f"Queued step end log",
                    extra={
                        "step_logging_id": step_logging_id,
                        "step_name": step_name,
                        "status": status,
                        "duration_ms": duration_ms,
                        "queue_size": self._step_queue.qsize()
                    }
                )
            except asyncio.TimeoutError:
                # Queue is full after 5s timeout - FAIL the pipeline
                error_msg = f"Step log queue full ({self.queue_size}) - cannot queue log entry after 5s timeout"
                logger.error(
                    error_msg,
                    extra={
                        "step_logging_id": step_logging_id,
                        "queue_size": self.queue_size
                    }
                )
                raise ValueError(error_msg)

        except Exception as e:
            logger.error(
                f"Error queuing step end log: {e}",
                extra={"step_logging_id": step_logging_id},
                exc_info=True
            )

    def get_queue_depths(self) -> Dict[str, int]:
        """
        Get current queue depths for monitoring.

        Returns:
            Dictionary with pipeline_queue_size and step_queue_size
        """
        return {
            "pipeline_queue_size": self._pipeline_queue.qsize(),
            "step_queue_size": self._step_queue.qsize(),
            "pipeline_queue_capacity": self.queue_size,
            "step_queue_capacity": self.queue_size,
            "pipeline_queue_utilization_pct": round(
                (self._pipeline_queue.qsize() / self.queue_size) * 100, 2
            ),
            "step_queue_utilization_pct": round(
                (self._step_queue.qsize() / self.queue_size) * 100, 2
            )
        }

    async def flush(self):
        """
        Force flush all queued logs to BigQuery.
        This method is called periodically by background workers.
        Multiple workers can call this concurrently for parallel processing.
        """
        # Check circuit breaker
        if not self._circuit_breaker.can_execute():
            logger.warning(
                "Circuit breaker open, skipping flush",
                extra={"failure_count": self._circuit_breaker.failure_count}
            )
            return

        # Monitor queue depths for backpressure detection
        queue_depths = self.get_queue_depths()
        if queue_depths["pipeline_queue_utilization_pct"] > 80 or queue_depths["step_queue_utilization_pct"] > 80:
            logger.warning(
                "Queue depth high - potential backpressure",
                extra=queue_depths
            )

        # Collect pipeline logs from queue (non-blocking, batch-sized)
        pipeline_logs = []
        for _ in range(self.batch_size):
            try:
                log_entry = self._pipeline_queue.get_nowait()
                pipeline_logs.append(log_entry)
            except asyncio.QueueEmpty:
                break

        # Collect step logs from queue (non-blocking, batch-sized)
        step_logs = []
        for _ in range(self.batch_size):
            try:
                log_entry = self._step_queue.get_nowait()
                step_logs.append(log_entry)
            except asyncio.QueueEmpty:
                break

        # Flush pipeline logs
        if pipeline_logs:
            try:
                await self._flush_pipeline_logs(pipeline_logs)
                self._circuit_breaker.record_success()
            except Exception as e:
                logger.error(
                    f"CRITICAL: Failed to flush pipeline logs - logs will be lost",
                    extra={"log_count": len(pipeline_logs)},
                    exc_info=True
                )
                self._circuit_breaker.record_failure()
                # REMOVED: Re-queue logic that can cause infinite loops
                # Instead, logs are lost and error is visible in monitoring
                # This prevents memory exhaustion and queue backpressure issues

        # Flush step logs
        if step_logs:
            try:
                await self._flush_step_logs(step_logs)
                self._circuit_breaker.record_success()
            except Exception as e:
                logger.error(
                    f"CRITICAL: Failed to flush step logs - logs will be lost",
                    extra={"log_count": len(step_logs)},
                    exc_info=True
                )
                self._circuit_breaker.record_failure()
                # REMOVED: Re-queue logic that can cause infinite loops
                # Instead, logs are lost and error is visible in monitoring
                # This prevents memory exhaustion and queue backpressure issues

    @tenacity_retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(Exception)
    )
    async def _flush_pipeline_logs(self, logs: List[Dict[str, Any]]):
        """
        Flush pipeline logs to BigQuery with retry logic.

        Args:
            logs: List of pipeline log entries

        Raises:
            Exception: If insert fails after retries
        """
        # NOTE: org_meta_pipeline_runs is in CENTRAL organizations dataset, not per-org dataset
        table_id = f"{self.project_id}.organizations.org_meta_pipeline_runs"

        # Use streaming inserts with insertId for idempotency
        rows_to_insert = [log["json"] for log in logs]

        # Execute in thread pool to avoid blocking async loop
        loop = asyncio.get_event_loop()
        errors = await loop.run_in_executor(
            None,
            lambda: self.client.insert_rows_json(
                table_id,
                rows_to_insert,
                row_ids=[log["insertId"] for log in logs]  # Idempotency
            )
        )

        if errors:
            error_msg = f"Failed to insert pipeline logs: {errors}"
            logger.error(
                error_msg,
                extra={
                    "table_id": table_id,
                    "errors": errors,
                    "log_count": len(logs)
                }
            )
            raise ValueError(error_msg)

        logger.info(
            f"Flushed pipeline logs to BigQuery",
            extra={
                "table_id": table_id,
                "log_count": len(logs)
            }
        )

    @tenacity_retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(Exception)
    )
    async def _flush_step_logs(self, logs: List[Dict[str, Any]]):
        """
        Flush step logs to BigQuery with retry logic.

        Args:
            logs: List of step log entries

        Raises:
            Exception: If insert fails after retries
        """
        # NOTE: org_meta_step_logs is in CENTRAL organizations dataset
        table_id = f"{self.project_id}.organizations.org_meta_step_logs"

        # Use streaming inserts with insertId for idempotency
        rows_to_insert = [log["json"] for log in logs]

        # Execute in thread pool to avoid blocking async loop
        loop = asyncio.get_event_loop()
        errors = await loop.run_in_executor(
            None,
            lambda: self.client.insert_rows_json(
                table_id,
                rows_to_insert,
                row_ids=[log["insertId"] for log in logs]  # Idempotency
            )
        )

        if errors:
            error_msg = f"Failed to insert step logs: {errors}"
            logger.error(
                error_msg,
                extra={
                    "table_id": table_id,
                    "errors": errors,
                    "log_count": len(logs)
                }
            )
            raise ValueError(error_msg)

        logger.info(
            f"Flushed step logs to BigQuery",
            extra={
                "table_id": table_id,
                "log_count": len(logs)
            }
        )


def generate_logging_id() -> str:
    """
    Generate a unique logging ID.

    Returns:
        UUID string
    """
    return str(uuid.uuid4())


async def create_metadata_logger(
    bq_client: bigquery.Client,
    org_slug: str,
    auto_start: bool = True
) -> MetadataLogger:
    """
    Create and optionally start a metadata logger.

    Args:
        bq_client: BigQuery client instance
        org_slug: Organization identifier (slug)
        auto_start: Whether to automatically start background flush worker

    Returns:
        MetadataLogger instance
    """
    logger_instance = MetadataLogger(bq_client, org_slug)

    if auto_start:
        await logger_instance.start()

    return logger_instance
