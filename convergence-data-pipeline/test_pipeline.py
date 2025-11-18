import asyncio
import sys
sys.path.append('.')

from src.core.pipeline.async_executor import AsyncPipelineExecutor

async def test_pipeline():
    """Test the GCP cost billing pipeline directly"""
    
    tenant_id = "test_final_path"
    pipeline_id = "cost_billing"  # Just the template name, not the full path
    
    print(f"Testing pipeline for tenant: {tenant_id}")
    
    # Create executor
    executor = AsyncPipelineExecutor(
        tenant_id=tenant_id,
        pipeline_id=pipeline_id,
        trigger_type="manual",
        trigger_by="test_script"
    )
    
    # Run the pipeline with test parameters
    parameters = {
        "date": "2024-11-17",
        "trigger_by": "manual"
    }
    
    try:
        result = await executor.execute(parameters=parameters)
        print(f"Pipeline Result: {result}")
        return result
    except Exception as e:
        print(f"Pipeline Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    # Set environment variable
    import os
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/gurukallam/.gcp/gac-prod-471220-7a1eb8cb0a6a.json"
    
    # Run the test
    result = asyncio.run(test_pipeline())
    if result:
        print(f"\n✓ Pipeline executed successfully!")
        print(f"Status: {result.get('status', 'Unknown')}")
    else:
        print("\n✗ Pipeline failed to execute")
