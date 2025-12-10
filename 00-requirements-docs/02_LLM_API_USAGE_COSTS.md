# LLM API Usage Costs

**Status**: PARTIAL (v1.0) | **Updated**: 2025-12-04 | **Single Source of Truth**

> LLM API pricing configuration, subscription tiers, and usage cost tracking
> NOT SaaS subscriptions (see 02_SAAS_SUBSCRIPTION_COSTS.md)
> NOT CloudAct platform billing (see 01_BILLING_STRIPE.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{env}` | Environment suffix | `prod`, `stage`, `local` |
| `{provider}` | LLM provider name | `openai`, `anthropic`, `gemini` |
| `{model_id}` | Model identifier | `gpt-4-turbo`, `claude-3-opus` |
| `{tier}` | API subscription tier | `TIER1`, `TIER2`, `BUILD_TIER` |

---

## TERMINOLOGY

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Model Pricing** | Per-token cost for an LLM model | GPT-4: $0.03/1K input | `llm_model_pricing` |
| **API Tier** | Provider subscription level | OpenAI TIER3 | `llm_provider_subscriptions` |
| **Rate Limit** | Requests/tokens per minute | 10K RPM | `llm_provider_subscriptions` |
| **Usage Entry** | Token consumption record | 50K tokens on 2025-12-01 | `llm_usage_daily` (future) |
| **Integration** | Configured LLM provider | Active OpenAI setup | `org_integrations` |

---

## Where Data Lives

| Storage | Table/Location | What | Status |
|---------|----------------|------|--------|
| BigQuery (Org) | `{org_slug}_{env}.llm_model_pricing` | Model per-token costs | IMPLEMENTED |
| BigQuery (Org) | `{org_slug}_{env}.llm_provider_subscriptions` | API tier subscriptions | IMPLEMENTED |
| BigQuery (Org) | `{org_slug}_{env}.llm_usage_daily` | Daily usage records | NOT IMPLEMENTED |
| BigQuery (Meta) | `organizations.org_integrations` | Integration status | IMPLEMENTED |
| BigQuery (Meta) | `organizations.org_credentials` | Encrypted API keys | IMPLEMENTED |

---

## Lifecycle

| Stage | What Happens | Status |
|-------|--------------|--------|
| **Onboarding** | Empty pricing/subscription tables created | Auto |
| **Integration Setup** | User adds LLM API key | Manual |
| **Pricing Seed** | Default model pricing loaded | On enable |
| **Subscription Config** | User sets API tier | Manual |
| **Usage Extraction** | Pipeline extracts token usage | NOT IMPLEMENTED |
| **Cost Calculation** | Usage × pricing = cost | NOT IMPLEMENTED |

---

## Architecture Flow

### Current Implementation (Pricing & Subscriptions)

```
+-----------------------------------------------------------------------------+
|                   LLM PRICING & SUBSCRIPTIONS (IMPLEMENTED)                  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  1. INTEGRATION SETUP                                                       |
|     +-- Frontend: Settings > Integrations > LLM Providers                  |
|     +-- POST /api/v1/integrations/{org}/{provider}/setup                   |
|     +-- Stores encrypted API key in org_credentials                        |
|                                                                             |
|  2. PRICING CONFIGURATION                                                   |
|     +-- GET /api/v1/integrations/{org}/{provider}/pricing                  |
|     +-- Returns seeded + custom model pricing                              |
|     +-- POST to add custom pricing for new models                          |
|                                                                             |
|  3. SUBSCRIPTION TIER                                                       |
|     +-- GET /api/v1/integrations/{org}/{provider}/subscriptions            |
|     +-- POST to set API tier (TIER1, TIER2, BUILD_TIER, etc.)             |
|     +-- Stores rate limits and monthly caps                                |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Future Implementation (Usage Tracking)

```
+-----------------------------------------------------------------------------+
|                   LLM USAGE TRACKING (NOT IMPLEMENTED)                       |
+-----------------------------------------------------------------------------+
|                                                                             |
|  1. USAGE EXTRACTION PIPELINE                                               |
|     +-- POST /api/v1/pipelines/run/{org}/{provider}/cost/usage             |
|     +-- Fetches usage from provider API                                    |
|     +-- Stores in llm_usage_daily table                                    |
|                                                                             |
|  2. COST CALCULATION                                                        |
|     +-- Joins usage with llm_model_pricing                                 |
|     +-- Calculates: tokens * price_per_token = cost                        |
|     +-- Aggregates by model, day, month                                    |
|                                                                             |
|  3. USAGE DASHBOARD                                                         |
|     +-- Token consumption charts                                           |
|     +-- Cost breakdown by model                                            |
|     +-- Budget alerts                                                      |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Data Flow

```
Frontend (3000)              API Service (8000)          Pipeline Engine (8001)
     |                              |                              |
     |                              |                              |         BigQuery
     |                              |                              |            |
     |  1. Setup Integration        |                              |            |
     |  (add API key)               |                              |            |
     |----------------------------->|                              |            |
     |                              |-------------------------------------------->|
     |                              |  Encrypt key, store          |            |
     |                              |                              |            |
     |  2. Get/Set Pricing          |                              |            |
     |----------------------------->|                              |            |
     |                              |---------------------------->|            |
     |                              |  Query/Insert pricing        |----------->|
     |<-----------------------------|<-----------------------------|            |
     |                              |                              |            |
     |  3. Set Subscription Tier    |                              |            |
     |----------------------------->|                              |            |
     |                              |---------------------------->|            |
     |                              |  Insert subscription         |----------->|
     |<-----------------------------|<-----------------------------|            |
     |                              |                              |            |
     |  4. Run Usage Pipeline       |                              |            |
     |  (FUTURE)                    |                              |            |
     |------------------------------------------------------------>|            |
     |                              |  Extract from provider API   |            |
     |                              |                              |----------->|
     |                              |                              |  Store     |
     |<------------------------------------------------------------|            |

Tables:
- llm_model_pricing (BigQuery): Per-token costs per model
- llm_provider_subscriptions (BigQuery): API tier and rate limits
- llm_usage_daily (BigQuery): Daily token usage (FUTURE)

Authentication:
- X-API-Key: Org API key for all operations
- Provider API Key: Stored encrypted for usage extraction
```

---

## Schema Definitions

### BigQuery: llm_model_pricing

**File:** `02-api-service/configs/setup/onboarding/schemas/llm_model_pricing.json`

| Column | Type | Description |
|--------|------|-------------|
| pricing_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| provider | STRING | openai, anthropic, gemini |
| model_id | STRING | Model identifier |
| model_name | STRING | Display name |
| input_price_per_1k | FLOAT | Cost per 1K input tokens |
| output_price_per_1k | FLOAT | Cost per 1K output tokens |
| context_window | INT | Max context length |
| is_default | BOOLEAN | Seeded vs custom |
| is_enabled | BOOLEAN | Active for calculations |
| effective_date | DATE | When pricing takes effect |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

### BigQuery: llm_provider_subscriptions

**File:** `02-api-service/configs/setup/onboarding/schemas/llm_provider_subscriptions.json`

| Column | Type | Description |
|--------|------|-------------|
| subscription_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| provider | STRING | openai, anthropic, gemini |
| tier_name | STRING | TIER1, TIER2, BUILD_TIER, etc. |
| requests_per_minute | INT | RPM limit |
| tokens_per_minute | INT | TPM limit |
| tokens_per_day | INT | TPD limit |
| monthly_budget_usd | FLOAT | Budget cap |
| is_active | BOOLEAN | Currently active tier |
| effective_date | DATE | When tier started |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

### BigQuery: llm_usage_daily (FUTURE)

| Column | Type | Description |
|--------|------|-------------|
| usage_id | STRING | Unique identifier |
| org_slug | STRING | Organization |
| provider | STRING | LLM provider |
| model_id | STRING | Model used |
| usage_date | DATE | Usage date |
| input_tokens | INT | Input tokens consumed |
| output_tokens | INT | Output tokens consumed |
| total_tokens | INT | Total tokens |
| request_count | INT | Number of requests |
| input_cost | FLOAT | Calculated input cost |
| output_cost | FLOAT | Calculated output cost |
| total_cost | FLOAT | Total cost |
| extracted_at | TIMESTAMP | Pipeline run time |

---

## Provider API Tiers

### OpenAI Tiers

| Tier | RPM | TPM | Batch TPM | Monthly Cost |
|------|-----|-----|-----------|--------------|
| FREE | 3 | 40K | 200K | $0 |
| TIER1 | 500 | 200K | 2M | ~$5 |
| TIER2 | 5,000 | 2M | 20M | ~$50 |
| TIER3 | 5,000 | 10M | 100M | ~$100 |
| TIER4 | 10,000 | 50M | 500M | ~$250 |
| TIER5 | 10,000 | 150M | 1.5B | $1,000+ |

### Anthropic Tiers

| Tier | RPM | TPM | Monthly Cost |
|------|-----|-----|--------------|
| FREE_TIER | 5 | 20K | $0 |
| BUILD_TIER | 1,000 | 80K | ~$25 |
| SCALE_TIER | 4,000 | 400K | Custom |

### Gemini Tiers

| Tier | RPM | TPD | Monthly Cost |
|------|-----|-----|--------------|
| FREE | 15 | 1M | $0 |
| PAY_AS_YOU_GO | 1,000 | Unlimited | Usage-based |

---

## Frontend Implementation

### Server Actions

**File:** `01-fronted-system/actions/llm-providers.ts`

#### getLLMPricing()

```typescript
async function getLLMPricing(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean,
  pricing?: ModelPricing[],
  error?: string
}>
```

#### addLLMPricing()

```typescript
async function addLLMPricing(
  orgSlug: string,
  provider: string,
  pricing: ModelPricingCreate
): Promise<{
  success: boolean,
  pricing_id?: string,
  error?: string
}>
```

#### getLLMSubscription()

```typescript
async function getLLMSubscription(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean,
  subscription?: ProviderSubscription,
  error?: string
}>
```

#### setLLMSubscription()

```typescript
async function setLLMSubscription(
  orgSlug: string,
  provider: string,
  subscription: SubscriptionCreate
): Promise<{
  success: boolean,
  subscription_id?: string,
  error?: string
}>
```

### TypeScript Interfaces

```typescript
export interface ModelPricing {
  pricing_id: string
  provider: string
  model_id: string
  model_name: string
  input_price_per_1k: number
  output_price_per_1k: number
  context_window: number
  is_default: boolean
  is_enabled: boolean
  effective_date: string
}

export interface ModelPricingCreate {
  model_id: string
  model_name: string
  input_price_per_1k: number
  output_price_per_1k: number
  context_window?: number
  effective_date?: string
}

export interface ProviderSubscription {
  subscription_id: string
  provider: string
  tier_name: string
  requests_per_minute: number
  tokens_per_minute: number
  tokens_per_day?: number
  monthly_budget_usd?: number
  is_active: boolean
  effective_date: string
}

export interface SubscriptionCreate {
  tier_name: string
  requests_per_minute: number
  tokens_per_minute: number
  tokens_per_day?: number
  monthly_budget_usd?: number
}
```

### Pages

| Route | Purpose | Data Source |
|-------|---------|-------------|
| `/{org}/settings/integrations/llm` | LLM provider setup | Pipeline Service |
| `/{org}/settings/integrations/llm/{provider}` | Provider config | Pipeline Service |
| `/{org}/analytics/llm` | LLM usage dashboard (future) | Pipeline Service |

---

## Pipeline Engine Endpoints

**File:** `03-data-pipeline-service/src/app/routers/integrations.py`

### Pricing Management

```
GET    /api/v1/integrations/{org}/{provider}/pricing
       -> List all model pricing for provider
       -> Returns: { pricing: ModelPricing[] }

POST   /api/v1/integrations/{org}/{provider}/pricing
       -> Add custom model pricing
       -> Body: ModelPricingCreate
       -> Returns: { success, pricing_id }

PUT    /api/v1/integrations/{org}/{provider}/pricing/{id}
       -> Update model pricing
       -> Body: ModelPricingUpdate
       -> Returns: { success }

DELETE /api/v1/integrations/{org}/{provider}/pricing/{id}
       -> Delete custom pricing (default protected)
       -> Returns: { success }
```

### Subscription Management

```
GET    /api/v1/integrations/{org}/{provider}/subscriptions
       -> Get current subscription tier
       -> Returns: ProviderSubscription

POST   /api/v1/integrations/{org}/{provider}/subscriptions
       -> Set subscription tier
       -> Body: SubscriptionCreate
       -> Returns: { success, subscription_id }

PUT    /api/v1/integrations/{org}/{provider}/subscriptions/{id}
       -> Update subscription
       -> Returns: { success }
```

### Usage Pipeline (FUTURE)

```
POST   /api/v1/pipelines/run/{org}/{provider}/cost/usage
       -> Extract usage from provider API (NOT IMPLEMENTED)
       -> Body: { start_date, end_date }
       -> Returns: { run_id, status }
```

---

## Seed Data

### Default Model Pricing

**File:** `02-api-service/configs/llm/seed/data/llm_model_pricing.csv`

| Provider | Model | Input/1K | Output/1K | Context |
|----------|-------|----------|-----------|---------|
| openai | gpt-4-turbo | $0.01 | $0.03 | 128K |
| openai | gpt-4o | $0.005 | $0.015 | 128K |
| openai | gpt-4o-mini | $0.00015 | $0.0006 | 128K |
| openai | gpt-3.5-turbo | $0.0005 | $0.0015 | 16K |
| anthropic | claude-3-opus | $0.015 | $0.075 | 200K |
| anthropic | claude-3-sonnet | $0.003 | $0.015 | 200K |
| anthropic | claude-3-haiku | $0.00025 | $0.00125 | 200K |
| gemini | gemini-1.5-pro | $0.0035 | $0.0105 | 1M |
| gemini | gemini-1.5-flash | $0.000075 | $0.0003 | 1M |

---

## Implementation Status

### Completed

| Component | Service | File |
|-----------|---------|------|
| LLM integration setup | Pipeline | routers/integrations.py |
| API key encryption | Pipeline | services/kms_service.py |
| Model pricing table | API | configs/setup/onboarding/schemas/llm_model_pricing.json |
| Subscription table | API | configs/setup/onboarding/schemas/llm_provider_subscriptions.json |
| Pricing CRUD endpoints | Pipeline | routers/integrations.py |
| Subscription CRUD endpoints | Pipeline | routers/integrations.py |
| LLM integrations page | Frontend | app/[orgSlug]/settings/integrations/llm/page.tsx |
| Provider config page | Frontend | app/[orgSlug]/settings/integrations/llm/[provider]/page.tsx |

### NOT IMPLEMENTED

| Component | Notes | Priority |
|-----------|-------|----------|
| OpenAI usage extraction | Needs Usage API integration | P1 |
| Anthropic usage extraction | Needs Admin API access | P1 |
| Gemini usage extraction | Needs Cloud Console API | P2 |
| llm_usage_daily table | Schema defined, not created | P1 |
| Cost calculation pipeline | Join usage with pricing | P1 |
| Usage dashboard | Charts and analytics | P2 |
| Budget alerts | Notify on threshold | P3 |

---

## Business Logic

### Cost Calculation (Future)

```python
# Per-request cost
input_cost = (input_tokens / 1000) * input_price_per_1k
output_cost = (output_tokens / 1000) * output_price_per_1k
total_cost = input_cost + output_cost

# Daily aggregation
daily_cost = sum(total_cost for requests in day)

# Monthly projection
days_elapsed = current_day
monthly_projected = (mtd_cost / days_elapsed) * days_in_month
```

### Rate Limit Validation

```python
# Check against subscription tier
if requests_today >= tier.requests_per_day:
    raise QuotaExceededError("Daily request limit reached")

if tokens_this_minute >= tier.tokens_per_minute:
    raise RateLimitError("TPM limit reached")
```

---

## Error Handling

| Scenario | Error Message |
|----------|---------------|
| Invalid API key | "Invalid API key format" |
| Provider not supported | "Provider not supported: {provider}" |
| Model not found | "Model pricing not found: {model_id}" |
| Duplicate pricing | "Pricing already exists for this model" |
| Invalid tier | "Invalid subscription tier: {tier}" |
| Rate limit exceeded | "API rate limit exceeded" |

---

## Test Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/tests/test_04_llm_integration.py` | LLM integration tests |
| `01-fronted-system/tests/07-llm-integrations.test.ts` | Frontend integration tests |

---

## File References

### Pipeline Engine Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/src/app/routers/integrations.py` | Integration + pricing/subscription CRUD |
| `03-data-pipeline-service/src/services/kms_service.py` | API key encryption |
| `03-data-pipeline-service/configs/openai/cost/usage_cost.yml` | OpenAI pipeline config (future) |
| `03-data-pipeline-service/configs/anthropic/usage_cost.yml` | Anthropic pipeline config (future) |

### API Service Files

| File | Purpose |
|------|---------|
| `02-api-service/configs/setup/onboarding/schemas/llm_model_pricing.json` | Pricing table schema |
| `02-api-service/configs/setup/onboarding/schemas/llm_provider_subscriptions.json` | Subscription table schema |
| `02-api-service/configs/llm/seed/data/llm_model_pricing.csv` | Default pricing seed |

### Frontend Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/llm-providers.ts` | LLM provider server actions |
| `01-fronted-system/app/[orgSlug]/settings/integrations/llm/page.tsx` | LLM providers list |
| `01-fronted-system/app/[orgSlug]/settings/integrations/llm/[provider]/page.tsx` | Provider config |

---

**Version**: 1.0 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
