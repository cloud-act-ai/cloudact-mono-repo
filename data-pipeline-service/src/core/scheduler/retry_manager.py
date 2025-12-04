"""
Retry Manager
Manage retry logic for failed pipelines with exponential backoff.

Implements configurable retry strategies with backoff and error filtering.
"""

import asyncio
from typing import Dict
from datetime import datetime, timedelta

from google.cloud import bigquery
from tenacity import (
    retry as tenacity_retry,
    stop_after_attempt,
    wait_exponential,
)

from src.app.config import settings
from src.core.utils.logging import get_logger
from src.core.scheduler.state_transitions import TRANSIENT_RETRY_POLICY

logger = get_logger(__name__)


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
        FROM `{settings.gcp_project_id}.metadata.org_meta_scheduled_runs`
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
        UPDATE `{settings.gcp_project_id}.metadata.org_meta_scheduled_runs`
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
