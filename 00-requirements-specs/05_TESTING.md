# Testing

**v2.0** | 2026-01-15

> Multi-environment testing for CloudAct

---

## Environments

| Env | GCP Project | Stripe | Supabase |
|-----|-------------|--------|----------|
| local | cloudact-testing-1 | TEST | kwroaccbrxppfiysqlzs |
| test | cloudact-testing-1 | TEST | kwroaccbrxppfiysqlzs |
| stage | cloudact-stage | TEST | kwroaccbrxppfiysqlzs |
| prod | cloudact-prod | LIVE | ovfxswhkkshouhsryzaf |

---

## Running Tests

```bash
# Frontend (vitest)
cd 01-fronted-system
npm test
npx vitest run tests/01-signup.test.ts

# Backend (pytest)
cd 02-api-service
python -m pytest tests/ -v

cd 03-data-pipeline-service
python -m pytest tests/ -v
```

---

## Test Types

| Type | Tool | Location |
|------|------|----------|
| Unit | vitest/pytest | `tests/` |
| E2E | vitest | `tests/*.test.ts` |
| Integration | pytest | `--run-integration` |

---

## Test Credentials

| Field | Value |
|-------|-------|
| Email | john@example.com |
| Password | acme1234 |
| Org | acme_inc_01032026 |
