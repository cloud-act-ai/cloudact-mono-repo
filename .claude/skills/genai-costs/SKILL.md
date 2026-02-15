# /genai-costs - GenAI Cost Pipeline Skill

## Purpose
Manage GenAI cost pipelines, pricing overrides, and usage analysis for CloudAct. Supports 3 parallel flows (PAYG, Commitment, Infrastructure) across 6 providers.

## Quick Reference

```bash
# Get pricing
curl -X GET "http://localhost:8000/api/v1/genai/{org}/pricing" -H "X-API-Key: $KEY"

# Get costs
curl -X GET "http://localhost:8000/api/v1/genai/{org}/costs?start_date=2025-01-01&end_date=2026-12-31" -H "X-API-Key: $KEY"

# Run pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/genai/payg/openai" -H "X-API-Key: $KEY"
```

## Tables (12 per org)

### PAYG Flow (Token-based)
| Table | Purpose | Partition | Clustering |
|-------|---------|-----------|------------|
| `genai_payg_pricing` | Token pricing with overrides | - | provider, model |
| `genai_payg_usage_raw` | Daily token usage | usage_date | provider, model |
| `genai_payg_costs_daily` | Daily token costs | cost_date | provider, hierarchy_entity_id |

### Commitment Flow (PTU/GSU)
| Table | Purpose | Partition | Clustering |
|-------|---------|-----------|------------|
| `genai_commitment_pricing` | PTU/GSU pricing | - | provider, commitment_type |
| `genai_commitment_usage_raw` | Daily PTU/GSU usage | usage_date | provider, commitment_id |
| `genai_commitment_costs_daily` | Daily commitment costs | cost_date | provider, hierarchy_entity_id |

### Infrastructure Flow (GPU/TPU)
| Table | Purpose | Partition | Clustering |
|-------|---------|-----------|------------|
| `genai_infrastructure_pricing` | GPU/TPU hourly rates | - | provider, instance_type |
| `genai_infrastructure_usage_raw` | Daily GPU/TPU usage | usage_date | provider, instance_type |
| `genai_infrastructure_costs_daily` | Daily infrastructure costs | cost_date | provider, hierarchy_entity_id |

### Unified Tables
| Table | Purpose | Partition | Clustering |
|-------|---------|-----------|------------|
| `genai_usage_daily_unified` | All usage consolidated | usage_date | cost_type, provider |
| `genai_costs_daily_unified` | All costs consolidated | cost_date | cost_type, provider |
| `cost_data_standard_1_3` | FOCUS 1.3 (existing) | ChargePeriodStart | SubAccountId |

## Providers

| Provider | PAYG | Commitment | Infrastructure |
|----------|------|------------|----------------|
| OpenAI | ✅ | - | - |
| Anthropic | ✅ | - | - |
| Gemini | ✅ | - | - |
| Azure OpenAI | ✅ | ✅ (PTU) | - |
| AWS Bedrock | ✅ | ✅ (PT) | - |
| GCP Vertex | ✅ | ✅ (GSU) | ✅ |

## Commands

### Usage Analysis
```bash
# Get usage summary
/genai-costs usage {org_slug} --provider openai --date 2026-01-15

# Get usage by team
/genai-costs usage {org_slug} --team TEAM-BACKEND --start 2025-01-01 --end 2026-12-31
```

### Cost Analysis
```bash
# Get cost summary
/genai-costs costs {org_slug} --date 2026-01-15

# Get costs by flow
/genai-costs costs {org_slug} --flow payg --start 2025-01-01 --end 2026-12-31

# Get cost breakdown
/genai-costs costs {org_slug} --breakdown model
```

### Pricing Management
```bash
# List all pricing
/genai-costs pricing list {org_slug}

# List by flow
/genai-costs pricing list {org_slug} --flow payg

# Set override
/genai-costs pricing override {org_slug} --flow payg --model gpt-4o --input 2.00 --output 8.00
```

### Pipeline Execution
```bash
# Run specific provider pipeline
/genai-costs run {org_slug} --provider openai

# Run consolidation
/genai-costs run {org_slug} --consolidate

# Run full daily pipeline
/genai-costs run {org_slug} --all --date 2026-01-15
```

## Data Flow
```
Provider APIs → Usage Raw → Costs Daily → Unified → FOCUS 1.3
     ↓              ↓            ↓           ↓          ↓
  Extract       Store       Calculate    Merge    Standardize
```

## API Endpoints
- `GET /api/v1/genai/{org}/pricing` - List all pricing
- `GET /api/v1/genai/{org}/pricing/{flow}` - Pricing by flow
- `PUT /api/v1/genai/{org}/pricing/{flow}/{id}/override` - Set override
- `GET /api/v1/genai/{org}/usage` - Usage data
- `GET /api/v1/genai/{org}/costs` - Cost data
- `GET /api/v1/genai/{org}/costs/summary` - Cost summary

## Pipeline URLs
- PAYG: `POST /api/v1/pipelines/run/{org}/genai/payg/{provider}`
- Commitment: `POST /api/v1/pipelines/run/{org}/genai/commitment/{provider}`
- Infrastructure: `POST /api/v1/pipelines/run/{org}/genai/infrastructure/{provider}`
- Consolidate: `POST /api/v1/pipelines/run/{org}/genai/unified/consolidate`

## Key Files

### Frontend
- `01-fronted-system/lib/data/genai/*.ts` - Static pricing data

### API Service
- `02-api-service/configs/setup/organizations/onboarding/schemas/genai_*.json` - Table schemas
- `02-api-service/src/app/routers/genai.py` - API router

### Pipeline Service
- `03-data-pipeline-service/src/core/processors/genai/` - Processors
- `03-data-pipeline-service/configs/genai/` - Pipeline YAMLs
- `03-data-pipeline-service/configs/system/procedures/genai/` - Stored procedures

## Schedule
| Pipeline | Schedule | Description |
|----------|----------|-------------|
| PAYG providers | 2:00-2:45 AM UTC | Extract and calculate PAYG costs |
| Commitment | 3:00-3:30 AM UTC | Extract and calculate commitment costs |
| Infrastructure | 4:00 AM UTC | Extract and calculate GPU costs |
| Consolidation | 6:00 AM UTC | Merge all flows + FOCUS conversion |

## Pipeline Processor Types (ps_type)

| ps_type | Purpose |
|---------|---------|
| `genai.payg_usage` | Extract PAYG token usage from provider APIs |
| `genai.payg_cost` | Calculate PAYG costs from usage + pricing |
| `genai.commitment_usage` | Extract PTU/GSU commitment usage |
| `genai.commitment_cost` | Calculate commitment costs |
| `genai.infrastructure_usage` | Extract GPU/TPU infrastructure usage |
| `genai.infrastructure_cost` | Calculate infrastructure costs |
| `genai.unified_consolidator` | Merge all flows into unified tables |
| `genai.focus_converter` | Convert to FOCUS 1.3 format |

## cURL Examples

```bash
# List all pricing
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/pricing" \
  -H "X-API-Key: $ORG_API_KEY"

# Get PAYG pricing for OpenAI
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/pricing/payg?provider=openai" \
  -H "X-API-Key: $ORG_API_KEY"

# Set pricing override (enterprise discount)
curl -X PUT "http://localhost:8000/api/v1/genai/acme_corp/pricing/payg/pricing-123/override" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"override_value": 2.50, "notes": "Enterprise discount", "effective_from": "2025-01-01"}'

# Get usage data
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/usage?start_date=2025-01-01&end_date=2026-12-31&provider=openai" \
  -H "X-API-Key: $ORG_API_KEY"

# Get cost summary with model breakdown
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/costs/summary?start_date=2025-01-01&end_date=2026-12-31&include_models=true" \
  -H "X-API-Key: $ORG_API_KEY"

# Run OpenAI PAYG pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/acme_corp/genai/payg/openai" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"date": "2025-12-25"}'

# Run consolidation pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/acme_corp/genai/unified/consolidate" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"date": "2025-12-25"}'
```

## Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | DATE | Start of date range (required) |
| `end_date` | DATE | End of date range (required) |
| `flow` | STRING | payg, commitment, infrastructure |
| `provider` | STRING | openai, anthropic, gemini, azure_openai, aws_bedrock, gcp_vertex |
| `team_id` | STRING | Filter by team for chargeback |
| `limit` | INT | Max records (default 1000, max 10000) |
| `include_models` | BOOL | Include model breakdown in summary |

## Troubleshooting

### No usage data
1. Check credentials: `SELECT * FROM organizations.org_integration_credentials WHERE provider = 'openai'`
2. Validate credentials: `/integrations/{org}/openai/validate`
3. Check pipeline logs: `SELECT * FROM organizations.org_meta_pipeline_runs WHERE pipeline_id LIKE '%genai%'`

### Cost mismatch
1. Verify pricing table: `SELECT * FROM {org}_prod.genai_payg_pricing WHERE provider = 'openai'`
2. Check for overrides: `SELECT * FROM {org}_prod.genai_payg_pricing WHERE is_override = true`
3. Compare with provider invoice

## Environments

| Environment | Pipeline URL | BigQuery Project | Dataset Suffix |
|-------------|-------------|------------------|----------------|
| local | `http://localhost:8001` | cloudact-testing-1 | `_local` |
| stage | Cloud Run URL | cloudact-testing-1 | `_stage` |
| prod | `https://pipeline.cloudact.ai` | cloudact-prod | `_prod` |

```bash
# Run GenAI pipeline (local)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/genai/payg/openai" \
  -H "x-api-key: {org_api_key}"

# Run unified consolidate (local)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/genai/unified/consolidate" \
  -H "x-api-key: {org_api_key}"
```

## Testing

### Verify GenAI Data
```bash
# Usage raw data
bq query --nouse_legacy_sql \
  "SELECT x_genai_provider, COUNT(*) as rows FROM \`cloudact-testing-1.{org}_local.genai_payg_usage_raw\` GROUP BY 1"

# Costs daily
bq query --nouse_legacy_sql \
  "SELECT x_genai_provider, SUM(total_cost) as total FROM \`cloudact-testing-1.{org}_local.genai_payg_costs_daily\` GROUP BY 1"

# FOCUS output
bq query --nouse_legacy_sql \
  "SELECT ServiceProviderName, SUM(BilledCost) as total FROM \`cloudact-testing-1.{org}_local.cost_data_standard_1_3\` WHERE ServiceCategory='genai' GROUP BY 1"
```

### Verify Pricing
```bash
bq query --nouse_legacy_sql \
  "SELECT provider, COUNT(*) as models FROM \`cloudact-testing-1.{org}_local.genai_payg_pricing\` GROUP BY 1"
# Expected: openai, anthropic, gemini (+ others) with model counts
```

### Pipeline Run Test
```bash
# Check pipeline status
curl -s "http://localhost:8000/api/v1/pipeline-logs/{org}?limit=5" \
  -H "X-API-Key: {key}" | python3 -m json.tool
```

## Source Specifications

Requirements consolidated from:
- `02_GENAI_COSTS.md` - GenAI cost pipelines

## 5 Implementation Pillars

| Pillar | How GenAI Costs Handles It |
|--------|-------------------------------|
| **i18n** | GenAI costs stored in `BillingCurrency` (FOCUS 1.3), display with `formatCost()`, pricing per-1M tokens formatted via `Intl.NumberFormat` |
| **Enterprise** | Model pricing overrides per org (`is_override` flag), usage tracking across 6 providers, cost allocation by model/provider/team via hierarchy |
| **Cross-Service** | Pipeline (8001) ingests PAYG/commitment/infrastructure data → BigQuery unified tables → API (8000) reads via cost endpoints → Frontend + Chat (8002) display |
| **Multi-Tenancy** | `{org_slug}_prod` datasets for all 12 GenAI tables, `x_org_slug` lineage in every row, org-scoped pricing tables with per-org overrides |
| **Reusability** | Shared FOCUS 1.3 schema (`cost_data_standard_1_3`), `PricingTableBase` component pattern, cost formatters from `lib/costs/`, unified consolidation procedures |

## Implementation Status

| Phase | Status |
|-------|--------|
| Phase 1: Foundation (schemas, frontend) | ✅ Complete |
| Phase 2: Pipeline Processors (8 files) | ✅ Complete |
| Phase 3: Pipeline Configs (9 YAMLs) | ✅ Complete |
| Phase 4: Documentation | ✅ Complete |
| Phase 5: Testing & Deployment | 🔄 Pending |
| Phase 6: Analytics (Future) | ⏳ Future |
