# SaaS Subscription Costs

**Status**: IMPLEMENTED (v12.4) | **Updated**: 2025-12-18 | **Single Source of Truth**

> Track fixed-cost SaaS subscriptions (Canva, ChatGPT Plus, Slack, etc.)
> NOT CloudAct platform billing (that's Stripe)
> NOT LLM API tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - separate flow)

---

## Quick Reference

| Service | Port | Role | Key Files |
|---------|------|------|-----------|
| **Frontend** | 3000 | UI + Server Actions | `actions/subscription-providers.ts` |
| **API Service** | 8000 | CRUD + Validation | `src/app/routers/subscription_plans.py` |
| **Pipeline Service** | 8001 | Cost Calculation | `configs/saas_subscription/costs/saas_cost.yml` |

---

## DO's and DON'Ts

### DO's (CRITICAL)

| Practice | Reason | Implementation |
|----------|--------|----------------|
| **Lock currency to org default** | Consistent reporting, no currency mixing | Currency field disabled in UI forms |
| **Use version history for edits** | Audit trail, historical cost preservation | `edit-version` endpoint creates new row |
| **Validate provider names** | Prevent injection, ensure consistency | `sanitizeProviderName()` function |
| **Check duplicate plans before create** | Prevent accidental duplicates | API returns 409 on duplicate `active` plan |
| **Soft delete with `end_date`** | Preserve historical data for reporting | Never hard delete subscription plans |
| **Include audit trail fields** | Regulatory compliance (SOX, GDPR) | `source_currency`, `source_price`, `exchange_rate_used` |
| **Trigger cost pipeline after changes** | Keep dashboard data up-to-date | `triggerCostBackfill()` called after CRUD |
| **Use UTC for all date operations** | Consistent date handling across timezones | `getMonthStartUTC()`, `getTodayDateUTC()` |

### DON'Ts (CRITICAL)

| Anti-Pattern | Risk | Correct Approach |
|--------------|------|------------------|
| **Never hard delete plans** | Loses historical data, breaks cost reports | Set `end_date` + `status='cancelled'` |
| **Never update plan price in place** | Corrupts historical cost calculations | Use `edit-version` endpoint |
| **Never allow currency mismatch** | Breaks aggregations, confuses users | Enforce org default at 3 layers |
| **Never skip input validation** | XSS, injection, data corruption | Validate at UI, action, and API layers |
| **Never call pipeline service directly** | Bypasses auth, violates architecture | Route through API service (8000) |
| **Never store credentials in plans table** | Security violation | Use `org_integration_credentials` with KMS |
| **Never guess subscription IDs** | UUID format required | Use `isValidSubscriptionId()` helper |

---

## Architecture Overview

### Data Storage Split

```
SUPABASE (Metadata Only)                    BigQuery (All Plan Data)
┌─────────────────────────────┐            ┌─────────────────────────────────────┐
│ saas_subscription_providers_meta          │ {org_slug}_{env}.saas_subscription_plans
│ ├── org_id: UUID            │            │ ├── 28 columns (full plan data)      │
│ ├── provider_name: VARCHAR  │            │ ├── Multi-currency audit fields      │
│ ├── is_enabled: BOOLEAN     │            │ └── Version history support          │
│ └── enabled_at: TIMESTAMPTZ │            │                                       │
│                             │            │ {org_slug}_{env}.saas_subscription_plan_costs_daily
│ Purpose: Provider ON/OFF    │            │ └── Daily amortized costs (18 cols)  │
│ NO plan data stored here    │            │                                       │
└─────────────────────────────┘            │ {org_slug}_{env}.cost_data_standard_1_3
                                           │ └── FOCUS 1.3 standard (78 cols)     │
                                           └─────────────────────────────────────┘
```

### Service Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Port 3000)                               │
│                                                                              │
│  Server Actions: actions/subscription-providers.ts                          │
│  ├── enableProvider() → Supabase meta + NO auto-seed                        │
│  ├── disableProvider() → Delete all plans from BigQuery + meta update       │
│  ├── getProviderPlans() → Fetch from API service                            │
│  ├── createCustomPlan() → POST to API + trigger cost pipeline               │
│  ├── editPlanWithVersion() → POST edit-version + trigger pipeline           │
│  ├── endSubscription() → DELETE (soft) + trigger pipeline                   │
│  └── triggerCostBackfill() → POST to API service pipeline trigger           │
│                                                                              │
│  Pages: app/[orgSlug]/integrations/subscriptions/                           │
│  ├── page.tsx → Provider list with enable/disable                           │
│  ├── [provider]/page.tsx → Plan list + CRUD                                 │
│  ├── [provider]/add/page.tsx → Template selection                           │
│  ├── [provider]/add/custom/page.tsx → Custom plan form                      │
│  ├── [provider]/[subscriptionId]/edit/page.tsx → Edit form                  │
│  └── [provider]/[subscriptionId]/end/page.tsx → End subscription            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API SERVICE (Port 8000)                               │
│                                                                              │
│  Router: src/app/routers/subscription_plans.py                              │
│  Endpoints: /api/v1/subscriptions/{org}/providers/...                       │
│                                                                              │
│  Features:                                                                   │
│  ├── CRUD operations with BigQuery                                          │
│  ├── Version history via edit-version endpoint                              │
│  ├── Duplicate detection (409 on existing active plan)                      │
│  ├── Currency enforcement (must match org default)                          │
│  ├── Audit logging to org_audit_logs table                                  │
│  ├── Input validation (status, billing_cycle, pricing_model)                │
│  └── Cache management with TTL                                              │
│                                                                              │
│  Schema: configs/setup/organizations/onboarding/schemas/                    │
│  └── saas_subscription_plans.json (28 columns)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PIPELINE SERVICE (Port 8001)                            │
│                                                                              │
│  Config: configs/saas_subscription/costs/saas_cost.yml                      │
│  Processor: generic.procedure_executor                                       │
│                                                                              │
│  Stored Procedures (in organizations dataset):                              │
│  ├── sp_calculate_saas_subscription_plan_costs_daily                        │
│  │   └── Calculates daily amortized costs from plans                        │
│  ├── sp_convert_saas_costs_to_focus_1_3                                     │
│  │   └── Maps to FinOps FOCUS 1.3 standard                                  │
│  └── sp_run_saas_subscription_costs_pipeline                                │
│      └── Orchestrator: runs both procedures in sequence                     │
│                                                                              │
│  Output Tables:                                                              │
│  ├── saas_subscription_plan_costs_daily → Daily amortized costs             │
│  └── cost_data_standard_1_3 → FOCUS 1.3 unified cost view                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Currency Support

### Currency Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SEED CSV (Source of Truth)                            │
│  File: 02-api-service/configs/saas/seed/data/saas_subscription_plans.csv    │
│                                                                              │
│  unit_price | yearly_price | currency = "USD"                                │
│  (Always USD - single source, no multi-currency columns)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TEMPLATE SELECTION PAGE                                  │
│  Route: /{orgSlug}/integrations/subscriptions/{provider}/add                │
│                                                                              │
│  1. Fetch org's default currency from org_profiles                          │
│  2. Load exchange rates from lib/i18n/index.ts                              │
│  3. Convert: convertFromUSD(unit_price, orgCurrency)                        │
│  4. Display: formatCurrency(convertedPrice, orgCurrency)                    │
│                                                                              │
│  Example: Canva PRO $15 USD → ₹1,246.80 INR (for Indian org)                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CUSTOM PLAN FORM                                         │
│  Route: /{orgSlug}/integrations/subscriptions/{provider}/add/custom         │
│                                                                              │
│  - Currency field: LOCKED to org's default currency (disabled/read-only)    │
│  - Price pre-filled with converted value from template                      │
│  - User can adjust price but NOT currency                                   │
│  - Audit fields captured: source_currency, source_price, exchange_rate_used │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BigQuery Storage                                         │
│  Table: {org_slug}_{env}.saas_subscription_plans                            │
│                                                                              │
│  Stored Fields:                                                              │
│  - currency: "INR" (org's default - what user sees and pays in)             │
│  - unit_price: 1246.80 (in org's currency, NOT USD)                         │
│  - source_currency: "USD" (original template currency for audit)            │
│  - source_price: 15.00 (original USD price for audit)                       │
│  - exchange_rate_used: 83.12 (rate at time of creation)                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Exchange Rate Functions

**File:** `01-fronted-system/lib/i18n/index.ts`

| Function | Purpose | Example |
|----------|---------|---------|
| `convertCurrency(amount, from, to)` | Convert between any currencies | `convertCurrency(100, "USD", "INR")` → 8312 |
| `convertFromUSD(amount, to)` | Convert USD to target | `convertFromUSD(15, "INR")` → 1246.80 |
| `convertToUSD(amount, from)` | Convert to USD | `convertToUSD(1246.80, "INR")` → 15 |
| `convertWithAudit(amount, from, to)` | Convert with full audit trail | Returns object with all conversion metadata |
| `getExchangeRate(currency)` | Get rate vs USD | `getExchangeRate("INR")` → 83.12 |

### Supported Currencies (16)

**Major Currencies (10):** USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD

**Arab Countries (6):** AED, SAR, QAR, KWD, BHD, OMR

---

## Complete User Flows

### Flow 1: Enable Provider (No Auto-Seed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER: Clicks toggle to enable "ChatGPT Plus" provider                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND: enableProvider(orgSlug, "chatgpt_plus")                          │
│  File: actions/subscription-providers.ts                                    │
│                                                                              │
│  1. Validate provider name: sanitizeProviderName()                          │
│  2. Check reserved names (system, admin, api, internal, test, default)      │
│  3. Insert to Supabase: saas_subscription_providers_meta                     │
│  4. NO API call to seed plans (v12.1 change)                                │
│  5. Return: { success: true, provider: "chatgpt_plus" }                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  RESULT: Provider enabled in metadata, BigQuery table is EMPTY              │
│  UI shows: "Add from Template" and "Add Custom Subscription" buttons        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 2: Add Subscription from Template

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER: Clicks "Add from Template" → Selects "TEAM" plan → Clicks "Add"      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND: Template Selection Page                                          │
│  Route: /{orgSlug}/integrations/subscriptions/{provider}/add                │
│                                                                              │
│  1. Fetch templates: GET /subscriptions/{org}/providers/{p}/available-plans │
│  2. Fetch org currency from locale settings                                 │
│  3. Convert prices: convertFromUSD(template.unit_price, orgCurrency)        │
│  4. Display converted prices with currency symbol                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND: createCustomPlan(orgSlug, provider, planData)                    │
│  File: actions/subscription-providers.ts:450-550                            │
│                                                                              │
│  1. Validate plan data: validatePlanData()                                  │
│     - Check plan_name length (max 50)                                       │
│     - Check unit_price >= 0                                                 │
│     - Check seats >= 0                                                      │
│     - Validate billing_cycle: monthly, annual, quarterly                    │
│     - Validate pricing_model: PER_SEAT, FLAT_FEE                            │
│     - Validate status: active, cancelled, expired, pending                  │
│  2. Get org API key from user metadata                                      │
│  3. POST to API service: /subscriptions/{org}/providers/{p}/plans           │
│  4. If start_date is in past: trigger cost backfill pipeline                │
│  5. Return result                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  API SERVICE: POST /subscriptions/{org}/providers/{provider}/plans          │
│  File: src/app/routers/subscription_plans.py:800-950                        │
│                                                                              │
│  1. Validate org API key (get_current_org dependency)                       │
│  2. Duplicate check: Query existing active plan with same plan_name         │
│     - If exists: Return 409 Conflict                                        │
│  3. Currency enforcement: Verify currency == org.default_currency           │
│     - If mismatch: Return 400 Bad Request                                   │
│  4. Generate subscription_id (UUID)                                         │
│  5. Set status to "active" (or "pending" if start_date > today)             │
│  6. INSERT to BigQuery: saas_subscription_plans                             │
│  7. Log to org_audit_logs: action=CREATE, resource_type=SUBSCRIPTION_PLAN   │
│  8. Invalidate cache: invalidate_provider_cache(org_slug, provider)         │
│  9. Return created plan                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND: Trigger cost pipeline if start_date is in past                   │
│  File: actions/subscription-providers.ts:115-175                            │
│                                                                              │
│  triggerCostBackfill(orgSlug, orgApiKey, startDate, endDate)                │
│  1. POST to: /api/v1/pipelines/trigger/{org}/saas_subscription/costs/saas_cost
│  2. Body: { start_date: startDate, end_date: today }                        │
│  3. Timeout: 60 seconds (pipeline can be slow for large date ranges)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 3: Edit Subscription (Version History)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER: Changes seats from 10 to 15, effective March 1                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND: editPlanWithVersion(orgSlug, provider, subscriptionId, ...)      │
│  File: actions/subscription-providers.ts:600-700                            │
│                                                                              │
│  1. Validate subscription ID format: isValidSubscriptionId()                │
│  2. Get org API key                                                         │
│  3. POST to: /subscriptions/{org}/providers/{p}/plans/{id}/edit-version     │
│  4. Body: { seats: 15, effective_date: "2025-03-01" }                       │
│  5. Trigger cost backfill from month start to today                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  API SERVICE: POST /subscriptions/.../plans/{id}/edit-version               │
│  File: src/app/routers/subscription_plans.py:1100-1300                      │
│                                                                              │
│  VERSION HISTORY PATTERN:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ BEFORE:                                                              │    │
│  │ ┌───────────────────────────────────────────────────────────────┐   │    │
│  │ │ subscription_id: "sub_123"                                     │   │    │
│  │ │ seats: 10                                                      │   │    │
│  │ │ start_date: 2025-01-01                                         │   │    │
│  │ │ end_date: NULL                                                 │   │    │
│  │ │ status: "active"                                               │   │    │
│  │ └───────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │ AFTER (2 rows):                                                      │    │
│  │ ┌───────────────────────────────────────────────────────────────┐   │    │
│  │ │ subscription_id: "sub_123" (OLD)                               │   │    │
│  │ │ seats: 10                                                      │   │    │
│  │ │ start_date: 2025-01-01                                         │   │    │
│  │ │ end_date: 2025-02-28 (day before effective_date)               │   │    │
│  │ │ status: "expired"                                              │   │    │
│  │ └───────────────────────────────────────────────────────────────┘   │    │
│  │ ┌───────────────────────────────────────────────────────────────┐   │    │
│  │ │ subscription_id: "sub_456" (NEW UUID)                          │   │    │
│  │ │ seats: 15 (updated)                                            │   │    │
│  │ │ start_date: 2025-03-01 (effective_date)                        │   │    │
│  │ │ end_date: NULL                                                 │   │    │
│  │ │ status: "active"                                               │   │    │
│  │ └───────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Audit log entry includes: old_values, new_values, changed_fields           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 4: End Subscription (Soft Delete)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER: Clicks "End Subscription" → Selects end date → Confirms              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND: endSubscription(orgSlug, provider, subscriptionId, endDate)      │
│  File: actions/subscription-providers.ts:750-850                            │
│                                                                              │
│  1. Validate subscription ID                                                │
│  2. DELETE to: /subscriptions/{org}/providers/{p}/plans/{id}                │
│  3. Body: { end_date: "2025-12-31" }                                        │
│  4. Trigger cost backfill to recalculate without ended plan                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  API SERVICE: DELETE /subscriptions/.../plans/{id}                          │
│  File: src/app/routers/subscription_plans.py:1400-1500                      │
│                                                                              │
│  SOFT DELETE (NOT hard delete):                                             │
│  1. UPDATE set end_date = request.end_date                                  │
│  2. UPDATE set status = 'cancelled'                                         │
│  3. Log to org_audit_logs: action=DELETE                                    │
│  4. Plan remains in BigQuery for historical reporting                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 5: Disable Provider (Delete All Plans)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER: Toggles provider OFF                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND: disableProvider(orgSlug, provider)                               │
│  File: actions/subscription-providers.ts:350-420                            │
│                                                                              │
│  1. Fetch all plans for provider from API                                   │
│  2. Loop through each plan:                                                 │
│     DELETE /subscriptions/{org}/providers/{p}/plans/{id}                    │
│  3. Update Supabase meta: is_enabled = false                                │
│  4. Return: { success: true, plans_deleted: 3 }                             │
│                                                                              │
│  IMPORTANT: Data is PERMANENTLY removed from BigQuery                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Cost Calculation

### Pipeline Configuration

**File:** `03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml`

```yaml
pipeline_id: "{org_slug}-saas-subscription-costs"
name: "SaaS Subscription Costs Pipeline"
schedule:
  type: daily
  time: "03:00"
  timezone: UTC

steps:
  - step_id: "run_cost_pipeline"
    ps_type: "generic.procedure_executor"
    config:
      procedure:
        name: sp_run_saas_subscription_costs_pipeline
        dataset: organizations
      parameters:
        - name: p_project_id
          type: STRING
          value: "${project_id}"
        - name: p_dataset_id
          type: STRING
          value: "${org_dataset}"
        - name: p_start_date
          type: DATE
          value: "${start_date}"
          default: "MONTH_START"
        - name: p_end_date
          type: DATE
          value: "${end_date}"
          default: "TODAY"
```

### Proration Logic

**File:** `configs/system/procedures/saas_subscription/sp_calculate_saas_subscription_plan_costs_daily.sql`

| Billing Cycle | Daily Rate Calculation |
|---------------|------------------------|
| **Monthly** | `cycle_cost / days_in_month` (28-31 days) |
| **Annual** | `cycle_cost / 365` (or 366 for leap years) |
| **Quarterly** | `cycle_cost / 91.25` (average days per quarter) |
| **Weekly** | `cycle_cost / 7` |

### Pricing Model Application

```sql
-- Pricing model logic
CASE pricing_model
  WHEN 'PER_SEAT' THEN unit_price * seats
  WHEN 'FLAT_FEE' THEN unit_price
  ELSE unit_price
END AS cycle_cost

-- Discount application
CASE discount_type
  WHEN 'percent' THEN cycle_cost * (1 - discount_value / 100)
  WHEN 'fixed' THEN cycle_cost - discount_value
  ELSE cycle_cost
END AS final_cost
```

### Auto-Trigger After CRUD Operations

All subscription changes automatically trigger the cost pipeline:

| Action | Pipeline Date Range | Reason |
|--------|---------------------|--------|
| **Create Plan** | `start_date` → today | Calculate costs from plan start |
| **Edit Plan** | Month start → today | Recalculate current month |
| **End Subscription** | Month start → today | Exclude ended plan from costs |

**Implementation:** `actions/subscription-providers.ts:triggerCostBackfill()`

---

## Input Validation

### Frontend Validation

**File:** `actions/subscription-providers.ts:218-250`

```typescript
// Valid enum values
const VALID_BILLING_CYCLES = new Set(["monthly", "annual", "quarterly"])
const VALID_PRICING_MODELS = new Set(["PER_SEAT", "FLAT_FEE"])
const VALID_DISCOUNT_TYPES = new Set(["percent", "fixed"])
const VALID_STATUS_VALUES = new Set(["active", "cancelled", "expired", "pending"])

function validatePlanData(plan: PlanCreate | PlanUpdate): { valid: boolean; error?: string } {
  // Plan name length
  if (plan.plan_name && plan.plan_name.length > 50) {
    return { valid: false, error: "Plan name too long. Maximum 50 characters." }
  }
  // Negative prices
  if (plan.unit_price !== undefined && plan.unit_price < 0) {
    return { valid: false, error: "Unit price cannot be negative" }
  }
  // Enum validation
  if (plan.billing_cycle && !VALID_BILLING_CYCLES.has(plan.billing_cycle)) {
    return { valid: false, error: `Invalid billing_cycle: ${plan.billing_cycle}` }
  }
  // ... more validations
}
```

### Provider Name Sanitization

**File:** `actions/subscription-providers.ts:60-68`

```typescript
const sanitizeProviderName = (provider: string): string => {
  return provider
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")  // Replace invalid chars
    .replace(/^_+|_+$/g, "")       // Remove leading/trailing underscores
    .replace(/_+/g, "_")           // Collapse multiple underscores
    .slice(0, 50)                  // Limit length
}

// Reserved names that cannot be used
const RESERVED_PROVIDER_NAMES = ["system", "admin", "api", "internal", "test", "default"]
```

### API Service Validation

**File:** `src/app/routers/subscription_plans.py:150-200`

```python
# Constants for validation
VALID_STATUS_VALUES = {"active", "pending", "cancelled", "expired"}
VALID_BILLING_CYCLES = {"monthly", "annual", "quarterly", "weekly"}
VALID_PRICING_MODELS = {"PER_SEAT", "FLAT_FEE", "TIERED"}

# Duplicate detection (returns 409)
existing = query("""
    SELECT subscription_id FROM saas_subscription_plans
    WHERE org_slug = @org AND provider = @provider
    AND plan_name = @plan_name AND status = 'active'
""")
if existing:
    raise HTTPException(status_code=409, detail="Active plan already exists")

# Currency enforcement (returns 400)
org_currency = get_org_currency(org_slug)
if request.currency != org_currency:
    raise HTTPException(status_code=400, detail=f"Currency must match org default: {org_currency}")
```

---

## Audit Logging

### Audit Trail for Compliance

All plan operations are logged to `organizations.org_audit_logs`:

**File:** `src/core/utils/audit_logger.py`

| Operation | Action | Details Logged |
|-----------|--------|----------------|
| **Create** | `CREATE` | plan_name, provider, unit_price, currency, seats, pricing_model, billing_cycle, start_date |
| **Update** | `UPDATE` | changed_fields, new_values (only changed fields) |
| **Edit-Version** | `UPDATE` | old_subscription_id, new_subscription_id, effective_date, old_values, new_values, changed_fields |
| **Delete** | `DELETE` | end_date, final_status (cancelled) |

### Query Audit Logs

```sql
-- Get all subscription plan audit logs for an organization
SELECT
  audit_id,
  action,
  resource_id,
  PARSE_JSON(details) as details,
  created_at
FROM organizations.org_audit_logs
WHERE resource_type = 'SUBSCRIPTION_PLAN'
  AND org_slug = 'your_org'
ORDER BY created_at DESC
LIMIT 100
```

---

## Schema Reference

### saas_subscription_plans (28 columns)

**File:** `02-api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plans.json`

| Column | Type | Description |
|--------|------|-------------|
| `org_slug` | STRING | Organization identifier |
| `subscription_id` | STRING | UUID, unique per version |
| `provider` | STRING | Provider key (chatgpt_plus, canva, etc.) |
| `plan_name` | STRING | Plan tier (FREE, PRO, TEAM, ENTERPRISE) |
| `display_name` | STRING | Human-readable name |
| `category` | STRING | ai, design, productivity, communication, development |
| `status` | STRING | active, pending, cancelled, expired |
| `start_date` | DATE | Subscription start date |
| `end_date` | DATE | Subscription end date (NULL for active) |
| `billing_cycle` | STRING | monthly, yearly, quarterly, weekly |
| `currency` | STRING | ISO 4217 currency code (must match org default) |
| `seats` | INT64 | Number of seats/licenses |
| `pricing_model` | STRING | PER_SEAT, FLAT_FEE, TIERED |
| `unit_price` | FLOAT64 | Price per unit (in org's currency) |
| `yearly_price` | FLOAT64 | Annual price (nullable) |
| `discount_type` | STRING | percentage, fixed, none |
| `discount_value` | FLOAT64 | Discount amount or percentage |
| `source_currency` | STRING | Original template currency (audit) |
| `source_price` | FLOAT64 | Original price before conversion (audit) |
| `exchange_rate_used` | FLOAT64 | Exchange rate at creation time (audit) |
| `auto_renew` | BOOLEAN | Auto-renewal enabled |
| `payment_method` | STRING | credit_card, invoice, etc. |
| `invoice_id_last` | STRING | Last invoice reference |
| `owner_email` | STRING | Subscription owner |
| `department` | STRING | Cost center |
| `renewal_date` | DATE | Next renewal date |
| `contract_id` | STRING | Contract reference |
| `notes` | STRING | Additional notes |
| `updated_at` | TIMESTAMP | Last update timestamp |

### saas_subscription_plan_costs_daily (18 columns)

**File:** `02-api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plan_costs_daily.json`

**Partition:** DAY on `cost_date` | **Cluster:** `org_slug`, `subscription_id`

| Column | Type | Description |
|--------|------|-------------|
| `org_slug` | STRING | Organization identifier |
| `provider` | STRING | Provider key |
| `subscription_id` | STRING | FK to saas_subscription_plans |
| `plan_name` | STRING | Plan tier |
| `display_name` | STRING | Human-readable name |
| `cost_date` | DATE | Partition key - cost applies to this day |
| `billing_cycle` | STRING | monthly, yearly, quarterly |
| `currency` | STRING | Currency code |
| `seats` | INT64 | Number of seats |
| `quantity` | NUMERIC | Usage quantity |
| `unit` | STRING | seat, user, license |
| `cycle_cost` | NUMERIC | Full billing cycle cost after discounts |
| `daily_cost` | NUMERIC | Amortized daily cost |
| `monthly_run_rate` | NUMERIC | Projected monthly cost |
| `annual_run_rate` | NUMERIC | Projected annual cost |
| `invoice_id_last` | STRING | Last invoice reference |
| `source` | STRING | subscription_proration |
| `updated_at` | TIMESTAMP | Last update |

---

## API Endpoints Summary

### API Service (Port 8000)

**Base:** `/api/v1/subscriptions/{org_slug}`

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/providers` | List all 28 providers with status | X-API-Key |
| GET | `/all-plans` | Get ALL plans for Costs Dashboard | X-API-Key |
| POST | `/providers/{provider}/enable` | Enable provider (no auto-seed) | X-API-Key |
| POST | `/providers/{provider}/disable` | Disable provider (deletes plans) | X-API-Key |
| GET | `/providers/{provider}/plans` | List plans for provider | X-API-Key |
| GET | `/providers/{provider}/available-plans` | Get template plans from CSV | X-API-Key |
| POST | `/providers/{provider}/plans` | Create plan | X-API-Key |
| PUT | `/providers/{provider}/plans/{id}` | Update plan (direct) | X-API-Key |
| POST | `/providers/{provider}/plans/{id}/edit-version` | Edit with version history | X-API-Key |
| DELETE | `/providers/{provider}/plans/{id}` | Soft delete plan | X-API-Key |
| POST | `/providers/{provider}/toggle/{id}` | Toggle plan status | X-API-Key |
| POST | `/providers/{provider}/reset` | Re-seed from CSV | X-API-Key |

### Pipeline Service (Port 8001)

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/pipelines/run/{org}/saas_subscription/costs/saas_cost` | Run cost pipeline | X-API-Key |
| POST | `/pipelines/trigger/{org}/saas_subscription/costs/saas_cost` | Trigger via API service | X-API-Key |

---

## Error Handling

### Common Error Responses

| Status | Error | Cause | Resolution |
|--------|-------|-------|------------|
| 400 | Currency mismatch | Plan currency != org default | Use org's default currency |
| 400 | Invalid billing_cycle | Not monthly/annual/quarterly | Check VALID_BILLING_CYCLES |
| 400 | Negative price | unit_price < 0 | Use non-negative value |
| 403 | Unauthorized | Invalid or missing API key | Check X-API-Key header |
| 404 | Plan not found | Invalid subscription_id | Verify UUID exists |
| 409 | Duplicate plan | Active plan with same name exists | Edit existing or use different name |
| 500 | Pipeline failed | BigQuery procedure error | Check procedure logs |

### Frontend Error Pattern

**File:** `actions/subscription-providers.ts`

```typescript
try {
  const result = await createCustomPlan(orgSlug, provider, planData)
  if (!result.success) {
    // API returned error
    setError(result.error || "Failed to create plan")
    return
  }
  // Success
  router.push(`/${orgSlug}/integrations/subscriptions/${provider}/success`)
} catch (error) {
  // Network or unexpected error
  const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
  setError(errorMessage)
} finally {
  setLoading(false)
}
```

---

## Testing

### Test Files

| File | Purpose |
|------|---------|
| `01-fronted-system/tests/saas-subscription-providers.test.ts` | Frontend server actions |
| `02-api-service/tests/test_05_saas_subscription_providers.py` | API endpoint tests |
| `02-api-service/tests/test_05b_saas_subscription_security.py` | Multi-tenant security tests |

### E2E Test Flow

```bash
# 1. Enable provider
curl -X POST "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/enable" \
  -H "X-API-Key: $ORG_API_KEY"

# 2. Create plan
curl -X POST "http://localhost:8000/api/v1/subscriptions/test_org/providers/chatgpt_plus/plans" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"plan_name": "TEAM", "unit_price": 25.00, "currency": "USD", "seats": 10}'

# 3. Run cost pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY"

# 4. Verify costs in BigQuery
bq query "SELECT * FROM test_org_prod.saas_subscription_plan_costs_daily LIMIT 10"
```

---

## File References

### Frontend Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/subscription-providers.ts` | ALL subscription server actions |
| `01-fronted-system/lib/i18n/index.ts` | Currency conversion, formatting |
| `01-fronted-system/lib/saas-providers.ts` | COMMON_SAAS_PROVIDERS array |
| `01-fronted-system/app/[orgSlug]/integrations/subscriptions/` | All subscription pages |

### API Service Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/subscription_plans.py` | Subscription plan CRUD endpoints |
| `02-api-service/configs/saas/seed/data/saas_subscription_plans.csv` | Template seed data (76 plans) |
| `02-api-service/configs/saas/schema/subscription_schema.py` | Pydantic models, enums |
| `02-api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plans.json` | BigQuery schema |
| `02-api-service/src/core/utils/audit_logger.py` | Audit logging utility |

### Pipeline Service Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml` | Pipeline configuration |
| `03-data-pipeline-service/configs/system/procedures/saas_subscription/` | Stored procedure SQL files |
| `03-data-pipeline-service/src/core/processors/generic/procedure_executor.py` | Procedure executor |

---

## CRITICAL Warnings

### Data Loss Risk

```
WARNING: disableProvider() PERMANENTLY DELETES all plans from BigQuery.
This is NOT a soft delete. Data cannot be recovered.

Use this only when the organization truly wants to stop tracking
all subscriptions for that provider.
```

### Currency Immutability

```
WARNING: Once an organization's default currency is set, changing it
does NOT retroactively convert existing subscription prices.

Existing plans will retain their original currency values.
New plans will use the new default currency.

For consistent reporting, plan currency changes carefully.
```

### Version History Immutability

```
WARNING: Historical plan versions (with end_date set) should NEVER be modified.
They preserve the pricing used for historical cost calculations.

Modifying expired versions will corrupt YTD and historical reports.
```

---

## Changelog

### v12.4 (2025-12-18)
- Updated document with actual implementation details
- Added complete user flows with file references
- Added DO's and DON'Ts section
- Added CRITICAL warnings section
- Consolidated validation rules from all services

### v12.3 (2025-12-17)
- Auto-trigger cost pipeline after CRUD operations
- Pipeline trigger routes through API service (not direct to 8001)

### v12.2 (2025-12-14)
- Multi-currency support with audit trail
- Template prices in USD, converted on display
- Currency locked to org default in forms
- Added source_currency, source_price, exchange_rate_used fields

### v12.1 (2025-12-12)
- Removed auto-seed on provider enable
- Added "Add from Template" and "Add Custom" buttons

### v12.0 (2025-12-08)
- Added `pending` status for plans
- Status validation in enable_provider
- Date type handling fixes
- 6 Costs API endpoints

---

**Version**: 12.4 | **Updated**: 2025-12-18 | **Policy**: Single source of truth - no duplicate docs
