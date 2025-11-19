# Convergence Data Pipeline - Production Ready 🚀

**Configuration-driven** multi-tenant data pipeline backend for GCP, AWS, and Azure cloud cost and compliance data processing.

[![Production Ready](https://img.shields.io/badge/status-production--ready-success)](docs/DEPLOYMENT.md)
[![Security](https://img.shields.io/badge/security-KMS%20encrypted-blue)](docs/SECURITY.md)
[![Tests](https://img.shields.io/badge/tests-30%20test%20cases-brightgreen)](docs/TESTING.md)

## 📚 Documentation

- **[Deployment Guide](docs/DEPLOYMENT.md)** - Local, staging, and production deployment
- **[Testing Guide](docs/TESTING.md)** - Comprehensive test suites (local, staging, production)
- **[Admin Scripts](../scripts/README.md)** - Admin API key management
- **[Security Overview](../docs/security/SECURITY.md)** - Multi-tenant security architecture

## 🔑 Key Architecture: Configuration-Driven Pipelines

**All pipelines execute as YAML configurations** stored in `/configs/` directory. No hardcoded pipeline logic!

After successful tenant onboarding, pipelines run via:
- **Manual Execution**: Real-time sync through API calls from frontend systems
- **Scheduled Execution**: Offline/batch sync via Cloud Scheduler
- **Provider CRUD**: GCP/AWS/Azure credential management (sync or async)

```
Frontend → API → Pipeline Config (YAML) → Processor Engine → BigQuery
                 ↑
        configs/gcp/cost/cost_billing.yml
```

## ⚡ Quick Start

### 1. Generate Admin API Key
```bash
# Generate secure admin key (256-bit entropy)
python3 scripts/generate_admin_key.py

# Export for use
export ADMIN_API_KEY='admin_...'
```

### 2. Start API Server
```bash
# Configure environment
export GCP_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export ADMIN_API_KEY='admin_...'

# Start server
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Check health
curl http://localhost:8000/health
```

### 3. System Bootstrap (One-Time)

```bash
# Initialize central tenants dataset and management tables
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'
```

### 4. Create Your First Tenant

```bash
# Create tenant with BigQuery datasets
curl -X POST http://localhost:8000/api/v1/admin/tenants \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id": "acmecorp", "description": "Acme Corporation"}'

# Generate tenant API key
curl -X POST http://localhost:8000/api/v1/admin/api-keys \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id": "acmecorp", "description": "Production API key"}'
```

### 5. Execute Your First Pipeline
Run a pipeline for the onboarded tenant:
```bash
curl -X POST http://localhost:8000/api/v1/pipelines/run/acmecorp/gcp/cost/cost_billing \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_acmecorp_xxxxx" \
  -d '{"date": "2025-11-19"}'
```

### 6. Run Tests

```bash
# Local development tests (10 test cases)
export ADMIN_API_KEY='your-admin-key'
export API_URL='http://localhost:8000'
./tests/local_test_suite.sh

# Staging tests (10 integration tests)
export STAGING_URL='https://your-staging-url.com'
./tests/staging_test_suite.sh

# Production health checks (10 non-destructive tests)
export PROD_URL='https://your-production-url.com'
./tests/production_test_suite.sh
```

---

## 🔄 Post-Onboarding: Complete Tenant Lifecycle

After successful tenant onboarding, the system supports:

### 1. Provider Credential Management (CRUD)
```bash
# Add GCP credentials (real-time sync)
POST /api/v1/tenants/guru_232342/credentials
Body: {provider: "GCP", credentials: {project_id: "...", private_key: "..."}}

# Update credentials (offline sync)
PUT /api/v1/tenants/guru_232342/credentials/{credential_id}

# List all credentials
GET /api/v1/tenants/guru_232342/credentials

# Delete provider
DELETE /api/v1/tenants/guru_232342/credentials/{credential_id}
```

### 2. Pipeline Configuration & Execution

All pipelines are **YAML configurations** in `/configs/`:

```yaml
# Example: configs/gcp/cost/cost_billing.yml
pipeline_id: "{tenant_id}_gcp_cost_billing"
steps:
  - step_id: "extract"
    ps_type: "gcp.bq_etl"  # Maps to processor
    source:
      query: "SELECT * FROM billing WHERE date='{date}'"
```

**Execution Modes:**
- **Real-time Sync**: Immediate processing via API calls from frontend
- **Offline/Batch Sync**: Scheduled processing via Cloud Scheduler

### 3. Sync Patterns

**Real-Time Sync** (Frontend → API → Immediate Execution):
```
POST /api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing
                                               ↑
                     Points to: configs/gcp/cost/cost_billing.yml
```

**Offline Sync** (Frontend → Queue → Scheduler → Batch Execution):
```
POST /api/v1/scheduler/configs
Body: {pipeline_config: "gcp/cost/cost_billing", schedule: "0 2 * * *"}
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
Logs to: tenants.tenant_pipeline_runs (with user_id for audit)
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

### Bootstrap Approach

The system uses **API-based bootstrap** and **pipeline-driven execution**:

**PRODUCTION**:
1. **System Bootstrap** (one-time):
   - `POST /admin/bootstrap`
   - Creates central `tenants` dataset with 11 management tables
   - Executes pipeline: `configs/setup/bootstrap_system.yml`

2. **Tenant Onboarding** (per-tenant):
   - `POST /api/v1/tenants/onboard`
   - Creates tenant profile, API key, subscription, quotas, and tenant-specific dataset
   - Executes pipeline: `configs/setup/tenants/onboarding.yml`
   - Full end-to-end via API

**TESTING** (to validate processors):
- Bootstrap: `python tests/test_bootstrap_setup.py`
- Onboarding: `python tests/test_config_tenant_onboarding.py`

**Note**: SQL files in `src/core/database/schemas/` are reference implementations only. All infrastructure is created programmatically via pipeline processors.

### Two-Dataset Model

**1. Central `tenants` Dataset** (shared across all tenants)

*Management Tables (tenant_* prefix):*
- tenant_profiles
- tenant_api_keys (SHA256-hashed)
- tenant_subscriptions (plan limits)
- tenant_usage_quotas (real-time tracking)
- tenant_cloud_credentials (KMS-encrypted)
- tenant_pipeline_configs (cron schedules)
- tenant_scheduled_pipeline_runs
- tenant_pipeline_execution_queue

*Execution Logs (tenant_* prefix - centralized):*
- **tenant_pipeline_runs** - Pipeline execution logs (ALL tenants)
- **tenant_step_logs** - Step execution logs (ALL tenants)
- **tenant_dq_results** - Data quality results (ALL tenants)

**2. Per-Tenant Datasets** (`{tenant_id}`)
- **tenant_comprehensive_view** - Comprehensive view (queries central tables, filters by tenant_id)
- Data tables (gcp_cost_billing, aws_cost_billing, etc.)
- Optional validation/test tables

**KEY**: ALL metadata tables (`tenant_*`) are in central dataset for centralized logging/monitoring. Each tenant gets a comprehensive VIEW in their dataset that queries central tables.

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
- [ ] Bootstrap system: `POST /admin/bootstrap`
- [ ] Verify 11 management tables created successfully in `tenants` dataset
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

### Production API Testing
Test the production endpoints with real API calls:

**1. Test Bootstrap**:
```bash
curl -X POST http://localhost:8080/admin/bootstrap
```

**2. Test Tenant Onboarding**:
```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "guru_232342",
    "company_name": "Guru Corporation",
    "admin_email": "admin@guru.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**3. Test Pipeline Execution**:
```bash
curl -X POST http://localhost:8080/api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_guru_232342_xxxxx" \
  -d '{"date": "2025-11-17"}'
```

### Processor Testing (Development Only)
Test individual processors in isolation:

**1. Test Bootstrap Processor**:
```bash
python tests/test_bootstrap_setup.py
```

**2. Test Onboarding Processor**:
```bash
python tests/test_config_tenant_onboarding.py
```

**3. Test Pipeline Execution**:
```bash
python tests/test_config_pipeline_execution.py
```

**Note**: Test scripts validate processor logic only. Production deployments should use API endpoints.

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

**Core API:**
- `src/app/main.py` - FastAPI app
- `src/app/routers/tenants.py` - Tenant onboarding endpoint (`POST /api/v1/tenants/onboard`)
- `src/app/routers/pipelines.py` - Pipeline execution endpoint (`POST /api/v1/pipelines/run/...`)
- `src/app/routers/scheduler.py` - Cloud Scheduler integration
- `src/app/routers/admin.py` - Admin tenant management endpoints

**Bootstrap & Setup:**
- `deployment/setup_bigquery_datasets.py` - One-time system bootstrap (creates 'tenants' dataset + 8 tables)
- `src/core/processors/setup/initial/` - Bootstrap processor for system initialization
- `.env` - Environment configuration

**Database Schemas (Legacy - SQL only, not used by API):**
- `src/core/database/schemas/tenants_dataset.sql` - Full schema definition
- `src/core/database/schemas/tenant_dataset.sql` - Per-tenant dataset template
- `deployment/migrate_tenant_usage_quotas.sql` - Migration script

**Documentation:**
- `README.md` - This file
- `COMPLETE_FLOWS.md` - Detailed flow diagrams
- `TESTING_STRATEGY.md` - Test consolidation

---

**Version**: 1.0.0 | **Status**: Production Ready (pending BigQuery setup)
