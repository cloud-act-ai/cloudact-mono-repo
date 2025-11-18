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

**Command**: Run bootstrap via test agent
```bash
python tests/test_bootstrap_setup.py
```

**What it does**: Executes `configs/setup/bootstrap_system.yml` pipeline
**Creates**: Central `tenants` dataset + 9 management tables

### 2. Onboard New Customer (VIA TEST)

**Command**: Run onboarding via test
```bash
python tests/test_config_tenant_onboarding.py
```

**What it does**: Executes `configs/setup/tenants/onboarding.yml` pipeline for each tenant in config
**Creates**:
- Tenant records in central `tenants` dataset
- Per-tenant dataset with:
  - Validation table (onboarding_validation_test)
  - **tenant_comprehensive_view** - Comprehensive view showing all pipeline details for this tenant

### 3. Run Pipelines (SCHEDULER-DRIVEN)

**Cloud Scheduler Jobs**:
1. **Hourly Trigger** (`0 * * * *`) → `POST /api/v1/scheduler/trigger`
2. **Queue Processor** (`*/5 * * * *`) → `POST /api/v1/scheduler/process-queue`
3. **Daily Reset** (`0 0 * * *`) → `POST /api/v1/scheduler/reset-daily-quotas`

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

## ❌ Common Mistakes

### WRONG: tenant_pipeline_runs in per-tenant dataset
**Correct**: ONLY in central `tenants` dataset

### WRONG: Manual pipeline execution
**Correct**: Scheduler-driven - Cloud Scheduler triggers, finds due tenants, runs their pipelines

### WRONG: Running bootstrap manually via SQL
**Correct**: Run via test agent: `python tests/test_bootstrap_setup.py`

### WRONG: Onboarding via direct API call
**Correct**: Run via test: `python tests/test_config_tenant_onboarding.py`

---

## ✅ Compliance Checklist

- [ ] Bootstrap via `python tests/test_bootstrap_setup.py`
- [ ] Onboarding via `python tests/test_config_tenant_onboarding.py`
- [ ] All tests use JSON configs from `tests/configs/`
- [ ] `tenant_pipeline_runs` ONLY in central dataset
- [ ] Cloud Scheduler configured for automatic pipeline execution
- [ ] All docs in `docs/` folder (except CLAUDE.md/README.md)

---

*Version: 3.0.0 (SIMPLIFIED)*
*Last Updated: 2025-11-18*
*Core Principle: KEEP IT SIMPLE - Scheduler-driven pipeline execution*
