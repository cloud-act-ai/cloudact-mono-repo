# Master Onboarding and Testing Guide

**Version:** 1.0
**Last Updated:** 2025-11-17
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Customer Onboarding](#customer-onboarding)
4. [Frontend Integration](#frontend-integration)
5. [Scheduler Setup](#scheduler-setup)
6. [Manual Testing Guide](#manual-testing-guide)
7. [Pipeline Execution Within Limits](#pipeline-execution-within-limits)
8. [Complete Flow Documentation](#complete-flow-documentation)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This comprehensive guide covers the complete workflow for the Convergence Data Pipeline platform - from customer onboarding through pipeline execution and testing.

### Key Features

- **Customer-Centric Architecture**: Centralized customer management in `customers_metadata` dataset
- **Subscription Plans**: Three tiers (STARTER, PROFESSIONAL, SCALE) with quota enforcement
- **Complete Tenant Isolation**: Each customer gets dedicated BigQuery dataset
- **Automated Scheduling**: Cloud Scheduler integration with cron-based triggers
- **Quota Management**: Real-time usage tracking and enforcement
- **Enterprise Security**: KMS encryption, API key rotation, row-level security

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  Frontend (Stripe Checkout)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Customer Management API                         │
│  POST /api/v1/customers/onboard                             │
│  GET  /api/v1/customers/{customer_id}                       │
│  POST /api/v1/customers/{customer_id}/credentials           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          Centralized Customer Dataset (customers)            │
│  - customer_profiles                                         │
│  - customer_api_keys (KMS encrypted)                        │
│  - customer_cloud_credentials (KMS encrypted)               │
│  - customer_subscriptions (plans & limits)                  │
│  - customer_usage (real-time tracking)                      │
│  - customer_pipeline_configs (scheduling)                   │
│  - scheduled_pipeline_runs (state tracking)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                Cloud Scheduler (Hourly Trigger)              │
│  POST /api/v1/scheduler/trigger                             │
│  - Queries pipelines due to run                             │
│  - Creates scheduled runs                                   │
│  - Updates next_run_time                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Worker Pool (Queue Processing)                  │
│  POST /api/v1/scheduler/process-queue                       │
│  - Claims pending runs                                      │
│  - Executes pipelines                                       │
│  - Updates state (PENDING → RUNNING → COMPLETED)           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            Per-Customer Datasets ({customer_id})             │
│  - x_meta_pipeline_runs (execution logs)                    │
│  - x_meta_step_logs (step details)                          │
│  - x_meta_dq_results (data quality)                         │
│  - {provider}_silver_{domain} (actual data)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- GCP project with BigQuery enabled
- Python 3.11+
- Valid GCP service account with:
  - `roles/bigquery.dataEditor`
  - `roles/bigquery.jobUser`
  - `roles/cloudkms.cryptoKeyEncrypterDecrypter`

### Installation

```bash
# Clone repository
cd convergence-data-pipeline

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export GCP_PROJECT_ID=gac-prod-471220
export CUSTOMERS_DATASET_ID=customers_metadata
export KMS_PROJECT_ID=gac-prod-471220
export KMS_LOCATION=us-central1
export KMS_KEYRING=convergence-keys
export KMS_API_KEY_NAME=api-keys-key
export KMS_CREDENTIALS_KEY_NAME=credentials-key

# Start server
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080
```

### 5-Minute Test

```bash
# 1. Onboard a test customer
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "demo_test",
    "company_name": "Demo Corp",
    "admin_email": "test@demo.com",
    "subscription_plan": "PROFESSIONAL"
  }'

# Save the API key from response!

# 2. Run a pipeline
curl -X POST "http://localhost:8080/api/v1/pipelines/run/demo_test/gcp/example/dryrun" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-17", "trigger_by": "manual"}'

# 3. Verify in BigQuery
bq query --use_legacy_sql=false \
  "SELECT pipeline_id, status, start_time
   FROM \`gac-prod-471220.demo_test.x_meta_pipeline_runs\`
   ORDER BY start_time DESC LIMIT 1"

# 4. Clean up
bq rm -r -f gac-prod-471220:demo_test
```

---

## Customer Onboarding

### API Endpoint

```
POST /api/v1/customers/onboard
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customer_id` | string | Yes | Unique customer identifier (3-50 alphanumeric + underscore) |
| `company_name` | string | Yes | Company or organization name |
| `admin_email` | string | Yes | Primary admin email |
| `subscription_plan` | string | No | STARTER, PROFESSIONAL, or SCALE (default: STARTER) |

### Example Request

```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "acme_corp",
    "company_name": "ACME Corporation",
    "admin_email": "admin@acmecorp.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

### Response

```json
{
  "customer_id": "cust_abc123",
  "tenant_id": "acme_corp",
  "api_key": "acme_corp_api_xK9mPqWz7LnR4vYt",
  "subscription_plan": "PROFESSIONAL",
  "dataset_created": true,
  "tables_created": [
    "x_meta_pipeline_runs",
    "x_meta_step_logs",
    "x_meta_dq_results"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Customer ACME Corporation onboarded successfully."
}
```

**CRITICAL:** Save the `api_key` immediately - it's shown only once!

### What Gets Created

#### 1. Central Customer Record

In `customers_metadata` dataset:
- **customer_profiles**: Customer identity, subscription plan, status
- **customer_api_keys**: KMS-encrypted API key
- **customer_subscriptions**: Plan limits and quotas
- **customer_usage**: Real-time usage tracking

#### 2. Customer Dataset

BigQuery dataset `{customer_id}` with tables:
- **x_meta_pipeline_runs**: Pipeline execution logs
- **x_meta_step_logs**: Step-level execution details
- **x_meta_dq_results**: Data quality check results

#### 3. Subscription Limits

| Plan | Team Members | Providers | Pipelines/Day | Concurrent |
|------|-------------|-----------|---------------|------------|
| STARTER | 2 | 3 | 6 | 3 |
| PROFESSIONAL | 6 | 6 | 25 | 5 |
| SCALE | 11 | 10 | 100 | 10 |

---

## Frontend Integration

### Onboarding Workflow

```
Step 1: User signs up on frontend
  ↓
Step 2: Stripe checkout for subscription plan
  ↓
Step 3: Payment success → Stripe webhook
  ↓
Step 4: Backend receives webhook → Create customer
  POST /api/v1/customers/onboard
  ↓
Step 5: Generate API key
  ↓
Step 6: Send welcome email with API key
  ↓
Step 7: Customer can start using platform
```

### Add Cloud Credentials

```bash
curl -X POST "http://localhost:8080/api/v1/customers/acme_corp/credentials" \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GCP",
    "credential_type": "SERVICE_ACCOUNT",
    "credential_name": "GCP Billing Reader",
    "credentials": {
      "type": "service_account",
      "project_id": "acme-gcp-project",
      "private_key_id": "...",
      "private_key": "...",
      "client_email": "..."
    },
    "project_id": "acme-gcp-project"
  }'
```

### Configure Pipeline

```bash
curl -X POST "http://localhost:8080/api/v1/customers/acme_corp/provider-configs" \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GCP",
    "domain": "COST",
    "source_project_id": "acme-gcp-project",
    "source_dataset": "billing_export",
    "notification_emails": ["ops@acmecorp.com"]
  }'
```

---

## Scheduler Setup

### 1. Create Pipeline Configuration

```bash
curl -X POST "http://localhost:8080/api/v1/scheduler/customer/acme_corp/pipelines" \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GCP",
    "domain": "COST",
    "pipeline_template": "cost_billing",
    "schedule_cron": "0 2 * * *",
    "timezone": "America/New_York",
    "is_active": true
  }'
```

### 2. Deploy Cloud Scheduler

```bash
gcloud scheduler jobs create http pipeline-scheduler-trigger \
  --schedule="0 * * * *" \
  --uri="https://YOUR_DOMAIN/api/v1/scheduler/trigger" \
  --http-method=POST \
  --headers="X-Admin-Key=YOUR_ADMIN_KEY" \
  --location=us-central1
```

### 3. Deploy Worker Pool

```bash
# Cloud Run deployment for workers
gcloud run deploy pipeline-scheduler-worker \
  --image=gcr.io/gac-prod-471220/scheduler-worker:latest \
  --platform=managed \
  --region=us-central1 \
  --set-env-vars="WORKER_ID=worker-1,POLL_INTERVAL_SECONDS=5" \
  --min-instances=3 \
  --max-instances=50 \
  --cpu=2 \
  --memory=4Gi
```

### Scheduler Flow

```
1. Cloud Scheduler triggers hourly
   POST /api/v1/scheduler/trigger
   ↓
2. System queries pipelines due now:
   SELECT * FROM customer_pipeline_configs
   WHERE is_active = TRUE
     AND next_run_time <= CURRENT_TIMESTAMP()
   ↓
3. For each due pipeline:
   a. Check customer quota
   b. Create scheduled_pipeline_run (state = PENDING)
   c. Add to pipeline_execution_queue
   d. Calculate and update next_run_time
   ↓
4. Workers continuously poll:
   POST /api/v1/scheduler/process-queue
   ↓
5. Worker picks up next queued pipeline:
   - Claims from queue (atomic)
   - Executes pipeline
   - Updates state (PENDING → RUNNING → COMPLETED)
   - Updates customer usage counters
```

---

## Manual Testing Guide

### Test 1: Customer Onboarding

```bash
# 1. Onboard customer
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "test_customer",
    "company_name": "Test Corp",
    "admin_email": "test@example.com",
    "subscription_plan": "PROFESSIONAL"
  }'

# Expected: 200 OK with API key

# 2. Verify customer created
bq query --use_legacy_sql=false \
  "SELECT customer_id, company_name, subscription_plan, status
   FROM \`gac-prod-471220.customers_metadata.customer_profiles\`
   WHERE customer_id = 'test_customer'"

# Expected: One row with status = 'ACTIVE'
```

### Test 2: Add Credentials

```bash
# 1. Add GCP credentials
curl -X POST "http://localhost:8080/api/v1/customers/test_customer/credentials" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GCP",
    "credential_type": "SERVICE_ACCOUNT",
    "credential_name": "GCP Billing",
    "credentials": {...},
    "project_id": "test-gcp-project"
  }'

# Expected: 200 OK

# 2. Verify credentials encrypted
bq query --use_legacy_sql=false \
  "SELECT credential_id, provider, credential_name
   FROM \`gac-prod-471220.customers_metadata.customer_cloud_credentials\`
   WHERE customer_id = (
     SELECT customer_id FROM \`gac-prod-471220.customers_metadata.customer_profiles\`
     WHERE tenant_dataset_id = 'test_customer'
   )"

# Expected: One row, encrypted_credentials is BYTES
```

### Test 3: Configure Pipeline Schedule

```bash
# 1. Create pipeline configuration
curl -X POST "http://localhost:8080/api/v1/scheduler/customer/test_customer/pipelines" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GCP",
    "domain": "COST",
    "pipeline_template": "cost_billing",
    "schedule_cron": "0 2 * * *",
    "timezone": "UTC",
    "is_active": true
  }'

# Expected: 200 OK with config_id and next_run_time

# 2. Verify configuration created
bq query --use_legacy_sql=false \
  "SELECT config_id, pipeline_template, schedule_cron, next_run_time
   FROM \`gac-prod-471220.customers_metadata.customer_pipeline_configs\`
   WHERE customer_id = (
     SELECT customer_id FROM \`gac-prod-471220.customers_metadata.customer_profiles\`
     WHERE tenant_dataset_id = 'test_customer'
   )"

# Expected: One row with next_run_time calculated
```

### Test 4: Trigger Scheduler

```bash
# 1. Manually trigger scheduler
curl -X POST "http://localhost:8080/api/v1/scheduler/trigger" \
  -H "X-Admin-Key: admin_key_12345"

# Expected: { "triggered_count": X, "queued_count": X }

# 2. Verify scheduled runs created
bq query --use_legacy_sql=false \
  "SELECT run_id, state, scheduled_time
   FROM \`gac-prod-471220.customers_metadata.scheduled_pipeline_runs\`
   WHERE DATE(scheduled_time) = CURRENT_DATE()
   ORDER BY created_at DESC
   LIMIT 10"

# Expected: Rows with state = 'PENDING' or 'SCHEDULED'
```

### Test 5: Process Queue

```bash
# 1. Process one item from queue
curl -X POST "http://localhost:8080/api/v1/scheduler/process-queue" \
  -H "X-Admin-Key: admin_key_12345"

# Expected: Pipeline execution details

# 2. Verify state transition
bq query --use_legacy_sql=false \
  "SELECT run_id, state, updated_at
   FROM \`gac-prod-471220.customers_metadata.scheduled_pipeline_runs\`
   ORDER BY updated_at DESC
   LIMIT 1"

# Expected: state = 'RUNNING' or 'COMPLETED'
```

### Test 6: Quota Enforcement

```bash
# 1. Set low quota for testing
bq query --use_legacy_sql=false \
  "UPDATE \`gac-prod-471220.customers_metadata.customer_subscriptions\`
   SET max_pipelines_per_day = 1
   WHERE customer_id = (
     SELECT customer_id FROM \`gac-prod-471220.customers_metadata.customer_profiles\`
     WHERE tenant_dataset_id = 'test_customer'
   )"

# 2. Run pipeline until quota exceeded
curl -X POST "http://localhost:8080/api/v1/pipelines/run/test_customer/gcp/example/dryrun" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-17", "trigger_by": "manual"}'

# First run: 200 OK
# Second run: 429 Too Many Requests - Quota exceeded
```

---

## Pipeline Execution Within Limits

### Pre-Execution Validation

```
Step 1: Authenticate API Key
  Query: customers_metadata.customer_api_keys
  ↓
Step 2: Verify Customer Status
  Check: customer_profiles.status = 'ACTIVE'
  → If SUSPENDED: HTTP 403 "Account suspended"
  ↓
Step 3: Check Daily Quota
  Query: customer_usage.pipelines_run_today
  Check: pipelines_run_today < subscription.max_pipelines_per_day
  → If exceeded: HTTP 429 "Daily quota exceeded"
  ↓
Step 4: Check Monthly Quota
  Query: customer_usage.pipelines_run_month
  Check: pipelines_run_month < subscription.max_pipelines_per_month
  → If exceeded: HTTP 429 "Monthly quota exceeded"
  ↓
Step 5: Check Concurrent Limit
  Query: customer_usage.concurrent_pipelines_running
  Check: concurrent_running < subscription.max_concurrent_pipelines
  → If exceeded: HTTP 429 "Concurrent limit reached"
  ↓
Step 6: Execute Pipeline
```

### Example Execution

```bash
# Execute pipeline with quota checks
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/acme_corp/gcp/cost/cost_billing" \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-17",
    "trigger_by": "scheduler"
  }'
```

### Quota Error Responses

#### Daily Quota Exceeded
```json
{
  "detail": "Daily pipeline quota exceeded. Used 25/25 pipelines today.",
  "customer_id": "acme_corp",
  "quota_reset_time": "2025-11-18T00:00:00Z",
  "status_code": 429
}
```

#### Monthly Quota Exceeded
```json
{
  "detail": "Monthly pipeline quota exceeded. Used 750/750 pipelines this month.",
  "customer_id": "acme_corp",
  "quota_reset_date": "2025-12-01",
  "status_code": 429
}
```

#### Concurrent Limit Reached
```json
{
  "detail": "Concurrent pipeline limit reached. 5/5 pipelines currently running.",
  "customer_id": "acme_corp",
  "status_code": 429
}
```

### Usage Tracking

```sql
-- Check current usage
SELECT
  usage_date,
  pipelines_run_today,
  pipelines_run_month,
  concurrent_pipelines_running,
  daily_limit,
  monthly_limit,
  concurrent_limit
FROM `gac-prod-471220.customers_metadata.customer_usage`
WHERE customer_id = (
  SELECT customer_id FROM `gac-prod-471220.customers_metadata.customer_profiles`
  WHERE tenant_dataset_id = 'acme_corp'
)
ORDER BY usage_date DESC
LIMIT 1;
```

---

## Complete Flow Documentation

### End-to-End Flow: From Signup to Pipeline Execution

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Customer Signup (Frontend → Stripe)                │
└─────────────────────────────────────────────────────────────┘

1. User signs up on frontend
2. Selects subscription plan (STARTER, PROFESSIONAL, SCALE)
3. Stripe checkout page
4. Payment success
5. Stripe webhook to backend

┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Customer Provisioning (Backend)                    │
└─────────────────────────────────────────────────────────────┘

6. POST /api/v1/customers/onboard
   - Create customer_profiles record
   - Generate and encrypt API key
   - Create customer_subscriptions record
   - Initialize customer_usage record
   - Create BigQuery dataset {customer_id}
   - Create metadata tables

7. Send welcome email with API key (shown once!)

┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Credentials Setup (Customer → Frontend)            │
└─────────────────────────────────────────────────────────────┘

8. Customer adds cloud credentials via frontend
   POST /api/v1/customers/{id}/credentials
   - Credentials encrypted with KMS
   - Stored in customer_cloud_credentials

9. Customer configures provider settings
   POST /api/v1/customers/{id}/provider-configs
   - Source project, dataset, notification emails

┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: Pipeline Scheduling (Customer → Frontend)          │
└─────────────────────────────────────────────────────────────┘

10. Customer enables pipelines with schedules
    POST /api/v1/scheduler/customer/{id}/pipelines
    - Pipeline template, cron schedule, timezone
    - Creates customer_pipeline_configs record
    - Calculates next_run_time

┌─────────────────────────────────────────────────────────────┐
│ PHASE 5: Automated Execution (Cloud Scheduler → Workers)    │
└─────────────────────────────────────────────────────────────┘

11. Cloud Scheduler triggers hourly
    POST /api/v1/scheduler/trigger
    - Queries pipelines where next_run_time <= NOW()
    - Checks quota available
    - Creates scheduled_pipeline_runs (state = PENDING)
    - Adds to pipeline_execution_queue
    - Updates next_run_time

12. Workers poll continuously
    POST /api/v1/scheduler/process-queue
    - Claims next queued item (atomic)
    - Validates quota (pre-execution)
    - Gets credentials (decrypts from KMS)
    - Executes pipeline
    - Updates state (PENDING → RUNNING → COMPLETED)
    - Increments usage counters
    - Logs to {customer_id}.x_meta_pipeline_runs

┌─────────────────────────────────────────────────────────────┐
│ PHASE 6: Results & Monitoring (Customer → Frontend)         │
└─────────────────────────────────────────────────────────────┘

13. Customer views pipeline runs
    GET /api/v1/customers/{id}/pipelines
    - Lists all pipeline executions
    - Status, duration, errors

14. Customer views usage statistics
    GET /api/v1/customers/{id}/usage
    - Pipelines run today/month
    - Quota remaining
    - Concurrent pipelines
```

---

## Troubleshooting

### Issue: Tenant Account Inactive

**Error**: `HTTP 403 - Tenant account is inactive`

**Solution**:
```sql
-- Check status
SELECT status, created_at
FROM `gac-prod-471220.customers_metadata.customer_profiles`
WHERE tenant_dataset_id = '{customer_id}';

-- Reactivate
UPDATE `gac-prod-471220.customers_metadata.customer_profiles`
SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP()
WHERE tenant_dataset_id = '{customer_id}';
```

### Issue: Monthly Quota Exceeded

**Error**: `HTTP 429 - Monthly pipeline quota exceeded`

**Solutions**:
1. **Upgrade Plan** (via re-onboarding or Stripe webhook)
2. **Wait for Reset** (1st of next month, automatic)
3. **Manual Reset** (admin only):
```sql
UPDATE `gac-prod-471220.customers_metadata.customer_usage`
SET pipelines_run_month = 0
WHERE customer_id = '{customer_id}'
  AND usage_date = CURRENT_DATE();
```

### Issue: Concurrent Limit Reached

**Error**: `HTTP 429 - Concurrent pipeline limit reached`

**Solution**:
```sql
-- Check actual running pipelines
SELECT COUNT(*) as actual_running
FROM `gac-prod-471220.{customer_id}.x_meta_pipeline_runs`
WHERE status IN ('PENDING', 'RUNNING');

-- Recalculate counter if mismatch
UPDATE `gac-prod-471220.customers_metadata.customer_usage`
SET concurrent_pipelines_running = (
  SELECT COUNT(*)
  FROM `gac-prod-471220.{customer_id}.x_meta_pipeline_runs`
  WHERE status IN ('PENDING', 'RUNNING')
)
WHERE customer_id = '{customer_id}'
  AND usage_date = CURRENT_DATE();
```

### Issue: Pipeline Not Triggering

**Diagnosis**:
```sql
-- 1. Check pipeline is active
SELECT config_id, is_active, next_run_time
FROM `gac-prod-471220.customers_metadata.customer_pipeline_configs`
WHERE customer_id = '{customer_id}';

-- 2. Check scheduler has run recently
SELECT MAX(created_at) as last_trigger
FROM `gac-prod-471220.customers_metadata.scheduled_pipeline_runs`;

-- 3. Check for errors
SELECT run_id, state, error_message
FROM `gac-prod-471220.customers_metadata.scheduled_pipeline_runs`
WHERE state = 'FAILED'
ORDER BY created_at DESC
LIMIT 10;
```

### Issue: API Key Not Working

**Error**: `401 Unauthorized`

**Solutions**:
1. Verify API key format: `{customer_id}_api_{16_random_chars}`
2. Check API key is active:
```sql
SELECT api_key_id, is_active, expires_at
FROM `gac-prod-471220.customers_metadata.customer_api_keys`
WHERE customer_id = '{customer_id}';
```
3. Regenerate API key by re-onboarding

---

## Monitoring Queries

### Pipelines Due Now
```sql
SELECT
  c.customer_id,
  c.pipeline_template,
  c.next_run_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), c.next_run_time, MINUTE) as minutes_late
FROM `gac-prod-471220.customers_metadata.customer_pipeline_configs` c
JOIN `gac-prod-471220.customers_metadata.customer_profiles` p
  ON c.customer_id = p.customer_id
WHERE c.is_active = TRUE
  AND p.status = 'ACTIVE'
  AND c.next_run_time <= CURRENT_TIMESTAMP()
ORDER BY c.next_run_time;
```

### Currently Running Pipelines
```sql
SELECT
  r.customer_id,
  r.config_id,
  r.state,
  r.scheduled_time,
  r.actual_start_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.actual_start_time, MINUTE) as running_minutes
FROM `gac-prod-471220.customers_metadata.scheduled_pipeline_runs` r
WHERE r.state = 'RUNNING'
ORDER BY r.actual_start_time;
```

### Success Rate (Last 7 Days)
```sql
SELECT
  customer_id,
  COUNT(*) as total_runs,
  SUM(CASE WHEN state = 'COMPLETED' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN state = 'FAILED' THEN 1 ELSE 0 END) as failed,
  ROUND(100.0 * SUM(CASE WHEN state = 'COMPLETED' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM `gac-prod-471220.customers_metadata.scheduled_pipeline_runs`
WHERE scheduled_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY customer_id
ORDER BY total_runs DESC;
```

---

## Security Best Practices

1. **API Keys**
   - Generated once, never retrievable
   - SHA256 hashed for lookup
   - KMS encrypted for storage
   - Rotate every 90 days

2. **Credentials**
   - KMS encryption before storage
   - Decryption only server-side
   - Never exposed in API responses
   - Separate credential per provider

3. **Tenant Isolation**
   - Separate BigQuery datasets
   - API key scoped to customer
   - No cross-tenant data access
   - Row-level security policies

4. **Quota Enforcement**
   - Checked before every pipeline run
   - Atomic counter updates
   - Daily/monthly automatic resets

---

## Reference Documentation

- **GENAI_SECURITY_PROOF.md** - Multi-tenant security validation
- **E2E_TEST_RESULTS_SECURITY_PROOF.md** - End-to-end test results
- **docs/architecture/CUSTOMER_MANAGEMENT.md** - Architecture details
- **docs/api/CUSTOMER_API_REFERENCE.md** - Complete API reference
- **docs/security/ENCRYPTION.md** - KMS encryption setup
- **src/core/scheduler/README.md** - Scheduler system documentation

---

**Version**: 1.0
**Last Updated**: November 2025
**Status**: Production Ready

For questions or support, contact the engineering team.
