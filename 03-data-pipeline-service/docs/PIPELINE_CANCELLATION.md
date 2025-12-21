# Pipeline Cancellation

## Overview

The pipeline service now supports graceful cancellation of running pipelines. When a pipeline is cancelled, it will:

1. Complete any in-progress steps
2. Stop before executing the next step
3. Update the status to `CANCELLED` in BigQuery
4. Clean up resources properly

## How It Works

### Cancellation Flow

```
User Request → Cancel Endpoint → Update Status to CANCELLING
                                         ↓
                            Executor checks before each step
                                         ↓
                            Detects CANCELLING status
                                         ↓
                            Stops execution gracefully
                                         ↓
                            Updates status to CANCELLED
```

### Implementation Details

1. **API Endpoint**: `DELETE /api/v1/pipelines/runs/{pipeline_logging_id}`
   - Sets pipeline status to `CANCELLING` in BigQuery
   - Returns immediately with status confirmation

2. **Executor Check**: Before each execution level (step group)
   - Queries BigQuery for current status
   - If status is `CANCELLING`, raises cancellation exception
   - Pipeline stops gracefully and sets status to `CANCELLED`

3. **Status Flow**:
   - `PENDING` → `RUNNING` → `CANCELLING` → `CANCELLED`
   - In-progress steps complete normally
   - Next steps are skipped

## API Usage

### Cancel a Running Pipeline

```bash
# Cancel pipeline by logging ID
curl -X DELETE "http://localhost:8001/api/v1/pipelines/runs/{pipeline_logging_id}" \
  -H "X-API-Key: $ORG_API_KEY"

# Response (success):
{
  "pipeline_logging_id": "abc-123-def",
  "status": "CANCELLING",
  "message": "Pipeline cancellation requested. In-progress steps will complete, then pipeline will stop."
}

# Response (already finished):
{
  "pipeline_logging_id": "abc-123-def",
  "status": "COMPLETED",
  "message": "Pipeline already finished with status: COMPLETED. Cannot cancel."
}

# Response (not found):
{
  "error": "pipeline_not_found",
  "message": "Pipeline run abc-123-def not found for organization test_org"
}
```

### Check Pipeline Status

```bash
# Query BigQuery to check status
bq query --use_legacy_sql=false \
  "SELECT pipeline_logging_id, status, start_time, end_time, duration_ms
   FROM \`{project}.organizations.org_meta_pipeline_runs\`
   WHERE pipeline_logging_id = '{pipeline_logging_id}'"
```

## Testing Cancellation

### Manual Test Flow

1. **Start a long-running pipeline**:
```bash
# Start a pipeline that takes time to complete
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-01"}'

# Note the pipeline_logging_id from the response
```

2. **Cancel the pipeline while it's running**:
```bash
# Cancel using the logging ID
curl -X DELETE "http://localhost:8001/api/v1/pipelines/runs/{pipeline_logging_id}" \
  -H "X-API-Key: $ORG_API_KEY"
```

3. **Verify the status**:
```bash
# Check final status in BigQuery
bq query --use_legacy_sql=false \
  "SELECT status, error_message, duration_ms
   FROM \`{project}.organizations.org_meta_pipeline_runs\`
   WHERE pipeline_logging_id = '{pipeline_logging_id}'"

# Expected status: CANCELLED
```

### Automated Test Example

```python
import asyncio
import httpx

async def test_pipeline_cancellation():
    """Test pipeline cancellation functionality."""

    # Start pipeline
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"http://localhost:8001/api/v1/pipelines/run/{org_slug}/gcp/cost/billing",
            headers={"X-API-Key": org_api_key},
            json={"date": "2025-12-01"}
        )
        pipeline_logging_id = response.json()["pipeline_logging_id"]

        # Wait a bit for pipeline to start
        await asyncio.sleep(2)

        # Cancel pipeline
        cancel_response = await client.delete(
            f"http://localhost:8001/api/v1/pipelines/runs/{pipeline_logging_id}",
            headers={"X-API-Key": org_api_key}
        )

        assert cancel_response.json()["status"] == "CANCELLING"

        # Wait for cancellation to complete
        await asyncio.sleep(5)

        # Verify status in BigQuery
        # ... query BigQuery to check final status is CANCELLED
```

## Edge Cases

### 1. Pipeline Already Finished
- **Behavior**: Returns current status, no changes made
- **Status Codes**: `COMPLETED`, `FAILED`, `TIMEOUT`, `CANCELLED`
- **Message**: "Pipeline already finished with status: {status}. Cannot cancel."

### 2. Pipeline Not Found
- **Behavior**: Returns 404 error
- **Message**: "Pipeline run {id} not found for organization {org}"

### 3. Race Condition (Status Changed)
- **Behavior**: Returns current status
- **Message**: "Pipeline status changed to {status} before cancellation could be applied."

### 4. In-Progress Steps
- **Behavior**: Current step completes normally
- **Next Steps**: Skipped
- **Final Status**: `CANCELLED`

## Monitoring

### Logs

```bash
# Executor logs when cancellation detected
INFO: Pipeline cancellation detected - stopping execution
  pipeline_logging_id: abc-123-def
  tracking_pipeline_id: org-gcp-cost-billing

# Executor logs when cancelled
WARNING: Pipeline cancelled by user: Pipeline cancelled before level 2/5
  pipeline_logging_id: abc-123-def
```

### Metrics

- Pipeline execution status metrics include `CANCELLED` status
- Concurrent pipeline counter decremented properly
- Usage quotas updated correctly for cancelled pipelines

## Status Values

| Status | Description | Can Cancel? |
|--------|-------------|-------------|
| `PENDING` | Pipeline queued but not started | ✓ Yes |
| `RUNNING` | Pipeline actively executing | ✓ Yes |
| `CANCELLING` | Cancellation requested, finishing current step | ✗ No (already cancelling) |
| `CANCELLED` | Pipeline stopped by user | ✗ No (already stopped) |
| `COMPLETED` | Pipeline finished successfully | ✗ No (already finished) |
| `FAILED` | Pipeline failed with error | ✗ No (already finished) |
| `TIMEOUT` | Pipeline exceeded timeout limit | ✗ No (already finished) |

## Code References

| Component | File | Key Methods |
|-----------|------|-------------|
| Cancel Endpoint | `/src/app/routers/pipelines.py` | `cancel_pipeline_run()` |
| Cancellation Check | `/src/core/pipeline/async_executor.py` | `_check_cancellation()` |
| Status Update | `/src/core/pipeline/async_executor.py` | `_execute_pipeline_internal()` |
| Schema | `/configs/setup/bootstrap/schemas/org_meta_pipeline_runs.json` | `status` field |

## Future Enhancements

- [ ] Add cancellation reason/message from user
- [ ] Support for force cancellation (kill in-progress steps)
- [ ] Webhook notifications for cancelled pipelines
- [ ] UI for cancellation in frontend dashboard
- [ ] Cancellation history and analytics

---

**Last Updated**: 2025-12-21
**Version**: 1.0
