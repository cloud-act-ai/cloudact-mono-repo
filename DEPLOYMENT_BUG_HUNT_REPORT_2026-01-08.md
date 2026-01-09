# Deployment Auto-Issues Bug Hunt Report
**Date**: 2026-01-08
**Scope**: CICD Auto-Deployment System
**Status**: ⚠️ 12 CRITICAL BUGS FOUND

---

## Executive Summary

Comprehensive analysis of CloudAct CICD auto-deployment revealed **12 critical bugs** that would cause:
- ❌ **Silent failures** in production
- ❌ **Race conditions** during multi-service deployment
- ❌ **Service startup failures** due to missing dependencies
- ❌ **Data corruption** from schema/procedure version mismatches

**Priority**: P0 - Must fix before next production deployment

---

## Critical Bugs (MUST FIX IMMEDIATELY)

### 🔴 BUG-001: Missing Bootstrap Dependency Check (CRITICAL)
**Severity**: P0 - BLOCKING PRODUCTION
**File**: `04-inra-cicd-automation/CICD/deploy/deploy.sh`
**Impact**: First deployment to fresh environment WILL FAIL

**Problem**:
```bash
# Current flow:
deploy.sh api-service → Starts → Bootstrap runs async (60+ seconds)
    ↓ (5 seconds later, bootstrap NOT done)
deploy.sh pipeline-service → Starts → Looks for procedures → CRASHES
```

**Root Cause**:
- `deploy.sh` deploys services independently
- No check if bootstrap completed before deploying pipeline-service
- Pipeline-service readiness probe (lines 738-760 in main.py) requires 3 procedures
- Procedures created by bootstrap (takes 60+ seconds)
- **Race condition**: Pipeline starts before procedures exist

**Evidence**:
- `deploy.sh` has NO dependency ordering
- Pipeline readiness checks for procedures: `sp_subscription_2_calculate_daily_costs`, `sp_genai_2_consolidate_costs_daily`, `sp_cloud_1_convert_to_focus`
- Bootstrap creates 21 tables + 9 procedures (observed in bootstrap.sh)

**Fix Required**:
```bash
# Add to deploy.sh after api-service deployment:
if [ "$SERVICE" = "api-service" ]; then
    echo "Waiting for bootstrap to complete..."
    ./bootstrap/bootstrap.sh $ENV  # Verify bootstrap done
fi

# Before deploying pipeline-service:
if [ "$SERVICE" = "pipeline-service" ]; then
    # Check if api-service deployed
    API_EXISTS=$(gcloud run services list --project=$PROJECT_ID --filter="metadata.name=cloudact-api-service-${ENV}" --format="value(metadata.name)")
    if [ -z "$API_EXISTS" ]; then
        echo "ERROR: api-service must be deployed before pipeline-service"
        exit 1
    fi
fi
```

---

### 🔴 BUG-004: API_SERVICE_URL Race Condition (CRITICAL)
**Severity**: P0 - BLOCKING PRODUCTION
**File**: `04-inra-cicd-automation/CICD/deploy/deploy.sh` (lines 174-175)
**Impact**: Pipeline service cannot communicate with API service

**Problem**:
```bash
# Lines 174-175 in deploy.sh:
API_URL=$(gcloud run services describe cloudact-api-service-${ENV} ... || echo "")
[ -z "$API_URL" ] && API_URL="https://cloudact-api-service-${ENV}-${PROJECT_ID}.${REGION}.run.app"
```

**Race Condition**:
1. Deploy pipeline-service BEFORE api-service
2. Line 174: Tries to get API URL → FAILS (service doesn't exist)
3. Line 175: Fallback URL is **WRONG** (missing random hash in actual URL)
4. Pipeline-service starts with wrong API_SERVICE_URL
5. Health check fails (line 780 in pipeline main.py checks API connectivity)

**Fix Required**:
```bash
# In deploy.sh, enforce order:
if [ "$SERVICE" = "pipeline-service" ]; then
    API_URL=$(gcloud run services describe cloudact-api-service-${ENV} \
        --project=$PROJECT_ID \
        --region=$REGION \
        --format="value(status.url)" 2>/dev/null)

    if [ -z "$API_URL" ]; then
        echo "ERROR: api-service must be deployed before pipeline-service"
        echo "Deploy api-service first: ./deploy.sh api-service $ENV $PROJECT_ID"
        exit 1
    fi
fi
```

---

### 🔴 BUG-013: Stored Procedure Signature Changed (CRITICAL - NEW)
**Severity**: P0 - BREAKING CHANGE
**File**: `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
**Impact**: ALL subscription cost pipelines WILL FAIL

**Problem**:
Stored procedure signature changed from:
```sql
-- OLD (no longer works):
sp_subscription_2_calculate_daily_costs(p_project_id, p_dataset_id, p_start_date, p_end_date)

-- NEW (current):
sp_subscription_2_calculate_daily_costs(
    p_project_id, p_dataset_id, p_start_date, p_end_date,
    p_pipeline_id, p_credential_id, p_run_id  -- NEW REQUIRED PARAMS
)
```

**Impact**:
- All existing pipeline calls will fail with "wrong number of arguments"
- Need to update pipeline executor to pass new parameters

**Fix Required**:
```python
# File: 03-data-pipeline-service/src/core/processors/subscription/cost.py
# Update CALL statement to include new parameters:

call_query = f"""
CALL `{project_id}.organizations.sp_subscription_2_calculate_daily_costs`(
    @project_id,
    @dataset_id,
    @start_date,
    @end_date,
    @pipeline_id,      -- NEW
    @credential_id,    -- NEW
    @run_id            -- NEW
)
"""

job_config = bigquery.QueryJobConfig(
    query_parameters=[
        bigquery.ScalarQueryParameter("project_id", "STRING", project_id),
        bigquery.ScalarQueryParameter("dataset_id", "STRING", dataset_id),
        bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
        bigquery.ScalarQueryParameter("end_date", "DATE", end_date),
        bigquery.ScalarQueryParameter("pipeline_id", "STRING", context.get("pipeline_id")),
        bigquery.ScalarQueryParameter("credential_id", "STRING", context.get("credential_id")),
        bigquery.ScalarQueryParameter("run_id", "STRING", context.get("run_id")),
    ]
)
```

---

## High Priority Bugs

### 🟠 BUG-002: AUTO_SYNC_PROCEDURES Fails Silently
**Severity**: P1 - HIGH
**File**: `03-data-pipeline-service/src/app/main.py` (lines 207-290)
**Impact**: Procedures may not sync, pipelines fail with cryptic errors

**Problem**:
```python
# Line 220-222: Silent skip if dataset missing
except Exception:
    logger.info("Auto-sync skipped: organizations dataset not found")

# Line 262-264: Individual failures are warnings
except Exception as e:
    logger.warning(f"Failed to sync {proc_name}: {e}")
    # Service continues, marked "healthy"
```

**Fix Required**:
```python
# Change to fail startup in production:
if settings.is_production and procedures_failed:
    raise RuntimeError(
        f"Critical procedure sync failures: {procedures_failed}. "
        "Service cannot start without required procedures."
    )
```

---

### 🟠 BUG-003: Procedures Not Critical for Readiness
**Severity**: P1 - HIGH
**File**: `03-data-pipeline-service/src/app/main.py` (line 788)
**Impact**: Service marked "ready" but cannot execute pipelines

**Problem**:
```python
# Line 788: Only checks BigQuery, NOT procedures
critical_checks = checks["ready"] and checks["bigquery"]
```

**Fix Required**:
```python
# Line 788: Make procedures critical
critical_checks = checks["ready"] and checks["bigquery"] and checks["procedures"]
```

---

### 🟠 BUG-005: PIPELINE_SERVICE_URL Race Condition
**Severity**: P1 - HIGH
**File**: `04-inra-cicd-automation/CICD/deploy/deploy.sh` (lines 169-171)
**Impact**: API service cannot proxy pipeline requests

**Problem**: Same as BUG-004 but reverse direction.

**Fix Required**: Enforce deployment order: api-service → pipeline-service → frontend

---

### 🟠 BUG-011: No Deployment Order Enforcement
**Severity**: P1 - HIGH
**File**: `04-inra-cicd-automation/CICD/deploy/deploy.sh`
**Impact**: Services fail if deployed in wrong order

**Required Order**:
1. api-service (runs bootstrap)
2. pipeline-service (needs api-service URL, reads procedures)
3. frontend (needs both URLs)

**Fix Required**: Create `deploy-all.sh` that enforces order:
```bash
#!/bin/bash
# deploy-all.sh - Deploy all services in correct order

ENV=$1
PROJECT_ID=$2

echo "Deploying all services to $ENV..."

# 1. API Service (with bootstrap)
./deploy/deploy.sh api-service $ENV $PROJECT_ID
./bootstrap/bootstrap.sh $ENV  # Verify bootstrap

# 2. Pipeline Service (needs API URL)
./deploy/deploy.sh pipeline-service $ENV $PROJECT_ID

# 3. Frontend (needs both URLs)
./deploy/deploy.sh frontend $ENV $PROJECT_ID

echo "All services deployed successfully!"
```

---

### 🟠 BUG-012: Health Check Passes Too Early
**Severity**: P1 - HIGH
**File**: Both `main.py` files (api-service and pipeline-service)
**Impact**: Traffic routed to service before it's ready

**Problem**:
- Health checks validate connections but NOT schema versions
- Procedure version mismatches not detected
- Bootstrap schema version not validated

**Fix Required**:
```python
# Add procedure version check:
def check_procedure_version(proc_name: str, expected_created_after: datetime):
    query = f"""
    SELECT created_time
    FROM `{project_id}.organizations.INFORMATION_SCHEMA.ROUTINES`
    WHERE routine_name = @proc_name
    """
    results = bq_client.query(query, ...).result()
    if not results or results[0].created_time < expected_created_after:
        return False
    return True
```

---

## Medium Priority Bugs

### 🟡 BUG-006: AUTO_BOOTSTRAP Blocks Startup (60+ Seconds)
**Severity**: P2 - MEDIUM
**File**: `02-api-service/src/app/main.py` (lines 181-250)
**Impact**: Service startup timeout

**Problem**: Bootstrap takes 60+ seconds, Cloud Run start-period only 60s

**Fix Required**:
```dockerfile
# In 02-api-service/Dockerfile, increase start-period:
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1
```

---

### 🟡 BUG-008: No Service Account Validation
**Severity**: P2 - MEDIUM
**File**: `04-inra-cicd-automation/CICD/deploy/deploy.sh` (line 70)
**Impact**: Service runs with wrong permissions

**Fix Required**:
```bash
# Add before deployment:
SA_EXISTS=$(gcloud iam service-accounts list \
    --project=$PROJECT_ID \
    --filter="email:$SA_EMAIL" \
    --format="value(email)")

if [ -z "$SA_EXISTS" ]; then
    echo "ERROR: Service account $SA_EMAIL not found"
    echo "Create it first or update environments.conf"
    exit 1
fi
```

---

## Low Priority Bugs

### 🟢 BUG-007: Missing Stripe Price ID Validation
**Severity**: P3 - LOW
**File**: `04-inra-cicd-automation/CICD/secrets/verify-secrets.sh`
**Impact**: Deployment succeeds but checkout fails

**Fix Required**: Add Stripe price ID checks to verify-secrets.sh

---

### 🟢 BUG-009: Dockerfile PORT Mismatch
**Severity**: P3 - LOW
**File**: Both Dockerfiles
**Impact**: Healthcheck may use wrong port

**Fix Required**:
```dockerfile
# pipeline-service/Dockerfile: Change default from 8080 to 8001
CMD uvicorn src.app.main:app --host 0.0.0.0 --port ${PORT:-8001} --workers 1

# api-service/Dockerfile: Change default from 8080 to 8000
CMD uvicorn src.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
```

---

### 🟢 BUG-010: Missing Build Metadata in Health
**Severity**: P3 - LOW
**Impact**: Cannot verify exact build version

**Fix Required**: Add `build_date` and `git_commit` to health response

---

## Immediate Action Plan

### Phase 1: Critical Fixes (TODAY)

1. **Fix BUG-001**: Add bootstrap dependency check
   ```bash
   cd 04-inra-cicd-automation/CICD
   # Update deploy.sh with bootstrap check
   ```

2. **Fix BUG-004**: Enforce deployment order
   ```bash
   # Add order validation to deploy.sh
   ```

3. **Fix BUG-013**: Update subscription processor signature
   ```bash
   cd 03-data-pipeline-service/src/core/processors/subscription
   # Update cost.py to pass new parameters
   ```

### Phase 2: High Priority (THIS WEEK)

4. **Fix BUG-002**: Make procedure sync failures fatal
5. **Fix BUG-003**: Make procedures critical for readiness
6. **Create deploy-all.sh**: Enforce deployment order

### Phase 3: Medium Priority (THIS SPRINT)

7. **Fix BUG-006**: Increase startup timeout
8. **Fix BUG-008**: Add SA validation
9. **Fix BUG-012**: Enhanced health checks

### Phase 4: Tech Debt (BACKLOG)

10. **Fix BUG-007, 009, 010**: Minor improvements

---

## Testing Plan

### Test 1: Fresh Environment Deployment
```bash
# Delete all Cloud Run services
gcloud run services delete cloudact-api-service-test --project=cloudact-testing-1 --region=us-central1 -q
gcloud run services delete cloudact-pipeline-service-test --project=cloudact-testing-1 --region=us-central1 -q
gcloud run services delete cloudact-frontend-test --project=cloudact-testing-1 --region=us-central1 -q

# Delete organizations dataset
bq rm -r -f cloudact-testing-1:organizations

# Deploy in correct order
./deploy-all.sh test cloudact-testing-1

# Verify:
# - Bootstrap completes before pipeline-service marks ready
# - All services healthy
# - Can create org and run pipeline
```

### Test 2: Wrong Order Deployment
```bash
# Try deploying pipeline-service before api-service
./deploy/deploy.sh pipeline-service test cloudact-testing-1

# Expected: FAIL with error "api-service must be deployed first"
```

### Test 3: Procedure Sync Failure
```bash
# Corrupt a procedure SQL file
echo "INVALID SQL" > configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql

# Deploy pipeline-service
./deploy/deploy.sh pipeline-service test cloudact-testing-1

# Expected: Service fails to start (not logs warning and continues)
```

---

## Files Requiring Changes

### Priority 1 (Critical)
- [ ] `04-inra-cicd-automation/CICD/deploy/deploy.sh` - Add bootstrap + order checks
- [ ] `03-data-pipeline-service/src/core/processors/subscription/cost.py` - Update procedure call

### Priority 2 (High)
- [ ] `03-data-pipeline-service/src/app/main.py` - Make procedures critical
- [ ] `04-inra-cicd-automation/CICD/deploy/deploy-all.sh` - NEW FILE

### Priority 3 (Medium)
- [ ] `02-api-service/Dockerfile` - Increase start-period
- [ ] `03-data-pipeline-service/Dockerfile` - Increase start-period

### Priority 4 (Low)
- [ ] `04-inra-cicd-automation/CICD/secrets/verify-secrets.sh` - Add Stripe checks
- [ ] Both Dockerfiles - Fix PORT defaults

---

## Deployment Checklist (Updated)

Before deploying to ANY environment:

### Pre-Deployment Validation
- [ ] Run `./secrets/verify-secrets.sh $ENV`
- [ ] Verify bootstrap has run: `bq ls ${PROJECT_ID}:organizations`
- [ ] Verify service account exists
- [ ] Verify deployment order: api → pipeline → frontend

### Deployment
- [ ] Use `./deploy-all.sh` (NOT individual deploy.sh calls)
- [ ] Monitor bootstrap completion (60+ seconds)
- [ ] Verify health checks after each service

### Post-Deployment
- [ ] Check `/health` on all services
- [ ] Verify procedure sync: `curl https://api.../api/v1/procedures`
- [ ] Test pipeline execution
- [ ] Monitor logs for 15 minutes

---

## Rollback Plan

If deployment fails:

1. **Immediate rollback**:
   ```bash
   # Rollback to previous version
   ./release.sh v{previous} --deploy --env $ENV
   ```

2. **Recover from bootstrap failure**:
   ```bash
   # Delete corrupted dataset
   bq rm -r -f ${PROJECT_ID}:organizations

   # Re-run bootstrap
   ./bootstrap/bootstrap.sh $ENV
   ```

3. **Recover from procedure sync failure**:
   ```bash
   # Manually sync procedures
   curl -X POST https://pipeline.../api/v1/procedures/sync \
     -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
   ```

---

**Report Generated**: 2026-01-08
**Environment**: All (test, stage, prod)
**Status**: ACTION REQUIRED
**Next Review**: After Phase 1 fixes applied
