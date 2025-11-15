#!/usr/bin/env python3
"""
Run all 25 pipeline tests (5 customers × 5 templates) in parallel
"""
import asyncio
import aiohttp
from datetime import datetime

# Customer credentials
CUSTOMERS = {
    "acmeinc_23xv2": "acmeinc_23xv2_api_qK44-NTGn0FxAyZZ",
    "techcorp_99zx4": "techcorp_99zx4_api_vz7MM1EkLosWs-Ui",
    "datasystems_45abc": "datasystems_45abc_api_nIRbW0pmvCukJB_b",
    "cloudworks_78def": "cloudworks_78def_api_brGXeGioqVY2qUKO",
    "bytefactory_12ghi": "bytefactory_12ghi_api_H2T7nBqcvGBgwlIz",
}

# Pipeline templates
TEMPLATES = [
    "bill-sample-export-template",
    "usage-analytics-template",
    "cost-optimization-template",
    "resource-inventory-template",
    "performance-metrics-template",
]

BASE_URL = "http://localhost:8080"

async def run_pipeline(session, tenant_id, api_key, template, pipeline_num):
    """Run a single pipeline"""
    url = f"{BASE_URL}/api/v1/pipelines/run/{tenant_id}/gcp/cost/{template}"
    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json"
    }

    print(f"[{pipeline_num}/25] Starting: {tenant_id} / {template}")

    try:
        async with session.post(url, headers=headers, json={}) as response:
            result = await response.json()

            if response.status == 200 and "pipeline_logging_id" in result:
                pipeline_id = result["pipeline_logging_id"]
                print(f"[{pipeline_num}/25] ✓ SUCCESS: {tenant_id} / {template} (ID: {pipeline_id})")
                return True, pipeline_id
            else:
                error_msg = result.get("detail", str(result))[:100]
                print(f"[{pipeline_num}/25] ✗ FAILED: {tenant_id} / {template}")
                print(f"  Error: {error_msg}")
                return False, None

    except Exception as e:
        print(f"[{pipeline_num}/25] ✗ ERROR: {tenant_id} / {template}: {str(e)}")
        return False, None

async def main():
    print("=========================================")
    print("Running 25 Pipeline Tests in Parallel")
    print("=========================================")
    print("")

    start_time = datetime.now()

    async with aiohttp.ClientSession() as session:
        tasks = []
        pipeline_num = 0

        # Create all pipeline tasks
        for tenant_id, api_key in CUSTOMERS.items():
            for template in TEMPLATES:
                pipeline_num += 1
                task = run_pipeline(session, tenant_id, api_key, template, pipeline_num)
                tasks.append(task)

        # Run all pipelines in parallel
        results = await asyncio.gather(*tasks)

    # Summary
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    successful = sum(1 for success, _ in results if success)
    failed = len(results) - successful

    print("")
    print("=========================================")
    print("All 25 Pipeline Tests Completed!")
    print("=========================================")
    print(f"Duration: {duration:.2f} seconds")
    print(f"Successful: {successful}/25")
    print(f"Failed: {failed}/25")
    print("")

    if successful > 0:
        print("Next steps:")
        print("1. Check BigQuery for created tables in each tenant dataset")
        print("2. Query pipeline_runs table for execution status")
        print("3. Review step_logs for detailed execution logs")

if __name__ == "__main__":
    asyncio.run(main())
