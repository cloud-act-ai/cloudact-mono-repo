"""
Input Validation Middleware for Production Security
Validates tenant_id format, request size limits, and header safety.
"""

import re
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
    1. Tenant ID format (if present in request)
    2. Request payload size
    3. Header safety and size
    4. Dangerous patterns

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
        # 3. Validate Tenant ID (if present)
        # ============================================
        tenant_id = get_tenant_id_from_request(request)
        if tenant_id and not validate_tenant_id(tenant_id):
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
        # 4. Validate Path Parameters
        # ============================================
        # Check for path traversal attempts in all path params
        for key, value in request.path_params.items():
            if isinstance(value, str):
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
