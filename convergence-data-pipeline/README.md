# Convergence Data Pipeline

**Multi-tenant data pipeline backend for cloud cost and compliance analytics**

[![Production Ready](https://img.shields.io/badge/status-production--ready-success)]()
[![Security](https://img.shields.io/badge/security-KMS%20encrypted-blue)]()
[![Tests](https://img.shields.io/badge/tests-30%20test%20cases-brightgreen)]()

**Version**: 1.1.0 | **Status**: Production Ready ✅

---

## 📖 Overview

Convergence Data Pipeline is an enterprise-grade, configuration-driven multi-tenant backend service for processing cloud cost, security, and compliance data across GCP, AWS, and Azure. Built on FastAPI and BigQuery, it provides complete tenant isolation, automated pipeline execution, and comprehensive audit trails.

### Key Features

- **🔒 Multi-Tenant Architecture** - Complete data isolation with per-tenant BigQuery datasets
- **⚙️ Configuration-Driven Pipelines** - All pipelines defined as YAML configurations (no hardcoded logic)
- **🔐 Enterprise Security** - KMS encryption, SHA256 hashed API keys, role-based access control
- **📊 Subscription Management** - Flexible plans with quota enforcement (STARTER, PROFESSIONAL, SCALE)
- **🚀 Dual Execution Modes** - Real-time (API-triggered) and scheduled (Cloud Scheduler) pipeline runs
- **📈 Complete Audit Trail** - Centralized logging with user_id tracking for compliance

### Architecture Components

```
Frontend → API Gateway → FastAPI Backend → BigQuery
                            ↓
                    Pipeline Engine (YAML configs)
                            ↓
                Cloud KMS (encryption) + Secret Manager (credentials)
                            ↓
                    GCP/AWS/Azure Data Sources
```

---

## 🏗️ Core Architecture Philosophy

### ⚠️ CRITICAL: This is NOT a Real-Time API

**Convergence is a Pipeline-as-Code System** - ALL operations are scheduled jobs, NOT real-time requests.

### Pipeline Execution Model

**Scheduler-Driven Architecture**:
- **Primary Execution**: Cloud Scheduler checks `tenant_scheduled_pipeline_runs` table for due pipelines
- **Authentication**: Scheduler uses **Admin API Key** to trigger pipeline runs
- **Manual Triggers**: Tenants (users) can trigger pipelines manually from frontend by passing:
  - `X-API-Key` (tenant API key)
  - Pipeline configuration details
  - Execution parameters

**Pipeline Run Flow**:
```
┌─────────────────────────────────────────────────────────┐
│ Cloud Scheduler (Cron/Cloud Scheduler)                  │
│ → Queries: tenant_scheduled_pipeline_runs               │
│ → Auth: X-Admin-Key                                     │
│ → Triggers: Due pipeline runs                           │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Pipeline Execution Queue                                │
│ → Table: tenant_pipeline_execution_queue                │
│ → Status: pending → running → completed/failed          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Processors (Core Logic)                                 │
│ → Configs: configs/                                     │
│ → Templates: ps_templates/                              │
│ → Code: src/core/processors/                            │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Results Storage                                         │
│ → Logs: tenant_step_logs                                │
│ → Runs: tenant_pipeline_runs                            │
│ → DQ: tenant_dq_results                                 │
└─────────────────────────────────────────────────────────┘
```

### Everything is Pipeline-as-Code

**ALL operations are pipelines** managed via `configs/`, `ps_templates/`, and `processors/`:

| Operation | Type | Pipeline Config | Processor |
|-----------|------|-----------------|-----------|
| **Bootstrap** | System setup | `configs/system/dataset_types.yml` | `src/core/processors/setup/initial/onetime_bootstrap_processor.py` |
| **Tenant Onboarding** | Tenant creation | `configs/tenant/onboarding.yml` | `src/core/processors/setup/tenants/onboarding.py` |
| **Cost Pipeline** | Provider data | `ps_templates/gcp/cost/cost_export.yml` | `src/core/processors/providers/gcp/cost_processor.py` |
| **Billing Pipeline** | Provider data | `ps_templates/gcp/billing/billing_export.yml` | `src/core/processors/providers/gcp/billing_processor.py` |
| **KMS Management** | Security | `ps_templates/gcp/kms/manage_kms_keys.yml` | `src/core/processors/security/kms_processor.py` |

### Core Components (Heart of the System)

**DO NOT DEVIATE FROM THIS ARCHITECTURE**:

1. **`configs/`** - Pipeline configuration files (YAML)
   - System configs: `configs/system/*.yml`
   - Tenant configs: `configs/tenant/*.yml`
   - Provider configs: `configs/providers/{gcp,aws,azure}/*.yml`

2. **`ps_templates/`** - Pipeline step templates (YAML)
   - GCP pipelines: `ps_templates/gcp/{cost,billing,kms}/`
   - AWS pipelines: `ps_templates/aws/`
   - Azure pipelines: `ps_templates/azure/`
   - Custom pipelines: `ps_templates/custom/`

3. **`src/core/processors/`** - Pipeline execution logic (Python)
   - Setup processors: `processors/setup/{initial,tenants}/`
   - Provider processors: `processors/providers/{gcp,aws,azure}/`
   - Security processors: `processors/security/`
   - Custom processors: `processors/custom/`

### Development Guidelines

**When adding new functionality**:
1. ✅ **DO**: Create a new processor in `src/core/processors/`
2. ✅ **DO**: Define pipeline config in `configs/`
3. ✅ **DO**: Add step templates in `ps_templates/`
4. ❌ **DON'T**: Add real-time API endpoints for data processing
5. ❌ **DON'T**: Bypass the pipeline execution model
6. ❌ **DON'T**: Add custom logic outside processors

**Example - Adding New Provider Pipeline**:
```yaml
# 1. Config: configs/providers/custom/new_provider.yml
pipeline_name: "custom_provider_pipeline"
schedule: "0 2 * * *"  # Daily at 2 AM
processor: "custom.new_provider_processor"

# 2. Template: ps_templates/custom/new_provider.yml
steps:
  - name: "extract_data"
    type: "extract"
  - name: "transform_data"
    type: "transform"
  - name: "load_data"
    type: "load"

# 3. Processor: src/core/processors/custom/new_provider_processor.py
class NewProviderProcessor(BaseProcessor):
    def execute(self):
        # Implementation
        pass
```

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites

- Python 3.11+
- Docker installed and running
- Google Cloud SDK (gcloud) installed and authenticated
- GCP Project with BigQuery and Cloud KMS enabled
- Service account with necessary permissions

### Step 1: Generate Admin API Key

```bash
cd cloudact-backend-systems
python3 scripts/generate_admin_key.py

# Export the generated key
export ADMIN_API_KEY='admin_<your-generated-key>'
```

### Step 2: Configure Environment

```bash
# Set GCP credentials
export GCP_PROJECT_ID='gac-prod-471220'
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'
export ENVIRONMENT='development'

# Optional: KMS configuration (for API key encryption)
export GCP_KMS_KEY_NAME='projects/gac-prod-471220/locations/us-central1/keyRings/convergence-keyring-dev/cryptoKeys/api-key-encryption'
```

### Step 3: Install Dependencies & Start Server

```bash
cd convergence-data-pipeline
pip install -r requirements.txt

# Start FastAPI server
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 4: Deployment

We use a simple script to build locally and deploy to Cloud Run.

**Deploy to Staging:**
```bash
cd cloudact-backend-systems
./simple_deploy.sh stage
```

**Deploy to Production:**
```bash
cd cloudact-backend-systems
./simple_deploy.sh prod
```

**Monitor Deployment:**
```bash
cd cloudact-backend-systems
./monitor_deploy.sh stage  # or prod
```

### Step 4: Bootstrap System (One-Time)

```bash
# Initialize central tenants dataset and management tables
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'
```

**Expected Response:**
```json
{
  "status": "SUCCESS",
  "dataset_created": true,
  "tables_created": 11,
  "message": "Bootstrap completed successfully"
}
```

### Step 5: Create Your First Tenant

```bash
# Create tenant
curl -X POST http://localhost:8000/api/v1/admin/tenants \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "acmecorp",
    "description": "Acme Corporation"
  }'

# Generate tenant API key (SAVE THIS - shown only once!)
curl -X POST http://localhost:8000/api/v1/admin/api-keys \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "acmecorp",
    "description": "Production API key"
  }'
```

**Response (save the `api_key`):**
```json
{
  "api_key": "sk_acmecorp_xY9kL2mP4qR8vT...",
  "tenant_api_key_hash": "8f3e2d1c...",
  "tenant_id": "acmecorp",
  "created_at": "2025-11-19T00:00:00Z"
}
```

### Step 6: Execute Your First Pipeline

```bash
export TENANT_API_KEY='sk_acmecorp_...'

curl -X POST http://localhost:8000/api/v1/pipelines/run/acmecorp/gcp/cost/cost_billing \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TENANT_API_KEY" \
  -d '{"date": "2025-11-19"}'
```

### Step 7: Run Tests

```bash
# Local development tests (10 test cases)
export API_URL='http://localhost:8000'
./tests/local_test_suite.sh

# Expected: ✅ 10/10 tests passed
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[DEVELOPMENT.md](./DEVELOPMENT.md)** | Architecture, local setup, testing, troubleshooting |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Infrastructure setup, staging/production deployment |
| **[API.md](./API.md)** | Complete API reference and integration guide |
| **[SECURITY.md](./convergence-data-pipeline/docs/security/SECURITY.md)** | Security architecture and best practices |
| **[CLAUDE.md](./CLAUDE.md)** | Development session history and context |

---

## 🏗️ System Architecture

### Multi-Tenancy Model

```
┌─────────────────────────────────────────────────────────┐
│           Central "tenants" Dataset (Shared)             │
├─────────────────────────────────────────────────────────┤
│  • tenant_profiles         (company metadata)            │
│  • tenant_api_keys         (SHA256 hashed, KMS encrypted)│
│  • tenant_subscriptions    (plan limits & quotas)        │
│  • tenant_usage_quotas     (real-time tracking)          │
│  • tenant_cloud_credentials (KMS encrypted)              │
│  • tenant_pipeline_configs  (scheduled cron jobs)        │
│  • tenant_pipeline_runs     (centralized execution logs) │
│  • tenant_step_logs         (detailed step logs)         │
│  • tenant_dq_results        (data quality results)       │
└─────────────────────────────────────────────────────────┘

              ↓ Complete Isolation ↓

┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│ Dataset: tenant1_local   │  │ Dataset: tenant2_stage   │  │ Dataset: tenant3_prod    │
├──────────────────────────┤  ├──────────────────────────┤  ├──────────────────────────┤
│ • gcp_cost_*             │  │ • gcp_cost_*             │  │ • gcp_cost_*             │
│ • aws_cost_*             │  │ • aws_cost_*             │  │ • aws_cost_*             │
│ • azure_cost_*           │  │ • azure_cost_*           │  │ • azure_cost_*           │
│ • custom views           │  │ • custom views           │  │ • custom views           │
└──────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘
```

**DATASET NAMING STANDARD**:
- Format: `{tenant_id}_{environment}`
- Environment mapping: `development`→`local`, `staging`→`stage`, `production`→`prod`
- Examples: `sri_482433_local`, `sri_482433_stage`, `sri_482433_prod`
- **Purpose**: Enable multi-environment deployments in same GCP project
- **Scope**: BigQuery datasets ONLY (not file paths or API endpoints)

### Configuration-Driven Pipeline Execution

**All pipelines are YAML configurations** - no hardcoded pipeline logic!

```yaml
# Example: configs/gcp/cost/cost_billing.yml
pipeline_id: "{tenant_id}_gcp_cost_billing"
description: "Extract GCP billing costs"

variables:
  source_billing_table: "project.dataset.gcp_billing_export"
  destination_dataset_type: "tenant_dataset"
  destination_table: "gcp_cost_billing"

steps:
  - step_id: "extract_billing_costs"
    ps_type: "gcp.bq_etl"
    source:
      query: "SELECT * FROM `{source_billing_table}` WHERE date='{date}'"
    destination:
      dataset_type: "{destination_dataset_type}"
      table: "{destination_table}"
      write_mode: "append"
```

### Tenant vs User

| Concept | Definition | Scope | Quotas |
|---------|------------|-------|--------|
| **tenant_id** | Organization identifier | Business entity, subscription, datasets | ✅ Enforced |
| **user_id** | Individual user UUID | Audit logging only | ❌ Not enforced |

**Key**: Quotas and limits are enforced at **tenant level**. User IDs are for audit trails only.

---

## 🔑 Authentication & Authorization

### Admin Authentication

**Used for**: System bootstrap, tenant management, API key generation

```bash
# All admin endpoints require X-Admin-Key header
curl -X POST http://localhost:8000/api/v1/admin/tenants \
  -H "X-Admin-Key: admin_..." \
  -H 'Content-Type: application/json'
```

**Admin Endpoints:**
- `POST /api/v1/admin/bootstrap` - Initialize system
- `POST /api/v1/admin/tenants` - Create tenant
- `POST /api/v1/admin/api-keys` - Generate tenant API key
- `GET /api/v1/admin/tenants/{tenant_id}` - Get tenant details
- `DELETE /api/v1/admin/api-keys/{hash}` - Revoke API key

### Tenant Authentication

**Used for**: Pipeline execution, tenant operations

```bash
# Tenant endpoints require X-API-Key header
curl -X POST http://localhost:8000/api/v1/pipelines/run/{tenant_id}/gcp/cost/billing \
  -H "X-API-Key: sk_{tenant_id}_..." \
  -H 'Content-Type: application/json'
```

**How It Works:**
1. Client sends `X-API-Key: sk_acmecorp_xY9k...`
2. Backend creates SHA256 hash: `hashlib.sha256(api_key.encode()).hexdigest()`
3. Query `tenants.tenant_api_keys` for matching hash
4. Verify `is_active = TRUE` and `expires_at > NOW()`
5. Return authenticated tenant context

**API Key Format:**
```
sk_{tenant_id}_{32_random_chars}
```

**Storage:**
- `tenant_api_key_hash` (STRING) - SHA256 hash for fast lookup
- `encrypted_tenant_api_key` (BYTES) - KMS encrypted for recovery
- `is_active` (BOOL) - Active/revoked status
- `expires_at` (TIMESTAMP) - Optional expiration

---

## 📊 Subscription Plans

| Plan | Daily Pipelines | Monthly Pipelines | Concurrent Runs |
|------|----------------|-------------------|-----------------|
| **STARTER** | 6 | 180 | 1 |
| **PROFESSIONAL** | 25 | 750 | 3 |
| **SCALE** | 100 | 3000 | 10 |

**Quota Enforcement:**
- Checked before every pipeline execution
- Returns `429 Too Many Requests` if exceeded
- Daily quotas reset at midnight UTC
- Monthly quotas reset on subscription anniversary

---

## 🔄 Data Flows

### Flow 1: Manual Pipeline Execution (Real-Time Sync)

```
User/Frontend → API Request
        ↓
    Authenticate (X-API-Key → tenant_id)
        ↓
    Check Subscription Status (ACTIVE/TRIAL)
        ↓
    Check Quotas (daily/monthly/concurrent limits)
        ↓
    Load Pipeline Config (/configs/{provider}/{domain}/{pipeline}.yml)
        ↓
    Execute Pipeline Steps (processors)
        ↓
    Log Execution (tenant_pipeline_runs)
        ↓
    Update Quotas (increment pipelines_run_today)
        ↓
    Return pipeline_logging_id
```

### Flow 2: Scheduled Pipeline Execution (Offline/Batch Sync)

**Cloud Scheduler Jobs:**

1. **Hourly Trigger** (`0 * * * *`)
   - `POST /api/v1/scheduler/trigger`
   - Query `tenant_pipeline_configs` for due pipelines
   - Insert into `tenant_pipeline_execution_queue`
   - Update `next_run_time` based on cron expression

2. **Queue Processor** (`*/5 * * * *`)
   - `POST /api/v1/scheduler/process-queue`
   - Get next QUEUED pipeline (priority order)
   - Execute pipeline asynchronously
   - Update status: COMPLETED/FAILED
   - Remove from queue on success

3. **Daily Quota Reset** (`0 0 * * *`)
   - `POST /api/v1/scheduler/reset-daily-quotas`
   - Reset `pipelines_run_today = 0` for all tenants
   - Cleanup old records (>90 days)

---

## 🧪 Testing Strategy

### Test Suites (30 Tests Total)

**1. Local Test Suite** (`tests/local_test_suite.sh`) - 10 tests
```bash
export ADMIN_API_KEY='your-admin-key'
export API_URL='http://localhost:8000'
./tests/local_test_suite.sh
```

**Tests:**
- Health endpoint
- Bootstrap system
- Tenant CRUD operations
- API key generation/revocation
- Pipeline execution
- Quota enforcement
- Error handling

**2. Staging Test Suite** (`tests/staging_test_suite.sh`) - 10 tests
```bash
export STAGING_URL='https://staging-url.run.app'
export ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-staging)
./tests/staging_test_suite.sh
```

**Tests:**
- TLS/HTTPS validation
- KMS encryption/decryption
- Multi-tenant isolation
- Performance benchmarks
- Cloud Scheduler integration

**3. Production Test Suite** (`tests/production_test_suite.sh`) - 10 tests
```bash
export PROD_URL='https://prod-url.run.app'
export ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-prod)
./tests/production_test_suite.sh
```

**Tests (non-destructive):**
- Health checks
- API availability
- Rate limiting
- Security validation
- SLA monitoring

---

## 🐛 Troubleshooting

### Common Issues

**1. Bootstrap Error: Dataset Already Exists**
```bash
# Force recreate tables only (keeps dataset)
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": true}'
```

**2. KMS Encryption Timeout**
```bash
# Check KMS permissions
gcloud kms keys get-iam-policy api-key-encryption \
  --location=us-central1 \
  --keyring=convergence-keyring-dev \
  --project=gac-prod-471220

# Expected: Service account should have cloudkms.cryptoKeyEncrypterDecrypter role
```

**3. API Key Authentication Fails**
```bash
# Verify API key exists and is active
SELECT tenant_id, is_active, expires_at, last_used_at
FROM `gac-prod-471220.tenants.tenant_api_keys`
WHERE tenant_id = 'acmecorp'
AND is_active = TRUE;
```

**4. Permission Denied in BigQuery**
```bash
# Grant service account necessary roles
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member="serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```

**5. View Logs for Debugging**
```bash
# Local development
tail -f logs/convergence-data-pipeline.log

# Cloud Run (production)
gcloud run services logs read convergence-api-prod \
  --region=us-central1 \
  --limit=100 \
  --filter='severity>=ERROR'
```

---

## 📁 Project Structure

```
cloudact-backend-systems/
├── convergence-data-pipeline/
│   ├── src/
│   │   ├── app/
│   │   │   ├── main.py                 # FastAPI app entry point
│   │   │   ├── routers/
│   │   │   │   ├── admin.py            # Admin endpoints
│   │   │   │   ├── tenants.py          # Tenant onboarding
│   │   │   │   ├── pipelines.py        # Pipeline execution
│   │   │   │   └── scheduler.py        # Cloud Scheduler integration
│   │   │   └── dependencies/
│   │   │       └── auth.py             # Authentication logic
│   │   ├── core/
│   │   │   ├── processors/             # Pipeline processors
│   │   │   │   ├── setup/initial/      # Bootstrap processor
│   │   │   │   ├── setup/tenants/      # Onboarding processor
│   │   │   │   └── gcp/cost/           # GCP cost processors
│   │   │   ├── pipeline/               # Pipeline engine
│   │   │   ├── scheduler/              # Scheduler logic
│   │   │   └── security/               # KMS encryption
│   │   └── configs/
│   │       ├── setup/                  # Bootstrap configs
│   │       ├── gcp/cost/               # GCP pipeline configs
│   │       ├── aws/cost/               # AWS pipeline configs
│   │       └── azure/cost/             # Azure pipeline configs
│   ├── tests/
│   │   ├── local_test_suite.sh         # 10 local tests
│   │   ├── staging_test_suite.sh       # 10 staging tests
│   │   └── production_test_suite.sh    # 10 production tests
│   └── deployment/
│       └── cloudbuild.yaml             # Cloud Build config
├── scripts/
│   ├── generate_admin_key.py           # Admin key generator
│   └── setup_kms_infrastructure.py     # KMS setup automation
├── cloudact-infrastructure-scripts/
│   ├── 01-setup-project.sh
│   ├── 02-setup-kms.sh
│   ├── 03-setup-cloud-build.sh
│   └── 04-setup-cloud-run.sh
├── README.md                            # This file
├── DEVELOPMENT.md                       # Development guide
├── DEPLOYMENT.md                        # Deployment guide
├── API.md                               # API reference
└── CLAUDE.md                            # AI development context
```

---

## 📈 Recent Changes

### Version 1.1.0 (2025-11-19)

**Security Fixes:**
- ✅ Fixed 7 critical/high security vulnerabilities (SQL injection, plaintext storage, etc.)
- ✅ Added transaction cleanup for failed onboarding
- ✅ Implemented graceful error handling for dataset creation failures

**Schema Updates:**
- ✅ Renamed all API key fields with `tenant_` prefix for consistency
- ✅ Added `tenant_api_key_id` to audit logs for key rotation support

**Infrastructure:**
- ✅ Created KMS setup automation scripts for all environments
- ✅ Added comprehensive deployment documentation

**Testing:**
- ✅ Created 30-test suite across local/staging/production
- ✅ Validated bootstrap, onboarding, and cleanup logic

---

## 🎯 Next Steps

1. **Deploy KMS Infrastructure** (15 min)
   - Run `python3 scripts/setup_kms_infrastructure.py local` from Cloud Shell
   - Configure environment variables with KMS key paths

2. **Deploy to Staging** (30 min)
   - See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions
   - Run staging test suite for validation

3. **Production Deployment** (1 hour)
   - Review security checklist
   - Deploy with monitoring and alerting
   - Run non-destructive production tests

---

## 📞 Support & Contributing

**Documentation:**
- [Development Guide](./DEVELOPMENT.md) - Local setup and architecture
- [Deployment Guide](./DEPLOYMENT.md) - Infrastructure and deployment
- [API Reference](./API.md) - Complete API documentation
- [Security](./convergence-data-pipeline/docs/security/SECURITY.md) - Security architecture

**Getting Help:**
- Check troubleshooting section above
- Review logs for error messages
- Consult architecture documentation

---

**License**: Proprietary | **Maintainer**: CloudAct Team | **Status**: Production Ready ✅
