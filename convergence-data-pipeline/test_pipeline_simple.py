#!/usr/bin/env python3
"""
Simplified Test: GCP Cost Billing Pipeline Execution

This test demonstrates the complete pipeline workflow using:
- The default tenant (DISABLE_AUTH=true mode)
- Direct API calls to trigger the GCP cost billing pipeline
- Monitoring pipeline execution status
- Verifying metadata logging in BigQuery

Usage:
  python test_pipeline_simple.py

Prerequisites:
  - Application running on http://localhost:8080
  - DISABLE_AUTH=true in .env (development mode)
  - Valid GCP credentials
"""

import os
import json
import time
import logging
import requests
from datetime import datetime, date
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PipelineTest:
    """Test GCP cost billing pipeline execution."""

    def __init__(self):
        # Use default tenant from .env
        env_path = Path(".env")
        self.env_vars = {}
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        key, val = line.strip().split('=', 1)
                        self.env_vars[key.strip()] = val.strip()

        self.tenant_id = self.env_vars.get("DEFAULT_TENANT_ID", "acme1281")
        self.api_base_url = f"http://{self.env_vars.get('API_HOST', 'localhost')}:{self.env_vars.get('API_PORT', '8080')}"
        self.project_id = self.env_vars.get("GCP_PROJECT_ID", "gac-prod-471220")
        self.disable_auth = self.env_vars.get("DISABLE_AUTH", "false").lower() == "true"

        self.session = requests.Session()
        self.pipeline_logging_id = None

    def print_header(self, title: str):
        """Print formatted header."""
        print(f"\n{'='*70}")
        print(f"  {title}")
        print(f"{'='*70}")

    def print_success(self, message: str):
        """Print success message."""
        print(f"✅ {message}")

    def print_error(self, message: str):
        """Print error message."""
        print(f"❌ {message}")

    def print_info(self, message: str):
        """Print info message."""
        print(f"ℹ️  {message}")

    def step_1_verify_setup(self):
        """Step 1: Verify system setup."""
        self.print_header("STEP 1: Verify System Setup")

        print(f"Tenant ID: {self.tenant_id}")
        print(f"Project ID: {self.project_id}")
        print(f"API Base URL: {self.api_base_url}")
        print(f"Auth Disabled: {self.disable_auth}")

        # Check health endpoint
        try:
            response = self.session.get(f"{self.api_base_url}/health", timeout=10)
            if response.status_code == 200:
                health_data = response.json()
                self.print_success(f"API is healthy")
                print(f"  Service: {health_data.get('service')}")
                print(f"  Version: {health_data.get('version')}")
                print(f"  Environment: {health_data.get('environment')}")
                return True
            else:
                self.print_error(f"Health check failed: {response.status_code}")
                return False
        except Exception as e:
            self.print_error(f"Cannot reach API: {str(e)}")
            print(f"  Make sure the application is running at {self.api_base_url}")
            return False

    def step_2_trigger_pipeline(self) -> bool:
        """Step 2: Trigger the GCP cost billing pipeline."""
        self.print_header("STEP 2: Trigger GCP Cost Billing Pipeline")

        # Build the endpoint
        endpoint = (
            f"{self.api_base_url}/api/v1/pipelines/run/"
            f"{self.tenant_id}/gcp/cost/cost_billing"
        )

        # Prepare payload
        payload = {
            "date": "2024-11-01",
            "trigger_by": "simple_test"
        }

        print(f"Endpoint: POST {endpoint}")
        print(f"Payload: {json.dumps(payload, indent=2)}")

        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                self.pipeline_logging_id = data.get("pipeline_logging_id")
                pipeline_id = data.get("pipeline_id")
                status = data.get("status")
                message = data.get("message")

                self.print_success("Pipeline triggered successfully")
                self.print_info(f"Pipeline ID: {pipeline_id}")
                self.print_info(f"Logging ID: {self.pipeline_logging_id}")
                self.print_info(f"Status: {status}")
                self.print_info(f"Message: {message}")

                return True
            else:
                self.print_error(f"Pipeline trigger failed: {response.status_code}")
                print(f"Response: {response.text}")
                return False

        except Exception as e:
            self.print_error(f"Pipeline trigger error: {str(e)}")
            return False

    def step_3_monitor_execution(self, timeout_seconds: int = 180) -> bool:
        """Step 3: Monitor pipeline execution."""
        self.print_header("STEP 3: Monitor Pipeline Execution")

        if not self.pipeline_logging_id:
            self.print_error("No pipeline logging ID - trigger failed")
            return False

        endpoint = f"{self.api_base_url}/api/v1/pipelines/runs/{self.pipeline_logging_id}"
        start_time = time.time()
        last_status = None

        print(f"Monitoring: {self.pipeline_logging_id}")
        print(f"Timeout: {timeout_seconds}s\n")

        while time.time() - start_time < timeout_seconds:
            try:
                response = self.session.get(endpoint, timeout=10)

                if response.status_code == 200:
                    data = response.json()
                    status = data.get("status")
                    duration_ms = data.get("duration_ms")

                    # Only print on status change
                    if status != last_status:
                        elapsed = int(time.time() - start_time)
                        print(f"[{elapsed}s] Status: {status}")
                        last_status = status

                        if duration_ms:
                            print(f"       Duration: {duration_ms}ms ({duration_ms/1000:.2f}s)")

                    # Check if completed
                    if status in ["COMPLETED", "FAILED", "ERROR"]:
                        print()
                        if status == "COMPLETED":
                            duration_s = (duration_ms / 1000) if duration_ms else 0
                            self.print_success(f"Pipeline completed in {duration_s:.2f} seconds")
                        else:
                            self.print_error(f"Pipeline {status}")
                        return status == "COMPLETED"

                else:
                    self.print_error(f"Status check failed: {response.status_code}")
                    return False

            except Exception as e:
                self.print_error(f"Status check error: {str(e)}")
                return False

            time.sleep(5)  # Check every 5 seconds

        self.print_error(f"Pipeline did not complete within {timeout_seconds} seconds")
        return False

    def step_4_query_metadata(self) -> bool:
        """Step 4: Query metadata about the pipeline run."""
        self.print_header("STEP 4: Query Pipeline Metadata")

        if not self.pipeline_logging_id:
            self.print_error("No pipeline logging ID")
            return False

        # Get pipeline run details
        endpoint = f"{self.api_base_url}/api/v1/pipelines/runs/{self.pipeline_logging_id}"

        try:
            response = self.session.get(endpoint, timeout=10)

            if response.status_code == 200:
                data = response.json()

                self.print_success("Retrieved pipeline metadata")
                print("\nPipeline Details:")
                print(f"  Pipeline ID: {data.get('pipeline_id')}")
                print(f"  Tenant ID: {data.get('tenant_id')}")
                print(f"  Status: {data.get('status')}")
                print(f"  Trigger Type: {data.get('trigger_type')}")
                print(f"  Triggered By: {data.get('trigger_by')}")
                print(f"  Start Time: {data.get('start_time')}")
                print(f"  End Time: {data.get('end_time')}")
                if data.get('duration_ms'):
                    print(f"  Duration: {data.get('duration_ms')}ms")

                return True

            else:
                self.print_error(f"Metadata query failed: {response.status_code}")
                return False

        except Exception as e:
            self.print_error(f"Error querying metadata: {str(e)}")
            return False

    def step_5_list_recent_runs(self) -> bool:
        """Step 5: List recent pipeline runs."""
        self.print_header("STEP 5: Recent Pipeline Runs")

        endpoint = f"{self.api_base_url}/api/v1/pipelines/runs?limit=5"

        try:
            response = self.session.get(endpoint, timeout=10)

            if response.status_code == 200:
                runs = response.json()

                self.print_success(f"Found {len(runs)} recent pipeline runs")

                if runs:
                    print("\nRecent Executions:")
                    for i, run in enumerate(runs, 1):
                        status_icon = "✅" if run.get("status") == "COMPLETED" else "⏳"
                        pipeline_id = run.get("pipeline_id")
                        status = run.get("status")
                        print(f"  {i}. {status_icon} {pipeline_id}: {status}")

                return True

            else:
                self.print_error(f"List runs failed: {response.status_code}")
                return False

        except Exception as e:
            self.print_error(f"Error listing runs: {str(e)}")
            return False

    def step_6_summary(self, results: dict):
        """Final summary."""
        self.print_header("EXECUTION SUMMARY")

        print(f"""
Configuration:
  - Tenant: {self.tenant_id}
  - Project: {self.project_id}
  - API: {self.api_base_url}

Test Results:
  ✅ System Setup
  {"✅" if results.get("trigger") else "❌"} Pipeline Trigger
  {"✅" if results.get("execution") else "❌"} Pipeline Execution
  {"✅" if results.get("metadata") else "❌"} Metadata Query
  {"✅" if results.get("list_runs") else "❌"} List Runs

Pipeline Logging ID: {self.pipeline_logging_id}

Next Steps:
  1. Check BigQuery tables: {self.tenant_id}.x_meta_pipeline_runs
  2. View step logs: {self.tenant_id}.x_meta_step_logs
  3. Review cost data: {self.tenant_id}.billing_cost_daily
  4. API Documentation: {self.api_base_url}/docs
""")

    def run_all_tests(self):
        """Run all test steps."""
        self.print_header(f"GCP COST BILLING PIPELINE TEST - {self.tenant_id}")

        results = {}

        # Step 1
        print("\nRunning Step 1...")
        if not self.step_1_verify_setup():
            self.print_error("Setup verification failed, aborting")
            return results

        time.sleep(1)

        # Step 2
        print("\nRunning Step 2...")
        results["trigger"] = self.step_2_trigger_pipeline()

        if not results["trigger"]:
            self.print_error("Pipeline trigger failed")
            return results

        time.sleep(3)

        # Step 3
        print("\nRunning Step 3...")
        results["execution"] = self.step_3_monitor_execution()

        time.sleep(2)

        # Step 4
        print("\nRunning Step 4...")
        results["metadata"] = self.step_4_query_metadata()

        time.sleep(1)

        # Step 5
        print("\nRunning Step 5...")
        results["list_runs"] = self.step_5_list_recent_runs()

        # Step 6
        self.step_6_summary(results)

        return results


def main():
    """Main entry point."""
    test = PipelineTest()

    try:
        results = test.run_all_tests()

        # Check if all critical tests passed
        critical_passed = all([
            results.get("trigger"),
            results.get("execution"),
            results.get("metadata")
        ])

        if critical_passed:
            print("\n🎉 Pipeline test completed successfully!")
            return 0
        else:
            print("\n⚠️  Some tests failed - check output above")
            return 1

    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
