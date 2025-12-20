# SaaS Subscription Costs

**Status**: IMPLEMENTED (v12.6) | **Updated**: 2025-12-18 | **Single Source of Truth**

> **v12.6 Changes**: Fiscal Year Support
> - Added `fiscal_year_start_month` to org_profiles (1=Jan, 4=Apr/India, 7=Jul/Australia)
> - Annual, quarterly, semi-annual now use fiscal year periods
> - Example: India org (Apr-Mar) gets FQ1=Apr-Jun, FQ2=Jul-Sep, FQ3=Oct-Dec, FQ4=Jan-Mar
>
> **v12.5 Changes**: Industry standards compliance (FinOps FOCUS 1.3, ASC 606)
> - Fixed quarterly calculation: Uses actual days per quarter (Q1:90-91, Q2:91, Q3:92, Q4:92)
> - Added semi-annual billing cycle support (6-month enterprise contracts)
> - Added `billing_anchor_day` field for non-calendar billing (ASC 606 compliant)

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

## Automatic Pipeline Triggering (Detailed)

### Decision Flow: When Pipeline is Called

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SUBSCRIPTION CRUD OPERATION                              │
│                                                                              │
│  createCustomPlan() | editPlanWithVersion() | endSubscription()             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CHECK: Is start_date in the past?                        │
│                                                                              │
│  File: actions/subscription-providers.ts:178                                │
│  const isDateInPast = isDateInPastUTC                                       │
│                                                                              │
│  Logic:                                                                      │
│  - Parse start_date as UTC date                                             │
│  - Compare to today's UTC date                                              │
│  - If start_date < today → is backdated = TRUE                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────────┐
        │  BACKDATED PLAN   │           │  FUTURE-DATED PLAN    │
        │  (start < today)  │           │  (start >= today)     │
        │                   │           │                       │
        │  Trigger Pipeline │           │  NO Pipeline Trigger  │
        │  Immediately      │           │  (wait for scheduler) │
        └─────────┬─────────┘           └───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DETERMINE DATE RANGE                                     │
│                                                                              │
│  CREATE:                                                                     │
│    startDate = plan.start_date                                              │
│    endDate = today                                                          │
│                                                                              │
│  EDIT (version):                                                            │
│    startDate = getMonthStartUTC() → first day of current month              │
│    endDate = today                                                          │
│                                                                              │
│  END (soft delete):                                                         │
│    startDate = getMonthStartUTC()                                           │
│    endDate = today                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CALL triggerCostBackfill()                              │
│                                                                              │
│  File: actions/subscription-providers.ts:115-175                            │
│                                                                              │
│  async function triggerCostBackfill(                                        │
│    orgSlug: string,                                                         │
│    orgApiKey: string,                                                       │
│    startDate: string,      // YYYY-MM-DD                                    │
│    endDate?: string        // YYYY-MM-DD, defaults to today                 │
│  )                                                                          │
│                                                                              │
│  Routes through API Service (8000), NOT directly to Pipeline Service (8001) │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     HTTP REQUEST                                            │
│                                                                              │
│  POST ${apiUrl}/api/v1/pipelines/trigger/${orgSlug}/saas_subscription/      │
│       costs/saas_cost                                                       │
│                                                                              │
│  Headers:                                                                    │
│    X-API-Key: {orgApiKey}                                                   │
│    Content-Type: application/json                                           │
│                                                                              │
│  Body:                                                                       │
│    { "start_date": "2025-01-15", "end_date": "2025-12-18" }                 │
│                                                                              │
│  Timeout: 60 seconds (large date ranges can be slow)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PIPELINE EXECUTION                                       │
│                                                                              │
│  API Service (8000) forwards to Pipeline Service (8001)                     │
│  → Executes stored procedures in BigQuery                                   │
│  → Returns pipeline_logging_id for tracking                                 │
│                                                                              │
│  Response:                                                                   │
│  {                                                                           │
│    "status": "success",                                                      │
│    "pipeline_logging_id": "plid-2025-12-18-abc123",                         │
│    "message": "Pipeline triggered successfully"                             │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Code Implementation: createCustomPlan with Auto-Trigger

```typescript
// File: actions/subscription-providers.ts (simplified)

export async function createCustomPlan(
  orgSlug: string,
  provider: string,
  plan: PlanCreate
): Promise<ActionResult> {
  // 1. Validate inputs
  const validation = validatePlanData(plan)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  // 2. Get org API key
  const orgApiKey = await getOrgApiKeySecure(orgSlug)
  if (!orgApiKey) {
    return { success: false, error: "Organization API key not found" }
  }

  // 3. Create plan via API service
  const response = await fetchWithTimeout(
    `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider}/plans`,
    { method: "POST", headers: {...}, body: JSON.stringify(plan) }
  )

  if (!response.ok) {
    return { success: false, error: await response.text() }
  }

  const createdPlan = await response.json()

  // 4. AUTO-TRIGGER: If start_date is backdated, trigger pipeline
  if (plan.start_date && isDateInPast(plan.start_date)) {
    console.log(`[AutoBackfill] Backdated plan detected: ${plan.start_date}`)

    const backfillResult = await triggerCostBackfill(
      orgSlug,
      orgApiKey,
      plan.start_date,  // From plan's start_date
      getTodayDateUTC() // To today
    )

    if (!backfillResult.success) {
      // Plan was created, but pipeline failed - warn user
      console.warn(`[AutoBackfill] Pipeline trigger failed: ${backfillResult.error}`)
      return {
        success: true,
        data: createdPlan,
        warning: `Plan created but cost pipeline failed: ${backfillResult.error}`
      }
    }
  }

  return { success: true, data: createdPlan }
}
```

### Trigger Scenarios Summary

| Scenario | start_date | Pipeline Triggered? | Date Range |
|----------|------------|---------------------|------------|
| New plan starting today | `2025-12-18` | NO | Wait for scheduler |
| New plan starting in future | `2026-01-01` | NO | Wait for scheduler |
| New plan backdated to Jan 1 | `2025-01-01` | YES | Jan 1 → today |
| Edit plan (any change) | N/A | YES | Month start → today |
| End subscription | N/A | YES | Month start → today |

---

## Manual Pipeline Execution (API Runbook)

### Step 1: Get Organization API Key

```bash
# DEV ONLY: Retrieve decrypted org API key
curl -s -X GET "http://localhost:8000/api/v1/admin/dev/api-key/{org_slug}" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq

# Response:
# {
#   "org_slug": "acme_corp",
#   "api_key": "org_acme_corp_api_xxxxxxxxxxxx",
#   "fingerprint": "...abc123"
# }

# Store for subsequent requests
export ORG_API_KEY="org_acme_corp_api_xxxxxxxxxxxx"
```

### Step 2: Run Pipeline via API Service (Recommended)

```bash
# Via API Service (Port 8000) - RECOMMENDED
# Routes through proper auth and logging

curl -s -X POST "http://localhost:8000/api/v1/pipelines/trigger/{org_slug}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2025-01-01",
    "end_date": "2025-12-18"
  }' | jq

# Response:
# {
#   "status": "success",
#   "pipeline_logging_id": "plid-2025-12-18-abc123",
#   "message": "Pipeline triggered successfully",
#   "date_range": {
#     "start": "2025-01-01",
#     "end": "2025-12-18"
#   }
# }
```

### Step 3 (Alternative): Run Pipeline Directly on Pipeline Service

```bash
# Direct to Pipeline Service (Port 8001)
# Use only for debugging or when API service is unavailable

curl -s -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2025-01-01",
    "end_date": "2025-12-18"
  }' | jq
```

### Common Manual Pipeline Scenarios

#### Scenario A: Full Year Backfill

```bash
# Backfill all costs for 2025
curl -s -X POST "http://localhost:8000/api/v1/pipelines/trigger/acme_corp/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2025-01-01", "end_date": "2025-12-31"}'
```

#### Scenario B: Current Month Recalculation

```bash
# Recalculate current month (December 2025)
curl -s -X POST "http://localhost:8000/api/v1/pipelines/trigger/acme_corp/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2025-12-01", "end_date": "2025-12-18"}'
```

#### Scenario C: Default Dates (Auto-Detect)

```bash
# Let pipeline auto-detect date range:
# - start_date: MIN(start_date) from active plans OR first of month
# - end_date: today

curl -s -X POST "http://localhost:8000/api/v1/pipelines/trigger/acme_corp/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Scenario D: Using Server Action (From Code)

```typescript
// Import the server action
import { runCostBackfill } from "@/actions/subscription-providers"

// Call with date range
const result = await runCostBackfill("acme_corp", "2025-01-01", "2025-12-18")

// Result:
// { success: true, message: "Cost backfill triggered from 2025-01-01 to 2025-12-18" }
// OR
// { success: false, error: "Organization API key not found" }
```

### Verify Pipeline Results in BigQuery

```bash
# Check daily costs table
bq query --use_legacy_sql=false \
  "SELECT cost_date, provider, plan_name, daily_cost, currency
   FROM \`your-project.acme_corp_prod.saas_subscription_plan_costs_daily\`
   WHERE cost_date >= '2025-12-01'
   ORDER BY cost_date DESC
   LIMIT 20"

# Check FOCUS 1.3 table
bq query --use_legacy_sql=false \
  "SELECT DATE(ChargePeriodStart) as day, ServiceProviderName, BilledCost, BillingCurrency
   FROM \`your-project.acme_corp_prod.cost_data_standard_1_3\`
   WHERE x_SourceSystem = 'saas_subscription_costs_daily'
     AND DATE(ChargePeriodStart) >= '2025-12-01'
   ORDER BY ChargePeriodStart DESC
   LIMIT 20"
```

---

## Stored Procedure Cost Standards

### Overview

Cost calculations are performed by **stored procedures** in BigQuery, NOT in Python/TypeScript code. This ensures:
- **Consistency**: Same calculation logic across all pipelines
- **Performance**: BigQuery-native execution, no data movement
- **Auditability**: SQL procedures are version-controlled and logged

### Procedure Location & Naming

```
Project: {gcp_project_id}
Dataset: organizations (CENTRAL - shared across all orgs)

Procedures:
├── sp_calculate_saas_subscription_plan_costs_daily   # Stage 1: Daily costs
├── sp_convert_saas_costs_to_focus_1_3                # Stage 2: FOCUS mapping
└── sp_run_saas_subscription_costs_pipeline           # Orchestrator
```

### Procedure Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SERVICE receives request                                           │
│  POST /pipelines/run/{org}/saas_subscription/costs/saas_cost                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROCESSOR: generic.procedure_executor                                       │
│  File: src/core/processors/generic/procedure_executor.py                    │
│                                                                              │
│  1. Load config from: configs/saas_subscription/costs/saas_cost.yml         │
│  2. Resolve parameters: ${project_id}, ${org_dataset}, ${start_date}...     │
│  3. Execute BigQuery procedure call                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BigQuery: CALL sp_run_saas_subscription_costs_pipeline(...)                │
│                                                                              │
│  Location: {project_id}.organizations                                        │
│  Operates on: {project_id}.{org_slug}_prod                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌─────────────────────────────┐     ┌─────────────────────────────┐
│  STAGE 1: Daily Costs       │     │  STAGE 2: FOCUS 1.3         │
│                             │     │                             │
│  sp_calculate_saas_sub...   │ ──▶ │  sp_convert_saas_costs_to   │
│  _plan_costs_daily          │     │  _focus_1_3                 │
│                             │     │                             │
│  OUTPUT:                    │     │  OUTPUT:                    │
│  saas_subscription_plan     │     │  cost_data_standard_1_3     │
│  _costs_daily               │     │  (FinOps FOCUS format)      │
└─────────────────────────────┘     └─────────────────────────────┘
```

### Procedure 1: sp_calculate_saas_subscription_plan_costs_daily

**File:** `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_calculate_saas_subscription_plan_costs_daily.sql`

**Purpose:** Calculate daily amortized costs for ALL subscriptions overlapping the date range.

**Input Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `p_project_id` | STRING | GCP Project ID |
| `p_dataset_id` | STRING | Customer dataset (e.g., `acme_corp_prod`) |
| `p_start_date` | DATE | Start date (inclusive) |
| `p_end_date` | DATE | End date (inclusive) |

**Cost Calculation Logic:**

```sql
-- 1. SELECT subscriptions overlapping date range
WHERE status IN ('active', 'expired', 'cancelled')
  AND (start_date <= @p_end OR start_date IS NULL)
  AND (end_date >= @p_start OR end_date IS NULL)

-- 2. Calculate cycle_cost based on pricing_model
CASE pricing_model
  WHEN 'FLAT_FEE' THEN base_price
  ELSE base_price * seats  -- PER_SEAT
END AS cycle_cost

-- 3. Apply discount
CASE discount_type
  WHEN 'percent' THEN cycle_cost * (1 - discount_value / 100)
  WHEN 'fixed' THEN cycle_cost - discount_value
  ELSE cycle_cost
END AS discounted_cost

-- 4. Calculate daily rate based on billing_cycle (INDUSTRY STANDARD COMPLIANT)
CASE billing_cycle
  WHEN 'monthly' THEN
    CASE billing_anchor_day
      WHEN 1 THEN cycle_cost / days_in_month        -- Calendar-aligned
      ELSE cycle_cost / days_in_billing_period      -- ASC 606: Anniversary billing
    END
  WHEN 'annual' THEN cycle_cost / 365               -- or 366 for leap year (400/100/4 rule)
  WHEN 'quarterly' THEN cycle_cost / days_in_quarter -- Q1:90-91, Q2:91, Q3:92, Q4:92
  WHEN 'semi-annual' THEN cycle_cost / days_in_half  -- H1:181-182, H2:184
  WHEN 'weekly' THEN cycle_cost / 7
  ELSE cycle_cost / 30  -- fallback
END AS daily_cost
```

**Industry Standards Compliance:**

| Standard | Requirement | Implementation |
|----------|-------------|----------------|
| **FinOps FOCUS 1.3** | Amortization of upfront fees | Spread cycle_cost evenly across billing period days |
| **ASC 606 / IFRS 15** | Revenue recognition over service period | Uses `billing_anchor_day` for non-calendar billing |
| **GAAP / Statutory** | Fiscal year aligned calculations | Uses `fiscal_year_start_month` from org_profiles |
| **Leap Year Handling** | Proper 400/100/4 rule | 2000=leap, 1900=not leap, 2024=leap |

**Fiscal Year Support:**

| Country/Region | FY Start Month | FY Example | Setting |
|----------------|----------------|------------|---------|
| **US/Calendar** | January (1) | Jan 1 - Dec 31 | `fiscal_year_start_month = 1` (default) |
| **India/UK/Japan** | April (4) | Apr 1, 2025 - Mar 31, 2026 | `fiscal_year_start_month = 4` |
| **Australia** | July (7) | Jul 1, 2025 - Jun 30, 2026 | `fiscal_year_start_month = 7` |

**Fiscal Periods Example (India: Apr-Mar):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FISCAL YEAR: April 2025 - March 2026                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FQ1: Apr-Jun 2025 (91 days)     FH1: Apr-Sep 2025 (183 days)              │
│  FQ2: Jul-Sep 2025 (92 days)                                                │
│  ─────────────────────────────────────────────────────────────              │
│  FQ3: Oct-Dec 2025 (92 days)     FH2: Oct 2025 - Mar 2026 (182 days)       │
│  FQ4: Jan-Mar 2026 (90 days)                                                │
│                                                                             │
│  Annual: 365 days (or 366 if FY contains Feb 29)                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Billing Cycle Days (Accurate Calculation):**

| Cycle | Days Calculation | Example (Calendar) | Example (India FY) |
|-------|------------------|--------------------|--------------------|
| **Monthly (anchor=1)** | Actual days in month | Jan=31, Feb=28/29 | Same |
| **Monthly (anchor=15)** | Days between 15th to 14th | Mar 15 → Apr 14 = 31 | Same |
| **Quarterly** | Actual days in fiscal quarter | Q1=90/91, Q2=91, Q3=92, Q4=92 | FQ1=91, FQ2=92, FQ3=92, FQ4=90 |
| **Semi-Annual** | Actual days in fiscal half | H1=181/182, H2=184 | FH1=183, FH2=182 |
| **Annual** | Fiscal year days (365/366) | Jan 1 - Dec 31 | Apr 1 - Mar 31 |
| **Weekly** | Fixed 7 days | Always 7 | Always 7 |

**Key Features:**
- **Leap year handling**: Annual plans correctly use 365 or 366 days (400/100/4 rule)
- **Billing anchor support**: Non-calendar billing (e.g., 15th to 14th) using `billing_anchor_day`
- **Quarterly accuracy**: Uses actual Q1-Q4 days, not average 91.25
- **Semi-annual support**: Enterprise contracts with 6-month billing
- **NULL seat handling**: Defaults to 1 seat if NULL (logged as DQ issue)
- **Currency fallback**: Uses org default currency if plan currency is NULL
- **Idempotent**: Deletes existing rows for date range before insert

---

### CRITICAL: DELETE + RECALCULATE Behavior (Idempotent Pattern)

> **Understanding this behavior is essential for anyone working with SaaS subscription costs.**

The stored procedure uses an **idempotent DELETE + RECALCULATE** pattern. This means:

1. **DELETE ALL** existing daily cost rows in the specified date range (for ALL subscriptions)
2. **SELECT ALL** subscriptions that overlap with the date range
3. **INSERT** fresh daily cost rows for ALL overlapping subscriptions

#### Why This Pattern?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      IDEMPOTENT PATTERN BENEFITS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✓ No duplicate rows - DELETE ensures clean slate                          │
│  ✓ Re-runnable - Same input always produces same output                    │
│  ✓ Self-healing - Fixes any corrupted/missing data in the range            │
│  ✓ Consistent - All subscriptions calculated with same logic               │
│  ✓ Atomic - Transaction ensures all-or-nothing execution                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Example: Adding a Backdated Subscription

**Scenario Setup:**
- **Today**: 2025-12-18
- **Existing**: Subscription A (Canva Pro) - started 2025-01-01, status=active
- **Existing Data**: `saas_subscription_plan_costs_daily` has rows from 2025-01-01 to 2025-12-17
- **Action**: Add Subscription B (ChatGPT Plus) with start_date = 2025-02-01 (backdated)

**Step-by-Step Execution:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: Plan Created in saas_subscription_plans                            │
│                                                                             │
│  saas_subscription_plans table now has:                                     │
│  ├── Subscription A: start_date=2025-01-01, end_date=NULL, status=active   │
│  └── Subscription B: start_date=2025-02-01, end_date=NULL, status=active   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 2: Frontend Detects Backdated (start_date < today)                    │
│                                                                             │
│  File: actions/subscription-providers.ts:178                                │
│  isDateInPastUTC("2025-02-01") → TRUE                                       │
│                                                                             │
│  Triggers: triggerCostBackfill(orgSlug, apiKey, "2025-02-01", "2025-12-18") │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 3: Stored Procedure DELETES Existing Daily Costs                      │
│                                                                             │
│  SQL Executed:                                                              │
│  DELETE FROM saas_subscription_plan_costs_daily                             │
│  WHERE cost_date BETWEEN '2025-02-01' AND '2025-12-18'                      │
│                                                                             │
│  ⚠️  THIS DELETES ALL ROWS FOR ALL SUBSCRIPTIONS IN THE DATE RANGE          │
│                                                                             │
│  Result: ~320 rows deleted (Subscription A's costs from Feb 1 to Dec 18)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 4: Stored Procedure SELECTS All Overlapping Subscriptions             │
│                                                                             │
│  SQL Logic:                                                                 │
│  SELECT * FROM saas_subscription_plans                                      │
│  WHERE status IN ('active', 'expired', 'cancelled')                         │
│    AND (start_date <= '2025-12-18' OR start_date IS NULL)                   │
│    AND (end_date >= '2025-02-01' OR end_date IS NULL)                       │
│                                                                             │
│  Returns: BOTH Subscription A and Subscription B                            │
│                                                                             │
│  Why both? Both subscriptions OVERLAP with the date range:                  │
│  • Sub A: start=2025-01-01 ≤ 2025-12-18 ✓, end=NULL ≥ 2025-02-01 ✓         │
│  • Sub B: start=2025-02-01 ≤ 2025-12-18 ✓, end=NULL ≥ 2025-02-01 ✓         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 5: Date Array Generated (CLIPPED to Pipeline Range)                   │
│                                                                             │
│  GENERATE_DATE_ARRAY(                                                       │
│    GREATEST(subscription.start_date, pipeline.start_date),  -- Clip start  │
│    LEAST(subscription.end_date, pipeline.end_date)          -- Clip end    │
│  )                                                                          │
│                                                                             │
│  For Subscription A (started 2025-01-01):                                   │
│    GREATEST(2025-01-01, 2025-02-01) = 2025-02-01  ← Clipped to range start │
│    LEAST(NULL→2025-12-18, 2025-12-18) = 2025-12-18                          │
│    → Generates: 2025-02-01 to 2025-12-18 (321 days)                         │
│                                                                             │
│  For Subscription B (started 2025-02-01):                                   │
│    GREATEST(2025-02-01, 2025-02-01) = 2025-02-01                            │
│    LEAST(NULL→2025-12-18, 2025-12-18) = 2025-12-18                          │
│    → Generates: 2025-02-01 to 2025-12-18 (321 days)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 6: Daily Costs INSERTED for All Subscriptions                         │
│                                                                             │
│  INSERT INTO saas_subscription_plan_costs_daily (...)                       │
│  SELECT ... FROM subscriptions CROSS JOIN date_array                        │
│                                                                             │
│  Result:                                                                    │
│  • 321 rows for Subscription A (Feb 1 - Dec 18)                             │
│  • 321 rows for Subscription B (Feb 1 - Dec 18)                             │
│  • Total: 642 new rows inserted                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Visual: What Happens to Existing Daily Costs

```
BEFORE: Adding Subscription B (backdated to Feb 1)
═══════════════════════════════════════════════════════════════════════════════

  January 2025              February 2025 ──────────────────────────► Today
  ┌────────────────────────┬───────────────────────────────────────────────────┐
  │ Sub A: 31 rows         │ Sub A: ~320 rows                                  │
  │ (daily costs exist)    │ (daily costs exist)                               │
  └────────────────────────┴───────────────────────────────────────────────────┘
                           │                                                   │
                           └───────────────── PIPELINE RANGE ─────────────────┘
                                    start_date: 2025-02-01
                                    end_date: 2025-12-18


AFTER: Pipeline Executed (DELETE + RECALCULATE)
═══════════════════════════════════════════════════════════════════════════════

  January 2025              February 2025 ──────────────────────────► Today
  ┌────────────────────────┬───────────────────────────────────────────────────┐
  │ Sub A: 31 rows         │ Sub A: 321 rows (RECALCULATED)                    │
  │ (PRESERVED - untouched)│ Sub B: 321 rows (NEW)                             │
  └────────────────────────┴───────────────────────────────────────────────────┘
        ↑                              ↑
        │                              │
   Outside pipeline range         Inside pipeline range
   NOT deleted                    DELETED then RE-INSERTED
   NOT recalculated               for ALL overlapping subscriptions
```

#### Key Implications

| Aspect | Behavior | Impact |
|--------|----------|--------|
| **Adding backdated plan** | Recalculates ALL subscriptions in range | Ensures consistency across all plans |
| **Editing any plan** | Triggers recalculation for current month | All plans in month get fresh calculations |
| **Ending a subscription** | Recalculates current month | Ended plan's costs preserved up to end_date |
| **Data outside range** | Completely untouched | January costs preserved when Feb-Dec recalculated |
| **Re-running same range** | Produces identical results | Safe to retry failed pipelines |

#### Edge Cases & Important Notes

**1. Adding Plan with Very Old Start Date**

```bash
# Adding a plan that started 2 years ago
start_date: 2023-01-01

# Pipeline will be called with:
# start_date: 2023-01-01, end_date: 2025-12-18 (today)

# This will:
# ✓ DELETE 2+ years of daily costs for ALL subscriptions
# ✓ RECALCULATE 2+ years of daily costs for ALL overlapping subscriptions
# ⚠️ This is correct but may take longer (more data to process)
```

**2. Subscription A Started Before Subscription B**

```
Subscription A: started 2025-01-01
Subscription B: started 2025-06-01 (backdated, added today)

Pipeline triggered with: start_date=2025-06-01, end_date=2025-12-18

Result:
• Jan 1 - May 31: Sub A only (31+28+31+30+31 = 151 rows) - PRESERVED
• Jun 1 - Dec 18: Sub A + Sub B (both recalculated) - 201 rows each
```

**3. Subscription Ended Before New Plan Start**

```
Subscription A: started 2025-01-01, ended 2025-03-31 (cancelled)
Subscription B: started 2025-06-01 (backdated, added today)

Pipeline triggered with: start_date=2025-06-01, end_date=2025-12-18

Result:
• Jun 1 - Dec 18: Only Sub B calculated
• Sub A is NOT included (end_date 2025-03-31 < start_date 2025-06-01)
• Sub A's Jan-Mar costs remain PRESERVED (outside range)
```

**4. Overlapping Date Ranges**

```
Subscription A: started 2025-01-01, ended 2025-08-31
Subscription B: started 2025-06-01 (backdated, added today)

Pipeline triggered with: start_date=2025-06-01, end_date=2025-12-18

Overlap period (Jun 1 - Aug 31): BOTH subscriptions have daily costs
After Sub A ends (Sep 1 - Dec 18): Only Sub B has daily costs
```

#### DO's and DON'Ts for Pipeline Triggering

| DO | DON'T |
|----|-------|
| ✓ Let auto-trigger handle backdated plans | ✗ Don't manually delete daily costs |
| ✓ Use full date range for historical corrections | ✗ Don't assume only new plan is calculated |
| ✓ Re-run pipeline if you suspect data issues | ✗ Don't worry about duplicates (DELETE handles it) |
| ✓ Pass explicit dates for controlled recalculation | ✗ Don't call pipeline service (8001) directly |

#### Recalculating Historical Data

If you need to recalculate costs from a specific date (e.g., fix a pricing error):

```bash
# Recalculate ALL daily costs from January 1st to today
curl -X POST "http://localhost:8000/api/v1/pipelines/trigger/{org}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2025-01-01",
    "end_date": "2025-12-18"
  }'

# This will:
# 1. DELETE all daily costs from Jan 1 to Dec 18
# 2. RECALCULATE for all subscriptions that overlap this range
# 3. INSERT fresh daily cost rows
```

#### Performance Considerations

| Date Range | Approximate Rows | Expected Duration |
|------------|------------------|-------------------|
| Current month | ~30 × num_subscriptions | < 5 seconds |
| Quarter | ~90 × num_subscriptions | < 15 seconds |
| Full year | ~365 × num_subscriptions | 30-60 seconds |
| 2+ years | ~730+ × num_subscriptions | 60-120 seconds |

**Note:** The procedure has a built-in limit of 366 days per execution. For longer ranges, call the pipeline multiple times with different date ranges.

---

### Concurrency Control: Preventing Duplicate Pipeline Runs

> **Critical for data integrity:** Only ONE instance of a pipeline can run for a given org at any time.

The system uses a **belt-and-suspenders approach** with TWO layers of protection:

#### Layer 1: BigQuery Atomic INSERT (API Router)

**File:** `03-data-pipeline-service/src/app/routers/pipelines.py`

```sql
-- ATOMIC: Insert pipeline run ONLY IF no RUNNING/PENDING pipeline exists
INSERT INTO org_meta_pipeline_runs (...)
SELECT * FROM (...) AS new_run
WHERE NOT EXISTS (
    SELECT 1 FROM org_meta_pipeline_runs
    WHERE org_slug = @org_slug
      AND pipeline_id = @pipeline_id
      AND status IN ('RUNNING', 'PENDING')
)
```

**Behavior:** If a duplicate request arrives while a pipeline is running, the INSERT returns 0 rows affected, and the API returns the existing `pipeline_logging_id`.

#### Layer 2: In-Memory Pipeline Lock (Executor)

**File:** `03-data-pipeline-service/src/core/utils/pipeline_lock.py`
**Integration:** `03-data-pipeline-service/src/core/pipeline/async_executor.py`

```python
# At start of _execute_with_semaphore():
lock_manager = get_pipeline_lock_manager()
lock_success, existing_pipeline_id = await lock_manager.acquire_lock(
    org_slug=self.org_slug,
    pipeline_id=self.tracking_pipeline_id,
    pipeline_logging_id=self.pipeline_logging_id,
    locked_by=self.trigger_by
)

if not lock_success:
    return {"status": "BLOCKED", "existing_pipeline_logging_id": existing_pipeline_id}

# ... execute pipeline ...

# In finally block:
if lock_acquired:
    await lock_manager.release_lock(org_slug, pipeline_id, pipeline_logging_id)
```

#### How the Two Layers Work Together

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  REQUEST 1: POST /pipelines/run/acme_corp/saas_subscription/costs/saas_cost │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. API Router: BigQuery atomic INSERT → SUCCESS (no existing RUNNING)      │
│  2. Background task starts → AsyncPipelineExecutor.execute()                │
│  3. Executor: In-memory lock.acquire() → SUCCESS (lock granted)             │
│  4. Pipeline runs stored procedure (DELETE + INSERT in TRANSACTION)         │
│  5. Pipeline completes → lock.release() in finally block                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  REQUEST 2: Same pipeline DURING Request 1 execution                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BLOCKED AT LAYER 1 (BigQuery):                                             │
│  1. API Router: BigQuery atomic INSERT → 0 rows (RUNNING exists)            │
│  2. Returns: {"status": "RUNNING", "existing_pipeline_logging_id": "..."}   │
│                                                                             │
│  OR BLOCKED AT LAYER 2 (In-Memory - if somehow bypasses Layer 1):           │
│  1. Executor: lock.acquire() → FAILS (lock held by Request 1)               │
│  2. Returns: {"status": "BLOCKED", "existing_pipeline_logging_id": "..."}   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Lock Features

| Feature | Description |
|---------|-------------|
| **Org + Pipeline specific** | Lock key = `{org_slug}:{pipeline_id}` - different orgs can run same pipeline concurrently |
| **Auto-expiration** | Locks expire after 1 hour (configurable) to prevent deadlocks |
| **Async-safe** | Uses `asyncio.Lock` for thread-safe operation |
| **Idempotent release** | Safe to call release multiple times |
| **Audit logging** | All acquire/release events logged with context |

#### Lock Scope: What Can Run Concurrently?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOCK KEY = {org_slug}:{pipeline_id}                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✓ ALLOWED (Different lock keys):                                           │
│  ├── acme_corp runs saas_cost WHILE beta_inc runs saas_cost                │
│  │   Lock keys: "acme_corp:...-saas_cost" vs "beta_inc:...-saas_cost"      │
│  │                                                                          │
│  ├── acme_corp runs saas_cost WHILE acme_corp runs gcp_billing             │
│  │   Lock keys: "acme_corp:...-saas_cost" vs "acme_corp:...-billing"       │
│  │                                                                          │
│  └── 100 different orgs all running saas_cost simultaneously               │
│      Each has unique lock key                                               │
│                                                                             │
│  ✗ BLOCKED (Same lock key):                                                 │
│  └── acme_corp runs saas_cost WHILE acme_corp tries saas_cost again        │
│      Same lock key: "acme_corp:acme_corp-saas_subscription-costs-saas_cost"│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Example Lock Keys:**

| Org | Pipeline | Lock Key |
|-----|----------|----------|
| `acme_corp` | saas_subscription/costs/saas_cost | `acme_corp:acme_corp-saas_subscription-costs-saas_cost` |
| `beta_inc` | saas_subscription/costs/saas_cost | `beta_inc:beta_inc-saas_subscription-costs-saas_cost` |
| `acme_corp` | gcp/cost/billing | `acme_corp:acme_corp-gcp-cost-billing` |
| `acme_corp` | openai/cost/usage_cost | `acme_corp:acme_corp-openai-cost-usage_cost` |

#### Why Both Layers?

| Layer | Purpose | Speed | Persistence |
|-------|---------|-------|-------------|
| **BigQuery INSERT** | Authoritative, survives restarts | Slower (~100ms) | Persistent |
| **In-Memory Lock** | Fast duplicate detection | Fast (~1ms) | Lost on restart |

The in-memory lock provides **sub-millisecond** duplicate detection for rapid-fire requests, while BigQuery provides **durable** protection that survives service restarts.

#### What Happens if Service Restarts Mid-Pipeline?

1. **In-memory locks are lost** - This is expected
2. **BigQuery status remains RUNNING** - The durable record
3. **Lock manager timeout (1 hour)** - Stale BigQuery RUNNING status eventually allows new runs
4. **Manual cleanup available** - Admin can update status to FAILED if needed

#### Recommended Cloud Scheduler Jobs

Configure these Cloud Scheduler jobs in GCP to maintain pipeline health:

```yaml
# ─────────────────────────────────────────────────────────────────────────────
# Job 1: Cleanup Orphaned Pipelines (Hourly)
# ─────────────────────────────────────────────────────────────────────────────
# Purpose: Mark stale RUNNING pipelines as FAILED
# Handles: Service restarts, crashed pipelines, stuck executions
#
# Cloud Scheduler Config:
#   Name: cleanup-orphaned-pipelines
#   Schedule: "0 * * * *"  (every hour at minute 0)
#   Target: HTTP
#   URL: https://{PIPELINE_SERVICE_URL}/api/v1/scheduler/cleanup-orphaned-pipelines
#   Method: POST
#   Headers:
#     X-CA-Root-Key: ${CA_ROOT_API_KEY}
#     Content-Type: application/json
#   Body: {"timeout_minutes": 60}
#
# Behavior:
#   - Finds pipelines with status=RUNNING for > timeout_minutes
#   - Updates status to FAILED with reason "Orphaned - cleanup by scheduler"
#   - Logs cleanup actions to org_audit_logs
#
# Example cURL for manual trigger:
curl -X POST "https://{PIPELINE_SERVICE_URL}/api/v1/scheduler/cleanup-orphaned-pipelines?timeout_minutes=60" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"

# ─────────────────────────────────────────────────────────────────────────────
# Job 2: Reset Stale Quota Counters (Daily)
# ─────────────────────────────────────────────────────────────────────────────
# Purpose: Reset quota counters that weren't properly decremented
# Handles: Counter drift from crashes, race conditions
#
# Cloud Scheduler Config:
#   Name: reset-stale-quotas
#   Schedule: "0 0 * * *"  (daily at midnight UTC)
#   Target: HTTP
#   URL: https://{PIPELINE_SERVICE_URL}/api/v1/scheduler/reset-quotas
#   Method: POST
#   Headers:
#     X-CA-Root-Key: ${CA_ROOT_API_KEY}
#
# Behavior:
#   - Resets quota counters based on actual RUNNING pipeline count
#   - Reconciles in-memory counters with BigQuery state
#   - Prevents quota exhaustion from stale counters
#
# Example cURL for manual trigger:
curl -X POST "https://{PIPELINE_SERVICE_URL}/api/v1/scheduler/reset-quotas" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"
```

**Cloud Scheduler Setup (GCP Console or Terraform):**

```hcl
# Terraform example for Cloud Scheduler jobs
resource "google_cloud_scheduler_job" "cleanup_orphaned_pipelines" {
  name             = "cleanup-orphaned-pipelines"
  description      = "Cleanup stale RUNNING pipelines hourly"
  schedule         = "0 * * * *"
  time_zone        = "UTC"
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "${var.pipeline_service_url}/api/v1/scheduler/cleanup-orphaned-pipelines?timeout_minutes=60"

    headers = {
      "X-CA-Root-Key" = var.ca_root_api_key
      "Content-Type"  = "application/json"
    }
  }

  retry_config {
    retry_count = 3
  }
}

resource "google_cloud_scheduler_job" "reset_stale_quotas" {
  name             = "reset-stale-quotas"
  description      = "Reset stale quota counters daily"
  schedule         = "0 0 * * *"
  time_zone        = "UTC"
  attempt_deadline = "120s"

  http_target {
    http_method = "POST"
    uri         = "${var.pipeline_service_url}/api/v1/scheduler/reset-quotas"

    headers = {
      "X-CA-Root-Key" = var.ca_root_api_key
    }
  }

  retry_config {
    retry_count = 3
  }
}
```

**Monitoring Recommendations:**

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| Orphaned pipelines cleaned per hour | > 5 | Investigate frequent crashes |
| Cleanup job failures | > 2 consecutive | Check service health |
| Quota reset drift | > 10% correction | Review concurrency patterns |

#### Multi-Instance Deployment Considerations

When running multiple instances of the pipeline service (e.g., Cloud Run with min-instances > 1):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MULTI-INSTANCE LIMITATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Instance A                    Instance B                                   │
│  ┌─────────────────┐          ┌─────────────────┐                          │
│  │ In-Memory Lock  │          │ In-Memory Lock  │  ← NOT SHARED!           │
│  │ Manager         │          │ Manager         │                          │
│  └────────┬────────┘          └────────┬────────┘                          │
│           │                            │                                    │
│           └────────────┬───────────────┘                                    │
│                        ▼                                                    │
│           ┌─────────────────────────┐                                      │
│           │  BigQuery (Shared)      │  ← AUTHORITATIVE                     │
│           │  org_meta_pipeline_runs │                                      │
│           └─────────────────────────┘                                      │
│                                                                             │
│  IMPACT:                                                                    │
│  • Same pipeline request hitting different instances → BOTH may start      │
│  • BigQuery INSERT will fail for duplicate → One will be rejected          │
│  • Belt-and-suspenders: BigQuery is the authoritative layer                │
│                                                                             │
│  MITIGATION:                                                                │
│  • Rely on BigQuery INSERT as primary protection                           │
│  • In-memory lock is optimization for rapid-fire requests                  │
│  • Cloud Scheduler cleanup handles any leaked RUNNING status               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Production Deployment Checklist:**

- [ ] Cloud Scheduler jobs configured for cleanup and quota reset
- [ ] Alert on orphaned pipeline cleanup rate
- [ ] Monitor BigQuery INSERT rejection rate (indicates concurrent attempts)
- [ ] Set appropriate lock timeout (default: 1 hour)
- [ ] Enable audit logging for lock acquire/release events

---

### Procedure 2: sp_convert_saas_costs_to_focus_1_3

**File:** `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_convert_saas_costs_to_focus_1_3.sql`

**Purpose:** Map daily costs to FinOps FOCUS 1.3 standard format.

**FOCUS 1.3 Compliance:**
- Uses `ServiceProviderName`, `HostProviderName`, `InvoiceIssuerName` (not deprecated ProviderName)
- Tags stored as JSON (not REPEATED RECORD)
- Includes `ContractApplied` field for contract linkage
- Extension fields use `x_` prefix per FOCUS convention

**Key Mappings:**

| Source Field | FOCUS 1.3 Field | Notes |
|--------------|-----------------|-------|
| `daily_cost` | `BilledCost` | Actual billed amount |
| `currency` | `BillingCurrency` | ISO 4217 code |
| `provider` | `ServiceProviderName` | e.g., "Canva", "ChatGPT Plus" |
| `subscription_id` | `ResourceId` | Unique resource identifier |
| `org_slug` | `SubAccountId` | Organization identifier |
| `cost_date` | `ChargePeriodStart` | Converted to TIMESTAMP |
| - | `x_SourceSystem` | Always `saas_subscription_costs_daily` |

### Procedure 3: sp_run_saas_subscription_costs_pipeline (Orchestrator)

**File:** `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_run_saas_subscription_costs_pipeline.sql`

**Purpose:** Orchestrates Stage 1 and Stage 2 procedures.

**Auto Date Detection:**
```sql
-- If start_date not provided, auto-detect from earliest active plan
SET v_start_date = COALESCE(
  p_start_date,                           -- 1. Provided parameter
  (SELECT MIN(start_date) FROM plans),    -- 2. Earliest plan start
  DATE_TRUNC(CURRENT_DATE(), MONTH)       -- 3. First of current month
);
```

**Error Handling:**
```sql
EXCEPTION WHEN ERROR THEN
  -- Re-raise with context for debugging
  RAISE USING MESSAGE = CONCAT(
    'sp_run_saas_subscription_costs_pipeline Failed for dataset=', p_dataset_id,
    ', date_range=[', start, ' to ', end, ']: ',
    @@error.message
  );
```

### Syncing Procedures to BigQuery

Procedures must be synced from SQL files to BigQuery:

```bash
# List available procedure files
curl -s -X GET "http://localhost:8001/api/v1/procedures/files" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq

# Sync all procedures to BigQuery
curl -s -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# Force re-sync (recreate even if unchanged)
curl -s -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}' | jq
```

### Output Tables

**Table 1: `saas_subscription_plan_costs_daily`**

| Column | Type | Source |
|--------|------|--------|
| `org_slug` | STRING | From subscription |
| `provider` | STRING | From subscription |
| `subscription_id` | STRING | From subscription |
| `plan_name` | STRING | From subscription |
| `cost_date` | DATE | Generated per day in range |
| `daily_cost` | NUMERIC | Calculated (see logic above) |
| `cycle_cost` | NUMERIC | Full billing cycle cost |
| `monthly_run_rate` | NUMERIC | `daily_cost × days_in_month` |
| `annual_run_rate` | NUMERIC | `daily_cost × 365` |
| `currency` | STRING | From subscription or org default |

**Table 2: `cost_data_standard_1_3`**

FOCUS 1.3 compliant with 78 columns. Key fields:
- `BilledCost`, `EffectiveCost`, `ListCost`
- `ServiceProviderName`, `ServiceCategory`, `ServiceName`
- `ChargePeriodStart`, `ChargePeriodEnd`
- `x_SourceSystem = 'saas_subscription_costs_daily'`

### Scheduling (Daily)

The cost pipeline runs automatically via Cloud Scheduler:

```yaml
# Pipeline config: configs/saas_subscription/costs/saas_cost.yml
schedule:
  type: daily
  time: "03:00"
  timezone: UTC
```

**Note:** Daily scheduler runs after other cost pipelines (GCP billing, LLM usage) to aggregate all costs.

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
| `billing_cycle` | STRING | monthly, quarterly, semi-annual, yearly, weekly |
| `billing_anchor_day` | INT64 | Day of month billing starts (1-28). NULL=calendar-aligned |
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
| `billing_cycle` | STRING | monthly, quarterly, semi-annual, yearly, weekly |
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
