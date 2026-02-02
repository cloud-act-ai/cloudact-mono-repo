"""
Queue Manager
Manages pipeline execution queue with priority support.

Provides FIFO queue with priority ordering and atomic dequeue operations
to prevent race conditions in distributed systems.
"""

import uuid
import asyncio
from typing import Dict, Any
from datetime import datetime, timezone

from google.cloud import bigquery
from tenacity import (
    retry as tenacity_retry,
    stop_after_attempt,
    wait_exponential,
)

from src.app.config import settings
from src.core.utils.logging import get_logger
from src.core.scheduler.state_transitions import QueueStatus, TRANSIENT_RETRY_POLICY

logger = get_logger(__name__)


class QueueManager:
    """
    Manages pipeline execution queue with priority support.

    Provides FIFO queue with priority ordering and atomic dequeue operations
    to prevent race conditions in distributed systems.

    MULTI-TENANCY DESIGN NOTE:
    This is a shared worker pool architecture where ANY worker can claim ANY queued job.
    Org isolation is enforced at the EXECUTION level, not the queue level:

    1. Jobs are queued with their org_slug stored in the queue record
    2. Any available worker claims the next job (dequeue is global)
    3. Worker extracts org_slug from the claimed job
    4. Pipeline execution is scoped to that org (credentials, datasets, etc.)

    This design enables:
    - Efficient resource utilization across all orgs
    - No dedicated workers per org (cost savings)
    - Automatic load balancing across the worker pool

    Security is maintained because:
    - Workers don't have persistent org context
    - Each execution gets org context from the job
    - Credentials are fetched per-execution with org_slug filter
    - Data writes go to org-specific datasets ({org_slug}_prod)
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
        org_slug: str,
        config: Dict,
        priority: int = 5
    ) -> str:
        """
        Add pipeline to queue.

        Args:
            org_slug: Customer/org identifier
            config: Pipeline configuration
            priority: Priority level (1=highest, 10=lowest)

        Returns:
            queue_id: Unique queue item identifier
        """
        queue_id = str(uuid.uuid4())
        table_id = f"{self.project_id}.metadata.org_meta_pipeline_queue"

        row = {
            "queue_id": queue_id,
            "org_slug": org_slug,
            "config": config,
            "priority": priority,
            "status": QueueStatus.QUEUED.value,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
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
            logger.error(error_msg, extra={"org_slug": org_slug})
            raise ValueError(error_msg)

        logger.info(
            "Enqueued pipeline",
            extra={"queue_id": queue_id, "org_slug": org_slug, "priority": priority}
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
        MERGE `{self.project_id}.metadata.org_meta_pipeline_queue` AS target
        USING (
            SELECT queue_id
            FROM `{self.project_id}.metadata.org_meta_pipeline_queue`
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
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.now(timezone.utc))
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
        FROM `{self.project_id}.metadata.org_meta_pipeline_queue`
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
        UPDATE `{self.project_id}.metadata.org_meta_pipeline_queue`
        SET
            status = 'COMPLETED',
            updated_at = @updated_at
        WHERE queue_id = @queue_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("queue_id", "STRING", queue_id),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.now(timezone.utc))
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
        UPDATE `{self.project_id}.metadata.org_meta_pipeline_queue`
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
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", datetime.now(timezone.utc))
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
        FROM `{self.project_id}.metadata.org_meta_pipeline_queue`
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
            FROM `{self.project_id}.metadata.org_meta_pipeline_queue`
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
