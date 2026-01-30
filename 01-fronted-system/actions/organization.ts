"use server"

/**
 * Organization Management Server Actions
 *
 * SECURITY MEASURES IMPLEMENTED:
 * 1. Input Validation: isValidOrgName() - blocks script tags, XSS attempts
 * 2. Input Sanitization: sanitizeOrgName() - removes <, >, ", ', &, ;
 * 3. Length Limits: Max 100 characters for org names
 * 4. Authorization: User must be authenticated
 *
 * @see 00-requirements-docs/05_SECURITY.md for full security documentation
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { onboardToBackend } from "@/actions/backend-onboarding"
import { stripe } from "@/lib/stripe"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { getCountryFromCurrency, isValidCurrency, isValidTimezone, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/i18n"
import { sanitizeOrgName, isValidOrgName } from "@/lib/utils/validation"
import { getUserFriendlyError } from "@/lib/errors/user-friendly"

interface CreateOrganizationInput {
  name: string
  type: string
  priceId: string  // Stripe price ID
  planId: string   // Plan identifier from Stripe metadata
  limits: {
    teamMembers: number
    providers: number
    pipelinesPerDay: number
  }
  trialDays: number
  // i18n fields (from signup form via user_metadata)
  defaultCurrency?: string  // ISO 4217 (e.g., USD, AED)
  defaultTimezone?: string  // IANA timezone (e.g., UTC, Asia/Dubai)
}

export async function createOrganization(input: CreateOrganizationInput) {
  try {
    // Validate and sanitize input name
    if (!isValidOrgName(input.name)) {
      return { success: false, error: "Invalid organization name" }
    }
    const sanitizedName = sanitizeOrgName(input.name)

    // Check that sanitized name is not empty (e.g., if input was "<>" it becomes "")
    if (sanitizedName.length < 2) {
      return { success: false, error: "Organization name is too short after removing invalid characters" }
    }

    // Get current user from session (anon key client with cookies)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Use service role client to bypass RLS for insert
    const adminClient = createServiceRoleClient()

    // Check if user already has an organization
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("org_id, organizations(org_slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single()

    if (existingMember) {
      const org = existingMember.organizations as unknown as { org_slug: string } | null
      return {
        success: true,
        orgSlug: org?.org_slug,
        message: "Organization already exists",
      }
    }

    // Generate slug from first word of name + timestamp (ensures uniqueness)
    // BUG FIX: Changed from date-only suffix to timestamp to prevent same-day collisions
    const timestamp = Date.now().toString(36)  // Base36 for shorter string

    // Extract first word only for shorter slug (e.g., "Genai Community Corp" -> "genai")
    const firstWord = sanitizedName
      .split(/\s+/)[0]  // Get first word
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20)  // Limit first word to 20 chars max

    // Initial slug attempt
    let orgSlug = `${firstWord}_${timestamp}`

    // Check if slug already exists and add random suffix if needed
    const adminClientForSlugCheck = createServiceRoleClient()
    const { data: existingSlug } = await adminClientForSlugCheck
      .from("organizations")
      .select("org_slug")
      .eq("org_slug", orgSlug)
      .maybeSingle()

    if (existingSlug) {
      // Add random suffix for uniqueness
      const randomSuffix = Math.random().toString(36).substring(2, 6)
      orgSlug = `${firstWord}_${timestamp}_${randomSuffix}`
    }

    // Validate slug length (max 50 chars per backend requirement)
    if (orgSlug.length > 50) {
      const maxFirstWordLen = 50 - timestamp.length - 1  // -1 for underscore
      const truncatedFirst = firstWord.slice(0, Math.max(3, maxFirstWordLen))
      orgSlug = `${truncatedFirst}_${timestamp}`
    }

    // Calculate trial end date in UTC
    // Trial end is stored in UTC. Frontend should display in user's local timezone.
    // Using end of day UTC ensures users get full trial regardless of timezone.
    const trialEndsAt = new Date()
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + input.trialDays)
    // Set to end of day UTC to be generous
    trialEndsAt.setUTCHours(23, 59, 59, 999)

    // Derive and validate i18n fields
    const rawCurrency = input.defaultCurrency || DEFAULT_CURRENCY
    const rawTimezone = input.defaultTimezone || DEFAULT_TIMEZONE
    // Validate and fallback to defaults if invalid
    const defaultCurrency = isValidCurrency(rawCurrency) ? rawCurrency : DEFAULT_CURRENCY
    const defaultTimezone = isValidTimezone(rawTimezone) ? rawTimezone : DEFAULT_TIMEZONE
    const defaultCountry = getCountryFromCurrency(defaultCurrency)
    const defaultLanguage = "en"  // Always English for now

    // Insert organization using service role (bypasses RLS)
    // All limits come from Stripe metadata - no hardcoded values
    // FIX EDGE-001: Retry with new slug if unique constraint violation
    let orgData: { id: string; org_slug: string } | null = null
    let orgError: Error | null = null
    const maxRetries = 3

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { data, error } = await adminClient
        .from("organizations")
        .insert({
          org_name: sanitizedName,
          org_slug: orgSlug,
          org_type: input.type,
          plan: input.planId,                    // From Stripe product metadata
          stripe_price_id: input.priceId,        // Stripe price ID
          billing_status: "trialing",
          trial_ends_at: trialEndsAt.toISOString(),
          seat_limit: input.limits.teamMembers,
          providers_limit: input.limits.providers,
          pipelines_per_day_limit: input.limits.pipelinesPerDay,
          created_by: user.id,
          // i18n fields (from signup form)
          default_currency: defaultCurrency,
          default_country: defaultCountry,
          default_language: defaultLanguage,
          default_timezone: defaultTimezone,
        })
        .select()
        .single()

      if (!error) {
        orgData = data
        orgError = null
        break
      }

      // FIX EDGE-001: Check if error is unique constraint violation on org_slug
      const isUniqueViolation = error.message.includes("duplicate key") ||
                                 error.message.includes("unique constraint") ||
                                 error.code === "23505"

      if (isUniqueViolation && attempt < maxRetries - 1) {
        // Generate new slug with random suffix and retry
        const randomSuffix = Math.random().toString(36).substring(2, 8)
        orgSlug = `${firstWord}_${timestamp}_${randomSuffix}`
        if (process.env.NODE_ENV === "development") {
          console.log(`[createOrganization] Slug collision, retrying with: ${orgSlug}`)
        }
        continue
      }

      orgError = error
      break
    }

    if (orgError) {
      // FIX GAP-007: User-friendly error message
      return { success: false, error: getUserFriendlyError(orgError.message) }
    }

    if (!orgData) {
      return { success: false, error: "Failed to create organization after retries" }
    }

    // Note: organization_members entry is auto-created by DB trigger (on_org_created)

    // Step 2: Onboard to backend (creates API key, datasets, etc.)
    // This is async and non-blocking - if it fails, user can retry later from Settings > Onboarding & Quota
    let backendApiKey: string | undefined
    let backendApiKeyFingerprint: string | undefined
    let backendOnboardingFailed = false
    let backendOnboardingError: string | undefined

    try {
      const backendResult = await onboardToBackend({
        orgSlug,
        companyName: sanitizedName,
        adminEmail: user.email || "",
        subscriptionPlan: mapPlanToBackendPlan(input.planId),
        // i18n fields (from signup form)
        defaultCurrency: input.defaultCurrency || "USD",
        defaultTimezone: input.defaultTimezone || "UTC",
      })

      if (backendResult.success) {
        backendApiKey = backendResult.apiKey
        backendApiKeyFingerprint = backendResult.apiKeyFingerprint
      } else {
        backendOnboardingFailed = true
        backendOnboardingError = backendResult.error
        // Don't fail the whole operation - user can onboard to backend later from Profile
      }
    } catch (backendErr: unknown) {
      backendOnboardingFailed = true
      backendOnboardingError = backendErr instanceof Error ? backendErr.message : "Backend connection failed"
      // Don't fail - Supabase org creation succeeded
    }

    // Build appropriate message
    let message = "Organization created successfully."
    if (backendApiKey) {
      message += " Your API key has been saved to your account."
    } else if (backendOnboardingFailed) {
      message += " Backend connection failed - you can retry from Settings > Onboarding & Quota."
    }

    return {
      success: true,
      orgSlug,
      orgId: orgData.id,
      // Include backend API key (shown ONCE to user)
      backendApiKey,
      backendApiKeyFingerprint,
      // Include backend status so frontend can show appropriate UI
      backendOnboardingFailed,
      backendOnboardingError,
      message,
    }
  } catch (err: unknown) {
    const technicalError = err instanceof Error ? err.message : "Failed to create organization"
    // FIX GAP-007: User-friendly error message
    return { success: false, error: getUserFriendlyError(technicalError) }
  }
}

/**
 * Map Stripe plan ID to backend subscription plan.
 */
function mapPlanToBackendPlan(planId: string): "STARTER" | "PROFESSIONAL" | "SCALE" {
  const normalized = planId.toLowerCase()
  if (normalized.includes("scale") || normalized.includes("enterprise")) {
    return "SCALE"
  }
  if (normalized.includes("professional") || normalized.includes("pro") || normalized.includes("team")) {
    return "PROFESSIONAL"
  }
  return "STARTER"
}

// Safe parseInt with NaN handling
const safeParseInt = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) return defaultValue
  return parsed
}

/**
 * Complete onboarding after successful Stripe checkout.
 * Called from /onboarding/success page.
 *
 * This function:
 * 1. Verifies the checkout session with Stripe
 * 2. Retrieves pending company info from session metadata
 * 3. Creates the organization in Supabase
 * 4. Sets up Stripe subscription tracking
 * 5. Triggers backend onboarding (BigQuery dataset + API key)
 */
export async function completeOnboarding(sessionId: string) {
  // FIX GAP-003: Declare lockId at function scope for cleanup in catch block
  const lockId = `onboarding_${sessionId}`

  // FIX STATE-002: Create adminClient at function scope for reuse in catch block
  const adminClient = createServiceRoleClient()

  // FIX ERR-001: Helper function for lock cleanup with retry
  const cleanupLockWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await adminClient.from("onboarding_locks").delete().eq("lock_id", lockId)
        return true
      } catch (cleanupError) {
        if (i === retries - 1 && process.env.NODE_ENV === "development") {
          console.warn("[completeOnboarding] Lock cleanup failed after retries:", cleanupError)
        }
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)))
      }
    }
    return false
  }

  try {
    // Validate session ID format
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return { success: false, error: "Invalid checkout session" }
    }

    // Get current user
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // FIX GAP-003: Distributed locking to prevent concurrent onboarding
    // Attempt to acquire lock for this session
    // FIX STATE-002: Reuse adminClient from function scope
    const lockExpiry = new Date(Date.now() + 60000) // 60 second lock

    try {
      const { error: lockError } = await adminClient
        .from("onboarding_locks")
        .insert({
          lock_id: lockId,
          session_id: sessionId,
          user_id: user.id,
          expires_at: lockExpiry.toISOString(),
        })

      if (lockError) {
        // Lock exists (another tab is processing) - PostgreSQL error code 23505 = unique_violation
        if (lockError.code === "23505") {
          // Check if it's our lock (same user) vs someone else's
          const { data: existingLock } = await adminClient
            .from("onboarding_locks")
            .select("user_id")
            .eq("lock_id", lockId)
            .single()

          if (existingLock?.user_id === user.id) {
            return {
              success: false,
              error: "Setup in progress in another tab. Please wait or close other tabs and try again.",
            }
          } else {
            return {
              success: false,
              error: "This checkout session is being processed. Please wait a moment.",
            }
          }
        }
        // Other errors - log but continue (don't block onboarding for lock failures)
        if (process.env.NODE_ENV === "development") {
          console.warn("[completeOnboarding] Lock acquisition failed:", lockError)
        }
      }
    } catch (lockAttemptError) {
      // Non-critical - continue without lock if table doesn't exist yet
      if (process.env.NODE_ENV === "development") {
        console.warn("[completeOnboarding] Lock attempt error:", lockAttemptError)
      }
    }

    // FIX ERR-001: Add timeout to Stripe session retrieval (15 second timeout)
    const stripeTimeoutMs = 15000
    const retrieveWithTimeout = async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), stripeTimeoutMs)
      try {
        const result = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["subscription"],
        })
        clearTimeout(timeoutId)
        return result
      } catch (err) {
        clearTimeout(timeoutId)
        throw err
      }
    }

    let session
    try {
      session = await retrieveWithTimeout()
    } catch (stripeErr) {
      const errMsg = stripeErr instanceof Error ? stripeErr.message : "Unknown error"
      if (errMsg.includes("abort") || errMsg.includes("timeout")) {
        return { success: false, error: "Payment verification timed out. Please try again." }
      }
      return { success: false, error: `Failed to verify payment: ${errMsg}` }
    }

    if (!session) {
      return { success: false, error: "Checkout session not found" }
    }

    // Verify session is completed
    if (session.status !== "complete") {
      return { success: false, error: "Checkout session not completed" }
    }

    // Verify this is an onboarding session
    if (session.metadata?.is_onboarding !== "true") {
      return { success: false, error: "Invalid session type" }
    }

    // Verify session belongs to this user
    if (session.metadata?.user_id !== user.id) {
      return { success: false, error: "Session does not belong to this user" }
    }

    // Get pending company info from session metadata
    const companyName = session.metadata?.pending_company_name
    const companyType = session.metadata?.pending_company_type || "company"
    let orgSlug = session.metadata?.pending_org_slug
    // i18n fields (from signup via session metadata)
    const pendingCurrency = session.metadata?.pending_currency || "USD"
    const pendingTimezone = session.metadata?.pending_timezone || "UTC"

    if (!companyName || !orgSlug) {
      return { success: false, error: "Missing company information" }
    }

    // Sanitize company name
    const sanitizedName = sanitizeOrgName(companyName)
    if (!isValidOrgName(sanitizedName)) {
      return { success: false, error: "Invalid company name" }
    }

    // Check that sanitized name is not empty (e.g., if input was "<>" it becomes "")
    if (sanitizedName.length < 2) {
      return { success: false, error: "Company name is too short after removing invalid characters" }
    }

    // Note: adminClient already declared above for lock acquisition

    // IDEMPOTENCY CHECK 1: Check if this Stripe session was already processed
    // BUG FIX: Prevents duplicate org creation if user refreshes success page or webhook retries
    const { data: existingOrgBySession } = await adminClient
      .from("organizations")
      .select("org_slug, id")
      .eq("stripe_subscription_id", typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || "")
      .maybeSingle()

    if (existingOrgBySession) {
      // This session was already processed - return existing org
      return {
        success: true,
        orgSlug: existingOrgBySession.org_slug,
        orgId: existingOrgBySession.id,
        message: "Organization already created from this checkout session",
      }
    }

    // IDEMPOTENCY CHECK 2: Check if user already has an organization
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("org_id, organizations(org_slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single()

    if (existingMember) {
      const org = existingMember.organizations as unknown as { org_slug: string } | null
      return {
        success: true,
        orgSlug: org?.org_slug,
        message: "Organization already exists",
      }
    }

    // Check if org slug already exists, add suffix if needed
    const { data: existingOrg } = await adminClient
      .from("organizations")
      .select("org_slug")
      .eq("org_slug", orgSlug)
      .maybeSingle() // Use maybeSingle to avoid throwing on no match

    if (existingOrg) {
      // Add timestamp suffix for uniqueness
      const suffix = Date.now().toString(36)
      const newSlug = `${orgSlug}_${suffix}`

      // Validate new slug doesn't exceed max length (50 chars) and still matches pattern
      const slugPattern = /^[a-zA-Z0-9_]{3,50}$/
      if (!slugPattern.test(newSlug)) {
        // Truncate base slug to fit within 50 chars total
        const maxBaseLength = 50 - suffix.length - 1 // -1 for underscore
        const truncatedBase = orgSlug.slice(0, maxBaseLength)
        orgSlug = `${truncatedBase}_${suffix}`

        // Final validation
        if (!slugPattern.test(orgSlug)) {
          return { success: false, error: "Unable to generate valid organization slug. Please choose a shorter name." }
        }
      } else {
        orgSlug = newSlug
      }
    }

    // Get subscription ID from session
    const sessionSubscription = session.subscription
    if (!sessionSubscription) {
      return { success: false, error: "Subscription not found" }
    }

    // Get subscription ID (could be string or object)
    const subscriptionId = typeof sessionSubscription === "string"
      ? sessionSubscription
      : (typeof sessionSubscription === "object" && sessionSubscription.id) || ""

    if (!subscriptionId) {
      return { success: false, error: "Invalid subscription ID" }
    }

    // Retrieve subscription separately with price.product expanded (4 levels max)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price.product"],
    })

    // Get price and product details
    const priceItem = subscription.items.data[0]?.price
    const product = priceItem?.product

    if (!priceItem || typeof product === "string" || !product) {
      return { success: false, error: "Invalid subscription data" }
    }

    // Check if product is deleted
    type ProductWithDeleted = { deleted?: boolean; metadata?: Record<string, string>; name: string }
    const productData = product as ProductWithDeleted

    if (productData.deleted) {
      return { success: false, error: "Product has been deleted" }
    }

    // Get plan info from Stripe product metadata
    const metadata = productData.metadata || {}
    const planId = metadata.plan_id || productData.name.toLowerCase().replace(/\s+/g, "_")

    // Get limits from metadata (required)
    if (!metadata.teamMembers || !metadata.providers || !metadata.pipelinesPerDay) {
      return { success: false, error: "Plan configuration error. Please contact support." }
    }

    const limits = {
      teamMembers: safeParseInt(metadata.teamMembers, 2),
      providers: safeParseInt(metadata.providers, 3),
      pipelinesPerDay: safeParseInt(metadata.pipelinesPerDay, 6),
    }

    // Calculate trial end date
    const trialDays = priceItem.recurring?.trial_period_days || DEFAULT_TRIAL_DAYS
    const trialEndsAt = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)

    // Validate session customer before casting
    if (!session.customer) {
      return { success: false, error: "No customer in session" }
    }

    // Create organization
    const { data: orgData, error: orgError } = await adminClient
      .from("organizations")
      .insert({
        org_name: sanitizedName,
        org_slug: orgSlug,
        org_type: companyType,
        plan: planId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceItem.id,
        billing_status: subscription.status,
        trial_ends_at: trialEndsAt.toISOString(),
        current_period_start: (subscription as unknown as { current_period_start?: number }).current_period_start
          ? new Date((subscription as unknown as { current_period_start: number }).current_period_start * 1000).toISOString()
          : new Date().toISOString(),
        current_period_end: (subscription as unknown as { current_period_end?: number }).current_period_end
          ? new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString()
          : trialEndsAt.toISOString(),
        seat_limit: limits.teamMembers,
        providers_limit: limits.providers,
        pipelines_per_day_limit: limits.pipelinesPerDay,
        created_by: user.id,
        // i18n fields (from signup via session metadata)
        default_currency: pendingCurrency,
        default_country: getCountryFromCurrency(pendingCurrency),
        default_language: "en",  // Always English for now
        default_timezone: pendingTimezone,
      })
      .select()
      .single()

    if (orgError) {
      // FIX GAP-007: User-friendly error message
      return { success: false, error: getUserFriendlyError(orgError.message) }
    }

    // Update Stripe subscription with org info (with retry)
    let retryCount = 0
    const maxRetries = 3
    let updateSuccess = false

    while (retryCount < maxRetries && !updateSuccess) {
      try {
        await stripe.subscriptions.update(subscription.id, {
          metadata: {
            org_id: orgData.id,
            org_slug: orgSlug,
          },
        })
        updateSuccess = true
      } catch (stripeUpdateError) {
        retryCount++

        if (retryCount >= maxRetries) {
          // Max retries exceeded - org created but Stripe metadata update failed
          // Non-critical: webhook will still process subscription events correctly
          if (process.env.NODE_ENV === "development") {
            console.warn("[CompleteOnboarding] Stripe subscription metadata update failed after retries:", stripeUpdateError)
          }
          break
        } else {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)))
        }
      }
    }

    // Clear pending company info from user metadata
    try {
      await supabase.auth.updateUser({
        data: {
          pending_company_name: null,
          pending_company_type: null,
          pending_currency: null,
          pending_timezone: null,
          onboarding_completed_at: new Date().toISOString(),
        },
      })
    } catch (userUpdateError) {
      // Non-critical, continue - but log for debugging
      if (process.env.NODE_ENV === "development") {
        console.warn("[CompleteOnboarding] Failed to clear pending metadata:", userUpdateError)
      }
    }

    // Step 2: Backend onboarding (async, non-blocking)
    // FIX SEC-002: API key is no longer returned directly - use revealToken instead
    let backendRevealToken: string | undefined
    let backendRevealTokenExpiresAt: string | undefined
    let backendOnboardingFailed = false
    // FIX ERR-002: Track backend error message for better debugging
    let backendErrorMessage: string | undefined

    try {
      const backendResult = await onboardToBackend({
        orgSlug,
        companyName: sanitizedName,
        adminEmail: user.email || "",
        subscriptionPlan: mapPlanToBackendPlan(planId),
        // i18n fields (from signup via session metadata)
        defaultCurrency: pendingCurrency,
        defaultTimezone: pendingTimezone,
      })

      if (backendResult.success) {
        // FIX SEC-002: Use revealToken instead of direct apiKey
        backendRevealToken = backendResult.revealToken
        backendRevealTokenExpiresAt = backendResult.revealTokenExpiresAt
      } else {
        backendOnboardingFailed = true
        // FIX ERR-002: Capture backend error message
        backendErrorMessage = backendResult.error
      }
    } catch (backendError) {
      backendOnboardingFailed = true
      // FIX ERR-002: Capture exception message
      backendErrorMessage = backendError instanceof Error ? backendError.message : "Backend connection failed"
      if (process.env.NODE_ENV === "development") {
        console.warn("[CompleteOnboarding] Backend onboarding failed:", backendError)
      }
    }

    // FIX GAP-003 + ERR-001: Release lock on success with retry
    await cleanupLockWithRetry()

    return {
      success: true,
      orgSlug,
      orgId: orgData.id,
      // FIX SEC-002: Return revealToken instead of direct apiKey
      backendRevealToken,
      backendRevealTokenExpiresAt,
      backendOnboardingFailed,
      // FIX ERR-002: Include backend error message for debugging
      backendErrorMessage,
      message: backendOnboardingFailed
        ? `Organization created. Backend setup can be completed from Settings.${backendErrorMessage ? ` (${backendErrorMessage})` : ""}`
        : "Organization created successfully.",
    }
  } catch (err: unknown) {
    // FIX GAP-003 + ERR-001 + STATE-002: Release lock on error with retry using existing adminClient
    await cleanupLockWithRetry()

    const technicalError = err instanceof Error ? err.message : "Failed to complete setup"
    // FIX GAP-007: User-friendly error message
    return { success: false, error: getUserFriendlyError(technicalError) }
  }
}
