# SaaS Subscription Costs

**Status**: IMPLEMENTED | **Updated**: 2025-12-04 | **Single Source of Truth**

> Track fixed-cost SaaS subscriptions (Canva, ChatGPT Plus, Slack, etc.)
> NOT CloudAct platform billing (that's Stripe)
> NOT LLM API tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - separate flow)

---

## Where Data Lives

| Storage  | Table                      | What                              |
| -------- | -------------------------- | --------------------------------- |
| Supabase | `saas_subscriptions`       | Individual subscription instances |
| Supabase | `saas_subscription_meta`   | Provider enable/disable per org   |
| BigQuery | `{org}_prod.saas_subscriptions` | Seeded plans (via API service) |

**Key Points:**
- Frontend pages use **Supabase** directly (no API key required)
- API service seeds default plans to **BigQuery** when provider enabled
- No authentication needed for subscription tracking pages

---

## Architecture Flow

### Sidebar Navigation Structure

```
SIDEBAR
├── Dashboard
├── Analytics
├── Pipelines
├── Integrations (expandable)
│   ├── Cloud Providers         → /{org}/settings/integrations/cloud
│   ├── LLM Providers           → /{org}/settings/integrations/llm
│   └── Subscription Providers (expandable - third level) [badge: count]
│       ├── Manage Subscriptions → /{org}/settings/integrations/subscriptions
│       ├── Claude Pro (if enabled) → /{org}/subscriptions/claude_pro
│       └── Canva (if enabled)     → /{org}/subscriptions/canva
│
└── Subscription Costs (only if providers enabled) → /{org}/subscriptions
```

**Key Behavior:**
- Subscription Providers is nested under Integrations as expandable third-level submenu
- Shows badge with enabled provider count
- Individual providers appear only when enabled in meta table
- "Subscription Costs" top-level menu only visible when at least one provider is enabled

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
│  (Shows first 20 providers)                                                │
│                                                                             │
│                    [Show 8 more providers]                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Don't see your provider?                                               ││
│  │  [Add Custom Provider]                                                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                              │
           On Enable: Supabase meta insert + API seeds plans to BigQuery
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUBSCRIPTION COSTS PAGE: /{orgSlug}/subscriptions (READ-ONLY DASHBOARD)    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Summary Cards: Monthly Cost | Annual Cost | Active | Categories        ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ All Subscriptions Table (from Supabase saas_subscriptions)             ││
│  │ - Toggle enable/disable per subscription                               ││
│  │ - Links to provider detail pages                                       ││
│  │ - [Manage Providers] button → /settings/integrations/subscriptions     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROVIDER DETAIL PAGE: /{orgSlug}/subscriptions/{provider}                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Subscriptions for Provider (from Supabase)           [+ Add Subscription]││
│  │ ┌────────────┐ ┌────────────┐ ┌────────────┐                           ││
│  │ │ FREE       │ │ PRO        │ │ TEAM       │                           ││
│  │ │ $0/mo      │ │ $20/mo     │ │ $25/mo     │                           ││
│  │ │ [Toggle]   │ │ [Toggle]   │ │ [Toggle]   │ [Delete]                  ││
│  │ └────────────┘ └────────────┘ └────────────┘                           ││
│  │                                                                         ││
│  │ Monthly Cost: $45.00 (2 enabled)                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
Frontend (3000)                 Supabase                    API Service (8000)
     │                              │                              │
     │  Toggle subscription         │                              │
     │  (enable/disable)            │                              │
     ├─────────────────────────────>│                              │
     │                              │                              │
     │  CRUD subscriptions          │                              │
     │  (add/edit/delete)           │                              │
     ├─────────────────────────────>│                              │
     │                              │                              │
     │  Enable Provider             │    Seed default plans        │
     ├─────────────────────────────>├─────────────────────────────>│
     │                              │    (to BigQuery)             │
     │                              │                              │

Tables:
- saas_subscriptions (individual instances)
- saas_subscription_meta (provider enabled state)
```

**Key Behavior:**
1. Subscription CRUD uses Supabase directly (no API key needed)
2. Provider enable/disable saves to Supabase meta table
3. API service seeds default plans to BigQuery when provider enabled
4. Frontend pages are read/write without API authentication

---

## CSV Seed Data Structure

**File:** `api-service/configs/saas/seed/data/default_subscriptions.csv`

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

### Table: saas_subscriptions

**File:** `fronted-system/scripts/supabase_db/12_saas_subscriptions_table.sql`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | FK to organizations |
| provider_name | VARCHAR(100) | canva, chatgpt_plus, etc. |
| display_name | VARCHAR(200) | Human-readable name |
| billing_cycle | VARCHAR(20) | monthly, annual, quarterly, custom |
| cost_per_cycle | DECIMAL(10,2) | Cost per billing cycle |
| currency | VARCHAR(3) | USD (default) |
| seats | INTEGER | Number of licenses |
| renewal_date | DATE | Next billing date |
| category | VARCHAR(50) | design, ai, productivity, etc. |
| notes | TEXT | Custom notes |
| is_enabled | BOOLEAN | Active for cost tracking |
| created_at | TIMESTAMPTZ | Auto-set |
| updated_at | TIMESTAMPTZ | Auto-updated |

**Indexes:**
- `idx_saas_subscriptions_org_id`
- `idx_saas_subscriptions_provider`
- `idx_saas_subscriptions_category`
- `idx_saas_subscriptions_enabled`

**RLS Policies:**
- SELECT: All org members can view
- INSERT/UPDATE/DELETE: Owner and Admin only

### Table: saas_subscription_meta

**File:** `fronted-system/scripts/supabase_db/14_saas_subscription_meta.sql`

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

---

## Frontend Implementation

### Server Actions

**File:** `fronted-system/actions/saas-subscriptions.ts`

```typescript
// Supabase CRUD (no API key required)
listSaaSSubscriptions(orgSlug)
createSaaSSubscription(orgSlug, subscription)
updateSaaSSubscription(orgSlug, id, updates)
deleteSaaSSubscription(orgSlug, id)
toggleSaaSSubscription(orgSlug, id, enabled)
getSaaSSubscriptionSummary(orgSlug)
```

**File:** `fronted-system/actions/subscription-providers.ts`

```typescript
// Provider management
listEnabledProviders(orgSlug)
getAllProviders(orgSlug)
enableProvider(orgSlug, provider)   // Saves to meta + calls API seed
disableProvider(orgSlug, provider)

// BigQuery plans (via API service)
getProviderPlans(orgSlug, provider)
createCustomPlan(orgSlug, provider, plan)
updatePlan(orgSlug, provider, planId, updates)
deletePlan(orgSlug, provider, planId)
```

### Pages

| Route | Purpose | Sidebar Location | Data Source |
|-------|---------|------------------|-------------|
| `/{org}/subscriptions` | Subscription Costs (read-only dashboard) | Top-level menu | Supabase |
| `/{org}/subscriptions/{provider}` | Provider detail + CRUD | Integrations → Subscription Providers → {Provider} | Supabase |
| `/{org}/settings/integrations/subscriptions` | Manage Subscriptions (enable/disable providers) | Integrations → Subscription Providers → Manage | Supabase meta |

---

## API Service Endpoints

**File:** `api-service/src/app/routers/subscriptions.py`

**Router registered at:** `/api/v1/subscriptions`

```
GET    /subscriptions/{org}/providers
       → List all 28 providers with enabled status

POST   /subscriptions/{org}/providers/{provider}/enable
       → Seed default plans to BigQuery (skips if exist)

POST   /subscriptions/{org}/providers/{provider}/disable
       → Soft disable (is_enabled=false)

GET    /subscriptions/{org}/providers/{provider}/plans
       → List plans from BigQuery

POST   /subscriptions/{org}/providers/{provider}/plans
       → Add custom plan

PUT    /subscriptions/{org}/providers/{provider}/plans/{id}
       → Update plan

DELETE /subscriptions/{org}/providers/{provider}/plans/{id}
       → Delete plan

POST   /subscriptions/{org}/providers/{provider}/reset
       → Force re-seed defaults
```

**Authentication:** X-API-Key header required for all API endpoints

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| Supabase saas_subscriptions table | Supabase | 12_saas_subscriptions_table.sql |
| Supabase saas_subscription_meta table | Supabase | 14_saas_subscription_meta.sql |
| Subscription server actions | Frontend | actions/saas-subscriptions.ts |
| Provider server actions | Frontend | actions/subscription-providers.ts |
| Subscriptions page (read-only) | Frontend | app/[orgSlug]/subscriptions/page.tsx |
| Provider detail page | Frontend | app/[orgSlug]/subscriptions/[provider]/page.tsx |
| Integrations Section 3 | Frontend | app/[orgSlug]/settings/integrations/page.tsx |
| Sidebar with Subscription Providers submenu | Frontend | components/dashboard-sidebar.tsx |
| Subscription router | API Service | src/app/routers/subscriptions.py |
| CSV seed data (14 cols, 70 plans) | API Service | configs/saas/seed/data/default_subscriptions.csv |

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

## Test Files

| File | Purpose |
|------|---------|
| `fronted-system/tests/13-saas-subscription-crud.test.ts` | Frontend CRUD tests |
| `api-service/tests/test_05_saas_subscriptions.py` | API endpoint tests |
| `data-pipeline-service/tests/test_05_subscription_pipelines.py` | Pipeline tests (pending) |

---

## Gap Analysis Summary

### Frontend Gaps
| Gap | Severity | Description |
|-----|----------|-------------|
| None | - | All frontend features implemented |

### UI Features (Recently Added)
| Feature | Status | Description |
|---------|--------|-------------|
| Pagination | ✓ | Shows first 20 providers, "Show more" button for rest |
| Custom Provider | ✓ | "Don't see your provider? Add Custom Provider" at bottom |
| Input Validation | ✓ | Fixed "020" bug in number inputs (cost, seats, quantity) |
| Header Simplified | ✓ | Removed duplicate "Add Provider" button from header |

### API Service Gaps
| Gap | Severity | Description |
|-----|----------|-------------|
| Auto-seed on onboarding | MEDIUM | Must manually enable providers after org creation |
| Bulk enable | LOW | No endpoint to enable multiple providers at once |

### Supabase Gaps
| Gap | Severity | Description |
|-----|----------|-------------|
| None | - | Both tables fully implemented with RLS |

---

## File References

| File | Purpose |
|------|---------|
| `fronted-system/scripts/supabase_db/12_saas_subscriptions_table.sql` | Main subscriptions table |
| `fronted-system/scripts/supabase_db/14_saas_subscription_meta.sql` | Provider meta table |
| `fronted-system/actions/saas-subscriptions.ts` | Supabase CRUD actions |
| `fronted-system/actions/subscription-providers.ts` | Provider management actions |
| `fronted-system/app/[orgSlug]/subscriptions/page.tsx` | Read-only reports page |
| `fronted-system/app/[orgSlug]/subscriptions/[provider]/page.tsx` | Provider detail page |
| `fronted-system/components/dashboard-sidebar.tsx` | Sidebar with Subscription Providers submenu |
| `api-service/src/app/routers/subscriptions.py` | API endpoints |
| `api-service/configs/saas/seed/data/default_subscriptions.csv` | Seed data (14 cols) |

---

**Version**: 5.2 | **Policy**: Single source of truth - no duplicate docs
