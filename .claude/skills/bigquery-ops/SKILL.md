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
    ├── saas_subscription_plans
    ├── saas_subscription_plan_costs_daily
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
| saas_subscription_plans | SaaS subscriptions | org_slug, provider, price |
| saas_subscription_plan_costs_daily | Daily costs | org_slug, date, daily_cost |
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

## Related Skills
- `pipeline-ops` - Pipeline management
- `bootstrap-onboard` - System initialization
- `config-validator` - Schema validation
