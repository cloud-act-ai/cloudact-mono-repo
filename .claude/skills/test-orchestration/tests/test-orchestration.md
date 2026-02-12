# Test Orchestration - Test Plan

## Test Infrastructure Validation

Multi-service test orchestration across frontend, API, and pipeline services:
- **Frontend Tests:** `01-fronted-system/tests/`
- **API Tests:** `02-api-service/tests/`
- **Pipeline Tests:** `03-data-pipeline-service/tests/`
- **Run all:** See quick commands below

### Test Matrix (30 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Frontend unit tests pass (Vitest) | Unit | `npm test` exits 0 |
| 2 | API service unit tests pass (pytest) | Unit | `pytest tests/ -v` exits 0 |
| 3 | Pipeline service unit tests pass (pytest) | Unit | `pytest tests/ -v` exits 0 |
| 4 | E2E tests pass (Playwright) | E2E | `npx playwright test` exits 0 |
| 5 | Multi-org fixture: acme_us (USD) | Fixture | Org created with exchange_rate 1.0000 |
| 6 | Multi-org fixture: acme_in (INR) | Fixture | Org created with exchange_rate 0.0120 |
| 7 | Multi-org fixture: acme_eu (EUR) | Fixture | Org created with exchange_rate 1.0850 |
| 8 | Multi-org fixture: acme_ae (AED) | Fixture | Org created with exchange_rate 0.2723 |
| 9 | Multi-org fixture: acme_au (AUD) | Fixture | Org created with exchange_rate 0.6550 |
| 10 | Multi-org fixture: acme_jp (JPY) | Fixture | Org created with exchange_rate 0.0067 |
| 11 | Currency conversion USD -> INR | Unit | Correct conversion with 0.0120 rate |
| 12 | Currency conversion USD -> EUR | Unit | Correct conversion with 1.0850 rate |
| 13 | Currency conversion USD -> JPY | Unit | Correct conversion with 0.0067 rate |
| 14 | Calendar fiscal year (US) | Unit | Jan 1 - Dec 31 boundaries correct |
| 15 | India/UK fiscal year (April start) | Unit | Apr 1 - Mar 31 boundaries correct |
| 16 | Australia fiscal year (July start) | Unit | Jul 1 - Jun 30 boundaries correct |
| 17 | Test isolation: unique org slug per run | Unit | `{company}_{timestamp}` format, no collision |
| 18 | Test cleanup: no orphaned data after run | Integration | Test orgs removed post-test |
| 19 | AsyncMock used for all async methods | Unit | No `MagicMock can't be used in await` errors |
| 20 | DISABLE_AUTH=true only in test env | Config | Not set in stage/prod |
| 21 | Demo account setup script runs | Demo | `setup-demo-account.ts` completes |
| 22 | Demo data loader runs | Demo | `load-demo-data-direct.ts` completes |
| 23 | Demo costs verify (Dec 2025 - Jan 2026) | Demo | GenAI ~$232K, Cloud ~$382, Total ~$234K |
| 24 | Numbered test file convention (00-08) | Convention | All backend tests follow `NN_test_*.py` |
| 25 | Coverage report generates | CI | `--cov-report=html` produces output |
| 26 | Parallel test execution works | CI | `pytest -n auto` completes without failures |
| 27 | Security tests isolated from unit tests | CI | `-m "not integration"` excludes correctly |
| 28 | Playwright auth setup works | E2E | `auth.setup.ts` creates auth state |
| 29 | External APIs mocked in unit tests | Unit | Stripe, BigQuery mocked (no real calls) |
| 30 | No production credentials in test env | Config | Only `cloudact-testing-1` project used |

## Backend Tests

### API Service Tests

```bash
cd 02-api-service
source venv/bin/activate

# All tests
python -m pytest tests/ -v

# With coverage
python -m pytest tests/ -v --cov=src --cov-report=html

# Fast tests only (no integration)
python -m pytest tests/ -v -m "not integration"

# Specific category
python -m pytest tests/ -v -k "subscription"
python -m pytest tests/ -v -k "cost and not integration"
```

| File | Domain | Tests |
|------|--------|-------|
| `tests/test_bootstrap.py` | Bootstrap | 14 meta table creation |
| `tests/test_organizations.py` | Onboarding | Org creation, slug validation |
| `tests/test_integrations.py` | Integrations | Provider setup, credentials |
| `tests/test_subscriptions.py` | Subscriptions | SaaS plan CRUD |
| `tests/test_costs.py` | Costs | Cost calculations, Polars queries |
| `tests/test_quota.py` | Quotas | Enforcement, limits, resets |
| `tests/test_security.py` | Security | Auth, KMS, rate limiting |
| `tests/test_validation.py` | Validation | Input sanitization |
| `tests/test_performance.py` | Performance | Response times, throughput |

### Pipeline Service Tests

```bash
cd 03-data-pipeline-service
source venv/bin/activate

# All tests
python -m pytest tests/ -v

# Processor tests
python -m pytest tests/test_processors/ -v

# Multi-org tests
python -m pytest tests/ -v -k "multi_org"

# Currency tests
python -m pytest tests/ -v -k "currency"
```

| File | Domain | Tests |
|------|--------|-------|
| `tests/test_pipelines.py` | Pipelines | Execution, x_* metadata fields |
| `tests/test_core_processors.py` | Processors | FOCUS 1.3 conversion |
| `tests/test_processors/test_openai.py` | OpenAI | GenAI PAYG processing |
| `tests/test_processors/test_anthropic.py` | Anthropic | GenAI PAYG processing |
| `tests/test_processors/test_gcp.py` | GCP | Cloud billing processing |
| `tests/test_engine.py` | BigQuery | Engine operations |
| `tests/test_notifications.py` | Notifications | Email delivery |
| `tests/test_security.py` | Security | Auth, XSS prevention |
| `tests/test_scheduler.py` | Scheduler | Job triggers |

### Frontend Tests

```bash
cd 01-fronted-system

# Unit tests (Vitest)
npm run test

# E2E tests (Playwright)
npx playwright test

# Specific E2E spec
npx playwright test tests/e2e/dashboard.spec.ts
npx playwright test tests/e2e/costs.spec.ts
```

| Directory | Domain | Tests |
|-----------|--------|-------|
| `tests/e2e/` | E2E | Dashboard, costs, settings, billing, pipelines |
| `tests/e2e/fixtures/auth.ts` | Auth | Shared auth state for E2E |
| `tests/demo-setup/` | Demo | Account setup, data loading, cleanup |

### Demo Setup Tests

```bash
cd 01-fronted-system

# 0. Cleanup existing demo
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai

# 1. Create demo account
npx tsx tests/demo-setup/setup-demo-account.ts

# 2. Load demo data (use org_slug from step 1)
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 3. Verify demo costs (CRITICAL: Dec 2025 - Jan 2026 date range)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

| Script | Purpose | Expected Output |
|--------|---------|-----------------|
| `cleanup-demo-account.ts` | Delete user/org | Supabase + BigQuery cleaned |
| `setup-demo-account.ts` | Create account via Playwright | `{ orgSlug, apiKey, dashboardUrl }` |
| `load-demo-data-direct.ts` | Load raw data + run pipelines | All pipelines succeed |
| `generate-demo-data.py` | Generate realistic demo data | CSV/JSON files created |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| All 6 org fixtures pass | `pytest -v -k "multi_org"` | 6 orgs with correct currencies |
| Calendar fiscal year | `pytest -v -k "calendar"` | Jan-Dec boundaries |
| India fiscal year | `pytest -v -k "india_uk"` | Apr-Mar boundaries |
| Australia fiscal year | `pytest -v -k "australia"` | Jul-Jun boundaries |
| Demo data date range | Query with Dec 2025 - Jan 2026 | Total ~$234K |
| Test cleanup | Run tests, check for orphaned data | 0 orphaned test orgs |
| Coverage above threshold | Check HTML coverage report | >80% line coverage |
| No flaky tests | Run test suite 3 times | Same results each run |
| E2E auth state persists | Run multiple E2E specs sequentially | No re-login between specs |
| CI workflow matches local | Compare CI output with local run | Same pass/fail results |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| API service unit tests | 100% passing |
| Pipeline service unit tests | 100% passing |
| Frontend unit tests | 100% passing |
| E2E tests | 90%+ passing (some may be environment-dependent) |
| Multi-org fixtures | All 6 orgs tested |
| Multi-currency conversions | Correct to 4 decimal places |
| Test isolation | 0 shared state between runs |
| No flaky tests | 0 intermittent failures over 3 runs |
| Demo data verification | Totals within 5% of expected |

## Known Limitations

1. **Integration tests require GCP**: Tests marked with `integration` need `cloudact-testing-1` credentials and a live BigQuery connection; skipped in CI unless on main branch
2. **E2E auth state**: Playwright auth setup (`auth.setup.ts`) requires running services (frontend 3000, API 8000); may timeout if services are slow to start
3. **Demo date range**: Demo data is hardcoded to Dec 2025 - Jan 2026; querying other ranges will return $0
4. **AsyncMock requirement**: All async mocks must use `AsyncMock` (not `MagicMock`); this is a common source of test failures when adding new tests
5. **Parallel test execution**: `pytest -n auto` may cause flaky results if tests share BigQuery datasets; use unique org slugs per test
6. **Supabase email confirmation**: Must be disabled in test environments or signup automation will fail with 400 errors
7. **Pipeline service conftest.py**: The 866-line conftest.py contains all multi-org fixtures; changes to it affect the entire pipeline test suite
