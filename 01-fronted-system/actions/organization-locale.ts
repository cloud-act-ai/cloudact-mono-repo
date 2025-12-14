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
  const orgData = membership.organizations as { id: string; org_slug: string } | null

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
// Update Org Locale (Supabase + Backend)
// ============================================

/**
 * Update organization locale settings.
 *
 * Updates both:
 * 1. Supabase organizations table (for frontend display)
 * 2. BigQuery org_profiles table (via backend API for cost calculations)
 *
 * SECURITY: Requires org membership.
 */
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

    // Step 3: Update Supabase first (optimistic update)
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
      return { success: false, error: "Failed to update organization locale" }
    }

    // Step 4: Update backend BigQuery (if configured)
    const backendUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
    if (backendUrl) {
      try {
        // Get org API key from secure storage
        const { getOrgApiKeySecure } = await import("./backend-onboarding")
        const orgApiKey = await getOrgApiKeySecure(orgSlug)

        if (orgApiKey) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

          try {
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

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              console.error("[Org Locale] Backend update failed:", response.status, errorData)
              // Don't fail the operation - Supabase already updated
              console.warn("[Org Locale] Supabase updated but backend sync failed")
            } else {
              console.log("[Org Locale] Backend locale updated successfully")
            }
          } catch (fetchErr: unknown) {
            clearTimeout(timeoutId)
            const error = fetchErr as { name?: string }
            if (error.name === "AbortError") {
              console.error("[Org Locale] Backend update timed out")
            } else {
              console.error("[Org Locale] Backend update error:", fetchErr)
            }
            // Don't fail - Supabase is the source of truth for frontend
          }
        } else {
          console.log("[Org Locale] No API key found, skipping backend sync")
        }
      } catch (backendErr) {
        console.error("[Org Locale] Backend sync error:", backendErr)
        // Don't fail - Supabase update succeeded
      }
    }

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
