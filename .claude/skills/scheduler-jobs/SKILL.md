---
name: scheduler-jobs
description: |
  Cloud Run Jobs lifecycle for CloudAct. Create, trigger, monitor, and debug scheduler jobs.
  Use when: running bootstrap, migrations, org-sync, quota resets, stale cleanup, alerts processing,
  creating Cloud Run Jobs, checking job status, debugging job failures, or managing scheduled operations.
---

# /scheduler-jobs - Cloud Run Jobs Management

Manage ALL scheduled and manual Cloud Run Jobs: bootstrap, migrations, org-sync, quota resets, stale cleanup, daily alerts.

## Trigger

```
/scheduler-jobs                          # List all jobs + status
/scheduler-jobs run <env> <job>          # Run a job (e.g., /scheduler-jobs run stage bootstrap)
/scheduler-jobs create <env>             # Create all jobs + schedulers
/scheduler-jobs status <env>             # Check execution history
/scheduler-jobs logs <env> <job>         # View job logs
```

## Architecture

```
Cloud Run Jobs (05-scheduler-jobs/)
├─ Manual Jobs (run before/after releases)
│   ├─ bootstrap         POST /admin/bootstrap (API-first)
│   ├─ org-sync-all      POST /admin/org-sync-all
│   └─ migrate           Supabase Management API
├─ Daily Jobs (Cloud Scheduler)
│   ├─ quota-reset       POST /admin/quota/reset-daily      00:00 UTC
│   ├─ quota-cleanup     Direct BigQuery (maintenance)       01:00 UTC
│   ├─ stale-cleanup     POST /admin/quota/cleanup-stale     02:00 UTC (safety net)
│   └─ alerts            POST /admin/alerts/process-all      08:00 UTC (cost + budget alerts)
└─ Monthly Jobs (Cloud Scheduler)
    └─ quota-monthly     POST /admin/quota/reset-monthly     00:05 UTC 1st

Design: API-First — Jobs call API endpoints (NOT direct DB access)
Exception: quota-cleanup (direct BQ for maintenance), migrate (Supabase Management API)
```

## Environments

| Environment | GCP Project | API URL | Credential File |
|-------------|-------------|---------|-----------------|
| test/stage | cloudact-testing-1 | Cloud Run auto-detect | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` |
| prod | cloudact-prod | `https://api.cloudact.ai` | `/Users/openclaw/.gcp/cloudact-prod.json` |

**CRITICAL:** Use ABSOLUTE paths for credentials. `~/` does NOT expand in gcloud.

```bash
# Stage
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json

# Prod
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json
```

## Key Locations

| Type | Path |
|------|------|
| Job Scripts | `05-scheduler-jobs/jobs/{manual,daily,monthly}/*.py` |
| CLI Scripts | `05-scheduler-jobs/scripts/{run-job,create-all-jobs,list-jobs}.sh` |
| Dockerfile | `05-scheduler-jobs/Dockerfile` |
| Cloud Build | `05-scheduler-jobs/cloudbuild-jobs.yaml` |
| Service Doc | `05-scheduler-jobs/CLAUDE.md` |

## Job Inventory (8 Jobs)

### Manual Jobs (Release Workflow)

| # | Shortcut | Full Job Name | Script | API Endpoint | When |
|---|----------|---------------|--------|--------------|------|
| 1 | `migrate` | `cloudact-manual-supabase-migrate` | `jobs/manual/supabase_migrate.py` | Supabase Management API | BEFORE frontend deploy |
| 2 | `bootstrap` | `cloudact-manual-bootstrap` | `jobs/manual/bootstrap_smart.py` | `POST /admin/bootstrap` | AFTER API deploy |
| 3 | `org-sync-all` | `cloudact-manual-org-sync-all` | `jobs/manual/org_sync_all.py` | `POST /admin/org-sync-all` | AFTER bootstrap |

### Scheduled Jobs (Daily)

| # | Shortcut | Full Job Name | Script | Schedule | API Endpoint |
|---|----------|---------------|--------|----------|--------------|
| 4 | `quota-reset` | `cloudact-daily-quota-reset` | `jobs/daily/quota_reset_daily.py` | `0 0 * * *` | `POST /admin/quota/reset-daily` |
| 5 | `quota-cleanup` | `cloudact-daily-quota-cleanup` | `jobs/daily/quota_cleanup.py` | `0 1 * * *` | Direct BigQuery |
| 6 | `stale-cleanup` | `cloudact-daily-stale-cleanup` | `jobs/daily/stale_cleanup.py` | `0 2 * * *` | `POST /admin/quota/cleanup-stale` |
| 7 | `alerts` | `cloudact-daily-alerts` | `jobs/daily/alerts_daily.py` | `0 8 * * *` | `POST /admin/alerts/process-all` |

### Scheduled Jobs (Monthly)

| # | Shortcut | Full Job Name | Script | Schedule | API Endpoint |
|---|----------|---------------|--------|----------|--------------|
| 8 | `quota-monthly` | `cloudact-monthly-quota-reset` | `jobs/monthly/quota_reset_monthly.py` | `5 0 1 * *` | `POST /admin/quota/reset-monthly` |

## Procedures

### Release Workflow (MUST follow order)

```bash
cd 05-scheduler-jobs/scripts

# Step 1: Activate credentials for target environment
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json  # stage
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json                    # prod

# Step 2: Migrations FIRST (BEFORE frontend deploy)
./run-job.sh stage migrate
echo "yes" | ./run-job.sh prod migrate    # prod requires confirmation

# Step 3: Bootstrap SECOND (AFTER API deploy)
./run-job.sh stage bootstrap
echo "yes" | ./run-job.sh prod bootstrap

# Step 4: Org Sync THIRD (AFTER bootstrap)
./run-job.sh stage org-sync-all
echo "yes" | ./run-job.sh prod org-sync-all
```

**Order matters:** migrate → bootstrap → org-sync-all. Running out of order may fail.

### First-Time Setup (Create All Jobs)

```bash
cd 05-scheduler-jobs/scripts

# Build and push Docker image
gcloud builds submit --config=05-scheduler-jobs/cloudbuild-jobs.yaml \
    --substitutions=_ENV=prod --project=cloudact-prod .

# Create all Cloud Run Jobs + Cloud Scheduler triggers
./create-all-jobs.sh stage
echo "yes" | ./create-all-jobs.sh prod

# Verify
./list-jobs.sh stage
./list-jobs.sh prod
```

### Run Any Job Manually

```bash
cd 05-scheduler-jobs/scripts

# Using shortcuts
./run-job.sh stage bootstrap
./run-job.sh stage quota-reset
./run-job.sh stage alerts
./run-job.sh stage stale-cleanup

# Using full names
./run-job.sh stage manual-bootstrap
./run-job.sh stage daily-quota-reset
./run-job.sh stage monthly-quota-reset
```

### Check Job Status

```bash
cd 05-scheduler-jobs/scripts

# List all jobs with last execution status
./list-jobs.sh stage

# Check specific job execution
gcloud run jobs executions list --job=cloudact-manual-bootstrap --region=us-central1 --project=cloudact-testing-1 --limit=5

# View logs for latest execution
gcloud run jobs executions logs cloudact-manual-bootstrap --region=us-central1 --project=cloudact-testing-1
```

## Environment Variables

| Variable | Required | Description | Source |
|----------|----------|-------------|--------|
| `CA_ROOT_API_KEY` | Yes | Root API key for admin auth | GCP Secret Manager |
| `API_SERVICE_URL` | No | API URL (auto-detected from project) | Auto or manual |
| `GCP_PROJECT_ID` | Yes | GCP project ID | Cloud Run env |
| `ENVIRONMENT` | No | `staging` or `production` | Cloud Run env |
| `SUPABASE_ACCESS_TOKEN` | For migrate | Supabase Management API token | GCP Secret Manager |

**Auto-detection:** `cloudact-prod` → `https://api.cloudact.ai`, else Cloud Run URL.

## Self-Healing Concurrent Counters

Stale concurrent pipeline counters are fixed automatically:

```
Pipeline Request → cleanup_stale_concurrent_for_org(org_slug) → reserve_pipeline_quota_atomic()
```

- **Self-healing**: Runs on every pipeline request for that org (~50ms when counter > 0)
- **Daily safety net**: `stale-cleanup` job at 02:00 UTC catches edge cases
- **Old approach (removed)**: 15-min cleanup cron (unnecessary with self-healing)

## Testing

### Verify Jobs Exist

```bash
cd 05-scheduler-jobs/scripts

# List all jobs
./list-jobs.sh stage
# Expected: 8 jobs (3 manual + 4 daily + 1 monthly)

# Verify schedulers
gcloud scheduler jobs list --location=us-central1 --project=cloudact-testing-1
# Expected: 5 schedulers (quota-reset, quota-cleanup, stale-cleanup, alerts, quota-monthly)
```

### Test Manual Jobs (Stage)

```bash
cd 05-scheduler-jobs/scripts

# 1. Test bootstrap
./run-job.sh stage bootstrap
# Expected: "Bootstrap completed: 21+ tables synced"

# 2. Test org-sync
./run-job.sh stage org-sync-all
# Expected: "Synced N org datasets"

# 3. Test migrate (non-destructive — skips applied migrations)
./run-job.sh stage migrate
# Expected: "N migrations already applied, 0 new"
```

### Test Scheduled Jobs (Stage)

```bash
cd 05-scheduler-jobs/scripts

# 1. Quota reset (safe to run anytime — resets to 0)
./run-job.sh stage quota-reset
# Expected: "Daily quota reset complete for N orgs"

# 2. Stale cleanup (safe — only fixes stuck counters)
./run-job.sh stage stale-cleanup
# Expected: "Cleaned up N stale concurrent counters"

# 3. Alerts (safe — processes pending alerts)
./run-job.sh stage alerts
# Expected: "Processed alerts for N orgs"
```

### Validate After Release

```bash
# After running release workflow (migrate → bootstrap → org-sync-all):

# 1. Check API health
curl -s https://api.cloudact.ai/health | python3 -m json.tool

# 2. Check bootstrap status
curl -s -X POST https://api.cloudact.ai/api/v1/admin/bootstrap/status \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# 3. Check org dataset count
bq ls --project_id=cloudact-prod | grep -c "_prod$"
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `run-job.sh` says "invalid env" | Used `local` (not supported) | Use `test`, `stage`, or `prod` |
| Job fails with auth error | Wrong credentials activated | Run `gcloud auth activate-service-account` with correct key file |
| Bootstrap creates 0 tables | API service not deployed yet | Deploy API first, then run bootstrap |
| Org-sync fails | Bootstrap not run | Run bootstrap first, then org-sync |
| `~/.gcp/` path not found | Tilde doesn't expand in gcloud | Use absolute path: `/Users/openclaw/.gcp/...` |
| Prod job runs without confirmation | Piped `echo "yes"` | Expected behavior for scripted runs |
| Migrate fails: "token invalid" | Wrong SUPABASE_ACCESS_TOKEN | Check token in GCP Secret Manager |
| Quota reset does nothing | No orgs in Supabase | Run bootstrap + onboard an org first |
| Alerts job: "0 orgs processed" | No alert rules configured | Create alerts via `/cost-alerts` API |
| Job image outdated | Docker image not rebuilt | Run `gcloud builds submit` with cloudbuild-jobs.yaml |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/bootstrap-onboard` | Bootstrap job creates meta tables. Skill covers BigQuery schema details. |
| `/supabase-migrate` | Migrate job runs Supabase migrations. Skill covers migration file format. |
| `/quota-mgmt` | Quota reset/cleanup jobs maintain quota system. Skill covers quota enforcement. |
| `/infra-cicd` | Cloud Build deploys job images. Skill covers deployment pipeline. |
| `/deploy-check` | Health checks after job execution. Skill covers Cloud Run monitoring. |

## Source Specifications

Requirements consolidated from:
- `05-scheduler-jobs/CLAUDE.md` - Scheduler jobs architecture and operations
