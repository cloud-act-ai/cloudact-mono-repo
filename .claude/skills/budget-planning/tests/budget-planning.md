# Budget Planning - Test Plan

## Overview

Test plan for hierarchy-based budget planning and variance tracking. Covers BigQuery schema, API CRUD, variance calculation, allocation tree, frontend page, and shared advanced filter integration.

## References

- Requirements: `FR-BP-001` through `FR-BP-016`
- Non-Functional: `NFR-BP-001` through `NFR-BP-003`

---

## 1. Schema Tests

### T-BP-001: Bootstrap Creates Tables

**Covers:** FR-BP-006 (data layer)

```bash
# Run bootstrap-sync to create new tables
cd 05-scheduler-jobs/scripts
./run-job.sh stage bootstrap

# Verify tables exist
bq ls cloudact-testing-1:organizations | grep org_budgets
bq ls cloudact-testing-1:organizations | grep org_budget_allocations
```

**Expected:**
- `org_budgets` table exists with all 20 fields
- `org_budget_allocations` table exists with all 8 fields
- `org_budgets` partitioned on `created_at` (DAY)
- `org_budgets` clustered on `org_slug`, `category`, `hierarchy_entity_id`

### T-BP-002: Schema Field Validation

**Covers:** FR-BP-006

```bash
bq show --schema --format=prettyjson cloudact-testing-1:organizations.org_budgets
```

**Expected:** All fields match `org_budgets.json` schema — types, modes, and names.

---

## 2. API CRUD Tests

### T-BP-010: Create Budget (Monetary)

**Covers:** FR-BP-006, FR-BP-001, FR-BP-002, FR-BP-003

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id": "DEPT-ENG",
    "category": "cloud",
    "budget_type": "monetary",
    "budget_amount": 20000,
    "currency": "USD",
    "period_type": "monthly",
    "period_start": "2026-02-01",
    "period_end": "2026-02-28"
  }'
```

**Expected:** 201 Created. Response contains `budget_id`, all fields echoed back.

### T-BP-011: Create Budget (Token)

**Covers:** FR-BP-002, FR-BP-013 (VP-010)

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id": "TEAM-TRAINING",
    "category": "genai",
    "budget_type": "token",
    "budget_amount": 25000000,
    "currency": "USD",
    "period_type": "monthly",
    "period_start": "2026-02-01",
    "period_end": "2026-02-28",
    "provider": "openai"
  }'
```

**Expected:** 201 Created. `budget_type` = `token`.

### T-BP-012: Create Budget (Seat)

**Covers:** FR-BP-002, FR-BP-013 (VP-011)

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id": "PROJ-DESIGN",
    "category": "subscription",
    "budget_type": "seat",
    "budget_amount": 15,
    "currency": "USD",
    "period_type": "monthly",
    "period_start": "2026-02-01",
    "period_end": "2026-02-28",
    "provider": "figma"
  }'
```

**Expected:** 201 Created. `budget_type` = `seat`.

### T-BP-013: List Budgets

**Covers:** FR-BP-006

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG" -H "X-API-Key: $KEY"
```

**Expected:** 200 OK. `{ "budgets": [...], "total": N }`. N >= 3 (from previous creates).

### T-BP-014: List Budgets with Filters

**Covers:** FR-BP-006

```bash
# Filter by category
curl -s "http://localhost:8000/api/v1/budgets/$ORG?category=genai" -H "X-API-Key: $KEY"

# Filter by hierarchy entity
curl -s "http://localhost:8000/api/v1/budgets/$ORG?hierarchy_entity_id=DEPT-ENG" -H "X-API-Key: $KEY"

# Filter by period type
curl -s "http://localhost:8000/api/v1/budgets/$ORG?period_type=monthly" -H "X-API-Key: $KEY"
```

**Expected:** Each filter returns subset of budgets matching the filter.

### T-BP-015: Get Single Budget

**Covers:** FR-BP-006

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG/$BUDGET_ID" -H "X-API-Key: $KEY"
```

**Expected:** 200 OK. Full budget object returned.

### T-BP-016: Update Budget

**Covers:** FR-BP-006

```bash
curl -s -X PUT "http://localhost:8000/api/v1/budgets/$ORG/$BUDGET_ID" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"budget_amount": 25000, "notes": "Increased for Q1 project"}'
```

**Expected:** 200 OK. `budget_amount` = 25000, `notes` set, `updated_at` populated.

### T-BP-017: Delete Budget (Soft Delete)

**Covers:** FR-BP-006, NFR-BP-002

```bash
curl -s -X DELETE "http://localhost:8000/api/v1/budgets/$ORG/$BUDGET_ID" -H "X-API-Key: $KEY"
```

**Expected:** 204 No Content. Budget still in BQ with `is_active = false`. Does not appear in list.

---

## 3. Validation Tests

### T-BP-020: Negative Amount Rejected

**Covers:** FR-BP-013 (VP-001)

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-ENG","category":"cloud","budget_amount":-500,"currency":"USD","period_type":"monthly","period_start":"2026-02-01","period_end":"2026-02-28"}'
```

**Expected:** 400/422. "Budget amount must be positive."

### T-BP-021: End Before Start Rejected

**Covers:** FR-BP-013 (VP-002)

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-ENG","category":"cloud","budget_amount":1000,"currency":"USD","period_type":"monthly","period_start":"2026-03-01","period_end":"2026-02-01"}'
```

**Expected:** 400/422. "End date must be after start date."

### T-BP-022: Invalid Hierarchy Entity Rejected

**Covers:** FR-BP-013 (VP-003)

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-FAKE","category":"cloud","budget_amount":1000,"currency":"USD","period_type":"monthly","period_start":"2026-02-01","period_end":"2026-02-28"}'
```

**Expected:** 400. "Hierarchy entity not found."

### T-BP-023: Token Type Only for GenAI

**Covers:** FR-BP-013 (VP-010)

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-ENG","category":"cloud","budget_type":"token","budget_amount":1000000,"currency":"USD","period_type":"monthly","period_start":"2026-02-01","period_end":"2026-02-28"}'
```

**Expected:** 400/422. "Token budgets only for GenAI category."

### T-BP-024: Seat Type Only for Subscription

**Covers:** FR-BP-013 (VP-011)

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-ENG","category":"genai","budget_type":"seat","budget_amount":10,"currency":"USD","period_type":"monthly","period_start":"2026-02-01","period_end":"2026-02-28"}'
```

**Expected:** 400/422. "Seat budgets only for subscription category."

### T-BP-025: Duplicate Budget Rejected

**Covers:** FR-BP-013 (VP-008)

```bash
# Create first budget
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-OPS","category":"cloud","budget_amount":5000,"currency":"USD","period_type":"monthly","period_start":"2026-03-01","period_end":"2026-03-31"}'

# Create duplicate (same entity + category + period)
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-OPS","category":"cloud","budget_amount":8000,"currency":"USD","period_type":"monthly","period_start":"2026-03-01","period_end":"2026-03-31"}'
```

**Expected:** Second request returns 409 Conflict. "Budget already exists for this entity/category/period."

---

## 4. Variance Calculation Tests

### T-BP-030: Summary Returns Variance

**Covers:** FR-BP-007, FR-BP-008

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG/summary?period_type=monthly&period_start=2026-02-01" \
  -H "X-API-Key: $KEY"
```

**Expected:** 200 OK. Each budget entry has:
- `actual_amount` >= 0 (calculated from cost_data_standard_1_3)
- `variance` = actual_amount - budget_amount
- `pct_used` = (actual_amount / budget_amount) * 100
- `status` = `on_track` | `approaching` | `exceeded`

### T-BP-031: Status Thresholds Correct

**Covers:** FR-BP-007

**Precondition:** Create budgets where actual spend is known:
- Budget $10,000 with actual ~$7,000 → expect `on_track` (70%)
- Budget $10,000 with actual ~$8,500 → expect `approaching` (85%)
- Budget $10,000 with actual ~$11,000 → expect `exceeded` (110%)

**Expected:** Status values match threshold rules exactly.

### T-BP-032: Category Filter on Variance

**Covers:** FR-BP-007, FR-BP-001

```bash
# Only cloud costs
curl -s "http://localhost:8000/api/v1/budgets/$ORG/summary?category=cloud" -H "X-API-Key: $KEY"
```

**Expected:** Only cloud-category budgets returned. Actual amounts calculated from cloud costs only.

### T-BP-033: Total Budget Includes All Categories

**Covers:** FR-BP-001

Create a `total` category budget for DEPT-ENG. Verify summary returns actual_amount = sum of cloud + genai + subscription costs.

---

## 5. Allocation Tree Tests

### T-BP-040: Allocation Tree Structure

**Covers:** FR-BP-005, FR-BP-009

```bash
# Setup: Create budgets at org, dept, and project levels
# Then query allocation tree
curl -s "http://localhost:8000/api/v1/budgets/$ORG/allocation-tree?category=cloud&period_type=monthly&period_start=2026-02-01" \
  -H "X-API-Key: $KEY"
```

**Expected:** Nested tree with:
- Root node has `budget_amount`, `allocated_to_children`, `unallocated`
- Children match hierarchy structure
- `allocated_to_children` = sum of child budget amounts
- `unallocated` = budget_amount - allocated_to_children

### T-BP-041: Over-Allocation Warning

**Covers:** FR-BP-005

Create parent budget $10,000. Create children summing to $12,000.

**Expected:** `unallocated` = -2000 (negative). No error. Display shows warning indicator.

### T-BP-042: Partial Allocation

**Covers:** FR-BP-005

Create parent budget $10,000. Create one child at $6,000.

**Expected:** `unallocated` = 4000. `allocated_to_children` = 6000.

---

## 6. Category & Provider Breakdown Tests

### T-BP-050: Category Breakdown

**Covers:** FR-BP-010

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG/by-category?hierarchy_entity_id=DEPT-ENG&period_type=monthly&period_start=2026-02-01" \
  -H "X-API-Key: $KEY"
```

**Expected:** Response has `categories.cloud`, `categories.genai`, `categories.subscription`, `categories.total` — each with budget, actual, variance, pct_used, status.

### T-BP-051: Provider Breakdown (GenAI)

**Covers:** FR-BP-011

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG/by-provider?hierarchy_entity_id=TEAM-TRAINING&category=genai&period_type=monthly&period_start=2026-02-01" \
  -H "X-API-Key: $KEY"
```

**Expected:** Response has per-provider entries (openai, anthropic, etc.) with budget, actual, and token fields.

### T-BP-052: Provider Breakdown (Subscription with Seats)

**Covers:** FR-BP-011

For a subscription budget with `budget_type=seat`, verify provider breakdown includes `seat_budget` and `seat_actual`.

---

## 7. Security Tests

### T-BP-060: IDOR Protection

**Covers:** NFR-BP-003

```bash
# Try to access org_B's budgets with org_A's API key
curl -s "http://localhost:8000/api/v1/budgets/org_b_slug" -H "X-API-Key: $ORG_A_KEY"
```

**Expected:** 403 Forbidden.

### T-BP-061: No API Key Rejected

**Covers:** NFR-BP-003

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG"
```

**Expected:** 401 Unauthorized.

### T-BP-062: Extra Fields Rejected

**Covers:** NFR-BP-003

```bash
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-ENG","category":"cloud","budget_amount":1000,"currency":"USD","period_type":"monthly","period_start":"2026-02-01","period_end":"2026-02-28","evil_field":"hack"}'
```

**Expected:** 422 Unprocessable Entity. Extra fields not allowed.

---

## 8. Frontend Tests

### T-BP-070: Budget Page Loads

**Covers:** FR-BP-014

```
Navigate to /{orgSlug}/budgets
```

**Expected:**
- Page loads with header (icon + "Budgets" title)
- Stats row shows Total Budget, Total Actual, Variance, Entities count
- 4 tabs visible: Overview, Allocation, By Category, By Provider
- Overview tab active by default

### T-BP-071: Create Budget Dialog

**Covers:** FR-BP-014

```
Click "Create Budget" button
```

**Expected:**
- Dialog opens with form fields: Hierarchy Entity (dropdown), Category (select), Budget Type (select), Amount (input), Currency (select), Period (select), Provider (optional), Notes (optional)
- Submit creates budget and refreshes list
- Cancel closes dialog without changes

### T-BP-072: Allocation Tab Tree View

**Covers:** FR-BP-014

```
Click "Allocation" tab
```

**Expected:**
- Hierarchy tree displayed with budget amounts at each node
- Expandable/collapsible nodes
- Each node shows: name, budget, actual, % used, status badge
- Unallocated amount shown at parent nodes

### T-BP-073: Sidebar Navigation

**Covers:** FR-BP-016

**Expected:** "Budgets" appears in Settings group, between Hierarchy and Usage & Quotas. Owner-only.

### T-BP-074: Dashboard Widget

**Covers:** FR-BP-015

**Precondition:** Org has at least one active budget.

**Expected:** Budget summary card on dashboard showing Total Budget, Total Actual, % Used. "View Budgets" link navigates to `/budgets`.

---

## 9. Filter Integration Tests (Shared AdvancedFilterBar)

### T-BP-075: Filter Bar Renders on Budget Page

**Covers:** FR-BP-014, FR-AF-005.1

```
Navigate to /{orgSlug}/budgets
```

**Expected:**
- AdvancedFilterBar renders with: Search, Category, Period, Status, Hierarchy Entity
- Provider and Time Range filters NOT shown
- All dropdowns default to "All"

### T-BP-076: Category Filter Dispatches Server-Side

**Covers:** FR-AF-005.2

```
Select "Cloud" in Category dropdown
```

**Expected:**
- Network request to `GET /budgets/{org}/summary?category=cloud`
- Only cloud budgets shown in Overview tab
- Allocation tree filtered to cloud category
- By Category tab reflects filter

### T-BP-077: Hierarchy Filter Dispatches Server-Side

**Covers:** FR-AF-005.3

```
Select "Engineering" in Entity dropdown
```

**Expected:**
- Network request includes `?hierarchy_entity_id=DEPT-ENG`
- Summary/variance shows only Engineering department budgets
- Combined with category filter: `?category=cloud&hierarchy_entity_id=DEPT-ENG`

### T-BP-078: Period Filter Dispatches Server-Side

**Covers:** FR-AF-005.4

```
Select "Monthly" in Period dropdown
```

**Expected:**
- Budget list request includes `?period_type=monthly`
- Only monthly budgets shown in Budgets tab

### T-BP-079: Search Filters Client-Side

**Covers:** FR-AF-005.5

**Precondition:** Budget page loaded with data.

```
Type "engineering" in Search box
```

**Expected:**
- Variance rows filtered instantly (no API call)
- Only rows with "engineering" in entity name or budget name shown
- Budget list tab also filtered

### T-BP-079a: Status Filter Client-Side

**Covers:** FR-AF-005.6

```
Select "Over Budget" in Status dropdown
```

**Expected:**
- Only variance rows where actual > budget shown
- No new API call triggered
- Works in combination with server-side filters

### T-BP-079b: Clear Filters Resets All

**Covers:** FR-AF-001.5

```
Set category="cloud", search="engineering", status="over"
Click "Clear (3)" button
```

**Expected:**
- All filters reset to defaults
- Full unfiltered data reloaded (API re-fetch for server params)
- Filter badge count goes to 0

### T-BP-079c: Filtered Empty State

**Covers:** FR-AF-005.7

```
Apply filters that match no budgets (e.g., search="nonexistent")
```

**Expected:**
- FilteredEmptyState shown with filter icon
- "No results match your filters" message
- "Clear Filters" button that resets filters

---

## 10. Performance Tests

### T-BP-080: CRUD Response Time

**Covers:** NFR-BP-001

**Expected:** All CRUD operations complete in < 500ms.

### T-BP-081: Summary Response Time

**Covers:** NFR-BP-001

**Expected:** Summary with variance calculation completes in < 2s for orgs with up to 100 budgets.

### T-BP-082: Allocation Tree Response Time

**Covers:** NFR-BP-001

**Expected:** Allocation tree completes in < 1s for hierarchies with up to 50 entities.

---

## 10. Integration Tests (End-to-End)

### T-BP-090: Full Budget Lifecycle

**Covers:** All FRs

```bash
# 1. Create org-level total budget
POST /budgets/$ORG → total, $50,000/month

# 2. Create department budgets (cloud + genai + sub)
POST /budgets/$ORG → DEPT-ENG, cloud, $20,000
POST /budgets/$ORG → DEPT-ENG, genai, $8,000
POST /budgets/$ORG → DEPT-ENG, subscription, $2,000

# 3. Create team budgets under dept
POST /budgets/$ORG → TEAM-BE, cloud, $10,000
POST /budgets/$ORG → TEAM-FE, cloud, $10,000

# 4. Create token budget for GenAI team
POST /budgets/$ORG → TEAM-TRAINING, genai, token, 25M, provider=openai

# 5. Create seat budget for design
POST /budgets/$ORG → PROJ-DESIGN, subscription, seat, 15, provider=figma

# 6. Verify summary shows variance against actual costs
GET /budgets/$ORG/summary

# 7. Verify allocation tree shows correct rollup
GET /budgets/$ORG/allocation-tree

# 8. Verify category breakdown
GET /budgets/$ORG/by-category?hierarchy_entity_id=DEPT-ENG

# 9. Verify provider breakdown
GET /budgets/$ORG/by-provider?hierarchy_entity_id=TEAM-TRAINING&category=genai

# 10. Update a budget amount
PUT /budgets/$ORG/$BUDGET_ID → new amount

# 11. Delete a budget
DELETE /budgets/$ORG/$BUDGET_ID

# 12. Verify deleted budget excluded from summary
GET /budgets/$ORG/summary → deleted budget not included
```

**Expected:** All steps succeed. Variance calculations match actual cost data in BigQuery.

### T-BP-091: Multi-Currency Budget

**Covers:** FR-BP-012, i18n-locale integration

Create budget in EUR for an org with EUR as default currency. Verify variance calculation uses correct exchange rate when comparing against USD-denominated cost data.

---

## Test Execution Order

| Phase | Tests | Prerequisite |
|-------|-------|-------------|
| 1. Schema | T-BP-001, T-BP-002 | Bootstrap-sync completed |
| 2. API CRUD | T-BP-010 through T-BP-017 | Schema deployed, API running |
| 3. Validation | T-BP-020 through T-BP-025 | API running |
| 4. Variance | T-BP-030 through T-BP-033 | Budgets created, cost data exists |
| 5. Allocation | T-BP-040 through T-BP-042 | Multi-level budgets created |
| 6. Breakdowns | T-BP-050 through T-BP-052 | Provider-level budgets created |
| 7. Security | T-BP-060 through T-BP-062 | API running, multi-org setup |
| 8. Frontend | T-BP-070 through T-BP-074 | Full backend deployed |
| 9. Filters | T-BP-075 through T-BP-079c | Frontend running, budgets exist |
| 10. Performance | T-BP-080 through T-BP-082 | Production-like data volume |
| 11. Integration | T-BP-090 through T-BP-091 | Full system running |
