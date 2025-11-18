# Documentation - Convergence Data Pipeline

**Configuration-Driven Multi-Tenant Data Pipeline Backend**

---

## 🔑 Core Architecture Principle

**All pipelines execute as YAML configurations**, not hardcoded logic. The system loads pipeline definitions from `/configs/` directory and executes them using reusable processors.

```
Frontend → API → Pipeline Config (YAML) → Processor Engine → BigQuery
                       ↑
              configs/gcp/cost/cost_billing.yml
```

---

## 📚 Documentation Structure

### Primary Documentation

1. **[architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)**
   - Complete system architecture
   - Single dataset per tenant design
   - Pipeline processors (ps_type)
   - Variable substitution patterns

2. **[Main README](../README.md)**
   - Quick start guide
   - API endpoints
   - Bootstrap instructions
   - Tenant lifecycle flows

### Subdirectory Documentation

- **api/** - API reference documentation
- **guides/** - Implementation guides
  - **[TESTING_GUIDE.md](guides/TESTING_GUIDE.md)** - JSON-based parameterized testing
  - **[QUICK_FIX_GUIDE.md](guides/QUICK_FIX_GUIDE.md)** - Common issue fixes
- **reference/** - Technical reference
  - **[TEST_RESULTS_SUMMARY.md](reference/TEST_RESULTS_SUMMARY.md)** - Test execution results
- **security/** - Security guidelines

---

## 🔄 Complete Tenant Lifecycle

### Phase 1: System Bootstrap (One-Time)
```bash
python deployment/setup_bigquery_datasets.py
```
Creates central `tenants` dataset with 8 management tables

### Phase 2: Tenant Onboarding
```bash
POST /api/v1/tenants/onboard
{
  "tenant_id": "guru_232342",
  "company_name": "Guru Corp",
  "subscription_plan": "SCALE"
}
```
Creates tenant dataset and metadata tables

### Phase 3: Provider Credentials (CRUD)
```bash
# Real-time sync
POST /api/v1/tenants/{tenant_id}/credentials
Body: {provider: "GCP", credentials: {...}}

# Offline sync via queue
POST /api/v1/tenants/{tenant_id}/credentials/queue
```

### Phase 4: Pipeline Execution

**Manual Execution** (Real-time sync from frontend):
```bash
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}
                                                          ↑
                                        Maps to: configs/{provider}/{domain}/{template}.yml
```

**Scheduled Execution** (Offline/batch sync):
```bash
POST /api/v1/scheduler/configs
Body: {
  "pipeline_config": "gcp/cost/cost_billing",
  "schedule": "0 2 * * *"
}
```

---

## 📁 Pipeline Configuration Example

All pipelines are YAML files in `/configs/`:

```yaml
# configs/gcp/cost/cost_billing.yml
pipeline_id: "{tenant_id}_gcp_cost_billing"
description: "Extract billing for {tenant_id}"
variables:
  source_table: "billing_export"
  destination_dataset_type: "gcp_silver_cost"
steps:
  - step_id: "extract"
    ps_type: "gcp.bq_etl"        # Processor type
    source:
      query: "SELECT * FROM {source_table} WHERE date='{date}'"
    destination:
      table: "billing_cost_daily"
  - step_id: "notify_failure"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"
    to_emails: ["{admin_email}"]
```

---

## 🎯 Key Concepts

### Configuration-Driven
- Pipelines defined as YAML configs, not code
- Add new pipelines by adding YAML files
- No code changes needed for new pipelines

### Multi-Tenant Architecture
- Single dataset per tenant: `{tenant_id}`
- Complete isolation between tenants
- Metadata tables prefixed with `x_meta_`

### Execution Modes
- **Real-time Sync**: Immediate processing via API
- **Offline Sync**: Batch processing via scheduler
- **Provider CRUD**: Sync or async credential management

### Variable Substitution
- `{tenant_id}` - Tenant identifier
- `{date}` - Execution date
- `{admin_email}` - From tenant profile
- Custom variables from pipeline config

---

## 📊 Dataset Structure

```
BigQuery Project (gac-prod-471220)
│
├── tenants/                    # Central management
│   ├── tenant_profiles
│   ├── tenant_api_keys
│   ├── tenant_subscriptions
│   └── tenant_usage_quotas
│
└── {tenant_id}/               # Per-tenant dataset
    ├── x_meta_pipeline_runs   # Metadata tables
    ├── x_meta_step_logs
    ├── x_meta_dq_results
    └── billing_cost_daily     # Data tables
```

---

## 🚀 Quick Reference

### System Bootstrap
```bash
python deployment/setup_bigquery_datasets.py
```

### API Server
```bash
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080
```

### Test Tenant: guru_232342
```bash
# Onboard
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -d '{"tenant_id":"guru_232342","company_name":"Guru Corp"}'

# Execute Pipeline
curl -X POST http://localhost:8080/api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing \
  -d '{"date":"2024-11-01"}'
```

---

**Version**: 3.0.0 | **Updated**: 2025-11-18