/**
 * Application constants
 */

// Environment detection
export const isProduction = process.env.NODE_ENV === "production"
export const isDevelopment = process.env.NODE_ENV === "development"

// Trial period configuration
export const DEFAULT_TRIAL_DAYS = parseInt(
  process.env.NEXT_PUBLIC_DEFAULT_TRIAL_DAYS || "14",
  10
)

// API URLs - use static access so Next.js can inline at build time
// IMPORTANT: process.env.NEXT_PUBLIC_* must be accessed statically for Next.js to inline
export const API_SERVICE_URL =
  process.env.NEXT_PUBLIC_API_SERVICE_URL ||
  (isDevelopment ? "http://localhost:8000" : "")

export const PIPELINE_SERVICE_URL =
  process.env.NEXT_PUBLIC_PIPELINE_SERVICE_URL ||
  (isDevelopment ? "http://localhost:8001" : "")

// APP_URL should always be set in production. Empty string in production indicates misconfiguration.
// Usage: Always check if APP_URL is truthy before using for redirects.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (isDevelopment ? "http://localhost:3000" : "")

// Helper to get APP_URL with validation - throws in production if not configured
export function getAppUrl(): string {
  const url = APP_URL
  if (!url && !isDevelopment) {
    throw new Error("CRITICAL: NEXT_PUBLIC_APP_URL not configured in production")
  }
  return url || "http://localhost:3000"
}

// ============================================
// GenAI Validation Constants
// ============================================
// These values MUST match backend enums in:
// - 02-api-service/src/app/routers/genai_pricing.py (BillingPeriodEnum, TierTypeEnum, etc.)
// - 02-api-service/src/app/routers/genai.py
// If backend adds new values, update these arrays accordingly.
// TODO: Consider fetching these from a /api/v1/genai/validation-options endpoint
// ============================================

/**
 * Valid billing periods for subscriptions.
 * Must match backend BillingPeriodEnum.
 */
export const VALID_BILLING_PERIODS = ["weekly", "monthly", "quarterly", "yearly", "pay_as_you_go"] as const
export type BillingPeriod = typeof VALID_BILLING_PERIODS[number]

/**
 * Valid tier types for subscriptions.
 * Must match backend TierTypeEnum.
 */
export const VALID_TIER_TYPES = ["free", "trial", "paid", "enterprise", "committed_use"] as const
export type TierType = typeof VALID_TIER_TYPES[number]

/**
 * Valid pricing types for models.
 * Must match backend PricingTypeEnum.
 */
export const VALID_PRICING_TYPES = ["standard", "free_tier", "volume_discount", "committed_use", "promotional", "negotiated"] as const
export type PricingType = typeof VALID_PRICING_TYPES[number]

/**
 * Valid free tier reset frequencies.
 * Must match backend FreeTierResetFrequency enum.
 */
export const VALID_FREE_TIER_RESET_FREQUENCIES = ["daily", "monthly", "never"] as const
export type FreeTierResetFrequency = typeof VALID_FREE_TIER_RESET_FREQUENCIES[number]

/**
 * Valid discount reasons for pricing.
 * Must match backend DiscountReasonEnum.
 */
export const VALID_DISCOUNT_REASONS = ["volume", "commitment", "promotion", "negotiated", "trial"] as const
export type DiscountReason = typeof VALID_DISCOUNT_REASONS[number]

/**
 * Valid LLM providers.
 * Must match backend provider list.
 */
export const VALID_LLM_PROVIDERS = ["openai", "anthropic", "gemini", "deepseek", "custom"] as const
export type LLMProvider = typeof VALID_LLM_PROVIDERS[number]

// ============================================
// Validation Helper Functions
// ============================================

export function isValidBillingPeriod(period: string | undefined): period is BillingPeriod {
  if (!period) return true // Optional field
  return (VALID_BILLING_PERIODS as readonly string[]).includes(period)
}

export function isValidTierType(tier: string | undefined): tier is TierType {
  if (!tier) return true // Optional field
  return (VALID_TIER_TYPES as readonly string[]).includes(tier)
}

export function isValidPricingType(type: string | undefined): type is PricingType {
  if (!type) return true // Optional field
  return (VALID_PRICING_TYPES as readonly string[]).includes(type)
}

export function isValidFreeTierResetFrequency(freq: string | undefined): freq is FreeTierResetFrequency {
  if (!freq) return true // Optional field
  return (VALID_FREE_TIER_RESET_FREQUENCIES as readonly string[]).includes(freq)
}

export function isValidDiscountReason(reason: string | undefined): reason is DiscountReason {
  if (!reason) return true // Optional field
  return (VALID_DISCOUNT_REASONS as readonly string[]).includes(reason)
}

export function isValidLLMProvider(provider: string): provider is LLMProvider {
  return (VALID_LLM_PROVIDERS as readonly string[]).includes(provider.toLowerCase())
}
