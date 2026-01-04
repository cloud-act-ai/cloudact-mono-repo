"""
Usage Constants

Provider and model configurations for GenAI usage displays.
"""

from typing import Dict, Optional


# ==============================================================================
# GenAI Provider Configuration
# ==============================================================================

GENAI_PROVIDER_NAMES: Dict[str, str] = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Google Gemini",
    "google": "Google Gemini",
    "deepseek": "DeepSeek",
    "cohere": "Cohere",
    "mistral": "Mistral AI",
    "meta": "Meta AI",
    "llama": "Meta Llama",
    "azure_openai": "Azure OpenAI",
    "aws_bedrock": "AWS Bedrock",
    "vertex_ai": "Vertex AI",
    "groq": "Groq",
    "perplexity": "Perplexity",
    "together": "Together AI",
    "fireworks": "Fireworks AI",
    "replicate": "Replicate",
    "huggingface": "Hugging Face",
}

GENAI_PROVIDER_COLORS: Dict[str, str] = {
    "openai": "#10A37F",       # OpenAI green
    "anthropic": "#D97757",    # Anthropic coral
    "gemini": "#4285F4",       # Google blue
    "google": "#4285F4",       # Google blue
    "deepseek": "#6366F1",     # DeepSeek indigo
    "cohere": "#FF6B6B",       # Cohere red
    "mistral": "#F97316",      # Mistral orange
    "meta": "#0668E1",         # Meta blue
    "llama": "#0668E1",        # Meta blue
    "azure_openai": "#0078D4", # Azure blue
    "aws_bedrock": "#FF9900",  # AWS orange
    "vertex_ai": "#4285F4",    # Google blue
    "groq": "#8B5CF6",         # Groq purple
    "perplexity": "#22D3EE",   # Perplexity cyan
    "together": "#EC4899",     # Together pink
    "fireworks": "#EF4444",    # Fireworks red
    "replicate": "#6366F1",    # Replicate indigo
    "huggingface": "#FFD21E",  # Hugging Face yellow
}

DEFAULT_PROVIDER_COLOR = "#94a3b8"  # slate-400


# ==============================================================================
# Model Configuration
# ==============================================================================

MODEL_NAMES: Dict[str, str] = {
    # OpenAI
    "gpt-4": "GPT-4",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-3.5-turbo": "GPT-3.5 Turbo",
    "o1": "O1",
    "o1-mini": "O1 Mini",
    "o1-preview": "O1 Preview",
    # Anthropic
    "claude-3-opus": "Claude 3 Opus",
    "claude-3-sonnet": "Claude 3 Sonnet",
    "claude-3-haiku": "Claude 3 Haiku",
    "claude-3.5-sonnet": "Claude 3.5 Sonnet",
    "claude-3.5-haiku": "Claude 3.5 Haiku",
    "claude-opus-4": "Claude Opus 4",
    "claude-sonnet-4": "Claude Sonnet 4",
    # Google
    "gemini-pro": "Gemini Pro",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
    "gemini-1.5-flash": "Gemini 1.5 Flash",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    # DeepSeek
    "deepseek-chat": "DeepSeek Chat",
    "deepseek-coder": "DeepSeek Coder",
    "deepseek-v3": "DeepSeek V3",
    # Mistral
    "mistral-large": "Mistral Large",
    "mistral-medium": "Mistral Medium",
    "mistral-small": "Mistral Small",
    "mixtral-8x7b": "Mixtral 8x7B",
    "mixtral-8x22b": "Mixtral 8x22B",
    # Meta
    "llama-3": "Llama 3",
    "llama-3.1": "Llama 3.1",
    "llama-3.2": "Llama 3.2",
    "llama-3.3": "Llama 3.3",
}

MODEL_PROVIDERS: Dict[str, str] = {
    # OpenAI
    "gpt-4": "openai",
    "gpt-4-turbo": "openai",
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    "gpt-3.5-turbo": "openai",
    "o1": "openai",
    "o1-mini": "openai",
    "o1-preview": "openai",
    # Anthropic
    "claude-3-opus": "anthropic",
    "claude-3-sonnet": "anthropic",
    "claude-3-haiku": "anthropic",
    "claude-3.5-sonnet": "anthropic",
    "claude-3.5-haiku": "anthropic",
    "claude-opus-4": "anthropic",
    "claude-sonnet-4": "anthropic",
    # Google
    "gemini-pro": "gemini",
    "gemini-1.5-pro": "gemini",
    "gemini-1.5-flash": "gemini",
    "gemini-2.0-flash": "gemini",
    # DeepSeek
    "deepseek-chat": "deepseek",
    "deepseek-coder": "deepseek",
    "deepseek-v3": "deepseek",
    # Mistral
    "mistral-large": "mistral",
    "mistral-medium": "mistral",
    "mistral-small": "mistral",
    "mixtral-8x7b": "mistral",
    "mixtral-8x22b": "mistral",
    # Meta
    "llama-3": "meta",
    "llama-3.1": "meta",
    "llama-3.2": "meta",
    "llama-3.3": "meta",
}

MODEL_CONTEXT_WINDOWS: Dict[str, int] = {
    "gpt-4": 8192,
    "gpt-4-turbo": 128000,
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-3.5-turbo": 16385,
    "o1": 200000,
    "o1-mini": 128000,
    "claude-3-opus": 200000,
    "claude-3-sonnet": 200000,
    "claude-3-haiku": 200000,
    "claude-3.5-sonnet": 200000,
    "claude-3.5-haiku": 200000,
    "claude-opus-4": 200000,
    "claude-sonnet-4": 200000,
    "gemini-pro": 32768,
    "gemini-1.5-pro": 2000000,
    "gemini-1.5-flash": 1000000,
    "gemini-2.0-flash": 1000000,
    "deepseek-chat": 64000,
    "deepseek-coder": 64000,
    "deepseek-v3": 64000,
    "mistral-large": 128000,
    "mistral-medium": 32000,
    "mistral-small": 32000,
    "mixtral-8x7b": 32768,
    "mixtral-8x22b": 65536,
}


# ==============================================================================
# Helper Functions
# ==============================================================================

def get_provider_name(provider: str) -> str:
    """
    Get display name for provider.

    Args:
        provider: Provider key

    Returns:
        Display name
    """
    return GENAI_PROVIDER_NAMES.get(provider.lower(), provider)


def get_provider_color(provider: str) -> str:
    """
    Get color for provider.

    Args:
        provider: Provider key

    Returns:
        Hex color code
    """
    return GENAI_PROVIDER_COLORS.get(provider.lower(), DEFAULT_PROVIDER_COLOR)


def get_model_name(model: str) -> str:
    """
    Get display name for model.

    Args:
        model: Model key

    Returns:
        Display name
    """
    return MODEL_NAMES.get(model.lower(), model)


def get_model_provider(model: str) -> Optional[str]:
    """
    Get provider for a model.

    Args:
        model: Model key

    Returns:
        Provider key or None
    """
    normalized = model.lower()

    # Check exact match
    if normalized in MODEL_PROVIDERS:
        return MODEL_PROVIDERS[normalized]

    # Check partial matches
    if "gpt" in normalized or "o1" in normalized:
        return "openai"
    if "claude" in normalized:
        return "anthropic"
    if "gemini" in normalized:
        return "gemini"
    if "deepseek" in normalized:
        return "deepseek"
    if "mistral" in normalized or "mixtral" in normalized:
        return "mistral"
    if "llama" in normalized:
        return "meta"

    return None


def get_context_window(model: str) -> Optional[int]:
    """
    Get context window size for model.

    Args:
        model: Model key

    Returns:
        Context window size or None
    """
    return MODEL_CONTEXT_WINDOWS.get(model.lower())


# ==============================================================================
# Provider Sets
# ==============================================================================

GENAI_PROVIDER_SET = frozenset(GENAI_PROVIDER_NAMES.keys())


def is_genai_provider(provider: str) -> bool:
    """
    Check if a provider is a known GenAI provider.

    Args:
        provider: Provider key

    Returns:
        True if known GenAI provider
    """
    return provider.lower() in GENAI_PROVIDER_SET
