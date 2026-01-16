# Pipeline Service (Port 8001)

Pipeline execution engine. Runs ETL jobs, processes costs, converts to FOCUS 1.3, handles quota resets. Does NOT handle integrations/onboarding (8000).

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

**CRITICAL:** All pipeline tables MUST include:

| Column | Purpose |
|--------|---------|
| `x_pipeline_id` | Pipeline template name |
| `x_credential_id` | Credential ID |
| `x_pipeline_run_date` | Data date |
| `x_run_id` | Execution UUID |
| `x_ingested_at` | Write timestamp |

## Quota Reset Jobs

**This service handles all quota reset operations via Cloud Scheduler.**

| Job | Schedule | Function |
|-----|----------|----------|
| Daily reset | 00:00 UTC | `reset_daily_quotas()` |
| Monthly reset | 1st 00:00 UTC | `reset_monthly_quotas()` |
| Stale cleanup | Every 15 min | `reset_stale_concurrent_counts()` |

**File:** `src/core/utils/quota_reset.py`

## Pipeline Validation Flow

```
1. Pipeline request received
2. Call API service: POST /api/v1/validator/validate/{org}
3. API service checks subscription + quota (atomic)
4. If valid → Execute pipeline
5. On complete → Update usage counters
```

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

## Notification System

```
Pipeline Event → NotificationService → Email/Slack
```

**Split:** API (8000) = Settings CRUD | Pipeline (8001) = Sending

## Project Structure

```
src/
├─ app/routers/      # pipelines, procedures
├─ core/
│  ├─ processors/    # Execution engines
│  ├─ pipeline/      # AsyncPipelineExecutor
│  ├─ notifications/ # Email/Slack providers
│  ├─ utils/         # quota_reset.py
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
| `src/core/utils/quota_reset.py` | Quota reset functions |

---
**v4.1.8** | 2026-01-16
