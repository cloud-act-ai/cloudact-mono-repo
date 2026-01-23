"""
Cost Filters

Polars-based filtering functions for cost data.
Provides consistent filtering across all endpoints.
"""

import polars as pl
from dataclasses import dataclass
from datetime import date
from typing import List, Optional


# ==============================================================================
# Filter Parameters
# ==============================================================================

@dataclass
class CostFilterParams:
    """Parameters for filtering cost data.

    Hierarchy Filtering (5-field model):
        - x_hierarchy_entity_id: Filter by specific entity ID
        - x_hierarchy_entity_name: Filter by entity name
        - x_hierarchy_level_code: Filter by level (DEPT, PROJ, TEAM, etc.)
        - x_hierarchy_path: Filter by path prefix for hierarchical rollup queries
        - x_hierarchy_path_names: Filter by path names

    Path-based filtering uses LIKE/starts_with for hierarchical queries:
        - "/ROOT" matches all
        - "/ROOT/DEPT-001" matches department and all children
        - "/ROOT/DEPT-001/PROJ-001" matches project and all children
    """
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    providers: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    services: Optional[List[str]] = None
    min_cost: Optional[float] = None
    max_cost: Optional[float] = None
    # 5-field hierarchy model
    hierarchy_entity_id: Optional[str] = None      # Filter by entity ID
    hierarchy_entity_name: Optional[str] = None    # Filter by entity name
    hierarchy_level_code: Optional[str] = None     # Filter by level (DEPT, PROJ, TEAM)
    hierarchy_path: Optional[str] = None           # Filter by path prefix for rollup queries

    def has_filters(self) -> bool:
        """Check if any filters are set."""
        return any([
            self.start_date,
            self.end_date,
            self.providers,
            self.categories,
            self.services,
            self.min_cost is not None,
            self.max_cost is not None,
            self.hierarchy_entity_id,
            self.hierarchy_entity_name,
            self.hierarchy_level_code,
            self.hierarchy_path,
        ])


# ==============================================================================
# Date Filters
# ==============================================================================

def filter_date_range(
    df: pl.DataFrame,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    date_column: str = "ChargePeriodStart",
) -> pl.DataFrame:
    """
    Filter DataFrame by date range.

    Args:
        df: Polars DataFrame with cost data
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        date_column: Column name for date

    Returns:
        Filtered DataFrame
    """
    if df.is_empty():
        return df

    # Check if date column exists
    if date_column not in df.columns:
        return df

    # Ensure date column is proper type (handle nulls safely)
    if df[date_column].dtype not in (pl.Date, pl.Datetime):
        try:
            df = df.with_columns(
                pl.col(date_column).cast(pl.Date).alias(date_column)
            )
        except Exception:
            # If cast fails, return original df
            return df

    if start_date:
        df = df.filter(pl.col(date_column) >= start_date)

    if end_date:
        df = df.filter(pl.col(date_column) <= end_date)

    return df


def filter_current_month(
    df: pl.DataFrame,
    date_column: str = "ChargePeriodStart",
) -> pl.DataFrame:
    """
    Filter DataFrame to current month only.

    Args:
        df: Polars DataFrame with cost data
        date_column: Column name for date

    Returns:
        Filtered DataFrame for current month
    """
    from src.lib.costs.calculations import get_date_info

    date_info = get_date_info()
    return filter_date_range(
        df,
        start_date=date_info.month_start,
        end_date=date_info.today,
        date_column=date_column,
    )


def filter_current_year(
    df: pl.DataFrame,
    date_column: str = "ChargePeriodStart",
) -> pl.DataFrame:
    """
    Filter DataFrame to current year only.

    Args:
        df: Polars DataFrame with cost data
        date_column: Column name for date

    Returns:
        Filtered DataFrame for current year
    """
    from src.lib.costs.calculations import get_date_info

    date_info = get_date_info()
    return filter_date_range(
        df,
        start_date=date_info.year_start,
        end_date=date_info.today,
        date_column=date_column,
    )


# ==============================================================================
# Provider Filters
# ==============================================================================

def filter_providers(
    df: pl.DataFrame,
    providers: List[str],
    provider_column: str = "ServiceProviderName",
    case_insensitive: bool = True,
) -> pl.DataFrame:
    """
    Filter DataFrame by providers.

    Args:
        df: Polars DataFrame with cost data
        providers: List of provider names to include
        provider_column: Column name for provider
        case_insensitive: Whether to ignore case

    Returns:
        Filtered DataFrame
    """
    if df.is_empty() or not providers:
        return df

    if case_insensitive:
        providers_lower = [p.lower() for p in providers]
        df = df.filter(
            pl.col(provider_column).str.to_lowercase().is_in(providers_lower)
        )
    else:
        df = df.filter(pl.col(provider_column).is_in(providers))

    return df


# ==============================================================================
# Category Filters
# ==============================================================================

def filter_categories(
    df: pl.DataFrame,
    categories: List[str],
    category_column: str = "ServiceCategory",
    case_insensitive: bool = True,
) -> pl.DataFrame:
    """
    Filter DataFrame by service categories.

    Args:
        df: Polars DataFrame with cost data
        categories: List of categories to include (Cloud, SaaS, LLM)
        category_column: Column name for category
        case_insensitive: Whether to ignore case

    Returns:
        Filtered DataFrame
    """
    if df.is_empty() or not categories:
        return df

    if case_insensitive:
        categories_lower = [c.lower() for c in categories]
        df = df.filter(
            pl.col(category_column).str.to_lowercase().is_in(categories_lower)
        )
    else:
        df = df.filter(pl.col(category_column).is_in(categories))

    return df


# ==============================================================================
# Service Filters
# ==============================================================================

def filter_services(
    df: pl.DataFrame,
    services: List[str],
    service_column: str = "ServiceName",
    case_insensitive: bool = True,
) -> pl.DataFrame:
    """
    Filter DataFrame by services.

    Args:
        df: Polars DataFrame with cost data
        services: List of service names to include
        service_column: Column name for service
        case_insensitive: Whether to ignore case

    Returns:
        Filtered DataFrame
    """
    if df.is_empty() or not services:
        return df

    if case_insensitive:
        services_lower = [s.lower() for s in services]
        df = df.filter(
            pl.col(service_column).str.to_lowercase().is_in(services_lower)
        )
    else:
        df = df.filter(pl.col(service_column).is_in(services))

    return df


# ==============================================================================
# Hierarchy Filters (5-field model)
# ==============================================================================

def filter_hierarchy(
    df: pl.DataFrame,
    entity_id: Optional[str] = None,
    entity_name: Optional[str] = None,
    level_code: Optional[str] = None,
    path_prefix: Optional[str] = None,
) -> pl.DataFrame:
    """
    Filter DataFrame by organizational hierarchy using the 5-field model.

    The 5-field hierarchy model:
        - x_hierarchy_entity_id: Unique entity identifier
        - x_hierarchy_entity_name: Human-readable entity name
        - x_hierarchy_level_code: Level code (DEPT, PROJ, TEAM, etc.)
        - x_hierarchy_path: Full path from root (/ROOT/DEPT-001/PROJ-001)
        - x_hierarchy_path_names: Human-readable path (Root/Engineering/Platform)

    Args:
        df: Polars DataFrame with cost data
        entity_id: Filter by specific entity ID (exact match)
        entity_name: Filter by entity name (exact match)
        level_code: Filter by level code (DEPT, PROJ, TEAM, etc.)
        path_prefix: Filter by path prefix for hierarchical rollup queries
                     Examples:
                       - "/ROOT" matches all entities
                       - "/ROOT/DEPT-001" matches department and all children
                       - "/ROOT/DEPT-001/PROJ-001" matches project and children

    Returns:
        Filtered DataFrame
    """
    if df.is_empty():
        return df

    # Filter by entity ID (exact match)
    if entity_id and "x_hierarchy_entity_id" in df.columns:
        df = df.filter(pl.col("x_hierarchy_entity_id") == entity_id)

    # Filter by entity name (exact match)
    if entity_name and "x_hierarchy_entity_name" in df.columns:
        df = df.filter(pl.col("x_hierarchy_entity_name") == entity_name)

    # Filter by level code (exact match)
    if level_code and "x_hierarchy_level_code" in df.columns:
        df = df.filter(pl.col("x_hierarchy_level_code") == level_code)

    # Path prefix filter for hierarchical rollup queries
    # This is the primary way to filter by hierarchy - finds entity and all children
    if path_prefix and "x_hierarchy_path" in df.columns:
        df = df.filter(pl.col("x_hierarchy_path").str.starts_with(path_prefix))

    return df


# ==============================================================================
# Cost Amount Filters
# ==============================================================================

def filter_cost_range(
    df: pl.DataFrame,
    min_cost: Optional[float] = None,
    max_cost: Optional[float] = None,
    cost_column: str = "BilledCost",
) -> pl.DataFrame:
    """
    Filter DataFrame by cost range.

    Args:
        df: Polars DataFrame with cost data
        min_cost: Minimum cost (inclusive)
        max_cost: Maximum cost (inclusive)
        cost_column: Column name for cost

    Returns:
        Filtered DataFrame
    """
    if df.is_empty():
        return df

    # Ensure cost column is numeric
    df = df.with_columns(
        pl.col(cost_column).cast(pl.Float64).alias(cost_column)
    )

    if min_cost is not None:
        df = df.filter(pl.col(cost_column) >= min_cost)

    if max_cost is not None:
        df = df.filter(pl.col(cost_column) <= max_cost)

    return df


# ==============================================================================
# Combined Filter
# ==============================================================================

def apply_cost_filters(
    df: pl.DataFrame,
    params: CostFilterParams,
    date_column: str = "ChargePeriodStart",
    provider_column: str = "ServiceProviderName",
    category_column: str = "ServiceCategory",
    service_column: str = "ServiceName",
    cost_column: str = "BilledCost",
) -> pl.DataFrame:
    """
    Apply all filters from CostFilterParams.

    Args:
        df: Polars DataFrame with cost data
        params: Filter parameters
        date_column: Column name for date
        provider_column: Column name for provider
        category_column: Column name for category
        service_column: Column name for service
        cost_column: Column name for cost

    Returns:
        Filtered DataFrame
    """
    if df.is_empty() or not params.has_filters():
        return df

    # Apply date range filter
    if params.start_date or params.end_date:
        df = filter_date_range(
            df, params.start_date, params.end_date, date_column
        )

    # Apply provider filter
    if params.providers:
        df = filter_providers(df, params.providers, provider_column)

    # Apply category filter
    if params.categories:
        df = filter_categories(df, params.categories, category_column)

    # Apply service filter
    if params.services:
        df = filter_services(df, params.services, service_column)

    # Apply cost range filter
    if params.min_cost is not None or params.max_cost is not None:
        df = filter_cost_range(df, params.min_cost, params.max_cost, cost_column)

    # Apply hierarchy filter (5-field model)
    if any([params.hierarchy_entity_id, params.hierarchy_entity_name,
            params.hierarchy_level_code, params.hierarchy_path]):
        df = filter_hierarchy(
            df,
            entity_id=params.hierarchy_entity_id,
            entity_name=params.hierarchy_entity_name,
            level_code=params.hierarchy_level_code,
            path_prefix=params.hierarchy_path,
        )

    return df
