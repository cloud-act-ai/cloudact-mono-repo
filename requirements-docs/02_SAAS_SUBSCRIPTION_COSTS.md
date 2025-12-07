# SaaS Subscription Costs

**Status**: IMPLEMENTED (v11.0) | **Updated**: 2025-12-06 | **Single Source of Truth**

> Track fixed-cost SaaS subscriptions (Canva, ChatGPT Plus, Slack, etc.)
> NOT CloudAct platform billing (that's Stripe)
> NOT LLM API tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - separate flow)

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

**Field Terminology (v10.0):**
- `status` - Subscription status: `active`, `cancelled`, `expired` (replaces `is_enabled`)
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
│  Location: api-service/src/app/routers/organizations.py lines 843-850     │
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

### When Data is Seeded

**When User Enables a Provider** (via frontend toggle or API):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Enable Provider Flow:                                                      │
│                                                                             │
│  1. Frontend calls enableProvider(orgSlug, provider)                       │
│     ├── Supabase: INSERT into saas_subscription_providers_meta             │
│     └── API Service: POST /subscriptions/{org}/providers/{p}/enable        │
│                                                                             │
│  2. API Service (subscription_plans.py) seeds default plans:               │
│     ├── Loads plans from configs/saas/seed/data/saas_subscription_plans.csv  │
│     ├── Filters by provider                                                │
│     └── INSERTs into {org_slug}_{env}.saas_subscription_plans              │
│                                                                             │
│  Location: api-service/src/app/routers/subscription_plans.py               │
│  Function: enable_provider() → load_seed_data_for_provider()               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Lifecycle Summary

| Stage | What Happens | Table State |
|-------|--------------|-------------|
| **Org Onboarding** | Dataset + tables created | EMPTY tables |
| **User Enables Provider A** | Seed data loaded for A | Plans for A only |
| **User Enables Provider B** | Seed data loaded for B | Plans for A + B |
| **User Adds Custom Plan** | INSERT via API | Plans + custom |
| **User Disables Provider** | DELETE all plans for provider | Plans removed from BigQuery |

**Key Points:**
- Table exists immediately after onboarding (EMPTY)
- Data is seeded PER PROVIDER when enabled
- Seed data comes from `saas_subscription_plans.csv`
- Custom plans are user-added via API
- Disabling provider DELETES all plans from BigQuery

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
│  ├── status: STRING             (active, cancelled, expired)               │
│  ├── start_date: DATE           (subscription start date)                  │
│  ├── end_date: DATE             (subscription end date, nullable)          │
│  ├── billing_cycle: STRING      (monthly, yearly, quarterly, weekly)       │
│  ├── currency: STRING           (USD, EUR, GBP, etc.)                      │
│  ├── seats: INT                 (number of seats/licenses)                 │
│  ├── pricing_model: STRING      (per_seat, flat_rate, tiered)             │
│  ├── unit_price_usd: FLOAT      (monthly cost per unit)                    │
│  ├── yearly_price_usd: FLOAT    (annual cost, nullable)                    │
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
│  {org_slug}_{env}.cost_data_standard_1_2 (67 columns) - FOCUS 1.2 STANDARD │
│  ├── (See FOCUS 1.2 specification for full column list)                    │
│  ├── SourceSystem: STRING = 'saas_subscription_costs_daily'                │
│  └── ChargeCategory: STRING = 'Subscription'                               │
│                                                                             │
│  Purpose: Standardized cost data conforming to FinOps FOCUS 1.2 schema     │
│  Partition: DAY on ChargePeriodStart | Cluster: SubAccountId, Provider     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    Centralized Tables (Bootstrap)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BIGQUERY CENTRAL DATASET (organizations)                │
├─────────────────────────────────────────────────────────────────────────────┤
│  {project_id}.organizations.org_subscription_audit (11 columns) - BOOTSTRAP │
│  ├── audit_id: STRING           (UUID, unique per audit entry)             │
│  ├── org_slug: STRING           (organization identifier)                  │
│  ├── subscription_id: STRING    (FK to saas_subscription_plans)            │
│  ├── action: STRING             (created, updated, deleted, status_change) │
│  ├── changed_field: STRING      (field name that changed, nullable)        │
│  ├── old_value: STRING          (previous value, nullable)                 │
│  ├── new_value: STRING          (new value, nullable)                      │
│  ├── changed_by: STRING         (user email or system)                     │
│  ├── changed_at: TIMESTAMP      (when change occurred)                     │
│  ├── reason: STRING             (reason for change, nullable)              │
│  └── source: STRING             (api, pipeline, manual, system)            │
│                                                                             │
│  Purpose: Centralized audit trail for ALL subscription changes (all orgs)  │
│  Location: Created during bootstrap, NOT per-org onboarding                │
│  Partition: DAY on changed_at | Cluster: org_slug, subscription_id         │
│                                                                             │
│  {project_id}.organizations Procedures (Central - operate on per-org data) │
│  ├── sp_calculate_saas_subscription_plan_costs_daily                        │
│  ├── sp_convert_saas_costs_to_focus_1_2                                     │
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

**File:** `api-service/configs/saas/seed/data/saas_subscription_plans.csv`

**Columns (25):**
```
org_slug,subscription_id,provider,plan_name,display_name,category,status,start_date,end_date,billing_cycle,currency,seats,pricing_model,unit_price_usd,yearly_price_usd,discount_type,discount_value,auto_renew,payment_method,invoice_id_last,owner_email,department,renewal_date,contract_id,notes
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
| status | STRING | active, cancelled, expired |
| start_date | DATE | Subscription start date (nullable) |
| end_date | DATE | Subscription end date (nullable) |
| billing_cycle | STRING | monthly, yearly, quarterly, weekly |
| currency | STRING | USD, EUR, GBP, etc. |
| seats | INT | Number of seats/licenses |
| pricing_model | STRING | per_seat, flat_rate, tiered |
| unit_price_usd | FLOAT | Monthly price per unit |
| yearly_price_usd | FLOAT | Annual price (nullable) |
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

**Provider Coverage (28 providers, 70 plans):**

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

**Columns Removed (4):**
- `storage_limit_gb` - Moved to notes or custom fields
- `monthly_usage_limit` - Moved to notes or custom fields
- `projects_limit` - Moved to notes or custom fields
- `members_limit` - Moved to notes or custom fields
- `is_custom` - Inferred from seed data presence

**Columns Retained (10):**
- `subscription_id` - UUID identifier
- `provider` - Provider key
- `plan_name` - Plan tier
- `display_name` - Human-readable name
- `category` - Category classification
- `seats` - Number of seats
- `unit_price_usd` - Monthly price
- `yearly_price_usd` - Annual price
- `notes` - Additional notes
- `updated_at` - Last update timestamp

### Terminology Updates

| Old Term | New Term | Reason |
|----------|----------|--------|
| `is_enabled` | `status` | More states: active, cancelled, expired |
| `billing_period` | `billing_cycle` | Industry standard terminology |
| `yearly_discount_pct` | `discount_type` + `discount_value` | Supports both percentage and fixed discounts |
| `effective_date` | `start_date` | Clearer meaning |

### New Audit Table

**Table:** `org_subscription_audit` (11 columns)

Created via pipeline procedures to track all subscription changes:
- `audit_id` - Unique audit entry ID
- `org_slug` - Organization identifier
- `subscription_id` - FK to saas_subscription_plans
- `action` - Action type (created, updated, deleted, status_change)
- `changed_field` - Field that changed
- `old_value` - Previous value
- `new_value` - New value
- `changed_by` - User or system
- `changed_at` - Timestamp
- `reason` - Reason for change
- `source` - Source (api, pipeline, manual, system)

**Note:** This table is NOT created during org onboarding. It's created via pipeline procedures when first subscription audit is needed.

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

**File:** `fronted-system/scripts/supabase_db/14_saas_subscription_provider_meta.sql`

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

**File:** `fronted-system/actions/subscription-providers.ts`

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
  status: string // active, cancelled, expired
  start_date?: string
  end_date?: string
  billing_cycle: string // monthly, yearly, quarterly, weekly
  currency: string // USD, EUR, GBP, etc.
  seats: number
  pricing_model: string // per_seat, flat_rate, tiered
  unit_price_usd: number
  yearly_price_usd?: number
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
  status?: string // active, cancelled, expired (default: active)
  start_date?: string
  end_date?: string
  billing_cycle?: string // monthly, yearly, quarterly, weekly (default: monthly)
  currency?: string // USD, EUR, GBP (default: USD)
  seats?: number
  pricing_model?: string // per_seat, flat_rate, tiered (default: flat_rate)
  unit_price_usd: number
  yearly_price_usd?: number
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
  status?: string // active, cancelled, expired
  start_date?: string
  end_date?: string
  billing_cycle?: string
  currency?: string
  seats?: number
  pricing_model?: string
  unit_price_usd?: number
  yearly_price_usd?: number
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

**DELETED:** `fronted-system/actions/saas-subscriptions.ts`
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
  if (newPlan.unit_price_usd < 0) {
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

**File:** `api-service/src/app/routers/subscription_plans.py`

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
| CSV seed data (25 cols, 70 plans) | API Service | configs/saas/seed/data/saas_subscription_plans.csv |
| Schema: saas_subscription_plans (25 cols) | API Service | configs/setup/organizations/onboarding/schemas/ |
| Schema: saas_subscription_plan_costs_daily (18 cols) | API Service | configs/setup/organizations/onboarding/schemas/ |
| Schema: cost_data_standard_1_2 (67 cols FOCUS 1.2) | API Service | configs/setup/organizations/onboarding/schemas/ |
| Schema: org_subscription_audit (11 cols) | Bootstrap | configs/setup/bootstrap/schemas/ |
| Procedure: sp_calculate_saas_subscription_plan_costs_daily | Pipeline | configs/system/procedures/subscription/ |
| Procedure: sp_convert_saas_costs_to_focus_1_2 | Pipeline | configs/system/procedures/subscription/ |
| Procedure: sp_run_saas_subscription_costs_pipeline | Pipeline | configs/system/procedures/subscription/ |

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
    base_cost = unit_price_usd × seats
elif pricing_model == "flat_rate":
    base_cost = unit_price_usd
elif pricing_model == "tiered":
    base_cost = unit_price_usd (calculated externally)

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
│  │   ├── sp_convert_saas_costs_to_focus_1_2                                     │
│  │   └── sp_run_saas_subscription_costs_pipeline (orchestrator)                 │
│  │                                                                               │
│  └── Bootstrap Tables                                                            │
│      └── org_subscription_audit (centralized audit trail for all orgs)          │
│                                                                                  │
│  PER-CUSTOMER DATASETS: {project_id}.{org_slug}_prod                            │
│  └── Tables (created during onboarding):                                         │
│      ├── saas_subscription_plans (dimension - user-managed subscriptions)        │
│      ├── saas_subscription_plan_costs_daily (fact - calculated by pipeline)      │
│      └── cost_data_standard_1_2 (FOCUS 1.2 - standardized costs)                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Procedure Details

#### 1. sp_calculate_saas_subscription_plan_costs_daily (Stage 1)

**Purpose:** Expands active subscription plans into daily amortized cost rows.

```sql
CALL `{project_id}.organizations`.sp_calculate_saas_subscription_plan_costs_daily(
  'gac-prod-471220',    -- p_project_id
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

#### 2. sp_convert_saas_costs_to_focus_1_2 (Stage 2)

**Purpose:** Maps daily SaaS subscription costs to FinOps FOCUS 1.2 standard schema.

```sql
CALL `{project_id}.organizations`.sp_convert_saas_costs_to_focus_1_2(
  'gac-prod-471220',    -- p_project_id
  'acme_corp_prod',     -- p_dataset_id (customer dataset)
  DATE('2024-01-01'),   -- p_start_date
  DATE('2024-01-31')    -- p_end_date
);
```

**Logic:**
1. Read from `saas_subscription_plan_costs_daily`
2. Map fields to FOCUS 1.2 columns:
   - `ChargeCategory = 'Subscription'`
   - `ChargeClass = 'Recurring'`
   - `ServiceCategory = 'SaaS'`
   - `SourceSystem = 'saas_subscription_costs_daily'`
3. DELETE existing records for date range WHERE SourceSystem = 'saas_subscription_costs_daily'
4. INSERT mapped data to `cost_data_standard_1_2`

#### 3. sp_run_saas_subscription_costs_pipeline (Orchestrator)

**Purpose:** Runs both stages in sequence for a customer.

```sql
CALL `{project_id}.organizations`.sp_run_saas_subscription_costs_pipeline(
  'gac-prod-471220',    -- p_project_id
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
    ├── 3. CALL sp_convert_saas_costs_to_focus_1_2
    │       └── Stage 2: Convert to FOCUS 1.2 standard
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
│  │     • ${project_id} → gac-prod-471220                                           │    │
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
│  │    @p_project_id,   -- 'gac-prod-471220'                                         │    │
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
│  │  STAGE 1: Calculate Daily Costs           │  │  STAGE 2: Convert to FOCUS 1.2       │
│  │  sp_calculate_saas_subscription_plan_     │  │  sp_convert_saas_costs_to_focus_1_2  │
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
│  │  │                                     │  │  │  │    │ FOCUS 1.2 Mapping:        ││ │
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
│  │  │ 6. Calculate daily cost:            │  │  │  └── cost_data_standard_1_2          │
│  │  │    ┌─────────────────────────────┐  │  │  │      (67 columns FOCUS 1.2)          │
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
│  │                         cost_data_standard_1_2                                   │    │
│  │                      (FinOps FOCUS 1.2 Standard)                                 │    │
│  │                                                                                  │    │
│  │  Partition: DAY on ChargePeriodStart                                             │    │
│  │  Cluster: SubAccountId, Provider                                                 │    │
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
│  │  All sources conform to FOCUS 1.2 → Single dashboard for all costs              │    │
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
│  │  FROM cost_data_standard_1_2                                                     │    │
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
CALL `gac-prod-471220.organizations`.sp_run_saas_subscription_costs_pipeline(
  'gac-prod-471220',
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
CALL `gac-prod-471220.organizations`.sp_run_saas_subscription_costs_pipeline(
  'gac-prod-471220',
  'acme_corp_prod',
  DATE('2024-01-01'),
  DATE('2024-12-31')
);
```

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
| `data-pipeline-service/configs/system/procedures/saas_subscription/sp_calculate_saas_subscription_plan_costs_daily.sql` | Stage 1 procedure |
| `data-pipeline-service/configs/system/procedures/saas_subscription/sp_convert_saas_costs_to_focus_1_2.sql` | Stage 2 procedure |
| `data-pipeline-service/configs/system/procedures/saas_subscription/sp_run_saas_subscription_costs_pipeline.sql` | Orchestrator procedure |

### Pipeline Service Integration

**Config Path:** `data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml`

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
| `fronted-system/tests/13-saas-subscription-providers.test.ts` | Frontend provider + plans tests |
| `api-service/tests/test_05_saas_subscription_providers.py` | API endpoint tests |
| `data-pipeline-service/tests/test_05_saas_subscription_pipelines.py` | Pipeline tests |

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
- [x] Create `saas_subscription_plans.json` (25 columns)
- [x] Create `saas_subscription_plan_costs_daily.json` (18 columns)
- [x] Create `cost_data_standard_1_2.json` (67 columns FOCUS 1.2)
- [x] Create `org_subscription_audit.json` (11 columns) in bootstrap
- [x] Update seed CSV to 25 columns

### Pipeline Procedures
- [x] Create `sp_calculate_saas_subscription_plan_costs_daily.sql`
- [x] Create `sp_convert_saas_costs_to_focus_1_2.sql`
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
| `fronted-system/scripts/supabase_db/14_saas_subscription_provider_meta.sql` | Provider enable/disable meta table |

### Plan Files (BigQuery data)

| File | Purpose |
|------|---------|
| `api-service/src/app/routers/subscription_plans.py` | API endpoints for plan CRUD |
| `api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plans.json` | BigQuery schema (25 cols) |
| `api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plan_costs_daily.json` | Daily costs schema (18 cols) |
| `api-service/configs/setup/organizations/onboarding/schemas/cost_data_standard_1_2.json` | FOCUS 1.2 schema (67 cols) |
| `api-service/configs/setup/bootstrap/schemas/org_subscription_audit.json` | Audit table schema (11 cols) |
| `api-service/configs/saas/seed/data/saas_subscription_plans.csv` | Seed data (25 cols, 70 plans) |

### Pipeline Files (Cost Calculation)

| File | Purpose |
|------|---------|
| `data-pipeline-service/configs/system/procedures/saas_subscription/sp_calculate_saas_subscription_plan_costs_daily.sql` | Stage 1: Daily cost calculation |
| `data-pipeline-service/configs/system/procedures/saas_subscription/sp_convert_saas_costs_to_focus_1_2.sql` | Stage 2: FOCUS 1.2 conversion |
| `data-pipeline-service/configs/system/procedures/saas_subscription/sp_run_saas_subscription_costs_pipeline.sql` | Orchestrator procedure |
| `data-pipeline-service/configs/saas_subscription/costs/saas_cost.yml` | Pipeline config |
| `data-pipeline-service/src/core/processors/generic/procedure_executor.py` | Procedure executor processor |
| `1-PRE-ANALLISYS/finops_subscription_pipeline_sql/README.md` | Pipeline architecture docs |

### Frontend Files

| File | Purpose |
|------|---------|
| `fronted-system/lib/saas-providers.ts` | Static provider list (COMMON_SAAS_PROVIDERS array) |
| `fronted-system/actions/subscription-providers.ts` | ALL subscription actions (providers + plans) |
| `fronted-system/app/[orgSlug]/subscriptions/page.tsx` | Costs dashboard (all plans) |
| `fronted-system/app/[orgSlug]/subscriptions/[provider]/page.tsx` | Provider detail page (plans CRUD) |
| `fronted-system/app/[orgSlug]/settings/integrations/subscriptions/page.tsx` | Manage providers (enable/disable) |
| `fronted-system/components/dashboard-sidebar.tsx` | Sidebar with Integrations → Subscription Providers submenu |

---

**Version**: 11.0 | **Updated**: 2025-12-06 | **Policy**: Single source of truth - no duplicate docs
