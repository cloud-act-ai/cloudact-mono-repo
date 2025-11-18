# Complete Data Pipeline Flows

## Flow 1: Tenant Onboarding

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Frontend Calls Onboarding API                       │
└─────────────────────────────────────────────────────────────┘
  POST /api/v1/tenants/onboard
  Body: {
    "tenant_id": "acme_corp_12312025",
    "company_name": "ACME Corp",
    "admin_email": "admin@acme.com",
    "subscription_plan": "PROFESSIONAL"
  }
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Create Tenant Profile                               │
└─────────────────────────────────────────────────────────────┘
  INSERT INTO tenants.tenant_profiles
  (tenant_id, company_name, admin_email, status, subscription_plan)
  VALUES ('acme_corp_12312025', 'ACME Corp', 'admin@acme.com', 'ACTIVE', 'PROFESSIONAL')
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Generate and Store API Key                          │
└─────────────────────────────────────────────────────────────┘
  api_key = "acme_corp_12312025_api_xyz789"
  api_key_hash = SHA256(api_key)
  encrypted_api_key = KMS.encrypt(api_key)
  
  INSERT INTO tenants.tenant_api_keys
  (api_key_id, tenant_id, api_key_hash, encrypted_api_key, ...)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Create Subscription                                 │
└─────────────────────────────────────────────────────────────┘
  INSERT INTO tenants.tenant_subscriptions
  (subscription_id, tenant_id, plan_name, status, daily_limit=25)
  
  PROFESSIONAL Plan:
  - 25 pipelines/day
  - 750/month
  - 3 concurrent
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Create Usage Quota Tracker                          │
└─────────────────────────────────────────────────────────────┘
  INSERT INTO tenants.tenant_usage_quotas
  (usage_id, tenant_id, usage_date, pipelines_run_today=0, daily_limit=25)
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Create BigQuery Dataset                             │
└─────────────────────────────────────────────────────────────┘
  CREATE DATASET `project.acme_corp_12312025`
              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Create Metadata Tables in Tenant Dataset            │
└─────────────────────────────────────────────────────────────┘
  CREATE TABLE `acme_corp_12312025.x_meta_pipeline_runs`
  CREATE TABLE `acme_corp_12312025.x_meta_step_logs`
  CREATE TABLE `acme_corp_12312025.x_meta_dq_results`
  CREATE TABLE `acme_corp_12312025.x_meta_scheduled_runs`
  CREATE TABLE `acme_corp_12312025.x_meta_pipeline_queue`
              ↓
┌─────────────────────────────────────────────────────────────┐
│ RESPONSE: Return API Key (ONLY SHOWN ONCE!)                 │
└─────────────────────────────────────────────────────────────┘
  {
    "tenant_id": "acme_corp_12312025",
    "api_key": "acme_corp_12312025_api_xyz789",
    "dataset_created": true,
    "tables_created": ["x_meta_pipeline_runs", ...],
    "message": "Tenant onboarded successfully"
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

QUESTION TO CHECK: Does this use Pub/Sub or direct HTTP calls?
Which table stores scheduled pipelines?

(Will complete this after reviewing scheduler.py)
