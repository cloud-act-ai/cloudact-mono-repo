"""
Pipeline State Management System
Comprehensive state tracking for scheduled pipeline execution.

Features:
- Atomic state transitions with validation
- Queue management for pipeline execution
- Schedule calculation from cron expressions
- Retry logic with exponential backoff
- Thread-safe BigQuery operations
- Idempotent operations

State Flow:
SCHEDULED → PENDING → RUNNING → COMPLETED/FAILED
FAILED → PENDING (retry)
"""

import uuid
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from enum import Enum

from google.cloud import bigquery
from google.api_core import exceptions as google_api_exceptions
from croniter import croniter
import pendulum
from tenacity import (
    retry as tenacity_retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

from src.app.config import settings
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


# ============================================
# Enums and Constants
# ============================================

class PipelineState(str, Enum):
    """Valid pipeline execution states."""
    SCHEDULED = "SCHEDULED"  # Pipeline scheduled for future execution
    PENDING = "PENDING"      # Queued and ready to run
    RUNNING = "RUNNING"      # Currently executing
    COMPLETED = "COMPLETED"  # Successfully finished
    FAILED = "FAILED"        # Execution failed


class QueueStatus(str, Enum):
    """Valid queue item statuses."""
    QUEUED = "QUEUED"           # Waiting in queue
    PROCESSING = "PROCESSING"   # Being processed by worker
    COMPLETED = "COMPLETED"     # Successfully processed
    FAILED = "FAILED"           # Processing failed


# Valid state transitions
VALID_TRANSITIONS = {
    PipelineState.SCHEDULED: [PipelineState.PENDING],
    PipelineState.PENDING: [PipelineState.RUNNING, PipelineState.FAILED],
    PipelineState.RUNNING: [PipelineState.COMPLETED, PipelineState.FAILED],
    PipelineState.FAILED: [PipelineState.PENDING, PipelineState.FAILED],  # Allow retry
}


# Retry policy for transient errors
TRANSIENT_RETRY_POLICY = retry_if_exception_type((
    ConnectionError,
    TimeoutError,
    google_api_exceptions.ServiceUnavailable,
    google_api_exceptions.TooManyRequests,
))


# ============================================
# Pipeline State Manager
# ============================================

class PipelineStateManager:
    """
    Manages pipeline execution state transitions with atomic operations.

    This class provides comprehensive state management for scheduled pipeline
    execution, including state transitions, status tracking, and reporting.
    """

    def __init__(self, bq_client: bigquery.Client):
        """
        Initialize pipeline state manager.

        Args:
            bq_client: BigQuery client instance
        """
        self.client = bq_client
        self.project_id = settings.gcp_project_id

    def _get_scheduled_runs_table(self, tenant_id: str) -> str:
        """
        Get fully qualified scheduled runs table name.

        Args:
            tenant_id: Customer/tenant identifier

        Returns:
            Fully qualified table name
        """
        dataset = settings.get_tenant_dataset_name(tenant_id)
        return f"{self.project_id}.{dataset}.x_meta_scheduled_runs"

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def create_scheduled_run(
        self,
        tenant_id: str,
        config_id: str,
        scheduled_time: datetime
    ) -> str:
        """
        Create a new scheduled pipeline run record.

        Args:
            tenant_id: Customer/tenant identifier
            config_id: Pipeline configuration ID
            scheduled_time: When the pipeline should run

        Returns:
            run_id: Unique identifier for this scheduled run
        """
        run_id = str(uuid.uuid4())
        table_id = self._get_scheduled_runs_table(tenant_id)

        row = {
            "run_id": run_id,
            "tenant_id": tenant_id,
            "config_id": config_id,
            "state": PipelineState.SCHEDULED.value,
            "scheduled_time": scheduled_time.isoformat(),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "pipeline_logging_id": None,
            "retry_count": 0,
            "error_message": None,
            "metadata": None
        }

        # Execute in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        errors = await loop.run_in_executor(
            None,
            lambda: self.client.insert_rows_json(
                table_id,
                [row],
                row_ids=[run_id]  # Idempotency
            )
        )

        if errors:
            error_msg = f"Failed to create scheduled run: {errors}"
            logger.error(error_msg, extra={"tenant_id": tenant_id, "config_id": config_id})
            raise ValueError(error_msg)

        logger.info(
            "Created scheduled pipeline run",
            extra={
                "run_id": run_id,
                "tenant_id": tenant_id,
                "config_id": config_id,
                "scheduled_time": scheduled_time.isoformat()
            }
        )

        return run_id

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def transition_state(
        self,
        run_id: str,
        from_state: str,
        to_state: str,
        metadata: Dict = None
    ) -> bool:
        """
        Perform atomic state transition with validation.

        Args:
            run_id: Unique run identifier
            from_state: Expected current state
            to_state: Target state
            metadata: Additional metadata to store with transition

        Returns:
            True if transition successful, False otherwise
        """
        # Validate transition
        if from_state not in VALID_TRANSITIONS:
            raise ValueError(f"Invalid from_state: {from_state}")

        if to_state not in VALID_TRANSITIONS.get(from_state, []):
            raise ValueError(
                f"Invalid state transition: {from_state} → {to_state}. "
                f"Valid transitions: {VALID_TRANSITIONS.get(from_state)}"
            )

        # Build UPDATE query with WHERE clause to ensure atomic transition
        query = f"""
        UPDATE `{self.project_id}.metadata.x_meta_scheduled_runs`
        SET
            state = @to_state,
            updated_at = @updated_at,
            metadata = @metadata
        WHERE
            run_id = @run_id
            AND state = @from_state
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
                bigquery.ScalarQueryParameter("from_state", "STRING", from_state),
                bigquery.ScalarQueryParameter("to_state", "STRING", to_state),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow()),
                bigquery.ScalarQueryParameter("metadata", "JSON", metadata)
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        # Wait for query to complete
        result = await loop.run_in_executor(None, query_job.result)

        # Check if any rows were updated
        num_dml_affected_rows = query_job.num_dml_affected_rows or 0
        success = num_dml_affected_rows > 0

        if success:
            logger.info(
                f"State transition successful: {from_state} → {to_state}",
                extra={"run_id": run_id, "from_state": from_state, "to_state": to_state}
            )
        else:
            logger.warning(
                f"State transition failed: {from_state} → {to_state} (current state may differ)",
                extra={"run_id": run_id, "from_state": from_state, "to_state": to_state}
            )

        return success

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def get_pipelines_by_state(
        self,
        state: str,
        limit: int = 100,
        tenant_id: str = None
    ) -> List[Dict]:
        """
        Get all pipelines in a specific state.

        Args:
            state: Pipeline state to filter by
            limit: Maximum number of results
            tenant_id: Optional customer filter

        Returns:
            List of pipeline run records
        """
        where_clause = "WHERE state = @state"
        params = [bigquery.ScalarQueryParameter("state", "STRING", state)]

        if tenant_id:
            where_clause += " AND tenant_id = @tenant_id"
            params.append(bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id))

        query = f"""
        SELECT *
        FROM `{self.project_id}.metadata.x_meta_scheduled_runs`
        {where_clause}
        ORDER BY scheduled_time ASC
        LIMIT @limit
        """

        params.append(bigquery.ScalarQueryParameter("limit", "INT64", limit))

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        results = await loop.run_in_executor(None, query_job.result)

        return [dict(row) for row in results]

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def get_yet_to_run_pipelines(
        self,
        date: str = None
    ) -> List[Dict]:
        """
        Get pipelines scheduled but not yet run.

        Args:
            date: Optional date filter (YYYY-MM-DD). Defaults to today.

        Returns:
            List of pipeline runs that are due to execute
        """
        if date is None:
            date = datetime.utcnow().strftime("%Y-%m-%d")

        query = f"""
        SELECT *
        FROM `{self.project_id}.metadata.x_meta_scheduled_runs`
        WHERE
            state IN ('SCHEDULED', 'PENDING')
            AND scheduled_time <= CURRENT_TIMESTAMP()
            AND DATE(scheduled_time) = @date
        ORDER BY scheduled_time ASC
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("date", "DATE", date)
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        results = await loop.run_in_executor(None, query_job.result)

        pipelines = [dict(row) for row in results]

        logger.info(
            f"Found {len(pipelines)} pipelines yet to run",
            extra={"date": date, "count": len(pipelines)}
        )

        return pipelines

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def mark_as_running(
        self,
        run_id: str,
        pipeline_logging_id: str
    ) -> bool:
        """
        Update run to RUNNING state with pipeline_logging_id.

        Args:
            run_id: Scheduled run identifier
            pipeline_logging_id: Pipeline execution tracking ID

        Returns:
            True if update successful
        """
        query = f"""
        UPDATE `{self.project_id}.metadata.x_meta_scheduled_runs`
        SET
            state = @state,
            pipeline_logging_id = @pipeline_logging_id,
            updated_at = @updated_at
        WHERE
            run_id = @run_id
            AND state IN ('PENDING', 'SCHEDULED')
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
                bigquery.ScalarQueryParameter("state", "STRING", PipelineState.RUNNING.value),
                bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow())
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        result = await loop.run_in_executor(None, query_job.result)

        success = (query_job.num_dml_affected_rows or 0) > 0

        if success:
            logger.info(
                "Marked pipeline run as RUNNING",
                extra={"run_id": run_id, "pipeline_logging_id": pipeline_logging_id}
            )

        return success

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def mark_as_completed(
        self,
        run_id: str,
        execution_duration_seconds: int
    ) -> bool:
        """
        Mark run as successfully completed.

        Args:
            run_id: Scheduled run identifier
            execution_duration_seconds: How long the pipeline took

        Returns:
            True if update successful
        """
        query = f"""
        UPDATE `{self.project_id}.metadata.x_meta_scheduled_runs`
        SET
            state = @state,
            updated_at = @updated_at,
            metadata = JSON_SET(
                COALESCE(metadata, JSON '{{}}'),
                '$.execution_duration_seconds',
                @duration
            )
        WHERE
            run_id = @run_id
            AND state = 'RUNNING'
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
                bigquery.ScalarQueryParameter("state", "STRING", PipelineState.COMPLETED.value),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow()),
                bigquery.ScalarQueryParameter("duration", "INT64", execution_duration_seconds)
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        result = await loop.run_in_executor(None, query_job.result)

        success = (query_job.num_dml_affected_rows or 0) > 0

        if success:
            logger.info(
                "Marked pipeline run as COMPLETED",
                extra={"run_id": run_id, "duration_seconds": execution_duration_seconds}
            )

        return success

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def mark_as_failed(
        self,
        run_id: str,
        error_message: str,
        should_retry: bool = True
    ) -> bool:
        """
        Mark run as failed, optionally schedule retry.

        Args:
            run_id: Scheduled run identifier
            error_message: Description of the failure
            should_retry: Whether to allow retry (sets state to PENDING if True)

        Returns:
            True if update successful
        """
        new_state = PipelineState.PENDING.value if should_retry else PipelineState.FAILED.value

        query = f"""
        UPDATE `{self.project_id}.metadata.x_meta_scheduled_runs`
        SET
            state = @state,
            error_message = @error_message,
            retry_count = retry_count + 1,
            updated_at = @updated_at
        WHERE
            run_id = @run_id
            AND state = 'RUNNING'
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
                bigquery.ScalarQueryParameter("state", "STRING", new_state),
                bigquery.ScalarQueryParameter("error_message", "STRING", error_message),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow())
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        result = await loop.run_in_executor(None, query_job.result)

        success = (query_job.num_dml_affected_rows or 0) > 0

        if success:
            logger.info(
                f"Marked pipeline run as {new_state}",
                extra={"run_id": run_id, "should_retry": should_retry, "error": error_message}
            )

        return success

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def get_run_status(self, run_id: str) -> Dict:
        """
        Get detailed status of a specific run.

        Args:
            run_id: Scheduled run identifier

        Returns:
            Run details dictionary
        """
        query = f"""
        SELECT *
        FROM `{self.project_id}.metadata.x_meta_scheduled_runs`
        WHERE run_id = @run_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        results = await loop.run_in_executor(None, query_job.result)

        rows = list(results)
        if not rows:
            raise ValueError(f"Run not found: {run_id}")

        return dict(rows[0])

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def get_customer_pipeline_status(
        self,
        tenant_id: str,
        date: str = None
    ) -> Dict:
        """
        Get summary of all pipelines for a customer.

        Args:
            tenant_id: Customer/tenant identifier
            date: Optional date filter (YYYY-MM-DD). Defaults to today.

        Returns:
            Dictionary with pipeline status summary
        """
        if date is None:
            date = datetime.utcnow().strftime("%Y-%m-%d")

        query = f"""
        WITH pipeline_stats AS (
            SELECT
                COUNT(DISTINCT config_id) as total_configured,
                COUNTIF(DATE(scheduled_time) = @date) as scheduled_today,
                COUNTIF(DATE(scheduled_time) = @date AND state = 'COMPLETED') as completed_today,
                COUNTIF(state = 'RUNNING') as running,
                COUNTIF(
                    state IN ('SCHEDULED', 'PENDING')
                    AND scheduled_time <= CURRENT_TIMESTAMP()
                    AND DATE(scheduled_time) = @date
                ) as yet_to_run,
                COUNTIF(DATE(scheduled_time) = @date AND state = 'FAILED') as failed
            FROM `{self.project_id}.metadata.x_meta_scheduled_runs`
            WHERE tenant_id = @tenant_id
        )
        SELECT * FROM pipeline_stats
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                bigquery.ScalarQueryParameter("date", "DATE", date)
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        results = await loop.run_in_executor(None, query_job.result)

        rows = list(results)
        if not rows:
            return {
                "total_configured": 0,
                "scheduled_today": 0,
                "completed_today": 0,
                "running": 0,
                "yet_to_run": 0,
                "failed": 0
            }

        return dict(rows[0])


# ============================================
# Queue Manager
# ============================================

class QueueManager:
    """
    Manages pipeline execution queue with priority support.

    Provides FIFO queue with priority ordering and atomic dequeue operations
    to prevent race conditions in distributed systems.
    """

    def __init__(self, bq_client: bigquery.Client):
        """
        Initialize queue manager.

        Args:
            bq_client: BigQuery client instance
        """
        self.client = bq_client
        self.project_id = settings.gcp_project_id

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def enqueue(
        self,
        tenant_id: str,
        config: Dict,
        priority: int = 5
    ) -> str:
        """
        Add pipeline to queue.

        Args:
            tenant_id: Customer/tenant identifier
            config: Pipeline configuration
            priority: Priority level (1=highest, 10=lowest)

        Returns:
            queue_id: Unique queue item identifier
        """
        queue_id = str(uuid.uuid4())
        table_id = f"{self.project_id}.metadata.x_meta_pipeline_queue"

        row = {
            "queue_id": queue_id,
            "tenant_id": tenant_id,
            "config": config,
            "priority": priority,
            "status": QueueStatus.QUEUED.value,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "worker_id": None,
            "error_message": None
        }

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        errors = await loop.run_in_executor(
            None,
            lambda: self.client.insert_rows_json(
                table_id,
                [row],
                row_ids=[queue_id]  # Idempotency
            )
        )

        if errors:
            error_msg = f"Failed to enqueue pipeline: {errors}"
            logger.error(error_msg, extra={"tenant_id": tenant_id})
            raise ValueError(error_msg)

        logger.info(
            "Enqueued pipeline",
            extra={"queue_id": queue_id, "tenant_id": tenant_id, "priority": priority}
        )

        return queue_id

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def dequeue(self, worker_id: str) -> Dict:
        """
        Get next pipeline from queue (highest priority first).
        Atomically marks as PROCESSING and assigns to worker.

        Args:
            worker_id: Identifier of the worker claiming the job

        Returns:
            Queue item dictionary or None if queue empty
        """
        # Use MERGE statement for atomic read-and-update
        query = f"""
        MERGE `{self.project_id}.metadata.x_meta_pipeline_queue` AS target
        USING (
            SELECT queue_id
            FROM `{self.project_id}.metadata.x_meta_pipeline_queue`
            WHERE status = 'QUEUED'
            ORDER BY priority ASC, created_at ASC
            LIMIT 1
        ) AS source
        ON target.queue_id = source.queue_id
        WHEN MATCHED THEN
            UPDATE SET
                status = 'PROCESSING',
                worker_id = @worker_id,
                updated_at = @updated_at
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("worker_id", "STRING", worker_id),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow())
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        await loop.run_in_executor(None, query_job.result)

        # Now fetch the item that was just claimed
        fetch_query = f"""
        SELECT *
        FROM `{self.project_id}.metadata.x_meta_pipeline_queue`
        WHERE worker_id = @worker_id AND status = 'PROCESSING'
        ORDER BY updated_at DESC
        LIMIT 1
        """

        fetch_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("worker_id", "STRING", worker_id)
            ]
        )

        fetch_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(fetch_query, job_config=fetch_config)
        )

        results = await loop.run_in_executor(None, fetch_job.result)
        rows = list(results)

        if not rows:
            return None

        item = dict(rows[0])

        logger.info(
            "Dequeued pipeline",
            extra={"queue_id": item["queue_id"], "worker_id": worker_id}
        )

        return item

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def mark_completed(self, queue_id: str):
        """
        Remove from queue or mark as completed.

        Args:
            queue_id: Queue item identifier
        """
        query = f"""
        UPDATE `{self.project_id}.metadata.x_meta_pipeline_queue`
        SET
            status = 'COMPLETED',
            updated_at = @updated_at
        WHERE queue_id = @queue_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("queue_id", "STRING", queue_id),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow())
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        await loop.run_in_executor(None, query_job.result)

        logger.info("Marked queue item as completed", extra={"queue_id": queue_id})

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def mark_failed(self, queue_id: str, error: str):
        """
        Mark queue item as failed.

        Args:
            queue_id: Queue item identifier
            error: Error message
        """
        query = f"""
        UPDATE `{self.project_id}.metadata.x_meta_pipeline_queue`
        SET
            status = 'FAILED',
            error_message = @error,
            updated_at = @updated_at
        WHERE queue_id = @queue_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("queue_id", "STRING", queue_id),
                bigquery.ScalarQueryParameter("error", "STRING", error),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow())
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query, job_config=job_config)
        )

        await loop.run_in_executor(None, query_job.result)

        logger.info("Marked queue item as failed", extra={"queue_id": queue_id, "error": error})

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def get_queue_length(self) -> int:
        """
        Get current queue size.

        Returns:
            Number of items in QUEUED state
        """
        query = f"""
        SELECT COUNT(*) as count
        FROM `{self.project_id}.metadata.x_meta_pipeline_queue`
        WHERE status = 'QUEUED'
        """

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query)
        )

        results = await loop.run_in_executor(None, query_job.result)
        row = list(results)[0]

        return row["count"]

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def get_queue_status(self) -> Dict:
        """
        Get queue status summary.

        Returns:
            Dictionary with queue statistics
        """
        query = f"""
        WITH queue_stats AS (
            SELECT
                COUNTIF(status = 'QUEUED') as queued,
                COUNTIF(status = 'PROCESSING') as processing,
                AVG(
                    CASE
                        WHEN status = 'PROCESSING'
                        THEN TIMESTAMP_DIFF(updated_at, created_at, SECOND)
                        ELSE NULL
                    END
                ) as avg_wait_time_seconds
            FROM `{self.project_id}.metadata.x_meta_pipeline_queue`
            WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
        )
        SELECT * FROM queue_stats
        """

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: self.client.query(query)
        )

        results = await loop.run_in_executor(None, query_job.result)
        row = list(results)[0]

        return {
            "queued": row["queued"],
            "processing": row["processing"],
            "avg_wait_time_seconds": int(row["avg_wait_time_seconds"] or 0)
        }


# ============================================
# Schedule Calculator
# ============================================

class ScheduleCalculator:
    """
    Calculate next run times from cron expressions using croniter.

    Supports standard cron syntax with timezone awareness using pendulum.
    """

    def calculate_next_run(
        self,
        cron_expression: str,
        timezone: str,
        after: datetime = None
    ) -> datetime:
        """
        Calculate next run time from cron expression.

        Args:
            cron_expression: Cron expression (e.g., "0 2 * * *")
            timezone: Timezone string (e.g., "America/New_York")
            after: Calculate next run after this time (defaults to now)

        Returns:
            Next run datetime in UTC

        Examples:
            - "0 2 * * *" → Daily at 2:00 AM
            - "0 */4 * * *" → Every 4 hours
            - "0 0 * * 0" → Weekly on Sunday
            - "0 0 1 * *" → Monthly on 1st
        """
        try:
            # Get current time in specified timezone
            if after is None:
                after = pendulum.now(timezone)
            else:
                after = pendulum.instance(after, tz=timezone)

            # Create croniter instance
            cron = croniter(cron_expression, after)

            # Get next run time
            next_run = cron.get_next(datetime)

            # Convert to UTC
            next_run_utc = pendulum.instance(next_run, tz=timezone).in_timezone('UTC')

            logger.debug(
                f"Calculated next run time: {next_run_utc.isoformat()}",
                extra={
                    "cron_expression": cron_expression,
                    "timezone": timezone,
                    "after": after.isoformat()
                }
            )

            return next_run_utc

        except Exception as e:
            logger.error(
                f"Error calculating next run time: {e}",
                extra={"cron_expression": cron_expression, "timezone": timezone},
                exc_info=True
            )
            raise ValueError(f"Invalid cron expression: {cron_expression}") from e

    def is_due(
        self,
        cron_expression: str,
        last_run: datetime,
        timezone: str
    ) -> bool:
        """
        Check if pipeline is due to run.

        Args:
            cron_expression: Cron expression
            last_run: Last execution time
            timezone: Timezone string

        Returns:
            True if pipeline should run now
        """
        try:
            next_run = self.calculate_next_run(cron_expression, timezone, after=last_run)
            now = pendulum.now('UTC')

            is_due = next_run <= now

            logger.debug(
                f"Pipeline due check: {is_due}",
                extra={
                    "cron_expression": cron_expression,
                    "last_run": last_run.isoformat(),
                    "next_run": next_run.isoformat(),
                    "now": now.isoformat()
                }
            )

            return is_due

        except Exception as e:
            logger.error(
                f"Error checking if pipeline is due: {e}",
                extra={"cron_expression": cron_expression},
                exc_info=True
            )
            return False


# ============================================
# Retry Manager
# ============================================

class RetryManager:
    """
    Manage retry logic for failed pipelines with exponential backoff.

    Implements configurable retry strategies with backoff and error filtering.
    """

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def should_retry(
        self,
        run_id: str,
        retry_config: Dict,
        bq_client: bigquery.Client
    ) -> bool:
        """
        Check if failed run should be retried.

        Args:
            run_id: Scheduled run identifier
            retry_config: Retry configuration
            bq_client: BigQuery client

        Returns:
            True if should retry, False otherwise

        Example retry_config:
            {
                "max_retries": 3,
                "backoff_multiplier": 2,
                "retry_on_errors": ["TimeoutError", "TransientError"]
            }
        """
        # Get run details
        query = f"""
        SELECT retry_count, error_message
        FROM `{settings.gcp_project_id}.metadata.x_meta_scheduled_runs`
        WHERE run_id = @run_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: bq_client.query(query, job_config=job_config)
        )

        results = await loop.run_in_executor(None, query_job.result)
        rows = list(results)

        if not rows:
            logger.warning(f"Run not found: {run_id}")
            return False

        row = dict(rows[0])
        retry_count = row["retry_count"]
        error_message = row["error_message"]

        # Check max retries
        max_retries = retry_config.get("max_retries", 3)
        if retry_count >= max_retries:
            logger.info(
                f"Max retries reached: {retry_count}/{max_retries}",
                extra={"run_id": run_id}
            )
            return False

        # Check error type filter
        retry_on_errors = retry_config.get("retry_on_errors")
        if retry_on_errors and error_message:
            # Check if error message contains any of the retryable error types
            should_retry = any(
                error_type in error_message
                for error_type in retry_on_errors
            )

            if not should_retry:
                logger.info(
                    f"Error type not retryable: {error_message}",
                    extra={"run_id": run_id, "retry_on_errors": retry_on_errors}
                )
                return False

        logger.info(
            f"Retry approved: attempt {retry_count + 1}/{max_retries}",
            extra={"run_id": run_id}
        )

        return True

    def calculate_retry_time(
        self,
        attempt: int,
        backoff_multiplier: int = 2
    ) -> datetime:
        """
        Calculate when to retry (exponential backoff).

        Args:
            attempt: Retry attempt number (1, 2, 3, ...)
            backoff_multiplier: Multiplier for exponential backoff

        Returns:
            Datetime when retry should occur

        Backoff formula: base_delay * (backoff_multiplier ^ (attempt - 1))
        - Attempt 1: 1 minute
        - Attempt 2: 2 minutes
        - Attempt 3: 4 minutes
        - Attempt 4: 8 minutes
        """
        base_delay_minutes = 1
        delay_minutes = base_delay_minutes * (backoff_multiplier ** (attempt - 1))

        # Cap at 60 minutes
        delay_minutes = min(delay_minutes, 60)

        retry_time = datetime.utcnow() + timedelta(minutes=delay_minutes)

        logger.debug(
            f"Calculated retry time: {retry_time.isoformat()}",
            extra={"attempt": attempt, "delay_minutes": delay_minutes}
        )

        return retry_time

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def schedule_retry(
        self,
        run_id: str,
        retry_time: datetime,
        bq_client: bigquery.Client
    ):
        """
        Schedule a retry for failed run.

        Args:
            run_id: Scheduled run identifier
            retry_time: When to retry
            bq_client: BigQuery client
        """
        query = f"""
        UPDATE `{settings.gcp_project_id}.metadata.x_meta_scheduled_runs`
        SET
            state = 'PENDING',
            scheduled_time = @retry_time,
            updated_at = @updated_at
        WHERE run_id = @run_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
                bigquery.ScalarQueryParameter("retry_time", "TIMESTAMP", retry_time),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.utcnow())
            ]
        )

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        query_job = await loop.run_in_executor(
            None,
            lambda: bq_client.query(query, job_config=job_config)
        )

        await loop.run_in_executor(None, query_job.result)

        logger.info(
            f"Scheduled retry for run: {run_id} at {retry_time.isoformat()}",
            extra={"run_id": run_id, "retry_time": retry_time.isoformat()}
        )
