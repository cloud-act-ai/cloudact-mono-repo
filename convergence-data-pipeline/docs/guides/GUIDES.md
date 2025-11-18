# Convergence Data Pipeline - Practical Guides

Complete guide for the multi-tenant data pipeline platform.

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Tenant Onboarding](#2-tenant-onboarding)
3. [Pipeline Execution](#3-pipeline-execution)
4. [Quota Management](#4-quota-management)
5. [Cloud Scheduler Setup](#5-cloud-scheduler-setup)

---

## 1. Quick Start

### Prerequisites

- Python 3.11+, GCP Project with BigQuery, Service Account JSON

### Setup (5 minutes)

```bash
# Install
git clone https://github.com/your-org/convergence-data-pipeline.git
cd convergence-data-pipeline
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Configure .env
cp .env.example .env
# Edit: GCP_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, DISABLE_AUTH=true

# Start server
uvicorn src.app.main:app --reload --port 8080
```

Visit http://localhost:8080/docs for API documentation.

### Test It

```bash
# 1. Onboard tenant
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"test_corp","company_name":"Test Corp","admin_email":"admin@test.com"}'

# 2. Save the API key from response!

# 3. Run pipeline
curl -X POST http://localhost:8080/api/v1/pipelines/run/test_corp/gcp/cost/dryrun \
  -H "X-API-Key: test_corp_api_xxxx" \
  -H "X-User-ID: user123"
```

---

## 2. Tenant Onboarding

Creates organization infrastructure in BigQuery.

### What Gets Created

1. **Tenant profile** in `tenants.tenant_profiles`
2. **API key** (KMS encrypted) in `tenants.tenant_api_keys`
3. **Subscription** in `tenants.tenant_subscriptions`
4. **Usage quota** in `tenants.tenant_usage_quotas`
5. **Tenant dataset** `{tenant_id}` with tables:
   - `x_meta_pipeline_runs` - Execution history
   - `x_meta_step_logs` - Step logs
   - `x_meta_dq_results` - Data quality

### Step-by-Step

**1. Call onboarding API:**
```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "ACME Corporation",
    "admin_email": "admin@acmecorp.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**2. Save API key from response:**
```json
{
  "api_key": "acme_corp_api_xK9mPqWz7LnR4vYt",
  "dataset_created": true,
  "tables_created": ["x_meta_pipeline_runs", "x_meta_step_logs", "x_meta_dq_results"]
}
```

**3. Store securely** - shown only once!

**4. Verify in BigQuery:**
```bash
bq ls acme_corp
```

### Subscription Plans

| Plan | Daily Limit | Concurrent | Team | Providers |
|------|-------------|------------|------|-----------|
| STARTER | 6 | 3 | 2 | 3 |
| PROFESSIONAL | 25 | 5 | 6 | 6 |
| SCALE | 100 | 10 | 11 | 10 |

---

## 3. Pipeline Execution

Execute pipelines using templated configurations.

### Key Architecture

```
tenant_id = Organization (quotas enforced at this level)
user_id = Individual user (logging only, NOT for limits)
```

- NO user creation/management (frontend handles this)
- Triggered by Cloud Scheduler OR manual API
- Rate limited: 50 requests/minute per tenant

### Step 1: Get Credentials

```bash
X_API_KEY="acme_corp_api_xK9mPqWz7LnR4vYt"  # From onboarding
X_USER_ID="alice_uuid_123"                  # From frontend
```

### Step 2: Trigger Pipeline

**Template-based (recommended):**
```bash
curl -X POST http://localhost:8080/api/v1/pipelines/run/acme_corp/gcp/cost/billing_cost \
  -H "X-API-Key: $X_API_KEY" \
  -H "X-User-ID: $X_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-14"}'
```

**Path:** `/{tenant_id}/{provider}/{domain}/{template_name}`
- Loads: `configs/gcp/cost/billing_cost.yml`
- Replaces: `{tenant_id}` → acme_corp, `{pipeline_id}` → acme_corp-gcp-cost-billing_cost

**Response:**
```json
{
  "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "pipeline_id": "acme_corp-gcp-cost-billing_cost",
  "status": "PENDING"
}
```

### Step 3: Check Status

```bash
curl http://localhost:8080/api/v1/pipelines/runs/{pipeline_logging_id} \
  -H "X-API-Key: $X_API_KEY" \
  -H "X-User-ID: $X_USER_ID"
```

### Step 4: Query Results

**Pipeline runs:**
```sql
SELECT pipeline_logging_id, pipeline_id, tenant_id, user_id, status, start_time, duration_ms
FROM `acme_corp.x_meta_pipeline_runs`
ORDER BY start_time DESC LIMIT 10
```

**Step logs:**
```sql
SELECT pipeline_logging_id, step_name, status, rows_processed, duration_ms
FROM `acme_corp.x_meta_step_logs`
WHERE pipeline_logging_id = 'f47ac10b...'
ORDER BY start_time
```

---

## 4. Quota Management

Quotas enforced at `tenant_id` level (NOT user_id).

### Check Quota

```bash
curl http://localhost:8080/api/v1/tenants/acme_corp/quota \
  -H "X-API-Key: $X_API_KEY" \
  -H "X-User-ID: $X_USER_ID"
```

**Response:**
```json
{
  "pipelines_run_today": 12,
  "daily_limit": 25,
  "remaining_today": 13,
  "concurrent_pipelines_running": 2
}
```

### Query Directly

```sql
SELECT tenant_id, pipelines_run_today, daily_limit,
       (daily_limit - pipelines_run_today) as remaining
FROM `tenants.tenant_usage_quotas`
WHERE tenant_id = 'acme_corp' AND usage_date = CURRENT_DATE()
```

### When Quota Exceeded

**Daily limit (HTTP 429):**
```json
{"detail": "Daily pipeline quota exceeded. Upgrade or wait until tomorrow."}
```

**Concurrent limit (HTTP 429):**
```json
{"detail": "Concurrent pipeline limit reached. Wait for running pipelines to complete."}
```

### Quota Reset

- **Daily:** Midnight UTC (Cloud Scheduler job `/scheduler/reset-daily-quotas`)
- **Concurrent:** Decremented when pipeline completes

---

## 5. Cloud Scheduler Setup

Automate pipelines with Google Cloud Scheduler.

### Architecture

```
Cloud Scheduler (hourly) → /scheduler/trigger → Queries due pipelines
  → Adds to queue → Worker: /scheduler/process-queue → Executes pipeline
```

### Step 1: Configure Schedule

```bash
curl -X POST http://localhost:8080/api/v1/scheduler/customer/acme_corp/pipelines \
  -H "X-API-Key: $X_API_KEY" \
  -H "X-User-ID: $X_USER_ID" \
  -d '{
    "provider": "GCP",
    "domain": "COST",
    "pipeline_template": "billing_cost",
    "schedule_cron": "0 2 * * *",
    "timezone": "America/New_York",
    "is_active": true
  }'
```

**Cron examples:**
- `0 2 * * *` - Daily at 2 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 1 * *` - Monthly on 1st

### Step 2: Create Cloud Scheduler Jobs

**Hourly trigger:**
```bash
gcloud scheduler jobs create http pipeline-scheduler-trigger \
  --schedule="0 * * * *" \
  --uri="https://your-service/api/v1/scheduler/trigger" \
  --http-method=POST \
  --headers="X-Admin-Key=your-admin-key" \
  --location=us-central1
```

**Queue processor (every 5 min):**
```bash
gcloud scheduler jobs create http pipeline-queue-processor \
  --schedule="*/5 * * * *" \
  --uri="https://your-service/api/v1/scheduler/process-queue" \
  --http-method=POST \
  --headers="X-Admin-Key=your-admin-key" \
  --location=us-central1
```

**Daily quota reset:**
```bash
gcloud scheduler jobs create http pipeline-quota-reset \
  --schedule="0 0 * * *" \
  --uri="https://your-service/api/v1/scheduler/reset-daily-quotas" \
  --http-method=POST \
  --headers="X-Admin-Key=your-admin-key" \
  --location=us-central1
```

### Step 3: Monitor

**Check scheduler status:**
```bash
curl http://localhost:8080/api/v1/scheduler/status \
  -H "X-Admin-Key: your-admin-key"
```

**Response:**
```json
{
  "total_active_pipelines": 45,
  "pipelines_due_now": 3,
  "pipelines_queued": 5,
  "pipelines_completed_today": 120
}
```

### Required Tables

Scheduler needs these in `customers` dataset:
- `customer_pipeline_configs` - Schedules
- `pipeline_execution_queue` - Pending
- `scheduled_pipeline_runs` - History

---

## Troubleshooting

### 401 - Invalid API Key

```bash
# Check API key
bq query "SELECT tenant_id, is_active FROM tenants.tenant_api_keys WHERE tenant_id='acme_corp'"
```

### 429 - Quota Exceeded

```bash
# Check usage
bq query "SELECT pipelines_run_today, daily_limit FROM tenants.tenant_usage_quotas
          WHERE tenant_id='acme_corp' AND usage_date=CURRENT_DATE()"
# Wait until midnight UTC or upgrade plan
```

### 404 - Template Not Found

```bash
# Verify template exists
ls configs/gcp/cost/billing_cost.yml
# Template path: configs/{provider}/{domain}/{name}.yml
```

### 500 - Dataset Not Found

```bash
# Check dataset exists
bq ls | grep acme_corp
# Re-onboard with force_recreate_dataset=true if missing
```

### Pipeline Stuck (>60 min)

```bash
# Cloud Scheduler cleanup runs hourly, or trigger manually:
curl -X POST http://localhost:8080/api/v1/scheduler/cleanup-orphaned-pipelines \
  -H "X-Admin-Key: your-admin-key"
```

---

## Summary

### Key Points

1. **tenant_id** = Organization (quotas here)
2. **user_id** = Individual (logging only)
3. **API Key** = Tenant-level auth
4. **Templates** = `configs/{provider}/{domain}/{name}.yml`
5. **Quotas** = Daily/concurrent limits per subscription

### Workflow

```
Onboard → Configure Schedule → Cloud Scheduler Triggers → Execute Pipeline → Monitor
```

### Admin Endpoints (require X-Admin-Key)

- POST `/scheduler/trigger` - Trigger due pipelines
- POST `/scheduler/process-queue` - Process queue
- POST `/scheduler/reset-daily-quotas` - Reset quotas
- GET `/scheduler/status` - Health check

---

**Version:** 1.0.0 | **Last Updated:** 2025-11-17 | **Lines:** 299
