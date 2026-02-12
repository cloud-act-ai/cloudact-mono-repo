# Pipeline Ops - Requirements

## Overview

ETL execution engine with step-based async processing that extracts data from provider APIs, transforms it, and loads it into BigQuery. Pipelines are YAML-configured, quota-enforced, and produce lineage-tracked output via x_* fields.

## Source Specification

- `03_PIPELINES.md` (v2.2, 2026-02-08)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Pipeline Execution Engine                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  YAML Config Source                   Pipeline Service (8001)                │
│  ─────────────────                    ──────────────────────                 │
│                                                                             │
│  configs/                             POST /pipelines/run/{org}/{prov}/      │
│  ├─ genai/payg/openai.yml                  {domain}/{pipeline}              │
│  ├─ cloud/gcp/cost/billing.yml                    │                         │
│  ├─ subscription/costs/*.yml                      ▼                         │
│  └─ system/providers.yml            ┌──────────────────────┐                │
│                                     │  10-Step Execution   │                │
│                                     │  Flow                │                │
│  API Service (8000)                 │                      │                │
│  ──────────────────                 │  1. Request received │                │
│  Validates org + quota before       │  2. Quota check      │                │
│  forwarding to pipeline service     │  3. Atomic reserve   │                │
│                                     │  4. Config loaded    │                │
│                                     │  5. Steps ordered    │                │
│  Supabase                           │  6. Per-step retry   │                │
│  ────────                           │  7. Processor exec   │                │
│  Subscription limits (source of     │  8. BQ write + x_*   │                │
│  truth for plan quotas)             │  9. Decrement conc.  │                │
│                                     │ 10. Notify + status  │                │
│                                     └──────────┬───────────┘                │
│                                                │                            │
├────────────────────────────────────────────────┼────────────────────────────┤
│                                                ▼                            │
│  Step Execution Detail                                                      │
│  ─────────────────────                                                      │
│                                                                             │
│  YAML Step Config          Processor                     BigQuery           │
│  ────────────────          ─────────                     ────────           │
│  step_id: extract    ───▶  genai.payg_usage        ───▶  Raw table         │
│  ps_type: processor        (decrypt creds, call API)     + x_* lineage     │
│  depends_on: []                                                             │
│       │                                                                     │
│       ▼                                                                     │
│  step_id: calculate  ───▶  genai.payg_cost         ───▶  Cost table        │
│  depends_on: [extract]     (usage x pricing)             + x_* lineage     │
│       │                                                                     │
│       ▼                                                                     │
│  step_id: unify      ───▶  generic.procedure_exec  ───▶  cost_data_        │
│  depends_on: [calc]        (sp_convert_to_focus)         standard_1_3      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Status Tracking: org_meta_pipeline_runs                                    │
│  ───────────────────────────────────────                                    │
│                                                                             │
│  pending ──▶ validating ──▶ running ──▶ completed                           │
│                                    └──▶ failed (+ error_message)            │
│                                                                             │
│  x_* Lineage (all output rows):                                             │
│  x_org_slug | x_pipeline_id | x_credential_id | x_pipeline_run_date        │
│  x_run_id   | x_ingested_at | x_ingestion_date                             │
│                                                                             │
│  Idempotency Key:                                                           │
│  (x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)         │
│  DELETE existing + INSERT  or  MERGE upsert                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-PIP-001: Pipeline Execution Workflow

1. Request received: `POST /pipelines/run/{org}/{provider}/{domain}/{pipeline}`
2. Quota check: subscription status (ACTIVE/TRIAL) + daily/monthly/concurrent limits
3. Atomic reservation: increment concurrent count
4. Config loaded: YAML template resolved with org_slug, credential_id, run_id, dates
5. Steps execute in order, respecting `depends_on` declarations
6. Per-step retry: `max_attempts` + `backoff_seconds` on failure
7. Processor executes: decrypt credentials, extract, transform, load to BigQuery
8. On complete: decrement concurrent, increment success/fail counters
9. Notifications sent on failure/success
10. Status flow: `pending` -> `validating` -> `running` -> `completed` / `failed`

### FR-PIP-002: Pipeline Endpoints (Port 8001)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Execute pipeline |
| GET | `/pipelines/status/{org}/{run_id}` | Check run status |
| GET | `/pipelines/history/{org}` | List run history |
| GET | `/pipelines/logs/{org}/{run_id}` | Pipeline run logs |
| GET | `/pipelines/logs/{org}/{run_id}/steps` | Step-level logs |
| GET | `/pipelines/logs/{org}/{run_id}/transitions` | Status transitions |
| GET | `/pipelines/logs/{org}/{run_id}/download` | Download full log |

### FR-PIP-003: YAML Config Standard

Pipeline configs located at `configs/{provider}/{domain}/{pipeline}.yml`:

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

### FR-PIP-004: Step Configuration

| Field | Purpose |
|-------|---------|
| `step_id` | Unique step identifier within pipeline |
| `ps_type` | Processor type |
| `config` | Step-specific configuration |
| `depends_on` | List of step_ids that must complete first |
| `timeout_seconds` | Maximum execution time for this step |
| `retry.max_attempts` | Number of retry attempts on failure |
| `retry.backoff_seconds` | Wait time between retries |

### FR-PIP-005: Processor Types

| Type | Purpose |
|------|---------|
| `genai.payg_usage` | Extract GenAI pay-as-you-go usage data |
| `genai.payg_cost` | Calculate GenAI costs from usage + pricing |
| `generic.procedure_executor` | Execute stored procedures in BigQuery |
| `ExternalBqExtractor` | Extract data from external BigQuery sources |
| `GcpApiExtractor` | Extract data via GCP APIs |

### FR-PIP-006: Template Variables

| Template | Example | Description |
|----------|---------|-------------|
| `{org_slug}` | acme_corp | Organization identifier |
| `${project_id}` | cloudact-prod | GCP project ID |
| `${org_dataset}` | acme_corp_prod | BigQuery dataset |
| `${start_date}` | 2026-01-15 | Pipeline date range start |
| `${credential_id}` | cred_abc123 | Credential reference |
| `${pipeline_id}` | genai_openai_payg | Pipeline template ID |
| `${run_id}` | run_abc123 | Execution UUID |

### FR-PIP-007: x_* Lineage Fields

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

Composite key for idempotent writes: `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` -- DELETE existing + INSERT, or MERGE upsert.

### FR-PIP-008: Pipeline Notifications

- Notifications sent on pipeline completion (success or failure)
- Configurable per organization

---

## Non-Functional Requirements

### NFR-PIP-001: Quota Enforcement

- Read subscription limits from Supabase (source of truth for plans)
- Quota checked before execution: daily, monthly, and concurrent limits
- Self-healing: stale concurrent counters cleaned before reservation
- Atomic check-and-reserve via single SQL UPDATE with WHERE clauses
- 429 error returned if any limit exceeded

### NFR-PIP-002: Idempotency

- Composite key `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` ensures no duplicate data
- DELETE + INSERT or MERGE upsert pattern for writes

### NFR-PIP-003: Step Execution

- Steps execute sequentially respecting `depends_on` ordering
- Each step has configurable retry with `max_attempts` and `backoff_seconds`
- Each step has configurable `timeout_seconds`

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

## SDLC

### Development Workflow

```
1. Create YAML Config  ── Define steps, processors, template vars in configs/{provider}/{domain}/
2. Validate Config     ── Schema validation + template variable resolution check
3. Test Locally        ── Run against cloudact-testing-1 with test credentials
4. Code Review (PR)    ── Review YAML config + any new processor code
5. Deploy to Stage     ── Auto on push to main; smoke-test pipeline execution
6. Deploy to Prod      ── Git tag triggers Cloud Build; health check post-deploy
7. Run via API         ── POST /pipelines/run/{org}/{provider}/{domain}/{pipeline}
8. Monitor             ── Check status, logs, step transitions via pipeline endpoints
```

### Testing Approach

| Layer | Tool | Tests | Focus |
|-------|------|-------|-------|
| Processor Unit | pytest | `03-data-pipeline-service/tests/05_test_pipelines.py` | Individual processor logic, data transforms |
| Config Validation | pytest | Same directory | YAML schema validation, template resolution |
| Step Execution | pytest + AsyncMock | Same directory | Step ordering, depends_on, retry, timeout |
| Quota Enforcement | pytest | `tests/06_test_quotas.py` | Daily/monthly/concurrent limits, 429 errors |
| x_* Lineage | pytest | Same directory | All 7 x_* fields present and correct in output |
| E2E Pipeline Run | pytest --run-integration | Integration tests | Full pipeline: config -> extract -> transform -> BQ write |
| Idempotency | pytest | Same directory | Re-run produces same result, no duplicates |

### Deployment / CI-CD Integration

- **PR Gate:** `pytest tests/05_test_pipelines.py -v` must pass before merge
- **Config Changes:** YAML configs deployed with the pipeline-service container
- **Stage:** Auto-deploy on `main` push; test pipeline run against staging org
- **Prod:** Git tag (`v*`) triggers `cloudbuild-prod.yaml`; health endpoint verified
- **Schema Updates:** `run-job.sh {env} bootstrap-sync` adds new columns to pipeline tracking tables
- **Rollback:** Re-tag previous version to trigger redeployment

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/{provider}/{domain}/*.yml` | Pipeline configs |
| `03-data-pipeline-service/src/core/processors/` | Processor implementations |
| `03-data-pipeline-service/src/app/routers/pipelines.py` | API router |
