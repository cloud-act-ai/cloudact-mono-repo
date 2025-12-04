# LLM Pricing Configuration Pages

## Overview

This document describes the frontend pages for managing LLM model pricing configurations. Users can view, edit, and customize token pricing for each model, including free tier allocations and volume discounts.

## Architecture

```
Frontend (Next.js)
    │
    ├── /settings/integrations/{provider}/pricing         → Pricing table
    ├── /settings/integrations/{provider}/pricing/new     → Add custom model
    ├── /settings/integrations/{provider}/pricing/{model} → Edit model pricing
    └── /settings/integrations/{provider}/pricing/compare → Price comparison
    │
    ▼
Backend API (api-service:8000)
    │
    ├── GET/POST/PUT/DELETE .../pricing
    └── PATCH .../pricing (bulk update)
    │
    ▼
BigQuery: {org_slug}_prod.llm_model_pricing
```

**Note:** All CRUD operations go through `api-service` (port 8000). The `data-pipeline-service` (port 8001) only reads these tables for future cost calculations.

---

## Page Structure

### 1. Pricing Overview Table

**Route:** `/settings/integrations/{provider}/pricing`

Main pricing management page with sortable/filterable table:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OpenAI Model Pricing                                       [+ Add Model]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Filter: [All Types ▼]  [Enabled ▼]  Search: [________________]            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Model           │ Input/1M   │ Output/1M  │ Type      │ Free Tier │ ○ │   │
│  ├─────────────────┼────────────┼────────────┼───────────┼───────────┼───┤   │
│  │ gpt-4o          │ $2.50      │ $10.00     │ Standard  │ -         │ ✓ │   │
│  │ gpt-4o-mini     │ $0.15      │ $0.60      │ Standard  │ -         │ ✓ │   │
│  │ gpt-4-turbo     │ $10.00     │ $30.00     │ Standard  │ -         │ ✓ │   │
│  │ o1              │ $15.00     │ $60.00     │ Standard  │ -         │ ✓ │   │
│  │ o1-mini         │ $3.00      │ $12.00     │ Standard  │ -         │ ✓ │   │
│  │ custom-ft       │ $3.00      │ $12.00     │ Custom    │ 100M/mo   │ ✓ │   │
│  └─────────────────┴────────────┴────────────┴───────────┴───────────┴───┘   │
│                                                                             │
│  Showing 6 of 6 models                    [Bulk Edit]  [Reset to Defaults]  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Add/Edit Model Modal

**Route:** `/settings/integrations/{provider}/pricing/new` or `/{model_id}`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Add Custom Pricing Model                                              [X]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ── Model Information ──────────────────────────────────────────────────   │
│                                                                             │
│  Model ID*:        [ft:gpt-4o:acme:support:abc123     ]                    │
│  Display Name:     [GPT-4o Fine-tuned (Support)      ]                    │
│                                                                             │
│  ── Token Pricing ──────────────────────────────────────────────────────   │
│                                                                             │
│  Input Price:      [$] [0.003    ] per 1K tokens                           │
│  Output Price:     [$] [0.012    ] per 1K tokens                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Cost Calculator                                                     │   │
│  │  ─────────────                                                       │   │
│  │  1M input + 500K output = $4.50                                      │   │
│  │  Compared to gpt-4o: +20% ($3.75 → $4.50)                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ── Pricing Type ───────────────────────────────────────────────────────   │
│                                                                             │
│  Type*: [Standard              ▼]                                          │
│         ● Standard           - Regular published pricing                    │
│         ○ Volume Discount    - Tiered by usage                             │
│         ○ Committed Use      - Pre-paid commitment (CUD)                   │
│         ○ Promotional        - Time-bounded offer                          │
│         ○ Negotiated         - Custom enterprise                           │
│                                                                             │
│  ── Free Tier (Optional) ───────────────────────────────────────────────   │
│                                                                             │
│  [✓] Enable Free Tier                                                      │
│                                                                             │
│      Input Tokens:  [100,000,000  ] per [Monthly ▼]                       │
│      Output Tokens: [50,000,000   ]                                        │
│                                                                             │
│  ── Discount (Volume/CUD/Promo) ────────────────────────────────────────   │
│                                                                             │
│  [ ] Apply Discount                                                        │
│                                                                             │
│      Discount:       [20    ]%                                             │
│      Reason:         [Volume          ▼]                                   │
│      Min Threshold:  [1,000,000,000   ] tokens/month                       │
│                                                                             │
│      Base Input:     [$] [0.0025  ] (reference price before discount)      │
│      Base Output:    [$] [0.01    ]                                        │
│                                                                             │
│  ── Validity ───────────────────────────────────────────────────────────   │
│                                                                             │
│  Effective Date*:   [2024-12-01     ]                                      │
│  End Date:          [               ] (leave empty for ongoing)            │
│                                                                             │
│  Notes:             [Fine-tuned for customer support use case    ]         │
│                                                                             │
│                                               [Cancel]  [Save Pricing]      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Volume Discount Wizard

**Route:** `/settings/integrations/{provider}/pricing/{model}/volume-tiers`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Configure Volume Tiers for gpt-4o                                     [X]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Base Price: $2.50/1M input, $10.00/1M output                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Tier │ Threshold      │ Discount │ Input/1M │ Output/1M │ Action    │   │
│  ├──────┼────────────────┼──────────┼──────────┼───────────┼───────────┤   │
│  │ 1    │ 0 tokens       │ 0%       │ $2.50    │ $10.00    │ (base)    │   │
│  │ 2    │ 1B tokens/mo   │ 20%      │ $2.00    │ $8.00     │ [Edit][X] │   │
│  │ 3    │ 5B tokens/mo   │ 30%      │ $1.75    │ $7.00     │ [Edit][X] │   │
│  │ 4    │ 10B tokens/mo  │ 40%      │ $1.50    │ $6.00     │ [Edit][X] │   │
│  └──────┴────────────────┴──────────┴──────────┴───────────┴───────────┘   │
│                                                                             │
│                                                          [+ Add Tier]       │
│                                                                             │
│  ── Savings Calculator ─────────────────────────────────────────────────   │
│                                                                             │
│  Monthly Usage: [3,000,000,000    ] tokens                                 │
│                                                                             │
│  Standard Cost:    $7,500.00                                               │
│  Discounted Cost:  $6,000.00 (Tier 2 - 20% off)                           │
│  Monthly Savings:  $1,500.00                                               │
│                                                                             │
│                                               [Cancel]  [Save All Tiers]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4. Price Comparison View

**Route:** `/settings/integrations/{provider}/pricing/compare`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Model Price Comparison                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Compare: [All Providers ▼]  Sort by: [Input Price ▼]  [↑ Ascending]       │
│                                                                             │
│  ── Input Token Pricing (per 1M) ───────────────────────────────────────   │
│                                                                             │
│  gemini-1.5-flash-8b  ████                              $0.0375            │
│  gemini-1.5-flash     ████                              $0.075             │
│  gemini-2.0-flash     █████                             $0.10              │
│  gpt-4o-mini          ██████                            $0.15              │
│  claude-3-haiku       ██████████                        $0.25              │
│  gpt-4o               █████████████████████████         $2.50              │
│  claude-3-5-sonnet    ██████████████████████████        $3.00              │
│  gpt-4-turbo          ████████████████████████████████  $10.00             │
│  claude-3-opus        ████████████████████████████████  $15.00             │
│                                                                             │
│  ── Output Token Pricing (per 1M) ──────────────────────────────────────   │
│                                                                             │
│  gemini-1.5-flash-8b  ███                               $0.15              │
│  gemini-1.5-flash     ████                              $0.30              │
│  gpt-4o-mini          █████                             $0.60              │
│  claude-3-haiku       ██████                            $1.25              │
│  gpt-4o               █████████████████████             $10.00             │
│  claude-3-5-sonnet    ███████████████████████████       $15.00             │
│  gpt-4-turbo          ████████████████████████████████  $30.00             │
│  claude-3-opus        ████████████████████████████████  $75.00             │
│                                                                             │
│  ── Free Tier Comparison ───────────────────────────────────────────────   │
│                                                                             │
│  │ Provider │ Model              │ Daily Free  │ Reset    │                │
│  ├──────────┼────────────────────┼─────────────┼──────────┤                │
│  │ Gemini   │ gemini-2.0-flash   │ 2B tokens   │ Daily    │                │
│  │ Gemini   │ gemini-1.5-flash   │ 1B tokens   │ Daily    │                │
│  │ Gemini   │ gemini-1.5-pro     │ 50M tokens  │ Daily    │                │
│  │ OpenAI   │ -                  │ No free tier│ -        │                │
│  │ Anthropic│ -                  │ $5 credit   │ One-time │                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5. Free Tier Usage Dashboard

**Route:** `/settings/integrations/{provider}/pricing/free-tier`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Gemini Free Tier Usage                              Resets in: 4h 23m      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ── gemini-2.0-flash ───────────────────────────────────────────────────   │
│                                                                             │
│  Input Tokens:                                                              │
│  [██████████████████████████████░░░░░░░░░░] 1.5B / 2B (75%)                │
│                                                                             │
│  Output Tokens:                                                             │
│  [████████████████████░░░░░░░░░░░░░░░░░░░░] 1.0B / 2B (50%)                │
│                                                                             │
│  Estimated billable today: $0.00 (within free tier)                        │
│                                                                             │
│  ── gemini-1.5-pro ─────────────────────────────────────────────────────   │
│                                                                             │
│  Input Tokens:                                                              │
│  [██████████████████████████████████████████████████] 52M / 50M (104%)     │
│                                                                             │
│  Output Tokens:                                                             │
│  [████████████████████████████████████████░░░░░░░░░░] 40M / 50M (80%)      │
│                                                                             │
│  ⚠️ Exceeded free tier! Billable: 2M input tokens                          │
│  Estimated billable today: $2.50                                           │
│                                                                             │
│  ── Recommendations ────────────────────────────────────────────────────   │
│                                                                             │
│  • Consider using gemini-1.5-flash for high-volume tasks (1B free/day)     │
│  • Your gemini-1.5-pro usage exceeds free tier - review usage patterns     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models (TypeScript)

### Interfaces

```typescript
// types/llm-pricing.ts

export type PricingType =
  | 'standard'
  | 'free_tier'
  | 'volume_discount'
  | 'committed_use'
  | 'promotional'
  | 'negotiated';

export type FreeTierResetFrequency = 'daily' | 'monthly' | 'never';

export type DiscountReason =
  | 'volume'
  | 'commitment'
  | 'promotion'
  | 'negotiated'
  | 'trial';

export interface LLMPricingModel {
  pricing_id: string;
  provider: string;
  model_id: string;
  model_name: string | null;
  is_custom: boolean;
  input_price_per_1k: number;
  output_price_per_1k: number;
  effective_date: string;
  end_date: string | null;
  is_enabled: boolean;
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

  // Provider-specific
  x_gemini_context_window?: string;
  x_openai_batch_input_price?: number;
  x_openai_batch_output_price?: number;

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface LLMPricingCreateRequest {
  model_id: string;
  model_name?: string;
  input_price_per_1k: number;
  output_price_per_1k: number;
  effective_date: string;
  end_date?: string;
  notes?: string;
  pricing_type?: PricingType;
  free_tier_input_tokens?: number;
  free_tier_output_tokens?: number;
  free_tier_reset_frequency?: FreeTierResetFrequency;
  discount_percentage?: number;
  discount_reason?: DiscountReason;
  volume_threshold_tokens?: number;
  base_input_price_per_1k?: number;
  base_output_price_per_1k?: number;
}

export interface LLMPricingListResponse {
  org_slug: string;
  provider: string;
  pricing: LLMPricingModel[];
  count: number;
}
```

### Utility Functions

```typescript
// lib/utils/pricing.ts

export function formatTokenPrice(pricePerK: number): string {
  const pricePerM = pricePerK * 1000;
  if (pricePerM < 0.01) {
    return `$${pricePerM.toFixed(4)}`;
  }
  return `$${pricePerM.toFixed(2)}`;
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: LLMPricingModel
): number {
  const freeTierInput = pricing.free_tier_input_tokens || 0;
  const freeTierOutput = pricing.free_tier_output_tokens || 0;

  const billableInput = Math.max(0, inputTokens - freeTierInput);
  const billableOutput = Math.max(0, outputTokens - freeTierOutput);

  return (
    (billableInput / 1000) * pricing.input_price_per_1k +
    (billableOutput / 1000) * pricing.output_price_per_1k
  );
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function getEffectivePrice(
  pricing: LLMPricingModel,
  monthlyTokens: number
): { input: number; output: number; discount: number } {
  if (
    pricing.pricing_type === 'volume_discount' &&
    pricing.volume_threshold_tokens &&
    monthlyTokens >= pricing.volume_threshold_tokens
  ) {
    return {
      input: pricing.input_price_per_1k,
      output: pricing.output_price_per_1k,
      discount: pricing.discount_percentage || 0,
    };
  }
  return {
    input: pricing.base_input_price_per_1k || pricing.input_price_per_1k,
    output: pricing.base_output_price_per_1k || pricing.output_price_per_1k,
    discount: 0,
  };
}
```

---

## API Integration

### Backend Client

```typescript
// lib/api/llm-pricing.ts

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL || 'http://localhost:8000';

export async function getPricing(
  orgSlug: string,
  provider: string,
  options?: { isEnabled?: boolean; pricingType?: string }
): Promise<LLMPricingListResponse> {
  const params = new URLSearchParams();
  if (options?.isEnabled !== undefined) {
    params.set('is_enabled', String(options.isEnabled));
  }
  if (options?.pricingType) {
    params.set('pricing_type', options.pricingType);
  }

  const response = await backendFetch(
    `${API_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing?${params}`
  );
  return response;
}

export async function createPricing(
  orgSlug: string,
  provider: string,
  data: LLMPricingCreateRequest
): Promise<LLMPricingModel> {
  return backendFetch(
    `${API_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function updatePricing(
  orgSlug: string,
  provider: string,
  modelId: string,
  data: Partial<LLMPricingCreateRequest>
): Promise<LLMPricingModel> {
  return backendFetch(
    `${API_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing/${encodeURIComponent(modelId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
}

export async function deletePricing(
  orgSlug: string,
  provider: string,
  modelId: string
): Promise<void> {
  await backendFetch(
    `${API_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing/${encodeURIComponent(modelId)}`,
    { method: 'DELETE' }
  );
}

export async function bulkUpdatePricing(
  orgSlug: string,
  provider: string,
  updates: Array<{ model_id: string } & Partial<LLMPricingCreateRequest>>
): Promise<{ updated: number; errors: string[] }> {
  return backendFetch(
    `${API_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing`,
    {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    }
  );
}

export async function resetPricing(
  orgSlug: string,
  provider: string
): Promise<{ reset_count: number; preserved_custom: number }> {
  return backendFetch(
    `${API_SERVICE_URL}/api/v1/integrations/${orgSlug}/${provider}/pricing/reset`,
    { method: 'POST' }
  );
}
```

### Server Actions

```typescript
// actions/llm-pricing.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrgSlug, getOrgApiKey } from '@/lib/auth';
import { createPricing, updatePricing, deletePricing } from '@/lib/api/llm-pricing';

export async function createModelPricingAction(
  provider: string,
  formData: FormData
) {
  const orgSlug = await getCurrentOrgSlug();

  const data: LLMPricingCreateRequest = {
    model_id: formData.get('model_id') as string,
    model_name: formData.get('model_name') as string || undefined,
    input_price_per_1k: parseFloat(formData.get('input_price') as string),
    output_price_per_1k: parseFloat(formData.get('output_price') as string),
    effective_date: formData.get('effective_date') as string,
    pricing_type: (formData.get('pricing_type') as PricingType) || 'standard',
  };

  // Handle free tier
  if (formData.get('enable_free_tier') === 'on') {
    data.free_tier_input_tokens = parseInt(formData.get('free_input') as string) || undefined;
    data.free_tier_output_tokens = parseInt(formData.get('free_output') as string) || undefined;
    data.free_tier_reset_frequency = formData.get('reset_frequency') as FreeTierResetFrequency;
  }

  // Handle discount
  if (formData.get('enable_discount') === 'on') {
    data.discount_percentage = parseFloat(formData.get('discount_pct') as string) || undefined;
    data.discount_reason = formData.get('discount_reason') as DiscountReason;
    data.volume_threshold_tokens = parseInt(formData.get('volume_threshold') as string) || undefined;
    data.base_input_price_per_1k = parseFloat(formData.get('base_input') as string) || undefined;
    data.base_output_price_per_1k = parseFloat(formData.get('base_output') as string) || undefined;
  }

  const result = await createPricing(orgSlug, provider, data);
  revalidatePath(`/settings/integrations/${provider}/pricing`);
  return result;
}

export async function deleteModelPricingAction(provider: string, modelId: string) {
  const orgSlug = await getCurrentOrgSlug();
  await deletePricing(orgSlug, provider, modelId);
  revalidatePath(`/settings/integrations/${provider}/pricing`);
}
```

---

## UI Components

### PricingTable

```tsx
// components/llm-pricing/PricingTable.tsx

interface PricingTableProps {
  provider: string;
  pricing: LLMPricingModel[];
  onEdit: (model: LLMPricingModel) => void;
  onDelete: (modelId: string) => void;
  onToggle: (modelId: string, enabled: boolean) => void;
}

export function PricingTable({
  provider,
  pricing,
  onEdit,
  onDelete,
  onToggle,
}: PricingTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Input/1M</TableHead>
          <TableHead className="text-right">Output/1M</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Free Tier</TableHead>
          <TableHead>Discount</TableHead>
          <TableHead className="text-center">Enabled</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pricing.map((model) => (
          <TableRow key={model.model_id}>
            <TableCell>
              <div className="font-medium">
                {model.model_name || model.model_id}
              </div>
              <div className="text-sm text-muted-foreground">
                {model.model_id}
              </div>
              {model.is_custom && (
                <Badge variant="outline" className="mt-1">Custom</Badge>
              )}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatTokenPrice(model.input_price_per_1k)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatTokenPrice(model.output_price_per_1k)}
            </TableCell>
            <TableCell>
              <Badge variant={getPricingTypeBadgeVariant(model.pricing_type)}>
                {model.pricing_type}
              </Badge>
            </TableCell>
            <TableCell>
              {model.free_tier_input_tokens ? (
                <div className="text-sm">
                  {formatTokenCount(model.free_tier_input_tokens)}
                  <span className="text-muted-foreground">
                    /{model.free_tier_reset_frequency}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              {model.discount_percentage ? (
                <span className="text-green-600">
                  {model.discount_percentage}% off
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="text-center">
              <Switch
                checked={model.is_enabled}
                onCheckedChange={(v) => onToggle(model.model_id, v)}
              />
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(model)}>
                    Edit Pricing
                  </DropdownMenuItem>
                  {model.is_custom && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(model.model_id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### FreeTierUsageCard

```tsx
// components/llm-pricing/FreeTierUsageCard.tsx

interface FreeTierUsageCardProps {
  model: LLMPricingModel;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  resetTime: Date;
}

export function FreeTierUsageCard({
  model,
  usage,
  resetTime,
}: FreeTierUsageCardProps) {
  const inputPct = model.free_tier_input_tokens
    ? (usage.input_tokens / model.free_tier_input_tokens) * 100
    : 0;
  const outputPct = model.free_tier_output_tokens
    ? (usage.output_tokens / model.free_tier_output_tokens) * 100
    : 0;

  const isOverInput = inputPct > 100;
  const isOverOutput = outputPct > 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{model.model_name || model.model_id}</CardTitle>
        <CardDescription>
          Resets {formatDistanceToNow(resetTime, { addSuffix: true })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Input Tokens</span>
            <span className={isOverInput ? 'text-red-500' : ''}>
              {formatTokenCount(usage.input_tokens)} /{' '}
              {formatTokenCount(model.free_tier_input_tokens!)}
            </span>
          </div>
          <Progress
            value={Math.min(inputPct, 100)}
            className={isOverInput ? 'bg-red-100' : ''}
          />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Output Tokens</span>
            <span className={isOverOutput ? 'text-red-500' : ''}>
              {formatTokenCount(usage.output_tokens)} /{' '}
              {formatTokenCount(model.free_tier_output_tokens!)}
            </span>
          </div>
          <Progress
            value={Math.min(outputPct, 100)}
            className={isOverOutput ? 'bg-red-100' : ''}
          />
        </div>
        {(isOverInput || isOverOutput) && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You've exceeded the free tier. Additional usage will be billed.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/settings/integrations/{provider}/pricing` | `PricingListPage` | Pricing table |
| `/settings/integrations/{provider}/pricing/new` | `PricingFormPage` | Add custom model |
| `/settings/integrations/{provider}/pricing/{model}` | `PricingFormPage` | Edit model |
| `/settings/integrations/{provider}/pricing/compare` | `PriceComparisonPage` | Compare prices |
| `/settings/integrations/{provider}/pricing/free-tier` | `FreeTierDashboard` | Free tier usage |
| `/settings/integrations/{provider}/pricing/{model}/volume-tiers` | `VolumeTierWizard` | Volume discounts |

---

## Related Documentation

- **Pricing Seed Data**: See `cloudact-api-service/docs/LLM_PRICING_SEED.md`
- **Pricing CRUD API**: See `cloudact-api-service/docs/LLM_PRICING_CRUD.md`
- **Subscription Config**: See `LLM_SUBSCRIPTION_CONFIG.md`
- **Backend Integration**: See `lib/api/backend.ts`
