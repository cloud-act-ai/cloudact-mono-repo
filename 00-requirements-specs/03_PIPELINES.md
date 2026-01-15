# Pipelines

**v2.0** | 2026-01-15

> ETL execution engine → async processing → BigQuery

---

## Architecture

```
POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
     → Config (YAML) → Processor → BigQuery
```

---

## Pipeline Execution (Port 8001)

```bash
# Run pipeline
POST /api/v1/pipelines/run/{org}/gcp/cost/billing
POST /api/v1/pipelines/run/{org}/openai/cost/usage_cost

# Status
GET  /api/v1/pipelines/status/{org}/{run_id}
GET  /api/v1/pipelines/history/{org}
```

---

## Status Flow

`pending` → `validating` → `running` → `completed` / `failed`

---

## Config Structure

```yaml
# configs/{provider}/{domain}/{pipeline}.yml
pipeline:
  name: gcp_billing
  provider: gcp
  domain: cost

processor:
  class: ExternalBQExtractor
  module: src.core.processors.gcp.external_bq_extractor

target:
  dataset: "{{org_slug}}_{{env}}"
  table: cloud_gcp_billing_raw_daily
```

---

## Template Variables

| Template | Example |
|----------|---------|
| `{{org_slug}}` | acme_corp |
| `{{env}}` | prod |
| `{{date}}` | 2025-12-04 |
| `{{run_id}}` | run_abc123 |

---

## Quota Enforcement

- Check `org_subscriptions.status` (ACTIVE/TRIAL only)
- Check `pipelines_per_day_limit`

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/{provider}/{domain}/*.yml` | Configs |
| `03-data-pipeline-service/src/core/processors/` | Processors |
| `03-data-pipeline-service/src/app/routers/pipelines.py` | API |
