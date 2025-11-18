# Tenant Management Architecture

## Overview

The Convergence Data Pipeline implements a multi-user tenant architecture with separated tenant (organization) and user (individual) management. This design enables enterprise-grade subscription management, user-level tracking, and complete tenant isolation while supporting multiple team members per organization.

## Architecture Principles

1. **Tenant-User Separation** - Clear distinction between organization (tenant) and individual (user)
2. **Tenant Isolation** - Each tenant gets a dedicated BigQuery dataset for data processing
3. **Multi-User Support** - Multiple users per tenant with role-based access control
4. **User-Level Tracking** - All actions tracked with user_id for audit and analytics
5. **Tenant-Level Billing** - Subscriptions and quotas enforced at organization level
6. **Security by Design** - KMS encryption, row-level security, API key rotation
7. **Scalability** - Supports 10,000+ tenants with independent scaling

---

## Key Terminology

| Term | Definition | Example |
|------|------------|---------|
| **tenant_id** | Organization identifier | "acme_corp" |
| **user_id** | Individual user identifier | "alice_uuid_123" |
| **stripe_tenant_id** | Stripe customer ID (for billing) | "cus_stripe123" |
| **X-API-Key** | Tenant-level authentication header | "acme_corp_api_abc123" |
| **X-User-ID** | User-level identification header | "alice_uuid_123" |

**Important**: Every authenticated request requires **both** X-API-Key (tenant) and X-User-ID (user).

---

## Database Schema Architecture

### Per-Tenant Dataset

**Pattern**: `{tenant_id}` (e.g., `acme_corp`)

Each tenant gets an isolated BigQuery dataset:

```
{tenant_id}/
├── tenants                    (Tenant info, subscription, quotas)
├── users                      (Team members with roles)
├── x_meta_api_keys            (Tenant-level API keys)
├── x_meta_cloud_credentials   (Cloud provider credentials)
├── x_meta_pipeline_runs       (Pipeline execution - includes user_id)
├── x_meta_step_logs           (Step-level logs - includes user_id)
├── x_meta_dq_results          (Data quality results - includes user_id)
└── <pipeline_output_tables>   (Tenant's processed data)
```

**Example Tenants**:
```
gac-prod-471220/
├── acme_corp/                 (Tenant 1 - PROFESSIONAL)
│   ├── tenants (1 row)
│   ├── users (alice, bob, charlie)
│   └── x_meta_pipeline_runs (all runs with user_id)
│
├── tech_corp/                 (Tenant 2 - ENTERPRISE)
│   ├── tenants (1 row)
│   ├── users (david, eve, frank)
│   └── x_meta_pipeline_runs (all runs with user_id)
│
└── startup_co/                (Tenant 3 - STARTER)
    ├── tenants (1 row)
    ├── users (grace)
    └── x_meta_pipeline_runs (all runs with user_id)
```

---

## Database Schema Details

### 1. tenants

**Purpose**: Organization-level information, subscription, and quotas

**Schema**:
```sql
CREATE TABLE {tenant_id}.tenants (
  tenant_id STRING NOT NULL,                -- Primary key (e.g., "acme_corp")
  company_name STRING NOT NULL,             -- Company name
  contact_email STRING,                     -- Primary contact email
  subscription_plan STRING NOT NULL,        -- "free" | "starter" | "professional" | "enterprise"
  stripe_tenant_id STRING,                  -- Stripe customer ID (for billing)
  stripe_subscription_id STRING,            -- Stripe subscription ID
  is_active BOOL NOT NULL DEFAULT TRUE,     -- Tenant status

  -- Quotas (tenant-level)
  max_pipelines_per_month INT64,            -- Monthly pipeline limit (NULL = unlimited)
  max_concurrent_pipelines INT64,           -- Concurrent pipeline limit (NULL = unlimited)
  storage_quota_gb INT64,                   -- Storage limit in GB (NULL = unlimited)

  -- Usage counters (tenant-level)
  pipeline_runs_count INT64 NOT NULL DEFAULT 0,           -- Lifetime pipeline runs
  pipeline_runs_this_month INT64 NOT NULL DEFAULT 0,      -- This month's pipeline runs
  current_running_pipelines INT64 NOT NULL DEFAULT 0,     -- Currently running
  last_pipeline_run_at TIMESTAMP,           -- Last pipeline execution
  quota_reset_date DATE NOT NULL,           -- Next quota reset (1st of month)

  -- Metadata
  dataset_id STRING NOT NULL,               -- BigQuery dataset ID (same as tenant_id)
  created_at TIMESTAMP NOT NULL,            -- Tenant creation time
  updated_at TIMESTAMP NOT NULL,            -- Last modification time
  metadata JSON                             -- Additional tenant metadata
);
```

**Example Record**:
```json
{
  "tenant_id": "acme_corp",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional",
  "stripe_tenant_id": "cus_stripe123",
  "stripe_subscription_id": "sub_stripe456",
  "is_active": true,
  "max_pipelines_per_month": 1000,
  "max_concurrent_pipelines": 5,
  "storage_quota_gb": 500,
  "pipeline_runs_count": 2450,
  "pipeline_runs_this_month": 120,
  "current_running_pipelines": 2,
  "last_pipeline_run_at": "2025-11-17T10:45:00Z",
  "quota_reset_date": "2025-12-01",
  "dataset_id": "acme_corp",
  "created_at": "2025-01-15T09:00:00Z",
  "updated_at": "2025-11-17T10:45:00Z"
}
```

**Subscription Plans**:

| Plan | Monthly Pipelines | Concurrent | Storage | Users | Cost/Month |
|------|-------------------|------------|---------|-------|------------|
| **Free** | 100 | 1 | 10 GB | 1 | $0 |
| **Starter** | 500 | 3 | 100 GB | 5 | $99 |
| **Professional** | 2,000 | 10 | 500 GB | 25 | $499 |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | Custom |

---

### 2. users

**Purpose**: Team members with role-based access

**Schema**:
```sql
CREATE TABLE {tenant_id}.users (
  user_id STRING NOT NULL,                  -- Primary key (UUID from auth provider)
  tenant_id STRING NOT NULL,                -- FK to tenants table
  email STRING NOT NULL,                    -- User email (unique within tenant)
  name STRING,                              -- User display name
  role STRING NOT NULL,                     -- "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"
  is_active BOOL NOT NULL DEFAULT TRUE,     -- User status

  -- Audit fields
  created_at TIMESTAMP NOT NULL,            -- User creation time
  created_by_user_id STRING,                -- User ID who created this user
  updated_at TIMESTAMP,                     -- Last modification time
  last_login_at TIMESTAMP,                  -- Last login timestamp
  deactivated_at TIMESTAMP,                 -- Deactivation timestamp
  deactivated_by_user_id STRING,            -- User ID who deactivated this user

  -- Additional metadata
  metadata JSON                             -- User preferences, settings, etc.
);

-- Composite primary key
PRIMARY KEY (tenant_id, user_id);

-- Unique email per tenant
UNIQUE (tenant_id, email);
```

**User Roles**:

| Role | Permissions | Use Case |
|------|-------------|----------|
| **OWNER** | Full access, manage users, manage billing, delete tenant | Tenant creator |
| **ADMIN** | Manage users, manage pipelines, view billing | Team leads |
| **MEMBER** | Create/edit pipelines, view data | Developers |
| **VIEWER** | Read-only access to dashboards and data | Stakeholders |

**Example Records**:
```json
[
  {
    "user_id": "alice_uuid_123",
    "tenant_id": "acme_corp",
    "email": "alice@acmecorp.com",
    "name": "Alice Johnson",
    "role": "OWNER",
    "is_active": true,
    "created_at": "2025-01-15T09:00:00Z",
    "created_by_user_id": "alice_uuid_123",
    "last_login_at": "2025-11-17T10:30:00Z"
  },
  {
    "user_id": "bob_uuid_456",
    "tenant_id": "acme_corp",
    "email": "bob@acmecorp.com",
    "name": "Bob Smith",
    "role": "ADMIN",
    "is_active": true,
    "created_at": "2025-02-10T14:00:00Z",
    "created_by_user_id": "alice_uuid_123",
    "last_login_at": "2025-11-17T09:15:00Z"
  },
  {
    "user_id": "charlie_uuid_789",
    "tenant_id": "acme_corp",
    "email": "charlie@acmecorp.com",
    "name": "Charlie Davis",
    "role": "MEMBER",
    "is_active": false,
    "created_at": "2025-03-05T11:00:00Z",
    "created_by_user_id": "alice_uuid_123",
    "deactivated_at": "2025-10-20T16:00:00Z",
    "deactivated_by_user_id": "alice_uuid_123"
  }
]
```

---

### 3. x_meta_api_keys

**Purpose**: Tenant-level API key management with KMS encryption

**Schema**:
```sql
CREATE TABLE {tenant_id}.x_meta_api_keys (
  api_key_id STRING NOT NULL,               -- UUID, primary key
  tenant_id STRING NOT NULL,                -- FK to tenants table
  api_key_hash STRING NOT NULL,             -- SHA256 hash for authentication
  encrypted_api_key BYTES NOT NULL,         -- KMS-encrypted API key
  key_name STRING,                          -- Human-readable key name
  scopes ARRAY<STRING>,                     -- API scopes ["pipelines:read", "pipelines:write"]
  is_active BOOL NOT NULL DEFAULT TRUE,     -- Active status
  expires_at TIMESTAMP,                     -- Expiration time (NULL = never)
  last_used_at TIMESTAMP,                   -- Last usage timestamp
  created_at TIMESTAMP NOT NULL,
  created_by_user_id STRING,                -- User who created the key
  revoked_at TIMESTAMP,                     -- Revocation timestamp
  revoked_by_user_id STRING                 -- User who revoked the key
);
```

**Security**:
- API keys encrypted with Google Cloud KMS
- SHA256 hash used for fast authentication lookup
- Plaintext key shown only once during creation
- Automatic expiration support
- Audit trail with user_id tracking

**Format**: `{tenant_id}_api_{random_16_chars}`
**Example**: `acme_corp_api_xK9mPqWz7LnR4vYt`

---

### 4. x_meta_cloud_credentials

**Purpose**: Cloud provider credentials for data source access

**Schema**:
```sql
CREATE TABLE {tenant_id}.x_meta_cloud_credentials (
  credential_id STRING NOT NULL,            -- UUID, primary key
  tenant_id STRING NOT NULL,                -- FK to tenants table
  provider STRING NOT NULL,                 -- "gcp" | "aws" | "azure" | "openai"
  credential_type STRING NOT NULL,          -- "service_account" | "api_key" | "oauth"
  encrypted_credentials BYTES NOT NULL,     -- KMS-encrypted credentials JSON
  credential_name STRING,                   -- Human-readable name
  scopes ARRAY<STRING>,                     -- Provider-specific scopes
  is_active BOOL NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  last_validated_at TIMESTAMP,              -- Last successful validation
  created_at TIMESTAMP NOT NULL,
  created_by_user_id STRING,                -- User who created the credential
  updated_at TIMESTAMP NOT NULL,
  updated_by_user_id STRING,                -- User who last updated
  metadata JSON                             -- Provider-specific metadata
);
```

**Supported Providers**:
- **GCP**: Service account JSON keys
- **AWS**: Access key ID + Secret access key
- **Azure**: Service principal credentials
- **OpenAI**: API keys

---

### 5. x_meta_pipeline_runs

**Purpose**: Pipeline execution tracking with user attribution

**Schema**:
```sql
CREATE TABLE {tenant_id}.x_meta_pipeline_runs (
  pipeline_logging_id STRING NOT NULL,      -- UUID, primary key
  pipeline_id STRING NOT NULL,              -- Pipeline identifier
  tenant_id STRING NOT NULL,                -- FK to tenants table
  user_id STRING NOT NULL,                  -- FK to users table (WHO triggered it)
  status STRING NOT NULL,                   -- "pending" | "running" | "completed" | "failed"
  start_time TIMESTAMP NOT NULL,            -- Pipeline start time
  end_time TIMESTAMP,                       -- Pipeline end time
  duration_seconds INT64,                   -- Execution duration
  rows_processed INT64,                     -- Total rows processed
  trigger_by STRING NOT NULL,               -- "api_user" | "scheduler" | "manual"
  parameters JSON,                          -- Pipeline parameters
  error_message STRING,                     -- Error details if failed
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
);

-- Index for user queries
CREATE INDEX idx_user_runs ON x_meta_pipeline_runs(tenant_id, user_id, start_time DESC);
```

**Example Record**:
```json
{
  "pipeline_logging_id": "run_uuid_abc123",
  "pipeline_id": "p_openai_billing",
  "tenant_id": "acme_corp",
  "user_id": "alice_uuid_123",
  "status": "completed",
  "start_time": "2025-11-17T10:45:00Z",
  "end_time": "2025-11-17T10:47:32Z",
  "duration_seconds": 152,
  "rows_processed": 1500,
  "trigger_by": "api_user",
  "parameters": {"date": "2025-11-14"},
  "created_at": "2025-11-17T10:45:00Z"
}
```

**User Tracking Benefits**:
- Audit: Who triggered which pipeline?
- Analytics: Which users are most active?
- Billing: Per-user cost allocation
- Security: Detect anomalous user behavior

---

### 6. x_meta_step_logs

**Purpose**: Step-by-step execution logs with user tracking

**Schema**:
```sql
CREATE TABLE {tenant_id}.x_meta_step_logs (
  step_log_id STRING NOT NULL,              -- UUID, primary key
  pipeline_logging_id STRING NOT NULL,      -- FK to x_meta_pipeline_runs
  tenant_id STRING NOT NULL,                -- FK to tenants table
  user_id STRING NOT NULL,                  -- FK to users table (from parent run)
  step_name STRING NOT NULL,                -- Step identifier
  step_order INT64 NOT NULL,                -- Execution order
  status STRING NOT NULL,                   -- "pending" | "running" | "completed" | "failed"
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_seconds INT64,
  rows_processed INT64,
  error_message STRING,
  metadata JSON,                            -- Step-specific metadata
  created_at TIMESTAMP NOT NULL
);
```

**Note**: `user_id` is inherited from parent `x_meta_pipeline_runs` record.

---

### 7. x_meta_dq_results

**Purpose**: Data quality check results with user tracking

**Schema**:
```sql
CREATE TABLE {tenant_id}.x_meta_dq_results (
  dq_result_id STRING NOT NULL,             -- UUID, primary key
  pipeline_logging_id STRING NOT NULL,      -- FK to x_meta_pipeline_runs
  tenant_id STRING NOT NULL,                -- FK to tenants table
  user_id STRING NOT NULL,                  -- FK to users table (from parent run)
  test_name STRING NOT NULL,                -- DQ test identifier
  test_type STRING NOT NULL,                -- "completeness" | "uniqueness" | "validity"
  result STRING NOT NULL,                   -- "passed" | "failed" | "warning"
  expected_value STRING,
  actual_value STRING,
  error_message STRING,
  run_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL,
  metadata JSON
);
```

---

## API Endpoints

### Tenant Management

#### Onboard Tenant
```
POST /api/v1/tenants/onboard
Content-Type: application/json

Request:
{
  "tenant_id": "acme_corp",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional",
  "stripe_tenant_id": "cus_stripe123",
  "created_by_user_id": "alice_uuid_123"
}

Response:
{
  "tenant_id": "acme_corp",
  "api_key": "acme_corp_api_xK9mPqWz7LnR4vYt",
  "stripe_tenant_id": "cus_stripe123",
  "dataset_created": true,
  "tables_created": ["tenants", "users", "x_meta_api_keys", ...],
  "owner_user_id": "alice_uuid_123",
  "message": "Tenant onboarded successfully"
}
```

#### Get Tenant Details
```
GET /api/v1/tenants/{tenant_id}
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {user_id}

Response:
{
  "tenant_id": "acme_corp",
  "company_name": "ACME Corporation",
  "subscription_plan": "professional",
  "stripe_tenant_id": "cus_stripe123",
  "is_active": true,
  "max_pipelines_per_month": 1000,
  "pipeline_runs_this_month": 120,
  "current_running_pipelines": 2,
  "quota_reset_date": "2025-12-01",
  "created_at": "2025-01-15T09:00:00Z"
}
```

#### Update Tenant
```
PATCH /api/v1/tenants/{tenant_id}
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {admin_user_id}

Request:
{
  "company_name": "ACME Inc.",
  "contact_email": "newadmin@acmecorp.com"
}
```

### User Management

#### Create User (Add Team Member)
```
POST /api/v1/tenants/{tenant_id}/users
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {inviter_user_id}

Request:
{
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "created_by_user_id": "alice_uuid_123"
}

Response:
{
  "user_id": "bob_uuid_456",
  "tenant_id": "acme_corp",
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "is_active": true,
  "created_at": "2025-11-17T10:30:00Z",
  "message": "User created successfully"
}
```

#### List Users in Tenant
```
GET /api/v1/tenants/{tenant_id}/users
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {requesting_user_id}

Response:
{
  "users": [
    {
      "user_id": "alice_uuid_123",
      "email": "alice@acmecorp.com",
      "name": "Alice Johnson",
      "role": "OWNER",
      "is_active": true,
      "created_at": "2025-01-15T09:00:00Z"
    },
    {
      "user_id": "bob_uuid_456",
      "email": "bob@acmecorp.com",
      "name": "Bob Smith",
      "role": "ADMIN",
      "is_active": true,
      "created_at": "2025-02-10T14:00:00Z"
    }
  ],
  "total": 2
}
```

#### Get User Details
```
GET /api/v1/tenants/{tenant_id}/users/{user_id}
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {requesting_user_id}

Response:
{
  "user_id": "bob_uuid_456",
  "tenant_id": "acme_corp",
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "is_active": true,
  "created_at": "2025-02-10T14:00:00Z",
  "created_by_user_id": "alice_uuid_123",
  "last_login_at": "2025-11-17T09:15:00Z"
}
```

#### Update User
```
PATCH /api/v1/tenants/{tenant_id}/users/{user_id}
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {admin_user_id}

Request:
{
  "role": "MEMBER",
  "name": "Bob M. Smith"
}
```

#### Deactivate User
```
POST /api/v1/tenants/{tenant_id}/users/{user_id}/deactivate
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {admin_user_id}

Response:
{
  "user_id": "bob_uuid_456",
  "is_active": false,
  "deactivated_at": "2025-11-17T15:00:00Z",
  "deactivated_by_user_id": "alice_uuid_123",
  "message": "User deactivated successfully"
}
```

### Pipeline Management with User Tracking

#### Trigger Pipeline
```
POST /api/v1/pipelines/run/{pipeline_id}
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {user_id}

Request:
{
  "date": "2025-11-17",
  "trigger_by": "api_user"
}

Response:
{
  "pipeline_logging_id": "run_uuid_abc123",
  "pipeline_id": "p_openai_billing",
  "tenant_id": "acme_corp",
  "user_id": "alice_uuid_123",
  "status": "running",
  "started_at": "2025-11-17T10:45:00Z",
  "message": "Pipeline queued for execution"
}
```

#### Get Pipeline Run Status
```
GET /api/v1/pipelines/runs/{run_id}
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {user_id}

Response:
{
  "pipeline_logging_id": "run_uuid_abc123",
  "pipeline_id": "p_openai_billing",
  "tenant_id": "acme_corp",
  "user_id": "alice_uuid_123",
  "status": "completed",
  "start_time": "2025-11-17T10:45:00Z",
  "end_time": "2025-11-17T10:47:32Z",
  "duration_seconds": 152,
  "rows_processed": 1500
}
```

#### List Pipeline Runs (with user filter)
```
GET /api/v1/pipelines/runs?tenant_id={tenant_id}&user_id={user_id}
Headers:
  X-API-Key: {tenant_api_key}
  X-User-ID: {requesting_user_id}

Response:
{
  "runs": [
    {
      "pipeline_logging_id": "run_uuid_abc123",
      "pipeline_id": "p_openai_billing",
      "user_id": "alice_uuid_123",
      "status": "completed",
      "start_time": "2025-11-17T10:45:00Z",
      "rows_processed": 1500
    }
  ],
  "total": 1,
  "filtered_by_user": "alice_uuid_123"
}
```

---

## Authentication & Authorization Flow

### Request Flow with Dual Authentication

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT REQUEST                                              │
│  POST /api/v1/pipelines/run/p_openai_billing                │
│  Headers:                                                    │
│    X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt               │
│    X-User-ID: alice_uuid_123                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: AUTHENTICATE API KEY (Tenant-Level)                │
│  1. Extract X-API-Key header                                 │
│  2. Compute SHA256 hash                                      │
│  3. Query {tenant}.x_meta_api_keys:                         │
│     WHERE api_key_hash = SHA256(provided_key)               │
│       AND is_active = TRUE                                   │
│       AND (expires_at IS NULL OR expires_at > NOW())        │
│  4. Extract tenant_id from API key                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: VALIDATE USER (User-Level)                         │
│  1. Extract X-User-ID header                                 │
│  2. Query {tenant_id}.users:                                │
│     WHERE tenant_id = {from_api_key}                        │
│       AND user_id = {from_header}                           │
│       AND is_active = TRUE                                   │
│  3. Verify user belongs to tenant                           │
│  4. Check user role for endpoint authorization              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: CHECK TENANT STATUS                                │
│  1. Query {tenant_id}.tenants                               │
│  2. Verify is_active = TRUE                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: CHECK QUOTAS (Tenant-Level)                        │
│  1. Query {tenant_id}.tenants for usage counters            │
│  2. Verify: pipeline_runs_this_month < max_pipelines        │
│  3. Verify: current_running_pipelines < max_concurrent      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓ (All checks pass)
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: EXECUTE REQUEST                                     │
│  1. Execute pipeline with tenant_id + user_id               │
│  2. Record in x_meta_pipeline_runs (includes user_id)       │
│  3. Update tenant usage counters                            │
│  4. Return response with tenant_id + user_id                │
└─────────────────────────────────────────────────────────────┘
```

### Error Responses

#### Missing X-User-ID Header
```json
{
  "detail": "Missing required X-User-ID header",
  "error_code": "MISSING_USER_ID",
  "status_code": 401
}
```

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
  "user_id": "charlie_uuid_789",
  "error_code": "USER_DEACTIVATED",
  "status_code": 403
}
```

#### Insufficient Permissions
```json
{
  "detail": "User does not have permission for this action",
  "user_id": "bob_uuid_456",
  "user_role": "VIEWER",
  "required_role": "MEMBER",
  "error_code": "INSUFFICIENT_PERMISSIONS",
  "status_code": 403
}
```

---

## Quota Management

### Tenant-Level Quotas

Quotas are enforced at the **tenant level**, not per user. This means:

- All users in a tenant share the same quota pool
- `max_pipelines_per_month`: Total across all users
- `max_concurrent_pipelines`: Total across all users
- `storage_quota_gb`: Total for the entire tenant

**Example**:
- Tenant: `acme_corp` (Professional plan)
- Max pipelines per month: 1000
- Users: Alice (500 runs), Bob (300 runs), Charlie (200 runs)
- Total: 1000 runs (quota exhausted)

### Quota Enforcement Logic

```python
# Before pipeline execution
def check_quotas(tenant_id: str, user_id: str):
    # Load tenant
    tenant = query(f"SELECT * FROM {tenant_id}.tenants WHERE tenant_id = '{tenant_id}'")

    # Check active status
    if not tenant.is_active:
        raise HTTP403("Tenant account is inactive")

    # Check monthly quota
    if tenant.pipeline_runs_this_month >= tenant.max_pipelines_per_month:
        raise HTTP429(
            f"Monthly pipeline quota exceeded. "
            f"Used {tenant.pipeline_runs_this_month}/{tenant.max_pipelines_per_month} "
            f"pipelines this month."
        )

    # Check concurrent quota
    if tenant.current_running_pipelines >= tenant.max_concurrent_pipelines:
        raise HTTP429(
            f"Concurrent pipeline limit reached. "
            f"{tenant.current_running_pipelines}/{tenant.max_concurrent_pipelines} "
            f"pipelines currently running."
        )

    # All checks passed
    return True
```

### Monthly Quota Reset

Automated process on the 1st of each month:

```python
def reset_monthly_quotas():
    tenants = query("SELECT tenant_id FROM all_tenants")

    for tenant in tenants:
        query(f"""
            UPDATE {tenant.tenant_id}.tenants
            SET
              pipeline_runs_this_month = 0,
              quota_reset_date = DATE_ADD(CURRENT_DATE(), INTERVAL 1 MONTH)
            WHERE tenant_id = '{tenant.tenant_id}'
        """)
```

---

## Security Model

### 1. KMS Encryption

**Encrypted Fields**:
- `x_meta_api_keys.encrypted_api_key`
- `x_meta_cloud_credentials.encrypted_credentials`

**Encryption Flow**:
```python
from google.cloud import kms_v1

def encrypt_value(plaintext: str, kms_key_id: str) -> bytes:
    client = kms_v1.KeyManagementServiceClient()
    response = client.encrypt(
        request={
            "name": kms_key_id,
            "plaintext": plaintext.encode()
        }
    )
    return response.ciphertext

def decrypt_value(ciphertext: bytes, kms_key_id: str) -> str:
    client = kms_v1.KeyManagementServiceClient()
    response = client.decrypt(
        request={
            "name": kms_key_id,
            "ciphertext": ciphertext
        }
    )
    return response.plaintext.decode()
```

### 2. Row-Level Security (RLS)

**Tenant Isolation**: BigQuery datasets are completely isolated per tenant.

**User Isolation within Tenant**:
```sql
-- Example: Restrict users to their own pipeline runs
CREATE ROW ACCESS POLICY user_runs_policy
ON {tenant_id}.x_meta_pipeline_runs
GRANT TO ('user:*')
FILTER USING (
  user_id = SESSION_USER()
  OR
  user_id IN (
    SELECT user_id FROM {tenant_id}.users
    WHERE role IN ('OWNER', 'ADMIN')
  )
);
```

### 3. API Key Authentication

**Authentication Steps**:
1. Client sends request with `X-API-Key` header
2. Server extracts API key
3. Server computes SHA256 hash
4. Server queries `x_meta_api_keys` table
5. Server verifies key is active and not expired
6. Server extracts `tenant_id` from key

**User Validation Steps**:
1. Client sends `X-User-ID` header
2. Server queries `users` table
3. Server verifies user belongs to tenant
4. Server verifies user is active
5. Server checks role-based permissions

---

## Workflow Diagrams

### Tenant Onboarding with User Creation

```
┌─────────────────────────────────────────────────────────────┐
│  USER SIGNS UP (Frontend)                                   │
│  1. User fills signup form                                   │
│  2. User selects subscription plan                          │
│  3. User provides company name                              │
│  → Creates user_id: "alice_uuid_123"                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STRIPE CHECKOUT                                             │
│  1. Redirect to Stripe for payment                          │
│  2. Payment success → creates stripe_tenant_id              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓ (Webhook)
┌─────────────────────────────────────────────────────────────┐
│  BACKEND: TENANT ONBOARDING                                  │
│  POST /api/v1/tenants/onboard                               │
│  {                                                           │
│    tenant_id, company_name,                                 │
│    stripe_tenant_id,                                        │
│    created_by_user_id: "alice_uuid_123"                     │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE PROVISIONING                                 │
│  1. Create BigQuery dataset: {tenant_id}                    │
│  2. Create tables: tenants, users, x_meta_*                 │
│  3. Insert tenant record                                     │
│  4. Generate API key → x_meta_api_keys                      │
│  5. Create owner user record → users                        │
│     user_id: alice_uuid_123, role: OWNER                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  TENANT READY                                                │
│  Owner can:                                                  │
│  - Invite team members (create more users)                  │
│  - Run pipelines (with their user_id tracked)               │
│  - View usage analytics (per-user breakdown)                │
└─────────────────────────────────────────────────────────────┘
```

### Team Member Invitation

```
┌─────────────────────────────────────────────────────────────┐
│  OWNER/ADMIN INVITES USER                                    │
│  POST /api/v1/tenants/acme_corp/users                       │
│  Headers:                                                    │
│    X-API-Key: acme_corp_api_xxx                             │
│    X-User-ID: alice_uuid_123  (inviter)                     │
│  Body:                                                       │
│    { email, name, role, created_by_user_id }                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  CREATE USER RECORD                                          │
│  INSERT INTO acme_corp.users (                              │
│    user_id: "bob_uuid_456",                                 │
│    tenant_id: "acme_corp",                                  │
│    email: "bob@acmecorp.com",                               │
│    role: "ADMIN",                                            │
│    created_by_user_id: "alice_uuid_123"                     │
│  )                                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  SEND INVITATION EMAIL                                       │
│  To: bob@acmecorp.com                                       │
│  Subject: "You've been invited to ACME Corporation"         │
│  Body: "Click here to accept and set up your account"       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  USER ACCEPTS INVITATION                                     │
│  1. User clicks link                                         │
│  2. User sets up their account                              │
│  3. User receives user_id: "bob_uuid_456"                   │
│  4. User can now access platform with:                      │
│     X-API-Key: acme_corp_api_xxx (tenant key)               │
│     X-User-ID: bob_uuid_456 (their user_id)                 │
└─────────────────────────────────────────────────────────────┘
```

### Pipeline Execution with User Tracking

```
┌─────────────────────────────────────────────────────────────┐
│  USER TRIGGERS PIPELINE                                      │
│  POST /api/v1/pipelines/run/p_openai_billing                │
│  Headers:                                                    │
│    X-API-Key: acme_corp_api_xxx  (tenant)                   │
│    X-User-ID: alice_uuid_123     (user)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  AUTHENTICATION & AUTHORIZATION                              │
│  1. Validate API key → extract tenant_id                    │
│  2. Validate user_id → verify belongs to tenant             │
│  3. Check tenant is_active = TRUE                           │
│  4. Check quotas (tenant-level)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓ (All checks pass)
┌─────────────────────────────────────────────────────────────┐
│  EXECUTE PIPELINE                                            │
│  1. Create pipeline_run record:                             │
│     INSERT INTO acme_corp.x_meta_pipeline_runs (            │
│       pipeline_logging_id: "run_uuid_abc123",               │
│       tenant_id: "acme_corp",                               │
│       user_id: "alice_uuid_123",  ← USER TRACKED            │
│       status: "running",                                     │
│       start_time: NOW()                                      │
│     )                                                        │
│  2. Update tenant counters:                                 │
│     - pipeline_runs_count++                                  │
│     - pipeline_runs_this_month++                            │
│     - current_running_pipelines++                           │
│  3. Execute pipeline steps                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  PIPELINE COMPLETES                                          │
│  1. Update pipeline_run:                                     │
│     status: "completed",                                     │
│     end_time: NOW(),                                         │
│     user_id: "alice_uuid_123"  ← REMAINS FOR AUDIT          │
│  2. Decrement current_running_pipelines                     │
│  3. user_id preserved in record for analytics               │
└─────────────────────────────────────────────────────────────┘
```

---

## User Analytics & Reporting

### Per-User Pipeline Run Count

```sql
SELECT
  u.user_id,
  u.email,
  u.name,
  u.role,
  COUNT(pr.pipeline_logging_id) as total_runs,
  SUM(CASE WHEN pr.status = 'completed' THEN 1 ELSE 0 END) as successful_runs,
  SUM(CASE WHEN pr.status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
  MAX(pr.start_time) as last_run_at
FROM {tenant_id}.users u
LEFT JOIN {tenant_id}.x_meta_pipeline_runs pr
  ON u.user_id = pr.user_id AND u.tenant_id = pr.tenant_id
WHERE u.tenant_id = '{tenant_id}'
  AND pr.start_time >= '2025-11-01'
GROUP BY u.user_id, u.email, u.name, u.role
ORDER BY total_runs DESC;
```

### Most Active Users This Month

```sql
SELECT
  u.email,
  u.name,
  COUNT(*) as runs_this_month,
  AVG(TIMESTAMP_DIFF(pr.end_time, pr.start_time, SECOND)) as avg_duration_seconds
FROM {tenant_id}.x_meta_pipeline_runs pr
JOIN {tenant_id}.users u
  ON pr.user_id = u.user_id AND pr.tenant_id = u.tenant_id
WHERE pr.tenant_id = '{tenant_id}'
  AND pr.start_time >= DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY u.email, u.name
ORDER BY runs_this_month DESC
LIMIT 10;
```

### User Activity Timeline

```sql
SELECT
  DATE(pr.start_time) as run_date,
  u.email,
  COUNT(*) as daily_runs
FROM {tenant_id}.x_meta_pipeline_runs pr
JOIN {tenant_id}.users u
  ON pr.user_id = u.user_id AND pr.tenant_id = u.tenant_id
WHERE pr.tenant_id = '{tenant_id}'
  AND pr.start_time >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY run_date, u.email
ORDER BY run_date DESC, daily_runs DESC;
```

---

## Best Practices

### 1. User Management

- **Owner Role**: Only assign OWNER to the original tenant creator or CEO
- **Admin Role**: Assign to team leads who manage users and pipelines
- **Member Role**: Default role for developers who execute pipelines
- **Viewer Role**: For stakeholders who only need read access
- **Deactivate, Don't Delete**: Preserve user_id in historical records

### 2. API Key Management

- Rotate API keys every 90 days
- Use separate keys for different environments (dev, staging, prod)
- Never commit API keys to version control
- Implement key expiration policies
- Track who created/revoked keys via user_id

### 3. Quota Management

- Set realistic quotas based on subscription tier
- Monitor tenant usage trends to prevent sudden quota exhaustion
- Provide grace period before hard quota enforcement
- Send proactive notifications at 75%, 90%, 100% usage
- Remember quotas are tenant-level, shared across all users

### 4. User Tracking

- Always include user_id in pipeline_runs, step_logs, dq_results
- Use user_id for audit trails, not email (emails can change)
- Track who created/updated resources via created_by_user_id, updated_by_user_id
- Enable per-user analytics for billing allocation
- Preserve user_id even after user deactivation

### 5. Security

- Always encrypt sensitive data with KMS
- Implement row-level security for multi-user isolation
- Log all user actions with user_id for audit
- Regularly review and rotate encryption keys
- Require both X-API-Key and X-User-ID for all authenticated requests

---

## Related Documentation

- [ONBOARDING.md](../guides/ONBOARDING.md) - Tenant and user onboarding workflows
- [TENANT_API_REFERENCE.md](../api/TENANT_API_REFERENCE.md) - Complete API documentation
- [MULTI_TENANCY_DESIGN.md](../implementation/MULTI_TENANCY_DESIGN.md) - Design specifications
- [metadata-schema.md](../reference/metadata-schema.md) - Schema documentation
- [QUICK_START.md](../guides/QUICK_START.md) - Get started in 5 minutes

---

**Version**: 2.0.0 (Multi-User Tenant Architecture)
**Last Updated**: 2025-11-17
**Breaking Changes**: v2.0.0 requires X-User-ID header for all authenticated endpoints
**Status**: Production Ready
