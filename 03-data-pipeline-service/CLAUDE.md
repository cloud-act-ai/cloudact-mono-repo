# Pipeline Service (Port 8001)

Pipeline execution engine for ETL jobs. Runs scheduled pipelines, processes usage data, calculates costs. Does NOT handle integrations/onboarding (port 8000).

**Core Principle:** Everything is a Pipeline. `API Request → configs/ → Processor → BigQuery API`

## Development

```bash
cd 03-data-pipeline-service
pip install -r requirements.txt
python3 -m uvicorn src.app.main:app --port 8001 --reload

# Tests
python -m pytest tests/ -v
```

## Pipeline Architecture

```
configs/
├── openai/cost/usage_cost.yml      # OpenAI usage + cost
├── anthropic/usage_cost.yml        # Anthropic usage + cost
├── gcp/cost/billing.yml            # GCP billing
├── saas_subscription/costs/        # SaaS subscription costs
└── system/
    ├── providers.yml               # Provider registry
    └── procedures/                 # Stored procedures
```

**Processors:** `src/core/processors/{provider}/{domain}.py`

## Key Endpoints

```bash
# Run pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/gcp/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"date":"2025-12-08"}'

# OpenAI usage
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/openai/cost/usage_cost" \
  -H "X-API-Key: $ORG_API_KEY" -d '{"start_date":"2025-12-01","end_date":"2025-12-08"}'

# SaaS subscription costs
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" -d '{}'

# Sync stored procedures
curl -X POST "http://localhost:8001/api/v1/procedures/sync" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

**URL Pattern:** `POST /api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}`
- Provider/domain lowercase
- Maps to `configs/{provider}/{domain}/{pipeline}.yml`

## Processors

| Processor | ps_type | Config |
|-----------|---------|--------|
| OpenAI Usage | `openai.usage` | `openai/cost/usage_cost.yml` |
| OpenAI Cost | `openai.cost` | `openai/cost/usage_cost.yml` |
| Anthropic Usage | `anthropic.usage` | `anthropic/usage_cost.yml` |
| GCP BigQuery ETL | `gcp.bq_etl` | `gcp/cost/billing.yml` |
| GCP API Extractor | `gcp.api_extractor` | `gcp/api/*.yml` |
| Generic API | `generic.api_extractor` | Any API |
| Procedure Executor | `generic.procedure_executor` | `saas_subscription/costs/*.yml` |

### Creating New Processor

```python
# src/core/processors/{provider}/{domain}.py
class MyProcessor:
    async def execute(self, step_config: Dict, context: Dict) -> Dict:
        return {"status": "SUCCESS", ...}

def get_engine():
    return MyProcessor()
```

## BigQuery Integration

**Central Dataset:** `organizations` (14 meta tables)
**Per-Org Datasets:** `{org_slug}_prod`

**Multi-Tenant Isolation:** Credentials filtered by `org_slug` in every query.

## Stored Procedures

```bash
# List procedures
curl -X GET "http://localhost:8001/api/v1/procedures" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Sync all
curl -X POST "http://localhost:8001/api/v1/procedures/sync" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Execute migration
curl -X POST "http://localhost:8001/api/v1/migrations/{name}/execute?dry_run=true" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

**Files:** `configs/system/procedures/{domain}/*.sql`

## Pipeline Notifications

Auto-sends email/Slack on failure. Config: `configs/notifications/config.json`

```bash
export SMTP_USERNAME=your-email@gmail.com
export SMTP_PASSWORD=your-gmail-app-password
export DEFAULT_ADMIN_EMAIL=admin@cloudact.io
```

## Project Structure

```
03-data-pipeline-service/
├── src/app/
│   ├── main.py              # FastAPI entry
│   └── routers/             # pipelines, scheduler, procedures
├── src/core/
│   ├── processors/          # Execution engines
│   ├── pipeline/            # AsyncPipelineExecutor
│   ├── engine/              # BigQuery, API clients
│   ├── security/            # KMS encryption
│   └── scheduler/           # Queue, retry, state
├── configs/                 # SINGLE SOURCE OF TRUTH
│   ├── {provider}/{domain}/*.yml
│   └── system/procedures/*.sql
└── tests/
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Config folder | snake_case | `openai/`, `gcp/` |
| Pipeline ID | kebab-case | `acme-openai-usage` |
| Step ID | snake_case | `extract_usage` |
| ps_type | dot.notation | `openai.usage` |
| BQ Table | snake_case | `openai_usage_daily_raw` |

---
**Last Updated:** 2025-12-22
