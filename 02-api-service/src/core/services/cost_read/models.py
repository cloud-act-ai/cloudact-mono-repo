"""
Cost Read Service Models

Data models for cost queries and responses.
Uses shared date utilities for fiscal year and period calculations.
"""

from datetime import date
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple
import hashlib

from src.app.models.i18n_models import DEFAULT_CURRENCY
from src.core.services._shared.date_utils import DatePeriod, resolve_date_range


@dataclass
class CostQuery:
    """
    Query parameters for cost data.

    Date filtering priority:
    1. start_date + end_date → custom range (customer override)
    2. period → predefined period (MTD, QTD, YTD, etc.)
    3. fiscal_year → specific fiscal year
    4. Default → current fiscal YTD
    """
    org_slug: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    period: Optional[DatePeriod] = None
    fiscal_year: Optional[int] = None
    fiscal_year_start_month: int = 1  # From org settings
    providers: Optional[List[str]] = None
    service_categories: Optional[List[str]] = None
    group_by: Optional[List[str]] = None
    limit: int = 10000
    offset: int = 0

    def resolve_dates(self) -> Tuple[date, date]:
        """Resolve actual date range based on query parameters."""
        date_range = resolve_date_range(
            start_date=self.start_date,
            end_date=self.end_date,
            period=self.period,
            fiscal_year=self.fiscal_year,
            fiscal_year_start_month=self.fiscal_year_start_month,
        )
        return date_range.start_date, date_range.end_date

    def cache_key(self) -> str:
        """Generate unique cache key for this query."""
        # Resolve dates for consistent caching
        resolved_start, resolved_end = self.resolve_dates()
        key_parts = [
            f"org:{self.org_slug}",
            f"start:{resolved_start}",
            f"end:{resolved_end}",
            f"providers:{sorted(self.providers or [])}",
            f"categories:{sorted(self.service_categories or [])}",
            f"group:{sorted(self.group_by or [])}",
            f"limit:{self.limit}",
            f"offset:{self.offset}"
        ]
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()


@dataclass
class CostSummary:
    """Summary statistics for cost data."""
    total_cost: float
    total_records: int
    date_range: Tuple[Optional[date], Optional[date]]
    providers: List[str]
    service_categories: List[str]
    currency: str = field(default_factory=lambda: DEFAULT_CURRENCY.value)


@dataclass
class CostResponse:
    """Response wrapper for cost data."""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    summary: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, int]] = None
    cache_hit: bool = False
    query_time_ms: float = 0.0
    error: Optional[str] = None
