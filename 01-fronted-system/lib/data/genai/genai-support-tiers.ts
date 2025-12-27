/**
 * GenAI Support Tiers Data
 * Support plans and SLAs for providers
 * Source: ZZ-PRE-ANALLISYS/data/pricing/genai_support_tiers.csv
 */

export interface GenAISupportTier {
  provider: string;
  support_tier: string;
  tier_order: number;
  monthly_base_cost: number;
  spend_percentage: number;
  min_monthly_spend: number;
  response_time_critical: string | null;
  response_time_high: string | null;
  response_time_normal: string | null;
  uptime_sla_pct: number | null;
  dedicated_tam: boolean;
  phone_support: boolean;
  slack_support: boolean;
  training_included: boolean;
  effective_from: string;
  effective_to: string | null;
  status: string;
  notes: string;
}

export const GENAI_SUPPORT_TIERS: GenAISupportTier[] = [
  // OpenAI Support
  {
    provider: "openai",
    support_tier: "free",
    tier_order: 0,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: null,
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Community/docs only"
  },
  {
    provider: "openai",
    support_tier: "usage-tier-1",
    tier_order: 1,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: "24h",
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "<$100/month usage"
  },
  {
    provider: "openai",
    support_tier: "usage-tier-2",
    tier_order: 2,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 100,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: "12h",
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "$100-$1K/month"
  },
  {
    provider: "openai",
    support_tier: "usage-tier-3",
    tier_order: 3,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 1000,
    response_time_critical: null,
    response_time_high: "4h",
    response_time_normal: "8h",
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "$1K-$10K/month"
  },
  {
    provider: "openai",
    support_tier: "usage-tier-4",
    tier_order: 4,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 10000,
    response_time_critical: "1h",
    response_time_high: "2h",
    response_time_normal: "4h",
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: true,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "$10K-$100K/month"
  },
  {
    provider: "openai",
    support_tier: "usage-tier-5",
    tier_order: 5,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 100000,
    response_time_critical: "15min",
    response_time_high: "1h",
    response_time_normal: "2h",
    uptime_sla_pct: 99.9,
    dedicated_tam: true,
    phone_support: true,
    slack_support: true,
    training_included: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enterprise >$100K"
  },
  // Anthropic Support
  {
    provider: "anthropic",
    support_tier: "free",
    tier_order: 0,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: null,
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Community/docs"
  },
  {
    provider: "anthropic",
    support_tier: "developer",
    tier_order: 1,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: "24h",
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Basic support"
  },
  {
    provider: "anthropic",
    support_tier: "team",
    tier_order: 2,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 400,
    response_time_critical: null,
    response_time_high: "8h",
    response_time_normal: "24h",
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: true,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Team tier"
  },
  {
    provider: "anthropic",
    support_tier: "enterprise",
    tier_order: 3,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: "1h",
    response_time_high: "4h",
    response_time_normal: "8h",
    uptime_sla_pct: 99.9,
    dedicated_tam: true,
    phone_support: true,
    slack_support: true,
    training_included: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Custom agreement"
  },
  // Gemini Support
  {
    provider: "gemini",
    support_tier: "free",
    tier_order: 0,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: null,
    uptime_sla_pct: null,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Community support"
  },
  {
    provider: "gemini",
    support_tier: "standard",
    tier_order: 1,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: "24h",
    response_time_normal: "48h",
    uptime_sla_pct: 99.0,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Standard support"
  },
  {
    provider: "gemini",
    support_tier: "enhanced",
    tier_order: 2,
    monthly_base_cost: 500,
    spend_percentage: 0,
    min_monthly_spend: 500,
    response_time_critical: "4h",
    response_time_high: "8h",
    response_time_normal: "24h",
    uptime_sla_pct: 99.5,
    dedicated_tam: false,
    phone_support: true,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enhanced support"
  },
  {
    provider: "gemini",
    support_tier: "premium",
    tier_order: 3,
    monthly_base_cost: 3000,
    spend_percentage: 0,
    min_monthly_spend: 10000,
    response_time_critical: "1h",
    response_time_high: "4h",
    response_time_normal: "8h",
    uptime_sla_pct: 99.9,
    dedicated_tam: true,
    phone_support: true,
    slack_support: true,
    training_included: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Premium support"
  },
  // Azure OpenAI Support
  {
    provider: "azure_openai",
    support_tier: "basic",
    tier_order: 0,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: "24h",
    uptime_sla_pct: 99.0,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Basic support"
  },
  {
    provider: "azure_openai",
    support_tier: "developer",
    tier_order: 1,
    monthly_base_cost: 29,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: "8h",
    response_time_normal: "24h",
    uptime_sla_pct: 99.5,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Developer support"
  },
  {
    provider: "azure_openai",
    support_tier: "standard",
    tier_order: 2,
    monthly_base_cost: 100,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: "4h",
    response_time_high: "8h",
    response_time_normal: "24h",
    uptime_sla_pct: 99.5,
    dedicated_tam: false,
    phone_support: true,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Standard support"
  },
  {
    provider: "azure_openai",
    support_tier: "professional",
    tier_order: 3,
    monthly_base_cost: 1000,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: "1h",
    response_time_high: "4h",
    response_time_normal: "8h",
    uptime_sla_pct: 99.9,
    dedicated_tam: false,
    phone_support: true,
    slack_support: true,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Professional direct"
  },
  {
    provider: "azure_openai",
    support_tier: "enterprise",
    tier_order: 4,
    monthly_base_cost: 0,
    spend_percentage: 10,
    min_monthly_spend: 50000,
    response_time_critical: "15min",
    response_time_high: "1h",
    response_time_normal: "4h",
    uptime_sla_pct: 99.95,
    dedicated_tam: true,
    phone_support: true,
    slack_support: true,
    training_included: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "10% of spend min $5K"
  },
  // AWS Bedrock Support
  {
    provider: "aws_bedrock",
    support_tier: "basic",
    tier_order: 0,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: "24h",
    uptime_sla_pct: 99.0,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Basic support"
  },
  {
    provider: "aws_bedrock",
    support_tier: "developer",
    tier_order: 1,
    monthly_base_cost: 29,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: "12h",
    response_time_normal: "24h",
    uptime_sla_pct: 99.5,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Developer support"
  },
  {
    provider: "aws_bedrock",
    support_tier: "business",
    tier_order: 2,
    monthly_base_cost: 100,
    spend_percentage: 3,
    min_monthly_spend: 0,
    response_time_critical: "4h",
    response_time_high: "12h",
    response_time_normal: "24h",
    uptime_sla_pct: 99.9,
    dedicated_tam: false,
    phone_support: true,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "3% spend or $100 min"
  },
  {
    provider: "aws_bedrock",
    support_tier: "enterprise",
    tier_order: 3,
    monthly_base_cost: 15000,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: "15min",
    response_time_high: "1h",
    response_time_normal: "4h",
    uptime_sla_pct: 99.99,
    dedicated_tam: true,
    phone_support: true,
    slack_support: true,
    training_included: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enterprise support"
  },
  // GCP Vertex Support
  {
    provider: "gcp_vertex",
    support_tier: "basic",
    tier_order: 0,
    monthly_base_cost: 0,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: null,
    response_time_normal: "24h",
    uptime_sla_pct: 99.0,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Basic support"
  },
  {
    provider: "gcp_vertex",
    support_tier: "standard",
    tier_order: 1,
    monthly_base_cost: 100,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: null,
    response_time_high: "8h",
    response_time_normal: "24h",
    uptime_sla_pct: 99.5,
    dedicated_tam: false,
    phone_support: false,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Standard support"
  },
  {
    provider: "gcp_vertex",
    support_tier: "enhanced",
    tier_order: 2,
    monthly_base_cost: 500,
    spend_percentage: 0,
    min_monthly_spend: 0,
    response_time_critical: "4h",
    response_time_high: "8h",
    response_time_normal: "24h",
    uptime_sla_pct: 99.9,
    dedicated_tam: false,
    phone_support: true,
    slack_support: false,
    training_included: false,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "Enhanced support"
  },
  {
    provider: "gcp_vertex",
    support_tier: "premium",
    tier_order: 3,
    monthly_base_cost: 0,
    spend_percentage: 4,
    min_monthly_spend: 12500,
    response_time_critical: "1h",
    response_time_high: "4h",
    response_time_normal: "8h",
    uptime_sla_pct: 99.99,
    dedicated_tam: true,
    phone_support: true,
    slack_support: true,
    training_included: true,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    notes: "4% spend min $12.5K"
  }
];

// Helper functions
export function getSupportTiersByProvider(provider: string): GenAISupportTier[] {
  return GENAI_SUPPORT_TIERS.filter(t => t.provider === provider).sort((a, b) => a.tier_order - b.tier_order);
}

export function getSupportTierForSpend(provider: string, monthlySpend: number): GenAISupportTier | undefined {
  const tiers = getSupportTiersByProvider(provider);
  return tiers.reverse().find(t => monthlySpend >= t.min_monthly_spend);
}

export function getActiveSupportTiers(): GenAISupportTier[] {
  return GENAI_SUPPORT_TIERS.filter(t => t.status === 'active');
}

export function getSupportProviders(): string[] {
  return [...new Set(GENAI_SUPPORT_TIERS.map(t => t.provider))];
}

export function calculateSupportCost(tier: GenAISupportTier, monthlySpend: number): number {
  if (tier.spend_percentage > 0) {
    return Math.max(tier.monthly_base_cost, monthlySpend * (tier.spend_percentage / 100));
  }
  return tier.monthly_base_cost;
}

export function parseResponseTime(responseTime: string | null): number | null {
  if (!responseTime) return null;

  const match = responseTime.match(/^(\d+)(min|h)$/);
  if (!match) return null;

  const [, value, unit] = match;
  const minutes = unit === 'h' ? parseInt(value) * 60 : parseInt(value);
  return minutes;
}
