# LLM Subscription Configuration Pages

## Overview

This document describes the frontend pages for managing LLM provider subscriptions and pricing configurations. Users can view, edit, and customize pricing models and subscription tiers for their integrated providers.

## Architecture

```
Frontend (Next.js)
    │
    ├── /settings/integrations/{provider}/pricing     → Pricing configuration
    ├── /settings/integrations/{provider}/subscription → Subscription tiers
    └── /settings/integrations/{provider}/usage       → Usage vs limits
    │
    ▼
Backend API (api-service:8000)
    │
    ├── GET/POST/PUT/DELETE .../pricing
    └── GET/POST/PUT/DELETE .../subscriptions
    │
    ▼
BigQuery: {org_slug}_prod.llm_model_pricing
BigQuery: {org_slug}_prod.llm_subscriptions
```

**Note:** All CRUD operations go through `api-service` (port 8000). The `data-pipeline-service` (port 8001) only reads these tables for future cost calculations.

---

## Page Structure

### 1. Provider Integration Overview

**Route:** `/settings/integrations`

Displays all configured providers with subscription status summary:

```
┌─────────────────────────────────────────────────────────────┐
│  Provider Integrations                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   OpenAI     │  │  Anthropic   │  │   Gemini     │       │
│  │   ────────   │  │   ────────   │  │   ────────   │       │
│  │   TIER2      │  │   BUILD      │  │   FREE       │       │
│  │   $100/mo    │  │   Pay-as-go  │  │   15 RPM     │       │
│  │   [Configure]│  │   [Configure]│  │   [Configure]│       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2. Pricing Configuration Page

**Route:** `/settings/integrations/{provider}/pricing`

#### Features:
- View all model pricing (default + custom)
- Add custom models
- Edit pricing (input/output per 1K tokens)
- Configure free tier allocations
- Set volume discounts
- Toggle model enable/disable

#### UI Components:

```
┌─────────────────────────────────────────────────────────────┐
│  OpenAI Model Pricing                          [+ Add Model] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Model          Input/1K   Output/1K   Type        Status   │
│  ─────────────  ────────   ─────────   ──────────  ──────   │
│  gpt-4o         $0.0025    $0.01       Standard    ✓ Active │
│  gpt-4o-mini    $0.00015   $0.0006     Standard    ✓ Active │
│  o1             $0.015     $0.06       Standard    ✓ Active │
│  custom-model   $0.002     $0.008      Custom      ○ Disabled│
│                                                              │
│  [Batch Pricing]  [Free Tiers]  [Volume Discounts]          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Add/Edit Model Modal:

```
┌─────────────────────────────────────────────────────────────┐
│  Add Custom Pricing Model                              [X]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Model ID:        [custom-gpt-4o-ft          ]              │
│  Display Name:    [Custom GPT-4o Fine-tuned  ]              │
│                                                              │
│  ── Token Pricing ──────────────────────────────────────    │
│  Input (per 1K):  [$] [0.003    ]                           │
│  Output (per 1K): [$] [0.012    ]                           │
│                                                              │
│  ── Pricing Type ───────────────────────────────────────    │
│  Type: [Standard          ▼]                                │
│        ○ Standard                                            │
│        ○ Volume Discount                                     │
│        ○ Committed Use                                       │
│        ○ Promotional                                         │
│                                                              │
│  ── Free Tier (Optional) ───────────────────────────────    │
│  □ Enable Free Tier                                         │
│    Input Tokens:  [1,000,000  ] per [Monthly ▼]            │
│    Output Tokens: [500,000    ]                             │
│                                                              │
│  ── Discount (Optional) ────────────────────────────────    │
│  □ Apply Discount                                           │
│    Percentage:    [20   ]%                                  │
│    Reason:        [Volume          ▼]                       │
│    Min Tokens:    [1,000,000,000   ]                        │
│                                                              │
│  Effective Date:  [2024-12-01     ]                         │
│  Notes:           [Fine-tuned for customer support    ]     │
│                                                              │
│                              [Cancel]  [Save]                │
└─────────────────────────────────────────────────────────────┘
```

### 3. Subscription Configuration Page

**Route:** `/settings/integrations/{provider}/subscription`

#### Features:
- View current subscription tier
- See rate limits (RPM, TPM, RPD, TPD)
- Configure trial/credit tracking
- Set up committed use discounts
- Track commitment terms

#### UI Components:

```
┌─────────────────────────────────────────────────────────────┐
│  OpenAI Subscription                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Current Plan: TIER2 (Professional)                         │
│  Monthly Cost: $100.00                                       │
│  Tier Type:    Paid                                         │
│                                                              │
│  ── Rate Limits ────────────────────────────────────────    │
│  ┌────────────┬────────────┬────────────┬────────────┐     │
│  │    RPM     │    TPM     │    RPD     │ Concurrent │     │
│  │   5,000    │  450,000   │     -      │     -      │     │
│  └────────────┴────────────┴────────────┴────────────┘     │
│                                                              │
│  ── Available Plans ────────────────────────────────────    │
│                                                              │
│  ○ FREE      3 RPM    40K TPM    200 RPD   $0/mo           │
│  ○ TIER1     500 RPM  30K TPM    10K RPD   $20/mo          │
│  ● TIER2     5K RPM   450K TPM   -         $100/mo  ← Current│
│  ○ TIER3     10K RPM  1M TPM     -         $500/mo          │
│  ○ TIER4     20K RPM  2M TPM     -         $1000/mo         │
│                                                              │
│                              [Change Plan]                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### CUD Configuration (Gemini):

```
┌─────────────────────────────────────────────────────────────┐
│  Gemini Committed Use Discount                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ── Current Commitment ─────────────────────────────────    │
│  Plan:              CUD_3_YEAR                              │
│  Commitment Term:   36 months                               │
│  Monthly Spend:     $5,000                                  │
│  Discount:          52%                                     │
│  Start Date:        2024-01-01                              │
│  End Date:          2026-12-31                              │
│                                                              │
│  ── Savings Calculator ─────────────────────────────────    │
│  Standard Cost:     $10,416/mo                              │
│  Discounted Cost:   $5,000/mo                               │
│  Monthly Savings:   $5,416 (52%)                            │
│  Total Savings:     $195,000 over 36 months                 │
│                                                              │
│  ⚠️ CUDs cannot be cancelled or refunded                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4. Usage vs Limits Dashboard

**Route:** `/settings/integrations/{provider}/usage`

```
┌─────────────────────────────────────────────────────────────┐
│  Anthropic Usage & Limits                    Period: Dec 24 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Current Plan: BUILD (Tier 1)                               │
│                                                              │
│  ── Rate Limit Usage ───────────────────────────────────    │
│                                                              │
│  Requests/Min (RPM)                                         │
│  [████████████░░░░░░░░] 24/50 (48%)                        │
│                                                              │
│  Tokens/Min (TPM)                                           │
│  [██████░░░░░░░░░░░░░░] 12,000/40,000 (30%)                │
│                                                              │
│  Tokens/Day (TPD)                                           │
│  [████░░░░░░░░░░░░░░░░] 400K/2M (20%)                      │
│                                                              │
│  ── Free Tier Status (Gemini) ──────────────────────────    │
│                                                              │
│  Daily Free Tokens (resets in 4h 23m)                       │
│  [██████████████████░░] 1.8B/2B used (90%)                 │
│                                                              │
│  ⚠️ Approaching free tier limit. Usage beyond will be billed│
│                                                              │
│  ── Upgrade Recommendation ─────────────────────────────    │
│  Based on your usage, consider upgrading to BUILD_TIER2     │
│  for 2x rate limits (+$0/mo, spend threshold: $40)          │
│                                                              │
│                              [View Upgrade Options]          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models (TypeScript)

### Pricing Types

```typescript
type PricingType =
  | 'standard'       // Regular published pricing
  | 'free_tier'      // Provider-offered free usage
  | 'volume_discount' // Tiered pricing based on usage
  | 'committed_use'  // Pre-committed spend discounts
  | 'promotional'    // Time-bounded special offers
  | 'negotiated';    // Custom enterprise agreements

type TierType =
  | 'free'           // Perpetual free tier
  | 'trial'          // Time-limited trial
  | 'paid'           // Standard paid tier
  | 'enterprise'     // Custom enterprise
  | 'committed_use'; // CUD commitment

type FreeTierResetFrequency =
  | 'daily'          // Resets at midnight UTC
  | 'monthly'        // Resets on 1st of month
  | 'never';         // One-time credit

type DiscountReason =
  | 'volume'         // Volume-based discount
  | 'commitment'     // Committed use discount
  | 'promotion'      // Promotional offer
  | 'negotiated'     // Enterprise deal
  | 'trial';         // Trial discount
```

### Pricing Model Interface

```typescript
interface LLMPricingModel {
  model_id: string;
  model_name: string | null;
  input_price_per_1k: number;
  output_price_per_1k: number;
  effective_date: string;
  notes: string | null;

  // Pricing classification
  pricing_type: PricingType;

  // Free tier
  free_tier_input_tokens: number | null;
  free_tier_output_tokens: number | null;
  free_tier_reset_frequency: FreeTierResetFrequency | null;

  // Discounts
  discount_percentage: number | null;
  discount_reason: DiscountReason | null;
  volume_threshold_tokens: number | null;
  base_input_price_per_1k: number | null;
  base_output_price_per_1k: number | null;

  // Metadata
  created_at: string;
  updated_at: string;
}
```

### Subscription Model Interface

```typescript
interface LLMSubscription {
  subscription_id: string;
  plan_name: string;
  quantity: number;
  unit_price_usd: number;
  effective_date: string;
  notes: string | null;

  // Tier classification
  tier_type: TierType;

  // Trial
  trial_end_date: string | null;
  trial_credit_usd: number | null;

  // Rate limits
  rpm_limit: number | null;
  tpm_limit: number | null;
  rpd_limit: number | null;
  tpd_limit: number | null;
  concurrent_limit: number | null;
  monthly_token_limit: number | null;
  daily_token_limit: number | null;

  // Commitment
  committed_spend_usd: number | null;
  commitment_term_months: number | null;
  discount_percentage: number | null;

  // Metadata
  created_at: string;
  updated_at: string;
}
```

---

## API Integration

### Backend Client Functions

```typescript
// lib/api/llm-config.ts

export async function getPricing(
  orgSlug: string,
  provider: string
): Promise<LLMPricingModel[]> {
  const response = await backendFetch(
    `${PIPELINE_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing`
  );
  return response.pricing;
}

export async function createPricing(
  orgSlug: string,
  provider: string,
  data: Partial<LLMPricingModel>
): Promise<LLMPricingModel> {
  return backendFetch(
    `${PIPELINE_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing`,
    { method: 'POST', body: JSON.stringify(data) }
  );
}

export async function updatePricing(
  orgSlug: string,
  provider: string,
  modelId: string,
  data: Partial<LLMPricingModel>
): Promise<LLMPricingModel> {
  return backendFetch(
    `${PIPELINE_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing/${modelId}`,
    { method: 'PUT', body: JSON.stringify(data) }
  );
}

export async function getSubscriptions(
  orgSlug: string,
  provider: string
): Promise<LLMSubscription[]> {
  const response = await backendFetch(
    `${PIPELINE_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/subscriptions`
  );
  return response.subscriptions;
}
```

### Server Actions

```typescript
// actions/llm-config.ts
'use server'

export async function updateModelPricing(
  provider: string,
  modelId: string,
  formData: FormData
) {
  const orgSlug = await getCurrentOrgSlug();
  const apiKey = await getOrgApiKey(orgSlug);

  const data = {
    input_price_per_1k: parseFloat(formData.get('input_price') as string),
    output_price_per_1k: parseFloat(formData.get('output_price') as string),
    pricing_type: formData.get('pricing_type') as PricingType,
    discount_percentage: formData.get('discount_percentage')
      ? parseFloat(formData.get('discount_percentage') as string)
      : null,
  };

  return updatePricing(orgSlug, provider, modelId, data);
}
```

---

## UI Components

### PricingTable Component

```tsx
// components/llm-config/PricingTable.tsx

interface PricingTableProps {
  provider: string;
  pricing: LLMPricingModel[];
  onEdit: (model: LLMPricingModel) => void;
  onToggle: (modelId: string, enabled: boolean) => void;
}

export function PricingTable({ provider, pricing, onEdit, onToggle }: PricingTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          <TableHead>Input/1K</TableHead>
          <TableHead>Output/1K</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Free Tier</TableHead>
          <TableHead>Discount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pricing.map((model) => (
          <TableRow key={model.model_id}>
            <TableCell>
              <div className="font-medium">{model.model_name || model.model_id}</div>
              <div className="text-sm text-muted-foreground">{model.model_id}</div>
            </TableCell>
            <TableCell>${model.input_price_per_1k.toFixed(6)}</TableCell>
            <TableCell>${model.output_price_per_1k.toFixed(6)}</TableCell>
            <TableCell>
              <Badge variant={model.pricing_type === 'standard' ? 'default' : 'secondary'}>
                {model.pricing_type}
              </Badge>
            </TableCell>
            <TableCell>
              {model.free_tier_input_tokens ? (
                <span>{formatTokens(model.free_tier_input_tokens)}/{model.free_tier_reset_frequency}</span>
              ) : '-'}
            </TableCell>
            <TableCell>
              {model.discount_percentage ? `${model.discount_percentage}%` : '-'}
            </TableCell>
            <TableCell>
              <Switch checked={model.is_enabled} onCheckedChange={(v) => onToggle(model.model_id, v)} />
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => onEdit(model)}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### RateLimitGauge Component

```tsx
// components/llm-config/RateLimitGauge.tsx

interface RateLimitGaugeProps {
  label: string;
  current: number;
  limit: number;
  unit: string;
}

export function RateLimitGauge({ label, current, limit, unit }: RateLimitGaugeProps) {
  const percentage = Math.min((current / limit) * 100, 100);
  const isWarning = percentage > 80;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={isWarning ? 'text-orange-500' : ''}>
          {formatNumber(current)}/{formatNumber(limit)} {unit}
        </span>
      </div>
      <Progress value={percentage} className={isWarning ? 'bg-orange-100' : ''} />
    </div>
  );
}
```

---

## Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/settings/integrations` | `IntegrationsOverview` | All providers summary |
| `/settings/integrations/[provider]` | `ProviderSettings` | Provider detail page |
| `/settings/integrations/[provider]/pricing` | `PricingConfig` | Model pricing management |
| `/settings/integrations/[provider]/subscription` | `SubscriptionConfig` | Plan & rate limits |
| `/settings/integrations/[provider]/usage` | `UsageDashboard` | Usage vs limits |

---

## Related Documentation

- **Seed Data**: See `cloudact-api-service/docs/LLM_SUBSCRIPTION_SEED.md`
- **CRUD API**: See `cloudact-api-service/docs/LLM_SUBSCRIPTION_CRUD.md`
- **Backend Integration**: See `lib/api/backend.ts`
