#!/usr/bin/env python3
"""
Test pipeline runs locally by directly calling the enqueue_pipeline function
"""
import asyncio
import uuid
from datetime import datetime, timezone
from google.cloud import bigquery
from src.core.engine.bq_client import BigQueryClient
from src.app.config import get_settings

settings = get_settings()

async def test_enqueue_pipeline():
    """Test the enqueue_pipeline function directly"""
    print("=" * 60)
    print("PIPELINE RUN TEST (Direct Function Call)")
    print("=" * 60)

    # Initialize BigQuery client
    bq_client = BigQueryClient(
        project_id=settings.gcp_project_id,
        location=settings.bigquery_location
    )

    # Create a mock pipeline config
    test_config = {
        'config_id': f'test-config-{int(datetime.now().timestamp())}',
        'tenant_id': 'acmeinc_23xv2',  # Using test tenant from test_api_keys.json
        'provider': 'salesforce',
        'domain': 'crm',
        'pipeline_template': 'ingest_transform_load',
        'parameters': {'test': True, 'dry_run': True}
    }

    print(f"\n[1/3] Creating test pipeline config...")
    print(f"  Config ID: {test_config['config_id']}")
    print(f"  Tenant: {test_config['tenant_id']}")

    # Import the enqueue_pipeline function
    from src.app.routers.scheduler import enqueue_pipeline

    print(f"\n[2/3] Enqueueing pipeline run...")
    try:
        run_id = await enqueue_pipeline(
            bq_client=bq_client,
            tenant_id=test_config['tenant_id'],
            config=test_config,
            priority=5
        )
        print(f"✓ Pipeline run enqueued successfully")
        print(f"  Run ID: {run_id}")
    except Exception as e:
        print(f"❌ Failed to enqueue pipeline: {e}")
        import traceback
        traceback.print_exc()
        return False

    # Verify in BigQuery
    print(f"\n[3/3] Verifying run in BigQuery...")
    query = f"""
    SELECT
        run_id,
        tenant_id,
        pipeline_id,
        state,
        priority,
        retry_count,
        max_retries,
        created_at
    FROM `{settings.gcp_project_id}.tenants.scheduled_pipeline_runs`
    WHERE run_id = @run_id
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("run_id", "STRING", run_id)
        ]
    )

    try:
        result = bq_client.client.query(query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            print(f"❌ Run not found in BigQuery!")
            return False

        row = rows[0]
        print(f"✓ Run found in BigQuery")
        print(f"\n  Schema Validation:")
        print(f"    run_id:       {row.run_id}")
        print(f"    tenant_id:    {row.tenant_id}")
        print(f"    pipeline_id:  {row.pipeline_id}")
        print(f"    state:        {row.state}")
        print(f"    priority:     {row.priority}")
        print(f"    retry_count:  {row.retry_count} ✓ (expected: 0)")
        print(f"    max_retries:  {row.max_retries} ✓ (expected: 3)")
        print(f"    created_at:   {row.created_at} ✓")

        # Validate schema
        if row.retry_count == 0 and row.max_retries == 3:
            print("\n" + "=" * 60)
            print("✅ PIPELINE RUN TEST PASSED")
            print("=" * 60)
            print("\nValidated:")
            print("  • Pipeline run enqueued successfully")
            print("  • Inserted into scheduled_pipeline_runs table")
            print("  • All schema fields present (including retry fields)")
            print("  • retry_count = 0 (correct default)")
            print("  • max_retries = 3 (correct default)")
            print("  • created_at timestamp set")
            return True
        else:
            print(f"\n❌ Schema validation failed!")
            print(f"   Expected retry_count=0, got {row.retry_count}")
            print(f"   Expected max_retries=3, got {row.max_retries}")
            return False

    except Exception as e:
        print(f"❌ Failed to verify in BigQuery: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_enqueue_pipeline())
    exit(0 if success else 1)
