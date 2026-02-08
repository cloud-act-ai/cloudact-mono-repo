# Testing

**v2.1** | 2026-02-05

> Multi-environment testing for CloudAct

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
| Unit (Frontend) | vitest | `01-fronted-system/tests/` | `npm test` |
| Unit (API) | pytest | `02-api-service/tests/` | `python -m pytest tests/ -v` |
| Unit (Pipeline) | pytest | `03-data-pipeline-service/tests/` | `python -m pytest tests/ -v` |
| E2E | Playwright | `01-fronted-system/tests/e2e/` | `npx playwright test` |
| Integration | pytest | `--run-integration` flag | Backend services only |

---

## Test Credentials

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `Demo1234` |
| Company | `Acme Inc` |
| Org Slug | Dynamic: `acme_inc_{base36_timestamp}` (auto-generated at signup) |

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
| `02-api-service/tests/` | API service tests |
| `03-data-pipeline-service/tests/` | Pipeline service tests |
| `01-fronted-system/tests/demo-setup/` | Demo account automation |
