# GenAI Cost Management

**v1.3** | 2026-02-05

> 6 providers, 3 billing flows → FOCUS 1.3

---

## Ingestion Workflow

```
1. Customer configures GenAI provider credentials (API keys / service accounts)
2. Pipeline triggered → Decrypt credentials → Call provider usage API
3. Raw data written to genai_{flow}_{provider}_* tables
4. Consolidation: sp_genai_1 (usage) → sp_genai_2 (costs) → genai_costs_daily_unified
5. FOCUS conversion: sp_genai_3 → cost_data_standard_1_3
6. Dashboard reads unified data
```

---

## Providers & Billing Flows

| Provider | PAYG | Commitment | Infrastructure |
|----------|------|------------|----------------|
| OpenAI | Token-based | - | - |
| Anthropic | Token-based | - | - |
| Gemini | Token-based | - | - |
| Azure OpenAI | Token-based | PTU units | - |
| AWS Bedrock | Token-based | PT units | - |
| GCP Vertex | Token-based | GSU units | GPU hours |

---

## Three Cost Flows

| Flow | Tables | Billing Model |
|------|--------|---------------|
| PAYG | `genai_payg_*` | Per-token pricing |
| Commitment | `genai_commitment_*` | Reserved capacity (PTU/GSU) |
| Infrastructure | `genai_infrastructure_*` | GPU/TPU compute hours |

All → `genai_costs_daily_unified` → `cost_data_standard_1_3`

---

## Stored Procedures (Consolidation Pipeline)

| Procedure | Purpose |
|-----------|---------|
| `sp_genai_1_consolidate_usage_daily` | Merge usage across providers |
| `sp_genai_2_consolidate_costs_daily` | Apply pricing, merge costs |
| `sp_genai_3_convert_to_focus` | Convert to FOCUS 1.3 format |

---

## Pipeline Endpoints (Port 8001)

| Endpoint | Purpose |
|----------|---------|
| `POST /pipelines/run/{org}/genai/payg/{provider}` | Ingest PAYG usage |
| `POST /pipelines/run/{org}/genai/commitment/{type}` | Ingest commitment data |
| `POST /pipelines/run/{org}/genai/unified/consolidate` | Run consolidation |

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/genai/**/*.yml` | Pipeline configs |
| `03-data-pipeline-service/src/core/processors/genai/` | Provider processors |
| `02-api-service/configs/setup/organizations/onboarding/schemas/genai_*.json` | Table schemas |
