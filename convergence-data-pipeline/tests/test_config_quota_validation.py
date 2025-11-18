#!/usr/bin/env python3
"""
Test 2: Quota Enforcement Validation with JSON Config

This script tests:
1. Loading quota test config from JSON
2. Executing multiple pipelines to test quota limits
3. Verifying quota enforcement via BigQuery tenants.tenant_usage_quotas table
4. Testing daily, monthly, and concurrent limits
5. Using temporary logs folder

Usage:
    python tests/test_config_quota_validation.py
"""

import requests
import json
import time
import os
import tempfile
import asyncio
from datetime import datetime
from pathlib import Path
from google.cloud import bigquery

# Test configuration
CONFIG_FILE = Path(__file__).parent / "configs" / "tenants" / "quota_test_config.json"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'


def log(message, level="INFO", log_file=None):
    """Print colored log message and optionally write to file"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if level == "SUCCESS":
        formatted = f"{Colors.GREEN}[{timestamp}] ✓ {message}{Colors.RESET}"
    elif level == "ERROR":
        formatted = f"{Colors.RED}[{timestamp}] ✗ {message}{Colors.RESET}"
    elif level == "WARNING":
        formatted = f"{Colors.YELLOW}[{timestamp}] ⚠ {message}{Colors.RESET}"
    else:
        formatted = f"{Colors.BLUE}[{timestamp}] {message}{Colors.RESET}"

    print(formatted)

    if log_file:
        with open(log_file, 'a') as f:
            f.write(f"[{timestamp}] [{level}] {message}\n")


def load_config():
    """Load quota test configuration from JSON"""
    log(f"Loading config from {CONFIG_FILE}")

    if not CONFIG_FILE.exists():
        log(f"Config file not found: {CONFIG_FILE}", "ERROR")
        return None

    with open(CONFIG_FILE) as f:
        config = json.load(f)

    log(f"Loaded config with {len(config['test_tenants'])} test tenants", "SUCCESS")
    log(f"Subscription plans: {', '.join(config['subscription_plans'].keys())}", "INFO")
    return config


def onboard_test_tenants(config, log_file):
    """Onboard all test tenants"""
    log("=" * 80)
    log("Onboarding Test Tenants", "INFO", log_file)
    log("=" * 80)

    api_base = config['api_base']
    timeout = config['test_settings']['timeout_seconds']
    onboarded = {}

    for tenant in config['test_tenants']:
        tenant_id = tenant['tenant_id']
        log(f"\nOnboarding: {tenant_id} ({tenant['subscription_plan']})", "INFO", log_file)

        try:
            response = requests.post(
                f"{api_base}/api/v1/tenants/onboard",
                json={
                    "tenant_id": tenant['tenant_id'],
                    "company_name": tenant['company_name'],
                    "admin_email": tenant['admin_email'],
                    "subscription_plan": tenant['subscription_plan']
                },
                timeout=timeout
            )

            if response.status_code in [200, 201]:
                data = response.json()
                api_key = data.get('api_key')
                log(f"  ✓ Onboarded successfully", "SUCCESS", log_file)
                log(f"  ✓ API Key: {api_key[:30]}...", "SUCCESS", log_file)

                onboarded[tenant_id] = {
                    "api_key": api_key,
                    "subscription_plan": tenant['subscription_plan']
                }
            else:
                log(f"  ✗ Onboarding failed: {response.status_code}", "ERROR", log_file)
                log(f"  ✗ Response: {response.text[:200]}", "ERROR", log_file)

        except Exception as e:
            log(f"  ✗ Exception: {str(e)}", "ERROR", log_file)

        time.sleep(1)

    return onboarded


def get_quota_from_bigquery(tenant_id, project_id, log_file):
    """Get current quota usage from BigQuery"""
    try:
        client = bigquery.Client(project=project_id)

        query = f"""
        SELECT
            tenant_id,
            usage_date,
            pipelines_run_today,
            pipelines_succeeded_today,
            pipelines_failed_today,
            pipelines_run_month,
            concurrent_pipelines_running,
            daily_limit,
            monthly_limit,
            concurrent_limit,
            max_concurrent_reached
        FROM `{project_id}.tenants.tenant_usage_quotas`
        WHERE tenant_id = @tenant_id
        ORDER BY usage_date DESC
        LIMIT 1
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        result = client.query(query, job_config=job_config).result()

        for row in result:
            quota_info = {
                "tenant_id": row.tenant_id,
                "usage_date": str(row.usage_date),
                "pipelines_run_today": row.pipelines_run_today,
                "pipelines_succeeded_today": row.pipelines_succeeded_today,
                "pipelines_failed_today": row.pipelines_failed_today,
                "pipelines_run_month": row.pipelines_run_month,
                "concurrent_pipelines_running": row.concurrent_pipelines_running,
                "daily_limit": row.daily_limit,
                "monthly_limit": row.monthly_limit,
                "concurrent_limit": row.concurrent_limit,
                "max_concurrent_reached": row.max_concurrent_reached
            }
            log(f"  Quota: {row.pipelines_run_today}/{row.daily_limit} daily, "
                f"{row.pipelines_run_month}/{row.monthly_limit} monthly, "
                f"{row.concurrent_pipelines_running}/{row.concurrent_limit} concurrent",
                "INFO", log_file)
            return quota_info

        log(f"  ✗ No quota record found for {tenant_id}", "ERROR", log_file)
        return None

    except Exception as e:
        log(f"  ✗ BigQuery quota query error: {str(e)}", "ERROR", log_file)
        return None


def execute_pipeline(config, tenant_id, api_key, run_number, log_file):
    """Execute a single pipeline run"""
    api_base = config['api_base']
    timeout = config['test_settings']['timeout_seconds']
    pipeline_cfg = config['pipeline_config']

    endpoint = f"{api_base}/api/v1/pipelines/run/{tenant_id}/{pipeline_cfg['provider']}/{pipeline_cfg['domain']}/{pipeline_cfg['template']}"

    try:
        response = requests.post(
            endpoint,
            headers={"X-API-Key": api_key},
            json={"date": pipeline_cfg['default_date']},
            timeout=timeout
        )

        if response.status_code == 200:
            data = response.json()
            log(f"  Run #{run_number}: ✓ SUCCESS (pipeline_logging_id: {data.get('pipeline_logging_id', 'N/A')[:20]}...)",
                "SUCCESS", log_file)
            return {"success": True, "run_number": run_number, "response": data}
        elif response.status_code == 429:
            log(f"  Run #{run_number}: ✗ QUOTA EXCEEDED (429)", "WARNING", log_file)
            return {"success": False, "run_number": run_number, "error": "QUOTA_EXCEEDED", "status_code": 429}
        else:
            log(f"  Run #{run_number}: ✗ FAILED ({response.status_code})", "ERROR", log_file)
            return {"success": False, "run_number": run_number, "error": response.text[:100], "status_code": response.status_code}

    except Exception as e:
        log(f"  Run #{run_number}: ✗ EXCEPTION ({str(e)})", "ERROR", log_file)
        return {"success": False, "run_number": run_number, "error": str(e)}


def test_daily_limit_enforcement(config, onboarded_tenants, log_file):
    """Test daily quota limit enforcement"""
    log("\n" + "=" * 80)
    log("Test 1: Daily Limit Enforcement", "INFO", log_file)
    log("=" * 80)

    scenario = config['test_scenarios']['daily_limit_test']
    target_plan = scenario['target_plan']
    test_runs = scenario['test_runs']
    expected_successful = scenario['expected_successful']
    expected_rejected = scenario['expected_rejected']

    # Find tenant with target plan
    tenant_id = None
    api_key = None
    for tid, info in onboarded_tenants.items():
        if info['subscription_plan'] == target_plan:
            tenant_id = tid
            api_key = info['api_key']
            break

    if not tenant_id:
        log(f"No tenant found with plan {target_plan}", "ERROR", log_file)
        return False

    log(f"Testing tenant: {tenant_id} (Plan: {target_plan})", "INFO", log_file)
    log(f"Executing {test_runs} pipeline runs...", "INFO", log_file)

    # Get initial quota
    log("\nInitial quota state:", "INFO", log_file)
    initial_quota = get_quota_from_bigquery(tenant_id, config['project_id'], log_file)

    # Execute pipelines
    results = []
    for i in range(1, test_runs + 1):
        result = execute_pipeline(config, tenant_id, api_key, i, log_file)
        results.append(result)
        time.sleep(0.5)  # Small delay between runs

    # Get final quota
    log("\nFinal quota state:", "INFO", log_file)
    final_quota = get_quota_from_bigquery(tenant_id, config['project_id'], log_file)

    # Analyze results
    successful = sum(1 for r in results if r['success'])
    quota_exceeded = sum(1 for r in results if not r['success'] and r.get('status_code') == 429)

    log("\n" + "-" * 80, "INFO", log_file)
    log(f"Results:", "INFO", log_file)
    log(f"  Total runs attempted: {test_runs}", "INFO", log_file)
    log(f"  Successful: {successful}", "INFO", log_file)
    log(f"  Quota exceeded (429): {quota_exceeded}", "INFO", log_file)
    log(f"  Expected successful: {expected_successful}", "INFO", log_file)
    log(f"  Expected rejected: {expected_rejected}", "INFO", log_file)

    # Validation
    test_passed = (successful == expected_successful and quota_exceeded == expected_rejected)

    if test_passed:
        log("\n✓ Daily limit enforcement test PASSED!", "SUCCESS", log_file)
    else:
        log("\n✗ Daily limit enforcement test FAILED!", "ERROR", log_file)

    return test_passed


def test_monthly_quota_accumulation(config, onboarded_tenants, log_file):
    """Test monthly quota accumulation"""
    log("\n" + "=" * 80)
    log("Test 2: Monthly Quota Accumulation", "INFO", log_file)
    log("=" * 80)

    scenario = config['test_scenarios']['monthly_limit_test']
    target_plan = scenario['target_plan']
    runs_per_day = scenario['runs_per_day']

    # Find tenant with target plan
    tenant_id = None
    api_key = None
    for tid, info in onboarded_tenants.items():
        if info['subscription_plan'] == target_plan:
            tenant_id = tid
            api_key = info['api_key']
            break

    if not tenant_id:
        log(f"No tenant found with plan {target_plan}", "ERROR", log_file)
        return False

    log(f"Testing tenant: {tenant_id} (Plan: {target_plan})", "INFO", log_file)
    log(f"Executing {runs_per_day} pipeline runs to verify monthly accumulation...", "INFO", log_file)

    # Get initial quota
    log("\nInitial quota state:", "INFO", log_file)
    initial_quota = get_quota_from_bigquery(tenant_id, config['project_id'], log_file)
    initial_monthly = initial_quota['pipelines_run_month'] if initial_quota else 0

    # Execute pipelines
    successful_runs = 0
    for i in range(1, runs_per_day + 1):
        result = execute_pipeline(config, tenant_id, api_key, i, log_file)
        if result['success']:
            successful_runs += 1
        time.sleep(0.5)

    # Get final quota
    log("\nFinal quota state:", "INFO", log_file)
    final_quota = get_quota_from_bigquery(tenant_id, config['project_id'], log_file)
    final_monthly = final_quota['pipelines_run_month'] if final_quota else 0

    # Validation
    monthly_increase = final_monthly - initial_monthly
    test_passed = (monthly_increase == successful_runs)

    log("\n" + "-" * 80, "INFO", log_file)
    log(f"Results:", "INFO", log_file)
    log(f"  Initial monthly count: {initial_monthly}", "INFO", log_file)
    log(f"  Final monthly count: {final_monthly}", "INFO", log_file)
    log(f"  Monthly increase: {monthly_increase}", "INFO", log_file)
    log(f"  Successful runs: {successful_runs}", "INFO", log_file)

    if test_passed:
        log("\n✓ Monthly quota accumulation test PASSED!", "SUCCESS", log_file)
    else:
        log("\n✗ Monthly quota accumulation test FAILED!", "ERROR", log_file)

    return test_passed


def test_quota_table_integrity(config, onboarded_tenants, log_file):
    """Verify quota table has correct data for all tenants"""
    log("\n" + "=" * 80)
    log("Test 3: Quota Table Integrity", "INFO", log_file)
    log("=" * 80)

    project_id = config['project_id']
    all_passed = True

    for tenant_id, info in onboarded_tenants.items():
        log(f"\nVerifying quota for: {tenant_id}", "INFO", log_file)

        quota = get_quota_from_bigquery(tenant_id, project_id, log_file)

        if not quota:
            log(f"  ✗ No quota record found", "ERROR", log_file)
            all_passed = False
            continue

        # Get expected limits from config
        plan = info['subscription_plan']
        expected_limits = config['subscription_plans'][plan]

        # Validate limits
        limits_match = (
            quota['daily_limit'] == expected_limits['daily_limit'] and
            quota['monthly_limit'] == expected_limits['monthly_limit'] and
            quota['concurrent_limit'] == expected_limits['concurrent_limit']
        )

        if limits_match:
            log(f"  ✓ Quota limits match plan {plan}", "SUCCESS", log_file)
        else:
            log(f"  ✗ Quota limits mismatch!", "ERROR", log_file)
            log(f"    Expected: daily={expected_limits['daily_limit']}, "
                f"monthly={expected_limits['monthly_limit']}, "
                f"concurrent={expected_limits['concurrent_limit']}", "ERROR", log_file)
            log(f"    Got: daily={quota['daily_limit']}, "
                f"monthly={quota['monthly_limit']}, "
                f"concurrent={quota['concurrent_limit']}", "ERROR", log_file)
            all_passed = False

    if all_passed:
        log("\n✓ Quota table integrity test PASSED!", "SUCCESS", log_file)
    else:
        log("\n✗ Quota table integrity test FAILED!", "ERROR", log_file)

    return all_passed


def cleanup_test_tenants(config, onboarded_tenants, log_file):
    """Cleanup test tenants if configured"""
    if not config['test_settings']['cleanup_after_test']:
        log("\nCleanup disabled in config", "WARNING", log_file)
        return

    log("\n" + "=" * 80)
    log("Cleaning up test tenants", "INFO", log_file)
    log("=" * 80)

    project_id = config['project_id']
    client = bigquery.Client(project=project_id)

    for tenant_id in onboarded_tenants.keys():
        try:
            # Delete tenant dataset
            dataset_id = f"{project_id}.{tenant_id}"
            client.delete_dataset(dataset_id, delete_contents=True, not_found_ok=True)
            log(f"  ✓ Deleted dataset: {tenant_id}", "SUCCESS", log_file)
        except Exception as e:
            log(f"  ✗ Failed to delete dataset {tenant_id}: {str(e)}", "ERROR", log_file)


def main():
    """Main test execution"""
    # Setup temporary logs folder
    temp_log_dir = config.get('test_settings', {}).get('temp_log_dir', '/tmp/convergence-tests')
    os.makedirs(temp_log_dir, exist_ok=True)
    log_file = os.path.join(temp_log_dir, f"test_quota_{int(time.time())}.log")

    log(f"Temporary logs folder: {temp_log_dir}")
    log(f"Log file: {log_file}")

    try:
        # Load configuration
        global config
        config = load_config()
        if not config:
            log("Failed to load configuration", "ERROR", log_file)
            return False

        # Onboard test tenants
        onboarded_tenants = onboard_test_tenants(config, log_file)
        if not onboarded_tenants:
            log("No tenants were onboarded", "ERROR", log_file)
            return False

        log(f"\n✓ {len(onboarded_tenants)} tenants onboarded successfully", "SUCCESS", log_file)

        # Wait for initial quota setup
        log("\nWaiting for quota initialization...", "INFO", log_file)
        time.sleep(3)

        # Run tests
        test_results = {}

        test_results['daily_limit'] = test_daily_limit_enforcement(config, onboarded_tenants, log_file)
        test_results['monthly_accumulation'] = test_monthly_quota_accumulation(config, onboarded_tenants, log_file)
        test_results['table_integrity'] = test_quota_table_integrity(config, onboarded_tenants, log_file)

        # Print summary
        log("\n" + "=" * 80)
        log("Test Summary", "INFO", log_file)
        log("=" * 80)

        for test_name, passed in test_results.items():
            status = "PASSED" if passed else "FAILED"
            level = "SUCCESS" if passed else "ERROR"
            log(f"  {test_name}: {status}", level, log_file)

        total_tests = len(test_results)
        passed_tests = sum(1 for p in test_results.values() if p)
        failed_tests = total_tests - passed_tests

        log(f"\nTotal: {total_tests} | Passed: {passed_tests} | Failed: {failed_tests}", "INFO", log_file)

        if failed_tests == 0:
            log("\n✓ All quota validation tests PASSED!", "SUCCESS", log_file)
        else:
            log(f"\n✗ {failed_tests} quota validation test(s) FAILED!", "ERROR", log_file)

        # Cleanup
        # cleanup_test_tenants(config, onboarded_tenants, log_file)
        log(f"\nLogs saved to: {log_file}", "INFO")

        return failed_tests == 0

    except Exception as e:
        log(f"Test execution failed: {str(e)}", "ERROR", log_file)
        import traceback
        log(traceback.format_exc(), "ERROR", log_file)
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
