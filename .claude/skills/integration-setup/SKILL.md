---
name: integration-setup
description: |
  Integration setup for CloudAct providers. Configure cloud providers, LLM APIs, and SaaS subscriptions.
  Use when: setting up new integrations, configuring API credentials, connecting cloud providers (GCP, AWS, Azure),
  LLM providers (OpenAI, Anthropic, Gemini, DeepSeek), or managing integration credentials.
---

# Integration Setup

## Overview
CloudAct integrates with multiple provider types for cost tracking and usage analysis.

## Environments

| Environment | API Service Base URL |
|-------------|---------------------|
| Local | `http://localhost:8000` |
| Test | Cloud Run URL (get via gcloud) |
| Stage | Cloud Run URL (get via gcloud) |
| Prod | Cloud Run URL or `https://api.cloudact.ai` |

> **Note:** Get actual Cloud Run URLs: `gcloud run services describe cloudact-api-service-{env} --region=us-central1 --format="value(status.url)"`

## Key Locations
- **Provider Registry:** `03-data-pipeline-service/configs/system/providers.yml`
- **Integration Router:** `02-api-service/src/app/routers/integrations.py`
- **Credential Encryption:** `02-api-service/src/core/security/kms_encryption.py`
- **Frontend Pages:** `01-fronted-system/app/[orgSlug]/integrations/`

## Provider Categories
```
Integrations
├── Cloud Providers
│   ├── GCP (BigQuery billing export)
│   ├── AWS (Cost Explorer API)
│   └── Azure (Cost Management API)
├── LLM Providers
│   ├── OpenAI (Usage API)
│   ├── Anthropic (Usage API)
│   ├── Google Gemini (Usage API)
│   └── DeepSeek (Usage API)
└── SaaS Subscriptions
    ├── Custom (manual entry)
    └── Template-based (from catalog)
```

## Provider Configuration Structure
```yaml
# From configs/system/providers.yml
openai:
  type: llm
  credential_type: api_key
  display_name: "OpenAI"
  api_base_url: "https://api.openai.com/v1"
  auth_header: "Authorization"
  auth_prefix: "Bearer"
  validation_endpoint: "/models"
  rate_limit:
    requests_per_minute: 60
    retry_after_seconds: 60
  data_tables:
    usage: "openai_usage"
    costs: "openai_costs"
  seed_path: "configs/genai/seed/openai/"
```

## Instructions

### 1. Setup Cloud Provider (GCP)
```bash
# API call to setup GCP integration
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/gcp/setup" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "your-gcp-project",
    "service_account_key": "{base64_encoded_key}",
    "billing_dataset": "billing_export"
  }'
```

### 2. Setup LLM Provider (OpenAI)
```bash
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/openai/setup" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-...",
    "organization_id": "org-..."
  }'
```

### 3. Setup LLM Provider (Anthropic)
```bash
curl -X POST "http://localhost:8000/api/v1/integrations/{org_slug}/anthropic/setup" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-ant-..."
  }'
```

### 4. Verify Integration
```bash
# Check integration status
curl -s "http://localhost:8000/api/v1/integrations/{org_slug}/{provider}/status" \
  -H "X-API-Key: {org_api_key}"
```

### 5. List All Integrations
```bash
curl -s "http://localhost:8000/api/v1/integrations/{org_slug}" \
  -H "X-API-Key: {org_api_key}"
```

## Credential Security
All credentials are encrypted using Google Cloud KMS:
```python
# Encryption flow
from src.core.security.kms_encryption import KMSEncryption

kms = KMSEncryption()
encrypted = kms.encrypt(
    plaintext=api_key,
    key_name="projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}"
)
# Stored in organizations.integration_credentials
```

## Frontend Integration Pages
| Route | Purpose |
|-------|---------|
| `/[orgSlug]/integrations` | Integration dashboard |
| `/[orgSlug]/integrations/cloud-providers` | Cloud provider list |
| `/[orgSlug]/integrations/cloud-providers/gcp` | GCP setup |
| `/[orgSlug]/integrations/llm` | LLM provider list |
| `/[orgSlug]/integrations/llm/openai` | OpenAI setup |
| `/[orgSlug]/integrations/llm/anthropic` | Anthropic setup |
| `/[orgSlug]/integrations/llm/gemini` | Gemini setup |
| `/[orgSlug]/integrations/llm/deepseek` | DeepSeek setup |
| `/[orgSlug]/integrations/subscriptions/[provider]` | SaaS subscriptions |

## Adding New Provider
1. Add to `configs/system/providers.yml`
2. Create processor in `src/core/processors/{provider}/`
3. Add integration endpoint in `routers/integrations.py`
4. Create frontend page in `app/[orgSlug]/integrations/`
5. Add pipeline configs in `configs/{provider}/`

## Provider Requirements
| Provider | Required Fields | Validation |
|----------|-----------------|------------|
| GCP | project_id, service_account_key | List datasets API |
| OpenAI | api_key, organization_id (opt) | GET /models |
| Anthropic | api_key | GET /models |
| Gemini | api_key | List models API |
| DeepSeek | api_key | GET /models |

## Validation Checklist
- [ ] Provider exists in `providers.yml`
- [ ] Credentials encrypted before storage
- [ ] Validation endpoint tested
- [ ] Rate limits configured
- [ ] Frontend page created
- [ ] Pipeline configs added

## Common Issues
| Issue | Solution |
|-------|----------|
| Invalid credentials | Check API key format and permissions |
| Rate limited | Reduce request frequency, check limits |
| KMS error | Verify KMS key permissions |
| Provider not found | Add to providers.yml registry |

## Example Prompts

```
# Setting Up
"Setup OpenAI integration for acme_corp"
"Configure GCP billing export integration"
"Add Anthropic API credentials for our org"
"Connect Gemini API to CloudAct"

# Verifying
"Check if our OpenAI integration is working"
"Verify the GCP credentials are valid"
"List all integrations for acme_corp"

# Troubleshooting
"Integration showing 'invalid credentials' error"
"API key validation failed for Anthropic"
"How do I rotate integration credentials?"

# Managing Credentials
"Are our API keys encrypted?"
"Update the OpenAI API key"
```

## Related Skills
- `pipeline-ops` - Run provider pipelines
- `security-audit` - Audit credential security
- `provider-mgmt` - Provider lifecycle management
