# Metadata Schema Documentation

This document describes the metadata tables used for tracking pipeline execution and data quality.

## Overview

Metadata tables are automatically created per-tenant when pipelines execute. All tables use:
- **Partitioning** for efficient querying by time
- **Clustering** for query optimization on frequently filtered columns
- **JSON types** for flexible schema evolution

## Schema Files Location

All metadata schemas are defined in JSON format at:
```
configs/metadata/schemas/
├── pipeline_runs.json
├── step_logs.json
├── api_keys.json
└── dq_results.json
```

## Tables

### 1. `pipeline_runs`

Tracks overall pipeline execution runs.

**Partitioning**: Daily partitions by `start_time`
**Clustering**: `tenant_id`, `pipeline_id`, `status`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| `pipeline_logging_id` | STRING | REQUIRED | Unique UUID for this pipeline execution instance |
| `pipeline_id` | STRING | REQUIRED | Pipeline identifier matching YAML filename |
| `tenant_id` | STRING | REQUIRED | Tenant identifier for multi-tenancy isolation |
| `status` | STRING | REQUIRED | Execution status: PENDING, RUNNING, COMPLETED, FAILED |
| `trigger_type` | STRING | REQUIRED | How pipeline was triggered: api, scheduler, manual, webhook, retry |
| `trigger_by` | STRING | REQUIRED | Identity who/what triggered the pipeline |
| `start_time` | TIMESTAMP | REQUIRED | UTC timestamp when pipeline started (partition key) |
| `end_time` | TIMESTAMP | NULLABLE | UTC timestamp when pipeline completed |
| `duration_ms` | INTEGER | NULLABLE | Total execution time in milliseconds |
| `config_version` | STRING | NULLABLE | Version/Git SHA of pipeline configuration |
| `worker_instance` | STRING | NULLABLE | Worker/pod/instance that executed the pipeline |
| `error_message` | STRING | NULLABLE | Error details if pipeline failed |
| `parameters` | JSON | NULLABLE | Runtime parameters as flexible JSON object |

**Example Query**:
```sql
SELECT
  pipeline_id,
  status,
  start_time,
  duration_ms,
  parameters
FROM `project.tenant_metadata.pipeline_runs`
WHERE start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND status = 'FAILED'
ORDER BY start_time DESC
```

---

### 2. `step_logs`

Tracks individual step executions within pipelines.

**Partitioning**: Daily partitions by `start_time`
**Clustering**: `pipeline_logging_id`, `status`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| `step_logging_id` | STRING | REQUIRED | Unique UUID for this step execution |
| `pipeline_logging_id` | STRING | REQUIRED | Foreign key to pipeline_runs table |
| `step_name` | STRING | REQUIRED | Step identifier from pipeline YAML (step_id) |
| `step_type` | STRING | REQUIRED | Type: bigquery_to_bigquery, data_quality, api_call, etc. |
| `step_index` | INTEGER | REQUIRED | Zero-based position in pipeline definition |
| `status` | STRING | REQUIRED | Execution status: PENDING, RUNNING, COMPLETED, FAILED, SKIPPED |
| `start_time` | TIMESTAMP | REQUIRED | UTC timestamp when step started (partition key) |
| `end_time` | TIMESTAMP | NULLABLE | UTC timestamp when step completed |
| `duration_ms` | INTEGER | NULLABLE | Step execution time in milliseconds |
| `rows_processed` | INTEGER | NULLABLE | Number of rows processed/written |
| `error_message` | STRING | NULLABLE | Error details if step failed |
| `metadata` | JSON | NULLABLE | Step-specific metadata as flexible JSON object |

**Example Query**:
```sql
SELECT
  pl.pipeline_id,
  sl.step_name,
  sl.duration_ms,
  sl.rows_processed
FROM `project.tenant_metadata.step_logs` sl
JOIN `project.tenant_metadata.pipeline_runs` pl
  ON sl.pipeline_logging_id = pl.pipeline_logging_id
WHERE sl.start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  AND sl.status = 'COMPLETED'
ORDER BY sl.duration_ms DESC
LIMIT 10
```

---

### 3. `api_keys`

Manages API keys for tenant authentication.

**No Partitioning** (reference data)

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| `api_key_id` | STRING | REQUIRED | Unique UUID for this API key |
| `tenant_id` | STRING | REQUIRED | Tenant this key belongs to |
| `api_key_hash` | STRING | REQUIRED | Cryptographically hashed API key (never plaintext) |
| `created_at` | TIMESTAMP | REQUIRED | When key was generated |
| `created_by` | STRING | NULLABLE | User/service that created the key |
| `expires_at` | TIMESTAMP | NULLABLE | Expiration timestamp (NULL = never expires) |
| `is_active` | BOOLEAN | REQUIRED | Whether key is currently active |
| `last_used_at` | TIMESTAMP | NULLABLE | Most recent successful authentication |
| `description` | STRING | NULLABLE | Human-readable label/purpose |

---

### 4. `dq_results`

Stores data quality validation results.

**Partitioning**: Daily partitions by `ingestion_date`
**Clustering**: `tenant_id`, `target_table`, `overall_status`

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| `dq_result_id` | STRING | REQUIRED | Unique UUID for this DQ check |
| `pipeline_logging_id` | STRING | REQUIRED | Foreign key to pipeline_runs table |
| `tenant_id` | STRING | REQUIRED | Tenant identifier |
| `target_table` | STRING | REQUIRED | Fully qualified table that was validated |
| `dq_config_id` | STRING | REQUIRED | DQ configuration/expectation suite identifier |
| `executed_at` | TIMESTAMP | REQUIRED | When DQ validation was executed |
| `expectations_passed` | INTEGER | REQUIRED | Count of passed expectations |
| `expectations_failed` | INTEGER | REQUIRED | Count of failed expectations |
| `failed_expectations` | JSON | NULLABLE | Details of failures as JSON array |
| `overall_status` | STRING | REQUIRED | Outcome: PASS, WARNING, FAIL |
| `ingestion_date` | DATE | REQUIRED | Partition column (DATE of executed_at) |

**Example Query**:
```sql
SELECT
  target_table,
  overall_status,
  expectations_passed,
  expectations_failed,
  executed_at
FROM `project.tenant_metadata.dq_results`
WHERE ingestion_date = CURRENT_DATE()
  AND overall_status = 'FAIL'
ORDER BY executed_at DESC
```

---

## Schema Evolution

To update metadata schemas:

1. Edit the JSON schema file in `configs/metadata/schemas/`
2. Use the `recreate=True` flag in MetadataInitializer:
   ```python
   initializer._ensure_pipeline_runs_table(dataset_name, recreate=True)
   ```
3. Tables will be deleted and recreated with new schema

**Note**: Recreation deletes all existing data. For production, use ALTER TABLE or create new versioned tables.

---

## JSON Type Fields

The following fields use BigQuery JSON type for flexibility:

- `pipeline_runs.parameters` - Runtime pipeline parameters
- `step_logs.metadata` - Step-specific execution details
- `dq_results.failed_expectations` - DQ failure details

These allow schema-free data storage without table alterations.

**Example JSON data**:
```json
{
  "parameters": {
    "date": "2025-11-15",
    "batch_size": 1000,
    "filters": {"region": "US"}
  },
  "metadata": {
    "destination_table": "dataset.table",
    "bytes_processed": 12345678,
    "query_cost_usd": 0.05
  }
}
```

---

## Automatic Table Creation

Metadata tables are created automatically when:

1. A pipeline is executed for a tenant
2. The tenant's metadata dataset doesn't exist yet
3. Pipeline uses metadata logging (default behavior)

Tables are created from JSON schema definitions in `configs/metadata/schemas/`, ensuring:
- Consistent schema across environments
- Version-controlled table definitions
- Easy schema updates via configuration
