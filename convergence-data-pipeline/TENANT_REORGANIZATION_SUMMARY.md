# Tenant Schema and Processor Reorganization - Summary

## ✅ Complete Reorganization Successfully!

### What Was Done

Reorganized tenant-specific schemas and processors from `customer/` to `setup/tenants/` to better reflect their purpose in the system architecture.

## Architecture Clarification

### Central `tenants` Dataset (System-Wide)
**Location**: Created by `setup.initial.onetime_bootstrap` processor
**Purpose**: Shared across ALL tenants

**Tables:**
- `tenant_profiles` - Master list of all tenants
- `tenant_api_keys` - All API keys with tenant_id reference
- `tenant_subscriptions` - Subscription plans
- `tenant_usage_quotas` - Usage tracking
- `tenant_cloud_credentials` - Cloud credentials
- `tenant_pipeline_configs` - Scheduled pipeline configs
- `scheduled_pipeline_runs` - Scheduled runs across all tenants
- `pipeline_execution_queue` - Execution queue

**Schema Location:** `ps_templates/setup/initial/schemas/`

### Per-Tenant Datasets (Tenant-Specific)
**Location**: Created in each `{tenant_id}` dataset (e.g., `acmeinc_23xv2`)
**Purpose**: Data and metadata specific to THAT tenant

**Tables** (x_meta_* prefix):
- `x_meta_pipeline_runs` - Execution logs for this tenant
- `x_meta_step_logs` - Step logs for this tenant
- `x_meta_dq_results` - Data quality results for this tenant
- `x_meta_pipeline_queue` - Execution queue for this tenant
- `x_meta_scheduled_runs` - Scheduled runs for this tenant
- `x_meta_onboarding_dryrun_test` - Onboarding validation test

**Schema Location:** `ps_templates/setup/tenants/onboarding/schemas/`

## Changes Made

### 1. Moved Templates ✅
```
FROM: ps_templates/tenant/onboarding/
TO:   ps_templates/setup/tenants/onboarding/
```

### 2. Moved Processor ✅
```
FROM: src/core/processors/customer/onboarding.py
TO:   src/core/processors/setup/tenants/onboarding.py
```

**Renamed class:**
- `CustomerOnboardingEngine` → `TenantOnboardingProcessor`

### 3. Updated Config Paths ✅

**File**: `src/app/config.py`
```python
# OLD
metadata_schemas_path = "ps_templates/customer/onboarding/schemas"

# NEW
metadata_schemas_path = "ps_templates/setup/tenants/onboarding/schemas"
```

### 4. Updated ps_type ✅

**File**: `ps_templates/setup/tenants/onboarding/config.yml`
```yaml
# OLD
ps_type: "customer.onboarding"
provider: "customer"
engine: "src.core.engines.customer.onboarding"

# NEW
ps_type: "setup.tenants.onboarding"
provider: "setup"
processor: "src.core.processors.setup.tenants.onboarding"
```

### 5. Updated Pipeline Configs ✅

**Files updated:**
- `configs/setup/tenants/onboarding.yml`
- `configs/gcp/example/dryrun.yml`

**Changed:**
```yaml
# OLD
ps_type: "customer.onboarding"

# NEW
ps_type: "setup.tenants.onboarding"
```

## Final Directory Structure

```
├── ps_templates/
│   └── setup/
│       ├── initial/                      # Central tenants dataset
│       │   ├── config.yml
│       │   └── schemas/                  # 8 central tables
│       │       ├── tenant_profiles.json
│       │       ├── tenant_api_keys.json
│       │       ├── tenant_subscriptions.json
│       │       ├── tenant_usage_quotas.json
│       │       ├── tenant_cloud_credentials.json
│       │       ├── tenant_pipeline_configs.json
│       │       ├── scheduled_pipeline_runs.json
│       │       └── pipeline_execution_queue.json
│       │
│       └── tenants/
│           └── onboarding/               # Per-tenant metadata
│               ├── config.yml
│               ├── schema.json           # Dryrun test table
│               └── schemas/              # 5 x_meta_* tables
│                   ├── x_meta_dq_results.json
│                   ├── x_meta_pipeline_queue.json
│                   ├── x_meta_pipeline_runs.json
│                   ├── x_meta_scheduled_runs.json
│                   └── x_meta_step_logs.json
│
├── src/core/processors/
│   └── setup/
│       ├── initial/
│       │   └── onetime_bootstrap_processor.py  # Creates central dataset
│       │
│       └── tenants/
│           └── onboarding.py                    # Creates per-tenant metadata
│
└── configs/
    └── setup/
        ├── bootstrap_system.yml           # Bootstrap central dataset
        └── tenants/
            └── onboarding.yml             # Tenant onboarding
```

## Tenant Metadata Schemas

The per-tenant `x_meta_*` tables created in each `{tenant_id}` dataset:

### 1. x_meta_pipeline_runs (15 fields)
- Tracks pipeline execution history
- Partitioned by `start_time` (daily)
- Clustered by `tenant_id`, `pipeline_id`, `status`

### 2. x_meta_step_logs (17 fields)
- Detailed step execution logs
- Partitioned by `start_time` (daily)
- Clustered by `pipeline_logging_id`, `status`

### 3. x_meta_dq_results (15 fields)
- Data quality validation results
- Partitioned by `ingestion_date` (daily)
- Clustered by `tenant_id`, `target_table`, `overall_status`

### 4. x_meta_pipeline_queue (9 fields)
- Execution queue for this tenant
- Similar to central `pipeline_execution_queue` but tenant-specific

### 5. x_meta_scheduled_runs (15 fields)
- Scheduled runs for this tenant
- Similar to central `scheduled_pipeline_runs` but tenant-specific

## No Duplicate Schemas

**Previously there was confusion about:**
- `tenant_api_keys` (central) vs `x_meta_api_keys` (per-tenant)
- `tenant_cloud_credentials` (central) vs `x_meta_cloud_credentials` (per-tenant)

**Clarification:**
- The per-tenant `x_meta_api_keys` and `x_meta_cloud_credentials` schemas **do NOT exist**
- These are managed centrally in the `tenants` dataset
- Only execution/logging metadata (`x_meta_pipeline_runs`, `x_meta_step_logs`, `x_meta_dq_results`) are per-tenant

## Verification Tests

### Test 1: Processor Initialization ✅
```bash
python -c "
from src.core.processors.setup.tenants.onboarding import TenantOnboardingProcessor
p = TenantOnboardingProcessor()
print('Template dir exists:', p.template_dir.exists())
print('Schema loaded:', len(p.schema_config.get('fields', [])), 'fields')
"
```

**Result:**
```
Template dir exists: True
Schema loaded: 3 fields
```

### Test 2: Schema Path ✅
```bash
python -c "
from src.app.config import get_settings
print('Metadata schemas path:', get_settings().metadata_schemas_path)
"
```

**Result:**
```
Metadata schemas path: ps_templates/setup/tenants/onboarding/schemas
```

### Test 3: Schemas Exist ✅
```bash
ls ps_templates/setup/tenants/onboarding/schemas/
```

**Result:**
```
x_meta_dq_results.json
x_meta_pipeline_queue.json
x_meta_pipeline_runs.json
x_meta_scheduled_runs.json
x_meta_step_logs.json
```

## Benefits of Reorganization

### 1. **Clearer Architecture**
- `setup/initial/` → System-wide central infrastructure
- `setup/tenants/` → Per-tenant setup and metadata

### 2. **Better Naming**
- "customer" implied external customers
- "tenant" is more accurate for multi-tenancy

### 3. **Consistent Structure**
- All setup-related processors under `setup/`
- Follows same pattern as `setup/initial/`

### 4. **No Confusion**
- Clear separation: central vs per-tenant
- No duplicate schema files
- Each has its purpose

## Backwards Compatibility

⚠️ **Breaking Changes:**
- Old `ps_type: "customer.onboarding"` will NOT work
- Must use `ps_type: "setup.tenants.onboarding"`
- Old processor path no longer exists

**Migration for existing pipelines:**
1. Update pipeline configs to use `setup.tenants.onboarding`
2. Update any hardcoded references to `customer.onboarding`

## Summary

✅ Templates moved to `ps_templates/setup/tenants/onboarding/`
✅ Processor moved to `src/core/processors/setup/tenants/onboarding.py`
✅ Config paths updated throughout system
✅ ps_type changed to `setup.tenants.onboarding`
✅ Pipeline configs updated
✅ All tests passing
✅ Clear separation: central vs per-tenant schemas

**Result:** Clean, organized structure that clearly distinguishes between:
- **Central tenant management** (`setup/initial/`)
- **Per-tenant metadata** (`setup/tenants/onboarding/`)
