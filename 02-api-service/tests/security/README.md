# Security Tests for API Service

Comprehensive security test suite for the api-service authentication and authorization system.

## Overview

This test suite validates critical security controls that prevent:
- Unauthorized access (missing/invalid API keys)
- Credential exposure (encryption, API responses)
- Multi-tenant data breaches (org isolation)
- Timing attacks (constant-time comparison)
- Injection attacks (SQL, XSS, path traversal, header injection)
- Privilege escalation
- Audit trail gaps

**CRITICAL:** Any failure in these tests indicates a security vulnerability that could lead to data breaches or system compromise.

## Test Categories

### 1. Authentication Tests (Unit)
- Missing X-CA-Root-Key header
- Missing X-API-Key header
- Empty headers
- Invalid/fake keys
- SQL injection attempts in headers

**Run:**
```bash
pytest -m security tests/security/test_auth_security.py -k "missing or empty or invalid or sql_injection" -v
```

### 2. Expired/Inactive Keys (Integration)
- Expired API keys are rejected
- Inactive (is_active=FALSE) API keys are rejected
- Proper error messages without information leakage

**Run:**
```bash
pytest -m "security and integration" --run-integration tests/security/test_auth_security.py -k "expired or inactive" -v
```

### 3. Organization Isolation (Integration - CRITICAL)
- Org A cannot access Org B's data
- API key must match org_slug in URL
- Cross-org access attempts are blocked
- BigQuery dataset isolation

**Run:**
```bash
pytest -m "security and integration" --run-integration tests/security/test_auth_security.py -k "isolation or cross_access" -v
```

### 4. Timing Attack Resistance (Integration - Slow)
- API key comparison uses constant-time algorithm
- Root key comparison uses constant-time algorithm
- No information leakage through timing differences

**Run:**
```bash
pytest -m "security and integration and slow" --run-integration tests/security/test_auth_security.py -k "timing or constant_time" -v
```

### 5. KMS Encryption (Integration - CRITICAL)
- Credentials encrypted before storage
- Plaintext credentials never stored in BigQuery
- Credentials not exposed in API responses
- Decryption works correctly

**Run:**
```bash
pytest -m "security and integration" --run-integration tests/security/test_auth_security.py -k "kms or encrypt or exposure" -v
```

### 6. Injection Attack Prevention (Unit)
- Path traversal blocked
- NULL byte injection blocked
- Header injection blocked
- XSS attempts sanitized in error responses

**Run:**
```bash
pytest -m security tests/security/test_auth_security.py -k "traversal or null_bytes or header_injection or xss" -v
```

### 7. Audit Logging (Integration)
- Failed auth attempts logged
- Audit table populated correctly

**Run:**
```bash
pytest -m "security and integration" --run-integration tests/security/test_auth_security.py -k "audit" -v
```

### 8. Production Configuration (Unit)
- CA_ROOT_API_KEY is set and strong (32+ chars)
- DISABLE_AUTH is false
- RATE_LIMIT_ENABLED is true
- KMS_KEY_NAME is configured

**Run:**
```bash
pytest -m security tests/security/test_auth_security.py -k "production_security" -v
```

## Quick Start

### Run All Security Tests (Unit Only)
```bash
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/02-api-service
pytest -m security tests/security/test_auth_security.py -v
```

### Run All Security Tests (Including Integration)
```bash
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/02-api-service
pytest -m "security and integration" --run-integration tests/security/test_auth_security.py -v
```

### Run Only Critical Tests (Fast)
```bash
pytest -m security tests/security/test_auth_security.py -k "CRITICAL and not slow" -v
```

### Run Timing Attack Tests (Slow but Important)
```bash
pytest -m "security and slow" --run-integration tests/security/test_auth_security.py -k "timing" -v
```

## Environment Setup

### Required for Unit Tests
```bash
export CA_ROOT_API_KEY=your-root-key-here
export ENVIRONMENT=development
export DISABLE_AUTH=false
```

### Required for Integration Tests
```bash
export GCP_PROJECT_ID=your-gcp-project
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export CA_ROOT_API_KEY=your-root-key-here
export KMS_KEY_NAME=projects/PROJECT/locations/LOCATION/keyRings/KEYRING/cryptoKeys/KEY
export ENVIRONMENT=development
export DISABLE_AUTH=false
export RATE_LIMIT_ENABLED=true
```

## Test Markers

- `@pytest.mark.security` - All security tests
- `@pytest.mark.integration` - Requires real BigQuery/KMS
- `@pytest.mark.slow` - Long-running tests (timing attacks)
- `@pytest.mark.asyncio` - Async tests (most of them)

## Expected Results

### All Tests Should Pass

**If any test fails, it indicates a security vulnerability:**

1. **Authentication Tests Fail** → Unauthorized access possible
2. **Org Isolation Tests Fail** → Multi-tenant data breach risk (CRITICAL)
3. **Timing Tests Fail** → API keys can be guessed character by character
4. **KMS Tests Fail** → Credentials stored in plaintext (CRITICAL)
5. **Injection Tests Fail** → SQL injection, XSS, or path traversal possible
6. **Production Config Tests Fail** → Production deployment is insecure

## Common Issues

### 1. Integration Tests Skip
**Symptom:** Tests marked as "SKIPPED"

**Cause:** Missing credentials

**Fix:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GCP_PROJECT_ID=your-project
```

### 2. Bootstrap Not Run
**Symptom:** Tests skip with "Bootstrap not run"

**Fix:**
```bash
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{}'
```

### 3. Timing Tests Fail
**Symptom:** "Timing variation too high"

**Cause:** System under heavy load or constant-time comparison not implemented

**Fix:**
- Run on idle system
- Verify `_constant_time_compare()` uses `hmac.compare_digest()`
- Check network latency is not causing jitter

### 4. KMS Tests Fail
**Symptom:** Encryption/decryption errors

**Cause:** KMS key not configured or permissions missing

**Fix:**
```bash
export KMS_KEY_NAME=projects/.../cryptoKeys/...
# Ensure service account has cloudkms.cryptoKeyVersions.useToEncrypt/Decrypt
```

## Security Test Coverage

| Test Category | Tests | Critical | Integration |
|--------------|-------|----------|-------------|
| Missing Headers | 4 | Yes | No |
| Invalid Keys | 4 | Yes | No |
| Expired/Inactive Keys | 2 | Yes | Yes |
| Org Isolation | 2 | **CRITICAL** | Yes |
| Timing Attacks | 2 | **CRITICAL** | Yes (slow) |
| KMS Encryption | 2 | **CRITICAL** | Yes |
| Injection Prevention | 4 | Yes | No |
| Audit Logging | 1 | No | Yes |
| Production Config | 1 | Yes | No |
| Hash Security | 1 | Yes | No |
| **TOTAL** | **24** | **21** | **11** |

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd 02-api-service
          pip install -r requirements.txt

      - name: Run security tests (unit)
        run: |
          cd 02-api-service
          pytest -m security tests/security/test_auth_security.py -v
        env:
          CA_ROOT_API_KEY: ${{ secrets.CA_ROOT_API_KEY }}
          ENVIRONMENT: test

      - name: Run security tests (integration)
        if: github.ref == 'refs/heads/main'
        run: |
          cd 02-api-service
          pytest -m "security and integration" --run-integration tests/security/test_auth_security.py -v
        env:
          GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_JSON }}
          CA_ROOT_API_KEY: ${{ secrets.CA_ROOT_API_KEY }}
          KMS_KEY_NAME: ${{ secrets.KMS_KEY_NAME }}
```

## Manual Security Review Checklist

In addition to automated tests, perform these manual checks:

- [ ] Review auth.py for timing-safe comparison (`hmac.compare_digest`)
- [ ] Verify all admin endpoints use `verify_admin_key()` dependency
- [ ] Verify all org endpoints use `get_current_org()` dependency
- [ ] Check that org_slug validation happens BEFORE auth (in middleware)
- [ ] Confirm credentials are encrypted with KMS before INSERT/UPDATE
- [ ] Verify no credentials in logs (search for API key patterns)
- [ ] Check rate limiting is enabled in production (`RATE_LIMIT_ENABLED=true`)
- [ ] Verify DISABLE_AUTH is false in production
- [ ] Confirm CA_ROOT_API_KEY is 32+ characters and randomly generated
- [ ] Test org isolation in production-like environment

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. Email security@yourcompany.com with details
3. Include test output and reproduction steps
4. Allow 90 days for patch before disclosure

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE-89: SQL Injection](https://cwe.mitre.org/data/definitions/89.html)
- [CWE-208: Timing Attack](https://cwe.mitre.org/data/definitions/208.html)
- [CWE-639: Insecure Direct Object Reference](https://cwe.mitre.org/data/definitions/639.html)
- [Google Cloud KMS Best Practices](https://cloud.google.com/kms/docs/best-practices)

---

**Last Updated:** 2025-12-13
**Maintained By:** Security Team
