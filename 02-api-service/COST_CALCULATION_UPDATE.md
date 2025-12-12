# Cost Service YTD and Forecast Calculation Update

## Overview

Updated the cost service to properly calculate Year-to-Date (YTD) costs and forecast annual costs, addressing the issue where subscription changes mid-period were not properly reflected in cost projections.

## Changes Made

### 1. Backend: `cost_service.py`

**File:** `/02-api-service/src/core/services/cost_service.py`

**Modified Method:** `_calculate_cost_summary()`

This helper method is used by all three cost endpoints:
- `get_saas_subscription_costs()` - SaaS subscription costs
- `get_cloud_costs()` - Cloud provider costs (GCP, AWS, Azure)
- `get_llm_costs()` - LLM API costs (OpenAI, Anthropic, etc.)

**New Calculation Logic:**

```python
def _calculate_cost_summary(data, start_date, end_date, query_time, cache_hit):
    """
    Calculate cost summary with proper YTD and forecast calculations.

    Summary Fields:
    - total_daily_cost: Sum of BilledCost from latest day per resource (current daily rate)
    - total_monthly_cost: MTD actual costs (sum of all BilledCost in current month)
    - total_annual_cost: YTD actual + forecast (YTD + daily_rate * remaining_days)
    - ytd_cost: Year-to-date actual spent
    - mtd_cost: Month-to-date actual spent
    - forecast_monthly_cost: Current daily rate × days in current month
    - forecast_annual_cost: YTD + (daily rate × remaining days in year)
    """
```

**Key Improvements:**

1. **MTD Calculation (Month-to-Date):**
   - Sums all `BilledCost` where `ChargePeriodStart` is in current month
   - Shows actual spending so far this month
   - Handles subscription changes within the month

2. **YTD Calculation (Year-to-Date):**
   - Sums all `BilledCost` from January 1 to today
   - Shows actual spending so far this year
   - Handles plan changes throughout the year

3. **Forecast Monthly Cost:**
   - Formula: `current_daily_rate × days_in_current_month`
   - Uses latest day's cost per resource as daily rate
   - Projects what the month will cost at current rate

4. **Forecast Annual Cost:**
   - Formula: `YTD_actual + (current_daily_rate × remaining_days_in_year)`
   - Combines historical actual with forward-looking projection
   - Accounts for leap years (366 vs 365 days)

**Date Calculations:**

```python
today = date.today()
year_start = date(today.year, 1, 1)
month_start = date(today.year, today.month, 1)
year_end = date(today.year, 12, 31)

# Days in current month
days_in_current_month = monthrange(today.year, today.month)[1]

# Days in current year (leap year aware)
days_in_current_year = 366 if leap_year else 365

# Remaining days (including today)
remaining_days_in_year = (year_end - today).days + 1
```

**Example Scenario:**

```
Date: December 10, 2025
Daily Rate: $10.00 (latest day per subscription)
YTD Actual: $1,000.00 (Jan 1 - Dec 10)

Calculations:
- Days in December: 31
- Remaining days in year: 22 (Dec 10-31)
- Forecast Monthly: $10.00 × 31 = $310.00
- Forecast Annual: $1,000.00 + ($10.00 × 22) = $1,220.00
```

**Handling Subscription Changes:**

The method groups costs by `ResourceId` (subscription ID) and uses the **latest day's cost** per subscription as the current daily rate. This ensures:

1. If a subscription had 4 seats then dropped to 1 seat:
   - YTD includes costs from both periods
   - Forecast uses only the current (1 seat) rate

2. If subscription prices change mid-period:
   - Historical costs reflect old prices
   - Forecast uses current prices

### 2. Frontend: `subscription-providers.ts`

**File:** `/01-fronted-system/actions/subscription-providers.ts`

**Updated Interface:** `SaaSCostSummary`

```typescript
export interface SaaSCostSummary {
  total_daily_cost: number          // Current daily rate (latest day per resource)
  total_monthly_cost: number        // MTD actual costs (sum of BilledCost in current month)
  total_annual_cost: number         // YTD actual + forecast (YTD + daily_rate * remaining_days)
  total_billed_cost: number         // Sum of all days in date range
  ytd_cost: number                  // Year-to-date actual spent
  mtd_cost: number                  // Month-to-date actual spent
  forecast_monthly_cost: number     // Current daily rate × days in current month
  forecast_annual_cost: number      // YTD + (daily rate × remaining days in year)
  providers: string[]
  service_categories: string[]
  record_count: number
  date_range: {
    start: string
    end: string
  }
}
```

**Client-Side Filtering Update:**

When filtering by provider client-side, the frontend now recalculates summary metrics to include the new fields. Note that client-side calculations are approximations since full date range data may not be available.

## Testing

### Manual Test

```bash
# 1. Start API service
cd 02-api-service
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Query SaaS subscription costs
curl -s "http://localhost:8000/api/v1/costs/{org_slug}/saas-subscriptions" \
  -H "X-API-Key: {org_api_key}" | jq '.summary'

# Expected output:
{
  "total_daily_cost": 10.00,
  "total_monthly_cost": 100.00,      # MTD actual
  "total_annual_cost": 1220.00,      # YTD + forecast
  "total_billed_cost": 100.00,       # All dates in range
  "ytd_cost": 1000.00,               # Jan 1 - today
  "mtd_cost": 100.00,                # Month start - today
  "forecast_monthly_cost": 310.00,   # $10 × 31 days
  "forecast_annual_cost": 1220.00,   # $1000 + ($10 × 22 days)
  "providers": ["chatgpt_plus"],
  "service_categories": ["subscription"],
  "record_count": 10,
  "date_range": {
    "start": "2025-12-01",
    "end": "2025-12-10"
  }
}
```

### Syntax Validation

```bash
# Backend validation
cd 02-api-service
python3 -m py_compile src/core/services/cost_service.py
# ✅ Success - no syntax errors

# Frontend validation
cd 01-fronted-system
npx tsc --noEmit actions/subscription-providers.ts
# ✅ Success - types updated correctly
```

## Impact

### Affected Endpoints

All cost endpoints now return the expanded summary:

1. **GET** `/api/v1/costs/{org}/saas-subscriptions`
2. **GET** `/api/v1/costs/{org}/cloud-costs`
3. **GET** `/api/v1/costs/{org}/llm-costs`

### Backward Compatibility

The update is **backward compatible**:
- All existing fields remain (`total_daily_cost`, `total_monthly_cost`, `total_annual_cost`)
- New fields are **additive** (`ytd_cost`, `mtd_cost`, `forecast_monthly_cost`, `forecast_annual_cost`)
- Field meanings are now more accurate (MTD vs forecast)

### Frontend Updates Required

Frontends consuming these APIs should update to:
1. Use `mtd_cost` for "spent this month" displays
2. Use `ytd_cost` for "spent this year" displays
3. Use `forecast_monthly_cost` for "projected month cost"
4. Use `forecast_annual_cost` for "projected year cost"
5. Update TypeScript interfaces to include new fields

## Files Modified

```
02-api-service/src/core/services/cost_service.py
01-fronted-system/actions/subscription-providers.ts
02-api-service/COST_CALCULATION_UPDATE.md (this file)
```

## Benefits

1. **Accurate Historical Tracking:**
   - YTD shows actual spending from Jan 1 to today
   - MTD shows actual spending this month
   - Handles mid-period subscription changes correctly

2. **Realistic Forecasting:**
   - Forecast uses current daily rate (latest subscription state)
   - Combines actual YTD with projected remaining days
   - Accounts for leap years automatically

3. **Transparency:**
   - Separates actual (YTD/MTD) from forecast
   - Shows both current daily rate and projections
   - Helps users understand cost trends

4. **Flexibility:**
   - Works for all cost types (SaaS, Cloud, LLM)
   - Handles subscription upgrades/downgrades
   - Supports any date range queries

## Next Steps

1. **Update Dashboard UI:**
   - Display YTD and MTD costs separately
   - Show forecast vs actual comparison
   - Add trend indicators (up/down from last month)

2. **Add Cost Alerts:**
   - Alert when forecast_monthly_cost > budget
   - Alert when YTD > annual budget × (days_elapsed / 365)
   - Alert on sudden daily cost increases

3. **Historical Tracking:**
   - Store monthly snapshots for trend analysis
   - Compare current month MTD vs last month MTD
   - Track forecast accuracy over time

---

**Date:** 2025-12-10
**Author:** Cost Service Update
**Version:** 1.0.0
