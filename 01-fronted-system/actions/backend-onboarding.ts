"use server"

/**
 * Backend Onboarding Server Actions
 *
 * Handles communication between Supabase frontend and FastAPI backend
 * for organization onboarding and API key generation.
 *
 * SECURITY:
 * - Org API key is stored in Supabase org_api_keys_secure table (service_role only)
 * - This table has NO RLS - only accessible via server actions
 * - Fingerprint stored in Supabase organizations table for display
 * - Full key is KMS encrypted in BigQuery backend (by the backend service)
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { PipelineBackendClient, OnboardOrgRequest } from "@/lib/api/backend"
import { createHash } from "crypto"
import { isValidOrgSlug } from "@/lib/utils/validation"
import { getUserFriendlyError } from "@/lib/errors/user-friendly"

/**
 * Generate a fingerprint (hash) of an API key for display.
 */
function generateApiKeyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").substring(0, 16)
}

// ============================================
// Reveal Token Storage (Supabase-backed)
// ============================================
// FIX SEC-001, SCALE-001: Use Supabase instead of in-memory cache
// This ensures tokens work across serverless instances

// Token TTL: 15 minutes for security-sensitive API key reveal operation
const REVEAL_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Generate a reveal token for an API key and store in Supabase.
 * FIX SEC-001: Uses Supabase table instead of in-memory cache for cross-instance support.
 * The token can be used once to retrieve the API key.
 */
async function generateRevealToken(
  orgSlug: string,
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  // Generate a random token
  const tokenBytes = createHash("sha256")
    .update(`${orgSlug}_${userId}_${Date.now()}_${Math.random()}`)
    .digest("hex")
  const token = `reveal_${tokenBytes.substring(0, 32)}`
  const expiresAt = new Date(Date.now() + REVEAL_TOKEN_TTL_MS)

  // Store in Supabase (replaces in-memory cache)
  const adminClient = createServiceRoleClient()
  const { error } = await adminClient
    .from("reveal_tokens")
    .insert({
      token,
      org_slug: orgSlug,
      user_id: userId,
      expires_at: expiresAt.toISOString(),
    })

  if (error) {
    // Log but don't fail - token creation is not critical
    if (process.env.NODE_ENV === "development") {
      console.warn("[generateRevealToken] Failed to store token:", error.message)
    }
  }

  return { token, expiresAt }
}

/**
 * Internal helper: Reveal an API key from a reveal token stored in Supabase.
 * FIX SEC-001: Fetches from Supabase and retrieves API key from secure storage.
 * Token is consumed (deleted) after use.
 */
async function _revealApiKeyInternal(revealToken: string, userId: string): Promise<string> {
  const adminClient = createServiceRoleClient()

  // Fetch token from Supabase
  const { data: tokenData, error: fetchError } = await adminClient
    .from("reveal_tokens")
    .select("org_slug, user_id, expires_at")
    .eq("token", revealToken)
    .single()

  if (fetchError || !tokenData) {
    throw new Error("Token not found or already used")
  }

  // Verify token belongs to this user
  if (tokenData.user_id !== userId) {
    throw new Error("Token does not belong to this user")
  }

  // Check expiration
  if (new Date(tokenData.expires_at) < new Date()) {
    // Delete expired token
    await adminClient.from("reveal_tokens").delete().eq("token", revealToken)
    throw new Error("Token has expired")
  }

  // Fetch API key from secure storage
  const apiKey = await getOrgApiKeySecure(tokenData.org_slug)
  if (!apiKey) {
    throw new Error("API key not found in secure storage")
  }

  // Consume the token (one-time use) - delete it
  await adminClient.from("reveal_tokens").delete().eq("token", revealToken)

  return apiKey
}

// ============================================
// Authorization Helper
// ============================================

/**
 * Verify user is authenticated and belongs to the organization.
 * SECURITY: Prevents cross-tenant access to API keys and org settings.
 *
 * Uses join query pattern to work with RLS policies that restrict
 * direct access to organizations table.
 *
 * @deprecated Use requireOrgMembership from @/lib/auth-cache instead.
 * Kept for reference of the join query pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _verifyOrgMembership(orgSlug: string): Promise<{
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

  // Use join query pattern - this works with RLS policies that restrict
  // direct access to organizations table. Query organization_members with
  // inner join to organizations, filtered by user_id and org_slug.
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("id, role, status, org_id, organizations!inner(id, org_slug)")
    .eq("user_id", user.id)
    .eq("organizations.org_slug", orgSlug)
    .eq("status", "active")
    .single()

  if (memberError || !membership) {
    // Provide more specific error based on query result
    if (memberError?.code === "PGRST116") {
      // No rows returned - either org doesn't exist or user not a member
      return { authorized: false, userId: user.id, error: "Organization not found or you are not a member" }
    }
    return { authorized: false, userId: user.id, error: memberError?.message || "Not a member of this organization" }
  }

  // Extract org_id from the joined result
  const orgData = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations as { id: string; org_slug: string }

  if (!orgData || !orgData.id) {
    return { authorized: false, userId: user.id, error: "Organization data incomplete" }
  }

  return { authorized: true, userId: user.id, orgId: orgData.id }
}

// ============================================
// Input Validation
// ============================================
// Note: isValidOrgSlug is imported from @/lib/utils/validation
// for consistency across the codebase (matches backend pattern)

// ============================================
// Helper: Secure API Key Storage (Server-Side Only)
// ============================================

/**
 * Store org API key in secure server-side table.
 *
 * SECURITY:
 * - Uses service_role client to access RLS-protected table
 * - This table has NO RLS policies = only service_role can access
 * - Only accessible from server actions (not client-side)
 * - KMS encryption is handled by the backend when storing in BigQuery
 *
 * MIGRATION REQUIRED: Run scripts/supabase_db/05_secure_api_keys.sql first.
 */
async function storeApiKeySecure(
  orgSlug: string,
  apiKey: string
): Promise<boolean> {
  try {
    const adminClient = createServiceRoleClient()

    // Upsert into secure table (service_role bypasses RLS)
    // Store API key directly - table is secure via service_role access only
    // Note: Table schema only has org_slug, api_key, created_at, updated_at
    const { error } = await adminClient
      .from("org_api_keys_secure")
      .upsert({
        org_slug: orgSlug,
        api_key: apiKey,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "org_slug",
      })

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error(`[storeApiKeySecure] Failed to store API key for ${orgSlug}:`, error.message)
      }
      return false
    }

    return true
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[storeApiKeySecure] Exception storing API key for ${orgSlug}:`, err)
    }
    return false
  }
}

/**
 * Get org API key from secure server-side table.
 *
 * SECURITY:
 * - Only accessible via server actions (service_role)
 * - Table has no RLS - only service_role can access
 *
 * Returns null if not found - caller must handle missing key appropriately.
 */
export async function getOrgApiKeySecure(orgSlug: string): Promise<string | null> {
  try {
    const adminClient = createServiceRoleClient()

    const { data, error } = await adminClient
      .from("org_api_keys_secure")
      .select("api_key")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      return null
    }

    // Return API key directly
    if (data.api_key) {
      return data.api_key
    }

    return null
  } catch (fetchError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getOrgApiKeySecure] Failed to fetch API key:", fetchError)
    }
    return null
  }
}

interface BackendOnboardingResult {
  success: boolean
  orgSlug?: string
  /**
   * @deprecated Use revealToken instead. Full API key should not be exposed to browser.
   * Only returned for initial creation - use revealApiKeyFromToken() to retrieve.
   */
  apiKey?: string
  apiKeyFingerprint?: string // SHA-256 hash prefix for identification
  /**
   * One-time reveal token for API key display.
   * Expires after 15 minutes. Use revealApiKeyFromToken() server action to retrieve key.
   * SECURITY FIX #3: Avoid exposing full API key to browser.
   */
  revealToken?: string
  revealTokenExpiresAt?: string // ISO date string
  error?: string
}

/**
 * Onboard organization to backend after Supabase org creation.
 *
 * Flow:
 * 1. Called after createOrganization() succeeds in Supabase
 * 2. Calls backend /organizations/onboard
 * 3. Receives org API key (plaintext)
 * 4. Updates Supabase org with backend_onboarded flag
 * 5. Returns API key to show user ONCE
 */
export async function onboardToBackend(input: {
  orgSlug: string
  companyName: string
  adminEmail: string
  subscriptionPlan?: "STARTER" | "PROFESSIONAL" | "SCALE"
  // i18n fields (from signup form)
  defaultCurrency?: string  // ISO 4217 (e.g., USD, AED)
  defaultTimezone?: string  // IANA timezone (e.g., UTC, Asia/Dubai)
}): Promise<BackendOnboardingResult> {
  try {
    // Get current user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Check if backend URL is configured
    // Use API_SERVICE_URL for server-side, fall back to NEXT_PUBLIC_ version
    const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
    if (!backendUrl) {
      return {
        success: true,
        orgSlug: input.orgSlug,
        apiKey: undefined,
        apiKeyFingerprint: undefined,
      }
    }

    // Get admin API key from server-side env (required for onboarding)
    const adminApiKey = process.env.CA_ROOT_API_KEY
    if (!adminApiKey) {
      return {
        success: false,
        error: "Backend admin key not configured. Please contact support.",
      }
    }

    // FIX GAP-001: Validate bootstrap completed before onboarding
    // Check if system is initialized (21 meta tables exist)
    try {
      const bootstrapStatusResponse = await fetch(
        `${backendUrl}/api/v1/admin/bootstrap/status`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-CA-Root-Key": adminApiKey,
          },
        }
      )

      if (!bootstrapStatusResponse.ok) {
        // Bootstrap endpoint failed - system may not be initialized
        return {
          success: false,
          error: "System initialization check failed. Please try again in a few moments or contact support.",
        }
      }

      const bootstrapStatus = await bootstrapStatusResponse.json()

      // Check if any tables are missing (critical - blocks onboarding)
      if (bootstrapStatus.tables_missing && bootstrapStatus.tables_missing.length > 0) {
        return {
          success: false,
          error: `System setup incomplete (${bootstrapStatus.tables_missing.length} tables missing). Please contact support.`,
        }
      }

      // Allow both SYNCED and OUT_OF_SYNC (schema differences are non-critical)
      // Only block if status indicates NOT_BOOTSTRAPPED or ERROR
      if (bootstrapStatus.status !== "SYNCED" && bootstrapStatus.status !== "OUT_OF_SYNC") {
        return {
          success: false,
          error: "System setup is incomplete. Please contact support to complete initialization.",
        }
      }
    } catch (_bootstrapCheckError) {
      // Network error or unexpected response - error details logged for debugging
      return {
        success: false,
        error: "Unable to verify system readiness. Please try again or contact support.",
      }
    }

    // Create backend client with admin key for onboarding
    const backend = new PipelineBackendClient({ adminApiKey })

    // Call backend onboarding
    const request: OnboardOrgRequest = {
      org_slug: input.orgSlug,
      company_name: input.companyName,
      admin_email: input.adminEmail,
      subscription_plan: input.subscriptionPlan || "STARTER",
      // i18n fields (default to USD/UTC if not provided)
      default_currency: input.defaultCurrency || "USD",
      default_timezone: input.defaultTimezone || "UTC",
    }

    const response = await backend.onboardOrganization(request)

    // Extract API key fingerprint (last 4 chars)
    const apiKeyFingerprint = response.api_key
      ? response.api_key.slice(-4)
      : undefined

    // FIX GAP-004: Update Supabase org with retry logic (exponential backoff)
    // Backend succeeded, must sync to Supabase to avoid inconsistent state
    const adminClient = createServiceRoleClient()

    let retryCount = 0
    const maxRetries = 3
    let updateSuccess = false

    while (retryCount < maxRetries && !updateSuccess) {
      try {
        const { error: updateError } = await adminClient
          .from("organizations")
          .update({
            backend_onboarded: true,
            backend_api_key_fingerprint: apiKeyFingerprint,
            backend_onboarded_at: new Date().toISOString(),
          })
          .eq("org_slug", input.orgSlug)

        if (!updateError) {
          updateSuccess = true
          break
        }

        throw new Error(updateError.message)
      } catch (err) {
        retryCount++

        if (retryCount >= maxRetries) {
          // Max retries exceeded - backend succeeded but Supabase update failed
          // Store in compensation table for manual sync later
          try {
            await adminClient.from("pending_backend_syncs").insert({
              org_slug: input.orgSlug,
              api_key_fingerprint: apiKeyFingerprint,
              backend_onboarded_at: new Date().toISOString(),
              status: "pending_sync",
              retry_count: maxRetries,
              last_error: err instanceof Error ? err.message : "Unknown error",
            })
          } catch (compensationError) {
            // Even compensation failed - log for manual intervention
            if (process.env.NODE_ENV === "development") {
              console.error("[onboardToBackend] Compensation transaction failed:", compensationError)
            }
          }

          if (process.env.NODE_ENV === "development") {
            console.error("[onboardToBackend] Supabase update failed after retries:", err)
          }

          // Return success with warning (backend succeeded, sync can be done later)
          break
        }

        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)))
      }
    }

    // Store API key in secure server-side table (NOT user metadata)
    if (response.api_key) {
      await storeApiKeySecure(input.orgSlug, response.api_key)
    }

    // SECURITY FIX #3: Generate reveal token instead of exposing full API key
    // FIX SEC-002: Do NOT return apiKey directly - only via reveal token
    let revealToken: string | undefined
    let revealTokenExpiresAt: string | undefined

    if (response.api_key) {
      const tokenResult = await generateRevealToken(input.orgSlug, user.id)
      revealToken = tokenResult.token
      revealTokenExpiresAt = tokenResult.expiresAt.toISOString()
    }

    return {
      success: true,
      orgSlug: response.org_slug,
      // FIX SEC-002: Removed direct apiKey from response - use revealToken instead
      apiKeyFingerprint: response.api_key
        ? generateApiKeyFingerprint(response.api_key)
        : undefined,
      revealToken,
      revealTokenExpiresAt,
    }
  } catch (err: unknown) {
    // Extract error message and status code
    const error = err as { detail?: string; message?: string; statusCode?: number }
    const errorMessage = error.detail || error.message || "Backend onboarding failed"
    const statusCode = error.statusCode || 0

    // Handle 409 Conflict - org already exists in backend
    // This happens when backend has the org but Supabase wasn't synced
    // Solution: Retry onboard with regenerate_api_key_if_exists=true
    if (statusCode === 409 && errorMessage.includes("already exists with status 'ACTIVE'")) {

      try {
        // Create a new backend client for the retry (original is out of scope in catch block)
        const adminApiKey = process.env.CA_ROOT_API_KEY
        if (!adminApiKey) {
          throw new Error("CA_ROOT_API_KEY not configured")
        }
        const retryBackend = new PipelineBackendClient({ adminApiKey })

        // Retry onboard with regenerate flag - backend will regenerate API key
        const retryRequest: OnboardOrgRequest = {
          org_slug: input.orgSlug,
          company_name: input.companyName,
          admin_email: input.adminEmail,
          subscription_plan: input.subscriptionPlan || "STARTER",
          // i18n fields (default to USD/UTC if not provided)
          default_currency: input.defaultCurrency || "USD",
          default_timezone: input.defaultTimezone || "UTC",
          regenerate_api_key_if_exists: true,
        }

        const retryResponse = await retryBackend.onboardOrganization(retryRequest)

        // Store new API key in secure server-side table (NOT user metadata)
        if (retryResponse.api_key) {
          await storeApiKeySecure(input.orgSlug, retryResponse.api_key)
        }

        // Extract fingerprint using secure hash
        const newFingerprint = retryResponse.api_key
          ? generateApiKeyFingerprint(retryResponse.api_key)
          : undefined

        // Update Supabase to mark as onboarded
        const adminClient = createServiceRoleClient()

        const { error: _updateError } = await adminClient
          .from("organizations")
          .update({
            backend_onboarded: true,
            backend_api_key_fingerprint: newFingerprint,
            backend_onboarded_at: new Date().toISOString(),
          })
          .eq("org_slug", input.orgSlug)

        // _updateError silently handled - sync attempted

        // SECURITY FIX #3: Generate reveal token for retry case too
        // FIX SEC-002: Get user for token generation
        let retryRevealToken: string | undefined
        let retryRevealTokenExpiresAt: string | undefined

        if (retryResponse.api_key) {
          // Get user from supabase for token (user variable from outer scope)
          const supabaseForRetry = await createClient()
          const { data: { user: retryUser } } = await supabaseForRetry.auth.getUser()
          if (retryUser) {
            const tokenResult = await generateRevealToken(input.orgSlug, retryUser.id)
            retryRevealToken = tokenResult.token
            retryRevealTokenExpiresAt = tokenResult.expiresAt.toISOString()
          }
        }

        return {
          success: true,
          orgSlug: retryResponse.org_slug,
          // FIX SEC-002: Removed direct apiKey from response
          apiKeyFingerprint: newFingerprint,
          revealToken: retryRevealToken,
          revealTokenExpiresAt: retryRevealTokenExpiresAt,
        }
      } catch (retryErr: unknown) {
        const retryError = retryErr as { detail?: string; message?: string }
        const technicalError = `Organization exists but failed to regenerate API key: ${retryError.message || retryError.detail}`
        return {
          success: false,
          orgSlug: input.orgSlug,
          // FIX GAP-007: User-friendly error message
          error: getUserFriendlyError(technicalError),
        }
      }
    }

    // FIX GAP-007: User-friendly error message for all other backend errors
    return {
      success: false,
      error: getUserFriendlyError(errorMessage),
    }
  }
}

/**
 * Check if organization has been onboarded to backend.
 *
 * @param orgSlug - Organization slug
 * @param options.skipValidation - Skip the backend API call to validate key (faster, uses cached status)
 * @param options.timeout - Timeout in ms for backend validation call (default: 5000ms)
 */
export async function checkBackendOnboarding(
  orgSlug: string,
  options: { skipValidation?: boolean; timeout?: number } = {}
): Promise<{
  onboarded: boolean
  apiKeyFingerprint?: string
  apiKeyValid?: boolean
  error?: string
}> {
  const { skipValidation = false, timeout = 5000 } = options

  try {
    // Validate orgSlug format to prevent injection
    if (!isValidOrgSlug(orgSlug)) {
      return { onboarded: false }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("organizations")
      .select("backend_onboarded, backend_api_key_fingerprint")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      return { onboarded: false }
    }

    // If Supabase says not onboarded, return early
    if (!data.backend_onboarded) {
      return { onboarded: false }
    }

    // If skipValidation is true, just return Supabase status (faster)
    if (skipValidation) {
      return {
        onboarded: true,
        apiKeyFingerprint: data.backend_api_key_fingerprint,
        apiKeyValid: undefined, // Not validated
      }
    }

    // Verify the API key is actually valid in BigQuery by making a test call
    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        onboarded: false,
        apiKeyFingerprint: data.backend_api_key_fingerprint,
        apiKeyValid: false,
        error: "API key not found in secure storage. Please re-onboard.",
      }
    }

    // Make a lightweight API call to verify the key is valid in BigQuery
    const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
    if (backendUrl) {
      try {
        // Add timeout with AbortController
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(`${backendUrl}/api/v1/organizations/${orgSlug}/locale`, {
          method: "GET",
          headers: {
            "X-API-Key": orgApiKey,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.status === 401 || response.status === 403) {
          await response.json().catch(() => ({}))
          return {
            onboarded: false,
            apiKeyFingerprint: data.backend_api_key_fingerprint,
            apiKeyValid: false,
            error: "API key is invalid or inactive in backend. Please re-onboard the organization.",
          }
        }

        // API key is valid
        return {
          onboarded: true,
          apiKeyFingerprint: data.backend_api_key_fingerprint,
          apiKeyValid: true,
        }
      } catch (err) {
        // Check if it was a timeout
        const error = err as { name?: string }
        if (error.name === "AbortError") {
          // Timeout - return cached status, don't block the UI
          return {
            onboarded: data.backend_onboarded || false,
            apiKeyFingerprint: data.backend_api_key_fingerprint,
            apiKeyValid: undefined,
          }
        }
        // Network error - backend might be down, but don't mark as not onboarded
        return {
          onboarded: data.backend_onboarded || false,
          apiKeyFingerprint: data.backend_api_key_fingerprint,
          apiKeyValid: undefined, // Unknown - backend unreachable
          error: "Backend service unreachable. Please check if API service is running.",
        }
      }
    }

    // No backend URL configured - just return Supabase status
    return {
      onboarded: data.backend_onboarded || false,
      apiKeyFingerprint: data.backend_api_key_fingerprint,
    }
  } catch (checkError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[checkBackendOnboarding] Check failed:", checkError)
    }
    return { onboarded: false }
  }
}

/**
 * Get organization data needed for re-onboarding.
 * SECURITY: Requires org membership.
 */
export async function getOrgDataForReonboarding(orgSlug: string): Promise<{
  success: boolean
  data?: {
    orgName: string
    adminEmail: string
    currency: string
    timezone: string
  }
  error?: string
}> {
  try {
    // Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Verify authentication AND org membership
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

    // Get user email
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return { success: false, error: "User email not found" }
    }

    // Get org data using service role client to bypass RLS
    const adminClient = createServiceRoleClient()
    const { data: orgData, error: orgError } = await adminClient
      .from("organizations")
      .select("org_name, default_currency, default_timezone")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !orgData) {
      return { success: false, error: "Failed to get organization data" }
    }

    return {
      success: true,
      data: {
        orgName: orgData.org_name || orgSlug,
        adminEmail: user.email,
        currency: orgData.default_currency || "USD",
        timezone: orgData.default_timezone || "UTC",
      },
    }
  } catch (getOrgError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getOrgDataForReonboarding] Failed:", getOrgError)
    }
    return { success: false, error: "Failed to get organization data" }
  }
}

/**
 * Get API key info from backend (fingerprint, created_at, etc).
 * SECURITY: Reads API key from secure table, NOT user_metadata.
 * SECURITY: Requires org membership - prevents cross-tenant info disclosure.
 */
export async function getApiKeyInfo(orgSlug: string): Promise<{
  success: boolean
  apiKeyFingerprint?: string
  isActive?: boolean
  createdAt?: string
  scopes?: string[]
  error?: string
}> {
  try {
    // Step 1: Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Step 2: Verify authentication AND org membership
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

    // Check if backend URL is configured
    const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
    if (!backendUrl) {
      return { success: false, error: "Backend URL not configured" }
    }

    // Get the org API key from secure storage (NOT user metadata)
    const orgApiKey = await getOrgApiKeySecure(orgSlug)

    if (!orgApiKey) {
      // No API key in secure storage - return error, no fallback
      return {
        success: false,
        error: "API key not found. Please save your API key in settings."
      }
    }

    // Call backend with authenticated API key
    const backend = new PipelineBackendClient({ orgApiKey })
    const response = await backend.getApiKeyInfo(orgSlug)

    return {
      success: true,
      apiKeyFingerprint: response.api_key_fingerprint,
      isActive: response.is_active,
      createdAt: response.created_at,
      scopes: response.scopes,
    }
  } catch (err: unknown) {
    const error = err as { detail?: string; message?: string }
    return {
      success: false,
      error: error.detail || error.message || "Failed to get API key info",
    }
  }
}

// Simple in-memory lock to prevent concurrent API key rotations
// NOTE: This lock only works within a single serverless instance.
// SECURITY FIX #9: Added distributed lock using Supabase for cross-instance protection.
const rotationLocks = new Map<string, boolean>()

// Lock timeout in milliseconds (2 minutes)
const ROTATION_LOCK_TIMEOUT_MS = 2 * 60 * 1000

/**
 * Acquire a distributed lock for API key rotation.
 * Uses Supabase table for cross-instance locking.
 * SECURITY FIX #9: Prevents concurrent rotations across serverless instances.
 */
async function acquireRotationLock(orgSlug: string): Promise<{
  acquired: boolean
  lockId?: string
  error?: string
}> {
  try {
    const adminClient = createServiceRoleClient()
    const lockId = `rotation_${orgSlug}_${Date.now()}`
    const expiresAt = new Date(Date.now() + ROTATION_LOCK_TIMEOUT_MS).toISOString()

    // Try to insert a lock record (will fail if lock exists)
    const { error: insertError } = await adminClient
      .from("api_key_rotation_locks")
      .insert({
        org_slug: orgSlug,
        lock_id: lockId,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      })

    if (insertError) {
      // Check if it's a unique constraint violation (lock exists)
      if (insertError.code === "23505") {
        // Check if existing lock has expired
        const { data: existingLock, error: selectError } = await adminClient
          .from("api_key_rotation_locks")
          .select("lock_id, expires_at")
          .eq("org_slug", orgSlug)
          .single()

        if (!selectError && existingLock) {
          const expiresAtDate = new Date(existingLock.expires_at)
          if (expiresAtDate < new Date()) {
            // Lock expired - delete and try again
            await adminClient
              .from("api_key_rotation_locks")
              .delete()
              .eq("org_slug", orgSlug)

            // Retry insert
            const { error: retryError } = await adminClient
              .from("api_key_rotation_locks")
              .insert({
                org_slug: orgSlug,
                lock_id: lockId,
                expires_at: expiresAt,
                created_at: new Date().toISOString(),
              })

            if (!retryError) {
              return { acquired: true, lockId }
            }
          }
        }
        return { acquired: false, error: "API key rotation already in progress. Please wait." }
      }
      return { acquired: false, error: "Failed to acquire rotation lock" }
    }

    return { acquired: true, lockId }
  } catch (lockError) {
    // Fall back to in-memory lock if DB operation fails
    if (process.env.NODE_ENV === "development") {
      console.warn("[acquireRotationLock] DB lock failed, using in-memory:", lockError)
    }
    if (rotationLocks.get(orgSlug)) {
      return { acquired: false, error: "API key rotation already in progress. Please wait." }
    }
    rotationLocks.set(orgSlug, true)
    return { acquired: true, lockId: `memory_${orgSlug}` }
  }
}

/**
 * Release the rotation lock.
 */
async function releaseRotationLock(orgSlug: string, lockId: string): Promise<void> {
  try {
    // Release in-memory lock
    rotationLocks.delete(orgSlug)

    // Release DB lock
    if (!lockId.startsWith("memory_")) {
      const adminClient = createServiceRoleClient()
      await adminClient
        .from("api_key_rotation_locks")
        .delete()
        .eq("org_slug", orgSlug)
        .eq("lock_id", lockId)
    }
  } catch (releaseError) {
    // Lock release failed - lock will expire anyway
    if (process.env.NODE_ENV === "development") {
      console.warn("[releaseRotationLock] Release failed:", releaseError)
    }
    rotationLocks.delete(orgSlug)
  }
}

/**
 * Rotate API key for organization.
 * Returns new API key (shown ONCE!).
 *
 * Uses the current org API key (from secure storage) for self-service rotation.
 * The backend validates that the org in URL matches the authenticated org.
 * SECURITY: Requires org membership - prevents cross-tenant key rotation.
 * SECURITY FIX #9: Uses distributed lock to prevent concurrent rotations.
 */
export async function rotateApiKey(orgSlug: string): Promise<{
  success: boolean
  apiKey?: string // New API key - show once!
  apiKeyFingerprint?: string
  revealToken?: string
  revealTokenExpiresAt?: string
  error?: string
}> {
  let lockId: string | undefined

  try {
    // Step 1: Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // SECURITY FIX #9: Acquire distributed lock for rotation
    const lockResult = await acquireRotationLock(orgSlug)
    if (!lockResult.acquired) {
      return {
        success: false,
        error: lockResult.error || "API key rotation already in progress. Please wait."
      }
    }
    lockId = lockResult.lockId

    // Step 2: Verify authentication AND org membership
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      await releaseRotationLock(orgSlug, lockId || "")
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    // Check if backend URL is configured
    const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
    if (!backendUrl) {
      await releaseRotationLock(orgSlug, lockId || "")
      return { success: false, error: "Backend URL not configured" }
    }

    // Get the current org API key from secure storage (NOT user metadata)
    const currentApiKey = await getOrgApiKeySecure(orgSlug)

    // Self-service rotation requires a valid org API key
    if (!currentApiKey) {
      await releaseRotationLock(orgSlug, lockId || "")
      return {
        success: false,
        error: "No API key found for this organization. Please save your API key first, then try rotating."
      }
    }

    // Add timeout to prevent hanging requests (30s)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let response: Response
    try {
      response = await fetch(
        `${backendUrl}/api/v1/organizations/${orgSlug}/api-key/rotate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": currentApiKey,
          },
          signal: controller.signal,
        }
      )
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId)
      const error = fetchErr as { name?: string }
      if (error.name === "AbortError") {
        throw new Error("Request timed out after 30 seconds. Please try again.")
      }
      throw fetchErr
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      // Provide helpful error message for invalid key
      if (response.status === 401 || response.status === 403) {
        throw new Error("Your current API key is invalid or expired. Please enter a valid API key first.")
      }

      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }

    const rotateResponse = await response.json()

    // Update Supabase with new fingerprint (use secure hash, not last 4 chars)
    const adminClient = createServiceRoleClient()
    const newFingerprint = rotateResponse.api_key
      ? generateApiKeyFingerprint(rotateResponse.api_key)
      : rotateResponse.api_key_fingerprint

    const { error: _updateError } = await adminClient
      .from("organizations")
      .update({
        backend_api_key_fingerprint: newFingerprint,
      })
      .eq("org_slug", orgSlug)

    // Store new API key in secure server-side table (NOT user metadata)
    await storeApiKeySecure(orgSlug, rotateResponse.api_key)

    // SECURITY FIX #3: Generate reveal token for rotation result
    // FIX SEC-002: Get user for token generation
    let rotateRevealToken: string | undefined
    let rotateRevealTokenExpiresAt: string | undefined

    if (rotateResponse.api_key) {
      const supabaseForRotate = await createClient()
      const { data: { user: rotateUser } } = await supabaseForRotate.auth.getUser()
      if (rotateUser) {
        const tokenResult = await generateRevealToken(orgSlug, rotateUser.id)
        rotateRevealToken = tokenResult.token
        rotateRevealTokenExpiresAt = tokenResult.expiresAt.toISOString()
      }
    }

    return {
      success: true,
      // FIX SEC-002: Removed direct apiKey from response
      apiKeyFingerprint: newFingerprint,
      revealToken: rotateRevealToken,
      revealTokenExpiresAt: rotateRevealTokenExpiresAt,
    }
  } catch (err: unknown) {
    const error = err as { detail?: string; message?: string }
    return {
      success: false,
      error: error.detail || error.message || "Failed to rotate API key",
    }
  } finally {
    // SECURITY FIX #9: Always release distributed lock
    if (lockId) {
      await releaseRotationLock(orgSlug, lockId)
    }
  }
}

/**
 * Manually save API key to secure server-side storage.
 * Use this when user already has an org but needs to re-enter their API key.
 * SECURITY: Stores in secure table, NOT in user_metadata.
 * SECURITY: Requires org membership - prevents cross-tenant key injection.
 */
export async function saveApiKey(
  orgSlug: string,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Step 2: Verify authentication AND org membership
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

    // SECURITY FIX #10: Removed org_slug prefix validation
    // The prefix pattern (orgSlug_*) is considered public knowledge as it's
    // part of the documented API key format. However, we add a minimum length
    // check and format validation to prevent obviously invalid keys.
    // The actual validation should happen on the backend when the key is used.
    if (!apiKey || apiKey.length < 32) {
      return { success: false, error: "Invalid API key format" }
    }

    // Basic format check: should only contain allowed characters
    if (!/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
      return { success: false, error: "API key contains invalid characters" }
    }

    const stored = await storeApiKeySecure(orgSlug, apiKey)
    if (!stored) {
      return { success: false, error: "Failed to save API key" }
    }

    return { success: true }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to save API key"
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Check if API key exists in secure storage for this organization.
 * SECURITY: Checks secure table, NOT user_metadata.
 * SECURITY: Requires org membership - prevents cross-tenant enumeration.
 */
export async function hasStoredApiKey(orgSlug: string): Promise<{
  hasKey: boolean
  error?: string
}> {
  try {
    // Step 1: Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { hasKey: false, error: "Invalid organization identifier" }
    }

    // Step 2: Verify authentication AND org membership
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        hasKey: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    return { hasKey: !!apiKey }
  } catch (checkError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[hasStoredApiKey] Check failed:", checkError)
    }
    return { hasKey: false, error: "Failed to check API key" }
  }
}

/**
 * Reveal API key from a reveal token.
 * SECURITY FIX #3: Server action to reveal API key using short-lived token.
 * FIX SEC-001: Now uses Supabase-backed token storage instead of in-memory cache.
 * Token expires after 15 minutes.
 *
 * @param revealToken - The reveal token from onboardToBackend or rotateApiKey
 * @returns The API key if token is valid, error otherwise
 */
export async function revealApiKeyFromToken(revealToken: string): Promise<{
  success: boolean
  apiKey?: string
  error?: string
}> {
  try {
    if (!revealToken) {
      return { success: false, error: "Reveal token is required" }
    }

    // FIX SEC-001: Get current user for token verification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    try {
      // Use Supabase-backed token storage (FIX SEC-001)
      const apiKey = await _revealApiKeyInternal(revealToken, user.id)
      return { success: true, apiKey }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Invalid token"
      return { success: false, error }
    }
  } catch (revealError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[revealApiKeyFromToken] Reveal failed:", revealError)
    }
    return { success: false, error: "Failed to reveal API key" }
  }
}

// ============================================
// Sync Subscription Limits to Backend
// ============================================

interface SyncSubscriptionResult {
  success: boolean
  error?: string
  planName?: string
  status?: string
  dailyLimit?: number
  monthlyLimit?: number
  queued?: boolean  // True if sync failed but was queued for retry
  queueId?: string  // ID of the queue entry if queued
}

interface SyncSubscriptionInput {
  orgSlug: string
  orgId?: string  // Optional org UUID for queue tracking
  planName?: string
  billingStatus?: string
  dailyLimit?: number
  monthlyLimit?: number
  seatLimit?: number
  providersLimit?: number
  concurrentLimit?: number  // BILLING-AUDIT-001: Add concurrent limit
  trialEndsAt?: string
  syncType?: 'plan_change' | 'checkout' | 'webhook' | 'cancellation' | 'reconciliation'
}

/**
 * Queue a failed sync for retry.
 * Uses Supabase billing_sync_queue table.
 */
async function queueFailedSync(
  input: SyncSubscriptionInput,
  errorMessage: string
): Promise<string | null> {
  try {
    const adminClient = createServiceRoleClient()

    const { data, error } = await adminClient
      .from("billing_sync_queue")
      .insert({
        org_slug: input.orgSlug,
        org_id: input.orgId || null,
        sync_type: input.syncType || 'plan_change',
        payload: {
          planName: input.planName,
          billingStatus: input.billingStatus,
          dailyLimit: input.dailyLimit,
          monthlyLimit: input.monthlyLimit,
          seatLimit: input.seatLimit,
          providersLimit: input.providersLimit,
          concurrentLimit: input.concurrentLimit,  // BILLING-AUDIT-001
          trialEndsAt: input.trialEndsAt,
        },
        error_message: errorMessage,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[queueFailedSync] Insert failed:", error.message)
      }
      return null
    }

    return data.id
  } catch (queueError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[queueFailedSync] Queue failed:", queueError)
    }
    return null
  }
}

/**
 * Process pending syncs from the retry queue.
 * Should be called by a cron job or scheduled task.
 */
export async function processPendingSyncs(limit: number = 10): Promise<{
  processed: number
  succeeded: number
  failed: number
  errors: string[]
}> {
  const adminClient = createServiceRoleClient()
  const results = { processed: 0, succeeded: 0, failed: 0, errors: [] as string[] }

  try {
    // Get pending syncs using the database function
    const { data: pendingSyncs, error } = await adminClient
      .rpc('get_pending_billing_syncs', { p_limit: limit })

    if (error) {
      results.errors.push(error.message)
      return results
    }

    if (!pendingSyncs || pendingSyncs.length === 0) {
      return results
    }

    for (const sync of pendingSyncs) {
      results.processed++

      try {
        const payload = sync.payload as SyncSubscriptionInput

        // Attempt the sync (without queueing on failure to avoid infinite loop)
        const syncResult = await syncSubscriptionToBackendInternal({
          orgSlug: sync.org_slug,
          orgId: sync.org_id,
          planName: payload.planName,
          billingStatus: payload.billingStatus,
          dailyLimit: payload.dailyLimit,
          monthlyLimit: payload.monthlyLimit,
          seatLimit: payload.seatLimit,
          providersLimit: payload.providersLimit,
          trialEndsAt: payload.trialEndsAt,
        }, false) // Don't queue on failure

        if (syncResult.success) {
          // Mark as completed
          const { error: completeError } = await adminClient.rpc('complete_billing_sync', { p_id: sync.id })
          if (completeError) {
            results.errors.push(`${sync.org_slug}: Failed to mark as completed - ${completeError.message}`)
          } else {
            results.succeeded++
          }
        } else {
          // Mark as failed and schedule retry
          await adminClient.rpc('fail_billing_sync', {
            p_id: sync.id,
            p_error_message: syncResult.error || 'Unknown error'
          })
          results.failed++
          results.errors.push(`${sync.org_slug}: ${syncResult.error}`)
        }
      } catch (syncErr: unknown) {
        // Catch any unexpected errors in the sync loop
        const errorMessage = syncErr instanceof Error ? syncErr.message : "Unknown error processing sync"
        results.failed++
        results.errors.push(`${sync.org_slug}: ${errorMessage}`)

        // Attempt to mark as failed in database
        try {
          await adminClient.rpc('fail_billing_sync', {
            p_id: sync.id,
            p_error_message: errorMessage
          })
        } catch (dbUpdateError) {
          // Database update failure - log for debugging
          if (process.env.NODE_ENV === "development") {
            console.warn("[processPendingSyncs] Failed to mark sync as failed:", dbUpdateError)
          }
        }
      }
    }

    return results
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    results.errors.push(errorMessage)
    return results
  }
}

/**
 * Get sync queue statistics for monitoring.
 */
export async function getSyncQueueStats(): Promise<{
  pending: number
  processing: number
  failed: number
  completedToday: number
  oldestPending: string | null
} | null> {
  try {
    const adminClient = createServiceRoleClient()

    const { data, error } = await adminClient
      .rpc('get_billing_sync_stats')

    if (error) {
      return null
    }

    if (!data || data.length === 0) {
      return { pending: 0, processing: 0, failed: 0, completedToday: 0, oldestPending: null }
    }

    const stats = data[0]
    return {
      pending: Number(stats.pending_count) || 0,
      processing: Number(stats.processing_count) || 0,
      failed: Number(stats.failed_count) || 0,
      completedToday: Number(stats.completed_today) || 0,
      oldestPending: stats.oldest_pending || null,
    }
  } catch (statsError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getSyncQueueStats] Failed to get stats:", statsError)
    }
    return null
  }
}

/**
 * Map frontend billing status to backend subscription status.
 *
 * Frontend (Supabase/Stripe): trialing, active, past_due, canceled, incomplete,
 *                             incomplete_expired, paused, unpaid
 * Backend (BigQuery): ACTIVE, TRIAL, EXPIRED, SUSPENDED, CANCELLED
 */
function mapBillingStatusToBackend(frontendStatus?: string): string | undefined {
  if (!frontendStatus) return undefined

  const statusMapping: Record<string, string> = {
    // Active states
    trialing: "TRIAL",
    active: "ACTIVE",
    // Suspended states (payment issues, recoverable)
    past_due: "SUSPENDED",
    incomplete: "SUSPENDED",
    paused: "SUSPENDED",
    unpaid: "SUSPENDED",
    // Expired/Terminal states
    incomplete_expired: "EXPIRED",
    // Cancelled state
    canceled: "CANCELLED",
    cancelled: "CANCELLED", // Handle both spellings
  }

  const mapped = statusMapping[frontendStatus.toLowerCase()]
  if (!mapped) {
    return "SUSPENDED" // Safer default - block access until status is clarified
  }
  return mapped
}

/**
 * Internal sync function - does the actual HTTP call.
 * Can optionally queue failures for retry.
 */
async function syncSubscriptionToBackendInternal(
  input: SyncSubscriptionInput,
  shouldQueueOnFailure: boolean = true
): Promise<SyncSubscriptionResult> {
  try {
    // Check if backend URL is configured
    const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
    if (!backendUrl) {
      return { success: true } // Non-fatal - backend sync is optional
    }

    // Get admin API key from server-side env
    const adminApiKey = process.env.CA_ROOT_API_KEY
    if (!adminApiKey) {
      return {
        success: false,
        error: "Backend admin key not configured",
      }
    }

    // Map Supabase plan names to backend plan enum
    let backendPlanName = input.planName
    if (backendPlanName) {
      const planMapping: Record<string, string> = {
        starter: "STARTER",
        professional: "PROFESSIONAL",
        scale: "SCALE",
        enterprise: "ENTERPRISE",
      }
      backendPlanName = planMapping[backendPlanName.toLowerCase()] || backendPlanName.toUpperCase()
    }

    // Map billing status from frontend to backend format
    const backendStatus = mapBillingStatusToBackend(input.billingStatus)

    // Call backend subscription update endpoint with timeout (30s)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let response: Response
    try {
      response = await fetch(
        `${backendUrl}/api/v1/organizations/${input.orgSlug}/subscription`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-CA-Root-Key": adminApiKey,
          },
          body: JSON.stringify({
            plan_name: backendPlanName,
            status: backendStatus,
            trial_end_date: input.trialEndsAt,
            daily_limit: input.dailyLimit,
            monthly_limit: input.monthlyLimit,
            seat_limit: input.seatLimit,
            providers_limit: input.providersLimit,
            concurrent_limit: input.concurrentLimit,  // BILLING-AUDIT-001
          }),
          signal: controller.signal,
        }
      )
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId)
      const error = fetchErr as { name?: string; message?: string }
      const errorMsg = error.name === "AbortError"
        ? "Backend sync timed out after 30 seconds"
        : error.message || "Network error"

      // Queue for retry if enabled
      if (shouldQueueOnFailure) {
        const queueId = await queueFailedSync(input, errorMsg)
        return {
          success: false,
          error: errorMsg,
          queued: !!queueId,
          queueId: queueId || undefined,
        }
      }
      return { success: false, error: errorMsg }
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      // 404 means org not onboarded to backend yet - not an error
      if (response.status === 404) {
        return { success: true }
      }

      const errorMsg = errorData.detail || `Backend sync failed: HTTP ${response.status}`

      // Queue for retry if enabled (except for 4xx client errors)
      if (shouldQueueOnFailure && response.status >= 500) {
        const queueId = await queueFailedSync(input, errorMsg)
        return {
          success: false,
          error: errorMsg,
          queued: !!queueId,
          queueId: queueId || undefined,
        }
      }

      return { success: false, error: errorMsg }
    }

    const syncResponse = await response.json()

    return {
      success: true,
      planName: syncResponse.plan_name,
      dailyLimit: syncResponse.daily_limit,
      monthlyLimit: syncResponse.monthly_limit,
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to sync subscription to backend"

    // Queue for retry if enabled
    if (shouldQueueOnFailure) {
      const queueId = await queueFailedSync(input, errorMsg)
      return {
        success: false,
        error: errorMsg,
        queued: !!queueId,
        queueId: queueId || undefined,
      }
    }

    return { success: false, error: errorMsg }
  }
}

/**
 * Sync subscription limits to backend after plan change.
 *
 * Called by Stripe webhook when:
 * - User upgrades/downgrades plan
 * - Subscription is renewed
 * - Subscription status changes
 *
 * This ensures BigQuery org_subscriptions and org_usage_quotas tables
 * have the correct limits for pipeline enforcement.
 *
 * On failure, automatically queues for retry with exponential backoff.
 */
export async function syncSubscriptionToBackend(input: {
  orgSlug: string
  orgId?: string
  planName?: string
  billingStatus?: string  // Frontend billing_status (trialing, active, past_due, etc.)
  dailyLimit?: number
  monthlyLimit?: number
  seatLimit?: number
  providersLimit?: number
  concurrentLimit?: number  // BILLING-AUDIT-001: Concurrent pipeline limit
  trialEndsAt?: string    // ISO date string for trial end
  syncType?: 'plan_change' | 'checkout' | 'webhook' | 'cancellation' | 'reconciliation'
}): Promise<SyncSubscriptionResult> {
  return syncSubscriptionToBackendInternal(input, true)
}

/**
 * Retry backend onboarding for an existing organization.
 * Use this when the initial backend onboarding failed but Supabase org exists.
 *
 * This will:
 * 1. Get org data from Supabase
 * 2. Call backend onboarding endpoint (creates org + API key in BigQuery)
 * 3. Save the new API key to Supabase secure storage
 *
 * SECURITY: Requires org membership.
 */
export async function retryBackendOnboarding(orgSlug: string): Promise<{
  success: boolean
  error?: string
  apiKey?: string
  revealToken?: string
}> {
  try {
    // Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Verify authentication AND org membership
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    // Get org data from Supabase
    const orgDataResult = await getOrgDataForReonboarding(orgSlug)
    if (!orgDataResult.success || !orgDataResult.data) {
      return { success: false, error: orgDataResult.error || "Failed to get organization data" }
    }

    // Get plan from Supabase
    const adminClient = createServiceRoleClient()
    const { data: orgPlanData, error: planError } = await adminClient
      .from("organizations")
      .select("plan")
      .eq("org_slug", orgSlug)
      .single()

    if (planError) {
      return { success: false, error: "Failed to get organization plan" }
    }

    // Map frontend plan to backend plan
    const planMap: Record<string, "STARTER" | "PROFESSIONAL" | "SCALE"> = {
      "starter": "STARTER",
      "professional": "PROFESSIONAL",
      "scale": "SCALE",
    }
    const subscriptionPlan = planMap[orgPlanData.plan?.toLowerCase() || "starter"] || "STARTER"

    // Call backend onboarding
    const backendResult = await onboardToBackend({
      orgSlug,
      companyName: orgDataResult.data.orgName,
      adminEmail: orgDataResult.data.adminEmail,
      subscriptionPlan,
      defaultCurrency: orgDataResult.data.currency,
      defaultTimezone: orgDataResult.data.timezone,
    })

    if (!backendResult.success) {
      return { success: false, error: backendResult.error || "Backend onboarding failed" }
    }

    return {
      success: true,
      revealToken: backendResult.revealToken,
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[retryBackendOnboarding] Failed:", error)
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to retry backend onboarding" }
  }
}
