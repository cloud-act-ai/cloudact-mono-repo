# Testing Guide - Convergence Data Pipeline

Comprehensive testing strategy for local development, staging, and production environments.

## Table of Contents

1. [Overview](#overview)
2. [Test Suites](#test-suites)
3. [Running Tests](#running-tests)
4. [Test Coverage](#test-coverage)
5. [CI/CD Integration](#cicd-integration)
6. [Writing Tests](#writing-tests)

---

## Overview

The Convergence Data Pipeline uses a multi-layered testing strategy:

- **Local Tests**: Functional tests for development
- **Staging Tests**: Integration and performance tests
- **Production Tests**: Non-destructive health checks

All test suites are located in `/tests` directory.

---

## Test Suites

### Local Test Suite (`local_test_suite.sh`)

**Purpose**: Verify core functionality in local development environment

**Prerequisites**:
```bash
export ADMIN_API_KEY='your-admin-key'
export API_URL='http://localhost:8000'
```

**Test Cases**:

| # | Test Name | Description | Pass Criteria |
|---|-----------|-------------|---------------|
| 1 | Health Check | Verify service is running | 200 OK with "healthy" status |
| 2 | Bootstrap System | Initialize central dataset and tables | Creates all 11 management tables |
| 3 | Create Tenant | Create new tenant with datasets | Tenant created with BigQuery dataset |
| 4 | Get Tenant Info | Retrieve tenant details | Returns tenant metadata |
| 5 | Generate Tenant API Key | Create API key for tenant | API key generated (KMS timeout OK in local) |
| 6 | Invalid Admin Key Rejected | Security test for admin endpoints | 403 Forbidden |
| 7 | Missing Admin Key Rejected | Security test for missing auth | 422/403 error |
| 8 | API Versioning | Verify v1 API prefix | /api/v1/health responds |
| 9 | Rate Limiting Headers | Check rate limiting is active | Headers present or success |
| 10 | Schema Consistency | Verify database schema | Re-bootstrap finds existing tables |

**Run**:
```bash
./tests/local_test_suite.sh
```

---

### Staging Test Suite (`staging_test_suite.sh`)

**Purpose**: Validate deployment and integration in staging environment

**Prerequisites**:
```bash
export STAGING_URL='https://convergence-api-staging.example.com'
export ADMIN_API_KEY='your-staging-admin-key'
```

**Test Cases**:

| # | Test Name | Description | Pass Criteria |
|---|-----------|-------------|---------------|
| 1 | HTTPS/TLS Certificate | Verify SSL/TLS configuration | Valid certificate, TLS 1.2+ |
| 2 | Service Health & Environment | Check service status | Returns "healthy" with "staging" env |
| 3 | KMS Integration | Test encryption/decryption | API key encrypted successfully |
| 4 | Multi-Tenant Isolation | Verify data isolation | Multiple tenants created independently |
| 5 | Rate Limiting | Test global rate limits | Rate limiting active |
| 6 | BigQuery Dataset Access | Verify BigQuery integration | Datasets created successfully |
| 7 | Logging & Monitoring | Check structured logging | Requests logged with trace IDs |
| 8 | Performance - Response Time | Measure latency | Health endpoint < 2 seconds |
| 9 | Error Handling | Test invalid inputs | Proper validation errors (422) |
| 10 | End-to-End Workflow | Complete tenant lifecycle | Create tenant → Get info → Generate key |

**Run**:
```bash
./tests/staging_test_suite.sh
```

---

### Production Test Suite (`production_test_suite.sh`)

**Purpose**: Non-destructive health monitoring for production

**⚠️ IMPORTANT**: These tests are **read-only** and safe for production.

**Prerequisites**:
```bash
export PROD_URL='https://api.convergence.example.com'
export ADMIN_API_KEY='your-production-admin-key'
```

**Test Cases**:

| # | Test Name | Description | Pass Criteria |
|---|-----------|-------------|---------------|
| 1 | Service Availability | Monitor uptime | 200 OK (99.9% SLA) |
| 2 | HTTPS/TLS Security | Verify security configuration | TLS 1.2+, valid certificate |
| 3 | Response Time SLA | Check performance SLA | Health endpoint < 500ms |
| 4 | Admin Endpoints Protected | Security test | Unauthorized requests blocked |
| 5 | Invalid Admin Keys Rejected | Authentication security | Invalid keys rejected (403) |
| 6 | API Versioning | Verify API compatibility | /api/v1 endpoints active |
| 7 | Error Handling (404s) | Test error responses | 404 for invalid routes |
| 8 | CORS Configuration | Check CORS headers | Proper CORS configuration |
| 9 | Rate Limiting Active | Verify rate limiting | Rate limiting enforced |
| 10 | Environment Configuration | Validate environment | Returns "production" environment |

**Run**:
```bash
./tests/production_test_suite.sh
```

---

## Running Tests

### Quick Start

```bash
# Make scripts executable (first time only)
chmod +x tests/*.sh

# Local testing
export ADMIN_API_KEY=$(python3 scripts/generate_admin_key.py --no-prompt)
./tests/local_test_suite.sh

# Staging testing
export STAGING_URL="https://your-staging-url.com"
export ADMIN_API_KEY="your-staging-key"
./tests/staging_test_suite.sh

# Production monitoring
export PROD_URL="https://your-production-url.com"
export ADMIN_API_KEY="your-production-key"
./tests/production_test_suite.sh
```

### Continuous Testing

Run tests every 5 minutes in production:

```bash
# Add to crontab
*/5 * * * * /path/to/tests/production_test_suite.sh >> /var/log/prod-health.log 2>&1
```

### Automated Testing in CI/CD

```yaml
# GitHub Actions example
name: Test Suite

on: [push, pull_request]

jobs:
  local-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run local tests
        env:
          ADMIN_API_KEY: ${{ secrets.ADMIN_API_KEY }}
        run: ./tests/local_test_suite.sh

  staging-tests:
    runs-on: ubuntu-latest
    needs: local-tests
    if: github.ref == 'refs/heads/staging'
    steps:
      - uses: actions/checkout@v3
      - name: Run staging tests
        env:
          STAGING_URL: ${{ secrets.STAGING_URL }}
          ADMIN_API_KEY: ${{ secrets.STAGING_ADMIN_KEY }}
        run: ./tests/staging_test_suite.sh
```

---

## Test Coverage

### Unit Tests

Located in `tests/unit/`:
- Core processors
- Security utilities
- Data validation

Run unit tests:
```bash
pytest tests/unit/ -v --cov=src --cov-report=html
```

### Integration Tests

Located in `tests/integration/`:
- BigQuery integration
- KMS integration
- Multi-tenant isolation

Run integration tests:
```bash
pytest tests/integration/ -v
```

### Security Tests

Located in `tests/security/`:
- Authentication
- Authorization
- Input validation
- SQL injection prevention

Run security tests:
```bash
pytest tests/security/ -v
```

---

## CI/CD Integration

### Pre-Deployment Gate

All tests must pass before deployment:

```bash
#!/bin/bash
# pre-deploy.sh

set -e

echo "Running pre-deployment tests..."

# Local tests
./tests/local_test_suite.sh

# Unit tests
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# Security tests
pytest tests/security/ -v

echo "✓ All tests passed - Ready for deployment"
```

### Post-Deployment Verification

After deployment to staging/production:

```bash
#!/bin/bash
# post-deploy-verify.sh

set -e

ENV=$1  # staging or production

if [ "$ENV" = "staging" ]; then
    ./tests/staging_test_suite.sh
elif [ "$ENV" = "production" ]; then
    ./tests/production_test_suite.sh
else
    echo "Usage: $0 {staging|production}"
    exit 1
fi

echo "✓ Post-deployment verification passed"
```

---

## Writing Tests

### Test Script Structure

```bash
#!/bin/bash
set -e  # Exit on first failure

# Test function
test_my_feature() {
    response=$(curl -s -w "\n%{http_code}" "$API_URL/my-endpoint")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    [ "$http_code" = "200" ] && echo "$body" | grep -q "expected_value"
}

# Run test
run_test 1 "My Feature Test" "test_my_feature"
```

### Best Practices

1. **Idempotent Tests**: Tests should not depend on each other
2. **Cleanup**: Clean up test data after execution
3. **Timeouts**: Set reasonable timeouts for API calls
4. **Error Messages**: Provide clear error messages
5. **Environment Variables**: Use env vars for configuration

### Example Test

```bash
test_create_tenant() {
    local tenant_id="test_$(date +%s)"

    # Create tenant
    response=$(curl -s -w "\n%{http_code}" \
        -X POST "$API_URL/api/v1/admin/tenants" \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"tenant_id\": \"$tenant_id\"}")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    # Verify
    [ "$http_code" = "200" ] && \
    echo "$body" | grep -q "$tenant_id" && \
    echo "$body" | grep -q "datasets_created"

    # Cleanup (optional)
    # curl -X DELETE "$API_URL/api/v1/admin/tenants/$tenant_id" \
    #   -H "X-Admin-Key: $ADMIN_API_KEY"
}
```

---

## Interpreting Results

### Success Output

```
================================================================================
LOCAL TEST SUITE - Convergence Data Pipeline
================================================================================

Test 1/10: Health Check... ✓ PASSED
Test 2/10: Bootstrap System... ✓ PASSED
Test 3/10: Create Tenant... ✓ PASSED
...

================================================================================
TEST RESULTS
================================================================================
Total Tests:  10
Passed:       10
Failed:       0
Success Rate: 100%
================================================================================
✓ ALL TESTS PASSED
```

### Failure Output

```
Test 5/10: Generate Tenant API Key... ✗ FAILED

================================================================================
TEST RESULTS
================================================================================
Total Tests:  10
Passed:       8
Failed:       2
Success Rate: 80%
================================================================================
✗ SOME TESTS FAILED
```

### Debugging Failed Tests

1. **Check logs**: Review application logs for errors
2. **Run individual test**: Isolate failing test
3. **Verify environment**: Check env vars are set correctly
4. **Network issues**: Verify connectivity to services
5. **Permissions**: Verify service account permissions

```bash
# Run single test
test_5_generate_api_key
echo $?  # Check exit code
```

---

## Performance Testing

### Load Testing

Use Apache Bench or k6 for load testing:

```bash
# Apache Bench
ab -n 1000 -c 10 -H "X-Admin-Key: $ADMIN_API_KEY" \
   "$STAGING_URL/api/v1/admin/tenants/test_tenant"

# k6 load test
k6 run tests/load/tenant_creation.js
```

### Stress Testing

```bash
# Gradually increase load
for c in 10 50 100 200; do
    echo "Testing with $c concurrent users..."
    ab -n 1000 -c $c "$API_URL/health"
    sleep 5
done
```

---

## Monitoring Test Results

### Test Metrics to Track

- **Pass Rate**: Target 100%
- **Execution Time**: Monitor for degradation
- **Flaky Tests**: Tests that intermittently fail
- **Coverage**: Code coverage percentage

### Alerting

Set up alerts for:
- Test failures in production monitoring
- Staging test failures (block deployments)
- Performance degradation

---

## Troubleshooting

### Common Test Failures

#### 1. "Connection Refused"

**Cause**: API server not running

**Solution**: Start the server first
```bash
python3 -m uvicorn src.app.main:app --port 8000
```

#### 2. "Admin Key Invalid"

**Cause**: Wrong or missing ADMIN_API_KEY

**Solution**: Generate and export admin key
```bash
export ADMIN_API_KEY=$(python3 scripts/generate_admin_key.py --no-prompt)
```

#### 3. "KMS Timeout"

**Cause**: Network issues or missing permissions

**Solution**: Check KMS permissions and network connectivity
```bash
gcloud kms keys get-iam-policy api-key-encryption \
    --location=us-central1 \
    --keyring=convergence-keyring-prod
```

---

## Additional Resources

- [Deployment Guide](./DEPLOYMENT.md)
- [API Reference](./API.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Security Guide](./SECURITY.md)

---

**Last Updated**: 2025-11-19
**Version**: 1.0.0
