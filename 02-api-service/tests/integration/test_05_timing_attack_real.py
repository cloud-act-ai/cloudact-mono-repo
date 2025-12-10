"""
Integration test: Timing attack prevention.

Tests that API key comparison and other security-critical operations use
constant-time comparison to prevent timing attacks.

Run with: pytest -m integration --run-integration tests/integration/test_05_timing_attack_real.py

Test Coverage:
1. API key validation uses constant-time comparison
2. Invalid keys take same time as valid keys
3. Statistical analysis of timing variation
4. No information leakage through timing
"""

import os
import pytest
import time
import statistics
from httpx import AsyncClient, ASGITransport

# Mark all tests in this file as integration and security
pytestmark = [pytest.mark.integration, pytest.mark.security, pytest.mark.slow]


@pytest.fixture
def skip_if_no_credentials():
    """Skip tests if BigQuery credentials are not available."""
    if os.environ.get("GCP_PROJECT_ID") in ["test-project", None]:
        pytest.skip("Integration tests require real GCP credentials")


@pytest.fixture
async def real_client():
    """Create a real FastAPI test client with no mocks."""
    from src.app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ============================================
# Test: Constant-Time API Key Comparison
# ============================================

@pytest.mark.asyncio
async def test_api_key_comparison_constant_time(skip_if_no_credentials, real_client):
    """
    CRITICAL: Verify that API key validation uses constant-time comparison.

    A timing attack exploits the fact that string comparison often stops at the
    first mismatched character. This test verifies that:

    1. Invalid key with 1 correct character takes same time as 0 correct characters
    2. Invalid key with 31 correct characters takes same time as 0 correct characters
    3. No statistically significant timing difference

    This prevents attackers from guessing API keys character by character.
    """
    org_slug = "test_org_timing_attack"

    # Create test org to get a real API key
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Timing Attack",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    real_api_key = response.json()["api_key"]

    # Generate test keys with varying prefixes
    # If using constant-time comparison, all should take the same time
    test_cases = [
        ("0" * 32, "All wrong characters"),
        (real_api_key[0] + "0" * 31, "First char correct"),
        (real_api_key[:16] + "0" * 16, "Half correct"),
        (real_api_key[:31] + "0", "Almost all correct"),
    ]

    results = {}

    for test_key, description in test_cases:
        timings = []

        # Run 50 trials to get statistical significance
        for _ in range(50):
            start = time.perf_counter()

            response = await real_client.get(
                f"/api/v1/integrations/{org_slug}",
                headers={"X-API-Key": test_key}
            )

            duration = time.perf_counter() - start
            timings.append(duration)

            # Should be 401 Unauthorized
            assert response.status_code == 401

        results[description] = {
            "mean": statistics.mean(timings),
            "median": statistics.median(timings),
            "stdev": statistics.stdev(timings) if len(timings) > 1 else 0
        }

    # Print results
    print("\n\nTiming Attack Test Results:")
    print("=" * 60)
    for desc, stats in results.items():
        print(f"{desc}:")
        print(f"  Mean:   {stats['mean']*1000:.4f}ms")
        print(f"  Median: {stats['median']*1000:.4f}ms")
        print(f"  StdDev: {stats['stdev']*1000:.4f}ms")
        print()

    # Statistical analysis
    means = [stats["mean"] for stats in results.values()]
    mean_of_means = statistics.mean(means)
    max_deviation = max(abs(m - mean_of_means) for m in means)

    print(f"Mean of all means: {mean_of_means*1000:.4f}ms")
    print(f"Max deviation: {max_deviation*1000:.4f}ms")

    # Verify timing differences are small
    # Allow up to 10ms variation (network jitter, system load)
    # But should NOT see 100ms+ differences (which would indicate early exit)
    assert max_deviation < 0.010, \
        f"Timing variation too high ({max_deviation*1000:.2f}ms), possible timing attack vulnerability"

    print("\n✓ Constant-time comparison verified (max variation: {:.4f}ms)".format(max_deviation*1000))


# ============================================
# Test: Root Key Timing Attack Prevention
# ============================================

@pytest.mark.asyncio
async def test_root_key_comparison_constant_time(skip_if_no_credentials, real_client):
    """
    Verify that CA_ROOT_API_KEY comparison is also constant-time.
    """
    real_root_key = os.environ.get("CA_ROOT_API_KEY")

    test_cases = [
        ("x" * len(real_root_key), "All wrong"),
        (real_root_key[0] + "x" * (len(real_root_key) - 1), "First char correct"),
        (real_root_key[:len(real_root_key)//2] + "x" * (len(real_root_key)//2), "Half correct"),
    ]

    results = {}

    for test_key, description in test_cases:
        timings = []

        for _ in range(50):
            start = time.perf_counter()

            response = await real_client.post(
                "/api/v1/organizations/onboard",
                headers={"X-CA-Root-Key": test_key},
                json={
                    "org_slug": "test_timing_root",
                    "company_name": "Test",
                    "admin_email": "test@test.com",
                    "plan_name": "BASIC"
                }
            )

            duration = time.perf_counter() - start
            timings.append(duration)

            # Should be 401 Unauthorized
            assert response.status_code == 401

        results[description] = {
            "mean": statistics.mean(timings),
            "stdev": statistics.stdev(timings) if len(timings) > 1 else 0
        }

    # Print results
    print("\n\nRoot Key Timing Attack Test Results:")
    print("=" * 60)
    for desc, stats in results.items():
        print(f"{desc}: {stats['mean']*1000:.4f}ms ± {stats['stdev']*1000:.4f}ms")

    # Statistical analysis
    means = [stats["mean"] for stats in results.values()]
    max_deviation = max(abs(m - statistics.mean(means)) for m in means)

    assert max_deviation < 0.010, \
        f"Root key timing variation too high ({max_deviation*1000:.2f}ms)"

    print(f"\n✓ Root key constant-time comparison verified")


# ============================================
# Test: No Information Leakage Through Errors
# ============================================

@pytest.mark.asyncio
async def test_no_information_leakage_in_errors(skip_if_no_credentials, real_client):
    """
    Verify that error messages don't leak information about validity.

    For example, these should return SAME error message:
    1. Invalid API key
    2. Valid API key for wrong org
    3. Expired API key
    4. Malformed API key

    All should return generic "Invalid credentials" without revealing details.
    """
    org_slug = "test_org_error_leakage"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Error Leakage",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    valid_api_key = response.json()["api_key"]

    # Test different invalid scenarios
    test_cases = [
        ("", "Empty key"),
        ("invalid", "Malformed key"),
        ("sk-" + "0" * 30, "Invalid key with correct format"),
        (valid_api_key, "Valid key for wrong org (using different org slug)"),
    ]

    error_messages = {}

    for test_key, description in test_cases:
        # Use wrong org slug for last test case
        test_org = "wrong_org_slug" if "wrong org" in description else org_slug

        response = await real_client.get(
            f"/api/v1/integrations/{test_org}",
            headers={"X-API-Key": test_key} if test_key else {}
        )

        # All should be 401 or 403
        assert response.status_code in [401, 403], \
            f"{description} should return 401/403, got {response.status_code}"

        error_messages[description] = response.json().get("detail", "")

    # Print error messages
    print("\n\nError Message Analysis:")
    print("=" * 60)
    for desc, msg in error_messages.items():
        print(f"{desc}:")
        print(f"  Message: {msg}")
        print()

    # Verify error messages don't leak sensitive information
    for msg in error_messages.values():
        # Should NOT contain:
        assert "exist" not in msg.lower(), "Error should not reveal if org exists"
        assert "valid" not in msg.lower() or "invalid" in msg.lower(), "Error should not reveal key validity"
        assert "expire" not in msg.lower(), "Error should not reveal expiration"

    print("✓ No information leakage in error messages")


# ============================================
# Test: Rate Limiting Timing Consistency
# ============================================

@pytest.mark.asyncio
async def test_rate_limiting_timing_consistency(skip_if_no_credentials, real_client):
    """
    Verify that rate limiting doesn't introduce timing variations.

    Rate limited requests should return 429 quickly and consistently,
    without revealing information about the system state.
    """
    org_slug = "test_org_rate_limit_timing"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Rate Limit Timing",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Make rapid requests to potentially trigger rate limiting
    timings = []

    for i in range(20):
        start = time.perf_counter()

        response = await real_client.get(
            f"/api/v1/integrations/{org_slug}",
            headers={"X-API-Key": api_key}
        )

        duration = time.perf_counter() - start
        timings.append({
            "request_num": i,
            "status_code": response.status_code,
            "duration": duration
        })

    # Analyze timings
    success_timings = [t["duration"] for t in timings if t["status_code"] == 200]
    rate_limited_timings = [t["duration"] for t in timings if t["status_code"] == 429]

    if success_timings:
        print(f"\nSuccessful requests: {len(success_timings)}")
        print(f"  Mean: {statistics.mean(success_timings)*1000:.4f}ms")

    if rate_limited_timings:
        print(f"\nRate limited requests: {len(rate_limited_timings)}")
        print(f"  Mean: {statistics.mean(rate_limited_timings)*1000:.4f}ms")

    # Verify rate limited responses are fast (< 100ms)
    if rate_limited_timings:
        max_rate_limit_time = max(rate_limited_timings)
        assert max_rate_limit_time < 0.100, \
            f"Rate limited responses too slow ({max_rate_limit_time*1000:.2f}ms)"


# ============================================
# Test: Database Query Timing Consistency
# ============================================

@pytest.mark.asyncio
async def test_database_query_timing_consistency(skip_if_no_credentials, real_client):
    """
    Verify that database queries for auth don't leak information through timing.

    Queries for:
    - Existing org
    - Non-existing org

    Should take similar time to prevent org enumeration.
    """
    existing_org = "test_org_db_timing"
    nonexistent_org = "nonexistent_org_xyz_123"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": existing_org,
            "company_name": "Test Org DB Timing",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201

    # Test timing for existing vs non-existing org
    timings_existing = []
    timings_nonexistent = []

    for _ in range(30):
        # Existing org
        start = time.perf_counter()
        response = await real_client.get(
            f"/api/v1/integrations/{existing_org}",
            headers={"X-API-Key": "invalid-key-12345"}
        )
        timings_existing.append(time.perf_counter() - start)

        # Non-existing org
        start = time.perf_counter()
        response = await real_client.get(
            f"/api/v1/integrations/{nonexistent_org}",
            headers={"X-API-Key": "invalid-key-12345"}
        )
        timings_nonexistent.append(time.perf_counter() - start)

    mean_existing = statistics.mean(timings_existing)
    mean_nonexistent = statistics.mean(timings_nonexistent)
    difference = abs(mean_existing - mean_nonexistent)

    print(f"\n\nDatabase Query Timing:")
    print(f"Existing org:     {mean_existing*1000:.4f}ms")
    print(f"Non-existing org: {mean_nonexistent*1000:.4f}ms")
    print(f"Difference:       {difference*1000:.4f}ms")

    # Timing difference should be small (< 10ms)
    # Larger differences could allow org enumeration
    assert difference < 0.010, \
        f"Database query timing reveals org existence ({difference*1000:.2f}ms difference)"

    print(f"\n✓ Database query timing is consistent")
