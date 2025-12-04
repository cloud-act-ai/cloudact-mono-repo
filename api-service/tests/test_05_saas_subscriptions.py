"""
SaaS Subscription API Tests - Generic Subscription CRUD Operations

Tests for unified SaaS subscription management across all providers
(openai, anthropic, gemini, chatgpt_plus, slack, canva, etc.)

These are INTEGRATION tests - they hit real BigQuery endpoints.
No mocking of database operations.

Endpoints Tested:
- GET /api/v1/integrations/{org_slug}/{provider}/subscriptions
- POST /api/v1/integrations/{org_slug}/{provider}/subscriptions
- PUT /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
- DELETE /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
- POST /api/v1/integrations/{org_slug}/{provider}/subscriptions/reset

Providers: openai, anthropic, gemini, chatgpt_plus, cursor, slack, canva, custom

To run integration tests with real BigQuery:
    pytest tests/test_05_saas_subscriptions.py -m integration --run-integration

To run only unit tests (no BigQuery required):
    pytest tests/test_05_saas_subscriptions.py -m "not integration"
"""

import pytest
import uuid
import os
import httpx
from datetime import date
from typing import Dict, Any

# Mark as E2E/Integration tests
pytestmark = [
    pytest.mark.e2e,
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("RUN_INTEGRATION_TESTS", "").lower() != "true",
        reason="Integration tests require running server. Set RUN_INTEGRATION_TESTS=true to run."
    )
]

# ============================================
# Test Configuration
# ============================================

BASE_URL = os.environ.get("API_SERVICE_URL", "http://localhost:8000")
ROOT_KEY = os.environ.get("CA_ROOT_API_KEY", "test-ca-root-key-dev-32chars")

# Test org - created during test setup
TEST_ORG_SLUG = f"saas_test_{uuid.uuid4().hex[:8]}"
TEST_EMAIL = f"saas_test_{uuid.uuid4().hex[:8]}@example.com"

# Store test state
test_api_key: str = ""
created_plan_names: list = []


# ============================================
# Test Fixtures
# ============================================

@pytest.fixture(scope="module")
def client():
    """HTTP client for API requests."""
    return httpx.Client(base_url=BASE_URL, timeout=60.0)


@pytest.fixture(scope="module")
def setup_test_org(client):
    """Create a test organization for all tests in this module."""
    global test_api_key, TEST_ORG_SLUG, TEST_EMAIL

    # Create unique test org
    TEST_ORG_SLUG = f"saas_test_{uuid.uuid4().hex[:8]}"
    TEST_EMAIL = f"saas_test_{uuid.uuid4().hex[:8]}@example.com"

    print(f"\nCreating test org: {TEST_ORG_SLUG}")

    response = client.post(
        "/api/v1/organizations/onboard",
        headers={
            "X-CA-Root-Key": ROOT_KEY,
            "Content-Type": "application/json"
        },
        json={
            "org_slug": TEST_ORG_SLUG,
            "company_name": f"{TEST_ORG_SLUG} Corp",
            "admin_email": TEST_EMAIL,
            "subscription_plan": "STARTER",
            "regenerate_api_key_if_exists": True
        }
    )

    if response.status_code != 200:
        pytest.fail(f"Failed to create test org: {response.status_code} {response.text}")

    data = response.json()
    test_api_key = data.get("api_key", "")

    print(f"Test org created with API key: {test_api_key[:20]}...")

    yield {
        "org_slug": TEST_ORG_SLUG,
        "api_key": test_api_key,
        "email": TEST_EMAIL
    }

    # Cleanup is handled by BigQuery TTL or manual cleanup


@pytest.fixture
def org_headers(setup_test_org):
    """Headers with org API key."""
    return {
        "X-API-Key": setup_test_org["api_key"],
        "Content-Type": "application/json"
    }


@pytest.fixture
def saas_subscription_canva():
    """Canva Pro subscription test data."""
    return {
        "subscription_id": f"sub_canva_{uuid.uuid4().hex[:8]}",
        "plan_name": f"CANVA_PRO_{uuid.uuid4().hex[:6].upper()}",
        "quantity": 5,
        "unit_price_usd": 12.99,
        "effective_date": str(date.today()),
        "tier_type": "paid",
        "billing_period": "monthly",
        "notes": "Canva Pro subscription for design team"
    }


@pytest.fixture
def saas_subscription_slack():
    """Slack Pro subscription test data."""
    return {
        "subscription_id": f"sub_slack_{uuid.uuid4().hex[:8]}",
        "plan_name": f"SLACK_PRO_{uuid.uuid4().hex[:6].upper()}",
        "quantity": 10,
        "unit_price_usd": 8.75,
        "effective_date": str(date.today()),
        "tier_type": "paid",
        "billing_period": "monthly",
        "notes": "Slack Pro for team communication"
    }


@pytest.fixture
def saas_subscription_chatgpt():
    """ChatGPT Plus subscription test data."""
    return {
        "subscription_id": f"sub_chatgpt_{uuid.uuid4().hex[:8]}",
        "plan_name": f"CHATGPT_PLUS_{uuid.uuid4().hex[:6].upper()}",
        "quantity": 1,
        "unit_price_usd": 20.00,
        "effective_date": str(date.today()),
        "tier_type": "paid",
        "billing_period": "monthly",
        "notes": "ChatGPT Plus subscription"
    }


@pytest.fixture
def saas_subscription_annual():
    """Annual billing subscription test data."""
    return {
        "subscription_id": f"sub_annual_{uuid.uuid4().hex[:8]}",
        "plan_name": f"ANNUAL_PLAN_{uuid.uuid4().hex[:6].upper()}",
        "quantity": 1,
        "unit_price_usd": 99.00,
        "effective_date": str(date.today()),
        "tier_type": "paid",
        "billing_period": "yearly",
        "yearly_price_usd": 999.00,
        "yearly_discount_percentage": 17,
        "notes": "Annual billing with discount"
    }


# ============================================
# Test: Create Subscriptions
# ============================================

class TestCreateSubscription:
    """Test subscription creation for various providers."""

    def test_create_canva_subscription(
        self,
        client,
        setup_test_org,
        org_headers,
        saas_subscription_canva
    ):
        """Create a Canva Pro subscription."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=saas_subscription_canva
        )

        # May return 201 or 200 depending on implementation
        assert response.status_code in [200, 201], f"Failed: {response.text}"

        data = response.json()
        assert data["plan_name"] == saas_subscription_canva["plan_name"]
        assert data["unit_price_usd"] == 12.99
        assert data["is_custom"] is True

        created_plan_names.append(("custom", saas_subscription_canva["plan_name"]))
        print(f"Created Canva subscription: {data['plan_name']}")

    def test_create_slack_subscription(
        self,
        client,
        setup_test_org,
        org_headers,
        saas_subscription_slack
    ):
        """Create a Slack Pro subscription."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=saas_subscription_slack
        )

        assert response.status_code in [200, 201], f"Failed: {response.text}"

        data = response.json()
        assert data["plan_name"] == saas_subscription_slack["plan_name"]
        assert data["quantity"] == 10

        created_plan_names.append(("custom", saas_subscription_slack["plan_name"]))
        print(f"Created Slack subscription: {data['plan_name']}")

    def test_create_annual_subscription(
        self,
        client,
        setup_test_org,
        org_headers,
        saas_subscription_annual
    ):
        """Create a subscription with annual billing."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=saas_subscription_annual
        )

        assert response.status_code in [200, 201], f"Failed: {response.text}"

        data = response.json()
        assert data["billing_period"] == "yearly"
        assert data.get("yearly_price_usd") == 999.00

        created_plan_names.append(("custom", saas_subscription_annual["plan_name"]))
        print(f"Created annual subscription: {data['plan_name']}")

    def test_create_subscription_missing_required_fields(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test that missing required fields returns validation error."""
        org_slug = setup_test_org["org_slug"]

        # Missing subscription_id and effective_date
        invalid_data = {
            "plan_name": "INVALID_PLAN",
            "quantity": 1,
            "unit_price_usd": 10.00
        }

        response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=invalid_data
        )

        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("Correctly rejected subscription with missing fields")


# ============================================
# Test: List Subscriptions
# ============================================

class TestListSubscriptions:
    """Test subscription listing operations."""

    def test_list_custom_subscriptions(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """List all custom subscriptions for the org."""
        org_slug = setup_test_org["org_slug"]

        response = client.get(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert "subscriptions" in data
        assert isinstance(data["subscriptions"], list)

        print(f"Listed {data.get('count', len(data['subscriptions']))} custom subscriptions")

    def test_list_subscriptions_pagination(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test subscription listing with pagination."""
        org_slug = setup_test_org["org_slug"]

        response = client.get(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            params={"limit": 2, "offset": 0}
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        # Should respect limit
        assert len(data["subscriptions"]) <= 2
        print(f"Pagination test: got {len(data['subscriptions'])} subscriptions")


# ============================================
# Test: Update Subscriptions
# ============================================

class TestUpdateSubscription:
    """Test subscription update operations."""

    def test_update_subscription_quantity(
        self,
        client,
        setup_test_org,
        org_headers,
        saas_subscription_canva
    ):
        """Update subscription quantity and price."""
        org_slug = setup_test_org["org_slug"]

        # First create the subscription
        create_response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=saas_subscription_canva
        )

        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create subscription: {create_response.text}")

        plan_name = saas_subscription_canva["plan_name"]

        # Update it
        update_data = {
            "quantity": 20,
            "unit_price_usd": 14.99
        }

        response = client.put(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions/{plan_name}",
            headers=org_headers,
            json=update_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["quantity"] == 20
        assert data["unit_price_usd"] == 14.99

        created_plan_names.append(("custom", plan_name))
        print(f"Updated subscription: {plan_name}")

    def test_update_nonexistent_subscription(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test updating a non-existent subscription."""
        org_slug = setup_test_org["org_slug"]

        response = client.put(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions/NONEXISTENT_PLAN_XYZ",
            headers=org_headers,
            json={"quantity": 10}
        )

        # Should return 400 or 404
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        print("Correctly handled update of non-existent subscription")


# ============================================
# Test: Delete Subscriptions
# ============================================

class TestDeleteSubscription:
    """Test subscription deletion operations."""

    def test_delete_subscription(
        self,
        client,
        setup_test_org,
        org_headers,
        saas_subscription_slack
    ):
        """Delete an existing subscription."""
        org_slug = setup_test_org["org_slug"]

        # First create
        create_response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=saas_subscription_slack
        )

        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create subscription: {create_response.text}")

        plan_name = saas_subscription_slack["plan_name"]

        # Delete it
        response = client.delete(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions/{plan_name}",
            headers=org_headers
        )

        # Should succeed with 200 or 204
        assert response.status_code in [200, 204], f"Failed: {response.text}"
        print(f"Deleted subscription: {plan_name}")

    def test_delete_nonexistent_subscription(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test deleting a non-existent subscription."""
        org_slug = setup_test_org["org_slug"]

        response = client.delete(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions/NONEXISTENT_PLAN_DELETE",
            headers=org_headers
        )

        # Should return 200/204 (idempotent) or 404
        assert response.status_code in [200, 204, 404], f"Expected 200/204/404, got {response.status_code}"
        print("Correctly handled delete of non-existent subscription")


# ============================================
# Test: Billing Period Variations
# ============================================

class TestBillingPeriods:
    """Test various billing period configurations."""

    def test_monthly_billing(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test monthly billing subscription."""
        org_slug = setup_test_org["org_slug"]

        subscription = {
            "subscription_id": f"sub_monthly_{uuid.uuid4().hex[:8]}",
            "plan_name": f"MONTHLY_{uuid.uuid4().hex[:6].upper()}",
            "quantity": 1,
            "unit_price_usd": 29.99,
            "effective_date": str(date.today()),
            "billing_period": "monthly"
        }

        response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=subscription
        )

        assert response.status_code in [200, 201], f"Failed: {response.text}"

        data = response.json()
        assert data["billing_period"] == "monthly"

        created_plan_names.append(("custom", subscription["plan_name"]))
        print("Created monthly billing subscription")

    def test_yearly_billing_with_discount(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test yearly billing with discount percentage."""
        org_slug = setup_test_org["org_slug"]

        subscription = {
            "subscription_id": f"sub_yearly_{uuid.uuid4().hex[:8]}",
            "plan_name": f"YEARLY_{uuid.uuid4().hex[:6].upper()}",
            "quantity": 1,
            "unit_price_usd": 99.00,  # Monthly equivalent
            "effective_date": str(date.today()),
            "billing_period": "yearly",
            "yearly_price_usd": 999.00,
            "yearly_discount_percentage": 16  # 16% off vs monthly
        }

        response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=subscription
        )

        assert response.status_code in [200, 201], f"Failed: {response.text}"

        data = response.json()
        assert data["billing_period"] == "yearly"
        assert data.get("yearly_discount_percentage") == 16

        created_plan_names.append(("custom", subscription["plan_name"]))
        print("Created yearly billing subscription with discount")

    def test_pay_as_you_go(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test pay-as-you-go billing (for API tiers)."""
        org_slug = setup_test_org["org_slug"]

        subscription = {
            "subscription_id": f"sub_payg_{uuid.uuid4().hex[:8]}",
            "plan_name": f"PAY_AS_YOU_GO_{uuid.uuid4().hex[:6].upper()}",
            "quantity": 0,  # No fixed quantity
            "unit_price_usd": 0.00,  # No fixed price
            "effective_date": str(date.today()),
            "billing_period": "pay_as_you_go",
            "tier_type": "paid",
            "rpm_limit": 3000,
            "tpm_limit": 60000
        }

        response = client.post(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers=org_headers,
            json=subscription
        )

        assert response.status_code in [200, 201], f"Failed: {response.text}"

        data = response.json()
        assert data["billing_period"] == "pay_as_you_go"

        created_plan_names.append(("custom", subscription["plan_name"]))
        print("Created pay-as-you-go subscription")


# ============================================
# Test: Authentication & Authorization
# ============================================

class TestAuth:
    """Test authentication and authorization."""

    def test_no_auth_header(self, client, setup_test_org):
        """Test that missing auth returns 401/403."""
        org_slug = setup_test_org["org_slug"]

        response = client.get(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions"
            # No X-API-Key header
        )

        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Correctly required authentication")

    def test_invalid_api_key(self, client, setup_test_org):
        """Test that invalid API key returns 401/403."""
        org_slug = setup_test_org["org_slug"]

        response = client.get(
            f"/api/v1/integrations/{org_slug}/custom/subscriptions",
            headers={"X-API-Key": "invalid-api-key-xxxxxx"}
        )

        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Correctly rejected invalid API key")

    def test_wrong_org_access(self, client, setup_test_org, org_headers):
        """Test that org can't access another org's subscriptions."""
        response = client.get(
            "/api/v1/integrations/different_org_slug/custom/subscriptions",
            headers=org_headers
        )

        # Should be 403 (forbidden) or 404 (not found)
        assert response.status_code in [400, 401, 403, 404], f"Expected 400/401/403/404, got {response.status_code}"
        print("Correctly prevented cross-org access")


# ============================================
# Cleanup
# ============================================

def test_cleanup(client, setup_test_org, org_headers):
    """Clean up created subscriptions."""
    org_slug = setup_test_org["org_slug"]

    for provider, plan_name in created_plan_names:
        try:
            client.delete(
                f"/api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}",
                headers=org_headers
            )
        except Exception as e:
            print(f"Cleanup warning for {plan_name}: {e}")

    print(f"Cleaned up {len(created_plan_names)} subscriptions")
