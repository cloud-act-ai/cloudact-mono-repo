"""OpenAI Processors Package

DEPRECATED: Usage and cost processors have been removed.
Use the unified GenAI processors instead:
    - genai.payg_usage with config.provider="openai"
    - genai.payg_cost with config.provider="openai"

Remaining:
    - OpenAIAuthenticator: For credential validation during integration setup
    - OpenAIValidationProcessor: For validating OpenAI credentials
"""

from src.core.processors.openai.authenticator import OpenAIAuthenticator
from src.core.processors.openai.validation import OpenAIValidationProcessor

__all__ = [
    "OpenAIAuthenticator",
    "OpenAIValidationProcessor",
]
