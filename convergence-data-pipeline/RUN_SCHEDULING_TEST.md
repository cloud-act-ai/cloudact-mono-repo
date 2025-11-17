# Quick Start: Pipeline Scheduling E2E Test

## Installation

```bash
# Install dependencies (croniter is already in requirements.txt)
pip install -r requirements.txt

# Or install just the test dependencies
pip install pytest pytest-asyncio croniter httpx
```

## Run the Test

### Option 1: Using pytest (Recommended)

```bash
# Run all tests with verbose output
pytest test_pipeline_scheduling_e2e.py -v --tb=short

# Expected output:
# test_1_setup PASSED
# test_2_scheduler_trigger PASSED
# test_3_queue_processing PASSED
# test_4_state_management PASSED
# test_5_pipeline_completion PASSED
# test_6_quota_enforcement PASSED
# test_7_retry_logic PASSED
# test_8_cleanup PASSED
#
# 8/8 tests passed ✅
```

### Option 2: Direct execution

```bash
# Run directly
python test_pipeline_scheduling_e2e.py
```

### Option 3: Run against different environments

```bash
# Test against local environment (default)
export TEST_ENV=local
pytest test_pipeline_scheduling_e2e.py -v

# Test against staging
export TEST_ENV=staging
pytest test_pipeline_scheduling_e2e.py -v

# Test against production (use with caution!)
export TEST_ENV=production
pytest test_pipeline_scheduling_e2e.py -v
```

## Test Scenarios Covered

### 1. Setup Phase (test_1_setup)
- ✓ Onboard 2 customers (acme_corp, globex_inc)
- ✓ Add credentials (GCP, AWS, Azure)
- ✓ Configure 6 pipelines with schedules

### 2. Scheduler Trigger (test_2_scheduler_trigger)
- ✓ Trigger scheduler
- ✓ Verify pipelines queued
- ✓ Check scheduled runs

### 3. Queue Processing (test_3_queue_processing)
- ✓ Process queue items
- ✓ Verify state transitions
- ✓ Monitor queue length

### 4. State Management (test_4_state_management)
- ✓ Query yet-to-run pipelines
- ✓ Query running pipelines
- ✓ Verify customer status

### 5. Pipeline Completion (test_5_pipeline_completion)
- ✓ Wait for completion
- ✓ Verify completed state
- ✓ Check next_run_time updated

### 6. Quota Enforcement (test_6_quota_enforcement)
- ✓ Set quota limits
- ✓ Verify enforcement
- ✓ Check skipped runs

### 7. Retry Logic (test_7_retry_logic)
- ✓ Force failure
- ✓ Verify retry scheduled
- ✓ Check retry attempt

### 8. Cleanup (test_8_cleanup)
- ✓ Delete customers
- ✓ Verify cleanup

## Pipeline Configurations

### Customer 1: acme_corp (PROFESSIONAL Plan)

| Pipeline | Provider | Domain | Schedule | Description |
|----------|----------|--------|----------|-------------|
| cost_billing | GCP | COST | `0 2 * * *` | Daily at 2:00 AM |
| security_audit | GCP | SECURITY | `0 0 * * 1` | Weekly on Monday |
| cost_analysis | AWS | COST | `0 3 * * *` | Daily at 3:00 AM |

### Customer 2: globex_inc (SCALE Plan)

| Pipeline | Provider | Domain | Schedule | Description |
|----------|----------|--------|----------|-------------|
| cost_billing | GCP | COST | `0 2 * * *` | Daily at 2:00 AM |
| compliance_check | AZURE | COMPLIANCE | `0 0 1 * *` | Monthly on 1st |
| usage_tracking | OPENAI | OBSERVABILITY | `0 * * * *` | Hourly |

## Current Status

⚠️ **Note**: This test currently uses **mock implementations** for scheduler endpoints and database operations. The test provides the complete framework and assertions, but requires the following to be implemented:

### Required API Endpoints (Not Yet Implemented)

- POST /api/v1/customers/pipelines/configure
- POST /api/v1/scheduler/trigger
- GET /api/v1/scheduler/scheduled
- POST /api/v1/scheduler/process
- GET /api/v1/scheduler/queue/status
- PUT /api/v1/customers/{customer_id}/subscription/quota
- DELETE /api/v1/customers/{customer_id}

### Required Database Tables (Not Yet Implemented)

- pipeline_configurations
- scheduled_pipeline_runs
- subscription_quotas

See [TEST_PIPELINE_SCHEDULING_README.md](TEST_PIPELINE_SCHEDULING_README.md) for full implementation details.

## Troubleshooting

### Test fails with "Connection refused"

**Problem**: API server not running

**Solution**:
```bash
# Start the API server
python -m uvicorn src.app.main:app --reload --port 8080
```

### Test fails with "ModuleNotFoundError: No module named 'croniter'"

**Problem**: croniter not installed

**Solution**:
```bash
# Install dependencies
pip install -r requirements.txt
```

### Test fails with "Import error: test_config"

**Problem**: Test config module not found

**Solution**:
```bash
# Ensure you're in the project root directory
cd /path/to/convergence-data-pipeline
python test_pipeline_scheduling_e2e.py
```

## Next Steps

To make this test fully functional:

1. **Implement Scheduler API Endpoints**
   - Create scheduler router in `src/app/routers/scheduler.py`
   - Implement trigger, queue, and status endpoints

2. **Create Database Tables**
   - Add pipeline_configurations table
   - Add scheduled_pipeline_runs table
   - Add subscription_quotas table

3. **Implement Scheduler Logic**
   - Cron expression evaluation
   - Queue management
   - State transitions

4. **Update Mock Functions**
   - Replace mock implementations with real API calls
   - Remove mock data
   - Add proper error handling

## File Locations

- **Test File**: `test_pipeline_scheduling_e2e.py`
- **Documentation**: `TEST_PIPELINE_SCHEDULING_README.md`
- **This Guide**: `RUN_SCHEDULING_TEST.md`
- **Test Config**: `tests/test_config.py`
- **Requirements**: `requirements.txt`

## Additional Resources

- [Main README](README.md)
- [API Documentation](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
