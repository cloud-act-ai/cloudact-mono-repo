import pytest
import asyncio
import uuid
from src.core.utils.pipeline_lock import get_pipeline_lock_manager

@pytest.mark.asyncio
async def test_high_concurrency_locking():
    """
    Simulate 1000 concurrent pipeline lock acquisitions to verify thread safety and performance.
    """
    lock_manager = get_pipeline_lock_manager()
    org_slug = "test_scale_org"
    
    # Generate 1000 distinct pipeline IDs (representing 1000 different pipelines running for the same org)
    pipeline_ids = [f"pipeline-{i}" for i in range(1000)]
    
    async def acquire_lock_safe(pid):
        logging_id = str(uuid.uuid4())
        success, existing = await lock_manager.acquire_lock(
            org_slug=org_slug,
            pipeline_id=pid,
            pipeline_logging_id=logging_id,
            locked_by="load_test"
        )
        return success, pid, logging_id
    
    # Run 1000 acquisitions concurrently
    tasks = [acquire_lock_safe(pid) for pid in pipeline_ids]
    results = await asyncio.gather(*tasks)
    
    # Verification
    success_count = sum(1 for r in results if r[0])
    assert success_count == 1000, f"Expected 1000 successful locks, got {success_count}"
    
    # Verify active locks
    active_locks = await lock_manager.get_active_locks()
    # Note: get_active_locks might include locks from other tests if run in same session, 
    # so we filter for our specific org
    org_locks = {k: v for k, v in active_locks.items() if v.org_slug == org_slug}
    assert len(org_locks) == 1000, f"Expected 1000 active locks for org, got {len(org_locks)}"
    
    # Cleanup: Release all locks
    async def release_lock_safe(pid, logging_id):
        await lock_manager.release_lock(org_slug, pid, logging_id)
        
    cleanup_tasks = [release_lock_safe(r[1], r[2]) for r in results]
    await asyncio.gather(*cleanup_tasks)
    
    # Verify cleanup
    active_locks_after = await lock_manager.get_active_locks()
    org_locks_after = {k: v for k, v in active_locks_after.items() if v.org_slug == org_slug}
    assert len(org_locks_after) == 0, "Failed to release all locks"

@pytest.mark.asyncio
async def test_duplicate_submission_blocking():
    """
    Verify that submitting the SAME pipeline multiple times correctly blocks duplicates.
    """
    lock_manager = get_pipeline_lock_manager()
    org_slug = "test_dup_org"
    pipeline_id = "same-pipeline-id"
    
    # 1. Acquire first lock
    success1, _ = await lock_manager.acquire_lock(org_slug, pipeline_id, "id-1", "test")
    assert success1 is True
    
    # 2. Try to acquire same lock (should fail)
    success2, existing_id = await lock_manager.acquire_lock(org_slug, pipeline_id, "id-2", "test")
    assert success2 is False
    assert existing_id == "id-1"
    
    # 3. Release first lock
    await lock_manager.release_lock(org_slug, pipeline_id, "id-1")
    
    # 4. Acquire again (should succeed now)
    success3, _ = await lock_manager.acquire_lock(org_slug, pipeline_id, "id-3", "test")
    assert success3 is True
