# Performance Test Suite - Implementation Summary

## Overview

Comprehensive performance test suite created for CloudAct API Service to verify query timeouts, connection pool behavior, and query latencies using **REAL BigQuery** (no mocks).

**Created:** 2025-12-06
**Location:** `/api-service/tests/performance/`
**Total Lines:** 2,263 lines of test code

## Files Created

### 1. conftest.py (329 lines)
**Purpose:** Shared fixtures and utilities for performance testing

**Key Features:**
- `perf_client` - FastAPI test client with real BigQuery
- `bq_client_perf` - Real BigQuery client instance
- `timer` - Context manager for timing operations
- `latency_reporter` - Formatted performance reports
- `calculate_percentiles()` - Calculate p50, p95, p99 from timings
- `slow_query_generator` - Generate intentionally slow queries for timeout testing
- `connection_monitor` - Monitor connection pool usage
- `ensure_cleanup` - Cleanup helper for finally blocks

**Utilities:**
- Timer context manager with ms precision
- Percentile calculation (p50, p95, p99)
- Performance report formatting
- Slow query generators (user: 5s, auth: 12s, batch: 5+ min)
- Connection pool monitoring

### 2. test_query_timeouts.py (361 lines)
**Purpose:** Verify BigQuery query timeout enforcement

**Tests Implemented:**

| Test | Timeout | Description | Expected Result |
|------|---------|-------------|-----------------|
| `test_user_query_timeout_30s` | 30s | User queries timeout at 30s | Timeout between 29-35s |
| `test_batch_query_timeout_300s` | 300s | Batch queries timeout at 5 min | Timeout between 295-310s (skipped) |
| `test_auth_query_timeout_10s` | 10s | Auth queries timeout at 10s | Timeout between 9-12s |
| `test_fast_query_completes_before_timeout` | N/A | Fast queries complete successfully | Complete in < 5s |
| `test_query_timeout_configuration` | N/A | Verify timeout settings exist | Valid configuration |
| `test_connection_timeout_separate_from_query_timeout` | N/A | Connection vs query timeout | Connection < 10s |

**Key Features:**
- Uses intentionally slow queries (GENERATE_ARRAY + CROSS JOIN)
- Verifies timeout occurs at expected time
- Tests fast queries complete before timeout
- Validates timeout configuration
- No mocks - uses real BigQuery

**Performance Targets:**
- User queries: 30s timeout (interactive)
- Batch queries: 300s timeout (ETL operations)
- Auth queries: 10s timeout (fast fail)

### 3. test_connection_pool.py (483 lines)
**Purpose:** Verify BigQuery connection pool management

**Tests Implemented:**

| Test | Load | Description | Expected Result |
|------|------|-------------|-----------------|
| `test_connection_pool_limits` | 10 queries | Verify pool configuration | Max 500 connections |
| `test_no_connection_leaks` | 1000 requests | Leak detection over sustained load | >95% success rate |
| `test_concurrent_connections` | 100 concurrent | Concurrent connection management | All connections released |
| `test_connection_pool_configuration` | N/A | Verify pool settings | Correct configuration |
| `test_connection_cleanup_in_finally_blocks` | 20 queries | Error handling cleanup | No leaks on errors |
| `test_connection_pool_under_heavy_load` | 200 concurrent | Heavy load behavior | >95% success rate |

**Key Features:**
- Tests connection pool with real BigQuery
- Verifies no leaks after 1000+ requests
- Tests concurrent connection handling (100-200 simultaneous)
- Verifies cleanup on errors (finally blocks)
- Measures throughput and latency under load

**Performance Targets:**
- Max connections: 500
- No leaks after 1000+ requests
- Success rate: >95% under load
- Stable latency across sustained load

### 4. test_query_benchmarks.py (548 lines)
**Purpose:** Measure p50, p95, p99 latencies for key endpoints

**Tests Implemented:**

| Test | Endpoint | Cache | p95 Target | p99 Target |
|------|----------|-------|------------|------------|
| `test_query_latency_list_providers` | GET /subscriptions/{org}/providers | Hit | 200ms | 300ms |
| `test_query_latency_list_plans` | GET /subscriptions/{org}/providers/{provider}/plans | Hit | 300ms | 400ms |
| `test_query_latency_get_quota` | GET /organizations/{org}/quota | N/A | 100ms | 150ms |
| `test_query_latency_all_plans` | GET /subscriptions/{org}/all-plans | Hit | 400ms | 600ms |
| `test_query_latency_organization_onboarding` | POST /organizations/onboard | N/A | 3000ms | 5000ms |
| `test_cache_performance_impact` | Various | Both | 2x speedup | - |

**Key Features:**
- Measures p50, p95, p99 latencies
- Tests both cache hit and cache miss scenarios
- 100 requests per endpoint for statistical significance
- Formatted performance reports
- Verifies cache provides speedup

**Performance Targets:**
- Quota endpoint: p95 < 100ms (critical for UX)
- List providers (cached): p95 < 200ms
- List plans (cached): p95 < 300ms
- All plans (cached): p95 < 400ms
- Onboarding: p95 < 3000ms (heavyweight operation)
- Cache speedup: 2x or better

### 5. README.md (9.4 KB)
**Purpose:** Comprehensive documentation for performance tests

**Contents:**
- Overview of all test files
- Running instructions
- Performance targets
- Interpreting results
- Troubleshooting guide
- Cleanup procedures
- Advanced usage examples

## Test Coverage Summary

### Query Timeouts
- ✅ User query timeout (30s)
- ✅ Batch query timeout (300s) - skipped by default
- ✅ Auth query timeout (10s)
- ✅ Fast query completion
- ✅ Timeout configuration validation
- ✅ Connection vs query timeout separation

**Total: 6 tests**

### Connection Pool
- ✅ Pool limits enforcement
- ✅ Connection leak detection (1000 requests)
- ✅ Concurrent connection handling (100)
- ✅ Pool configuration validation
- ✅ Error cleanup (finally blocks)
- ✅ Heavy load handling (200 concurrent)

**Total: 6 tests**

### Query Benchmarks
- ✅ List providers latency (cached + uncached)
- ✅ List plans latency (cached + uncached)
- ✅ Get quota latency
- ✅ All plans latency (cached + uncached)
- ✅ Organization onboarding latency
- ✅ Cache performance impact

**Total: 6 tests**

### Existing Benchmarks (test_benchmarks.py)
- ✅ Health check performance
- ✅ Get integrations (cached)
- ✅ Organization onboarding
- ✅ Concurrent throughput
- ✅ Cache impact
- ✅ API key validation
- ✅ Memory usage
- ✅ Integration setup

**Total: 8 tests**

## Grand Total: 26 Performance Tests

## Running the Tests

### All Performance Tests
```bash
cd api-service
pytest -m performance --run-integration tests/performance/ -v
```

### Specific Test Files
```bash
# Query timeouts
pytest -m performance --run-integration tests/performance/test_query_timeouts.py -v

# Connection pool
pytest -m performance --run-integration tests/performance/test_connection_pool.py -v

# Query benchmarks
pytest -m performance --run-integration tests/performance/test_query_benchmarks.py -v
```

### Individual Tests
```bash
# Test user query timeout
pytest -m performance --run-integration tests/performance/test_query_timeouts.py::test_user_query_timeout_30s -v

# Test connection leaks
pytest -m performance --run-integration tests/performance/test_connection_pool.py::test_no_connection_leaks -v

# Benchmark quota endpoint
pytest -m performance --run-integration tests/performance/test_query_benchmarks.py::test_query_latency_get_quota -v
```

## Prerequisites

### Environment Variables
```bash
export GCP_PROJECT_ID="gac-prod-471220"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export CA_ROOT_API_KEY="your-admin-key"
export ENVIRONMENT="development"
```

### Requirements
- Real BigQuery connection
- Valid GCP credentials
- Bootstrap already run (15 meta tables)
- At least 1 test organization onboarded

## Performance Targets

### Query Latencies

| Endpoint | Type | p50 | p95 | p99 |
|----------|------|-----|-----|-----|
| GET /organizations/{org}/quota | Lightweight | < 30ms | < 100ms | < 150ms |
| GET /subscriptions/{org}/providers | Medium (cached) | < 50ms | < 200ms | < 300ms |
| GET /subscriptions/{org}/providers/{provider}/plans | Medium (cached) | < 100ms | < 300ms | < 400ms |
| GET /subscriptions/{org}/all-plans | Heavy (cached) | < 150ms | < 400ms | < 600ms |
| POST /organizations/onboard | Very heavy | < 1000ms | < 3000ms | < 5000ms |

### Connection Pool

| Metric | Target | Description |
|--------|--------|-------------|
| Max connections | 500 | HTTP connection pool size |
| Connection timeout | 60s | Time to establish connection |
| Read timeout | 300s | Time to read response |
| Leak tolerance | 0 | No leaks after 1000+ requests |
| Concurrent handling | 100+ | Simultaneous connections |

### Query Timeouts

| Query Type | Timeout | Use Case |
|------------|---------|----------|
| User queries | 30s | Interactive web requests |
| Batch queries | 300s | ETL and pipeline operations |
| Auth queries | 10s | API key validation (fast fail) |
| Connection timeout | 60s | Separate from query timeout |

## Expected Test Results

### Success Criteria

**Query Timeouts:**
- ✅ User queries timeout at ~30s (±5s)
- ✅ Auth queries timeout at ~10s (±2s)
- ✅ Fast queries complete in < 5s

**Connection Pool:**
- ✅ No leaks after 1000 requests (>95% success rate)
- ✅ All concurrent connections released
- ✅ Stable performance under heavy load (>95% success)

**Query Benchmarks:**
- ✅ All endpoints meet p95 targets
- ✅ Cache provides 2x+ speedup
- ✅ Quota endpoint very fast (< 100ms p95)

### Performance Report Example

```
================================================================================
Performance Report: GET /organizations/{org}/quota
================================================================================
Requests:       100
Min:            12.34ms
p50:            45.67ms
p95:            89.12ms
p95 target:     100.00ms ✓ PASS
p99:            123.45ms
Max:            234.56ms
Mean:           56.78ms ± 23.45ms
================================================================================
```

## Test Design Principles

1. **Real BigQuery Only** - No mocks, tests measure actual performance
2. **Statistical Significance** - 100+ requests for reliable percentiles
3. **Cleanup in Finally Blocks** - Ensure resources are released
4. **Clear Performance Targets** - Each test has explicit p95/p99 targets
5. **Cache Testing** - Both cache hit and miss scenarios
6. **Load Testing** - Verify behavior under concurrent load
7. **Error Handling** - Test cleanup on failures

## Known Issues

### Batch Timeout Test (Skipped)
The `test_batch_query_timeout_300s` test takes 5+ minutes to run and is skipped by default. Enable manually if needed:

```bash
pytest -k test_batch_query_timeout_300s --run-integration -v
```

### BigQuery Query Caching
BigQuery may cache query results, which can make slow queries complete faster than expected. Workaround:
- Use different array sizes in slow queries
- Add random elements to queries
- Clear BigQuery cache between runs

### Test Org Cleanup
Tests create temporary organizations but don't auto-delete them. Manual cleanup required:

```bash
bq ls --project_id=gac-prod-471220 | grep test_org
bq rm -r -f -d gac-prod-471220:test_org_*_prod
```

## Integration with CI/CD

Add to GitHub Actions workflow:

```yaml
performance_tests:
  runs-on: ubuntu-latest
  steps:
    - name: Set up environment
      run: |
        echo "${{ secrets.GCP_SA_KEY }}" > sa-key.json
        export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/sa-key.json
        export GCP_PROJECT_ID="gac-prod-471220"
        export CA_ROOT_API_KEY="${{ secrets.CA_ROOT_API_KEY }}"

    - name: Run performance tests
      run: |
        cd api-service
        pytest -m performance --run-integration tests/performance/ -v \
          --junitxml=performance-results.xml

    - name: Upload results
      uses: actions/upload-artifact@v2
      with:
        name: performance-results
        path: api-service/performance-results.xml
```

## Maintenance

### Adding New Performance Tests

1. Create test in appropriate file:
   - `test_query_timeouts.py` - For timeout-related tests
   - `test_connection_pool.py` - For connection management tests
   - `test_query_benchmarks.py` - For latency benchmarks

2. Use shared fixtures from `conftest.py`:
   ```python
   @pytest.mark.asyncio
   async def test_new_endpoint(perf_client, latency_reporter):
       # Test code here
       pass
   ```

3. Follow existing patterns:
   - Measure p50, p95, p99
   - Set explicit targets
   - Test cache hit/miss
   - Include cleanup

4. Update README.md with new test details

### Updating Performance Targets

Edit target values in test assertions:

```python
# Before
assert stats["p95"] < 200, f"p95 too slow: {stats['p95']:.2f}ms"

# After
assert stats["p95"] < 150, f"p95 too slow: {stats['p95']:.2f}ms"
```

## References

- BigQuery Best Practices: https://cloud.google.com/bigquery/docs/best-practices-performance-overview
- Connection Pooling: https://cloud.google.com/python/docs/reference/bigquery/latest
- pytest Documentation: https://docs.pytest.org/

---

## Summary

**Created:** 4 new test files + 1 README + 1 summary
**Total Tests:** 26 performance tests
**Total Lines:** 2,263 lines of test code
**Coverage:**
- ✅ Query timeouts (6 tests)
- ✅ Connection pool (6 tests)
- ✅ Query benchmarks (6 tests)
- ✅ General benchmarks (8 tests)

**All tests use REAL BigQuery** - No mocks allowed for accurate performance measurement.

**Ready to run:** `pytest -m performance --run-integration tests/performance/ -v`

---

**Last Updated:** 2025-12-06
