# Performance Analysis - CloudAct API Service
**Date:** December 6, 2025
**Scope:** BigQuery Optimization Issues (Phase 2)
**Status:** ✅ 2/4 Fixed | ⚠️ 2/4 Need Attention

---

## Executive Summary

Analysis of 14 Python files with BigQuery operations reveals:
- **2/4 issues already optimized** (SELECT *, MAX_LIMIT)
- **2/4 issues need fixing** (query timeouts, connection cleanup)
- **Overall code quality: GOOD** - Most queries use parameterization and monitoring

---

## Issues Analysis

### ✅ Issue #7: SELECT * Queries - ALREADY FIXED
**Status:** ✅ OPTIMIZED
**File:** `src/app/routers/subscription_plans.py:743`

**Evidence:**
```python
# Optimized query: Select only needed columns instead of SELECT *
query = f"""
SELECT
    subscription_id, provider, plan_name, display_name, is_custom,
    pricing_tier, monthly_price, annual_price, is_enabled, category,
    description, features, created_at, updated_at
FROM `{table_ref}`
```

**Findings:**
- All queries use explicit column lists
- No `SELECT *` found except in `COUNT(*)` aggregates (which is correct)
- Performance impact: NONE (already optimized)

---

### ✅ Issue #8: MAX_LIMIT Too High - ALREADY FIXED
**Status:** ✅ OPTIMIZED
**File:** `src/app/routers/llm_data.py:148`

**Evidence:**
```python
MAX_LIMIT = 500
if limit < 0 or limit > MAX_LIMIT:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Limit must be between 0 and {MAX_LIMIT}"
    )
```

**Findings:**
- MAX_LIMIT already set to 500 (not 10000 as plan suggested)
- Applied consistently across all endpoints
- Performance impact: NONE (already optimized)

---

### ⚠️ Issue #10: Missing Query Timeouts - NEEDS FIX
**Status:** ⚠️ HIGH PRIORITY
**Risk:** Queries can run indefinitely, consuming quota
**Files Affected:** 14 files with BigQuery queries

**Current State:**
```python
# No timeout configured
result = bq_client.client.query(query).result()
```

**Required Fix:**
```python
from google.cloud import bigquery

# User-facing queries (30s timeout)
job_config = bigquery.QueryJobConfig(
    query_parameters=[...],
    timeout_ms=30000  # 30 seconds
)
result = bq_client.client.query(query, job_config=job_config).result()

# Batch operations (300s timeout)
job_config = bigquery.QueryJobConfig(
    timeout_ms=300000  # 5 minutes
)
```

**Files to Update:**
1. `src/app/routers/llm_data.py` - User queries (30s)
2. `src/app/routers/organizations.py` - User queries (30s)
3. `src/app/routers/subscription_plans.py` - User queries (30s)
4. `src/app/routers/quota.py` - User queries (30s)
5. `src/app/routers/pipeline_validator.py` - User queries (30s)
6. `src/app/routers/integrations.py` - User queries (30s)
7. `src/app/routers/pipeline_logs.py` - User queries (30s)
8. `src/app/routers/openai_data.py` - User queries (30s)
9. `src/core/processors/integrations/kms_store.py` - Integration ops (60s)
10. `src/core/processors/integrations/kms_decrypt.py` - Integration ops (60s)
11. `src/core/processors/setup/organizations/onboarding.py` - Admin ops (300s)
12. `src/core/utils/audit_logger.py` - Logging ops (60s)
13. `src/app/dependencies/auth.py` - Auth ops (10s)
14. `src/core/engine/bq_client.py` - Client initialization

**Estimated Impact:**
- Prevents runaway queries
- Enforces quota limits
- Improves error handling
- Better user experience (faster failures)

---

### ⚠️ Issue #14: Missing Connection Cleanup - NEEDS VERIFICATION
**Status:** ⚠️ MEDIUM PRIORITY
**Risk:** Connection leaks over time
**Files Affected:** All processors

**Current Pattern:**
```python
def get_bigquery_client():
    return BigQueryClient()

# Used in routers
bq_client: BigQueryClient = Depends(get_bigquery_client)
```

**Verification Needed:**
1. Check if BigQueryClient has `__enter__` and `__exit__` methods
2. Verify FastAPI dependency cleanup
3. Test connection pool behavior under load

**Recommended Fix (if needed):**
```python
# In processors
bq_client = None
try:
    bq_client = BigQueryClient()
    result = bq_client.query(...)
finally:
    if bq_client:
        bq_client.close()
```

---

## Performance Best Practices Found

### ✅ Good Patterns Already in Use

**1. QueryPerformanceMonitor**
```python
from src.core.utils.query_performance import QueryPerformanceMonitor

with QueryPerformanceMonitor(operation="list_providers_query") as monitor:
    result = bq_client.client.query(query).result()
    monitor.set_result(result)
```

**2. Parameterized Queries**
```python
job_config = bigquery.QueryJobConfig(
    query_parameters=[
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        bigquery.ScalarQueryParameter("provider", "STRING", provider),
    ]
)
result = bq_client.client.query(query, job_config=job_config).result()
```

**3. LRU Cache with TTL**
```python
from src.core.utils.cache import cache

cache_key = f"{org_slug}:providers_list"
cached = cache.get(cache_key)
if cached:
    return cached

# ... execute query ...

cache.set(cache_key, response, ttl_seconds=300)
```

**4. Explicit Limits**
```python
LIMIT {min(limit, MAX_LIMIT)}
```

---

## Recommendations

### Immediate Actions (Week 2 - HIGH)

**1. Add Query Timeouts** ⚠️ HIGH PRIORITY
- Create `QueryTimeoutConfig` utility class
- Set 30s for user queries, 300s for batch
- Update all 14 files with BigQuery queries
- Test with slow query simulation

**2. Verify Connection Cleanup** ⚠️ MEDIUM PRIORITY
- Audit BigQueryClient lifecycle
- Add explicit cleanup in processors
- Test under load (1000 requests)

**3. Create Performance Test Suite**
- Query latency benchmarks (p50, p95, p99)
- Timeout enforcement tests
- Connection leak detection tests
- Load testing with 1000 concurrent requests

### Future Optimizations (Week 3-4 - MEDIUM)

**4. BigQuery Table Optimization**
- Add clustering on `org_slug` (15 tables)
- Add partitioning on date columns
- Migrate existing tables with ALTER TABLE (no downtime)

**5. N+1 Query Pattern Analysis**
- Audit bulk operations in `llm_data.py`
- Replace loops with MERGE statements
- Benchmark before/after

**6. Query Result Caching**
- Cache frequently accessed queries (pricing, subscriptions)
- Implement cache warming on startup
- Target >80% cache hit rate

---

## Files Analyzed

| File | Queries | Timeouts | Cleanup | SELECT * | Status |
|------|---------|----------|---------|----------|--------|
| `llm_data.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `organizations.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `subscription_plans.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `quota.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `pipeline_validator.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `integrations.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `pipeline_logs.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `openai_data.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `kms_store.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `kms_decrypt.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `onboarding.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `audit_logger.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `auth.py` | ✓ | ⨯ | ? | ✓ | Needs timeouts |
| `bq_client.py` | ✓ | ⨯ | ? | ✓ | Needs review |

**Legend:**
- ✓ = Implemented correctly
- ⨯ = Not implemented
- ? = Needs verification

---

## Testing Plan

### Performance Regression Tests

```python
# tests/performance/test_query_timeouts.py
@pytest.mark.performance
async def test_query_timeout_enforced():
    """Verify queries timeout after 30s."""
    # Create slow query (sleep 35s)
    # Verify TimeoutError raised
    # Verify query cancelled in BigQuery
    pass

@pytest.mark.performance
async def test_connection_pool_limits():
    """Verify connection pool limits enforced."""
    # Create 100 concurrent connections
    # Verify max 50 active connections
    # Verify connections released after use
    pass

@pytest.mark.performance
async def test_query_performance_benchmarks():
    """Benchmark query performance."""
    # List providers: p95 < 200ms
    # List plans: p95 < 300ms
    # Get quota: p95 < 100ms
    pass
```

### Load Testing

```bash
# Run 1000 concurrent requests
pytest tests/performance/test_load.py -n 50 -v

# Expected results:
# - All queries complete within timeout
# - No connection leaks
# - p95 latency < 500ms
```

---

## Success Criteria

✅ **Query Timeouts:**
- All user queries timeout at 30s
- All batch operations timeout at 300s
- Timeout errors return 504 Gateway Timeout

✅ **Connection Cleanup:**
- Zero connection leaks after 1000 requests
- Connection pool size stable under load
- Proper cleanup in all error scenarios

✅ **Performance Benchmarks:**
- Query p95 latency < 500ms
- API p95 latency < 200ms
- Cache hit rate > 80%

---

## Next Steps

1. **Immediate:** Add query timeouts to all 14 files ⚠️
2. **Short-term:** Verify connection cleanup and fix if needed
3. **Medium-term:** Create performance test suite
4. **Long-term:** BigQuery table optimization (clustering/partitioning)

---

**Generated:** 2025-12-06
**Analyzed Files:** 14
**Issues Found:** 2/4 need fixing
**Estimated Effort:** 8-16 hours (timeouts) + 4-8 hours (testing)
