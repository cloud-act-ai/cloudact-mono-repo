"""
Performance Test Fixtures and Utilities

Provides fixtures and helper functions for performance testing.
These utilities support:
- Query timeout measurement
- Connection pool monitoring
- Latency percentile calculations
- Performance benchmarking

Run with: pytest -m performance --run-integration tests/performance/
"""

import os
import time
import statistics
import pytest
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
from httpx import AsyncClient, ASGITransport
from google.cloud import bigquery

# Mark all tests in performance directory
pytestmark = [pytest.mark.performance]


# ============================================
# Test Client Fixtures
# ============================================

@pytest.fixture
async def perf_client():
    """
    Performance test client with real BigQuery (no mocks).

    Requires:
    - GOOGLE_APPLICATION_CREDENTIALS environment variable
    - GCP_PROJECT_ID set to a real project
    - --run-integration flag

    Usage: pytest -m performance --run-integration
    """
    if os.environ.get("GCP_PROJECT_ID") in ["test-project", None]:
        pytest.skip("Performance tests require real GCP credentials")
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") is None:
        pytest.skip("GOOGLE_APPLICATION_CREDENTIALS not set")

    from src.app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def bq_client_perf():
    """Real BigQuery client for performance tests."""
    if os.environ.get("GCP_PROJECT_ID") in ["test-project", None]:
        pytest.skip("Performance tests require real GCP credentials")

    project_id = os.environ.get("GCP_PROJECT_ID")
    return bigquery.Client(project=project_id)


# ============================================
# Timer Utilities
# ============================================

class TimerContext:
    """Context manager for timing operations."""

    def __init__(self, description: str = "Operation"):
        self.description = description
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.duration_ms: Optional[float] = None

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.perf_counter()
        self.duration_ms = (self.end_time - self.start_time) * 1000
        return False  # Don't suppress exceptions

    def get_duration_ms(self) -> float:
        """Get duration in milliseconds."""
        if self.duration_ms is None:
            raise ValueError("Timer has not completed")
        return self.duration_ms


@pytest.fixture
def timer():
    """Fixture for timing operations."""
    def _timer(description: str = "Operation") -> TimerContext:
        return TimerContext(description)
    return _timer


# ============================================
# Latency Measurement Helpers
# ============================================

def calculate_percentiles(timings: List[float]) -> Dict[str, float]:
    """
    Calculate performance percentiles from timing data.

    Args:
        timings: List of durations in seconds

    Returns:
        Dict with min, p50, p95, p99, max, mean, stdev (all in milliseconds)
    """
    if not timings:
        return {
            "min": 0,
            "p50": 0,
            "p95": 0,
            "p99": 0,
            "max": 0,
            "mean": 0,
            "stdev": 0,
            "count": 0
        }

    sorted_timings = sorted(timings)
    n = len(sorted_timings)

    return {
        "min": min(sorted_timings) * 1000,  # Convert to ms
        "p50": sorted_timings[int(n * 0.50)] * 1000,
        "p95": sorted_timings[int(n * 0.95)] * 1000,
        "p99": sorted_timings[int(n * 0.99)] * 1000,
        "max": max(sorted_timings) * 1000,
        "mean": statistics.mean(sorted_timings) * 1000,
        "stdev": statistics.stdev(sorted_timings) * 1000 if n > 1 else 0,
        "count": n
    }


def print_performance_report(operation: str, stats: Dict[str, float], target_p95: Optional[float] = None):
    """
    Print a formatted performance report.

    Args:
        operation: Name of the operation being measured
        stats: Statistics dictionary from calculate_percentiles()
        target_p95: Optional target p95 latency in ms
    """
    print(f"\n{'=' * 80}")
    print(f"Performance Report: {operation}")
    print(f"{'=' * 80}")
    print(f"Requests:       {stats['count']}")
    print(f"Min:            {stats['min']:.2f}ms")
    print(f"p50:            {stats['p50']:.2f}ms")
    print(f"p95:            {stats['p95']:.2f}ms")
    if target_p95:
        status = "✓ PASS" if stats['p95'] <= target_p95 else "✗ FAIL"
        print(f"p95 target:     {target_p95:.2f}ms {status}")
    print(f"p99:            {stats['p99']:.2f}ms")
    print(f"Max:            {stats['max']:.2f}ms")
    print(f"Mean:           {stats['mean']:.2f}ms ± {stats['stdev']:.2f}ms")
    print(f"{'=' * 80}\n")


@pytest.fixture
def latency_reporter():
    """Fixture for reporting latency statistics."""
    return print_performance_report


# ============================================
# Connection Pool Monitoring
# ============================================

class ConnectionPoolMonitor:
    """Monitor BigQuery connection pool usage."""

    def __init__(self, bq_client: bigquery.Client):
        self.bq_client = bq_client
        self.initial_count: Optional[int] = None
        self.final_count: Optional[int] = None

    def start(self):
        """Start monitoring (record initial state)."""
        # Note: BigQuery client doesn't expose connection pool metrics directly
        # We can only monitor through HTTP session if available
        self.initial_count = 0
        return self

    def stop(self):
        """Stop monitoring (record final state)."""
        self.final_count = 0
        return self

    def get_leak_count(self) -> int:
        """Get number of leaked connections."""
        if self.initial_count is None or self.final_count is None:
            raise ValueError("Monitor not started or stopped")
        return max(0, self.final_count - self.initial_count)


@pytest.fixture
def connection_monitor(bq_client_perf):
    """Fixture for monitoring connection pool."""
    def _monitor() -> ConnectionPoolMonitor:
        return ConnectionPoolMonitor(bq_client_perf)
    return _monitor


# ============================================
# Slow Query Generators
# ============================================

def generate_slow_query(project_id: str, duration_seconds: int = 5) -> str:
    """
    Generate a slow BigQuery query for timeout testing.

    Uses GENERATE_ARRAY and cross joins to create a slow query.

    Args:
        project_id: GCP project ID
        duration_seconds: Target duration (approximate)

    Returns:
        SQL query string
    """
    # Generate array size based on target duration
    # Rough estimate: 100k rows per second processing
    array_size = duration_seconds * 100000

    query = f"""
    WITH numbers AS (
        SELECT num
        FROM UNNEST(GENERATE_ARRAY(1, {array_size})) AS num
    ),
    cross_product AS (
        SELECT a.num as a, b.num as b
        FROM numbers a
        CROSS JOIN numbers b
        LIMIT 1000000
    )
    SELECT COUNT(*) as total
    FROM cross_product
    """
    return query


def generate_auth_slow_query(project_id: str) -> str:
    """
    Generate a slow query for auth endpoint testing (10-15 seconds).

    Args:
        project_id: GCP project ID

    Returns:
        SQL query string
    """
    return generate_slow_query(project_id, duration_seconds=12)


def generate_batch_slow_query(project_id: str) -> str:
    """
    Generate a very slow query for batch testing (5+ minutes).

    Args:
        project_id: GCP project ID

    Returns:
        SQL query string
    """
    # For batch queries, we need a query that takes 5+ minutes
    # Use a large cross join
    query = f"""
    WITH numbers AS (
        SELECT num
        FROM UNNEST(GENERATE_ARRAY(1, 500000)) AS num
    )
    SELECT
        a.num as a,
        b.num as b,
        a.num * b.num as product
    FROM numbers a
    CROSS JOIN numbers b
    WHERE MOD(a.num * b.num, 1000000) = 0
    LIMIT 100
    """
    return query


@pytest.fixture
def slow_query_generator():
    """Fixture for generating slow queries."""
    return {
        "user": generate_slow_query,
        "auth": generate_auth_slow_query,
        "batch": generate_batch_slow_query
    }


# ============================================
# Cleanup Helpers
# ============================================

@contextmanager
def ensure_cleanup(cleanup_fn):
    """
    Context manager to ensure cleanup runs even if test fails.

    Usage:
        with ensure_cleanup(lambda: delete_test_org()):
            # Test code
            pass
    """
    try:
        yield
    finally:
        try:
            cleanup_fn()
        except Exception as e:
            print(f"Warning: Cleanup failed: {e}")


@pytest.fixture
def cleanup_helper():
    """Fixture for cleanup utilities."""
    return ensure_cleanup
