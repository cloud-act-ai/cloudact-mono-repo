# Customer Management Architecture

## Overview

The Convergence Data Pipeline implements a customer-centric, multi-tenant architecture with centralized customer management. This design separates customer metadata from tenant-specific data processing, enabling enterprise-grade subscription management, security, and scalability.

## Architecture Principles

1. **Centralized Customer Data** - Single source of truth for all customer information
2. **Tenant Isolation** - Each customer gets a dedicated BigQuery dataset for data processing
3. **Subscription-Based Access** - Three tiers (Starter, Professional, Enterprise) with enforced limits
4. **Security by Design** - KMS encryption, row-level security, API key rotation
5. **Scalability** - Supports 10,000+ customers with independent scaling

---

## Database Schema Architecture

### Central Customers Dataset

**Dataset**: `customers_metadata` (GCP Project: `gac-prod-471220`)

This centralized dataset contains all customer management tables:

```
customers_metadata/
├── customers                  (Core customer information)
├── tenant_subscriptions     (Subscription plans and billing)
├── tenant_api_keys          (Encrypted API keys with KMS)
├── customer_credentials       (Cloud provider credentials)
├── customer_usage             (Usage tracking and quotas)
├── customer_audit_logs        (Audit trail for compliance)
└── customer_invitations       (Team member invitations)
```

### Per-Customer Tenant Datasets

**Pattern**: `{tenant_id}` (e.g., `acmeinc_23xv2`)

Each customer gets an isolated dataset for their pipeline data:

```
{tenant_id}/
├── x_meta_api_keys            (Customer-specific API keys - legacy)
├── x_meta_cloud_credentials   (Customer-specific cloud credentials)
├── x_meta_pipeline_runs       (Pipeline execution metadata)
├── x_meta_step_logs           (Step-level execution logs)
├── x_meta_dq_results          (Data quality check results)
└── <pipeline_output_tables>   (Customer's processed data)
```

---

## Database Schema Details

### 1. customers

**Purpose**: Core customer identity and configuration

**Schema**:
```sql
CREATE TABLE customers_metadata.customers (
  tenant_id STRING NOT NULL,              -- UUID, primary key
  tenant_id STRING NOT NULL,                -- Human-readable identifier (e.g., "acmeinc_23xv2")
  company_name STRING NOT NULL,             -- Company name
  contact_email STRING,                     -- Primary contact email
  subscription_plan STRING NOT NULL,        -- "starter" | "professional" | "enterprise"
  status STRING NOT NULL,                   -- "active" | "suspended" | "cancelled"
  dataset_id STRING NOT NULL,               -- BigQuery dataset ID (same as tenant_id)
  created_at TIMESTAMP NOT NULL,            -- Account creation time
  updated_at TIMESTAMP NOT NULL,            -- Last modification time
  metadata JSON                             -- Additional customer metadata
)
PARTITION BY DATE(created_at)
CLUSTER BY subscription_plan, status;
```

**Indexes**:
- Primary: `tenant_id`
- Unique: `tenant_id`
- Index: `contact_email`

**Row-Level Security**:
```sql
-- Only allow access to customer's own data
CREATE ROW ACCESS POLICY customer_isolation
ON customers_metadata.customers
GRANT TO ('user:customer@example.com')
FILTER USING (tenant_id = SESSION_USER());
```

---

### 2. tenant_subscriptions

**Purpose**: Subscription plans, billing, and quota management

**Schema**:
```sql
CREATE TABLE customers_metadata.tenant_subscriptions (
  subscription_id STRING NOT NULL,          -- UUID, primary key
  tenant_id STRING NOT NULL,              -- FK to customers.tenant_id
  plan_name STRING NOT NULL,                -- "starter" | "professional" | "enterprise"
  monthly_pipeline_quota INT64,             -- Max pipelines per month (NULL = unlimited)
  concurrent_pipeline_quota INT64,          -- Max concurrent pipelines (NULL = unlimited)
  storage_quota_gb INT64,                   -- Storage limit in GB (NULL = unlimited)
  monthly_cost_usd NUMERIC(10,2),           -- Monthly subscription cost
  billing_cycle_start DATE NOT NULL,        -- Billing cycle start date
  billing_cycle_end DATE,                   -- Billing cycle end date (NULL = active)
  auto_renew BOOL NOT NULL DEFAULT TRUE,    -- Auto-renewal enabled
  stripe_subscription_id STRING,            -- Stripe subscription ID
  stripe_tenant_id STRING,                -- Stripe customer ID
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(billing_cycle_start)
CLUSTER BY tenant_id, plan_name;
```

**Subscription Plans**:

| Plan | Monthly Pipelines | Concurrent | Storage | Cost/Month |
|------|------------------|------------|---------|------------|
| **Starter** | 1,000 | 5 | 100 GB | $99 |
| **Professional** | 5,000 | 15 | 500 GB | $499 |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Custom |

---

### 3. tenant_api_keys

**Purpose**: Centralized API key management with KMS encryption

**Schema**:
```sql
CREATE TABLE customers_metadata.tenant_api_keys (
  api_key_id STRING NOT NULL,               -- UUID, primary key
  tenant_id STRING NOT NULL,              -- FK to customers.tenant_id
  tenant_id STRING NOT NULL,                -- Redundant for fast lookup
  api_key_hash STRING NOT NULL,             -- SHA256 hash for authentication
  encrypted_api_key BYTES NOT NULL,         -- KMS-encrypted API key
  key_name STRING,                          -- Human-readable key name
  scopes ARRAY<STRING>,                     -- API scopes ["pipelines:read", "pipelines:write"]
  is_active BOOL NOT NULL DEFAULT TRUE,     -- Active status
  expires_at TIMESTAMP,                     -- Expiration time (NULL = never)
  last_used_at TIMESTAMP,                   -- Last usage timestamp
  created_at TIMESTAMP NOT NULL,
  created_by STRING,                        -- User who created the key
  revoked_at TIMESTAMP,                     -- Revocation timestamp
  revoked_by STRING                         -- User who revoked the key
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, is_active;
```

**Security**:
- API keys encrypted with Google Cloud KMS
- SHA256 hash used for fast authentication lookup
- Plaintext key shown only once during creation
- Automatic expiration support
- Audit trail for creation/revocation

---

### 4. customer_credentials

**Purpose**: Cloud provider credentials for data source access

**Schema**:
```sql
CREATE TABLE customers_metadata.customer_credentials (
  credential_id STRING NOT NULL,            -- UUID, primary key
  tenant_id STRING NOT NULL,              -- FK to customers.tenant_id
  tenant_id STRING NOT NULL,                -- Redundant for fast lookup
  provider STRING NOT NULL,                 -- "gcp" | "aws" | "azure" | "openai"
  credential_type STRING NOT NULL,          -- "service_account" | "api_key" | "oauth"
  encrypted_credentials BYTES NOT NULL,     -- KMS-encrypted credentials JSON
  credential_name STRING,                   -- Human-readable name
  scopes ARRAY<STRING>,                     -- Provider-specific scopes
  is_active BOOL NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  last_validated_at TIMESTAMP,              -- Last successful validation
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  metadata JSON                             -- Provider-specific metadata
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, provider;
```

**Supported Providers**:
- **GCP**: Service account JSON keys
- **AWS**: Access key ID + Secret access key
- **Azure**: Service principal credentials
- **OpenAI**: API keys

---

### 5. customer_usage

**Purpose**: Real-time usage tracking and quota enforcement

**Schema**:
```sql
CREATE TABLE customers_metadata.customer_usage (
  usage_id STRING NOT NULL,                 -- UUID, primary key
  tenant_id STRING NOT NULL,              -- FK to customers.tenant_id
  tenant_id STRING NOT NULL,
  usage_month DATE NOT NULL,                -- First day of month (YYYY-MM-01)
  pipelines_run_count INT64 NOT NULL DEFAULT 0,        -- Pipelines run this month
  pipelines_running_count INT64 NOT NULL DEFAULT 0,    -- Currently running pipelines
  storage_used_gb NUMERIC(15,2) NOT NULL DEFAULT 0,    -- Storage used in GB
  compute_hours NUMERIC(15,2) NOT NULL DEFAULT 0,      -- Total compute hours
  api_requests_count INT64 NOT NULL DEFAULT 0,         -- API requests this month
  last_pipeline_run_at TIMESTAMP,           -- Last pipeline execution
  quota_reset_at TIMESTAMP NOT NULL,        -- Next quota reset time
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY usage_month
CLUSTER BY tenant_id, usage_month;
```

**Quota Enforcement Logic**:
```python
# Before pipeline execution
if usage.pipelines_run_count >= subscription.monthly_pipeline_quota:
    raise QuotaExceededError("Monthly pipeline quota exceeded")

if usage.pipelines_running_count >= subscription.concurrent_pipeline_quota:
    raise QuotaExceededError("Concurrent pipeline limit reached")

if usage.storage_used_gb >= subscription.storage_quota_gb:
    raise QuotaExceededError("Storage quota exceeded")
```

---

### 6. customer_audit_logs

**Purpose**: Comprehensive audit trail for compliance

**Schema**:
```sql
CREATE TABLE customers_metadata.customer_audit_logs (
  log_id STRING NOT NULL,                   -- UUID, primary key
  tenant_id STRING NOT NULL,              -- FK to customers.tenant_id
  tenant_id STRING NOT NULL,
  event_type STRING NOT NULL,               -- "customer.created" | "api_key.revoked" | etc.
  event_category STRING NOT NULL,           -- "authentication" | "data_access" | "admin"
  actor_type STRING NOT NULL,               -- "user" | "system" | "api"
  actor_id STRING,                          -- User email or system ID
  resource_type STRING,                     -- "api_key" | "pipeline" | "credential"
  resource_id STRING,                       -- Affected resource ID
  action STRING NOT NULL,                   -- "create" | "read" | "update" | "delete"
  result STRING NOT NULL,                   -- "success" | "failure"
  ip_address STRING,                        -- Client IP address
  user_agent STRING,                        -- Client user agent
  metadata JSON,                            -- Event-specific metadata
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, event_type, created_at;
```

**Event Types**:
- `customer.created`, `customer.updated`, `customer.suspended`
- `subscription.created`, `subscription.upgraded`, `subscription.cancelled`
- `api_key.created`, `api_key.revoked`, `api_key.used`
- `credential.created`, `credential.rotated`, `credential.deleted`
- `pipeline.executed`, `pipeline.failed`
- `data.exported`, `data.deleted`

---

### 7. customer_invitations

**Purpose**: Team member invitations and access management

**Schema**:
```sql
CREATE TABLE customers_metadata.customer_invitations (
  invitation_id STRING NOT NULL,            -- UUID, primary key
  tenant_id STRING NOT NULL,              -- FK to customers.tenant_id
  tenant_id STRING NOT NULL,
  invited_email STRING NOT NULL,            -- Email of invitee
  invited_by STRING NOT NULL,               -- Email of inviter
  role STRING NOT NULL,                     -- "admin" | "developer" | "viewer"
  status STRING NOT NULL,                   -- "pending" | "accepted" | "expired" | "revoked"
  invitation_token STRING NOT NULL,         -- Unique token for acceptance
  expires_at TIMESTAMP NOT NULL,            -- Expiration time (default: 7 days)
  accepted_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, status;
```

**Roles**:
- **Admin**: Full access, can manage users and billing
- **Developer**: Can create/edit pipelines, view data
- **Viewer**: Read-only access to dashboards

---

## API Endpoints

### Customer Management

#### Create Customer
```
POST /api/v1/customers
Authorization: Bearer <admin_token>

Request:
{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional"
}

Response:
{
  "tenant_id": "cust_abc123",
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
  "dataset_created": true,
  "status": "active"
}
```

#### Get Customer Details
```
GET /api/v1/customers/{tenant_id}
Authorization: Bearer <admin_token>

Response:
{
  "tenant_id": "cust_abc123",
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Corporation",
  "subscription_plan": "professional",
  "status": "active",
  "created_at": "2025-11-17T10:00:00Z"
}
```

#### Update Customer
```
PATCH /api/v1/customers/{tenant_id}
Authorization: Bearer <admin_token>

Request:
{
  "company_name": "ACME Inc.",
  "contact_email": "newadmin@acmecorp.com"
}
```

#### Suspend/Activate Customer
```
POST /api/v1/customers/{tenant_id}/suspend
Authorization: Bearer <admin_token>

Request:
{
  "reason": "payment_failed",
  "notify_customer": true
}
```

### Subscription Management

#### Upgrade Subscription
```
POST /api/v1/customers/{tenant_id}/subscription/upgrade
Authorization: Bearer <admin_token>

Request:
{
  "new_plan": "enterprise",
  "effective_date": "2025-12-01"
}
```

#### Get Usage Statistics
```
GET /api/v1/customers/{tenant_id}/usage
Authorization: X-API-Key: <customer_api_key>

Response:
{
  "tenant_id": "cust_abc123",
  "current_month": "2025-11",
  "pipelines_run": 450,
  "pipelines_quota": 5000,
  "pipelines_running": 3,
  "concurrent_quota": 15,
  "storage_used_gb": 245.67,
  "storage_quota_gb": 500,
  "quota_reset_at": "2025-12-01T00:00:00Z"
}
```

### API Key Management

#### Create API Key
```
POST /api/v1/customers/{tenant_id}/api-keys
Authorization: Bearer <admin_token>

Request:
{
  "key_name": "Production Key",
  "scopes": ["pipelines:read", "pipelines:write"],
  "expires_in_days": 90
}

Response:
{
  "api_key_id": "key_xyz789",
  "api_key": "acmeinc_23xv2_api_NEW_KEY_HERE",
  "scopes": ["pipelines:read", "pipelines:write"],
  "expires_at": "2026-02-15T00:00:00Z"
}
```

#### Revoke API Key
```
POST /api/v1/customers/{tenant_id}/api-keys/{key_id}/revoke
Authorization: Bearer <admin_token>
```

### Credentials Management

#### Add Cloud Credentials
```
POST /api/v1/customers/{tenant_id}/credentials
Authorization: X-API-Key: <customer_api_key>

Request:
{
  "provider": "gcp",
  "credential_type": "service_account",
  "credential_name": "GCP Billing Export",
  "credentials": {
    "type": "service_account",
    "project_id": "customer-project",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...",
    "client_email": "service-account@project.iam.gserviceaccount.com"
  }
}

Response:
{
  "credential_id": "cred_def456",
  "provider": "gcp",
  "credential_name": "GCP Billing Export",
  "is_active": true,
  "last_validated_at": "2025-11-17T10:15:00Z"
}
```

---

## Security Model

### 1. KMS Encryption

**Encrypted Fields**:
- `tenant_api_keys.encrypted_api_key`
- `customer_credentials.encrypted_credentials`

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

**KMS Key Configuration**:
```bash
# Create KMS keyring
gcloud kms keyrings create customer-keys \
  --location=us-central1

# Create encryption key
gcloud kms keys create api-key-encryption \
  --location=us-central1 \
  --keyring=customer-keys \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time=2026-02-15T00:00:00Z
```

### 2. Row-Level Security (RLS)

**Tenant Isolation Policy**:
```sql
-- Ensure users can only access their own customer data
CREATE ROW ACCESS POLICY tenant_isolation
ON customers_metadata.tenant_api_keys
GRANT TO ('user:*')
FILTER USING (
  tenant_id IN (
    SELECT tenant_id
    FROM customers_metadata.customers
    WHERE contact_email = SESSION_USER()
  )
);
```

### 3. API Key Authentication

**Authentication Flow**:
```
1. Client sends request with X-API-Key header
2. Server extracts API key
3. Server computes SHA256 hash
4. Server queries tenant_api_keys table:
   WHERE api_key_hash = SHA256(provided_key)
     AND is_active = TRUE
     AND (expires_at IS NULL OR expires_at > NOW())
5. Server loads customer details from customers table
6. Server enforces quota checks from customer_usage table
7. Request proceeds if all checks pass
```

---

## Workflow Diagrams

### Customer Onboarding Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Stripe Checkout)                │
│  User signs up → Stripe checkout → Payment success          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓ (Webhook)
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND API                               │
│  Step 1: Create customer in customers table                  │
│  Step 2: Create subscription in tenant_subscriptions       │
│  Step 3: Create BigQuery dataset for customer                │
│  Step 4: Generate API key → tenant_api_keys               │
│  Step 5: Send welcome email with API key                     │
│  Step 6: Create initial usage record → customer_usage       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    CUSTOMER READY                            │
│  Customer can now run pipelines with API key                 │
└─────────────────────────────────────────────────────────────┘
```

### Pipeline Execution with Quota Enforcement

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT: POST /api/v1/pipelines/run                         │
│  Headers: X-API-Key: acmeinc_23xv2_api_xxxxx                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  AUTHENTICATION                                              │
│  1. Hash API key (SHA256)                                    │
│  2. Query tenant_api_keys table                           │
│  3. Verify is_active = TRUE                                  │
│  4. Check expiration                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  QUOTA CHECKS                                                │
│  1. Load customer_usage for current month                    │
│  2. Load tenant_subscriptions                             │
│  3. Verify: pipelines_run < monthly_quota                    │
│  4. Verify: pipelines_running < concurrent_quota             │
│  5. Verify: storage_used < storage_quota                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓ (All checks pass)
┌─────────────────────────────────────────────────────────────┐
│  PIPELINE EXECUTION                                          │
│  1. Increment pipelines_running_count                        │
│  2. Execute pipeline                                         │
│  3. Log to {tenant_id}.x_meta_pipeline_runs                 │
│  4. On completion: decrement pipelines_running_count         │
│  5. Increment pipelines_run_count                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Migration from Old Architecture

### Old Architecture (Tenant-Specific API Keys)
```
{tenant_id}/
├── x_meta_api_keys        (Per-tenant API keys)
├── x_meta_cloud_credentials
└── ...
```

### New Architecture (Centralized Customers)
```
customers_metadata/
├── customers
├── tenant_api_keys      (Centralized API keys)
├── customer_credentials
└── ...

{tenant_id}/
├── x_meta_api_keys        (Legacy - kept for compatibility)
├── x_meta_pipeline_runs
└── ...
```

**Migration Steps** - See [MIGRATION_GUIDE.md](../guides/MIGRATION_GUIDE.md)

---

## Performance Considerations

### Query Optimization

**Indexes**:
- `tenant_api_keys.api_key_hash` (unique) - Fast authentication
- `customers.tenant_id` (unique) - Fast customer lookup
- `customer_usage.tenant_id, usage_month` (clustered) - Fast quota checks

**Partitioning**:
- All tables partitioned by DATE(created_at)
- Reduces query costs and improves performance
- Automatic data retention policies

**Clustering**:
- `customers` clustered by `subscription_plan, status`
- `tenant_api_keys` clustered by `tenant_id, is_active`
- `customer_usage` clustered by `tenant_id, usage_month`

### Caching Strategy

**Redis Cache**:
```python
# Cache customer details for 5 minutes
cache_key = f"customer:{tenant_id}"
customer = redis.get(cache_key)
if not customer:
    customer = bigquery.query(f"SELECT * FROM customers WHERE tenant_id = '{tenant_id}'")
    redis.setex(cache_key, 300, customer)  # TTL: 5 minutes
```

**Cache Invalidation**:
- On customer update: `redis.delete(f"customer:{tenant_id}")`
- On subscription change: `redis.delete(f"subscription:{tenant_id}")`
- On quota update: `redis.delete(f"usage:{tenant_id}:{month}")`

---

## Monitoring and Alerts

### Key Metrics

1. **Customer Health**:
   - Active customers count
   - Suspended customers count
   - Churn rate

2. **Usage Metrics**:
   - Pipelines run per customer
   - Quota utilization percentage
   - Storage usage trends

3. **Performance Metrics**:
   - API authentication latency
   - Quota check latency
   - Pipeline execution time

### Alerts

```yaml
# Alert: Customer approaching quota limit
- name: quota_approaching_limit
  condition: usage.pipelines_run_count >= subscription.monthly_pipeline_quota * 0.9
  action: send_email_notification
  severity: warning

# Alert: Customer quota exceeded
- name: quota_exceeded
  condition: usage.pipelines_run_count >= subscription.monthly_pipeline_quota
  action: send_email_notification + suspend_pipeline_execution
  severity: critical

# Alert: API key expiring soon
- name: api_key_expiring
  condition: tenant_api_keys.expires_at <= NOW() + INTERVAL 7 DAY
  action: send_email_notification
  severity: warning
```

---

## Best Practices

1. **API Key Management**:
   - Rotate API keys every 90 days
   - Use separate keys for different environments (dev, staging, prod)
   - Never commit API keys to version control
   - Implement key expiration policies

2. **Quota Management**:
   - Set realistic quotas based on subscription tier
   - Monitor usage trends to prevent sudden quota exhaustion
   - Provide grace period before hard quota enforcement
   - Send proactive notifications at 75%, 90%, 100% usage

3. **Security**:
   - Always encrypt sensitive data with KMS
   - Implement row-level security for multi-tenant isolation
   - Log all admin actions to audit_logs table
   - Regularly review and rotate encryption keys

4. **Performance**:
   - Cache frequently accessed customer data
   - Use prepared statements for quota checks
   - Batch audit log writes to reduce BigQuery costs
   - Partition and cluster tables for optimal query performance

---

## Related Documentation

- [Migration Guide](../guides/MIGRATION_GUIDE.md) - Migrate from old to new architecture
- [API Reference](../api/CUSTOMER_API_REFERENCE.md) - Complete API documentation
- [Encryption Guide](../security/ENCRYPTION.md) - KMS encryption details
- [Onboarding Guide](../guides/ONBOARDING.md) - Customer onboarding workflow

---

**Version**: 1.0.0
**Last Updated**: 2025-11-17
**Status**: Production Ready
