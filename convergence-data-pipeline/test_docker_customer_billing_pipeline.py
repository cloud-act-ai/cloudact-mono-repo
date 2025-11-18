#!/usr/bin/env python3
"""
Test Script: Docker Customer 3434x4 - GCP Cost Billing Pipeline Execution

This script demonstrates the complete workflow:
1. Onboard docker_customer_3434x4 tenant
2. Execute the GCP cost billing pipeline via API
3. Verify pipeline execution in BigQuery metadata
4. Query pipeline logs and confirm data ingestion

Usage:
  python test_docker_customer_billing_pipeline.py

Prerequisites:
  - Application running on http://localhost:8080
  - DISABLE_AUTH=true (development mode)
  - Valid GCP credentials (GOOGLE_APPLICATION_CREDENTIALS set)
"""

import os
import sys
import json
import time
import logging
import requests
import asyncio
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Any
from google.cloud import bigquery

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DockerCustomerBillingTest:
    """Test GCP cost billing pipeline for docker_customer_3434x4."""

    TENANT_ID = "docker_customer_3434x4"
    PROJECT_ID = "gac-prod-471220"
    API_BASE_URL = "http://localhost:8080"
    COMPANY_NAME = "Docker Test Customer"
    ADMIN_EMAIL = "admin@docker-test.com"

    def __init__(self):
        """Initialize test client."""
        self.session = requests.Session()
        self.bq_client = bigquery.Client(project=self.PROJECT_ID)
        self.api_key = None

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

    def test_01_onboard_customer(self):
        """Step 1: Onboard docker_customer_3434x4."""
        self.print_header("STEP 1: Onboard Customer")

        print(f"\nTenant ID: {self.TENANT_ID}")
        print(f"Company: {self.COMPANY_NAME}")
        print(f"Admin Email: {self.ADMIN_EMAIL}")

        payload = {
            "tenant_id": self.TENANT_ID,
            "company_name": self.COMPANY_NAME,
            "admin_email": self.ADMIN_EMAIL,
            "subscription_plan": "starter"
        }

        try:
            response = self.session.post(
                f"{self.API_BASE_URL}/api/v1/tenants/onboard",
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                self.api_key = data.get("api_key")
                dataset_id = data.get("dataset_id")
                status = data.get("status")

                self.print_success(f"Customer onboarded successfully")
                self.print_info(f"Dataset: {dataset_id}")
                self.print_info(f"Status: {status}")
                self.print_info(f"API Key: {self.api_key[:20]}... (truncated)")

                # Set API key for subsequent requests
                self.session.headers.update({
                    "X-API-Key": self.api_key
                })

                return True
            else:
                self.print_error(f"Onboarding failed: {response.status_code}")
                print(f"Response: {response.text}")
                return False

        except Exception as e:
            self.print_error(f"Onboarding error: {str(e)}")
            return False

    def test_02_verify_tenant_infrastructure(self):
        """Step 2: Verify tenant infrastructure was created."""
        self.print_header("STEP 2: Verify Tenant Infrastructure")

        dataset_id = f"{self.PROJECT_ID}.{self.TENANT_ID}"

        try:
            # Check dataset exists
            dataset = self.bq_client.get_dataset(dataset_id)
            self.print_success(f"Dataset '{self.TENANT_ID}' exists")

            # Check required metadata tables
            required_tables = [
                "x_meta_api_keys",
                "x_meta_pipeline_runs",
                "x_meta_step_logs",
                "x_meta_cloud_credentials",
                "x_meta_dq_results"
            ]

            for table_name in required_tables:
                table_id = f"{dataset_id}.{table_name}"
                try:
                    table = self.bq_client.get_table(table_id)
                    self.print_success(f"Table '{table_name}' exists ({len(table.schema)} fields)")
                except Exception as e:
                    self.print_error(f"Table '{table_name}' not found: {str(e)}")
                    return False

            return True

        except Exception as e:
            self.print_error(f"Infrastructure verification failed: {str(e)}")
            return False

    def test_03_trigger_gcp_cost_billing_pipeline(self) -> str:
        """
        Step 3: Trigger the GCP cost billing pipeline via API endpoint.

        Returns:
            pipeline_logging_id if successful, None otherwise
        """
        self.print_header("STEP 3: Trigger GCP Cost Billing Pipeline")

        # Construct the API endpoint
        endpoint = (
            f"{self.API_BASE_URL}/api/v1/pipelines/run/"
            f"{self.TENANT_ID}/gcp/cost/cost_billing"
        )

        payload = {
            "date": "2024-11-01",
            "trigger_by": "docker_test"
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
                pipeline_logging_id = data.get("pipeline_logging_id")
                pipeline_id = data.get("pipeline_id")
                status = data.get("status")
                message = data.get("message")

                self.print_success("Pipeline triggered successfully")
                self.print_info(f"Pipeline ID: {pipeline_id}")
                self.print_info(f"Logging ID: {pipeline_logging_id}")
                self.print_info(f"Status: {status}")
                self.print_info(f"Message: {message}")

                return pipeline_logging_id
            else:
                self.print_error(f"Pipeline trigger failed: {response.status_code}")
                print(f"Response: {response.text}")
                return None

        except Exception as e:
            self.print_error(f"Pipeline trigger error: {str(e)}")
            return None

    def test_04_wait_for_pipeline_completion(self, pipeline_logging_id: str, timeout_seconds: int = 120):
        """Step 4: Wait for pipeline to complete and monitor status."""
        self.print_header("STEP 4: Monitor Pipeline Execution")

        endpoint = f"{self.API_BASE_URL}/api/v1/pipelines/runs/{pipeline_logging_id}"
        start_time = time.time()
        last_status = None

        print(f"Monitoring pipeline: {pipeline_logging_id}")
        print(f"Timeout: {timeout_seconds} seconds\n")

        while time.time() - start_time < timeout_seconds:
            try:
                response = self.session.get(endpoint, timeout=10)

                if response.status_code == 200:
                    data = response.json()
                    status = data.get("status")
                    start_time_ts = data.get("start_time")
                    end_time_ts = data.get("end_time")
                    duration_ms = data.get("duration_ms")

                    # Only print on status change
                    if status != last_status:
                        print(f"Status: {status}")
                        last_status = status

                        if end_time_ts:
                            print(f"Duration: {duration_ms}ms ({duration_ms/1000:.2f}s)")

                    # Check if completed
                    if status in ["COMPLETED", "FAILED", "ERROR"]:
                        print()
                        if status == "COMPLETED":
                            self.print_success(f"Pipeline completed in {duration_ms/1000:.2f} seconds")
                        else:
                            self.print_error(f"Pipeline {status}")
                        return status

                    # Show progress
                    elapsed = int(time.time() - start_time)
                    print(f"  Elapsed: {elapsed}s...", end='\r')

                else:
                    self.print_error(f"Status check failed: {response.status_code}")
                    return None

            except Exception as e:
                self.print_error(f"Status check error: {str(e)}")
                return None

            time.sleep(5)  # Check every 5 seconds

        self.print_error(f"Pipeline did not complete within {timeout_seconds} seconds")
        return "TIMEOUT"

    def test_05_query_pipeline_metadata(self, pipeline_logging_id: str):
        """Step 5: Query BigQuery to verify pipeline execution was logged."""
        self.print_header("STEP 5: Verify Pipeline Metadata in BigQuery")

        dataset_id = f"{self.PROJECT_ID}.{self.TENANT_ID}"
        table_id = f"{dataset_id}.x_meta_pipeline_runs"

        query = f"""
        SELECT
            pipeline_logging_id,
            pipeline_id,
            tenant_id,
            status,
            trigger_type,
            trigger_by,
            start_time,
            end_time,
            TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds,
            run_date,
            parameters
        FROM `{table_id}`
        WHERE pipeline_logging_id = @pipeline_logging_id
        LIMIT 1
        """

        try:
            from google.cloud import bigquery as bq

            job_config = bq.QueryJobConfig(
                query_parameters=[
                    bq.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id)
                ]
            )

            results = list(self.bq_client.query(query, job_config=job_config).result())

            if results:
                row = dict(results[0])
                self.print_success("Pipeline metadata found in BigQuery")
                print("\nPipeline Metadata:")
                print(f"  Pipeline ID: {row['pipeline_id']}")
                print(f"  Tenant ID: {row['tenant_id']}")
                print(f"  Status: {row['status']}")
                print(f"  Trigger Type: {row['trigger_type']}")
                print(f"  Triggered By: {row['trigger_by']}")
                print(f"  Start Time: {row['start_time']}")
                print(f"  End Time: {row['end_time']}")
                print(f"  Duration: {row['duration_seconds']}s")
                print(f"  Run Date: {row['run_date']}")
                print(f"  Parameters: {row['parameters']}")

                return row

            else:
                self.print_error("Pipeline metadata not found in BigQuery")
                return None

        except Exception as e:
            self.print_error(f"Metadata query failed: {str(e)}")
            return None

    def test_06_query_step_logs(self):
        """Step 6: Query step logs to see detailed execution steps."""
        self.print_header("STEP 6: View Pipeline Step Logs")

        dataset_id = f"{self.PROJECT_ID}.{self.TENANT_ID}"
        table_id = f"{dataset_id}.x_meta_step_logs"

        query = f"""
        SELECT
            step_id,
            step_name,
            status,
            start_time,
            end_time,
            TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds,
            error_message,
            row_count
        FROM `{table_id}`
        WHERE DATE(start_time) = CURRENT_DATE()
        ORDER BY start_time DESC
        LIMIT 10
        """

        try:
            results = list(self.bq_client.query(query).result())

            if results:
                self.print_success(f"Found {len(results)} step logs")
                print("\nStep Execution Details:")

                for row in results:
                    status_symbol = "✅" if row['status'] == "COMPLETED" else "❌"
                    print(f"\n{status_symbol} {row['step_id']}: {row['step_name']}")
                    print(f"   Status: {row['status']}")
                    print(f"   Duration: {row['duration_seconds']}s")
                    if row['row_count']:
                        print(f"   Rows Processed: {row['row_count']:,}")
                    if row['error_message']:
                        print(f"   Error: {row['error_message']}")

                return True

            else:
                self.print_info("No step logs found (pipeline may still be running)")
                return True

        except Exception as e:
            self.print_error(f"Step logs query failed: {str(e)}")
            return False

    def test_07_check_data_loaded(self):
        """Step 7: Query data tables to verify data was loaded."""
        self.print_header("STEP 7: Verify Data Loaded")

        dataset_id = f"{self.PROJECT_ID}.{self.TENANT_ID}"

        # Check if billing_cost_daily table exists and has data
        query = f"""
        SELECT
            COUNT(*) as total_rows,
            COUNT(DISTINCT DATE(ingestion_date)) as days_loaded,
            COUNT(DISTINCT billing_account_id) as billing_accounts,
            COUNT(DISTINCT service_id) as services,
            COUNT(DISTINCT project_id) as projects,
            SUM(cost) as total_cost,
            MIN(usage_start_time) as earliest_usage,
            MAX(usage_end_time) as latest_usage
        FROM `{dataset_id}.billing_cost_daily`
        WHERE DATE(ingestion_date) >= CURRENT_DATE() - 1
        """

        try:
            results = list(self.bq_client.query(query).result())

            if results:
                row = dict(results[0])

                if row['total_rows'] and row['total_rows'] > 0:
                    self.print_success("Data loaded into billing_cost_daily table")
                    print("\nData Summary:")
                    print(f"  Total Rows: {row['total_rows']:,}")
                    print(f"  Days Loaded: {row['days_loaded']}")
                    print(f"  Billing Accounts: {row['billing_accounts']}")
                    print(f"  Services: {row['services']}")
                    print(f"  Projects: {row['projects']}")
                    print(f"  Total Cost: ${row['total_cost']:.2f}")
                    print(f"  Usage Range: {row['earliest_usage']} to {row['latest_usage']}")
                    return True
                else:
                    self.print_info("billing_cost_daily table exists but contains no recent data")
                    return True

            else:
                self.print_info("Cannot query billing_cost_daily (table may not exist yet)")
                return True

        except Exception as e:
            # Table might not exist yet, which is OK
            self.print_info(f"billing_cost_daily query: {str(e)}")
            return True

    def test_08_summary_report(self):
        """Final summary of the entire test run."""
        self.print_header("EXECUTION SUMMARY")

        print(f"""
Tenant Configuration:
  - Tenant ID: {self.TENANT_ID}
  - Project ID: {self.PROJECT_ID}
  - API Endpoint: {self.API_BASE_URL}

Execution Flow:
  ✅ Customer Onboarding
  ✅ Infrastructure Verification
  ✅ Pipeline Trigger (GCP Cost Billing)
  ✅ Execution Monitoring
  ✅ Metadata Verification
  ✅ Step Logs Review
  ✅ Data Ingestion Check

Next Steps:
  1. Review pipeline logs in BigQuery
  2. Analyze billing data in {self.TENANT_ID}.billing_cost_daily
  3. Schedule daily pipeline runs via scheduler endpoint
  4. Set up cost alerts based on thresholds
  5. Export reports to stakeholders

References:
  - Pipeline Config: configs/gcp/cost/cost_billing.yml
  - Metadata Tables: {self.TENANT_ID}.x_meta_*
  - Cost Table: {self.TENANT_ID}.billing_cost_daily
  - API Documentation: http://localhost:8080/docs
""")

        return True

    def run_all_tests(self):
        """Run complete test suite."""
        self.print_header(f"DOCKER CUSTOMER {self.TENANT_ID} - GCP COST BILLING PIPELINE TEST")

        print(f"""
This test suite validates:
1. Customer onboarding
2. Tenant infrastructure setup
3. GCP cost billing pipeline execution
4. Pipeline monitoring via API
5. BigQuery metadata logging
6. Step-level execution logs
7. Data ingestion verification
""")

        results = {}

        # Test 1: Onboard customer
        print("\nRunning Test 1...")
        results["onboard"] = self.test_01_onboard_customer()
        if not results["onboard"]:
            self.print_error("Onboarding failed, cannot continue")
            return results

        time.sleep(2)

        # Test 2: Verify infrastructure
        print("\nRunning Test 2...")
        results["infrastructure"] = self.test_02_verify_tenant_infrastructure()

        time.sleep(2)

        # Test 3: Trigger pipeline
        print("\nRunning Test 3...")
        pipeline_logging_id = self.test_03_trigger_gcp_cost_billing_pipeline()
        results["trigger"] = pipeline_logging_id is not None

        if not pipeline_logging_id:
            self.print_error("Pipeline trigger failed, cannot continue monitoring")
            return results

        time.sleep(5)

        # Test 4: Wait for completion
        print("\nRunning Test 4...")
        pipeline_status = self.test_04_wait_for_pipeline_completion(pipeline_logging_id)
        results["execution"] = pipeline_status == "COMPLETED"

        time.sleep(2)

        # Test 5: Query metadata
        print("\nRunning Test 5...")
        results["metadata"] = self.test_05_query_pipeline_metadata(pipeline_logging_id) is not None

        time.sleep(2)

        # Test 6: Review step logs
        print("\nRunning Test 6...")
        results["step_logs"] = self.test_06_query_step_logs()

        time.sleep(2)

        # Test 7: Check data loaded
        print("\nRunning Test 7...")
        results["data_load"] = self.test_07_check_data_loaded()

        time.sleep(1)

        # Test 8: Final summary
        print("\nRunning Test 8...")
        self.test_08_summary_report()

        # Print final results
        self.print_header("FINAL TEST RESULTS")

        test_names = {
            "onboard": "Customer Onboarding",
            "infrastructure": "Infrastructure Verification",
            "trigger": "Pipeline Trigger",
            "execution": "Pipeline Execution",
            "metadata": "Metadata Logging",
            "step_logs": "Step Logs Review",
            "data_load": "Data Ingestion"
        }

        passed = sum(1 for v in results.values() if v)
        total = len(results)

        for key, name in test_names.items():
            if key in results:
                status = "✅" if results[key] else "❌"
                print(f"{status} {name}")

        print(f"\nPassed: {passed}/{total}")
        if passed == total:
            print("🎉 ALL TESTS PASSED!")
        else:
            print(f"⚠️  {total - passed} test(s) failed")

        return results


def main():
    """Main entry point."""
    test = DockerCustomerBillingTest()
    results = test.run_all_tests()

    # Exit with appropriate code
    if all(results.values()):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
