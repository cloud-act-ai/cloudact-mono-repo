# Advanced Filters - Test Plan

## Overview

Test plan for the shared advanced filter system. Covers hook state management, filter helpers, UI component rendering, server-side filter dispatch, client-side filtering, and per-page integration.

## References

- Requirements: `FR-AF-001` through `FR-AF-007`
- Non-Functional: `NFR-AF-001` through `NFR-AF-003`

---

## 1. Hook State Tests

### AF-T001: Default Filter State

**Covers:** FR-AF-001.3

```typescript
// In test file or browser console
const { filters } = useAdvancedFilters()
console.log(filters)
```

**Expected:**
```json
{
  "search": "",
  "category": "all",
  "periodType": "all",
  "status": "all",
  "hierarchyEntityId": "all",
  "provider": "all",
  "timeRange": "all"
}
```

### AF-T002: Partial Update Preserves Other Filters

**Covers:** FR-AF-001.4

```typescript
const { filters, updateFilters } = useAdvancedFilters()
updateFilters({ category: "cloud" })
// filters.category === "cloud"
// filters.search === "" (unchanged)
// filters.status === "all" (unchanged)
```

**Expected:** Only `category` changes, all other filters remain at defaults.

### AF-T003: Clear Filters Resets All

**Covers:** FR-AF-001.5

```typescript
const { filters, updateFilters, clearFilters } = useAdvancedFilters()
updateFilters({ category: "cloud", search: "engineering", status: "over" })
clearFilters()
```

**Expected:** All filters reset to DEFAULT_FILTERS values.

### AF-T004: Active Count Calculation

**Covers:** FR-AF-001.6

| Scenario | Active Filters | Expected Count |
|----------|---------------|----------------|
| All defaults | None | 0 |
| category="cloud" | category | 1 |
| category="cloud" + search="eng" | category, search | 2 |
| All filters active | All 7 | 7 |

### AF-T005: Config Restricts Count

**Covers:** FR-AF-001.7

```typescript
const { activeCount } = useAdvancedFilters({ category: false, periodType: false })
updateFilters({ category: "cloud", periodType: "monthly" })
```

**Expected:** activeCount = 0 (disabled filters not counted even when non-default).

---

## 2. Server/Client Separation Tests

### AF-T010: Server Params Exclude "all"

**Covers:** FR-AF-002.1, FR-AF-002.3

```typescript
const { serverParams } = useAdvancedFilters()
// All filters at default "all"
```

**Expected:**
```json
{
  "category": undefined,
  "hierarchyEntityId": undefined,
  "periodType": undefined,
  "provider": undefined,
  "timeRange": undefined
}
```

### AF-T011: Server Params Include Active Values

**Covers:** FR-AF-002.1

```typescript
updateFilters({ category: "cloud", hierarchyEntityId: "DEPT-ENG" })
```

**Expected:** `serverParams.category === "cloud"`, `serverParams.hierarchyEntityId === "DEPT-ENG"`

### AF-T012: Client Params

**Covers:** FR-AF-002.2

```typescript
updateFilters({ search: "Engineering", status: "over" })
```

**Expected:** `clientParams.search === "engineering"` (lowercased), `clientParams.status === "over"`

### AF-T013: Server Filter Key Changes on Server Filter Update

**Covers:** FR-AF-002.4, FR-AF-002.5

```typescript
const key1 = serverFilterKey
updateFilters({ category: "cloud" })
const key2 = serverFilterKey
```

**Expected:** `key1 !== key2` — triggers re-fetch in useCallback consumers.

### AF-T014: Server Filter Key Unchanged on Client Filter Update

**Covers:** FR-AF-002.6

```typescript
const key1 = serverFilterKey
updateFilters({ search: "test" })
const key2 = serverFilterKey
```

**Expected:** `key1 === key2` — no re-fetch triggered.

---

## 3. Filter Helper Tests

### AF-T020: matchesSearch — Empty Query

**Covers:** FR-AF-004.2

```typescript
matchesSearch({ name: "Engineering" }, ["name"], "")
```

**Expected:** `true`

### AF-T021: matchesSearch — Matching Query

**Covers:** FR-AF-004.1

```typescript
matchesSearch({ name: "Engineering Dept", category: "cloud" }, ["name", "category"], "eng")
```

**Expected:** `true` (case-insensitive match on "name")

### AF-T022: matchesSearch — No Match

**Covers:** FR-AF-004.1

```typescript
matchesSearch({ name: "Marketing", category: "genai" }, ["name", "category"], "engineering")
```

**Expected:** `false`

### AF-T023: matchesBudgetStatus

**Covers:** FR-AF-004.3, FR-AF-004.5

| isOverBudget | status | Expected |
|-------------|--------|----------|
| true | "all" | true |
| true | "over" | true |
| true | "under" | false |
| false | "all" | true |
| false | "over" | false |
| false | "under" | true |

### AF-T024: matchesAlertStatus

**Covers:** FR-AF-004.4, FR-AF-004.5

| isActive | isPaused | status | Expected |
|----------|----------|--------|----------|
| true | false | "all" | true |
| true | false | "active" | true |
| true | true | "active" | false |
| false | false | "inactive" | true |
| true | true | "paused" | true |

---

## 4. UI Component Tests

### AF-T030: Default Config Shows All Filters

**Covers:** FR-AF-003.1

Render `<AdvancedFilterBar>` with all config flags true and hierarchyNodes/providerOptions populated.

**Expected:** Search input, Category, Period, Status, Entity, Provider, Time Range all visible.

### AF-T031: Config Hides Filters

**Covers:** FR-AF-003.1

Render with `config={{ search: true, category: true, periodType: false, status: false }}`.

**Expected:** Only search and category visible. No period, status, entity, provider, time range.

### AF-T032: Clear Button Shows When Active

**Covers:** FR-AF-003.9

Set `activeCount={3}`.

**Expected:** "Clear (3)" button visible.

### AF-T033: Clear Button Hidden When No Active

**Covers:** FR-AF-003.9

Set `activeCount={0}`.

**Expected:** No clear button rendered.

### AF-T034: Custom Status Options

**Covers:** FR-AF-003.11

Pass `statusOptions={[{ value: "all", label: "All" }, { value: "active", label: "Active" }]}`.

**Expected:** Status dropdown shows custom options, not default over/under.

### AF-T035: Hierarchy Dropdown From Nodes

**Covers:** FR-AF-003.6

Pass `hierarchyNodes={[{ id: "DEPT-ENG", name: "Engineering", level_code: "department" }]}`.

**Expected:** Entity dropdown shows "All Entities" + "Engineering".

### AF-T036: FilteredEmptyState

**Covers:** FR-AF-007.1, FR-AF-007.2

Render `<FilteredEmptyState activeCount={2} onClear={fn} />`.

**Expected:** Filter icon, "No results match your filters" text, "Clear Filters" button.

---

## 5. Budget Page Integration Tests

### AF-T040: Budget Page Renders Filter Bar

**Covers:** FR-AF-005.1

Navigate to `/{orgSlug}/budgets`.

**Expected:** Filter bar with search, category, period, status, hierarchy entity dropdowns.

### AF-T041: Category Filter Dispatches to API

**Covers:** FR-AF-005.2

Select "Cloud" in category dropdown.

**Expected:** Network request to `GET /budgets/{org}/summary?category=cloud`.

### AF-T042: Hierarchy Filter Dispatches to API

**Covers:** FR-AF-005.3

Select an entity in hierarchy dropdown.

**Expected:** Network request includes `?hierarchy_entity_id=DEPT-ENG`.

### AF-T043: Period Filter Dispatches to API

**Covers:** FR-AF-005.4

Select "Monthly" in period dropdown.

**Expected:** Budget list request includes `?period_type=monthly`.

### AF-T044: Search Filters Client-Side

**Covers:** FR-AF-005.5

Type "engineering" in search box with 3 budgets loaded.

**Expected:** Only budgets matching "engineering" in name/entity fields shown. No new API call.

### AF-T045: Status Filters Client-Side

**Covers:** FR-AF-005.6

Select "Over Budget" in status dropdown.

**Expected:** Only variance rows where actual > budget shown. No new API call.

### AF-T046: Filtered Empty State on Budget Page

**Covers:** FR-AF-005.7

Apply filters that match no budgets.

**Expected:** `FilteredEmptyState` shown with "Clear Filters" button.

### AF-T047: Clear Filters Resets Budget View

**Covers:** FR-AF-001.5, FR-AF-005.1

Click "Clear (N)" button.

**Expected:** All filters reset, full unfiltered data shown, filter dropdowns reset to "All".

---

## 6. Cross-Page Consistency Tests

### AF-T050: Same Hook Works Across Pages

**Covers:** FR-AF-001.1

Use `useAdvancedFilters()` on budget page and alert page.

**Expected:** Both pages get independent state instances. Changing filters on one doesn't affect the other.

### AF-T051: Filter Config Per Page

**Covers:** FR-AF-001.7

Budget page: `{ search: true, category: true, periodType: true, status: true, hierarchyEntity: true }`
Alert page: `{ search: true, status: true }`

**Expected:** Budget shows 5 filter controls, alert shows 2.

### AF-T052: Coexistence with CostFilters

**Covers:** NFR-AF-002.2

Navigate to `/cost-dashboards/*` pages.

**Expected:** Existing `CostFilters` + `TimeRangeFilter` + `useCostData()` context works unchanged. No interference from AdvancedFilterBar.

---

## 7. Responsive Tests

### AF-T060: Mobile Layout

**Covers:** NFR-AF-003.2

View budget page on 375px viewport.

**Expected:** Search input full width, filter dropdowns wrap to next line.

### AF-T061: Desktop Layout

**Covers:** NFR-AF-003.2

View on 1440px viewport.

**Expected:** Search and all dropdowns on single row.

---

## 8. Alert Page Integration Tests

### AF-T070: Alert Page Renders Filter Bar

**Covers:** FR-AF-006.1

Navigate to `/{orgSlug}/notifications?tab=alerts`.

**Expected:** Filter bar with search, category (cost/pipeline/system), and status (active/inactive/paused) visible.

### AF-T071: Alert Category Filter

**Covers:** FR-AF-006.5

Select "Cost" in category dropdown on alerts tab.

**Expected:** Only rules with `rule_category=cost` shown. Schema field: `org_notification_rules.rule_category`.

### AF-T072: Alert Status Filter — Active

**Covers:** FR-AF-006.2, FR-AF-006.4

Select "Active" in status dropdown.

**Expected:** Only rules where `is_active=true` AND not paused shown. Uses `matchesAlertStatus(true, false, "active")`.

### AF-T073: Alert Status Filter — Paused

**Covers:** FR-AF-006.4

Select "Paused" in status dropdown.

**Expected:** Only paused rules shown. Uses `matchesAlertStatus(true, true, "paused")`.

### AF-T074: Alert Search Filter

**Covers:** FR-AF-006.3

Type "budget" in search box.

**Expected:** Only rules matching "budget" in `name` or `description` fields. Schema: `org_notification_rules.name`.

### AF-T075: Alert Hierarchy Filter

**Covers:** FR-AF-006.6

Select entity "DEPT-ENG" in hierarchy dropdown.

**Expected:** Only rules scoped to `hierarchy_entity_id=DEPT-ENG`. Schema: `org_notification_rules.hierarchy_entity_id`.

---

## 9. Schema-Filter Mapping Tests

### AF-T080: Budget Category Enum Values

**Covers:** FR-AF-008.1

Test each budget category value against API:

```bash
curl -s "$API/api/v1/budgets/$ORG?category=cloud" -H "X-API-Key: $KEY"
curl -s "$API/api/v1/budgets/$ORG?category=genai" -H "X-API-Key: $KEY"
curl -s "$API/api/v1/budgets/$ORG?category=subscription" -H "X-API-Key: $KEY"
curl -s "$API/api/v1/budgets/$ORG?category=total" -H "X-API-Key: $KEY"
```

**Expected:** Each returns only budgets matching that category. Invalid values return empty list.

### AF-T081: Budget Period Type Enum Values

**Covers:** FR-AF-008.2

```bash
curl -s "$API/api/v1/budgets/$ORG?period_type=monthly" -H "X-API-Key: $KEY"
curl -s "$API/api/v1/budgets/$ORG?period_type=quarterly" -H "X-API-Key: $KEY"
```

**Expected:** Filters correctly by `org_budgets.period_type`.

### AF-T082: Alert Rule Category Enum Values

**Covers:** FR-AF-008.4

```bash
curl -s "$API/api/v1/cost-alerts/$ORG?category=cost" -H "X-API-Key: $KEY"
```

**Expected:** Only rules with `rule_category=cost`. Valid values: cost, pipeline, integration, subscription, system.

### AF-T083: Combined Category + Hierarchy Filter

**Covers:** FR-AF-005.2, FR-AF-005.3

```bash
curl -s "$API/api/v1/budgets/$ORG/summary?category=cloud&hierarchy_entity_id=DEPT-ENG" -H "X-API-Key: $KEY"
```

**Expected:** Only cloud budgets for Engineering department. Should return DEPT-ENG cloud budget ($30K).

### AF-T084: Provider Filter on Budgets

**Covers:** FR-AF-005.8

```bash
curl -s "$API/api/v1/budgets/$ORG?provider=gcp" -H "X-API-Key: $KEY"
```

**Expected:** Only budgets with `provider=gcp`. Schema field: `org_budgets.provider` (optional STRING).

---

## 10. End-to-End Demo Data Filter Tests

### AF-T090: Budget Category "cloud" Returns 3 Budgets

With demo data loaded (8 budgets), filter by category "cloud".

**Expected:** 3 budgets returned (DEPT-ENG cloud $30K, PROJ-PLATFORM cloud/gcp $20K, TEAM-BACKEND cloud/aws $12K).

### AF-T091: Budget Entity "DEPT-ENG" Returns 2 Budgets

Filter by hierarchyEntityId "DEPT-ENG".

**Expected:** 2 budgets returned (DEPT-ENG cloud $30K, DEPT-ENG total $50K).

### AF-T092: Budget Category "genai" + Entity "DEPT-DS" Returns 1 Budget

Combined filter: category=genai + hierarchy_entity_id=DEPT-DS.

**Expected:** 1 budget (DEPT-DS genai $25K).

### AF-T093: Budget Search "backend" Returns 1 Budget

Client-side search for "backend" across hierarchy_entity_name.

**Expected:** 1 result (TEAM-BACKEND cloud $12K). No API re-fetch.

### AF-T094: Alert Search "budget" Returns 1 Rule

Client-side search on alert rules for "budget".

**Expected:** 1 result (Monthly Budget Threshold). No API re-fetch.

### AF-T095: All Filters Clear Returns Full Data

After applying category=cloud + entity=DEPT-ENG + search="test", click "Clear".

**Expected:** All 8 budgets visible, all 2 alert rules visible, all filters reset to defaults.

---

## Test Matrix Summary

| Test ID | Category | Test | Covers |
|---------|----------|------|--------|
| AF-T001 | Hook | Default state | FR-AF-001.3 |
| AF-T002 | Hook | Partial update | FR-AF-001.4 |
| AF-T003 | Hook | Clear filters | FR-AF-001.5 |
| AF-T004 | Hook | Active count | FR-AF-001.6 |
| AF-T005 | Hook | Config restricts count | FR-AF-001.7 |
| AF-T010 | Separation | Server params exclude "all" | FR-AF-002.1, FR-AF-002.3 |
| AF-T011 | Separation | Server params active values | FR-AF-002.1 |
| AF-T012 | Separation | Client params | FR-AF-002.2 |
| AF-T013 | Separation | Key changes on server update | FR-AF-002.4, FR-AF-002.5 |
| AF-T014 | Separation | Key stable on client update | FR-AF-002.6 |
| AF-T020 | Helpers | matchesSearch empty | FR-AF-004.2 |
| AF-T021 | Helpers | matchesSearch match | FR-AF-004.1 |
| AF-T022 | Helpers | matchesSearch no match | FR-AF-004.1 |
| AF-T023 | Helpers | matchesBudgetStatus | FR-AF-004.3, FR-AF-004.5 |
| AF-T024 | Helpers | matchesAlertStatus | FR-AF-004.4, FR-AF-004.5 |
| AF-T030 | UI | All filters visible | FR-AF-003.1 |
| AF-T031 | UI | Config hides filters | FR-AF-003.1 |
| AF-T032 | UI | Clear button active | FR-AF-003.9 |
| AF-T033 | UI | Clear button hidden | FR-AF-003.9 |
| AF-T034 | UI | Custom status options | FR-AF-003.11 |
| AF-T035 | UI | Hierarchy dropdown | FR-AF-003.6 |
| AF-T036 | UI | FilteredEmptyState | FR-AF-007.1, FR-AF-007.2 |
| AF-T040 | Budget | Filter bar renders | FR-AF-005.1 |
| AF-T041 | Budget | Category dispatches | FR-AF-005.2 |
| AF-T042 | Budget | Hierarchy dispatches | FR-AF-005.3 |
| AF-T043 | Budget | Period dispatches | FR-AF-005.4 |
| AF-T044 | Budget | Search client-side | FR-AF-005.5 |
| AF-T045 | Budget | Status client-side | FR-AF-005.6 |
| AF-T046 | Budget | Filtered empty state | FR-AF-005.7 |
| AF-T047 | Budget | Clear resets view | FR-AF-001.5 |
| AF-T050 | Cross-Page | Independent instances | FR-AF-001.1 |
| AF-T051 | Cross-Page | Config per page | FR-AF-001.7 |
| AF-T052 | Cross-Page | CostFilters coexists | NFR-AF-002.2 |
| AF-T060 | Responsive | Mobile layout | NFR-AF-003.2 |
| AF-T061 | Responsive | Desktop layout | NFR-AF-003.2 |
| AF-T070 | Alerts | Filter bar renders | FR-AF-006.1 |
| AF-T071 | Alerts | Category filter | FR-AF-006.5 |
| AF-T072 | Alerts | Status active | FR-AF-006.2, FR-AF-006.4 |
| AF-T073 | Alerts | Status paused | FR-AF-006.4 |
| AF-T074 | Alerts | Search filter | FR-AF-006.3 |
| AF-T075 | Alerts | Hierarchy filter | FR-AF-006.6 |
| AF-T080 | Schema | Budget category enum | FR-AF-008.1 |
| AF-T081 | Schema | Budget period enum | FR-AF-008.2 |
| AF-T082 | Schema | Alert category enum | FR-AF-008.4 |
| AF-T083 | Schema | Combined category+hierarchy | FR-AF-005.2, FR-AF-005.3 |
| AF-T084 | Schema | Provider filter | FR-AF-005.8 |
| AF-T090 | E2E Demo | Cloud → 3 budgets | FR-AF-005.2 |
| AF-T091 | E2E Demo | DEPT-ENG → 2 budgets | FR-AF-005.3 |
| AF-T092 | E2E Demo | genai+DEPT-DS → 1 budget | FR-AF-005.2, FR-AF-005.3 |
| AF-T093 | E2E Demo | Search "backend" → 1 | FR-AF-005.5 |
| AF-T094 | E2E Demo | Alert search "budget" → 1 | FR-AF-006.3 |
| AF-T095 | E2E Demo | Clear all → full data | FR-AF-001.5 |
