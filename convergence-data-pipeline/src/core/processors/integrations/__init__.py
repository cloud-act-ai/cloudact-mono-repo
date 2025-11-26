"""
Integration Processors Package

Processors for managing external integrations:
- LLM providers (OpenAI, Claude/Anthropic, DeepSeek)
- Cloud providers (GCP Service Account)

All credentials are encrypted via GCP KMS before storage.
"""

from src.core.processors.integrations.kms_store import KMSStoreIntegrationProcessor
from src.core.processors.integrations.kms_decrypt import KMSDecryptIntegrationProcessor
from src.core.processors.integrations.validate_openai import ValidateOpenAIIntegrationProcessor
from src.core.processors.integrations.validate_claude import ValidateClaudeIntegrationProcessor
from src.core.processors.integrations.validate_deepseek import ValidateDeepSeekIntegrationProcessor
from src.core.processors.integrations.validate_gcp import ValidateGcpIntegrationProcessor

__all__ = [
    "KMSStoreIntegrationProcessor",
    "KMSDecryptIntegrationProcessor",
    "ValidateOpenAIIntegrationProcessor",
    "ValidateClaudeIntegrationProcessor",
    "ValidateDeepSeekIntegrationProcessor",
    "ValidateGcpIntegrationProcessor",
]
