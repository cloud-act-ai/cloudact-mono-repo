"use server"

/**
 * Stripe Server Actions
 *
 * SECURITY NOTE: These server actions are protected by:
 * 1. Next.js server actions automatically validate the request origin
 * 2. User authentication via Supabase session
 * 3. Rate limiting for checkout sessions
 * 4. Input validation for all parameters
 *
 * Server actions in Next.js 14+ include built-in CSRF protection.
 */

import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { syncSubscriptionToBackend } from "./backend-onboarding"

// Price ID validation - verify it's a valid Stripe price format
// Price IDs start with "price_" and are fetched dynamically from Stripe
const isValidStripePriceId = (priceId: string): boolean => {
  return priceId.startsWith("price_") && priceId.length > 10
}

// OrgSlug validation - prevent path traversal and injection
// Backend requires: alphanumeric with underscores only (no hyphens), 3-50 characters
const isValidOrgSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

// Safe parseInt with NaN handling - returns default value if invalid
const safeParseInt = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) return defaultValue
  return parsed
}

// Simple in-memory rate limiting for checkout sessions
const checkoutRateLimits = new Map<string, number>()
const CHECKOUT_RATE_LIMIT_MS = 30000 // 30 seconds between checkout attempts
const MAX_RATE_LIMIT_ENTRIES = 1000

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const lastAttempt = checkoutRateLimits.get(userId)

  if (lastAttempt && now - lastAttempt < CHECKOUT_RATE_LIMIT_MS) {
    return false // Rate limited
  }

  checkoutRateLimits.set(userId, now)

  // Clean up old entries periodically with LRU eviction
  if (checkoutRateLimits.size > MAX_RATE_LIMIT_ENTRIES) {
    const cutoff = now - CHECKOUT_RATE_LIMIT_MS * 2
    const entries = Array.from(checkoutRateLimits.entries())

    // Remove expired entries first
    const expiredKeys = entries.filter(([_, time]) => time < cutoff).map(([key]) => key)
    expiredKeys.forEach(key => checkoutRateLimits.delete(key))

    // If still over limit, remove oldest entries (LRU)
    if (checkoutRateLimits.size > MAX_RATE_LIMIT_ENTRIES) {
      const sortedEntries = Array.from(checkoutRateLimits.entries()).sort((a, b) => a[1] - b[1])
      const toRemove = sortedEntries.slice(0, checkoutRateLimits.size - MAX_RATE_LIMIT_ENTRIES)
      toRemove.forEach(([key]) => checkoutRateLimits.delete(key))
    }
  }

  return true
}

export interface BillingInfo {
  subscription: {
    id: string
    status: string
    currentPeriodStart: Date
    currentPeriodEnd: Date
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
    plan: {
      id: string
      name: string
      price: number
      currency: string
      interval: string
    }
  } | null
  invoices: {
    id: string
    number: string | null
    status: string
    amountPaid: number
    amountDue: number
    currency: string
    created: Date
    hostedInvoiceUrl: string | null
    invoicePdf: string | null
  }[]
  paymentMethod: {
    brand: string
    last4: string
    expMonth: number
    expYear: number
  } | null
  trialEndsAt: Date | null
}

/**
 * Create a checkout session for new user onboarding (no org exists yet)
 * Used during signup flow - org will be created after successful checkout
 */
export async function createOnboardingCheckoutSession(priceId: string) {
  try {
    console.log("[v0] Creating onboarding checkout session")

    // Validate price ID format (must be a valid Stripe price ID)
    if (!isValidStripePriceId(priceId)) {
      console.error("[v0] Invalid price ID format")
      return { url: null, error: "Invalid plan selected" }
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      console.error("[v0] Unauthorized: No user found")
      return { url: null, error: "Unauthorized" }
    }

    // Rate limit checkout session creation
    if (!checkRateLimit(user.id)) {
      console.error("[v0] Rate limit exceeded for user:", user.id)
      return { url: null, error: "Please wait before creating another checkout session" }
    }

    // Get pending company info from user metadata (set during signup)
    const pendingCompanyName = user.user_metadata?.pending_company_name
    const pendingCompanyType = user.user_metadata?.pending_company_type || "company"
    // i18n fields (set during signup)
    const pendingCurrency = user.user_metadata?.pending_currency || "USD"
    const pendingTimezone = user.user_metadata?.pending_timezone || "UTC"

    if (!pendingCompanyName) {
      console.error("[v0] No pending company info in user metadata")
      return { url: null, error: "Please complete signup first" }
    }

    // Generate org slug from company name + date (backend requires alphanumeric + underscores only)
    // Format: companyname_MMDDYYYY (e.g., acme_11282025)
    const date = new Date()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    const yyyy = date.getFullYear()
    const dateSuffix = `${mm}${dd}${yyyy}`

    const cleanName = pendingCompanyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .replace(/_\d{8}$/, "")  // Strip trailing date suffix if already present (prevents duplicates)
      .slice(0, 40) // Leave room for date suffix

    const orgSlug = `${cleanName}_${dateSuffix}`

    // Validate generated org slug
    if (!isValidOrgSlug(orgSlug)) {
      console.error("[v0] Invalid generated org slug:", orgSlug)
      return { url: null, error: "Invalid company name. Please use only letters, numbers, and spaces." }
    }

    let origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_APP_URL

    // Require valid origin in non-development environments
    if (!origin) {
      if (process.env.NODE_ENV === "development") {
        origin = "http://localhost:3000"
      } else {
        console.error("[v0] No origin or NEXT_PUBLIC_APP_URL configured")
        return { url: null, error: "Application URL not configured. Please contact support." }
      }
    }

    // Handle comma-separated URLs in preview environments
    if (origin.includes(",")) {
      origin = origin.split(",")[0].trim()
    }

    // Remove any trailing slashes or extra spaces
    origin = origin.trim().replace(/\/+$/, "")

    console.log("[v0] Using origin:", origin)

    // Generate idempotency key to prevent duplicate sessions
    // NOTE: Do NOT include Date.now() - it defeats idempotency by creating unique keys per request
    const idempotencyKey = `onboarding_${user.id}_${priceId}`

    // Fetch price details to check for specific trial period
    const price = await stripe.prices.retrieve(priceId)
    const planTrialDays = price.recurring?.trial_period_days

    // Use plan-specific trial days if set, otherwise use default
    const trialDays = planTrialDays !== undefined && planTrialDays !== null
      ? planTrialDays
      : DEFAULT_TRIAL_DAYS

    console.log(`[v0] Creating onboarding checkout with ${trialDays} trial days`)

    // Build checkout session options
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      // Success: redirect to a special page that will create org and redirect to dashboard
      success_url: `${origin}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/onboarding/billing?canceled=true`,
      customer_email: user.email,
      metadata: {
        // Flag to indicate this is an onboarding checkout (org needs to be created)
        is_onboarding: "true",
        user_id: user.id,
        user_email: user.email,
        // Pending company info to create org after checkout
        pending_company_name: pendingCompanyName,
        pending_company_type: pendingCompanyType,
        pending_org_slug: orgSlug,
        // i18n fields (from signup form via user_metadata)
        pending_currency: pendingCurrency,
        pending_timezone: pendingTimezone,
      },
      subscription_data: {
        metadata: {
          is_onboarding: "true",
          user_id: user.id,
          pending_org_slug: orgSlug,
        },
      },
      // Skip payment collection during trial - matches "No credit card required" UX promise
      // Options: "always" (always collect), "if_required" (only if amount due > $0)
      // Using "if_required" for trial signups - should skip payment form when trial makes amount $0
      // Note: If Stripe still shows billing fields, it's due to fraud prevention or future usage setup
      payment_method_collection: "if_required",
      allow_promotion_codes: true,
    }

    // Only add trial_period_days if > 0
    if (trialDays > 0 && sessionOptions.subscription_data) {
      sessionOptions.subscription_data.trial_period_days = trialDays
    }

    const session = await stripe.checkout.sessions.create(sessionOptions, {
      idempotencyKey,
    })

    console.log("[v0] Onboarding checkout session created:", session.id)
    return { url: session.url, error: null }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create checkout session"
    console.error("[v0] Onboarding checkout error:", error)
    return { url: null, error: errorMessage }
  }
}

export async function createCheckoutSession(priceId: string, orgSlug: string) {
  try {
    console.log("[v0] Creating checkout session for org:", orgSlug)

    // Validate orgSlug format (prevent path traversal/injection)
    if (!isValidOrgSlug(orgSlug)) {
      console.error("[v0] Invalid org slug format:", orgSlug)
      return { url: null, error: "Invalid organization" }
    }

    // Validate price ID format (must be a valid Stripe price ID)
    if (!isValidStripePriceId(priceId)) {
      console.error("[v0] Invalid price ID format")
      return { url: null, error: "Invalid plan selected" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      console.error("[v0] Unauthorized: No user found")
      return { url: null, error: "Unauthorized" }
    }

    // Rate limit checkout session creation
    if (!checkRateLimit(user.id)) {
      console.error("[v0] Rate limit exceeded for user:", user.id)
      return { url: null, error: "Please wait before creating another checkout session" }
    }

    // Get organization with Stripe customer ID
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, org_name, stripe_customer_id, stripe_subscription_id")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      console.error("[v0] Organization not found")
      return { url: null, error: "Organization not found" }
    }

    // SECURITY: Verify user is a member AND is the owner
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (!membership) {
      console.error("[v0] User is not a member of this organization")
      return { url: null, error: "Not a member of this organization" }
    }

    if (membership.role !== "owner") {
      console.error("[v0] User is not the owner")
      return { url: null, error: "Only the owner can subscribe" }
    }

    // Check if org already has active subscription
    if (org.stripe_subscription_id) {
      return { url: null, error: "Organization already has an active subscription. Use billing portal to change plans." }
    }

    let origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_APP_URL

    // Require valid origin in non-development environments
    if (!origin) {
      if (process.env.NODE_ENV === "development") {
        origin = "http://localhost:3000"
      } else {
        console.error("[v0] No origin or NEXT_PUBLIC_APP_URL configured")
        return { url: null, error: "Application URL not configured. Please contact support." }
      }
    }

    // Handle comma-separated URLs in preview environments
    if (origin.includes(",")) {
      origin = origin.split(",")[0].trim()
    }

    // Remove any trailing slashes or extra spaces
    origin = origin.trim().replace(/\/+$/, "")

    console.log("[v0] Using origin:", origin)

    // Generate idempotency key to prevent duplicate sessions
    const idempotencyKey = `checkout_${org.id}_${priceId}`

    // Fetch price details to check for specific trial period
    const price = await stripe.prices.retrieve(priceId)
    const planTrialDays = price.recurring?.trial_period_days

    // Use plan-specific trial days if set, otherwise use default
    // If plan has 0 trial days explicitly, use 0. If undefined/null, use default.
    const trialDays = planTrialDays !== undefined && planTrialDays !== null
      ? planTrialDays
      : DEFAULT_TRIAL_DAYS

    console.log(`[v0] Creating checkout with ${trialDays} trial days (Plan: ${planTrialDays}, Default: ${DEFAULT_TRIAL_DAYS})`)

    // Build checkout session options
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/${orgSlug}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${orgSlug}/billing?canceled=true`,
      metadata: {
        org_id: org.id,
        org_slug: orgSlug,
        org_name: org.org_name,
        user_id: user.id,
        user_email: user.email,
      },
      subscription_data: {
        metadata: {
          org_id: org.id,
          org_slug: orgSlug,
        },
      },
      // Skip payment collection during trial - card not required until trial ends
      payment_method_collection: "if_required",
      allow_promotion_codes: true,
    }

    // Only add trial_period_days if > 0
    if (trialDays > 0 && sessionOptions.subscription_data) {
      sessionOptions.subscription_data.trial_period_days = trialDays
    }

    // Reuse existing Stripe customer if available, otherwise use email
    if (org.stripe_customer_id) {
      sessionOptions.customer = org.stripe_customer_id
      console.log("[v0] Reusing existing customer")
    } else {
      sessionOptions.customer_email = user.email
      console.log("[v0] Creating checkout with new customer")
    }

    const session = await stripe.checkout.sessions.create(sessionOptions, {
      idempotencyKey,
    })

    console.log("[v0] Checkout session created:", session.id)
    return { url: session.url, error: null }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create checkout session"
    console.error("[v0] Stripe checkout error:", error)
    return { url: null, error: errorMessage }
  }
}

export async function getBillingInfo(orgSlug: string): Promise<{ data: BillingInfo | null; error: string | null }> {
  try {
    // Validate orgSlug format (prevent path traversal/injection)
    if (!isValidOrgSlug(orgSlug)) {
      console.error("[v0] Invalid org slug format in getBillingInfo")
      return { data: null, error: "Invalid organization" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: "Unauthorized" }
    }

    // Get organization with Stripe info
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, stripe_customer_id, stripe_subscription_id, billing_status, plan, trial_ends_at")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { data: null, error: "Organization not found" }
    }

    // Verify user is a member
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (!membership) {
      return { data: null, error: "Not a member of this organization" }
    }

    const billingInfo: BillingInfo = {
      subscription: null,
      invoices: [],
      paymentMethod: null,
      trialEndsAt: org.trial_ends_at ? new Date(org.trial_ends_at) : null,
    }

    // If no Stripe customer yet, return basic info
    if (!org.stripe_customer_id) {
      return { data: billingInfo, error: null }
    }

    // Fetch subscription from Stripe
    // Try by subscription ID first, then fallback to finding by customer ID
    let subscription = null
    try {
      if (org.stripe_subscription_id) {
        subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id, {
          expand: ["default_payment_method", "items.data.price.product"],
        })
      } else {
        // Fallback: Find subscription by customer ID (in case webhook missed)
        // First get the subscription ID, then retrieve with full expand (Stripe limits expand to 4 levels)
        const subscriptions = await stripe.subscriptions.list({
          customer: org.stripe_customer_id,
          status: "all",
          limit: 1,
        })
        if (subscriptions.data.length > 0) {
          // Retrieve the subscription with full expand (4 levels max)
          subscription = await stripe.subscriptions.retrieve(subscriptions.data[0].id, {
            expand: ["default_payment_method", "items.data.price.product"],
          })
          console.log("[v0] Found subscription by customer ID (webhook may have missed):", subscription.id)
        }
      }
    } catch (subError: unknown) {
      const errorMessage = subError instanceof Error ? subError.message : "Unknown error"
      console.error("[v0] Error fetching subscription:", errorMessage)
    }

    if (subscription) {
      try {
        const priceItem = subscription.items.data[0]?.price
        const product = priceItem?.product

        // Validate priceItem exists before using it
        if (!priceItem) {
          console.warn("[v0] Subscription has no price item, using org defaults")
        }

        // Get plan info from Stripe price/product (single source of truth)
        // Use same logic as webhook: plan_id metadata OR lowercase product name
        // Note: product could be null (typeof null === "object" in JS), so check both
        // Also check for deleted products which don't have metadata/name
        const isValidProduct = product && typeof product === "object" && !("deleted" in product && product.deleted)
        const productData = isValidProduct ? product as { metadata?: Record<string, string>; name: string } : null
        const plan = {
          id: productData
            ? (productData.metadata?.plan_id || productData.name.toLowerCase().replace(/\s+/g, "_"))
            : org.plan,
          name: productData ? productData.name : org.plan.charAt(0).toUpperCase() + org.plan.slice(1),
          price: (priceItem?.unit_amount || 0) / 100,
          currency: priceItem?.currency?.toUpperCase() || "USD",
          interval: priceItem?.recurring?.interval || "month",
        }

        // Cast subscription to access current_period fields (they exist on expanded subscription)
        const subData = subscription as typeof subscription & {
          current_period_start?: number
          current_period_end?: number
        }

        billingInfo.subscription = {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: subData.current_period_start ? new Date(subData.current_period_start * 1000) : new Date(),
          currentPeriodEnd: subData.current_period_end ? new Date(subData.current_period_end * 1000) : new Date(),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
          plan: {
            id: plan.id,
            name: plan.name,
            price: plan.price,
            currency: plan.currency,
            interval: plan.interval,
          },
        }

        // Get payment method
        if (subscription.default_payment_method && typeof subscription.default_payment_method === "object") {
          const pm = subscription.default_payment_method
          if (pm.card) {
            billingInfo.paymentMethod = {
              brand: pm.card.brand || "unknown",
              last4: pm.card.last4 || "****",
              expMonth: pm.card.exp_month || 0,
              expYear: pm.card.exp_year || 0,
            }
          }
        }
      } catch (subError: unknown) {
        const errorMessage = subError instanceof Error ? subError.message : "Unknown error"
        console.error("[v0] Error fetching subscription:", errorMessage)
      }
    }

    // Fetch invoices
    try {
      const invoices = await stripe.invoices.list({
        customer: org.stripe_customer_id,
        limit: 12,
      })

      billingInfo.invoices = invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status || "unknown",
        amountPaid: inv.amount_paid / 100,
        amountDue: inv.amount_due / 100,
        currency: inv.currency.toUpperCase(),
        created: new Date(inv.created * 1000),
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        invoicePdf: inv.invoice_pdf ?? null,
      }))
    } catch (invError: unknown) {
      const errorMessage = invError instanceof Error ? invError.message : "Unknown error"
      console.error("[v0] Error fetching invoices:", errorMessage)
    }

    return { data: billingInfo, error: null }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch billing info"
    console.error("[v0] getBillingInfo error:", error)
    return { data: null, error: errorMessage }
  }
}

// Note: cancelSubscription and resumeSubscription removed - Stripe Billing Portal handles these

export async function createBillingPortalSession(orgSlug: string): Promise<{ url: string | null; error: string | null }> {
  try {
    // Validate orgSlug format (prevent path traversal/injection)
    if (!isValidOrgSlug(orgSlug)) {
      console.error("[v0] Invalid org slug format in createBillingPortalSession")
      return { url: null, error: "Invalid organization" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { url: null, error: "Unauthorized" }
    }

    // Get organization
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, stripe_customer_id")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { url: null, error: "Organization not found" }
    }

    // Verify user is owner
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (membership?.role !== "owner") {
      return { url: null, error: "Only the owner can access billing portal" }
    }

    if (!org.stripe_customer_id) {
      return { url: null, error: "No billing account found. Please subscribe first." }
    }

    let origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_APP_URL

    // Require valid origin in non-development environments
    if (!origin) {
      if (process.env.NODE_ENV === "development") {
        origin = "http://localhost:3000"
      } else {
        console.error("[v0] No origin or NEXT_PUBLIC_APP_URL configured")
        return { url: null, error: "Application URL not configured. Please contact support." }
      }
    }

    if (origin.includes(",")) {
      origin = origin.split(",")[0].trim()
    }
    origin = origin.trim().replace(/\/+$/, "")

    // Stripe billing portal sessions expire after 24 hours by default.
    // The idempotency key changes every minute to allow generating new sessions.
    // If a user bookmarks the portal URL, it will expire and they need to click again.
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: org.stripe_customer_id,
        return_url: `${origin}/${orgSlug}/billing`,
      },
      {
        idempotencyKey: `portal_${org.id}_${Math.floor(Date.now() / 60000)}`, // New key every minute
      }
    )

    // Validate that the session URL was generated
    if (!session.url) {
      console.error("[v0] Billing portal session created but no URL returned")
      return { url: null, error: "Failed to create billing portal session. Please try again." }
    }

    console.log("[v0] Billing portal session created:", session.id)
    return { url: session.url, error: null }
  } catch (error: unknown) {
    console.error("[v0] createBillingPortalSession error:", error)
    return { url: null, error: "Unable to access billing portal. Please try again or contact support if the issue persists." }
  }
}

export interface PlanChangeResult {
  success: boolean
  subscription: {
    id: string
    status: string
    plan: {
      id: string
      name: string
      price: number
      interval: string
    }
    currentPeriodEnd: Date
  } | null
  error: string | null
  // Sync warning - set if backend sync failed but plan change succeeded
  syncWarning?: string | null
  // True if sync was queued for retry
  syncQueued?: boolean
}

/**
 * Change subscription plan directly (upgrade or downgrade)
 * Uses Stripe's subscription.update API with proration
 */
export async function changeSubscriptionPlan(
  orgSlug: string,
  newPriceId: string
): Promise<PlanChangeResult> {
  try {
    // Validate orgSlug format (prevent path traversal/injection)
    if (!isValidOrgSlug(orgSlug)) {
      console.error("[v0] Invalid org slug format in changeSubscriptionPlan")
      return { success: false, subscription: null, error: "Invalid organization" }
    }

    console.log("[v0] Changing subscription plan for org:", orgSlug)

    // Validate price ID format
    if (!isValidStripePriceId(newPriceId)) {
      return { success: false, subscription: null, error: "Invalid plan selected" }
    }

    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, subscription: null, error: "Unauthorized" }
    }

    // Get organization with Stripe info and current plan for audit
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, stripe_customer_id, stripe_subscription_id, plan, stripe_price_id")
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      console.error("[v0] Failed to find organization:", orgSlug, "Error:", orgError?.message || "No org returned")
      return { success: false, subscription: null, error: "Organization not found" }
    }

    // Verify user is owner
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (membership?.role !== "owner") {
      return { success: false, subscription: null, error: "Only the owner can change plans" }
    }

    if (!org.stripe_subscription_id) {
      return { success: false, subscription: null, error: "No active subscription found" }
    }

    // Get current subscription to find the subscription item ID
    const currentSubscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
    const subscriptionItemId = currentSubscription.items.data[0]?.id

    if (!subscriptionItemId) {
      return { success: false, subscription: null, error: "Subscription item not found" }
    }

    // Generate idempotency key to prevent duplicate plan changes
    const idempotencyKey = `plan_change_${org.id}_${newPriceId}`

    // ============================================
    // DOWNGRADE ELIGIBILITY CHECK
    // ============================================
    // Fetch new plan details to check limits
    const newPrice = await stripe.prices.retrieve(newPriceId, {
      expand: ["product"]
    })

    const newProduct = newPrice.product as Stripe.Product
    const newPlanLimits = {
      max_team_members: parseInt(newProduct.metadata?.max_team_members || "2", 10)
    }

    // Check Seat Limit
    const { count: memberCount, error: countError } = await adminClient
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "active")

    if (countError) {
      console.error("[v0] Failed to count members for downgrade check:", countError)
      // Fail safe: don't block if we can't check, but log error
    } else if (memberCount !== null && memberCount > newPlanLimits.max_team_members) {
      return {
        success: false,
        subscription: null,
        error: `Cannot downgrade: Your team has ${memberCount} active members, but the new plan only allows ${newPlanLimits.max_team_members}. Please remove members first.`
      }
    }

    // Update the subscription with the new price
    // proration_behavior: 'create_prorations' will charge/credit the difference
    const updatedSubscription = await stripe.subscriptions.update(
      org.stripe_subscription_id,
      {
        items: [
          {
            id: subscriptionItemId,
            price: newPriceId,
          },
        ],
        proration_behavior: "create_prorations",
        expand: ["items.data.price.product"],
      },
      { idempotencyKey }
    )

    console.log("[v0] Subscription updated successfully:", updatedSubscription.id)

    // Get the new plan details from the updated subscription
    const priceItem = updatedSubscription.items.data[0]?.price
    const product = priceItem?.product

    // Type guard: check product is an object and not deleted
    const isValidProduct = typeof product === "object" && product !== null && !("deleted" in product && product.deleted)

    // Extract plan info from Stripe (source of truth)
    const planId = isValidProduct
      ? ((product as Stripe.Product).metadata?.plan_id || (product as Stripe.Product).name.toLowerCase().replace(/\s+/g, "_"))
      : "unknown"
    const planName = isValidProduct ? (product as Stripe.Product).name : "Unknown"
    const planPrice = (priceItem?.unit_amount || 0) / 100
    const planInterval = priceItem?.recurring?.interval || "month"

    // Get limits from Stripe product metadata
    const metadata = isValidProduct ? (product as Stripe.Product).metadata || {} : {}

    if (!metadata.teamMembers || !metadata.providers || !metadata.pipelinesPerDay) {
      console.error("[v0] New plan missing required metadata")
      return { success: false, subscription: null, error: "Plan configuration error. Please contact support." }
    }

    const limits = {
      seat_limit: safeParseInt(metadata.teamMembers, 2),
      providers_limit: safeParseInt(metadata.providers, 3),
      pipelines_per_day_limit: safeParseInt(metadata.pipelinesPerDay, 6),
      concurrent_pipelines_limit: safeParseInt(metadata.concurrentPipelines, 2), // Default to 2 if not set
    }

    // Validate limits are reasonable (sanity check - both lower and upper bounds)
    if (
      limits.seat_limit < 1 || limits.seat_limit > 1000 ||
      limits.providers_limit < 1 || limits.providers_limit > 100 ||
      limits.pipelines_per_day_limit < 1 || limits.pipelines_per_day_limit > 10000 ||
      limits.concurrent_pipelines_limit < 1 || limits.concurrent_pipelines_limit > 50
    ) {
      console.error("[v0] Plan limits outside valid bounds", limits)
      return { success: false, subscription: null, error: "Plan configuration error. Please contact support." }
    }

    // Update database immediately (don't wait for webhook)
    // Note: In newer Stripe API, current_period_* moved to subscription items
    const subscriptionItem = updatedSubscription.items.data[0]
    const periodStart = subscriptionItem?.current_period_start ?? Math.floor(Date.now() / 1000)
    const periodEnd = subscriptionItem?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

    const { error: updateError } = await adminClient
      .from("organizations")
      .update({
        plan: planId,
        stripe_price_id: newPriceId,
        billing_status: updatedSubscription.status,
        current_period_start: new Date(periodStart * 1000).toISOString(),
        current_period_end: new Date(periodEnd * 1000).toISOString(),
        ...limits,
      })
      .eq("id", org.id)

    if (updateError) {
      console.error("[v0] Failed to update database:", updateError)
      // Don't fail the whole operation - Stripe is updated, webhook will sync
    } else {
      console.log("[v0] Database updated with new plan:", planId)
    }

    // Get the old price from current subscription for comparison
    const oldPriceItem = currentSubscription.items.data[0]?.price
    const oldPrice = oldPriceItem ? (oldPriceItem.unit_amount || 0) / 100 : 0

    // Determine if this is an upgrade or downgrade based on price
    const isUpgrade = planPrice > oldPrice
    const action = isUpgrade ? 'upgrade' : 'downgrade'

    // Log plan change to audit table
    try {
      await adminClient
        .from("plan_change_audit")
        .insert({
          org_id: org.id,
          org_slug: orgSlug,
          user_id: user.id,
          action,
          old_plan: org.plan,
          new_plan: planId,
          old_price: oldPrice || null,
          new_price: planPrice,
          stripe_subscription_id: updatedSubscription.id,
          sync_status: 'pending',
          metadata: {
            new_limits: limits,
            proration_behavior: 'create_prorations',
          }
        })
      console.log(`[v0] Plan change audit logged: ${action} from ${org.plan} to ${planId}`)
    } catch (auditErr) {
      console.warn(`[v0] Failed to log plan change audit:`, auditErr)
      // Non-blocking - don't fail plan change if audit fails
    }

    // Sync subscription limits to backend BigQuery immediately
    // This ensures the backend is updated even if webhooks are delayed
    let syncWarning: string | null = null
    let syncQueued = false

    try {
      const syncResult = await syncSubscriptionToBackend({
        orgSlug,
        orgId: org.id,
        planName: planId,
        billingStatus: updatedSubscription.status,
        trialEndsAt: updatedSubscription.trial_end
          ? new Date(updatedSubscription.trial_end * 1000).toISOString()
          : undefined,
        dailyLimit: limits.pipelines_per_day_limit,
        monthlyLimit: limits.pipelines_per_day_limit * 30,
        seatLimit: limits.seat_limit,
        providersLimit: limits.providers_limit,
        syncType: 'plan_change',
      })

      if (syncResult.success) {
        console.log(`[v0] Backend subscription synced for org: ${orgSlug}`)
        // Update audit log with sync success
        await adminClient
          .from("plan_change_audit")
          .update({ sync_status: 'synced' })
          .eq("org_id", org.id)
          .eq("stripe_subscription_id", updatedSubscription.id)
          .is("sync_status", 'pending')
      } else {
        console.warn(`[v0] Backend sync failed for org ${orgSlug}: ${syncResult.error}`)
        syncWarning = syncResult.error || "Backend sync failed"
        syncQueued = syncResult.queued || false

        // Update audit log with sync failure
        await adminClient
          .from("plan_change_audit")
          .update({
            sync_status: syncQueued ? 'pending' : 'failed',
            sync_error: syncResult.error
          })
          .eq("org_id", org.id)
          .eq("stripe_subscription_id", updatedSubscription.id)
      }
    } catch (syncErr: unknown) {
      const errorMessage = syncErr instanceof Error ? syncErr.message : "Backend sync error"
      console.error(`[v0] Backend sync error for org ${orgSlug}:`, syncErr)
      syncWarning = errorMessage
      // Non-blocking - don't fail the plan change if backend sync fails
    }

    return {
      success: true,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        plan: {
          id: planId,
          name: planName,
          price: planPrice,
          interval: planInterval,
        },
        currentPeriodEnd: new Date(periodEnd * 1000),
      },
      error: null,
      // NEW: Include sync warning so UI can show appropriate message
      syncWarning: syncWarning,
      syncQueued: syncQueued,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to change plan"
    console.error("[v0] changeSubscriptionPlan error:", error)
    return { success: false, subscription: null, error: errorMessage }
  }
}

export interface DynamicPlan {
  id: string
  name: string
  description: string
  priceId: string
  price: number
  currency: string
  interval: "month" | "year"
  features: string[]
  limits: {
    teamMembers: number
    providers: number
    pipelinesPerDay: number
  }
  trialDays: number
  metadata?: Record<string, string>
}

/**
 * Fetch subscription plans dynamically from Stripe
 *
 * Stripe Product metadata should include:
 * - features: "Feature 1|Feature 2|Feature 3" (pipe-separated)
 * - teamMembers: "2"
 * - providers: "3"
 * - pipelinesPerDay: "6"
 * - order: "1" (for sorting, lower = first)
 */
export async function getStripePlans(): Promise<{ data: DynamicPlan[] | null; error: string | null }> {
  try {
    // Fetch all active products with their prices
    const products = await stripe.products.list({
      active: true,
      expand: ["data.default_price"],
    })

    // Fetch all active prices for subscription products
    const prices = await stripe.prices.list({
      active: true,
      type: "recurring",
      expand: ["data.product"],
    })

    // Build plans from Stripe data
    const plans: DynamicPlan[] = []

    for (const price of prices.data) {
      // Skip if product is not expanded or inactive
      if (typeof price.product === "string") continue
      const product = price.product

      // Skip if product is deleted (DeletedProduct type)
      if ("deleted" in product && product.deleted) continue

      // Now TypeScript knows product is Stripe.Product
      const stripeProduct = product as Stripe.Product
      if (!stripeProduct.active) continue

      // Parse metadata
      const metadata = stripeProduct.metadata || {}
      const features = metadata.features?.split("|").map(f => f.trim()).filter(Boolean) || []

      // Skip products without required metadata
      if (!metadata.teamMembers || !metadata.providers || !metadata.pipelinesPerDay) {
        console.warn(`[v0] Skipping product ${stripeProduct.name}: missing required metadata (teamMembers, providers, pipelinesPerDay)`)
        continue
      }

      const limits = {
        teamMembers: safeParseInt(metadata.teamMembers, 2),
        providers: safeParseInt(metadata.providers, 3),
        pipelinesPerDay: safeParseInt(metadata.pipelinesPerDay, 6),
      }

      // Skip plans with invalid limits
      if (limits.teamMembers <= 0 || limits.providers <= 0 || limits.pipelinesPerDay <= 0) {
        console.warn(`[v0] Skipping product ${stripeProduct.name}: invalid limit values`)
        continue
      }

      // Derive plan ID from metadata or product name
      // Must match backend enum: starter, professional, scale, enterprise
      let planId = stripeProduct.metadata?.plan_id
      if (!planId) {
        // Extract plan name from product name (e.g., "Professional Plan" -> "professional")
        const name = stripeProduct.name.toLowerCase()
        if (name.includes("starter")) planId = "starter"
        else if (name.includes("professional")) planId = "professional"
        else if (name.includes("scale")) planId = "scale"
        else if (name.includes("enterprise")) planId = "enterprise"
        else planId = name.replace(/\s+/g, "_") // fallback to snake_case
      }

      const plan: DynamicPlan = {
        id: planId,
        name: stripeProduct.name,
        description: stripeProduct.description || "",
        priceId: price.id,
        price: (price.unit_amount || 0) / 100, // Convert from cents
        currency: price.currency.toUpperCase(), // Get currency from Stripe price
        interval: price.recurring?.interval === "year" ? "year" : "month",
        features,
        limits,
        trialDays: price.recurring?.trial_period_days || DEFAULT_TRIAL_DAYS,
        metadata: stripeProduct.metadata,
      }

      plans.push(plan)
    }

    // Sort by order metadata, then by price
    plans.sort((a, b) => {
      const orderA = parseInt(products.data.find(p => p.name === a.name)?.metadata?.order || "0", 10)
      const orderB = parseInt(products.data.find(p => p.name === b.name)?.metadata?.order || "0", 10)
      if (orderA !== orderB && orderA > 0 && orderB > 0) return orderA - orderB
      return a.price - b.price
    })

    return { data: plans, error: null }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch plans"
    console.error("[v0] getStripePlans error:", error)
    return { data: null, error: errorMessage }
  }
}
