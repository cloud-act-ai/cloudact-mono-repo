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
import {
  CURRENCY_CODES,
  TIMEZONE_VALUES,
  FISCAL_YEAR_MONTHS,
  getFiscalYearFromTimezone,
} from "@/lib/i18n/constants"

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

/**
 * Validate fiscal year start month (1-12).
 */
function isValidFiscalYearMonth(month: number): boolean {
  return FISCAL_YEAR_MONTHS.includes(month)
}

// ============================================
// Types
// ============================================

export interface OrgLocale {
  default_currency: string
  default_timezone: string
  default_country?: string
  default_language?: string
  fiscal_year_start_month?: number // 1-12, defaults based on timezone
}

export interface OrgContactDetails {
  business_person_name: string | null
  business_person_position: string | null
  business_person_department: string | null
  contact_email: string | null
  contact_phone: string | null
  business_address_line1: string | null
  business_address_line2: string | null
  business_city: string | null
  business_state: string | null
  business_postal_code: string | null
  business_country: string | null
}

export interface OrgQuotaLimits {
  seat_limit: number
  providers_limit: number
  pipelines_per_day_limit: number
  pipelines_per_week_limit: number
  pipelines_per_month_limit: number
  team_members_count: number
  configured_providers_count: number
  plan_name: string
  billing_status: string
}

export interface GetOrgContactDetailsResult {
  success: boolean
  contactDetails?: OrgContactDetails
  error?: string
}

export interface UpdateOrgContactDetailsResult {
  success: boolean
  contactDetails?: OrgContactDetails
  error?: string
}

export interface GetOrgQuotaLimitsResult {
  success: boolean
  quotaLimits?: OrgQuotaLimits
  error?: string
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
      .select("default_currency, default_timezone, default_country, default_language, fiscal_year_start_month")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      
      return { success: false, error: "Failed to fetch organization locale" }
    }

    // Default fiscal year based on timezone if not set
    // Use nullish coalescing (??) to preserve month=1 (January) which is falsy with ||
    const timezone = data.default_timezone || "UTC"
    const fiscalYearDefault = getFiscalYearFromTimezone(timezone)

    return {
      success: true,
      locale: {
        default_currency: data.default_currency || "USD",
        default_timezone: timezone,
        default_country: data.default_country || undefined,
        default_language: data.default_language || undefined,
        fiscal_year_start_month: data.fiscal_year_start_month ?? fiscalYearDefault,
      },
    }
  } catch (err: unknown) {
    
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
      

    } catch (fetchErr: unknown) {
      const error = fetchErr as { name?: string; message?: string }
      if (error.name === "AbortError") {
        lastError = "Request timed out"
      } else {
        lastError = error.message || "Network error"
      }
      
    }

    // Wait before retry (exponential backoff: 1s, 2s, 4s...)
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
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
      // Add timeout to prevent hanging requests
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const response = await fetch(
        `${backendUrl}/api/v1/organizations/${orgSlug}/locale`,
        {
          method: "GET",
          headers: { "X-API-Key": orgApiKey },
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

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

      return {
        inSync: mismatch.length === 0,
        supabase: supabaseLocale,
        bigquery: bigqueryLocale,
        mismatch: mismatch.length > 0 ? mismatch : undefined,
      }

    } catch (fetchErr: unknown) {
      const error = fetchErr as { name?: string; message?: string }
      if (error.name === "AbortError") {
        return { inSync: false, supabase: supabaseLocale, error: "Backend request timed out" }
      }
      return { inSync: false, supabase: supabaseLocale, error: "Failed to connect to backend" }
    }

  } catch (err: unknown) {
    
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

    
    return { success: true, repaired: true }

  } catch (err: unknown) {
    
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
      
      // BigQuery was updated but Supabase failed - log warning but still return success
      // because BigQuery is the source of truth for cost calculations
      
      return {
        success: false,
        error: "Failed to update frontend settings. Backend was updated successfully."
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
    
    const errorMessage = err instanceof Error ? err.message : "Failed to update organization locale"
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// ============================================
// Fiscal Year Functions
// ============================================

export interface UpdateFiscalYearResult {
  success: boolean
  fiscal_year_start_month?: number
  error?: string
}

/**
 * Update organization fiscal year start month.
 *
 * Updates Supabase organizations table with the new fiscal year start.
 * Fiscal year affects cost analytics reporting periods.
 *
 * SECURITY: Requires org membership.
 */
export async function updateFiscalYear(
  orgSlug: string,
  fiscalYearStartMonth: number
): Promise<UpdateFiscalYearResult> {
  try {
    // Step 1: Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    if (!isValidFiscalYearMonth(fiscalYearStartMonth)) {
      return { success: false, error: `Invalid fiscal year start month: ${fiscalYearStartMonth}. Must be 1 (Jan), 4 (Apr), 7 (Jul), or 10 (Oct).` }
    }

    // Step 2: Verify authentication AND org membership
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Step 3: Update Supabase
    const supabase = await createClient()
    const { error: supabaseError } = await supabase
      .from("organizations")
      .update({ fiscal_year_start_month: fiscalYearStartMonth })
      .eq("org_slug", orgSlug)

    if (supabaseError) {
      
      return { success: false, error: "Failed to update fiscal year start" }
    }

    

    return {
      success: true,
      fiscal_year_start_month: fiscalYearStartMonth,
    }
  } catch (err: unknown) {
    
    const errorMessage = err instanceof Error ? err.message : "Failed to update fiscal year start"
    return { success: false, error: errorMessage }
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

export interface UploadOrgLogoResult {
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
      
      return { success: false, error: "Failed to fetch organization logo" }
    }

    return {
      success: true,
      logoUrl: data.logo_url || null,
    }
  } catch (err: unknown) {
    
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
      
      return { success: false, error: "Failed to update organization logo" }
    }

    

    return {
      success: true,
      logoUrl: logoUrl?.trim() || undefined,
    }
  } catch (err: unknown) {

    const errorMessage = err instanceof Error ? err.message : "Failed to update organization logo"
    return { success: false, error: errorMessage }
  }
}

/**
 * Upload organization logo to Supabase Storage.
 * Stores file in org-logos bucket at path: {org_slug}/logo-{timestamp}.{ext}
 * Automatically updates the logo_url in organizations table.
 *
 * SECURITY: Requires org membership.
 */
export async function uploadOrgLogo(
  orgSlug: string,
  formData: FormData
): Promise<UploadOrgLogoResult> {
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

    // Get the file from FormData
    const file = formData.get("logo") as File | null
    if (!file) {
      return { success: false, error: "No file provided" }
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: "Invalid file type. Allowed: PNG, JPG, GIF, SVG, WebP" }
    }

    // Validate file size (max 1MB)
    const maxSize = 1 * 1024 * 1024 // 1MB
    if (file.size > maxSize) {
      return { success: false, error: "File too large. Maximum size is 1MB" }
    }

    // Get file extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "png"
    const validExtensions = ["png", "jpg", "jpeg", "gif", "svg", "webp"]
    if (!validExtensions.includes(ext)) {
      return { success: false, error: "Invalid file extension" }
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now()
    const fileName = `logo-${timestamp}.${ext}`
    const filePath = `${orgSlug}/${fileName}`

    // Upload to Supabase Storage
    const supabase = await createClient()

    // First, try to delete any existing logo files for this org
    const { data: existingFiles } = await supabase.storage
      .from("org-logos")
      .list(orgSlug)

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles.map(f => `${orgSlug}/${f.name}`)
      await supabase.storage.from("org-logos").remove(filesToDelete)
    }

    // Upload the new file
    const { error: uploadError } = await supabase.storage
      .from("org-logos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      })

    if (uploadError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[uploadOrgLogo] Storage upload error:", uploadError)
      }
      return { success: false, error: `Failed to upload logo: ${uploadError.message}` }
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("org-logos")
      .getPublicUrl(filePath)

    if (!urlData?.publicUrl) {
      return { success: false, error: "Failed to get public URL for uploaded logo" }
    }

    const logoUrl = urlData.publicUrl

    // Update the organizations table with the new logo URL
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: logoUrl })
      .eq("org_slug", orgSlug)

    if (updateError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[uploadOrgLogo] Database update error:", updateError)
      }
      // Logo was uploaded but DB update failed - still return success with URL
      return {
        success: true,
        logoUrl,
        error: "Logo uploaded but database update failed. Please save the URL manually.",
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[uploadOrgLogo] Successfully uploaded logo for ${orgSlug}: ${logoUrl}`)
    }

    return {
      success: true,
      logoUrl,
    }
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.error("[uploadOrgLogo] Unexpected error:", err)
    }
    const errorMessage = err instanceof Error ? err.message : "Failed to upload organization logo"
    return { success: false, error: errorMessage }
  }
}

/**
 * Delete organization logo from Supabase Storage.
 * Removes the file and clears the logo_url in organizations table.
 *
 * SECURITY: Requires org membership.
 */
export async function deleteOrgLogo(orgSlug: string): Promise<UpdateOrgLogoResult> {
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

    const supabase = await createClient()

    // List and delete all files in the org's folder
    const { data: existingFiles } = await supabase.storage
      .from("org-logos")
      .list(orgSlug)

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles.map(f => `${orgSlug}/${f.name}`)
      const { error: deleteError } = await supabase.storage
        .from("org-logos")
        .remove(filesToDelete)

      if (deleteError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[deleteOrgLogo] Storage delete error:", deleteError)
        }
        // Continue anyway to clear the URL from database
      }
    }

    // Clear the logo_url in database
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: null })
      .eq("org_slug", orgSlug)

    if (updateError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[deleteOrgLogo] Database update error:", updateError)
      }
      return { success: false, error: "Failed to clear logo URL from database" }
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[deleteOrgLogo] Successfully deleted logo for ${orgSlug}`)
    }

    return { success: true }
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.error("[deleteOrgLogo] Unexpected error:", err)
    }
    const errorMessage = err instanceof Error ? err.message : "Failed to delete organization logo"
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
    fiscalYearStartMonth: number
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
      .select("org_name, org_slug, logo_url, default_currency, default_timezone, fiscal_year_start_month")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      
      return { success: false, error: "Failed to fetch organization details" }
    }

    // Default fiscal year based on timezone if not set
    // Use nullish coalescing (??) to preserve month=1 (January) which is falsy with ||
    const timezone = data.default_timezone || "UTC"
    const fiscalYearDefault = getFiscalYearFromTimezone(timezone)

    return {
      success: true,
      org: {
        name: data.org_name || orgSlug,
        slug: data.org_slug,
        logoUrl: data.logo_url || null,
        currency: data.default_currency || "USD",
        timezone: timezone,
        fiscalYearStartMonth: data.fiscal_year_start_month ?? fiscalYearDefault,
      },
    }
  } catch (err: unknown) {
    
    const errorMessage = err instanceof Error ? err.message : "Failed to get organization details"
    return { success: false, error: errorMessage }
  }
}

// ============================================
// Organization Contact Details Functions
// ============================================

/**
 * Get organization contact details from Supabase.
 * Returns business contact email, phone, and address information.
 *
 * SECURITY: Requires org membership.
 */
export async function getOrgContactDetails(orgSlug: string): Promise<GetOrgContactDetailsResult> {
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

    // Fetch contact details from Supabase
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("organizations")
      .select(`
        business_person_name,
        business_person_position,
        business_person_department,
        contact_email,
        contact_phone,
        business_address_line1,
        business_address_line2,
        business_city,
        business_state,
        business_postal_code,
        business_country
      `)
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      
      return { success: false, error: "Failed to fetch organization contact details" }
    }

    return {
      success: true,
      contactDetails: {
        business_person_name: data.business_person_name || null,
        business_person_position: data.business_person_position || null,
        business_person_department: data.business_person_department || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        business_address_line1: data.business_address_line1 || null,
        business_address_line2: data.business_address_line2 || null,
        business_city: data.business_city || null,
        business_state: data.business_state || null,
        business_postal_code: data.business_postal_code || null,
        business_country: data.business_country || null,
      },
    }
  } catch (err: unknown) {
    
    const errorMessage = err instanceof Error ? err.message : "Failed to get organization contact details"
    return { success: false, error: errorMessage }
  }
}

/**
 * Validate email format.
 */
function isValidEmail(email: string): boolean {
  if (!email) return true // Empty is allowed (optional field)
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
}

/**
 * Validate phone format (international formats allowed).
 */
function isValidPhone(phone: string): boolean {
  if (!phone) return true // Empty is allowed (optional field)
  return /^\+?[0-9\s\-()]{7,20}$/.test(phone)
}

/**
 * Validate country code (ISO 3166-1 alpha-2).
 */
function isValidCountryCode(country: string): boolean {
  if (!country) return true // Empty is allowed (optional field)
  return /^[A-Z]{2}$/.test(country)
}

/**
 * Update organization contact details in Supabase.
 *
 * SECURITY: Requires org membership.
 */
export async function updateOrgContactDetails(
  orgSlug: string,
  contactDetails: Partial<OrgContactDetails>
): Promise<UpdateOrgContactDetailsResult> {
  try {
    // Validate input
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Validate email if provided
    if (contactDetails.contact_email && !isValidEmail(contactDetails.contact_email)) {
      return { success: false, error: "Invalid email format" }
    }

    // Validate phone if provided
    if (contactDetails.contact_phone && !isValidPhone(contactDetails.contact_phone)) {
      return { success: false, error: "Invalid phone format. Use international format (e.g., +1 234-567-8900)" }
    }

    // Validate country code if provided
    if (contactDetails.business_country && !isValidCountryCode(contactDetails.business_country.toUpperCase())) {
      return { success: false, error: "Invalid country code. Use ISO 3166-1 alpha-2 format (e.g., US, GB, IN)" }
    }

    // Verify authentication AND org membership
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Prepare update data (normalize empty strings to null)
    const updateData: Record<string, string | null> = {}
    if (contactDetails.business_person_name !== undefined) {
      updateData.business_person_name = contactDetails.business_person_name?.trim() || null
    }
    if (contactDetails.business_person_position !== undefined) {
      updateData.business_person_position = contactDetails.business_person_position?.trim() || null
    }
    if (contactDetails.business_person_department !== undefined) {
      updateData.business_person_department = contactDetails.business_person_department?.trim() || null
    }
    if (contactDetails.contact_email !== undefined) {
      updateData.contact_email = contactDetails.contact_email?.trim() || null
    }
    if (contactDetails.contact_phone !== undefined) {
      updateData.contact_phone = contactDetails.contact_phone?.trim() || null
    }
    if (contactDetails.business_address_line1 !== undefined) {
      updateData.business_address_line1 = contactDetails.business_address_line1?.trim() || null
    }
    if (contactDetails.business_address_line2 !== undefined) {
      updateData.business_address_line2 = contactDetails.business_address_line2?.trim() || null
    }
    if (contactDetails.business_city !== undefined) {
      updateData.business_city = contactDetails.business_city?.trim() || null
    }
    if (contactDetails.business_state !== undefined) {
      updateData.business_state = contactDetails.business_state?.trim() || null
    }
    if (contactDetails.business_postal_code !== undefined) {
      updateData.business_postal_code = contactDetails.business_postal_code?.trim() || null
    }
    if (contactDetails.business_country !== undefined) {
      updateData.business_country = contactDetails.business_country?.toUpperCase().trim() || null
    }

    // Update in Supabase
    const supabase = await createClient()
    const { error: updateError } = await supabase
      .from("organizations")
      .update(updateData)
      .eq("org_slug", orgSlug)

    if (updateError) {
      
      return { success: false, error: "Failed to update organization contact details" }
    }

    

    // Return updated data
    return {
      success: true,
      contactDetails: {
        business_person_name: updateData.business_person_name ?? null,
        business_person_position: updateData.business_person_position ?? null,
        business_person_department: updateData.business_person_department ?? null,
        contact_email: updateData.contact_email ?? null,
        contact_phone: updateData.contact_phone ?? null,
        business_address_line1: updateData.business_address_line1 ?? null,
        business_address_line2: updateData.business_address_line2 ?? null,
        business_city: updateData.business_city ?? null,
        business_state: updateData.business_state ?? null,
        business_postal_code: updateData.business_postal_code ?? null,
        business_country: updateData.business_country ?? null,
      },
    }
  } catch (err: unknown) {
    
    const errorMessage = err instanceof Error ? err.message : "Failed to update organization contact details"
    return { success: false, error: errorMessage }
  }
}

// ============================================
// Organization Quota Limits Functions
// ============================================

/**
 * Get organization quota limits and current usage.
 *
 * Limits are populated from Stripe via webhook (dynamic, never hardcoded):
 * - seat_limit: from Stripe product metadata "teamMembers"
 * - providers_limit: from Stripe product metadata "providers"
 * - pipelines_per_day_limit: from Stripe product metadata "pipelinesPerDay"
 *
 * Usage counts are calculated from actual data:
 * - team_members_count: count from organization_members table
 * - configured_providers_count: count of configured integrations
 *
 * SECURITY: Requires org membership.
 */
export async function getOrgQuotaLimits(orgSlug: string): Promise<GetOrgQuotaLimitsResult> {
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

    const supabase = await createClient()

    // Fetch organization with quota limits (populated by Stripe webhook)
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select(`
        id,
        plan,
        billing_status,
        seat_limit,
        providers_limit,
        pipelines_per_day_limit,
        pipelines_per_week_limit,
        pipelines_per_month_limit,
        integration_openai_status,
        integration_anthropic_status,
        integration_gcp_status,
        integration_gemini_status,
        integration_deepseek_status
      `)
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      
      return { success: false, error: "Failed to fetch organization quota limits" }
    }

    // Count active team members
    const { count: memberCount, error: memberError } = await supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "active")

    if (memberError) {
      
      return { success: false, error: "Failed to count team members" }
    }

    // Count configured providers (status = 'configured')
    let configuredProviders = 0
    if (org.integration_openai_status === "configured") configuredProviders++
    if (org.integration_anthropic_status === "configured") configuredProviders++
    if (org.integration_gcp_status === "configured") configuredProviders++
    if (org.integration_gemini_status === "configured") configuredProviders++
    if (org.integration_deepseek_status === "configured") configuredProviders++

    return {
      success: true,
      quotaLimits: {
        // Plan info from Stripe (via webhook)
        plan_name: org.plan ?? "starter",
        billing_status: org.billing_status ?? "active",
        // Limits from Stripe (via webhook) - defaults indicate no limit set
        seat_limit: org.seat_limit ?? 0,
        providers_limit: org.providers_limit ?? 0,
        pipelines_per_day_limit: org.pipelines_per_day_limit ?? 0,
        pipelines_per_week_limit: org.pipelines_per_week_limit ?? 0,
        pipelines_per_month_limit: org.pipelines_per_month_limit ?? 0,
        // Current usage counts
        team_members_count: memberCount ?? 0,
        configured_providers_count: configuredProviders,
      },
    }
  } catch (err: unknown) {

    const errorMessage = err instanceof Error ? err.message : "Failed to get organization quota limits"
    return { success: false, error: errorMessage }
  }
}

// ============================================
// Get Org Name
// ============================================

/**
 * Get organization name from Supabase.
 *
 * SECURITY: Requires org membership.
 */
export async function getOrgName(orgSlug: string): Promise<{
  success: boolean
  orgName?: string
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

    // Fetch org name from Supabase
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("organizations")
      .select("org_name")
      .eq("org_slug", orgSlug)
      .single()

    if (error || !data) {
      return { success: false, error: "Failed to fetch organization name" }
    }

    return {
      success: true,
      orgName: data.org_name,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to get organization name"
    return { success: false, error: errorMessage }
  }
}

// ============================================
// Update Org Name
// ============================================

/**
 * Validate organization name.
 * Prevents XSS and ensures reasonable length.
 */
function isValidOrgNameInput(name: string): boolean {
  if (!name || typeof name !== "string") return false
  const trimmed = name.trim()
  // Must be 2-100 characters, no HTML tags or script injections
  if (trimmed.length < 2 || trimmed.length > 100) return false
  // Block common XSS patterns
  if (/<[^>]*>/.test(trimmed)) return false
  if (/javascript:/i.test(trimmed)) return false
  if (/on\w+\s*=/i.test(trimmed)) return false
  return true
}

/**
 * Sanitize organization name.
 * Removes potentially dangerous characters.
 */
function sanitizeOrgNameInput(name: string): string {
  return name
    .trim()
    .replace(/[<>"'&;]/g, "") // Remove dangerous chars
    .slice(0, 100) // Enforce max length
}

/**
 * Update organization name in Supabase.
 *
 * SECURITY:
 * - Requires org membership
 * - Input is validated and sanitized
 * - Only updates the org_name field (not org_slug which is immutable)
 */
export async function updateOrgName(
  orgSlug: string,
  newOrgName: string
): Promise<{
  success: boolean
  orgName?: string
  error?: string
}> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    if (!isValidOrgNameInput(newOrgName)) {
      return { success: false, error: "Invalid organization name. Must be 2-100 characters without HTML tags." }
    }

    // Sanitize the name
    const sanitizedName = sanitizeOrgNameInput(newOrgName)

    // Step 2: Verify authentication AND org membership
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    // Step 3: Update org name in Supabase
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("organizations")
      .update({ org_name: sanitizedName })
      .eq("org_slug", orgSlug)
      .select("org_name")
      .single()

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to update organization name" }
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[updateOrgName] Updated org name for ${orgSlug} to "${sanitizedName}"`)
    }

    return {
      success: true,
      orgName: data.org_name,
    }
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.error("[updateOrgName] Unexpected error:", err)
    }
    const errorMessage = err instanceof Error ? err.message : "Failed to update organization name"
    return { success: false, error: errorMessage }
  }
}
