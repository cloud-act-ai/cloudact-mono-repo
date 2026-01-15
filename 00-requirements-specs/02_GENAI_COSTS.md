# GenAI Cost Management

**v1.2** | 2026-01-15

> 6 providers, 3 billing flows → FOCUS 1.3

---

## Providers

| Provider | PAYG | Commitment | Infrastructure |
|----------|------|------------|----------------|
| OpenAI | ✓ | - | - |
| Anthropic | ✓ | - | - |
| Gemini | ✓ | - | - |
| Azure OpenAI | ✓ | ✓ PTU | - |
| AWS Bedrock | ✓ | ✓ PT | - |
| GCP Vertex | ✓ | ✓ GSU | ✓ GPU |

---

## Three Cost Flows

| Flow | Tables | Billing |
|------|--------|---------|
| PAYG | `genai_payg_*` | Token-based |
| Commitment | `genai_commitment_*` | PTU/GSU units |
| Infrastructure | `genai_infrastructure_*` | GPU hours |

All → `genai_costs_daily_unified` → `cost_data_standard_1_3`

---

## Pipelines (Port 8001)

```bash
# PAYG
POST /api/v1/pipelines/run/{org}/genai/payg/openai
POST /api/v1/pipelines/run/{org}/genai/payg/anthropic

# Commitment
POST /api/v1/pipelines/run/{org}/genai/commitment/azure_ptu

# Unified
POST /api/v1/pipelines/run/{org}/genai/unified/consolidate
```

---

## Stored Procedures

| Procedure | Purpose |
|-----------|---------|
| `sp_genai_1_consolidate_usage_daily` | Merge usage |
| `sp_genai_2_consolidate_costs_daily` | Merge costs |
| `sp_genai_3_convert_to_focus` | FOCUS 1.3 |

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/genai/**/*.yml` | Pipeline configs |
| `03-data-pipeline-service/src/core/processors/genai/` | Processors |
| `02-api-service/configs/setup/organizations/onboarding/schemas/genai_*.json` | Schemas |
