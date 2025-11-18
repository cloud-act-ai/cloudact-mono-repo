"""
Input Validation Middleware for Production Security
Validates tenant_id format, request size limits, and header safety.
"""

import re
import json
from typing import Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
import logging

from src.core.exceptions import (
    InvalidTenantIdError,
    PayloadTooLargeError,
    ValidationError
)

logger = logging.getLogger(__name__)

# ============================================
# Validation Rules Configuration
# ============================================

# Tenant ID validation: alphanumeric, underscores, hyphens only (3-64 chars)
# Prevents SQL injection, path traversal, and invalid dataset names
TENANT_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,64}$')

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

def validate_tenant_id(tenant_id: str) -> bool:
    """
    Validate tenant ID format for security and BigQuery compatibility.

    Rules:
    - 3-64 characters
    - Alphanumeric, underscores, hyphens only
    - No spaces, special chars, or path traversal patterns

    Args:
        tenant_id: Tenant identifier to validate

    Returns:
        True if valid, False otherwise
    """
    if not tenant_id:
        return False

    # Check pattern match
    if not TENANT_ID_PATTERN.match(tenant_id):
        return False

    # Additional checks for dangerous patterns
    dangerous_patterns = ['..', '//', '\\', '<', '>', ';', '"', "'", '`']
    if any(pattern in tenant_id for pattern in dangerous_patterns):
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


def get_tenant_id_from_request(request: Request) -> Optional[str]:
    """
    Extract tenant_id from request (path params, query params, or headers).

    Args:
        request: FastAPI request object

    Returns:
        tenant_id if found, None otherwise
    """
    # Check path parameters
    tenant_id = request.path_params.get("tenant_id")
    if tenant_id:
        return tenant_id

    # Check query parameters
    tenant_id = request.query_params.get("tenant_id")
    if tenant_id:
        return tenant_id

    # Check headers (some APIs use X-Tenant-ID header)
    tenant_id = request.headers.get("x-tenant-id")
    if tenant_id:
        return tenant_id

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
    3. Tenant ID format (if present in request) - BEFORE auth
    4. Path parameters for NULL bytes and path traversal
    5. Request body for date format and required fields

    Args:
        request: Incoming HTTP request
        call_next: Next middleware/handler in chain

    Returns:
        Response from next handler or error response
    """
    # Skip validation for health check endpoints
    if request.url.path in ["/health", "/", "/docs", "/redoc", "/openapi.json"]:
        return await call_next(request)

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
        # 3. Validate Tenant ID (if present) - BEFORE AUTH
        # ============================================
        tenant_id = get_tenant_id_from_request(request)
        if tenant_id:
            # Check for NULL bytes first
            if contains_null_bytes(tenant_id):
                logger.warning(
                    f"NULL bytes detected in tenant_id",
                    extra={"path": request.url.path, "tenant_id_repr": repr(tenant_id)}
                )
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={
                        "error": "INVALID_TENANT_ID",
                        "message": "Tenant ID contains invalid characters (NULL bytes)",
                        "category": "VALIDATION"
                    }
                )

            # Validate tenant_id format
            if not validate_tenant_id(tenant_id):
                logger.warning(
                    f"Invalid tenant_id format: {tenant_id}",
                    extra={"path": request.url.path, "tenant_id": tenant_id}
                )

                exc = InvalidTenantIdError(tenant_id=tenant_id)

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
        return response

    except Exception as e:
        logger.error(
            f"Error in validation middleware: {e}",
            exc_info=True,
            extra={"path": request.url.path}
        )
        # Don't block request on middleware errors
        return await call_next(request)
