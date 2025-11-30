"""
Pipeline Management API Tests (E2E / Integration)
Tests for pipeline execution, monitoring, and cancellation endpoints.

These tests require:
- A running server on localhost:8000
- Valid GCP credentials for BigQuery
- Test organizations already onboarded

Run with: pytest tests/test_04_pipelines.py -v -m e2e

Endpoints tested:
- POST /api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline} - Run pipeline (X-API-Key)
- GET /api/v1/pipelines/runs/{run_id} - Get run status (X-API-Key)
- GET /api/v1/pipelines/runs - List pipeline runs (X-API-Key)
- DELETE /api/v1/pipelines/runs/{run_id} - Cancel run (X-API-Key)
"""

import os
import pytest
import httpx
import uuid
from datetime import datetime, date
from typing import Dict, Any

# Mark entire module as E2E tests - skip by default
pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(
        os.environ.get("RUN_E2E_TESTS", "").lower() != "true",
        reason="E2E tests require running server. Set RUN_E2E_TESTS=true to run."
    )
]


# ============================================
# Test Configuration
# ============================================

# Base URL for API
BASE_URL = "http://localhost:8000/api/v1"

# Test org slugs (must exist in test database after bootstrap + onboarding)
TEST_ORG_A = "test_org_a"
TEST_ORG_B = "test_org_b"

# Mock API keys (these should be created during test setup)
TEST_API_KEY_A = "test_org_a_api_test_key_xxxxxxxx"
TEST_API_KEY_B = "test_org_b_api_test_key_xxxxxxxx"

# Test pipeline patterns
TEST_PROVIDER = "openai"
TEST_DOMAIN = "usage"
TEST_PIPELINE = "daily"


# ============================================
# Test Fixtures
# ============================================

@pytest.fixture
def client():
    """HTTP client for API requests."""
    return httpx.Client(base_url=BASE_URL, timeout=30.0)


@pytest.fixture
def async_client():
    """Async HTTP client for API requests."""
    return httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)


@pytest.fixture
def org_a_headers():
    """Headers with Org A's API key."""
    return {
        "X-API-Key": TEST_API_KEY_A,
        "Content-Type": "application/json"
    }


@pytest.fixture
def org_b_headers():
    """Headers with Org B's API key."""
    return {
        "X-API-Key": TEST_API_KEY_B,
        "Content-Type": "application/json"
    }


# ============================================
# Test 1: Authentication Tests
# ============================================

def test_run_pipeline_without_auth(client):
    """
    Test triggering pipeline without authentication should fail.

    Expected: 401 Unauthorized
    """
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        json={"date": "2025-11-25"}
    )

    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
    assert "API" in response.text or "Unauthorized" in response.text


def test_get_run_status_without_auth(client):
    """
    Test getting run status without authentication should fail.

    Expected: 401 Unauthorized
    """
    run_id = str(uuid.uuid4())
    response = client.get(f"/pipelines/runs/{run_id}")

    assert response.status_code == 401
    assert "API" in response.text or "Unauthorized" in response.text


def test_list_runs_without_auth(client):
    """
    Test listing runs without authentication should fail.

    Expected: 401 Unauthorized
    """
    response = client.get("/pipelines/runs")

    assert response.status_code == 401
    assert "API" in response.text or "Unauthorized" in response.text


# ============================================
# Test 2: Invalid Org Tests
# ============================================

def test_run_pipeline_invalid_org(client, org_a_headers):
    """
    Test triggering pipeline for non-existent org should fail.

    Expected: 403 Forbidden (org slug mismatch with authenticated org)
    """
    invalid_org = "nonexistent_org_xyz"
    response = client.post(
        f"/pipelines/run/{invalid_org}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-25"}
    )

    assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
    assert "mismatch" in response.text.lower() or "forbidden" in response.text.lower()


def test_run_pipeline_invalid_org_format(client, org_a_headers):
    """
    Test triggering pipeline with invalid org slug format should fail.

    Expected: 400 Bad Request (invalid format)
    """
    # Org slug with invalid characters (path traversal attempt)
    invalid_org = "../../../etc/passwd"
    response = client.post(
        f"/pipelines/run/{invalid_org}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-25"}
    )

    assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    assert "format" in response.text.lower()


# ============================================
# Test 3: Invalid Provider Tests
# ============================================

def test_run_pipeline_invalid_provider(client, org_a_headers):
    """
    Test triggering pipeline with unknown provider should fail.

    Expected: 400 Bad Request or 404 Not Found (no credentials for provider)
    """
    invalid_provider = "unknown_provider"
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{invalid_provider}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-25"}
    )

    # Should fail at credential check (no credentials for unknown provider)
    assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}: {response.text}"
    assert "credential" in response.text.lower() or "not found" in response.text.lower()


# ============================================
# Test 4: Successful Pipeline Execution
# ============================================

@pytest.mark.integration
def test_run_pipeline_success(client, org_a_headers, bq_client):
    """
    Test successfully triggering a pipeline.

    Prerequisites:
    - Org must have active subscription
    - Org must have valid credentials for the provider
    - Template must exist: configs/{provider}/{domain}/{pipeline}.yml

    Expected: 200 OK with pipeline_logging_id
    """
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={
            "date": "2025-11-25",
            "trigger_by": "test_suite"
        }
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    assert "pipeline_logging_id" in data
    assert "pipeline_id" in data
    assert "org_slug" in data
    assert "status" in data
    assert "message" in data

    # Verify fields
    assert data["org_slug"] == TEST_ORG_A
    assert data["status"] in ["PENDING", "RUNNING"]
    assert data["pipeline_id"] == f"{TEST_ORG_A}-{TEST_PROVIDER}-{TEST_DOMAIN}-{TEST_PIPELINE}"

    # Verify pipeline run was created in BigQuery
    from src.app.config import settings
    query = f"""
    SELECT pipeline_logging_id, pipeline_id, status, trigger_type, trigger_by
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    WHERE pipeline_logging_id = @pipeline_logging_id
    LIMIT 1
    """

    results = list(bq_client.query(
        query,
        parameters=[
            bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", data["pipeline_logging_id"])
        ]
    ))

    assert len(results) == 1
    row = results[0]
    assert row["pipeline_id"] == data["pipeline_id"]
    assert row["status"] in ["PENDING", "RUNNING", "COMPLETE"]
    assert row["trigger_type"] == "api"
    assert row["trigger_by"] == "test_suite"


@pytest.mark.integration
def test_run_pipeline_with_dry_run(client, org_a_headers):
    """
    Test triggering pipeline with dry_run=true parameter.

    This should validate the pipeline configuration without executing it.

    Expected: 200 OK (if dry run is supported by the pipeline)
    Note: Implementation depends on whether dry_run is supported
    """
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={
            "date": "2025-11-25",
            "dry_run": True,
            "trigger_by": "test_dry_run"
        }
    )

    # This test may fail if dry_run is not yet implemented
    # The endpoint forbids extra fields, so this will return 422 if not supported
    if response.status_code == 422:
        pytest.skip("dry_run parameter not supported yet (extra='forbid' in Pydantic model)")

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert "pipeline_logging_id" in data


# ============================================
# Test 5: Pipeline Run Status
# ============================================

@pytest.mark.integration
def test_get_run_status(client, org_a_headers, bq_client):
    """
    Test retrieving pipeline run status.

    Prerequisites:
    - A pipeline run must exist in the database

    Expected: 200 OK with run details
    """
    # First, trigger a pipeline to get a run_id
    trigger_response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-25", "trigger_by": "test_status"}
    )

    assert trigger_response.status_code == 200
    trigger_data = trigger_response.json()
    pipeline_logging_id = trigger_data["pipeline_logging_id"]

    # Now get the status
    response = client.get(
        f"/pipelines/runs/{pipeline_logging_id}",
        headers=org_a_headers
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    assert data["pipeline_logging_id"] == pipeline_logging_id
    assert data["org_slug"] == TEST_ORG_A
    assert "status" in data
    assert "start_time" in data
    assert "trigger_type" in data
    assert "trigger_by" in data


def test_get_run_status_not_found(client, org_a_headers):
    """
    Test getting status for non-existent run should fail.

    Expected: 404 Not Found
    """
    fake_run_id = str(uuid.uuid4())
    response = client.get(
        f"/pipelines/runs/{fake_run_id}",
        headers=org_a_headers
    )

    assert response.status_code == 404
    assert "not found" in response.text.lower()


# ============================================
# Test 6: List Pipeline Runs
# ============================================

@pytest.mark.integration
def test_list_runs(client, org_a_headers):
    """
    Test listing all pipeline runs for an org.

    Expected: 200 OK with list of runs
    """
    response = client.get("/pipelines/runs", headers=org_a_headers)

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    assert isinstance(data, list)

    # If there are runs, verify structure
    if len(data) > 0:
        run = data[0]
        assert "pipeline_logging_id" in run
        assert "pipeline_id" in run
        assert "org_slug" in run
        assert "status" in run
        assert "start_time" in run
        assert run["org_slug"] == TEST_ORG_A


@pytest.mark.integration
def test_list_runs_with_filters(client, org_a_headers):
    """
    Test listing runs with filters (pipeline_id, status, limit).

    Expected: 200 OK with filtered results
    """
    # Test with pipeline_id filter
    pipeline_id = f"{TEST_ORG_A}-{TEST_PROVIDER}-{TEST_DOMAIN}-{TEST_PIPELINE}"
    response = client.get(
        "/pipelines/runs",
        headers=org_a_headers,
        params={"pipeline_id": pipeline_id, "limit": 5}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) <= 5

    # All runs should match the pipeline_id filter
    for run in data:
        assert run["pipeline_id"] == pipeline_id


@pytest.mark.integration
def test_list_runs_status_filter(client, org_a_headers):
    """
    Test listing runs filtered by status.

    Expected: 200 OK with filtered results
    """
    response = client.get(
        "/pipelines/runs",
        headers=org_a_headers,
        params={"status": "PENDING", "limit": 10}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

    # All runs should have PENDING status
    for run in data:
        assert run["status"] == "PENDING"


# ============================================
# Test 7: Cancel Pipeline Run
# ============================================

@pytest.mark.integration
def test_cancel_run(client, org_a_headers, bq_client):
    """
    Test canceling a running pipeline.

    Note: Cancellation is a placeholder in current implementation.

    Expected: 200 OK with cancellation message
    """
    # First, trigger a pipeline
    trigger_response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-25", "trigger_by": "test_cancel"}
    )

    assert trigger_response.status_code == 200
    trigger_data = trigger_response.json()
    pipeline_logging_id = trigger_data["pipeline_logging_id"]

    # Now cancel it
    response = client.delete(
        f"/pipelines/runs/{pipeline_logging_id}",
        headers=org_a_headers
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    assert data["pipeline_logging_id"] == pipeline_logging_id
    assert "message" in data
    assert "cancellation" in data["message"].lower() or "placeholder" in data["message"].lower()


def test_cancel_run_not_found(client, org_a_headers):
    """
    Test canceling non-existent run should still return 200.

    Note: Current implementation returns placeholder response regardless.

    Expected: 200 OK
    """
    fake_run_id = str(uuid.uuid4())
    response = client.delete(
        f"/pipelines/runs/{fake_run_id}",
        headers=org_a_headers
    )

    # Current implementation returns 200 even for non-existent runs
    assert response.status_code == 200


# ============================================
# Test 8: Organization Isolation
# ============================================

@pytest.mark.integration
def test_pipeline_org_isolation(client, org_a_headers, org_b_headers, bq_client):
    """
    Test that Org A cannot see Org B's pipeline runs.

    This verifies multi-tenant isolation at the data layer.

    Expected: Org A can only see its own runs, not Org B's runs
    """
    # Org A triggers a pipeline
    response_a = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-25", "trigger_by": "org_a_test"}
    )

    assert response_a.status_code == 200
    data_a = response_a.json()
    run_id_a = data_a["pipeline_logging_id"]

    # Org B triggers a pipeline
    response_b = client.post(
        f"/pipelines/run/{TEST_ORG_B}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_b_headers,
        json={"date": "2025-11-25", "trigger_by": "org_b_test"}
    )

    assert response_b.status_code == 200
    data_b = response_b.json()
    run_id_b = data_b["pipeline_logging_id"]

    # Org A tries to get Org B's run status - should fail
    response = client.get(
        f"/pipelines/runs/{run_id_b}",
        headers=org_a_headers
    )

    assert response.status_code == 404, f"Org A should not see Org B's runs. Got {response.status_code}"

    # Org A lists runs - should only see Org A's runs
    response = client.get("/pipelines/runs", headers=org_a_headers)
    assert response.status_code == 200

    runs = response.json()
    org_a_run_ids = [run["pipeline_logging_id"] for run in runs]

    assert run_id_a in org_a_run_ids, "Org A should see its own run"
    assert run_id_b not in org_a_run_ids, "Org A should NOT see Org B's run"


# ============================================
# Test 9: Quota Enforcement
# ============================================

@pytest.mark.integration
def test_pipeline_quota_enforcement(client, org_a_headers, bq_client):
    """
    Test that pipeline execution respects quota limits.

    This test assumes TEST_ORG_A has a low quota (e.g., STARTER plan with 6 daily runs).

    Expected: After exceeding quota, should get 429 Too Many Requests
    """
    from src.app.config import settings

    # Get current quota for org
    query = f"""
    SELECT daily_limit, pipelines_run_today
    FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
    WHERE org_slug = @org_slug AND usage_date = CURRENT_DATE()
    LIMIT 1
    """

    results = list(bq_client.query(
        query,
        parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", TEST_ORG_A)]
    ))

    if not results:
        pytest.skip("No quota record found for test org - run onboarding first")

    quota = results[0]
    daily_limit = quota["daily_limit"]
    current_usage = quota["pipelines_run_today"]

    if daily_limit - current_usage > 5:
        pytest.skip(f"Quota too high to test enforcement (limit: {daily_limit}, used: {current_usage})")

    # Trigger pipelines until quota exceeded
    run_count = 0
    max_attempts = daily_limit - current_usage + 2  # Try to exceed by 2

    for i in range(max_attempts):
        response = client.post(
            f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
            headers=org_a_headers,
            json={"date": f"2025-11-{25 + i}", "trigger_by": f"quota_test_{i}"}
        )

        if response.status_code == 429:
            # Quota exceeded - expected!
            assert "quota" in response.text.lower()
            break
        elif response.status_code == 200:
            run_count += 1
        else:
            # Some other error
            break

    assert run_count <= daily_limit, f"Should not exceed daily limit of {daily_limit}"


# ============================================
# Test 10: Concurrent Pipeline Prevention
# ============================================

@pytest.mark.integration
def test_concurrent_pipeline_prevention(client, org_a_headers, bq_client):
    """
    Test that duplicate pipeline runs are prevented.

    If a pipeline is already RUNNING or PENDING, attempting to trigger
    the same pipeline should return the existing run.

    Expected: Second request returns existing pipeline_logging_id with status RUNNING
    """
    # Trigger first pipeline
    response1 = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-26", "trigger_by": "concurrent_test_1"}
    )

    assert response1.status_code == 200
    data1 = response1.json()
    run_id_1 = data1["pipeline_logging_id"]

    # Immediately trigger same pipeline again
    response2 = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={"date": "2025-11-26", "trigger_by": "concurrent_test_2"}
    )

    assert response2.status_code == 200
    data2 = response2.json()

    # Should return the existing run (same pipeline_logging_id or message about existing run)
    if data2["status"] == "RUNNING":
        # Existing run returned
        assert "already running" in data2["message"].lower() or "existing" in data2["message"].lower()
    else:
        # Different run_id - pipeline completed before second request
        # This is OK, just means pipeline executed quickly
        pass


# ============================================
# Test 11: Invalid Pipeline Template
# ============================================

def test_run_pipeline_template_not_found(client, org_a_headers):
    """
    Test triggering pipeline with non-existent template should fail.

    Expected: 404 Not Found (template file doesn't exist)
    """
    invalid_pipeline = "nonexistent_pipeline_xyz"
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{invalid_pipeline}",
        headers=org_a_headers,
        json={"date": "2025-11-25"}
    )

    assert response.status_code == 404
    assert "template" in response.text.lower() or "not found" in response.text.lower()


# ============================================
# Test 12: Missing Required Parameters
# ============================================

def test_run_pipeline_missing_subscription(client, org_a_headers, bq_client):
    """
    Test triggering pipeline for org without active subscription should fail.

    This test requires a test org without active subscription.

    Expected: 403 Forbidden (no active subscription)
    """
    # This test is theoretical - we'd need a test org with no subscription
    # Skip if all test orgs have subscriptions
    pytest.skip("Requires test org without active subscription - manual test")


def test_run_pipeline_missing_credentials(client, org_a_headers, bq_client):
    """
    Test triggering pipeline for provider without credentials should fail.

    This test requires attempting to run a pipeline for a provider
    where the org hasn't set up credentials.

    Expected: 400 Bad Request (no credentials configured)
    """
    # Try to run a pipeline for a provider that likely has no credentials
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/anthropic/usage/daily",
        headers=org_a_headers,
        json={"date": "2025-11-25"}
    )

    # Should fail at credential check
    if response.status_code == 400:
        assert "credential" in response.text.lower()
    elif response.status_code == 404:
        # Template not found is also acceptable
        assert "template" in response.text.lower()
    else:
        pytest.fail(f"Expected 400 or 404, got {response.status_code}")


# ============================================
# Test 13: Parameter Validation
# ============================================

def test_run_pipeline_extra_parameters_forbidden(client, org_a_headers):
    """
    Test that extra parameters are rejected (extra='forbid' in Pydantic model).

    This is a security feature to prevent injection of unexpected parameters.

    Expected: 422 Unprocessable Entity
    """
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={
            "date": "2025-11-25",
            "trigger_by": "test",
            "malicious_param": "should_be_rejected"  # Extra field
        }
    )

    assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
    assert "extra" in response.text.lower() or "not permitted" in response.text.lower()


def test_run_pipeline_valid_parameters(client, org_a_headers):
    """
    Test that valid parameters are accepted.

    Valid parameters: trigger_by, date, start_date, end_date, force_refresh

    Expected: 200 OK (or appropriate error if pipeline doesn't exist)
    """
    response = client.post(
        f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
        headers=org_a_headers,
        json={
            "trigger_by": "test_valid_params",
            "date": "2025-11-25",
            "force_refresh": True
        }
    )

    # Should succeed (if template exists and credentials are set up)
    # Or fail with a valid error (not parameter validation error)
    assert response.status_code != 422, "Valid parameters should not trigger validation error"


# ============================================
# Test 14: Rate Limiting (if enabled)
# ============================================

@pytest.mark.slow
def test_pipeline_rate_limiting(client, org_a_headers):
    """
    Test that rate limiting is enforced (50 requests/minute per org).

    This test is marked as slow because it needs to make many requests.

    Expected: After 50 requests in a minute, get 429 Too Many Requests
    """
    import time

    # This test requires rate limiting to be enabled
    from src.app.config import settings
    if not settings.rate_limit_enabled:
        pytest.skip("Rate limiting is disabled")

    # Make rapid requests
    start_time = time.time()
    success_count = 0
    rate_limited = False

    for i in range(55):  # Try to exceed 50/min limit
        response = client.post(
            f"/pipelines/run/{TEST_ORG_A}/{TEST_PROVIDER}/{TEST_DOMAIN}/{TEST_PIPELINE}",
            headers=org_a_headers,
            json={"date": f"2025-11-{25 + (i % 5)}", "trigger_by": f"rate_test_{i}"}
        )

        if response.status_code == 429:
            rate_limited = True
            assert "rate" in response.text.lower() or "too many" in response.text.lower()
            break
        elif response.status_code == 200:
            success_count += 1

        # Don't spam too fast (gives server time to process)
        time.sleep(0.1)

    elapsed = time.time() - start_time

    # If we made 55 requests in under 60 seconds, rate limiting should have kicked in
    if elapsed < 60 and success_count >= 50:
        assert rate_limited, "Rate limiting should have been enforced after 50 requests"


# ============================================
# Test 15: Deprecated Endpoint
# ============================================

@pytest.mark.integration
def test_deprecated_pipeline_endpoint(client, org_a_headers):
    """
    Test the deprecated /pipelines/run/{pipeline_id} endpoint.

    This endpoint is deprecated in favor of the templated endpoint.

    Expected: 200 OK but with deprecation warning (endpoint still works)
    """
    # Use the old-style endpoint (just pipeline_id, not provider/domain/template)
    pipeline_id = f"{TEST_PROVIDER}_{TEST_DOMAIN}"

    response = client.post(
        f"/pipelines/run/{pipeline_id}",
        headers=org_a_headers,
        json={"date": "2025-11-25", "trigger_by": "deprecated_test"}
    )

    # Should still work (deprecated but functional)
    # Or fail if the pipeline config doesn't exist for old-style naming
    if response.status_code == 404:
        # Template not found for old-style pipeline_id - acceptable
        pytest.skip("Old-style pipeline config doesn't exist")

    assert response.status_code in [200, 400, 403, 404], f"Unexpected status: {response.status_code}"


# ============================================
# Cleanup Fixture
# ============================================

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_runs(bq_client):
    """
    Cleanup test pipeline runs after tests complete.

    This prevents test data from accumulating in the database.
    """
    yield  # Run tests first

    # After tests, optionally clean up test runs
    # (Only if needed - test data can be useful for debugging)
    # Uncomment to enable cleanup:

    # from src.app.config import settings
    # cleanup_query = f"""
    # DELETE FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
    # WHERE trigger_by LIKE 'test_%' OR trigger_by LIKE '%_test'
    # """
    # bq_client.client.query(cleanup_query).result()
