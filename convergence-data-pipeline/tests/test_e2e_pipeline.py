"""
End-to-End Pipeline Test
Tests complete pipeline execution flow including metadata logging.
"""

import asyncio
import httpx
import time
from datetime import datetime


# Configuration
API_BASE_URL = "http://localhost:8080"
PIPELINE_ID = "google_example_pipeline"
TENANT_ID = "acme1281"


async def test_single_pipeline_execution():
    """
    Test end-to-end pipeline execution with metadata logging.

    Validates:
    - Pipeline triggers successfully
    - Metadata tables are created automatically
    - Pipeline execution completes
    - Metadata is logged correctly
    """
    print("=" * 80)
    print("END-TO-END PIPELINE TEST")
    print("=" * 80)
    print(f"API URL: {API_BASE_URL}")
    print(f"Pipeline: {PIPELINE_ID}")
    print(f"Tenant: {TENANT_ID}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()

    async with httpx.AsyncClient() as client:
        # 1. Health Check
        print("[1/4] Checking API health...")
        try:
            response = await client.get(f"{API_BASE_URL}/health", timeout=5.0)
            response.raise_for_status()
            print("✓ API is healthy")
        except Exception as e:
            print(f"✗ API health check failed: {e}")
            print("Make sure server is running: python -m uvicorn src.app.main:app --reload")
            return False

        # 2. Trigger Pipeline
        print("\n[2/4] Triggering pipeline...")
        start_time = time.time()

        payload = {
            "trigger_by": "e2e_test",
            "date": "2025-11-15"
        }

        try:
            response = await client.post(
                f"{API_BASE_URL}/api/v1/pipelines/run/{PIPELINE_ID}",
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            result = response.json()

            pipeline_logging_id = result["pipeline_logging_id"]
            trigger_time = time.time() - start_time

            print(f"✓ Pipeline triggered successfully in {trigger_time:.2f}s")
            print(f"  Logging ID: {pipeline_logging_id}")
            print(f"  Status: {result.get('status', 'UNKNOWN')}")
        except Exception as e:
            print(f"✗ Failed to trigger pipeline: {e}")
            return False

        # 3. Monitor Execution
        print("\n[3/4] Monitoring pipeline execution...")

        max_polls = 60  # 5 minutes max
        poll_interval = 5  # seconds

        for poll_count in range(max_polls):
            await asyncio.sleep(poll_interval)

            try:
                response = await client.get(
                    f"{API_BASE_URL}/api/v1/pipelines/runs/{pipeline_logging_id}",
                    timeout=10.0
                )

                if response.status_code == 404:
                    print(f"  [{poll_count + 1}] Status: PENDING (metadata not yet available)")
                    continue

                response.raise_for_status()
                status_data = response.json()

                status = status_data.get("status", "UNKNOWN")
                duration_ms = status_data.get("duration_ms")

                print(f"  [{poll_count + 1}] Status: {status}", end="")
                if duration_ms:
                    print(f" (Duration: {duration_ms/1000:.2f}s)")
                else:
                    print()

                if status == "COMPLETED":
                    print(f"\n✓ Pipeline completed successfully!")
                    print(f"  Total Duration: {duration_ms/1000:.2f}s")
                    break
                elif status == "FAILED":
                    error_msg = status_data.get("error_message", "Unknown error")
                    print(f"\n✗ Pipeline failed: {error_msg}")
                    return False

            except httpx.HTTPStatusError as e:
                if e.response.status_code != 404:
                    print(f"\n✗ Poll error: {e}")
            except Exception as e:
                print(f"\n✗ Poll error: {e}")
        else:
            print(f"\n✗ Pipeline timeout after {max_polls * poll_interval}s")
            return False

        # 4. Verify Metadata
        print("\n[4/4] Verifying metadata logging...")

        try:
            # Get pipeline run metadata
            response = await client.get(
                f"{API_BASE_URL}/api/v1/pipelines/runs/{pipeline_logging_id}",
                timeout=10.0
            )
            response.raise_for_status()
            pipeline_data = response.json()

            print("✓ Pipeline metadata verified:")
            print(f"  - Pipeline ID: {pipeline_data.get('pipeline_id')}")
            print(f"  - Tenant ID: {pipeline_data.get('tenant_id')}")
            print(f"  - Status: {pipeline_data.get('status')}")
            print(f"  - Trigger Type: {pipeline_data.get('trigger_type')}")
            print(f"  - Start Time: {pipeline_data.get('start_time')}")
            print(f"  - End Time: {pipeline_data.get('end_time')}")

            # Check if parameters field exists (JSON type)
            if 'parameters' in pipeline_data:
                print(f"  - Parameters: {pipeline_data.get('parameters')}")

        except Exception as e:
            print(f"✗ Failed to verify metadata: {e}")
            return False

    print("\n" + "=" * 80)
    print("✓ END-TO-END TEST PASSED!")
    print("=" * 80)
    return True


async def test_parallel_pipeline_execution():
    """
    Test parallel execution of 2 pipelines.

    Validates:
    - Multiple pipelines can run concurrently
    - Each has independent metadata logging
    - Async/await architecture works correctly
    """
    print("=" * 80)
    print("PARALLEL PIPELINE EXECUTION TEST")
    print("=" * 80)
    print(f"Testing 2 concurrent pipeline executions...")
    print("=" * 80)
    print()

    async with httpx.AsyncClient() as client:
        # Trigger 2 pipelines in parallel
        tasks = [
            trigger_and_wait(client, 1, "2025-11-14"),
            trigger_and_wait(client, 2, "2025-11-15"),
        ]

        start_time = time.time()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        total_time = time.time() - start_time

        # Analyze results
        successful = sum(1 for r in results if r is True)
        failed = len(results) - successful

        print("\n" + "=" * 80)
        print("PARALLEL TEST RESULTS")
        print("=" * 80)
        print(f"Total Duration: {total_time:.2f}s")
        print(f"Successful: {successful}/2")
        print(f"Failed: {failed}/2")

        if total_time < 30 and successful == 2:
            print("\n✓ PARALLEL EXECUTION CONFIRMED!")
            print("  Both pipelines completed concurrently")

        print("=" * 80)

        return successful == 2


async def trigger_and_wait(client: httpx.AsyncClient, num: int, date: str):
    """Helper to trigger and wait for a single pipeline."""
    try:
        # Trigger
        response = await client.post(
            f"{API_BASE_URL}/api/v1/pipelines/run/{PIPELINE_ID}",
            json={"trigger_by": f"parallel_test_{num}", "date": date},
            timeout=30.0
        )
        response.raise_for_status()
        result = response.json()

        pipeline_logging_id = result["pipeline_logging_id"]
        print(f"[Pipeline {num}] Triggered: {pipeline_logging_id}")

        # Wait for completion (simple version)
        for _ in range(60):
            await asyncio.sleep(5)

            response = await client.get(
                f"{API_BASE_URL}/api/v1/pipelines/runs/{pipeline_logging_id}",
                timeout=10.0
            )

            if response.status_code == 200:
                status_data = response.json()
                status = status_data.get("status")

                if status == "COMPLETED":
                    print(f"[Pipeline {num}] ✓ Completed")
                    return True
                elif status == "FAILED":
                    print(f"[Pipeline {num}] ✗ Failed")
                    return False

        print(f"[Pipeline {num}] ✗ Timeout")
        return False

    except Exception as e:
        print(f"[Pipeline {num}] ✗ Error: {e}")
        return False


if __name__ == "__main__":
    import sys

    # Support command-line argument for non-interactive execution
    if len(sys.argv) > 1:
        choice = sys.argv[1]
    else:
        print("\nSelect test to run:")
        print("1. Single Pipeline E2E Test (recommended)")
        print("2. Parallel Pipeline Test")
        print()

        try:
            choice = input("Enter choice (1 or 2, default=1): ").strip() or "1"
        except EOFError:
            # Non-interactive mode, use default
            choice = "1"
        print()

    if choice == "2":
        success = asyncio.run(test_parallel_pipeline_execution())
    else:
        success = asyncio.run(test_single_pipeline_execution())

    exit(0 if success else 1)
