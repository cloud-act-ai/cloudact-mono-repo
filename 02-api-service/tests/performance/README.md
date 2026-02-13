# Performance Test Suite

Comprehensive performance tests for CloudAct API Service measuring query timeouts, connection pool behavior, and query latencies.

## Overview

All performance tests use **REAL BigQuery** (no mocks) to measure actual performance characteristics. Tests verify:

1. **Query Timeouts** - Timeout enforcement for different query types
2. **Connection Pool** - Connection management and leak detection
3. **Query Benchmarks** - Latency measurements (p50, p95, p99)

## Test Files

### 1. test_query_timeouts.py

Tests that BigQuery queries respect timeout configurations:

| Test | Timeout | Description |
|------|---------|-------------|
| `test_user_query_timeout_30s` | 30s | User queries timeout at 30 seconds |
| `test_batch_query_timeout_300s` | 300s | Batch queries timeout at 5 minutes |
| `test_auth_query_timeout_10s` | 10s | Auth queries timeout at 10 seconds |
| `test_fast_query_completes_before_timeout` | N/A | Fast queries complete successfully |

**Expected Results:**
- User queries: timeout between 29-35 seconds
- Batch queries: timeout between 295-310 seconds (skipped by default - 5+ min runtime)
- Auth queries: timeout between 9-12 seconds
- Fast queries: complete in < 5 seconds

### 2. test_connection_pool.py

Tests BigQuery connection pooling behavior:

| Test | Description | Expected |
|------|-------------|----------|
| `test_connection_pool_limits` | Verify pool configuration | Max 500 connections configured |
| `test_no_connection_leaks` | 1000 requests leak detection | >95% success rate, stable performance |
| `test_concurrent_connections` | 100 concurrent requests | All connections released |
| `test_connection_cleanup_in_finally_blocks` | Error handling cleanup | Connections cleaned up even on errors |
| `test_connection_pool_under_heavy_load` | 200 concurrent queries | >95% success rate |

**Expected Results:**
- No connection leaks after sustained load
- All concurrent connections properly managed
- Stable performance across 1000+ requests

### 3. test_query_benchmarks.py

Measures p50, p95, p99 latencies for key endpoints:

| Endpoint | Cache | p95 Target | p99 Target |
|----------|-------|------------|------------|
| `GET /subscriptions/{org}/providers` | Hit | < 200ms | < 300ms |
| `GET /subscriptions/{org}/providers` | Miss | < 500ms | < 600ms |
| `GET /subscriptions/{org}/providers/{provider}/plans` | Hit | < 300ms | < 400ms |
| `GET /subscriptions/{org}/providers/{provider}/plans` | Miss | < 600ms | < 800ms |
| `GET /organizations/{org}/quota` | N/A | < 100ms | < 150ms |
| `GET /subscriptions/{org}/all-plans` | Hit | < 400ms | < 600ms |
| `POST /organizations/onboard` | N/A | < 3000ms | < 5000ms |

**Expected Results:**
- Cached responses: significantly faster than uncached
- Quota endpoint: very fast (< 100ms p95) for good UX
- Onboarding: slower but acceptable (< 3s p95)

### 4. conftest.py

Shared fixtures and utilities:

- `perf_client` - FastAPI test client with real BigQuery
- `bq_client_perf` - Real BigQuery client for performance tests
- `timer` - Context manager for timing operations
- `latency_reporter` - Print formatted performance reports
- `calculate_percentiles()` - Calculate p50, p95, p99 from timings
- `slow_query_generator` - Generate intentionally slow queries for timeout testing

## Running Tests

### All Performance Tests

```bash
cd api-service
pytest -m performance --run-integration tests/performance/ -v
```

### Specific Test File

```bash
# Query timeouts
pytest -m performance --run-integration tests/performance/test_query_timeouts.py -v

# Connection pool
pytest -m performance --run-integration tests/performance/test_connection_pool.py -v

# Query benchmarks
pytest -m performance --run-integration tests/performance/test_query_benchmarks.py -v
```

### Specific Test

```bash
# Test user query timeout
pytest -m performance --run-integration tests/performance/test_query_timeouts.py::test_user_query_timeout_30s -v

# Test connection leaks
pytest -m performance --run-integration tests/performance/test_connection_pool.py::test_no_connection_leaks -v

# Benchmark list providers
pytest -m performance --run-integration tests/performance/test_query_benchmarks.py::test_query_latency_list_providers -v
```

### Skip Slow Tests

The batch timeout test takes 5+ minutes and is skipped by default. To enable:

```bash
pytest -m performance --run-integration tests/performance/test_query_timeouts.py::test_batch_query_timeout_300s -v
```

## Requirements

### Environment Variables

```bash
export GCP_PROJECT_ID="your-gcp-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export CA_ROOT_API_KEY="your-admin-key"
export ENVIRONMENT="development"
```

### Prerequisites

- Real BigQuery connection (GCP project)
- Valid GCP credentials (service account JSON)
- Bootstrap already run (27 meta tables created)
- At least 1 test organization onboarded

### Installation

```bash
pip install -r requirements.txt

# Optional: pytest-benchmark for advanced metrics
pip install pytest-benchmark
```

## Performance Targets

### Query Latencies

| Endpoint Type | p50 | p95 | p99 |
|--------------|-----|-----|-----|
| Lightweight (quota) | < 30ms | < 100ms | < 150ms |
| Medium (list providers - cached) | < 50ms | < 200ms | < 300ms |
| Medium (list plans - cached) | < 100ms | < 300ms | < 400ms |
| Heavy (all plans - cached) | < 150ms | < 400ms | < 600ms |
| Very heavy (onboarding) | < 1000ms | < 3000ms | < 5000ms |

### Connection Pool

- Max connections: 500
- Connection timeout: 60s
- Read timeout: 300s (5 minutes)
- Pool exhaustion: No leaks after 1000+ requests
- Concurrent handling: 100+ simultaneous connections

### Query Timeouts

- User queries: 30s (interactive)
- Batch queries: 300s (5 minutes for ETL)
- Auth queries: 10s (fast fail for auth)
- Connection timeout: 60s (separate from query timeout)

## Interpreting Results

### Success Criteria

✅ **PASS** - Test meets performance targets:
```
Performance Report: List Providers (cached)
================================================================================
Requests:       100
p95:            152.34ms
p95 target:     200.00ms ✓ PASS
================================================================================
```

❌ **FAIL** - Test exceeds performance targets:
```
Performance Report: Get Quota
================================================================================
Requests:       100
p95:            245.67ms
p95 target:     100.00ms ✗ FAIL
================================================================================
```

### Common Issues

**High p95 latency:**
- Check BigQuery query optimization (SELECT * vs explicit columns)
- Verify caching is enabled
- Check connection pool exhaustion

**Connection leaks:**
- Look for missing `finally` blocks
- Check that BigQuery client is properly closed
- Verify async context managers are used

**Timeout failures:**
- Verify timeout configuration in bq_client.py
- Check that slow queries are actually slow enough
- Ensure BigQuery isn't caching query results

## Cleanup

Tests create temporary organizations with names like:
- `test_org_*_perf`
- `test_org_*_concurrent`
- `test_org_*_leak`

These are NOT automatically deleted. To clean up:

```bash
# List test organizations
bq ls --project_id=your-gcp-project-id --max_results=1000 | grep test_org

# Delete test datasets
bq rm -r -f -d your-gcp-project-id:test_org_list_providers_perf_prod
bq rm -r -f -d your-gcp-project-id:test_org_concurrent_prod
```

## Troubleshooting

### "Performance tests require real GCP credentials"

Set `GOOGLE_APPLICATION_CREDENTIALS` and `GCP_PROJECT_ID`:

```bash
export GCP_PROJECT_ID="your-gcp-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa.json"
```

### "Bootstrap not run - cannot create test organization"

Run bootstrap first:

```bash
pytest tests/test_01_bootstrap.py::test_bootstrap --run-integration -v
```

### "Query timeout not occurring"

BigQuery may be caching query results. Try:
- Modify the slow query parameters
- Clear BigQuery cache
- Use different array sizes in slow queries

### "Connection pool test failing"

Verify that:
- Connection pool is configured (check bq_client.py)
- No other tests are running (resource contention)
- BigQuery API quotas are not exceeded

## Advanced Usage

### Custom Performance Targets

Modify targets in test assertions:

```python
# Original
assert stats["p95"] < 200, f"p95 too slow: {stats['p95']:.2f}ms"

# Custom
assert stats["p95"] < 500, f"p95 too slow: {stats['p95']:.2f}ms"
```

### Profiling Slow Tests

Use pytest profiling:

```bash
pytest -m performance --run-integration --profile tests/performance/ -v
```

### Memory Profiling

Install memory_profiler:

```bash
pip install memory_profiler
pytest -m performance --run-integration --profile-mem tests/performance/test_connection_pool.py -v
```

## Continuous Integration

Add to CI pipeline:

```yaml
performance_tests:
  runs-on: ubuntu-latest
  steps:
    - name: Run performance tests
      run: |
        pytest -m performance --run-integration tests/performance/ -v \
          --junitxml=performance-results.xml
    - name: Upload results
      uses: actions/upload-artifact@v2
      with:
        name: performance-results
        path: performance-results.xml
```

## References

- [BigQuery Best Practices](https://cloud.google.com/bigquery/docs/best-practices-performance-overview)
- [Connection Pooling Guide](https://cloud.google.com/python/docs/reference/bigquery/latest)
- [pytest-benchmark Documentation](https://pytest-benchmark.readthedocs.io/)

---

**Last Updated:** 2025-12-06
