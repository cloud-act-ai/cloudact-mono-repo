"""
Test pipeline scheduling and execution functionality
Tests the scheduled_pipeline_runs schema and workflow
"""
import requests
import time
import uuid
import json
from google.cloud import bigquery

BASE_URL = "http://localhost:8080"
PROJECT_ID = "gac-prod-471220"

# Use a tenant that was successfully onboarded
TEST_TENANT = {
    "tenant_id": "tech_startup_002",  # This one should be working from previous tests
    "api_key": None  # Will fetch from BigQuery
}

def get_tenant_api_key(tenant_id: str) -> str:
    """Fetch API key from BigQuery for existing tenant"""
    client = bigquery.Client(project=PROJECT_ID)
    query = f"""
    SELECT api_key
    FROM `{PROJECT_ID}.tenants.tenant_api_keys`
    WHERE tenant_id = @tenant_id
    AND is_active = TRUE
    LIMIT 1
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
        ]
    )
    result = client.query(query, job_config=job_config).result()
    for row in result:
        return row.api_key
    return None

def create_pipeline_config(tenant_id: str, api_key: str) -> dict:
    """Create a pipeline configuration"""
    config_data = {
        "config_name": f"test_pipeline_{int(time.time())}",
        "pipeline_type": "INGEST_TRANSFORM_LOAD",
        "source_config": {
            "type": "gcs",
            "bucket": "test-bucket",
            "path": "test-data/*.json"
        },
        "target_config": {
            "type": "bigquery",
            "dataset": f"{tenant_id}_data",
            "table": "test_table"
        },
        "schedule_config": {
            "enabled": False,  # Manual trigger only
            "cron_expression": None
        },
        "notification_config": {
            "on_success": False,
            "on_failure": False
        }
    }

    headers = {"X-API-Key": api_key}
    response = requests.post(
        f"{BASE_URL}/api/v1/pipelines/configs",
        json=config_data,
        headers=headers,
        timeout=30
    )
    return response

def schedule_pipeline_run(tenant_id: str, api_key: str, config_id: str) -> dict:
    """Schedule a pipeline run using the scheduler endpoint"""
    run_data = {
        "config_id": config_id,
        "priority": 5,
        "parameters": {
            "test_mode": True,
            "dry_run": True
        }
    }

    headers = {"X-API-Key": api_key}
    response = requests.post(
        f"{BASE_URL}/api/v1/scheduler/runs",
        json=run_data,
        headers=headers,
        timeout=30
    )
    return response

def verify_scheduled_run_in_bigquery(run_id: str) -> dict:
    """Verify the scheduled run was created with correct schema"""
    client = bigquery.Client(project=PROJECT_ID)
    query = f"""
    SELECT
        run_id,
        config_id,
        tenant_id,
        pipeline_id,
        state,
        scheduled_time,
        priority,
        retry_count,
        max_retries,
        created_at,
        parameters
    FROM `{PROJECT_ID}.tenants.scheduled_pipeline_runs`
    WHERE run_id = @run_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
        ]
    )
    result = client.query(query, job_config=job_config).result()

    for row in result:
        return {
            "run_id": row.run_id,
            "config_id": row.config_id,
            "tenant_id": row.tenant_id,
            "pipeline_id": row.pipeline_id,
            "state": row.state,
            "scheduled_time": row.scheduled_time,
            "priority": row.priority,
            "retry_count": row.retry_count,
            "max_retries": row.max_retries,
            "created_at": row.created_at,
            "parameters": row.parameters
        }
    return None

def test_pipeline_workflow():
    """Test complete pipeline scheduling workflow"""
    print("=" * 60)
    print("PIPELINE RUNS TEST")
    print("=" * 60)

    # Step 1: Get API key for test tenant
    print(f"\n[1/5] Fetching API key for tenant: {TEST_TENANT['tenant_id']}")
    api_key = get_tenant_api_key(TEST_TENANT['tenant_id'])

    if not api_key:
        print(f"❌ FAILED: Could not find API key for {TEST_TENANT['tenant_id']}")
        print("   Make sure tenant onboarding test completed successfully")
        return False

    print(f"✓ API key found: {api_key[:20]}...")
    TEST_TENANT['api_key'] = api_key

    # Step 2: Create pipeline configuration
    print(f"\n[2/5] Creating pipeline configuration...")
    config_response = create_pipeline_config(TEST_TENANT['tenant_id'], api_key)

    if config_response.status_code != 201:
        print(f"❌ FAILED: Pipeline config creation failed")
        print(f"   Status: {config_response.status_code}")
        print(f"   Response: {config_response.text}")
        return False

    config_data = config_response.json()
    config_id = config_data.get('config_id')
    print(f"✓ Pipeline config created: {config_id}")

    # Step 3: Schedule a pipeline run
    print(f"\n[3/5] Scheduling pipeline run...")
    run_response = schedule_pipeline_run(TEST_TENANT['tenant_id'], api_key, config_id)

    if run_response.status_code != 201:
        print(f"❌ FAILED: Pipeline run scheduling failed")
        print(f"   Status: {run_response.status_code}")
        print(f"   Response: {run_response.text}")
        return False

    run_data = run_response.json()
    run_id = run_data.get('run_id')
    print(f"✓ Pipeline run scheduled: {run_id}")

    # Step 4: Verify in BigQuery with new schema fields
    print(f"\n[4/5] Verifying scheduled run in BigQuery...")
    time.sleep(2)  # Give BigQuery a moment to sync

    bq_data = verify_scheduled_run_in_bigquery(run_id)

    if not bq_data:
        print(f"❌ FAILED: Scheduled run not found in BigQuery")
        return False

    print(f"✓ Run found in BigQuery")

    # Step 5: Validate schema fields
    print(f"\n[5/5] Validating schema fields...")
    schema_checks = {
        "run_id": bq_data.get('run_id') == run_id,
        "config_id": bq_data.get('config_id') == config_id,
        "tenant_id": bq_data.get('tenant_id') == TEST_TENANT['tenant_id'],
        "state": bq_data.get('state') == 'PENDING',
        "priority": bq_data.get('priority') == 5,
        "retry_count": bq_data.get('retry_count') == 0,  # New field
        "max_retries": bq_data.get('max_retries') == 3,  # New field
        "created_at": bq_data.get('created_at') is not None,  # New field
        "parameters": bq_data.get('parameters') is not None
    }

    all_passed = True
    for field, passed in schema_checks.items():
        status = "✓" if passed else "❌"
        value = bq_data.get(field)
        print(f"  {status} {field:20s}: {value}")
        if not passed:
            all_passed = False

    if all_passed:
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
        print("\nValidated:")
        print("  • Pipeline configuration creation")
        print("  • Pipeline run scheduling")
        print("  • BigQuery insertion with retry fields")
        print("  • Schema alignment (retry_count, max_retries, created_at)")
        return True
    else:
        print("\n" + "=" * 60)
        print("❌ SOME TESTS FAILED")
        print("=" * 60)
        return False

if __name__ == "__main__":
    try:
        success = test_pipeline_workflow()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
