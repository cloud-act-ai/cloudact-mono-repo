"""
Organization slug validation for multi-tenant isolation.
Layer 4 of 6-layer security model.
"""

import re
import logging
from typing import Dict

from google.cloud import bigquery

from src.core.engine.bigquery import get_bq_client, execute_query
from src.app.config import get_settings

logger = logging.getLogger(__name__)

# Cache validated orgs to avoid repeated BQ lookups
_org_cache: Dict[str, bool] = {}

_ORG_SLUG_PATTERN = re.compile(r"^[a-z0-9_]{3,50}$")


class OrgValidationError(Exception):
    """Raised when org_slug validation fails."""
    pass


def validate_org(org_slug: str) -> None:
    """
    Validate org_slug format and existence in BigQuery.

    Raises:
        OrgValidationError: If org_slug is invalid or not found.
    """
    if not org_slug or not _ORG_SLUG_PATTERN.match(org_slug):
        raise OrgValidationError(f"Invalid org_slug format: {org_slug!r}")

    if org_slug in _org_cache:
        return

    settings = get_settings()
    dataset = settings.organizations_dataset

    rows = execute_query(
        f"SELECT 1 FROM `{dataset}.org_profiles` WHERE org_slug = @slug LIMIT 1",
        params=[bigquery.ScalarQueryParameter("slug", "STRING", org_slug)],
    )

    if not rows:
        raise OrgValidationError(f"Organization not found: {org_slug}")

    _org_cache[org_slug] = True
    logger.debug(f"Validated org_slug: {org_slug}")


def clear_org_cache() -> None:
    """Clear the org validation cache (for testing)."""
    _org_cache.clear()
