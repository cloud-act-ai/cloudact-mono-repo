"""
Rate Limiting Decorators for FastAPI Endpoints
Provides convenient decorators for protecting endpoints with rate limiting.
"""

import logging
from functools import wraps
from typing import Optional, Callable
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse

from src.core.utils.rate_limiter import get_rate_limiter
from src.app.config import settings

logger = logging.getLogger(__name__)


async def get_tenant_from_request(request: Request) -> Optional[str]:
    """
    Extract tenant_id from request context.

    Priority:
    1. From request.state.tenant_id (set by auth middleware)
    2. From path parameters (if available)
    3. From X-Tenant-ID header

    Args:
        request: FastAPI request object

    Returns:
        tenant_id if found, None otherwise
    """
    # Check if set by auth middleware
    if hasattr(request.state, "tenant_id"):
        return request.state.tenant_id

    # Check path parameters for tenant_id
    if "tenant_id" in request.path_params:
        return request.path_params["tenant_id"]

    # Check headers
    tenant_id = request.headers.get("x-tenant-id")
    if tenant_id:
        return tenant_id

    return None


async def rate_limit_by_tenant(
    request: Request,
    tenant_id: str,
    limit_per_minute: Optional[int] = None,
    endpoint_name: str = "unknown"
) -> tuple[bool, dict]:
    """
    Check tenant-level rate limit.

    Args:
        request: FastAPI request object
        tenant_id: Tenant identifier
        limit_per_minute: Custom per-minute limit (uses default if None)
        endpoint_name: Name of endpoint for logging

    Returns:
        Tuple of (is_allowed, metadata)

    Raises:
        HTTPException: If rate limit exceeded
    """
    if not settings.rate_limit_enabled:
        return True, {}

    rate_limiter = get_rate_limiter()

    # Use custom limit or default
    limit_minute = limit_per_minute or settings.rate_limit_requests_per_minute
    limit_hour = settings.rate_limit_requests_per_hour

    is_allowed, metadata = await rate_limiter.check_tenant_limit(
        tenant_id,
        limit_per_minute=limit_minute,
        limit_per_hour=limit_hour
    )

    if not is_allowed:
        logger.warning(
            f"Rate limit exceeded for tenant {tenant_id} on {endpoint_name}",
            extra={
                "tenant_id": tenant_id,
                "endpoint": endpoint_name,
                "remaining_minute": metadata["minute"]["remaining"],
                "reset_minute": metadata["minute"]["reset"]
            }
        )

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "message": f"Too many requests for tenant {tenant_id}",
                "retry_after": metadata["minute"]["reset"]
            }
        )

    return is_allowed, metadata


async def rate_limit_global(
    request: Request,
    endpoint_name: str = "unknown",
    limit_per_minute: Optional[int] = None
) -> tuple[bool, dict]:
    """
    Check global (unauthenticated) rate limit.

    Args:
        request: FastAPI request object
        endpoint_name: Name of endpoint for logging
        limit_per_minute: Custom per-minute limit (uses global default if None)

    Returns:
        Tuple of (is_allowed, metadata)

    Raises:
        HTTPException: If rate limit exceeded
    """
    if not settings.rate_limit_enabled:
        return True, {}

    rate_limiter = get_rate_limiter()

    # Use custom limit or global default
    limit_minute = limit_per_minute or settings.rate_limit_global_requests_per_minute
    limit_hour = settings.rate_limit_global_requests_per_hour

    is_allowed, metadata = await rate_limiter.check_global_limit(
        endpoint_name,
        limit_per_minute=limit_minute,
        limit_per_hour=limit_hour
    )

    if not is_allowed:
        logger.warning(
            f"Global rate limit exceeded for {endpoint_name}",
            extra={
                "endpoint": endpoint_name,
                "remaining_minute": metadata["minute"]["remaining"],
                "reset_minute": metadata["minute"]["reset"]
            }
        )

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "message": f"Global rate limit exceeded for {endpoint_name}",
                "retry_after": metadata["minute"]["reset"]
            }
        )

    return is_allowed, metadata


def add_rate_limit_headers(
    response,
    limit: int,
    remaining: int,
    reset: int
) -> None:
    """
    Add standard rate limit headers to response.

    Uses X-RateLimit-* headers per RFC 6585.

    Args:
        response: FastAPI response object
        limit: Rate limit (requests per minute)
        remaining: Remaining requests in current window
        reset: Unix timestamp when limit resets
    """
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(reset)
