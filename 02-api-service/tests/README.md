# API Service Tests

Comprehensive test suite for the CloudAct API Service, including unit tests, integration tests, and end-to-end tests.

## Test Structure

```
tests/
├── test_00_health.py              # Health check and basic connectivity
├── test_01_bootstrap.py           # Bootstrap (15 meta tables creation)
├── test_02_organizations.py       # Organization onboarding
├── test_03_integrations.py        # Integration setup (OpenAI, Anthropic, GCP)
├── test_04_llm_data.py            # LLM pricing and subscriptions CRUD
├── test_05_quota.py               # Quota enforcement and validation
├── test_06_user_onboarding_e2e.py # E2E integration tests (full user journey)
├── test_cache.py                  # Caching utilities tests
└── conftest.py                    # Shared fixtures and configuration
```

## Running Tests

### Quick Start

```bash
# All tests (unit tests only, no integration)
pytest tests/ -v

# Single test file
pytest tests/test_01_bootstrap.py -v

# Pattern matching
pytest tests/ -k "test_health" -v

# Verbose output with logging
pytest tests/ -v -s --log-cli-level=INFO
```

### Test Categories

#### Unit Tests (Default)
```bash
# Run all unit tests (fast, no external dependencies)
pytest tests/ -v

# Skip integration tests explicitly
pytest tests/ -v -m "not integration"
```

#### Integration Tests
```bash
# Run only integration tests (requires real services)
pytest tests/ -v -m integration

# Specific integration test
pytest tests/test_06_user_onboarding_e2e.py -m integration -v
```

## E2E Integration Tests

### Overview

E2E tests validate the **complete user onboarding journey** from bootstrap to pipeline execution:

1. **Bootstrap** - Create 15 meta tables in BigQuery
2. **Organization Onboarding** - Create org profile + API key + dataset
3. **Integration Setup** - Store encrypted OpenAI credentials (KMS)
4. **Pipeline Execution** - Run OpenAI usage pipeline
5. **Data Verification** - Verify quota consumption and data storage
6. **Final Verification** - Check subscription status and limits

**Test File:** `test_06_user_onboarding_e2e.py`

### Requirements

E2E tests require **real external services**:

- Real BigQuery connection (GCP project)
- Valid GCP credentials (service account JSON)
- KMS encryption enabled and accessible
- Real OpenAI API key (for integration testing)
- Both services running:
  - api-service on port 8000
  - data-pipeline-service on port 8001

### Environment Setup

**Required Environment Variables:**

```bash
# Enable integration tests
export REQUIRES_INTEGRATION_TESTS=true

# GCP Configuration
export GCP_PROJECT_ID="your-gcp-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"

# KMS Encryption
export KMS_KEY_NAME="projects/your-gcp-project-id/locations/us-central1/keyRings/your-keyring/cryptoKeys/your-key"

# API Keys
export CA_ROOT_API_KEY="your-admin-key-min-32-chars"
export OPENAI_API_KEY="sk-your-openai-api-key"

# Service URLs (optional, defaults to localhost)
export API_SERVICE_URL="http://localhost:8000"
export PIPELINE_SERVICE_URL="http://localhost:8001"
```

### Running E2E Tests

#### Option 1: Using Shell Script (Recommended)

The shell script validates environment and provides better error messages:

```bash
# All E2E tests
./run_e2e_tests.sh

# Specific test scenarios
./run_e2e_tests.sh full          # Complete onboarding journey
./run_e2e_tests.sh bootstrap     # Bootstrap only (fast)
./run_e2e_tests.sh onboard       # Org onboarding only
./run_e2e_tests.sh integration   # Integration setup only
```

**Shell Script Features:**
- Validates all required environment variables
- Checks both services are running
- Provides helpful error messages
- Returns proper exit codes for CI/CD

#### Option 2: Using pytest Directly

```bash
# All E2E tests
pytest tests/test_06_user_onboarding_e2e.py -m integration -v -s --log-cli-level=INFO

# Specific E2E scenarios
pytest tests/test_06_user_onboarding_e2e.py::test_complete_user_onboarding_e2e -v -s
pytest tests/test_06_user_onboarding_e2e.py::test_bootstrap_only -v -s
pytest tests/test_06_user_onboarding_e2e.py::test_org_onboarding_only -v -s
pytest tests/test_06_user_onboarding_e2e.py::test_integration_setup_only -v -s
```

### E2E Test Scenarios

#### 1. Complete User Onboarding E2E
**Function:** `test_complete_user_onboarding_e2e`

**What it tests:**
- Full user onboarding journey (all 6 steps)
- Bootstrap → Onboard → Integration → Pipeline → Verification
- Automatic cleanup of test organization

**Duration:** ~2-5 minutes (depends on BigQuery/pipeline execution)

**Use case:** Full validation before deployment

#### 2. Bootstrap Only
**Function:** `test_bootstrap_only`

**What it tests:**
- System initialization (15 meta tables)
- Idempotent behavior (running twice should succeed)

**Duration:** ~10-30 seconds

**Use case:** Quick validation of bootstrap endpoint

#### 3. Organization Onboarding Only
**Function:** `test_org_onboarding_only`

**What it tests:**
- Org profile creation
- API key generation
- Dataset creation
- Subscription setup

**Duration:** ~15-45 seconds

**Use case:** Validate onboarding without integration/pipeline steps

#### 4. Integration Setup Only
**Function:** `test_integration_setup_only`

**What it tests:**
- OpenAI credential storage (KMS encrypted)
- Credential validation
- Integration status tracking

**Duration:** ~20-60 seconds

**Use case:** Validate credential encryption and storage

### E2E Test Output

**Success Output:**
```
================================================
  E2E Integration Tests - User Onboarding
================================================

[INFO] Step 1: Checking environment variables...
[INFO] All required environment variables are set ✓

[INFO] Step 2: Checking service availability...
[INFO] API Service is running ✓
[INFO] Pipeline Service is running ✓

[INFO] Step 3: Running E2E tests...
...

================================================
✓ E2E Tests PASSED
================================================
```

**Failure Output:**
```
================================================
✗ E2E Tests FAILED
================================================

Troubleshooting tips:
  1. Check service logs for errors
  2. Verify GCP credentials are valid
  3. Check KMS key is accessible
  4. Verify OpenAI API key is valid
  5. Review tests/E2E_TEST_GUIDE.md for details
```

### Troubleshooting E2E Tests

#### Issue: "Integration tests disabled"
**Cause:** `REQUIRES_INTEGRATION_TESTS` not set

**Fix:**
```bash
export REQUIRES_INTEGRATION_TESTS=true
```

#### Issue: "API Service is NOT running"
**Cause:** api-service not started or wrong port

**Fix:**
```bash
cd api-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Issue: "Pipeline Service is NOT running"
**Cause:** data-pipeline-service not started or wrong port

**Fix:**
```bash
cd data-pipeline-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload
```

#### Issue: "Missing required environment variables"
**Cause:** Missing GCP_PROJECT_ID, CA_ROOT_API_KEY, OPENAI_API_KEY, etc.

**Fix:**
```bash
# Copy from .env.example or set manually
export GCP_PROJECT_ID="your-project-id"
export CA_ROOT_API_KEY="your-admin-key"
export OPENAI_API_KEY="sk-your-openai-key"
export KMS_KEY_NAME="projects/.../cryptoKeys/..."
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"
```

#### Issue: "Bootstrap failed: 404"
**Cause:** Bootstrap schemas not found

**Fix:**
```bash
# Verify schemas exist
ls -la configs/setup/bootstrap/schemas/
# Should show 15 JSON files
```

#### Issue: "KMS encryption failed"
**Cause:** Invalid KMS key or missing permissions

**Fix:**
```bash
# Verify KMS key exists
gcloud kms keys list --location=us-central1 --keyring=cloudact-keyring

# Grant encrypt/decrypt permissions to service account
gcloud kms keys add-iam-policy-binding cloudact-key \
  --location=us-central1 \
  --keyring=cloudact-keyring \
  --member="serviceAccount:your-sa@project.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"
```

#### Issue: "Pipeline execution timeout"
**Cause:** Pipeline takes longer than 5 minutes

**Fix:**
```bash
# Increase timeout in test_06_user_onboarding_e2e.py
PIPELINE_TIMEOUT = 600.0  # 10 minutes
```

#### Issue: "OpenAI API key not set"
**Cause:** OPENAI_API_KEY environment variable missing

**Fix:**
```bash
export OPENAI_API_KEY="sk-your-openai-api-key"
```

#### Issue: "Test organization not cleaned up"
**Cause:** Cleanup failed in finally block

**Fix:**
```bash
# Manual cleanup via BigQuery
bq query --use_legacy_sql=false "
DELETE FROM \`organizations.org_profiles\` WHERE org_slug LIKE 'test_e2e_%'
"

# Delete test datasets
bq ls --project_id=your-gcp-project-id | grep test_e2e | while read dataset; do
  bq rm -r -f -d "your-gcp-project-id:$dataset"
done
```

## Test Markers

Tests are marked for organization and filtering:

```python
# Mark test as integration test
@pytest.mark.integration
async def test_something():
    ...

# Mark test as slow
@pytest.mark.slow
def test_slow_operation():
    ...
```

**Available markers:**
- `integration` - Requires real external services
- `slow` - Test takes >5 seconds
- `asyncio` - Async test (uses pytest-asyncio)

**Usage:**
```bash
# Run only integration tests
pytest -m integration

# Run only slow tests
pytest -m slow

# Skip integration tests
pytest -m "not integration"
```

## Shared Fixtures

**Location:** `conftest.py`

**Available fixtures:**

| Fixture | Type | Description |
|---------|------|-------------|
| `client` | TestClient | FastAPI test client (sync) |
| `async_client` | AsyncClient | httpx async client |
| `admin_headers` | Dict | Headers with X-CA-Root-Key |
| `org_headers` | Dict | Headers with X-API-Key |
| `openai_api_key` | str | OpenAI API key from env |
| `bigquery_client` | BigQuery.Client | BigQuery client for verification |
| `skip_if_integration_tests_disabled` | None | Skip test if REQUIRES_INTEGRATION_TESTS != true |

**Usage:**
```python
def test_something(client, admin_headers):
    response = client.post("/api/v1/admin/bootstrap", headers=admin_headers)
    assert response.status_code == 200
```

## Test Coverage

### Current Coverage (as of 2025-12-06)

| Module | Tests | Coverage | Status |
|--------|-------|----------|--------|
| Health | 1 | 100% | ✓ Complete |
| Bootstrap | 3 | 90% | ✓ Complete |
| Organizations | 5 | 85% | ✓ Complete |
| Integrations | 8 | 80% | ✓ Complete |
| LLM Data | 10 | 75% | ✓ Complete |
| Quota | 6 | 85% | ✓ Complete |
| E2E | 4 | N/A | ✓ Complete |

**Total:** 37+ tests covering all major endpoints and flows

## CI/CD Integration

### GitHub Actions Example

```yaml
name: API Service Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
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

      - name: Run unit tests
        run: |
          cd api-service
          pytest tests/ -v -m "not integration"

      - name: Run E2E tests (on main branch only)
        if: github.ref == 'refs/heads/main'
        env:
          REQUIRES_INTEGRATION_TESTS: true
          GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
          CA_ROOT_API_KEY: ${{ secrets.CA_ROOT_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          KMS_KEY_NAME: ${{ secrets.KMS_KEY_NAME }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}
        run: |
          cd api-service
          ./run_e2e_tests.sh
```

## Best Practices

### Writing Tests

1. **Use descriptive test names**
   ```python
   # Good
   def test_bootstrap_creates_15_tables():
       ...

   # Bad
   def test_bootstrap():
       ...
   ```

2. **Use fixtures for common setup**
   ```python
   @pytest.fixture
   def test_org():
       return {
           "org_slug": "test_org",
           "company_name": "Test Company"
       }

   def test_onboarding(test_org):
       # Use test_org fixture
       ...
   ```

3. **Clean up after tests**
   ```python
   try:
       # Test code
       ...
   finally:
       # Always cleanup
       cleanup_test_data()
   ```

4. **Use markers appropriately**
   ```python
   @pytest.mark.integration
   @pytest.mark.slow
   async def test_full_pipeline():
       ...
   ```

5. **Mock external services in unit tests**
   ```python
   from unittest.mock import patch

   @patch('src.core.engine.bq_client.BigQueryClient')
   def test_with_mock(mock_bq):
       mock_bq.query.return_value = []
       # Test without real BigQuery
   ```

### E2E Test Best Practices

1. **Always clean up test data**
   - Use `finally` blocks for cleanup
   - Delete test organizations after tests
   - Remove test datasets from BigQuery

2. **Use unique test identifiers**
   ```python
   TEST_ORG_SLUG = f"test_e2e_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
   ```

3. **Validate environment before running**
   - Check required env vars are set
   - Verify services are running
   - Skip tests if requirements not met

4. **Use appropriate timeouts**
   - REQUEST_TIMEOUT = 60s for API calls
   - PIPELINE_TIMEOUT = 300s for pipeline execution
   - Adjust based on expected duration

5. **Log meaningful messages**
   ```python
   logger.info(f"✓ Bootstrap completed: {total_tables} tables created")
   logger.error(f"✗ Pipeline failed: {error_message}")
   ```

## Documentation

| Document | Description |
|----------|-------------|
| `README.md` | This file - test structure and E2E guide |
| `../README.md` | API Service overview |
| `../CLAUDE.md` | Service architecture and API reference |
| `test_06_user_onboarding_e2e.py` | E2E test implementation with detailed comments |
| `run_e2e_tests.sh` | E2E test runner script |

---

**Last Updated:** 2025-12-06
