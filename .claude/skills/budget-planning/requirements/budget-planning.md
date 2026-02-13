# Budget Planning - Requirements

## Overview

Hierarchy-based budget planning and variance tracking system for CloudAct. Enables organizations to set spending targets at any hierarchy level (Org/Department/Project/Team), broken down by cost category (cloud, GenAI, subscription), with top-down allocation from parent to child entities. Tracks planned vs actual spend using existing `cost_data_standard_1_3` as the source of truth. Supports monetary, token, and seat-based budget types. No enforcement — display and tracking only.

## Source Specifications

- `BUDGET_PLANNING.md` (v1.0, 2026-02-12)
- Industry reference: GCP Cloud Billing Budget API v1, AWS Budgets API, OpenAI Usage Tiers, Figma Billing Groups
- FinOps Foundation: Cost Allocation, Chargeback, Showback capabilities

## Key Architecture Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Location** | Central `organizations` dataset | Same as hierarchy/alerts/quotas. Multi-tenant via org_slug. Managed by bootstrap. |
| **Variance Engine** | Separate `budget_read/` service folder | Similar pattern to `cost_read/` but independent. Own cache, own aggregation. |
| **Access Control** | Owner creates, all members view | Promotes budget transparency. Only owners/admins can create/edit/delete. |
| **Build Scope** | All 3 phases (Data + API + Frontend) | Complete feature in one pass. |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          Budget Planning Architecture                             │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Frontend (Next.js 16)                                                          │
│   ┌────────────────────────────────────────────┐                                │
│   │ /[orgSlug]/budgets                          │                                │
│   │ ├─ Overview Tab    (stats + status chart)   │                                │
│   │ ├─ Allocation Tab  (hierarchy tree + $)     │                                │
│   │ ├─ Category Tab    (cloud/genai/sub cards)  │                                │
│   │ └─ Provider Tab    (provider breakdown)     │                                │
│   │                                             │                                │
│   │ Server Actions: actions/budgets.ts          │                                │
│   │ ├─ getBudgets()                             │                                │
│   │ ├─ createBudget()                           │                                │
│   │ ├─ updateBudget()                           │                                │
│   │ ├─ deleteBudget()                           │                                │
│   │ ├─ getBudgetSummary()                       │                                │
│   │ ├─ getAllocationTree()                      │                                │
│   │ └─ getCategoryBreakdown()                   │                                │
│   └────────────────────┬───────────────────────┘                                │
│                        │ HTTP (org API key)                                       │
│                        ▼                                                         │
│   API Service (FastAPI 8000)                                                     │
│   ┌────────────────────────────────────────────┐                                │
│   │ Router: /api/v1/budgets/{org_slug}          │                                │
│   │ ├─ GET    /                  (list)         │                                │
│   │ ├─ GET    /{id}              (get)          │                                │
│   │ ├─ POST   /                  (create)       │                                │
│   │ ├─ PUT    /{id}              (update)       │                                │
│   │ ├─ DELETE /{id}              (soft delete)  │                                │
│   │ ├─ GET    /summary           (variance)     │                                │
│   │ ├─ GET    /allocation-tree   (rollup)       │                                │
│   │ ├─ GET    /by-category       (category)     │                                │
│   │ └─ GET    /by-provider       (provider)     │                                │
│   │                                             │                                │
│   │ Models: budget_models.py                    │                                │
│   │                                             │                                │
│   │ Services (2 folders):                       │                                │
│   │ ├─ budget_crud/                             │  ← CRUD operations             │
│   │ │  ├─ service.py (BudgetCRUDService)        │                                │
│   │ │  └─ models.py  (Pydantic models)          │                                │
│   │ └─ budget_read/                             │  ← Variance & aggregation      │
│   │    ├─ service.py (BudgetReadService)        │                                │
│   │    ├─ aggregations.py (Polars rollups)      │                                │
│   │    └─ models.py  (query/response models)    │                                │
│   │    └─ Reads cost_data_standard_1_3          │                                │
│   └────────────────────┬───────────────────────┘                                │
│                        │ BigQuery Client                                         │
│                        ▼                                                         │
│   BigQuery ({org_slug}_prod dataset)                                             │
│   ┌────────────────────────────────────────────┐                                │
│   │ org_budgets                                 │  ← Budget definitions          │
│   │ ├─ budget_id (PK)                           │                                │
│   │ ├─ org_slug (tenant)                        │                                │
│   │ ├─ hierarchy_entity_id → org_hierarchy      │                                │
│   │ ├─ category (cloud/genai/subscription/total)│                                │
│   │ ├─ budget_type (monetary/token/seat)        │                                │
│   │ ├─ budget_amount + currency                 │                                │
│   │ ├─ period_type + period_start + period_end  │                                │
│   │ └─ provider (optional filter)               │                                │
│   │                                             │                                │
│   │ org_budget_allocations                      │  ← Parent→child links          │
│   │ ├─ allocation_id (PK)                       │                                │
│   │ ├─ parent_budget_id → org_budgets           │                                │
│   │ ├─ child_budget_id → org_budgets            │                                │
│   │ └─ allocated_amount + percentage            │                                │
│   │                                             │                                │
│   │ cost_data_standard_1_3 (READ ONLY)          │  ← Actual spend source         │
│   │ └─ Filtered by hierarchy_entity_id +        │                                │
│   │    charge_period + service_category          │                                │
│   └────────────────────────────────────────────┘                                │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-BP-001: Budget Categories

Budget categories align with CloudAct's three cost types plus a total aggregate.

| Category | Maps To | Filter on `cost_data_standard_1_3` |
|----------|---------|-----------------------------------|
| `cloud` | GCP, AWS, Azure, OCI billing | `service_category = 'cloud'` OR `x_cloud_provider IS NOT NULL` |
| `genai` | OpenAI, Anthropic, Gemini, DeepSeek, Bedrock, Vertex | `service_category = 'genai'` OR `x_genai_provider IS NOT NULL` |
| `subscription` | SaaS plans (Figma, Slack, ChatGPT Plus, Canva) | `service_category = 'subscription'` |
| `total` | All of the above | No category filter (all rows) |

### FR-BP-002: Budget Types

Three budget types support different measurement units.

| Type | Unit | Primary Use | Actual Calculation |
|------|------|-------------|-------------------|
| `monetary` | org currency (ISO 4217) | All categories | `SUM(billed_cost)` from cost_data |
| `token` | tokens per period | GenAI category | `SUM(usage_quantity)` WHERE `pricing_unit LIKE '%token%'` |
| `seat` | seat count per period | Subscription category | `COUNT(DISTINCT resource_name)` or from subscription plan metadata |

**Monetary** is the default and most common. **Token** and **seat** are advanced types for GenAI and SaaS respectively.

### FR-BP-003: Budget Periods

| Period Type | Start | End | Auto-Generate Next |
|-------------|-------|-----|-------------------|
| `monthly` | 1st of month | Last day of month | Yes, on period_end |
| `quarterly` | Jan 1 / Apr 1 / Jul 1 / Oct 1 | Last day of quarter | Yes |
| `yearly` | Jan 1 (or fiscal year start) | Dec 31 (or fiscal year end) | Yes |
| `custom` | User-defined | User-defined | No |

**Fiscal year support:** If org has `fiscal_year_start_month` configured (via i18n-locale), yearly budgets use that as start month. Otherwise default to January.

### FR-BP-004: Hierarchy Integration

Budgets reference hierarchy entities from the existing hierarchy system.

1. Every budget has a `hierarchy_entity_id` that points to an entity in `org_hierarchy`
2. Valid entity types: `ORG` (root), `DEPT-*`, `PROJ-*`, `TEAM-*`
3. When a hierarchy entity is deleted, its budgets are soft-deleted (cascade)
4. Budget hierarchy follows the org hierarchy tree — no independent budget tree
5. Org-level budgets use `hierarchy_entity_id = "ORG"` as a convention

### FR-BP-005: Top-Down Allocation

Top-down allocation distributes a parent budget to child entities.

1. Admin creates a budget at a parent level (e.g., DEPT-ENG: $30,000 cloud)
2. Admin creates budgets at child levels (e.g., PROJ-PLATFORM: $18,000, PROJ-ML: $12,000)
3. System automatically creates `org_budget_allocations` records linking parent to children
4. Allocation matching: parent and child must share same `category`, `period_type`, and overlapping `period_start`/`period_end`
5. Display: `allocated = SUM(child budgets)`, `unallocated = parent - allocated`
6. **Warning only** if allocated > parent budget (never block)

### FR-BP-006: Budget CRUD API

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `GET` | `/api/v1/budgets/{org}` | List budgets with filters | Org API Key |
| `GET` | `/api/v1/budgets/{org}/{budget_id}` | Get single budget | Org API Key |
| `POST` | `/api/v1/budgets/{org}` | Create budget | Org API Key |
| `PUT` | `/api/v1/budgets/{org}/{budget_id}` | Update budget | Org API Key |
| `DELETE` | `/api/v1/budgets/{org}/{budget_id}` | Soft delete (is_active=false) | Org API Key |

**List filters (query params):**

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category (cloud/genai/subscription/total) |
| `budget_type` | string | Filter by type (monetary/token/seat) |
| `period_type` | string | Filter by period (monthly/quarterly/yearly/custom) |
| `hierarchy_entity_id` | string | Filter by entity |
| `hierarchy_level_code` | string | Filter by level (org/department/project/team) |
| `provider` | string | Filter by provider |
| `is_active` | boolean | Default true |

### FR-BP-007: Budget Variance Calculation

Variance is calculated on-the-fly by joining budget data with actual cost data.

```sql
-- Actual spend for a budget
SELECT
  SUM(billed_cost) as actual_amount
FROM `{org_slug}_prod.cost_data_standard_1_3`
WHERE x_org_slug = @org_slug
  AND x_hierarchy_entity_id = @hierarchy_entity_id
  AND charge_period_start >= @period_start
  AND charge_period_start < @period_end
  -- Category filter (based on budget.category):
  -- cloud:        AND (service_category = 'cloud' OR x_cloud_provider IS NOT NULL)
  -- genai:        AND (service_category = 'genai' OR x_genai_provider IS NOT NULL)
  -- subscription: AND service_category = 'subscription'
  -- total:        (no category filter)
  -- Provider filter (if budget.provider is set):
  -- AND (x_cloud_provider = @provider OR x_genai_provider = @provider OR provider_name = @provider)
```

**Variance fields:**

| Field | Formula |
|-------|---------|
| `actual_amount` | `SUM(billed_cost)` from cost_data_standard_1_3 |
| `variance` | `actual_amount - budget_amount` |
| `pct_used` | `(actual_amount / budget_amount) * 100` |
| `status` | `on_track` (<80%), `approaching` (80-99%), `exceeded` (>=100%) |

### FR-BP-008: Budget Summary View

Read-only endpoint returning all budgets for an org with actual spend calculated.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/budgets/{org}/summary` | All budgets with variance |

**Query params:** `period_type`, `period_start`, `period_end`, `category`, `hierarchy_entity_id`

**Response:**
```json
{
  "budgets": [
    {
      "budget_id": "uuid",
      "hierarchy_entity_id": "DEPT-ENG",
      "hierarchy_entity_name": "Engineering",
      "hierarchy_level_code": "department",
      "category": "cloud",
      "budget_type": "monetary",
      "budget_amount": 20000,
      "currency": "USD",
      "actual_amount": 17240.50,
      "variance": -2759.50,
      "pct_used": 86.2,
      "status": "approaching",
      "provider": null
    }
  ],
  "totals": {
    "total_budget": 50000,
    "total_actual": 43800,
    "total_variance": -6200,
    "overall_pct_used": 87.6
  }
}
```

### FR-BP-009: Allocation Tree View

Read-only endpoint returning the hierarchy tree with budget allocations at each node.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/budgets/{org}/allocation-tree` | Hierarchical budget view |

**Query params:** `root_entity_id` (optional, defaults to ORG), `category`, `period_type`, `period_start`

**Response:**
```json
{
  "entity_id": "ORG",
  "entity_name": "Acme Inc",
  "budget_amount": 50000,
  "actual_amount": 43800,
  "allocated_to_children": 50000,
  "unallocated": 0,
  "pct_used": 87.6,
  "status": "approaching",
  "children": [
    {
      "entity_id": "DEPT-ENG",
      "entity_name": "Engineering",
      "budget_amount": 30000,
      "actual_amount": 28210,
      "allocated_to_children": 30000,
      "unallocated": 0,
      "children": [...]
    }
  ]
}
```

### FR-BP-010: Category Breakdown View

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/budgets/{org}/by-category` | Budget vs actual per category |

**Query params:** `hierarchy_entity_id`, `period_type`, `period_start`, `period_end`

**Response:**
```json
{
  "entity_id": "DEPT-ENG",
  "entity_name": "Engineering",
  "categories": {
    "cloud": { "budget": 20000, "actual": 17240, "variance": -2760, "pct_used": 86.2, "status": "approaching" },
    "genai": { "budget": 8000, "actual": 9120, "variance": 1120, "pct_used": 114.0, "status": "exceeded" },
    "subscription": { "budget": 2000, "actual": 1850, "variance": -150, "pct_used": 92.5, "status": "approaching" },
    "total": { "budget": 30000, "actual": 28210, "variance": -1790, "pct_used": 94.0, "status": "approaching" }
  }
}
```

### FR-BP-011: Provider Breakdown View

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/budgets/{org}/by-provider` | Budget vs actual per provider within category |

**Query params:** `hierarchy_entity_id`, `category`, `period_type`, `period_start`, `period_end`

**Response:**
```json
{
  "entity_id": "TEAM-TRAINING",
  "category": "genai",
  "providers": {
    "openai": {
      "budget": 3000, "actual": 2840, "pct_used": 94.7,
      "token_budget": 15000000, "token_actual": 14200000, "token_pct_used": 94.7
    },
    "anthropic": {
      "budget": 3500, "actual": 4100, "pct_used": 117.1,
      "token_budget": 5000000, "token_actual": 5800000, "token_pct_used": 116.0
    }
  }
}
```

### FR-BP-012: Pydantic Models

**Create request:**
```python
class BudgetCreateRequest(BaseModel):
    hierarchy_entity_id: str              # Required: DEPT-ENG, PROJ-ML, TEAM-BE
    category: BudgetCategory              # Required: cloud, genai, subscription, total
    budget_type: BudgetType = "monetary"  # Default: monetary
    budget_amount: float                  # Required: > 0
    currency: str = "USD"                 # Default: USD (ISO 4217)
    period_type: PeriodType               # Required: monthly, quarterly, yearly, custom
    period_start: date                    # Required
    period_end: date                      # Required
    provider: Optional[str] = None        # Optional: openai, gcp, figma, etc.
    notes: Optional[str] = None           # Optional free text
```

**Update request (all optional):**
```python
class BudgetUpdateRequest(BaseModel):
    budget_amount: Optional[float] = None
    currency: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    provider: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
```

**Enums:**
```python
class BudgetCategory(str, Enum):
    CLOUD = "cloud"
    GENAI = "genai"
    SUBSCRIPTION = "subscription"
    TOTAL = "total"

class BudgetType(str, Enum):
    MONETARY = "monetary"
    TOKEN = "token"
    SEAT = "seat"

class PeriodType(str, Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"

class BudgetStatus(str, Enum):
    ON_TRACK = "on_track"        # < 80%
    APPROACHING = "approaching"  # 80-99%
    EXCEEDED = "exceeded"        # >= 100%
```

### FR-BP-013: Validation Rules

| Rule | Validation | Error |
|------|-----------|-------|
| VP-001 | `budget_amount > 0` | "Budget amount must be positive" |
| VP-002 | `period_end > period_start` | "End date must be after start date" |
| VP-003 | `hierarchy_entity_id` exists in `org_hierarchy` | "Hierarchy entity not found" |
| VP-004 | `category` is valid enum | "Invalid category" |
| VP-005 | `budget_type` is valid enum | "Invalid budget type" |
| VP-006 | `period_type` is valid enum | "Invalid period type" |
| VP-007 | `currency` is valid ISO 4217 code | "Invalid currency code" |
| VP-008 | No duplicate (entity + category + period + provider) | "Budget already exists for this entity/category/period" |
| VP-009 | `provider` valid if set (exists in provider registry) | "Unknown provider" |
| VP-010 | `token` type only with `genai` category | "Token budgets only for GenAI category" |
| VP-011 | `seat` type only with `subscription` category | "Seat budgets only for subscription category" |

### FR-BP-014: Frontend Budget Page

4-tab layout at `/[orgSlug]/budgets`:

**Tab 1: Overview**
- Stats row: Total Budget, Total Actual, Variance, Entities with Budgets
- Budget vs Actual horizontal bar chart (top 10 entities by budget amount)
- Status distribution ring chart (on_track / approaching / exceeded counts)
- Create Budget button (opens dialog)

**Tab 2: Allocation**
- Hierarchy tree view (read from `/allocation-tree`)
- Each node shows: entity name, budget amount, actual amount, % used, status badge
- Expandable nodes with children
- Unallocated amount shown at each parent level
- Click entity to see detail panel

**Tab 3: By Category**
- 3 category cards (cloud, genai, subscription) + 1 total card
- Each card: budget vs actual bar, variance, status badge
- Hierarchy entity selector (dropdown) to filter to specific entity
- Period selector (month/quarter/year picker)

**Tab 4: By Provider**
- Category selector (cloud/genai/subscription)
- Entity selector (hierarchy dropdown)
- Provider breakdown table: Provider | Budget | Actual | Variance | % Used | Status
- For GenAI: additional columns for token_budget and token_actual
- For Subscription: additional columns for seat_budget and seat_actual

### FR-BP-015: Dashboard Widget

Add a budget summary widget to the main dashboard (`/[orgSlug]/dashboard`):

- Compact card showing: Total Budget, Total Actual, % Used, status color
- "View Budgets" link to `/[orgSlug]/budgets`
- Only shown if org has at least one active budget
- Position: after Cost Summary Grid, before Cost Trend Analysis

### FR-BP-016: Sidebar Navigation

Add "Budgets" to the Settings navigation group:

```
Settings
├─ Organization (owner)
├─ Hierarchy (owner)
├─ Budgets (owner)          ← NEW
├─ Usage & Quotas
├─ Team Members
└─ Billing (owner)
```

Owner-only access. Non-owners should not see this nav item.

---

## Non-Functional Requirements

### NFR-BP-001: Performance

| Metric | Target | How |
|--------|--------|-----|
| Budget CRUD response | < 500ms | Direct BigQuery read/write |
| Summary (variance) response | < 2s | Aggregation query on cost_data_standard_1_3 |
| Allocation tree response | < 1s | Single query with hierarchy join |
| Frontend page load | < 3s | Server actions with parallel data fetching |
| Max budgets per org | 1000 | Soft limit, warn at 500 |

### NFR-BP-002: Data Integrity

| Requirement | Implementation |
|-------------|---------------|
| Multi-tenant isolation | `org_slug` in every query WHERE clause + IDOR protection |
| Soft delete | `is_active = false` (never hard delete) |
| Audit trail | `created_by`, `updated_by`, `created_at`, `updated_at` on every record |
| Idempotency | Duplicate check on (entity + category + period + provider) |
| Cascade | Soft-delete budgets when hierarchy entity is deleted |

### NFR-BP-003: Security

| Requirement | Implementation |
|-------------|---------------|
| Authentication | Org API Key via `X-API-Key` header |
| Authorization | Owner-only for create/update/delete; all members for read |
| IDOR protection | `check_org_access()` on every endpoint (SEC-001/SEC-002) |
| Input validation | Pydantic models with `ConfigDict(extra="forbid")` |

---

## Data Structures

### BigQuery Tables

| Table | Partition | Clustering | Purpose |
|-------|-----------|------------|---------|
| `org_budgets` | `created_at` (DAY) | `org_slug`, `category`, `hierarchy_entity_id` | Budget definitions |
| `org_budget_allocations` | `created_at` (DAY) | `org_slug`, `parent_budget_id` | Parent-child budget links |

### Reads From (Existing Tables)

| Table | Fields Used | Purpose |
|-------|------------|---------|
| `org_hierarchy` | `entity_id`, `entity_name`, `parent_entity_id`, `level_code` | Hierarchy tree for allocation |
| `cost_data_standard_1_3` | `billed_cost`, `x_hierarchy_entity_id`, `charge_period_start`, `service_category`, `x_cloud_provider`, `x_genai_provider`, `provider_name`, `usage_quantity`, `pricing_unit` | Actual spend calculation |

---

## SDLC

### Development Workflow

**Phase 1: Data Layer**
1. Create `org_budgets.json` schema in bootstrap schemas
2. Create `org_budget_allocations.json` schema in bootstrap schemas
3. Add both tables to `config.yml` with partition/clustering
4. Run bootstrap-sync to create tables in test/stage environments
5. Verify tables created in BigQuery console

**Phase 2: API Layer**
1. Create `budget_models.py` with Pydantic models and enums
2. Create `budget_service.py` with CRUD operations + variance calculation
3. Create `budgets.py` router with all endpoints
4. Register router in `main.py`
5. Test all endpoints with curl

**Phase 3: Frontend Layer**
1. Create server actions in `actions/budgets.ts`
2. Create budget page at `app/[orgSlug]/budgets/page.tsx`
3. Add sidebar nav entry in `lib/nav-data.ts`
4. Add dashboard widget
5. Test full flow in browser

### Testing Approach

| Layer | Tool | Tests | Focus |
|-------|------|-------|-------|
| Schema | BigQuery console | Verify table creation | Schema correctness |
| API | curl / pytest | CRUD + variance + tree | Endpoint correctness |
| Service | pytest | Unit tests for variance calc | Calculation accuracy |
| Frontend | Playwright | Page load + CRUD flow | UI functionality |
| Integration | curl chain | Create budget → check summary | End-to-end flow |

### Deployment / CI-CD

1. Schema changes deployed via bootstrap-sync (Cloud Run Job)
2. API changes deployed via Cloud Build (push to main → stage, tag → prod)
3. Frontend changes deployed with API in same Cloud Build pipeline
4. No database migrations needed (BigQuery schema managed by bootstrap)

---

## Key Files

| File | Purpose |
|------|---------|
| **Phase 1: Data Layer** | |
| `02-api-service/configs/setup/bootstrap/schemas/org_budgets.json` | BQ schema for budgets |
| `02-api-service/configs/setup/bootstrap/schemas/org_budget_allocations.json` | BQ schema for allocations |
| `02-api-service/configs/setup/bootstrap/config.yml` | Table registration (add 2 entries) |
| **Phase 2: API Layer** | |
| `02-api-service/src/core/services/budget_crud/service.py` | CRUD service (create/update/delete/list) |
| `02-api-service/src/core/services/budget_crud/models.py` | CRUD Pydantic models + enums |
| `02-api-service/src/core/services/budget_crud/__init__.py` | Module init |
| `02-api-service/src/core/services/budget_read/service.py` | Read service (variance, aggregation, rollup) |
| `02-api-service/src/core/services/budget_read/aggregations.py` | Polars aggregation functions |
| `02-api-service/src/core/services/budget_read/models.py` | Query/response models |
| `02-api-service/src/core/services/budget_read/__init__.py` | Module init |
| `02-api-service/src/app/routers/budgets.py` | FastAPI router (CRUD + views) |
| `02-api-service/src/app/main.py` | Router registration (add import + include) |
| **Phase 3: Frontend Layer** | |
| `01-fronted-system/actions/budgets.ts` | Server actions |
| `01-fronted-system/app/[orgSlug]/budgets/page.tsx` | Budget page (4 tabs) |
| `01-fronted-system/lib/nav-data.ts` | Sidebar navigation (add Budgets entry) |
| `01-fronted-system/app/[orgSlug]/dashboard/page.tsx` | Dashboard widget (add budget summary card) |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/hierarchy` | Source of hierarchy entities that budgets attach to |
| `/cost-analysis` | Source of actual spend data (FOCUS 1.3 format) |
| `/cost-analytics` | Frontend data fetching patterns and caching |
| `/i18n-locale` | Multi-currency formatting and fiscal year configuration |
| `/notifications` | Future: budget threshold notifications via notification system |
| `/quota-mgmt` | Similar pattern (limits + tracking) for pipeline usage |
| `/bigquery-ops` | Schema management for new bootstrap tables |
| `/bootstrap-onboard` | Table creation during bootstrap-sync |
| `/console-ui` | UI component library for budget pages |
| `/charts` | Chart components for budget visualization |
| `/frontend-dev` | Next.js page and server action patterns |
| `/api-dev` | FastAPI router and Pydantic model patterns |
