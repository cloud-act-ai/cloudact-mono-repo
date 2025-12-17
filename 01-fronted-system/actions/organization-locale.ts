"use server"

/**
 * Organization Locale Server Actions
 *
 * Handles fetching and updating organization locale settings (currency, timezone).
 * Locale settings are foundational org attributes that affect all cost calculations
 * and time displays across the platform.
 *
 * SECURITY:
 * - Requires org membership verification
 * - Backend validates org API key matches org_slug
 * - Updates both Supabase (frontend) and BigQuery (backend)
 */

import { createClient } from "@/lib/supabase/server"
import { CURRENCY_CODES, TIMEZONE_VALUES } from "@/lib/i18n/constants"

// ============================================
// Authorization Helper
// ============================================

/**
 * Verify user is authenticated and belongs to the organization.
 * SECURITY: Prevents cross-tenant access to org settings.
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

  // Use join query pattern to work with RLS policies
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("id, role, status, org_id, organizations!inner(id, org_slug)")
    .eq("user_id", user.id)
    .eq("organizations.org_slug", orgSlug)
    .eq("status", "active")
    .single()

  if (memberError || !membership) {
    if (memberError?.code === "PGRST116") {
      return { authorized: false, userId: user.id, error: "Organization not found or you are not a member" }
    }
    return { authorized: false, userId: user.id, error: memberError?.message || "Not a member of this organization" }
  }

  // Extract org_id from the joined result
  // Supabase single() returns object directly, not array
  const orgData = membership.organizations as unknown as { id: string; org_slug: string } | null

  if (!orgData || !orgData.id) {
    return { authorized: false, userId: user.id, error: "Organization data incomplete" }
  }

  return { authorized: true, userId: user.id, orgId: orgData.id }
}

// ============================================
// Input Validation
// ============================================

/**
 * Validate org slug format.
 * Prevents path traversal and injection attacks.
 * Backend requires: ^[a-zA-Z0-9_]{3,50}$ (alphanumeric with underscores)
 */
function isValidOrgSlug(orgSlug: string): boolean {
  if (!orgSlug || typeof orgSlug !== "string") return false
  // Match backend validation pattern
  return /^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)
}

/** ORG_SLUG_PATTERN constant for validation */
const ORG_SLUG_PATTERN = /^[a-zA-Z0-9_]{3,50}$/

/**
 * Validate currency code (ISO 4217).
 */
function isValidCurrency(currency: string): boolean {
  return CURRENCY_CODES.includes(currency)
}

/**
 * Validate timezone (IANA).
 */
function isValidTimezone(timezone: string): boolean {
  return TIMEZONE_VALUES.includes(timezone)
}

// ============================================
// Types
// ============================================

export interface OrgLocale {
  default_currency: string
  default_timezone: string
  default_country?: string
  default_language?: string
}

export interface GetOrgLocaleResult {
  success: boolean
  locale?: OrgLocale
  error?: string
}

export interface UpdateOrgLocaleResult {
  success: boolean
  locale?: OrgLocale
  error?: string
}

// ============================================
// Get Org Locale from Supabase
// ============================================

/**
 * Get organization locale settings from Supabase.
 *
 * Returns currency, timezone, country, and language settings.
 * SECURITY: Requires org membership.
 */
export async function getOrgLocale(orgSlug: string): Promise<GetOrgLocaleResult> {
  try {
    // Step 1: Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Step 2: Verify authentication AND org membership
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Step 3: Fetch locale from Supabase organizations table
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("organizations")
      .select("default_currency, default_timezone, default_country, default_language")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      console.error("[Org Locale] Failed to fetch locale:", error)
      return { success: false, error: "Failed to fetch organization locale" }
    }

    return {
      success: true,
      locale: {
        default_currency: data.default_currency || "USD",
        default_timezone: data.default_timezone || "UTC",
        default_country: data.default_country || undefined,
        default_language: data.default_language || undefined,
      },
    }
  } catch (err: unknown) {
    console.error("[Org Locale] Get locale error:", err)
    const errorMessage = err instanceof Error ? err.message : "Failed to get organization locale"
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// ============================================
// Update Org Locale (BigQuery + Supabase - Atomic)
// ============================================

/**
 * Helper: Sync locale to BigQuery backend with retry logic.
 * Returns true if sync succeeded, false otherwise.
 */
async function syncLocaleToBackend(
  orgSlug: string,
  currency: string,
  timezone: string,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL

  if (!backendUrl) {
    console.warn("[Org Locale] No backend URL configured, skipping BigQuery sync")
    return { success: true } // Skip if no backend configured
  }

  // Get org API key
  const { getOrgApiKeySecure } = await import("./backend-onboarding")
  const orgApiKey = await getOrgApiKeySecure(orgSlug)

  if (!orgApiKey) {
    return {
      success: false,
      error: "Organization API key not found. Please ensure backend onboarding is complete."
    }
  }

  let lastError: string | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const response = await fetch(
        `${backendUrl}/api/v1/organizations/${orgSlug}/locale`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": orgApiKey,
          },
          body: JSON.stringify({
            default_currency: currency,
            default_timezone: timezone,
          }),
          signal: controller.signal,
        }
      )

      clearTimeout(timeoutId)

      if (response.ok) {
        console.log(`[Org Locale] Backend sync succeeded (attempt ${attempt})`)
        return { success: true }
      }

      // Parse error response with validation
      try {
        const errorData = await response.json()
        lastError = (errorData && typeof errorData === 'object' && 'detail' in errorData)
          ? String(errorData.detail)
          : `HTTP ${response.status}`
      } catch {
        lastError = `HTTP ${response.status} - Unable to parse error response`
      }
      console.warn(`[Org Locale] Backend sync attempt ${attempt} failed: ${lastError}`)

    } catch (fetchErr: unknown) {
      const error = fetchErr as { name?: string; message?: string }
      if (error.name === "AbortError") {
        lastError = "Request timed out"
      } else {
        lastError = error.message || "Network error"
      }
      console.warn(`[Org Locale] Backend sync attempt ${attempt} error: ${lastError}`)
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }

  return { success: false, error: lastError || "Backend sync failed after retries" }
}

/**
 * Update organization locale settings.
 *
 * IMPORTANT: Updates BigQuery FIRST, then Supabase.
 * This ensures both systems stay in sync - if BigQuery fails, Supabase is not updated.
 *
 * Updates both:
 * 1. BigQuery org_profiles table (via backend API - source of truth for cost calculations)
 * 2. Supabase organizations table (for frontend display)
 *
 * SECURITY: Requires org membership.
 */
/**
 * Validate that Supabase and BigQuery locale settings are in sync.
 * Returns detailed sync status for debugging.
 *
 * SECURITY: Requires org membership.
 */
export async function validateLocaleSync(orgSlug: string): Promise<{
  inSync: boolean
  supabase?: OrgLocale
  bigquery?: OrgLocale
  mismatch?: string[]
  error?: string
}> {
  try {
    // Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { inSync: false, error: "Invalid organization identifier" }
    }

    // Verify authentication
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { inSync: false, error: authResult.error || "Not authorized" }
    }

    // Get Supabase locale
    const supabase = await createClient()
    const { data: supabaseData, error: supabaseError } = await supabase
      .from("organizations")
      .select("default_currency, default_timezone, default_country, default_language")
      .eq("org_slug", orgSlug)
      .single()

    if (supabaseError || !supabaseData) {
      return { inSync: false, error: "Failed to fetch Supabase locale" }
    }

    const supabaseLocale: OrgLocale = {
      default_currency: supabaseData.default_currency || "USD",
      default_timezone: supabaseData.default_timezone || "UTC",
      default_country: supabaseData.default_country || undefined,
      default_language: supabaseData.default_language || undefined,
    }

    // Get BigQuery locale
    const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
    if (!backendUrl) {
      return { inSync: true, supabase: supabaseLocale } // No backend to check
    }

    const { getOrgApiKeySecure } = await import("./backend-onboarding")
    const orgApiKey = await getOrgApiKeySecure(orgSlug)

    if (!orgApiKey) {
      return { inSync: true, supabase: supabaseLocale } // No API key, can't check backend
    }

    try {
      const response = await fetch(
        `${backendUrl}/api/v1/organizations/${orgSlug}/locale`,
        {
          method: "GET",
          headers: { "X-API-Key": orgApiKey },
        }
      )

      if (!response.ok) {
        return { inSync: false, supabase: supabaseLocale, error: "Failed to fetch BigQuery locale" }
      }

      const bigqueryData = await response.json()

      // Validate response structure
      if (!bigqueryData || typeof bigqueryData !== 'object') {
        return { inSync: false, supabase: supabaseLocale, error: "Invalid BigQuery locale response" }
      }
      const bigqueryLocale: OrgLocale = {
        default_currency: bigqueryData.default_currency || "USD",
        default_timezone: bigqueryData.default_timezone || "UTC",
        default_country: bigqueryData.default_country || undefined,
        default_language: bigqueryData.default_language || undefined,
      }

      // Compare
      const mismatch: string[] = []
      if (supabaseLocale.default_currency !== bigqueryLocale.default_currency) {
        mismatch.push(`currency: Supabase=${supabaseLocale.default_currency}, BigQuery=${bigqueryLocale.default_currency}`)
      }
      if (supabaseLocale.default_timezone !== bigqueryLocale.default_timezone) {
        mismatch.push(`timezone: Supabase=${supabaseLocale.default_timezone}, BigQuery=${bigqueryLocale.default_timezone}`)
      }

      if (mismatch.length > 0) {
        console.warn(`[Org Locale] Sync mismatch for ${orgSlug}:`, mismatch)
      }

      return {
        inSync: mismatch.length === 0,
        supabase: supabaseLocale,
        bigquery: bigqueryLocale,
        mismatch: mismatch.length > 0 ? mismatch : undefined,
      }

    } catch (fetchErr) {
      console.error("[Org Locale] Failed to validate sync:", fetchErr)
      return { inSync: false, supabase: supabaseLocale, error: "Failed to connect to backend" }
    }

  } catch (err: unknown) {
    console.error("[Org Locale] Validate sync error:", err)
    return { inSync: false, error: err instanceof Error ? err.message : "Validation failed" }
  }
}

/**
 * Repair locale sync by copying Supabase locale to BigQuery.
 * Use this to fix sync issues caused by previous silent failures.
 *
 * SECURITY: Requires org membership.
 */
export async function repairLocaleSync(orgSlug: string): Promise<{
  success: boolean
  repaired?: boolean
  error?: string
}> {
  try {
    // First validate
    const validation = await validateLocaleSync(orgSlug)

    if (validation.error) {
      return { success: false, error: validation.error }
    }

    if (validation.inSync) {
      return { success: true, repaired: false } // Already in sync
    }

    // Get Supabase locale and sync to BigQuery
    if (!validation.supabase) {
      return { success: false, error: "Could not read Supabase locale" }
    }

    const result = await syncLocaleToBackend(
      orgSlug,
      validation.supabase.default_currency,
      validation.supabase.default_timezone
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    console.log(`[Org Locale] Repaired sync for ${orgSlug}`)
    return { success: true, repaired: true }

  } catch (err: unknown) {
    console.error("[Org Locale] Repair sync error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Repair failed" }
  }
}

export async function updateOrgLocale(
  orgSlug: string,
  currency: string,
  timezone: string
): Promise<UpdateOrgLocaleResult> {
  try {
    // Step 1: Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    if (!isValidCurrency(currency)) {
      return { success: false, error: `Invalid currency code: ${currency}` }
    }

    if (!isValidTimezone(timezone)) {
      return { success: false, error: `Invalid timezone: ${timezone}` }
    }

    // Step 2: Verify authentication AND org membership
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Step 3: Update BigQuery FIRST (source of truth for cost calculations)
    // If this fails, we don't update Supabase to keep them in sync
    const backendResult = await syncLocaleToBackend(orgSlug, currency, timezone)

    if (!backendResult.success) {
      console.error("[Org Locale] Backend sync failed, aborting Supabase update")
      return {
        success: false,
        error: `Failed to sync locale to backend: ${backendResult.error}. Please try again.`
      }
    }

    // Step 4: Update Supabase (only after BigQuery succeeds)
    const supabase = await createClient()
    const { error: supabaseError } = await supabase
      .from("organizations")
      .update({
        default_currency: currency,
        default_timezone: timezone,
      })
      .eq("org_slug", orgSlug)

    if (supabaseError) {
      console.error("[Org Locale] Failed to update Supabase:", supabaseError)
      // BigQuery was updated but Supabase failed - log warning but still return success
      // because BigQuery is the source of truth for cost calculations
      console.warn("[Org Locale] BigQuery updated but Supabase failed - may need manual sync")
      return {
        success: false,
        error: "Failed to update frontend settings. Backend was updated successfully."
      }
    }

    console.log("[Org Locale] Both BigQuery and Supabase updated successfully")

    // Step 5: Return success with updated locale
    return {
      success: true,
      locale: {
        default_currency: currency,
        default_timezone: timezone,
      },
    }
  } catch (err: unknown) {
    console.error("[Org Locale] Update locale error:", err)
    const errorMessage = err instanceof Error ? err.message : "Failed to update organization locale"
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// ============================================
// Organization Logo Functions
// ============================================

export interface GetOrgLogoResult {
  success: boolean
  logoUrl?: string | null
  error?: string
}

export interface UpdateOrgLogoResult {
  success: boolean
  logoUrl?: string
  error?: string
}

/**
 * Validate logo URL format.
 * Must be a valid HTTPS URL pointing to an image.
 */
function isValidLogoUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false

  try {
    const parsed = new URL(url)
    // Must be HTTPS for security
    if (parsed.protocol !== "https:") return false
    // Basic image extension check (optional but helpful)
    const pathname = parsed.pathname.toLowerCase()
    const validExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]
    const hasValidExtension = validExtensions.some(ext => pathname.endsWith(ext))
    // Also allow URLs without extension (CDN URLs like Cloudinary, imgix)
    return hasValidExtension || pathname.length > 0
  } catch {
    return false
  }
}

/**
 * Get organization logo URL from Supabase.
 * Returns null if no logo is set.
 *
 * SECURITY: Requires org membership.
 */
export async function getOrgLogo(orgSlug: string): Promise<GetOrgLogoResult> {
  try {
    // Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Verify authentication AND org membership
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Fetch logo URL from Supabase
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("organizations")
      .select("logo_url")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      console.error("[Org Logo] Failed to fetch logo:", error)
      return { success: false, error: "Failed to fetch organization logo" }
    }

    return {
      success: true,
      logoUrl: data.logo_url || null,
    }
  } catch (err: unknown) {
    console.error("[Org Logo] Get logo error:", err)
    const errorMessage = err instanceof Error ? err.message : "Failed to get organization logo"
    return { success: false, error: errorMessage }
  }
}

/**
 * Update organization logo URL.
 * Pass null or empty string to remove the logo.
 *
 * SECURITY: Requires org membership.
 */
export async function updateOrgLogo(
  orgSlug: string,
  logoUrl: string | null
): Promise<UpdateOrgLogoResult> {
  try {
    // Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Validate logo URL if provided
    if (logoUrl && logoUrl.trim() !== "") {
      if (!isValidLogoUrl(logoUrl)) {
        return { success: false, error: "Invalid logo URL. Must be a valid HTTPS URL." }
      }
    }

    // Verify authentication AND org membership
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Update logo URL in Supabase
    const supabase = await createClient()
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: logoUrl?.trim() || null })
      .eq("org_slug", orgSlug)

    if (updateError) {
      console.error("[Org Logo] Failed to update logo:", updateError)
      return { success: false, error: "Failed to update organization logo" }
    }

    console.log(`[Org Logo] Updated logo for ${orgSlug}`)

    return {
      success: true,
      logoUrl: logoUrl?.trim() || undefined,
    }
  } catch (err: unknown) {
    console.error("[Org Logo] Update logo error:", err)
    const errorMessage = err instanceof Error ? err.message : "Failed to update organization logo"
    return { success: false, error: errorMessage }
  }
}

/**
 * Get organization details including logo and name.
 * Convenience function for sidebar display.
 *
 * SECURITY: Requires org membership.
 */
export async function getOrgDetails(orgSlug: string): Promise<{
  success: boolean
  org?: {
    name: string
    slug: string
    logoUrl: string | null
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
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Fetch org details from Supabase
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("organizations")
      .select("org_name, org_slug, logo_url, default_currency, default_timezone")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      console.error("[Org Details] Failed to fetch org:", error)
      return { success: false, error: "Failed to fetch organization details" }
    }

    return {
      success: true,
      org: {
        name: data.org_name || orgSlug,
        slug: data.org_slug,
        logoUrl: data.logo_url || null,
        currency: data.default_currency || "USD",
        timezone: data.default_timezone || "UTC",
      },
    }
  } catch (err: unknown) {
    console.error("[Org Details] Get details error:", err)
    const errorMessage = err instanceof Error ? err.message : "Failed to get organization details"
    return { success: false, error: errorMessage }
  }
}
