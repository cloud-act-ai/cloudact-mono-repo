# Enhanced Pipeline State and Failure Logging

**Date:** 2025-12-21
**Version:** 1.0

## Overview

Enhanced pipeline observability system with comprehensive state transition tracking, error classification, and detailed failure context. Provides complete audit trail of pipeline execution lifecycle.

## Key Enhancements

### 1. State Transition Table

**New Table:** `org_meta_state_transitions`

**Location:** `/home/user/cloudact-mono-repo/02-api-service/configs/setup/bootstrap/schemas/org_meta_state_transitions.json`

**Purpose:** Track every state change in pipeline and step execution

**Key Fields:**
- `transition_id` - Unique UUID for each transition
- `entity_type` - PIPELINE or STEP
- `from_state` - Previous state
- `to_state` - New state
- `transition_time` - When transition occurred (partition key)
- `error_type` - TRANSIENT, PERMANENT, TIMEOUT, VALIDATION_ERROR, DEPENDENCY_FAILURE
- `error_message` - Short error message
- `stack_trace_truncated` - First 2000 chars of stack trace
- `retry_count` - Number of retry attempts
- `duration_in_state_ms` - Time spent in previous state
- `metadata` - Additional context (JSON)

**Partitioning:** Daily partitions by `transition_date`

**Use Cases:**
- Debugging stuck pipelines (identify long RUNNING durations)
- Analyzing failure patterns (common error types)
- Understanding retry behavior
- Measuring state transition performance
- Compliance and audit requirements

### 2. Error Classification System

**New Module:** `/home/user/cloudact-mono-repo/03-data-pipeline-service/src/core/utils/error_classifier.py`

**Error Types:**
- `TRANSIENT` - Temporary errors that may succeed on retry (rate limits, network issues)
- `PERMANENT` - Errors that won't succeed on retry (auth failures, invalid config)
- `TIMEOUT` - Execution exceeded timeout threshold
- `VALIDATION_ERROR` - Input validation failures
- `DEPENDENCY_FAILURE` - Dependency step failed
- `UNKNOWN` - Unclassified (treated as permanent to avoid infinite retries)

**Key Functions:**

```python
from src.core.utils.error_classifier import (
    classify_error,
    is_retryable,
    create_error_context,
    get_retry_delay
)

# Classify an exception
error_type = classify_error(exception, error_message)

# Check if retryable
if is_retryable(error_type):
    delay = get_retry_delay(retry_count, error_type)
    # Retry logic

# Create structured error context
error_ctx = create_error_context(
    exception=e,
    step_name="extract_data",
    retry_count=2,
    additional_context={"timeout_seconds": 600}
)

# Returns:
# {
#     "error_type": "TIMEOUT",
#     "error_class": "asyncio.TimeoutError",
#     "error_message": "...",
#     "is_retryable": True,
#     "retry_count": 2,
#     "stack_trace": "...",
#     "stack_trace_truncated": "...",
#     "failed_step": "extract_data",
#     "next_retry_delay_seconds": 8.0
# }
```

**Error Pattern Matching:**

The classifier uses regex patterns to identify error types:

- **Transient Patterns:** `rate.*limit`, `timeout`, `503`, `deadlock`, `try again`
- **Permanent Patterns:** `unauthorized`, `401`, `403`, `invalid.*key`, `not.*found`
- **Validation Patterns:** `validation.*error`, `invalid.*input`, `missing.*required`

### 3. Enhanced MetadataLogger

**Updated:** `/home/user/cloudact-mono-repo/03-data-pipeline-service/src/core/metadata/logger.py`

**New Method:** `log_state_transition()`

```python
await metadata_logger.log_state_transition(
    pipeline_logging_id="uuid",
    from_state="RUNNING",
    to_state="COMPLETED",
    entity_type="STEP",  # or "PIPELINE"
    entity_name="extract_data",
    step_logging_id="uuid",  # Optional, for steps only
    reason="Step completed successfully",
    error_type="TIMEOUT",  # Optional
    error_message="...",  # Optional
    stack_trace="...",  # Optional (auto-truncated to 2000 chars)
    retry_count=0,  # Optional
    duration_in_state_ms=5000,  # Optional
    metadata={"rows_processed": 1000},  # Optional
    trigger_type="api",
    user_id="uuid"
)
```

**Enhanced `log_step_end()` Method:**

Now accepts `error_context` parameter for enhanced failure logging:

```python
await metadata_logger.log_step_end(
    step_logging_id="uuid",
    pipeline_logging_id="uuid",
    step_name="extract_data",
    step_type="gcp.bq_etl",
    step_index=0,
    status="FAILED",
    start_time=step_start,
    error_message="Connection timeout",
    error_context=error_ctx  # NEW: Enhanced error context
)
```

The error context is automatically merged into the step metadata:

```json
{
  "metadata": {
    "error_context": {
      "error_type": "TRANSIENT",
      "error_class": "ConnectionError",
      "is_retryable": true,
      "retry_count": 0,
      "stack_trace_truncated": "..."
    }
  }
}
```

**New Queue:** `_state_transition_queue`

**New Flush Method:** `_flush_state_transition_logs()`

Flushes state transitions to `org_meta_state_transitions` table with retry logic and idempotency.

### 4. Enhanced Async Executor

**Updated:** `/home/user/cloudact-mono-repo/03-data-pipeline-service/src/core/pipeline/async_executor.py`

**State Transition Logging Added:**

#### Pipeline State Transitions

1. **PENDING → RUNNING**
   - Location: `_update_pipeline_status_to_running()`
   - Trigger: Pipeline execution starts
   - Context: Pipeline ID, trigger type

2. **RUNNING → COMPLETED**
   - Location: `_execute_pipeline_internal()`
   - Trigger: All steps completed successfully
   - Context: Steps completed, total steps, duration

3. **RUNNING → TIMEOUT**
   - Location: `execute()` exception handler
   - Trigger: Pipeline exceeds timeout threshold
   - Context: Timeout minutes, steps completed, error classification

4. **RUNNING → FAILED**
   - Location: `execute()` exception handlers
   - Trigger: Pipeline exception
   - Context: Error type, error class, is_retryable, stack trace, steps completed

#### Step State Transitions

1. **PENDING → RUNNING**
   - Location: `_execute_step_async()` after `log_step_start()`
   - Trigger: Step execution starts
   - Context: Step name, trigger type

2. **RUNNING → COMPLETED**
   - Location: `_execute_step_async()` after successful execution
   - Trigger: Step completes successfully
   - Context: Rows processed, duration in state

3. **RUNNING → FAILED (Timeout)**
   - Location: `_execute_step_async()` timeout exception handler
   - Trigger: Step exceeds timeout
   - Context: Timeout minutes, error classification, stack trace

4. **RUNNING → FAILED (Exception)**
   - Location: `_execute_step_async()` general exception handler
   - Trigger: Step exception
   - Context: Error type, error class, is_retryable, stack trace

**Enhanced Error Handling:**

```python
except Exception as e:
    step_status = "FAILED"
    error_message = str(e)

    # Create enhanced error context with classification
    error_ctx = create_error_context(
        exception=e,
        step_name=step_id,
        retry_count=0,  # TODO: Implement retry logic
        additional_context={}
    )
    step_metadata['error_context'] = error_ctx

    self.logger.error(
        f"Step {step_id} failed: {e}",
        error_type=error_ctx.get('error_type'),
        is_retryable=error_ctx.get('is_retryable'),
        exc_info=True
    )

    # Log state transition with error details
    await self.metadata_logger.log_state_transition(
        pipeline_logging_id=self.pipeline_logging_id,
        step_logging_id=step_logging_id,
        from_state="RUNNING",
        to_state="FAILED",
        entity_type="STEP",
        entity_name=step_id,
        reason=f"Step failed with {error_ctx.get('error_class')}: {error_message[:200]}",
        error_type=error_ctx.get('error_type'),
        error_message=error_message,
        stack_trace=error_ctx.get('stack_trace'),
        retry_count=0,
        duration_in_state_ms=int((datetime.utcnow() - step_start).total_seconds() * 1000),
        trigger_type=self.trigger_type,
        user_id=self.user_id,
        metadata={
            "error_class": error_ctx.get('error_class'),
            "is_retryable": error_ctx.get('is_retryable')
        }
    )

    raise
```

## Bootstrap Integration

### Adding State Transition Table to Bootstrap

The `org_meta_state_transitions` table is the **15th table** in the bootstrap process.

**Action Required:**

Update the bootstrap config to include the new table:

**File:** `/home/user/cloudact-mono-repo/02-api-service/configs/setup/bootstrap/config.yml`

Add to the tables list:

```yaml
tables:
  # ... existing 14 tables ...
  - table_name: org_meta_state_transitions
    schema_path: schemas/org_meta_state_transitions.json
    partitioning:
      type: DAY
      field: transition_date
    description: "State transition audit trail for pipelines and steps"
```

**Run Bootstrap:**

```bash
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Querying State Transitions

### Example Queries

**1. Find Stuck Pipelines (Long RUNNING Duration)**

```sql
SELECT
  pipeline_logging_id,
  entity_name,
  from_state,
  to_state,
  transition_time,
  duration_in_state_ms / 1000 / 60 AS duration_minutes,
  reason
FROM `project.organizations.org_meta_state_transitions`
WHERE entity_type = 'PIPELINE'
  AND from_state = 'RUNNING'
  AND duration_in_state_ms > 1800000  -- > 30 minutes
ORDER BY duration_in_state_ms DESC
LIMIT 100;
```

**2. Analyze Failure Patterns**

```sql
SELECT
  error_type,
  COUNT(*) AS failure_count,
  COUNT(DISTINCT pipeline_logging_id) AS pipelines_affected,
  AVG(duration_in_state_ms) / 1000 AS avg_duration_seconds
FROM `project.organizations.org_meta_state_transitions`
WHERE to_state = 'FAILED'
  AND transition_date >= CURRENT_DATE() - 7
GROUP BY error_type
ORDER BY failure_count DESC;
```

**3. Step-Level Failure Analysis**

```sql
SELECT
  entity_name AS step_name,
  error_type,
  COUNT(*) AS failures,
  APPROX_TOP_COUNT(JSON_EXTRACT_SCALAR(metadata, '$.error_class'), 5) AS top_error_classes
FROM `project.organizations.org_meta_state_transitions`
WHERE entity_type = 'STEP'
  AND to_state = 'FAILED'
  AND transition_date >= CURRENT_DATE() - 7
GROUP BY entity_name, error_type
ORDER BY failures DESC
LIMIT 20;
```

**4. Retry Behavior Analysis**

```sql
SELECT
  pipeline_logging_id,
  entity_name,
  error_type,
  MAX(retry_count) AS max_retries,
  COUNT(*) AS transition_count
FROM `project.organizations.org_meta_state_transitions`
WHERE to_state = 'FAILED'
  AND retry_count > 0
  AND transition_date >= CURRENT_DATE() - 7
GROUP BY pipeline_logging_id, entity_name, error_type
ORDER BY max_retries DESC
LIMIT 50;
```

**5. Pipeline Execution Timeline**

```sql
SELECT
  transition_time,
  entity_type,
  entity_name,
  from_state,
  to_state,
  duration_in_state_ms / 1000 AS duration_seconds,
  reason
FROM `project.organizations.org_meta_state_transitions`
WHERE pipeline_logging_id = 'your-pipeline-logging-id'
ORDER BY transition_time ASC;
```

## Performance Considerations

### Queue Management

- **Queue Size:** 1000 entries per queue (configurable via `METADATA_LOG_QUEUE_SIZE`)
- **Batch Size:** 100 entries per flush (configurable via `METADATA_LOG_BATCH_SIZE`)
- **Flush Interval:** 5 seconds (configurable via `METADATA_LOG_FLUSH_INTERVAL_SECONDS`)
- **Workers:** 5 parallel flush workers (configurable via `METADATA_LOG_WORKERS`)

### Backpressure Handling

State transition logging uses **graceful degradation** instead of failing pipelines:

```python
try:
    await asyncio.wait_for(
        self._state_transition_queue.put(log_entry),
        timeout=5.0
    )
except asyncio.TimeoutError:
    # Queue is full - log warning but don't fail pipeline
    logger.warning("State transition log queue full - transition not logged")
```

This ensures that state transition logging never blocks or fails pipeline execution.

### BigQuery Costs

- **Streaming Inserts:** Uses `insert_rows_json()` with `insertId` for idempotency
- **Partitioning:** Daily partitions reduce query costs
- **Retention:** Consider setting up table expiration (e.g., 90 days) for cost optimization

**Example Expiration:**

```sql
ALTER TABLE `project.organizations.org_meta_state_transitions`
SET OPTIONS (
  partition_expiration_days = 90
);
```

## Future Enhancements

### 1. Retry Logic Implementation

**Current State:** Retry count is always `0` (TODO comments in code)

**Planned:**
- Implement automatic retry for `TRANSIENT` errors
- Use exponential backoff from `get_retry_delay()`
- Track retry count in state transitions
- Maximum retries configurable per pipeline/step

### 2. State Transition Alerts

**Planned:**
- Alert on pipelines stuck in RUNNING state > threshold
- Alert on high failure rates for specific error types
- Alert on retryable errors exceeding max retries

### 3. Dashboards and Visualizations

**Planned:**
- Pipeline execution timeline visualization
- Error type distribution charts
- Retry success rate analysis
- State transition heatmaps

### 4. Automated Remediation

**Planned:**
- Auto-retry for TRANSIENT errors
- Auto-scale resources for resource contention errors
- Auto-notification for PERMANENT errors requiring intervention

## Testing

### Manual Testing

**1. Run a Successful Pipeline:**

```bash
curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/gcp/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-01"}'
```

**Expected State Transitions:**
- PIPELINE: PENDING → RUNNING → COMPLETED
- Each STEP: PENDING → RUNNING → COMPLETED

**2. Trigger a Timeout:**

Create a test pipeline with very short timeout:

```yaml
# configs/test/timeout/test_timeout.yml
pipeline_id: test-timeout
timeout_minutes: 0.1  # 6 seconds
steps:
  - step_id: slow_step
    processor: generic.slow_processor
    config:
      sleep_seconds: 30  # Will timeout
```

**Expected State Transitions:**
- PIPELINE: PENDING → RUNNING → TIMEOUT
- STEP: PENDING → RUNNING → FAILED (timeout)

**3. Trigger a Validation Error:**

```bash
curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/invalid/domain/pipeline" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected State Transitions:**
- PIPELINE: PENDING → RUNNING → FAILED (error_type: VALIDATION_ERROR)

### Query Test Results

```sql
SELECT *
FROM `project.organizations.org_meta_state_transitions`
WHERE org_slug = 'test_org'
  AND transition_date = CURRENT_DATE()
ORDER BY transition_time DESC
LIMIT 100;
```

## Migration Guide

### Existing Systems

If you have an existing system running without state transition logging:

**1. Run Bootstrap to Create Table:**

```bash
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{}'
```

**2. Deploy Updated Code:**

No breaking changes - new logging is additive.

**3. Monitor Queue Depths:**

```python
queue_depths = metadata_logger.get_queue_depths()
print(queue_depths['state_transition_queue_utilization_pct'])
```

**4. Verify State Transitions:**

Run a test pipeline and query the state transitions table.

### Backwards Compatibility

- ✅ Existing `log_step_end()` calls work without `error_context` parameter
- ✅ State transition logging is non-blocking and won't fail pipelines
- ✅ No changes to existing table schemas
- ✅ No changes to existing API endpoints

## Troubleshooting

### State Transitions Not Appearing

**Check:**
1. Bootstrap completed successfully: `SELECT COUNT(*) FROM organizations.org_meta_state_transitions`
2. Queue not full: `metadata_logger.get_queue_depths()`
3. No flush errors in logs: `grep "Failed to flush state transition logs" /var/log/pipeline-service.log`

### Queue Full Warnings

**Solution:**
- Increase queue size: `export METADATA_LOG_QUEUE_SIZE=2000`
- Increase flush workers: `export METADATA_LOG_WORKERS=10`
- Decrease flush interval: `export METADATA_LOG_FLUSH_INTERVAL_SECONDS=2`

### Performance Impact

**Monitor:**
- Pipeline execution time (should be unchanged)
- Queue utilization (should be < 80%)
- BigQuery streaming insert costs

**Optimize:**
- Increase batch size for fewer API calls: `export METADATA_LOG_BATCH_SIZE=200`
- Decrease flush interval for faster processing: `export METADATA_LOG_FLUSH_INTERVAL_SECONDS=2`

## Summary

The enhanced logging system provides comprehensive observability into pipeline execution:

✅ **Complete State History** - Every state transition tracked with full context
✅ **Error Classification** - Automatic classification as TRANSIENT, PERMANENT, TIMEOUT, etc.
✅ **Detailed Failure Context** - Stack traces, retry counts, error types
✅ **Non-Blocking** - Graceful degradation if logging fails
✅ **Scalable** - Designed for 100+ concurrent pipelines
✅ **Queryable** - Rich analysis via BigQuery SQL

This enables:
- Faster debugging of failed pipelines
- Pattern analysis for systemic issues
- Compliance and audit requirements
- Automated remediation (future)
- Performance optimization insights

---

**Documentation Version:** 1.0
**Last Updated:** 2025-12-21
**Author:** Claude Code
**Status:** ✅ Implemented
