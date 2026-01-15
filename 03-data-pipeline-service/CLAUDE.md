# Pipeline Service (Port 8001)

Pipeline execution engine. Runs ETL jobs, processes costs, converts to FOCUS 1.3. Does NOT handle integrations/onboarding (8000).

**Core:** `API Request → configs/ → Processor → BigQuery`

## Production Requirements

1. **NO MOCKS** - Production-ready code only
2. **VERIFY FIRST** - Read files before referencing
3. **ENV FILES** - Use `.env.local` (never `.env`)

## Development

```bash
cd 03-data-pipeline-service
python3 -m uvicorn src.app.main:app --port 8001 --reload
python -m pytest tests/ -v
```

## Pipeline Architecture

```
configs/
├─ genai/               # OpenAI, Anthropic, Gemini
├─ cloud/               # GCP, AWS, Azure, OCI
├─ subscription/        # SaaS cost calculation
└─ system/
   ├─ providers.yml     # Provider registry
   └─ procedures/*.sql  # Stored procedures
```

**URL Pattern:** `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}`

## Processors

| Processor | ps_type | Config |
|-----------|---------|--------|
| OpenAI | `openai.usage` | `genai/payg/openai.yml` |
| Anthropic | `anthropic.usage` | `genai/payg/anthropic.yml` |
| GCP Billing | `gcp.bq_etl` | `cloud/gcp/cost/billing.yml` |
| Subscription | `generic.procedure_executor` | `subscription/costs/*.yml` |

## x_* Pipeline Lineage Fields

**CRITICAL:** All pipeline tables MUST include in this order:

| Order | Column | Purpose |
|-------|--------|---------|
| 1 | `x_pipeline_id` | Pipeline template name |
| 2 | `x_credential_id` | Credential ID |
| 3 | `x_pipeline_run_date` | Data date |
| 4 | `x_run_id` | Execution UUID |
| 5 | `x_ingested_at` | Write timestamp |

## Key Endpoints

```bash
# GenAI
POST /api/v1/pipelines/run/{org}/genai/payg/openai
POST /api/v1/pipelines/run/{org}/genai/payg/anthropic

# Cloud
POST /api/v1/pipelines/run/{org}/gcp/cost/billing
POST /api/v1/pipelines/run/{org}/aws/cost/billing

# Subscription
POST /api/v1/pipelines/run/{org}/subscription/costs/subscription_cost

# Procedures
POST /api/v1/procedures/sync
```

## Stored Procedures

| Domain | Procedures |
|--------|------------|
| Subscription | `sp_subscription_2_calculate_daily_costs`, `sp_subscription_3_convert_to_focus` |
| GenAI | `sp_genai_1_consolidate_usage_daily`, `sp_genai_3_convert_to_focus` |
| Cloud | `sp_cloud_1_convert_to_focus` |

**Files:** `configs/system/procedures/{domain}/*.sql`

## Notification System

```
Pipeline Event → NotificationService → Email/Slack
```

| Event | Severity |
|-------|----------|
| `PIPELINE_SUCCESS` | INFO |
| `PIPELINE_FAILURE` | ERROR |
| `COST_THRESHOLD` | WARNING |

**Split Architecture:**
- API (8000): Settings CRUD (`notification_crud/`)
- Pipeline (8001): Sending + history writes

## Project Structure

```
src/
├─ app/routers/      # pipelines, procedures
├─ core/
│  ├─ processors/    # Execution engines
│  ├─ pipeline/      # AsyncPipelineExecutor
│  ├─ notifications/ # Email/Slack providers
│  └─ engine/        # BigQuery client
└─ configs/
   ├─ {provider}/{domain}/*.yml
   └─ system/procedures/*.sql
```

## Key Files

| File | Purpose |
|------|---------|
| `configs/{provider}/{domain}/*.yml` | Pipeline configs |
| `configs/system/procedures/*.sql` | Stored procedures |
| `src/core/processors/` | Execution engines |
| `src/core/notifications/` | Alert providers |

---
**v4.1.0** | 2026-01-15
