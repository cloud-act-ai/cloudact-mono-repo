"""
Shared utilities for MCP tools.
Common BigQuery query patterns, validation, and result formatting.
"""

import re
import time
import hashlib
import logging
import threading
import concurrent.futures
from datetime import date, timedelta
from functools import partial
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from google.cloud import bigquery

from src.core.engine.bigquery import execute_query
from src.core.security.org_validator import validate_org
from src.core.security.query_guard import guard_query
from src.app.config import get_settings

logger = logging.getLogger(__name__)

_ORG_SLUG_PATTERN = re.compile(r"^[a-z0-9_]{3,50}$")


def _validate_org_slug_format(org_slug: str) -> None:
    """Fast format-only validation (no BQ lookup). Prevents injection in dataset names."""
    if not org_slug or not _ORG_SLUG_PATTERN.match(org_slug):
        raise ValueError(f"Invalid org_slug format: {org_slug!r}")


def validate_enum(value: str, allowed: Set[str], field_name: str) -> str:
    """Validate a value against an allowed set. Returns the value if valid."""
    if value not in allowed:
        raise ValueError(f"Invalid {field_name}: {value!r}. Allowed: {sorted(allowed)}")
    return value


# Dry-run result cache: hash -> (estimated_bytes, timestamp)
_dry_run_cache: Dict[str, Tuple[int, float]] = {}
_dry_run_cache_lock = threading.Lock()
_DRY_RUN_CACHE_TTL = 300  # 5 minutes
_DRY_RUN_CACHE_MAX_SIZE = 500  # Prevent unbounded memory growth


def _cached_guard_query(
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
) -> int:
    """Guard query with a thread-safe hash-based cache for dry-run results."""
    # Include params in cache key so different param values aren't confused
    param_str = ""
    if params:
        param_str = "|".join(f"{p.name}={p.value}" for p in params)
    cache_key = hashlib.sha256(f"{query}|{param_str}".encode()).hexdigest()[:16]

    now = time.time()
    with _dry_run_cache_lock:
        cached = _dry_run_cache.get(cache_key)
        if cached and (now - cached[1]) < _DRY_RUN_CACHE_TTL:
            return cached[0]

    result = guard_query(query, params)

    with _dry_run_cache_lock:
        # Evict expired entries if cache is too large
        if len(_dry_run_cache) >= _DRY_RUN_CACHE_MAX_SIZE:
            expired = [k for k, (_, ts) in _dry_run_cache.items() if now - ts >= _DRY_RUN_CACHE_TTL]
            for k in expired:
                del _dry_run_cache[k]
        _dry_run_cache[cache_key] = (result, now)
    return result


def safe_query(
    org_slug: str,
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
) -> Dict[str, Any]:
    """
    Execute a validated, guarded BigQuery query for an org.

    1. Validates org_slug (format + existence)
    2. Dry-run gate (10 GB limit) — cached
    3. Executes parameterized query (with enforce_guard=False since we already guarded)
    4. Returns results with metadata
    """
    try:
        validate_org(org_slug)
        estimated_bytes = _cached_guard_query(query, params)
        rows = execute_query(query, params, enforce_guard=False)

        logger.info(f"safe_query OK for {org_slug}: {len(rows)} rows, {estimated_bytes} bytes")
        return {
            "org_slug": org_slug,
            "rows": rows,
            "count": len(rows),
            "bytes_processed": estimated_bytes,
        }
    except Exception as e:
        logger.error(f"Query failed for {org_slug}: {e}\nQuery: {query[:200]}")
        return {
            "org_slug": org_slug,
            "rows": [],
            "count": 0,
            "error": str(e),
        }


# Tool execution timeout
_TOOL_TIMEOUT_SECONDS = 30


def safe_query_with_timeout(
    org_slug: str,
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
    timeout_seconds: int = _TOOL_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """safe_query with a timeout guard."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(safe_query, org_slug, query, params)
        try:
            return future.result(timeout=timeout_seconds)
        except concurrent.futures.TimeoutError:
            return {
                "org_slug": org_slug,
                "error": f"Query timed out after {timeout_seconds}s",
                "rows": [],
                "count": 0,
            }


def get_dataset(org_slug: str) -> str:
    """Get the per-tenant BigQuery dataset name. Validates slug format first."""
    _validate_org_slug_format(org_slug)
    return f"{org_slug}_prod"


def get_org_dataset() -> str:
    """Get the central organizations dataset name."""
    return get_settings().organizations_dataset


def default_date_range() -> Tuple[str, str]:
    """Return default date range: first of current month to today."""
    today = date.today()
    first_of_month = today.replace(day=1)
    return first_of_month.isoformat(), today.isoformat()


def bind_org_slug(tool_fn: Callable, org_slug: str) -> Callable:
    """
    Pre-bind org_slug to a tool function so the LLM cannot override it.

    This is critical for multi-tenant isolation — without binding, the LLM
    could be prompt-injected into querying a different org's data.
    The bound function preserves the original name and docstring for ADK tool registration.
    """
    bound = partial(tool_fn, org_slug)
    bound.__name__ = tool_fn.__name__
    bound.__doc__ = tool_fn.__doc__
    return bound
