---
name: provider-mgmt
description: |
  Provider lifecycle management for CloudAct. Add, configure, and manage cloud/LLM/SaaS providers.
  Use when: adding new providers to the registry, configuring provider settings, managing provider credentials,
  or understanding the provider architecture.
---

# Provider Management

## Overview
CloudAct uses a configuration-driven provider registry for cloud, LLM, and SaaS providers.

## Key Locations
- **Provider Registry:** `03-data-pipeline-service/configs/system/providers.yml`
- **Dataset Types:** `03-data-pipeline-service/configs/system/dataset_types.yml`
- **Provider Processors:** `03-data-pipeline-service/src/core/processors/`
- **Integration Router:** `02-api-service/src/app/routers/integrations.py`

## Provider Types
| Type | Examples | Credential Type |
|------|----------|-----------------|
| cloud | GCP, AWS, Azure | service_account, access_key |
| llm | OpenAI, Anthropic, Gemini, DeepSeek | api_key |
| saas | Custom subscriptions | varies |

## Provider Registry Structure
```yaml
# configs/system/providers.yml
provider_name:
  type: cloud|llm|saas
  credential_type: api_key|service_account|oauth|access_key
  display_name: "Human Readable Name"
  api_base_url: "https://api.example.com"
  auth_header: "Authorization"
  auth_prefix: "Bearer"
  validation_endpoint: "/validate"
  rate_limit:
    requests_per_minute: 60
    retry_after_seconds: 60
  data_tables:
    usage: "provider_usage"
    costs: "provider_costs"
  seed_path: "configs/genai/seed/provider/"
```

## Current Providers
| Provider | Type | Status | Pipelines |
|----------|------|--------|-----------|
| openai | llm | Active | usage, cost, subscriptions |
| anthropic | llm | Active | usage, cost |
| gcp | cloud | Active | bq_etl, api_extractor |
| gemini | llm | Active | usage, cost |
| deepseek | llm | Active | usage, cost |

## Instructions

### 1. Add New LLM Provider
```yaml
# Step 1: Add to configs/system/providers.yml
new_llm:
  type: llm
  credential_type: api_key
  display_name: "New LLM Provider"
  api_base_url: "https://api.newllm.com/v1"
  auth_header: "Authorization"
  auth_prefix: "Bearer"
  validation_endpoint: "/models"
  rate_limit:
    requests_per_minute: 60
    retry_after_seconds: 60
  data_tables:
    usage: "new_llm_usage"
    costs: "new_llm_costs"
```

### 2. Create Provider Processor
```python
# src/core/processors/new_llm/processor.py
from typing import Dict, Any, List
from src.core.processors.protocol import ProcessorProtocol

class NewLLMProcessor(ProcessorProtocol):
    """Processor for New LLM provider."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.api_base = "https://api.newllm.com/v1"

    async def extract_usage(
        self,
        org_slug: str,
        start_date: str,
        end_date: str
    ) -> List[Dict]:
        """Extract usage data from New LLM API."""
        # Implementation
        pass

    async def calculate_costs(
        self,
        usage_data: List[Dict],
        pricing: Dict[str, float]
    ) -> List[Dict]:
        """Calculate costs from usage data."""
        # Implementation
        pass
```

### 3. Register Processor
```python
# src/core/processors/__init__.py
from src.core.processors.new_llm.processor import NewLLMProcessor

PROCESSOR_REGISTRY = {
    "openai": OpenAIProcessor,
    "anthropic": AnthropicProcessor,
    "new_llm": NewLLMProcessor,  # Add new processor
}
```

### 4. Create Pipeline Configs
```yaml
# configs/new_llm/usage/extract.yml
pipeline_id: "{org_slug}-new_llm-usage-extract"
name: "New LLM Usage Extraction"
version: "1.0.0"
timeout_minutes: 30
schedule:
  type: daily
  time: "02:00"
steps:
  - step_id: "extract_usage"
    ps_type: "new_llm.usage"
    timeout_minutes: 15
    config:
      destination_table: "new_llm_usage"
requires_auth: true
tags: [new_llm, usage, daily]
category: "usage"
```

### 5. Add Integration Endpoint
```python
# 02-api-service/src/app/routers/integrations.py
@router.post("/{org_slug}/new_llm/setup")
async def setup_new_llm(
    org_slug: str,
    request: NewLLMSetupRequest,
    api_key: str = Depends(verify_org_key)
):
    """Setup New LLM integration."""
    # Validate API key
    is_valid = await validate_new_llm_key(request.api_key)
    if not is_valid:
        raise HTTPException(400, "Invalid API key")

    # Encrypt and store
    encrypted = kms.encrypt(request.api_key)
    await store_credentials(org_slug, "new_llm", encrypted)

    return {"status": "configured"}
```

### 6. Add Frontend Integration Page
```tsx
// 01-fronted-system/app/[orgSlug]/integrations/llm/new-llm/page.tsx
export default function NewLLMPage({ params }: PageProps) {
  return (
    <IntegrationSetup
      provider="new_llm"
      displayName="New LLM"
      fields={[
        { name: "api_key", label: "API Key", type: "password" }
      ]}
    />
  )
}
```

### 7. Add Pricing Data
```csv
# configs/genai/seed/new_llm/pricing.csv
model_id,model_name,input_price_per_million,output_price_per_million,effective_date
new-llm-base,New LLM Base,1.00,2.00,2024-01-01
new-llm-pro,New LLM Pro,5.00,15.00,2024-01-01
```

## Provider Validation
```python
# Validate provider exists
async def validate_provider(provider: str) -> bool:
    providers = load_providers()
    return provider in providers

# Validate credentials
async def validate_credentials(provider: str, credentials: dict) -> bool:
    provider_config = load_providers()[provider]
    endpoint = provider_config["validation_endpoint"]
    # Make validation request
    ...
```

## Provider Lifecycle
```
1. Add to providers.yml       → Registry entry
2. Create processor          → Business logic
3. Create pipeline configs   → Execution templates
4. Add integration endpoint  → API setup
5. Add frontend page         → UI setup
6. Add seed data             → Pricing/defaults
7. Add tests                 → Validation
```

## Validation Checklist
- [ ] Provider added to providers.yml
- [ ] All required fields present
- [ ] Processor created and registered
- [ ] Pipeline configs created
- [ ] Integration endpoint added
- [ ] Frontend page created
- [ ] Pricing data seeded
- [ ] Tests written

## Common Issues
| Issue | Solution |
|-------|----------|
| Provider not found | Check providers.yml spelling |
| Processor not registered | Add to PROCESSOR_REGISTRY |
| Pipeline 404 | Create pipeline configs |
| Auth failure | Check credential encryption |

## Example Prompts

```
# Adding Providers
"Add a new LLM provider called Mistral"
"Register AWS as a cloud provider"
"Setup a new SaaS provider"

# Configuration
"Configure rate limits for new provider"
"Add validation endpoint for provider"
"Setup seed data for pricing"

# Provider Lifecycle
"What steps to add a complete provider?"
"Create processor for new provider"
"Add pipeline configs for provider"

# Troubleshooting
"Provider not found in registry"
"Processor not registered error"
"Validation endpoint failing"

# Existing Providers
"List all configured providers"
"Show provider configuration for OpenAI"
```

## Environments

| Environment | Provider Registry | Pipeline Configs | API URL |
|-------------|------------------|-----------------|---------|
| local | `configs/system/providers.yml` | `configs/{provider}/` | `http://localhost:8001` |
| stage | Same files (deployed via Cloud Build) | Same files | Cloud Run URL |
| prod | Same files (deployed via Cloud Build) | Same files | `https://pipeline.cloudact.ai` |

**Provider configs are environment-agnostic.** The same YAML files are used across all environments. Environment-specific behavior comes from the API service (credentials, dataset suffixes).

## Testing

### Verify Provider Registry
```bash
cd 03-data-pipeline-service
python3 -c "
import yaml
with open('configs/system/providers.yml') as f:
    providers = yaml.safe_load(f)
    for p in providers.get('providers', []):
        print(f\"{p['id']}: {p['name']} ({p['type']})\")
"
```

### Verify Provider Pipelines Exist
```bash
# List all pipeline configs per provider
ls configs/gcp/cost/
ls configs/aws/cost/
ls configs/azure/cost/
ls configs/oci/cost/
ls configs/openai/
ls configs/anthropic/
ls configs/subscription/costs/
```

### Provider Sync Test
```bash
# Sync procedures (includes all provider-specific procedures)
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: {root_key}" -d '{"force": true}'
# Expected: All procedures synced to BigQuery
```

## 5 Implementation Pillars

| Pillar | How Provider Management Handles It |
|--------|-------------------------------|
| **i18n** | Provider names are display strings (Unicode-safe), pricing varies by region/currency |
| **Enterprise** | Provider registry with whitelist validation, credential encryption, 11+ providers supported |
| **Cross-Service** | Frontend settings -> API (8000) stores credentials -> Pipeline (8001) uses for ingestion -> Chat (8002) BYOK |
| **Multi-Tenancy** | `org_integration_credentials` per org, `encrypted_value` with KMS, org-scoped provider count enforcement (quota) |
| **Reusability** | Provider registry pattern, shared credential encryption/decryption, config-driven pipeline definitions |

## Related Skills
- `integration-setup` - Configure integrations
- `pipeline-ops` - Run provider pipelines
- `config-validator` - Validate configs
- `genai-costs` - GenAI provider cost pipelines
