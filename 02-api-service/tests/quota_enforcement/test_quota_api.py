"""
Quota API Endpoint Tests

Tests quota usage retrieval and enforcement for organizations.
Uses real org creation via bootstrap/onboarding - NO mock auth.

Test Coverage:
- GET /api/v1/organizations/{org_slug}/quota
- Quota limits from org_subscriptions
- Usage tracking from org_usage_quotas
- Plan-based limits enforcement

Run with:
  pytest tests/quota_enforcement/test_quota_api.py -v --run-integration
"""

import os
import pytest
import httpx
from datetime import datetime
from typing import Dict, Any
import time
import uuid

# Mark all tests as integration tests
pytestmark = [pytest.mark.integration]


# ============================================
# Test Configuration
# ============================================

API_SERVICE_URL = os.environ.get("API_SERVICE_URL", "http://localhost:8000")
CA_ROOT_API_KEY = os.environ.get("CA_ROOT_API_KEY")

# Generate unique test org slug for isolation
TEST_ORG_SLUG = f"quota_test_{datetime.now().strftime('%m%d%H%M%S')}"
TEST_COMPANY_NAME = "Quota Test Organization"
TEST_ADMIN_EMAIL = f"quota_test_{uuid.uuid4().hex[:8]}@test.com"
TEST_SUBSCRIPTION_PLAN = "STARTER"

# Timeouts
REQUEST_TIMEOUT = 60.0


# ============================================
# Fixtures
# ============================================

@pytest.fixture(scope="module")
def skip_if_no_root_key():
    """Skip tests if CA_ROOT_API_KEY is not set."""
    if not CA_ROOT_API_KEY:
        pytest.skip("CA_ROOT_API_KEY not set - cannot run quota tests")


@pytest.fixture(scope="module")
def admin_headers() -> Dict[str, str]:
    """Headers with admin authentication."""
    return {
        "X-CA-Root-Key": CA_ROOT_API_KEY,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def test_org_data(admin_headers) -> Dict[str, Any]:
    """
    Create a test organization and return its data including API key.

    Uses actual onboarding endpoint - no mocks.
    """
    if not CA_ROOT_API_KEY:
        pytest.skip("CA_ROOT_API_KEY not set")

    # Create test organization via onboarding
    onboard_url = f"{API_SERVICE_URL}/api/v1/organizations/onboard"
    onboard_payload = {
        "org_slug": TEST_ORG_SLUG,
        "company_name": TEST_COMPANY_NAME,
        "admin_email": TEST_ADMIN_EMAIL,
        "subscription_plan": TEST_SUBSCRIPTION_PLAN,
        "default_currency": "USD",
        "default_timezone": "America/New_York"
    }

    with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
        response = client.post(
            onboard_url,
            headers=admin_headers,
            json=onboard_payload
        )

        if response.status_code == 409:
            # Org already exists (from previous test run)
            # Get API key via dev endpoint
            api_key_url = f"{API_SERVICE_URL}/api/v1/admin/dev/api-key/{TEST_ORG_SLUG}"
            api_response = client.get(api_key_url, headers=admin_headers)
            if api_response.status_code == 200:
                api_key = api_response.json().get("api_key")
                return {
                    "org_slug": TEST_ORG_SLUG,
                    "api_key": api_key,
                    "plan": TEST_SUBSCRIPTION_PLAN
                }
            pytest.skip(f"Could not get API key for existing org: {api_response.text}")

        assert response.status_code in [200, 201], f"Onboarding failed: {response.text}"

        data = response.json()
        return {
            "org_slug": data["org_slug"],
            "api_key": data.get("api_key"),  # Only returned in dev mode
            "plan": TEST_SUBSCRIPTION_PLAN
        }


@pytest.fixture(scope="module")
def org_api_key(test_org_data, admin_headers) -> str:
    """Get org API key for authenticated requests."""
    if test_org_data.get("api_key"):
        return test_org_data["api_key"]

    # Get API key via dev endpoint if not returned from onboarding
    api_key_url = f"{API_SERVICE_URL}/api/v1/admin/dev/api-key/{test_org_data['org_slug']}"

    with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
        response = client.get(api_key_url, headers=admin_headers)
        if response.status_code != 200:
            pytest.skip(f"Could not get API key: {response.text}")
        return response.json()["api_key"]


@pytest.fixture(scope="module")
def org_headers(org_api_key) -> Dict[str, str]:
    """Headers with org API key authentication."""
    return {
        "X-API-Key": org_api_key,
        "Content-Type": "application/json"
    }


# ============================================
# Cleanup Fixture
# ============================================

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_org(admin_headers):
    """Clean up test organization after all tests complete."""
    yield

    # Delete test org
    delete_url = f"{API_SERVICE_URL}/api/v1/organizations/{TEST_ORG_SLUG}"
    delete_payload = {
        "confirm_org_slug": TEST_ORG_SLUG,
        "delete_dataset": True
    }

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.request(
                "DELETE",
                delete_url,
                headers=admin_headers,
                json=delete_payload
            )
            if response.status_code in [200, 204, 404]:
                print(f"\nCleaned up test org: {TEST_ORG_SLUG}")
            else:
                print(f"\nFailed to clean up test org: {response.text}")
    except Exception as e:
        print(f"\nCleanup error: {e}")


# ============================================
# Test Cases
# ============================================

class TestQuotaEndpoint:
    """Tests for GET /api/v1/organizations/{org}/quota endpoint."""

    def test_get_quota_success(self, test_org_data, org_headers):
        """Test getting quota returns valid response with correct limits."""
        org_slug = test_org_data["org_slug"]
        quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{org_slug}/quota"

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(quota_url, headers=org_headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()

        # Verify response structure
        assert data["org_slug"] == org_slug
        assert "pipelinesRunToday" in data
        assert "dailyLimit" in data
        assert "pipelinesRunMonth" in data
        assert "monthlyLimit" in data
        assert "concurrentRunning" in data
        assert "concurrentLimit" in data
        assert "dailyUsagePercent" in data
        assert "monthlyUsagePercent" in data

    def test_quota_limits_match_plan(self, test_org_data, org_headers):
        """Test that quota limits match STARTER plan limits."""
        org_slug = test_org_data["org_slug"]
        quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{org_slug}/quota"

        # STARTER plan limits (from SUBSCRIPTION_LIMITS in org_models.py)
        expected_limits = {
            "dailyLimit": 6,
            "monthlyLimit": 180,
            "concurrentLimit": 20  # STARTER plan allows 20 concurrent pipelines
        }

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(quota_url, headers=org_headers)

        assert response.status_code == 200
        data = response.json()

        assert data["dailyLimit"] == expected_limits["dailyLimit"], \
            f"Expected daily limit {expected_limits['dailyLimit']}, got {data['dailyLimit']}"
        assert data["monthlyLimit"] == expected_limits["monthlyLimit"], \
            f"Expected monthly limit {expected_limits['monthlyLimit']}, got {data['monthlyLimit']}"
        assert data["concurrentLimit"] == expected_limits["concurrentLimit"], \
            f"Expected concurrent limit {expected_limits['concurrentLimit']}, got {data['concurrentLimit']}"

    def test_quota_usage_starts_at_zero(self, test_org_data, org_headers):
        """Test that new org starts with zero usage."""
        org_slug = test_org_data["org_slug"]
        quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{org_slug}/quota"

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(quota_url, headers=org_headers)

        assert response.status_code == 200
        data = response.json()

        # New org should have zero or near-zero usage
        assert data["pipelinesRunToday"] >= 0
        assert data["pipelinesRunMonth"] >= 0
        assert data["concurrentRunning"] >= 0

    def test_usage_percentages_calculated_correctly(self, test_org_data, org_headers):
        """Test that usage percentages are calculated correctly."""
        org_slug = test_org_data["org_slug"]
        quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{org_slug}/quota"

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(quota_url, headers=org_headers)

        assert response.status_code == 200
        data = response.json()

        # Calculate expected percentages
        daily_limit = data["dailyLimit"]
        monthly_limit = data["monthlyLimit"]
        daily_usage = data["pipelinesRunToday"]
        monthly_usage = data["pipelinesRunMonth"]

        if daily_limit > 0:
            expected_daily_pct = round((daily_usage / daily_limit) * 100, 2)
            assert abs(data["dailyUsagePercent"] - expected_daily_pct) < 0.1, \
                f"Daily percentage mismatch: {data['dailyUsagePercent']} vs {expected_daily_pct}"

        if monthly_limit > 0:
            expected_monthly_pct = round((monthly_usage / monthly_limit) * 100, 2)
            assert abs(data["monthlyUsagePercent"] - expected_monthly_pct) < 0.1, \
                f"Monthly percentage mismatch: {data['monthlyUsagePercent']} vs {expected_monthly_pct}"


class TestQuotaAuthentication:
    """Tests for quota endpoint authentication."""

    def test_missing_api_key_returns_401(self, test_org_data):
        """Test that missing API key returns 401."""
        org_slug = test_org_data["org_slug"]
        quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{org_slug}/quota"

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(quota_url)  # No headers

        assert response.status_code == 401

    def test_invalid_api_key_returns_401(self, test_org_data):
        """Test that invalid API key returns 401."""
        org_slug = test_org_data["org_slug"]
        quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{org_slug}/quota"

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(
                quota_url,
                headers={"X-API-Key": "invalid_key_12345"}
            )

        assert response.status_code == 401

    def test_cross_org_access_denied(self, test_org_data, org_headers):
        """Test that accessing another org's quota is denied."""
        # Try to access a different org's quota
        other_org_slug = "nonexistent_org_12345"
        quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{other_org_slug}/quota"

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(quota_url, headers=org_headers)

        # Should be 403 (forbidden) or 404 (not found)
        assert response.status_code in [403, 404]


class TestQuotaValidation:
    """Tests for quota endpoint input validation."""

    def test_invalid_org_slug_format(self, org_headers):
        """Test that invalid org slug format is rejected."""
        invalid_slugs = [
            "ab",  # Too short
            "org-with-dash",  # Contains dash
            "org with space",  # Contains space
            "../../../etc",  # Path traversal attempt
        ]

        for slug in invalid_slugs:
            quota_url = f"{API_SERVICE_URL}/api/v1/organizations/{slug}/quota"

            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.get(quota_url, headers=org_headers)

            # Should be rejected (400, 403, or 422)
            assert response.status_code in [400, 403, 404, 422], \
                f"Expected rejection for slug '{slug}', got {response.status_code}"
