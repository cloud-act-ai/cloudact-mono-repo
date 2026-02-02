"""
Cost Category Constants

Canonical category naming conventions used across CloudAct.
These constants ensure consistency between:
- BigQuery data (ServiceCategory field)
- API responses (category field)
- Frontend display (category filters)

IMPORTANT: All category values should be lowercase.
"""

# =============================================================================
# Canonical Category Names (used in API responses and frontend)
# =============================================================================

CATEGORY_GENAI = "genai"
CATEGORY_CLOUD = "cloud"
CATEGORY_SUBSCRIPTION = "subscription"
CATEGORY_OTHER = "other"

# All valid categories
VALID_CATEGORIES = frozenset([
    CATEGORY_GENAI,
    CATEGORY_CLOUD,
    CATEGORY_SUBSCRIPTION,
    CATEGORY_OTHER,
])


# =============================================================================
# ServiceCategory Mapping (FOCUS 1.3 to API category)
# =============================================================================

# Maps various ServiceCategory values found in BigQuery to canonical categories
SERVICE_CATEGORY_MAP = {
    # GenAI mappings
    "genai": CATEGORY_GENAI,
    "llm": CATEGORY_GENAI,
    "ai/ml": CATEGORY_GENAI,
    "ai and machine learning": CATEGORY_GENAI,
    "ai": CATEGORY_GENAI,

    # Cloud mappings
    "cloud": CATEGORY_CLOUD,
    "compute": CATEGORY_CLOUD,
    "storage": CATEGORY_CLOUD,
    "networking": CATEGORY_CLOUD,
    "database": CATEGORY_CLOUD,

    # Subscription mappings
    "subscription": CATEGORY_SUBSCRIPTION,
    "saas": CATEGORY_SUBSCRIPTION,
    "software": CATEGORY_SUBSCRIPTION,
}


def normalize_category(raw_category: str | None) -> str:
    """
    Normalize a raw ServiceCategory value to canonical category name.

    Args:
        raw_category: Raw category value from BigQuery (may be None or any case)

    Returns:
        Canonical lowercase category name (genai, cloud, subscription, other)
    """
    if not raw_category:
        return CATEGORY_OTHER

    normalized = raw_category.lower().strip()
    return SERVICE_CATEGORY_MAP.get(normalized, CATEGORY_OTHER)


# =============================================================================
# Source System Mapping
# =============================================================================

# Maps x_source_system values to categories
SOURCE_SYSTEM_CATEGORY_MAP = {
    "subscription_costs_daily": CATEGORY_SUBSCRIPTION,
    "subscription_costs": CATEGORY_SUBSCRIPTION,
    "genai_costs": CATEGORY_GENAI,
    "genai_costs_daily": CATEGORY_GENAI,
    "genai_costs_daily_unified": CATEGORY_GENAI,
    "cloud_gcp_billing": CATEGORY_CLOUD,
    "cloud_aws_billing": CATEGORY_CLOUD,
    "cloud_azure_billing": CATEGORY_CLOUD,
    "cloud_oci_billing": CATEGORY_CLOUD,
}


def get_category_from_source_system(source_system: str | None) -> str | None:
    """
    Get category from x_source_system value.

    Args:
        source_system: The x_source_system value from BigQuery

    Returns:
        Category name or None if not recognized
    """
    if not source_system:
        return None
    return SOURCE_SYSTEM_CATEGORY_MAP.get(source_system.lower())


# =============================================================================
# Provider Lists (for category detection)
# =============================================================================

GENAI_PROVIDERS = frozenset([
    "openai", "anthropic", "google ai", "cohere", "mistral",
    "gemini", "claude", "azure openai", "aws bedrock", "vertex ai",
    "deepseek", "groq", "perplexity", "huggingface"
])

CLOUD_PROVIDERS = frozenset([
    "gcp", "aws", "azure", "google", "amazon", "microsoft", "oci", "oracle",
    "google cloud", "amazon web services", "microsoft azure"
])


def is_genai_provider(provider: str | None) -> bool:
    """Check if provider name indicates a GenAI provider."""
    if not provider:
        return False
    provider_lower = provider.lower()
    return any(p in provider_lower for p in GENAI_PROVIDERS)


def is_cloud_provider(provider: str | None) -> bool:
    """Check if provider name indicates a Cloud provider."""
    if not provider:
        return False
    provider_lower = provider.lower()
    return any(p in provider_lower for p in CLOUD_PROVIDERS)


def detect_category(
    provider: str | None = None,
    source_system: str | None = None,
    service_category: str | None = None
) -> str:
    """
    Detect the canonical category from available fields.

    Priority:
    1. x_source_system (most reliable)
    2. Provider name detection
    3. ServiceCategory normalization
    4. Default to 'other'

    Args:
        provider: Provider/ServiceProviderName
        source_system: x_source_system value
        service_category: ServiceCategory value

    Returns:
        Canonical category name
    """
    # Try source system first
    if source_system:
        category = get_category_from_source_system(source_system)
        if category:
            return category

    # Try provider detection
    if provider:
        if is_genai_provider(provider):
            return CATEGORY_GENAI
        if is_cloud_provider(provider):
            return CATEGORY_CLOUD

    # Fall back to ServiceCategory normalization
    return normalize_category(service_category)
