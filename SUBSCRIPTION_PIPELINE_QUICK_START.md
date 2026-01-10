# Subscription Cost Pipeline - Quick Start Guide

**Status:** ✅ ALL ISSUES FIXED (2026-01-08)

## What Was Fixed

✅ **Automatic Pipeline Trigger** - Subscriptions now auto-trigger cost calculation
✅ **Smart Backfill** - Historical costs calculated for past start dates
✅ **Edit Recalculation** - Cost updates when subscriptions are edited
✅ **Comprehensive Testing** - All validations passing

## Quick Test (30 seconds)

```bash
# Set your variables
export ORG_SLUG="your_org_slug"
export ORG_API_KEY="your_api_key"

# 1. Create a subscription with a past start date
curl -X POST "http://localhost:8000/api/v1/subscriptions/${ORG_SLUG}/providers/slack/plans" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_name": "BUSINESS",
    "display_name": "Slack Business Test",
    "unit_price": 12.50,
    "currency": "USD",
    "seats": 20,
    "pricing_model": "PER_SEAT",
    "billing_cycle": "monthly",
    "start_date": "2026-01-01"
  }'

# Expected: HTTP 200, response includes subscription_id
# Look for: Pipeline trigger happens automatically in background

# 2. Wait 5-10 seconds for pipeline to complete

# 3. Verify costs were calculated
curl -X GET "http://localhost:8000/api/v1/costs/${ORG_SLUG}/summary" \
  -H "X-API-Key: $ORG_API_KEY"

# Expected: Should show subscription costs for Jan 1 - today
# Look for: "subscription" category with costs
```

## How It Works Now

### 1. Create Subscription Flow

```
User creates subscription
    ↓
✅ Saved to BigQuery
    ↓
✅ Auto-triggers pipeline IF start_date < today
    ↓
✅ Costs calculated for date range
    ↓
✅ Response includes any warnings
```

### 2. Edit Subscription Flow

```
User edits subscription (price/seats change)
    ↓
✅ New version created with effective_date
    ↓
✅ Auto-triggers pipeline from effective_date
    ↓
✅ Costs recalculated with new pricing
```

## What Happens Automatically

| User Action | Automatic Pipeline Trigger | Date Range |
|-------------|----------------------------|------------|
| Create subscription (past start_date) | ✅ YES | start_date → today |
| Create subscription (today/future) | ❌ NO | Daily schedule handles it |
| Edit subscription | ✅ YES | effective_date → today |
| Delete subscription | ❌ NO | Costs preserved as-is |

## Checking Pipeline Status

```bash
# Check if pipeline is running
curl -X GET "http://localhost:8000/api/v1/pipelines/status/${ORG_SLUG}" \
  -H "X-API-Key: $ORG_API_KEY"

# Get pipeline run history
curl -X GET "http://localhost:8000/api/v1/pipelines/runs?org_slug=${ORG_SLUG}" \
  -H "X-API-Key: $ORG_API_KEY"
```

## Manual Trigger (if needed)

```bash
# Trigger subscription cost calculation manually
curl -X POST "http://localhost:8000/api/v1/pipelines/trigger/${ORG_SLUG}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# With custom date range
curl -X POST "http://localhost:8000/api/v1/pipelines/trigger/${ORG_SLUG}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2026-01-01",
    "end_date": "2026-01-08"
  }'
```

## Daily Scheduled Execution

For ongoing daily cost calculations, set up a cron job (one-time setup):

```bash
# Option A: Cloud Scheduler (Production)
gcloud scheduler jobs create http subscription-costs-${ORG_SLUG} \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --uri="https://pipeline.cloudact.ai/api/v1/pipelines/run/${ORG_SLUG}/subscription/costs/subscription_cost" \
  --http-method=POST \
  --headers="X-API-Key=${ORG_API_KEY}" \
  --headers="Content-Type=application/json" \
  --message-body='{}' \
  --location=us-central1

# Option B: Cron job calling API
# Add to crontab: 0 3 * * * curl -X POST "https://api.cloudact.ai/api/v1/pipelines/trigger/${ORG_SLUG}/subscription/costs/subscription_cost" -H "X-API-Key: ${ORG_API_KEY}"
```

## Troubleshooting

### Issue: Subscription created but no costs showing

**Check:**
1. Was the subscription created with a past start_date?
   - If yes: Pipeline should have auto-triggered (check logs)
   - If no: Daily schedule will handle it tonight (or trigger manually)

2. Check pipeline logs:
```bash
# API service logs
tail -f 02-api-service/logs/api-service.log | grep "subscription.*pipeline"

# Pipeline service logs
tail -f 03-data-pipeline-service/logs/pipeline-service.log | grep "subscription"
```

3. Look for these log messages:
   - `"Triggering cost backfill for subscription with past start_date"` - Pipeline triggered
   - `"Subscription cost pipeline triggered successfully"` - Trigger succeeded
   - `"Failed to trigger subscription cost pipeline"` - Trigger failed (non-critical)

### Issue: Pipeline trigger failed

**This is non-critical** - Subscription creation still succeeds. You'll see a warning in the response.

**To fix:**
1. Manually trigger the pipeline (see "Manual Trigger" section above)
2. Or wait for the daily scheduled run at 03:00 UTC

### Issue: Costs incorrect after editing subscription

**Verify:**
1. Check the `subscription_plan_costs_daily` table for the date range
2. Verify the pipeline was triggered after edit (check logs)
3. Manual trigger if needed:
```bash
curl -X POST "http://localhost:8000/api/v1/pipelines/trigger/${ORG_SLUG}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"start_date": "2026-01-08"}'
```

## Key Files Modified

| File | Purpose |
|------|---------|
| `02-api-service/src/core/utils/pipeline_trigger.py` | Pipeline trigger helper (NEW) |
| `02-api-service/src/app/routers/subscription_plans.py` | Auto-trigger integration (MODIFIED) |
| `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml` | Pipeline config (UNCHANGED) |

## Testing

Run the verification test:
```bash
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo
python3 /tmp/test_subscription_pipeline.py
```

Expected output:
```
======================================================================
RESULTS: 8 passed, 0 failed
======================================================================
🎉 ALL TESTS PASSED! Subscription pipeline fixes are working correctly.
```

## Related Documentation

- **Full Fix Report:** `00-requirements-specs/SUBSCRIPTION_COST_PIPELINE_FIXES_2026-01-08.md`
- **Requirements:** `00-requirements-specs/02_SAAS_SUBSCRIPTION_COSTS.md`
- **API Service Guide:** `02-api-service/CLAUDE.md`
- **Pipeline Service Guide:** `03-data-pipeline-service/CLAUDE.md`

## Support

If you encounter issues:

1. **Check logs** - Both services log pipeline triggers and failures
2. **Verify configuration** - Ensure .env.local files are correct
3. **Manual trigger** - Can always trigger pipeline manually as fallback
4. **Scheduled backup** - Daily 03:00 UTC run will catch any missed triggers

---

**Last Updated:** 2026-01-08
**Status:** ✅ Production Ready
