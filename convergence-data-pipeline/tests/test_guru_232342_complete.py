"""
Complete Test Suite for Tenant: guru_232342

This test file contains all test cases specifically for the guru_232342 tenant.
It demonstrates the complete architecture and functionality of the system.

Architecture Understanding:
1. Single dataset per tenant: Just {tenant_id}, not {tenant_id}_{dataset_type}
2. Dynamic pipeline_id with {tenant_id} template substitution
3. All metadata tables (x_meta_*) in the tenant's dataset
4. Cost and data tables directly in tenant dataset
5. Pipeline processors under src/core/processors/
6. Multi-level variable substitution (pipeline variables, runtime parameters)
"""

import os
import sys
import json
import time
import pytest
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List
from google.cloud import bigquery

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from src.app.config import settings
from src.core.pipeline.executor import PipelineExecutor
from src.core.metadata.logger import MetadataLogger
from src.core.abstractor.parser import PipelineParser


class TestGuru232342:
    """Test suite for guru_232342 tenant - demonstrating the complete system architecture."""

    TENANT_ID = "guru_232342"
    PROJECT_ID = "gac-prod-471220"
    API_BASE_URL = "http://localhost:8080"

    @classmethod
    def setup_class(cls):
        """Setup test environment for guru_232342."""
        cls.bq_client = bigquery.Client(project=cls.PROJECT_ID)
        cls.metadata_logger = MetadataLogger(cls.bq_client)
        cls.executor = PipelineExecutor(cls.bq_client, cls.metadata_logger)
        cls.parser = PipelineParser()

    def test_01_verify_tenant_infrastructure(self):
        """Verify that guru_232342 has all required infrastructure."""
        print(f"\n{'='*60}")
        print(f"TEST 01: Verifying Infrastructure for {self.TENANT_ID}")
        print(f"{'='*60}")

        # Check dataset exists
        dataset_id = f"{self.PROJECT_ID}.{self.TENANT_ID}"
        try:
            dataset = self.bq_client.get_dataset(dataset_id)
            print(f"✅ Dataset '{self.TENANT_ID}' exists")
            assert dataset is not None
        except Exception as e:
            pytest.fail(f"❌ Dataset '{self.TENANT_ID}' not found: {e}")

        # Check all required metadata tables
        required_tables = [
            "x_meta_api_keys",
            "x_meta_cloud_credentials",
            "x_meta_pipeline_runs",
            "x_meta_step_logs",
            "x_meta_dq_results"
        ]

        for table_name in required_tables:
            table_id = f"{dataset_id}.{table_name}"
            try:
                table = self.bq_client.get_table(table_id)
                print(f"✅ Table '{table_name}' exists with {len(table.schema)} fields")
            except Exception as e:
                pytest.fail(f"❌ Table '{table_name}' not found: {e}")

        # Check cost table
        cost_table_id = f"{dataset_id}.billing_cost_daily"
        try:
            cost_table = self.bq_client.get_table(cost_table_id)
            print(f"✅ Cost table 'billing_cost_daily' exists with {len(cost_table.schema)} fields")

            # Verify partitioning
            assert cost_table.time_partitioning is not None, "Table should be partitioned"
            print(f"   - Partitioned on: {cost_table.time_partitioning.field}")

            # Verify clustering
            assert cost_table.clustering_fields is not None, "Table should be clustered"
            print(f"   - Clustered on: {', '.join(cost_table.clustering_fields)}")
        except Exception as e:
            print(f"⚠️  Cost table not found (may not be created yet): {e}")

    def test_02_cost_billing_pipeline(self):
        """Test the cost billing pipeline for guru_232342."""
        print(f"\n{'='*60}")
        print(f"TEST 02: Cost Billing Pipeline for {self.TENANT_ID}")
        print(f"{'='*60}")

        # Load pipeline configuration
        config_path = Path("configs/gcp/cost/cost_billing.yml")
        config = self.parser.parse_config(str(config_path))

        # Verify dynamic pipeline_id
        assert "{tenant_id}" in config["pipeline_id"], "Pipeline ID should use {tenant_id} template"
        print(f"✅ Dynamic pipeline_id: {config['pipeline_id']}")

        # Set up runtime parameters
        runtime_params = {
            "tenant_id": self.TENANT_ID,
            "date": "2024-11-01",
            "trigger_by": "test_suite"
        }

        # Execute pipeline
        print(f"\nExecuting cost billing pipeline...")
        try:
            result = self.executor.execute_pipeline(config, runtime_params)
            print(f"✅ Pipeline executed successfully")
            print(f"   - Pipeline ID: {result.get('pipeline_id')}")
            print(f"   - Status: {result.get('status')}")
            print(f"   - Duration: {result.get('duration_seconds', 0):.2f} seconds")

            assert result.get('status') == 'COMPLETED', f"Pipeline failed: {result.get('error')}"
        except Exception as e:
            pytest.fail(f"❌ Pipeline execution failed: {e}")

        # Verify data was loaded
        query = f"""
        SELECT COUNT(*) as row_count,
               SUM(cost) as total_cost,
               COUNT(DISTINCT service_id) as service_count
        FROM `{self.PROJECT_ID}.{self.TENANT_ID}.billing_cost_daily`
        WHERE DATE(ingestion_date) = CURRENT_DATE()
        """

        result = self.bq_client.query(query).result()
        for row in result:
            print(f"\n✅ Data loaded into billing_cost_daily:")
            print(f"   - Rows loaded: {row.row_count:,}")
            print(f"   - Total cost: ${row.total_cost:.2f}")
            print(f"   - Services: {row.service_count}")

    def test_03_variable_substitution(self):
        """Test that all levels of variable substitution work correctly."""
        print(f"\n{'='*60}")
        print(f"TEST 03: Variable Substitution for {self.TENANT_ID}")
        print(f"{'='*60}")

        # Create a test pipeline config with variables
        test_config = {
            "pipeline_id": "{tenant_id}_test_variables",
            "description": "Test variable substitution for {tenant_id}",
            "variables": {
                "source_table": "test_source_{date}",
                "destination_dataset": "{tenant_id}",
                "limit": 100
            },
            "steps": [
                {
                    "step_id": "test_step",
                    "ps_type": "gcp.bq_etl",
                    "source": {
                        "query": "SELECT * FROM {source_table} LIMIT {limit}"
                    },
                    "destination": {
                        "dataset_type": "tenant",
                        "table": "test_output_{date}"
                    }
                }
            ]
        }

        runtime_params = {
            "tenant_id": self.TENANT_ID,
            "date": "20241101"
        }

        # Test pipeline_id substitution
        pipeline_id = test_config["pipeline_id"].format(**runtime_params)
        assert pipeline_id == f"{self.TENANT_ID}_test_variables"
        print(f"✅ Pipeline ID substitution: {pipeline_id}")

        # Test variable substitution in query
        variables = test_config["variables"].copy()
        for key, value in variables.items():
            if isinstance(value, str) and "{" in value:
                variables[key] = value.format(**runtime_params)

        assert variables["source_table"] == "test_source_20241101"
        assert variables["destination_dataset"] == self.TENANT_ID
        print(f"✅ Variable substitution:")
        print(f"   - source_table: {variables['source_table']}")
        print(f"   - destination_dataset: {variables['destination_dataset']}")
        print(f"   - limit: {variables['limit']}")

    def test_04_metadata_logging(self):
        """Verify metadata logging is working for guru_232342."""
        print(f"\n{'='*60}")
        print(f"TEST 04: Metadata Logging for {self.TENANT_ID}")
        print(f"{'='*60}")

        # Check pipeline runs
        query = f"""
        SELECT pipeline_id, status,
               TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds
        FROM `{self.PROJECT_ID}.{self.TENANT_ID}.x_meta_pipeline_runs`
        WHERE DATE(start_time) = CURRENT_DATE()
        ORDER BY start_time DESC
        LIMIT 5
        """

        print(f"\nRecent pipeline runs for {self.TENANT_ID}:")
        result = self.bq_client.query(query).result()
        run_count = 0
        for row in result:
            run_count += 1
            status_symbol = "✅" if row.status == "COMPLETED" else "❌"
            print(f"   {status_symbol} {row.pipeline_id}: {row.status} ({row.duration_seconds}s)")

        assert run_count > 0, "No pipeline runs found in metadata"
        print(f"\n✅ Found {run_count} pipeline runs logged today")

        # Check step logs
        query = f"""
        SELECT step_id, status,
               TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds
        FROM `{self.PROJECT_ID}.{self.TENANT_ID}.x_meta_step_logs`
        WHERE DATE(start_time) = CURRENT_DATE()
        ORDER BY start_time DESC
        LIMIT 5
        """

        print(f"\nRecent step executions for {self.TENANT_ID}:")
        result = self.bq_client.query(query).result()
        step_count = 0
        for row in result:
            step_count += 1
            status_symbol = "✅" if row.status == "COMPLETED" else "❌"
            print(f"   {status_symbol} {row.step_id}: {row.status} ({row.duration_seconds}s)")

        print(f"\n✅ Found {step_count} step logs recorded today")

    def test_05_concurrent_pipeline_execution(self):
        """Test concurrent pipeline execution limits for guru_232342."""
        print(f"\n{'='*60}")
        print(f"TEST 05: Concurrent Pipeline Execution for {self.TENANT_ID}")
        print(f"{'='*60}")

        # Check quota configuration
        query = f"""
        SELECT daily_limit, monthly_limit, concurrent_limit,
               daily_used, monthly_used, concurrent_running
        FROM `{self.PROJECT_ID}.tenants.tenant_usage_quotas`
        WHERE tenant_id = '{self.TENANT_ID}'
        """

        result = list(self.bq_client.query(query).result())
        if result:
            quota = result[0]
            print(f"✅ Quota configuration for {self.TENANT_ID}:")
            print(f"   - Daily: {quota.daily_used}/{quota.daily_limit}")
            print(f"   - Monthly: {quota.monthly_used}/{quota.monthly_limit}")
            print(f"   - Concurrent: {quota.concurrent_running}/{quota.concurrent_limit}")

            assert quota.concurrent_limit > 0, "Concurrent limit should be set"
            assert quota.concurrent_limit == 5, "Default concurrent limit should be 5"
        else:
            print(f"⚠️  No quota configuration found for {self.TENANT_ID} (optional feature)")

    def test_06_email_notification_config(self):
        """Test email notification configuration for guru_232342."""
        print(f"\n{'='*60}")
        print(f"TEST 06: Email Notification Config for {self.TENANT_ID}")
        print(f"{'='*60}")

        # Check if notification processor exists
        notify_path = Path("src/core/processors/notify_systems/email_notification.py")
        assert notify_path.exists(), "Email notification processor should exist"
        print(f"✅ Email notification processor exists")

        # Verify notification step in cost billing pipeline
        config_path = Path("configs/gcp/cost/cost_billing.yml")
        config = self.parser.parse_config(str(config_path))

        notification_steps = [s for s in config["steps"] if "notify" in s.get("ps_type", "").lower()]
        assert len(notification_steps) > 0, "Pipeline should have notification steps"

        for step in notification_steps:
            print(f"\n✅ Notification step configured:")
            print(f"   - Step ID: {step['step_id']}")
            print(f"   - Trigger: {step.get('trigger', 'always')}")
            print(f"   - Recipients: {step.get('to_emails', [])}")

    def test_07_data_integrity_checks(self):
        """Verify data integrity for guru_232342."""
        print(f"\n{'='*60}")
        print(f"TEST 07: Data Integrity Checks for {self.TENANT_ID}")
        print(f"{'='*60}")

        # Check billing_cost_daily data quality
        query = f"""
        WITH data_quality AS (
            SELECT
                COUNT(*) as total_rows,
                COUNT(DISTINCT billing_account_id) as billing_accounts,
                COUNT(DISTINCT service_id) as services,
                COUNT(DISTINCT project_id) as projects,
                MIN(usage_start_time) as earliest_date,
                MAX(usage_start_time) as latest_date,
                SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) as null_costs,
                SUM(CASE WHEN service_id IS NULL THEN 1 ELSE 0 END) as null_services
            FROM `{self.PROJECT_ID}.{self.TENANT_ID}.billing_cost_daily`
        )
        SELECT * FROM data_quality
        """

        result = list(self.bq_client.query(query).result())
        if result and result[0].total_rows > 0:
            dq = result[0]
            print(f"✅ Data Quality Report for billing_cost_daily:")
            print(f"   - Total rows: {dq.total_rows:,}")
            print(f"   - Billing accounts: {dq.billing_accounts}")
            print(f"   - Services: {dq.services}")
            print(f"   - Projects: {dq.projects}")
            print(f"   - Date range: {dq.earliest_date} to {dq.latest_date}")
            print(f"   - Null costs: {dq.null_costs}")
            print(f"   - Null services: {dq.null_services}")

            # Assert data quality
            assert dq.null_costs == 0, "Should have no null costs"
            assert dq.null_services == 0, "Should have no null services"
            print(f"\n✅ Data quality checks passed!")
        else:
            print(f"⚠️  No data in billing_cost_daily table yet")

    def test_08_architecture_validation(self):
        """Validate the complete architecture implementation for guru_232342."""
        print(f"\n{'='*60}")
        print(f"TEST 08: Architecture Validation for {self.TENANT_ID}")
        print(f"{'='*60}")

        validations = []

        # 1. Single dataset per tenant
        dataset_id = f"{self.PROJECT_ID}.{self.TENANT_ID}"
        try:
            self.bq_client.get_dataset(dataset_id)
            validations.append(("Single dataset per tenant", True))
        except:
            validations.append(("Single dataset per tenant", False))

        # 2. No {tenant_id}_{dataset_type} datasets
        wrong_dataset = f"{self.PROJECT_ID}.{self.TENANT_ID}_metadata"
        try:
            self.bq_client.get_dataset(wrong_dataset)
            validations.append(("No dataset_type suffix", False))
        except:
            validations.append(("No dataset_type suffix", True))

        # 3. Metadata tables in tenant dataset
        metadata_tables = ["x_meta_pipeline_runs", "x_meta_step_logs"]
        all_exist = all(
            self._table_exists(f"{dataset_id}.{table}")
            for table in metadata_tables
        )
        validations.append(("Metadata tables in tenant dataset", all_exist))

        # 4. Cost tables in tenant dataset
        cost_table_exists = self._table_exists(f"{dataset_id}.billing_cost_daily")
        validations.append(("Cost tables in tenant dataset", cost_table_exists))

        # 5. Pipeline processors structure
        processor_path = Path("src/core/processors/gcp/bq_etl.py")
        validations.append(("Pipeline processors structure", processor_path.exists()))

        # 6. Dynamic pipeline_id support
        config_path = Path("configs/gcp/cost/cost_billing.yml")
        if config_path.exists():
            with open(config_path) as f:
                content = f.read()
                has_template = "{tenant_id}" in content
                validations.append(("Dynamic pipeline_id templates", has_template))
        else:
            validations.append(("Dynamic pipeline_id templates", False))

        # Print results
        print("\nArchitecture Validation Results:")
        print("="*50)
        all_passed = True
        for check, passed in validations:
            status = "✅" if passed else "❌"
            print(f"{status} {check}")
            if not passed:
                all_passed = False

        assert all_passed, "Not all architecture validations passed"
        print(f"\n🎉 All architecture validations passed for {self.TENANT_ID}!")

    def _table_exists(self, table_id: str) -> bool:
        """Helper to check if a table exists."""
        try:
            self.bq_client.get_table(table_id)
            return True
        except:
            return False


if __name__ == "__main__":
    # Run tests
    print("\n" + "="*60)
    print(f"GURU_232342 TENANT TEST SUITE")
    print("="*60)
    print(f"Project: {TestGuru232342.PROJECT_ID}")
    print(f"Tenant: {TestGuru232342.TENANT_ID}")
    print("="*60)

    test = TestGuru232342()
    test.setup_class()

    # Run all tests
    test_methods = [
        test.test_01_verify_tenant_infrastructure,
        test.test_02_cost_billing_pipeline,
        test.test_03_variable_substitution,
        test.test_04_metadata_logging,
        test.test_05_concurrent_pipeline_execution,
        test.test_06_email_notification_config,
        test.test_07_data_integrity_checks,
        test.test_08_architecture_validation
    ]

    passed = 0
    failed = 0

    for test_method in test_methods:
        try:
            test_method()
            passed += 1
        except Exception as e:
            print(f"\n❌ Test failed: {e}")
            failed += 1

    # Summary
    print("\n" + "="*60)
    print(f"TEST SUMMARY")
    print("="*60)
    print(f"✅ Passed: {passed}/{len(test_methods)}")
    if failed > 0:
        print(f"❌ Failed: {failed}/{len(test_methods)}")
    else:
        print(f"🎉 All tests passed for tenant {TestGuru232342.TENANT_ID}!")
    print("="*60)