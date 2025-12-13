# Pipeline Service (Port 8001)

## Gist

Pipeline execution engine for ETL jobs. Runs scheduled pipelines, processes usage data, calculates costs. This service executes pipelines only - integrations, onboarding, and LLM data CRUD are handled by `02-api-service`.

**Full Platform Architecture:** `../00-requirements-docs/00-ARCHITECTURE.md`

**Security Documentation:** `SECURITY.md`

**Root Documentation:** `../CLAUDE.md` (service overview, folder structure, development commands)

---

## Core Principle

**Everything is a Pipeline** - No raw SQL, no Alembic, no direct DDL.

```
API Request → configs/ → Processor → BigQuery API
```

**Single Source of Truth:** All configs, schemas, and pipeline definitions live in `configs/`

---

## Pipeline Flow

```
API Request (X-API-Key)
    │
    ├─ POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
    │   │
    │   ├─ Validate subscription status (ACTIVE or TRIAL)
    │   ├─ Load config: configs/{provider}/{domain}/{pipeline}.yml
    │   ├─ Decrypt credentials from BigQuery (KMS)
    │   ├─ Execute processor: src/core/processors/{provider}/{domain}.py
    │   │   └─ Extract → Transform → Load to BigQuery
    │   └─ Log to org_meta_pipeline_runs
    │
    └─ Scheduled Jobs (Cloud Scheduler)
        └─ Daily/Monthly: Run pipelines for all orgs
```

---

## Pipeline Architecture

### Config Structure (Single Source of Truth)

```
configs/
├── anthropic/
│   └── usage_cost.yml                      # Daily: extract usage → transform cost
├── openai/
│   ├── cost/
│   │   ├── cost_calculation.yml            # Cost calculation pipeline
│   │   ├── cost_extract.yml                # Cost extraction pipeline
│   │   └── usage_cost.yml                  # Combined usage + cost pipeline
│   └── subscriptions.yml                   # Monthly: subscription data
├── gcp/
│   └── cost/
│       ├── billing.yml                     # GCP billing pipeline
│       └── schemas/
│           └── billing_cost.json           # BQ table schema
├── saas_subscription/
│   └── costs/
│       └── saas_cost.yml                   # SaaS subscription cost pipeline
├── example/
│   ├── finance/
│   │   └── subscription_costs_transform.yml
│   └── usage/
│       └── example_elt_pipeline.yml
├── notify_systems/
│   ├── email_notification/
│   │   └── config.yml
│   └── slack_notification/
│       └── config.yml
└── system/
    ├── dataset_types.yml                   # Dataset type definitions
    ├── providers.yml                       # Provider registry (IMPORTANT)
    └── procedures/                         # Stored procedures
        └── {domain}/*.sql
```

**Key Config: `providers.yml`** - Single source of truth for all provider configurations including:
- LLM providers: OPENAI, ANTHROPIC, CLAUDE
- Cloud providers: GCP_SA
- Data table configurations
- API URLs, auth headers, validation models
- Provider aliases

### Processors (Execution Engines)

Processors are the **execution engines** that do the actual work:
- Read configuration from `configs/`
- Execute business logic (BigQuery operations, validations, notifications)
- Return structured results for logging

```
src/core/processors/
├── openai/
│   ├── authenticator.py                    # OpenAI API authentication
│   ├── usage.py                            # Extract usage data (ps_type: openai.usage)
│   ├── cost.py                             # Calculate costs (ps_type: openai.cost)
│   ├── subscriptions.py                    # Subscription management
│   ├── seed_csv.py                         # Seed pricing from CSV (ps_type: openai.seed_csv)
│   └── validation.py                       # Validate OpenAI credentials
├── anthropic/
│   ├── authenticator.py                    # Anthropic API authentication
│   ├── usage.py                            # Extract usage data (ps_type: anthropic.usage)
│   ├── cost.py                             # Calculate costs (ps_type: anthropic.cost)
│   └── validation.py                       # Validate Anthropic credentials
├── gcp/
│   ├── authenticator.py                    # GCP authentication (shared OAuth2)
│   ├── external_bq_extractor.py            # BigQuery ETL (ps_type: gcp.bq_etl)
│   ├── gcp_api_extractor.py                # GCP REST API extraction (ps_type: gcp.api_extractor)
│   └── validation.py                       # Validate GCP credentials
├── generic/
│   ├── api_extractor.py                    # Generic API extraction (ps_type: generic.api_extractor)
│   ├── local_bq_transformer.py             # Local BQ transformation (ps_type: generic.local_bq_transformer)
│   └── procedure_executor.py               # Execute stored procedures (ps_type: generic.procedure_executor)
├── integrations/
│   ├── kms_store.py                        # Encrypt & store credentials
│   ├── kms_decrypt.py                      # Decrypt credentials for use
│   ├── validate_openai.py                  # Validate OpenAI API key
│   ├── validate_claude.py                  # Validate Claude/Anthropic key
│   └── validate_gcp.py                     # Validate GCP Service Account
└── notify_systems/
    └── email_notification.py               # Email notifications
```

#### Processor Execution Flow

```
API Request
     │
     ▼
┌─────────────────┐
│  Pipeline YAML  │  configs/{provider}/{domain}/{pipeline}.yml
│  + Schemas      │  configs/{provider}/{domain}/schemas/*.json
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pipeline       │  src/core/pipeline/async_executor.py
│  Executor       │  - Loads config, resolves variables
└────────┬────────┘  - Calls processor.execute(step_config, context)
         │
         ▼
┌─────────────────┐
│  PROCESSOR      │  src/core/processors/{provider}/{domain}.py
│  (Engine)       │  - THE HEART OF THE SYSTEM
└────────┬────────┘  - Loads schemas from configs/
         │           - Executes BigQuery operations
         │           - Returns result dict
         ▼
┌─────────────────┐
│  BigQuery API   │  via src/core/engine/bq_client.py
└─────────────────┘
```

#### Key Processors

**1. GCP BigQuery Extractor (`gcp.bq_etl`)**
- File: `src/core/processors/gcp/external_bq_extractor.py`
- Extract data from external BigQuery sources
- Loads schema from `configs/gcp/cost/schemas/billing_cost.json`

**2. GCP API Extractor (`gcp.api_extractor`)**
- File: `src/core/processors/gcp/gcp_api_extractor.py`
- Extract data from any GCP REST API (Billing, Compute, Monitoring, IAM, etc.)
- Uses shared `GCPAuthenticator` for OAuth2 Service Account auth
- GCP `nextPageToken` pagination pattern
- ELT pattern: stores raw JSON, transform via SQL
- See: `docs/GCP_API_EXTRACTOR.md`

**3. Generic API Extractor (`generic.api_extractor`)**
- File: `src/core/processors/generic/api_extractor.py`
- Generic API data extraction with multiple auth types
- Memory-safe streaming with configurable batch size
- See: Generic API Extractor section below

**4. Procedure Executor (`generic.procedure_executor`)**
- File: `src/core/processors/generic/procedure_executor.py`
- Execute stored procedures in BigQuery
- Used by SaaS subscription cost pipeline

**5. Email Notification Processor (`notify_systems.email_notification`)**
- File: `src/core/processors/notify_systems/email_notification.py`
- Send email notifications for pipeline events
- Triggers: on_failure, on_success, on_completion, always

#### Creating a New Processor

**MUST FOLLOW when adding new features:**

1. **Create processor file:**
   ```
   src/core/processors/{provider}/{domain}.py
   ```

2. **Implement required interface:**
   ```python
   class MyNewProcessor:
       def __init__(self):
           self.settings = get_settings()
           self.logger = logging.getLogger(__name__)

       async def execute(
           self,
           step_config: Dict[str, Any],
           context: Dict[str, Any]
       ) -> Dict[str, Any]:
           # Your logic here
           return {"status": "SUCCESS", ...}

   def get_engine():
       """Factory function - REQUIRED for dynamic loading"""
       return MyNewProcessor()
   ```

3. **Create config folder with pipeline YAML:**
   ```
   configs/{provider}/{domain}/
   ├── {pipeline_name}.yml     # Pipeline configuration
   └── schemas/                # JSON schemas (if needed)
       └── my_table.json
   ```

4. **Register in api-service:**
   Add entry to `02-api-service/configs/system/pipelines.yml`
   (PipelineRegistry is a singleton - requires api-service restart)

5. **Update documentation**

### Pipeline Types

#### LLM Provider Pipelines (Daily/Monthly)

| Config | Schedule | Processors | Output Tables |
|--------|----------|------------|---------------|
| `openai/cost/usage_cost.yml` | Daily | `openai.usage` → `openai.cost` | `openai_usage_daily_raw`, `openai_cost_daily` |
| `openai/subscriptions.yml` | Monthly | `openai.subscriptions` | `openai_subscriptions_monthly` |
| `anthropic/usage_cost.yml` | Daily | `anthropic.usage` → `anthropic.cost` | `anthropic_usage_daily_raw`, `anthropic_cost_daily` |

#### Cloud Provider Pipelines

| Config | Schedule | Processor | Output Tables |
|--------|----------|-----------|---------------|
| `gcp/cost/billing.yml` | Daily | `gcp.bq_etl` | `gcp_billing_daily_raw` |
| `gcp/api/billing_accounts.yml` | Daily | `gcp.api_extractor` | `gcp_billing_accounts_raw` |

#### SaaS Subscription Pipelines

| Config | Schedule | Processor | Output Tables |
|--------|----------|-----------|---------------|
| `saas_subscription/costs/saas_cost.yml` | Daily | `generic.procedure_executor` | `saas_subscription_cost_daily` |

---

## Stored Procedures

Stored procedures are managed in BigQuery and synced from SQL files.

### Procedure Management

**Procedure Files Location:** `configs/system/procedures/{domain}/*.sql`

**Example:** `configs/system/procedures/saas_subscription/calculate_subscription_cost.sql`

### Procedure Endpoints (X-CA-Root-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/procedures` | List all procedures in organizations dataset |
| GET | `/api/v1/procedures/files` | List procedure SQL files available for sync |
| POST | `/api/v1/procedures/sync` | Sync all procedures from SQL files |
| GET | `/api/v1/procedures/{name}` | Get procedure details |
| POST | `/api/v1/procedures/{name}` | Create/update a specific procedure |
| DELETE | `/api/v1/procedures/{name}` | Delete a procedure |

### Syncing Procedures

```bash
# List available procedure files
curl -s -X GET "http://localhost:8001/api/v1/procedures/files" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Sync all procedures to BigQuery
curl -s -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Force sync (re-create even if unchanged)
curl -s -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

---

## Generic API Extractor (ELT Pattern)

The Generic API Extractor implements an ELT (Extract-Load-Transform) pattern for any REST API.

**Full Documentation:** `docs/API_EXTRACTOR.md`

### Architecture: Stream & Batch

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    API EXTRACTOR FLOW                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   REST API                                                               │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────┐                                                │
│   │ 1. Resolve Auth     │  Credential sources (priority order):          │
│   │    (KMS Decrypt)    │  1. context["secrets"][provider]               │
│   └─────────┬───────────┘  2. org_integration_credentials → KMS decrypt  │
│             │              3. direct secret_key                          │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 2. Fetch Page       │  Pagination types:                             │
│   │    (Generator)      │  - cursor: token from response                 │
│   └─────────┬───────────┘  - offset: page * limit                        │
│             │              - page: page number                           │
│             │              - link: next URL from response/header         │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 3. Yield Rows       │  Memory-safe: doesn't hold all data            │
│   │    (Stream)         │                                                │
│   └─────────┬───────────┘                                                │
│             │                                                            │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 4. Accumulate Batch │  Default: 1000 rows per batch                  │
│   │    (Buffer)         │                                                │
│   └─────────┬───────────┘                                                │
│             │                                                            │
│             ▼                                                            │
│   ┌─────────────────────┐                                                │
│   │ 5. Insert to BQ     │  Smart insert:                                 │
│   │    (Batch/Stream)   │  - <100 rows: streaming insert (idempotent)   │
│   └─────────┬───────────┘  - ≥100 rows: batch load (efficient)          │
│             │                                                            │
│             ▼                                                            │
│        REPEAT until                                                      │
│        no more pages                                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Memory Safe** | Only holds ~1000 rows in memory at a time |
| **Resilient** | Partial data saved - if fails at row 9000, rows 1-8000 are in BQ |
| **Idempotent** | Uses insertId for deduplication (streaming inserts) |
| **Auth Integration** | Uses existing `org_integration_credentials` via KMS |
| **Rate Limiting** | Configurable RPS, auto-retry on 429 with exponential backoff |

### Usage Example

```yaml
# configs/vendor/users_extract.yml
pipeline_id: vendor-users-extract
steps:
  - step: "extract_users"
    processor: "generic.api_extractor"
    config:
      url: "https://api.vendor.com/v1/users"
      method: "GET"
      auth:
        type: "bearer"
        provider: "VENDOR_API"    # Looks up in org_integration_credentials
      pagination:
        type: "cursor"
        param: "after"
        response_path: "meta.next_cursor"
        limit: 100
      data_path: "data"
      destination:
        table: "vendor_users_raw"
        batch_size: 1000
      rate_limit:
        requests_per_second: 10
        retry_on_429: true
```

### Authentication Types

| Type | Header/Param | Use Case |
|------|--------------|----------|
| `bearer` | `Authorization: Bearer {token}` | OAuth2, API tokens |
| `header` | `X-API-Key: {key}` | Custom header auth |
| `query` | `?api_key={key}` | Query param auth |
| `basic` | `Authorization: Basic {base64}` | Basic auth |

### Credential Resolution

```
1. context["secrets"][provider]           ← From prior kms_decrypt step
2. org_integration_credentials → decrypt  ← Direct BQ query + KMS
3. context["secrets"][secret_key]         ← Direct key reference
```

---

## Scheduler & Queue

### Pipeline Execution Queue

**Table:** `organizations.org_pipeline_execution_queue`

**Purpose:** Track scheduled and queued pipeline runs with retry logic

**Key Fields:**
- `org_slug`, `pipeline_id`, `scheduled_time`
- `status`: PENDING, RUNNING, SUCCESS, FAILED
- `retry_count`, `max_retries`

### Scheduler Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/scheduler/trigger` | Trigger scheduled pipeline |
| GET | `/api/v1/scheduler/queue` | Get pipeline queue |
| POST | `/api/v1/scheduler/queue/process` | Process queued pipelines |

### Queue Management Modules

| Module | Path | Purpose |
|--------|------|---------|
| **queue_manager** | `src/core/scheduler/queue_manager.py` | Add/remove/query queue entries |
| **retry_manager** | `src/core/scheduler/retry_manager.py` | Exponential backoff retry logic |
| **state_manager** | `src/core/scheduler/state_manager.py` | Pipeline execution state tracking |

---

## API Endpoints

### Pipeline Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | Run specific pipeline |

**Pipeline URL Pattern:**
```
POST /api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}
```

**Available Pipelines:**

| Pipeline | Provider | Domain | Pipeline Name | Body Parameters |
|----------|----------|--------|---------------|-----------------|
| GCP Billing | `gcp` | `cost` | `billing` | `{"date": "YYYY-MM-DD"}` |
| GCP Billing Accounts | `gcp` | `api` | `billing_accounts` | `{}` |
| GCP Compute Instances | `gcp` | `api` | `compute_instances` | `{}` |
| OpenAI Usage & Cost | `openai` | `cost` | `usage_cost` | `{"start_date": "...", "end_date": "..."}` or `{}` |
| Anthropic Usage & Cost | `anthropic` | `` (empty) | `usage_cost` | `{"start_date": "...", "end_date": "..."}` or `{}` |
| SaaS Subscription Costs | `saas_subscription` | `costs` | `saas_cost` | `{}` (dates default to current month) |

### Scheduler Endpoints (X-API-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/scheduler/trigger` | Trigger scheduled pipeline |
| GET | `/api/v1/scheduler/queue` | Get pipeline queue |
| POST | `/api/v1/scheduler/queue/process` | Process queued pipelines |

### Procedure Endpoints (X-CA-Root-Key)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/procedures` | List all procedures in organizations dataset |
| GET | `/api/v1/procedures/files` | List procedure SQL files available for sync |
| POST | `/api/v1/procedures/sync` | Sync all procedures from SQL files |
| GET | `/api/v1/procedures/{name}` | Get procedure details |
| POST | `/api/v1/procedures/{name}` | Create/update a specific procedure |
| DELETE | `/api/v1/procedures/{name}` | Delete a procedure |

---

## Naming Conventions

### File & Folder Naming
| Item | Convention | Example |
|------|------------|---------|
| Config folder | `snake_case` | `openai/`, `gcp/` |
| Config file | `snake_case.yml` | `usage_cost.yml`, `billing.yml` |
| Processor file | `snake_case.py` | `cost.py`, `usage.py` |

### Pipeline & Step Naming
| Item | Convention | Pattern | Example |
|------|------------|---------|---------|
| Pipeline ID | `kebab-case` | `{org}-{provider}-{domain}` | `acme-openai-usage-cost` |
| Step ID | `snake_case` | `{action}_{target}` | `extract_usage`, `transform_cost` |
| ps_type | `dot.notation` | `{provider}.{domain}` | `openai.usage`, `gcp.bq_etl` |

### BigQuery Table Naming
| Item | Convention | Pattern | Example |
|------|------------|---------|---------|
| Dataset | `snake_case` | `{org}_{env}` | `acme_prod` |
| Table | `snake_case` | `{provider}_{domain}_{granularity}_{state}` | `openai_usage_daily_raw` |

### Table Name Components
```
{provider}_{domain}_{granularity}_{state}

Components:
├── provider:    openai, anthropic, gcp
├── domain:      usage, cost, billing, subscriptions
├── granularity: daily, monthly, hourly
└── state:       raw, staging, (none = final)
```

### Step ID Actions
| Prefix | Use Case | Examples |
|--------|----------|----------|
| `extract_` | Pull data from external API | `extract_usage`, `extract_billing` |
| `transform_` | Transform/derive data | `transform_cost` |
| `load_` | Write to destination | `load_to_bq` |
| `validate_` | Validate data/credentials | `validate_credential` |
| `notify_` | Send notifications | `notify_on_failure` |
| `decrypt_` | Decrypt credentials | `decrypt_credentials` |

---

## BigQuery Integration

### Dataset Structure

```
Central: organizations (project.organizations)
├── org_profiles                    # Organization metadata
├── org_api_keys                    # API keys (SHA256 hash + KMS encrypted)
├── org_subscriptions               # Subscription tiers (STARTER, PROFESSIONAL, SCALE)
├── org_usage_quotas                # Usage limits per org
├── org_integration_credentials     # LLM & cloud integration credentials (KMS encrypted)
├── org_pipeline_configs            # Pipeline configurations
├── org_scheduled_pipeline_runs     # Scheduled pipeline definitions
├── org_pipeline_execution_queue    # Pipeline execution queue
├── org_meta_pipeline_runs          # Execution logs
├── org_meta_step_logs              # Step-level logs
├── org_meta_dq_results             # Data quality results
├── org_audit_logs                  # Audit trail
├── org_kms_keys                    # KMS key metadata
└── org_cost_tracking               # Cost tracking data

Per-Organization: {org_slug}_prod (e.g., acme_prod)
└── billing_cost_daily, openai_usage_daily_raw, etc.  # Data tables only
```

### Multi-Tenant Isolation

**Single KMS Key for All Orgs** - Isolation is at DATA layer:

```sql
-- Credentials encrypted with shared KMS key
-- Isolation via org_slug filter in every query
SELECT encrypted_credential
FROM organizations.org_integration_credentials
WHERE org_slug = @org_slug  -- ← THIS provides isolation
  AND provider = 'GCP_SA'
```

**Concurrent Pipeline Execution (Org A + Org B):**
- Each request authenticated by unique org API key
- org_slug extracted from API key lookup
- Credentials fetched: `WHERE org_slug = @org_slug`
- Separate BigQuery client per execution
- Data writes to separate datasets: `{org_slug}_prod`
- NO shared state between executions

### BigQuery Client

**Module:** `src/core/engine/bq_client.py`

**Key Classes:**
- `BigQueryClient` - Main BigQuery operations
- `OrgBigQueryClient` - Org-scoped operations (in `org_bq_client.py`)

**Common Operations:**
- `create_table()`
- `insert_rows()`
- `query()`
- `execute_procedure()`

---

## Local Development

### Running Pipelines

#### Step 1: Get Org API Key

```bash
# Get decrypted org API key (dev/local environments only)
curl -s -X GET "http://localhost:8000/api/v1/admin/dev/api-key/{org_slug}" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Save the returned api_key for subsequent requests
export ORG_API_KEY="returned_api_key_value"
```

#### Step 2: Run Pipeline

```bash
# GCP Billing Pipeline
curl -s -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-08"}'

# OpenAI Usage & Cost Pipeline
curl -s -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/openai/cost/usage_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2025-12-01", "end_date": "2025-12-08"}'

# Anthropic Usage & Cost Pipeline (note: empty domain)
curl -s -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/anthropic//usage_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# SaaS Subscription Costs Pipeline (dates optional - defaults to current month)
curl -s -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Adding New Pipelines

1. **Create pipeline config:** `configs/{provider}/{domain}/{pipeline}.yml`
2. **Register in api-service:** Add entry to `../02-api-service/configs/system/pipelines.yml`
3. **Restart api-service:** PipelineRegistry is a singleton - requires restart to pick up new configs
4. **Run pipeline:** Use the URL pattern above

---

## Project Structure

```
03-data-pipeline-service/
├── src/app/
│   ├── main.py                        # FastAPI entry point
│   ├── config.py                      # Settings (env vars)
│   ├── routers/
│   │   ├── pipelines.py               # POST /api/v1/pipelines/run/...
│   │   ├── scheduler.py               # Scheduled pipeline execution
│   │   └── procedures.py              # Procedure management
│   ├── models/
│   │   ├── openai_data_models.py      # Pydantic models for cost calculations
│   │   └── org_models.py              # Organization models
│   ├── dependencies/
│   │   ├── auth.py                    # get_current_org(), AuthMetricsAggregator
│   │   └── rate_limit_decorator.py    # Rate limiting
│   └── middleware/
│       ├── validation.py              # Input validation
│       ├── audit_logging.py           # Audit trail
│       └── scope_enforcement.py       # Authorization scopes
├── src/core/
│   ├── processors/                    # PROCESSORS - Heart of the system
│   │   ├── openai/                    # OpenAI processors
│   │   ├── anthropic/                 # Anthropic processors
│   │   ├── gcp/                       # GCP processors
│   │   ├── generic/                   # Generic processors
│   │   ├── integrations/              # Integration processors
│   │   └── notify_systems/            # Notification processors
│   ├── abstractor/                    # Config loading
│   │   ├── config_loader.py
│   │   └── models.py
│   ├── engine/                        # BigQuery & API clients
│   │   ├── bq_client.py
│   │   ├── org_bq_client.py
│   │   ├── api_connector.py
│   │   └── polars_processor.py
│   ├── pipeline/                      # Pipeline execution
│   │   └── async_executor.py          # AsyncPipelineExecutor
│   ├── security/                      # KMS encryption
│   │   ├── kms_encryption.py
│   │   └── org_kms_encryption.py
│   ├── scheduler/                     # Scheduled execution
│   │   ├── queue_manager.py
│   │   ├── retry_manager.py
│   │   └── state_manager.py
│   ├── notifications/                 # Email/Slack
│   ├── observability/                 # Metrics
│   ├── metadata/                      # Execution logging
│   ├── providers/                     # Provider registry
│   ├── pubsub/                        # Pub/Sub integration
│   └── utils/                         # Utilities
└── configs/                           # SINGLE SOURCE OF TRUTH
    ├── openai/                        # OpenAI configs
    │   ├── cost/
    │   │   ├── cost_calculation.yml
    │   │   ├── cost_extract.yml
    │   │   └── usage_cost.yml
    │   └── subscriptions.yml
    ├── anthropic/                     # Anthropic configs
    │   └── usage_cost.yml
    ├── gcp/                           # GCP configs
    │   └── cost/
    │       ├── billing.yml
    │       └── schemas/
    │           └── billing_cost.json
    ├── saas_subscription/             # SaaS subscription configs
    │   └── costs/
    │       └── saas_cost.yml
    ├── example/                       # Example pipelines
    ├── notify_systems/                # Notification configs
    └── system/                        # System configs
        ├── dataset_types.yml
        ├── providers.yml              # Provider registry
        └── procedures/                # Stored procedures
            └── {domain}/*.sql
```

---

## Core Infrastructure

| Module | Path | Purpose |
|--------|------|---------|
| **abstractor** | `src/core/abstractor/` | Config loading and models |
| **engine** | `src/core/engine/` | BigQuery client, API connector, Polars processor |
| **pipeline** | `src/core/pipeline/` | AsyncPipelineExecutor |
| **security** | `src/core/security/` | KMS encryption |
| **scheduler** | `src/core/scheduler/` | Queue, retry, state management |
| **notifications** | `src/core/notifications/` | Email/Slack providers |
| **observability** | `src/core/observability/` | Prometheus metrics |
| **metadata** | `src/core/metadata/` | MetadataLogger for audit trails |
| **providers** | `src/core/providers/` | Provider registry and validation |
| **pubsub** | `src/core/pubsub/` | Pub/Sub publisher and worker |
| **utils** | `src/core/utils/` | Logging, rate limiting, checkpoint management |

---

## Verified Processor & Config Mapping

**Last verified: 2025-12-02**

| Processor | ps_type | Config Path | Status |
|-----------|---------|-------------|--------|
| `openai/usage.py` | `openai.usage` | `configs/openai/cost/usage_cost.yml` | ✓ Verified |
| `openai/cost.py` | `openai.cost` | `configs/openai/cost/usage_cost.yml` | ✓ Verified |
| `openai/subscriptions.py` | `openai.subscriptions` | `configs/openai/subscriptions.yml` | ✓ Verified |
| `openai/seed_csv.py` | `openai.seed_csv` | N/A (programmatic) | ✓ Verified |
| `anthropic/usage.py` | `anthropic.usage` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `anthropic/cost.py` | `anthropic.cost` | `configs/anthropic/usage_cost.yml` | ✓ Verified |
| `gcp/external_bq_extractor.py` | `gcp.bq_etl` | `configs/gcp/cost/billing.yml` | ✓ Verified |
| `gcp/gcp_api_extractor.py` | `gcp.api_extractor` | `configs/gcp/api/billing_accounts.yml` | ✓ Verified |
| `generic/api_extractor.py` | `generic.api_extractor` | Any API pipeline | ✓ Verified |
| `generic/local_bq_transformer.py` | `generic.local_bq_transformer` | SQL transformations | ✓ Verified |
| `generic/procedure_executor.py` | `generic.procedure_executor` | `configs/saas_subscription/costs/saas_cost.yml` | ✓ Verified |
| `notify_systems/email_notification.py` | `notify_systems.email_notification` | `configs/notify_systems/email_notification/` | ✓ Verified |

---

**Last Updated:** 2025-12-13
**Version:** 3.0
