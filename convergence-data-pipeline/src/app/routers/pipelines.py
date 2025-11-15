"""
Pipeline Management API Routes
Endpoints for triggering and monitoring pipelines.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import uuid

from src.app.dependencies.auth import verify_api_key, TenantContext
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.pipeline.executor import PipelineExecutor
from src.app.config import settings

router = APIRouter()


# ============================================
# Request/Response Models
# ============================================

class TriggerPipelineRequest(BaseModel):
    """Request to trigger a pipeline."""
    trigger_by: Optional[str] = Field(
        default="api_user",
        description="Who is triggering the pipeline"
    )
    date: Optional[str] = Field(
        default=None,
        description="Date parameter for the pipeline (e.g., '2025-11-14')"
    )

    class Config:
        extra = "allow"  # Allow additional parameters


class PipelineRunResponse(BaseModel):
    """Response for pipeline run."""
    pipeline_logging_id: str
    pipeline_id: str
    tenant_id: str
    status: str
    trigger_type: str
    trigger_by: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_ms: Optional[int] = None


class TriggerPipelineResponse(BaseModel):
    """Response for triggering a pipeline."""
    pipeline_logging_id: str
    pipeline_id: str
    tenant_id: str
    status: str
    message: str


# ============================================
# Pipeline Execution Endpoints
# ============================================

def run_pipeline_task(executor: PipelineExecutor, parameters: dict):
    """Wrapper function to execute pipeline with proper error handling."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        logger.info(f"Starting background pipeline execution: {executor.pipeline_logging_id}")
        result = executor.execute(parameters)
        logger.info(f"Pipeline execution completed: {executor.pipeline_logging_id}")
        return result
    except Exception as e:
        logger.error(
            f"Pipeline execution failed: {executor.pipeline_logging_id}",
            exc_info=True,
            extra={"error": str(e)}
        )
        raise


@router.post(
    "/pipelines/run/{pipeline_id}",
    response_model=TriggerPipelineResponse,
    summary="Trigger a pipeline",
    description="Start execution of a pipeline for the authenticated tenant"
)
async def trigger_pipeline(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    request: TriggerPipelineRequest = TriggerPipelineRequest(),
    tenant: TenantContext = Depends(verify_api_key)
):
    """
    Trigger a pipeline execution.

    - **pipeline_id**: Pipeline identifier (e.g., pricing_calculation)
    - **trigger_by**: Optional identifier of who triggered the pipeline
    - **date**: Date parameter for the pipeline (YYYY-MM-DD format)

    Returns the pipeline_logging_id for tracking.
    """
    # Extract parameters from request
    parameters = request.dict(exclude={'trigger_by'}, exclude_none=True)

    # Create pipeline executor
    executor = PipelineExecutor(
        tenant_id=tenant.tenant_id,
        pipeline_id=pipeline_id,
        trigger_type="api",
        trigger_by=request.trigger_by or "api_user"
    )

    # Execute pipeline in background with error handling
    background_tasks.add_task(run_pipeline_task, executor, parameters)

    return TriggerPipelineResponse(
        pipeline_logging_id=executor.pipeline_logging_id,
        pipeline_id=pipeline_id,
        tenant_id=tenant.tenant_id,
        status="PENDING",
        message=f"Pipeline {pipeline_id} triggered successfully"
    )


@router.get(
    "/pipelines/runs/{pipeline_logging_id}",
    response_model=PipelineRunResponse,
    summary="Get pipeline run status",
    description="Get details and status of a specific pipeline run"
)
async def get_pipeline_run(
    pipeline_logging_id: str,
    tenant: TenantContext = Depends(verify_api_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get pipeline run details.

    - **pipeline_logging_id**: Unique identifier for the pipeline run

    Returns execution details and current status.
    """
    # Query BigQuery for run details
    query = f"""
    SELECT
        pipeline_logging_id,
        pipeline_id,
        tenant_id,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        duration_ms
    FROM `{settings.gcp_project_id}.metadata.pipeline_runs`
    WHERE pipeline_logging_id = @pipeline_logging_id
      AND tenant_id = @tenant_id
    LIMIT 1
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant.tenant_id),
        ]
    )

    results = list(bq_client.client.query(query, job_config=job_config).result())

    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {pipeline_logging_id} not found for tenant {tenant.tenant_id}"
        )

    row = dict(results[0])

    return PipelineRunResponse(**row)


@router.get(
    "/pipelines/runs",
    response_model=List[PipelineRunResponse],
    summary="List pipeline runs",
    description="List recent pipeline runs for the authenticated tenant"
)
async def list_pipeline_runs(
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    tenant: TenantContext = Depends(verify_api_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List pipeline runs with optional filters.

    - **pipeline_id**: Optional filter by pipeline ID
    - **status**: Optional filter by status (PENDING, RUNNING, COMPLETE, FAILED)
    - **limit**: Maximum number of results (1-100)

    Returns list of pipeline runs ordered by start time (most recent first).
    """
    # Build query with filters
    where_clauses = [f"tenant_id = @tenant_id"]
    parameters = [
        ("tenant_id", "STRING", tenant.tenant_id),
    ]

    if pipeline_id:
        where_clauses.append("pipeline_id = @pipeline_id")
        parameters.append(("pipeline_id", "STRING", pipeline_id))

    if status:
        where_clauses.append("status = @status")
        parameters.append(("status", "STRING", status.upper()))

    where_sql = " AND ".join(where_clauses)

    query = f"""
    SELECT
        pipeline_logging_id,
        pipeline_id,
        tenant_id,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        duration_ms
    FROM `{settings.gcp_project_id}.metadata.pipeline_runs`
    WHERE {where_sql}
    ORDER BY start_time DESC
    LIMIT @limit
    """

    from google.cloud import bigquery

    parameters.append(("limit", "INT64", limit))

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter(name, type_, value)
            for name, type_, value in parameters
        ]
    )

    results = bq_client.client.query(query, job_config=job_config).result()

    runs = [PipelineRunResponse(**dict(row)) for row in results]

    return runs


@router.delete(
    "/pipelines/runs/{pipeline_logging_id}",
    summary="Cancel pipeline run",
    description="Attempt to cancel a running pipeline"
)
async def cancel_pipeline_run(
    pipeline_logging_id: str,
    tenant: TenantContext = Depends(verify_api_key)
):
    """
    Cancel a running pipeline.

    - **pipeline_logging_id**: Pipeline run ID to cancel

    Note: This is a placeholder. Cancellation logic will be implemented
    based on your pipeline execution architecture.
    """
    return {
        "pipeline_logging_id": pipeline_logging_id,
        "message": "Pipeline cancellation requested (placeholder). In-progress steps may complete."
    }
