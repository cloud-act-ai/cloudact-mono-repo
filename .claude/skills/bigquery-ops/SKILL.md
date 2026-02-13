---
name: bigquery-ops
description: |
  BigQuery operations for CloudAct. Schema management, table creation, queries, and optimization.
  Use when: creating tables, modifying schemas, running queries, optimizing BigQuery performance,
  working with bootstrap schemas, or org-specific datasets.
---

# BigQuery Operations

## Overview
CloudAct uses BigQuery as its primary data store with strict schema-first approach via JSON configs.

## GCP Projects

| Environment | GCP Project | BigQuery Location |
|-------------|-------------|-------------------|
| Test/Stage | `cloudact-testing-1` | `US` |
| Prod | `cloudact-prod` | `US` |

## Key Locations
- **Bootstrap Schemas:** `02-api-service/configs/setup/bootstrap/schemas/*.json`
- **Org Schemas:** `02-api-service/configs/setup/organizations/onboarding/schemas/*.json`
- **BQ Client:** `02-api-service/src/core/engine/bq_client.py`
- **Pipeline BQ Client:** `03-data-pipeline-service/src/core/engine/bq_client.py`

## Dataset Structure
```
BigQuery Project
├── organizations (shared meta dataset)
│   ├── profiles
│   ├── api_keys
│   ├── subscription_plans
│   ├── quotas
│   ├── integration_credentials
│   ├── pipeline_runs
│   ├── dq_results
│   ├── audit_logs
│   ├── pipeline_configs
│   ├── scheduled_runs
│   ├── execution_queue
│   ├── cost_tracking
│   ├── state_transitions
│   └── idempotency_keys
└── {org_slug}_prod (per-org dataset)
    ├── cost_data_standard_1_3
    ├── contract_commitment_1_3
    ├── subscription_plans
    ├── subscription_plan_costs_daily
    ├── org_hierarchy
    └── llm_model_pricing
```

## Schema JSON Structure
```json
{
  "table_name": "table_id",
  "description": "Table purpose",
  "schema": [
    {
      "name": "field_name",
      "type": "STRING|INTEGER|FLOAT|BOOLEAN|TIMESTAMP|DATE|RECORD|JSON",
      "mode": "REQUIRED|NULLABLE|REPEATED",
      "description": "Field purpose"
    }
  ],
  "clustering": ["field1", "field2"],
  "partitioning": {
    "type": "DAY|MONTH|YEAR",
    "field": "partition_field"
  },
  "labels": {
    "env": "production",
    "service": "cloudact"
  }
}
```

## Instructions

### 1. Create New Table Schema
1. Create JSON schema in appropriate `configs/` location
2. Follow existing schema patterns
3. Include clustering for frequently filtered columns
4. Add partitioning for time-series data
5. Register in bootstrap or onboarding flow

### 2. Query BigQuery
```python
# Using BQ Client
from src.core.engine.bq_client import BigQueryClient

client = BigQueryClient()
results = await client.query(
    f"SELECT * FROM `{project}.{org_slug}_prod.table_name` LIMIT 100"
)
```

### 3. Add Column to Existing Table
```sql
-- NEVER run directly - use pipeline or API
ALTER TABLE `project.dataset.table`
ADD COLUMN new_field STRING;
```

### 4. Optimize Query Performance
- Use partition pruning: `WHERE partition_date >= '2024-01-01'`
- Filter on clustering columns first
- Avoid `SELECT *` - specify needed columns
- Use `LIMIT` for exploratory queries

### 5. Cost Estimation
```sql
-- Dry run to estimate bytes scanned
SELECT * FROM `project.dataset.table`
WHERE partition_date = CURRENT_DATE()
-- Check "Bytes processed" in dry run
```

## CRITICAL: x_* Fields in Raw Data Tables

All org-specific raw data tables (in `{org_slug}_prod` dataset) have REQUIRED `x_*` fields in their BigQuery schemas. Loading NDJSON data without these fields fails with "Missing required fields":

| Field | Required In | Description |
|-------|-------------|-------------|
| `x_org_slug` | ALL raw tables | Org identifier (NOT `org_slug` — must have `x_` prefix) |
| `x_ingestion_id` | ALL raw tables | UUID per record |
| `x_ingestion_date` | ALL raw tables | Date string: `YYYY-MM-DD` |
| `x_cloud_provider` | Cloud raw tables | `gcp`, `aws`, `azure`, `oci` |
| `x_genai_provider` | GenAI raw tables | `openai`, `anthropic`, `gemini` |

**Note:** Meta tables in `organizations` dataset use `org_slug` (no prefix). Only pipeline/org-specific tables use `x_org_slug`.

Schemas: `02-api-service/configs/setup/organizations/onboarding/schemas/*.json`

## 14 Bootstrap Tables (organizations dataset)

**Note:** All tables use `org_slug` as the tenant identifier (NOT `org_id`).

| Table | Purpose | Key Fields |
|-------|---------|------------|
| org_profiles | Org profiles | org_slug, name, status |
| org_api_keys | API key management | key_hash, org_slug, scopes |
| org_subscriptions | SaaS plan tracking | org_slug, provider, status |
| org_usage_quotas | Usage quotas | org_slug, quota_type, limit |
| org_integration_credentials | Encrypted creds | org_slug, provider, encrypted_value |
| org_meta_pipeline_runs | Run history | run_id, org_slug, status |
| org_meta_dq_results | Data quality | org_slug, table, passed |
| org_audit_logs | Audit trail | org_slug, action, timestamp |
| org_pipeline_configs | Pipeline definitions | org_slug, config_id, yaml_content |
| org_scheduled_pipeline_runs | Scheduled jobs | org_slug, cron, next_run |
| org_pipeline_execution_queue | Job queue | org_slug, priority, status |
| org_cost_tracking | Cost metrics | org_slug, service, amount |
| org_meta_state_transitions | Workflow states | org_slug, from_state, to_state |
| org_idempotency_keys | Dedup keys | org_slug, key, expires_at |

## 6+ Org-Specific Tables ({org_slug}_prod dataset)

**Note:** These tables have `org_slug` embedded in the dataset name for isolation.

| Table | Purpose | Key Fields |
|-------|---------|------------|
| cost_data_standard_1_3 | FOCUS 1.3 costs | SubAccountId (=org_slug), provider, amount |
| contract_commitment_1_3 | Commitments | contract_id, commitment_value |
| subscription_plans | SaaS subscriptions | org_slug, provider, price |
| subscription_plan_costs_daily | Daily costs | org_slug, date, daily_cost |
| org_hierarchy | Org structure | org_slug, entity_id, parent_id |
| genai_*_pricing | GenAI pricing | org_slug, model, input_price, output_price |

## Validation Checklist
- [ ] Schema JSON valid syntax
- [ ] Field types appropriate for data
- [ ] Required fields marked correctly
- [ ] Clustering columns exist and are filterable
- [ ] Partition field is DATE/TIMESTAMP
- [ ] Table description meaningful

## Common Patterns
```python
# Batch insert with Polars
import polars as pl
from google.cloud import bigquery

df = pl.DataFrame(data)
client.load_table_from_dataframe(
    df.to_pandas(),
    f"{project}.{dataset}.{table}",
    job_config=bigquery.LoadJobConfig(
        write_disposition="WRITE_APPEND"
    )
)
```

## Example Prompts

```
# Schema Operations
"Create a new table schema for usage tracking"
"Add a column to the cost_data_standard_1_3 table"
"What's the schema for org_hierarchy table?"

# Querying
"Query total costs by provider for acme_corp"
"Get all pipeline runs from the last 24 hours"
"Show me the top 10 most expensive LLM models"

# Optimization
"How can I optimize this BigQuery query?"
"Add clustering to improve query performance"
"What partition strategy should I use for daily costs?"

# Troubleshooting
"Query is scanning too much data"
"Table not found error in BigQuery"
```

## Environments

| Environment | GCP Project | Dataset Suffix | Credential File |
|-------------|-------------|----------------|-----------------|
| local | cloudact-testing-1 | `_local` | Application Default Credentials |
| stage | cloudact-testing-1 | `_stage` | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` |
| prod | cloudact-prod | `_prod` | `/Users/openclaw/.gcp/cloudact-prod.json` |

```bash
# Switch credentials
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json  # stage
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json                    # prod
```

**Protected datasets (prod only):** `gcp_billing_cud_dataset`, `gcp_cloud_billing_dataset`

## Testing

### Schema Validation
```bash
# Verify bootstrap table count
bq ls --project_id=cloudact-testing-1 organizations | wc -l
# Expected: 23+ tables

# Check org dataset exists
bq show --project_id=cloudact-testing-1 {org_slug}_local
```

### Query Testing
```bash
# Cost data check
bq query --nouse_legacy_sql \
  "SELECT ServiceCategory, COUNT(*) as rows, SUM(BilledCost) as total FROM \`cloudact-testing-1.{org}_local.cost_data_standard_1_3\` GROUP BY 1"

# Pipeline run history
bq query --nouse_legacy_sql \
  "SELECT pipeline_id, status, started_at FROM \`cloudact-testing-1.organizations.org_meta_pipeline_runs\` WHERE org_slug='{org}' ORDER BY started_at DESC LIMIT 5"
```

### Multi-Environment
```bash
# Stage
bq query --project_id=cloudact-testing-1 --nouse_legacy_sql "SELECT COUNT(*) FROM \`organizations.org_profiles\`"

# Prod
bq query --project_id=cloudact-prod --nouse_legacy_sql "SELECT COUNT(*) FROM \`organizations.org_profiles\`"
```

## Source Specifications

Requirements consolidated from:
- `COST_DATA_ARCHITECTURE.md` - Unified FOCUS 1.3 table and data flow

## Related Skills
- `pipeline-ops` - Pipeline management
- `bootstrap-onboard` - System initialization
- `config-validator` - Schema validation
- `i18n-locale` - `org_profiles` stores locale settings in BQ
