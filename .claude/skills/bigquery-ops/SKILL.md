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
| Table | Purpose | Key Fields |
|-------|---------|------------|
| profiles | User profiles | user_id, email, org_ids |
| api_keys | API key management | key_hash, org_id, scopes |
| subscription_plans | SaaS plan tracking | plan_id, provider, status |
| quotas | Usage quotas | org_id, quota_type, limit |
| integration_credentials | Encrypted creds | org_id, provider, encrypted_value |
| pipeline_runs | Run history | run_id, org_id, status, duration |
| dq_results | Data quality | check_id, table, passed |
| audit_logs | Audit trail | action, actor, timestamp |
| pipeline_configs | Pipeline definitions | config_id, yaml_content |
| scheduled_runs | Scheduled jobs | schedule_id, cron, next_run |
| execution_queue | Job queue | job_id, priority, status |
| cost_tracking | Cost metrics | org_id, service, amount |
| state_transitions | Workflow states | entity_id, from_state, to_state |
| idempotency_keys | Dedup keys | key, created_at, expires_at |

## 6 Org-Specific Tables ({org_slug}_prod dataset)
| Table | Purpose | Key Fields |
|-------|---------|------------|
| cost_data_standard_1_3 | FOCUS 1.3 costs | billing_period, provider, amount |
| contract_commitment_1_3 | Commitments | contract_id, commitment_value |
| saas_subscription_plans | SaaS subscriptions | plan_id, provider, price |
| saas_subscription_plan_costs_daily | Daily costs | date, plan_id, daily_cost |
| org_hierarchy | Org structure | entity_id, parent_id, type |
| llm_model_pricing | LLM pricing | model_id, input_price, output_price |

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
