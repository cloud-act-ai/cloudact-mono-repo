# Convergence Data Pipeline - System Architecture

**Version**: 2.0.0 | **Updated**: 2025-11-17 | **Type**: Multi-tenant Data Pipeline Backend

---

## 1. System Overview

### Purpose
Enterprise backend service for executing multi-cloud data pipelines (GCP, AWS, Azure) with complete tenant isolation. Processes cost, security, and compliance data via automated or manual triggers.

### Deployment
- **Runtime**: Cloud Run (FastAPI + Python 3.11)
- **Storage**: BigQuery (data + metadata)
- **Triggers**: Cloud Scheduler (automatic) OR API calls (manual)
- **Authentication**: API key (SHA256 hashed, KMS encrypted)

### What This Service Does
- Execute data transformation pipelines per tenant
- Enforce subscription quotas and rate limits
- Log all pipeline executions with audit trails
- Isolate tenant data in separate BigQuery datasets

### What This Service Does NOT Do
- User management (handled by Supabase frontend)
- User authentication (only API key for tenants)
- Direct user CRUD operations

---

## 2. Multi-Tenancy Design

### Tenant vs User
| Concept | Definition | Scope | Owner |
|---------|-----------|-------|-------|
| **tenant_id** | Organization identifier | Subscription, quotas, limits, datasets | Backend |
| **user_id** | Individual user UUID | Logging only (who triggered pipeline) | Frontend |

**Key Points**:
- **Subscriptions belong to tenant** (not user)
- **Limits enforced at tenant level** (daily/monthly pipeline quotas)
- **user_id only for audit logs** (tracking who triggered actions)
- **Frontend manages users** (backend receives user_id passively)

### Dataset Naming
- **Tenant dataset**: `{tenant_id}` (e.g., `acmeinc_23xv2`)
- **Central dataset**: `tenants` (shared management dataset)

---

## 3. Two-Dataset Architecture

### 3.1 Central Tenants Dataset (`tenants`)
**Purpose**: Centralized tenant management, auth, and quotas

```
tenants.tenant_profiles              # Company details, status, plan
tenants.tenant_api_keys              # SHA256-hashed API keys (KMS encrypted)
tenants.tenant_subscriptions         # Plan limits (daily/monthly/concurrent)
tenants.tenant_usage_quotas          # Real-time quota tracking (CRITICAL)
tenants.tenant_cloud_credentials     # KMS-encrypted provider credentials
tenants.tenant_provider_configs      # Pipeline settings per provider/domain
tenants.tenant_pipeline_configs      # Scheduled pipeline configurations (cron)
tenants.scheduled_pipeline_runs      # Track scheduled executions (PENDING/COMPLETED/FAILED)
tenants.pipeline_execution_queue     # Active queue for scheduled pipelines
```

**Access Pattern**: Every API request authenticates against this dataset

### 3.2 Per-Tenant Datasets (`{tenant_id}`)
**Purpose**: Isolated operational data per tenant

**Metadata Tables** (has tenant_id + user_id):
```
{tenant_id}.x_meta_pipeline_runs     # Pipeline execution logs
{tenant_id}.x_meta_step_logs         # Step-by-step execution details
{tenant_id}.x_meta_dq_results        # Data quality validation results
```

**Data Tables** (provider-specific):
```
{tenant_id}.gcp_cost_billing         # GCP billing data
{tenant_id}.aws_cost_cur             # AWS Cost and Usage Reports
{tenant_id}.azure_cost_exports       # Azure cost exports
```

**Isolation**: No cross-tenant queries possible (dataset-level separation)

---

## 4. Configuration-Driven Pipeline Execution

### Architecture: YAML-Based Pipeline Definitions

ALL pipelines are configuration-driven using YAML files. The entire pipeline execution model is **declarative**, not imperative.

#### Configuration Structure

```
/configs/                                      # All pipeline configurations
  ├── gcp/
  │   ├── cost/
  │   │   └── billing.yml                      # GCP cost extraction config
  │   ├── security/
  │   │   └── iam_audit.yml
  │   └── compliance/
  ├── aws/
  │   ├── cost/
  │   │   └── cur.yml                          # AWS CUR extraction config
  │   └── ...
  ├── setup/
  │   └── bootstrap_system.yml                 # One-time bootstrap config
  └── azure/
      └── ...

/ps_templates/                                 # Processor schema templates
  ├── gcp/cost/
  │   ├── config.yml                           # Processor config
  │   ├── README.md                            # Documentation
  │   └── schemas/                             # JSON schemas
  │       └── billing_output.json
  └── setup/initial/
      ├── config.yml
      └── schemas/
          ├── tenant_profiles.json
          ├── tenant_api_keys.json
          └── ... (8 total)
```

#### Pipeline Execution Model

**Key Principle**: Pipelines execute by loading YAML configuration files from `/configs/` directory.

```yaml
# Example: configs/gcp/cost/billing.yml
name: "GCP Cost Billing Extract"
version: "1.0.0"
enabled: true

processors:
  - processor_id: "gcp_billing_extract"
    processor_type: "gcp/cost/billing"
    template_id: "gcp_cost_billing"

    input:
      provider: "gcp"
      project_id: "{gcp_project_id}"
      service_account: "{gcp_service_account}"
      billing_dataset: "{gcp_billing_dataset}"

    parameters:
      extraction_date: "{date}"
      include_credits: true
      include_taxes: true

    output:
      dataset: "{tenant_id}"
      table: "gcp_cost_billing"
      write_mode: "WRITE_APPEND"

    retry:
      max_attempts: 3
      backoff_multiplier: 2.0
```

### API-Triggered Pipeline (Real-Time Sync)

**Trigger**: Frontend/API calls pipeline directly for immediate execution

```
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}
Headers:
  X-API-Key: {api_key}          # REQUIRED
  X-User-ID: {user_uuid}        # OPTIONAL (for logging)
Body: {"date": "2025-11-15"}

Flow:
1. Hash API key: SHA256(api_key)
2. Lookup tenant_id from tenants.tenant_api_keys (hash match)
3. Verify subscription status (tenants.tenant_subscriptions.status = ACTIVE)
4. Check quota (tenants.tenant_usage_quotas):
   - pipelines_run_today < daily_limit
   - concurrent_pipelines_running < concurrent_limit
5. Increment concurrent counter
6. LOAD PIPELINE CONFIGURATION:
   - Load: /configs/{provider}/{domain}/{template_name}.yml
   - Replace variables: {tenant_id}, {gcp_project_id}, {date}, etc.
7. Execute pipeline async (background task) via AsyncPipelineExecutor
8. Log metadata to {tenant_id}.x_meta_pipeline_runs (tenant_id + user_id)
9. On completion:
   - Decrement concurrent counter
   - Increment daily/monthly counters
   - Update status (SUCCESS/FAILED)
```

**Response**: Immediate (pipeline runs asynchronously)
```json
{
  "pipeline_logging_id": "uuid",
  "tenant_id": "acme_corp_12312025",
  "status": "RUNNING",
  "message": "Pipeline triggered successfully"
}
```

### Scheduler-Triggered Pipeline (Queue-Based Architecture)

Cloud Scheduler uses **HTTP calls** (NOT Pub/Sub) with three separate jobs:

#### Job 1: Pipeline Trigger (Hourly)
```
Schedule: 0 * * * * (every hour at :00)
Endpoint: POST /api/v1/scheduler/trigger
Headers: X-Admin-Key: {admin_api_key}

Flow:
1. Query tenants.tenant_pipeline_configs for due pipelines:
   - WHERE is_active = TRUE
   - AND next_run_time <= NOW()
   - AND tenant status = ACTIVE
   - AND pipelines_run_today < daily_limit

2. For each due pipeline:
   - INSERT INTO tenants.scheduled_pipeline_runs (state = PENDING)
   - INSERT INTO tenants.pipeline_execution_queue (state = QUEUED)
   - UPDATE tenant_pipeline_configs SET next_run_time (from cron)

3. Return summary: {triggered_count, queued_count, skipped_count}
```

#### Job 2: Queue Processor (Every 5 Minutes)
```
Schedule: */5 * * * * (every 5 minutes)
Endpoint: POST /api/v1/scheduler/process-queue
Headers: X-Admin-Key: {admin_api_key}

Flow:
1. Get next queued pipeline (ORDER BY priority DESC, scheduled_time ASC)
2. UPDATE queue state to PROCESSING
3. Execute pipeline via AsyncPipelineExecutor (user_id = NULL)
4. On success:
   - UPDATE scheduled_pipeline_runs SET state = COMPLETED
   - UPDATE tenant_pipeline_configs (last_run_time, last_run_status)
   - DELETE FROM pipeline_execution_queue
5. On failure:
   - If retry_count < max_retries: re-queue with lower priority
   - Else: remove from queue

Note: user_id = NULL for scheduled runs (no user context)
```

#### Job 3: Daily Quota Reset (Daily)
```
Schedule: 0 0 * * * (midnight UTC)
Endpoint: POST /api/v1/scheduler/reset-daily-quotas
Headers: X-Admin-Key: {admin_api_key}

Flow:
1. Reset all daily counters:
   UPDATE tenants.tenant_usage_quotas
   SET pipelines_run_today = 0, concurrent_pipelines_running = 0
   WHERE usage_date < CURRENT_DATE()

2. Archive old records (>90 days):
   DELETE FROM tenants.tenant_usage_quotas
   WHERE usage_date < DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
```

**Key Tables**:
- `tenants.tenant_pipeline_configs` - Cron schedules and configurations
- `tenants.scheduled_pipeline_runs` - Track each scheduled execution
- `tenants.pipeline_execution_queue` - Active queue (QUEUED → PROCESSING)

---

## 4.1 Post-Onboarding Flows: Provider Credentials and Pipeline Configuration

### Prerequisites
After subscription onboarding is complete, tenant has:
- tenant_id (from subscription system)
- tenants.tenant_profiles record
- tenants.tenant_subscriptions (ACTIVE)
- tenants.tenant_api_keys (for API authentication)
- tenants.tenant_usage_quotas (initialized)

### Flow 1: Cloud Provider Credential Setup (CRUD)

**Purpose**: Add/update/delete cloud provider credentials (GCP, AWS, Azure, OpenAI, Claude) after subscription.

```
POST /api/v1/tenants/{tenant_id}/credentials
Headers:
  X-API-Key: acme_corp_12312025_api_xyz789
  X-User-ID: alice_uuid_from_supabase     # Audit logging

Body:
{
  "provider": "GCP",                       # or AWS, AZURE, OPENAI, CLAUDE
  "credentials": {
    "project_id": "acme-gcp-project",
    "service_account_json": "{...}"        # Will be KMS encrypted
  }
}

FLOW:
1. Authenticate API key → Extract tenant_id
2. Verify X-User-ID header (for audit logging)
3. Check if credentials already exist:
   - SELECT credential_id FROM tenants.tenant_cloud_credentials
   - WHERE tenant_id = 'acme_corp_12312025' AND provider = 'GCP'
4. Encrypt credentials with KMS:
   - encrypted_creds = KMS.encrypt('tenant-credentials-key', service_account_json)
5. INSERT or UPDATE tenants.tenant_cloud_credentials:
   - IF NOT EXISTS: INSERT (credential_id, tenant_id, provider, encrypted_credentials, created_by_user_id)
   - IF EXISTS: UPDATE encrypted_credentials, updated_by_user_id
6. Create BigQuery dataset (first time only):
   - CREATE DATASET `project.{tenant_id}`
7. Create metadata tables (first time only):
   - x_meta_pipeline_runs, x_meta_step_logs, x_meta_dq_results
8. Log credential action:
   - INSERT INTO {tenant_id}.x_meta_step_logs (action='CREDENTIAL_ADDED', provider='GCP', user_id='alice_uuid')

RESPONSE:
{
  "tenant_id": "acme_corp_12312025",
  "provider": "GCP",
  "action": "CREATED",                     # or "UPDATED"
  "dataset_status": "CREATED",             # or "ALREADY_EXISTS"
  "tables_created": ["x_meta_pipeline_runs", "x_meta_step_logs", "x_meta_dq_results"],
  "message": "GCP credentials added successfully"
}
```

### Flow 2: Pipeline Configuration (Schedule Setup)

**Purpose**: Create/update scheduled pipeline configurations with cron expressions.

```
POST /api/v1/scheduler/customer/{tenant_id}/pipelines
Headers:
  X-API-Key: {api_key}
  X-User-ID: {user_uuid}

Body:
{
  "config_id": "uuid-or-auto-generated",
  "pipeline_id": "gcp-cost-billing",
  "provider": "gcp",
  "domain": "cost",
  "template": "billing",
  "is_active": true,
  "cron_expression": "0 2 * * *",           # 2 AM daily
  "parameters": {
    "include_credits": true,
    "include_taxes": true
  },
  "next_run_time": "2025-11-18T02:00:00Z",
  "max_retries": 3
}

FLOW:
1. Authenticate API key → Extract tenant_id
2. Validate cron_expression
3. INSERT INTO tenants.tenant_pipeline_configs:
   - (config_id, tenant_id, pipeline_id, provider, domain, template,
   -  is_active, cron_expression, parameters, created_by_user_id, next_run_time)
4. Calculate next_run_time from cron expression
5. Log configuration:
   - INSERT INTO {tenant_id}.x_meta_step_logs (action='PIPELINE_CONFIG_CREATED')

RESPONSE:
{
  "config_id": "uuid",
  "tenant_id": "acme_corp_12312025",
  "pipeline_id": "gcp-cost-billing",
  "status": "ACTIVE",
  "next_run_time": "2025-11-18T02:00:00Z",
  "message": "Pipeline schedule configured successfully"
}
```

**Later**: Cloud Scheduler hourly job queries this table and triggers due pipelines.

---

## 4.2 Sync Patterns: Real-Time API vs Offline Scheduler

### Pattern 1: Real-Time API Sync (On-Demand)

**Trigger**: Frontend/User initiates pipeline via API call

**Use Cases**:
- User clicks "Sync Now" button in dashboard
- Manual data refresh needed
- Ad-hoc data collection

**Flow**:
```
POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/billing
  ↓
[Auth: Verify API key + subscription + quota]
  ↓
[Load: configs/gcp/cost/billing.yml]
  ↓
[Execute: Async background task (non-blocking)]
  ↓
[Response: Immediate with status=RUNNING]
  ↓
[Async: Pipeline executes and logs to metadata tables]
  ↓
[Client polls: GET /api/v1/pipelines/{pipeline_logging_id}/status]
```

**Characteristics**:
- User-initiated
- Immediate response
- Real-time execution
- Audit trail includes user_id
- Subject to quota limits

**Response Time**:
- API response: <100ms (returns immediately)
- Pipeline execution: Minutes to hours (depends on data size)

---

### Pattern 2: Offline Scheduler Sync (Automatic)

**Trigger**: Cloud Scheduler hourly job

**Use Cases**:
- Daily cost extractions
- Scheduled compliance checks
- Automated data synchronization

**Architecture**: Queue-based with three scheduled jobs

#### Job 1: Pipeline Trigger (Hourly at :00)
```
Cloud Scheduler → POST /api/v1/scheduler/trigger
  ↓
[Query] tenants.tenant_pipeline_configs
  WHERE is_active=TRUE AND next_run_time <= NOW()
  ↓
[Enqueue] For each due pipeline:
  - INSERT INTO tenants.scheduled_pipeline_runs (state=PENDING)
  - INSERT INTO tenants.pipeline_execution_queue (state=QUEUED)
  - UPDATE tenant_pipeline_configs SET next_run_time (from cron)
  ↓
[Response] {triggered_count, queued_count}
```

#### Job 2: Queue Processor (Every 5 minutes)
```
Cloud Scheduler → POST /api/v1/scheduler/process-queue
  ↓
[Dequeue] Get one QUEUED pipeline (ORDER BY priority, scheduled_time)
  ↓
[Execute] AsyncPipelineExecutor (user_id = NULL)
  ↓
[Update] On success/failure:
  - Mark scheduled_pipeline_runs as COMPLETED/FAILED
  - Remove from pipeline_execution_queue (or re-queue for retry)
  ↓
[Response] Processing status
```

#### Job 3: Daily Quota Reset (Daily at midnight UTC)
```
Cloud Scheduler → POST /api/v1/scheduler/reset-daily-quotas
  ↓
[Reset] UPDATE tenants.tenant_usage_quotas
  SET pipelines_run_today=0, concurrent_pipelines_running=0
  ↓
[Archive] DELETE records older than 90 days
  ↓
[Response] {records_updated, records_archived}
```

**Characteristics**:
- Automatic/scheduled
- Decoupled execution (queue-based)
- Sequential processing (one pipeline at a time)
- No user context (user_id = NULL)
- Retry logic built-in
- Not subject to user quota (system quota only)

**Key Tables**:
- `tenants.tenant_pipeline_configs` - Cron schedules
- `tenants.scheduled_pipeline_runs` - Execution tracking
- `tenants.pipeline_execution_queue` - Active queue

---

### Pattern Comparison

| Aspect | Real-Time API | Offline Scheduler |
|--------|---------------|-------------------|
| **Trigger** | User action | Cron schedule |
| **Initiation** | POST /pipelines/run | Cloud Scheduler job |
| **Response Time** | Immediate (<100ms) | Delayed (next scheduler run) |
| **Execution** | Async (non-blocking) | Async (queue processor) |
| **User Context** | user_id included | user_id = NULL |
| **Quota Impact** | Yes (daily limit) | Yes (separate system quota) |
| **Audit Trail** | Full (who/when/why) | Partial (no user context) |
| **Use Case** | On-demand refresh | Scheduled sync |
| **Example** | "Sync Now" button | "Daily 2 AM cost extract" |

---

## 5. Bootstrap Process and Initial Setup

### One-Time Bootstrap Processor

**Purpose**: Set up the entire tenant management infrastructure on first deployment.

**Process**:
```
1. Create central 'tenants' dataset
   └── CREATE DATASET tenants

2. Create 8 management tables with schemas
   ├── tenant_profiles              # Tenant accounts
   ├── tenant_api_keys              # Auth (SHA256 hashed + KMS encrypted)
   ├── tenant_subscriptions         # Plan info & limits
   ├── tenant_usage_quotas          # Real-time quota tracking (partitioned daily)
   ├── tenant_cloud_credentials     # Encrypted provider credentials
   ├── tenant_pipeline_configs      # Scheduled pipeline definitions
   ├── scheduled_pipeline_runs      # Execution history (partitioned daily)
   └── pipeline_execution_queue     # Active queue (partitioned daily)

3. Apply schemas and optimizations
   ├── Partitioning (daily for time-series tables)
   ├── Clustering (on tenant_id)
   └── Indexes (on frequently queried columns)

4. Log bootstrap completion
   └── INSERT INTO tenants.audit_log
```

**Implementation**:
```
src/core/processors/setup/initial/onetime_bootstrap_processor.py
  ├── Load 8 JSON schemas from ps_templates/setup/initial/schemas/
  ├── Check dataset/table existence
  ├── Create missing tables with full schemas
  └── Apply partitioning and clustering

ps_templates/setup/initial/
  ├── config.yml                    # Processor configuration
  ├── README.md                     # Full documentation
  └── schemas/                      # 8 JSON schema files
      ├── tenant_profiles.json
      ├── tenant_api_keys.json
      ├── tenant_subscriptions.json
      ├── tenant_usage_quotas.json
      ├── tenant_cloud_credentials.json
      ├── tenant_pipeline_configs.json
      ├── scheduled_pipeline_runs.json
      └── pipeline_execution_queue.json

configs/setup/
  └── bootstrap_system.yml          # Example bootstrap pipeline config
```

**Quick Start**:
```bash
cd convergence-data-pipeline

# First-time setup (idempotent)
python tests/test_bootstrap_setup.py

# Verify setup
# Check: BigQuery project.tenants dataset with 8 tables

# Subsequent deployments
# Bootstrap automatically skips tables that already exist
```

**Key Features**:
- **Idempotent**: Safe to run multiple times
- **Schema-first**: All schemas in JSON (no SQL strings)
- **Integrated**: Standard processor pattern
- **Non-destructive**: Creates only missing tables

---

## 5. Quota Management

### Real-Time Tracking (`tenants.tenant_usage_quotas`)
```sql
-- Before execution (quota check)
SELECT pipelines_run_today, daily_limit, concurrent_pipelines_running
FROM tenants.tenant_usage_quotas
WHERE tenant_id = ? AND usage_date = CURRENT_DATE();

-- On pipeline start
UPDATE tenants.tenant_usage_quotas
SET concurrent_pipelines_running = concurrent_pipelines_running + 1
WHERE tenant_id = ? AND usage_date = CURRENT_DATE();

-- On pipeline completion (SUCCESS or FAILED)
UPDATE tenants.tenant_usage_quotas
SET pipelines_run_today = pipelines_run_today + 1,
    pipelines_run_month = pipelines_run_month + 1,
    pipelines_succeeded_today = pipelines_succeeded_today + 1,  -- or failed
    concurrent_pipelines_running = concurrent_pipelines_running - 1
WHERE tenant_id = ? AND usage_date = CURRENT_DATE();
```

### Daily Reset
Cloud Scheduler job (`reset-daily-quotas`) resets `pipelines_run_today` at midnight UTC.

---

## 6. Authentication Flow

```
1. Client Request:
   - Header: X-API-Key: {api_key}
   - Header: X-User-ID: {user_uuid} (optional)

2. Backend Processing:
   - Hash API key: api_key_hash = SHA256(api_key)
   - Lookup tenant:
     SELECT tenant_id, scopes, expires_at
     FROM tenants.tenant_api_keys
     WHERE api_key_hash = ? AND is_active = TRUE

3. Extract tenant_id from result

4. Validate subscription:
   - Check tenants.tenant_subscriptions.status = ACTIVE
   - Check trial_end_date, subscription_end_date

5. Validate quota:
   - Check tenants.tenant_usage_quotas (daily/monthly/concurrent limits)

6. Execute with context:
   - tenant_id: For dataset routing
   - user_id: For audit logging
```

### FastAPI Dependencies
```python
# NEW: Customer-centric authentication
get_current_customer()       # Full profile + subscription
validate_subscription()      # Check status & expiration
validate_quota()             # Enforce limits

# LEGACY: Tenant-based (backward compatibility)
verify_api_key()             # Returns tenant_id only
```

---

## 7. Core Components

### AsyncPipelineExecutor
- Async pipeline execution (non-blocking)
- Step dependencies (sequential + parallel)
- Metadata logging to `x_meta_pipeline_runs`, `x_meta_step_logs`
- Error handling + retry logic

### BigQueryClient
- Thread-safe connection pooling (500 max connections)
- Exponential backoff retry for transient errors
- Circuit breaker (5 failures → 60s cooldown)
- Tenant dataset isolation

### Metadata Logger
- Batched writes (100 records per flush, 5s interval)
- Worker pool (5 concurrent workers)
- Reduces latency from 50-100ms to <5ms per log

---

## 8. Security

### API Key Security
- **Hash storage**: SHA256 in `tenant_api_keys.api_key_hash`
- **Full key**: KMS-encrypted in `encrypted_api_key` (BYTES)
- **Lookup**: Hash-based (no decryption needed)

### Cloud Credentials
- **KMS encryption**: All provider credentials encrypted at rest
- **Decryption**: On-demand during pipeline execution
- **Providers**: GCP, AWS, Azure, OpenAI, Claude

---

## 9. Rate Limiting

| Scope | Limit | Response |
|-------|-------|----------|
| Per-tenant | 100 req/min, 1000 req/hour | HTTP 429 + Retry-After |
| Global | 10,000 req/min, 100,000 req/hour | HTTP 429 |
| Admin endpoints | 10 req/min per tenant | HTTP 429 |
| Pipeline run | 50 req/min per tenant | HTTP 429 |

---

## 10. Observability

### Logging
- **Format**: Structured JSON with tenant_id, user_id, pipeline_id
- **Metadata**: All executions logged to BigQuery

### Metrics (Prometheus)
```
GET /metrics

Metrics:
- api_requests_total{method, endpoint, status}
- pipeline_executions_total{tenant_id, status}
- pipeline_duration_seconds{tenant_id, pipeline_id}
- quota_usage_ratio{tenant_id}
```

### Health Checks
```
GET /health              # Basic health
GET /health/live         # Liveness probe
GET /health/ready        # Readiness probe (BigQuery check)
```

---

## 11. Key Design Decisions

### Why Separate Tenants Dataset?
- Centralized auth and quota management
- Fast lookups without cross-dataset queries
- Single source of truth for API keys

### Why tenant_id + user_id?
- **tenant_id**: Business logic (quotas, subscriptions)
- **user_id**: Audit trails (who triggered action)
- Separation of concerns (frontend manages users)

### Why No User Management?
- Frontend (Supabase) handles user auth
- Backend receives `user_id` passively via header
- Reduces backend complexity
- Modern SaaS architecture pattern

---

## 12. Scaling Design

### Current Scale
- **Tenants**: 10,000+ supported
- **Concurrent pipelines**: 100+ per tenant
- **Request throughput**: 10,000 req/min global

### Bottleneck Mitigations
| Bottleneck | Mitigation |
|------------|-----------|
| BigQuery write latency | Batched metadata writes (5s intervals) |
| API key lookups | SHA256 hash index on `tenant_api_keys` |
| Quota checks | Clustered index on `(tenant_id, usage_date)` |
| Connection exhaustion | HTTP connection pool (500 connections) |
| Auth latency | Background aggregator (60s flush) |

---

## 13. Maintenance Operations

### Automated (Cloud Scheduler)
```
Hourly (0 * * * *): trigger-due-pipelines
  - Query tenant_pipeline_configs for pipelines due to run
  - Add to pipeline_execution_queue
  - Update next_run_time based on cron expression

Every 5 min (*/5 * * * *): process-queue
  - Process one queued pipeline at a time
  - Execute via AsyncPipelineExecutor (user_id = NULL)
  - Handle retries and failures

Daily (0 0 * * *): reset-daily-quotas
  - Reset tenants.tenant_usage_quotas.pipelines_run_today
  - Archive records older than 90 days

Hourly (0 * * * *): cleanup-orphaned-pipelines
  - Mark PENDING/RUNNING > 60 min as FAILED
  - Decrement concurrent counters
```

### Manual
```
Tenant onboarding:  POST /api/v1/admin/tenants/onboard
API key rotation:   POST /api/v1/admin/tenants/{id}/api-keys
Quota adjustment:   Direct BigQuery UPDATE to tenant_usage_quotas
```

---

## 14. Error Handling

| Error Type | Response | Recovery |
|-----------|----------|----------|
| Quota exceeded (daily) | HTTP 429 + Retry-After: 86400s | Wait until next day |
| Quota exceeded (concurrent) | HTTP 429 + Retry-After: 300s | Wait for pipeline completion |
| BigQuery timeout | 503 Service Unavailable | Exponential backoff (3 retries) |
| Pipeline failure | Email/Slack notification | Auto-retry (configurable) |

---

## 15. End-to-End System Flow: Frontend to Pipeline Execution

### Complete Journey: From User Action to Data in BigQuery

```
FRONTEND SYSTEM (Supabase)          CONVERGENCE API (Cloud Run)          DATA (BigQuery)
    |                                    |                                    |
[1. User Logs In]
    |
[2. Tenant Dashboard]
    └─ [Add Provider Credentials]
         |
         └─> POST /api/v1/tenants/{tenant_id}/credentials
             Headers: X-API-Key, X-User-ID
             |
             └─> [Auth: Verify API key]
                 |
                 └─> SELECT tenant_id FROM tenants.tenant_api_keys
                     |
                     └─> [Load: KMS to decrypt stored key]
                         |
                         └─> [Verify subscription status]
                             |
                             └─> SELECT status FROM tenants.tenant_subscriptions
                                 |
                                 └─> [Encrypt credentials with KMS]
                                     |
                                     └─> INSERT INTO tenants.tenant_cloud_credentials
                                         |
                                         └─> [Create dataset]
                                             |
                                             └─> CREATE DATASET {tenant_id}
                                                 |
                                                 └─> [Create metadata tables]
                                                     |
                                                     └─> x_meta_pipeline_runs
                                                         x_meta_step_logs
                                                         x_meta_dq_results
                                                         |
                                                         └─> Response: Credentials saved!

[3. Configure Pipeline Schedule]
    |
    └─> POST /api/v1/scheduler/customer/{tenant_id}/pipelines
        Body: {provider, domain, template, cron_expression}
        |
        └─> [Auth + Validate]
            |
            └─> [INSERT INTO tenants.tenant_pipeline_configs]
                |
                └─> Response: Schedule configured!

[4a. MANUAL TRIGGER: "Sync Now" Button]
    |
    └─> POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/billing
        |
        └─> [Auth: Verify API key]
            |
            └─> [Check: Quota available?]
                |
                YES └─> [Load: configs/gcp/cost/billing.yml]
                        |
                        └─> [Execute: AsyncPipelineExecutor]
                            |
                            └─> [INSERT INTO x_meta_pipeline_runs]
                                |
                                └─> [Execute processors in sequence]
                                    ├─> Processor 1: Extract GCP billing data
                                    ├─> Processor 2: Transform/validate
                                    └─> Processor 3: Load to BigQuery
                                    |
                                    └─> [INSERT INTO x_meta_step_logs]
                                        |
                                        └─> [UPDATE x_meta_pipeline_runs]
                                            |
                                            └─> Response: RUNNING
                |
                NO  └─> Response: HTTP 429 Quota exceeded

[4b. SCHEDULED TRIGGER: Cloud Scheduler]
    |
    Cloud Scheduler (Hourly)
    └─> POST /api/v1/scheduler/trigger
        |
        └─> [Query: Due pipelines]
            |
            └─> SELECT * FROM tenants.tenant_pipeline_configs
                WHERE is_active=TRUE AND next_run_time <= NOW()
                |
                └─> [For each due pipeline]
                    |
                    └─> [INSERT INTO tenants.scheduled_pipeline_runs]
                        [INSERT INTO tenants.pipeline_execution_queue]
                        [UPDATE tenant_pipeline_configs]
                        |
                        └─> Response: {triggered_count, queued_count}

    Cloud Scheduler (Every 5 minutes)
    └─> POST /api/v1/scheduler/process-queue
        |
        └─> [Get next QUEUED pipeline]
            |
            └─> SELECT * FROM tenants.pipeline_execution_queue
                WHERE state='QUEUED' ORDER BY priority
                |
                └─> [Execute pipeline]
                    |
                    └─> [Load: configs/{provider}/{domain}/{template}.yml]
                        |
                        └─> [AsyncPipelineExecutor (user_id=NULL)]
                            |
                            └─> [Execute each processor step]
                                |
                                └─> [Log execution to x_meta_pipeline_runs]
                                    [Log steps to x_meta_step_logs]
                                    [Write results to {tenant_id}.* tables]
                                    |
                                    └─> [UPDATE pipeline_execution_queue]
                                        [UPDATE scheduled_pipeline_runs]
                                        |
                                        └─> Response: Processing status

[5. Data Available in BigQuery]
    |
    Dashboard queries: SELECT * FROM {tenant_id}.gcp_cost_billing
    |
    └─> Display cost breakdown to user
```

---

## 16. API Endpoints

```
Health & Metrics:
  GET  /health
  GET  /health/live
  GET  /health/ready
  GET  /metrics

Pipeline Execution (Real-Time):
  POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}      # Manual trigger

Provider Credentials (Post-Onboarding):
  POST /api/v1/tenants/{tenant_id}/credentials                               # Add/update credentials
  GET  /api/v1/tenants/{tenant_id}/credentials                               # List credentials
  DELETE /api/v1/tenants/{tenant_id}/credentials/{provider}                  # Delete credentials

Tenant Pipeline Configuration (Scheduled):
  GET    /api/v1/scheduler/customer/{tenant_id}/pipelines                    # List configurations
  POST   /api/v1/scheduler/customer/{tenant_id}/pipelines                    # Create schedule
  PUT    /api/v1/scheduler/customer/{tenant_id}/pipelines/{config_id}        # Update schedule
  DELETE /api/v1/scheduler/customer/{tenant_id}/pipelines/{config_id}        # Delete schedule

Scheduler Operations (X-Admin-Key required):
  POST /api/v1/scheduler/trigger                                              # Hourly: Queue due pipelines
  POST /api/v1/scheduler/process-queue                                        # Every 5 min: Process one queued pipeline
  POST /api/v1/scheduler/reset-daily-quotas                                   # Daily: Reset quota counters
  POST /api/v1/scheduler/cleanup-orphaned-pipelines                           # Hourly: Mark stale as failed
  GET  /api/v1/scheduler/status                                               # Get scheduler metrics

Admin Operations (X-Admin-Key required):
  POST /api/v1/admin/tenants/onboard                                          # Onboard new tenant
  GET  /api/v1/admin/tenants                                                  # List all tenants
  POST /api/v1/admin/tenants/{id}/api-keys                                    # Rotate API key
```

---

## 17. Configuration-Driven Architecture: Key Principles

### All Pipelines Execute from YAML Configs

**Core Principle**: There is no hardcoded pipeline logic. All pipeline definitions are YAML files in `/configs/`.

```
Pipeline Execution Flow:

  API Request → Load YAML Config → Execute Processors → Store Results

Example:
  POST /api/v1/pipelines/run/acme_corp/gcp/cost/billing
    ↓
  Load: /configs/gcp/cost/billing.yml
    ↓
  Parse processors from YAML
    ↓
  For each processor:
    - Load processor class (e.g., GcpCostBillingProcessor)
    - Load processor template from ps_templates/gcp/cost/
    - Execute with parameters from YAML
    - Log to metadata tables
    ↓
  Write results to BigQuery dataset: {tenant_id}
```

### Configuration Hierarchy

```
/configs/                               # YAML pipeline definitions
  └── {provider}/{domain}/{template}.yml
      Contains:
      - processors: List of processor steps
      - input: Source configuration
      - parameters: Execution parameters
      - output: Target dataset/table
      - retry: Failure handling

/ps_templates/                          # Processor implementation templates
  └── {provider}/{domain}/
      Contains:
      - config.yml: Processor template config
      - schemas/: Output schema definitions
      - README.md: Documentation

/src/core/processors/                   # Processor implementations
  └── {provider}/{domain}/
      Contains:
      - processor.py: Actual Python code
      - __init__.py
```

### Adding a New Pipeline (No Code Changes Required)

To add a new pipeline (e.g., Azure Storage Cost Extraction):

1. Create YAML config:
   ```
   /configs/azure/cost/storage.yml
   ```

2. Create processor template:
   ```
   /ps_templates/azure/cost/
   ├── config.yml
   └── schemas/storage_output.json
   ```

3. If processor code doesn't exist, implement:
   ```
   /src/core/processors/azure/cost/processor.py
   ```

4. Deploy. No API changes needed.

---

**End of Architecture Document**
