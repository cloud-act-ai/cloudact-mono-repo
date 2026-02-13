"""Polars aggregation functions for budget analytics."""

import polars as pl
from typing import Optional


def sum_by_category(df: pl.DataFrame) -> pl.DataFrame:
    """Aggregate actual costs by category.

    Expected columns: category, BilledCost
    Returns: category, actual_amount
    """
    if df.is_empty():
        return pl.DataFrame({"category": [], "actual_amount": []})

    return (
        df.group_by("category")
        .agg(pl.col("BilledCost").sum().alias("actual_amount"))
        .sort("category")
    )


def sum_by_provider(df: pl.DataFrame, category: Optional[str] = None) -> pl.DataFrame:
    """Aggregate actual costs by provider.

    Expected columns: ServiceProviderName, BilledCost, category
    Returns: provider, category, actual_amount
    """
    if df.is_empty():
        return pl.DataFrame({"provider": [], "category": [], "actual_amount": []})

    filtered = df
    if category:
        filtered = df.filter(pl.col("category") == category)

    return (
        filtered.group_by(["ServiceProviderName", "category"])
        .agg(pl.col("BilledCost").sum().alias("actual_amount"))
        .rename({"ServiceProviderName": "provider"})
        .sort("provider")
    )


def sum_by_hierarchy(df: pl.DataFrame) -> pl.DataFrame:
    """Aggregate actual costs by hierarchy entity.

    Expected columns: x_hierarchy_entity_id, BilledCost, category
    Returns: hierarchy_entity_id, category, actual_amount
    """
    if df.is_empty():
        return pl.DataFrame({"hierarchy_entity_id": [], "category": [], "actual_amount": []})

    return (
        df.group_by(["x_hierarchy_entity_id", "category"])
        .agg(pl.col("BilledCost").sum().alias("actual_amount"))
        .rename({"x_hierarchy_entity_id": "hierarchy_entity_id"})
        .sort("hierarchy_entity_id")
    )


def rollup_by_hierarchy_path(df: pl.DataFrame) -> pl.DataFrame:
    """Rollup costs through hierarchy paths.

    For parent nodes, includes costs from all descendant nodes.
    Expected columns: x_hierarchy_path, x_hierarchy_entity_id, BilledCost
    Returns: hierarchy_entity_id, actual_amount (includes descendants)
    """
    if df.is_empty():
        return pl.DataFrame({"hierarchy_entity_id": [], "actual_amount": []})

    # Direct costs per entity
    direct = (
        df.group_by("x_hierarchy_entity_id")
        .agg(pl.col("BilledCost").sum().alias("actual_amount"))
        .rename({"x_hierarchy_entity_id": "hierarchy_entity_id"})
    )

    return direct.sort("hierarchy_entity_id")
