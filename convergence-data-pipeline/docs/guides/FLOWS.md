# Convergence Data Pipeline - Complete System Flows

## Overview

This document provides comprehensive flow diagrams for the convergence data pipeline system, showing actual table names, HTTP endpoints, and data flow patterns across three primary execution modes:

1. **Tenant Onboarding Flow** - Complete tenant setup and validation
2. **Manual Pipeline Execution Flow** - User-triggered pipeline runs via API
3. **Scheduled Pipeline Execution Flow** - Automated Cloud Scheduler-driven pipelines

---

## Architecture Overview

### Two-Dataset Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           GCP PROJECT: gac-prod-471220                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ DATASET: tenants (Centralized Multi-Tenant Management)              │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ Tables (Shared across all tenants):                                 │    │
│  │  • tenant_profiles                 - Tenant registry                │    │
│  │  • tenant_api_keys                 - API authentication (KMS)       │    │
│  │  • tenant_cloud_credentials        - Provider credentials (KMS)     │    │
│  │  • tenant_subscriptions            - Billing & plan limits          │    │
│  │  • tenant_usage_quotas             - Quota tracking                 │    │
│  │  • tenant_provider_configs         - Provider-specific configs      │    │
│  │  • tenant_pipeline_configs         - Scheduled pipeline configs     │    │
│  │  • scheduled_pipeline_runs         - Scheduler execution history    │    │
│  │  • pipeline_execution_queue        - Priority-based task queue      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ DATASET: {tenant_id} (Isolated per tenant, e.g., acmeinc_23xv2)     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ Tables (Isolated operational data):                                 │    │
│  │  • x_meta_pipeline_runs            - Pipeline execution logs        │    │
│  │  • x_meta_step_logs                - Step-level execution logs      │    │
│  │  • x_meta_dq_results               - Data quality results           │    │
│  │  • {custom_tables}                 - Business data tables           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Why Two Datasets?**
- **tenants dataset**: Centralized auth, subscriptions, quotas (shared)
- **{tenant_id} dataset**: Isolated operational data (tenant-specific)
- **Security**: Row-level security (RLS) on tenants dataset, dataset-level isolation for operational data
- **Compliance**: Data residency requirements, HIPAA/SOC2 compliance
- **Performance**: Partitioning & clustering optimized per use case

---

## Flow 1: Tenant Onboarding

Complete tenant onboarding with infrastructure validation and dryrun execution.

### Endpoint
```
POST https://pipeline.cloudact.ai/api/v1/tenants/onboard
Content-Type: application/json

{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "Acme Inc",
  "admin_email": "admin@acmeinc.com",
  "subscription_plan": "PROFESSIONAL"
}
```

### Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                         TENANT ONBOARDING FLOW                                     │
└────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ API Request  │  POST /api/v1/tenants/onboard
└──────┬───────┘
       │
       │  Body: {tenant_id, company_name, admin_email, subscription_plan}
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Create Tenant Profile (tenants.tenant_profiles)                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ INSERT INTO tenants.tenant_profiles                                          │
│   (tenant_id, company_name, admin_email, tenant_dataset_id,                 │
│    status='ACTIVE', subscription_plan, created_at, updated_at)              │
│                                                                              │
│ Result: tenant_id='acmeinc_23xv2', status='ACTIVE'                          │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Generate & Store API Key (tenants.tenant_api_keys)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Generate API key:                                                         │
│    api_key = "{tenant_id}_api_{random_16_chars}"                            │
│    Example: "acmeinc_23xv2_api_7xK2pLqR9sM4vN8w"                            │
│                                                                              │
│ 2. Hash with SHA256:                                                         │
│    api_key_hash = SHA256(api_key)                                           │
│                                                                              │
│ 3. Encrypt with KMS:                                                         │
│    encrypted_api_key = KMS.encrypt(api_key)                                 │
│                                                                              │
│ 4. INSERT INTO tenants.tenant_api_keys                                      │
│    (api_key_id, tenant_id, api_key_hash, encrypted_api_key,                │
│     scopes=['pipelines:read','pipelines:write','pipelines:execute'],       │
│     is_active=TRUE, created_at)                                             │
│                                                                              │
│ Result: api_key returned to user (SHOW ONCE ONLY)                          │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Create Subscription (tenants.tenant_subscriptions)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Subscription Plan Limits:                                                    │
│ ┌──────────────┬────────────┬──────────────┬───────┐                       │
│ │ Plan         │ Team Size  │ Providers    │ Daily │                       │
│ ├──────────────┼────────────┼──────────────┼───────┤                       │
│ │ STARTER      │ 2 members  │ 3 providers  │ 6     │                       │
│ │ PROFESSIONAL │ 6 members  │ 6 providers  │ 25    │  ◄── Selected         │
│ │ SCALE        │ 11 members │ 10 providers │ 100   │                       │
│ └──────────────┴────────────┴──────────────┴───────┘                       │
│                                                                              │
│ INSERT INTO tenants.tenant_subscriptions                                    │
│   (subscription_id, tenant_id, plan_name='PROFESSIONAL',                   │
│    status='ACTIVE', max_team_members=6, max_providers=6,                   │
│    max_pipelines_per_day=25, max_concurrent_pipelines=5,                   │
│    subscription_start_date, created_at)                                     │
│                                                                              │
│ Result: subscription_id (UUID), max_pipelines_per_day=25                   │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Create Usage Quota Tracker (tenants.tenant_usage_quotas)            │
├──────────────────────────────────────────────────────────────────────────────┤
│ INSERT INTO tenants.tenant_usage_quotas                                      │
│   (usage_id='{tenant_id}_{YYYYMMDD}', tenant_id, usage_date=TODAY,         │
│    pipelines_run_today=0, pipelines_succeeded_today=0,                     │
│    pipelines_failed_today=0, concurrent_pipelines_running=0,               │
│    daily_limit=25, last_updated=NOW())                                      │
│                                                                              │
│ Result: Quota tracking initialized for today                                │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Create Tenant Dataset & Operational Tables                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Create BigQuery Dataset:                                                 │
│    CREATE SCHEMA IF NOT EXISTS `gac-prod-471220.acmeinc_23xv2`             │
│    OPTIONS (location='US', description='Operational data for acmeinc_23xv2')│
│                                                                              │
│ 2. Create Operational Tables (NO API keys, NO credentials):                 │
│                                                                              │
│    CREATE TABLE `gac-prod-471220.tenants.x_meta_pipeline_runs`             │
│    PARTITION BY DATE(start_time)                                            │
│    CLUSTER BY (tenant_id, pipeline_id, status)                              │
│    Schema: pipeline_logging_id, pipeline_id, tenant_id, status,            │
│            trigger_type, trigger_by, user_id, start_time, end_time,        │
│            duration_ms, run_date, parameters                                │
│                                                                              │
│    CREATE TABLE `gac-prod-471220.acmeinc_23xv2.x_meta_step_logs`           │
│    PARTITION BY DATE(start_time)                                            │
│    CLUSTER BY (pipeline_logging_id, status)                                 │
│    Schema: step_log_id, pipeline_logging_id, step_name, status,            │
│            start_time, end_time, duration_ms, rows_processed,              │
│            error_message, retry_count                                       │
│                                                                              │
│    CREATE TABLE `gac-prod-471220.acmeinc_23xv2.x_meta_dq_results`          │
│    PARTITION BY DATE(ingestion_date)                                        │
│    CLUSTER BY (tenant_id, target_table, overall_status)                     │
│    Schema: dq_result_id, tenant_id, target_table, validation_rules,        │
│            overall_status, validation_timestamp, ingestion_date            │
│                                                                              │
│ Result: 3 operational tables created in tenant-isolated dataset             │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: Run Dryrun Pipeline (Optional Infrastructure Validation)            │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Load pipeline config: configs/gcp/example/dryrun.yml                     │
│                                                                              │
│ 2. Execute AsyncPipelineExecutor:                                            │
│    tenant_id: 'acmeinc_23xv2'                                               │
│    pipeline_id: 'dryrun'                                                    │
│    trigger_type: 'onboarding'                                                │
│    trigger_by: 'onboarding_api'                                             │
│    user_id: NULL                                                             │
│                                                                              │
│ 3. Dryrun Pipeline Steps:                                                    │
│    a) Create test table: acmeinc_23xv2.x_meta_onboarding_dryrun_test       │
│    b) INSERT test data:                                                     │
│       INSERT INTO acmeinc_23xv2.x_meta_onboarding_dryrun_test              │
│       (test_timestamp, tenant_id, message)                                  │
│       VALUES (NOW(), 'acmeinc_23xv2', 'Onboarding dryrun successful')      │
│    c) Validate BigQuery access, permissions, and table creation            │
│                                                                              │
│ 4. Log execution to:                                                         │
│    tenants.x_meta_pipeline_runs                                             │
│    acmeinc_23xv2.x_meta_step_logs                                           │
│                                                                              │
│ Result: dryrun_status='SUCCESS' or 'FAILED'                                 │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ RESPONSE: Onboarding Complete                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ HTTP 200 OK                                                                  │
│ {                                                                            │
│   "tenant_id": "acmeinc_23xv2",                                             │
│   "api_key": "acmeinc_23xv2_api_7xK2pLqR9sM4vN8w",  // SAVE THIS!          │
│   "subscription_plan": "PROFESSIONAL",                                       │
│   "dataset_created": true,                                                   │
│   "tables_created": [                                                        │
│     "x_meta_pipeline_runs",                                                  │
│     "x_meta_step_logs",                                                      │
│     "x_meta_dq_results"                                                      │
│   ],                                                                         │
│   "dryrun_status": "SUCCESS",                                                │
│   "message": "Tenant Acme Inc onboarded successfully. API key generated."  │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    FINAL STATE AFTER ONBOARDING                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ tenants.tenant_profiles:           1 row (tenant_id='acmeinc_23xv2')        │
│ tenants.tenant_api_keys:           1 row (api_key_hash, encrypted)          │
│ tenants.tenant_subscriptions:      1 row (PROFESSIONAL, 25 daily limit)     │
│ tenants.tenant_usage_quotas:       1 row (0/25 pipelines used today)        │
│                                                                              │
│ Dataset Created: gac-prod-471220.acmeinc_23xv2                              │
│   • x_meta_step_logs (empty)                                                │
│   • x_meta_dq_results (empty)                                               │
│   • x_meta_onboarding_dryrun_test (1 test row)                              │
│                                                                              │
│ Tenant is now ACTIVE and ready to execute pipelines                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 2: Manual Pipeline Execution

User-triggered pipeline execution via REST API with quota enforcement and concurrency control.

### Endpoint
```
POST https://pipeline.cloudact.ai/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}
Headers:
  X-API-Key: acmeinc_23xv2_api_7xK2pLqR9sM4vN8w
  X-User-ID: user_abc123
Content-Type: application/json

{
  "date": "2025-11-15",
  "trigger_by": "john.doe@acmeinc.com"
}
```

### Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                      MANUAL PIPELINE EXECUTION FLOW                                │
└────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ API Request  │  POST /api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/billing_cost
└──────┬───────┘
       │  Headers: X-API-Key, X-User-ID
       │  Body: {date: "2025-11-15", trigger_by: "john.doe@acmeinc.com"}
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Authenticate API Key                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Hash incoming API key:                                                    │
│    api_key_hash = SHA256("acmeinc_23xv2_api_7xK2pLqR9sM4vN8w")             │
│                                                                              │
│ 2. Query tenants.tenant_api_keys:                                           │
│    SELECT tenant_id, scopes, is_active                                      │
│    FROM tenants.tenant_api_keys                                             │
│    WHERE api_key_hash = '{hash}' AND is_active = TRUE                      │
│                                                                              │
│ 3. Verify scopes include 'pipelines:execute'                                │
│                                                                              │
│ Result: tenant_id='acmeinc_23xv2', user_id='user_abc123' (from header)     │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Verify Tenant Access                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Check path tenant_id matches authenticated tenant_id:                    │
│    Path: tenant_id='acmeinc_23xv2'                                          │
│    Auth: tenant_id='acmeinc_23xv2'                                          │
│    Match: ✓                                                                  │
│                                                                              │
│ 2. Query tenant status:                                                      │
│    SELECT status FROM tenants.tenant_profiles                               │
│    WHERE tenant_id = 'acmeinc_23xv2'                                        │
│    Expected: status='ACTIVE'                                                │
│                                                                              │
│ Result: Access granted                                                       │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Enforce Quota Limits (tenants.tenant_usage_quotas)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Query quota for today:                                                    │
│    SELECT pipelines_run_today, daily_limit, remaining                       │
│    FROM tenants.tenant_usage_quotas                                         │
│    WHERE tenant_id = 'acmeinc_23xv2'                                        │
│      AND usage_date = CURRENT_DATE()                                        │
│                                                                              │
│ 2. Check quota:                                                              │
│    pipelines_run_today = 12                                                 │
│    daily_limit = 25                                                          │
│    remaining = 13  ✓ (OK to proceed)                                        │
│                                                                              │
│ 3. If quota exceeded:                                                        │
│    HTTP 429 TOO MANY REQUESTS                                                │
│    "Daily pipeline quota exceeded (12/25). Upgrade or wait until tomorrow." │
│                                                                              │
│ Result: Quota check passed                                                   │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Apply Rate Limiting (In-Memory, Per-Tenant)                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ Rate Limit: 50 requests/minute per tenant (pipeline execution)              │
│                                                                              │
│ Check in-memory rate limiter:                                                │
│   tenant_id: 'acmeinc_23xv2'                                                │
│   requests_last_minute: 23/50  ✓                                            │
│                                                                              │
│ If exceeded:                                                                 │
│   HTTP 429 TOO MANY REQUESTS                                                 │
│   "Rate limit exceeded. Try again in 30 seconds."                           │
│                                                                              │
│ Result: Rate limit check passed                                              │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Generate Pipeline ID & Logging ID                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Generate full pipeline_id:                                               │
│    pipeline_id = "{tenant_id}-{provider}-{domain}-{template_name}"         │
│    pipeline_id = "acmeinc_23xv2-gcp-cost-billing_cost"                     │
│                                                                              │
│ 2. Generate unique logging ID:                                               │
│    pipeline_logging_id = UUID()                                             │
│    pipeline_logging_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"            │
│                                                                              │
│ 3. Extract run_date from parameters:                                         │
│    run_date = "2025-11-15"                                                  │
│                                                                              │
│ Result: IDs generated for tracking                                           │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: Atomic Concurrency Control (Prevent Duplicate Runs)                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Use conditional INSERT to prevent duplicate pipeline execution:             │
│                                                                              │
│ INSERT INTO `gac-prod-471220.tenants.x_meta_pipeline_runs`                 │
│ (pipeline_logging_id, pipeline_id, tenant_id, status, trigger_type,        │
│  trigger_by, user_id, start_time, run_date, parameters)                    │
│ SELECT * FROM (                                                              │
│   SELECT                                                                     │
│     'a1b2c3d4-...' AS pipeline_logging_id,                                  │
│     'acmeinc_23xv2-gcp-cost-billing_cost' AS pipeline_id,                  │
│     'acmeinc_23xv2' AS tenant_id,                                           │
│     'PENDING' AS status,                                                     │
│     'api' AS trigger_type,                                                   │
│     'john.doe@acmeinc.com' AS trigger_by,                                   │
│     'user_abc123' AS user_id,                                               │
│     CURRENT_TIMESTAMP() AS start_time,                                      │
│     DATE('2025-11-15') AS run_date,                                         │
│     PARSE_JSON('{"date":"2025-11-15"}') AS parameters                      │
│ ) AS new_run                                                                 │
│ WHERE NOT EXISTS (                                                           │
│   SELECT 1                                                                   │
│   FROM `gac-prod-471220.tenants.x_meta_pipeline_runs`                      │
│   WHERE tenant_id = 'acmeinc_23xv2'                                         │
│     AND pipeline_id = 'acmeinc_23xv2-gcp-cost-billing_cost'                │
│     AND status IN ('RUNNING', 'PENDING')                                    │
│ )                                                                            │
│                                                                              │
│ Result:                                                                       │
│   • If inserted (num_dml_affected_rows=1): Proceed to execution             │
│   • If NOT inserted (num_dml_affected_rows=0): Pipeline already running     │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
         [Inserted: 1]         [Inserted: 0]
                │                     │
                ▼                     ▼
┌───────────────────────────┐  ┌──────────────────────────────────┐
│ STEP 7A: Execute Pipeline │  │ STEP 7B: Return Existing Run    │
│ (Background Task)         │  │                                  │
├───────────────────────────┤  ├──────────────────────────────────┤
│ 1. Load Template:         │  │ Query existing pipeline:         │
│    Path: configs/gcp/cost/│  │ SELECT pipeline_logging_id       │
│          billing_cost.yml │  │ FROM acmeinc_23xv2.              │
│                           │  │      x_meta_pipeline_runs        │
│ 2. Resolve Variables:     │  │ WHERE status IN ('RUNNING',      │
│    {tenant_id}           │  │                  'PENDING')       │
│    → 'acmeinc_23xv2'     │  │                                  │
│    {pipeline_id}         │  │ Result:                          │
│    → 'acmeinc_23xv2-...' │  │   pipeline_logging_id:           │
│    {date}                │  │   "xyz-existing-run-id"          │
│    → '2025-11-15'        │  │                                  │
│                           │  │ HTTP 200 OK                      │
│ 3. Create Executor:       │  │ {                                │
│    AsyncPipelineExecutor  │  │   "pipeline_logging_id":         │
│      tenant_id            │  │     "xyz-existing-run-id",       │
│      pipeline_id          │  │   "status": "RUNNING",           │
│      user_id              │  │   "message": "Pipeline already   │
│      trigger_type='api'   │  │     running - returning existing"│
│                           │  │ }                                │
│ 4. Execute Steps (DAG):   │  └──────────────────────────────────┘
│    a) Update status:      │
│       UPDATE              │
│       tenants.            │
│       x_meta_pipeline_runs│
│       SET status='RUNNING'│
│                           │
│    b) Execute each step:  │
│       - Extract data      │
│       - Transform data    │
│       - Load to BQ        │
│       - Log to            │
│         x_meta_step_logs  │
│                           │
│    c) Finalize:           │
│       UPDATE              │
│       tenants.            │
│       x_meta_pipeline_runs│
│       SET status='COMPLETE│
│           end_time=NOW()  │
│           duration_ms=... │
│                           │
│ 5. Update Quota:          │
│    UPDATE                 │
│    tenant_usage_quotas    │
│    SET pipelines_run_today│
│      = pipelines_run_today│
│        + 1,               │
│    pipelines_succeeded    │
│      _today = ... + 1     │
│                           │
│ Result: Pipeline executed │
│   asynchronously          │
└───────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ RESPONSE: Pipeline Triggered                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ HTTP 200 OK (Immediate response, execution in background)                   │
│ {                                                                            │
│   "pipeline_logging_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",            │
│   "pipeline_id": "acmeinc_23xv2-gcp-cost-billing_cost",                     │
│   "tenant_id": "acmeinc_23xv2",                                             │
│   "status": "PENDING",                                                       │
│   "message": "Pipeline triggered successfully (async mode)"                 │
│ }                                                                            │
│                                                                              │
│ User can track progress via:                                                 │
│   GET /api/v1/pipelines/runs/{pipeline_logging_id}                          │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE STATE AFTER EXECUTION                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ tenants.x_meta_pipeline_runs:                                               │
│   • pipeline_logging_id: "a1b2c3d4-..."                                     │
│   • pipeline_id: "acmeinc_23xv2-gcp-cost-billing_cost"                     │
│   • tenant_id: "acmeinc_23xv2"                                              │
│   • status: "COMPLETE"                                                       │
│   • trigger_type: "api"                                                      │
│   • trigger_by: "john.doe@acmeinc.com"                                      │
│   • user_id: "user_abc123"                                                  │
│   • start_time: 2025-11-17 10:30:00 UTC                                     │
│   • end_time: 2025-11-17 10:32:15 UTC                                       │
│   • duration_ms: 135000                                                      │
│   • run_date: 2025-11-15                                                     │
│                                                                              │
│ acmeinc_23xv2.x_meta_step_logs: (3 rows)                                    │
│   • Step 1: extract_billing_data - COMPLETE                                 │
│   • Step 2: transform_cost_data - COMPLETE                                  │
│   • Step 3: load_to_bq - COMPLETE                                           │
│                                                                              │
│ tenants.tenant_usage_quotas:                                                │
│   • pipelines_run_today: 13 (was 12)                                        │
│   • pipelines_succeeded_today: 10 (was 9)                                   │
│   • remaining: 12 (was 13)                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 3: Scheduled Pipeline Execution

Automated pipeline execution orchestrated by Google Cloud Scheduler using HTTP triggers.

### Cloud Scheduler Setup (3 Jobs)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CLOUD SCHEDULER CONFIGURATION                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Job 1: Hourly Trigger                                                   │
│   Name: pipeline-scheduler-hourly-trigger                               │
│   Schedule: 0 * * * * (every hour at :00)                               │
│   Timezone: UTC                                                          │
│   Target: HTTP POST                                                      │
│   URL: https://pipeline.cloudact.ai/api/v1/scheduler/trigger            │
│   Headers: X-Admin-Key: {admin_secret_key}                              │
│   Description: Scan for pipelines due to run and enqueue them           │
│                                                                         │
│ Job 2: Queue Processor                                                  │
│   Name: pipeline-queue-processor                                        │
│   Schedule: */5 * * * * (every 5 minutes)                               │
│   Timezone: UTC                                                          │
│   Target: HTTP POST                                                      │
│   URL: https://pipeline.cloudact.ai/api/v1/scheduler/process-queue      │
│   Headers: X-Admin-Key: {admin_secret_key}                              │
│   Description: Process next pipeline from execution queue               │
│                                                                         │
│ Job 3: Daily Quota Reset                                                │
│   Name: pipeline-quota-reset-daily                                      │
│   Schedule: 0 0 * * * (midnight UTC)                                    │
│   Timezone: UTC                                                          │
│   Target: HTTP POST                                                      │
│   URL: https://pipeline.cloudact.ai/api/v1/scheduler/reset-daily-quotas │
│   Headers: X-Admin-Key: {admin_secret_key}                              │
│   Description: Reset daily quota counters for all tenants               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow Diagram: Job 1 - Hourly Trigger

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│              SCHEDULER JOB 1: HOURLY TRIGGER (Every Hour at :00)                   │
└────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ Cloud Scheduler  │  Cron: 0 * * * * (Hourly)
│   Hourly Job     │
└────────┬─────────┘
         │
         │  HTTP POST https://pipeline.cloudact.ai/api/v1/scheduler/trigger
         │  Headers: X-Admin-Key: {admin_secret}
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Authenticate Admin Request                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Verify X-Admin-Key header matches configured admin secret                   │
│   Expected: settings.admin_api_key                                           │
│   Provided: {admin_secret_from_header}                                       │
│                                                                              │
│ If invalid:                                                                  │
│   HTTP 403 FORBIDDEN                                                         │
│   "Invalid admin API key"                                                    │
│                                                                              │
│ Result: Admin authenticated                                                  │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Query Pipelines Due to Run (tenants.tenant_pipeline_configs)        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Query SQL:                                                                   │
│ WITH due_pipelines AS (                                                      │
│   SELECT                                                                     │
│     c.config_id,                                                             │
│     c.tenant_id,                                                            │
│     c.provider,                                                              │
│     c.domain,                                                                │
│     c.pipeline_template,                                                     │
│     c.schedule_cron,                                                         │
│     c.timezone,                                                              │
│     c.parameters,                                                            │
│     c.next_run_time,                                                         │
│     c.priority,                                                              │
│     p.status as tenant_status,                                              │
│     s.max_pipelines_per_day,                                                 │
│     COALESCE(u.pipelines_run_today, 0) as pipelines_run_today              │
│   FROM tenants.tenant_pipeline_configs c                                    │
│   INNER JOIN tenants.tenant_profiles p                                      │
│     ON c.tenant_id = p.tenant_id                                            │
│   LEFT JOIN tenants.tenant_subscriptions s                                  │
│     ON p.tenant_id = s.tenant_id AND s.status = 'ACTIVE'                   │
│   LEFT JOIN tenants.tenant_usage_quotas u                                   │
│     ON p.tenant_id = u.tenant_id AND u.usage_date = CURRENT_DATE()         │
│   WHERE c.is_active = TRUE                                                   │
│     AND c.next_run_time <= CURRENT_TIMESTAMP()                              │
│     AND p.status = 'ACTIVE'                                                  │
│ )                                                                            │
│ SELECT * FROM due_pipelines                                                  │
│ WHERE pipelines_run_today < max_pipelines_per_day                           │
│ ORDER BY next_run_time ASC, priority DESC                                    │
│ LIMIT 100                                                                    │
│                                                                              │
│ Example Results (3 pipelines found):                                         │
│ ┌────────────┬─────────────┬──────────┬────────┬──────────────┬──────────┐ │
│ │ tenant_id  │ provider    │ domain   │ template│ next_run_time│ priority │ │
│ ├────────────┼─────────────┼──────────┼────────┼──────────────┼──────────┤ │
│ │ acmeinc_.. │ GCP         │ COST     │ billing│ 10:00:00 UTC │ 7        │ │
│ │ megacorp_..│ AWS         │ SECURITY │ audit  │ 10:00:00 UTC │ 8        │ │
│ │ startup_.. │ GCP         │ COST     │ compute│ 09:55:00 UTC │ 5        │ │
│ └────────────┴─────────────┴──────────┴────────┴──────────────┴──────────┘ │
│                                                                              │
│ Result: 3 pipelines due to run                                               │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Enqueue Each Pipeline (Loop Through Results)                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ For each pipeline (example: acmeinc_23xv2, GCP, COST, billing):             │
│                                                                              │
│ 3a) Generate run_id:                                                         │
│     run_id = UUID()  // "r1s2t3u4-v5w6-x7y8-z9a0-b1c2d3e4f5g6"             │
│                                                                              │
│ 3b) Generate pipeline_id:                                                    │
│     pipeline_id = "{tenant_id}-{provider}-{domain}-{template}"              │
│     pipeline_id = "acmeinc_23xv2-gcp-cost-billing"                          │
│                                                                              │
│ 3c) INSERT into scheduled_pipeline_runs:                                     │
│     INSERT INTO tenants.scheduled_pipeline_runs                             │
│     (run_id, config_id, tenant_id, pipeline_id, state,                     │
│      scheduled_time, priority, parameters)                                   │
│     VALUES                                                                   │
│     ('r1s2t3u4-...', 'config_xyz', 'acmeinc_23xv2',                         │
│      'acmeinc_23xv2-gcp-cost-billing', 'PENDING',                           │
│      CURRENT_TIMESTAMP(), 7, PARSE_JSON('{"date":"2025-11-17"}'))          │
│                                                                              │
│     Result: Run record created (state=PENDING)                               │
│                                                                              │
│ 3d) INSERT into pipeline_execution_queue:                                    │
│     INSERT INTO tenants.pipeline_execution_queue                            │
│     (run_id, tenant_id, pipeline_id, state, scheduled_time,                │
│      priority, added_at)                                                     │
│     VALUES                                                                   │
│     ('r1s2t3u4-...', 'acmeinc_23xv2',                                       │
│      'acmeinc_23xv2-gcp-cost-billing', 'QUEUED',                            │
│      CURRENT_TIMESTAMP(), 7, CURRENT_TIMESTAMP())                           │
│                                                                              │
│     Result: Pipeline added to execution queue (state=QUEUED)                 │
│                                                                              │
│ 3e) Update next_run_time using cron expression:                             │
│     Calculate next run from cron: "0 2 * * *" (2 AM daily)                  │
│     Using timezone: "America/New_York"                                       │
│     Next run: 2025-11-18 07:00:00 UTC (2 AM EST = 7 AM UTC)                │
│                                                                              │
│     UPDATE tenants.tenant_pipeline_configs                                  │
│     SET next_run_time = '2025-11-18 07:00:00 UTC',                          │
│         updated_at = CURRENT_TIMESTAMP()                                     │
│     WHERE config_id = 'config_xyz'                                           │
│                                                                              │
│     Result: Next run scheduled for tomorrow at 2 AM EST                      │
│                                                                              │
│ Repeat for all 3 pipelines found                                             │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ RESPONSE: Trigger Summary                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ HTTP 200 OK                                                                  │
│ {                                                                            │
│   "triggered_count": 3,                                                      │
│   "queued_count": 3,                                                         │
│   "skipped_count": 0,                                                        │
│   "next_trigger_time": "2025-11-17T11:00:00Z",                              │
│   "details": {                                                               │
│     "limit": 100,                                                            │
│     "due_pipelines_found": 3                                                 │
│   }                                                                          │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE STATE AFTER TRIGGER                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ tenants.scheduled_pipeline_runs: (3 new rows)                               │
│   • run_id: "r1s2t3u4-...", state: PENDING, tenant: acmeinc_23xv2           │
│   • run_id: "a9b8c7d6-...", state: PENDING, tenant: megacorp_xyz            │
│   • run_id: "f5e4d3c2-...", state: PENDING, tenant: startup_abc             │
│                                                                              │
│ tenants.pipeline_execution_queue: (3 new rows, state=QUEUED)                │
│   Priority-ordered queue for worker processing                               │
│                                                                              │
│ tenants.tenant_pipeline_configs: (3 rows updated)                           │
│   • next_run_time updated to next scheduled occurrence                       │
│                                                                              │
│ Next Step: Queue Processor Job will pick up QUEUED pipelines                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Flow Diagram: Job 2 - Queue Processor

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│          SCHEDULER JOB 2: QUEUE PROCESSOR (Every 5 Minutes)                        │
└────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ Cloud Scheduler  │  Cron: */5 * * * * (Every 5 minutes)
│  Queue Processor │
└────────┬─────────┘
         │
         │  HTTP POST https://pipeline.cloudact.ai/api/v1/scheduler/process-queue
         │  Headers: X-Admin-Key: {admin_secret}
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Authenticate Admin Request                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Verify X-Admin-Key (same as Job 1)                                          │
│ Result: Admin authenticated                                                  │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Get Next Pipeline from Queue (tenants.pipeline_execution_queue)     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Query SQL:                                                                   │
│ SELECT                                                                       │
│   run_id,                                                                    │
│   tenant_id,                                                                │
│   pipeline_id,                                                               │
│   scheduled_time,                                                            │
│   priority                                                                   │
│ FROM tenants.pipeline_execution_queue                                       │
│ WHERE state = 'QUEUED'                                                       │
│ ORDER BY priority DESC, scheduled_time ASC                                   │
│ LIMIT 1                                                                      │
│                                                                              │
│ Result:                                                                      │
│   run_id: "r1s2t3u4-v5w6-x7y8-z9a0-b1c2d3e4f5g6"                            │
│   tenant_id: "megacorp_xyz"                                                 │
│   pipeline_id: "megacorp_xyz-aws-security-audit"                            │
│   priority: 8 (highest priority)                                             │
│                                                                              │
│ If queue empty:                                                              │
│   HTTP 200 OK {"processed": false, "status": "IDLE",                        │
│                "message": "No pipelines in queue"}                           │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Mark as PROCESSING (tenants.pipeline_execution_queue)               │
├──────────────────────────────────────────────────────────────────────────────┤
│ UPDATE tenants.pipeline_execution_queue                                     │
│ SET state = 'PROCESSING',                                                    │
│     processing_started_at = CURRENT_TIMESTAMP()                             │
│ WHERE run_id = 'r1s2t3u4-...'                                               │
│                                                                              │
│ Result: Queue item marked as PROCESSING (prevents duplicate pickup)          │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Fetch Pipeline Configuration                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Query SQL:                                                                   │
│ SELECT                                                                       │
│   r.config_id,                                                               │
│   r.parameters,                                                              │
│   c.provider,                                                                │
│   c.domain,                                                                  │
│   c.pipeline_template                                                        │
│ FROM tenants.scheduled_pipeline_runs r                                      │
│ INNER JOIN tenants.tenant_pipeline_configs c                                │
│   ON r.config_id = c.config_id                                              │
│ WHERE r.run_id = 'r1s2t3u4-...'                                             │
│ LIMIT 1                                                                      │
│                                                                              │
│ Result:                                                                      │
│   config_id: "config_abc123"                                                 │
│   provider: "AWS"                                                            │
│   domain: "SECURITY"                                                         │
│   pipeline_template: "audit"                                                 │
│   parameters: {"date": "2025-11-17", "severity": "HIGH"}                    │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Execute Pipeline (AsyncPipelineExecutor)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Create executor:                                                          │
│    executor = AsyncPipelineExecutor(                                         │
│      tenant_id = "megacorp_xyz",                                            │
│      pipeline_id = "aws/security/audit",                                     │
│      trigger_type = "scheduler",                                             │
│      trigger_by = "cloud_scheduler",                                         │
│      user_id = NULL  // No user context for scheduler                        │
│    )                                                                         │
│                                                                              │
│ 2. Generate pipeline_logging_id:                                             │
│    pipeline_logging_id = UUID()                                             │
│    pipeline_logging_id = "p7q8r9s0-t1u2-v3w4-x5y6-z7a8b9c0d1e2"            │
│                                                                              │
│ 3. Insert into tenant pipeline runs:                                         │
│    INSERT INTO tenants.x_meta_pipeline_runs                                 │
│    (pipeline_logging_id, pipeline_id, tenant_id, status,                   │
│     trigger_type, trigger_by, user_id, start_time, parameters)             │
│    VALUES                                                                    │
│    ('p7q8r9s0-...', 'megacorp_xyz-aws-security-audit',                     │
│     'megacorp_xyz', 'PENDING', 'scheduler', 'cloud_scheduler',             │
│     NULL, CURRENT_TIMESTAMP(), PARSE_JSON('{"date":"2025-11-17"}'))        │
│                                                                              │
│ 4. Execute pipeline steps (async/background):                                │
│    a) Load template: configs/aws/security/audit.yml                          │
│    b) Resolve variables: {tenant_id}, {pipeline_id}, {date}                 │
│    c) Execute DAG steps:                                                     │
│       - Query AWS CloudTrail logs                                            │
│       - Analyze security events                                              │
│       - Generate audit report                                                │
│       - Load results to BigQuery                                             │
│    d) Log each step to megacorp_xyz.x_meta_step_logs                        │
│                                                                              │
│ 5. Update status to RUNNING:                                                 │
│    UPDATE tenants.x_meta_pipeline_runs                                      │
│    SET status = 'RUNNING'                                                    │
│    WHERE pipeline_logging_id = 'p7q8r9s0-...'                               │
│                                                                              │
│ Result: Pipeline execution started (background task)                         │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: Update Scheduled Run State (Background Task Continuation)           │
├──────────────────────────────────────────────────────────────────────────────┤
│ On Success:                                                                  │
│                                                                              │
│ 6a) Update scheduled_pipeline_runs:                                          │
│     UPDATE tenants.scheduled_pipeline_runs                                  │
│     SET state = 'COMPLETED',                                                 │
│         completed_at = CURRENT_TIMESTAMP(),                                  │
│         pipeline_logging_id = 'p7q8r9s0-...'                                │
│     WHERE run_id = 'r1s2t3u4-...'                                           │
│                                                                              │
│ 6b) Update tenant_pipeline_configs:                                         │
│     UPDATE tenants.tenant_pipeline_configs                                  │
│     SET last_run_time = CURRENT_TIMESTAMP(),                                │
│         last_run_status = 'SUCCESS'                                          │
│     WHERE config_id = 'config_abc123'                                        │
│                                                                              │
│ 6c) Remove from queue:                                                       │
│     DELETE FROM tenants.pipeline_execution_queue                            │
│     WHERE run_id = 'r1s2t3u4-...'                                           │
│                                                                              │
│ 6d) Update quota:                                                            │
│     UPDATE tenants.tenant_usage_quotas                                      │
│     SET pipelines_run_today = pipelines_run_today + 1,                      │
│         pipelines_succeeded_today = pipelines_succeeded_today + 1           │
│     WHERE tenant_id = 'megacorp_xyz'                                        │
│       AND usage_date = CURRENT_DATE()                                        │
│                                                                              │
│ On Failure:                                                                  │
│                                                                              │
│ 6e) Update scheduled_pipeline_runs:                                          │
│     UPDATE tenants.scheduled_pipeline_runs                                  │
│     SET state = 'FAILED',                                                    │
│         failed_at = CURRENT_TIMESTAMP(),                                     │
│         error_message = '{error_details}',                                   │
│         retry_count = COALESCE(retry_count, 0) + 1                          │
│     WHERE run_id = 'r1s2t3u4-...'                                           │
│                                                                              │
│ 6f) Check retry eligibility:                                                 │
│     SELECT retry_count, max_retries                                          │
│     FROM tenants.scheduled_pipeline_runs                                    │
│     WHERE run_id = 'r1s2t3u4-...'                                           │
│                                                                              │
│     If retry_count < max_retries (default: 3):                               │
│       - Re-queue with lower priority:                                        │
│         UPDATE tenants.pipeline_execution_queue                             │
│         SET state = 'QUEUED',                                                │
│             priority = GREATEST(priority - 1, 1),                            │
│             processing_started_at = NULL                                     │
│         WHERE run_id = 'r1s2t3u4-...'                                       │
│                                                                              │
│     Else (max retries exceeded):                                             │
│       - Remove from queue:                                                   │
│         DELETE FROM tenants.pipeline_execution_queue                        │
│         WHERE run_id = 'r1s2t3u4-...'                                       │
│                                                                              │
│ Result: Pipeline execution tracked and queue managed                         │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ RESPONSE: Queue Processing Result                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ HTTP 200 OK (Immediate response, execution continues in background)         │
│ {                                                                            │
│   "processed": true,                                                         │
│   "pipeline_logging_id": "p7q8r9s0-t1u2-v3w4-x5y6-z7a8b9c0d1e2",            │
│   "tenant_id": "megacorp_xyz",                                              │
│   "pipeline_id": "megacorp_xyz-aws-security-audit",                         │
│   "status": "PROCESSING",                                                    │
│   "message": "Pipeline started processing for tenant megacorp_xyz"          │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE STATE AFTER QUEUE PROCESSING                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ tenants.pipeline_execution_queue:                                           │
│   • run_id "r1s2t3u4-..." removed (or state=FAILED if max retries)          │
│   • 2 remaining queued items                                                 │
│                                                                              │
│ tenants.scheduled_pipeline_runs:                                            │
│   • run_id "r1s2t3u4-..." state=COMPLETED, completed_at=NOW()              │
│   • pipeline_logging_id="p7q8r9s0-..." (links to tenant run)               │
│                                                                              │
│ tenants.x_meta_pipeline_runs:                                               │
│   • pipeline_logging_id="p7q8r9s0-..."                                      │
│   • status=COMPLETE, trigger_type=scheduler, user_id=NULL                   │
│                                                                              │
│ megacorp_xyz.x_meta_step_logs:                                              │
│   • 4 step logs for pipeline execution                                       │
│                                                                              │
│ tenants.tenant_usage_quotas:                                                │
│   • pipelines_run_today incremented                                          │
│                                                                              │
│ Next Run: In 5 minutes, queue processor picks next QUEUED pipeline          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Flow Diagram: Job 3 - Daily Quota Reset

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│           SCHEDULER JOB 3: DAILY QUOTA RESET (Midnight UTC)                        │
└────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ Cloud Scheduler  │  Cron: 0 0 * * * (Midnight UTC)
│  Quota Reset Job │
└────────┬─────────┘
         │
         │  HTTP POST https://pipeline.cloudact.ai/api/v1/scheduler/reset-daily-quotas
         │  Headers: X-Admin-Key: {admin_secret}
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Authenticate Admin Request                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Verify X-Admin-Key (same as Jobs 1 & 2)                                     │
│ Result: Admin authenticated                                                  │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Reset Daily Counters (tenants.tenant_usage_quotas)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ UPDATE tenants.tenant_usage_quotas                                          │
│ SET                                                                          │
│   pipelines_run_today = 0,                                                   │
│   pipelines_succeeded_today = 0,                                             │
│   pipelines_failed_today = 0,                                                │
│   concurrent_pipelines_running = 0,                                          │
│   quota_exceeded = FALSE,                                                    │
│   quota_warning_sent = FALSE,                                                │
│   last_updated = CURRENT_TIMESTAMP()                                         │
│ WHERE usage_date < CURRENT_DATE()                                            │
│                                                                              │
│ Result: All tenants' daily counters reset for new day                        │
│   Example: 142 rows updated (142 active tenants)                             │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Archive Old Quota Records (tenants.tenant_usage_quotas)             │
├──────────────────────────────────────────────────────────────────────────────┤
│ DELETE FROM tenants.tenant_usage_quotas                                     │
│ WHERE usage_date < DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)                │
│                                                                              │
│ Result: Old records (>90 days) deleted to prevent table bloat                │
│   Example: 87 rows archived/deleted                                          │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ RESPONSE: Reset Complete                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ HTTP 200 OK                                                                  │
│ {                                                                            │
│   "status": "success",                                                       │
│   "records_updated": 142,                                                    │
│   "records_archived": 87,                                                    │
│   "message": "Reset 142 daily quotas, archived 87 old records",             │
│   "executed_at": "2025-11-18T00:00:00Z"                                     │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                  DATABASE STATE AFTER QUOTA RESET                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ tenants.tenant_usage_quotas:                                                │
│   • All tenants: pipelines_run_today = 0                                     │
│   • All tenants: pipelines_succeeded_today = 0                               │
│   • All tenants: pipelines_failed_today = 0                                  │
│   • All tenants: concurrent_pipelines_running = 0                            │
│   • Records older than 90 days deleted                                        │
│                                                                              │
│ Result: Fresh start for new day, all tenants can run pipelines again         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary: Key Tables and Their Roles

### Centralized Tenant Management (tenants dataset)

| Table Name | Purpose | Updated By |
|------------|---------|------------|
| `tenant_profiles` | Tenant registry, status tracking | Onboarding API |
| `tenant_api_keys` | API authentication (KMS encrypted) | Onboarding API, Key rotation |
| `tenant_subscriptions` | Plan limits, billing info | Onboarding API, Billing system |
| `tenant_usage_quotas` | Daily/monthly quota tracking | Pipeline execution, Quota reset job |
| `tenant_pipeline_configs` | Scheduled pipeline configurations | Scheduler API, Tenant admin |
| `scheduled_pipeline_runs` | Scheduler execution history | Scheduler trigger, Queue processor |
| `pipeline_execution_queue` | Priority-based task queue | Scheduler trigger, Queue processor |

### Isolated Tenant Operations ({tenant_id} dataset)

| Table Name | Purpose | Updated By |
|------------|---------|------------|
| `x_meta_pipeline_runs` | Pipeline execution logs | Pipeline executor, Scheduler |
| `x_meta_step_logs` | Step-level execution logs | Pipeline executor |
| `x_meta_dq_results` | Data quality validation results | DQ validator |

---

## HTTP Endpoints Reference

### Tenant Management
- `POST /api/v1/tenants/onboard` - Complete tenant onboarding

### Pipeline Execution (Manual)
- `POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}` - Trigger pipeline
- `GET /api/v1/pipelines/runs/{pipeline_logging_id}` - Get pipeline status
- `GET /api/v1/pipelines/runs` - List pipeline runs

### Scheduler (Admin Only)
- `POST /api/v1/scheduler/trigger` - Hourly trigger (Cloud Scheduler)
- `POST /api/v1/scheduler/process-queue` - Queue processor (Cloud Scheduler)
- `POST /api/v1/scheduler/reset-daily-quotas` - Daily quota reset (Cloud Scheduler)
- `GET /api/v1/scheduler/status` - Get scheduler metrics

### Tenant Pipeline Configuration
- `GET /api/v1/scheduler/customer/{tenant_id}/pipelines` - List tenant pipeline configs
- `POST /api/v1/scheduler/customer/{tenant_id}/pipelines` - Create/update pipeline config
- `DELETE /api/v1/scheduler/customer/{tenant_id}/pipelines/{config_id}` - Disable pipeline

---

## Scheduler Metadata Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      SCHEDULER METADATA LOGGING                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Scheduler-triggered pipelines are logged with:                               │
│                                                                              │
│ tenants.x_meta_pipeline_runs:                                               │
│   • trigger_type = "scheduler"                                               │
│   • trigger_by = "cloud_scheduler"                                           │
│   • user_id = NULL  ← No user context for automated runs                     │
│   • pipeline_logging_id = UUID (generated by queue processor)                │
│                                                                              │
│ tenants.scheduled_pipeline_runs:                                            │
│   • Links scheduler config to execution via pipeline_logging_id              │
│   • Tracks retry attempts, error messages                                    │
│   • State: SCHEDULED → PENDING → RUNNING → COMPLETED/FAILED                 │
│                                                                              │
│ This allows differentiation between:                                         │
│   - Manual API runs (user_id present, trigger_type="api")                   │
│   - Scheduled runs (user_id NULL, trigger_type="scheduler")                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Performance & Scalability Notes

### Quota Enforcement
- **Real-time**: Checked on every manual pipeline execution
- **Daily reset**: Midnight UTC via Cloud Scheduler
- **Subscription limits**: STARTER (6/day), PROFESSIONAL (25/day), SCALE (100/day)

### Concurrency Control
- **Manual execution**: Atomic INSERT prevents duplicate runs (same pipeline_id)
- **Scheduler execution**: Queue state management prevents duplicate processing
- **Max concurrent**: Configurable per subscription plan (3-10 pipelines)

### Rate Limiting
- **API rate limit**: 50 requests/minute per tenant (in-memory)
- **Scheduler trigger**: Hourly batch processing (up to 100 pipelines per run)
- **Queue processor**: Processes 1 pipeline every 5 minutes (scalable with multiple workers)

### Partitioning & Clustering
- **Time partitioning**: All operational tables partitioned by date fields (start_time, usage_date)
- **Clustering**: Optimized for common query patterns (tenant_id, status, priority)
- **Retention**: Automatic data lifecycle management (90-day default for quotas)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Maintained By**: Platform Engineering Team
