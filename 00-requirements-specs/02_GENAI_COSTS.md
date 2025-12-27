# GenAI Cost Management

## Overview

Comprehensive GenAI cost tracking and management system supporting 3 parallel billing flows across 6 providers with consolidation into unified tables and FOCUS 1.3 compliance.

## Business Requirements

### BR-1: Multi-Provider Support
- Support 6 GenAI providers: OpenAI, Anthropic, Gemini, Azure OpenAI, AWS Bedrock, GCP Vertex
- Track both direct API usage and cloud-hosted models
- Handle provider-specific billing models

### BR-2: Three Cost Flows
1. **PAYG (Pay-As-You-Go)**: Token-based billing for API usage
2. **Commitment**: Reserved capacity (PTU, GSU, Provisioned Throughput)
3. **Infrastructure**: Self-hosted GPU/TPU billing

### BR-3: Cost Allocation
- Assign costs to organizational hierarchy (Department → Project → Team)
- Support chargeback and showback reporting
- Enable cost forecasting and budgeting

### BR-4: Pricing Management
- Support default pricing from provider rate cards
- Allow org-specific pricing overrides
- Track pricing changes with effective dates

### BR-5: Unified Reporting
- Consolidate all GenAI costs into single view
- Convert to FOCUS 1.3 for cross-domain reporting
- Support analytics and trend analysis

## Technical Architecture

### Data Model

```
┌─────────────────────────────────────────────────────────────┐
│                    GenAI Tables (12 per org)                │
├─────────────────────────────────────────────────────────────┤
│  PAYG Flow                                                  │
│  ├── genai_payg_pricing (pricing + overrides)              │
│  ├── genai_payg_usage_raw (daily token usage)              │
│  └── genai_payg_costs_daily (calculated costs)             │
│                                                             │
│  Commitment Flow                                            │
│  ├── genai_commitment_pricing (PTU/GSU rates)              │
│  ├── genai_commitment_usage_raw (unit utilization)         │
│  └── genai_commitment_costs_daily (fixed + overage)        │
│                                                             │
│  Infrastructure Flow                                        │
│  ├── genai_infrastructure_pricing (GPU/TPU rates)          │
│  ├── genai_infrastructure_usage_raw (instance hours)       │
│  └── genai_infrastructure_costs_daily (hourly costs)       │
│                                                             │
│  Unified Tables                                             │
│  ├── genai_usage_daily_unified (all usage merged)          │
│  ├── genai_costs_daily_unified (all costs merged)          │
│  └── cost_data_standard_1_3 (FOCUS 1.3 format)             │
└─────────────────────────────────────────────────────────────┘
```

### Pipeline Architecture

```
Provider APIs    Cloud Monitoring    Billing Exports
     ↓                  ↓                  ↓
┌────────────────────────────────────────────────┐
│              Daily Pipeline Jobs               │
├────────────────────────────────────────────────┤
│  2:00 AM - OpenAI PAYG                        │
│  2:15 AM - Anthropic PAYG                     │
│  2:30 AM - Gemini PAYG                        │
│  2:45 AM - Azure OpenAI PAYG                  │
│  3:00 AM - Azure PTU Commitment               │
│  3:15 AM - AWS Bedrock PT Commitment          │
│  3:30 AM - GCP Vertex GSU Commitment          │
│  4:00 AM - GCP GPU Infrastructure             │
│  6:00 AM - Unified Consolidation + FOCUS      │
└────────────────────────────────────────────────┘
                        ↓
              Dashboard & Analytics
```

## Provider Matrix

| Provider | PAYG | Commitment | Infrastructure | Billing Source |
|----------|------|------------|----------------|----------------|
| OpenAI | ✅ | - | - | Usage API |
| Anthropic | ✅ | - | - | Admin API |
| Gemini | ✅ | - | - | Billing Export |
| Azure OpenAI | ✅ | ✅ PTU | - | Azure Monitor |
| AWS Bedrock | ✅ | ✅ PT | - | CloudWatch |
| GCP Vertex | ✅ | ✅ GSU | ✅ | Cloud Monitoring |

## API Endpoints

### Pricing Management
```bash
# List all pricing
GET /api/v1/genai/{org_slug}/pricing

# List pricing by flow (payg, commitment, infrastructure)
GET /api/v1/genai/{org_slug}/pricing/{flow}

# Set pricing override
PUT /api/v1/genai/{org_slug}/pricing/{flow}/{pricing_id}/override

# Seed default pricing (admin only)
POST /api/v1/genai/{org_slug}/pricing/seed-defaults
```

### Usage & Costs
```bash
# Get usage data
GET /api/v1/genai/{org_slug}/usage?start_date=2025-12-01&end_date=2025-12-25

# Get cost data
GET /api/v1/genai/{org_slug}/costs?start_date=2025-12-01&end_date=2025-12-25

# Get cost summary
GET /api/v1/genai/{org_slug}/costs/summary?start_date=2025-12-01&end_date=2025-12-25
```

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | DATE | Start of date range (required) |
| `end_date` | DATE | End of date range (required) |
| `flow` | STRING | payg, commitment, infrastructure |
| `provider` | STRING | openai, anthropic, gemini, azure_openai, aws_bedrock, gcp_vertex |
| `team_id` | STRING | Filter by team for chargeback |
| `limit` | INT | Max records (default 1000, max 10000) |
| `include_models` | BOOL | Include model breakdown in summary |

### cURL Examples

```bash
# Get all pricing
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/pricing" \
  -H "X-API-Key: $ORG_API_KEY"

# Get PAYG pricing for OpenAI
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/pricing/payg?provider=openai" \
  -H "X-API-Key: $ORG_API_KEY"

# Set pricing override
curl -X PUT "http://localhost:8000/api/v1/genai/acme_corp/pricing/payg/pricing-123/override" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"override_value": 2.50, "notes": "Enterprise discount", "effective_from": "2025-01-01"}'

# Get usage data
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/usage?start_date=2025-12-01&end_date=2025-12-25&provider=openai" \
  -H "X-API-Key: $ORG_API_KEY"

# Get cost summary
curl -X GET "http://localhost:8000/api/v1/genai/acme_corp/costs/summary?start_date=2025-12-01&end_date=2025-12-25&include_models=true" \
  -H "X-API-Key: $ORG_API_KEY"
```

## Schema Specifications

### genai_payg_pricing
| Field | Type | Mode | Description |
|-------|------|------|-------------|
| org_slug | STRING | REQUIRED | Organization identifier |
| provider | STRING | REQUIRED | GenAI provider |
| model | STRING | REQUIRED | Model identifier |
| model_family | STRING | NULLABLE | Model family (gpt-4, claude-3) |
| region | STRING | NULLABLE | Deployment region |
| input_per_1m | FLOAT64 | REQUIRED | Price per 1M input tokens |
| output_per_1m | FLOAT64 | REQUIRED | Price per 1M output tokens |
| cached_input_per_1m | FLOAT64 | NULLABLE | Cached input price |
| batch_input_per_1m | FLOAT64 | NULLABLE | Batch input price |
| batch_output_per_1m | FLOAT64 | NULLABLE | Batch output price |
| context_window | INT64 | NULLABLE | Context window size |
| max_output_tokens | INT64 | NULLABLE | Max output tokens |
| supports_vision | BOOLEAN | NULLABLE | Vision support |
| supports_tools | BOOLEAN | NULLABLE | Tool use support |
| effective_from | DATE | NULLABLE | Pricing start date |
| effective_to | DATE | NULLABLE | Pricing end date |
| status | STRING | NULLABLE | active, deprecated |
| is_override | BOOLEAN | NULLABLE | Org has custom pricing |
| override_input_per_1m | FLOAT64 | NULLABLE | Custom input price |
| override_output_per_1m | FLOAT64 | NULLABLE | Custom output price |
| override_effective_from | DATE | NULLABLE | Override start date |
| override_notes | STRING | NULLABLE | Override notes |
| last_updated | TIMESTAMP | NULLABLE | Last update time |

### genai_payg_usage_raw
| Field | Type | Mode | Description |
|-------|------|------|-------------|
| usage_date | DATE | REQUIRED | Partition field |
| org_slug | STRING | REQUIRED | Organization identifier |
| provider | STRING | REQUIRED | GenAI provider |
| model | STRING | REQUIRED | Model identifier |
| model_family | STRING | NULLABLE | Model family |
| region | STRING | NULLABLE | Deployment region |
| input_tokens | INT64 | NULLABLE | Input tokens used |
| output_tokens | INT64 | NULLABLE | Output tokens used |
| cached_input_tokens | INT64 | NULLABLE | Cached tokens |
| total_tokens | INT64 | NULLABLE | Total tokens |
| request_count | INT64 | NULLABLE | API request count |
| credential_id | STRING | NULLABLE | Credential used |
| hierarchy_dept_id | STRING | NULLABLE | Department ID |
| hierarchy_dept_name | STRING | NULLABLE | Department name |
| hierarchy_project_id | STRING | NULLABLE | Project ID |
| hierarchy_project_name | STRING | NULLABLE | Project name |
| hierarchy_team_id | STRING | NULLABLE | Team ID |
| hierarchy_team_name | STRING | NULLABLE | Team name |
| run_id | STRING | NULLABLE | Pipeline run ID |
| ingested_at | TIMESTAMP | NULLABLE | Ingestion timestamp |

### genai_costs_daily_unified
| Field | Type | Mode | Description |
|-------|------|------|-------------|
| cost_date | DATE | REQUIRED | Partition field |
| org_slug | STRING | REQUIRED | Organization identifier |
| cost_type | STRING | REQUIRED | payg, commitment, infrastructure |
| provider | STRING | REQUIRED | GenAI provider |
| model | STRING | NULLABLE | Model (PAYG/commitment) |
| instance_type | STRING | NULLABLE | Instance (infrastructure) |
| gpu_type | STRING | NULLABLE | GPU type (infrastructure) |
| region | STRING | NULLABLE | Deployment region |
| input_cost_usd | FLOAT64 | NULLABLE | Input token cost |
| output_cost_usd | FLOAT64 | NULLABLE | Output token cost |
| commitment_cost_usd | FLOAT64 | NULLABLE | Fixed commitment cost |
| overage_cost_usd | FLOAT64 | NULLABLE | Overage cost |
| infrastructure_cost_usd | FLOAT64 | NULLABLE | GPU/TPU cost |
| total_cost_usd | FLOAT64 | REQUIRED | Total daily cost |
| discount_applied_pct | FLOAT64 | NULLABLE | Discount percentage |
| usage_quantity | FLOAT64 | NULLABLE | Usage amount |
| usage_unit | STRING | NULLABLE | tokens, ptu_hours, gpu_hours |
| hierarchy_dept_id | STRING | NULLABLE | Department ID |
| hierarchy_dept_name | STRING | NULLABLE | Department name |
| hierarchy_project_id | STRING | NULLABLE | Project ID |
| hierarchy_project_name | STRING | NULLABLE | Project name |
| hierarchy_team_id | STRING | NULLABLE | Team ID |
| hierarchy_team_name | STRING | NULLABLE | Team name |
| source_table | STRING | NULLABLE | Source table name |
| consolidated_at | TIMESTAMP | NULLABLE | Consolidation time |

## Pipeline Processor Types

| ps_type | Purpose |
|---------|---------|
| `genai.payg_usage` | Extract PAYG token usage from provider APIs |
| `genai.payg_cost` | Calculate PAYG costs from usage and pricing |
| `genai.commitment_usage` | Extract commitment usage (PTU/GSU) |
| `genai.commitment_cost` | Calculate commitment costs |
| `genai.infrastructure_usage` | Extract GPU/TPU infrastructure usage |
| `genai.infrastructure_cost` | Calculate infrastructure costs |
| `genai.unified_consolidator` | Merge all flows into unified tables |
| `genai.focus_converter` | Convert to FOCUS 1.3 format |

## Pipeline Execution URLs

```bash
# PAYG pipelines
POST /api/v1/pipelines/run/{org}/genai/payg/openai
POST /api/v1/pipelines/run/{org}/genai/payg/anthropic
POST /api/v1/pipelines/run/{org}/genai/payg/gemini
POST /api/v1/pipelines/run/{org}/genai/payg/azure_openai

# Commitment pipelines
POST /api/v1/pipelines/run/{org}/genai/commitment/azure_ptu
POST /api/v1/pipelines/run/{org}/genai/commitment/aws_bedrock
POST /api/v1/pipelines/run/{org}/genai/commitment/gcp_vertex

# Infrastructure pipelines
POST /api/v1/pipelines/run/{org}/genai/infrastructure/gcp_gpu

# Consolidation pipeline
POST /api/v1/pipelines/run/{org}/genai/unified/consolidate
```

## Pricing Override Flow

```
1. Org queries default pricing (from platform)
2. Org sets custom override via PUT /pricing/{flow}/{id}/override
3. Cost calculation uses: COALESCE(override_price, default_price)
4. Override tracked with effective_date, notes
5. Discount shown as discount_applied_pct in costs
```

## FOCUS 1.3 Mapping

| GenAI Field | FOCUS Field | Notes |
|-------------|-------------|-------|
| cost_date | ChargePeriodStart | Daily granularity |
| provider | ServiceProviderName | OpenAI, Anthropic, Azure OpenAI, etc. |
| cost_type | ServiceCategory | AI and Machine Learning / Compute |
| model | ResourceId | Model or instance identifier |
| total_cost_usd | EffectiveCost | After discounts |
| hierarchy_team_id | SubAccountId | For cost allocation |
| x_genai_cost_type | Extension | payg, commitment, infrastructure |
| x_genai_provider | Extension | Original provider name |
| x_genai_model | Extension | Model identifier |
| x_hierarchy_* | Extension | Full hierarchy info |

## Security Considerations

- API keys encrypted via KMS before storage in `org_integration_credentials`
- Credentials filtered by `org_slug` in every query
- Rate limiting: 100 req/min per org for read endpoints, 50 req/min for writes
- Admin-only access for pricing seed endpoint
- All endpoints require authentication (X-API-Key or X-CA-Root-Key)

## Stored Procedures

| Procedure | Purpose |
|-----------|---------|
| `sp_consolidate_genai_usage_daily` | Merge usage from all flows |
| `sp_consolidate_genai_costs_daily` | Merge costs from all flows |
| `sp_convert_genai_to_focus_1_3` | Convert to FOCUS standard |

## Monitoring & Alerting

### Pipeline Health
- Monitor daily pipeline success/failure via `org_meta_pipeline_runs`
- Alert on missing usage data for active integrations
- Track processing time trends

### Cost Anomalies
- Alert on daily cost > 2x rolling average
- Monitor commitment utilization < 50%
- Track GPU idle time for infrastructure

## Implementation Status

### Phase 1: Foundation ✅
- [x] Create 11 onboarding table schemas
- [x] Update onboarding processor with GenAI tables
- [x] Create GenAI API router (genai.py)
- [x] Frontend pricing TypeScript files (9 files)

### Phase 2: Pipeline Processors ✅
- [x] Create base adapter and provider adapters (6 adapters)
- [x] Create PAYG processors (usage + cost)
- [x] Create Commitment processors (usage + cost)
- [x] Create Infrastructure processors (usage + cost)
- [x] Create Unified Consolidator
- [x] Create FOCUS Converter

### Phase 3: Pipeline Configs ✅
- [x] Create PAYG pipeline YAMLs (4 providers)
- [x] Create Commitment pipeline YAMLs (3 providers)
- [x] Create Infrastructure pipeline YAML
- [x] Create Consolidation pipeline YAML

### Phase 4: Documentation ✅
- [x] Create stored procedures (3)
- [x] Create skill file
- [x] Create requirements spec

### Phase 5: Testing & Deployment
- [ ] Unit tests for adapters
- [ ] Integration tests for pipelines
- [ ] Deploy to staging
- [ ] Production rollout

### Phase 6: Analytics (Future)
- [ ] Cost forecasting
- [ ] Budget alerts
- [ ] Optimization recommendations
- [ ] Dashboard widgets

## Files Reference

| Component | Path | Count |
|-----------|------|-------|
| Frontend Pricing | `01-fronted-system/lib/data/genai/*.ts` | 9 files |
| Table Schemas | `02-api-service/configs/setup/organizations/onboarding/schemas/genai_*.json` | 11 files |
| API Router | `02-api-service/src/app/routers/genai.py` | 1 file |
| Processors | `03-data-pipeline-service/src/core/processors/genai/*.py` | 8 files |
| Adapters | `03-data-pipeline-service/src/core/processors/genai/provider_adapters/*.py` | 7 files |
| Pipeline Configs | `03-data-pipeline-service/configs/genai/**/*.yml` | 9 files |
| Stored Procedures | `03-data-pipeline-service/configs/system/procedures/genai/*.sql` | 3 files |
| Skill File | `.claude/skills/genai-costs.md` | 1 file |

---
**Last Updated:** 2025-12-26
**Version:** 1.1.0
