"""
Integration Aggregations

Polars-based aggregation functions for integration data.
Provides status breakdowns, category summaries, and validation history.
"""

import polars as pl
from typing import List, Dict, Any, Optional

from src.lib.integrations.constants import (
    PROVIDER_CATEGORIES,
    get_provider_category,
    get_provider_display_name,
    get_status_display_name,
)


# ==============================================================================
# Status Aggregations
# ==============================================================================

def aggregate_integration_status(
    df: pl.DataFrame,
    provider_col: str = "provider",
    status_col: str = "status",
    include_display_names: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate integration status by provider.

    Args:
        df: Polars DataFrame with integration data
        provider_col: Column name for provider
        status_col: Column name for status
        include_display_names: Include display names

    Returns:
        List of dicts with provider, status, count
    """
    if df.is_empty():
        return []

    result = (
        df.lazy()
        .group_by([provider_col, status_col])
        .agg([
            pl.count().alias("count"),
        ])
        .sort([provider_col, status_col])
        .collect()
    )

    breakdown = []
    for row in result.iter_rows(named=True):
        provider = row[provider_col] or "Unknown"
        status = row[status_col] or "NOT_CONFIGURED"

        item = {
            "provider": provider,
            "status": status,
            "count": row["count"],
        }

        if include_display_names:
            item["provider_display"] = get_provider_display_name(provider)
            item["status_display"] = get_status_display_name(status)
            item["category"] = get_provider_category(provider)

        breakdown.append(item)

    return breakdown


def aggregate_by_category(
    df: pl.DataFrame,
    provider_col: str = "provider",
    status_col: str = "status",
) -> List[Dict[str, Any]]:
    """
    Aggregate integrations by category.

    Args:
        df: Polars DataFrame with integration data
        provider_col: Column name for provider
        status_col: Column name for status

    Returns:
        List of dicts with category, counts
    """
    if df.is_empty():
        return []

    # Add category column
    category_mapping = {k: v for k, v in PROVIDER_CATEGORIES.items()}

    df_with_cat = df.with_columns(
        pl.col(provider_col)
        .str.to_uppercase()
        .replace(category_mapping, default="other")
        .alias("_category")
    )

    result = (
        df_with_cat.lazy()
        .group_by("_category")
        .agg([
            pl.count().alias("total"),
            (pl.col(status_col).str.to_uppercase() == "VALID").sum().alias("valid"),
            (pl.col(status_col).str.to_uppercase() == "INVALID").sum().alias("invalid"),
            (pl.col(status_col).str.to_uppercase() == "PENDING").sum().alias("pending"),
            pl.col(provider_col).n_unique().alias("provider_count"),
        ])
        .sort("_category")
        .collect()
    )

    breakdown = []
    for row in result.iter_rows(named=True):
        category = row["_category"]
        total = row["total"]
        valid = row["valid"]

        breakdown.append({
            "category": category,
            "total": total,
            "valid": valid,
            "invalid": row["invalid"],
            "pending": row["pending"],
            "provider_count": row["provider_count"],
            "valid_rate": round((valid / total) * 100, 2) if total > 0 else 0.0,
        })

    return breakdown


def aggregate_by_provider(
    df: pl.DataFrame,
    provider_col: str = "provider",
    status_col: str = "status",
    validated_at_col: Optional[str] = "last_validated_at",
) -> List[Dict[str, Any]]:
    """
    Aggregate integration data by provider.

    Args:
        df: Polars DataFrame with integration data
        provider_col: Column name for provider
        status_col: Column name for status
        validated_at_col: Column name for last validated timestamp

    Returns:
        List of dicts with provider summary
    """
    if df.is_empty():
        return []

    agg_cols = [
        pl.count().alias("total"),
        (pl.col(status_col).str.to_uppercase() == "VALID").sum().alias("valid"),
        (pl.col(status_col).str.to_uppercase() == "INVALID").sum().alias("invalid"),
        pl.col(status_col).mode().first().alias("most_common_status"),
    ]

    if validated_at_col and validated_at_col in df.columns:
        agg_cols.append(
            pl.col(validated_at_col).max().alias("last_validated")
        )

    result = (
        df.lazy()
        .group_by(provider_col)
        .agg(agg_cols)
        .sort(provider_col)
        .collect()
    )

    breakdown = []
    for row in result.iter_rows(named=True):
        provider = row[provider_col] or "Unknown"
        total = row["total"]
        valid = row["valid"]

        item = {
            "provider": provider,
            "provider_display": get_provider_display_name(provider),
            "category": get_provider_category(provider),
            "total": total,
            "valid": valid,
            "invalid": row["invalid"],
            "most_common_status": row["most_common_status"],
            "valid_rate": round((valid / total) * 100, 2) if total > 0 else 0.0,
        }

        if "last_validated" in row:
            item["last_validated"] = row["last_validated"]

        breakdown.append(item)

    return breakdown


# ==============================================================================
# Validation History Aggregations
# ==============================================================================

def aggregate_validation_history(
    df: pl.DataFrame,
    date_col: str = "validated_at",
    status_col: str = "status",
    provider_col: str = "provider",
    granularity: str = "daily",
) -> List[Dict[str, Any]]:
    """
    Aggregate validation history over time.

    Args:
        df: Polars DataFrame with validation history
        date_col: Column name for validation timestamp
        status_col: Column name for status
        provider_col: Column name for provider
        granularity: "daily", "weekly", or "monthly"

    Returns:
        List of dicts with time-based validation metrics
    """
    if df.is_empty():
        return []

    # Determine truncation based on granularity
    if granularity == "weekly":
        date_expr = pl.col(date_col).dt.truncate("1w").alias("_period")
    elif granularity == "monthly":
        date_expr = pl.col(date_col).dt.truncate("1mo").alias("_period")
    else:
        date_expr = pl.col(date_col).dt.truncate("1d").alias("_period")

    result = (
        df.lazy()
        .with_columns(date_expr)
        .group_by("_period")
        .agg([
            pl.count().alias("total_validations"),
            (pl.col(status_col).str.to_uppercase() == "VALID").sum().alias("valid"),
            (pl.col(status_col).str.to_uppercase() == "INVALID").sum().alias("invalid"),
            pl.col(provider_col).n_unique().alias("providers_checked"),
        ])
        .sort("_period")
        .collect()
    )

    breakdown = []
    for row in result.iter_rows(named=True):
        period = row["_period"]
        # BUG-047 FIX: Handle None dates before processing
        if period is None:
            continue  # Skip records with None dates

        total = row["total_validations"]
        valid = row["valid"]

        period_str = period.strftime("%Y-%m-%d") if period else "Unknown"

        breakdown.append({
            "period": period_str,
            "total_validations": total,
            "valid": valid,
            "invalid": row["invalid"],
            "providers_checked": row["providers_checked"],
            "success_rate": round((valid / total) * 100, 2) if total > 0 else 0.0,
        })

    return breakdown


def aggregate_error_patterns(
    df: pl.DataFrame,
    error_col: str = "last_error",
    provider_col: str = "provider",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Aggregate common error patterns.

    Args:
        df: Polars DataFrame with integration errors
        error_col: Column name for error message
        provider_col: Column name for provider
        limit: Maximum number of patterns to return

    Returns:
        List of dicts with error patterns
    """
    if df.is_empty():
        return []

    # Filter to rows with errors
    df_errors = df.filter(pl.col(error_col).is_not_null())

    if df_errors.is_empty():
        return []

    result = (
        df_errors.lazy()
        .group_by(error_col)
        .agg([
            pl.count().alias("count"),
            pl.col(provider_col).n_unique().alias("affected_providers"),
            pl.col(provider_col).first().alias("example_provider"),
        ])
        .sort("count", descending=True)
        .limit(limit)
        .collect()
    )

    # BUG-048 FIX: Sanitize error messages before returning
    def sanitize_error(error_msg: str) -> str:
        """Remove potential credentials from error messages"""
        if not error_msg:
            return error_msg
        import re
        # Remove API keys (sk-..., sk_..., etc.)
        sanitized = re.sub(r'sk[-_][a-zA-Z0-9]{20,}', '[REDACTED_API_KEY]', error_msg)
        # Remove potential tokens
        sanitized = re.sub(r'[a-zA-Z0-9]{32,}', '[REDACTED_TOKEN]', sanitized)
        return sanitized

    patterns = []
    for row in result.iter_rows(named=True):
        patterns.append({
            "error": sanitize_error(row[error_col]),
            "count": row["count"],
            "affected_providers": row["affected_providers"],
            "example_provider": row["example_provider"],
        })

    return patterns


# ==============================================================================
# Summary Aggregation
# ==============================================================================

def aggregate_integration_summary(
    df: pl.DataFrame,
    provider_col: str = "provider",
    status_col: str = "status",
) -> Dict[str, Any]:
    """
    Create overall integration summary.

    Args:
        df: Polars DataFrame with integration data
        provider_col: Column name for provider
        status_col: Column name for status

    Returns:
        Dict with overall summary
    """
    # BUG-050 FIX: Wrap Polars operations in try/except
    try:
        if df.is_empty():
            return {
                "total_integrations": 0,
                "valid_count": 0,
                "invalid_count": 0,
                "pending_count": 0,
                "unique_providers": 0,
                "health_percentage": 100.0,
                "by_category": {},
            }
    except Exception as e:
        # Return empty summary on error
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error checking DataFrame empty status: {e}")
        return {
            "total_integrations": 0,
            "valid_count": 0,
            "invalid_count": 0,
            "pending_count": 0,
            "unique_providers": 0,
            "health_percentage": 100.0,
            "by_category": {},
            "error": str(e),
        }

    # Overall counts
    total = len(df)
    valid = df.filter(pl.col(status_col).str.to_uppercase() == "VALID").height
    invalid = df.filter(pl.col(status_col).str.to_uppercase() == "INVALID").height
    pending = df.filter(pl.col(status_col).str.to_uppercase() == "PENDING").height
    unique_providers = df[provider_col].n_unique()

    # Category breakdown
    category_breakdown = aggregate_by_category(df, provider_col, status_col)
    by_category = {item["category"]: item for item in category_breakdown}

    return {
        "total_integrations": total,
        "valid_count": valid,
        "invalid_count": invalid,
        "pending_count": pending,
        "unique_providers": unique_providers,
        "health_percentage": round((valid / total) * 100, 2) if total > 0 else 100.0,
        "by_category": by_category,
    }
