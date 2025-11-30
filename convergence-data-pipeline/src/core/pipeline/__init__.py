"""
Pipeline orchestration and execution module.

PREFERRED EXECUTOR: AsyncPipelineExecutor (modern, async, parallel)
"""

from src.core.pipeline.async_executor import AsyncPipelineExecutor
from src.core.pipeline.data_quality import DataQualityValidator

# Export AsyncPipelineExecutor as the primary/default executor
# PipelineExecutor (sync) has been removed - use AsyncPipelineExecutor
PipelineExecutor = AsyncPipelineExecutor  # Alias for backward compatibility

__all__ = [
    'AsyncPipelineExecutor',  # PREFERRED - Use this for all new code
    'PipelineExecutor',       # Alias to AsyncPipelineExecutor for backward compatibility
    'DataQualityValidator'
]
