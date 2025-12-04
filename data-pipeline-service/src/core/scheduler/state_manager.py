"""
Pipeline State Management System
Comprehensive state tracking for scheduled pipeline execution.

Features:
- Atomic state transitions with validation
- Thread-safe BigQuery operations
- Idempotent operations
- Status tracking and reporting

State Flow:
SCHEDULED → PENDING → RUNNING → COMPLETED/FAILED
FAILED → PENDING (retry)
"""

import uuid
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime

from google.cloud import bigquery
from tenacity import (
    retry as tenacity_retry,
    stop_after_attempt,
    wait_exponential,
)

from src.app.config import settings
from src.core.utils.logging import get_logger
from src.core.scheduler.state_transitions import (
    PipelineState,
    VALID_TRANSITIONS,
    TRANSIENT_RETRY_POLICY
)

logger = get_logger(__name__)


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

    def _get_scheduled_runs_table(self, org_slug: str) -> str:
        """
        Get fully qualified scheduled runs table name.

        Args:
            org_slug: Customer/org identifier

        Returns:
            Fully qualified table name
        """
        dataset = settings.get_org_dataset_name(org_slug)
        return f"{self.project_id}.{dataset}.org_meta_scheduled_runs"

    @tenacity_retry(
        stop=stop_after_attempt(settings.bq_max_retry_attempts),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=TRANSIENT_RETRY_POLICY
    )
    async def create_scheduled_run(
        self,
        org_slug: str,
        config_id: str,
        scheduled_time: datetime
    ) -> str:
        """
        Create a new scheduled pipeline run record.

        Args:
            org_slug: Customer/org identifier
            config_id: Pipeline configuration ID
            scheduled_time: When the pipeline should run

        Returns:
            run_id: Unique identifier for this scheduled run
        """
        run_id = str(uuid.uuid4())
        table_id = self._get_scheduled_runs_table(org_slug)

        row = {
            "run_id": run_id,
            "org_slug": org_slug,
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
            logger.error(error_msg, extra={"org_slug": org_slug, "config_id": config_id})
            raise ValueError(error_msg)

        logger.info(
            "Created scheduled pipeline run",
            extra={
                "run_id": run_id,
                "org_slug": org_slug,
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
        UPDATE `{self.project_id}.metadata.org_meta_scheduled_runs`
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
        org_slug: str = None
    ) -> List[Dict]:
        """
        Get all pipelines in a specific state.

        Args:
            state: Pipeline state to filter by
            limit: Maximum number of results
            org_slug: Optional customer filter

        Returns:
            List of pipeline run records
        """
        where_clause = "WHERE state = @state"
        params = [bigquery.ScalarQueryParameter("state", "STRING", state)]

        if org_slug:
            where_clause += " AND org_slug = @org_slug"
            params.append(bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug))

        query = f"""
        SELECT *
        FROM `{self.project_id}.metadata.org_meta_scheduled_runs`
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
        FROM `{self.project_id}.metadata.org_meta_scheduled_runs`
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
        UPDATE `{self.project_id}.metadata.org_meta_scheduled_runs`
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
        UPDATE `{self.project_id}.metadata.org_meta_scheduled_runs`
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
        UPDATE `{self.project_id}.metadata.org_meta_scheduled_runs`
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
        FROM `{self.project_id}.metadata.org_meta_scheduled_runs`
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
    async def get_org_pipeline_status(
        self,
        org_slug: str,
        date: str = None
    ) -> Dict:
        """
        Get summary of all pipelines for an org.

        Args:
            org_slug: Org identifier
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
            FROM `{self.project_id}.metadata.org_meta_scheduled_runs`
            WHERE org_slug = @org_slug
        )
        SELECT * FROM pipeline_stats
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
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
