"""
Structured Error Handling for Production Environments
Provides error hierarchy with categorization, error codes, and structured context.
"""

from typing import Dict, Any, Optional
from enum import Enum


class ErrorCategory(str, Enum):
    """Error categories for classification and handling."""
    TRANSIENT = "TRANSIENT"  # Temporary errors that should be retried
    PERMANENT = "PERMANENT"  # Errors that won't succeed on retry
    QUOTA = "QUOTA"  # Rate limiting and quota errors
    VALIDATION = "VALIDATION"  # Input validation errors
    AUTHENTICATION = "AUTHENTICATION"  # Auth and permission errors
    EXTERNAL = "EXTERNAL"  # External service errors


class ErrorCode(str, Enum):
    """Standardized error codes for monitoring and debugging."""
    # Transient errors (5xx equivalent)
    BIGQUERY_UNAVAILABLE = "BQ_UNAVAILABLE"
    BIGQUERY_TIMEOUT = "BQ_TIMEOUT"
    NETWORK_ERROR = "NETWORK_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"

    # Permanent errors (4xx equivalent)
    BIGQUERY_INVALID_QUERY = "BQ_INVALID_QUERY"
    BIGQUERY_NOT_FOUND = "BQ_NOT_FOUND"
    INVALID_SCHEMA = "INVALID_SCHEMA"
    INVALID_REQUEST = "INVALID_REQUEST"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"

    # Quota errors (429 equivalent)
    BIGQUERY_QUOTA_EXCEEDED = "BQ_QUOTA_EXCEEDED"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    DAILY_QUOTA_EXCEEDED = "DAILY_QUOTA_EXCEEDED"
    MONTHLY_QUOTA_EXCEEDED = "MONTHLY_QUOTA_EXCEEDED"
    CONCURRENT_LIMIT_EXCEEDED = "CONCURRENT_LIMIT_EXCEEDED"

    # Validation errors (400 equivalent)
    INVALID_ORG_SLUG = "INVALID_ORG_SLUG"
    INVALID_API_KEY = "INVALID_API_KEY"
    INVALID_PARAMETER = "INVALID_PARAMETER"
    INVALID_PAYLOAD = "INVALID_PAYLOAD"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"

    # Authentication errors (401/403 equivalent)
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    API_KEY_EXPIRED = "API_KEY_EXPIRED"
    SUBSCRIPTION_INACTIVE = "SUBSCRIPTION_INACTIVE"

    # External service errors
    EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR"
    CIRCUIT_OPEN = "CIRCUIT_OPEN"


class ConvergenceException(Exception):
    """
    Base exception for all Convergence Data Pipeline errors.

    Provides structured error information for monitoring, debugging, and error recovery.
    """

    def __init__(
        self,
        message: str,
        category: ErrorCategory,
        error_code: ErrorCode,
        http_status: int = 500,
        context: Optional[Dict[str, Any]] = None,
        retry_after: Optional[int] = None,
        original_error: Optional[Exception] = None
    ):
        """
        Initialize structured exception.

        Args:
            message: Human-readable error message
            category: Error category for classification
            error_code: Standardized error code
            http_status: HTTP status code to return
            context: Additional context (org_slug, query, etc.)
            retry_after: Seconds to wait before retry (for transient/quota errors)
            original_error: Original exception if wrapped
        """
        super().__init__(message)
        self.message = message
        self.category = category
        self.error_code = error_code
        self.http_status = http_status
        self.context = context or {}
        self.retry_after = retry_after
        self.original_error = original_error

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses."""
        result = {
            "error": self.error_code.value,
            "message": self.message,
            "category": self.category.value,
            "http_status": self.http_status
        }

        if self.context:
            result["context"] = self.context

        if self.retry_after:
            result["retry_after"] = self.retry_after

        if self.original_error:
            result["original_error"] = str(self.original_error)

        return result

    def is_retryable(self) -> bool:
        """Check if this error should be retried."""
        return self.category in [ErrorCategory.TRANSIENT, ErrorCategory.QUOTA]


# ============================================
# Transient Errors (Should be retried)
# ============================================

class TransientError(ConvergenceException):
    """
    Temporary error that should be retried.
    Examples: network issues, service unavailable, timeouts.
    """

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.SERVICE_UNAVAILABLE,
        context: Optional[Dict[str, Any]] = None,
        retry_after: int = 60,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            category=ErrorCategory.TRANSIENT,
            error_code=error_code,
            http_status=503,
            context=context,
            retry_after=retry_after,
            original_error=original_error
        )


class BigQueryUnavailableError(TransientError):
    """BigQuery service temporarily unavailable."""

    def __init__(
        self,
        message: str = "BigQuery service temporarily unavailable",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.BIGQUERY_UNAVAILABLE,
            context=context,
            retry_after=60,
            original_error=original_error
        )


class BigQueryTimeoutError(TransientError):
    """BigQuery query timeout."""

    def __init__(
        self,
        message: str = "BigQuery query timed out",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.BIGQUERY_TIMEOUT,
            context=context,
            retry_after=30,
            original_error=original_error
        )


class NetworkError(TransientError):
    """Network connectivity error."""

    def __init__(
        self,
        message: str = "Network connectivity error",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.NETWORK_ERROR,
            context=context,
            retry_after=30,
            original_error=original_error
        )


# ============================================
# Permanent Errors (Should NOT be retried)
# ============================================

class PermanentError(ConvergenceException):
    """
    Permanent error that won't succeed on retry.
    Examples: invalid query, resource not found, malformed request.
    """

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.INVALID_REQUEST,
        http_status: int = 400,
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            category=ErrorCategory.PERMANENT,
            error_code=error_code,
            http_status=http_status,
            context=context,
            retry_after=None,
            original_error=original_error
        )


class BigQueryInvalidQueryError(PermanentError):
    """Invalid BigQuery SQL query."""

    def __init__(
        self,
        message: str = "Invalid BigQuery SQL query",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.BIGQUERY_INVALID_QUERY,
            http_status=400,
            context=context,
            original_error=original_error
        )


class BigQueryResourceNotFoundError(PermanentError):
    """BigQuery resource (table, dataset) not found."""

    def __init__(
        self,
        message: str = "BigQuery resource not found",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.BIGQUERY_NOT_FOUND,
            http_status=404,
            context=context,
            original_error=original_error
        )


class InvalidSchemaError(PermanentError):
    """Invalid BigQuery schema definition."""

    def __init__(
        self,
        message: str = "Invalid schema definition",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.INVALID_SCHEMA,
            http_status=400,
            context=context,
            original_error=original_error
        )


# ============================================
# Quota Errors (Rate limiting)
# ============================================

class QuotaExceededError(ConvergenceException):
    """
    Quota or rate limit exceeded.
    Should be retried after delay specified in retry_after.
    """

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.RATE_LIMIT_EXCEEDED,
        retry_after: int = 60,
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            category=ErrorCategory.QUOTA,
            error_code=error_code,
            http_status=429,
            context=context,
            retry_after=retry_after,
            original_error=original_error
        )


class BigQueryQuotaExceededError(QuotaExceededError):
    """BigQuery quota exceeded."""

    def __init__(
        self,
        message: str = "BigQuery quota exceeded",
        context: Optional[Dict[str, Any]] = None,
        retry_after: int = 300,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.BIGQUERY_QUOTA_EXCEEDED,
            retry_after=retry_after,
            context=context,
            original_error=original_error
        )


class DailyQuotaExceededError(QuotaExceededError):
    """Daily pipeline quota exceeded."""

    def __init__(
        self,
        message: str = "Daily pipeline quota exceeded",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.DAILY_QUOTA_EXCEEDED,
            retry_after=86400,  # 24 hours
            context=context,
            original_error=original_error
        )


class MonthlyQuotaExceededError(QuotaExceededError):
    """Monthly pipeline quota exceeded."""

    def __init__(
        self,
        message: str = "Monthly pipeline quota exceeded",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.MONTHLY_QUOTA_EXCEEDED,
            retry_after=None,  # Wait until next month
            context=context,
            original_error=original_error
        )


class ConcurrentLimitExceededError(QuotaExceededError):
    """Concurrent pipeline limit exceeded."""

    def __init__(
        self,
        message: str = "Concurrent pipeline limit exceeded",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.CONCURRENT_LIMIT_EXCEEDED,
            retry_after=300,  # 5 minutes
            context=context,
            original_error=original_error
        )


# ============================================
# Validation Errors (Bad input)
# ============================================

class ValidationError(ConvergenceException):
    """
    Input validation error.
    Request is malformed and should not be retried without changes.
    """

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.INVALID_PARAMETER,
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            category=ErrorCategory.VALIDATION,
            error_code=error_code,
            http_status=400,
            context=context,
            retry_after=None,
            original_error=original_error
        )


class InvalidOrgSlugError(ValidationError):
    """Invalid org slug format."""

    def __init__(
        self,
        org_slug: str,
        message: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ):
        context = context or {}
        context["org_slug"] = org_slug

        super().__init__(
            message=message or f"Invalid org slug format: {org_slug}",
            error_code=ErrorCode.INVALID_ORG_SLUG,
            context=context
        )


class InvalidPayloadError(ValidationError):
    """Invalid request payload."""

    def __init__(
        self,
        message: str = "Invalid request payload",
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.INVALID_PAYLOAD,
            context=context,
            original_error=original_error
        )


class PayloadTooLargeError(ValidationError):
    """Request payload too large."""

    def __init__(
        self,
        size: int,
        max_size: int,
        context: Optional[Dict[str, Any]] = None
    ):
        context = context or {}
        context["payload_size"] = size
        context["max_size"] = max_size

        super().__init__(
            message=f"Payload too large: {size} bytes (max: {max_size} bytes)",
            error_code=ErrorCode.PAYLOAD_TOO_LARGE,
            context=context
        )
        self.http_status = 413


# ============================================
# Authentication Errors
# ============================================

class AuthenticationError(ConvergenceException):
    """
    Authentication or authorization error.
    Should not be retried without fixing credentials.
    """

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.UNAUTHORIZED,
        http_status: int = 401,
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            category=ErrorCategory.AUTHENTICATION,
            error_code=error_code,
            http_status=http_status,
            context=context,
            retry_after=None,
            original_error=original_error
        )


class InvalidApiKeyError(AuthenticationError):
    """Invalid or expired API key."""

    def __init__(
        self,
        message: str = "Invalid or expired API key",
        context: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.INVALID_API_KEY,
            http_status=401,
            context=context
        )


class SubscriptionInactiveError(AuthenticationError):
    """Customer subscription is inactive."""

    def __init__(
        self,
        message: str = "Subscription is inactive",
        context: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            error_code=ErrorCode.SUBSCRIPTION_INACTIVE,
            http_status=403,
            context=context
        )


# ============================================
# External Service Errors
# ============================================

class ExternalServiceError(ConvergenceException):
    """
    External service error (circuit breaker, API failures).
    May be retryable depending on error type.
    """

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.EXTERNAL_API_ERROR,
        http_status: int = 503,
        retry_after: Optional[int] = 60,
        context: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(
            message=message,
            category=ErrorCategory.EXTERNAL,
            error_code=error_code,
            http_status=http_status,
            context=context,
            retry_after=retry_after,
            original_error=original_error
        )


class CircuitOpenError(ExternalServiceError):
    """Circuit breaker is open, preventing requests."""

    def __init__(
        self,
        service: str,
        message: Optional[str] = None,
        retry_after: int = 60,
        context: Optional[Dict[str, Any]] = None
    ):
        context = context or {}
        context["service"] = service

        super().__init__(
            message=message or f"Circuit breaker open for {service}",
            error_code=ErrorCode.CIRCUIT_OPEN,
            http_status=503,
            retry_after=retry_after,
            context=context
        )


# ============================================
# Error Classification Helper
# ============================================

def classify_exception(exc: Exception) -> ConvergenceException:
    """
    Classify a generic exception into a structured ConvergenceException.

    Used for wrapping external library exceptions (BigQuery, etc.) into
    our structured error hierarchy.

    Args:
        exc: Original exception

    Returns:
        Appropriate ConvergenceException subclass
    """
    from google.api_core import exceptions as google_exceptions

    # Already a ConvergenceException
    if isinstance(exc, ConvergenceException):
        return exc

    # BigQuery exceptions
    if isinstance(exc, google_exceptions.ServiceUnavailable):
        return BigQueryUnavailableError(
            message=str(exc),
            original_error=exc
        )

    if isinstance(exc, google_exceptions.TooManyRequests):
        return BigQueryQuotaExceededError(
            message=str(exc),
            original_error=exc
        )

    if isinstance(exc, google_exceptions.BadRequest):
        return BigQueryInvalidQueryError(
            message=str(exc),
            original_error=exc
        )

    if isinstance(exc, google_exceptions.NotFound):
        return BigQueryResourceNotFoundError(
            message=str(exc),
            original_error=exc
        )

    if isinstance(exc, (TimeoutError, google_exceptions.DeadlineExceeded)):
        return BigQueryTimeoutError(
            message=str(exc),
            original_error=exc
        )

    # Network errors
    if isinstance(exc, ConnectionError):
        return NetworkError(
            message=str(exc),
            original_error=exc
        )

    # Value/Type errors -> Validation
    if isinstance(exc, (ValueError, TypeError)):
        return ValidationError(
            message=str(exc),
            error_code=ErrorCode.INVALID_PARAMETER,
            original_error=exc
        )

    # File not found -> Permanent
    if isinstance(exc, FileNotFoundError):
        return PermanentError(
            message=str(exc),
            error_code=ErrorCode.RESOURCE_NOT_FOUND,
            http_status=404,
            original_error=exc
        )

    # Default: Permanent error (unknown exceptions like KeyError, AttributeError,
    # RuntimeError are programming bugs that won't succeed on retry)
    return PermanentError(
        message=f"Unexpected error: {type(exc).__name__}: {exc}",
        error_code=ErrorCode.INVALID_REQUEST,
        original_error=exc
    )
