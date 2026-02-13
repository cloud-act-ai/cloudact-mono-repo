# Scheduler Jobs Service

Cloud Run Jobs for CloudAct scheduled and manual operations.

## Overview

This service contains standalone Python scripts that run as Cloud Run Jobs. These are NOT part of the API or Pipeline services - they run independently on a schedule or manually.

## Architecture: API-First Design (2026-02-01)

**All scheduler jobs call API endpoints** instead of direct database access:

| Job | API Endpoint | Method |
|-----|--------------|--------|
| `bootstrap.py` | `/api/v1/admin/bootstrap` | POST |
| `bootstrap_sync.py` | `/api/v1/admin/bootstrap/sync` | POST |
| `quota_reset_daily.py` | `/api/v1/admin/quota/reset-daily` | POST |
| `quota_reset_monthly.py` | `/api/v1/admin/quota/reset-monthly` | POST |
| `stale_cleanup.py` | `/api/v1/admin/quota/cleanup-stale` | POST |
| `quota_cleanup.py` | Direct BigQuery (maintenance job) | - |

**Benefits:**
- Single source of truth for business logic in API service
- Consistent quota handling with Supabase as limit source
- Better observability through API request/response logging
- Simpler job scripts - just HTTP calls with error handling

**Required Environment Variables:**
- `CA_ROOT_API_KEY` - Root API key for admin authentication
- `API_SERVICE_URL` - Auto-detected from project, or explicit override

## Self-Healing Concurrent Counters

Stale concurrent pipeline counters are now fixed automatically via **self-healing** in the API service:

```
Pipeline Request → cleanup_stale_concurrent_for_org(org_slug) → reserve_pipeline_quota_atomic()
```

**How it works:**
1. When an org requests a pipeline, stale counters for THAT org are cleaned up first
2. This adds ~50ms latency only when the counter is non-zero
3. Zero overhead for orgs with no running pipelines

**Daily stale cleanup job is now a SAFETY NET** (runs at 02:00 UTC):
- Catches edge cases: orgs that haven't run pipelines recently
- Much less frequent (daily vs every 15 min) due to self-healing

## Job Categories

### Manual Jobs (Run Before/After Releases)
| Cloud Run Job | Script | Purpose | When to Run |
|---------------|--------|---------|-------------|
| `cloudact-manual-supabase-migrate` | `jobs/manual/supabase_migrate.py` | Run Supabase DB migrations | BEFORE frontend deploy |
| `cloudact-manual-bootstrap` | `jobs/manual/bootstrap_smart.py` | Smart: fresh if new, sync if exists | AFTER API deploy |
| `cloudact-manual-org-sync-all` | `jobs/manual/org_sync_all.py` | Sync ALL org datasets | AFTER bootstrap |

> **Note:** `bootstrap` is now a smart job that auto-detects whether to run fresh bootstrap (creates dataset + 21 tables) or sync (adds new columns to existing tables). No need for separate bootstrap-sync job.

### Scheduled Jobs (Daily)
| Cloud Run Job | Script | Schedule | Purpose |
|---------------|--------|----------|---------|
| `cloudact-daily-quota-reset` | `jobs/daily/quota_reset_daily.py` | `0 0 * * *` | Reset daily pipeline quotas |
| `cloudact-daily-quota-cleanup` | `jobs/daily/quota_cleanup.py` | `0 1 * * *` | Delete quota records >90 days |
| `cloudact-daily-stale-cleanup` | `jobs/daily/stale_cleanup.py` | `0 2 * * *` | Fix stuck concurrent counters (safety net) |
| `cloudact-daily-alerts` | `jobs/daily/alerts_daily.py` | `0 8 * * *` | Process cost alerts for all orgs |

### Scheduled Jobs (Monthly)
| Cloud Run Job | Script | Schedule | Purpose |
|---------------|--------|----------|---------|
| `cloudact-monthly-quota-reset` | `jobs/monthly/quota_reset_monthly.py` | `5 0 1 * *` | Reset monthly pipeline quotas |

> **Note:** Billing sync jobs (5min-billing-sync-retry, daily-billing-reconcile) have been removed.
> Subscription data is now managed entirely in Supabase.

## Quick Start

```bash
cd 05-scheduler-jobs

# Create all jobs for an environment
./scripts/create-all-jobs.sh stage
./scripts/create-all-jobs.sh prod

# Run a specific job (shortcuts supported)
./scripts/run-job.sh stage bootstrap         # → cloudact-manual-bootstrap
./scripts/run-job.sh stage org-sync-all      # → cloudact-manual-org-sync-all
./scripts/run-job.sh stage stale-cleanup     # → cloudact-daily-stale-cleanup

# Or use full names
./scripts/run-job.sh stage manual-bootstrap
./scripts/run-job.sh stage daily-stale-cleanup

# List jobs and schedulers
./scripts/list-jobs.sh stage
```

## Release Workflow

Run these jobs in order after each release:

```bash
# 1. BEFORE frontend deploy - Run Supabase migrations
./scripts/run-job.sh prod migrate

# 2. AFTER API deploy - Smart bootstrap (fresh if new, sync if exists)
./scripts/run-job.sh prod bootstrap

# 3. AFTER bootstrap - Sync all org datasets
./scripts/run-job.sh prod org-sync-all
```

## File Structure

```
05-scheduler-jobs/
├── CLAUDE.md                     # This file
├── Dockerfile                    # Docker image for jobs
├── cloudbuild-jobs.yaml          # Cloud Build config
├── scripts/
│   ├── create-all-jobs.sh        # Create Cloud Run Jobs + Schedulers
│   ├── run-job.sh                # Execute a job manually
│   └── list-jobs.sh              # List jobs and executions
└── jobs/
    ├── manual/                   # Manual (ad-hoc) jobs
    │   ├── bootstrap_smart.py    # Smart bootstrap (fresh or sync)
    │   ├── org_sync_all.py       # Sync all org datasets
    │   └── supabase_migrate.py   # Supabase DB migrations
    ├── daily/                    # Daily jobs
    │   ├── quota_reset_daily.py  # Reset daily quotas (00:00 UTC)
    │   ├── quota_cleanup.py      # Cleanup old quota records (01:00 UTC)
    │   ├── stale_cleanup.py      # Fix stuck concurrent counters (02:00 UTC) - safety net
    │   └── alerts_daily.py       # Process cost alerts (08:00 UTC)
    └── monthly/                  # Monthly jobs
        └── quota_reset_monthly.py # Reset monthly quotas (00:05 UTC 1st)
```

## GCP Project Mapping

| Environment | GCP Project | Secrets Suffix |
|-------------|-------------|----------------|
| test, stage | cloudact-testing-1 | `-test` (except supabase: `-stage`) |
| prod | cloudact-prod | `-prod` |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GCP_PROJECT_ID` | Yes | GCP Project ID |
| `CA_ROOT_API_KEY` | Yes | Root API key (from Secret Manager) |
| `API_SERVICE_URL` | No | API service URL (auto-detected from project if not set) |
| `ENVIRONMENT` | No | `staging` or `production` (Pydantic validated) |
| `SUPABASE_ACCESS_TOKEN` | For migrations | Supabase Management API token |

**API URL Auto-Detection:**
- `cloudact-prod` → `https://api.cloudact.ai`
- `cloudact-testing-1` → Test/Stage Cloud Run URL

## Job Shortcuts (run-job.sh)

| Shortcut | Full Job Name | Notes |
|----------|---------------|-------|
| `migrate` | `cloudact-manual-supabase-migrate` | Run BEFORE frontend deploy |
| `bootstrap` | `cloudact-manual-bootstrap` | Smart: fresh if new, sync if exists |
| `bootstrap-sync` | `cloudact-manual-bootstrap` | Alias → same smart bootstrap |
| `org-sync-all` | `cloudact-manual-org-sync-all` | Run AFTER bootstrap |
| `stale-cleanup` | `cloudact-daily-stale-cleanup` | 02:00 UTC (safety net) |
| `quota-reset` | `cloudact-daily-quota-reset` | 00:00 UTC |
| `quota-cleanup` | `cloudact-daily-quota-cleanup` | 01:00 UTC |
| `alerts` | `cloudact-daily-alerts` | 08:00 UTC |
| `quota-monthly` | `cloudact-monthly-quota-reset` | 00:05 UTC on 1st |

## Go-Live Checklist

```bash
# 1. Build and push jobs image
gcloud builds submit --config=05-scheduler-jobs/cloudbuild-jobs.yaml \
    --substitutions=_ENV=prod --project=cloudact-prod .

# 2. Create all jobs + schedulers
./scripts/create-all-jobs.sh prod

# 3. Run manual jobs in order
./scripts/run-job.sh prod bootstrap
./scripts/run-job.sh prod bootstrap-sync
./scripts/run-job.sh prod org-sync-all

# 4. Verify schedulers are active
./scripts/list-jobs.sh prod
```

---

## OpenClaw Context for Jobs

Jobs are executed as part of **OpenClaw** operations. When running jobs, the context includes:

### Identity Reference
```
~/.openclaw/workspace/
├── IDENTITY.md      # Who: OpenClaw agent
├── SOUL.md          # Values & philosophy
├── MEMORY.md        # Long-term memory (Rama, CloudAct, lessons)
├── USER.md          # Rama Surasani (human operator)
├── CONTEXT.md       # Documentation index
└── AGENTS.md        # Workspace rules
```

### Job Execution Context

| Job | OpenClaw Context |
|-----|------------------|
| `bootstrap` | "OpenClaw initializing CloudAct BigQuery infrastructure" |
| `org-sync-all` | "OpenClaw syncing all organization datasets" |
| `migrate` | "OpenClaw running Supabase schema migrations" |
| `quota-reset-*` | "OpenClaw maintaining quota system health" |
| `stale-cleanup` | "OpenClaw self-healing concurrent counters" |
| `alerts-daily` | "OpenClaw processing cost alerts for all orgs" |

### Pre-Job Context Check (Recommended)

Before running manual jobs, verify context is available:
```bash
# Check OpenClaw identity exists
ls ~/.openclaw/workspace/IDENTITY.md

# Check CloudAct context exists
ls ~/.openclaw/workspace/CONTEXT.md
```

### Access Restrictions

**DO NOT access:**
- `/Users/gurukallam/` - Off-limits (user privacy boundary)

---
**v4.3.0** | 2026-02-04 (OpenClaw Context Integration)
