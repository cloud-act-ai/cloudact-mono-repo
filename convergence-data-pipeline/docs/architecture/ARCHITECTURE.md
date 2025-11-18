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

## 4. Pipeline Execution Flow

### API-Triggered Pipeline
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
6. Load pipeline template: configs/{provider}/{domain}/{template_name}.yml
7. Execute pipeline async (background task)
8. Log metadata to {tenant_id}.x_meta_pipeline_runs (tenant_id + user_id)
9. On completion:
   - Decrement concurrent counter
   - Increment daily/monthly counters
   - Update status (SUCCESS/FAILED)
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

## 15. API Endpoints

```
Health & Metrics:
  GET  /health
  GET  /health/live
  GET  /health/ready
  GET  /metrics

Pipeline Execution:
  POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}

Admin Operations (X-Admin-Key required):
  POST /api/v1/admin/tenants/onboard
  GET  /api/v1/admin/tenants
  POST /api/v1/admin/tenants/{id}/api-keys

Scheduler Operations (X-Admin-Key required):
  POST /api/v1/scheduler/trigger              # Hourly: Queue due pipelines
  POST /api/v1/scheduler/process-queue        # Every 5 min: Process one queued pipeline
  POST /api/v1/scheduler/reset-daily-quotas   # Daily: Reset quota counters
  GET  /api/v1/scheduler/status               # Get scheduler metrics
  POST /api/v1/scheduler/cleanup-orphaned-pipelines

Tenant Pipeline Configuration (Authenticated):
  GET    /api/v1/scheduler/customer/{tenant_id}/pipelines
  POST   /api/v1/scheduler/customer/{tenant_id}/pipelines
  DELETE /api/v1/scheduler/customer/{tenant_id}/pipelines/{config_id}
```

---

**End of Architecture Document**
