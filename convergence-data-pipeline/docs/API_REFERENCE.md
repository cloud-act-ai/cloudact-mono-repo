# API Reference

Complete API documentation for the Convergence Data Pipeline Service.

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

1. [Health Check](#health-check)
2. [Customer Onboarding](#customer-onboarding)
3. [Pipeline Execution](#pipeline-execution)
4. [Metadata Management](#metadata-management)
5. [Error Responses](#error-responses)

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

## Customer Onboarding

### POST /api/v1/customers/onboard

Onboard a new customer/tenant to the platform. Creates a dedicated BigQuery dataset and metadata tables.

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
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/customers/onboard \
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
  "dataset_created": true,
  "tables_created": [
    "api_keys",
    "cloud_credentials",
    "pipeline_runs",
    "step_logs",
    "dq_results"
  ],
  "dryrun_status": "FAILED",
  "message": "Customer acme_corp_001 onboarded successfully. API key generated. Dryrun pipeline error: Pipeline config not found: acme_corp_001-dryrun for tenant acme_corp_001."
}
```

#### What Gets Created

1. **BigQuery Dataset**: `tenant_{tenant_id}`
   - Location: US
   - Labels: `tenant_id`, `environment`

2. **Metadata Tables** (5 tables):
   - `api_keys`: Stores customer API keys and cloud provider credentials
   - `cloud_credentials`: Stores cloud provider service account credentials
   - `pipeline_runs`: Tracks all pipeline execution runs
   - `step_logs`: Detailed logs for each pipeline step
   - `dq_results`: Data quality check results

3. **API Key**: Auto-generated with format `{tenant_id}_api_{random}`

4. **Dry Run**: Attempts to run a test pipeline (expected to fail initially)

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

## Pipeline Execution

### POST /api/v1/pipelines/execute

Execute a data pipeline for a specific tenant.

#### Headers
```
X-Tenant-ID: string (required)
X-API-Key: string (required)
```

#### Request Body
```json
{
  "pipeline_id": "string",
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
  -H "X-Tenant-ID: acme_corp_001" \
  -H "X-API-Key: acme_corp_001_api_abc123xyz" \
  -d '{
    "pipeline_id": "acme_corp_001-customer-data-sync",
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
  "status": "RUNNING",
  "started_at": "2025-11-16T05:00:00Z",
  "message": "Pipeline execution started successfully"
}
```

#### Error Responses

**401 Unauthorized** - Invalid or missing API key
```json
{
  "detail": "Invalid API key"
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

List all pipelines for a tenant.

#### Parameters
- `tenant_id` (path): The tenant identifier

#### Headers
```
X-API-Key: string (required)
```

#### Example Request
```bash
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/metadata/acme_corp_001/pipelines \
  -H "X-API-Key: acme_corp_001_api_abc123xyz"
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
      "last_run": "2025-11-16T04:30:00Z"
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
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation error |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Rate Limiting

Currently, no rate limiting is enforced. Future implementation will include:
- 1000 requests per hour per API key
- 100 pipeline executions per day per tenant (FREE tier)

---

## Authentication

API key authentication is required for most endpoints. Include the API key in the request headers:

```
X-API-Key: {your_api_key}
X-Tenant-ID: {your_tenant_id}
```

API keys are generated during the onboarding process and can be managed through the metadata API.

---

## Webhook Integration (Coming Soon)

Future support for webhooks to notify about pipeline completion, failures, and data quality issues.

---

## Testing Endpoints

### Staging Environment Testing
```bash
# Health check
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/health

# Onboard test tenant
curl -X POST \
  https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/customers/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test_staging_001",
    "company_name": "Test Company Staging",
    "subscription_tier": "FREE"
  }'
```

### Production Environment Testing
```bash
# Health check
curl https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app/health

# Onboard production tenant
curl -X POST \
  https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app/api/v1/customers/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "production_tenant_001",
    "company_name": "Production Company",
    "subscription_tier": "ENTERPRISE"
  }'
```

---

## Conventions and Standards

### Tenant ID Naming
- Use lowercase letters, numbers, and underscores only
- Start with a letter or number
- Format: `{company}_{environment}_{id}` (recommended)
- Examples: `acme_prod_001`, `test_stage_123`

### API Key Format
- Auto-generated: `{tenant_id}_api_{random_string}`
- Length: Variable (20-40 characters)
- Characters: Alphanumeric

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
