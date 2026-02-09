"""
Organization slug validation for multi-tenant isolation.
Layer 4 of 6-layer security model.
"""

import re
import time
import logging
from typing import Dict, Tuple

from google.cloud import bigquery

from src.core.engine.bigquery import get_bq_client, execute_query
from src.app.config import get_settings

logger = logging.getLogger(__name__)

# Cache validated orgs with TTL to avoid repeated BQ lookups
# Stores: org_slug -> (validated: bool, timestamp: float)
_org_cache: Dict[str, Tuple[bool, float]] = {}

_ORG_SLUG_PATTERN = re.compile(r"^[a-z0-9_]{3,50}$")

# Cache configuration
_CACHE_TTL_SECONDS = 300  # 5 minutes
_CACHE_MAX_SIZE = 1000


class OrgValidationError(Exception):
    """Raised when org_slug validation fails."""
    pass


def _evict_stale_cache() -> None:
    """Remove expired entries and enforce size limit."""
    now = time.time()
    expired = [k for k, (_, ts) in _org_cache.items() if now - ts > _CACHE_TTL_SECONDS]
    for k in expired:
        del _org_cache[k]

    # If still over limit, remove oldest entries
    if len(_org_cache) > _CACHE_MAX_SIZE:
        sorted_entries = sorted(_org_cache.items(), key=lambda x: x[1][1])
        to_remove = len(_org_cache) - _CACHE_MAX_SIZE
        for k, _ in sorted_entries[:to_remove]:
            del _org_cache[k]


def validate_org(org_slug: str) -> None:
    """
    Validate org_slug format and existence in BigQuery.

    Raises:
        OrgValidationError: If org_slug is invalid or not found.
    """
    if not org_slug or not _ORG_SLUG_PATTERN.match(org_slug):
        raise OrgValidationError(f"Invalid org_slug format: {org_slug!r}")

    now = time.time()
    cached = _org_cache.get(org_slug)
    if cached and (now - cached[1]) < _CACHE_TTL_SECONDS:
        return

    settings = get_settings()
    dataset = settings.organizations_dataset

    rows = execute_query(
        f"SELECT 1 FROM `{dataset}.org_profiles` WHERE org_slug = @slug LIMIT 1",
        params=[bigquery.ScalarQueryParameter("slug", "STRING", org_slug)],
    )

    if not rows:
        raise OrgValidationError(f"Organization not found: {org_slug}")

    _org_cache[org_slug] = (True, now)
    logger.debug(f"Validated org_slug: {org_slug}")

    # Periodic cleanup
    if len(_org_cache) > _CACHE_MAX_SIZE:
        _evict_stale_cache()


def clear_org_cache() -> None:
    """Clear the org validation cache (for testing)."""
    _org_cache.clear()
