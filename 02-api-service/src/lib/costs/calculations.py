"""
Cost Calculations

Centralized calculation functions for cost metrics.
Eliminates hardcoded calculations from services and routers.
"""

from dataclasses import dataclass
from datetime import datetime, date
from typing import Optional, Dict, Any
from calendar import monthrange
import time
import threading

# ==============================================================================
# Date Info (Cached)
# ==============================================================================

@dataclass
class DateInfo:
    """Cached date information for consistent calculations."""
    now: datetime
    today: date
    days_in_month: int
    days_elapsed: int
    days_remaining: int
    month_start: date
    month_end: date
    year_start: date
    quarter_start: date
    year: int
    month: int
    quarter: int


_cached_date_info: Optional[DateInfo] = None
_cached_date_info_timestamp: float = 0
_DATE_INFO_CACHE_TTL = 60.0  # 1 minute
_date_info_lock = threading.Lock()  # Thread-safety lock for date info cache


def get_date_info() -> DateInfo:
    """
    Get cached date info for consistent calculations.

    Thread-safe implementation using lock.

    Returns:
        DateInfo with current date metrics
    """
    global _cached_date_info, _cached_date_info_timestamp

    now = time.time()

    # Quick check without lock (safe for reads of immutable data)
    cached = _cached_date_info
    cached_ts = _cached_date_info_timestamp
    if cached and now - cached_ts < _DATE_INFO_CACHE_TTL:
        return cached

    # Need to update cache - acquire lock
    with _date_info_lock:
        # Double-check after acquiring lock (another thread may have updated)
        now = time.time()
        if _cached_date_info and now - _cached_date_info_timestamp < _DATE_INFO_CACHE_TTL:
            return _cached_date_info

        dt = datetime.now()
        today = dt.date()
        year = dt.year
        month = dt.month
        quarter = (month - 1) // 3 + 1

        days_in_month = monthrange(year, month)[1]
        days_elapsed = max(1, today.day)
        days_remaining = days_in_month - days_elapsed

        month_start = date(year, month, 1)
        month_end = date(year, month, days_in_month)
        year_start = date(year, 1, 1)
        quarter_start = date(year, (quarter - 1) * 3 + 1, 1)

        _cached_date_info = DateInfo(
            now=dt,
            today=today,
            days_in_month=days_in_month,
            days_elapsed=days_elapsed,
            days_remaining=days_remaining,
            month_start=month_start,
            month_end=month_end,
            year_start=year_start,
            quarter_start=quarter_start,
            year=year,
            month=month,
            quarter=quarter,
        )
        _cached_date_info_timestamp = now

        return _cached_date_info


def is_in_current_month(check_date: date) -> bool:
    """Check if a date is in the current month."""
    date_info = get_date_info()
    return check_date.year == date_info.year and check_date.month == date_info.month


# ==============================================================================
# Rate Calculations
# ==============================================================================

def calculate_daily_rate(
    mtd_cost: float,
    days_elapsed: Optional[int] = None
) -> float:
    """
    Calculate daily cost rate from MTD cost.

    Args:
        mtd_cost: Month-to-date total cost
        days_elapsed: Days elapsed in month (uses current if None)

    Returns:
        Daily cost rate
    """
    if days_elapsed is None:
        days_elapsed = get_date_info().days_elapsed

    if days_elapsed <= 0:
        return 0.0

    return mtd_cost / days_elapsed


def calculate_monthly_forecast(
    daily_rate: float,
    days_in_month: Optional[int] = None
) -> float:
    """
    Calculate monthly forecast from daily rate.

    Args:
        daily_rate: Daily cost rate
        days_in_month: Total days in month (uses current if None)

    Returns:
        Monthly cost forecast
    """
    if days_in_month is None:
        days_in_month = get_date_info().days_in_month

    return round(daily_rate * days_in_month, 2)


def calculate_annual_forecast(monthly_forecast: float) -> float:
    """
    Calculate annual forecast from monthly forecast.

    Args:
        monthly_forecast: Monthly cost forecast

    Returns:
        Annual cost forecast
    """
    return round(monthly_forecast * 12, 2)


def calculate_forecasts(mtd_cost: float) -> Dict[str, float]:
    """
    Calculate all forecasts from MTD cost.

    Args:
        mtd_cost: Month-to-date total cost

    Returns:
        Dict with daily_rate, monthly_forecast, annual_forecast
    """
    date_info = get_date_info()
    daily_rate = calculate_daily_rate(mtd_cost, date_info.days_elapsed)
    monthly_forecast = calculate_monthly_forecast(daily_rate, date_info.days_in_month)
    annual_forecast = calculate_annual_forecast(monthly_forecast)

    return {
        "daily_rate": round(daily_rate, 2),
        "monthly_forecast": monthly_forecast,
        "annual_forecast": annual_forecast,
    }


# ==============================================================================
# Period Calculations
# ==============================================================================

def calculate_mtd_cost(
    total_cost: float,
    cost_date: date,
    days_elapsed: Optional[int] = None
) -> float:
    """
    Calculate month-to-date cost.

    If cost_date is in current month, uses the cost directly.
    Otherwise prorates based on days.

    Args:
        total_cost: Total cost for the period
        cost_date: Date of the cost record
        days_elapsed: Days elapsed in month

    Returns:
        MTD cost value
    """
    if is_in_current_month(cost_date):
        return total_cost

    # For historical months, return full month cost
    return total_cost


def calculate_ytd_cost(
    monthly_costs: Dict[int, float],
    year: Optional[int] = None
) -> float:
    """
    Calculate year-to-date cost from monthly costs.

    Args:
        monthly_costs: Dict of month number (1-12) to cost
        year: Year to calculate for (uses current if None)

    Returns:
        YTD cost total
    """
    if year is None:
        year = get_date_info().year

    date_info = get_date_info()
    current_month = date_info.month if year == date_info.year else 12

    ytd = sum(
        cost for month, cost in monthly_costs.items()
        if 1 <= month <= current_month
    )

    return round(ytd, 2)


def calculate_qtd_cost(
    monthly_costs: Dict[int, float],
    quarter: Optional[int] = None,
    year: Optional[int] = None
) -> float:
    """
    Calculate quarter-to-date cost.

    Args:
        monthly_costs: Dict of month number (1-12) to cost
        quarter: Quarter (1-4) to calculate for
        year: Year to calculate for

    Returns:
        QTD cost total
    """
    date_info = get_date_info()

    if quarter is None:
        quarter = date_info.quarter
    if year is None:
        year = date_info.year

    quarter_start_month = (quarter - 1) * 3 + 1
    quarter_end_month = quarter * 3

    # If current quarter, only include up to current month
    if year == date_info.year and quarter == date_info.quarter:
        quarter_end_month = date_info.month

    qtd = sum(
        cost for month, cost in monthly_costs.items()
        if quarter_start_month <= month <= quarter_end_month
    )

    return round(qtd, 2)


# ==============================================================================
# Percentage Calculations
# ==============================================================================

def calculate_percentage(value: float, total: float) -> float:
    """
    Calculate percentage of total.

    Args:
        value: Part value
        total: Total value

    Returns:
        Percentage (0-100)
    """
    if total <= 0:
        return 0.0
    return round((value / total) * 100, 2)


def calculate_percentage_change(
    current: float,
    previous: float
) -> float:
    """
    Calculate percentage change between two values.

    Args:
        current: Current period value
        previous: Previous period value

    Returns:
        Percentage change (can be negative)
    """
    if previous == 0:
        return 100.0 if current > 0 else 0.0

    return round(((current - previous) / previous) * 100, 2)


# ==============================================================================
# Cost-Specific Calculations
# ==============================================================================

def calculate_effective_cost(
    billed_cost: float,
    discount_rate: float = 0.0,
    credit_amount: float = 0.0
) -> float:
    """
    Calculate effective cost after discounts and credits.

    Args:
        billed_cost: Original billed cost
        discount_rate: Discount percentage (0-100)
        credit_amount: Credit amount to subtract

    Returns:
        Effective cost after adjustments
    """
    discounted = billed_cost * (1 - discount_rate / 100)
    effective = max(0, discounted - credit_amount)
    return round(effective, 2)


def calculate_cost_per_unit(
    total_cost: float,
    quantity: float,
    unit_multiplier: float = 1.0
) -> float:
    """
    Calculate cost per unit.

    Args:
        total_cost: Total cost
        quantity: Number of units consumed
        unit_multiplier: Multiplier for unit normalization (e.g., 1M for tokens)

    Returns:
        Cost per unit
    """
    if quantity <= 0:
        return 0.0

    cost_per_unit = total_cost / (quantity / unit_multiplier)
    return round(cost_per_unit, 6)
