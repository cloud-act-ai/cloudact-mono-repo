# SaaS Subscription Costs

**Status**: IN PROGRESS | **Updated**: 2025-12-03 | **Single Source of Truth**

> Track fixed-cost SaaS subscriptions (Canva, ChatGPT Plus, Slack, etc.)
> NOT CloudAct platform billing (that's Stripe)
> NOT LLM API tiers (OpenAI TIER1-5, Anthropic BUILD_TIER - separate flow)

---

## Where Data Lives

| Storage   | Port | What                           | Examples                        |
|-----------|------|--------------------------------|---------------------------------|
| Supabase  | 3000 | Provider enable/disable meta   | `saas_subscription_meta` table  |
| BigQuery  | 8000 | Subscription plans (seeded)    | `{org}_prod.saas_subscriptions` |
| BigQuery  | 8001 | Cost projections (pipeline)    | `tfd_llm_subscription_costs`    |

**Key Distinction:**
- **Supabase** = Simple metadata (which providers are enabled)
- **BigQuery** = Full plan details (costs, seats, limits, billing cycle)

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATIONS PAGE                                    │
│  /{orgSlug}/settings/integrations                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Section 1: Cloud Providers     │  Section 2: LLM Providers                 │
│  (GCP Service Account)          │  (OpenAI, Anthropic API keys)             │
├─────────────────────────────────┴───────────────────────────────────────────┤
│  Section 3: Subscription Providers                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Canva   │ │ ChatGPT+ │ │  Slack   │ │  Figma   │ │  Notion  │  ...     │
│  │  [OFF]   │ │  [ON]    │ │  [OFF]   │ │  [ON]    │ │  [OFF]   │          │
│  │          │ │ 3 plans  │ │          │ │ 2 plans  │ │          │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                       [+ Add Custom Provider]                               │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
           On Enable: 1) Supabase meta insert  2) API auto-seed to BigQuery
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR: Subscriptions (shows only enabled providers)                       │
│  ├── ChatGPT Plus (3 plans)                                                 │
│  ├── Figma (2 plans)                                                        │
│  └── [+ Add Provider]                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROVIDER DETAIL PAGE: /{orgSlug}/subscriptions/chatgpt_plus                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Pre-seeded Plans (from BigQuery)                      [+ Add Plan]      ││
│  │ ┌────────────┐ ┌────────────┐ ┌────────────┐                           ││
│  │ │ FREE       │ │ PLUS       │ │ TEAM       │                           ││
│  │ │ $0/mo      │ │ $20/mo     │ │ $25/mo     │                           ││
│  │ │ 50 msg/day │ │ Unlimited  │ │ + Sharing  │                           ││
│  │ │ [Toggle]   │ │ [Toggle]   │ │ [Toggle]   │                           ││
│  │ └────────────┘ └────────────┘ └────────────┘                           ││
│  │                                                                         ││
│  │ Monthly Cost: $45.00 (2 plans enabled, 3 seats)                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
Frontend (3000)                    API Service (8000)              Pipeline (8001)
     │                                   │                              │
     │  Enable Provider Toggle           │  Auto-Seed Plans             │  Cost Projections
     │  (Canva ON/OFF)                   │  (Default plans)             │  (Daily rollups)
     │                                   │                              │
     ▼                                   ▼                              ▼
  Supabase                           BigQuery                       BigQuery
  saas_subscription_meta             {org}_prod.saas_subscriptions  tfd_llm_subscription_costs
  (provider, is_enabled)             (full plan details)            (projected costs)
```

**On Provider Enable:**
1. Frontend saves to Supabase `saas_subscription_meta` (provider enabled)
2. Frontend calls API Service to seed default plans
3. API Service inserts plans to BigQuery `{org}_prod.saas_subscriptions`
4. Sidebar updates to show enabled provider
5. User navigates to provider detail page to see/manage plans

---

## Flow Status

### Frontend (F) → Supabase + API

| Step | Feature                                         | Status | Test Ref |
|------|-------------------------------------------------|--------|----------|
| F1   | Section 3: Subscription provider toggles        | ❌     | FE-01    |
| F2   | Enable provider → call API to seed              | ❌     | FE-02    |
| F3   | Sidebar shows enabled providers                 | ❌     | FE-09    |
| F4   | Provider detail page with plans                 | ❌     | FE-04    |
| F5   | Add custom plan to provider                     | ❌     | FE-05    |
| F6   | Toggle/delete plans                             | ❌     | FE-06,07 |
| F7   | Cost summary on provider page                   | ❌     | FE-08    |

### API Service (B) → BigQuery

| Step | Feature                                         | Status | Test Ref |
|------|-------------------------------------------------|--------|----------|
| B1   | GET /subscriptions/{org}/providers              | ❌     | API-01   |
| B2   | POST /subscriptions/{org}/providers/{p}/enable  | ❌     | API-02   |
| B3   | POST /subscriptions/{org}/providers/{p}/disable | ❌     | API-03   |
| B4   | GET /subscriptions/{org}/providers/{p}/plans    | ❌     | API-04   |
| B5   | POST /subscriptions/{org}/providers/{p}/plans   | ❌     | API-05   |
| B6   | PUT/DELETE plans                                | ❌     | API-06,07|
| B7   | Seed excludes LLM API tiers                     | ❌     | API-08   |
| B8   | Seed includes FREE tiers with limits            | ❌     | API-09   |

### Pipeline Service (P) → Scheduler

| Step | Feature                            | Schedule          | Status      | Test Ref |
|------|------------------------------------|-------------------|-------------|----------|
| P1   | Cost analysis pipeline             | Daily 05:00       | ⚠️ Template | PIPE-01  |
| P2   | Daily rate normalization           | (part of P1)      | ⚠️ Template | PIPE-02  |
| P3   | Discount/quantity calculation      | (part of P1)      | ⚠️ Template | PIPE-03,04|
| P4   | Weekly/Monthly/Yearly projections  | (part of P1)      | ⚠️ Template | PIPE-05  |

---

## API Endpoints

### Subscription Provider Endpoints (NEW - api-service:8000)

```
# List all available providers with enabled status
GET /api/v1/subscriptions/{org_slug}/providers
→ Returns: [{ provider: "canva", is_enabled: true, plan_count: 3 }, ...]

# Enable provider and auto-seed default plans
POST /api/v1/subscriptions/{org_slug}/providers/{provider}/enable
→ Seeds default plans to BigQuery
→ Returns: { success: true, plans_seeded: 3 }

# Disable provider (soft disable, keeps plans)
POST /api/v1/subscriptions/{org_slug}/providers/{provider}/disable
→ Returns: { success: true }

# List plans for provider
GET /api/v1/subscriptions/{org_slug}/providers/{provider}/plans
→ Returns plans from BigQuery (seeded + custom)

# Add custom plan
POST /api/v1/subscriptions/{org_slug}/providers/{provider}/plans
→ Body: { plan_name, unit_price_usd, seats, billing_period, notes }

# Update plan
PUT /api/v1/subscriptions/{org_slug}/providers/{provider}/plans/{plan_id}

# Delete plan
DELETE /api/v1/subscriptions/{org_slug}/providers/{provider}/plans/{plan_id}

# Force re-seed (reset to defaults)
POST /api/v1/subscriptions/{org_slug}/providers/{provider}/reset
```

### Frontend Actions (Supabase Meta)

```typescript
// Supabase meta table actions
listEnabledProviders(orgSlug)     → List from saas_subscription_meta
enableProvider(orgSlug, provider) → Insert to meta + call API seed
disableProvider(orgSlug, provider) → Update meta is_enabled = false

// API calls for BigQuery data
getProviderPlans(orgSlug, provider)    → GET /subscriptions/.../plans
createCustomPlan(orgSlug, provider, data) → POST /subscriptions/.../plans
updatePlan(orgSlug, provider, planId, data) → PUT /subscriptions/.../plans/{id}
deletePlan(orgSlug, provider, planId)  → DELETE /subscriptions/.../plans/{id}
```

---

## Technical Reference

### Supabase Schema: saas_subscription_meta (NEW)

| Field         | Type         | Description                    |
|---------------|--------------|--------------------------------|
| id            | UUID         | Primary key                    |
| org_id        | UUID         | Organization reference         |
| provider_name | VARCHAR(50)  | canva, chatgpt_plus, slack     |
| is_enabled    | BOOLEAN      | Provider enabled for this org  |
| enabled_at    | TIMESTAMPTZ  | When enabled                   |
| created_at    | TIMESTAMPTZ  | Created timestamp              |

**Unique Constraint:** `(org_id, provider_name)`

### RLS Policies (saas_subscription_meta)

| Operation | Policy            | Who Can Access          |
|-----------|-------------------|-------------------------|
| SELECT    | Members can view  | All active org members  |
| INSERT    | Admins can enable | Owner, Admin roles only |
| UPDATE    | Admins can toggle | Owner, Admin roles only |
| DELETE    | Admins can remove | Owner, Admin roles only |

### BigQuery Schema: saas_subscriptions

| Field                   | Type    | Description                               |
|-------------------------|---------|-------------------------------------------|
| subscription_id         | STRING  | UUID                                      |
| provider                | STRING  | canva, chatgpt_plus, slack, figma, etc.   |
| plan_name               | STRING  | FREE, PRO, TEAM, BUSINESS, ENTERPRISE     |
| display_name            | STRING  | Human readable plan name                  |
| is_custom               | BOOLEAN | True if user-created (not seeded)         |
| quantity                | INTEGER | Seats/units                               |
| unit_price_usd          | FLOAT64 | Monthly cost per unit                     |
| effective_date          | DATE    | Start date                                |
| end_date                | DATE    | End date (null = active)                  |
| is_enabled              | BOOLEAN | Active flag                               |
| billing_period          | STRING  | monthly, quarterly, yearly                |
| category                | STRING  | ai, design, productivity, etc.            |
| notes                   | STRING  | Plan description or limits info           |
| **Usage Limits**        |         |                                           |
| daily_limit             | INTEGER | Daily usage limit (messages, designs)     |
| monthly_limit           | INTEGER | Monthly usage limit                       |
| storage_limit_gb        | FLOAT64 | Storage limit in GB                       |
| **Annual Pricing**      |         |                                           |
| yearly_price_usd        | FLOAT64 | Annual price                              |
| yearly_discount_pct     | FLOAT64 | % discount for annual                     |
| **Metadata**            |         |                                           |
| created_at              | TIMESTAMP | Created timestamp                       |
| updated_at              | TIMESTAMP | Updated timestamp                       |

**Note:** LLM API tier fields (rpm_limit, tpm_limit, committed_spend, etc.) are NOT included here. Those belong to the separate LLM integration flow.

---

## Seed Data

### What Gets Seeded (Consumer Subscriptions Only)

**INCLUDED** in auto-seed:

| Provider       | Plans | Examples                                       | Category      |
|----------------|-------|------------------------------------------------|---------------|
| ChatGPT Plus   | 3     | FREE (50 msg/day), PLUS ($20), TEAM ($25)      | ai            |
| Claude Pro     | 3     | FREE (limits), PRO ($20), TEAM ($25)           | ai            |
| GitHub Copilot | 3     | INDIVIDUAL ($10), BUSINESS ($19), ENT ($39)    | development   |
| Cursor         | 3     | FREE (2000 comp), PRO ($20), BUSINESS ($40)    | ai            |
| Canva          | 3     | FREE (5 designs), PRO ($12.99), TEAMS ($14.99) | design        |
| Figma          | 3     | FREE (3 files), PROFESSIONAL ($15), ORG ($45)  | design        |
| Slack          | 3     | FREE (90 days), PRO ($8.75), BUSINESS ($15)    | communication |
| Notion         | 3     | FREE (10 guests), PLUS ($10), BUSINESS ($18)   | productivity  |
| Zoom           | 2     | PRO ($15.99), BUSINESS ($21.99)                | communication |
| Linear         | 2     | FREE, STANDARD ($8)                            | development   |
| Vercel         | 2     | PRO ($20), ENTERPRISE                          | development   |
| +20 more       | ...   | Miro, Asana, Monday, Adobe, etc.               | various       |

**EXCLUDED** from auto-seed (separate LLM integration flow):

| Provider  | Plans | Reason                          |
|-----------|-------|---------------------------------|
| OpenAI    | 6     | API tiers with rate limits      |
| Anthropic | 6     | API tiers with rate limits      |
| Gemini    | 3     | API tiers with rate limits      |

### FREE Tier Limits

| Provider     | FREE Plan Limits                    |
|--------------|-------------------------------------|
| ChatGPT Plus | 50 messages/day, GPT-3.5 only       |
| Claude Pro   | Limited messages, Claude Instant    |
| Cursor       | 2000 completions, 50 slow requests  |
| Canva        | 5 designs/month, watermarks         |
| Figma        | 3 files, 3 pages per file           |
| Slack        | 90-day message history              |
| Notion       | 10 guests, 7-day page history       |
| Linear       | 250 issues, 1 team                  |

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

## Supported Providers (40+)

| Category        | Providers                                            |
|-----------------|------------------------------------------------------|
| AI              | ChatGPT Plus, Claude Pro, Copilot, Cursor, v0, Lovable, Windsurf, Replit |
| Design          | Canva, Adobe CC, Figma, Miro, DrawIO                 |
| Productivity    | Notion, Asana, Monday, Confluence, Coda              |
| Communication   | Slack, Zoom, Teams, Discord                          |
| Development     | GitHub, GitLab, Jira, Linear, Vercel, Netlify, Railway, Supabase |
| Custom          | User-defined (unlisted tools)                        |

### Category Colors (Frontend)

| Category      | Background      | Text              |
|---------------|-----------------|-------------------|
| AI            | `bg-purple-100` | `text-purple-700` |
| Design        | `bg-pink-100`   | `text-pink-700`   |
| Productivity  | `bg-blue-100`   | `text-blue-700`   |
| Communication | `bg-green-100`  | `text-green-700`  |
| Development   | `bg-orange-100` | `text-orange-700` |

---

## User Journey

### Enable Provider and Manage Plans

**Step 1: Navigate to Integrations**
- Route: `/{orgSlug}/settings/integrations`
- Section 3 shows Subscription Providers

**Step 2: Enable Provider**
- User clicks toggle to enable "Canva"
- Frontend: Saves to Supabase `saas_subscription_meta`
- Frontend: Calls `POST /subscriptions/{org}/providers/canva/enable`
- API: Seeds 3 plans (FREE, PRO, TEAMS) to BigQuery
- Sidebar: Updates to show "Canva" under Subscriptions

**Step 3: View Provider Plans**
- Route: `/{orgSlug}/subscriptions/canva`
- Shows seeded plans: FREE ($0), PRO ($12.99), TEAMS ($14.99)
- Each plan has toggle, edit, delete options

**Step 4: Customize Plans**
- Toggle PRO plan ON, 3 seats
- Add custom "ENTERPRISE" plan ($50/mo)
- Disable FREE plan (not using)

**Step 5: View Cost Summary**
- PRO: 3 × $12.99 = $38.97/mo
- ENTERPRISE: 1 × $50 = $50/mo
- Total: $88.97/mo

---

## Test Cases

### Frontend Tests (port 3000) - No Mocks
**File**: `fronted-system/tests/14-subscription-providers.test.ts`

| Test ID | Description                                          | Status |
|---------|------------------------------------------------------|--------|
| FE-01   | List available subscription providers on integrations| ❌     |
| FE-02   | Enable provider toggle → calls API → shows in sidebar| ❌     |
| FE-03   | Disable provider toggle → removes from sidebar       | ❌     |
| FE-04   | Navigate to provider detail page shows seeded plans  | ❌     |
| FE-05   | Add custom plan to provider                          | ❌     |
| FE-06   | Toggle plan enable/disable within provider           | ❌     |
| FE-07   | Delete custom plan                                   | ❌     |
| FE-08   | Cost summary calculation on provider page            | ❌     |
| FE-09   | Sidebar shows correct enabled providers              | ❌     |
| FE-10   | Add custom provider (not in list)                    | ❌     |

### API Service Tests (port 8000)
**File**: `api-service/tests/test_06_subscription_providers.py`

| Test ID | Description                                          | Status |
|---------|------------------------------------------------------|--------|
| API-01  | GET /subscriptions/{org}/providers - list all        | ❌     |
| API-02  | POST .../providers/{provider}/enable - enable + seed | ❌     |
| API-03  | POST .../providers/{provider}/disable - disable      | ❌     |
| API-04  | GET .../providers/{provider}/plans - list plans      | ❌     |
| API-05  | POST .../providers/{provider}/plans - add custom     | ❌     |
| API-06  | PUT .../providers/{provider}/plans/{id} - update     | ❌     |
| API-07  | DELETE .../providers/{provider}/plans/{id} - delete  | ❌     |
| API-08  | Seed excludes LLM API tiers (category != 'llm_api')  | ❌     |
| API-09  | Seed includes FREE tiers with limits                 | ❌     |
| API-10  | Re-enable skips re-seed if plans exist               | ❌     |
| API-11  | Force re-seed option (/reset endpoint)               | ❌     |
| API-12  | Auth: X-API-Key required                             | ❌     |

### Pipeline Service Tests (port 8001)
**File**: `data-pipeline-service/tests/test_06_subscription_cost_pipelines.py`

| Test ID  | Description                                         | Status |
|----------|-----------------------------------------------------|--------|
| PIPE-01  | Cost analysis pipeline reads from saas_subscriptions| ❌     |
| PIPE-02  | Daily rate calculation (yearly/365, monthly/30.4375)| ❌     |
| PIPE-03  | Discount application (1 - discount%)                | ❌     |
| PIPE-04  | Quantity multiplier                                 | ❌     |
| PIPE-05  | Weekly/Monthly/Yearly projections                   | ❌     |
| PIPE-06  | Filter by is_enabled = true                         | ❌     |
| PIPE-07  | Output to tfd_llm_subscription_costs                | ❌     |
| PIPE-08  | Scheduler trigger works                             | ❌     |

---

## Implementation Details by Service

### Frontend-system (port 3000)

**Flow:**
```
User → Integrations Page → Section 3: Subscription Providers
                              │
                              ├── View provider cards with toggles
                              │   └── Each card: Provider name, icon, ON/OFF toggle
                              │
                              ├── Enable Provider Toggle
                              │   ├── 1. Insert to Supabase saas_subscription_meta
                              │   ├── 2. Call API: POST /subscriptions/{org}/providers/{p}/enable
                              │   └── 3. Refresh sidebar to show new provider
                              │
                              ├── Disable Provider Toggle
                              │   ├── 1. Update Supabase meta: is_enabled = false
                              │   └── 2. Refresh sidebar to hide provider
                              │
                              └── Click on enabled provider
                                  └── Navigate to /{orgSlug}/subscriptions/{provider}
```

**What Gets Implemented:**

| Component | File | Description |
|-----------|------|-------------|
| Supabase Meta Table | `scripts/supabase_db/14_saas_subscription_meta.sql` | New table for provider enable/disable |
| Server Actions | `actions/subscription-providers.ts` | CRUD for meta + API calls for plans |
| Integrations Section 3 | `app/[orgSlug]/settings/integrations/page.tsx` | Replace current with provider toggles |
| Provider Detail Page | `app/[orgSlug]/subscriptions/[provider]/page.tsx` | New page showing plans from BigQuery |
| Sidebar Update | `components/dashboard-sidebar.tsx` | Query meta table, show enabled providers |

**Server Actions:**
```typescript
// Supabase (meta table)
listEnabledProviders(orgSlug)           // SELECT from saas_subscription_meta
enableProvider(orgSlug, provider)       // INSERT + call API seed
disableProvider(orgSlug, provider)      // UPDATE is_enabled = false

// API Service (BigQuery plans)
getProviderPlans(orgSlug, provider)     // GET /subscriptions/.../plans
createCustomPlan(orgSlug, provider, data) // POST
updatePlan(orgSlug, provider, planId)   // PUT
deletePlan(orgSlug, provider, planId)   // DELETE
togglePlan(orgSlug, provider, planId)   // PUT is_enabled
```

---

### API-service (port 8000)

**Flow:**
```
Frontend Request → API Router → Validate X-API-Key → Process
                                     │
                                     ├── GET /providers
                                     │   └── List all available providers from seed CSV
                                     │       (filter: category != 'llm_api')
                                     │
                                     ├── POST /providers/{provider}/enable
                                     │   ├── 1. Check if already has plans in BigQuery
                                     │   ├── 2. If no plans → seed from CSV
                                     │   ├── 3. Return { success, plans_seeded }
                                     │   └── (Skip re-seed if plans exist)
                                     │
                                     ├── GET /providers/{provider}/plans
                                     │   └── Query BigQuery: SELECT * WHERE provider = ?
                                     │
                                     ├── POST /providers/{provider}/plans
                                     │   └── Insert custom plan to BigQuery
                                     │
                                     └── PUT/DELETE /providers/{provider}/plans/{id}
                                         └── Update/delete plan in BigQuery
```

**What Gets Implemented:**

| Component | File | Description |
|-----------|------|-------------|
| New Router | `src/app/routers/subscriptions.py` | All subscription provider endpoints |
| Seed Function | (refactor existing) | Extract provider-specific seeding |
| Seed CSV Update | `configs/saas/seed/data/default_subscriptions.csv` | Remove LLM tiers, add FREE tiers |

**Seed CSV Changes:**
```
REMOVE (category = 'llm_api'):
- openai: FREE, TIER1, TIER2, TIER3, TIER4, TIER5
- anthropic: FREE, BUILD_TIER1, BUILD_TIER2, BUILD_TIER3, BUILD_TIER4, SCALE
- gemini: FREE, PAY_AS_YOU_GO, ENTERPRISE

KEEP/ADD (consumer subscriptions):
- chatgpt_plus: FREE (50 msg/day), PLUS ($20), TEAM ($25)
- claude_pro: FREE (limits), PRO ($20), TEAM ($25)
- canva: FREE (5 designs), PRO ($12.99), TEAMS ($14.99)
- slack: FREE (90 days), PRO ($8.75), BUSINESS_PLUS ($15)
- cursor: FREE (2000 completions), PRO ($20), BUSINESS ($40)
- ... (all other consumer tools)
```

**New API Endpoints:**
```python
# New router: /api/v1/subscriptions/{org_slug}/providers/...

@router.get("/{org_slug}/providers")
async def list_providers(org_slug: str, api_key: str = Header(...)):
    """List all available subscription providers with enabled status"""

@router.post("/{org_slug}/providers/{provider}/enable")
async def enable_provider(org_slug: str, provider: str, api_key: str = Header(...)):
    """Enable provider and seed default plans to BigQuery"""

@router.post("/{org_slug}/providers/{provider}/disable")
async def disable_provider(org_slug: str, provider: str, api_key: str = Header(...)):
    """Mark provider as disabled (soft delete, keeps plans)"""

@router.get("/{org_slug}/providers/{provider}/plans")
async def list_plans(org_slug: str, provider: str, api_key: str = Header(...)):
    """List all plans for provider from BigQuery"""

@router.post("/{org_slug}/providers/{provider}/plans")
async def create_plan(org_slug: str, provider: str, plan: PlanCreate, ...):
    """Add custom plan"""

@router.put("/{org_slug}/providers/{provider}/plans/{plan_id}")
async def update_plan(org_slug: str, provider: str, plan_id: str, ...):
    """Update existing plan"""

@router.delete("/{org_slug}/providers/{provider}/plans/{plan_id}")
async def delete_plan(org_slug: str, provider: str, plan_id: str, ...):
    """Delete plan"""

@router.post("/{org_slug}/providers/{provider}/reset")
async def reset_provider(org_slug: str, provider: str, ...):
    """Force re-seed (delete existing + insert defaults)"""
```

---

### Data-pipeline-service (port 8001)

**Flow:**
```
Scheduler (Daily 05:00 UTC) → Trigger Pipeline → Process
                                    │
                                    ├── 1. READ from {org}_prod.saas_subscriptions
                                    │   └── Filter: is_enabled = true, quantity > 0
                                    │
                                    ├── 2. NORMALIZE to daily rate
                                    │   ├── yearly:  price / 365
                                    │   ├── monthly: price / 30.4375
                                    │   ├── quarterly: price / 91.25
                                    │   └── weekly:  price / 7
                                    │
                                    ├── 3. CALCULATE final cost
                                    │   └── final_daily = base_daily × (1 - discount%) × quantity
                                    │
                                    ├── 4. PROJECT costs
                                    │   ├── weekly:  final_daily × 7
                                    │   ├── monthly: final_daily × 30.4375
                                    │   └── yearly:  final_daily × 365
                                    │
                                    └── 5. WRITE to tfd_llm_subscription_costs (overwrite)
```

**What Gets Implemented:**

| Component | File | Description |
|-----------|------|-------------|
| Pipeline Config | `configs/subscription/costs/subscription_cost_analysis.yml` | Activate from template |
| Cost SQL | `configs/subscription/costs/subscription_cost_analysis.sql` | Transform query |
| Processor | `src/core/processors/subscription/cost_analysis.py` | If custom logic needed |

**Pipeline Config (activate template):**
```yaml
# configs/subscription/costs/subscription_cost_analysis.yml
pipeline:
  name: subscription_cost_analysis
  description: Calculate daily cost projections for SaaS subscriptions
  schedule: "0 5 * * *"  # Daily at 05:00 UTC

source:
  type: bigquery
  table: "{org_dataset}.saas_subscriptions"
  filter: "is_enabled = true AND quantity > 0"

transform:
  type: sql
  file: subscription_cost_analysis.sql

destination:
  type: bigquery
  table: "{org_dataset}.tfd_llm_subscription_costs"
  write_disposition: WRITE_TRUNCATE  # Overwrite daily
```

**Transform SQL:**
```sql
-- configs/subscription/costs/subscription_cost_analysis.sql
SELECT
  subscription_id,
  provider,
  plan_name,
  quantity,
  unit_price_usd,
  billing_period,

  -- Normalize to daily rate
  CASE billing_period
    WHEN 'yearly' THEN unit_price_usd / 365
    WHEN 'quarterly' THEN unit_price_usd / 91.25
    WHEN 'monthly' THEN unit_price_usd / 30.4375
    WHEN 'weekly' THEN unit_price_usd / 7
    ELSE unit_price_usd / 30.4375
  END AS daily_rate,

  -- Calculate with discount and quantity
  CASE billing_period
    WHEN 'yearly' THEN unit_price_usd / 365
    WHEN 'quarterly' THEN unit_price_usd / 91.25
    WHEN 'monthly' THEN unit_price_usd / 30.4375
    WHEN 'weekly' THEN unit_price_usd / 7
    ELSE unit_price_usd / 30.4375
  END * (1 - COALESCE(yearly_discount_pct, 0) / 100) * quantity AS final_daily_cost,

  -- Projections
  (daily_rate * quantity * 7) AS projected_weekly,
  (daily_rate * quantity * 30.4375) AS projected_monthly,
  (daily_rate * quantity * 365) AS projected_yearly,

  CURRENT_TIMESTAMP() AS calculated_at

FROM `{org_dataset}.saas_subscriptions`
WHERE is_enabled = true AND quantity > 0
```

---

## Implementation Status

### To Be Implemented

| Component                        | Service            | Priority |
|----------------------------------|--------------------|----------|
| Supabase meta table              | Supabase           | P0       |
| Subscription provider endpoints  | API Service (8000) | P0       |
| Provider toggle UI               | Frontend (3000)    | P0       |
| Provider detail page             | Frontend (3000)    | P0       |
| Sidebar update                   | Frontend (3000)    | P0       |
| Update seed CSV (exclude LLM)    | API Service (8000) | P1       |
| Cost analysis pipeline           | Pipeline (8001)    | P2       |

### Already Exists (May Need Updates)

| Component                     | Service            | Notes                    |
|-------------------------------|--------------------|--------------------------|
| BigQuery CRUD (LLM)           | API Service (8000) | Reuse for SaaS providers |
| Seed CSV                      | API Service        | Remove LLM tiers         |
| Subscriptions page            | Frontend (3000)    | Replace with new flow    |

---

## File References

| File                                                     | Purpose                    |
|----------------------------------------------------------|----------------------------|
| `fronted-system/scripts/supabase_db/14_saas_subscription_meta.sql` | New meta table     |
| `fronted-system/actions/subscription-providers.ts`       | New server actions         |
| `fronted-system/app/[orgSlug]/settings/integrations/page.tsx` | Section 3 update      |
| `fronted-system/app/[orgSlug]/subscriptions/[provider]/page.tsx` | New detail page     |
| `fronted-system/components/dashboard-sidebar.tsx`        | Sidebar update             |
| `api-service/src/app/routers/subscriptions.py`           | New API router             |
| `api-service/configs/saas/seed/data/default_subscriptions.csv` | Update seed data    |
| `data-pipeline-service/tests/test_06_subscription_cost_pipelines.py` | Pipeline tests  |

---

**Version**: 4.0 | **Policy**: Single source of truth - no duplicate docs
