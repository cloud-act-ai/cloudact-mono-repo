# Convergence Data Pipeline - Production Ready 🚀

Multi-tenant data pipeline backend for GCP, AWS, and Azure cloud cost and compliance data processing.

## ⚡ Quick Start

### 1. Start API Server
```bash
# Start server
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080 --reload

# Check health
curl http://localhost:8080/health
```

### 2. Setup BigQuery (One-Time)
```bash
python setup_bigquery_datasets.py  # Creates 'tenants' dataset + 8 tables
```

### 3. Test with 10 Tenants
```bash
python test_10_tenants.py  # Tests onboarding for 10 different tenants
```

---

## 📋 Complete Data Flows

### Flow 1: Cloud Provider Credential Setup

**Context**: Called AFTER subscription onboarding. Tenant profile already exists.

```
PREREQUISITE: Subscription onboarding complete
  ✓ tenant_id, tenant_profiles, tenant_subscriptions, tenant_api_keys exist
              ↓
POST /api/v1/tenants/{tenant_id}/credentials
Headers: X-API-Key, X-User-ID
Body: {provider: "GCP", credentials: {...}}
              ↓
Authenticate → Encrypt Credentials → Create Dataset → Create Tables
              ↓
Response: {tenant_id, provider, action: "CREATED", dataset_status}
```

### Flow 2: Manual Pipeline Execution

**Context**: User triggers pipeline via API. Quotas enforced at tenant level.

```
POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/billing
Headers: X-API-Key, X-User-ID
Body: {date: "2025-11-17"}
              ↓
Authenticate (API Key → tenant_id) → Check Quota → Execute Pipeline
              ↓
Logs to: {tenant_id}.x_meta_pipeline_runs (with user_id for audit)
              ↓
Increment Quota: UPDATE tenant_usage_quotas SET pipelines_run_today + 1
              ↓
Response: {pipeline_logging_id, status: "RUNNING"}
```

### Flow 3: Scheduled Pipeline Execution

**Context**: Cloud Scheduler triggers pipelines (HTTP calls, NOT Pub/Sub).

**Job 1: Hourly Trigger** (0 * * * *)
```
POST /api/v1/scheduler/trigger
  → Query tenant_pipeline_configs (is_active AND next_run_time <= NOW)
  → INSERT INTO scheduled_pipeline_runs, pipeline_execution_queue
  → UPDATE next_run_time (from cron expression)
  → Response: {triggered_count, queued_count}
```

**Job 2: Queue Processor** (*/5 * * * *)
```
POST /api/v1/scheduler/process-queue
  → Get next QUEUED pipeline (ORDER BY priority DESC)
  → Execute AsyncPipelineExecutor (user_id = NULL)
  → On success: UPDATE state=COMPLETED, DELETE from queue
  → On failure: Retry or remove based on retry_count
```

**Job 3: Daily Quota Reset** (0 0 * * *)
```
POST /api/v1/scheduler/reset-daily-quotas
  → UPDATE tenant_usage_quotas SET pipelines_run_today = 0
  → DELETE old records (>90 days)
```

---

## 🏗️ Architecture

### Two-Dataset Model

**1. Central `tenants` Dataset** (shared across all tenants)
- tenant_profiles
- tenant_api_keys (SHA256-hashed)
- tenant_subscriptions (plan limits)
- tenant_usage_quotas (real-time tracking)
- tenant_cloud_credentials (KMS-encrypted)
- tenant_pipeline_configs (cron schedules)
- scheduled_pipeline_runs
- pipeline_execution_queue

**2. Per-Tenant Datasets** (`{tenant_id}`)
- x_meta_pipeline_runs (tenant_id + user_id)
- x_meta_step_logs
- x_meta_dq_results
- Data tables (gcp_cost_billing, etc.)

### Tenant vs User

| Concept | Scope | Quotas | Purpose |
|---------|-------|--------|---------|
| tenant_id | Organization | ✓ Enforced | Business entity |
| user_id | Individual | ✗ Logging only | Audit trail |

**Key**: Quotas enforced at tenant level, user_id for tracking only.

---

## 🔌 API Endpoints

### Core
- `GET /health` - Health check
- `POST /api/v1/tenants/onboard` - Onboard tenant
- `POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}` - Execute pipeline

### Scheduler (Admin Only)
- `POST /api/v1/scheduler/trigger` - Trigger due pipelines
- `POST /api/v1/scheduler/process-queue` - Process next queued pipeline
- `POST /api/v1/scheduler/reset-daily-quotas` - Reset daily counters
- `GET /api/v1/scheduler/status` - Scheduler metrics

### Tenant Config
- `GET /api/v1/scheduler/customer/{tenant_id}/pipelines` - List configs
- `POST /api/v1/scheduler/customer/{tenant_id}/pipelines` - Create config
- `DELETE /api/v1/scheduler/customer/{tenant_id}/pipelines/{config_id}` - Delete config

---

## 📊 Subscription Plans

| Plan | Daily | Monthly | Concurrent |
|------|-------|---------|------------|
| STARTER | 6 | 180 | 1 |
| PROFESSIONAL | 25 | 750 | 3 |
| SCALE | 100 | 3000 | 10 |

---

## 🚨 Production Checklist

### 1. BigQuery Setup (CRITICAL)
- [ ] Create `tenants` dataset: `python setup_bigquery_datasets.py`
- [ ] Verify 8 tables created successfully
- [ ] Grant service account permissions:
  - `bigquery.datasets.create`
  - `bigquery.tables.create`
  - `bigquery.tables.getData`
  - `bigquery.tables.updateData`
  - `cloudkms.cryptoKeys.encrypt`
  - `cloudkms.cryptoKeys.decrypt`

### 2. Environment Setup
- [ ] Copy `.env.example` to `.env`
- [ ] Set `GCP_PROJECT_ID=gac-prod-471220`
- [ ] Set `GOOGLE_APPLICATION_CREDENTIALS` path
- [ ] Set `ADMIN_API_KEY` for scheduler
- [ ] Configure CORS origins (JSON array format)

### 3. Cloud Scheduler Jobs
Create 3 jobs with target URLs pointing to Cloud Run service:
- [ ] Hourly trigger: `0 * * * *` → `/api/v1/scheduler/trigger`
- [ ] Queue processor: `*/5 * * * *` → `/api/v1/scheduler/process-queue`
- [ ] Daily reset: `0 0 * * *` → `/api/v1/scheduler/reset-daily-quotas`

### 4. Cloud Run Deployment
- [ ] Deploy with `deployment/cloudbuild.yaml`
- [ ] Set environment variables
- [ ] Configure health checks
- [ ] Enable auto-scaling

---

## 🧪 Testing

### Run All Tests
```bash
# Test 10 tenants
python test_10_tenants.py

# Manual API test
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"test_001","company_name":"Test Corp","admin_email":"test@test.com","subscription_plan":"PROFESSIONAL"}'
```

---

## 🐛 Troubleshooting

**Server won't start**
```
Error: SettingsError: error parsing value for field "cors_origins"
Fix: Update .env with JSON arrays: CORS_ORIGINS=["http://localhost:3000"]
```

**Dataset not found**
```
Error: 404 Not found: Dataset gac-prod-471220:tenants was not found
Fix: Run python setup_bigquery_datasets.py
```

**Permission denied**
```
Error: 403 User does not have bigquery.datasets.create permission
Fix: Grant service account bigquery.dataEditor role
```

---

## ✅ Current Status

**WORKING:**
- ✓ API server running
- ✓ Health endpoint responding
- ✓ Authentication system ready
- ✓ Multi-tenant architecture implemented
- ✓ Scheduler endpoints implemented
- ✓ Test scripts ready

**NEEDS SETUP:**
- ⚠️ BigQuery tenants dataset (requires permissions)
- ⚠️ Cloud Scheduler jobs
- ⚠️ Cloud Run deployment

---

## 📁 Key Files

**Core:**
- `src/app/main.py` - FastAPI app
- `src/app/routers/tenants.py` - Tenant onboarding
- `src/app/routers/pipelines.py` - Pipeline execution
- `src/app/routers/scheduler.py` - Cloud Scheduler integration

**Setup:**
- `setup_bigquery_datasets.py` - Initialize BigQuery
- `test_10_tenants.py` - Test with 10 tenants
- `.env` - Environment configuration

**Docs:**
- `README.md` - This file
- `COMPLETE_FLOWS.md` - Detailed flow diagrams
- `TESTING_STRATEGY.md` - Test consolidation

---

**Version**: 1.0.0 | **Status**: Production Ready (pending BigQuery setup)
