# Scheduler Jobs Service

Cloud Run Jobs for CloudAct scheduled and manual operations.

## Overview

This service contains standalone Python scripts that run as Cloud Run Jobs. These are NOT part of the API or Pipeline services - they run independently on a schedule or manually.

## Job Categories

### Manual Jobs (Run Before/After Releases)
| Cloud Run Job | Script | Purpose | When to Run |
|---------------|--------|---------|-------------|
| `cloudact-manual-supabase-migrate` | `jobs/manual/supabase_migrate.py` | Run Supabase DB migrations | BEFORE frontend deploy |
| `cloudact-manual-bootstrap` | `jobs/manual/bootstrap.py` | Initialize 21 meta tables | One-time setup |
| `cloudact-manual-bootstrap-sync` | `jobs/manual/bootstrap_sync.py` | Add new columns to meta tables | AFTER API deploy |
| `cloudact-manual-org-sync-all` | `jobs/manual/org_sync_all.py` | Sync ALL org datasets | AFTER bootstrap-sync |

### Scheduled Jobs (Every 5 Minutes)
| Cloud Run Job | Script | Schedule | Purpose |
|---------------|--------|----------|---------|
| `cloudact-5min-billing-sync-retry` | `jobs/every_5min/billing_sync_retry.py` | `*/5 * * * *` | Process pending billing syncs |

### Scheduled Jobs (Every 15 Minutes)
| Cloud Run Job | Script | Schedule | Purpose |
|---------------|--------|----------|---------|
| `cloudact-15min-stale-cleanup` | `jobs/every_15min/stale_cleanup.py` | `*/15 * * * *` | Fix stuck concurrent counters |

### Scheduled Jobs (Daily)
| Cloud Run Job | Script | Schedule | Purpose |
|---------------|--------|----------|---------|
| `cloudact-daily-quota-reset` | `jobs/daily/quota_reset_daily.py` | `0 0 * * *` | Reset daily pipeline quotas |
| `cloudact-daily-quota-cleanup` | `jobs/daily/quota_cleanup.py` | `0 1 * * *` | Delete quota records >90 days |
| `cloudact-daily-billing-reconcile` | `jobs/daily/billing_sync_reconcile.py` | `0 2 * * *` | Full Stripe→BigQuery reconciliation |

### Scheduled Jobs (Monthly)
| Cloud Run Job | Script | Schedule | Purpose |
|---------------|--------|----------|---------|
| `cloudact-monthly-quota-reset` | `jobs/monthly/quota_reset_monthly.py` | `5 0 1 * *` | Reset monthly pipeline quotas |

## Quick Start

```bash
cd 05-scheduler-jobs

# Create all jobs for an environment
./scripts/create-all-jobs.sh stage
./scripts/create-all-jobs.sh prod

# Run a specific job (shortcuts supported)
./scripts/run-job.sh stage bootstrap         # → cloudact-manual-bootstrap
./scripts/run-job.sh stage org-sync-all      # → cloudact-manual-org-sync-all
./scripts/run-job.sh stage stale-cleanup     # → cloudact-15min-stale-cleanup

# Or use full names
./scripts/run-job.sh stage manual-bootstrap
./scripts/run-job.sh stage 5min-billing-sync-retry

# List jobs and schedulers
./scripts/list-jobs.sh stage
```

## Release Workflow

Run these jobs in order after each release:

```bash
# 1. BEFORE frontend deploy - Run Supabase migrations
./scripts/run-job.sh prod manual-supabase-migrate

# 2. AFTER API deploy - Sync new schema columns
./scripts/run-job.sh prod manual-bootstrap-sync

# 3. AFTER bootstrap-sync - Sync all org datasets
./scripts/run-job.sh prod manual-org-sync-all
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
    │   ├── bootstrap.py          # Initial system bootstrap
    │   ├── bootstrap_sync.py     # Sync bootstrap schema
    │   ├── org_sync_all.py       # Sync all org datasets
    │   └── supabase_migrate.py   # Supabase DB migrations
    ├── every_5min/               # 5-minute interval jobs
    │   └── billing_sync_retry.py # Process billing sync queue
    ├── every_15min/              # 15-minute interval jobs
    │   └── stale_cleanup.py      # Fix stuck concurrent counters
    ├── daily/                    # Daily jobs
    │   ├── quota_reset_daily.py  # Reset daily quotas (00:00 UTC)
    │   ├── quota_cleanup.py      # Cleanup old quota records (01:00 UTC)
    │   └── billing_sync_reconcile.py  # Full billing reconciliation (02:00 UTC)
    └── monthly/                  # Monthly jobs
        └── quota_reset_monthly.py # Reset monthly quotas (00:05 UTC 1st)
```

## GCP Project Mapping

| Environment | GCP Project | Secrets Suffix |
|-------------|-------------|----------------|
| test, stage | cloudact-testing-1 | `-test` (except supabase: `-stage`) |
| prod | cloudact-prod | `-prod` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP Project ID |
| `ENVIRONMENT` | `staging` or `production` (Pydantic validated) |
| `CA_ROOT_API_KEY` | Root API key (from Secret Manager) |
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API token (for migrations) |

## Job Shortcuts (run-job.sh)

| Shortcut | Full Job Name |
|----------|---------------|
| `bootstrap` | `cloudact-manual-bootstrap` |
| `bootstrap-sync` | `cloudact-manual-bootstrap-sync` |
| `org-sync-all` | `cloudact-manual-org-sync-all` |
| `migrate` | `cloudact-manual-supabase-migrate` |
| `stale-cleanup` | `cloudact-15min-stale-cleanup` |
| `quota-reset` | `cloudact-daily-quota-reset` |
| `quota-cleanup` | `cloudact-daily-quota-cleanup` |
| `billing-retry` | `cloudact-5min-billing-sync-retry` |
| `reconcile` | `cloudact-daily-billing-reconcile` |
| `quota-monthly` | `cloudact-monthly-quota-reset` |

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

## Known Issues

- **Billing sync jobs**: Require frontend endpoint `/api/cron/billing-sync` which doesn't exist yet
- **Schedulers paused**: `cloudact-5min-billing-sync-retry-trigger` and `cloudact-daily-billing-reconcile-trigger` are paused until frontend endpoint is deployed

---
**v4.2.0** | 2026-02-01
