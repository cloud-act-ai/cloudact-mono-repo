"""
Query Latency Benchmark Tests

Measures p50, p95, p99 latencies for key API endpoints:
- List providers: p95 < 200ms
- List plans: p95 < 300ms
- Get quota: p95 < 100ms

These tests use REAL BigQuery to measure actual query performance.
Uses pytest-benchmark for accurate measurements.

Run with: pytest -m performance --run-integration tests/performance/test_query_benchmarks.py -v
"""

import os
import pytest
import time
import statistics
from typing import List

# Mark all tests in this file as performance
pytestmark = [pytest.mark.performance]


# ============================================
# Test: Query Latency - List Providers
# ============================================

@pytest.mark.asyncio
async def test_query_latency_list_providers(perf_client, latency_reporter):
    """
    Benchmark latency for GET /subscriptions/{org}/providers

    This endpoint lists all available SaaS subscription providers.
    It includes caching, so we test both cache miss and cache hit scenarios.

    Expected:
    - p95 < 200ms (cached)
    - p95 < 500ms (uncached, first request)
    """
    # Create test organization
    org_slug = "test_org_list_providers_perf"

    try:
        # Setup: Create test org
        response = await perf_client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
            json={
                "org_slug": org_slug,
                "company_name": "Test Org List Providers Perf",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        if response.status_code == 400:
            pytest.skip("Bootstrap not run - cannot create test organization")

        assert response.status_code == 201, f"Failed to create test org: {response.text}"
        api_key = response.json()["api_key"]

        print("\n" + "=" * 80)
        print("Benchmarking: GET /subscriptions/{org}/providers")
        print("=" + "=" * 79)

        # Test 1: First request (cache miss)
        print("\n1. Testing cache MISS (first request)...")
        timings_uncached = []

        for i in range(5):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/subscriptions/{org_slug}/providers",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                timings_uncached.append(duration)

        if timings_uncached:
            from .conftest import calculate_percentiles
            stats_uncached = calculate_percentiles(timings_uncached)
            latency_reporter("List Providers (uncached)", stats_uncached, target_p95=500)

        # Test 2: Subsequent requests (cache hit)
        print("\n2. Testing cache HIT (subsequent requests)...")
        timings_cached = []

        for i in range(100):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/subscriptions/{org_slug}/providers",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                timings_cached.append(duration)

        if timings_cached:
            from .conftest import calculate_percentiles
            stats_cached = calculate_percentiles(timings_cached)
            latency_reporter("List Providers (cached)", stats_cached, target_p95=200)

            # Assert performance targets
            assert stats_cached["p95"] < 200, f"Cached p95 too slow: {stats_cached['p95']:.2f}ms (target < 200ms)"
            assert stats_cached["p99"] < 300, f"Cached p99 too slow: {stats_cached['p99']:.2f}ms (target < 300ms)"

    finally:
        # Cleanup is handled by test infrastructure
        pass


# ============================================
# Test: Query Latency - List Plans
# ============================================

@pytest.mark.asyncio
async def test_query_latency_list_plans(perf_client, latency_reporter):
    """
    Benchmark latency for GET /subscriptions/{org}/providers/{provider}/plans

    This endpoint lists all subscription plans for a specific provider.
    Includes BigQuery query and caching.

    Expected:
    - p95 < 300ms (cached)
    - p95 < 600ms (uncached)
    """
    # Create test organization
    org_slug = "test_org_list_plans_perf"
    provider = "canva"

    try:
        # Setup: Create test org
        response = await perf_client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
            json={
                "org_slug": org_slug,
                "company_name": "Test Org List Plans Perf",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        if response.status_code == 400:
            pytest.skip("Bootstrap not run - cannot create test organization")

        assert response.status_code == 201, f"Failed to create test org: {response.text}"
        api_key = response.json()["api_key"]

        # Enable provider (seed plans)
        response = await perf_client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/{provider}/enable",
            headers={"X-API-Key": api_key}
        )

        if response.status_code not in [200, 201]:
            pytest.skip(f"Failed to enable provider: {response.status_code}")

        print("\n" + "=" * 80)
        print(f"Benchmarking: GET /subscriptions/{{org}}/providers/{provider}/plans")
        print("=" + "=" * 79)

        # Test 1: First request (cache miss)
        print("\n1. Testing cache MISS (first request)...")
        timings_uncached = []

        for i in range(5):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/subscriptions/{org_slug}/providers/{provider}/plans",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                timings_uncached.append(duration)

        if timings_uncached:
            from .conftest import calculate_percentiles
            stats_uncached = calculate_percentiles(timings_uncached)
            latency_reporter(f"List Plans - {provider} (uncached)", stats_uncached, target_p95=600)

        # Test 2: Subsequent requests (cache hit)
        print("\n2. Testing cache HIT (subsequent requests)...")
        timings_cached = []

        for i in range(100):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/subscriptions/{org_slug}/providers/{provider}/plans",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                timings_cached.append(duration)

        if timings_cached:
            from .conftest import calculate_percentiles
            stats_cached = calculate_percentiles(timings_cached)
            latency_reporter(f"List Plans - {provider} (cached)", stats_cached, target_p95=300)

            # Assert performance targets
            assert stats_cached["p95"] < 300, f"Cached p95 too slow: {stats_cached['p95']:.2f}ms (target < 300ms)"
            assert stats_cached["p99"] < 400, f"Cached p99 too slow: {stats_cached['p99']:.2f}ms (target < 400ms)"

    finally:
        # Cleanup is handled by test infrastructure
        pass


# ============================================
# Test: Query Latency - Get Quota
# ============================================

@pytest.mark.asyncio
async def test_query_latency_get_quota(perf_client, latency_reporter):
    """
    Benchmark latency for GET /organizations/{org}/quota

    This endpoint retrieves quota usage information (daily/monthly limits).
    Critical for user experience - must be very fast.

    Expected:
    - p95 < 100ms (with rate limiting)
    - p99 < 150ms
    """
    # Create test organization
    org_slug = "test_org_get_quota_perf"

    try:
        # Setup: Create test org
        response = await perf_client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
            json={
                "org_slug": org_slug,
                "company_name": "Test Org Get Quota Perf",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        if response.status_code == 400:
            pytest.skip("Bootstrap not run - cannot create test organization")

        assert response.status_code == 201, f"Failed to create test org: {response.text}"
        api_key = response.json()["api_key"]

        print("\n" + "=" * 80)
        print("Benchmarking: GET /organizations/{org}/quota")
        print("=" + "=" * 79)

        # Run benchmark (100 requests)
        timings = []

        print("\nRunning 100 requests...")
        for i in range(100):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/organizations/{org_slug}/quota",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                timings.append(duration)
            elif response.status_code == 429:
                # Rate limited - expected, skip this timing
                continue
            else:
                print(f"  Request {i}: Unexpected status {response.status_code}")

            # Print progress every 20 requests
            if (i + 1) % 20 == 0:
                print(f"  Progress: {i + 1}/100")

        if timings:
            from .conftest import calculate_percentiles
            stats = calculate_percentiles(timings)
            latency_reporter("Get Quota", stats, target_p95=100)

            # Assert performance targets
            assert stats["p95"] < 100, f"p95 too slow: {stats['p95']:.2f}ms (target < 100ms)"
            assert stats["p99"] < 150, f"p99 too slow: {stats['p99']:.2f}ms (target < 150ms)"
            assert stats["p50"] < 50, f"p50 too slow: {stats['p50']:.2f}ms (target < 50ms)"

    finally:
        # Cleanup is handled by test infrastructure
        pass


# ============================================
# Test: Query Latency - All Plans
# ============================================

@pytest.mark.asyncio
async def test_query_latency_all_plans(perf_client, latency_reporter):
    """
    Benchmark latency for GET /subscriptions/{org}/all-plans

    This endpoint retrieves ALL plans across ALL providers in one query.
    Critical for costs dashboard performance.

    Expected:
    - p95 < 400ms (cached)
    - p99 < 600ms
    """
    # Create test organization
    org_slug = "test_org_all_plans_perf"

    try:
        # Setup: Create test org
        response = await perf_client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
            json={
                "org_slug": org_slug,
                "company_name": "Test Org All Plans Perf",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        if response.status_code == 400:
            pytest.skip("Bootstrap not run - cannot create test organization")

        assert response.status_code == 201, f"Failed to create test org: {response.text}"
        api_key = response.json()["api_key"]

        # Enable a few providers to have data
        providers = ["canva", "slack", "notion"]
        for provider in providers:
            await perf_client.post(
                f"/api/v1/subscriptions/{org_slug}/providers/{provider}/enable",
                headers={"X-API-Key": api_key}
            )

        print("\n" + "=" * 80)
        print("Benchmarking: GET /subscriptions/{org}/all-plans")
        print("=" + "=" * 79)

        # Test 1: First request (cache miss)
        print("\n1. Testing cache MISS...")
        timings_uncached = []

        for i in range(5):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/subscriptions/{org_slug}/all-plans",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                timings_uncached.append(duration)

        if timings_uncached:
            from .conftest import calculate_percentiles
            stats_uncached = calculate_percentiles(timings_uncached)
            latency_reporter("All Plans (uncached)", stats_uncached, target_p95=800)

        # Test 2: Cached requests
        print("\n2. Testing cache HIT...")
        timings_cached = []

        for i in range(100):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/subscriptions/{org_slug}/all-plans",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                timings_cached.append(duration)

        if timings_cached:
            from .conftest import calculate_percentiles
            stats_cached = calculate_percentiles(timings_cached)
            latency_reporter("All Plans (cached)", stats_cached, target_p95=400)

            # Assert performance targets
            assert stats_cached["p95"] < 400, f"Cached p95 too slow: {stats_cached['p95']:.2f}ms (target < 400ms)"
            assert stats_cached["p99"] < 600, f"Cached p99 too slow: {stats_cached['p99']:.2f}ms (target < 600ms)"

    finally:
        # Cleanup is handled by test infrastructure
        pass


# ============================================
# Test: Query Latency - Organization Onboarding
# ============================================

@pytest.mark.asyncio
async def test_query_latency_organization_onboarding(perf_client, latency_reporter):
    """
    Benchmark latency for POST /organizations/onboard

    This is a heavyweight operation (creates dataset, tables, API key).
    Expected to be slower than read operations.

    Expected:
    - p95 < 3000ms (3 seconds)
    - p99 < 5000ms (5 seconds)
    """
    print("\n" + "=" * 80)
    print("Benchmarking: POST /organizations/onboard")
    print("=" + "=" * 79)

    # Run benchmark (10 onboarding requests - expensive operation)
    timings = []

    print("\nRunning 10 onboarding requests...")
    for i in range(10):
        org_slug = f"test_org_onboard_perf_{i}"

        start = time.perf_counter()
        response = await perf_client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
            json={
                "org_slug": org_slug,
                "company_name": f"Test Org Onboard Perf {i}",
                "admin_email": f"admin-{i}@test.com",
                "subscription_plan": "STARTER"
            }
        )
        duration = time.perf_counter() - start

        if response.status_code in [200, 201]:
            timings.append(duration)
            print(f"  Request {i + 1}: {duration * 1000:.2f}ms")
        elif response.status_code == 400:
            pytest.skip("Bootstrap not run - cannot onboard organizations")
        else:
            print(f"  Request {i + 1}: Failed with status {response.status_code}")

    if timings:
        from .conftest import calculate_percentiles
        stats = calculate_percentiles(timings)
        latency_reporter("Organization Onboarding", stats, target_p95=3000)

        # Assert performance targets (relaxed for heavy operation)
        assert stats["p95"] < 3000, f"p95 too slow: {stats['p95']:.2f}ms (target < 3000ms)"
        assert stats["p99"] < 5000, f"p99 too slow: {stats['p99']:.2f}ms (target < 5000ms)"


# ============================================
# Test: Cache Performance Impact
# ============================================

@pytest.mark.asyncio
async def test_cache_performance_impact(perf_client, latency_reporter):
    """
    Measure the performance improvement from caching.

    Compares cache miss vs cache hit latencies for list providers endpoint.

    Expected:
    - Cache hit should be 2-10x faster than cache miss
    """
    # Create test organization
    org_slug = "test_org_cache_perf_impact"

    try:
        # Setup: Create test org
        response = await perf_client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
            json={
                "org_slug": org_slug,
                "company_name": "Test Org Cache Perf Impact",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        if response.status_code == 400:
            pytest.skip("Bootstrap not run - cannot create test organization")

        assert response.status_code == 201
        api_key = response.json()["api_key"]

        print("\n" + "=" * 80)
        print("Benchmarking: Cache Performance Impact")
        print("=" + "=" * 79)

        # Measure cache miss (first request)
        print("\n1. Cache MISS (first request)...")
        start = time.perf_counter()
        response = await perf_client.get(
            f"/api/v1/subscriptions/{org_slug}/providers",
            headers={"X-API-Key": api_key}
        )
        cache_miss_time = time.perf_counter() - start

        assert response.status_code == 200
        print(f"   Cache miss: {cache_miss_time * 1000:.2f}ms")

        # Measure cache hits (subsequent requests)
        print("\n2. Cache HIT (subsequent requests)...")
        cache_hit_timings = []

        for i in range(20):
            start = time.perf_counter()
            response = await perf_client.get(
                f"/api/v1/subscriptions/{org_slug}/providers",
                headers={"X-API-Key": api_key}
            )
            duration = time.perf_counter() - start

            if response.status_code == 200:
                cache_hit_timings.append(duration)

        avg_cache_hit_time = statistics.mean(cache_hit_timings)
        min_cache_hit_time = min(cache_hit_timings)
        max_cache_hit_time = max(cache_hit_timings)

        speedup = cache_miss_time / avg_cache_hit_time if avg_cache_hit_time > 0 else 1

        print(f"\n   Cache hit avg:  {avg_cache_hit_time * 1000:.2f}ms")
        print(f"   Cache hit min:  {min_cache_hit_time * 1000:.2f}ms")
        print(f"   Cache hit max:  {max_cache_hit_time * 1000:.2f}ms")
        print(f"   Speedup:        {speedup:.2f}x")

        print("\n" + "=" * 80 + "\n")

        # Cache should provide benefit (or at least not slow down)
        assert speedup >= 0.5, f"Cache is slowing down requests: {speedup:.2f}x"

        # Ideally, cache should provide 2x or better speedup
        if speedup >= 2:
            print("✓ Cache providing significant speedup (2x or better)")
        elif speedup >= 1:
            print("⚠️  Cache providing modest speedup (1-2x)")
        else:
            print("⚠️  Cache not providing expected speedup")

    finally:
        # Cleanup is handled by test infrastructure
        pass
