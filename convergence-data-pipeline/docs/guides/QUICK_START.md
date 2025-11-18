# Quick Start Guide

Get the Convergence Data Pipeline running locally in 5 minutes with multi-user tenant architecture.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup](#setup-5-minutes)
3. [Understanding the Architecture](#understanding-the-architecture)
4. [Onboard Your First Tenant](#onboard-your-first-tenant)
5. [Create Your First User](#create-your-first-user)
6. [Run Your First Pipeline](#run-your-first-pipeline)
7. [Verify Results](#verify-results-in-bigquery)
8. [Key Endpoints](#key-endpoints)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Python 3.11+** (`python3 --version`)
- **GCP Project** with BigQuery enabled
- **Service Account JSON** with BigQuery Admin permissions
- **Git** for cloning the repository

---

## Setup (5 minutes)

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/your-org/convergence-data-pipeline.git
cd convergence-data-pipeline
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

**Required settings** in `.env`:
```bash
# GCP Configuration
GCP_PROJECT_ID=gac-prod-471220
GOOGLE_APPLICATION_CREDENTIALS=~/.gcp/gac-prod-471220-e34944040b62.json

# Authentication (for local development)
DISABLE_AUTH=true
DEFAULT_TENANT_ID=acme_corp
DEFAULT_USER_ID=alice_uuid_123

# Server Configuration
ENVIRONMENT=local
LOG_LEVEL=INFO
```

### 3. Start the Server

```bash
uvicorn src.app.main:app --reload --port 8080
```

Server will start at http://localhost:8080

Visit http://localhost:8080/docs for interactive API documentation.

---

## Understanding the Architecture

### Tenant vs User Model

The platform uses a **multi-user tenant architecture**:

```
Tenant (Organization)
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
- **API Requests**: Require **both** X-API-Key (tenant) + X-User-ID (user)

### Authentication Headers

All protected endpoints require **two headers**:

```bash
curl -X POST http://localhost:8080/api/v1/endpoint \
  -H "X-API-Key: acme_corp_api_abc123xyz" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json"
```

---

## Onboard Your First Tenant

Create a new tenant (organization) with infrastructure provisioning.

### Step 1: Create Tenant

```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "ACME Corporation",
    "contact_email": "admin@acmecorp.com",
    "subscription_plan": "professional",
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
  "message": "Tenant acme_corp onboarded successfully. Save your API key - it will only be shown once!"
}
```

**Save the API key!** You'll need it for all subsequent requests.

---

## Create Your First User

After onboarding the tenant, create additional users (team members).

### Step 1: Create User

```bash
curl -X POST http://localhost:8080/api/v1/tenants/acme_corp/users \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@acmecorp.com",
    "name": "Bob Smith",
    "role": "ADMIN",
    "created_by_user_id": "alice_uuid_123"
  }'
```

### Response

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

### Step 2: List Users in Tenant

```bash
curl http://localhost:8080/api/v1/tenants/acme_corp/users \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

Response shows all users in the tenant with their roles and status.

---

## Run Your First Pipeline

Now let's execute a pipeline using the tenant API key and user ID.

### Step 1: List Available Pipelines

```bash
curl http://localhost:8080/api/v1/pipelines \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

### Step 2: Trigger a Pipeline

```bash
curl -X POST http://localhost:8080/api/v1/pipelines/run/p_openai_billing \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_by": "api_user",
    "date": "2025-11-14"
  }'
```

### Response

```json
{
  "pipeline_logging_id": "run_uuid_abc123",
  "pipeline_id": "p_openai_billing",
  "tenant_id": "acme_corp",
  "user_id": "alice_uuid_123",
  "status": "running",
  "message": "Pipeline queued for execution",
  "started_at": "2025-11-17T10:45:00Z"
}
```

**Note**: Response includes both `tenant_id` and `user_id` for audit tracking.

### Step 3: Check Pipeline Status

```bash
curl http://localhost:8080/api/v1/pipelines/runs/run_uuid_abc123 \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

### Response

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
  "message": "Pipeline completed successfully"
}
```

### Step 4: List All Pipeline Runs

```bash
curl "http://localhost:8080/api/v1/pipelines/runs?tenant_id=acme_corp" \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

Filter by user:
```bash
curl "http://localhost:8080/api/v1/pipelines/runs?tenant_id=acme_corp&user_id=alice_uuid_123" \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"
```

---

## Verify Results in BigQuery

### Check Pipeline Run History

```bash
bq query --use_legacy_sql=false \
  "SELECT
     pipeline_logging_id,
     pipeline_id,
     tenant_id,
     user_id,
     status,
     start_time,
     end_time,
     rows_processed
   FROM acme_corp.x_meta_pipeline_runs
   ORDER BY start_time DESC
   LIMIT 5"
```

### View User Activity

```bash
bq query --use_legacy_sql=false \
  "SELECT
     user_id,
     COUNT(*) as pipelines_run,
     MAX(start_time) as last_run
   FROM acme_corp.x_meta_pipeline_runs
   WHERE tenant_id = 'acme_corp'
   GROUP BY user_id"
```

### Check Loaded Data

```bash
bq query --use_legacy_sql=false \
  "SELECT * FROM acme_corp.gcp_billing_export LIMIT 10"
```

### View Data Quality Results

```bash
bq query --use_legacy_sql=false \
  "SELECT
     pipeline_id,
     tenant_id,
     user_id,
     test_name,
     result,
     run_date
   FROM acme_corp.x_meta_dq_results
   ORDER BY run_date DESC
   LIMIT 10"
```

### Check Users Table

```bash
bq query --use_legacy_sql=false \
  "SELECT
     user_id,
     email,
     name,
     role,
     is_active,
     created_at
   FROM acme_corp.users
   WHERE tenant_id = 'acme_corp'"
```

---

## Key Endpoints

### Tenant Management

| Method | Path | Authentication | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/tenants/onboard` | Public/Admin | Create new tenant and infrastructure |
| GET | `/api/v1/tenants/{tenant_id}` | X-API-Key + X-User-ID | Get tenant details |
| PATCH | `/api/v1/tenants/{tenant_id}` | X-API-Key + X-User-ID | Update tenant info |

### User Management

| Method | Path | Authentication | Description |
|--------|------|---------------|-------------|
| POST | `/api/v1/tenants/{tenant_id}/users` | X-API-Key + X-User-ID | Create new user |
| GET | `/api/v1/tenants/{tenant_id}/users` | X-API-Key + X-User-ID | List all users |
| GET | `/api/v1/tenants/{tenant_id}/users/{user_id}` | X-API-Key + X-User-ID | Get user details |
| PATCH | `/api/v1/tenants/{tenant_id}/users/{user_id}` | X-API-Key + X-User-ID | Update user |
| POST | `/api/v1/tenants/{tenant_id}/users/{user_id}/deactivate` | X-API-Key + X-User-ID | Deactivate user |

### Pipeline Management

| Method | Path | Authentication | Description |
|--------|------|---------------|-------------|
| GET | `/api/v1/pipelines` | X-API-Key + X-User-ID | List available pipelines |
| POST | `/api/v1/pipelines/run/{pipeline_id}` | X-API-Key + X-User-ID | Trigger pipeline |
| GET | `/api/v1/pipelines/runs/{run_id}` | X-API-Key + X-User-ID | Get pipeline run status |
| GET | `/api/v1/pipelines/runs` | X-API-Key + X-User-ID | List pipeline runs |
| POST | `/api/v1/pipelines/runs/{run_id}/cancel` | X-API-Key + X-User-ID | Cancel running pipeline |

### Utility Endpoints

| Method | Path | Authentication | Description |
|--------|------|---------------|-------------|
| GET | `/health` | None | Health check |
| GET | `/docs` | None | Interactive API docs (Swagger UI) |

---

## Troubleshooting

### API returns 401 Unauthorized

**Possible causes:**
- Missing `X-API-Key` header
- Missing `X-User-ID` header (required for all authenticated endpoints)
- API key is invalid or expired

**Solution:**
```bash
# Verify both headers are present
curl http://localhost:8080/api/v1/pipelines \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: alice_uuid_123"

# Check API keys table
bq query --use_legacy_sql=false \
  "SELECT tenant_id, is_active FROM metadata.x_meta_api_keys WHERE tenant_id = 'acme_corp'"
```

### API returns 403 Forbidden - User not in tenant

**Error:**
```json
{
  "detail": "User does not belong to this tenant",
  "error_code": "USER_NOT_IN_TENANT"
}
```

**Solution:**
```bash
# Verify user belongs to tenant
bq query --use_legacy_sql=false \
  "SELECT user_id, tenant_id, email FROM acme_corp.users WHERE user_id = 'alice_uuid_123'"

# Create user if missing
curl -X POST http://localhost:8080/api/v1/tenants/acme_corp/users \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: owner_user_id" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@acmecorp.com",
    "name": "Alice Johnson",
    "role": "OWNER",
    "created_by_user_id": "owner_user_id"
  }'
```

### Pipeline fails with "Dataset not found"

**Solution:**
```bash
# Ensure tenant was onboarded
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "ACME Corporation",
    "created_by_user_id": "alice_uuid_123"
  }'

# Verify dataset exists in BigQuery
bq ls --project_id=gac-prod-471220
```

### Cannot connect to BigQuery

**Solution:**
```bash
# Verify service account credentials path
ls -la ~/.gcp/gac-prod-471220-e34944040b62.json

# Test service account permissions
bq ls --project_id=gac-prod-471220

# Check service account has BigQuery Admin role in GCP Console
```

### User deactivated

**Error:**
```json
{
  "detail": "User account is deactivated",
  "error_code": "USER_DEACTIVATED"
}
```

**Solution:**
```bash
# Reactivate user (requires admin)
curl -X POST http://localhost:8080/api/v1/tenants/acme_corp/users/alice_uuid_123/reactivate \
  -H "X-API-Key: acme_corp_api_xK9mPqWz7LnR4vYt" \
  -H "X-User-ID: admin_user_id"
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Server                          │
│                   (Cloud Run / Local)                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Authentication Middleware                            │  │
│  │ - Validates X-API-Key → extracts tenant_id          │  │
│  │ - Validates X-User-ID → verifies user in tenant     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ API Routers                                          │  │
│  │ - /api/v1/tenants/* (Tenant management)             │  │
│  │ - /api/v1/tenants/{tid}/users/* (User management)   │  │
│  │ - /api/v1/pipelines/* (Pipeline execution)          │  │
│  │ - /api/v1/admin/* (Admin operations)                │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                    (HTTP/REST)
                         │
          ┌──────────────┴──────────────┐
          │                              │
   ┌──────▼────────┐            ┌───────▼────────┐
   │   BigQuery    │            │     Stripe     │
   │ (Multi-Region)│            │   (Billing)    │
   │               │            │                │
   │ Per Tenant:   │            │ stripe_tenant_ │
   │ - users       │            │ id (customer)  │
   │ - api_keys    │            │                │
   │ - pipeline_   │            └────────────────┘
   │   runs        │
   │ - step_logs   │
   │ - raw data    │
   │ - silver data │
   └───────────────┘
```

---

## Next Steps

1. **User Management**: Create additional team members
2. **Onboarding Guide**: See [ONBOARDING.md](ONBOARDING.md) for detailed tenant vs user flows
3. **API Reference**: See [API_REFERENCE.md](../reference/API_REFERENCE.md) for all endpoints
4. **Tenant API Reference**: See [TENANT_API_REFERENCE.md](../api/TENANT_API_REFERENCE.md) for tenant management
5. **Pipeline Configuration**: See [pipeline-configuration.md](../reference/pipeline-configuration.md)
6. **Environment Variables**: See [ENVIRONMENT_VARIABLES.md](../reference/ENVIRONMENT_VARIABLES.md)
7. **Deployment**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
8. **Metadata Schema**: See [metadata-schema.md](../reference/metadata-schema.md)
9. **Multi-Tenancy Design**: See [MULTI_TENANCY_DESIGN.md](../implementation/MULTI_TENANCY_DESIGN.md)

---

**Version**: 2.0.0
**Last Updated**: 2025-11-17
**Breaking Changes**: v2.0.0 requires X-User-ID header for all authenticated endpoints
