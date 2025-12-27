/**
 * GenAI Training/Fine-tuning Pricing Data
 * Fine-tuning, distillation, and model customization pricing
 * Source: ZZ-PRE-ANALLISYS/data/pricing/genai_training_pricing.csv
 */

export interface GenAITrainingPricing {
  provider: string;
  training_type: string;
  model: string;
  base_model: string;
  region: string;
  training_per_1m_tokens: number;
  inference_input_per_1m: number;
  inference_output_per_1m: number;
  inference_cached_per_1m: number | null;
  min_epochs: number;
  max_epochs: number;
  min_examples: number;
  max_training_tokens: number;
  storage_per_gb_month: number;
  rate_limit_rpm: number;
  sla_uptime_pct: number;
  effective_from: string;
  effective_to: string | null;
  status: string;
  last_updated: string;
  notes: string;
}

export const GENAI_TRAINING_PRICING: GenAITrainingPricing[] = [
  // OpenAI Fine-tuning
  {
    provider: "openai",
    training_type: "fine-tuning",
    model: "gpt-4o-2024-08-06-ft",
    base_model: "gpt-4o",
    region: "global",
    training_per_1m_tokens: 25.00,
    inference_input_per_1m: 3.75,
    inference_output_per_1m: 15.00,
    inference_cached_per_1m: 1.875,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.9,
    effective_from: "2024-08-06",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "GPT-4o fine-tuning"
  },
  {
    provider: "openai",
    training_type: "fine-tuning",
    model: "gpt-4o-mini-2024-07-18-ft",
    base_model: "gpt-4o-mini",
    region: "global",
    training_per_1m_tokens: 3.00,
    inference_input_per_1m: 0.30,
    inference_output_per_1m: 1.20,
    inference_cached_per_1m: 0.15,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.9,
    effective_from: "2024-07-18",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "GPT-4o-mini fine-tuning"
  },
  {
    provider: "openai",
    training_type: "fine-tuning",
    model: "gpt-3.5-turbo-ft",
    base_model: "gpt-3.5-turbo",
    region: "global",
    training_per_1m_tokens: 8.00,
    inference_input_per_1m: 3.00,
    inference_output_per_1m: 6.00,
    inference_cached_per_1m: null,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.9,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "GPT-3.5 fine-tuning"
  },
  {
    provider: "openai",
    training_type: "fine-tuning",
    model: "davinci-002-ft",
    base_model: "davinci-002",
    region: "global",
    training_per_1m_tokens: 6.00,
    inference_input_per_1m: 12.00,
    inference_output_per_1m: 12.00,
    inference_cached_per_1m: null,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.9,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Davinci fine-tuning"
  },
  {
    provider: "openai",
    training_type: "fine-tuning",
    model: "babbage-002-ft",
    base_model: "babbage-002",
    region: "global",
    training_per_1m_tokens: 0.40,
    inference_input_per_1m: 1.60,
    inference_output_per_1m: 1.60,
    inference_cached_per_1m: null,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.9,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Babbage fine-tuning"
  },
  {
    provider: "openai",
    training_type: "distillation",
    model: "gpt-4o-mini-distilled",
    base_model: "gpt-4o",
    region: "global",
    training_per_1m_tokens: 3.00,
    inference_input_per_1m: 0.30,
    inference_output_per_1m: 1.20,
    inference_cached_per_1m: 0.15,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.9,
    effective_from: "2024-12-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Knowledge distillation"
  },
  {
    provider: "openai",
    training_type: "reinforcement",
    model: "o1-ft",
    base_model: "o1",
    region: "global",
    training_per_1m_tokens: 0,
    inference_input_per_1m: 0,
    inference_output_per_1m: 0,
    inference_cached_per_1m: null,
    min_epochs: 1,
    max_epochs: 10,
    min_examples: 100,
    max_training_tokens: 10000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 100,
    sla_uptime_pct: 99.0,
    effective_from: "2024-12-01",
    effective_to: null,
    status: "preview",
    last_updated: "2024-12-01",
    notes: "Reinforcement fine-tuning preview"
  },
  // Anthropic Fine-tuning
  {
    provider: "anthropic",
    training_type: "fine-tuning",
    model: "claude-3-haiku-ft",
    base_model: "claude-3-haiku",
    region: "global",
    training_per_1m_tokens: 5.00,
    inference_input_per_1m: 0.50,
    inference_output_per_1m: 1.25,
    inference_cached_per_1m: 0.05,
    min_epochs: 1,
    max_epochs: 20,
    min_examples: 50,
    max_training_tokens: 10000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 50,
    sla_uptime_pct: 99.9,
    effective_from: "2024-06-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Haiku fine-tuning (beta)"
  },
  // Gemini Fine-tuning
  {
    provider: "gemini",
    training_type: "fine-tuning",
    model: "gemini-1.5-flash-ft",
    base_model: "gemini-1.5-flash",
    region: "global",
    training_per_1m_tokens: 0,
    inference_input_per_1m: 0.075,
    inference_output_per_1m: 0.30,
    inference_cached_per_1m: 0.01875,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 100,
    max_training_tokens: 100000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 1000,
    sla_uptime_pct: 99.9,
    effective_from: "2024-05-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Free tuning (GA limited)"
  },
  {
    provider: "gemini",
    training_type: "fine-tuning",
    model: "gemini-1.5-pro-ft",
    base_model: "gemini-1.5-pro",
    region: "global",
    training_per_1m_tokens: 0,
    inference_input_per_1m: 1.25,
    inference_output_per_1m: 5.00,
    inference_cached_per_1m: 0.3125,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 100,
    max_training_tokens: 100000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 360,
    sla_uptime_pct: 99.9,
    effective_from: "2024-05-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Free tuning (GA limited)"
  },
  // Azure OpenAI Fine-tuning
  {
    provider: "azure_openai",
    training_type: "fine-tuning",
    model: "gpt-4o-ft",
    base_model: "gpt-4o",
    region: "eastus",
    training_per_1m_tokens: 25.00,
    inference_input_per_1m: 3.75,
    inference_output_per_1m: 15.00,
    inference_cached_per_1m: 1.875,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0.10,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.95,
    effective_from: "2024-11-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Azure GPT-4o fine-tuning"
  },
  {
    provider: "azure_openai",
    training_type: "fine-tuning",
    model: "gpt-4o-mini-ft",
    base_model: "gpt-4o-mini",
    region: "eastus",
    training_per_1m_tokens: 3.00,
    inference_input_per_1m: 0.30,
    inference_output_per_1m: 1.20,
    inference_cached_per_1m: 0.15,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0.10,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.95,
    effective_from: "2024-07-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Azure GPT-4o-mini fine-tuning"
  },
  {
    provider: "azure_openai",
    training_type: "fine-tuning",
    model: "gpt-35-turbo-ft",
    base_model: "gpt-35-turbo",
    region: "eastus",
    training_per_1m_tokens: 8.00,
    inference_input_per_1m: 3.00,
    inference_output_per_1m: 6.00,
    inference_cached_per_1m: null,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 10,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0.10,
    rate_limit_rpm: 500,
    sla_uptime_pct: 99.95,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Azure GPT-3.5 fine-tuning"
  },
  // AWS Bedrock Customization
  {
    provider: "aws_bedrock",
    training_type: "customization",
    model: "claude-3-haiku-custom",
    base_model: "claude-3-haiku",
    region: "us-east-1",
    training_per_1m_tokens: 5.00,
    inference_input_per_1m: 0.25,
    inference_output_per_1m: 1.25,
    inference_cached_per_1m: null,
    min_epochs: 1,
    max_epochs: 20,
    min_examples: 50,
    max_training_tokens: 10000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 50,
    sla_uptime_pct: 99.9,
    effective_from: "2024-06-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Bedrock model customization"
  },
  {
    provider: "aws_bedrock",
    training_type: "customization",
    model: "amazon-titan-custom",
    base_model: "amazon-titan",
    region: "us-east-1",
    training_per_1m_tokens: 0.80,
    inference_input_per_1m: 0.50,
    inference_output_per_1m: 1.00,
    inference_cached_per_1m: null,
    min_epochs: 1,
    max_epochs: 20,
    min_examples: 100,
    max_training_tokens: 50000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 100,
    sla_uptime_pct: 99.9,
    effective_from: "2024-01-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Titan customization"
  },
  // GCP Vertex Tuning
  {
    provider: "gcp_vertex",
    training_type: "tuning",
    model: "gemini-1.5-flash-tuned",
    base_model: "gemini-1.5-flash",
    region: "us-central1",
    training_per_1m_tokens: 0,
    inference_input_per_1m: 0.075,
    inference_output_per_1m: 0.30,
    inference_cached_per_1m: 0.01875,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 100,
    max_training_tokens: 100000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 1000,
    sla_uptime_pct: 99.9,
    effective_from: "2024-05-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Vertex supervised tuning"
  },
  {
    provider: "gcp_vertex",
    training_type: "tuning",
    model: "gemini-1.5-pro-tuned",
    base_model: "gemini-1.5-pro",
    region: "us-central1",
    training_per_1m_tokens: 0,
    inference_input_per_1m: 1.25,
    inference_output_per_1m: 5.00,
    inference_cached_per_1m: 0.3125,
    min_epochs: 1,
    max_epochs: 50,
    min_examples: 100,
    max_training_tokens: 100000000,
    storage_per_gb_month: 0,
    rate_limit_rpm: 360,
    sla_uptime_pct: 99.9,
    effective_from: "2024-05-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-01",
    notes: "Vertex supervised tuning"
  }
];

// Helper functions
export function getTrainingPricingByProvider(provider: string): GenAITrainingPricing[] {
  return GENAI_TRAINING_PRICING.filter(p => p.provider === provider);
}

export function getTrainingPricingByType(trainingType: string): GenAITrainingPricing[] {
  return GENAI_TRAINING_PRICING.filter(p => p.training_type === trainingType);
}

export function getTrainingPricingByBaseModel(baseModel: string): GenAITrainingPricing[] {
  return GENAI_TRAINING_PRICING.filter(p => p.base_model === baseModel);
}

export function getActiveTrainingPricing(): GenAITrainingPricing[] {
  return GENAI_TRAINING_PRICING.filter(p => p.status === 'active');
}

export function getTrainingProviders(): string[] {
  return [...new Set(GENAI_TRAINING_PRICING.map(p => p.provider))];
}

export function getTrainingTypes(): string[] {
  return [...new Set(GENAI_TRAINING_PRICING.map(p => p.training_type))];
}

export function calculateTrainingCost(
  pricing: GenAITrainingPricing,
  trainingTokens: number,
  epochs: number = 1
): number {
  return (trainingTokens / 1_000_000) * pricing.training_per_1m_tokens * epochs;
}

export function calculateFineTunedInferenceCost(
  pricing: GenAITrainingPricing,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const inputCost = (inputTokens / 1_000_000) * pricing.inference_input_per_1m;
  const outputCost = (outputTokens / 1_000_000) * pricing.inference_output_per_1m;
  const cachedCost = pricing.inference_cached_per_1m
    ? (cachedTokens / 1_000_000) * pricing.inference_cached_per_1m
    : 0;
  return inputCost + outputCost + cachedCost;
}
