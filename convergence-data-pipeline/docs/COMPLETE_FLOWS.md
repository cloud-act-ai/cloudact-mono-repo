# Complete Data Pipeline Flows

## Flow 1: Cloud Provider Credential Setup (Post-Subscription)

**IMPORTANT**: This flow happens AFTER the tenant has completed subscription onboarding.
The tenant profile, subscription, and API keys already exist from the subscription system.
This endpoint is for adding/updating cloud provider credentials (GCP, AWS, Azure).

```
┌─────────────────────────────────────────────────────────────┐
│ PREREQUISITE: Subscription Onboarding Already Complete      │
└─────────────────────────────────────────────────────────────┘
  Tenant already has:
  - ✓ tenant_id (from subscription system)
  - ✓ tenants.tenant_profiles record
  - ✓ tenants.tenant_subscriptions (ACTIVE)
  - ✓ tenants.tenant_api_keys (for API authentication)
  - ✓ tenants.tenant_usage_quotas (initialized)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Frontend Calls Provider Credential Setup API       │
└─────────────────────────────────────────────────────────────┘
  POST /api/v1/tenants/{tenant_id}/credentials
  Headers:
    X-API-Key: acme_corp_12312025_api_xyz789
    X-User-ID: alice_uuid_from_supabase  # Who is adding credentials

  Body: {
    "provider": "GCP",  # or AWS, AZURE
    "credentials": {
      "project_id": "acme-gcp-project",
      "service_account_json": "{...}"  # Will be KMS encrypted
    }
  }
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Authenticate and Verify Tenant                     │
└─────────────────────────────────────────────────────────────┘
  1. Hash API key: SHA256(X-API-Key)
  2. SELECT tenant_id FROM tenants.tenant_api_keys
     WHERE api_key_hash = hash
  3. Verify tenant_id in URL matches authenticated tenant_id
  4. Extract user_id from X-User-ID header (for audit log)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Check if Credentials Already Exist                 │
└─────────────────────────────────────────────────────────────┘
  SELECT credential_id
  FROM tenants.tenant_cloud_credentials
  WHERE tenant_id = 'acme_corp_12312025'
    AND provider = 'GCP'

  Result: EXISTS → UPDATE | NOT EXISTS → INSERT
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Encrypt Credentials with KMS                       │
└─────────────────────────────────────────────────────────────┘
  encrypted_credentials = KMS.encrypt(
    project_id='gcp-convergence-prod',
    key='tenant-credentials-key',
    plaintext=service_account_json
  )
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: INSERT or UPDATE Credentials                       │
└─────────────────────────────────────────────────────────────┘
  IF NOT EXISTS:
    INSERT INTO tenants.tenant_cloud_credentials
    (credential_id, tenant_id, provider, encrypted_credentials,
     created_by_user_id, created_at)
    VALUES (uuid, 'acme_corp_12312025', 'GCP', encrypted_blob,
            'alice_uuid', NOW())

  IF EXISTS:
    UPDATE tenants.tenant_cloud_credentials
    SET encrypted_credentials = encrypted_blob,
        updated_by_user_id = 'alice_uuid',
        updated_at = NOW()
    WHERE tenant_id = 'acme_corp_12312025' AND provider = 'GCP'
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Create BigQuery Dataset (First Time Only)          │
└─────────────────────────────────────────────────────────────┘
  IF dataset does NOT exist:
    CREATE DATASET `project.acme_corp_12312025`

  IF dataset exists:
    Skip (dataset already created)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Create Metadata Tables (First Time Only)           │
└─────────────────────────────────────────────────────────────┘
  IF tables do NOT exist:
    CREATE TABLE `acme_corp_12312025.x_meta_pipeline_runs`
    CREATE TABLE `acme_corp_12312025.x_meta_step_logs`
    CREATE TABLE `acme_corp_12312025.x_meta_dq_results`

  IF tables exist:
    Skip (tables already created)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 8: Log Credential Action                              │
└─────────────────────────────────────────────────────────────┘
  INSERT INTO acme_corp_12312025.x_meta_step_logs
  (log_id, tenant_id, user_id, action, provider, timestamp)
  VALUES (uuid, 'acme_corp_12312025', 'alice_uuid',
          'CREDENTIAL_ADDED', 'GCP', NOW())
              ↓
┌─────────────────────────────────────────────────────────────┐
│ RESPONSE: Credential Setup Confirmation                    │
└─────────────────────────────────────────────────────────────┘
  {
    "tenant_id": "acme_corp_12312025",
    "provider": "GCP",
    "action": "CREATED",  # or "UPDATED"
    "dataset_status": "CREATED",  # or "ALREADY_EXISTS"
    "tables_created": ["x_meta_pipeline_runs", "x_meta_step_logs", ...],
    "message": "GCP credentials added successfully"
  }
```

---

## Flow 2: Manual Pipeline Execution (API Triggered)

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: API Call with Headers                               │
└─────────────────────────────────────────────────────────────┘
  POST /api/v1/pipelines/run/{tenant_id}/gcp/cost/billing
  Headers:
    X-API-Key: acme_corp_12312025_api_xyz789
    X-User-ID: alice_uuid_from_supabase
  Body: {"date": "2025-11-17"}
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Authentication                                       │
└─────────────────────────────────────────────────────────────┘
  hash = SHA256(X-API-Key)
  SELECT tenant_id FROM tenants.tenant_api_keys 
  WHERE api_key_hash = hash
  
  Result: tenant_id = "acme_corp_12312025"
  user_id = "alice_uuid_from_supabase" (from X-User-ID header)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Verify Subscription                                 │
└─────────────────────────────────────────────────────────────┘
  SELECT status FROM tenants.tenant_subscriptions
  WHERE tenant_id = 'acme_corp_12312025'
  
  Check: status = 'ACTIVE'
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Check Quota                                         │
└─────────────────────────────────────────────────────────────┘
  SELECT pipelines_run_today, daily_limit
  FROM tenants.tenant_usage_quotas
  WHERE tenant_id = 'acme_corp_12312025'
    AND usage_date = CURRENT_DATE()
  
  Check: pipelines_run_today (5) < daily_limit (25) ✓
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Load Pipeline Template                              │
└─────────────────────────────────────────────────────────────┘
  Load: configs/gcp/cost/billing.yml
  Replace variables:
    {tenant_id} → acme_corp_12312025
    {pipeline_id} → acme_corp_12312025-gcp-cost-billing
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Insert Pipeline Run Record                          │
└─────────────────────────────────────────────────────────────┘
  pipeline_logging_id = UUID()
  
  INSERT INTO `acme_corp_12312025.x_meta_pipeline_runs`
  (pipeline_logging_id, tenant_id, user_id, status, started_at)
  VALUES (uuid, 'acme_corp_12312025', 'alice_uuid', 'RUNNING', NOW())
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Increment Quota Counter (Atomic)                    │
└─────────────────────────────────────────────────────────────┘
  UPDATE tenants.tenant_usage_quotas
  SET pipelines_run_today = pipelines_run_today + 1
  WHERE tenant_id = 'acme_corp_12312025'
    AND usage_date = CURRENT_DATE()
  
  Result: pipelines_run_today = 6
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 8: Execute Pipeline Async (Background)                 │
└─────────────────────────────────────────────────────────────┘
  AsyncPipelineExecutor(
    tenant_id='acme_corp_12312025',
    user_id='alice_uuid',
    pipeline_logging_id=uuid
  ).execute()
  
  Each step logs to:
  - x_meta_step_logs (with user_id)
  - x_meta_dq_results (with user_id)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 9: Return Response (Immediate)                         │
└─────────────────────────────────────────────────────────────┘
  {
    "pipeline_logging_id": "uuid",
    "tenant_id": "acme_corp_12312025",
    "status": "RUNNING",
    "message": "Pipeline triggered successfully"
  }
```

---

## Flow 3: Scheduled Pipeline Execution (Cloud Scheduler)

Cloud Scheduler uses **HTTP calls** (NOT Pub/Sub) to trigger three endpoints:
- Hourly: POST /api/v1/scheduler/trigger (triggers due pipelines)
- Every 5 min: POST /api/v1/scheduler/process-queue (processes queued pipelines)
- Daily: POST /api/v1/scheduler/reset-daily-quotas (resets quota counters)

### 3A: Scheduler Trigger (Hourly Job)

```
┌─────────────────────────────────────────────────────────────┐
│ CLOUD SCHEDULER: Hourly Trigger (Every Hour at :00)        │
└─────────────────────────────────────────────────────────────┘
  POST /api/v1/scheduler/trigger
  Headers:
    X-Admin-Key: <admin_api_key>
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Query Due Pipelines                                 │
└─────────────────────────────────────────────────────────────┘
  Query: tenants.tenant_pipeline_configs
  JOIN: tenants.tenant_profiles (status = ACTIVE)
  JOIN: tenants.tenant_subscriptions (get daily limits)
  JOIN: tenants.tenant_usage_quotas (check current usage)

  WHERE:
    - is_active = TRUE
    - next_run_time <= NOW()
    - tenant status = ACTIVE
    - pipelines_run_today < daily_limit
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: For Each Due Pipeline, Enqueue                     │
└─────────────────────────────────────────────────────────────┘
  For each pipeline config:

  1. INSERT INTO tenants.scheduled_pipeline_runs
     (run_id, config_id, tenant_id, pipeline_id, state='PENDING', ...)

  2. INSERT INTO tenants.pipeline_execution_queue
     (run_id, tenant_id, pipeline_id, state='QUEUED', priority, ...)

  3. UPDATE tenants.tenant_pipeline_configs
     SET next_run_time = <calculate from cron expression>
              ↓
┌─────────────────────────────────────────────────────────────┐
│ RESPONSE: Summary of Triggered Pipelines                   │
└─────────────────────────────────────────────────────────────┘
  {
    "triggered_count": 15,
    "queued_count": 15,
    "skipped_count": 0,
    "next_trigger_time": "2025-11-17T12:00:00Z"
  }
```

### 3B: Queue Processor (Every 5 Minutes)

```
┌─────────────────────────────────────────────────────────────┐
│ CLOUD SCHEDULER: Process Queue (Every 5 min)               │
└─────────────────────────────────────────────────────────────┘
  POST /api/v1/scheduler/process-queue
  Headers:
    X-Admin-Key: <admin_api_key>
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Get Next Queued Pipeline                           │
└─────────────────────────────────────────────────────────────┘
  SELECT run_id, tenant_id, pipeline_id
  FROM tenants.pipeline_execution_queue
  WHERE state = 'QUEUED'
  ORDER BY priority DESC, scheduled_time ASC
  LIMIT 1

  Result: run_id = "abc123", tenant_id = "acme_corp_12312025"
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Update Queue State to PROCESSING                   │
└─────────────────────────────────────────────────────────────┘
  UPDATE tenants.pipeline_execution_queue
  SET state = 'PROCESSING',
      processing_started_at = NOW()
  WHERE run_id = 'abc123'
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Get Pipeline Configuration                         │
└─────────────────────────────────────────────────────────────┘
  SELECT r.parameters, c.provider, c.domain, c.pipeline_template
  FROM tenants.scheduled_pipeline_runs r
  JOIN tenants.tenant_pipeline_configs c ON r.config_id = c.config_id
  WHERE r.run_id = 'abc123'

  Result: {provider: 'gcp', domain: 'cost', template: 'billing'}
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Execute Pipeline (Background Task)                 │
└─────────────────────────────────────────────────────────────┘
  AsyncPipelineExecutor(
    tenant_id='acme_corp_12312025',
    pipeline_id='gcp/cost/billing',
    trigger_type='scheduler',
    trigger_by='cloud_scheduler',
    user_id=None  // Scheduler has no user context
  ).execute(parameters)

  Logs to:
  - acme_corp_12312025.x_meta_pipeline_runs (user_id = NULL)
  - acme_corp_12312025.x_meta_step_logs (user_id = NULL)
  - acme_corp_12312025.x_meta_dq_results (user_id = NULL)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: On Success - Update Records                        │
└─────────────────────────────────────────────────────────────┘
  1. UPDATE tenants.scheduled_pipeline_runs
     SET state = 'COMPLETED', completed_at = NOW()
     WHERE run_id = 'abc123'

  2. UPDATE tenants.tenant_pipeline_configs
     SET last_run_time = NOW(), last_run_status = 'SUCCESS'
     WHERE config_id = <config_id>

  3. DELETE FROM tenants.pipeline_execution_queue
     WHERE run_id = 'abc123'
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: On Failure - Retry Logic                           │
└─────────────────────────────────────────────────────────────┘
  1. UPDATE tenants.scheduled_pipeline_runs
     SET state = 'FAILED', retry_count = retry_count + 1
     WHERE run_id = 'abc123'

  2. IF retry_count < max_retries (default 3):
     UPDATE tenants.pipeline_execution_queue
     SET state = 'QUEUED', priority = priority - 1
     WHERE run_id = 'abc123'

  3. ELSE:
     DELETE FROM tenants.pipeline_execution_queue
     WHERE run_id = 'abc123'
              ↓
┌─────────────────────────────────────────────────────────────┐
│ RESPONSE: Processing Status                                │
└─────────────────────────────────────────────────────────────┘
  {
    "processed": true,
    "pipeline_logging_id": "uuid",
    "tenant_id": "acme_corp_12312025",
    "pipeline_id": "gcp-cost-billing",
    "status": "PROCESSING",
    "message": "Pipeline started processing for tenant acme_corp_12312025"
  }
```

### 3C: Daily Quota Reset (Daily at Midnight UTC)

```
┌─────────────────────────────────────────────────────────────┐
│ CLOUD SCHEDULER: Reset Quotas (Daily at 00:00 UTC)         │
└─────────────────────────────────────────────────────────────┘
  POST /api/v1/scheduler/reset-daily-quotas
  Headers:
    X-Admin-Key: <admin_api_key>
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Reset All Daily Counters                           │
└─────────────────────────────────────────────────────────────┘
  UPDATE tenants.tenant_usage_quotas
  SET
    pipelines_run_today = 0,
    pipelines_succeeded_today = 0,
    pipelines_failed_today = 0,
    concurrent_pipelines_running = 0,
    last_updated = NOW()
  WHERE usage_date < CURRENT_DATE()

  Result: Updated 1,247 records
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Archive Old Records (>90 Days)                     │
└─────────────────────────────────────────────────────────────┘
  DELETE FROM tenants.tenant_usage_quotas
  WHERE usage_date < DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)

  Result: Archived 3,421 old records
              ↓
┌─────────────────────────────────────────────────────────────┐
│ RESPONSE: Reset Summary                                    │
└─────────────────────────────────────────────────────────────┘
  {
    "status": "success",
    "records_updated": 1247,
    "records_archived": 3421,
    "message": "Reset 1247 daily quotas, archived 3421 old records",
    "executed_at": "2025-11-17T00:00:05Z"
  }
```

---

## Summary: Three Cloud Scheduler Jobs

| Job Name | Schedule | Endpoint | Purpose |
|----------|----------|----------|---------|
| **Pipeline Trigger** | Hourly (0 * * * *) | POST /scheduler/trigger | Queries due pipelines and adds to queue |
| **Queue Processor** | Every 5 min (*/5 * * * *) | POST /scheduler/process-queue | Processes one queued pipeline at a time |
| **Quota Reset** | Daily (0 0 * * *) | POST /scheduler/reset-daily-quotas | Resets daily quota counters at midnight UTC |

### Key Tables Used by Scheduler

1. **tenants.tenant_pipeline_configs** - Stores scheduled pipeline configurations with cron expressions
2. **tenants.scheduled_pipeline_runs** - Tracks each scheduled run (PENDING → COMPLETED/FAILED)
3. **tenants.pipeline_execution_queue** - Active queue of pipelines to process (QUEUED → PROCESSING)
4. **tenants.tenant_usage_quotas** - Daily quota tracking (reset by scheduler)
5. **{tenant_id}.x_meta_pipeline_runs** - Execution logs (user_id = NULL for scheduled runs)
