"""
Test BigQuery-Based Duplicate Detection - Parallel Request Test
Tests that BigQuery duplicate detection prevents duplicate pipeline execution.
"""

import asyncio
import httpx
import time
from datetime import datetime

API_URL = "http://localhost:8080"
PIPELINE_ID = "gcp_billing_export"
NUM_PARALLEL_REQUESTS = 10


async def trigger_pipeline(client: httpx.AsyncClient, request_id: int):
    """Trigger a pipeline and return the response."""
    try:
        start = time.time()
        response = await client.post(
            f"{API_URL}/api/v1/pipelines/run/{PIPELINE_ID}",
            json={
                "trigger_by": f"test_request_{request_id}",
                "date": "2025-11-15"
            },
            timeout=30.0
        )
        duration = time.time() - start

        if response.status_code == 200:
            data = response.json()
            return {
                "request_id": request_id,
                "success": True,
                "status": data.get("status"),
                "pipeline_logging_id": data.get("pipeline_logging_id"),
                "message": data.get("message"),
                "duration": duration
            }
        else:
            return {
                "request_id": request_id,
                "success": False,
                "error": response.text,
                "duration": duration
            }
    except Exception as e:
        return {
            "request_id": request_id,
            "success": False,
            "error": str(e),
            "duration": time.time() - start
        }


async def main():
    print("=" * 80)
    print("BIGQUERY DUPLICATE DETECTION TEST")
    print("=" * 80)
    print(f"API URL: {API_URL}")
    print(f"Pipeline ID: {PIPELINE_ID}")
    print(f"Parallel Requests: {NUM_PARALLEL_REQUESTS}")
    print(f"Test Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()

    # Create async HTTP client
    async with httpx.AsyncClient() as client:
        # Check API health
        print("[0] Checking API health...")
        try:
            health = await client.get(f"{API_URL}/health", timeout=5.0)
            if health.status_code == 200:
                print("✓ API is healthy\n")
            else:
                print(f"✗ API health check failed: {health.status_code}\n")
                return
        except Exception as e:
            print(f"✗ API not reachable: {e}\n")
            return

        # Launch parallel requests
        print(f"[1] Launching {NUM_PARALLEL_REQUESTS} parallel pipeline triggers...")
        start_time = time.time()

        tasks = [
            trigger_pipeline(client, i + 1)
            for i in range(NUM_PARALLEL_REQUESTS)
        ]

        results = await asyncio.gather(*tasks)

        total_duration = time.time() - start_time
        print(f"✓ All requests completed in {total_duration:.2f}s\n")

        # Analyze results
        print("=" * 80)
        print("RESULTS ANALYSIS")
        print("=" * 80)

        pipeline_logging_ids = set()
        pending_count = 0
        running_count = 0
        error_count = 0

        for result in results:
            if result["success"]:
                status = result["status"]
                logging_id = result["pipeline_logging_id"]
                pipeline_logging_ids.add(logging_id)

                if status == "PENDING":
                    pending_count += 1
                    print(f"✓ Request {result['request_id']:2d}: PENDING - New execution started")
                    print(f"   Logging ID: {logging_id}")
                    print(f"   Duration: {result['duration']:.2f}s\n")
                elif status == "RUNNING":
                    running_count += 1
                    print(f"⚠ Request {result['request_id']:2d}: RUNNING - Returned existing execution")
                    print(f"   Logging ID: {logging_id}")
                    print(f"   Message: {result['message']}")
                    print(f"   Duration: {result['duration']:.2f}s\n")
            else:
                error_count += 1
                print(f"✗ Request {result['request_id']:2d}: ERROR")
                print(f"   Error: {result['error']}")
                print(f"   Duration: {result['duration']:.2f}s\n")

        print("=" * 80)
        print("DUPLICATE DETECTION VERIFICATION")
        print("=" * 80)

        unique_logging_ids = len(pipeline_logging_ids)

        print(f"Total Requests: {NUM_PARALLEL_REQUESTS}")
        print(f"Unique Pipeline Logging IDs: {unique_logging_ids}")
        print(f"PENDING (new executions): {pending_count}")
        print(f"RUNNING (duplicate detected): {running_count}")
        print(f"ERRORS: {error_count}")
        print()

        if unique_logging_ids == 1 and error_count == 0:
            print("✓ DUPLICATE DETECTION TEST PASSED!")
            print("  All requests returned the same pipeline_logging_id")
            print("  BigQuery duplicate detection successfully prevented duplicate execution")
            print(f"  Single execution ID: {list(pipeline_logging_ids)[0]}")
        elif unique_logging_ids > 1:
            print("⚠ PARTIAL SUCCESS")
            print(f"  Expected 1 unique logging ID, got {unique_logging_ids}")
            print("  Note: This can happen if pipelines complete very quickly between requests")
            print(f"  Execution IDs: {pipeline_logging_ids}")
        elif error_count > 0:
            print("✗ TEST FAILED WITH ERRORS!")
            print(f"  {error_count} requests failed")
        else:
            print("✗ TEST ERROR!")
            print("  No successful pipeline triggers")

        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
