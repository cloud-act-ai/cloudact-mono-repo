# GenAI Cost Management

**Status**: IMPLEMENTED (v1.2) | **Updated**: 2026-01-01

> 6 providers, 3 billing flows, FOCUS 1.3 compliant. Related: [Cloud Costs](02_CLOUD_COSTS.md) | [Integrations](03_INTEGRATIONS.md)

---

## Provider Matrix

| Provider | PAYG | Commitment | Infrastructure | Billing Source |
|----------|------|------------|----------------|----------------|
| OpenAI | ✓ | - | - | Usage API |
| Anthropic | ✓ | - | - | Admin API |
| Gemini | ✓ | - | - | Billing Export |
| Azure OpenAI | ✓ | ✓ PTU | - | Azure Monitor |
| AWS Bedrock | ✓ | ✓ PT | - | CloudWatch |
| GCP Vertex | ✓ | ✓ GSU | ✓ | Cloud Monitoring |

---

## Three Cost Flows

```
PAYG (Pay-As-You-Go)     Commitment (Reserved)    Infrastructure (Self-hosted)
─────────────────────    ────────────────────     ──────────────────────────
Token-based billing      PTU/GSU/PT units         GPU/TPU hourly billing
genai_payg_*_raw         genai_commitment_*       genai_infrastructure_*
Calculated from pricing  Fixed + overage          Instance hours
```

---

## Tables (12 per org)

| Flow | Tables |
|------|--------|
| PAYG | `genai_payg_pricing`, `genai_payg_usage_raw`, `genai_payg_costs_daily` |
| Commitment | `genai_commitment_pricing`, `genai_commitment_usage_raw`, `genai_commitment_costs_daily` |
| Infrastructure | `genai_infrastructure_pricing`, `genai_infrastructure_usage_raw`, `genai_infrastructure_costs_daily` |
| Unified | `genai_usage_daily_unified`, `genai_costs_daily_unified`, `cost_data_standard_1_3` |

---

## API Endpoints

**Pricing:**
```
GET  /api/v1/genai/{org}/pricing              # All pricing
GET  /api/v1/genai/{org}/pricing/{flow}       # By flow (payg/commitment/infrastructure)
PUT  /api/v1/genai/{org}/pricing/{flow}/{id}/override  # Set custom pricing
POST /api/v1/genai/{org}/pricing/seed-defaults # Admin only
```

**Usage & Costs:**
```
GET /api/v1/genai/{org}/usage?start_date=&end_date=
GET /api/v1/genai/{org}/costs?start_date=&end_date=
GET /api/v1/genai/{org}/costs/summary?include_models=true
```

---

## Pipeline URLs

```
# PAYG
POST /api/v1/pipelines/run/{org}/genai/payg/openai
POST /api/v1/pipelines/run/{org}/genai/payg/anthropic
POST /api/v1/pipelines/run/{org}/genai/payg/gemini
POST /api/v1/pipelines/run/{org}/genai/payg/azure_openai

# Commitment
POST /api/v1/pipelines/run/{org}/genai/commitment/azure_ptu
POST /api/v1/pipelines/run/{org}/genai/commitment/aws_bedrock
POST /api/v1/pipelines/run/{org}/genai/commitment/gcp_vertex

# Infrastructure
POST /api/v1/pipelines/run/{org}/genai/infrastructure/gcp_gpu

# Consolidation
POST /api/v1/pipelines/run/{org}/genai/unified/consolidate
```

---

## Pricing Override Flow

```
1. Query default pricing (platform rate cards)
2. Set override: PUT /pricing/{flow}/{id}/override
3. Cost calculation: COALESCE(override_price, default_price)
4. Discount shown in costs as discount_applied_pct
```

---

## FOCUS 1.3 Mapping

| GenAI Field | FOCUS Field |
|-------------|-------------|
| cost_date | ChargePeriodStart |
| provider | ServiceProviderName |
| cost_type | ServiceCategory |
| model | ResourceId |
| total_cost_usd | EffectiveCost |
| hierarchy_team_id | SubAccountId |
| x_genai_* | Extensions |

---

## Stored Procedures

| Procedure | Purpose |
|-----------|---------|
| `sp_consolidate_genai_usage_daily` | Merge usage from all flows |
| `sp_consolidate_genai_costs_daily` | Merge costs from all flows |
| `sp_convert_genai_to_focus_1_3` | Convert to FOCUS standard |

---

## Key Files

| Component | Path |
|-----------|------|
| Table Schemas | `02-api-service/configs/setup/organizations/onboarding/schemas/genai_*.json` |
| API Router | `02-api-service/src/app/routers/genai.py` |
| Processors | `03-data-pipeline-service/src/core/processors/genai/*.py` |
| Provider Adapters | `03-data-pipeline-service/src/core/processors/genai/provider_adapters/*.py` |
| Pipeline Configs | `03-data-pipeline-service/configs/genai/**/*.yml` |
| Stored Procedures | `03-data-pipeline-service/configs/system/procedures/genai/*.sql` |

---

## Daily Pipeline Schedule

```
2:00 AM - OpenAI PAYG
2:15 AM - Anthropic PAYG
2:30 AM - Gemini PAYG
2:45 AM - Azure OpenAI PAYG
3:00 AM - Azure PTU Commitment
3:15 AM - AWS Bedrock PT
3:30 AM - GCP Vertex GSU
4:00 AM - GCP GPU Infrastructure
6:00 AM - Unified Consolidation + FOCUS
```

---

**v1.2** | 2026-01-01
