#!/usr/bin/env python3
"""
Test Onboarding with Force Recreation
This script onboards 5 customers with force_recreate options enabled,
then runs a sample pipeline for each customer to validate infrastructure.

Usage: python tests/test_onboarding_force_recreate.py
"""

import asyncio
import aiohttp
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# Configuration
API_BASE_URL = "http://localhost:8080"
ONBOARDING_ENDPOINT = f"{API_BASE_URL}/api/v1/customers/onboard"

# List of customers to onboard
CUSTOMERS = [
    "acmeinc_23xv2",
    "techcorp_99zx4",
    "datasystems_45abc",
    "cloudworks_78def",
    "bytefactory_12ghi",
]

# Log directory
LOG_DIR = Path(f"tests/logs/onboarding_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Colors for output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color


async def onboard_customer(session: aiohttp.ClientSession, tenant_id: str) -> Tuple[str, Dict, bool]:
    """
    Onboard a single customer with force recreation enabled.

    Returns:
        Tuple of (tenant_id, response_data, success)
    """
    log_file = LOG_DIR / f"{tenant_id}_onboarding.json"

    print(f"{Colors.BLUE}[{tenant_id}] Starting onboarding...{Colors.NC}")

    payload = {
        "tenant_id": tenant_id,
        "force_recreate_dataset": True,
        "force_recreate_tables": True
    }

    try:
        async with session.post(ONBOARDING_ENDPOINT, json=payload) as response:
            response_data = await response.json()

            # Save response to log file
            with open(log_file, 'w') as f:
                json.dump(response_data, f, indent=2)

            # Check if successful
            if response.status == 200 and 'api_key' in response_data:
                api_key = response_data.get('api_key', '')
                dataset_created = response_data.get('dataset_created', False)
                dryrun_status = response_data.get('dryrun_status', 'UNKNOWN')

                print(f"{Colors.GREEN}[{tenant_id}] ✓ Onboarding successful{Colors.NC}")
                print(f"{Colors.GREEN}[{tenant_id}]   - Dataset created: {dataset_created}{Colors.NC}")
                print(f"{Colors.GREEN}[{tenant_id}]   - Dryrun status: {dryrun_status}{Colors.NC}")
                print(f"{Colors.GREEN}[{tenant_id}]   - API Key: {api_key[:20]}...{Colors.NC}")

                return (tenant_id, response_data, True)
            else:
                print(f"{Colors.RED}[{tenant_id}] ✗ Onboarding failed{Colors.NC}")
                print(f"{Colors.RED}[{tenant_id}] Response: {response_data}{Colors.NC}")
                return (tenant_id, response_data, False)

    except Exception as e:
        print(f"{Colors.RED}[{tenant_id}] ✗ Exception during onboarding: {e}{Colors.NC}")
        return (tenant_id, {"error": str(e)}, False)


async def run_sample_pipeline(session: aiohttp.ClientSession, tenant_id: str, api_key: str) -> Tuple[str, Dict, bool]:
    """
    Run sample pipeline for a customer.

    Returns:
        Tuple of (tenant_id, response_data, success)
    """
    log_file = LOG_DIR / f"{tenant_id}_pipeline.json"

    print(f"{Colors.BLUE}[{tenant_id}] Running sample pipeline...{Colors.NC}")

    # Run dryrun pipeline
    pipeline_endpoint = f"{API_BASE_URL}/api/v1/pipelines/run/{tenant_id}/gcp/example/dryrun"

    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json"
    }

    try:
        async with session.post(pipeline_endpoint, json={}, headers=headers) as response:
            response_data = await response.json()

            # Save response to log file
            with open(log_file, 'w') as f:
                json.dump(response_data, f, indent=2)

            # Check if successful
            if 'pipeline_logging_id' in response_data:
                pipeline_id = response_data.get('pipeline_logging_id', '')
                status = response_data.get('status', 'UNKNOWN')

                print(f"{Colors.GREEN}[{tenant_id}] ✓ Pipeline started successfully{Colors.NC}")
                print(f"{Colors.GREEN}[{tenant_id}]   - Pipeline ID: {pipeline_id}{Colors.NC}")
                print(f"{Colors.GREEN}[{tenant_id}]   - Status: {status}{Colors.NC}")

                return (tenant_id, response_data, True)
            else:
                print(f"{Colors.YELLOW}[{tenant_id}] ⚠ Pipeline test skipped or failed{Colors.NC}")
                print(f"{Colors.YELLOW}[{tenant_id}] Response: {response_data}{Colors.NC}")
                return (tenant_id, response_data, False)

    except Exception as e:
        print(f"{Colors.YELLOW}[{tenant_id}] ⚠ Exception during pipeline test: {e}{Colors.NC}")
        return (tenant_id, {"error": str(e)}, False)


async def main():
    """Main test orchestration"""
    print(f"{Colors.BLUE}========================================{Colors.NC}")
    print(f"{Colors.BLUE}Customer Onboarding Test with Force Recreation{Colors.NC}")
    print(f"{Colors.BLUE}========================================{Colors.NC}")
    print()
    print(f"{Colors.YELLOW}API Base URL: {API_BASE_URL}{Colors.NC}")
    print(f"{Colors.YELLOW}Log Directory: {LOG_DIR}{Colors.NC}")
    print(f"{Colors.YELLOW}Customers to onboard: {len(CUSTOMERS)}{Colors.NC}")
    print()

    # Create aiohttp session
    async with aiohttp.ClientSession() as session:
        # Step 1: Onboard all customers in parallel
        print(f"{Colors.BLUE}========================================{Colors.NC}")
        print(f"{Colors.BLUE}Step 1: Onboarding Customers (Parallel){Colors.NC}")
        print(f"{Colors.BLUE}========================================{Colors.NC}")
        print()

        onboarding_tasks = [onboard_customer(session, tenant_id) for tenant_id in CUSTOMERS]
        onboarding_results = await asyncio.gather(*onboarding_tasks)

        print()
        print(f"{Colors.GREEN}✓ All onboarding requests completed{Colors.NC}")
        print()

        # Collect API keys
        customer_api_keys = {}
        for tenant_id, response_data, success in onboarding_results:
            if success and 'api_key' in response_data:
                customer_api_keys[tenant_id] = response_data['api_key']

        # Small delay to ensure all responses are processed
        await asyncio.sleep(2)

        # Step 2: Run sample pipelines for all customers in parallel
        print(f"{Colors.BLUE}========================================{Colors.NC}")
        print(f"{Colors.BLUE}Step 2: Running Sample Pipelines (Parallel){Colors.NC}")
        print(f"{Colors.BLUE}========================================{Colors.NC}")
        print()

        pipeline_tasks = []
        for tenant_id in CUSTOMERS:
            if tenant_id in customer_api_keys:
                pipeline_tasks.append(run_sample_pipeline(session, tenant_id, customer_api_keys[tenant_id]))
            else:
                print(f"{Colors.RED}[{tenant_id}] ✗ Skipping pipeline test (no API key){Colors.NC}")

        pipeline_results = await asyncio.gather(*pipeline_tasks) if pipeline_tasks else []

        print()
        print(f"{Colors.GREEN}✓ All pipeline tests completed{Colors.NC}")
        print()

        # Step 3: Summary
        print(f"{Colors.BLUE}========================================{Colors.NC}")
        print(f"{Colors.BLUE}Test Summary{Colors.NC}")
        print(f"{Colors.BLUE}========================================{Colors.NC}")
        print()

        onboarding_success = sum(1 for _, _, success in onboarding_results if success)
        onboarding_failed = len(onboarding_results) - onboarding_success

        pipeline_success = sum(1 for _, _, success in pipeline_results if success)
        pipeline_failed = len(pipeline_results) - pipeline_success
        pipeline_skipped = len(CUSTOMERS) - len(pipeline_results)

        for tenant_id, _, onboarding_ok in onboarding_results:
            if onboarding_ok:
                print(f"{Colors.GREEN}✓ {tenant_id}: Onboarding succeeded{Colors.NC}")

                # Find pipeline result
                pipeline_ok = any(tid == tenant_id and success for tid, _, success in pipeline_results)
                if pipeline_ok:
                    print(f"{Colors.GREEN}  ✓ Pipeline test succeeded{Colors.NC}")
                else:
                    print(f"{Colors.YELLOW}  ⚠ Pipeline test failed or skipped{Colors.NC}")
            else:
                print(f"{Colors.RED}✗ {tenant_id}: Onboarding failed{Colors.NC}")

        print()
        print(f"{Colors.BLUE}Results:{Colors.NC}")
        print(f"  Onboarding: {Colors.GREEN}{onboarding_success} succeeded{Colors.NC}, {Colors.RED}{onboarding_failed} failed{Colors.NC}")
        print(f"  Pipelines:  {Colors.GREEN}{pipeline_success} succeeded{Colors.NC}, {Colors.YELLOW}{pipeline_failed + pipeline_skipped} failed/skipped{Colors.NC}")
        print()
        print(f"{Colors.YELLOW}Logs saved to: {LOG_DIR}{Colors.NC}")
        print()

        # Exit with error if any onboarding failed
        if onboarding_failed > 0:
            print(f"{Colors.RED}Some onboarding operations failed. Check logs for details.{Colors.NC}")
            return 1

        print(f"{Colors.GREEN}========================================{Colors.NC}")
        print(f"{Colors.GREEN}✓ All tests completed successfully!{Colors.NC}")
        print(f"{Colors.GREEN}========================================{Colors.NC}")
        return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
