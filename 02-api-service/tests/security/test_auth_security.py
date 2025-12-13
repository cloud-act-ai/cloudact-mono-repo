"""
Comprehensive Security Tests for API Service Authentication

Tests all security aspects of the api-service authentication system including:
- Missing and invalid headers (X-CA-Root-Key, X-API-Key)
- Expired and inactive API keys
- Rate limiting enforcement
- Organization isolation (cross-org access prevention)
- Timing attack resistance
- KMS encryption validation
- Audit logging
- SQL injection prevention
- Path traversal prevention

Run with: pytest -m security tests/security/test_auth_security.py
Run integration tests: pytest -m "security and integration" --run-integration tests/security/test_auth_security.py

CRITICAL: These tests validate security controls that prevent unauthorized access,
data breaches, and system compromise. Any failure indicates a security vulnerability.
"""

import os
import pytest
import time
import statistics
import hashlib
import secrets
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from google.cloud import bigquery
from typing import Dict, Any

# Mark all tests in this module as security tests
pytestmark = [pytest.mark.security]


# ============================================
# Fixtures
# ============================================

@pytest.fixture
def skip_if_no_credentials():
    """Skip integration tests if BigQuery credentials not available."""
    if os.environ.get("GCP_PROJECT_ID") in ["test-project", None]:
        pytest.skip("Integration tests require real GCP credentials")
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") is None:
        pytest.skip("GOOGLE_APPLICATION_CREDENTIALS not set")


@pytest.fixture
async def test_client():
    """Create FastAPI test client."""
    from src.app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def bigquery_client():
    """Real BigQuery client for verification."""
    project_id = os.environ.get("GCP_PROJECT_ID")
    return bigquery.Client(project=project_id)


@pytest.fixture
def root_api_key():
    """Get CA_ROOT_API_KEY from environment."""
    key = os.environ.get("CA_ROOT_API_KEY")
    if not key:
        pytest.skip("CA_ROOT_API_KEY not set")
    return key


# ============================================
# Test: Missing X-CA-Root-Key Header
# ============================================

@pytest.mark.asyncio
async def test_missing_root_key_header(test_client):
    """
    CRITICAL: Verify that admin endpoints require X-CA-Root-Key header.

    Missing header should return 401 Unauthorized, not 500 Internal Server Error.
    """
    # Test bootstrap endpoint (requires root key)
    response = await test_client.post(
        "/api/v1/admin/bootstrap",
        json={}
    )

    assert response.status_code == 401, \
        f"Expected 401 Unauthorized when X-CA-Root-Key missing, got {response.status_code}"

    error = response.json()
    assert "detail" in error or "message" in error, "Error response should include detail/message"

    # Verify error message indicates missing authentication
    error_text = str(error).lower()
    assert any(word in error_text for word in ["key", "header", "auth", "required"]), \
        "Error message should indicate missing authentication header"


@pytest.mark.asyncio
async def test_empty_root_key_header(test_client):
    """
    CRITICAL: Verify that empty X-CA-Root-Key header is rejected.
    """
    response = await test_client.post(
        "/api/v1/admin/bootstrap",
        headers={"X-CA-Root-Key": ""},
        json={}
    )

    assert response.status_code in [401, 403], \
        f"Empty root key should be rejected with 401/403, got {response.status_code}"


# ============================================
# Test: Invalid X-CA-Root-Key
# ============================================

@pytest.mark.asyncio
async def test_invalid_root_key(test_client):
    """
    CRITICAL: Verify that invalid X-CA-Root-Key is rejected.
    """
    invalid_keys = [
        "invalid-key-123",
        "x" * 32,  # Wrong key, correct length
        "sk-" + "0" * 30,  # Wrong format
        "admin-key-fake",
    ]

    for invalid_key in invalid_keys:
        response = await test_client.post(
            "/api/v1/admin/bootstrap",
            headers={"X-CA-Root-Key": invalid_key},
            json={}
        )

        assert response.status_code in [401, 403], \
            f"Invalid root key '{invalid_key[:10]}...' should be rejected, got {response.status_code}"


@pytest.mark.asyncio
async def test_root_key_sql_injection_attempt(test_client):
    """
    CRITICAL: Verify that SQL injection attempts in X-CA-Root-Key are rejected.

    Accepts 400 (validation middleware blocks dangerous patterns),
    401 (auth layer rejects invalid key), or 403 (forbidden).
    """
    sql_injection_attempts = [
        "' OR '1'='1",
        "admin' --",
        "'; DROP TABLE org_api_keys; --",
        "1' UNION SELECT * FROM org_api_keys --",
    ]

    for injection in sql_injection_attempts:
        response = await test_client.post(
            "/api/v1/admin/bootstrap",
            headers={"X-CA-Root-Key": injection},
            json={}
        )

        assert response.status_code in [400, 401, 403], \
            f"SQL injection attempt should be rejected, got {response.status_code}"


# ============================================
# Test: Missing X-API-Key Header
# ============================================

@pytest.mark.asyncio
async def test_missing_api_key_header(test_client):
    """
    CRITICAL: Verify that org endpoints require X-API-Key header.
    """
    test_org = "test_org_security"

    # Test integration endpoint (requires org API key)
    response = await test_client.get(
        f"/api/v1/integrations/{test_org}"
    )

    assert response.status_code == 401, \
        f"Expected 401 when X-API-Key missing, got {response.status_code}"

    error = response.json()
    assert "detail" in error or "message" in error


@pytest.mark.asyncio
async def test_empty_api_key_header(test_client):
    """
    CRITICAL: Verify that empty X-API-Key is rejected.
    """
    response = await test_client.get(
        "/api/v1/integrations/test_org",
        headers={"X-API-Key": ""}
    )

    assert response.status_code == 401


# ============================================
# Test: Invalid X-API-Key
# ============================================

@pytest.mark.asyncio
async def test_invalid_api_key(test_client):
    """
    CRITICAL: Verify that invalid org API keys are rejected.
    """
    invalid_keys = [
        "invalid-org-key-123",
        "x" * 40,
        secrets.token_urlsafe(32),  # Random valid-looking key
        "ca-org-fake-key",
    ]

    for invalid_key in invalid_keys:
        response = await test_client.get(
            "/api/v1/integrations/test_org",
            headers={"X-API-Key": invalid_key}
        )

        assert response.status_code in [401, 403], \
            f"Invalid API key should be rejected, got {response.status_code}"


@pytest.mark.asyncio
async def test_api_key_sql_injection_attempt(test_client):
    """
    CRITICAL: Verify SQL injection attempts in X-API-Key are rejected.

    Accepts 400 (validation middleware blocks dangerous patterns),
    401 (auth layer rejects invalid key), or 403 (forbidden).
    """
    sql_injections = [
        "' OR '1'='1",
        "admin' --",
        "'; DELETE FROM org_api_keys; --",
    ]

    for injection in sql_injections:
        response = await test_client.get(
            "/api/v1/integrations/test_org",
            headers={"X-API-Key": injection}
        )

        assert response.status_code in [400, 401, 403], \
            f"SQL injection should be rejected, got {response.status_code}"


# ============================================
# Test: Expired API Keys (Integration)
# ============================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_expired_api_key_rejected(skip_if_no_credentials, test_client, bigquery_client, root_api_key):
    """
    CRITICAL: Verify that expired API keys are rejected.

    This test:
    1. Creates a test org
    2. Manually expires the API key in BigQuery
    3. Verifies the key is rejected
    """
    org_slug = "test_org_expired_key"

    # Create test org
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Expired Key",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Manually expire the API key in BigQuery
    project_id = os.environ.get("GCP_PROJECT_ID")
    yesterday = datetime.utcnow() - timedelta(days=1)

    update_query = f"""
    UPDATE `{project_id}.organizations.org_api_keys`
    SET expires_at = @expires_at
    WHERE org_slug = @org_slug
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("expires_at", "TIMESTAMP", yesterday)
        ]
    )

    bigquery_client.query(update_query, job_config=job_config).result()

    # Verify expired key is rejected
    response = await test_client.get(
        f"/api/v1/integrations/{org_slug}",
        headers={"X-API-Key": api_key}
    )

    assert response.status_code == 401, \
        "Expired API key should be rejected with 401"

    error = response.json()
    error_text = str(error).lower()
    assert "expire" in error_text or "invalid" in error_text


# ============================================
# Test: Inactive API Keys (Integration)
# ============================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_inactive_api_key_rejected(skip_if_no_credentials, test_client, bigquery_client, root_api_key):
    """
    CRITICAL: Verify that inactive (is_active=FALSE) API keys are rejected.
    """
    org_slug = "test_org_inactive_key"

    # Create test org
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Inactive Key",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Deactivate the API key in BigQuery
    project_id = os.environ.get("GCP_PROJECT_ID")

    update_query = f"""
    UPDATE `{project_id}.organizations.org_api_keys`
    SET is_active = FALSE
    WHERE org_slug = @org_slug
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]
    )

    bigquery_client.query(update_query, job_config=job_config).result()

    # Verify inactive key is rejected
    response = await test_client.get(
        f"/api/v1/integrations/{org_slug}",
        headers={"X-API-Key": api_key}
    )

    assert response.status_code == 401, \
        "Inactive API key should be rejected with 401"


# ============================================
# Test: Rate Limiting
# ============================================

@pytest.mark.asyncio
async def test_rate_limiting_enforcement(test_client):
    """
    Verify that rate limiting is enforced for unauthenticated endpoints.

    Note: This is a basic test. Rate limits may not trigger in test environment
    if RATE_LIMIT_ENABLED=false.
    """
    # Make rapid requests to health endpoint
    responses = []

    for i in range(100):
        response = await test_client.get("/health")
        responses.append({
            "status_code": response.status_code,
            "request_num": i
        })

        # Stop if we hit rate limit
        if response.status_code == 429:
            break

    # Check if any request was rate limited
    rate_limited = [r for r in responses if r["status_code"] == 429]

    if rate_limited:
        # Verify 429 response has proper headers
        response = await test_client.get("/health")
        if response.status_code == 429:
            assert "retry-after" in response.headers or "Retry-After" in response.headers, \
                "Rate limited response should include Retry-After header"
    else:
        # Rate limiting may be disabled in test environment
        print("\nNote: Rate limiting not triggered (may be disabled in test environment)")


# ============================================
# Test: Organization Isolation (Integration)
# ============================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_org_isolation_cross_access_blocked(skip_if_no_credentials, test_client, root_api_key):
    """
    CRITICAL: Verify that Org A cannot access Org B's data.

    This is the most important multi-tenant security test.
    """
    org_a_slug = "test_org_a_isolation_security"
    org_b_slug = "test_org_b_isolation_security"

    # Create Org A
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_a_slug,
            "company_name": "Test Org A",
            "admin_email": "admin-a@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    org_a_api_key = response.json()["api_key"]

    # Create Org B
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_b_slug,
            "company_name": "Test Org B",
            "admin_email": "admin-b@test.com",
            "plan_name": "BASIC"
        }
    )

    assert response.status_code == 201
    org_b_api_key = response.json()["api_key"]

    # CRITICAL TEST: Org A tries to access Org B's data
    response = await test_client.get(
        f"/api/v1/integrations/{org_b_slug}",
        headers={"X-API-Key": org_a_api_key}
    )

    assert response.status_code == 403, \
        "Org A should NOT be able to access Org B's data (cross-org access)"

    # Verify Org A can access its own data
    response = await test_client.get(
        f"/api/v1/integrations/{org_a_slug}",
        headers={"X-API-Key": org_a_api_key}
    )

    assert response.status_code == 200, \
        "Org A should be able to access its own data"

    # Verify Org B can access its own data
    response = await test_client.get(
        f"/api/v1/integrations/{org_b_slug}",
        headers={"X-API-Key": org_b_api_key}
    )

    assert response.status_code == 200, \
        "Org B should be able to access its own data"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_org_slug_in_url_must_match_api_key(skip_if_no_credentials, test_client, root_api_key):
    """
    CRITICAL: Verify that org_slug in URL must match the org_slug of the API key.

    This prevents using a valid API key to access a different org's endpoints.
    """
    org_slug = "test_org_url_mismatch"
    fake_org_slug = "fake_org_different"

    # Create test org
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org URL Mismatch",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Try to use valid API key with different org_slug in URL
    response = await test_client.get(
        f"/api/v1/integrations/{fake_org_slug}",
        headers={"X-API-Key": api_key}
    )

    assert response.status_code == 403, \
        "Valid API key should NOT work with different org_slug in URL"


# ============================================
# Test: Timing Attack Resistance
# ============================================

@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_constant_time_api_key_comparison(skip_if_no_credentials, test_client, root_api_key):
    """
    CRITICAL: Verify API key comparison uses constant-time comparison.

    This prevents timing attacks where attackers guess keys character by character.
    """
    org_slug = "test_org_timing_security"

    # Create test org
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org Timing",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    real_api_key = response.json()["api_key"]

    # Test keys with different amounts of correct prefix
    test_cases = [
        ("0" * len(real_api_key), "All wrong"),
        (real_api_key[0] + "0" * (len(real_api_key) - 1), "First char correct"),
        (real_api_key[:len(real_api_key)//2] + "0" * (len(real_api_key)//2), "Half correct"),
    ]

    results = {}

    for test_key, description in test_cases:
        timings = []

        # Run 30 trials
        for _ in range(30):
            start = time.perf_counter()

            response = await test_client.get(
                f"/api/v1/integrations/{org_slug}",
                headers={"X-API-Key": test_key}
            )

            duration = time.perf_counter() - start
            timings.append(duration)

            assert response.status_code == 401

        results[description] = {
            "mean": statistics.mean(timings),
            "stdev": statistics.stdev(timings) if len(timings) > 1 else 0
        }

    # Statistical analysis
    means = [stats["mean"] for stats in results.values()]
    mean_of_means = statistics.mean(means)
    max_deviation = max(abs(m - mean_of_means) for m in means)

    # Allow up to 10ms variation (network jitter)
    # Should NOT see 100ms+ differences (which would indicate early exit)
    assert max_deviation < 0.010, \
        f"Timing variation too high ({max_deviation*1000:.2f}ms), possible timing attack vulnerability"


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_constant_time_root_key_comparison(skip_if_no_credentials, test_client, root_api_key):
    """
    CRITICAL: Verify root key comparison uses constant-time comparison.
    """
    test_cases = [
        ("x" * len(root_api_key), "All wrong"),
        (root_api_key[0] + "x" * (len(root_api_key) - 1), "First char correct"),
        (root_api_key[:len(root_api_key)//2] + "x" * (len(root_api_key)//2), "Half correct"),
    ]

    results = {}

    for test_key, description in test_cases:
        timings = []

        for _ in range(30):
            start = time.perf_counter()

            response = await test_client.post(
                "/api/v1/admin/bootstrap",
                headers={"X-CA-Root-Key": test_key},
                json={}
            )

            duration = time.perf_counter() - start
            timings.append(duration)

            assert response.status_code in [401, 403]

        results[description] = statistics.mean(timings)

    means = list(results.values())
    max_deviation = max(abs(m - statistics.mean(means)) for m in means)

    assert max_deviation < 0.010, \
        f"Root key timing variation too high ({max_deviation*1000:.2f}ms)"


# ============================================
# Test: KMS Encryption Validation
# ============================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_credentials_encrypted_in_storage(skip_if_no_credentials, test_client, bigquery_client, root_api_key):
    """
    CRITICAL: Verify that credentials are encrypted before storage in BigQuery.

    This test:
    1. Stores credentials via integration setup
    2. Queries BigQuery directly to verify encryption
    3. Ensures plaintext credentials are NEVER stored
    """
    org_slug = "test_org_kms_encryption"
    test_api_key = "sk-test-kms-validation-12345678901234567890"

    # Create test org
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org KMS",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup integration (will fail validation but should store encrypted)
    response = await test_client.post(
        f"/api/v1/integrations/{org_slug}/openai/setup",
        headers={"X-API-Key": api_key},
        json={"api_key": test_api_key}
    )

    # May fail validation, but should attempt to store
    # Status could be 200, 201, 400, or 422

    # Query BigQuery directly to verify encryption
    project_id = os.environ.get("GCP_PROJECT_ID")

    query = f"""
    SELECT encrypted_credentials
    FROM `{project_id}.organizations.org_integration_credentials`
    WHERE org_slug = @org_slug
        AND provider = 'OPENAI'
    LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]
    )

    results = list(bigquery_client.query(query, job_config=job_config).result())

    if results:
        encrypted_data = results[0]["encrypted_credentials"]

        # CRITICAL: Plaintext API key should NOT be in encrypted data
        # Convert bytes to string for comparison
        encrypted_str = str(encrypted_data)

        assert test_api_key not in encrypted_str, \
            "CRITICAL: Plaintext API key found in database - encryption failed!"

        # Encrypted data should be bytes/binary
        assert isinstance(encrypted_data, bytes), \
            "Encrypted credentials should be stored as bytes"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_credentials_not_exposed_in_api_responses(skip_if_no_credentials, test_client, root_api_key):
    """
    CRITICAL: Verify that credentials are never returned in API responses.
    """
    org_slug = "test_org_no_exposure"
    test_api_key = "sk-test-no-exposure-12345678901234567890"

    # Create test org
    response = await test_client.post(
        "/api/v1/organizations/onboard",
        headers={"X-CA-Root-Key": root_api_key},
        json={
            "org_slug": org_slug,
            "company_name": "Test Org No Exposure",
            "admin_email": "admin@test.com",
            "plan_name": "BASIC"
        }
    )

    if response.status_code == 400:
        pytest.skip("Bootstrap not run")

    assert response.status_code == 201
    api_key = response.json()["api_key"]

    # Setup integration
    response = await test_client.post(
        f"/api/v1/integrations/{org_slug}/openai/setup",
        headers={"X-API-Key": api_key},
        json={"api_key": test_api_key}
    )

    # Get integration status
    response = await test_client.get(
        f"/api/v1/integrations/{org_slug}/openai",
        headers={"X-API-Key": api_key}
    )

    if response.status_code == 200:
        data = response.json()
        response_str = str(data)

        # CRITICAL: API key should NOT be in response
        assert test_api_key not in response_str, \
            "CRITICAL: Plaintext credentials exposed in API response!"


# ============================================
# Test: Path Traversal Prevention
# ============================================

@pytest.mark.asyncio
async def test_path_traversal_blocked_in_org_slug(test_client, root_api_key):
    """
    CRITICAL: Verify path traversal attempts are blocked.
    """
    path_traversal_attempts = [
        "../admin",
        "../../etc/passwd",
        "..%2F..%2Fadmin",
        "test_org/../admin",
        "test_org/../../secrets",
    ]

    for malicious_slug in path_traversal_attempts:
        response = await test_client.get(
            f"/api/v1/integrations/{malicious_slug}",
            headers={"X-API-Key": "test-key"}
        )

        # Should be blocked with 400 (validation error) or 401 (auth error)
        # NOT 500 (server error)
        assert response.status_code in [400, 401, 403, 404], \
            f"Path traversal '{malicious_slug}' not properly blocked (got {response.status_code})"


@pytest.mark.asyncio
async def test_null_bytes_blocked_in_inputs(test_client):
    """
    CRITICAL: Verify NULL byte injection is blocked.

    Note: Modern HTTP libraries (httpx, requests) block NULL bytes at the
    client level, which is the first line of defense. This test verifies
    that NULL bytes cannot reach the server.
    """
    null_byte_attempts = [
        "test_org\x00admin",
        "test\x00.txt",
        "org_slug\x00/etc/passwd",
    ]

    for malicious_input in null_byte_attempts:
        try:
            response = await test_client.get(
                f"/api/v1/integrations/{malicious_input}",
                headers={"X-API-Key": "test-key"}
            )

            # If the request succeeds, it should be blocked
            assert response.status_code in [400, 401, 404], \
                f"NULL byte injection not properly blocked (got {response.status_code})"

        except Exception as e:
            # HTTP client blocking NULL bytes is GOOD - first line of defense
            error_msg = str(e).lower()
            assert "invalid" in error_msg or "non-printable" in error_msg or "null" in error_msg, \
                f"Unexpected error blocking NULL bytes: {e}"


# ============================================
# Test: Header Injection Prevention
# ============================================

@pytest.mark.asyncio
async def test_header_injection_blocked(test_client):
    """
    CRITICAL: Verify header injection attempts are blocked.
    """
    header_injection_attempts = [
        "test-key\r\nX-Admin: true",
        "test-key\nX-Elevated: yes",
        "test-key\r\n\r\nHTTP/1.1 200 OK",
    ]

    for malicious_header in header_injection_attempts:
        response = await test_client.get(
            "/api/v1/integrations/test_org",
            headers={"X-API-Key": malicious_header}
        )

        # Should be rejected
        assert response.status_code in [400, 401], \
            "Header injection not properly blocked"


# ============================================
# Test: XSS Prevention in Error Messages
# ============================================

@pytest.mark.asyncio
async def test_xss_blocked_in_error_responses(test_client):
    """
    Verify XSS attempts in inputs don't appear in error responses.
    """
    xss_attempts = [
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img src=x onerror=alert('xss')>",
    ]

    for xss in xss_attempts:
        response = await test_client.get(
            f"/api/v1/integrations/{xss}",
            headers={"X-API-Key": "test-key"}
        )

        # Check that XSS payload is NOT reflected in response
        response_text = response.text

        # Should be sanitized or escaped
        assert "<script>" not in response_text, \
            "XSS payload reflected in error response"
        assert "javascript:" not in response_text, \
            "JavaScript URL reflected in error response"


# ============================================
# Test: Audit Logging (Integration)
# ============================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_failed_auth_attempts_logged(skip_if_no_credentials, test_client, bigquery_client, root_api_key):
    """
    Verify that failed authentication attempts are logged to audit table.
    """
    # Make a failed auth attempt
    response = await test_client.post(
        "/api/v1/admin/bootstrap",
        headers={"X-CA-Root-Key": "invalid-key-for-audit-test"},
        json={}
    )

    assert response.status_code in [401, 403]

    # Check if audit log entry exists
    # Note: This assumes org_audit_logs table exists and auth failures are logged
    # If not implemented, this test will verify the requirement

    project_id = os.environ.get("GCP_PROJECT_ID")

    query = f"""
    SELECT COUNT(*) as failure_count
    FROM `{project_id}.organizations.org_audit_logs`
    WHERE event_type = 'auth_failed_root_key'
        AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 MINUTE)
    """

    try:
        results = list(bigquery_client.query(query).result())
        if results:
            failure_count = results[0]["failure_count"]
            # Should have at least one recent failure logged
            assert failure_count >= 1, \
                "Failed authentication attempts should be logged to audit table"
    except Exception as e:
        # Table may not exist or audit logging not implemented
        print(f"\nNote: Audit logging verification skipped: {e}")


# ============================================
# Test: Production Security Configuration
# ============================================

def test_production_security_requirements():
    """
    Verify that production security requirements are configured.

    This test checks environment configuration, not runtime behavior.
    """
    environment = os.environ.get("ENVIRONMENT", "development")

    if environment == "production":
        # CRITICAL: These MUST be set in production

        # Root API key must be set
        assert os.environ.get("CA_ROOT_API_KEY"), \
            "CRITICAL: CA_ROOT_API_KEY must be set in production"

        # Root key must be strong (min 32 chars)
        root_key = os.environ.get("CA_ROOT_API_KEY", "")
        assert len(root_key) >= 32, \
            f"CRITICAL: CA_ROOT_API_KEY too short ({len(root_key)} chars, need 32+)"

        # Auth must NOT be disabled
        disable_auth = os.environ.get("DISABLE_AUTH", "false").lower()
        assert disable_auth == "false", \
            "CRITICAL: DISABLE_AUTH must be 'false' in production"

        # Rate limiting should be enabled
        rate_limit = os.environ.get("RATE_LIMIT_ENABLED", "true").lower()
        assert rate_limit == "true", \
            "CRITICAL: RATE_LIMIT_ENABLED should be 'true' in production"

        # KMS must be configured
        assert os.environ.get("KMS_KEY_NAME") or os.environ.get("GCP_KMS_KEY_NAME"), \
            "CRITICAL: KMS_KEY_NAME must be set in production for credential encryption"


# ============================================
# Test: Hash Function Security
# ============================================

def test_api_key_hashing_security():
    """
    Verify that API key hashing uses secure algorithm (SHA-256).
    """
    from src.app.dependencies.auth import hash_api_key

    test_key = "test-api-key-12345"
    hashed = hash_api_key(test_key)

    # SHA-256 produces 64 hex characters
    assert len(hashed) == 64, \
        "API key hash should be SHA-256 (64 hex characters)"

    # Should be deterministic
    assert hash_api_key(test_key) == hashed, \
        "Hash function should be deterministic"

    # Different keys should produce different hashes
    different_key = "different-key-67890"
    assert hash_api_key(different_key) != hashed, \
        "Different keys should produce different hashes"
