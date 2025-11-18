# GCP Cost Billing Pipeline - Quick Start Guide

## Overview

This guide provides step-by-step instructions to onboard the `docker_customer_3434x4` tenant and execute the GCP cost billing pipeline.

## Prerequisites

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/gcp/credentials.json
export GCP_PROJECT_ID=gac-prod-471220
export DISABLE_AUTH=true
export DEFAULT_TENANT_ID=docker_customer_3434x4

# 3. Start the application
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080 --reload
```

## Step 1: Onboard Customer

**Option A: Using REST API (Recommended)**

```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "docker_customer_3434x4",
    "company_name": "Docker Test Customer",
    "admin_email": "admin@docker-test.com",
    "subscription_plan": "starter"
  }'
```

**Expected Response:**
```json
{
  "tenant_id": "docker_customer_3434x4",
  "api_key": "docker_customer_3434x4_api_xxxxxxxxxxxxxxxx",
  "subscription_plan": "STARTER",
  "dataset_created": true,
  "tables_created": [
    "x_meta_pipeline_runs",
    "x_meta_step_logs",
    "x_meta_dq_results"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Tenant docker_customer_3434x4 onboarded successfully..."
}
```

**Option B: Using Python Test Script**

```bash
python test_docker_customer_billing_pipeline.py
```

---

## Step 2: Trigger the GCP Cost Billing Pipeline

### Method 1: Using cURL (Manual)

```bash
# Set variables
TENANT_ID="docker_customer_3434x4"
API_URL="http://localhost:8080"
PIPELINE_DATE="2024-11-01"

# Trigger pipeline
RESPONSE=$(curl -s -X POST \
  "$API_URL/api/v1/pipelines/run/$TENANT_ID/gcp/cost/cost_billing" \
  -H "Content-Type: application/json" \
  -d "{
    \"date\": \"$PIPELINE_DATE\",
    \"trigger_by\": \"docker_test\"
  }")

# Extract pipeline_logging_id
PIPELINE_ID=$(echo $RESPONSE | jq -r '.pipeline_logging_id')
echo "Pipeline triggered: $PIPELINE_ID"
```

### Method 2: Using Python Test Script

```bash
python test_pipeline_simple.py
```

### Method 3: Using Curl with JSON Output

```bash
curl -X POST http://localhost:8080/api/v1/pipelines/run/docker_customer_3434x4/gcp/cost/cost_billing \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-11-01", "trigger_by": "docker_test"}' | jq .
```

**Expected Response:**
```json
{
  "pipeline_logging_id": "550e8400-e29b-41d4-a716-446655440000",
  "pipeline_id": "docker_customer_3434x4-gcp-cost-billing",
  "tenant_id": "docker_customer_3434x4",
  "status": "PENDING",
  "message": "Templated pipeline cost_billing triggered successfully for docker_customer_3434x4 (async mode)"
}
```

---

## Step 3: Monitor Pipeline Execution

### Check Status (Poll Every 5 Seconds)

```bash
PIPELINE_LOGGING_ID="550e8400-e29b-41d4-a716-446655440000"

curl -s http://localhost:8080/api/v1/pipelines/runs/$PIPELINE_LOGGING_ID | jq .
```

### Monitor with Shell Script

```bash
#!/bin/bash
PIPELINE_ID="550e8400-e29b-41d4-a716-446655440000"
API_URL="http://localhost:8080"

echo "Monitoring pipeline: $PIPELINE_ID"
echo "Polling every 5 seconds..."

while true; do
  STATUS=$(curl -s "$API_URL/api/v1/pipelines/runs/$PIPELINE_ID" | jq -r '.status')
  DURATION=$(curl -s "$API_URL/api/v1/pipelines/runs/$PIPELINE_ID" | jq -r '.duration_ms // 0')

  echo "[$(date '+%H:%M:%S')] Status: $STATUS | Duration: ${DURATION}ms"

  if [[ "$STATUS" == "COMPLETED" ]] || [[ "$STATUS" == "FAILED" ]]; then
    echo "Pipeline finished with status: $STATUS"
    break
  fi

  sleep 5
done
```

---

## Step 4: Query Results in BigQuery

### View Pipeline Metadata

```sql
-- Query pipeline runs
SELECT
  pipeline_logging_id,
  pipeline_id,
  status,
  TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds,
  trigger_by,
  start_time,
  end_time
FROM `gac-prod-471220.docker_customer_3434x4.x_meta_pipeline_runs`
WHERE DATE(start_time) >= CURRENT_DATE() - 7
ORDER BY start_time DESC
LIMIT 10;
```

### View Step Execution Logs

```sql
-- Query step-level logs
SELECT
  step_id,
  step_name,
  status,
  TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds,
  row_count,
  error_message,
  start_time
FROM `gac-prod-471220.docker_customer_3434x4.x_meta_step_logs`
WHERE DATE(start_time) >= CURRENT_DATE()
ORDER BY start_time DESC;
```

### Verify Data Loaded

```sql
-- Check cost data
SELECT
  COUNT(*) as total_rows,
  COUNT(DISTINCT billing_account_id) as billing_accounts,
  COUNT(DISTINCT service_id) as services,
  SUM(cost) as total_cost,
  MIN(usage_start_time) as earliest_usage,
  MAX(usage_end_time) as latest_usage
FROM `gac-prod-471220.docker_customer_3434x4.billing_cost_daily`
WHERE DATE(ingestion_date) = '2024-11-01';
```

---

## API Endpoints Reference

### Pipeline Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template_name}` | Trigger templated pipeline |
| POST | `/api/v1/pipelines/run/{pipeline_id}` | Trigger pipeline (deprecated) |
| GET | `/api/v1/pipelines/runs/{pipeline_logging_id}` | Get pipeline status |
| GET | `/api/v1/pipelines/runs` | List recent pipeline runs |
| DELETE | `/api/v1/pipelines/runs/{pipeline_logging_id}` | Cancel pipeline (placeholder) |

### Tenant Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/tenants/onboard` | Onboard new tenant |
| GET | `/api/v1/tenants/{tenant_id}` | Get tenant profile |
| PUT | `/api/v1/tenants/{tenant_id}` | Update tenant profile |
| POST | `/api/v1/tenants/{tenant_id}/api-keys` | Create API key |
| GET | `/api/v1/tenants/{tenant_id}/api-keys` | List API keys |
| DELETE | `/api/v1/tenants/{tenant_id}/api-keys/{api_key_id}` | Revoke API key |

### Admin Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pipelines/batch/publish` | Publish batch to Pub/Sub (admin) |

---

## Pipeline Template: cost_billing

### Configuration File
**Location:** `configs/gcp/cost/cost_billing.yml`

```yaml
pipeline_id: "{tenant_id}-gcp-cost-billing"
description: "Extract GCP billing costs for tenant {tenant_id} - date {date}"

variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_01ECB7_6EE0BA_7357F1"
  destination_dataset_type: "gcp_silver_cost"
  destination_table: "billing_cost_daily"

steps:
  - step_id: "extract_billing_costs"
    name: "Extract GCP Billing Costs"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 20
    source:
      bq_project_id: "gac-prod-471220"
      query: |
        SELECT
          billing_account_id,
          service.id AS service_id,
          service.description AS service_description,
          sku.id AS sku_id,
          usage_start_time,
          usage_end_time,
          project.id AS project_id,
          cost,
          currency,
          CURRENT_DATE() AS ingestion_date
        FROM `{source_billing_table}`
        WHERE DATE(usage_start_time) = '{date}'
        LIMIT 1000

    destination:
      bq_project_id: "gac-prod-471220"
      dataset_type: "{destination_dataset_type}"
      table: "{destination_table}"
      write_mode: "append"
      table_config:
        time_partitioning:
          field: "ingestion_date"
          type: "DAY"
          expiration_days: 730
        clustering_fields:
          - "billing_account_id"
          - "service_id"
          - "project_id"

  - step_id: "notify_on_failure"
    name: "Send Failure Notification"
    ps_type: "notify_systems.email_notification"
    trigger: "on_failure"
    to_emails:
      - "{admin_email}"
      - "data-ops@example.com"
    subject: "[ALERT] Cost Billing Pipeline Failed - {tenant_id}"
```

### Pipeline Variables

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{tenant_id}` | string | docker_customer_3434x4 | Tenant identifier |
| `{date}` | date | 2024-11-01 | Pipeline run date |
| `{provider}` | string | gcp | Cloud provider |
| `{domain}` | string | cost | Pipeline domain |
| `{template_name}` | string | cost_billing | Template name |
| `{admin_email}` | email | admin@docker-test.com | Admin email for notifications |

---

## Troubleshooting

### Problem: 500 Internal Server Error

**Check Application Logs:**
```bash
# Monitor live logs
tail -f application.log

# Search for errors
grep -i error application.log | tail -20
```

**Verify Infrastructure:**
```bash
# Check tenant dataset
bq ls gac-prod-471220:docker_customer_3434x4

# Check metadata tables
bq ls gac-prod-471220:docker_customer_3434x4 | grep x_meta

# Check quota record
bq query --use_legacy_sql=false \
  'SELECT * FROM `gac-prod-471220.tenants.tenant_usage_quotas`
   WHERE tenant_id = "docker_customer_3434x4"'
```

### Problem: Pipeline Status is PENDING for Too Long

**Check System Resources:**
```bash
# Monitor CPU/Memory
top -p $(pgrep -f uvicorn)

# Check background task queue
curl -s http://localhost:8080/health/ready | jq .
```

**Restart Application:**
```bash
# Kill existing process
kill $(pgrep -f uvicorn)

# Restart with debug logging
LOG_LEVEL=DEBUG python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080
```

### Problem: Permission Denied (BigQuery)

**Verify GCP Credentials:**
```bash
# Check credentials file
echo $GOOGLE_APPLICATION_CREDENTIALS
ls -la $GOOGLE_APPLICATION_CREDENTIALS

# Test BigQuery access
bq query --use_legacy_sql=false 'SELECT 1 as test'

# Check project
gcloud config get-value project
```

---

## Performance Tuning

### Optimize Pipeline Execution

```sql
-- Check pipeline execution times
SELECT
  step_id,
  COUNT(*) as executions,
  AVG(TIMESTAMP_DIFF(end_time, start_time, SECOND)) as avg_duration_seconds,
  MAX(TIMESTAMP_DIFF(end_time, start_time, SECOND)) as max_duration_seconds,
  MIN(TIMESTAMP_DIFF(end_time, start_time, SECOND)) as min_duration_seconds
FROM `gac-prod-471220.docker_customer_3434x4.x_meta_step_logs`
WHERE DATE(start_time) >= CURRENT_DATE() - 30
GROUP BY step_id
ORDER BY avg_duration_seconds DESC;
```

### Increase Query Limit

Edit `configs/gcp/cost/cost_billing.yml`:
```yaml
# Change LIMIT from 1000 to 10000
LIMIT 10000
```

### Add Parallel Processing

```python
# In async_executor.py
PIPELINE_MAX_PARALLEL_STEPS = 10  # Execute steps in parallel
PIPELINE_PARTITION_BATCH_SIZE = 10  # Process 10 partitions in parallel
```

---

## Complete End-to-End Example

```bash
#!/bin/bash
set -e

# Configuration
TENANT_ID="docker_customer_3434x4"
API_URL="http://localhost:8080"
PIPELINE_DATE="2024-11-01"

echo "GCP Cost Billing Pipeline - End-to-End Test"
echo "==========================================="
echo ""

# 1. Onboard Customer
echo "Step 1: Onboarding Customer..."
ONBOARD_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/tenants/onboard" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_id\": \"$TENANT_ID\",
    \"company_name\": \"Docker Test Customer\",
    \"admin_email\": \"admin@docker-test.com\",
    \"subscription_plan\": \"starter\"
  }")

echo "Onboarding Response: $ONBOARD_RESPONSE"
echo ""

# 2. Trigger Pipeline
echo "Step 2: Triggering Pipeline..."
TRIGGER_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/pipelines/run/$TENANT_ID/gcp/cost/cost_billing" \
  -H "Content-Type: application/json" \
  -d "{
    \"date\": \"$PIPELINE_DATE\",
    \"trigger_by\": \"e2e_test\"
  }")

PIPELINE_ID=$(echo $TRIGGER_RESPONSE | jq -r '.pipeline_logging_id')
echo "Pipeline triggered: $PIPELINE_ID"
echo ""

# 3. Monitor Execution
echo "Step 3: Monitoring Pipeline Execution..."
TIMEOUT=300
START_TIME=$(date +%s)

while true; do
  STATUS=$(curl -s "$API_URL/api/v1/pipelines/runs/$PIPELINE_ID" | jq -r '.status')
  ELAPSED=$(($(date +%s) - START_TIME))

  echo "[${ELAPSED}s] Status: $STATUS"

  if [[ "$STATUS" == "COMPLETED" ]] || [[ "$STATUS" == "FAILED" ]]; then
    echo "Pipeline finished: $STATUS"
    break
  fi

  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo "Timeout after $TIMEOUT seconds"
    exit 1
  fi

  sleep 5
done

# 4. Query Results
echo ""
echo "Step 4: Querying Results..."

bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as rows_loaded
   FROM \`gac-prod-471220.$TENANT_ID.billing_cost_daily\`
   WHERE DATE(ingestion_date) = '$PIPELINE_DATE'"

echo ""
echo "✅ Test Complete!"
```

---

## Support & Additional Resources

- **API Documentation:** http://localhost:8080/docs
- **BigQuery Console:** https://console.cloud.google.com/bigquery
- **GCP Project:** gac-prod-471220
- **Template Directory:** `configs/gcp/cost/`
- **Metadata Schemas:** `configs/metadata/schemas/`

---

*Last Updated: November 18, 2025*
