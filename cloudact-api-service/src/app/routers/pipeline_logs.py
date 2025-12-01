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

class PipelineRunSummary(BaseModel):
    """Summary of a single pipeline run."""
    pipeline_logging_id: str = Field(..., description="Unique ID for this run")
    pipeline_id: str = Field(..., description="Pipeline identifier")
    status: str = Field(..., description="PENDING, RUNNING, COMPLETED, FAILED")
    trigger_type: str = Field(..., description="api, scheduler, webhook, manual")
    trigger_by: Optional[str] = Field(None, description="Who triggered the run")
    start_time: Optional[datetime] = Field(None, description="When execution started")
    end_time: Optional[datetime] = Field(None, description="When execution ended")
    duration_ms: Optional[int] = Field(None, description="Duration in milliseconds")
    run_date: Optional[date] = Field(None, description="Date of the run")
    error_message: Optional[str] = Field(None, description="Error message if failed")
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
    status: str = Field(..., description="PENDING, RUNNING, COMPLETED, FAILED, SKIPPED")
    start_time: Optional[datetime] = Field(None, description="When step started")
    end_time: Optional[datetime] = Field(None, description="When step ended")
    duration_ms: Optional[int] = Field(None, description="Duration in milliseconds")
    rows_processed: Optional[int] = Field(None, description="Number of rows processed")
    error_message: Optional[str] = Field(None, description="Error message if failed")
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
# Endpoints
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

    where_clause = " AND ".join(where_clauses)

    # Count total
    count_query = f"""
    SELECT COUNT(*) as total
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE {where_clause}
    """

    # Get runs
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
            params = None
            if row.get("parameters"):
                import json
                try:
                    params = json.loads(row["parameters"]) if isinstance(row["parameters"], str) else row["parameters"]
                except:
                    params = {"raw": row["parameters"]}

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
            detail=f"Failed to fetch pipeline runs: {str(e)}"
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

    # Get pipeline run
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
            except:
                params = {"raw": row["parameters"]}

        run_metadata = None
        if row.get("run_metadata"):
            try:
                run_metadata = json.loads(row["run_metadata"]) if isinstance(row["run_metadata"], str) else row["run_metadata"]
            except:
                run_metadata = {"raw": row["run_metadata"]}

        # Get step logs (only COMPLETED status to avoid duplicates)
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
            metadata
        FROM `{settings.gcp_project_id}.organizations.org_meta_step_logs`
        WHERE org_slug = @org_slug
          AND pipeline_logging_id = @pipeline_logging_id
          AND status IN ('COMPLETED', 'FAILED', 'SKIPPED')
        ORDER BY step_index ASC
        """

        steps_results = list(bq_client.query(steps_query, parameters=parameters))

        steps = []
        for step_row in steps_results:
            step_metadata = None
            if step_row.get("metadata"):
                try:
                    step_metadata = json.loads(step_row["metadata"]) if isinstance(step_row["metadata"], str) else step_row["metadata"]
                except:
                    step_metadata = {"raw": step_row["metadata"]}

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
                metadata=step_metadata
            ))

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
            detail=f"Failed to fetch pipeline run details: {str(e)}"
        )


@router.get(
    "/pipelines/{org_slug}/runs/{pipeline_logging_id}/steps",
    response_model=List[StepLogSummary],
    summary="Get step logs",
    description="Get all step execution logs for a pipeline run."
)
async def get_step_logs(
    org_slug: str,
    pipeline_logging_id: str,
    status_filter: Optional[str] = Query(None, description="Filter by step status"),
    org_context: dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get step-level execution logs for a specific pipeline run.
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
        where_clause += " AND status IN ('COMPLETED', 'FAILED', 'SKIPPED')"

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
        metadata
    FROM `{settings.gcp_project_id}.organizations.org_meta_step_logs`
    WHERE {where_clause}
    ORDER BY step_index ASC
    """

    try:
        import json
        results = list(bq_client.query(query, parameters=parameters))

        steps = []
        for row in results:
            step_metadata = None
            if row.get("metadata"):
                try:
                    step_metadata = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"]
                except:
                    step_metadata = {"raw": row["metadata"]}

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
                metadata=step_metadata
            ))

        logger.info(f"Fetched {len(steps)} step logs for pipeline run {pipeline_logging_id}")
        return steps

    except Exception as e:
        logger.error(f"Error fetching step logs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch step logs: {str(e)}"
        )
