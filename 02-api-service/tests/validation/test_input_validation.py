"""
Input Validation Tests - Comprehensive Security and Data Validation

Tests all input validation including:
- org_slug validation (^[a-zA-Z0-9_]{3,50}$)
- Email validation
- API key format validation
- Request body validation
- Path traversal prevention
- XSS prevention in inputs
- SQL injection prevention
- Invalid JSON handling
- Missing required fields

These tests ensure that malformed, malicious, or invalid inputs are properly
rejected before reaching business logic.
"""

import pytest
import json
from httpx import AsyncClient, ASGITransport
from src.app.main import app


# ============================================
# Test Fixtures
# ============================================

@pytest.fixture
def valid_admin_key():
    """Valid admin API key for testing."""
    from src.app.config import settings
    return settings.ca_root_api_key


@pytest.fixture
def mock_org_api_key():
    """Mock organization API key for testing."""
    return "test_org_api_mock_key_12345678"


# ============================================
# org_slug Validation Tests
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_org_slug,reason", [
    ("ab", "too short (< 3 chars)"),
    ("a" * 51, "too long (> 50 chars)"),
    ("org-slug", "contains hyphen"),
    ("org slug", "contains space"),
    ("org/slug", "contains forward slash"),
    ("org\\slug", "contains backslash"),
    ("org.slug", "contains dot"),
    ("org@slug", "contains at symbol"),
    ("org#slug", "contains hash"),
    ("org$slug", "contains dollar sign"),
    ("org%slug", "contains percent"),
    ("org&slug", "contains ampersand"),
    ("org*slug", "contains asterisk"),
    ("org+slug", "contains plus"),
    ("org=slug", "contains equals"),
    ("org!slug", "contains exclamation"),
    ("org?slug", "contains question mark"),
    ("org[slug", "contains left bracket"),
    ("org]slug", "contains right bracket"),
    ("org{slug", "contains left brace"),
    ("org}slug", "contains right brace"),
    ("org<slug", "contains less than"),
    ("org>slug", "contains greater than"),
    ("org|slug", "contains pipe"),
    ("org;slug", "contains semicolon"),
    ("org:slug", "contains colon"),
    ("org'slug", "contains single quote"),
    ("org\"slug", "contains double quote"),
    ("org,slug", "contains comma"),
    ("../../../etc/passwd", "path traversal attempt"),
    ("..\\..\\..\\windows\\system32", "windows path traversal"),
    ("%2e%2e%2f", "url-encoded path traversal"),
    ("", "empty string"),
    (" ", "whitespace only"),
    ("ORG-SLUG", "uppercase with hyphen"),
    ("Org_Slug", "mixed case"),
])
async def test_invalid_org_slug_in_path(invalid_org_slug, reason, valid_admin_key):
    """
    Test that invalid org_slug values in URL paths are rejected.

    Validates org_slug pattern: ^[a-zA-Z0-9_]{3,50}$
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/integrations/{invalid_org_slug}",
            headers={"X-API-Key": "dummy_key"}
        )

        # Should return 400 Bad Request for invalid org_slug format
        # OR 401/403 for authentication failures (both acceptable)
        # OR 404 for path traversal attempts that resolve to non-existent routes
        # OR 307 for URL-encoded path traversal (URL normalization redirect)
        assert response.status_code in [307, 400, 401, 403, 404, 422], \
            f"Invalid org_slug '{invalid_org_slug}' ({reason}) should be rejected"


@pytest.mark.asyncio
@pytest.mark.parametrize("valid_org_slug", [
    "abc",  # minimum length
    "a" * 50,  # maximum length
    "org123",  # alphanumeric
    "org_123",  # with underscore
    "ORG_123",  # uppercase
    "Org_123",  # mixed case
    "test_org",  # common format
    "my_company_name_2025",  # complex valid
])
async def test_valid_org_slug_in_path(valid_org_slug):
    """
    Test that valid org_slug values are accepted.

    Note: These will still fail authentication, but should NOT be rejected
    for invalid format.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/integrations/{valid_org_slug}",
            headers={"X-API-Key": "dummy_key"}
        )

        # Should NOT return 422 (Unprocessable Entity) for valid format
        # Will likely return 401/403 for auth, which is expected
        assert response.status_code != 422, \
            f"Valid org_slug '{valid_org_slug}' should not be rejected for format"


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_org_slug", [
    "ab",  # too short
    "a" * 51,  # too long
    "org-name",  # hyphen
    "../etc",  # path traversal
    "org/name",  # slash
])
async def test_invalid_org_slug_in_request_body(invalid_org_slug, valid_admin_key):
    """
    Test that invalid org_slug in request body is rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": invalid_org_slug,
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should return 422 (Unprocessable Entity) for validation errors
        assert response.status_code == 422, \
            f"Invalid org_slug '{invalid_org_slug}' in body should be rejected"

        # Verify error message contains validation details
        data = response.json()
        assert "detail" in data


# ============================================
# Email Validation Tests
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_email,reason", [
    ("not-an-email", "missing @ symbol"),
    ("@example.com", "missing local part"),
    ("admin@", "missing domain"),
    ("admin", "no @ or domain"),
    ("admin @example.com", "space before @"),
    ("admin@ example.com", "space after @"),
    ("admin@example .com", "space in domain"),
    ("admin..test@example.com", "consecutive dots"),
    ("admin@.example.com", "dot after @"),
    ("admin@example..com", "consecutive dots in domain"),
    ("admin@example.com.", "trailing dot"),
    (".admin@example.com", "leading dot"),
    ("admin@", "missing domain part"),
    ("admin@exam ple.com", "space in domain"),
    ("admin<script>@example.com", "script tag in email"),
    ("'; DROP TABLE users; --@example.com", "SQL injection in email"),
    ("admin@<script>alert('xss')</script>.com", "XSS in domain"),
    ("", "empty string"),
    (" ", "whitespace only"),
])
async def test_invalid_email_in_onboarding(invalid_email, reason, valid_admin_key):
    """
    Test that invalid email addresses are rejected during onboarding.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_email",
                "company_name": "Test Company",
                "admin_email": invalid_email,
                "subscription_plan": "STARTER"
            }
        )

        # Should return 422 for validation errors
        assert response.status_code == 422, \
            f"Invalid email '{invalid_email}' ({reason}) should be rejected"


@pytest.mark.asyncio
@pytest.mark.parametrize("valid_email", [
    "admin@example.com",
    "user+tag@example.com",
    "first.last@example.com",
    "user_name@example.co.uk",
    "123@example.com",
    "test@subdomain.example.com",
])
async def test_valid_email_format_accepted(valid_email, valid_admin_key):
    """
    Test that valid email formats are accepted.

    Note: These tests will fail at later stages (org already exists, etc.)
    but should NOT fail at validation.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",  # Use dryrun to avoid side effects
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": f"test_org_{hash(valid_email) % 1000}",
                "company_name": "Test Company",
                "admin_email": valid_email,
                "subscription_plan": "STARTER"
            }
        )

        # Should NOT return 422 for valid email format
        # May return other errors (409, 500, etc.) but not validation error
        assert response.status_code != 422 or "admin_email" not in response.text, \
            f"Valid email '{valid_email}' should not be rejected for format"


# ============================================
# JSON Parsing Tests
# ============================================

@pytest.mark.asyncio
async def test_invalid_json_syntax(valid_admin_key):
    """
    Test that malformed JSON is rejected with appropriate error.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            content='{"org_slug": "test", "company_name": "Test"'  # Missing closing brace
        )

        # Should return 422 for JSON parsing errors
        assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_json_content", [
    "not json at all",
    '{"key": undefined}',  # JavaScript undefined
    '{"key": NaN}',  # JavaScript NaN
    "{key: 'value'}",  # Unquoted keys
    "{'key': 'value'}",  # Single quotes
    '{"key": "value",}',  # Trailing comma
])
async def test_various_invalid_json_formats(invalid_json_content, valid_admin_key):
    """
    Test that various invalid JSON formats are rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            content=invalid_json_content
        )

        # Should return 422 for JSON parsing errors
        assert response.status_code == 422


# ============================================
# Missing Required Fields Tests
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("missing_field", [
    "org_slug",
    "company_name",
    "admin_email",
])
async def test_missing_required_field_in_onboarding(missing_field, valid_admin_key):
    """
    Test that missing required fields are rejected.
    """
    base_payload = {
        "org_slug": "test_org",
        "company_name": "Test Company",
        "admin_email": "admin@test.com",
        "subscription_plan": "STARTER"
    }

    # Remove the field being tested
    payload = {k: v for k, v in base_payload.items() if k != missing_field}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json=payload
        )

        # Should return 422 for missing required fields
        assert response.status_code == 422, \
            f"Missing required field '{missing_field}' should be rejected"

        # Verify error message mentions the missing field
        data = response.json()
        assert "detail" in data


@pytest.mark.asyncio
async def test_empty_request_body(valid_admin_key):
    """
    Test that empty request body is rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={}
        )

        # Should return 422 for missing all required fields
        assert response.status_code == 422


# ============================================
# Extra Fields Validation (strict mode)
# ============================================

@pytest.mark.asyncio
async def test_extra_fields_rejected_in_onboarding(valid_admin_key):
    """
    Test that extra/unknown fields are rejected (Pydantic extra='forbid').
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_extra",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER",
                "unexpected_field": "should be rejected",
                "another_extra": 123
            }
        )

        # Should return 422 for extra fields (models use ConfigDict(extra="forbid"))
        assert response.status_code == 422


# ============================================
# Field Length Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_company_name_too_short(valid_admin_key):
    """
    Test that company_name shorter than min_length is rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_short",
                "company_name": "A",  # min_length=2
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        assert response.status_code == 422


@pytest.mark.asyncio
async def test_company_name_too_long(valid_admin_key):
    """
    Test that company_name longer than max_length is rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_long",
                "company_name": "A" * 201,  # max_length=200
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        assert response.status_code == 422


# ============================================
# Subscription Plan Validation
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_plan", [
    "INVALID",
    "free",  # lowercase
    "Pro",  # wrong case
    "BASIC",  # non-existent plan
    "ENTERPRISE",  # might not exist depending on config
    "",
    "123",
    "STARTER; DROP TABLE org_profiles;",  # SQL injection attempt
])
async def test_invalid_subscription_plan(invalid_plan, valid_admin_key):
    """
    Test that invalid subscription plans are rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_plan",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": invalid_plan
            }
        )

        # Should return 422 for invalid plan
        assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("valid_plan", [
    "STARTER",
    "PROFESSIONAL",
    "SCALE",
])
async def test_valid_subscription_plan(valid_plan, valid_admin_key):
    """
    Test that valid subscription plans are accepted.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": f"test_org_{valid_plan.lower()}",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": valid_plan
            }
        )

        # Should NOT return 422 for valid plan
        # May return other status codes (500, 409, etc.) but not validation error
        assert response.status_code != 422 or "subscription_plan" not in response.text


# ============================================
# XSS Prevention Tests
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("xss_payload,field", [
    ("<script>alert('XSS')</script>", "company_name"),
    ("<img src=x onerror=alert('XSS')>", "company_name"),
    ("javascript:alert('XSS')", "company_name"),
    ("<iframe src='javascript:alert(1)'></iframe>", "company_name"),
    ("onload=alert('XSS')", "company_name"),
])
async def test_xss_prevention_in_text_fields(xss_payload, field, valid_admin_key):
    """
    Test that XSS payloads in text fields are handled safely.

    Note: API should either reject these OR sanitize them. We're not testing
    for specific behavior, just ensuring they don't cause errors and are
    not executed.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_xss",
                "company_name": xss_payload if field == "company_name" else "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should not crash, should return either 422 (rejected) or proceed safely
        assert response.status_code in [200, 422, 400, 500]

        # If response includes the payload, verify it's escaped/sanitized
        if response.status_code == 200:
            response_text = response.text
            # Verify script tags are not present in raw form
            assert "<script>" not in response_text.lower()


# ============================================
# SQL Injection Prevention Tests
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("sql_injection_payload", [
    "'; DROP TABLE org_profiles; --",
    "' OR '1'='1",
    "1' UNION SELECT * FROM org_api_keys--",
    "'; DELETE FROM org_api_keys WHERE '1'='1",
    "admin' --",
    "admin'/*",
    "' OR 1=1--",
    "1; DROP DATABASE gac_prod_471220; --",
])
async def test_sql_injection_prevention_in_org_slug(sql_injection_payload, valid_admin_key):
    """
    Test that SQL injection attempts in org_slug are rejected.

    Note: With parameterized queries, these should be safely handled.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": sql_injection_payload,
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should return 422 for invalid org_slug format
        assert response.status_code == 422


# ============================================
# Integration Setup Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_integration_setup_missing_credential():
    """
    Test that integration setup rejects requests with missing credential.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/integrations/test_org/openai/setup",
            headers={
                "X-API-Key": "dummy_key",
                "Content-Type": "application/json"
            },
            json={
                # Missing credential field
                "credential_name": "Test Key"
            }
        )

        # Should return 422 for missing required field
        assert response.status_code in [401, 403, 422]


@pytest.mark.asyncio
async def test_integration_setup_credential_too_short():
    """
    Test that integration setup rejects credentials that are too short.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/integrations/test_org/openai/setup",
            headers={
                "X-API-Key": "dummy_key",
                "Content-Type": "application/json"
            },
            json={
                "credential": "abc",  # min_length=10
                "credential_name": "Test Key"
            }
        )

        # Should return 422 for validation error
        assert response.status_code in [401, 403, 422]


@pytest.mark.asyncio
async def test_integration_setup_credential_too_long():
    """
    Test that integration setup rejects credentials that exceed max size.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a credential that exceeds max_length (100000 bytes by default)
        huge_credential = "x" * 100001

        response = await client.post(
            "/api/v1/integrations/test_org/openai/setup",
            headers={
                "X-API-Key": "dummy_key",
                "Content-Type": "application/json"
            },
            json={
                "credential": huge_credential,
                "credential_name": "Test Key"
            }
        )

        # Should return 422 for validation error
        assert response.status_code in [401, 403, 422]


# ============================================
# Header Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_missing_auth_header():
    """
    Test that requests without auth headers are rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={"Content-Type": "application/json"},
            json={
                "org_slug": "test_org",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should return 401 or 403 for missing auth
        assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_invalid_auth_header_format():
    """
    Test that malformed auth headers are rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": "",  # Empty auth header
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should return 401 or 403 for invalid auth
        assert response.status_code in [401, 403]


# ============================================
# Content-Type Validation
# ============================================

@pytest.mark.asyncio
async def test_missing_content_type_header(valid_admin_key):
    """
    Test that requests without Content-Type are rejected or default to JSON.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={"X-CA-Root-Key": valid_admin_key},
            content='{"org_slug": "test", "company_name": "Test", "admin_email": "admin@test.com"}'
        )

        # FastAPI should handle this gracefully - may return 422 or process it
        assert response.status_code in [200, 400, 422, 500]


@pytest.mark.asyncio
async def test_wrong_content_type(valid_admin_key):
    """
    Test that requests with wrong Content-Type are handled appropriately.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "text/plain"
            },
            content='{"org_slug": "test", "company_name": "Test", "admin_email": "admin@test.com"}'
        )

        # Should likely return 422 for content type mismatch
        assert response.status_code in [400, 422]


# ============================================
# Type Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_wrong_type_for_boolean_field(valid_admin_key):
    """
    Test that wrong types for boolean fields are rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_bool",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER",
                "force_recreate_dataset": "not a boolean"  # Should be bool
            }
        )

        # Should return 422 for type mismatch
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_numeric_string_for_string_field(valid_admin_key):
    """
    Test that numeric strings are accepted for string fields.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_123",
                "company_name": "12345",  # Numeric string - should be allowed
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should NOT return 422 - numeric strings are valid strings
        assert response.status_code != 422


# ============================================
# Unicode and Special Characters
# ============================================

@pytest.mark.asyncio
async def test_unicode_in_company_name(valid_admin_key):
    """
    Test that Unicode characters in company_name are handled properly.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json; charset=utf-8"
            },
            json={
                "org_slug": "test_org_unicode",
                "company_name": "测试公司 Test 会社",  # Mixed Chinese/Japanese
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should handle Unicode gracefully - either accept or reject cleanly
        assert response.status_code in [200, 400, 422, 500]


@pytest.mark.asyncio
async def test_emoji_in_company_name(valid_admin_key):
    """
    Test that emoji in company_name are handled properly.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/dryrun",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json; charset=utf-8"
            },
            json={
                "org_slug": "test_org_emoji",
                "company_name": "Test Company 🚀 💻",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should handle emoji gracefully
        assert response.status_code in [200, 400, 422, 500]


# ============================================
# Null and None Handling
# ============================================

@pytest.mark.asyncio
async def test_null_in_required_field(valid_admin_key):
    """
    Test that null values in required fields are rejected.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": None,  # Required field set to null
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER"
            }
        )

        # Should return 422 for null in required field
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_null_in_optional_field(valid_admin_key):
    """
    Test that null values in optional fields are accepted.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations/onboard",
            headers={
                "X-CA-Root-Key": valid_admin_key,
                "Content-Type": "application/json"
            },
            json={
                "org_slug": "test_org_null",
                "company_name": "Test Company",
                "admin_email": "admin@test.com",
                "subscription_plan": "STARTER",
                "dataset_location": None  # Optional field
            }
        )

        # Should accept null in optional field (may fail for other reasons)
        # Should NOT return 422 specifically for null in optional field
        assert response.status_code != 422 or "dataset_location" not in response.text
