# Enterprise Multi-Tenancy Design Specification

## Executive Summary

This document specifies the enterprise-grade multi-tenancy architecture for the Convergence Data Pipeline platform. The design implements complete tenant isolation, quota management, usage tracking, and production-ready security controls.

### Key Design Goals

1. **Complete Tenant Isolation** - Dataset-per-tenant model with zero data leakage
2. **Quota Management** - Monthly and concurrent pipeline limits per tenant
3. **Usage Tracking** - Real-time counters for billing and analytics
4. **Schema-Driven** - All table schemas in config files (zero hardcoded schemas)
5. **Production Ready** - Enterprise security, monitoring, and error handling

---

## Architecture Overview

### Multi-Tenancy Model

```
BigQuery Project (gac-prod-471220)
│
├── tenant_1/
│   ├── tenants          ← NEW: Quota & status tracking
│   ├── api_keys         ← Authentication
│   ├── pipeline_runs    ← Execution history
│   ├── step_logs        ← Detailed logs
│   └── <data tables>
│
├── tenant_2/
│   └── ... (same structure)
│
└── tenant_N/
    └── ... (same structure)
```

**Design Principles:**
- Each tenant = Separate BigQuery dataset
- No cross-tenant queries or data access
- Identical table structure across all tenants
- Independent scaling per tenant

---

## Tenant Metadata Schema

### New `tenants` Table

**Purpose**: Central registry for tenant metadata, quotas, and usage tracking

**Schema Location**: `templates/customer/onboarding/schemas/x_meta_tenants.json`

**Fields:**

| Field | Type | Mode | Description |
|-------|------|------|-------------|
| `tenant_id` | STRING | REQUIRED | Unique tenant identifier (primary key) |
| `company_name` | STRING | REQUIRED | Company/organization name |
| `contact_email` | STRING | NULLABLE | Primary contact email for notifications |
| `subscription_tier` | STRING | REQUIRED | FREE, STARTER, PROFESSIONAL, ENTERPRISE |
| `is_active` | BOOLEAN | REQUIRED | Account active status (controls pipeline execution) |
| `max_pipelines_per_month` | INT64 | NULLABLE | Monthly pipeline limit (NULL = unlimited) |
| `max_concurrent_pipelines` | INT64 | NULLABLE | Concurrent execution limit (NULL = unlimited) |
| `pipeline_runs_count` | INT64 | REQUIRED | Total lifetime pipeline executions |
| `pipeline_runs_this_month` | INT64 | REQUIRED | Pipeline runs in current month (resets monthly) |
| `current_running_pipelines` | INT64 | REQUIRED | Number of currently executing pipelines |
| `last_pipeline_run_at` | TIMESTAMP | NULLABLE | Last pipeline execution timestamp |
| `quota_reset_date` | DATE | REQUIRED | Date when monthly quota was last reset |
| `created_at` | TIMESTAMP | REQUIRED | Tenant onboarding timestamp (immutable) |
| `updated_at` | TIMESTAMP | REQUIRED | Last metadata update timestamp |
| `suspended_at` | TIMESTAMP | NULLABLE | Account suspension timestamp (NULL if active) |
| `suspension_reason` | STRING | NULLABLE | Reason for suspension (PAYMENT_FAILED, QUOTA_EXCEEDED, etc.) |
| `notes` | STRING | NULLABLE | Internal admin notes (not exposed to tenant) |

**Clustering**: `tenant_id` (for fast lookups)

---

## Subscription Tiers

| Tier | Monthly Pipelines | Concurrent Pipelines | Use Case |
|------|-------------------|---------------------|----------|
| **FREE** | 100 | 1 | Development, testing, small projects |
| **STARTER** | 500 | 3 | Small businesses, side projects |
| **PROFESSIONAL** | 2,000 | 10 | Medium businesses, production workloads |
| **ENTERPRISE** | Unlimited (NULL) | Unlimited (NULL) | Large enterprises, heavy usage |

**Default Tier**: FREE (when not specified during onboarding)

---

## Quota Enforcement Flow

### Pipeline Execution Sequence

```
1. API Request Received
   ↓
2. Authenticate API Key (existing)
   ↓
3. ✅ NEW: Check Tenant Active Status
   Query: SELECT is_active FROM tenants WHERE tenant_id = ?
   Fail: HTTP 403 "Tenant account is inactive"
   ↓
4. ✅ NEW: Check Monthly Quota
   Query: SELECT pipeline_runs_this_month, max_pipelines_per_month FROM tenants
   Condition: pipeline_runs_this_month < max_pipelines_per_month (or NULL)
   Fail: HTTP 429 "Monthly pipeline quota exceeded"
   ↓
5. ✅ NEW: Check Concurrent Quota
   Query: SELECT current_running_pipelines, max_concurrent_pipelines FROM tenants
   Condition: current_running_pipelines < max_concurrent_pipelines (or NULL)
   Fail: HTTP 429 "Concurrent pipeline limit reached"
   ↓
6. ✅ NEW: Validate Tenant ID Match
   Condition: URL tenant_id == API key tenant_id
   Fail: HTTP 403 "Tenant ID mismatch"
   ↓
7. Execute Pipeline
   ↓
8. ✅ NEW: Increment Usage Counters
   UPDATE tenants SET
     pipeline_runs_count = pipeline_runs_count + 1,
     pipeline_runs_this_month = pipeline_runs_this_month + 1,
     current_running_pipelines = current_running_pipelines + 1,
     last_pipeline_run_at = CURRENT_TIMESTAMP()
   ↓
9. On Pipeline Completion/Failure
   UPDATE tenants SET
     current_running_pipelines = current_running_pipelines - 1
```

### Error Responses

**Inactive Tenant (HTTP 403)**:
```json
{
  "detail": "Tenant account is inactive. Contact support to reactivate.",
  "tenant_id": "acmeinc_23xv2",
  "suspended_at": "2025-11-10T15:30:00Z",
  "suspension_reason": "PAYMENT_FAILED"
}
```

**Monthly Quota Exceeded (HTTP 429)**:
```json
{
  "detail": "Monthly pipeline quota exceeded. Used 1000/1000 pipelines this month.",
  "tenant_id": "acmeinc_23xv2",
  "quota_reset_date": "2025-12-01",
  "current_usage": 1000,
  "quota_limit": 1000
}
```

**Concurrent Limit Reached (HTTP 429)**:
```json
{
  "detail": "Concurrent pipeline limit reached. 5/5 pipelines currently running.",
  "tenant_id": "acmeinc_23xv2",
  "current_running": 5,
  "concurrent_limit": 5
}
```

---

## Onboarding API Specification

### Enhanced Request Model

```python
class OnboardCustomerRequest(BaseModel):
    tenant_id: str = Field(
        ...,
        regex="^[a-zA-Z0-9_]{3,50}$",
        description="Unique tenant identifier"
    )
    company_name: str = Field(..., description="Company name")
    contact_email: Optional[str] = Field(None, description="Contact email")
    subscription_tier: str = Field(
        default="FREE",
        description="FREE, STARTER, PROFESSIONAL, ENTERPRISE"
    )
    max_pipelines_per_month: Optional[int] = Field(
        None,
        description="Monthly pipeline limit (NULL = unlimited)"
    )
    max_concurrent_pipelines: Optional[int] = Field(
        None,
        description="Concurrent execution limit (NULL = unlimited)"
    )
    force_recreate_dataset: bool = Field(default=False)
    force_recreate_tables: bool = Field(default=False)
```

### Onboarding Process

```
1. Validate Request
   - tenant_id format
   - subscription_tier validity
   - quota limits (positive integers or NULL)
   ↓
2. Create BigQuery Dataset
   - dataset_id = tenant_id
   - location = US
   - labels = {tenant: tenant_id}
   ↓
3. Create Metadata Tables (from schema files)
   - x_meta_api_keys (templates/customer/onboarding/schemas/x_meta_api_keys.json)
   - x_meta_cloud_credentials (templates/customer/onboarding/schemas/x_meta_cloud_credentials.json)
   - x_meta_tenants (templates/customer/onboarding/schemas/x_meta_tenants.json) ← NEW
   - x_meta_pipeline_runs (templates/customer/onboarding/schemas/x_meta_pipeline_runs.json)
   - x_meta_step_logs (templates/customer/onboarding/schemas/x_meta_step_logs.json)
   - x_meta_dq_results (templates/customer/onboarding/schemas/x_meta_dq_results.json)
   ↓
4. Generate API Key
   - format: {tenant_id}_api_{random_16_chars}
   - SHA256 hash for lookup
   - KMS encryption for storage
   ↓
5. Populate Tenants Table
   INSERT INTO tenants (
     tenant_id, company_name, contact_email, subscription_tier,
     is_active, max_pipelines_per_month, max_concurrent_pipelines,
     pipeline_runs_count, pipeline_runs_this_month, current_running_pipelines,
     quota_reset_date, created_at, updated_at
   ) VALUES (
     ?, ?, ?, ?,
     TRUE, ?, ?,
     0, 0, 0,
     CURRENT_DATE(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
   )
   ↓
6. Run Validation Pipeline (optional)
   ↓
7. Return Response
   - API key (show once)
   - Tenant status
   - Tables created
```

---

## TenantService Layer

### Service Interface

**File**: `src/core/services/tenant_service.py`

**Methods**:

```python
class TenantService:
    async def get_tenant_info(tenant_id: str) -> Dict:
        """
        Retrieve tenant metadata and current usage.

        Returns:
            {
                "tenant_id": str,
                "company_name": str,
                "subscription_tier": str,
                "is_active": bool,
                "quotas": {
                    "max_pipelines_per_month": int | None,
                    "max_concurrent_pipelines": int | None
                },
                "usage": {
                    "pipeline_runs_count": int,
                    "pipeline_runs_this_month": int,
                    "current_running_pipelines": int,
                    "last_pipeline_run_at": str | None
                },
                "quota_reset_date": str
            }
        """

    async def is_tenant_active(tenant_id: str) -> bool:
        """Check if tenant account is active."""

    async def check_quota_limits(tenant_id: str) -> Tuple[bool, str | None]:
        """
        Validate tenant can run another pipeline.

        Checks:
        1. is_active == TRUE
        2. pipeline_runs_this_month < max_pipelines_per_month
        3. current_running_pipelines < max_concurrent_pipelines

        Returns:
            (can_run: bool, error_message: str | None)
        """

    async def increment_pipeline_usage(tenant_id: str):
        """
        Increment usage counters when pipeline starts.

        Updates:
        - pipeline_runs_count++
        - pipeline_runs_this_month++
        - current_running_pipelines++
        - last_pipeline_run_at = NOW()
        """

    async def decrement_running_pipelines(tenant_id: str):
        """
        Decrement concurrent counter when pipeline completes.

        Updates:
        - current_running_pipelines--
        """

    async def update_tenant_quotas(
        tenant_id: str,
        subscription_tier: str,
        max_pipelines_per_month: int | None,
        max_concurrent_pipelines: int | None
    ):
        """Update tenant quotas (called by frontend via re-onboarding)."""

    async def reset_monthly_usage():
        """
        Reset monthly counters for all tenants.

        Run as cron job on 1st day of each month.

        Updates:
        - pipeline_runs_this_month = 0
        - quota_reset_date = CURRENT_DATE()
        """
```

---

## Implementation Changes

### Phase 1: Core Infrastructure

**Files to Modify**:

1. **`src/core/metadata/initializer.py`**
   - Add `_ensure_tenants_table()` method
   - Load schema from `templates/customer/onboarding/schemas/x_meta_tenants.json`
   - Create table with clustering on `tenant_id`

2. **`src/core/services/tenant_service.py`** (NEW FILE)
   - Implement TenantService class
   - All methods listed above
   - Uses BigQueryClient for queries

3. **`templates/customer/onboarding/schemas/x_meta_tenants.json`** (ALREADY CREATED)
   - Production-ready schema
   - All fields documented

### Phase 2: Onboarding Enhancement

**Files to Modify**:

1. **`src/app/routers/customers.py`**
   - Update `OnboardCustomerRequest` model
   - Add quota fields
   - Populate tenants table after API key creation

### Phase 3: Quota Enforcement

**Files to Modify**:

1. **`src/app/routers/pipelines.py`**
   - Before pipeline execution:
     ```python
     can_run, error_msg = await tenant_service.check_quota_limits(tenant_id)
     if not can_run:
         raise HTTPException(status_code=429, detail=error_msg)
     ```
   - After pipeline starts:
     ```python
     await tenant_service.increment_pipeline_usage(tenant_id)
     ```

2. **`src/core/workers/pipeline_task.py`** (or wherever pipeline completion is handled)
   - On completion/failure:
     ```python
     await tenant_service.decrement_running_pipelines(tenant_id)
     ```

---

## Security Design

### Tenant Isolation

1. **Dataset Isolation**
   - Each tenant = Separate BigQuery dataset
   - No shared tables across tenants
   - Queries scoped to tenant's dataset

2. **API Key Validation**
   - Extract tenant_id from API key (via BigQuery lookup)
   - Validate URL tenant_id matches API key tenant_id
   - Reject if mismatch: HTTP 403

3. **Active Status Enforcement**
   - Check `tenants.is_active` before every pipeline run
   - Suspended tenants cannot execute pipelines

### Quota Security

1. **Atomic Updates**
   - Use BigQuery UPDATE statements (atomic operations)
   - No race conditions on counter increments

2. **Monthly Resets**
   - Automated cron job (1st of each month)
   - Resets `pipeline_runs_this_month = 0`
   - Updates `quota_reset_date`

3. **Concurrent Tracking**
   - Increment on pipeline start
   - Decrement on completion/failure
   - Prevent resource exhaustion

---

## Monitoring & Analytics

### Usage Queries

**Tenant Dashboard**:
```sql
SELECT
  tenant_id,
  company_name,
  subscription_tier,
  pipeline_runs_count,
  pipeline_runs_this_month,
  max_pipelines_per_month,
  current_running_pipelines,
  max_concurrent_pipelines,
  ROUND(pipeline_runs_this_month / NULLIF(max_pipelines_per_month, 0) * 100, 2) as quota_usage_percent
FROM `{project}.{tenant_id}.tenants`;
```

**Top Users This Month**:
```sql
SELECT
  tenant_id,
  company_name,
  subscription_tier,
  pipeline_runs_this_month,
  max_pipelines_per_month
FROM `{project}.{tenant_id}.tenants`
ORDER BY pipeline_runs_this_month DESC
LIMIT 10;
```

**Suspended Tenants**:
```sql
SELECT
  tenant_id,
  company_name,
  suspended_at,
  suspension_reason
FROM `{project}.{tenant_id}.tenants`
WHERE is_active = FALSE
ORDER BY suspended_at DESC;
```

---

## Frontend Integration

### Onboarding Flow

```javascript
// Step 1: Onboard tenant
const response = await fetch('/api/v1/customers/onboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenant_id: 'acmeinc_23xv2',
    company_name: 'ACME Corporation',
    subscription_tier: 'PROFESSIONAL',
    max_pipelines_per_month: 1000,
    max_concurrent_pipelines: 5
  })
});

const { api_key, tenant_status } = await response.json();

// Step 2: Save API key securely
localStorage.setItem('api_key', api_key);  // Or secure storage

// Step 3: Display tenant status
console.log(tenant_status);
// {
//   "is_active": true,
//   "subscription_tier": "PROFESSIONAL",
//   "max_pipelines_per_month": 1000,
//   "pipeline_runs_count": 0,
//   "pipeline_runs_this_month": 0
// }
```

### Update Quotas

```javascript
// Re-onboard to update quotas (preserves existing data)
const response = await fetch('/api/v1/customers/onboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenant_id: 'acmeinc_23xv2',
    company_name: 'ACME Corporation',
    subscription_tier: 'ENTERPRISE',  // Upgrade tier
    max_pipelines_per_month: null,    // Unlimited
    max_concurrent_pipelines: null    // Unlimited
  })
});
```

### Suspend Tenant

```javascript
// Direct BigQuery update (or create admin API endpoint)
await bigquery.query(`
  UPDATE \`{project}.{tenant_id}.tenants\`
  SET
    is_active = FALSE,
    suspended_at = CURRENT_TIMESTAMP(),
    suspension_reason = 'PAYMENT_FAILED'
  WHERE tenant_id = 'acmeinc_23xv2'
`);
```

---

## Scheduler Integration

### Independent Pipeline Triggering

Scheduler triggers pipelines without any quota-related changes:

```bash
# Cron job triggers pipeline
curl -X POST \
  "http://localhost:8080/api/v1/pipelines/run/${TENANT_ID}/${PROVIDER}/${DOMAIN}/${PIPELINE}" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"trigger_by": "scheduler"}'
```

**Quota enforcement happens automatically** in the pipeline router (no scheduler changes needed).

---

## Migration Plan

### Existing Tenants

For tenants onboarded before this feature:

```sql
-- Create tenants table (if not exists)
-- Schema from configs/metadata/schemas/tenants.json

-- Populate with default data
INSERT INTO `{project}.{tenant_id}.tenants`
  (tenant_id, company_name, subscription_tier, is_active,
   max_pipelines_per_month, max_concurrent_pipelines,
   pipeline_runs_count, pipeline_runs_this_month, current_running_pipelines,
   quota_reset_date, created_at, updated_at)
VALUES
  ('{tenant_id}', '{tenant_id}', 'FREE', TRUE,
   100, 1,
   0, 0, 0,
   CURRENT_DATE(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());
```

---

## Testing Requirements

### Unit Tests

1. **TenantService Tests**
   - `test_check_quota_limits_active_tenant()`
   - `test_check_quota_limits_inactive_tenant()`
   - `test_check_quota_limits_monthly_exceeded()`
   - `test_check_quota_limits_concurrent_exceeded()`
   - `test_increment_pipeline_usage()`
   - `test_decrement_running_pipelines()`

2. **Onboarding Tests**
   - `test_onboard_with_quotas()`
   - `test_onboard_creates_tenants_table()`
   - `test_update_quotas_via_reonboarding()`

### Integration Tests

1. **Pipeline Execution with Quotas**
   - `test_pipeline_blocked_inactive_tenant()`
   - `test_pipeline_blocked_monthly_quota_exceeded()`
   - `test_pipeline_blocked_concurrent_limit_reached()`
   - `test_pipeline_executes_within_quota()`
   - `test_usage_counters_increment_decrement()`

### E2E Tests

1. **Complete Tenant Lifecycle**
   - Onboard → Run pipelines → Hit quota → Upgrade → Run more

---

## Performance Considerations

1. **Query Optimization**
   - `tenants` table clustered by `tenant_id`
   - Single row per tenant (fast lookups)
   - Indexed queries for quota checks

2. **Atomic Operations**
   - BigQuery UPDATE statements are atomic
   - No locking required for counter increments

3. **Scalability**
   - Each tenant = independent dataset
   - No cross-tenant query overhead
   - Linear scaling with tenant count

---

## Documentation Updates

- ✅ `docs/ONBOARDING.md` - Updated with quota management
- ✅ `MULTI_TENANCY_DESIGN.md` - This document
- ✅ `IMPLEMENTATION_SUMMARY.md` - Step-by-step implementation guide
- ✅ `templates/customer/onboarding/schemas/x_meta_tenants.json` - Production-ready schema
- ⏳ `README.md` - Update with new features (if needed)

---

**Version**: 2.0 (Enterprise Multi-Tenancy)
**Status**: Design Complete - Ready for Implementation
**Last Updated**: November 2025
