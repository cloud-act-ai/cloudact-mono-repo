#!/usr/bin/env python3
"""
Test concurrent pipeline execution - triggers same pipeline 10 times in parallel
"""
import asyncio
import aiohttp
import time
from datetime import datetime

async def trigger_pipeline(session, request_id):
    """Trigger a single pipeline request"""
    url = "http://localhost:8080/api/v1/pipelines/run/gcp_billing_export"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": "test-api-key-acme1281",
        "X-Tenant-ID": "acme1281"
    }
    payload = {"trigger_by": f"concurrency_test_{request_id}"}

    start = time.time()
    try:
        async with session.post(url, json=payload, headers=headers) as response:
            elapsed = time.time() - start
            data = await response.json()

            if response.status == 200:
                pipeline_logging_id = data.get("pipeline_logging_id", "UNKNOWN")[:16]
                status = data.get("status", "UNKNOWN")
                print(f"✓ Request {request_id:2d}: {pipeline_logging_id}... | status={status} | {elapsed:.2f}s")
                return {
                    "request_id": request_id,
                    "success": True,
                    "pipeline_logging_id": data.get("pipeline_logging_id"),
                    "status": status,
                    "elapsed": elapsed
                }
            else:
                print(f"✗ Request {request_id:2d}: HTTP {response.status} | {data} | {elapsed:.2f}s")
                return {
                    "request_id": request_id,
                    "success": False,
                    "error": data,
                    "status_code": response.status,
                    "elapsed": elapsed
                }
    except Exception as e:
        elapsed = time.time() - start
        print(f"✗ Request {request_id:2d}: EXCEPTION | {str(e)} | {elapsed:.2f}s")
        return {
            "request_id": request_id,
            "success": False,
            "error": str(e),
            "elapsed": elapsed
        }

async def main():
    """Run 10 parallel requests"""
    print("=" * 80)
    print(f"Starting Concurrency Test: 10 parallel requests to same pipeline")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 80)

    start_time = time.time()

    async with aiohttp.ClientSession() as session:
        tasks = [trigger_pipeline(session, i+1) for i in range(10)]
        results = await asyncio.gather(*tasks)

    total_time = time.time() - start_time

    print("=" * 80)
    print(f"Results Summary:")
    print(f"  Total time: {total_time:.2f}s")
    print(f"  Successful: {sum(1 for r in results if r['success'])}/10")
    print(f"  Failed: {sum(1 for r in results if not r['success'])}/10")
    print(f"  Avg response time: {sum(r['elapsed'] for r in results) / len(results):.2f}s")
    print("=" * 80)

    # Show unique pipeline_logging_ids
    successful_runs = [r for r in results if r['success']]
    if successful_runs:
        unique_ids = set(r['pipeline_logging_id'] for r in successful_runs)
        print(f"\nUnique pipeline_logging_ids: {len(unique_ids)}")
        if len(unique_ids) == 10:
            print("✓ All 10 requests created SEPARATE pipeline runs (no concurrency control)")
        else:
            print(f"! Only {len(unique_ids)} unique runs created (possible concurrency control)")

if __name__ == "__main__":
    asyncio.run(main())
