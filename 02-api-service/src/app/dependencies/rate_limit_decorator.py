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


async def get_org_from_request(request: Request) -> Optional[str]:
    """
    Extract org_slug from request context.

    Priority:
    1. From request.state.org_slug (set by auth middleware)
    2. From path parameters (if available)
    3. From X-Org-Slug header

    Args:
        request: FastAPI request object

    Returns:
        org_slug if found, None otherwise
    """
    # Check if set by auth middleware
    if hasattr(request.state, "org_slug"):
        return request.state.org_slug

    # Check path parameters for org_slug
    if "org_slug" in request.path_params:
        return request.path_params["org_slug"]

    # Check headers
    org_slug = request.headers.get("x-org-slug")
    if org_slug:
        return org_slug

    return None


async def rate_limit_by_org(
    request: Request,
    org_slug: str,
    limit_per_minute: Optional[int] = None,
    endpoint_name: str = "unknown"
) -> tuple[bool, dict]:
    """
    Check org-level rate limit.

    Args:
        request: FastAPI request object
        org_slug: Organization identifier
        limit_per_minute: Custom per-minute limit (uses default if None)
        endpoint_name: Name of endpoint for logging

    Returns:
        Tuple of (is_allowed, metadata)

    Raises:
        HTTPException: If rate limit exceeded or org_slug is invalid
    """
    if not settings.rate_limit_enabled:
        return True, {}

    # SECURITY: Validate org_slug to prevent rate limit bypass
    # An attacker could manipulate org_slug to bypass per-org limits
    if not org_slug or not isinstance(org_slug, str) or len(org_slug.strip()) == 0:
        logger.warning(
            f"Rate limit bypass attempt detected - missing org_slug on {endpoint_name}",
            extra={
                "endpoint": endpoint_name,
                "remote_ip": request.client.host if request.client else "unknown"
            }
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization identifier required for rate limiting"
        )

    rate_limiter = get_rate_limiter()

    # Use custom limit or default
    limit_minute = limit_per_minute or settings.rate_limit_requests_per_minute
    limit_hour = settings.rate_limit_requests_per_hour

    is_allowed, metadata = await rate_limiter.check_org_limit(
        org_slug,
        limit_per_minute=limit_minute,
        limit_per_hour=limit_hour
    )

    if not is_allowed:
        logger.warning(
            f"Rate limit exceeded for org {org_slug} on {endpoint_name}",
            extra={
                "org_slug": org_slug,
                "endpoint": endpoint_name,
                "remaining_minute": metadata["minute"]["remaining"],
                "reset_minute": metadata["minute"]["reset"]
            }
        )

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "message": f"Too many requests for org {org_slug}",
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
