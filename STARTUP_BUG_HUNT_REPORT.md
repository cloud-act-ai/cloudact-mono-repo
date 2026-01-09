# Startup Bug Hunt Report
**Date:** 2026-01-09
**Scope:** All services (API, Pipeline, Frontend) startup check

---

## Executive Summary

Performed comprehensive bug hunt on all service startup processes. Found **3 critical issues** and **2 warnings** that need immediate attention.

**Status:** ⚠️ CRITICAL ISSUES FOUND

---

## Critical Issues

### 1. ❌ CRITICAL: Pipeline Service - Missing `created_at` Field in BigQuery Query

**Severity:** CRITICAL
**Service:** Pipeline Service (Port 8001)
**File:** `03-data-pipeline-service/src/app/routers/pipelines.py:639`
**Error:**
```
google.api_core.exceptions.BadRequest: 400 Required field created_at cannot be null

Location: US
Job ID: d8a73412-1594-45bf-bb52-05e224ba1e61
```

**Context:**
- Occurs when running subscription cost pipeline: `/api/v1/pipelines/run/acme_inc_01082026/subscription/costs/subscription_cost`
- BigQuery query attempting to insert/update data with NULL `created_at` field
- Causes pipeline execution to fail with 400 error
- API service experiences timeout (504) waiting for pipeline response

**Impact:**
- ❌ Subscription cost pipeline completely broken
- ❌ Cannot calculate daily subscription costs
- ❌ Blocks subscription cost reporting

**Root Cause:**
The stored procedure or INSERT query for `subscription_plan_costs_daily` is not providing a value for the `created_at` field, which is likely a REQUIRED field in the schema.

**Fix Required:**
1. Check `subscription_plan_costs_daily` table schema
2. Verify stored procedure `sp_subscription_2_calculate_daily_costs` includes `created_at`
3. Update INSERT/MERGE statement to include:
   ```sql
   CURRENT_TIMESTAMP() AS created_at
   ```

---

### 2. ❌ CRITICAL: API Service - Pipeline Service Timeout After Retries

**Severity:** CRITICAL
**Service:** API Service (Port 8000)
**File:** `02-api-service/src/app/routers/pipelines_proxy.py`
**Error:**
```
ERROR: Pipeline service timeout after retries
request_id: 7ad89797-caf3-4b52-82f5-a37133c4cdb7
status_code: 504
duration_ms: 184458.5 (3+ minutes)
```

**Context:**
- API service proxies pipeline trigger requests to Pipeline service
- Pipeline service takes too long to respond (>3 minutes)
- Multiple retry attempts (1s, 2s delays) all fail
- Returns 504 Gateway Timeout to frontend

**Impact:**
- ❌ Frontend cannot trigger pipelines
- ❌ Users see timeout errors
- ❌ Poor user experience

**Root Cause:**
- Related to Issue #1 - Pipeline service crashes during execution
- Timeout configured too short for complex pipelines
- No proper error handling for pipeline failures

**Fix Required:**
1. Fix underlying pipeline failure (Issue #1 above)
2. Increase timeout threshold for complex pipelines
3. Add better error messaging to frontend
4. Implement async pipeline execution with status polling

---

### 3. ⚠️ WARNING: Auth Metrics - Invalid UUID Batch Skipping

**Severity:** WARNING (repeated occurrence)
**Service:** API Service (Port 8000)
**File:** `02-api-service/src/app/dependencies/auth.py`
**Warning:**
```
WARNING: No valid UUIDs in auth metrics batch - skipping flush
Occurs every 60 seconds (auth metrics flush interval)
```

**Context:**
- Auth metrics aggregator flushes every 60 seconds
- Batch contains entries with invalid/missing UUIDs
- Data is silently dropped instead of being recorded

**Impact:**
- ⚠️ Auth metrics data loss
- ⚠️ Cannot track authentication patterns accurately
- ⚠️ Audit trail gaps

**Root Cause:**
- Auth metrics are being collected without valid org_api_key_id UUIDs
- Validation rejects entire batch instead of filtering invalid entries
- Likely issue with API key lookup or UUID format

**Fix Required:**
1. Check why `org_api_key_id` is not a valid UUID
2. Update validation to filter invalid entries instead of dropping entire batch
3. Add logging for which entries are being dropped and why
4. Ensure API key fingerprints are stored as proper UUIDs

---

## Warnings

### 4. ⚠️ INFO: Pipeline Service Auto-Reloads During Runtime

**Severity:** INFO
**Service:** Pipeline Service (Port 8001)
**Message:**
```
WARNING: WatchFiles detected changes in 'tests/test_hierarchy_validation.py'. Reloading...
```

**Context:**
- Hot reload enabled in development mode
- Service restarts when test files change
- Interrupts running pipelines

**Impact:**
- ⚠️ Pipelines interrupted mid-execution
- ⚠️ Development instability

**Recommendation:**
- Expected in development mode
- Consider disabling hot reload for test files
- Production deployments won't have this issue

---

## Service Health Summary

| Service | Port | Status | Critical Issues | Warnings |
|---------|------|--------|----------------|----------|
| **Frontend** | 3000 | ✅ HEALTHY | 0 | 0 |
| **API Service** | 8000 | ⚠️ DEGRADED | 1 (timeout) | 1 (auth metrics) |
| **Pipeline Service** | 8001 | ❌ BROKEN | 1 (created_at) | 1 (auto-reload) |

---

## Environment Check

### API Service (.env.local)
- ✅ GCP_PROJECT_ID configured
- ✅ BigQuery location set
- ✅ Credentials path valid
- ✅ CA_ROOT_API_KEY configured
- ✅ KMS configuration valid

### Pipeline Service (.env.local)
- ✅ GCP_PROJECT_ID configured
- ✅ BigQuery location set
- ✅ Credentials path valid
- ✅ CA_ROOT_API_KEY configured
- ✅ KMS configuration valid
- ✅ AUTO_SYNC_PROCEDURES enabled

### Frontend (.env.local)
- ✅ Supabase URL configured
- ✅ Supabase keys configured
- ✅ Stripe keys configured
- ✅ API/Pipeline service URLs correct
- ✅ Auto-migrations working

---

## Startup Sequence Analysis

### Successful Steps ✅

1. **Docker cleanup** - No containers running
2. **Process cleanup** - All ports freed
3. **Cache cleanup** - .next and __pycache__ cleared
4. **API Service startup** - Clean start, no errors
5. **Pipeline Service startup** - Clean start, procedures synced
6. **Frontend startup** - Migrations checked, Next.js ready
7. **Health endpoints** - All responding 200/healthy
8. **Authentication** - Working correctly
9. **BigQuery connection** - Pooling initialized
10. **KMS validation** - Keys accessible

### Failed Steps ❌

1. **Pipeline execution** - Fails on subscription cost pipeline
2. **Auth metrics flush** - Invalid UUID batch

---

## Priority Fixes

### P0 - IMMEDIATE (Blocking Production)

1. **Fix `created_at` NULL error in subscription pipeline**
   - File: Stored procedure `sp_subscription_2_calculate_daily_costs`
   - Add: `CURRENT_TIMESTAMP() AS created_at` to INSERT
   - Test: Run subscription cost pipeline

2. **Fix auth metrics UUID validation**
   - File: `02-api-service/src/app/dependencies/auth.py`
   - Update: Filter invalid entries instead of dropping batch
   - Add: Better logging for dropped entries

### P1 - HIGH (User Experience)

3. **Increase pipeline timeout threshold**
   - File: `02-api-service/src/app/routers/pipelines_proxy.py`
   - Current: ~3 minutes total (with retries)
   - Recommended: 5-10 minutes for complex pipelines
   - Add: Progress polling instead of synchronous wait

### P2 - MEDIUM (Nice to Have)

4. **Disable hot reload for test files**
   - File: `03-data-pipeline-service/uvicorn` startup config
   - Add: `--reload-exclude "tests/*"` flag

---

## Testing Performed

- ✅ Service startup logs analyzed (100 lines each)
- ✅ Error patterns identified
- ✅ Health endpoints verified
- ✅ Environment configuration checked
- ✅ Auto-migration functionality validated
- ✅ Authentication flow tested

---

## Recommendations

1. **Immediate Action Required:**
   - Fix created_at NULL error (blocks core functionality)
   - Fix auth metrics UUID validation (data integrity)

2. **Short Term:**
   - Implement async pipeline execution with status polling
   - Add comprehensive error messages to frontend
   - Create monitoring for auth metrics flush failures

3. **Long Term:**
   - Add integration tests for pipeline execution
   - Implement pipeline execution queue with retry logic
   - Add BigQuery schema validation before pipeline runs

---

## Files Requiring Changes

### Critical Priority

1. `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
   - Add `created_at` field to INSERT/MERGE

2. `02-api-service/src/app/dependencies/auth.py`
   - Fix UUID validation in auth metrics flush

### High Priority

3. `02-api-service/src/app/routers/pipelines_proxy.py`
   - Increase timeout threshold
   - Add async execution

---

## Next Steps

1. ✅ Create this bug report
2. ⏭️ Fix critical Issue #1 (created_at NULL)
3. ⏭️ Fix critical Issue #3 (auth metrics UUID)
4. ⏭️ Test subscription pipeline end-to-end
5. ⏭️ Deploy fixes and verify

---

**Report Generated:** 2026-01-09 05:25:00 UTC
**Environment:** Local Development (cloudact-testing-1)
**Analyst:** Automated Bug Hunt
