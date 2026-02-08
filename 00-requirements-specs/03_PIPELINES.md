# Pipelines

**v2.1** | 2026-02-05

> ETL execution engine → async processing → BigQuery

---

## Pipeline Execution Workflow

```
1. Request: POST /pipelines/run/{org}/{provider}/{domain}/{pipeline}
2. Quota check → Subscription status (ACTIVE/TRIAL) + daily/monthly limits
3. Atomic reservation → Increment concurrent count
4. Config loaded → YAML template resolved with org_slug, env, date, run_id
5. Processor executes → Decrypt credentials → Extract → Transform → Load to BigQuery
6. On complete → Decrement concurrent, increment success/fail counters
7. Status: pending → validating → running → completed / failed
```

---

## Architecture

```
POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
     → Config (YAML) → Processor → BigQuery
```

---

## Pipeline Endpoints (Port 8001)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Execute pipeline |
| GET | `/pipelines/status/{org}/{run_id}` | Check run status |
| GET | `/pipelines/history/{org}` | List run history |

---

## Status Flow

`pending` → `validating` → `running` → `completed` / `failed`

---

## YAML Config Standard

Pipeline configs follow this structure at `configs/{provider}/{domain}/{pipeline}.yml`:

| Field | Purpose |
|-------|---------|
| `pipeline.name` | Pipeline identifier |
| `pipeline.provider` | Provider key (gcp, openai, etc.) |
| `pipeline.domain` | Domain (cost, api, unified) |
| `processor.class` | Processor class name |
| `processor.module` | Python module path |
| `target.dataset` | `{{org_slug}}_{{env}}` |
| `target.table` | Destination table name |

---

## Template Variables

| Template | Example |
|----------|---------|
| `{{org_slug}}` | acme_corp |
| `{{env}}` | prod |
| `{{date}}` | 2026-01-15 |
| `{{run_id}}` | run_abc123 |

---

## Quota Enforcement Standard

- Read subscription limits from **Supabase** (source of truth for plans)
- Self-healing: stale concurrent counters cleaned before reservation
- Atomic check-and-reserve via single SQL UPDATE with WHERE clauses
- Daily + monthly + concurrent limits enforced
- 429 error returned if any limit exceeded

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/{provider}/{domain}/*.yml` | Pipeline configs |
| `03-data-pipeline-service/src/core/processors/` | Processor implementations |
| `03-data-pipeline-service/src/app/routers/pipelines.py` | API router |
