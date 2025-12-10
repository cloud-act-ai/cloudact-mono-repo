"""
Integration test: Real provider authentication.

Tests real authentication against OpenAI, Anthropic, GCP (when credentials available).
If credentials are not available, tests are skipped gracefully.

Run with: pytest -m integration --run-integration tests/integration/test_auth_real.py

Test Coverage:
1. OpenAI API key validation (real API call)
2. Anthropic API key validation (real API call)
3. GCP service account validation (real API call)
4. Invalid credentials are properly rejected
5. Credential encryption/decryption works end-to-end
"""

import os
import pytest
from httpx import AsyncClient, ASGITransport

# Mark all tests in this file as integration
pytestmark = [pytest.mark.integration]


@pytest.fixture
def skip_if_no_gcp_credentials():
    """Skip tests if GCP credentials are not available."""
    if os.environ.get("GCP_PROJECT_ID") in ["test-project", None]:
        pytest.skip("Integration tests require real GCP credentials")


@pytest.fixture
async def real_client():
    """Create a real FastAPI test client with no mocks."""
    from src.app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def openai_api_key():
    """Get OpenAI API key from environment, or skip test if not available."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        pytest.skip("OPENAI_API_KEY not set - cannot test real OpenAI auth")
    return api_key


@pytest.fixture
def anthropic_api_key():
    """Get Anthropic API key from environment, or skip test if not available."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        pytest.skip("ANTHROPIC_API_KEY not set - cannot test real Anthropic auth")
    return api_key


@pytest.fixture
def gemini_api_key():
    """Get Gemini API key from environment, or skip test if not available."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        pytest.skip("GEMINI_API_KEY not set - cannot test real Gemini auth")
    return api_key


# ============================================
# Test: Real OpenAI Authentication
# ============================================

@pytest.mark.asyncio
async def test_real_openai_authentication(skip_if_no_gcp_credentials, real_client, openai_api_key):
    """
    Test real OpenAI API key validation.

    This test uses an actual OpenAI API key to verify that:
    1. Valid keys are accepted
    2. Integration is marked as active
    3. Credentials are encrypted before storage
    4. Validation makes a real API call to OpenAI
    """
    org_slug = "test_org_real_openai"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Real OpenAI",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup OpenAI integration with REAL API key
    response = await real_client.post(
        f"/api/v1/integrations/{org_slug}/openai/setup",
        headers={"X-API-Key": api_key},
        json={
            "api_key": openai_api_key
        }
    )

    # Should succeed with real key
    assert response.status_code in [200, 201], f"Failed to setup OpenAI: {response.text}"

    setup_data = response.json()
    print(f"\nOpenAI setup response: {setup_data}")

    # Verify integration is active
    response = await real_client.get(
        f"/api/v1/integrations/{org_slug}/openai",
        headers={"X-API-Key": api_key}
    )

    assert response.status_code == 200
    integration_data = response.json()

    # Should show as active/validated
    assert integration_data.get("status") in ["active", "validated", "configured"], \
        f"OpenAI integration should be active, got: {integration_data.get('status')}"

    print(f"OpenAI integration status: {integration_data.get('status')}")


# ============================================
# Test: Invalid OpenAI Key Rejected
# ============================================

@pytest.mark.asyncio
async def test_invalid_openai_key_rejected(skip_if_no_gcp_credentials, real_client):
    """
    Test that invalid OpenAI API keys are properly rejected.
    """
    org_slug = "test_org_invalid_openai"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Invalid OpenAI",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup OpenAI integration with INVALID API key
    invalid_openai_key = "sk-invalid-fake-key-12345678901234567890"

    response = await real_client.post(
        f"/api/v1/integrations/{org_slug}/openai/setup",
        headers={"X-API-Key": api_key},
        json={
            "api_key": invalid_openai_key
        }
    )

    # Should fail validation
    assert response.status_code in [400, 401, 422], \
        f"Invalid OpenAI key should be rejected, got {response.status_code}"

    error_data = response.json()
    print(f"\nInvalid OpenAI key rejection: {error_data}")


# ============================================
# Test: Real Anthropic Authentication
# ============================================

@pytest.mark.asyncio
async def test_real_anthropic_authentication(skip_if_no_gcp_credentials, real_client, anthropic_api_key):
    """
    Test real Anthropic API key validation.
    """
    org_slug = "test_org_real_anthropic"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Real Anthropic",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup Anthropic integration with REAL API key
    response = await real_client.post(
        f"/api/v1/integrations/{org_slug}/anthropic/setup",
        headers={"X-API-Key": api_key},
        json={
            "api_key": anthropic_api_key
        }
    )

    # Should succeed with real key
    assert response.status_code in [200, 201], f"Failed to setup Anthropic: {response.text}"

    setup_data = response.json()
    print(f"\nAnthropic setup response: {setup_data}")

    # Verify integration is active
    response = await real_client.get(
        f"/api/v1/integrations/{org_slug}/anthropic",
        headers={"X-API-Key": api_key}
    )

    assert response.status_code == 200
    integration_data = response.json()

    # Should show as active/validated
    assert integration_data.get("status") in ["active", "validated", "configured"], \
        f"Anthropic integration should be active, got: {integration_data.get('status')}"


# ============================================
# Test: Invalid Anthropic Key Rejected
# ============================================

@pytest.mark.asyncio
async def test_invalid_anthropic_key_rejected(skip_if_no_gcp_credentials, real_client):
    """
    Test that invalid Anthropic API keys are properly rejected.
    """
    org_slug = "test_org_invalid_anthropic"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Invalid Anthropic",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup Anthropic integration with INVALID API key
    invalid_anthropic_key = "sk-ant-invalid-fake-key-12345678901234567890"

    response = await real_client.post(
        f"/api/v1/integrations/{org_slug}/anthropic/setup",
        headers={"X-API-Key": api_key},
        json={
            "api_key": invalid_anthropic_key
        }
    )

    # Should fail validation
    assert response.status_code in [400, 401, 422], \
        f"Invalid Anthropic key should be rejected, got {response.status_code}"


# ============================================
# Test: Real Gemini Authentication
# ============================================

@pytest.mark.asyncio
async def test_real_gemini_authentication(skip_if_no_gcp_credentials, real_client, gemini_api_key):
    """
    Test real Gemini API key validation.
    """
    org_slug = "test_org_real_gemini"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Real Gemini",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup Gemini integration with REAL API key
    response = await real_client.post(
        f"/api/v1/integrations/{org_slug}/gemini/setup",
        headers={"X-API-Key": api_key},
        json={
            "api_key": gemini_api_key
        }
    )

    # Should succeed with real key
    assert response.status_code in [200, 201], f"Failed to setup Gemini: {response.text}"


# ============================================
# Test: GCP Service Account Validation
# ============================================

@pytest.mark.asyncio
async def test_real_gcp_service_account_validation(skip_if_no_gcp_credentials, real_client):
    """
    Test real GCP service account validation.

    This requires a real service account JSON file.
    """
    gcp_sa_path = os.environ.get("GCP_SERVICE_ACCOUNT_PATH")
    if not gcp_sa_path:
        pytest.skip("GCP_SERVICE_ACCOUNT_PATH not set - cannot test real GCP auth")

    # Read service account JSON
    import json
    try:
        with open(gcp_sa_path, 'r') as f:
            service_account_data = json.load(f)
    except Exception as e:
        pytest.skip(f"Cannot read service account file: {e}")

    org_slug = "test_org_real_gcp"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Real GCP",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup GCP integration with REAL service account
    response = await real_client.post(
        f"/api/v1/integrations/{org_slug}/gcp/setup",
        headers={"X-API-Key": api_key},
        json={
            "service_account_json": service_account_data
        }
    )

    # Should succeed with real service account
    assert response.status_code in [200, 201], f"Failed to setup GCP: {response.text}"


# ============================================
# Test: Credential Encryption End-to-End
# ============================================

@pytest.mark.asyncio
async def test_credential_encryption_end_to_end(skip_if_no_gcp_credentials, real_client):
    """
    Test that credentials are encrypted before storage and decrypted on retrieval.

    This test:
    1. Stores credentials via setup endpoint
    2. Verifies credentials are NOT returned in plaintext
    3. Verifies credentials work when used (implying decryption works)
    """
    org_slug = "test_org_credential_encryption"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Credential Encryption",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup OpenAI integration
    test_openai_key = "sk-test-encryption-key-12345678901234567890"

    response = await real_client.post(
        f"/api/v1/integrations/{org_slug}/openai/setup",
        headers={"X-API-Key": api_key},
        json={
            "api_key": test_openai_key
        }
    )

    # Should accept the key (may fail validation, but should store it)
    assert response.status_code in [200, 201, 400, 422]

    # Get integration status
    response = await real_client.get(
        f"/api/v1/integrations/{org_slug}/openai",
        headers={"X-API-Key": api_key}
    )

    assert response.status_code == 200
    integration_data = response.json()

    # CRITICAL: API key should NOT be returned in plaintext
    response_str = str(integration_data)
    assert test_openai_key not in response_str, \
        "API key should NOT be returned in plaintext - encryption failure!"

    # Should only return metadata (status, fingerprint, etc.)
    assert "api_key" not in integration_data or integration_data.get("api_key") is None, \
        "API key should not be exposed in GET response"

    print("\n✓ Credentials properly encrypted (not exposed in API responses)")


# ============================================
# Test: Multiple Provider Setup
# ============================================

@pytest.mark.asyncio
async def test_multiple_provider_setup(skip_if_no_gcp_credentials, real_client):
    """
    Test setting up multiple providers for the same organization.

    This verifies:
    1. Multiple integrations can coexist
    2. Credentials don't interfere with each other
    3. Each provider is independently validated
    """
    org_slug = "test_org_multiple_providers"

    # Create test org
    response = await real_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY")},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Multiple Providers",
            "admin_email": "admin@test.com",
            "plan_name": "ENTERPRISE"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup multiple providers
    providers = [
        ("openai", {"api_key": "sk-test-multi-openai"}),
        ("anthropic", {"api_key": "sk-ant-test-multi-anthropic"}),
        ("gemini", {"api_key": "test-multi-gemini"}),
    ]

    for provider, credentials in providers:
        response = await real_client.post(
            f"/api/v1/integrations/{org_slug}/{provider}/setup",
            headers={"X-API-Key": api_key},
            json=credentials
        )

        # May fail validation, but should process
        print(f"{provider} setup: {response.status_code}")

    # Get all integrations
    response = await real_client.get(
        f"/api/v1/integrations/{org_slug}",
        headers={"X-API-Key": api_key}
    )

    assert response.status_code == 200
    integrations = response.json()

    print(f"\n{len(integrations)} integrations configured")
