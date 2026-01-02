# Integrations

**Status**: IMPLEMENTED (v1.6) | **Updated**: 2026-01-01

> Provider credential management. Related: [Cloud Costs](02_CLOUD_COSTS.md) | [GenAI Costs](02_GENAI_COSTS.md)

---

## Supported Providers

| Category | Provider | Credential Type | Status |
|----------|----------|-----------------|--------|
| Cloud | GCP | Service Account JSON | ✓ |
| Cloud | AWS | IAM Role ARN | Planned |
| Cloud | Azure | Service Principal | Planned |
| LLM | OpenAI | API Key (`sk-*`) | ✓ |
| LLM | Anthropic | API Key (`sk-ant-*`) | ✓ |
| LLM | Gemini | API Key | ✓ |
| SaaS | Various | Manual entry | ✓ |

---

## Integration Lifecycle

```
Not Configured → Setup → Validating → Active
                   │         │
                   │     ┌───┴───┐
                   │     ▼       ▼
              pending  error  disabled  expired
```

---

## Data Storage

| Storage | Table | Purpose |
|---------|-------|---------|
| BigQuery | `organizations.org_integrations` | Status + config |
| BigQuery | `organizations.org_credentials` | KMS-encrypted credentials |
| File | `configs/system/providers.yml` | Provider registry |
| Supabase | `subscription_providers_meta` | SaaS toggles |

---

## Setup Flow

```
1. Upload credentials (Frontend → Pipeline Engine)
2. Encrypt via GCP KMS
3. Store encrypted blob + fingerprint
4. Create integration record (status: pending)
5. Validate connection
6. Update status: active or error
```

---

## API Endpoints

```
POST   /api/v1/integrations/{org}/{provider}/setup      # Upload + encrypt
POST   /api/v1/integrations/{org}/{provider}/validate   # Test connection
GET    /api/v1/integrations/{org}                       # List all
GET    /api/v1/integrations/{org}/{provider}            # Get one
DELETE /api/v1/integrations/{org}/{provider}            # Remove
POST   /api/v1/integrations/{org}/{provider}/rotate     # Rotate credentials
```

---

## Validation Tests

| Provider | Tests |
|----------|-------|
| GCP | BigQuery API access, list datasets, query billing export |
| OpenAI | GET /v1/models, valid key format |
| Anthropic | GET /v1/messages, valid key format |
| Gemini | GET /v1/models |

---

## Security

| Measure | Implementation |
|---------|----------------|
| Encryption at rest | GCP KMS AES-256 |
| Key rotation | Automatic via KMS |
| Fingerprint only | SHA256 hash logged (first 8 chars) |
| No plaintext | Only encrypted blobs stored |

---

## Frontend Pages

| Route | Purpose |
|-------|---------|
| `/{org}/settings/integrations` | Overview |
| `/{org}/settings/integrations/cloud` | Cloud providers |
| `/{org}/settings/integrations/llm` | LLM providers |
| `/{org}/settings/integrations/subscriptions` | SaaS subscriptions |

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/src/app/routers/integrations.py` | CRUD endpoints |
| `03-data-pipeline-service/src/services/kms_service.py` | KMS encryption |
| `03-data-pipeline-service/src/validators/*.py` | Provider validators |
| `03-data-pipeline-service/configs/system/providers.yml` | Provider registry |
| `01-fronted-system/actions/integrations.ts` | Frontend actions |

---

## Error Messages

| Error | Cause |
|-------|-------|
| "Invalid API key format" | Wrong key prefix |
| "API key invalid or expired" | Key rejected by provider |
| "Missing permissions" | Insufficient access |
| "Rate limit exceeded" | Too many validation attempts |
| "Credential encryption failed" | KMS error |

---

**v1.6** | 2026-01-01
