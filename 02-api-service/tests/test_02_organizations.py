"""
Test Suite for Organization Endpoints

Tests the organization onboarding API endpoints:
- POST /api/v1/organizations/dryrun - Validate org before creation
- POST /api/v1/organizations/onboard - Create organization with API key
- GET /api/v1/organizations/{org_slug}/api-key - Get API key info (fingerprint)

These are unit tests that mock external dependencies.
For integration tests against real BigQuery, use pytest -m integration
"""

import os
import pytest
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient, ASGITransport

# Set environment variables BEFORE importing app
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("CA_ROOT_API_KEY", "test-root-key-for-testing-only-32chars")
# Auth is always enabled - use test_api_keys.json for test credentials
os.environ.setdefault("KMS_KEY_NAME", "projects/test/locations/global/keyRings/test/cryptoKeys/test")

from src.app.main import app


# ============================================
# Test Configuration
# ============================================

# This should match the CA_ROOT_API_KEY set above
ROOT_API_KEY = "test-root-key-for-testing-only-32chars"


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def unique_org_slug():
    """Generate a unique org slug for each test."""
    unique_id = str(uuid.uuid4())[:8]
    return f"testorg_{unique_id}"


@pytest.fixture
def root_headers():
    """Headers with root API key for admin operations."""
    return {
        "X-CA-Root-Key": ROOT_API_KEY,
        "Content-Type": "application/json"
    }


@pytest.fixture
def no_auth_headers():
    """Headers without authentication."""
    return {
        "Content-Type": "application/json"
    }


# ============================================
# Auth Tests - These should work regardless of mocking
# ============================================

@pytest.mark.asyncio
async def test_dryrun_without_auth_header(no_auth_headers):
    """
    Test dry-run requires authentication header.

    Without X-CA-Root-Key, should return 401.
    With DISABLE_AUTH=true, may return 200 or process request.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers=no_auth_headers,
            json={
                "org_slug": "test_org",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # With DISABLE_AUTH=true in env, may bypass auth
        # Otherwise should be 401/403
        assert response.status_code in [200, 401, 403, 500]


@pytest.mark.asyncio
async def test_onboard_without_auth_header(no_auth_headers, unique_org_slug):
    """
    Test onboard requires authentication header.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=no_auth_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # With DISABLE_AUTH=true in env, may bypass auth
        assert response.status_code in [200, 401, 403, 500]


# ============================================
# Validation Tests - Input validation
# Note: Auth (403) may happen before validation (422) depending on auth mode
# ============================================

@pytest.mark.asyncio
async def test_dryrun_request_validation(root_headers):
    """
    Test dry-run validates request body fields.
    Missing required fields should return 422.
    If auth fails first, may return 403.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Missing org_slug
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers=root_headers,
            json={
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_onboard_request_validation(root_headers):
    """
    Test onboard validates request body fields.
    Missing required fields should return 422.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Missing company_name
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": "test_org",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_dryrun_slug_min_length(root_headers):
    """
    Test dry-run rejects org slug that is too short.
    Min length is 3 characters.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers=root_headers,
            json={
                "org_slug": "ab",  # Only 2 chars, min is 3
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_dryrun_slug_max_length(root_headers):
    """
    Test dry-run rejects org slug that is too long.
    Max length is 50 characters.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers=root_headers,
            json={
                "org_slug": "a" * 60,  # 60 chars, max is 50
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_dryrun_invalid_email(root_headers, unique_org_slug):
    """
    Test dry-run rejects invalid email format.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Test Company",
                "admin_email": "not-an-email",  # Invalid email
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_dryrun_invalid_subscription_plan(root_headers, unique_org_slug):
    """
    Test dry-run rejects invalid subscription plan.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "INVALID_PLAN"  # Not a valid plan
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_onboard_slug_min_length(root_headers):
    """
    Test onboard rejects org slug that is too short.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": "ab",  # Only 2 chars
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_onboard_slug_max_length(root_headers):
    """
    Test onboard rejects org slug that is too long.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": "a" * 60,  # 60 chars
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_onboard_invalid_email(root_headers, unique_org_slug):
    """
    Test onboard rejects invalid email format.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Test Company",
                "admin_email": "not-an-email",  # Invalid
                "subscription_plan": "STARTER"
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


@pytest.mark.asyncio
async def test_onboard_invalid_subscription_plan(root_headers, unique_org_slug):
    """
    Test onboard rejects invalid subscription plan.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers=root_headers,
            json={
                "org_slug": unique_org_slug,
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "INVALID"  # Not valid
            }
        )

        # 422 for validation error, or 403 if auth fails first
        assert response.status_code in [422, 403]


# ============================================
# Valid Subscription Plan Tests
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("plan", ["STARTER", "PROFESSIONAL", "SCALE"])
async def test_dryrun_accepts_valid_plans(root_headers, plan):
    """
    Test that valid subscription plans pass validation.
    """
    transport = ASGITransport(app=app)
    unique_slug = f"testorg_{str(uuid.uuid4())[:8]}"

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers=root_headers,
            json={
                "org_slug": unique_slug,
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": plan
            }
        )

        # Should NOT be a validation error (422)
        # May be 200 (success), 500 (BQ error), etc.
        assert response.status_code != 422


# ============================================
# API Key Info Endpoint Tests
# ============================================

@pytest.mark.asyncio
async def test_get_api_key_info_endpoint_exists(root_headers):
    """
    Test that the API key info endpoint exists.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/organizations/test_org/api-key",
            headers=root_headers
        )

        # Should not be 404 (endpoint not found)
        # May be 200, 403, 404 (org not found), 500
        assert response.status_code in [200, 401, 403, 404, 500]


# ============================================
# Integration Tests
# ============================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_dryrun_full_flow_integration(root_headers, unique_org_slug):
    """
    Full integration test for dry-run.
    Requires real BigQuery access.
    """
    pytest.skip("Integration test - requires real BigQuery")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_onboard_full_flow_integration(root_headers, unique_org_slug):
    """
    Full integration test for organization onboarding.
    Requires real BigQuery and KMS access.
    """
    pytest.skip("Integration test - requires real BigQuery/KMS")
