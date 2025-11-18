# Testing Guide - Convergence Data Pipeline

## Overview

All tests in this project use **JSON-based parameterized configurations** and **API-driven execution**. This ensures consistency, reproducibility, and alignment with production architecture.

---

## Core Principles

### ✅ DO:
- Use JSON configuration files in `tests/configs/`
- Execute via API endpoints (no manual operations)
- Log to temporary folders (e.g., `/tmp/convergence-tests`)
- Verify results in BigQuery
- Follow configuration-driven approach

### ❌ DON'T:
- Hardcode tenant data in test files
- Execute manual SQL or scripts
- Create test logs in project directories
- Bypass API authentication
- Use Alembic or database dumps

---

## Test Configuration Structure

```
tests/
├── configs/
│   ├── tenants/
│   │   ├── tenant_test_config.json          # Tenant onboarding tests
│   │   ├── quota_test_config.json           # Quota enforcement tests
│   │   └── bootstrap_test_config.json       # Bootstrap validation tests
│   ├── pipelines/
│   │   └── pipeline_test_config.json        # Pipeline execution tests
│   └── schemas/
│       └── schema_validation_config.json    # Schema validation tests
└── test_*.py                                 # Test files (load configs)
```

---

## Available Test Cases

### 1. Tenant Onboarding Test
**File**: `tests/test_config_tenant_onboarding.py`
**Config**: `tests/configs/tenants/tenant_test_config.json`

**Tests**:
- Loading tenant config from JSON
- Onboarding tenants via `POST /api/v1/tenants/onboard`
- Verifying tenant creation in BigQuery `tenants.tenant_profiles`
- API key generation and validation
- Dataset and table creation

**Usage**:
```bash
python tests/test_config_tenant_onboarding.py
```

**Expected Output**:
- Colored console logs
- Temporary log file in `/tmp/convergence-tests/`
- BigQuery verification results
- Summary: Total/Success/Failed counts

---

### 2. Pipeline Execution Test
**File**: `tests/test_config_pipeline_execution.py`
**Config**: `tests/configs/pipelines/pipeline_test_config.json`

**Tests**:
- Loading pipeline config from JSON
- Retrieving tenant API key from BigQuery
- Executing pipeline via `POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}`
- Verifying execution in `tenants.tenant_pipeline_runs`
- Checking step logs in `{tenant_id}.tenant_step_logs`

**Usage**:
```bash
python tests/test_config_pipeline_execution.py
```

**Pipeline URL Pattern**:
```
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}
                                 ↓
Maps to: configs/{provider}/{domain}/{template}.yml
```

---

### 3. Quota Validation Test
**File**: `tests/test_config_quota_validation.py`
**Config**: `tests/configs/tenants/quota_test_config.json`

**Tests**:
- Daily quota limit enforcement (expect 429 responses when exceeded)
- Monthly quota accumulation across days
- Concurrent pipeline execution limits
- Quota table integrity (limits match subscription plans)
- Quota reset behavior

**Usage**:
```bash
python tests/test_config_quota_validation.py
```

**Subscription Plans Tested**:
- STARTER: 6 daily, 180 monthly, 1 concurrent
- PROFESSIONAL: 25 daily, 750 monthly, 3 concurrent
- SCALE: 100 daily, 3000 monthly, 10 concurrent

---

### 4. Schema Validation Test
**File**: `tests/test_config_schema_validation.py`
**Config**: `tests/configs/schemas/schema_validation_config.json`

**Tests**:
- Central tables schema validation (8 management tables)
- Per-tenant tables schema validation (metadata tables)
- Field existence, data types, and modes
- Schema matches `ps_templates/setup/initial/schemas/*.json`
- Uses BigQuery INFORMATION_SCHEMA

**Usage**:
```bash
# Validate central tables only
python tests/test_config_schema_validation.py

# Validate specific tenant
python tests/test_config_schema_validation.py --tenant-id guru_test_001

# Validate everything
python tests/test_config_schema_validation.py --all --verbose
```

---

### 5. Bootstrap Validation Test
**File**: `tests/test_config_bootstrap_validation.py`
**Config**: `tests/configs/tenants/bootstrap_test_config.json`

**Tests**:
- Central `tenants` dataset exists with correct location
- All 8 management tables exist
- Table schemas match template files in `ps_templates/`
- BigQuery client connectivity
- Bootstrap configuration integrity

**Usage**:
```bash
python tests/test_config_bootstrap_validation.py
```

**Expected Tables**:
- tenant_profiles
- tenant_api_keys
- tenant_subscriptions
- tenant_usage_quotas
- tenant_cloud_credentials
- tenant_pipeline_configs
- tenant_scheduled_pipeline_runs
- tenant_pipeline_runs

---

## Test Configuration Format

### Tenant Test Config Example
```json
{
  "description": "Tenant test configuration",
  "version": "1.0.0",
  "api_base": "http://localhost:8080",
  "project_id": "gac-prod-471220",
  "test_tenants": [
    {
      "tenant_id": "test_tenant_001",
      "company_name": "Test Corp",
      "admin_email": "admin@test.com",
      "subscription_plan": "PROFESSIONAL"
    }
  ],
  "test_settings": {
    "cleanup_after_test": true,
    "verify_in_bigquery": true,
    "timeout_seconds": 60,
    "temp_log_dir": "/tmp/convergence-tests"
  }
}
```

### Pipeline Test Config Example
```json
{
  "test_pipelines": [
    {
      "pipeline_name": "cost_billing",
      "provider": "gcp",
      "domain": "cost",
      "template": "cost_billing",
      "test_tenant_id": "test_tenant_001",
      "parameters": {
        "date": "2025-11-17",
        "admin_email": "admin@test.com"
      }
    }
  ]
}
```

---

## Test Execution Flow

### Standard Pattern:
1. **Load JSON Config** from `tests/configs/`
2. **Setup Temp Logs** in directory specified by config
3. **Execute API Calls** using `requests` library
4. **Verify in BigQuery** using `google.cloud.bigquery` client
5. **Log Results** to temp folder with timestamps
6. **Print Summary** with colored output (green=success, red=failure)
7. **Optional Cleanup** based on config settings

### Example Code Pattern:
```python
import json
import requests
from google.cloud import bigquery
from pathlib import Path

# Load config
CONFIG_FILE = Path(__file__).parent / "configs" / "tenants" / "tenant_test_config.json"
with open(CONFIG_FILE) as f:
    config = json.load(f)

# API call
for tenant in config['test_tenants']:
    response = requests.post(
        f"{config['api_base']}/api/v1/tenants/onboard",
        json={
            "tenant_id": tenant['tenant_id'],
            "company_name": tenant['company_name'],
            "subscription_plan": tenant['subscription_plan']
        },
        timeout=config['test_settings']['timeout_seconds']
    )

# BigQuery verification
client = bigquery.Client(project=config['project_id'])
query = f"""
    SELECT * FROM `{config['project_id']}.tenants.tenant_profiles`
    WHERE tenant_id = @tenant_id
"""
```

---

## Temporary Logs

All tests write logs to temporary folders (never to project directories).

**Default Location**: `/tmp/convergence-tests/`

**Log File Naming**: `test_{name}_{timestamp}.log`

**Log Contents**:
- Timestamp for each operation
- API request/response details
- BigQuery query results
- Error messages and stack traces
- Test summary statistics

**Example**:
```
[2025-11-18 12:55:30] [INFO] Loading config from tests/configs/tenants/tenant_test_config.json
[2025-11-18 12:55:30] [SUCCESS] Loaded config with 3 test tenants
[2025-11-18 12:55:31] [SUCCESS] Tenant onboarded: test_tenant_001
[2025-11-18 12:55:31] [SUCCESS] BigQuery verification passed
```

---

## BigQuery Verification

All tests verify results in BigQuery to ensure API operations actually worked.

### Central Tables:
- `tenants.tenant_profiles` - Tenant metadata
- `tenants.tenant_api_keys` - API keys (hashed)
- `tenants.tenant_subscriptions` - Subscription plans
- `tenants.tenant_usage_quotas` - Quota counters
- `tenants.tenant_pipeline_runs` - Pipeline executions

### Per-Tenant Tables:
- `{tenant_id}.tenant_step_logs` - Step execution logs
- `{tenant_id}.tenant_dq_results` - Data quality results

### Example Verification:
```python
def verify_tenant_in_bigquery(tenant_id, project_id):
    client = bigquery.Client(project=project_id)
    query = f"""
        SELECT tenant_id, company_name, status
        FROM `{project_id}.tenants.tenant_profiles`
        WHERE tenant_id = @tenant_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
        ]
    )
    result = client.query(query, job_config=job_config).result()
    return sum(1 for _ in result) > 0
```

---

## Adding New Tests

### 1. Create JSON Config
```bash
# Create config file
vi tests/configs/{category}/{name}_config.json
```

**Required Fields**:
- `description` - What this config tests
- `version` - Config version
- `api_base` - API server URL
- `project_id` - GCP project ID
- `test_settings` - Including `temp_log_dir`

### 2. Create Test File
```bash
# Create test file
vi tests/test_config_{name}.py
chmod +x tests/test_config_{name}.py
```

**Required Sections**:
- Load config from JSON
- Setup temp logs folder
- Execute API calls
- Verify in BigQuery
- Print results summary

### 3. Follow Naming Convention
- Config: `{category}_config.json`
- Test: `test_config_{name}.py`

### 4. Document in This Guide
Update this file with:
- Test description
- Config file location
- Usage examples
- Expected behavior

---

## Troubleshooting

### Test Fails to Load Config
**Error**: `FileNotFoundError: [Errno 2] No such file or directory: 'tests/configs/...'`

**Fix**: Ensure config file exists and path is correct
```bash
ls -la tests/configs/tenants/
```

### API Connection Refused
**Error**: `Connection refused: http://localhost:8080`

**Fix**: Start API server
```bash
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080
```

### BigQuery Permission Denied
**Error**: `403 User does not have bigquery.datasets.get permission`

**Fix**: Set proper credentials
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Quota Already Exceeded
**Error**: Test expects quota enforcement but tenant already exceeded

**Fix**: Reset quota or use fresh tenant
```sql
UPDATE `gac-prod-471220.tenants.tenant_usage_quotas`
SET pipelines_run_today = 0
WHERE tenant_id = 'test_tenant_001'
```

---

## Best Practices

1. **Always use JSON configs** - Never hardcode test data
2. **Use temp log folders** - Never log to project directories
3. **Verify in BigQuery** - Don't trust API responses alone
4. **Clean up test data** - Delete test tenants after completion (optional in config)
5. **Use meaningful IDs** - Prefix test tenants with `test_` or `config_test_`
6. **Check prerequisites** - Ensure API server is running and bootstrap is complete
7. **Test in isolation** - Each test should be independently runnable
8. **Document changes** - Update this guide when adding new tests

---

## Integration with CLAUDE.md

These tests enforce the project mandates defined in `CLAUDE.md`:

- **Configuration-Driven**: All tests use JSON configs
- **API-Based**: All operations via API endpoints
- **No Manual Execution**: Tests call APIs, not SQL/scripts
- **Temporary Logs**: Logs in `/tmp/`, not project directories
- **BigQuery Verification**: Tests verify actual database state
- **Parameterized**: Easy to add new test cases via JSON

---

## Quick Reference

| Test | Config | Purpose |
|------|--------|---------|
| test_config_tenant_onboarding.py | tenants/tenant_test_config.json | Tenant creation via API |
| test_config_pipeline_execution.py | pipelines/pipeline_test_config.json | Pipeline execution |
| test_config_quota_validation.py | tenants/quota_test_config.json | Quota enforcement |
| test_config_schema_validation.py | schemas/schema_validation_config.json | Schema integrity |
| test_config_bootstrap_validation.py | tenants/bootstrap_test_config.json | Bootstrap verification |

---

**Version**: 1.0.0
**Last Updated**: 2025-11-18
**Maintainer**: Development Team
