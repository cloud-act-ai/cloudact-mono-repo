"""
BigQuery client singleton for CloudAct Chat Backend.
Handles all BigQuery operations with connection pooling and retry logic.
"""

import logging
from typing import Any, Dict, List, Optional
from functools import lru_cache

from google.cloud import bigquery
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from google.api_core.exceptions import ServiceUnavailable, TooManyRequests

from src.app.config import get_settings

logger = logging.getLogger(__name__)

# Transient errors worth retrying
_TRANSIENT_ERRORS = (ConnectionError, TimeoutError, ServiceUnavailable, TooManyRequests)


@lru_cache()
def get_bq_client() -> bigquery.Client:
    settings = get_settings()
    return bigquery.Client(
        project=settings.gcp_project_id,
        location=settings.bigquery_location,
    )


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(_TRANSIENT_ERRORS),
)
def execute_query(
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
    timeout_ms: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Execute a parameterized BigQuery query with retry logic."""
    settings = get_settings()
    client = get_bq_client()

    job_config = bigquery.QueryJobConfig(
        query_parameters=params or [],
        job_timeout_ms=timeout_ms or settings.bq_query_timeout_ms,
    )

    results = client.query(query, job_config=job_config).result()
    return [dict(row) for row in results]


def dry_run_estimate(
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
) -> int:
    """Dry-run a query and return estimated bytes processed."""
    client = get_bq_client()

    job_config = bigquery.QueryJobConfig(
        query_parameters=params or [],
        dry_run=True,
    )

    job = client.query(query, job_config=job_config)
    return job.total_bytes_processed


def streaming_insert(
    table_id: str,
    rows: List[Dict[str, Any]],
) -> None:
    """Insert rows via BigQuery Streaming Insert API. Raises on failure."""
    client = get_bq_client()
    errors = client.insert_rows_json(table_id, rows)
    if errors:
        logger.error(f"BigQuery streaming insert errors for {table_id}: {errors}")
        raise RuntimeError(f"BigQuery streaming insert failed: {errors}")
