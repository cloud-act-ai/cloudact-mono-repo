# Pipeline Execution Flow

Complete guide to running data pipelines in CloudAct.ai platform.

> **Prerequisites:** See `fronted_v0/CLAUDE.md` for the complete onboarding flow. Organization must be onboarded and have required integrations configured before running pipelines.

---

## Overview

Pipelines are automated data processing workflows that extract, transform, and load (ETL) data from various sources into BigQuery for analytics. Each pipeline requires valid integrations and org API key authentication.

**Key Concepts:**
- **Org-Scoped** - Each organization has isolated pipeline execution
- **Authenticated** - Requires org API key
- **Configurable** - Pipelines defined in YAML configs
- **Monitored** - Execution status tracked in BigQuery
- **Scheduled** - Can run on-demand or scheduled

---

## Available Pipelines

### GCP Billing Pipeline

**ID:** `gcp_billing`

**Purpose:** Extract daily billing cost data from GCP Cloud Billing export

**Required Integration:** GCP Service Account

**Parameters:**
- `date` (optional) - Date to process (YYYY-MM-DD), defaults to yesterday

**Output:** Cost data in `{org_dataset}.gcp_billing_daily_raw` table

**Config:** `configs/gcp/cost/billing.yml`

---

## Authentication & Authorization

### Org API Key Required

All pipeline runs require authentication with org API key:

```typescript
// Frontend automatically gets key from user metadata
const apiKey = user.user_metadata?.org_api_keys?.[orgSlug]

// Backend validates key
const backend = new PipelineBackendClient({ orgApiKey: apiKey })
```

### Integration Requirements

Each pipeline specifies required integrations:

| Pipeline | Required Integration | Why |
|----------|---------------------|-----|
| `gcp_billing` | GCP Service Account | Access Cloud Billing export |
| Future LLM pipelines | OpenAI/Anthropic | Access usage data |

**Validation:** Backend checks integration exists and is valid before running pipeline.

---

## Step-by-Step Flow

### 1. User Triggers Pipeline

```typescript
// app/[orgSlug]/pipelines/page.tsx
import { runGcpBillingPipeline } from "@/actions/pipelines"

async function handleRunPipeline() {
  const result = await runGcpBillingPipeline(orgSlug, "2025-11-25")

  if (result.success) {
    toast.success("Pipeline started!")
    console.log("Run ID:", result.runId)
    console.log("Status:", result.status)
  } else {
    toast.error(result.error)
  }
}
```

---

### 2. Get Org API Key

The frontend retrieves the org API key from secure server-side storage (implemented in `actions/pipelines.ts`). The API key is obtained using the `getOrgApiKeySecure()` function from `actions/backend-onboarding.ts`.

**Why needed:** Backend requires org API key to authenticate pipeline execution requests.

---

### 3. Call Backend Pipeline Endpoint

```typescript
// lib/api/backend.ts
const response = await backend.runPipeline(
  orgSlug,        // "acmecorp"
  "gcp",          // provider
  "billing",      // domain
  { date: "2025-11-25" }  // params
)

// Response
{
  status: "PENDING",
  pipeline_id: "acmecorp-gcp-billing",
  run_id: "550e8400-e29b-41d4-a716-446655440000",
  message: "Pipeline gcp/billing triggered successfully for acmecorp (async mode)"
}
```

---

### 4. Backend Validates Request

```python
# Backend validation steps
1. Validate org API key
2. Check org exists in BigQuery
3. Verify required integration (GCP_SA)
4. Load pipeline config from YAML
5. Create pipeline run record
```

---

### 5. Pipeline Execution

```python
# Pipeline processor executes steps
1. Load config: configs/gcp/cost/billing.yml
2. Get GCP credentials from org_integrations (KMS decrypt)
3. Query Cloud Billing export
4. Transform data (aggregate, filter)
5. Load to BigQuery: {org_dataset}.gcp_billing_daily_raw
6. Update pipeline run status
```

**Pipeline Config Example:**
```yaml
# configs/gcp/cost/billing.yml
pipeline:
  name: gcp_billing
  description: Extract GCP billing costs and store in BigQuery

steps:
  - name: extract
    type: bigquery_query
    source_table: billing_export.gcp_billing_export_v1

  - name: transform
    type: sql_transform
    operations:
      - aggregate_by_service
      - filter_date_range

  - name: load
    type: bigquery_load
    target_table: gcp_billing_daily_raw
```

---

### 6. Monitor Pipeline Status

```typescript
// Check pipeline status (not yet implemented in frontend)
// Backend endpoint: GET /api/v1/pipelines/runs/{pipeline_logging_id}
// Example response:
// {
//   pipeline_logging_id: "550e8400-e29b-41d4-a716-446655440000",
//   pipeline_id: "acmecorp-gcp-billing",
//   status: "RUNNING" | "COMPLETE" | "FAILED",
//   start_time: "2025-11-25T10:00:00Z",
//   end_time: "2025-11-25T10:05:00Z",
//   duration_ms: 300000
// }
```

---

## API Endpoints

### Run Pipeline

**Endpoint:** `POST /api/v1/pipelines/run/{org_slug}/gcp/cost/billing`

**Auth:** Org API Key (`X-API-Key` header)

**Request:**
```json
{
  "date": "2025-11-25",
  "force_refresh": false
}
```

**Response:**
```json
{
  "status": "PENDING",
  "pipeline_logging_id": "550e8400-e29b-41d4-a716-446655440000",
  "pipeline_id": "acmecorp-gcp-billing",
  "org_slug": "acmecorp",
  "message": "Pipeline gcp/billing triggered successfully for acmecorp (async mode)"
}
```

**Status Values:**
- `PENDING` - Pipeline queued for execution
- `RUNNING` - Pipeline currently executing (async)
- `COMPLETE` - Pipeline completed successfully
- `FAILED` - Pipeline failed with error

---

## Code Examples

### Frontend: Run GCP Billing Pipeline

```typescript
import { runGcpBillingPipeline } from "@/actions/pipelines"

// Run for specific date
const result = await runGcpBillingPipeline("acmecorp", "2025-11-25")

if (result.success) {
  console.log("Pipeline completed!")
  console.log("Run ID:", result.runId)
  console.log("Rows processed:", result.result?.rows_processed)
} else {
  console.error("Pipeline failed:", result.error)
}

// Run for yesterday (default)
const result2 = await runGcpBillingPipeline("acmecorp")
```

---

### Frontend: UI Component

```typescript
"use client"

import { useState } from "react"
import { runGcpBillingPipeline } from "@/actions/pipelines"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function PipelineRunner({ orgSlug }: { orgSlug: string }) {
  const [loading, setLoading] = useState(false)

  async function handleRun() {
    setLoading(true)

    const result = await runGcpBillingPipeline(orgSlug)

    if (result.success) {
      toast.success("Pipeline completed successfully!")
    } else {
      toast.error(result.error || "Pipeline failed")
    }

    setLoading(false)
  }

  return (
    <Button onClick={handleRun} disabled={loading}>
      {loading ? "Running..." : "Run GCP Billing Pipeline"}
    </Button>
  )
}
```

---

### CLI: Run Pipeline via Backend

```bash
# Get org API key
ORG_API_KEY="acmecorp_api_xxxxxxxx"

# Run GCP billing pipeline
curl -X POST http://localhost:8000/api/v1/pipelines/run/acmecorp/gcp/cost/billing \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-25"
  }'

# Response
{
  "status": "PENDING",
  "pipeline_logging_id": "550e8400-e29b-41d4-a716-446655440000",
  "pipeline_id": "acmecorp-gcp-billing",
  "org_slug": "acmecorp",
  "message": "Pipeline gcp/billing triggered successfully for acmecorp (async mode)"
}
```

---

## Pipeline Configuration

### YAML Config Structure

```yaml
# configs/gcp/cost/billing.yml
pipeline:
  name: gcp_billing
  description: Extract daily GCP billing costs
  version: "1.0"

required_integrations:
  - GCP_SA

parameters:
  - name: date
    type: string
    required: false
    default: yesterday
    description: Date to process (YYYY-MM-DD)

steps:
  - name: extract
    processor: gcp.bq_etl
    config:
      source_project: billing_project
      source_dataset: billing_export
      source_table: gcp_billing_export_v1

  - name: transform
    processor: gcp.bq_etl
    config:
      operations:
        - aggregate_by_service
        - filter_active_projects

  - name: load
    processor: gcp.bq_etl
    config:
      target_dataset: "{org_slug}"
      target_table: gcp_billing_daily_raw
      write_disposition: WRITE_TRUNCATE
```

---

## Monitoring & Logging

### Pipeline Run Tracking

All pipeline runs are tracked in BigQuery:

**Table:** `{project}.organizations.org_meta_pipeline_runs`

**Schema:**
```sql
CREATE TABLE org_meta_pipeline_runs (
  run_id STRING,
  org_slug STRING,
  pipeline_id STRING,
  status STRING,  -- RUNNING, SUCCESS, FAILED
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  rows_processed INT64,
  error_message STRING,
  parameters JSON
)
```

**Query Recent Runs:**
```sql
SELECT run_id, pipeline_id, status, started_at, rows_processed
FROM `{project}.organizations.org_meta_pipeline_runs`
WHERE org_slug = 'acmecorp'
ORDER BY started_at DESC
LIMIT 10
```

---

### Error Handling

Pipeline errors are captured and returned:

```typescript
const result = await runPipeline(orgSlug, pipelineId, params)

if (!result.success) {
  console.error("Pipeline failed:", result.error)

  // Common errors:
  // - "Organization API key not found"
  // - "Required integration not configured"
  // - "Pipeline execution failed: {details}"
}
```

---

## Troubleshooting

### Issue: "Organization API key not found"

**Cause:** User metadata doesn't have org API key.

**Solution:**
1. Verify backend onboarding completed successfully
2. Contact support if API key is missing
3. API key may need to be regenerated via backend admin

---

### Issue: "Required integration not configured"

**Cause:** Pipeline requires GCP integration but it's not setup.

**Solution:**
```typescript
// Setup GCP integration first
await setupIntegration({
  orgSlug: "acmecorp",
  provider: "gcp",
  credential: serviceAccountJson
})

// Then run pipeline
await runGcpBillingPipeline("acmecorp")
```

---

### Issue: Pipeline runs but no data returned

**Causes:**
1. No billing data for specified date
2. Billing export not configured in GCP
3. Service account lacks permissions

**Solutions:**
1. Check billing export exists in GCP
2. Verify service account has `bigquery.jobs.create` permission
3. Check date parameter is correct
4. Query source table directly to verify data exists

---

### Issue: Pipeline timeout

**Cause:** Large data volume or slow query.

**Solutions:**
1. Process smaller date ranges
2. Optimize query in pipeline config
3. Increase timeout (backend config)

---

## Related Documentation

- [API Key Generation Flow](./api_key_generation_flow.md) - How to generate org API keys
- [Integration Setup Flow](./integration_setup_flow.md) - How to setup required integrations
- [Backend CLAUDE.md](../../cloudact-backend-systems/convergence-data-pipeline/CLAUDE.md) - Backend architecture

---

## Quick Reference

| Action | Frontend Function | Backend Endpoint |
|--------|------------------|------------------|
| Run pipeline | `runPipeline()` | `POST /api/v1/pipelines/run/{org_slug}/{provider}/{domain}` |
| Run GCP billing | `runGcpBillingPipeline()` | `POST /api/v1/pipelines/run/{org_slug}/gcp/cost/billing` |
| Get status | - (not implemented) | `GET /api/v1/pipelines/runs/{pipeline_logging_id}` |
| List runs | - (not implemented) | `GET /api/v1/pipelines/runs` |

**Available Pipelines:**
- `gcp_billing` - GCP billing data extraction
