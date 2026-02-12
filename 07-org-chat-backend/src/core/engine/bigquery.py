"""
BigQuery client singleton for CloudAct Chat Backend.
Handles all BigQuery operations with connection pooling and retry logic.
"""

import time
import logging
import threading
from typing import Any, Dict, List, Optional
from functools import lru_cache

from google.cloud import bigquery
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from google.api_core.exceptions import ServiceUnavailable, TooManyRequests

from src.app.config import get_settings

logger = logging.getLogger(__name__)

# Transient errors worth retrying
_TRANSIENT_ERRORS = (ConnectionError, TimeoutError, ServiceUnavailable, TooManyRequests)


class CircuitBreaker:
    """Simple circuit breaker for BigQuery calls."""

    def __init__(self, fail_threshold: int = 5, reset_timeout: int = 60):
        self.fail_threshold = fail_threshold
        self.reset_timeout = reset_timeout
        self.failures = 0
        self.last_failure_time = 0.0
        self.state = "closed"  # closed=normal, open=blocking, half_open=testing
        self._lock = threading.Lock()

    def record_success(self):
        with self._lock:
            self.failures = 0
            self.state = "closed"

    def record_failure(self):
        with self._lock:
            self.failures += 1
            self.last_failure_time = time.time()
            if self.failures >= self.fail_threshold:
                self.state = "open"

    def can_execute(self) -> bool:
        with self._lock:
            if self.state == "closed":
                return True
            if self.state == "open":
                if time.time() - self.last_failure_time > self.reset_timeout:
                    self.state = "half_open"
                    return True
                return False
            return True  # half_open: allow one attempt


_bq_breaker = CircuitBreaker()


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
    enforce_guard: bool = True,
) -> List[Dict[str, Any]]:
    """Execute a parameterized BigQuery query with retry logic, circuit breaker, and optional dry-run guard."""
    # Circuit breaker check
    if not _bq_breaker.can_execute():
        raise RuntimeError("BigQuery circuit breaker is open. Too many recent failures. Try again later.")

    try:
        settings = get_settings()
        client = get_bq_client()

        # Optional dry-run guard for SELECT queries
        if enforce_guard and query.strip().upper().startswith("SELECT"):
            from src.core.security.query_guard import guard_query
            guard_query(query, params)

        job_config = bigquery.QueryJobConfig(
            query_parameters=params or [],
            job_timeout_ms=timeout_ms or settings.bq_query_timeout_ms,
        )

        results = client.query(query, job_config=job_config).result()
        rows = [dict(row) for row in results]
        _bq_breaker.record_success()
        return rows
    except Exception:
        _bq_breaker.record_failure()
        raise


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
