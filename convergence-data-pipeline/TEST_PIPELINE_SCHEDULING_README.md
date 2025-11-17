# Pipeline Scheduling E2E Test Documentation

## Overview

The `test_pipeline_scheduling_e2e.py` file provides comprehensive end-to-end testing for pipeline scheduling with multiple customers. This test validates the complete workflow from customer onboarding through pipeline execution, quota enforcement, and cleanup.

## Test Architecture

### Test Customers

#### Customer 1: "acme_corp"
- **Subscription Plan**: PROFESSIONAL
- **Pipelines**:
  - GCP Cost Billing - Daily at 2:00 AM (`0 2 * * *`)
  - GCP Security Audit - Weekly on Monday (`0 0 * * 1`)
  - AWS Cost Analysis - Daily at 3:00 AM (`0 3 * * *`)

#### Customer 2: "globex_inc"
- **Subscription Plan**: SCALE
- **Pipelines**:
  - GCP Cost Billing - Daily at 2:00 AM (`0 2 * * *`)
  - Azure Compliance Check - Monthly on 1st (`0 0 1 * *`)
  - OpenAI Usage Tracking - Hourly (`0 * * * *`)

## Test Phases

### Phase 1: Setup
**Function**: `test_1_setup()`

**Steps**:
1. Onboard acme_corp with PROFESSIONAL plan
2. Onboard globex_inc with SCALE plan
3. Add GCP and AWS credentials for acme_corp
4. Add GCP and Azure credentials for globex_inc
5. Configure 3 pipelines for acme_corp with schedules
6. Configure 3 pipelines for globex_inc with schedules

**Assertions**:
- ✓ Customers onboarded successfully
- ✓ API keys generated and returned
- ✓ Credentials added and encrypted
- ✓ Pipeline configs created with schedules

### Phase 2: Scheduler Trigger
**Function**: `test_2_scheduler_trigger()`

**Steps**:
1. Call scheduler trigger endpoint
2. Verify pipelines were queued
3. Check scheduled_pipeline_runs table
4. Verify states

**Assertions**:
- ✓ Scheduler trigger queues pipelines
- ✓ At least 2 pipelines triggered (multiple customers)
- ✓ Scheduled runs created in database
- ✓ States are SCHEDULED or PENDING

### Phase 3: Queue Processing
**Function**: `test_3_queue_processing()`

**Steps**:
1. Get initial queue status
2. Process 5 items from queue
3. Verify state transitions
4. Check queue length decreased

**Assertions**:
- ✓ Queue processing works
- ✓ State transitions (SCHEDULED → PENDING → RUNNING)
- ✓ Queue length decreases as items processed

### Phase 4: State Management
**Function**: `test_4_state_management()`

**Steps**:
1. Get pipelines yet to run
2. Get running pipelines
3. Verify customer status

**Assertions**:
- ✓ Can query yet-to-run pipelines
- ✓ Can query running pipelines
- ✓ Customer status shows accurate counts
- ✓ acme_corp: 3 configured pipelines
- ✓ globex_inc: 3 configured pipelines

### Phase 5: Pipeline Completion
**Function**: `test_5_pipeline_completion()`

**Steps**:
1. Wait for pipelines to complete (timeout: 300s)
2. Verify all completed
3. Check next_run_time was updated

**Assertions**:
- ✓ Pipelines complete successfully
- ✓ State transitions to COMPLETED
- ✓ last_run_time updated
- ✓ next_run_time calculated correctly from cron schedule

### Phase 6: Quota Enforcement
**Function**: `test_6_quota_enforcement()`

**Steps**:
1. Set low quota for acme_corp (daily_limit=1)
2. Trigger scheduler
3. Verify only 1 pipeline ran
4. Verify others skipped with quota exceeded

**Assertions**:
- ✓ Quota enforcement works
- ✓ Only 1 pipeline executed (quota respected)
- ✓ Remaining pipelines skipped
- ✓ Error message: "quota exceeded"

### Phase 7: Retry Logic
**Function**: `test_7_retry_logic()`

**Steps**:
1. Force a pipeline to fail
2. Verify failed state
3. Check retry was scheduled

**Assertions**:
- ✓ Failed pipeline marked as FAILED
- ✓ Retry scheduled automatically
- ✓ retry_attempt = 1

### Phase 8: Cleanup
**Function**: `test_8_cleanup()`

**Steps**:
1. Delete acme_corp
2. Delete globex_inc
3. Verify cleanup

**Assertions**:
- ✓ Customers deleted
- ✓ All associated data removed
- ✓ Cleanup verified

## Running the Tests

### Prerequisites

```bash
# Install dependencies
pip install pytest pytest-asyncio croniter httpx
```

### Option 1: Run with pytest

```bash
# Run all tests with verbose output
pytest test_pipeline_scheduling_e2e.py -v --tb=short

# Run specific test
pytest test_pipeline_scheduling_e2e.py::test_1_setup -v

# Run with detailed output
pytest test_pipeline_scheduling_e2e.py -v -s
```

### Option 2: Run directly

```bash
# Run all tests
python test_pipeline_scheduling_e2e.py

# Set test environment
export TEST_ENV=staging
python test_pipeline_scheduling_e2e.py
```

## Expected Output

```
================================================================================
PIPELINE SCHEDULING E2E TEST SUITE
================================================================================
Environment: LOCAL
API URL: http://localhost:8080
Started: 2025-01-15 10:30:00
================================================================================

================================================================================
TEST 1: SETUP PHASE
================================================================================

[1/6] Onboarding acme_corp...
✓ Customer 1 onboarded: acme_corp
  API Key: acme_corp_api_xyz123...

[2/6] Onboarding globex_inc...
✓ Customer 2 onboarded: globex_inc
  API Key: globex_inc_api_abc789...

[3/6] Adding credentials for acme_corp...
  ✓ GCP credentials added
  ✓ AWS credentials added

[4/6] Adding credentials for globex_inc...
  ✓ GCP credentials added
  ✓ Azure credentials added

[5/6] Configuring pipelines for acme_corp...
  ✓ GCP Cost Billing - 0 2 * * *
  ✓ GCP Security Audit - 0 0 * * 1
  ✓ AWS Cost Analysis - 0 3 * * *

[6/6] Configuring pipelines for globex_inc...
  ✓ GCP Cost Billing - 0 2 * * *
  ✓ Azure Compliance Check - 0 0 1 * *
  ✓ OpenAI Usage Tracking - 0 * * * *

================================================================================
✓ SETUP COMPLETE
================================================================================

... (additional test output) ...

================================================================================
TEST SUMMARY
================================================================================
✓ Setup: PASSED
✓ Scheduler Trigger: PASSED
✓ Queue Processing: PASSED
✓ State Management: PASSED
✓ Pipeline Completion: PASSED
✓ Quota Enforcement: PASSED
✓ Retry Logic: PASSED
✓ Cleanup: PASSED

================================================================================
Total: 8 | Passed: 8 | Failed: 0
================================================================================
```

## Test Coverage Summary

### Customer Management
- ✓ Customer onboarding with subscription plans
- ✓ API key generation and storage
- ✓ Multi-customer isolation

### Credential Management
- ✓ GCP service account credentials
- ✓ AWS access key credentials
- ✓ Azure service principal credentials
- ✓ Credential encryption

### Pipeline Configuration
- ✓ Template-based pipeline configuration
- ✓ Cron schedule definition
- ✓ Multi-provider support (GCP, AWS, Azure, OpenAI)
- ✓ Multi-domain support (COST, SECURITY, COMPLIANCE, OBSERVABILITY)

### Scheduler Operations
- ✓ Schedule-based triggering
- ✓ Cron expression evaluation
- ✓ Queue management
- ✓ Concurrent execution handling

### State Management
- ✓ State transitions (SCHEDULED → PENDING → RUNNING → COMPLETED)
- ✓ next_run_time calculation
- ✓ last_run_time tracking
- ✓ Failed state handling

### Quota & Limits
- ✓ Daily pipeline limits
- ✓ Monthly pipeline limits
- ✓ Concurrent execution limits
- ✓ Quota enforcement
- ✓ Quota exceeded handling

### Retry & Error Handling
- ✓ Failed pipeline detection
- ✓ Automatic retry scheduling
- ✓ Retry attempt tracking
- ✓ Error message logging

### Data Cleanup
- ✓ Customer deletion
- ✓ Associated data cleanup
- ✓ Cleanup verification

## Implementation Notes

### Current Status

This test file provides a **comprehensive testing framework** with mock implementations. To make it fully functional, you need to implement the following API endpoints and database tables:

### Required API Endpoints

1. **POST /api/v1/customers/pipelines/configure**
   - Store pipeline configuration with schedule
   - Parameters: provider, domain, template_name, schedule, default_parameters

2. **POST /api/v1/scheduler/trigger**
   - Evaluate all pipeline schedules
   - Queue pipelines that are due
   - Return count of triggered pipelines

3. **GET /api/v1/scheduler/scheduled**
   - Get list of scheduled pipeline runs
   - Filter by customer, state, date

4. **POST /api/v1/scheduler/process**
   - Process next item in queue
   - Transition states
   - Execute pipeline

5. **GET /api/v1/scheduler/queue/status**
   - Get current queue status
   - Return counts by state

6. **PUT /api/v1/customers/{customer_id}/subscription/quota**
   - Update subscription quotas
   - Parameters: daily_limit, monthly_limit, concurrent_limit

7. **DELETE /api/v1/customers/{customer_id}**
   - Delete customer and all associated data
   - Cascade delete credentials, configurations, runs

### Required Database Tables

1. **pipeline_configurations**
   ```sql
   CREATE TABLE pipeline_configurations (
     config_id STRING NOT NULL,
     customer_id STRING NOT NULL,
     provider STRING NOT NULL,
     domain STRING NOT NULL,
     template_name STRING NOT NULL,
     schedule STRING NOT NULL,  -- Cron expression
     default_parameters JSON,
     is_active BOOL DEFAULT TRUE,
     last_run_time TIMESTAMP,
     next_run_time TIMESTAMP,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (config_id)
   );
   ```

2. **scheduled_pipeline_runs**
   ```sql
   CREATE TABLE scheduled_pipeline_runs (
     run_id STRING NOT NULL,
     config_id STRING NOT NULL,
     customer_id STRING NOT NULL,
     scheduled_time TIMESTAMP NOT NULL,
     state STRING NOT NULL,  -- SCHEDULED, PENDING, RUNNING, COMPLETED, FAILED
     pipeline_logging_id STRING,
     retry_attempt INT DEFAULT 0,
     error_message STRING,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (run_id)
   );
   ```

3. **subscription_quotas**
   ```sql
   CREATE TABLE subscription_quotas (
     customer_id STRING NOT NULL,
     usage_date DATE NOT NULL,
     pipelines_run_today INT DEFAULT 0,
     pipelines_run_month INT DEFAULT 0,
     concurrent_running INT DEFAULT 0,
     daily_limit INT NOT NULL,
     monthly_limit INT NOT NULL,
     concurrent_limit INT NOT NULL,
     PRIMARY KEY (customer_id, usage_date)
   );
   ```

## Integration with Existing Code

The test integrates with the following existing components:

- ✓ Customer onboarding (`/api/v1/customers/onboard`)
- ✓ API key authentication (`X-API-Key` header)
- ✓ Credential management (`/api/v1/customers/credentials`)
- ✓ Pipeline execution (`/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}`)

## Future Enhancements

1. **Real Database Integration**
   - Remove mock implementations
   - Connect to actual BigQuery tables
   - Verify data persistence

2. **Cloud Scheduler Integration**
   - Integrate with GCP Cloud Scheduler
   - Schedule actual cron jobs
   - Handle timezone conversions

3. **Notification Testing**
   - Test email notifications on failures
   - Test Slack notifications
   - Test webhook callbacks

4. **Performance Testing**
   - Test with 10+ customers
   - Test with 100+ pipelines
   - Measure queue processing throughput

5. **Chaos Testing**
   - Simulate network failures
   - Simulate database timeouts
   - Test retry mechanisms

## Troubleshooting

### Common Issues

1. **Connection Refused**
   ```
   Error: Connection refused to http://localhost:8080
   Solution: Ensure the API server is running on port 8080
   ```

2. **Authentication Failed**
   ```
   Error: 401 Unauthorized
   Solution: Check API key format and ensure it's properly stored in database
   ```

3. **Test Timeout**
   ```
   Error: Test timed out after 300s
   Solution: Increase timeout or check pipeline execution logs
   ```

## Contact

For questions or issues with this test:
- Review the main project README
- Check API documentation
- Review pipeline execution logs
