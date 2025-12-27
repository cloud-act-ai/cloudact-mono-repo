"""Generic Processors Package"""

from src.core.processors.generic.api_extractor import GenericApiExtractor
from src.core.processors.generic.local_bq_transformer import LocalBqTransformerProcessor
from src.core.processors.generic.procedure_executor import ProcedureExecutor
from src.core.processors.generic.bq_loader import BQLoader

__all__ = [
    "GenericApiExtractor",
    "LocalBqTransformerProcessor",
    "ProcedureExecutor",
    "BQLoader"
]
