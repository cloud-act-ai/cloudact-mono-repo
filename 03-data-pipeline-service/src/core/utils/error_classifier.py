"""
Error Classification Utilities

Classifies pipeline and step errors into categories for retry logic and observability.

Categories:
- TRANSIENT: Temporary errors that may succeed on retry (rate limits, network issues)
- PERMANENT: Permanent errors that won't succeed on retry (auth failures, invalid config)
- TIMEOUT: Execution exceeded timeout threshold
- VALIDATION_ERROR: Input validation failures
- DEPENDENCY_FAILURE: Dependency step failed

Usage:
    from src.core.utils.error_classifier import classify_error, is_retryable

    error_type = classify_error(exception)
    if is_retryable(error_type):
        # Retry logic
"""

import re
from typing import Optional, Dict, Any
from enum import Enum


class ErrorType(str, Enum):
    """Error classification types."""
    TRANSIENT = "TRANSIENT"
    PERMANENT = "PERMANENT"
    TIMEOUT = "TIMEOUT"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    DEPENDENCY_FAILURE = "DEPENDENCY_FAILURE"
    UNKNOWN = "UNKNOWN"


# Transient error patterns (retryable)
TRANSIENT_PATTERNS = [
    # Network and connection errors
    r"connection.*reset",
    r"connection.*refused",
    r"connection.*timeout",
    r"timeout",
    r"timed out",
    r"network.*error",
    r"socket.*error",
    r"dns.*error",
    r"temporarily unavailable",

    # Rate limiting and throttling
    r"rate.*limit",
    r"429",
    r"too many requests",
    r"quota.*exceeded",
    r"throttl",

    # Temporary service issues
    r"503",
    r"502",
    r"504",
    r"service.*unavailable",
    r"server.*error",
    r"internal.*error",
    r"backend.*error",

    # Resource contention
    r"deadlock",
    r"lock.*timeout",
    r"resource.*busy",
    r"try again",

    # BigQuery specific
    r"rateLimitExceeded",
    r"backendError",
    r"internalError",
]

# Permanent error patterns (non-retryable)
PERMANENT_PATTERNS = [
    # Authentication and authorization
    r"unauthorized",
    r"401",
    r"403",
    r"forbidden",
    r"access.*denied",
    r"invalid.*key",
    r"invalid.*token",
    r"invalid.*credential",
    r"authentication.*failed",

    # Configuration errors
    r"not.*found",
    r"404",
    r"does not exist",
    r"invalid.*config",
    r"misconfigured",

    # Data validation
    r"validation.*error",
    r"invalid.*input",
    r"invalid.*parameter",
    r"bad.*request",
    r"400",

    # Resource errors
    r"duplicate",
    r"already.*exists",
    r"conflict",
    r"409",

    # BigQuery specific
    r"invalidQuery",
    r"notFound",
    r"duplicate",
]

# Validation error patterns
VALIDATION_PATTERNS = [
    r"validation.*error",
    r"invalid.*input",
    r"invalid.*parameter",
    r"bad.*request",
    r"schema.*mismatch",
    r"type.*error",
    r"missing.*required",
]


def classify_error(
    exception: Exception,
    error_message: Optional[str] = None
) -> ErrorType:
    """
    Classify an error based on exception type and message.

    Args:
        exception: The exception that occurred
        error_message: Optional error message (defaults to str(exception))

    Returns:
        ErrorType enum value
    """
    # Use provided message or extract from exception
    msg = (error_message or str(exception)).lower()

    # Check for timeout errors first (most specific)
    if isinstance(exception, TimeoutError) or "timeout" in msg or "timed out" in msg:
        return ErrorType.TIMEOUT

    # Check for validation errors
    if isinstance(exception, (ValueError, TypeError)):
        return ErrorType.VALIDATION_ERROR

    for pattern in VALIDATION_PATTERNS:
        if re.search(pattern, msg, re.IGNORECASE):
            return ErrorType.VALIDATION_ERROR

    # Check for transient errors (retryable)
    for pattern in TRANSIENT_PATTERNS:
        if re.search(pattern, msg, re.IGNORECASE):
            return ErrorType.TRANSIENT

    # Check for permanent errors (non-retryable)
    for pattern in PERMANENT_PATTERNS:
        if re.search(pattern, msg, re.IGNORECASE):
            return ErrorType.PERMANENT

    # Default to UNKNOWN (treat as permanent to avoid infinite retries)
    return ErrorType.UNKNOWN


def is_retryable(error_type: ErrorType) -> bool:
    """
    Determine if an error type is retryable.

    Args:
        error_type: ErrorType enum value

    Returns:
        True if error should be retried, False otherwise
    """
    return error_type in [ErrorType.TRANSIENT, ErrorType.TIMEOUT]


def get_retry_delay(
    retry_count: int,
    error_type: ErrorType,
    base_delay: float = 2.0,
    max_delay: float = 300.0
) -> float:
    """
    Calculate exponential backoff delay for retries.

    Args:
        retry_count: Number of retries attempted (0-indexed)
        error_type: Type of error
        base_delay: Base delay in seconds (default: 2s)
        max_delay: Maximum delay in seconds (default: 300s = 5 minutes)

    Returns:
        Delay in seconds before next retry
    """
    if not is_retryable(error_type):
        return 0.0

    # Exponential backoff: base_delay * 2^retry_count
    delay = base_delay * (2 ** retry_count)

    # Cap at max_delay
    return min(delay, max_delay)


def create_error_context(
    exception: Exception,
    step_name: Optional[str] = None,
    retry_count: int = 0,
    additional_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create structured error context for logging.

    Args:
        exception: The exception that occurred
        step_name: Name of the step that failed (optional)
        retry_count: Number of retry attempts
        additional_context: Additional context to include

    Returns:
        Structured error context dictionary
    """
    import traceback

    error_message = str(exception)
    error_type = classify_error(exception, error_message)
    stack_trace = traceback.format_exc()

    context = {
        "error_type": error_type.value,
        "error_class": type(exception).__name__,
        "error_message": error_message,
        "is_retryable": is_retryable(error_type),
        "retry_count": retry_count,
        "stack_trace": stack_trace,
        "stack_trace_truncated": stack_trace[:2000] if stack_trace else None,
    }

    if step_name:
        context["failed_step"] = step_name

    if retry_count > 0:
        context["next_retry_delay_seconds"] = get_retry_delay(retry_count, error_type)

    if additional_context:
        context.update(additional_context)

    return context


def format_error_for_logging(
    error_context: Dict[str, Any],
    include_stack_trace: bool = False
) -> str:
    """
    Format error context as human-readable string for logging.

    Args:
        error_context: Error context from create_error_context()
        include_stack_trace: Whether to include full stack trace

    Returns:
        Formatted error message
    """
    parts = [
        f"Error Type: {error_context['error_type']}",
        f"Error Class: {error_context['error_class']}",
        f"Message: {error_context['error_message']}",
        f"Retryable: {error_context['is_retryable']}",
        f"Retry Count: {error_context['retry_count']}",
    ]

    if error_context.get('failed_step'):
        parts.insert(0, f"Failed Step: {error_context['failed_step']}")

    if error_context.get('next_retry_delay_seconds'):
        parts.append(f"Next Retry In: {error_context['next_retry_delay_seconds']}s")

    if include_stack_trace and error_context.get('stack_trace'):
        parts.append(f"\nStack Trace:\n{error_context['stack_trace']}")

    return " | ".join(parts)
