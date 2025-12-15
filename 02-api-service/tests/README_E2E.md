# E2E Integration Tests - Quick Reference

## Overview

Comprehensive end-to-end integration test for user onboarding that validates the complete journey from bootstrap to pipeline execution.

## Files

```
api-service/
├── tests/
│   ├── test_06_user_onboarding_e2e.py    # Main E2E test file
│   ├── E2E_TEST_GUIDE.md                 # Detailed testing guide
│   ├── E2E_SUMMARY.md                    # Test summary & architecture
│   ├── README_E2E.md                     # This file (quick reference)
│   └── .env.e2e.example                  # Example environment config
└── run_e2e_tests.sh                      # Convenience script to run tests
```

## Quick Start

### 1️⃣ Setup Environment

```bash
# Copy example config
cp tests/.env.e2e.example tests/.env.e2e

# Edit with your values
vim tests/.env.e2e

# Load environment
export $(cat tests/.env.e2e | xargs)
```

Required environment variables:
- `REQUIRES_INTEGRATION_TESTS=true`
- `GCP_PROJECT_ID` - Your GCP project
- `CA_ROOT_API_KEY` - Admin API key
- `OPENAI_API_KEY` - OpenAI API key for testing
- `KMS_KEY_NAME` - Full KMS key path
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON

### 2️⃣ Start Services

```bash
# Terminal 1: API Service (port 8000)
cd api-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Pipeline Service (port 8001)
cd data-pipeline-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 3️⃣ Run Tests

```bash
# Using convenience script (recommended)
cd api-service
./run_e2e_tests.sh

# Or specific tests
./run_e2e_tests.sh full          # Complete journey (2-5 min)
./run_e2e_tests.sh bootstrap     # Bootstrap only (5-10 sec)
./run_e2e_tests.sh onboard       # Org onboarding only (10-20 sec)
./run_e2e_tests.sh integration   # Integration setup only (10-20 sec)

# Or directly with pytest
pytest tests/test_06_user_onboarding_e2e.py -m integration -v
```

## What Gets Tested

```
✓ Bootstrap - Create 15 meta tables
✓ Organization Onboarding - Create org + API key + dataset
✓ Integration Setup - Store encrypted OpenAI credentials
✓ Pipeline Execution - Run OpenAI usage pipeline
✓ Data Verification - Check quota consumption
✓ Final Verification - Validate subscription details
✓ Automatic Cleanup - Remove all test data
```

## Documentation

| Document | Purpose |
|----------|---------|
| **E2E_TEST_GUIDE.md** | Comprehensive testing guide with troubleshooting |
| **E2E_SUMMARY.md** | Test architecture, data flow, and technical details |
| **README_E2E.md** | This file - quick reference |

## Troubleshooting

### Services Not Running
```bash
# Check if services are running
curl http://localhost:8000/health
curl http://localhost:8001/health
```

### Environment Issues
```bash
# Verify all required env vars are set
echo $REQUIRES_INTEGRATION_TESTS
echo $GCP_PROJECT_ID
echo $CA_ROOT_API_KEY
echo $OPENAI_API_KEY
echo $KMS_KEY_NAME
```

### Test Failures
1. Check service logs for errors
2. Verify GCP credentials are valid
3. Check KMS key is accessible
4. Review `E2E_TEST_GUIDE.md` troubleshooting section

## Common Commands

```bash
# Run all E2E tests
pytest tests/test_06_user_onboarding_e2e.py -m integration -v

# Run with detailed logs
pytest tests/test_06_user_onboarding_e2e.py -m integration -v -s --log-cli-level=INFO

# Run specific test
pytest tests/test_06_user_onboarding_e2e.py::test_complete_user_onboarding_e2e -v

# Skip integration tests (default if REQUIRES_INTEGRATION_TESTS != true)
pytest tests/test_06_user_onboarding_e2e.py -v
```

## Test Data Cleanup

Automatic cleanup happens in test's `finally` block. Manual cleanup if needed:

```sql
-- View test orgs
SELECT * FROM `organizations.org_profiles`
WHERE org_slug LIKE 'test_e2e_%';

-- Delete test org
DELETE FROM `organizations.org_profiles`
WHERE org_slug = 'test_e2e_YYYYMMDD_HHMMSS';
```

```bash
# Delete test dataset
bq rm -r -f -d your-gcp-project-id.test_e2e_YYYYMMDD_HHMMSS
```

## Support

For detailed information:
- **Testing Guide**: Read `E2E_TEST_GUIDE.md`
- **Architecture**: Read `E2E_SUMMARY.md`
- **Platform Docs**: See `../requirements-docs/00-ARCHITECTURE.md`

For issues:
1. Check service logs
2. Review troubleshooting section in `E2E_TEST_GUIDE.md`
3. Verify all prerequisites are met
4. Open issue with full error logs

---

**Quick Links**
- Test File: [`test_06_user_onboarding_e2e.py`](./test_06_user_onboarding_e2e.py)
- Detailed Guide: [`E2E_TEST_GUIDE.md`](./E2E_TEST_GUIDE.md)
- Technical Summary: [`E2E_SUMMARY.md`](./E2E_SUMMARY.md)
- Example Config: [`.env.e2e.example`](./.env.e2e.example)
- Run Script: [`../run_e2e_tests.sh`](../run_e2e_tests.sh)
