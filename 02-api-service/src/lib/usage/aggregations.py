"""
Usage Aggregations

Polars-based aggregation functions for GenAI usage data.
Provides consistent grouping and summarization for tokens, requests, and latency.
"""

import polars as pl
from typing import List, Dict, Any, Optional

from src.lib.usage.calculations import (
    calculate_tokens_per_request,
    calculate_success_rate,
)
from src.lib.costs.calculations import calculate_percentage


# ==============================================================================
# Token Aggregations
# ==============================================================================

def aggregate_tokens_by_provider(
    df: pl.DataFrame,
    input_col: str = "input_tokens",
    output_col: str = "output_tokens",
    provider_col: str = "provider",
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate token usage by provider.

    Args:
        df: Polars DataFrame with usage data
        input_col: Column name for input tokens
        output_col: Column name for output tokens
        provider_col: Column name for provider
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with provider, input_tokens, output_tokens, total_tokens, percentage
    """
    if df.is_empty():
        return []

    # Ensure numeric columns
    df = df.with_columns([
        pl.col(input_col).cast(pl.Int64).fill_null(0).alias(input_col),
        pl.col(output_col).cast(pl.Int64).fill_null(0).alias(output_col),
    ])

    result = (
        df.lazy()
        .group_by(provider_col)
        .agg([
            pl.col(input_col).sum().alias("input_tokens"),
            pl.col(output_col).sum().alias("output_tokens"),
            pl.count().alias("record_count"),
        ])
        .with_columns(
            (pl.col("input_tokens") + pl.col("output_tokens")).alias("total_tokens")
        )
        .sort("total_tokens", descending=True)
        .collect()
    )

    total_tokens = result["total_tokens"].sum()

    breakdown = []
    for row in result.iter_rows(named=True):
        item = {
            "provider": row[provider_col] or "Unknown",
            "input_tokens": row["input_tokens"],
            "output_tokens": row["output_tokens"],
            "total_tokens": row["total_tokens"],
            "record_count": row["record_count"],
        }
        if include_percentage:
            item["percentage"] = calculate_percentage(row["total_tokens"], total_tokens)
        breakdown.append(item)

    return breakdown


def aggregate_tokens_by_model(
    df: pl.DataFrame,
    input_col: str = "input_tokens",
    output_col: str = "output_tokens",
    model_col: str = "model",
    provider_col: str = "provider",
    include_percentage: bool = True,
) -> List[Dict[str, Any]]:
    """
    Aggregate token usage by model.

    Args:
        df: Polars DataFrame with usage data
        input_col: Column name for input tokens
        output_col: Column name for output tokens
        model_col: Column name for model
        provider_col: Column name for provider
        include_percentage: Whether to calculate percentage of total

    Returns:
        List of dicts with model, provider, tokens, percentage
    """
    if df.is_empty():
        return []

    df = df.with_columns([
        pl.col(input_col).cast(pl.Int64).fill_null(0).alias(input_col),
        pl.col(output_col).cast(pl.Int64).fill_null(0).alias(output_col),
    ])

    result = (
        df.lazy()
        .group_by([model_col, provider_col])
        .agg([
            pl.col(input_col).sum().alias("input_tokens"),
            pl.col(output_col).sum().alias("output_tokens"),
            pl.count().alias("record_count"),
        ])
        .with_columns(
            (pl.col("input_tokens") + pl.col("output_tokens")).alias("total_tokens")
        )
        .sort("total_tokens", descending=True)
        .collect()
    )

    total_tokens = result["total_tokens"].sum()

    breakdown = []
    for row in result.iter_rows(named=True):
        item = {
            "model": row[model_col] or "Unknown",
            "provider": row[provider_col] or "Unknown",
            "input_tokens": row["input_tokens"],
            "output_tokens": row["output_tokens"],
            "total_tokens": row["total_tokens"],
            "record_count": row["record_count"],
        }
        if include_percentage:
            item["percentage"] = calculate_percentage(row["total_tokens"], total_tokens)
        breakdown.append(item)

    return breakdown


# ==============================================================================
# Request Aggregations
# ==============================================================================

def aggregate_requests_by_date(
    df: pl.DataFrame,
    request_col: str = "request_count",
    date_col: str = "usage_date",
    success_col: Optional[str] = "successful_requests",
    failed_col: Optional[str] = "failed_requests",
) -> List[Dict[str, Any]]:
    """
    Aggregate requests by date.

    Args:
        df: Polars DataFrame with usage data
        request_col: Column name for request count
        date_col: Column name for date
        success_col: Column name for successful requests
        failed_col: Column name for failed requests

    Returns:
        List of dicts with date, requests, success_rate
    """
    if df.is_empty():
        return []

    agg_cols = [
        pl.col(request_col).cast(pl.Int64).fill_null(0).sum().alias("total_requests"),
    ]

    if success_col and success_col in df.columns:
        agg_cols.append(
            pl.col(success_col).cast(pl.Int64).fill_null(0).sum().alias("successful")
        )
    if failed_col and failed_col in df.columns:
        agg_cols.append(
            pl.col(failed_col).cast(pl.Int64).fill_null(0).sum().alias("failed")
        )

    result = (
        df.lazy()
        .with_columns(pl.col(date_col).cast(pl.Date).alias("_date"))
        .group_by("_date")
        .agg(agg_cols)
        .sort("_date")
        .collect()
    )

    breakdown = []
    for row in result.iter_rows(named=True):
        date_str = row["_date"].strftime("%Y-%m-%d") if row["_date"] else "Unknown"
        total = row["total_requests"]
        successful = row.get("successful", total)

        item = {
            "date": date_str,
            "total_requests": total,
            "successful_requests": successful,
            "failed_requests": row.get("failed", 0),
            "success_rate": calculate_success_rate(successful, total),
        }
        breakdown.append(item)

    return breakdown


# ==============================================================================
# Combined Usage Aggregations
# ==============================================================================

def aggregate_usage_by_date(
    df: pl.DataFrame,
    date_col: str = "usage_date",
    input_col: str = "input_tokens",
    output_col: str = "output_tokens",
    request_col: str = "request_count",
    cost_col: Optional[str] = "total_cost",
) -> List[Dict[str, Any]]:
    """
    Aggregate all usage metrics by date.

    Args:
        df: Polars DataFrame with usage data
        date_col: Column name for date
        input_col: Column name for input tokens
        output_col: Column name for output tokens
        request_col: Column name for request count
        cost_col: Column name for cost

    Returns:
        List of dicts with date, tokens, requests, cost
    """
    if df.is_empty():
        return []

    agg_cols = [
        pl.col(input_col).cast(pl.Int64).fill_null(0).sum().alias("input_tokens"),
        pl.col(output_col).cast(pl.Int64).fill_null(0).sum().alias("output_tokens"),
        pl.col(request_col).cast(pl.Int64).fill_null(0).sum().alias("requests"),
    ]

    if cost_col and cost_col in df.columns:
        agg_cols.append(
            pl.col(cost_col).cast(pl.Float64).fill_null(0).sum().alias("cost")
        )

    result = (
        df.lazy()
        .with_columns(pl.col(date_col).cast(pl.Date).alias("_date"))
        .group_by("_date")
        .agg(agg_cols)
        .with_columns(
            (pl.col("input_tokens") + pl.col("output_tokens")).alias("total_tokens")
        )
        .sort("_date")
        .collect()
    )

    breakdown = []
    for row in result.iter_rows(named=True):
        date_str = row["_date"].strftime("%Y-%m-%d") if row["_date"] else "Unknown"

        item = {
            "date": date_str,
            "input_tokens": row["input_tokens"],
            "output_tokens": row["output_tokens"],
            "total_tokens": row["total_tokens"],
            "requests": row["requests"],
            "avg_tokens_per_request": calculate_tokens_per_request(
                row["total_tokens"], row["requests"]
            ),
        }
        if "cost" in row:
            item["cost"] = round(row["cost"], 2)

        breakdown.append(item)

    return breakdown


# ==============================================================================
# Latency Aggregations
# ==============================================================================

def aggregate_latency_by_provider(
    df: pl.DataFrame,
    latency_col: str = "avg_latency_ms",
    ttft_col: str = "avg_ttft_ms",
    provider_col: str = "provider",
) -> List[Dict[str, Any]]:
    """
    Aggregate latency metrics by provider.

    Args:
        df: Polars DataFrame with usage data
        latency_col: Column name for latency
        ttft_col: Column name for time to first token
        provider_col: Column name for provider

    Returns:
        List of dicts with provider, avg_latency, avg_ttft
    """
    if df.is_empty():
        return []

    agg_cols = [pl.count().alias("record_count")]

    if latency_col in df.columns:
        agg_cols.append(
            pl.col(latency_col).cast(pl.Float64).mean().alias("avg_latency_ms")
        )
    if ttft_col in df.columns:
        agg_cols.append(
            pl.col(ttft_col).cast(pl.Float64).mean().alias("avg_ttft_ms")
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
        item = {
            "provider": row[provider_col] or "Unknown",
            "record_count": row["record_count"],
            "avg_latency_ms": round(row.get("avg_latency_ms", 0) or 0, 2),
            "avg_ttft_ms": round(row.get("avg_ttft_ms", 0) or 0, 2),
        }
        breakdown.append(item)

    return breakdown
