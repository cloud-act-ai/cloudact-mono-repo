"""
Pagination Checkpoint Utility

Provides crash recovery for paginated API fetches by persisting cursor state.
If a pipeline crashes mid-pagination, it can resume from the last checkpoint.

SECURITY: Checkpoints are stored per-org in BigQuery for multi-tenant isolation.
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict

from google.cloud import bigquery

from src.app.config import get_settings
from src.core.utils.logging import get_logger, safe_error_log

logger = get_logger(__name__)
settings = get_settings()


@dataclass
class PaginationCheckpoint:
    """Checkpoint state for paginated API fetches."""
    org_slug: str
    pipeline_id: str
    step_id: str
    api_endpoint: str
    cursor: Optional[str]
    page_number: int
    total_fetched: int
    last_updated: str
    is_complete: bool = False


class CheckpointManager:
    """
    Manages pagination checkpoints for crash recovery.

    Stores checkpoints in BigQuery for durability and multi-tenant isolation.
    """

    def __init__(self, bq_client: bigquery.Client, project_id: str = None):
        """
        Initialize checkpoint manager.

        Args:
            bq_client: BigQuery client
            project_id: GCP project ID (defaults to settings)
        """
        self.bq_client = bq_client
        self.project_id = project_id or settings.gcp_project_id
        self.table_id = f"{self.project_id}.organizations.pipeline_checkpoints"
        self._ensure_table_exists()

    def _ensure_table_exists(self) -> None:
        """Ensure checkpoint table exists with proper schema."""
        schema = [
            bigquery.SchemaField("org_slug", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("pipeline_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("step_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("api_endpoint", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("cursor", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("page_number", "INTEGER", mode="REQUIRED"),
            bigquery.SchemaField("total_fetched", "INTEGER", mode="REQUIRED"),
            bigquery.SchemaField("last_updated", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("is_complete", "BOOLEAN", mode="REQUIRED"),
        ]

        table = bigquery.Table(self.table_id, schema=schema)

        try:
            self.bq_client.create_table(table, exists_ok=True)
        except Exception as e:
            logger.warning(f"Could not create checkpoint table (may already exist): {e}")

    def save_checkpoint(self, checkpoint: PaginationCheckpoint) -> bool:
        """
        Save or update a pagination checkpoint.

        Uses MERGE for upsert semantics.

        Args:
            checkpoint: Checkpoint state to save

        Returns:
            True if successful, False otherwise
        """
        try:
            # Use MERGE for upsert (update if exists, insert if not)
            merge_query = f"""
            MERGE `{self.table_id}` AS target
            USING (
                SELECT
                    @org_slug AS org_slug,
                    @pipeline_id AS pipeline_id,
                    @step_id AS step_id,
                    @api_endpoint AS api_endpoint,
                    @cursor AS cursor,
                    @page_number AS page_number,
                    @total_fetched AS total_fetched,
                    @last_updated AS last_updated,
                    @is_complete AS is_complete
            ) AS source
            ON target.org_slug = source.org_slug
                AND target.pipeline_id = source.pipeline_id
                AND target.step_id = source.step_id
                AND target.api_endpoint = source.api_endpoint
            WHEN MATCHED THEN
                UPDATE SET
                    cursor = source.cursor,
                    page_number = source.page_number,
                    total_fetched = source.total_fetched,
                    last_updated = source.last_updated,
                    is_complete = source.is_complete
            WHEN NOT MATCHED THEN
                INSERT (org_slug, pipeline_id, step_id, api_endpoint, cursor, page_number, total_fetched, last_updated, is_complete)
                VALUES (source.org_slug, source.pipeline_id, source.step_id, source.api_endpoint, source.cursor, source.page_number, source.total_fetched, source.last_updated, source.is_complete)
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", checkpoint.org_slug),
                    bigquery.ScalarQueryParameter("pipeline_id", "STRING", checkpoint.pipeline_id),
                    bigquery.ScalarQueryParameter("step_id", "STRING", checkpoint.step_id),
                    bigquery.ScalarQueryParameter("api_endpoint", "STRING", checkpoint.api_endpoint),
                    bigquery.ScalarQueryParameter("cursor", "STRING", checkpoint.cursor),
                    bigquery.ScalarQueryParameter("page_number", "INT64", checkpoint.page_number),
                    bigquery.ScalarQueryParameter("total_fetched", "INT64", checkpoint.total_fetched),
                    bigquery.ScalarQueryParameter("last_updated", "TIMESTAMP", checkpoint.last_updated),
                    bigquery.ScalarQueryParameter("is_complete", "BOOL", checkpoint.is_complete),
                ]
            )

            query_job = self.bq_client.query(merge_query, job_config=job_config)
            query_job.result()

            logger.debug(
                "Saved pagination checkpoint",
                extra={
                    "org_slug": checkpoint.org_slug,
                    "pipeline_id": checkpoint.pipeline_id,
                    "step_id": checkpoint.step_id,
                    "page": checkpoint.page_number,
                    "total_fetched": checkpoint.total_fetched
                }
            )
            return True

        except Exception as e:
            safe_error_log(logger, "Failed to save checkpoint", e,
                          org_slug=checkpoint.org_slug,
                          pipeline_id=checkpoint.pipeline_id)
            return False

    def get_checkpoint(
        self,
        org_slug: str,
        pipeline_id: str,
        step_id: str,
        api_endpoint: str
    ) -> Optional[PaginationCheckpoint]:
        """
        Get the latest checkpoint for a pagination operation.

        Args:
            org_slug: Organization identifier
            pipeline_id: Pipeline identifier
            step_id: Step identifier
            api_endpoint: API endpoint being paginated

        Returns:
            PaginationCheckpoint if found and not complete, None otherwise
        """
        try:
            query = f"""
            SELECT
                org_slug,
                pipeline_id,
                step_id,
                api_endpoint,
                cursor,
                page_number,
                total_fetched,
                last_updated,
                is_complete
            FROM `{self.table_id}`
            WHERE org_slug = @org_slug
                AND pipeline_id = @pipeline_id
                AND step_id = @step_id
                AND api_endpoint = @api_endpoint
                AND is_complete = FALSE
            ORDER BY last_updated DESC
            LIMIT 1
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
                    bigquery.ScalarQueryParameter("step_id", "STRING", step_id),
                    bigquery.ScalarQueryParameter("api_endpoint", "STRING", api_endpoint),
                ]
            )

            results = list(self.bq_client.query(query, job_config=job_config).result())

            if results:
                row = results[0]
                checkpoint = PaginationCheckpoint(
                    org_slug=row.org_slug,
                    pipeline_id=row.pipeline_id,
                    step_id=row.step_id,
                    api_endpoint=row.api_endpoint,
                    cursor=row.cursor,
                    page_number=row.page_number,
                    total_fetched=row.total_fetched,
                    last_updated=row.last_updated.isoformat() if row.last_updated else None,
                    is_complete=row.is_complete
                )
                logger.info(
                    "Resuming from checkpoint",
                    extra={
                        "org_slug": org_slug,
                        "pipeline_id": pipeline_id,
                        "step_id": step_id,
                        "page": checkpoint.page_number,
                        "total_fetched": checkpoint.total_fetched
                    }
                )
                return checkpoint

            return None

        except Exception as e:
            safe_error_log(logger, "Failed to get checkpoint", e,
                          org_slug=org_slug,
                          pipeline_id=pipeline_id)
            return None

    def mark_complete(
        self,
        org_slug: str,
        pipeline_id: str,
        step_id: str,
        api_endpoint: str
    ) -> bool:
        """
        Mark a checkpoint as complete (pagination finished).

        Args:
            org_slug: Organization identifier
            pipeline_id: Pipeline identifier
            step_id: Step identifier
            api_endpoint: API endpoint

        Returns:
            True if successful, False otherwise
        """
        try:
            update_query = f"""
            UPDATE `{self.table_id}`
            SET is_complete = TRUE, last_updated = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug
                AND pipeline_id = @pipeline_id
                AND step_id = @step_id
                AND api_endpoint = @api_endpoint
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
                    bigquery.ScalarQueryParameter("step_id", "STRING", step_id),
                    bigquery.ScalarQueryParameter("api_endpoint", "STRING", api_endpoint),
                ]
            )

            query_job = self.bq_client.query(update_query, job_config=job_config)
            query_job.result()

            logger.info(
                "Marked checkpoint as complete",
                extra={
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "step_id": step_id
                }
            )
            return True

        except Exception as e:
            safe_error_log(logger, "Failed to mark checkpoint complete", e,
                          org_slug=org_slug,
                          pipeline_id=pipeline_id)
            return False

    def cleanup_old_checkpoints(self, days_old: int = 7) -> int:
        """
        Clean up old completed checkpoints.

        Args:
            days_old: Delete checkpoints older than this many days

        Returns:
            Number of checkpoints deleted
        """
        try:
            delete_query = f"""
            DELETE FROM `{self.table_id}`
            WHERE is_complete = TRUE
                AND last_updated < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("days", "INT64", days_old),
                ]
            )

            query_job = self.bq_client.query(delete_query, job_config=job_config)
            query_job.result()

            deleted = query_job.num_dml_affected_rows or 0
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} old checkpoints")
            return deleted

        except Exception as e:
            safe_error_log(logger, "Failed to cleanup checkpoints", e)
            return 0


def create_checkpoint_manager(bq_client: bigquery.Client) -> CheckpointManager:
    """Factory function to create a CheckpointManager."""
    return CheckpointManager(bq_client)
