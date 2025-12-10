# End-to-End Integration Test Guide

## Overview

The `test_06_user_onboarding_e2e.py` test validates the complete user onboarding journey from system bootstrap to pipeline execution and data verification.

## Test Coverage

### Complete Flow Test (`test_complete_user_onboarding_e2e`)

Validates the entire user onboarding journey:

```
STEP 0: Service Availability
  ├─ Check api-service (8000) is running
  └─ Check data-pipeline-service (8001) is running

STEP 1: Bootstrap
  ├─ POST /api/v1/admin/bootstrap
  ├─ Create 15 meta tables in organizations dataset
  └─ Verify tables created or already exist (idempotent)

STEP 2: Organization Onboarding
  ├─ POST /api/v1/organizations/onboard
  ├─ Create org profile in organizations.org_profiles
  ├─ Generate and encrypt API key → organizations.org_api_keys
  ├─ Create subscription → organizations.org_subscriptions
  ├─ Create usage quota → organizations.org_usage_quotas
  ├─ Create org dataset {org_slug}_prod
  └─ Verify org exists in BigQuery with ACTIVE status

STEP 3: Integration Setup (OpenAI)
  ├─ POST /api/v1/integrations/{org}/openai/setup
  ├─ Validate OpenAI API key (real API call)
  ├─ Encrypt credentials using KMS
  ├─ Store in organizations.org_integration_credentials
  └─ Verify credentials stored encrypted

STEP 4: Pipeline Execution
  ├─ POST /api/v1/pipelines/run/{org}/openai/cost/usage_cost
  ├─ Validate org API key
  ├─ Retrieve and decrypt credentials
  ├─ Execute pipeline (may fail if no usage data - acceptable)
  └─ Verify pipeline run logged in org_meta_pipeline_runs

STEP 5: Data Verification
  ├─ Query org_usage_quotas for quota consumption
  ├─ Verify pipelines_run_today >= 1
  └─ Check pipeline execution counts

STEP 6: Final Verification
  ├─ GET /api/v1/organizations/{org}/subscription
  ├─ Verify subscription plan and status
  └─ Confirm all limits are correct

CLEANUP:
  ├─ Delete from all meta tables
  └─ Delete org BigQuery dataset
```

### Focused Tests (Faster Execution)

1. **`test_bootstrap_only`** - Only tests bootstrap step
2. **`test_org_onboarding_only`** - Only tests org creation
3. **`test_integration_setup_only`** - Only tests integration setup

## Prerequisites

### 1. Services Running

Both services must be running locally or remotely:

```bash
# Terminal 1: API Service
cd api-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Pipeline Service
cd data-pipeline-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 2. Environment Variables

Set these environment variables before running tests:

```bash
# Required: Enable integration tests
export REQUIRES_INTEGRATION_TESTS=true

# Required: GCP Configuration
export GCP_PROJECT_ID="gac-prod-471220"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"

# Required: Authentication
export CA_ROOT_API_KEY="your-secure-admin-key-min-32-chars"

# Required: OpenAI API Key (for integration test)
export OPENAI_API_KEY="sk-your-openai-api-key"

# Required: KMS Configuration
export KMS_KEY_NAME="projects/{project}/locations/{location}/keyRings/{keyring}/cryptoKeys/{key}"

# Optional: Service URLs (if not running locally)
export API_SERVICE_URL="http://localhost:8000"
export PIPELINE_SERVICE_URL="http://localhost:8001"

# Optional: Test configuration
export ENVIRONMENT="development"
export BIGQUERY_LOCATION="US"
```

### 3. GCP Permissions

The service account needs these permissions:

```yaml
BigQuery:
  - bigquery.datasets.create
  - bigquery.datasets.get
  - bigquery.datasets.delete
  - bigquery.tables.create
  - bigquery.tables.get
  - bigquery.tables.delete
  - bigquery.tables.getData
  - bigquery.tables.updateData

KMS:
  - cloudkms.cryptoKeyVersions.useToEncrypt
  - cloudkms.cryptoKeyVersions.useToDecrypt
```

## Running the Tests

### Run All E2E Tests

```bash
cd api-service
pytest tests/test_06_user_onboarding_e2e.py -m integration -v
```

### Run Specific Test

```bash
# Full onboarding journey
pytest tests/test_06_user_onboarding_e2e.py::test_complete_user_onboarding_e2e -v

# Bootstrap only (faster)
pytest tests/test_06_user_onboarding_e2e.py::test_bootstrap_only -v

# Org onboarding only (faster)
pytest tests/test_06_user_onboarding_e2e.py::test_org_onboarding_only -v

# Integration setup only (faster)
pytest tests/test_06_user_onboarding_e2e.py::test_integration_setup_only -v
```

### Run with Detailed Logging

```bash
pytest tests/test_06_user_onboarding_e2e.py -m integration -v -s --log-cli-level=INFO
```

### Skip Integration Tests (Default Behavior)

```bash
# Will skip all integration tests if REQUIRES_INTEGRATION_TESTS != "true"
pytest tests/test_06_user_onboarding_e2e.py -v
```

## Expected Output

### Successful Test Run

```
tests/test_06_user_onboarding_e2e.py::test_complete_user_onboarding_e2e

Step 0: Checking service availability...
✓ Both services are available

Step 1: Running bootstrap to create meta tables...
✓ Bootstrap completed: 0 tables created, 15 tables existed

Step 2: Onboarding organization: test_e2e_20251206_143022...
✓ Organization onboarded: test_e2e_20251206_143022
  - API Key: test_e2e_20251206_... (length: 53)
  - Tables created: 2
✓ Verified organization exists in BigQuery with status: ACTIVE

Step 3: Setting up OpenAI integration...
✓ OpenAI integration setup completed with status: validated
✓ Verified OpenAI credentials stored encrypted in BigQuery

Step 4: Executing OpenAI usage pipeline...
✓ Pipeline executed successfully: Pipeline completed
✓ Verified pipeline run logged: status=SUCCESS

Step 5: Verifying quota consumption...
✓ Verified quota consumption:
  - Pipelines run today: 1
  - Pipelines succeeded: 1
  - Pipelines failed: 0

Step 6: Final verification of complete onboarding...
✓ Final verification completed:
  - Subscription plan: STARTER
  - Subscription status: ACTIVE
  - Daily limit: 10
  - Monthly limit: 300

================================================================================
✓ E2E USER ONBOARDING TEST PASSED
================================================================================
Organization: test_e2e_20251206_143022
All steps completed successfully:
  1. Bootstrap ✓
  2. Organization Onboarding ✓
  3. Integration Setup ✓
  4. Pipeline Execution ✓
  5. Data Verification ✓
  6. Final Verification ✓
================================================================================

Cleaning up test organization...
✓ Cleanup completed for: test_e2e_20251206_143022

PASSED [100%]
```

### Test Skipped (Integration Tests Disabled)

```
tests/test_06_user_onboarding_e2e.py::test_complete_user_onboarding_e2e
SKIPPED [100%]
Reason: Integration tests disabled. Set REQUIRES_INTEGRATION_TESTS=true to enable.
```

## Troubleshooting

### Services Not Available

**Error:**
```
AssertionError: API service not available at http://localhost:8000
```

**Solution:**
1. Check that api-service is running on port 8000
2. Check that data-pipeline-service is running on port 8001
3. Verify no firewall blocking the ports
4. Check service logs for startup errors

### Bootstrap Fails

**Error:**
```
AssertionError: Bootstrap failed: 500 - Internal Server Error
```

**Solution:**
1. Check GCP credentials are valid
2. Verify BigQuery API is enabled
3. Check service account has BigQuery permissions
4. Review api-service logs for detailed error

### KMS Encryption Fails

**Error:**
```
HTTPException: KMS encryption is required but failed
```

**Solution:**
1. Verify KMS_KEY_NAME is set correctly
2. Check service account has KMS encrypt/decrypt permissions
3. Verify KMS key exists and is enabled
4. Check Cloud KMS API is enabled in GCP project

### OpenAI Integration Fails

**Error:**
```
AssertionError: OpenAI integration setup failed: 400 - Invalid API key
```

**Solution:**
1. Verify OPENAI_API_KEY is set and valid
2. Test API key manually: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
3. Check if OpenAI API is accessible from your network
4. Verify no rate limiting on OpenAI side

### Pipeline Execution Fails

**Error:**
```
AssertionError: Pipeline failed unexpectedly: 500 - Internal Server Error
```

**Solution:**
1. Check data-pipeline-service logs for detailed error
2. Verify credentials are decrypted correctly
3. Check OpenAI API is accessible
4. Verify pipeline config exists in configs/
5. Note: Pipeline may fail if no usage data exists (acceptable for test)

### Cleanup Fails

**Error:**
```
Cleanup failed (non-fatal): Dataset not found
```

**Solution:**
- This is non-fatal and usually means the dataset was already deleted
- Manual cleanup: Delete dataset via BigQuery console or bq CLI
- Delete org records: `DELETE FROM organizations.org_profiles WHERE org_slug = 'test_e2e_...'`

## Test Data Cleanup

The test includes automatic cleanup in the `finally` block that:
1. Deletes all org records from meta tables
2. Deletes the org's BigQuery dataset

Manual cleanup if needed:

```bash
# Delete org from BigQuery
bq rm -r -f -d gac-prod-471220.test_e2e_YYYYMMDD_HHMMSS

# Delete org records
bq query --use_legacy_sql=false "
DELETE FROM \`gac-prod-471220.organizations.org_profiles\`
WHERE org_slug LIKE 'test_e2e_%'
"
```

## Performance Metrics

Expected test execution times:

| Test | Duration | Notes |
|------|----------|-------|
| `test_complete_user_onboarding_e2e` | 2-5 minutes | Full flow with real API calls |
| `test_bootstrap_only` | 5-10 seconds | Idempotent, fast |
| `test_org_onboarding_only` | 10-20 seconds | Includes dataset creation |
| `test_integration_setup_only` | 10-20 seconds | Includes KMS encryption |

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest

    services:
      api-service:
        # ... api-service container config
      pipeline-service:
        # ... pipeline-service container config

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd api-service
          pip install -r requirements.txt

      - name: Run E2E tests
        env:
          REQUIRES_INTEGRATION_TESTS: true
          GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
          CA_ROOT_API_KEY: ${{ secrets.CA_ROOT_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          KMS_KEY_NAME: ${{ secrets.KMS_KEY_NAME }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}
        run: |
          cd api-service
          pytest tests/test_06_user_onboarding_e2e.py -m integration -v
```

## Security Considerations

1. **Sensitive Data:**
   - Test creates real organizations with real API keys
   - OpenAI API key is used to make real API calls
   - All credentials are encrypted with KMS

2. **Cleanup:**
   - Test always attempts cleanup in `finally` block
   - Manual cleanup may be needed if test crashes
   - Check for orphaned test orgs: `SELECT org_slug FROM organizations.org_profiles WHERE org_slug LIKE 'test_e2e_%'`

3. **Cost:**
   - Test makes real BigQuery queries (minimal cost)
   - Test makes real OpenAI API calls (minimal cost)
   - Test creates/deletes datasets (no storage cost if cleaned up)

## Best Practices

1. **Run Locally First:**
   - Always test locally before running in CI/CD
   - Verify all services are accessible
   - Check credentials are valid

2. **Monitor Test Data:**
   - Periodically check for orphaned test orgs
   - Clean up old test datasets
   - Review BigQuery storage costs

3. **Test Isolation:**
   - Each test run creates a unique org (timestamp-based)
   - Tests don't interfere with each other
   - Safe to run multiple times

4. **Debug Mode:**
   - Use `-s --log-cli-level=DEBUG` for detailed logs
   - Check service logs for errors
   - Use BigQuery console to inspect data

## Related Documentation

- Architecture: `../requirements-docs/00-ARCHITECTURE.md`
- API Service: `../api-service/CLAUDE.md`
- Pipeline Service: `../data-pipeline-service/CLAUDE.md`
- Security: `../data-pipeline-service/SECURITY.md`

## Support

If you encounter issues with the E2E tests:

1. Check this guide first
2. Review service logs
3. Verify all prerequisites are met
4. Check GCP quotas and limits
5. Open an issue with full error logs
