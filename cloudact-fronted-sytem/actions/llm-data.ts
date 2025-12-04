"use server"

/**
 * LLM Provider Data Management Server Actions
 *
 * Handles CRUD operations for pricing and subscription data for all LLM providers:
 * - OpenAI
 * - Anthropic
 * - DeepSeek
 *
 * Data is stored in BigQuery and managed through the backend API.
 *
 * SECURITY MEASURES:
 * 1. Authentication: All actions require authenticated user
 * 2. Authorization: User must be a member of the organization
 * 3. Input Validation: orgSlug, provider, and identifiers validated
 * 4. API Key: Retrieved from secure server-side storage
 */

import { createClient } from "@/lib/supabase/server"
import {
  PipelineBackendClient as BackendClient,
  LLMProvider,
  LLMPricing,
  LLMPricingCreate,
  LLMPricingUpdate,
  LLMPricingListResponse,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  SaaSSubscriptionUpdate,
  SaaSSubscriptionListResponse,
  BillingPeriod,
  TierType,
  PricingType,
  FreeTierResetFrequency,
  DiscountReason,
} from "@/lib/api/backend"
import { getOrgApiKeySecure } from "@/actions/backend-onboarding"

// ============================================
// Types
// ============================================

export interface LLMDataResult<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Re-export types for convenience
export type {
  LLMProvider,
  LLMPricing,
  LLMPricingCreate,
  LLMPricingUpdate,
  LLMPricingListResponse,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  SaaSSubscriptionUpdate,
  SaaSSubscriptionListResponse,
  BillingPeriod,
  TierType,
  PricingType,
  FreeTierResetFrequency,
  DiscountReason,
}

// ============================================
// Input Validation
// ============================================

function isValidOrgSlug(orgSlug: string): boolean {
  if (!orgSlug || typeof orgSlug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)
}

function isValidProvider(provider: string): provider is LLMProvider {
  const validProviders: LLMProvider[] = ["openai", "anthropic", "gemini"]
  return validProviders.includes(provider.toLowerCase() as LLMProvider)
}

function normalizeProvider(provider: string): LLMProvider {
  return provider.toLowerCase() as LLMProvider
}

function isValidModelId(modelId: string): boolean {
  if (!modelId || typeof modelId !== "string") return false
  return /^[a-zA-Z0-9\-_.]{1,100}$/.test(modelId)
}

function isValidPlanName(planName: string): boolean {
  if (!planName || typeof planName !== "string") return false
  return /^[a-zA-Z0-9_]{1,50}$/.test(planName)
}

// Valid billing periods matching backend BillingPeriodEnum
const VALID_BILLING_PERIODS: BillingPeriod[] = ["weekly", "monthly", "quarterly", "yearly", "pay_as_you_go"]

function isValidBillingPeriod(period: string | undefined): period is BillingPeriod {
  if (!period) return true // Optional field
  return VALID_BILLING_PERIODS.includes(period as BillingPeriod)
}

// Valid tier types matching backend TierTypeEnum
const VALID_TIER_TYPES: TierType[] = ["free", "trial", "paid", "enterprise", "committed_use"]

function isValidTierType(tier: string | undefined): tier is TierType {
  if (!tier) return true // Optional field
  return VALID_TIER_TYPES.includes(tier as TierType)
}

// Valid pricing types matching backend PricingTypeEnum
const VALID_PRICING_TYPES: PricingType[] = ["standard", "free_tier", "volume_discount", "committed_use", "promotional", "negotiated"]

function isValidPricingType(type: string | undefined): type is PricingType {
  if (!type) return true // Optional field
  return VALID_PRICING_TYPES.includes(type as PricingType)
}

// Valid free tier reset frequencies matching backend FreeTierResetFrequency enum
const VALID_FREE_TIER_RESET_FREQUENCIES: FreeTierResetFrequency[] = ["daily", "monthly", "never"]

function isValidFreeTierResetFrequency(freq: string | undefined): freq is FreeTierResetFrequency {
  if (!freq) return true // Optional field
  return VALID_FREE_TIER_RESET_FREQUENCIES.includes(freq as FreeTierResetFrequency)
}

// Valid discount reasons matching backend DiscountReasonEnum
const VALID_DISCOUNT_REASONS: DiscountReason[] = ["volume", "commitment", "promotion", "negotiated", "trial"]

function isValidDiscountReason(reason: string | undefined): reason is DiscountReason {
  if (!reason) return true // Optional field
  return VALID_DISCOUNT_REASONS.includes(reason as DiscountReason)
}

/**
 * Validate subscription create/update data.
 * Returns error message if invalid, undefined if valid.
 */
function validateSubscriptionData(subscription: SaaSSubscriptionCreate | SaaSSubscriptionUpdate): string | undefined {
  // Validate billing_period if provided
  if ('billing_period' in subscription && subscription.billing_period) {
    if (!isValidBillingPeriod(subscription.billing_period)) {
      return `Invalid billing_period: "${subscription.billing_period}". Valid values: ${VALID_BILLING_PERIODS.join(", ")}`
    }
  }

  // Validate tier_type if provided
  if ('tier_type' in subscription && subscription.tier_type) {
    if (!isValidTierType(subscription.tier_type)) {
      return `Invalid tier_type: "${subscription.tier_type}". Valid values: ${VALID_TIER_TYPES.join(", ")}`
    }
  }

  // Validate yearly_price_usd (must be non-negative if provided)
  if ('yearly_price_usd' in subscription && subscription.yearly_price_usd !== undefined) {
    if (typeof subscription.yearly_price_usd !== 'number' || subscription.yearly_price_usd < 0) {
      return "yearly_price_usd must be a non-negative number"
    }
  }

  // Validate yearly_discount_percentage (must be 0-100 if provided)
  if ('yearly_discount_percentage' in subscription && subscription.yearly_discount_percentage !== undefined) {
    if (typeof subscription.yearly_discount_percentage !== 'number' ||
        subscription.yearly_discount_percentage < 0 ||
        subscription.yearly_discount_percentage > 100) {
      return "yearly_discount_percentage must be between 0 and 100"
    }
  }

  // Validate rate limits (must be non-negative if provided)
  const rateLimitFields = ['rpm_limit', 'tpm_limit', 'rpd_limit', 'tpd_limit', 'concurrent_limit'] as const
  for (const field of rateLimitFields) {
    if (field in subscription) {
      const value = (subscription as any)[field]
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || value < 0) {
          return `${field} must be a non-negative number`
        }
      }
    }
  }

  return undefined // Valid
}

/**
 * Validate pricing create/update data.
 * Returns error message if invalid, undefined if valid.
 */
function validatePricingData(pricing: LLMPricingCreate | LLMPricingUpdate): string | undefined {
  // Validate pricing_type if provided
  if ('pricing_type' in pricing && pricing.pricing_type) {
    if (!isValidPricingType(pricing.pricing_type)) {
      return `Invalid pricing_type: "${pricing.pricing_type}". Valid values: ${VALID_PRICING_TYPES.join(", ")}`
    }
  }

  // Validate free_tier_reset_frequency if provided
  if ('free_tier_reset_frequency' in pricing && pricing.free_tier_reset_frequency) {
    if (!isValidFreeTierResetFrequency(pricing.free_tier_reset_frequency)) {
      return `Invalid free_tier_reset_frequency: "${pricing.free_tier_reset_frequency}". Valid values: ${VALID_FREE_TIER_RESET_FREQUENCIES.join(", ")}`
    }
  }

  // Validate discount_reason if provided
  if ('discount_reason' in pricing && pricing.discount_reason) {
    if (!isValidDiscountReason(pricing.discount_reason)) {
      return `Invalid discount_reason: "${pricing.discount_reason}". Valid values: ${VALID_DISCOUNT_REASONS.join(", ")}`
    }
  }

  // Validate discount_percentage (must be 0-100 if provided)
  if ('discount_percentage' in pricing && pricing.discount_percentage !== undefined) {
    if (typeof pricing.discount_percentage !== 'number' ||
        pricing.discount_percentage < 0 ||
        pricing.discount_percentage > 100) {
      return "discount_percentage must be between 0 and 100"
    }
  }

  // Validate free tier tokens (must be non-negative if provided)
  const tokenFields = ['free_tier_input_tokens', 'free_tier_output_tokens', 'volume_threshold_tokens'] as const
  for (const field of tokenFields) {
    if (field in pricing) {
      const value = (pricing as any)[field]
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || value < 0) {
          return `${field} must be a non-negative number`
        }
      }
    }
  }

  // Validate price fields (must be non-negative if provided)
  const priceFields = ['input_price_per_1k', 'output_price_per_1k', 'base_input_price_per_1k', 'base_output_price_per_1k', 'discounted_input_price_per_1k', 'discounted_output_price_per_1k'] as const
  for (const field of priceFields) {
    if (field in pricing) {
      const value = (pricing as any)[field]
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || value < 0) {
          return `${field} must be a non-negative number`
        }
      }
    }
  }

  return undefined // Valid
}

// ============================================
// Authorization Helper
// ============================================

async function verifyOrgMembership(orgSlug: string): Promise<{
  authorized: boolean
  userId?: string
  orgId?: string
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { authorized: false, error: "Not authenticated" }
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("org_slug", orgSlug)
    .single()

  if (orgError || !org) {
    return { authorized: false, userId: user.id, error: "Organization not found" }
  }

  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("id, role, status")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (memberError || !membership) {
    return { authorized: false, userId: user.id, error: "Not a member of this organization" }
  }

  return { authorized: true, userId: user.id, orgId: org.id }
}

async function getOrgApiKey(orgSlug: string): Promise<string | null> {
  return await getOrgApiKeySecure(orgSlug)
}

// ============================================
// Pricing Actions
// ============================================

/**
 * List all pricing models for an LLM provider.
 */
export async function listLLMPricing(
  orgSlug: string,
  provider: LLMProvider
): Promise<LLMDataResult<LLMPricingListResponse>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider. Valid providers: openai, anthropic, gemini" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.listLLMPricing(orgSlug, normalizeProvider(provider))

    return { success: true, data }
  } catch (err: any) {
    console.error(`[LLM Data] List ${provider} pricing error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to list pricing" }
  }
}

/**
 * Get a specific pricing model for an LLM provider.
 */
export async function getLLMPricing(
  orgSlug: string,
  provider: LLMProvider,
  modelId: string
): Promise<LLMDataResult<LLMPricing>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidModelId(modelId)) {
      return { success: false, error: "Invalid model ID" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.getLLMPricing(orgSlug, normalizeProvider(provider), modelId)

    return { success: true, data }
  } catch (err: any) {
    console.error(`[LLM Data] Get ${provider} pricing error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to get pricing" }
  }
}

/**
 * Create a new pricing model for an LLM provider.
 */
export async function createLLMPricing(
  orgSlug: string,
  provider: LLMProvider,
  pricing: LLMPricingCreate
): Promise<LLMDataResult<LLMPricing>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidModelId(pricing.model_id)) {
      return { success: false, error: "Invalid model ID" }
    }

    // Validate pricing type, discount fields, and free tier tokens
    const pricingValidationError = validatePricingData(pricing)
    if (pricingValidationError) {
      return { success: false, error: pricingValidationError }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.createLLMPricing(orgSlug, normalizeProvider(provider), pricing)

    return { success: true, data, message: "Pricing created successfully" }
  } catch (err: any) {
    console.error(`[LLM Data] Create ${provider} pricing error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to create pricing" }
  }
}

/**
 * Update an existing pricing model for an LLM provider.
 */
export async function updateLLMPricing(
  orgSlug: string,
  provider: LLMProvider,
  modelId: string,
  pricing: LLMPricingUpdate
): Promise<LLMDataResult<LLMPricing>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidModelId(modelId)) {
      return { success: false, error: "Invalid model ID" }
    }

    // Validate pricing type, discount fields, and free tier tokens
    const pricingValidationError = validatePricingData(pricing)
    if (pricingValidationError) {
      return { success: false, error: pricingValidationError }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.updateLLMPricing(orgSlug, normalizeProvider(provider), modelId, pricing)

    return { success: true, data, message: "Pricing updated successfully" }
  } catch (err: any) {
    console.error(`[LLM Data] Update ${provider} pricing error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to update pricing" }
  }
}

/**
 * Delete a pricing model for an LLM provider.
 */
export async function deleteLLMPricing(
  orgSlug: string,
  provider: LLMProvider,
  modelId: string
): Promise<LLMDataResult> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidModelId(modelId)) {
      return { success: false, error: "Invalid model ID" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    await backend.deleteLLMPricing(orgSlug, normalizeProvider(provider), modelId)

    return { success: true, message: "Pricing deleted successfully" }
  } catch (err: any) {
    console.error(`[LLM Data] Delete ${provider} pricing error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to delete pricing" }
  }
}

/**
 * Reset pricing to defaults for an LLM provider.
 */
export async function resetLLMPricing(
  orgSlug: string,
  provider: LLMProvider
): Promise<LLMDataResult<LLMPricingListResponse>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.resetLLMPricing(orgSlug, normalizeProvider(provider))

    return { success: true, data, message: "Pricing reset to defaults" }
  } catch (err: any) {
    console.error(`[LLM Data] Reset ${provider} pricing error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to reset pricing" }
  }
}

// ============================================
// Subscription Actions
// ============================================

/**
 * List all subscriptions for an LLM provider.
 */
export async function listSaaSSubscriptions(
  orgSlug: string,
  provider: LLMProvider
): Promise<LLMDataResult<SaaSSubscriptionListResponse>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.listSaaSSubscriptions(orgSlug, normalizeProvider(provider))

    return { success: true, data }
  } catch (err: any) {
    console.error(`[LLM Data] List ${provider} subscriptions error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to list subscriptions" }
  }
}

/**
 * Get a specific subscription for an LLM provider.
 */
export async function getSaaSSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string
): Promise<LLMDataResult<SaaSSubscription>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidPlanName(planName)) {
      return { success: false, error: "Invalid plan name" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.getSaaSSubscription(orgSlug, normalizeProvider(provider), planName)

    return { success: true, data }
  } catch (err: any) {
    console.error(`[LLM Data] Get ${provider} subscription error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to get subscription" }
  }
}

/**
 * Create a new subscription for an LLM provider.
 */
export async function createSaaSSubscription(
  orgSlug: string,
  provider: LLMProvider,
  subscription: SaaSSubscriptionCreate
): Promise<LLMDataResult<SaaSSubscription>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidPlanName(subscription.plan_name)) {
      return { success: false, error: "Invalid plan name" }
    }

    // Validate billing period, tier type, and other subscription fields
    const subscriptionValidationError = validateSubscriptionData(subscription)
    if (subscriptionValidationError) {
      return { success: false, error: subscriptionValidationError }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.createSaaSSubscription(orgSlug, normalizeProvider(provider), subscription)

    return { success: true, data, message: "Subscription created successfully" }
  } catch (err: any) {
    console.error(`[LLM Data] Create ${provider} subscription error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to create subscription" }
  }
}

/**
 * Update an existing subscription for an LLM provider.
 */
export async function updateSaaSSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string,
  subscription: SaaSSubscriptionUpdate
): Promise<LLMDataResult<SaaSSubscription>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidPlanName(planName)) {
      return { success: false, error: "Invalid plan name" }
    }

    // Validate billing period, tier type, and other subscription fields
    const subscriptionValidationError = validateSubscriptionData(subscription)
    if (subscriptionValidationError) {
      return { success: false, error: subscriptionValidationError }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.updateSaaSSubscription(orgSlug, normalizeProvider(provider), planName, subscription)

    return { success: true, data, message: "Subscription updated successfully" }
  } catch (err: any) {
    console.error(`[LLM Data] Update ${provider} subscription error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to update subscription" }
  }
}

/**
 * Delete a subscription for an LLM provider.
 */
export async function deleteSaaSSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string
): Promise<LLMDataResult> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }
    if (!isValidPlanName(planName)) {
      return { success: false, error: "Invalid plan name" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    await backend.deleteSaaSSubscription(orgSlug, normalizeProvider(provider), planName)

    return { success: true, message: "Subscription deleted successfully" }
  } catch (err: any) {
    console.error(`[LLM Data] Delete ${provider} subscription error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to delete subscription" }
  }
}

/**
 * Reset subscriptions to defaults for an LLM provider.
 */
export async function resetSaaSSubscriptions(
  orgSlug: string,
  provider: LLMProvider
): Promise<LLMDataResult<SaaSSubscriptionListResponse>> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid LLM provider" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const backend = new BackendClient({ orgApiKey: apiKey })
    const data = await backend.resetSaaSSubscriptions(orgSlug, normalizeProvider(provider))

    return { success: true, data, message: "Subscriptions reset to defaults" }
  } catch (err: any) {
    console.error(`[LLM Data] Reset ${provider} subscriptions error:`, err)
    return { success: false, error: err.detail || err.message || "Failed to reset subscriptions" }
  }
}

// ============================================
// Legacy function aliases for backward compatibility
// ============================================

/**
 * @deprecated Use listSaaSSubscriptions instead
 */
export async function listLLMSubscriptions(
  orgSlug: string,
  provider: LLMProvider
): Promise<LLMDataResult<SaaSSubscriptionListResponse>> {
  return listSaaSSubscriptions(orgSlug, provider)
}

/**
 * @deprecated Use getSaaSSubscription instead
 */
export async function getLLMSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string
): Promise<LLMDataResult<SaaSSubscription>> {
  return getSaaSSubscription(orgSlug, provider, planName)
}

/**
 * @deprecated Use createSaaSSubscription instead
 */
export async function createLLMSubscription(
  orgSlug: string,
  provider: LLMProvider,
  subscription: SaaSSubscriptionCreate
): Promise<LLMDataResult<SaaSSubscription>> {
  return createSaaSSubscription(orgSlug, provider, subscription)
}

/**
 * @deprecated Use updateSaaSSubscription instead
 */
export async function updateLLMSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string,
  subscription: SaaSSubscriptionUpdate
): Promise<LLMDataResult<SaaSSubscription>> {
  return updateSaaSSubscription(orgSlug, provider, planName, subscription)
}

/**
 * @deprecated Use deleteSaaSSubscription instead
 */
export async function deleteLLMSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string
): Promise<LLMDataResult> {
  return deleteSaaSSubscription(orgSlug, provider, planName)
}

/**
 * @deprecated Use resetSaaSSubscriptions instead
 */
export async function resetLLMSubscriptions(
  orgSlug: string,
  provider: LLMProvider
): Promise<LLMDataResult<SaaSSubscriptionListResponse>> {
  return resetSaaSSubscriptions(orgSlug, provider)
}
