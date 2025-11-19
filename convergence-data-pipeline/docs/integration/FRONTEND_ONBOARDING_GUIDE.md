# Frontend Integration Guide - Tenant Onboarding

**Version:** 1.0
**Last Updated:** 2025-11-19
**Audience:** Frontend Developers

---

## Quick Start

This guide shows you how to integrate the Convergence Data Pipeline tenant onboarding API into your frontend application.

### Prerequisites

- Access to the API service URL (staging or production)
- Understanding of async/await or Promise-based HTTP requests
- Familiarity with handling API responses and errors

---

## Two-Step Onboarding Flow

Onboarding requires **TWO API calls** in sequence:

```
1. Dry-Run Validation (mandatory)
   ↓
2. Actual Onboarding (only if dry-run succeeds)
```

**NEVER skip the dry-run step!** It validates configuration before creating resources.

---

## API Endpoints

### Base URLs

| Environment | URL |
|-------------|-----|
| **Staging** | `https://convergence-pipeline-stage-820784027009.us-central1.run.app` |
| **Production** | `https://convergence-pipeline-prod-820784027009.us-central1.run.app` |

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/tenants/dryrun` | POST | Validate tenant configuration (step 1) |
| `/api/v1/tenants/onboard` | POST | Create tenant and generate API key (step 2) |
| `/health` | GET | Check API health |

---

## Step 1: Dry-Run Validation

### Request

**Endpoint:** `POST /api/v1/tenants/dryrun`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "tenant_id": "acme_corp",
  "company_name": "Acme Corporation",
  "admin_email": "admin@acme.com",
  "subscription_plan": "PROFESSIONAL"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenant_id` | string | Yes | Unique tenant identifier (lowercase, alphanumeric, hyphens, underscores only) |
| `company_name` | string | Yes | Company name (displayed in UI) |
| `admin_email` | string | Yes | Admin email address (valid email format required) |
| `subscription_plan` | string | Yes | Plan tier: `FREE`, `BASIC`, `PROFESSIONAL`, or `ENTERPRISE` |

### Response - Success

**Status Code:** `200 OK`

```json
{
  "status": "success",
  "validation_id": "dryrun_acme_corp_20251119_143022",
  "tenant_id": "acme_corp",
  "checks_passed": 12,
  "checks_failed": 0,
  "message": "All validations passed. Safe to proceed with onboarding.",
  "next_step": "POST /api/v1/tenants/onboard"
}
```

### Response - Failure

**Status Code:** `400 Bad Request`

```json
{
  "status": "failed",
  "validation_id": "dryrun_acme_corp_20251119_143022",
  "tenant_id": "acme_corp",
  "checks_passed": 10,
  "checks_failed": 2,
  "errors": [
    "Tenant ID 'acme_corp' already exists",
    "Invalid email domain: must be corporate domain"
  ],
  "message": "Validation failed. Fix errors before onboarding.",
  "next_step": "Review errors and retry dry-run"
}
```

### JavaScript Example

```javascript
async function validateTenant(tenantData) {
  const response = await fetch(
    'https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/tenants/dryrun',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tenantData),
    }
  );

  const result = await response.json();

  if (result.status === 'success') {
    console.log('Validation passed!', result);
    return { valid: true, data: result };
  } else {
    console.error('Validation failed:', result.errors);
    return { valid: false, errors: result.errors };
  }
}

// Usage
const tenantData = {
  tenant_id: 'acme_corp',
  company_name: 'Acme Corporation',
  admin_email: 'admin@acme.com',
  subscription_plan: 'PROFESSIONAL'
};

const validation = await validateTenant(tenantData);
if (validation.valid) {
  // Proceed to onboarding
}
```

### TypeScript Example

```typescript
interface TenantRequest {
  tenant_id: string;
  company_name: string;
  admin_email: string;
  subscription_plan: 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
}

interface DryRunResponse {
  status: 'success' | 'failed';
  validation_id: string;
  tenant_id: string;
  checks_passed: number;
  checks_failed: number;
  message: string;
  errors?: string[];
  next_step: string;
}

async function validateTenant(
  tenantData: TenantRequest
): Promise<DryRunResponse> {
  const response = await fetch(
    'https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/tenants/dryrun',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tenantData),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}
```

---

## Step 2: Actual Onboarding

### Request

**Endpoint:** `POST /api/v1/tenants/onboard`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "tenant_id": "acme_corp",
  "company_name": "Acme Corporation",
  "admin_email": "admin@acme.com",
  "subscription_plan": "PROFESSIONAL"
}
```

**IMPORTANT:** Use the **exact same data** as the dry-run request.

### Response - Success

**Status Code:** `200 OK`

```json
{
  "tenant_id": "acme_corp",
  "api_key": "acme_corp_api_xY9kL2mP4qR8vT",
  "subscription_plan": "PROFESSIONAL",
  "dataset_created": true,
  "message": "Tenant onboarded successfully"
}
```

### Response - Failure

**Status Code:** `400 Bad Request` or `500 Internal Server Error`

```json
{
  "error": "Tenant already exists",
  "tenant_id": "acme_corp",
  "message": "Tenant 'acme_corp' is already onboarded"
}
```

### JavaScript Example

```javascript
async function onboardTenant(tenantData) {
  const response = await fetch(
    'https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/tenants/onboard',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tenantData),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Onboarding failed');
  }

  const result = await response.json();

  // CRITICAL: Save API key immediately!
  console.log('API Key (save this!):', result.api_key);

  return result;
}
```

### TypeScript Example

```typescript
interface OnboardResponse {
  tenant_id: string;
  api_key: string;
  subscription_plan: string;
  dataset_created: boolean;
  message: string;
}

async function onboardTenant(
  tenantData: TenantRequest
): Promise<OnboardResponse> {
  const response = await fetch(
    'https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/tenants/onboard',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tenantData),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Onboarding failed');
  }

  return await response.json();
}
```

---

## Complete Integration Flow

### React Example

```javascript
import React, { useState } from 'react';

function TenantOnboarding() {
  const [formData, setFormData] = useState({
    tenant_id: '',
    company_name: '',
    admin_email: '',
    subscription_plan: 'PROFESSIONAL'
  });
  const [validationResult, setValidationResult] = useState(null);
  const [onboardingResult, setOnboardingResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleValidate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        'https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/tenants/dryrun',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );

      const result = await response.json();
      setValidationResult(result);

      if (result.status !== 'success') {
        setError(result.errors.join(', '));
      }
    } catch (err) {
      setError('Validation request failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        'https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/tenants/onboard',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Onboarding failed');
      }

      const result = await response.json();
      setOnboardingResult(result);

      // CRITICAL: Display API key prominently and prompt user to save
      alert(`API Key (SAVE IMMEDIATELY): ${result.api_key}`);
    } catch (err) {
      setError('Onboarding failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Tenant Onboarding</h2>

      <form onSubmit={handleValidate}>
        <input
          type="text"
          placeholder="Tenant ID (e.g., acme_corp)"
          value={formData.tenant_id}
          onChange={(e) => setFormData({...formData, tenant_id: e.target.value})}
          required
        />

        <input
          type="text"
          placeholder="Company Name"
          value={formData.company_name}
          onChange={(e) => setFormData({...formData, company_name: e.target.value})}
          required
        />

        <input
          type="email"
          placeholder="Admin Email"
          value={formData.admin_email}
          onChange={(e) => setFormData({...formData, admin_email: e.target.value})}
          required
        />

        <select
          value={formData.subscription_plan}
          onChange={(e) => setFormData({...formData, subscription_plan: e.target.value})}
        >
          <option value="FREE">Free</option>
          <option value="BASIC">Basic</option>
          <option value="PROFESSIONAL">Professional</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>

        <button type="submit" disabled={loading}>
          {loading ? 'Validating...' : 'Step 1: Validate'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {validationResult && validationResult.status === 'success' && (
        <div className="success">
          <p>Validation passed! All checks: {validationResult.checks_passed}</p>
          <button onClick={handleOnboard} disabled={loading}>
            {loading ? 'Onboarding...' : 'Step 2: Onboard Tenant'}
          </button>
        </div>
      )}

      {validationResult && validationResult.status === 'failed' && (
        <div className="error">
          <p>Validation failed:</p>
          <ul>
            {validationResult.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {onboardingResult && (
        <div className="success">
          <h3>Onboarding Successful!</h3>
          <p><strong>Tenant ID:</strong> {onboardingResult.tenant_id}</p>
          <p><strong>API Key:</strong> <code>{onboardingResult.api_key}</code></p>
          <p className="warning">SAVE THIS API KEY IMMEDIATELY! It cannot be retrieved later.</p>
        </div>
      )}
    </div>
  );
}

export default TenantOnboarding;
```

---

## Subscription Plans

| Plan | Daily Pipelines | Concurrent | Best For |
|------|----------------|------------|----------|
| **FREE** | 3 | 1 | Testing, POCs |
| **BASIC** | 10 | 2 | Small teams |
| **PROFESSIONAL** | 25 | 5 | Medium teams |
| **ENTERPRISE** | 100 | 20 | Large organizations |

---

## Error Handling

### Common Errors

**1. Tenant ID Already Exists**
```json
{
  "status": "failed",
  "errors": ["Tenant ID 'acme_corp' already exists"]
}
```
**Fix:** Choose a different tenant_id

**2. Invalid Email Format**
```json
{
  "status": "failed",
  "errors": ["Invalid email format: admin@"]
}
```
**Fix:** Provide valid email address

**3. Invalid Subscription Plan**
```json
{
  "status": "failed",
  "errors": ["Invalid plan: PREMIUM. Must be one of: FREE, BASIC, PROFESSIONAL, ENTERPRISE"]
}
```
**Fix:** Use exact plan name (case-sensitive)

**4. System Not Bootstrapped**
```json
{
  "status": "failed",
  "errors": ["Central dataset 'tenants' not found. System not bootstrapped."]
}
```
**Fix:** Contact DevOps team - bootstrap must be run first

**5. Network/Timeout Errors**
```javascript
try {
  const result = await onboardTenant(data);
} catch (error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    // Network error
    console.error('Network error - check API URL and connectivity');
  } else if (error.message.includes('timeout')) {
    // Timeout error
    console.error('Request timed out - try again');
  }
}
```

### Error Handling Best Practices

```javascript
async function handleOnboardingFlow(tenantData) {
  try {
    // Step 1: Validate
    const validation = await validateTenant(tenantData);

    if (validation.status !== 'success') {
      // Display validation errors to user
      return {
        success: false,
        stage: 'validation',
        errors: validation.errors
      };
    }

    // Step 2: Onboard
    const onboarding = await onboardTenant(tenantData);

    // Save API key securely
    await saveApiKeySecurely(onboarding.api_key);

    return {
      success: true,
      tenant_id: onboarding.tenant_id,
      api_key: onboarding.api_key
    };

  } catch (error) {
    console.error('Onboarding error:', error);
    return {
      success: false,
      stage: 'request',
      error: error.message
    };
  }
}
```

---

## API Key Management

### CRITICAL: Save API Key Immediately

The API key is shown **ONLY ONCE** during onboarding. You MUST:

1. Display it prominently to the user
2. Prompt them to save it (copy/paste or download)
3. Store it securely in your system

**Example: Display API Key with Copy Button**

```javascript
function ApiKeyDisplay({ apiKey }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="api-key-display">
      <div className="warning-banner">
        CRITICAL: Save this API key immediately! It cannot be retrieved later.
      </div>

      <div className="api-key-container">
        <code>{apiKey}</code>
        <button onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="instructions">
        Store this key securely:
        <ul>
          <li>Environment variables (.env file)</li>
          <li>Secrets manager (recommended for production)</li>
          <li>Never commit to version control</li>
        </ul>
      </div>
    </div>
  );
}
```

### Using the API Key

Once you have the API key, use it to authenticate pipeline execution requests:

```javascript
async function runPipeline(tenantId, apiKey) {
  const response = await fetch(
    `https://convergence-pipeline-stage-820784027009.us-central1.run.app/api/v1/pipelines/run/${tenantId}/gcp/cost/cost_billing`,
    {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-User-ID': 'user@example.com', // Optional
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        trigger_by: 'user@example.com',
        date: '2025-11-19'
      })
    }
  );

  return await response.json();
}
```

---

## Testing

### Health Check

Before onboarding, verify the API is accessible:

```javascript
async function checkApiHealth() {
  const response = await fetch(
    'https://convergence-pipeline-stage-820784027009.us-central1.run.app/health'
  );

  const health = await response.json();
  console.log('API Status:', health.status); // "healthy"
  return health.status === 'healthy';
}
```

### Test Tenant

For testing, use this pattern for tenant IDs:
```
test_<company>_<random>
```

Example: `test_acme_12345`

---

## Next Steps

After successful onboarding:

1. **Save API Key** - Store securely in your backend/secrets manager
2. **Test Pipeline Execution** - Trigger a test pipeline run
3. **Monitor Execution** - Query pipeline run status
4. **Set Up Usage Tracking** - Monitor quota and usage limits

---

## Support

**Need Help?**
- API Documentation: `/docs/integration/INTEGRATION_GUIDE.md`
- Detailed API Reference: `/docs/integration/ONBOARDING_API.md`
- Deployment Guide: `/docs/integration/DEPLOYMENT_GUIDE.md`

**Having Issues?**
- Check error messages carefully
- Verify API endpoint URL is correct
- Ensure request body matches exact schema
- Contact DevOps team if bootstrap-related errors occur

---

**Happy Integrating!**
