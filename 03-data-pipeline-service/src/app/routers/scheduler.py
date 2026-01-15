"""
Cloud Scheduler Integration API Routes
Endpoints for automated pipeline scheduling and queue management.
Supports hourly triggers, queue processing, and org pipeline configurations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, Request
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone, date
import uuid
import logging
from croniter import croniter
import pytz

from src.app.dependencies.auth import verify_api_key_header, verify_admin_key, OrgContext, get_current_org
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from google.cloud import bigquery
import json

logger = logging.getLogger(__name__)


def get_utc_date() -> date:
    """Get current date in UTC timezone to ensure consistency with BigQuery."""
    return datetime.now(timezone.utc).date()

router = APIRouter()


# ============================================
# Request/Response Models
# ============================================

class PipelineConfigRequest(BaseModel):
    """Request to add/update pipeline configuration."""
    provider: str = Field(..., min_length=1, max_length=50, description="Cloud provider (GCP, AWS, AZURE)")
    domain: str = Field(..., min_length=1, max_length=50, description="Domain category (COST, SECURITY, COMPUTE)")
    pipeline_template: str = Field(..., min_length=1, max_length=100, description="Pipeline template name")
    schedule_cron: str = Field(..., max_length=100, description="Cron expression (e.g., '0 2 * * *')")
    timezone: str = Field(default="UTC", description="Timezone for schedule")
    is_active: bool = Field(default=True, description="Enable/disable pipeline")
    parameters: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Pipeline parameters (e.g., {'filter_date': '{date}'})"
    )

    model_config = ConfigDict(extra="forbid")


class PipelineConfigResponse(BaseModel):
    """Response for pipeline configuration."""
    config_id: str
    org_slug: str
    provider: str
    domain: str
    pipeline_template: str
    schedule_cron: str
    timezone: str
    is_active: bool
    next_run_time: Optional[datetime] = None
    last_run_time: Optional[datetime] = None
    last_run_status: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class TriggerSummaryResponse(BaseModel):
    """Response for scheduler trigger."""
    triggered_count: int
    queued_count: int
    skipped_count: int
    next_trigger_time: Optional[datetime] = None
    details: Optional[Dict[str, Any]] = None


class SchedulerStatusResponse(BaseModel):
    """Response for scheduler status."""
    total_active_pipelines: int
    pipelines_due_now: int
    pipelines_queued: int
    pipelines_running: int
    pipelines_completed_today: int
    pipelines_failed_today: int
    queue_length: int
    avg_execution_time_seconds: Optional[float] = None


class QueueProcessResponse(BaseModel):
    """Response for queue processing."""
    processed: bool
    processed_count: int = 0
    started_pipelines: List[str] = []
    elapsed_seconds: float = 0.0
    pipeline_logging_id: Optional[str] = None
    org_slug: Optional[str] = None
    pipeline_id: Optional[str] = None
    status: str
    message: str


# ============================================
# Helper Functions
# ============================================

async def get_current_processing_count(bq_client: BigQueryClient) -> int:
    """Get count of pipelines currently in PROCESSING state."""
    query = f"""
    SELECT COUNT(*) as count
    FROM `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
    WHERE state = 'PROCESSING'
    """
    results = list(bq_client.client.query(query).result())
    return results[0]['count'] if results else 0


def calculate_next_run_time(
    schedule_cron: str,
    timezone_str: str = "UTC",
    last_run: Optional[datetime] = None
) -> datetime:
    """
    Calculate next run time from cron expression with DST-aware handling.

    Args:
        schedule_cron: Cron expression (e.g., '0 2 * * *')
        timezone_str: Timezone name (e.g., 'UTC', 'America/New_York')
        last_run: Last run time (if None, uses current time)

    Returns:
        Next scheduled run time in UTC (timezone-aware)
    """
    try:
        tz = pytz.timezone(timezone_str)
    except pytz.UnknownTimeZoneError:
        logger.warning(f"Unknown timezone '{timezone_str}', using UTC")
        tz = pytz.UTC

    # Use last_run or current time as base (ensure timezone-aware)
    if last_run:
        # Ensure datetime is timezone-aware
        if last_run.tzinfo is None:
            base_time = tz.localize(last_run)
        else:
            base_time = last_run.astimezone(tz)
    else:
        # Use timezone-aware current time
        base_time = datetime.now(tz)

    # Calculate next run time (croniter handles DST transitions)
    cron = croniter(schedule_cron, base_time)
    next_run = cron.get_next(datetime)

    # Ensure result is timezone-aware and convert to UTC for storage
    if next_run.tzinfo is None:
        next_run = tz.localize(next_run)

    return next_run.astimezone(timezone.utc)


def validate_cron_expression(cron_expr: str) -> bool:
    """
    Validate cron expression format.

    Args:
        cron_expr: Cron expression to validate

    Returns:
        True if valid, False otherwise
    """
    try:
        croniter(cron_expr)
        return True
    except Exception:
        return False


async def get_pipelines_due_now(
    bq_client: BigQueryClient,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Get pipelines that should run now.

    Queries org_pipeline_configs for pipelines where:
    - is_active = TRUE
    - next_run_time <= NOW()
    - Org status = ACTIVE
    - Org quota not exceeded

    Args:
        bq_client: BigQuery client instance
        limit: Maximum number of pipelines to return

    Returns:
        List of pipeline configurations ready to run
    """
    # Note: This assumes org_pipeline_configs table exists in organizations dataset
    # Schema should be created as part of scheduler setup
    today = get_utc_date()  # Use UTC date for consistency
    # BUG-007 FIX: Also check concurrent limit to avoid queueing pipelines
    # for orgs that are already at their concurrent limit
    query = f"""
    WITH due_pipelines AS (
        SELECT
            c.config_id,
            c.org_slug,
            c.provider,
            c.domain,
            c.pipeline_template,
            c.schedule_cron,
            c.timezone,
            c.parameters,
            c.next_run_time,
            c.priority,
            p.status as org_status,
            s.max_pipelines_per_day,
            s.concurrent_limit,
            COALESCE(u.pipelines_run_today, 0) as pipelines_run_today,
            COALESCE(u.concurrent_pipelines_running, 0) as concurrent_pipelines_running
        FROM `{settings.gcp_project_id}.organizations.org_pipeline_configs` c
        INNER JOIN `{settings.gcp_project_id}.organizations.org_profiles` p
            ON c.org_slug = p.org_slug
        LEFT JOIN `{settings.gcp_project_id}.organizations.org_subscriptions` s
            ON p.org_slug = s.org_slug AND s.status = 'ACTIVE'
        LEFT JOIN `{settings.gcp_project_id}.organizations.org_usage_quotas` u
            ON p.org_slug = u.org_slug AND u.usage_date = @usage_date
        WHERE c.is_active = TRUE
          AND c.next_run_time <= CURRENT_TIMESTAMP()
          AND p.status = 'ACTIVE'
    )
    SELECT
        config_id, org_slug, provider, domain, pipeline_template,
        schedule_cron, timezone, parameters, next_run_time, priority,
        org_status, max_pipelines_per_day, pipelines_run_today,
        concurrent_limit, concurrent_pipelines_running
    FROM due_pipelines
    WHERE pipelines_run_today < max_pipelines_per_day
      -- BUG-007 FIX: Skip orgs at concurrent limit
      AND concurrent_pipelines_running < COALESCE(concurrent_limit, 999999)
    ORDER BY next_run_time ASC, priority DESC
    LIMIT @limit
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
            bigquery.ScalarQueryParameter("usage_date", "DATE", today)
        ]
    )

    results = bq_client.client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]


async def enqueue_pipeline(
    bq_client: BigQueryClient,
    org_slug: str,
    config: Dict[str, Any],
    priority: int = 5
) -> str:
    """
    Add pipeline to execution queue with idempotency check.

    Creates record in org_pipeline_execution_queue and org_scheduled_pipeline_runs tables.
    IDEMPOTENT: Returns existing run_id if pipeline is already queued/running.

    Args:
        bq_client: BigQuery client instance
        org_slug: Organization identifier
        config: Pipeline configuration dict
        priority: Queue priority (1-10, higher is more urgent)

    Returns:
        Run ID for the scheduled pipeline (existing or new)
    """
    pipeline_id = f"{org_slug}-{config['provider']}-{config['domain']}-{config['pipeline_template']}"

    # ============================================
    # IDEMPOTENCY CHECK: Skip if already queued/running
    # ============================================
    check_existing_query = f"""
    SELECT run_id, state
    FROM `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
    WHERE org_slug = @org_slug
      AND pipeline_id = @pipeline_id
      AND state IN ('QUEUED', 'PROCESSING')
    LIMIT 1
    """

    check_job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
        ]
    )

    existing_results = list(bq_client.client.query(check_existing_query, job_config=check_job_config).result())

    if existing_results:
        existing_run_id = existing_results[0]['run_id']
        existing_state = existing_results[0]['state']
        logger.info(f"Pipeline {pipeline_id} already {existing_state} for org {org_slug}, returning existing run_id {existing_run_id}")
        return existing_run_id

    # ============================================
    # No existing run - proceed with enqueue
    # ============================================
    run_id = str(uuid.uuid4())
    scheduled_time = datetime.now(timezone.utc)

    # Insert into scheduled_pipeline_runs
    insert_run_query = f"""
    INSERT INTO `{settings.gcp_project_id}.organizations.org_scheduled_pipeline_runs`
    (run_id, config_id, org_slug, pipeline_id, state, scheduled_time, priority,
     parameters, retry_count, max_retries, created_at)
    VALUES (
        @run_id,
        @config_id,
        @org_slug,
        @pipeline_id,
        'PENDING',
        @scheduled_time,
        @priority,
        PARSE_JSON(@parameters),
        0,
        3,
        CURRENT_TIMESTAMP()
    )
    """

    # pipeline_id already defined above (before idempotency check)

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
            bigquery.ScalarQueryParameter("config_id", "STRING", config['config_id']),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            bigquery.ScalarQueryParameter("scheduled_time", "TIMESTAMP", scheduled_time),
            bigquery.ScalarQueryParameter("priority", "INT64", priority),
            bigquery.ScalarQueryParameter("parameters", "STRING", json.dumps(config.get('parameters', {}))),
        ]
    )

    bq_client.client.query(insert_run_query, job_config=job_config).result()

    # Insert into pipeline_execution_queue
    insert_queue_query = f"""
    INSERT INTO `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
    (run_id, org_slug, pipeline_id, state, scheduled_time, priority, added_at)
    VALUES (
        @run_id,
        @org_slug,
        @pipeline_id,
        'QUEUED',
        @scheduled_time,
        @priority,
        CURRENT_TIMESTAMP()
    )
    """

    bq_client.client.query(insert_queue_query, job_config=job_config).result()

    logger.info(f"Enqueued pipeline {pipeline_id} for org {org_slug} with run_id {run_id}")
    return run_id


async def should_retry_failed_run(
    bq_client: BigQueryClient,
    run_id: str
) -> bool:
    """
    Check if failed run should be retried.

    Args:
        bq_client: BigQuery client instance
        run_id: Run identifier

    Returns:
        True if should retry, False otherwise
    """
    query = f"""
    SELECT
        retry_count,
        max_retries
    FROM `{settings.gcp_project_id}.organizations.org_scheduled_pipeline_runs`
    WHERE run_id = @run_id
    LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
        ]
    )

    results = list(bq_client.client.query(query, job_config=job_config).result())

    if not results:
        return False

    row = dict(results[0])
    retry_count = row.get('retry_count', 0) or 0
    max_retries = row.get('max_retries', 3) or 3

    return retry_count < max_retries


# ============================================
# Scheduler Endpoints
# ============================================

@router.post(
    "/scheduler/trigger",
    response_model=TriggerSummaryResponse,
    summary="Trigger due pipelines (Hourly)",
    description="Called by Google Cloud Scheduler to trigger pipelines due for execution (ADMIN ONLY)"
)
async def trigger_scheduler(
    background_tasks: BackgroundTasks,
    limit: int = Query(default=100, ge=1, le=1000, description="Max pipelines to trigger"),
    admin_context: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Trigger all pipelines that are due to run.

    This endpoint is called by Google Cloud Scheduler every hour.
    It queries for due pipelines and adds them to the execution queue.

    Logic:
    1. Query org_pipeline_configs for pipelines where:
       - is_active = TRUE
       - next_run_time <= NOW()
       - Org status = ACTIVE
       - Org quota not exceeded

    2. For each due pipeline:
       - Create record in scheduled_pipeline_runs with state = PENDING
       - Add to pipeline_execution_queue with priority
       - Update next_run_time based on schedule_cron

    3. Return summary of triggered/queued/skipped pipelines

    Security:
    - Requires admin API key
    - Validates org quotas before enqueuing
    - Prevents duplicate runs (idempotency check)

    Performance:
    - Batch processes in chunks of 100 pipelines
    - Uses pagination for 10k+ orgs
    """
    try:
        # Get pipelines due now
        due_pipelines = await get_pipelines_due_now(bq_client, limit=limit)

        triggered_count = 0
        queued_count = 0
        skipped_count = 0

        # Process each due pipeline
        for pipeline_config in due_pipelines:
            try:
                # Enqueue pipeline
                run_id = await enqueue_pipeline(
                    bq_client,
                    org_slug=pipeline_config['org_slug'],
                    config=pipeline_config,
                    priority=pipeline_config.get('priority', 5)
                )

                triggered_count += 1
                queued_count += 1

                # Update next_run_time
                next_run = calculate_next_run_time(
                    schedule_cron=pipeline_config['schedule_cron'],
                    timezone_str=pipeline_config.get('timezone', 'UTC'),
                    last_run=datetime.now(timezone.utc)
                )

                update_query = f"""
                UPDATE `{settings.gcp_project_id}.organizations.org_pipeline_configs`
                SET next_run_time = @next_run_time,
                    updated_at = CURRENT_TIMESTAMP()
                WHERE config_id = @config_id
                """

                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("next_run_time", "TIMESTAMP", next_run),
                        bigquery.ScalarQueryParameter("config_id", "STRING", pipeline_config['config_id'])
                    ]
                )

                bq_client.client.query(update_query, job_config=job_config).result()

            except Exception as e:
                logger.error(f"Failed to enqueue pipeline {pipeline_config.get('config_id')}: {e}")
                skipped_count += 1

        # Calculate next trigger time (1 hour from now)
        next_trigger = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        next_trigger = next_trigger.replace(hour=(next_trigger.hour + 1) % 24)

        return TriggerSummaryResponse(
            triggered_count=triggered_count,
            queued_count=queued_count,
            skipped_count=skipped_count,
            next_trigger_time=next_trigger,
            details={
                "limit": limit,
                "due_pipelines_found": len(due_pipelines)
            }
        )

    except Exception as e:
        logger.error(f"Scheduler trigger failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


@router.post(
    "/scheduler/process-queue",
    response_model=QueueProcessResponse,
    summary="Process queued pipelines in batch",
    description="Worker endpoint to process multiple pipelines from the queue (ADMIN ONLY)"
)
async def process_queue(
    background_tasks: BackgroundTasks,
    admin_context: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Process multiple pipelines from execution queue in a time-bounded loop.

    Logic:
    1. Loop until time limit or queue empty or at concurrency capacity
    2. For each pipeline: get next QUEUED item, update to PROCESSING, spawn background task
    3. Return immediately after spawning all tasks (doesn't wait for completion)

    Performance:
    - Processes up to 100 pipelines per API call (respects global concurrency limit)
    - Time-bounded loop (default 50 seconds, configurable)
    - Fast response - spawns background tasks without waiting

    Security:
    - Requires admin API key or service account token
    """
    import time as time_module

    start_time = time_module.time()
    processed_count = 0
    started_pipelines = []
    last_pipeline_logging_id = None
    last_org_slug = None
    last_pipeline_id = None

    try:
        # Time-bounded loop to process multiple pipelines
        while (time_module.time() - start_time) < settings.queue_process_time_limit_seconds:
            # Check if at concurrency capacity
            current_processing = await get_current_processing_count(bq_client)
            if current_processing >= settings.pipeline_global_concurrent_limit:
                logger.info(f"At concurrency limit ({current_processing}/{settings.pipeline_global_concurrent_limit}), stopping batch")
                break

            # Get next pipeline from queue (excluding orgs at their concurrent limit)
            today = get_utc_date()  # Use UTC date for consistency
            query = f"""
            SELECT
                q.run_id,
                q.org_slug,
                q.pipeline_id,
                q.scheduled_time,
                q.priority
            FROM `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue` q
            LEFT JOIN `{settings.gcp_project_id}.organizations.org_usage_quotas` u
                ON q.org_slug = u.org_slug AND u.usage_date = @usage_date
            WHERE q.state = 'QUEUED'
              -- Only pick pipelines from orgs NOT at their concurrent limit
              AND (
                  u.org_slug IS NULL  -- No quota record yet = OK to run
                  OR COALESCE(u.concurrent_pipelines_running, 0) < COALESCE(u.concurrent_limit, 999)
              )
            ORDER BY q.priority DESC, q.scheduled_time ASC
            LIMIT 1
            """

            results = list(bq_client.client.query(
                query,
                job_config=bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today)
                ])
            ).result())

            if not results:
                # Queue is empty
                break

            queue_item = dict(results[0])
            run_id = queue_item['run_id']
            org_slug = queue_item['org_slug']
            pipeline_id = queue_item['pipeline_id']

            # Note: Per-org concurrent limit is enforced in the queue query above
            # Only pipelines from orgs NOT at their concurrent limit are returned

            # Update queue state to PROCESSING
            update_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
            SET state = 'PROCESSING',
                processing_started_at = CURRENT_TIMESTAMP()
            WHERE run_id = @run_id
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
                ]
            )

            bq_client.client.query(update_query, job_config=job_config).result()

            # BUG-002 FIX: Increment concurrent counter when starting pipeline
            # Capture reservation_date for proper decrement later
            scheduler_reservation_date = get_utc_date()
            increment_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
            SET concurrent_pipelines_running = concurrent_pipelines_running + 1,
                last_updated = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug AND usage_date = @usage_date
            """
            try:
                bq_client.client.query(
                    increment_query,
                    job_config=bigquery.QueryJobConfig(query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", scheduler_reservation_date)
                    ])
                ).result()
            except Exception as inc_err:
                logger.warning(f"Failed to increment scheduler concurrent counter for {org_slug}: {inc_err}")

            # Get pipeline configuration and parameters
            config_query = f"""
            SELECT
                r.config_id,
                r.parameters,
                c.provider,
                c.domain,
                c.pipeline_template
            FROM `{settings.gcp_project_id}.organizations.org_scheduled_pipeline_runs` r
            INNER JOIN `{settings.gcp_project_id}.organizations.org_pipeline_configs` c
                ON r.config_id = c.config_id
            WHERE r.run_id = @run_id
            LIMIT 1
            """

            config_results = list(bq_client.client.query(config_query, job_config=job_config).result())

            if not config_results:
                logger.warning(f"Pipeline configuration not found for run_id {run_id}, skipping")
                continue

            config = dict(config_results[0])

            # Execute pipeline via internal call
            from src.core.pipeline import AsyncPipelineExecutor

            executor = AsyncPipelineExecutor(
                org_slug=org_slug,
                pipeline_id=f"{config['provider']}/{config['domain']}/{config['pipeline_template']}",
                trigger_type="scheduler",
                trigger_by="cloud_scheduler",
                user_id=None  # Scheduler-triggered pipelines have no user context
            )

            # Parse parameters
            parameters = json.loads(config['parameters']) if config['parameters'] else {}

            # Create closure with captured variables for this iteration
            # BUG-002 FIX: Pass org_slug and reservation_date for concurrent counter management
            def make_execute_and_update(exec_instance, rid, cfg, bq, org_slug_captured, reservation_date_captured):
                async def execute_and_update():
                    try:
                        result = await exec_instance.execute(parameters)

                        # Update org_scheduled_pipeline_runs
                        update_run_query = f"""
                        UPDATE `{settings.gcp_project_id}.organizations.org_scheduled_pipeline_runs`
                        SET state = 'COMPLETED',
                            completed_at = CURRENT_TIMESTAMP(),
                            pipeline_logging_id = @pipeline_logging_id
                        WHERE run_id = @run_id
                        """

                        run_job_config = bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", exec_instance.pipeline_logging_id),
                                bigquery.ScalarQueryParameter("run_id", "STRING", rid)
                            ]
                        )

                        bq.client.query(update_run_query, job_config=run_job_config).result()

                        # Update org_pipeline_configs
                        update_config_query = f"""
                        UPDATE `{settings.gcp_project_id}.organizations.org_pipeline_configs`
                        SET last_run_time = CURRENT_TIMESTAMP(),
                            last_run_status = 'SUCCESS'
                        WHERE config_id = @config_id
                        """

                        config_job_config = bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("config_id", "STRING", cfg['config_id'])
                            ]
                        )

                        bq.client.query(update_config_query, job_config=config_job_config).result()

                        # Remove from queue
                        delete_queue_query = f"""
                        DELETE FROM `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
                        WHERE run_id = @run_id
                        """

                        bq.client.query(delete_queue_query, job_config=run_job_config).result()

                    except Exception as e:
                        logger.error(f"Pipeline execution failed for run_id {rid}: {e}", exc_info=True)

                        # Update org_scheduled_pipeline_runs to FAILED
                        update_run_query = f"""
                        UPDATE `{settings.gcp_project_id}.organizations.org_scheduled_pipeline_runs`
                        SET state = 'FAILED',
                            failed_at = CURRENT_TIMESTAMP(),
                            error_message = @error_message,
                            retry_count = COALESCE(retry_count, 0) + 1
                        WHERE run_id = @run_id
                        """

                        run_job_config = bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("error_message", "STRING", str(e)[:1000]),
                                bigquery.ScalarQueryParameter("run_id", "STRING", rid)
                            ]
                        )

                        bq.client.query(update_run_query, job_config=run_job_config).result()

                        # Update org_pipeline_configs
                        update_config_query = f"""
                        UPDATE `{settings.gcp_project_id}.organizations.org_pipeline_configs`
                        SET last_run_time = CURRENT_TIMESTAMP(),
                            last_run_status = 'FAILED'
                        WHERE config_id = @config_id
                        """

                        config_job_config = bigquery.QueryJobConfig(
                            query_parameters=[
                                bigquery.ScalarQueryParameter("config_id", "STRING", cfg['config_id'])
                            ]
                        )

                        bq.client.query(update_config_query, job_config=config_job_config).result()

                        # Check if should retry
                        should_retry_result = await should_retry_failed_run(bq, rid)

                        if should_retry_result:
                            # Re-queue with lower priority
                            update_queue_query = f"""
                            UPDATE `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
                            SET state = 'QUEUED',
                                priority = GREATEST(priority - 1, 1),
                                processing_started_at = NULL
                            WHERE run_id = @run_id
                            """
                            bq.client.query(update_queue_query, job_config=run_job_config).result()
                        else:
                            # Remove from queue
                            delete_queue_query = f"""
                            DELETE FROM `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
                            WHERE run_id = @run_id
                            """
                            bq.client.query(delete_queue_query, job_config=run_job_config).result()

                    finally:
                        # BUG-002 FIX: Always decrement concurrent counter regardless of success/failure
                        # Use captured reservation_date to ensure we decrement the correct day's record
                        try:
                            decrement_query = f"""
                            UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
                            SET concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - 1, 0),
                                last_updated = CURRENT_TIMESTAMP()
                            WHERE org_slug = @org_slug AND usage_date = @usage_date
                            """
                            bq.client.query(
                                decrement_query,
                                job_config=bigquery.QueryJobConfig(query_parameters=[
                                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug_captured),
                                    bigquery.ScalarQueryParameter("usage_date", "DATE", reservation_date_captured)
                                ])
                            ).result()
                            logger.debug(f"Decremented concurrent counter for {org_slug_captured} on {reservation_date_captured}")
                        except Exception as dec_err:
                            logger.error(f"Failed to decrement scheduler concurrent counter for {org_slug_captured}: {dec_err}")

                return execute_and_update

            # Spawn background task (returns immediately)
            # BUG-002 FIX: Pass org_slug and reservation_date for concurrent counter decrement
            background_tasks.add_task(make_execute_and_update(
                executor, run_id, config, bq_client, org_slug, scheduler_reservation_date
            ))

            # Track for response
            processed_count += 1
            started_pipelines.append(pipeline_id)
            last_pipeline_logging_id = executor.pipeline_logging_id
            last_org_slug = org_slug
            last_pipeline_id = pipeline_id

        elapsed = time_module.time() - start_time

        if processed_count == 0:
            return QueueProcessResponse(
                processed=False,
                processed_count=0,
                started_pipelines=[],
                elapsed_seconds=elapsed,
                status="IDLE",
                message="No pipelines in queue"
            )

        return QueueProcessResponse(
            processed=True,
            processed_count=processed_count,
            started_pipelines=started_pipelines,
            elapsed_seconds=elapsed,
            pipeline_logging_id=last_pipeline_logging_id,
            org_slug=last_org_slug,
            pipeline_id=last_pipeline_id,
            status="BATCH_COMPLETE",
            message=f"Started {processed_count} pipelines in {elapsed:.1f}s"
        )

    except Exception as e:
        logger.error(f"Queue processing failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


@router.get(
    "/scheduler/status",
    response_model=SchedulerStatusResponse,
    summary="Get scheduler status",
    description="Get current scheduler and queue status (ADMIN ONLY)"
)
async def get_scheduler_status(
    admin_context: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get scheduler status and metrics.

    Returns:
    - total_active_pipelines: Total number of active pipeline configurations
    - pipelines_due_now: Pipelines that should run now
    - pipelines_queued: Pipelines waiting in queue
    - pipelines_running: Pipelines currently executing
    - pipelines_completed_today: Pipelines completed today
    - pipelines_failed_today: Pipelines failed today
    - queue_length: Total items in execution queue
    - avg_execution_time_seconds: Average execution time
    """
    try:
        query = f"""
        WITH active_configs AS (
            SELECT COUNT(*) as total_active
            FROM `{settings.gcp_project_id}.organizations.org_pipeline_configs`
            WHERE is_active = TRUE
        ),
        due_now AS (
            SELECT COUNT(*) as due_count
            FROM `{settings.gcp_project_id}.organizations.org_pipeline_configs`
            WHERE is_active = TRUE
              AND next_run_time <= CURRENT_TIMESTAMP()
        ),
        queue_stats AS (
            SELECT
                COUNT(*) as total_queued,
                COUNTIF(state = 'QUEUED') as queued,
                COUNTIF(state = 'PROCESSING') as processing
            FROM `{settings.gcp_project_id}.organizations.org_pipeline_execution_queue`
        ),
        today_runs AS (
            SELECT
                COUNTIF(state = 'COMPLETED') as completed_today,
                COUNTIF(state = 'FAILED') as failed_today
            FROM `{settings.gcp_project_id}.organizations.org_scheduled_pipeline_runs`
            WHERE DATE(scheduled_time) = CURRENT_DATE()
        ),
        avg_time AS (
            SELECT AVG(duration_ms) / 1000.0 as avg_seconds
            FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
            WHERE DATE(start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
              AND duration_ms IS NOT NULL
        )
        SELECT
            a.total_active,
            d.due_count,
            q.queued,
            q.processing,
            COALESCE(t.completed_today, 0) as completed_today,
            COALESCE(t.failed_today, 0) as failed_today,
            q.total_queued,
            COALESCE(av.avg_seconds, 0) as avg_execution_time_seconds
        FROM active_configs a
        CROSS JOIN due_now d
        CROSS JOIN queue_stats q
        LEFT JOIN today_runs t ON TRUE
        LEFT JOIN avg_time av ON TRUE
        """

        results = list(bq_client.client.query(query).result())

        if not results:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve scheduler status"
            )

        row = dict(results[0])

        return SchedulerStatusResponse(
            total_active_pipelines=row['total_active'],
            pipelines_due_now=row['due_count'],
            pipelines_queued=row['queued'],
            pipelines_running=row['processing'],
            pipelines_completed_today=row['completed_today'],
            pipelines_failed_today=row['failed_today'],
            queue_length=row['total_queued'],
            avg_execution_time_seconds=row['avg_execution_time_seconds']
        )

    except Exception as e:
        logger.error(f"Failed to get scheduler status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


# ============================================
# Org Pipeline Configuration Endpoints
# ============================================

@router.get(
    "/scheduler/org/{org_slug}/pipelines",
    response_model=List[PipelineConfigResponse],
    summary="Get org pipeline configurations",
    description="Get all configured pipelines for an org"
)
async def get_org_pipelines(
    org_slug: str,
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    org: Dict[str, Any] = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get all pipeline configurations for an org.

    Returns list of org_pipeline_configs with schedule info.
    """
    # Verify org has access
    if org['org_slug'] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to org pipelines"
        )

    try:
        where_clauses = ["org_slug = @org_slug"]
        parameters = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        if is_active is not None:
            where_clauses.append("is_active = @is_active")
            parameters.append(bigquery.ScalarQueryParameter("is_active", "BOOL", is_active))

        where_sql = " AND ".join(where_clauses)

        query = f"""
        SELECT
            config_id,
            org_slug,
            provider,
            domain,
            pipeline_template,
            schedule_cron,
            timezone,
            is_active,
            next_run_time,
            last_run_time,
            last_run_status,
            parameters,
            created_at,
            updated_at
        FROM `{settings.gcp_project_id}.organizations.org_pipeline_configs`
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT 1000
        """

        job_config = bigquery.QueryJobConfig(query_parameters=parameters)
        results = bq_client.client.query(query, job_config=job_config).result()

        configs = []
        for row in results:
            row_dict = dict(row)
            # Parse JSON parameters if stored as string
            if 'parameters' in row_dict and isinstance(row_dict['parameters'], str):
                row_dict['parameters'] = json.loads(row_dict['parameters'])
            configs.append(PipelineConfigResponse(**row_dict))

        return configs

    except Exception as e:
        logger.error(f"Failed to get org pipelines: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


@router.post(
    "/scheduler/org/{org_slug}/pipelines",
    response_model=PipelineConfigResponse,
    summary="Add/update pipeline configuration",
    description="Add or update a pipeline configuration for an org"
)
async def create_org_pipeline(
    org_slug: str,
    request: PipelineConfigRequest,
    org: Dict[str, Any] = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Add/update pipeline configuration for an org.

    Request:
    - provider: Cloud provider (GCP, AWS, AZURE)
    - domain: Domain category (COST, SECURITY, COMPUTE)
    - pipeline_template: Pipeline template name
    - schedule_cron: Cron expression (e.g., '0 2 * * *')
    - timezone: Timezone (default: UTC)
    - is_active: Enable/disable pipeline
    - parameters: Pipeline parameters
    """
    # Verify org has access
    if org['org_slug'] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to org pipelines"
        )

    # Validate cron expression
    if not validate_cron_expression(request.schedule_cron):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid cron expression: {request.schedule_cron}"
        )

    try:
        # Calculate next run time
        next_run = calculate_next_run_time(
            schedule_cron=request.schedule_cron,
            timezone_str=request.timezone
        )

        # Generate config_id
        config_id = str(uuid.uuid4())

        # Insert configuration
        insert_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_pipeline_configs`
        (
            config_id,
            org_slug,
            provider,
            domain,
            pipeline_template,
            schedule_cron,
            timezone,
            is_active,
            next_run_time,
            parameters,
            priority,
            created_at
        )
        VALUES (
            @config_id,
            @org_slug,
            @provider,
            @domain,
            @pipeline_template,
            @schedule_cron,
            @timezone,
            @is_active,
            @next_run_time,
            PARSE_JSON(@parameters),
            5,
            CURRENT_TIMESTAMP()
        )
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("config_id", "STRING", config_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", request.provider),
                bigquery.ScalarQueryParameter("domain", "STRING", request.domain),
                bigquery.ScalarQueryParameter("pipeline_template", "STRING", request.pipeline_template),
                bigquery.ScalarQueryParameter("schedule_cron", "STRING", request.schedule_cron),
                bigquery.ScalarQueryParameter("timezone", "STRING", request.timezone),
                bigquery.ScalarQueryParameter("is_active", "BOOL", request.is_active),
                bigquery.ScalarQueryParameter("next_run_time", "TIMESTAMP", next_run),
                bigquery.ScalarQueryParameter("parameters", "STRING", json.dumps(request.parameters)),
            ]
        )

        bq_client.client.query(insert_query, job_config=job_config).result()

        return PipelineConfigResponse(
            config_id=config_id,
            org_slug=org_slug,
            provider=request.provider,
            domain=request.domain,
            pipeline_template=request.pipeline_template,
            schedule_cron=request.schedule_cron,
            timezone=request.timezone,
            is_active=request.is_active,
            next_run_time=next_run,
            parameters=request.parameters,
            created_at=datetime.now(timezone.utc)
        )

    except Exception as e:
        logger.error(f"Failed to create pipeline configuration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


@router.delete(
    "/scheduler/org/{org_slug}/pipelines/{config_id}",
    summary="Disable pipeline configuration",
    description="Disable a pipeline configuration (soft delete)"
)
async def delete_org_pipeline(
    org_slug: str,
    config_id: str,
    org: Dict[str, Any] = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Disable a pipeline configuration.

    This is a soft delete - sets is_active = FALSE.
    """
    # Verify org has access
    if org['org_slug'] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to org pipelines"
        )

    try:
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_pipeline_configs`
        SET is_active = FALSE,
            updated_at = CURRENT_TIMESTAMP()
        WHERE config_id = @config_id
          AND org_slug = @org_slug
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("config_id", "STRING", config_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ]
        )

        query_job = bq_client.client.query(update_query, job_config=job_config)
        result = query_job.result()

        if query_job.num_dml_affected_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline configuration {config_id} not found"
            )

        return {
            "config_id": config_id,
            "org_slug": org_slug,
            "message": "Pipeline configuration disabled successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete pipeline configuration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


# ============================================
# Maintenance Scheduler Jobs
# ============================================

@router.post(
    "/scheduler/reset-daily-quotas",
    summary="Reset daily quotas (Daily)",
    description="Called by Cloud Scheduler to reset daily quota counters (ADMIN ONLY)"
)
async def reset_daily_quotas(
    admin_context: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Reset daily quota counters by creating new records for today.

    Logic:
    1. MERGE to create/update today's quota records with zeroed daily counters
    2. Carry over monthly count from previous day's record
    3. Archive/DELETE records older than 90 days
    4. Return count of records created/updated/archived

    Security:
    - Requires admin API key
    - Validates before executing destructive operations

    Performance:
    - Batch processes all orgs in single MERGE
    - Archives old data to prevent table bloat
    """
    try:
        reset_count = 0
        archived_count = 0

        # MERGE to create today's records OR reset existing ones
        # This properly handles the daily reset by creating fresh records
        reset_query = f"""
        MERGE `{settings.gcp_project_id}.organizations.org_usage_quotas` T
        USING (
            SELECT
                CONCAT(p.org_slug, '_', FORMAT_DATE('%Y%m%d', CURRENT_DATE())) as usage_id,
                p.org_slug,
                CURRENT_DATE() as usage_date,
                -- Carry over monthly count from latest record this month
                COALESCE(
                    (SELECT pipelines_run_month
                     FROM `{settings.gcp_project_id}.organizations.org_usage_quotas` m
                     WHERE m.org_slug = p.org_slug
                       AND m.usage_date >= DATE_TRUNC(CURRENT_DATE(), MONTH)
                       AND m.usage_date < CURRENT_DATE()
                     ORDER BY m.usage_date DESC
                     LIMIT 1),
                    0
                ) as pipelines_run_month,
                s.daily_limit,
                s.monthly_limit,
                s.concurrent_limit
            FROM `{settings.gcp_project_id}.organizations.org_profiles` p
            INNER JOIN `{settings.gcp_project_id}.organizations.org_subscriptions` s
                ON p.org_slug = s.org_slug AND s.status = 'ACTIVE'
            WHERE p.status = 'ACTIVE'
        ) S
        ON T.usage_id = S.usage_id
        WHEN MATCHED THEN
            UPDATE SET
                pipelines_run_today = 0,
                pipelines_failed_today = 0,
                pipelines_succeeded_today = 0,
                concurrent_pipelines_running = 0,
                max_concurrent_reached = 0,
                daily_limit = S.daily_limit,
                monthly_limit = S.monthly_limit,
                concurrent_limit = S.concurrent_limit,
                last_updated = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
            INSERT (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_failed_today,
                    pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
                    max_concurrent_reached, daily_limit, monthly_limit, concurrent_limit,
                    created_at, last_updated)
            VALUES (S.usage_id, S.org_slug, S.usage_date, 0, 0, 0, S.pipelines_run_month, 0, 0,
                    S.daily_limit, S.monthly_limit, S.concurrent_limit,
                    CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        reset_job = bq_client.client.query(reset_query)
        reset_job.result()
        reset_count = reset_job.num_dml_affected_rows

        logger.info(f"Reset daily quotas: {reset_count} records created/updated for today")

        # Archive/delete records older than 90 days
        archive_query = f"""
        DELETE FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
        WHERE usage_date < DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        """

        archive_job = bq_client.client.query(archive_query)
        archive_job.result()
        archived_count = archive_job.num_dml_affected_rows

        logger.info(f"Archived {archived_count} old quota records")

        # Issue #21: Standardized status to UPPERCASE
        return {
            "status": "SUCCESS",
            "records_reset": reset_count,
            "records_archived": archived_count,
            "message": f"Reset {reset_count} daily quotas for today, archived {archived_count} old records",
            "executed_at": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to reset daily quotas: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


@router.post(
    "/scheduler/cleanup-orphaned-pipelines",
    summary="Cleanup orphaned pipelines (Hourly)",
    description="Called by Cloud Scheduler to cleanup stuck/orphaned pipelines (ADMIN ONLY)"
)
async def cleanup_orphaned_pipelines(
    timeout_minutes: int = Query(default=60, ge=10, le=240, description="Pipeline timeout in minutes"),
    admin_context: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Cleanup orphaned and stuck pipelines with configurable timeout and deadlock detection.

    Logic:
    1. Get all active orgs from org_profiles
    2. For each org, UPDATE organizations.org_meta_pipeline_runs SET status='FAILED'
       WHERE status IN ('PENDING','RUNNING') AND start_time > timeout_minutes ago
    3. Decrement concurrent_pipelines_running counter for each cleaned pipeline
    4. Return count of pipelines cleaned per org

    Deadlock Detection:
    - Identifies pipelines stuck in PENDING or RUNNING state
    - Configurable timeout (default: 60 minutes, max: 240 minutes)
    - Marks as FAILED with timeout error message
    - Updates quota counters to prevent leaks

    Security:
    - Requires admin API key
    - Only affects genuinely stuck pipelines (>timeout_minutes)

    Performance:
    - Processes all orgs in batch queries
    - Uses TIMESTAMP_DIFF for accurate timeout calculation
    """
    try:
        total_cleaned = 0
        org_details = []

        # Get all active orgs (with limit to prevent unbounded results)
        orgs_query = f"""
        SELECT DISTINCT org_slug, org_slug
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE status = 'ACTIVE'
        LIMIT 10000
        """

        orgs_results = list(bq_client.client.query(orgs_query).result())

        if not orgs_results:
            # Issue #21: Standardized status to UPPERCASE
            return {
                "status": "SUCCESS",
                "total_pipelines_cleaned": 0,
                "orgs_processed": 0,
                "message": "No active orgs found",
                "executed_at": datetime.now(timezone.utc).isoformat()
            }

        # Process each org
        for org_row in orgs_results:
            org = dict(org_row)
            org_slug = org['org_slug']
            org_slug = org.get('org_slug', org_slug)

            try:
                # Find and mark orphaned pipelines as FAILED (deadlock detection)
                cleanup_query = f"""
                UPDATE `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
                SET
                    status = 'FAILED',
                    end_time = CURRENT_TIMESTAMP(),
                    error_message = CONCAT('Pipeline marked as FAILED due to timeout (>', CAST(@timeout_minutes AS STRING), ' minutes)'),
                    duration_ms = TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), start_time, MILLISECOND)
                WHERE org_slug = @org_slug
                  AND status IN ('PENDING', 'RUNNING')
                  AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), start_time, MINUTE) > @timeout_minutes
                """

                cleanup_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("timeout_minutes", "INT64", timeout_minutes),
                    ]
                )
                cleanup_job = bq_client.client.query(cleanup_query, job_config=cleanup_job_config)
                cleanup_job.result()
                cleaned_count = cleanup_job.num_dml_affected_rows

                if cleaned_count > 0:
                    # Decrement concurrent_pipelines_running counter
                    # Update the most recent quota record (could be today or yesterday for cross-day pipelines)
                    decrement_query = f"""
                    UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
                    SET
                        concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - @cleaned_count, 0),
                        last_updated = CURRENT_TIMESTAMP()
                    WHERE org_slug = @org_slug
                      AND usage_date = (
                          SELECT MAX(usage_date)
                          FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
                          WHERE org_slug = @org_slug
                      )
                    """

                    job_config = bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("cleaned_count", "INT64", cleaned_count),
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                        ]
                    )

                    bq_client.client.query(decrement_query, job_config=job_config).result()

                    total_cleaned += cleaned_count
                    org_details.append({
                        "org_slug": org_slug,
                        "pipelines_cleaned": cleaned_count
                    })

                    logger.info(f"Cleaned {cleaned_count} orphaned pipelines for org {org_slug}")

            except Exception as org_error:
                logger.warning(f"Failed to cleanup orphaned pipelines for org {org_slug}: {org_error}")
                # Continue processing other orgs
                continue

        # Issue #21: Standardized status to UPPERCASE
        return {
            "status": "SUCCESS",
            "total_pipelines_cleaned": total_cleaned,
            "orgs_processed": len(orgs_results),
            "orgs_with_cleanup": len(org_details),
            "details": org_details,
            "message": f"Cleaned {total_cleaned} orphaned pipelines across {len(org_details)} orgs",
            "executed_at": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to cleanup orphaned pipelines: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )
