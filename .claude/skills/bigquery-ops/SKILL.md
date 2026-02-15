---
name: bigquery-ops
description: |
  BigQuery operations for CloudAct. Schema management, table creation, queries, optimization,
  and data ingestion methods (streaming, batch, Storage Write API, MERGE).
  Use when: creating tables, modifying schemas, running queries, optimizing BigQuery performance,
  working with bootstrap schemas, org-specific datasets, or choosing insert methods.
---

# BigQuery Operations

## Overview

CloudAct uses BigQuery as its primary data store across 4 microservices. All data flows through BigQuery with strict schema-first approach, multi-tenant isolation via `org_slug`, and production-grade resilience (circuit breakers, retries, DLQ).

## GCP Projects

| Environment | GCP Project | BigQuery Location |
|-------------|-------------|-------------------|
| Test/Stage | `cloudact-testing-1` | `US` |
| Prod | `cloudact-prod` | `US` |

## Key Locations

| File | Service | Purpose |
|------|---------|---------|
| `02-api-service/src/core/engine/bq_client.py` | API (8000) | BQ client for org CRUD, bootstrap |
| `03-data-pipeline-service/src/core/engine/bq_client.py` | Pipeline (8001) | Enterprise BQ client with connection pooling |
| `03-data-pipeline-service/src/core/engine/org_bq_client.py` | Pipeline (8001) | Per-org client with tier-based limits |
| `03-data-pipeline-service/src/core/utils/bq_helpers.py` | Pipeline (8001) | Smart inserts, DLQ, idempotent insertIds |
| `03-data-pipeline-service/src/core/utils/bq_storage_writer.py` | Pipeline (8001) | **Storage Write API** concurrent inserts |
| `03-data-pipeline-service/src/core/processors/generic/bq_loader.py` | Pipeline (8001) | Data loader with MERGE for idempotent writes |
| `07-org-chat-backend/src/core/engine/bigquery.py` | Chat (8002) | BQ client for chat sessions/messages |
| `07-org-chat-backend/src/core/sessions/bq_session_store.py` | Chat (8002) | Conversation/message persistence |
| `02-api-service/configs/setup/bootstrap/schemas/*.json` | API (8000) | Bootstrap table schemas |
| `02-api-service/configs/setup/organizations/onboarding/schemas/*.json` | API (8000) | Org-specific table schemas |
| `04-inra-cicd-automation/bigquery-ops/` | CI/CD | Cleanup scripts, dataset listing |

---

## Data Write Methods — Where Used & Effectiveness

CloudAct uses **5 distinct BigQuery write methods**, each chosen for specific scenarios:

### Method 1: Streaming Inserts (`insert_rows_json`)

| Aspect | Detail |
|--------|--------|
| **Used By** | Chat Backend (8002), Pipeline Service (8001) for <100 rows |
| **Files** | `07-org-chat-backend/src/core/engine/bigquery.py:126-135`, `03-data-pipeline-service/src/core/utils/bq_helpers.py:333-439` |
| **Tables** | `org_chat_messages`, `org_chat_conversations`, `org_chat_tool_calls`, `pipeline_dlq` |
| **Idempotency** | SHA256-based `insertId` (1-minute dedup window) |
| **Effectiveness** | Best for real-time, low-volume (<100 rows). Rows visible in seconds. |
| **Limitations** | 90-minute streaming buffer (can't UPDATE/DELETE immediately), costs 2x more than batch loads, 500K rows/sec project limit |

```python
# bq_helpers.py — Smart streaming with DLQ
result = await insert_rows_smart(
    bq_client=client,
    table_id="project.organizations.org_chat_messages",
    rows=messages,
    org_slug="acme",
    key_fields=["conversation_id", "message_id"],  # For insertId generation
)
```

### Method 2: Batch Load Jobs (`load_table_from_file` / `load_table_from_json`)

| Aspect | Detail |
|--------|--------|
| **Used By** | Pipeline Service (8001) for >=100 rows |
| **Files** | `03-data-pipeline-service/src/core/utils/bq_helpers.py:442-525`, `03-data-pipeline-service/src/core/processors/generic/bq_loader.py:300-329` |
| **Tables** | All org-specific cost/usage tables |
| **Idempotency** | Via `WRITE_TRUNCATE` (full replace) or MERGE pattern |
| **Effectiveness** | Most cost-effective for bulk data. No streaming surcharge. Free for <10MB/month. |
| **Limitations** | Higher latency (job queuing). 1,500 load jobs/table/day quota. |

```python
# bq_helpers.py — Automatic switch at BATCH_LOAD_THRESHOLD=100 rows
result = await insert_rows_smart(
    bq_client=client,
    table_id="project.acme_prod.genai_openai_usage",
    rows=large_dataset,  # >=100 rows → batch load
    org_slug="acme",
    write_disposition="WRITE_APPEND",
)
```

### Method 3: MERGE DML (Idempotent Upserts)

| Aspect | Detail |
|--------|--------|
| **Used By** | Pipeline Service (8001) for re-runnable pipelines |
| **Files** | `03-data-pipeline-service/src/core/processors/generic/bq_loader.py:331-450` |
| **Tables** | All pipeline destination tables when `idempotent: true` in config |
| **Idempotency** | Composite key: `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` |
| **Effectiveness** | Prevents duplicates on pipeline re-runs. Zero data loss. |
| **Limitations** | 1,000 DML statements/table/day. Slower than streaming. UNNEST limited to ~500 rows/batch. |

```python
# bq_loader.py — MERGE with UNNEST pattern
# Config: idempotent: true, merge_keys: [org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date]
MERGE `project.acme_prod.cost_data` T
USING UNNEST([STRUCT(...)]) S
ON T.x_org_slug = S.x_org_slug AND T.x_pipeline_run_date = S.x_pipeline_run_date
WHEN MATCHED THEN UPDATE SET ...
WHEN NOT MATCHED THEN INSERT (...)
```

### Method 4: DML Queries (UPDATE/DELETE)

| Aspect | Detail |
|--------|--------|
| **Used By** | Chat Backend (8002) for soft deletes, title updates |
| **Files** | `07-org-chat-backend/src/core/sessions/bq_session_store.py` |
| **Tables** | `org_chat_conversations` (status updates, title changes) |
| **Effectiveness** | Fine for low-frequency mutations. Subject to 90-min streaming buffer. |
| **Limitations** | 1,000 DML/table/day. Cannot UPDATE rows in streaming buffer. |

### Method 5: Storage Write API (Concurrent High-Throughput) **NEW**

| Aspect | Detail |
|--------|--------|
| **Used By** | Pipeline Service (8001) for high-volume concurrent inserts |
| **Files** | `03-data-pipeline-service/src/core/utils/bq_storage_writer.py` |
| **Tables** | Any table needing 100+ rows/sec throughput |
| **Idempotency** | Default stream = best-effort. Committed stream = exactly-once with offsets. |
| **Effectiveness** | 2x cheaper than streaming inserts, no 90-min buffer, higher throughput per stream. |
| **Concurrency** | ThreadPoolExecutor with configurable workers (default 4, max 10). |

```python
from src.core.utils.bq_storage_writer import concurrent_insert, async_concurrent_insert

# Sync usage (in ThreadPoolExecutor context)
result = concurrent_insert(
    table_id="cloudact-prod.acme_prod.cost_data_standard_1_3",
    rows=cost_rows,          # Any size — auto-batched at 500 rows
    org_slug="acme",
    num_workers=4,           # 4 concurrent writers
    batch_size=500,          # Rows per append request
)
print(f"{result.total_rows_written} rows, {result.duration_ms:.0f}ms")

# Async usage (in FastAPI/pipeline context)
result = await async_concurrent_insert(
    table_id="cloudact-prod.acme_prod.genai_openai_usage",
    rows=usage_rows,
    org_slug="acme",
    num_workers=4,
)
```

---

## Method Selection Guide

```
How many rows?
├── <10 rows + real-time? → Streaming Insert (insert_rows_json)
├── 10-99 rows?           → Streaming Insert with insertId
├── 100-10K rows?         → Batch Load Job (load_table_from_file)
├── 10K+ rows + concurrent? → Storage Write API (concurrent_insert)  ← NEW
├── Re-runnable pipeline? → MERGE DML (idempotent: true)
└── Update/Delete?        → DML (UPDATE/DELETE)
```

| Criteria | Streaming | Batch Load | MERGE | Storage Write API |
|----------|-----------|------------|-------|-------------------|
| **Latency** | Seconds | Minutes | Seconds | Seconds |
| **Cost** | $$$  | $ | $$ | $$ |
| **Throughput** | Medium | High | Low | **Highest** |
| **Idempotency** | insertId (1min) | WRITE_TRUNCATE | Composite key | Offsets (committed) |
| **Row visibility** | Immediate | After job | Immediate | Immediate |
| **UPDATE after?** | 90-min wait | Immediate | Immediate | Immediate |
| **Concurrency** | Per-project cap | Queued | Serial | **Multi-stream** |

---

## Resilience Patterns

### Circuit Breaker

| Setting | Value | Service |
|---------|-------|---------|
| Failure threshold | 5 consecutive failures | Pipeline (8001), Chat (8002) |
| Reset timeout | 60 seconds | Both |
| States | closed → open → half_open → closed | Both |

```python
# Pipeline: via circuitbreaker library decorator
@circuit(failure_threshold=5, recovery_timeout=60)
def query(self, ...): ...

# Chat: custom CircuitBreaker class
class CircuitBreaker:
    fail_threshold=5, reset_timeout=60
```

### Retry Policy

| Setting | Value |
|---------|-------|
| Max attempts | 3 |
| Wait strategy | Exponential backoff (1s min, 10-30s max) |
| Retried errors | ConnectionError, TimeoutError, 503, 429 |
| NOT retried | 400 (BadRequest), 401 (Unauthenticated), 404 (NotFound) |

### Dead Letter Queue (DLQ)

Failed streaming insert rows go to `pipeline_dlq` table (time-partitioned on `failed_at`).

| Field | Type | Purpose |
|-------|------|---------|
| org_slug | STRING | Org identifier |
| source_table | STRING | Original target table |
| error_message | STRING | Error description (truncated 1000 chars) |
| raw_data | STRING | Failed row JSON (truncated 10K chars) |
| failed_at | TIMESTAMP | Failure time (partition key) |

### Connection Pooling

| Setting | Value | Notes |
|---------|-------|-------|
| pool_connections | 500 | Max connection pools to cache |
| pool_maxsize | 500 | Max connections per pool |
| pool_block | true | Backpressure when full (prevents OOM) |
| connection_timeout | 60s | Time to establish connection |
| read_timeout | 300s | Time to read response (large queries) |
| keepalive | 30s | TCP keepalive interval |

### Tier-Based Resource Limits (Per-Org)

| Plan | Concurrent Queries | Timeout | Max Bytes Billed |
|------|-------------------|---------|------------------|
| STARTER | 2 | 60s | 10GB |
| PROFESSIONAL | 5 | 180s | 100GB |
| SCALE | 10 | 300s | Unlimited |
| ENTERPRISE | 20 | 600s | Unlimited |

### Smart Query Timeouts

| Query Type | Timeout |
|------------|---------|
| Simple SELECT (<100 chars, no JOINs) | 30s |
| INSERT/UPDATE/DELETE/MERGE | 60s |
| Complex (JOINs, GROUP BY, CTEs) | 120s |
| Pipeline-configured | From step_config |

---

## Dataset Structure

```
BigQuery Project
├── organizations (shared meta dataset — 14+ tables)
│   ├── org_profiles, org_api_keys, org_subscriptions
│   ├── org_usage_quotas, org_integration_credentials
│   ├── org_meta_pipeline_runs, org_meta_dq_results
│   ├── org_audit_logs, org_pipeline_configs
│   ├── org_scheduled_pipeline_runs, org_pipeline_execution_queue
│   ├── org_cost_tracking, org_meta_state_transitions
│   ├── org_idempotency_keys
│   ├── org_chat_settings, org_chat_conversations     ← Chat
│   ├── org_chat_messages, org_chat_tool_calls         ← Chat
│   ├── org_notification_channels, org_notification_rules
│   └── pipeline_dlq                                    ← DLQ
└── {org_slug}_prod (per-org dataset — 6+ tables)
    ├── cost_data_standard_1_3       (FOCUS 1.3 unified)
    ├── contract_commitment_1_3
    ├── subscription_plans
    ├── subscription_plan_costs_daily
    ├── org_hierarchy
    ├── genai_*_usage / *_pricing
    └── cloud_*_billing_raw_daily
```

## CRITICAL: x_* Fields in Raw Data Tables

All org-specific raw data tables (in `{org_slug}_prod` dataset) have REQUIRED `x_*` fields:

| Field | Required In | Description |
|-------|-------------|-------------|
| `x_org_slug` | ALL raw tables | Org identifier (NOT `org_slug`) |
| `x_pipeline_id` | ALL pipeline tables | Pipeline template |
| `x_credential_id` | ALL pipeline tables | Credential used |
| `x_pipeline_run_date` | ALL pipeline tables | Data date (idempotency key) |
| `x_run_id` | ALL pipeline tables | Execution UUID |
| `x_ingested_at` | ALL pipeline tables | Write timestamp |
| `x_ingestion_date` | ALL pipeline tables | Partition key |

**Rule:** API (8000) = NO x_* fields. Pipeline (8001) = MUST have x_* fields.

## Security: 6-Layer Multi-Tenant Isolation

| Layer | Mechanism | Protects Against |
|-------|-----------|------------------|
| 1 | `org_slug` in all queries | Cross-org data access |
| 2 | API key SHA256 validation | Forged org_slug |
| 3 | Parameterized queries (`@param`) | SQL injection |
| 4 | `bind_org_slug()` via `functools.partial` | LLM prompt injection |
| 5 | Dry-run gate (10GB max) | Expensive query DoS |
| 6 | Dataset naming `{org_slug}_prod` | Storage-level leakage |
| 7 | KMS encryption for credentials | Credential theft |
| 8 | `^[a-z0-9_]{3,50}$` format enforcement | Slug injection |

## Cost Tracking

Every query's cost is tracked in `org_cost_tracking`:

| Field | Description |
|-------|-------------|
| bytes_processed | Actual bytes scanned |
| bytes_billed | Bytes billed (min 10MB) |
| duration_ms | Query execution time |
| estimated_cost_usd | `$5 per TB processed` |

## Environments

| Environment | GCP Project | Dataset Suffix | Credential File |
|-------------|-------------|----------------|-----------------|
| local | cloudact-testing-1 | `_local` | Application Default Credentials |
| stage | cloudact-testing-1 | `_stage` | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` |
| prod | cloudact-prod | `_prod` | `/Users/openclaw/.gcp/cloudact-prod.json` |

## Schema JSON Structure

```json
{
  "table_name": "table_id",
  "description": "Table purpose",
  "schema": [
    { "name": "field_name", "type": "STRING", "mode": "REQUIRED", "description": "..." }
  ],
  "clustering": ["field1", "field2"],
  "partitioning": { "type": "DAY", "field": "partition_field" }
}
```

## Instructions

### 1. Create New Table Schema
1. Create JSON schema in appropriate `configs/` location
2. Follow existing schema patterns
3. Include clustering for frequently filtered columns
4. Add partitioning for time-series data
5. Register in bootstrap or onboarding flow

### 2. Choose Insert Method
```
if real_time and rows < 100:     → streaming_insert() from bq_helpers.py
elif rows >= 100 and rows < 10K: → insert_rows_smart() from bq_helpers.py (auto-batch)
elif rows >= 10K or concurrent:  → concurrent_insert() from bq_storage_writer.py
elif idempotent re-runs needed:  → BQLoader with idempotent=true (MERGE)
elif need UPDATE/DELETE:         → DML via bq_client.query()
```

### 3. Optimize Query Performance
- Use partition pruning: `WHERE partition_date >= '2024-01-01'`
- Filter on clustering columns first
- Avoid `SELECT *` - specify needed columns
- Use `LIMIT` for exploratory queries
- Use dry-run to estimate cost before execution

## Example Prompts

```
# Insert Methods
"Insert 50K cost rows concurrently into BigQuery"
"Which insert method should I use for real-time chat messages?"
"How do I prevent duplicates on pipeline re-runs?"
"Show me the Storage Write API concurrent insert pattern"

# Schema Operations
"Create a new table schema for usage tracking"
"Add a column to the cost_data_standard_1_3 table"

# Querying
"Query total costs by provider for acme_corp"
"Get all pipeline runs from the last 24 hours"

# Optimization
"How can I optimize this BigQuery query?"
"Add clustering to improve query performance"

# Troubleshooting
"Query is scanning too much data"
"Streaming insert rows not visible for UPDATE"
"Circuit breaker is open for BigQuery"
```

## Development Rules (Non-Negotiable)

- **BigQuery best practices** - All tables MUST have clustering and partitioning. No exceptions.
- **Migrate existing tables** - When adding/modifying tables, add clustering/partitioning to existing ones too
- **Multi-tenancy support** - Proper `org_slug` isolation in every query (`WHERE org_slug = @org_slug`)
- **Enterprise-grade for 10k customers** - Must scale. Use connection pooling, tier-based limits, query timeouts.
- **LRU in-memory cache** - NO Redis at all. Use `functools.lru_cache` or custom LRU only.
- **No over-engineering** - Simple, direct queries. Don't add abstractions for one-time operations.
- **Parameterized queries only** - Never use f-strings for user input. Always `@param` syntax.
- **Don't break existing functionality** - Run all tests before/after schema changes

## Related Skills

- `pipeline-ops` - Pipeline management
- `bootstrap-onboard` - System initialization
- `config-validator` - Schema validation
- `cost-analysis` - Cost data queries
- `chat` - Chat backend BigQuery usage
