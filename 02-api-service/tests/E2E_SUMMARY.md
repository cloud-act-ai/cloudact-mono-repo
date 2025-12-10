# E2E User Onboarding Test - Summary

## What Was Created

A comprehensive end-to-end integration test that validates the complete user onboarding journey from system bootstrap to pipeline execution and data verification.

## Files Created

```
api-service/
├── tests/
│   ├── test_06_user_onboarding_e2e.py      # Main E2E test file
│   ├── E2E_TEST_GUIDE.md                   # Comprehensive test guide
│   ├── E2E_SUMMARY.md                      # This file
│   └── .env.e2e.example                    # Example environment config
└── run_e2e_tests.sh                        # Test runner script
```

## Test File Structure

### Main Test: `test_complete_user_onboarding_e2e`

Validates the complete user journey:

```python
async def test_complete_user_onboarding_e2e():
    """
    STEP 0: Wait for services (api-service, pipeline-service)
    STEP 1: Bootstrap (create 15 meta tables)
    STEP 2: Organization Onboarding (create org + API key + dataset)
    STEP 3: Integration Setup (OpenAI credentials → KMS encryption)
    STEP 4: Pipeline Execution (run OpenAI usage pipeline)
    STEP 5: Data Verification (check quota consumption)
    STEP 6: Final Verification (validate subscription details)
    CLEANUP: Remove all test data
    """
```

### Helper Tests (Faster Execution)

1. **`test_bootstrap_only`** - Validates bootstrap step only (5-10 seconds)
2. **`test_org_onboarding_only`** - Validates org creation only (10-20 seconds)
3. **`test_integration_setup_only`** - Validates integration setup only (10-20 seconds)

## Key Features

### Real Integration Testing

- ✓ Real BigQuery operations (dataset creation, table creation, queries)
- ✓ Real KMS encryption/decryption
- ✓ Real OpenAI API validation
- ✓ Real pipeline execution (data-pipeline-service)
- ✓ Real quota tracking and enforcement

### Comprehensive Validation

Each step includes multiple assertions:
- API response status codes
- Response data structure
- BigQuery data existence
- Credential encryption
- Quota consumption
- Subscription status

### Automatic Cleanup

The test includes a `finally` block that:
- Deletes all org records from meta tables
- Deletes the org's BigQuery dataset
- Ensures no orphaned test data

### Error Handling

- Clear error messages for common failures
- Detailed logging at each step
- Non-fatal cleanup errors
- Graceful handling of edge cases (no usage data, etc.)

## Quick Start

### 1. Setup Environment

```bash
# Copy example env file
cp tests/.env.e2e.example tests/.env.e2e

# Edit with your actual values
vim tests/.env.e2e

# Load environment variables
export $(cat tests/.env.e2e | xargs)
```

### 2. Start Services

```bash
# Terminal 1: API Service
cd api-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Pipeline Service
cd data-pipeline-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Run Tests

```bash
# Using the convenience script
cd api-service
./run_e2e_tests.sh

# Or directly with pytest
pytest tests/test_06_user_onboarding_e2e.py -m integration -v
```

## Test Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   E2E TEST EXECUTION FLOW                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. BOOTSTRAP                                               │
│     ├─ POST /api/v1/admin/bootstrap                         │
│     ├─ Create 15 meta tables                                │
│     └─ Verify tables exist                                  │
│                                                             │
│  2. ORGANIZATION ONBOARDING                                 │
│     ├─ POST /api/v1/organizations/onboard                   │
│     ├─ Create org profile                                   │
│     ├─ Generate & encrypt API key                           │
│     ├─ Create subscription                                  │
│     ├─ Create usage quota                                   │
│     ├─ Create org dataset                                   │
│     └─ Verify org in BigQuery                               │
│                                                             │
│  3. INTEGRATION SETUP                                       │
│     ├─ POST /api/v1/integrations/{org}/openai/setup         │
│     ├─ Validate OpenAI API key (real API call)              │
│     ├─ Encrypt credentials with KMS                         │
│     ├─ Store in org_integration_credentials                 │
│     └─ Verify credentials encrypted                         │
│                                                             │
│  4. PIPELINE EXECUTION                                      │
│     ├─ POST /api/v1/pipelines/run/.../openai/cost/usage_cost│
│     ├─ Validate org API key                                 │
│     ├─ Retrieve & decrypt credentials                       │
│     ├─ Execute pipeline                                     │
│     └─ Verify pipeline run logged                           │
│                                                             │
│  5. DATA VERIFICATION                                       │
│     ├─ Query org_usage_quotas                               │
│     ├─ Verify pipelines_run_today >= 1                      │
│     └─ Check quota consumption                              │
│                                                             │
│  6. FINAL VERIFICATION                                      │
│     ├─ GET /api/v1/organizations/{org}/subscription         │
│     ├─ Verify subscription plan                             │
│     └─ Verify subscription status                           │
│                                                             │
│  7. CLEANUP (ALWAYS RUNS)                                   │
│     ├─ Delete org from all meta tables                      │
│     └─ Delete org BigQuery dataset                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      DATA FLOW                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend (Test)                                             │
│      │                                                       │
│      ▼                                                       │
│  ┌──────────────────┐                                        │
│  │ API Service      │                                        │
│  │ (Port 8000)      │                                        │
│  └────────┬─────────┘                                        │
│           │                                                  │
│           ├─ Step 1: Bootstrap                               │
│           │    └─> BigQuery: Create 15 meta tables           │
│           │                                                  │
│           ├─ Step 2: Onboard Org                             │
│           │    ├─> org_profiles                              │
│           │    ├─> org_api_keys (KMS encrypted)              │
│           │    ├─> org_subscriptions                         │
│           │    ├─> org_usage_quotas                          │
│           │    └─> BigQuery: Create {org}_prod dataset       │
│           │                                                  │
│           └─ Step 3: Setup Integration                       │
│                ├─> Validate OpenAI API key                   │
│                ├─> KMS: Encrypt credentials                  │
│                └─> org_integration_credentials               │
│                                                              │
│  ┌──────────────────┐                                        │
│  │ Pipeline Service │                                        │
│  │ (Port 8001)      │                                        │
│  └────────┬─────────┘                                        │
│           │                                                  │
│           └─ Step 4: Execute Pipeline                        │
│                ├─> Validate org API key                      │
│                ├─> KMS: Decrypt credentials                  │
│                ├─> OpenAI API: Fetch usage data              │
│                ├─> BigQuery: Write to {org}_prod.openai_usage│
│                └─> org_meta_pipeline_runs (execution log)    │
│                                                              │
│  ┌──────────────────┐                                        │
│  │ BigQuery         │                                        │
│  └────────┬─────────┘                                        │
│           │                                                  │
│           ├─ organizations (meta dataset)                    │
│           │    ├─ org_profiles                               │
│           │    ├─ org_api_keys                               │
│           │    ├─ org_subscriptions                          │
│           │    ├─ org_usage_quotas                           │
│           │    ├─ org_integration_credentials                │
│           │    └─ org_meta_pipeline_runs                     │
│           │                                                  │
│           └─ {org}_prod (org dataset)                        │
│                ├─ openai_usage_daily_raw                     │
│                ├─ openai_cost_daily                          │
│                └─ ... (other tables)                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Assertions & Validations

### Bootstrap Assertions
```python
assert response.status_code == 200
assert bootstrap_data["status"] == "SUCCESS"
assert bootstrap_data["total_tables"] == 15
assert len(tables_created) + len(tables_existed) == 15
```

### Onboarding Assertions
```python
assert response.status_code == 200
assert onboard_data["org_slug"] == TEST_ORG_SLUG
assert org_api_key is not None and len(org_api_key) > 20
assert onboard_data["dataset_created"] is True
assert org_result[0]["status"] == "ACTIVE"
```

### Integration Setup Assertions
```python
assert response.status_code in [200, 201]
assert integration_data["provider"] == "openai"
assert integration_data["status"] in ["active", "validated"]
assert creds_result[0]["is_active"] is True
```

### Pipeline Execution Assertions
```python
assert response.status_code == 200
assert len(pipeline_run_result) >= 1
assert pipelines_run >= 1
```

### Subscription Assertions
```python
assert response.status_code == 200
assert subscription_data["org_slug"] == TEST_ORG_SLUG
assert subscription_data["plan_name"] == TEST_SUBSCRIPTION_PLAN
assert subscription_data["status"] in ["ACTIVE", "TRIAL"]
```

## Error Scenarios Covered

1. **Services Not Running**
   - Test waits for services with timeout
   - Clear error if services unavailable

2. **Invalid Credentials**
   - OpenAI API key validation
   - GCP credentials validation
   - KMS key validation

3. **Permission Issues**
   - BigQuery permissions
   - KMS encryption/decryption permissions

4. **Data Already Exists**
   - Idempotent bootstrap
   - Conflict handling for existing orgs

5. **Pipeline Failures**
   - Handles no usage data scenario
   - Logs all pipeline execution results

## Performance Metrics

| Test | Duration | API Calls | BigQuery Ops | KMS Ops |
|------|----------|-----------|--------------|---------|
| Complete E2E | 2-5 min | ~15 | ~30 | ~4 |
| Bootstrap Only | 5-10 sec | 1 | ~15 | 0 |
| Onboarding Only | 10-20 sec | 1 | ~5 | 2 |
| Integration Only | 10-20 sec | 2 | ~2 | 2 |

## Cost Implications

Running the E2E test once:
- BigQuery: ~$0.01 (minimal queries)
- KMS: ~$0.001 (4 operations)
- OpenAI API: ~$0.001 (validation call)
- Total: **~$0.012 per test run**

## Security Features

1. **Credential Encryption**
   - All credentials encrypted with KMS before storage
   - Decrypted only during pipeline execution
   - Never returned in API responses

2. **API Key Security**
   - SHA256 hashing for lookup
   - KMS encryption for storage
   - Time-based unique generation

3. **Cleanup**
   - All test data deleted after test
   - No orphaned credentials
   - No persistent test organizations

## Debugging Tips

### View Logs
```bash
# API Service logs
tail -f api-service/logs/app.log

# Pipeline Service logs
tail -f data-pipeline-service/logs/app.log
```

### Check BigQuery
```sql
-- View test org
SELECT * FROM `organizations.org_profiles`
WHERE org_slug LIKE 'test_e2e_%';

-- View test credentials
SELECT org_slug, provider, is_active
FROM `organizations.org_integration_credentials`
WHERE org_slug LIKE 'test_e2e_%';

-- View pipeline runs
SELECT org_slug, pipeline_id, status, created_at
FROM `organizations.org_meta_pipeline_runs`
WHERE org_slug LIKE 'test_e2e_%'
ORDER BY created_at DESC;
```

### Manual Cleanup
```bash
# Delete test orgs from BigQuery
bq ls --filter="labels.test:e2e" --format=prettyjson

# Delete specific dataset
bq rm -r -f -d gac-prod-471220.test_e2e_YYYYMMDD_HHMMSS
```

## CI/CD Integration

The test is designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run E2E Tests
  env:
    REQUIRES_INTEGRATION_TESTS: true
    GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
    CA_ROOT_API_KEY: ${{ secrets.CA_ROOT_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    KMS_KEY_NAME: ${{ secrets.KMS_KEY_NAME }}
  run: ./run_e2e_tests.sh
```

## Next Steps

### To Run Tests
1. Review `E2E_TEST_GUIDE.md` for detailed instructions
2. Copy `.env.e2e.example` to `.env.e2e` and configure
3. Start both services (api-service, pipeline-service)
4. Run `./run_e2e_tests.sh`

### To Extend Tests
1. Add new test functions to `test_06_user_onboarding_e2e.py`
2. Follow existing patterns (setup → execute → verify → cleanup)
3. Use helper functions (`cleanup_test_org`, `verify_bigquery_data`)

### To Debug Failures
1. Run with verbose logging: `pytest ... -v -s --log-cli-level=DEBUG`
2. Check service logs for detailed errors
3. Query BigQuery directly to inspect data
4. Review `E2E_TEST_GUIDE.md` troubleshooting section

## Documentation Links

- **Test Guide**: `tests/E2E_TEST_GUIDE.md` - Comprehensive testing documentation
- **Architecture**: `../requirements-docs/00-ARCHITECTURE.md` - Platform architecture
- **API Service**: `../CLAUDE.md` - API service documentation
- **Pipeline Service**: `../../data-pipeline-service/CLAUDE.md` - Pipeline service docs
- **Security**: `../../data-pipeline-service/SECURITY.md` - Security requirements

## Support

For issues or questions:
1. Check `E2E_TEST_GUIDE.md` troubleshooting section
2. Review service logs for detailed errors
3. Verify all prerequisites are met
4. Open an issue with full error logs and environment details

---

**Created**: 2025-12-06
**Last Updated**: 2025-12-06
**Test File**: `tests/test_06_user_onboarding_e2e.py`
**Guide**: `tests/E2E_TEST_GUIDE.md`
