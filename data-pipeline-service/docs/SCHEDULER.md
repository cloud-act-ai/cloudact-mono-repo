# Pipeline Scheduler & Queue Processing

## Overview

The scheduler system handles automated pipeline execution for all organizations. It uses a **two-tier architecture**:

1. **Trigger Tier**: Populates the execution queue with pipelines due to run
2. **Worker Tier**: Processes pipelines from the queue in batches

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SCHEDULER ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Cloud Scheduler (Hourly)                                                │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────┐                                                    │
│  │ POST /scheduler/ │  Tier 1: TRIGGER                                   │
│  │     trigger      │  - Find pipelines due now                          │
│  └────────┬─────────┘  - Insert into execution queue                     │
│           │            - Returns: triggered_count, queued_count          │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────┐                │
│  │        org_pipeline_execution_queue (BigQuery)       │                │
│  │  ┌─────────┬─────────┬─────────┬─────────┬────────┐  │                │
│  │  │ run_id  │org_slug │pipeline │priority │ state  │  │                │
│  │  ├─────────┼─────────┼─────────┼─────────┼────────┤  │                │
│  │  │ uuid-1  │ acme    │ gcp/... │    5    │ QUEUED │  │                │
│  │  │ uuid-2  │ guru    │ openai  │    5    │ QUEUED │  │                │
│  │  │ uuid-3  │ acme    │ anthro  │    3    │ QUEUED │  │                │
│  │  │  ...    │  ...    │  ...    │   ...   │  ...   │  │                │
│  │  └─────────┴─────────┴─────────┴─────────┴────────┘  │                │
│  └──────────────────────────────────────────────────────┘                │
│           │                                                              │
│           ▼                                                              │
│  Cloud Scheduler (Every Minute)                                          │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────┐                                                    │
│  │ POST /scheduler/ │  Tier 2: WORKER (Batch Processing)                 │
│  │  process-queue   │  - Loop for 50 seconds                             │
│  └────────┬─────────┘  - Spawn up to 100 pipelines (concurrency limit)   │
│           │            - Returns: processed_count, started_pipelines     │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────┐                │
│  │              Background Tasks (FastAPI)              │                │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │                │
│  │  │Pipeline1│ │Pipeline2│ │Pipeline3│ │   ...   │    │                │
│  │  │ Running │ │ Running │ │ Running │ │         │    │                │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │                │
│  └──────────────────────────────────────────────────────┘                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### 1. Trigger Scheduler (Tier 1)

**Populates the queue with pipelines due to run.**

```bash
POST /api/v1/scheduler/trigger
```

**Headers:**
```
X-CA-Root-Key: {admin_api_key}
```

**Query Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 100 | Max pipelines to trigger per call |

**Response:**
```json
{
  "triggered_count": 50,
  "queued_count": 50,
  "skipped_count": 0,
  "details": {
    "orgs_processed": 10,
    "pipelines_per_org": {"acme": 5, "guru": 5, ...}
  }
}
```

**When to call:** Hourly via Cloud Scheduler

---

### 2. Process Queue (Tier 2) - Batch Worker

**Processes multiple pipelines from the queue in a single API call.**

```bash
POST /api/v1/scheduler/process-queue
```

**Headers:**
```
X-CA-Root-Key: {admin_api_key}
```

**Response:**
```json
{
  "processed": true,
  "processed_count": 47,
  "started_pipelines": ["gcp/cost/billing", "openai/cost/usage_cost", ...],
  "elapsed_seconds": 12.3,
  "status": "BATCH_COMPLETE",
  "message": "Started 47 pipelines in 12.3s"
}
```

**Behavior:**
- Loops for up to **50 seconds** (configurable via `QUEUE_PROCESS_TIME_LIMIT_SECONDS`)
- Stops when:
  - Time limit reached
  - Queue is empty
  - At concurrency limit (100 pipelines in PROCESSING state)
- Spawns pipelines as background tasks (fast, doesn't wait for completion)

**When to call:** Every minute via Cloud Scheduler

---

## Cloud Scheduler Setup

### Option A: Google Cloud Scheduler (Recommended for Production)

```bash
# Tier 1: Trigger - runs hourly at minute 0
gcloud scheduler jobs create http trigger-pipelines \
  --schedule="0 * * * *" \
  --uri="https://convergence-pipeline-prod-xxx.run.app/api/v1/scheduler/trigger" \
  --http-method=POST \
  --headers="X-CA-Root-Key=YOUR_ADMIN_KEY" \
  --time-zone="UTC"

# Tier 2: Worker - runs every minute
gcloud scheduler jobs create http process-queue \
  --schedule="* * * * *" \
  --uri="https://convergence-pipeline-prod-xxx.run.app/api/v1/scheduler/process-queue" \
  --http-method=POST \
  --headers="X-CA-Root-Key=YOUR_ADMIN_KEY" \
  --time-zone="UTC"
```

### Option B: Cron (For Local/Dev)

```bash
# crontab -e
0 * * * * curl -X POST http://localhost:8001/api/v1/scheduler/trigger -H "X-CA-Root-Key: $KEY"
* * * * * curl -X POST http://localhost:8001/api/v1/scheduler/process-queue -H "X-CA-Root-Key: $KEY"
```

### Option C: Manual Testing

```bash
# Set your admin key
export ADMIN_KEY="your-ca-root-api-key"
export BASE_URL="http://localhost:8001"

# Step 1: Trigger - populate queue
curl -X POST "$BASE_URL/api/v1/scheduler/trigger?limit=200" \
  -H "X-CA-Root-Key: $ADMIN_KEY" | jq

# Step 2: Process - start pipelines (call multiple times if needed)
curl -X POST "$BASE_URL/api/v1/scheduler/process-queue" \
  -H "X-CA-Root-Key: $ADMIN_KEY" | jq

# Check status
curl "$BASE_URL/api/v1/scheduler/status" \
  -H "X-CA-Root-Key: $ADMIN_KEY" | jq
```

---

## Scaling: 200 Pipelines Example

**Scenario:** 10 customers × 20 pipelines each = 200 pipelines

### Flow

```
Time 00:00 - Trigger runs
├── Queries org_pipeline_configs for due pipelines
├── Finds 200 pipelines due
├── Inserts 200 rows into org_pipeline_execution_queue (state=QUEUED)
└── Returns: triggered_count=200

Time 00:01 - Process-queue runs (1st call)
├── Checks concurrency: 0/100 running
├── Loops for 50 seconds, spawning pipelines
├── Spawns 100 pipelines (hits concurrency limit)
├── Queue state: 100 PROCESSING, 100 QUEUED
└── Returns: processed_count=100

Time 00:02 - Process-queue runs (2nd call)
├── Checks concurrency: 80/100 running (20 completed)
├── Spawns 20 more pipelines
├── Queue state: 100 PROCESSING, 80 QUEUED
└── Returns: processed_count=20

Time 00:03 - Process-queue runs (3rd call)
├── Checks concurrency: 60/100 running (40 completed)
├── Spawns 40 more pipelines
└── ... continues until queue empty
```

**Result:** All 200 pipelines started within ~5 minutes (not 3+ hours)

---

## Configuration

| Setting | Default | Env Var | Description |
|---------|---------|---------|-------------|
| `pipeline_global_concurrent_limit` | 100 | `PIPELINE_GLOBAL_CONCURRENT_LIMIT` | Max pipelines running simultaneously |
| `queue_process_time_limit_seconds` | 50 | `QUEUE_PROCESS_TIME_LIMIT_SECONDS` | Max time per process-queue call |

### Tuning for Higher Throughput

```bash
# If you have more Cloud Run capacity, increase concurrency
export PIPELINE_GLOBAL_CONCURRENT_LIMIT=200

# If Cloud Run timeout is higher than 60s, increase loop time
export QUEUE_PROCESS_TIME_LIMIT_SECONDS=120
```

---

## Queue States

| State | Description |
|-------|-------------|
| `QUEUED` | Waiting to be processed |
| `PROCESSING` | Currently running |
| `COMPLETED` | Finished successfully (removed from queue) |
| `FAILED` | Failed, may retry or removed |

---

## Monitoring

### Check Queue Status

```bash
curl "$BASE_URL/api/v1/scheduler/status" \
  -H "X-CA-Root-Key: $ADMIN_KEY" | jq
```

Response:
```json
{
  "total_active_pipelines": 150,
  "pipelines_due_now": 0,
  "pipelines_queued": 50,
  "pipelines_running": 100,
  "pipelines_completed_today": 423,
  "pipelines_failed_today": 2,
  "queue_length": 50,
  "avg_execution_time_seconds": 45.2
}
```

### BigQuery Queries

```sql
-- Queue status
SELECT state, COUNT(*) as count
FROM `project.organizations.org_pipeline_execution_queue`
GROUP BY state;

-- Stuck pipelines (processing > 1 hour)
SELECT *
FROM `project.organizations.org_pipeline_execution_queue`
WHERE state = 'PROCESSING'
  AND processing_started_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR);
```

---

## Cleanup

### Reset Stuck Pipelines

```bash
# Cleanup orphaned pipelines (stuck in PROCESSING for > 60 minutes)
curl -X POST "$BASE_URL/api/v1/scheduler/cleanup-orphaned-pipelines?timeout_minutes=60" \
  -H "X-CA-Root-Key: $ADMIN_KEY"
```

### Reset Daily Quotas

```bash
# Called daily by Cloud Scheduler
curl -X POST "$BASE_URL/api/v1/scheduler/reset-daily-quotas" \
  -H "X-CA-Root-Key: $ADMIN_KEY"
```

---

## Architecture Summary

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Cloud Scheduler │     │ Cloud Scheduler │     │   Pipeline      │
│    (Hourly)     │     │   (Every Min)   │     │   Execution     │
└────────┬────────┘     └────────┬────────┘     └────────▲────────┘
         │                       │                       │
         ▼                       ▼                       │
┌─────────────────┐     ┌─────────────────┐              │
│    /trigger     │────▶│  process-queue  │──────────────┘
│                 │     │   (batch loop)  │
│ Find due pipes  │     │                 │
│ Insert to queue │     │ Spawn up to 100 │
└─────────────────┘     │ background tasks│
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    BigQuery     │
                        │ execution_queue │
                        └─────────────────┘
```

**Key Points:**
1. **Trigger** runs hourly - populates queue
2. **Process-queue** runs every minute - batch processes queue
3. **Concurrency limit** (100) prevents resource exhaustion
4. **Time limit** (50s) ensures Cloud Run doesn't timeout
5. **Background tasks** allow fast API response while pipelines run

---

**Last Updated:** 2025-12-02
