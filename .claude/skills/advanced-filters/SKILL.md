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
| **Budget Server Actions** | `01-fronted-system/actions/budgets.ts` |
| **Budget API Router** | `02-api-service/src/app/routers/budgets.py` |
| **Budget CRUD Models** | `02-api-service/src/core/services/budget_crud/models.py` |
| **Budget Read Models** | `02-api-service/src/core/services/budget_read/models.py` |
| **Alert API Router** | `02-api-service/src/app/routers/cost_alerts.py` |
| **Alert Notifications Router** | `02-api-service/src/app/routers/notifications.py` |
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

| Filter | Endpoint(s) | Parameter | Maps to Schema Field |
|--------|------------|-----------|---------------------|
| category | `GET /budgets/{org}/summary`, `GET /budgets/{org}/allocation-tree`, `GET /budgets/{org}/by-provider` | `?category=cloud` | `org_budgets.category` (cloud/genai/subscription/total) |
| hierarchyEntityId | `GET /budgets/{org}/summary`, `GET /budgets/{org}` | `?hierarchy_entity_id=DEPT-ENG` | `org_budgets.hierarchy_entity_id` |
| periodType | `GET /budgets/{org}` | `?period_type=monthly` | `org_budgets.period_type` (monthly/quarterly/yearly/custom) |
| provider | `GET /budgets/{org}`, `GET /budgets/{org}/by-provider` | `?provider=gcp` | `org_budgets.provider` (optional) |
| search | Client-side | `matchesSearch(item, ["hierarchy_entity_name", "category"])` | `org_budgets.hierarchy_entity_name` |
| status | Client-side | `matchesBudgetStatus(item.is_over_budget)` | Computed: actual > budget_amount |

**Budget Schema Fields Used by Filters:**
- `category` (STRING): `cloud`, `genai`, `subscription`, `total`
- `budget_type` (STRING): `monetary`, `token`, `seat`
- `period_type` (STRING): `monthly`, `quarterly`, `yearly`, `custom`
- `hierarchy_entity_id` (STRING): e.g., `DEPT-ENG`, `PROJ-PLATFORM`, `TEAM-BACKEND`
- `provider` (STRING, optional): e.g., `gcp`, `aws`, `openai`
- `is_active` (BOOLEAN): Soft delete flag (always filter by is_active=true)

### Alert Page (`/notifications?tab=alerts`)

| Filter | Endpoint | Parameter | Maps to Schema Field |
|--------|----------|-----------|---------------------|
| category | `GET /{org}/cost-alerts` | `?category=cost` | `org_notification_rules.rule_category` (cost/pipeline/integration/subscription/system) |
| status | Client-side | `matchesAlertStatus(is_active, is_paused)` | `org_notification_rules.is_active` + computed `is_paused` |
| search | Client-side | `matchesSearch(item, ["name", "description"])` | `org_notification_rules.name`, `org_notification_rules.description` |
| hierarchyEntityId | Server/Client | `?hierarchy_entity_id=DEPT-ENG` | `org_notification_rules.hierarchy_entity_id` |
| provider | Client-side | Filter by `provider_filter` array | `org_notification_rules.provider_filter` (REPEATED STRING) |

**Alert Schema Fields Used by Filters:**
- `rule_category` (STRING): `cost`, `pipeline`, `integration`, `subscription`, `system`
- `rule_type` (STRING): `budget_percent`, `absolute_threshold`, `anomaly_percent_change`, etc.
- `is_active` (BOOLEAN): Whether rule is enabled
- `priority` (STRING): `critical`, `high`, `medium`, `low`, `info`
- `provider_filter` (REPEATED STRING): e.g., `["gcp", "aws"]`
- `hierarchy_entity_id` (STRING, optional): Scoped to hierarchy entity

### Cost Dashboard (`/cost-dashboards/*`)

| Filter | Mechanism | Notes |
|--------|-----------|-------|
| timeRange | `setUnifiedFilters({ timeRange })` | Existing cost context |
| category | `setUnifiedFilters({ categories })` | Existing cost context |
| hierarchy | `setUnifiedFilters({ hierarchyEntityId })` | Existing cost context |
| provider | `setUnifiedFilters({ providers })` | Existing cost context |

## BigQuery Tables Referenced by Filters

### org_budgets (21 fields)

| Field | Type | Filter Use |
|-------|------|-----------|
| `budget_id` | STRING | Primary key (UUID) |
| `org_slug` | STRING | Multi-tenant isolation (always filtered) |
| `hierarchy_entity_id` | STRING | `hierarchyEntityId` filter → `?hierarchy_entity_id=` |
| `hierarchy_entity_name` | STRING | `search` filter → `matchesSearch()` |
| `category` | STRING | `category` filter → `?category=` |
| `budget_type` | STRING | Displayed, not filtered |
| `budget_amount` | FLOAT | Used in variance: `actual - budget_amount` |
| `period_type` | STRING | `periodType` filter → `?period_type=` |
| `provider` | STRING | `provider` filter → `?provider=` |
| `is_active` | BOOLEAN | Always filtered (only show active) |

### org_budget_allocations (8 fields)

| Field | Type | Filter Use |
|-------|------|-----------|
| `allocation_id` | STRING | Primary key (UUID) |
| `org_slug` | STRING | Multi-tenant isolation |
| `parent_budget_id` | STRING | Joins to org_budgets.budget_id |
| `child_budget_id` | STRING | Joins to org_budgets.budget_id |
| `allocated_amount` | FLOAT | Shown in allocation tree |
| `allocation_percentage` | FLOAT | Shown in allocation tree |

### org_notification_rules (29 fields)

| Field | Type | Filter Use |
|-------|------|-----------|
| `rule_id` | STRING | Primary key (UUID) |
| `org_slug` | STRING | Multi-tenant isolation |
| `name` | STRING | `search` filter → `matchesSearch()` |
| `rule_category` | STRING | `category` filter (cost/pipeline/integration/subscription/system) |
| `rule_type` | STRING | Display + grouping |
| `is_active` | BOOLEAN | `status` filter → `matchesAlertStatus()` |
| `priority` | STRING | Sortable (critical/high/medium/low/info) |
| `provider_filter` | REPEATED STRING | `provider` filter (client-side array match) |
| `hierarchy_entity_id` | STRING | `hierarchyEntityId` filter |
| `conditions` | JSON | Threshold/period data for display |
| `cooldown_minutes` | INTEGER | Display only |

### org_notification_channels (22 fields)

| Field | Type | Filter Use |
|-------|------|-----------|
| `channel_id` | STRING | Primary key (UUID) |
| `channel_type` | STRING | Filter by email/slack/webhook |
| `name` | STRING | `search` filter |
| `is_active` | BOOLEAN | `status` filter |

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

## Demo Data for Testing Filters

The demo account includes 8 budgets and 2 alert rules for end-to-end filter testing:

### Budget Demo Data (8 budgets, Q1 2026)

| Entity | Category | Type | Amount | Provider |
|--------|----------|------|--------|----------|
| DEPT-ENG | cloud | monetary | $30,000 | - |
| DEPT-DS | genai | monetary | $25,000 | - |
| PROJ-PLATFORM | cloud | monetary | $20,000 | gcp |
| PROJ-MLPIPE | genai | monetary | $20,000 | openai |
| TEAM-BACKEND | cloud | monetary | $12,000 | aws |
| TEAM-FRONTEND | subscription | monetary | $3,000 | - |
| TEAM-MLOPS | genai | token | 50,000,000 | - |
| DEPT-ENG | total | monetary | $50,000 | - |

### Alert Demo Data (2 rules)

| Name | Type | Threshold | Priority |
|------|------|-----------|----------|
| Daily Cost Spike Alert | absolute_threshold | $5,000/day | high |
| Monthly Budget Threshold | budget_percent | 80% of $50K | medium |

**Filter test scenarios:** Category "cloud" → 3 budgets. Entity "DEPT-ENG" → 2 budgets. Period "quarterly" → all 8. Status "over" → depends on actual spend.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Filters not triggering re-fetch | `serverFilterKey` not in useCallback deps | Add `serverFilterKey` to dependency array |
| Search not filtering | Using `serverParams.search` instead of `clientParams.search` | Search is always client-side |
| Status filter on budgets shows nothing | No variance data loaded | Load summary data in parallel with budget list |
| Hierarchy dropdown empty | `getHierarchyTree` not called | Call it in `loadData` and flatten tree |
| Filter state resets on tab change | Tabs re-mount the content | Lift filter state above Tabs component |
| Budget category filter returns empty | `org_budgets.category` value doesn't match filter | Ensure exact case: `cloud`, `genai`, `subscription`, `total` (all lowercase) |
| Alert status filter mismatch | Using `matchesBudgetStatus` instead of `matchesAlertStatus` | Alerts use `matchesAlertStatus(is_active, is_paused, status)` |
| Provider filter on alerts not working | `provider_filter` is REPEATED STRING | Use array `.includes()`, not direct string compare |
| Budget period filter returns nothing | `period_type` not set on budget | All budgets must have `period_type` (monthly/quarterly/yearly/custom) |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/budget-planning` | Primary consumer — budgets page uses shared filters for 9 API endpoints |
| `/notifications` | Consumer — alerts and notification rules use shared filter patterns |
| `/cost-analytics` | Existing filter system for cost dashboards (useCostData context) |
| `/frontend-dev` | Next.js page patterns, server actions |
| `/console-ui` | UI component patterns used in filter bar |
| `/hierarchy` | Hierarchy entities populate entity filter dropdown |
| `/demo-setup` | Demo data includes 8 budgets + 2 alerts for filter testing |
| `/chat` | BudgetManager + AlertManager agents query the same filtered data |
