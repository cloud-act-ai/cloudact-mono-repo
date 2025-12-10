"""
Centralized Error Handling Utility
Provides secure error responses that prevent information leakage.

Issue #29: Generic Error Messages - Never expose implementation details to clients.
"""

import logging
import traceback
import uuid
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def generate_error_id() -> str:
    """Generate a unique error ID for tracking."""
    return f"ERR-{uuid.uuid4().hex[:12].upper()}"


def log_error_details(
    error_id: str,
    error: Exception,
    context: Optional[Dict[str, Any]] = None,
    user_message: Optional[str] = None
) -> None:
    """
    Log detailed error information server-side only.

    Args:
        error_id: Unique error identifier
        error: The exception that occurred
        context: Additional context for debugging
        user_message: The generic message sent to the user
    """
    log_data = {
        "error_id": error_id,
        "error_type": type(error).__name__,
        "error_message": str(error),
        "user_message": user_message,
        "traceback": traceback.format_exc()
    }

    if context:
        log_data.update(context)

    logger.error(
        f"Error {error_id}: {type(error).__name__}",
        extra=log_data,
        exc_info=True
    )


def handle_generic_error(
    error: Exception,
    user_message: str = "An internal error occurred. Please contact support.",
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    context: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """
    Handle errors with generic user-facing messages.

    SECURITY: Never expose:
    - Stack traces
    - Database errors
    - File paths
    - Environment details
    - Internal logic

    Args:
        error: The exception that occurred
        user_message: Generic message to show to user
        status_code: HTTP status code
        context: Additional context for server-side logging

    Returns:
        HTTPException with generic error message and tracking ID
    """
    error_id = generate_error_id()

    # Log full details server-side
    log_error_details(
        error_id=error_id,
        error=error,
        context=context,
        user_message=user_message
    )

    # Return generic error to client with tracking ID
    return HTTPException(
        status_code=status_code,
        detail={
            "error": "internal_error",
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

    # Otherwise, return generic error
    return handle_generic_error(
        error=error,
        user_message=f"Failed to complete {operation}. Please try again or contact support.",
        context=context
    )
