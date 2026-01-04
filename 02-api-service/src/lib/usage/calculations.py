"""
Usage Calculations

Centralized calculation functions for GenAI usage metrics.
Handles tokens, requests, latency, and cost calculations.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from datetime import date

from src.lib.costs.calculations import get_date_info


# ==============================================================================
# Data Models
# ==============================================================================

@dataclass
class UsageSummary:
    """Summary of GenAI usage metrics."""
    total_input_tokens: int
    total_output_tokens: int
    total_cached_tokens: int
    total_tokens: int
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    avg_latency_ms: float
    avg_ttft_ms: float
    total_cost: float
    currency: str
    provider_count: int
    model_count: int
    date_range_start: Optional[str]
    date_range_end: Optional[str]


# ==============================================================================
# Token Calculations
# ==============================================================================

def calculate_total_tokens(
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0
) -> int:
    """
    Calculate total tokens from input, output, and cached.

    Args:
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        cached_tokens: Number of cached tokens

    Returns:
        Total token count
    """
    return input_tokens + output_tokens + cached_tokens


def calculate_tokens_per_request(
    total_tokens: int,
    request_count: int
) -> float:
    """
    Calculate average tokens per request.

    Args:
        total_tokens: Total token count
        request_count: Number of requests

    Returns:
        Average tokens per request
    """
    if request_count <= 0:
        return 0.0
    return round(total_tokens / request_count, 2)


def calculate_token_ratio(
    input_tokens: int,
    output_tokens: int
) -> float:
    """
    Calculate input to output token ratio.

    Args:
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens

    Returns:
        Input/output ratio
    """
    if output_tokens <= 0:
        return 0.0
    return round(input_tokens / output_tokens, 2)


def calculate_cache_hit_rate(
    cached_tokens: int,
    input_tokens: int
) -> float:
    """
    Calculate cache hit rate percentage.

    Args:
        cached_tokens: Number of cached tokens
        input_tokens: Total input tokens

    Returns:
        Cache hit rate (0-100)
    """
    if input_tokens <= 0:
        return 0.0
    return round((cached_tokens / input_tokens) * 100, 2)


# ==============================================================================
# Rate Calculations
# ==============================================================================

def calculate_daily_token_rate(
    mtd_tokens: int,
    days_elapsed: Optional[int] = None
) -> float:
    """
    Calculate daily token rate from MTD tokens.

    Args:
        mtd_tokens: Month-to-date total tokens
        days_elapsed: Days elapsed in month

    Returns:
        Daily token rate
    """
    if days_elapsed is None:
        days_elapsed = get_date_info().days_elapsed

    if days_elapsed <= 0:
        return 0.0

    return mtd_tokens / days_elapsed


def calculate_monthly_token_forecast(
    daily_rate: float,
    days_in_month: Optional[int] = None
) -> int:
    """
    Calculate monthly token forecast from daily rate.

    Args:
        daily_rate: Daily token rate
        days_in_month: Total days in month

    Returns:
        Monthly token forecast
    """
    if days_in_month is None:
        days_in_month = get_date_info().days_in_month

    return round(daily_rate * days_in_month)


def calculate_annual_token_forecast(monthly_forecast: int) -> int:
    """
    Calculate annual token forecast from monthly forecast.

    Args:
        monthly_forecast: Monthly token forecast

    Returns:
        Annual token forecast
    """
    return monthly_forecast * 12


def calculate_token_forecasts(mtd_tokens: int) -> Dict[str, Any]:
    """
    Calculate all token forecasts from MTD tokens.

    Args:
        mtd_tokens: Month-to-date total tokens

    Returns:
        Dict with daily_rate, monthly_forecast, annual_forecast
    """
    date_info = get_date_info()
    daily_rate = calculate_daily_token_rate(mtd_tokens, date_info.days_elapsed)
    monthly_forecast = calculate_monthly_token_forecast(daily_rate, date_info.days_in_month)
    annual_forecast = calculate_annual_token_forecast(monthly_forecast)

    return {
        "daily_rate": round(daily_rate),
        "monthly_forecast": monthly_forecast,
        "annual_forecast": annual_forecast,
    }


# ==============================================================================
# Request Calculations
# ==============================================================================

def calculate_success_rate(
    successful: int,
    total: int
) -> float:
    """
    Calculate request success rate percentage.

    Args:
        successful: Number of successful requests
        total: Total number of requests

    Returns:
        Success rate (0-100)
    """
    if total <= 0:
        return 100.0
    return round((successful / total) * 100, 2)


def calculate_failure_rate(
    failed: int,
    total: int
) -> float:
    """
    Calculate request failure rate percentage.

    Args:
        failed: Number of failed requests
        total: Total number of requests

    Returns:
        Failure rate (0-100)
    """
    if total <= 0:
        return 0.0
    return round((failed / total) * 100, 2)


def calculate_requests_per_day(
    total_requests: int,
    days: int
) -> float:
    """
    Calculate average requests per day.

    Args:
        total_requests: Total number of requests
        days: Number of days

    Returns:
        Average requests per day
    """
    if days <= 0:
        return 0.0
    return round(total_requests / days, 2)


# ==============================================================================
# Latency Calculations
# ==============================================================================

def calculate_average_latency(latencies: List[float]) -> float:
    """
    Calculate average latency from a list of values.

    Args:
        latencies: List of latency values in ms

    Returns:
        Average latency in ms
    """
    if not latencies:
        return 0.0
    return round(sum(latencies) / len(latencies), 2)


def calculate_p95_latency(latencies: List[float]) -> float:
    """
    Calculate 95th percentile latency.

    Args:
        latencies: List of latency values in ms

    Returns:
        P95 latency in ms
    """
    if not latencies:
        return 0.0

    sorted_latencies = sorted(latencies)
    # Fix: Use (n-1) * percentile for correct 0-based index calculation
    index = int((len(sorted_latencies) - 1) * 0.95)
    return round(sorted_latencies[index], 2)


def calculate_p99_latency(latencies: List[float]) -> float:
    """
    Calculate 99th percentile latency.

    Args:
        latencies: List of latency values in ms

    Returns:
        P99 latency in ms
    """
    if not latencies:
        return 0.0

    sorted_latencies = sorted(latencies)
    # Fix: Use (n-1) * percentile for correct 0-based index calculation
    index = int((len(sorted_latencies) - 1) * 0.99)
    return round(sorted_latencies[index], 2)


# ==============================================================================
# Cost Calculations
# ==============================================================================

def calculate_cost_per_token(
    total_cost: float,
    total_tokens: int
) -> float:
    """
    Calculate cost per token.

    Args:
        total_cost: Total cost
        total_tokens: Total token count

    Returns:
        Cost per token
    """
    if total_tokens <= 0:
        return 0.0
    return total_cost / total_tokens


def calculate_cost_per_1m_tokens(
    total_cost: float,
    total_tokens: int
) -> float:
    """
    Calculate cost per 1 million tokens.

    Args:
        total_cost: Total cost
        total_tokens: Total token count

    Returns:
        Cost per 1M tokens
    """
    if total_tokens <= 0:
        return 0.0
    return round((total_cost / total_tokens) * 1_000_000, 4)


def estimate_token_cost(
    input_tokens: int,
    output_tokens: int,
    input_price_per_1m: float,
    output_price_per_1m: float,
    cached_tokens: int = 0,
    cached_price_per_1m: float = 0.0
) -> float:
    """
    Estimate cost from token counts and pricing.

    Args:
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        input_price_per_1m: Price per 1M input tokens
        output_price_per_1m: Price per 1M output tokens
        cached_tokens: Number of cached tokens
        cached_price_per_1m: Price per 1M cached tokens

    Returns:
        Estimated cost
    """
    input_cost = (input_tokens / 1_000_000) * input_price_per_1m
    output_cost = (output_tokens / 1_000_000) * output_price_per_1m
    cached_cost = (cached_tokens / 1_000_000) * cached_price_per_1m

    return round(input_cost + output_cost + cached_cost, 6)


# ==============================================================================
# Summary Calculation
# ==============================================================================

def calculate_usage_summary(
    records: List[Dict[str, Any]],
    currency: str = "USD"
) -> UsageSummary:
    """
    Calculate usage summary from records.

    Args:
        records: List of usage records
        currency: Currency code

    Returns:
        UsageSummary dataclass
    """
    if not records:
        return UsageSummary(
            total_input_tokens=0,
            total_output_tokens=0,
            total_cached_tokens=0,
            total_tokens=0,
            total_requests=0,
            successful_requests=0,
            failed_requests=0,
            success_rate=100.0,
            avg_latency_ms=0.0,
            avg_ttft_ms=0.0,
            total_cost=0.0,
            currency=currency,
            provider_count=0,
            model_count=0,
            date_range_start=None,
            date_range_end=None,
        )

    # Aggregate totals
    total_input = sum(r.get("input_tokens", 0) or 0 for r in records)
    total_output = sum(r.get("output_tokens", 0) or 0 for r in records)
    total_cached = sum(r.get("cached_tokens", 0) or 0 for r in records)
    total_requests = sum(r.get("request_count", 0) or 0 for r in records)
    successful = sum(r.get("successful_requests", r.get("request_count", 0)) or 0 for r in records)
    failed = sum(r.get("failed_requests", 0) or 0 for r in records)
    total_cost = sum(r.get("total_cost", 0) or 0 for r in records)

    # Calculate latencies
    latencies = [r.get("avg_latency_ms") for r in records if r.get("avg_latency_ms")]
    ttfts = [r.get("avg_ttft_ms") for r in records if r.get("avg_ttft_ms")]

    # Get unique providers and models
    providers = set(r.get("provider", "").lower() for r in records if r.get("provider"))
    models = set(r.get("model", "").lower() for r in records if r.get("model"))

    # Get date range
    dates = sorted([r.get("usage_date") for r in records if r.get("usage_date")])

    return UsageSummary(
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_cached_tokens=total_cached,
        total_tokens=total_input + total_output + total_cached,
        total_requests=total_requests,
        successful_requests=successful,
        failed_requests=failed,
        success_rate=calculate_success_rate(successful, total_requests),
        avg_latency_ms=calculate_average_latency(latencies),
        avg_ttft_ms=calculate_average_latency(ttfts),
        total_cost=round(total_cost, 2),
        currency=currency,
        provider_count=len(providers),
        model_count=len(models),
        date_range_start=dates[0] if dates else None,
        date_range_end=dates[-1] if dates else None,
    )
