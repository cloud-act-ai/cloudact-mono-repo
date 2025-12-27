/**
 * GenAI Commitment Pricing Data
 * PTU (Provisioned Throughput Units) / GSU pricing for Azure OpenAI, AWS Bedrock, GCP Vertex
 * Source: ZZ-PRE-ANALLISYS/data/pricing/genai_commitment_pricing.csv
 */

export interface GenAICommitmentPricing {
  provider: string;
  commitment_type: string;
  model: string;
  model_group?: string | null;
  unit_name?: string | null;  // Issue #48: PTU type identifier
  region: string;
  ptu_hourly_rate: number | null;
  ptu_monthly_rate: number | null;
  // Issue #46: Standardized field names to match API schema
  min_units: number;          // Formerly min_ptu
  max_units: number;          // Formerly max_ptu
  commitment_term_months: number;
  min_commitment_months?: number;
  tokens_per_unit_minute: number | null;  // Formerly tokens_per_ptu_minute
  term_discount_pct: number;
  volume_discount_pct: number;
  supports_overage?: boolean;
  overage_rate_per_unit?: number | null;  // Issue #24: Added overage rate support
  status: string;
  last_updated: string;
}

export const GENAI_COMMITMENT_PRICING: GenAICommitmentPricing[] = [
  // Azure OpenAI PTU
  {
    provider: "azure_openai_ptu",
    commitment_type: "ptu",
    model: "gpt-4",
    region: "eastus",
    ptu_hourly_rate: 6.00,
    ptu_monthly_rate: 4380,
    min_units: 50,
    max_units: 1000,
    commitment_term_months: 1,
    tokens_per_unit_minute: 2500,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  {
    provider: "azure_openai_ptu",
    commitment_type: "ptu",
    model: "gpt-4-32k",
    region: "eastus",
    ptu_hourly_rate: 12.00,
    ptu_monthly_rate: 8760,
    min_units: 50,
    max_units: 500,
    commitment_term_months: 1,
    tokens_per_unit_minute: 1500,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  {
    provider: "azure_openai_ptu",
    commitment_type: "ptu",
    model: "gpt-4o",
    region: "eastus",
    ptu_hourly_rate: 4.00,
    ptu_monthly_rate: 2920,
    min_units: 50,
    max_units: 1000,
    commitment_term_months: 1,
    tokens_per_unit_minute: 3500,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  {
    provider: "azure_openai_ptu",
    commitment_type: "ptu",
    model: "gpt-4o-mini",
    region: "eastus",
    ptu_hourly_rate: 1.00,
    ptu_monthly_rate: 730,
    min_units: 10,
    max_units: 500,
    commitment_term_months: 1,
    tokens_per_unit_minute: 10000,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  {
    provider: "azure_openai_ptu",
    commitment_type: "ptu",
    model: "gpt-35-turbo",
    region: "eastus",
    ptu_hourly_rate: 0.50,
    ptu_monthly_rate: 365,
    min_units: 10,
    max_units: 1000,
    commitment_term_months: 1,
    tokens_per_unit_minute: 15000,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  // AWS Bedrock Provisioned Throughput
  {
    provider: "aws_bedrock_pt",
    commitment_type: "provisioned_throughput",
    model: "claude-3-sonnet",
    region: "us-east-1",
    ptu_hourly_rate: 35.00,
    ptu_monthly_rate: 25550,
    min_units: 1,
    max_units: 100,
    commitment_term_months: 1,
    tokens_per_unit_minute: null,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  {
    provider: "aws_bedrock_pt",
    commitment_type: "provisioned_throughput",
    model: "claude-3-haiku",
    region: "us-east-1",
    ptu_hourly_rate: 8.00,
    ptu_monthly_rate: 5840,
    min_units: 1,
    max_units: 100,
    commitment_term_months: 1,
    tokens_per_unit_minute: null,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  // GCP Vertex AI GSU (Generative AI Serving Units)
  {
    provider: "gcp_vertex_pt",
    commitment_type: "gsu",
    model: "gemini-2.0-flash",
    region: "us-central1",
    ptu_hourly_rate: null,
    ptu_monthly_rate: null,
    min_units: 1,
    max_units: 100,
    commitment_term_months: 1,
    tokens_per_unit_minute: 201600,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  {
    provider: "gcp_vertex_pt",
    commitment_type: "gsu",
    model: "gemini-2.5-flash",
    region: "us-central1",
    ptu_hourly_rate: null,
    ptu_monthly_rate: null,
    min_units: 1,
    max_units: 100,
    commitment_term_months: 1,
    tokens_per_unit_minute: 168000,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  },
  {
    provider: "gcp_vertex_pt",
    commitment_type: "gsu",
    model: "gemini-2.5-pro",
    region: "us-central1",
    ptu_hourly_rate: null,
    ptu_monthly_rate: null,
    min_units: 1,
    max_units: 50,
    commitment_term_months: 1,
    tokens_per_unit_minute: 60000,
    term_discount_pct: 0,
    volume_discount_pct: 0,
    status: "active",
    last_updated: "2024-12-01"
  }
];

// Helper functions
export function getCommitmentPricingByProvider(provider: string): GenAICommitmentPricing[] {
  return GENAI_COMMITMENT_PRICING.filter(p => p.provider === provider);
}

export function getCommitmentPricingByModel(provider: string, model: string): GenAICommitmentPricing | undefined {
  return GENAI_COMMITMENT_PRICING.find(p => p.provider === provider && p.model === model);
}

export function getCommitmentPricingByType(commitmentType: string): GenAICommitmentPricing[] {
  return GENAI_COMMITMENT_PRICING.filter(p => p.commitment_type === commitmentType);
}

export function getActiveCommitmentPricing(): GenAICommitmentPricing[] {
  return GENAI_COMMITMENT_PRICING.filter(p => p.status === 'active');
}

export function getCommitmentProviders(): string[] {
  return [...new Set(GENAI_COMMITMENT_PRICING.map(p => p.provider))];
}

/**
 * Calculate monthly commitment cost with unit validation
 * Handles both hourly and monthly rates, applies discounts
 */
export function calculateCommitmentMonthlyCost(
  pricing: GenAICommitmentPricing,
  units: number
): number {
  // Validate units within allowed range
  const validUnits = Math.max(pricing.min_units, Math.min(units, pricing.max_units));

  let baseCost = 0;
  if (pricing.ptu_monthly_rate) {
    baseCost = validUnits * pricing.ptu_monthly_rate;
  } else if (pricing.ptu_hourly_rate) {
    baseCost = validUnits * pricing.ptu_hourly_rate * 730; // ~hours per month
  }

  // Apply volume discount if applicable
  if (pricing.volume_discount_pct > 0) {
    baseCost = baseCost * (1 - pricing.volume_discount_pct / 100);
  }

  return baseCost;
}

/**
 * Calculate hourly commitment cost with unit validation
 */
export function calculateCommitmentHourlyCost(
  pricing: GenAICommitmentPricing,
  units: number
): number {
  // Validate units within allowed range
  const validUnits = Math.max(pricing.min_units, Math.min(units, pricing.max_units));

  let baseCost = 0;
  if (pricing.ptu_hourly_rate) {
    baseCost = validUnits * pricing.ptu_hourly_rate;
  } else if (pricing.ptu_monthly_rate) {
    baseCost = validUnits * pricing.ptu_monthly_rate / 730;
  }

  // Apply volume discount if applicable
  if (pricing.volume_discount_pct > 0) {
    baseCost = baseCost * (1 - pricing.volume_discount_pct / 100);
  }

  return baseCost;
}

/**
 * Calculate tokens per minute capacity for a given number of units
 */
export function calculateTokenCapacity(
  pricing: GenAICommitmentPricing,
  units: number
): number {
  if (!pricing.tokens_per_unit_minute) return 0;
  const validUnits = Math.max(pricing.min_units, Math.min(units, pricing.max_units));
  return validUnits * pricing.tokens_per_unit_minute;
}
