"""
Model factory for BYOK (Bring Your Own Key) multi-provider support.
Creates ADK-compatible LLM model instances from customer's provider + key.

Supports: OpenAI, Anthropic, Gemini (native), DeepSeek — all via LiteLlm
except Gemini which is ADK-native.
"""

import os
import logging
from typing import Any, Union

from google.adk.models.lite_llm import LiteLlm

logger = logging.getLogger(__name__)

# Provider → LiteLlm prefix mapping
PROVIDER_PREFIX = {
    "OPENAI": "openai",
    "ANTHROPIC": "anthropic",
    "GEMINI": None,  # Native ADK
    "DEEPSEEK": "deepseek",
}

# Default models per provider (used for adk web testing)
DEFAULT_MODELS = {
    "OPENAI": "gpt-4o",
    "ANTHROPIC": "claude-sonnet-4-20250514",
    "GEMINI": "gemini-2.0-flash",
    "DEEPSEEK": "deepseek-chat",
}


def create_model(
    provider: str,
    model_id: str,
    api_key: str,
) -> Union[str, LiteLlm]:
    """
    Create an ADK-compatible model from customer's provider + key.

    For Gemini: returns model string (ADK handles natively).
    For others: returns LiteLlm wrapper.

    Args:
        provider: Provider name (OPENAI, ANTHROPIC, GEMINI, DEEPSEEK).
        model_id: Model identifier (e.g., gpt-4o, claude-opus-4).
        api_key: Decrypted API key (in memory only, never logged).

    Returns:
        ADK-compatible model (str for Gemini, LiteLlm for others).
    """
    provider_upper = provider.upper()

    if provider_upper == "GEMINI":
        os.environ["GOOGLE_API_KEY"] = api_key
        logger.info(f"Created native Gemini model: {model_id}")
        return model_id

    prefix = PROVIDER_PREFIX.get(provider_upper)
    if not prefix:
        raise ValueError(f"Unsupported provider: {provider}")

    model = LiteLlm(
        model=f"{prefix}/{model_id}",
        api_key=api_key,
    )
    logger.info(f"Created LiteLlm model: {prefix}/{model_id}")
    return model


def create_default_model() -> str:
    """
    Create default Gemini model for adk web / development.
    Uses GOOGLE_API_KEY from environment.
    """
    return "gemini-2.0-flash"
