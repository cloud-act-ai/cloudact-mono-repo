# Pipeline Flow

This document describes the pipeline execution flow including available pipelines, execution, quota enforcement, and result retrieval.

## Overview

```
User                 Frontend              API Service (8000)    Pipeline (8001)      BigQuery
  │                     │                        │                    │                  │
  ├── Run Pipeline ─────┤                        │                    │                  │
  │                     │                        │                    │                  │
  │                     ├── runPipeline() ───────┤                    │                  │
  │                     │   [Validate inputs]    │                    │                  │
  │                     │   [Check membership]   │                    │                  │
  │                     │   [Get API key]        │                    │                  │
  │                     │   [Check subscription] │                    │                  │
  │                     │   [Check integration]  │                    │                  │
  │                     │                        │                    │                  │
  │                     │   POST /pipelines/run/ ├────────────────────┤                  │
  │                     │   {org}/{provider}/    │                    │                  │
  │                     │   {domain}/{pipeline}  │   [Forward] ───────┤                  │
  │                     │   (X-API-Key)          │                    │                  │
  │                     │                        │                    ├── Check Quota ───┤
  │                     │                        │                    │                  │
  │                     │                        │                    ├── Increment ─────┤
  │                     │                        │                    │   Usage          │
  │                     │                        │                    │                  │
  │                     │                        │                    ├── Execute ───────┤
  │                     │                        │                    │   Pipeline       │
  │                     │                        │                    │                  │
  │                     │                        │◄── run_id ─────────┤                  │
  │                     │◄── Result ─────────────┤                    │                  │
  │◄── Status ──────────┤                        │                    │                  │
```

## Endpoints

### Frontend Server Actions (`actions/pipelines.ts`)

| Function | Description | Auth |
|----------|-------------|------|
| `getAvailablePipelines()` | List available pipelines | Public (cached) |
| `runPipeline(orgSlug, pipelineId, params)` | Execute a pipeline | User session + Member |
| `runGcpBillingPipeline(orgSlug, date)` | Run GCP billing pipeline | User session + Member |
| `getPipelineRuns(orgSlug, options)` | Get execution history | User session + Member |
| `getPipelineRunDetail(orgSlug, runId)` | Get run details with logs | User session + Member |

### API Service (Port 8000)

| Endpoint | Method | Headers | Description |
|----------|--------|---------|-------------|
| `/api/v1/validator/pipelines` | GET | - | List available pipelines |
| `/api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | POST | `X-API-Key` | Trigger pipeline |
| `/api/v1/pipelines/{org}/runs` | GET | `X-API-Key` | List pipeline runs |
| `/api/v1/pipelines/{org}/runs/{run_id}` | GET | `X-API-Key` | Get run details |

### Pipeline Service (Port 8001)

| Endpoint | Method | Headers | Description |
|----------|--------|---------|-------------|
| `/api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}` | POST | `X-API-Key` | Execute pipeline |

## Available Pipelines

| Pipeline ID | Name | Provider | Domain | Config Path |
|-------------|------|----------|--------|-------------|
| `gcp_billing` | GCP Billing | `gcp` | `cost` | `configs/gcp/cost/billing.yml` |
| `openai_usage_cost` | OpenAI Usage & Cost | `openai` | `` (empty) | `configs/openai/usage_cost.yml` |
| `anthropic_usage_cost` | Anthropic Usage & Cost | `anthropic` | `` (empty) | `configs/anthropic/usage_cost.yml` |

**URL Pattern:**
```
/api/v1/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}
```

## Flows

### 1. Run Pipeline

**Trigger:** User clicks "Run Pipeline" button

**Flow:**
1. Frontend calls `runPipeline(orgSlug, pipelineId, params)`
2. **Input Validation:**
   - Org slug: `^[a-zA-Z0-9_]{3,50}$`
   - Pipeline ID: `^[a-zA-Z0-9_-]{1,50}$`
3. **Authorization:**
   - User authenticated
   - User is member of organization
4. **Get API Key:**
   - Retrieves from `org_api_keys_secure` table
   - If not found: "Complete backend onboarding first"
5. **Validate Pipeline:**
   - Checks pipeline exists in available list
6. **Check Subscription Status:**
   - Queries `organizations.billing_status`
   - Only `active` or `trialing` allowed
   - Blocks: `past_due`, `canceled`, `incomplete`, `paused`
7. **Check Integration:**
   - Verifies required integration is configured
   - GCP_SA for GCP pipelines
   - OPENAI for OpenAI pipelines
   - ANTHROPIC for Anthropic pipelines
8. **Execute Pipeline:**
   - Calls backend with `X-API-Key` header
   - Backend validates quota and runs pipeline
9. **Return Result:**
   - `run_id`, `status`, `message`
   - Status: `PENDING`, `RUNNING`, `SUCCESS`, `COMPLETED`

**Key Code:**
```typescript
// actions/pipelines.ts:240-355
export async function runPipeline(
  orgSlug: string,
  pipelineId: string,
  params?: { date?: string }
): Promise<PipelineRunResult> {
  // Verify subscription status
  const validSubscriptionStatuses = ["active", "trialing"]
  if (!validSubscriptionStatuses.includes(org.billing_status || "")) {
    return {
      success: false,
      error: `Subscription is not active. Current status: ${org.billing_status}`,
    }
  }

  // Verify integration
  const integrationStatus = integrationStatusMap[requiredIntegration]
  if (integrationStatus !== "VALID") {
    return {
      success: false,
      error: `Required integration "${pipeline.required_integration}" is not configured.`,
    }
  }

  // Execute pipeline
  const response = await backend.runPipeline(
    orgSlug,
    pipeline.provider,
    pipeline.domain,
    pipeline.pipeline,
    params
  )
}
```

### 2. Get Available Pipelines

**Trigger:** Dashboard loads or pipeline page

**Flow:**
1. Frontend calls `getAvailablePipelines()`
2. Checks in-memory cache (5 minute TTL)
3. If cache miss, fetches from `/api/v1/validator/pipelines`
4. Returns pipeline list with:
   - `id`, `name`, `description`
   - `provider`, `domain`, `pipeline`
   - `required_integration`
   - `enabled`

**Fallback Pipelines:**
If API unavailable, returns hardcoded defaults:
```typescript
const FALLBACK_PIPELINES = [
  {
    id: "gcp_billing",
    provider: "gcp",
    domain: "cost",
    pipeline: "billing",
    required_integration: "GCP_SA",
  },
  // ... etc
]
```

### 3. Pipeline Quota Enforcement

**Two-Level Check:**

1. **Frontend (Supabase):**
   - Queries `organizations.billing_status`
   - Blocks if not `active` or `trialing`

2. **Backend (BigQuery):**
   - Validates `org_subscriptions.status`
   - Only allows `ACTIVE` or `TRIAL`
   - Checks `org_usage_quotas.pipelines_today < daily_limit`
   - Increments usage on success

**Status Mapping:**
| Frontend Status | Backend Status | Pipeline Access |
|----------------|----------------|-----------------|
| `trialing` | `TRIAL` | Allowed |
| `active` | `ACTIVE` | Allowed |
| `past_due` | `SUSPENDED` | Blocked |
| `canceled` | `CANCELLED` | Blocked |

### 4. Get Pipeline Runs (History)

**Trigger:** Pipeline logs page or dashboard

**Flow:**
1. Frontend calls `getPipelineRuns(orgSlug, options)`
2. Options: `status`, `pipelineId`, `startDate`, `endDate`, `limit`, `offset`
3. Backend queries `pipeline_runs` table in BigQuery
4. Returns list with:
   - `run_id`, `pipeline_id`, `status`
   - `started_at`, `completed_at`
   - `rows_processed`, `duration_seconds`

**Key Code:**
```typescript
// actions/pipelines.ts:383-441
export async function getPipelineRuns(
  orgSlug: string,
  options?: {
    status?: string
    pipelineId?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }
) {
  const backend = new BackendClient({ orgApiKey: apiKey })
  const response = await backend.listPipelineRuns(orgSlug, options)
  return { success: true, data: response }
}
```

### 5. Get Pipeline Run Detail

**Trigger:** Click on specific run in history

**Flow:**
1. Frontend calls `getPipelineRunDetail(orgSlug, runId)`
2. Backend queries `pipeline_runs` and `pipeline_step_logs`
3. Returns:
   - Run metadata (status, timing, rows)
   - Step logs with timestamps
   - Error details if failed

## Integration Requirements

| Pipeline | Required Integration | Status Column |
|----------|---------------------|---------------|
| GCP Billing | `GCP_SA` | `integration_gcp_status` |
| OpenAI Usage | `OPENAI` | `integration_openai_status` |
| Anthropic Usage | `ANTHROPIC` | `integration_anthropic_status` |

**Valid Integration Status:** `VALID`

## Pipeline Parameters

### GCP Billing
```typescript
{
  date?: string  // Format: "YYYY-MM-DD", defaults to yesterday (UTC)
}
```

### OpenAI Usage
```typescript
{
  date?: string  // Format: "YYYY-MM-DD", defaults to yesterday (UTC)
}
```

### Anthropic Usage
```typescript
{
  date?: string  // Format: "YYYY-MM-DD", defaults to yesterday (UTC)
}
```

## Pipeline Status Values

| Status | Description |
|--------|-------------|
| `PENDING` | Pipeline queued for execution |
| `RUNNING` | Pipeline currently executing |
| `SUCCESS` | Pipeline completed successfully |
| `COMPLETED` | Alias for SUCCESS |
| `FAILED` | Pipeline execution failed |
| `CANCELLED` | Pipeline was cancelled |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "Organization API key not found" | Backend not onboarded | Complete onboarding in Settings |
| "Subscription is not active" | Invalid billing status | Update payment method |
| "Required integration not configured" | Missing credentials | Setup integration in Settings |
| "Daily quota exceeded" | Usage limit reached | Wait for next day or upgrade |
| "Unknown pipeline" | Invalid pipeline ID | Use valid pipeline from list |

## Security Measures

1. **Input Validation**: Org slug and pipeline ID validated
2. **Authentication**: User must be logged in
3. **Authorization**: User must be org member
4. **API Key Security**: Retrieved from secure table, never exposed
5. **Subscription Check**: Frontend AND backend validate status
6. **Integration Check**: Verifies credentials before execution

## Caching

| Cache | TTL | Purpose |
|-------|-----|---------|
| Available pipelines | 5 minutes | Reduce API calls |
| Integration status | Per-request | Real-time validation |

## Files

| File | Purpose |
|------|---------|
| `actions/pipelines.ts` | Server actions for pipeline operations |
| `lib/api/backend.ts` | `BackendClient` for API calls |
| `app/[orgSlug]/pipelines/page.tsx` | Pipeline execution UI |
| `app/[orgSlug]/pipelines/logs/page.tsx` | Pipeline history UI |

## Backend Config Files

| Path | Description |
|------|-------------|
| `configs/gcp/cost/billing.yml` | GCP billing pipeline config |
| `configs/openai/usage_cost.yml` | OpenAI pipeline config |
| `configs/anthropic/usage_cost.yml` | Anthropic pipeline config |
| `configs/system/pipelines.yml` | Pipeline registry (source of truth) |
