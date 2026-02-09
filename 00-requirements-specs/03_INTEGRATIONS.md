# Integrations

**v1.9** | 2026-02-08

> Provider credential management. Related: [Cloud Costs](02_CLOUD_COSTS.md) | [GenAI Costs](02_GENAI_COSTS.md)

---

## Integration Setup Workflow

```
1. User uploads credentials → Frontend integration page
2. API validates format → Required fields check per provider
3. KMS encryption → AES-256 via GCP Cloud KMS → Encrypted blob stored in BigQuery
4. Connection test → Validate access via test API call to provider
5. Validation status set → VALID / INVALID / PENDING / EXPIRED
6. Pipeline runtime → Decrypt (5-min TTL) → Authenticate → Extract data
```

---

## Supported Providers (11+)

| Category | Provider | Credential Type |
|----------|----------|-----------------|
| Cloud | GCP | Service Account JSON |
| Cloud | AWS (IAM) | IAM Role ARN |
| Cloud | AWS (Keys) | Access Key + Secret |
| Cloud | Azure | Service Principal JSON |
| Cloud | OCI | API Key |
| GenAI | OpenAI | API Key (`sk-*`) |
| GenAI | Anthropic | API Key (`sk-ant-*`) |
| GenAI | Gemini | API Key |
| GenAI | DeepSeek | API Key |
| SaaS | Canva | Manual entry |
| SaaS | ChatGPT Plus | Manual entry |
| SaaS | Slack | Manual entry |

### Provider Configuration

Single source of truth: `configs/system/providers.yml` — defines types, required fields, rate limits, and validation rules for all providers.

---

## Frontend Integration Pages

| Route | Purpose |
|-------|---------|
| `/settings/integrations/cloud` | Cloud provider credential management |
| `/integrations/genai/openai` | OpenAI API key setup |
| `/integrations/genai/anthropic` | Anthropic API key setup |
| `/integrations/genai/gemini` | Gemini API key setup |
| `/integrations/genai/deepseek` | DeepSeek API key setup |
| `/integrations/gcp` | GCP service account setup |
| `/integrations/subscriptions` | SaaS subscription management |

---

## Credential Validation Flow

```
Upload credential → Encrypt (KMS AES-256) → Store → Test API call → Set validation_status
```

| Status | Meaning |
|--------|---------|
| `VALID` | Credential tested and working |
| `INVALID` | Credential tested and failed |
| `PENDING` | Credential stored, not yet tested |
| `EXPIRED` | Credential previously valid, now expired |

---

## API Endpoints (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/integrations/{org}/{provider}/setup` | Encrypt + store credential |
| POST | `/integrations/{org}/{provider}/validate` | Test connection + set validation_status |
| GET | `/integrations/{org}` | List all integrations |
| GET | `/integrations/{org}/{provider}` | Get specific credential metadata |
| PUT | `/integrations/{org}/{provider}` | Update credential |
| DELETE | `/integrations/{org}/{provider}` | Remove integration |

---

## Security Standards

| Standard | Implementation |
|----------|----------------|
| Encryption | GCP KMS AES-256 -- credentials encrypted before storage |
| Storage | Encrypted blob only in `org_integration_credentials` table |
| Decryption | On-demand with 5-minute TTL cache for decrypted values |
| Logging | SHA256 fingerprint (first 8 chars) -- never log raw credentials |
| Validation | Format check + connection test API call before accepting |
| Provider registry | `configs/system/providers.yml` -- centralized provider definitions |

---

## Data Storage

| Table | Purpose |
|-------|---------|
| `org_integration_credentials` | KMS-encrypted credentials + validation_status + metadata |
| `configs/system/providers.yml` | Provider registry (types, required fields, rate limits) |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/integrations.py` | CRUD endpoints |
| `02-api-service/src/lib/integrations/metadata_schemas.py` | Metadata validation per provider |
| `03-data-pipeline-service/configs/system/providers.yml` | Provider registry (single source of truth) |
| `01-fronted-system/actions/integrations.ts` | Frontend server actions |
