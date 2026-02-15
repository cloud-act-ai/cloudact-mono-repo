---
name: test-orchestration
description: |
  Test orchestration for CloudAct. Multi-org, multi-currency, and multi-environment testing.
  Use when: running tests, setting up test fixtures, debugging test failures, understanding test patterns,
  or working with the comprehensive test infrastructure across all three services.
---

# Test Orchestration

## Overview
CloudAct has comprehensive testing across all services with multi-org and multi-currency fixtures.

## Environments

| Env | GCP Project | Supabase Project | API URL | Pipeline URL | GCP Key File |
|-----|-------------|-----------------|---------|--------------|--------------|
| local | cloudact-testing-1 | `kwroaccbrxppfiysqlzs` | `http://localhost:8000` | `http://localhost:8001` | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` |
| test/stage | cloudact-testing-1 | `kwroaccbrxppfiysqlzs` | Cloud Run URL | Cloud Run URL | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` |
| prod | cloudact-prod | `ovfxswhkkshouhsryzaf` | `https://api.cloudact.ai` | `https://pipeline.cloudact.ai` | `/Users/openclaw/.gcp/cloudact-prod.json` |

> **Note:** local/test/stage all use `cloudact-testing-1`. No separate `cloudact-stage` project.
> **Note:** Unit tests run locally without GCP auth. Integration tests require GCP credentials.

### GCP Auth (for integration tests)

```bash
# Stage/test (ABSOLUTE paths - ~/ does NOT expand!)
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json

# Prod
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json
```

## Key Locations
- **Frontend Tests:** `01-fronted-system/tests/`
- **API Tests:** `02-api-service/tests/`
- **Pipeline Tests:** `03-data-pipeline-service/tests/`
- **Test Fixtures:** `03-data-pipeline-service/tests/conftest.py` (866 lines)
- **CI Workflow:** `.github/workflows/test.yml`

## Test Infrastructure

### Frontend Testing
```
01-fronted-system/tests/
├── e2e/                      # End-to-end tests (01-15)
├── api-integration/          # API integration tests
├── ui/                       # UI component tests
├── org-onboarding/           # Onboarding flow tests
├── saas-subscription/        # Subscription tests
├── stripe-billing/           # Billing tests
├── user-account/             # User management tests
├── quota-enforcement/        # Quota tests
├── i18n/                     # Internationalization tests
└── utils/                    # Utility tests
```

### API Service Testing
```
02-api-service/tests/
├── test_bootstrap.py         # 30 meta table creation
├── test_organizations.py     # Org onboarding
├── test_integrations.py      # Provider integrations
├── test_subscriptions.py     # SaaS subscriptions
├── test_costs.py             # Cost calculations
├── test_pipeline_logs.py     # Pipeline logging
├── test_pipeline_validator.py# Config validation
├── test_quota.py             # Quota enforcement
├── test_security.py          # Security tests
├── test_validation.py        # Input validation
└── test_performance.py       # Performance tests
```

### Pipeline Service Testing
```
03-data-pipeline-service/tests/
├── test_api.py               # API endpoint tests
├── test_config.py            # Configuration tests
├── test_core_processors.py   # Processor tests
├── test_engine.py            # BigQuery engine tests
├── test_load.py              # Load tests
├── test_middleware.py        # Middleware tests
├── test_notifications.py     # Email notification tests
├── test_pipelines.py         # Pipeline execution tests
├── test_processors/          # Provider-specific tests
│   ├── test_openai.py
│   ├── test_anthropic.py
│   └── test_gcp.py
├── test_scheduler.py         # Scheduler tests
├── test_security.py          # Security tests
└── test_utils.py             # Utility tests
```

## Multi-Org Test Fixtures
```python
# From conftest.py - 6 org fixtures with different currencies
ORG_FIXTURES = {
    "acme_us": {"currency": "USD", "exchange_rate": 1.0000},
    "acme_in": {"currency": "INR", "exchange_rate": 0.0120},
    "acme_eu": {"currency": "EUR", "exchange_rate": 1.0850},
    "acme_ae": {"currency": "AED", "exchange_rate": 0.2723},
    "acme_au": {"currency": "AUD", "exchange_rate": 0.6550},
    "acme_jp": {"currency": "JPY", "exchange_rate": 0.0067},
}
```

## Instructions

### 1. Run All Frontend Tests
```bash
cd 01-fronted-system

# Browser-based tests (Vitest)
npm run test

# API integration tests
npm run test:api

# E2E tests (Playwright)
npx playwright test
```

### 2. Run All API Tests
```bash
cd 02-api-service

# All tests
python -m pytest tests/ -v

# With coverage
python -m pytest tests/ -v --cov=src --cov-report=html

# Specific test file
python -m pytest tests/test_bootstrap.py -v

# Specific test
python -m pytest tests/test_bootstrap.py::test_create_meta_tables -v
```

### 3. Run All Pipeline Tests
```bash
cd 03-data-pipeline-service

# All tests
python -m pytest tests/ -v

# Cost calculation tests
python -m pytest tests/test_05b_subscription_cost_calculation_unit.py -v

# Processor tests
python -m pytest tests/test_processors/ -v
```

### 4. Run Multi-Org Tests
```bash
# Tests across all org fixtures
python -m pytest tests/ -v -k "multi_org"

# Currency-specific tests
python -m pytest tests/ -v -k "currency"
```

### 5. Run Security Tests
```bash
# API security
python -m pytest 02-api-service/tests/test_security.py -v

# Pipeline security
python -m pytest 03-data-pipeline-service/tests/test_security.py -v
```

### 6. Run CI Tests Locally
```bash
# Mimics CI workflow
python -m pytest tests/ -v --tb=short

# With parallel execution
python -m pytest tests/ -v -n auto
```

## Fiscal Year Test Patterns
```python
# Calendar year (US)
@pytest.mark.parametrize("fiscal_pattern", ["calendar"])
def test_calendar_year_costs(fiscal_pattern):
    ...

# India/UK fiscal year
@pytest.mark.parametrize("fiscal_pattern", ["india_uk"])
def test_india_fiscal_year_costs(fiscal_pattern):
    ...

# Australia fiscal year
@pytest.mark.parametrize("fiscal_pattern", ["australia"])
def test_australia_fiscal_year_costs(fiscal_pattern):
    ...
```

## Test Configuration
```ini
# pytest.ini (both services)
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
```

```typescript
// vitest.config.ts (frontend)
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  }
})
```

## CI Workflow Jobs
1. **Unit Tests** - API and pipeline service tests
2. **Security Tests** - Mocked endpoint security tests
3. **Cost Calculation Tests** - Pure math, no external deps
4. **Integration Tests** - Main branch only, requires GCP
5. **Lint & Type Check** - Ruff, mypy, ESLint

## Validation Checklist
- [ ] All unit tests pass
- [ ] Multi-org fixtures tested
- [ ] Multi-currency calculations verified
- [ ] Security tests pass
- [ ] No flaky tests
- [ ] Coverage maintained

## Common Issues
| Issue | Solution |
|-------|----------|
| Async test timeout | Increase timeout or check async handling |
| BigQuery mock failure | Check mock configuration in conftest.py |
| Currency mismatch | Verify exchange rate in fixtures |
| Auth failure in tests | Set DISABLE_AUTH=true for unit tests only |

## Quick Commands

```bash
# === QUICK TESTS (< 5 min, no external deps) ===
cd 02-api-service && python -m pytest tests/ -v -m "not integration"
cd 03-data-pipeline-service && python -m pytest tests/ -v -m "not integration"
cd 01-fronted-system && npm run test

# === FULL SYSTEM (15-30 min) ===
pytest 02-api-service/tests/ -v --cov
pytest 03-data-pipeline-service/tests/ -v --cov
cd 01-fronted-system && npm run test

# === SECURITY ONLY ===
pytest 02-api-service/tests/test_security.py -v
pytest 03-data-pipeline-service/tests/test_security.py -v

# === SINGLE TEST FILE ===
python -m pytest tests/test_bootstrap.py -v

# === PATTERN MATCHING ===
python -m pytest tests/ -v -k "subscription"
python -m pytest tests/ -v -k "cost and not integration"
```

## Example Prompts

```
# Quick Validation
"Run full test suite and fix all issues"
"Quick test check before commit"
"Run fast tests only (no integration)"

# Single Service
"Run API service tests"
"Run pipeline service tests"
"Run frontend tests"

# Full System
"Run full test suite across all services"
"Test the entire system with coverage"

# Security
"Run security tests for all services"
"Test KMS encryption"
"Run auth validation tests"

# Multi-Org/Currency
"Run tests across all 6 org fixtures"
"Test with USD, EUR, and INR organizations"
"Multi-currency cost calculation tests"

# Specific Categories
"Run cost calculation unit tests"
"Run subscription tests"
"Test pipeline processors"
"Run the quota enforcement tests"

# Debugging
"Debug failing test in pipeline service"
"Run tests with verbose output"
"Why is test_xyz failing?"
```

## Common Test Failures & Fixes

| Pattern | Cause | Fix |
|---------|-------|-----|
| `MagicMock can't be used in await` | Async method mocked with `MagicMock` | Use `AsyncMock` for all async methods |
| `assert 'JP¥' == '¥'` | Test expectation mismatch | Check actual implementation - may be intentional |
| `ValidationError` in tests | Model schema changed | Update test data to match new schema |
| Timeout in async tests | Slow or hanging operation | Check missing `AsyncMock` or increase timeout |
| `KeyError: 'org_slug'` | Missing context in mocks | Add required fields to mock config |

## Source Specifications

Requirements consolidated from:
- `05_TESTING.md` - Testing strategy

## Development Rules (Non-Negotiable)

- **ZERO mock tests** - All tests must hit real services (BigQuery, Supabase, APIs). No `jest.mock()`, no `unittest.mock` for core logic.
- **Parallel test execution** - Use `pytest-xdist` (`-n auto`) for backend tests
- **Run all tests before/after** - Don't break existing functionality. Full suite validation required.
- **No over-engineering** - Simple, direct test fixtures. No unnecessary abstractions.
- **Multi-tenancy isolation** - All test fixtures must use unique `org_slug` to prevent cross-org contamination
- **Enterprise-grade for 10k customers** - Tests must validate at scale (multi-org, multi-currency fixtures)
- **Update skills with learnings** - Document test patterns and fixes in skill files

## 5 Implementation Pillars

| Pillar | How Test Orchestration Handles It |
|--------|-------------------------------|
| **i18n** | Multi-currency test fixtures (USD, EUR, AED, INR), timezone-aware date assertions, locale formatting tests |
| **Enterprise** | Multi-org testing, parallel test execution, fixture isolation, comprehensive coverage |
| **Cross-Service** | Tests span Frontend -> API -> Pipeline -> BigQuery, integration tests validate cross-service contracts |
| **Multi-Tenancy** | Test fixtures create isolated orgs, cleanup after tests, no shared state between test orgs |
| **Reusability** | Shared test utilities, fixture factories, assertion helpers, mock patterns |

## Related Skills
- `config-validator` - Validate test configs
- `security-audit` - Security test coverage
- `cost-analysis` - Cost calculation testing
