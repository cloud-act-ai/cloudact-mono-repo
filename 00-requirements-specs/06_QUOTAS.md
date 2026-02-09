# Quotas & Rate Limiting

**v2.0** | 2026-02-08

> Plan-based resource limits with atomic enforcement and self-healing.

---

## Quota Enforcement Workflow

```
1. Pipeline request → API Service (8000)
2. Read subscription limits from Supabase (source of truth for plans)
3. Self-healing: cleanup_stale_concurrent_for_org(org_slug) (~50ms, zero if no stale)
4. Atomic quota check-and-reserve → Single SQL UPDATE with WHERE clauses
5. Return success OR 429 error with specific reason code
6. Pipeline executes → Pipeline Service (8001)
7. On complete → Decrement concurrent count, increment success/fail
8. Daily reset → 00:00 UTC (Cloud Run Job, API-first)
9. Monthly reset → 00:05 UTC 1st of month (Cloud Run Job)
10. Stale cleanup → 02:00 UTC daily (safety net, most handled by self-healing)
```

**Self-healing:** Before every quota reservation, stale concurrent counters are cleaned for the requesting org. This adds ~50ms overhead only when stale counters exist, zero overhead otherwise.

**Atomic reservation:** A single SQL UPDATE with WHERE clauses prevents race conditions. No separate read-then-write — the check and reserve happen in one statement.

---

## Plan Limits

| Plan | Daily | Monthly | Concurrent | Seats | Providers | Price |
|------|-------|---------|------------|-------|-----------|-------|
| **Starter** | 6 | 180 | 20 | 2 | 3 | $19 |
| **Professional** | 25 | 750 | 20 | 6 | 6 | $69 |
| **Scale** | 100 | 3000 | 20 | 11 | 10 | $199 |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Custom |

**Note:** Concurrent limit is 20 for all standard plans. Enterprise has no limits.

---

## Quota Types

| Quota | Description | Reset |
|-------|-------------|-------|
| `pipelines_run_today` | Daily pipeline executions | 00:00 UTC |
| `pipelines_run_month` | Monthly pipeline executions | 1st of month |
| `concurrent_pipelines_running` | Simultaneous executions | On completion |
| `seat_limit` | Team members per org | N/A (static) |
| `providers_limit` | Integrations per org | N/A (static) |

---

## Data Storage

| Table | Location | Purpose |
|-------|----------|---------|
| `organizations` | Supabase | Plan limits, billing status (source of truth) |
| `org_quotas` | Supabase | Current usage tracking (daily/monthly/concurrent) |
| `org_subscriptions` | BigQuery | Plan metadata (synced from Supabase at onboarding) |
| `org_usage_quotas` | BigQuery | Historical usage tracking |

**Supabase is the source of truth** for plan limits and current usage. BigQuery stores historical data.

---

## Quota Reset Schedule (Cloud Run Jobs)

| Job | Schedule | Action |
|-----|----------|--------|
| `quota-reset-daily` | 00:00 UTC | Reset `pipelines_run_today` + concurrent |
| `quota-reset-monthly` | 00:05 UTC 1st | Reset `pipelines_run_month` |
| `stale-cleanup` | 02:00 UTC daily | Fix stuck concurrent counts (safety net) |
| `quota-cleanup` | 01:00 UTC daily | Delete quota records >90 days |

---

## API Endpoints (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/organizations/{org}/quota` | Get current quota status |
| POST | `/validator/validate/{org}` | Validate before pipeline run |

---

## Frontend

| Page | Purpose |
|------|---------|
| `/settings/quota-usage` | Quota usage dashboard (~18KB) |

---

## Rate Limiting (Separate from Quotas)

| Scope | Limit |
|-------|-------|
| Per-org | 100 req/min, 1000 req/hour |
| Global | 10,000 req/min |

---

## Frontend Warning Thresholds

| Usage | Level | Color |
|-------|-------|-------|
| 80% | Warning | Yellow |
| 90% | Critical | Orange |
| 100% | Exceeded | Red (blocked) |

---

## Error Responses

| Code | Reason |
|------|--------|
| 429 | `DAILY_QUOTA_EXCEEDED` |
| 429 | `MONTHLY_QUOTA_EXCEEDED` |
| 429 | `CONCURRENT_LIMIT_EXCEEDED` |
| 429 | `PROVIDER_LIMIT_EXCEEDED` |
| 429 | `SEAT_LIMIT_EXCEEDED` |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/quota.py` | Quota endpoint |
| `02-api-service/src/app/dependencies/auth.py` | Atomic reservation |
| `02-api-service/src/app/models/org_models.py` | `SUBSCRIPTION_LIMITS` |
| `03-data-pipeline-service/src/core/utils/quota_reset.py` | Reset functions |
| `01-fronted-system/components/quota-warning-banner.tsx` | Warning UI |
| `01-fronted-system/app/[orgSlug]/settings/quota-usage/page.tsx` | Quota usage page |
