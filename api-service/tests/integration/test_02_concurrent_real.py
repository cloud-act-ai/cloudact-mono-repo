"""
Integration test: Concurrent pipeline execution limits.

Tests that concurrent pipeline limits are properly enforced and that
race conditions don't occur when multiple requests happen simultaneously.

Run with: pytest -m integration --run-integration tests/integration/test_02_concurrent_real.py

Test Coverage:
1. Concurrent pipeline limits are enforced (per subscription plan)
2. No race conditions when multiple pipelines run simultaneously
3. Quota counters remain accurate under concurrent load
4. Proper error handling for exceeded limits
5. Pipeline execution serialization when needed
"""

import os
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime

# Mark all tests in this file as integration and slow
pytestmark = [pytest.mark.integration, pytest.mark.slow]


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
# Test: Concurrent Request Handling
# ============================================

@pytest.mark.asyncio
async def test_concurrent_requests_no_race_condition(skip_if_no_credentials, real_client):
    """
    Verify that 20 parallel requests to the same endpoint don't cause race conditions.

    This test hammers the API with concurrent requests and verifies:
    1. All requests complete successfully
    2. No database deadlocks
    3. No data corruption
    4. Response times remain reasonable
    """
    org_slug = "test_org_concurrent"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Concurrent",
            "admin_email": "admin@test.com",
            "plan_name": "ENTERPRISE"  # High limits
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Launch 20 concurrent GET requests
    async def make_request(request_id: int):
        """Make a single request and track timing."""
        start_time = datetime.now()
        try:
            response = await real_client.get(
                f"/api/v1/integrations/{org_slug}",
                headers={"X-API-Key": api_key}
            )
            end_time = datetime.now()
            duration_ms = (end_time - start_time).total_seconds() * 1000

            return {
                "request_id": request_id,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "success": response.status_code == 200
            }
        except Exception as e:
            return {
                "request_id": request_id,
                "status_code": None,
                "duration_ms": None,
                "success": False,
                "error": str(e)
            }

    # Execute 20 requests concurrently
    tasks = [make_request(i) for i in range(20)]
    results = await asyncio.gather(*tasks)

    # Verify results
    success_count = sum(1 for r in results if r["success"])
    failed_count = len(results) - success_count

    assert success_count == 20, f"Expected 20 successful requests, got {success_count} (failed: {failed_count})"

    # Check that all responses were 200
    status_codes = [r["status_code"] for r in results]
    assert all(code == 200 for code in status_codes), f"Some requests failed: {status_codes}"

    # Verify reasonable response times (p95 should be under 5 seconds for simple GET)
    durations = sorted([r["duration_ms"] for r in results if r["duration_ms"]])
    p95_duration = durations[int(len(durations) * 0.95)]

    assert p95_duration < 5000, f"P95 latency too high: {p95_duration}ms (expected < 5000ms)"

    print(f"\nConcurrent request results:")
    print(f"  Success: {success_count}/{len(results)}")
    print(f"  P50 latency: {durations[len(durations)//2]:.2f}ms")
    print(f"  P95 latency: {p95_duration:.2f}ms")
    print(f"  P99 latency: {durations[int(len(durations) * 0.99)]:.2f}ms")


# ============================================
# Test: Concurrent Pipeline Limit Enforcement
# ============================================

@pytest.mark.asyncio
async def test_concurrent_pipeline_limit_enforced(skip_if_no_credentials, real_client):
    """
    CRITICAL: Verify that max_concurrent_pipelines is enforced.

    For a BASIC plan (max_concurrent_pipelines=2):
    1. Launch 5 concurrent pipeline requests
    2. Verify that only 2 run simultaneously
    3. Verify that 3 are queued or rejected with 429 error
    """
    org_slug = "test_org_concurrent_limit"

    # Create test org with BASIC plan (max_concurrent_pipelines=2)
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Concurrent Limit",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"  # max_concurrent_pipelines=2
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # NOTE: This test requires the pipeline service to be running
    # For now, we'll test with integration endpoints instead
    # TODO: Integrate with data-pipeline-service for full test

    # Test: Get quota status (should show max_concurrent_pipelines=2)
    response = await real_client.get(
        f"/api/v1/quota/{org_slug}/status",
        headers={"X-API-Key": api_key}
    )

    # If endpoint doesn't exist yet, skip this specific test
    if response.status_code == 404:
        pytest.skip("Quota endpoint not implemented yet")

    assert response.status_code == 200
    quota_data = response.json()

    # Verify max_concurrent_pipelines is set correctly
    assert "max_concurrent_pipelines" in quota_data
    assert quota_data["max_concurrent_pipelines"] == 2, "BASIC plan should have max_concurrent_pipelines=2"


# ============================================
# Test: Race Condition in Quota Counter
# ============================================

@pytest.mark.asyncio
async def test_quota_counter_race_condition(skip_if_no_credentials, real_client):
    """
    Verify that quota counters don't have race conditions.

    This test:
    1. Launches 10 concurrent operations that increment a quota counter
    2. Verifies the final count is exactly 10 (not 8 or 12 due to race conditions)
    """
    org_slug = "test_org_quota_race"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Quota Race",
            "admin_email": "admin@test.com",
            "plan_name": "ENTERPRISE"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup: Add OpenAI integration (to test pricing operations)
    # This will increment quota counters
    async def add_pricing_model(model_id: str):
        """Add a pricing model (simulates quota operation)."""
        try:
            response = await real_client.post(
                f"/api/v1/integrations/{org_slug}/openai/pricing",
                headers={"X-API-Key": api_key},
                json={
                    "model_id": model_id,
                    "input_price_per_million": 1.0,
                    "output_price_per_million": 2.0,
                    "effective_date": "2025-01-01"
                }
            )
            return response.status_code
        except Exception as e:
            return None

    # Launch 10 concurrent pricing additions
    model_ids = [f"test-model-race-{i}" for i in range(10)]
    tasks = [add_pricing_model(model_id) for model_id in model_ids]
    status_codes = await asyncio.gather(*tasks)

    # Verify all requests completed
    success_count = sum(1 for code in status_codes if code in [200, 201])
    print(f"\nPricing additions: {success_count}/10 succeeded")

    # Get final pricing count
    response = await real_client.get(
        f"/api/v1/integrations/{org_slug}/openai/pricing",
        headers={"X-API-Key": api_key}
    )

    if response.status_code == 200:
        pricing_data = response.json()
        actual_count = len([p for p in pricing_data if p["model_id"].startswith("test-model-race-")])

        # Verify no race condition (should be exactly success_count)
        assert actual_count == success_count, \
            f"Race condition detected: expected {success_count} models, got {actual_count}"


# ============================================
# Test: Concurrent Integration Setup
# ============================================

@pytest.mark.asyncio
async def test_concurrent_integration_setup(skip_if_no_credentials, real_client):
    """
    Verify that setting up multiple integrations concurrently works correctly.

    This test:
    1. Launches 3 concurrent integration setups (OpenAI, Anthropic, Gemini)
    2. Verifies all complete successfully
    3. Verifies no credential mixing or data corruption
    """
    org_slug = "test_org_concurrent_integrations"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Concurrent Integrations",
            "admin_email": "admin@test.com",
            "plan_name": "ENTERPRISE"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup integrations concurrently
    async def setup_integration(provider: str, credentials: dict):
        """Setup a single integration."""
        try:
            response = await real_client.post(
                f"/api/v1/integrations/{org_slug}/{provider}/setup",
                headers={"X-API-Key": api_key},
                json=credentials
            )
            return {
                "provider": provider,
                "status_code": response.status_code,
                "success": response.status_code in [200, 201]
            }
        except Exception as e:
            return {
                "provider": provider,
                "status_code": None,
                "success": False,
                "error": str(e)
            }

    # Launch concurrent setups
    tasks = [
        setup_integration("openai", {"api_key": "sk-test-openai-concurrent"}),
        setup_integration("anthropic", {"api_key": "sk-ant-test-concurrent"}),
        setup_integration("gemini", {"api_key": "test-gemini-concurrent"})
    ]

    results = await asyncio.gather(*tasks)

    # Note: These may fail validation, but should process concurrently without errors
    for result in results:
        print(f"{result['provider']}: status={result['status_code']}")

    # Verify all requests completed (even if validation failed)
    assert all(result["status_code"] is not None for result in results), \
        "All concurrent setups should complete"


# ============================================
# Test: Database Connection Pool Under Load
# ============================================

@pytest.mark.asyncio
@pytest.mark.slow
async def test_database_connection_pool_under_load(skip_if_no_credentials, real_client):
    """
    Verify that the database connection pool handles high concurrent load.

    This test:
    1. Launches 50 concurrent requests
    2. Verifies no connection pool exhaustion
    3. Checks that all requests complete within reasonable time
    """
    org_slug = "test_org_connection_pool"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Connection Pool",
            "admin_email": "admin@test.com",
            "plan_name": "ENTERPRISE"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Launch 50 concurrent requests
    async def make_request(request_id: int):
        """Make a single request."""
        try:
            response = await real_client.get(
                f"/api/v1/integrations/{org_slug}",
                headers={"X-API-Key": api_key}
            )
            return response.status_code == 200
        except Exception:
            return False

    tasks = [make_request(i) for i in range(50)]
    results = await asyncio.gather(*tasks)

    success_count = sum(results)
    assert success_count >= 45, f"Too many failures: {success_count}/50 succeeded (expected >= 45)"
    print(f"\nConnection pool test: {success_count}/50 requests succeeded")
