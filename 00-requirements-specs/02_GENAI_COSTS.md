# GenAI Cost Management

**v1.4** | 2026-02-08

> 6 providers, 3 billing flows → FOCUS 1.3

---

## Ingestion Workflow

```
1. Customer configures GenAI provider credentials (API keys / service accounts)
2. Pipeline triggered → Decrypt credentials → Call provider usage API
3. Raw data written to genai_{flow}_usage_raw / genai_{flow}_pricing tables
4. Consolidation stored procedures (in organizations dataset):
   a. sp_genai_1_consolidate_usage_daily → genai_usage_daily_unified
   b. sp_genai_2_consolidate_costs_daily → genai_costs_daily_unified
   c. sp_genai_3_convert_to_focus → cost_data_standard_1_3
5. Dashboard reads unified FOCUS 1.3 data via Polars + cache
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
| GCP Vertex | Token-based | GSU units | GPU/TPU hours |

---

## Three Cost Flows

### 1. PAYG (Pay-As-You-Go / Token-Based)

| Table | Purpose |
|-------|---------|
| `genai_payg_pricing` | Per-model token pricing (input/output rates) |
| `genai_payg_usage_raw` | Raw token usage per request/session |
| `genai_payg_costs_daily` | Calculated daily costs (usage x pricing) |

### 2. Commitment (Reserved Capacity)

| Table | Purpose |
|-------|---------|
| `genai_commitment_pricing` | PTU/GSU unit pricing by commitment tier |
| `genai_commitment_usage_raw` | Provisioned unit utilization data |
| `genai_commitment_costs_daily` | Calculated daily commitment costs |

### 3. Infrastructure (GPU/TPU Compute)

| Table | Purpose |
|-------|---------|
| `genai_infrastructure_pricing` | GPU/TPU hourly rates by instance type |
| `genai_infrastructure_usage_raw` | Compute hours consumed |
| `genai_infrastructure_costs_daily` | Calculated daily infrastructure costs |

All flows → `genai_usage_daily_unified` → `genai_costs_daily_unified` → `cost_data_standard_1_3`

---

## Stored Procedures (Consolidation Pipeline)

All stored procedures live in the `organizations` dataset and operate on per-org datasets.

| Step | Procedure | Input | Output |
|------|-----------|-------|--------|
| 1 | `sp_genai_1_consolidate_usage_daily` | `genai_payg_usage_raw`, `genai_commitment_usage_raw`, `genai_infrastructure_usage_raw` | `genai_usage_daily_unified` |
| 2 | `sp_genai_2_consolidate_costs_daily` | `genai_payg_costs_daily`, `genai_commitment_costs_daily`, `genai_infrastructure_costs_daily` | `genai_costs_daily_unified` |
| 3 | `sp_genai_3_convert_to_focus` | `genai_costs_daily_unified` | `cost_data_standard_1_3` |

**Dependencies:** Step 1 must complete before Step 2. Step 2 must complete before Step 3.

---

## Hierarchy Model (5-field)

All GenAI cost tables carry the 5-field hierarchy model:

| Field | Description |
|-------|-------------|
| `x_hierarchy_entity_id` | Entity identifier (e.g., `DEPT-001`, `PROJ-042`) |
| `x_hierarchy_entity_name` | Human-readable entity name |
| `x_hierarchy_level_code` | Level in hierarchy (`DEPT`, `PROJ`, `TEAM`) |
| `x_hierarchy_path` | Full path of IDs (`/ORG/DEPT-001/PROJ-042`) |
| `x_hierarchy_path_names` | Full path of names (`/Acme/Engineering/Backend`) |

---

## x_* Lineage Fields

All GenAI tables include:

| Field | Type | Purpose |
|-------|------|---------|
| `x_org_slug` | STRING | Multi-tenant row isolation |
| `x_pipeline_id` | STRING | Pipeline template |
| `x_credential_id` | STRING | Credential used |
| `x_pipeline_run_date` | DATE | Data date (idempotency key) |
| `x_run_id` | STRING | Execution UUID |
| `x_ingested_at` | TIMESTAMP | Write timestamp |
| `x_ingestion_date` | DATE | Partition key |
| `x_genai_provider` | STRING | Provider code (OPENAI, ANTHROPIC, GEMINI, etc.) |
| `x_genai_account_id` | STRING | GenAI organization/account ID |

**Composite key for MERGE:** `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` + business key `(provider, model, usage_date, region)`.

**Rule:** x_* fields are Pipeline Service (8001) only — never set by API Service (8000).

---

## Pipeline Endpoints (Port 8001)

| Endpoint | Purpose |
|----------|---------|
| `POST /pipelines/run/{org}/genai/payg/{provider}` | Ingest PAYG usage (per provider) |
| `POST /pipelines/run/{org}/genai/commitment/{type}` | Ingest commitment data |
| `POST /pipelines/run/{org}/genai/infrastructure/{type}` | Ingest infrastructure data |
| `POST /pipelines/run/{org}/genai/unified/consolidate` | Run 3-step consolidation pipeline |

---

## Pipeline Configs

| Config Path | Purpose |
|-------------|---------|
| `configs/genai/payg/{provider}.yml` | PAYG extraction per provider (openai, anthropic, gemini, etc.) |
| `configs/genai/unified/consolidate.yml` | 3-step consolidation (usage → costs → FOCUS) |

---

## Schedule

| Pipeline | Schedule | Window |
|----------|----------|--------|
| PAYG extraction (all providers) | Daily | 2:00 - 3:00 AM UTC |
| Consolidation (unified) | Daily | 6:00 AM UTC (after all extractions) |

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/genai/payg/{provider}.yml` | Per-provider PAYG pipeline configs |
| `03-data-pipeline-service/configs/genai/unified/consolidate.yml` | Consolidation pipeline config |
| `03-data-pipeline-service/src/core/processors/genai/` | Provider processors |
| `02-api-service/configs/setup/organizations/onboarding/schemas/genai_*.json` | Table schemas |
