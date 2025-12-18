# SaaS Subscription Costs

**Status**: IMPLEMENTED (v12.3) | **Updated**: 2025-12-17 | **Single Source of Truth**

> Track fixed-cost SaaS subscriptions (Canva, ChatGPT Plus, Slack, etc.)
> NOT CloudAct platform billing (that's Stripe)
> NOT LLM API tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - separate flow)

---

## Multi-Currency Support (v12.2)

Organizations can operate in any of the 16 supported currencies. Template prices are stored in USD and converted to the org's default currency on display and save.

### Currency Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SEED CSV (Source of Truth)                            │
│  File: 02-api-service/configs/saas/seed/data/saas_subscription_plans.csv    │
│                                                                              │
│  unit_price | yearly_price | currency = "USD"                       │
│  (Always USD - single source, no multi-currency columns)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TEMPLATE SELECTION PAGE                                  │
│  Route: /{orgSlug}/subscriptions/{provider}/add                             │
│                                                                              │
│  1. Fetch org's default currency from org_profiles                          │
│  2. Fetch exchange rates from lib/currency/exchange-rates.ts                │
│  3. Convert: convertFromUSD(unit_price, orgCurrency)                   │
│  4. Display: formatCurrency(convertedPrice, orgCurrency)                   │
│                                                                              │
│  Example: Canva PRO $15 USD → ₹1,246.80 INR (for Indian org)               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ADD CUSTOM FORM                                          │
│  Route: /{orgSlug}/subscriptions/{provider}/add/custom                      │
│                                                                              │
│  - Currency field: LOCKED to org's default currency (read-only)             │
│  - Price pre-filled with converted value from template                      │
│  - User can adjust price but NOT currency                                   │
│  - Audit fields captured: source_currency, source_price, exchange_rate     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BigQuery Storage                                         │
│  Table: {org_slug}_{env}.saas_subscription_plans                            │
│                                                                              │
│  Stored Fields:                                                              │
│  - currency: "INR" (org's default - what user sees and pays in)            │
│  - unit_price: 1246.80 (in org's currency, NOT USD anymore!)           │
│  - source_currency: "USD" (original template currency for audit)           │
│  - source_price: 15.00 (original USD price for audit)                      │
│  - exchange_rate_used: 83.12 (rate at time of creation)                    │
│                                                                              │
│  NOTE: Despite column name "unit_price", value is in org's currency!   │
│  Future migration will rename to "unit_price" for clarity.                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Exchange Rate Service

**File:** `01-fronted-system/lib/currency/exchange-rates.ts`

Fixed rates relative to USD (base = 1.0). Updated monthly by admin.

```typescript
export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,      // Base
  EUR: 0.92,     GBP: 0.79,     JPY: 149.5,
  CHF: 0.88,     CAD: 1.36,     AUD: 1.53,
  CNY: 7.24,     INR: 83.12,    SGD: 1.34,
  AED: 3.673,    SAR: 3.75,     QAR: 3.64,
  KWD: 0.31,     BHD: 0.377,    OMR: 0.385,
}
```

**Key Functions:**

| Function | Purpose | Example |
|----------|---------|---------|
| `convertCurrency(amount, from, to)` | Convert between any currencies | `convertCurrency(100, "USD", "INR")` → 8312 |
| `convertFromUSD(amount, to)` | Convert USD to target | `convertFromUSD(15, "INR")` → 1246.80 |
| `convertToUSD(amount, from)` | Convert to USD | `convertToUSD(1246.80, "INR")` → 15 |
| `convertWithAudit(amount, from, to)` | Convert with full audit trail | Returns `{ sourceCurrency, sourcePrice, convertedPrice, exchangeRateUsed, ... }` |

### Import from i18n

```typescript
import {
  convertCurrency,
  convertFromUSD,
  convertWithAudit,
  formatCurrency,
  EXCHANGE_RATES,
} from "@/lib/i18n"
```

### Why Lock Currency to Org Default?

| Benefit | Explanation |
|---------|-------------|
| **Consistency** | All costs in same currency → accurate totals |
| **Reporting** | Dashboard charts don't need multi-currency aggregation |
| **Simplicity** | No "which currency?" confusion for users |
| **Audit Trail** | `source_currency` + `source_price` preserves original data |

### Page Routing (v12.2)

All subscription management uses dedicated pages (not modals):

| Route | Purpose |
|-------|---------|
| `/{orgSlug}/subscriptions/{provider}` | Provider overview (list plans) |
| `/{orgSlug}/subscriptions/{provider}/add` | Add from Template selection |
| `/{orgSlug}/subscriptions/{provider}/add/custom` | Add Custom form |
| `/{orgSlug}/subscriptions/{provider}/{subscriptionId}/edit` | Edit subscription |
| `/{orgSlug}/subscriptions/{provider}/{subscriptionId}/end` | End subscription |
| `/{orgSlug}/subscriptions/{provider}/success` | Success confirmation |

### Pipeline Currency Flow

The pipeline procedures fully support multi-currency. Currency flows end-to-end from plan creation to FOCUS 1.3 reporting:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SUBSCRIPTION PLANS TABLE                                 │
│  Table: {org_slug}_{env}.saas_subscription_plans                            │
│                                                                              │
│  currency: "INR"           ← Org's default currency                         │
│  unit_price: 1246.80   ← Price in org's currency (converted)           │
│  source_currency: "USD"    ← Original template currency (audit)            │
│  source_price: 15.00       ← Original USD price (audit)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           sp_calculate_saas_subscription_plan_costs_daily                   │
│  File: configs/system/procedures/saas_subscription/                         │
│        sp_calculate_saas_subscription_plan_costs_daily.sql                  │
│                                                                              │
│  - Reads `currency` from plans table                                        │
│  - Calculates daily costs: COALESCE(currency, 'USD') AS currency           │
│  - Passes currency through to daily costs output                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DAILY COSTS TABLE                                        │
│  Table: {org_slug}_{env}.saas_subscription_plan_costs_daily                 │
│                                                                              │
│  currency: "INR"           ← Preserved from plans table                     │
│  daily_cost: 41.56         ← Daily cost in org's currency                  │
│  monthly_cost: 1246.80     ← Monthly cost in org's currency                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               sp_convert_saas_costs_to_focus_1_3                            │
│  File: configs/system/procedures/saas_subscription/                         │
│        sp_convert_saas_costs_to_focus_1_3.sql                               │
│                                                                              │
│  Maps currency to FOCUS 1.3 standard fields:                               │
│  - spc.currency AS BillingCurrency                                         │
│  - spc.currency AS PricingCurrency                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FOCUS 1.3 TABLE                                          │
│  Table: {org_slug}_{env}.cost_data_standard_1_3                             │
│                                                                              │
│  BillingCurrency: "INR"    ← FOCUS 1.3 standard field                      │
│  PricingCurrency: "INR"    ← FOCUS 1.3 standard field                      │
│  BilledCost: 41.56         ← Cost in BillingCurrency                       │
│  EffectiveCost: 41.56      ← Cost in BillingCurrency                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Currency is preserved end-to-end (no conversion in pipeline)
- `COALESCE(currency, 'USD')` provides backward compatibility for null values
- FOCUS 1.3 uses `BillingCurrency` and `PricingCurrency` (same value)
- All cost calculations done in org's currency for accurate totals

---

## Notation

**Naming Conventions Used in This Document:**

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier (3-50 chars, alphanumeric + underscore) | `acme_corp`, `my_startup` |
| `{env}` | Environment suffix: `local`, `stage`, `prod` | `prod` |
| `{org_slug}_{env}` | Full BigQuery dataset name | `acme_corp_prod`, `my_startup_stage` |
| `{provider}` | SaaS provider key (lowercase, underscores) | `canva`, `chatgpt_plus`, `claude_pro` |
| `{plan_name}` | Plan tier identifier (uppercase) | `FREE`, `PRO`, `TEAM`, `ENTERPRISE` |

**BigQuery Dataset Naming:**
```
Format: {org_slug}_{env}
Examples:
  - acme_corp_local   (development)
  - acme_corp_stage   (staging)
  - acme_corp_prod    (production)
```

---

## TERMINOLOGY: Providers vs Plans

**IMPORTANT:** This feature uses two distinct concepts. Use these terms consistently to avoid confusion:

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Subscription Provider** | A SaaS service/product that offers subscriptions | Canva, ChatGPT Plus, Slack, Figma | Supabase `saas_subscription_providers_meta` |
| **Subscription Plan** | A pricing tier WITHIN a provider | FREE, PRO, TEAM, BUSINESS | BigQuery `saas_subscription_plans` |

**Examples:**
- **Provider:** `canva` → **Plans:** FREE ($0), PRO ($15), TEAM ($10/seat)
- **Provider:** `chatgpt_plus` → **Plans:** FREE ($0), PLUS ($20), TEAM ($25/seat)
- **Provider:** `slack` → **Plans:** FREE ($0), PRO ($8.75), BUSINESS+ ($15)

**File Naming Convention:**
- Files handling **providers** contain `provider` in name (e.g., `saas_subscription_provider_meta.sql`)
- Files handling **plans** contain `plans` in name (e.g., `saas_subscription_plans.json`, `subscription_plans.py`)

**Code Naming Convention:**
- Functions for **providers**: `enableProvider()`, `disableProvider()`, `getAllProviders()`
- Functions for **plans**: `getProviderPlans()`, `createCustomPlan()`, `togglePlan()`

**Field Terminology (v12.0):**
- `status` - Subscription status: `pending`, `active`, `cancelled`, `expired` (replaces `is_enabled`)
  - `pending` - Newly seeded plans awaiting user activation (default for seed data)
  - `active` - Currently active subscriptions (costs calculated)
  - `cancelled` - User cancelled subscription (soft delete with `end_date`)
  - `expired` - Past `end_date` (auto-set by pipeline)
- `billing_cycle` - Payment frequency: `monthly`, `yearly`, `quarterly`, `weekly` (replaces `billing_period`)
- `discount_type` - Discount format: `percentage`, `fixed`, `none` (replaces `yearly_discount_pct`)
- `pricing_model` - Pricing structure: `per_seat`, `flat_rate`, `tiered` (new field)

---

## Where Data Lives

| Storage  | Table                           | What                              |
| -------- | ------------------------------- | --------------------------------- |
| Supabase | `saas_subscription_providers_meta`        | Provider enable/disable per org   |
| BigQuery | `{org_slug}_{env}.saas_subscription_plans` | ALL plans (seeded + custom)       |

**Architecture Summary:**
- **Supabase** stores ONLY provider enable/disable state (`saas_subscription_providers_meta`)
- **BigQuery** stores ALL subscription plan data (seeded + custom plans)
- ALL plan operations go through **API Service** (port 8000)
- Org API key (from `user.user_metadata.org_api_keys[orgSlug]`) required for API calls

---

## Table Creation vs Data Seeding Lifecycle

**Critical:** The BigQuery table and the data within it are created at DIFFERENT times.

### When Table is Created

**During Org Onboarding** (`POST /api/v1/organizations/onboard`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 5 of Onboarding: OrgOnboardingProcessor creates:                      │
│                                                                             │
│  1. Per-org BigQuery dataset: {org_slug}_{env}                             │
│  2. EMPTY saas_subscription_plans table (no data)                          │
│  3. EMPTY llm_model_pricing table (no data)                                │
│  4. Validation test table                                                  │
│                                                                             │
│  Location: 02-api-service/src/app/routers/organizations.py lines 843-850     │
│                                                                             │
│  metadata_tables: [                                                        │
│    {                                                                       │
│      "table_name": "saas_subscription_plans",                             │
│      "schema_file": "saas_subscription_plans.json",                       │
│      "description": "Unified SaaS subscription plans",                     │
│      "clustering_fields": ["provider", "plan_name"]                        │
│    },                                                                      │
│    {                                                                       │
│      "table_name": "llm_model_pricing",                                   │
│      "schema_file": "llm_model_pricing.json",                             │
│      ...                                                                   │
│    }                                                                       │
│  ]                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### When Plans are Created (v12.1 - Manual Add Flow)

**When User Enables a Provider** (via frontend toggle):
- ONLY updates Supabase metadata (`saas_subscription_providers_meta`)
- NO automatic seeding to BigQuery
- Shows empty state with "Add from Template" and "Add Custom Subscription" options

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Enable Provider Flow (v12.1 - No Auto-Seed):                               │
│                                                                             │
│  1. Frontend calls enableProvider(orgSlug, provider)                       │
│     └── Supabase: INSERT into saas_subscription_providers_meta             │
│     (NO backend call - just metadata)                                      │
│                                                                             │
│  2. User navigates to provider detail page                                 │
│     └── Shows EMPTY state with two buttons:                                │
│         ├── "Add from Template" → Opens template selection dialog          │
│         └── "Add Custom Subscription" → Opens manual add form              │
│                                                                             │
│  3. User clicks "Add from Template":                                       │
│     ├── Calls GET /subscriptions/{org}/providers/{p}/available-plans       │
│     ├── Returns predefined plans from seed CSV (not stored in BigQuery)    │
│     ├── User selects template → Form pre-filled with template data         │
│     └── On save: POST /subscriptions/{org}/providers/{p}/plans             │
│                                                                             │
│  Location: 01-fronted-system/actions/subscription-providers.ts                │
│  Backend: 02-api-service/src/app/routers/subscription_plans.py                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Template Plans Endpoint

```
GET /api/v1/subscriptions/{org_slug}/providers/{provider}/available-plans
Header: X-API-Key: {org_api_key}

Response:
{
  "success": true,
  "provider": "chatgpt_plus",
  "plans": [
    {"plan_name": "FREE", "display_name": "ChatGPT Free", "unit_price": 0, ...},
    {"plan_name": "PLUS", "display_name": "ChatGPT Plus", "unit_price": 20, ...},
    {"plan_name": "TEAM", "display_name": "ChatGPT Team", "unit_price": 25, ...},
    {"plan_name": "ENTERPRISE", "display_name": "ChatGPT Enterprise", "unit_price": 60, ...}
  ]
}

Source: configs/saas/seed/data/saas_subscription_plans.csv (read-only, not stored in BigQuery)
```

### Lifecycle Summary

| Stage | What Happens | Table State |
|-------|--------------|-------------|
| **Org Onboarding** | Dataset + tables created | EMPTY tables |
| **User Enables Provider A** | Supabase metadata only | EMPTY tables |
| **User Adds Plan from Template** | Plan created via API | Plans for A |
| **User Adds Custom Plan** | INSERT via API | Plans + custom |
| **User Disables Provider** | DELETE all plans for provider | Plans removed from BigQuery |

**Key Points:**
- Table exists immediately after onboarding (EMPTY)
- **Enabling provider does NOT seed any data** (v12.1 change)
- Users manually add plans via "Add from Template" or "Add Custom Subscription"
- Template data comes from `saas_subscription_plans.csv` (served via `/available-plans` endpoint)
- Plans created with `status=active` by default
- Disabling provider DELETES all plans from BigQuery
- **Cost updates are reflected within 24 hours** when the scheduler runs daily at midnight

---

## Architecture Flow

### Data Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE (Metadata Only)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  saas_subscription_providers_meta                                                     │
│  ├── org_id: UUID                                                           │
│  ├── provider_name: VARCHAR(50)  (e.g., "canva", "claude_pro")             │
│  ├── is_enabled: BOOLEAN         (provider ON/OFF per org)                 │
│  └── enabled_at: TIMESTAMPTZ                                               │
│                                                                             │
│  Purpose: Track which providers are enabled for each org                    │
│  NO subscription plan data stored here                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Provider enabled
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BIGQUERY (All Subscription Data)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  {org_slug}_{env}.saas_subscription_plans (25 columns)                      │
│  ├── org_slug: STRING           (organization identifier)                  │
│  ├── subscription_id: STRING    (UUID, unique per subscription)            │
│  ├── provider: STRING           (e.g., "canva", "claude_pro")              │
│  ├── plan_name: STRING          (e.g., "FREE", "PRO", "TEAM")              │
│  ├── display_name: STRING       (human-readable name)                      │
│  ├── category: STRING           (ai, design, productivity, etc.)           │
│  ├── status: STRING             (pending, active, cancelled, expired)      │
│  ├── start_date: DATE           (subscription start date)                  │
│  ├── end_date: DATE             (subscription end date, nullable)          │
│  ├── billing_cycle: STRING      (monthly, yearly, quarterly, weekly)       │
│  ├── currency: STRING           (USD, EUR, GBP, etc.)                      │
│  ├── seats: INT                 (number of seats/licenses)                 │
│  ├── pricing_model: STRING      (per_seat, flat_rate, tiered)             │
│  ├── unit_price: FLOAT      (monthly cost per unit)                    │
│  ├── yearly_price: FLOAT    (annual cost, nullable)                    │
│  ├── discount_type: STRING      (percentage, fixed, none)                  │
│  ├── discount_value: FLOAT      (discount amount or %, nullable)           │
│  ├── auto_renew: BOOLEAN        (auto-renewal enabled)                     │
│  ├── payment_method: STRING     (credit_card, invoice, etc.)               │
│  ├── invoice_id_last: STRING    (last invoice reference, nullable)         │
│  ├── owner_email: STRING        (subscription owner)                       │
│  ├── department: STRING         (cost center, nullable)                    │
│  ├── renewal_date: DATE         (next renewal date, nullable)              │
│  ├── contract_id: STRING        (contract reference, nullable)             │
│  ├── notes: STRING              (additional notes, nullable)               │
│  └── updated_at: TIMESTAMP      (last update timestamp)                    │
│                                                                             │
│  Purpose: ALL subscription plans (seeded from CSV + custom user plans)     │
│                                                                             │
│  {org_slug}_{env}.saas_subscription_plan_costs_daily (18 columns) - FACT   │
│  ├── org_slug: STRING           (organization identifier)                  │
│  ├── provider: STRING           (e.g., "canva", "claude_pro")              │
│  ├── subscription_id: STRING    (FK to saas_subscription_plans)            │
│  ├── plan_name: STRING          (plan tier: FREE, PRO, TEAM)               │
│  ├── display_name: STRING       (human-readable name)                      │
│  ├── cost_date: DATE            (partition key - cost applies to this day) │
│  ├── billing_cycle: STRING      (monthly, yearly, quarterly)               │
│  ├── currency: STRING           (USD, EUR, GBP)                            │
│  ├── seats: INT64               (number of seats)                          │
│  ├── quantity: NUMERIC          (usage quantity)                           │
│  ├── unit: STRING               (seat, user, license)                      │
│  ├── cycle_cost: NUMERIC        (full billing cycle cost after discounts)  │
│  ├── daily_cost: NUMERIC        (amortized daily cost)                     │
│  ├── monthly_run_rate: NUMERIC  (projected monthly cost)                   │
│  ├── annual_run_rate: NUMERIC   (projected annual cost)                    │
│  ├── invoice_id_last: STRING    (last invoice reference)                   │
│  ├── source: STRING             (subscription_proration)                   │
│  └── updated_at: TIMESTAMP      (last update)                              │
│                                                                             │
│  Purpose: Daily amortized costs calculated by pipeline procedures          │
│  Partition: DAY on cost_date | Cluster: org_slug, subscription_id          │
│                                                                             │
│  {org_slug}_{env}.cost_data_standard_1_3 (78 columns) - FOCUS 1.3 STANDARD │
│  ├── (See FOCUS 1.3 specification for full column list)                    │
│  ├── SourceSystem: STRING = 'saas_subscription_costs_daily'                │
│  └── ChargeCategory: STRING = 'Subscription'                               │
│                                                                             │
│  Purpose: Standardized cost data conforming to FinOps FOCUS 1.3 schema     │
│  Partition: DAY on ChargePeriodStart | Cluster: SubAccountId, ServiceProviderName     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    Centralized Tables (Bootstrap)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BIGQUERY CENTRAL DATASET (organizations)                │
├─────────────────────────────────────────────────────────────────────────────┤
│  NOTE: Subscription audit trail is now in org_audit_logs (centralized)     │
│  See 02-api-service/CLAUDE.md for full audit logging documentation         │
│                                                                             │
│  {project_id}.organizations Procedures (Central - operate on per-org data) │
│  ├── sp_calculate_saas_subscription_plan_costs_daily                        │
│  ├── sp_convert_saas_costs_to_focus_1_3                                     │
│  └── sp_run_saas_subscription_costs_pipeline (orchestrator)                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sidebar Navigation Structure

```
SIDEBAR
├── Dashboard
├── Analytics
├── Pipelines
├── Integrations (expandable)
│   ├── Cloud Providers           → /{org}/settings/integrations/cloud
│   ├── LLM Providers             → /{org}/settings/integrations/llm
│   └── Subscription Providers (expandable) [badge: count]
│       ├── Manage Subscriptions  → /{org}/settings/integrations/subscriptions
│       ├── Claude Pro (if enabled) → /{org}/subscriptions/claude_pro
│       └── Canva (if enabled)    → /{org}/subscriptions/canva
```

**Key Behavior:**
- Subscription Providers is an expandable submenu INSIDE Integrations
- Badge shows count of enabled providers
- "Manage Subscriptions" links to provider enable/disable page
- Individual providers appear only when enabled in Supabase meta table
- NO separate top-level "Subscriptions" menu - everything nested under Integrations

### Page Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MANAGE SUBSCRIPTIONS PAGE: /{orgSlug}/settings/integrations/subscriptions │
├─────────────────────────────────────────────────────────────────────────────┤
│  Subscription Providers                                                     │
│  Track fixed-cost SaaS subscriptions. Enable providers to manage plans.    │
│                                                                             │
│  Enabled: 3 / 28                                                           │
│                                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Canva   │ │ ChatGPT+ │ │  Slack   │ │  Figma   │ │  Cursor  │  ...     │
│  │  [OFF]   │ │  [ON]    │ │  [OFF]   │ │  [ON]    │ │  [ON]    │          │
│  │          │ │ 4 plans  │ │          │ │ 3 plans  │ │ 3 plans  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Don't see your provider?  [Add Custom Provider]                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  DATA: Provider list from static config, enabled state from Supabase meta  │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
      On Enable: 1. Supabase meta insert  2. API seeds plans to BigQuery
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUBSCRIPTION COSTS PAGE: /{orgSlug}/subscriptions (READ-ONLY DASHBOARD)   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Summary Cards: Monthly Cost | Annual Cost | Active Plans | Categories  ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ All Subscriptions Table                                                 ││
│  │ - Aggregates plans from ALL enabled providers                           ││
│  │ - Toggle enable/disable per plan                                        ││
│  │ - Links to provider detail pages                                        ││
│  │ - [Manage Providers] button → /settings/integrations/subscriptions      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  DATA SOURCE: API Service → BigQuery (getAllPlansForCostDashboard)         │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROVIDER DETAIL PAGE: /{orgSlug}/subscriptions/{provider}                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Summary Cards: Monthly Cost | Active Plans | Total Plans                ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ {Provider} Plans                          [+ Add Custom Subscription]   ││
│  │                                                                         ││
│  │ Table:                                                                  ││
│  │ ┌────────┬──────────────┬──────────┬─────────┬───────┬─────────┐       ││
│  │ │ Active │ Plan Name    │ Cost     │ Billing │ Seats │ Actions │       ││
│  │ ├────────┼──────────────┼──────────┼─────────┼───────┼─────────┤       ││
│  │ │ [x]    │ FREE         │ $0.00    │ monthly │ 1     │         │       ││
│  │ │ [x]    │ PRO          │ $20.00   │ monthly │ 1     │         │       ││
│  │ │ [ ]    │ TEAM         │ $25.00   │ monthly │ 5     │         │       ││
│  │ │ [x]    │ ENTERPRISE ⬤ │ $50.00   │ monthly │ 10    │ [🗑]    │       ││
│  │ └────────┴──────────────┴──────────┴─────────┴───────┴─────────┘       ││
│  │                                                                         ││
│  │ Expandable row details: Yearly Price, Discount %, Storage, Limits      ││
│  │                                                                         ││
│  │ ┌─────────────────────────────────────────────────────────────────────┐ ││
│  │ │ Don't see your subscription plan?    [+ Add Custom Subscription]    │ ││
│  │ └─────────────────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  DATA SOURCE: API Service → BigQuery (getProviderPlans)                    │
│  Note: ⬤ = Custom plan (can be deleted), Seeded plans cannot be deleted    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
Frontend (3000)                 Supabase                    API Service (8000)
     │                              │                              │
     │                              │                              │         BigQuery
     │                              │                              │            │
     │  1. Enable Provider          │                              │            │
     │  (toggle ON)                 │                              │            │
     ├─────────────────────────────>│  Insert meta record          │            │
     │                              │  (is_enabled=true)           │            │
     │                              │                              │            │
     ├──────────────────────────────┼─────────────────────────────>│            │
     │                              │     Seed default plans       ├───────────>│
     │                              │     (from CSV)               │  INSERT    │
     │                              │                              │            │
     │  2. Get Plans                │                              │            │
     │  (Costs page or Detail page) │                              │            │
     ├──────────────────────────────┼─────────────────────────────>│            │
     │                              │  X-API-Key required          │<───────────┤
     │<─────────────────────────────┼──────────────────────────────┤  SELECT    │
     │                              │     Return plans             │            │
     │                              │                              │            │
     │  3. Add Custom Plan          │                              │            │
     ├──────────────────────────────┼─────────────────────────────>│            │
     │                              │  X-API-Key required          ├───────────>│
     │                              │                              │  INSERT    │
     │                              │                              │            │
     │  4. Toggle/Delete Plan       │                              │            │
     ├──────────────────────────────┼─────────────────────────────>│            │
     │                              │  X-API-Key required          ├───────────>│
     │                              │                              │  UPDATE/   │
     │                              │                              │  DELETE    │

Tables:
- saas_subscription_providers_meta (Supabase): Provider enabled state per org
- saas_subscription_plans (BigQuery): ALL plan data (seeded + custom)

Authentication:
- Supabase: User session (RLS policies)
- API Service: X-API-Key header (org API key from user.user_metadata)
```

**Key Points:**
1. Supabase ONLY stores provider enable/disable state
2. ALL subscription plan data lives in BigQuery
3. API Service required for all plan operations
4. Org API key (from user metadata) required for API calls
5. If org doesn't have API key, shows onboarding message

### Provider Disable Flow

When a user toggles a provider OFF, the system deletes all associated plans from BigQuery:

```
User toggles provider OFF
    ↓
1. Get all plans for provider (API call)
    ↓
2. Loop through each plan
    ↓
3. DELETE each plan from BigQuery
    ↓
4. Update Supabase meta: is_enabled = false
    ↓
5. Show success: "Provider disabled (3 plans deleted)"
```

**Implementation Details:**
- Function: `disableProvider()` in `actions/subscription-providers.ts`
- Fetches plans via `GET /subscriptions/{org}/providers/{provider}/plans`
- Deletes each plan via `DELETE /subscriptions/{org}/providers/{provider}/plans/{id}`
- Updates Supabase meta table last (ensures cleanup completes)
- Returns count of deleted plans in success message
- Data is permanently removed from BigQuery (not soft-deleted)

**Behavior:**
- **Toggle OFF**: Deletes ALL plans for the provider from BigQuery
- **UI Message**: Shows "provider disabled (X plans deleted)"
- **Data Cleanup**: Plans are fully removed from BigQuery

---

## CSV Seed Data Structure

**File:** `02-api-service/configs/saas/seed/data/saas_subscription_plans.csv`

**Columns (25):**
```
org_slug,subscription_id,provider,plan_name,display_name,category,status,start_date,end_date,billing_cycle,currency,seats,pricing_model,unit_price,yearly_price,discount_type,discount_value,auto_renew,payment_method,invoice_id_last,owner_email,department,renewal_date,contract_id,notes
```

**Column Descriptions:**
| Column | Type | Description |
|--------|------|-------------|
| org_slug | STRING | Organization identifier (populated during seeding) |
| subscription_id | STRING | UUID (auto-generated during seeding) |
| provider | STRING | Provider key (chatgpt_plus, canva, slack) |
| plan_name | STRING | Plan tier (FREE, PRO, TEAM, BUSINESS) |
| display_name | STRING | Human-readable name |
| category | STRING | ai, design, productivity, communication, development |
| status | STRING | pending (default for seeds), active, cancelled, expired |
| start_date | DATE | Subscription start date (nullable) |
| end_date | DATE | Subscription end date (nullable) |
| billing_cycle | STRING | monthly, yearly, quarterly, weekly |
| currency | STRING | USD, EUR, GBP, etc. |
| seats | INT | Number of seats/licenses (seed data uses 0 - users set their own) |
| pricing_model | STRING | per_seat, flat_rate, tiered |
| unit_price | FLOAT | Monthly price per unit |
| yearly_price | FLOAT | Annual price (nullable) |
| discount_type | STRING | percentage, fixed, none |
| discount_value | FLOAT | Discount amount or percentage (nullable) |
| auto_renew | BOOLEAN | Auto-renewal enabled |
| payment_method | STRING | credit_card, invoice, etc. (nullable) |
| invoice_id_last | STRING | Last invoice reference (nullable) |
| owner_email | STRING | Subscription owner email (nullable) |
| department | STRING | Cost center or department (nullable) |
| renewal_date | DATE | Next renewal date (nullable) |
| contract_id | STRING | Contract reference (nullable) |
| notes | STRING | Plan description or additional notes |

**Provider Coverage (28 providers, 76 plans):**

| Category | Providers |
|----------|-----------|
| AI | chatgpt_plus, claude_pro, gemini_advanced, copilot, cursor, windsurf, replit, v0, lovable |
| Design | canva, adobe_cc, figma, miro |
| Productivity | notion, confluence, asana, monday |
| Communication | slack, zoom, teams |
| Development | github, gitlab, jira, linear, vercel, netlify, railway, supabase |

---

## Schema Migration (v9.0 → v10.0)

**Migration Date:** 2025-12-06

### What Changed

The schema was expanded from 14 columns to 25 columns to support enterprise-grade subscription management.

**Columns Added (11 new):**
- `org_slug` - Organization identifier (for multi-tenant support)
- `status` - Subscription status (active, cancelled, expired)
- `start_date` - Subscription start date
- `end_date` - Subscription end date
- `currency` - Currency code (USD, EUR, GBP, etc.)
- `pricing_model` - Pricing model (per_seat, flat_rate, tiered)
- `discount_type` - Type of discount (percentage, fixed, none)
- `discount_value` - Discount amount or percentage
- `auto_renew` - Auto-renewal flag
- `payment_method` - Payment method (credit_card, invoice, etc.)
- `invoice_id_last` - Last invoice reference
- `owner_email` - Subscription owner email
- `department` - Department or cost center
- `renewal_date` - Next renewal date
- `contract_id` - Contract reference

**Columns Renamed (3):**
- `billing_period` → `billing_cycle`
- `yearly_discount_pct` → `discount_type` + `discount_value` (more flexible)
- `is_enabled` → `status` (more granular states)

**Columns Retained (10):**
- `subscription_id` - UUID identifier
- `provider` - Provider key
- `plan_name` - Plan tier
- `display_name` - Human-readable name
- `category` - Category classification
- `seats` - Number of seats
- `unit_price` - Monthly price
- `yearly_price` - Annual price
- `notes` - Additional notes
- `updated_at` - Last update timestamp

### Terminology Updates

| Old Term | New Term | Reason |
|----------|----------|--------|
| `is_enabled` | `status` | More states: active, cancelled, expired |
| `billing_period` | `billing_cycle` | Industry standard terminology |
| `yearly_discount_pct` | `discount_type` + `discount_value` | Supports both percentage and fixed discounts |
| `effective_date` | `start_date` | Clearer meaning |

### Audit Logging

**Audit trail is now centralized in `org_audit_logs` table** (created during bootstrap).

All subscription plan operations (CREATE, UPDATE, DELETE) are automatically logged with:
- Resource type: `SUBSCRIPTION_PLAN`
- Details JSON: contains `changed_fields`, `old_values`, `new_values`
- Full audit trail for SOC2/HIPAA compliance

**See:** `02-api-service/CLAUDE.md` for detailed audit logging documentation.

### Migration Impact

| Component | Impact | Action Required |
|-----------|--------|-----------------|
| CSV Seed Data | Schema mismatch | Update CSV to 25 columns |
| BigQuery Schema | Schema updated | Re-create table or add columns |
| API Service | New fields | Update request/response models |
| Frontend | New fields | Update TypeScript interfaces |
| Tests | Schema mismatch | Update test fixtures |

---

## Supabase Schema

### Table: saas_subscription_providers_meta (ONLY table in Supabase)

**File:** `01-fronted-system/scripts/supabase_db/14_saas_subscription_provider_meta.sql`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | FK to organizations |
| provider_name | VARCHAR(50) | Provider key |
| is_enabled | BOOLEAN | Provider enabled for org |
| enabled_at | TIMESTAMPTZ | When enabled |
| created_at | TIMESTAMPTZ | Auto-set |
| updated_at | TIMESTAMPTZ | Auto-updated |

**Constraint:** UNIQUE(org_id, provider_name)

**RLS Policies:**
- SELECT: All org members can view
- INSERT/UPDATE/DELETE: Owner and Admin only

## Frontend Implementation

### Server Actions

**File:** `01-fronted-system/actions/subscription-providers.ts`

#### Input Validation Functions

All server actions include input validation to prevent injection attacks:

```typescript
// Organization slug validation
const isValidOrgSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

// Provider name validation (2-50 chars, alphanumeric + underscore, no leading/trailing underscore)
const isValidProviderName = (provider: string): boolean => {
  if (!provider || typeof provider !== "string") return false
  const normalized = provider.toLowerCase().trim()
  return /^[a-z0-9][a-z0-9_]{0,48}[a-z0-9]$/.test(normalized) || /^[a-z0-9]{2}$/.test(normalized)
}

// Provider name sanitization
const sanitizeProviderName = (provider: string): string => {
  return provider
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")  // Replace invalid chars with underscore
    .replace(/^_+|_+$/g, "")       // Remove leading/trailing underscores
    .replace(/_+/g, "_")           // Collapse multiple underscores
    .slice(0, 50)                  // Limit length
}
```

#### Supabase Meta Operations

```typescript
listEnabledProviders(orgSlug)        // Get enabled providers from meta
getProviderMeta(orgSlug, provider)   // Get single provider meta
enableProvider(orgSlug, provider)    // Enable + trigger API seed (validates provider name)
                                     // Returns: { success, plans_seeded, error? }
disableProvider(orgSlug, provider)   // Disable provider + DELETE all plans (validates provider name)
                                     // Returns: { success, plans_deleted?, error? }
getAllProviders(orgSlug)             // Get all 28 providers with status
```

#### API Service Operations (BigQuery Plans)

```typescript
getProviderPlans(orgSlug, provider)          // Get plans for one provider (validates provider name)
getAllPlansForCostDashboard(orgSlug)         // Get all plans across providers
createCustomPlan(orgSlug, provider, plan)    // Add custom plan to BigQuery (validates provider name)
updatePlan(orgSlug, provider, planId, updates) // Validates provider name + subscription ID
togglePlan(orgSlug, provider, planId, enabled)
deletePlan(orgSlug, provider, planId)        // Validates provider name + subscription ID
resetProvider(orgSlug, provider)             // Re-seed from CSV (validates provider name)
```

#### TypeScript Interfaces

```typescript
export interface ProviderMeta {
  id: string
  org_id: string
  provider_name: string
  is_enabled: boolean
  enabled_at: string
  created_at: string
  updated_at: string
}

export interface ProviderInfo {
  provider: string
  display_name: string
  category: string
  is_enabled: boolean
  plan_count: number
}

export interface SubscriptionPlan {
  org_slug: string
  subscription_id: string
  provider: string
  plan_name: string
  display_name?: string
  category: string
  status: string // pending, active, cancelled, expired
  start_date?: string
  end_date?: string
  billing_cycle: string // monthly, yearly, quarterly, weekly
  currency: string // USD, EUR, GBP, etc.
  seats: number
  pricing_model: string // per_seat, flat_rate, tiered
  unit_price: number
  yearly_price?: number
  discount_type: string // percentage, fixed, none
  discount_value?: number
  auto_renew: boolean
  payment_method?: string // credit_card, invoice, etc.
  invoice_id_last?: string
  owner_email?: string
  department?: string
  renewal_date?: string
  contract_id?: string
  notes?: string
  updated_at?: string
}

export interface PlanCreate {
  plan_name: string
  display_name?: string
  category?: string
  status?: string // pending, active, cancelled, expired (default: pending for seeds)
  start_date?: string
  end_date?: string
  billing_cycle?: string // monthly, yearly, quarterly, weekly (default: monthly)
  currency?: string // USD, EUR, GBP (default: USD)
  seats?: number
  pricing_model?: string // per_seat, flat_rate, tiered (default: flat_rate)
  unit_price: number
  yearly_price?: number
  discount_type?: string // percentage, fixed, none (default: none)
  discount_value?: number
  auto_renew?: boolean // default: false
  payment_method?: string
  invoice_id_last?: string
  owner_email?: string
  department?: string
  renewal_date?: string
  contract_id?: string
  notes?: string
}

export interface PlanUpdate {
  display_name?: string
  category?: string
  status?: string // pending, active, cancelled, expired
  start_date?: string
  end_date?: string
  billing_cycle?: string
  currency?: string
  seats?: number
  pricing_model?: string
  unit_price?: number
  yearly_price?: number
  discount_type?: string
  discount_value?: number
  auto_renew?: boolean
  payment_method?: string
  invoice_id_last?: string
  owner_email?: string
  department?: string
  renewal_date?: string
  contract_id?: string
  notes?: string
}
```

**DELETED:** `01-fronted-system/actions/saas-subscriptions.ts`
- This file has been removed
- All functions migrated to `subscription-providers.ts`

### Pages

| Route | Purpose | Data Source |
|-------|---------|-------------|
| `/{org}/subscriptions` | Subscription Costs (read-only dashboard) | API Service → BigQuery |
| `/{org}/subscriptions/{provider}` | Provider detail + CRUD plans | API Service → BigQuery |
| `/{org}/settings/integrations/subscriptions` | Manage Subscriptions (enable/disable) | Supabase meta |

### Provider Detail Page Features

| Feature | Description |
|---------|-------------|
| Summary Cards | Monthly Cost, Active Plans, Total Plans |
| Plans Table | Active toggle, Plan Name, Cost, Billing, Seats, Actions |
| Expandable Rows | Click row to see: Yearly Price, Discount %, Storage, Limits, Notes |
| Custom Badge | Purple "Custom" badge for user-added plans |
| Add Custom Subscription | Button in header + footer section |
| Delete Custom Plans | Only custom plans can be deleted (seeded plans protected) |
| Form Reset on Close | Dialog form resets when closed (prevents stale data) |
| Error Handling | Try-catch with user-friendly error messages |
| Input Validation | Prevents negative costs, ensures seats >= 1 |

**Error Handling Pattern (Provider Detail Page):**
```typescript
const handleAdd = async () => {
  // Validate inputs
  if (newPlan.unit_price < 0) {
    setError("Price cannot be negative")
    return
  }
  if ((newPlan.seats ?? 1) < 1) {
    setError("Seats must be at least 1")
    return
  }

  setAdding(true)
  setError(null)

  try {
    const result = await createCustomPlan(orgSlug, provider, { ... })
    if (!result.success) {
      setError(result.error || "Failed to create plan")
      return
    }
    setShowAddDialog(false)
    resetNewPlanForm()  // Reset form after success
    await loadPlans()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    setError(errorMessage)
  } finally {
    setAdding(false)
  }
}
```

### Manage Subscriptions Page Features

| Feature | Description |
|---------|-------------|
| Provider Grid | Card grid of all 28 providers with enable/disable toggle |
| Category Icons | Visual icons for each category (AI, Design, etc.) |
| Plan Count Badge | Shows number of plans for enabled providers |
| Add Custom Provider | Dialog to add completely custom providers |
| Rollback on Failure | If plan creation fails, provider is disabled (rollback) |
| Form Reset on Close | Custom provider form resets when dialog closes |
| Success Messages | Auto-dismiss success messages after 5 seconds |
| Show More/Less | Pagination with "Show N more providers" / "Show less" |

**Rollback Pattern (Custom Provider):**
```typescript
const handleAddCustomProvider = async () => {
  try {
    // 1. Enable provider in Supabase
    const enableResult = await enableProvider(orgSlug, providerId)
    if (!enableResult.success) {
      setError(enableResult.error || "Failed to enable custom provider")
      return
    }

    // 2. Create plan in BigQuery
    const planResult = await createCustomPlan(orgSlug, providerId, { ... })
    if (!planResult.success) {
      // ROLLBACK: Disable provider if plan creation fails
      await disableProvider(orgSlug, providerId)
      setError(planResult.error || "Failed to create custom plan")
      return
    }

    // Success
    resetCustomForm()
    await loadSubscriptionProviders()
  } catch (error) {
    setError(error instanceof Error ? error.message : "An unexpected error occurred")
  }
}
```

### Costs Dashboard Page Features

| Feature | Description |
|---------|-------------|
| Summary Cards | Monthly Cost, Annual Cost, Active Plans, Categories |
| Plans Table | Aggregated view from all enabled providers |
| Provider Links | Click provider name to go to detail page |
| Error Handling | Shows onboarding message if API key missing |

---

## API Service Endpoints

**File:** `02-api-service/src/app/routers/subscription_plans.py`

**Router registered at:** `/api/v1/subscriptions`

```
GET    /subscriptions/{org}/providers
       → List all 28 providers with enabled status

GET    /subscriptions/{org}/all-plans
       → Get ALL plans across ALL enabled providers (for Costs Dashboard)
       → Returns: { plans: SubscriptionPlan[], summary: { total_monthly_cost, total_annual_cost, ... } }

POST   /subscriptions/{org}/providers/{provider}/enable
       → Enable provider + seed default plans to BigQuery

POST   /subscriptions/{org}/providers/{provider}/disable
       → Disable provider (is_enabled=false in Supabase meta)

GET    /subscriptions/{org}/providers/{provider}/plans
       → List plans from BigQuery for this provider

POST   /subscriptions/{org}/providers/{provider}/plans
       → Add custom plan to BigQuery

PUT    /subscriptions/{org}/providers/{provider}/plans/{id}
       → Update plan in BigQuery

DELETE /subscriptions/{org}/providers/{provider}/plans/{id}
       → Delete plan from BigQuery (custom only)

POST   /subscriptions/{org}/providers/{provider}/toggle/{id}
       → Toggle plan status in BigQuery (active ↔ cancelled)

POST   /subscriptions/{org}/providers/{provider}/reset
       → Force re-seed defaults from CSV
```

### Costs API Endpoints (Polars-Powered)

```
GET    /costs/{org}/saas-subscriptions
       → Get all SaaS subscription costs with summary

GET    /costs/{org}/saas-subscriptions/summary
       → Get cost summary only (monthly, annual, by category)

GET    /costs/{org}/saas-subscriptions/by-provider
       → Get costs grouped by provider

GET    /costs/{org}/saas-subscriptions/by-category
       → Get costs grouped by category

GET    /costs/{org}/saas-subscriptions/trends
       → Get cost trends over time (daily/weekly/monthly)

GET    /costs/{org}/saas-subscriptions/{subscription_id}
       → Get costs for a specific subscription
```

**Authentication:** X-API-Key header required for ALL API endpoints

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| Supabase saas_subscription_providers_meta table | Supabase | 14_saas_subscription_provider_meta.sql |
| Provider server actions (unified) | Frontend | actions/subscription-providers.ts |
| Input validation (provider name, subscription ID) | Frontend | actions/subscription-providers.ts |
| Provider name sanitization | Frontend | actions/subscription-providers.ts |
| Costs page (API service) | Frontend | app/[orgSlug]/subscriptions/page.tsx |
| Provider detail page (API service) | Frontend | app/[orgSlug]/subscriptions/[provider]/page.tsx |
| Provider detail page error handling | Frontend | app/[orgSlug]/subscriptions/[provider]/page.tsx |
| Provider detail page form reset on close | Frontend | app/[orgSlug]/subscriptions/[provider]/page.tsx |
| Manage Subscriptions page | Frontend | app/[orgSlug]/settings/integrations/subscriptions/page.tsx |
| Manage page rollback on API failure | Frontend | app/[orgSlug]/settings/integrations/subscriptions/page.tsx |
| Manage page form reset on dialog close | Frontend | app/[orgSlug]/settings/integrations/subscriptions/page.tsx |
| Sidebar with Subscriptions menu | Frontend | components/dashboard-sidebar.tsx |
| Subscription Plans router | API Service | src/app/routers/subscription_plans.py |
| CSV seed data (25 cols, 76 plans, status=pending) | API Service | configs/saas/seed/data/saas_subscription_plans.csv |
| Schema: saas_subscription_plans (28 cols, +3 multi-currency) | API Service | configs/setup/organizations/onboarding/schemas/ |
| Schema: saas_subscription_plan_costs_daily (18 cols) | API Service | configs/setup/organizations/onboarding/schemas/ |
| Schema: cost_data_standard_1_3 (78 cols FOCUS 1.3) | API Service | configs/setup/organizations/onboarding/schemas/ |
| Procedure: sp_calculate_saas_subscription_plan_costs_daily | Pipeline | configs/system/procedures/subscription/ |
| Procedure: sp_convert_saas_costs_to_focus_1_3 | Pipeline | configs/system/procedures/subscription/ |
| Procedure: sp_run_saas_subscription_costs_pipeline | Pipeline | configs/system/procedures/subscription/ |
| Info banner - cost update timing | Frontend | app/[orgSlug]/subscriptions/[provider]/page.tsx |
| Status validation in enable_provider | API Service | src/app/routers/subscription_plans.py:615-619 |
| Date type handling in UPDATE query | API Service | src/app/routers/subscription_plans.py:1131 |
| Audit logger JSON column fix | API Service | src/core/utils/audit_logger.py:111 |
| Costs API endpoints (6 endpoints) | API Service | src/app/routers/costs.py |

### REMOVED

| Component | Reason |
|-----------|--------|
| `saas_subscriptions` table (Supabase) | ALL data now in BigQuery |
| `actions/saas-subscriptions.ts` | Merged into subscription-providers.ts |

### To Be Implemented

| Component | Service | Priority |
|-----------|---------|----------|
| Daily scheduler for cost pipeline | Cloud Scheduler | P2 |
| Auto-seed on org onboarding | API Service | P3 |
| Bulk provider enable | API Service | P3 |

---

## Cost Calculation Logic

**Daily Rate (based on billing_cycle):**
- yearly: `price / 365`
- monthly: `price / 30.4375`
- quarterly: `price / 91.25`
- weekly: `price / 7`

**Discount Application:**
```
if discount_type == "percentage":
    discount_multiplier = 1 - (discount_value / 100)
elif discount_type == "fixed":
    discount_amount = discount_value
    discount_multiplier = 1 (apply fixed after)
else: // none
    discount_multiplier = 1
```

**Final Cost:**
```
if pricing_model == "per_seat":
    base_cost = unit_price × seats
elif pricing_model == "flat_rate":
    base_cost = unit_price
elif pricing_model == "tiered":
    base_cost = unit_price (calculated externally)

if discount_type == "percentage":
    final_cost = base_cost × discount_multiplier
elif discount_type == "fixed":
    final_cost = base_cost - discount_value
else:
    final_cost = base_cost
```

**Projections:**
- weekly: `daily_rate × 7`
- monthly: `daily_rate × 30.4375`
- yearly: `daily_rate × 365`

---

## Pipeline Procedures

### Architecture

All procedures live in the central `{project_id}.organizations` dataset but operate on per-customer datasets.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PROCEDURE ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  CENTRAL DATASET: {project_id}.organizations                                     │
│  ├── Procedures (created ONCE, called for each customer):                        │
│  │   ├── sp_calculate_saas_subscription_plan_costs_daily                        │
│  │   ├── sp_convert_saas_costs_to_focus_1_3                                     │
│  │   └── sp_run_saas_subscription_costs_pipeline (orchestrator)                 │
│  │                                                                               │
│  └── Bootstrap Tables                                                            │
│      └── org_audit_logs (centralized audit trail for all orgs - 15 tables)      │
│                                                                                  │
│  PER-CUSTOMER DATASETS: {project_id}.{org_slug}_prod                            │
│  └── Tables (created during onboarding):                                         │
│      ├── saas_subscription_plans (dimension - user-managed subscriptions)        │
│      ├── saas_subscription_plan_costs_daily (fact - calculated by pipeline)      │
│      └── cost_data_standard_1_3 (FOCUS 1.3 - standardized costs)                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Procedure Details

#### 1. sp_calculate_saas_subscription_plan_costs_daily (Stage 1)

**Purpose:** Expands active subscription plans into daily amortized cost rows.

```sql
CALL `{project_id}.organizations`.sp_calculate_saas_subscription_plan_costs_daily(
  'your-gcp-project-id',    -- p_project_id
  'acme_corp_prod',     -- p_dataset_id (customer dataset)
  DATE('2024-01-01'),   -- p_start_date
  DATE('2024-01-31')    -- p_end_date
);
```

**Logic:**
1. Read active subscriptions from `saas_subscription_plans` WHERE status = 'active'
2. Apply pricing model: `PER_SEAT` (unit_price × seats) or `FLAT_FEE` (unit_price only)
3. Apply discounts: `percent` (1 - discount_value/100) or `fixed` (subtract discount_value)
4. Calculate daily cost: `cycle_cost / days_in_cycle`
5. Write to `saas_subscription_plan_costs_daily` (DELETE + INSERT for idempotency)

**Daily Cost Formula:**
```
Monthly: cycle_cost / EXTRACT(DAY FROM LAST_DAY(day))
Annual:  cycle_cost / days_in_year (365 or 366 for leap years)
```

#### 2. sp_convert_saas_costs_to_focus_1_3 (Stage 2)

**Purpose:** Maps daily SaaS subscription costs to FinOps FOCUS 1.3 standard schema.

```sql
CALL `{project_id}.organizations`.sp_convert_saas_costs_to_focus_1_3(
  'your-gcp-project-id',    -- p_project_id
  'acme_corp_prod',     -- p_dataset_id (customer dataset)
  DATE('2024-01-01'),   -- p_start_date
  DATE('2024-01-31')    -- p_end_date
);
```

**Logic:**
1. Read from `saas_subscription_plan_costs_daily`
2. Map fields to FOCUS 1.3 columns:
   - `ChargeCategory = 'Subscription'`
   - `ChargeClass = 'Recurring'`
   - `ServiceCategory = 'SaaS'`
   - `SourceSystem = 'saas_subscription_costs_daily'`
3. DELETE existing records for date range WHERE SourceSystem = 'saas_subscription_costs_daily'
4. INSERT mapped data to `cost_data_standard_1_3`

#### 3. sp_run_saas_subscription_costs_pipeline (Orchestrator)

**Purpose:** Runs both stages in sequence for a customer.

```sql
CALL `{project_id}.organizations`.sp_run_saas_subscription_costs_pipeline(
  'your-gcp-project-id',    -- p_project_id
  'acme_corp_prod',     -- p_dataset_id (customer dataset)
  DATE('2024-01-01'),   -- p_start_date
  DATE('2024-01-31')    -- p_end_date
);
```

**Flow:**
```
sp_run_saas_subscription_costs_pipeline
    │
    ├── 1. Validate parameters (NULL checks, date range validation)
    │
    ├── 2. CALL sp_calculate_saas_subscription_plan_costs_daily
    │       └── Stage 1: Calculate daily amortized costs
    │
    ├── 3. CALL sp_convert_saas_costs_to_focus_1_3
    │       └── Stage 2: Convert to FOCUS 1.3 standard
    │
    └── 4. Return completion status
```

### Complete Pipeline Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL TRIGGER LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                         CLOUD SCHEDULER (GCP)                                    │    │
│  │                                                                                  │    │
│  │  Job: saas-subscription-costs-daily                                              │    │
│  │  Schedule: 0 3 * * * (Daily at 03:00 UTC)                                        │    │
│  │  Target: Cloud Run / Pipeline Service                                            │    │
│  │  Payload: { "trigger_type": "scheduled", "date": "YYYY-MM-DD" }                 │    │
│  │                                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                                │
│                   ┌─────────────────────┴─────────────────────┐                         │
│                   │                                           │                         │
│                   v                                           v                         │
│  ┌─────────────────────────────────┐      ┌─────────────────────────────────┐          │
│  │      SCHEDULED TRIGGER          │      │        AD-HOC TRIGGER           │          │
│  │   (Automated Daily Run)         │      │     (Manual/API Request)        │          │
│  │                                 │      │                                 │          │
│  │  POST /scheduler/trigger        │      │  POST /pipelines/run/{org}/     │          │
│  │  Iterates all active orgs       │      │  saas_subscription/costs/       │          │
│  │                                 │      │  saas_cost                      │          │
│  └─────────────────────────────────┘      └─────────────────────────────────┘          │
│                   │                                           │                         │
│                   └─────────────────────┬─────────────────────┘                         │
│                                         │                                                │
└─────────────────────────────────────────┼────────────────────────────────────────────────┘
                                          │
                                          v
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              PIPELINE SERVICE LAYER (Port 8001)                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                      PIPELINE EXECUTOR                                           │    │
│  │                                                                                  │    │
│  │  Config: configs/saas_subscription/costs/saas_cost.yml                           │    │
│  │  Pipeline ID: {org_slug}-saas-subscription-costs                                 │    │
│  │                                                                                  │    │
│  │  1. Load pipeline configuration                                                  │    │
│  │  2. Resolve context variables:                                                   │    │
│  │     • ${project_id} → your-gcp-project-id                                           │    │
│  │     • ${org_dataset} → {org_slug}_prod                                          │    │
│  │     • ${start_date} → Pipeline parameter or yesterday                           │    │
│  │     • ${end_date} → Pipeline parameter or yesterday                             │    │
│  │  3. Execute step: run_cost_pipeline                                              │    │
│  │                                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                                │
│                                         v                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                   PROCESSOR: generic.procedure_executor                          │    │
│  │                                                                                  │    │
│  │  File: src/core/processors/generic/procedure_executor.py                         │    │
│  │                                                                                  │    │
│  │  1. Build CALL statement with parameters                                         │    │
│  │  2. Convert parameter types (STRING, DATE, etc.)                                 │    │
│  │  3. Execute BigQuery procedure call                                              │    │
│  │                                                                                  │    │
│  │  CALL `{project_id}.organizations`.sp_run_saas_subscription_costs_pipeline(      │    │
│  │    @p_project_id,   -- 'your-gcp-project-id'                                         │    │
│  │    @p_dataset_id,   -- '{org_slug}_prod'                                         │    │
│  │    @p_start_date,   -- DATE('2024-01-15')                                        │    │
│  │    @p_end_date      -- DATE('2024-01-15')                                        │    │
│  │  )                                                                               │    │
│  │                                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           v
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              BIGQUERY PROCEDURE LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │          ORCHESTRATOR: sp_run_saas_subscription_costs_pipeline                   │    │
│  │          Location: {project_id}.organizations                                    │    │
│  │                                                                                  │    │
│  │  1. Validate parameters (NULL checks, date range ≤ 366 days)                    │    │
│  │  2. CALL Stage 1 procedure                                                       │    │
│  │  3. CALL Stage 2 procedure                                                       │    │
│  │  4. Return completion status                                                     │    │
│  │                                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                                │
│              ┌──────────────────────────┴──────────────────────────┐                    │
│              │                                                      │                    │
│              v                                                      v                    │
│  ┌───────────────────────────────────────────┐  ┌───────────────────────────────────────┐
│  │  STAGE 1: Calculate Daily Costs           │  │  STAGE 2: Convert to FOCUS 1.3       │
│  │  sp_calculate_saas_subscription_plan_     │  │  sp_convert_saas_costs_to_focus_1_3  │
│  │  costs_daily                              │  │                                       │
│  │                                           │  │  INPUT:                               │
│  │  INPUT:                                   │  │  └── saas_subscription_plan_costs_   │
│  │  └── saas_subscription_plans              │  │      daily                            │
│  │      (dimension table)                    │  │                                       │
│  │                                           │  │  PROCESS:                             │
│  │  PROCESS:                                 │  │  ┌─────────────────────────────────┐ │
│  │  ┌─────────────────────────────────────┐  │  │  │ 1. BEGIN TRANSACTION             │ │
│  │  │ 1. BEGIN TRANSACTION                │  │  │  │                                 │ │
│  │  │                                     │  │  │  │ 2. DELETE existing records      │ │
│  │  │ 2. DELETE existing records          │  │  │  │    WHERE ChargePeriodStart      │ │
│  │  │    WHERE cost_date BETWEEN          │  │  │  │    BETWEEN start AND end        │ │
│  │  │    start_date AND end_date          │  │  │  │    AND SourceSystem =           │ │
│  │  │                                     │  │  │  │    'saas_subscription_costs_    │ │
│  │  │ 3. Read active subscriptions:       │  │  │  │    daily'                       │ │
│  │  │    • WHERE status = 'active'        │  │  │  │                                 │ │
│  │  │    • start_date <= end_date param   │  │  │  │ 3. INSERT mapped data:          │ │
│  │  │    • end_date >= start_date param   │  │  │  │    ┌───────────────────────────┐│ │
│  │  │                                     │  │  │  │    │ FOCUS 1.3 Mapping:        ││ │
│  │  │ 4. Apply pricing model:             │  │  │  │    │ • ChargeCategory =        ││ │
│  │  │    ┌─────────────────────────────┐  │  │  │  │    │   'Subscription'          ││ │
│  │  │    │ PER_SEAT:                   │  │  │  │  │    │ • ChargeClass =           ││ │
│  │  │    │   cycle_cost = unit_price   │  │  │  │  │    │   'Recurring'             ││ │
│  │  │    │              × seats        │  │  │  │  │    │ • ServiceCategory =       ││ │
│  │  │    │                             │  │  │  │  │    │   'SaaS'                  ││ │
│  │  │    │ FLAT_FEE:                   │  │  │  │  │    │ • BilledCost =            ││ │
│  │  │    │   cycle_cost = unit_price   │  │  │  │  │    │   daily_cost              ││ │
│  │  │    └─────────────────────────────┘  │  │  │  │    │ • SourceSystem =          ││ │
│  │  │                                     │  │  │  │    │   'saas_subscription_     ││ │
│  │  │ 5. Apply discounts:                 │  │  │  │    │   costs_daily'            ││ │
│  │  │    ┌─────────────────────────────┐  │  │  │  │    │ • SourceRecordId =        ││ │
│  │  │    │ percent: cycle_cost ×       │  │  │  │  │    │   subscription_id         ││ │
│  │  │    │   (1 - discount_value/100)  │  │  │  │  │    └───────────────────────────┘│ │
│  │  │    │                             │  │  │  │  │                                 │ │
│  │  │    │ fixed: cycle_cost -         │  │  │  │  │ 4. COMMIT TRANSACTION           │ │
│  │  │    │   discount_value            │  │  │  │  └─────────────────────────────────┘ │
│  │  │    └─────────────────────────────┘  │  │  │                                       │
│  │  │                                     │  │  │  OUTPUT:                              │
│  │  │ 6. Calculate daily cost:            │  │  │  └── cost_data_standard_1_3          │
│  │  │    ┌─────────────────────────────┐  │  │  │      (78 columns FOCUS 1.3)          │
│  │  │    │ monthly:                    │  │  │  │                                       │
│  │  │    │   daily = cycle_cost /      │  │  │  │  IDEMPOTENCY:                         │
│  │  │    │     days_in_month           │  │  │  │  └── Only affects records where      │
│  │  │    │                             │  │  │  │      SourceSystem = 'saas_           │
│  │  │    │ annual:                     │  │  │  │      subscription_costs_daily'       │
│  │  │    │   daily = cycle_cost /      │  │  │  │      Other cost sources preserved    │
│  │  │    │     days_in_year            │  │  │  │                                       │
│  │  │    │   (365 or 366 for leap)     │  │  │  └───────────────────────────────────────┘
│  │  │    └─────────────────────────────┘  │  │
│  │  │                                     │  │
│  │  │ 7. Generate date series:            │  │
│  │  │    UNNEST(GENERATE_DATE_ARRAY(      │  │
│  │  │      start_date, end_date)) AS day  │  │
│  │  │                                     │  │
│  │  │ 8. Calculate run rates:             │  │
│  │  │    • monthly_run_rate =             │  │
│  │  │      daily × days_in_month          │  │
│  │  │    • annual_run_rate =              │  │
│  │  │      daily × days_in_year           │  │
│  │  │                                     │  │
│  │  │ 9. INSERT to target table           │  │
│  │  │                                     │  │
│  │  │ 10. COMMIT TRANSACTION              │  │
│  │  └─────────────────────────────────────┘  │
│  │                                           │
│  │  OUTPUT:                                  │
│  │  └── saas_subscription_plan_costs_daily   │
│  │      (18 columns, partitioned by         │
│  │       cost_date)                          │
│  │                                           │
│  └───────────────────────────────────────────┘
│                                                                                          │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           v
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              OUTPUT DATA LAYER                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  Dataset: {project_id}.{org_slug}_prod                                                  │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                    saas_subscription_plan_costs_daily                            │    │
│  │                                                                                  │    │
│  │  Partition: DAY on cost_date                                                     │    │
│  │  Cluster: org_slug, subscription_id                                              │    │
│  │                                                                                  │    │
│  │  Sample Row:                                                                     │    │
│  │  ┌────────────┬───────────┬─────────────┬─────────────┬───────────┬──────────┐  │    │
│  │  │ cost_date  │ provider  │ plan_name   │ daily_cost  │ seats     │ cycle_   │  │    │
│  │  │            │           │             │             │           │ cost     │  │    │
│  │  ├────────────┼───────────┼─────────────┼─────────────┼───────────┼──────────┤  │    │
│  │  │ 2024-01-15 │ canva     │ PRO         │ 0.49        │ 10        │ 15.00    │  │    │
│  │  │ 2024-01-15 │ slack     │ BUSINESS    │ 4.92        │ 50        │ 150.00   │  │    │
│  │  │ 2024-01-15 │ openai    │ PLUS        │ 0.66        │ 5         │ 100.00   │  │    │
│  │  └────────────┴───────────┴─────────────┴─────────────┴───────────┴──────────┘  │    │
│  │                                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                                │
│                                         v                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                         cost_data_standard_1_3                                   │    │
│  │                      (FinOps FOCUS 1.3 Standard)                                 │    │
│  │                                                                                  │    │
│  │  Partition: DAY on ChargePeriodStart                                             │    │
│  │  Cluster: SubAccountId, ServiceProviderName                                      │    │
│  │                                                                                  │    │
│  │  Unified Cost View - Aggregates:                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐    │    │
│  │  │ SourceSystem                    │ Description                           │    │    │
│  │  ├─────────────────────────────────┼───────────────────────────────────────┤    │    │
│  │  │ saas_subscription_costs_daily   │ SaaS subscription costs (this pipe)   │    │    │
│  │  │ gcp_billing_export              │ GCP cloud costs                       │    │    │
│  │  │ openai_usage_daily              │ OpenAI API usage costs                │    │    │
│  │  │ anthropic_usage_daily           │ Anthropic API usage costs             │    │    │
│  │  └─────────────────────────────────┴───────────────────────────────────────┘    │    │
│  │                                                                                  │    │
│  │  All sources conform to FOCUS 1.3 → Single dashboard for all costs              │    │
│  │                                                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           v
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CONSUMPTION LAYER                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐        │
│  │     DASHBOARDS        │  │      ANALYTICS        │  │       REPORTS         │        │
│  │                       │  │                       │  │                       │        │
│  │  • Cost Overview      │  │  • Trend Analysis     │  │  • Monthly Summaries  │        │
│  │  • Provider Breakdown │  │  • Cost Forecasting   │  │  • Department Reports │        │
│  │  • Department Costs   │  │  • Anomaly Detection  │  │  • Budget vs Actual   │        │
│  │  • Subscription Mgmt  │  │  • Usage Patterns     │  │  • Cost Allocation    │        │
│  │                       │  │                       │  │                       │        │
│  └───────────────────────┘  └───────────────────────┘  └───────────────────────┘        │
│                                                                                          │
│  Query Example:                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │  SELECT ServiceName, SUM(BilledCost) as total_cost                              │    │
│  │  FROM cost_data_standard_1_3                                                     │    │
│  │  WHERE ChargePeriodStart BETWEEN '2024-01-01' AND '2024-01-31'                  │    │
│  │  GROUP BY ServiceName                                                            │    │
│  │  ORDER BY total_cost DESC                                                        │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### How to Run

#### Daily Run (Scheduler)

Pipeline service scheduler calls for each active customer:

```sql
-- For each active org
CALL `your-gcp-project-id.organizations`.sp_run_saas_subscription_costs_pipeline(
  'your-gcp-project-id',
  'acme_corp_prod',
  DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),
  DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
);
```

#### Ad-hoc Run (API)

```bash
curl -X POST http://localhost:8001/api/v1/pipelines/run/acme_corp/subscription/cost/saas_cost \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2024-01-01",
    "end_date": "2024-01-31"
  }'
```

#### Backfill Run (Full Year)

```sql
CALL `your-gcp-project-id.organizations`.sp_run_saas_subscription_costs_pipeline(
  'your-gcp-project-id',
  'acme_corp_prod',
  DATE('2024-01-01'),
  DATE('2024-12-31')
);
```

#### Automatic Cost Pipeline Triggering (v12.3)

**ALL subscription changes automatically trigger the cost pipeline** to keep YTD costs up-to-date. This ensures dashboard data is always accurate without manual intervention.

**Triggered On:**

| Action | Date Range | Description |
|--------|------------|-------------|
| **Create Plan** | `start_date` → today | New plan added (backdated or future) |
| **Create Provider+Plan** | `start_date` → today | New provider enabled with initial plan |
| **Edit Plan** | Month start → today | Plan price, quantity, or billing cycle changed |
| **End Subscription** | Month start → today | Plan cancelled (recalculates without ended plan) |

**How It Works:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     USER MODIFIES SUBSCRIPTION                              │
│                                                                             │
│  Actions: Create | Edit | End                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CHANGE APPLIED IN BigQuery                              │
│                                                                             │
│  saas_subscription_plans updated/inserted                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DETERMINE PIPELINE DATE RANGE                           │
│                                                                             │
│  CREATE:  start_date (from plan) → today                                   │
│  EDIT:    month start (1st of current month) → today                       │
│  END:     month start (1st of current month) → today                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TRIGGER COST PIPELINE                                   │
│                                                                             │
│  POST /api/v1/pipelines/run/{org}/saas_subscription/costs/saas_cost        │
│  Body: { "start_date": "{date_range_start}", "end_date": "{today}" }       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DAILY COSTS REGENERATED                                 │
│                                                                             │
│  saas_subscription_plan_costs_daily rows updated                           │
│  (reflects new/edited/ended plans)                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DASHBOARD SHOWS ACCURATE YTD                            │
│                                                                             │
│  Cost charts immediately reflect the change                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation Files:**

| File | Function | Purpose |
|------|----------|---------|
| `01-fronted-system/actions/subscription-providers.ts` | `triggerCostBackfill()` | Triggers pipeline with date range |
| `01-fronted-system/actions/subscription-providers.ts` | `getMonthStart()` | Returns 1st day of current month |
| `01-fronted-system/actions/subscription-providers.ts` | `isDateInPast()` | Detects backdated start dates |
| `01-fronted-system/actions/subscription-providers.ts` | `createCustomPlan()` | Triggers pipeline after creation |
| `01-fronted-system/actions/subscription-providers.ts` | `createCustomProviderWithPlan()` | Triggers pipeline for new providers |
| `01-fronted-system/actions/subscription-providers.ts` | `editPlanWithVersion()` | Triggers pipeline after edit |
| `01-fronted-system/actions/subscription-providers.ts` | `endSubscription()` | Triggers pipeline after ending |
| `01-fronted-system/actions/subscription-providers.ts` | `runCostBackfill()` | Manual backfill server action |

**Server Action - Manual Backfill:**

```typescript
import { runCostBackfill } from "@/actions/subscription-providers"

// Backfill from Jan 1, 2025 to today
const result = await runCostBackfill("acme_corp", "2025-01-01")
// Result: { success: true, message: "Cost backfill triggered from 2025-01-01 to 2025-12-17" }
```

**API - Manual Backfill:**

```bash
# Get org API key first
ORG_API_KEY=$(curl -s "http://localhost:8000/api/v1/admin/dev/api-key/{org_slug}" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq -r '.api_key')

# Run backfill pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2025-01-01", "end_date": "2025-12-17"}'
```

**User Feedback:**

The UI shows pipeline status after each action:
- **Create:** "Subscription added! Costs calculated from {start_date} to today"
- **Edit:** "Subscription updated! Costs recalculated for this month"
- **End:** "Subscription ended! Costs recalculated (subscription ended on {end_date})"

**Error Handling:**

If pipeline fails, the subscription change is still applied but a warning is shown:
- Toast: "{action} completed but cost update failed: {error}"
- User can manually trigger backfill later via API or wait for daily scheduled run

### Handling Subscription Changes (SCD Type 2)

#### Cancellation

To cancel a subscription (preserve historical data):

1. **Do NOT delete** the row
2. Set `end_date` to the last valid day
3. Set `status` to 'cancelled'
4. Pipeline calculates costs up to `end_date`

```sql
UPDATE saas_subscription_plans
SET end_date = '2024-12-31', status = 'cancelled'
WHERE subscription_id = 'sub_123';
```

#### Changing Seats

To change seat count (preserve cost accuracy):

1. **Close the old row**: Set `end_date` to today
2. **Create new row**: Insert with `start_date` = tomorrow and new seat count

### Procedure Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_calculate_saas_subscription_plan_costs_daily.sql` | Stage 1 procedure |
| `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_convert_saas_costs_to_focus_1_3.sql` | Stage 2 procedure |
| `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_run_saas_subscription_costs_pipeline.sql` | Orchestrator procedure |

### Pipeline Service Integration

**Config Path:** `03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml`

**Processor:** `generic.procedure_executor` - Executes BigQuery stored procedures with dynamic parameters.

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
        dataset: organizations  # Central dataset
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
        - name: p_end_date
          type: DATE
          value: "${end_date}"
```

**Run Pipeline via API:**
```bash
curl -X POST http://localhost:8001/api/v1/pipelines/run/{org_slug}/saas_subscription/costs/saas_cost \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date": "2024-01-01", "end_date": "2024-01-31"}'
```

---

## Error Handling

### When Org API Key is Missing

If the organization hasn't completed backend onboarding (no API key in user metadata):

**Costs Page:** Shows warning card with link to Settings > Onboarding
**Provider Detail Page:** Shows warning card with link to Settings > Onboarding

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠ Organization API key not found. Please complete             │
│   organization onboarding.                                     │
│                                                                │
│   Please complete organization onboarding in Settings >        │
│   Onboarding to enable subscription tracking.                  │
└────────────────────────────────────────────────────────────────┘
```

---

## Test Files

| File | Purpose |
|------|---------|
| `01-fronted-system/tests/13-saas-subscription-providers.test.ts` | Frontend provider + plans tests |
| `02-api-service/tests/test_05_saas_subscription_providers.py` | API endpoint tests |
| `03-data-pipeline-service/tests/test_05_saas_subscription_pipelines.py` | Pipeline tests |

---

## Migration Checklist

To complete the architecture migration:

### Frontend
- [x] Update `subscription-providers.ts` with `getAllPlansForCostDashboard()`
- [x] Update `subscriptions/page.tsx` to use API service
- [x] Update `subscriptions/[provider]/page.tsx` to use API service
- [x] Update `settings/integrations/subscriptions/page.tsx` to use `createCustomPlan`
- [x] Delete `actions/saas-subscriptions.ts`

### Schema (v10.0)
- [x] Create `saas_subscription_plans.json` (28 columns, +3 multi-currency audit fields)
- [x] Create `saas_subscription_plan_costs_daily.json` (18 columns)
- [x] Create `cost_data_standard_1_3.json` (78 columns FOCUS 1.3)
- [x] Audit logging via centralized `org_audit_logs` table (15 bootstrap tables)
- [x] Update seed CSV to 25 columns

### Pipeline Procedures
- [x] Create `sp_calculate_saas_subscription_plan_costs_daily.sql`
- [x] Create `sp_convert_saas_costs_to_focus_1_3.sql`
- [x] Create `sp_run_saas_subscription_costs_pipeline.sql`
- [x] Create procedure management API endpoint (`/api/v1/procedures/*`)
- [x] Create pipeline config `saas_cost.yml`
- [x] Create `generic.procedure_executor` processor
- [ ] Set up daily scheduler (Cloud Scheduler configuration)

---

## File References

### Provider Files (Supabase metadata)

| File | Purpose |
|------|---------|
| `01-fronted-system/scripts/supabase_db/14_saas_subscription_provider_meta.sql` | Provider enable/disable meta table |

### Plan Files (BigQuery data)

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/subscription_plans.py` | API endpoints for plan CRUD |
| `02-api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plans.json` | BigQuery schema (28 cols, +3 multi-currency) |
| `02-api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plan_costs_daily.json` | Daily costs schema (18 cols) |
| `02-api-service/configs/setup/organizations/onboarding/schemas/cost_data_standard_1_3.json` | FOCUS 1.3 schema (67 cols) |
| `02-api-service/configs/saas/seed/data/saas_subscription_plans.csv` | Seed data (25 cols, 76 plans, status=pending) |
| `02-api-service/src/app/routers/costs.py` | Costs API endpoints (Polars-powered) |
| `02-api-service/src/core/utils/audit_logger.py` | Audit logging with JSON column support |

### Pipeline Files (Cost Calculation)

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_calculate_saas_subscription_plan_costs_daily.sql` | Stage 1: Daily cost calculation |
| `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_convert_saas_costs_to_focus_1_3.sql` | Stage 2: FOCUS 1.3 conversion |
| `03-data-pipeline-service/configs/system/procedures/saas_subscription/sp_run_saas_subscription_costs_pipeline.sql` | Orchestrator procedure |
| `03-data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml` | Pipeline config |
| `03-data-pipeline-service/src/core/processors/generic/procedure_executor.py` | Procedure executor processor |
| `1-PRE-ANALLISYS/finops_subscription_pipeline_sql/README.md` | Pipeline architecture docs |

### Frontend Files

| File | Purpose |
|------|---------|
| `01-fronted-system/lib/saas-providers.ts` | Static provider list (COMMON_SAAS_PROVIDERS array) |
| `01-fronted-system/actions/subscription-providers.ts` | ALL subscription actions (providers + plans) |
| `01-fronted-system/app/[orgSlug]/subscriptions/page.tsx` | Costs dashboard (all plans) |
| `01-fronted-system/app/[orgSlug]/subscriptions/[provider]/page.tsx` | Provider detail page (plans CRUD) |
| `01-fronted-system/app/[orgSlug]/settings/integrations/subscriptions/page.tsx` | Manage providers (enable/disable) |
| `01-fronted-system/components/dashboard-sidebar.tsx` | Sidebar with Integrations → Subscription Providers submenu |

---

## Changelog

### v12.2 (2025-12-14)

**Multi-Currency Support:**
- Template prices displayed in org's default currency (converted from USD)
- Currency field locked to org default in add forms (consistency)
- Audit trail fields added: `source_currency`, `source_price`, `exchange_rate_used`
- Original USD price shown as reference when org uses different currency

**New Files:**
| File | Purpose |
|------|---------|
| `lib/currency/exchange-rates.ts` | Fixed exchange rates, conversion utilities |
| `app/[orgSlug]/subscriptions/[provider]/add/page.tsx` | Template selection page |
| `app/[orgSlug]/subscriptions/[provider]/add/custom/page.tsx` | Custom plan form |
| `app/[orgSlug]/subscriptions/[provider]/[subscriptionId]/edit/page.tsx` | Edit subscription |
| `app/[orgSlug]/subscriptions/[provider]/[subscriptionId]/end/page.tsx` | End subscription |
| `app/[orgSlug]/subscriptions/[provider]/success/page.tsx` | Success page |

**UI Changes:**
- Replaced all modal dialogs with dedicated pages (better UX)
- Added breadcrumb navigation
- Added success confirmation page with action-based messaging
- Currency conversion info card shows original USD price from templates

**Interface Updates:**
- `PlanCreate` interface: Added `source_currency`, `source_price`, `exchange_rate_used`
- `SubscriptionPlan` interface: Added audit trail fields

**Exchange Rates (USD base):**
- 16 currencies supported: USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD, AED, SAR, QAR, KWD, BHD, OMR
- Rates are fixed (update monthly via admin)
- Conversion utility: `convertFromUSD()`, `convertCurrency()`, `convertWithAudit()`

### v12.0 (2025-12-08)

**Status Value Changes:**
- Added `pending` status for newly seeded plans (default for all seed data)
- Seeded plans now start as `pending` instead of `active`
- Users must activate plans they want to track for cost calculation
- Only `active` plans are included in cost calculations by the pipeline

**Bug Fixes:**
| Issue | Fix | File:Line |
|-------|-----|-----------|
| Hardcoded 'active' status in INSERT | Use CSV status value with `@status` parameter | subscription_plans.py:630-654 |
| Invalid status values from CSV | Added validation against `VALID_STATUS_VALUES` | subscription_plans.py:615-619 |
| Date type not handled in UPDATE | Added `elif isinstance(value, date)` handler | subscription_plans.py:1131 |
| Audit logger JSON column error | Use `PARSE_JSON(@details)` instead of `@details` | audit_logger.py:111 |

**New Features:**
- Info banner on provider detail page: "New changes to subscription costs will be reflected within 24 hours once the scheduler runs every day at midnight"
- Full status validation in enable_provider endpoint
- 6 Costs API endpoints for Polars-powered cost queries

**Test Results (2025-12-08):**
- All CRUD operations: ✅ PASS
- Provider enable/disable: ✅ PASS (status correctly set to "pending")
- Costs API endpoints: ✅ PASS (all 6 endpoints)
- Multi-tenant security: ✅ PASS (403 on cross-tenant access)
- Cache performance: ✅ PASS (38,361x faster on cache hits)

### v11.0 (2025-12-06)
- Initial FOCUS 1.3 integration
- Pipeline procedures for cost calculation
- 25-column schema migration

---

**Version**: 12.2 | **Updated**: 2025-12-14 | **Policy**: Single source of truth - no duplicate docs
