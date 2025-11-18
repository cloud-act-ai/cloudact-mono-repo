# Technical Reference

Consolidated technical specifications for the Convergence Data Pipeline.

---

## 1. Environment Variables

### Core Configuration
```bash
# GCP
GCP_PROJECT_ID                    # Google Cloud Project ID
BIGQUERY_LOCATION                 # BigQuery location (default: US)
GOOGLE_APPLICATION_CREDENTIALS    # Path to service account JSON

# Application
APP_NAME=convergence-data-pipeline
ENVIRONMENT=development|staging|production
LOG_LEVEL=DEBUG|INFO|WARNING|ERROR|CRITICAL

# API Server
API_HOST=0.0.0.0
API_PORT=8080
API_WORKERS=4

# Security
DISABLE_AUTH=false                # Disable auth for development
ENABLE_DEV_MODE=false             # Enable test API keys
DEFAULT_TENANT_ID=acme1281        # Default tenant when auth disabled
ADMIN_API_KEY                     # Required for admin operations
SECRETS_BASE_PATH=~/.cloudact-secrets

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=100
RATE_LIMIT_REQUESTS_PER_HOUR=1000
RATE_LIMIT_PIPELINE_CONCURRENCY=5

# BigQuery
BQ_MAX_RESULTS_PER_PAGE=10000
BQ_QUERY_TIMEOUT_SECONDS=300
BQ_MAX_RETRY_ATTEMPTS=3

# Metadata Logging
METADATA_LOG_BATCH_SIZE=100
METADATA_LOG_FLUSH_INTERVAL_SECONDS=5
METADATA_LOG_WORKERS=5

# Distributed Locks
LOCK_BACKEND=firestore|memory
LOCK_TIMEOUT_SECONDS=3600
FIRESTORE_LOCK_COLLECTION=pipeline_locks
```

---

## 2. Central Tenants Dataset

**Dataset**: `tenants` (centralized multi-tenant management)

### tenant_profiles
tenant_id (STRING), company_name, admin_email, status (ACTIVE/TRIAL/SUSPENDED/CANCELLED), subscription_plan (STARTER/PROFESSIONAL/SCALE), tenant_dataset_id, created_at

### tenant_api_keys
api_key_id (STRING), tenant_id, api_key_hash (SHA256), key_name, scopes (ARRAY), is_active (BOOLEAN), expires_at, last_used_at

### tenant_subscriptions
subscription_id, tenant_id, plan_name (STARTER/PROFESSIONAL/SCALE), status, max_team_members, max_providers, max_pipelines_per_day, max_pipelines_per_month, max_concurrent_pipelines, subscription_start_date, subscription_end_date

### tenant_usage_quotas
usage_id, tenant_id, usage_date (partition key), pipelines_run_today, pipelines_run_month, concurrent_pipelines_running, daily_limit, monthly_limit, concurrent_limit

### tenant_cloud_credentials
credential_id (STRING), tenant_id, provider (GCP/AWS/AZURE/OPENAI/CLAUDE), encrypted_credentials (BYTES, KMS encrypted), is_active (BOOLEAN), created_at, updated_at

---

## 3. Centralized Pipeline Runs Table

**Dataset**: `tenants` (centralized for all tenants)

### x_meta_pipeline_runs
**Location**: `tenants.x_meta_pipeline_runs` (centralized, not per-tenant)

pipeline_logging_id (UUID), pipeline_id, tenant_id, status (PENDING/RUNNING/COMPLETED/FAILED), trigger_type (api/scheduler/manual), user_id, start_time (partition key), end_time, duration_ms, error_message, parameters (JSON)

## 4. Tenant Dataset Tables

**Dataset**: `{tenant_id}` (per-tenant isolation)

### x_meta_step_logs
step_logging_id (UUID), pipeline_logging_id, step_name, step_type (bigquery_to_bigquery/data_quality), step_index, status (PENDING/RUNNING/COMPLETED/FAILED/SKIPPED), start_time (partition key), duration_ms, rows_processed, metadata (JSON)

### x_meta_dq_results
dq_result_id (UUID), pipeline_logging_id, tenant_id, target_table, dq_config_id, executed_at, expectations_passed, expectations_failed, failed_expectations (JSON), overall_status (PASS/WARNING/FAIL), ingestion_date (partition key)

---

## 4. Subscription Plans

### STARTER
```yaml
max_team_members: 2
max_providers: 3
max_pipelines_per_day: 6
max_pipelines_per_month: 180
max_concurrent_pipelines: 1
price_usd: 19
```

### PROFESSIONAL
```yaml
max_team_members: 6
max_providers: 6
max_pipelines_per_day: 25
max_pipelines_per_month: 750
max_concurrent_pipelines: 3
```

### SCALE
```yaml
max_team_members: 11
max_providers: 10
max_pipelines_per_day: 100
max_pipelines_per_month: 3000
max_concurrent_pipelines: 10
price_usd: 199
```

---

## 5. Status Codes

### Pipeline/Step Statuses
- `PENDING` - Queued for execution
- `RUNNING` - Currently executing
- `COMPLETED` (or `COMPLETE`) - Successfully finished
- `FAILED` - Encountered error
- `SKIPPED` - Step skipped (conditional logic)

### Subscription/Tenant Statuses
- `ACTIVE` - Active
- `TRIAL` - Trial period
- `EXPIRED` - Expired
- `SUSPENDED` - Suspended
- `CANCELLED` - Cancelled

### Data Quality Statuses
- `PASS` - All expectations passed
- `WARNING` - Non-critical failures
- `FAIL` - Critical failures

---

## 6. Pipeline Configuration

### YAML Structure
```yaml
pipeline_id: string              # Alphanumeric, underscore, hyphen
description: string
schedule: string                 # Cron expression
timeout_minutes: 30              # 1-1440
retry_attempts: 3                # 0-10
parameters: {}                   # Runtime params

steps:
  - step_id: string
    ps_type: provider.template   # e.g., gcp.bigquery_to_bigquery
    depends_on: []               # Dependency step IDs
    timeout_minutes: 10          # 1-120
    on_failure: stop             # stop, alert, continue

    # BigQuery step
    source:
      project_id: string
      dataset: string
      table: string
      query: string              # Optional
    destination:
      dataset_type: string       # gcp, aws, openai
      table: string
      write_mode: string         # overwrite, append, merge
      recreate: false

    # Data Quality step
    dq_config: string            # Path to DQ config
    fail_on_error: true
```

### Common ps_type Values
- `gcp.bigquery_to_bigquery` - BQ data transfer/transform
- `gcp.data_quality` - Great Expectations validation
- `shared.email_notification` - Email notifications
- `customer.onboarding` - Tenant onboarding validation

---

## 7. Rate Limits & Validation

### Default Rate Limits
```python
RATE_LIMIT_REQUESTS_PER_MINUTE = 100
RATE_LIMIT_REQUESTS_PER_HOUR = 1000
RATE_LIMIT_PIPELINE_CONCURRENCY = 5  # Per tenant
```

### Request Size Limits
```python
MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_HEADER_SIZE_BYTES = 8 * 1024           # 8 KB
```

### Tenant ID Validation
- Pattern: `^[a-zA-Z0-9_-]{3,64}$`
- Length: 3-64 characters
- Allowed: Alphanumeric, underscore, hyphen only

---

*Last Updated: 2025-11-17*
