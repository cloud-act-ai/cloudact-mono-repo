---
name: budget-planning
description: |
  Budget planning and tracking for CloudAct. Hierarchy-based budget allocation across cloud, GenAI, and SaaS costs.
  Use when: creating budgets, setting spending targets, viewing budget vs actual, allocating budgets to departments/projects/teams,
  tracking budget variance, configuring budget periods, managing provider-level budgets, or debugging budget calculations.
---

# /budget-planning - Budget Planning & Tracking

Hierarchy-based budget allocation and variance tracking across cloud, GenAI, and subscription cost types.

## Trigger

```
/budget-planning                          # Overview
/budget-planning create <org>             # Create budget for org
/budget-planning status <org>             # Budget vs actual summary
/budget-planning allocate <org>           # Top-down allocation view
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Budget Planning System                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Frontend (3000)           API Service (8000)        BigQuery          │
│   ─────────────────         ──────────────────        ────────          │
│                                                                         │
│   Budget Page               Budget Router             org_budgets       │
│   ├─ Overview tab           ├─ CRUD endpoints         ├─ budget_id      │
│   ├─ Allocation tab         ├─ Allocation view        ├─ hierarchy ref  │
│   ├─ By Category tab        ├─ Variance calc          ├─ category       │
│   └─ Provider tab           └─ Rollup logic           └─ period         │
│                                    │                                    │
│   Hierarchy Tree ◄─────────────────┤                  org_budget_       │
│   (read-only ref)                  │                  allocations       │
│                                    │                  ├─ allocation_id   │
│   Cost Data ◄──────────────────────┘                  ├─ parent ref     │
│   (actual spend from                                  └─ child ref      │
│    cost_data_standard_1_3)                                              │
│                                                                         │
│   Dashboard Widget          Reads from:               Reads from:       │
│   └─ Budget summary         ├─ org_budgets            cost_data_        │
│      on main dashboard      ├─ org_budget_allocations standard_1_3     │
│                              └─ cost_data_standard_1_3 (actual spend)  │
│                                                                         │
│   Chat Agent (8002)         BudgetManager sub-agent                    │
│   └─ Budget queries via     ├─ list_budgets                            │
│      natural language        ├─ budget_summary                          │
│                              ├─ budget_variance                         │
│                              └─ budget_allocation_tree                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Environments

| Environment | API URL | BigQuery Project | Dataset |
|-------------|---------|-----------------|---------|
| local/test | `http://localhost:8000` | cloudact-testing-1 | `{org}_prod` |
| stage | `https://api-stage.cloudact.ai` | cloudact-testing-1 | `{org}_prod` |
| prod | `https://api.cloudact.ai` | cloudact-prod | `{org}_prod` |

## Key Locations

| Type | Path |
|------|------|
| **BigQuery Schema** | `02-api-service/configs/setup/bootstrap/schemas/org_budgets.json` |
| **BigQuery Schema** | `02-api-service/configs/setup/bootstrap/schemas/org_budget_allocations.json` |
| **Bootstrap Config** | `02-api-service/configs/setup/bootstrap/config.yml` |
| **API Router** | `02-api-service/src/app/routers/budgets.py` |
| **CRUD Service** | `02-api-service/src/core/services/budget_crud/service.py` |
| **CRUD Models** | `02-api-service/src/core/services/budget_crud/models.py` |
| **Read Service** | `02-api-service/src/core/services/budget_read/service.py` |
| **Read Aggregations** | `02-api-service/src/core/services/budget_read/aggregations.py` |
| **Read Models** | `02-api-service/src/core/services/budget_read/models.py` |
| **Frontend Page** | `01-fronted-system/app/[orgSlug]/budgets/page.tsx` |
| **Server Actions** | `01-fronted-system/actions/budgets.ts` |
| **Nav Data** | `01-fronted-system/lib/nav-data.ts` |
| **Chat Tools** | `07-org-chat-backend/src/core/tools/budgets.py` |
| **Chat Agent** | `07-org-chat-backend/src/core/agents/budget_manager.py` |
| **Chat Config** | `07-org-chat-backend/src/configs/agents.yml` |
| **Chat Prompt** | `07-org-chat-backend/src/configs/system_prompts/budget_manager.md` |

## Core Concepts

### Budget Categories (4)

| Category | What It Covers | Providers | Unit |
|----------|---------------|-----------|------|
| `cloud` | Infrastructure spend | GCP, AWS, Azure, OCI | $ |
| `genai` | AI/LLM API usage | OpenAI, Anthropic, Gemini, DeepSeek, Bedrock, Vertex | $ |
| `subscription` | SaaS licenses | Figma, Slack, ChatGPT Plus, Canva | $ |
| `total` | All categories combined | All | $ |

### Budget Types (3)

| Type | Unit | Use For | Example |
|------|------|---------|---------|
| `monetary` | $ (org currency) | All categories | "$10,000/month for cloud" |
| `token` | tokens/period | GenAI budgets | "25M tokens/month for OpenAI" |
| `seat` | seats | SaaS subscriptions | "15 Figma seats for Design team" |

### Budget Periods (4)

| Period | Resets | Use Case |
|--------|--------|----------|
| `monthly` | 1st of each month | Team operational budgets |
| `quarterly` | Jan/Apr/Jul/Oct 1 | Department planning |
| `yearly` | Jan 1 or fiscal year start | Org-level strategic budget |
| `custom` | User-defined date range | Project-specific budgets |

### Hierarchy Integration

Budgets attach to hierarchy entities at any level:

```
Org Budget: $50,000/month (total)
├─ DEPT-ENG: $30,000           ← Department budget
│  ├─ PROJ-PLATFORM: $18,000   ← Project budget
│  │  ├─ TEAM-BE: $10,000      ← Team budget (leaf)
│  │  └─ TEAM-FE: $8,000       ← Team budget (leaf)
│  └─ PROJ-ML: $12,000
│     └─ TEAM-TRAINING: $12,000
├─ DEPT-PRODUCT: $12,000
└─ DEPT-OPS: $8,000
```

**Validation:** Child allocations should sum to <= parent budget. Show warning if exceeded, never block.

## BigQuery Tables (2)

### org_budgets

Primary budget definitions. One record per hierarchy entity + category + period.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `budget_id` | STRING | Yes | UUID primary key |
| `org_slug` | STRING | Yes | Multi-tenant isolation |
| `hierarchy_entity_id` | STRING | Yes | Target entity (e.g., `DEPT-ENG`, `TEAM-BE`) |
| `hierarchy_entity_name` | STRING | Yes | Display name |
| `hierarchy_path` | STRING | Yes | Materialized path |
| `hierarchy_level_code` | STRING | Yes | `org`, `department`, `project`, `team` |
| `category` | STRING | Yes | `cloud`, `genai`, `subscription`, `total` |
| `budget_type` | STRING | Yes | `monetary`, `token`, `seat` |
| `budget_amount` | FLOAT | Yes | Target amount ($ or tokens or seats) |
| `currency` | STRING | Yes | ISO 4217 code (USD, EUR, INR) |
| `period_type` | STRING | Yes | `monthly`, `quarterly`, `yearly`, `custom` |
| `period_start` | DATE | Yes | Period start date |
| `period_end` | DATE | Yes | Period end date |
| `provider` | STRING | No | Optional provider filter (e.g., `openai`, `gcp`) |
| `notes` | STRING | No | Free-text notes |
| `is_active` | BOOLEAN | Yes | Soft delete flag |
| `created_by` | STRING | Yes | Creator user ID |
| `updated_by` | STRING | No | Last updater |
| `created_at` | TIMESTAMP | Yes | Creation time |
| `updated_at` | TIMESTAMP | No | Last update time |

### org_budget_allocations

Parent-to-child allocation tracking. Links a parent budget to its child distributions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `allocation_id` | STRING | Yes | UUID primary key |
| `org_slug` | STRING | Yes | Multi-tenant isolation |
| `parent_budget_id` | STRING | Yes | Parent budget reference |
| `child_budget_id` | STRING | Yes | Child budget reference |
| `allocated_amount` | FLOAT | Yes | Amount allocated to child |
| `allocation_percentage` | FLOAT | No | % of parent (calculated) |
| `created_at` | TIMESTAMP | Yes | Creation time |
| `updated_at` | TIMESTAMP | No | Last update time |

## Key Endpoints

### Budget CRUD

```bash
# List budgets for org
curl -s "$API/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY"

# List budgets with filters
curl -s "$API/api/v1/budgets/$ORG?category=genai&period_type=monthly&hierarchy_entity_id=DEPT-ENG" \
  -H "X-API-Key: $KEY"

# Get single budget
curl -s "$API/api/v1/budgets/$ORG/$BUDGET_ID" \
  -H "X-API-Key: $KEY"

# Create budget
curl -s -X POST "$API/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
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

# Update budget
curl -s -X PUT "$API/api/v1/budgets/$ORG/$BUDGET_ID" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"budget_amount": 25000}'

# Delete budget (soft delete)
curl -s -X DELETE "$API/api/v1/budgets/$ORG/$BUDGET_ID" \
  -H "X-API-Key: $KEY"

# Top-down allocation (create parent + children + allocation records)
curl -s -X POST "$API/api/v1/budgets/$ORG/allocate" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id": "ORG",
    "hierarchy_entity_name": "Acme Inc",
    "hierarchy_level_code": "organization",
    "category": "cloud",
    "budget_type": "monetary",
    "budget_amount": 100000,
    "currency": "USD",
    "period_type": "yearly",
    "period_start": "2026-01-01",
    "period_end": "2026-12-31",
    "allocations": [
      {"hierarchy_entity_id": "DEPT-ENG", "hierarchy_entity_name": "Engineering", "hierarchy_level_code": "department", "percentage": 40},
      {"hierarchy_entity_id": "DEPT-OPS", "hierarchy_entity_name": "Operations", "hierarchy_level_code": "department", "percentage": 30},
      {"hierarchy_entity_id": "DEPT-DS", "hierarchy_entity_name": "Data Science", "hierarchy_level_code": "department", "percentage": 20}
    ]
  }'
# Returns: { parent_budget, children: [{budget, allocation_id, allocated_amount, allocation_percentage}], unallocated_amount: 10000, unallocated_percentage: 10 }
```

### Budget Views (Read-Only Computed)

```bash
# Budget vs Actual summary (variance report)
curl -s "$API/api/v1/budgets/$ORG/summary?period_type=monthly&period_start=2026-02-01" \
  -H "X-API-Key: $KEY"
# Returns: { budgets: [{ budget_id, entity, category, budget_amount, actual_amount, variance, pct_used }] }

# Allocation tree (top-down view)
curl -s "$API/api/v1/budgets/$ORG/allocation-tree?root_entity_id=DEPT-ENG" \
  -H "X-API-Key: $KEY"
# Returns: { entity, budget, allocated_to_children, unallocated, children: [...] }

# Category breakdown for entity
curl -s "$API/api/v1/budgets/$ORG/by-category?hierarchy_entity_id=DEPT-ENG&period_type=monthly" \
  -H "X-API-Key: $KEY"
# Returns: { cloud: {budget, actual}, genai: {budget, actual}, subscription: {budget, actual}, total: {...} }

# Provider breakdown for entity + category
curl -s "$API/api/v1/budgets/$ORG/by-provider?hierarchy_entity_id=TEAM-TRAINING&category=genai" \
  -H "X-API-Key: $KEY"
# Returns: { openai: {budget, actual, tokens_budget, tokens_actual}, anthropic: {...}, ... }
```

## Variance Calculation

```
actual = SUM(BilledCost) FROM cost_data_standard_1_3
         WHERE (x_hierarchy_entity_id = budget.entity_id
                OR x_hierarchy_path CONTAINS budget.entity_id)  -- parent rollup
         AND charge_date >= budget.period_start
         AND charge_date < budget.period_end
         AND category matches budget.category  -- "total" = all categories
         AND ServiceProviderName matches budget.provider  -- if provider set (via PROVIDER_NAME_MAP)

variance = budget_amount - actual
variance_percent = (variance / budget_amount) * 100

is_over_budget = actual > budget_amount
```

**Key rules:**
- Parent entities (DEPT-*, PROJ-*) include costs from all children via `x_hierarchy_path` containment
- "total" category sums ALL cost types (cloud + genai + subscription)
- Provider filter normalizes FOCUS names → budget short names (e.g., "Google Cloud" → "gcp")
- Each budget's actual is independently scoped — no shared/global pools

## Procedures

### 1. Create Org-Level Budget

```bash
# Step 1: Set total org budget (monthly)
curl -s -X POST "$API/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id": "ORG",
    "category": "total",
    "budget_type": "monetary",
    "budget_amount": 50000,
    "currency": "USD",
    "period_type": "monthly",
    "period_start": "2026-02-01",
    "period_end": "2026-02-28"
  }'

# Step 2: Break down by category
curl -s -X POST "$API/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id": "ORG", "category": "cloud", "budget_type": "monetary", "budget_amount": 30000, "currency": "USD", "period_type": "monthly", "period_start": "2026-02-01", "period_end": "2026-02-28"}'

# Repeat for genai ($15,000), subscription ($5,000)
```

### 2. Top-Down Allocation to Departments (via `/allocate` API)

```bash
# Allocate cloud budget to departments in one request
# Creates: 1 parent budget + 3 child budgets + 3 allocation records
curl -s -X POST "$API/api/v1/budgets/$ORG/allocate" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id": "ORG",
    "hierarchy_entity_name": "Acme Inc",
    "hierarchy_level_code": "organization",
    "category": "cloud",
    "budget_type": "monetary",
    "budget_amount": 100000,
    "currency": "USD",
    "period_type": "yearly",
    "period_start": "2026-01-01",
    "period_end": "2026-12-31",
    "allocations": [
      {"hierarchy_entity_id": "DEPT-ENG", "hierarchy_entity_name": "Engineering", "hierarchy_level_code": "department", "percentage": 40},
      {"hierarchy_entity_id": "DEPT-OPS", "hierarchy_entity_name": "Operations", "hierarchy_level_code": "department", "percentage": 30},
      {"hierarchy_entity_id": "DEPT-DS", "hierarchy_entity_name": "Data Science", "hierarchy_level_code": "department", "percentage": 20}
    ]
  }'
# Creates: parent=$100K, ENG=$40K (40%), OPS=$30K (30%), DS=$20K (20%), margin=$10K (10%)

# Check allocation tree
curl -s "$API/api/v1/budgets/$ORG/allocation-tree" -H "X-API-Key: $KEY"
```

**Frontend flow:** "+Create Budget" → "Top-Down Allocation" tab → Step 1 (parent budget) → Step 2 (allocate % to children) → Step 3 (review) → Submit

**What gets created per allocation:**

| Table | Records | Example |
|-------|---------|---------|
| `org_budgets` | 1 parent + N children | Parent=$100K, 3 children |
| `org_budget_allocations` | N allocation links | 3 rows linking parent→child |

**Validation:** Sum of allocation percentages must be <= 100%. No duplicate child entity IDs.

### 3. Create Token Budget (GenAI)

```bash
curl -s -X POST "$API/api/v1/budgets/$ORG" \
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
    "provider": "openai",
    "notes": "GPT-4o training pipeline budget"
  }'
```

### 4. Create Seat Budget (Subscription)

```bash
curl -s -X POST "$API/api/v1/budgets/$ORG" \
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
    "provider": "figma",
    "notes": "Full Figma seats for design team"
  }'
```

### 5. View Budget vs Actual

```bash
# Summary for current month
curl -s "$API/api/v1/budgets/$ORG/summary?period_type=monthly&period_start=2026-02-01" \
  -H "X-API-Key: $KEY"

# Expected response:
# {
#   "budgets": [
#     {
#       "budget_id": "...",
#       "hierarchy_entity_id": "DEPT-ENG",
#       "hierarchy_entity_name": "Engineering",
#       "category": "cloud",
#       "budget_amount": 20000,
#       "actual_amount": 17240,
#       "variance": -2760,
#       "pct_used": 86.2,
#       "status": "approaching"
#     }
#   ]
# }
```

## Frontend Pages

### Budget Overview (`/[orgSlug]/budgets`)

5-tab layout:

| Tab | Content |
|-----|---------|
| **Overview** | Stats row (total budget, total actual, variance, over-budget count) + variance list with progress bars |
| **Budgets** | Raw budget list with edit/delete actions |
| **Allocation** | Hierarchy tree with budget amounts, allocated vs unallocated at each level |
| **By Category** | Category cards (cloud/genai/subscription) with budget vs actual per category |
| **By Provider** | Provider-level breakdown within selected category |

### Create Budget Dialog (Enhanced)

Two modes via toggle:

| Mode | Flow | Creates |
|------|------|---------|
| **Single Budget** | One-step form → submit | 1 budget |
| **Top-Down Allocation** | Step 1 (parent) → Step 2 (allocate % to children) → Step 3 (review) → submit | 1 parent + N child budgets + N allocation records |

**Allocation mode features:**
- Children auto-populated from hierarchy tree based on selected parent entity
- "Equal Split" button distributes equally across children
- Progress bar shows % allocated
- Unallocated margin displayed as difference from 100%
- Category, type, period, currency inherited from parent to all children

### Navigation

Budgets has its own **Budget Planning** section in the sidebar, below Cost Analytics:

```
Cost Analytics
├─ Overview
├─ GenAI Costs
├─ Cloud Costs
└─ Subscriptions
Budget Planning       ← Own section (Target icon)
└─ Budgets
```

**Source:** `lib/nav-data.ts` → `getNavGroups()` → `id: "budget-planning"`

## Chat Agent Integration

The BudgetManager sub-agent in the chat backend (port 8002) allows users to query budgets via natural language:

```
"Am I over budget?" → budget_summary()
"Show cloud budgets" → list_budgets(category="cloud")
"Engineering budget vs actual" → budget_variance(hierarchy_entity_id="DEPT-ENG")
"How are budgets allocated?" → budget_allocation_tree()
```

**Read-only:** Chat agent can only query budgets. Create/edit/delete must go through the API/frontend.

**Security:** All tools use `bind_org_slug()` to prevent cross-org access via prompt injection.

## Budget Verification

### API Verification
```bash
# List all budgets
curl -s "http://localhost:8000/api/v1/budgets/$ORG_SLUG" -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Budgets: {len(d[\"budgets\"])}'); [print(f'  {b[\"hierarchy_entity_id\"]} {b[\"category\"]} ${b[\"budget_amount\"]:,.0f}') for b in d['budgets']]"

# Budget summary with variance
curl -s "http://localhost:8000/api/v1/budgets/$ORG_SLUG/summary" -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Total Budget: ${d[\"total_budget\"]:,.0f}'); print(f'Total Actual: ${d[\"total_actual\"]:,.0f}'); print(f'Over: {d[\"budgets_over\"]}, Under: {d[\"budgets_under\"]}')"

# Allocation tree
curl -s "http://localhost:8000/api/v1/budgets/$ORG_SLUG/allocation-tree" -H "X-API-Key: $API_KEY" | python3 -m json.tool | head -30
```

### Frontend Verification
```bash
# Verify budget page renders in browser (part of full verification)
npx tsx tests/demo-setup/verify-frontend.ts --org-slug=$ORG_SLUG --api-key=$API_KEY --pages=budgets
```

**Known issue**: Budget page may show "Loading..." in Playwright + Next.js dev mode. The verification script uses API fallback to confirm data exists. In production, the page loads normally.

### Demo Budget Data
| Entity | Category | Type | Amount | Period |
|--------|----------|------|--------|--------|
| DEPT-ENG | cloud | monetary | $30,000 | quarterly |
| DEPT-DS | genai | monetary | $25,000 | quarterly |
| PROJ-PLATFORM | cloud | monetary | $20,000 | quarterly |
| PROJ-MLPIPE | genai | monetary | $20,000 | quarterly |
| TEAM-BACKEND | cloud | monetary | $12,000 | quarterly |
| TEAM-FRONTEND | subscription | monetary | $3,000 | quarterly |
| TEAM-MLOPS | genai | token | 50M tokens | quarterly |
| DEPT-ENG | total | monetary | $50,000 | quarterly |
| ORG (parent) | cloud | monetary | $100,000 | yearly |

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Actual shows $0 | No cost data for entity in period | Check hierarchy mapping in cost_data_standard_1_3 |
| Child sum > parent | Over-allocation | Warning displayed, not blocked. Adjust child amounts. |
| Budget not appearing | Wrong period filter | Check period_start/period_end match the filter |
| Token budget no actual | GenAI provider not tracking tokens | Verify provider pipeline writes token columns |
| Currency mismatch | Budget in USD, costs in EUR | Use org's default currency. Convert via i18n exchange rates. |
| Delete returns 500 | `_EmptyRowIterator` has no `num_dml_affected_rows` | Use `job` object, not `result` iterator for DML row count |
| Duplicate rejection for different budget_type | `_check_duplicate` missing `budget_type` | Include `budget_type` in duplicate check query |
| Update succeeds on deleted budget | Missing `is_active` check in `update_budget` | Guard with `if not existing.is_active: raise ValueError(...)` |
| N+1 BQ queries in summary | `_fetch_actual_costs()` called per-budget in loop | Single fetch for full date range, filter with Polars |
| UI always creates monetary | No `budget_type` selector in create dialog | Add `BudgetType` dropdown to create/edit form |

### Backend Bug Fixes (2026-02-13)

| Bug | Issue | Fix | File |
|-----|-------|-----|------|
| #1 | Hardcoded `_prod` dataset suffix | Use `settings.get_org_dataset_name()` | `budget_read/service.py` |
| #2 | Summary used global date range — no per-budget filtering | Filter costs by each budget's `period_start`/`period_end` | `budget_read/service.py` |
| #3 | Hardcoded hierarchy levels `["dept","project","team"]` | Use dynamic `hierarchy_level_code` from budget | `budget_crud/models.py` |
| #4 | TIMESTAMP vs DATE mismatch in `_check_duplicate` | Cast `period_start`/`period_end` to DATE | `budget_crud/service.py` |
| #5 | Decimal from Polars vs float serialization | Convert via `float()` before JSON response | `budget_read/service.py` |
| #6 | "total" category actual=$0 in category breakdown | Sum ALL category actuals for "total" (not look up "total" key) | `budget_read/service.py` |
| #7 | Parent entity actuals=$0 in allocation tree | Use `x_hierarchy_path.str.contains(entity_id)` for parent rollup | `budget_read/service.py` |
| #8 | GCP provider actual=$0 in provider breakdown | Add `PROVIDER_NAME_MAP` to normalize "Google Cloud"→"gcp" etc. | `budget_read/service.py` |
| #9 | Allocation tree same actual for cloud+total budgets | Key `actual_lookup` by `(entity_id, category, provider)` not just `entity_id` | `budget_read/service.py` |
| #10 | Summary ignores budget's `provider` field | Filter costs by provider when budget has one (via `PROVIDER_NAME_MAP` reverse lookup) | `budget_read/service.py` |
| #11 | Provider breakdown uses global provider totals | Compute per-budget actual scoped to entity + category + provider | `budget_read/service.py` |

### PROVIDER_NAME_MAP (Critical)

FOCUS `ServiceProviderName` values differ from budget `provider` short names:

| FOCUS Name | Budget Provider |
|-----------|----------------|
| `Google Cloud` | `gcp` |
| `Amazon Web Services` / `AWS` | `aws` |
| `Microsoft Azure` | `azure` |
| `Oracle` / `OCI` | `oci` |
| `Google AI` | `gemini` |
| `OpenAI` | `openai` |
| `Anthropic` | `anthropic` |

Defined in `budget_read/service.py:PROVIDER_NAME_MAP`. Used for both forward (FOCUS→budget) and reverse (budget→FOCUS) lookups.

### Chat Tool Bug Fixes (2026-02-13)

| Bug | Issue | Fix |
|-----|-------|-----|
| C1 | `budget_variance` never JOINed actual costs — returned budget amounts only | Added LEFT JOIN to `cost_data_standard_1_3` with actual_spend, variance, utilization_pct, status |
| C2 | `budget_summary` same — no actual cost comparison | Added CTE with actual_costs, computes total_actual, variance, utilization_pct |
| C3 | `list_budgets` `is_active=False` skipped filter (showed ALL) | Changed to `Optional[bool]`, use `is True`/`is False` identity checks |
| H1 | `budget_variance` LIMIT was f-string injection risk | Parameterized via `@limit` query parameter |

## Testing

```bash
# Create single budget
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"hierarchy_entity_id":"DEPT-ENG","hierarchy_entity_name":"Engineering","hierarchy_level_code":"department","category":"cloud","budget_type":"monetary","budget_amount":20000,"currency":"USD","period_type":"monthly","period_start":"2026-02-01","period_end":"2026-02-28"}'
# Expected: 201 Created, { "budget_id": "...", ... }

# Top-down allocation
curl -s -X POST "http://localhost:8000/api/v1/budgets/$ORG/allocate" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id":"ORG","hierarchy_entity_name":"Acme Inc","hierarchy_level_code":"organization",
    "category":"cloud","budget_type":"monetary","budget_amount":100000,"currency":"USD",
    "period_type":"yearly","period_start":"2026-01-01","period_end":"2026-12-31",
    "allocations":[
      {"hierarchy_entity_id":"DEPT-ENG","hierarchy_entity_name":"Engineering","hierarchy_level_code":"department","percentage":40},
      {"hierarchy_entity_id":"DEPT-OPS","hierarchy_entity_name":"Operations","hierarchy_level_code":"department","percentage":30}
    ]
  }'
# Expected: 201, { parent_budget: {...}, children: [{budget, allocation_id, allocated_amount: 40000}, ...], unallocated_amount: 30000 }

# List budgets
curl -s "http://localhost:8000/api/v1/budgets/$ORG" -H "X-API-Key: $KEY"
# Expected: 200, { "budgets": [...], "total": N }

# Get summary
curl -s "http://localhost:8000/api/v1/budgets/$ORG/summary?period_type=monthly&period_start=2026-02-01" \
  -H "X-API-Key: $KEY"
# Expected: 200, budgets with actual_amount calculated from cost_data_standard_1_3

# Delete budget
curl -s -X DELETE "http://localhost:8000/api/v1/budgets/$ORG/$BUDGET_ID" -H "X-API-Key: $KEY"
# Expected: 204 No Content
```

## Shared Filters Integration

The budget page uses the shared `useAdvancedFilters()` hook and `AdvancedFilterBar` component:

```typescript
const { filters, updateFilters, clearFilters, activeCount, serverParams, clientParams, serverFilterKey } = useAdvancedFilters({
  search: true, category: true, periodType: true, status: true, hierarchyEntity: true
})
```

| Filter | Type | Maps to | Dispatches to |
|--------|------|---------|---------------|
| category | Server | `org_budgets.category` | `?category=cloud` |
| hierarchyEntityId | Server | `org_budgets.hierarchy_entity_id` | `?hierarchy_entity_id=DEPT-ENG` |
| periodType | Server | `org_budgets.period_type` | `?period_type=monthly` |
| provider | Server | `org_budgets.provider` | `?provider=gcp` |
| search | Client | `org_budgets.hierarchy_entity_name` | `matchesSearch()` |
| status | Client | Computed: actual > budget_amount | `matchesBudgetStatus()` |

See `/advanced-filters` skill for full filter architecture.

## Demo Data (12 Budgets = 8 individual + 4 from allocation)

Created by `setupDemoBudgets()` in `load-demo-data-direct.ts` (Step 10.5):

### Individual Budgets (8)

| Entity | Category | Type | Amount | Provider | Period |
|--------|----------|------|--------|----------|--------|
| DEPT-ENG | cloud | monetary | $30,000 | - | Q1 2026 |
| DEPT-DS | genai | monetary | $25,000 | - | Q1 2026 |
| PROJ-PLATFORM | cloud | monetary | $20,000 | gcp | Q1 2026 |
| PROJ-MLPIPE | genai | monetary | $20,000 | anthropic | Q1 2026 |
| TEAM-BACKEND | cloud | monetary | $12,000 | gcp | Q1 2026 |
| TEAM-FRONTEND | subscription | monetary | $3,000 | - | Q1 2026 |
| TEAM-MLOPS | genai | token | 50,000,000 | anthropic | Q1 2026 |
| DEPT-ENG | total | monetary | $50,000 | - | Q1 2026 |

### Top-Down Allocation (1 parent + 3 children = 4 budgets + 3 allocation records)

| Entity | Category | Type | Amount | Allocation | Period |
|--------|----------|------|--------|------------|--------|
| ORG (parent) | cloud | monetary | $100,000 | - | 2026 yearly |
| DEPT-ENG (child) | cloud | monetary | $45,000 | 45% | 2026 yearly |
| DEPT-DS (child) | cloud | monetary | $30,000 | 30% | 2026 yearly |
| DEPT-OPS (child) | cloud | monetary | $15,000 | 15% | 2026 yearly |
| (unallocated margin) | - | - | $10,000 | 10% | - |

**Provider matching:** Providers must match actual FOCUS `ServiceProviderName` values (normalized via `PROVIDER_NAME_MAP`). Demo data uses `gcp`/`anthropic` because actual costs come from Google Cloud and Anthropic respectively.

### Verify Demo Budgets

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG" -H "X-API-Key: $KEY" | jq '.total'
# Expected: 12

curl -s "http://localhost:8000/api/v1/budgets/$ORG?category=cloud" -H "X-API-Key: $KEY" | jq '.total'
# Expected: 7 (3 individual + 1 parent + 3 children)

curl -s "http://localhost:8000/api/v1/budgets/$ORG/allocation-tree" -H "X-API-Key: $KEY" | jq '.roots | length'
# Expected: >= 1 (ORG root with 3 children)

curl -s "http://localhost:8000/api/v1/budgets/$ORG/summary" -H "X-API-Key: $KEY" | jq '.totals'
# Expected: { budget_total, actual_total, variance, budgets_over, budgets_under }
```

## 5 Implementation Pillars

| Pillar | How Budget Planning Handles It |
|--------|-------------------------------|
| **i18n** | Budget amounts stored in org's `default_currency`, `formatCost()` for all display, period boundaries respect org timezone for month/quarter/year resets |
| **Enterprise** | Hierarchy-based allocation (Dept->Project->Team), variance tracking with status thresholds, forecasting via run-rate projection, `plan_change_audit` history |
| **Cross-Service** | Frontend budgets page (3000) → API (8000) CRUD + read endpoints → BigQuery `org_budgets`; alerts system (`admin.py`) evaluates `budget_percent` rules against budget data |
| **Multi-Tenancy** | `org_slug` in all budget queries, `org_budgets` + `org_budget_allocations` in `organizations` dataset, parameterized `@org_slug` in all BQ reads |
| **Reusability** | Shared hierarchy tree for entity selection, budget categories (`cloud`/`genai`/`subscription`/`total`) reused across CRUD+read+chat, `formatCost()` from shared `lib/costs` |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/hierarchy` | Budget hierarchy entities come from hierarchy system |
| `/cost-analysis` | Actual spend data from cost_data_standard_1_3 |
| `/cost-analytics` | Frontend cost data context feeds budget variance calculations |
| `/i18n-locale` | Multi-currency support for budget amounts |
| `/notifications` | Budget threshold alerts (budget_percent, budget_forecast, hierarchy_budget rule types) |
| `/quota-mgmt` | Similar pattern (limits + tracking) but for pipeline usage, not spend |
| `/bigquery-ops` | Bootstrap schema for org_budgets + org_budget_allocations |
| `/console-ui` | UI component patterns for budget pages |
| `/charts` | Budget vs actual charts (bar, ring, trend) |
| `/advanced-filters` | Shared filter hook and component used on budget page |
| `/chat` | BudgetManager sub-agent with 4 read-only tools |
| `/demo-setup` | Demo data includes 8 individual budgets + 1 allocation (12 total) |

## Source Specifications

- `BUDGET_PLANNING.md` (v1.0, 2026-02-12)
- `02-api-service/configs/setup/bootstrap/schemas/org_budgets.json` (20 fields)
- `02-api-service/configs/setup/bootstrap/schemas/org_budget_allocations.json` (8 fields)
- Industry reference: GCP Budget API, AWS Budgets, OpenAI Usage Tiers, Figma Billing Groups
