"""
Pipeline Proxy Endpoints

Centralizes all pipeline triggers through API service (8000).
Frontend calls these endpoints instead of pipeline service (8001) directly.

Features:
- Status check: Which pipelines ran today for org
- Trigger proxy: Forward pipeline triggers to pipeline-service
- Single backend URL for frontend
- 30-second TTL cache for status checks
- Retry logic for transient failures

Race Condition Handling:
Pipeline service already has atomic INSERT with duplicate check.
Even if 10 users trigger simultaneously, only 1 execution happens.

Fixes Applied:
- #1: UTC timezone consistency
- #2: Path validation for provider/domain/pipeline
- #3: Shared httpx client with connection pooling
- #5: Partition filter for BigQuery queries
- #7: Rate limit return value checking
- #8: Retry logic with exponential backoff
- #10: Status cache with 30s TTL
- #11: Cache mutation fix (return copy)
- #12: Cache invalidation after trigger
- #13: httpx client shutdown hook
- #14: Thread-safe cache operations

Enhancements:
- E1: X-RateLimit-* headers on responses
- E2: X-Request-ID for distributed tracing
- E3: Cache hit/miss metrics
- E4: API key scope enforcement (backward compatible)
"""

import httpx
import logging
import re
import asyncio
import uuid
from dataclasses import dataclass, field
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from cachetools import TTLCache
from threading import Lock

from src.app.dependencies.auth import verify_api_key, OrgContext
from src.app.dependencies.rate_limit_decorator import rate_limit_by_org
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from google.cloud import bigquery


logger = logging.getLogger(__name__)


# ==============================================================================
# Constants
# ==============================================================================

# Required scope for pipeline operations (E4)
PIPELINE_EXECUTE_SCOPE = "pipelines:execute"
PIPELINE_READ_SCOPE = "pipelines:read"


# ==============================================================================
# Validation Patterns
# ==============================================================================

# Valid org_slug pattern: alphanumeric + underscore, 3-50 chars
ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')

# Valid path segment pattern: alphanumeric + underscore, 1-50 chars
# Used for provider, domain, pipeline names
PATH_SEGMENT_PATTERN = re.compile(r'^[a-zA-Z0-9_]{1,50}$')


def validate_org_slug_format(org_slug: str) -> None:
    """Validate org_slug format to prevent SQL injection."""
    if not ORG_SLUG_PATTERN.match(org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid organization identifier format"
        )


def validate_path_segment(segment: str, name: str) -> None:
    """
    Validate path segment (provider, domain, pipeline) to prevent path traversal.

    Args:
        segment: The path segment value
        name: Human-readable name for error messages (e.g., "provider")

    Raises:
        HTTPException: If segment contains invalid characters
    """
    if not PATH_SEGMENT_PATTERN.match(segment):
        logger.warning(
            f"SECURITY: Invalid path segment blocked",
            extra={
                "segment_type": name,
                # Don't log the actual value to avoid log injection
            }
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {name}: must be 1-50 alphanumeric characters or underscores"
        )


def validate_org_access(url_org_slug: str, auth_context: OrgContext) -> None:
    """Ensure URL org_slug matches authenticated org."""
    validate_org_slug_format(url_org_slug)
    if url_org_slug != auth_context.org_slug:
        logger.warning(
            f"SECURITY: Cross-tenant access attempt blocked",
            extra={
                "requested_org": url_org_slug,
                "authenticated_org": auth_context.org_slug
            }
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only access your own organization's data"
        )


def validate_scope(auth_context: OrgContext, required_scope: str) -> None:
    """
    Validate API key has required scope. (E4)

    Backward compatible: If scopes is empty/None, allow all operations.
    This ensures existing API keys without scopes continue to work.

    Args:
        auth_context: Authenticated org context with scopes
        required_scope: The scope required for this operation

    Raises:
        HTTPException: If scope is required but not present
    """
    scopes = auth_context.scopes or []

    # Backward compatible: empty scopes means all permissions (legacy keys)
    if not scopes:
        return

    # Check if required scope is present
    if required_scope not in scopes and "*" not in scopes:
        logger.warning(
            f"SECURITY: Scope violation blocked",
            extra={
                "org_slug": auth_context.org_slug,
                "required_scope": required_scope,
                "available_scopes": scopes
            }
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key lacks required scope: {required_scope}"
        )


# ==============================================================================
# Request ID Helper (E2)
# ==============================================================================

def get_request_id(request: Request) -> str:
    """
    Get or generate request ID for distributed tracing.

    Checks for existing X-Request-ID header, generates UUID if not present.
    """
    request_id = request.headers.get("x-request-id")
    if not request_id:
        request_id = str(uuid.uuid4())
    return request_id


# ==============================================================================
# HTTP Client (Shared Singleton with Shutdown)
# ==============================================================================

_http_client: Optional[httpx.AsyncClient] = None
_client_lock = asyncio.Lock()


async def get_http_client() -> httpx.AsyncClient:
    """
    Get shared httpx client with connection pooling.
    Uses singleton pattern with async lock for thread safety.
    """
    global _http_client
    if _http_client is None:
        async with _client_lock:
            # Double-check after acquiring lock
            if _http_client is None:
                _http_client = httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0, connect=10.0),
                    limits=httpx.Limits(
                        max_keepalive_connections=20,
                        max_connections=100,
                        keepalive_expiry=30.0
                    )
                )
                logger.info("Created shared httpx client for pipeline proxy")
    return _http_client


async def close_http_client() -> None:
    """
    Close the shared httpx client.
    FIX #13: Called during application shutdown to prevent resource leaks.
    """
    global _http_client
    if _http_client is not None:
        async with _client_lock:
            if _http_client is not None:
                await _http_client.aclose()
                _http_client = None
                logger.info("Closed shared httpx client for pipeline proxy")


# ==============================================================================
# Thread-Safe Status Cache with Metrics (E3)
# ==============================================================================

_status_cache: TTLCache = TTLCache(maxsize=1000, ttl=30)
_cache_lock = Lock()


@dataclass
class CacheMetrics:
    """Cache performance metrics (E3)."""
    hits: int = 0
    misses: int = 0
    invalidations: int = 0

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "invalidations": self.invalidations,
            "hit_rate": round(self.hit_rate, 4),
            "total_requests": self.hits + self.misses
        }


_cache_metrics = CacheMetrics()


def cache_get(key: str) -> Optional[Any]:
    """Thread-safe cache get with metrics (E3)."""
    global _cache_metrics
    with _cache_lock:
        value = _status_cache.get(key)
        if value is not None:
            _cache_metrics.hits += 1
        else:
            _cache_metrics.misses += 1
        return value


def cache_set(key: str, value: Any) -> None:
    """Thread-safe cache set."""
    with _cache_lock:
        _status_cache[key] = value


def cache_delete(key: str) -> None:
    """Thread-safe cache delete with metrics (E3)."""
    global _cache_metrics
    with _cache_lock:
        if key in _status_cache:
            _status_cache.pop(key, None)
            _cache_metrics.invalidations += 1


def cache_delete_for_org(org_slug: str) -> None:
    """
    Delete all cache entries for an org with metrics (E3).
    FIX #12: Called after pipeline trigger to invalidate stale status.
    """
    global _cache_metrics
    with _cache_lock:
        # Find and delete all keys for this org
        keys_to_delete = [k for k in _status_cache.keys() if k.startswith(f"pipeline_status:{org_slug}:")]
        for key in keys_to_delete:
            _status_cache.pop(key, None)
        if keys_to_delete:
            _cache_metrics.invalidations += len(keys_to_delete)
            logger.debug(f"Invalidated {len(keys_to_delete)} cache entries for {org_slug}")


def get_cache_metrics() -> Dict[str, Any]:
    """Get current cache metrics (E3)."""
    with _cache_lock:
        return _cache_metrics.to_dict()


router = APIRouter(prefix="/pipelines", tags=["Pipeline Proxy"])


# ==============================================================================
# Rate Limit Headers Helper (E1)
# ==============================================================================

def add_rate_limit_headers(response: Response, rate_metadata: Dict[str, Any], limit: int) -> None:
    """
    Add X-RateLimit-* headers to response (E1).

    Headers:
    - X-RateLimit-Limit: Max requests allowed per minute
    - X-RateLimit-Remaining: Requests remaining in current window
    - X-RateLimit-Reset: Seconds until limit resets
    """
    minute_data = rate_metadata.get("minute", {})
    remaining = max(0, limit - minute_data.get("count", 0))
    reset = minute_data.get("reset", 60)

    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(int(reset))


# ==============================================================================
# Request/Response Models
# ==============================================================================

class PipelineTriggerRequest(BaseModel):
    """Request body for triggering a pipeline."""
    start_date: Optional[str] = Field(
        None,
        description="Start date in YYYY-MM-DD format",
        pattern=r'^\d{4}-\d{2}-\d{2}$'
    )
    end_date: Optional[str] = Field(
        None,
        description="End date in YYYY-MM-DD format",
        pattern=r'^\d{4}-\d{2}-\d{2}$'
    )


class PipelineRunStatus(BaseModel):
    """Status of a single pipeline type."""
    pipeline_id: str
    last_run: Optional[str] = None
    status: Optional[str] = None
    ran_today: bool = False
    succeeded_today: bool = False


class PipelineStatusResponse(BaseModel):
    """Response for pipeline status check."""
    org_slug: str
    check_date: str
    pipelines: Dict[str, PipelineRunStatus]
    cached: bool = False
    request_id: Optional[str] = None  # E2: For distributed tracing

    def with_cached(self, cached: bool) -> "PipelineStatusResponse":
        """
        Return a copy with cached flag set.
        FIX #11: Don't mutate cached objects.
        """
        return PipelineStatusResponse(
            org_slug=self.org_slug,
            check_date=self.check_date,
            pipelines=self.pipelines,
            cached=cached,
            request_id=self.request_id
        )


class PipelineTriggerResponse(BaseModel):
    """Response from pipeline trigger."""
    pipeline_logging_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    org_slug: str
    status: str
    message: str
    request_id: Optional[str] = None  # E2: For distributed tracing


class CacheMetricsResponse(BaseModel):
    """Response for cache metrics endpoint (E3)."""
    hits: int
    misses: int
    invalidations: int
    hit_rate: float
    total_requests: int


# ==============================================================================
# Cache Metrics Endpoint (E3)
# ==============================================================================

@router.get(
    "/metrics/cache",
    response_model=CacheMetricsResponse,
    summary="Get cache metrics",
    description="Returns cache hit/miss statistics for monitoring."
)
async def get_cache_metrics_endpoint(
    request: Request,
    org_context: OrgContext = Depends(verify_api_key)
) -> CacheMetricsResponse:
    """Get cache performance metrics (E3)."""
    request_id = get_request_id(request)
    metrics = get_cache_metrics()

    logger.info(
        "Cache metrics requested",
        extra={
            "request_id": request_id,
            "org_slug": org_context.org_slug,
            "metrics": metrics
        }
    )

    return CacheMetricsResponse(**metrics)


# ==============================================================================
# Pipeline Status Endpoint
# ==============================================================================

@router.get(
    "/status/{org_slug}",
    response_model=PipelineStatusResponse,
    summary="Check pipeline status for org",
    description="""
    Check which pipelines ran today for an organization.
    Used by frontend on login to decide what pipelines to trigger.

    Returns status for known pipeline types:
    - saas_subscription_costs: SaaS subscription cost calculation
    - gcp_billing: GCP billing cost extraction (future)
    - llm_costs: LLM API usage costs (future)

    Results are cached for 30 seconds to reduce BigQuery costs.

    Required scope: pipelines:read (or no scopes for legacy keys)
    """
)
async def get_pipeline_status(
    org_slug: str,
    request: Request,
    response: Response,
    org_context: OrgContext = Depends(verify_api_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> PipelineStatusResponse:
    """Check which pipelines ran today for org."""

    # E2: Get request ID for tracing
    request_id = get_request_id(request)
    response.headers["X-Request-ID"] = request_id

    # Validate access
    validate_org_access(org_slug, org_context)

    # E4: Validate scope (backward compatible)
    validate_scope(org_context, PIPELINE_READ_SCOPE)

    # Apply rate limiting (60 requests per minute per org)
    is_allowed, rate_metadata = await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=60,
        endpoint_name="pipeline_status"
    )

    # E1: Add rate limit headers
    add_rate_limit_headers(response, rate_metadata, 60)

    if not is_allowed:
        retry_after = int(rate_metadata.get("minute", {}).get("reset", 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded for pipeline status checks",
            headers={
                "Retry-After": str(retry_after),
                "X-Request-ID": request_id
            }
        )

    # Use UTC consistently for date checks
    today_utc = datetime.now(timezone.utc).date().isoformat()

    # Check cache first (thread-safe with metrics)
    cache_key = f"pipeline_status:{org_slug}:{today_utc}"
    cached_response = cache_get(cache_key)
    if cached_response is not None:
        # FIX #11: Return copy with cached=True, don't mutate cached object
        result = cached_response.with_cached(True)
        result.request_id = request_id

        logger.debug(
            "Cache hit for pipeline status",
            extra={"request_id": request_id, "org_slug": org_slug}
        )
        return result

    # Query org_meta_pipeline_runs for today's runs (UTC)
    # Uses date partition filter for efficient querying
    query = f"""
    SELECT
        pipeline_id,
        MAX(start_time) as last_run,
        MAX(status) as latest_status,
        MAX(CASE WHEN status IN ('COMPLETED', 'SUCCESS') THEN 1 ELSE 0 END) as succeeded_today
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE org_slug = @org_slug
      AND DATE(start_time, 'UTC') = CURRENT_DATE('UTC')
      AND start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    GROUP BY pipeline_id
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]
    )

    try:
        results = list(bq_client.client.query(query, job_config=job_config).result())
    except Exception as e:
        logger.warning(
            f"Failed to query pipeline status",
            extra={"request_id": request_id, "error": str(e)}
        )
        results = []

    # Build status dict from query results
    pipeline_status: Dict[str, PipelineRunStatus] = {}

    for row in results:
        pipeline_id = row.get("pipeline_id", "")
        last_run = row.get("last_run")
        latest_status = row.get("latest_status", "")
        succeeded_today = row.get("succeeded_today", 0) == 1

        # Normalize pipeline_id to a known type
        normalized_id = _normalize_pipeline_id(pipeline_id)

        pipeline_status[normalized_id] = PipelineRunStatus(
            pipeline_id=pipeline_id,
            last_run=last_run.isoformat() if last_run else None,
            status=latest_status,
            ran_today=True,
            succeeded_today=succeeded_today
        )

    # Add entries for known pipeline types that haven't run
    known_pipelines = ["saas_subscription_costs", "gcp_billing", "llm_costs"]
    for known_id in known_pipelines:
        if known_id not in pipeline_status:
            pipeline_status[known_id] = PipelineRunStatus(
                pipeline_id=known_id,
                ran_today=False,
                succeeded_today=False
            )

    result = PipelineStatusResponse(
        org_slug=org_slug,
        check_date=today_utc,
        pipelines=pipeline_status,
        cached=False,
        request_id=request_id
    )

    # Cache the response (thread-safe)
    cache_set(cache_key, result)

    logger.debug(
        "Cache miss for pipeline status, cached new response",
        extra={"request_id": request_id, "org_slug": org_slug}
    )

    return result


def _normalize_pipeline_id(pipeline_id: str) -> str:
    """
    Normalize pipeline_id to known type.

    Examples:
        "guru_inc-saas_subscription-costs-saas_cost" -> "saas_subscription_costs"
        "guru_inc-gcp-cost-billing" -> "gcp_billing"
    """
    pipeline_id_lower = pipeline_id.lower()

    if "saas_subscription" in pipeline_id_lower or "saas_cost" in pipeline_id_lower:
        return "saas_subscription_costs"
    elif "gcp" in pipeline_id_lower and ("billing" in pipeline_id_lower or "cost" in pipeline_id_lower):
        return "gcp_billing"
    elif "llm" in pipeline_id_lower or "openai" in pipeline_id_lower or "anthropic" in pipeline_id_lower:
        return "llm_costs"
    else:
        return pipeline_id


# ==============================================================================
# Pipeline Trigger Proxy Endpoint
# ==============================================================================

async def _call_pipeline_service_with_retry(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    body: dict,
    max_retries: int = 3
) -> httpx.Response:
    """
    Call pipeline service with retry logic for transient failures.

    Retries on:
    - Connection errors
    - Timeout errors
    - 502, 503, 504 status codes

    Uses exponential backoff: 1s, 2s, 4s
    """
    last_exception = None

    for attempt in range(max_retries):
        try:
            response = await client.post(url, headers=headers, json=body)

            # Retry on gateway errors
            if response.status_code in (502, 503, 504):
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # 1, 2, 4 seconds
                    logger.warning(
                        f"Pipeline service returned {response.status_code}, retrying in {wait_time}s",
                        extra={"attempt": attempt + 1, "max_retries": max_retries}
                    )
                    await asyncio.sleep(wait_time)
                    continue

            return response

        except (httpx.TimeoutException, httpx.RequestError) as e:
            last_exception = e
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                logger.warning(
                    f"Pipeline service request failed: {e}, retrying in {wait_time}s",
                    extra={"attempt": attempt + 1, "max_retries": max_retries}
                )
                await asyncio.sleep(wait_time)
            else:
                raise

    # This shouldn't be reached, but just in case
    if last_exception:
        raise last_exception
    raise httpx.RequestError("Max retries exceeded")


@router.post(
    "/trigger/{org_slug}/{provider}/{domain}/{pipeline}",
    response_model=PipelineTriggerResponse,
    summary="Trigger a pipeline",
    description="""
    Proxy pipeline trigger to pipeline-service (8001).

    This endpoint centralizes all pipeline triggers through API service.
    Frontend should call this instead of pipeline service directly.

    Race conditions are handled by pipeline service:
    - Atomic INSERT with duplicate check
    - If pipeline already running, returns existing execution ID
    - Concurrent limit enforced atomically

    Includes retry logic for transient failures (502, 503, 504).

    Required scope: pipelines:execute (or no scopes for legacy keys)

    Example paths:
    - /trigger/acme/saas_subscription/costs/saas_cost
    - /trigger/acme/gcp/cost/billing
    """
)
async def trigger_pipeline(
    org_slug: str,
    provider: str,
    domain: str,
    pipeline: str,
    request: Request,
    response: Response,
    body: PipelineTriggerRequest = PipelineTriggerRequest(),
    org_context: OrgContext = Depends(verify_api_key)
) -> PipelineTriggerResponse:
    """Proxy pipeline trigger to pipeline-service."""

    # E2: Get request ID for tracing
    request_id = get_request_id(request)
    response.headers["X-Request-ID"] = request_id

    # Validate access
    validate_org_access(org_slug, org_context)

    # E4: Validate scope (backward compatible)
    validate_scope(org_context, PIPELINE_EXECUTE_SCOPE)

    # Validate path segments to prevent path traversal/injection
    validate_path_segment(provider, "provider")
    validate_path_segment(domain, "domain")
    validate_path_segment(pipeline, "pipeline")

    # Apply rate limiting (30 requests per minute per org for pipeline triggers)
    is_allowed, rate_metadata = await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=30,
        endpoint_name="pipeline_trigger"
    )

    # E1: Add rate limit headers
    add_rate_limit_headers(response, rate_metadata, 30)

    if not is_allowed:
        retry_after = int(rate_metadata.get("minute", {}).get("reset", 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded for pipeline triggers",
            headers={
                "Retry-After": str(retry_after),
                "X-Request-ID": request_id
            }
        )

    # Get API key from request headers for forwarding
    api_key = request.headers.get("x-api-key", "")

    # Build pipeline service URL (path segments already validated)
    pipeline_url = f"{settings.pipeline_service_url}/api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}"

    logger.info(
        f"Proxying pipeline trigger",
        extra={
            "request_id": request_id,
            "org_slug": org_slug,
            "provider": provider,
            "domain": domain,
            "pipeline": pipeline,
            "target_url": pipeline_url
        }
    )

    # Build request body
    request_body = {}
    if body.start_date:
        request_body["start_date"] = body.start_date
    if body.end_date:
        request_body["end_date"] = body.end_date

    try:
        client = await get_http_client()
        proxy_response = await _call_pipeline_service_with_retry(
            client=client,
            url=pipeline_url,
            headers={
                "X-API-Key": api_key,
                "X-Request-ID": request_id,  # E2: Forward request ID
                "Content-Type": "application/json"
            },
            body=request_body
        )

        # Parse response
        if proxy_response.status_code == 200:
            data = proxy_response.json()

            # FIX #12: Invalidate cache after successful trigger
            # so next status check shows the new pipeline run
            cache_delete_for_org(org_slug)

            return PipelineTriggerResponse(
                pipeline_logging_id=data.get("pipeline_logging_id"),
                pipeline_id=data.get("pipeline_id"),
                org_slug=org_slug,
                status=data.get("status", "PENDING"),
                message=data.get("message", "Pipeline triggered successfully"),
                request_id=request_id
            )
        elif proxy_response.status_code == 429:
            # Rate limit or concurrent limit from pipeline service
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=proxy_response.json().get("detail", "Pipeline rate limit exceeded"),
                headers={"X-Request-ID": request_id}
            )
        else:
            # Other errors
            try:
                error_detail = proxy_response.json().get("detail", proxy_response.text)
            except Exception:
                error_detail = proxy_response.text

            logger.error(
                f"Pipeline service returned error",
                extra={
                    "request_id": request_id,
                    "status_code": proxy_response.status_code,
                    "detail": error_detail,
                    "org_slug": org_slug
                }
            )
            raise HTTPException(
                status_code=proxy_response.status_code,
                detail=f"Pipeline service error: {error_detail}",
                headers={"X-Request-ID": request_id}
            )

    except httpx.TimeoutException:
        logger.error(
            f"Pipeline service timeout after retries",
            extra={"request_id": request_id, "org_slug": org_slug}
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Pipeline service timed out after retries",
            headers={"X-Request-ID": request_id}
        )
    except httpx.RequestError as e:
        logger.error(
            f"Pipeline service connection error after retries",
            extra={"request_id": request_id, "org_slug": org_slug, "error": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to pipeline service after retries: {str(e)}",
            headers={"X-Request-ID": request_id}
        )
