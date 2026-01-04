# Filter Standard Matrix - Expected vs Actual

## Standard Data Sources

| Source | Filters Applied | When to Use |
|--------|-----------------|-------------|
| `getFilteredTimeSeries()` | ✅ ALL (time, provider, category, hierarchy) | Trend charts |
| `getFilteredGranularData()` | ✅ ALL | Raw data processing |
| `getFilteredProviderBreakdown()` | ✅ ALL | Provider breakdown charts |
| `getFilteredCategoryBreakdown()` | ✅ ALL | Category ring charts |
| `cachedProviders` | ❌ NONE (365-day) | NEVER for filtered views |
| `totalCosts` | ❌ NONE (365-day) | NEVER for filtered views |

---

## PAGE 1: Overview (/cost-dashboards/overview)

| Component | Expected Source | Actual Source | Status |
|-----------|-----------------|---------------|--------|
| **CostSummaryGrid** | `filteredProviders` (derived) | `filteredProviders` ✅ | ✅ CORRECT |
| **CostRingChart** (Total Spend) | `getFilteredCategoryBreakdown()` | `filteredProviders` or `totalSummary` | ⚠️ PARTIAL - uses totalSummary when no filter |
| **CostBreakdownChart** (Top 5 GenAI) | `getFilteredProviderBreakdown()` + category filter | `getProvidersByCategory()` → `filteredProviders` | ✅ CORRECT |
| **CostBreakdownChart** (Top 5 Cloud) | `getFilteredProviderBreakdown()` + category filter | `getProvidersByCategory()` → `filteredProviders` | ✅ CORRECT |
| **CostBreakdownChart** (Top 5 Subscription) | `getFilteredProviderBreakdown()` + category filter | `getProvidersByCategory()` → `filteredProviders` | ✅ CORRECT |
| **CostTrendChart** | `getFilteredTimeSeries()` | `getFilteredTimeSeries()` | ✅ CORRECT |
| **CostDataTable** | `filteredProviders` | `providers` = `filteredProviders` | ✅ CORRECT |

**Issues Found:** Ring chart uses `totalSummary` (unfiltered) when no provider filter active

---

## PAGE 2: GenAI Costs (/cost-dashboards/genai-costs)

| Component | Expected Source | Actual Source | Status |
|-----------|-----------------|---------------|--------|
| **CostSummaryGrid** | Filtered provider totals | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostTrendChart** | `getFilteredTimeSeries()` | `getFilteredTimeSeries()` | ✅ CORRECT |
| **CostRingChart** (LLM Spend) | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostBreakdownChart** | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostDataTable** | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |

**Issues Found:** None - all components use filtered data

---

## PAGE 3: Cloud Costs (/cost-dashboards/cloud-costs)

| Component | Expected Source | Actual Source | Status |
|-----------|-----------------|---------------|--------|
| **CostSummaryGrid** | Filtered provider totals | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostTrendChart** | `getFilteredTimeSeries()` | `getFilteredTimeSeries()` | ✅ CORRECT |
| **CostRingChart** (Cloud Spend) | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostBreakdownChart** | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostDataTable** | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |

**Issues Found:** None - all components use filtered data

---

## PAGE 4: Subscription Costs (/cost-dashboards/subscription-costs)

| Component | Expected Source | Actual Source | Status |
|-----------|-----------------|---------------|--------|
| **CostSummaryGrid** | Filtered provider totals | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostTrendChart** | `getFilteredTimeSeries()` | `getFilteredTimeSeries()` | ✅ CORRECT |
| **CostRingChart** (SaaS Spend) | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostBreakdownChart** | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |
| **CostDataTable** | Filtered providers | `providers` (= `filteredProviders`) | ✅ CORRECT |

**Issues Found:** None - all components use filtered data

---

## PAGE 5: Dashboard (/dashboard)

| Component | Expected Source | Actual Source | Status |
|-----------|-----------------|---------------|--------|
| **CostSummaryGrid** | `getFilteredTimeSeries()` | `filteredDailyData` (from `getFilteredTimeSeries`) | ✅ CORRECT |
| **CostTrendChart** | `getFilteredTimeSeries()` | `filteredDailyData` (from `getFilteredTimeSeries`) | ✅ CORRECT |
| **CostRingChart** (Total Spend) | `getFilteredCategoryBreakdown()` | `categoryTotals` (from `getFilteredCategoryBreakdown`) | ✅ FIXED (BUG-002) |
| **CostBreakdownChart** (Top 5 GenAI) | Time-filtered providers | `getTimeFilteredProvidersByCategory("genai")` | ✅ FIXED (BUG-003) |
| **CostBreakdownChart** (Top 5 Cloud) | Time-filtered providers | `getTimeFilteredProvidersByCategory("cloud")` | ✅ FIXED (BUG-004) |
| **CostBreakdownChart** (Top 5 Subscription) | Time-filtered providers | `getTimeFilteredProvidersByCategory("subscription")` | ✅ FIXED (BUG-005) |

**Issues Found:** None - all components now use time-filtered data

---

## SUMMARY

| Page | Components | Correct | Bugs |
|------|------------|---------|------|
| Overview | 7 | 7 | 0 ✅ |
| GenAI Costs | 5 | 5 | 0 ✅ |
| Cloud Costs | 5 | 5 | 0 ✅ |
| Subscription Costs | 5 | 5 | 0 ✅ |
| Dashboard | 6 | 6 | 0 ✅ |

**Total: 28 components, 28 correct, 0 bugs** ✅

---

## BUGS FIXED (2026-01-04)

### BUG-001: Overview Ring Chart ✅ FIXED
- **Location:** `overview/page.tsx` lines 288-313
- **Issue:** When no provider filter, uses `totalSummary` (365-day)
- **Fix:** Now uses `getFilteredCategoryBreakdown()` always

### BUG-002: Dashboard Ring Chart ✅ FIXED
- **Location:** `dashboard/page.tsx` lines 236-253
- **Issue:** Uses `cachedProviders` via `getProvidersByCategory()` (365-day)
- **Fix:** Now uses `categoryTotals` from `getFilteredCategoryBreakdown()`

### BUG-003: Dashboard Top 5 GenAI ✅ FIXED
- **Location:** `dashboard/page.tsx` lines 335-372
- **Issue:** Uses `cachedProviders` (365-day)
- **Fix:** Now uses `getTimeFilteredProvidersByCategory()` which aggregates from `getFilteredGranularData()`

### BUG-004: Dashboard Top 5 Cloud ✅ FIXED
- **Location:** `dashboard/page.tsx` lines 374-380
- **Issue:** Uses `cachedProviders` (365-day)
- **Fix:** Now uses `getTimeFilteredProvidersByCategory()` which aggregates from `getFilteredGranularData()`

### BUG-005: Dashboard Top 5 Subscription ✅ FIXED
- **Location:** `dashboard/page.tsx` lines 382-388
- **Issue:** Uses `cachedProviders` (365-day)
- **Fix:** Now uses `getTimeFilteredProvidersByCategory()` which aggregates from `getFilteredGranularData()`

---

## FIX APPLIED

All bugs have been fixed. The Dashboard page now uses context's filtered functions:

```typescript
// Ring chart - uses getFilteredCategoryBreakdown() for time-filtered category totals
const categoryTotals = useMemo(() => {
  const breakdown = getFilteredCategoryBreakdown()
  const totals = { genai: 0, cloud: 0, subscription: 0 }
  for (const cat of breakdown) {
    const key = cat.category.toLowerCase() as keyof typeof totals
    if (key in totals) {
      totals[key] = cat.total_cost
    }
  }
  return totals
}, [getFilteredCategoryBreakdown])

// Top 5 charts - uses getFilteredGranularData() aggregated by provider
const getTimeFilteredProvidersByCategory = useCallback((category) => {
  const granular = getFilteredGranularData()
  // Aggregate by provider for the category
  const providerTotals = new Map<string, number>()
  for (const row of granular) {
    if (categoryProviderIds.has(row.provider_id.toLowerCase())) {
      const current = providerTotals.get(row.provider_id) || 0
      providerTotals.set(row.provider_id, current + row.total_cost)
    }
  }
  return Array.from(providerTotals.entries())
    .map(([provider, total_cost]) => ({ provider, total_cost }))
    .sort((a, b) => b.total_cost - a.total_cost)
}, [getFilteredGranularData, availableFilters.providers])
```
