#!/usr/bin/env python3
"""
Setup BigQuery datasets and tables for the convergence data pipeline

This script creates:
1. Central 'tenants' dataset with all tenant management tables
2. Required table schemas
"""

from google.cloud import bigquery
import os

GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "gac-prod-471220")
LOCATION = "US"

GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

def log(msg, success=True):
    color = GREEN if success else RED
    symbol = "✓" if success else "✗"
    print(f"{color}{symbol} {msg}{RESET}")

def create_tenants_dataset():
    """Create the central tenants dataset"""
    client = bigquery.Client(project=GCP_PROJECT_ID)

    dataset_id = f"{GCP_PROJECT_ID}.tenants"
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = LOCATION
    dataset.description = "Central dataset for tenant management, authentication, and quotas"

    try:
        dataset = client.create_dataset(dataset, exists_ok=True)
        log(f"Created/verified dataset: {dataset_id}")
        return True
    except Exception as e:
        log(f"Failed to create dataset: {str(e)}", False)
        return False

def create_tenants_tables():
    """Create all tenant management tables"""
    client = bigquery.Client(project=GCP_PROJECT_ID)

    tables_sql = [
        # Table 1: tenant_profiles
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_profiles` (
            tenant_id STRING NOT NULL,
            company_name STRING NOT NULL,
            admin_email STRING NOT NULL,
            tenant_dataset_id STRING NOT NULL,
            status STRING NOT NULL DEFAULT 'ACTIVE',
            subscription_plan STRING,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            updated_at TIMESTAMP
        )
        """,

        # Table 2: tenant_api_keys
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_api_keys` (
            api_key_id STRING NOT NULL,
            tenant_id STRING NOT NULL,
            api_key_hash STRING NOT NULL,
            encrypted_api_key BYTES,
            scopes ARRAY<STRING>,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            expires_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            last_used_at TIMESTAMP
        )
        """,

        # Table 3: tenant_subscriptions
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_subscriptions` (
            subscription_id STRING NOT NULL,
            tenant_id STRING NOT NULL,
            plan_name STRING NOT NULL,
            status STRING NOT NULL DEFAULT 'ACTIVE',
            daily_limit INT64 NOT NULL,
            monthly_limit INT64 NOT NULL,
            concurrent_limit INT64 NOT NULL,
            trial_end_date DATE,
            subscription_end_date DATE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            updated_at TIMESTAMP
        )
        """,

        # Table 4: tenant_usage_quotas
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_usage_quotas` (
            usage_id STRING NOT NULL,
            tenant_id STRING NOT NULL,
            usage_date DATE NOT NULL,
            pipelines_run_today INT64 NOT NULL DEFAULT 0,
            pipelines_succeeded_today INT64 NOT NULL DEFAULT 0,
            pipelines_failed_today INT64 NOT NULL DEFAULT 0,
            pipelines_run_month INT64 NOT NULL DEFAULT 0,
            concurrent_pipelines_running INT64 NOT NULL DEFAULT 0,
            daily_limit INT64 NOT NULL,
            monthly_limit INT64,
            concurrent_limit INT64,
            last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
        )
        """,

        # Table 5: tenant_cloud_credentials
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_cloud_credentials` (
            credential_id STRING NOT NULL,
            tenant_id STRING NOT NULL,
            provider STRING NOT NULL,
            encrypted_credentials BYTES NOT NULL,
            created_by_user_id STRING,
            updated_by_user_id STRING,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            updated_at TIMESTAMP
        )
        """,

        # Table 6: tenant_pipeline_configs (for scheduler)
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_pipeline_configs` (
            config_id STRING NOT NULL,
            tenant_id STRING NOT NULL,
            provider STRING NOT NULL,
            domain STRING NOT NULL,
            pipeline_template STRING NOT NULL,
            schedule_cron STRING NOT NULL,
            timezone STRING NOT NULL DEFAULT 'UTC',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            next_run_time TIMESTAMP,
            last_run_time TIMESTAMP,
            last_run_status STRING,
            parameters JSON,
            priority INT64 NOT NULL DEFAULT 5,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            updated_at TIMESTAMP
        )
        """,

        # Table 7: tenant_scheduled_pipeline_runs
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_scheduled_pipeline_runs` (
            run_id STRING NOT NULL,
            config_id STRING NOT NULL,
            tenant_id STRING NOT NULL,
            pipeline_id STRING NOT NULL,
            state STRING NOT NULL DEFAULT 'PENDING',
            scheduled_time TIMESTAMP NOT NULL,
            priority INT64 NOT NULL DEFAULT 5,
            parameters JSON,
            pipeline_logging_id STRING,
            retry_count INT64 NOT NULL DEFAULT 0,
            max_retries INT64 NOT NULL DEFAULT 3,
            completed_at TIMESTAMP,
            failed_at TIMESTAMP,
            error_message STRING,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
        )
        """,

        # Table 8: tenant_pipeline_execution_queue
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT_ID}.tenants.tenant_pipeline_execution_queue` (
            run_id STRING NOT NULL,
            tenant_id STRING NOT NULL,
            pipeline_id STRING NOT NULL,
            state STRING NOT NULL DEFAULT 'QUEUED',
            scheduled_time TIMESTAMP NOT NULL,
            priority INT64 NOT NULL DEFAULT 5,
            added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            processing_started_at TIMESTAMP
        )
        """,
    ]

    for i, sql in enumerate(tables_sql, 1):
        try:
            client.query(sql.strip()).result()
            table_name = sql.split("IF NOT EXISTS")[1].split("(")[0].strip().split(".")[-1]
            log(f"Created/verified table {i}/8: {table_name}")
        except Exception as e:
            log(f"Failed to create table {i}: {str(e)}", False)
            return False

    return True

def main():
    print("=" * 80)
    print("Setting up BigQuery datasets and tables...")
    print("=" * 80)
    print()

    # Step 1: Create tenants dataset
    if not create_tenants_dataset():
        print("\nFailed to create tenants dataset")
        return False

    # Step 2: Create all tables
    if not create_tenants_tables():
        print("\nFailed to create tables")
        return False

    print()
    print("=" * 80)
    log("Setup completed successfully!")
    print("=" * 80)
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
