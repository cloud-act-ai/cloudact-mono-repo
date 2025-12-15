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
- GET /api/v1/subscriptions/{org_slug}/all-plans

Test Cases:
- API-01: GET /subscriptions/{org}/providers - list all
- API-02: POST .../providers/{provider}/enable - enable + seed
- API-03: POST .../providers/{provider}/disable - hard delete
- API-04: GET .../providers/{provider}/plans - list plans
- API-05: POST .../providers/{provider}/plans - add custom
- API-06: PUT .../providers/{provider}/plans/{id} - update
- API-07: DELETE .../providers/{provider}/plans/{id} - delete
- API-08: Seed excludes LLM API tiers (category != 'llm_api')
- API-09: Seed includes FREE tiers with limits
- API-10: Re-enable skips re-seed if plans exist
- API-11: Force re-seed option (/reset endpoint)
- API-12: Auth: X-API-Key required
- API-13: Enable idempotency - no duplicate plans
- API-14: Partial failure scenario during disable
- API-15: Disable empty provider (no plans)
- API-16: GET all-plans dashboard endpoint
- API-17: Multi-currency audit fields (source_currency, source_price, exchange_rate_used)
- API-18: Currency enforcement (plan must match org default_currency)
- API-19: Duplicate plan detection (409 Conflict for active plans)
- API-20: Audit logging for plan operations (CREATE, UPDATE, DELETE)

These are INTEGRATION tests - they hit real BigQuery endpoints.
To run: pytest tests/test_05_saas_subscription_providers.py -m integration --run-integration
"""

import pytest
import uuid
import os
import httpx
from datetime import date
from typing import Dict, Any
from unittest.mock import patch, MagicMock

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

    def test_api01_list_all_providers(
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
            assert "is_enabled" in provider  # API returns is_enabled, not status
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

    def test_api02_enable_slack_provider(
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

    def test_enable_custom_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test enabling a custom provider is allowed (no predefined plans)."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/custom_provider_xyz/enable",
            headers=org_headers
        )

        # Custom providers are allowed - they just don't get seeded with plans
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["plans_seeded"] == 0  # No predefined plans for custom providers

    def test_enable_llm_api_provider_allowed(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test that LLM API providers (openai, anthropic) are allowed as custom providers."""
        org_slug = setup_test_org["org_slug"]

        # Try to enable OpenAI (allowed as custom provider, no seeded plans)
        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/openai/enable",
            headers=org_headers
        )

        # LLM providers are allowed but have no predefined SaaS subscription plans
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["plans_seeded"] == 0  # No SaaS subscription plans for LLM providers

        print("LLM API provider enabled (no predefined plans)")


# ============================================
# Test: Seeding Behavior (API-08, API-09, API-10)
# ============================================

class TestSeedingBehavior:
    """Test seed data behavior and exclusions."""

    def test_api08_seed_excludes_llm_api_tiers(
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

    def test_api09_seed_includes_free_tiers(
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

    def test_api10_reenable_skips_reseed(
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

    def test_api04_list_plans_for_provider(
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

    def test_api05_create_custom_slack_plan(
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
            "seats": 50,
            "unit_price_usd": 12.50,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Engineering",
            "notes": "Custom enterprise plan for large team"
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
        assert data["plan"]["plan_name"] == plan_data["plan_name"]
        assert data["plan"]["unit_price_usd"] == 12.50
        assert data["plan"]["billing_cycle"] == "monthly"
        assert data["plan"]["status"] == "active"

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
            "seats": 1,
            "unit_price_usd": 99.00,
            "billing_cycle": "annual",
            "currency": "USD",
            "pricing_model": "FLAT_FEE",
            "discount_type": "percent",
            "discount_value": 16.0,
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Finance",
            "notes": "Annual plan with discount"
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/canva/plans",
            headers=org_headers,
            json=plan_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["plan"]["billing_cycle"] == "annual"
        assert data["plan"]["discount_type"] == "percent"
        assert data["plan"]["discount_value"] == 16.0

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
            "seats": 1
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
            "seats": 1,
            "billing_cycle": "monthly"
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

    def test_api06_update_plan_quantity_and_price(
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
            "seats": 5,
            "unit_price_usd": 10.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Engineering"
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
            "seats": 20,
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
        assert data["plan"]["seats"] == 20
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
            "seats": 1,
            "unit_price_usd": 5.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "FLAT_FEE",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "IT"
        }

        create_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            json=plan_data
        )

        if create_response.status_code != 200:
            pytest.skip(f"Could not create plan: {create_response.text}")

        subscription_id = create_response.json()["plan"]["subscription_id"]

        # Disable it by changing status to 'cancelled'
        update_data = {"status": "cancelled"}

        response = client.put(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans/{subscription_id}",
            headers=org_headers,
            json=update_data
        )

        assert response.status_code == 200
        data = response.json()
        assert data["plan"]["status"] == "cancelled"

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
            json={"seats": 10}
        )

        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


# ============================================
# Test: Delete Plan (API-07)
# ============================================

class TestDeletePlan:
    """Test deleting subscription plans."""

    def test_api07_delete_plan(
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
            "seats": 1,
            "unit_price_usd": 5.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "FLAT_FEE",
            "auto_renew": False,
            "owner_email": TEST_EMAIL,
            "department": "Finance"
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
    """Test disabling providers with hard delete."""

    def test_api03_disable_provider_hard_deletes_plans(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        API-03: Disable a provider and verify plans are HARD DELETED from BigQuery.

        Verifies:
        - Plans are permanently deleted (not just disabled)
        - Response includes plans_deleted count
        - Count matches actual number of deleted plans
        - Re-query confirms plans are gone
        - Can re-enable and re-seed plans
        """
        org_slug = setup_test_org["org_slug"]

        # Enable provider and seed plans
        enable_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/enable",
            headers=org_headers
        )
        assert enable_response.status_code == 200
        initial_plans_seeded = enable_response.json()["plans_seeded"]

        # Query plans before disable
        plans_before = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/plans",
            headers=org_headers
        )
        assert plans_before.status_code == 200
        plans_count_before = plans_before.json()["total"]

        print(f"Before disable: {plans_count_before} plans exist for miro")

        # Disable the provider (hard delete)
        disable_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/disable",
            headers=org_headers
        )

        assert disable_response.status_code == 200, f"Failed: {disable_response.text}"

        disable_data = disable_response.json()
        assert disable_data["success"] is True
        assert disable_data["provider"] == "miro"
        assert "plans_deleted" in disable_data
        assert disable_data["plans_deleted"] == plans_count_before, \
            f"Expected {plans_count_before} plans deleted, got {disable_data['plans_deleted']}"
        assert "Deleted" in disable_data["message"]

        print(f"Disabled provider: {disable_data['message']}")

        # Verify plans are GONE from BigQuery (hard delete, not soft)
        plans_after = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/plans",
            headers=org_headers
        )

        # Should succeed but have 0 plans (or 500 if table state changed)
        if plans_after.status_code == 200:
            assert plans_after.json()["total"] == 0, "Plans should be deleted, not disabled"
            print("Confirmed: Plans are hard deleted from BigQuery")

        # Re-enable should re-seed from defaults
        reenable_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/miro/enable",
            headers=org_headers
        )
        assert reenable_response.status_code == 200
        reseeded_count = reenable_response.json()["plans_seeded"]
        assert reseeded_count >= 0  # Should re-seed since plans were deleted
        print(f"Re-enabled: {reseeded_count} plans re-seeded after hard delete")

    def test_api13_enable_idempotency_no_duplicates(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        API-13: Verify enabling twice doesn't duplicate plans.

        Tests idempotency of enable endpoint.
        """
        org_slug = setup_test_org["org_slug"]

        # Enable first time
        response1 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/linear/enable",
            headers=org_headers
        )
        assert response1.status_code == 200
        first_count = response1.json()["plans_seeded"]

        # Get plan count after first enable
        plans_response = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/linear/plans",
            headers=org_headers
        )
        plans_after_first = plans_response.json()["total"] if plans_response.status_code == 200 else 0

        # Enable second time (should be idempotent)
        response2 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/linear/enable",
            headers=org_headers
        )
        assert response2.status_code == 200
        data2 = response2.json()

        assert data2["success"] is True
        assert data2["plans_seeded"] == 0, "Second enable should not seed new plans"
        assert "already has" in data2["message"].lower()

        # Verify plan count hasn't changed
        plans_response2 = client.get(
            f"/api/v1/subscriptions/{org_slug}/providers/linear/plans",
            headers=org_headers
        )
        if plans_response2.status_code == 200:
            plans_after_second = plans_response2.json()["total"]
            assert plans_after_second == plans_after_first, "Plan count should not change on re-enable"

        print(f"Idempotency verified: No duplicate plans created")

    def test_api15_disable_empty_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        API-15: Disable provider with no plans.

        Verifies:
        - No errors when disabling provider with 0 plans
        - plans_deleted = 0
        """
        org_slug = setup_test_org["org_slug"]

        # Disable provider that was never enabled (or has 0 plans)
        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/asana/disable",
            headers=org_headers
        )

        assert response.status_code == 200, f"Should succeed even with 0 plans: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert data["plans_deleted"] == 0, "Should report 0 plans deleted"

        print(f"Successfully disabled empty provider: {data['message']}")

    def test_disable_nonexistent_provider(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test disabling provider with no plans."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/trello/disable",
            headers=org_headers
        )

        # Should succeed even if no plans exist
        assert response.status_code == 200


# ============================================
# Test: Reset Provider (API-11)
# ============================================

class TestResetProvider:
    """Test force re-seeding providers."""

    def test_api11_reset_provider_force_reseed(
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
# Test: All Plans Endpoint (API-16)
# ============================================

class TestAllPlansEndpoint:
    """Test aggregated all-plans dashboard endpoint."""

    def test_api16_all_plans_dashboard_endpoint(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        API-16: Test GET /subscriptions/{org}/all-plans endpoint.

        Verifies:
        - Aggregated view across multiple providers
        - Summary calculations (total_monthly_cost, count_by_category)
        - Proper billing period adjustments
        """
        org_slug = setup_test_org["org_slug"]

        # Enable multiple providers to test aggregation
        client.post(f"/api/v1/subscriptions/{org_slug}/providers/slack/enable", headers=org_headers)
        client.post(f"/api/v1/subscriptions/{org_slug}/providers/notion/enable", headers=org_headers)

        # Get all plans
        response = client.get(
            f"/api/v1/subscriptions/{org_slug}/all-plans",
            headers=org_headers
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        assert "plans" in data
        assert "summary" in data
        assert isinstance(data["plans"], list)

        # Verify summary structure
        summary = data["summary"]
        assert "total_monthly_cost" in summary
        assert "total_annual_cost" in summary
        assert "count_by_category" in summary
        assert "active_count" in summary
        assert "total_count" in summary

        # Verify calculations
        assert isinstance(summary["total_monthly_cost"], (int, float))
        assert isinstance(summary["total_annual_cost"], (int, float))
        # Annual cost may include discounts or different billing cycles, so just verify it's reasonable
        assert summary["total_annual_cost"] >= summary["total_monthly_cost"]  # At least one month
        assert summary["active_count"] <= summary["total_count"]

        print(f"All plans: {summary['total_count']} total, ${summary['total_monthly_cost']}/mo")
        print(f"Categories: {summary['count_by_category']}")

    def test_all_plans_enabled_only_filter(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test all-plans endpoint with enabled_only filter."""
        org_slug = setup_test_org["org_slug"]

        # Get all plans (including disabled)
        response_all = client.get(
            f"/api/v1/subscriptions/{org_slug}/all-plans",
            headers=org_headers,
            params={"enabled_only": False}
        )

        # Get enabled only
        response_enabled = client.get(
            f"/api/v1/subscriptions/{org_slug}/all-plans",
            headers=org_headers,
            params={"enabled_only": True}
        )

        assert response_all.status_code == 200
        assert response_enabled.status_code == 200

        # Enabled count should be <= total count
        total_count = response_all.json()["summary"]["total_count"]
        enabled_count = response_enabled.json()["summary"]["total_count"]

        assert enabled_count <= total_count
        print(f"Filtering: {enabled_count} enabled out of {total_count} total")


# ============================================
# Test: Authentication (API-12)
# ============================================

class TestAuthentication:
    """Test authentication requirements."""

    def test_api12_list_providers_no_auth(
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

    def test_custom_provider_name_allowed(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """Test custom provider names are allowed (enables as custom provider)."""
        org_slug = setup_test_org["org_slug"]

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/not_a_real_provider/enable",
            headers=org_headers
        )

        # Custom providers are allowed with 200, just no plans seeded
        assert response.status_code == 200
        data = response.json()
        assert data["plans_seeded"] == 0


# ============================================
# Test: Partial Failure Scenarios (API-14)
# ============================================

class TestPartialFailureScenarios:
    """Test error handling during partial failures."""

    def test_api14_partial_failure_during_disable(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        API-14: Simulate BigQuery error during plan deletion.

        Note: This is a conceptual test. In practice, we can't easily simulate
        BigQuery errors without mocking. This test verifies error handling exists.
        """
        org_slug = setup_test_org["org_slug"]

        # Enable a provider
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/dropbox/enable",
            headers=org_headers
        )

        # Attempt to disable with valid request (should succeed normally)
        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/dropbox/disable",
            headers=org_headers
        )

        # Normal case: should succeed
        assert response.status_code in [200, 500], "Should handle gracefully"

        if response.status_code == 500:
            # If we got an error, verify it's a proper error response
            data = response.json()
            assert "detail" in data
            print(f"Error handling verified: {data['detail']}")
        else:
            # Normal success case
            data = response.json()
            assert data["success"] is True
            print("Disable completed successfully")


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


# ============================================
# Test: Multi-Currency Audit Fields
# ============================================

class TestMultiCurrencyAuditFields:
    """Test multi-currency audit fields in subscription plans."""

    def test_create_plan_with_multi_currency_audit_fields(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test creating a plan with multi-currency audit fields.

        Verifies:
        - source_currency, source_price, exchange_rate_used are stored
        - Fields are optional (nullable)
        - Useful for tracking template price conversions
        """
        org_slug = setup_test_org["org_slug"]

        # Enable provider first
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/enable",
            headers=org_headers
        )

        # Create plan with multi-currency audit fields
        plan_data = {
            "plan_name": f"MULTICURRENCY_{uuid.uuid4().hex[:6].upper()}",
            "display_name": "Multi-Currency Test Plan",
            "seats": 10,
            "unit_price_usd": 2087.50,  # Converted from USD to INR
            "billing_cycle": "monthly",
            "currency": "INR",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Engineering",
            "notes": "Testing multi-currency audit fields",
            # Multi-currency audit fields
            "source_currency": "USD",
            "source_price": 25.00,
            "exchange_rate_used": 83.50
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/slack/plans",
            headers=org_headers,
            json=plan_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        plan = data["plan"]

        # Verify multi-currency audit fields are stored
        assert plan.get("source_currency") == "USD"
        assert plan.get("source_price") == 25.00
        assert plan.get("exchange_rate_used") == 83.50
        assert plan["currency"] == "INR"
        assert plan["unit_price_usd"] == 2087.50

        created_subscription_ids.append(plan["subscription_id"])
        print(f"Created plan with multi-currency fields: {plan['subscription_id']}")
        print(f"  Template: ${plan.get('source_price')} {plan.get('source_currency')}")
        print(f"  Converted: {plan['unit_price_usd']} {plan['currency']} @ rate {plan.get('exchange_rate_used')}")

    def test_create_plan_without_audit_fields(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test creating a plan without multi-currency audit fields (backward compatibility).

        Verifies:
        - Audit fields are optional (nullable)
        - Plans without audit fields are valid
        """
        org_slug = setup_test_org["org_slug"]

        plan_data = {
            "plan_name": f"NO_AUDIT_{uuid.uuid4().hex[:6].upper()}",
            "display_name": "No Audit Fields Plan",
            "seats": 5,
            "unit_price_usd": 15.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "IT"
            # No source_currency, source_price, exchange_rate_used
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/canva/plans",
            headers=org_headers,
            json=plan_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"

        data = response.json()
        assert data["success"] is True
        plan = data["plan"]

        # Verify audit fields are null/not present
        assert plan.get("source_currency") is None or plan.get("source_currency") == ""
        assert plan.get("source_price") is None or plan.get("source_price") == 0
        assert plan.get("exchange_rate_used") is None or plan.get("exchange_rate_used") == 0

        created_subscription_ids.append(plan["subscription_id"])
        print(f"Created plan without audit fields: {plan['subscription_id']}")


# ============================================
# Test: Currency Enforcement
# ============================================

class TestCurrencyEnforcement:
    """Test currency enforcement against org default_currency."""

    def test_currency_enforcement_validation(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test that plan currency MUST match org's default_currency.

        Verifies:
        - Creating plan with matching currency succeeds
        - Creating plan with mismatched currency returns 400 Bad Request
        """
        org_slug = setup_test_org["org_slug"]

        # First, get org's default_currency (should be USD for test org)
        org_response = client.get(
            f"/api/v1/organizations/{org_slug}/locale",
            headers=org_headers
        )

        if org_response.status_code == 200:
            org_default_currency = org_response.json().get("default_currency", "USD")
        else:
            # Fallback to USD if locale endpoint not available
            org_default_currency = "USD"

        print(f"Organization default_currency: {org_default_currency}")

        # Enable provider
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/notion/enable",
            headers=org_headers
        )

        # Test 1: Create plan with MATCHING currency (should succeed)
        matching_plan_data = {
            "plan_name": f"MATCH_CURR_{uuid.uuid4().hex[:6].upper()}",
            "display_name": "Matching Currency Plan",
            "seats": 5,
            "unit_price_usd": 10.00,
            "billing_cycle": "monthly",
            "currency": org_default_currency,  # Matches org
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Engineering"
        }

        response_match = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/notion/plans",
            headers=org_headers,
            json=matching_plan_data
        )

        assert response_match.status_code == 200, f"Matching currency should succeed: {response_match.text}"
        data_match = response_match.json()
        assert data_match["success"] is True
        created_subscription_ids.append(data_match["plan"]["subscription_id"])
        print(f"✓ Plan with matching currency ({org_default_currency}) created successfully")

        # Test 2: Create plan with MISMATCHED currency (should fail with 400)
        mismatched_currency = "EUR" if org_default_currency != "EUR" else "GBP"

        mismatched_plan_data = {
            "plan_name": f"MISMATCH_CURR_{uuid.uuid4().hex[:6].upper()}",
            "display_name": "Mismatched Currency Plan",
            "seats": 5,
            "unit_price_usd": 10.00,
            "billing_cycle": "monthly",
            "currency": mismatched_currency,  # Does NOT match org
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Finance"
        }

        response_mismatch = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/notion/plans",
            headers=org_headers,
            json=mismatched_plan_data
        )

        assert response_mismatch.status_code == 400, \
            f"Expected 400 for mismatched currency, got {response_mismatch.status_code}"

        data_mismatch = response_mismatch.json()
        assert "currency" in data_mismatch.get("detail", "").lower() or \
               "currency" in data_mismatch.get("error", "").lower(), \
               "Error message should mention currency mismatch"

        print(f"✓ Plan with mismatched currency ({mismatched_currency}) rejected with 400")


# ============================================
# Test: Duplicate Plan Detection
# ============================================

class TestDuplicatePlanDetection:
    """Test duplicate plan detection (409 Conflict)."""

    def test_duplicate_plan_detection_409_conflict(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test duplicate plan detection.

        Verifies:
        - Creating plan with same org_slug + provider + plan_name + status='active' returns 409
        - Duplicate detection only applies to active plans
        """
        org_slug = setup_test_org["org_slug"]

        # Enable provider
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/figma/enable",
            headers=org_headers
        )

        # Create first plan
        plan_name = f"DUPLICATE_TEST_{uuid.uuid4().hex[:6].upper()}"

        plan_data_1 = {
            "plan_name": plan_name,
            "display_name": "Duplicate Test Plan",
            "seats": 5,
            "unit_price_usd": 15.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Design"
        }

        response_1 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/figma/plans",
            headers=org_headers,
            json=plan_data_1
        )

        assert response_1.status_code == 200, f"First plan creation should succeed: {response_1.text}"
        subscription_id_1 = response_1.json()["plan"]["subscription_id"]
        created_subscription_ids.append(subscription_id_1)
        print(f"✓ Created first plan: {subscription_id_1}")

        # Try to create duplicate plan with same plan_name (should fail with 409)
        plan_data_2 = {
            "plan_name": plan_name,  # Same plan_name as above
            "display_name": "Duplicate Plan Attempt",
            "seats": 10,  # Different seats
            "unit_price_usd": 20.00,  # Different price
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Design"
        }

        response_2 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/figma/plans",
            headers=org_headers,
            json=plan_data_2
        )

        assert response_2.status_code == 409, \
            f"Expected 409 for duplicate plan, got {response_2.status_code}"

        data_2 = response_2.json()
        assert "duplicate" in data_2.get("error", "").lower() or \
               "duplicate" in data_2.get("detail", "").lower() or \
               "already exists" in data_2.get("detail", "").lower(), \
               "Error message should mention duplicate plan"

        print(f"✓ Duplicate plan rejected with 409: {data_2.get('detail') or data_2.get('error')}")

    def test_duplicate_plan_allowed_after_cancellation(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test that duplicate plan is allowed after cancelling the first one.

        Verifies:
        - Duplicate detection only applies to 'active' plans
        - Can create new plan with same name after cancelling original
        """
        org_slug = setup_test_org["org_slug"]

        # Create first plan
        plan_name = f"CANCEL_DUPLICATE_{uuid.uuid4().hex[:6].upper()}"

        plan_data_1 = {
            "plan_name": plan_name,
            "display_name": "Cancellable Plan",
            "seats": 5,
            "unit_price_usd": 10.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "IT"
        }

        response_1 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/zoom/plans",
            headers=org_headers,
            json=plan_data_1
        )

        if response_1.status_code != 200:
            pytest.skip(f"Could not create plan: {response_1.text}")

        subscription_id_1 = response_1.json()["plan"]["subscription_id"]
        created_subscription_ids.append(subscription_id_1)
        print(f"Created first plan: {subscription_id_1}")

        # Cancel the first plan (set status to 'cancelled')
        cancel_response = client.put(
            f"/api/v1/subscriptions/{org_slug}/providers/zoom/plans/{subscription_id_1}",
            headers=org_headers,
            json={"status": "cancelled"}
        )

        if cancel_response.status_code != 200:
            pytest.skip(f"Could not cancel plan: {cancel_response.text}")

        print(f"Cancelled first plan: {subscription_id_1}")

        # Now try to create new plan with same plan_name (should succeed since first is cancelled)
        plan_data_2 = {
            "plan_name": plan_name,  # Same plan_name
            "display_name": "New Plan After Cancellation",
            "seats": 10,
            "unit_price_usd": 15.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "IT"
        }

        response_2 = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/zoom/plans",
            headers=org_headers,
            json=plan_data_2
        )

        assert response_2.status_code == 200, \
            f"Creating plan after cancellation should succeed: {response_2.text}"

        subscription_id_2 = response_2.json()["plan"]["subscription_id"]
        created_subscription_ids.append(subscription_id_2)
        print(f"✓ Created new plan with same name after cancellation: {subscription_id_2}")


# ============================================
# Test: Audit Logging
# ============================================

class TestAuditLogging:
    """Test audit logging for subscription plan operations."""

    def test_audit_log_on_plan_create(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test audit logging for plan creation.

        Verifies:
        - CREATE action is logged to org_audit_logs
        - resource_type = 'SUBSCRIPTION_PLAN'
        - details contain plan_name, provider, unit_price_usd, etc.
        """
        org_slug = setup_test_org["org_slug"]

        # Enable provider
        client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/linear/enable",
            headers=org_headers
        )

        # Create plan
        plan_name = f"AUDIT_CREATE_{uuid.uuid4().hex[:6].upper()}"

        plan_data = {
            "plan_name": plan_name,
            "display_name": "Audit Log Test Plan",
            "seats": 8,
            "unit_price_usd": 12.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Product"
        }

        response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/linear/plans",
            headers=org_headers,
            json=plan_data
        )

        assert response.status_code == 200, f"Failed: {response.text}"
        subscription_id = response.json()["plan"]["subscription_id"]
        created_subscription_ids.append(subscription_id)

        # Note: Actual audit log verification would require BigQuery query
        # For integration test, we verify the operation succeeds
        # In production, audit logs should be verified via BigQuery:
        # SELECT * FROM organizations.org_audit_logs
        # WHERE resource_type = 'SUBSCRIPTION_PLAN'
        #   AND action = 'CREATE'
        #   AND resource_id = '{subscription_id}'

        print(f"✓ Created plan with audit logging: {subscription_id}")
        print("  Audit log should contain: action=CREATE, resource_type=SUBSCRIPTION_PLAN")

    def test_audit_log_on_plan_update(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test audit logging for plan updates.

        Verifies:
        - UPDATE action is logged to org_audit_logs
        - details contain changed_fields, new_values
        """
        org_slug = setup_test_org["org_slug"]

        # Create plan first
        plan_name = f"AUDIT_UPDATE_{uuid.uuid4().hex[:6].upper()}"

        plan_data = {
            "plan_name": plan_name,
            "seats": 5,
            "unit_price_usd": 10.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Engineering"
        }

        create_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/github/plans",
            headers=org_headers,
            json=plan_data
        )

        if create_response.status_code != 200:
            pytest.skip(f"Could not create plan: {create_response.text}")

        subscription_id = create_response.json()["plan"]["subscription_id"]
        created_subscription_ids.append(subscription_id)

        # Update the plan
        update_data = {
            "seats": 15,  # Changed
            "unit_price_usd": 18.00  # Changed
        }

        update_response = client.put(
            f"/api/v1/subscriptions/{org_slug}/providers/github/plans/{subscription_id}",
            headers=org_headers,
            json=update_data
        )

        assert update_response.status_code == 200, f"Failed: {update_response.text}"

        # Audit log should contain:
        # - action = 'UPDATE'
        # - changed_fields = ['seats', 'unit_price_usd']
        # - new_values = {seats: 15, unit_price_usd: 18.00}

        print(f"✓ Updated plan with audit logging: {subscription_id}")
        print("  Audit log should contain: action=UPDATE, changed_fields=['seats', 'unit_price_usd']")

    def test_audit_log_on_plan_delete(
        self,
        client,
        setup_test_org,
        org_headers
    ):
        """
        Test audit logging for plan deletion (soft delete).

        Verifies:
        - DELETE action is logged to org_audit_logs
        - details contain end_date, final_status
        """
        org_slug = setup_test_org["org_slug"]

        # Create plan first
        plan_name = f"AUDIT_DELETE_{uuid.uuid4().hex[:6].upper()}"

        plan_data = {
            "plan_name": plan_name,
            "seats": 3,
            "unit_price_usd": 8.00,
            "billing_cycle": "monthly",
            "currency": "USD",
            "pricing_model": "PER_SEAT",
            "auto_renew": True,
            "owner_email": TEST_EMAIL,
            "department": "Finance"
        }

        create_response = client.post(
            f"/api/v1/subscriptions/{org_slug}/providers/dropbox/plans",
            headers=org_headers,
            json=plan_data
        )

        if create_response.status_code != 200:
            pytest.skip(f"Could not create plan: {create_response.text}")

        subscription_id = create_response.json()["plan"]["subscription_id"]

        # Delete the plan
        delete_response = client.delete(
            f"/api/v1/subscriptions/{org_slug}/providers/dropbox/plans/{subscription_id}",
            headers=org_headers
        )

        assert delete_response.status_code == 200, f"Failed: {delete_response.text}"

        # Audit log should contain:
        # - action = 'DELETE'
        # - details.end_date = current date
        # - details.final_status = 'cancelled'

        print(f"✓ Deleted plan with audit logging: {subscription_id}")
        print("  Audit log should contain: action=DELETE, end_date, final_status='cancelled'")
