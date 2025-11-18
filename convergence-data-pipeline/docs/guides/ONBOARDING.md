# Enterprise Multi-Tenant Onboarding Guide

## Overview

This guide covers the complete customer onboarding process for the Convergence Data Pipeline platform - an enterprise-grade, multi-tenant SaaS solution with centralized customer management, subscription plans, and production-ready security.

## Key Features

- **Customer-Centric Architecture**: Centralized customer management in `customers_metadata` dataset
- **Subscription Plans**: Three tiers (Starter, Professional, Enterprise) with quota enforcement
- **Complete Tenant Isolation**: Each customer gets a dedicated BigQuery dataset for data processing
- **Quota Management**: Monthly pipeline limits and concurrent execution controls
- **Active Status Enforcement**: Suspend/activate customers dynamically
- **Usage Tracking**: Real-time counters for billing and analytics
- **Enterprise Security**: KMS encryption, row-level security, API key rotation
- **Schema-Driven**: All table schemas in config files (zero hardcoded schemas)
- **Stripe Integration**: Ready for payment processing with Stripe webhooks

---

## Prerequisites

- Convergence Data Pipeline running (locally or deployed)
- API endpoint URL (e.g., `http://localhost:8080`)
- GCP project with BigQuery enabled
- Valid GCP service account with:
  - `roles/bigquery.dataEditor` - Create/modify datasets/tables
  - `roles/bigquery.jobUser` - Run queries
  - `roles/cloudkms.cryptoKeyEncrypterDecrypter` - Encrypt/decrypt secrets

---

## Complete Onboarding Workflow

### Frontend → Stripe → Backend Flow

```
Step 1: User signs up on frontend
  ↓
Step 2: Stripe checkout for subscription plan
  ↓
Step 3: Payment success → Stripe webhook
  ↓
Step 4: Backend receives webhook → Create customer
  ↓
Step 5: Provision infrastructure (dataset + tables)
  ↓
Step 6: Generate API key
  ↓
Step 7: Send welcome email with API key
  ↓
Step 8: Customer can start using platform
```

---

## Onboarding API

### Endpoint

```
POST /api/v1/customers/onboard
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenant_id` | string | ✅ Yes | Unique tenant identifier (alphanumeric + underscore, 3-50 chars) |
| `company_name` | string | ✅ Yes | Company or organization name |
| `contact_email` | string | ❌ No | Primary contact email for notifications |
| `subscription_plan` | string | ❌ No | Plan: "starter", "professional", "enterprise" (default: "starter") |
| `stripe_subscription_id` | string | ❌ No | Stripe subscription ID from webhook |
| `stripe_tenant_id` | string | ❌ No | Stripe customer ID from webhook |
| `force_recreate_dataset` | boolean | ❌ No | Delete and recreate dataset (⚠️ DESTRUCTIVE) |
| `force_recreate_tables` | boolean | ❌ No | Delete and recreate tables (⚠️ DESTRUCTIVE) |

### Example Request

```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acmeinc_23xv2",
    "company_name": "ACME Corporation",
    "contact_email": "admin@acmecorp.com",
    "subscription_tier": "PROFESSIONAL",
    "max_pipelines_per_month": 1000,
    "max_concurrent_pipelines": 5
  }'
```

### Response

```json
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
  "dataset_created": true,
  "tables_created": [
    "api_keys",
    "cloud_credentials",
    "tenants",
    "pipeline_runs",
    "step_logs",
    "dq_results"
  ],
  "tenant_status": {
    "is_active": true,
    "subscription_tier": "PROFESSIONAL",
    "max_pipelines_per_month": 1000,
    "max_concurrent_pipelines": 5,
    "pipeline_runs_count": 0,
    "pipeline_runs_this_month": 0,
    "current_running_pipelines": 0
  },
  "dryrun_status": "SUCCESS",
  "message": "Customer acmeinc_23xv2 onboarded successfully. Save your API key - it will only be shown once!"
}
```

**⚠️ CRITICAL:** Save the `api_key` immediately! It's shown only once and cannot be retrieved later.

---

## What Gets Created

### 1. BigQuery Dataset

```
Project: gac-prod-471220
Dataset: acmeinc_23xv2
Location: US
Labels: tenant=acmeinc_23xv2
```

### 2. Central Customer Record

A record is created in the centralized `customers_metadata` dataset:

#### `customers_metadata.customers` - Core Customer Information
- Tenant ID (UUID), tenant ID, company name
- Subscription plan and status
- Dataset ID for tenant data

#### `customers_metadata.tenant_subscriptions` - Subscription & Quotas
- Subscription plan (starter/professional/enterprise)
- Monthly pipeline quota, concurrent pipeline quota, storage quota
- Stripe subscription ID and customer ID
- Billing cycle dates

#### `customers_metadata.tenant_api_keys` - API Keys (Centralized)
- SHA256 hashed and KMS-encrypted API keys
- Scopes, expiration, last used timestamp
- Centralized across all customers

#### `customers_metadata.customer_usage` - Usage Tracking
- Real-time usage counters per month
- Pipelines run count, currently running count
- Storage used, compute hours

### 3. Metadata Tables (Per-Customer Dataset)

The following tables are created in the customer's dataset from schema files in `templates/customer/onboarding/schemas/`:

#### `x_meta_api_keys` - Legacy API Keys (for backward compatibility)
- Stores customer-specific API keys
- Schema: `templates/customer/onboarding/schemas/x_meta_api_keys.json`

**Tenant Fields:**
```json
{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_tier": "PROFESSIONAL",
  "is_active": true,
  "max_pipelines_per_month": 1000,
  "max_concurrent_pipelines": 5,
  "pipeline_runs_count": 0,
  "pipeline_runs_this_month": 0,
  "current_running_pipelines": 0,
  "last_pipeline_run_at": null,
  "quota_reset_date": "2025-11-01",
  "created_at": "2025-11-15T10:00:00Z",
  "updated_at": "2025-11-15T10:00:00Z"
}
```

#### `x_meta_cloud_credentials` - Cloud Provider Credentials
- Stores encrypted credentials for GCP, AWS, Azure
- Schema: `templates/customer/onboarding/schemas/x_meta_cloud_credentials.json`

#### `x_meta_pipeline_runs` - Pipeline Execution Tracking
- Tracks all pipeline executions
- Stores status, timestamps, parameters
- Schema: `templates/customer/onboarding/schemas/x_meta_pipeline_runs.json`

#### `x_meta_step_logs` - Step-by-Step Execution Logs
- Detailed logs for each pipeline step
- Tracks rows processed, duration, errors
- Schema: `templates/customer/onboarding/schemas/x_meta_step_logs.json`

#### `x_meta_dq_results` - Data Quality Results
- Stores data quality check results
- Schema: `templates/customer/onboarding/schemas/x_meta_dq_results.json`

### 3. API Key Generation

```
Format: {tenant_id}_api_{random_16_chars}
Example: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt

Security Layers:
  ├─ SHA256 hash → Stored in api_keys.api_key_hash (fast lookup)
  ├─ KMS encryption → Stored in api_keys.encrypted_api_key
  └─ Show once → Returned only during onboarding
```

---

## Subscription Tiers

| Tier | Monthly Pipelines | Concurrent Pipelines | Features |
|------|-------------------|---------------------|----------|
| **FREE** | 100 | 1 | Basic features, community support |
| **STARTER** | 500 | 3 | Email support, basic SLA |
| **PROFESSIONAL** | 2,000 | 10 | Priority support, 99.5% SLA |
| **ENTERPRISE** | Unlimited | Unlimited | Dedicated support, 99.9% SLA, custom features |

---

## Quota Management

### How Quotas Work

1. **Before Pipeline Execution**:
   - System checks `tenants.is_active` (must be TRUE)
   - Validates `pipeline_runs_this_month < max_pipelines_per_month`
   - Validates `current_running_pipelines < max_concurrent_pipelines`
   - Returns HTTP 403 if inactive, HTTP 429 if quota exceeded

2. **During Pipeline Execution**:
   - Increments `pipeline_runs_count` (lifetime counter)
   - Increments `pipeline_runs_this_month` (monthly counter)
   - Increments `current_running_pipelines` (concurrent counter)
   - Updates `last_pipeline_run_at` timestamp

3. **After Pipeline Completion**:
   - Decrements `current_running_pipelines`
   - Keeps monthly and lifetime counters unchanged

4. **Monthly Reset** (automated):
   - On 1st day of each month, reset `pipeline_runs_this_month = 0`
   - Update `quota_reset_date` to current month

### Update Quotas

Frontend can update quotas and tier via re-onboarding:

```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acmeinc_23xv2",
    "company_name": "ACME Corporation",
    "subscription_tier": "ENTERPRISE",
    "max_pipelines_per_month": null,
    "max_concurrent_pipelines": null
  }'
```

**Note**: Existing dataset and tables are preserved unless force flags are set.

### Suspend/Activate Tenant

```sql
-- Suspend tenant
UPDATE `gac-prod-471220.acmeinc_23xv2.tenants`
SET
  is_active = FALSE,
  suspended_at = CURRENT_TIMESTAMP(),
  suspension_reason = 'PAYMENT_FAILED',
  updated_at = CURRENT_TIMESTAMP()
WHERE tenant_id = 'acmeinc_23xv2';

-- Activate tenant
UPDATE `gac-prod-471220.acmeinc_23xv2.tenants`
SET
  is_active = TRUE,
  suspended_at = NULL,
  suspension_reason = NULL,
  updated_at = CURRENT_TIMESTAMP()
WHERE tenant_id = 'acmeinc_23xv2';
```

---

## Pipeline Execution with Quota Enforcement

### Trigger Pipeline

```bash
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/acmeinc_23xv2/gcp/cost/bill-export" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-15",
    "trigger_by": "scheduler"
  }'
```

### Execution Flow with Quota Checks

```
Step 1: Authenticate API Key
  ↓
Step 2: Verify Tenant is Active (tenants.is_active = TRUE)
  → If FALSE: HTTP 403 "Tenant account is inactive"
  ↓
Step 3: Check Monthly Quota
  → If pipeline_runs_this_month >= max_pipelines_per_month:
    HTTP 429 "Monthly pipeline quota exceeded"
  ↓
Step 4: Check Concurrent Quota
  → If current_running_pipelines >= max_concurrent_pipelines:
    HTTP 429 "Concurrent pipeline limit reached"
  ↓
Step 5: Validate Tenant ID Match (URL vs API key)
  → If mismatch: HTTP 403 "Tenant ID mismatch"
  ↓
Step 6: Execute Pipeline
  ↓
Step 7: Increment Usage Counters
  - pipeline_runs_count++
  - pipeline_runs_this_month++
  - current_running_pipelines++
  - last_pipeline_run_at = NOW()
  ↓
Step 8: On Pipeline Completion
  - current_running_pipelines--
```

### Error Responses

#### Inactive Tenant
```json
{
  "detail": "Tenant account is inactive. Contact support to reactivate.",
  "tenant_id": "acmeinc_23xv2",
  "status_code": 403
}
```

#### Monthly Quota Exceeded
```json
{
  "detail": "Monthly pipeline quota exceeded. Used 1000/1000 pipelines this month.",
  "tenant_id": "acmeinc_23xv2",
  "quota_reset_date": "2025-12-01",
  "status_code": 429
}
```

#### Concurrent Limit Reached
```json
{
  "detail": "Concurrent pipeline limit reached. 5/5 pipelines currently running.",
  "tenant_id": "acmeinc_23xv2",
  "status_code": 429
}
```

---

## Verification & Monitoring

### Check Tenant Status

```sql
SELECT
  tenant_id,
  company_name,
  subscription_tier,
  is_active,
  max_pipelines_per_month,
  max_concurrent_pipelines,
  pipeline_runs_count,
  pipeline_runs_this_month,
  current_running_pipelines,
  last_pipeline_run_at,
  quota_reset_date,
  created_at
FROM `gac-prod-471220.acmeinc_23xv2.tenants`
WHERE tenant_id = 'acmeinc_23xv2';
```

### Check Usage This Month

```sql
SELECT
  COUNT(*) as total_runs,
  SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
  AVG(duration_ms) as avg_duration_ms
FROM `gac-prod-471220.acmeinc_23xv2.pipeline_runs`
WHERE tenant_id = 'acmeinc_23xv2'
  AND start_time >= DATE_TRUNC(CURRENT_DATE(), MONTH);
```

### Check Currently Running Pipelines

```sql
SELECT
  pipeline_logging_id,
  pipeline_id,
  start_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), start_time, MINUTE) as running_minutes
FROM `gac-prod-471220.acmeinc_23xv2.pipeline_runs`
WHERE tenant_id = 'acmeinc_23xv2'
  AND status IN ('PENDING', 'RUNNING')
ORDER BY start_time DESC;
```

### Verify Dataset Created

```bash
bq ls --project_id=gac-prod-471220 | grep acmeinc_23xv2
```

### Verify Tables Created

```bash
bq ls --project_id=gac-prod-471220 acmeinc_23xv2
```

Expected output:
```
api_keys
cloud_credentials
tenants
pipeline_runs
step_logs
dq_results
```

---

## Multi-Tenant Onboarding Script

Onboard multiple tenants with different tiers:

```bash
#!/bin/bash
# onboard-multiple-customers.sh

API_URL="http://localhost:8080"

# Define customers with their tiers
declare -A CUSTOMERS=(
  ["acmeinc_23xv2"]="ACME Corporation,PROFESSIONAL,1000,5"
  ["techcorp_99zx4"]="Tech Corp Ltd,ENTERPRISE,null,null"
  ["startupco_55abc"]="Startup Co,STARTER,500,3"
)

for TENANT_ID in "${!CUSTOMERS[@]}"; do
  IFS=',' read -r COMPANY TIER MONTHLY CONCURRENT <<< "${CUSTOMERS[$TENANT_ID]}"

  echo "Onboarding ${TENANT_ID} (${TIER})..."

  curl -X POST "${API_URL}/api/v1/customers/onboard" \
    -H "Content-Type: application/json" \
    -d "{
      \"tenant_id\": \"${TENANT_ID}\",
      \"company_name\": \"${COMPANY}\",
      \"subscription_tier\": \"${TIER}\",
      \"max_pipelines_per_month\": ${MONTHLY},
      \"max_concurrent_pipelines\": ${CONCURRENT}
    }" | jq '.'

  echo "✓ Onboarded ${TENANT_ID}"
  echo ""
done
```

---

## Architecture

### Dataset-Per-Tenant Model

```
BigQuery Project (gac-prod-471220)
│
├── acmeinc_23xv2/              (Tenant 1 - PROFESSIONAL)
│   ├── x_meta_api_keys
│   ├── x_meta_cloud_credentials
│   ├── x_meta_tenants                 ← Quota & status tracking
│   ├── x_meta_pipeline_runs
│   ├── x_meta_step_logs
│   ├── x_meta_dq_results
│   └── <pipeline outputs>
│
├── techcorp_99zx4/             (Tenant 2 - ENTERPRISE)
│   ├── x_meta_api_keys
│   ├── x_meta_tenants
│   └── ...
│
└── startupco_55abc/            (Tenant 3 - STARTER)
    ├── x_meta_api_keys
    ├── x_meta_tenants
    └── ...
```

### Key Design Principles

1. **Complete Tenant Isolation**: Each tenant = separate BigQuery dataset
2. **No Cross-Tenant Queries**: Zero data leakage between tenants
3. **Schema-Driven**: All table schemas in `templates/customer/onboarding/schemas/*.json`
4. **Quota Enforcement**: Checked before every pipeline execution
5. **Real-Time Tracking**: Usage counters updated atomically
6. **Production-Ready**: Enterprise security, monitoring, and error handling

---

## Frontend Integration

### Onboarding Workflow

1. **Create Tenant** (Frontend → API):
   ```javascript
   POST /api/v1/customers/onboard
   {
     tenant_id, company_name, subscription_tier,
     max_pipelines_per_month, max_concurrent_pipelines
   }
   ```

2. **Save API Key** (Frontend):
   - Display API key in secure modal
   - Force user to copy before dismissing
   - Log onboarding event

3. **Update Quotas** (Frontend → API):
   - Re-call onboarding endpoint with new quotas
   - Preserves dataset and tables

4. **Suspend Tenant** (Frontend → BigQuery):
   ```sql
   UPDATE tenants SET is_active = FALSE WHERE tenant_id = ?
   ```

### Scheduler Integration

Scheduler triggers pipelines independently:

```bash
# Scheduler cron job
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/${TENANT_ID}/${PROVIDER}/${DOMAIN}/${PIPELINE}" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{"trigger_by": "scheduler"}'
```

Quota checks happen automatically - no scheduler changes needed.

---

## Troubleshooting

### Issue: Tenant Account Inactive

**Error**: `HTTP 403 - Tenant account is inactive`

**Solution**:
```sql
-- Check tenant status
SELECT is_active, suspended_at, suspension_reason
FROM `gac-prod-471220.{tenant_id}.tenants`;

-- Reactivate if needed
UPDATE `gac-prod-471220.{tenant_id}.tenants`
SET is_active = TRUE, suspended_at = NULL
WHERE tenant_id = '{tenant_id}';
```

### Issue: Monthly Quota Exceeded

**Error**: `HTTP 429 - Monthly pipeline quota exceeded`

**Solution**:
```sql
-- Check current usage
SELECT
  pipeline_runs_this_month,
  max_pipelines_per_month,
  quota_reset_date
FROM `gac-prod-471220.{tenant_id}.tenants`;

-- Option 1: Upgrade tier (via re-onboarding)
-- Option 2: Wait for monthly reset (1st of next month)
-- Option 3: Manually reset (admin only)
UPDATE `gac-prod-471220.{tenant_id}.tenants`
SET pipeline_runs_this_month = 0
WHERE tenant_id = '{tenant_id}';
```

### Issue: Concurrent Limit Reached

**Error**: `HTTP 429 - Concurrent pipeline limit reached`

**Solution**:
```sql
-- Check running pipelines
SELECT COUNT(*) as running
FROM `gac-prod-471220.{tenant_id}.pipeline_runs`
WHERE status IN ('PENDING', 'RUNNING');

-- If counter mismatch (pipelines completed but counter not decremented):
-- Recalculate from pipeline_runs
UPDATE `gac-prod-471220.{tenant_id}.tenants`
SET current_running_pipelines = (
  SELECT COUNT(*)
  FROM `gac-prod-471220.{tenant_id}.pipeline_runs`
  WHERE status IN ('PENDING', 'RUNNING')
)
WHERE tenant_id = '{tenant_id}';
```

---

## Security Best Practices

1. **API Keys**:
   - Generated once, never retrievable
   - SHA256 hashed for lookup
   - KMS encrypted for storage
   - Rotate regularly (re-onboard)

2. **Tenant Isolation**:
   - URL tenant_id must match API key tenant
   - No cross-tenant data access
   - Separate datasets per tenant

3. **Quota Enforcement**:
   - Checked before every pipeline run
   - Atomic counter updates
   - Monthly automatic resets

4. **Permissions**:
   - Service account: minimum required roles
   - No BigQuery admin access needed
   - KMS decrypt only for API keys

---

## Next Steps

1. **Onboard Your First Tenant**: Use the onboarding API with quota limits
2. **Test Pipeline Execution**: Trigger a pipeline and verify quota checks
3. **Monitor Usage**: Query tenants table for real-time usage
4. **Configure Frontend**: Integrate onboarding into your admin panel
5. **Set Up Scheduler**: Configure pipeline triggers independently

---

## Reference Documentation

- **MULTI_TENANCY_IMPROVEMENTS.md** - Design specifications
- **IMPLEMENTATION_SUMMARY.md** - Implementation guide
- **templates/customer/onboarding/schemas/x_meta_tenants.json** - Tenant table schema
- **README.md** - Platform overview
- **TECHNICAL_IMPLEMENTATION.md** - Technical architecture

---

**Version**: 2.0 (Enterprise Multi-Tenancy)
**Last Updated**: November 2025
**Status**: Production Ready
