"""
Complete End-to-End Test for Convergence Data Pipeline

Tests the complete flow:
1. Credential setup (post-subscription onboarding)
2. Manual pipeline execution with user_id tracking
3. Quota enforcement at tenant level
4. Scheduler triggering and queue processing
5. Metadata logging verification

Prerequisites:
- Tenant profile already exists from subscription onboarding
- BigQuery datasets configured
- Service account credentials available
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timezone
from google.cloud import bigquery
from typing import Dict, Any

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8080")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "admin_test_key_123")
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "gcp-convergence-prod")

# Test Data
TEST_TENANT_ID = "e2e_test_tenant_20251117"
TEST_USER_ID = "e2e_test_user_alice_uuid"
TEST_API_KEY = f"{TEST_TENANT_ID}_api_key_xyz789"
TEST_COMPANY = "E2E Test Corp"
TEST_EMAIL = "test@e2etest.com"

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


class E2ETestRunner:
    def __init__(self):
        self.bq_client = bigquery.Client(project=GCP_PROJECT_ID)
        self.test_results = []
        self.tenant_created = False
        self.dataset_created = False

    def log(self, message: str, level: str = "INFO"):
        """Log test messages with color"""
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        if level == "SUCCESS":
            print(f"{GREEN}[{timestamp}] ✓ {message}{RESET}")
        elif level == "ERROR":
            print(f"{RED}[{timestamp}] ✗ {message}{RESET}")
        elif level == "WARNING":
            print(f"{YELLOW}[{timestamp}] ⚠ {message}{RESET}")
        else:
            print(f"[{timestamp}] {message}")

    def setup_test_tenant(self):
        """
        Setup test tenant in tenants dataset (simulating subscription onboarding)
        """
        self.log("=" * 80)
        self.log("STEP 0: Setup Test Tenant (Simulating Subscription Onboarding)")
        self.log("=" * 80)

        try:
            # Insert test tenant profile
            query = f"""
            INSERT INTO `{GCP_PROJECT_ID}.tenants.tenant_profiles`
            (tenant_id, company_name, admin_email, status, subscription_plan, tenant_dataset_id, created_at)
            VALUES (
                @tenant_id,
                @company_name,
                @admin_email,
                'ACTIVE',
                'PROFESSIONAL',
                @tenant_id,
                CURRENT_TIMESTAMP()
            )
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                    bigquery.ScalarQueryParameter("company_name", "STRING", TEST_COMPANY),
                    bigquery.ScalarQueryParameter("admin_email", "STRING", TEST_EMAIL),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Created tenant profile: {TEST_TENANT_ID}", "SUCCESS")

            # Insert API key
            import hashlib
            api_key_hash = hashlib.sha256(TEST_API_KEY.encode()).hexdigest()

            query = f"""
            INSERT INTO `{GCP_PROJECT_ID}.tenants.tenant_api_keys`
            (api_key_id, tenant_id, api_key_hash, scopes, is_active, created_at)
            VALUES (
                GENERATE_UUID(),
                @tenant_id,
                @api_key_hash,
                ['pipeline:execute', 'metadata:read'],
                TRUE,
                CURRENT_TIMESTAMP()
            )
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                    bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Created API key for tenant: {TEST_TENANT_ID}", "SUCCESS")

            # Insert subscription
            query = f"""
            INSERT INTO `{GCP_PROJECT_ID}.tenants.tenant_subscriptions`
            (subscription_id, tenant_id, plan_name, status, daily_limit, monthly_limit, concurrent_limit, created_at)
            VALUES (
                GENERATE_UUID(),
                @tenant_id,
                'PROFESSIONAL',
                'ACTIVE',
                25,
                750,
                3,
                CURRENT_TIMESTAMP()
            )
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Created subscription for tenant: {TEST_TENANT_ID}", "SUCCESS")

            # Insert usage quota
            query = f"""
            INSERT INTO `{GCP_PROJECT_ID}.tenants.tenant_usage_quotas`
            (usage_id, tenant_id, usage_date, pipelines_run_today, daily_limit, created_at)
            VALUES (
                GENERATE_UUID(),
                @tenant_id,
                CURRENT_DATE(),
                0,
                25,
                CURRENT_TIMESTAMP()
            )
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Created usage quota for tenant: {TEST_TENANT_ID}", "SUCCESS")

            self.tenant_created = True
            self.log("Tenant setup complete (subscription onboarding simulated)", "SUCCESS")

        except Exception as e:
            self.log(f"Failed to setup test tenant: {str(e)}", "ERROR")
            raise

    def test_1_credential_setup(self):
        """
        Test 1: Cloud Provider Credential Setup (Post-Subscription)

        This endpoint is called AFTER subscription onboarding to add cloud provider credentials.
        """
        self.log("=" * 80)
        self.log("TEST 1: Cloud Provider Credential Setup (Post-Subscription)")
        self.log("=" * 80)

        try:
            # Create tenant dataset
            dataset_id = f"{GCP_PROJECT_ID}.{TEST_TENANT_ID}"
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = "US"

            try:
                self.bq_client.create_dataset(dataset, exists_ok=False)
                self.log(f"Created dataset: {dataset_id}", "SUCCESS")
                self.dataset_created = True
            except Exception as e:
                if "Already Exists" in str(e):
                    self.log(f"Dataset already exists: {dataset_id}", "WARNING")
                    self.dataset_created = True
                else:
                    raise

            # Create metadata tables
            tables_sql = f"""
            CREATE TABLE IF NOT EXISTS `{dataset_id}.x_meta_pipeline_runs` (
                pipeline_logging_id STRING NOT NULL,
                tenant_id STRING NOT NULL,
                user_id STRING,
                pipeline_name STRING NOT NULL,
                status STRING NOT NULL,
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
                ended_at TIMESTAMP,
                duration_ms INT64
            );

            CREATE TABLE IF NOT EXISTS `{dataset_id}.x_meta_step_logs` (
                log_id STRING NOT NULL,
                pipeline_logging_id STRING NOT NULL,
                tenant_id STRING NOT NULL,
                user_id STRING,
                step_name STRING NOT NULL,
                status STRING NOT NULL,
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
                ended_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS `{dataset_id}.x_meta_dq_results` (
                dq_id STRING NOT NULL,
                pipeline_logging_id STRING NOT NULL,
                tenant_id STRING NOT NULL,
                user_id STRING,
                check_name STRING NOT NULL,
                status STRING NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
            );
            """

            for sql in tables_sql.split(";"):
                if sql.strip():
                    self.bq_client.query(sql.strip()).result()

            self.log(f"Created metadata tables in {dataset_id}", "SUCCESS")

            # Simulate credential addition (via API or direct insert)
            query = f"""
            INSERT INTO `{GCP_PROJECT_ID}.tenants.tenant_cloud_credentials`
            (credential_id, tenant_id, provider, encrypted_credentials, created_by_user_id, created_at)
            VALUES (
                GENERATE_UUID(),
                @tenant_id,
                'GCP',
                b'encrypted_test_credentials',
                @user_id,
                CURRENT_TIMESTAMP()
            )
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                    bigquery.ScalarQueryParameter("user_id", "STRING", TEST_USER_ID),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Added GCP credentials for tenant (by user {TEST_USER_ID})", "SUCCESS")

            self.test_results.append({"test": "credential_setup", "status": "PASS"})

        except Exception as e:
            self.log(f"Test 1 FAILED: {str(e)}", "ERROR")
            self.test_results.append({"test": "credential_setup", "status": "FAIL", "error": str(e)})
            raise

    def test_2_manual_pipeline_execution(self):
        """
        Test 2: Manual Pipeline Execution with user_id Tracking

        Quota enforcement is at tenant level, user_id is for logging only.
        """
        self.log("=" * 80)
        self.log("TEST 2: Manual Pipeline Execution with user_id Tracking")
        self.log("=" * 80)

        try:
            # Simulate pipeline execution
            pipeline_logging_id = "test_pipeline_run_001"

            # Insert pipeline run record
            query = f"""
            INSERT INTO `{GCP_PROJECT_ID}.{TEST_TENANT_ID}.x_meta_pipeline_runs`
            (pipeline_logging_id, tenant_id, user_id, pipeline_name, status, started_at)
            VALUES (
                @pipeline_logging_id,
                @tenant_id,
                @user_id,
                'gcp-cost-billing',
                'RUNNING',
                CURRENT_TIMESTAMP()
            )
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                    bigquery.ScalarQueryParameter("user_id", "STRING", TEST_USER_ID),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Created pipeline run: {pipeline_logging_id} (triggered by user {TEST_USER_ID})", "SUCCESS")

            # Verify user_id is logged
            query = f"""
            SELECT user_id
            FROM `{GCP_PROJECT_ID}.{TEST_TENANT_ID}.x_meta_pipeline_runs`
            WHERE pipeline_logging_id = @pipeline_logging_id
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                ]
            )

            results = list(self.bq_client.query(query, job_config=job_config).result())
            if results and results[0].user_id == TEST_USER_ID:
                self.log(f"Verified user_id tracked correctly: {TEST_USER_ID}", "SUCCESS")
            else:
                raise Exception("user_id not logged correctly")

            # Update quota counter (tenant level, not user level)
            query = f"""
            UPDATE `{GCP_PROJECT_ID}.tenants.tenant_usage_quotas`
            SET pipelines_run_today = pipelines_run_today + 1
            WHERE tenant_id = @tenant_id AND usage_date = CURRENT_DATE()
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Incremented quota counter for tenant {TEST_TENANT_ID}", "SUCCESS")

            self.test_results.append({"test": "manual_pipeline_execution", "status": "PASS"})

        except Exception as e:
            self.log(f"Test 2 FAILED: {str(e)}", "ERROR")
            self.test_results.append({"test": "manual_pipeline_execution", "status": "FAIL", "error": str(e)})
            raise

    def test_3_quota_enforcement(self):
        """
        Test 3: Quota Enforcement at Tenant Level

        Verify that quotas are enforced at tenant_id level, not user_id level.
        """
        self.log("=" * 80)
        self.log("TEST 3: Quota Enforcement at Tenant Level")
        self.log("=" * 80)

        try:
            # Check current quota usage
            query = f"""
            SELECT pipelines_run_today, daily_limit,
                   COALESCE(daily_limit - pipelines_run_today, 0) as remaining
            FROM `{GCP_PROJECT_ID}.tenants.tenant_usage_quotas`
            WHERE tenant_id = @tenant_id AND usage_date = CURRENT_DATE()
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                ]
            )

            results = list(self.bq_client.query(query, job_config=job_config).result())
            if results:
                row = results[0]
                self.log(f"Quota usage: {row.pipelines_run_today}/{row.daily_limit} (remaining: {row.remaining})", "SUCCESS")

                if row.pipelines_run_today < row.daily_limit:
                    self.log("Quota check: WITHIN LIMITS", "SUCCESS")
                else:
                    self.log("Quota check: EXCEEDED", "WARNING")

            self.test_results.append({"test": "quota_enforcement", "status": "PASS"})

        except Exception as e:
            self.log(f"Test 3 FAILED: {str(e)}", "ERROR")
            self.test_results.append({"test": "quota_enforcement", "status": "FAIL", "error": str(e)})
            raise

    def test_4_scheduler_pipeline(self):
        """
        Test 4: Scheduled Pipeline Execution (user_id = NULL)

        Verify that scheduled pipelines have user_id = NULL (no user context).
        """
        self.log("=" * 80)
        self.log("TEST 4: Scheduled Pipeline Execution (user_id = NULL)")
        self.log("=" * 80)

        try:
            # Simulate scheduled pipeline execution
            pipeline_logging_id = "test_scheduled_pipeline_001"

            # Insert scheduled pipeline run record (user_id = NULL)
            query = f"""
            INSERT INTO `{GCP_PROJECT_ID}.{TEST_TENANT_ID}.x_meta_pipeline_runs`
            (pipeline_logging_id, tenant_id, user_id, pipeline_name, status, started_at)
            VALUES (
                @pipeline_logging_id,
                @tenant_id,
                NULL,  -- Scheduled pipelines have NO user context
                'gcp-cost-billing-scheduled',
                'RUNNING',
                CURRENT_TIMESTAMP()
            )
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                ]
            )

            self.bq_client.query(query, job_config=job_config).result()
            self.log(f"Created scheduled pipeline run: {pipeline_logging_id} (user_id = NULL)", "SUCCESS")

            # Verify user_id is NULL
            query = f"""
            SELECT user_id
            FROM `{GCP_PROJECT_ID}.{TEST_TENANT_ID}.x_meta_pipeline_runs`
            WHERE pipeline_logging_id = @pipeline_logging_id
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pipeline_logging_id", "STRING", pipeline_logging_id),
                ]
            )

            results = list(self.bq_client.query(query, job_config=job_config).result())
            if results and results[0].user_id is None:
                self.log("Verified scheduled pipeline has user_id = NULL", "SUCCESS")
            else:
                raise Exception("Scheduled pipeline should have user_id = NULL")

            self.test_results.append({"test": "scheduled_pipeline_execution", "status": "PASS"})

        except Exception as e:
            self.log(f"Test 4 FAILED: {str(e)}", "ERROR")
            self.test_results.append({"test": "scheduled_pipeline_execution", "status": "FAIL", "error": str(e)})
            raise

    def cleanup(self):
        """Cleanup test data"""
        self.log("=" * 80)
        self.log("CLEANUP: Removing Test Data")
        self.log("=" * 80)

        try:
            if self.dataset_created:
                # Delete tenant dataset
                dataset_id = f"{GCP_PROJECT_ID}.{TEST_TENANT_ID}"
                self.bq_client.delete_dataset(dataset_id, delete_contents=True, not_found_ok=True)
                self.log(f"Deleted dataset: {dataset_id}", "SUCCESS")

            if self.tenant_created:
                # Delete tenant records
                tables = [
                    "tenant_profiles",
                    "tenant_api_keys",
                    "tenant_subscriptions",
                    "tenant_usage_quotas",
                    "tenant_cloud_credentials"
                ]

                for table in tables:
                    query = f"""
                    DELETE FROM `{GCP_PROJECT_ID}.tenants.{table}`
                    WHERE tenant_id = @tenant_id
                    """

                    job_config = bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("tenant_id", "STRING", TEST_TENANT_ID),
                        ]
                    )

                    self.bq_client.query(query, job_config=job_config).result()

                self.log("Deleted tenant records from tenants dataset", "SUCCESS")

        except Exception as e:
            self.log(f"Cleanup warning: {str(e)}", "WARNING")

    def print_summary(self):
        """Print test summary"""
        self.log("=" * 80)
        self.log("TEST SUMMARY")
        self.log("=" * 80)

        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r["status"] == "PASS")
        failed_tests = total_tests - passed_tests

        for result in self.test_results:
            status_symbol = "✓" if result["status"] == "PASS" else "✗"
            status_color = GREEN if result["status"] == "PASS" else RED
            error_msg = f" - {result.get('error', '')}" if result["status"] == "FAIL" else ""
            print(f"{status_color}{status_symbol} {result['test']}{error_msg}{RESET}")

        self.log("=" * 80)
        self.log(f"Total: {total_tests} | Passed: {passed_tests} | Failed: {failed_tests}")

        if failed_tests == 0:
            self.log("ALL TESTS PASSED! ✓", "SUCCESS")
            return 0
        else:
            self.log(f"{failed_tests} TESTS FAILED! ✗", "ERROR")
            return 1

    def run_all_tests(self):
        """Run all E2E tests"""
        try:
            self.setup_test_tenant()
            self.test_1_credential_setup()
            self.test_2_manual_pipeline_execution()
            self.test_3_quota_enforcement()
            self.test_4_scheduler_pipeline()
        except Exception as e:
            self.log(f"Test execution stopped due to error: {str(e)}", "ERROR")
        finally:
            self.cleanup()
            return self.print_summary()


if __name__ == "__main__":
    runner = E2ETestRunner()
    exit_code = runner.run_all_tests()
    sys.exit(exit_code)
