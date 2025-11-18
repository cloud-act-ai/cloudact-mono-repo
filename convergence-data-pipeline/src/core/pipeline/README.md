# Pipeline Execution System

## Overview

The pipeline execution system orchestrates multi-step data processing workflows with support for async execution, dependency management, and comprehensive logging.

## Architecture

```
src/core/pipeline/
├── async_executor.py       # Main async pipeline executor
├── executor.py             # Sync/async execution wrapper
├── template_resolver.py    # Variable substitution engine
└── processors/             # Legacy processors (being phased out)
    └── bq_to_bq.py
```

## Execution Flow

```
API Request
    ↓
Template Resolution ({tenant_id}, {date}, etc.)
    ↓
Pipeline Configuration Loading
    ↓
Async Executor Initialization
    ↓
Step-by-Step Execution (sequential or parallel)
    ↓
Metadata Logging (x_meta_pipeline_runs, x_meta_step_logs)
    ↓
Final Status Return
```

## Pipeline Executor

### AsyncPipelineExecutor

The main execution engine that processes pipeline configurations.

**File:** `src/core/pipeline/async_executor.py`

**Features:**
- Asynchronous step execution with `asyncio`
- Dynamic engine loading via `ps_type`
- Comprehensive metadata logging to BigQuery
- Error handling with detailed stack traces
- Support for conditional step execution (`trigger: on_failure`)
- Atomic concurrency control (prevents duplicate runs)

**Example Usage:**
```python
from src.core.pipeline.async_executor import AsyncPipelineExecutor

executor = AsyncPipelineExecutor(
    tenant_id="acme_corp",
    pipeline_id="gcp-cost-billing",
    config={
        "pipeline_id": "{tenant_id}-gcp-cost-billing",
        "steps": [...]
    },
    context={
        "tenant_id": "acme_corp",
        "date": "2025-11-15",
        "trigger_by": "scheduler"
    }
)

result = await executor.execute()
```

## Template Resolution

### Variable Replacement

The template resolver replaces `{variable}` placeholders in configuration files.

**File:** `src/core/pipeline/template_resolver.py`

**Supported Variables:**
- `{tenant_id}` - From URL path parameter
- `{date}` - From request body
- `{pipeline_id}` - Auto-generated or from template
- `{provider}` - From URL path (e.g., "gcp", "aws")
- `{domain}` - From URL path (e.g., "cost", "security")
- Custom variables from pipeline config

**Example:**
```yaml
# Template (configs/gcp/cost/cost_billing.yml)
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract billing data for {tenant_id} on {date}"

steps:
  - step_id: "extract"
    source:
      query: "SELECT * FROM table WHERE date = '{date}'"
```

**After Resolution:**
```yaml
pipeline_id: "acme_corp-gcp-cost-billing"
description: "Extract billing data for acme_corp on 2025-11-15"

steps:
  - step_id: "extract"
    source:
      query: "SELECT * FROM table WHERE date = '2025-11-15'"
```

## Pipeline Configuration

### Structure

```yaml
pipeline_id: "{tenant_id}-pipeline-name"
description: "Pipeline description with {variables}"

# Pipeline-level variables (optional)
variables:
  custom_var: "value"
  filter_date: "{date}"

steps:
  - step_id: "step1"
    name: "Step Name"
    ps_type: "gcp.bigquery_to_bigquery"  # Engine to use
    timeout_minutes: 20
    trigger: "always"  # or "on_failure", "on_success"

    # Engine-specific configuration
    source:
      bq_project_id: "project-id"
      query: "SELECT * FROM table"

    destination:
      bq_project_id: "project-id"
      dataset_type: "gcp_silver_cost"
      table: "output_table"
```

### Step Fields

| Field | Required | Description |
|-------|----------|-------------|
| `step_id` | Yes | Unique identifier for the step |
| `name` | No | Human-readable step name |
| `ps_type` | Yes | Engine type (e.g., `gcp.bigquery_to_bigquery`) |
| `timeout_minutes` | No | Maximum execution time (default: 30) |
| `trigger` | No | When to execute: `always` (default), `on_failure`, `on_success` |
| `config` | No | Engine-specific configuration |
| `source` | No | Source configuration (for data engines) |
| `destination` | No | Destination configuration (for data engines) |

## Engine Routing

Engines are loaded dynamically based on `ps_type`:

```python
ps_type = "gcp.bigquery_to_bigquery"

# Converted to module path
module_path = "src.core.engines.gcp.bigquery_to_bigquery"

# Dynamically imported
engine_module = importlib.import_module(module_path)
engine = engine_module.get_engine()

# Executed
result = await engine.execute(step_config, context)
```

**Available ps_types:**
- `gcp.bigquery_to_bigquery` - BigQuery data transfers
- `aws.s3_to_bigquery` - S3 to BigQuery loads
- `customer.onboarding` - Tenant infrastructure setup
- `shared.email_notification` - Email notifications
- `shared.slack_notification` - Slack notifications

## Metadata Logging

All pipeline executions are logged to tenant BigQuery tables:

### Pipeline Runs Table
**Table:** `tenants.x_meta_pipeline_runs`

**Schema:**
```sql
CREATE TABLE x_meta_pipeline_runs (
  pipeline_logging_id STRING,      -- Unique execution ID
  tenant_id STRING,
  pipeline_id STRING,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status STRING,                   -- RUNNING, SUCCESS, FAILED
  trigger_by STRING,               -- Who/what initiated
  run_date DATE,
  total_steps INT64,
  completed_steps INT64,
  failed_steps INT64,
  error_message STRING,
  metadata JSON                   -- Additional context
)
```

### Step Logs Table
**Table:** `{tenant_id}.x_meta_step_logs`

**Schema:**
```sql
CREATE TABLE x_meta_step_logs (
  log_id STRING,
  pipeline_logging_id STRING,
  step_id STRING,
  step_name STRING,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status STRING,                   -- RUNNING, SUCCESS, FAILED, SKIPPED
  rows_processed INT64,
  error_message STRING,
  step_result JSON,               -- Engine return value
  execution_metadata JSON
)
```

## Execution Context

The context dictionary passed to all engines:

```python
context = {
    "tenant_id": "acme_corp",
    "pipeline_id": "acme_corp-gcp-cost-billing",
    "pipeline_logging_id": "pl_20251115_abc123",
    "step_id": "extract_billing",
    "run_date": "2025-11-15",
    "trigger_by": "scheduler",
    "pipeline_status": "RUNNING",

    # Custom variables
    "date": "2025-11-15",
    "source_table": "billing_export",
    # ... any variable from config
}
```

## Error Handling

### Exception Hierarchy

```python
try:
    result = await engine.execute(step_config, context)
except TimeoutError:
    # Step exceeded timeout_minutes
    logger.error("Step timeout", extra={"step_id": step_id})
except EngineExecutionError as e:
    # Engine-specific failure
    logger.error(f"Engine failed: {e}", exc_info=True)
except Exception as e:
    # Unexpected error
    logger.error(f"Unexpected error: {e}", exc_info=True)
```

### Retry Logic

Currently not implemented - each step runs once. Future enhancement:

```yaml
steps:
  - step_id: "extract"
    retry:
      max_attempts: 3
      backoff_multiplier: 2
      retry_on:
        - "TimeoutError"
        - "TransientError"
```

## Concurrency Control

Pipelines use atomic INSERT to prevent duplicate runs:

```sql
INSERT INTO x_meta_pipeline_runs (...)
WHERE NOT EXISTS (
  SELECT 1 FROM x_meta_pipeline_runs
  WHERE tenant_id = @tenant_id
    AND pipeline_id = @pipeline_id
    AND status IN ('RUNNING', 'PENDING')
)
```

If insert count = 0, pipeline execution is skipped (already running).

## Testing Pipelines

### Unit Tests

```python
import pytest
from src.core.pipeline.async_executor import AsyncPipelineExecutor

@pytest.mark.asyncio
async def test_pipeline_execution():
    config = {
        "pipeline_id": "test-pipeline",
        "steps": [{
            "step_id": "test_step",
            "ps_type": "gcp.bigquery_to_bigquery",
            "source": {...},
            "destination": {...}
        }]
    }

    context = {
        "tenant_id": "test_tenant",
        "date": "2025-11-15"
    }

    executor = AsyncPipelineExecutor(
        tenant_id="test_tenant",
        pipeline_id="test-pipeline",
        config=config,
        context=context
    )

    result = await executor.execute()

    assert result["status"] == "SUCCESS"
```

### Integration Tests

```bash
# Run pipeline via API
curl -X POST "http://localhost:8080/api/v1/pipelines/run/test_tenant/gcp/cost/cost_billing" \
  -H "X-API-Key: test_api_key" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-15", "trigger_by": "test"}'
```

## Performance Optimization

### Parallel Step Execution (Future)

Currently, steps execute sequentially. Future enhancement:

```yaml
steps:
  - step_id: "extract_gcp"
    ps_type: "gcp.bigquery_to_bigquery"
    parallel_group: "extract"

  - step_id: "extract_aws"
    ps_type: "aws.s3_to_bigquery"
    parallel_group: "extract"

  - step_id: "merge"
    ps_type: "gcp.bigquery_to_bigquery"
    depends_on: ["extract_gcp", "extract_aws"]
```

### Async I/O

All engines use `async/await` for non-blocking I/O:
- BigQuery queries run asynchronously
- HTTP requests use `aiohttp`
- File I/O uses `aiofiles`

## Best Practices

1. **Use Template Variables**: Avoid hardcoding tenant-specific values
2. **Set Realistic Timeouts**: Default 30 minutes may be too long/short
3. **Log Comprehensively**: Include context in all log messages
4. **Handle Errors Gracefully**: Return `{"status": "FAILED"}` instead of raising
5. **Test Thoroughly**: Unit test engines, integration test pipelines

## Troubleshooting

### Pipeline Not Starting

**Check:**
1. Is another instance already running? Query `tenants.x_meta_pipeline_runs` for `RUNNING` status
2. Are API keys valid? Test authentication endpoint
3. Does tenant dataset exist? Check BigQuery

### Step Failures

**Check:**
1. Step logs: `SELECT * FROM {tenant_id}.x_meta_step_logs WHERE pipeline_logging_id = '...'`
2. Engine logs: Cloud Logging with filter `resource.labels.tenant_id="{tenant_id}"`
3. Timeout: Did step exceed `timeout_minutes`?

### Performance Issues

**Check:**
1. BigQuery query execution time (use INFORMATION_SCHEMA.JOBS)
2. Network latency (if cross-region)
3. Dataset partitioning strategy

## Related Documentation

- **Engines**: `src/core/engines/README.md`
- **Templates**: `templates/README.md`
- **Configuration**: `configs/README.md`
- **Metadata Logging**: `src/core/metadata/` (initializer.py, logger.py)

## Support

For questions or issues:
1. Review step logs in `x_meta_step_logs`
2. Check engine documentation in `src/core/engines/README.md`
3. Contact: data-ops@company.com
