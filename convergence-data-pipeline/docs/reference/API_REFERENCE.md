# API Reference

Complete API documentation for the Convergence Data Pipeline Service with multi-user tenant architecture.

## Base URLs

### Staging Environment
```
https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app
```

### Production Environment
```
https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app
```

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication](#authentication)
3. [Health Check](#health-check)
4. [Tenant Onboarding](#tenant-onboarding)
5. [User Management](#user-management)
6. [Pipeline Execution](#pipeline-execution)
7. [Metadata Management](#metadata-management)
8. [Error Responses](#error-responses)

---

## Architecture Overview

### Tenant vs User Model

The platform implements a multi-user tenant architecture:

```
Tenant (Organization)
├─ tenant_id: "acme_corp"
├─ stripe_tenant_id: "cus_stripe123"
├─ API Keys (tenant-level authentication)
├─ Subscriptions (tenant-level billing)
├─ Usage Quotas (tenant-level limits)
└─ Users (Team Members)
   ├─ user_id: "alice_uuid" (Owner)
   ├─ user_id: "bob_uuid" (Admin)
   └─ user_id: "charlie_uuid" (Member)
```

**Key Concepts:**
- **tenant_id**: Organization identifier (one per company)
- **user_id**: Individual user identifier (multiple users per tenant)
- **Relationship**: One tenant has many users
- **Sign-up**: Creates user_id
- **Onboarding**: Generates tenant_id for organization
- **Billing**: Uses tenant_id (via stripe_tenant_id)
- **API Requests**: Require both X-API-Key (tenant) + X-User-ID (user) headers
- **Logging**: Tracks both tenant_id and user_id for all operations

---

## Authentication

All protected endpoints require two-layer authentication:

### Layer 1: Tenant Authentication (X-API-Key)

Identifies the organization accessing the API.

**Header**: `X-API-Key`

```bash
curl -H "X-API-Key: tenant_api_key_here" \
  https://api.convergence-pipeline.com/api/v1/tenants
```

### Layer 2: User Authentication (X-User-ID)

Identifies the individual user within the tenant.

**Header**: `X-User-ID`

```bash
curl -H "X-API-Key: tenant_api_key_here" \
     -H "X-User-ID: user_uuid_here" \
  https://api.convergence-pipeline.com/api/v1/pipelines
```

### Complete Example

```bash
curl -X POST https://api.convergence-pipeline.com/api/v1/pipelines/execute \
  -H "X-API-Key: acme_corp_api_abc123xyz" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_id": "acme_corp-data-sync",
    "trigger_by": "api_user"
  }'
```

### Authentication Flow

1. Client sends request with **X-API-Key** (tenant) + **X-User-ID** (user)
2. Server validates X-API-Key exists and is active
3. Server extracts tenant_id from API key
4. Server validates X-User-ID belongs to that tenant
5. Server logs operation with both tenant_id and user_id
6. Request proceeds if all checks pass

---

## Health Check

### GET /health

Check the health status of the service.

#### Request
```bash
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/health
```

#### Response
```json
{
  "status": "healthy",
  "timestamp": "2025-11-16T05:00:00Z",
  "version": "1.0.0"
}
```

#### Status Codes
- `200 OK`: Service is healthy

---

## Tenant Onboarding

### POST /api/v1/tenants/onboard

Onboard a new tenant (organization) to the platform. Creates a dedicated BigQuery dataset and metadata tables. This is the first step when a new organization signs up.

#### Request Body
```json
{
  "tenant_id": "string",
  "company_name": "string",
  "subscription_tier": "FREE" | "BASIC" | "PROFESSIONAL" | "ENTERPRISE"
}
```

#### Field Validations
- `tenant_id`:
  - Required
  - Must be alphanumeric with underscores
  - Length: 3-50 characters
  - Pattern: `^[a-z0-9_]+$`

- `company_name`:
  - Required
  - Min length: 2 characters
  - Max length: 100 characters

- `subscription_tier`:
  - Required
  - One of: `FREE`, `BASIC`, `PROFESSIONAL`, `ENTERPRISE`

#### Example Request
```bash
curl -X POST \
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp_001",
    "company_name": "Acme Corporation",
    "subscription_tier": "PROFESSIONAL"
  }'
```

#### Success Response (200 OK)
```json
{
  "tenant_id": "acme_corp_001",
  "api_key": "acme_corp_001_api_abc123xyz",
  "stripe_tenant_id": "cus_stripe123",
  "dataset_created": true,
  "tables_created": [
    "tenants",
    "users",
    "api_keys",
    "cloud_credentials",
    "pipeline_runs",
    "step_logs",
    "dq_results"
  ],
  "message": "Tenant acme_corp_001 onboarded successfully. API key generated."
}
```

#### What Gets Created

1. **BigQuery Dataset**: `tenant_{tenant_id}`
   - Location: US
   - Labels: `tenant_id`, `environment`

2. **Metadata Tables** (7 tables):
   - `tenants`: Tenant configuration and quotas
   - `users`: User accounts within the tenant
   - `api_keys`: Tenant API keys and cloud provider credentials
   - `cloud_credentials`: Cloud provider service account credentials
   - `pipeline_runs`: Tracks all pipeline execution runs
   - `step_logs`: Detailed logs for each pipeline step
   - `dq_results`: Data quality check results

3. **API Key**: Auto-generated with format `{tenant_id}_api_{random}`

4. **Stripe Integration**: Creates customer record with `stripe_tenant_id`

#### Error Responses

**400 Bad Request** - Invalid tenant_id format
```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "tenant_id"],
      "msg": "Value error, tenant_id must be alphanumeric with underscores, 3-50 characters",
      "input": "invalid-tenant!"
    }
  ]
}
```

**409 Conflict** - Tenant already exists
```json
{
  "detail": "Tenant acme_corp_001 already exists"
}
```

**500 Internal Server Error** - Database or infrastructure error
```json
{
  "detail": "Failed to create tenant infrastructure: {error_message}"
}
```

---

## User Management

### POST /api/v1/tenants/{tenant_id}/users

Create a new user account within a tenant.

#### Headers
```
X-API-Key: string (required)
X-User-ID: string (required - admin user)
```

#### Request Body
```json
{
  "email": "alice@acme.com",
  "name": "Alice Smith",
  "role": "ADMIN" | "MEMBER" | "VIEWER"
}
```

#### Example Request
```bash
curl -X POST \
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/tenants/acme_corp_001/users \
  -H "X-API-Key: acme_corp_001_api_abc123xyz" \
  -H "X-User-ID: owner_uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@acme.com",
    "name": "Alice Smith",
    "role": "ADMIN"
  }'
```

#### Success Response (200 OK)
```json
{
  "user_id": "alice_uuid_123",
  "tenant_id": "acme_corp_001",
  "email": "alice@acme.com",
  "name": "Alice Smith",
  "role": "ADMIN",
  "created_at": "2025-11-16T05:00:00Z",
  "message": "User created successfully"
}
```

### GET /api/v1/tenants/{tenant_id}/users

List all users for a tenant.

#### Headers
```
X-API-Key: string (required)
X-User-ID: string (required)
```

#### Example Request
```bash
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/tenants/acme_corp_001/users \
  -H "X-API-Key: acme_corp_001_api_abc123xyz" \
  -H "X-User-ID: owner_uuid"
```

#### Success Response (200 OK)
```json
{
  "tenant_id": "acme_corp_001",
  "users": [
    {
      "user_id": "alice_uuid_123",
      "email": "alice@acme.com",
      "name": "Alice Smith",
      "role": "ADMIN",
      "created_at": "2025-11-16T05:00:00Z",
      "last_login_at": "2025-11-16T08:30:00Z"
    },
    {
      "user_id": "bob_uuid_456",
      "email": "bob@acme.com",
      "name": "Bob Johnson",
      "role": "MEMBER",
      "created_at": "2025-11-15T10:00:00Z",
      "last_login_at": "2025-11-16T07:15:00Z"
    }
  ]
}
```

---

## Pipeline Execution

### POST /api/v1/pipelines/execute

Execute a data pipeline for a specific tenant. Requires both tenant and user authentication.

#### Headers
```
X-API-Key: string (required - tenant authentication)
X-User-ID: string (required - user authentication)
Content-Type: application/json
```

#### Request Body
```json
{
  "pipeline_id": "string",
  "trigger_by": "api_user",
  "config_override": {
    "key": "value"
  }
}
```

#### Example Request
```bash
curl -X POST \
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/pipelines/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: acme_corp_001_api_abc123xyz" \
  -H "X-User-ID: alice_uuid_123" \
  -d '{
    "pipeline_id": "acme_corp_001-customer-data-sync",
    "trigger_by": "api_user",
    "config_override": {
      "batch_size": 1000
    }
  }'
```

#### Success Response (200 OK)
```json
{
  "run_id": "run_20251116_050000_abc123",
  "pipeline_id": "acme_corp_001-customer-data-sync",
  "tenant_id": "acme_corp_001",
  "user_id": "alice_uuid_123",
  "status": "RUNNING",
  "started_at": "2025-11-16T05:00:00Z",
  "message": "Pipeline execution started successfully"
}
```

#### What Gets Logged

Every pipeline execution logs:
- **tenant_id**: Organization that owns the pipeline
- **user_id**: Individual who triggered the execution
- **trigger_by**: How it was triggered (api_user, scheduler, webhook)
- **timestamp**: When the pipeline started
- **parameters**: Runtime configuration used

#### Error Responses

**401 Unauthorized** - Invalid or missing API key
```json
{
  "detail": "Invalid API key"
}
```

**403 Forbidden** - Missing user_id header
```json
{
  "detail": "Missing X-User-ID header"
}
```

**403 Forbidden** - User does not belong to tenant
```json
{
  "detail": "User alice_uuid_123 does not belong to tenant acme_corp_001"
}
```

**404 Not Found** - Pipeline not found
```json
{
  "detail": "Pipeline 'acme_corp_001-customer-data-sync' not found"
}
```

---

## Metadata Management

### GET /api/v1/metadata/{tenant_id}/pipelines

List all pipelines for a tenant with user context.

#### Parameters
- `tenant_id` (path): The tenant identifier

#### Headers
```
X-API-Key: string (required)
X-User-ID: string (required)
```

#### Example Request
```bash
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/metadata/acme_corp_001/pipelines \
  -H "X-API-Key: acme_corp_001_api_abc123xyz" \
  -H "X-User-ID: alice_uuid_123"
```

#### Success Response (200 OK)
```json
{
  "tenant_id": "acme_corp_001",
  "pipelines": [
    {
      "pipeline_id": "acme_corp_001-customer-data-sync",
      "name": "Customer Data Sync",
      "description": "Sync customer data from source systems",
      "status": "ACTIVE",
      "created_at": "2025-11-15T10:00:00Z",
      "created_by_user_id": "alice_uuid_123",
      "last_run": "2025-11-16T04:30:00Z",
      "last_run_by_user_id": "bob_uuid_456"
    }
  ]
}
```

### GET /api/v1/metadata/{tenant_id}/runs

List pipeline runs for a tenant with user attribution.

#### Headers
```
X-API-Key: string (required)
X-User-ID: string (required)
```

#### Query Parameters
- `limit`: Number of runs to return (default: 50, max: 500)
- `user_id`: Filter by specific user (optional)
- `pipeline_id`: Filter by pipeline (optional)

#### Example Request
```bash
curl "https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/metadata/acme_corp_001/runs?limit=10&user_id=alice_uuid_123" \
  -H "X-API-Key: acme_corp_001_api_abc123xyz" \
  -H "X-User-ID: alice_uuid_123"
```

#### Success Response (200 OK)
```json
{
  "tenant_id": "acme_corp_001",
  "runs": [
    {
      "run_id": "run_20251116_050000_abc123",
      "pipeline_id": "acme_corp_001-customer-data-sync",
      "user_id": "alice_uuid_123",
      "user_name": "Alice Smith",
      "status": "COMPLETED",
      "trigger_by": "api_user",
      "started_at": "2025-11-16T05:00:00Z",
      "completed_at": "2025-11-16T05:05:30Z",
      "duration_ms": 330000
    }
  ]
}
```

---

## Error Responses

All API endpoints follow standard HTTP status codes and return errors in a consistent format.

### Error Response Format
```json
{
  "detail": "string"
}
```

### Validation Error Format
```json
{
  "detail": [
    {
      "type": "string",
      "loc": ["string"],
      "msg": "string",
      "input": "any"
    }
  ]
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid API key |
| 403 | Forbidden - Missing user_id or insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation error |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Rate Limiting

Rate limits are enforced at the tenant level.

**Current Limits:**
- **FREE**: 100 requests/hour, 10 pipeline executions/day
- **BASIC**: 500 requests/hour, 50 pipeline executions/day
- **PROFESSIONAL**: 2000 requests/hour, 200 pipeline executions/day
- **ENTERPRISE**: Unlimited (with fair use policy)

**Rate Limit Headers:**
```
X-RateLimit-Limit: 2000
X-RateLimit-Remaining: 1847
X-RateLimit-Reset: 1700000000
```

**Rate Limit Error (HTTP 429)**:
```json
{
  "detail": "Rate limit exceeded for tenant acme_corp_001. Try again in 45 seconds.",
  "tenant_id": "acme_corp_001",
  "retry_after_seconds": 45
}
```

---

## Testing Endpoints

### Staging Environment Testing
```bash
# Health check
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/health

# Onboard test tenant
curl -X POST \
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test_staging_001",
    "company_name": "Test Company Staging",
    "subscription_tier": "FREE"
  }'

# Create test user
curl -X POST \
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/tenants/test_staging_001/users \
  -H "X-API-Key: test_staging_001_api_abc123" \
  -H "X-User-ID: admin_user_uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "role": "ADMIN"
  }'

# Execute pipeline with user context
curl -X POST \
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/pipelines/execute \
  -H "X-API-Key: test_staging_001_api_abc123" \
  -H "X-User-ID: test_user_uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_id": "test_staging_001-dryrun",
    "trigger_by": "api_user"
  }'
```

---

## Conventions and Standards

### Tenant ID Naming
- Use lowercase letters, numbers, and underscores only
- Start with a letter or number
- Format: `{company}_{environment}_{id}` (recommended)
- Examples: `acme_prod_001`, `test_stage_123`

### User ID Format
- UUID v4 format
- Generated automatically on user creation
- Example: `550e8400-e29b-41d4-a716-446655440000`

### API Key Format
- Auto-generated: `{tenant_id}_api_{random_string}`
- Length: Variable (20-40 characters)
- Characters: Alphanumeric
- Example: `acme_corp_api_abc123xyz`

### Pipeline ID Format
- Format: `{tenant_id}-{pipeline_name}`
- Examples: `acme_corp_001-customer-sync`, `acme_corp_001-dryrun`

### Date/Time Format
- ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`
- Timezone: UTC
- Example: `2025-11-16T05:00:00Z`

---

## Support

For API support and questions:
- Create an issue in the GitHub repository
- Contact: support@example.com
- Documentation: https://docs.example.com

---

**Version**: 2.0.0
**Last Updated**: 2025-11-17
**Breaking Changes**: Added required X-User-ID header for all authenticated endpoints
