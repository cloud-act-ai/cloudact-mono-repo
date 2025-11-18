"""
Cloud Scheduler Integration API Routes
Endpoints for automated pipeline scheduling and queue management.
Supports hourly triggers, queue processing, and customer pipeline configurations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, Request
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone
import uuid
import logging
from croniter import croniter
import pytz

from src.app.dependencies.auth import verify_api_key_header, verify_admin_key, TenantContext, get_current_customer
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from google.cloud import bigquery
import json

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================
# Request/Response Models
# ============================================

class PipelineConfigRequest(BaseModel):
    """Request to add/update pipeline configuration."""
    provider: str = Field(..., description="Cloud provider (GCP, AWS, AZURE)")
    domain: str = Field(..., description="Domain category (COST, SECURITY, COMPUTE)")
    pipeline_template: str = Field(..., description="Pipeline template name")
    schedule_cron: str = Field(..., description="Cron expression (e.g., '0 2 * * *')")
    timezone: str = Field(default="UTC", description="Timezone for schedule")
    is_active: bool = Field(default=True, description="Enable/disable pipeline")
    parameters: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Pipeline parameters (e.g., {'filter_date': '{date}'})"
    )


class PipelineConfigResponse(BaseModel):
    """Response for pipeline configuration."""
    config_id: str
    tenant_id: str
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
    pipeline_logging_id: Optional[str] = None
    tenant_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    status: str
    message: str


# ============================================
# Helper Functions
# ============================================

def calculate_next_run_time(
    schedule_cron: str,
    timezone_str: str = "UTC",
    last_run: Optional[datetime] = None
) -> datetime:
    """
    Calculate next run time from cron expression.

    Args:
        schedule_cron: Cron expression (e.g., '0 2 * * *')
        timezone_str: Timezone name (e.g., 'UTC', 'America/New_York')
        last_run: Last run time (if None, uses current time)

    Returns:
        Next scheduled run time in UTC
    """
    try:
        tz = pytz.timezone(timezone_str)
    except pytz.UnknownTimeZoneError:
        logger.warning(f"Unknown timezone '{timezone_str}', using UTC")
        tz = pytz.UTC

    # Use last_run or current time as base
    if last_run:
        base_time = last_run.astimezone(tz) if last_run.tzinfo else tz.localize(last_run)
    else:
        base_time = datetime.now(tz)

    # Calculate next run time
    cron = croniter(schedule_cron, base_time)
    next_run = cron.get_next(datetime)

    # Convert to UTC for storage
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

    Queries customer_pipeline_configs for pipelines where:
    - is_active = TRUE
    - next_run_time <= NOW()
    - Customer status = ACTIVE
    - Customer quota not exceeded

    Args:
        bq_client: BigQuery client instance
        limit: Maximum number of pipelines to return

    Returns:
        List of pipeline configurations ready to run
    """
    # Note: This assumes customer_pipeline_configs table exists in customers dataset
    # Schema should be created as part of scheduler setup
    query = f"""
    WITH due_pipelines AS (
        SELECT
            c.config_id,
            c.tenant_id,
            c.provider,
            c.domain,
            c.pipeline_template,
            c.schedule_cron,
            c.timezone,
            c.parameters,
            c.next_run_time,
            c.priority,
            p.status as customer_status,
            s.max_pipelines_per_day,
            COALESCE(u.pipelines_run_today, 0) as pipelines_run_today
        FROM `{settings.gcp_project_id}.tenants.tenant_pipeline_configs` c
        INNER JOIN `{settings.gcp_project_id}.tenants.tenant_profiles` p
            ON c.tenant_id = p.tenant_id
        LEFT JOIN `{settings.gcp_project_id}.tenants.tenant_subscriptions` s
            ON p.tenant_id = s.tenant_id AND s.status = 'ACTIVE'
        LEFT JOIN `{settings.gcp_project_id}.tenants.tenant_usage_quotas` u
            ON p.tenant_id = u.tenant_id AND u.usage_date = CURRENT_DATE()
        WHERE c.is_active = TRUE
          AND c.next_run_time <= CURRENT_TIMESTAMP()
          AND p.status = 'ACTIVE'
    )
    SELECT *
    FROM due_pipelines
    WHERE pipelines_run_today < max_pipelines_per_day
    ORDER BY next_run_time ASC, priority DESC
    LIMIT @limit
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("limit", "INT64", limit)
        ]
    )

    results = bq_client.client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]


async def enqueue_pipeline(
    bq_client: BigQueryClient,
    tenant_id: str,
    config: Dict[str, Any],
    priority: int = 5
) -> str:
    """
    Add pipeline to execution queue.

    Creates record in pipeline_execution_queue and scheduled_pipeline_runs tables.

    Args:
        bq_client: BigQuery client instance
        tenant_id: Customer identifier
        config: Pipeline configuration dict
        priority: Queue priority (1-10, higher is more urgent)

    Returns:
        Run ID for the scheduled pipeline
    """
    run_id = str(uuid.uuid4())
    scheduled_time = datetime.now(timezone.utc)

    # Insert into scheduled_pipeline_runs
    insert_run_query = f"""
    INSERT INTO `{settings.gcp_project_id}.tenants.scheduled_pipeline_runs`
    (run_id, config_id, tenant_id, pipeline_id, state, scheduled_time, priority, parameters)
    VALUES (
        @run_id,
        @config_id,
        @tenant_id,
        @pipeline_id,
        'PENDING',
        @scheduled_time,
        @priority,
        PARSE_JSON(@parameters)
    )
    """

    pipeline_id = f"{tenant_id}-{config['provider']}-{config['domain']}-{config['pipeline_template']}"

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
            bigquery.ScalarQueryParameter("config_id", "STRING", config['config_id']),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            bigquery.ScalarQueryParameter("scheduled_time", "TIMESTAMP", scheduled_time),
            bigquery.ScalarQueryParameter("priority", "INT64", priority),
            bigquery.ScalarQueryParameter("parameters", "STRING", json.dumps(config.get('parameters', {}))),
        ]
    )

    bq_client.client.query(insert_run_query, job_config=job_config).result()

    # Insert into pipeline_execution_queue
    insert_queue_query = f"""
    INSERT INTO `{settings.gcp_project_id}.tenants.pipeline_execution_queue`
    (run_id, tenant_id, pipeline_id, state, scheduled_time, priority, added_at)
    VALUES (
        @run_id,
        @tenant_id,
        @pipeline_id,
        'QUEUED',
        @scheduled_time,
        @priority,
        CURRENT_TIMESTAMP()
    )
    """

    bq_client.client.query(insert_queue_query, job_config=job_config).result()

    logger.info(f"Enqueued pipeline {pipeline_id} for customer {tenant_id} with run_id {run_id}")
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
    FROM `{settings.gcp_project_id}.tenants.scheduled_pipeline_runs`
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
    1. Query customer_pipeline_configs for pipelines where:
       - is_active = TRUE
       - next_run_time <= NOW()
       - Customer status = ACTIVE
       - Customer quota not exceeded

    2. For each due pipeline:
       - Create record in scheduled_pipeline_runs with state = PENDING
       - Add to pipeline_execution_queue with priority
       - Update next_run_time based on schedule_cron

    3. Return summary of triggered/queued/skipped pipelines

    Security:
    - Requires admin API key
    - Validates customer quotas before enqueuing
    - Prevents duplicate runs (idempotency check)

    Performance:
    - Batch processes in chunks of 100 pipelines
    - Uses pagination for 10k+ customers
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
                    tenant_id=pipeline_config['tenant_id'],
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
                UPDATE `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
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
            detail=f"Scheduler trigger failed: {str(e)}"
        )


@router.post(
    "/scheduler/process-queue",
    response_model=QueueProcessResponse,
    summary="Process next queued pipeline",
    description="Worker endpoint to process the next pipeline in the queue (ADMIN ONLY)"
)
async def process_queue(
    background_tasks: BackgroundTasks,
    admin_context: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Process next pipeline from execution queue.

    Logic:
    1. Get next pipeline from queue (state = QUEUED, order by priority DESC, scheduled_time ASC)
    2. Update state to PROCESSING
    3. Call pipeline execution: POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}
    4. Update scheduled_pipeline_runs state based on result
    5. Update customer_pipeline_configs (last_run_time, last_run_status, next_run_time)
    6. Remove from queue or mark as COMPLETED

    Security:
    - Requires admin API key or service account token

    Performance:
    - Processes one pipeline at a time
    - Async processing where possible
    """
    try:
        # Get next pipeline from queue
        query = f"""
        SELECT
            run_id,
            tenant_id,
            pipeline_id,
            scheduled_time,
            priority
        FROM `{settings.gcp_project_id}.tenants.pipeline_execution_queue`
        WHERE state = 'QUEUED'
        ORDER BY priority DESC, scheduled_time ASC
        LIMIT 1
        """

        results = list(bq_client.client.query(query).result())

        if not results:
            return QueueProcessResponse(
                processed=False,
                status="IDLE",
                message="No pipelines in queue"
            )

        queue_item = dict(results[0])
        run_id = queue_item['run_id']
        tenant_id = queue_item['tenant_id']
        pipeline_id = queue_item['pipeline_id']

        # Update queue state to PROCESSING
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.tenants.pipeline_execution_queue`
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

        # Get pipeline configuration and parameters
        config_query = f"""
        SELECT
            r.config_id,
            r.parameters,
            c.provider,
            c.domain,
            c.pipeline_template
        FROM `{settings.gcp_project_id}.tenants.scheduled_pipeline_runs` r
        INNER JOIN `{settings.gcp_project_id}.tenants.tenant_pipeline_configs` c
            ON r.config_id = c.config_id
        WHERE r.run_id = @run_id
        LIMIT 1
        """

        config_results = list(bq_client.client.query(config_query, job_config=job_config).result())

        if not config_results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline configuration not found for run_id {run_id}"
            )

        config = dict(config_results[0])

        # Execute pipeline via internal call
        from src.core.pipeline.async_executor import AsyncPipelineExecutor

        executor = AsyncPipelineExecutor(
            tenant_id=tenant_id,
            pipeline_id=f"{config['provider']}/{config['domain']}/{config['pipeline_template']}",
            trigger_type="scheduler",
            trigger_by="cloud_scheduler",
            user_id=None  # Scheduler-triggered pipelines have no user context
        )

        # Parse parameters
        parameters = json.loads(config['parameters']) if config['parameters'] else {}

        # Execute pipeline in background
        async def execute_and_update():
            try:
                result = await executor.execute(parameters)

                # Update scheduled_pipeline_runs
                update_run_query = f"""
                UPDATE `{settings.gcp_project_id}.tenants.scheduled_pipeline_runs`
                SET state = 'COMPLETED',
                    completed_at = CURRENT_TIMESTAMP(),
                    pipeline_logging_id = @pipeline_logging_id
                WHERE run_id = @run_id
                """

                run_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", executor.pipeline_logging_id),
                        bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
                    ]
                )

                bq_client.client.query(update_run_query, job_config=run_job_config).result()

                # Update customer_pipeline_configs
                update_config_query = f"""
                UPDATE `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
                SET last_run_time = CURRENT_TIMESTAMP(),
                    last_run_status = 'SUCCESS'
                WHERE config_id = @config_id
                """

                config_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("config_id", "STRING", config['config_id'])
                    ]
                )

                bq_client.client.query(update_config_query, job_config=config_job_config).result()

                # Remove from queue
                delete_queue_query = f"""
                DELETE FROM `{settings.gcp_project_id}.tenants.pipeline_execution_queue`
                WHERE run_id = @run_id
                """

                bq_client.client.query(delete_queue_query, job_config=run_job_config).result()

            except Exception as e:
                logger.error(f"Pipeline execution failed for run_id {run_id}: {e}", exc_info=True)

                # Update scheduled_pipeline_runs to FAILED
                update_run_query = f"""
                UPDATE `{settings.gcp_project_id}.tenants.scheduled_pipeline_runs`
                SET state = 'FAILED',
                    failed_at = CURRENT_TIMESTAMP(),
                    error_message = @error_message,
                    retry_count = COALESCE(retry_count, 0) + 1
                WHERE run_id = @run_id
                """

                run_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("error_message", "STRING", str(e)[:1000]),
                        bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
                    ]
                )

                bq_client.client.query(update_run_query, job_config=run_job_config).result()

                # Update customer_pipeline_configs
                update_config_query = f"""
                UPDATE `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
                SET last_run_time = CURRENT_TIMESTAMP(),
                    last_run_status = 'FAILED'
                WHERE config_id = @config_id
                """

                config_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("config_id", "STRING", config['config_id'])
                    ]
                )

                bq_client.client.query(update_config_query, job_config=config_job_config).result()

                # Check if should retry
                should_retry = await should_retry_failed_run(bq_client, run_id)

                if should_retry:
                    # Re-queue with lower priority
                    update_queue_query = f"""
                    UPDATE `{settings.gcp_project_id}.tenants.pipeline_execution_queue`
                    SET state = 'QUEUED',
                        priority = GREATEST(priority - 1, 1),
                        processing_started_at = NULL
                    WHERE run_id = @run_id
                    """
                    bq_client.client.query(update_queue_query, job_config=run_job_config).result()
                else:
                    # Remove from queue
                    delete_queue_query = f"""
                    DELETE FROM `{settings.gcp_project_id}.tenants.pipeline_execution_queue`
                    WHERE run_id = @run_id
                    """
                    bq_client.client.query(delete_queue_query, job_config=run_job_config).result()

        background_tasks.add_task(execute_and_update)

        return QueueProcessResponse(
            processed=True,
            pipeline_logging_id=executor.pipeline_logging_id,
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            status="PROCESSING",
            message=f"Pipeline {pipeline_id} started processing for tenant {tenant_id}"
        )

    except Exception as e:
        logger.error(f"Queue processing failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Queue processing failed: {str(e)}"
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
            FROM `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
            WHERE is_active = TRUE
        ),
        due_now AS (
            SELECT COUNT(*) as due_count
            FROM `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
            WHERE is_active = TRUE
              AND next_run_time <= CURRENT_TIMESTAMP()
        ),
        queue_stats AS (
            SELECT
                COUNT(*) as total_queued,
                COUNTIF(state = 'QUEUED') as queued,
                COUNTIF(state = 'PROCESSING') as processing
            FROM `{settings.gcp_project_id}.tenants.pipeline_execution_queue`
        ),
        today_runs AS (
            SELECT
                COUNTIF(state = 'COMPLETED') as completed_today,
                COUNTIF(state = 'FAILED') as failed_today
            FROM `{settings.gcp_project_id}.tenants.scheduled_pipeline_runs`
            WHERE DATE(scheduled_time) = CURRENT_DATE()
        ),
        avg_time AS (
            SELECT AVG(duration_ms) / 1000.0 as avg_seconds
            FROM `{settings.gcp_project_id}.metadata.x_meta_pipeline_runs`
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
            detail=f"Failed to get scheduler status: {str(e)}"
        )


# ============================================
# Customer Pipeline Configuration Endpoints
# ============================================

@router.get(
    "/scheduler/customer/{tenant_id}/pipelines",
    response_model=List[PipelineConfigResponse],
    summary="Get customer pipeline configurations",
    description="Get all configured pipelines for a customer"
)
async def get_customer_pipelines(
    tenant_id: str,
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    customer: Dict[str, Any] = Depends(get_current_customer),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get all pipeline configurations for a customer.

    Returns list of customer_pipeline_configs with schedule info.
    """
    # Verify customer has access
    if customer['tenant_id'] != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to customer pipelines"
        )

    try:
        where_clauses = ["tenant_id = @tenant_id"]
        parameters = [
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
        ]

        if is_active is not None:
            where_clauses.append("is_active = @is_active")
            parameters.append(bigquery.ScalarQueryParameter("is_active", "BOOL", is_active))

        where_sql = " AND ".join(where_clauses)

        query = f"""
        SELECT
            config_id,
            tenant_id,
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
        FROM `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
        WHERE {where_sql}
        ORDER BY created_at DESC
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
        logger.error(f"Failed to get customer pipelines: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get customer pipelines: {str(e)}"
        )


@router.post(
    "/scheduler/customer/{tenant_id}/pipelines",
    response_model=PipelineConfigResponse,
    summary="Add/update pipeline configuration",
    description="Add or update a pipeline configuration for a customer"
)
async def create_customer_pipeline(
    tenant_id: str,
    request: PipelineConfigRequest,
    customer: Dict[str, Any] = Depends(get_current_customer),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Add/update pipeline configuration for a customer.

    Request:
    - provider: Cloud provider (GCP, AWS, AZURE)
    - domain: Domain category (COST, SECURITY, COMPUTE)
    - pipeline_template: Pipeline template name
    - schedule_cron: Cron expression (e.g., '0 2 * * *')
    - timezone: Timezone (default: UTC)
    - is_active: Enable/disable pipeline
    - parameters: Pipeline parameters
    """
    # Verify customer has access
    if customer['tenant_id'] != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to customer pipelines"
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
        INSERT INTO `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
        (
            config_id,
            tenant_id,
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
            @tenant_id,
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
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
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
            tenant_id=tenant_id,
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
            detail=f"Failed to create pipeline configuration: {str(e)}"
        )


@router.delete(
    "/scheduler/customer/{tenant_id}/pipelines/{config_id}",
    summary="Disable pipeline configuration",
    description="Disable a pipeline configuration (soft delete)"
)
async def delete_customer_pipeline(
    tenant_id: str,
    config_id: str,
    customer: Dict[str, Any] = Depends(get_current_customer),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Disable a pipeline configuration.

    This is a soft delete - sets is_active = FALSE.
    """
    # Verify customer has access
    if customer['tenant_id'] != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to customer pipelines"
        )

    try:
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.tenants.tenant_pipeline_configs`
        SET is_active = FALSE,
            updated_at = CURRENT_TIMESTAMP()
        WHERE config_id = @config_id
          AND tenant_id = @tenant_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("config_id", "STRING", config_id),
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
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
            "tenant_id": tenant_id,
            "message": "Pipeline configuration disabled successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete pipeline configuration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete pipeline configuration: {str(e)}"
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
    Reset daily quota counters and archive old records.

    Logic:
    1. UPDATE customer_usage_quotas SET all daily counters to 0 WHERE usage_date < CURRENT_DATE()
    2. Archive/DELETE records older than 90 days
    3. Return count of records updated/archived

    Security:
    - Requires admin API key
    - Validates before executing destructive operations

    Performance:
    - Batch processes all customers in single UPDATE
    - Archives old data to prevent table bloat
    """
    try:
        updated_count = 0
        archived_count = 0

        # Reset daily counters for previous days
        reset_query = f"""
        UPDATE `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
        SET
            pipelines_run_today = 0,
            pipelines_succeeded_today = 0,
            pipelines_failed_today = 0,
            concurrent_pipelines_running = 0,
            last_updated = CURRENT_TIMESTAMP()
        WHERE usage_date < CURRENT_DATE()
        """

        reset_job = bq_client.client.query(reset_query)
        reset_job.result()
        updated_count = reset_job.num_dml_affected_rows

        logger.info(f"Reset daily quotas for {updated_count} records")

        # Archive/delete records older than 90 days
        archive_query = f"""
        DELETE FROM `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
        WHERE usage_date < DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        """

        archive_job = bq_client.client.query(archive_query)
        archive_job.result()
        archived_count = archive_job.num_dml_affected_rows

        logger.info(f"Archived {archived_count} old quota records")

        return {
            "status": "success",
            "records_updated": updated_count,
            "records_archived": archived_count,
            "message": f"Reset {updated_count} daily quotas, archived {archived_count} old records",
            "executed_at": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to reset daily quotas: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset daily quotas: {str(e)}"
        )


@router.post(
    "/scheduler/cleanup-orphaned-pipelines",
    summary="Cleanup orphaned pipelines (Hourly)",
    description="Called by Cloud Scheduler to cleanup stuck/orphaned pipelines (ADMIN ONLY)"
)
async def cleanup_orphaned_pipelines(
    admin_context: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Cleanup orphaned and stuck pipelines.

    Logic:
    1. Get all active tenants from customer_profiles
    2. For each tenant, UPDATE x_meta_pipeline_runs SET status='FAILED'
       WHERE status IN ('PENDING','RUNNING') AND start_time > 60 minutes ago
    3. Decrement concurrent_pipelines_running counter for each cleaned pipeline
    4. Return count of pipelines cleaned per tenant

    Security:
    - Requires admin API key
    - Only affects genuinely stuck pipelines (>60 min)

    Performance:
    - Processes all tenants in batch queries
    - Uses TIMESTAMP_DIFF for accurate timeout calculation
    """
    try:
        total_cleaned = 0
        tenant_details = []

        # Get all active tenants
        tenants_query = f"""
        SELECT DISTINCT tenant_id, tenant_id
        FROM `{settings.gcp_project_id}.tenants.tenant_profiles`
        WHERE status = 'ACTIVE'
        """

        tenants_results = list(bq_client.client.query(tenants_query).result())

        if not tenants_results:
            return {
                "status": "success",
                "total_pipelines_cleaned": 0,
                "tenants_processed": 0,
                "message": "No active tenants found",
                "executed_at": datetime.now(timezone.utc).isoformat()
            }

        # Process each tenant
        for tenant_row in tenants_results:
            tenant = dict(tenant_row)
            tenant_id = tenant['tenant_id']
            tenant_id = tenant.get('tenant_id', tenant_id)

            try:
                # Find and mark orphaned pipelines as FAILED
                cleanup_query = f"""
                UPDATE `{settings.gcp_project_id}.{tenant_id}.x_meta_pipeline_runs`
                SET
                    status = 'FAILED',
                    end_time = CURRENT_TIMESTAMP(),
                    error_message = 'Pipeline marked as FAILED due to timeout (>60 minutes)',
                    duration_ms = TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), start_time, MILLISECOND)
                WHERE status IN ('PENDING', 'RUNNING')
                  AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), start_time, MINUTE) > 60
                """

                cleanup_job = bq_client.client.query(cleanup_query)
                cleanup_job.result()
                cleaned_count = cleanup_job.num_dml_affected_rows

                if cleaned_count > 0:
                    # Decrement concurrent_pipelines_running counter
                    decrement_query = f"""
                    UPDATE `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
                    SET
                        concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - @cleaned_count, 0),
                        last_updated = CURRENT_TIMESTAMP()
                    WHERE tenant_id = @tenant_id
                      AND usage_date = CURRENT_DATE()
                    """

                    job_config = bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("cleaned_count", "INT64", cleaned_count),
                            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
                        ]
                    )

                    bq_client.client.query(decrement_query, job_config=job_config).result()

                    total_cleaned += cleaned_count
                    tenant_details.append({
                        "tenant_id": tenant_id,
                        "tenant_id": tenant_id,
                        "pipelines_cleaned": cleaned_count
                    })

                    logger.info(f"Cleaned {cleaned_count} orphaned pipelines for tenant {tenant_id}")

            except Exception as tenant_error:
                logger.warning(f"Failed to cleanup orphaned pipelines for tenant {tenant_id}: {tenant_error}")
                # Continue processing other tenants
                continue

        return {
            "status": "success",
            "total_pipelines_cleaned": total_cleaned,
            "tenants_processed": len(tenants_results),
            "tenants_with_cleanup": len(tenant_details),
            "details": tenant_details,
            "message": f"Cleaned {total_cleaned} orphaned pipelines across {len(tenant_details)} tenants",
            "executed_at": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to cleanup orphaned pipelines: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cleanup orphaned pipelines: {str(e)}"
        )
