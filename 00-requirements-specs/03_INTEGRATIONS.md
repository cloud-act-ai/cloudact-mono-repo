# Integrations

**Status**: IMPLEMENTED (v1.7) | **Updated**: 2026-01-15

> Provider credential management. Related: [Cloud Costs](02_CLOUD_COSTS.md) | [GenAI Costs](02_GENAI_COSTS.md)

---

## Supported Providers

| Category | Provider | Credential Type | Status |
|----------|----------|-----------------|--------|
| Cloud | GCP | Service Account JSON | ✓ |
| Cloud | AWS (IAM) | IAM Role ARN | ✓ |
| Cloud | AWS (Keys) | Access Keys | ✓ |
| Cloud | Azure | Service Principal JSON | ✓ |
| Cloud | OCI | API Key | ✓ |
| GenAI | OpenAI | API Key (`sk-*`) | ✓ |
| GenAI | Anthropic | API Key (`sk-ant-*`) | ✓ |
| GenAI | Gemini | API Key | ✓ |
| GenAI | Azure OpenAI | Service Principal | ✓ |
| GenAI | AWS Bedrock | IAM Role | ✓ |
| GenAI | GCP Vertex | Service Account | ✓ |
| SaaS | Various | Manual entry | ✓ |

---

## Data Storage

| Table | Purpose |
|-------|---------|
| `org_integration_credentials` | KMS-encrypted credentials + status |
| `configs/system/providers.yml` | Provider registry |

---

## API Endpoints

```bash
POST   /api/v1/integrations/{org}/{provider}/setup      # Encrypt + store
POST   /api/v1/integrations/{org}/{provider}/validate   # Test connection
GET    /api/v1/integrations/{org}                       # List all
DELETE /api/v1/integrations/{org}/{provider}            # Remove
```

---

## Security

| Measure | Implementation |
|---------|----------------|
| Encryption | GCP KMS AES-256 |
| Storage | Encrypted blob only |
| Logging | SHA256 fingerprint (first 8 chars) |

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/integrations.py` | CRUD endpoints |
| `03-data-pipeline-service/configs/system/providers.yml` | Provider registry |
| `01-fronted-system/actions/integrations.ts` | Frontend actions |

---
**v1.7** | 2026-01-15
