#!/usr/bin/env python3
"""
Test 2: Pipeline Execution with JSON Config

This script tests:
1. Loading pipeline config from JSON
2. Executing pipelines via API
3. Verifying pipeline execution in BigQuery
4. Using temporary logs folder

Usage:
    python tests/test_config_pipeline_execution.py
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
CONFIG_FILE = Path(__file__).parent / "configs" / "pipelines" / "pipeline_test_config.json"

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
    """Load pipeline test configuration from JSON"""
    log(f"Loading config from {CONFIG_FILE}")

    if not CONFIG_FILE.exists():
        log(f"Config file not found: {CONFIG_FILE}", "ERROR")
        return None

    with open(CONFIG_FILE) as f:
        config = json.load(f)

    log(f"Loaded config with {len(config['test_pipelines'])} test pipelines", "SUCCESS")
    return config


def get_tenant_api_key(tenant_id, project_id, log_file):
    """Retrieve API key for a tenant from BigQuery"""
    try:
        client = bigquery.Client(project=project_id)

        query = f"""
        SELECT api_key
        FROM `{project_id}.tenants.tenant_api_keys`
        WHERE tenant_id = @tenant_id
          AND is_active = true
        LIMIT 1
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        result = client.query(query, job_config=job_config).result()

        for row in result:
            log(f"  ✓ Retrieved API key for tenant: {tenant_id}", "SUCCESS", log_file)
            return row.api_key

        log(f"  ✗ API key not found for tenant: {tenant_id}", "ERROR", log_file)
        return None

    except Exception as e:
        log(f"  ✗ Failed to retrieve API key: {str(e)}", "ERROR", log_file)
        return None


def test_pipeline_execution(config, log_file):
    """Test pipeline execution API with config"""
    log("=" * 80)
    log("Testing Pipeline Execution with JSON Config", "INFO", log_file)
    log("=" * 80)

    api_base = config['api_base']
    project_id = config['project_id']
    timeout = config['test_settings']['timeout_seconds']

    results = []

    for pipeline in config['test_pipelines']:
        pipeline_name = pipeline['pipeline_name']
        provider = pipeline['provider']
        domain = pipeline['domain']
        template = pipeline['template']
        tenant_id = pipeline['test_tenant_id']
        parameters = pipeline.get('parameters', {})

        log(f"\nExecuting pipeline: {pipeline_name}", "INFO", log_file)
        log(f"  Provider: {provider}, Domain: {domain}, Template: {template}", "INFO", log_file)
        log(f"  Tenant: {tenant_id}", "INFO", log_file)

        try:
            # Get tenant API key
            api_key = get_tenant_api_key(tenant_id, project_id, log_file)
            if not api_key:
                log(f"  ✗ Cannot execute pipeline without API key", "ERROR", log_file)
                results.append({
                    "pipeline_name": pipeline_name,
                    "tenant_id": tenant_id,
                    "success": False,
                    "error": "API key not found"
                })
                continue

            # Call pipeline execution API
            url = f"{api_base}/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}"
            response = requests.post(
                url,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json"
                },
                json=parameters,
                timeout=timeout
            )

            if response.status_code in [200, 201]:
                data = response.json()
                pipeline_logging_id = data.get('pipeline_logging_id')
                status_msg = data.get('status', 'UNKNOWN')

                log(f"  ✓ API Response: {response.status_code}", "SUCCESS", log_file)
                log(f"  ✓ Pipeline Logging ID: {pipeline_logging_id}", "SUCCESS", log_file)
                log(f"  ✓ Status: {status_msg}", "SUCCESS", log_file)

                # Wait a bit for pipeline to start
                time.sleep(2)

                # Verify in BigQuery
                if config['test_settings']['verify_execution']:
                    verified = verify_pipeline_in_bigquery(
                        pipeline_logging_id,
                        tenant_id,
                        project_id,
                        log_file
                    )
                    if verified:
                        log(f"  ✓ BigQuery verification passed", "SUCCESS", log_file)
                    else:
                        log(f"  ✗ BigQuery verification failed", "ERROR", log_file)

                results.append({
                    "pipeline_name": pipeline_name,
                    "tenant_id": tenant_id,
                    "pipeline_logging_id": pipeline_logging_id,
                    "success": True,
                    "status": status_msg
                })
            else:
                log(f"  ✗ Pipeline execution failed: {response.status_code}", "ERROR", log_file)
                log(f"  ✗ Response: {response.text[:200]}", "ERROR", log_file)
                results.append({
                    "pipeline_name": pipeline_name,
                    "tenant_id": tenant_id,
                    "success": False,
                    "error": response.text
                })

        except Exception as e:
            log(f"  ✗ Exception: {str(e)}", "ERROR", log_file)
            results.append({
                "pipeline_name": pipeline_name,
                "tenant_id": tenant_id,
                "success": False,
                "error": str(e)
            })

        time.sleep(1)  # Rate limiting

    return results


def verify_pipeline_in_bigquery(pipeline_logging_id, tenant_id, project_id, log_file):
    """Verify pipeline execution exists in BigQuery x_meta_pipeline_runs table"""
    try:
        client = bigquery.Client(project=project_id)

        # Check centralized x_meta_pipeline_runs table
        query = f"""
        SELECT
            pipeline_logging_id,
            pipeline_id,
            tenant_id,
            status,
            trigger_type,
            trigger_by,
            start_time
        FROM `{project_id}.tenants.x_meta_pipeline_runs`
        WHERE pipeline_logging_id = @pipeline_logging_id
          AND tenant_id = @tenant_id
        LIMIT 1
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        result = client.query(query, job_config=job_config).result()

        for row in result:
            log(f"  ✓ Found in x_meta_pipeline_runs:", "SUCCESS", log_file)
            log(f"    - Pipeline ID: {row.pipeline_id}", "SUCCESS", log_file)
            log(f"    - Status: {row.status}", "SUCCESS", log_file)
            log(f"    - Trigger: {row.trigger_type} by {row.trigger_by}", "SUCCESS", log_file)
            log(f"    - Start Time: {row.start_time}", "SUCCESS", log_file)
            return True

        log(f"  ✗ Not found in x_meta_pipeline_runs", "ERROR", log_file)
        return False

    except Exception as e:
        log(f"  ✗ BigQuery verification error: {str(e)}", "ERROR", log_file)
        return False


def check_pipeline_logs(config, results, log_file):
    """Check detailed step logs for executed pipelines"""
    if not config['test_settings']['check_bigquery_logs']:
        log("BigQuery logs check disabled in config", "WARNING", log_file)
        return

    log("\n" + "=" * 80)
    log("Checking Pipeline Step Logs", "INFO", log_file)
    log("=" * 80)

    project_id = config['project_id']
    client = bigquery.Client(project=project_id)

    for result in results:
        if not result.get('success'):
            continue

        pipeline_logging_id = result.get('pipeline_logging_id')
        tenant_id = result.get('tenant_id')

        if not pipeline_logging_id:
            continue

        try:
            # Check tenant-specific step logs
            query = f"""
            SELECT
                step_id,
                status,
                start_time,
                end_time,
                duration_ms
            FROM `{project_id}.{tenant_id}.x_meta_step_logs`
            WHERE pipeline_logging_id = @pipeline_logging_id
            ORDER BY start_time
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id)
                ]
            )

            step_results = client.query(query, job_config=job_config).result()
            step_count = 0

            log(f"\nPipeline: {result['pipeline_name']} ({pipeline_logging_id})", "INFO", log_file)

            for step in step_results:
                step_count += 1
                duration = f"{step.duration_ms}ms" if step.duration_ms else "N/A"
                log(f"  Step {step_count}: {step.step_id}", "INFO", log_file)
                log(f"    Status: {step.status}, Duration: {duration}", "INFO", log_file)

            if step_count == 0:
                log(f"  ⚠ No step logs found yet (pipeline may still be running)", "WARNING", log_file)
            else:
                log(f"  ✓ Found {step_count} step logs", "SUCCESS", log_file)

        except Exception as e:
            log(f"  ✗ Failed to check logs: {str(e)}", "ERROR", log_file)


def main():
    """Main test execution"""
    # Setup temporary logs folder from config or fallback to temp dir
    config = load_config()
    if not config:
        print("Failed to load configuration")
        return False

    temp_log_dir = config.get('test_settings', {}).get('temp_log_dir')
    if temp_log_dir:
        os.makedirs(temp_log_dir, exist_ok=True)
    else:
        temp_log_dir = tempfile.mkdtemp(prefix="convergence_test_")

    log_file = os.path.join(temp_log_dir, f"test_pipeline_execution_{int(time.time())}.log")

    log(f"Temporary logs folder: {temp_log_dir}")
    log(f"Log file: {log_file}")

    try:
        # Run tests
        results = test_pipeline_execution(config, log_file)

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

        # Check pipeline logs
        check_pipeline_logs(config, results, log_file)

        log(f"\nLogs saved to: {log_file}", "INFO")

        return failures == 0

    except Exception as e:
        log(f"Test execution failed: {str(e)}", "ERROR", log_file)
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
