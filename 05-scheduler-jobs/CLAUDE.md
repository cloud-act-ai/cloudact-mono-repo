# Scheduler Jobs Service

Cloud Run Jobs for CloudAct scheduled and manual operations.

## Overview

This service contains standalone Python scripts that run as Cloud Run Jobs. These are NOT part of the API or Pipeline services - they run independently on a schedule or manually.

## Job Categories

### Manual Jobs (Ad-Hoc)
| Job | Script | Purpose |
|-----|--------|---------|
| `bootstrap` | `jobs/bootstrap.py` | Initialize organizations dataset + 21 meta tables |
| `bootstrap-sync` | `jobs/bootstrap_sync.py` | Add new columns to existing meta tables |
| `org-sync-all` | `jobs/org_sync_all.py` | Sync ALL org datasets (loops through active orgs) |

### Scheduled Jobs
| Job | Script | Schedule | Purpose |
|-----|--------|----------|---------|
| `quota-reset-daily` | `jobs/quota_reset_daily.py` | 00:00 UTC | Reset daily pipeline counters |
| `quota-reset-monthly` | `jobs/quota_reset_monthly.py` | 00:05 1st | Reset monthly pipeline counters |
| `stale-cleanup` | `jobs/stale_cleanup.py` | */15 * * * * | Fix stuck concurrent counters |
| `quota-cleanup` | `jobs/quota_cleanup.py` | 01:00 UTC | Delete quota records >90 days |
| `billing-sync-retry` | `jobs/billing_sync.py retry` | */5 * * * * | Process pending billing syncs |
| `billing-sync-reconcile` | `jobs/billing_sync.py reconcile` | 02:00 UTC | Full Stripe→BigQuery reconciliation |

## Quick Start

```bash
# Create all jobs for an environment
./scripts/create-all-jobs.sh prod

# Run a specific job
./scripts/run-job.sh prod bootstrap
./scripts/run-job.sh prod org-sync-all

# List jobs
./scripts/list-jobs.sh prod
```

## How Jobs Work

### org-sync-all (Key Job)

This job loops through ALL active organizations in BigQuery:

```python
# Queries organizations.org_profiles for active orgs
query = """
    SELECT org_slug
    FROM `{project_id}.organizations.org_profiles`
    WHERE status = 'ACTIVE'
    ORDER BY org_slug
"""

# Loops through each org and syncs their dataset
for row in results:
    await sync_org_dataset(row.org_slug)
```

### Quota Reset Jobs

- **Daily**: Resets `current_daily_pipelines` to 0 at midnight UTC
- **Monthly**: Resets `current_monthly_pipelines` to 0 on 1st of month

### Stale Cleanup

Fixes stuck concurrent pipeline counters when pipelines crash mid-execution.

## Local Development

```bash
# Test a job locally
cd 05-scheduler-jobs
GCP_PROJECT_ID=cloudact-testing-1 python jobs/bootstrap.py

# With full environment
export GCP_PROJECT_ID=cloudact-testing-1
export ENVIRONMENT=test
python jobs/org_sync_all.py
```

## Deployment

Jobs are deployed as Cloud Run Jobs (not services). They:
- Run on-demand or via Cloud Scheduler
- Have no HTTP endpoints
- Use the API service Docker image (contains all code)
- Timeout after specified duration

### Create Jobs (First Time)

```bash
# Test environment
./scripts/create-all-jobs.sh test

# Production (requires confirmation)
./scripts/create-all-jobs.sh prod
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP Project ID |
| `ENVIRONMENT` | test, stage, prod |
| `CA_ROOT_API_KEY` | Root API key (from Secret Manager) |
| `DAYS_TO_KEEP` | Days of quota records to keep (default: 90) |

## File Structure

```
05-scheduler-jobs/
├── CLAUDE.md               # This file
├── scripts/
│   ├── create-all-jobs.sh  # Create Cloud Run Jobs + Schedulers
│   ├── run-job.sh          # Execute a job manually
│   └── list-jobs.sh        # List jobs and executions
└── jobs/
    ├── bootstrap.py        # Initial system bootstrap
    ├── bootstrap_sync.py   # Sync bootstrap schema
    ├── org_sync_all.py     # Sync all org datasets
    ├── quota_reset_daily.py    # Daily quota reset
    ├── quota_reset_monthly.py  # Monthly quota reset
    ├── stale_cleanup.py    # Stale concurrent cleanup
    ├── quota_cleanup.py    # Old quota record cleanup
    └── billing_sync.py     # Stripe→BigQuery billing sync
```

## GCP Project Mapping

| Environment | GCP Project |
|-------------|-------------|
| test, stage | cloudact-testing-1 |
| prod | cloudact-prod |

## Go-Live Checklist

Before go-live, run in order:

1. **Create all jobs** (once per environment):
   ```bash
   ./scripts/create-all-jobs.sh prod
   ```

2. **Run bootstrap** (if not already done):
   ```bash
   ./scripts/run-job.sh prod bootstrap
   ```

3. **Verify scheduled jobs are active**:
   ```bash
   ./scripts/list-jobs.sh prod
   ```

---
**v4.1.9** | 2026-01-31
