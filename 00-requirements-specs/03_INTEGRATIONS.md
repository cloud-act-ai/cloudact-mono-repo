# Integrations

**v1.8** | 2026-02-05

> Provider credential management. Related: [Cloud Costs](02_CLOUD_COSTS.md) | [GenAI Costs](02_GENAI_COSTS.md)

---

## Integration Setup Workflow

```
1. User uploads credentials → Frontend integration page
2. API validates format → Required fields check per provider
3. KMS encryption → Credential stored as encrypted blob in BigQuery
4. Connection test → Validate access to provider resources
5. Status: active → Ready for pipeline runs
6. Pipeline runtime → Decrypt (5-min TTL) → Authenticate → Extract data
```

---

## Supported Providers

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
| GenAI | Azure OpenAI | Service Principal |
| GenAI | AWS Bedrock | IAM Role |
| GenAI | GCP Vertex | Service Account |
| SaaS | Various | Manual entry |

---

## API Endpoints (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/integrations/{org}/{provider}/setup` | Encrypt + store credential |
| POST | `/integrations/{org}/{provider}/validate` | Test connection |
| GET | `/integrations/{org}` | List all integrations |
| DELETE | `/integrations/{org}/{provider}` | Remove integration |
| PUT | `/integrations/{org}/{provider}/metadata` | Update metadata |

---

## Security Standards

| Standard | Implementation |
|----------|----------------|
| Encryption | GCP KMS AES-256 — credentials encrypted before storage |
| Storage | Encrypted blob only in `org_integration_credentials` table |
| Decryption | On-demand with 5-minute TTL cache |
| Logging | SHA256 fingerprint (first 8 chars) — never log raw credentials |
| Validation | Format + connection test before accepting |
| Provider registry | `configs/system/providers.yml` — centralized provider definitions |

---

## Data Storage

| Table | Purpose |
|-------|---------|
| `org_integration_credentials` | KMS-encrypted credentials + status + metadata |
| `configs/system/providers.yml` | Provider registry (types, required fields, rate limits) |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/integrations.py` | CRUD endpoints |
| `02-api-service/src/lib/integrations/metadata_schemas.py` | Metadata validation per provider |
| `03-data-pipeline-service/configs/system/providers.yml` | Provider registry |
| `01-fronted-system/actions/integrations.ts` | Frontend server actions |
