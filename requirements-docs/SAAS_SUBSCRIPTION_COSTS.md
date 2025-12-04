# SaaS Subscription Costs

**Status**: IMPLEMENTED

## Flow & Status

| Step | Feature | Status |
|------|---------|--------|
| 1 | Integration Page → Enable/Disable provider | ✅ Done |
| 2 | Sidebar Menu → Show enabled providers | ✅ Done |
| 3 | Subscriptions Page → List all subscriptions | ✅ Done |
| 4 | Quick Add → Popular providers | ✅ Done |
| 5 | Provider Plans → CRUD (Create/Read/Update/Delete) | ✅ Done |

```
User Flow:
1. Integrations Page → Enable "Canva"
2. Sidebar shows "Canva" under Subscriptions
3. Click → Subscriptions Page
4. Add plans: PRO ($12.99), TEAM ($14.99)
5. Edit/Delete plans as needed
```

## What
Track fixed-cost SaaS subscriptions (monthly/annual fees).

## Examples
- ChatGPT Plus: $20/mo (ai)
- Claude Pro: $20/mo (ai)
- Canva Pro: $12.99/mo (design)
- Slack Pro: $8.75/mo (communication)
- GitHub Team: $4/mo (development)

## Storage
- Table: `{org_slug}_prod.saas_subscriptions`
- Seed: `configs/saas/seed/data/default_subscriptions.csv`
- Schema: `configs/saas/seed/schemas/saas_subscriptions.json`

---

## How to Add a Provider

### Step 1: Add to CSV seed data
File: `configs/saas/seed/data/default_subscriptions.csv`

### Step 2: Add to frontend provider list
File: `fronted_v0/lib/saas-providers.ts`

```typescript
{ id: "new_provider", name: "New Provider", category: "ai", icon: "brain" }
```

---

## CRUD Fields

### All Fields Available
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subscription_id | STRING | Yes | Unique ID (e.g., sub_canva_pro) |
| provider | STRING | Yes | Provider key (e.g., canva) |
| plan_name | STRING | Yes | Plan tier (e.g., PRO, TEAM) |
| unit_price_usd | FLOAT | Yes | Monthly cost |
| billing_period | STRING | Yes | monthly, annual, pay_as_you_go |
| quantity | INTEGER | No | Number of units |
| seats | INTEGER | No | Number of seats/licenses |
| is_enabled | BOOLEAN | Yes | Active tracking |
| category | STRING | Yes | ai, design, productivity, etc. |
| tier_type | STRING | No | free, trial, paid, enterprise |
| yearly_price_usd | FLOAT | No | Annual price |
| yearly_discount_percentage | INTEGER | No | % saved on annual |
| notes | STRING | No | Description |

### Rate Limit Fields (LLM API only)
| Field | Type | Description |
|-------|------|-------------|
| rpm_limit | INTEGER | Requests per minute |
| tpm_limit | INTEGER | Tokens per minute |
| rpd_limit | INTEGER | Requests per day |
| tpd_limit | INTEGER | Tokens per day |

---

## Provider Examples

### Example 1: Canva (Design SaaS)
```csv
sub_canva_pro,canva,PRO,false,1,12.99,2024-11-01,,true,subscription,Canva Pro - Templates and assets,,,,,paid,,0,,,,,,,,,,,,monthly,119.99,23,design,1
```

**Key Fields**:
- provider: `canva`
- plan_name: `PRO`
- unit_price_usd: `12.99`
- billing_period: `monthly`
- category: `design`
- yearly_price_usd: `119.99`
- yearly_discount_percentage: `23`

### Example 2: ChatGPT Plus (AI Subscription)
```csv
sub_chatgpt_plus,chatgpt_plus,PLUS,false,1,20.00,2024-11-01,,true,subscription,ChatGPT Plus - GPT-4 access,,,,,paid,,0,,,,,,,,,,,,monthly,200.00,17,ai,1
```

**Key Fields**:
- provider: `chatgpt_plus`
- plan_name: `PLUS`
- unit_price_usd: `20.00`
- billing_period: `monthly`
- category: `ai`

### Example 3: OpenAI API Tier (LLM API)
```csv
sub_openai_tier2,openai,TIER2,false,0,0.00,2024-11-01,,true,api_key,Tier 2 - 5000 RPM after $50 spend,,,,paid,,0,,,5000,450000,,,,,,,,pay_as_you_go,,,llm_api,1
```

**Key Fields**:
- provider: `openai`
- plan_name: `TIER2`
- unit_price_usd: `0.00` (pay-as-you-go)
- billing_period: `pay_as_you_go`
- category: `llm_api`
- rpm_limit: `5000`
- tpm_limit: `450000`

### Example 4: Slack Pro (Communication)
```csv
sub_slack_pro,slack,PRO,false,1,8.75,2024-11-01,,true,subscription,Slack Pro - Unlimited history,,,,,paid,,0,,,,,,,,,,,,monthly,87.50,17,communication,1
```

**Key Fields**:
- provider: `slack`
- plan_name: `PRO`
- unit_price_usd: `8.75`
- billing_period: `monthly`
- category: `communication`

---

## Frontend Actions

```typescript
// List all subscriptions for provider
const subs = await listSaaSSubscriptions(orgSlug, "canva")

// Create subscription
await createSaaSSubscription(orgSlug, "canva", {
  plan_name: "PRO",
  unit_price_usd: 12.99,
  billing_period: "monthly",
  category: "design",
  seats: 5
})

// Update
await updateSaaSSubscription(orgSlug, "canva", "PRO", {
  unit_price_usd: 14.99,
  seats: 10
})

// Delete
await deleteSaaSSubscription(orgSlug, "canva", "PRO")
```

---

## Categories
- ai: ChatGPT Plus, Claude Pro, Copilot, Cursor
- design: Canva, Adobe, Figma
- productivity: Notion, Asana
- communication: Slack, Zoom
- development: GitHub, Vercel
- llm_api: OpenAI tiers, Anthropic tiers (rate limits, no fixed cost)
