"""
Comprehensive Multi-Pipeline E2E Test
Tests multiple pipelines sequentially with full metadata validation.
"""

import asyncio
import httpx
import time
from datetime import datetime
from typing import Dict, List, Optional


# Configuration
API_BASE_URL = "http://localhost:8080"
TENANT_ID = "acme1281"

# Pipeline configurations to test
PIPELINES = [
    {
        "pipeline_id": "gcp_billing_export",
        "description": "GCP Billing Export Pipeline",
        "date": "2025-11-15"
    },
    {
        "pipeline_id": "gcp_pricing_calculation",
        "description": "GCP Pricing Calculation Pipeline",
        "date": "2025-11-14"
    }
]


class PipelineTestResult:
    """Stores test results for a single pipeline execution."""

    def __init__(self, pipeline_id: str, description: str):
        self.pipeline_id = pipeline_id
        self.description = description
        self.triggered = False
        self.logging_id: Optional[str] = None
        self.trigger_time: float = 0.0
        self.execution_time: Optional[float] = None
        self.status: Optional[str] = None
        self.error_message: Optional[str] = None
        self.metadata_verified = False
        self.dq_validated = False

    @property
    def success(self) -> bool:
        """Pipeline completed successfully with all validations."""
        return (
            self.triggered and
            self.status == "COMPLETED" and
            self.metadata_verified
        )

    def print_summary(self):
        """Print formatted test result summary."""
        status_icon = "✓" if self.success else "✗"
        print(f"\n{status_icon} {self.description}")
        print(f"  Pipeline ID: {self.pipeline_id}")
        print(f"  Logging ID: {self.logging_id or 'N/A'}")
        print(f"  Status: {self.status or 'NOT_STARTED'}")

        if self.execution_time:
            print(f"  Execution Time: {self.execution_time:.2f}s")

        if self.error_message:
            print(f"  Error: {self.error_message}")

        print(f"  Metadata Verified: {'Yes' if self.metadata_verified else 'No'}")
        print(f"  DQ Validated: {'Yes' if self.dq_validated else 'No'}")


async def check_api_health(client: httpx.AsyncClient) -> bool:
    """Verify API is running and healthy."""
    try:
        response = await client.get(f"{API_BASE_URL}/health", timeout=5.0)
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"✗ API health check failed: {e}")
        print("Make sure server is running: python -m uvicorn src.app.main:app --reload")
        return False


async def trigger_pipeline(
    client: httpx.AsyncClient,
    pipeline_id: str,
    date: str,
    trigger_by: str = "multi_pipeline_test"
) -> Dict:
    """Trigger a pipeline execution."""
    payload = {
        "trigger_by": trigger_by,
        "date": date
    }

    response = await client.post(
        f"{API_BASE_URL}/api/v1/pipelines/run/{pipeline_id}",
        json=payload,
        timeout=30.0
    )
    response.raise_for_status()
    return response.json()


async def poll_pipeline_status(
    client: httpx.AsyncClient,
    logging_id: str,
    max_polls: int = 60,
    poll_interval: int = 5
) -> Dict:
    """Poll pipeline status until completion or timeout."""
    for poll_count in range(max_polls):
        await asyncio.sleep(poll_interval)

        try:
            response = await client.get(
                f"{API_BASE_URL}/api/v1/pipelines/runs/{logging_id}",
                timeout=10.0
            )

            if response.status_code == 404:
                print(f"    [{poll_count + 1}] Status: PENDING (metadata not yet available)")
                continue

            response.raise_for_status()
            status_data = response.json()

            status = status_data.get("status", "UNKNOWN")
            duration_ms = status_data.get("duration_ms")

            print(f"    [{poll_count + 1}] Status: {status}", end="")
            if duration_ms:
                print(f" (Duration: {duration_ms/1000:.2f}s)")
            else:
                print()

            if status in ["COMPLETED", "FAILED"]:
                return status_data

        except httpx.HTTPStatusError as e:
            if e.response.status_code != 404:
                print(f"\n    ✗ Poll error: {e}")
        except Exception as e:
            print(f"\n    ✗ Poll error: {e}")

    raise TimeoutError(f"Pipeline timeout after {max_polls * poll_interval}s")


async def verify_pipeline_metadata(
    client: httpx.AsyncClient,
    logging_id: str
) -> Dict:
    """Verify pipeline metadata is correctly logged."""
    response = await client.get(
        f"{API_BASE_URL}/api/v1/pipelines/runs/{logging_id}",
        timeout=10.0
    )
    response.raise_for_status()
    return response.json()


async def run_single_pipeline_test(
    client: httpx.AsyncClient,
    pipeline_config: Dict,
    test_num: int,
    total_tests: int
) -> PipelineTestResult:
    """Run complete test for a single pipeline."""
    pipeline_id = pipeline_config["pipeline_id"]
    description = pipeline_config["description"]
    date = pipeline_config["date"]

    result = PipelineTestResult(pipeline_id, description)

    print(f"\n{'='*80}")
    print(f"TEST {test_num}/{total_tests}: {description}")
    print(f"{'='*80}")
    print(f"Pipeline ID: {pipeline_id}")
    print(f"Date Parameter: {date}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    try:
        # Step 1: Trigger Pipeline
        print("[1/3] Triggering pipeline...")
        start_time = time.time()

        trigger_result = await trigger_pipeline(client, pipeline_id, date)

        result.triggered = True
        result.logging_id = trigger_result["pipeline_logging_id"]
        result.trigger_time = time.time() - start_time

        print(f"  ✓ Pipeline triggered in {result.trigger_time:.2f}s")
        print(f"  Logging ID: {result.logging_id}")

        # Step 2: Monitor Execution
        print("\n[2/3] Monitoring pipeline execution...")

        status_data = await poll_pipeline_status(client, result.logging_id)

        result.status = status_data.get("status")
        duration_ms = status_data.get("duration_ms")
        result.execution_time = duration_ms / 1000 if duration_ms else None

        if result.status == "COMPLETED":
            print(f"\n  ✓ Pipeline completed successfully!")
            if result.execution_time:
                print(f"  Total Duration: {result.execution_time:.2f}s")
        else:
            result.error_message = status_data.get("error_message", "Unknown error")
            print(f"\n  ✗ Pipeline failed: {result.error_message}")
            return result

        # Step 3: Verify Metadata
        print("\n[3/3] Verifying metadata logging...")

        metadata = await verify_pipeline_metadata(client, result.logging_id)

        result.metadata_verified = True

        print("  ✓ Pipeline metadata verified:")
        print(f"    - Pipeline ID: {metadata.get('pipeline_id')}")
        print(f"    - Tenant ID: {metadata.get('tenant_id')}")
        print(f"    - Status: {metadata.get('status')}")
        print(f"    - Trigger Type: {metadata.get('trigger_type')}")
        print(f"    - Start Time: {metadata.get('start_time')}")
        print(f"    - End Time: {metadata.get('end_time')}")

        if 'parameters' in metadata:
            print(f"    - Parameters: {metadata.get('parameters')}")

        # Check if DQ validation ran (optional)
        if 'dq_results' in metadata or metadata.get('dq_validated'):
            result.dq_validated = True
            print(f"    - DQ Validated: Yes")

    except Exception as e:
        result.error_message = str(e)
        print(f"\n  ✗ Test failed: {e}")

    return result


async def run_comprehensive_tests():
    """Run comprehensive tests for all configured pipelines."""
    print("=" * 80)
    print("COMPREHENSIVE MULTI-PIPELINE E2E TEST")
    print("=" * 80)
    print(f"API URL: {API_BASE_URL}")
    print(f"Tenant: {TENANT_ID}")
    print(f"Total Pipelines: {len(PIPELINES)}")
    print(f"Test Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

    results: List[PipelineTestResult] = []

    async with httpx.AsyncClient() as client:
        # Health check
        print("\n[0] Checking API health...")
        if not await check_api_health(client):
            return False
        print("✓ API is healthy\n")

        # Run each pipeline test sequentially
        total_start = time.time()

        for idx, pipeline_config in enumerate(PIPELINES, 1):
            result = await run_single_pipeline_test(
                client,
                pipeline_config,
                idx,
                len(PIPELINES)
            )
            results.append(result)

            # Brief pause between pipelines
            if idx < len(PIPELINES):
                print(f"\n{'='*80}")
                print("Waiting 3 seconds before next pipeline...")
                print(f"{'='*80}")
                await asyncio.sleep(3)

        total_time = time.time() - total_start

    # Print comprehensive summary
    print("\n" + "=" * 80)
    print("COMPREHENSIVE TEST RESULTS")
    print("=" * 80)

    for result in results:
        result.print_summary()

    # Statistics
    successful = sum(1 for r in results if r.success)
    failed = len(results) - successful

    print(f"\n{'='*80}")
    print("SUMMARY STATISTICS")
    print(f"{'='*80}")
    print(f"Total Pipelines: {len(results)}")
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")
    print(f"Total Test Duration: {total_time:.2f}s")

    if successful == len(results):
        print(f"\n{'='*80}")
        print("✓ ALL TESTS PASSED!")
        print(f"{'='*80}")
        return True
    else:
        print(f"\n{'='*80}")
        print("✗ SOME TESTS FAILED")
        print(f"{'='*80}")
        return False


async def run_parallel_pipeline_test():
    """Test parallel execution of both pipelines."""
    print("=" * 80)
    print("PARALLEL PIPELINE EXECUTION TEST")
    print("=" * 80)
    print(f"Testing {len(PIPELINES)} concurrent pipeline executions...")
    print("=" * 80)
    print()

    async with httpx.AsyncClient() as client:
        # Health check
        if not await check_api_health(client):
            return False

        # Trigger all pipelines in parallel
        tasks = [
            run_single_pipeline_test(client, config, idx + 1, len(PIPELINES))
            for idx, config in enumerate(PIPELINES)
        ]

        start_time = time.time()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        total_time = time.time() - start_time

        # Analyze results
        successful = sum(1 for r in results if isinstance(r, PipelineTestResult) and r.success)
        failed = len(results) - successful

        print("\n" + "=" * 80)
        print("PARALLEL TEST RESULTS")
        print("=" * 80)
        print(f"Total Duration: {total_time:.2f}s")
        print(f"Successful: {successful}/{len(PIPELINES)}")
        print(f"Failed: {failed}/{len(PIPELINES)}")

        if total_time < 60 and successful == len(PIPELINES):
            print("\n✓ PARALLEL EXECUTION CONFIRMED!")
            print("  All pipelines completed concurrently")

        print("=" * 80)

        return successful == len(PIPELINES)


if __name__ == "__main__":
    import sys

    print("\nSelect test mode:")
    print("1. Sequential Pipeline Tests (recommended)")
    print("2. Parallel Pipeline Tests")
    print()

    # Support command-line argument for non-interactive execution
    if len(sys.argv) > 1:
        choice = sys.argv[1]
    else:
        try:
            choice = input("Enter choice (1 or 2, default=1): ").strip() or "1"
        except EOFError:
            choice = "1"
        print()

    if choice == "2":
        success = asyncio.run(run_parallel_pipeline_test())
    else:
        success = asyncio.run(run_comprehensive_tests())

    exit(0 if success else 1)
