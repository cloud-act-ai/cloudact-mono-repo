"""
Shared utilities for MCP tools.
Common BigQuery query patterns, validation, and result formatting.
"""

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from google.cloud import bigquery

from src.core.engine.bigquery import execute_query
from src.core.security.org_validator import validate_org
from src.core.security.query_guard import guard_query
from src.app.config import get_settings

logger = logging.getLogger(__name__)


def safe_query(
    org_slug: str,
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
) -> Dict[str, Any]:
    """
    Execute a validated, guarded BigQuery query for an org.

    1. Validates org_slug
    2. Dry-run gate (10 GB limit)
    3. Executes parameterized query
    4. Returns results with metadata
    """
    validate_org(org_slug)
    estimated_bytes = guard_query(query, params)
    rows = execute_query(query, params)

    return {
        "org_slug": org_slug,
        "rows": rows,
        "count": len(rows),
        "bytes_processed": estimated_bytes,
    }


def get_dataset(org_slug: str) -> str:
    """Get the per-tenant BigQuery dataset name."""
    settings = get_settings()
    env_suffix = "prod" if settings.environment == "production" else "prod"
    return f"{org_slug}_{env_suffix}"


def get_org_dataset() -> str:
    """Get the central organizations dataset name."""
    return get_settings().organizations_dataset


def default_date_range() -> tuple[str, str]:
    """Return default date range: first of current month to today."""
    today = date.today()
    first_of_month = today.replace(day=1)
    return first_of_month.isoformat(), today.isoformat()
