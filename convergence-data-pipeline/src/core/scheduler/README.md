# Pipeline Scheduler System

Comprehensive state tracking and management for scheduled pipeline execution.

## Overview

This module provides a complete state management system for automated pipeline execution, including:

- **State Transitions**: Atomic state machine with validated transitions
- **Queue Management**: Priority-based execution queue with FIFO ordering
- **Schedule Calculation**: Cron-based scheduling with timezone support
- **Retry Logic**: Exponential backoff with configurable retry policies
- **Status Tracking**: Real-time pipeline execution monitoring

---

## 🏗️ Core Architecture Philosophy

### ⚠️ CRITICAL: Scheduler Uses Admin API Key

**Convergence is a Pipeline-as-Code System** - Scheduler triggers pipeline runs using Admin API Key, NOT tenant keys.

### Scheduler-Driven Execution

**How Scheduler Works**:
```
1. Cloud Scheduler triggers hourly check (uses Admin API Key)
2. Scheduler queries tenant_scheduled_pipeline_runs for due pipelines
3. Finds all pipelines where next_run_time <= NOW() AND is_active=TRUE
4. For each due pipeline:
   a. Create pipeline run entry
   b. Queue pipeline for execution
   c. Update next_run_time based on cron expression
5. Workers pick up queued pipelines and execute them
6. Results logged to tenant_pipeline_runs (central dataset)
```

**Authentication Flow**:
```
┌─────────────────────────────────────────────────────────┐
│ Cloud Scheduler (Cron: 0 * * * *)                      │
│ → POST /api/v1/scheduler/trigger                       │
│ → Header: X-Admin-Key: admin_<token>                   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Scheduler Service (THIS COMPONENT)                     │
│ → Uses Admin API Key for authentication                │
│ → Queries: tenant_scheduled_pipeline_runs               │
│ → Finds: Due pipelines for ALL tenants                 │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Pipeline Execution Queue                                │
│ → Queues pipelines with tenant context                 │
│ → Workers execute pipelines as tenant                  │
└─────────────────────────────────────────────────────────┘
```

### Scheduler Components

**1. Schedule Management**:
- Cron expression parsing (`0 2 * * *` = daily at 2 AM)
- Timezone support (UTC, America/New_York, etc.)
- Next run time calculation
- Due pipeline detection

**2. Queue Management**:
- Priority-based execution queue
- FIFO ordering within priority
- Atomic dequeue operations
- Worker assignment

**3. State Management**:
- Pipeline run lifecycle (SCHEDULED → PENDING → RUNNING → COMPLETED)
- Atomic state transitions
- Retry logic with exponential backoff
- Status monitoring

**4. Authentication**:
- **Scheduler**: Uses Admin API Key to trigger checks
- **Pipeline Execution**: Runs in tenant context (tenant_id from config)
- **Logging**: All runs logged to central tenant_pipeline_runs table

### Development Rules

**When working with scheduler**:
1. ✅ **DO**: Use Admin API Key for all scheduler operations
2. ✅ **DO**: Query tenant_scheduled_pipeline_runs for due pipelines
3. ✅ **DO**: Update next_run_time after scheduling each pipeline
4. ✅ **DO**: Log all execution to central tenant_pipeline_runs table
5. ✅ **DO**: Use atomic state transitions to prevent race conditions
6. ❌ **DON'T**: Use tenant API keys for scheduler operations
7. ❌ **DON'T**: Skip updating next_run_time (causes duplicate runs)
8. ❌ **DON'T**: Allow concurrent execution of same pipeline

**Example - Scheduler Trigger**:
```python
# Cloud Scheduler hits this endpoint hourly
@router.post("/api/v1/scheduler/trigger")
async def trigger_scheduled_pipelines(
    admin_key: str = Header(..., alias="X-Admin-Key")
):
    """
    Check for due pipelines and queue them for execution.
    Authentication: Admin API Key (used by Cloud Scheduler)
    """
    # 1. Verify admin key
    verify_admin_key(admin_key)

    # 2. Get due pipelines
    due_pipelines = await scheduler.get_due_pipelines()

    # 3. Queue each pipeline
    for pipeline in due_pipelines:
        await queue_manager.enqueue(
            tenant_id=pipeline["tenant_id"],
            config=pipeline["config"],
            priority=pipeline.get("priority", 5)
        )

        # 4. Update next run time
        next_run = calculate_next_run(pipeline["cron_expression"])
        await scheduler.update_next_run_time(
            pipeline["id"],
            next_run
        )

    return {"queued": len(due_pipelines)}
```

### Cloud Scheduler Configuration

**Required Jobs**:

1. **Hourly Trigger** (Check for due pipelines):
```bash
gcloud scheduler jobs create http trigger-pipelines \
  --schedule="0 * * * *" \
  --uri="https://your-service.run.app/api/v1/scheduler/trigger" \
  --http-method=POST \
  --headers="X-Admin-Key=admin_<your_key>" \
  --time-zone="UTC"
```

2. **Queue Processor** (Process queued pipelines):
```bash
gcloud scheduler jobs create http process-queue \
  --schedule="*/5 * * * *" \
  --uri="https://your-service.run.app/api/v1/scheduler/process-queue" \
  --http-method=POST \
  --headers="X-Admin-Key=admin_<your_key>" \
  --time-zone="UTC"
```

3. **Daily Reset** (Reset quotas):
```bash
gcloud scheduler jobs create http reset-quotas \
  --schedule="0 0 * * *" \
  --uri="https://your-service.run.app/api/v1/scheduler/reset-daily-quotas" \
  --http-method=POST \
  --headers="X-Admin-Key=admin_<your_key>" \
  --time-zone="UTC"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Scheduler System                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ ScheduleCalculator│  │ PipelineStateMgr │                │
│  └────────┬──────────┘  └────────┬─────────┘                │
│           │                       │                          │
│           ▼                       ▼                          │
│  ┌─────────────────────────────────────────┐                │
│  │         x_meta_scheduled_runs            │                │
│  │  - run_id                                │                │
│  │  - state (SCHEDULED → PENDING → RUNNING) │                │
│  │  - scheduled_time                        │                │
│  │  - retry_count                           │                │
│  └─────────────────────────────────────────┘                │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │   QueueManager   │  │   RetryManager   │                │
│  └────────┬──────────┘  └────────┬─────────┘                │
│           │                       │                          │
│           ▼                       ▼                          │
│  ┌─────────────────────────────────────────┐                │
│  │        x_meta_pipeline_queue             │                │
│  │  - queue_id                              │                │
│  │  - priority (1=high, 10=low)             │                │
│  │  - status (QUEUED → PROCESSING)          │                │
│  └─────────────────────────────────────────┘                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. PipelineStateManager

Manages pipeline execution state with atomic transitions.

**Valid State Flow:**
```
SCHEDULED → PENDING → RUNNING → COMPLETED
                              └→ FAILED → PENDING (retry)
```

**Key Methods:**

```python
# Create a scheduled run
run_id = await state_manager.create_scheduled_run(
    tenant_id="acme_corp",
    config_id="daily_sales_pipeline",
    scheduled_time=datetime.utcnow() + timedelta(hours=1)
)

# Transition states atomically
success = await state_manager.transition_state(
    run_id=run_id,
    from_state="SCHEDULED",
    to_state="PENDING"
)

# Mark as running when execution starts
await state_manager.mark_as_running(
    run_id=run_id,
    pipeline_logging_id="abc-123-def-456"
)

# Mark as completed
await state_manager.mark_as_completed(
    run_id=run_id,
    execution_duration_seconds=120
)

# Get pipelines due to run
yet_to_run = await state_manager.get_yet_to_run_pipelines(date="2025-11-17")

# Get customer status summary
status = await state_manager.get_customer_pipeline_status(
    tenant_id="acme_corp",
    date="2025-11-17"
)
# Returns: {
#   "total_configured": 5,
#   "scheduled_today": 5,
#   "completed_today": 3,
#   "running": 1,
#   "yet_to_run": 1,
#   "failed": 0
# }
```

### 2. QueueManager

Priority-based FIFO queue for pipeline execution.

**Features:**
- Priority ordering (1=highest, 10=lowest)
- Atomic dequeue to prevent race conditions
- Worker assignment tracking
- Queue status monitoring

**Key Methods:**

```python
# Enqueue a pipeline
queue_id = await queue_manager.enqueue(
    tenant_id="acme_corp",
    config={"pipeline_id": "sales_etl", "params": {...}},
    priority=5  # 1=highest, 10=lowest
)

# Dequeue next item (atomic operation)
worker_id = "worker-001"
item = await queue_manager.dequeue(worker_id)
# Returns highest priority item and assigns to worker

# Mark as completed
await queue_manager.mark_completed(queue_id)

# Mark as failed
await queue_manager.mark_failed(queue_id, error="Connection timeout")

# Get queue status
status = await queue_manager.get_queue_status()
# Returns: {
#   "queued": 80,
#   "processing": 20,
#   "avg_wait_time_seconds": 45
# }
```

### 3. ScheduleCalculator

Calculate next run times from cron expressions with timezone support.

**Supported Patterns:**

```python
calculator = ScheduleCalculator()

# Daily at 2:00 AM Eastern Time
next_run = calculator.calculate_next_run(
    cron_expression="0 2 * * *",
    timezone="America/New_York"
)

# Every 4 hours
next_run = calculator.calculate_next_run(
    cron_expression="0 */4 * * *",
    timezone="UTC"
)

# Weekly on Sunday at midnight
next_run = calculator.calculate_next_run(
    cron_expression="0 0 * * 0",
    timezone="Europe/London"
)

# Monthly on 1st
next_run = calculator.calculate_next_run(
    cron_expression="0 0 1 * *",
    timezone="Asia/Tokyo"
)

# Check if pipeline is due
is_due = calculator.is_due(
    cron_expression="0 */4 * * *",
    last_run=datetime.utcnow() - timedelta(hours=5),
    timezone="UTC"
)
```

### 4. RetryManager

Exponential backoff retry logic with configurable policies.

**Key Methods:**

```python
retry_manager = RetryManager()

# Check if should retry
retry_config = {
    "max_retries": 3,
    "backoff_multiplier": 2,
    "retry_on_errors": ["TimeoutError", "TransientError"]
}

should_retry = await retry_manager.should_retry(
    run_id=run_id,
    retry_config=retry_config,
    bq_client=bq_client
)

# Calculate retry time (exponential backoff)
retry_time = retry_manager.calculate_retry_time(
    attempt=1,  # 1st retry
    backoff_multiplier=2
)
# Attempt 1: 1 minute
# Attempt 2: 2 minutes
# Attempt 3: 4 minutes
# Attempt 4: 8 minutes (capped at 60 minutes)

# Schedule retry
await retry_manager.schedule_retry(
    run_id=run_id,
    retry_time=retry_time,
    bq_client=bq_client
)
```

## Database Schema

### x_meta_scheduled_runs

Tracks scheduled pipeline runs and their state lifecycle.

| Column | Type | Description |
|--------|------|-------------|
| run_id | STRING | Unique run identifier (UUID) |
| tenant_id | STRING | Customer/tenant ID |
| config_id | STRING | Pipeline configuration ID |
| state | STRING | Current state (SCHEDULED, PENDING, RUNNING, COMPLETED, FAILED) |
| scheduled_time | TIMESTAMP | When pipeline should run |
| created_at | TIMESTAMP | When run was created |
| updated_at | TIMESTAMP | Last state change |
| pipeline_logging_id | STRING | Links to tenant_pipeline_runs |
| retry_count | INTEGER | Number of retry attempts |
| error_message | STRING | Error from last failure |
| metadata | JSON | Additional execution metadata |

### x_meta_pipeline_queue

Priority-based execution queue for pipeline runs.

| Column | Type | Description |
|--------|------|-------------|
| queue_id | STRING | Unique queue item ID (UUID) |
| tenant_id | STRING | Customer/tenant ID |
| config | JSON | Complete pipeline configuration |
| priority | INTEGER | Priority level (1=high, 10=low) |
| status | STRING | Queue status (QUEUED, PROCESSING, COMPLETED, FAILED) |
| created_at | TIMESTAMP | When enqueued |
| updated_at | TIMESTAMP | Last status change |
| worker_id | STRING | Worker processing this item |
| error_message | STRING | Error if failed |

## Usage Examples

### Example 1: Complete Workflow

```python
from google.cloud import bigquery
from src.core.scheduler import (
    PipelineStateManager,
    QueueManager,
    ScheduleCalculator
)

# Initialize
bq_client = bigquery.Client()
state_manager = PipelineStateManager(bq_client)
queue_manager = QueueManager(bq_client)
calculator = ScheduleCalculator()

# 1. Calculate next run time
next_run = calculator.calculate_next_run(
    cron_expression="0 2 * * *",  # Daily at 2 AM
    timezone="America/New_York"
)

# 2. Create scheduled run
run_id = await state_manager.create_scheduled_run(
    tenant_id="acme_corp",
    config_id="daily_sales",
    scheduled_time=next_run
)

# 3. When time comes, move to PENDING
await state_manager.transition_state(
    run_id=run_id,
    from_state="SCHEDULED",
    to_state="PENDING"
)

# 4. Enqueue for execution
queue_id = await queue_manager.enqueue(
    tenant_id="acme_corp",
    config={"pipeline_id": "daily_sales", "params": {...}},
    priority=5
)

# 5. Worker picks up job
worker_id = "worker-001"
item = await queue_manager.dequeue(worker_id)

# 6. Mark as running
await state_manager.mark_as_running(run_id, "logging-id-123")

# 7. Execute pipeline...
# ...

# 8. Mark as completed
await state_manager.mark_as_completed(run_id, execution_duration_seconds=120)
await queue_manager.mark_completed(queue_id)
```

### Example 2: Retry Failed Pipeline

```python
from src.core.scheduler import RetryManager

retry_manager = RetryManager()

# Pipeline failed - check if should retry
retry_config = {
    "max_retries": 3,
    "backoff_multiplier": 2,
    "retry_on_errors": ["TimeoutError"]
}

should_retry = await retry_manager.should_retry(
    run_id=run_id,
    retry_config=retry_config,
    bq_client=bq_client
)

if should_retry:
    # Calculate when to retry
    retry_time = retry_manager.calculate_retry_time(attempt=1)

    # Schedule retry
    await retry_manager.schedule_retry(
        run_id=run_id,
        retry_time=retry_time,
        bq_client=bq_client
    )
```

### Example 3: Monitor Pipeline Status

```python
# Get all pipelines due to run today
yet_to_run = await state_manager.get_yet_to_run_pipelines(
    date="2025-11-17"
)

for pipeline in yet_to_run:
    print(f"Pipeline {pipeline['config_id']} for {pipeline['tenant_id']}")
    print(f"  Scheduled: {pipeline['scheduled_time']}")
    print(f"  State: {pipeline['state']}")

# Get customer status summary
status = await state_manager.get_customer_pipeline_status(
    tenant_id="acme_corp",
    date="2025-11-17"
)

print(f"Total configured: {status['total_configured']}")
print(f"Completed today: {status['completed_today']}")
print(f"Running: {status['running']}")
print(f"Yet to run: {status['yet_to_run']}")
print(f"Failed: {status['failed']}")
```

## Important Features

### 1. Atomic State Transitions

All state transitions use BigQuery's UPDATE with WHERE clause to ensure atomicity:

```sql
UPDATE x_meta_scheduled_runs
SET state = 'RUNNING'
WHERE run_id = ? AND state = 'PENDING'
```

Only succeeds if current state matches expected state, preventing race conditions.

### 2. Idempotency

All insert operations use `row_ids` for idempotency:

```python
self.client.insert_rows_json(
    table_id,
    [row],
    row_ids=[run_id]  # Prevents duplicate inserts
)
```

### 3. Retry Logic

Exponential backoff with configurable policies:
- Maximum retry attempts
- Error type filtering
- Backoff multiplier
- Maximum delay cap (60 minutes)

### 4. Priority Queue

FIFO ordering with priority override:
```sql
ORDER BY priority ASC, created_at ASC
```

Lower priority numbers are processed first.

### 5. Timezone Support

Uses `pendulum` for accurate timezone conversions and `croniter` for cron parsing.

## Error Handling

All methods include:
- Tenacity retry for transient errors (connection, timeout, rate limit)
- Comprehensive error logging
- Graceful degradation
- Circuit breaker patterns (in MetadataLogger)

## Performance Considerations

- **Indexes**: Add indexes on `state`, `scheduled_time`, `tenant_id` for faster queries
- **Batch Operations**: Use BigQuery's batch insert when creating multiple runs
- **Connection Pooling**: BigQuery client uses connection pooling internally
- **Async Operations**: All I/O operations use `asyncio` for non-blocking execution

## Testing

Run the example file to test all components:

```bash
python src/core/scheduler/example_usage.py
```

This demonstrates:
- State transitions
- Queue management
- Schedule calculation
- Retry logic
- Status monitoring

## Dependencies

```
google-cloud-bigquery>=3.14.1
croniter==2.0.1
pendulum==3.0.0
tenacity==8.2.3
```

## Integration

To integrate with existing pipeline execution:

1. **Scheduler Service**: Create runs based on cron schedules
2. **Worker Service**: Dequeue and execute pipelines
3. **Monitor Service**: Track status and handle retries
4. **API Endpoints**: Expose status and control endpoints

See `example_usage.py` for complete integration examples.
