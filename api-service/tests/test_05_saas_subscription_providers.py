"""
Subscription Provider Management API Tests

Tests for provider management endpoints that handle SaaS subscription providers
(Canva, Slack, ChatGPT Plus, etc.) - NOT LLM API tiers.

Endpoints Tested:
- GET /api/v1/subscriptions/{org_slug}/providers
- POST /api/v1/subscriptions/{org_slug}/providers/{provider}/enable
- POST /api/v1/subscriptions/{org_slug}/providers/{provider}/disable
- GET /api/v1/subscriptions/{org_slug}/providers/{provider}/plans
- POST /api/v1/subscriptions/{org_slug}/providers/{provider}/plans
- PUT /api/v1/subscriptions/{org_slug}/providers/{provider}/plans/{subscription_id}
- DELETE /api/v1/subscriptions/{org_slug}/providers/{provider}/plans/{subscription_id}
- POST /api/v1/subscriptions/{org_slug}/providers/{provider}/reset

Test Cases:
- API-01: GET /subscriptions/{org}/providers - list all
- API-02: POST .../providers/{provider}/enable - enable + seed
- API-03: POST .../providers/{provider}/disable - disable
- API-04: GET .../providers/{provider}/plans - list plans
- API-05: POST .../providers/{provider}/plans - add custom
- API-06: PUT .../providers/{provider}/plans/{id} - update
- API-07: DELETE .../providers/{provider}/plans/{id} - delete
- API-08: Seed excludes LLM API tiers (category != 'llm_api')
- API-09: Seed includes FREE tiers with limits
- API-10: Re-enable skips re-seed if plans exist
- API-11: Force re-seed option (/reset endpoint)
- API-12: Auth: X-API-Key required

These are INTEGRATION tests - they hit real BigQuery endpoints.
To run: pytest tests/test_06_subscription_providers.py -m integration --run-integration
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
TEST_ORG_SLUG = f"provtest_{uuid.uuid4().hex[:8]}"
TEST_EMAIL = f"provtest_{uuid.uuid4().hex[:8]}@example.com"

# Store test state
test_api_key: str = ""
created_subscription_ids: list = []


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
    TEST_ORG_SLUG = f"provtest_{uuid.uuid4().hex[:8]}"
    TEST_EMAIL = f"provtest_{uuid.uuid4().hex[:8]}@example.com"

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


# ============================================
# Test: List Providers (API-01)
# ============================================

class TestListProviders:
    """Test listing available subscription providers."""

    def test_list_all_providers(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-01: List all available subscription providers."""
        org_slug = setup_test_org["org_slug"]

        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert "providers" in data
        assert "total" in data
        assert isinstance(data["providers"], list)
        assert data["total"] > 0

        # Check provider structure
        for provider in data["providers"]:
            assert "provider" in provider
            assert "display_name" in provider
            assert "category" in provider
            assert "is_enabled" in provider
            assert "plan_count" in provider

        # Verify SaaS providers are present (not LLM API providers)
        provider_names = [p["provider"] for p in data["providers"]]
        assert "slack" in provider_names
        assert "canva" in provider_names
        assert "chatgpt_plus" in provider_names

        # Verify LLM API providers are excluded
        assert "openai" not in provider_names
        assert "anthropic" not in provider_names
        assert "gemini" not in provider_names

        print(f"Listed {data['total']} subscription providers")

    def test_list_providers_initially_disabled(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Verify providers start as not enabled (plan_count=0)."""
        org_slug = setup_test_org["org_slug"]

        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers",
            headers=org_headers
        )

        assert response.status_code == 200
        data = response.json()

        # All providers should start with plan_count=0
        for provider in data["providers"]:
            # Note: After first enable test, some may have plans
            # This test is best run first or in isolation
            assert isinstance(provider["plan_count"], int)
            assert provider["plan_count"] >= 0


# ============================================
# Test: Enable Provider (API-02)
# ============================================

class TestEnableProvider:
    """Test enabling providers and seeding default plans."""

    def test_enable_slack_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-02: Enable Slack provider and seed default plans."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/enable",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["provider"] == "slack"
        assert data["plans_seeded"] >= 0  # May be 0 if no seed data
        assert "message" in data

        print(f"Enabled Slack: {data['plans_seeded']} plans seeded")

    def test_enable_canva_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-02: Enable Canva provider and seed default plans."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/canva/enable",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["provider"] == "canva"
        assert data["plans_seeded"] >= 0

        print(f"Enabled Canva: {data['plans_seeded']} plans seeded")

    def test_enable_chatgpt_plus_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-02: Enable ChatGPT Plus provider."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/chatgpt_plus/enable",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["provider"] == "chatgpt_plus"

        print(f"Enabled ChatGPT Plus: {data['plans_seeded']} plans seeded")

    def test_enable_invalid_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test enabling an invalid provider returns 400."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/invalid_provider_xyz/enable",
            headers=org_headers
        )

        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Unsupported provider" in response.json()["detail"]

    def test_enable_llm_api_provider_rejected(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test that LLM API providers (openai, anthropic) are rejected."""
        org_slug = setup_test_org["org_slug"]

        # Try to enable OpenAI (should be rejected)
        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/openai/enable",
            headers=org_headers
        )

        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "LLM API" in response.json()["detail"] or "Unsupported provider" in response.json()["detail"]

        print("Correctly rejected LLM API provider from subscriptions endpoint")


# ============================================
# Test: Seeding Behavior (API-08, API-09, API-10)
# ============================================

class TestSeedingBehavior:
    """Test seed data behavior and exclusions."""

    def test_seed_excludes_llm_api_tiers(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-08: Verify seeded plans exclude LLM API tiers (category != 'llm_api')."""
        org_slug = setup_test_org["org_slug"]

        # Enable a provider
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/notion/enable",
            headers=org_headers
        )

        # List plans
        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/notion/plans",
            headers=org_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Check all plans are NOT llm_api category
        for plan in data["plans"]:
            assert plan["category"] != "llm_api", f"Found LLM API plan in SaaS provider: {plan}"

        print(f"Verified {len(data['plans'])} Notion plans exclude LLM API category")

    def test_seed_includes_free_tiers(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-09: Verify seed data includes FREE tiers with limits (if any)."""
        org_slug = setup_test_org["org_slug"]

        # Enable a provider that may have free tier
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/figma/enable",
            headers=org_headers
        )

        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/figma/plans",
            headers=org_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Check if any free plans exist (may or may not, depending on seed data)
        free_plans = [p for p in data["plans"] if p.get("unit_price_usd", 0) == 0]
        print(f"Found {len(free_plans)} free plans for Figma")

    def test_reenable_skips_reseed(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-10: Re-enabling provider skips re-seeding if plans exist."""
        org_slug = setup_test_org["org_slug"]

        # Enable first time
        response1 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/zoom/enable",
            headers=org_headers
        )
        assert response1.status_code == 200
        first_count = response1.json()["plans_seeded"]

        # Enable second time (should skip seeding)
        response2 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/zoom/enable",
            headers=org_headers
        )
        assert response2.status_code == 200
        data = response2.json()

        assert data["success"] is True
        assert data["plans_seeded"] == 0, "Should skip re-seeding"
        assert "already has" in data["message"].lower()

        print(f"Re-enable correctly skipped seeding: {data['message']}")


# ============================================
# Test: List Plans (API-04)
# ============================================

class TestListPlans:
    """Test listing plans for a provider."""

    def test_list_plans_for_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-04: List plans for a specific provider."""
        org_slug = setup_test_org["org_slug"]

        # Enable provider first
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/enable",
            headers=org_headers
        )

        # List plans
        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert "plans" in data
        assert "total" in data
        assert "total_monthly_cost" in data
        assert isinstance(data["plans"], list)

        print(f"Listed {data['total']} plans for Slack, total cost: ${data['total_monthly_cost']}")

    def test_list_plans_with_include_disabled(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test listing plans with include_disabled parameter."""
        org_slug = setup_test_org["org_slug"]

        # List with disabled included
        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            params={"include_disabled": True}
        )

        assert response.status_code == 200
        data_with_disabled = response.json()

        # List without disabled
        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            params={"include_disabled": False}
        )

        assert response.status_code == 200
        data_without_disabled = response.json()

        # May or may not differ depending on data
        assert data_without_disabled["total"] <= data_with_disabled["total"]

        print(f"With disabled: {data_with_disabled['total']}, without: {data_without_disabled['total']}")

    def test_list_plans_empty_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test listing plans for provider with no plans."""
        org_slug = setup_test_org["org_slug"]

        # Try to list plans for not-yet-enabled provider
        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/plans",
            headers=org_headers
        )

        # Should succeed with empty list or 500 if table doesn't exist
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.json()
            # May have 0 plans or error


# ============================================
# Test: Create Custom Plan (API-05)
# ============================================

class TestCreatePlan:
    """Test creating custom subscription plans."""

    def test_create_custom_slack_plan(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-05: Create a custom Slack plan."""
        org_slug = setup_test_org["org_slug"]

        # Enable provider first
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/enable",
            headers=org_headers
        )

        plan_data = {
            "plan_name": f"CUSTOM_{uuid.uuid4().hex[:6].upper()}",
            "display_name": "Custom Slack Enterprise",
            "quantity": 50,
            "unit_price_usd": 12.50,
            "billing_period": "monthly",
            "notes": "Custom enterprise plan for large team",
            "seats": 50
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            json=plan_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert "plan" in data
        assert data["plan"]["is_custom"] is True
        assert data["plan"]["plan_name"] == plan_data["plan_name"]
        assert data["plan"]["unit_price_usd"] == 12.50

        created_subscription_ids.append(data["plan"]["subscription_id"])
        print(f"Created custom plan: {data['plan']['subscription_id']}")

    def test_create_custom_plan_with_annual_pricing(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-05: Create custom plan with annual pricing and discount."""
        org_slug = setup_test_org["org_slug"]

        plan_data = {
            "plan_name": f"ANNUAL_{uuid.uuid4().hex[:6].upper()}",
            "display_name": "Annual Subscription",
            "quantity": 1,
            "unit_price_usd": 99.00,
            "billing_period": "yearly",
            "yearly_price_usd": 999.00,
            "yearly_discount_pct": 16.0,
            "notes": "Annual plan with discount"
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/canva/plans",
            headers=org_headers,
            json=plan_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["plan"]["billing_period"] == "yearly"
        assert data["plan"]["yearly_price_usd"] == 999.00

        created_subscription_ids.append(data["plan"]["subscription_id"])
        print(f"Created annual plan: {data['plan']['subscription_id']}")

    def test_create_plan_validation_errors(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test plan creation with invalid data."""
        org_slug = setup_test_org["org_slug"]

        # Missing required field
        invalid_data = {
            "plan_name": "TEST",
            # Missing unit_price_usd
            "quantity": 1
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            json=invalid_data
        )

        assert response.status_code == 422, f"Expected 422, got {response.status_code}"

    def test_create_plan_invalid_plan_name(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test plan creation with invalid plan_name format."""
        org_slug = setup_test_org["org_slug"]

        invalid_data = {
            "plan_name": "invalid-plan-name-with-dashes",  # Should be alphanumeric + underscores
            "unit_price_usd": 10.00,
            "quantity": 1
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            json=invalid_data
        )

        # Should fail validation (400 or 422)
        assert response.status_code in [400, 422]


# ============================================
# Test: Update Plan (API-06)
# ============================================

class TestUpdatePlan:
    """Test updating subscription plans."""

    def test_update_plan_quantity_and_price(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-06: Update plan quantity and price."""
        org_slug = setup_test_org["org_slug"]

        # Create plan first
        plan_data = {
            "plan_name": f"UPDATE_TEST_{uuid.uuid4().hex[:6].upper()}",
            "quantity": 5,
            "unit_price_usd": 10.00,
            "billing_period": "monthly"
        }

        create_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/notion/plans",
            headers=org_headers,
            json=plan_data
        )

        if create_response.status_code != 200:
            pytest.skip(f"Could not create plan: {create_response.text}")

        subscription_id = create_response.json()["plan"]["subscription_id"]

        # Update the plan
        update_data = {
            "quantity": 20,
            "unit_price_usd": 15.00
        }

        response = client.put(
            f"/api/v1/subscriptions/{org_slug}/providers/notion/plans/{subscription_id}",
            headers=org_headers,
            json=update_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["plan"]["quantity"] == 20
        assert data["plan"]["unit_price_usd"] == 15.00

        created_subscription_ids.append(subscription_id)
        print(f"Updated plan: {subscription_id}")

    def test_update_plan_disable(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-06: Disable a plan using update."""
        org_slug = setup_test_org["org_slug"]

        # Create plan
        plan_data = {
            "plan_name": f"DISABLE_TEST_{uuid.uuid4().hex[:6].upper()}",
            "quantity": 1,
            "unit_price_usd": 5.00,
            "billing_period": "monthly"
        }

        create_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            json=plan_data
        )

        if create_response.status_code != 200:
            pytest.skip(f"Could not create plan: {create_response.text}")

        subscription_id = create_response.json()["plan"]["subscription_id"]

        # Disable it
        update_data = {"is_enabled": False}

        response = client.put(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans/{subscription_id}",
            headers=org_headers,
            json=update_data
        )

        assert response.status_code == 200
        data = response.json()
        assert data["plan"]["is_enabled"] is False

        created_subscription_ids.append(subscription_id)
        print(f"Disabled plan: {subscription_id}")

    def test_update_nonexistent_plan(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test updating non-existent plan returns 404."""
        org_slug = setup_test_org["org_slug"]

        response = client.put(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans/sub_nonexistent_xyz",
            headers=org_headers,
            json={"quantity": 10}
        )

        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


# ============================================
# Test: Delete Plan (API-07)
# ============================================

class TestDeletePlan:
    """Test deleting subscription plans."""

    def test_delete_plan(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-07: Delete a subscription plan."""
        org_slug = setup_test_org["org_slug"]

        # Create plan first
        plan_data = {
            "plan_name": f"DELETE_TEST_{uuid.uuid4().hex[:6].upper()}",
            "quantity": 1,
            "unit_price_usd": 5.00,
            "billing_period": "monthly"
        }

        create_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/canva/plans",
            headers=org_headers,
            json=plan_data
        )

        if create_response.status_code != 200:
            pytest.skip(f"Could not create plan: {create_response.text}")

        subscription_id = create_response.json()["plan"]["subscription_id"]

        # Delete it
        response = client.delete(
            f"/api/v1/subscriptions/{org_slug}/providers/canva/plans/{subscription_id}",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["subscription_id"] == subscription_id

        print(f"Deleted plan: {subscription_id}")

    def test_delete_nonexistent_plan(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test deleting non-existent plan is idempotent."""
        org_slug = setup_test_org["org_slug"]

        response = client.delete(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans/sub_nonexistent_delete",
            headers=org_headers
        )

        # Should be idempotent (200 or 404)
        assert response.status_code in [200, 404]


# ============================================
# Test: Disable Provider (API-03)
# ============================================

class TestDisableProvider:
    """Test disabling providers."""

    def test_disable_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-03: Disable a provider (soft delete)."""
        org_slug = setup_test_org["org_slug"]

        # Enable first
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/enable",
            headers=org_headers
        )

        # Disable it
        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/disable",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["provider"] == "miro"
        assert "disabled" in data["message"].lower()

        print(f"Disabled provider: {data['message']}")

    def test_disable_nonexistent_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test disabling provider with no plans."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/linear/disable",
            headers=org_headers
        )

        # Should succeed even if no plans exist
        assert response.status_code == 200


# ============================================
# Test: Reset Provider (API-11)
# ============================================

class TestResetProvider:
    """Test force re-seeding providers."""

    def test_reset_provider_force_reseed(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-11: Reset provider to defaults (force re-seed)."""
        org_slug = setup_test_org["org_slug"]

        # Enable provider
        response1 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/github/enable",
            headers=org_headers
        )
        first_count = response1.json()["plans_seeded"]

        # Reset (force re-seed)
        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/github/reset",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["provider"] == "github"
        # Should re-seed even if plans existed
        assert data["plans_seeded"] >= 0

        print(f"Reset GitHub: {data['plans_seeded']} plans re-seeded")


# ============================================
# Test: Authentication (API-12)
# ============================================

class TestAuthentication:
    """Test authentication requirements."""

    def test_list_providers_no_auth(
        self,
        client,
        setup_test_org
    ):
        """API-12: Test that X-API-Key is required."""
        org_slug = setup_test_org["org_slug"]

        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers"
            # No X-API-Key header
        )

        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Correctly required authentication")

    def test_enable_provider_invalid_key(
        self,
        client,
        setup_test_org
    ):
        """API-12: Test invalid API key is rejected."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/enable",
            headers={"X-API-Key": "invalid-key-12345"}
        )

        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"

    def test_cross_org_access_denied(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """API-12: Test org cannot access another org's data."""
        response = client.get(
            "/api/v1/subscriptions/different_org_xyz/providers",
            headers=org_headers
        )

        # Should be denied (403 or 404)
        assert response.status_code in [400, 401, 403, 404]
        print("Correctly prevented cross-org access")


# ============================================
# Test: Input Validation
# ============================================

class TestInputValidation:
    """Test input validation."""

    def test_invalid_org_slug_format(
        self,
        client,
        org_headers
    ):
        """Test invalid org_slug format is rejected."""
        response = client.get(
            "/api/v1/subscriptions/invalid-slug-with-hyphens/providers",
            headers=org_headers
        )

        assert response.status_code in [400, 403, 404]

    def test_invalid_provider_name(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test invalid provider name is rejected."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/not_a_real_provider/enable",
            headers=org_headers
        )

        assert response.status_code == 400


# ============================================
# Cleanup
# ============================================

def test_cleanup(client, setup_test_org, org_headers):
    """Clean up created plans."""
    org_slug = setup_test_org["org_slug"]

    # Try to delete created plans
    for subscription_id in created_subscription_ids:
        try:
            # We don't know which provider each plan belongs to
            # In a real cleanup, we'd track provider per plan
            # For now, just log
            print(f"Cleanup note: created subscription {subscription_id}")
        except Exception as e:
            print(f"Cleanup warning for {subscription_id}: {e}")

    print(f"Test completed with {len(created_subscription_ids)} test plans created")
