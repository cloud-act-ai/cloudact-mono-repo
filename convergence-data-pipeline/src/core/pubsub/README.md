# Pub/Sub Integration

## Overview

The Pub/Sub integration enables distributed, scalable pipeline execution across multiple worker instances. This architecture supports processing 10,000+ tenants with load leveling and fault tolerance.

## Architecture

```
Admin API
    ↓ (Batch Publish)
Google Cloud Pub/Sub Topic
    ↓ (Message Distribution)
Worker Instances (Auto-scaling)
    ↓ (Pull & Process)
Pipeline Execution
    ↓ (Log Results)
BigQuery Metadata Tables
```

## Components

### Publisher

**File:** `src/core/pubsub/publisher.py`

**Purpose:** Publishes pipeline execution tasks to Pub/Sub topic

**Usage:**
```python
from src.core.pubsub.publisher import PubSubPublisher

publisher = PubSubPublisher(
    project_id="gac-prod-471220",
    topic_id="pipeline-tasks"
)

# Publish single task
await publisher.publish_task({
    "tenant_id": "acme_corp",
    "pipeline_id": "gcp-cost-billing",
    "date": "2025-11-15",
    "trigger_by": "scheduler"
})

# Batch publish (10k tenants)
tasks = [
    {"tenant_id": f"tenant_{i}", ...}
    for i in range(10000)
]
await publisher.publish_batch(tasks)
```

### Subscriber/Worker

**File:** `src/core/pubsub/subscriber.py`

**Purpose:** Pulls messages from Pub/Sub and executes pipelines

**Usage:**
```python
from src.core/pubsub.subscriber import PubSubSubscriber

subscriber = PubSubSubscriber(
    project_id="gac-prod-471220",
    subscription_id="pipeline-workers"
)

# Start worker
await subscriber.start_worker(
    callback=process_pipeline_task,
    max_messages=10,
    timeout=300
)
```

## Message Format

### Task Message

```json
{
  "tenant_id": "acme_corp",
  "provider": "gcp",
  "domain": "cost",
  "pipeline_id": "cost_billing",
  "date": "2025-11-15",
  "trigger_by": "scheduler",
  "parameters": {
    "filter_date": "2025-11-15",
    "admin_email": "ops@acme.com"
  },
  "metadata": {
    "batch_id": "batch_20251115_001",
    "priority": "normal",
    "scheduled_time": "2025-11-15T00:00:00Z"
  }
}
```

## Batch Publishing Workflow

### API Endpoint

```bash
POST /api/v1/pipelines/batch/publish
```

**Authentication:** Requires admin API key

**Request:**
```json
{
  "pipeline_template": "gcp/cost/cost_billing",
  "tenant_ids": ["tenant1", "tenant2", ...],  // or "all"
  "date": "2025-11-15",
  "parameters": {
    "filter_date": "2025-11-15"
  },
  "batch_size": 100,
  "rate_limit_per_second": 50
}
```

**Response:**
```json
{
  "batch_id": "batch_20251115_001",
  "total_tasks": 10000,
  "published_count": 10000,
  "failed_count": 0,
  "estimated_completion": "2025-11-15T02:00:00Z"
}
```

### Batch Processing

```python
# src/core/pubsub/publisher.py

async def publish_batch(
    self,
    tasks: List[Dict],
    batch_size: int = 100,
    rate_limit: int = 50
):
    """
    Publish tasks in batches with rate limiting

    Args:
        tasks: List of pipeline task dictionaries
        batch_size: Number of tasks per batch (default: 100)
        rate_limit: Max publications per second (default: 50)

    Returns:
        Publication summary
    """
    published = 0
    failed = 0

    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i+batch_size]

        # Publish batch
        results = await self._publish_batch_internal(batch)

        published += sum(1 for r in results if r.success)
        failed += sum(1 for r in results if not r.success)

        # Rate limiting
        await asyncio.sleep(batch_size / rate_limit)

    return {
        "total": len(tasks),
        "published": published,
        "failed": failed
    }
```

## Worker Configuration

### Auto-scaling

**GKE/Cloud Run Configuration:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: pipeline-worker
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: pipeline-worker
  minReplicas: 3
  maxReplicas: 100
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: External
    external:
      metric:
        name: pubsub.googleapis.com|subscription|num_undelivered_messages
        selector:
          resource.labels.subscription_id: pipeline-workers
      target:
        type: AverageValue
        averageValue: "30"
```

### Worker Environment Variables

```bash
# Pub/Sub Configuration
GCP_PROJECT_ID=gac-prod-471220
PUBSUB_SUBSCRIPTION_ID=pipeline-workers
PUBSUB_MAX_MESSAGES=10         # Concurrent message processing
PUBSUB_TIMEOUT_SECONDS=300     # Message acknowledgment deadline

# Worker Configuration
WORKER_POOL_SIZE=5             # Concurrent pipeline executions
WORKER_TIMEOUT_MINUTES=30      # Maximum pipeline execution time
WORKER_RETRY_FAILED=true       # Retry failed pipelines

# Logging
LOG_LEVEL=INFO
STRUCTURED_LOGGING=true
```

## Error Handling

### Message Retries

Pub/Sub automatically retries failed messages with exponential backoff:

```
Attempt 1: Immediate
Attempt 2: 10 seconds
Attempt 3: 100 seconds
Attempt 4: 1000 seconds (16.6 minutes)
...
Max: 7 days retention
```

### Dead Letter Queue

Configure DLQ for messages that exceed retry attempts:

```bash
gcloud pubsub subscriptions update pipeline-workers \
  --dead-letter-topic=pipeline-dlq \
  --max-delivery-attempts=5
```

**Monitor DLQ:**
```bash
gcloud pubsub subscriptions pull pipeline-dlq-sub \
  --auto-ack \
  --limit=10
```

### Error Logging

```python
# Worker error handling
try:
    result = await execute_pipeline(task)
except Exception as e:
    logger.error(
        "Pipeline execution failed",
        extra={
            "tenant_id": task["tenant_id"],
            "pipeline_id": task["pipeline_id"],
            "error": str(e),
            "stack_trace": traceback.format_exc()
        },
        exc_info=True
    )

    # Nack message for retry
    message.nack()
```

## Monitoring

### Key Metrics

```python
# Prometheus metrics
pipeline_tasks_published_total
pipeline_tasks_completed_total
pipeline_tasks_failed_total
pipeline_execution_duration_seconds
pubsub_messages_unacked
worker_pool_utilization
```

### Cloud Monitoring Queries

**Undelivered Messages:**
```
fetch pubsub_subscription
| metric 'pubsub.googleapis.com/subscription/num_undelivered_messages'
| filter resource.subscription_id == 'pipeline-workers'
| group_by 1m, [value_num_undelivered_messages_mean: mean(value.num_undelivered_messages)]
```

**Oldest Unacked Message Age:**
```
fetch pubsub_subscription
| metric 'pubsub.googleapis.com/subscription/oldest_unacked_message_age'
| filter resource.subscription_id == 'pipeline-workers'
```

### Alerting

```yaml
# Cloud Monitoring Alert Policy
displayName: "High Pub/Sub Message Backlog"
conditions:
- displayName: "Messages undelivered > 1000"
  conditionThreshold:
    filter: |
      resource.type="pubsub_subscription"
      resource.labels.subscription_id="pipeline-workers"
      metric.type="pubsub.googleapis.com/subscription/num_undelivered_messages"
    comparison: COMPARISON_GT
    thresholdValue: 1000
    duration: 300s
notificationChannels:
- projects/PROJECT/notificationChannels/CHANNEL_ID
```

## Testing

### Local Development

```python
# Mock Pub/Sub for testing
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_publisher():
    publisher = PubSubPublisher(
        project_id="test-project",
        topic_id="test-topic"
    )

    # Mock publish method
    publisher._client.publish = AsyncMock(return_value="message-id-123")

    result = await publisher.publish_task({
        "tenant_id": "test_tenant",
        "pipeline_id": "test_pipeline"
    })

    assert result.success
    assert result.message_id == "message-id-123"
```

### Integration Testing

```bash
# Start emulator
gcloud beta emulators pubsub start --project=test-project

# Set environment
export PUBSUB_EMULATOR_HOST=localhost:8085

# Run tests
pytest tests/integration/test_pubsub.py
```

## Best Practices

### 1. Batch Size Optimization

```python
# Too small: High API overhead
batch_size = 10  # Bad

# Too large: Memory issues, slow processing
batch_size = 10000  # Bad

# Optimal: Balance throughput and memory
batch_size = 100  # Good
```

### 2. Rate Limiting

```python
# Prevent Pub/Sub quota exhaustion
rate_limit_per_second = 50  # Good for sustained load

# Burst publishing
rate_limit_per_second = 1000  # Use sparingly, monitor quotas
```

### 3. Message Ordering

```python
# Use ordering keys for tenant-level ordering
publisher.publish_task(
    task,
    ordering_key=task["tenant_id"]  # Ensures tenant tasks process in order
)
```

### 4. Idempotency

```python
# Ensure pipelines are idempotent (safe to retry)
# Use atomic concurrency control in database
INSERT INTO pipeline_runs (...)
WHERE NOT EXISTS (
    SELECT 1 FROM pipeline_runs
    WHERE pipeline_id = @pipeline_id
      AND status IN ('RUNNING', 'PENDING')
)
```

## Deployment

### Create Topic

```bash
gcloud pubsub topics create pipeline-tasks \
  --project=gac-prod-471220 \
  --message-retention-duration=7d
```

### Create Subscription

```bash
gcloud pubsub subscriptions create pipeline-workers \
  --topic=pipeline-tasks \
  --ack-deadline=600 \
  --message-retention-duration=7d \
  --expiration-period=never \
  --enable-exactly-once-delivery
```

### Deploy Workers

```bash
# Cloud Run deployment
gcloud run deploy pipeline-worker \
  --image=gcr.io/gac-prod-471220/pipeline-worker:latest \
  --platform=managed \
  --region=us-central1 \
  --set-env-vars=PUBSUB_SUBSCRIPTION_ID=pipeline-workers \
  --min-instances=3 \
  --max-instances=100 \
  --cpu=2 \
  --memory=4Gi \
  --timeout=3600
```

## Troubleshooting

### Messages Not Processing

**Check:**
1. Subscription exists and is active
2. Workers are running (`gcloud run services describe pipeline-worker`)
3. Messages in subscription (`gcloud pubsub subscriptions describe pipeline-workers`)
4. Worker logs (`gcloud logging read "resource.type=cloud_run_revision"`)

### High Message Age

**Causes:**
- Insufficient worker capacity (scale up)
- Slow pipeline execution (optimize queries)
- Worker errors (check logs)

**Solutions:**
```bash
# Increase max instances
gcloud run services update pipeline-worker --max-instances=200

# Increase worker pool size
gcloud run services update pipeline-worker --set-env-vars=WORKER_POOL_SIZE=10
```

### DLQ Messages

**Investigate:**
```bash
# Pull DLQ messages
gcloud pubsub subscriptions pull pipeline-dlq-sub --auto-ack

# Check common failure patterns
bq query --use_legacy_sql=false '
SELECT
  error_message,
  COUNT(*) as error_count
FROM `gac-prod-471220.x_meta_pipeline_runs`
WHERE DATE(start_time) = CURRENT_DATE()
  AND status = "FAILED"
GROUP BY error_message
ORDER BY error_count DESC
LIMIT 10
'
```

## Security

### IAM Permissions

**Publisher (API service account):**
```bash
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member=serviceAccount:api@gac-prod-471220.iam.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

**Worker (worker service account):**
```bash
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member=serviceAccount:worker@gac-prod-471220.iam.gserviceaccount.com \
  --role=roles/pubsub.subscriber
```

### Message Encryption

```bash
# Enable CMEK
gcloud pubsub topics update pipeline-tasks \
  --topic-encryption-key=projects/PROJECT/locations/us-central1/keyRings/KEYRING/cryptoKeys/KEY
```

## Related Documentation

- **Pipeline Execution**: `src/core/pipeline/README.md`
- **API Reference**: `docs/reference/API_REFERENCE.md`
- **Cloud Pub/Sub Documentation**: https://cloud.google.com/pubsub/docs

## Support

For Pub/Sub integration questions:
1. Check worker logs in Cloud Logging
2. Monitor subscription metrics in Cloud Console
3. Review message payloads in DLQ
4. Contact: data-ops@company.com
