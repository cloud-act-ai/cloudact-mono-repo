# API Reference

**Convergence Data Pipeline API Documentation**

**Version**: 1.1.0 | **Base URL**: `https://your-service-url.run.app`

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Admin Endpoints](#admin-endpoints)
4. [Tenant Endpoints](#tenant-endpoints)
5. [Pipeline Endpoints](#pipeline-endpoints)
6. [Rate Limits & Quotas](#rate-limits--quotas)
7. [Error Responses](#error-responses)
8. [Integration Guide](#integration-guide)
9. [Best Practices](#best-practices)

---

## Overview

The Convergence Data Pipeline API provides a RESTful interface for:

- **Tenant Management** - Onboard organizations, manage API keys
- **Pipeline Execution** - Trigger and monitor data pipelines
- **Quota Management** - Track usage and enforce limits
- **Audit Logging** - Complete execution history and compliance

### Key Concepts

| Concept | Definition | Scope |
|---------|------------|-------|
| **tenant_id** | Organization identifier | Quotas/limits enforced at this level |
| **user_id** | Individual user UUID | Audit logging only (optional header) |
| **API Key** | Authentication token | Unique per tenant, SHA256 hashed |
| **Pipeline** | Data workflow | Defined by YAML configuration files |

### Service Endpoints

| Environment | URL |
|-------------|-----|
| **Production** | `https://convergence-api-prod-<hash>.run.app` |
| **Staging** | `https://convergence-api-staging-<hash>.run.app` |
| **Local** | `http://localhost:8000` |

---

## 🏗️ Core Architecture Philosophy

### ⚠️ CRITICAL: This is NOT a Real-Time API

**Convergence is a Pipeline-as-Code System** - ALL operations are scheduled jobs, NOT real-time requests.

### Pipeline Execution Model

**Scheduler-Driven Architecture**:
- **Primary Execution**: Cloud Scheduler checks `tenant_scheduled_pipeline_runs` table for due pipelines
- **Authentication**: Scheduler uses **Admin API Key** to trigger pipeline runs
- **Manual Triggers**: Tenants (users) can trigger pipelines manually via API by passing:
  - `X-API-Key` (tenant API key)
  - Pipeline configuration details
  - Execution parameters

**API Endpoint Usage**:
```
┌─────────────────────────────────────────────────────────┐
│ PRIMARY: Cloud Scheduler (Automated)                    │
│ → POST /api/v1/scheduler/trigger (Admin API Key)       │
│ → Checks tenant_scheduled_pipeline_runs for due runs   │
│ → Executes pipelines automatically                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECONDARY: Manual Triggers (Frontend/Users)             │
│ → POST /api/v1/pipelines/run/{pipeline_id}             │
│ → Uses Tenant API Key (X-API-Key)                      │
│ → Used for ad-hoc/manual pipeline execution            │
└─────────────────────────────────────────────────────────┘
```

**Everything is Pipeline-as-Code**:
- ALL operations are defined in `configs/` and `ps_templates/`
- Processors in `src/core/processors/` execute pipeline steps
- API endpoints trigger pipelines, NOT execute business logic directly

**Key API Patterns**:
1. **Admin Endpoints** (`/api/v1/admin/*`): System management, use Admin API Key
2. **Tenant Endpoints** (`/api/v1/tenants/*`): Tenant operations, use Tenant API Key
3. **Pipeline Endpoints** (`/api/v1/pipelines/*`): Pipeline triggers, use Tenant API Key
4. **Scheduler Endpoints** (`/api/v1/scheduler/*`): Automated execution, use Admin API Key

---

## Authentication

### Admin Authentication

Admin endpoints require the `X-Admin-Key` header for system-level operations.

```http
X-Admin-Key: admin_<secret_key>
```

**Used for:**
- System bootstrap
- Tenant creation
- API key generation/revocation
- System administration

### Tenant Authentication

Tenant endpoints require the `X-API-Key` header for tenant-specific operations.

```http
X-API-Key: sk_{tenant_id}_{random_chars}
X-User-ID: {user_uuid}  # Optional, for audit logging
```

**How it works:**
1. Client sends API key in `X-API-Key` header
2. Backend creates SHA256 hash
3. Query `tenants.tenant_api_keys` for matching hash
4. Verify `is_active = TRUE` and not expired
5. Return authenticated tenant context

**API Key Format:**
```
sk_{tenant_id}_{32_random_characters}
Example: sk_acmecorp_xY9kL2mP4qR8vTbN3wD7eF1gH6jK9mQ2
```

---

## Admin Endpoints

### 1. Bootstrap System

Initialize the central tenants dataset and management tables (one-time operation).

**POST** `/api/v1/admin/bootstrap`

**Headers:**
```http
X-Admin-Key: admin_...
Content-Type: application/json
```

**Request Body:**
```json
{
  "force_recreate_dataset": false,
  "force_recreate_tables": false
}
```

**Response (200 OK):**
```json
{
  "status": "SUCCESS",
  "dataset_created": true,
  "tables_created": 11,
  "tables": [
    "tenant_profiles",
    "tenant_api_keys",
    "tenant_subscriptions",
    "tenant_usage_quotas",
    "tenant_cloud_credentials",
    "tenant_pipeline_configs",
    "tenant_scheduled_pipeline_runs",
    "tenant_pipeline_execution_queue",
    "tenant_pipeline_runs",
    "tenant_step_logs",
    "tenant_dq_results"
  ],
  "message": "Bootstrap completed successfully"
}
```

---

### 2. Create Tenant

Create a new tenant profile.

**POST** `/api/v1/admin/tenants`

**Headers:**
```http
X-Admin-Key: admin_...
Content-Type: application/json
```

**Request Body:**
```json
{
  "tenant_id": "acmecorp",
  "description": "Acme Corporation"
}
```

**Response (200 OK):**
```json
{
  "tenant_id": "acmecorp",
  "description": "Acme Corporation",
  "is_active": true,
  "created_at": "2025-11-19T10:00:00Z",
  "message": "Tenant created successfully"
}
```

---

### 3. Generate API Key

Generate a new API key for a tenant.

**POST** `/api/v1/admin/api-keys`

**Headers:**
```http
X-Admin-Key: admin_...
Content-Type: application/json
```

**Request Body:**
```json
{
  "tenant_id": "acmecorp",
  "description": "Production API key",
  "expires_at": "2026-11-19T00:00:00Z"  // Optional
}
```

**Response (200 OK):**
```json
{
  "api_key": "sk_acmecorp_xY9kL2mP4qR8vTbN3wD7eF1gH6jK9mQ2",
  "tenant_api_key_hash": "8f3e2d1c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e",
  "tenant_api_key_id": "api_key_abc123def456",
  "tenant_id": "acmecorp",
  "description": "Production API key",
  "created_at": "2025-11-19T10:05:00Z",
  "expires_at": "2026-11-19T00:00:00Z"
}
```

**⚠️ IMPORTANT:** Save the `api_key` immediately - it's only shown once!

---

### 4. Get Tenant Details

Retrieve tenant information.

**GET** `/api/v1/admin/tenants/{tenant_id}`

**Headers:**
```http
X-Admin-Key: admin_...
```

**Response (200 OK):**
```json
{
  "tenant_id": "acmecorp",
  "description": "Acme Corporation",
  "is_active": true,
  "created_at": "2025-11-19T10:00:00Z",
  "datasets": ["acmecorp"],
  "api_keys": [
    {
      "tenant_api_key_id": "api_key_abc123",
      "description": "Production API key",
      "is_active": true,
      "created_at": "2025-11-19T10:05:00Z",
      "last_used_at": "2025-11-19T14:30:00Z"
    }
  ]
}
```

---

### 5. Revoke API Key

Revoke (deactivate) a tenant's API key.

**DELETE** `/api/v1/admin/api-keys/{api_key_hash}`

**Headers:**
```http
X-Admin-Key: admin_...
```

**Response (200 OK):**
```json
{
  "tenant_api_key_hash": "8f3e2d1c4b5a6f7e...",
  "tenant_id": "acmecorp",
  "is_active": false,
  "revoked_at": "2025-11-19T15:00:00Z",
  "message": "API key revoked successfully"
}
```

---

## Tenant Endpoints

### 6. Onboard Tenant (Self-Service)

**POST** `/api/v1/tenants/onboard`

Create a new tenant with datasets, tables, and API key (self-service flow).

**Request Body:**
```json
{
  "tenant_id": "acmecorp",
  "company_name": "Acme Corporation",
  "admin_email": "admin@acme.com",
  "subscription_plan": "PROFESSIONAL"
}
```

**Subscription Plans:**

| Plan | Daily Pipelines | Monthly Pipelines | Concurrent Runs |
|------|----------------|-------------------|-----------------|
| STARTER | 6 | 180 | 1 |
| PROFESSIONAL | 25 | 750 | 3 |
| SCALE | 100 | 3000 | 10 |

**Response (200 OK):**
```json
{
  "tenant_id": "acmecorp",
  "api_key": "sk_acmecorp_xY9kL2mP4qR8vTbN3wD7eF1g",
  "subscription_plan": "PROFESSIONAL",
  "dataset_created": true,
  "tables_created": ["tenant_comprehensive_view", "onboarding_validation_test"],
  "message": "Tenant Acme Corporation onboarded successfully"
}
```

---

### 7. Dry-Run Validation (Recommended Before Onboarding)

**POST** `/api/v1/tenants/dryrun`

Validate tenant configuration without creating resources.

**Request Body:**
```json
{
  "tenant_id": "acmecorp",
  "company_name": "Acme Corporation",
  "admin_email": "admin@acme.com",
  "subscription_plan": "PROFESSIONAL"
}
```

**Response (200 OK):**
```json
{
  "status": "SUCCESS",
  "ready_for_onboarding": true,
  "validation_summary": {
    "total_checks": 7,
    "passed": 7,
    "failed": 0
  },
  "validation_results": [
    {"check_name": "tenant_id_format", "status": "PASSED"},
    {"check_name": "tenant_id_uniqueness", "status": "PASSED"},
    {"check_name": "email_validation", "status": "PASSED"},
    {"check_name": "bigquery_connectivity", "status": "PASSED"}
  ],
  "message": "All validations passed. Safe to proceed."
}
```

---

## Pipeline Endpoints

### 8. Execute Pipeline

**POST** `/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{pipeline_id}`

Trigger a data pipeline for execution.

**Path Parameters:**
- `tenant_id` - Your tenant identifier
- `provider` - Cloud provider (`gcp`, `aws`, `azure`)
- `domain` - Domain category (`cost`, `security`, `compliance`)
- `pipeline_id` - Pipeline template name (`cost_billing`, `iam_audit`, etc.)

**Headers:**
```http
X-API-Key: sk_acmecorp_...
X-User-ID: user_789  # Optional
Content-Type: application/json
```

**Request Body:**
```json
{
  "date": "2025-11-19",
  "trigger_by": "john@acme.com",
  "parameters": {
    "custom_param": "value"
  }
}
```

**Response (200 OK):**
```json
{
  "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "pipeline_id": "acmecorp_gcp_cost_billing",
  "tenant_id": "acmecorp",
  "status": "PENDING",
  "message": "Pipeline triggered successfully (async mode)"
}
```

**Status Codes:**
- `200` - Pipeline triggered successfully
- `403` - Forbidden (tenant ID mismatch or inactive subscription)
- `404` - Pipeline template not found
- `429` - Quota exceeded or rate limit hit
- `500` - Internal server error

---

### 9. Get Pipeline Run Status

**GET** `/api/v1/pipelines/runs/{pipeline_logging_id}`

Get the status of a specific pipeline run.

**Headers:**
```http
X-API-Key: sk_acmecorp_...
```

**Response (200 OK):**
```json
{
  "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "pipeline_id": "acmecorp_gcp_cost_billing",
  "tenant_id": "acmecorp",
  "status": "COMPLETE",
  "trigger_type": "api",
  "trigger_by": "john@acme.com",
  "start_time": "2025-11-19T14:30:00Z",
  "end_time": "2025-11-19T14:32:15Z",
  "duration_ms": 135000,
  "steps_completed": 3,
  "steps_failed": 0
}
```

**Pipeline Status Values:**
- `PENDING` - Queued for execution
- `RUNNING` - Currently executing
- `COMPLETE` - Successfully completed
- `FAILED` - Execution failed
- `CANCELLED` - Manually cancelled

---

### 10. List Pipeline Runs

**GET** `/api/v1/pipelines/runs`

List recent pipeline runs for the authenticated tenant.

**Headers:**
```http
X-API-Key: sk_acmecorp_...
```

**Query Parameters:**
- `pipeline_id` (optional) - Filter by pipeline ID
- `status` (optional) - Filter by status (`PENDING`, `RUNNING`, `COMPLETE`, `FAILED`)
- `limit` (optional) - Max results (1-100, default: 20)
- `start_date` (optional) - Filter runs after this date (YYYY-MM-DD)
- `end_date` (optional) - Filter runs before this date (YYYY-MM-DD)

**Example:**
```http
GET /api/v1/pipelines/runs?status=COMPLETE&limit=10&start_date=2025-11-01
```

**Response (200 OK):**
```json
{
  "total": 45,
  "limit": 10,
  "offset": 0,
  "runs": [
    {
      "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "pipeline_id": "acmecorp_gcp_cost_billing",
      "tenant_id": "acmecorp",
      "status": "COMPLETE",
      "trigger_type": "api",
      "trigger_by": "john@acme.com",
      "start_time": "2025-11-19T14:30:00Z",
      "end_time": "2025-11-19T14:32:15Z",
      "duration_ms": 135000
    }
  ]
}
```

---

### 11. Health Check

**GET** `/health`

Basic health check endpoint (no authentication required).

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "convergence-data-pipeline",
  "version": "1.1.0",
  "environment": "production",
  "timestamp": "2025-11-19T15:00:00Z"
}
```

---

## Rate Limits & Quotas

### Rate Limits (Per-Tenant)

All endpoints are rate-limited to prevent abuse:

| Endpoint Type | Limit |
|--------------|-------|
| **General API** | 100 requests/minute |
| **Pipeline Execution** | 50 requests/minute |
| **Admin Endpoints** | 200 requests/minute |

**Rate Limit Headers:**
```http
X-RateLimit-Tenant-Limit: 100
X-RateLimit-Tenant-Remaining: 87
X-RateLimit-Tenant-Reset: 1700586000
```

### Quota Enforcement

Quotas are enforced at the **tenant level** based on subscription plan:

| Plan | Daily Pipelines | Monthly Pipelines | Concurrent Runs |
|------|----------------|-------------------|-----------------|
| STARTER | 6 | 180 | 1 |
| PROFESSIONAL | 25 | 750 | 3 |
| SCALE | 100 | 3000 | 10 |

**Quota Response (429):**
```json
{
  "error": "Quota exceeded",
  "message": "Daily pipeline quota exceeded. You have run 25 pipelines today (limit: 25)",
  "quota_type": "daily_pipelines",
  "current_usage": 25,
  "limit": 25,
  "reset_at": "2025-11-20T00:00:00Z"
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {
    "field": "specific_field",
    "issue": "What went wrong"
  },
  "request_id": "req_abc123def456"
}
```

### 400 Bad Request

Invalid request parameters or malformed JSON.

```json
{
  "error": "Validation error",
  "message": "Invalid tenant_id format",
  "details": {
    "field": "tenant_id",
    "issue": "Must match pattern ^[a-z0-9_]{3,50}$"
  }
}
```

### 401 Unauthorized

Missing or invalid API key.

```json
{
  "error": "Authentication failed",
  "message": "Invalid or missing API key"
}
```

### 403 Forbidden

Authenticated but not authorized for this resource.

```json
{
  "error": "Authorization failed",
  "message": "Tenant ID mismatch: authenticated as 'tenant_a' but requested resource for 'tenant_b'"
}
```

### 404 Not Found

Resource doesn't exist.

```json
{
  "error": "Not found",
  "message": "Pipeline template 'gcp/cost/invalid_pipeline' not found"
}
```

### 429 Too Many Requests

Rate limit or quota exceeded.

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please retry after 60 seconds",
  "retry_after": 60
}
```

### 500 Internal Server Error

Server-side error.

```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred",
  "request_id": "req_abc123def456"
}
```

---

## Integration Guide

### Step 1: Obtain API Credentials

1. **Admin creates tenant** via `/api/v1/admin/tenants`
2. **Generate API key** via `/api/v1/admin/api-keys`
3. **Save API key securely** (environment variables or secret manager)

### Step 2: Test Authentication

```bash
curl -X GET https://your-service-url.run.app/api/v1/pipelines/runs \
  -H "X-API-Key: sk_acmecorp_..."
```

### Step 3: Execute Your First Pipeline

```bash
curl -X POST https://your-service-url.run.app/api/v1/pipelines/run/acmecorp/gcp/cost/cost_billing \
  -H "X-API-Key: sk_acmecorp_..." \
  -H "X-User-ID: user_789" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-19"}'
```

### Step 4: Monitor Execution

```bash
# Get pipeline run status
curl -X GET https://your-service-url.run.app/api/v1/pipelines/runs/{pipeline_logging_id} \
  -H "X-API-Key: sk_acmecorp_..."

# List recent runs
curl -X GET https://your-service-url.run.app/api/v1/pipelines/runs?status=COMPLETE&limit=10 \
  -H "X-API-Key: sk_acmecorp_..."
```

---

## Best Practices

### Security

1. **Store API keys securely**
   - Use environment variables or secret managers (GCP Secret Manager, AWS Secrets Manager)
   - Never commit to version control
   - Rotate every 90 days

2. **Use separate keys per environment**
   - Development, staging, and production should have different API keys
   - Revoke compromised keys immediately

3. **Include user_id for audit trails**
   - Always pass `X-User-ID` header when triggering pipelines
   - Enables compliance reporting and forensics

### Performance

1. **Batch pipeline executions**
   - Group related pipelines together
   - Use scheduled execution for non-urgent pipelines

2. **Monitor quotas**
   - Check quota usage regularly
   - Upgrade plan before hitting limits

3. **Handle rate limits gracefully**
   - Implement exponential backoff
   - Respect `Retry-After` headers

### Error Handling

1. **Always check response status codes**
   - Handle 4xx and 5xx errors appropriately
   - Log errors with request_id for debugging

2. **Implement retries for transient errors**
   - Retry on 500, 503 errors
   - Don't retry on 400, 401, 403 errors

3. **Monitor pipeline execution status**
   - Poll pipeline status regularly
   - Set up alerts for failed pipelines

### Integration Checklist

- [ ] Obtain and securely store API key
- [ ] Test authentication with health endpoint
- [ ] Execute dry-run validation before onboarding
- [ ] Implement error handling and retries
- [ ] Set up monitoring and alerting
- [ ] Document API key rotation procedures
- [ ] Test quota limits in staging
- [ ] Implement audit logging with user_id

---

**Version**: 1.1.0 | **Last Updated**: 2025-11-19 | **Maintainer**: CloudAct Team
