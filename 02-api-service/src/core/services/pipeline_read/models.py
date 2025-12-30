"""
Pipeline Read Service Models

Data models for pipeline run queries and responses.
Uses shared date utilities for fiscal year and period calculations.
"""

from datetime import date
from dataclasses import dataclass
from typing import Optional, List, Dict, Any, Tuple
import hashlib

from src.core.services._shared.date_utils import DatePeriod, resolve_date_range


@dataclass
class PipelineQuery:
    """
    Query parameters for pipeline run reads.

    Date filtering priority:
    1. start_date + end_date → custom range (customer override)
    2. period → predefined period (MTD, QTD, YTD, etc.)
    3. Default → last 30 days
    """
    org_slug: str
    status_filter: Optional[List[str]] = None
    pipeline_id: Optional[str] = None
    trigger_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    period: Optional[DatePeriod] = None
    fiscal_year_start_month: int = 1  # From org settings
    limit: int = 50
    offset: int = 0

    def resolve_dates(self) -> Tuple[date, date]:
        """Resolve actual date range based on query parameters."""
        # Default to last 30 days for pipeline runs if no dates specified
        if not self.start_date and not self.end_date and not self.period:
            from src.core.services._shared.date_utils import get_last_n_days
            date_range = get_last_n_days(30)
            return date_range.start_date, date_range.end_date

        date_range = resolve_date_range(
            start_date=self.start_date,
            end_date=self.end_date,
            period=self.period,
            fiscal_year_start_month=self.fiscal_year_start_month,
        )
        return date_range.start_date, date_range.end_date

    def cache_key(self) -> str:
        """Generate deterministic cache key."""
        resolved_start, resolved_end = self.resolve_dates()
        key_parts = [
            self.org_slug,
            ",".join(sorted(self.status_filter or [])),
            self.pipeline_id or "",
            self.trigger_type or "",
            str(resolved_start),
            str(resolved_end),
            str(self.limit),
            str(self.offset),
        ]
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()[:16]


@dataclass
class PipelineResponse:
    """Response for pipeline queries."""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    summary: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, Any]] = None
    total: int = 0
    error: Optional[str] = None
    cache_hit: bool = False
    query_time_ms: float = 0.0
