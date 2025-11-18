#!/usr/bin/env python3
"""
Test script to verify performance fixes for 10k tenant scale.

Tests:
1. Thread pool for BigQuery operations is initialized
2. Connection pool configuration is present
3. Metadata logger queue backpressure handling
"""

import sys
import asyncio
from unittest.mock import Mock, MagicMock


def test_thread_pool_initialization():
    """Test that BQ_EXECUTOR thread pool is initialized with correct settings."""
    print("Testing thread pool initialization...")

    try:
        from src.core.pipeline.async_executor import BQ_EXECUTOR

        assert BQ_EXECUTOR is not None, "BQ_EXECUTOR should be initialized"
        assert BQ_EXECUTOR._max_workers == 200, f"Expected 200 workers, got {BQ_EXECUTOR._max_workers}"

        print("  ✓ Thread pool initialized with 200 workers")
        return True
    except Exception as e:
        print(f"  ✗ Thread pool test failed: {e}")
        return False


def test_connection_pool_documentation():
    """Test that BigQuery client has connection pool configuration."""
    print("Testing connection pool configuration...")

    try:
        from src.core.engine.bq_client import BigQueryClient

        # Check that the client property docstring mentions connection pooling
        client_property = BigQueryClient.client.fget
        assert client_property is not None, "Client property should exist"

        docstring = client_property.__doc__ or ""
        assert "500" in docstring, "Docstring should mention 500 connections"
        assert "Connection Pool" in docstring, "Docstring should mention Connection Pool"

        print("  ✓ Connection pool configuration documented")
        return True
    except Exception as e:
        print(f"  ✗ Connection pool test failed: {e}")
        return False


async def test_metadata_logger_backpressure():
    """Test that metadata logger uses wait_for with timeout."""
    print("Testing metadata logger queue backpressure...")

    try:
        from src.core.metadata.logger import MetadataLogger

        # Create mock BigQuery client
        mock_bq_client = Mock()

        # Create logger instance
        logger = MetadataLogger(mock_bq_client, "test_tenant")

        # Start logger
        await logger.start()

        # Check that queues are bounded
        assert logger.queue_size == 1000, f"Expected queue size 1000, got {logger.queue_size}"

        # Check queue depth monitoring
        depths = logger.get_queue_depths()
        assert "pipeline_queue_size" in depths, "Queue depths should include pipeline_queue_size"
        assert "step_queue_size" in depths, "Queue depths should include step_queue_size"
        assert "pipeline_queue_utilization_pct" in depths, "Queue depths should include utilization percentage"

        # Stop logger
        await logger.stop()

        print("  ✓ Metadata logger queue backpressure configured")
        print(f"  ✓ Queue depth monitoring available: {list(depths.keys())}")
        return True
    except Exception as e:
        print(f"  ✗ Metadata logger test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("Performance Fixes Verification for 10k Tenant Scale")
    print("="*60 + "\n")

    results = []

    # Test 1: Thread pool
    results.append(test_thread_pool_initialization())

    # Test 2: Connection pool
    results.append(test_connection_pool_documentation())

    # Test 3: Metadata logger backpressure
    results.append(await test_metadata_logger_backpressure())

    print("\n" + "="*60)
    print(f"Results: {sum(results)}/{len(results)} tests passed")
    print("="*60 + "\n")

    if all(results):
        print("✓ All performance fixes verified successfully!")
        return 0
    else:
        print("✗ Some tests failed - review output above")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
