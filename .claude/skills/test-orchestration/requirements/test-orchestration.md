# Test Orchestration - Requirements

## Overview

Multi-environment testing strategy for CloudAct covering unit tests (Vitest/pytest), E2E tests (Playwright), integration tests, and demo data automation across local, stage, and production environments.

## Source Specification

`05_TESTING.md` (v3.0, 2026-02-08)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     3-Tier Testing Architecture                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Tier 1: Frontend (Vitest + Playwright)                                     │
│  ──────────────────────────────────────                                     │
│                                                                             │
│  Vitest (Unit)                    Playwright (E2E)                           │
│  ─────────────                    ────────────────                           │
│  01-fronted-system/tests/         01-fronted-system/tests/e2e/              │
│  ├─ Component tests               ├─ auth.setup.ts (shared auth)           │
│  ├─ Server action tests           ├─ dashboard.spec.ts                     │
│  ├─ Hook tests                    ├─ costs.spec.ts                         │
│  └─ Utility tests                 ├─ settings.spec.ts                      │
│                                   ├─ billing.spec.ts                       │
│  Run: npm test                    ├─ pipelines.spec.ts                     │
│                                   └─ notifications.spec.ts                 │
│                                   Run: npx playwright test                  │
│                                                                             │
│  Tier 2: API Service (pytest + AsyncMock)                                   │
│  ────────────────────────────────────────                                   │
│                                                                             │
│  02-api-service/tests/                                                      │
│  ├─ 00_test_bootstrap.py          (system init)                             │
│  ├─ 01_test_onboarding.py         (org creation)                            │
│  ├─ 02_test_integrations.py       (credential CRUD + KMS)                   │
│  ├─ 03_test_subscriptions.py      (plan management)                         │
│  ├─ 04_test_hierarchy.py          (org structure)                           │
│  ├─ 05_test_pipelines.py          (pipeline operations)                     │
│  ├─ 06_test_quotas.py             (usage limits)                            │
│  ├─ 07_test_notifications.py      (alerts + delivery)                       │
│  └─ 08_test_costs.py              (cost reads + aggregation)                │
│                                                                             │
│  Run: python -m pytest tests/ -v                                            │
│  Integration: python -m pytest tests/ -v --run-integration                  │
│                                                                             │
│  Tier 3: Pipeline Service (pytest + BigQuery Mock)                          │
│  ─────────────────────────────────────────────────                          │
│                                                                             │
│  03-data-pipeline-service/tests/                                            │
│  ├─ 00_test_bootstrap.py          (dataset init)                            │
│  ├─ 01_test_onboarding.py         (org dataset setup)                       │
│  ├─ 02_test_integrations.py       (credential decrypt)                      │
│  ├─ 03_test_subscriptions.py      (subscription pipelines)                  │
│  ├─ 04_test_hierarchy.py          (view refresh)                            │
│  ├─ 05_test_pipelines.py          (execution engine)                        │
│  ├─ 06_test_quotas.py             (quota enforcement)                       │
│  ├─ 07_test_notifications.py      (pipeline notifications)                  │
│  └─ 08_test_costs.py              (FOCUS 1.3 output)                        │
│                                                                             │
│  Run: python -m pytest tests/ -v                                            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Multi-Org Test Fixtures                                                    │
│  ───────────────────────                                                    │
│                                                                             │
│  6 Test Orgs (unique slugs per run):                                        │
│  ├─ acme_inc_{ts}        (primary, USD)                                     │
│  ├─ globex_{ts}          (secondary, EUR)                                   │
│  ├─ initech_{ts}         (tertiary, GBP)                                    │
│  ├─ umbrella_{ts}        (quaternary, JPY)                                  │
│  ├─ wayne_ent_{ts}       (quinary, AUD)                                     │
│  └─ stark_ind_{ts}       (senary, CAD)                                      │
│                                                                             │
│  6 Currencies: USD, EUR, GBP, JPY, AUD, CAD                                │
│  Each org gets isolated BigQuery dataset + Supabase records                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Demo Data Flow                                                             │
│  ──────────────                                                             │
│                                                                             │
│  generate-demo-data.py ──▶ load-demo-data-direct.ts ──▶ Pipeline runs      │
│  (synthetic CSV data)      (load to BQ + trigger)       (transform + FOCUS) │
│       │                          │                            │             │
│       ▼                          ▼                            ▼             │
│  Dec 2025 - Jan 2026      Raw tables populated       cost_data_standard_1_3│
│  GenAI ~$232K                                        (unified FOCUS 1.3)    │
│  Cloud ~$382                                                                │
│  SaaS ~$1.4K                                                                │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CI/CD Test Gates                                                           │
│  ────────────────                                                           │
│                                                                             │
│  PR Push ──▶ Cloud Build ──▶ pytest (API) ──▶ pytest (Pipeline) ──▶ Vitest  │
│                                                                    │        │
│              ┌─────────────────────────────────────────────────────┘        │
│              ▼                                                              │
│  main merge ──▶ Stage Deploy ──▶ Playwright E2E ──▶ Smoke Tests            │
│                                                                             │
│  git tag v* ──▶ Prod Deploy ──▶ Health Checks ──▶ Post-Deploy Verify       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-TEST-01: Test Workflow

```
1. Write tests -> Unit (vitest/pytest) + E2E (Playwright) + Integration
2. Run locally -> Against cloudact-testing-1 with TEST Stripe keys
3. CI validates -> Cloud Build runs tests on push
4. Stage deploy -> Auto on main push -> Smoke tests
5. Prod deploy -> Git tag triggers -> Health checks
```

### FR-TEST-02: Test Types and Locations

| Type | Tool | Location | Run Command |
|------|------|----------|-------------|
| Unit (Frontend) | Vitest | `01-fronted-system/tests/` | `npm test` |
| E2E (Frontend) | Playwright | `01-fronted-system/tests/e2e/` | `npx playwright test` |
| Unit (API) | pytest | `02-api-service/tests/` | `python -m pytest tests/ -v` |
| Unit (Pipeline) | pytest | `03-data-pipeline-service/tests/` | `python -m pytest tests/ -v` |
| Integration | pytest | `--run-integration` flag | Backend services only |

### FR-TEST-03: Backend Test File Convention

Backend tests use numbered files for ordered execution:

```
tests/
  00_test_bootstrap.py
  01_test_onboarding.py
  02_test_integrations.py
  03_test_subscriptions.py
  04_test_hierarchy.py
  05_test_pipelines.py
  06_test_quotas.py
  07_test_notifications.py
  08_test_costs.py
```

### FR-TEST-04: Test Environments

| Env | GCP Project | Stripe | Supabase |
|-----|-------------|--------|----------|
| local/test | cloudact-testing-1 | TEST | kwroaccbrxppfiysqlzs |
| stage | cloudact-testing-1 | TEST | kwroaccbrxppfiysqlzs |
| prod | cloudact-prod | LIVE | ovfxswhkkshouhsryzaf |

### FR-TEST-05: Test Credentials

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `Demo1234` |
| Company | `Acme Inc` |
| Org Slug | Dynamic: `acme_inc_{base36_timestamp}` (auto-generated at signup) |

### FR-TEST-06: Demo Data Management

**Date Range (CRITICAL):** Demo data spans Dec 2025 - Jan 2026. Always use:
```
?start_date=2025-12-01&end_date=2026-01-31
```

**Expected Demo Totals:**

| Category | Approximate Total |
|----------|-------------------|
| GenAI | ~$232K |
| Cloud | ~$382 |
| Subscription | ~$1.4K |
| **Total** | **~$234K** |

### FR-TEST-07: Demo Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `cleanup-demo-account.ts` | `01-fronted-system/tests/demo-setup/` | Delete user/org from Supabase + BigQuery |
| `setup-demo-account.ts` | `01-fronted-system/tests/demo-setup/` | Create account via Playwright (Stripe checkout + API key) |
| `load-demo-data-direct.ts` | `01-fronted-system/tests/demo-setup/` | Load raw data + run all pipelines |
| `generate-demo-data.py` | `01-fronted-system/tests/demo-setup/` | Generate realistic demo data |

### FR-TEST-08: Demo Setup Workflow

```bash
cd 01-fronted-system

# 0. Cleanup existing demo (if re-creating)
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai

# 1. Create account (Playwright automation)
npx tsx tests/demo-setup/setup-demo-account.ts

# 2. Load demo data + run pipelines
export ORG_SLUG="acme_inc_xxxxx"
export ORG_API_KEY="..."
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 3. Verify costs
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

---

## Non-Functional Requirements

### NFR-TEST-01: Test Isolation

Each test org gets a unique `{company}_{timestamp}` slug. No shared state between test runs.

### NFR-TEST-02: Cleanup

Test fixtures must clean up created data after runs. No orphaned test data.

### NFR-TEST-03: No Production Data

Never use production credentials in tests. Test and stage environments use `cloudact-testing-1` project.

### NFR-TEST-04: Mocking

Mock external APIs (Stripe, BigQuery) in unit tests. Integration tests may use real services.

### NFR-TEST-05: Auth in Tests

`DISABLE_AUTH=true` allowed in test only, NEVER in production.

---

## Common Demo Issues

| Issue | Fix |
|-------|-----|
| API shows $0 | Use correct date range (Dec 2025 - Jan 2026) |
| Signup 400 error | Disable Supabase email confirmation |
| No API key created | Bootstrap not done -- run bootstrap first |
| GenAI costs $0 | Load pricing data to `genai_payg_pricing` |

---

## SDLC

### Development Workflow

```
1. Write Tests Alongside Code  ── Every feature gets unit + integration tests
2. Run Locally                 ── pytest / vitest / playwright against cloudact-testing-1
3. PR Gates                    ── Cloud Build runs all test suites on push
4. Stage Deploy                ── Auto on main merge; Playwright E2E runs
5. Prod Deploy                 ── Git tag triggers build; health checks + smoke tests
6. Monitor                     ── Test coverage tracked; flaky tests flagged
```

### Testing Approach (Meta-Testing)

| Layer | Tool | Tests | Focus |
|-------|------|-------|-------|
| Test the Tests | pytest + Vitest | Fixture validation | Verify fixtures create/cleanup correctly |
| Coverage Tracking | pytest-cov + c8 | All suites | Coverage metrics per service |
| Fixture Management | conftest.py | Shared fixtures | Multi-org setup, teardown, isolation |
| Demo Data Integrity | pytest | Demo scripts | Verify expected totals (GenAI ~$232K, etc.) |
| E2E Auth State | Playwright | `auth.setup.ts` | Shared authentication state across specs |
| Flaky Detection | CI logs | Cloud Build history | Identify and quarantine non-deterministic tests |
| Environment Parity | Manual | Env comparison | Test/stage/prod config consistency |

### Deployment / CI-CD Integration

- **PR Gate:** All three test suites (API pytest, Pipeline pytest, Frontend Vitest) must pass
- **Cloud Build:** `cloudbuild-stage.yaml` runs tests before deploying to stage
- **Stage:** Playwright E2E runs against deployed stage environment
- **Prod:** Health checks + smoke tests post-deploy; no full test suite against prod
- **Test Data:** Demo data uses Dec 2025 - Jan 2026 range -- NEVER production dates
- **Fixture Cleanup:** Every test run cleans up its own org datasets and Supabase records
- **Coverage:** Tracked per service; regressions flagged in PR reviews

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/tests/` | Frontend unit + E2E tests |
| `01-fronted-system/tests/demo-setup/` | Demo account automation scripts |
| `02-api-service/tests/` | API service tests (00-08 numbered) |
| `03-data-pipeline-service/tests/` | Pipeline service tests (00-08 numbered) |
| `01-fronted-system/vitest.config.ts` | Vitest configuration |
| `01-fronted-system/playwright.config.ts` | Playwright E2E configuration |
