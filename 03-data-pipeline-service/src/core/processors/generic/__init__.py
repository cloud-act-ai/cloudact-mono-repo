"""Generic Processors Package"""

from src.core.processors.generic.api_extractor import ApiExtractorProcessor
from src.core.processors.generic.local_bq_transformer import LocalBqTransformerProcessor
from src.core.processors.generic.procedure_executor import ProcedureExecutorProcessor
from src.core.processors.generic.bq_loader import BQLoader
from src.core.processors.generic.bq_execute import BqExecuteProcessor

__all__ = [
    "ApiExtractorProcessor",
    "LocalBqTransformerProcessor",
    "ProcedureExecutorProcessor",
    "BQLoader",
    "BqExecuteProcessor"
]
