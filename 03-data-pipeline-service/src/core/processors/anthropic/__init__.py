"""Anthropic Processors Package

DEPRECATED: Usage and cost processors have been removed.
Use the unified GenAI processors instead:
    - genai.payg_usage with config.provider="anthropic"
    - genai.payg_cost with config.provider="anthropic"

Remaining:
    - AnthropicAuthenticator: For credential validation during integration setup
    - AnthropicValidationProcessor: For validating Anthropic credentials
"""

from src.core.processors.anthropic.authenticator import AnthropicAuthenticator
from src.core.processors.anthropic.validation import AnthropicValidationProcessor

__all__ = [
    "AnthropicAuthenticator",
    "AnthropicValidationProcessor",
]
