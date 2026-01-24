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

from src.app.dependencies.auth import verify_api_key, verify_api_key_header, verify_admin_key, OrgContext
from src.app.dependencies.rate_limit_decorator import rate_limit_by_org
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.pipeline import AsyncPipelineExecutor  # Standardized on AsyncPipelineExecutor
from src.core.pipeline.template_resolver import resolve_template, get_template_path
from src.app.config import settings
from google.cloud import bigquery
import re
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================
# API Service Validation Helper
# ============================================

async def validate_pipeline_with_api_service(
    org_slug: str,
    pipeline_id: str,
    api_key: str,
    include_credentials: bool = False
) -> dict:
    """
    Call api-service to validate pipeline execution.

    This validates:
    - API key is valid
    - Organization is active
    - Subscription is active
    - Quota is not exceeded
    - Required integration is configured

    Args:
        org_slug: Organization slug
        pipeline_id: Pipeline ID (e.g., "gcp_billing", "openai_usage_cost")
        api_key: Organization API key for authentication
        include_credentials: Whether to include decrypted credentials in response

    Returns:
        dict with validation result:
        - valid: bool
        - org_slug: str
        - org_dataset_id: Optional[str]
        - pipeline_id: str
        - pipeline_config: Optional[dict]
        - subscription: Optional[dict]
        - quota: Optional[dict]
        - credentials: Optional[dict] (if include_credentials=True)
        - error: Optional[str]
        - error_code: Optional[str]
    """
    api_service_url = settings.api_service_url
    timeout = settings.api_service_timeout

    url = f"{api_service_url}/api/v1/validator/validate/{org_slug}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "pipeline_id": pipeline_id,
                    "include_credentials": include_credentials
                }
            )

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 401:
                return {
                    "valid": False,
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "error": "Invalid API key",
                    "error_code": "INVALID_API_KEY"
                }
            elif response.status_code == 403:
                return {
                    "valid": False,
                    "org_slug": org_slug,
                    "pipeline_id": pipeline_id,
                    "error": "Access forbidden",
                    "error_code": "ACCESS_FORBIDDEN"
                }
            else:
                # Try to parse error response
                try:
                    error_data = response.json()
                    return {
                        "valid": False,
                        "org_slug": org_slug,
                        "pipeline_id": pipeline_id,
                        "error": error_data.get("detail", f"Validation failed with status {response.status_code}"),
                        "error_code": "VALIDATION_FAILED"
                    }
                except Exception:
                    return {
                        "valid": False,
                        "org_slug": org_slug,
                        "pipeline_id": pipeline_id,
                        "error": f"API service returned status {response.status_code}",
                        "error_code": "API_SERVICE_ERROR"
                    }

    except httpx.TimeoutException:
        logger.error(f"Timeout calling api-service for validation: org={org_slug}, pipeline={pipeline_id}")
        return {
            "valid": False,
            "org_slug": org_slug,
            "pipeline_id": pipeline_id,
            "error": "Validation service timeout",
            "error_code": "TIMEOUT"
        }
    except httpx.ConnectError as e:
        logger.error(f"Cannot connect to api-service: {e}")
        return {
            "valid": False,
            "org_slug": org_slug,
            "pipeline_id": pipeline_id,
            "error": f"Cannot connect to validation service at {api_service_url}",
            "error_code": "VALIDATION_SERVICE_UNAVAILABLE"
        }
    except Exception as e:
        logger.error(f"Error calling api-service for validation: {e}", exc_info=True)
        return {
            "valid": False,
            "org_slug": org_slug,
            "pipeline_id": pipeline_id,
            "error": f"Validation service error: {str(e)}",
            "error_code": "VALIDATION_ERROR"
        }


async def report_pipeline_completion_to_api_service(
    org_slug: str,
    pipeline_status: str,
    api_key: str,
    reservation_date: str = ""
) -> bool:
    """
    Report pipeline completion to api-service to update usage counters.

    Args:
        org_slug: Organization slug
        pipeline_status: "SUCCESS" or "FAILED"
        api_key: Organization API key
        reservation_date: The UTC date (YYYY-MM-DD) when quota was reserved.
                         CRITICAL: Pass this to ensure decrement happens on the correct
                         day's record, preventing stale concurrent counts when pipelines
                         span midnight UTC.

    Returns:
        True if successfully reported, False otherwise
    """
    api_service_url = settings.api_service_url
    timeout = settings.api_service_timeout

    # Build URL with reservation_date if provided
    url = f"{api_service_url}/api/v1/validator/complete/{org_slug}?pipeline_status={pipeline_status}"
    if reservation_date:
        url += f"&reservation_date={reservation_date}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json"
                }
            )

            if response.status_code == 200:
                logger.info(f"Pipeline completion reported to api-service: org={org_slug}, status={pipeline_status}")
                return True
            else:
                logger.warning(f"Failed to report pipeline completion: status={response.status_code}")
                return False

    except Exception as e:
        logger.error(f"Error reporting pipeline completion to api-service: {e}")
        return False


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
    # Additional known pipeline parameters
    start_date: Optional[str] = Field(
        default=None,
        description="Start date for date range pipelines (YYYY-MM-DD)"
    )
    end_date: Optional[str] = Field(
        default=None,
        description="End date for date range pipelines (YYYY-MM-DD)"
    )
    force_refresh: Optional[bool] = Field(
        default=False,
        description="Force refresh even if data already exists"
    )

    # SECURITY: Forbid unknown fields to prevent injection of unexpected parameters
    model_config = ConfigDict(extra="forbid")


class PipelineRunResponse(BaseModel):
    """Response for pipeline run."""
    pipeline_logging_id: str
    pipeline_id: str
    org_slug: str
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
    org_slug: str
    status: str
    message: str


class StepLogSummary(BaseModel):
    """Step execution log summary."""
    step_logging_id: str
    step_name: str
    step_type: str
    step_index: int
    status: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: Optional[int] = None
    rows_processed: Optional[int] = None
    error_message: Optional[str] = None
    error_context: Optional[dict] = None
    metadata: Optional[dict] = None


class PipelineRunSummary(BaseModel):
    """Pipeline run summary for list responses."""
    pipeline_logging_id: str
    pipeline_id: str
    status: str
    trigger_type: str
    trigger_by: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: Optional[int] = None
    run_date: Optional[str] = None
    error_message: Optional[str] = None
    error_context: Optional[dict] = None
    parameters: Optional[dict] = None


class PipelineRunDetailResponse(PipelineRunSummary):
    """Pipeline run detail with step logs."""
    run_metadata: Optional[dict] = None
    steps: List[StepLogSummary] = []


class PipelineRunsListResponse(BaseModel):
    """Paginated pipeline runs response."""
    runs: List[PipelineRunSummary]
    total: int
    limit: int
    offset: int


# ============================================
# Pipeline Execution Endpoints
# ============================================

async def run_async_pipeline_task(
    executor: AsyncPipelineExecutor,
    parameters: dict,
    org_slug: str,
    bq_client: BigQueryClient,
    api_key: str = "",
    reservation_date: str = ""
) -> Optional[dict]:
    """
    Execute pipeline in background with proper error handling.

    This is the standardized pipeline execution wrapper.
    All pipeline executions now use AsyncPipelineExecutor for better performance and scalability.

    NOTE: Since this runs in a background task, exceptions are absorbed by FastAPI.
    We update the pipeline status to FAILED in BigQuery to ensure clients can track failures.

    IMPORTANT: Concurrent counter is now managed by api-service:
    - Incremented during validation (before this task starts)
    - Decremented via completion reporting (at the end of this task)
    - reservation_date ensures decrement happens on correct day's record even if
      pipeline spans midnight UTC
    """
    from google.cloud import bigquery as bq

    pipeline_status = "FAILED"  # Default to FAILED, update to SUCCESS if execution completes

    # Execute the pipeline
    try:
        logger.info(f"Starting background async pipeline execution: {executor.pipeline_logging_id}")
        result = await executor.execute(parameters)
        logger.info(f"Async pipeline execution completed: {executor.pipeline_logging_id}")
        pipeline_status = "SUCCESS"
        return result
    except Exception as e:
        error_msg = str(e)[:1000]  # Truncate long error messages
        logger.error(
            f"Async pipeline execution failed: {executor.pipeline_logging_id}",
            exc_info=True,
            extra={
                "error": error_msg,
                "org_slug": executor.org_slug,
                "pipeline_id": executor.pipeline_id
            }
        )

        # Update pipeline status to FAILED in BigQuery so clients can track the failure
        try:
            bq_client = get_bigquery_client()
            update_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
            SET status = 'FAILED',
                end_time = CURRENT_TIMESTAMP(),
                error_message = @error_message
            WHERE pipeline_logging_id = @pipeline_logging_id
            """

            job_config = bq.QueryJobConfig(
                query_parameters=[
                    bq.ScalarQueryParameter("pipeline_logging_id", "STRING", executor.pipeline_logging_id),
                    bq.ScalarQueryParameter("error_message", "STRING", error_msg),
                ]
            )

            bq_client.client.query(update_query, job_config=job_config).result()
            logger.info(f"Updated pipeline status to FAILED: {executor.pipeline_logging_id}")
        except Exception as update_error:
            logger.error(
                f"Failed to update pipeline status to FAILED: {executor.pipeline_logging_id}",
                exc_info=True,
                extra={"update_error": str(update_error)}
            )

        # Return error details instead of None for better debugging
        return {
            "status": "FAILED",
            "error": error_msg,
            "pipeline_logging_id": executor.pipeline_logging_id,
            "org_slug": executor.org_slug,
            "pipeline_id": executor.pipeline_id
        }
    finally:
        # Report pipeline completion to api-service to update concurrent counter
        # This must run regardless of success/failure
        # CRITICAL: Pass reservation_date to ensure decrement on correct day's record
        if api_key:
            try:
                await report_pipeline_completion_to_api_service(
                    org_slug=org_slug,
                    pipeline_status=pipeline_status,
                    api_key=api_key,
                    reservation_date=reservation_date
                )
            except Exception as report_error:
                logger.error(
                    f"Failed to report pipeline completion to api-service: {report_error}",
                    extra={
                        "org_slug": org_slug,
                        "pipeline_logging_id": executor.pipeline_logging_id,
                        "pipeline_status": pipeline_status,
                        "reservation_date": reservation_date
                    }
                )
        else:
            logger.warning(
                f"No API key available to report pipeline completion: {executor.pipeline_logging_id}"
            )


@router.post(
    "/pipelines/run/{org_slug}/{path:path}",
    response_model=TriggerPipelineResponse,
    summary="Trigger a templated pipeline",
    description="Start execution of a pipeline from a template with automatic variable substitution. Rate limited: 50 requests/minute per org"
)
async def trigger_templated_pipeline(
    org_slug: str,
    path: str,
    background_tasks: BackgroundTasks,
    http_request: Request,
    request: TriggerPipelineRequest = TriggerPipelineRequest(),
    org: OrgContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Trigger a pipeline execution from a template with automatic variable substitution.

    This endpoint loads a template based on the path structure:
    - Cloud providers (4 segments): configs/{category}/{provider}/{domain}/{pipeline}.yml
    - GenAI/SaaS (3 segments): configs/{category}/{domain}/{pipeline}.yml

    Path Formats:
    - Cloud: /cloud/gcp/cost/billing → configs/cloud/gcp/cost/billing.yml
    - GenAI: /genai/payg/openai → configs/genai/payg/openai.yml
    - Subscription: /subscription/costs/subscription_cost → configs/subscription/costs/subscription_cost.yml

    Template Variables:
    - {org_slug} - Replaced with org_slug from path
    - {category} - Replaced with category (cloud, genai, saas)
    - {provider} - Replaced with provider (gcp, aws, azure) or empty for genai/saas
    - {domain} - Replaced with domain (cost, payg, costs)
    - {pipeline_name} - Replaced with pipeline name
    - {pipeline_id} - Auto-generated tracking ID

    Example:
    ```
    POST /api/v1/pipelines/run/acmeinc_23xv2/cloud/gcp/cost/billing
    Headers: X-API-Key: your-api-key
    Body: {"date": "2025-11-15"}
    ```

    This will:
    1. Load template from: configs/cloud/gcp/cost/billing.yml
    2. Replace {org_slug} with 'acmeinc_23xv2'
    3. Replace {pipeline_id} with 'acmeinc_23xv2-cloud-gcp-cost-billing'
    4. Execute the resolved pipeline

    Args:
        org_slug: Organization identifier (must match authenticated org)
        path: Pipeline path (e.g., 'cloud/gcp/cost/billing' or 'genai/payg/openai')
        request: Pipeline trigger request with optional parameters

    Returns:
        TriggerPipelineResponse with pipeline_logging_id for tracking

    Features:
    - Template-based configuration (one template, many orgs)
    - Automatic variable substitution
    - Async/await architecture for non-blocking operations
    - Parallel execution of independent pipeline steps
    - DAG-based dependency resolution
    - Built-in concurrency control - prevents duplicate pipeline execution
    - Rate limited: 50 requests/minute per org (prevents resource exhaustion)
    """
    # Parse path segments to determine category, provider, domain, pipeline
    path_parts = path.strip('/').split('/')

    if len(path_parts) == 4:
        # Cloud providers: category/provider/domain/pipeline
        category, provider, domain, template_name = path_parts
    elif len(path_parts) == 3:
        # GenAI/SaaS: category/domain/pipeline (no provider)
        category, domain, template_name = path_parts
        provider = ""
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid path format. Expected 'category/provider/domain/pipeline' (4 segments) or 'category/domain/pipeline' (3 segments). Got {len(path_parts)} segments: {path}"
        )
    # Apply rate limiting for expensive pipeline execution
    await rate_limit_by_org(
        http_request,
        org_slug=org.org_slug,
        limit_per_minute=settings.rate_limit_pipeline_run_per_minute,
        endpoint_name="trigger_templated_pipeline"
    )

    # ============================================
    # FIX 1: VALIDATE ORG_SLUG FORMAT (Security)
    # ============================================
    # Prevents path traversal and injection attacks
    if not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid org_slug format. Must be 3-50 alphanumeric characters with underscores."
        )

    # Verify org_slug matches authenticated org
    if org_slug != org.org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Org slug mismatch: authenticated as '{org.org_slug}' but requested '{org_slug}'"
        )

    # ============================================
    # VALIDATE WITH API-SERVICE (Centralized Validation)
    # ============================================
    # Call api-service to validate:
    # - Subscription is active
    # - Quota limits not exceeded
    # - Required integration is configured
    # api-service also increments concurrent counter on successful validation

    # Extract API key from request headers for service-to-service call
    api_key = http_request.headers.get("X-API-Key", "")

    # Construct pipeline_id for validation (matches registry format)
    # Format: {category}_{provider}_{domain}_{pipeline} for cloud, {category}_{domain}_{pipeline} for others
    # Examples: "cloud_gcp_cost_billing", "genai_payg_openai", "subscription_costs_subscription_cost"
    if provider:
        validation_pipeline_id = f"{category}_{provider}_{domain}_{template_name}"
    else:
        validation_pipeline_id = f"{category}_{domain}_{template_name}"

    logger.info(f"Calling api-service for validation: org={org_slug}, pipeline={validation_pipeline_id}")

    validation_result = await validate_pipeline_with_api_service(
        org_slug=org_slug,
        pipeline_id=validation_pipeline_id,
        api_key=api_key,
        include_credentials=False  # Credentials fetched separately during execution
    )

    if not validation_result.get("valid", False):
        error_code = validation_result.get("error_code", "UNKNOWN")
        error_msg = validation_result.get("error", "Validation failed")

        # Map error codes to appropriate HTTP status codes
        status_code_map = {
            "INVALID_API_KEY": status.HTTP_401_UNAUTHORIZED,
            "ACCESS_FORBIDDEN": status.HTTP_403_FORBIDDEN,
            "ORG_MISMATCH": status.HTTP_403_FORBIDDEN,
            "SUBSCRIPTION_INACTIVE": status.HTTP_403_FORBIDDEN,
            "SUBSCRIPTION_ERROR": status.HTTP_403_FORBIDDEN,
            "QUOTA_EXCEEDED": status.HTTP_429_TOO_MANY_REQUESTS,
            "INTEGRATION_NOT_CONFIGURED": status.HTTP_400_BAD_REQUEST,
            "INTEGRATION_ERROR": status.HTTP_400_BAD_REQUEST,
            "PIPELINE_NOT_FOUND": status.HTTP_404_NOT_FOUND,
            "PIPELINE_DISABLED": status.HTTP_400_BAD_REQUEST,
            "VALIDATION_TIMEOUT": status.HTTP_503_SERVICE_UNAVAILABLE,
            "VALIDATION_SERVICE_UNAVAILABLE": status.HTTP_503_SERVICE_UNAVAILABLE,
            "VALIDATION_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
        }

        http_status = status_code_map.get(error_code, status.HTTP_400_BAD_REQUEST)

        logger.warning(
            f"Pipeline validation failed: org={org_slug}, pipeline={validation_pipeline_id}, "
            f"error_code={error_code}, error={error_msg}"
        )

        raise HTTPException(
            status_code=http_status,
            detail=error_msg
        )

    logger.info(
        f"Pipeline validation successful: org={org_slug}, pipeline={validation_pipeline_id}",
        extra={
            "subscription": validation_result.get("subscription"),
            "quota": validation_result.get("quota")
        }
    )

    # CRITICAL: Capture the reservation date NOW (the date quota was reserved)
    # This ensures the concurrent counter decrement happens on the same day's record,
    # even if the pipeline spans midnight UTC
    from datetime import datetime as dt, timezone
    reservation_date = dt.now(timezone.utc).date().isoformat()

    # NOTE: Daily/monthly quota counters are now incremented atomically in api-service
    # when increment_pipeline_usage("RUNNING") is called. This prevents race conditions
    # where multiple concurrent requests could pass quota validation before any increments happen.
    # The api-service increments: concurrent_pipelines_running, pipelines_run_today, pipelines_run_month
    # all in one atomic UPDATE query at validation time.

    # Generate pipeline_id for tracking (includes org prefix)
    # Format: org_slug-category-provider-domain-pipeline or org_slug-category-domain-pipeline
    if provider:
        pipeline_id = f"{org_slug}-{category}-{provider}-{domain}-{template_name}"
    else:
        pipeline_id = f"{org_slug}-{category}-{domain}-{template_name}"

    # File identifier for config lookup (full path structure for disambiguation)
    # Examples: "cloud/aws/cost/focus_convert", "genai/unified/consolidate", "subscription/costs/subscription_cost"
    if provider:
        file_identifier = f"{category}/{provider}/{domain}/{template_name}"
    else:
        file_identifier = f"{category}/{domain}/{template_name}"

    # Get template path using category-based structure
    template_path = get_template_path(category, provider, domain, template_name)

    # Prepare template variables
    template_variables = {
        "org_slug": org_slug,
        "category": category,
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
            detail="Operation failed. Please check server logs for details."
        )

    # Note: Org dataset and operational tables created during onboarding
    # No need to ensure_org_metadata here - it would try to create API key tables

    # Extract parameters from request
    parameters = request.model_dump(exclude={'trigger_by'}, exclude_none=True)

    # Extract run_date from parameters
    run_date = parameters.get('date')

    # Generate pipeline_logging_id
    pipeline_logging_id = str(uuid.uuid4())

    # ATOMIC: Insert pipeline run ONLY IF no RUNNING/PENDING pipeline exists
    # Use centralized metadata table: organizations.org_meta_pipeline_runs
    org_pipeline_runs_table = f"{settings.gcp_project_id}.organizations.org_meta_pipeline_runs"

    insert_query = f"""
    INSERT INTO `{org_pipeline_runs_table}`
    (pipeline_logging_id, pipeline_id, org_slug, org_api_key_id, status, trigger_type, trigger_by, user_id, start_time, run_date, parameters, created_at)
    SELECT * FROM (
        SELECT
            @pipeline_logging_id AS pipeline_logging_id,
            @pipeline_id AS pipeline_id,
            @org_slug AS org_slug,
            @org_api_key_id AS org_api_key_id,
            'PENDING' AS status,
            @trigger_type AS trigger_type,
            @trigger_by AS trigger_by,
            @user_id AS user_id,
            CURRENT_TIMESTAMP() AS start_time,
            @run_date AS run_date,
            PARSE_JSON(@parameters) AS parameters,
            CURRENT_TIMESTAMP() AS created_at
    ) AS new_run
    WHERE NOT EXISTS (
        SELECT 1
        FROM `{org_pipeline_runs_table}`
        WHERE org_slug = @org_slug
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
    )
    """

    import json
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
            bigquery.ScalarQueryParameter("org_api_key_id", "STRING", org.org_api_key_id),
            bigquery.ScalarQueryParameter("trigger_type", "STRING", "api"),
            bigquery.ScalarQueryParameter("trigger_by", "STRING", request.trigger_by or "api_user"),
            bigquery.ScalarQueryParameter("user_id", "STRING", org.user_id),
            bigquery.ScalarQueryParameter("run_date", "DATE", run_date),
            bigquery.ScalarQueryParameter("parameters", "STRING", json.dumps(parameters) if parameters else "{}"),
        ]
    )

    # Execute atomic INSERT
    query_job = bq_client.client.query(insert_query, job_config=job_config)
    result = query_job.result()

    # FIX: Removed verification query to eliminate TOCTOU race condition
    # The atomic INSERT already tells us via num_dml_affected_rows whether it succeeded
    # Adding a separate SELECT introduces a race condition window

    # Check if row was inserted
    if query_job.num_dml_affected_rows > 0:
        # Successfully inserted - create executor with file identifier for config lookup
        # pipeline_id is used for YAML file lookup, tracking_pipeline_id is the full tracking ID for DB
        executor = AsyncPipelineExecutor(
            org_slug=org.org_slug,
            pipeline_id=file_identifier,  # Use file identifier for config lookup
            trigger_type="api",
            trigger_by=request.trigger_by or "api_user",
            tracking_pipeline_id=pipeline_id,  # Full tracking ID for database logging
            pipeline_logging_id=pipeline_logging_id,  # Pre-generated UUID from atomic INSERT
            user_id=org.user_id,
            org_api_key_id=org.org_api_key_id
        )

        # Execute pipeline in background
        # NOTE: Concurrent counter is managed by api-service:
        # - Incremented during validation (before this task starts)
        # - Decremented via completion reporting (at the end of the task)
        # - reservation_date ensures decrement happens on correct day's record
        background_tasks.add_task(run_async_pipeline_task, executor, parameters, org_slug, bq_client, api_key, reservation_date)

        return TriggerPipelineResponse(
            pipeline_logging_id=pipeline_logging_id,
            pipeline_id=pipeline_id,
            org_slug=org.org_slug,
            status="PENDING",
            message=f"Templated pipeline {template_name} triggered successfully for {org_slug} (async mode)"
        )
    else:
        # Pipeline already running/pending - use org-specific metadata table
        # Use CENTRAL organizations dataset for all metadata (not per-org)
        org_pipeline_runs_table = f"{settings.gcp_project_id}.organizations.org_meta_pipeline_runs"

        check_query = f"""
        SELECT pipeline_logging_id
        FROM `{org_pipeline_runs_table}`
        WHERE org_slug = @org_slug
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
        ORDER BY start_time DESC
        LIMIT 1
        """

        check_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
                bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            ]
        )

        existing_runs = list(bq_client.client.query(check_query, job_config=check_job_config).result())
        existing_pipeline_logging_id = existing_runs[0]["pipeline_logging_id"] if existing_runs else "unknown"

        return TriggerPipelineResponse(
            pipeline_logging_id=existing_pipeline_logging_id,
            pipeline_id=pipeline_id,
            org_slug=org.org_slug,
            status="RUNNING",
            message=f"Pipeline {pipeline_id} already running or pending - returning existing execution {existing_pipeline_logging_id}"
        )


@router.post(
    "/pipelines/run/{pipeline_id}",
    response_model=TriggerPipelineResponse,
    summary="Trigger a pipeline (DEPRECATED)",
    description="Start execution of a pipeline for the authenticated org with async parallel processing. DEPRECATED: Use /pipelines/run/{org_slug}/{provider}/{domain}/{template_name} instead. Rate limited: 50 requests/minute per org",
    deprecated=True
)
async def trigger_pipeline(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    http_request: Request,
    request: TriggerPipelineRequest = TriggerPipelineRequest(),
    org: OrgContext = Depends(verify_api_key),
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
    - Rate limited: 50 requests/minute per org (prevents resource exhaustion)
    """
    # Apply rate limiting for expensive pipeline execution
    await rate_limit_by_org(
        http_request,
        org_slug=org.org_slug,
        limit_per_minute=settings.rate_limit_pipeline_run_per_minute,
        endpoint_name="trigger_pipeline_deprecated"
    )

    # ============================================
    # QUOTA ENFORCEMENT (ALL LIMITS: Daily, Monthly, Concurrent)
    # ============================================
    org_slug = org.org_slug

    # BUG-003 FIX: Calculate UTC date once at the start for consistent date handling
    # This ensures all quota operations use the same date reference
    from datetime import datetime as dt, timezone as tz
    utc_today = dt.now(tz.utc).date()

    quota_query = f"""
    SELECT
        pipelines_run_today,
        daily_limit,
        pipelines_run_month,
        monthly_limit,
        concurrent_pipelines_running,
        concurrent_limit
    FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
    WHERE org_slug = @org_slug
      AND usage_date = @usage_date
    LIMIT 1
    """

    try:
        quota_result = list(bq_client.client.query(
            quota_query,
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("usage_date", "DATE", utc_today)
            ])
        ).result())

        if not quota_result:
            # Auto-create quota record for today
            sub_query = f"""
            SELECT daily_limit, monthly_limit, concurrent_limit
            FROM `{settings.gcp_project_id}.organizations.org_subscriptions`
            WHERE org_slug = @org_slug AND status = 'ACTIVE'
            LIMIT 1
            """
            sub_result = list(bq_client.client.query(
                sub_query,
                job_config=bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ])
            ).result())

            daily_limit = 6
            monthly_limit = 180
            concurrent_limit = 6
            if sub_result:
                daily_limit = sub_result[0].get("daily_limit", 6) or 6
                monthly_limit = sub_result[0].get("monthly_limit", 180) or 180
                concurrent_limit = sub_result[0].get("concurrent_limit", 6) or 6

            # BUG-003 FIX: Use parameterized date instead of CURRENT_DATE()
            # BUG-005 FIX: Use MERGE instead of INSERT to prevent race condition
            # Multiple concurrent requests could try to create the same quota record
            merge_query = f"""
            MERGE `{settings.gcp_project_id}.organizations.org_usage_quotas` T
            USING (
                SELECT
                    CONCAT(@org_slug, '_', FORMAT_DATE('%Y%m%d', @usage_date)) AS usage_id,
                    @org_slug AS org_slug,
                    @usage_date AS usage_date,
                    @daily_limit AS daily_limit,
                    @monthly_limit AS monthly_limit,
                    @concurrent_limit AS concurrent_limit
            ) S
            ON T.usage_id = S.usage_id
            WHEN NOT MATCHED THEN
                INSERT (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_failed_today,
                        pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
                        daily_limit, monthly_limit, concurrent_limit, created_at, last_updated)
                VALUES (S.usage_id, S.org_slug, S.usage_date, 0, 0, 0, 0, 0,
                        S.daily_limit, S.monthly_limit, S.concurrent_limit,
                        CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
            """
            bq_client.client.query(
                merge_query,
                job_config=bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", utc_today),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", daily_limit),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", monthly_limit),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", concurrent_limit),
                ])
            ).result()

            quota_result = [{
                "pipelines_run_today": 0, "daily_limit": daily_limit,
                "pipelines_run_month": 0, "monthly_limit": monthly_limit,
                "concurrent_pipelines_running": 0, "concurrent_limit": concurrent_limit
            }]

        quota = quota_result[0]

        # ENFORCE ALL THREE LIMITS
        if quota["pipelines_run_today"] >= quota["daily_limit"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Daily pipeline quota exceeded. Limit: {quota['daily_limit']}. Please upgrade or wait until tomorrow."
            )

        if quota["pipelines_run_month"] >= quota["monthly_limit"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Monthly pipeline quota exceeded. Limit: {quota['monthly_limit']}. Please upgrade or wait until next month."
            )

        # NOTE: Concurrent limit check is now ATOMIC inside the INSERT query below
        # This prevents race conditions where multiple requests check the limit simultaneously
        # and all increment the counter, exceeding the limit.

        logger.info(
            f"Quota check passed for org: {org_slug}",
            extra={
                "daily_used": quota["pipelines_run_today"],
                "daily_limit": quota["daily_limit"],
                "monthly_used": quota["pipelines_run_month"],
                "monthly_limit": quota["monthly_limit"],
                "concurrent_running": quota["concurrent_pipelines_running"],
                "concurrent_limit": quota["concurrent_limit"]
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to check quota for org {org_slug}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )

    # BUG-001 FIX: Capture reservation_date and api_key for concurrent counter management
    # This ensures the concurrent counter decrement happens on the correct day's record
    # BUG-003 FIX: Use the already-calculated utc_today for consistency
    deprecated_reservation_date = utc_today.isoformat()
    deprecated_api_key = http_request.headers.get("X-API-Key", "")

    # Note: Org dataset and operational tables created during onboarding
    # No need to ensure_org_metadata here - it would try to create API key tables

    # Extract parameters from request
    parameters = request.model_dump(exclude={'trigger_by'}, exclude_none=True)

    # Extract run_date from parameters (e.g., "2025-11-15")
    run_date = parameters.get('date')  # Will be None if not provided

    # Generate pipeline_logging_id
    import uuid
    pipeline_logging_id = str(uuid.uuid4())

    # ATOMIC: Insert pipeline run ONLY IF:
    # 1. No RUNNING/PENDING pipeline exists (prevent duplicates)
    # 2. Concurrent limit not exceeded (prevent race condition)
    # This single DML operation prevents race conditions by being atomic
    insert_query = f"""
    INSERT INTO `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    (pipeline_logging_id, pipeline_id, org_slug, org_api_key_id, status, trigger_type, trigger_by, user_id, start_time, run_date, parameters)
    SELECT * FROM (
        SELECT
            @pipeline_logging_id AS pipeline_logging_id,
            @pipeline_id AS pipeline_id,
            @org_slug AS org_slug,
            @org_api_key_id AS org_api_key_id,
            'PENDING' AS status,
            @trigger_type AS trigger_type,
            @trigger_by AS trigger_by,
            @user_id AS user_id,
            CURRENT_TIMESTAMP() AS start_time,
            @run_date AS run_date,
            PARSE_JSON(@parameters) AS parameters
    ) AS new_run
    WHERE NOT EXISTS (
        SELECT 1
        FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        WHERE org_slug = @org_slug
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
    )
    AND (
        -- ATOMIC concurrent limit check
        -- BUG-003 FIX: Use parameterized date instead of CURRENT_DATE()
        SELECT COALESCE(concurrent_pipelines_running, 0) < COALESCE(concurrent_limit, 999999)
        FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
        WHERE org_slug = @org_slug
          AND usage_date = @usage_date
    )
    """

    import json
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
            bigquery.ScalarQueryParameter("org_api_key_id", "STRING", org.org_api_key_id),
            bigquery.ScalarQueryParameter("trigger_type", "STRING", "api"),
            bigquery.ScalarQueryParameter("trigger_by", "STRING", request.trigger_by or "api_user"),
            bigquery.ScalarQueryParameter("user_id", "STRING", org.user_id),
            bigquery.ScalarQueryParameter("run_date", "DATE", run_date),
            bigquery.ScalarQueryParameter("parameters", "STRING", json.dumps(parameters) if parameters else "{}"),
            # BUG-003 FIX: Add usage_date for consistent date handling
            bigquery.ScalarQueryParameter("usage_date", "DATE", utc_today),
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
            org_slug=org.org_slug,
            pipeline_id=pipeline_id,
            trigger_type="api",
            trigger_by=request.trigger_by or "api_user",
            user_id=org.user_id,
            org_api_key_id=org.org_api_key_id
        )
        # Override the executor's pipeline_logging_id with our pre-generated one
        executor.pipeline_logging_id = pipeline_logging_id

        # NOTE: DO NOT increment concurrent counter here!
        # The API service's reserve_pipeline_quota_atomic() already incremented it during validation.
        # The counter is decremented when the pipeline completes (via completion reporting to API service).
        # Previous "BUG-001 FIX" was incorrectly doing a double-increment, causing counter leaks.

        # Execute pipeline in background with async error handling
        background_tasks.add_task(
            run_async_pipeline_task, executor, parameters, org_slug, bq_client,
            deprecated_api_key, deprecated_reservation_date
        )

        return TriggerPipelineResponse(
            pipeline_logging_id=pipeline_logging_id,
            pipeline_id=pipeline_id,
            org_slug=org.org_slug,
            status="PENDING",
            message=f"Pipeline {pipeline_id} triggered successfully (async mode)"
        )
    else:
        # INSERT was blocked - either duplicate pipeline OR concurrent limit exceeded
        # Check which condition caused the failure

        # First check: Is there a duplicate pipeline running?
        duplicate_check_query = f"""
        SELECT pipeline_logging_id
        FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        WHERE org_slug = @org_slug
          AND pipeline_id = @pipeline_id
          AND status IN ('RUNNING', 'PENDING')
        ORDER BY start_time DESC
        LIMIT 1
        """

        duplicate_check_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
                bigquery.ScalarQueryParameter("pipeline_id", "STRING", pipeline_id),
            ]
        )

        existing_runs = list(bq_client.client.query(duplicate_check_query, job_config=duplicate_check_config).result())

        if existing_runs:
            # Duplicate pipeline - return existing execution
            existing_pipeline_logging_id = existing_runs[0]["pipeline_logging_id"]
            return TriggerPipelineResponse(
                pipeline_logging_id=existing_pipeline_logging_id,
                pipeline_id=pipeline_id,
                org_slug=org.org_slug,
                status="RUNNING",
                message=f"Pipeline {pipeline_id} already running or pending - returning existing execution {existing_pipeline_logging_id}"
            )
        else:
            # No duplicate - must be concurrent limit exceeded
            # Re-fetch current quota to show accurate error message
            # BUG-003 FIX: Use parameterized date instead of CURRENT_DATE()
            quota_check_query = f"""
            SELECT concurrent_pipelines_running, concurrent_limit
            FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
            WHERE org_slug = @org_slug
              AND usage_date = @usage_date
            """

            quota_check_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", utc_today),
                ]
            )

            quota_results = list(bq_client.client.query(quota_check_query, job_config=quota_check_config).result())
            if quota_results:
                current_running = quota_results[0].get("concurrent_pipelines_running", 0)
                concurrent_limit = quota_results[0].get("concurrent_limit", 1)
            else:
                current_running = 0
                concurrent_limit = 1

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Concurrent pipeline limit exceeded. You have {current_running} pipelines running (limit: {concurrent_limit}). Please wait for a pipeline to complete."
            )


@router.get(
    "/pipelines/runs/{pipeline_logging_id}",
    response_model=PipelineRunResponse,
    summary="Get pipeline run status",
    description="Get details and status of a specific pipeline run"
)
async def get_pipeline_run(
    pipeline_logging_id: str,
    org: OrgContext = Depends(verify_api_key),
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
        org_slug,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        duration_ms
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE pipeline_logging_id = @pipeline_logging_id
      AND org_slug = @org_slug
    LIMIT 1
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
        ]
    )

    results = list(bq_client.client.query(query, job_config=job_config).result())

    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {pipeline_logging_id} not found for org {org.org_slug}"
        )

    row = dict(results[0])

    return PipelineRunResponse(**row)


@router.get(
    "/pipelines/runs",
    response_model=List[PipelineRunResponse],
    summary="List pipeline runs",
    description="List recent pipeline runs for the authenticated org"
)
async def list_pipeline_runs(
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    org: OrgContext = Depends(verify_api_key),
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
    where_clauses = [f"org_slug = @org_slug"]
    parameters = [
        ("org_slug", "STRING", org.org_slug),
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
        org_slug,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        duration_ms
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
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


# ============================================
# Org-Specific Pipeline Run Endpoints (Frontend)
# ============================================

@router.get(
    "/pipelines/{org_slug}/runs",
    response_model=PipelineRunsListResponse,
    summary="List pipeline runs for organization",
    description="List pipeline runs with pagination for the specified organization"
)
async def list_org_pipeline_runs(
    org_slug: str,
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline ID"),
    start_date: Optional[str] = Query(None, description="Filter runs after this date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter runs before this date (YYYY-MM-DD)"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    org: OrgContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List pipeline runs with pagination for the frontend.

    - **org_slug**: Organization slug (must match authenticated org)
    - **status_filter**: Optional filter by status (PENDING, RUNNING, COMPLETED, FAILED)
    - **pipeline_id**: Optional filter by pipeline ID
    - **start_date**: Optional filter runs after this date
    - **end_date**: Optional filter runs before this date
    - **limit**: Maximum number of results (1-100)
    - **offset**: Pagination offset

    Returns paginated list of pipeline runs.
    """
    # Validate org_slug matches authenticated org
    if org_slug != org.org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Org slug mismatch: authenticated as '{org.org_slug}' but requested '{org_slug}'"
        )

    # Build query with filters
    where_clauses = ["org_slug = @org_slug"]
    parameters = [("org_slug", "STRING", org.org_slug)]

    if status_filter:
        where_clauses.append("status = @status_filter")
        parameters.append(("status_filter", "STRING", status_filter.upper()))

    if pipeline_id:
        # Match pipeline_id containing the filter (for subscription pipelines)
        where_clauses.append("pipeline_id LIKE @pipeline_id_pattern")
        parameters.append(("pipeline_id_pattern", "STRING", f"%{pipeline_id}%"))

    if start_date:
        where_clauses.append("start_time >= @start_date")
        parameters.append(("start_date", "TIMESTAMP", start_date))

    if end_date:
        where_clauses.append("start_time <= @end_date")
        parameters.append(("end_date", "TIMESTAMP", end_date))

    where_sql = " AND ".join(where_clauses)

    # Count total matching records
    count_query = f"""
    SELECT COUNT(*) as total
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE {where_sql}
    """

    from google.cloud import bigquery as bq

    count_job_config = bq.QueryJobConfig(
        query_parameters=[
            bq.ScalarQueryParameter(name, type_, value)
            for name, type_, value in parameters
        ]
    )

    count_result = list(bq_client.client.query(count_query, job_config=count_job_config).result())
    total = count_result[0]["total"] if count_result else 0

    # Fetch paginated results
    query = f"""
    SELECT
        pipeline_logging_id,
        pipeline_id,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        duration_ms,
        CAST(run_date AS STRING) as run_date,
        error_message,
        TO_JSON_STRING(parameters) as parameters_json
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE {where_sql}
    ORDER BY start_time DESC
    LIMIT @limit
    OFFSET @offset
    """

    parameters.append(("limit", "INT64", limit))
    parameters.append(("offset", "INT64", offset))

    job_config = bq.QueryJobConfig(
        query_parameters=[
            bq.ScalarQueryParameter(name, type_, value)
            for name, type_, value in parameters
        ]
    )

    results = bq_client.client.query(query, job_config=job_config).result()

    runs = []
    for row in results:
        row_dict = dict(row)
        # Parse parameters JSON if present
        if row_dict.get("parameters_json"):
            import json
            try:
                row_dict["parameters"] = json.loads(row_dict["parameters_json"])
            except Exception:
                row_dict["parameters"] = None
        del row_dict["parameters_json"]
        runs.append(PipelineRunSummary(**row_dict))

    return PipelineRunsListResponse(
        runs=runs,
        total=total,
        limit=limit,
        offset=offset
    )


@router.get(
    "/pipelines/{org_slug}/runs/{pipeline_logging_id}",
    response_model=PipelineRunDetailResponse,
    summary="Get pipeline run detail with steps",
    description="Get detailed pipeline run information including step logs"
)
async def get_org_pipeline_run_detail(
    org_slug: str,
    pipeline_logging_id: str,
    org: OrgContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get detailed pipeline run with step logs.

    - **org_slug**: Organization slug (must match authenticated org)
    - **pipeline_logging_id**: Pipeline run ID

    Returns pipeline run details with step execution logs.
    """
    # Validate org_slug matches authenticated org
    if org_slug != org.org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Org slug mismatch: authenticated as '{org.org_slug}' but requested '{org_slug}'"
        )

    from google.cloud import bigquery as bq

    # Fetch pipeline run details
    run_query = f"""
    SELECT
        pipeline_logging_id,
        pipeline_id,
        status,
        trigger_type,
        trigger_by,
        start_time,
        end_time,
        duration_ms,
        CAST(run_date AS STRING) as run_date,
        error_message,
        TO_JSON_STRING(parameters) as parameters_json
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE pipeline_logging_id = @pipeline_logging_id
      AND org_slug = @org_slug
    LIMIT 1
    """

    run_job_config = bq.QueryJobConfig(
        query_parameters=[
            bq.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
            bq.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
        ]
    )

    run_results = list(bq_client.client.query(run_query, job_config=run_job_config).result())

    if not run_results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {pipeline_logging_id} not found for org {org.org_slug}"
        )

    run_row = dict(run_results[0])

    # Parse parameters JSON if present
    if run_row.get("parameters_json"):
        import json
        try:
            run_row["parameters"] = json.loads(run_row["parameters_json"])
        except Exception:
            run_row["parameters"] = None
    del run_row["parameters_json"]

    # Fetch step logs
    steps_query = f"""
    SELECT
        step_logging_id,
        step_name,
        step_type,
        step_index,
        status,
        start_time,
        end_time,
        duration_ms,
        rows_processed,
        error_message,
        TO_JSON_STRING(metadata) as metadata_json
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_step_logs`
    WHERE pipeline_logging_id = @pipeline_logging_id
    ORDER BY step_index ASC
    """

    steps_job_config = bq.QueryJobConfig(
        query_parameters=[
            bq.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
        ]
    )

    steps_results = bq_client.client.query(steps_query, job_config=steps_job_config).result()

    steps = []
    for step_row in steps_results:
        step_dict = dict(step_row)
        # Parse metadata JSON if present
        if step_dict.get("metadata_json"):
            import json
            try:
                step_dict["metadata"] = json.loads(step_dict["metadata_json"])
            except Exception:
                step_dict["metadata"] = None
        del step_dict["metadata_json"]
        steps.append(StepLogSummary(**step_dict))

    return PipelineRunDetailResponse(
        **run_row,
        steps=steps
    )


@router.delete(
    "/pipelines/runs/{pipeline_logging_id}",
    summary="Cancel pipeline run",
    description="Attempt to cancel a running pipeline"
)
async def cancel_pipeline_run(
    pipeline_logging_id: str,
    org: OrgContext = Depends(verify_api_key)
):
    """
    Cancel a running pipeline.

    - **pipeline_logging_id**: Pipeline run ID to cancel

    Sets the pipeline status to 'CANCELLING' in BigQuery. The executor will detect this
    and gracefully stop before the next step. In-progress steps will complete.

    Returns:
        - pipeline_logging_id: The cancelled pipeline ID
        - status: Current status after cancellation request
        - message: Human-readable message
    """
    from google.cloud import bigquery

    try:
        # Get BigQuery client
        bq_client = get_bigquery_client()

        # Check if pipeline exists and belongs to the org
        check_query = f"""
        SELECT pipeline_logging_id, pipeline_id, status, start_time
        FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        WHERE pipeline_logging_id = @pipeline_logging_id
          AND org_slug = @org_slug
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org.org_slug),
            ]
        )

        query_job = bq_client.client.query(check_query, job_config=job_config)
        rows = list(query_job.result())

        if not rows:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "pipeline_not_found",
                    "message": f"Pipeline run {pipeline_logging_id} not found for organization {org.org_slug}"
                }
            )

        pipeline_row = rows[0]
        current_status = pipeline_row['status']

        # Check if pipeline can be cancelled
        if current_status in ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']:
            return {
                "pipeline_logging_id": pipeline_logging_id,
                "status": current_status,
                "message": f"Pipeline already finished with status: {current_status}. Cannot cancel."
            }

        # Update status to CANCELLING (executor will detect this and stop gracefully)
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        SET status = 'CANCELLING'
        WHERE pipeline_logging_id = @pipeline_logging_id
          AND org_slug = @org_slug
          AND status IN ('PENDING', 'RUNNING')
        """

        update_job = bq_client.client.query(update_query, job_config=job_config)
        update_job.result()

        rows_updated = update_job.num_dml_affected_rows or 0

        if rows_updated == 0:
            # Race condition: status changed between check and update
            return {
                "pipeline_logging_id": pipeline_logging_id,
                "status": current_status,
                "message": f"Pipeline status changed to {current_status} before cancellation could be applied."
            }

        logger.info(
            f"Pipeline cancellation requested",
            extra={
                "pipeline_logging_id": pipeline_logging_id,
                "org_slug": org.org_slug,
                "previous_status": current_status
            }
        )

        return {
            "pipeline_logging_id": pipeline_logging_id,
            "status": "CANCELLING",
            "message": "Pipeline cancellation requested. In-progress steps will complete, then pipeline will stop."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error cancelling pipeline: {e}",
            extra={
                "pipeline_logging_id": pipeline_logging_id,
                "org_slug": org.org_slug
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "cancellation_failed",
                "message": f"Failed to cancel pipeline: {str(e)}"
            }
        )


# ============================================
# Pub/Sub Batch Pipeline Execution
# ============================================

class BatchPipelinePublishRequest(BaseModel):
    """Request to publish batch pipeline tasks to Pub/Sub."""
    org_slugs: List[str] = Field(..., description="List of org slugs (can be 10k+)")
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
    description="Publish pipeline tasks for multiple orgs to Pub/Sub for distributed execution (ADMIN ONLY)"
)
async def publish_batch_pipeline(
    request: BatchPipelinePublishRequest,
    admin_context: None = Depends(verify_admin_key)
):
    """
    Publish pipeline tasks for multiple orgs to Pub/Sub.

    This endpoint is for ADMIN use only. It publishes tasks that will be
    executed asynchronously by worker instances.

    Use Cases:
    - Daily batch processing for all 10k orgs
    - Backfill pipelines for multiple orgs
    - Distributed execution with load leveling
    """
    from src.core.pubsub.publisher import PipelinePublisher

    publisher = PipelinePublisher()

    result = await publisher.publish_pipeline_batch(
        org_slugs=request.org_slugs,
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
