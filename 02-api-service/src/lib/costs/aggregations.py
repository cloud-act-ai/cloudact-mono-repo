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

def _format_usage(quantity: float, unit: str) -> str:
    """Format usage quantity with appropriate unit scaling.

    Uses binary units (GiB, TiB) to match cloud provider billing.
    """
    if not quantity or not unit:
        return ""

    unit_lower = unit.lower()

    # Binary unit constants (cloud providers use GiB, not GB)
    KiB = 1024
    MiB = 1024 ** 2
    GiB = 1024 ** 3
    TiB = 1024 ** 4

    # Byte-seconds (memory/storage usage) - check BEFORE "second" since it contains "second"
    if "byte-second" in unit_lower:
        # Convert to GiB-hours for readability (binary units to match cloud billing)
        gib_hours = quantity / (GiB * 3600)
        if gib_hours >= 1024:
            return f"{gib_hours / 1024:,.2f} TiB-hrs"
        if gib_hours >= 1:
            return f"{gib_hours:,.1f} GiB-hrs"
        return f"{gib_hours * 1024:,.1f} MiB-hrs"

    # Time units - convert to hours if seconds
    if "second" in unit_lower:
        if quantity >= 3600:
            return f"{quantity / 3600:,.1f} hrs"
        return f"{quantity:,.0f} sec"

    # Byte units - convert using binary units (GiB/MiB/KiB)
    if unit_lower in ("bytes", "byte"):
        if quantity >= TiB:
            return f"{quantity / TiB:,.2f} TiB"
        if quantity >= GiB:
            return f"{quantity / GiB:,.2f} GiB"
        if quantity >= MiB:
            return f"{quantity / MiB:,.2f} MiB"
        if quantity >= KiB:
            return f"{quantity / KiB:,.2f} KiB"
        return f"{quantity:,.0f} B"

    # Requests/calls - just format with commas
    if "request" in unit_lower or "call" in unit_lower:
        if quantity >= 1e6:
            return f"{quantity / 1e6:,.2f}M reqs"
        if quantity >= 1e3:
            return f"{quantity / 1e3:,.1f}K reqs"
        return f"{quantity:,.0f} reqs"

    # Default formatting
    if quantity >= 1e9:
        return f"{quantity / 1e9:,.2f}B {unit}"
    if quantity >= 1e6:
        return f"{quantity / 1e6:,.2f}M {unit}"
    if quantity >= 1e3:
        return f"{quantity / 1e3:,.1f}K {unit}"
    return f"{quantity:,.2f} {unit}"


def aggregate_by_service(
    df: pl.DataFrame,
    cost_column: str = "BilledCost",
    service_column: str = "ServiceName",
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by service with FOCUS 1.3 cost breakdown and usage data.

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values (default: BilledCost)
        service_column: Column name for service
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with service, billed_cost, effective_cost, savings,
        usage (formatted), usage_unit, total_cost, percentage
    """
    if df.is_empty():
        return []

    # Ensure cost columns are float
    columns_to_add = [
        pl.col(cost_column).cast(pl.Float64).alias(cost_column),
    ]

    if "EffectiveCost" in df.columns:
        columns_to_add.append(pl.col("EffectiveCost").cast(pl.Float64).alias("EffectiveCost"))
    else:
        columns_to_add.append(pl.lit(0.0).alias("EffectiveCost"))

    df = df.with_columns(columns_to_add)

    # Check for usage columns
    has_usage = "ConsumedQuantity" in df.columns and "ConsumedUnit" in df.columns

    # For usage, we need to group by service+unit first to get proper per-unit quantities,
    # then pick the primary usage (highest cost) for each service
    primary_usage_map: Dict[str, tuple] = {}  # service -> (quantity, unit)

    if has_usage:
        # Group by service and unit to get proper aggregates
        usage_df = df.with_columns(
            pl.col("ConsumedQuantity").cast(pl.Float64).alias("ConsumedQuantity")
        )
        usage_agg = (
            usage_df.lazy()
            .group_by([service_column, "ConsumedUnit"])
            .agg([
                pl.col("ConsumedQuantity").sum().alias("total_qty"),
                pl.col(cost_column).sum().alias("unit_cost"),
            ])
            .collect()
        )

        # For each service, pick the most intuitive usage metric
        # Priority: time (seconds/hours) > bytes > requests > byte-seconds
        # - Time: CPU/build hours for compute services
        # - Bytes: Data transfer/storage size (more meaningful than request counts)
        # - Requests: API call counts (less meaningful for most services)
        # - Byte-seconds: Memory-hours (confusing for users)
        def unit_priority(unit: str) -> int:
            u = unit.lower() if unit else ""
            if "second" in u and "byte" not in u:
                return 3  # Time units (most intuitive for compute)
            if u in ("bytes", "byte"):
                return 2  # Data transfer/storage size
            if "request" in u or "call" in u:
                return 1  # Request counts (less intuitive)
            return 0  # byte-seconds, etc. (least intuitive)

        for row in usage_agg.iter_rows(named=True):
            service = row[service_column] or "Unknown"
            unit = row["ConsumedUnit"] or ""
            qty = row["total_qty"] or 0
            cost = row["unit_cost"] or 0
            priority = unit_priority(unit)

            if service not in primary_usage_map:
                primary_usage_map[service] = (qty, unit, cost, priority)
            else:
                existing_priority = primary_usage_map[service][3]
                # Prefer higher priority units, or higher cost within same priority
                if priority > existing_priority or (priority == existing_priority and cost > primary_usage_map[service][2]):
                    primary_usage_map[service] = (qty, unit, cost, priority)

    # Build aggregation expressions for costs
    agg_exprs = [
        pl.col(cost_column).sum().alias("billed_cost"),
        pl.col("EffectiveCost").sum().alias("effective_cost"),
    ]

    # Aggregate with FOCUS cost fields
    result = (
        df.lazy()
        .group_by(service_column)
        .agg(agg_exprs)
        .with_columns([
            # Savings = BilledCost - EffectiveCost
            (pl.col("billed_cost") - pl.col("effective_cost")).alias("savings")
        ])
        .sort("billed_cost", descending=True)
        .collect()
    )

    total_billed = result["billed_cost"].sum()

    breakdown = []
    for row in result.iter_rows(named=True):
        billed = row["billed_cost"] or 0
        effective = row["effective_cost"] or 0
        savings = row["savings"] or 0
        service = row[service_column] or "Unknown"

        item = {
            "service": service,
            "billed_cost": round(billed, 2),
            "effective_cost": round(effective, 2),
            "savings": round(savings, 2),
            "total_cost": round(billed, 2),  # Backward compatibility
        }

        # Add formatted usage from primary usage map
        if has_usage and service in primary_usage_map:
            usage_qty, usage_unit, _, _ = primary_usage_map[service]
            if usage_qty and usage_unit:
                item["usage"] = _format_usage(usage_qty, usage_unit)
                item["usage_unit"] = usage_unit

        if include_percentage:
            item["percentage"] = calculate_percentage(billed, total_billed)
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
    level_code: Optional[str] = None,
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate costs by organizational hierarchy (5-field model).

    Uses the 5-field hierarchy model:
    - x_hierarchy_entity_id: Leaf entity ID
    - x_hierarchy_entity_name: Leaf entity display name
    - x_hierarchy_level_code: Level code (DEPT, PROJ, TEAM)
    - x_hierarchy_path: Full path from root
    - x_hierarchy_path_names: Human-readable path

    Args:
        df: Polars DataFrame with cost data
        cost_column: Column name for cost values
        level_code: Optional level code to filter by (e.g., "DEPT", "PROJ", "TEAM")
                   If None, aggregates all hierarchy entities
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with hierarchy entity, total_cost, record_count, percentage
    """
    if df.is_empty():
        return []

    # Check if hierarchy columns exist
    entity_id_col = "x_hierarchy_entity_id"
    entity_name_col = "x_hierarchy_entity_name"
    level_code_col = "x_hierarchy_level_code"

    if entity_id_col not in df.columns:
        return []

    df = df.with_columns(
        pl.col(cost_column).cast(pl.Float64).alias(cost_column)
    )

    # Filter to non-null entities
    filtered = df.lazy().filter(pl.col(entity_id_col).is_not_null())

    # Optionally filter by level code
    if level_code and level_code_col in df.columns:
        filtered = filtered.filter(pl.col(level_code_col) == level_code)

    # Group by entity ID and name
    group_cols = [entity_id_col]
    if entity_name_col in df.columns:
        group_cols.append(entity_name_col)
    if level_code_col in df.columns:
        group_cols.append(level_code_col)

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
        entity_id = row[entity_id_col]
        entity_name = row.get(entity_name_col) or entity_id
        entity_level = row.get(level_code_col)

        item = {
            "entity_id": entity_id,
            "entity_name": entity_name,
            "level_code": entity_level,
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
    - Hierarchy (filter by entity_id, level_code, path prefix)

    Uses the 5-field hierarchy model:
    - x_hierarchy_entity_id: Leaf entity ID (e.g., "TEAM-001")
    - x_hierarchy_entity_name: Leaf entity name (e.g., "Platform Team")
    - x_hierarchy_level_code: Level code (DEPT, PROJ, TEAM)
    - x_hierarchy_path: Full path from root (e.g., "/DEPT-001/PROJ-001/TEAM-001")
    - x_hierarchy_path_names: Human-readable path (e.g., "Engineering > Platform > Backend")

    This enables ONE API call for 365 days, then ALL filters are client-side.
    Data size: ~365 days × ~50 unique provider+entity combos = ~18,250 rows

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

    # Add 5-field hierarchy columns if they exist
    hierarchy_cols = []
    hierarchy_field_mapping = {
        "x_hierarchy_entity_id": "hierarchy_entity_id",
        "x_hierarchy_entity_name": "hierarchy_entity_name",
        "x_hierarchy_level_code": "hierarchy_level_code",
        "x_hierarchy_path": "hierarchy_path",
        "x_hierarchy_path_names": "hierarchy_path_names",
    }
    for db_col in hierarchy_field_mapping.keys():
        if db_col in df.columns:
            hierarchy_cols.append(db_col)

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

        # Add 5-field hierarchy fields (map x_* columns to frontend field names)
        for db_col, api_field in hierarchy_field_mapping.items():
            item[api_field] = row.get(db_col)

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
