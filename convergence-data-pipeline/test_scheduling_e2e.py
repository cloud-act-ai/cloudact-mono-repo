"""
End-to-End Test for Pipeline Scheduling System
Tests complete workflow with 2 customers and multiple pipelines
"""

import requests
import time
import json
from datetime import datetime, timedelta
from google.cloud import bigquery

# Configuration
BASE_URL = "http://localhost:8080/api/v1"
PROJECT_ID = "gac-prod-471220"
DATASET = "customers_metadata"

# Test customers
CUSTOMERS = [
    {
        "tenant_id": "acme_test_sched",
        "company_name": "Acme Test Corp",
        "contact_email": "admin@acme-test.com",
        "subscription_plan": "PROFESSIONAL"
    },
    {
        "tenant_id": "globex_test_sched",
        "company_name": "Globex Test Inc",
        "contact_email": "admin@globex-test.com",
        "subscription_plan": "SCALE"
    }
]

# Pipeline configurations for each customer
PIPELINE_CONFIGS = {
    "acme_test_sched": [
        {
            "provider": "GCP",
            "domain": "COST",
            "pipeline_template": "cost_billing",
            "pipeline_name": "Daily GCP Cost Analysis",
            "schedule_type": "DAILY",
            "schedule_cron": "0 2 * * *",  # Daily at 2am
            "timezone": "UTC"
        },
        {
            "provider": "GCP",
            "domain": "SECURITY",
            "pipeline_template": "security_audit",
            "pipeline_name": "Weekly Security Audit",
            "schedule_type": "WEEKLY",
            "schedule_cron": "0 0 * * 1",  # Weekly on Monday
            "timezone": "UTC"
        }
    ],
    "globex_test_sched": [
        {
            "provider": "AWS",
            "domain": "COST",
            "pipeline_template": "cost_analysis",
            "pipeline_name": "Daily AWS Cost",
            "schedule_type": "DAILY",
            "schedule_cron": "0 3 * * *",  # Daily at 3am
            "timezone": "UTC"
        },
        {
            "provider": "AZURE",
            "domain": "COMPLIANCE",
            "pipeline_template": "compliance_check",
            "pipeline_name": "Monthly Compliance",
            "schedule_type": "MONTHLY",
            "schedule_cron": "0 0 1 * *",  # Monthly on 1st
            "timezone": "UTC"
        }
    ]
}

# Store API keys
api_keys = {}

def print_step(step_num, message):
    """Print formatted test step"""
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {message}")
    print(f"{'='*80}\n")

def print_result(success, message):
    """Print test result"""
    status = "✅ SUCCESS" if success else "❌ FAILED"
    print(f"{status}: {message}\n")

def onboard_customer(customer_data):
    """Onboard a test customer"""
    print(f"Onboarding customer: {customer_data['tenant_id']}")

    response = requests.post(
        f"{BASE_URL}/customers/onboard",
        json=customer_data
    )

    if response.status_code == 200:
        data = response.json()
        api_key = data.get("api_key")
        api_keys[customer_data["tenant_id"]] = api_key
        print_result(True, f"Customer onboarded. API Key: {api_key[:20]}...")
        return data
    else:
        print_result(False, f"Failed to onboard: {response.text}")
        return None

def configure_pipeline_schedule(tenant_id, config):
    """Configure a pipeline schedule for a customer"""
    print(f"Configuring pipeline: {config['pipeline_name']}")

    api_key = api_keys.get(tenant_id)
    if not api_key:
        print_result(False, "No API key found")
        return None

    # Calculate next run time (set to 1 minute from now for testing)
    next_run = (datetime.utcnow() + timedelta(minutes=1)).isoformat() + "Z"

    payload = {
        **config,
        "next_run_time": next_run,
        "is_active": True,
        "parameters": {"test": True},
        "retry_config": {
            "max_retries": 3,
            "backoff_multiplier": 2
        },
        "notification_emails": [f"ops@{tenant_id}.com"]
    }

    response = requests.post(
        f"{BASE_URL}/scheduler/pipeline-configs",
        headers={"X-API-Key": api_key},
        json=payload
    )

    if response.status_code in [200, 201]:
        data = response.json()
        print_result(True, f"Pipeline configured: {data.get('config_id', 'N/A')}")
        return data
    else:
        print_result(False, f"Failed to configure: {response.text}")
        return None

def trigger_scheduler():
    """Trigger the scheduler to process due pipelines"""
    print("Triggering scheduler...")

    response = requests.post(
        f"{BASE_URL}/scheduler/trigger",
        headers={"X-Admin-Key": "admin_key_placeholder"}  # TODO: Use actual admin key
    )

    if response.status_code == 200:
        data = response.json()
        print_result(True, f"Scheduler triggered: {json.dumps(data, indent=2)}")
        return data
    else:
        print_result(False, f"Failed to trigger: {response.text}")
        return None

def check_queue_status():
    """Check pipeline execution queue"""
    print("Checking execution queue...")

    client = bigquery.Client(project=PROJECT_ID)

    query = f"""
    SELECT
        queue_id,
        tenant_id,
        pipeline_template,
        priority,
        state,
        scheduled_time,
        created_at
    FROM `{PROJECT_ID}.{DATASET}.pipeline_execution_queue`
    ORDER BY created_at DESC
    LIMIT 10
    """

    results = client.query(query).result()
    items = [dict(row) for row in results]

    print(f"Found {len(items)} queue items:")
    for item in items:
        print(f"  - {item['tenant_id']}: {item['pipeline_template']} [{item['state']}]")

    return items

def check_scheduled_runs():
    """Check scheduled pipeline runs"""
    print("Checking scheduled runs...")

    client = bigquery.Client(project=PROJECT_ID)

    query = f"""
    SELECT
        run_id,
        tenant_id,
        pipeline_template,
        state,
        scheduled_time,
        actual_start_time,
        created_at
    FROM `{PROJECT_ID}.{DATASET}.scheduled_pipeline_runs`
    ORDER BY created_at DESC
    LIMIT 10
    """

    results = client.query(query).result()
    runs = [dict(row) for row in results]

    print(f"Found {len(runs)} scheduled runs:")
    for run in runs:
        print(f"  - {run['tenant_id']}: {run['pipeline_template']} [{run['state']}]")

    return runs

def check_pipeline_configs():
    """Check customer pipeline configurations"""
    print("Checking pipeline configurations...")

    client = bigquery.Client(project=PROJECT_ID)

    query = f"""
    SELECT
        config_id,
        tenant_id,
        pipeline_name,
        is_active,
        schedule_cron,
        next_run_time,
        last_run_status
    FROM `{PROJECT_ID}.{DATASET}.tenant_pipeline_configs`
    WHERE is_active = TRUE
    ORDER BY tenant_id, pipeline_name
    """

    results = client.query(query).result()
    configs = [dict(row) for row in results]

    print(f"Found {len(configs)} active pipeline configs:")
    for config in configs:
        print(f"  - {config['tenant_id']}: {config['pipeline_name']}")
        print(f"    Schedule: {config['schedule_cron']}")
        print(f"    Next run: {config['next_run_time']}")

    return configs

def cleanup_test_data():
    """Clean up all test data"""
    print("Cleaning up test data...")

    client = bigquery.Client(project=PROJECT_ID)

    # Delete from all tables
    tables = [
        "tenant_pipeline_configs",
        "scheduled_pipeline_runs",
        "pipeline_execution_queue",
        "customer_usage",
        "tenant_api_keys",
        "tenant_subscriptions",
        "customers"
    ]

    for table in tables:
        query = f"""
        DELETE FROM `{PROJECT_ID}.{DATASET}.{table}`
        WHERE tenant_id IN ('acme_test_sched', 'globex_test_sched')
        """
        try:
            client.query(query).result()
            print(f"  ✅ Cleaned {table}")
        except Exception as e:
            print(f"  ⚠️  Error cleaning {table}: {str(e)}")

    # Delete tenant datasets
    for customer in CUSTOMERS:
        try:
            client.delete_dataset(
                f"{PROJECT_ID}.{customer['tenant_id']}",
                delete_contents=True,
                not_found_ok=True
            )
            print(f"  ✅ Deleted dataset: {customer['tenant_id']}")
        except Exception as e:
            print(f"  ⚠️  Error deleting dataset: {str(e)}")

def main():
    """Run end-to-end test"""
    print("\n" + "="*80)
    print("PIPELINE SCHEDULING SYSTEM - END-TO-END TEST")
    print("Testing with 2 customers and multiple pipelines")
    print("="*80)

    # Step 1: Onboard customers
    print_step(1, "Onboarding Test Customers")
    for customer in CUSTOMERS:
        result = onboard_customer(customer)
        if not result:
            print("❌ Test failed at customer onboarding")
            return
        time.sleep(2)

    # Step 2: Configure pipeline schedules
    print_step(2, "Configuring Pipeline Schedules")
    for tenant_id, configs in PIPELINE_CONFIGS.items():
        for config in configs:
            result = configure_pipeline_schedule(tenant_id, config)
            if not result:
                print("⚠️  Pipeline configuration failed, continuing...")
            time.sleep(1)

    # Step 3: Verify configurations in BigQuery
    print_step(3, "Verifying Pipeline Configurations")
    configs = check_pipeline_configs()
    if len(configs) < 4:
        print(f"⚠️  Expected 4 configs, found {len(configs)}")

    # Step 4: Wait for pipelines to become due
    print_step(4, "Waiting for Pipelines to Become Due (60 seconds)")
    for i in range(60, 0, -10):
        print(f"  ⏳ {i} seconds remaining...")
        time.sleep(10)

    # Step 5: Trigger scheduler
    print_step(5, "Triggering Scheduler")
    scheduler_result = trigger_scheduler()

    # Step 6: Check queue status
    print_step(6, "Checking Execution Queue")
    time.sleep(5)  # Wait for queue to populate
    queue_items = check_queue_status()

    # Step 7: Check scheduled runs
    print_step(7, "Checking Scheduled Runs")
    scheduled_runs = check_scheduled_runs()

    # Step 8: Summary
    print_step(8, "Test Summary")
    print(f"✅ Customers onboarded: {len(api_keys)}")
    print(f"✅ Pipeline configs created: {len(configs)}")
    print(f"✅ Queue items: {len(queue_items)}")
    print(f"✅ Scheduled runs: {len(scheduled_runs)}")

    # Success criteria
    success = (
        len(api_keys) == 2 and
        len(configs) >= 4 and
        len(scheduled_runs) > 0
    )

    if success:
        print("\n" + "="*80)
        print("🎉 END-TO-END TEST PASSED!")
        print("="*80)
    else:
        print("\n" + "="*80)
        print("❌ END-TO-END TEST FAILED")
        print("="*80)

    # Step 9: Cleanup
    print_step(9, "Cleaning Up Test Data")
    cleanup_test_data()

    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
