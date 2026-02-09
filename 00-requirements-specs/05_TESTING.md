# Testing

**v3.0** | 2026-02-08

> Multi-environment testing for CloudAct with demo data automation.

---

## Test Workflow

```
1. Write tests → Unit (vitest/pytest) + E2E (Playwright) + Integration
2. Run locally → Against cloudact-testing-1 with TEST Stripe keys
3. CI validates → Cloud Build runs tests on push
4. Stage deploy → Auto on main push → Smoke tests
5. Prod deploy → Git tag triggers → Health checks
```

---

## Environments

| Env | GCP Project | Stripe | Supabase |
|-----|-------------|--------|----------|
| local/test | cloudact-testing-1 | TEST | kwroaccbrxppfiysqlzs |
| stage | cloudact-testing-1 | TEST | kwroaccbrxppfiysqlzs |
| prod | cloudact-prod | LIVE | ovfxswhkkshouhsryzaf |

---

## Test Types

| Type | Tool | Location | Run |
|------|------|----------|-----|
| Unit (Frontend) | Vitest | `01-fronted-system/tests/` | `npm test` |
| E2E (Frontend) | Playwright | `01-fronted-system/tests/e2e/` | `npx playwright test` |
| Unit (API) | pytest | `02-api-service/tests/` | `python -m pytest tests/ -v` |
| Unit (Pipeline) | pytest | `03-data-pipeline-service/tests/` | `python -m pytest tests/ -v` |
| Integration | pytest | `--run-integration` flag | Backend services only |

### Backend Test File Convention

Backend tests use numbered files for ordered execution:

```
tests/
├── 00_test_bootstrap.py
├── 01_test_onboarding.py
├── 02_test_integrations.py
├── 03_test_subscriptions.py
├── 04_test_hierarchy.py
├── 05_test_pipelines.py
├── 06_test_quotas.py
├── 07_test_notifications.py
├── 08_test_costs.py
```

---

## Test Credentials

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `Demo1234` |
| Company | `Acme Inc` |
| Org Slug | Dynamic: `acme_inc_{base36_timestamp}` (auto-generated at signup) |

---

## Demo Data

### Date Range (CRITICAL)

**Demo data spans Dec 2025 - Jan 2026.** Always use:

```
?start_date=2025-12-01&end_date=2026-01-31
```

### Expected Demo Totals

| Category | Approximate Total |
|----------|-------------------|
| GenAI | ~$232K |
| Cloud | ~$382 |
| Subscription | ~$1.4K |
| **Total** | **~$234K** |

### Demo Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `cleanup-demo-account.ts` | `01-fronted-system/tests/demo-setup/` | Delete user/org from Supabase + BigQuery |
| `setup-demo-account.ts` | `01-fronted-system/tests/demo-setup/` | Create account via Playwright (Stripe checkout + API key) |
| `load-demo-data-direct.ts` | `01-fronted-system/tests/demo-setup/` | Load raw data + run all pipelines |
| `generate-demo-data.py` | `01-fronted-system/tests/demo-setup/` | Generate realistic demo data |

### Demo Setup Workflow

```bash
cd 01-fronted-system

# 0. Cleanup existing demo (if re-creating)
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai

# 1. Create account (Playwright automation)
npx tsx tests/demo-setup/setup-demo-account.ts
# Output: { orgSlug: "acme_inc_xxxxx", apiKey: "org_api_key_...", dashboardUrl: "..." }

# 2. Load demo data + run pipelines
export ORG_SLUG="acme_inc_xxxxx"  # from step 1
export ORG_API_KEY="..."          # from step 1
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 3. Verify costs
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

### Common Demo Issues

| Issue | Fix |
|-------|-----|
| API shows $0 | Use correct date range (Dec 2025 - Jan 2026) |
| Signup 400 error | Disable Supabase email confirmation |
| No API key created | Bootstrap not done — run bootstrap first |
| GenAI costs $0 | Load pricing data to `genai_payg_pricing` |

---

## Testing Standards

| Standard | Implementation |
|----------|----------------|
| Isolation | Each test org gets unique `{company}_{timestamp}` slug |
| Cleanup | Test fixtures clean up created data after runs |
| No prod data | Never use production credentials in tests |
| Mocking | Mock external APIs (Stripe, BigQuery) in unit tests |
| Environment | `DISABLE_AUTH=true` allowed in test only, NEVER in prod |

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
