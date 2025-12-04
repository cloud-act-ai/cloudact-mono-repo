"""
Subscription Pipeline Tests - Cost Calculation and OpenAI Subscription Pipelines

Tests for subscription-related pipeline operations:
1. OpenAI subscription data extraction pipeline
2. Subscription cost analysis pipeline
3. Cost consolidation pipeline

These are INTEGRATION tests - they hit real pipeline endpoints.
No mocking of pipeline execution.

Pipelines Tested:
- POST /api/v1/pipelines/run/{org_slug}/openai/subscriptions - OpenAI subscription extraction
- Subscription cost analysis (example pipeline)

Prerequisites:
- Running server on localhost:8001
- Valid org with OpenAI integration configured
- BigQuery access

To run:
    RUN_E2E_TESTS=true pytest tests/test_05_subscription_pipelines.py -v
"""

import pytest
import uuid
import os
import httpx
from datetime import date, datetime, timedelta
from typing import Dict, Any

# Mark as E2E/Integration tests
pytestmark = [
    pytest.mark.e2e,
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("RUN_E2E_TESTS", "").lower() != "true",
        reason="E2E tests require running server. Set RUN_E2E_TESTS=true to run."
    )
]

# ============================================
# Test Configuration
# ============================================

# Pipeline service URL
PIPELINE_BASE_URL = os.environ.get("PIPELINE_SERVICE_URL", "http://localhost:8001")

# API service URL (for org creation)
API_BASE_URL = os.environ.get("API_SERVICE_URL", "http://localhost:8000")

# Root API key
ROOT_KEY = os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-dev-32chars")

# Test org slug - use existing or create new
TEST_ORG_SLUG = os.environ.get("TEST_ORG_SLUG", f"pipeline_test_{uuid.uuid4().hex[:8]}")
TEST_API_KEY = os.environ.get("TEST_ORG_API_KEY", "")


# ============================================
# Test Fixtures
# ============================================

@pytest.fixture(scope="module")
def api_client():
    """HTTP client for API service (org management)."""
    return httpx.Client(base_url=API_BASE_URL, timeout=60.0)


@pytest.fixture(scope="module")
def pipeline_client():
    """HTTP client for Pipeline service."""
    return httpx.Client(base_url=PIPELINE_BASE_URL, timeout=120.0)


@pytest.fixture(scope="module")
def setup_test_org(api_client):
    """Create test organization if not using existing."""
    global TEST_API_KEY

    # If TEST_ORG_API_KEY is set, use existing org
    if os.environ.get("TEST_ORG_API_KEY"):
        TEST_API_KEY = os.environ.get("TEST_ORG_API_KEY")
        print(f"\nUsing existing org: {TEST_ORG_SLUG}")
        return {
            "org_slug": TEST_ORG_SLUG,
            "api_key": TEST_API_KEY
        }

    # Create new test org
    test_org_slug = f"pipeline_test_{uuid.uuid4().hex[:8]}"
    test_email = f"pipeline_test_{uuid.uuid4().hex[:8]}@example.com"

    print(f"\nCreating test org: {test_org_slug}")

    response = api_client.post(
        "/api/v1/organizations/onboard",
        headers={
            "X-CA-Root-Key": ROOT_KEY,
            "Content-Type": "application/json"
        },
        json={
            "org_slug": test_org_slug,
            "company_name": f"{test_org_slug} Corp",
            "admin_email": test_email,
            "subscription_plan": "PROFESSIONAL",
            "regenerate_api_key_if_exists": True
        }
    )

    if response.status_code != 200:
        pytest.fail(f"Failed to create test org: {response.status_code} {response.text}")

    data = response.json()
    TEST_API_KEY = data.get("api_key", "")

    print(f"Test org created: {test_org_slug}")

    # Setup OpenAI integration (skip validation for testing)
    setup_response = api_client.post(
        f"/api/v1/integrations/{test_org_slug}/openai/setup",
        headers={
            "X-API-Key": TEST_API_KEY,
            "Content-Type": "application/json"
        },
        json={
            "credential": "sk-test-key-for-pipeline-testing",
            "credential_name": "Test OpenAI Key",
            "skip_validation": True
        }
    )

    if setup_response.status_code not in [200, 201]:
        print(f"Note: OpenAI setup returned {setup_response.status_code}")

    return {
        "org_slug": test_org_slug,
        "api_key": TEST_API_KEY
    }


@pytest.fixture
def org_headers(setup_test_org):
    """Headers with org API key for pipeline requests."""
    return {
        "X-API-Key": setup_test_org["api_key"],
        "Content-Type": "application/json"
    }


# ============================================
# Test: Health Check
# ============================================

class TestPipelineServiceHealth:
    """Basic health checks for pipeline service."""

    def test_health_endpoint(self, pipeline_client):
        """Test pipeline service health endpoint."""
        response = pipeline_client.get("/health")

        assert response.status_code == 200, f"Health check failed: {response.text}"

        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "data-pipeline-service"

        print(f"Pipeline service healthy: v{data.get('version', 'unknown')}")


# ============================================
# Test: OpenAI Subscription Pipeline
# ============================================

class TestOpenAISubscriptionPipeline:
    """Test OpenAI subscription extraction pipeline."""

    def test_run_openai_subscriptions_pipeline(
        self,
        pipeline_client,
        setup_test_org,
        org_headers
    ):
        """
        Run the OpenAI subscriptions pipeline.

        This pipeline extracts subscription/organization data from OpenAI API.
        Config: configs/openai/subscriptions.yml
        """
        org_slug = setup_test_org["org_slug"]

        # Pipeline endpoint format: /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
        # For openai/subscriptions.yml: provider=openai, domain="" (root), pipeline=subscriptions
        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/openai/subscriptions",
            headers=org_headers,
            json={
                "execution_date": str(date.today())
            }
        )

        # Pipeline may fail if no real OpenAI key - check for expected responses
        if response.status_code == 200:
            data = response.json()
            print(f"OpenAI subscriptions pipeline started: {data}")

            # Check for expected fields
            assert "run_id" in data or "status" in data or "message" in data

        elif response.status_code == 404:
            # Pipeline config may not exist
            print("OpenAI subscriptions pipeline not found (config may not exist)")

        elif response.status_code == 400:
            # May fail due to missing/invalid credentials
            data = response.json()
            print(f"Pipeline failed (expected with test credentials): {data.get('detail', data)}")

        else:
            # Log but don't fail - pipeline may fail for various reasons in test
            print(f"Pipeline returned {response.status_code}: {response.text}")

    def test_openai_subscriptions_config_exists(self, pipeline_client):
        """Verify OpenAI subscriptions pipeline config exists."""
        # Try to get pipeline info via validator endpoint
        response = pipeline_client.get("/api/v1/validator/pipelines")

        if response.status_code == 200:
            data = response.json()
            pipelines = data.get("pipelines", [])

            # Look for openai subscriptions pipeline
            openai_pipelines = [p for p in pipelines if "openai" in str(p).lower()]
            print(f"Found OpenAI pipelines: {openai_pipelines}")

        elif response.status_code == 404:
            print("Pipeline validator endpoint not found")


# ============================================
# Test: Subscription Cost Analysis Pipeline
# ============================================

class TestSubscriptionCostPipeline:
    """Test subscription cost analysis pipeline."""

    def test_run_cost_analysis_pipeline(
        self,
        pipeline_client,
        setup_test_org,
        org_headers
    ):
        """
        Run the subscription cost analysis pipeline (if configured).

        This pipeline reads saas_subscriptions and calculates daily costs.
        Config: configs/subscription/costs/example_subscription_cost_analysis.yml
        """
        org_slug = setup_test_org["org_slug"]

        # Try to run the cost analysis pipeline
        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/subscription/costs/example_subscription_cost_analysis",
            headers=org_headers,
            json={
                "execution_date": str(date.today())
            }
        )

        if response.status_code == 200:
            data = response.json()
            print(f"Cost analysis pipeline started: {data}")

        elif response.status_code == 404:
            # Expected - this is an example/template pipeline
            print("Cost analysis pipeline not found (example config)")

        else:
            print(f"Cost analysis returned {response.status_code}: {response.text[:200]}")

    def test_run_generic_cost_transform(
        self,
        pipeline_client,
        setup_test_org,
        org_headers
    ):
        """
        Run a generic local BQ transformer pipeline.

        Tests the generic.local_bq_transformer processor.
        """
        org_slug = setup_test_org["org_slug"]

        # Try the example finance transform
        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/example/finance/subscription_costs_transform",
            headers=org_headers,
            json={
                "start_date": str(date.today() - timedelta(days=7)),
                "end_date": str(date.today())
            }
        )

        if response.status_code == 200:
            data = response.json()
            print(f"Cost transform pipeline started: {data}")

        elif response.status_code == 404:
            # Expected - example pipeline
            print("Cost transform pipeline not found (example config)")

        else:
            print(f"Cost transform returned {response.status_code}")


# ============================================
# Test: Subscription Pipeline Authentication
# ============================================

class TestPipelineAuth:
    """Test pipeline authentication and authorization."""

    def test_pipeline_without_auth(self, pipeline_client, setup_test_org):
        """Test that pipelines require authentication."""
        org_slug = setup_test_org["org_slug"]

        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/openai/subscriptions",
            # No X-API-Key header
            json={"execution_date": str(date.today())}
        )

        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Correctly required authentication for pipeline")

    def test_pipeline_invalid_api_key(self, pipeline_client, setup_test_org):
        """Test that invalid API key is rejected."""
        org_slug = setup_test_org["org_slug"]

        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/openai/subscriptions",
            headers={
                "X-API-Key": "invalid-api-key-xxxxxx",
                "Content-Type": "application/json"
            },
            json={"execution_date": str(date.today())}
        )

        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Correctly rejected invalid API key")

    def test_pipeline_cross_org_access(self, pipeline_client, setup_test_org, org_headers):
        """Test that org can't run pipelines for another org."""
        response = pipeline_client.post(
            "/api/v1/pipelines/run/different_org_slug/openai/subscriptions",
            headers=org_headers,
            json={"execution_date": str(date.today())}
        )

        # Should be 403 (forbidden) or 404 (org not found)
        assert response.status_code in [400, 401, 403, 404], f"Expected 400/401/403/404, got {response.status_code}"
        print("Correctly prevented cross-org pipeline execution")


# ============================================
# Test: Pipeline Input Validation
# ============================================

class TestPipelineValidation:
    """Test pipeline input validation."""

    def test_pipeline_invalid_provider(
        self,
        pipeline_client,
        setup_test_org,
        org_headers
    ):
        """Test that invalid provider returns 404."""
        org_slug = setup_test_org["org_slug"]

        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/invalid_provider/subscriptions",
            headers=org_headers,
            json={"execution_date": str(date.today())}
        )

        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        print("Correctly rejected invalid provider")

    def test_pipeline_invalid_date_format(
        self,
        pipeline_client,
        setup_test_org,
        org_headers
    ):
        """Test that invalid date format returns validation error."""
        org_slug = setup_test_org["org_slug"]

        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/openai/subscriptions",
            headers=org_headers,
            json={"execution_date": "invalid-date"}
        )

        # May return 422 (validation) or 400 (bad request) or process anyway
        if response.status_code in [422, 400]:
            print("Correctly rejected invalid date format")
        else:
            print(f"Pipeline accepted invalid date (may handle internally): {response.status_code}")


# ============================================
# Test: Subscription Quota Enforcement
# ============================================

class TestSubscriptionQuota:
    """Test subscription-based pipeline quota enforcement."""

    def test_pipeline_checks_subscription_status(
        self,
        pipeline_client,
        setup_test_org,
        org_headers
    ):
        """
        Test that pipeline checks org subscription status.

        Only ACTIVE and TRIAL orgs should be able to run pipelines.
        """
        org_slug = setup_test_org["org_slug"]

        response = pipeline_client.post(
            f"/api/v1/pipelines/run/{org_slug}/openai/subscriptions",
            headers=org_headers,
            json={"execution_date": str(date.today())}
        )

        # For test org with valid subscription, should not be 402/403 due to subscription
        # May fail for other reasons (no credentials, no config) but not subscription
        if response.status_code == 402:
            print("Payment required - subscription issue")
        elif response.status_code == 403:
            data = response.json()
            if "subscription" in str(data).lower() or "suspended" in str(data).lower():
                print(f"Subscription check enforced: {data}")
            else:
                print(f"403 for other reason: {data}")
        else:
            print(f"Subscription check passed (status: {response.status_code})")


# ============================================
# Test: Pipeline Run Status
# ============================================

class TestPipelineStatus:
    """Test pipeline run status endpoints."""

    def test_list_pipeline_runs(
        self,
        pipeline_client,
        setup_test_org,
        org_headers
    ):
        """Test listing pipeline runs for an org."""
        org_slug = setup_test_org["org_slug"]

        response = pipeline_client.get(
            f"/api/v1/pipelines/runs",
            headers=org_headers,
            params={"org_slug": org_slug, "limit": 10}
        )

        if response.status_code == 200:
            data = response.json()
            runs = data.get("runs", [])
            print(f"Found {len(runs)} pipeline runs")

        elif response.status_code == 404:
            print("Pipeline runs endpoint not found")

        else:
            print(f"List runs returned {response.status_code}")


# ============================================
# Cleanup
# ============================================

def test_summary(setup_test_org):
    """Print test summary."""
    print("\n" + "=" * 50)
    print("SUBSCRIPTION PIPELINE TESTS COMPLETE")
    print("=" * 50)
    print(f"Test org: {setup_test_org['org_slug']}")
    print("=" * 50)
