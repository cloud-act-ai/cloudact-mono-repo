# Pipelines

**Status**: IMPLEMENTED (v2.0) | **Updated**: 2025-12-04 | **Single Source of Truth**

> Pipeline execution engine, scheduling, template resolution, and async processing
> NOT integrations setup (see 03_INTEGRATIONS.md)
> NOT specific cost tracking (see 02_CLOUD_COSTS.md, 02_LLM_API_USAGE_COSTS.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{provider}` | Data provider | `gcp`, `openai`, `anthropic` |
| `{domain}` | Data domain | `cost`, `usage` |
| `{pipeline}` | Pipeline name | `billing`, `usage_cost` |
| `{run_id}` | Pipeline execution ID | `run_abc123` |

---

## TERMINOLOGY

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Pipeline** | ETL job definition | GCP billing extraction | YAML configs |
| **Pipeline Run** | Single execution instance | run_abc123 | `pipeline_runs` |
| **Processor** | Python class that executes pipeline | ExternalBQExtractor | Python module |
| **Template** | Variable substitution in configs | `{{org_slug}}` | YAML configs |
| **Schedule** | Cron-based pipeline trigger | Every 6 hours | `pipeline_schedules` |
| **Quota** | Max pipelines per day | 20 for Professional | `org_subscriptions` |

---

## Where Data Lives

| Storage | Table/Location | What |
|---------|----------------|------|
| File System | `configs/{provider}/{domain}/{pipeline}.yml` | Pipeline definitions |
| File System | `configs/system/providers.yml` | Provider registry |
| BigQuery (Meta) | `organizations.pipeline_runs` | Execution history |
| BigQuery (Meta) | `organizations.pipeline_schedules` | Schedule definitions |
| BigQuery (Meta) | `organizations.org_subscriptions` | Quota limits |
| BigQuery (Org) | `{org_slug}_{env}.*` | Pipeline output tables |

---

## Lifecycle

| Stage | What Happens | Run Status |
|-------|--------------|------------|
| **Triggered** | API call or scheduler triggers | `pending` |
| **Validating** | Auth, quota, integration checks | `validating` |
| **Running** | Processor executes | `running` |
| **Processing** | Data transformation | `processing` |
| **Completed** | Success, data loaded | `completed` |
| **Failed** | Error occurred | `failed` |
| **Cancelled** | User cancelled | `cancelled` |

---

## Architecture Flow

### Pipeline Execution Engine

```
+-----------------------------------------------------------------------------+
|                       PIPELINE EXECUTION ENGINE                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  1. TRIGGER                                                                 |
|     +-- API: POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipe}   |
|     +-- Scheduler: Cron triggers POST /api/v1/scheduler/trigger            |
|     +-- Frontend: runPipeline() server action                              |
|                                                                             |
|  2. VALIDATION                                                              |
|     +-- X-API-Key authentication                                           |
|     +-- Subscription status check (ACTIVE/TRIAL only)                      |
|     +-- Pipeline quota check (pipelines_per_day_limit)                     |
|     +-- Integration status check (provider must be active)                 |
|                                                                             |
|  3. CONFIG RESOLUTION                                                       |
|     +-- Load YAML from configs/{provider}/{domain}/{pipeline}.yml          |
|     +-- Resolve templates: {{org_slug}}, {{date}}, {{env}}                 |
|     +-- Validate required fields                                           |
|                                                                             |
|  4. PROCESSOR EXECUTION                                                     |
|     +-- Instantiate processor class from config                            |
|     +-- Execute extract() -> transform() -> load()                         |
|     +-- Handle errors and retries                                          |
|                                                                             |
|  5. COMPLETION                                                              |
|     +-- Update pipeline_runs with status                                   |
|     +-- Log metrics (records_processed, duration)                          |
|     +-- Return run_id and status                                           |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Async Execution Flow

```
+-----------------------------------------------------------------------------+
|                         ASYNC PIPELINE EXECUTION                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  Pipeline Engine (8001)                                                     |
|                                                                             |
|  +------------------+    +------------------+    +------------------+       |
|  | PipelineRouter   |    | AsyncExecutor    |    | Processor        |       |
|  +------------------+    +------------------+    +------------------+       |
|  | POST /run/{...}  |--->| create_task()    |--->| extract()        |       |
|  | Returns run_id   |    | background exec  |    | transform()      |       |
|  +------------------+    +------------------+    | load()           |       |
|                                |                 +------------------+       |
|                                v                          |                 |
|                     +------------------+                  |                 |
|                     | pipeline_runs    |<-----------------+                 |
|                     | status updates   |                                    |
|                     +------------------+                                    |
|                                                                             |
|  GET /status/{org}/{run_id} -> Poll for completion                         |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Data Flow

```
Frontend (3000)              API Service (8000)          Pipeline Engine (8001)
     |                              |                              |
     |                              |                              |         BigQuery
     |                              |                              |            |
     |  1. Run Pipeline             |                              |            |
     |  (via server action)         |                              |            |
     |------------------------------------------------------------>|            |
     |                              |  X-API-Key validation        |            |
     |                              |                              |----------->|
     |                              |                              |  Check quota
     |                              |                              |            |
     |<------------------------------------------------------------|            |
     |                              |  Return run_id (async)       |            |
     |                              |                              |            |
     |                              |                              |  Execute   |
     |                              |                              |  pipeline  |
     |                              |                              |----------->|
     |                              |                              |  Extract   |
     |                              |                              |  Transform |
     |                              |                              |  Load      |
     |                              |                              |            |
     |  2. Poll Status              |                              |            |
     |------------------------------------------------------------>|            |
     |                              |                              |<-----------|
     |<------------------------------------------------------------|  Read      |
     |                              |  Return status + metrics     |  run status|
     |                              |                              |            |

Tables:
- pipeline_runs (BigQuery): Execution history and status
- pipeline_schedules (BigQuery): Cron schedule definitions
- org_subscriptions (BigQuery): Quota limits

Authentication:
- X-API-Key: Org API key for all operations
```

---

## Schema Definitions

### BigQuery: pipeline_runs

**File:** `api-service/configs/setup/bootstrap/schemas/pipeline_runs.json`

| Column | Type | Description |
|--------|------|-------------|
| run_id | STRING | Unique run identifier |
| org_slug | STRING | Organization |
| provider | STRING | Data provider |
| domain | STRING | Data domain |
| pipeline | STRING | Pipeline name |
| status | STRING | pending, running, completed, failed |
| started_at | TIMESTAMP | Start time |
| completed_at | TIMESTAMP | End time |
| records_processed | INT | Records extracted/loaded |
| error_message | STRING | Error details if failed |
| parameters | JSON | Run parameters |
| created_by | STRING | User or system |
| created_at | TIMESTAMP | Creation time |

### BigQuery: pipeline_schedules

**File:** `api-service/configs/setup/bootstrap/schemas/pipeline_schedules.json`

| Column | Type | Description |
|--------|------|-------------|
| schedule_id | STRING | Unique schedule ID |
| org_slug | STRING | Organization |
| provider | STRING | Data provider |
| domain | STRING | Data domain |
| pipeline | STRING | Pipeline name |
| cron_expression | STRING | Cron schedule (e.g., "0 */6 * * *") |
| is_enabled | BOOLEAN | Schedule active |
| last_run_at | TIMESTAMP | Last execution time |
| next_run_at | TIMESTAMP | Next scheduled time |
| parameters | JSON | Default parameters |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

### Pipeline Config Schema (YAML)

**File:** `data-pipeline-service/configs/gcp/cost/billing.yml` (example)

```yaml
pipeline:
  name: gcp_billing
  display_name: GCP Billing Extraction
  provider: gcp
  domain: cost
  version: "1.0"

processor:
  class: ExternalBQExtractor
  module: src.core.processors.gcp.external_bq_extractor

source:
  type: bigquery
  dataset: "{{billing_dataset_id}}"
  table: gcp_billing_export
  project: "{{billing_project_id}}"

target:
  type: bigquery
  dataset: "{{org_slug}}_{{env}}"
  table: gcp_billing_costs

parameters:
  date:
    type: string
    required: false
    default: "{{yesterday}}"
  start_date:
    type: string
    required: false
  end_date:
    type: string
    required: false

schedule:
  default_cron: "0 */6 * * *"  # Every 6 hours
  enabled: true
```

---

## Frontend Implementation

### Server Actions

**File:** `fronted-system/actions/pipelines.ts`

#### runPipeline()

```typescript
async function runPipeline(
  orgSlug: string,
  provider: string,
  domain: string,
  pipeline: string,
  parameters?: Record<string, unknown>
): Promise<{
  success: boolean,
  run_id?: string,
  error?: string
}>
```

**Features:**
- Validates org API key exists
- Calls pipeline engine endpoint
- Returns run_id for status polling
- Handles quota exceeded errors

#### getPipelineStatus()

```typescript
async function getPipelineStatus(
  orgSlug: string,
  runId: string
): Promise<{
  success: boolean,
  status?: PipelineRunStatus,
  error?: string
}>
```

#### getPipelineHistory()

```typescript
async function getPipelineHistory(
  orgSlug: string,
  provider?: string,
  limit?: number
): Promise<{
  success: boolean,
  runs?: PipelineRun[],
  error?: string
}>
```

#### getSchedules()

```typescript
async function getSchedules(
  orgSlug: string
): Promise<{
  success: boolean,
  schedules?: PipelineSchedule[],
  error?: string
}>
```

### TypeScript Interfaces

```typescript
export interface PipelineRun {
  run_id: string
  org_slug: string
  provider: string
  domain: string
  pipeline: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  started_at?: string
  completed_at?: string
  records_processed?: number
  error_message?: string
  parameters?: Record<string, unknown>
  created_at: string
}

export interface PipelineRunStatus {
  run_id: string
  status: string
  progress?: number
  records_processed?: number
  error_message?: string
  started_at?: string
  completed_at?: string
}

export interface PipelineSchedule {
  schedule_id: string
  provider: string
  domain: string
  pipeline: string
  cron_expression: string
  is_enabled: boolean
  last_run_at?: string
  next_run_at?: string
}

export interface PipelineConfig {
  name: string
  display_name: string
  provider: string
  domain: string
  description?: string
  parameters?: ParameterDefinition[]
}
```

### Pages

| Route | Purpose | Data Source |
|-------|---------|-------------|
| `/{org}/pipelines` | Pipeline dashboard | Pipeline Service |
| `/{org}/pipelines/history` | Run history | Pipeline Service |
| `/{org}/pipelines/schedules` | Schedule management | Pipeline Service |

---

## Pipeline Engine Endpoints

**File:** `data-pipeline-service/src/app/routers/pipelines.py`

### Pipeline Execution

```
POST   /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}
       -> Execute pipeline
       -> Body: { date?, start_date?, end_date?, ...parameters }
       -> Returns: { run_id, status: "pending" }

GET    /api/v1/pipelines/status/{org}/{run_id}
       -> Get run status
       -> Returns: PipelineRunStatus

GET    /api/v1/pipelines/history/{org}
       -> List recent runs
       -> Query: ?provider=&limit=50
       -> Returns: { runs: PipelineRun[] }

POST   /api/v1/pipelines/cancel/{org}/{run_id}
       -> Cancel running pipeline
       -> Returns: { success, status }
```

### Schedule Management

```
GET    /api/v1/scheduler/queue
       -> List scheduled pipelines
       -> Returns: { schedules: PipelineSchedule[] }

POST   /api/v1/scheduler/trigger
       -> Trigger scheduled pipeline
       -> Body: { schedule_id }
       -> Returns: { run_id }

PUT    /api/v1/scheduler/schedule/{schedule_id}
       -> Update schedule
       -> Body: { cron_expression?, is_enabled? }
       -> Returns: { success }
```

### Pipeline Discovery

```
GET    /api/v1/validator/pipelines
       -> List all available pipelines (no auth)
       -> Returns: { pipelines: PipelineConfig[] }

GET    /api/v1/validator/pipelines/{provider}
       -> List pipelines for provider
       -> Returns: { pipelines: PipelineConfig[] }
```

---

## Processor Architecture

### Base Processor

**File:** `data-pipeline-service/src/core/processors/base.py`

```python
class BaseProcessor:
    def __init__(self, config: dict, org_slug: str, run_id: str):
        self.config = config
        self.org_slug = org_slug
        self.run_id = run_id

    async def execute(self, parameters: dict) -> ProcessorResult:
        """Main execution method"""
        await self.validate(parameters)
        data = await self.extract(parameters)
        transformed = await self.transform(data)
        result = await self.load(transformed)
        return result

    async def extract(self, parameters: dict) -> Any:
        """Extract data from source"""
        raise NotImplementedError

    async def transform(self, data: Any) -> Any:
        """Transform extracted data"""
        return data  # Default: no transformation

    async def load(self, data: Any) -> ProcessorResult:
        """Load data to target"""
        raise NotImplementedError
```

### Implemented Processors

| Processor | Provider | Purpose |
|-----------|----------|---------|
| `ExternalBQExtractor` | gcp | Extract from external BigQuery |
| `OpenAIUsageProcessor` | openai | Extract OpenAI usage (future) |
| `AnthropicUsageProcessor` | anthropic | Extract Anthropic usage (future) |

---

## Template Resolution

### Available Templates

| Template | Resolves To | Example |
|----------|-------------|---------|
| `{{org_slug}}` | Organization slug | `acme_corp` |
| `{{env}}` | Environment | `prod` |
| `{{date}}` | Current date | `2025-12-04` |
| `{{yesterday}}` | Yesterday's date | `2025-12-03` |
| `{{year}}` | Current year | `2025` |
| `{{month}}` | Current month | `12` |
| `{{day}}` | Current day | `04` |
| `{{run_id}}` | Pipeline run ID | `run_abc123` |

### Template Resolver

**File:** `data-pipeline-service/src/core/template_resolver.py`

```python
class TemplateResolver:
    def resolve(self, config: dict, context: dict) -> dict:
        """Recursively resolve templates in config"""
        # Handles nested dicts, lists, and strings
        # Supports {{variable}} syntax
```

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| Pipeline router | Pipeline | routers/pipelines.py |
| Async executor | Pipeline | services/async_executor.py |
| Template resolver | Pipeline | core/template_resolver.py |
| Base processor | Pipeline | core/processors/base.py |
| GCP billing processor | Pipeline | core/processors/gcp/external_bq_extractor.py |
| Pipeline runs table | API | configs/setup/bootstrap/schemas/pipeline_runs.json |
| Schedule management | Pipeline | routers/scheduler.py |
| Pipeline actions | Frontend | actions/pipelines.ts |
| Pipeline dashboard | Frontend | app/[orgSlug]/pipelines/page.tsx |
| Quota enforcement | Pipeline | middleware/quota.py |

### NOT IMPLEMENTED

| Component | Notes | Priority |
|-----------|-------|----------|
| Pipeline retry logic | Auto-retry on transient failures | P2 |
| Pipeline chaining | Run pipelines in sequence | P3 |
| Pipeline webhooks | Notify on completion | P3 |
| Custom processor upload | User-defined processors | P4 |

---

## Business Logic

### Quota Enforcement

```python
# Check daily quota before running
async def check_quota(org_slug: str) -> bool:
    subscription = await get_subscription(org_slug)
    runs_today = await count_runs_today(org_slug)

    if runs_today >= subscription.pipelines_per_day_limit:
        raise QuotaExceededError(
            f"Daily pipeline limit ({subscription.pipelines_per_day_limit}) reached"
        )
    return True
```

### Subscription Status Check

```python
# Only ACTIVE and TRIAL orgs can run pipelines
ALLOWED_STATUSES = ['ACTIVE', 'TRIAL']

if subscription.status not in ALLOWED_STATUSES:
    raise SubscriptionError(
        f"Pipeline execution not allowed for {subscription.status} organizations"
    )
```

### Schedule Execution

```python
# Cron parser determines next run
from croniter import croniter

def get_next_run(cron_expression: str) -> datetime:
    cron = croniter(cron_expression, datetime.now())
    return cron.get_next(datetime)
```

---

## Error Handling

| Scenario | Error Message |
|----------|---------------|
| Invalid provider | "Unknown provider: {provider}" |
| Invalid pipeline | "Pipeline not found: {provider}/{domain}/{pipeline}" |
| Quota exceeded | "Daily pipeline limit reached" |
| Integration not active | "{provider} integration not active" |
| Subscription inactive | "Organization subscription is {status}" |
| Processor error | "{processor}: {error_details}" |
| Timeout | "Pipeline execution timed out after {timeout}s" |

---

## Test Files

| File | Purpose |
|------|---------|
| `data-pipeline-service/tests/test_01_pipeline_execution.py` | Pipeline execution tests |
| `data-pipeline-service/tests/test_06_scheduler.py` | Scheduler tests |
| `fronted-system/tests/08-pipelines.test.ts` | Frontend pipeline tests |

---

## File References

### Pipeline Engine Files

| File | Purpose |
|------|---------|
| `data-pipeline-service/src/app/routers/pipelines.py` | Pipeline execution endpoints |
| `data-pipeline-service/src/app/routers/scheduler.py` | Schedule management endpoints |
| `data-pipeline-service/src/services/async_executor.py` | Background task execution |
| `data-pipeline-service/src/core/template_resolver.py` | Config template resolution |
| `data-pipeline-service/src/core/processors/base.py` | Base processor class |
| `data-pipeline-service/src/core/processors/gcp/external_bq_extractor.py` | GCP billing processor |
| `data-pipeline-service/src/middleware/quota.py` | Quota enforcement middleware |

### Config Files

| File | Purpose |
|------|---------|
| `data-pipeline-service/configs/system/providers.yml` | Provider registry |
| `data-pipeline-service/configs/gcp/cost/billing.yml` | GCP billing pipeline |
| `data-pipeline-service/configs/openai/cost/usage_cost.yml` | OpenAI usage pipeline |
| `data-pipeline-service/configs/anthropic/usage_cost.yml` | Anthropic usage pipeline |

### API Service Files

| File | Purpose |
|------|---------|
| `api-service/configs/setup/bootstrap/schemas/pipeline_runs.json` | Runs table schema |
| `api-service/configs/setup/bootstrap/schemas/pipeline_schedules.json` | Schedules table schema |

### Frontend Files

| File | Purpose |
|------|---------|
| `fronted-system/actions/pipelines.ts` | Pipeline server actions |
| `fronted-system/app/[orgSlug]/pipelines/page.tsx` | Pipeline dashboard |
| `fronted-system/app/[orgSlug]/pipelines/history/page.tsx` | Run history page |
| `fronted-system/lib/api/backend.ts` | Backend API client |

---

**Version**: 2.0 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
