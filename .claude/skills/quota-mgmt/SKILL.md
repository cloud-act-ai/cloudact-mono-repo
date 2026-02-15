---
name: quota-mgmt
description: |
  Quota management for CloudAct. Pipeline usage limits, enforcement, tracking, and alerts.
  Use when: configuring quotas, checking usage limits, enforcing quotas, understanding quota system,
  debugging quota issues, or investigating concurrent pipeline limits.
---

# Quota Management

## Overview

CloudAct enforces usage quotas per organization for pipeline runs, concurrent pipelines, provider integrations, and team seats. Quotas are tied to subscription plans (Starter/Professional/Scale).

**Architecture: Dual-System Tracking**

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  Supabase (Source of Truth)  │     │  BigQuery (Historical)        │
│                               │     │                                │
│  organizations (LIMITS)       │     │  org_usage_quotas (TRACKING)   │
│  ├─ pipelines_per_day_limit   │     │  ├─ pipelines_run_today        │
│  ├─ pipelines_per_month_limit │     │  ├─ pipelines_run_month        │
│  ├─ concurrent_pipelines_limit│     │  ├─ concurrent_pipelines_running│
│  ├─ seat_limit                │     │  ├─ usage_date                 │
│  └─ providers_limit           │     │  └─ org_slug                   │
│                               │     │                                │
│  org_quotas (DAILY TRACKING)  │     └──────────────────────────────┘
│  ├─ pipelines_run_today       │
│  ├─ pipelines_run_month       │
│  └─ concurrent_running        │
└─────────────────────────────┘
```

> **KNOWN ISSUE:** Dual tracking (Supabase + BigQuery) can cause counter drift. The pipeline service decrements concurrent counters in Supabase, while the API service tracks in BigQuery. Self-healing cleans up stale counters, but the dual-system design is a known architectural debt.

## Subscription Plan Limits

| Plan | Daily Pipelines | Monthly Pipelines | Concurrent | Seats | Providers | Price |
|------|----------------|-------------------|------------|-------|-----------|-------|
| Starter | 6 | 180 | 1 | 2 | 3 | $19/mo |
| Professional | 25 | 750 | 2 | 6 | 6 | $69/mo |
| Scale | 100 | 3,000 | 5 | 11 | 10 | $199/mo |

**Source:** `02-api-service/src/app/models/org_models.py` → `SUBSCRIPTION_LIMITS`

## Environments

| Env | GCP Project | Supabase Project | API URL |
|-----|-------------|-----------------|---------|
| local/test/stage | cloudact-testing-1 | `kwroaccbrxppfiysqlzs` | `http://localhost:8000` |
| prod | cloudact-prod | `ovfxswhkkshouhsryzaf` | `https://api.cloudact.ai` |

## Key Locations

| File | Purpose |
|------|---------|
| `02-api-service/src/app/models/org_models.py` | `SUBSCRIPTION_LIMITS` dictionary (plan quotas) |
| `02-api-service/src/app/dependencies/auth.py` | `reserve_pipeline_quota_atomic()`, `validate_quota()`, self-healing |
| `02-api-service/src/app/routers/organizations.py` | `/api/v1/organizations/{org}/quota` endpoint |
| `02-api-service/src/app/routers/admin.py` | Quota reset endpoints (daily, monthly, stale cleanup) |
| `01-fronted-system/actions/quota.ts` | `getQuotaUsage(orgSlug)` server action |
| `01-fronted-system/components/quota-warning-banner.tsx` | Warning banner (80%/90%/100%) |
| `01-fronted-system/app/[orgSlug]/settings/quota-usage/` | Quota usage page |
| `05-scheduler-jobs/src/quota_reset_daily.py` | Daily reset Cloud Run Job |
| `05-scheduler-jobs/src/quota_reset_monthly.py` | Monthly reset Cloud Run Job |
| `05-scheduler-jobs/src/stale_cleanup.py` | Stale concurrent counter cleanup |

## Quota Enforcement Flow

```
Pipeline Request
    │
    ▼
reserve_pipeline_quota_atomic(org_slug)     ← API Service (auth.py)
    │
    ├─ 1. Fetch limits from Supabase `organizations`
    ├─ 2. Fetch/create today's usage from BigQuery `org_usage_quotas`
    ├─ 3. Self-heal stale concurrent counters (>30 min RUNNING)
    ├─ 4. Check: daily_used < daily_limit?
    ├─ 5. Check: monthly_used < monthly_limit?
    ├─ 6. Check: concurrent_running < concurrent_limit?
    ├─ 7. Atomic increment all counters
    └─ 8. Return validation result
    │
    ▼ (on pipeline complete)
report_pipeline_completion()                ← Pipeline Service → API Service
    │
    ├─ Decrement concurrent counter in BigQuery
    └─ Update pipeline status to COMPLETED/FAILED
```

### Self-Healing Mechanism

When quota validation runs, it also checks for stale pipelines:
- Queries `org_meta_pipeline_runs` for pipelines with status `RUNNING` started >30 minutes ago
- Marks them as `FAILED`
- Decrements the concurrent counter for each

This prevents stuck counters from permanently blocking pipeline execution.

## Supabase RPC Functions (service_role only)

| Function | Purpose |
|----------|---------|
| `check_quota_available(org_id)` | Check if org can run pipelines |
| `increment_pipeline_count(org_id)` | Atomic increment on pipeline start |
| `decrement_concurrent(org_id, succeeded)` | Decrement on pipeline complete |
| `get_or_create_quota(org_id)` | Get/create today's quota record |

## Quota Warning Banner

**Component:** `components/quota-warning-banner.tsx`

| Usage | Level | Color |
|-------|-------|-------|
| 80% | Warning | Yellow |
| 90% | Critical | Orange |
| 100% | Exceeded | Red |

## API Endpoints

```bash
# Check quota status
GET /api/v1/organizations/{org}/quota
  Header: X-API-Key

# Admin: Reset daily quotas (all orgs)
POST /api/v1/admin/quota/reset-daily
  Header: X-CA-Root-Key

# Admin: Reset monthly quotas (all orgs)
POST /api/v1/admin/quota/reset-monthly
  Header: X-CA-Root-Key

# Admin: Cleanup stale concurrent counters
POST /api/v1/admin/quota/cleanup-stale
  Header: X-CA-Root-Key
```

## Scheduler Jobs

```bash
cd 05-scheduler-jobs/scripts

# Daily quota reset (00:00 UTC)
./run-job.sh stage quota-reset-daily
echo "yes" | ./run-job.sh prod quota-reset-daily

# Monthly quota reset (00:05 UTC 1st)
./run-job.sh stage quota-reset-monthly
echo "yes" | ./run-job.sh prod quota-reset-monthly

# Stale cleanup (02:00 UTC daily - safety net)
./run-job.sh stage stale-cleanup
echo "yes" | ./run-job.sh prod stale-cleanup

# Quota cleanup >90 days (01:00 UTC daily)
./run-job.sh stage quota-cleanup
echo "yes" | ./run-job.sh prod quota-cleanup
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 429 Too Many Requests | Quota exceeded — wait for reset or upgrade plan |
| Concurrent counter stuck | Run stale-cleanup job or wait for self-healing on next request |
| Monthly counter reset mid-month | Known issue: new daily records start `pipelines_run_month=0` — carry-forward fix pending |
| Quota shows 0 but pipelines blocked | Check both Supabase `org_quotas` AND BigQuery `org_usage_quotas` — they may be out of sync |
| Wrong plan limits applied | Check `SUBSCRIPTION_LIMITS` in `org_models.py` matches CLAUDE.md |
| Supabase failure during validation | Falls back to STARTER/ACTIVE — check Supabase health |

## Known Architectural Issues

1. **Dual-system drift**: BigQuery and Supabase counters can diverge. Pipeline service decrements Supabase, API service tracks BigQuery.
2. **Double-decrement risk**: Both the pipeline executor AND scheduler can decrement concurrent counters for the same pipeline.
3. **Monthly counter reset**: Creating a new daily record resets `pipelines_run_month` to 0 instead of carrying forward.
4. **Self-healing window**: 30-minute timeout may be too aggressive for multi-step pipelines with retries.

## 5 Implementation Pillars

| Pillar | How Quota Mgmt Handles It |
|--------|-------------------------------|
| **i18n** | Quota limits are numeric (plan-tier based), not locale-dependent; quota warning messages should use org locale for formatting |
| **Enterprise** | Dual-system tracking (Supabase enforcement + BigQuery historical); self-healing stale counters; automated daily/monthly resets via scheduler jobs |
| **Cross-Service** | Quotas enforced in API (8000) middleware; consumed by Pipeline (8001) runs; tracked in Supabase `org_quotas` + BigQuery `org_usage_quotas`; alerts via notifications |
| **Multi-Tenancy** | Every quota operation scoped by `org_slug`; per-org plan limits in `organizations` table; concurrent counter isolation prevents cross-org interference |
| **Reusability** | Shared `check_quota()` / `increment_quota()` patterns; `QuotaEnforcer` middleware; quota reset logic shared between daily and monthly jobs |

## Related Skills

- `bootstrap-onboard` — Initial quota setup during org onboarding
- `scheduler-jobs` — Quota reset and cleanup jobs
- `pipeline-ops` — Pipeline execution that consumes quotas
- `stripe-billing` — Plan changes that update quota limits
- `notifications` — Quota alert thresholds
- `security-audit` — Quota bypass prevention
