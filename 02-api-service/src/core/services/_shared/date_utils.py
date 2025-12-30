"""
Date Utilities for Read Services

Provides fiscal year calculations and common date filters.
All read services use these for consistent date handling.

Features:
- Fiscal year defaults based on org settings (customer can override)
- Common date range filters
- Period calculations (MTD, QTD, YTD, etc.)
"""

from datetime import date, datetime, timedelta
from dataclasses import dataclass
from typing import Optional, Tuple, Literal
from enum import Enum


class DatePeriod(str, Enum):
    """Predefined date periods for quick filtering."""
    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_7_DAYS = "last_7_days"
    LAST_30_DAYS = "last_30_days"
    LAST_90_DAYS = "last_90_days"
    MTD = "mtd"  # Month to date
    QTD = "qtd"  # Quarter to date
    YTD = "ytd"  # Year to date (fiscal)
    LAST_MONTH = "last_month"
    LAST_QUARTER = "last_quarter"
    LAST_YEAR = "last_year"  # Last fiscal year
    CUSTOM = "custom"


@dataclass
class DateRange:
    """Represents a date range with optional period label."""
    start_date: date
    end_date: date
    period: Optional[DatePeriod] = None
    fiscal_year: Optional[int] = None
    label: Optional[str] = None  # Human-readable label (e.g., "Dec 2025", "Q4 2025")

    def __post_init__(self):
        """Generate label if not provided."""
        if self.label is None:
            self.label = self._generate_label()

    def _generate_label(self) -> str:
        """Generate human-readable label for the date range."""
        if self.period == DatePeriod.TODAY:
            return self.start_date.strftime("%b %d, %Y")
        elif self.period == DatePeriod.YESTERDAY:
            return f"Yesterday ({self.start_date.strftime('%b %d')})"
        elif self.period == DatePeriod.MTD:
            return self.start_date.strftime("%b %Y")
        elif self.period == DatePeriod.QTD:
            q = ((self.start_date.month - 1) // 3) + 1
            return f"Q{q} {self.start_date.year}"
        elif self.period == DatePeriod.YTD:
            return f"FY {self.fiscal_year or self.start_date.year}"
        elif self.period == DatePeriod.LAST_MONTH:
            return self.start_date.strftime("%b %Y")
        elif self.period == DatePeriod.LAST_QUARTER:
            q = ((self.start_date.month - 1) // 3) + 1
            return f"Q{q} {self.start_date.year}"
        elif self.period == DatePeriod.LAST_YEAR:
            return f"FY {self.fiscal_year or self.start_date.year}"
        elif self.period in (DatePeriod.LAST_7_DAYS, DatePeriod.LAST_30_DAYS, DatePeriod.LAST_90_DAYS):
            days = (self.end_date - self.start_date).days + 1
            return f"Last {days} days"
        else:
            # Custom range
            return f"{self.start_date.strftime('%b %d')} - {self.end_date.strftime('%b %d, %Y')}"

    def to_dict(self) -> dict:
        return {
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "period": self.period.value if self.period else None,
            "fiscal_year": self.fiscal_year,
            "label": self.label,
        }


@dataclass
class FiscalYearConfig:
    """Fiscal year configuration for an organization."""
    start_month: int = 1  # 1=Jan (calendar), 4=Apr (India/UK), 7=Jul (Australia)

    def get_fiscal_year_start(self, year: int) -> date:
        """Get the start date of a fiscal year."""
        return date(year, self.start_month, 1)

    def get_fiscal_year_end(self, year: int) -> date:
        """Get the end date of a fiscal year."""
        if self.start_month == 1:
            return date(year, 12, 31)
        else:
            # Fiscal year ends in the next calendar year
            end_month = self.start_month - 1
            end_year = year + 1
            # Get last day of the end month
            if end_month == 12:
                return date(end_year, 12, 31)
            else:
                next_month = date(end_year, end_month + 1, 1)
                return next_month - timedelta(days=1)

    def get_current_fiscal_year(self, today: Optional[date] = None) -> int:
        """Get the current fiscal year number."""
        today = today or date.today()
        if self.start_month == 1:
            return today.year
        else:
            # If before fiscal year start month, we're in previous FY
            if today.month < self.start_month:
                return today.year - 1
            return today.year

    def get_fiscal_quarter(self, target_date: Optional[date] = None) -> int:
        """Get fiscal quarter (1-4) for a given date."""
        target_date = target_date or date.today()
        # Calculate months since fiscal year start
        fy = self.get_current_fiscal_year(target_date)
        fy_start = self.get_fiscal_year_start(fy)

        if target_date < fy_start:
            fy = fy - 1
            fy_start = self.get_fiscal_year_start(fy)

        months_since_start = (target_date.year - fy_start.year) * 12 + (target_date.month - fy_start.month)
        return (months_since_start // 3) + 1


def get_fiscal_year_range(
    fiscal_year_start_month: int = 1,
    fiscal_year: Optional[int] = None,
    today: Optional[date] = None
) -> DateRange:
    """
    Get fiscal year date range.

    Args:
        fiscal_year_start_month: Month when fiscal year starts (1-12)
        fiscal_year: Specific fiscal year (None = current)
        today: Reference date (None = today)

    Returns:
        DateRange with start_date, end_date capped to today if current FY
    """
    today = today or date.today()
    config = FiscalYearConfig(start_month=fiscal_year_start_month)

    fy = fiscal_year or config.get_current_fiscal_year(today)
    start = config.get_fiscal_year_start(fy)
    end = config.get_fiscal_year_end(fy)

    # Cap end date to today if it's the current/future fiscal year
    if end > today:
        end = today

    return DateRange(
        start_date=start,
        end_date=end,
        period=DatePeriod.YTD if fiscal_year is None else DatePeriod.CUSTOM,
        fiscal_year=fy
    )


def get_quarter_range(
    fiscal_year_start_month: int = 1,
    quarter: Optional[int] = None,
    fiscal_year: Optional[int] = None,
    today: Optional[date] = None
) -> DateRange:
    """
    Get fiscal quarter date range.

    Args:
        fiscal_year_start_month: Month when fiscal year starts (1-12)
        quarter: Specific quarter 1-4 (None = current)
        fiscal_year: Specific fiscal year (None = current)
        today: Reference date (None = today)

    Returns:
        DateRange for the quarter, capped to today if current quarter
    """
    today = today or date.today()
    config = FiscalYearConfig(start_month=fiscal_year_start_month)

    fy = fiscal_year or config.get_current_fiscal_year(today)
    q = quarter or config.get_fiscal_quarter(today)

    # Calculate quarter start
    months_offset = (q - 1) * 3
    start_month = ((fiscal_year_start_month - 1 + months_offset) % 12) + 1
    start_year = fy if start_month >= fiscal_year_start_month else fy + 1

    if fiscal_year_start_month > 1 and start_month < fiscal_year_start_month:
        start_year = fy + 1

    start = date(start_year, start_month, 1)

    # Calculate quarter end (3 months later)
    end_month = ((start_month - 1 + 3) % 12) + 1
    end_year = start_year if end_month > start_month else start_year + 1
    end = date(end_year, end_month, 1) - timedelta(days=1)

    # Cap to today
    if end > today:
        end = today

    return DateRange(
        start_date=start,
        end_date=end,
        period=DatePeriod.QTD if quarter is None else DatePeriod.CUSTOM,
        fiscal_year=fy
    )


def get_period_range(
    period: DatePeriod,
    fiscal_year_start_month: int = 1,
    today: Optional[date] = None
) -> DateRange:
    """
    Get date range for a predefined period.

    Args:
        period: The DatePeriod to calculate
        fiscal_year_start_month: Month when fiscal year starts (1-12)
        today: Reference date (None = today)

    Returns:
        DateRange for the period
    """
    today = today or date.today()
    config = FiscalYearConfig(start_month=fiscal_year_start_month)

    if period == DatePeriod.TODAY:
        return DateRange(start_date=today, end_date=today, period=period)

    elif period == DatePeriod.YESTERDAY:
        yesterday = today - timedelta(days=1)
        return DateRange(start_date=yesterday, end_date=yesterday, period=period)

    elif period == DatePeriod.LAST_7_DAYS:
        start = today - timedelta(days=6)
        return DateRange(start_date=start, end_date=today, period=period)

    elif period == DatePeriod.LAST_30_DAYS:
        start = today - timedelta(days=29)
        return DateRange(start_date=start, end_date=today, period=period)

    elif period == DatePeriod.LAST_90_DAYS:
        start = today - timedelta(days=89)
        return DateRange(start_date=start, end_date=today, period=period)

    elif period == DatePeriod.MTD:
        start = date(today.year, today.month, 1)
        return DateRange(start_date=start, end_date=today, period=period)

    elif period == DatePeriod.QTD:
        return get_quarter_range(fiscal_year_start_month, today=today)

    elif period == DatePeriod.YTD:
        return get_fiscal_year_range(fiscal_year_start_month, today=today)

    elif period == DatePeriod.LAST_MONTH:
        # First day of last month
        if today.month == 1:
            start = date(today.year - 1, 12, 1)
            end = date(today.year - 1, 12, 31)
        else:
            start = date(today.year, today.month - 1, 1)
            end = date(today.year, today.month, 1) - timedelta(days=1)
        return DateRange(start_date=start, end_date=end, period=period)

    elif period == DatePeriod.LAST_QUARTER:
        current_q = config.get_fiscal_quarter(today)
        fy = config.get_current_fiscal_year(today)
        last_q = current_q - 1
        if last_q == 0:
            last_q = 4
            fy = fy - 1
        return get_quarter_range(fiscal_year_start_month, quarter=last_q, fiscal_year=fy, today=today)

    elif period == DatePeriod.LAST_YEAR:
        fy = config.get_current_fiscal_year(today) - 1
        return get_fiscal_year_range(fiscal_year_start_month, fiscal_year=fy, today=today)

    # CUSTOM or unknown - return YTD as default
    return get_fiscal_year_range(fiscal_year_start_month, today=today)


def resolve_date_range(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    period: Optional[DatePeriod] = None,
    fiscal_year: Optional[int] = None,
    fiscal_year_start_month: int = 1,
    today: Optional[date] = None
) -> DateRange:
    """
    Resolve date range from various inputs.

    Priority:
    1. If start_date and end_date provided → use them (customer override)
    2. If period provided → calculate from period
    3. If fiscal_year provided → get that fiscal year range
    4. Default → current fiscal YTD

    Args:
        start_date: Custom start date (overrides period/fiscal_year)
        end_date: Custom end date (overrides period/fiscal_year)
        period: Predefined period
        fiscal_year: Specific fiscal year
        fiscal_year_start_month: Org's fiscal year start month
        today: Reference date

    Returns:
        DateRange with resolved dates
    """
    today = today or date.today()

    # Customer override - use provided dates
    if start_date and end_date:
        return DateRange(
            start_date=start_date,
            end_date=min(end_date, today),  # Never return future dates
            period=DatePeriod.CUSTOM
        )

    # Period-based
    if period and period != DatePeriod.CUSTOM:
        return get_period_range(period, fiscal_year_start_month, today)

    # Fiscal year specific
    if fiscal_year:
        return get_fiscal_year_range(fiscal_year_start_month, fiscal_year, today)

    # Default: current fiscal YTD
    return get_fiscal_year_range(fiscal_year_start_month, today=today)


def validate_date_range(
    start_date: date,
    end_date: date,
    max_days: int = 366,
    allow_future: bool = False
) -> Tuple[bool, Optional[str]]:
    """
    Validate a date range.

    Args:
        start_date: Range start
        end_date: Range end
        max_days: Maximum allowed range in days
        allow_future: Whether to allow future dates

    Returns:
        Tuple of (is_valid, error_message)
    """
    today = date.today()

    if start_date > end_date:
        return False, "start_date must be before or equal to end_date"

    if not allow_future and end_date > today:
        return False, "end_date cannot be in the future"

    days_diff = (end_date - start_date).days
    if days_diff > max_days:
        return False, f"Date range cannot exceed {max_days} days"

    return True, None


# Convenience functions for common use cases

def get_default_date_range(fiscal_year_start_month: int = 1) -> DateRange:
    """Get default date range (current fiscal YTD)."""
    return get_fiscal_year_range(fiscal_year_start_month)


def get_last_n_days(n: int, today: Optional[date] = None) -> DateRange:
    """Get date range for last N days."""
    today = today or date.today()
    start = today - timedelta(days=n - 1)
    return DateRange(start_date=start, end_date=today, period=DatePeriod.CUSTOM)


# ==============================================================================
# Period Comparison (Current vs Previous)
# ==============================================================================

class ComparisonType(str, Enum):
    """Types of period comparisons."""
    WEEK_OVER_WEEK = "week_over_week"          # This week vs last week
    MONTH_OVER_MONTH = "month_over_month"      # This month vs last month
    QUARTER_OVER_QUARTER = "quarter_over_quarter"  # This quarter vs last quarter
    YEAR_OVER_YEAR = "year_over_year"          # This year vs last year (fiscal)
    CUSTOM_DAYS = "custom_days"                # Last N days vs previous N days


@dataclass
class DateComparison:
    """
    Holds current and previous period ranges for comparison.

    Example: Last 90 days vs Previous 90 days
    - current: 2025-10-02 to 2025-12-30
    - previous: 2025-07-04 to 2025-10-01
    """
    current: DateRange
    previous: DateRange
    comparison_type: ComparisonType

    def to_dict(self) -> dict:
        return {
            "current": self.current.to_dict(),
            "previous": self.previous.to_dict(),
            "comparison_type": self.comparison_type.value,
        }


def get_week_range(
    weeks_ago: int = 0,
    today: Optional[date] = None
) -> DateRange:
    """
    Get date range for a specific week.

    Args:
        weeks_ago: 0 = current week, 1 = last week, etc.
        today: Reference date

    Returns:
        DateRange for Monday to Sunday of that week
    """
    today = today or date.today()

    # Find Monday of current week
    current_monday = today - timedelta(days=today.weekday())

    # Go back N weeks
    target_monday = current_monday - timedelta(weeks=weeks_ago)
    target_sunday = target_monday + timedelta(days=6)

    # Cap to today if current week
    if target_sunday > today:
        target_sunday = today

    return DateRange(
        start_date=target_monday,
        end_date=target_sunday,
        period=DatePeriod.CUSTOM
    )


def get_month_range(
    months_ago: int = 0,
    today: Optional[date] = None
) -> DateRange:
    """
    Get date range for a specific month.

    Args:
        months_ago: 0 = current month, 1 = last month, etc.
        today: Reference date

    Returns:
        DateRange for 1st to last day of that month
    """
    today = today or date.today()

    # Calculate target month
    target_year = today.year
    target_month = today.month - months_ago

    while target_month <= 0:
        target_month += 12
        target_year -= 1

    # First day of target month
    start = date(target_year, target_month, 1)

    # Last day of target month
    if target_month == 12:
        end = date(target_year, 12, 31)
    else:
        end = date(target_year, target_month + 1, 1) - timedelta(days=1)

    # Cap to today if current month
    if end > today:
        end = today

    return DateRange(
        start_date=start,
        end_date=end,
        period=DatePeriod.CUSTOM
    )


def get_comparison_ranges(
    comparison_type: ComparisonType,
    days: int = 90,
    fiscal_year_start_month: int = 1,
    today: Optional[date] = None
) -> DateComparison:
    """
    Get current and previous period ranges for comparison.

    Args:
        comparison_type: Type of comparison
        days: Number of days for CUSTOM_DAYS comparison
        fiscal_year_start_month: For fiscal quarter/year comparisons
        today: Reference date

    Returns:
        DateComparison with current and previous ranges

    Examples:
        # Last 90 days vs previous 90 days
        get_comparison_ranges(ComparisonType.CUSTOM_DAYS, days=90)

        # This month vs last month
        get_comparison_ranges(ComparisonType.MONTH_OVER_MONTH)

        # Q4 2024 vs Q4 2023
        get_comparison_ranges(ComparisonType.QUARTER_OVER_QUARTER)
    """
    today = today or date.today()

    if comparison_type == ComparisonType.WEEK_OVER_WEEK:
        current = get_week_range(weeks_ago=0, today=today)
        previous = get_week_range(weeks_ago=1, today=today)

    elif comparison_type == ComparisonType.MONTH_OVER_MONTH:
        current = get_month_range(months_ago=0, today=today)
        previous = get_month_range(months_ago=1, today=today)

    elif comparison_type == ComparisonType.QUARTER_OVER_QUARTER:
        config = FiscalYearConfig(start_month=fiscal_year_start_month)
        current_fy = config.get_current_fiscal_year(today)
        current_q = config.get_fiscal_quarter(today)

        # Previous quarter
        prev_q = current_q - 1
        prev_fy = current_fy
        if prev_q == 0:
            prev_q = 4
            prev_fy = current_fy - 1

        current = get_quarter_range(fiscal_year_start_month, quarter=current_q, fiscal_year=current_fy, today=today)
        previous = get_quarter_range(fiscal_year_start_month, quarter=prev_q, fiscal_year=prev_fy, today=today)

    elif comparison_type == ComparisonType.YEAR_OVER_YEAR:
        config = FiscalYearConfig(start_month=fiscal_year_start_month)
        current_fy = config.get_current_fiscal_year(today)

        current = get_fiscal_year_range(fiscal_year_start_month, fiscal_year=current_fy, today=today)
        previous = get_fiscal_year_range(fiscal_year_start_month, fiscal_year=current_fy - 1, today=today)

    else:  # CUSTOM_DAYS
        # Last N days vs previous N days
        current_end = today
        current_start = today - timedelta(days=days - 1)

        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days - 1)

        current = DateRange(start_date=current_start, end_date=current_end, period=DatePeriod.CUSTOM)
        previous = DateRange(start_date=previous_start, end_date=previous_end, period=DatePeriod.CUSTOM)

    return DateComparison(
        current=current,
        previous=previous,
        comparison_type=comparison_type
    )


def get_custom_comparison(
    current_start: date,
    current_end: date,
    previous_start: date,
    previous_end: date
) -> DateComparison:
    """
    Create a custom comparison between any two date ranges.

    Args:
        current_start: Start of current period
        current_end: End of current period
        previous_start: Start of previous period
        previous_end: End of previous period

    Returns:
        DateComparison with the two ranges

    Example:
        # Q1 2025 vs Q1 2024
        get_custom_comparison(
            current_start=date(2025, 1, 1), current_end=date(2025, 3, 31),
            previous_start=date(2024, 1, 1), previous_end=date(2024, 3, 31)
        )
    """
    return DateComparison(
        current=DateRange(start_date=current_start, end_date=current_end, period=DatePeriod.CUSTOM),
        previous=DateRange(start_date=previous_start, end_date=previous_end, period=DatePeriod.CUSTOM),
        comparison_type=ComparisonType.CUSTOM_DAYS
    )


def get_same_period_last_year(
    start_date: date,
    end_date: date,
    today: Optional[date] = None
) -> DateComparison:
    """
    Compare a date range with the same period last year.

    Args:
        start_date: Start of current period
        end_date: End of current period
        today: Reference date for capping

    Returns:
        DateComparison with current range and same range from last year

    Example:
        # Dec 1-30 2025 vs Dec 1-30 2024
        get_same_period_last_year(date(2025, 12, 1), date(2025, 12, 30))
    """
    today = today or date.today()

    # Cap current end to today
    current_end = min(end_date, today)

    # Calculate same period last year
    prev_start = date(start_date.year - 1, start_date.month, start_date.day)
    prev_end = date(end_date.year - 1, end_date.month, min(end_date.day, 28))  # Safe for Feb

    # Handle leap year edge case
    try:
        prev_end = date(end_date.year - 1, end_date.month, end_date.day)
    except ValueError:
        # Feb 29 doesn't exist in non-leap years
        prev_end = date(end_date.year - 1, end_date.month, 28)

    return DateComparison(
        current=DateRange(start_date=start_date, end_date=current_end, period=DatePeriod.CUSTOM),
        previous=DateRange(start_date=prev_start, end_date=prev_end, period=DatePeriod.CUSTOM),
        comparison_type=ComparisonType.YEAR_OVER_YEAR
    )
