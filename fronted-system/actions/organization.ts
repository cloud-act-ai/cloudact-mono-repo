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
 * @see docs/SECURITY.md for full security documentation
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { onboardToBackend } from "@/actions/backend-onboarding"
import { stripe } from "@/lib/stripe"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"

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
}

// Sanitize organization name to prevent XSS and SQL injection
function sanitizeOrgName(name: string): string {
  // Remove any HTML tags, trim, and limit length
  return name
    .replace(/<[^>]*>/g, "")  // Remove HTML tags
    .replace(/[<>"'&;]/g, "") // Remove potentially dangerous characters
    .trim()
    .slice(0, 100)            // Limit length
}

// Validate organization name
function isValidOrgName(name: string): boolean {
  const trimmed = name.trim()
  // Must be 2-100 chars, no HTML or script tags
  return trimmed.length >= 2 &&
         trimmed.length <= 100 &&
         !/<script|<\/script|javascript:|on\w+=/i.test(trimmed)
}

export async function createOrganization(input: CreateOrganizationInput) {
  try {
    // Validate and sanitize input name
    if (!isValidOrgName(input.name)) {
      return { success: false, error: "Invalid organization name" }
    }
    const sanitizedName = sanitizeOrgName(input.name)

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

    // Generate slug from first word of name + date (shorter, cleaner)
    const date = new Date()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    const yyyy = date.getFullYear()
    const suffix = `${mm}${dd}${yyyy}`

    // Extract first word only for shorter slug (e.g., "Genai Community Corp" -> "genai")
    const firstWord = sanitizedName
      .split(/\s+/)[0]  // Get first word
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20)  // Limit first word to 20 chars max
    const orgSlug = `${firstWord}_${suffix}`

    // Calculate trial end date in UTC
    // Trial end is stored in UTC. Frontend should display in user's local timezone.
    // Using end of day UTC ensures users get full trial regardless of timezone.
    const trialEndsAt = new Date()
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + input.trialDays)
    // Set to end of day UTC to be generous
    trialEndsAt.setUTCHours(23, 59, 59, 999)

    // Insert organization using service role (bypasses RLS)
    // All limits come from Stripe metadata - no hardcoded values
    const { data: orgData, error: orgError } = await adminClient
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
      })
      .select()
      .single()

    if (orgError) {
      console.error("[v0] Organization creation error:", orgError)
      return { success: false, error: orgError.message }
    }

    // Note: organization_members entry is auto-created by DB trigger (on_org_created)

    // Step 2: Onboard to backend (creates API key, datasets, etc.)
    // This is async and non-blocking - if it fails, user can retry later from Settings > Onboarding & Quota
    let backendApiKey: string | undefined
    let backendApiKeyFingerprint: string | undefined
    let backendOnboardingFailed = false
    let backendOnboardingError: string | undefined

    try {
      console.log("[v0] Initiating backend onboarding for:", orgSlug)

      const backendResult = await onboardToBackend({
        orgSlug,
        companyName: sanitizedName,
        adminEmail: user.email || "",
        subscriptionPlan: mapPlanToBackendPlan(input.planId),
      })

      if (backendResult.success) {
        backendApiKey = backendResult.apiKey
        backendApiKeyFingerprint = backendResult.apiKeyFingerprint
        console.log("[v0] Backend onboarding successful, API key generated")
      } else {
        console.warn("[v0] Backend onboarding failed:", backendResult.error)
        backendOnboardingFailed = true
        backendOnboardingError = backendResult.error
        // Don't fail the whole operation - user can onboard to backend later from Profile
      }
    } catch (backendErr: unknown) {
      console.error("[v0] Backend onboarding error:", backendErr)
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
    console.error("[v0] Create organization error:", err)
    const errorMessage = err instanceof Error ? err.message : "Failed to create organization"
    return { success: false, error: errorMessage }
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
  try {
    console.log("[v0] Completing onboarding for session:", sessionId)

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

    // Retrieve checkout session from Stripe (expand only subscription - 1 level)
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    })

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

    if (!companyName || !orgSlug) {
      return { success: false, error: "Missing company information" }
    }

    // Sanitize company name
    const sanitizedName = sanitizeOrgName(companyName)
    if (!isValidOrgName(sanitizedName)) {
      return { success: false, error: "Invalid company name" }
    }

    // Use service role client to bypass RLS
    const adminClient = createServiceRoleClient()

    // Check if user already has an organization (idempotency)
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("org_id, organizations(org_slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single()

    if (existingMember) {
      const org = existingMember.organizations as unknown as { org_slug: string } | null
      console.log("[v0] User already has org:", org?.org_slug)
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
      .single()

    if (existingOrg) {
      // Add timestamp suffix for uniqueness
      const suffix = Date.now().toString(36)
      orgSlug = `${orgSlug}_${suffix}`
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
      console.error("[v0] Product missing required metadata")
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
        current_period_start: (subscription as any).current_period_start
          ? new Date((subscription as any).current_period_start * 1000).toISOString()
          : new Date().toISOString(),
        current_period_end: (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000).toISOString()
          : trialEndsAt.toISOString(),
        seat_limit: limits.teamMembers,
        providers_limit: limits.providers,
        pipelines_per_day_limit: limits.pipelinesPerDay,
        created_by: user.id,
      })
      .select()
      .single()

    if (orgError) {
      console.error("[v0] Organization creation error:", orgError)
      return { success: false, error: orgError.message }
    }

    console.log("[v0] Organization created:", orgSlug)

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
      } catch (stripeErr: unknown) {
        retryCount++
        const errMsg = stripeErr instanceof Error ? stripeErr.message : "Unknown error"
        console.warn(`[v0] Failed to update Stripe subscription metadata (attempt ${retryCount}/${maxRetries}):`, errMsg)

        if (retryCount >= maxRetries) {
          // Queue for later or log error - final attempt
          console.error("[v0] Stripe metadata update failed after retries. Manual update may be required.")
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
          onboarding_completed_at: new Date().toISOString(),
        },
      })
    } catch (metaErr: unknown) {
      const errMsg = metaErr instanceof Error ? metaErr.message : "Unknown error"
      console.warn("[v0] Failed to clear user metadata:", errMsg)
      // Non-critical, continue
    }

    // Step 2: Backend onboarding (async, non-blocking)
    let backendApiKey: string | undefined
    let backendOnboardingFailed = false

    try {
      console.log("[v0] Initiating backend onboarding for:", orgSlug)

      const backendResult = await onboardToBackend({
        orgSlug,
        companyName: sanitizedName,
        adminEmail: user.email || "",
        subscriptionPlan: mapPlanToBackendPlan(planId),
      })

      if (backendResult.success) {
        backendApiKey = backendResult.apiKey
        console.log("[v0] Backend onboarding successful")
      } else {
        console.warn("[v0] Backend onboarding failed:", backendResult.error)
        backendOnboardingFailed = true
      }
    } catch (backendErr: unknown) {
      console.error("[v0] Backend onboarding error:", backendErr)
      backendOnboardingFailed = true
    }

    return {
      success: true,
      orgSlug,
      orgId: orgData.id,
      backendApiKey,
      backendOnboardingFailed,
      message: backendOnboardingFailed
        ? "Organization created. Backend setup can be completed from Settings."
        : "Organization created successfully.",
    }
  } catch (err: unknown) {
    console.error("[v0] Complete onboarding error:", err)
    const errorMessage = err instanceof Error ? err.message : "Failed to complete setup"
    return { success: false, error: errorMessage }
  }
}
