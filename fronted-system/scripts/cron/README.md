# Cron Scripts

Scripts for scheduled tasks. These can be run manually or scheduled via cron/Cloud Scheduler.

## Scripts

| Script | Purpose | Schedule |
|--------|---------|----------|
| `billing-sync-retry.sh` | Process failed Stripe→BigQuery syncs | Every 5 minutes |
| `billing-reconciliation.sh` | Full Stripe↔Supabase reconciliation | Daily at 2 AM UTC |
| `billing-sync-stats.sh` | Get sync queue statistics | Every 15 minutes |
| `run-all-cleanup.sh` | Database cleanup (rate limits, tokens, etc.) | Daily at 3 AM UTC |

## Setup

### 1. Set Environment Variables

```bash
# Required for billing scripts
export APP_URL="https://app.cloudact.ai"
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
chmod +x scripts/cron/*.sh
```

### 4. Schedule via Cron

```bash
# Edit crontab
crontab -e

# Add entries:
*/5 * * * * /path/to/fronted_v0/scripts/cron/billing-sync-retry.sh >> /var/log/billing-sync-retry.log 2>&1
0 2 * * * /path/to/fronted_v0/scripts/cron/billing-reconciliation.sh >> /var/log/billing-reconciliation.log 2>&1
*/15 * * * * /path/to/fronted_v0/scripts/cron/billing-sync-stats.sh >> /var/log/billing-sync-stats.log 2>&1
0 3 * * * /path/to/fronted_v0/scripts/cron/run-all-cleanup.sh >> /var/log/cleanup.log 2>&1
```

### 5. Or Use Cloud Scheduler (GCP)

```bash
# Billing sync retry (every 5 minutes)
gcloud scheduler jobs create http billing-sync-retry \
  --schedule="*/5 * * * *" \
  --uri="https://app.cloudact.ai/api/cron/billing-sync" \
  --http-method=POST \
  --headers="Content-Type=application/json,x-cron-secret=YOUR_SECRET" \
  --message-body='{"action":"retry","limit":10}'

# Billing reconciliation (daily at 2 AM UTC)
gcloud scheduler jobs create http billing-reconciliation \
  --schedule="0 2 * * *" \
  --uri="https://app.cloudact.ai/api/cron/billing-sync" \
  --http-method=POST \
  --headers="Content-Type=application/json,x-cron-secret=YOUR_SECRET" \
  --message-body='{"action":"reconcile"}' \
  --attempt-deadline=300s
```

## Manual Execution

```bash
# Run billing sync retry
./scripts/cron/billing-sync-retry.sh

# Run with custom limit
./scripts/cron/billing-sync-retry.sh 20

# Run reconciliation
./scripts/cron/billing-reconciliation.sh

# Get stats
./scripts/cron/billing-sync-stats.sh

# Run cleanup
./scripts/cron/run-all-cleanup.sh
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
