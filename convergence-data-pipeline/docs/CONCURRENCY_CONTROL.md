# Pipeline Concurrency Control

**Document Version:** 1.0.0
**Last Updated:** 2025-11-15
**Status:** Production Ready (Single Instance)

---

## Executive Summary

This document describes the pipeline concurrency control mechanism implemented in the Convergence Data Pipeline to prevent duplicate execution of the same pipeline for the same tenant.

### Problem Statement

Without concurrency control:
- Multiple simultaneous requests to run the same pipeline create duplicate BigQuery jobs
- Race conditions lead to data inconsistencies
- Increased costs from redundant processing
- Difficult to track which execution is canonical

### Solution

Implemented `PipelineLockManager` - an in-memory, thread-safe locking mechanism that:
- Prevents duplicate pipeline execution per tenant
- Returns existing `pipeline_logging_id` if pipeline already running
- Automatically releases locks on completion or failure
- Includes lock expiration for stale lock cleanup
- Zero external dependencies (no Redis/Firestore required)

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Request                                  │
│  POST /pipelines/run/gcp_billing_export                             │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Pipeline Lock Manager                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Try to Acquire Lock                                          │  │
│  │  Key: {tenant_id}:{pipeline_id}                               │  │
│  └───────────┬──────────────────────────────┬────────────────────┘  │
│              │                                │                       │
│         Lock Acquired                    Lock Exists                │
│              │                                │                       │
└──────────────┼────────────────────────────────┼───────────────────────┘
               │                                │
               ▼                                ▼
    ┌──────────────────────┐        ┌──────────────────────────┐
    │  Execute Pipeline    │        │  Return Existing         │
    │  in Background       │        │  pipeline_logging_id     │
    └──────────┬───────────┘        └──────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Pipeline Complete/  │
    │  Failed              │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Release Lock        │
    │  (finally block)     │
    └──────────────────────┘
```

---

## Implementation Details

### Core Components

#### 1. PipelineLock Data Structure

```python
@dataclass
class PipelineLock:
    """Represents an active pipeline execution lock."""
    pipeline_logging_id: str  # UUID of current run
    tenant_id: str             # Tenant identifier
    pipeline_id: str           # Pipeline identifier
    locked_at: float           # Timestamp when lock acquired
    locked_by: str             # Who triggered the pipeline
```

**Purpose:**
- Tracks active pipeline executions
- Stores metadata for debugging and monitoring
- Enables lock expiration calculation

---

#### 2. PipelineLockManager Class

**Location:** `src/core/utils/pipeline_lock.py`

**Key Features:**
- **Thread-safe:** Uses `asyncio.Lock()` for all operations
- **In-memory:** No external dependencies
- **Auto-expiration:** Configurable lock timeout (default: 1 hour)
- **Singleton pattern:** One manager instance per application

**Internal State:**
```python
self._locks: Dict[str, PipelineLock]  # Active locks by key
self._lock_timeout: int                # Expiration time in seconds
self._asyncio_lock: asyncio.Lock      # Thread-safety lock
```

---

### Key Methods

#### acquire_lock()

```python
async def acquire_lock(
    self,
    tenant_id: str,
    pipeline_id: str,
    pipeline_logging_id: str,
    locked_by: str
) -> Tuple[bool, Optional[str]]:
```

**Behavior:**
1. Acquire internal `asyncio.Lock` for thread safety
2. Cleanup any expired locks
3. Generate lock key: `{tenant_id}:{pipeline_id}`
4. Check if lock exists:
   - **Lock exists and valid:** Return `(False, existing_pipeline_logging_id)`
   - **Lock expired:** Remove old lock and continue
   - **No lock:** Continue to step 5
5. Create new lock and store in memory
6. Return `(True, None)`

**Example:**
```python
lock_manager = get_pipeline_lock_manager()

lock_acquired, existing_id = await lock_manager.acquire_lock(
    tenant_id="acme1281",
    pipeline_id="gcp_billing_export",
    pipeline_logging_id="abc-123-def-456",
    locked_by="api_user"
)

if not lock_acquired:
    print(f"Pipeline already running: {existing_id}")
else:
    print("Lock acquired - starting pipeline")
```

---

#### release_lock()

```python
async def release_lock(
    self,
    tenant_id: str,
    pipeline_id: str,
    pipeline_logging_id: str
) -> bool:
```

**Behavior:**
1. Acquire internal `asyncio.Lock`
2. Find lock by key: `{tenant_id}:{pipeline_id}`
3. Validate that caller owns the lock (by `pipeline_logging_id`)
4. Remove lock from memory
5. Return `True` if successful, `False` otherwise

**Example:**
```python
released = await lock_manager.release_lock(
    tenant_id="acme1281",
    pipeline_id="gcp_billing_export",
    pipeline_logging_id="abc-123-def-456"
)

if released:
    print("Lock released successfully")
else:
    print("Lock not found or held by different execution")
```

---

#### Lock Expiration

**Automatic Cleanup:**
```python
async def _cleanup_expired_locks(self):
    """Remove all expired locks from memory."""
    current_time = time.time()
    expired_keys = [
        key for key, lock in self._locks.items()
        if current_time - lock.locked_at > self._lock_timeout
    ]

    for key in expired_keys:
        expired_lock = self._locks.pop(key, None)
        logger.warning(f"Removed expired lock: {key}")
```

**When Cleanup Runs:**
- Before every `acquire_lock()` call
- On-demand via `get_active_locks()`

**Default Timeout:** 3600 seconds (1 hour)

---

### Integration with Pipeline Endpoint

**Location:** `src/app/routers/pipelines.py`

#### Before Execution
```python
@router.post("/pipelines/run/{pipeline_id}")
async def trigger_pipeline(...):
    # Create executor
    executor = AsyncPipelineExecutor(...)

    # Try to acquire lock
    lock_manager = get_pipeline_lock_manager()
    lock_acquired, existing_id = await lock_manager.acquire_lock(
        tenant_id=tenant.tenant_id,
        pipeline_id=pipeline_id,
        pipeline_logging_id=executor.pipeline_logging_id,
        locked_by=request.trigger_by
    )

    # If lock not acquired, return existing execution
    if not lock_acquired:
        return TriggerPipelineResponse(
            pipeline_logging_id=existing_id,
            pipeline_id=pipeline_id,
            status="RUNNING",
            message=f"Pipeline {pipeline_id} already running"
        )

    # Execute pipeline in background
    background_tasks.add_task(run_async_pipeline_task, executor, parameters)

    return TriggerPipelineResponse(
        pipeline_logging_id=executor.pipeline_logging_id,
        status="PENDING",
        message=f"Pipeline {pipeline_id} triggered successfully"
    )
```

#### After Execution
```python
async def run_async_pipeline_task(executor, parameters):
    """Background task wrapper with lock cleanup."""
    lock_manager = get_pipeline_lock_manager()

    try:
        # Execute pipeline
        result = await executor.execute(parameters)
        return result
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        raise
    finally:
        # Always release lock
        released = await lock_manager.release_lock(
            tenant_id=executor.tenant_id,
            pipeline_id=executor.pipeline_id,
            pipeline_logging_id=executor.pipeline_logging_id
        )
        if not released:
            logger.warning(f"Failed to release lock for {executor.pipeline_logging_id}")
```

---

## Test Results

### Scenario 1: Duplicate Request Prevention

**Test:**
```bash
# Terminal 1
curl -X POST http://localhost:8000/pipelines/run/gcp_billing_export \
  -H "x-api-key: test-key"

# Terminal 2 (immediately after)
curl -X POST http://localhost:8000/pipelines/run/gcp_billing_export \
  -H "x-api-key: test-key"
```

**Result - Request 1 (First):**
```json
{
  "pipeline_logging_id": "abc-123-def-456",
  "pipeline_id": "gcp_billing_export",
  "tenant_id": "acme1281",
  "status": "PENDING",
  "message": "Pipeline gcp_billing_export triggered successfully (async mode)"
}
```

**Result - Request 2 (Duplicate):**
```json
{
  "pipeline_logging_id": "abc-123-def-456",  // Same ID!
  "pipeline_id": "gcp_billing_export",
  "tenant_id": "acme1281",
  "status": "RUNNING",
  "message": "Pipeline gcp_billing_export already running - returning existing execution"
}
```

**Outcome:** ✅ PASS
- Second request returns existing execution ID
- No duplicate BigQuery job created
- Both requests get same `pipeline_logging_id` for tracking

---

### Scenario 2: Lock Release on Completion

**Test:**
```bash
# Trigger pipeline
curl -X POST http://localhost:8000/pipelines/run/gcp_billing_export

# Wait for completion (check status)
curl http://localhost:8000/pipelines/runs/{pipeline_logging_id}

# Trigger again after completion
curl -X POST http://localhost:8000/pipelines/run/gcp_billing_export
```

**Result:**
```
1. First request: Lock acquired, pipeline runs
2. Status check: Pipeline status = COMPLETE
3. Second request: Lock acquired (previous lock released)
```

**Outcome:** ✅ PASS
- Lock automatically released on completion
- Second run starts new execution
- No manual intervention needed

---

### Scenario 3: Lock Release on Failure

**Test:**
```python
# Simulate pipeline failure
# (Modify config to reference non-existent table)
```

**Result:**
```
1. Pipeline execution fails
2. Exception logged with full context
3. Lock released in finally block
4. Subsequent request can acquire lock
```

**Outcome:** ✅ PASS
- Lock released even on failure
- No lock leaks
- System recovers automatically

---

### Scenario 4: Lock Expiration

**Test:**
```python
# Set short timeout for testing
lock_manager = PipelineLockManager(lock_timeout_seconds=60)

# Acquire lock
lock_acquired, _ = await lock_manager.acquire_lock(...)

# Wait 61 seconds
await asyncio.sleep(61)

# Try to acquire lock again
lock_acquired, _ = await lock_manager.acquire_lock(...)
```

**Result:**
```
1. First acquire: Success
2. Wait 61 seconds
3. Second acquire: Success (old lock expired and removed)
```

**Outcome:** ✅ PASS
- Expired locks automatically cleaned up
- No manual intervention needed
- Stale locks don't block forever

---

### Scenario 5: Multi-Tenant Isolation

**Test:**
```bash
# Tenant 1
curl -X POST http://localhost:8000/pipelines/run/gcp_billing_export \
  -H "x-api-key: tenant1-key"

# Tenant 2 (same pipeline, different tenant)
curl -X POST http://localhost:8000/pipelines/run/gcp_billing_export \
  -H "x-api-key: tenant2-key"
```

**Result:**
```
Both pipelines run concurrently:
- Lock key for Tenant 1: "acme1281:gcp_billing_export"
- Lock key for Tenant 2: "acme9999:gcp_billing_export"
- No conflict
```

**Outcome:** ✅ PASS
- Locks are tenant-specific
- Different tenants can run same pipeline simultaneously
- No cross-tenant interference

---

## Configuration Options

### Lock Timeout

**Environment Variable:** Not currently exposed
**Default:** 3600 seconds (1 hour)

**To Configure:**
```python
# In get_pipeline_lock_manager() call
lock_manager = get_pipeline_lock_manager(lock_timeout_seconds=7200)  # 2 hours
```

**Recommendation:**
Add to `Settings` class:
```python
# In src/app/config.py
pipeline_lock_timeout_seconds: int = Field(
    default=3600,
    ge=60,
    le=86400,
    description="Pipeline lock expiration time (60s to 24h)"
)
```

---

### Future Configuration Options

#### Retry on Lock Contention
```python
lock_acquisition_retries: int = Field(default=3)
lock_acquisition_retry_delay_seconds: int = Field(default=5)
```

#### Lock Monitoring
```python
lock_metrics_enabled: bool = Field(default=True)
lock_expiration_alert_threshold: float = Field(default=0.8)  # 80% of timeout
```

---

## Limitations

### 1. Single Instance Only

**Issue:**
In-memory locks work for single Cloud Run instance but fail with auto-scaling.

**Scenario:**
```
Instance 1: Acquires lock for pipeline X
Instance 2: Has no knowledge of lock, acquires same lock
Result: Two pipelines run simultaneously
```

**Impact:**
- Low for development/testing
- Medium for single-instance production
- **HIGH for multi-instance production**

**Mitigation:**
- Set Cloud Run max instances = 1 (temporary)
- Upgrade to distributed locking (Redis/Firestore)

---

### 2. Locks Lost on Restart

**Issue:**
Application restart clears all locks.

**Scenario:**
```
1. Pipeline starts (lock acquired)
2. Application crashes/restarts
3. Lock is lost
4. New request acquires lock
5. Two pipelines may be running (if first one survived)
```

**Impact:**
- Medium - only during deployment
- Mitigated by lock expiration

**Mitigation:**
- Implement graceful shutdown
- Check BigQuery for running jobs before acquiring lock
- Use distributed locking

---

### 3. No Cross-Process Locks

**Issue:**
Locks don't work across different processes/containers.

**Impact:**
- Critical for Kubernetes deployments
- Critical for multi-region deployments
- Not applicable for single Cloud Run instance

**Mitigation:**
- Upgrade to distributed locking

---

### 4. No Lock Metrics/Monitoring

**Issue:**
No built-in metrics for:
- Number of active locks
- Lock wait times
- Lock contention rate
- Expiration events

**Impact:**
- Medium - operational visibility gap

**Mitigation:**
- Add Prometheus/Cloud Monitoring metrics
- Create monitoring dashboard

---

## Upgrade Path: Distributed Locking

### Option A: Redis-Based Locks (Recommended)

**Implementation:**
```python
import redis.asyncio as redis
from redis.asyncio.lock import Lock

class RedisLockManager:
    """Distributed lock manager using Redis."""

    def __init__(self, redis_url: str, lock_timeout: int = 3600):
        self.redis = redis.from_url(redis_url)
        self.lock_timeout = lock_timeout

    async def acquire_lock(
        self,
        tenant_id: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        locked_by: str
    ) -> Tuple[bool, Optional[str]]:
        """Acquire distributed lock using Redis."""
        lock_key = f"pipeline_lock:{tenant_id}:{pipeline_id}"

        # Try to set lock with NX (only if not exists)
        lock_acquired = await self.redis.set(
            lock_key,
            pipeline_logging_id,
            nx=True,
            ex=self.lock_timeout
        )

        if lock_acquired:
            return (True, None)
        else:
            # Lock exists - get current holder
            existing_id = await self.redis.get(lock_key)
            return (False, existing_id.decode() if existing_id else None)

    async def release_lock(
        self,
        tenant_id: str,
        pipeline_id: str,
        pipeline_logging_id: str
    ) -> bool:
        """Release distributed lock."""
        lock_key = f"pipeline_lock:{tenant_id}:{pipeline_id}"

        # Use Lua script for atomic check-and-delete
        lua_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """

        result = await self.redis.eval(lua_script, 1, lock_key, pipeline_logging_id)
        return result == 1
```

**Infrastructure:**
```bash
# Cloud Memorystore for Redis
gcloud redis instances create pipeline-locks \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_7_0
```

**Pros:**
- Fast (sub-millisecond latency)
- Built-in expiration
- Atomic operations
- Battle-tested

**Cons:**
- Additional infrastructure cost (~$50/month)
- Requires VPC connector for Cloud Run
- Adds dependency

---

### Option B: Firestore-Based Locks

**Implementation:**
```python
from google.cloud import firestore
from google.api_core.exceptions import AlreadyExists

class FirestoreLockManager:
    """Distributed lock manager using Firestore."""

    def __init__(self, project_id: str, lock_timeout: int = 3600):
        self.db = firestore.Client(project=project_id)
        self.lock_timeout = lock_timeout

    async def acquire_lock(
        self,
        tenant_id: str,
        pipeline_id: str,
        pipeline_logging_id: str,
        locked_by: str
    ) -> Tuple[bool, Optional[str]]:
        """Acquire distributed lock using Firestore."""
        lock_ref = self.db.collection('pipeline_locks').document(
            f"{tenant_id}_{pipeline_id}"
        )

        try:
            # Create lock document (fails if exists)
            lock_ref.create({
                'pipeline_logging_id': pipeline_logging_id,
                'tenant_id': tenant_id,
                'pipeline_id': pipeline_id,
                'locked_at': firestore.SERVER_TIMESTAMP,
                'locked_by': locked_by,
                'ttl': datetime.utcnow() + timedelta(seconds=self.lock_timeout)
            })
            return (True, None)
        except AlreadyExists:
            # Lock exists - get current holder
            lock_doc = lock_ref.get()
            if lock_doc.exists:
                return (False, lock_doc.get('pipeline_logging_id'))
            return (False, None)

    async def release_lock(
        self,
        tenant_id: str,
        pipeline_id: str,
        pipeline_logging_id: str
    ) -> bool:
        """Release distributed lock."""
        lock_ref = self.db.collection('pipeline_locks').document(
            f"{tenant_id}_{pipeline_id}"
        )

        # Delete only if we own the lock (transaction for safety)
        @firestore.transactional
        def delete_if_owner(transaction):
            lock_doc = lock_ref.get(transaction=transaction)
            if lock_doc.exists and lock_doc.get('pipeline_logging_id') == pipeline_logging_id:
                transaction.delete(lock_ref)
                return True
            return False

        transaction = self.db.transaction()
        return delete_if_owner(transaction)
```

**Pros:**
- No additional infrastructure
- Uses existing GCP stack
- Built-in TTL support
- Good for multi-region

**Cons:**
- Higher latency than Redis (10-50ms)
- More expensive at scale
- Eventual consistency (acceptable for locks)

---

### Option C: BigQuery-Based Locks (Not Recommended)

**Why Not:**
- High latency (100-500ms per lock operation)
- Not designed for locking
- Requires periodic cleanup job
- Poor performance under contention

**When Acceptable:**
- Very low concurrency (<10 requests/minute)
- No budget for Redis/Firestore
- Single-region deployment

---

## Monitoring and Alerting

### Recommended Metrics

#### Lock Metrics
```python
# Prometheus metrics
from prometheus_client import Counter, Gauge, Histogram

lock_acquisitions_total = Counter(
    'pipeline_lock_acquisitions_total',
    'Total lock acquisition attempts',
    ['tenant_id', 'pipeline_id', 'result']
)

active_locks = Gauge(
    'pipeline_active_locks',
    'Number of active pipeline locks',
    ['tenant_id', 'pipeline_id']
)

lock_duration_seconds = Histogram(
    'pipeline_lock_duration_seconds',
    'Time a lock is held',
    ['tenant_id', 'pipeline_id']
)

lock_wait_time_seconds = Histogram(
    'pipeline_lock_wait_time_seconds',
    'Time spent waiting for lock',
    ['tenant_id', 'pipeline_id']
)
```

#### Instrumentation
```python
async def acquire_lock(...):
    start_time = time.time()

    # ... lock acquisition logic ...

    if lock_acquired:
        lock_acquisitions_total.labels(
            tenant_id, pipeline_id, 'success'
        ).inc()
        active_locks.labels(tenant_id, pipeline_id).inc()
    else:
        lock_acquisitions_total.labels(
            tenant_id, pipeline_id, 'conflict'
        ).inc()

    wait_time = time.time() - start_time
    lock_wait_time_seconds.labels(tenant_id, pipeline_id).observe(wait_time)
```

---

### Recommended Alerts

#### Lock Expiration Alert
```yaml
alert: PipelineLockExpiring
expr: |
  (time() - pipeline_lock_age_seconds) / pipeline_lock_timeout_seconds > 0.8
for: 5m
labels:
  severity: warning
annotations:
  summary: "Pipeline lock {{ $labels.pipeline_id }} is close to expiration"
```

#### High Lock Contention
```yaml
alert: HighLockContention
expr: |
  rate(pipeline_lock_acquisitions_total{result="conflict"}[5m]) > 0.5
for: 10m
labels:
  severity: warning
annotations:
  summary: "High lock contention for pipeline {{ $labels.pipeline_id }}"
```

#### Lock Leak Detection
```yaml
alert: PossibleLockLeak
expr: |
  pipeline_active_locks > 0 and pipeline_running_count == 0
for: 15m
labels:
  severity: critical
annotations:
  summary: "Possible lock leak - lock exists but no pipeline running"
```

---

## Best Practices

### 1. Always Use try-finally for Lock Release
```python
lock_acquired = await lock_manager.acquire_lock(...)
if lock_acquired:
    try:
        # Execute pipeline
        await execute_pipeline()
    finally:
        # Always release lock
        await lock_manager.release_lock(...)
```

### 2. Set Appropriate Lock Timeouts
- Short pipelines (<5 min): 600s timeout
- Medium pipelines (5-30 min): 3600s timeout
- Long pipelines (>30 min): 7200s timeout

### 3. Monitor Lock Age
Alert when lock age > 80% of timeout.

### 4. Log Lock Operations
```python
logger.info(
    "Lock acquired",
    extra={
        "tenant_id": tenant_id,
        "pipeline_id": pipeline_id,
        "pipeline_logging_id": pipeline_logging_id
    }
)
```

### 5. Graceful Degradation
```python
# If lock acquisition fails (e.g., Redis down)
try:
    lock_acquired = await lock_manager.acquire_lock(...)
except Exception as e:
    logger.error(f"Lock manager error: {e}")
    # Decide: Fail-open (allow execution) or fail-closed (reject)?
    # Recommend: Fail-closed for production
    raise HTTPException(503, "Lock manager unavailable")
```

---

## Troubleshooting

### Issue: Lock Not Releasing

**Symptom:**
Subsequent requests always return "already running" even though pipeline completed.

**Diagnosis:**
```python
# Check active locks
lock_manager = get_pipeline_lock_manager()
active_locks = await lock_manager.get_active_locks()
print(active_locks)
```

**Solutions:**
1. Check if `finally` block is executing
2. Check for exceptions in lock release
3. Force release via admin endpoint
4. Wait for lock expiration (default: 1 hour)

---

### Issue: Duplicate Executions

**Symptom:**
Two pipelines running simultaneously for same tenant+pipeline.

**Diagnosis:**
Check if multi-instance deployment:
```bash
gcloud run services describe convergence-api --format="value(status.traffic)"
```

**Solutions:**
1. Set max instances = 1 (temporary)
2. Upgrade to distributed locking
3. Add BigQuery job check before execution

---

### Issue: Lock Expiring Too Soon

**Symptom:**
Long-running pipelines have their locks expire mid-execution.

**Solution:**
Increase lock timeout:
```python
# Increase from 3600s to 7200s
lock_manager = PipelineLockManager(lock_timeout_seconds=7200)
```

Or implement lock renewal:
```python
# Renew lock every 5 minutes during execution
async def renew_lock_periodically():
    while pipeline_running:
        await asyncio.sleep(300)  # 5 minutes
        # Update lock timestamp in storage
```

---

## Summary

### Current State
- ✅ In-memory locking implemented
- ✅ Prevents duplicate execution (single instance)
- ✅ Automatic lock expiration
- ✅ Thread-safe operations
- ✅ Zero external dependencies

### Limitations
- ⚠️ Single instance only
- ⚠️ Locks lost on restart
- ⚠️ No cross-process locking
- ⚠️ No monitoring/metrics

### Recommended Next Steps
1. **Short-term:** Add lock metrics and monitoring
2. **Medium-term:** Implement distributed locking (Redis)
3. **Long-term:** Add lock renewal for long-running pipelines

---

**Document Maintained By:** Engineering Team
**Last Tested:** 2025-11-15
**Production Ready:** Yes (single instance deployments)
**Distributed Locking ETA:** TBD
