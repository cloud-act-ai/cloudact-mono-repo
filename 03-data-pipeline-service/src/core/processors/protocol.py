"""
Processor Protocol (Optional)

This defines the expected interface for processors using Python's Protocol.
It does NOT require inheritance - existing processors work as-is.

This is purely for:
1. Type hints and IDE support
2. Documentation of expected interface
3. Optional static type checking with mypy

Your existing processors already conform to this protocol without changes.
"""

from typing import Any, Dict, Protocol, runtime_checkable


@runtime_checkable
class ProcessorProtocol(Protocol):
    """
    Protocol that all processors implicitly implement.

    Processors don't need to inherit from this - they just need to have
    an async execute() method with the correct signature.

    Your OpenAIUsageProcessor, GCPBillingProcessor, etc. already
    implement this protocol without any changes.
    """

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute the processor step.

        Args:
            step_config: Configuration for this step from pipeline YAML
                - config: Processor-specific settings
                - source: Source configuration (optional)
                - destination: Destination configuration (optional)

            context: Execution context
                - org_slug: Organization identifier
                - secrets: Decrypted credentials by provider
                - variables: Pipeline variables
                - previous_step_results: Results from prior steps

        Returns:
            Dict containing:
                - status: "SUCCESS" or "FAILED"
                - rows_processed: Number of rows (optional)
                - error: Error message if failed (optional)
                - ...other processor-specific data
        """
        ...


def get_engine() -> ProcessorProtocol:
    """
    Factory function that every processor module should implement.

    This function is called by AsyncPipelineExecutor to get an instance
    of the processor.
    """
    ...


# ==========================================
# Type Checking Utilities
# ==========================================

def is_valid_processor(obj: Any) -> bool:
    """
    Check if an object implements the ProcessorProtocol.

    Usage:
        processor = get_engine()
        if is_valid_processor(processor):
            result = await processor.execute(config, context)
    """
    return isinstance(obj, ProcessorProtocol)


def validate_processor_result(result: Dict[str, Any]) -> bool:
    """
    Validate that a processor result has required fields.

    Returns True if result has valid structure.
    """
    if not isinstance(result, dict):
        return False

    status = result.get("status", "")
    if status not in ("SUCCESS", "FAILED"):
        return False

    return True


# ==========================================
# Optional: Typed Processor Results
# ==========================================

from dataclasses import dataclass
from typing import Optional, List


@dataclass
class ProcessorResult:
    """
    Typed processor result (optional alternative to plain dict).

    Processors can return this OR a plain dict - both work.
    """
    status: str  # "SUCCESS" or "FAILED"
    rows_processed: int = 0
    error: Optional[str] = None
    provider: Optional[str] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for compatibility."""
        result = {
            "status": self.status,
            "rows_processed": self.rows_processed,
        }
        if self.error:
            result["error"] = self.error
        if self.provider:
            result["provider"] = self.provider
        if self.metadata:
            result.update(self.metadata)
        return result

    @classmethod
    def success(
        cls,
        rows_processed: int = 0,
        provider: Optional[str] = None,
        **metadata
    ) -> "ProcessorResult":
        """Create a success result."""
        return cls(
            status="SUCCESS",
            rows_processed=rows_processed,
            provider=provider,
            metadata=metadata
        )

    @classmethod
    def failed(
        cls,
        error: str,
        provider: Optional[str] = None,
        **metadata
    ) -> "ProcessorResult":
        """Create a failed result."""
        return cls(
            status="FAILED",
            error=error,
            provider=provider,
            metadata=metadata
        )
