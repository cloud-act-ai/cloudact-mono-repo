"""
Query safety guard for BigQuery operations.
Dry-run gate to prevent expensive queries.
Layer 5 of 6-layer security model.
"""

import logging

from src.core.engine.bigquery import dry_run_estimate
from src.app.config import get_settings
from google.cloud import bigquery
from typing import List, Optional

logger = logging.getLogger(__name__)


class QueryTooExpensiveError(Exception):
    """Raised when a query exceeds the cost gate."""
    pass


def guard_query(
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
) -> int:
    """
    Dry-run a query and reject if it exceeds the byte limit.

    Returns:
        Estimated bytes processed.

    Raises:
        QueryTooExpensiveError: If estimated bytes exceed the gate.
    """
    settings = get_settings()
    estimated_bytes = dry_run_estimate(query, params)

    if estimated_bytes > settings.bq_max_bytes_gate:
        gb = estimated_bytes / (1024 ** 3)
        max_gb = settings.bq_max_bytes_gate / (1024 ** 3)
        raise QueryTooExpensiveError(
            f"Query too expensive: {gb:.1f} GB estimated (max: {max_gb:.0f} GB). "
            "Add date filters or narrow the provider/service scope."
        )

    logger.debug(f"Query guard passed: {estimated_bytes / (1024**2):.1f} MB estimated")
    return estimated_bytes
