# Cloud Run Jobs

> **MOVED:** All Cloud Run Jobs have been consolidated to `05-scheduler-jobs/`

## New Location

```bash
cd 05-scheduler-jobs

# Create all jobs
./scripts/create-all-jobs.sh prod

# Run jobs
./scripts/run-job.sh prod bootstrap
./scripts/run-job.sh prod org-sync-all

# List jobs
./scripts/list-jobs.sh prod
```

## Job Scripts in New Location

```
05-scheduler-jobs/
├── scripts/
│   ├── create-all-jobs.sh    # Create Cloud Run Jobs + Schedulers
│   ├── run-job.sh            # Execute a job manually
│   └── list-jobs.sh          # List jobs and executions
└── jobs/
    ├── bootstrap.py          # Initial system bootstrap
    ├── bootstrap_sync.py     # Sync bootstrap schema
    ├── org_sync_all.py       # Sync ALL org datasets
    ├── quota_reset_daily.py  # Daily quota reset
    ├── quota_reset_monthly.py # Monthly quota reset
    ├── stale_cleanup.py      # Stale concurrent cleanup
    └── quota_cleanup.py      # Old quota record cleanup
```

## Why Moved?

- Cleaner separation: Jobs are now a standalone service folder
- Python job scripts live alongside shell scripts
- Easier to maintain and deploy
- All job-related code in one place

---
**Migrated:** 2026-01-31
