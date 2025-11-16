# Monthly Pipeline Testing Guide

## Overview
This guide shows how to manually test your **MONTHLY** automated pipeline system before waiting for the scheduled run.

---

## Quick Test (2 minutes)

### Test with 2 Tenants

```bash
# Set your environment variables (from setup script output)
export API_URL="https://YOUR_API_URL"
export ADMIN_API_KEY="YOUR_ADMIN_KEY"

# Test with just 2 tenants
curl -X POST "$API_URL/pipelines/batch/publish" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_ids": ["tenant1", "tenant2"],
    "pipeline_id": "p_openai_billing",
    "parameters": {"date": "2025-11-16"},
    "randomize_delay": true,
    "max_jitter_seconds": 60
  }'
```

Expected response:
```json
{
  "published_count": 2,
  "failed_count": 0,
  "total_tenants": 2,
  "message_ids": ["123456789", "987654321"]
}
```

---

## Manual Scheduler Test (Recommended)

### Option 1: Run Scheduler Once via GCP Console

**Step 1**: Navigate to Cloud Scheduler
```
https://console.cloud.google.com/cloudscheduler?project=YOUR_PROJECT_ID
```

**Step 2**: Find the job named `pipeline-monthly-batch`

**Step 3**: Click the **3-dot menu** (⋮) on the right → **Force a job run**

**Step 4**: Confirm the run

**Expected Result**: Job executes immediately (doesn't wait for monthly schedule)

### Option 2: Run Scheduler via gcloud CLI

```bash
# Run the scheduler job immediately
gcloud scheduler jobs run pipeline-monthly-batch \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID
```

Expected output:
```
Triggered job [pipeline-monthly-batch].
```

---

## Verification Steps

### 1. Check Pub/Sub Messages Published

Navigate to Pub/Sub Subscriptions:
```
https://console.cloud.google.com/cloudpubsub/subscription/list?project=YOUR_PROJECT_ID
```

**What to check**:
- Find `pipeline-tasks-sub` subscription
- Look at **Undelivered message count**
- Should see messages accumulating (e.g., 2, 100, 10000 based on your test)

### 2. Monitor Worker Execution

Navigate to Cloud Run:
```
https://console.cloud.google.com/run?project=YOUR_PROJECT_ID
```

**What to check**:
- Click on `convergence-worker` service
- Go to **METRICS** tab
- Check **Instance count** - should auto-scale from 1→50 based on queue depth

### 3. View Worker Logs

From the `convergence-worker` service page:
- Click **LOGS** tab
- Filter by: `severity="INFO"`

**Expected logs**:
```
Executing pipeline task (tenant_id: tenant1, pipeline_id: p_openai_billing)
Pipeline completed successfully (tenant_id: tenant1, pipeline_logging_id: xyz)
Worker progress: 100 executed, 98 success, 2 failed
```

### 4. Check Dead Letter Queue (Failures)

Navigate to Pub/Sub Subscriptions:
```
https://console.cloud.google.com/cloudpubsub/subscription/detail/pipeline-tasks-dead-letter-sub?project=YOUR_PROJECT_ID
```

**What to check**:
- **Undelivered message count** should be 0 (or very low)
- If count is high, click **MESSAGES** tab → **PULL** to see failure details

### 5. Verify BigQuery Pipeline Results

```bash
# Check pipeline execution logs
bq query --use_legacy_sql=false \
  "SELECT * FROM \`YOUR_PROJECT.pipeline_metadata.pipeline_logging\`
   WHERE pipeline_id = 'p_openai_billing'
   ORDER BY created_at DESC
   LIMIT 10"
```

Expected output:
```
| pipeline_logging_id | tenant_id | pipeline_id      | status  | created_at          |
|---------------------|-----------|------------------|---------|---------------------|
| pl_xyz123           | tenant1   | p_openai_billing | SUCCESS | 2025-11-16 12:34:56 |
| pl_abc789           | tenant2   | p_openai_billing | SUCCESS | 2025-11-16 12:35:12 |
```

---

## Full-Scale Test (10k Tenants)

### Get All Tenant IDs from BigQuery

```bash
# Export all tenant IDs to a file
bq query --use_legacy_sql=false --format=csv --max_rows=100000 \
  "SELECT DISTINCT schema_name FROM \`YOUR_PROJECT.INFORMATION_SCHEMA.SCHEMATA\`
   WHERE schema_name NOT IN ('information_schema', 'metadata', 'pg_catalog')" \
  | tail -n +2 > /tmp/tenant_ids.txt

# Convert to JSON array
TENANT_IDS=$(cat /tmp/tenant_ids.txt | jq -R -s -c 'split("\n")[:-1]')

echo "Total tenants: $(echo $TENANT_IDS | jq 'length')"
```

### Publish 10k Tasks

```bash
curl -X POST "$API_URL/pipelines/batch/publish" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_ids\": $TENANT_IDS,
    \"pipeline_id\": \"p_openai_billing\",
    \"parameters\": {\"date\": \"$(date +%Y-%m-%d)\"},
    \"randomize_delay\": true,
    \"max_jitter_seconds\": 3600
  }"
```

Expected response:
```json
{
  "published_count": 10000,
  "failed_count": 0,
  "total_tenants": 10000
}
```

---

## Monitoring During Test

### Real-Time Dashboard

Navigate to:
```
https://console.cloud.google.com/monitoring/dashboards?project=YOUR_PROJECT_ID
```

Find: **Pipeline Autopilot Dashboard**

**Widgets**:
1. **Pub/Sub Queue Depth** - Shows messages waiting to be processed
2. **Worker Instance Count** - Shows auto-scaling (1→50 instances)
3. **Dead Letter Queue** - Shows permanent failures
4. **BigQuery Queries/sec** - Shows query load

### Expected Timeline (for 10k tenants)

```
00:00 - Publish complete: 10,000 messages in Pub/Sub
00:01 - Workers start scaling: 1→10 instances
00:05 - Workers at peak: 30-50 instances
00:30 - Queue depth decreasing: 5,000 messages remaining
01:00 - Queue depth low: 1,000 messages remaining
01:30 - Workers scaling down: 10→5 instances
02:00 - Complete: Queue empty, workers at 1 instance
```

---

## Troubleshooting

### Issue: No messages in Pub/Sub

**Cause**: Publisher endpoint failed

**Solution**:
1. Check API logs:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-api" \
     --limit=50 --format=json --project=YOUR_PROJECT_ID
   ```

2. Verify admin API key is correct:
   ```bash
   echo $ADMIN_API_KEY
   ```

### Issue: Workers not scaling

**Cause**: Worker service not pulling messages

**Solution**:
1. Check worker logs:
   ```
   https://console.cloud.google.com/run/detail/us-central1/convergence-worker/logs?project=YOUR_PROJECT_ID
   ```

2. Restart worker service:
   ```bash
   gcloud run services update convergence-worker \
     --region=us-central1 \
     --project=YOUR_PROJECT_ID
   ```

### Issue: High dead letter queue count

**Cause**: Permanent failures (bad config, missing schema)

**Solution**:
1. Pull messages from dead letter queue:
   ```
   https://console.cloud.google.com/cloudpubsub/subscription/detail/pipeline-tasks-dead-letter-sub?project=YOUR_PROJECT_ID
   ```
   Click **MESSAGES** → **PULL** → View error details

2. Common fixes:
   - Missing pipeline config: Add pipeline YAML
   - Missing BigQuery schema: Create schema for tenant
   - Invalid parameters: Check pipeline parameters

### Issue: Scheduler job failed

**Cause**: API returned error or timed out

**Solution**:
1. View scheduler execution history:
   ```
   https://console.cloud.google.com/cloudscheduler?project=YOUR_PROJECT_ID
   ```
   Click `pipeline-monthly-batch` → **EXECUTION LOG**

2. Check for:
   - HTTP 401: Admin API key mismatch
   - HTTP 500: API service crashed
   - Timeout: Increase `--attempt-deadline` in setup script

---

## Test Checklist

Before going live with monthly automation:

- [ ] Quick test (2 tenants) successful
- [ ] Manual scheduler run successful
- [ ] Pub/Sub messages published correctly
- [ ] Workers auto-scaled (1→10+ instances)
- [ ] Pipeline executions completed successfully
- [ ] Dead letter queue is empty or low
- [ ] BigQuery pipeline logs show SUCCESS status
- [ ] Workers scaled down to 1 instance after completion
- [ ] Monitoring dashboard shows correct metrics
- [ ] Alert policy created (check email/SMS setup)

---

## Next Steps

After successful testing:

1. **Let it run automatically** - Next run: 1st of next month at midnight UTC

2. **Set up notifications** (optional):
   ```bash
   # Create notification channel (email)
   gcloud alpha monitoring channels create \
     --display-name="Pipeline Alerts Email" \
     --type=email \
     --channel-labels=email_address=your-email@example.com \
     --project=YOUR_PROJECT_ID
   ```

3. **Monitor first automatic run**:
   - Check dashboard on the 1st of next month at 00:01 UTC
   - Verify scheduler triggered successfully
   - Confirm all 10k tenants completed

4. **Forget about it** - System runs forever with zero intervention

---

## Cost Monitoring

Track monthly costs:
```
https://console.cloud.google.com/billing/YOUR_BILLING_ID/reports?project=YOUR_PROJECT_ID
```

Filter by:
- **Service**: Cloud Run, Pub/Sub, BigQuery
- **Time range**: Last 30 days

**Expected monthly cost**: $200-500 for 10k tenants
