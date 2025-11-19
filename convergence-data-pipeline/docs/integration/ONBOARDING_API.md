# Tenant Onboarding API Reference

**Version:** 2.0
**Last Updated:** 2025-11-18

## Overview

The Convergence Data Pipeline provides a **two-step onboarding process** to safely onboard new tenants:

1. **Dry-Run Validation** (MANDATORY) - Validates configuration without creating resources
2. **Actual Onboarding** - Creates tenant infrastructure and resources

This document provides complete API specifications for tenant onboarding.

---

## Architecture

### Two-Dataset Model

**Central Dataset (`tenants`)**:
- Shared across ALL tenants
- Contains management tables: `tenant_profiles`, `tenant_api_keys`, `tenant_subscriptions`, `tenant_usage_quotas`, etc.
- Contains centralized logs: `tenant_pipeline_runs`, `tenant_step_logs`, `tenant_dq_results`

**Per-Tenant Dataset (`{tenant_id}`)**:
- One dataset per tenant
- Contains tenant's operational data tables
- Contains `tenant_comprehensive_view` - unified view of all pipeline execution data
- Optional validation tables

---

## Endpoint 1: Dry-Run Validation

### POST `/api/v1/tenants/dryrun`

**Purpose**: Validates tenant configuration and permissions WITHOUT creating any resources.

**Authentication**: None required (public endpoint for pre-validation)

### Request

```http
POST /api/v1/tenants/dryrun HTTP/1.1
Content-Type: application/json

{
  "tenant_id": "customer_id_123",
  "company_name": "Customer Company Inc",
  "admin_email": "admin@customer.com",
  "subscription_plan": "ENTERPRISE"
}
```

### Request Body Schema

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `tenant_id` | string | Yes | Unique tenant identifier | Alphanumeric + hyphens/underscores, 3-50 chars, lowercase |
| `company_name` | string | Yes | Company or organization name | Min 2 chars, max 200 chars |
| `admin_email` | string | Yes | Primary admin contact email | Valid email format |
| `subscription_plan` | string | No | Subscription plan | Must be: `FREE`, `BASIC`, `PROFESSIONAL`, `ENTERPRISE` (default: `STARTER`) |

### Subscription Plans

| Plan | Daily Pipelines | Concurrent | Team Size | Providers |
|------|-----------------|------------|-----------|-----------|
| FREE | 3 | 1 | 1 | 2 |
| BASIC | 10 | 2 | 3 | 4 |
| PROFESSIONAL | 25 | 5 | 6 | 6 |
| ENTERPRISE | 100 | 10 | 11 | 10 |

### Response - Success

```json
{
  "status": "SUCCESS",
  "tenant_id": "customer_id_123",
  "subscription_plan": "ENTERPRISE",
  "company_name": "Customer Company Inc",
  "admin_email": "admin@customer.com",
  "validation_summary": {
    "total_checks": 15,
    "passed": 15,
    "failed": 0,
    "warnings": 0
  },
  "validation_results": [
    {
      "check_name": "tenant_id_format",
      "status": "PASSED",
      "message": "Tenant ID format is valid"
    },
    {
      "check_name": "tenant_id_uniqueness",
      "status": "PASSED",
      "message": "Tenant ID is unique"
    },
    {
      "check_name": "email_validation",
      "status": "PASSED",
      "message": "Email format is valid"
    },
    {
      "check_name": "gcp_permissions",
      "status": "PASSED",
      "message": "GCP permissions verified"
    },
    {
      "check_name": "bigquery_access",
      "status": "PASSED",
      "message": "BigQuery API access confirmed"
    }
  ],
  "message": "All validations passed. Safe to proceed with onboarding.",
  "ready_for_onboarding": true
}
```

### Response - Failure

```json
{
  "status": "FAILED",
  "tenant_id": "customer_id_123",
  "subscription_plan": "ENTERPRISE",
  "company_name": "Customer Company Inc",
  "admin_email": "admin@customer.com",
  "validation_summary": {
    "total_checks": 15,
    "passed": 13,
    "failed": 2,
    "warnings": 0
  },
  "validation_results": [
    {
      "check_name": "tenant_id_uniqueness",
      "status": "FAILED",
      "message": "Tenant ID 'customer_id_123' already exists",
      "error": "Duplicate tenant ID found in tenant_profiles table"
    },
    {
      "check_name": "email_domain_validation",
      "status": "FAILED",
      "message": "Invalid email domain",
      "error": "Email domain must be a corporate domain (not gmail.com, yahoo.com, etc.)"
    }
  ],
  "message": "Validation failed. Fix errors before onboarding.",
  "ready_for_onboarding": false
}
```

### Validation Checks Performed

1. **Tenant Data Validation**:
   - Tenant ID format (lowercase alphanumeric, hyphens, underscores only)
   - Tenant ID uniqueness (not already in use)
   - Email format validation
   - Email domain validation (corporate domains only)
   - Plan name validity
   - Company name presence and length

2. **GCP Permissions & Access**:
   - BigQuery API access verification
   - Dataset creation permissions
   - Table creation permissions
   - View creation permissions
   - Service account authentication

3. **System State**:
   - Central `tenants` dataset exists (bootstrap completed)
   - Required management tables present
   - No conflicting tenant records
   - Schema version compatibility

### Status Codes

| Code | Meaning |
|------|---------|
| `200` | Validation completed (check `ready_for_onboarding` flag) |
| `400` | Invalid request body (validation errors) |
| `500` | Internal server error |

---

## Endpoint 2: Tenant Onboarding

### POST `/api/v1/tenants/onboard`

**Purpose**: Creates tenant infrastructure, API key, and subscription.

**Authentication**: None required (but dry-run validation MUST pass first)

**IMPORTANT**: Only execute this endpoint AFTER dry-run validation succeeds.

### Request

```http
POST /api/v1/tenants/onboard HTTP/1.1
Content-Type: application/json

{
  "tenant_id": "customer_id_123",
  "company_name": "Customer Company Inc",
  "admin_email": "admin@customer.com",
  "subscription_plan": "ENTERPRISE",
  "force_recreate_dataset": false,
  "force_recreate_tables": false
}
```

### Request Body Schema

| Field | Type | Required | Description | Default |
|-------|------|----------|-------------|---------|
| `tenant_id` | string | Yes | Unique tenant identifier | - |
| `company_name` | string | Yes | Company or organization name | - |
| `admin_email` | string | Yes | Primary admin contact email | - |
| `subscription_plan` | string | No | Subscription plan | `STARTER` |
| `force_recreate_dataset` | boolean | No | Delete and recreate dataset (DESTRUCTIVE) | `false` |
| `force_recreate_tables` | boolean | No | Delete and recreate tables (DESTRUCTIVE) | `false` |

**WARNING**: Setting `force_recreate_*` flags to `true` will DELETE existing data. Use only for testing/development.

### Response - Success

```json
{
  "tenant_id": "customer_id_123",
  "api_key": "customer_id_123_api_xY9kL2mP4qR8vT",
  "subscription_plan": "ENTERPRISE",
  "dataset_created": true,
  "tables_created": [
    "tenant_comprehensive_view",
    "onboarding_validation_test"
  ],
  "dryrun_status": "SKIPPED",
  "message": "Tenant Customer Company Inc onboarded successfully. API key generated. Post-onboarding validation skipped (pre-onboarding dry-run validation already passed)"
}
```

**CRITICAL**: The `api_key` is shown ONLY ONCE. Save it immediately!

### Response - Failure

```json
{
  "error": "Onboarding failed",
  "message": "Failed to create tenant profile: Tenant ID 'customer_id_123' already exists",
  "tenant_id": "customer_id_123"
}
```

### What Gets Created

1. **Central Dataset (`tenants`) Records**:
   - `tenant_profiles` - Tenant metadata
   - `tenant_api_keys` - API key (encrypted)
   - `tenant_subscriptions` - Subscription details and limits
   - `tenant_usage_quotas` - Initial usage tracking record

2. **Per-Tenant Dataset (`{tenant_id}`)**:
   - Dataset created in BigQuery
   - `tenant_comprehensive_view` - Unified view of all pipeline execution data
   - `onboarding_validation_test` - Test table with validation record

3. **API Key**:
   - Format: `{tenant_id}_api_{random_16_chars}`
   - Encrypted and stored in `tenants.tenant_api_keys`
   - SHA256 hash stored for authentication
   - Scopes: `pipelines:read`, `pipelines:write`, `pipelines:execute`

### Status Codes

| Code | Meaning |
|------|---------|
| `200` | Onboarding successful |
| `400` | Invalid request body |
| `409` | Tenant already exists |
| `500` | Internal server error (partial onboarding may have occurred) |

---

## Complete Onboarding Workflow

### Step 1: Dry-Run Validation

**Purpose**: Validate configuration and permissions BEFORE creating resources.

```bash
curl -X POST https://your-service-url.run.app/api/v1/tenants/dryrun \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "customer_id_123",
    "company_name": "Customer Company Inc",
    "admin_email": "admin@customer.com",
    "subscription_plan": "ENTERPRISE"
  }'
```

**Expected Response**:
- `status: "SUCCESS"`
- `ready_for_onboarding: true`
- All validation checks passed

**If Validation Fails**:
1. Review `validation_results` array
2. Fix reported errors
3. Retry dry-run validation
4. Do NOT proceed to onboarding until validation succeeds

### Step 2: Actual Onboarding

**Purpose**: Create tenant infrastructure and API key.

**Prerequisites**:
- Dry-run validation completed successfully
- All validation errors fixed

```bash
curl -X POST https://your-service-url.run.app/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "customer_id_123",
    "company_name": "Customer Company Inc",
    "admin_email": "admin@customer.com",
    "subscription_plan": "ENTERPRISE"
  }'
```

**Expected Response**:
- `api_key` - SAVE IMMEDIATELY (shown only once)
- `dataset_created: true`
- `tables_created` - List of created tables/views
- `message` - Confirmation message

### Step 3: Save API Key

**CRITICAL**: Store the API key securely:
- Environment variables
- Secrets manager (GCP Secret Manager, AWS Secrets Manager)
- Vault or similar secret management system

**DO NOT**:
- Commit API keys to version control
- Share API keys via email/chat
- Store in plain text files

### Step 4: Verify Onboarding

**Check BigQuery**:

```sql
-- Verify tenant profile
SELECT * FROM `your-project.tenants.tenant_profiles`
WHERE tenant_id = 'customer_id_123';

-- Verify API key exists
SELECT tenant_api_key_id, tenant_id, scopes, is_active, created_at
FROM `your-project.tenants.tenant_api_keys`
WHERE tenant_id = 'customer_id_123';

-- Verify subscription
SELECT * FROM `your-project.tenants.tenant_subscriptions`
WHERE tenant_id = 'customer_id_123';

-- Verify usage quota initialized
SELECT * FROM `your-project.tenants.tenant_usage_quotas`
WHERE tenant_id = 'customer_id_123';

-- Check tenant dataset exists
SELECT * FROM `your-project.customer_id_123.INFORMATION_SCHEMA.TABLES`;

-- View comprehensive view
SELECT * FROM `your-project.customer_id_123.tenant_comprehensive_view`;
```

### Step 5: Test API Access

**Test with saved API key**:

```bash
curl https://your-service-url.run.app/health \
  -H "X-API-Key: customer_id_123_api_xY9kL2mP4qR8vT"
```

---

## Troubleshooting

### Dry-Run Validation Fails

**Common Issues**:

1. **Tenant ID Already Exists**:
   - Error: `"Tenant ID 'customer_id_123' already exists"`
   - Solution: Choose a different tenant ID or delete existing tenant (if test environment)

2. **Invalid Email Domain**:
   - Error: `"Email domain must be a corporate domain"`
   - Solution: Use corporate email (not gmail.com, yahoo.com, etc.)

3. **GCP Permissions Error**:
   - Error: `"BigQuery API access denied"`
   - Solution: Verify service account has `bigquery.dataEditor` and `bigquery.user` roles

4. **Central Dataset Missing**:
   - Error: `"Central dataset 'tenants' not found"`
   - Solution: Run bootstrap first: `POST /admin/bootstrap`

### Onboarding Fails

**Rollback Strategy**:

If onboarding fails partway through:

```sql
-- Delete tenant profile
DELETE FROM `your-project.tenants.tenant_profiles`
WHERE tenant_id = 'customer_id_123';

-- Delete API key
DELETE FROM `your-project.tenants.tenant_api_keys`
WHERE tenant_id = 'customer_id_123';

-- Delete subscription
DELETE FROM `your-project.tenants.tenant_subscriptions`
WHERE tenant_id = 'customer_id_123';

-- Delete usage quota
DELETE FROM `your-project.tenants.tenant_usage_quotas`
WHERE tenant_id = 'customer_id_123';

-- Delete tenant dataset (DESTRUCTIVE)
DROP SCHEMA `your-project.customer_id_123` CASCADE;
```

Then retry onboarding after fixing the issue.

---

## Security Considerations

### API Key Security

1. **Storage**:
   - Encrypted using GCP KMS before storage
   - SHA256 hash stored for authentication lookups
   - Original key shown only during onboarding

2. **Rotation**:
   - API keys should be rotated every 90 days
   - Use separate keys for dev/staging/production
   - Revoke compromised keys immediately

3. **Scopes**:
   - Default scopes: `pipelines:read`, `pipelines:write`, `pipelines:execute`
   - Additional scopes can be added via admin API

### Email Validation

- Corporate domains only (no public email providers)
- Email format validation (RFC 5322 compliant)
- Domain MX record verification (optional)

### Tenant ID Requirements

- Must be unique across all tenants
- Lowercase alphanumeric + hyphens/underscores only
- 3-50 characters
- Cannot start with number or special character

---

## Rate Limits

### Dry-Run Validation
- **Rate**: 10 requests/minute per IP
- **Burst**: 20 requests
- **Purpose**: Prevent abuse during pre-validation

### Onboarding
- **Rate**: 5 requests/minute per IP
- **Burst**: 10 requests
- **Purpose**: Prevent rapid tenant creation attacks

---

## Integration Examples

### Python

```python
import requests
import json

# Step 1: Dry-Run Validation
def validate_tenant(tenant_data):
    response = requests.post(
        "https://your-service-url.run.app/api/v1/tenants/dryrun",
        headers={"Content-Type": "application/json"},
        json=tenant_data
    )
    return response.json()

# Step 2: Onboard Tenant
def onboard_tenant(tenant_data):
    response = requests.post(
        "https://your-service-url.run.app/api/v1/tenants/onboard",
        headers={"Content-Type": "application/json"},
        json=tenant_data
    )
    return response.json()

# Usage
tenant_data = {
    "tenant_id": "customer_id_123",
    "company_name": "Customer Company Inc",
    "admin_email": "admin@customer.com",
    "subscription_plan": "ENTERPRISE"
}

# Validate first
validation = validate_tenant(tenant_data)
if validation["ready_for_onboarding"]:
    # Proceed with onboarding
    result = onboard_tenant(tenant_data)

    # SAVE API KEY IMMEDIATELY
    api_key = result["api_key"]
    print(f"API Key: {api_key}")

    # Store in environment variable or secrets manager
    # DO NOT print in production!
else:
    print(f"Validation failed: {validation['message']}")
    for check in validation["validation_results"]:
        if check["status"] == "FAILED":
            print(f"  - {check['check_name']}: {check['message']}")
```

### Node.js

```javascript
const axios = require('axios');

// Step 1: Dry-Run Validation
async function validateTenant(tenantData) {
  const response = await axios.post(
    'https://your-service-url.run.app/api/v1/tenants/dryrun',
    tenantData,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

// Step 2: Onboard Tenant
async function onboardTenant(tenantData) {
  const response = await axios.post(
    'https://your-service-url.run.app/api/v1/tenants/onboard',
    tenantData,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

// Usage
const tenantData = {
  tenant_id: 'customer_id_123',
  company_name: 'Customer Company Inc',
  admin_email: 'admin@customer.com',
  subscription_plan: 'ENTERPRISE'
};

(async () => {
  // Validate first
  const validation = await validateTenant(tenantData);

  if (validation.ready_for_onboarding) {
    // Proceed with onboarding
    const result = await onboardTenant(tenantData);

    // SAVE API KEY IMMEDIATELY
    const apiKey = result.api_key;
    console.log(`API Key: ${apiKey}`);

    // Store in environment variable or secrets manager
  } else {
    console.log(`Validation failed: ${validation.message}`);
    validation.validation_results
      .filter(check => check.status === 'FAILED')
      .forEach(check => {
        console.log(`  - ${check.check_name}: ${check.message}`);
      });
  }
})();
```

---

## Best Practices

1. **Always Run Dry-Run First**:
   - NEVER skip dry-run validation
   - Prevents resource creation failures
   - Catches configuration errors early

2. **Save API Key Immediately**:
   - API key shown only once during onboarding
   - Store in secrets manager immediately
   - Test API key before completing onboarding process

3. **Use Appropriate Subscription Plans**:
   - Start with lower plans for testing
   - Upgrade as usage grows
   - Monitor quota usage regularly

4. **Handle Errors Gracefully**:
   - Check `ready_for_onboarding` flag
   - Parse `validation_results` for specific errors
   - Implement retry logic for transient errors

5. **Verify Onboarding Success**:
   - Check BigQuery for tenant records
   - Test API key authentication
   - Verify dataset and views created

---

## Support

For issues or questions:
- **Documentation**: `/docs` directory
- **API Reference**: `/docs/api/API.md`
- **Troubleshooting**: `/docs/guides/QUICK_FIX_GUIDE.md`
- **GitHub Issues**: [Submit Issue](https://github.com/your-org/convergence-data-pipeline/issues)

---

**Version History**:
- v2.0 (2025-11-18): Added dry-run validation, updated schemas
- v1.0 (2025-11-01): Initial onboarding API
