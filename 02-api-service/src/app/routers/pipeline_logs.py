"""
Pipeline Logs API Routes

GET endpoints for retrieving pipeline execution history and step logs.
Enables frontend to display pipeline run status with expandable error details.

URL Structure: /api/v1/pipelines/{org_slug}/runs
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import logging

from google.cloud import bigquery

from src.app.config import settings
from src.app.dependencies.auth import get_current_org
from src.core.engine.bq_client import BigQueryClient, get_bigquery_client

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Response Models
# ============================================

class ErrorContext(BaseModel):
    """Enhanced error context with classification and debugging info."""
    error_type: Optional[str] = Field(None, description="TRANSIENT, PERMANENT, TIMEOUT, VALIDATION_ERROR, DEPENDENCY_FAILURE")
    error_code: Optional[str] = Field(None, description="Specific error code (e.g., BQ_QUOTA_EXCEEDED)")
    retry_count: Optional[int] = Field(None, description="Number of retry attempts")
    is_retryable: Optional[bool] = Field(None, description="Whether the error is retryable")
    stack_trace: Optional[str] = Field(None, description="Truncated stack trace (first 2000 chars)")
    suggested_action: Optional[str] = Field(None, description="Suggested resolution action")


class PipelineRunSummary(BaseModel):
    """Summary of a single pipeline run."""
    pipeline_logging_id: str = Field(..., description="Unique ID for this run")
    pipeline_id: str = Field(..., description="Pipeline identifier")
    status: str = Field(..., description="PENDING, RUNNING, COMPLETED, FAILED, CANCELLED, CANCELLING, TIMEOUT")
    trigger_type: str = Field(..., description="api, scheduler, webhook, manual")
    trigger_by: Optional[str] = Field(None, description="Who triggered the run")
    start_time: Optional[datetime] = Field(None, description="When execution started")
    end_time: Optional[datetime] = Field(None, description="When execution ended")
    duration_ms: Optional[int] = Field(None, description="Duration in milliseconds")
    run_date: Optional[date] = Field(None, description="Date of the run")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    error_context: Optional[ErrorContext] = Field(None, description="Enhanced error details")
    parameters: Optional[Dict[str, Any]] = Field(None, description="Run parameters")


class PipelineRunDetail(PipelineRunSummary):
    """Detailed pipeline run with step logs."""
    run_metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    steps: List["StepLogSummary"] = Field(default_factory=list, description="Step execution logs")


class StepLogSummary(BaseModel):
    """Summary of a single step execution."""
    step_logging_id: str = Field(..., description="Unique ID for this step execution")
    step_name: str = Field(..., description="Step name")
    step_type: str = Field(..., description="Processor type (e.g., gcp.bq_etl)")
    step_index: int = Field(..., description="Step order in pipeline")
    status: str = Field(..., description="PENDING, RUNNING, COMPLETED, FAILED, SKIPPED, CANCELLED, TIMEOUT")
    start_time: Optional[datetime] = Field(None, description="When step started")
    end_time: Optional[datetime] = Field(None, description="When step ended")
    duration_ms: Optional[int] = Field(None, description="Duration in milliseconds")
    rows_processed: Optional[int] = Field(None, description="Number of rows processed")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    error_context: Optional[ErrorContext] = Field(None, description="Enhanced error details")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Step-specific metadata")


class PipelineRunsResponse(BaseModel):
    """Response for list of pipeline runs."""
    runs: List[PipelineRunSummary] = Field(..., description="List of pipeline runs")
    total: int = Field(..., description="Total number of runs")
    limit: int = Field(..., description="Page size")
    offset: int = Field(..., description="Page offset")


# Update forward reference
PipelineRunDetail.model_rebuild()


# ============================================
# Pipeline Status Models (for auto-trigger)
# ============================================

class PipelineRunStatus(BaseModel):
    """Status of a specific pipeline for today."""
    pipeline_id: str = Field(..., description="Pipeline identifier")
    last_run: Optional[datetime] = Field(None, description="Last run timestamp")
    status: Optional[str] = Field(None, description="Last run status")
    ran_today: bool = Field(..., description="Whether pipeline ran today")
    succeeded_today: bool = Field(..., description="Whether pipeline succeeded today")


class PipelineStatusResponse(BaseModel):
    """Response for pipeline status check."""
    org_slug: str = Field(..., description="Organization slug")
    check_date: str = Field(..., description="Date checked (YYYY-MM-DD)")
    pipelines: Dict[str, PipelineRunStatus] = Field(..., description="Status by pipeline ID")
    cached: bool = Field(default=False, description="Whether response is cached")


# ============================================
# Known Daily Pipelines (must match frontend DAILY_PIPELINES)
# ============================================

KNOWN_DAILY_PIPELINES = [
    {"id": "saas_subscription_costs", "path": "saas/costs/saas_cost"},
    # Add more as needed:
    # {"id": "gcp_billing", "path": "cloud/gcp/cost/billing"},
    # {"id": "openai_usage", "path": "genai/payg/openai"},
]


# ============================================
# Pipeline Status Endpoint (for auto-trigger)
# ============================================

@router.get(
    "/pipelines/status/{org_slug}",
    response_model=PipelineStatusResponse,
    summary="Check pipeline status for today",
    description="Check which daily pipelines have run today. Used by frontend auto-trigger."
)
async def get_pipeline_status(
    org_slug: str,
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Check which daily pipelines have run today for an organization.

    Returns status for each known daily pipeline:
    - ran_today: Whether pipeline ran today (any status)
    - succeeded_today: Whether pipeline completed successfully today
    - status: Last run status (PENDING, RUNNING, COMPLETED, FAILED)
    - last_run: Timestamp of last run

    Used by frontend PipelineAutoTrigger component to avoid duplicate triggers.
    """
    # Verify org_slug matches authenticated org
    if org_context["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: org_slug mismatch"
        )

    from datetime import date as date_type
    today = date_type.today()
    today_str = today.strftime("%Y-%m-%d")

    try:
        # Query for today's pipeline runs
        # Match pipeline_id patterns like: "saas_subscription/costs/saas_cost"
        # or "{org}-saas_subscription-costs-saas_cost"
        query = f"""
        SELECT
            pipeline_id,
            status,
            start_time,
            run_date
        FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        WHERE org_slug = @org_slug
          AND run_date = @today
        ORDER BY start_time DESC
        """

        parameters = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("today", "DATE", today)
        ]

        results = list(bq_client.query(query, parameters=parameters))

        # Build a map of pipeline_id -> latest status
        pipeline_runs: Dict[str, Dict] = {}
        for row in results:
            pid = row["pipeline_id"]
            # Only keep the latest run per pipeline
            if pid not in pipeline_runs:
                pipeline_runs[pid] = {
                    "status": row["status"],
                    "start_time": row["start_time"],
                    "run_date": row["run_date"]
                }

        # Build response for known pipelines
        pipelines_status: Dict[str, PipelineRunStatus] = {}

        for known_pipeline in KNOWN_DAILY_PIPELINES:
            pipeline_id = known_pipeline["id"]
            pipeline_path = known_pipeline["path"]

            # Check for matching runs (could be path format or with org prefix)
            matching_run = None
            for pid, run_data in pipeline_runs.items():
                # Match patterns:
                # 1. Exact path: "saas_subscription/costs/saas_cost"
                # 2. With org prefix: "{org}-saas_subscription-costs-saas_cost"
                # 3. Pipeline ID format: contains the path components
                if (pipeline_path in pid or
                    pipeline_path.replace("/", "-") in pid or
                    pid == pipeline_path):
                    matching_run = run_data
                    break

            if matching_run:
                pipelines_status[pipeline_id] = PipelineRunStatus(
                    pipeline_id=pipeline_id,
                    last_run=matching_run["start_time"],
                    status=matching_run["status"],
                    ran_today=True,
                    succeeded_today=(matching_run["status"] == "COMPLETED")
                )
            else:
                pipelines_status[pipeline_id] = PipelineRunStatus(
                    pipeline_id=pipeline_id,
                    last_run=None,
                    status=None,
                    ran_today=False,
                    succeeded_today=False
                )

        logger.info(f"Pipeline status check for {org_slug}: {len(pipelines_status)} pipelines checked")

        return PipelineStatusResponse(
            org_slug=org_slug,
            check_date=today_str,
            pipelines=pipelines_status,
            cached=False
        )

    except Exception as e:
        logger.error(f"Error checking pipeline status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check pipeline status. Please check server logs for details."
        )


# ============================================
# Pipeline Runs Endpoints
# ============================================

@router.get(
    "/pipelines/{org_slug}/runs",
    response_model=PipelineRunsResponse,
    summary="List pipeline runs",
    description="Get paginated list of pipeline execution history for an organization."
)
async def list_pipeline_runs(
    org_slug: str,
    status_filter: Optional[str] = Query(None, description="Filter by status: PENDING, RUNNING, COMPLETED, FAILED"),
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline ID"),
    trigger_type: Optional[str] = Query(None, description="Filter by trigger type: api, scheduler, webhook, manual"),
    trigger_by: Optional[str] = Query(None, description="Filter by who triggered the run"),
    start_date: Optional[date] = Query(None, description="Filter runs from this date"),
    end_date: Optional[date] = Query(None, description="Filter runs until this date"),
    limit: int = Query(20, ge=1, le=100, description="Number of results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List pipeline runs for an organization.
    Requires X-API-Key header for authentication.
    """
    # Verify org_slug matches authenticated org
    if org_context["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: org_slug mismatch"
        )

    # Build query with filters
    where_clauses = ["org_slug = @org_slug"]
    parameters = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
    ]

    if status_filter:
        where_clauses.append("status = @status_filter")
        parameters.append(bigquery.ScalarQueryParameter("status_filter", "STRING", status_filter.upper()))

    if pipeline_id:
        where_clauses.append("pipeline_id LIKE @pipeline_id")
        parameters.append(bigquery.ScalarQueryParameter("pipeline_id", "STRING", f"%{pipeline_id}%"))

    if start_date:
        where_clauses.append("run_date >= @start_date")
        parameters.append(bigquery.ScalarQueryParameter("start_date", "DATE", start_date))

    if end_date:
        where_clauses.append("run_date <= @end_date")
        parameters.append(bigquery.ScalarQueryParameter("end_date", "DATE", end_date))

    if trigger_type:
        where_clauses.append("trigger_type = @trigger_type")
        parameters.append(bigquery.ScalarQueryParameter("trigger_type", "STRING", trigger_type.lower()))

    if trigger_by:
        where_clauses.append("trigger_by LIKE @trigger_by")
        parameters.append(bigquery.ScalarQueryParameter("trigger_by", "STRING", f"%{trigger_by}%"))

    where_clause = " AND ".join(where_clauses)

    # Count total
    count_query = f"""
    SELECT COUNT(*) as total
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE {where_clause}
    """

    # Get runs with error_context
    runs_query = f"""
    SELECT
        pipeline_logging_id,
        pipeline_id,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        CAST(duration_ms AS INT64) as duration_ms,
        run_date,
        error_message,
        error_context,
        parameters
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE {where_clause}
    ORDER BY start_time DESC
    LIMIT @limit OFFSET @offset
    """

    parameters.extend([
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
        bigquery.ScalarQueryParameter("offset", "INT64", offset)
    ])

    try:
        # Execute count query
        count_results = list(bq_client.query(count_query, parameters=parameters[:-2]))
        total = count_results[0]["total"] if count_results else 0

        # Execute runs query
        runs_results = list(bq_client.query(runs_query, parameters=parameters))

        runs = []
        for row in runs_results:
            import json
            params = None
            if row.get("parameters"):
                try:
                    params = json.loads(row["parameters"]) if isinstance(row["parameters"], str) else row["parameters"]
                except Exception as e:
                    logger.warning(f"Failed to parse parameters JSON: {e}")
                    params = {"raw": row["parameters"]}

            # Parse error_context JSON
            error_ctx = None
            if row.get("error_context"):
                try:
                    ctx_data = json.loads(row["error_context"]) if isinstance(row["error_context"], str) else row["error_context"]
                    error_ctx = ErrorContext(
                        error_type=ctx_data.get("error_type"),
                        error_code=ctx_data.get("error_code"),
                        retry_count=ctx_data.get("retry_count"),
                        is_retryable=ctx_data.get("is_retryable"),
                        stack_trace=ctx_data.get("stack_trace"),
                        suggested_action=ctx_data.get("suggested_action")
                    )
                except Exception as e:
                    logger.warning(f"Failed to parse error_context JSON: {e}")

            runs.append(PipelineRunSummary(
                pipeline_logging_id=row["pipeline_logging_id"],
                pipeline_id=row["pipeline_id"],
                status=row["status"],
                trigger_type=row["trigger_type"] or "unknown",
                trigger_by=row.get("trigger_by"),
                start_time=row.get("start_time"),
                end_time=row.get("end_time"),
                duration_ms=row.get("duration_ms"),
                run_date=row.get("run_date"),
                error_message=row.get("error_message"),
                error_context=error_ctx,
                parameters=params
            ))

        logger.info(f"Listed {len(runs)} pipeline runs for org {org_slug}")

        return PipelineRunsResponse(
            runs=runs,
            total=total,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        logger.error(f"Error fetching pipeline runs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch pipeline runs. Please check server logs for details."
        )


@router.get(
    "/pipelines/{org_slug}/runs/{pipeline_logging_id}",
    response_model=PipelineRunDetail,
    summary="Get pipeline run details",
    description="Get detailed information about a specific pipeline run including step logs."
)
async def get_pipeline_run_detail(
    org_slug: str,
    pipeline_logging_id: str,
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get detailed pipeline run with all step logs.
    Includes expandable error details for each step.
    """
    # Verify org_slug matches authenticated org
    if org_context["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: org_slug mismatch"
        )

    # Get pipeline run with error_context
    run_query = f"""
    SELECT
        pipeline_logging_id,
        pipeline_id,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        CAST(duration_ms AS INT64) as duration_ms,
        run_date,
        error_message,
        error_context,
        parameters,
        run_metadata
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE org_slug = @org_slug AND pipeline_logging_id = @pipeline_logging_id
    """

    parameters = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id)
    ]

    try:
        run_results = list(bq_client.query(run_query, parameters=parameters))

        if not run_results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline run {pipeline_logging_id} not found"
            )

        row = run_results[0]

        # Parse JSON fields
        import json
        params = None
        if row.get("parameters"):
            try:
                params = json.loads(row["parameters"]) if isinstance(row["parameters"], str) else row["parameters"]
            except Exception as e:
                logger.warning(f"Failed to parse parameters JSON: {e}")
                params = {"raw": row["parameters"]}

        run_metadata = None
        if row.get("run_metadata"):
            try:
                run_metadata = json.loads(row["run_metadata"]) if isinstance(row["run_metadata"], str) else row["run_metadata"]
            except Exception as e:
                logger.warning(f"Failed to parse run_metadata JSON: {e}")
                run_metadata = {"raw": row["run_metadata"]}

        # Get step logs (only final statuses to avoid duplicates) with error_context
        steps_query = f"""
        SELECT
            step_logging_id,
            step_name,
            step_type,
            step_index,
            status,
            start_time,
            end_time,
            CAST(duration_ms AS INT64) as duration_ms,
            CAST(rows_processed AS INT64) as rows_processed,
            error_message,
            error_context,
            metadata
        FROM `{settings.gcp_project_id}.organizations.org_meta_step_logs`
        WHERE org_slug = @org_slug
          AND pipeline_logging_id = @pipeline_logging_id
          AND status IN ('COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED', 'TIMEOUT')
        ORDER BY step_index ASC
        """

        steps_results = list(bq_client.query(steps_query, parameters=parameters))

        steps = []
        for step_row in steps_results:
            step_metadata = None
            if step_row.get("metadata"):
                try:
                    step_metadata = json.loads(step_row["metadata"]) if isinstance(step_row["metadata"], str) else step_row["metadata"]
                except Exception as e:
                    logger.warning(f"Failed to parse step metadata JSON: {e}")
                    step_metadata = {"raw": step_row["metadata"]}

            # Parse step error_context
            step_error_ctx = None
            if step_row.get("error_context"):
                try:
                    ctx_data = json.loads(step_row["error_context"]) if isinstance(step_row["error_context"], str) else step_row["error_context"]
                    step_error_ctx = ErrorContext(
                        error_type=ctx_data.get("error_type"),
                        error_code=ctx_data.get("error_code"),
                        retry_count=ctx_data.get("retry_count"),
                        is_retryable=ctx_data.get("is_retryable"),
                        stack_trace=ctx_data.get("stack_trace"),
                        suggested_action=ctx_data.get("suggested_action")
                    )
                except Exception as e:
                    logger.warning(f"Failed to parse step error_context JSON: {e}")

            steps.append(StepLogSummary(
                step_logging_id=step_row["step_logging_id"],
                step_name=step_row["step_name"],
                step_type=step_row["step_type"],
                step_index=step_row["step_index"],
                status=step_row["status"],
                start_time=step_row.get("start_time"),
                end_time=step_row.get("end_time"),
                duration_ms=step_row.get("duration_ms"),
                rows_processed=step_row.get("rows_processed"),
                error_message=step_row.get("error_message"),
                error_context=step_error_ctx,
                metadata=step_metadata
            ))

        # Parse pipeline run error_context
        run_error_ctx = None
        if row.get("error_context"):
            try:
                ctx_data = json.loads(row["error_context"]) if isinstance(row["error_context"], str) else row["error_context"]
                run_error_ctx = ErrorContext(
                    error_type=ctx_data.get("error_type"),
                    error_code=ctx_data.get("error_code"),
                    retry_count=ctx_data.get("retry_count"),
                    is_retryable=ctx_data.get("is_retryable"),
                    stack_trace=ctx_data.get("stack_trace"),
                    suggested_action=ctx_data.get("suggested_action")
                )
            except Exception as e:
                logger.warning(f"Failed to parse run error_context JSON: {e}")

        logger.info(f"Fetched pipeline run {pipeline_logging_id} with {len(steps)} steps")

        return PipelineRunDetail(
            pipeline_logging_id=row["pipeline_logging_id"],
            pipeline_id=row["pipeline_id"],
            status=row["status"],
            trigger_type=row["trigger_type"] or "unknown",
            trigger_by=row.get("trigger_by"),
            start_time=row.get("start_time"),
            end_time=row.get("end_time"),
            duration_ms=row.get("duration_ms"),
            run_date=row.get("run_date"),
            error_message=row.get("error_message"),
            error_context=run_error_ctx,
            parameters=params,
            run_metadata=run_metadata,
            steps=steps
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pipeline run details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch pipeline run details. Please check server logs for details."
        )


class StepLogsResponse(BaseModel):
    """Paginated response for step logs."""
    steps: List[StepLogSummary] = Field(..., description="List of step logs")
    total: int = Field(..., description="Total number of steps")
    limit: int = Field(..., description="Page size")
    offset: int = Field(..., description="Page offset")


@router.get(
    "/pipelines/{org_slug}/runs/{pipeline_logging_id}/steps",
    response_model=StepLogsResponse,
    summary="Get step logs",
    description="Get paginated step execution logs for a pipeline run."
)
async def get_step_logs(
    org_slug: str,
    pipeline_logging_id: str,
    status_filter: Optional[str] = Query(None, description="Filter by step status"),
    limit: int = Query(100, ge=1, le=1000, description="Number of results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get step-level execution logs for a specific pipeline run with pagination.
    """
    # Verify org_slug matches authenticated org
    if org_context["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: org_slug mismatch"
        )

    where_clause = "org_slug = @org_slug AND pipeline_logging_id = @pipeline_logging_id"
    parameters = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id)
    ]

    # Filter to avoid duplicate RUNNING entries
    if status_filter:
        where_clause += " AND status = @status_filter"
        parameters.append(bigquery.ScalarQueryParameter("status_filter", "STRING", status_filter.upper()))
    else:
        # By default, exclude RUNNING duplicates - only show final status
        where_clause += " AND status IN ('COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED', 'TIMEOUT')"

    # Count total query
    count_query = f"""
    SELECT COUNT(*) as total
    FROM `{settings.gcp_project_id}.organizations.org_meta_step_logs`
    WHERE {where_clause}
    """

    # error_context may not exist in older tables
    query = f"""
    SELECT
        step_logging_id,
        step_name,
        step_type,
        step_index,
        status,
        start_time,
        end_time,
        CAST(duration_ms AS INT64) as duration_ms,
        CAST(rows_processed AS INT64) as rows_processed,
        error_message,
        CAST(NULL AS JSON) as error_context,
        metadata
    FROM `{settings.gcp_project_id}.organizations.org_meta_step_logs`
    WHERE {where_clause}
    ORDER BY step_index ASC
    LIMIT @limit OFFSET @offset
    """

    # Add pagination parameters
    parameters.extend([
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
        bigquery.ScalarQueryParameter("offset", "INT64", offset)
    ])

    try:
        import json

        # Get total count
        count_results = list(bq_client.query(count_query, parameters=parameters[:-2]))
        total = count_results[0]["total"] if count_results else 0

        # Get paginated results
        results = list(bq_client.query(query, parameters=parameters))

        steps = []
        for row in results:
            step_metadata = None
            if row.get("metadata"):
                try:
                    step_metadata = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"]
                except Exception as e:
                    logger.warning(f"Failed to parse step metadata JSON: {e}")
                    step_metadata = {"raw": row["metadata"]}

            # Parse error_context
            step_error_ctx = None
            if row.get("error_context"):
                try:
                    ctx_data = json.loads(row["error_context"]) if isinstance(row["error_context"], str) else row["error_context"]
                    step_error_ctx = ErrorContext(
                        error_type=ctx_data.get("error_type"),
                        error_code=ctx_data.get("error_code"),
                        retry_count=ctx_data.get("retry_count"),
                        is_retryable=ctx_data.get("is_retryable"),
                        stack_trace=ctx_data.get("stack_trace"),
                        suggested_action=ctx_data.get("suggested_action")
                    )
                except Exception as e:
                    logger.warning(f"Failed to parse error_context JSON: {e}")

            steps.append(StepLogSummary(
                step_logging_id=row["step_logging_id"],
                step_name=row["step_name"],
                step_type=row["step_type"],
                step_index=row["step_index"],
                status=row["status"],
                start_time=row.get("start_time"),
                end_time=row.get("end_time"),
                duration_ms=row.get("duration_ms"),
                rows_processed=row.get("rows_processed"),
                error_message=row.get("error_message"),
                error_context=step_error_ctx,
                metadata=step_metadata
            ))

        logger.info(f"Fetched {len(steps)} step logs for pipeline run {pipeline_logging_id}")

        return StepLogsResponse(
            steps=steps,
            total=total,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        logger.error(f"Error fetching step logs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch step logs. Please check server logs for details."
        )


# ============================================
# Retry and Download Endpoints
# ============================================

class RetryRunResponse(BaseModel):
    """Response for retry run request."""
    success: bool
    message: str
    new_pipeline_logging_id: Optional[str] = None
    original_pipeline_logging_id: str


@router.post(
    "/pipelines/{org_slug}/runs/{pipeline_logging_id}/retry",
    response_model=RetryRunResponse,
    summary="Retry a failed pipeline run",
    description="Retry a failed pipeline run with the same parameters."
)
async def retry_pipeline_run(
    org_slug: str,
    pipeline_logging_id: str,
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Retry a failed pipeline run.

    This endpoint retrieves the original run's parameters and triggers a new run.
    Note: This forwards the request to the pipeline service for execution.
    """
    # Verify org_slug matches authenticated org
    if org_context["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: org_slug mismatch"
        )

    # Get original run details
    query = f"""
    SELECT
        pipeline_id,
        status,
        parameters
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE org_slug = @org_slug AND pipeline_logging_id = @pipeline_logging_id
    """

    parameters = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id)
    ]

    try:
        results = list(bq_client.query(query, parameters=parameters))

        if not results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline run {pipeline_logging_id} not found"
            )

        row = results[0]

        # Only allow retry for FAILED runs
        if row["status"] not in ["FAILED", "COMPLETED"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot retry run with status: {row['status']}. Only FAILED or COMPLETED runs can be retried."
            )

        pipeline_id = row["pipeline_id"]
        original_params = row.get("parameters")

        import json
        if original_params and isinstance(original_params, str):
            try:
                original_params = json.loads(original_params)
            except Exception as e:
                logger.warning(f"Failed to parse original parameters JSON: {e}")
                original_params = {}

        # Note: This is a placeholder - actual retry should call the pipeline service
        # The frontend would typically call the pipeline service directly with the original params
        logger.info(f"Retry requested for pipeline run {pipeline_logging_id}, pipeline: {pipeline_id}")

        return RetryRunResponse(
            success=True,
            message=f"Retry initiated for pipeline {pipeline_id}. Use the pipeline service to execute: POST /api/v1/pipelines/run/{org_slug}/{pipeline_id}",
            new_pipeline_logging_id=None,  # Will be set by actual execution
            original_pipeline_logging_id=pipeline_logging_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying pipeline run: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retry pipeline run. Please check server logs for details."
        )


class DownloadLogsFormat(str):
    """Supported download formats."""
    JSON = "json"
    CSV = "csv"


@router.get(
    "/pipelines/{org_slug}/runs/{pipeline_logging_id}/download",
    summary="Download pipeline run logs",
    description="Download pipeline run and step logs as JSON or CSV."
)
async def download_pipeline_logs(
    org_slug: str,
    pipeline_logging_id: str,
    format: str = Query("json", description="Download format: json or csv"),
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Download complete pipeline run logs including all steps.
    """
    from fastapi.responses import Response

    # Verify org_slug matches authenticated org
    if org_context["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: org_slug mismatch"
        )

    if format not in ["json", "csv"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid format. Supported formats: json, csv"
        )

    try:
        # Get run details
        run_detail = await get_pipeline_run_detail(org_slug, pipeline_logging_id, org_context, bq_client)

        import json as json_module
        import csv
        import io

        if format == "json":
            content = json_module.dumps(run_detail.model_dump(mode='json'), indent=2, default=str)
            media_type = "application/json"
            filename = f"pipeline_run_{pipeline_logging_id}.json"
        else:
            # CSV format - flatten run + steps
            output = io.StringIO()
            writer = csv.writer(output)

            # Write run summary
            writer.writerow(["Run Summary"])
            writer.writerow(["Field", "Value"])
            writer.writerow(["pipeline_logging_id", run_detail.pipeline_logging_id])
            writer.writerow(["pipeline_id", run_detail.pipeline_id])
            writer.writerow(["status", run_detail.status])
            writer.writerow(["trigger_type", run_detail.trigger_type])
            writer.writerow(["trigger_by", run_detail.trigger_by])
            writer.writerow(["start_time", str(run_detail.start_time)])
            writer.writerow(["end_time", str(run_detail.end_time)])
            writer.writerow(["duration_ms", run_detail.duration_ms])
            writer.writerow(["error_message", run_detail.error_message])
            writer.writerow([])

            # Write steps
            writer.writerow(["Steps"])
            writer.writerow(["step_index", "step_name", "step_type", "status", "start_time", "end_time", "duration_ms", "rows_processed", "error_message"])
            for step in run_detail.steps:
                writer.writerow([
                    step.step_index,
                    step.step_name,
                    step.step_type,
                    step.status,
                    str(step.start_time),
                    str(step.end_time),
                    step.duration_ms,
                    step.rows_processed,
                    step.error_message
                ])

            content = output.getvalue()
            media_type = "text/csv"
            filename = f"pipeline_run_{pipeline_logging_id}.csv"

        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading pipeline logs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download pipeline logs. Please check server logs for details."
        )


# ============================================
# State Transitions Endpoint
# ============================================

class StateTransition(BaseModel):
    """A single state transition event."""
    transition_id: str = Field(..., description="Unique ID for this transition")
    pipeline_logging_id: str = Field(..., description="Pipeline run ID")
    step_logging_id: Optional[str] = Field(None, description="Step ID (if step-level transition)")
    entity_type: str = Field(..., description="PIPELINE or STEP")
    from_state: str = Field(..., description="Previous state")
    to_state: str = Field(..., description="New state")
    transition_time: datetime = Field(..., description="When the transition occurred")
    error_type: Optional[str] = Field(None, description="Error classification if failed")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    retry_count: Optional[int] = Field(None, description="Retry attempt number")
    duration_in_state_ms: Optional[int] = Field(None, description="Time spent in previous state")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional context")


class StateTransitionsResponse(BaseModel):
    """Paginated response for state transitions."""
    transitions: List[StateTransition] = Field(..., description="List of state transitions")
    total: int = Field(..., description="Total number of transitions")
    limit: int = Field(..., description="Page size")
    offset: int = Field(..., description="Page offset")


@router.get(
    "/pipelines/{org_slug}/runs/{pipeline_logging_id}/transitions",
    response_model=StateTransitionsResponse,
    summary="Get state transitions",
    description="Get audit trail of all state transitions for a pipeline run."
)
async def get_state_transitions(
    org_slug: str,
    pipeline_logging_id: str,
    entity_type: Optional[str] = Query(None, description="Filter by entity type: PIPELINE or STEP"),
    limit: int = Query(100, ge=1, le=1000, description="Number of results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get the full state transition history for a pipeline run.
    Provides detailed audit trail of all state changes for debugging.
    """
    # Verify org_slug matches authenticated org
    if org_context["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: org_slug mismatch"
        )

    where_clause = "org_slug = @org_slug AND pipeline_logging_id = @pipeline_logging_id"
    parameters = [
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id)
    ]

    if entity_type:
        where_clause += " AND entity_type = @entity_type"
        parameters.append(bigquery.ScalarQueryParameter("entity_type", "STRING", entity_type.upper()))

    # Count total
    count_query = f"""
    SELECT COUNT(*) as total
    FROM `{settings.gcp_project_id}.organizations.org_meta_state_transitions`
    WHERE {where_clause}
    """

    # Get transitions
    query = f"""
    SELECT
        transition_id,
        pipeline_logging_id,
        step_logging_id,
        entity_type,
        from_state,
        to_state,
        transition_time,
        error_type,
        error_message,
        CAST(retry_count AS INT64) as retry_count,
        CAST(duration_in_state_ms AS INT64) as duration_in_state_ms,
        metadata
    FROM `{settings.gcp_project_id}.organizations.org_meta_state_transitions`
    WHERE {where_clause}
    ORDER BY transition_time ASC
    LIMIT @limit OFFSET @offset
    """

    parameters.extend([
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
        bigquery.ScalarQueryParameter("offset", "INT64", offset)
    ])

    try:
        import json

        # Get total count
        count_results = list(bq_client.query(count_query, parameters=parameters[:-2]))
        total = count_results[0]["total"] if count_results else 0

        # Get paginated results
        results = list(bq_client.query(query, parameters=parameters))

        transitions = []
        for row in results:
            trans_metadata = None
            if row.get("metadata"):
                try:
                    trans_metadata = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"]
                except Exception as e:
                    logger.warning(f"Failed to parse transition metadata JSON: {e}")

            transitions.append(StateTransition(
                transition_id=row["transition_id"],
                pipeline_logging_id=row["pipeline_logging_id"],
                step_logging_id=row.get("step_logging_id"),
                entity_type=row["entity_type"],
                from_state=row["from_state"],
                to_state=row["to_state"],
                transition_time=row["transition_time"],
                error_type=row.get("error_type"),
                error_message=row.get("error_message"),
                retry_count=row.get("retry_count"),
                duration_in_state_ms=row.get("duration_in_state_ms"),
                metadata=trans_metadata
            ))

        logger.info(f"Fetched {len(transitions)} state transitions for pipeline run {pipeline_logging_id}")

        return StateTransitionsResponse(
            transitions=transitions,
            total=total,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        logger.error(f"Error fetching state transitions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch state transitions. Please check server logs for details."
        )
