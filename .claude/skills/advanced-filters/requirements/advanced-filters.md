# Advanced Filters - Requirements

## Overview

Shared advanced filter system for CloudAct. Provides a unified filter bar component and state management hook used across cost dashboards, budgets, and alerts pages. Each page configures which filters to show, and the hook separates server-side parameters (trigger API re-fetch) from client-side parameters (instant post-fetch filtering).

## Source Specifications

- `01-fronted-system/lib/hooks/use-advanced-filters.ts` - Shared hook
- `01-fronted-system/components/filters/advanced-filter-bar.tsx` - Shared UI component
- `01-fronted-system/app/[orgSlug]/budgets/page.tsx` - Budget page (first consumer)
- `01-fronted-system/app/[orgSlug]/notifications/page.tsx` - Alerts page (future consumer)
- `01-fronted-system/components/costs/cost-filters.tsx` - Existing cost filters (coexists)

## Architecture

```
useAdvancedFilters(config)          AdvancedFilterBar
─────────────────────────           ─────────────────
State management hook               Configurable UI

  filters: AdvancedFilterState        [Search...]
  serverParams → API calls            [Category v] [Period v]
  clientParams → post-fetch           [Status v]  [Entity v]
  serverFilterKey → useCallback dep   [Provider v] [Clear (N)]
  activeCount → badge count

         ↓                                    ↓
  ┌──────────────┬──────────────┬──────────────────┐
  │ Budget Page  │ Alert Page   │ Cost Dashboard    │
  │ /budgets     │ /notifications│ /cost-dashboards │
  ├──────────────┼──────────────┼──────────────────┤
  │ Server:      │ Server:      │ Server:           │
  │  category    │  category    │  timeRange        │
  │  hierarchy   │  (future)    │  category         │
  │  periodType  │              │  hierarchy        │
  │  provider    │ Client:      │  provider         │
  │              │  search      │                   │
  │ Client:      │  status      │ (Uses existing    │
  │  search      │              │  CostFilters +    │
  │  status      │              │  useCostData)     │
  └──────────────┴──────────────┴──────────────────┘
```

## Functional Requirements

### FR-AF-001: Filter State Management

| ID | Requirement |
|----|-------------|
| FR-AF-001.1 | `useAdvancedFilters()` hook manages unified state for all filter types |
| FR-AF-001.2 | State includes: search, category, periodType, status, hierarchyEntityId, provider, timeRange |
| FR-AF-001.3 | Each filter defaults to "all" (or empty string for search) |
| FR-AF-001.4 | `updateFilters(partial)` merges partial state without resetting other filters |
| FR-AF-001.5 | `clearFilters()` resets all filters to defaults |
| FR-AF-001.6 | `activeCount` reflects number of non-default filters |
| FR-AF-001.7 | Hook accepts `FilterConfig` to specify which filters are enabled per page |

### FR-AF-002: Server-Side vs Client-Side Separation

| ID | Requirement |
|----|-------------|
| FR-AF-002.1 | `serverParams` object contains only server-side filter values (category, hierarchyEntityId, periodType, provider, timeRange) |
| FR-AF-002.2 | `clientParams` object contains only client-side filter values (search, status) |
| FR-AF-002.3 | Server params omit "all" values (undefined instead of "all") |
| FR-AF-002.4 | `serverFilterKey` is a stable JSON string of serverParams for useCallback dependency arrays |
| FR-AF-002.5 | Changing server-side filters triggers API re-fetch via serverFilterKey change |
| FR-AF-002.6 | Changing client-side filters does NOT trigger re-fetch — applied via useMemo |

### FR-AF-003: Filter UI Component

| ID | Requirement |
|----|-------------|
| FR-AF-003.1 | `AdvancedFilterBar` renders configurable filter controls based on `FilterConfig` |
| FR-AF-003.2 | Search input with inline clear button |
| FR-AF-003.3 | Category dropdown: All Categories, Cloud, GenAI, Subscription, Total |
| FR-AF-003.4 | Period dropdown: All Periods, Monthly, Quarterly, Yearly, Custom |
| FR-AF-003.5 | Status dropdown: configurable options (budget: over/under; alerts: active/inactive/paused) |
| FR-AF-003.6 | Hierarchy entity dropdown populated from `hierarchyNodes` prop |
| FR-AF-003.7 | Provider dropdown populated from `providerOptions` prop |
| FR-AF-003.8 | Time range dropdown: All Time, 7/30/90/365 days, MTD, YTD |
| FR-AF-003.9 | "Clear (N)" button shown when activeCount > 0 |
| FR-AF-003.10 | All dropdowns are `Select` components from shadcn UI library |
| FR-AF-003.11 | `categoryOptions` and `statusOptions` are overridable via props |

### FR-AF-004: Client-Side Filter Helpers

| ID | Requirement |
|----|-------------|
| FR-AF-004.1 | `matchesSearch(item, fields, query)` performs case-insensitive substring match across multiple string fields |
| FR-AF-004.2 | `matchesSearch` returns true when query is empty |
| FR-AF-004.3 | `matchesBudgetStatus(isOverBudget, status)` filters by over/under budget |
| FR-AF-004.4 | `matchesAlertStatus(isActive, isPaused, status)` filters by active/inactive/paused alert state |
| FR-AF-004.5 | All status helpers return true when status is "all" |

### FR-AF-005: Budget Page Integration

| ID | Requirement |
|----|-------------|
| FR-AF-005.1 | Budget page shows: search, category, periodType, status, hierarchyEntity filters |
| FR-AF-005.2 | Category filter dispatched to `GET /budgets/{org}/summary?category=` — maps to `org_budgets.category` |
| FR-AF-005.3 | HierarchyEntityId dispatched to `GET /budgets/{org}/summary?hierarchy_entity_id=` — maps to `org_budgets.hierarchy_entity_id` |
| FR-AF-005.4 | PeriodType dispatched to `GET /budgets/{org}?period_type=` — maps to `org_budgets.period_type` |
| FR-AF-005.5 | Search applied client-side via `matchesSearch(item, ["hierarchy_entity_name", "category"])` |
| FR-AF-005.6 | Status applied client-side via `matchesBudgetStatus(item.is_over_budget)` — computed from variance |
| FR-AF-005.7 | `FilteredEmptyState` shown when all items filtered out |
| FR-AF-005.8 | Provider filter dispatched to `GET /budgets/{org}?provider=` — maps to `org_budgets.provider` (optional) |
| FR-AF-005.9 | Budget types (monetary/token/seat) displayed but not filterable as a dropdown |
| FR-AF-005.10 | `is_active=true` always applied server-side (soft-deleted budgets never shown) |

### FR-AF-006: Alert Page Integration

| ID | Requirement |
|----|-------------|
| FR-AF-006.1 | Alert page shows: search, category, status, hierarchyEntity filters |
| FR-AF-006.2 | Status options: All, Active, Inactive, Paused — maps to `org_notification_rules.is_active` |
| FR-AF-006.3 | Search applied client-side via `matchesSearch(item, ["name", "description"])` on `org_notification_rules` |
| FR-AF-006.4 | Status applied client-side using `matchesAlertStatus(is_active, is_paused, status)` |
| FR-AF-006.5 | Category options: All, Cost, Pipeline, Integration, Subscription, System — maps to `org_notification_rules.rule_category` |
| FR-AF-006.6 | HierarchyEntityId filter scopes alerts to specific hierarchy entity |
| FR-AF-006.7 | Provider filter applied client-side on `org_notification_rules.provider_filter` (REPEATED STRING) |

### FR-AF-008: Schema-Filter Mapping

| ID | Requirement |
|----|-------------|
| FR-AF-008.1 | Budget `category` filter values match enum: `cloud`, `genai`, `subscription`, `total` (lowercase) |
| FR-AF-008.2 | Budget `period_type` filter values match enum: `monthly`, `quarterly`, `yearly`, `custom` |
| FR-AF-008.3 | Budget `budget_type` values: `monetary`, `token`, `seat` — displayed but not a filter control |
| FR-AF-008.4 | Alert `rule_category` values match enum: `cost`, `pipeline`, `integration`, `subscription`, `system` |
| FR-AF-008.5 | Alert `priority` values: `critical`, `high`, `medium`, `low`, `info` — sortable column |
| FR-AF-008.6 | All filter values are lowercase strings matching BigQuery schema enums exactly |

### FR-AF-007: Empty State

| ID | Requirement |
|----|-------------|
| FR-AF-007.1 | `FilteredEmptyState` component shows centered icon + message when no results match |
| FR-AF-007.2 | Shows "Clear Filters" button when activeCount > 0 |
| FR-AF-007.3 | Customizable message text via `message` prop |

## Non-Functional Requirements

### NFR-AF-001: Performance

| ID | Requirement |
|----|-------------|
| NFR-AF-001.1 | Client-side filtering via useMemo — instant, no debounce needed for small datasets |
| NFR-AF-001.2 | Server-side filter changes trigger ONE re-fetch (not multiple) via serverFilterKey |
| NFR-AF-001.3 | Search input is uncontrolled typing — no throttle on onChange |

### NFR-AF-002: Extensibility

| ID | Requirement |
|----|-------------|
| NFR-AF-002.1 | Adding a new filter type requires changes in: AdvancedFilterState, DEFAULT_FILTERS, activeCount, serverParams or clientParams, FilterConfig, and AdvancedFilterBar UI |
| NFR-AF-002.2 | Existing cost filter system (CostFilters + useCostData) is NOT replaced |
| NFR-AF-002.3 | Custom status/category options can be passed via props |

### NFR-AF-003: Compatibility

| ID | Requirement |
|----|-------------|
| NFR-AF-003.1 | Works with shadcn Select, Input, Button components |
| NFR-AF-003.2 | Responsive layout: stacks vertically on mobile |
| NFR-AF-003.3 | CSS variables for theming (--text-muted, --text-primary, etc.) |

## SDLC

### Development Workflow

1. Hook changes in `use-advanced-filters.ts`
2. UI changes in `advanced-filter-bar.tsx`
3. Per-page integration in consuming page components

### Testing Approach

- Unit tests: Hook state management, filter helpers, activeCount
- Integration tests: Filter bar renders correctly with different configs
- E2E: Filters dispatch correct API params and filter data client-side

### Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/lib/hooks/use-advanced-filters.ts` | Hook + types + helpers |
| `01-fronted-system/components/filters/advanced-filter-bar.tsx` | UI component |
| `01-fronted-system/app/[orgSlug]/budgets/page.tsx` | Primary consumer |

## BigQuery Schema References

Filter values map directly to BigQuery table fields. Ensure exact case match (all lowercase).

| Filter | Budget Table Field | Alert Table Field | Valid Values |
|--------|--------------------|-------------------|-------------|
| category | `org_budgets.category` | `org_notification_rules.rule_category` | Budget: cloud/genai/subscription/total. Alert: cost/pipeline/integration/subscription/system |
| periodType | `org_budgets.period_type` | - | monthly/quarterly/yearly/custom |
| hierarchyEntityId | `org_budgets.hierarchy_entity_id` | `org_notification_rules.hierarchy_entity_id` | Entity ID format: DEPT-*, PROJ-*, TEAM-* |
| provider | `org_budgets.provider` | `org_notification_rules.provider_filter` | Budget: single string. Alert: REPEATED STRING array |
| status | Computed: actual > budget_amount | `org_notification_rules.is_active` | Budget: over/under. Alert: active/inactive/paused |
| search | `org_budgets.hierarchy_entity_name` | `org_notification_rules.name` + `description` | Free text, case-insensitive |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/budget-planning` | Primary consumer — budget page uses shared filters for 9 API endpoints |
| `/notifications` | Consumer — alert rules and cost alerts use shared filter patterns |
| `/cost-analytics` | Existing filter system for cost dashboards |
| `/frontend-dev` | Next.js patterns |
| `/console-ui` | UI component library |
| `/hierarchy` | Hierarchy entities populate entity filter |
| `/demo-setup` | Demo data includes 8 budgets + 2 alerts for filter testing |
| `/chat` | BudgetManager + AlertManager agents query same filtered data |

## Source Specifications

- `02-api-service/configs/setup/bootstrap/schemas/org_budgets.json` (21 fields)
- `02-api-service/configs/setup/bootstrap/schemas/org_budget_allocations.json` (8 fields)
- `02-api-service/configs/setup/bootstrap/schemas/org_notification_rules.json` (29 fields)
- `02-api-service/configs/setup/bootstrap/schemas/org_notification_channels.json` (22 fields)
- `02-api-service/configs/setup/bootstrap/schemas/org_notification_history.json` (21 fields)
- `02-api-service/src/core/services/budget_crud/models.py` (Pydantic models)
- `02-api-service/src/core/services/budget_read/models.py` (Variance + allocation models)
