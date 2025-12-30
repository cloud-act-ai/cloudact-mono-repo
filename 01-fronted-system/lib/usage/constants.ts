/**
 * Usage Constants
 *
 * Provider configurations, colors, and default values for usage displays.
 */

import type { UsageProviderConfig, UsageModelConfig } from "./types"

// ============================================
// GenAI Provider Configuration
// ============================================

/**
 * GenAI provider display names
 */
export const GENAI_PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  cohere: "Cohere",
  mistral: "Mistral AI",
  meta: "Meta AI",
  llama: "Meta Llama",
  azure_openai: "Azure OpenAI",
  aws_bedrock: "AWS Bedrock",
  vertex_ai: "Vertex AI",
  groq: "Groq",
  perplexity: "Perplexity",
  together: "Together AI",
  fireworks: "Fireworks AI",
  replicate: "Replicate",
  huggingface: "Hugging Face",
}

/**
 * GenAI provider colors (consistent with cost dashboards)
 */
export const GENAI_PROVIDER_COLORS: Record<string, string> = {
  openai: "#10A37F",       // OpenAI green
  anthropic: "#D97757",    // Anthropic coral/orange
  gemini: "#4285F4",       // Google blue
  google: "#4285F4",       // Google blue
  deepseek: "#6366F1",     // DeepSeek indigo
  cohere: "#FF6B6B",       // Cohere red
  mistral: "#F97316",      // Mistral orange
  meta: "#0668E1",         // Meta blue
  llama: "#0668E1",        // Meta blue
  azure_openai: "#0078D4", // Azure blue
  aws_bedrock: "#FF9900",  // AWS orange
  vertex_ai: "#4285F4",    // Google blue
  groq: "#8B5CF6",         // Groq purple
  perplexity: "#22D3EE",   // Perplexity cyan
  together: "#EC4899",     // Together pink
  fireworks: "#EF4444",    // Fireworks red
  replicate: "#6366F1",    // Replicate indigo
  huggingface: "#FFD21E",  // Hugging Face yellow
}

/**
 * GenAI provider config for usage displays
 */
export const GENAI_PROVIDER_CONFIG: UsageProviderConfig = {
  names: GENAI_PROVIDER_NAMES,
  colors: GENAI_PROVIDER_COLORS,
  defaultColor: "#94a3b8", // slate-400
  defaultType: "LLM API",
}

// ============================================
// Model Configuration
// ============================================

/**
 * Popular model display names
 */
export const MODEL_NAMES: Record<string, string> = {
  // OpenAI
  "gpt-4": "GPT-4",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-3.5-turbo": "GPT-3.5 Turbo",
  "o1": "O1",
  "o1-mini": "O1 Mini",
  "o1-preview": "O1 Preview",

  // Anthropic
  "claude-3-opus": "Claude 3 Opus",
  "claude-3-sonnet": "Claude 3 Sonnet",
  "claude-3-haiku": "Claude 3 Haiku",
  "claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "claude-3.5-haiku": "Claude 3.5 Haiku",
  "claude-opus-4": "Claude Opus 4",
  "claude-sonnet-4": "Claude Sonnet 4",

  // Google
  "gemini-pro": "Gemini Pro",
  "gemini-1.5-pro": "Gemini 1.5 Pro",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-ultra": "Gemini Ultra",

  // DeepSeek
  "deepseek-chat": "DeepSeek Chat",
  "deepseek-coder": "DeepSeek Coder",
  "deepseek-v3": "DeepSeek V3",

  // Mistral
  "mistral-large": "Mistral Large",
  "mistral-medium": "Mistral Medium",
  "mistral-small": "Mistral Small",
  "mixtral-8x7b": "Mixtral 8x7B",
  "mixtral-8x22b": "Mixtral 8x22B",

  // Meta
  "llama-3": "Llama 3",
  "llama-3.1": "Llama 3.1",
  "llama-3.2": "Llama 3.2",
  "llama-3.3": "Llama 3.3",
  "llama-70b": "Llama 70B",
  "llama-405b": "Llama 405B",
}

/**
 * Model to provider mapping
 */
export const MODEL_PROVIDERS: Record<string, string> = {
  // OpenAI
  "gpt-4": "openai",
  "gpt-4-turbo": "openai",
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-3.5-turbo": "openai",
  "o1": "openai",
  "o1-mini": "openai",
  "o1-preview": "openai",

  // Anthropic
  "claude-3-opus": "anthropic",
  "claude-3-sonnet": "anthropic",
  "claude-3-haiku": "anthropic",
  "claude-3.5-sonnet": "anthropic",
  "claude-3.5-haiku": "anthropic",
  "claude-opus-4": "anthropic",
  "claude-sonnet-4": "anthropic",

  // Google
  "gemini-pro": "gemini",
  "gemini-1.5-pro": "gemini",
  "gemini-1.5-flash": "gemini",
  "gemini-2.0-flash": "gemini",
  "gemini-ultra": "gemini",

  // DeepSeek
  "deepseek-chat": "deepseek",
  "deepseek-coder": "deepseek",
  "deepseek-v3": "deepseek",

  // Mistral
  "mistral-large": "mistral",
  "mistral-medium": "mistral",
  "mistral-small": "mistral",
  "mixtral-8x7b": "mistral",
  "mixtral-8x22b": "mistral",

  // Meta
  "llama-3": "meta",
  "llama-3.1": "meta",
  "llama-3.2": "meta",
  "llama-3.3": "meta",
  "llama-70b": "meta",
  "llama-405b": "meta",
}

/**
 * Model context windows (max tokens)
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  "gpt-4": 8192,
  "gpt-4-turbo": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-3.5-turbo": 16385,
  "o1": 200000,
  "o1-mini": 128000,

  // Anthropic
  "claude-3-opus": 200000,
  "claude-3-sonnet": 200000,
  "claude-3-haiku": 200000,
  "claude-3.5-sonnet": 200000,
  "claude-3.5-haiku": 200000,
  "claude-opus-4": 200000,
  "claude-sonnet-4": 200000,

  // Google
  "gemini-pro": 32768,
  "gemini-1.5-pro": 2000000,
  "gemini-1.5-flash": 1000000,
  "gemini-2.0-flash": 1000000,

  // DeepSeek
  "deepseek-chat": 64000,
  "deepseek-coder": 64000,
  "deepseek-v3": 64000,

  // Mistral
  "mistral-large": 128000,
  "mistral-medium": 32000,
  "mistral-small": 32000,
  "mixtral-8x7b": 32768,
  "mixtral-8x22b": 65536,
}

/**
 * Model configuration for usage displays
 */
export const GENAI_MODEL_CONFIG: UsageModelConfig = {
  names: MODEL_NAMES,
  providers: MODEL_PROVIDERS,
  contextWindows: MODEL_CONTEXT_WINDOWS,
}

// ============================================
// Default Values
// ============================================

/**
 * Default currency for usage cost calculations
 */
export const DEFAULT_USAGE_CURRENCY = "USD"

/**
 * Default chart colors for breakdown items
 */
export const DEFAULT_CHART_COLORS = [
  "#10A37F", // OpenAI green
  "#D97757", // Anthropic coral
  "#4285F4", // Google blue
  "#6366F1", // Indigo
  "#EC4899", // Pink
  "#F97316", // Orange
  "#22D3EE", // Cyan
  "#8B5CF6", // Purple
  "#84CC16", // Lime
  "#EF4444", // Red
]

/**
 * Get color by index (cycles through defaults)
 */
export function getColorByIndex(index: number): string {
  return DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]
}

// ============================================
// Token Formatting Constants
// ============================================

/**
 * Token display thresholds
 */
export const TOKEN_THRESHOLDS = {
  THOUSAND: 1_000,
  MILLION: 1_000_000,
  BILLION: 1_000_000_000,
}

/**
 * Token display suffixes
 */
export const TOKEN_SUFFIXES = {
  THOUSAND: "K",
  MILLION: "M",
  BILLION: "B",
}

// ============================================
// Provider Sets (for filtering)
// ============================================

/**
 * Set of known GenAI providers
 */
export const GENAI_PROVIDER_SET = new Set([
  "openai",
  "anthropic",
  "gemini",
  "google",
  "deepseek",
  "cohere",
  "mistral",
  "meta",
  "llama",
  "azure_openai",
  "aws_bedrock",
  "vertex_ai",
  "groq",
  "perplexity",
  "together",
  "fireworks",
  "replicate",
  "huggingface",
])

/**
 * Check if a provider is a known GenAI provider
 */
export function isGenAIProvider(provider: string): boolean {
  return GENAI_PROVIDER_SET.has(provider.toLowerCase())
}

/**
 * Get provider from model name (best effort)
 */
export function getProviderFromModel(model: string): string | null {
  const normalized = model.toLowerCase()

  // Check exact match first
  if (MODEL_PROVIDERS[normalized]) {
    return MODEL_PROVIDERS[normalized]
  }

  // Check partial matches
  if (normalized.includes("gpt") || normalized.includes("o1")) {
    return "openai"
  }
  if (normalized.includes("claude")) {
    return "anthropic"
  }
  if (normalized.includes("gemini")) {
    return "gemini"
  }
  if (normalized.includes("deepseek")) {
    return "deepseek"
  }
  if (normalized.includes("mistral") || normalized.includes("mixtral")) {
    return "mistral"
  }
  if (normalized.includes("llama")) {
    return "meta"
  }

  return null
}
