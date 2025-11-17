"""
Pipeline Management API Routes
Endpoints for triggering and monitoring pipelines.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, Request
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
import uuid
import asyncio
import logging

from src.app.dependencies.auth import verify_api_key, verify_api_key_header, verify_admin_key, TenantContext
from src.app.dependencies.rate_limit_decorator import rate_limit_by_tenant
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.pipeline.executor import PipelineExecutor
from src.core.pipeline.async_executor import AsyncPipelineExecutor
from src.core.pipeline.template_resolver import resolve_template, get_template_path
from src.core.metadata.initializer import ensure_tenant_metadata
from src.app.config import settings
from google.cloud import bigquery

logger = logging.getLogger(__name__)

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

    model_config = ConfigDict(extra="allow")  # Allow additional parameters


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

async def run_async_pipeline_task(executor: AsyncPipelineExecutor, parameters: dict):
    """Async wrapper function to execute pipeline with proper error handling."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        logger.info(f"Starting background async pipeline execution: {executor.pipeline_logging_id}")
        result = await executor.execute(parameters)
        logger.info(f"Async pipeline execution completed: {executor.pipeline_logging_id}")
        return result
    except Exception as e:
        logger.error(
            f"Async pipeline execution failed: {executor.pipeline_logging_id}",
            exc_info=True,
            extra={"error": str(e)}
        )
        raise


def run_pipeline_task(executor: PipelineExecutor, parameters: dict):
    """Legacy sync wrapper function (fallback for old executor)."""
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
    "/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}",
    response_model=TriggerPipelineResponse,
    summary="Trigger a templated pipeline",
    description="Start execution of a pipeline from a template with automatic variable substitution. Rate limited: 50 requests/minute per tenant"
)
async def trigger_templated_pipeline(
    tenant_id: str,
    provider: str,
    domain: str,
    template_name: str,
    background_tasks: BackgroundTasks,
    http_request: Request,
    request: TriggerPipelineRequest = TriggerPipelineRequest(),
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Trigger a pipeline execution from a template with automatic variable substitution.

    This endpoint loads a template from `configs/{provider}/{domain}/{template_name}.yml`
    and replaces all template variables before execution.

    Template Variables:
    - {tenant_id} - Replaced with tenant_id from path
    - {provider} - Replaced with provider from path (e.g., 'gcp', 'aws')
    - {domain} - Replaced with domain from path (e.g., 'cost', 'security')
    - {template_name} - Replaced with template_name from path
    - {pipeline_id} - Auto-generated: {tenant_id}-{provider}-{domain}-{template_name}

    Example:
    ```
    POST /api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/bill-sample-export-template
    Headers: X-API-Key: your-api-key
    Body: {"date": "2025-11-15"}
    ```

    This will:
    1. Load template from: configs/gcp/cost/bill-sample-export-template.yml
    2. Replace {tenant_id} with 'acmeinc_23xv2'
    3. Replace {pipeline_id} with 'acmeinc_23xv2-gcp-cost-bill-sample-export-template'
    4. Execute the resolved pipeline

    Args:
        tenant_id: Tenant identifier (must match authenticated tenant)
        provider: Cloud provider (gcp, aws, azure)
        domain: Domain category (cost, security, compute)
        template_name: Template name (without .yml extension)
        request: Pipeline trigger request with optional parameters

    Returns:
        TriggerPipelineResponse with pipeline_logging_id for tracking

    Features:
    - Template-based configuration (one template, many tenants)
    - Automatic variable substitution
    - Async/await architecture for non-blocking operations
    - Parallel execution of independent pipeline steps
    - DAG-based dependency resolution
    - Built-in concurrency control - prevents duplicate pipeline execution
    - Rate limited: 50 requests/minute per tenant (prevents resource exhaustion)
    """
    # Apply rate limiting for expensive pipeline execution
    await rate_limit_by_tenant(
        http_request,
        tenant_id=tenant.tenant_id,
        limit_per_minute=settings.rate_limit_pipeline_run_per_minute,
        endpoint_name="trigger_templated_pipeline"
    )

    # Verify tenant_id matches authenticated tenant
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tenant ID mismatch: authenticated as '{tenant.tenant_id}' but requested '{tenant_id}'"
        )

    # Generate pipeline_id for tracking (includes tenant prefix)
    pipeline_id = f"{tenant_id}-{provider}-{domain}-{template_name}"

    # File identifier for config lookup (just the template name for glob search)
    file_identifier = template_name  # e.g., "billing_cost"

    # Get template path
    template_path = get_template_path(provider, domain, template_name)

    # Prepare template variables
    template_variables = {
        "tenant_id": tenant_id,
        "provider": provider,
        "domain": domain,
        "template_name": template_name,
        "pipeline_id": pipeline_id
    }

    # Load and resolve template
    try:
        resolved_config = resolve_template(template_path, template_variables)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template not found: {template_path}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to resolve template: {str(e)}"
        )

    # Ensure tenant metadata infrastructure exists
    ensure_tenant_metadata(tenant.tenant_id, bq_client.client)

    # Extract parameters from request
    parameters = request.model_dump(exclude={'trigger_by'}, exclude_none=True)

    # Extract run_date from parameters
    run_date = parameters.get('date')

    # Generate pipeline_logging_id
    pipeline_logging_id = str(uuid.uuid4())

    # ATOMIC: Insert pipeline run ONLY IF no RUNNING/PENDING pipeline exists
    # Use tenant-specific metadata table: {tenant_id}.x_meta_pipeline_runs
    tenant_pipeline_runs_table = f"{settings.gcp_project_id}.{tenant.tenant_id}.x_meta_pipeline_runs"

    insert_query = f"""
    INSERT INTO `{tenant_pipeline_runs_table}`
    (pipeline_logging_id, pipeline_id, tenant_id, status, trigger_type, trigger_by, start_time, run_date, parameters)
    SELECT * FROM (
        SELECT
            @pipeline_logging_id AS pipeline_logging_id,
            @pipeline_id AS pipeline_id,
            @tenant_id AS tenant_id,
            'PENDING' AS status,
            @trigger_type AS trigger_type,
            @trigger_by AS trigger_by,
            CURRENT_TIMESTAMP() AS start_time,
            @run_date AS run_date,
            PARSE_JSON(@parameters) AS parameters
    ) AS new_run
    WHERE NOT EXISTS (
        SELECT 1
        FROM `{tenant_pipeline_runs_table}`
        WHERE tenant_id = @tenant_id
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
    )
    """

    import json
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant.tenant_id),
            bigquery.ScalarQueryParameter("trigger_type", "STRING", "api"),
            bigquery.ScalarQueryParameter("trigger_by", "STRING", request.trigger_by or "api_user"),
            bigquery.ScalarQueryParameter("run_date", "DATE", run_date),
            bigquery.ScalarQueryParameter("parameters", "STRING", json.dumps(parameters) if parameters else "{}"),
        ]
    )

    # Execute atomic INSERT
    query_job = bq_client.client.query(insert_query, job_config=job_config)
    result = query_job.result()

    # Check if row was inserted
    if query_job.num_dml_affected_rows > 0:
        # Successfully inserted - create executor with file identifier for config lookup
        # pipeline_id is the full tracking ID, but file_identifier is used for finding the YAML file
        executor = AsyncPipelineExecutor(
            tenant_id=tenant.tenant_id,
            pipeline_id=file_identifier,  # Use file path for config lookup
            trigger_type="api",
            trigger_by=request.trigger_by or "api_user"
        )
        # Override the executor's pipeline_logging_id
        executor.pipeline_logging_id = pipeline_logging_id

        # Execute pipeline in background
        background_tasks.add_task(run_async_pipeline_task, executor, parameters)

        return TriggerPipelineResponse(
            pipeline_logging_id=pipeline_logging_id,
            pipeline_id=pipeline_id,
            tenant_id=tenant.tenant_id,
            status="PENDING",
            message=f"Templated pipeline {template_name} triggered successfully for {tenant_id} (async mode)"
        )
    else:
        # Pipeline already running/pending - use tenant-specific metadata table
        tenant_pipeline_runs_table = f"{settings.gcp_project_id}.{tenant.tenant_id}.x_meta_pipeline_runs"

        check_query = f"""
        SELECT pipeline_logging_id
        FROM `{tenant_pipeline_runs_table}`
        WHERE tenant_id = @tenant_id
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
        ORDER BY start_time DESC
        LIMIT 1
        """

        check_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant.tenant_id),
                bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            ]
        )

        existing_runs = list(bq_client.client.query(check_query, job_config=check_job_config).result())
        existing_pipeline_logging_id = existing_runs[0]["pipeline_logging_id"] if existing_runs else "unknown"

        return TriggerPipelineResponse(
            pipeline_logging_id=existing_pipeline_logging_id,
            pipeline_id=pipeline_id,
            tenant_id=tenant.tenant_id,
            status="RUNNING",
            message=f"Pipeline {pipeline_id} already running or pending - returning existing execution {existing_pipeline_logging_id}"
        )


@router.post(
    "/pipelines/run/{pipeline_id}",
    response_model=TriggerPipelineResponse,
    summary="Trigger a pipeline (DEPRECATED)",
    description="Start execution of a pipeline for the authenticated tenant with async parallel processing. DEPRECATED: Use /pipelines/run/{tenant_id}/{provider}/{domain}/{template_name} instead. Rate limited: 50 requests/minute per tenant",
    deprecated=True
)
async def trigger_pipeline(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    http_request: Request,
    request: TriggerPipelineRequest = TriggerPipelineRequest(),
    tenant: TenantContext = Depends(verify_api_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Trigger a pipeline execution with async parallel processing.

    - **pipeline_id**: Pipeline identifier (e.g., pricing_calculation)
    - **trigger_by**: Optional identifier of who triggered the pipeline
    - **date**: Date parameter for the pipeline (YYYY-MM-DD format)

    Returns the pipeline_logging_id for tracking.

    Features:
    - Async/await architecture for non-blocking operations
    - Parallel execution of independent pipeline steps
    - DAG-based dependency resolution
    - Support for 100+ concurrent pipelines
    - Petabyte-scale data processing via partitioning
    - Built-in concurrency control - prevents duplicate pipeline execution
    - Rate limited: 50 requests/minute per tenant (prevents resource exhaustion)
    """
    # Apply rate limiting for expensive pipeline execution
    await rate_limit_by_tenant(
        http_request,
        tenant_id=tenant.tenant_id,
        limit_per_minute=settings.rate_limit_pipeline_run_per_minute,
        endpoint_name="trigger_pipeline_deprecated"
    )

    # Ensure tenant metadata infrastructure exists
    ensure_tenant_metadata(tenant.tenant_id, bq_client.client)

    # Extract parameters from request
    parameters = request.model_dump(exclude={'trigger_by'}, exclude_none=True)

    # Extract run_date from parameters (e.g., "2025-11-15")
    run_date = parameters.get('date')  # Will be None if not provided

    # Generate pipeline_logging_id
    import uuid
    pipeline_logging_id = str(uuid.uuid4())

    # ATOMIC: Insert pipeline run ONLY IF no RUNNING/PENDING pipeline exists
    # This single DML operation prevents race conditions by being atomic
    insert_query = f"""
    INSERT INTO `{settings.get_admin_metadata_table('x_meta_pipeline_runs')}`
    (pipeline_logging_id, pipeline_id, tenant_id, status, trigger_type, trigger_by, start_time, run_date, parameters)
    SELECT * FROM (
        SELECT
            @pipeline_logging_id AS pipeline_logging_id,
            @pipeline_id AS pipeline_id,
            @tenant_id AS tenant_id,
            'PENDING' AS status,
            @trigger_type AS trigger_type,
            @trigger_by AS trigger_by,
            CURRENT_TIMESTAMP() AS start_time,
            @run_date AS run_date,
            PARSE_JSON(@parameters) AS parameters
    ) AS new_run
    WHERE NOT EXISTS (
        SELECT 1
        FROM `{settings.get_admin_metadata_table('x_meta_pipeline_runs')}`
        WHERE tenant_id = @tenant_id
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
    )
    """

    import json
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant.tenant_id),
            bigquery.ScalarQueryParameter("trigger_type", "STRING", "api"),
            bigquery.ScalarQueryParameter("trigger_by", "STRING", request.trigger_by or "api_user"),
            bigquery.ScalarQueryParameter("run_date", "DATE", run_date),
            bigquery.ScalarQueryParameter("parameters", "STRING", json.dumps(parameters) if parameters else "{}"),
        ]
    )

    # Execute atomic INSERT
    query_job = bq_client.client.query(insert_query, job_config=job_config)
    result = query_job.result()  # Wait for completion

    # Check if row was inserted (num_dml_affected_rows > 0 means INSERT succeeded)
    if query_job.num_dml_affected_rows > 0:
        # Successfully inserted - this is a new pipeline execution
        # Create ASYNC pipeline executor
        executor = AsyncPipelineExecutor(
            tenant_id=tenant.tenant_id,
            pipeline_id=pipeline_id,
            trigger_type="api",
            trigger_by=request.trigger_by or "api_user"
        )
        # Override the executor's pipeline_logging_id with our pre-generated one
        executor.pipeline_logging_id = pipeline_logging_id

        # Execute pipeline in background with async error handling
        background_tasks.add_task(run_async_pipeline_task, executor, parameters)

        return TriggerPipelineResponse(
            pipeline_logging_id=pipeline_logging_id,
            pipeline_id=pipeline_id,
            tenant_id=tenant.tenant_id,
            status="PENDING",
            message=f"Pipeline {pipeline_id} triggered successfully (async mode)"
        )
    else:
        # INSERT was blocked - pipeline already running/pending
        # Query to get the existing pipeline_logging_id
        check_query = f"""
        SELECT pipeline_logging_id
        FROM `{settings.get_admin_metadata_table('x_meta_pipeline_runs')}`
        WHERE tenant_id = @tenant_id
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
        ORDER BY start_time DESC
        LIMIT 1
        """

        check_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant.tenant_id),
                bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            ]
        )

        existing_runs = list(bq_client.client.query(check_query, job_config=check_job_config).result())
        existing_pipeline_logging_id = existing_runs[0]["pipeline_logging_id"] if existing_runs else "unknown"

        return TriggerPipelineResponse(
            pipeline_logging_id=existing_pipeline_logging_id,
            pipeline_id=pipeline_id,
            tenant_id=tenant.tenant_id,
            status="RUNNING",
            message=f"Pipeline {pipeline_id} already running or pending - returning existing execution {existing_pipeline_logging_id}"
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
    FROM `{settings.get_admin_metadata_table('x_meta_pipeline_runs')}`
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
    FROM `{settings.get_admin_metadata_table('x_meta_pipeline_runs')}`
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


# ============================================
# Pub/Sub Batch Pipeline Execution
# ============================================

class BatchPipelinePublishRequest(BaseModel):
    """Request to publish batch pipeline tasks to Pub/Sub."""
    tenant_ids: List[str] = Field(..., description="List of tenant IDs (can be 10k+)")
    pipeline_id: str = Field(..., description="Pipeline to execute")
    parameters: Optional[dict] = Field(
        default_factory=dict,
        description="Pipeline parameters (date, trigger_by, etc)"
    )
    randomize_delay: bool = Field(
        default=True,
        description="Add random delay to spread execution over time"
    )
    max_jitter_seconds: int = Field(
        default=3600,
        description="Maximum random delay in seconds (default: 1 hour)"
    )


@router.post(
    "/pipelines/batch/publish",
    summary="Publish batch pipeline tasks to Pub/Sub",
    description="Publish pipeline tasks for multiple tenants to Pub/Sub for distributed execution (ADMIN ONLY)"
)
async def publish_batch_pipeline(
    request: BatchPipelinePublishRequest,
    admin_context: None = Depends(verify_admin_key)
):
    """
    Publish pipeline tasks for multiple tenants to Pub/Sub.

    This endpoint is for ADMIN use only. It publishes tasks that will be
    executed asynchronously by worker instances.

    Use Cases:
    - Daily batch processing for all 10k tenants
    - Backfill pipelines for multiple tenants
    - Distributed execution with load leveling
    """
    from src.core.pubsub.publisher import PipelinePublisher

    publisher = PipelinePublisher()

    result = await publisher.publish_pipeline_batch(
        tenant_ids=request.tenant_ids,
        pipeline_id=request.pipeline_id,
        parameters=request.parameters,
        randomize_delay=request.randomize_delay,
        max_jitter_seconds=request.max_jitter_seconds
    )

    return {
        "status": "published",
        "pipeline_id": request.pipeline_id,
        **result
    }
