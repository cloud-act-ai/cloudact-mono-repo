# SaaS Subscription Cost Calculation Fix - Verification

**Date:** 2025-12-10
**Issue:** Historical costs for expired/cancelled subscriptions were not being calculated
**Fix:** Updated `sp_calculate_saas_subscription_plan_costs_daily` to include all status types

## Problem Description

When users edited subscription plans (e.g., changing from 4 seats to 1 seat), the stored procedure would only calculate costs for `status = 'active'` subscriptions, missing historical costs for expired/cancelled plans.

### Example Scenario

**User Action:** Change ChatGPT Team subscription from 4 seats to 1 seat on Dec 10, 2025

**What Happens:**
1. Old plan (Dec 1-9, 4 seats, $120/month):
   - `end_date` = 2025-12-09
   - `status` = 'expired'

2. New plan (Dec 10+, 1 seat, $30/month):
   - `start_date` = 2025-12-10
   - `status` = 'active'

**Before Fix:**
- Only the new plan (Dec 10+) was processed
- Historical costs (Dec 1-9) were never calculated
- Result: Missing cost data for 9 days

**After Fix:**
- Both plans are processed
- Historical period (Dec 1-9): $3.87/day
- New period (Dec 10+): $0.97/day
- Result: Complete cost history

## Changes Made

### 1. Updated Procedure Header (Lines 1-27)

**Before:**
```sql
-- PURPOSE: Calculate daily amortized costs for active subscriptions.
```

**After:**
```sql
-- PURPOSE: Calculate daily amortized costs for ALL subscriptions that overlap
--          with the date range, including historical costs for expired/cancelled
--          subscriptions.
```

**New Calculation Steps:**
```sql
-- CALCULATION:
--   1. Select subscriptions with status IN ('active', 'expired', 'cancelled')
--   2. For each day, determine which plan version was valid:
--      - start_date <= day AND (end_date IS NULL OR end_date >= day)
--   3. cycle_cost = unit_price × seats (PER_SEAT) or unit_price (FLAT_FEE)
--   4. Apply discount if any
--   5. daily_cost = cycle_cost / days_in_period
--   6. monthly_run_rate = daily_cost × days_in_month
--   7. annual_run_rate = daily_cost × days_in_year
```

### 2. Updated WHERE Clause (Lines 85-87)

**Before:**
```sql
WHERE status = 'active'
  AND (start_date <= @p_end OR start_date IS NULL)
  AND (end_date >= @p_start OR end_date IS NULL)
```

**After:**
```sql
WHERE status IN ('active', 'expired', 'cancelled')
  AND (start_date <= @p_end OR start_date IS NULL)
  AND (end_date >= @p_start OR end_date IS NULL)
```

**Why These Statuses:**
- `active` - Current subscriptions
- `expired` - Plans that have passed their `end_date` (from edit-version operations)
- `cancelled` - Plans that user explicitly ended
- **NOT included:** `pending` - Future-dated plans that haven't started yet

### 3. Updated CTE Comment (Lines 61-62)

**Before:**
```sql
-- Read active subscriptions within date range
```

**After:**
```sql
-- Read all subscriptions that overlap with date range
-- Include active, expired, and cancelled to calculate historical costs
```

## Date Range Logic (Unchanged - Already Correct)

The `daily_expanded` CTE (lines 122-155) correctly handles date ranges:

```sql
CROSS JOIN UNNEST(
  GENERATE_DATE_ARRAY(
    GREATEST(COALESCE(s.start_date, @p_start), @p_start),
    LEAST(COALESCE(s.end_date, @p_end), @p_end)
  )
) AS day
```

**How It Works:**
- Each subscription generates rows only for days it was valid
- `GREATEST` ensures we don't go before the plan's start date
- `LEAST` ensures we don't go past the plan's end date or requested range
- Plans with overlapping validity periods are processed independently

## Test Scenarios

### Scenario 1: Edit Plan (Change Seats)

**Setup:**
```sql
-- Original plan (Dec 1-9)
INSERT INTO saas_subscription_plans VALUES (
  subscription_id: 'sub_chatgpt_team_abc123',
  provider: 'chatgpt_plus',
  plan_name: 'TEAM',
  seats: 4,
  unit_price: 30.0,
  billing_cycle: 'monthly',
  start_date: '2025-12-01',
  end_date: '2025-12-09',
  status: 'expired'
);

-- New plan (Dec 10+)
INSERT INTO saas_subscription_plans VALUES (
  subscription_id: 'sub_chatgpt_team_def456',
  provider: 'chatgpt_plus',
  plan_name: 'TEAM',
  seats: 1,
  unit_price: 30.0,
  billing_cycle: 'monthly',
  start_date: '2025-12-10',
  end_date: NULL,
  status: 'active'
);
```

**Expected Output (December 2025 - 31 days):**
```
cost_date     | seats | cycle_cost | daily_cost | monthly_run_rate | annual_run_rate
--------------|-------|------------|------------|------------------|----------------
2025-12-01    | 4     | 120.00     | 3.87       | 120.00          | 1413.55
2025-12-02    | 4     | 120.00     | 3.87       | 120.00          | 1413.55
...
2025-12-09    | 4     | 120.00     | 3.87       | 120.00          | 1413.55
2025-12-10    | 1     | 30.00      | 0.97       | 30.00           | 353.39
2025-12-11    | 1     | 30.00      | 0.97       | 30.00           | 353.39
...
2025-12-31    | 1     | 30.00      | 0.97       | 30.00           | 353.39
```

**Calculations:**
- Dec 1-9: cycle_cost = 30 × 4 = $120, daily_cost = 120 / 31 = $3.87
- Dec 10-31: cycle_cost = 30 × 1 = $30, daily_cost = 30 / 31 = $0.97

### Scenario 2: Cancel Plan (Soft Delete)

**Setup:**
```sql
-- Active plan that user cancels on Dec 15
INSERT INTO saas_subscription_plans VALUES (
  subscription_id: 'sub_slack_pro_xyz789',
  provider: 'slack',
  plan_name: 'PRO',
  seats: 10,
  unit_price: 8.75,
  billing_cycle: 'monthly',
  start_date: '2025-12-01',
  end_date: '2025-12-15',
  status: 'cancelled'
);
```

**Expected Output (December 2025):**
```
cost_date     | seats | cycle_cost | daily_cost | monthly_run_rate | annual_run_rate
--------------|-------|------------|------------|------------------|----------------
2025-12-01    | 10    | 87.50      | 2.82       | 87.50           | 1004.60
2025-12-02    | 10    | 87.50      | 2.82       | 87.50           | 1004.60
...
2025-12-15    | 10    | 87.50      | 2.82       | 87.50           | 1004.60
(no rows after 2025-12-15)
```

**Calculations:**
- Dec 1-15: cycle_cost = 8.75 × 10 = $87.50, daily_cost = 87.50 / 31 = $2.82
- Dec 16-31: No rows (end_date = 2025-12-15)

### Scenario 3: Multiple Edits

**Setup:**
```sql
-- V1: Dec 1-5, 5 seats
INSERT INTO saas_subscription_plans VALUES (
  subscription_id: 'sub_canva_pro_v1',
  seats: 5,
  start_date: '2025-12-01',
  end_date: '2025-12-05',
  status: 'expired'
);

-- V2: Dec 6-15, 3 seats
INSERT INTO saas_subscription_plans VALUES (
  subscription_id: 'sub_canva_pro_v2',
  seats: 3,
  start_date: '2025-12-06',
  end_date: '2025-12-15',
  status: 'expired'
);

-- V3: Dec 16+, 1 seat
INSERT INTO saas_subscription_plans VALUES (
  subscription_id: 'sub_canva_pro_v3',
  seats: 1,
  start_date: '2025-12-16',
  end_date: NULL,
  status: 'active'
);
```

**Expected Output:**
- Dec 1-5: 5 seats cost
- Dec 6-15: 3 seats cost
- Dec 16-31: 1 seat cost

All periods calculated correctly with no gaps.

## Status Enum Reference

**From `/02-api-service/configs/saas/schema/subscription_schema.py`:**

```python
class StatusEnum(str, Enum):
    """Subscription status."""
    ACTIVE = "active"      # Current subscriptions
    CANCELLED = "cancelled" # User ended subscription (soft delete)
    EXPIRED = "expired"     # Past end_date (from edit-version)
```

**NOT included in calculation:**
- `pending` - Future-dated plans (start_date > today) that haven't begun yet

## Verification Checklist

After syncing the updated procedure to BigQuery, verify:

- [ ] Procedure syncs successfully without errors
- [ ] Run pipeline for December 2025 with test data
- [ ] Verify expired plan (Dec 1-9) generates cost rows
- [ ] Verify active plan (Dec 10+) generates cost rows
- [ ] Verify no gaps in cost_date sequence
- [ ] Verify daily_cost calculations are correct
- [ ] Verify no duplicate rows for same (org_slug, subscription_id, cost_date)

## How to Sync Updated Procedure

```bash
# 1. Sync procedure to BigQuery (pipeline-service port 8001)
curl -s -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"force": true}'

# 2. Verify procedure exists
curl -s -X GET "http://localhost:8001/api/v1/procedures/sp_calculate_saas_subscription_plan_costs_daily" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# 3. Run SaaS cost pipeline for December
curl -s -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"start_date": "2025-12-01", "end_date": "2025-12-31"}'

# 4. Query results
bq query --use_legacy_sql=false "
SELECT
  cost_date,
  subscription_id,
  seats,
  cycle_cost,
  daily_cost,
  status
FROM \`{project_id}.{org_slug}_prod.saas_subscription_plan_costs_daily\`
WHERE cost_date BETWEEN '2025-12-01' AND '2025-12-31'
  AND provider = 'chatgpt_plus'
ORDER BY cost_date
"
```

## Files Modified

1. `/03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_calculate_saas_subscription_plan_costs_daily.sql`
   - Line 6-9: Updated PURPOSE comment
   - Line 17-25: Added detailed calculation steps
   - Line 61-62: Updated CTE comment
   - Line 85: Changed `WHERE status = 'active'` to `WHERE status IN ('active', 'expired', 'cancelled')`

## Related Documentation

- `/00-requirements-docs/02_SAAS_SUBSCRIPTION_COSTS.md` - SaaS subscription feature documentation
- `/02-api-service/CLAUDE.md` - API service documentation (edit-version endpoint)
- `/02-api-service/configs/saas/schema/subscription_schema.py` - Status enum definition
- `/03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml` - Pipeline configuration

---

**Summary:** The fix ensures all historical subscription versions are included in cost calculations by changing the status filter from `status = 'active'` to `status IN ('active', 'expired', 'cancelled')`. The existing date range logic correctly handles overlapping periods, so no changes to the `daily_expanded` CTE were needed.
