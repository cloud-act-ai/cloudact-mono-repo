"""
Shared Response Status Constants

Standardized status values for API and processor responses.
ALL status values use UPPERCASE to match the dominant codebase pattern.

Issue #21-30: Fix inconsistent status/response formats.
"""

from enum import Enum


class ProcessorStatus(str, Enum):
    """
    Status values for processor responses.

    All processors should return one of these status values:
    - SUCCESS: Operation completed successfully
    - FAILED: Operation failed with error
    - PARTIAL: Partial success (some operations succeeded, others failed)
    """
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PARTIAL = "PARTIAL"

    @classmethod
    def is_success(cls, status: str) -> bool:
        """Check if status indicates success (case-insensitive)."""
        return status.upper() == cls.SUCCESS.value


class IntegrationStatus(str, Enum):
    """
    Status values for integration credentials.

    Maps to org_integration_credentials.status column.
    """
    VALID = "VALID"
    INVALID = "INVALID"
    PENDING = "PENDING"
    EXPIRED = "EXPIRED"
    NOT_CONFIGURED = "NOT_CONFIGURED"


class PipelineRunStatus(str, Enum):
    """
    Status values for pipeline execution.

    Maps to org_meta_pipeline_runs.status column.
    """
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class SubscriptionStatus(str, Enum):
    """
    Status values for SaaS subscriptions.

    Maps to subscription_plans.status column.
    """
    ACTIVE = "active"  # lowercase per existing DB schema
    PENDING = "pending"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


# Response field constants
class ResponseField:
    """Standard response field names."""
    STATUS = "status"
    MESSAGE = "message"
    ERROR = "error"
    DETAIL = "detail"  # FastAPI HTTPException convention
    DATA = "data"
    SUCCESS = "success"  # Boolean field (different from status)


def success_response(message: str = "Operation completed successfully", **kwargs) -> dict:
    """
    Create a standard success response.

    Args:
        message: Success message
        **kwargs: Additional response fields

    Returns:
        Dict with status=SUCCESS and message
    """
    return {
        ResponseField.STATUS: ProcessorStatus.SUCCESS.value,
        ResponseField.MESSAGE: message,
        **kwargs
    }


def failed_response(error: str, **kwargs) -> dict:
    """
    Create a standard failure response.

    Args:
        error: Error message
        **kwargs: Additional response fields

    Returns:
        Dict with status=FAILED and error
    """
    return {
        ResponseField.STATUS: ProcessorStatus.FAILED.value,
        ResponseField.ERROR: error,
        **kwargs
    }


def partial_response(message: str, errors: list = None, **kwargs) -> dict:
    """
    Create a partial success response.

    Args:
        message: Summary message
        errors: List of errors for failed operations
        **kwargs: Additional response fields

    Returns:
        Dict with status=PARTIAL, message, and errors
    """
    return {
        ResponseField.STATUS: ProcessorStatus.PARTIAL.value,
        ResponseField.MESSAGE: message,
        "errors": errors or [],
        **kwargs
    }
