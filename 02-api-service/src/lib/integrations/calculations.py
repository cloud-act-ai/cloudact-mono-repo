"""
Integration Calculations

Health checks, status calculations, and coverage metrics.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

from src.lib.integrations.constants import (
    PROVIDER_CATEGORIES,
    INTEGRATION_CATEGORIES,
    is_healthy_status,
)


# ==============================================================================
# Data Models
# ==============================================================================

@dataclass
class IntegrationHealth:
    """Overall integration health summary."""
    total_integrations: int
    valid_count: int
    invalid_count: int
    pending_count: int
    not_configured_count: int
    health_percentage: float
    all_healthy: bool
    requires_attention: bool
    attention_providers: List[str]


@dataclass
class IntegrationSummary:
    """Summary of integrations by category."""
    category: str
    category_name: str
    total_providers: int
    configured_count: int
    valid_count: int
    invalid_count: int
    coverage_percentage: float


# ==============================================================================
# Status Calculations
# ==============================================================================

def calculate_status_counts(
    integrations: List[Dict[str, Any]],
    status_field: str = "status"
) -> Dict[str, int]:
    """
    Calculate status counts from integration list.

    Args:
        integrations: List of integration dicts
        status_field: Field name for status

    Returns:
        Dict with status counts
    """
    counts = {
        "VALID": 0,
        "INVALID": 0,
        "PENDING": 0,
        "NOT_CONFIGURED": 0,
        "EXPIRED": 0,
        "RATE_LIMITED": 0,
        "total": len(integrations),
    }

    for integration in integrations:
        status = integration.get(status_field, "NOT_CONFIGURED").upper()
        if status in counts:
            counts[status] += 1
        else:
            counts["NOT_CONFIGURED"] += 1

    return counts


def calculate_valid_rate(
    valid_count: int,
    total_count: int
) -> float:
    """
    Calculate valid integration rate.

    Args:
        valid_count: Number of valid integrations
        total_count: Total integration count

    Returns:
        Valid rate (0-100)
    """
    if total_count <= 0:
        return 100.0
    return round((valid_count / total_count) * 100, 2)


def calculate_provider_coverage(
    configured_providers: List[str],
    category: Optional[str] = None
) -> float:
    """
    Calculate provider coverage percentage.

    Args:
        configured_providers: List of configured provider keys
        category: Optional category to filter

    Returns:
        Coverage percentage (0-100)
    """
    if category:
        all_in_category = [
            k for k, v in PROVIDER_CATEGORIES.items()
            if v == category.lower()
        ]
        if not all_in_category:
            return 0.0

        configured_in_category = [
            p for p in configured_providers
            if p.upper() in all_in_category
        ]
        return round((len(configured_in_category) / len(all_in_category)) * 100, 2)

    if not PROVIDER_CATEGORIES:
        return 0.0

    configured_upper = [p.upper() for p in configured_providers]
    matching = [p for p in configured_upper if p in PROVIDER_CATEGORIES]
    return round((len(matching) / len(PROVIDER_CATEGORIES)) * 100, 2)


# ==============================================================================
# Health Calculations
# ==============================================================================

def calculate_integration_health(
    integrations: List[Dict[str, Any]],
    status_field: str = "status",
    provider_field: str = "provider"
) -> IntegrationHealth:
    """
    Calculate overall integration health.

    Args:
        integrations: List of integration dicts
        status_field: Field name for status
        provider_field: Field name for provider

    Returns:
        IntegrationHealth dataclass
    """
    if not integrations:
        return IntegrationHealth(
            total_integrations=0,
            valid_count=0,
            invalid_count=0,
            pending_count=0,
            not_configured_count=0,
            health_percentage=100.0,
            all_healthy=True,
            requires_attention=False,
            attention_providers=[],
        )

    counts = calculate_status_counts(integrations, status_field)

    # Find providers requiring attention
    attention_providers = []
    for integration in integrations:
        status = integration.get(status_field, "").upper()
        if status in ("INVALID", "EXPIRED", "RATE_LIMITED"):
            provider = integration.get(provider_field, "Unknown")
            if provider not in attention_providers:
                attention_providers.append(provider)

    health_pct = calculate_valid_rate(counts["VALID"], counts["total"])
    all_healthy = counts["INVALID"] == 0 and counts["EXPIRED"] == 0

    return IntegrationHealth(
        total_integrations=counts["total"],
        valid_count=counts["VALID"],
        invalid_count=counts["INVALID"],
        pending_count=counts["PENDING"],
        not_configured_count=counts["NOT_CONFIGURED"],
        health_percentage=health_pct,
        all_healthy=all_healthy,
        requires_attention=len(attention_providers) > 0,
        attention_providers=attention_providers,
    )


def calculate_category_summary(
    integrations: List[Dict[str, Any]],
    category: str,
    status_field: str = "status",
    provider_field: str = "provider"
) -> IntegrationSummary:
    """
    Calculate summary for a specific category.

    Args:
        integrations: List of integration dicts
        category: Category to summarize
        status_field: Field name for status
        provider_field: Field name for provider

    Returns:
        IntegrationSummary dataclass
    """
    category_lower = category.lower()
    category_name = INTEGRATION_CATEGORIES.get(category_lower, category)

    # Get all providers in this category
    all_providers_in_category = [
        k for k, v in PROVIDER_CATEGORIES.items()
        if v == category_lower
    ]

    # Filter integrations to this category
    category_integrations = []
    for integration in integrations:
        provider = integration.get(provider_field, "").upper()
        if provider in all_providers_in_category:
            category_integrations.append(integration)

    # Calculate counts
    configured = [i for i in category_integrations if i.get(status_field) != "NOT_CONFIGURED"]
    valid = [i for i in category_integrations if i.get(status_field, "").upper() == "VALID"]
    invalid = [i for i in category_integrations if i.get(status_field, "").upper() in ("INVALID", "EXPIRED")]

    coverage = calculate_valid_rate(len(valid), len(all_providers_in_category))

    return IntegrationSummary(
        category=category_lower,
        category_name=category_name,
        total_providers=len(all_providers_in_category),
        configured_count=len(configured),
        valid_count=len(valid),
        invalid_count=len(invalid),
        coverage_percentage=coverage,
    )


def calculate_all_category_summaries(
    integrations: List[Dict[str, Any]],
    status_field: str = "status",
    provider_field: str = "provider"
) -> List[IntegrationSummary]:
    """
    Calculate summaries for all categories.

    Args:
        integrations: List of integration dicts
        status_field: Field name for status
        provider_field: Field name for provider

    Returns:
        List of IntegrationSummary
    """
    summaries = []
    for category in INTEGRATION_CATEGORIES.keys():
        summary = calculate_category_summary(
            integrations, category, status_field, provider_field
        )
        summaries.append(summary)
    return summaries


# ==============================================================================
# Validation Metrics
# ==============================================================================

def calculate_validation_freshness(
    last_validated_at: Optional[datetime],
    threshold_hours: int = 24
) -> Dict[str, Any]:
    """
    Calculate validation freshness.

    Args:
        last_validated_at: Last validation timestamp
        threshold_hours: Hours before considered stale

    Returns:
        Dict with freshness info
    """
    if not last_validated_at:
        return {
            "is_fresh": False,
            "is_stale": True,
            "hours_since_validation": None,
            "status": "never_validated",
        }

    now = datetime.utcnow()
    delta = now - last_validated_at
    hours_since = delta.total_seconds() / 3600

    is_fresh = hours_since < threshold_hours
    is_stale = hours_since >= threshold_hours * 2

    if is_fresh:
        status = "fresh"
    elif is_stale:
        status = "stale"
    else:
        status = "aging"

    return {
        "is_fresh": is_fresh,
        "is_stale": is_stale,
        "hours_since_validation": round(hours_since, 2),
        "status": status,
    }


def calculate_error_rate(
    validation_history: List[Dict[str, Any]],
    status_field: str = "status",
    days: int = 7
) -> float:
    """
    Calculate validation error rate over time period.

    Args:
        validation_history: List of validation records
        status_field: Field name for status
        days: Number of days to consider

    Returns:
        Error rate (0-100)
    """
    if not validation_history:
        return 0.0

    cutoff = datetime.utcnow() - timedelta(days=days)

    recent = []
    for record in validation_history:
        validated_at = record.get("validated_at")
        if validated_at and validated_at >= cutoff:
            recent.append(record)

    if not recent:
        return 0.0

    errors = sum(
        1 for r in recent
        if r.get(status_field, "").upper() in ("INVALID", "EXPIRED", "RATE_LIMITED")
    )

    return round((errors / len(recent)) * 100, 2)
