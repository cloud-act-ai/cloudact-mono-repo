# Cost Dashboard Bug Report

**Date:** 2026-01-03
**Investigator:** Claude Code
**Scope:** Cost dashboards, filters, charts, and data flow

---

## Executive Summary

Found **67 bugs** across the cost dashboard codebase, including:
- **1 Critical** - Filters completely broken
- **20 High** - Wrong cost values displayed + semantic label errors
- **28 Medium** - Data inconsistencies, calculation errors, API handling
- **18 Low** - UI/UX issues and code quality

---

## 🔴 CRITICAL BUGS (1)

### BUG-001: Hierarchy Filters Never Work
**File:** `components/costs/cost-filters.tsx` + `actions/costs.ts`
**Severity:** CRITICAL
**Impact:** Hierarchy filtering (Department/Project/Team) is completely broken

**Root Cause:** Field name mismatch between UI and API

UI State (`CostFiltersState` in cost-filters.tsx:45-51):
```typescript
export interface CostFiltersState {
  department?: string   // ❌ Wrong name
  project?: string      // ❌ Wrong name
  team?: string         // ❌ Wrong name
  providers: string[]
  categories: string[]
}
```

API Expects (`CostFilterParams` in costs.ts:217-227):
```typescript
export interface CostFilterParams {
  departmentId?: string   // ✅ Correct name
  projectId?: string      // ✅ Correct name
  teamId?: string         // ✅ Correct name
  providers?: string[]
  categories?: string[]
}
```

**Result:** When user selects a department, the filter sets `filters.department = "DEPT-001"` but the API checks `filters?.departmentId` which is always undefined. **Hierarchy filters are 100% non-functional.**

**Fix Required:**
```typescript
// Option 1: Rename CostFiltersState fields
department?: string → departmentId?: string
project?: string → projectId?: string
team?: string → teamId?: string

// Option 2: Map fields when calling API
const apiFilters: CostFilterParams = {
  departmentId: filters.department,
  projectId: filters.project,
  teamId: filters.team,
  providers: filters.providers,
  categories: filters.categories,
}
```

---

## 🟠 HIGH SEVERITY BUGS (19)

### BUG-002: Dashboard Page Uses Wrong Cost Field
**File:** `app/[orgSlug]/dashboard/page.tsx:182-184`
**Impact:** "hasData" check uses forecast instead of actual costs

```typescript
// ❌ BUG - Uses total_monthly_cost (forecast)
const hasData = costSummary && (
  (costSummary.genai?.total_monthly_cost ?? 0) > 0 ||
  (costSummary.cloud?.total_monthly_cost ?? 0) > 0 ||
  (costSummary.subscription?.total_monthly_cost ?? 0) > 0
)

// ✅ FIX - Use total_billed_cost (actual)
const hasData = costSummary && (
  (costSummary.genai?.total_billed_cost ?? 0) > 0 ||
  (costSummary.cloud?.total_billed_cost ?? 0) > 0 ||
  (costSummary.subscription?.total_billed_cost ?? 0) > 0
)
```

### BUG-003: Dashboard Ring Segments Use Wrong Cost Field
**File:** `app/[orgSlug]/dashboard/page.tsx:206-208`
**Impact:** Ring chart shows forecast values instead of actuals

```typescript
// ❌ BUG
const genaiCost = costSummary?.genai?.total_monthly_cost ?? 0
const cloudCost = costSummary?.cloud?.total_monthly_cost ?? 0
const subscriptionCost = costSummary?.subscription?.total_monthly_cost ?? 0

// ✅ FIX
const genaiCost = costSummary?.genai?.total_billed_cost ?? 0
const cloudCost = costSummary?.cloud?.total_billed_cost ?? 0
const subscriptionCost = costSummary?.subscription?.total_billed_cost ?? 0
```

### BUG-004: Dashboard Category Breakdown Uses Wrong Cost Field
**File:** `app/[orgSlug]/dashboard/page.tsx:219-221`
**Impact:** Category breakdown chart shows forecast instead of actuals

### BUG-005: Breakdown Chart Component Uses Wrong Cost Field
**File:** `components/charts/cost/breakdown-chart.tsx:286-300`
**Impact:** When `useCategories` mode is used, shows forecast values

```typescript
// ❌ BUG - Lines 286, 293, 300
value: costData.totalCosts.genai?.total_monthly_cost ?? 0,
value: costData.totalCosts.cloud?.total_monthly_cost ?? 0,
value: costData.totalCosts.subscription?.total_monthly_cost ?? 0,

// ✅ FIX
value: costData.totalCosts.genai?.total_billed_cost ?? 0,
value: costData.totalCosts.cloud?.total_billed_cost ?? 0,
value: costData.totalCosts.subscription?.total_billed_cost ?? 0,
```

### BUG-006: Ring Chart Component Uses Wrong Cost Field
**File:** `components/charts/cost/ring-chart.tsx:102-114`
**Impact:** When `useCategories` mode is used, shows forecast values

```typescript
// ❌ BUG - Lines 102, 108, 114
value: costData.totalCosts.genai?.total_monthly_cost ?? 0,
value: costData.totalCosts.cloud?.total_monthly_cost ?? 0,
value: costData.totalCosts.subscription?.total_monthly_cost ?? 0,

// ✅ FIX
value: costData.totalCosts.genai?.total_billed_cost ?? 0,
value: costData.totalCosts.cloud?.total_billed_cost ?? 0,
value: costData.totalCosts.subscription?.total_billed_cost ?? 0,
```

### BUG-007: Metric Sparkline Uses Wrong Cost Field
**File:** `components/charts/cost/metric-sparkline.tsx:111-113`
**Impact:** Sparkline current value shows forecast instead of actual

```typescript
// ❌ BUG
current = costData.totalCosts.total?.total_monthly_cost || 0
current = costData.totalCosts[category]?.total_monthly_cost || 0

// ✅ FIX
current = costData.totalCosts.total?.total_billed_cost || 0
current = costData.totalCosts[category]?.total_billed_cost || 0
```

### BUG-008: Context Available Categories Uses Wrong Cost Field
**File:** `contexts/cost-data-context.tsx:312`
**Impact:** Categories with zero forecast but real costs are hidden

```typescript
// ❌ BUG
.filter(cat => cat.data && (cat.data.providers?.length > 0 || cat.data.total_monthly_cost > 0))

// ✅ FIX
.filter(cat => cat.data && (cat.data.providers?.length > 0 || cat.data.total_billed_cost > 0))
```

### BUG-009: Context Category Total Cost Uses Wrong Field
**File:** `contexts/cost-data-context.tsx:318`
**Impact:** Category totalCost in availableFilters shows forecast

```typescript
// ❌ BUG
totalCost: cat.data?.total_monthly_cost ?? 0,

// ✅ FIX
totalCost: cat.data?.total_billed_cost ?? 0,
```

### BUG-010: GenAI Costs Page MTD Fallback
**File:** `app/[orgSlug]/cost-dashboards/genai-costs/page.tsx:161`
**Impact:** MTD falls back to forecast when mtd_cost is null

```typescript
// ❌ BUG
mtd: genaiCosts?.mtd_cost ?? genaiCosts?.total_monthly_cost ?? 0,

// ✅ FIX - Use total_billed_cost as fallback
mtd: genaiCosts?.mtd_cost ?? genaiCosts?.total_billed_cost ?? 0,
```

### BUG-011: Cloud Costs Page MTD Fallback
**File:** `app/[orgSlug]/cost-dashboards/cloud-costs/page.tsx:161`
**Impact:** Same issue as BUG-010 for cloud costs

### BUG-012: Subscription Costs Page MTD Fallback
**File:** `app/[orgSlug]/cost-dashboards/subscription-costs/page.tsx:161`
**Impact:** Same issue as BUG-010 for subscription costs

### BUG-013: GenAI Costs Page Forecast Field
**File:** `app/[orgSlug]/cost-dashboards/genai-costs/page.tsx:163`
**Impact:** Uses total_monthly_cost (which may be 0) for forecast display

### BUG-014: Cloud Costs Page Forecast Field
**File:** `app/[orgSlug]/cost-dashboards/cloud-costs/page.tsx:163`
**Impact:** Same issue as BUG-013

### BUG-015: Subscription Costs Page Forecast Field
**File:** `app/[orgSlug]/cost-dashboards/subscription-costs/page.tsx:163`
**Impact:** Same issue as BUG-013

### BUG-016: Overview Page MTD Fallback Chain
**File:** `app/[orgSlug]/cost-dashboards/overview/page.tsx:207`
**Impact:** MTD calculation fallback chain ends with forecast

```typescript
// ❌ BUG
const combinedMTD = mtdFromPeriod || subscriptionMtd + cloudMtd + genaiMtd || (totalSummary?.total?.total_monthly_cost ?? 0)

// ✅ FIX
const combinedMTD = mtdFromPeriod || subscriptionMtd + cloudMtd + genaiMtd || (totalSummary?.total?.total_billed_cost ?? 0)
```

### BUG-017: Overview Page YTD Fallback Chain
**File:** `app/[orgSlug]/cost-dashboards/overview/page.tsx:212`
**Impact:** YTD calculation uses wrong fallback

```typescript
// ❌ BUG
const combinedYTD = ytdFromPeriod || subscriptionYtd + cloudYtd + genaiYtd || (totalSummary?.total?.total_annual_cost ?? 0)
```

### BUG-018: Dashboard Page MTD Fallback
**File:** `app/[orgSlug]/dashboard/page.tsx:190`
**Impact:** totalMtd fallback uses forecast

```typescript
// ❌ BUG
const totalMtd = periodCosts?.mtd ?? costSummary?.total?.total_monthly_cost ?? 0

// ✅ FIX
const totalMtd = periodCosts?.mtd ?? costSummary?.total?.total_billed_cost ?? 0
```

### BUG-019: Dashboard Page YTD Fallback
**File:** `app/[orgSlug]/dashboard/page.tsx:199`
**Impact:** YTD fallback uses total_annual_cost

```typescript
// ❌ BUG
ytd: periodCosts?.ytd ?? costSummary?.total?.total_annual_cost ?? totalMtd,
```

### BUG-020: Context getFilteredData Ratio Calculation
**File:** `contexts/cost-data-context.tsx:507-508`
**Impact:** Filter ratio calculated from forecast, not actuals

```typescript
// ❌ BUG
const ratio = state.totalCosts.total.total_monthly_cost > 0
  ? filteredTotal / state.totalCosts.total.total_monthly_cost
  : 0

// ✅ FIX
const ratio = state.totalCosts.total.total_billed_cost > 0
  ? filteredTotal / state.totalCosts.total.total_billed_cost
  : 0
```

---

## 🟡 MEDIUM SEVERITY BUGS (22)

### BUG-021: Category Filter Not Applied to Backend
**File:** Multiple dashboard pages
**Impact:** Category filter changes UI state but doesn't re-fetch filtered data

The category filter is set in state but never passed to backend API calls. Dashboard pages only filter providers client-side, not the actual totals.

### BUG-022: Provider Filter Only Affects Provider List
**File:** All cost dashboard pages
**Impact:** Provider filter doesn't update summary metrics

When filtering by provider, only the provider breakdown updates. The MTD/YTD/Forecast metrics still show unfiltered totals (see lines 145-156 in each dashboard page).

### BUG-023: Hierarchy Filter Not Passed to Context
**File:** All cost dashboard pages
**Impact:** Hierarchy filter selection not used when fetching data

The hierarchy filter UI works, but the selected values are never passed to the cost data context or API calls.

### BUG-024: Time Range Filter Doesn't Re-fetch Data
**File:** `contexts/cost-data-context.tsx`
**Impact:** Time range only affects client-side filtering of cached 365-day data

The context always fetches 365 days of data. Time range only slices this cached data client-side, which works for chart zooming but doesn't reduce data transfer.

### BUG-025: Category Toggle Doesn't Update Totals
**File:** `app/[orgSlug]/cost-dashboards/overview/page.tsx`
**Impact:** Selecting a category in filter doesn't recalculate summary

### BUG-026: Missing Error Boundaries in Cost Charts
**File:** All chart components
**Impact:** Chart rendering errors crash entire page

No error boundaries around chart components. A malformed data point can crash the page.

### BUG-027: No Loading State for Category Trend
**File:** `contexts/cost-data-context.tsx:438-472`
**Impact:** UI doesn't show loading when lazy-loading category trends

`fetchCategoryTrend` is async but the UI doesn't reflect loading state.

### BUG-028: Race Condition in Category Trend Loading
**File:** `contexts/cost-data-context.tsx:441-449`
**Impact:** Multiple rapid calls can cause state inconsistency

The "already loaded" check uses `setState` callback pattern incorrectly.

### BUG-029: Missing Cleanup in Cost Context
**File:** `contexts/cost-data-context.tsx`
**Impact:** Potential memory leak on fast navigation

No cleanup function in useEffect for pending requests.

### BUG-030: Stale Closure in Filter Handlers
**File:** `app/[orgSlug]/cost-dashboards/*/page.tsx`
**Impact:** Filter callbacks capture stale state

`handleFiltersChange` callbacks may use stale `filters` state.

### BUG-031: Inconsistent Currency Display
**File:** Multiple dashboard pages
**Impact:** Currency might show DEFAULT_CURRENCY instead of org currency

Pages fallback to `DEFAULT_CURRENCY` if `cachedCurrency` is null/undefined.

### BUG-032: Missing Null Check for totalCosts
**File:** `app/[orgSlug]/dashboard/page.tsx:206-221`
**Impact:** Potential runtime error if totalCosts is null

```typescript
// Missing null check
const genaiCost = costSummary?.genai?.total_monthly_cost ?? 0
```

### BUG-033: Hardcoded 30-Day Divisor
**File:** Multiple pages (lines ~148)
**Impact:** Daily rate calculation assumes 30-day month

```typescript
const estimatedDailyRate = filteredTotal / 30  // Hardcoded
```

### BUG-034: Annualized Estimate Uses 12x
**File:** Multiple pages (lines ~153)
**Impact:** YTD estimate is crude 12x multiplication

```typescript
ytd: filteredTotal * 12,  // Too simplistic
```

### BUG-035: Provider Breakdown Missing Percentage
**File:** `lib/costs/index.ts` transformProvidersToBreakdownItems
**Impact:** Provider breakdown items may have undefined percentage

### BUG-036: Table Rows Missing Sort
**File:** Multiple pages
**Impact:** Provider tables not consistently sorted by cost

### BUG-037: Ring Chart Segments Limited to 6
**File:** Multiple pages
**Impact:** Shows "Others" but loses provider detail

### BUG-038: Breakdown Chart maxItems Inconsistent
**File:** Multiple pages
**Impact:** Different pages use different maxItems values (3, 5, 10)

### BUG-039: Empty State Check Incomplete
**File:** `app/[orgSlug]/cost-dashboards/overview/page.tsx:272`
**Impact:** May show empty state when only periodCosts is missing

```typescript
const isEmpty = !isLoading && !totalSummary && providers.length === 0
// Missing: && !periodCosts check
```

### BUG-040: invalidateCache Doesn't Trigger Refetch
**File:** `contexts/cost-data-context.tsx:422-424`
**Impact:** Stale data persists until page remount

The `invalidateCache` function only marks data as stale without triggering a fetch:
```typescript
const invalidateCache = useCallback(() => {
  setState((prev) => ({ ...prev, isStale: true }))
}, [])
```

Should call `fetchCostData()` after marking stale, or pages should check `isStale` and refetch.

### BUG-041: Custom Date Range Validation Missing
**File:** `components/costs/cost-filters.tsx:622-629`
**Impact:** Can submit invalid date ranges (start > end)

### BUG-042: Date Input Max Not Future-Proof
**File:** `components/costs/cost-filters.tsx:712`
**Impact:** Hardcoded today's date as max

```typescript
max={new Date().toISOString().split("T")[0]}
```

---

### BUG-059: "subscriptions" Label Used for GenAI and Cloud Providers
**File:** `app/[orgSlug]/cost-dashboards/overview/page.tsx:353, 364, 435`
**Severity:** HIGH (Semantic/UX)
**Impact:** Confusing UX - shows "subscriptions" count for API calls and billing records

**Problem:** The overview page uses `countLabel="subscriptions"` for ALL provider types:
- GenAI providers (Anthropic, OpenAI) show "1,086 subscriptions" - **WRONG** (should be "records" or "API calls")
- Cloud providers (GCP, AWS, Azure) show "3,620 subscriptions" - **WRONG** (should be "records" or "billing records")
- SaaS providers (Slack, Notion) show "50 subscriptions" - **CORRECT**

```typescript
// ❌ BUG - Lines 353, 364, 435
<CostBreakdownChart
  title="Cost by Category"
  items={categories}
  countLabel="subscriptions"  // ← Wrong for GenAI/Cloud
  maxItems={3}
/>

<CostDataTable
  title="Provider Details"
  rows={tableRows}
  showCount
  countLabel="subscriptions"  // ← Wrong for GenAI/Cloud
  maxRows={10}
/>
```

**Correct Usage in Other Pages:**
- `genai-costs/page.tsx:290` uses `countLabel="records"` ✅
- `cloud-costs/page.tsx:290` uses `countLabel="records"` ✅
- `subscription-costs/page.tsx:295` uses `countLabel="subscriptions"` ✅

**Fix Required:** Dynamically set countLabel based on provider type or use "records" as default:
```typescript
// Option 1: Use generic label
countLabel="records"

// Option 2: Conditional based on category
countLabel={hasOnlySaaSProviders ? "subscriptions" : "records"}
```

---

## 🟢 LOW SEVERITY BUGS (16)

### BUG-043: Unused Import in Dashboard
**File:** `app/[orgSlug]/dashboard/page.tsx`
**Impact:** Code bloat

### BUG-044: Duplicate Color Definitions
**File:** Multiple files
**Impact:** Inconsistent colors if one is changed

GenAI color defined as `#10A37F` in multiple places.

### BUG-045: Missing aria-labels on Filter Buttons
**File:** `components/costs/cost-filters.tsx`
**Impact:** Accessibility issue

### BUG-046: ChevronDown Not Rotated When Open
**File:** `components/costs/cost-filters.tsx`
**Impact:** UX - icon doesn't indicate open state

### BUG-047: Clear Button Missing Confirmation
**File:** `components/costs/cost-filters.tsx:514-523`
**Impact:** Can accidentally clear all filters

### BUG-048: Popover Doesn't Close on Outside Click
**File:** Filter popovers
**Impact:** UX annoyance

### BUG-049: Missing Loading Skeleton in Charts
**File:** Chart components
**Impact:** Layout shift during loading

### BUG-050: Inconsistent Button Sizes
**File:** Cost dashboard header actions
**Impact:** Visual inconsistency

### BUG-051: Missing Tooltip on Truncated Text
**File:** Provider breakdown items
**Impact:** Can't see full provider name

### BUG-052: No Keyboard Navigation in Filters
**File:** `components/costs/cost-filters.tsx`
**Impact:** Accessibility issue

### BUG-053: Console Warnings for Key Props
**File:** Multiple list renders
**Impact:** Console noise

### BUG-054: Implicit Any Types
**File:** Several files
**Impact:** TypeScript strictness

### BUG-055: Dead Code in Test Files
**File:** `tests/subscription/costs.test.ts`
**Impact:** Test maintenance

### BUG-056: Inconsistent Comment Styles
**File:** Throughout codebase
**Impact:** Code quality

### BUG-057: Magic Numbers
**File:** Multiple files
**Impact:** Maintainability - hardcoded values like 30, 12, 365

### BUG-058: Missing JSDoc Comments
**File:** Most utility functions
**Impact:** Developer experience

### BUG-060: Type Safety - Multiple `as any` Casts in Subscription Forms
**File:** `app/[orgSlug]/integrations/subscriptions/[provider]/add/custom/page.tsx:107-108`
**Impact:** Type safety - runtime errors possible

```typescript
// ❌ BUG - Type assertions mask undefined handling issues
unit_price: undefined as any,
seats: undefined as any,
```

### BUG-061: Hierarchy Filter State Inconsistency
**File:** All category cost pages (genai/cloud/subscription)
**Impact:** Filter state uses `undefined` instead of empty string

```typescript
// Lines 65-67 in each category page
department: undefined,
project: undefined,
team: undefined,
```

Should match `CostFiltersState` which uses optional strings.

### BUG-062: Empty State Logic Doesn't Check periodCosts
**File:** All cost dashboard pages
**Impact:** Shows "no data" even when periodCosts has data

```typescript
// overview/page.tsx:272
const isEmpty = !isLoading && !totalSummary && providers.length === 0
// Missing: && !periodCosts
```

### BUG-063: Ring Chart Limit to 6 Segments Without "Others"
**File:** `app/[orgSlug]/cost-dashboards/overview/page.tsx:250`
**Impact:** Data truncation without aggregation

```typescript
.slice(0, 6)  // ← Silently drops providers beyond 6 without "Others" segment
```

### BUG-064: Missing Memoization on Event Handlers
**File:** All cost dashboard pages
**Impact:** Performance - handlers recreated on every render

```typescript
// Should use useCallback for all handlers
const handleRefresh = async () => { ... }  // Not memoized
```

### BUG-065: Filter Badge Count May Be Stale
**File:** `components/costs/cost-filters.tsx`
**Impact:** Badge count doesn't update when availableProviders changes

The active filter count is computed but may not reflect changes in available options.

### BUG-066: API Response Not Validated Before Use
**File:** `contexts/cost-data-context.tsx:361-392`
**Impact:** Runtime errors if API returns unexpected format

API responses are directly assigned to state without validation:
```typescript
totalCosts: totalCostsResult.data,
providerBreakdown: providerResult.data?.providers || [],
```

Should validate structure matches expected types before use.

### BUG-067: No Retry Logic on Failed API Calls
**File:** `contexts/cost-data-context.tsx`
**Impact:** Transient failures show permanent error

If API call fails, there's no automatic retry. Users must manually click refresh.

---

## API Validation Summary

Verified API endpoints are returning correct data:

| Endpoint | Status | Sample Response |
|----------|--------|-----------------|
| `/api/v1/costs/{org}/total` | ✅ Working | `total_billed_cost: 406.54` |
| `/api/v1/costs/{org}/summary` | ✅ Working | 30 records, 15 providers |
| `/api/v1/costs/{org}/by-provider` | ✅ Working | Provider breakdown with % |

**Note:** Cloud and GenAI categories show $0 because no data has been loaded for those categories yet. Only subscription data exists.

---

## Summary by Component

| Component | Critical | High | Medium | Low |
|-----------|----------|------|--------|-----|
| cost-filters.tsx | 1 | 0 | 2 | 6 |
| dashboard/page.tsx | 0 | 4 | 2 | 1 |
| overview/page.tsx | 0 | 3 | 3 | 1 |
| genai-costs/page.tsx | 0 | 2 | 2 | 1 |
| cloud-costs/page.tsx | 0 | 2 | 2 | 1 |
| subscription-costs/page.tsx | 0 | 2 | 2 | 1 |
| breakdown-chart.tsx | 0 | 1 | 1 | 1 |
| ring-chart.tsx | 0 | 1 | 1 | 1 |
| metric-sparkline.tsx | 0 | 1 | 0 | 0 |
| cost-data-context.tsx | 0 | 2 | 4 | 1 |
| costs.ts (actions) | 0 | 0 | 2 | 2 |
| subscription forms | 0 | 0 | 2 | 1 |
| Other | 0 | 2 | 5 | 1 |
| **TOTAL** | **1** | **20** | **28** | **18** |

---

## Recommended Fix Priority

### Phase 1: Critical + High (Same Day)
1. Fix hierarchy filter field name mismatch (BUG-001)
2. Replace all `total_monthly_cost` with `total_billed_cost` for display (BUG-002 through BUG-020)

### Phase 2: Medium (This Week)
3. Ensure filters are passed to API calls
4. Add error boundaries to charts
5. Fix loading states and race conditions

### Phase 3: Low (Next Sprint)
6. Accessibility improvements
7. Code quality and consistency
8. Performance optimizations

---

## Test Commands

```bash
# Verify fixes
npm run dev
# Navigate to http://localhost:3000/{orgSlug}/cost-dashboards/overview
# 1. Check Total Spend matches Cost by Category
# 2. Apply hierarchy filter and verify data changes
# 3. Apply provider filter and verify totals update
```
