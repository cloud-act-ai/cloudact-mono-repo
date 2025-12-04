"""
State Transitions and Constants
Defines valid pipeline states, queue statuses, and transition rules.
"""

from enum import Enum
from google.api_core import exceptions as google_api_exceptions
from tenacity import retry_if_exception_type


# ============================================
# Enums
# ============================================

class PipelineState(str, Enum):
    """Valid pipeline execution states."""
    SCHEDULED = "SCHEDULED"  # Pipeline scheduled for future execution
    PENDING = "PENDING"      # Queued and ready to run
    RUNNING = "RUNNING"      # Currently executing
    COMPLETED = "COMPLETED"  # Successfully finished
    FAILED = "FAILED"        # Execution failed


class QueueStatus(str, Enum):
    """Valid queue item statuses."""
    QUEUED = "QUEUED"           # Waiting in queue
    PROCESSING = "PROCESSING"   # Being processed by worker
    COMPLETED = "COMPLETED"     # Successfully processed
    FAILED = "FAILED"           # Processing failed


# ============================================
# Constants
# ============================================

# Valid state transitions
VALID_TRANSITIONS = {
    PipelineState.SCHEDULED: [PipelineState.PENDING],
    PipelineState.PENDING: [PipelineState.RUNNING, PipelineState.FAILED],
    PipelineState.RUNNING: [PipelineState.COMPLETED, PipelineState.FAILED],
    PipelineState.FAILED: [PipelineState.PENDING, PipelineState.FAILED],  # Allow retry
}


# Retry policy for transient errors
TRANSIENT_RETRY_POLICY = retry_if_exception_type((
    ConnectionError,
    TimeoutError,
    google_api_exceptions.ServiceUnavailable,
    google_api_exceptions.TooManyRequests,
))
