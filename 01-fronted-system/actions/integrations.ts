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
  IntegrationStatus,
  LLMPricing,
  LLMPricingCreate,
  LLMPricingUpdate,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  SaaSSubscriptionUpdate,
  LLMProvider
} from "@/lib/api/backend"
import { getCachedApiKey } from "@/lib/auth-cache"

// ============================================
// Types
// ============================================

export type IntegrationProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "gcp" | "gcp_service_account" | "aws" | "azure" | "oci"

// Cloud providers use the new cloud_provider_integrations table
export type CloudProvider = "gcp" | "gcp_service_account" | "aws" | "azure" | "oci"

// LLM providers use the organizations table columns
export type LLMIntegrationProvider = "openai" | "anthropic" | "gemini" | "deepseek"

const VALID_PROVIDERS: IntegrationProvider[] = ["openai", "anthropic", "gemini", "deepseek", "gcp", "gcp_service_account", "aws", "azure", "oci"]

const CLOUD_PROVIDERS: CloudProvider[] = ["gcp", "gcp_service_account", "aws", "azure", "oci"]

function isCloudProvider(provider: string): provider is CloudProvider {
  return CLOUD_PROVIDERS.includes(provider.toLowerCase() as CloudProvider)
}

export interface SetupIntegrationInput {
  orgSlug: string
  provider: IntegrationProvider
  credential: string
  credentialName?: string
  metadata?: Record<string, unknown>
  // Default hierarchy for GenAI integrations
  defaultHierarchyLevel1Id?: string
  defaultHierarchyLevel1Name?: string
  defaultHierarchyLevel2Id?: string
  defaultHierarchyLevel2Name?: string
  defaultHierarchyLevel3Id?: string
  defaultHierarchyLevel3Name?: string
  defaultHierarchyLevel4Id?: string
  defaultHierarchyLevel4Name?: string
  defaultHierarchyLevel5Id?: string
  defaultHierarchyLevel5Name?: string
  defaultHierarchyLevel6Id?: string
  defaultHierarchyLevel6Name?: string
  defaultHierarchyLevel7Id?: string
  defaultHierarchyLevel7Name?: string
  defaultHierarchyLevel8Id?: string
  defaultHierarchyLevel8Name?: string
  defaultHierarchyLevel9Id?: string
  defaultHierarchyLevel9Name?: string
  defaultHierarchyLevel10Id?: string
  defaultHierarchyLevel10Name?: string
}

export interface IntegrationResult {
  success: boolean
  provider: string
  validationStatus?: string
  error?: string
  message?: string
  lastError?: string
}

// IntegrationStatus is imported from lib/api/backend.ts

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
    // Verify authentication (use cached auth for performance)
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

    // Step 2.5: Check if adding this integration would exceed the provider limit
    const adminClient = createServiceRoleClient()
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("id, providers_limit, integration_openai_status, integration_anthropic_status, integration_gemini_status, integration_deepseek_status, integration_gcp_status")
      .eq("org_slug", input.orgSlug)
      .single()

    if (orgData) {
      const providersLimit = orgData.providers_limit || 10

      // Count LLM integrations from organizations table
      type OrgDataWithIntegrations = typeof orgData & {
        integration_openai_status?: string | null
        integration_anthropic_status?: string | null
        integration_gemini_status?: string | null
        integration_deepseek_status?: string | null
        integration_gcp_status?: string | null
      }
      const orgWithIntegrations = orgData as OrgDataWithIntegrations

      let configuredCount = 0

      // Count LLM providers
      const llmStatusMap: Record<string, string | null | undefined> = {
        openai: orgWithIntegrations.integration_openai_status,
        anthropic: orgWithIntegrations.integration_anthropic_status,
        gemini: orgWithIntegrations.integration_gemini_status,
        deepseek: orgWithIntegrations.integration_deepseek_status,
      }

      for (const status of Object.values(llmStatusMap)) {
        if (status === 'VALID') configuredCount++
      }

      // Count cloud provider integrations from junction table
      const { count: cloudCount } = await adminClient
        .from("cloud_provider_integrations")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgData.id)
        .eq("status", "VALID")
        .eq("is_enabled", true)

      configuredCount += cloudCount || 0

      // GCP fallback from organizations table (if not in junction table yet)
      if (orgWithIntegrations.integration_gcp_status === 'VALID' && (cloudCount || 0) === 0) {
        configuredCount++
      }

      // Check if this provider is already configured
      let isAlreadyConfigured = false
      if (isCloudProvider(input.provider)) {
        const normalizedProvider = input.provider === "gcp_service_account" ? "gcp" : input.provider
        const { data: existing } = await adminClient
          .from("cloud_provider_integrations")
          .select("id")
          .eq("org_id", orgData.id)
          .eq("provider", normalizedProvider)
          .eq("status", "VALID")
          .limit(1)
        isAlreadyConfigured = (existing && existing.length > 0) || false
      } else {
        isAlreadyConfigured = llmStatusMap[input.provider.toLowerCase()] === 'VALID'
      }

      if (!isAlreadyConfigured && configuredCount >= providersLimit) {
        return {
          success: false,
          provider: input.provider,
          error: `Integration limit reached (${configuredCount}/${providersLimit}). Upgrade your plan to add more integrations.`,
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
      // Map hierarchy fields from camelCase to snake_case
      default_hierarchy_level_1_id: input.defaultHierarchyLevel1Id,
      default_hierarchy_level_1_name: input.defaultHierarchyLevel1Name,
      default_hierarchy_level_2_id: input.defaultHierarchyLevel2Id,
      default_hierarchy_level_2_name: input.defaultHierarchyLevel2Name,
      default_hierarchy_level_3_id: input.defaultHierarchyLevel3Id,
      default_hierarchy_level_3_name: input.defaultHierarchyLevel3Name,
      default_hierarchy_level_4_id: input.defaultHierarchyLevel4Id,
      default_hierarchy_level_4_name: input.defaultHierarchyLevel4Name,
      default_hierarchy_level_5_id: input.defaultHierarchyLevel5Id,
      default_hierarchy_level_5_name: input.defaultHierarchyLevel5Name,
      default_hierarchy_level_6_id: input.defaultHierarchyLevel6Id,
      default_hierarchy_level_6_name: input.defaultHierarchyLevel6Name,
      default_hierarchy_level_7_id: input.defaultHierarchyLevel7Id,
      default_hierarchy_level_7_name: input.defaultHierarchyLevel7Name,
      default_hierarchy_level_8_id: input.defaultHierarchyLevel8Id,
      default_hierarchy_level_8_name: input.defaultHierarchyLevel8Name,
      default_hierarchy_level_9_id: input.defaultHierarchyLevel9Id,
      default_hierarchy_level_9_name: input.defaultHierarchyLevel9Name,
      default_hierarchy_level_10_id: input.defaultHierarchyLevel10Id,
      default_hierarchy_level_10_name: input.defaultHierarchyLevel10Name,
    }

    const response = await backend.setupIntegration(
      input.orgSlug,
      input.provider,
      request
    )

    // Save integration status to Supabase (all states: VALID, INVALID, PENDING)
    // This ensures UI reflects actual state even when validation fails
    // CRITICAL: Pass credential_id from backend to ensure Supabase record matches BigQuery
    if (response.validation_status) {
      await saveIntegrationStatus(input.orgSlug, input.provider, response.validation_status, {
        credentialId: response.credential_id || undefined,
        credentialName: input.credentialName,
      })
    }

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
 * Get all integration statuses for an organization.
 * - LLM providers: Reads from Supabase organizations table columns
 * - Cloud providers: Reads from cloud_provider_integrations table
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

    const supabase = await createClient()

    // Get org ID first
    const { data: orgExists, error: existsError } = await supabase
      .from("organizations")
      .select("id")
      .eq("org_slug", orgSlug)
      .single()

    if (existsError || !orgExists) {
      return defaultResponse
    }

    // Get LLM integrations from organizations table
    const { data: org, error: _orgError } = await supabase
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

    // Get cloud provider integrations from junction table (primary per provider)
    const { data: cloudIntegrations, error: _cloudError } = await supabase
      .from("cloud_provider_integrations")
      .select("*")
      .eq("org_id", orgExists.id)
      .eq("is_enabled", true)
      .order("configured_at", { ascending: true })

    // Build integrations map
    const integrations: Record<string, IntegrationStatus> = {}

    // LLM providers from organizations table
    type OrgDataWithOptionalIntegrations = typeof org & {
      integration_openai_enabled?: boolean
      integration_anthropic_enabled?: boolean
      integration_gemini_status?: string
      integration_gemini_configured_at?: string
      integration_gemini_enabled?: boolean
      integration_deepseek_status?: string
      integration_deepseek_configured_at?: string
      integration_deepseek_enabled?: boolean
      integration_gcp_status?: string
      integration_gcp_configured_at?: string
      integration_gcp_enabled?: boolean
    }

    const orgData = (org || {}) as OrgDataWithOptionalIntegrations

    integrations.OPENAI = {
      provider: "OPENAI",
      status: (orgData?.integration_openai_status as IntegrationStatus["status"]) || "NOT_CONFIGURED",
      created_at: orgData?.integration_openai_configured_at,
      last_validated_at: orgData?.integration_openai_configured_at,
      is_enabled: orgData?.integration_openai_enabled !== false,
    }
    integrations.ANTHROPIC = {
      provider: "ANTHROPIC",
      status: (orgData?.integration_anthropic_status as IntegrationStatus["status"]) || "NOT_CONFIGURED",
      created_at: orgData?.integration_anthropic_configured_at,
      last_validated_at: orgData?.integration_anthropic_configured_at,
      is_enabled: orgData?.integration_anthropic_enabled !== false,
    }
    integrations.GEMINI = {
      provider: "GEMINI",
      status: (orgData?.integration_gemini_status as IntegrationStatus["status"]) || "NOT_CONFIGURED",
      created_at: orgData?.integration_gemini_configured_at,
      last_validated_at: orgData?.integration_gemini_configured_at,
      is_enabled: orgData?.integration_gemini_enabled !== false,
    }
    integrations.DEEPSEEK = {
      provider: "DEEPSEEK",
      status: (orgData?.integration_deepseek_status as IntegrationStatus["status"]) || "NOT_CONFIGURED",
      created_at: orgData?.integration_deepseek_configured_at,
      last_validated_at: orgData?.integration_deepseek_configured_at,
      is_enabled: orgData?.integration_deepseek_enabled !== false,
    }

    // Cloud providers from junction table OR fallback to organizations columns (GCP only for backward compat)
    // Map provider names to integration keys
    const cloudProviderMap: Record<string, string> = {
      gcp: "GCP_SA",
      aws: "AWS_IAM",
      azure: "AZURE",
      oci: "OCI",
    }

    // Initialize cloud providers with defaults
    integrations.GCP_SA = { provider: "GCP_SA", status: "NOT_CONFIGURED" as const }
    integrations.AWS_IAM = { provider: "AWS_IAM", status: "NOT_CONFIGURED" as const }
    integrations.AZURE = { provider: "AZURE", status: "NOT_CONFIGURED" as const }
    integrations.OCI = { provider: "OCI", status: "NOT_CONFIGURED" as const }

    // Override from cloud_provider_integrations table
    if (cloudIntegrations && cloudIntegrations.length > 0) {
      // Get first (primary) integration per provider
      const primaryByProvider = new Map<string, typeof cloudIntegrations[0]>()
      for (const integration of cloudIntegrations) {
        if (!primaryByProvider.has(integration.provider)) {
          primaryByProvider.set(integration.provider, integration)
        }
      }

      for (const [provider, integration] of primaryByProvider) {
        const key = cloudProviderMap[provider]
        if (key) {
          integrations[key] = {
            provider: key,
            status: (integration.status as IntegrationStatus["status"]) || "NOT_CONFIGURED",
            created_at: integration.configured_at,
            last_validated_at: integration.last_validated_at,
            is_enabled: integration.is_enabled !== false,
            credential_id: integration.credential_id,
            credential_name: integration.credential_name,
          }
        }
      }
    } else if (orgData?.integration_gcp_status) {
      // Fallback: GCP from organizations table (backward compat during migration)
      integrations.GCP_SA = {
        provider: "GCP_SA",
        status: (orgData.integration_gcp_status as IntegrationStatus["status"]) || "NOT_CONFIGURED",
        created_at: orgData.integration_gcp_configured_at,
        last_validated_at: orgData.integration_gcp_configured_at,
        is_enabled: orgData.integration_gcp_enabled !== false,
      }
    }

    const providersConfigured = Object.entries(integrations)
      .filter(([, v]) => v && v.status === "VALID")
      .map(([k]) => k)

    const allValid = providersConfigured.length >= 4 // At least 4 providers configured

    return {
      success: true,
      integrations: {
        org_slug: orgSlug,
        integrations,
        all_valid: allValid,
        providers_configured: providersConfigured,
      },
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
// Helper: Save Integration Status to Supabase
// ============================================

/**
 * Save integration status.
 * - Cloud providers (gcp, aws, azure, oci) → cloud_provider_integrations table
 * - LLM providers (openai, anthropic, etc.) → organizations table columns
 */
async function saveIntegrationStatus(
  orgSlug: string,
  provider: IntegrationProvider,
  status: string,
  options?: {
    credentialId?: string
    credentialName?: string
    accountIdentifier?: string
    billingAccountId?: string
    metadata?: Record<string, unknown>
    lastError?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = createServiceRoleClient()

    // Cloud providers use the new junction table
    if (isCloudProvider(provider)) {
      return await saveCloudIntegrationStatus(orgSlug, provider, status, options)
    }

    // LLM providers use the organizations table columns
    const columnMap: Record<string, string> = {
      openai: "integration_openai",
      anthropic: "integration_anthropic",
      gemini: "integration_gemini",
      deepseek: "integration_deepseek",
    }

    const columnPrefix = columnMap[provider]
    if (!columnPrefix) {
      return { success: false, error: `Unknown provider: ${provider}` }
    }

    const updateData: Record<string, string> = {
      [`${columnPrefix}_status`]: status,
    }

    // Add configured_at timestamp for successful setup
    if (status === "VALID") {
      updateData[`${columnPrefix}_configured_at`] = new Date().toISOString()
    }

    const { error: dbError } = await adminClient
      .from("organizations")
      .update(updateData)
      .eq("org_slug", orgSlug)

    if (dbError) {
      return { success: false, error: dbError.message }
    }

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    return { success: false, error: errorMessage }
  }
}

/**
 * Save cloud provider integration status to junction table.
 * Supports multiple credentials per provider.
 */
async function saveCloudIntegrationStatus(
  orgSlug: string,
  provider: CloudProvider,
  status: string,
  options?: {
    credentialId?: string
    credentialName?: string
    accountIdentifier?: string
    billingAccountId?: string
    metadata?: Record<string, unknown>
    lastError?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = createServiceRoleClient()

    // Get org ID from slug
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    // Normalize provider name (gcp_service_account -> gcp)
    const normalizedProvider = provider === "gcp_service_account" ? "gcp" : provider

    // Use provided credential ID or default to stable pattern (provider_primary)
    // IMPORTANT: Don't use timestamp - that creates duplicate records on each setup
    const credentialId = options?.credentialId || `${normalizedProvider}_primary`
    const credentialName = options?.credentialName || `${normalizedProvider.toUpperCase()} Integration`

    // Upsert integration record
    const { error: upsertError } = await adminClient
      .from("cloud_provider_integrations")
      .upsert(
        {
          org_id: org.id,
          credential_id: credentialId,
          credential_name: credentialName,
          provider: normalizedProvider,
          status: status,
          account_identifier: options?.accountIdentifier,
          billing_account_id: options?.billingAccountId,
          metadata: options?.metadata || {},
          last_error: options?.lastError,
          last_validated_at: status === "VALID" ? new Date().toISOString() : null,
          configured_at: new Date().toISOString(),
        },
        {
          onConflict: "org_id,credential_id",
        }
      )

    if (upsertError) {
      return { success: false, error: upsertError.message }
    }

    // CRITICAL FIX: Also update the organizations table integration status column
    // The pipelines.ts checks organizations.integration_*_status for required integrations
    // Without this update, pipelines will fail with "Required integration not configured"
    const orgColumnMap: Record<string, string> = {
      gcp: "integration_gcp_status",
      aws: "integration_aws_status",
      azure: "integration_azure_status",
      oci: "integration_oci_status",
    }

    const orgColumn = orgColumnMap[normalizedProvider]
    if (orgColumn) {
      const orgUpdate: Record<string, string> = {
        [orgColumn]: status,
      }
      // Add configured_at timestamp for successful setup
      if (status === "VALID") {
        orgUpdate[`integration_${normalizedProvider}_configured_at`] = new Date().toISOString()
      }

      const { error: orgUpdateError } = await adminClient
        .from("organizations")
        .update(orgUpdate)
        .eq("org_slug", orgSlug)

      if (orgUpdateError) {
        console.warn(`[saveCloudIntegrationStatus] Failed to update org status column: ${orgUpdateError.message}`)
        // Don't fail the overall operation - junction table is the source of truth
      }
    }

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    return { success: false, error: errorMessage }
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
 * - Cloud providers: Updates cloud_provider_integrations table
 * - LLM providers: Updates organizations table columns
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function toggleIntegrationEnabled(
  orgSlug: string,
  provider: IntegrationProvider,
  enabled: boolean,
  credentialId?: string // Optional: for multi-credential cloud providers
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

    const adminClient = createServiceRoleClient()

    // Cloud providers use the junction table
    if (isCloudProvider(provider)) {
      // Get org ID
      const { data: org, error: orgError } = await adminClient
        .from("organizations")
        .select("id")
        .eq("org_slug", orgSlug)
        .single()

      if (orgError || !org) {
        return { success: false, error: "Organization not found" }
      }

      const normalizedProvider = provider === "gcp_service_account" ? "gcp" : provider

      // Build query
      let query = adminClient
        .from("cloud_provider_integrations")
        .update({ is_enabled: enabled })
        .eq("org_id", org.id)
        .eq("provider", normalizedProvider)

      // If credentialId provided, update specific credential; otherwise update primary
      if (credentialId) {
        query = query.eq("credential_id", credentialId)
      }

      const { error } = await query

      if (error) {
        return { success: false, error: "Failed to update cloud integration state" }
      }

      return { success: true, enabled }
    }

    // LLM providers use organizations table columns
    const columnMap: Record<string, string> = {
      openai: "integration_openai",
      anthropic: "integration_anthropic",
      gemini: "integration_gemini",
      deepseek: "integration_deepseek",
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
      return { success: false, error: "Failed to update integration state" }
    }

    return { success: true, enabled }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to toggle integration"
    const errorDetail = err && typeof err === 'object' && 'detail' in err ? String((err as {detail?: unknown}).detail) : undefined
    return {
      success: false,
      error: errorDetail || errorMessage
    }
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
 * Returns all credentials for all cloud providers (for future multi-credential UI).
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

    const supabase = await createClient()

    // Get org ID
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    // Build query
    let query = supabase
      .from("cloud_provider_integrations")
      .select("*")
      .eq("org_id", org.id)
      .order("provider")
      .order("configured_at", { ascending: true })

    if (provider) {
      const normalizedProvider = provider === "gcp_service_account" ? "gcp" : provider
      query = query.eq("provider", normalizedProvider)
    }

    const { data: integrations, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      integrations: integrations as CloudIntegration[],
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to get cloud integrations"
    return { success: false, error: errorMessage }
  }
}

/**
 * Delete a specific cloud provider integration.
 *
 * SECURITY: Verifies user is authenticated and member of the organization.
 */
export async function deleteCloudIntegration(
  orgSlug: string,
  credentialId: string
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

    const adminClient = createServiceRoleClient()

    // Get org ID
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    // Delete the integration
    const { error } = await adminClient
      .from("cloud_provider_integrations")
      .delete()
      .eq("org_id", org.id)
      .eq("credential_id", credentialId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to delete cloud integration"
    return { success: false, error: errorMessage }
  }
}

// Re-export types for use in components
// Note: CloudProvider is already exported above on line 39
export type {
  LLMPricing,
  LLMPricingCreate,
  LLMPricingUpdate,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  SaaSSubscriptionUpdate,
  LLMProvider
}
