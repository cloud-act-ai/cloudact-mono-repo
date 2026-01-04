"""
Integration Constants

Provider and integration configurations for status displays.
"""

from typing import Dict, Optional, Set


# ==============================================================================
# Integration Status Values
# ==============================================================================

INTEGRATION_STATUS = {
    "VALID": "VALID",
    "INVALID": "INVALID",
    "PENDING": "PENDING",
    "NOT_CONFIGURED": "NOT_CONFIGURED",
    "EXPIRED": "EXPIRED",
    "RATE_LIMITED": "RATE_LIMITED",
}

STATUS_DISPLAY_NAMES: Dict[str, str] = {
    "VALID": "Connected",
    "INVALID": "Invalid",
    "PENDING": "Pending",
    "NOT_CONFIGURED": "Not Configured",
    "EXPIRED": "Expired",
    "RATE_LIMITED": "Rate Limited",
}

STATUS_COLORS: Dict[str, str] = {
    "VALID": "#22c55e",         # green-500
    "INVALID": "#ef4444",       # red-500
    "PENDING": "#f59e0b",       # amber-500
    "NOT_CONFIGURED": "#94a3b8", # slate-400
    "EXPIRED": "#f97316",       # orange-500
    "RATE_LIMITED": "#8b5cf6",  # violet-500
}

VALID_STATUSES: Set[str] = frozenset(INTEGRATION_STATUS.keys())


# ==============================================================================
# Integration Categories
# ==============================================================================

INTEGRATION_CATEGORIES = {
    "cloud": "Cloud Providers",
    "genai": "GenAI Providers",
    "saas": "SaaS Applications",
    "observability": "Observability",
}

PROVIDER_CATEGORIES: Dict[str, str] = {
    # Cloud Providers
    "GCP": "cloud",
    "AWS": "cloud",
    "AZURE": "cloud",
    # GenAI Providers
    "OPENAI": "genai",
    "ANTHROPIC": "genai",
    "CLAUDE": "genai",
    "GEMINI": "genai",
    "DEEPSEEK": "genai",
    "COHERE": "genai",
    "MISTRAL": "genai",
    # SaaS
    "CHATGPT_PLUS": "saas",
    "GITHUB_COPILOT": "saas",
    "CURSOR": "saas",
    "NOTION_AI": "saas",
    "GRAMMARLY": "saas",
    # Observability
    "DATADOG": "observability",
    "NEWRELIC": "observability",
    "SPLUNK": "observability",
}


# ==============================================================================
# Provider Display Configuration
# ==============================================================================

PROVIDER_DISPLAY_NAMES: Dict[str, str] = {
    # Cloud
    "GCP": "Google Cloud",
    "AWS": "Amazon Web Services",
    "AZURE": "Microsoft Azure",
    # GenAI
    "OPENAI": "OpenAI",
    "ANTHROPIC": "Anthropic",
    "CLAUDE": "Anthropic Claude",
    "GEMINI": "Google Gemini",
    "DEEPSEEK": "DeepSeek",
    "COHERE": "Cohere",
    "MISTRAL": "Mistral AI",
    # SaaS
    "CHATGPT_PLUS": "ChatGPT Plus",
    "GITHUB_COPILOT": "GitHub Copilot",
    "CURSOR": "Cursor",
    "NOTION_AI": "Notion AI",
    "GRAMMARLY": "Grammarly",
    # Observability
    "DATADOG": "Datadog",
    "NEWRELIC": "New Relic",
    "SPLUNK": "Splunk",
}

PROVIDER_ICONS: Dict[str, str] = {
    "GCP": "google-cloud",
    "AWS": "aws",
    "AZURE": "azure",
    "OPENAI": "openai",
    "ANTHROPIC": "anthropic",
    "CLAUDE": "anthropic",
    "GEMINI": "google",
    "DEEPSEEK": "deepseek",
    "COHERE": "cohere",
    "MISTRAL": "mistral",
    "CHATGPT_PLUS": "openai",
    "GITHUB_COPILOT": "github",
    "CURSOR": "cursor",
    "NOTION_AI": "notion",
    "GRAMMARLY": "grammarly",
    "DATADOG": "datadog",
    "NEWRELIC": "newrelic",
    "SPLUNK": "splunk",
}

PROVIDER_COLORS: Dict[str, str] = {
    "GCP": "#4285F4",        # Google blue
    "AWS": "#FF9900",        # AWS orange
    "AZURE": "#0078D4",      # Azure blue
    "OPENAI": "#10A37F",     # OpenAI green
    "ANTHROPIC": "#D97757",  # Anthropic coral
    "CLAUDE": "#D97757",     # Anthropic coral
    "GEMINI": "#4285F4",     # Google blue
    "DEEPSEEK": "#6366F1",   # DeepSeek indigo
    "COHERE": "#FF6B6B",     # Cohere red
    "MISTRAL": "#F97316",    # Mistral orange
    "CHATGPT_PLUS": "#10A37F",  # OpenAI green
    "GITHUB_COPILOT": "#6e40c9", # GitHub purple
    "CURSOR": "#000000",     # Cursor black
    "NOTION_AI": "#000000",  # Notion black
    "DATADOG": "#632CA6",    # Datadog purple
    "NEWRELIC": "#008C99",   # New Relic teal
    "SPLUNK": "#000000",     # Splunk black
}

DEFAULT_PROVIDER_COLOR = "#94a3b8"  # slate-400


# ==============================================================================
# Helper Functions
# ==============================================================================

def get_provider_category(provider: str) -> Optional[str]:
    """
    Get category for a provider.

    Args:
        provider: Provider key

    Returns:
        Category key or None
    """
    return PROVIDER_CATEGORIES.get(provider.upper())


def get_category_name(category: str) -> str:
    """
    Get display name for a category.

    Args:
        category: Category key

    Returns:
        Display name
    """
    return INTEGRATION_CATEGORIES.get(category.lower(), category)


def get_provider_display_name(provider: str) -> str:
    """
    Get display name for a provider.

    Args:
        provider: Provider key

    Returns:
        Display name
    """
    return PROVIDER_DISPLAY_NAMES.get(provider.upper(), provider)


def get_provider_icon(provider: str) -> str:
    """
    Get icon name for a provider.

    Args:
        provider: Provider key

    Returns:
        Icon name
    """
    return PROVIDER_ICONS.get(provider.upper(), "server")


def get_provider_color(provider: str) -> str:
    """
    Get color for a provider.

    Args:
        provider: Provider key

    Returns:
        Hex color code
    """
    return PROVIDER_COLORS.get(provider.upper(), DEFAULT_PROVIDER_COLOR)


def get_status_display_name(status: str) -> str:
    """
    Get display name for a status.

    Args:
        status: Status key

    Returns:
        Display name
    """
    return STATUS_DISPLAY_NAMES.get(status.upper(), status)


def get_status_color(status: str) -> str:
    """
    Get color for a status.

    Args:
        status: Status key

    Returns:
        Hex color code
    """
    return STATUS_COLORS.get(status.upper(), "#94a3b8")


def is_valid_status(status: str) -> bool:
    """
    Check if a status is valid.

    Args:
        status: Status to check

    Returns:
        True if valid status
    """
    return status.upper() in VALID_STATUSES


def is_healthy_status(status: str) -> bool:
    """
    Check if a status indicates healthy integration.

    Args:
        status: Status to check

    Returns:
        True if healthy
    """
    return status.upper() == "VALID"


# ==============================================================================
# Provider Sets
# ==============================================================================

CLOUD_PROVIDERS = frozenset(
    k for k, v in PROVIDER_CATEGORIES.items() if v == "cloud"
)

GENAI_PROVIDERS = frozenset(
    k for k, v in PROVIDER_CATEGORIES.items() if v == "genai"
)

SAAS_PROVIDERS = frozenset(
    k for k, v in PROVIDER_CATEGORIES.items() if v == "saas"
)

ALL_PROVIDERS = frozenset(PROVIDER_CATEGORIES.keys())
