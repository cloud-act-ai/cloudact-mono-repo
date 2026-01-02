---
name: pipeline-metadata-fields
enabled: true
event: all
pattern: (x_pipeline_id|x_credential_id|x_pipeline_run_date|x_run_id|x_ingested_at)
action: warn
---

**Pipeline Metadata Fields (x_* fields) - Service Boundary Rule**

`x_*` fields are **Pipeline Service (8001) ONLY** - NEVER in API Service (8000).

| Field | Purpose | API Service | Pipeline Service |
|-------|---------|-------------|------------------|
| `x_pipeline_id` | Which pipeline wrote data | NEVER | REQUIRED |
| `x_credential_id` | Integration credential used | NEVER | REQUIRED |
| `x_pipeline_run_date` | Date being processed | NEVER | REQUIRED |
| `x_run_id` | Pipeline execution UUID | NEVER | REQUIRED |
| `x_ingested_at` | Pipeline write timestamp | NEVER | REQUIRED |

**API Service schemas (02-api-service/) - NO x_* fields:**
- `subscription_plans.json` - CRUD via REST API
- `genai_*_pricing.json` - Seed/reference data
- `org_hierarchy` - CRUD via REST API
- Bootstrap schemas - System initialization

**Pipeline Service schemas (03-data-pipeline-service/) - MUST have x_* fields:**
- `*_costs_daily` - Pipeline-generated costs
- `*_usage_raw` - Pipeline-ingested usage
- `*_unified` - Pipeline-consolidated data
- `billing_cost.json` - Cloud cost pipelines

**Why this matters:**
- API CRUD operations have no pipeline context
- Pipeline metadata enables: idempotency, traceability, re-runs
- Mixing them causes `Required field x_pipeline_id cannot be null` errors
