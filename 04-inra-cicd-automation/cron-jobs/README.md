# Cron Jobs

Scheduled tasks for CloudAct. Run manually or via cron/Cloud Scheduler.

## Scripts

| Script | Purpose | Schedule |
|--------|---------|----------|
| `billing-sync-retry.sh` | Process failed Stripe→BigQuery syncs | Every 5 minutes |
| `billing-reconciliation.sh` | Full Stripe↔Supabase reconciliation | Daily at 2 AM UTC |
| `billing-sync-stats.sh` | Get sync queue statistics | Every 15 minutes |
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
# Required for billing scripts
export APP_URL="${CLOUDACT_APP_URL:-https://app.cloudact.io}"
export CRON_SECRET="your-secure-cron-secret-min-32-chars"

# Required for cleanup script
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### 2. Add CRON_SECRET to Frontend Environment

Add to your `.env.local` or production environment:
```
CRON_SECRET=your-secure-cron-secret-min-32-chars
```

### 3. Make Scripts Executable

```bash
chmod +x 04-inra-cicd-automation/scripts/cron/*.sh
```

### 4. Schedule via Cron

```bash
# Edit crontab
crontab -e

# Add entries (adjust paths):
*/5 * * * * /path/to/04-inra-cicd-automation/scripts/cron/billing-sync-retry.sh >> /var/log/billing-sync-retry.log 2>&1
0 2 * * * /path/to/04-inra-cicd-automation/scripts/cron/billing-reconciliation.sh >> /var/log/billing-reconciliation.log 2>&1
*/15 * * * * /path/to/04-inra-cicd-automation/scripts/cron/billing-sync-stats.sh >> /var/log/billing-sync-stats.log 2>&1
0 3 * * * /path/to/04-inra-cicd-automation/scripts/cron/run-all-cleanup.sh >> /var/log/cleanup.log 2>&1
```

### 5. Or Use Cloud Scheduler (GCP)

```bash
# Billing sync retry (every 5 minutes)
gcloud scheduler jobs create http billing-sync-retry \
  --schedule="*/5 * * * *" \
  --uri="${CLOUDACT_APP_URL}/api/cron/billing-sync" \
  --http-method=POST \
  --headers="Content-Type=application/json,x-cron-secret=${CRON_SECRET}" \
  --message-body='{"action":"retry","limit":10}'

# Billing reconciliation (daily at 2 AM UTC)
gcloud scheduler jobs create http billing-reconciliation \
  --schedule="0 2 * * *" \
  --uri="${CLOUDACT_APP_URL}/api/cron/billing-sync" \
  --http-method=POST \
  --headers="Content-Type=application/json,x-cron-secret=${CRON_SECRET}" \
  --message-body='{"action":"reconcile"}' \
  --attempt-deadline=300s

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
cd 04-inra-cicd-automation/scripts/cron

# Run billing sync retry
./billing-sync-retry.sh

# Run with custom limit
./billing-sync-retry.sh 20

# Run reconciliation
./billing-reconciliation.sh

# Get stats
./billing-sync-stats.sh

# Run cleanup
./run-all-cleanup.sh
```

## Monitoring

The `billing-sync-stats.sh` script outputs metrics in a format suitable for:
- Prometheus (parse the key=value output)
- CloudWatch (log parsing)
- Datadog (log parsing or custom metrics)

Example output:
```
billing_sync_pending=3
billing_sync_processing=0
billing_sync_failed=1
billing_sync_completed_today=42
billing_sync_oldest_pending=2024-01-15T10:30:00Z
```

## Alerts

The scripts include built-in alerts:
- `pending > 50`: Too many syncs waiting
- `failed > 10`: Too many permanent failures

Configure your monitoring system to watch for `[ALERT]` in logs.
