# SaaS Subscription Costs

**Status**: IMPLEMENTED (v9.0) | **Updated**: 2025-12-04 | **Single Source of Truth**

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
│  {org_slug}_{env}.saas_subscription_plans                                   │
│  ├── subscription_id: STRING (UUID)                                         │
│  ├── provider: STRING           (e.g., "canva", "claude_pro")              │
│  ├── plan_name: STRING          (e.g., "FREE", "PRO", "TEAM")              │
│  ├── display_name: STRING       (human-readable)                           │
│  ├── unit_price_usd: FLOAT      (monthly cost)                             │
│  ├── yearly_price_usd: FLOAT                                               │
│  ├── billing_period: STRING     (monthly, yearly)                          │
│  ├── category: STRING           (ai, design, productivity, etc.)           │
│  ├── seats: INT                                                            │
│  ├── is_enabled: BOOLEAN        (active for cost tracking)                 │
│  ├── is_custom: BOOLEAN         (user-added vs seeded)                     │
│  └── storage_limit_gb, daily_limit, monthly_limit, etc.                    │
│                                                                             │
│  Purpose: ALL subscription plans (seeded from CSV + custom user plans)     │
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

**Columns (14):**
```
provider,plan_name,display_name,unit_price_usd,yearly_price_usd,yearly_discount_pct,billing_period,category,seats,storage_limit_gb,monthly_usage_limit,projects_limit,members_limit,notes
```

**Column Descriptions:**
| Column | Type | Description |
|--------|------|-------------|
| provider | STRING | Provider key (chatgpt_plus, canva, slack) |
| plan_name | STRING | Plan tier (FREE, PRO, TEAM, BUSINESS) |
| display_name | STRING | Human-readable name |
| unit_price_usd | FLOAT | Monthly price |
| yearly_price_usd | FLOAT | Annual price |
| yearly_discount_pct | INT | Discount % for annual (0-27) |
| billing_period | STRING | Always "monthly" |
| category | STRING | ai, design, productivity, communication, development |
| seats | INT | Included seats (1, 2, 5, 10) |
| storage_limit_gb | FLOAT | Storage limit (0.25, 5, 50, 100, 1000, unlimited) |
| monthly_usage_limit | INT/STRING | Usage cap (2000, 500000, unlimited) |
| projects_limit | INT/STRING | Project limit (3, 5, unlimited) |
| members_limit | INT/STRING | Member limit (1, 10, 150, unlimited) |
| notes | STRING | Plan description |

**Provider Coverage (28 providers, 70 plans):**

| Category | Providers |
|----------|-----------|
| AI | chatgpt_plus, claude_pro, gemini_advanced, copilot, cursor, windsurf, replit, v0, lovable |
| Design | canva, adobe_cc, figma, miro |
| Productivity | notion, confluence, asana, monday |
| Communication | slack, zoom, teams |
| Development | github, gitlab, jira, linear, vercel, netlify, railway, supabase |

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
  subscription_id: string
  provider: string
  plan_name: string
  display_name?: string
  is_custom: boolean
  quantity: number
  unit_price_usd: number
  effective_date?: string
  end_date?: string
  is_enabled: boolean
  billing_period: string
  category: string
  notes?: string
  daily_limit?: number
  monthly_limit?: number
  storage_limit_gb?: number
  yearly_price_usd?: number
  yearly_discount_pct?: number
  seats: number
  created_at?: string
  updated_at?: string
}

export interface PlanCreate {
  plan_name: string
  display_name?: string
  quantity?: number
  unit_price_usd: number
  billing_period?: string
  notes?: string
  daily_limit?: number
  monthly_limit?: number
  yearly_price_usd?: number
  yearly_discount_pct?: number
  seats?: number
}

export interface PlanUpdate {
  display_name?: string
  quantity?: number
  unit_price_usd?: number
  is_enabled?: boolean
  billing_period?: string
  notes?: string
  daily_limit?: number
  monthly_limit?: number
  yearly_price_usd?: number
  yearly_discount_pct?: number
  seats?: number
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
       → Toggle plan is_enabled in BigQuery

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
| CSV seed data (14 cols, 70 plans) | API Service | configs/saas/seed/data/saas_subscription_plans.csv |

### REMOVED

| Component | Reason |
|-----------|--------|
| `saas_subscriptions` table (Supabase) | ALL data now in BigQuery |
| `actions/saas-subscriptions.ts` | Merged into subscription-providers.ts |

### To Be Implemented

| Component | Service | Priority |
|-----------|---------|----------|
| Cost analysis pipeline | Pipeline (8001) | P2 |
| Auto-seed on org onboarding | API Service | P3 |
| Bulk provider enable | API Service | P3 |

---

## Cost Calculation Logic

**Daily Rate:**
- yearly: `price / 365`
- monthly: `price / 30.4375`
- quarterly: `price / 91.25`
- weekly: `price / 7`

**Final Cost:** `base_daily × (1 - discount%) × quantity`

**Projections:**
- weekly: `daily × 7`
- monthly: `daily × 30.4375`
- yearly: `daily × 365`

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

- [x] Update `subscription-providers.ts` with `getAllPlansForCostDashboard()`
- [x] Update `subscriptions/page.tsx` to use API service
- [x] Update `subscriptions/[provider]/page.tsx` to use API service
- [x] Update `settings/integrations/subscriptions/page.tsx` to use `createCustomPlan`
- [x] Delete `actions/saas-subscriptions.ts`

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
| `api-service/configs/saas/seed/schemas/saas_subscription_plans.json` | BigQuery schema for plans table |
| `api-service/configs/saas/seed/data/saas_subscription_plans.csv` | Seed data (14 cols, 70 plans) |

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

**Version**: 9.0 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
