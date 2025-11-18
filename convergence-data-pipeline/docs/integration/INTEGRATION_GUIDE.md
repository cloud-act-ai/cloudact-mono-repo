# Convergence Data Pipeline - Integration Guide

**Version:** 2.0
**Last Updated:** 2025-11-18

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Authentication](#authentication)
4. [Onboarding Process](#onboarding-process)
5. [Pipeline Execution](#pipeline-execution)
6. [Monitoring & Logging](#monitoring--logging)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## Overview

The Convergence Data Pipeline is a multi-tenant, cloud-native data pipeline orchestration service built on Google Cloud Platform. It enables organizations to:

- **Automated Data Collection**: Schedule and execute data pipelines across cloud providers
- **Multi-Tenant Architecture**: Isolated data and resources per tenant
- **Quota Management**: Subscription-based usage limits and rate limiting
- **Centralized Logging**: All pipeline execution tracked in BigQuery

### Key Concepts

- **Tenant**: An organization using the service (quotas enforced at tenant level)
- **Pipeline**: A data collection/transformation workflow defined by YAML templates
- **Subscription Plan**: Defines limits (daily pipelines, concurrent runs, team size)
- **API Key**: Tenant-specific authentication token

---

## Getting Started

### Prerequisites

1. **Google Cloud Project** with:
   - BigQuery API enabled
   - Artifact Registry enabled (for deployment)
   - Cloud Run enabled (for deployment)

2. **Service Account** with roles:
   - `bigquery.dataEditor`
   - `bigquery.user`
   - `bigquery.jobUser`

3. **Network Access**:
   - Outbound HTTPS access to Cloud Run endpoint
   - Firewall rules allowing API communication

### Service Endpoints

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production | `https://convergence-api-prod-<hash>.run.app` | Production workloads |
| Staging | `https://convergence-api-staging-<hash>.run.app` | Pre-production testing |
| Development | `https://convergence-api-dev-<hash>.run.app` | Development/testing |

Replace `<hash>` with your Cloud Run service URL.

---

## Authentication

### API Key Authentication

All endpoints (except `/health` and onboarding endpoints) require authentication via headers:

```http
X-API-Key: {your_tenant_api_key}
X-User-ID: {user_id}  # Optional, for audit logging
```

### Obtaining API Key

API keys are generated during tenant onboarding:

1. Complete dry-run validation
2. Execute onboarding request
3. Save the returned `api_key` immediately (shown only once)

### Example

```bash
curl https://convergence-api-prod.run.app/api/v1/pipelines/runs \
  -H "X-API-Key: customer_id_123_api_xY9kL2mP4qR8vT" \
  -H "X-User-ID: user_789"
```

### Security Best Practices

1. **Storage**:
   - Store in environment variables or secrets manager
   - NEVER commit to version control
   - Use separate keys for dev/staging/production

2. **Rotation**:
   - Rotate every 90 days
   - Revoke compromised keys immediately
   - Monitor API key usage patterns

3. **Access Control**:
   - Limit API key access to authorized systems only
   - Use service accounts for automated access
   - Audit API key usage regularly

---

## Onboarding Process

### Step-by-Step Onboarding

#### Step 1: Dry-Run Validation (MANDATORY)

**Purpose**: Validate tenant configuration without creating resources.

```bash
curl -X POST https://convergence-api-prod.run.app/api/v1/tenants/dryrun \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "Acme Corporation",
    "admin_email": "admin@acme.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Expected Response** (Success):
```json
{
  "status": "SUCCESS",
  "ready_for_onboarding": true,
  "validation_summary": {
    "total_checks": 15,
    "passed": 15,
    "failed": 0
  },
  "message": "All validations passed. Safe to proceed with onboarding."
}
```

**If validation fails**:
- Review `validation_results` array
- Fix reported errors
- Retry dry-run validation

#### Step 2: Actual Onboarding

**Prerequisites**:
- Dry-run validation succeeded
- All errors fixed

```bash
curl -X POST https://convergence-api-prod.run.app/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "Acme Corporation",
    "admin_email": "admin@acme.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Expected Response**:
```json
{
  "tenant_id": "acme_corp",
  "api_key": "acme_corp_api_xY9kL2mP4qR8vT",
  "subscription_plan": "PROFESSIONAL",
  "dataset_created": true,
  "tables_created": [
    "tenant_comprehensive_view",
    "onboarding_validation_test"
  ],
  "message": "Tenant Acme Corporation onboarded successfully."
}
```

#### Step 3: Save API Key

**CRITICAL**: Save the API key immediately!

```bash
# Example: Save to environment variable
export CONVERGENCE_API_KEY="acme_corp_api_xY9kL2mP4qR8vT"

# Example: Save to GCP Secret Manager
echo -n "acme_corp_api_xY9kL2mP4qR8vT" | \
  gcloud secrets create convergence-api-key \
  --data-file=- \
  --replication-policy="automatic"
```

#### Step 4: Verify Onboarding

```bash
# Test API access
curl https://convergence-api-prod.run.app/health \
  -H "X-API-Key: acme_corp_api_xY9kL2mP4qR8vT"
```

**Complete Reference**: See [ONBOARDING_API.md](./ONBOARDING_API.md) for detailed API documentation.

---

## Pipeline Execution

### Available Pipelines

Pipelines are organized by provider and domain:

```
configs/
├── gcp/
│   ├── cost/
│   │   └── cost_billing.yml        # GCP cost/billing data
│   ├── compute/
│   │   └── vm_inventory.yml        # GCP VM inventory
│   └── security/
│       └── audit_logs.yml          # GCP audit logs
├── aws/
│   ├── cost/
│   │   └── cost_usage.yml          # AWS cost/usage data
│   └── ...
└── azure/
    └── ...
```

### Triggering Pipelines

#### Manual Execution (API)

```bash
curl -X POST https://convergence-api-prod.run.app/api/v1/pipelines/run/acme_corp/gcp/cost/cost_billing \
  -H "X-API-Key: acme_corp_api_xY9kL2mP4qR8vT" \
  -H "X-User-ID: user_123" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_by": "john@acme.com",
    "date": "2025-11-18"
  }'
```

**Response**:
```json
{
  "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "pipeline_id": "acme_corp-gcp-cost-cost_billing",
  "tenant_id": "acme_corp",
  "status": "PENDING",
  "message": "Pipeline triggered successfully (async mode)"
}
```

#### Scheduled Execution (Cloud Scheduler)

Pipelines can be scheduled via Cloud Scheduler:

```bash
# Create scheduler job for hourly execution
gcloud scheduler jobs create http pipeline-acme-gcp-cost \
  --schedule="0 * * * *" \
  --uri="https://convergence-api-prod.run.app/api/v1/scheduler/trigger" \
  --http-method=POST \
  --headers="X-API-Key=acme_corp_api_xY9kL2mP4qR8vT" \
  --location=us-central1
```

### Checking Pipeline Status

#### Get Specific Run

```bash
curl https://convergence-api-prod.run.app/api/v1/pipelines/runs/f47ac10b-58cc-4372-a567-0e02b2c3d479 \
  -H "X-API-Key: acme_corp_api_xY9kL2mP4qR8vT"
```

**Response**:
```json
{
  "pipeline_logging_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "pipeline_id": "acme_corp-gcp-cost-cost_billing",
  "tenant_id": "acme_corp",
  "status": "COMPLETE",
  "trigger_type": "api",
  "trigger_by": "john@acme.com",
  "start_time": "2025-11-18T14:30:00Z",
  "end_time": "2025-11-18T14:32:15Z",
  "duration_ms": 135000
}
```

#### List Recent Runs

```bash
curl "https://convergence-api-prod.run.app/api/v1/pipelines/runs?limit=10&status=COMPLETE" \
  -H "X-API-Key: acme_corp_api_xY9kL2mP4qR8vT"
```

### Pipeline Status Values

| Status | Description |
|--------|-------------|
| `PENDING` | Queued for execution |
| `RUNNING` | Currently executing |
| `COMPLETE` | Successfully completed |
| `FAILED` | Execution failed |

---

## Monitoring & Logging

### BigQuery Logs

All pipeline execution is logged to BigQuery:

#### Centralized Logs (All Tenants)

```sql
-- Pipeline runs
SELECT * FROM `your-project.tenants.tenant_pipeline_runs`
WHERE tenant_id = 'acme_corp'
ORDER BY start_time DESC
LIMIT 10;

-- Step execution logs
SELECT * FROM `your-project.tenants.tenant_step_logs`
WHERE tenant_id = 'acme_corp'
  AND pipeline_logging_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
ORDER BY step_start_time;

-- Data quality results
SELECT * FROM `your-project.tenants.tenant_dq_results`
WHERE tenant_id = 'acme_corp'
ORDER BY ingestion_date DESC;
```

#### Tenant-Specific View

```sql
-- Comprehensive view (all pipeline data for this tenant)
SELECT *
FROM `your-project.acme_corp.tenant_comprehensive_view`
WHERE status = 'FAILED'
ORDER BY start_time DESC;
```

### Usage Monitoring

#### Current Quota Usage

```sql
SELECT
  tenant_id,
  usage_date,
  pipelines_run_today,
  daily_limit,
  (pipelines_run_today / daily_limit * 100) as usage_percent,
  concurrent_pipelines_running,
  concurrent_limit
FROM `your-project.tenants.tenant_usage_quotas`
WHERE tenant_id = 'acme_corp'
  AND usage_date = CURRENT_DATE();
```

#### Monthly Usage Trends

```sql
SELECT
  DATE_TRUNC(usage_date, MONTH) as month,
  SUM(pipelines_run_today) as total_pipelines,
  AVG(pipelines_run_today) as avg_daily_pipelines,
  MAX(concurrent_pipelines_running) as peak_concurrent
FROM `your-project.tenants.tenant_usage_quotas`
WHERE tenant_id = 'acme_corp'
  AND usage_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
GROUP BY month
ORDER BY month DESC;
```

### Cloud Logging

Application logs are sent to Cloud Logging:

```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=convergence-api-prod" \
  --limit=50 \
  --format=json

# Filter by tenant
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.tenant_id=acme_corp" \
  --limit=50
```

---

## Error Handling

### Common Errors

#### 400 Bad Request

**Cause**: Invalid request body or parameters

**Example**:
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

**Solution**: Fix request body and retry

#### 401 Unauthorized

**Cause**: Missing or invalid API key

**Example**:
```json
{
  "error": "Authentication failed",
  "message": "Invalid or missing API key"
}
```

**Solution**: Check `X-API-Key` header contains valid API key

#### 403 Forbidden

**Cause**: Tenant ID mismatch or insufficient permissions

**Example**:
```json
{
  "error": "Authorization failed",
  "message": "Tenant ID mismatch: authenticated as 'tenant_a' but requested 'tenant_b'"
}
```

**Solution**: Ensure tenant ID in URL matches authenticated tenant

#### 429 Too Many Requests

**Cause**: Rate limit or quota exceeded

**Example**:
```json
{
  "error": "Rate limit exceeded",
  "message": "Daily pipeline quota exceeded. You have run 25 pipelines today (limit: 25)",
  "retry_after": 43200
}
```

**Solution**: Wait for quota reset (midnight UTC) or upgrade subscription plan

#### 500 Internal Server Error

**Cause**: Unexpected server error

**Example**:
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred",
  "request_id": "req_abc123"
}
```

**Solution**: Contact support with `request_id` for investigation

### Retry Strategy

Implement exponential backoff for transient errors:

```python
import time
import requests

def execute_with_retry(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = func()
            if response.status_code < 500:
                return response
        except Exception as e:
            if attempt == max_retries - 1:
                raise

        # Exponential backoff: 1s, 2s, 4s
        wait_time = 2 ** attempt
        time.sleep(wait_time)

    raise Exception("Max retries exceeded")

# Usage
response = execute_with_retry(
    lambda: requests.post(
        "https://convergence-api-prod.run.app/api/v1/pipelines/run/...",
        headers={"X-API-Key": api_key},
        json={"trigger_by": "user@example.com"}
    )
)
```

---

## Best Practices

### 1. API Key Management

- Store in secrets manager (GCP Secret Manager, AWS Secrets Manager)
- Use environment-specific keys (dev/staging/prod)
- Rotate keys every 90 days
- Monitor for unauthorized access

### 2. Error Handling

- Implement exponential backoff for retries
- Log all API errors for debugging
- Monitor error rates and set up alerts
- Handle quota errors gracefully (queue or delay)

### 3. Pipeline Execution

- Use meaningful `trigger_by` values for audit trail
- Pass `X-User-ID` header for user tracking
- Check quota before bulk operations
- Use async execution (don't block on pipeline completion)

### 4. Monitoring

- Set up Cloud Monitoring alerts for:
  - Failed pipelines (alert if >5% failure rate)
  - Quota approaching limit (alert at 80%)
  - API errors (alert if >1% error rate)
- Review BigQuery logs weekly
- Monitor API key usage patterns

### 5. Performance

- Use connection pooling for API calls
- Implement caching for frequently accessed data
- Batch operations when possible
- Use pagination for list endpoints

### 6. Security

- Never commit API keys to version control
- Use HTTPS for all API communication
- Validate all input data
- Implement IP whitelisting if needed
- Enable audit logging for compliance

---

## Integration Checklist

Before going to production:

- [ ] Dry-run validation completed successfully
- [ ] Tenant onboarded and API key saved securely
- [ ] API key tested and verified
- [ ] BigQuery dataset and views created
- [ ] Cloud Monitoring alerts configured
- [ ] Error handling implemented with retry logic
- [ ] Logging and monitoring in place
- [ ] Documentation reviewed and understood
- [ ] Test pipeline executed successfully
- [ ] Quota limits understood and appropriate for workload
- [ ] Security review completed
- [ ] Disaster recovery plan documented

---

## Support & Resources

### Documentation

- [Onboarding API Reference](./ONBOARDING_API.md)
- [API Reference](/docs/api/API.md)
- [Architecture Overview](/docs/architecture/ARCHITECTURE.md)
- [Troubleshooting Guide](/docs/guides/QUICK_FIX_GUIDE.md)

### Support Channels

- **GitHub Issues**: [Submit Issue](https://github.com/your-org/convergence-data-pipeline/issues)
- **Email**: support@your-company.com
- **Slack**: #convergence-support

### Useful Links

- [GCP BigQuery Documentation](https://cloud.google.com/bigquery/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)

---

## Changelog

### v2.0 (2025-11-18)
- Added dry-run validation requirement
- Updated onboarding process
- Enhanced error handling documentation
- Added monitoring and logging examples

### v1.0 (2025-11-01)
- Initial integration guide
- Basic onboarding flow
- API authentication documentation

---

**Next Steps**:
1. Review [ONBOARDING_API.md](./ONBOARDING_API.md) for detailed endpoint specifications
2. Complete tenant onboarding (dry-run + onboarding)
3. Test pipeline execution
4. Set up monitoring and alerts
5. Deploy to production
