# Fix: Processor Status Propagation

## Problem

Pipelines were reporting `status: COMPLETED` even when stored procedures failed internally. The error WAS logged in `/tmp/pipeline-service.log` but not reflected in the pipeline status or API response.

**Example:**
```json
// Log showed error:
{"severity": "ERROR", "msg": "BigQuery API error executing procedure: sp_run_saas_subscription_costs_pipeline", "error": "400 sp_run_saas_subscription_costs_pipeline Failed..."}

// But API response showed success:
{"msg": "Pipeline completed successfully", "pipeline_id": "saas_cost", "status": "COMPLETED", "error_message": null}
```

## Root Cause

The issue was in the pipeline execution flow:

1. **Processor returns FAILED status**: `procedure_executor.py` catches BigQuery errors and returns `{"status": "FAILED", "error": "..."}` instead of raising an exception
2. **Executor ignores status**: `async_executor.py` receives this result but doesn't check the `status` field
3. **Step marked as COMPLETED**: Since no exception was raised, the step is unconditionally marked as `COMPLETED` (line 926)
4. **Pipeline completes successfully**: Pipeline executor sees all steps as completed and sets `self.status = "COMPLETED"`

## Solution

Added status checking in `src/core/pipeline/async_executor.py::_execute_step_async()`:

```python
# FIX: Check processor result status - processors may return {"status": "FAILED", "error": "..."}
# instead of raising exceptions (e.g., procedure_executor.py catches BigQuery errors)
processor_status = result.get('status', 'SUCCESS')
if processor_status == "FAILED":
    # Processor reported failure - extract error and fail the step
    error_message = result.get('error', 'Unknown error from processor')
    error_type = result.get('error_type', 'ProcessorError')
    self.logger.error(
        f"Processor reported failure for step {step_id}",
        extra={
            "error": error_message,
            "error_type": error_type,
            "processor_result": result
        }
    )
    # Raise exception to trigger step failure handling
    raise ValueError(f"Processor failed: {error_message}")
```

## Execution Flow After Fix

```
Processor returns {"status": "FAILED", "error": "..."}
    │
    ├─ async_executor.py checks result.get('status')
    │
    ├─ Detects "FAILED" status
    │
    ├─ Logs error with full context
    │
    ├─ Raises ValueError exception
    │
    ├─ Step marked as FAILED (line 940)
    │
    ├─ Exception propagates to _execute_pipeline_internal()
    │
    ├─ Pipeline status set to FAILED (line 700)
    │
    ├─ Pipeline summary returns {"status": "FAILED", ...}
    │
    └─ API response shows FAILED with error_message
```

## Affected Processors

All processors that return `{"status": "FAILED", ...}` instead of raising exceptions:

- `generic/procedure_executor.py` - BigQuery stored procedures
- `openai/subscriptions.py` - OpenAI API errors
- `anthropic/usage.py` - Anthropic API errors
- `gcp/gcp_api_extractor.py` - GCP API errors
- `generic/local_bq_transformer.py` - BigQuery transformation errors
- And many more...

## Backward Compatibility

The fix maintains backward compatibility:

- **Default behavior**: If a processor doesn't return a `status` field, it defaults to `'SUCCESS'` (line 915)
- **Exception-based processors**: Processors that raise exceptions continue to work as before
- **Status-based processors**: Processors that return `{"status": "FAILED", ...}` now properly fail the pipeline

## Testing

Added comprehensive unit tests in `tests/test_processor_status_propagation.py`:

1. **test_processor_failure_status_propagation**: Verifies FAILED status is propagated
2. **test_processor_success_status_propagation**: Verifies SUCCESS status works correctly
3. **test_processor_missing_status_defaults_to_success**: Verifies backward compatibility

All tests pass:
```bash
$ pytest tests/test_processor_status_propagation.py -v
======================== 3 passed, 2 warnings in 4.87s =========================
```

## Expected Behavior After Fix

**Before:**
```json
POST /api/v1/pipelines/run/{org}/saas_subscription/costs/saas_cost
Response: {
  "status": "COMPLETED",
  "error_message": null
}
// But logs show BigQuery error
```

**After:**
```json
POST /api/v1/pipelines/run/{org}/saas_subscription/costs/saas_cost
Response: {
  "status": "FAILED",
  "error_message": "Processor failed: BigQuery API error executing procedure: sp_run_saas_subscription_costs_pipeline"
}
// Error visible in API response and frontend UI
```

## Files Modified

1. **src/core/pipeline/async_executor.py**
   - Added status checking in `_execute_step_async()` method (lines 913-929)
   - Raises exception when processor returns FAILED status
   - Logs error with full context for debugging

2. **tests/test_processor_status_propagation.py** (NEW)
   - Comprehensive unit tests for status propagation
   - Tests FAILED, SUCCESS, and missing status scenarios
   - Ensures backward compatibility

## Impact

- **Correctness**: Pipeline status now accurately reflects execution outcome
- **Observability**: Errors visible in API responses and frontend UI
- **Debugging**: Error messages propagated from processor to user
- **Data Quality**: No more silent failures that corrupt data
- **User Experience**: Frontend can show actual error messages instead of "completed successfully"

## Related Issues

This fix resolves the issue where:
- Stored procedure failures weren't visible in the pipeline status
- Frontend UI showed "completed" for failed pipelines
- Error messages were logged but not returned in API responses
- Data quality issues could go unnoticed due to silent failures

---

**Fixed Date**: 2025-12-17
**Author**: Claude Code (Anthropic)
**Version**: Pipeline Service 3.2
