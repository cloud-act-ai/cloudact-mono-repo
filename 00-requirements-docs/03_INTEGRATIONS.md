# Integrations

**Status**: IMPLEMENTED (v1.5) | **Updated**: 2025-12-04 | **Single Source of Truth**

> Provider integrations setup, credential management, and validation
> NOT specific pipeline execution (see 03_PIPELINES.md)
> NOT cost calculations (see 02_CLOUD_COSTS.md, 02_LLM_API_USAGE_COSTS.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{provider}` | Integration provider | `gcp`, `openai`, `anthropic` |
| `{credential_id}` | Credential record ID | `cred_abc123` |
| `{integration_id}` | Integration record ID | `int_xyz789` |

---

## TERMINOLOGY

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Provider** | External service to integrate | GCP, OpenAI | `providers.yml` |
| **Integration** | Configured provider connection | Active GCP setup | `org_integrations` |
| **Credential** | Authentication secret | API key, Service account | `org_credentials` |
| **Validation** | Connection test | Can query BigQuery? | Integration status |

---

## Where Data Lives

| Storage | Table/Location | What |
|---------|----------------|------|
| File System | `configs/system/providers.yml` | Provider registry |
| BigQuery (Meta) | `organizations.org_integrations` | Integration status |
| BigQuery (Meta) | `organizations.org_credentials` | Encrypted credentials |
| Supabase | `saas_subscription_providers_meta` | SaaS provider toggles |

---

## Supported Providers

### Cloud Providers

| Provider | Credential Type | Status |
|----------|-----------------|--------|
| GCP | Service Account JSON | IMPLEMENTED |
| AWS | IAM Role ARN | NOT IMPLEMENTED |
| Azure | Service Principal | NOT IMPLEMENTED |

### LLM Providers

| Provider | Credential Type | Status |
|----------|-----------------|--------|
| OpenAI | API Key | IMPLEMENTED |
| Anthropic | API Key | IMPLEMENTED |
| Gemini | API Key | IMPLEMENTED |

### SaaS Providers

| Category | Providers | Status |
|----------|-----------|--------|
| AI | ChatGPT Plus, Claude Pro, Cursor, etc. | IMPLEMENTED |
| Design | Canva, Figma, Adobe CC | IMPLEMENTED |
| Productivity | Notion, Slack, Asana | IMPLEMENTED |
| Development | GitHub, Vercel, Railway | IMPLEMENTED |

---

## Lifecycle

| Stage | What Happens | Integration Status |
|-------|--------------|-------------------|
| **Not Configured** | No credentials | N/A |
| **Setup** | User provides credentials | `pending` |
| **Validating** | Testing connection | `validating` |
| **Active** | Ready for pipelines | `active` |
| **Error** | Validation failed | `error` |
| **Disabled** | User disabled | `disabled` |
| **Expired** | Credentials expired | `expired` |

---

## Architecture Flow

### Integration Setup Flow

```
+-----------------------------------------------------------------------------+
|                        INTEGRATION SETUP FLOW                                |
+-----------------------------------------------------------------------------+
|                                                                             |
|  1. CREDENTIAL UPLOAD                                                       |
|     +-- Frontend: Settings > Integrations > {Provider}                     |
|     +-- User provides API key or service account                           |
|     +-- POST /api/v1/integrations/{org}/{provider}/setup                   |
|                                                                             |
|  2. ENCRYPTION                                                              |
|     +-- Credential encrypted using GCP KMS                                 |
|     +-- Only encrypted blob stored in org_credentials                      |
|     +-- Key version tracked for rotation                                   |
|                                                                             |
|  3. INTEGRATION RECORD                                                      |
|     +-- Create/update org_integrations record                              |
|     +-- Store provider-specific config                                     |
|     +-- Set status = 'pending'                                             |
|                                                                             |
|  4. VALIDATION                                                              |
|     +-- POST /api/v1/integrations/{org}/{provider}/validate                |
|     +-- Decrypt credentials                                                |
|     +-- Test provider-specific connection                                  |
|     +-- Update status = 'active' or 'error'                                |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Provider-Specific Validation

```
+-----------------------------------------------------------------------------+
|                     PROVIDER VALIDATION TESTS                                |
+-----------------------------------------------------------------------------+
|                                                                             |
|  GCP                                                                        |
|  +-- Test: Can access BigQuery API?                                        |
|  +-- Test: Can list datasets?                                              |
|  +-- Test: Can query billing export (if configured)?                       |
|                                                                             |
|  OpenAI                                                                     |
|  +-- Test: GET /v1/models                                                  |
|  +-- Test: Valid API key format (sk-...)                                   |
|  +-- Returns: Available models, tier info                                  |
|                                                                             |
|  Anthropic                                                                  |
|  +-- Test: GET /v1/messages (minimal request)                              |
|  +-- Test: Valid API key format (sk-ant-...)                               |
|  +-- Returns: Model access, tier info                                      |
|                                                                             |
|  Gemini                                                                     |
|  +-- Test: GET /v1/models                                                  |
|  +-- Test: Valid API key format                                            |
|  +-- Returns: Available models                                             |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Data Flow

```
Frontend (3000)              Pipeline Engine (8001)              BigQuery
     |                              |                              |
     |                              |                              |
     |  1. Setup Integration        |                              |
     |  (provide credentials)       |                              |
     |----------------------------->|                              |
     |                              |  Encrypt via KMS             |
     |                              |----------------------------->|
     |                              |  Store in org_credentials    |
     |                              |  Create org_integrations     |
     |<-----------------------------|                              |
     |                              |                              |
     |  2. Validate Integration     |                              |
     |----------------------------->|                              |
     |                              |  Decrypt credentials         |
     |                              |<-----------------------------|
     |                              |                              |
     |                              |  Test provider connection    |
     |                              |  (GCP/OpenAI/Anthropic)      |
     |                              |                              |
     |                              |  Update status               |
     |                              |----------------------------->|
     |<-----------------------------|                              |
     |                              |                              |
     |  3. Get Status               |                              |
     |----------------------------->|                              |
     |                              |<-----------------------------|
     |<-----------------------------|  Return integration info     |
     |                              |                              |

Tables:
- org_credentials (BigQuery): Encrypted credentials
- org_integrations (BigQuery): Integration status and config

Security:
- GCP KMS: Credential encryption
- X-API-Key: Org authentication
- Never expose raw credentials
```

---

## Schema Definitions

### BigQuery: org_integrations

**File:** `api-service/configs/setup/bootstrap/schemas/org_integrations.json`

| Column | Type | Description |
|--------|------|-------------|
| integration_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| provider | STRING | Provider name |
| status | STRING | pending, active, error, disabled |
| config | JSON | Provider-specific config |
| validated_at | TIMESTAMP | Last successful validation |
| error_message | STRING | Last error (if any) |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |
| created_by | STRING | User who created |

### BigQuery: org_credentials

**File:** `api-service/configs/setup/bootstrap/schemas/org_credentials.json`

| Column | Type | Description |
|--------|------|-------------|
| credential_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| provider | STRING | Provider name |
| credential_type | STRING | api_key, service_account, oauth |
| encrypted_value | BYTES | KMS-encrypted credential |
| key_version | STRING | KMS key version |
| fingerprint | STRING | SHA256 hash (first 8 chars) |
| expires_at | TIMESTAMP | Expiration (if applicable) |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |
| created_by | STRING | User who created |

### Provider Registry

**File:** `data-pipeline-service/configs/system/providers.yml`

```yaml
providers:
  gcp:
    display_name: Google Cloud Platform
    category: cloud
    credential_type: service_account
    required_fields:
      - project_id
      - billing_dataset_id
    pipelines:
      - cost/billing

  openai:
    display_name: OpenAI
    category: llm
    credential_type: api_key
    key_prefix: "sk-"
    pipelines:
      - cost/usage_cost

  anthropic:
    display_name: Anthropic
    category: llm
    credential_type: api_key
    key_prefix: "sk-ant-"
    pipelines:
      - usage_cost
```

---

## Frontend Implementation

### Server Actions

**File:** `fronted-system/actions/integrations.ts`

#### setupIntegration()

```typescript
async function setupIntegration(
  orgSlug: string,
  provider: string,
  credentials: CredentialInput,
  config?: ProviderConfig
): Promise<{
  success: boolean,
  integration_id?: string,
  error?: string
}>
```

#### validateIntegration()

```typescript
async function validateIntegration(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean,
  status?: string,
  details?: ValidationDetails,
  error?: string
}>
```

#### getIntegrations()

```typescript
async function getIntegrations(
  orgSlug: string
): Promise<{
  success: boolean,
  integrations?: IntegrationInfo[],
  error?: string
}>
```

#### getIntegrationStatus()

```typescript
async function getIntegrationStatus(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean,
  integration?: IntegrationInfo,
  error?: string
}>
```

#### deleteIntegration()

```typescript
async function deleteIntegration(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean,
  error?: string
}>
```

### TypeScript Interfaces

```typescript
export interface IntegrationInfo {
  integration_id: string
  org_slug: string
  provider: string
  status: 'pending' | 'validating' | 'active' | 'error' | 'disabled'
  config: Record<string, unknown>
  validated_at?: string
  error_message?: string
  created_at: string
  updated_at: string
}

export interface CredentialInput {
  api_key?: string
  service_account_json?: string
  oauth_token?: string
}

export interface ProviderConfig {
  // GCP
  project_id?: string
  billing_dataset_id?: string
  billing_project_id?: string

  // LLM
  organization_id?: string
  default_model?: string
}

export interface ValidationDetails {
  connection: boolean
  permissions: boolean
  models?: string[]
  tier?: string
  message?: string
}
```

### Pages

| Route | Purpose |
|-------|---------|
| `/{org}/settings/integrations` | Integration overview |
| `/{org}/settings/integrations/cloud` | Cloud providers (GCP) |
| `/{org}/settings/integrations/llm` | LLM providers |
| `/{org}/settings/integrations/subscriptions` | SaaS subscriptions |

---

## Pipeline Engine Endpoints

**File:** `data-pipeline-service/src/app/routers/integrations.py`

### Integration Management

```
POST   /api/v1/integrations/{org}/{provider}/setup
       -> Setup integration with credentials
       -> Body: { credentials, config? }
       -> Returns: { success, integration_id }

POST   /api/v1/integrations/{org}/{provider}/validate
       -> Validate integration connection
       -> Returns: { success, status, details }

GET    /api/v1/integrations/{org}
       -> List all integrations for org
       -> Returns: { integrations: IntegrationInfo[] }

GET    /api/v1/integrations/{org}/{provider}
       -> Get specific integration
       -> Returns: IntegrationInfo

PUT    /api/v1/integrations/{org}/{provider}
       -> Update integration config
       -> Body: { config }
       -> Returns: { success }

DELETE /api/v1/integrations/{org}/{provider}
       -> Remove integration
       -> Deletes credentials and integration record
       -> Returns: { success }

POST   /api/v1/integrations/{org}/{provider}/rotate
       -> Rotate credentials
       -> Body: { new_credentials }
       -> Returns: { success }
```

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| Integration router | Pipeline | routers/integrations.py |
| KMS encryption | Pipeline | services/kms_service.py |
| GCP validation | Pipeline | validators/gcp_validator.py |
| OpenAI validation | Pipeline | validators/openai_validator.py |
| Anthropic validation | Pipeline | validators/anthropic_validator.py |
| Integration actions | Frontend | actions/integrations.ts |
| Cloud integrations page | Frontend | app/[orgSlug]/settings/integrations/cloud/page.tsx |
| LLM integrations page | Frontend | app/[orgSlug]/settings/integrations/llm/page.tsx |
| Subscription providers | Frontend | app/[orgSlug]/settings/integrations/subscriptions/page.tsx |

### NOT IMPLEMENTED

| Component | Notes | Priority |
|-----------|-------|----------|
| AWS integration | Future cloud provider | P2 |
| Azure integration | Future cloud provider | P2 |
| OAuth integrations | For SaaS providers | P3 |
| Credential rotation alerts | Notify before expiry | P3 |
| Bulk credential import | Import multiple | P4 |

---

## Security

### Credential Encryption

**File:** `data-pipeline-service/src/services/kms_service.py`

```python
class KMSService:
    def encrypt(self, plaintext: bytes) -> tuple[bytes, str]:
        """Encrypt using GCP KMS, return ciphertext and key version"""

    def decrypt(self, ciphertext: bytes, key_version: str) -> bytes:
        """Decrypt using specific key version"""

    def rotate_key(self) -> str:
        """Create new key version, return version ID"""
```

### Security Measures

| Measure | Implementation |
|---------|----------------|
| Encryption at rest | GCP KMS AES-256 |
| Key rotation | Automatic via KMS |
| Fingerprint logging | SHA256 hash only |
| No plaintext storage | Only encrypted blobs |
| Audit logging | All credential operations |

---

## Error Handling

| Scenario | Error Message |
|----------|---------------|
| Invalid API key format | "Invalid API key format for {provider}" |
| API key rejected | "{provider} API key is invalid or expired" |
| Missing permissions | "Service account lacks required permissions" |
| Rate limited | "{provider} rate limit exceeded during validation" |
| Provider unreachable | "Unable to connect to {provider}" |
| KMS error | "Credential encryption failed" |
| Duplicate integration | "Integration already exists for {provider}" |

---

## Test Files

| File | Purpose |
|------|---------|
| `data-pipeline-service/tests/test_02_gcp_integration.py` | GCP integration tests |
| `data-pipeline-service/tests/test_04_llm_integration.py` | LLM integration tests |
| `fronted-system/tests/06-cloud-integrations.test.ts` | Cloud integration tests |
| `fronted-system/tests/07-llm-integrations.test.ts` | LLM integration tests |

---

## File References

### Pipeline Engine Files

| File | Purpose |
|------|---------|
| `data-pipeline-service/src/app/routers/integrations.py` | Integration CRUD endpoints |
| `data-pipeline-service/src/services/kms_service.py` | KMS encryption service |
| `data-pipeline-service/src/validators/gcp_validator.py` | GCP validation logic |
| `data-pipeline-service/src/validators/openai_validator.py` | OpenAI validation |
| `data-pipeline-service/src/validators/anthropic_validator.py` | Anthropic validation |
| `data-pipeline-service/configs/system/providers.yml` | Provider registry |

### API Service Files

| File | Purpose |
|------|---------|
| `api-service/configs/setup/bootstrap/schemas/org_credentials.json` | Credentials schema |
| `api-service/configs/setup/bootstrap/schemas/org_integrations.json` | Integrations schema |

### Frontend Files

| File | Purpose |
|------|---------|
| `fronted-system/actions/integrations.ts` | Integration server actions |
| `fronted-system/app/[orgSlug]/settings/integrations/page.tsx` | Integration overview |
| `fronted-system/app/[orgSlug]/settings/integrations/cloud/page.tsx` | Cloud providers |
| `fronted-system/app/[orgSlug]/settings/integrations/llm/page.tsx` | LLM providers |
| `fronted-system/app/[orgSlug]/settings/integrations/subscriptions/page.tsx` | SaaS providers |

---

**Version**: 1.5 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
