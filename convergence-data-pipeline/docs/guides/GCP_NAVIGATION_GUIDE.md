# GCP Console Navigation Guide

## Overview
Step-by-step guide to navigate Google Cloud Console for your monthly automated pipeline system.

---

## 1. Cloud Scheduler

### Navigate to Cloud Scheduler
```
https://console.cloud.google.com/cloudscheduler?project=YOUR_PROJECT_ID
```

Or:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (dropdown at top)
3. Click **☰** (hamburger menu) → **Cloud Scheduler**

### What You'll See

**Job List**:
| Name | Frequency | Target | Next Run | Last Run |
|------|-----------|--------|----------|----------|
| pipeline-monthly-batch | 0 0 1 * * (Monthly) | HTTP | Dec 1, 2025 | Nov 1, 2025 |
| worker-health-check | */5 * * * * (Every 5 min) | HTTP | (Next 5 min) | (5 min ago) |

### Actions

**Run Job Manually**:
1. Find `pipeline-monthly-batch` row
2. Click **3-dot menu** (⋮) on the right
3. Select **Force a job run**
4. Confirm

**View Execution History**:
1. Click job name: `pipeline-monthly-batch`
2. See **EXECUTION LOG** tab
3. Shows:
   - Execution time
   - Status (Success/Failed)
   - Response code
   - Response body

**Edit Schedule**:
1. Click job name: `pipeline-monthly-batch`
2. Click **EDIT** at top
3. Modify **Frequency** (cron format):
   - `0 0 1 * *` = 1st of every month at midnight
   - `0 0 1,15 * *` = 1st and 15th at midnight
   - `0 0 * * 0` = Every Sunday at midnight

---

## 2. Pub/Sub

### Navigate to Pub/Sub Topics
```
https://console.cloud.google.com/cloudpubsub/topic/list?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **Pub/Sub** → **Topics**

### Topics

**pipeline-tasks** (Main queue):
- Click topic name to view details
- **METRICS** tab: Message publish rate
- **SUBSCRIPTIONS** tab: Shows `pipeline-tasks-sub`

**pipeline-tasks-dead-letter** (Failures):
- Click topic name
- **SUBSCRIPTIONS** tab: Shows `pipeline-tasks-dead-letter-sub`

### Navigate to Pub/Sub Subscriptions
```
https://console.cloud.google.com/cloudpubsub/subscription/list?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **Pub/Sub** → **Subscriptions**

### Subscriptions

**pipeline-tasks-sub** (Worker queue):

**Key Metrics**:
- **Undelivered messages**: Number of tasks waiting to be processed
- **Oldest unacked message age**: How long oldest message has been waiting
- **Throughput**: Messages/sec being processed

**Actions**:
1. Click subscription name
2. **MESSAGES** tab → **PULL** → Pull 10 messages to see task details
3. **METRICS** tab → View graphs over time

**pipeline-tasks-dead-letter-sub** (Permanent failures):

**Key Metrics**:
- **Undelivered messages**: Number of permanently failed tasks
  - **Should be 0** or very low
  - If >10, you'll get an alert

**Actions**:
1. Click subscription name
2. **MESSAGES** tab → **PULL** → See failure details
3. Message attributes show:
   - `tenant_id`: Which tenant failed
   - `pipeline_id`: Which pipeline failed
4. Message body shows task details

---

## 3. Cloud Run

### Navigate to Cloud Run
```
https://console.cloud.google.com/run?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **Cloud Run**

### Services

**convergence-api** (Publisher):

**Overview**:
- **URL**: Your API endpoint
- **Status**: Green = Healthy
- **Instances**: Usually 1 (always-on)

**Tabs**:
1. **METRICS**:
   - Request count
   - Request latency
   - Instance count
   - CPU utilization
   - Memory utilization

2. **LOGS**:
   - Click to view logs
   - Filter: `severity="ERROR"` (show only errors)
   - Search: `"publish"` (show publish operations)

3. **REVISIONS**:
   - Shows deployment history
   - Can rollback to previous version

**convergence-worker** (Pipeline executor):

**Overview**:
- **Status**: Green = Healthy
- **Instances**: 1 (idle) to 50 (peak load)

**Tabs**:
1. **METRICS** (MOST IMPORTANT):
   - **Instance count**: Shows auto-scaling
     - 1 instance = idle
     - 10-50 instances = processing tasks
   - **Request count**: Should be 0 (workers don't receive HTTP requests)
   - **CPU/Memory utilization**: Shows resource usage

2. **LOGS** (CRITICAL FOR DEBUGGING):
   - Filter: `severity="INFO"` → Shows pipeline progress
   - Filter: `severity="ERROR"` → Shows failures
   - Search: `"Worker progress"` → Shows every 100 executions
   - Search: `"Pipeline completed successfully"` → Shows successes

**Example Logs**:
```
INFO: Starting Pub/Sub worker (subscription: pipeline-tasks-sub, max_concurrent: 100)
INFO: Worker listening for messages...
INFO: Executing pipeline task (tenant_id: tenant1, pipeline_id: p_openai_billing)
INFO: Pipeline completed successfully (tenant_id: tenant1, pipeline_logging_id: pl_xyz)
INFO: Worker progress: 100 executed, 98 success, 2 failed
```

### Actions

**Restart Service**:
1. Click service name
2. Click **EDIT & DEPLOY NEW REVISION**
3. Scroll down → **CREATE** (no changes needed, just redeploy)

**View Real-Time Logs**:
1. Click service name → **LOGS**
2. Click **STREAMING LOGS** (auto-refreshes)

**Scale Configuration**:
1. Click service name → **EDIT & DEPLOY NEW REVISION**
2. **AUTOSCALING** section:
   - **Minimum instances**: 1 (always at least 1 worker)
   - **Maximum instances**: 50 (can scale up to 50 workers)
3. Modify if needed (e.g., max 100 for more aggressive scaling)

---

## 4. Monitoring (Dashboards)

### Navigate to Dashboards
```
https://console.cloud.google.com/monitoring/dashboards?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **Monitoring** → **Dashboards**

### Pipeline Autopilot Dashboard

**Widgets**:

1. **Pub/Sub Queue Depth** (Top Left):
   - Shows messages waiting in `pipeline-tasks-sub`
   - **During processing**: Starts high (10,000), decreases to 0
   - **When idle**: Should be 0

2. **Worker Instance Count** (Top Right):
   - Shows number of `convergence-worker` instances
   - **During processing**: 1→50 (auto-scales)
   - **When idle**: 1 (scales down)

3. **Dead Letter Queue** (Bottom Left):
   - Shows permanent failures in `pipeline-tasks-dead-letter-sub`
   - **Healthy**: 0 messages
   - **Alert triggered**: >10 messages

4. **BigQuery Queries/sec** (Bottom Right):
   - Shows BigQuery load
   - **During processing**: 100-300 queries/sec (respects quota)
   - **When idle**: 0-10 queries/sec

### Actions

**Change Time Range**:
- Top right: Click time dropdown (e.g., "Last 1 hour")
- Select: Last 6 hours, Last 1 day, Last 7 days

**Refresh**:
- Auto-refreshes every 1 minute
- Manual refresh: Click **↻** icon

---

## 5. Monitoring (Alerts)

### Navigate to Alert Policies
```
https://console.cloud.google.com/monitoring/alerting/policies?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **Monitoring** → **Alerting**

### Alert Policy: "Pipeline Permanent Failures"

**Condition**:
- Triggers when: Dead Letter Queue has >10 undelivered messages for 5 minutes
- Severity: CRITICAL

**What Happens**:
- You receive a notification (if notification channel configured)
- Alert shows in **Incidents** tab

### Set Up Notification Channel

**Email Notification**:
1. Go to **Monitoring** → **Alerting** → **NOTIFICATION CHANNELS**
2. Click **+ CREATE NOTIFICATION CHANNEL**
3. Select **Email**
4. Enter your email address
5. Click **SAVE**
6. Go back to alert policy → **EDIT**
7. **Notifications** section → Select your email channel
8. **SAVE**

**Slack Notification** (optional):
1. Same as above, but select **Slack** instead
2. Follow integration instructions

---

## 6. BigQuery

### Navigate to BigQuery
```
https://console.cloud.google.com/bigquery?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **BigQuery** → **SQL Workspace**

### View Pipeline Execution Logs

**Query**:
```sql
SELECT
  pipeline_logging_id,
  tenant_id,
  pipeline_id,
  status,
  created_at,
  completed_at,
  TIMESTAMP_DIFF(completed_at, created_at, SECOND) as duration_seconds
FROM `YOUR_PROJECT.pipeline_metadata.pipeline_logging`
WHERE pipeline_id = 'p_openai_billing'
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
ORDER BY created_at DESC
LIMIT 100
```

**Results**:
| pipeline_logging_id | tenant_id | pipeline_id | status | created_at | duration_seconds |
|---------------------|-----------|-------------|--------|------------|------------------|
| pl_xyz123 | tenant1 | p_openai_billing | SUCCESS | 2025-11-16 12:34:56 | 45 |
| pl_abc789 | tenant2 | p_openai_billing | SUCCESS | 2025-11-16 12:35:12 | 52 |

### Check Pipeline Success Rate

**Query**:
```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM `YOUR_PROJECT.pipeline_metadata.pipeline_logging`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
GROUP BY status
```

**Expected Results**:
| status | count | percentage |
|--------|-------|------------|
| SUCCESS | 9950 | 99.50% |
| FAILED | 50 | 0.50% |

---

## 7. Logs Explorer

### Navigate to Logs Explorer
```
https://console.cloud.google.com/logs/query?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **Logging** → **Logs Explorer**

### Useful Queries

**All Worker Logs**:
```
resource.type="cloud_run_revision"
resource.labels.service_name="convergence-worker"
```

**Worker Errors Only**:
```
resource.type="cloud_run_revision"
resource.labels.service_name="convergence-worker"
severity="ERROR"
```

**Pipeline Completions**:
```
resource.type="cloud_run_revision"
resource.labels.service_name="convergence-worker"
"Pipeline completed successfully"
```

**Scheduler Executions**:
```
resource.type="cloud_scheduler_job"
resource.labels.job_id="pipeline-monthly-batch"
```

### Actions

**Export Logs**:
1. Run query
2. Click **MORE ACTIONS** → **Create sink**
3. Choose destination: BigQuery, Cloud Storage, or Pub/Sub

**Create Log-Based Metric**:
1. Run query
2. Click **ACTIONS** → **Create metric**
3. Use for custom dashboards or alerts

---

## 8. Billing & Costs

### Navigate to Billing Reports
```
https://console.cloud.google.com/billing/YOUR_BILLING_ID/reports?project=YOUR_PROJECT_ID
```

Or:
1. Click **☰** → **Billing** → **Reports**

### Filter Costs

**Group by**: Service
**Time range**: Last 30 days
**Filters**: Add filter → **Project** → Select your project

**Expected Monthly Costs** (10k tenants):
| Service | Cost |
|---------|------|
| Cloud Run (Worker) | $100-300 |
| Cloud Run (API) | $20-50 |
| BigQuery | $50-100 |
| Pub/Sub | $10-20 |
| Cloud Scheduler | $0.10 |
| **TOTAL** | **$200-500** |

### Set Up Budget Alerts

1. Click **☰** → **Billing** → **Budgets & alerts**
2. Click **CREATE BUDGET**
3. **Name**: Pipeline Monthly Budget
4. **Budget amount**: $500/month
5. **Threshold rules**: Alert at 50%, 90%, 100%
6. **Manage notifications** → Add email
7. **FINISH**

---

## Quick Reference URLs

Replace `YOUR_PROJECT_ID` with your actual project ID:

| Service | URL |
|---------|-----|
| Cloud Scheduler | `https://console.cloud.google.com/cloudscheduler?project=YOUR_PROJECT_ID` |
| Pub/Sub Topics | `https://console.cloud.google.com/cloudpubsub/topic/list?project=YOUR_PROJECT_ID` |
| Pub/Sub Subscriptions | `https://console.cloud.google.com/cloudpubsub/subscription/list?project=YOUR_PROJECT_ID` |
| Cloud Run Services | `https://console.cloud.google.com/run?project=YOUR_PROJECT_ID` |
| Monitoring Dashboards | `https://console.cloud.google.com/monitoring/dashboards?project=YOUR_PROJECT_ID` |
| Alert Policies | `https://console.cloud.google.com/monitoring/alerting/policies?project=YOUR_PROJECT_ID` |
| BigQuery | `https://console.cloud.google.com/bigquery?project=YOUR_PROJECT_ID` |
| Logs Explorer | `https://console.cloud.google.com/logs/query?project=YOUR_PROJECT_ID` |
| Billing Reports | `https://console.cloud.google.com/billing?project=YOUR_PROJECT_ID` |

---

## Mobile Access

**Google Cloud App** (iOS/Android):
1. Download "Google Cloud" app
2. Sign in with your account
3. Select your project
4. Limited features available:
   - View dashboards
   - View logs
   - Trigger scheduler jobs (via Cloud Shell)
   - Check billing

---

## Tips

1. **Bookmark Important Pages**:
   - Cloud Scheduler (for manual runs)
   - Monitoring Dashboard (for quick health check)
   - Worker Logs (for debugging)

2. **Set Up Alerts**:
   - Dead letter queue >10 messages
   - Worker service unhealthy
   - Budget threshold exceeded

3. **Check These Weekly** (optional):
   - Dead letter queue count
   - Billing reports
   - Worker instance max (ensure not hitting limit)

4. **Monthly After Automatic Run**:
   - Check scheduler execution log (verify it triggered)
   - Check monitoring dashboard (verify completion)
   - Check billing (ensure costs within expected range)
