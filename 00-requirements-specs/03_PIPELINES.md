# Pipelines

**v2.2** | 2026-02-08

> ETL execution engine → step-based async processing → BigQuery

---

## Pipeline Execution Workflow

```
1. Request: POST /pipelines/run/{org}/{provider}/{domain}/{pipeline}
2. Quota check → Subscription status (ACTIVE/TRIAL) + daily/monthly/concurrent limits
3. Atomic reservation → Increment concurrent count
4. Config loaded → YAML template resolved with org_slug, credential_id, run_id, dates
5. Steps execute in order → Each step runs its processor, respects depends_on
6. Per-step retry → max_attempts + backoff_seconds on failure
7. Processor executes → Decrypt credentials → Extract → Transform → Load to BigQuery
8. On complete → Decrement concurrent, increment success/fail counters
9. Notifications sent on failure/success
10. Status: pending → validating → running → completed / failed
```

---

## Architecture

```
POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
     → Config (YAML) → Steps → Processors → BigQuery
```

---

## Pipeline Endpoints (Port 8001)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Execute pipeline |
| GET | `/pipelines/status/{org}/{run_id}` | Check run status |
| GET | `/pipelines/history/{org}` | List run history |
| GET | `/pipelines/logs/{org}/{run_id}` | Pipeline run logs |
| GET | `/pipelines/logs/{org}/{run_id}/steps` | Step-level logs |
| GET | `/pipelines/logs/{org}/{run_id}/transitions` | Status transitions |
| GET | `/pipelines/logs/{org}/{run_id}/download` | Download full log |

---

## Status Flow

`pending` → `validating` → `running` → `completed` / `failed`

---

## YAML Config Standard

Pipeline configs at `configs/{provider}/{domain}/{pipeline}.yml`:

| Field | Purpose |
|-------|---------|
| `pipeline_id` | Unique pipeline template identifier |
| `name` | Human-readable pipeline name |
| `description` | Pipeline purpose description |
| `provider` | Provider key (gcp, openai, anthropic, etc.) |
| `domain` | Domain (cost, api, unified, payg) |
| `version` | Config version |
| `schedule` | Cron expression for scheduled runs |
| `steps` | Ordered list of execution steps |

### Step Fields

| Field | Purpose |
|-------|---------|
| `step_id` | Unique step identifier within pipeline |
| `ps_type` | Processor type (see Processor Types below) |
| `config` | Step-specific configuration |
| `depends_on` | List of step_ids that must complete first |
| `timeout_seconds` | Maximum execution time for this step |
| `retry.max_attempts` | Number of retry attempts on failure |
| `retry.backoff_seconds` | Wait time between retries |

### Processor Types

| Type | Purpose |
|------|---------|
| `genai.payg_usage` | Extract GenAI pay-as-you-go usage data |
| `genai.payg_cost` | Calculate GenAI costs from usage + pricing |
| `generic.procedure_executor` | Execute stored procedures in BigQuery |
| `ExternalBqExtractor` | Extract data from external BigQuery sources |
| `GcpApiExtractor` | Extract data via GCP APIs |

---

## Pipeline Config Organization

```
configs/
├─ genai/
│  ├─ payg/
│  │  ├─ openai.yml
│  │  ├─ anthropic.yml
│  │  ├─ gemini.yml
│  │  └─ deepseek.yml
│  └─ unified/
│     └─ consolidate.yml
├─ cloud/
│  ├─ gcp/cost/billing.yml
│  ├─ aws/cost/billing.yml
│  ├─ azure/cost/billing.yml
│  └─ oci/cost/billing.yml
├─ subscription/
│  └─ costs/subscription_cost.yml
└─ system/
   └─ providers.yml
```

---

## Template Variables

| Template | Example | Description |
|----------|---------|-------------|
| `{org_slug}` | acme_corp | Organization identifier |
| `${project_id}` | cloudact-prod | GCP project ID |
| `${org_dataset}` | acme_corp_prod | BigQuery dataset |
| `${start_date}` | 2026-01-15 | Pipeline date range start |
| `${credential_id}` | cred_abc123 | Credential reference |
| `${pipeline_id}` | genai_openai_payg | Pipeline template ID |
| `${run_id}` | run_abc123 | Execution UUID |

---

## Quota Enforcement Standard

- Read subscription limits from **Supabase** (source of truth for plans)
- Quota checked before execution: daily, monthly, and concurrent limits
- Self-healing: stale concurrent counters cleaned before reservation
- Atomic check-and-reserve via single SQL UPDATE with WHERE clauses
- 429 error returned if any limit exceeded

---

## x_* Lineage Fields

All pipeline output tables MUST include these core fields:

| Field | Type | Purpose |
|-------|------|---------|
| `x_org_slug` | STRING | Multi-tenant row isolation |
| `x_pipeline_id` | STRING | Pipeline template name |
| `x_credential_id` | STRING | Credential used |
| `x_pipeline_run_date` | DATE | Data date (idempotency key) |
| `x_run_id` | STRING | Execution UUID |
| `x_ingested_at` | TIMESTAMP | Write timestamp |
| `x_ingestion_date` | DATE | Partition key |

**Composite key for idempotent writes:** `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` — DELETE existing + INSERT, or MERGE upsert.

---

## Notifications

- Notifications sent on pipeline completion (success or failure)
- Configurable per organization

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/{provider}/{domain}/*.yml` | Pipeline configs |
| `03-data-pipeline-service/src/core/processors/` | Processor implementations |
| `03-data-pipeline-service/src/app/routers/pipelines.py` | API router |
