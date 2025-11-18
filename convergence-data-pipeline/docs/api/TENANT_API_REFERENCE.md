# Tenant API Reference

Complete API documentation for tenant management endpoints in the Convergence Data Pipeline platform with multi-user tenant architecture.

## Base URL

```
Production: https://api.convergence-pipeline.com
Staging: https://staging-api.convergence-pipeline.com
Local: http://localhost:8080
```

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication](#authentication)
3. [Tenant Management APIs](#tenant-management-apis)
4. [User Management APIs](#user-management-apis)
5. [Subscription Management APIs](#subscription-management-apis)
6. [Usage and Quota APIs](#usage-and-quota-apis)
7. [API Key Management APIs](#api-key-management-apis)
8. [Cloud Credentials Management APIs](#cloud-credentials-management-apis)
9. [Team Management APIs](#team-management-apis)
10. [Error Handling](#error-handling)
11. [Rate Limiting](#rate-limiting)
12. [Webhooks](#webhooks)

---

## Architecture Overview

### Tenant vs User Model

The platform implements a multi-user tenant architecture where organizations (tenants) can have multiple team members (users):

```
Tenant (Organization)
├─ tenant_id: "acme_corp"
├─ stripe_tenant_id: "cus_stripe123" (Stripe customer ID for billing)
├─ API Keys (tenant-level authentication)
├─ Subscriptions (tenant-level billing via Stripe)
├─ Usage Quotas (tenant-level limits)
└─ Users (Team Members)
   ├─ user_id: "alice_uuid" (Owner)
   ├─ user_id: "bob_uuid" (Admin)
   └─ user_id: "charlie_uuid" (Member)
```

**Key Concepts:**
- **tenant_id**: Organization identifier (one per company)
- **user_id**: Individual user identifier (many per tenant)
- **Sign-up**: Creates user_id for individual
- **Onboarding**: Creates tenant_id for organization
- **Billing**: Tenant-level via stripe_tenant_id (not per user)
- **API Requests**: Require X-API-Key (tenant) + X-User-ID (user)
- **Logging**: Tracks both tenant_id AND user_id for audit trails

---

## Authentication

All endpoints require authentication unless otherwise specified.

### Two-Layer Authentication

Every protected API call requires **both headers**:

```bash
curl -X POST https://api.convergence-pipeline.com/api/v1/endpoint \
  -H "X-API-Key: tenant_api_key_here" \
  -H "X-User-ID: user_uuid_here" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

### Layer 1: Tenant Authentication (X-API-Key)

Identifies the organization accessing the API.

**Header**: `X-API-Key`

```bash
curl -H "X-API-Key: acme_corp_api_abc123xyz" \
  https://api.convergence-pipeline.com/api/v1/tenants
```

### Layer 2: User Authentication (X-User-ID)

Identifies the individual user performing the action.

**Header**: `X-User-ID`

```bash
curl -H "X-API-Key: tenant_api_key_here" \
     -H "X-User-ID: alice_uuid_123" \
  https://api.convergence-pipeline.com/api/v1/pipelines
```

### Admin Token Authentication (Admin Endpoints Only)

**Header**: `Authorization: Bearer <admin_token>`

```bash
curl -H "Authorization: Bearer admin_token_here" \
  https://api.convergence-pipeline.com/api/v1/admin/tenants
```

### Authentication Flow

1. Client sends request with **X-API-Key** (tenant) + **X-User-ID** (user)
2. Server validates X-API-Key exists and is active
3. Server extracts tenant_id from API key
4. Server validates X-User-ID belongs to that tenant
5. Server logs operation with both tenant_id and user_id
6. Request proceeds if all checks pass

---

## Tenant Management APIs

### Create Tenant (Onboard)

Create a new tenant account with infrastructure provisioning. This is the first step after a user signs up and completes organization setup.

**Endpoint**: `POST /api/v1/tenants/onboard`

**Authentication**: Admin token or public (for self-service signup)

**Request Body**:
```json
{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional",
  "created_by_user_id": "alice_uuid_123",
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
| `created_by_user_id` | string | Yes | User ID of the user creating the tenant (becomes owner) |
| `force_recreate_dataset` | boolean | No | Delete and recreate BigQuery dataset (DESTRUCTIVE, default: false) |
| `force_recreate_tables` | boolean | No | Delete and recreate metadata tables (DESTRUCTIVE, default: false) |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "api_key": "acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
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
  "dryrun_status": "SUCCESS",
  "message": "Tenant acmeinc_23xv2 onboarded successfully. Save your API key - it will only be shown once!"
}
```

**Error Responses**:

```json
// 400 Bad Request - Invalid tenant_id format
{
  "detail": "tenant_id must be alphanumeric with underscores, 3-50 characters"
}

// 400 Bad Request - Missing user_id
{
  "detail": "created_by_user_id is required"
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
    "subscription_plan": "professional",
    "created_by_user_id": "alice_uuid_123"
  }'
```

---

### Get Tenant Details

Retrieve tenant information by tenant ID.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}`

**Authentication**: API key (X-API-Key + X-User-ID) or admin token

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `tenant_id` | string | Tenant identifier |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Corporation",
  "contact_email": "admin@acmecorp.com",
  "subscription_plan": "professional",
  "status": "active",
  "dataset_id": "acmeinc_23xv2",
  "stripe_tenant_id": "cus_stripe123",
  "created_at": "2025-11-17T10:00:00Z",
  "created_by_user_id": "alice_uuid_123",
  "updated_at": "2025-11-17T10:00:00Z",
  "metadata": {
    "industry": "technology",
    "company_size": "50-200"
  },
  "user_count": 5,
  "active_user_count": 4
}
```

**Error Responses**:

```json
// 404 Not Found
{
  "detail": "Tenant not found"
}

// 401 Unauthorized - Missing X-User-ID
{
  "detail": "X-User-ID header is required"
}

// 403 Forbidden - API key doesn't belong to this tenant
{
  "detail": "Access denied"
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

### List Tenants

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
      "tenant_id": "acmeinc_23xv2",
      "company_name": "ACME Corporation",
      "subscription_plan": "professional",
      "status": "active",
      "stripe_tenant_id": "cus_stripe123",
      "user_count": 5,
      "created_at": "2025-11-17T10:00:00Z",
      "created_by_user_id": "alice_uuid_123"
    }
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

### Update Tenant

Update tenant information.

**Endpoint**: `PATCH /api/v1/tenants/{tenant_id}`

**Authentication**: Admin token or API key with admin scope

**Request Body**:
```json
{
  "company_name": "ACME Inc.",
  "contact_email": "newadmin@acmecorp.com",
  "updated_by_user_id": "alice_uuid_123",
  "metadata": {
    "industry": "fintech",
    "company_size": "200-500"
  }
}
```

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "company_name": "ACME Inc.",
  "contact_email": "newadmin@acmecorp.com",
  "updated_at": "2025-11-17T11:00:00Z",
  "updated_by_user_id": "alice_uuid_123"
}
```

**Example**:
```bash
curl -X PATCH "http://localhost:8080/api/v1/tenants/acmeinc_23xv2" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "ACME Inc.",
    "updated_by_user_id": "alice_uuid_123"
  }'
```

---

### Suspend Tenant

Suspend a tenant account (disables all pipelines and user access).

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/suspend`

**Authentication**: Admin token

**Request Body**:
```json
{
  "reason": "payment_failed",
  "suspended_by_user_id": "admin_uuid_456",
  "notify_tenant": true,
  "suspension_note": "Subscription payment failed. Please update payment method."
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Suspension reason: "payment_failed", "terms_violation", "admin_request" |
| `suspended_by_user_id` | string | Yes | User ID of admin suspending the tenant |
| `notify_tenant` | boolean | No | Send email notification to tenant (default: true) |
| `suspension_note` | string | No | Internal note about suspension |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "status": "suspended",
  "suspended_at": "2025-11-17T12:00:00Z",
  "suspended_by_user_id": "admin_uuid_456",
  "suspension_reason": "payment_failed",
  "message": "Tenant suspended successfully. Pipeline execution and user access disabled."
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/suspend" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "payment_failed",
    "suspended_by_user_id": "admin_uuid_456",
    "notify_tenant": true
  }'
```

---

### Activate Tenant

Reactivate a suspended tenant account.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/activate`

**Authentication**: Admin token

**Request Body**:
```json
{
  "activated_by_user_id": "admin_uuid_456",
  "notify_tenant": true,
  "activation_note": "Payment received. Account reactivated."
}
```

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "status": "active",
  "activated_at": "2025-11-17T13:00:00Z",
  "activated_by_user_id": "admin_uuid_456",
  "message": "Tenant activated successfully. Pipeline execution and user access enabled."
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/activate" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "activated_by_user_id": "admin_uuid_456",
    "notify_tenant": true
  }'
```

---

## User Management APIs

### Create User

Create a new user within a tenant.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/users`

**Authentication**: API key with admin scope + X-User-ID

**Request Body**:
```json
{
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "created_by_user_id": "alice_uuid_123"
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User's email address (unique per tenant) |
| `name` | string | Yes | User's full name |
| `role` | string | Yes | User role: "OWNER", "ADMIN", "MEMBER", "VIEWER" |
| `created_by_user_id` | string | Yes | User ID of the user creating this user |

**Response**: `201 Created`
```json
{
  "user_id": "bob_uuid_456",
  "tenant_id": "acmeinc_23xv2",
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "is_active": true,
  "created_at": "2025-11-17T10:30:00Z",
  "created_by_user_id": "alice_uuid_123",
  "message": "User created successfully"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/users" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@acmecorp.com",
    "name": "Bob Smith",
    "role": "ADMIN",
    "created_by_user_id": "alice_uuid_123"
  }'
```

---

### List Users

List all users within a tenant.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/users`

**Authentication**: API key + X-User-ID

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `role` | string | all | Filter by role: "OWNER", "ADMIN", "MEMBER", "VIEWER", "all" |
| `status` | string | all | Filter by status: "active", "inactive", "all" |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "users": [
    {
      "user_id": "alice_uuid_123",
      "email": "alice@acmecorp.com",
      "name": "Alice Johnson",
      "role": "OWNER",
      "is_active": true,
      "last_login_at": "2025-11-17T09:00:00Z",
      "created_at": "2025-11-17T10:00:00Z"
    },
    {
      "user_id": "bob_uuid_456",
      "email": "bob@acmecorp.com",
      "name": "Bob Smith",
      "role": "ADMIN",
      "is_active": true,
      "last_login_at": "2025-11-17T08:30:00Z",
      "created_at": "2025-11-17T10:30:00Z"
    }
  ],
  "total_count": 5,
  "active_count": 4
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/users?role=all&status=active" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

### Get User Details

Get details for a specific user.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/users/{user_id}`

**Authentication**: API key + X-User-ID

**Response**: `200 OK`
```json
{
  "user_id": "bob_uuid_456",
  "tenant_id": "acmeinc_23xv2",
  "email": "bob@acmecorp.com",
  "name": "Bob Smith",
  "role": "ADMIN",
  "is_active": true,
  "last_login_at": "2025-11-17T08:30:00Z",
  "created_at": "2025-11-17T10:30:00Z",
  "created_by_user_id": "alice_uuid_123",
  "pipelines_run_count": 23,
  "last_pipeline_run_at": "2025-11-17T08:00:00Z"
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/users/bob_uuid_456" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

### Update User

Update user information or role.

**Endpoint**: `PATCH /api/v1/tenants/{tenant_id}/users/{user_id}`

**Authentication**: API key with admin scope + X-User-ID

**Request Body**:
```json
{
  "name": "Robert Smith",
  "role": "MEMBER",
  "updated_by_user_id": "alice_uuid_123"
}
```

**Response**: `200 OK`
```json
{
  "user_id": "bob_uuid_456",
  "tenant_id": "acmeinc_23xv2",
  "name": "Robert Smith",
  "role": "MEMBER",
  "updated_at": "2025-11-17T11:00:00Z",
  "updated_by_user_id": "alice_uuid_123"
}
```

**Example**:
```bash
curl -X PATCH "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/users/bob_uuid_456" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "MEMBER",
    "updated_by_user_id": "alice_uuid_123"
  }'
```

---

### Deactivate User

Deactivate a user (does not delete, preserves audit trail).

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/users/{user_id}/deactivate`

**Authentication**: API key with admin scope + X-User-ID

**Request Body**:
```json
{
  "deactivated_by_user_id": "alice_uuid_123",
  "reason": "User left company"
}
```

**Response**: `200 OK`
```json
{
  "user_id": "bob_uuid_456",
  "tenant_id": "acmeinc_23xv2",
  "is_active": false,
  "deactivated_at": "2025-11-17T12:00:00Z",
  "deactivated_by_user_id": "alice_uuid_123",
  "message": "User deactivated successfully"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/users/bob_uuid_456/deactivate" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "deactivated_by_user_id": "alice_uuid_123",
    "reason": "User left company"
  }'
```

---

## Subscription Management APIs

### Get Subscription Details

Get current subscription information for a tenant.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/subscription`

**Authentication**: API key + X-User-ID or admin token

**Response**: `200 OK`
```json
{
  "subscription_id": "sub_xyz789",
  "tenant_id": "acmeinc_23xv2",
  "stripe_tenant_id": "cus_stripe123",
  "stripe_subscription_id": "sub_stripe_abc123",
  "plan_name": "professional",
  "monthly_pipeline_quota": 5000,
  "concurrent_pipeline_quota": 15,
  "storage_quota_gb": 500,
  "monthly_cost_usd": 499.00,
  "billing_cycle_start": "2025-11-01",
  "billing_cycle_end": "2025-11-30",
  "auto_renew": true,
  "created_at": "2025-11-01T00:00:00Z"
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/subscription" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

### Upgrade Subscription

Upgrade tenant to a higher subscription plan.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/subscription/upgrade`

**Authentication**: Admin token

**Request Body**:
```json
{
  "new_plan": "enterprise",
  "effective_date": "2025-12-01",
  "upgraded_by_user_id": "alice_uuid_123",
  "prorate": true
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `new_plan` | string | Yes | New plan: "starter", "professional", "enterprise" |
| `effective_date` | date | No | When upgrade takes effect (default: immediate) |
| `upgraded_by_user_id` | string | Yes | User ID of the user requesting upgrade |
| `prorate` | boolean | No | Prorate charges (default: true) |

**Response**: `200 OK`
```json
{
  "subscription_id": "sub_xyz789",
  "tenant_id": "acmeinc_23xv2",
  "previous_plan": "professional",
  "new_plan": "enterprise",
  "effective_date": "2025-12-01",
  "prorated_charge": 250.00,
  "upgraded_by_user_id": "alice_uuid_123",
  "message": "Subscription upgraded successfully"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/subscription/upgrade" \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "new_plan": "enterprise",
    "effective_date": "2025-12-01",
    "upgraded_by_user_id": "alice_uuid_123"
  }'
```

---

### Cancel Subscription

Cancel tenant subscription.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/subscription/cancel`

**Authentication**: Admin token or API key with owner scope

**Request Body**:
```json
{
  "cancel_at_period_end": true,
  "cancelled_by_user_id": "alice_uuid_123",
  "cancellation_reason": "switching_to_competitor",
  "feedback": "Found a better pricing model elsewhere"
}
```

**Response**: `200 OK`
```json
{
  "subscription_id": "sub_xyz789",
  "tenant_id": "acmeinc_23xv2",
  "status": "cancelled",
  "cancelled_at": "2025-11-17T14:00:00Z",
  "cancelled_by_user_id": "alice_uuid_123",
  "billing_cycle_end": "2025-11-30",
  "message": "Subscription will be cancelled at end of billing period"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/subscription/cancel" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_at_period_end": true,
    "cancelled_by_user_id": "alice_uuid_123",
    "cancellation_reason": "switching_to_competitor"
  }'
```

---

## Usage and Quota APIs

### Get Usage Statistics

Get current usage statistics for a tenant (tenant-level quotas with user-level tracking).

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/usage`

**Authentication**: API key + X-User-ID or admin token

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `month` | string | current | Month in YYYY-MM format (e.g., "2025-11") |
| `group_by_user` | boolean | false | Show usage breakdown per user |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "usage_month": "2025-11",
  "pipelines_run_count": 450,
  "pipelines_running_count": 3,
  "storage_used_gb": 245.67,
  "compute_hours": 127.5,
  "api_requests_count": 1523,
  "last_pipeline_run_at": "2025-11-17T09:30:00Z",
  "last_pipeline_run_by_user_id": "bob_uuid_456",
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
  },
  "top_users": [
    {
      "user_id": "bob_uuid_456",
      "name": "Bob Smith",
      "pipelines_run_count": 234
    },
    {
      "user_id": "alice_uuid_123",
      "name": "Alice Johnson",
      "pipelines_run_count": 156
    }
  ]
}
```

**Response with user breakdown** (`group_by_user=true`):
```json
{
  "tenant_id": "acmeinc_23xv2",
  "usage_month": "2025-11",
  "total_pipelines_run": 450,
  "user_breakdown": [
    {
      "user_id": "bob_uuid_456",
      "user_name": "Bob Smith",
      "pipelines_run_count": 234,
      "compute_hours": 67.2,
      "percentage_of_tenant_usage": 52.0
    },
    {
      "user_id": "alice_uuid_123",
      "user_name": "Alice Johnson",
      "pipelines_run_count": 156,
      "compute_hours": 45.8,
      "percentage_of_tenant_usage": 34.7
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/usage?month=2025-11&group_by_user=true" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

### Get Usage History

Get historical usage data for a tenant.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/usage/history`

**Authentication**: API key + X-User-ID or admin token

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start_month` | string | 6 months ago | Start month (YYYY-MM) |
| `end_month` | string | current month | End month (YYYY-MM) |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "history": [
    {
      "month": "2025-11",
      "pipelines_run": 450,
      "storage_used_gb": 245.67,
      "compute_hours": 127.5,
      "unique_users_count": 4
    },
    {
      "month": "2025-10",
      "pipelines_run": 523,
      "storage_used_gb": 238.12,
      "compute_hours": 145.3,
      "unique_users_count": 5
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/usage/history?start_month=2025-06&end_month=2025-11" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

## API Key Management APIs

### Create API Key

Generate a new API key for a tenant.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/api-keys`

**Authentication**: API key with admin scope + X-User-ID or admin token

**Request Body**:
```json
{
  "key_name": "Production Key",
  "scopes": ["pipelines:read", "pipelines:write", "usage:read"],
  "created_by_user_id": "alice_uuid_123",
  "expires_in_days": 90
}
```

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key_name` | string | No | Human-readable name for the key |
| `scopes` | array | No | API scopes (default: all scopes) |
| `created_by_user_id` | string | Yes | User ID of the user creating the key |
| `expires_in_days` | integer | No | Expiration in days (default: 90, null = never) |

**Available Scopes**:
- `pipelines:read` - View pipeline runs and logs
- `pipelines:write` - Execute pipelines
- `usage:read` - View usage statistics
- `credentials:read` - View cloud credentials
- `credentials:write` - Manage cloud credentials
- `users:read` - View tenant users
- `users:write` - Manage tenant users
- `admin:*` - Full admin access

**Response**: `200 OK`
```json
{
  "api_key_id": "key_xyz789",
  "api_key": "acmeinc_23xv2_api_NEW_KEY_HERE_xK9m",
  "tenant_id": "acmeinc_23xv2",
  "key_name": "Production Key",
  "scopes": ["pipelines:read", "pipelines:write", "usage:read"],
  "expires_at": "2026-02-15T00:00:00Z",
  "created_at": "2025-11-17T10:00:00Z",
  "created_by_user_id": "alice_uuid_123",
  "message": "API key created successfully. Save this key - it will only be shown once!"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/api-keys" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "key_name": "Production Key",
    "scopes": ["pipelines:read", "pipelines:write"],
    "created_by_user_id": "alice_uuid_123",
    "expires_in_days": 90
  }'
```

---

### List API Keys

List all API keys for a tenant.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/api-keys`

**Authentication**: API key + X-User-ID or admin token

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "api_keys": [
    {
      "api_key_id": "key_xyz789",
      "key_name": "Production Key",
      "scopes": ["pipelines:read", "pipelines:write"],
      "is_active": true,
      "expires_at": "2026-02-15T00:00:00Z",
      "last_used_at": "2025-11-17T09:30:00Z",
      "last_used_by_user_id": "bob_uuid_456",
      "created_at": "2025-11-17T10:00:00Z",
      "created_by_user_id": "alice_uuid_123"
    },
    {
      "api_key_id": "key_abc123",
      "key_name": "Development Key",
      "scopes": ["pipelines:read"],
      "is_active": false,
      "expires_at": null,
      "last_used_at": "2025-10-15T14:20:00Z",
      "created_at": "2025-10-01T10:00:00Z",
      "created_by_user_id": "alice_uuid_123",
      "revoked_at": "2025-11-01T12:00:00Z",
      "revoked_by_user_id": "alice_uuid_123"
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/api-keys" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

### Revoke API Key

Revoke (disable) an API key.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/api-keys/{key_id}/revoke`

**Authentication**: API key with admin scope + X-User-ID or admin token

**Request Body**:
```json
{
  "revoked_by_user_id": "alice_uuid_123",
  "revocation_reason": "Key compromised"
}
```

**Response**: `200 OK`
```json
{
  "api_key_id": "key_xyz789",
  "tenant_id": "acmeinc_23xv2",
  "is_active": false,
  "revoked_at": "2025-11-17T15:00:00Z",
  "revoked_by_user_id": "alice_uuid_123",
  "message": "API key revoked successfully"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/api-keys/key_xyz789/revoke" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "revoked_by_user_id": "alice_uuid_123",
    "revocation_reason": "Key compromised"
  }'
```

---

## Cloud Credentials Management APIs

### Add Cloud Credentials

Add cloud provider credentials for a tenant.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/credentials`

**Authentication**: API key with credentials:write scope + X-User-ID

**Request Body** (GCP Service Account):
```json
{
  "provider": "gcp",
  "credential_type": "service_account",
  "credential_name": "GCP Billing Export",
  "created_by_user_id": "alice_uuid_123",
  "credentials": {
    "type": "service_account",
    "project_id": "tenant-project-123",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----",
    "client_email": "service-account@tenant-project.iam.gserviceaccount.com",
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
  "created_by_user_id": "alice_uuid_123",
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
  "tenant_id": "acmeinc_23xv2",
  "provider": "gcp",
  "credential_name": "GCP Billing Export",
  "is_active": true,
  "last_validated_at": "2025-11-17T10:15:00Z",
  "created_at": "2025-11-17T10:15:00Z",
  "created_by_user_id": "alice_uuid_123",
  "message": "Credentials added and validated successfully"
}
```

**Error Responses**:

```json
// 400 Bad Request - Invalid credentials
{
  "detail": "Credential validation failed: Invalid service account key"
}

// 401 Unauthorized - Missing X-User-ID
{
  "detail": "X-User-ID header is required"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/credentials" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d @gcp_credentials.json
```

---

### List Credentials

List all cloud credentials for a tenant.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/credentials`

**Authentication**: API key with credentials:read scope + X-User-ID

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | string | all | Filter by provider: "gcp", "aws", "azure", "all" |

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "credentials": [
    {
      "credential_id": "cred_def456",
      "provider": "gcp",
      "credential_type": "service_account",
      "credential_name": "GCP Billing Export",
      "is_active": true,
      "last_validated_at": "2025-11-17T09:00:00Z",
      "created_at": "2025-11-01T10:00:00Z",
      "created_by_user_id": "alice_uuid_123"
    },
    {
      "credential_id": "cred_ghi789",
      "provider": "aws",
      "credential_type": "access_key",
      "credential_name": "AWS Cost Explorer",
      "is_active": true,
      "last_validated_at": "2025-11-17T08:30:00Z",
      "created_at": "2025-11-05T14:00:00Z",
      "created_by_user_id": "bob_uuid_456"
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/credentials?provider=gcp" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

### Delete Credentials

Delete cloud provider credentials.

**Endpoint**: `DELETE /api/v1/tenants/{tenant_id}/credentials/{credential_id}`

**Authentication**: API key with credentials:write scope + X-User-ID

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deleted_by_user_id` | string | Yes | User ID of the user deleting the credential |

**Response**: `200 OK`
```json
{
  "credential_id": "cred_def456",
  "tenant_id": "acmeinc_23xv2",
  "deleted_by_user_id": "alice_uuid_123",
  "message": "Credentials deleted successfully"
}
```

**Example**:
```bash
curl -X DELETE "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/credentials/cred_def456?deleted_by_user_id=alice_uuid_123" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

## Team Management APIs

### Invite Team Member

Invite a user to join tenant account.

**Endpoint**: `POST /api/v1/tenants/{tenant_id}/invitations`

**Authentication**: API key with admin scope + X-User-ID

**Request Body**:
```json
{
  "invited_email": "developer@acmecorp.com",
  "role": "MEMBER",
  "invited_by_user_id": "alice_uuid_123",
  "expires_in_days": 7
}
```

**Roles**:
- `OWNER` - Full access, can manage users and billing (only one per tenant)
- `ADMIN` - Full access, can manage users and billing
- `MEMBER` - Can create/edit pipelines, view data
- `VIEWER` - Read-only access to dashboards

**Response**: `200 OK`
```json
{
  "invitation_id": "inv_jkl012",
  "tenant_id": "acmeinc_23xv2",
  "invited_email": "developer@acmecorp.com",
  "role": "MEMBER",
  "invitation_token": "inv_token_secure_random_string",
  "invitation_url": "https://app.convergence.com/accept-invite?token=inv_token_secure_random_string",
  "expires_at": "2025-11-24T10:00:00Z",
  "invited_by_user_id": "alice_uuid_123",
  "status": "pending"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/invitations" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "invited_email": "developer@acmecorp.com",
    "role": "MEMBER",
    "invited_by_user_id": "alice_uuid_123"
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
  "tenant_id": "acmeinc_23xv2",
  "user_id": "john_uuid_789",
  "user_email": "developer@acmecorp.com",
  "role": "MEMBER",
  "message": "Invitation accepted successfully. You can now log in."
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/invitations/inv_token_secure_random_string/accept" \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "John Doe",
    "password": "secure_password_here"
  }'
```

---

### List Invitations

List all pending invitations for a tenant.

**Endpoint**: `GET /api/v1/tenants/{tenant_id}/invitations`

**Authentication**: API key + X-User-ID

**Response**: `200 OK`
```json
{
  "tenant_id": "acmeinc_23xv2",
  "invitations": [
    {
      "invitation_id": "inv_jkl012",
      "invited_email": "developer@acmecorp.com",
      "role": "MEMBER",
      "status": "pending",
      "expires_at": "2025-11-24T10:00:00Z",
      "invited_by_user_id": "alice_uuid_123",
      "created_at": "2025-11-17T10:00:00Z"
    }
  ]
}
```

**Example**:
```bash
curl -X GET "http://localhost:8080/api/v1/tenants/acmeinc_23xv2/invitations" \
  -H "X-API-Key: acmeinc_23xv2_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
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
  "request_id": "req_abc123xyz",
  "tenant_id": "acmeinc_23xv2",
  "user_id": "alice_uuid_123"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Invalid request parameters |
| `401` | Unauthorized | Invalid or missing API key or user ID |
| `403` | Forbidden | Valid credentials but insufficient permissions |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Resource already exists |
| `429` | Too Many Requests | Rate limit or quota exceeded |
| `500` | Internal Server Error | Server error (contact support) |
| `503` | Service Unavailable | Service temporarily unavailable |

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `INVALID_API_KEY` | 401 | API key is invalid or expired |
| `MISSING_USER_ID` | 401 | X-User-ID header is required |
| `USER_NOT_IN_TENANT` | 403 | User does not belong to this tenant |
| `QUOTA_EXCEEDED` | 429 | Monthly pipeline quota exceeded |
| `CONCURRENT_LIMIT_REACHED` | 429 | Concurrent pipeline limit reached |
| `TENANT_SUSPENDED` | 403 | Tenant account is suspended |
| `USER_DEACTIVATED` | 403 | User account is deactivated |
| `INVALID_CREDENTIALS` | 400 | Cloud credentials validation failed |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource doesn't exist |
| `DUPLICATE_TENANT_ID` | 409 | Tenant ID already exists |
| `DUPLICATE_USER_EMAIL` | 409 | User email already exists in tenant |

---

## Rate Limiting

All API endpoints are rate-limited to ensure fair usage.

**Rate Limits** (per API key, tenant-level):
- **Starter**: 100 requests/minute, 5,000 requests/hour
- **Professional**: 300 requests/minute, 20,000 requests/hour
- **Enterprise**: 1,000 requests/minute, 100,000 requests/hour

**Rate Limit Headers**:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1637154000
X-Tenant-ID: acmeinc_23xv2
```

**Rate Limit Error**:
```json
{
  "detail": "Rate limit exceeded. Try again in 45 seconds.",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "tenant_id": "acmeinc_23xv2",
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

Configure webhooks to receive real-time notifications about tenant and user events.

**Available Events**:
- `tenant.created`
- `tenant.suspended`
- `tenant.activated`
- `user.created`
- `user.deactivated`
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
  "tenant_id": "acmeinc_23xv2",
  "user_id": "alice_uuid_123",
  "timestamp": "2025-11-17T10:00:00Z",
  "data": {
    "usage_percentage": 92.5,
    "pipelines_run": 4625,
    "monthly_quota": 5000
  }
}
```

**User Event Example**:
```json
{
  "event_id": "evt_def456",
  "event_type": "user.created",
  "tenant_id": "acmeinc_23xv2",
  "user_id": "bob_uuid_456",
  "created_by_user_id": "alice_uuid_123",
  "timestamp": "2025-11-17T10:30:00Z",
  "data": {
    "email": "bob@acmecorp.com",
    "name": "Bob Smith",
    "role": "ADMIN"
  }
}
```

---

## SDK Examples

### Python SDK

```python
from convergence_client import ConvergenceClient

# Initialize client with tenant API key and user ID
client = ConvergenceClient(
    api_key="acmeinc_23xv2_api_xK9mPqWz7LnR4vYt",
    user_id="alice_uuid_123",
    base_url="https://api.convergence-pipeline.com"
)

# Get tenant details
tenant = client.tenants.get("acmeinc_23xv2")
print(f"Company: {tenant.company_name}")
print(f"Users: {tenant.user_count}")

# List users in tenant
users = client.users.list("acmeinc_23xv2")
for user in users:
    print(f"User: {user.name} ({user.role})")

# Create new user
new_user = client.users.create(
    tenant_id="acmeinc_23xv2",
    email="bob@acmecorp.com",
    name="Bob Smith",
    role="ADMIN",
    created_by_user_id="alice_uuid_123"
)
print(f"Created user: {new_user.user_id}")

# Get usage statistics with user breakdown
usage = client.usage.get_current(
    tenant_id="acmeinc_23xv2",
    group_by_user=True
)
print(f"Pipelines run: {usage.pipelines_run_count}/{usage.quotas.monthly_pipeline_quota}")
for user_usage in usage.user_breakdown:
    print(f"  {user_usage.user_name}: {user_usage.pipelines_run_count} pipelines")

# Run a pipeline (requires user context)
pipeline_run = client.pipelines.run(
    provider="gcp",
    domain="cost",
    template="bill-export",
    parameters={"date": "2025-11-17"}
)
print(f"Pipeline ID: {pipeline_run.pipeline_logging_id}")
print(f"Executed by user: {pipeline_run.user_id}")
```

### JavaScript SDK

```javascript
const ConvergenceClient = require('@convergence/sdk');

// Initialize client with tenant API key and user ID
const client = new ConvergenceClient({
  apiKey: 'acmeinc_23xv2_api_xK9mPqWz7LnR4vYt',
  userId: 'alice_uuid_123',
  baseUrl: 'https://api.convergence-pipeline.com'
});

// Get tenant details
const tenant = await client.tenants.get('acmeinc_23xv2');
console.log(`Company: ${tenant.companyName}`);
console.log(`Users: ${tenant.userCount}`);

// List users in tenant
const users = await client.users.list('acmeinc_23xv2');
users.forEach(user => {
  console.log(`User: ${user.name} (${user.role})`);
});

// Create new user
const newUser = await client.users.create({
  tenantId: 'acmeinc_23xv2',
  email: 'bob@acmecorp.com',
  name: 'Bob Smith',
  role: 'ADMIN',
  createdByUserId: 'alice_uuid_123'
});
console.log(`Created user: ${newUser.userId}`);

// Get usage statistics with user breakdown
const usage = await client.usage.getCurrent({
  tenantId: 'acmeinc_23xv2',
  groupByUser: true
});
console.log(`Pipelines: ${usage.pipelinesRunCount}/${usage.quotas.monthlyPipelineQuota}`);
usage.userBreakdown.forEach(userUsage => {
  console.log(`  ${userUsage.userName}: ${userUsage.pipelinesRunCount} pipelines`);
});

// Run a pipeline (requires user context)
const pipelineRun = await client.pipelines.run({
  provider: 'gcp',
  domain: 'cost',
  template: 'bill-export',
  parameters: { date: '2025-11-17' }
});
console.log(`Pipeline ID: ${pipelineRun.pipelineLoggingId}`);
console.log(`Executed by user: ${pipelineRun.userId}`);
```

---

## Related Documentation

- [Tenant Management Architecture](../architecture/TENANT_MANAGEMENT.md)
- [Multi-Tenancy Design](../implementation/MULTI_TENANCY_DESIGN.md)
- [API Reference](../reference/API_REFERENCE.md)
- [Onboarding Guide](../guides/ONBOARDING.md)
- [Encryption Guide](../security/ENCRYPTION.md)
- [Metadata Schema](../reference/metadata-schema.md)

---

**Version**: 2.0.0
**Last Updated**: 2025-11-17
**API Version**: v1
**Breaking Changes**: v2.0.0 introduces mandatory X-User-ID header for all authenticated endpoints
