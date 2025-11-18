# Pipeline Test Case Details

## Overview

This document details each of the 10 test cases in the comprehensive pipeline test suite.

**Test File:** `/tests/test_comprehensive_pipeline_scenarios.py`
**Test Tenant:** `guru_232342`
**Total Duration:** ~105 seconds

---

## Test 1: Cost Billing Pipeline Execution

### Purpose
Verify that the core cost billing pipeline executes correctly with proper variable substitution and data loading.

### Configuration
- **Pipeline ID:** `cost_billing`
- **Processor Type:** `gcp.bq_etl`
- **Source:** GCP billing export table
- **Destination:** `billing_cost_daily` in tenant's cost dataset

### Test Steps
1. Create executor for cost_billing pipeline
2. Pass parameters: `date` (yesterday's date), `admin_email`
3. Execute pipeline
4. Verify completion with COMPLETED status
5. Check that steps were executed

### Expected Results
✅ Pipeline Status: COMPLETED
✅ Duration: ~5.4 seconds
✅ Rows processed: Data extracted from billing source
✅ Metadata logged: Pipeline execution tracked

### Key Validations
- Variable substitution: `{date}`, `{source_billing_table}`, `{destination_table}`
- Parameter passing: `date` and `admin_email` properly substituted
- Notification step: Email notification step present and executed

### Sample Code
```python
executor = PipelineExecutor(
    tenant_id=TEST_TENANT_ID,
    pipeline_id="cost_billing",
    trigger_type="test",
    trigger_by="test_runner"
)

yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
parameters = {
    "date": yesterday,
    "admin_email": "test@example.com"
}

result = executor.execute(parameters=parameters)
assert result['status'] == 'COMPLETED'
```

---

## Test 2: Data Quality Check Pipeline

### Purpose
Verify data quality validation pipeline execution (optional feature).

### Configuration
- **Pipeline ID:** `sample_dq_check`
- **Processor Type:** `gcp.dq_check`
- **Validation:** Great Expectations expectations

### Test Status
⊘ **SKIPPED** - No DQ pipeline configured for test tenant

### How to Enable
1. Create pipeline configuration: `configs/guru_232342/gcp/dq/sample_dq_check.yml`
2. Define Great Expectations suite
3. Re-run tests

### Expected Results (if enabled)
✅ DQ checks executed
✅ Passed/failed count reported
✅ Results logged to metadata table

---

## Test 3: Email Notification on Success

### Purpose
Verify pipeline executes and email notification steps complete successfully.

### Configuration
- **Pipeline ID:** `cost_billing` (uses same pipeline as Test 1)
- **Notification Step:** `notify_on_failure`
- **Trigger:** On pipeline completion

### Test Steps
1. Execute cost_billing pipeline
2. Pipeline completes successfully
3. Verify notification steps were included in execution
4. Check metadata for notification step logs

### Expected Results
✅ Pipeline Status: COMPLETED
✅ Duration: ~7.0 seconds
✅ Notification Steps: 1 (notify_on_failure)
✅ All steps logged to metadata

### Key Validations
- Pipeline completes without error
- Notification step is present in step list
- Pipeline metadata recorded correctly

### Sample Code
```python
result = executor.execute(parameters=parameters)
assert result['status'] == 'COMPLETED'
notification_steps = [s for s in result['steps']
                     if 'notify' in s['step_id'].lower()]
assert len(notification_steps) > 0
```

---

## Test 4: Email Notification on Failure

### Purpose
Verify failure notification system is triggered when pipeline fails.

### Configuration
- **Pipeline ID:** `cost_billing`
- **Failure Trigger:** Invalid date parameter
- **Expected Failure:** Query validation error

### Test Steps
1. Execute pipeline with invalid date: `INVALID_DATE`
2. Pipeline execution fails as expected
3. Verify failure notification would be triggered
4. Check that failure is gracefully handled

### Expected Results
✅ Pipeline Status: FAILED
✅ Error Message: "Could not cast literal 'INVALID_DATE' to type DATE"
✅ Notification System: Configured for failure
✅ Error Handling: Graceful exception handling

### Key Validations
- Invalid input properly rejected
- Failure notifications are in place
- Pipeline failure handled gracefully
- Error message logged

### Note
This test verifies the notification CONFIGURATION is in place, not actual email sending (which requires email service integration).

---

## Test 5: Multiple Sequential Runs

### Purpose
Verify multiple pipeline executions can run sequentially with proper isolation.

### Configuration
- **Pipeline ID:** `cost_billing`
- **Number of Runs:** 3
- **Delay Between Runs:** 1 second

### Test Steps
1. Execute pipeline 3 times sequentially
2. Each run uses different date parameter (days 1, 2, 3 ago)
3. Each run has unique `trigger_by` identifier
4. Verify all runs complete with COMPLETED status

### Expected Results
✅ Run 1: COMPLETED
✅ Run 2: COMPLETED
✅ Run 3: COMPLETED
✅ Average Duration: Similar across all runs
✅ All runs logged separately

### Key Validations
- Each run has unique pipeline_logging_id
- Parameters properly isolated between runs
- No cross-contamination of execution contexts
- Metadata tracks each run independently

### Sample Code
```python
for i in range(3):
    date_param = (datetime.now() - timedelta(days=i+1)).strftime("%Y-%m-%d")
    result = executor.execute(parameters={"date": date_param, ...})
    assert result['status'] == 'COMPLETED'
    # Verify unique logging ID
    assert result['pipeline_logging_id'] != previous_id
```

---

## Test 6: Missing Source Data Handling

### Purpose
Verify pipeline gracefully handles queries that return no results (future date, no matching data).

### Configuration
- **Pipeline ID:** `cost_billing`
- **Date Parameter:** Future date (365 days from now)
- **Expected Rows:** 0 (no data exists for future date)

### Test Steps
1. Execute pipeline with future date
2. Query runs but returns no rows
3. Verify pipeline completes successfully
4. Check that rows_processed = 0

### Expected Results
✅ Pipeline Status: COMPLETED
✅ Rows Processed: 0
✅ No Errors: Pipeline doesn't fail on empty result
✅ Graceful Handling: Proper handling of edge case

### Key Validations
- Pipeline doesn't crash with empty result set
- Metadata properly logs zero rows processed
- No false error messages
- Pipeline treated as successful

### Importance
This test ensures the pipeline can handle transient situations where no new data exists for processing (e.g., running on holiday, weekend, or before data is available).

---

## Test 7: Variable Substitution

### Purpose
Verify that all types of variables are correctly substituted in pipeline execution.

### Configuration
- **Pipeline ID:** `cost_billing`
- **Variables to Test:**
  - date (runtime parameter)
  - admin_email (runtime parameter)
  - custom_var (custom runtime parameter)

### Test Steps
1. Load pipeline configuration
2. Pass custom parameters to executor
3. Verify config loads with parameters
4. Check that variable values are accessible

### Expected Results
✅ Config Parameters Loaded: 3 (date, admin_email, custom_var)
✅ Date Variable: "2024-11-01" (correctly set)
✅ Email Variable: "custom-admin@test.com" (correctly set)
✅ Custom Variable: "test_value_123" (correctly set)

### Key Validations
- Variables loaded from multiple sources
- Parameters accessible via config.get('parameters')
- All variable types supported
- Custom variables available for use

### Sample Code
```python
config = executor.load_config(parameters={
    "date": "2024-11-01",
    "admin_email": "custom-admin@test.com",
    "custom_var": "test_value_123"
})

assert config['parameters']['date'] == "2024-11-01"
assert config['parameters']['admin_email'] == "custom-admin@test.com"
```

---

## Test 8: Tenant Onboarding

### Purpose
Verify new tenant can be properly onboarded with required datasets and tables created.

### Configuration
- **New Tenant ID:** `guru_test_001`
- **Dataset:** `gac-prod-471220.guru_test_001`
- **Pipeline ID:** `onboarding`

### Test Steps
1. Create BigQuery dataset for new tenant
2. Create metadata tables (pipeline_runs, step_logs, etc.)
3. Execute onboarding pipeline
4. Verify onboarding test table exists
5. Confirm all initialization complete

### Expected Results
✅ Dataset Created: `gac-prod-471220.guru_test_001`
✅ Dataset Location: US
✅ Onboarding Pipeline: COMPLETED
✅ Test Table Verified: `x_meta_onboarding_dryrun_test`
✅ Duration: ~2.5 seconds

### Key Validations
- Dataset creation with proper location
- Metadata tables initialized
- Onboarding pipeline executes
- Test table confirms successful onboarding
- All required infrastructure in place

### Metadata Tables Created
- `x_meta_pipeline_runs`
- `x_meta_step_logs`
- `x_meta_dq_results`

### Important
This test demonstrates the full onboarding workflow for new tenants, ensuring they have all necessary infrastructure.

---

## Test 9: Pipeline Metadata Logging Verification

### Purpose
Verify that all pipeline execution metadata is properly logged to BigQuery tables.

### Configuration
- **Pipeline ID:** `cost_billing`
- **Metadata Tables:**
  - `x_meta_pipeline_runs` (overall pipeline execution)
  - `x_meta_step_logs` (individual step execution)

### Test Steps
1. Execute cost_billing pipeline
2. Wait 3 seconds for metadata flush
3. Query `x_meta_pipeline_runs` for pipeline record
4. Query `x_meta_step_logs` for step records
5. Verify all data captured

### Expected Results
✅ Pipeline Record Found: 1
✅ Pipeline Status: RUNNING (initial status)
✅ Step Records: 4 (2 steps × 2 transitions each)
✅ Steps Logged:
  - `extract_billing_costs` (gcp.bq_etl): RUNNING → COMPLETED
  - `notify_on_failure` (notify_systems.email_notification): RUNNING → COMPLETED

### Key Validations
- Pipeline_logging_id unique identifier tracked
- Tenant_id correctly recorded
- Status transitions logged (RUNNING, COMPLETED)
- Step types recorded
- All metadata properly inserted

### Metadata Fields Verified
**Pipeline Runs:**
- pipeline_logging_id
- tenant_id
- pipeline_id
- status
- start_time
- end_time
- duration_ms

**Step Logs:**
- step_logging_id
- pipeline_logging_id (foreign key)
- step_name
- step_type
- status
- start_time
- end_time
- rows_processed

### Query Example
```sql
SELECT
  pipeline_logging_id,
  tenant_id,
  pipeline_id,
  status,
  start_time,
  end_time
FROM `gac-prod-471220.guru_232342.x_meta_pipeline_runs`
WHERE pipeline_logging_id = '67348110-ea4e-433b-918d-745834c3eb18'
```

---

## Test 10: Concurrent Pipeline Execution

### Purpose
Verify that multiple pipelines can execute concurrently without interference or data corruption.

### Configuration
- **Pipeline ID:** `cost_billing`
- **Number of Concurrent Runs:** 3
- **Execution Method:** ThreadPoolExecutor with 3 workers

### Test Steps
1. Submit 3 pipeline executions concurrently
2. Each execution uses different date parameter
3. Each execution has unique trigger_by identifier
4. Wait for all to complete
5. Verify all completed successfully
6. Check timing metrics

### Expected Results
✅ Run 0: COMPLETED
✅ Run 1: COMPLETED
✅ Run 2: COMPLETED
✅ Total Time: ~7.8 seconds
✅ Average per Pipeline: ~2.6 seconds
✅ No Execution Conflicts

### Key Validations
- All 3 concurrent runs complete
- Each has unique pipeline_logging_id
- Parameters isolated between runs
- No cross-contamination
- Execution times reasonable
- Metadata properly captures all runs

### Sample Code
```python
with ThreadPoolExecutor(max_workers=3) as executor:
    futures = [executor.submit(execute_pipeline, i) for i in range(3)]

    for future in as_completed(futures):
        result = future.result()
        assert result['status'] == 'COMPLETED'

# Verify all 3 succeeded
successful_runs = [r for r in results if r['status'] == 'COMPLETED']
assert len(successful_runs) == 3
```

### Timing Analysis
- **Sequential Execution (3 runs):** ~16.2 seconds (5.4s × 3)
- **Concurrent Execution (3 runs):** ~7.8 seconds
- **Speedup:** 2.08x faster with concurrency
- **Parallel Efficiency:** 69% (theoretical max 3x)

### Importance
This test confirms the system can handle multiple pipelines running simultaneously, which is critical for production environments where multiple tenants/pipelines execute in parallel.

---

## Test Results Summary Table

| # | Test Name | Status | Duration | Key Metric |
|---|-----------|--------|----------|------------|
| 1 | Cost Billing | ✅ PASS | 5.4s | Variable substitution |
| 2 | Data Quality | ⊘ SKIP | N/A | Optional feature |
| 3 | Email (Success) | ✅ PASS | 7.0s | Notification execution |
| 4 | Email (Failure) | ✅ PASS | N/A | Error handling |
| 5 | Sequential Runs | ✅ PASS | 16s total | Run isolation |
| 6 | Missing Data | ✅ PASS | 5.4s | Graceful handling |
| 7 | Variables | ✅ PASS | 0.1s | Config parsing |
| 8 | Onboarding | ✅ PASS | 2.5s | Dataset creation |
| 9 | Metadata Logging | ✅ PASS | 3s wait | Data tracking |
| 10 | Concurrent | ✅ PASS | 7.8s | Parallelization |

---

## Running Individual Tests

To run a specific test:

```bash
# Run only cost billing test
python -c "
from tests.test_comprehensive_pipeline_scenarios import PipelineTestRunner
runner = PipelineTestRunner()
runner.test_1_cost_billing_pipeline()
runner.print_summary()
"

# Run only metadata logging test
python -c "
from tests.test_comprehensive_pipeline_scenarios import PipelineTestRunner
runner = PipelineTestRunner()
runner.test_9_metadata_logging()
runner.print_summary()
"

# Run only concurrent test
python -c "
from tests.test_comprehensive_pipeline_scenarios import PipelineTestRunner
runner = PipelineTestRunner()
runner.test_10_concurrent_execution()
runner.print_summary()
"
```

---

## Debugging Failed Tests

If a test fails:

1. **Check logs in BigQuery:**
   ```sql
   SELECT * FROM `gac-prod-471220.guru_232342.x_meta_pipeline_runs`
   ORDER BY start_time DESC LIMIT 1
   ```

2. **View step logs:**
   ```sql
   SELECT * FROM `gac-prod-471220.guru_232342.x_meta_step_logs`
   WHERE pipeline_logging_id = 'YOUR_PIPELINE_ID'
   ORDER BY start_time
   ```

3. **Check error messages in test output:**
   - Look for line with `✗` symbol
   - Read error message carefully
   - Check stack trace if provided

4. **Verify configuration:**
   - Confirm pipeline YAML exists
   - Check variable definitions
   - Validate parameter types

5. **Check GCP credentials:**
   - Verify BigQuery access
   - Check project permissions
   - Confirm dataset exists

---

## Performance Benchmarks

**Test Execution Times (as of Nov 18, 2025):**

- Cost Billing Pipeline: 5.4 seconds
- Email Notifications: 7.0 seconds
- Sequential Runs (3x): 16.2 seconds
- Variable Substitution: 0.1 seconds
- Tenant Onboarding: 2.5 seconds
- Metadata Logging: 8.0 seconds (includes 3s wait)
- Concurrent Execution: 7.8 seconds
- **Total Suite Duration: 105.5 seconds**

**Concurrent Performance:**
- 3 sequential runs: 16.2s
- 3 concurrent runs: 7.8s
- Speedup: 2.08x

---

**Document Last Updated:** November 18, 2025
**Status:** All Tests Passing (9/10, 1 optional)
