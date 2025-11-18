# CLAUDE.md - Convergence Data Pipeline Project Mandates

## 🔒 CRITICAL PROJECT RULES (MANDATORY)

### 1. Configuration-Driven Architecture

**CORE PRINCIPLE**: All pipelines execute as YAML configurations, NOT hardcoded logic.

```
Frontend → API → Pipeline Config (YAML) → Processor Engine → BigQuery
                 ↑
        configs/gcp/cost/cost_billing.yml
```

### 2. API-Based Operations (NO Manual Execution)

**✅ DO:**
- Use API endpoints for all operations
- Bootstrap via `POST /admin/bootstrap` or `python deployment/setup_bigquery_datasets.py`
- Onboard tenants via `POST /api/v1/tenants/onboard`
- Execute pipelines via `POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}`

**❌ DON'T:**
- Execute manual SQL scripts directly
- Run tenant operations outside of API
- Create datasets/tables manually via BigQuery console
- Bypass API authentication

### 3. Documentation Structure (MANDATORY)

**✅ ALLOWED in root:**
- `CLAUDE.md` - Project mandates (this file)
- `README.md` - Project overview

**✅ ALL other docs in `docs/`:**
```
docs/
├── api/                    # API documentation
├── architecture/           # System architecture
├── guides/                 # Implementation guides
├── reference/              # Technical references
└── security/              # Security guidelines
```

**❌ FORBIDDEN:**
- `.md` files in root (except CLAUDE.md and README.md)
- Documentation in `tests/` folder
- Random doc files scattered in project

### 4. Parameterized Testing (MANDATORY)

**✅ ALL tests MUST use JSON configurations:**

```
tests/configs/
├── tenants/               # Tenant test configs
│   ├── tenant_test_config.json
│   ├── tenant_bootstrap_config.json
│   └── tenant_dryrun_config.json
├── pipelines/             # Pipeline test configs
│   └── pipeline_test_config.json
└── schemas/               # Schema validation configs
    └── schema_validation_config.json
```

**Test Pattern:**
```python
import json
import requests

# Load config
with open('tests/configs/tenants/tenant_test_config.json') as f:
    config = json.load(f)

# Use config data
for tenant in config['test_tenants']:
    response = requests.post(
        f"{API_BASE}/api/v1/tenants/onboard",
        json={
            "tenant_id": tenant['tenant_id'],
            "company_name": tenant['name'],
            "subscription_plan": tenant['subscription_tier']
        }
    )
```

**❌ NEVER:**
- Hardcode tenant data in test files
- Create manual test scripts without configs
- Skip JSON-based parameterization

### 5. Two-Dataset Architecture

**Central `tenants` Dataset** (shared across all tenants):
- `tenant_profiles` - Tenant metadata
- `tenant_api_keys` - API authentication
- `tenant_subscriptions` - Plan limits
- `tenant_usage_quotas` - Real-time tracking
- `tenant_cloud_credentials` - KMS-encrypted creds
- `tenant_pipeline_configs` - YAML configurations
- `x_meta_pipeline_runs` - Centralized execution logs

**Per-Tenant Datasets** (`{tenant_id}`):
- `x_meta_step_logs` - Step-level logs
- `x_meta_dq_results` - Data quality results
- Data tables (gcp_cost_billing, etc.)

### 6. Schema Management

**✅ CORRECT Approach:**
- Schema definitions in `ps_templates/setup/initial/schemas/*.json`
- Table creation via API bootstrap
- Programmatic creation through `OnetimeBootstrapProcessor`

**❌ INCORRECT:**
- ~~Use Alembic migrations~~ (NO ALEMBIC IN THIS PROJECT)
- ~~Create from database dumps~~
- ~~Manual SQL execution~~

**Schema Recreation Process:**
1. Schema deletion allowed if needed
2. Recreation MUST be via API bootstrap: `POST /admin/bootstrap` with `force_recreate_tables: true`
3. Schema source: `ps_templates/setup/initial/schemas/` JSON files
4. NO manual SQL, NO dumps, NO Alembic

### 7. Dry-Run Testing

**✅ Configuration Location:**
```
configs/setup/dryrun/
├── tenants/
├── pipelines/
└── validation/
```

**✅ Execution Method:**
- Load configuration from `tests/configs/tenants/tenant_dryrun_config.json`
- Execute via test scripts that call API endpoints
- Verify in BigQuery

**❌ FORBIDDEN:**
- Manual dry-run execution
- Hardcoded dry-run values
- Bypassing API endpoints

---

## 📋 Real Project Practices

### Bootstrap Process

**One-Time System Bootstrap:**
```bash
# Method 1: Direct Python script
python deployment/setup_bigquery_datasets.py

# Method 2: API endpoint
curl -X POST http://localhost:8080/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'
```

Creates:
- Central `tenants` dataset
- 8 management tables
- Proper IAM bindings

### Tenant Onboarding

**Via API (CORRECT):**
```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "guru_232342",
    "company_name": "Guru Corp",
    "admin_email": "admin@guru.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

Creates:
- Tenant profile in `tenants.tenant_profiles`
- API key in `tenants.tenant_api_keys`
- Subscription in `tenants.tenant_subscriptions`
- Quotas in `tenants.tenant_usage_quotas`
- Tenant dataset `{tenant_id}`
- Metadata tables in tenant dataset

### Pipeline Execution

**Manual Execution (Real-Time Sync):**
```bash
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}
# Maps to: configs/{provider}/{domain}/{template}.yml
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/v1/pipelines/run/guru_232342/gcp/cost/cost_billing \
  -H "X-API-Key: sk_guru_232342_xxxxx" \
  -d '{"date": "2025-11-17"}'
```

**Scheduled Execution (Offline Sync):**
```bash
POST /api/v1/scheduler/configs
Body: {
  "pipeline_config": "gcp/cost/cost_billing",
  "schedule": "0 2 * * *"
}
```

### Variable Substitution

**Pipeline YAML supports variables:**
```yaml
pipeline_id: "{tenant_id}_gcp_cost_billing"
description: "Extract billing for {tenant_id}"
variables:
  source_table: "billing_export"
  destination_dataset_type: "gcp_silver_cost"
steps:
  - step_id: "extract"
    ps_type: "gcp.bq_etl"
    source:
      query: "SELECT * FROM {source_table} WHERE date='{date}'"
```

**Variables replaced at runtime:**
- `{tenant_id}` - From execution context
- `{date}` - From request parameters
- `{admin_email}` - From tenant profile
- Custom variables from YAML `variables` section

---

## 🧪 Testing Standards

### Test File Structure

```python
#!/usr/bin/env python3
"""
Test Description

This script tests:
1. Feature A via API
2. Feature B with config
3. Verification in BigQuery
"""
import requests
import json
from google.cloud import bigquery

# Load config
with open('tests/configs/tenants/tenant_test_config.json') as f:
    config = json.load(f)

API_BASE = "http://localhost:8080"
PROJECT_ID = "gac-prod-471220"

# Test functions
def test_feature():
    for tenant in config['test_tenants']:
        response = requests.post(
            f"{API_BASE}/api/v1/tenants/onboard",
            json={...}
        )
        # Verify in BigQuery
        client = bigquery.Client(project=PROJECT_ID)
        # ...
```

### Test Execution

```bash
# Run test
python tests/test_tenant_onboarding.py

# Run with pytest
pytest tests/test_tenant_onboarding.py -v
```

---

## ❌ Common Mistakes to Avoid

### 1. ~~Using Alembic~~
**WRONG:** This project does NOT use Alembic
**RIGHT:** Use API bootstrap for schema management

### 2. ~~CI/CD Pipelines for Bootstrapping~~
**WRONG:** There are no CI/CD pipelines for tenant operations
**RIGHT:** Use API endpoints directly

### 3. ~~Manual SQL Execution~~
**WRONG:** Running SQL scripts directly in BigQuery
**RIGHT:** Use API endpoints that execute programmatically

### 4. ~~Hardcoding Test Data~~
**WRONG:** Tenant data hardcoded in test files
**RIGHT:** Load from JSON configs in `tests/configs/`

### 5. ~~Database Dumps~~
**WRONG:** Using `pg_dump` or BQ exports for schema recreation
**RIGHT:** Use API bootstrap with `force_recreate_tables: true`

---

## ✅ Compliance Checklist

Before ANY commit, verify:

- [ ] All tenant operations via API endpoints
- [ ] No manual SQL execution
- [ ] All docs in `docs/` folder (except CLAUDE.md/README.md)
- [ ] Test configs are JSON files in `tests/configs/`
- [ ] Tests load configs, not hardcode data
- [ ] Pipeline configurations are YAML in `configs/`
- [ ] No Alembic references
- [ ] No CI/CD pipeline assumptions

---

## 🔍 Architecture Summary

**Configuration-Driven**: Pipelines = YAML configs, not code
**API-Based**: All operations through FastAPI endpoints
**Multi-Tenant**: Two-dataset model (central + per-tenant)
**Real-Time + Scheduled**: Sync modes for pipeline execution
**Quota Enforced**: Tenant-level quotas, user-level audit
**Parameterized Testing**: JSON-driven test configurations

---

*Version: 2.0.0*
*Last Updated: 2025-11-18*
*Based on actual project architecture and documentation*
