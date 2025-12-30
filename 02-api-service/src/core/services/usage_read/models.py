"""
Usage Read Service Models

Data models for GenAI usage queries and responses.
Uses shared date utilities for fiscal year and period calculations.
"""

from datetime import date
from dataclasses import dataclass
from typing import Optional, List, Dict, Any, Tuple
import hashlib

from src.core.services._shared.date_utils import DatePeriod, resolve_date_range


@dataclass
class UsageQuery:
    """
    Query parameters for usage data.

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
    models: Optional[List[str]] = None
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
        resolved_start, resolved_end = self.resolve_dates()
        key_parts = [
            self.org_slug,
            str(resolved_start),
            str(resolved_end),
            ",".join(sorted(self.providers or [])),
            ",".join(sorted(self.models or [])),
            str(self.limit),
            str(self.offset),
        ]
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()[:16]


@dataclass
class UsageResponse:
    """Response wrapper for usage data."""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    summary: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, Any]] = None
    total: int = 0
    error: Optional[str] = None
    cache_hit: bool = False
    query_time_ms: float = 0.0
