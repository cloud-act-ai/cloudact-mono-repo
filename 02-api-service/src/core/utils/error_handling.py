"""
Centralized Error Handling Utility
Provides secure error responses that prevent information leakage.

Issue #29: Generic Error Messages - Never expose implementation details to clients.

Error Categories:
- AUTH: Authentication/authorization failures
- VALIDATION: Input validation errors
- NOT_FOUND: Resource not found
- CONFLICT: Resource conflicts (duplicates)
- RATE_LIMIT: Rate limiting errors
- INTEGRATION: External service/integration failures
- DATABASE: Database operation failures
- INTERNAL: Unexpected internal errors
"""

import logging
import traceback
import uuid
from enum import Enum
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class ErrorCategory(str, Enum):
    """Error categories for classification and monitoring."""
    AUTH = "auth"
    VALIDATION = "validation"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    RATE_LIMIT = "rate_limit"
    INTEGRATION = "integration"
    DATABASE = "database"
    INTERNAL = "internal"


def generate_error_id() -> str:
    """Generate a unique error ID for tracking."""
    return f"ERR-{uuid.uuid4().hex[:12].upper()}"


def categorize_error(error: Exception) -> ErrorCategory:
    """
    Automatically categorize an error based on its type.

    Args:
        error: The exception to categorize

    Returns:
        ErrorCategory enum value
    """
    error_type = type(error).__name__
    error_str = str(error).lower()

    # Check for specific error types
    if "authentication" in error_str or "unauthorized" in error_str or "auth" in error_type.lower():
        return ErrorCategory.AUTH
    elif "permission" in error_str or "forbidden" in error_str or "access denied" in error_str:
        return ErrorCategory.AUTH
    elif "validation" in error_str or "invalid" in error_str or error_type in ("ValidationError", "ValueError"):
        return ErrorCategory.VALIDATION
    elif "not found" in error_str or "does not exist" in error_str or error_type == "NotFoundError":
        return ErrorCategory.NOT_FOUND
    elif "duplicate" in error_str or "already exists" in error_str or "conflict" in error_str:
        return ErrorCategory.CONFLICT
    elif "rate limit" in error_str or "too many" in error_str or "throttl" in error_str:
        return ErrorCategory.RATE_LIMIT
    elif any(x in error_str for x in ["timeout", "connection", "network", "api error", "service unavailable"]):
        return ErrorCategory.INTEGRATION
    elif any(x in error_str for x in ["database", "query", "sql", "bigquery", "table"]):
        return ErrorCategory.DATABASE
    else:
        return ErrorCategory.INTERNAL


def log_error_details(
    error_id: str,
    error: Exception,
    context: Optional[Dict[str, Any]] = None,
    user_message: Optional[str] = None,
    category: Optional[ErrorCategory] = None,
    operation: Optional[str] = None
) -> None:
    """
    Log detailed error information server-side only.

    Provides rich context for operators while hiding sensitive details from users.

    Args:
        error_id: Unique error identifier
        error: The exception that occurred
        context: Additional context for debugging
        user_message: The generic message sent to the user
        category: Error category for classification
        operation: Description of the operation that failed
    """
    # Auto-categorize if not provided
    if category is None:
        category = categorize_error(error)

    log_data = {
        "error_id": error_id,
        "error_category": category.value,
        "error_type": type(error).__name__,
        "error_message": str(error),
        "operation": operation,
        "user_message": user_message,
        "traceback": traceback.format_exc()
    }

    if context:
        # Add context but sanitize sensitive fields
        sanitized_context = {}
        sensitive_keys = {"password", "credential", "api_key", "secret", "token", "private_key"}
        for key, value in context.items():
            if any(s in key.lower() for s in sensitive_keys):
                sanitized_context[key] = "[REDACTED]"
            else:
                sanitized_context[key] = value
        log_data.update(sanitized_context)

    # Log with appropriate level based on category
    if category in (ErrorCategory.INTERNAL, ErrorCategory.DATABASE, ErrorCategory.INTEGRATION):
        logger.error(
            f"[{category.value.upper()}] Error {error_id}: {type(error).__name__} during {operation or 'operation'}",
            extra=log_data,
            exc_info=True
        )
    elif category in (ErrorCategory.AUTH, ErrorCategory.RATE_LIMIT):
        logger.warning(
            f"[{category.value.upper()}] Error {error_id}: {type(error).__name__} during {operation or 'operation'}",
            extra=log_data
        )
    else:
        logger.info(
            f"[{category.value.upper()}] Error {error_id}: {type(error).__name__} during {operation or 'operation'}",
            extra=log_data
        )


def handle_generic_error(
    error: Exception,
    user_message: str = "An internal error occurred. Please contact support.",
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    context: Optional[Dict[str, Any]] = None,
    category: Optional[ErrorCategory] = None,
    operation: Optional[str] = None
) -> HTTPException:
    """
    Handle errors with generic user-facing messages.

    SECURITY: Never expose:
    - Stack traces
    - Database errors
    - File paths
    - Environment details
    - Internal logic
    - Implementation details (streaming buffers, table names, etc.)

    Args:
        error: The exception that occurred
        user_message: Generic message to show to user
        status_code: HTTP status code
        context: Additional context for server-side logging
        category: Error category for classification
        operation: Description of the operation that failed

    Returns:
        HTTPException with generic error message and tracking ID
    """
    error_id = generate_error_id()

    # Auto-categorize if not provided
    if category is None:
        category = categorize_error(error)

    # Log full details server-side with operator context
    log_error_details(
        error_id=error_id,
        error=error,
        context=context,
        user_message=user_message,
        category=category,
        operation=operation
    )

    # Return generic error to client with tracking ID
    return HTTPException(
        status_code=status_code,
        detail={
            "error": category.value,
            "message": user_message,
            "error_id": error_id,
            "support_message": f"Please provide error ID {error_id} when contacting support."
        }
    )


def handle_validation_error(
    field: str,
    message: str,
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Handle validation errors with specific field information.

    Args:
        field: The field that failed validation
        message: Validation error message
        context: Additional context for logging

    Returns:
        HTTPException with validation details
    """
    error_id = generate_error_id()

    logger.warning(
        f"Validation error {error_id}: {field}",
        extra={
            "error_id": error_id,
            "field": field,
            "message": message,
            **(context or {})
        }
    )

    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "error": "validation_error",
            "field": field,
            "message": message,
            "error_id": error_id
        }
    )


def handle_not_found(
    resource_type: str,
    resource_id: str,
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Handle resource not found errors.

    Args:
        resource_type: Type of resource (e.g., "Organization", "API Key")
        resource_id: Identifier of the resource
        context: Additional context for logging

    Returns:
        HTTPException with not found message
    """
    error_id = generate_error_id()

    logger.info(
        f"Resource not found {error_id}: {resource_type}",
        extra={
            "error_id": error_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            **(context or {})
        }
    )

    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error": "not_found",
            "message": f"{resource_type} not found",
            "error_id": error_id
        }
    )


def handle_forbidden(
    reason: str = "Access denied",
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Handle authorization/permission errors.

    Args:
        reason: Generic reason for denial
        context: Additional context for logging

    Returns:
        HTTPException with forbidden message
    """
    error_id = generate_error_id()

    logger.warning(
        f"Access denied {error_id}",
        extra={
            "error_id": error_id,
            "reason": reason,
            **(context or {})
        }
    )

    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error": "forbidden",
            "message": reason,
            "error_id": error_id
        }
    )


def handle_conflict(
    resource_type: str,
    message: str,
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Handle resource conflict errors (e.g., duplicate resources).

    Args:
        resource_type: Type of resource
        message: Conflict message
        context: Additional context for logging

    Returns:
        HTTPException with conflict message
    """
    error_id = generate_error_id()

    logger.info(
        f"Resource conflict {error_id}: {resource_type}",
        extra={
            "error_id": error_id,
            "resource_type": resource_type,
            "message": message,
            **(context or {})
        }
    )

    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "error": "conflict",
            "message": message,
            "error_id": error_id
        }
    )


def handle_database_error(
    error: Exception,
    operation: str = "database operation",
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Handle database errors with generic user-facing messages.

    Logs full details including query info for operators, but returns
    generic message to users to prevent information leakage.

    Args:
        error: The exception that occurred
        operation: Description of the database operation
        context: Additional context for logging

    Returns:
        HTTPException with generic error message
    """
    return handle_generic_error(
        error=error,
        user_message="A database error occurred. Please try again or contact support.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        context=context,
        category=ErrorCategory.DATABASE,
        operation=operation
    )


def handle_integration_error(
    error: Exception,
    provider: str,
    operation: str = "integration operation",
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Handle external integration errors with generic user-facing messages.

    Logs full details for operators but returns generic message to users.

    Args:
        error: The exception that occurred
        provider: The integration provider (e.g., "OpenAI", "GCP")
        operation: Description of the operation
        context: Additional context for logging

    Returns:
        HTTPException with generic error message
    """
    # Add provider to context for logging
    ctx = context or {}
    ctx["provider"] = provider

    return handle_generic_error(
        error=error,
        user_message=f"Failed to communicate with {provider}. Please try again later.",
        status_code=status.HTTP_502_BAD_GATEWAY,
        context=ctx,
        category=ErrorCategory.INTEGRATION,
        operation=operation
    )


def safe_error_response(
    error: Exception,
    operation: str = "operation",
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Safely handle any error with appropriate response.

    This is the main entry point for error handling.
    Automatically determines the appropriate response based on error type.

    Args:
        error: The exception that occurred
        operation: Description of the operation that failed
        context: Additional context for logging

    Returns:
        HTTPException with appropriate status and message
    """
    # If already an HTTPException, re-raise as-is
    if isinstance(error, HTTPException):
        return error

    # Categorize the error
    category = categorize_error(error)

    # Map categories to appropriate status codes
    status_map = {
        ErrorCategory.AUTH: status.HTTP_401_UNAUTHORIZED,
        ErrorCategory.VALIDATION: status.HTTP_400_BAD_REQUEST,
        ErrorCategory.NOT_FOUND: status.HTTP_404_NOT_FOUND,
        ErrorCategory.CONFLICT: status.HTTP_409_CONFLICT,
        ErrorCategory.RATE_LIMIT: status.HTTP_429_TOO_MANY_REQUESTS,
        ErrorCategory.INTEGRATION: status.HTTP_502_BAD_GATEWAY,
        ErrorCategory.DATABASE: status.HTTP_500_INTERNAL_SERVER_ERROR,
        ErrorCategory.INTERNAL: status.HTTP_500_INTERNAL_SERVER_ERROR,
    }

    # Return generic error with appropriate category
    return handle_generic_error(
        error=error,
        user_message=f"Failed to complete {operation}. Please try again or contact support.",
        status_code=status_map.get(category, status.HTTP_500_INTERNAL_SERVER_ERROR),
        context=context,
        category=category,
        operation=operation
    )
