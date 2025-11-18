# Pipeline Configuration Guide - Complete Reference

**Last Updated**: 2025-11-18
**Status**: Production Ready

## 📋 Table of Contents

1. [Pipeline Config Schema](#pipeline-config-schema)
2. [Common Mistakes & Fixes](#common-mistakes--fixes)
3. [Working Examples](#working-examples)
4. [Field Reference](#field-reference)
5. [Best Practices](#best-practices)

---

## 🔧 Pipeline Config Schema

### Required Root Fields

```yaml
pipeline_id: "unique_pipeline_id"  # REQUIRED - Must be unique
description: "Pipeline description"  # REQUIRED - What this pipeline does
```

**⚠️ CRITICAL**: Do NOT use nested `pipeline:` object. Fields must be at root level.

### Steps Array Structure

```yaml
steps:
  - step_id: "step_name"  # REQUIRED - Must be unique within pipeline
    name: "Human Readable Name"  # OPTIONAL
    description: "What this step does"  # OPTIONAL
    ps_type: "gcp.bq_etl"  # REQUIRED - Processor type
    timeout_minutes: 10  # OPTIONAL - Default varies by type
```

**⚠️ CRITICAL**: Use `step_id` NOT `id`. This is required by Pydantic validation.

---

## ❌ Common Mistakes & Fixes

### Mistake #1: Nested `pipeline` Object

**❌ WRONG:**
```yaml
pipeline:  # DON'T DO THIS!
  id: "my_pipeline"
  name: "My Pipeline"
  description: "Description"
```

**✅ CORRECT:**
```yaml
pipeline_id: "my_pipeline"  # At root level
description: "My Pipeline - Description"  # At root level
```

---

### Mistake #2: Using `id` Instead of `step_id`

**❌ WRONG:**
```yaml
steps:
  - id: "extract_data"  # WRONG FIELD NAME!
    name: "Extract Data"
```

**✅ CORRECT:**
```yaml
steps:
  - step_id: "extract_data"  # CORRECT!
    name: "Extract Data"
```

---

### Mistake #3: Wrong Destination Fields for BigQuery Steps

**❌ WRONG:**
```yaml
destination:
  bq_project_id: "project"
  dataset_id: "dataset"  # WRONG - Should be dataset_type
  table_id: "table"      # WRONG - Should be table
  write_disposition: "WRITE_APPEND"  # WRONG - Should be write_mode
```

**✅ CORRECT:**
```yaml
destination:
  bq_project_id: "project"
  dataset_type: "dataset"  # CORRECT
  table: "table"           # CORRECT
  write_mode: "append"     # CORRECT (lowercase: append, truncate, etc.)
```

---

###  Mistake #4: Missing Required Destination Fields

**Error Message:**
```
Field required [type=missing, input_value=..., input_type=dict]
For further information visit https://errors.pydantic.dev/2.5/v/missing
```

**❌ WRONG:**
```yaml
destination:
  bq_project_id: "project"
  # Missing dataset_type and table!
```

**✅ CORRECT:**
```yaml
destination:
  bq_project_id: "{project_id}"
  dataset_type: "{tenant_id}"  # REQUIRED
  table: "table_name"           # REQUIRED
  write_mode: "append"
```

---

### Mistake #5: Using `target` Instead of `destination`

**❌ WRONG:**
```yaml
target:  # WRONG FIELD NAME!
  bq_project_id: "project"
```

**✅ CORRECT:**
```yaml
destination:  # CORRECT!
  bq_project_id: "project"
```

---

## 📝 Working Examples

### Example 1: Simple Validation Pipeline (Dry Run)

```yaml
pipeline_id: "dryrun"
description: "Dry Run Validation Pipeline - Validates infrastructure and onboarding setup"

steps:
  - step_id: "dryrun_test"
    name: "Dry Run Test"
    description: "Test basic data operations to validate setup"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 5

    source:
      query: |
        SELECT
          'Dry run successful' as message,
          CURRENT_TIMESTAMP() as timestamp,
          '{tenant_id}' as tenant_id

    destination:
      bq_project_id: "{project_id}"
      dataset_type: "{tenant_id}"
      table: "onboarding_validation_test"
      write_mode: "append"

    retry_policy:
      max_retries: 1
      retry_delay_seconds: 5
```

---

### Example 2: GCP Cost Billing Pipeline

```yaml
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract GCP billing costs for tenant {tenant_id} - date {date}"

# Pipeline-level variables (can be overridden via API)
variables:
  source_billing_table: "project.dataset.gcp_billing_export"
  destination_dataset_type: "gcp_silver_cost"
  destination_table: "billing_cost_daily"

steps:
  - step_id: "extract_billing_costs"
    name: "Extract GCP Billing Costs"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 20

    source:
      bq_project_id: "source-project"
      query: |
        SELECT
          billing_account_id,
          service.description AS service_description,
          cost,
          usage_start_time,
          DATE(usage_start_time) AS usage_date
        FROM `{source_billing_table}`
        WHERE DATE(usage_start_time) = '{date}'

    destination:
      bq_project_id: "target-project"
      dataset_type: "{destination_dataset_type}"
      table: "{destination_table}"
      write_mode: "append"
      schema_template: "billing_cost"
      table_config:
        time_partitioning:
          field: "usage_date"
          type: "DAY"
          expiration_days: 730
        clustering_fields:
          - "billing_account_id"
          - "service_description"
```

---

## 📚 Field Reference

### Root Level Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `pipeline_id` | ✅ Yes | string | Unique pipeline identifier |
| `description` | ✅ Yes | string | Pipeline description |
| `variables` | ❌ No | object | Pipeline-level variables |
| `steps` | ✅ Yes | array | Array of step configurations |

---

### Step Level Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `step_id` | ✅ Yes | string | Unique step identifier |
| `name` | ❌ No | string | Human-readable name |
| `description` | ❌ No | string | Step description |
| `ps_type` | ✅ Yes | string | Processor type (e.g., `gcp.bq_etl`) |
| `timeout_minutes` | ❌ No | integer | Step timeout (default varies) |
| `source` | ✅ Yes* | object | Source configuration |
| `destination` | ✅ Yes* | object | Destination configuration |
| `retry_policy` | ❌ No | object | Retry configuration |

\* Required for BigQuery steps

---

### Source Configuration (BigQuery)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `bq_project_id` | ❌ No | string | Source project (defaults to main project) |
| `query` | ✅ Yes | string | SQL query to execute |

**Example:**
```yaml
source:
  bq_project_id: "my-project"  # Optional
  query: |
    SELECT * FROM `dataset.table`
    WHERE date = '{date}'
```

---

### Destination Configuration (BigQuery)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `bq_project_id` | ✅ Yes | string | Target project ID |
| `dataset_type` | ✅ Yes | string | Target dataset (supports variables) |
| `table` | ✅ Yes | string | Target table name |
| `write_mode` | ❌ No | string | `append`, `truncate`, or `write_empty` |
| `schema_template` | ❌ No | string | Schema template to use |
| `table_config` | ❌ No | object | Table partitioning/clustering |

**Example:**
```yaml
destination:
  bq_project_id: "{project_id}"
  dataset_type: "{tenant_id}"
  table: "my_table"
  write_mode: "append"
  schema_template: "cost_schema"
  table_config:
    time_partitioning:
      field: "date"
      type: "DAY"
    clustering_fields:
      - "account_id"
```

---

### Retry Policy

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `max_retries` | ❌ No | integer | Maximum retry attempts (default: 3) |
| `retry_delay_seconds` | ❌ No | integer | Delay between retries (default: 5) |

**Example:**
```yaml
retry_policy:
  max_retries: 3
  retry_delay_seconds: 10
```

---

## ✅ Best Practices

### 1. Use Template Variables

**Good:**
```yaml
pipeline_id: "{tenant_id}-cost-pipeline"
description: "Cost pipeline for {tenant_id} on {date}"

destination:
  dataset_type: "{tenant_id}"
  table: "costs_{date}"
```

**Why:** Enables dynamic configuration per tenant/execution

---

### 2. Always Include Timeouts

**Good:**
```yaml
steps:
  - step_id: "extract"
    timeout_minutes: 30  # Explicit timeout
```

**Why:** Prevents hung pipelines, better error handling

---

### 3. Use Descriptive IDs and Names

**Good:**
```yaml
pipeline_id: "gcp-billing-daily-extract"
steps:
  - step_id: "extract_billing_costs"
    name: "Extract Daily Billing Costs"
    description: "Pulls billing data from GCP export table for specified date"
```

**Why:** Easier debugging, better logs, clearer intent

---

### 4. Include Retry Policies for External Calls

**Good:**
```yaml
steps:
  - step_id: "api_call"
    retry_policy:
      max_retries: 3
      retry_delay_seconds: 5
```

**Why:** Handles transient failures gracefully

---

### 5. Use Partitioning for Large Tables

**Good:**
```yaml
destination:
  table_config:
    time_partitioning:
      field: "ingestion_date"
      type: "DAY"
      expiration_days: 365
```

**Why:** Better performance, automatic data lifecycle management

---

## 🐛 Debugging Tips

### Error: "Field required"

**Cause:** Missing required field in Pydantic validation

**Solution:** Check error message for exact field path and add missing field

### Error: "Value error, BigQuery to BigQuery step must have 'destination' configuration"

**Cause:** Missing or incorrectly named destination block

**Solution:** Ensure `destination:` block exists with all required fields

### Error: "Multiple pipelines found with ID 'X'"

**Cause:** Duplicate pipeline_id across different config files

**Solution:** Use unique pipeline_ids or organize configs in separate directories

---

## 📄 Schema Validation

All pipeline configs are validated against `PipelineConfig` Pydantic model.

**Validation happens at:**
1. Pipeline load time
2. Before execution
3. API request validation

**Common validation errors:**
- Missing required fields
- Wrong field types
- Invalid enum values
- Nested structure mismatch

---

## 🔗 Related Documentation

- [Onboarding Process](./SETUP_COMPLETE.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Docker Testing](./DOCKER_TESTING.md)
- [CLAUDE.md](../CLAUDE.md) - Project mandates

---

*Generated from production experience - Nov 2025*
*All examples tested and verified in production*
