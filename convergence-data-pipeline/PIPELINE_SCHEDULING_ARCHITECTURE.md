# Pipeline Scheduling and State Management Architecture

## Executive Summary

This document defines the complete architecture for managing pipeline scheduling and execution state for 10,000+ customers across multiple cloud providers (GCP, AWS, Azure). The system handles pipeline configuration, scheduled execution, state tracking, and SLA monitoring at scale.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema Design](#database-schema-design)
3. [State Management](#state-management)
4. [Scheduling Engine](#scheduling-engine)
5. [API Endpoints](#api-endpoints)
6. [Workflow Diagrams](#workflow-diagrams)
7. [Scalability Strategies](#scalability-strategies)
8. [Retry and Error Handling](#retry-and-error-handling)
9. [Monitoring and SLA Tracking](#monitoring-and-sla-tracking)
10. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud Scheduler (Hourly)                     │
│                  Triggers: /scheduler/trigger                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Scheduling Service Layer                       │
│  - Query eligible pipelines                                      │
│  - Create scheduled runs                                         │
│  - Batch processing (1000 configs/batch)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Execution Orchestrator                        │
│  - State transitions (PENDING → RUNNING → COMPLETED)            │
│  - Pub/Sub integration                                           │
│  - Idempotency enforcement                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Pipeline Execution Engine                     │
│  - Actual pipeline runs                                          │
│  - Result callbacks                                              │
│  - State updates                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Idempotency**: Every operation can be safely retried
2. **Scalability**: Handle 10k+ customers with batching and pagination
3. **Reliability**: Automatic retries with exponential backoff
4. **Observability**: Track every state transition
5. **SLA Compliance**: Monitor and alert on missed runs

---

## 2. Database Schema Design

### 2.1 customer_pipeline_configs

Stores which pipelines are enabled for each customer.

```sql
CREATE TABLE customer_pipeline_configs (
  -- Primary identifiers
  config_id STRING NOT NULL,
  customer_id STRING NOT NULL,

  -- Pipeline specification
  provider STRING NOT NULL,  -- GCP, AWS, AZURE
  domain STRING NOT NULL,    -- COST, SECURITY, COMPLIANCE, OPERATIONS
  pipeline_template STRING NOT NULL,  -- cost_billing, security_audit, etc.

  -- Configuration
  is_active BOOLEAN DEFAULT true,
  schedule_type STRING NOT NULL,  -- CRON, INTERVAL, EVENT_DRIVEN
  schedule_cron STRING,  -- "0 2 * * *" (cron expression)
  schedule_interval_minutes INT64,  -- For interval-based schedules
  timezone STRING DEFAULT 'UTC',  -- Customer timezone

  -- Execution tracking
  next_run_time TIMESTAMP NOT NULL,
  last_run_time TIMESTAMP,
  last_run_status STRING,  -- COMPLETED, FAILED, TIMEOUT
  consecutive_failures INT64 DEFAULT 0,

  -- Pipeline parameters
  parameters JSON,  -- Pipeline-specific configuration
  retry_config JSON,  -- Custom retry settings

  -- SLA configuration
  max_execution_duration_minutes INT64 DEFAULT 60,
  sla_breach_threshold_minutes INT64 DEFAULT 30,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING,

  -- Audit
  version INT64 DEFAULT 1,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, next_run_time, is_active, provider;

-- Indexes for fast queries
CREATE INDEX idx_next_run_active
ON customer_pipeline_configs(next_run_time, is_active, is_deleted)
WHERE is_active = true AND is_deleted = false;

CREATE INDEX idx_customer_active
ON customer_pipeline_configs(customer_id, is_active, provider, domain);

CREATE INDEX idx_failed_runs
ON customer_pipeline_configs(consecutive_failures, is_active)
WHERE consecutive_failures > 0;
```

### 2.2 scheduled_pipeline_runs

Tracks expected scheduled runs (acts as execution queue).

```sql
CREATE TABLE scheduled_pipeline_runs (
  -- Primary identifiers
  run_id STRING NOT NULL,  -- UUID
  config_id STRING NOT NULL,  -- FK to customer_pipeline_configs
  customer_id STRING NOT NULL,

  -- Execution specification
  scheduled_time TIMESTAMP NOT NULL,  -- When it should run
  execution_priority INT64 DEFAULT 5,  -- 1-10, higher = more important

  -- State tracking
  state STRING NOT NULL,  -- PENDING, CLAIMED, RUNNING, COMPLETED, FAILED, CANCELLED
  state_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),

  -- Execution details
  execution_start_time TIMESTAMP,
  execution_end_time TIMESTAMP,
  execution_duration_seconds INT64,

  -- Processing metadata
  claimed_by STRING,  -- Worker/pod ID that claimed this run
  claimed_at TIMESTAMP,
  claim_expiry_time TIMESTAMP,  -- Prevents stuck claims

  -- Results
  status STRING,  -- SUCCESS, PARTIAL_SUCCESS, FAILURE, TIMEOUT
  result_summary JSON,
  error_details JSON,
  records_processed INT64,

  -- Retry tracking
  attempt_number INT64 DEFAULT 1,
  max_attempts INT64 DEFAULT 3,
  retry_after TIMESTAMP,
  parent_run_id STRING,  -- For retry chains

  -- Idempotency
  idempotency_key STRING,  -- config_id + scheduled_time hash

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(scheduled_time)
CLUSTER BY state, scheduled_time, customer_id, execution_priority;

-- Indexes for scheduler queries
CREATE UNIQUE INDEX idx_idempotency
ON scheduled_pipeline_runs(idempotency_key);

CREATE INDEX idx_pending_runs
ON scheduled_pipeline_runs(state, scheduled_time, execution_priority)
WHERE state = 'PENDING';

CREATE INDEX idx_running_claims
ON scheduled_pipeline_runs(state, claim_expiry_time)
WHERE state IN ('CLAIMED', 'RUNNING');

CREATE INDEX idx_customer_runs
ON scheduled_pipeline_runs(customer_id, scheduled_time DESC);
```

### 2.3 pipeline_execution_state

Real-time state tracking for running pipelines (hot data).

```sql
CREATE TABLE pipeline_execution_state (
  -- Primary identifiers
  execution_id STRING NOT NULL,  -- Same as run_id
  run_id STRING NOT NULL,
  config_id STRING NOT NULL,
  customer_id STRING NOT NULL,

  -- Current state
  current_state STRING NOT NULL,  -- INITIALIZING, RUNNING, FINALIZING
  current_stage STRING,  -- e.g., "extracting", "transforming", "loading"
  progress_percentage DECIMAL(5,2),

  -- Execution context
  worker_id STRING,
  execution_pod STRING,
  execution_region STRING,

  -- Timing
  started_at TIMESTAMP,
  last_heartbeat_at TIMESTAMP,
  estimated_completion_time TIMESTAMP,

  -- Metrics
  records_extracted INT64 DEFAULT 0,
  records_transformed INT64 DEFAULT 0,
  records_loaded INT64 DEFAULT 0,
  bytes_processed INT64 DEFAULT 0,

  -- Health
  is_stale BOOLEAN DEFAULT false,  -- No heartbeat in 5 minutes
  timeout_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(started_at)
CLUSTER BY current_state, customer_id;

-- Indexes
CREATE UNIQUE INDEX idx_execution_id
ON pipeline_execution_state(execution_id);

CREATE INDEX idx_stale_executions
ON pipeline_execution_state(is_stale, last_heartbeat_at)
WHERE is_stale = true;

CREATE INDEX idx_active_executions
ON pipeline_execution_state(current_state, started_at)
WHERE current_state IN ('INITIALIZING', 'RUNNING', 'FINALIZING');
```

### 2.4 pipeline_execution_history

Long-term storage for completed pipeline runs.

```sql
CREATE TABLE pipeline_execution_history (
  -- Primary identifiers
  history_id STRING NOT NULL,
  run_id STRING NOT NULL,
  config_id STRING NOT NULL,
  customer_id STRING NOT NULL,

  -- Pipeline details
  provider STRING,
  domain STRING,
  pipeline_template STRING,

  -- Execution timeline
  scheduled_time TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  execution_duration_seconds INT64,

  -- Results
  final_state STRING,  -- COMPLETED, FAILED, TIMEOUT, CANCELLED
  status STRING,  -- SUCCESS, PARTIAL_SUCCESS, FAILURE
  records_processed INT64,
  bytes_processed INT64,

  -- Performance metrics
  extract_duration_seconds INT64,
  transform_duration_seconds INT64,
  load_duration_seconds INT64,

  -- Results and errors
  result_summary JSON,
  error_details JSON,
  error_type STRING,

  -- SLA tracking
  sla_met BOOLEAN,
  sla_breach_minutes INT64,

  -- Retry information
  attempt_number INT64,
  was_retried BOOLEAN,

  -- Cost tracking
  estimated_cost_usd DECIMAL(10,4),

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(scheduled_time)
CLUSTER BY customer_id, provider, domain, scheduled_time DESC;

-- Indexes
CREATE INDEX idx_customer_history
ON pipeline_execution_history(customer_id, scheduled_time DESC);

CREATE INDEX idx_failed_runs
ON pipeline_execution_history(final_state, scheduled_time DESC)
WHERE final_state IN ('FAILED', 'TIMEOUT');

CREATE INDEX idx_sla_breaches
ON pipeline_execution_history(sla_met, scheduled_time DESC)
WHERE sla_met = false;
```

### 2.5 pipeline_schedule_audit

Audit trail for schedule changes.

```sql
CREATE TABLE pipeline_schedule_audit (
  audit_id STRING NOT NULL,
  config_id STRING NOT NULL,
  customer_id STRING NOT NULL,

  -- Change details
  action STRING NOT NULL,  -- CREATED, UPDATED, DELETED, ACTIVATED, DEACTIVATED
  changed_by STRING,
  change_reason STRING,

  -- Before/after state
  old_values JSON,
  new_values JSON,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY config_id, created_at DESC;
```

---

## 3. State Management

### 3.1 Pipeline Run States

```
State Flow:

PENDING → CLAIMED → RUNNING → COMPLETED
                         ↓
                      FAILED
                         ↓
                    (Retry Logic)
                         ↓
                    PENDING (new run)

Alternative Flows:
PENDING → CANCELLED (manual cancellation)
RUNNING → TIMEOUT → FAILED
```

### 3.2 State Definitions

| State | Description | Next Valid States |
|-------|-------------|-------------------|
| **PENDING** | Scheduled run waiting to be claimed | CLAIMED, CANCELLED |
| **CLAIMED** | Run claimed by worker but not started | RUNNING, PENDING (claim expired) |
| **RUNNING** | Pipeline actively executing | COMPLETED, FAILED, TIMEOUT |
| **COMPLETED** | Successfully finished | None (terminal) |
| **FAILED** | Execution failed | None (terminal, triggers retry) |
| **TIMEOUT** | Exceeded max execution time | None (terminal, triggers retry) |
| **CANCELLED** | Manually cancelled | None (terminal) |

### 3.3 State Transition Rules

```python
# Valid state transitions
VALID_TRANSITIONS = {
    'PENDING': ['CLAIMED', 'CANCELLED'],
    'CLAIMED': ['RUNNING', 'PENDING'],  # PENDING if claim expires
    'RUNNING': ['COMPLETED', 'FAILED', 'TIMEOUT'],
    'COMPLETED': [],  # Terminal
    'FAILED': [],     # Terminal
    'TIMEOUT': [],    # Terminal
    'CANCELLED': []   # Terminal
}

# Automatic state transitions
def check_claim_expiry():
    """Reset CLAIMED runs where claim_expiry_time has passed"""
    UPDATE scheduled_pipeline_runs
    SET state = 'PENDING',
        claimed_by = NULL,
        claimed_at = NULL,
        claim_expiry_time = NULL
    WHERE state = 'CLAIMED'
      AND claim_expiry_time < CURRENT_TIMESTAMP()

def check_execution_timeout():
    """Mark RUNNING executions as TIMEOUT if exceeded max duration"""
    UPDATE scheduled_pipeline_runs
    SET state = 'TIMEOUT',
        execution_end_time = CURRENT_TIMESTAMP()
    WHERE state = 'RUNNING'
      AND execution_start_time + max_execution_duration < CURRENT_TIMESTAMP()
```

---

## 4. Scheduling Engine

### 4.1 Cloud Scheduler Configuration

```yaml
# Cloud Scheduler Job: pipeline-scheduler-trigger
name: pipeline-scheduler-trigger
schedule: "*/15 * * * *"  # Every 15 minutes
time_zone: UTC
http_target:
  uri: https://api.convergence.example.com/api/v1/scheduler/trigger
  http_method: POST
  headers:
    Content-Type: application/json
    X-Scheduler-Token: ${SCHEDULER_SECRET_TOKEN}
  body:
    batch_size: 1000
    max_processing_time_seconds: 600  # 10 minutes
retry_config:
  retry_count: 3
  min_backoff_duration: 5s
  max_backoff_duration: 60s
```

### 4.2 Scheduling Algorithm

```python
def process_scheduled_pipelines(batch_size=1000, offset=0):
    """
    Main scheduling algorithm called by Cloud Scheduler

    Flow:
    1. Query eligible pipelines (next_run_time <= NOW)
    2. Create scheduled runs (with idempotency)
    3. Update next_run_time
    4. Trigger execution
    """

    # Query eligible pipelines
    eligible_configs = query_eligible_pipelines(
        current_time=now(),
        batch_size=batch_size,
        offset=offset
    )

    scheduled_runs = []

    for config in eligible_configs:
        # Create scheduled run with idempotency
        run = create_scheduled_run(
            config_id=config.config_id,
            customer_id=config.customer_id,
            scheduled_time=config.next_run_time,
            idempotency_key=generate_idempotency_key(
                config.config_id,
                config.next_run_time
            )
        )

        if run:  # May be None if already exists (idempotent)
            scheduled_runs.append(run)

            # Update next run time
            update_next_run_time(config)

    # Return summary
    return {
        'processed_configs': len(eligible_configs),
        'created_runs': len(scheduled_runs),
        'next_offset': offset + batch_size if len(eligible_configs) == batch_size else None
    }

def query_eligible_pipelines(current_time, batch_size, offset):
    """Query pipelines that should run now"""
    return """
        SELECT *
        FROM customer_pipeline_configs
        WHERE is_active = true
          AND is_deleted = false
          AND next_run_time <= @current_time
          AND consecutive_failures < 5  -- Stop scheduling after 5 consecutive failures
        ORDER BY next_run_time ASC, execution_priority DESC
        LIMIT @batch_size
        OFFSET @offset
    """

def generate_idempotency_key(config_id, scheduled_time):
    """Generate unique key to prevent duplicate runs"""
    import hashlib
    data = f"{config_id}:{scheduled_time.isoformat()}"
    return hashlib.sha256(data.encode()).hexdigest()

def calculate_next_run_time(config):
    """Calculate next run time based on schedule type"""
    if config.schedule_type == 'CRON':
        from croniter import croniter
        return croniter(config.schedule_cron, config.next_run_time).get_next(datetime)

    elif config.schedule_type == 'INTERVAL':
        return config.next_run_time + timedelta(minutes=config.schedule_interval_minutes)

    else:
        raise ValueError(f"Unknown schedule type: {config.schedule_type}")
```

### 4.3 Pagination Strategy for 10k+ Customers

```python
def scheduler_trigger_endpoint(request):
    """
    Main endpoint called by Cloud Scheduler
    Handles pagination for large customer base
    """
    batch_size = request.json.get('batch_size', 1000)
    max_processing_time = request.json.get('max_processing_time_seconds', 600)

    start_time = time.time()
    offset = 0
    total_processed = 0
    total_created = 0

    while True:
        # Check if we're running out of time
        elapsed = time.time() - start_time
        if elapsed >= max_processing_time:
            break

        # Process batch
        result = process_scheduled_pipelines(
            batch_size=batch_size,
            offset=offset
        )

        total_processed += result['processed_configs']
        total_created += result['created_runs']

        # Check if there's more data
        if result['next_offset'] is None:
            break

        offset = result['next_offset']

    return {
        'status': 'completed',
        'total_configs_processed': total_processed,
        'total_runs_created': total_created,
        'processing_time_seconds': time.time() - start_time
    }
```

---

## 5. API Endpoints

### 5.1 Scheduler Endpoints

#### POST /api/v1/scheduler/trigger
**Description**: Triggered by Cloud Scheduler to create scheduled runs

**Request**:
```json
{
  "batch_size": 1000,
  "max_processing_time_seconds": 600
}
```

**Response**:
```json
{
  "status": "completed",
  "total_configs_processed": 2500,
  "total_runs_created": 2500,
  "processing_time_seconds": 45.3
}
```

#### POST /api/v1/scheduler/claim-runs
**Description**: Workers claim pending runs for execution

**Request**:
```json
{
  "worker_id": "worker-pod-abc123",
  "max_claims": 10,
  "claim_duration_seconds": 300
}
```

**Response**:
```json
{
  "claimed_runs": [
    {
      "run_id": "run-uuid-1",
      "config_id": "config-uuid-1",
      "customer_id": "customer-123",
      "scheduled_time": "2025-11-17T02:00:00Z",
      "claim_expiry_time": "2025-11-17T02:05:00Z"
    }
  ]
}
```

### 5.2 Configuration Management Endpoints

#### POST /api/v1/customers/{customer_id}/pipeline-configs
**Description**: Enable a pipeline for a customer

**Request**:
```json
{
  "provider": "GCP",
  "domain": "COST",
  "pipeline_template": "cost_billing",
  "schedule_cron": "0 2 * * *",
  "timezone": "America/New_York",
  "parameters": {
    "billing_account_id": "012345-ABCDEF-678900",
    "include_labels": true
  },
  "retry_config": {
    "max_attempts": 3,
    "backoff_multiplier": 2
  }
}
```

**Response**:
```json
{
  "config_id": "config-uuid-1",
  "customer_id": "customer-123",
  "is_active": true,
  "next_run_time": "2025-11-18T07:00:00Z",  # Next 2am EST in UTC
  "created_at": "2025-11-17T14:30:00Z"
}
```

#### GET /api/v1/customers/{customer_id}/pipeline-configs
**Description**: List all pipeline configurations for a customer

#### PATCH /api/v1/pipeline-configs/{config_id}
**Description**: Update pipeline configuration (schedule, parameters, etc.)

#### DELETE /api/v1/pipeline-configs/{config_id}
**Description**: Disable/delete a pipeline configuration

### 5.3 Execution Management Endpoints

#### POST /api/v1/pipeline-runs/{run_id}/start
**Description**: Start execution of a claimed run

**Request**:
```json
{
  "worker_id": "worker-pod-abc123",
  "execution_context": {
    "pod_name": "pipeline-worker-abc123",
    "region": "us-central1"
  }
}
```

#### POST /api/v1/pipeline-runs/{run_id}/heartbeat
**Description**: Update execution state and progress

**Request**:
```json
{
  "current_stage": "transforming",
  "progress_percentage": 45.5,
  "records_processed": 1250000,
  "estimated_completion_time": "2025-11-17T02:35:00Z"
}
```

#### POST /api/v1/pipeline-runs/{run_id}/complete
**Description**: Mark run as completed

**Request**:
```json
{
  "status": "SUCCESS",
  "result_summary": {
    "records_extracted": 2000000,
    "records_transformed": 1999500,
    "records_loaded": 1999500,
    "execution_duration_seconds": 1800
  }
}
```

#### POST /api/v1/pipeline-runs/{run_id}/fail
**Description**: Mark run as failed

**Request**:
```json
{
  "error_type": "AUTHENTICATION_FAILED",
  "error_details": {
    "message": "Invalid service account credentials",
    "provider_error_code": "401"
  },
  "should_retry": true
}
```

### 5.4 Monitoring Endpoints

#### GET /api/v1/dashboard/pipeline-status
**Description**: Get overview of pipeline execution status

**Response**:
```json
{
  "pending_runs": 150,
  "running_runs": 45,
  "completed_today": 2300,
  "failed_today": 15,
  "sla_breaches_today": 3,
  "average_execution_duration_seconds": 1245
}
```

#### GET /api/v1/customers/{customer_id}/pipeline-runs
**Description**: List runs for a customer with filtering

**Query Parameters**:
- `state`: Filter by state (PENDING, RUNNING, COMPLETED, FAILED)
- `start_date`: Filter by scheduled time start
- `end_date`: Filter by scheduled time end
- `limit`: Page size (default: 50)
- `offset`: Pagination offset

---

## 6. Workflow Diagrams

### 6.1 Complete End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 1: Customer Configuration                                  │
└──────────────────────────────────────────────────────────────────┘

Customer enables pipeline via UI/API
         ↓
POST /api/v1/customers/{id}/pipeline-configs
         ↓
Create customer_pipeline_configs record
  - config_id: UUID
  - schedule_cron: "0 2 * * *"
  - next_run_time: Calculate first run time
  - is_active: true
         ↓
Audit: Record in pipeline_schedule_audit

┌──────────────────────────────────────────────────────────────────┐
│ PHASE 2: Scheduled Run Creation (Every 15 minutes)               │
└──────────────────────────────────────────────────────────────────┘

Cloud Scheduler triggers (every 15 min)
         ↓
POST /api/v1/scheduler/trigger
         ↓
Query customer_pipeline_configs
  WHERE next_run_time <= NOW()
    AND is_active = true
  LIMIT 1000 OFFSET 0
         ↓
For each config:
  1. Generate idempotency_key
  2. INSERT INTO scheduled_pipeline_runs
     (with ON CONFLICT DO NOTHING)
  3. UPDATE customer_pipeline_configs
     SET next_run_time = calculate_next_run()
         ↓
Return: {processed: 2500, created: 2500}

┌──────────────────────────────────────────────────────────────────┐
│ PHASE 3: Run Execution (Worker Pool)                             │
└──────────────────────────────────────────────────────────────────┘

Worker pod starts up
         ↓
POST /api/v1/scheduler/claim-runs
  {worker_id, max_claims: 10}
         ↓
Query and claim runs:
  UPDATE scheduled_pipeline_runs
  SET state = 'CLAIMED',
      claimed_by = 'worker-abc123',
      claim_expiry_time = NOW() + 5 minutes
  WHERE state = 'PENDING'
  LIMIT 10
         ↓
For each claimed run:
         ↓
  POST /api/v1/pipeline-runs/{run_id}/start
         ↓
  UPDATE scheduled_pipeline_runs
    SET state = 'RUNNING',
        execution_start_time = NOW()
         ↓
  INSERT INTO pipeline_execution_state
    (execution_id, current_state, started_at)
         ↓
  Execute pipeline logic:
    - Extract data from cloud provider
    - Transform data
    - Load into BigQuery
         ↓
  POST /api/v1/pipeline-runs/{run_id}/heartbeat
    (every 60 seconds during execution)
         ↓
  UPDATE pipeline_execution_state
    (progress, records_processed, last_heartbeat)
         ↓
  On Success:
    POST /api/v1/pipeline-runs/{run_id}/complete
         ↓
  UPDATE scheduled_pipeline_runs
    SET state = 'COMPLETED',
        execution_end_time = NOW(),
        status = 'SUCCESS'
         ↓
  INSERT INTO pipeline_execution_history
    (archive completed run)
         ↓
  DELETE FROM pipeline_execution_state
         ↓
  UPDATE customer_pipeline_configs
    SET last_run_time = NOW(),
        last_run_status = 'COMPLETED',
        consecutive_failures = 0

┌──────────────────────────────────────────────────────────────────┐
│ PHASE 4: Retry on Failure                                        │
└──────────────────────────────────────────────────────────────────┘

On Failure:
  POST /api/v1/pipeline-runs/{run_id}/fail
         ↓
  UPDATE scheduled_pipeline_runs
    SET state = 'FAILED',
        execution_end_time = NOW()
         ↓
  IF attempt_number < max_attempts:
         ↓
    Calculate retry_after with exponential backoff:
      retry_after = NOW() + (2^attempt_number * base_delay)
         ↓
    INSERT INTO scheduled_pipeline_runs
      (new run with attempt_number + 1,
       parent_run_id = failed_run_id)
         ↓
  ELSE:
    UPDATE customer_pipeline_configs
      SET consecutive_failures += 1
         ↓
    Send alert if consecutive_failures >= 3
```

### 6.2 State Transition Diagram

```
                    ┌──────────────┐
                    │   PENDING    │
                    └──────┬───────┘
                           │
          Cloud Scheduler creates run
                           │
                           ▼
                    ┌──────────────┐
          ┌─────────│   CLAIMED    │─────────┐
          │         └──────┬───────┘         │
          │                │                 │
   Claim expired    Worker starts       Worker crashes
          │                │                 │
          │                ▼                 │
          │         ┌──────────────┐         │
          └────────▶│   RUNNING    │◀────────┘
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         Success      Failure      Timeout
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐  ┌─────────┐  ┌─────────┐
       │COMPLETED │  │ FAILED  │  │ TIMEOUT │
       └──────────┘  └────┬────┘  └────┬────┘
                          │            │
                          └────┬───────┘
                               │
                         Retry logic
                               │
                               ▼
                    ┌──────────────────┐
                    │ PENDING (retry)  │
                    └──────────────────┘
```

---

## 7. Scalability Strategies

### 7.1 Query Optimization for 10k+ Customers

**Problem**: Querying 10,000+ configurations every 15 minutes

**Solutions**:

1. **Clustering and Partitioning**
```sql
-- customer_pipeline_configs is clustered by:
-- 1. customer_id (for customer-specific queries)
-- 2. next_run_time (for scheduler queries)
-- 3. is_active (filter inactive configs)
-- 4. provider (for provider-specific operations)

-- This ensures scheduler query only scans relevant partitions:
SELECT * FROM customer_pipeline_configs
WHERE next_run_time <= CURRENT_TIMESTAMP()
  AND is_active = true
-- Only scans rows in the next_run_time range
```

2. **Batch Processing**
```python
# Process in batches of 1000 to avoid memory issues
BATCH_SIZE = 1000
offset = 0

while True:
    batch = query_eligible_pipelines(limit=BATCH_SIZE, offset=offset)
    if not batch:
        break

    process_batch(batch)
    offset += BATCH_SIZE
```

3. **Incremental Updates**
```sql
-- Only update next_run_time for processed configs
UPDATE customer_pipeline_configs
SET next_run_time = calculate_next_run_time(schedule_cron, next_run_time)
WHERE config_id IN (SELECT config_id FROM processed_configs)
```

### 7.2 Preventing Duplicate Runs (Idempotency)

**Strategy 1: Unique Idempotency Key**
```sql
-- Unique constraint prevents duplicates
CREATE UNIQUE INDEX idx_idempotency
ON scheduled_pipeline_runs(idempotency_key);

-- Insert with idempotency
INSERT INTO scheduled_pipeline_runs (
  run_id, config_id, scheduled_time, idempotency_key, state
)
VALUES (
  'run-uuid-1',
  'config-uuid-1',
  '2025-11-17T02:00:00Z',
  hash('config-uuid-1:2025-11-17T02:00:00Z'),
  'PENDING'
)
ON CONFLICT (idempotency_key) DO NOTHING;
```

**Strategy 2: Distributed Locks**
```python
from google.cloud import firestore

def create_run_with_lock(config_id, scheduled_time):
    db = firestore.Client()
    lock_key = f"run-lock:{config_id}:{scheduled_time.isoformat()}"

    # Try to acquire lock
    lock_ref = db.collection('locks').document(lock_key)
    transaction = db.transaction()

    @firestore.transactional
    def create_if_not_exists(transaction, lock_ref):
        snapshot = lock_ref.get(transaction=transaction)
        if snapshot.exists:
            return None  # Already created

        # Create run
        run = create_scheduled_run(config_id, scheduled_time)

        # Set lock
        transaction.set(lock_ref, {'created_at': firestore.SERVER_TIMESTAMP})

        return run

    return create_if_not_exists(transaction, lock_ref)
```

### 7.3 Horizontal Scaling with Worker Pools

```yaml
# Kubernetes deployment for worker pool
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pipeline-worker-pool
spec:
  replicas: 10  # Scale based on load
  selector:
    matchLabels:
      app: pipeline-worker
  template:
    spec:
      containers:
      - name: worker
        image: gcr.io/project/pipeline-worker:latest
        env:
        - name: WORKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: MAX_CONCURRENT_RUNS
          value: "5"
        resources:
          requests:
            cpu: 1000m
            memory: 2Gi
          limits:
            cpu: 2000m
            memory: 4Gi
```

**Claim Distribution Logic**:
```python
def claim_runs(worker_id, max_claims):
    """
    Each worker claims runs independently
    No coordination needed - database handles concurrency
    """

    with database.transaction():
        # Query and claim in one transaction
        claimed_runs = database.execute("""
            UPDATE scheduled_pipeline_runs
            SET state = 'CLAIMED',
                claimed_by = @worker_id,
                claimed_at = CURRENT_TIMESTAMP(),
                claim_expiry_time = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
            WHERE run_id IN (
                SELECT run_id
                FROM scheduled_pipeline_runs
                WHERE state = 'PENDING'
                  AND scheduled_time <= CURRENT_TIMESTAMP()
                ORDER BY execution_priority DESC, scheduled_time ASC
                LIMIT @max_claims
            )
            RETURNING *
        """, worker_id=worker_id, max_claims=max_claims)

    return claimed_runs
```

### 7.4 Pub/Sub for Async Execution

**Architecture**:
```
Scheduler → Creates runs → Publishes to Pub/Sub → Workers subscribe → Execute
```

**Implementation**:
```python
from google.cloud import pubsub_v1

publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path('project-id', 'pipeline-runs')

def create_and_publish_run(config):
    """Create run and publish message for workers"""

    # Create run in database
    run = create_scheduled_run(config)

    # Publish message
    message = {
        'run_id': run.run_id,
        'config_id': run.config_id,
        'customer_id': run.customer_id,
        'priority': run.execution_priority
    }

    future = publisher.publish(
        topic_path,
        json.dumps(message).encode('utf-8'),
        run_id=run.run_id  # For deduplication
    )

    return run

# Worker subscribes and processes
def handle_run_message(message):
    """Worker callback for Pub/Sub messages"""

    data = json.loads(message.data)
    run_id = data['run_id']

    # Claim the run
    claimed = claim_run(run_id, worker_id=os.environ['WORKER_ID'])

    if claimed:
        # Execute pipeline
        execute_pipeline_run(run_id)
        message.ack()
    else:
        # Already claimed by another worker
        message.ack()
```

---

## 8. Retry and Error Handling

### 8.1 Retry Strategy

**Exponential Backoff**:
```python
def calculate_retry_delay(attempt_number, base_delay_minutes=5):
    """
    Attempt 1: 5 minutes
    Attempt 2: 10 minutes
    Attempt 3: 20 minutes
    """
    return base_delay_minutes * (2 ** (attempt_number - 1))

def create_retry_run(failed_run):
    """Create retry run for failed execution"""

    if failed_run.attempt_number >= failed_run.max_attempts:
        # Max retries reached
        handle_permanent_failure(failed_run)
        return None

    retry_delay = calculate_retry_delay(failed_run.attempt_number)
    retry_time = datetime.now() + timedelta(minutes=retry_delay)

    retry_run = ScheduledPipelineRun(
        run_id=generate_uuid(),
        config_id=failed_run.config_id,
        customer_id=failed_run.customer_id,
        scheduled_time=retry_time,
        state='PENDING',
        attempt_number=failed_run.attempt_number + 1,
        parent_run_id=failed_run.run_id,
        idempotency_key=generate_idempotency_key(
            failed_run.config_id,
            retry_time
        )
    )

    return retry_run
```

### 8.2 Error Classification

```python
class ErrorType(Enum):
    # Retryable errors
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"  # Retry after delay
    TRANSIENT_NETWORK = "TRANSIENT_NETWORK"      # Immediate retry
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"   # Retry after delay
    TIMEOUT = "TIMEOUT"                           # Retry with longer timeout

    # Non-retryable errors
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"  # Fix credentials
    AUTHORIZATION_FAILED = "AUTHORIZATION_FAILED"    # Fix permissions
    INVALID_CONFIGURATION = "INVALID_CONFIGURATION"  # Fix config
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"        # Fix config

def should_retry(error_type):
    """Determine if error is retryable"""
    retryable_errors = {
        ErrorType.RATE_LIMIT_EXCEEDED,
        ErrorType.TRANSIENT_NETWORK,
        ErrorType.SERVICE_UNAVAILABLE,
        ErrorType.TIMEOUT
    }
    return error_type in retryable_errors

def get_retry_config(error_type):
    """Get retry configuration based on error type"""
    configs = {
        ErrorType.RATE_LIMIT_EXCEEDED: {
            'max_attempts': 5,
            'base_delay_minutes': 15,
            'backoff_multiplier': 2
        },
        ErrorType.TRANSIENT_NETWORK: {
            'max_attempts': 3,
            'base_delay_minutes': 5,
            'backoff_multiplier': 2
        },
        ErrorType.SERVICE_UNAVAILABLE: {
            'max_attempts': 3,
            'base_delay_minutes': 10,
            'backoff_multiplier': 2
        }
    }
    return configs.get(error_type, {
        'max_attempts': 3,
        'base_delay_minutes': 5,
        'backoff_multiplier': 2
    })
```

### 8.3 Handling Permanent Failures

```python
def handle_permanent_failure(failed_run):
    """Handle runs that exceeded max retries or non-retryable errors"""

    # Update config consecutive failures
    update_query = """
        UPDATE customer_pipeline_configs
        SET consecutive_failures = consecutive_failures + 1,
            last_run_status = 'FAILED'
        WHERE config_id = @config_id
    """
    database.execute(update_query, config_id=failed_run.config_id)

    # Check if should disable
    config = get_config(failed_run.config_id)

    if config.consecutive_failures >= 5:
        # Disable pipeline after 5 consecutive failures
        disable_pipeline_config(config.config_id)

        # Send alert
        send_alert(
            customer_id=config.customer_id,
            alert_type='PIPELINE_DISABLED',
            message=f"Pipeline {config.pipeline_template} disabled after 5 consecutive failures",
            severity='HIGH'
        )
    elif config.consecutive_failures >= 3:
        # Warning alert after 3 failures
        send_alert(
            customer_id=config.customer_id,
            alert_type='PIPELINE_FAILING',
            message=f"Pipeline {config.pipeline_template} has failed 3 times consecutively",
            severity='MEDIUM'
        )
```

### 8.4 Claim Expiry and Stuck Runs

```python
def cleanup_expired_claims():
    """
    Background job to reset expired claims
    Run every 5 minutes
    """

    expired_claims = database.execute("""
        UPDATE scheduled_pipeline_runs
        SET state = 'PENDING',
            claimed_by = NULL,
            claimed_at = NULL,
            claim_expiry_time = NULL
        WHERE state = 'CLAIMED'
          AND claim_expiry_time < CURRENT_TIMESTAMP()
        RETURNING run_id, config_id, customer_id
    """)

    # Log for monitoring
    for run in expired_claims:
        logger.warning(f"Claim expired for run {run.run_id}, resetting to PENDING")

def cleanup_stale_executions():
    """
    Detect and handle stale executions (no heartbeat for 5+ minutes)
    Run every 5 minutes
    """

    stale_executions = database.execute("""
        SELECT e.*, r.run_id
        FROM pipeline_execution_state e
        JOIN scheduled_pipeline_runs r ON e.execution_id = r.run_id
        WHERE e.last_heartbeat_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
          AND e.current_state IN ('INITIALIZING', 'RUNNING', 'FINALIZING')
    """)

    for execution in stale_executions:
        # Mark as failed
        fail_run(
            run_id=execution.run_id,
            error_type='STALE_EXECUTION',
            error_message='No heartbeat received for 5 minutes'
        )

        # Create retry
        create_retry_run(execution)
```

---

## 9. Monitoring and SLA Tracking

### 9.1 SLA Metrics

```sql
-- SLA breach detection query
CREATE VIEW pipeline_sla_breaches AS
SELECT
  h.customer_id,
  h.config_id,
  h.pipeline_template,
  h.scheduled_time,
  h.started_at,
  TIMESTAMP_DIFF(h.started_at, h.scheduled_time, MINUTE) as delay_minutes,
  c.sla_breach_threshold_minutes
FROM pipeline_execution_history h
JOIN customer_pipeline_configs c ON h.config_id = c.config_id
WHERE TIMESTAMP_DIFF(h.started_at, h.scheduled_time, MINUTE) > c.sla_breach_threshold_minutes;
```

### 9.2 Monitoring Dashboard Queries

**Overview Metrics**:
```sql
-- Current status overview
SELECT
  state,
  COUNT(*) as count
FROM scheduled_pipeline_runs
WHERE DATE(scheduled_time) = CURRENT_DATE()
GROUP BY state;

-- Running pipelines with progress
SELECT
  r.run_id,
  r.customer_id,
  r.config_id,
  c.pipeline_template,
  e.current_stage,
  e.progress_percentage,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.execution_start_time, MINUTE) as running_minutes
FROM scheduled_pipeline_runs r
JOIN customer_pipeline_configs c ON r.config_id = c.config_id
JOIN pipeline_execution_state e ON r.run_id = e.execution_id
WHERE r.state = 'RUNNING'
ORDER BY running_minutes DESC;

-- Pipelines yet to run (late)
SELECT
  r.run_id,
  r.customer_id,
  c.pipeline_template,
  r.scheduled_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.scheduled_time, MINUTE) as delay_minutes
FROM scheduled_pipeline_runs r
JOIN customer_pipeline_configs c ON r.config_id = c.config_id
WHERE r.state = 'PENDING'
  AND r.scheduled_time < CURRENT_TIMESTAMP()
ORDER BY r.scheduled_time ASC
LIMIT 100;
```

### 9.3 Alerting Rules

```python
class AlertRule:
    def __init__(self, name, query, threshold, severity):
        self.name = name
        self.query = query
        self.threshold = threshold
        self.severity = severity

ALERT_RULES = [
    AlertRule(
        name="High Pending Queue",
        query="SELECT COUNT(*) FROM scheduled_pipeline_runs WHERE state='PENDING'",
        threshold=500,
        severity="HIGH"
    ),
    AlertRule(
        name="Stale Running Executions",
        query="""
            SELECT COUNT(*)
            FROM pipeline_execution_state
            WHERE last_heartbeat_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 10 MINUTE)
        """,
        threshold=10,
        severity="CRITICAL"
    ),
    AlertRule(
        name="High Failure Rate",
        query="""
            SELECT COUNT(*) / (SELECT COUNT(*) FROM scheduled_pipeline_runs WHERE state='COMPLETED') as failure_rate
            FROM scheduled_pipeline_runs
            WHERE state='FAILED'
              AND DATE(scheduled_time) = CURRENT_DATE()
        """,
        threshold=0.05,  # 5% failure rate
        severity="HIGH"
    ),
    AlertRule(
        name="SLA Breaches",
        query="SELECT COUNT(*) FROM pipeline_sla_breaches WHERE DATE(scheduled_time) = CURRENT_DATE()",
        threshold=10,
        severity="MEDIUM"
    )
]

def check_alerts():
    """Run all alert rules and send notifications"""
    for rule in ALERT_RULES:
        result = database.execute(rule.query).scalar()

        if result >= rule.threshold:
            send_alert(
                alert_type=rule.name,
                message=f"{rule.name}: {result} (threshold: {rule.threshold})",
                severity=rule.severity
            )
```

### 9.4 Customer-Facing Metrics

```python
def get_customer_pipeline_metrics(customer_id, start_date, end_date):
    """Get pipeline execution metrics for a customer"""

    return {
        'total_runs': database.execute("""
            SELECT COUNT(*)
            FROM pipeline_execution_history
            WHERE customer_id = @customer_id
              AND scheduled_time BETWEEN @start_date AND @end_date
        """, customer_id=customer_id, start_date=start_date, end_date=end_date).scalar(),

        'successful_runs': database.execute("""
            SELECT COUNT(*)
            FROM pipeline_execution_history
            WHERE customer_id = @customer_id
              AND scheduled_time BETWEEN @start_date AND @end_date
              AND final_state = 'COMPLETED'
        """, customer_id=customer_id, start_date=start_date, end_date=end_date).scalar(),

        'average_duration_seconds': database.execute("""
            SELECT AVG(execution_duration_seconds)
            FROM pipeline_execution_history
            WHERE customer_id = @customer_id
              AND scheduled_time BETWEEN @start_date AND @end_date
              AND final_state = 'COMPLETED'
        """, customer_id=customer_id, start_date=start_date, end_date=end_date).scalar(),

        'sla_compliance_percentage': database.execute("""
            SELECT
              (COUNT(*) FILTER (WHERE sla_met = true) / COUNT(*)) * 100
            FROM pipeline_execution_history
            WHERE customer_id = @customer_id
              AND scheduled_time BETWEEN @start_date AND @end_date
        """, customer_id=customer_id, start_date=start_date, end_date=end_date).scalar(),

        'by_provider': database.execute("""
            SELECT
              provider,
              COUNT(*) as total_runs,
              COUNT(*) FILTER (WHERE final_state = 'COMPLETED') as successful_runs,
              AVG(execution_duration_seconds) as avg_duration
            FROM pipeline_execution_history
            WHERE customer_id = @customer_id
              AND scheduled_time BETWEEN @start_date AND @end_date
            GROUP BY provider
        """, customer_id=customer_id, start_date=start_date, end_date=end_date).fetchall()
    }
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Deliverables**:
- Database schema implementation
- Core state management logic
- Basic scheduling algorithm

**Tasks**:
1. Create BigQuery tables with partitioning and clustering
2. Implement state transition logic
3. Create basic CRUD APIs for pipeline configs
4. Write unit tests for state management

### Phase 2: Scheduler Integration (Week 3-4)

**Deliverables**:
- Cloud Scheduler integration
- Idempotency implementation
- Batch processing logic

**Tasks**:
1. Create Cloud Scheduler job
2. Implement scheduler trigger endpoint
3. Add idempotency key generation
4. Implement pagination for 10k+ customers
5. Write integration tests

### Phase 3: Execution Engine (Week 5-6)

**Deliverables**:
- Worker pool implementation
- Claim and execution logic
- Heartbeat mechanism

**Tasks**:
1. Create worker deployment
2. Implement claim-run logic
3. Add heartbeat updates
4. Implement execution state tracking
5. Add Pub/Sub integration (optional)

### Phase 4: Retry and Error Handling (Week 7)

**Deliverables**:
- Retry logic with exponential backoff
- Error classification
- Cleanup jobs

**Tasks**:
1. Implement retry creation on failure
2. Add error type classification
3. Create cleanup jobs (expired claims, stale executions)
4. Add permanent failure handling

### Phase 5: Monitoring and Alerting (Week 8)

**Deliverables**:
- Dashboard queries
- Alert rules
- Customer-facing metrics

**Tasks**:
1. Create monitoring views
2. Implement alert rules
3. Add customer metrics API
4. Create dashboards in monitoring tool

### Phase 6: Testing and Optimization (Week 9-10)

**Deliverables**:
- Load testing results
- Performance optimization
- Documentation

**Tasks**:
1. Load test with 10k+ customers
2. Optimize query performance
3. Tune batching and pagination
4. Create operational runbooks

---

## Appendix A: Configuration Examples

### Example 1: Daily Cost Billing Pipeline

```json
{
  "customer_id": "customer-001",
  "provider": "GCP",
  "domain": "COST",
  "pipeline_template": "cost_billing",
  "schedule_cron": "0 2 * * *",
  "timezone": "America/New_York",
  "parameters": {
    "billing_account_id": "012345-ABCDEF-678900",
    "project_ids": ["project-1", "project-2"],
    "include_labels": true,
    "include_credits": true,
    "date_range": "previous_day"
  },
  "retry_config": {
    "max_attempts": 3,
    "base_delay_minutes": 5,
    "backoff_multiplier": 2
  },
  "max_execution_duration_minutes": 60,
  "sla_breach_threshold_minutes": 30
}
```

### Example 2: Weekly Security Audit Pipeline

```json
{
  "customer_id": "customer-002",
  "provider": "AWS",
  "domain": "SECURITY",
  "pipeline_template": "security_audit",
  "schedule_cron": "0 3 * * 1",
  "timezone": "UTC",
  "parameters": {
    "aws_account_id": "123456789012",
    "regions": ["us-east-1", "us-west-2", "eu-west-1"],
    "audit_services": ["iam", "s3", "ec2", "rds"],
    "compliance_framework": "CIS_AWS_FOUNDATIONS"
  },
  "retry_config": {
    "max_attempts": 2,
    "base_delay_minutes": 60,
    "backoff_multiplier": 1
  },
  "max_execution_duration_minutes": 180,
  "sla_breach_threshold_minutes": 60
}
```

---

## Appendix B: Performance Benchmarks

### Expected Performance Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Scheduler processing time | < 60s per 1000 configs | For 10k customers: ~10 minutes |
| Run claim latency | < 100ms | Per claim operation |
| State transition latency | < 50ms | Database update |
| Heartbeat update latency | < 30ms | High frequency operation |
| Dashboard query response | < 2s | For overview metrics |
| Customer metrics query | < 1s | For single customer |

### Scalability Targets

| Scale | Concurrent Runs | Workers | Database QPS |
|-------|----------------|---------|--------------|
| 1,000 customers | 100 | 5 pods | 500 |
| 5,000 customers | 500 | 20 pods | 2,000 |
| 10,000 customers | 1,000 | 50 pods | 5,000 |
| 50,000 customers | 5,000 | 200 pods | 20,000 |

---

## Appendix C: Operational Runbooks

### Runbook 1: Handling Stuck Scheduler

**Symptoms**: Pending runs not being created

**Investigation**:
```sql
-- Check last scheduler run
SELECT MAX(created_at)
FROM scheduled_pipeline_runs;

-- Check eligible configs
SELECT COUNT(*)
FROM customer_pipeline_configs
WHERE next_run_time <= CURRENT_TIMESTAMP()
  AND is_active = true;
```

**Resolution**:
1. Check Cloud Scheduler job status
2. Check API endpoint logs
3. Manually trigger: `POST /api/v1/scheduler/trigger`
4. Monitor run creation

### Runbook 2: High Pending Queue

**Symptoms**: Many runs in PENDING state for extended period

**Investigation**:
```sql
-- Check pending run age
SELECT
  COUNT(*),
  MIN(scheduled_time) as oldest_pending,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MIN(scheduled_time), MINUTE) as age_minutes
FROM scheduled_pipeline_runs
WHERE state = 'PENDING';
```

**Resolution**:
1. Scale up worker pool
2. Check for worker crashes/errors
3. Check for database performance issues
4. Verify Pub/Sub delivery (if used)

### Runbook 3: SLA Breaches

**Symptoms**: Pipelines starting late

**Investigation**:
```sql
-- Check SLA breaches
SELECT
  customer_id,
  pipeline_template,
  COUNT(*) as breach_count,
  AVG(TIMESTAMP_DIFF(started_at, scheduled_time, MINUTE)) as avg_delay
FROM pipeline_execution_history
WHERE DATE(scheduled_time) = CURRENT_DATE()
  AND sla_met = false
GROUP BY customer_id, pipeline_template
ORDER BY breach_count DESC;
```

**Resolution**:
1. Identify bottleneck (scheduler or workers)
2. Scale appropriate component
3. Adjust scheduling frequency if needed
4. Review customer pipeline priorities

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Authors**: CloudAct Engineering Team
**Status**: Ready for Review
