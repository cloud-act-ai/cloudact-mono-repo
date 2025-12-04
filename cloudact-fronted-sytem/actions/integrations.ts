"use server"

/**
 * Integration Management Server Actions
 *
 * Handles communication with backend for LLM and cloud provider integrations.
 * All credentials are encrypted via KMS in the backend - no secrets in Supabase.
 *
 * SECURITY MEASURES:
 * 1. Authentication: All actions require authenticated user
 * 2. Authorization: User must be a member of the organization
 * 3. Input Validation: orgSlug and provider validated
 * 4. API Key: Retrieved from secure server-side storage
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import {
  PipelineBackendClient as BackendClient,
  SetupIntegrationRequest,
  AllIntegrationsResponse,
  LLMPricing,
  LLMPricingCreate,
  LLMPricingUpdate,
  LLMPricingListResponse,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  SaaSSubscriptionUpdate,
  SaaSSubscriptionListResponse,
  LLMProvider
} from "@/lib/api/backend"
import { getOrgApiKeySecure } from "@/actions/backend-onboarding"

// ============================================
// Types
// ============================================

export type IntegrationProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "gcp" | "gcp_service_account"

const VALID_PROVIDERS: IntegrationProvider[] = ["openai", "anthropic", "gemini", "deepseek", "gcp", "gcp_service_account"]

export interface SetupIntegrationInput {
  orgSlug: string
  provider: IntegrationProvider
  credential: string
  credentialName?: string
  metadata?: Record<string, any>
}

export interface IntegrationResult {
  success: boolean
  provider: string
  validationStatus?: string
  error?: string
  message?: string
}

// ============================================
// Input Validation
// ============================================

/**
 * Validate org slug format.
 * Prevents path traversal and injection attacks.
 */
// Backend requires: alphanumeric with underscores only (no hyphens), 3-50 characters
function isValidOrgSlug(orgSlug: string): boolean {
  if (!orgSlug || typeof orgSlug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)
}

/**
 * Validate provider is a known integration provider.
 */
function isValidProvider(provider: string): provider is IntegrationProvider {
  return VALID_PROVIDERS.includes(provider.toLowerCase() as IntegrationProvider)
}

// ============================================
// Authorization Helper
// ============================================

/**
 * Verify user is authenticated and belongs to the organization.
 * SECURITY: Prevents unauthorized access to other orgs' integrations.
 *
 * FIX: Must verify user is member of the SPECIFIC org, not just any org.
 */
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

  // Step 1: Look up the organization by slug FIRST
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("org_slug", orgSlug)
    .single()

  if (orgError || !org) {
    return { authorized: false, userId: user.id, error: "Organization not found" }
  }

  // Step 2: Check user is a member of THIS SPECIFIC organization
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("id, role, status")
    .eq("org_id", org.id)  // CRITICAL: Check membership for the TARGET org
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (memberError || !membership) {
    return { authorized: false, userId: user.id, error: "Not a member of this organization" }
  }

  return { authorized: true, userId: user.id, orgId: org.id }
}

// ============================================
// Helper: Get Org API Key (from secure storage)
// ============================================

/**
 * Get org API key from secure server-side storage.
 * SECURITY: Uses service_role client to read from RLS-protected table.
 * API keys are NEVER exposed to the browser.
 */
async function getOrgApiKey(orgSlug: string): Promise<string | null> {
  // Get from secure server-side storage (NOT user_metadata)
  return await getOrgApiKeySecure(orgSlug)
}

// ============================================
// Integration Setup Actions
// ============================================

/**
 * Setup an LLM or cloud provider integration.
 *
 * SECURITY:
 * - Validates input formats
 * - Requires authenticated user
 * - Verifies user belongs to organization
 * - Checks provider limit before adding new integration
 */
export async function setupIntegration(
  input: SetupIntegrationInput
): Promise<IntegrationResult> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(input.orgSlug)) {
      return { success: false, provider: input.provider, error: "Invalid organization identifier" }
    }

    if (!isValidProvider(input.provider)) {
      return { success: false, provider: input.provider, error: "Invalid provider" }
    }

    // Step 2: Verify authentication and authorization
    const authResult = await verifyOrgMembership(input.orgSlug)
    if (!authResult.authorized) {
      return { success: false, provider: input.provider, error: authResult.error || "Not authorized" }
    }

    // Step 2.5: Check if adding this integration would exceed the provider limit
    // Only check if this is a NEW integration (not updating an existing one)
    const adminClient = createServiceRoleClient()
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("providers_limit, integration_openai_status, integration_anthropic_status, integration_gcp_status")
      .eq("org_slug", input.orgSlug)
      .single()

    if (orgData) {
      const providersLimit = orgData.providers_limit || 3

      // Map provider to status column
      const providerStatusMap: Record<string, string | null> = {
        openai: orgData.integration_openai_status,
        anthropic: orgData.integration_anthropic_status,
        gcp: orgData.integration_gcp_status,
        gcp_service_account: orgData.integration_gcp_status,
      }

      // Check if this provider is already configured
      const isAlreadyConfigured = providerStatusMap[input.provider.toLowerCase()] === 'VALID'

      if (!isAlreadyConfigured) {
        // Count currently configured providers
        const configuredCount = [
          orgData.integration_openai_status === 'VALID',
          orgData.integration_anthropic_status === 'VALID',
          orgData.integration_gcp_status === 'VALID',
        ].filter(Boolean).length

        if (configuredCount >= providersLimit) {
          return {
            success: false,
            provider: input.provider,
            error: `Integration limit reached (${configuredCount}/${providersLimit}). Upgrade your plan to add more integrations.`,
          }
        }
      }
    }

    // Step 3: Get org API key
    const apiKey = await getOrgApiKey(input.orgSlug)

    if (!apiKey) {
      return {
        success: false,
        provider: input.provider,
        error: "Organization API key not found. Please complete backend onboarding first.",
      }
    }

    // Step 4: Create backend client and setup integration
    const backend = new BackendClient({ orgApiKey: apiKey })

    const request: SetupIntegrationRequest = {
      credential: input.credential,
      credential_name: input.credentialName,
      metadata: input.metadata,
      skip_validation: false,
    }

    const response = await backend.setupIntegration(
      input.orgSlug,
      input.provider,
      request
    )

    // Save integration status to Supabase (all states: VALID, INVALID, PENDING)
    // This ensures UI reflects actual state even when validation fails
    if (response.validation_status) {
      await saveIntegrationStatus(input.orgSlug, input.provider, response.validation_status)
    }

    return {
      success: response.success,
      provider: response.provider,
      validationStatus: response.validation_status,
      error: response.validation_error,
      message: response.message,
    }
  } catch (err: any) {
    console.error(`[Integrations] Setup ${input.provider} error:`, err)
    return {
      success: false,
      provider: input.provider,
      error: err.detail || err.message || "Integration setup failed",
    }
  }
}

/**
 * Get all integration statuses for an organization.
 * Reads from Supabase integration status reference columns (frontend source of truth).
 * Falls back to defaults if columns don't exist yet (migration not run).
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function getIntegrations(
  orgSlug: string
): Promise<{
  success: boolean
  integrations?: AllIntegrationsResponse
  error?: string
}> {
  // Default response when data is unavailable
  // Use 'as const' to ensure proper type narrowing for status
  const defaultResponse = {
    success: true as const,
    integrations: {
      org_slug: orgSlug,
      integrations: {
        OPENAI: { provider: "OPENAI", status: "NOT_CONFIGURED" as const },
        ANTHROPIC: { provider: "ANTHROPIC", status: "NOT_CONFIGURED" as const },
        GEMINI: { provider: "GEMINI", status: "NOT_CONFIGURED" as const },
        DEEPSEEK: { provider: "DEEPSEEK", status: "NOT_CONFIGURED" as const },
        GCP_SA: { provider: "GCP_SA", status: "NOT_CONFIGURED" as const },
      },
      all_valid: false,
      providers_configured: [] as string[],
    },
  }

  try {
    // Step 1: Validate org slug format
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Step 2: Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Read from Supabase integration status columns (frontend reference)
    const supabase = await createClient()

    // First check if org exists with minimal query (no integration columns)
    const { data: orgExists, error: existsError } = await supabase
      .from("organizations")
      .select("id")
      .eq("org_slug", orgSlug)
      .single()

    if (existsError || !orgExists) {
      console.warn("[Integrations] Org not found, returning defaults")
      return defaultResponse
    }

    // Try to get integration columns - they may not exist if migration not run
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select(`
        integration_openai_status,
        integration_openai_configured_at,
        integration_openai_enabled,
        integration_anthropic_status,
        integration_anthropic_configured_at,
        integration_anthropic_enabled,
        integration_gemini_status,
        integration_gemini_configured_at,
        integration_gemini_enabled,
        integration_deepseek_status,
        integration_deepseek_configured_at,
        integration_deepseek_enabled,
        integration_gcp_status,
        integration_gcp_configured_at,
        integration_gcp_enabled
      `)
      .eq("org_slug", orgSlug)
      .single()

    if (orgError) {
      // If error is about missing columns, return defaults gracefully
      if (orgError.message?.includes("column") || orgError.code === "42703") {
        console.warn("[Integrations] Integration columns not found (migration may not be run), returning defaults")
        return defaultResponse
      }
      console.warn("[Integrations] Could not read org data:", orgError.message)
      return defaultResponse
    }

    if (!org) {
      return defaultResponse
    }

    // Build response from Supabase reference data
    // Note: last_validated_at uses configured_at since validation happens at configuration time
    // Use optional chaining to handle missing columns gracefully
    // is_enabled defaults to true (enabled) unless explicitly disabled
    const integrations: Record<string, any> = {
      OPENAI: {
        provider: "OPENAI",
        status: org?.integration_openai_status || "NOT_CONFIGURED",
        created_at: org?.integration_openai_configured_at,
        last_validated_at: org?.integration_openai_configured_at,
        is_enabled: (org as any)?.integration_openai_enabled !== false,
      },
      ANTHROPIC: {
        provider: "ANTHROPIC",
        status: org?.integration_anthropic_status || "NOT_CONFIGURED",
        created_at: org?.integration_anthropic_configured_at,
        last_validated_at: org?.integration_anthropic_configured_at,
        is_enabled: (org as any)?.integration_anthropic_enabled !== false,
      },
      GEMINI: {
        provider: "GEMINI",
        status: (org as any)?.integration_gemini_status || "NOT_CONFIGURED",
        created_at: (org as any)?.integration_gemini_configured_at,
        last_validated_at: (org as any)?.integration_gemini_configured_at,
        is_enabled: (org as any)?.integration_gemini_enabled !== false,
      },
      DEEPSEEK: {
        provider: "DEEPSEEK",
        status: (org as any)?.integration_deepseek_status || "NOT_CONFIGURED",
        created_at: (org as any)?.integration_deepseek_configured_at,
        last_validated_at: (org as any)?.integration_deepseek_configured_at,
        is_enabled: (org as any)?.integration_deepseek_enabled !== false,
      },
      GCP_SA: {
        provider: "GCP_SA",
        status: org?.integration_gcp_status || "NOT_CONFIGURED",
        created_at: org?.integration_gcp_configured_at,
        last_validated_at: org?.integration_gcp_configured_at,
        is_enabled: (org as any)?.integration_gcp_enabled !== false,
      },
    }

    const providersConfigured = Object.entries(integrations)
      .filter(([_, v]) => v && v.status === "VALID")
      .map(([k, _]) => k)

    const allValid = providersConfigured.length === 3

    return {
      success: true,
      integrations: {
        org_slug: orgSlug,
        integrations,
        all_valid: allValid,
        providers_configured: providersConfigured,
      },
    }
  } catch (err: any) {
    console.error("[Integrations] Get integrations error:", err)
    // Return defaults instead of error to prevent page crashes
    return defaultResponse
  }
}

/**
 * Validate an existing integration.
 *
 * SECURITY:
 * - Validates input formats
 * - Requires authenticated user
 * - Verifies user belongs to organization
 */
export async function validateIntegration(
  orgSlug: string,
  provider: string
): Promise<IntegrationResult> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, provider, error: "Invalid organization identifier" }
    }

    if (!isValidProvider(provider)) {
      return { success: false, provider, error: "Invalid provider" }
    }

    // Step 2: Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, provider, error: authResult.error || "Not authorized" }
    }

    // Step 3: Get org API key
    const apiKey = await getOrgApiKey(orgSlug)

    if (!apiKey) {
      return {
        success: false,
        provider,
        error: "Organization API key not found",
      }
    }

    // Step 4: Validate with backend
    const backend = new BackendClient({ orgApiKey: apiKey })
    const response = await backend.validateIntegration(orgSlug, provider)

    // Update Supabase status to reflect validation result (VALID/INVALID)
    if (response.validation_status) {
      await saveIntegrationStatus(orgSlug, provider as IntegrationProvider, response.validation_status)
    }

    // Return success based on validation status, not always true
    const isValid = response.validation_status === "VALID"
    return {
      success: isValid,
      provider: response.provider,
      validationStatus: response.validation_status,
      error: response.validation_error,
      message: response.message,
    }
  } catch (err: any) {
    console.error(`[Integrations] Validate ${provider} error:`, err)
    return {
      success: false,
      provider,
      error: err.detail || err.message || "Validation failed",
    }
  }
}

/**
 * Delete an integration.
 *
 * SECURITY:
 * - Validates input formats
 * - Requires authenticated user
 * - Verifies user belongs to organization
 */
export async function deleteIntegration(
  orgSlug: string,
  provider: string
): Promise<IntegrationResult> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, provider, error: "Invalid organization identifier" }
    }

    if (!isValidProvider(provider)) {
      return { success: false, provider, error: "Invalid provider" }
    }

    // Step 2: Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, provider, error: authResult.error || "Not authorized" }
    }

    // Step 3: Get org API key
    const apiKey = await getOrgApiKey(orgSlug)

    if (!apiKey) {
      return {
        success: false,
        provider,
        error: "Organization API key not found",
      }
    }

    // Step 4: Delete via backend
    const backend = new BackendClient({ orgApiKey: apiKey })
    const response = await backend.deleteIntegration(orgSlug, provider)

    // Update status to NOT_CONFIGURED in Supabase
    await saveIntegrationStatus(orgSlug, provider as IntegrationProvider, "NOT_CONFIGURED")

    return {
      success: response.success,
      provider,
      message: response.message,
    }
  } catch (err: any) {
    console.error(`[Integrations] Delete ${provider} error:`, err)
    return {
      success: false,
      provider,
      error: err.detail || err.message || "Delete failed",
    }
  }
}

// ============================================
// Helper: Save Integration Status to Supabase
// ============================================

async function saveIntegrationStatus(
  orgSlug: string,
  provider: IntegrationProvider,
  status: string
) {
  try {
    const adminClient = createServiceRoleClient()

    // Map provider to column name
    const columnMap: Record<string, string> = {
      openai: "integration_openai",
      anthropic: "integration_anthropic",
      gemini: "integration_gemini",
      deepseek: "integration_deepseek",
      gcp: "integration_gcp",
      gcp_service_account: "integration_gcp",
    }

    const columnPrefix = columnMap[provider]
    if (!columnPrefix) {
      console.warn(`[Integrations] Unknown provider: ${provider}`)
      return
    }

    const updateData: Record<string, any> = {
      [`${columnPrefix}_status`]: status,
    }

    // Add configured_at timestamp for successful setup
    if (status === "VALID") {
      updateData[`${columnPrefix}_configured_at`] = new Date().toISOString()
    }

    const { error } = await adminClient
      .from("organizations")
      .update(updateData)
      .eq("org_slug", orgSlug)

    if (error) {
      console.error("[Integrations] Failed to save status:", error)
    } else {
      console.log(`[Integrations] Saved ${provider} status=${status} for ${orgSlug}`)
    }
  } catch (err) {
    console.error("[Integrations] Save status error:", err)
    // Don't fail the main operation
  }
}

// ============================================
// LLM Pricing Management
// ============================================

/**
 * List all pricing models for an LLM provider.
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function listLLMPricing(
  orgSlug: string,
  provider: LLMProvider = "openai"
): Promise<{
  success: boolean
  pricing?: LLMPricing[]
  count?: number
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found. Please complete backend onboarding first." }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.listLLMPricing(orgSlug, provider)

    return {
      success: true,
      pricing: result.pricing,
      count: result.count
    }
  } catch (err: any) {
    console.error(`[Integrations] List ${provider} pricing error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to list pricing"
    }
  }
}

/**
 * Update a pricing model for an LLM provider.
 */
export async function updateLLMPricing(
  orgSlug: string,
  provider: LLMProvider,
  modelId: string,
  pricing: LLMPricingUpdate
): Promise<{
  success: boolean
  pricing?: LLMPricing
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.updateLLMPricing(orgSlug, provider, modelId, pricing)

    return {
      success: true,
      pricing: result
    }
  } catch (err: any) {
    console.error(`[Integrations] Update ${provider} pricing error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to update pricing"
    }
  }
}

/**
 * Create a new pricing model for an LLM provider.
 */
export async function createLLMPricing(
  orgSlug: string,
  provider: LLMProvider,
  pricing: LLMPricingCreate
): Promise<{
  success: boolean
  pricing?: LLMPricing
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.createLLMPricing(orgSlug, provider, pricing)

    return {
      success: true,
      pricing: result
    }
  } catch (err: any) {
    console.error(`[Integrations] Create ${provider} pricing error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to create pricing"
    }
  }
}

/**
 * Delete a pricing model for an LLM provider.
 */
export async function deleteLLMPricing(
  orgSlug: string,
  provider: LLMProvider,
  modelId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.deleteLLMPricing(orgSlug, provider, modelId)

    return { success: true }
  } catch (err: any) {
    console.error(`[Integrations] Delete ${provider} pricing error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to delete pricing"
    }
  }
}

/**
 * Reset pricing to defaults for an LLM provider.
 */
export async function resetLLMPricing(
  orgSlug: string,
  provider: LLMProvider
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.resetLLMPricing(orgSlug, provider)

    return {
      success: true,
      message: "Pricing reset to defaults"
    }
  } catch (err: any) {
    console.error(`[Integrations] Reset ${provider} pricing error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to reset pricing"
    }
  }
}

// ============================================
// LLM Subscription Management
// ============================================

/**
 * List all subscriptions for an LLM provider.
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function listSaaSSubscriptions(
  orgSlug: string,
  provider: LLMProvider = "openai"
): Promise<{
  success: boolean
  subscriptions?: SaaSSubscription[]
  count?: number
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found. Please complete backend onboarding first." }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.listSaaSSubscriptions(orgSlug, provider)

    return {
      success: true,
      subscriptions: result.subscriptions,
      count: result.count
    }
  } catch (err: any) {
    console.error(`[Integrations] List ${provider} subscriptions error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to list subscriptions"
    }
  }
}

/**
 * Update a subscription for an LLM provider.
 */
export async function updateSaaSSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string,
  subscription: SaaSSubscriptionUpdate
): Promise<{
  success: boolean
  subscription?: SaaSSubscription
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.updateSaaSSubscription(orgSlug, provider, planName, subscription)

    return {
      success: true,
      subscription: result
    }
  } catch (err: any) {
    console.error(`[Integrations] Update ${provider} subscription error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to update subscription"
    }
  }
}

/**
 * Create a new subscription for an LLM provider.
 */
export async function createSaaSSubscription(
  orgSlug: string,
  provider: LLMProvider,
  subscription: SaaSSubscriptionCreate
): Promise<{
  success: boolean
  subscription?: SaaSSubscription
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.createSaaSSubscription(orgSlug, provider, subscription)

    return {
      success: true,
      subscription: result
    }
  } catch (err: any) {
    console.error(`[Integrations] Create ${provider} subscription error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to create subscription"
    }
  }
}

/**
 * Delete a subscription for an LLM provider.
 */
export async function deleteSaaSSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.deleteSaaSSubscription(orgSlug, provider, planName)

    return { success: true }
  } catch (err: any) {
    console.error(`[Integrations] Delete ${provider} subscription error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to delete subscription"
    }
  }
}

/**
 * Reset subscriptions to defaults for an LLM provider.
 */
export async function resetSaaSSubscriptions(
  orgSlug: string,
  provider: LLMProvider
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.resetSaaSSubscriptions(orgSlug, provider)

    return {
      success: true,
      message: "Subscriptions reset to defaults"
    }
  } catch (err: any) {
    console.error(`[Integrations] Reset ${provider} subscriptions error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to reset subscriptions"
    }
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
  provider: LLMProvider = "openai"
): Promise<{
  success: boolean
  subscriptions?: SaaSSubscription[]
  count?: number
  error?: string
}> {
  return listSaaSSubscriptions(orgSlug, provider)
}

/**
 * @deprecated Use updateSaaSSubscription instead
 */
export async function updateLLMSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string,
  subscription: SaaSSubscriptionUpdate
): Promise<{
  success: boolean
  subscription?: SaaSSubscription
  error?: string
}> {
  return updateSaaSSubscription(orgSlug, provider, planName, subscription)
}

/**
 * @deprecated Use createSaaSSubscription instead
 */
export async function createLLMSubscription(
  orgSlug: string,
  provider: LLMProvider,
  subscription: SaaSSubscriptionCreate
): Promise<{
  success: boolean
  subscription?: SaaSSubscription
  error?: string
}> {
  return createSaaSSubscription(orgSlug, provider, subscription)
}

/**
 * @deprecated Use deleteSaaSSubscription instead
 */
export async function deleteLLMSubscription(
  orgSlug: string,
  provider: LLMProvider,
  planName: string
): Promise<{
  success: boolean
  error?: string
}> {
  return deleteSaaSSubscription(orgSlug, provider, planName)
}

/**
 * @deprecated Use resetSaaSSubscriptions instead
 */
export async function resetLLMSubscriptions(
  orgSlug: string,
  provider: LLMProvider
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  return resetSaaSSubscriptions(orgSlug, provider)
}

// ============================================
// Integration Enable/Disable Toggle
// ============================================

/**
 * Toggle an integration's enabled state.
 * This allows users to disable an integration without deleting it.
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function toggleIntegrationEnabled(
  orgSlug: string,
  provider: IntegrationProvider,
  enabled: boolean
): Promise<{
  success: boolean
  enabled?: boolean
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    if (!isValidProvider(provider)) {
      return { success: false, error: "Invalid provider" }
    }

    // Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const adminClient = createServiceRoleClient()

    // Map provider to column name
    const columnMap: Record<string, string> = {
      openai: "integration_openai",
      anthropic: "integration_anthropic",
      gemini: "integration_gemini",
      deepseek: "integration_deepseek",
      gcp: "integration_gcp",
      gcp_service_account: "integration_gcp",
    }

    const columnPrefix = columnMap[provider]
    if (!columnPrefix) {
      return { success: false, error: `Unknown provider: ${provider}` }
    }

    const enabledColumn = `${columnPrefix}_enabled`

    const { error } = await adminClient
      .from("organizations")
      .update({ [enabledColumn]: enabled })
      .eq("org_slug", orgSlug)

    if (error) {
      console.error("[Integrations] Failed to toggle enabled state:", error)
      return { success: false, error: "Failed to update integration state" }
    }

    console.log(`[Integrations] Toggled ${provider} enabled=${enabled} for ${orgSlug}`)
    return { success: true, enabled }
  } catch (err: any) {
    console.error(`[Integrations] Toggle ${provider} error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to toggle integration"
    }
  }
}

// Re-export types for use in components
export type {
  LLMPricing,
  LLMPricingCreate,
  LLMPricingUpdate,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  SaaSSubscriptionUpdate,
  LLMProvider
}
