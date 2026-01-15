# Pipeline Service (Port 8001)

Pipeline execution engine for ETL jobs. Runs scheduled pipelines, processes usage data, calculates costs. Does NOT handle integrations/onboarding (port 8000).

**Core Principle:** Everything is a Pipeline. `API Request → configs/ → Processor → BigQuery API`

## PRODUCTION-READY REQUIREMENTS (CRITICAL)

**MANDATORY for all code generation and modifications:**

1. **NO MOCKS OR STUBS** - Never create mock implementations, placeholder code, or TODO stubs unless explicitly requested
2. **NO HALLUCINATED CODE** - Only reference files, functions, and APIs that actually exist in the codebase
3. **WORKING CODE ONLY** - All generated code must be complete, functional, and production-ready
4. **VERIFY BEFORE REFERENCE** - Always read/check files before referencing them in code or documentation
5. **USE EXISTING PATTERNS** - Follow established patterns in the codebase, don't invent new ones
6. **NO NEW DEPENDENCIES** - Don't add new pip packages without explicit approval
7. **ENVIRONMENT FILES** - Use this project's environment files:
   - Local/Testing: `03-data-pipeline-service/.env.local`
   - Staging: `03-data-pipeline-service/.env.stage`
   - Production: `03-data-pipeline-service/.env.prod`
   - **NEVER use `.env`** - always use environment-specific files

**Before writing code:**
- Read existing files to understand current patterns
- Verify imports and dependencies exist
- Check that referenced APIs/endpoints are real
- Ensure schema matches actual BigQuery tables and configs

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
├── subscription/costs/        # Subscription costs
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

# Subscription costs
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org}/subscription/costs/subscription_cost" \
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
| Procedure Executor | `generic.procedure_executor` | `subscription/costs/*.yml` |

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

## Pipeline Lineage Columns (x_* Standard)

**CRITICAL:** All pipeline-generated tables MUST include x_* lineage columns in the following **standard order**:

| Order | Column | Type | Mode | Purpose |
|-------|--------|------|------|---------|
| 1 | `x_pipeline_id` | STRING | REQUIRED | Pipeline template name (e.g., `genai_to_focus`) |
| 2 | `x_credential_id` | STRING | REQUIRED | Credential ID for multi-account isolation |
| 3 | `x_pipeline_run_date` | DATE | REQUIRED | Data date being processed (for idempotency) |
| 4 | `x_run_id` | STRING | REQUIRED | Unique pipeline execution UUID |
| 5 | `x_ingested_at` | TIMESTAMP | REQUIRED | When data was written to table |
| 6 | `x_data_quality_score` | FLOAT64 | NULLABLE | DQ validation score (0.0-1.0) |
| 7 | `x_created_at` | TIMESTAMP | NULLABLE | Record creation timestamp |

### Column Order Rules

1. **Always use this exact order** in INSERT and SELECT statements
2. **Required columns (1-5)** must come before optional columns (6-7)
3. **Stored procedures and processors** must match this order exactly
4. **Never use deprecated names** like `x_pipeline_run_id` (use `x_run_id`)

### Usage in Processors

```python
# Correct order in MERGE/INSERT statements
merge_query = """
    MERGE `{table}` T
    USING (
        SELECT
            -- ... business columns ...
            -- x_* columns in standard order:
            @pipeline_id as x_pipeline_id,
            @credential_id as x_credential_id,
            @process_date as x_pipeline_run_date,
            @run_id as x_run_id,
            CURRENT_TIMESTAMP() as x_ingested_at
    ) S
    ON ...
"""
```

### Usage in Stored Procedures

```sql
-- INSERT column list (standard order)
INSERT INTO `table` (
    -- ... business columns ...
    x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at,
    x_data_quality_score, x_created_at
)
SELECT
    -- ... business columns ...
    'pipeline_name' AS x_pipeline_id,
    'credential_id' AS x_credential_id,
    cost_date AS x_pipeline_run_date,
    GENERATE_UUID() AS x_run_id,
    CURRENT_TIMESTAMP() AS x_ingested_at,
    1.0 AS x_data_quality_score,
    CURRENT_TIMESTAMP() AS x_created_at
```

### Tables with x_* Columns

| Table Pattern | Example |
|---------------|---------|
| `*_usage_raw` | `genai_payg_usage_raw` |
| `*_costs_daily` | `genai_costs_daily_unified` |
| `*_billing_raw_daily` | `cloud_gcp_billing_raw_daily` |
| `cost_data_standard_1_3` | FOCUS 1.3 unified format |
| `subscription_plan_costs_daily` | Subscription daily costs |

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

## Notification System (src/core/notifications/)

Multi-provider notification system for pipeline alerts, cost warnings, and scheduled summaries.

### Architecture

```
Pipeline Event → NotificationService → Provider Selection → Email/Slack
                        ↓
                 Config Hierarchy:
                 1. Org-specific: configs/{org_slug}/notifications.json
                 2. Root fallback: configs/notifications/config.json
```

### Providers

| Provider | Class | Config Key | Features |
|----------|-------|------------|----------|
| Email | `EmailNotificationProvider` | `email_config` | SMTP, HTML templates |
| Slack | `SlackNotificationProvider` | `slack_config` | Webhook, rich formatting |

### Notification Events

| Event | When Triggered | Default Severity |
|-------|----------------|------------------|
| `PIPELINE_STARTED` | Pipeline begins | INFO |
| `PIPELINE_SUCCESS` | Pipeline completes | INFO |
| `PIPELINE_FAILURE` | Pipeline fails | ERROR |
| `STEP_FAILURE` | Individual step fails | WARNING |
| `COST_THRESHOLD` | Cost exceeds threshold | WARNING/CRITICAL |
| `ANOMALY_DETECTED` | Unusual pattern found | WARNING |
| `SUMMARY_SCHEDULED` | Digest time reached | INFO |

### Configuration

Root config: `configs/notifications/config.json`

```json
{
  "enabled": true,
  "timeout_seconds": 30,
  "email_config": {
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "use_tls": true
  },
  "slack_config": {
    "default_channel": "#alerts"
  },
  "event_triggers": {
    "pipeline_failure": {
      "enabled": true,
      "providers": ["email", "slack"],
      "cooldown_seconds": 300
    }
  },
  "retry_config": {
    "max_attempts": 3,
    "initial_delay_seconds": 1,
    "max_delay_seconds": 30,
    "exponential_backoff": true
  }
}
```

### Environment Variables

```bash
# Email (SMTP)
export SMTP_USERNAME=your-email@gmail.com
export SMTP_PASSWORD=your-gmail-app-password
export DEFAULT_ADMIN_EMAIL=admin@cloudact.io

# Slack
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Usage

```python
from src.core.notifications import (
    get_notification_service,
    NotificationEvent,
    NotificationSeverity
)

service = get_notification_service()

# Send notification
await service.notify(
    org_slug="acme_corp",
    event=NotificationEvent.PIPELINE_FAILURE,
    severity=NotificationSeverity.ERROR,
    title="Pipeline Failed",
    message="Pipeline execution failed with error",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123"
)

# Convenience method
await service.notify_pipeline_failure(
    org_slug="acme_corp",
    pipeline_id="daily_ingestion",
    error_message="Connection timeout"
)
```

### Service Pattern (Read/Write Split)

| Operation | Location | Service |
|-----------|----------|---------|
| **Settings CRUD** | API Service (8000) | `notification_crud/` |
| **Dashboard Reads** | API Service (8000) | `notification_read/` |
| **Delivery/Sending** | Pipeline Service (8001) | `notifications/` |
| **History Writes** | Pipeline Service (8001) | Writes to `org_notification_history` |

**Flow:**
1. API Service stores channel/rule/summary settings
2. Pipeline Service reads settings, sends notifications
3. Pipeline Service writes delivery history
4. API Service reads history via Polars for dashboard

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
│   ├── scheduler/           # Queue, retry, state
│   └── notifications/       # Email/Slack providers
│       ├── providers/       # EmailNotificationProvider, SlackNotificationProvider
│       ├── service.py       # NotificationService
│       └── config.py        # Config models
├── configs/
│   ├── {provider}/{domain}/*.yml
│   ├── notifications/       # Root notification config
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

## Current Version

| Environment | Version | URL |
|-------------|---------|-----|
| Production | v4.1.0 | https://pipeline.cloudact.ai |
| Local | dev | http://localhost:8001 |

---
**Last Updated:** 2026-01-15
