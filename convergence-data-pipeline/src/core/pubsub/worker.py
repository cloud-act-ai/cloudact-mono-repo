"""
Pub/Sub Worker for consuming pipeline tasks.
Pulls tasks from Pub/Sub and executes pipelines.
"""

import json
import asyncio
import time
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor
from google.cloud import pubsub_v1
from src.app.config import settings
from src.core.pipeline.async_executor import AsyncPipelineExecutor
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class PipelineWorker:
    """Worker that pulls pipeline tasks from Pub/Sub and executes them."""

    def __init__(
        self,
        subscription_name: str = "pipeline-tasks-sub",
        max_concurrent: int = 100
    ):
        """
        Initialize Pub/Sub worker.

        Args:
            subscription_name: Name of subscription (created automatically)
            max_concurrent: Maximum concurrent pipeline executions (default: 100)
        """
        self.project_id = settings.gcp_project_id
        self.topic_name = "pipeline-tasks"
        self.subscription_name = subscription_name
        self.max_concurrent = max_concurrent

        self.topic_path = f"projects/{self.project_id}/topics/{self.topic_name}"
        self.subscription_path = f"projects/{self.project_id}/subscriptions/{subscription_name}"

        self.subscriber = pubsub_v1.SubscriberClient()

        # Execution tracking
        self.execution_count = 0
        self.success_count = 0
        self.failure_count = 0

        # Ensure subscription exists
        self._ensure_subscription_exists()

    def _ensure_subscription_exists(self):
        """Create subscription if it doesn't exist (idempotent)."""
        try:
            request = {
                "name": self.subscription_path,
                "topic": self.topic_path,
                # Acknowledge deadline: 10 minutes (max pipeline execution time)
                "ack_deadline_seconds": 600,
                # Dead letter topic after 5 failures
                "retry_policy": {
                    "minimum_backoff": {"seconds": 10},
                    "maximum_backoff": {"seconds": 600}
                }
            }
            self.subscriber.create_subscription(request=request)
            logger.info(f"Created subscription: {self.subscription_path}")
        except Exception as e:
            if "already exists" in str(e).lower():
                logger.debug(f"Subscription already exists: {self.subscription_path}")
            else:
                logger.warning(f"Error creating subscription: {e}")

    async def _execute_pipeline_task(self, task: Dict[str, Any]) -> bool:
        """
        Execute a single pipeline task.

        Args:
            task: Task dict with org_slug, pipeline_id, parameters

        Returns:
            True if successful, False otherwise
        """
        org_slug = task["org_slug"]
        pipeline_id = task["pipeline_id"]
        parameters = task.get("parameters", {})

        try:
            logger.info(
                f"Executing pipeline task",
                extra={"org_slug": org_slug, "pipeline_id": pipeline_id}
            )

            # Use existing AsyncPipelineExecutor
            executor = AsyncPipelineExecutor(
                org_slug=org_slug,
                pipeline_id=pipeline_id,
                trigger_type="pubsub",
                trigger_by="pubsub_worker"
            )

            result = await executor.execute(parameters=parameters)

            logger.info(
                f"Pipeline completed successfully",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "pipeline_logging_id": result.get("pipeline_logging_id")
                }
            )

            return True

        except Exception as e:
            logger.error(
                f"Pipeline execution failed",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "error": str(e)
                },
                exc_info=True
            )
            return False

    def _message_callback(self, message: pubsub_v1.subscriber.message.Message):
        """
        Callback for processing Pub/Sub messages.

        Args:
            message: Pub/Sub message
        """
        try:
            # Parse task
            task = json.loads(message.data.decode("utf-8"))

            # Check for delay attribute
            delay_seconds = message.attributes.get("delay_seconds")
            if delay_seconds:
                time.sleep(int(delay_seconds))

            # Execute pipeline synchronously (Pub/Sub callback is sync)
            # Use asyncio.run to execute async pipeline
            success = asyncio.run(self._execute_pipeline_task(task))

            # Track metrics
            self.execution_count += 1
            if success:
                self.success_count += 1
                message.ack()  # Acknowledge success
            else:
                self.failure_count += 1
                message.nack()  # Negative acknowledge (will retry)

            # Log progress every 100 executions
            if self.execution_count % 100 == 0:
                logger.info(
                    f"Worker progress: {self.execution_count} executed, "
                    f"{self.success_count} success, {self.failure_count} failed"
                )

        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            message.nack()  # Retry on error

    def start(self, block: bool = True):
        """
        Start worker to pull and execute tasks.

        Args:
            block: If True, blocks until interrupted. If False, returns immediately.
        """
        logger.info(
            f"Starting Pub/Sub worker",
            extra={
                "subscription": self.subscription_path,
                "max_concurrent": self.max_concurrent
            }
        )

        # Configure flow control
        flow_control = pubsub_v1.types.FlowControl(
            max_messages=self.max_concurrent,  # Pull max 100 at a time
            max_bytes=10 * 1024 * 1024,  # 10MB
        )

        # Start streaming pull
        streaming_pull_future = self.subscriber.subscribe(
            self.subscription_path,
            callback=self._message_callback,
            flow_control=flow_control
        )

        logger.info(f"Worker listening for messages...")

        if block:
            # Block until interrupted (Ctrl+C)
            try:
                streaming_pull_future.result()
            except KeyboardInterrupt:
                streaming_pull_future.cancel()
                logger.info("Worker stopped by user")

        return streaming_pull_future
