# CLAUDE.md - Convergence Data Pipeline Project Mandates

## 🔒 KEEP IT SIMPLE - Core Architecture

### Pipeline Execution Flow (SCHEDULER-DRIVEN)

**Cloud Scheduler** → Checks tenants with pipelines DUE → Runs ALL pipelines for those tenants

```
Cloud Scheduler (hourly)
    ↓
POST /api/v1/scheduler/trigger
    ↓
Query: tenant_pipeline_configs WHERE is_active=TRUE AND next_run_time <= NOW
    ↓
For EACH tenant with due pipelines:
    → Queue ALL their pipelines
    → Run them via AsyncPipelineExecutor
    ↓
Logs to: tenants.tenant_pipeline_runs (centralized)
```

**NOT**: "Manual execution OR scheduler"
**IS**: Cloud Scheduler triggers, finds DUE tenants, runs ALL their pipelines

---

## 📋 Simple Operations

### 1. Bootstrap (ONE-TIME SETUP)

**PRODUCTION**:
```bash
POST /admin/bootstrap
```
Executes bootstrap pipeline: `configs/setup/bootstrap_system.yml`

**TESTING** (to validate bootstrap processor):
```bash
python tests/test_bootstrap_setup.py
```

**What it creates**: Central `tenants` dataset + 11 management tables:
- tenant_profiles, tenant_api_keys, tenant_subscriptions, tenant_usage_quotas
- tenant_cloud_credentials, tenant_pipeline_configs
- tenant_scheduled_pipeline_runs, tenant_pipeline_execution_queue
- tenant_pipeline_runs, tenant_step_logs, tenant_dq_results (centralized logging)

### 2. Onboard New Customer

**MANDATORY: Two-Step Process**

**Step 1: DRY-RUN VALIDATION** (ALWAYS run this first):
```bash
POST /api/v1/tenants/dryrun
Content-Type: application/json

{
  "tenant_id": "customer_id_123",
  "company_name": "Customer Company",
  "admin_email": "admin@customer.com",
  "plan_name": "ENTERPRISE"
}
```
Executes dry-run validation: `configs/setup/dryrun/dryrun.yml`

**Validates**:
- Tenant ID uniqueness and format
- Email format and domain validation
- Plan name validity (FREE, BASIC, PROFESSIONAL, ENTERPRISE)
- GCP project access and permissions
- BigQuery dataset creation permissions
- No actual resources created

**Step 2: ACTUAL ONBOARDING** (ONLY if dry-run passes):
```bash
POST /api/v1/tenants/onboard
Content-Type: application/json

{
  "tenant_id": "customer_id_123",
  "company_name": "Customer Company",
  "admin_email": "admin@customer.com",
  "plan_name": "ENTERPRISE"
}
```
Executes onboarding pipeline: `configs/setup/tenants/onboarding.yml`

**TESTING** (to validate processors):
```bash
# Test dry-run processor
python tests/test_config_dryrun_validation.py

# Test onboarding processor
python tests/test_config_tenant_onboarding.py
```

**What onboarding creates**:
- Tenant records in central `tenants` dataset (profile, API key, subscription, quotas)
- Per-tenant dataset: `{tenant_id}`
  - Validation table: onboarding_validation_test
  - **tenant_comprehensive_view** - Comprehensive view showing all pipeline details for this tenant (includes dry-run logs)

### 3. Run Pipelines (SCHEDULER-DRIVEN)

**Cloud Scheduler Jobs**:
1. **Hourly Trigger** (`0 * * * *`) → `POST /api/v1/scheduler/trigger`
2. **Queue Processor** (`*/5 * * * *`) → `POST /api/v1/scheduler/process-queue`
3. **Daily Reset** (`0 0 * * *`) → `POST /api/v1/scheduler/reset-daily-quotas`

---

## 🔍 Dry-Run Validation (MANDATORY Before Onboarding)

### Purpose
Validates tenant configuration and permissions WITHOUT creating any resources. Prevents onboarding failures and ensures clean rollback if issues are detected.

### What Dry-Run Checks

**Tenant Data Validation**:
- Tenant ID format (lowercase alphanumeric, hyphens, underscores only)
- Tenant ID uniqueness (not already exists)
- Email format and domain validation
- Plan name validity (must be: FREE, BASIC, PROFESSIONAL, ENTERPRISE)
- Company name presence and length

**GCP Permissions & Access**:
- BigQuery API access
- Dataset creation permissions in target GCP project
- Table creation permissions
- View creation permissions
- Service account authentication

**System State**:
- Central `tenants` dataset exists (bootstrap completed)
- Required management tables present
- No conflicting tenant records

### Why It's Mandatory

**Production Safety**:
- Catches configuration errors BEFORE resource creation
- Prevents partial onboarding states (all-or-nothing)
- Validates permissions before attempting operations
- Enables safe rollback if validation fails

**Cost Prevention**:
- No resources created = no cleanup needed
- No orphaned datasets or tables
- No wasted quota or billing

**Audit Trail**:
- All validation results logged to `tenant_pipeline_runs`
- Visible in `tenant_comprehensive_view` (if tenant exists)
- Troubleshooting support for failed validations

### How to Read Dry-Run Results

**Success Response**:
```json
{
  "status": "success",
  "validation_id": "dryrun_customer_id_123_20251118_143022",
  "tenant_id": "customer_id_123",
  "checks_passed": 12,
  "checks_failed": 0,
  "message": "All validations passed. Safe to proceed with onboarding.",
  "next_step": "POST /api/v1/tenants/onboard"
}
```

**Failure Response**:
```json
{
  "status": "failed",
  "validation_id": "dryrun_customer_id_123_20251118_143022",
  "tenant_id": "customer_id_123",
  "checks_passed": 10,
  "checks_failed": 2,
  "errors": [
    "Tenant ID 'customer_id_123' already exists",
    "Invalid email domain: must be corporate domain"
  ],
  "message": "Validation failed. Fix errors before onboarding.",
  "next_step": "Review errors and retry dry-run"
}
```

**Where to Find Logs**:
- Central dataset: `tenants.tenant_pipeline_runs` table
- Filter by: `pipeline_name = 'dryrun_validation'`
- Contains: All validation checks, results, timestamps, error messages

---

## 🏗️ Architecture (SIMPLE)

### Two Datasets

**1. Central `tenants` Dataset** (ONE dataset for ALL tenants)

*Management Tables (tenant_* prefix):*
- tenant_profiles - Tenant info
- tenant_api_keys - Authentication
- tenant_subscriptions - Plans/limits
- tenant_usage_quotas - Current usage
- tenant_cloud_credentials - Encrypted creds
- tenant_pipeline_configs - Which pipelines to run
- tenant_scheduled_pipeline_runs - Scheduler state
- tenant_pipeline_execution_queue - Execution queue

*Execution Logs (tenant_* prefix - centralized):*
- **tenant_pipeline_runs** - Pipeline execution logs
- **tenant_step_logs** - Step execution logs
- **tenant_dq_results** - Data quality results

**NAMING CONVENTION**:
- Central dataset: `tenant_*` prefix (ALL tables)
- Per-tenant datasets: Data tables ONLY (no metadata)

**2. Per-Tenant Datasets** (ONE per tenant: `{tenant_id}`)
- Data tables (gcp_cost_billing, etc.)
- **tenant_comprehensive_view** - View showing ALL pipeline execution details for this tenant only
- Optional validation/test tables

**KEY**:
- ALL metadata TABLES (`tenant_*`) are in CENTRAL dataset for centralized logging/monitoring
- Each tenant gets a COMPREHENSIVE VIEW in their dataset (queries central tables, filters by tenant_id)

---

## 📁 Configuration Structure

```
configs/
├── setup/
│   ├── bootstrap_system.yml          # Bootstrap pipeline
│   ├── tenants/onboarding.yml        # Onboarding pipeline
│   └── dryrun/dryrun.yml             # Dryrun validation
├── gcp/cost/cost_billing.yml         # GCP cost pipeline
└── {provider}/{domain}/{template}.yml # Other pipelines
```

All pipelines are YAML files. System loads and executes them.

---

## 🧪 Testing (JSON-DRIVEN)

### Test Configuration Location
```
tests/configs/
├── tenants/tenant_test_config.json
├── pipelines/pipeline_test_config.json
└── schemas/schema_validation_config.json
```

### Run Tests
```bash
# Test bootstrap
python tests/test_bootstrap_setup.py

# Test onboarding
python tests/test_config_tenant_onboarding.py

# Test pipelines
python tests/test_config_pipeline_execution.py
```

**All test data comes from JSON configs, NO hardcoding**

---

## 🚀 Deployment Environments

### Staging Environment
- **Project**: `gac-stage-471220` (GCP project for staging resources)
- **Service**: `convergence-pipeline-stage` (Cloud Run service in `gac-prod-471220`)
- **URL**: `https://convergence-pipeline-stage-820784027009.us-central1.run.app`
- **Deploy**: Push to `main` branch triggers GitHub Actions auto-deployment

### Production Environment
- **Project**: `gac-prod-471220` (GCP project for production resources)
- **Service**: `convergence-pipeline-prod` (Cloud Run service in `gac-prod-471220`)
- **URL**: `https://convergence-pipeline-prod-820784027009.us-central1.run.app`
- **Deploy**: Manual workflow dispatch or use `./deployment/deploy.sh production --cloud-build`

### Bootstrap Requirements
- **Staging ADMIN_API_KEY**: `cloudact_admin_1234` (testing only!)
- **Production ADMIN_API_KEY**: Generate secure key using `openssl rand -base64 32`
- **Bootstrap**: Run ONCE per environment via `POST /api/v1/admin/bootstrap` with `x-admin-key` header
- **Verify**: Check `bq ls <project>:tenants` shows 11 management tables

**See**: `docs/integration/DEPLOYMENT_INSTRUCTIONS.md` for complete deployment steps performed.

---

## ❌ Common Mistakes

### WRONG: tenant_pipeline_runs in per-tenant dataset
**Correct**: ONLY in central `tenants` dataset

### WRONG: Manual pipeline execution
**Correct**: Scheduler-driven - Cloud Scheduler triggers, finds due tenants, runs their pipelines

### WRONG: Running bootstrap manually via SQL
**Correct**:
- **Production**: `POST /admin/bootstrap`
- **Testing**: `python tests/test_bootstrap_setup.py`

### WRONG: Onboarding without dry-run validation
**Correct**:
- **Step 1**: `POST /api/v1/tenants/dryrun` (validate everything)
- **Step 2**: `POST /api/v1/tenants/onboard` (only if dry-run passes)

### WRONG: Confusing test scripts with production execution
**Correct**:
- **Production Dry-Run**: `POST /api/v1/tenants/dryrun` with tenant details
- **Production Onboarding**: `POST /api/v1/tenants/onboard` with tenant details
- **Testing Dry-Run**: `python tests/test_config_dryrun_validation.py` (validates processor only)
- **Testing Onboarding**: `python tests/test_config_tenant_onboarding.py` (validates processor only)

---

## ✅ Compliance Checklist

**Production Operations**:
- [ ] Bootstrap via `POST /admin/bootstrap`
- [ ] **MANDATORY: Dry-run validation** via `POST /api/v1/tenants/dryrun` BEFORE onboarding
- [ ] Onboarding via `POST /api/v1/tenants/onboard` (ONLY after dry-run passes)
- [ ] Cloud Scheduler configured for automatic pipeline execution

**Testing & Validation**:
- [ ] Test bootstrap processor: `python tests/test_bootstrap_setup.py`
- [ ] Test dry-run processor: `python tests/test_config_dryrun_validation.py`
- [ ] Test onboarding processor: `python tests/test_config_tenant_onboarding.py`
- [ ] All tests use JSON configs from `tests/configs/`

**Architecture**:
- [ ] ALL metadata tables (`tenant_*`) ONLY in central `tenants` dataset
- [ ] Each tenant gets `tenant_comprehensive_view` in their dataset (includes dry-run logs)
- [ ] All docs in `docs/` folder (except CLAUDE.md/README.md)

**Onboarding Workflow**:
- [ ] Step 1: Run dry-run validation for new tenant
- [ ] Step 2: Review dry-run results (all checks must pass)
- [ ] Step 3: Execute actual onboarding (only if dry-run succeeded)
- [ ] Step 4: Verify tenant in `tenant_comprehensive_view`

---

## 🎓 CRITICAL LEARNINGS - Pipeline Configuration

### Pipeline Config Schema (MANDATORY)

**Root Level Fields:**
- `pipeline_id` - MUST be at root level, NOT nested under `pipeline:`
- `description` - MUST be at root level

**Step Level Fields:**
- `step_id` - MUST use `step_id` NOT `id`
- `ps_type` - Processor type (e.g., `gcp.bq_etl`)

**Destination Config (BigQuery):**
- `bq_project_id` - Target project
- `dataset_type` - Dataset name (NOT `dataset_id`)
- `table` - Table name (NOT `table_id`)
- `write_mode` - Use lowercase: `append`, `truncate` (NOT `WRITE_APPEND`)

**Common Validation Errors:**
```
❌ WRONG: pipeline.id: "dryrun"
✅ CORRECT: pipeline_id: "dryrun"

❌ WRONG: steps[0].id: "step1"
✅ CORRECT: steps[0].step_id: "step1"

❌ WRONG: destination.dataset_id: "dataset"
✅ CORRECT: destination.dataset_type: "dataset"

❌ WRONG: destination.table_id: "table"
✅ CORRECT: destination.table: "table"
```

**Reference:** See `docs/PIPELINE_CONFIG_GUIDE.md` for complete guide

---

## 🐛 Debugging Onboarding Issues

**No Pipeline Data in tenant_comprehensive_view?**
- Cause: No successful pipelines have executed yet
- Solution: Run a pipeline for the tenant (scheduler or manual trigger)
- Note: Onboarding itself is NOT a pipeline, uses processor directly

**tenant_pipeline_runs Empty?**
- Check: Pipeline execution logs in application logs
- Check: Metadata logger is running (5 workers, 100 batch size)
- Check: BigQuery insert permissions

**"Field required" Validation Errors?**
- Check exact field path in error message
- Compare with working pipeline config in `configs/gcp/cost/cost_billing.yml`
- See `docs/PIPELINE_CONFIG_GUIDE.md` for field reference

---

*Version: 3.1.0 (PRODUCTION READY)*
*Last Updated: 2025-11-18*
*Core Principle: KEEP IT SIMPLE - Scheduler-driven pipeline execution*
*Pipeline Schema: VALIDATED & DOCUMENTED*
