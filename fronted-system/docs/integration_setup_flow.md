# Integration Setup Flow

Complete guide to setting up LLM and cloud provider integrations in CloudAct.ai.

> **Prerequisites:** See `fronted_v0/CLAUDE.md` for the complete onboarding flow. Organization must be onboarded and have an API key before setting up integrations.

---

## Overview

Integrations allow CloudAct.ai to connect to your LLM providers (OpenAI, Anthropic) and cloud providers (GCP) to track costs and run analytics pipelines.

**Key Features:**
- **Secure Credential Storage** - All credentials encrypted with KMS in BigQuery
- **Validation on Setup** - Credentials tested before storage
- **Status Tracking** - Integration status cached in Supabase for quick UI updates
- **Self-Service Management** - Organizations can setup/delete their own integrations

---

## Supported Providers

| Provider | Type | Credential Format | Validation Method |
|----------|------|-------------------|-------------------|
| **OpenAI** | LLM | API Key (`sk-...`) | List models API call |
| **Anthropic** | LLM | API Key (`sk-ant-...`) | List models API call |
| **GCP** | Cloud | Service Account JSON | BigQuery access test |

---

## Security Model

### Credential Storage

| Layer | Location | Content | Security |
|-------|----------|---------|----------|
| **Encrypted Credential** | BigQuery (`org_integrations.encrypted_credential`) | Full API key/JSON | KMS encrypted |
| **Status Reference** | Supabase (`integration_{provider}_status`) | VALID/INVALID/NOT_CONFIGURED | Public |
| **Timestamp** | Supabase (`integration_{provider}_configured_at`) | ISO timestamp | Public |

### Why This Design?

1. **No Secrets in Supabase** - Credentials never stored in Supabase database
2. **KMS Encryption** - All credentials encrypted at rest in BigQuery
3. **Status Caching** - Frontend can show integration status without backend calls
4. **Validation** - Credentials tested before storage to prevent invalid configs

---

## Step-by-Step Flow

### 1. User Enters Credential

```typescript
// app/[orgSlug]/integrations/page.tsx
const [credential, setCredential] = useState("")
const [provider, setProvider] = useState<"openai" | "anthropic" | "gcp">("openai")

async function handleSetup() {
  const result = await setupIntegration({
    orgSlug,
    provider,
    credential,
    credentialName: `${provider} API Key`
  })

  if (result.success) {
    toast.success(`${provider} integration configured!`)
  } else {
    toast.error(result.error)
  }
}
```

---

### 2. Get Org API Key

The frontend retrieves the org API key from secure server-side storage (implemented in `actions/integrations.ts`). The API key is obtained using the `getOrgApiKeySecure()` function from `actions/backend-onboarding.ts`.

**Why needed:** Backend requires org API key to authenticate integration setup requests.

---

### 3. Call Backend Setup Endpoint

```typescript
// lib/api/backend.ts
const backend = new PipelineBackendClient({ orgApiKey })

const response = await backend.setupIntegration(
  orgSlug,
  provider,
  {
    credential: "sk-...",
    credential_name: "OpenAI API Key",
    skip_validation: false
  }
)
```

**Backend validates:**
- Org API key is valid
- Credential format is correct
- Credential works (API call test)

---

### 4. Backend Validation

```python
# Backend validates credential
if provider == "openai":
    # Test OpenAI API
    client = OpenAI(api_key=credential)
    models = client.models.list()  # Throws if invalid

elif provider == "anthropic":
    # Test Anthropic API
    client = Anthropic(api_key=credential)
    # Validation call

elif provider == "gcp":
    # Test GCP Service Account
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(credential)
    )
    client = bigquery.Client(credentials=credentials)
    # Test query
```

---

### 5. Encrypt and Store

```python
# Encrypt credential with KMS
encrypted_credential = kms_encrypt(credential)

# Store in BigQuery
client = bigquery.Client()
table_id = f"{project}.organizations.org_integrations"

rows = [{
    "org_slug": org_slug,
    "provider": provider.upper(),
    "encrypted_credential": encrypted_credential,
    "credential_name": credential_name,
    "is_active": True,
    "validation_status": "VALID",
    "created_at": datetime.utcnow().isoformat()
}]

client.insert_rows_json(table_id, rows)
```

---

### 6. Update Supabase Status

```typescript
// actions/integrations.ts
async function saveIntegrationStatus(
  orgSlug: string,
  provider: IntegrationProvider,
  status: string
) {
  const adminClient = createServiceRoleClient()

  const updateData = {
    [`integration_${provider}_status`]: status,
    [`integration_${provider}_configured_at`]: new Date().toISOString()
  }

  await adminClient
    .from("organizations")
    .update(updateData)
    .eq("org_slug", orgSlug)
}
```

**Result:** UI can show integration status without backend calls.

---

## API Endpoints

### Setup Integration

**Endpoint:** `POST /api/v1/integrations/{org_slug}/{provider}/setup`

**Auth:** Org API Key (`X-API-Key` header)

**Request:**
```json
{
  "credential": "sk-...",
  "credential_name": "OpenAI Production Key",
  "metadata": {
    "environment": "production"
  },
  "skip_validation": false
}
```

**Response:**
```json
{
  "success": true,
  "provider": "OPENAI",
  "credential_id": "cred_123",
  "validation_status": "VALID",
  "message": "Integration configured successfully"
}
```

---

### Get All Integrations

**Endpoint:** `GET /api/v1/integrations/{org_slug}`

**Auth:** Org API Key

**Response:**
```json
{
  "org_slug": "acmecorp",
  "integrations": {
    "OPENAI": {
      "provider": "OPENAI",
      "status": "VALID",
      "credential_name": "OpenAI Production Key",
      "last_validated_at": "2025-11-26T10:00:00Z",
      "created_at": "2025-11-26T09:00:00Z"
    },
    "ANTHROPIC": {
      "provider": "ANTHROPIC",
      "status": "NOT_CONFIGURED"
    }
  },
  "all_valid": false,
  "providers_configured": ["OPENAI"]
}
```

---

### Validate Integration

**Endpoint:** `POST /api/v1/integrations/{org_slug}/{provider}/validate`

**Auth:** Org API Key

**Purpose:** Re-validate existing integration without changing credential

**Response:**
```json
{
  "success": true,
  "provider": "OPENAI",
  "validation_status": "VALID",
  "message": "Integration validated successfully"
}
```

---

### Delete Integration

**Endpoint:** `DELETE /api/v1/integrations/{org_slug}/{provider}`

**Auth:** Org API Key

**Response:**
```json
{
  "success": true,
  "message": "Integration deleted successfully"
}
```

---

## Code Examples

### Frontend: Setup OpenAI Integration

```typescript
import { setupIntegration } from "@/actions/integrations"

async function setupOpenAI() {
  const result = await setupIntegration({
    orgSlug: "acmecorp",
    provider: "openai",
    credential: "sk-proj-...",
    credentialName: "OpenAI Production Key"
  })

  if (result.success) {
    console.log("OpenAI configured!")
    console.log("Status:", result.validationStatus)
  } else {
    console.error("Setup failed:", result.error)
  }
}
```

---

### Frontend: Get All Integration Statuses

```typescript
import { getIntegrations } from "@/actions/integrations"

async function loadIntegrations() {
  const result = await getIntegrations("acmecorp")

  if (result.success) {
    const { integrations, all_valid, providers_configured } = result.integrations

    console.log("OpenAI:", integrations.OPENAI.status)
    console.log("Anthropic:", integrations.ANTHROPIC.status)
    console.log("All valid?", all_valid)
    console.log("Configured:", providers_configured)
  }
}
```

---

### CLI: Setup Integration via Backend

```bash
# Get org API key first
ORG_API_KEY="acmecorp_api_xxxxxxxx"

# Setup OpenAI
curl -X POST http://localhost:8000/api/v1/integrations/acmecorp/openai/setup \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "credential": "sk-proj-...",
    "credential_name": "OpenAI Production Key",
    "skip_validation": false
  }'

# Setup GCP (Service Account JSON)
curl -X POST http://localhost:8000/api/v1/integrations/acmecorp/gcp/setup \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "credential": "{\"type\":\"service_account\",\"project_id\":\"...\"}",
    "credential_name": "GCP Production SA"
  }'
```

---

## Provider-Specific Setup

### OpenAI

**Credential Format:** `sk-proj-...` or `sk-...`

**Validation:** Calls `client.models.list()`

**Common Issues:**
- Invalid API key format
- Key doesn't have required permissions
- Rate limit exceeded during validation

---

### Anthropic

**Credential Format:** `sk-ant-...`

**Validation:** Calls Anthropic API

**Common Issues:**
- Invalid API key
- Insufficient permissions

---

### GCP Service Account

**Credential Format:** JSON service account key

```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "sa@project.iam.gserviceaccount.com"
}
```

**Validation:** Tests BigQuery access

**Required Permissions:**
- `bigquery.datasets.get`
- `bigquery.tables.get`
- `bigquery.jobs.create`

**Common Issues:**
- Missing BigQuery permissions
- Invalid JSON format
- Service account disabled

---

## Troubleshooting

### Issue: "Organization API key not found"

**Cause:** User metadata doesn't have org API key.

**Solution:**
1. Verify backend onboarding completed successfully
2. Contact support if API key is missing
3. API key may need to be regenerated via backend admin

---

### Issue: "Validation failed" for valid credential

**Causes:**
1. Network connectivity issues
2. Provider API rate limits
3. Credential permissions insufficient

**Solutions:**
1. Retry with `skip_validation: true` (not recommended)
2. Check provider API status
3. Verify credential permissions
4. Test credential manually with curl

---

### Issue: Integration status not updating in UI

**Cause:** Supabase status column not updated.

**Solution:**
```typescript
// Manually refresh integrations
const result = await getIntegrations(orgSlug)
```

Or check backend directly:
```bash
curl -X GET http://localhost:8000/api/v1/integrations/acmecorp \
  -H "X-API-Key: $ORG_API_KEY"
```

---

## Related Documentation

- [API Key Generation Flow](./api_key_generation_flow.md) - How to generate org API keys
- [Pipeline Execution Flow](./pipeline_execution_flow.md) - How to run pipelines with integrations
- [Backend CLAUDE.md](../../cloudact-backend-systems/convergence-data-pipeline/CLAUDE.md) - Backend architecture

---

## Quick Reference

| Action | Frontend Function | Backend Endpoint |
|--------|------------------|------------------|
| Setup | `setupIntegration()` | `POST /api/v1/integrations/{org_slug}/{provider}/setup` |
| Get all | `getIntegrations()` | `GET /api/v1/integrations/{org_slug}` |
| Get one | - | `GET /api/v1/integrations/{org_slug}/{provider}` |
| Validate | `validateIntegration()` | `POST /api/v1/integrations/{org_slug}/{provider}/validate` |
| Delete | `deleteIntegration()` | `DELETE /api/v1/integrations/{org_slug}/{provider}` |

**Status Values:** `VALID`, `INVALID`, `PENDING`, `NOT_CONFIGURED`
