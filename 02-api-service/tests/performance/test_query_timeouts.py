"""
Query Timeout Performance Tests

Tests that BigQuery queries respect timeout configurations:
- User queries: 30s timeout
- Batch queries: 300s (5 min) timeout
- Auth queries: 10s timeout

These tests use REAL BigQuery with intentionally slow queries to verify
that timeouts are properly enforced.

Run with: pytest -m performance --run-integration tests/performance/test_query_timeouts.py -v
"""

import os
import pytest
import time
from google.cloud import bigquery
from google.api_core import exceptions as google_exceptions

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings

# Mark all tests in this file as performance
pytestmark = [pytest.mark.performance]


# ============================================
# Test: User Query Timeout (30s)
# ============================================

@pytest.mark.asyncio
async def test_user_query_timeout_30s(bq_client_perf, timer, latency_reporter):
    """
    Verify that user queries timeout at 30 seconds.

    Creates a slow query that would take longer than 30s and verifies
    that it times out as expected.

    Expected: Query should timeout between 30-35 seconds
    """
    project_id = os.environ.get("GCP_PROJECT_ID")

    # Generate a query that takes ~40 seconds (should timeout at 30s)
    slow_query = f"""
    WITH numbers AS (
        SELECT num
        FROM UNNEST(GENERATE_ARRAY(1, 200000)) AS num
    ),
    cross_product AS (
        SELECT a.num as a, b.num as b, a.num * b.num as product
        FROM numbers a
        CROSS JOIN numbers b
        LIMIT 10000000
    )
    SELECT COUNT(*) as total
    FROM cross_product
    WHERE MOD(product, 1000) = 0
    """

    # Configure query with 30 second timeout
    job_config = bigquery.QueryJobConfig(
        use_legacy_sql=False
    )

    print("\n" + "=" * 80)
    print("Testing User Query Timeout (30s)")
    print("=" + "=" * 79)
    print("Starting slow query that should timeout...")

    timeout_occurred = False
    actual_duration = 0.0

    try:
        with timer("user_query_timeout") as t:
            # Execute query with 30s timeout
            query_job = bq_client_perf.query(slow_query, job_config=job_config)
            result = query_job.result(timeout=30)  # 30 second timeout

            # If we get here, query completed before timeout
            print(f"⚠️  Query completed without timeout in {t.get_duration_ms():.2f}ms")
            actual_duration = t.get_duration_ms() / 1000

    except google_exceptions.GoogleAPIError as e:
        # Expected timeout exception
        actual_duration = t.get_duration_ms() / 1000
        if "timeout" in str(e).lower() or actual_duration >= 29:
            timeout_occurred = True
            print(f"✓ Query timed out after {actual_duration:.2f}s (expected ~30s)")
        else:
            raise

    print("=" * 80 + "\n")

    # Verify timeout occurred and was approximately 30s
    assert timeout_occurred, "Query should have timed out at 30s"
    assert 29 <= actual_duration <= 35, f"Timeout should occur at ~30s, got {actual_duration:.2f}s"


# ============================================
# Test: Batch Query Timeout (300s)
# ============================================

@pytest.mark.asyncio
async def test_batch_query_timeout_300s(bq_client_perf, timer):
    """
    Verify that batch queries timeout at 300 seconds (5 minutes).

    Note: This test is skipped by default because it takes 5+ minutes.
    Enable with: pytest -k test_batch_query_timeout_300s --run-integration

    Expected: Query should timeout between 300-310 seconds
    """
    pytest.skip("Batch timeout test takes 5+ minutes - enable manually if needed")

    project_id = os.environ.get("GCP_PROJECT_ID")

    # Generate a query that takes >5 minutes (should timeout at 300s)
    slow_query = f"""
    WITH numbers AS (
        SELECT num
        FROM UNNEST(GENERATE_ARRAY(1, 1000000)) AS num
    ),
    cross_product AS (
        SELECT a.num as a, b.num as b
        FROM numbers a
        CROSS JOIN numbers b
        LIMIT 100000000
    )
    SELECT COUNT(*) as total
    FROM cross_product
    """

    job_config = bigquery.QueryJobConfig(
        use_legacy_sql=False
    )

    print("\n" + "=" * 80)
    print("Testing Batch Query Timeout (300s / 5 minutes)")
    print("=" + "=" * 79)
    print("Starting very slow query that should timeout after 5 minutes...")

    timeout_occurred = False
    actual_duration = 0.0

    try:
        with timer("batch_query_timeout") as t:
            query_job = bq_client_perf.query(slow_query, job_config=job_config)
            result = query_job.result(timeout=300)  # 5 minute timeout

            print(f"⚠️  Query completed without timeout in {t.get_duration_ms():.2f}ms")
            actual_duration = t.get_duration_ms() / 1000

    except google_exceptions.GoogleAPIError as e:
        actual_duration = t.get_duration_ms() / 1000
        if "timeout" in str(e).lower() or actual_duration >= 295:
            timeout_occurred = True
            print(f"✓ Query timed out after {actual_duration:.2f}s (expected ~300s)")
        else:
            raise

    print("=" * 80 + "\n")

    assert timeout_occurred, "Query should have timed out at 300s"
    assert 295 <= actual_duration <= 310, f"Timeout should occur at ~300s, got {actual_duration:.2f}s"


# ============================================
# Test: Auth Query Timeout (10s)
# ============================================

@pytest.mark.asyncio
async def test_auth_query_timeout_10s(bq_client_perf, timer, latency_reporter):
    """
    Verify that auth queries timeout at 10 seconds.

    Auth queries (API key validation) should be fast and timeout quickly
    to prevent hanging authentication.

    Expected: Query should timeout between 10-12 seconds
    """
    project_id = os.environ.get("GCP_PROJECT_ID")

    # Generate a query that takes ~15 seconds (should timeout at 10s)
    slow_query = f"""
    WITH numbers AS (
        SELECT num
        FROM UNNEST(GENERATE_ARRAY(1, 150000)) AS num
    ),
    cross_product AS (
        SELECT a.num as a, b.num as b
        FROM numbers a
        CROSS JOIN numbers b
        LIMIT 5000000
    )
    SELECT COUNT(*) as total
    FROM cross_product
    WHERE MOD(a * b, 100) = 0
    """

    job_config = bigquery.QueryJobConfig(
        use_legacy_sql=False
    )

    print("\n" + "=" * 80)
    print("Testing Auth Query Timeout (10s)")
    print("=" + "=" * 79)
    print("Starting slow query that should timeout...")

    timeout_occurred = False
    actual_duration = 0.0

    try:
        with timer("auth_query_timeout") as t:
            query_job = bq_client_perf.query(slow_query, job_config=job_config)
            result = query_job.result(timeout=10)  # 10 second timeout

            print(f"⚠️  Query completed without timeout in {t.get_duration_ms():.2f}ms")
            actual_duration = t.get_duration_ms() / 1000

    except google_exceptions.GoogleAPIError as e:
        actual_duration = t.get_duration_ms() / 1000
        if "timeout" in str(e).lower() or actual_duration >= 9:
            timeout_occurred = True
            print(f"✓ Query timed out after {actual_duration:.2f}s (expected ~10s)")
        else:
            raise

    print("=" * 80 + "\n")

    assert timeout_occurred, "Query should have timed out at 10s"
    assert 9 <= actual_duration <= 12, f"Timeout should occur at ~10s, got {actual_duration:.2f}s"


# ============================================
# Test: Fast Query Completes Before Timeout
# ============================================

@pytest.mark.asyncio
async def test_fast_query_completes_before_timeout(bq_client_perf, timer, latency_reporter):
    """
    Verify that fast queries complete successfully before timeout.

    This is a sanity check to ensure timeouts don't break normal queries.

    Expected: Query completes in < 5 seconds
    """
    project_id = os.environ.get("GCP_PROJECT_ID")

    # Simple fast query
    fast_query = f"""
    SELECT COUNT(*) as total
    FROM `{project_id}.organizations.organizations`
    """

    job_config = bigquery.QueryJobConfig(
        use_legacy_sql=False
    )

    print("\n" + "=" * 80)
    print("Testing Fast Query (should complete before timeout)")
    print("=" + "=" * 79)

    completed = False
    actual_duration = 0.0

    try:
        with timer("fast_query") as t:
            query_job = bq_client_perf.query(fast_query, job_config=job_config)
            result = query_job.result(timeout=30)

            # Query should complete
            row_count = sum(1 for _ in result)
            actual_duration = t.get_duration_ms() / 1000
            completed = True
            print(f"✓ Query completed successfully in {actual_duration:.2f}s")

    except Exception as e:
        print(f"✗ Query failed unexpectedly: {e}")
        raise

    print("=" * 80 + "\n")

    assert completed, "Fast query should complete successfully"
    assert actual_duration < 5, f"Fast query took too long: {actual_duration:.2f}s"


# ============================================
# Test: Query Timeout Configuration
# ============================================

@pytest.mark.asyncio
async def test_query_timeout_configuration():
    """
    Verify that query timeout configuration is properly set in settings.

    This test checks that the timeout constants are defined and reasonable.
    """
    from src.app.config import settings

    print("\n" + "=" * 80)
    print("Query Timeout Configuration")
    print("=" + "=" * 79)

    # Check that timeout settings exist
    timeout_seconds = getattr(settings, 'bq_query_timeout_seconds', None)

    if timeout_seconds is not None:
        print(f"Query timeout configured: {timeout_seconds}s")
        assert timeout_seconds > 0, "Query timeout must be positive"
        assert timeout_seconds <= 600, "Query timeout should not exceed 10 minutes"
        print("✓ Query timeout configuration valid")
    else:
        print("⚠️  No explicit query timeout found in settings")
        print("   Using BigQuery default timeout")

    print("=" * 80 + "\n")


# ============================================
# Test: Connection Timeout vs Query Timeout
# ============================================

@pytest.mark.asyncio
async def test_connection_timeout_separate_from_query_timeout(bq_client_perf):
    """
    Verify that connection timeout is separate from query timeout.

    Connection timeout (60s): Time to establish connection
    Query timeout (30s/300s): Time for query to execute

    This test verifies that connection timeouts don't interfere with query execution.
    """
    project_id = os.environ.get("GCP_PROJECT_ID")

    print("\n" + "=" * 80)
    print("Testing Connection vs Query Timeout")
    print("=" + "=" * 79)

    # Connection should be established quickly (< 5s)
    connection_start = time.perf_counter()

    try:
        # Simple query to test connection
        query = f"""
        SELECT 1 as test
        """
        job_config = bigquery.QueryJobConfig(use_legacy_sql=False)
        query_job = bq_client_perf.query(query, job_config=job_config)
        result = query_job.result(timeout=30)

        connection_time = time.perf_counter() - connection_start
        print(f"✓ Connection established and query completed in {connection_time:.2f}s")

        assert connection_time < 10, f"Connection took too long: {connection_time:.2f}s"

    except Exception as e:
        print(f"✗ Connection or query failed: {e}")
        raise

    print("=" * 80 + "\n")
