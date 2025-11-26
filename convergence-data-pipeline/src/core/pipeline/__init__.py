"""
Pipeline orchestration and execution module.

PREFERRED EXECUTOR: AsyncPipelineExecutor (modern, async, parallel)
LEGACY EXECUTOR: PipelineExecutor (deprecated, sync, sequential)
"""

from src.core.pipeline.async_executor import AsyncPipelineExecutor
from src.core.pipeline.executor import PipelineExecutor  # Deprecated - kept for backward compatibility
from src.core.pipeline.data_quality import DataQualityValidator

# Export AsyncPipelineExecutor as the primary/default executor
__all__ = [
    'AsyncPipelineExecutor',  # PREFERRED - Use this for all new code
    'PipelineExecutor',       # DEPRECATED - Only for backward compatibility
    'DataQualityValidator'
]
