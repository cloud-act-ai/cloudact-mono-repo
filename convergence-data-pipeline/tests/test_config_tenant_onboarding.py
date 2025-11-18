#!/usr/bin/env python3
"""
Test 1: Tenant Onboarding with JSON Config

This script tests:
1. Loading tenant config from JSON
2. Onboarding tenants via API
3. Verifying tenant creation in BigQuery
4. Using temporary logs folder

Usage:
    python tests/test_config_tenant_onboarding.py
"""

import requests
import json
import time
import os
import tempfile
from datetime import datetime
from pathlib import Path
from google.cloud import bigquery

# Test configuration
CONFIG_FILE = Path(__file__).parent / "configs" / "tenants" / "tenant_test_config.json"

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
    """Load tenant test configuration from JSON"""
    log(f"Loading config from {CONFIG_FILE}")

    if not CONFIG_FILE.exists():
        log(f"Config file not found: {CONFIG_FILE}", "ERROR")
        return None

    with open(CONFIG_FILE) as f:
        config = json.load(f)

    log(f"Loaded config with {len(config['test_tenants'])} test tenants", "SUCCESS")
    return config


def test_tenant_onboarding(config, log_file):
    """Test tenant onboarding API with config"""
    log("=" * 80)
    log("Testing Tenant Onboarding with JSON Config", "INFO", log_file)
    log("=" * 80)

    api_base = config['api_base']
    project_id = config['project_id']
    timeout = config['test_settings']['timeout_seconds']

    results = []

    for tenant in config['test_tenants']:
        tenant_id = tenant['tenant_id']
        log(f"\nOnboarding: {tenant_id}", "INFO", log_file)

        try:
            # Call onboarding API
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
                log(f"  ✓ API Response: {response.status_code}", "SUCCESS", log_file)
                log(f"  ✓ API Key: {data.get('api_key', 'N/A')[:30]}...", "SUCCESS", log_file)
                log(f"  ✓ Dataset Created: {data.get('dataset_created', False)}", "SUCCESS", log_file)

                # Verify in BigQuery
                if config['test_settings']['verify_in_bigquery']:
                    verified = verify_tenant_in_bigquery(tenant_id, project_id, log_file)
                    if verified:
                        log(f"  ✓ BigQuery verification passed", "SUCCESS", log_file)
                    else:
                        log(f"  ✗ BigQuery verification failed", "ERROR", log_file)

                results.append({
                    "tenant_id": tenant_id,
                    "success": True,
                    "api_key": data.get('api_key')
                })
            else:
                log(f"  ✗ Onboarding failed: {response.status_code}", "ERROR", log_file)
                log(f"  ✗ Response: {response.text[:200]}", "ERROR", log_file)
                results.append({
                    "tenant_id": tenant_id,
                    "success": False,
                    "error": response.text
                })

        except Exception as e:
            log(f"  ✗ Exception: {str(e)}", "ERROR", log_file)
            results.append({
                "tenant_id": tenant_id,
                "success": False,
                "error": str(e)
            })

        time.sleep(1)  # Rate limiting

    return results


def verify_tenant_in_bigquery(tenant_id, project_id, log_file):
    """Verify tenant exists in BigQuery central tenants dataset"""
    try:
        client = bigquery.Client(project=project_id)

        # Check tenant_profiles
        query = f"""
        SELECT tenant_id, company_name, status
        FROM `{project_id}.tenants.tenant_profiles`
        WHERE tenant_id = @tenant_id
        LIMIT 1
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        result = client.query(query, job_config=job_config).result()

        for row in result:
            log(f"  ✓ Found in tenant_profiles: {row.tenant_id}", "SUCCESS", log_file)
            return True

        log(f"  ✗ Not found in tenant_profiles", "ERROR", log_file)
        return False

    except Exception as e:
        log(f"  ✗ BigQuery verification error: {str(e)}", "ERROR", log_file)
        return False


def cleanup_test_tenants(config, log_file):
    """Cleanup test tenants if configured"""
    if not config['test_settings']['cleanup_after_test']:
        log("Cleanup disabled in config", "WARNING", log_file)
        return

    log("\n" + "=" * 80)
    log("Cleaning up test tenants", "INFO", log_file)
    log("=" * 80)

    project_id = config['project_id']
    client = bigquery.Client(project=project_id)

    for tenant in config['test_tenants']:
        tenant_id = tenant['tenant_id']

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
    temp_log_dir = tempfile.mkdtemp(prefix="convergence_test_")
    log_file = os.path.join(temp_log_dir, f"test_onboarding_{int(time.time())}.log")

    log(f"Temporary logs folder: {temp_log_dir}")
    log(f"Log file: {log_file}")

    try:
        # Load configuration
        config = load_config()
        if not config:
            log("Failed to load configuration", "ERROR", log_file)
            return False

        # Run tests
        results = test_tenant_onboarding(config, log_file)

        # Print summary
        log("\n" + "=" * 80)
        log("Test Summary", "INFO", log_file)
        log("=" * 80)

        successes = sum(1 for r in results if r['success'])
        failures = len(results) - successes

        log(f"Total: {len(results)} | Success: {successes} | Failed: {failures}", "INFO", log_file)

        if failures == 0:
            log("All tests PASSED", "SUCCESS", log_file)
        else:
            log(f"{failures} tests FAILED", "ERROR", log_file)

        # Cleanup
        # cleanup_test_tenants(config, log_file)
        log(f"\nLogs saved to: {log_file}", "INFO")

        return failures == 0

    except Exception as e:
        log(f"Test execution failed: {str(e)}", "ERROR", log_file)
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
