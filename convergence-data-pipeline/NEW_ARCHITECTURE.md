# New Production Architecture - Customer-Centric Design

## Overview

Separation of concerns with centralized customer management and distributed tenant data processing.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      PORTAL UI                               │
│  (Customer Onboarding, Subscription, Credentials Setup)     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   CUSTOMER API                               │
│  /api/v1/customers/onboard                                  │
│  /api/v1/customers/{customer_id}/subscription               │
│  /api/v1/customers/{customer_id}/credentials                │
│  /api/v1/customers/{customer_id}/validate                   │
│  /api/v1/customers/{customer_id}/api-keys                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              CENTRALIZED CUSTOMERS DATASET                   │
│            (HIGHLY PROTECTED - Row-Level Security)           │
│                                                              │
│  Tables:                                                     │
│  ├── customer_profiles                                       │
│  ├── customer_api_keys                                       │
│  ├── customer_cloud_credentials (encrypted)                 │
│  ├── customer_subscriptions                                 │
│  ├── customer_usage_quotas                                   │
│  ├── customer_team_members                                   │
│  └── customer_provider_configs (multi-cloud)                │
└──────────────────────────────────────────────────────────────┘
                     │
                     │ Validation & Auth
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   PIPELINE API                               │
│  /api/v1/pipelines/run/{customer_id}/{provider}/{domain}/   │
│                        {pipeline_template}                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              TENANT DATASETS (Per Customer)                  │
│                 {customer_id}                                │
│                                                              │
│  Tables:                                                     │
│  ├── x_meta_pipeline_runs (execution logs only)            │
│  ├── x_meta_step_logs (step details)                       │
│  ├── x_meta_dq_results (data quality)                      │
│  └── {provider}_{layer}_{domain}/ (actual data)            │
│      ├── gcp_silver_cost/                                   │
│      ├── aws_silver_cost/                                   │
│      └── ...                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Database Schema - `customers` Dataset

### 1. `customer_profiles`

**Purpose**: Central customer registry

```sql
CREATE TABLE `gac-prod-471220.customers.customer_profiles` (
  customer_id STRING NOT NULL,           -- Unique customer identifier
  company_name STRING NOT NULL,
  admin_email STRING NOT NULL,
  status STRING NOT NULL,                -- ACTIVE, SUSPENDED, TRIAL, CANCELLED
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  tenant_dataset_id STRING NOT NULL,     -- BigQuery dataset for this customer
  subscription_plan_id STRING NOT NULL,  -- References customer_subscriptions
  metadata JSON                          -- Additional customer info
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, status;
```

### 2. `customer_api_keys`

**Purpose**: API keys for customer authentication (moved from tenant datasets)

```sql
CREATE TABLE `gac-prod-471220.customers.customer_api_keys` (
  api_key_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  api_key_hash STRING NOT NULL,          -- SHA256 hash for lookup
  encrypted_api_key BYTES NOT NULL,      -- KMS encrypted
  key_name STRING,                       -- e.g., "Production Key", "Dev Key"
  scopes ARRAY<STRING>,                  -- ["pipelines:run", "admin:read"]
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  is_active BOOLEAN NOT NULL,
  created_by STRING,                     -- Email of creator
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, api_key_hash;
```

### 3. `customer_cloud_credentials`

**Purpose**: Multi-cloud provider credentials per customer

```sql
CREATE TABLE `gac-prod-471220.customers.customer_cloud_credentials` (
  credential_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  provider STRING NOT NULL,              -- GCP, AWS, AZURE, OPENAI, CLAUDE
  credential_type STRING NOT NULL,       -- SERVICE_ACCOUNT, ACCESS_KEY, API_KEY
  credential_name STRING NOT NULL,       -- e.g., "GCP Billing Account"
  encrypted_credentials BYTES NOT NULL,  -- KMS encrypted JSON
  project_id STRING,                     -- GCP project or AWS account
  region STRING,                         -- Default region
  scopes ARRAY<STRING>,                  -- ["bigquery", "storage"]
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  last_validated_at TIMESTAMP,
  is_active BOOLEAN NOT NULL,
  validation_status STRING,              -- VALID, INVALID, PENDING
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, provider;
```

### 4. `customer_subscriptions`

**Purpose**: Subscription plans and limits

```sql
CREATE TABLE `gac-prod-471220.customers.customer_subscriptions` (
  subscription_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  plan_name STRING NOT NULL,             -- FREE, STARTER, PROFESSIONAL, ENTERPRISE
  status STRING NOT NULL,                -- ACTIVE, TRIAL, EXPIRED, CANCELLED

  -- Quota Limits
  max_pipelines_per_day INT64 NOT NULL,
  max_pipelines_per_month INT64 NOT NULL,
  max_concurrent_pipelines INT64 NOT NULL,
  max_team_members INT64 NOT NULL,
  max_cloud_providers INT64 NOT NULL,

  -- Billing
  billing_cycle STRING NOT NULL,         -- MONTHLY, ANNUAL
  amount_usd NUMERIC(10,2),
  currency STRING DEFAULT 'USD',

  -- Dates
  trial_start_date DATE,
  trial_end_date DATE,
  subscription_start_date DATE NOT NULL,
  subscription_end_date DATE,
  next_billing_date DATE,

  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  metadata JSON
)
PARTITION BY DATE(subscription_start_date)
CLUSTER BY customer_id, status;
```

### 5. `customer_usage_quotas`

**Purpose**: Track daily/monthly usage against limits

```sql
CREATE TABLE `gac-prod-471220.customers.customer_usage_quotas` (
  usage_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  usage_date DATE NOT NULL,

  -- Daily Counters
  pipelines_run_today INT64 DEFAULT 0,
  pipelines_failed_today INT64 DEFAULT 0,
  pipelines_succeeded_today INT64 DEFAULT 0,

  -- Monthly Counters (reset monthly)
  pipelines_run_month INT64 DEFAULT 0,

  -- Current State
  concurrent_pipelines_running INT64 DEFAULT 0,

  -- Limits (cached from subscription)
  daily_limit INT64 NOT NULL,
  monthly_limit INT64 NOT NULL,
  concurrent_limit INT64 NOT NULL,

  -- Status
  quota_exceeded BOOLEAN DEFAULT FALSE,
  quota_warning_sent BOOLEAN DEFAULT FALSE,

  last_updated TIMESTAMP NOT NULL,
  metadata JSON
)
PARTITION BY usage_date
CLUSTER BY customer_id, usage_date;
```

### 6. `customer_team_members`

**Purpose**: Team members with role-based access

```sql
CREATE TABLE `gac-prod-471220.customers.customer_team_members` (
  member_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  email STRING NOT NULL,
  full_name STRING,
  role STRING NOT NULL,                  -- OWNER, ADMIN, DEVELOPER, VIEWER
  permissions ARRAY<STRING>,             -- ["pipelines:run", "credentials:read"]
  status STRING NOT NULL,                -- ACTIVE, INVITED, SUSPENDED
  invited_by STRING,
  invited_at TIMESTAMP,
  joined_at TIMESTAMP,
  last_login_at TIMESTAMP,
  is_active BOOLEAN NOT NULL,
  metadata JSON
)
PARTITION BY DATE(invited_at)
CLUSTER BY customer_id, email;
```

### 7. `customer_provider_configs`

**Purpose**: Provider-specific pipeline configurations

```sql
CREATE TABLE `gac-prod-471220.customers.customer_provider_configs` (
  config_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  provider STRING NOT NULL,              -- GCP, AWS, AZURE
  domain STRING NOT NULL,                -- COST, SECURITY, COMPLIANCE

  -- Configuration
  source_project_id STRING,              -- Where source data lives
  source_dataset STRING,                 -- Source billing dataset
  notification_emails ARRAY<STRING>,     -- Alert recipients
  default_parameters JSON,               -- Pipeline default params

  -- Template Overrides
  pipeline_template_overrides JSON,      -- Custom template variables

  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, provider, domain;
```

---

## Workflow Changes

### Old Workflow (Insecure)
```
1. POST /api/v1/tenants/onboard
   → Creates {tenant_id}.x_meta_api_keys (in tenant dataset ❌)
   → Returns API key immediately
2. POST /api/v1/pipelines/run/{tenant_id}/...
   → Reads API key from {tenant_id}.x_meta_api_keys
```

### New Workflow (Secure)

#### **Phase 1: Customer Onboarding (One-Time, Portal UI)**
```
1. POST /api/v1/customers/onboard
   Request: {
     "company_name": "Acme Corp",
     "admin_email": "admin@acme.com",
     "subscription_plan": "PROFESSIONAL"
   }

   Response: {
     "customer_id": "acme_corp",
     "status": "ACTIVE",
     "dataset_created": true,
     "message": "Customer onboarded. Setup credentials next."
   }

2. POST /api/v1/customers/{customer_id}/subscription
   Request: {
     "plan_name": "PROFESSIONAL",
     "max_pipelines_per_day": 1000,
     "max_team_members": 10,
     "billing_cycle": "MONTHLY"
   }

3. POST /api/v1/customers/{customer_id}/credentials
   Request: {
     "provider": "GCP",
     "credential_type": "SERVICE_ACCOUNT",
     "credential_name": "GCP Billing Reader",
     "credentials": { ... },  // Encrypted before storage
     "project_id": "acme-gcp-project",
     "scopes": ["bigquery", "storage"]
   }

4. POST /api/v1/customers/{customer_id}/provider-config
   Request: {
     "provider": "GCP",
     "domain": "COST",
     "source_project_id": "acme-gcp-project",
     "source_dataset": "billing_export",
     "notification_emails": ["ops@acme.com"]
   }

5. POST /api/v1/customers/{customer_id}/api-keys
   Request: {
     "key_name": "Production API Key",
     "scopes": ["pipelines:run"],
     "expires_in_days": 365
   }

   Response: {
     "api_key": "acme_corp_api_XXXXXXXXXXXXXXXX",  // Show once!
     "expires_at": "2026-11-17T00:00:00Z"
   }
```

#### **Phase 2: Pipeline Execution (Ongoing, API Calls)**
```
1. POST /api/v1/customers/{customer_id}/validate
   Headers: X-API-Key: {api_key}

   Response: {
     "customer_id": "acme_corp",
     "status": "ACTIVE",
     "subscription": {
       "plan": "PROFESSIONAL",
       "pipelines_run_today": 45,
       "daily_limit": 1000,
       "quota_available": true
     },
     "credentials_valid": true,
     "can_run_pipeline": true
   }

2. POST /api/v1/pipelines/run/{customer_id}/gcp/cost/cost_billing
   Headers: X-API-Key: {api_key}

   Request: {
     "date": "2025-11-17",
     "trigger_by": "scheduler",
     "parameters": {
       "filter_date": "2025-11-17"
     }
   }

   Internal Process:
   a. Validate API key against customers.customer_api_keys
   b. Check subscription status (customers.customer_subscriptions)
   c. Check quota (customers.customer_usage_quotas)
   d. Get provider config (customers.customer_provider_configs)
   e. Get cloud credentials (customers.customer_cloud_credentials)
   f. Execute pipeline with credentials
   g. Log to {customer_id}.x_meta_pipeline_runs
   h. Update usage quota

   Response: {
     "pipeline_logging_id": "pl_abc123",
     "status": "RUNNING",
     "quota_remaining": 955
   }
```

---

## Security Improvements

### 1. **Dataset-Level Isolation**
```
customers/                    # Row-level security, admin-only access
└── (All sensitive data)

{customer_id}/                # Customer-specific access, no credentials
└── (Execution logs + data)
```

### 2. **IAM Permissions**
```bash
# Admin service account (full access)
roles/bigquery.dataOwner on customers.*

# API service account (limited access)
roles/bigquery.dataViewer on customers.customer_api_keys
roles/bigquery.dataViewer on customers.customer_subscriptions
roles/bigquery.dataEditor on customers.customer_usage_quotas
roles/bigquery.dataEditor on {customer_id}.* (all customer datasets)

# Customer service account (no access to customers dataset)
roles/bigquery.dataEditor on {customer_id}.* only
```

### 3. **Encryption**
- All credentials encrypted with Cloud KMS before storage
- API keys hashed (SHA256) for lookup, encrypted for retrieval
- Environment variables for KMS key ID

---

## API Endpoint Summary

### Customer Management APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/customers/onboard` | POST | Create new customer (one-time) |
| `/api/v1/customers/{customer_id}` | GET | Get customer profile |
| `/api/v1/customers/{customer_id}/subscription` | POST/GET/PUT | Manage subscription |
| `/api/v1/customers/{customer_id}/credentials` | POST/GET/DELETE | Manage cloud credentials |
| `/api/v1/customers/{customer_id}/provider-config` | POST/GET/PUT | Configure provider settings |
| `/api/v1/customers/{customer_id}/api-keys` | POST/GET/DELETE | Generate/manage API keys |
| `/api/v1/customers/{customer_id}/validate` | POST | Validate before pipeline run |
| `/api/v1/customers/{customer_id}/usage` | GET | Get usage statistics |
| `/api/v1/customers/{customer_id}/team` | POST/GET/DELETE | Manage team members |

### Pipeline Execution APIs (Unchanged)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/pipelines/run/{customer_id}/{provider}/{domain}/{template}` | POST | Execute pipeline |
| `/api/v1/pipelines/status/{pipeline_logging_id}` | GET | Get execution status |
| `/api/v1/pipelines/list/{customer_id}` | GET | List pipeline runs |

---

## Migration Steps

1. **Create `customers` dataset** with all 7 tables
2. **Migrate existing tenant API keys** from `{tenant_id}.x_meta_api_keys` → `customers.customer_api_keys`
3. **Update authentication logic** to read from centralized dataset
4. **Add subscription management** with default FREE plan for existing tenants
5. **Add validation middleware** to check quotas before pipeline execution
6. **Update onboarding API** to use new workflow
7. **Create new customer management APIs**
8. **Remove** `x_meta_api_keys` and `x_meta_cloud_credentials` from tenant datasets

---

## Benefits

✅ **Security**: Credentials isolated from tenant data
✅ **Scalability**: Centralized customer management
✅ **Multi-tenancy**: Proper separation of concerns
✅ **Quota Management**: Built-in usage tracking
✅ **Audit Trail**: Complete customer activity history
✅ **Team Collaboration**: Role-based access control
✅ **Multi-Cloud**: Support multiple providers per customer

---

## Next Steps

1. Review and approve architecture
2. Create database migration scripts
3. Implement new API endpoints
4. Update authentication middleware
5. Migrate existing tenants
6. Update documentation
7. Deploy to production
