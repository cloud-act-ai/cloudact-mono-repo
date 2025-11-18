# Convergence Data Pipeline API

**Version:** 1.0
**Base URL:** `https://your-service-url.run.app`

## Architecture

**This is a BACKEND SERVICE** triggered by:
- Cloud Scheduler (automated hourly/daily runs)
- Manual API calls (tenant-initiated)

Key concepts:
- `tenant_id` = Organization (quotas/limits enforced at this level)
- `user_id` = Audit logging only (who triggered the pipeline)
- Subscription = Belongs to tenant
- NO user management (handled by frontend/Supabase)

---

## Authentication

All endpoints (except `/health`) require authentication via headers:

### Required Headers
```http
X-API-Key: {tenant_api_key}     # Tenant authentication (required)
X-User-ID: {user_id}            # Audit logging only (optional)
```

**Notes:**
- `X-API-Key`: Unique per tenant, obtained during onboarding
- `X-User-ID`: Frontend user ID for audit trail (not validated by backend)

---

## Endpoints

### 1. Tenant Onboarding

**POST** `/api/v1/tenants/onboard`

Creates a new tenant with API key, BigQuery dataset, and subscription.

#### Request Body
```json
{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "Acme Inc",
  "admin_email": "admin@acme.com",
  "subscription_plan": "STARTER"
}
```

#### Response (200 OK)
```json
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_xY9kL2mP4qR8vT",
  "subscription_plan": "STARTER",
  "dataset_created": true,
  "tables_created": [
    "tenant_pipeline_runs",
    "tenant_step_logs",
    "tenant_dq_results"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Tenant Acme Inc onboarded successfully..."
}
```

**IMPORTANT:** Save the `api_key` - it's only shown once!

#### Subscription Plans
- **STARTER**: 2 team, 3 providers, 6 daily pipelines
- **PROFESSIONAL**: 6 team, 6 providers, 25 daily pipelines
- **SCALE**: 11 team, 10 providers, 100 daily pipelines

---

### 2. Pipeline Execution

**POST** `/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}`

Trigger a data pipeline with automatic variable substitution.

#### Path Parameters
- `tenant_id`: Your tenant identifier (must match authenticated tenant)
- `provider`: Cloud provider (`gcp`, `aws`, `azure`)
- `domain`: Domain category (`cost`, `security`, `compute`)
- `template`: Template name (`billing_cost`, `usage_metrics`, etc.)

#### Headers
```http
X-API-Key: acmeinc_23xv2_api_xY9kL2mP4qR8vT
X-User-ID: user_789
```

#### Request Body (Optional)
```json
{
  "trigger_by": "john@acme.com",
  "date": "2025-11-15"
}
```

#### Response (200 OK)
```json
{
  "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "pipeline_id": "acmeinc_23xv2-gcp-cost-billing_cost",
  "tenant_id": "acmeinc_23xv2",
  "status": "PENDING",
  "message": "Pipeline triggered successfully (async mode)"
}
```

#### Features
- Template-based configuration (one template, many tenants)
- Automatic variable substitution (`{tenant_id}`, `{pipeline_id}`)
- Async execution (non-blocking)
- Built-in concurrency control (prevents duplicate runs)
- Rate limited: 50 requests/minute per tenant

#### Quota Enforcement
Enforced at **tenant level**:
- Daily pipeline quota checked before execution
- Returns `429 Too Many Requests` if quota exceeded
- Quota resets at midnight UTC

#### Status Codes
- `200` - Pipeline triggered successfully
- `403` - Forbidden (tenant ID mismatch)
- `404` - Template not found
- `429` - Quota exceeded or rate limit hit
- `500` - Internal server error

---

### 3. Get Pipeline Run Status

**GET** `/api/v1/pipelines/runs/{pipeline_logging_id}`

Get details and current status of a specific pipeline run.

#### Headers
```http
X-API-Key: acmeinc_23xv2_api_xY9kL2mP4qR8vT
```

#### Response (200 OK)
```json
{
  "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "pipeline_id": "acmeinc_23xv2-gcp-cost-billing_cost",
  "tenant_id": "acmeinc_23xv2",
  "status": "COMPLETE",
  "trigger_type": "api",
  "trigger_by": "john@acme.com",
  "start_time": "2025-11-15T14:30:00Z",
  "end_time": "2025-11-15T14:32:15Z",
  "duration_ms": 135000
}
```

#### Pipeline Status Values
- `PENDING` - Queued for execution
- `RUNNING` - Currently executing
- `COMPLETE` - Successfully completed
- `FAILED` - Execution failed

---

### 4. List Pipeline Runs

**GET** `/api/v1/pipelines/runs`

List recent pipeline runs for the authenticated tenant.

#### Query Parameters
- `pipeline_id` (optional): Filter by pipeline ID
- `status` (optional): Filter by status (`PENDING`, `RUNNING`, `COMPLETE`, `FAILED`)
- `limit` (optional): Max results (1-100, default: 20)

#### Headers
```http
X-API-Key: acmeinc_23xv2_api_xY9kL2mP4qR8vT
```

#### Response (200 OK)
```json
[
  {
    "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "pipeline_id": "acmeinc_23xv2-gcp-cost-billing_cost",
    "tenant_id": "acmeinc_23xv2",
    "status": "COMPLETE",
    "trigger_type": "api",
    "trigger_by": "john@acme.com",
    "start_time": "2025-11-15T14:30:00Z",
    "end_time": "2025-11-15T14:32:15Z",
    "duration_ms": 135000
  }
]
```

---

### 5. Health Check

**GET** `/health`

Basic health check endpoint (no authentication required).

#### Response (200 OK)
```json
{
  "status": "healthy",
  "service": "convergence-data-pipeline",
  "version": "1.0.0",
  "environment": "production"
}
```

---

## Rate Limits

All endpoints are rate-limited to prevent abuse:

### Per-Tenant Limits
- **Default**: 100 requests/minute, 1000 requests/hour
- **Pipeline Execution**: 50 requests/minute per tenant

### Global Limits
- **All endpoints**: 10,000 requests/minute globally

### Rate Limit Headers
```http
X-RateLimit-Tenant-Limit: 100
X-RateLimit-Tenant-Remaining: 87
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation error",
  "message": "Invalid tenant_id format",
  "details": {
    "field": "tenant_id",
    "issue": "must match pattern ^[a-zA-Z0-9_]{3,50}$"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication failed",
  "message": "Invalid or missing API key"
}
```

### 403 Forbidden
```json
{
  "error": "Authorization failed",
  "message": "Tenant ID mismatch: authenticated as 'tenant_a' but requested 'tenant_b'"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "Daily pipeline quota exceeded. You have run 6 pipelines today (limit: 6)",
  "retry_after": 43200
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred",
  "request_id": "req_abc123"
}
```

---

## Quota Management

Quotas are enforced at the **tenant level** based on subscription plan:

| Plan          | Daily Pipelines | Concurrent Pipelines | Team Members | Providers |
|---------------|-----------------|----------------------|--------------|-----------|
| STARTER       | 6               | 3                    | 2            | 3         |
| PROFESSIONAL  | 25              | 5                    | 6            | 6         |
| SCALE         | 100             | 10                   | 11           | 10        |

### How Quotas Work
1. Each pipeline execution checks tenant's daily quota
2. If quota exceeded, returns `429 Too Many Requests`
3. Quotas reset at midnight UTC
4. Concurrent pipeline limit prevents resource exhaustion

---

## Best Practices

### Authentication
- Store API keys securely (environment variables, secrets manager)
- Rotate API keys periodically
- Use separate API keys for development/production

### Pipeline Execution
- Include meaningful `trigger_by` values for audit trail
- Pass `user_id` via `X-User-ID` header for logging
- Check quota before triggering pipelines in bulk

### Error Handling
- Implement exponential backoff for rate limit errors
- Monitor `pipeline_logging_id` for tracking execution status
- Log all API errors for debugging

### Performance
- Use async execution (non-blocking)
- Poll status endpoint instead of waiting for completion
- Implement webhooks for completion notifications (if available)
