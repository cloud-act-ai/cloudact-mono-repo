"""
Cost Aggregations

Polars-based aggregation functions for cost data.
Provides consistent grouping and summarization across all endpoints.
"""

import polars as pl
from typing import List, Dict, Any, Optional
from datetime import date

from src.lib.costs.calculations import calculate_percentage


# ==============================================================================
# Provider Aggregations
# ==============================================================================

def aggregate_by_provider(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    provider_column: str = "ServiceProviderName",
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by provider.

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values
        provider_column: Column name for provider
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with provider, total_cost, record_count, percentage
    """
    if df.is_empty():
        return []

    # Ensure cost column is numeric
    df = df.with_columns(
        pl.col(cost_column).cast(pl.Float64).alias(cost_column)
    )

    result = (
        df.lazy()
        .group_by(provider_column)
        .agg([
            pl.col(cost_column).sum().alias("total_cost"),
            pl.count().alias("record_count"),
        ])
        .sort("total_cost", descending=True)
        .collect()
    )

    total_cost = result["total_cost"].sum()

    breakdown = []
    for row in result.iter_rows(named=True):
        item = {
            "provider": row[provider_column] or "Unknown",
            "total_cost": round(row["total_cost"] or 0, 2),
            "record_count": row["record_count"],
        }
        if include_percentage:
            item["percentage"] = calculate_percentage(
                row["total_cost"] or 0, total_cost
            )
        breakdown.append(item)

    return breakdown


# ==============================================================================
# Service Aggregations
# ==============================================================================

def aggregate_by_service(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    service_column: str = "ServiceName",
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by service.

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values
        service_column: Column name for service
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with service, total_cost, record_count, percentage
    """
    if df.is_empty():
        return []

    df = df.with_columns(
        pl.col(cost_column).cast(pl.Float64).alias(cost_column)
    )

    result = (
        df.lazy()
        .group_by(service_column)
        .agg([
            pl.col(cost_column).sum().alias("total_cost"),
            pl.count().alias("record_count"),
        ])
        .sort("total_cost", descending=True)
        .collect()
    )

    total_cost = result["total_cost"].sum()

    breakdown = []
    for row in result.iter_rows(named=True):
        item = {
            "service": row[service_column] or "Unknown",
            "total_cost": round(row["total_cost"] or 0, 2),
            "record_count": row["record_count"],
        }
        if include_percentage:
            item["percentage"] = calculate_percentage(
                row["total_cost"] or 0, total_cost
            )
        breakdown.append(item)

    return breakdown


# ==============================================================================
# Category Aggregations
# ==============================================================================

def aggregate_by_category(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    category_column: str = "ServiceCategory",
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by service category (Cloud, SaaS, LLM).

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values
        category_column: Column name for category
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with category, total_cost, record_count, percentage
    """
    if df.is_empty():
        return []

    df = df.with_columns(
        pl.col(cost_column).cast(pl.Float64).alias(cost_column)
    )

    result = (
        df.lazy()
        .group_by(category_column)
        .agg([
            pl.col(cost_column).sum().alias("total_cost"),
            pl.count().alias("record_count"),
        ])
        .sort("total_cost", descending=True)
        .collect()
    )

    total_cost = result["total_cost"].sum()

    breakdown = []
    for row in result.iter_rows(named=True):
        item = {
            "category": row[category_column] or "Unknown",
            "total_cost": round(row["total_cost"] or 0, 2),
            "record_count": row["record_count"],
        }
        if include_percentage:
            item["percentage"] = calculate_percentage(
                row["total_cost"] or 0, total_cost
            )
        breakdown.append(item)

    return breakdown


# ==============================================================================
# Date Aggregations
# ==============================================================================

def aggregate_by_date(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    date_column: str = "ChargePeriodStart",
    granularity: str = "daily",
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by date with configurable granularity.

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values
        date_column: Column name for date
        granularity: "daily", "weekly", or "monthly"

    Returns:
        List of dicts with date, total_cost, record_count
    """
    if df.is_empty():
        return []

    df = df.with_columns([
        pl.col(cost_column).cast(pl.Float64).alias(cost_column),
        pl.col(date_column).cast(pl.Date).alias("_date"),
    ])

    if granularity == "daily":
        group_expr = pl.col("_date")
        date_format = "%Y-%m-%d"
    elif granularity == "weekly":
        # Group by week start (Monday)
        group_expr = pl.col("_date").dt.truncate("1w")
        date_format = "%Y-%m-%d"
    elif granularity == "monthly":
        group_expr = pl.col("_date").dt.truncate("1mo")
        date_format = "%Y-%m"
    else:
        raise ValueError(f"Invalid granularity: {granularity}")

    result = (
        df.lazy()
        .with_columns(group_expr.alias("_period"))
        .group_by("_period")
        .agg([
            pl.col(cost_column).sum().alias("total_cost"),
            pl.count().alias("record_count"),
        ])
        .sort("_period")
        .collect()
    )

    breakdown = []
    for row in result.iter_rows(named=True):
        period = row["_period"]
        if period is not None:
            if granularity == "monthly":
                date_str = period.strftime(date_format)
            else:
                date_str = period.strftime(date_format)
        else:
            date_str = "Unknown"

        breakdown.append({
            "date": date_str,
            "total_cost": round(row["total_cost"] or 0, 2),
            "record_count": row["record_count"],
        })

    return breakdown


# ==============================================================================
# Hierarchy Aggregations
# ==============================================================================

def aggregate_by_hierarchy(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    hierarchy_level: int = 1,
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by organizational hierarchy (10-level support).

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values
        hierarchy_level: Level number to aggregate by (1-10, default=1 for department)
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with hierarchy entity, total_cost, record_count, percentage
    """
    if df.is_empty():
        return []

    # Validate level
    if not 1 <= hierarchy_level <= 10:
        raise ValueError(f"hierarchy_level must be 1-10, got {hierarchy_level}")

    # Check if hierarchy columns exist for the specified level
    level_id_col = f"x_hierarchy_level_{hierarchy_level}_id"
    level_name_col = f"x_hierarchy_level_{hierarchy_level}_name"

    if level_id_col not in df.columns:
        return []

    df = df.with_columns(
        pl.col(cost_column).cast(pl.Float64).alias(cost_column)
    )

    # Filter to non-null entities at the specified level
    filtered = df.lazy().filter(pl.col(level_id_col).is_not_null())

    # Group by level ID and name
    group_cols = [level_id_col]
    if level_name_col in df.columns:
        group_cols.append(level_name_col)

    result = (
        filtered
        .group_by(group_cols)
        .agg([
            pl.col(cost_column).sum().alias("total_cost"),
            pl.count().alias("record_count"),
        ])
        .sort("total_cost", descending=True)
        .collect()
    )

    total_cost = result["total_cost"].sum()

    breakdown = []
    for row in result.iter_rows(named=True):
        entity_id = row[level_id_col]
        entity_name = row.get(level_name_col) or entity_id

        item = {
            "entity_id": entity_id,
            "entity_name": entity_name,
            "hierarchy_level": hierarchy_level,
            "total_cost": round(row["total_cost"] or 0, 2),
            "record_count": row["record_count"],
        }
        if include_percentage:
            item["percentage"] = calculate_percentage(
                row["total_cost"] or 0, total_cost
            )
        breakdown.append(item)

    return breakdown


# ==============================================================================
# Multi-Dimensional Aggregations
# ==============================================================================

def aggregate_provider_by_date(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    provider_column: str = "ServiceProviderName",
    date_column: str = "ChargePeriodStart",
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by provider and date for trend analysis.

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values
        provider_column: Column name for provider
        date_column: Column name for date

    Returns:
        List of dicts with date, provider breakdowns
    """
    if df.is_empty():
        return []

    df = df.with_columns([
        pl.col(cost_column).cast(pl.Float64).alias(cost_column),
        pl.col(date_column).cast(pl.Date).alias("_date"),
    ])

    result = (
        df.lazy()
        .group_by(["_date", provider_column])
        .agg(pl.col(cost_column).sum().alias("total_cost"))
        .sort(["_date", "total_cost"], descending=[False, True])
        .collect()
    )

    # Pivot to get providers as columns
    dates = {}
    for row in result.iter_rows(named=True):
        date_str = row["_date"].strftime("%Y-%m-%d") if row["_date"] else "Unknown"
        provider = row[provider_column] or "Unknown"
        cost = round(row["total_cost"] or 0, 2)

        if date_str not in dates:
            dates[date_str] = {"date": date_str, "providers": {}, "total": 0}

        dates[date_str]["providers"][provider] = cost
        dates[date_str]["total"] += cost

    return list(dates.values())


# ==============================================================================
# Granular Aggregations (for client-side filtering)
# ==============================================================================

def aggregate_granular(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    date_column: str = "ChargePeriodStart",
    provider_column: str = "ServiceProviderName",
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by date + provider + hierarchy for client-side filtering.

    Returns granular data that allows frontend to filter by:
    - Time range (filter by date)
    - Provider (filter by provider)
    - Category (filter by category, derived from provider)
    - Hierarchy (filter by dept_id/project_id/team_id)

    This enables ONE API call for 365 days, then ALL filters are client-side.
    Data size: ~365 days × ~50 unique provider+dept combos = ~18,250 rows

    Args:
        df: Polars DataFrame with cost data including hierarchy columns
        cost_column: Column name for cost values
        date_column: Column name for date
        provider_column: Column name for provider

    Returns:
        List of dicts with date, provider, category, hierarchy, cost
    """
    if df.is_empty():
        return []

    # Define grouping columns (include hierarchy if present)
    group_cols = ["_date", provider_column]

    # Add 10-level hierarchy columns if they exist
    hierarchy_cols = []
    for level in range(1, 11):
        level_id_col = f"x_hierarchy_level_{level}_id"
        level_name_col = f"x_hierarchy_level_{level}_name"
        if level_id_col in df.columns:
            hierarchy_cols.append(level_id_col)
        if level_name_col in df.columns:
            hierarchy_cols.append(level_name_col)

    # Add category columns if they exist
    category_cols = []
    if "x_source_system" in df.columns:
        category_cols.append("x_source_system")
    if "ServiceCategory" in df.columns:
        category_cols.append("ServiceCategory")

    all_group_cols = group_cols + hierarchy_cols + category_cols

    df = df.with_columns([
        pl.col(cost_column).cast(pl.Float64).alias(cost_column),
        pl.col(date_column).cast(pl.Date).alias("_date"),
    ])

    result = (
        df.lazy()
        .group_by(all_group_cols)
        .agg([
            pl.col(cost_column).sum().alias("total_cost"),
            pl.count().alias("record_count"),
        ])
        .sort("_date")
        .collect()
    )

    granular_data = []
    for row in result.iter_rows(named=True):
        item = {
            "date": row["_date"].strftime("%Y-%m-%d") if row["_date"] else None,
            "provider": row[provider_column] or "Unknown",
            "total_cost": round(row["total_cost"] or 0, 2),
            "record_count": row["record_count"],
        }

        # Add 10-level hierarchy fields (null if not present)
        for level in range(1, 11):
            level_id_col = f"x_hierarchy_level_{level}_id"
            level_name_col = f"x_hierarchy_level_{level}_name"
            item[f"level_{level}_id"] = row.get(level_id_col)
            item[f"level_{level}_name"] = row.get(level_name_col)

        # FIX-HIERARCHY-001: Add backward-compatible aliases for 3-level hierarchy
        # Frontend uses dept_id/project_id/team_id for filtering, maps to levels 1/2/3
        item["dept_id"] = item.get("level_1_id")
        item["project_id"] = item.get("level_2_id")
        item["team_id"] = item.get("level_3_id")

        # Derive category from source_system or provider
        source_system = row.get("x_source_system", "")
        if source_system == "subscription_costs_daily":
            item["category"] = "subscription"
        elif _is_genai_provider(item["provider"]):
            item["category"] = "genai"
        elif _is_cloud_provider(item["provider"]):
            item["category"] = "cloud"
        else:
            item["category"] = row.get("ServiceCategory", "other") or "other"

        granular_data.append(item)

    return granular_data


def _is_genai_provider(provider: str) -> bool:
    """Check if provider is a GenAI provider."""
    genai_providers = [
        "openai", "anthropic", "google ai", "cohere", "mistral",
        "gemini", "claude", "azure openai", "aws bedrock", "vertex ai"
    ]
    provider_lower = (provider or "").lower()
    return any(p in provider_lower for p in genai_providers)


def _is_cloud_provider(provider: str) -> bool:
    """Check if provider is a Cloud provider."""
    cloud_providers = [
        "gcp", "aws", "azure", "google", "amazon", "microsoft", "oci", "oracle"
    ]
    provider_lower = (provider or "").lower()
    return any(p in provider_lower for p in cloud_providers)
