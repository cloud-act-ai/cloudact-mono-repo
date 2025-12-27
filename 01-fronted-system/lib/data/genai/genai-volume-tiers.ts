/**
 * GenAI Volume Tiers Data
 * Volume-based discounts and pricing tiers for providers
 * Source: ZZ-PRE-ANALLISYS/data/pricing/genai_volume_tiers.csv
 */

export interface GenAIVolumeTier {
  provider: string;
  tier_name: string;
  tier_order: number;
  min_monthly_spend_usd: number;
  max_monthly_spend_usd: number;
  min_monthly_tokens: number;
  max_monthly_tokens: number;
  discount_pct: number;
  input_multiplier: number;
  output_multiplier: number;
  applies_to_cached: boolean;
  applies_to_batch: boolean;
  commitment_required: boolean;
  effective_from: string;
  effective_to: string | null;
  status: string;
  notes: string;
}

export const GENAI_VOLUME_TIERS: GenAIVolumeTier[] = [
  // OpenAI Tiers
  {
    provider: "openai",
    tier_name: "free",
    tier_order: 0,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: false,
    applies_to_batch: false,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Free tier limits only"
  },
  {
    provider: "openai",
    tier_name: "tier-1",
    tier_order: 1,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 1000,
    min_monthly_tokens: 0,
    max_monthly_tokens: 100000000,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Standard pricing"
  },
  {
    provider: "openai",
    tier_name: "tier-2",
    tier_order: 2,
    min_monthly_spend_usd: 1000,
    max_monthly_spend_usd: 5000,
    min_monthly_tokens: 100000000,
    max_monthly_tokens: 500000000,
    discount_pct: 5,
    input_multiplier: 0.95,
    output_multiplier: 0.95,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "5% volume discount"
  },
  {
    provider: "openai",
    tier_name: "tier-3",
    tier_order: 3,
    min_monthly_spend_usd: 5000,
    max_monthly_spend_usd: 25000,
    min_monthly_tokens: 500000000,
    max_monthly_tokens: 2500000000,
    discount_pct: 10,
    input_multiplier: 0.90,
    output_multiplier: 0.90,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "10% volume discount"
  },
  {
    provider: "openai",
    tier_name: "tier-4",
    tier_order: 4,
    min_monthly_spend_usd: 25000,
    max_monthly_spend_usd: 100000,
    min_monthly_tokens: 2500000000,
    max_monthly_tokens: 10000000000,
    discount_pct: 15,
    input_multiplier: 0.85,
    output_multiplier: 0.85,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "15% volume discount"
  },
  {
    provider: "openai",
    tier_name: "tier-5",
    tier_order: 5,
    min_monthly_spend_usd: 100000,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 10000000000,
    max_monthly_tokens: 0,
    discount_pct: 20,
    input_multiplier: 0.80,
    output_multiplier: 0.80,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enterprise 20%"
  },
  // Anthropic Tiers
  {
    provider: "anthropic",
    tier_name: "free",
    tier_order: 0,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: false,
    applies_to_batch: false,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Free tier limits only"
  },
  {
    provider: "anthropic",
    tier_name: "standard",
    tier_order: 1,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 1000,
    min_monthly_tokens: 0,
    max_monthly_tokens: 100000000,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Standard pricing"
  },
  {
    provider: "anthropic",
    tier_name: "growth",
    tier_order: 2,
    min_monthly_spend_usd: 1000,
    max_monthly_spend_usd: 10000,
    min_monthly_tokens: 100000000,
    max_monthly_tokens: 1000000000,
    discount_pct: 10,
    input_multiplier: 0.90,
    output_multiplier: 0.90,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "10% volume discount"
  },
  {
    provider: "anthropic",
    tier_name: "scale",
    tier_order: 3,
    min_monthly_spend_usd: 10000,
    max_monthly_spend_usd: 50000,
    min_monthly_tokens: 1000000000,
    max_monthly_tokens: 5000000000,
    discount_pct: 15,
    input_multiplier: 0.85,
    output_multiplier: 0.85,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "15% volume discount"
  },
  {
    provider: "anthropic",
    tier_name: "enterprise",
    tier_order: 4,
    min_monthly_spend_usd: 50000,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 5000000000,
    max_monthly_tokens: 0,
    discount_pct: 25,
    input_multiplier: 0.75,
    output_multiplier: 0.75,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enterprise 25%"
  },
  // Gemini Tiers
  {
    provider: "gemini",
    tier_name: "free",
    tier_order: 0,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 0,
    max_monthly_tokens: 1000000,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Free tier (1M tokens)"
  },
  {
    provider: "gemini",
    tier_name: "standard",
    tier_order: 1,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 500,
    min_monthly_tokens: 1000000,
    max_monthly_tokens: 500000000,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Standard pricing"
  },
  {
    provider: "gemini",
    tier_name: "growth",
    tier_order: 2,
    min_monthly_spend_usd: 500,
    max_monthly_spend_usd: 5000,
    min_monthly_tokens: 500000000,
    max_monthly_tokens: 5000000000,
    discount_pct: 10,
    input_multiplier: 0.90,
    output_multiplier: 0.90,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "10% volume discount"
  },
  {
    provider: "gemini",
    tier_name: "enterprise",
    tier_order: 3,
    min_monthly_spend_usd: 5000,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 5000000000,
    max_monthly_tokens: 0,
    discount_pct: 20,
    input_multiplier: 0.80,
    output_multiplier: 0.80,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enterprise 20%"
  },
  // Azure OpenAI Tiers
  {
    provider: "azure_openai",
    tier_name: "payg",
    tier_order: 1,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 10000,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Pay as you go"
  },
  {
    provider: "azure_openai",
    tier_name: "commitment-1yr",
    tier_order: 2,
    min_monthly_spend_usd: 10000,
    max_monthly_spend_usd: 50000,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 20,
    input_multiplier: 0.80,
    output_multiplier: 0.80,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "1-year commitment"
  },
  {
    provider: "azure_openai",
    tier_name: "commitment-3yr",
    tier_order: 3,
    min_monthly_spend_usd: 50000,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 35,
    input_multiplier: 0.65,
    output_multiplier: 0.65,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "3-year commitment"
  },
  // AWS Bedrock Tiers
  {
    provider: "aws_bedrock",
    tier_name: "on-demand",
    tier_order: 1,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 10000,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: false,
    applies_to_batch: false,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "On-demand pricing"
  },
  {
    provider: "aws_bedrock",
    tier_name: "provisioned",
    tier_order: 2,
    min_monthly_spend_usd: 10000,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 30,
    input_multiplier: 0.70,
    output_multiplier: 0.70,
    applies_to_cached: false,
    applies_to_batch: false,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Provisioned throughput"
  },
  // GCP Vertex Tiers
  {
    provider: "gcp_vertex",
    tier_name: "on-demand",
    tier_order: 1,
    min_monthly_spend_usd: 0,
    max_monthly_spend_usd: 5000,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 0,
    input_multiplier: 1.00,
    output_multiplier: 1.00,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "On-demand pricing"
  },
  {
    provider: "gcp_vertex",
    tier_name: "committed",
    tier_order: 2,
    min_monthly_spend_usd: 5000,
    max_monthly_spend_usd: 25000,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 15,
    input_multiplier: 0.85,
    output_multiplier: 0.85,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Committed use"
  },
  {
    provider: "gcp_vertex",
    tier_name: "enterprise",
    tier_order: 3,
    min_monthly_spend_usd: 25000,
    max_monthly_spend_usd: 0,
    min_monthly_tokens: 0,
    max_monthly_tokens: 0,
    discount_pct: 25,
    input_multiplier: 0.75,
    output_multiplier: 0.75,
    applies_to_cached: true,
    applies_to_batch: true,
    commitment_required: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enterprise agreement"
  }
];

// Helper functions
export function getVolumeTiersByProvider(provider: string): GenAIVolumeTier[] {
  return GENAI_VOLUME_TIERS.filter(t => t.provider === provider).sort((a, b) => a.tier_order - b.tier_order);
}

export function getVolumeTierForSpend(provider: string, monthlySpend: number): GenAIVolumeTier | undefined {
  const tiers = getVolumeTiersByProvider(provider);
  return tiers.find(t =>
    monthlySpend >= t.min_monthly_spend_usd &&
    (t.max_monthly_spend_usd === 0 || monthlySpend < t.max_monthly_spend_usd)
  );
}

export function getVolumeTierForTokens(provider: string, monthlyTokens: number): GenAIVolumeTier | undefined {
  const tiers = getVolumeTiersByProvider(provider);
  return tiers.find(t =>
    monthlyTokens >= t.min_monthly_tokens &&
    (t.max_monthly_tokens === 0 || monthlyTokens < t.max_monthly_tokens)
  );
}

export function getActiveVolumeTiers(): GenAIVolumeTier[] {
  return GENAI_VOLUME_TIERS.filter(t => t.status === 'active');
}

export function getVolumeProviders(): string[] {
  return [...new Set(GENAI_VOLUME_TIERS.map(t => t.provider))];
}

export function calculateDiscountedCost(
  baseCost: number,
  tier: GenAIVolumeTier
): number {
  return baseCost * (1 - tier.discount_pct / 100);
}
