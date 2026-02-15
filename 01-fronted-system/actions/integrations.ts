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

import {
  PipelineBackendClient as BackendClient,
} from "@/lib/api/backend"
import type {
  SetupIntegrationRequest,
  AllIntegrationsResponse,
  LLMPricing,
  LLMPricingCreate,
  LLMPricingUpdate,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  SaaSSubscriptionUpdate,
  LLMProvider
} from "@/lib/api/backend"
// Note: Do NOT re-export types from "use server" files - it causes bundling errors
// Import IntegrationStatus directly from lib/api/backend where needed
import { getCachedApiKey } from "@/lib/auth-cache"
import { isValidOrgSlug } from "@/lib/utils/validation"

// ============================================
// Types
// ============================================

export type IntegrationProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "gcp" | "gcp_service_account" | "aws" | "azure" | "oci"

// Cloud provider types
export type CloudProvider = "gcp" | "gcp_service_account" | "aws" | "azure" | "oci"

// LLM providers use the organizations table columns
export type LLMIntegrationProvider = "openai" | "anthropic" | "gemini" | "deepseek"

const VALID_PROVIDERS: IntegrationProvider[] = ["openai", "anthropic", "gemini", "deepseek", "gcp", "gcp_service_account", "aws", "azure", "oci"]

const CLOUD_PROVIDERS: CloudProvider[] = ["gcp", "gcp_service_account", "aws", "azure", "oci"]

/**
 * Type guard to check if a provider is a cloud provider.
 * Currently unused but kept for potential validation/routing logic.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _isCloudProvider(provider: string): provider is CloudProvider {
  return CLOUD_PROVIDERS.includes(provider.toLowerCase() as CloudProvider)
}

export interface SetupIntegrationInput {
  orgSlug: string
  provider: IntegrationProvider
  credential: string
  credentialName?: string
  metadata?: Record<string, unknown>
  // Default hierarchy for GenAI integrations (5-field model)
  // Uses x_hierarchy prefix to match BigQuery schema
  defaultXHierarchyEntityId?: string
  defaultXHierarchyEntityName?: string
  defaultXHierarchyLevelCode?: string
  defaultXHierarchyPath?: string
  defaultXHierarchyPathNames?: string
}

export interface IntegrationResult {
  success: boolean
  provider: string
  validationStatus?: string
  error?: string
  message?: string
  lastError?: string
}

// ============================================
// Input Validation
// ============================================

// isValidOrgSlug imported from @/lib/utils/validation (see imports above)

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
  return await getCachedApiKey(orgSlug)
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
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(input.orgSlug)
    } catch (err) {
      return {
        success: false,
        provider: input.provider,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    // Note: Provider limits are enforced by the API (BigQuery is source of truth)
    // The API will return 429 if the limit is exceeded

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
      // Map hierarchy fields from camelCase to snake_case (5-field model)
      // Uses default_x_hierarchy_* to match BigQuery schema
      default_x_hierarchy_entity_id: input.defaultXHierarchyEntityId,
      default_x_hierarchy_entity_name: input.defaultXHierarchyEntityName,
      default_x_hierarchy_level_code: input.defaultXHierarchyLevelCode,
      default_x_hierarchy_path: input.defaultXHierarchyPath,
      default_x_hierarchy_path_names: input.defaultXHierarchyPathNames,
    }

    const response = await backend.setupIntegration(
      input.orgSlug,
      input.provider,
      request
    )

    // Integration status is stored in BigQuery via the API - no Supabase sync needed
    // Frontend reads from API which reads from BigQuery (single source of truth)

    return {
      success: response.success,
      provider: response.provider,
      validationStatus: response.validation_status,
      error: response.validation_error,
      message: response.message,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Integration setup failed"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      provider: input.provider,
      error: errorDetail || errorMessage,
    }
  }
}

/**
 * Update integration metadata without re-uploading credentials.
 * Use this to configure provider-specific settings like GCP billing export tables.
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export interface UpdateMetadataInput {
  orgSlug: string
  provider: IntegrationProvider
  metadata: Record<string, unknown>
}

export async function updateIntegrationMetadata(
  input: UpdateMetadataInput
): Promise<IntegrationResult> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(input.orgSlug)) {
      return { success: false, provider: input.provider, error: "Invalid organization identifier" }
    }

    if (!VALID_PROVIDERS.includes(input.provider)) {
      return { success: false, provider: input.provider, error: `Invalid provider: ${input.provider}` }
    }

    // Step 2: Verify authentication and authorization
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(input.orgSlug)
    } catch (err) {
      return {
        success: false,
        provider: input.provider,
        error: err instanceof Error ? err.message : "Not authorized",
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

    // Step 4: Create backend client and update metadata
    const backend = new BackendClient({ orgApiKey: apiKey })

    const response = await backend.updateIntegrationMetadata(
      input.orgSlug,
      input.provider,
      {
        metadata: input.metadata,
        skip_validation: true, // Don't re-validate credentials
      }
    )

    return {
      success: response.success,
      provider: response.provider,
      validationStatus: response.validation_status,
      error: response.validation_error,
      message: response.message,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Metadata update failed"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      provider: input.provider,
      error: errorDetail || errorMessage,
    }
  }
}

/**
 * Get all integration statuses for an organization.
 *
 * Data source: API service which reads from BigQuery (single source of truth)
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
        AWS_IAM: { provider: "AWS_IAM", status: "NOT_CONFIGURED" as const },
        AZURE: { provider: "AZURE", status: "NOT_CONFIGURED" as const },
        OCI: { provider: "OCI", status: "NOT_CONFIGURED" as const },
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
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    // Step 3: Get API key and fetch from API (BigQuery is source of truth)
    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      // No API key yet - org may be in onboarding, return defaults
      return defaultResponse
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const apiResponse = await client.getIntegrations(orgSlug)

    return {
      success: true,
      integrations: apiResponse,
    }
  } catch (integrationsError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getIntegrations] Failed to fetch integrations:", integrationsError)
    }
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

    // Step 2: Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        provider,
        error: err instanceof Error ? err.message : "Not authorized",
      }
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

    // Validation status is stored in BigQuery via the API - no Supabase sync needed

    // Return success based on validation status, not always true
    const isValid = response.validation_status === "VALID"
    return {
      success: isValid,
      provider: response.provider,
      validationStatus: response.validation_status,
      error: response.validation_error,
      message: response.message,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Validation failed"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      provider,
      error: errorDetail || errorMessage,
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

    // Step 2: Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        provider,
        error: err instanceof Error ? err.message : "Not authorized",
      }
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

    // Step 4: Delete via backend (BigQuery is source of truth)
    const backend = new BackendClient({ orgApiKey: apiKey })
    const response = await backend.deleteIntegration(orgSlug, provider)

    return {
      success: response.success,
      provider,
      message: response.message,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Delete failed"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      provider,
      error: errorDetail || errorMessage,
    }
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
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
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to list pricing"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.updateLLMPricing(orgSlug, provider, modelId, pricing)

    return {
      success: true,
      pricing: result
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to update pricing"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.createLLMPricing(orgSlug, provider, pricing)

    return {
      success: true,
      pricing: result
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to create pricing"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.deleteLLMPricing(orgSlug, provider, modelId)

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to delete pricing"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.resetLLMPricing(orgSlug, provider)

    return {
      success: true,
      message: "Pricing reset to defaults"
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to reset pricing"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
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
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to list subscriptions"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.updateSaaSSubscription(orgSlug, provider, planName, subscription)

    return {
      success: true,
      subscription: result
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to update subscription"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    const result = await client.createSaaSSubscription(orgSlug, provider, subscription)

    return {
      success: true,
      subscription: result
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to create subscription"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.deleteSaaSSubscription(orgSlug, provider, planName)

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to delete subscription"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })
    await client.resetSaaSSubscriptions(orgSlug, provider)

    return {
      success: true,
      message: "Subscriptions reset to defaults"
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to reset subscriptions"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
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
 *
 * NOTE: This functionality requires an API endpoint that doesn't exist yet.
 * Integration state is managed via BigQuery - use deleteIntegration to disable.
 */
export async function toggleIntegrationEnabled(
  _orgSlug: string,
  _provider: IntegrationProvider,
  _enabled: boolean,
  _credentialId?: string
): Promise<{
  success: boolean
  enabled?: boolean
  error?: string
}> {
  // TODO: Add API endpoint to support enable/disable toggle
  // For now, use deleteIntegration to remove unwanted integrations
  return {
    success: false,
    error: "Toggle functionality not yet supported. Use delete to remove integrations.",
  }
}

// ============================================
// Cloud Provider Integration Management
// ============================================

export interface CloudIntegration {
  id: string
  credential_id: string
  credential_name: string
  provider: string
  account_identifier?: string
  billing_account_id?: string
  status: string
  last_validated_at?: string
  last_error?: string
  is_enabled: boolean
  configured_at: string
  metadata?: Record<string, unknown>
}

/**
 * Get all cloud provider integrations for an organization.
 * Uses API which reads from BigQuery (single source of truth).
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function getCloudIntegrations(
  orgSlug: string,
  provider?: CloudProvider
): Promise<{
  success: boolean
  integrations?: CloudIntegration[]
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug format" }
    }

    // Verify authentication and authorization
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    // Get API key and fetch from API (BigQuery is source of truth)
    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = new BackendClient({ orgApiKey: apiKey })

    // If provider specified, get single integration; otherwise get all
    if (provider) {
      const integration = await client.getIntegrationStatus(orgSlug, provider)
      if (integration.status === "NOT_CONFIGURED") {
        return { success: true, integrations: [] }
      }
      return {
        success: true,
        integrations: [{
          id: integration.credential_id || `${provider}_primary`,
          credential_id: integration.credential_id || `${provider}_primary`,
          credential_name: integration.credential_name || `${provider.toUpperCase()} Integration`,
          provider: provider,
          status: integration.status,
          last_validated_at: integration.last_validated_at,
          last_error: integration.last_error,
          is_enabled: integration.is_enabled !== false,
          configured_at: integration.created_at || new Date().toISOString(),
          metadata: integration.metadata,
        }],
      }
    }

    // Get all integrations and filter cloud providers
    const allIntegrations = await client.getIntegrations(orgSlug)
    const cloudProviders = ["GCP_SA", "AWS_IAM", "AZURE", "OCI"]
    const cloudIntegrations: CloudIntegration[] = []

    for (const [key, integration] of Object.entries(allIntegrations.integrations)) {
      if (cloudProviders.includes(key) && integration.status !== "NOT_CONFIGURED") {
        cloudIntegrations.push({
          id: integration.credential_id || `${key}_primary`,
          credential_id: integration.credential_id || `${key}_primary`,
          credential_name: integration.credential_name || `${key} Integration`,
          provider: key.replace("_SA", "").replace("_IAM", "").toLowerCase(),
          status: integration.status,
          last_validated_at: integration.last_validated_at,
          last_error: integration.last_error,
          is_enabled: integration.is_enabled !== false,
          configured_at: integration.created_at || new Date().toISOString(),
          metadata: integration.metadata,
        })
      }
    }

    return { success: true, integrations: cloudIntegrations }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to get cloud integrations"
    return { success: false, error: errorMessage }
  }
}

/**
 * Delete a specific cloud provider integration.
 * Uses the existing deleteIntegration function which calls the API.
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function deleteCloudIntegration(
  _orgSlug: string,
  _credentialId: string
): Promise<{
  success: boolean
  error?: string
}> {
  // Deprecated: Use deleteIntegration(orgSlug, provider) instead
  // BigQuery is the source of truth - credentials are identified by provider, not ID
  return {
    success: false,
    error: "Use deleteIntegration(orgSlug, provider) instead. credentialId-based deletion not supported.",
  }
}

// Types are now imported directly from @/lib/api/backend by components that need them
// Re-exports removed to fix Turbopack server action compilation issue
