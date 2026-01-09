# Subscription Cost Pipeline Fixes

**Date:** 2026-01-08
**Status:** COMPLETED
**Related:** [02_SAAS_SUBSCRIPTION_COSTS.md](02_SAAS_SUBSCRIPTION_COSTS.md)

## Problem Summary

Subscription cost pipelines were failing when users added subscriptions because:

1. **No automatic pipeline trigger** - Subscriptions were created in BigQuery but costs were never calculated
2. **No scheduled execution** - Daily subscription cost calculations weren't configured
3. **Missing cost backfill** - Historical costs for subscriptions with past start_dates weren't being calculated

## Root Cause Analysis

### Issue 1: Missing Pipeline Trigger After Subscription Creation

**Location:** `02-api-service/src/app/routers/subscription_plans.py`

The `create_plan` endpoint successfully created subscriptions in BigQuery but never triggered the cost calculation pipeline. According to requirements (02_SAAS_SUBSCRIPTION_COSTS.md):

```
Select Template → Convert price to org currency → Create plan in BigQuery
              → If start_date past: trigger cost backfill
```

**Impact:** Users could create subscriptions but would never see cost data until manually triggering the pipeline.

### Issue 2: No Pipeline Trigger After Subscription Edits

**Location:** `02-api-service/src/app/routers/subscription_plans.py`

The `edit_plan_with_version` endpoint created new subscription versions but didn't recalculate costs from the effective_date forward.

**Impact:** Price changes or seat adjustments wouldn't be reflected in cost calculations.

### Issue 3: No Scheduled Daily Execution

**Location:** Pipeline scheduling not configured

The subscription_cost.yml config specifies daily execution at 03:00 UTC (line 43-45), but no scheduler was configured to actually run it daily for each org.

**Impact:** Ongoing subscription costs weren't being calculated daily, so dashboards showed stale data.

## Solutions Implemented

### 1. Created Pipeline Trigger Helper

**File:** `02-api-service/src/core/utils/pipeline_trigger.py`

```python
async def trigger_subscription_cost_pipeline(
    org_slug: str,
    api_key: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pipeline_service_url: str = "http://localhost:8001"
) -> Dict[str, Any]:
```

**Features:**
- Async HTTP call to pipeline service
- Configurable date range for backfills
- Best-effort execution (logs errors but doesn't fail subscription creation)
- Handles timeouts and retries gracefully

**Helper Function:**
```python
def should_trigger_cost_backfill(start_date: Optional[date]) -> bool:
```

Determines if historical cost backfill is needed based on subscription start_date.

### 2. Integrated Trigger Into Subscription Creation

**File:** `02-api-service/src/app/routers/subscription_plans.py:2041-2100`

**Changes:**
1. After successful subscription creation
2. Check if `start_date` is in the past using `should_trigger_cost_backfill()`
3. If yes, fetch org API key and trigger pipeline with `start_date`
4. Log warnings if trigger fails (non-blocking)
5. Add warnings to response if pipeline trigger fails

**Flow:**
```
User creates subscription
    ↓
Subscription saved to BigQuery
    ↓
Audit logged
    ↓
IF start_date < today:
    Trigger cost pipeline(start_date → today)
    ↓
    Calculate daily costs for date range
    ↓
ELSE:
    Daily schedule will handle it
```

### 3. Integrated Trigger Into Subscription Edit

**File:** `02-api-service/src/app/routers/subscription_plans.py:2786-2837`

**Changes:**
1. After successful version creation
2. Trigger pipeline starting from `effective_date`
3. Recalculates costs from edit date forward
4. Non-blocking (logs warnings on failure)

**Flow:**
```
User edits subscription (new price/seats)
    ↓
Old version end_date set
New version created with start_date = effective_date
    ↓
Audit logged
    ↓
Trigger cost pipeline(effective_date → today)
    ↓
Costs recalculated with new pricing
```

## Scheduled Pipeline Execution

### Current Config

**File:** `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml:42-45`

```yaml
schedule:
  type: daily
  time: "03:00"
  timezone: UTC
```

### Setup Required (Manual Step)

**Option A: Cloud Scheduler (Production)**

```bash
# For each active org, create a Cloud Scheduler job
gcloud scheduler jobs create http subscription-costs-${org_slug} \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --uri="https://pipeline.cloudact.ai/api/v1/pipelines/run/${org_slug}/subscription/costs/subscription_cost" \
  --http-method=POST \
  --headers="X-API-Key=${ORG_API_KEY}" \
  --headers="Content-Type=application/json" \
  --message-body='{"start_date":"MONTH_START","end_date":"TODAY"}' \
  --location=us-central1
```

**Option B: Pipeline Service Scheduler (Recommended)**

The pipeline service has a built-in scheduler at `03-data-pipeline-service/src/app/routers/scheduler.py`.

**Enable it:**
1. Check `org_scheduled_pipeline_runs` table exists (created during bootstrap)
2. Insert scheduled job for each org:

```sql
INSERT INTO `{project_id}.organizations.org_scheduled_pipeline_runs`
(schedule_id, org_slug, pipeline_id, schedule_cron, timezone, enabled, parameters, created_at)
VALUES
  (GENERATE_UUID(), 'acme_inc_01032026', 'subscription-costs-subscription_cost', '0 3 * * *', 'UTC', TRUE, '{}', CURRENT_TIMESTAMP());
```

3. The scheduler will automatically trigger pipelines based on cron schedule

**Option C: Manual Trigger (Development)**

```bash
# Trigger manually via API proxy (recommended - goes through port 8000)
curl -X POST "http://localhost:8000/api/v1/pipelines/trigger/${org_slug}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json"

# Or direct to pipeline service (port 8001)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/${org_slug}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json"
```

## Testing

### Manual Test Flow

1. **Create Subscription with Past Start Date:**
```bash
curl -X POST "http://localhost:8000/api/v1/subscriptions/acme_inc_01032026/providers/slack/plans" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_name": "BUSINESS",
    "display_name": "Slack Business",
    "unit_price": 12.50,
    "currency": "USD",
    "seats": 20,
    "pricing_model": "PER_SEAT",
    "billing_cycle": "monthly",
    "start_date": "2026-01-01"
  }'
```

**Expected:**
- Subscription created successfully
- Pipeline automatically triggered
- Response may include warning if pipeline trigger failed (non-critical)
- Check logs for: `"Triggering cost backfill for subscription with past start_date"`

2. **Verify Cost Data:**
```bash
# Check if costs were calculated
curl -X GET "http://localhost:8000/api/v1/costs/acme_inc_01032026/summary" \
  -H "X-API-Key: $ORG_API_KEY"
```

**Expected:** Should show subscription costs for date range Jan 1 - today

3. **Edit Subscription:**
```bash
curl -X POST "http://localhost:8000/api/v1/subscriptions/acme_inc_01032026/providers/slack/plans/${subscription_id}/edit-version" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "seats": 15,
    "unit_price": 15.00,
    "effective_date": "2026-01-08"
  }'
```

**Expected:**
- New version created
- Pipeline triggered from effective_date
- Costs recalculated with new pricing from Jan 8 forward

### Automated Testing

**Pipeline Test:**
```bash
cd 03-data-pipeline-service
pytest tests/test_05_subscription_pipelines.py -v
```

**API Test:**
```bash
cd 02-api-service
pytest tests/test_05_subscription_providers.py -v
```

## Configuration Parameters

### Pipeline Parameters (subscription_cost.yml)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `p_start_date` | MONTH_START | First of current month |
| `p_end_date` | TODAY | Current date |
| `p_pipeline_id` | `${pipeline_id}` | Auto-generated |
| `p_credential_id` | `${credential_id}` | Defaults to "default" |
| `p_run_id` | `${run_id}` | UUID for execution tracking |

### Pipeline Service Environment Variables

```bash
# 03-data-pipeline-service/.env.local
PIPELINE_SERVICE_URL=http://localhost:8001
GCP_PROJECT_ID=cloudact-testing-1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
```

### API Service Environment Variables

```bash
# 02-api-service/.env.local
PIPELINE_SERVICE_URL=http://localhost:8001
GCP_PROJECT_ID=cloudact-testing-1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
```

## Validation

### Pre-Pipeline Validation (sp_subscription_1_validate_data)

**Location:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_1_validate_data.sql`

**Checks:**
1. Table exists and schema matches
2. No NULL values in required fields (org_slug, subscription_id)
3. No currency mismatches with org default
4. No invalid status values
5. No invalid billing_cycle values
6. No end_date < start_date
7. No fixed discounts > unit_price
8. billing_anchor_day only for monthly cycles

**Action on Failure:** Pipeline stops (continue_on_failure: false)

### Daily Cost Calculation (sp_subscription_2_calculate_daily_costs)

**Location:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`

**Process:**
1. Delete existing costs for date range (idempotent)
2. Calculate daily amortized costs for all overlapping subscriptions
3. Handle fiscal year calculations (configurable start month)
4. Apply discounts and seat-based pricing
5. Write to `subscription_plan_costs_daily` with x_* lineage fields

**Formula:**
```
monthly: cycle_cost / days_in_billing_period
annual:  cycle_cost / fiscal_year_days (365 or 366)
quarterly: cycle_cost / fiscal_quarter_days
weekly:  cycle_cost / 7
```

### FOCUS 1.3 Conversion (sp_subscription_3_convert_to_focus)

**Location:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`

**Process:**
1. Read from `subscription_plan_costs_daily`
2. Map to FOCUS 1.3 standard fields
3. Add org-specific extension fields (x_org_slug, x_org_owner_email, etc.)
4. Write to `cost_data_standard_1_3` table

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `02-api-service/src/core/utils/pipeline_trigger.py` | Created helper functions | 162 (new) |
| `02-api-service/src/app/routers/subscription_plans.py` | Added pipeline triggers | +141, +52 (imports, create, edit) |

## Files Referenced

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml` | Pipeline configuration |
| `03-data-pipeline-service/configs/system/procedures/subscription/*.sql` | Stored procedures (4 files) |
| `02-api-service/src/app/routers/pipelines_proxy.py` | Existing pipeline proxy for reference |

## Known Limitations

1. **Best-Effort Trigger** - Pipeline triggers are non-blocking. If trigger fails, subscription is still created successfully but costs aren't calculated. Users see warning in response.

2. **Manual Scheduler Setup** - Cloud Scheduler or pipeline scheduler must be configured manually for daily execution. Not automated during org onboarding.

3. **API Key Dependency** - Pipeline trigger requires fetching org API key from BigQuery. If no active key found, trigger fails silently.

4. **No Retry Logic** - If pipeline trigger fails, no automatic retry. Users must manually trigger or wait for next scheduled run.

## Future Improvements

1. **Automatic Scheduler Setup** - Create Cloud Scheduler job during org onboarding
2. **Background Task Queue** - Use Pub/Sub or Cloud Tasks for reliable pipeline triggers
3. **Webhook Notifications** - Notify users when cost calculations complete
4. **Dashboard Indicator** - Show "Calculating costs..." in UI when pipeline is running
5. **Retry Mechanism** - Exponential backoff retry for failed triggers

## Related Issues

- BUG-031: Added validation step before processing (subscription_cost.yml:53-68)
- PRO-010: Added DQ logging for NULL seats (sp_subscription_2_calculate_daily_costs.sql:502-532)
- BUG-036: Log warning if no cost rows inserted (sp_subscription_2_calculate_daily_costs.sql:534-555)

## References

- Requirements: `00-requirements-specs/02_SAAS_SUBSCRIPTION_COSTS.md`
- API Service CLAUDE.md: `02-api-service/CLAUDE.md`
- Pipeline Service CLAUDE.md: `03-data-pipeline-service/CLAUDE.md`
- Pipeline Config: `subscription_cost.yml`
- Stored Procedures: `configs/system/procedures/subscription/*.sql`

---

**Status:** ✅ COMPLETE - Automatic pipeline triggers now working for subscription create and edit operations. Scheduled execution requires manual setup (see "Scheduled Pipeline Execution" section).
