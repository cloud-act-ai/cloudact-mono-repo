"""
Pub/Sub Publisher for distributed pipeline execution.
Publishes tasks to Google Cloud Pub/Sub for random, distributed execution.
"""

import json
import random
from typing import List, Dict, Any
from google.cloud import pubsub_v1
from src.app.config import settings
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class PipelinePublisher:
    """Publishes pipeline tasks to Pub/Sub for distributed execution."""

    def __init__(self, topic_name: str = "pipeline-tasks"):
        """
        Initialize Pub/Sub publisher.

        Args:
            topic_name: Name of Pub/Sub topic (created automatically if missing)
        """
        self.project_id = settings.gcp_project_id
        self.topic_name = topic_name
        self.topic_path = f"projects/{self.project_id}/topics/{topic_name}"
        self.publisher = pubsub_v1.PublisherClient()

        # Ensure topic exists
        self._ensure_topic_exists()

    def _ensure_topic_exists(self):
        """Create topic if it doesn't exist (idempotent)."""
        try:
            self.publisher.create_topic(request={"name": self.topic_path})
            logger.info(f"Created Pub/Sub topic: {self.topic_path}")
        except Exception as e:
            if "already exists" in str(e).lower():
                logger.debug(f"Topic already exists: {self.topic_path}")
            else:
                logger.warning(f"Error creating topic: {e}")

    async def publish_pipeline_batch(
        self,
        tenant_ids: List[str],
        pipeline_id: str,
        parameters: Dict[str, Any] = None,
        randomize_delay: bool = True,
        max_jitter_seconds: int = 3600
    ) -> Dict[str, Any]:
        """
        Publish pipeline tasks for multiple tenants to Pub/Sub.

        Args:
            tenant_ids: List of tenant IDs (can be 10k+)
            pipeline_id: Pipeline to execute
            parameters: Pipeline parameters (e.g., date, trigger_by)
            randomize_delay: Add random delay attribute (Cloud Pub/Sub will distribute)
            max_jitter_seconds: Maximum random delay in seconds (default: 1 hour)

        Returns:
            Dict with publish statistics
        """
        if parameters is None:
            parameters = {}

        published_count = 0
        failed_count = 0
        message_ids = []

        for tenant_id in tenant_ids:
            try:
                # Create task message
                task = {
                    "tenant_id": tenant_id,
                    "pipeline_id": pipeline_id,
                    "parameters": parameters
                }

                message_data = json.dumps(task).encode("utf-8")

                # Add random delay attribute for distributed execution
                attributes = {
                    "tenant_id": tenant_id,
                    "pipeline_id": pipeline_id
                }

                if randomize_delay:
                    # Random delay 0-3600 seconds (0-1 hour spread)
                    jitter = random.randint(0, max_jitter_seconds)
                    attributes["delay_seconds"] = str(jitter)

                # Publish asynchronously (returns Future)
                future = self.publisher.publish(
                    self.topic_path,
                    message_data,
                    **attributes
                )

                # Get message ID (blocks until published)
                message_id = future.result(timeout=10)
                message_ids.append(message_id)
                published_count += 1

                if published_count % 1000 == 0:
                    logger.info(f"Published {published_count} tasks...")

            except Exception as e:
                logger.error(f"Failed to publish task for tenant {tenant_id}: {e}")
                failed_count += 1

        logger.info(
            f"Batch publish complete: {published_count} published, {failed_count} failed",
            extra={
                "pipeline_id": pipeline_id,
                "total_tenants": len(tenant_ids),
                "published": published_count,
                "failed": failed_count
            }
        )

        return {
            "published_count": published_count,
            "failed_count": failed_count,
            "total_tenants": len(tenant_ids),
            "message_ids": message_ids[:100]  # Return first 100 for verification
        }
