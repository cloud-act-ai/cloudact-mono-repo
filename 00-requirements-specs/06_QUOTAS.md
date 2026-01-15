# Quotas & Rate Limiting

**v1.0** | 2026-01-15

> Plan-based resource limits with atomic enforcement

---

## Plan Limits

| Plan | Daily | Monthly | Concurrent | Seats | Providers | Price |
|------|-------|---------|------------|-------|-----------|-------|
| **Starter** | 6 | 180 | 20 | 2 | 3 | $19 |
| **Professional** | 25 | 750 | 20 | 6 | 6 | $69 |
| **Scale** | 100 | 3000 | 20 | 11 | 10 | $199 |
| **Enterprise** | ∞ | ∞ | ∞ | ∞ | ∞ | Custom |

---

## Quota Types

| Quota | Description | Reset |
|-------|-------------|-------|
| `pipelines_run_today` | Daily pipeline executions | 00:00 UTC |
| `pipelines_run_month` | Monthly pipeline executions | 1st of month |
| `concurrent_pipelines_running` | Simultaneous executions | On completion |
| `seat_limit` | Team members per org | N/A |
| `providers_limit` | Integrations per org | N/A |

---

## Data Storage

| Table | Purpose |
|-------|---------|
| `org_subscriptions` | Plan limits (source of truth) |
| `org_usage_quotas` | Daily/monthly usage tracking |

---

## Enforcement Flow

```
Pipeline Request → API Service validates:
1. Subscription status (ACTIVE/TRIAL)
2. Atomic quota check-and-reserve
3. Return success OR 429 error
         ↓
Pipeline executes → On complete:
1. Decrement concurrent count
2. Increment success/fail counters
```

**Atomic Check:** Single SQL UPDATE with WHERE clauses prevents race conditions

---

## API Endpoints

```bash
# Get quota status (8000)
GET /api/v1/organizations/{org}/quota

# Validate before pipeline (8000)
POST /api/v1/validator/validate/{org}
```

---

## Quota Resets

| Reset | Schedule | Action |
|-------|----------|--------|
| Daily | 00:00 UTC | Reset `pipelines_run_today`, concurrent |
| Monthly | 1st 00:00 UTC | Reset `pipelines_run_month` |
| Stale cleanup | Every 15 min | Fix stuck concurrent counts |

---

## Rate Limiting (Separate)

| Scope | Limit |
|-------|-------|
| Per-org | 100 req/min, 1000 req/hour |
| Global | 10,000 req/min |

---

## Frontend Warnings

| Usage | Level | Color |
|-------|-------|-------|
| 80% | Warning | Yellow |
| 90% | Critical | Orange |
| 100% | Exceeded | Red |

Component: `components/quota-warning-banner.tsx`

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
