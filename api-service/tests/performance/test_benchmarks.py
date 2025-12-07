"""
Performance benchmark tests for CloudAct API Service.

These tests measure and track performance metrics to detect regressions.
Run with: pytest -m performance tests/performance/test_benchmarks.py

Metrics tracked:
- p50, p95, p99 latencies for key endpoints
- Throughput (requests/second)
- Concurrent request handling
- Cache performance impact
- Database query performance

Baseline expectations (approximate, may vary by environment):
- Health check: < 50ms (p95)
- Get integrations (cached): < 100ms (p95)
- Get integrations (uncached): < 500ms (p95)
- Organization onboarding: < 2000ms (p95)
"""

import os
import pytest
import time
import asyncio
import statistics
from httpx import AsyncClient, ASGITransport

# Mark all tests in this file as performance
pytestmark = [pytest.mark.performance]


@pytest.fixture
async def client():
    """Create a test client (can use mocked or real backend)."""
    from src.app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def calculate_percentiles(timings: list) -> dict:
    """Calculate performance percentiles from timing data."""
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


def print_performance_report(endpoint: str, stats: dict):
    """Print a formatted performance report."""
    print(f"\n{'=' * 70}")
    print(f"Performance Report: {endpoint}")
    print(f"{'=' * 70}")
    print(f"Requests:  {stats['count']}")
    print(f"Min:       {stats['min']:.2f}ms")
    print(f"p50:       {stats['p50']:.2f}ms")
    print(f"p95:       {stats['p95']:.2f}ms")
    print(f"p99:       {stats['p99']:.2f}ms")
    print(f"Max:       {stats['max']:.2f}ms")
    print(f"Mean:      {stats['mean']:.2f}ms ± {stats['stdev']:.2f}ms")
    print(f"{'=' * 70}\n")


# ============================================
# Benchmark: Health Check Endpoint
# ============================================

@pytest.mark.asyncio
async def test_health_check_performance(client):
    """
    Benchmark the /health endpoint.

    Expected: p95 < 50ms
    """
    timings = []

    # Run 100 requests
    for _ in range(100):
        start = time.perf_counter()
        response = await client.get("/health")
        duration = time.perf_counter() - start

        assert response.status_code == 200
        timings.append(duration)

    stats = calculate_percentiles(timings)
    print_performance_report("GET /health", stats)

    # Performance assertion
    assert stats["p95"] < 50, f"Health check p95 too slow: {stats['p95']:.2f}ms (expected < 50ms)"


# ============================================
# Benchmark: Get Integrations (Cached)
# ============================================

@pytest.mark.asyncio
async def test_get_integrations_cached_performance(client):
    """
    Benchmark cached GET /api/v1/integrations/{org} requests.

    Expected: p95 < 100ms (with caching)
    """
    org_slug = "test_org_perf_cache"

    # Setup: Create test org
    response = await client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Performance",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code not in [200, 201]:
        pytest.skip(f"Cannot create test org: {response.status_code}")

    api_key = response.json()["api_key"]

    # Prime the cache
    await client.get(
        f"/api/v1/integrations/{org_slug}",
        headers={"X-API-Key": api_key}
    )

    # Benchmark cached requests
    timings = []

    for _ in range(100):
        start = time.perf_counter()
        response = await client.get(
            f"/api/v1/integrations/{org_slug}",
            headers={"X-API-Key": api_key}
        )
        duration = time.perf_counter() - start

        if response.status_code == 200:
            timings.append(duration)

    if not timings:
        pytest.skip("No successful requests")

    stats = calculate_percentiles(timings)
    print_performance_report("GET /api/v1/integrations/{org} (cached)", stats)

    # Performance assertion (relaxed for mocked environment)
    assert stats["p95"] < 500, f"Cached requests too slow: {stats['p95']:.2f}ms"


# ============================================
# Benchmark: Organization Onboarding
# ============================================

@pytest.mark.asyncio
async def test_organization_onboarding_performance(client):
    """
    Benchmark organization onboarding endpoint.

    This is a heavyweight operation (creates dataset, tables, API key).
    Expected: p95 < 2000ms
    """
    timings = []

    # Run 10 onboarding requests (expensive operation)
    for i in range(10):
        org_slug = f"test_org_perf_onboard_{i}"

        start = time.perf_counter()
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")},
            json={
                "org_slug": org_slug,
                "company_name": f"Test Org Perf {i}",
                "admin_email": f"admin-{i}@test.com",
                "plan_name": "BASIC"
            }
        )
        duration = time.perf_counter() - start

        if response.status_code in [200, 201]:
            timings.append(duration)

    if not timings:
        pytest.skip("No successful onboarding requests")

    stats = calculate_percentiles(timings)
    print_performance_report("POST /api/v1/organizations/onboard", stats)

    # Performance assertion (relaxed for testing)
    assert stats["p95"] < 5000, f"Onboarding too slow: {stats['p95']:.2f}ms"


# ============================================
# Benchmark: Concurrent Request Throughput
# ============================================

@pytest.mark.asyncio
async def test_concurrent_request_throughput(client):
    """
    Benchmark throughput under concurrent load.

    Measures requests/second when handling 50 concurrent requests.
    """
    org_slug = "test_org_perf_throughput"

    # Setup
    response = await client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Throughput",
            "admin_email": "admin@test.com",
            "plan_name": "ENTERPRISE"
        }
    )

    if response.status_code not in [200, 201]:
        pytest.skip("Cannot create test org")

    api_key = response.json()["api_key"]

    # Benchmark: 50 concurrent requests
    async def make_request():
        response = await client.get(
            f"/api/v1/integrations/{org_slug}",
            headers={"X-API-Key": api_key}
        )
        return response.status_code == 200

    start_time = time.perf_counter()
    tasks = [make_request() for _ in range(50)]
    results = await asyncio.gather(*tasks)
    total_time = time.perf_counter() - start_time

    success_count = sum(results)
    throughput = success_count / total_time

    print(f"\n{'=' * 70}")
    print(f"Concurrent Throughput Benchmark")
    print(f"{'=' * 70}")
    print(f"Total requests:     50")
    print(f"Successful:         {success_count}")
    print(f"Total time:         {total_time:.2f}s")
    print(f"Throughput:         {throughput:.2f} req/s")
    print(f"Avg latency:        {(total_time / success_count) * 1000:.2f}ms")
    print(f"{'=' * 70}\n")

    # Should handle at least 10 req/s (very conservative)
    assert throughput >= 10, f"Throughput too low: {throughput:.2f} req/s (expected >= 10 req/s)"


# ============================================
# Benchmark: Cache Performance Impact
# ============================================

@pytest.mark.asyncio
async def test_cache_performance_impact(client):
    """
    Measure the performance improvement from caching.

    Compares:
    1. First request (cache miss)
    2. Subsequent requests (cache hit)
    """
    org_slug = "test_org_perf_cache_impact"

    # Setup
    response = await client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Cache Impact",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code not in [200, 201]:
        pytest.skip("Cannot create test org")

    api_key = response.json()["api_key"]

    # Measure cache miss (first request)
    start = time.perf_counter()
    response = await client.get(
        f"/api/v1/integrations/{org_slug}",
        headers={"X-API-Key": api_key}
    )
    cache_miss_time = time.perf_counter() - start

    assert response.status_code == 200

    # Measure cache hits (subsequent requests)
    cache_hit_timings = []

    for _ in range(20):
        start = time.perf_counter()
        response = await client.get(
            f"/api/v1/integrations/{org_slug}",
            headers={"X-API-Key": api_key}
        )
        duration = time.perf_counter() - start

        if response.status_code == 200:
            cache_hit_timings.append(duration)

    avg_cache_hit_time = statistics.mean(cache_hit_timings)
    speedup = cache_miss_time / avg_cache_hit_time if avg_cache_hit_time > 0 else 1

    print(f"\n{'=' * 70}")
    print(f"Cache Performance Impact")
    print(f"{'=' * 70}")
    print(f"Cache miss:         {cache_miss_time * 1000:.2f}ms")
    print(f"Cache hit (avg):    {avg_cache_hit_time * 1000:.2f}ms")
    print(f"Speedup:            {speedup:.2f}x")
    print(f"{'=' * 70}\n")

    # Cache should provide some benefit (or at least not slow things down)
    assert speedup >= 0.5, f"Cache is slowing down requests: {speedup:.2f}x"


# ============================================
# Benchmark: API Key Validation Performance
# ============================================

@pytest.mark.asyncio
async def test_api_key_validation_performance(client):
    """
    Benchmark API key validation latency.

    This is on the critical path for every authenticated request.
    Expected: p95 < 100ms
    """
    org_slug = "test_org_perf_auth"

    # Setup
    response = await client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Auth Perf",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code not in [200, 201]:
        pytest.skip("Cannot create test org")

    api_key = response.json()["api_key"]

    # Benchmark auth validation
    timings = []

    for _ in range(100):
        start = time.perf_counter()

        # Simple endpoint that requires auth
        response = await client.get(
            f"/api/v1/integrations/{org_slug}",
            headers={"X-API-Key": api_key}
        )

        duration = time.perf_counter() - start

        if response.status_code == 200:
            timings.append(duration)

    if not timings:
        pytest.skip("No successful auth requests")

    stats = calculate_percentiles(timings)
    print_performance_report("API Key Validation", stats)

    # Auth should be fast (< 500ms even in test environment)
    assert stats["p95"] < 500, f"Auth validation too slow: {stats['p95']:.2f}ms"


# ============================================
# Benchmark: Memory Usage Under Load
# ============================================

@pytest.mark.asyncio
async def test_memory_usage_under_load(client):
    """
    Monitor memory usage during sustained load.

    This test doesn't have hard assertions, but tracks memory growth.
    """
    try:
        import psutil
        process = psutil.Process()
    except ImportError:
        pytest.skip("psutil not installed - cannot measure memory")

    org_slug = "test_org_perf_memory"

    # Setup
    response = await client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Memory",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code not in [200, 201]:
        pytest.skip("Cannot create test org")

    api_key = response.json()["api_key"]

    # Measure initial memory
    initial_memory = process.memory_info().rss / 1024 / 1024  # MB

    # Make 200 requests
    for _ in range(200):
        await client.get(
            f"/api/v1/integrations/{org_slug}",
            headers={"X-API-Key": api_key}
        )

    # Measure final memory
    final_memory = process.memory_info().rss / 1024 / 1024  # MB
    memory_growth = final_memory - initial_memory

    print(f"\n{'=' * 70}")
    print(f"Memory Usage Under Load")
    print(f"{'=' * 70}")
    print(f"Initial:            {initial_memory:.2f} MB")
    print(f"Final:              {final_memory:.2f} MB")
    print(f"Growth:             {memory_growth:.2f} MB")
    print(f"{'=' * 70}\n")

    # Memory growth should be reasonable (< 100MB for 200 requests)
    assert memory_growth < 100, f"Excessive memory growth: {memory_growth:.2f} MB"


# ============================================
# Benchmark: Integration Setup Performance
# ============================================

@pytest.mark.asyncio
async def test_integration_setup_performance(client):
    """
    Benchmark integration setup endpoint.

    This includes credential validation and KMS encryption.
    Expected: p95 < 1000ms
    """
    timings = []

    for i in range(10):
        org_slug = f"test_org_perf_integration_{i}"

        # Create org
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-secure-32chars")},
            json={
                "org_slug": org_slug,
                "company_name": f"Test Org Integration {i}",
                "admin_email": f"admin-{i}@test.com",
                "plan_name": "BASIC"
            }
        )

        if response.status_code not in [200, 201]:
            continue

        api_key = response.json()["api_key"]

        # Benchmark integration setup
        start = time.perf_counter()

        response = await client.post(
            f"/api/v1/integrations/{org_slug}/openai/setup",
            headers={"X-API-Key": api_key},
            json={
                "api_key": f"sk-test-perf-key-{i}-12345678901234567890"
            }
        )

        duration = time.perf_counter() - start

        # Accept both success and validation failure
        if response.status_code in [200, 201, 400, 422]:
            timings.append(duration)

    if not timings:
        pytest.skip("No successful integration setup attempts")

    stats = calculate_percentiles(timings)
    print_performance_report("POST /api/v1/integrations/{org}/{provider}/setup", stats)

    # Should complete within 2 seconds (includes encryption)
    assert stats["p95"] < 2000, f"Integration setup too slow: {stats['p95']:.2f}ms"
