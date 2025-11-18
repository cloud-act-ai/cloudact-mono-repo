# Enterprise Multi-Tenant Onboarding Guide

## Overview

This guide covers the complete onboarding process for the Convergence Data Pipeline platform - an enterprise-grade, multi-user tenant SaaS solution with separated tenant (organization) and user (individual) management.

## Key Features

- **Multi-User Tenant Architecture**: Separate tenant (organization) and user (individual) entities
- **Tenant-Level Billing**: One stripe_tenant_id per organization with multiple users
- **User-Level Tracking**: Track which user triggered each pipeline run via user_id
- **Subscription Plans**: Three tiers (Starter, Professional, Enterprise) with quota enforcement
- **Complete Tenant Isolation**: Each tenant gets a dedicated BigQuery dataset for data processing
- **Quota Management**: Tenant-level monthly pipeline limits and concurrent execution controls
- **Active Status Enforcement**: Suspend/activate tenants and users independently
- **Usage Tracking**: Real-time counters for billing and per-user analytics
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

## Tenant vs User Model

### Understanding the Separation

```
Tenant (Organization Level)
├─ tenant_id: "acme_corp"
├─ stripe_tenant_id: "cus_stripe123" (for billing)
├─ API Keys (tenant-level authentication)
├─ Subscriptions (tenant-level billing)
├─ Usage Quotas (tenant-level limits)
└─ Users (Team Members)
   ├─ user_id: "alice_uuid_123" (Owner)
   ├─ user_id: "bob_uuid_456" (Admin)
   └─ user_id: "charlie_uuid_789" (Member)
```

**Key Concepts:**
- **tenant_id**: Organization identifier (one per company)
- **user_id**: Individual user identifier (many users per tenant)
- **Sign-up**: Creates user_id for the individual
- **Onboarding**: Creates tenant_id for the organization
- **Billing**: Tenant-level via stripe_tenant_id
- **Tracking**: User-level via user_id in pipeline_runs, step_logs, etc.
- **API Requests**: Require **both** X-API-Key (tenant) + X-User-ID (user)

---

## Complete Onboarding Workflow

### Flow 1: Tenant Onboarding (Organization Setup)

This flow creates the organization and infrastructure.

```
Step 1: User signs up on frontend
  → Creates user_id (e.g., "alice_uuid_123")
  ↓
Step 2: User creates organization (tenant)
  → Provides company name, selects plan
  ↓
Step 3: Stripe checkout for subscription plan
  → Creates stripe_tenant_id
  ↓
Step 4: Payment success → Stripe webhook
  ↓
Step 5: Backend receives webhook → Create tenant
  → POST /api/v1/tenants/onboard
  → tenant_id, stripe_tenant_id, created_by_user_id
  ↓
Step 6: Provision infrastructure (dataset + tables)
  → Creates BigQuery dataset
  → Creates tables: tenants, users, x_meta_*
  ↓
Step 7: Generate tenant API key
  → Format: {tenant_id}_api_{random}
  ↓
Step 8: Create owner user in users table
  → user_id, tenant_id, role=OWNER
  ↓
Step 9: Send welcome email with API key
  → To created_by_user_id email
  ↓
Step 10: Tenant ready - owner can invite team members
```

### Flow 2: User Onboarding (Team Member Invite)

This flow adds additional users to an existing tenant.

```
Step 1: Owner/Admin invites team member
  → POST /api/v1/tenants/{tenant_id}/users
  → Requires X-API-Key + X-User-ID (inviter)
  ↓
Step 2: User record created
  → user_id, tenant_id, role, is_active=true
  → created_by_user_id (who invited them)
  ↓
Step 3: Send invitation email
  → User receives invite link
  ↓
Step 4: User accepts invite
  → Frontend authenticates user
  → User gets user_id from invitation
  ↓
Step 5: User can access platform
  → Uses tenant's X-API-Key
  → Provides their own X-User-ID
  → All actions tracked under their user_id
```

---

## Tenant Onboarding API

### Endpoint

```
POST /api/v1/tenants/onboard
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenant_id` | string | ✅ Yes | Unique tenant identifier (alphanumeric + underscore, 3-50 chars) |
| `company_name` | string | ✅ Yes | Company or organization name |
| `contact_email` | string | ❌ No | Primary contact email for notifications |
| `subscription_plan` | string | ❌ No | Plan: "starter", "professional", "enterprise" (default: "starter") |
| `stripe_subscription_id` | string | ❌ No | Stripe subscription ID from webhook |
| `stripe_tenant_id` | string | ❌ No | Stripe customer ID from webhook (for billing) |
| `created_by_user_id` | string | ✅ Yes | User ID of the person creating the tenant (becomes owner) |
| `force_recreate_dataset` | boolean | ❌ No | Delete and recreate dataset (⚠️ DESTRUCTIVE) |
| `force_recreate_tables` | boolean | ❌ No | Delete and recreate tables (⚠️ DESTRUCTIVE) |

### Example Request

```bash
curl -X POST "http://localhost:8080/api/v1/tenants/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "ACME Corporation",
    "contact_email": "admin@acmecorp.com",
    "subscription_plan": "professional",
    "stripe_tenant_id": "cus_stripe123",
    "created_by_user_id": "alice_uuid_123",
    "force_recreate_dataset": false,
    "force_recreate_tables": false
  }'
```

### Response

```json
{
  "tenant_id": "acme_corp",
  "api_key": "acme_corp_api_xK9mPqWz7LnR4vYt",
  "stripe_tenant_id": "cus_stripe123",
  "dataset_created": true,
  "tables_created": [
    "tenants",
    "users",
    "x_meta_api_keys",
    "x_meta_cloud_credentials",
    "x_meta_pipeline_runs",
    "x_meta_step_logs",
    "x_meta_dq_results"
  ],
  "owner_user_id": "alice_uuid_123",
  "tenant_status": {
    "is_active": true,
    "subscription_plan": "professional",
    "max_pipelines_per_month": 1000,
    "max_concurrent_pipelines": 5,
    "pipeline_runs_count": 0,
    "pipeline_runs_this_month": 0,
    "current_running_pipelines": 0
  },
  "message": "Tenant acme_corp onboarded successfully. Save your API key - it will only be shown once!"
}
```

**⚠️ CRITICAL:** Save the `api_key` immediately! It's shown only once and cannot be retrieved later.

---

## User Management API

### Create User (Add Team Member)

**Endpoint:**
```
POST /api/v1/tenants/{tenant_id}/users
```

**Headers:**
```
X-API-Key: {tenant_api_key}
X-User-ID: {inviter_user_id}
```

**Request Body:**
```json
{
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "created_by_user_id": "alice_uuid_123"
}
```

**Response:**
```json
{
  "user_id": "bob_uuid_456",
  "tenant_id": "acme_corp",
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "is_active": true,
  "created_at": "2025-11-17T10:30:00Z",
  "created_by_user_id": "alice_uuid_123",
  "message": "User created successfully"
}
```

### List Users in Tenant

**Endpoint:**
```
GET /api/v1/tenants/{tenant_id}/users
```

**Headers:**
```
X-API-Key: {tenant_api_key}
X-User-ID: {requesting_user_id}
```

**Response:**
```json
{
  "users": [
    {
      "user_id": "alice_uuid_123",
      "email": "alice@acmecorp.com",
      "name": "Alice Johnson",
      "role": "OWNER",
      "is_active": true,
      "created_at": "2025-11-17T10:00:00Z"
    },
    {
      "user_id": "bob_uuid_456",
      "email": "bob@acmecorp.com",
      "name": "Bob Smith",
      "role": "ADMIN",
      "is_active": true,
      "created_at": "2025-11-17T10:30:00Z"
    }
  ],
  "total": 2
}
```

### Deactivate User

**Endpoint:**
```
POST /api/v1/tenants/{tenant_id}/users/{user_id}/deactivate
```

**Headers:**
```
X-API-Key: {tenant_api_key}
X-User-ID: {admin_user_id}
```

**Response:**
```json
{
  "user_id": "bob_uuid_456",
  "is_active": false,
  "deactivated_at": "2025-11-17T15:00:00Z",
  "message": "User deactivated successfully"
}
```

---

## What Gets Created

### 1. BigQuery Dataset

```
Project: gac-prod-471220
Dataset: acme_corp
Location: US
Labels: tenant=acme_corp
```

### 2. Tenant & User Tables (Per-Tenant Dataset)

The following tables are created in the tenant's dataset from schema files in `config/schemas/`:

#### `tenants` - Tenant Information
- tenant_id, company_name, contact_email
- subscription_plan (starter/professional/enterprise)
- stripe_tenant_id (for billing)
- Subscription quotas and usage tracking
- Schema: `config/schemas/tenants.json`

**Example Record:**
```json
{
  "tenant_id": "acme_corp",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional",
  "stripe_tenant_id": "cus_stripe123",
  "is_active": true,
  "max_pipelines_per_month": 1000,
  "max_concurrent_pipelines": 5,
  "pipeline_runs_count": 0,
  "pipeline_runs_this_month": 0,
  "current_running_pipelines": 0,
  "last_pipeline_run_at": null,
  "quota_reset_date": "2025-12-01",
  "created_at": "2025-11-17T10:00:00Z",
  "updated_at": "2025-11-17T10:00:00Z"
}
```

#### `users` - Team Members
- user_id, tenant_id, email, name
- role (OWNER, ADMIN, MEMBER, VIEWER)
- is_active, created_by_user_id
- Schema: `config/schemas/users.json`

**Example Records:**
```json
[
  {
    "user_id": "alice_uuid_123",
    "tenant_id": "acme_corp",
    "email": "alice@acmecorp.com",
    "name": "Alice Johnson",
    "role": "OWNER",
    "is_active": true,
    "created_at": "2025-11-17T10:00:00Z",
    "created_by_user_id": "alice_uuid_123"
  },
  {
    "user_id": "bob_uuid_456",
    "tenant_id": "acme_corp",
    "email": "bob@acmecorp.com",
    "name": "Bob Smith",
    "role": "ADMIN",
    "is_active": true,
    "created_at": "2025-11-17T10:30:00Z",
    "created_by_user_id": "alice_uuid_123"
  }
]
```

#### `x_meta_api_keys` - Tenant API Keys
- Stores tenant-specific API keys
- SHA256 hashed and KMS-encrypted
- Schema: `config/schemas/x_meta_api_keys.json`

#### `x_meta_cloud_credentials` - Cloud Provider Credentials
- Stores encrypted credentials for GCP, AWS, Azure
- tenant_id for isolation
- Schema: `config/schemas/x_meta_cloud_credentials.json`

#### `x_meta_pipeline_runs` - Pipeline Execution Tracking
- Tracks all pipeline executions
- **Includes user_id** to track who triggered each run
- Stores status, timestamps, parameters
- Schema: `config/schemas/x_meta_pipeline_runs.json`

**Example Record:**
```json
{
  "pipeline_logging_id": "run_uuid_abc123",
  "pipeline_id": "p_openai_billing",
  "tenant_id": "acme_corp",
  "user_id": "alice_uuid_123",
  "status": "completed",
  "start_time": "2025-11-17T10:45:00Z",
  "end_time": "2025-11-17T10:47:32Z",
  "rows_processed": 1500,
  "trigger_by": "api_user"
}
```

#### `x_meta_step_logs` - Step-by-Step Execution Logs
- Detailed logs for each pipeline step
- **Includes user_id** from parent pipeline_run
- Tracks rows processed, duration, errors
- Schema: `config/schemas/x_meta_step_logs.json`

#### `x_meta_dq_results` - Data Quality Results
- Stores data quality check results
- **Includes user_id** from parent pipeline_run
- Schema: `config/schemas/x_meta_dq_results.json`

### 3. API Key Generation

```
Format: {tenant_id}_api_{random_16_chars}
Example: acme_corp_api_xK9mPqWz7LnR4vYt

Security Layers:
  ├─ SHA256 hash → Stored in x_meta_api_keys.api_key_hash (fast lookup)
  ├─ KMS encryption → Stored in x_meta_api_keys.encrypted_api_key
  └─ Show once → Returned only during onboarding

Note: API key is tenant-level, but requires X-User-ID header for all requests
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

## Pipeline Execution with User Tracking

### Trigger Pipeline (Requires Both Headers)

```bash
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/p_openai_billing" \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-17",
    "trigger_by": "api_user"
  }'
```

### Execution Flow with User & Quota Checks

```
Step 1: Authenticate API Key (X-API-Key)
  → Extracts tenant_id from API key
  ↓
Step 2: Validate User ID (X-User-ID)
  → Verifies user exists in users table
  → Verifies user belongs to tenant
  → Verifies user is active (is_active = TRUE)
  → If not found: HTTP 403 "User not in tenant"
  → If deactivated: HTTP 403 "User account deactivated"
  ↓
Step 3: Verify Tenant is Active (tenants.is_active = TRUE)
  → If FALSE: HTTP 403 "Tenant account is inactive"
  ↓
Step 4: Check Monthly Quota (tenant-level)
  → If pipeline_runs_this_month >= max_pipelines_per_month:
    HTTP 429 "Monthly pipeline quota exceeded"
  ↓
Step 5: Check Concurrent Quota (tenant-level)
  → If current_running_pipelines >= max_concurrent_pipelines:
    HTTP 429 "Concurrent pipeline limit reached"
  ↓
Step 6: Execute Pipeline
  ↓
Step 7: Record in x_meta_pipeline_runs
  - pipeline_logging_id (unique run ID)
  - tenant_id (from API key)
  - user_id (from X-User-ID header)
  - status = "running"
  - start_time = NOW()
  ↓
Step 8: Increment Tenant Usage Counters
  - pipeline_runs_count++
  - pipeline_runs_this_month++
  - current_running_pipelines++
  - last_pipeline_run_at = NOW()
  ↓
Step 9: On Pipeline Completion
  - Update pipeline_run status = "completed"
  - Decrement current_running_pipelines--
  - user_id remains in record for audit
```

### Error Responses

#### User Not in Tenant
```json
{
  "detail": "User does not belong to this tenant",
  "user_id": "alice_uuid_123",
  "tenant_id": "acme_corp",
  "error_code": "USER_NOT_IN_TENANT",
  "status_code": 403
}
```

#### User Deactivated
```json
{
  "detail": "User account is deactivated",
  "user_id": "bob_uuid_456",
  "error_code": "USER_DEACTIVATED",
  "status_code": 403
}
```

#### Inactive Tenant
```json
{
  "detail": "Tenant account is inactive. Contact support to reactivate.",
  "tenant_id": "acme_corp",
  "status_code": 403
}
```

#### Monthly Quota Exceeded
```json
{
  "detail": "Monthly pipeline quota exceeded. Used 1000/1000 pipelines this month.",
  "tenant_id": "acme_corp",
  "quota_reset_date": "2025-12-01",
  "status_code": 429
}
```

#### Concurrent Limit Reached
```json
{
  "detail": "Concurrent pipeline limit reached. 5/5 pipelines currently running.",
  "tenant_id": "acme_corp",
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
  subscription_plan,
  stripe_tenant_id,
  is_active,
  max_pipelines_per_month,
  max_concurrent_pipelines,
  pipeline_runs_count,
  pipeline_runs_this_month,
  current_running_pipelines,
  last_pipeline_run_at,
  quota_reset_date,
  created_at
FROM `gac-prod-471220.acme_corp.tenants`
WHERE tenant_id = 'acme_corp';
```

### Check Users in Tenant

```sql
SELECT
  user_id,
  email,
  name,
  role,
  is_active,
  created_at,
  created_by_user_id,
  last_login_at
FROM `gac-prod-471220.acme_corp.users`
WHERE tenant_id = 'acme_corp'
ORDER BY created_at;
```

### Check Usage This Month (with user breakdown)

```sql
SELECT
  user_id,
  COUNT(*) as total_runs,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(TIMESTAMP_DIFF(end_time, start_time, SECOND)) as avg_duration_seconds
FROM `gac-prod-471220.acme_corp.x_meta_pipeline_runs`
WHERE tenant_id = 'acme_corp'
  AND start_time >= DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY user_id
ORDER BY total_runs DESC;
```

### Check Currently Running Pipelines (with user info)

```sql
SELECT
  pr.pipeline_logging_id,
  pr.pipeline_id,
  pr.tenant_id,
  pr.user_id,
  u.email as user_email,
  u.name as user_name,
  pr.start_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), pr.start_time, MINUTE) as running_minutes
FROM `gac-prod-471220.acme_corp.x_meta_pipeline_runs` pr
LEFT JOIN `gac-prod-471220.acme_corp.users` u
  ON pr.user_id = u.user_id AND pr.tenant_id = u.tenant_id
WHERE pr.tenant_id = 'acme_corp'
  AND pr.status IN ('pending', 'running')
ORDER BY pr.start_time DESC;
```

### Verify Dataset Created

```bash
bq ls --project_id=gac-prod-471220 | grep acme_corp
```

### Verify Tables Created

```bash
bq ls --project_id=gac-prod-471220 acme_corp
```

Expected output:
```
tenants
users
x_meta_api_keys
x_meta_cloud_credentials
x_meta_pipeline_runs
x_meta_step_logs
x_meta_dq_results
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

### Dataset-Per-Tenant Model with Multi-User Support

```
BigQuery Project (gac-prod-471220)
│
├── acme_corp/                  (Tenant 1 - PROFESSIONAL)
│   ├── tenants                 ← Tenant info & quotas
│   ├── users                   ← Team members (alice, bob, charlie)
│   ├── x_meta_api_keys         ← Tenant-level API keys
│   ├── x_meta_cloud_credentials
│   ├── x_meta_pipeline_runs    ← Tracks tenant_id + user_id per run
│   ├── x_meta_step_logs        ← Tracks user_id per step
│   ├── x_meta_dq_results       ← Tracks user_id per test
│   └── <pipeline outputs>      ← Raw & processed data
│
├── tech_corp/                  (Tenant 2 - ENTERPRISE)
│   ├── tenants
│   ├── users                   ← Different team members
│   ├── x_meta_api_keys
│   ├── x_meta_pipeline_runs    ← User tracking separate from Tenant 1
│   └── ...
│
└── startup_co/                 (Tenant 3 - STARTER)
    ├── tenants
    ├── users
    └── ...
```

### Key Design Principles

1. **Complete Tenant Isolation**: Each tenant = separate BigQuery dataset
2. **Multi-User Support**: Multiple users per tenant with role-based access
3. **User-Level Tracking**: All pipeline runs, steps, and DQ tests track user_id
4. **Tenant-Level Billing**: stripe_tenant_id for organization billing
5. **Tenant-Level Quotas**: Limits enforced at organization level, not per user
6. **No Cross-Tenant Queries**: Zero data leakage between tenants
7. **Schema-Driven**: All table schemas in `config/schemas/*.json`
8. **Quota Enforcement**: Checked before every pipeline execution
9. **Real-Time Tracking**: Usage counters updated atomically
10. **Production-Ready**: Enterprise security, monitoring, and error handling

---

## Frontend Integration

### Tenant Onboarding Workflow

1. **Create Tenant** (Frontend → API):
   ```javascript
   POST /api/v1/tenants/onboard
   {
     tenant_id,
     company_name,
     subscription_plan,
     stripe_tenant_id,
     created_by_user_id  // User who signs up becomes owner
   }
   ```

2. **Save API Key** (Frontend):
   - Display API key in secure modal
   - Force user to copy before dismissing
   - Log onboarding event
   - Store tenant_id and owner user_id

3. **Update Quotas** (Frontend → API):
   - Re-call onboarding endpoint with new quotas
   - Preserves dataset and tables

4. **Suspend Tenant** (Frontend → API):
   ```javascript
   PATCH /api/v1/tenants/{tenant_id}
   { is_active: false }
   ```

### User Management Workflow

1. **Invite Team Member** (Frontend → API):
   ```javascript
   POST /api/v1/tenants/{tenant_id}/users
   Headers: { X-API-Key, X-User-ID }  // Inviter's user_id
   {
     email,
     name,
     role,
     created_by_user_id
   }
   ```

2. **List Team Members**:
   ```javascript
   GET /api/v1/tenants/{tenant_id}/users
   Headers: { X-API-Key, X-User-ID }
   ```

3. **Deactivate User**:
   ```javascript
   POST /api/v1/tenants/{tenant_id}/users/{user_id}/deactivate
   Headers: { X-API-Key, X-User-ID }  // Admin only
   ```

### Pipeline Execution Workflow

All pipeline requests require **both headers**:

```javascript
POST /api/v1/pipelines/run/{pipeline_id}
Headers: {
  "X-API-Key": "{tenant_api_key}",
  "X-User-ID": "{current_user_id}"
}
Body: { date, trigger_by: "api_user" }
```

Frontend must:
1. Store tenant API key (from onboarding)
2. Track current user's user_id (from auth session)
3. Send both headers with every authenticated request

### Scheduler Integration

Scheduler triggers pipelines with service user:

```bash
# Scheduler cron job
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/${PIPELINE_ID}" \
  -H "X-API-Key: ${TENANT_API_KEY}" \
  -H "X-User-ID: scheduler_service_user_id" \
  -d '{"trigger_by": "scheduler", "date": "2025-11-17"}'
```

**Note**: Create a dedicated "scheduler" user in each tenant for automated runs.

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

1. **Onboard Your First Tenant**: Use the tenant onboarding API
2. **Create Users**: Add team members to the tenant
3. **Test Pipeline Execution**: Trigger a pipeline with both X-API-Key and X-User-ID
4. **Monitor Usage**: Query pipeline_runs for per-user analytics
5. **Configure Frontend**: Integrate tenant + user management
6. **Set Up Scheduler**: Create scheduler service user for automated runs

---

## Reference Documentation

- **[QUICK_START.md](QUICK_START.md)** - Get started in 5 minutes
- **[TENANT_API_REFERENCE.md](../api/TENANT_API_REFERENCE.md)** - Full API reference
- **[MULTI_TENANCY_DESIGN.md](../implementation/MULTI_TENANCY_DESIGN.md)** - Architecture design
- **[IMPLEMENTATION_SUMMARY.md](../implementation/IMPLEMENTATION_SUMMARY.md)** - Implementation guide
- **[metadata-schema.md](../reference/metadata-schema.md)** - Schema documentation
- **[TENANT_MANAGEMENT.md](../architecture/TENANT_MANAGEMENT.md)** - Tenant architecture

---

**Version**: 2.0 (Multi-User Tenant Architecture)
**Last Updated**: 2025-11-17
**Breaking Changes**: v2.0.0 requires X-User-ID header for all authenticated endpoints
**Status**: Production Ready
