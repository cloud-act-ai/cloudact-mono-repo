# /integration-setup - Integration Setup & Credential Management

Single source of truth for all provider credentials. Cloud providers (GCP, AWS, Azure, OCI) and GenAI providers (OpenAI, Anthropic, Gemini, DeepSeek).

## PreToolUse Hook Protection

A hook prevents accidentally adding Supabase integration code:

**Location:** `.claude/hooks/validate-integration-code.py`

**Blocks:**
- `cloud_provider_integrations` table access
- `integration_*_status` writes to Supabase
- `createServiceRoleClient` for integration operations
- `save*IntegrationStatus` function definitions

**Example block message:**
```
❌ BLOCKED: Don't use cloud_provider_integrations table.
Use API which stores in BigQuery. See /integration-setup
```

## Usage

```
/integration-setup                        # Show credential architecture
/integration-setup status <org_slug>      # Check all integration statuses
/integration-setup debug <org_slug>       # Debug credential issues
/integration-setup <provider> <org_slug>  # Setup specific provider
```

## Prerequisites

Before setting up integrations:
1. Services running: `/restart local`
2. Org onboarded: Has API key in `org_api_keys` table
3. GCP auth configured: `gcloud auth list`

---

## Architecture: Single Source of Truth

**ALL credentials stored in BigQuery only.** No Supabase caching.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Credential Storage Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Frontend                 API Service (8000)              BigQuery         │
│   ────────                 ──────────────────              ────────         │
│                                                                             │
│   Setup Form ────────────▶ POST /integrations/{org}/{p}/setup              │
│                                    │                                        │
│                                    ▼                                        │
│                            KMS Encrypt Credential                           │
│                                    │                                        │
│                                    ▼                                        │
│                            INSERT org_integration_credentials               │
│                                                                             │
│   Display Status ────────▶ GET /integrations/{org}                         │
│                                    │                                        │
│                                    ▼                                        │
│                            SELECT from org_integration_credentials          │
│                                    │                                        │
│                                    ▼                                        │
│                            Return status + last_validated_at                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Table: org_integration_credentials

| Column | Type | Description |
|--------|------|-------------|
| `credential_id` | STRING | UUID |
| `org_slug` | STRING | Organization identifier |
| `provider` | STRING | OPENAI, ANTHROPIC, GEMINI, DEEPSEEK, GCP_SA, AWS_IAM, AZURE, OCI |
| `encrypted_credential` | BYTES | KMS-encrypted credential |
| `credential_name` | STRING | Human-readable name |
| `validation_status` | STRING | VALID, INVALID, PENDING |
| `last_validated_at` | TIMESTAMP | Last successful validation |
| `is_active` | BOOL | Only one active per provider per org |
| `metadata` | JSON | Provider-specific config (billing tables, regions, etc.) |

### What's NOT in Supabase

| Was in Supabase | Now in BigQuery |
|-----------------|-----------------|
| `cloud_provider_integrations` | `org_integration_credentials` |
| `organizations.integration_*_status` | `org_integration_credentials.validation_status` |
| `organizations.integration_*_configured_at` | `org_integration_credentials.created_at` |

---

## Supported Providers

### Cloud Providers

| Provider | Code | Credential Type | Validation |
|----------|------|-----------------|------------|
| GCP | `GCP_SA` | Service Account JSON | BigQuery API call |
| AWS | `AWS_IAM` | Access Key + Secret | STS GetCallerIdentity |
| Azure | `AZURE` | Service Principal JSON | Azure Management API |
| OCI | `OCI` | API Key + Config | OCI Identity API |

### GenAI Providers

| Provider | Code | Credential Type | Validation |
|----------|------|-----------------|------------|
| OpenAI | `OPENAI` | API Key | List models API |
| Anthropic | `ANTHROPIC` | API Key | Messages API (dry run) |
| Gemini | `GEMINI` | API Key | List models API |
| DeepSeek | `DEEPSEEK` | API Key | Models API |

---

## Instructions

### Check All Integration Status

```bash
# Get org API key
ORG_API_KEY=$(bq query --use_legacy_sql=false --format=csv --project_id=cloudact-testing-1 "
SELECT api_key FROM organizations.org_api_keys WHERE org_slug = '{org_slug}' LIMIT 1
" | tail -1)

# Get all integrations
curl -s "http://localhost:8000/api/v1/integrations/{org_slug}" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool
```

### Setup Cloud Provider (GCP Example)

```bash
# Read SA JSON file
SA_JSON=$(cat /path/to/service-account.json | jq -c .)

# Setup via API
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/gcp/setup" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d "{
    \"credential\": $SA_JSON,
    \"credential_name\": \"GCP Production SA\"
  }"
```

### Setup GenAI Provider (OpenAI Example)

```bash
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/openai/setup" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{
    "credential": "sk-...",
    "credential_name": "OpenAI Production Key"
  }'
```

### Re-validate Credentials

```bash
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/{provider}/validate" \
  -H "X-API-Key: $ORG_API_KEY"
```

### Delete Integration

```bash
curl -X DELETE "http://localhost:8000/api/v1/integrations/{org_slug}/{provider}" \
  -H "X-API-Key: $ORG_API_KEY"
```

---

## Debug Credential Issues

### Check BigQuery Directly

```bash
bq query --use_legacy_sql=false --project_id=cloudact-testing-1 --format=prettyjson "
SELECT
  credential_id,
  provider,
  credential_name,
  validation_status,
  last_validated_at,
  is_active,
  created_at
FROM organizations.org_integration_credentials
WHERE org_slug = '{org_slug}'
ORDER BY provider, created_at DESC
"
```

### Common Issues

**Issue: Multiple active credentials for same provider**
```bash
# Check count
bq query --use_legacy_sql=false --project_id=cloudact-testing-1 "
SELECT provider, COUNT(*) as active_count
FROM organizations.org_integration_credentials
WHERE org_slug = '{org_slug}' AND is_active = TRUE
GROUP BY provider
HAVING COUNT(*) > 1
"

# Fix: Keep only latest
bq query --use_legacy_sql=false --project_id=cloudact-testing-1 "
UPDATE organizations.org_integration_credentials
SET is_active = FALSE
WHERE org_slug = '{org_slug}'
  AND provider = '{provider}'
  AND credential_id != (
    SELECT credential_id FROM organizations.org_integration_credentials
    WHERE org_slug = '{org_slug}' AND provider = '{provider}'
    ORDER BY created_at DESC LIMIT 1
  )
  AND is_active = TRUE
"
```

**Issue: Stale validation timestamp**

This was caused by Supabase caching. Now fixed - frontend reads from API directly.

**Issue: Missing schema column**
```bash
bq query --use_legacy_sql=false --project_id=cloudact-testing-1 "
ALTER TABLE organizations.org_integration_credentials
ADD COLUMN IF NOT EXISTS deactivation_scheduled_at TIMESTAMP
"
```

---

## Provider-Specific Skills

For detailed provider setup, use these skills:

| Provider | Skill |
|----------|-------|
| GCP | `/gcp-integration` |
| GenAI | `/integration-setup genai <org_slug>` |

---

## Key Files

| Service | File | Purpose |
|---------|------|---------|
| Frontend | `actions/integrations.ts` | Server actions (uses API) |
| API | `routers/integrations.py` | All integration endpoints |
| API | `processors/integrations/kms_store.py` | KMS encryption + storage |
| API | `processors/integrations/kms_decrypt.py` | Decryption + status |
| API | `configs/setup/bootstrap/schemas/org_integration_credentials.json` | Schema |

## Frontend Integration Flow

```typescript
// Setup integration (calls API which stores in BigQuery)
const result = await setupIntegration({
  orgSlug: "acme_inc",
  provider: "openai",
  credential: "sk-...",
  credentialName: "Production Key"
})

// Get integrations (calls API which reads from BigQuery)
const { integrations } = await getIntegrations("acme_inc")
// integrations.OPENAI.status === "VALID"
// integrations.OPENAI.last_validated_at === "2026-01-22T03:33:08Z"
```

---

## Migration Notes

### Removed from Supabase (2026-01-22)

1. **`cloud_provider_integrations` table** - No longer used
2. **`organizations.integration_*_status` columns** - No longer used for status
3. **`saveIntegrationStatus()` function** - Removed from frontend
4. **`saveCloudIntegrationStatus()` function** - Removed from frontend

### API is Source of Truth

All integration management goes through the API:
- `GET /api/v1/integrations/{org}` - List all
- `GET /api/v1/integrations/{org}/{provider}` - Get single
- `POST /api/v1/integrations/{org}/{provider}/setup` - Create/update
- `POST /api/v1/integrations/{org}/{provider}/validate` - Re-validate
- `DELETE /api/v1/integrations/{org}/{provider}` - Delete

The API reads/writes to BigQuery's `org_integration_credentials` table.
