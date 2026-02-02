# Cron Jobs

Scheduled tasks for CloudAct. Run manually or via cron/Cloud Scheduler.

> **Note:** Billing sync jobs (billing-sync-retry.sh, billing-reconciliation.sh, billing-sync-stats.sh)
> have been removed. Subscription data is now managed entirely in Supabase.

## Scripts

| Script | Purpose | Schedule |
|--------|---------|----------|
| `run-all-cleanup.sh` | Database cleanup (rate limits, tokens, etc.) | Daily at 3 AM UTC |

## Quota Reset Jobs (Pipeline Service)

**CRITICAL:** These Cloud Scheduler jobs must be configured for quota management to work correctly.

| Job | Endpoint | Schedule | Purpose |
|-----|----------|----------|---------|
| `quota-daily-reset` | `/api/v1/scheduler/reset-daily-quotas` | `0 0 * * *` (00:00 UTC daily) | Reset daily quota counters |
| `quota-monthly-reset` | `/api/v1/scheduler/reset-monthly-quotas` | `5 0 1 * *` (00:05 UTC on 1st) | Reset monthly quota counters |
| `quota-stale-cleanup` | `/api/v1/scheduler/reset-stale-concurrent` | `*/15 * * * *` (every 15 min) | Fix stale concurrent counters |
| `orphaned-pipeline-cleanup` | `/api/v1/scheduler/cleanup-orphaned-pipelines` | `0 * * * *` (every hour) | Mark stuck pipelines as FAILED |

## Setup

### 1. Set Environment Variables

```bash
# Required for cleanup script
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### 2. Make Scripts Executable

```bash
chmod +x 04-inra-cicd-automation/cron-jobs/*.sh
```

### 3. Schedule via Cron

```bash
# Edit crontab
crontab -e

# Add entries (adjust paths):
0 3 * * * /path/to/04-inra-cicd-automation/cron-jobs/run-all-cleanup.sh >> /var/log/cleanup.log 2>&1
```

### 4. Or Use Cloud Scheduler (GCP) for Quota Jobs

```bash
# ============================================
# Quota Management Jobs (Pipeline Service)
# ============================================

export PIPELINE_URL="${PIPELINE_URL:-https://pipeline.cloudact.ai}"
export CA_ROOT_API_KEY="${CA_ROOT_API_KEY}"  # From Secret Manager

# Daily quota reset (00:00 UTC daily)
gcloud scheduler jobs create http quota-daily-reset \
  --schedule="0 0 * * *" \
  --uri="${PIPELINE_URL}/api/v1/scheduler/reset-daily-quotas" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-CA-Root-Key=${CA_ROOT_API_KEY}" \
  --time-zone="UTC" \
  --attempt-deadline=300s \
  --location=us-central1

# Monthly quota reset (00:05 UTC on 1st of month - after daily reset)
gcloud scheduler jobs create http quota-monthly-reset \
  --schedule="5 0 1 * *" \
  --uri="${PIPELINE_URL}/api/v1/scheduler/reset-monthly-quotas" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-CA-Root-Key=${CA_ROOT_API_KEY}" \
  --time-zone="UTC" \
  --attempt-deadline=60s \
  --location=us-central1

# Stale concurrent counter cleanup (every 15 minutes)
gcloud scheduler jobs create http quota-stale-cleanup \
  --schedule="*/15 * * * *" \
  --uri="${PIPELINE_URL}/api/v1/scheduler/reset-stale-concurrent" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-CA-Root-Key=${CA_ROOT_API_KEY}" \
  --time-zone="UTC" \
  --attempt-deadline=120s \
  --location=us-central1

# Orphaned pipeline cleanup (hourly)
gcloud scheduler jobs create http orphaned-pipeline-cleanup \
  --schedule="0 * * * *" \
  --uri="${PIPELINE_URL}/api/v1/scheduler/cleanup-orphaned-pipelines" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-CA-Root-Key=${CA_ROOT_API_KEY}" \
  --time-zone="UTC" \
  --attempt-deadline=300s \
  --location=us-central1
```

## Manual Execution

```bash
cd 04-inra-cicd-automation/cron-jobs

# Run cleanup
./run-all-cleanup.sh
```
