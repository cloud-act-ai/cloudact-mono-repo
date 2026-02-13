---
name: advanced-filters
description: |
  Shared advanced filter system for CloudAct. Unified filter bar and state management across cost dashboards, budgets, and alerts.
  Use when: adding filters to pages, creating filter components, debugging filter behavior, understanding how filters dispatch
  to different backend endpoints, working with search/category/period/hierarchy/status/provider filters, or extending the filter system.
---

# /advanced-filters - Shared Advanced Filter System

Unified filter bar component and state management hook used across cost dashboards, budgets, and alerts pages.

## Trigger

```
/advanced-filters                        # Overview
/advanced-filters add <page>             # Add filters to a new page
/advanced-filters debug <page>           # Debug filter behavior
```

## Architecture

```
+----------------------------------------------------------------------+
|                    Advanced Filter Architecture                        |
+----------------------------------------------------------------------+
|                                                                        |
|   useAdvancedFilters() Hook                                           |
|   +-------------------------------------------------+                  |
|   | filters: AdvancedFilterState                     |                  |
|   |   search, category, periodType, status,          |                  |
|   |   hierarchyEntityId, provider, timeRange         |                  |
|   |                                                  |                  |
|   | serverParams  -> dispatched to API endpoints     |                  |
|   | clientParams  -> post-fetch filtering             |                  |
|   | serverFilterKey -> dependency for useCallback     |                  |
|   | activeCount   -> "Clear (N)" badge count         |                  |
|   +-------------------------------------------------+                  |
|                         |                                              |
|                         v                                              |
|   AdvancedFilterBar Component                                         |
|   +-------------------------------------------------+                  |
|   | [Search...] [Category v] [Period v] [Status v]   |                  |
|   | [Entity v]  [Provider v] [Clear (3)]             |                  |
|   +-------------------------------------------------+                  |
|                         |                                              |
|          +--------------+--------------+                               |
|          |              |              |                                |
|   Budget Page    Alert Page    Cost Dashboard                         |
|   /budgets       /notifications  /cost-dashboards                     |
|          |              |              |                                |
|   getBudgetSummary  getAlerts    getCostTrend                         |
|   getBudgets        getRules     getCostSummary                       |
|   getAllocationTree  getHistory   getCostByProvider                    |
|                                                                        |
+----------------------------------------------------------------------+
```

## Key Locations

| Type | Path |
|------|------|
| **Hook** | `01-fronted-system/lib/hooks/use-advanced-filters.ts` |
| **Component** | `01-fronted-system/components/filters/advanced-filter-bar.tsx` |
| **Budget Page** (consumer) | `01-fronted-system/app/[orgSlug]/budgets/page.tsx` |
| **Cost Filters** (existing) | `01-fronted-system/components/costs/cost-filters.tsx` |
| **Cost Context** (existing) | `01-fronted-system/contexts/cost-data-context.tsx` |

## Core Concepts

### Filter State Shape

```typescript
interface AdvancedFilterState {
  search: string              // client-side text match
  category: FilterCategory    // "all" | "cloud" | "genai" | "subscription" | "total"
  periodType: FilterPeriod    // "all" | "monthly" | "quarterly" | "yearly" | "custom"
  status: FilterStatus        // "all" | "over" | "under" | "active" | "inactive" | "paused"
  hierarchyEntityId: string   // "all" | entity ID (e.g., "DEPT-ENG")
  provider: string            // "all" | provider name (e.g., "openai")
  timeRange: FilterTimeRange  // "all" | "7" | "30" | "90" | "365" | "mtd" | "ytd" | "custom"
}
```

### Server-Side vs Client-Side

| Filter | Server-Side | Client-Side | Why |
|--------|:-----------:|:-----------:|-----|
| `category` | Yes | - | Reduces BigQuery scan |
| `hierarchyEntityId` | Yes | - | Reduces BigQuery scan |
| `periodType` | Yes (budgets) | - | WHERE clause in BQ |
| `provider` | Yes (budgets) | - | WHERE clause in BQ |
| `timeRange` | Yes (costs) | - | Date range in BQ |
| `search` | - | Yes | Instant UX, small result sets |
| `status` | - | Yes | Computed from data (over/under budget) |

### Hook Usage

```typescript
const {
  filters,          // Current filter state
  updateFilters,    // Partial update: updateFilters({ category: "cloud" })
  clearFilters,     // Reset all to defaults
  activeCount,      // Number of active filters (for badge)
  serverParams,     // { category?, hierarchyEntityId?, periodType?, ... }
  clientParams,     // { search, status }
  serverFilterKey,  // Stable key string — use in useCallback deps
} = useAdvancedFilters({
  search: true,
  category: true,
  periodType: true,
  status: true,
  hierarchyEntity: true,
  provider: false,   // Hide provider filter on this page
  timeRange: false,  // Hide time range on this page
})
```

### Component Usage

```tsx
<AdvancedFilterBar
  filters={filters}
  onChange={updateFilters}
  config={{ search: true, category: true, periodType: true, status: true, hierarchyEntity: true }}
  activeCount={activeCount}
  onClear={clearFilters}
  hierarchyNodes={hierarchyNodes}
  searchPlaceholder="Search budgets..."
/>
```

### Client-Side Filter Helpers

```typescript
import { matchesSearch, matchesBudgetStatus, matchesAlertStatus } from "@/lib/hooks/use-advanced-filters"

// Search across multiple fields
matchesSearch(item, ["hierarchy_entity_name", "category"], "cloud")

// Budget status
matchesBudgetStatus(item.is_over_budget, "over") // true if over budget

// Alert status
matchesAlertStatus(item.is_active, item.is_paused, "active") // true if active + not paused
```

## Filter Dispatch by Page

### Budget Page (`/budgets`)

| Filter | Endpoint | Parameter |
|--------|----------|-----------|
| category | `GET /budgets/{org}/summary` | `?category=cloud` |
| hierarchyEntityId | `GET /budgets/{org}/summary` | `?hierarchy_entity_id=DEPT-ENG` |
| periodType | `GET /budgets/{org}` | `?period_type=monthly` |
| category | `GET /budgets/{org}/allocation-tree` | `?category=cloud` |
| category | `GET /budgets/{org}/by-provider` | `?category=genai` |

### Alert Page (`/notifications?tab=alerts`)

| Filter | Endpoint | Parameter |
|--------|----------|-----------|
| category | `GET /{org}/cost-alerts` | `?category=cost` |
| status | Client-side | `is_enabled` field filter |
| search | Client-side | Name/description match |

### Cost Dashboard (`/cost-dashboards/*`)

| Filter | Mechanism | Notes |
|--------|-----------|-------|
| timeRange | `setUnifiedFilters({ timeRange })` | Existing cost context |
| category | `setUnifiedFilters({ categories })` | Existing cost context |
| hierarchy | `setUnifiedFilters({ hierarchyEntityId })` | Existing cost context |
| provider | `setUnifiedFilters({ providers })` | Existing cost context |

## Procedures

### Add Filters to a New Page

1. Import the hook and component:
   ```typescript
   import { AdvancedFilterBar } from "@/components/filters/advanced-filter-bar"
   import { useAdvancedFilters, matchesSearch } from "@/lib/hooks/use-advanced-filters"
   ```

2. Initialize with config (choose which filters to show):
   ```typescript
   const { filters, updateFilters, clearFilters, activeCount, serverParams, clientParams, serverFilterKey } = useAdvancedFilters({
     search: true, category: true, status: true,
   })
   ```

3. Use `serverFilterKey` in `useCallback` deps for data fetching:
   ```typescript
   const loadData = useCallback(async () => {
     const res = await fetchData(orgSlug, { category: serverParams.category })
     setData(res)
   }, [orgSlug, serverFilterKey])
   ```

4. Apply client-side filters with `useMemo`:
   ```typescript
   const filtered = useMemo(() =>
     data.filter(item => matchesSearch(item, ["name"], clientParams.search)),
     [data, clientParams.search]
   )
   ```

5. Render the filter bar:
   ```tsx
   <AdvancedFilterBar filters={filters} onChange={updateFilters} config={...} activeCount={activeCount} onClear={clearFilters} />
   ```

### Add a New Filter Type

1. Add the type to `AdvancedFilterState` in `use-advanced-filters.ts`
2. Add default value to `DEFAULT_FILTERS`
3. Add to `activeCount` calculation
4. Add to `serverParams` or `clientParams` as appropriate
5. Add UI control in `advanced-filter-bar.tsx`
6. Add to `FilterConfig` interface

## Relationship to Existing Cost Filters

The existing `CostFilters` + `TimeRangeFilter` + `useCostData()` context in `components/costs/cost-filters.tsx` is a **mature, specialized system** for cost dashboards. It:
- Has L1/L2 caching with intelligent cache decisions
- Supports cascading hierarchy dropdowns (dept → project → team)
- Uses Polars on the backend for aggregation

The `AdvancedFilterBar` is a **lighter-weight, reusable alternative** for pages that:
- Don't need the full cost context
- Want simple dropdown-style filters
- Need to dispatch to different backend endpoints (budgets API, alerts API)

Both can coexist. Cost dashboards continue using `CostFilters`, while budgets and alerts use `AdvancedFilterBar`.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Filters not triggering re-fetch | `serverFilterKey` not in useCallback deps | Add `serverFilterKey` to dependency array |
| Search not filtering | Using `serverParams.search` instead of `clientParams.search` | Search is always client-side |
| Status filter on budgets shows nothing | No variance data loaded | Load summary data in parallel with budget list |
| Hierarchy dropdown empty | `getHierarchyTree` not called | Call it in `loadData` and flatten tree |
| Filter state resets on tab change | Tabs re-mount the content | Lift filter state above Tabs component |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/budget-planning` | Primary consumer — budgets page uses shared filters |
| `/notifications` | Future consumer — alerts tab will use shared filters |
| `/cost-analytics` | Existing filter system for cost dashboards (useCostData context) |
| `/frontend-dev` | Next.js page patterns, server actions |
| `/console-ui` | UI component patterns used in filter bar |
| `/hierarchy` | Hierarchy entities populate entity filter dropdown |
