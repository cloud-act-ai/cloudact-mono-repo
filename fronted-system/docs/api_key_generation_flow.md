# API Key Generation Flow

Complete guide to API key generation in CloudAct.ai platform.

> **Prerequisites:** See `fronted-system/CLAUDE.md` for the complete onboarding flow (signup → organization creation → backend setup).

---

## Overview

The API key generation flow is a critical part of the CloudAct.ai platform that enables organizations to authenticate with the backend pipeline system. This flow occurs during organization onboarding and can be repeated through API key rotation.

**Key Concepts:**
- **One API Key per Organization** - Each organization gets a unique API key
- **Shown Once** - API keys are displayed only once during generation
- **Multi-Layer Storage** - Keys stored in user metadata (frontend), KMS-encrypted in BigQuery (backend), and fingerprint in Supabase (reference)
- **Self-Service Rotation** - Organizations can rotate their own API keys

---

## Security Model

### Three-Layer Storage

| Layer | Location | Purpose | Security |
|-------|----------|---------|----------|
| **Full API Key** | User Metadata (`user.user_metadata.org_api_keys`) | Frontend pipeline/integration calls | Session-based, not in database |
| **Encrypted Key** | BigQuery (`org_api_keys.encrypted_org_api_key`) | Backend source of truth | KMS encrypted |
| **Fingerprint** | Supabase (`organizations.backend_api_key_fingerprint`) | Display only (last 4 chars) | Public reference |

### Why This Design?

1. **User Metadata** - Allows frontend to make authenticated API calls without exposing keys in Supabase
2. **KMS Encryption** - Backend keys are encrypted at rest in BigQuery
3. **Fingerprint** - UI can show key status without exposing the full key

---

## Step-by-Step Flow

### 1. Organization Creation (Supabase)

```typescript
// actions/organization.ts
const { data, error } = await supabase
  .from("organizations")
  .insert({
    org_slug: "acmecorp",
    name: "Acme Corp",
    created_by: user.id,
  })
  .select()
  .single()
```

**Result:** Organization created in Supabase, but no backend access yet.

---

### 2. Backend Onboarding

```typescript
// actions/backend-onboarding.ts
const result = await onboardToBackend({
  orgSlug: "acmecorp",
  companyName: "Acme Corp",
  adminEmail: "admin@acme.com",
  subscriptionPlan: "STARTER"
})
```

**What happens:**
1. Calls backend `/api/v1/organizations/onboard`
2. Backend creates BigQuery dataset for org
3. Backend generates API key: `acmecorp_api_xxxxxxxx`
4. Backend encrypts key with KMS
5. Backend stores encrypted key in BigQuery
6. Backend returns plaintext key (shown once!)

---

### 3. Store API Key in User Metadata

```typescript
// Automatically called by onboardToBackend
await storeApiKeyInUserMetadata(orgSlug, apiKey)

// Updates user metadata
{
  user_metadata: {
    org_api_keys: {
      "acmecorp": "acmecorp_api_xxxxxxxx"
    }
  }
}
```

**Why:** Frontend needs the key to make authenticated calls to backend for integrations and pipelines.

---

### 4. Update Supabase Organization

```typescript
// Update org with backend status
await supabase
  .from("organizations")
  .update({
    backend_onboarded: true,
    backend_api_key_fingerprint: "xxxx", // Last 4 chars
    backend_onboarded_at: new Date().toISOString()
  })
  .eq("org_slug", "acmecorp")
```

---

### 5. Display API Key to User (Once!)

```typescript
// components/api-key-display.tsx
<ApiKeyDisplay
  apiKey={result.apiKey}
  title="Your API Key"
  description="Save this key securely. It will only be shown once."
/>
```

**User sees:**
- Full API key (with show/hide toggle)
- Copy button
- Warning that it's shown once
- Usage example with curl

---

## API Endpoints

### Backend Onboarding

**Endpoint:** `POST /api/v1/organizations/onboard`

**Auth:** CA Root API Key (`X-CA-Root-Key` header)

**IMPORTANT:** This endpoint uses `X-CA-Root-Key`, NOT `X-Admin-Key`. The CA_ROOT_API_KEY is server-side only and NEVER exposed to the browser.

**Request:**
```json
{
  "org_slug": "acmecorp",
  "company_name": "Acme Corp",
  "admin_email": "admin@acme.com",
  "subscription_plan": "STARTER"
}
```

**Response:**
```json
{
  "org_slug": "acmecorp",
  "api_key": "acmecorp_api_xxxxxxxx",
  "subscription_plan": "STARTER",
  "dataset_created": true,
  "tables_created": ["org_api_keys", "org_integrations", ...],
  "message": "Organization onboarded successfully"
}
```

---

### API Key Rotation

**Endpoint:** `POST /api/v1/organizations/{org_slug}/api-key/rotate`

**Auth:** Current Org API Key (`X-API-Key` header)

**Request:** Empty body

**Response:**
```json
{
  "org_slug": "acmecorp",
  "api_key": "acmecorp_api_yyyyyyyy",
  "api_key_fingerprint": "yyyy",
  "previous_key_revoked": true,
  "message": "API key rotated successfully"
}
```

**Frontend Action:**
```typescript
const result = await rotateApiKey("acmecorp")
// result.apiKey - new key (shown once!)
```

---

### Get API Key Info

**Endpoint:** `GET /api/v1/organizations/{org_slug}/api-key`

**Auth:** Org API Key

**Response:**
```json
{
  "org_slug": "acmecorp",
  "api_key_fingerprint": "xxxx",
  "is_active": true,
  "created_at": "2025-11-26T10:00:00Z",
  "scopes": ["pipelines:run", "integrations:manage"]
}
```

---

## Code Examples

### Frontend: Complete Onboarding Flow

```typescript
// Example flow (actual implementation in actions/backend-onboarding.ts)
import { onboardToBackend } from "@/actions/backend-onboarding"

async function handleBackendOnboarding(orgSlug: string, companyName: string) {
  const result = await onboardToBackend({
    orgSlug,
    companyName,
    adminEmail: user.email,
    subscriptionPlan: "STARTER"
  })

  if (result.success && result.apiKey) {
    // API key returned (shown once!)
    console.log("Save this key:", result.apiKey)
  }
}
```

---

### Backend: API Key Generation

```python
# src/core/processors/setup/organizations/onboarding.py
def generate_org_api_key(org_slug: str) -> str:
    """Generate unique API key for organization."""
    random_suffix = secrets.token_urlsafe(16)[:16]
    api_key = f"{org_slug}_api_{random_suffix}"
    return api_key

def encrypt_and_store_api_key(org_slug: str, api_key: str):
    """Encrypt API key with KMS and store in BigQuery."""
    encrypted_key = kms_encrypt(api_key)

    client = bigquery.Client()
    table_id = f"{project_id}.organizations.org_api_keys"

    rows = [{
        "org_slug": org_slug,
        "encrypted_org_api_key": encrypted_key,
        "is_active": True,
        "created_at": datetime.utcnow().isoformat()
    }]

    client.insert_rows_json(table_id, rows)
```

---

### CLI: Test API Key Generation

```bash
# IMPORTANT: These endpoints use X-CA-Root-Key, NOT X-Admin-Key
# CA_ROOT_API_KEY is server-side only, NEVER exposed to browser

# 1. Bootstrap backend (one-time)
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force_recreate_dataset": false}'

# 2. Onboard organization
curl -X POST http://localhost:8000/api/v1/organizations/onboard \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "testorg",
    "company_name": "Test Org",
    "admin_email": "admin@test.com",
    "subscription_plan": "STARTER"
  }'

# Response includes: "api_key": "testorg_api_xxxxxxxx"
```

---

## Troubleshooting

### Issue: "Organization API key not found"

**Cause:** User metadata doesn't have the API key for this org.

**Solutions:**
1. Check if backend onboarding completed
2. Re-run onboarding if needed
3. Contact support if issue persists

---

### Issue: API key rotation fails with 401

**Cause:** Current API key is invalid or expired.

**Solutions:**
1. Verify current key in user metadata
2. Contact support to retrieve current API key
3. Verify the key is correctly stored
4. Then retry rotation

---

### Issue: Backend onboarding succeeds but key not in user metadata

**Cause:** API key storage step failed.

**Solution:**
Contact support or retry onboarding. The backend stores the API key automatically during onboarding.

---

### Issue: Can't find API key in BigQuery

**Query:**
```sql
SELECT org_slug, is_active, created_at
FROM `{project}.organizations.org_api_keys`
WHERE org_slug = 'acmecorp'
ORDER BY created_at DESC
```

**Decrypt key (backend admin only):**
```bash
cd data-pipeline-service
python get_api_key.py acmecorp
```

---

## Related Documentation

- [Integration Setup Flow](./integration_setup_flow.md) - How to setup LLM and cloud provider integrations
- [Pipeline Execution Flow](./pipeline_execution_flow.md) - How to run data pipelines
- [Backend CLAUDE.md](../../data-pipeline-service/CLAUDE.md) - Backend architecture and setup

---

## Quick Reference

| Action | Frontend Function | Backend Endpoint |
|--------|------------------|------------------|
| Onboard org | `onboardToBackend()` | `POST /api/v1/organizations/onboard` |
| Rotate key | - (not implemented) | `POST /api/v1/organizations/{org_slug}/api-key/rotate` |
| Get key info | - (not implemented) | `GET /api/v1/organizations/{org_slug}/api-key` |
