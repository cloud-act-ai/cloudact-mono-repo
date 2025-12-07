"""
Performance tests for CloudAct API Service.

This package contains comprehensive performance tests for:
- Query timeouts (30s user, 300s batch, 10s auth)
- Connection pool management (500 max connections, no leaks)
- Query latency benchmarks (p50, p95, p99 percentiles)

All tests use REAL BigQuery (no mocks) to measure actual performance.

Run with: pytest -m performance --run-integration tests/performance/ -v

Test Categories:
1. test_query_timeouts.py - Verify timeout enforcement
2. test_connection_pool.py - Verify connection pooling behavior
3. test_query_benchmarks.py - Measure query latencies
4. test_benchmarks.py - General performance benchmarks

Metrics tracked:
- p50, p95, p99 latencies
- Throughput (requests/second)
- Concurrent request handling
- Cache performance
- Connection pool behavior
- Query timeout enforcement
"""
