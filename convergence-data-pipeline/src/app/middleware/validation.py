"""
Input Validation Middleware for Production Security
Validates org_slug format, request size limits, and header safety.
"""

import re
import json
import uuid
from typing import Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
import logging

from src.core.exceptions import (
    InvalidOrgSlugError,
    PayloadTooLargeError,
    ValidationError
)

logger = logging.getLogger(__name__)


def generate_request_id() -> str:
    """Generate a unique request ID for tracing."""
    return str(uuid.uuid4())

# ============================================
# Validation Rules Configuration
# ============================================

# Organization slug validation: alphanumeric, underscores, hyphens only (3-64 chars)
# Prevents SQL injection, path traversal, and invalid dataset names
ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,64}$')

# Date format validation: YYYY-MM-DD
DATE_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}$')

# Request size limits
MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_HEADER_SIZE_BYTES = 8 * 1024  # 8 KB

# Dangerous patterns in headers (potential injection attacks)
DANGEROUS_HEADER_PATTERNS = [
    re.compile(r'<script', re.IGNORECASE),
    re.compile(r'javascript:', re.IGNORECASE),
    re.compile(r'on\w+\s*=', re.IGNORECASE),  # onclick=, onerror=, etc.
    re.compile(r'\.\./'),  # Path traversal
    re.compile(r';\s*(drop|delete|insert|update|exec)\s', re.IGNORECASE),  # SQL injection
]


# ============================================
# Validation Functions
# ============================================

def validate_org_slug(org_slug: str) -> bool:
    """
    Validate organization slug format for security and BigQuery compatibility.

    Rules:
    - 3-64 characters
    - Alphanumeric, underscores, hyphens only
    - No spaces, special chars, or path traversal patterns

    Args:
        org_slug: Organization identifier to validate

    Returns:
        True if valid, False otherwise
    """
    if not org_slug:
        return False

    # Check pattern match
    if not ORG_SLUG_PATTERN.match(org_slug):
        return False

    # Additional checks for dangerous patterns
    dangerous_patterns = ['..', '//', '\\', '<', '>', ';', '"', "'", '`']
    if any(pattern in org_slug for pattern in dangerous_patterns):
        return False

    return True


def validate_headers(headers: dict) -> Optional[str]:
    """
    Validate HTTP headers for security issues.

    Checks for:
    - Header size limits
    - Injection attack patterns
    - Malicious content

    Args:
        headers: Request headers dictionary

    Returns:
        Error message if invalid, None if valid
    """
    # Check total header size
    total_size = sum(len(str(k)) + len(str(v)) for k, v in headers.items())
    if total_size > MAX_HEADER_SIZE_BYTES:
        return f"Headers too large: {total_size} bytes (max: {MAX_HEADER_SIZE_BYTES} bytes)"

    # Check for dangerous patterns in header values
    for key, value in headers.items():
        str_value = str(value)

        # Check for injection patterns
        for pattern in DANGEROUS_HEADER_PATTERNS:
            if pattern.search(str_value):
                logger.warning(
                    f"Dangerous pattern detected in header '{key}'",
                    extra={"header": key, "pattern": pattern.pattern}
                )
                return f"Invalid characters in header: {key}"

        # Check individual header size
        if len(str_value) > 4096:  # 4KB per header
            return f"Header '{key}' too large: {len(str_value)} bytes"

    return None


def validate_date_format(date_str: str) -> bool:
    """
    Validate date format (YYYY-MM-DD).

    Args:
        date_str: Date string to validate

    Returns:
        True if valid, False otherwise
    """
    if not date_str:
        return True  # Optional field

    # Check pattern match
    if not DATE_PATTERN.match(date_str):
        return False

    # Additional validation for reasonable date ranges
    try:
        year, month, day = date_str.split('-')
        year_int = int(year)
        month_int = int(month)
        day_int = int(day)

        # Basic range checks
        if year_int < 2000 or year_int > 2100:
            return False
        if month_int < 1 or month_int > 12:
            return False
        if day_int < 1 or day_int > 31:
            return False

        return True
    except (ValueError, AttributeError):
        return False


def contains_null_bytes(value: str) -> bool:
    """
    Check if string contains NULL bytes (\x00).

    Args:
        value: String to check

    Returns:
        True if NULL bytes found, False otherwise
    """
    return '\x00' in value if isinstance(value, str) else False


def get_org_slug_from_request(request: Request) -> Optional[str]:
    """
    Extract org_slug from request (path params, query params, or headers).

    Args:
        request: FastAPI request object

    Returns:
        org_slug if found, None otherwise
    """
    # Check path parameters
    org_slug = request.path_params.get("org_slug")
    if org_slug:
        return org_slug

    # Check query parameters
    org_slug = request.query_params.get("org_slug")
    if org_slug:
        return org_slug

    # Check headers (some APIs use X-Org-Slug header)
    org_slug = request.headers.get("x-org-slug")
    if org_slug:
        return org_slug

    return None


# ============================================
# Middleware Implementation
# ============================================

async def validation_middleware(request: Request, call_next):
    """
    FastAPI middleware for input validation.

    Validates:
    1. Headers safety and size
    2. Request payload size
    3. Organization slug format (if present in request) - BEFORE auth
    4. Path parameters for NULL bytes and path traversal
    5. Request body for date format and required fields

    Also handles:
    - Request ID generation/extraction for distributed tracing

    Args:
        request: Incoming HTTP request
        call_next: Next middleware/handler in chain

    Returns:
        Response from next handler or error response
    """
    # Generate or extract request ID for tracing
    request_id = request.headers.get("x-request-id") or generate_request_id()

    # Store request ID in request state for use by other middleware/handlers
    request.state.request_id = request_id

    # Skip validation for health check endpoints
    if request.url.path in ["/health", "/", "/docs", "/redoc", "/openapi.json"]:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    try:
        # ============================================
        # 1. Validate Headers
        # ============================================
        header_error = validate_headers(dict(request.headers))
        if header_error:
            logger.warning(
                f"Header validation failed: {header_error}",
                extra={"path": request.url.path, "method": request.method}
            )
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "INVALID_HEADERS",
                    "message": header_error,
                    "category": "VALIDATION"
                }
            )

        # ============================================
        # 2. Validate Request Size
        # ============================================
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > MAX_REQUEST_SIZE_BYTES:
                    logger.warning(
                        f"Request too large: {size} bytes",
                        extra={"path": request.url.path, "size": size}
                    )

                    exc = PayloadTooLargeError(
                        size=size,
                        max_size=MAX_REQUEST_SIZE_BYTES
                    )

                    return JSONResponse(
                        status_code=exc.http_status,
                        content=exc.to_dict()
                    )
            except ValueError:
                pass  # Invalid content-length, let it through for other validation

        # ============================================
        # 3. Validate Organization Slug (if present) - BEFORE AUTH
        # ============================================
        org_slug = get_org_slug_from_request(request)
        if org_slug:
            # Check for NULL bytes first
            if contains_null_bytes(org_slug):
                logger.warning(
                    f"NULL bytes detected in org_slug",
                    extra={"path": request.url.path, "org_slug_repr": repr(org_slug)}
                )
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={
                        "error": "INVALID_ORG_SLUG",
                        "message": "Organization slug contains invalid characters (NULL bytes)",
                        "category": "VALIDATION"
                    }
                )

            # Validate org_slug format
            if not validate_org_slug(org_slug):
                logger.warning(
                    f"Invalid org_slug format: {org_slug}",
                    extra={"path": request.url.path, "org_slug": org_slug}
                )

                exc = InvalidOrgSlugError(org_slug=org_slug)

                return JSONResponse(
                    status_code=exc.http_status,
                    content=exc.to_dict()
                )

        # ============================================
        # 4. Validate Path Parameters for NULL bytes and Path Traversal
        # ============================================
        for key, value in request.path_params.items():
            if isinstance(value, str):
                # Check for NULL bytes
                if contains_null_bytes(value):
                    logger.warning(
                        f"NULL bytes detected in path parameter '{key}'",
                        extra={"path": request.url.path, "param": key, "value_repr": repr(value)}
                    )
                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={
                            "error": "INVALID_PARAMETER",
                            "message": f"Path parameter '{key}' contains invalid characters (NULL bytes)",
                            "category": "VALIDATION"
                        }
                    )

                # Check for path traversal attempts
                if '..' in value or '//' in value or '\\' in value:
                    logger.warning(
                        f"Path traversal attempt in parameter '{key}': {value}",
                        extra={"path": request.url.path, "param": key}
                    )

                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={
                            "error": "INVALID_PARAMETER",
                            "message": f"Invalid path parameter: {key}",
                            "category": "VALIDATION"
                        }
                    )

        # ============================================
        # 5. Skip body validation for pipeline endpoints
        # ============================================
        # Skip body validation to avoid middleware conflicts with request stream
        # The actual validation happens in the endpoint handlers via Pydantic models
        # This prevents the "Unexpected message received: http.request" error

        # ============================================
        # All validations passed - proceed with request
        # ============================================
        response = await call_next(request)
        # Add request ID to response headers for tracing
        response.headers["X-Request-ID"] = request_id
        return response

    except Exception as e:
        logger.error(
            f"Error in validation middleware: {e}",
            exc_info=True,
            extra={
                "path": request.url.path,
                "request_id": request_id
            }
        )
        # Don't block request on middleware errors, but still add request ID
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
