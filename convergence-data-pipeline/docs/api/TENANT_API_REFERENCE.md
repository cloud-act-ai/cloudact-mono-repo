# Customer API Reference

Complete API documentation for customer management endpoints in the Convergence Data Pipeline platform.

## Base URL

```
Production: https://api.convergence-pipeline.com
Staging: https://staging-api.convergence-pipeline.com
Local: http://localhost:8080
```

## Authentication

All endpoints require authentication unless otherwise specified.

### API Key Authentication

**Header**: `X-API-Key`

```bash
curl -H "X-API-Key: your_api_key_here" \
  https://api.convergence-pipeline.com/api/v1/tenants
```

### Admin Token Authentication

**Header**: `Authorization: Bearer <admin_token>`

```bash
curl -H "Authorization: Bearer admin_token_here" \
  https://api.convergence-pipeline.com/api/v1/admin/tenants
```

---

## Customer Management APIs

### Create Customer (Onboard)

Create a new customer account with infrastructure provisioning.

**Endpoint**: `POST /api/v1/tenants/onboard`

**Authentication**: Admin token or public (for self-service signup)

**Request Body**:
```json
{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional",
  "force_recreate_dataset": false,
  "force_recreate_tables": false
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenant_id` | string | Yes | Unique tenant identifier (alphanumeric + underscore, 3-50 chars) |
| `company_name` | string | Yes | Company or organization name |
| `contact_email` | string | No | Primary contact email address |
| `subscription_plan` | string | No | Plan: "starter", "professional", "enterprise" (default: "starter") |
| `force_recreate_dataset` | boolean | No | Delete and recreate BigQuery dataset (DESTRUCTIVE, default: false) |
| `force_recreate_tables` | boolean | No | Delete and recreate metadata tables (DESTRUCTIVE, default: false) |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
  "dataset_created": true,
  "tables_created": [
    "x_meta_api_keys",
    "x_meta_cloud_credentials",
    "x_meta_pipeline_runs",
    "x_meta_step_logs",
    "x_meta_dq_results"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Customer acmeinc_23xv2 onboarded successfully. Save your API key - it will only be shown once!"
}
```

**Error Responses**:

```json
// 400 Bad Request - Invalid tenant_id format
{
  "detail": "tenant_id must be alphanumeric with underscores, 3-50 characters"
}

// 409 Conflict - Tenant already exists
{
  "detail": "Tenant acmeinc_23xv2 already exists. Use force_recreate_dataset=true to recreate."
}

// 500 Internal Server Error - Infrastructure creation failed
{
  "detail": "Failed to create tenant infrastructure: <error_message>"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acmeinc_23xv2",
    "company_name": "ACME Corporation",
    "contact_email": "admin@acmecorp.com",
    "subscription_plan": "professional"
  }'
```

---

### Get Customer Details

Retrieve customer information by customer ID or tenant ID.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}`

**Authentication**: Admin token or customer API key

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `tenant_id` | string | Customer UUID or tenant_id |

**Response**: `200 OK`
```json
{
  "tenant_id": "cust_abc123",
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional",
  "status": "active",
  "dataset_id": "acmeinc_23xv2",
  "created_at": "2025-11-17T10:00:00Z",
  "updated_at": "2025-11-17T10:00:00Z",
  "metadata": {
    "industry": "technology",
    "company_size": "50-200"
  }
}
```

**Error Responses**:

```json
// 404 Not Found
{
  "detail": "Customer not found"
}

// 403 Forbidden - API key doesn't belong to this customer
{
  "detail": "Access denied"
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/cust_abc123" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

---

### List Customers

List all tenants (admin only).

**Endpoint**: `GET /api/v1/admin/tenants`

**Authentication**: Admin token

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `page_size` | integer | 50 | Items per page (max: 100) |
| `status` | string | all | Filter by status: "active", "suspended", "cancelled", "all" |
| `subscription_plan` | string | all | Filter by plan: "starter", "professional", "enterprise", "all" |
| `search` | string | - | Search by company name or tenant_id |

**Response**: `200 OK`
```json
{
  "tenants": [
    {
      "tenant_id": "cust_abc123",
      "tenant_id": "acmeinc_23xv2",
      "company_name": "ACME Corporation",
      "subscription_plan": "professional",
      "status": "active",
      "created_at": "2025-11-17T10:00:00Z"
    },
    ...
  ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_items": 125,
    "total_pages": 3
  }
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/admin/tenants?status=active&page=1&page_size=50" \
  -H "Authorization: Bearer admin_token_here"
```

---

### Update Customer

Update customer information.

**Endpoint**: `PATCH /api/v1/tenants/{tenant_id}`

**Authentication**: Admin token

**Request Body**:
```json
{
  "company_name": "ACME Inc.",
  "contact_email": "newadmin@acmecorp.com",
  "metadata": {
    "industry": "fintech",
    "company_size": "200-500"
  }
}
```

**Response**: `200 OK`
```json
{
  "tenant_id": "cust_abc123",
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Inc.",
  "contact_email": "newadmin@acmecorp.com",
  "updated_at": "2025-11-17T11:00:00Z"
}
```

**Example**:
```bash
curl -X PATCH "http://localhost:8080/api/v1/tenants/cust_abc123" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{"company_name": "ACME Inc."}'
```

---

### Suspend Customer

Suspend a customer account (disables all pipelines).

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/suspend`

**Authentication**: Admin token

**Request Body**:
```json
{
  "reason": "payment_failed",
  "notify_customer": true,
  "suspension_note": "Subscription payment failed. Please update payment method."
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Suspension reason: "payment_failed", "terms_violation", "admin_request" |
| `notify_customer` | boolean | No | Send email notification to customer (default: true) |
| `suspension_note` | string | No | Internal note about suspension |

**Response**: `200 OK`
```json
{
  "tenant_id": "cust_abc123",
  "status": "suspended",
  "suspended_at": "2025-11-17T12:00:00Z",
  "suspension_reason": "payment_failed",
  "message": "Customer suspended successfully. Pipeline execution disabled."
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/cust_abc123/suspend" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "payment_failed",
    "notify_customer": true
  }'
```

---

### Activate Customer

Reactivate a suspended customer account.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/activate`

**Authentication**: Admin token

**Request Body**:
```json
{
  "notify_customer": true,
  "activation_note": "Payment received. Account reactivated."
}
```

**Response**: `200 OK`
```json
{
  "tenant_id": "cust_abc123",
  "status": "active",
  "activated_at": "2025-11-17T13:00:00Z",
  "message": "Customer activated successfully. Pipeline execution enabled."
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/cust_abc123/activate" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{"notify_customer": true}'
```

---

## Subscription Management APIs

### Get Subscription Details

Get current subscription information for a customer.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/subscription`

**Authentication**: Admin token or customer API key

**Response**: `200 OK`
```json
{
  "subscription_id": "sub_xyz789",
  "tenant_id": "cust_abc123",
  "plan_name": "professional",
  "monthly_pipeline_quota": 5000,
  "concurrent_pipeline_quota": 15,
  "storage_quota_gb": 500,
  "monthly_cost_usd": 499.00,
  "billing_cycle_start": "2025-11-01",
  "billing_cycle_end": "2025-11-30",
  "auto_renew": true,
  "stripe_subscription_id": "sub_stripe_abc123",
  "created_at": "2025-11-01T00:00:00Z"
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/cust_abc123/subscription" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

---

### Upgrade Subscription

Upgrade customer to a higher subscription plan.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/subscription/upgrade`

**Authentication**: Admin token

**Request Body**:
```json
{
  "new_plan": "enterprise",
  "effective_date": "2025-12-01",
  "prorate": true
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `new_plan` | string | Yes | New plan: "starter", "professional", "enterprise" |
| `effective_date` | date | No | When upgrade takes effect (default: immediate) |
| `prorate` | boolean | No | Prorate charges (default: true) |

**Response**: `200 OK`
```json
{
  "subscription_id": "sub_xyz789",
  "previous_plan": "professional",
  "new_plan": "enterprise",
  "effective_date": "2025-12-01",
  "prorated_charge": 250.00,
  "message": "Subscription upgraded successfully"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/cust_abc123/subscription/upgrade" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "new_plan": "enterprise",
    "effective_date": "2025-12-01"
  }'
```

---

### Cancel Subscription

Cancel customer subscription.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/subscription/cancel`

**Authentication**: Admin token

**Request Body**:
```json
{
  "cancel_at_period_end": true,
  "cancellation_reason": "switching_to_competitor",
  "feedback": "Found a better pricing model elsewhere"
}
```

**Response**: `200 OK`
```json
{
  "subscription_id": "sub_xyz789",
  "status": "cancelled",
  "cancelled_at": "2025-11-17T14:00:00Z",
  "billing_cycle_end": "2025-11-30",
  "message": "Subscription will be cancelled at end of billing period"
}
```

---

## Usage and Quota APIs

### Get Usage Statistics

Get current usage statistics for a customer.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/usage`

**Authentication**: Customer API key or admin token

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `month` | string | current | Month in YYYY-MM format (e.g., "2025-11") |

**Response**: `200 OK`
```json
{
  "tenant_id": "cust_abc123",
  "tenant_id": "acmeinc_23xv2",
  "usage_month": "2025-11",
  "pipelines_run_count": 450,
  "pipelines_running_count": 3,
  "storage_used_gb": 245.67,
  "compute_hours": 127.5,
  "api_requests_count": 1523,
  "last_pipeline_run_at": "2025-11-17T09:30:00Z",
  "quota_reset_at": "2025-12-01T00:00:00Z",
  "quotas": {
    "monthly_pipeline_quota": 5000,
    "concurrent_pipeline_quota": 15,
    "storage_quota_gb": 500
  },
  "usage_percentages": {
    "pipelines": 9.0,
    "concurrent": 20.0,
    "storage": 49.1
  }
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/cust_abc123/usage?month=2025-11" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

---

### Get Usage History

Get historical usage data for a customer.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/usage/history`

**Authentication**: Customer API key or admin token

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start_month` | string | 6 months ago | Start month (YYYY-MM) |
| `end_month` | string | current month | End month (YYYY-MM) |

**Response**: `200 OK`
```json
{
  "tenant_id": "cust_abc123",
  "history": [
    {
      "month": "2025-11",
      "pipelines_run": 450,
      "storage_used_gb": 245.67,
      "compute_hours": 127.5
    },
    {
      "month": "2025-10",
      "pipelines_run": 523,
      "storage_used_gb": 238.12,
      "compute_hours": 145.3
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/cust_abc123/usage/history?start_month=2025-06&end_month=2025-11" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

---

## API Key Management APIs

### Create API Key

Generate a new API key for a customer.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/api-keys`

**Authentication**: Admin token or customer API key (with admin scope)

**Request Body**:
```json
{
  "key_name": "Production Key",
  "scopes": ["pipelines:read", "pipelines:write", "usage:read"],
  "expires_in_days": 90
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key_name` | string | No | Human-readable name for the key |
| `scopes` | array | No | API scopes (default: all scopes) |
| `expires_in_days` | integer | No | Expiration in days (default: 90, null = never) |

**Available Scopes**:
- `pipelines:read` - View pipeline runs and logs
- `pipelines:write` - Execute pipelines
- `usage:read` - View usage statistics
- `credentials:read` - View cloud credentials
- `credentials:write` - Manage cloud credentials
- `admin:*` - Full admin access

**Response**: `200 OK`
```json
{
  "api_key_id": "key_xyz789",
  "api_key": "acmeinc_23xv2_api_NEW_KEY_HERE_xK9m",
  "key_name": "Production Key",
  "scopes": ["pipelines:read", "pipelines:write", "usage:read"],
  "expires_at": "2026-02-15T00:00:00Z",
  "created_at": "2025-11-17T10:00:00Z",
  "message": "API key created successfully. Save this key - it will only be shown once!"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/cust_abc123/api-keys" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "key_name": "Production Key",
    "scopes": ["pipelines:read", "pipelines:write"],
    "expires_in_days": 90
  }'
```

---

### List API Keys

List all API keys for a customer.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/api-keys`

**Authentication**: Admin token or customer API key

**Response**: `200 OK`
```json
{
  "api_keys": [
    {
      "api_key_id": "key_xyz789",
      "key_name": "Production Key",
      "scopes": ["pipelines:read", "pipelines:write"],
      "is_active": true,
      "expires_at": "2026-02-15T00:00:00Z",
      "last_used_at": "2025-11-17T09:30:00Z",
      "created_at": "2025-11-17T10:00:00Z"
    },
    {
      "api_key_id": "key_abc123",
      "key_name": "Development Key",
      "scopes": ["pipelines:read"],
      "is_active": false,
      "expires_at": null,
      "last_used_at": "2025-10-15T14:20:00Z",
      "created_at": "2025-10-01T10:00:00Z",
      "revoked_at": "2025-11-01T12:00:00Z"
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/cust_abc123/api-keys" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

---

### Revoke API Key

Revoke (disable) an API key.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/api-keys/{key_id}/revoke`

**Authentication**: Admin token or customer API key (with admin scope)

**Request Body**:
```json
{
  "revocation_reason": "Key compromised"
}
```

**Response**: `200 OK`
```json
{
  "api_key_id": "key_xyz789",
  "is_active": false,
  "revoked_at": "2025-11-17T15:00:00Z",
  "message": "API key revoked successfully"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/cust_abc123/api-keys/key_xyz789/revoke" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{"revocation_reason": "Key compromised"}'
```

---

## Cloud Credentials Management APIs

### Add Cloud Credentials

Add cloud provider credentials for a customer.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/credentials`

**Authentication**: Customer API key (with credentials:write scope)

**Request Body** (GCP Service Account):
```json
{
  "provider": "gcp",
  "credential_type": "service_account",
  "credential_name": "GCP Billing Export",
  "credentials": {
    "type": "service_account",
    "project_id": "customer-project-123",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----",
    "client_email": "service-account@customer-project.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  },
  "scopes": ["bigquery.readonly"]
}
```

**Request Body** (AWS Credentials):
```json
{
  "provider": "aws",
  "credential_type": "access_key",
  "credential_name": "AWS Cost Explorer",
  "credentials": {
    "aws_access_key_id": "AKIAIOSFODNN7EXAMPLE",
    "aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "region": "us-east-1"
  }
}
```

**Response**: `200 OK`
```json
{
  "credential_id": "cred_def456",
  "tenant_id": "cust_abc123",
  "provider": "gcp",
  "credential_name": "GCP Billing Export",
  "is_active": true,
  "last_validated_at": "2025-11-17T10:15:00Z",
  "created_at": "2025-11-17T10:15:00Z",
  "message": "Credentials added and validated successfully"
}
```

**Error Responses**:

```json
// 400 Bad Request - Invalid credentials
{
  "detail": "Credential validation failed: Invalid service account key"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/cust_abc123/credentials" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d @gcp_credentials.json
```

---

### List Credentials

List all cloud credentials for a customer.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/credentials`

**Authentication**: Customer API key (with credentials:read scope)

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | string | all | Filter by provider: "gcp", "aws", "azure", "all" |

**Response**: `200 OK`
```json
{
  "credentials": [
    {
      "credential_id": "cred_def456",
      "provider": "gcp",
      "credential_type": "service_account",
      "credential_name": "GCP Billing Export",
      "is_active": true,
      "last_validated_at": "2025-11-17T09:00:00Z",
      "created_at": "2025-11-01T10:00:00Z"
    },
    {
      "credential_id": "cred_ghi789",
      "provider": "aws",
      "credential_type": "access_key",
      "credential_name": "AWS Cost Explorer",
      "is_active": true,
      "last_validated_at": "2025-11-17T08:30:00Z",
      "created_at": "2025-11-05T14:00:00Z"
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/cust_abc123/credentials?provider=gcp" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

---

### Delete Credentials

Delete cloud provider credentials.

**Endpoint**: `DELETE /api/v1/tenants/{tenant_id}/credentials/{credential_id}`

**Authentication**: Customer API key (with credentials:write scope)

**Response**: `200 OK`
```json
{
  "credential_id": "cred_def456",
  "message": "Credentials deleted successfully"
}
```

**Example**:
```bash
curl -X DELETE "http://localhost:8080/api/v1/tenants/cust_abc123/credentials/cred_def456" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt"
```

---

## Team Management APIs

### Invite Team Member

Invite a user to join customer account.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/invitations`

**Authentication**: Customer API key (with admin scope)

**Request Body**:
```json
{
  "invited_email": "developer@acmecorp.com",
  "role": "developer",
  "expires_in_days": 7
}
```

**Roles**:
- `admin` - Full access, can manage users and billing
- `developer` - Can create/edit pipelines, view data
- `viewer` - Read-only access to dashboards

**Response**: `200 OK`
```json
{
  "invitation_id": "inv_jkl012",
  "invited_email": "developer@acmecorp.com",
  "role": "developer",
  "invitation_token": "inv_token_secure_random_string",
  "invitation_url": "https://app.convergence.com/accept-invite?token=inv_token_secure_random_string",
  "expires_at": "2025-11-24T10:00:00Z",
  "status": "pending"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/cust_abc123/invitations" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{
    "invited_email": "developer@acmecorp.com",
    "role": "developer"
  }'
```

---

### Accept Invitation

Accept a team invitation (public endpoint).

**Endpoint**: `POST /api/v1/invitations/{invitation_token}/accept`

**Authentication**: None (public)

**Request Body**:
```json
{
  "user_name": "John Doe",
  "password": "secure_password_here"
}
```

**Response**: `200 OK`
```json
{
  "invitation_id": "inv_jkl012",
  "tenant_id": "cust_abc123",
  "user_email": "developer@acmecorp.com",
  "role": "developer",
  "message": "Invitation accepted successfully. You can now log in."
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow this format:

```json
{
  "detail": "Error message describing what went wrong",
  "error_code": "QUOTA_EXCEEDED",
  "timestamp": "2025-11-17T10:00:00Z",
  "request_id": "req_abc123xyz"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Invalid request parameters |
| `401` | Unauthorized | Invalid or missing API key |
| `403` | Forbidden | Valid API key but insufficient permissions |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Resource already exists |
| `429` | Too Many Requests | Rate limit or quota exceeded |
| `500` | Internal Server Error | Server error (contact support) |
| `503` | Service Unavailable | Service temporarily unavailable |

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `INVALID_API_KEY` | 401 | API key is invalid or expired |
| `QUOTA_EXCEEDED` | 429 | Monthly pipeline quota exceeded |
| `CONCURRENT_LIMIT_REACHED` | 429 | Concurrent pipeline limit reached |
| `CUSTOMER_SUSPENDED` | 403 | Customer account is suspended |
| `INVALID_CREDENTIALS` | 400 | Cloud credentials validation failed |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource doesn't exist |
| `DUPLICATE_TENANT_ID` | 409 | Tenant ID already exists |

---

## Rate Limiting

All API endpoints are rate-limited to ensure fair usage.

**Rate Limits** (per API key):
- **Starter**: 100 requests/minute, 5,000 requests/hour
- **Professional**: 300 requests/minute, 20,000 requests/hour
- **Enterprise**: 1,000 requests/minute, 100,000 requests/hour

**Rate Limit Headers**:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1637154000
```

**Rate Limit Error**:
```json
{
  "detail": "Rate limit exceeded. Try again in 45 seconds.",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "retry_after_seconds": 45
}
```

---

## Pagination

List endpoints support pagination using `page` and `page_size` parameters.

**Request**:
```
GET /api/v1/admin/tenants?page=2&page_size=50
```

**Response**:
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "page_size": 50,
    "total_items": 125,
    "total_pages": 3,
    "has_next": true,
    "has_previous": true
  }
}
```

---

## Webhooks

Configure webhooks to receive real-time notifications.

**Available Events**:
- `customer.created`
- `customer.suspended`
- `subscription.upgraded`
- `quota.approaching_limit` (at 90%)
- `quota.exceeded`
- `pipeline.completed`
- `pipeline.failed`

**Webhook Payload**:
```json
{
  "event_id": "evt_abc123",
  "event_type": "quota.approaching_limit",
  "tenant_id": "cust_abc123",
  "tenant_id": "acmeinc_23xv2",
  "timestamp": "2025-11-17T10:00:00Z",
  "data": {
    "usage_percentage": 92.5,
    "pipelines_run": 4625,
    "monthly_quota": 5000
  }
}
```

---

## SDK Examples

### Python SDK

```python
from convergence_client import ConvergenceClient

# Initialize client
client = ConvergenceClient(
    api_key="acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
    base_url="https://api.convergence-pipeline.com"
)

# Get customer details
customer = client.tenants.get("cust_abc123")
print(f"Company: {customer.company_name}")

# Get usage statistics
usage = client.usage.get_current()
print(f"Pipelines run: {usage.pipelines_run_count}/{usage.quotas.monthly_pipeline_quota}")

# Run a pipeline
pipeline_run = client.pipelines.run(
    provider="gcp",
    domain="cost",
    template="bill-export",
    parameters={"date": "2025-11-17"}
)
print(f"Pipeline ID: {pipeline_run.pipeline_logging_id}")
```

### JavaScript SDK

```javascript
const ConvergenceClient = require('@convergence/sdk');

// Initialize client
const client = new ConvergenceClient({
  apiKey: 'acmeinc_23xv2_api_xK9mPqWz7LnR4vYt',
  baseUrl: 'https://api.convergence-pipeline.com'
});

// Get customer details
const customer = await client.tenants.get('cust_abc123');
console.log(`Company: ${customer.companyName}`);

// Get usage statistics
const usage = await client.usage.getCurrent();
console.log(`Pipelines: ${usage.pipelinesRunCount}/${usage.quotas.monthlyPipelineQuota}`);

// Run a pipeline
const pipelineRun = await client.pipelines.run({
  provider: 'gcp',
  domain: 'cost',
  template: 'bill-export',
  parameters: { date: '2025-11-17' }
});
console.log(`Pipeline ID: ${pipelineRun.pipelineLoggingId}`);
```

---

## Related Documentation

- [Customer Management Architecture](../architecture/TENANT_MANAGEMENT.md)
- [Migration Guide](../guides/MIGRATION_GUIDE.md)
- [Onboarding Guide](../guides/ONBOARDING.md)
- [Encryption Guide](../security/ENCRYPTION.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-11-17
**API Version**: v1
