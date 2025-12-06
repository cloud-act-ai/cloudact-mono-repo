"use server"

/**
 * Subscription Providers Server Actions
 *
 * Actions for managing SaaS subscription providers:
 * - Supabase: saas_subscription_providers_meta (which providers are enabled)
 * - API Service: BigQuery plans (seeded + custom plans)
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { logError } from "@/lib/utils"
import { getOrgApiKeySecure } from "@/actions/backend-onboarding"

// ============================================
// API Config
// ============================================

function getApiServiceUrl(): string {
  const url = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
  if (!url) {
    throw new Error("API_SERVICE_URL is not configured")
  }
  return url
}

/**
 * Safely parse JSON response with error handling
 */
async function safeJsonParse<T>(response: Response, fallback: T): Promise<T> {
  try {
    const text = await response.text()
    if (!text || text.trim() === "") {
      return fallback
    }
    return JSON.parse(text) as T
  } catch (error) {
    console.warn("Failed to parse JSON response:", error)
    return fallback
  }
}

// ============================================
// Auth Helpers
// ============================================

const isValidOrgSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

/**
 * Validate provider name
 * - Must be 2-50 characters
 * - Only lowercase alphanumeric and underscores
 * - Cannot start or end with underscore
 * Note: Currently unused but available for validation if needed
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isValidProviderName = (provider: string): boolean => {
  if (!provider || typeof provider !== "string") return false
  const normalized = provider.toLowerCase().trim()
  // Allow 2-50 chars, alphanumeric and underscore, no leading/trailing underscore
  return /^[a-z0-9][a-z0-9_]{0,48}[a-z0-9]$/.test(normalized) || /^[a-z0-9]{2}$/.test(normalized)
}

/**
 * Sanitize provider name - convert to safe format
 */
const sanitizeProviderName = (provider: string): string => {
  return provider
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")  // Replace invalid chars with underscore
    .replace(/^_+|_+$/g, "")       // Remove leading/trailing underscores
    .replace(/_+/g, "_")           // Collapse multiple underscores
    .slice(0, 50)                  // Limit length
}

interface AuthResult {
  user: { id: string; user_metadata?: Record<string, unknown> }
  orgId: string
  role: string
}

async function requireOrgMembership(orgSlug: string): Promise<AuthResult> {
  if (!isValidOrgSlug(orgSlug)) {
    throw new Error("Invalid organization slug")
  }

  const supabase = await createClient()
  const adminClient = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error("Not authenticated")
  }

  const { data: org, error: orgError } = await adminClient
    .from("organizations")
    .select("id")
    .eq("org_slug", orgSlug)
    .single()

  if (orgError) {
    if (orgError.code === "PGRST116") {
      throw new Error("Organization not found")
    }
    throw new Error(`Database error: ${orgError.message}`)
  }

  if (!org) {
    throw new Error("Organization not found")
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (membershipError && membershipError.code !== "PGRST116") {
    throw new Error(`Database error: ${membershipError.message}`)
  }

  if (!membership) {
    throw new Error("Not a member of this organization")
  }

  return { user, orgId: org.id, role: membership.role }
}

async function requireRole(orgSlug: string, requiredRole: string): Promise<AuthResult> {
  const result = await requireOrgMembership(orgSlug)

  const roleHierarchy: Record<string, number> = {
    owner: 3,
    admin: 2,
    collaborator: 1,
    read_only: 0,
  }

  const userLevel = roleHierarchy[result.role] ?? 0
  const requiredLevel = roleHierarchy[requiredRole] ?? 0

  if (userLevel < requiredLevel) {
    throw new Error(`Requires ${requiredRole} role or higher`)
  }

  return result
}

// ============================================
// Types
// ============================================

export interface ProviderMeta {
  id: string
  org_id: string
  provider_name: string
  is_enabled: boolean
  enabled_at: string
  created_at: string
  updated_at: string
}

export interface ProviderInfo {
  provider: string
  display_name: string
  category: string
  is_enabled: boolean
  plan_count: number
}

export interface SubscriptionPlan {
  subscription_id: string
  provider: string
  plan_name: string
  display_name?: string
  is_custom: boolean
  quantity: number
  unit_price_usd: number
  effective_date?: string
  end_date?: string
  is_enabled: boolean
  billing_period: string
  category: string
  notes?: string
  daily_limit?: number
  monthly_limit?: number
  storage_limit_gb?: number
  yearly_price_usd?: number
  yearly_discount_pct?: number
  seats: number
  created_at?: string
  updated_at?: string
}

export interface PlanCreate {
  plan_name: string
  display_name?: string
  quantity?: number
  unit_price_usd: number
  billing_period?: string
  notes?: string
  daily_limit?: number
  monthly_limit?: number
  yearly_price_usd?: number
  yearly_discount_pct?: number
  seats?: number
}

export interface PlanUpdate {
  display_name?: string
  quantity?: number
  unit_price_usd?: number
  is_enabled?: boolean
  billing_period?: string
  notes?: string
  daily_limit?: number
  monthly_limit?: number
  yearly_price_usd?: number
  yearly_discount_pct?: number
  seats?: number
}

// ============================================
// Provider Display Names & Categories
// ============================================

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  chatgpt_plus: "ChatGPT Plus",
  claude_pro: "Claude Pro",
  gemini_advanced: "Gemini Advanced",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
  windsurf: "Windsurf",
  replit: "Replit",
  v0: "v0",
  lovable: "Lovable",
  canva: "Canva",
  adobe_cc: "Adobe Creative Cloud",
  figma: "Figma",
  miro: "Miro",
  notion: "Notion",
  confluence: "Confluence",
  asana: "Asana",
  monday: "Monday.com",
  slack: "Slack",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  supabase: "Supabase",
  custom: "Custom",
}

const PROVIDER_CATEGORIES: Record<string, string[]> = {
  ai: ["chatgpt_plus", "claude_pro", "gemini_advanced", "copilot", "cursor", "windsurf", "replit", "v0", "lovable"],
  design: ["canva", "adobe_cc", "figma", "miro"],
  productivity: ["notion", "confluence", "asana", "monday"],
  communication: ["slack", "zoom", "teams"],
  development: ["github", "gitlab", "jira", "linear", "vercel", "netlify", "railway", "supabase"],
}

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

function getProviderCategory(provider: string): string {
  for (const [category, providers] of Object.entries(PROVIDER_CATEGORIES)) {
    if (providers.includes(provider)) {
      return category
    }
  }
  return "other"
}

// ============================================
// Supabase Actions (Meta Table)
// ============================================

/**
 * List all enabled providers for an org from Supabase meta table
 */
export async function listEnabledProviders(orgSlug: string): Promise<{
  success: boolean
  providers: ProviderMeta[]
  error?: string
}> {
  try {
    const { orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("saas_subscription_providers_meta")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_enabled", true)
      .order("provider_name")

    if (error) {
      return { success: false, providers: [], error: error.message }
    }

    return { success: true, providers: data || [] }
  } catch (error) {
    return { success: false, providers: [], error: logError("listEnabledProviders", error) }
  }
}

/**
 * Get provider meta record
 */
export async function getProviderMeta(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  provider?: ProviderMeta
  error?: string
}> {
  try {
    const { orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("saas_subscription_providers_meta")
      .select("*")
      .eq("org_id", orgId)
      .eq("provider_name", provider.toLowerCase())
      .single()

    if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
      return { success: false, error: error.message }
    }

    return { success: true, provider: data || undefined }
  } catch (error) {
    return { success: false, error: logError("getProviderMeta", error) }
  }
}

/**
 * Enable a provider - inserts to meta table and calls API to seed plans
 */
export async function enableProvider(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans_seeded: number
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, plans_seeded: 0, error: "Invalid provider name" }
    }

    const { orgId } = await requireRole(orgSlug, "admin")
    const supabase = await createClient()

    // 1. Upsert to Supabase meta table
    const { error: metaError } = await supabase
      .from("saas_subscription_providers_meta")
      .upsert(
        {
          org_id: orgId,
          provider_name: sanitizedProvider,
          is_enabled: true,
          enabled_at: new Date().toISOString(),
        },
        { onConflict: "org_id,provider_name" }
      )

    if (metaError) {
      return { success: false, plans_seeded: 0, error: metaError.message }
    }

    // 2. Call API to seed default plans
    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      // If no API key, just enable the provider without seeding
      return {
        success: true,
        plans_seeded: 0,
        error: "Provider enabled but no API key found - plans not seeded"
      }
    }

    try {
      const apiUrl = getApiServiceUrl()
      const response = await fetch(
        `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/enable`,
        {
          method: "POST",
          headers: {
            "X-API-Key": orgApiKey,
            "Content-Type": "application/json",
          },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false, // API call failed - return failure
          plans_seeded: 0,
          error: `Failed to enable provider: ${errorText}`
        }
      }

      const result = await safeJsonParse<{ plans_seeded?: number }>(response, { plans_seeded: 0 })
      return {
        success: true,
        plans_seeded: result.plans_seeded || 0,
      }
    } catch (apiError) {
      // API call failed - return failure
      const errorMessage = apiError instanceof Error ? apiError.message : String(apiError)
      return {
        success: false,
        plans_seeded: 0,
        error: `Failed to enable provider: ${errorMessage}`
      }
    }
  } catch (error) {
    return { success: false, plans_seeded: 0, error: logError("enableProvider", error) }
  }
}

/**
 * Disable a provider - updates meta table first, then deletes plans
 */
export async function disableProvider(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans_deleted?: number
  error?: string
  partial_failure?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    const { orgId } = await requireRole(orgSlug, "admin")
    const supabase = await createClient()

    // Step 1: Disable provider in Supabase meta table FIRST
    const { error: metaError } = await supabase
      .from("saas_subscription_providers_meta")
      .update({ is_enabled: false })
      .eq("org_id", orgId)
      .eq("provider_name", sanitizedProvider)

    if (metaError) {
      return { success: false, error: `Failed to update provider status: ${metaError.message}` }
    }

    // Step 2: Delete all plans for this provider from BigQuery (only if Supabase succeeded)
    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    let plansDeleted = 0
    const failures: string[] = []

    if (orgApiKey) {
      try {
        const apiUrl = getApiServiceUrl()

        // Get all plans for this provider
        const plansResponse = await fetch(
          `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans`,
          {
            headers: { "X-API-Key": orgApiKey },
          }
        )

        if (plansResponse.ok) {
          const plansResult = await safeJsonParse<{ plans?: SubscriptionPlan[] }>(
            plansResponse,
            { plans: [] }
          )
          const plans = plansResult.plans || []

          // Delete each plan
          for (const plan of plans) {
            try {
              const deleteResponse = await fetch(
                `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${plan.subscription_id}`,
                {
                  method: "DELETE",
                  headers: { "X-API-Key": orgApiKey },
                }
              )
              if (deleteResponse.ok) {
                plansDeleted++
              } else {
                const errorText = await deleteResponse.text()
                console.warn(`Failed to delete plan ${plan.subscription_id}: ${errorText}`)
                failures.push(plan.subscription_id)
              }
            } catch (deleteError) {
              console.warn(`Error deleting plan ${plan.subscription_id}:`, deleteError)
              failures.push(plan.subscription_id)
            }
          }

          // Check for partial failures
          if (failures.length > 0 && failures.length < plans.length) {
            return {
              success: true,
              plans_deleted: plansDeleted,
              partial_failure: `${failures.length} of ${plans.length} plans failed to delete`
            }
          }

          // Check for complete failure
          if (failures.length === plans.length && plans.length > 0) {
            return {
              success: true, // Provider is still disabled in Supabase
              plans_deleted: 0,
              error: `Provider disabled but failed to delete all ${plans.length} plans`
            }
          }
        }
      } catch (apiError) {
        console.warn("Failed to delete plans:", apiError)
        return {
          success: true, // Provider is still disabled in Supabase
          plans_deleted: 0,
          error: `Provider disabled but failed to delete plans: ${apiError instanceof Error ? apiError.message : String(apiError)}`
        }
      }
    }

    return {
      success: true,
      plans_deleted: plansDeleted,
    }
  } catch (error) {
    return { success: false, error: logError("disableProvider", error) }
  }
}

// ============================================
// API Service Actions (BigQuery Plans)
// ============================================

/**
 * Get all available providers with their enabled status and plan counts
 */
export async function getAllProviders(orgSlug: string): Promise<{
  success: boolean
  providers: ProviderInfo[]
  error?: string
}> {
  try {
    const { orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    // Get enabled providers from meta table
    const { data: metaData } = await supabase
      .from("saas_subscription_providers_meta")
      .select("provider_name, is_enabled")
      .eq("org_id", orgId)

    const enabledMap = new Map<string, boolean>()
    if (metaData) {
      metaData.forEach(m => enabledMap.set(m.provider_name, m.is_enabled))
    }

    // Get plan counts from API if available
    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    const planCounts = new Map<string, number>()

    if (orgApiKey) {
      try {
        const apiUrl = getApiServiceUrl()
        const response = await fetch(
          `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers`,
          {
            headers: { "X-API-Key": orgApiKey },
          }
        )

        if (response.ok) {
          const result = await safeJsonParse<{ providers?: ProviderInfo[] }>(response, { providers: [] })
          result.providers?.forEach((p: ProviderInfo) => {
            planCounts.set(p.provider, p.plan_count)
          })
        }
      } catch (apiError) {
        console.warn("Failed to get plan counts from API:", apiError)
      }
    }

    // Build full provider list
    const allProviders = Object.keys(PROVIDER_DISPLAY_NAMES).filter(p => p !== "custom")
    const providers: ProviderInfo[] = allProviders.map(provider => ({
      provider,
      display_name: getProviderDisplayName(provider),
      category: getProviderCategory(provider),
      is_enabled: enabledMap.get(provider) ?? false,
      plan_count: planCounts.get(provider) ?? 0,
    }))

    // Sort by category, then by name
    providers.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.display_name.localeCompare(b.display_name)
    })

    return { success: true, providers }
  } catch (error) {
    return { success: false, providers: [], error: logError("getAllProviders", error) }
  }
}

/**
 * Get plans for a provider from BigQuery via API
 */
export async function getProviderPlans(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans: SubscriptionPlan[]
  total_monthly_cost: number
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, plans: [], total_monthly_cost: 0, error: "Invalid provider name" }
    }

    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        plans: [],
        total_monthly_cost: 0,
        error: "Organization API key not found"
      }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetch(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans`,
      {
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        plans: [],
        total_monthly_cost: 0,
        error: `Failed to get plans: ${errorText}`
      }
    }

    const result = await safeJsonParse<{ plans?: SubscriptionPlan[]; total_monthly_cost?: number }>(
      response,
      { plans: [], total_monthly_cost: 0 }
    )
    return {
      success: true,
      plans: result.plans || [],
      total_monthly_cost: result.total_monthly_cost || 0,
    }
  } catch (error) {
    return {
      success: false,
      plans: [],
      total_monthly_cost: 0,
      error: logError("getProviderPlans", error)
    }
  }
}

/**
 * Get all plans across all enabled providers for the Costs dashboard
 * Uses single API call to /all-plans endpoint to avoid N+1 queries
 */
export async function getAllPlansForCostDashboard(orgSlug: string): Promise<{
  success: boolean
  plans: (SubscriptionPlan & { provider_name: string })[]
  summary: {
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  }
  error?: string
}> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        plans: [],
        summary: {
          total_monthly_cost: 0,
          total_annual_cost: 0,
          count_by_category: {},
          enabled_count: 0,
          total_count: 0,
        },
        error: "Organization API key not found. Please complete organization onboarding.",
      }
    }

    // Use the new all-plans endpoint for a single API call
    const apiUrl = getApiServiceUrl()
    const response = await fetch(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/all-plans`,
      {
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      // If 404 or table doesn't exist yet, return empty success
      if (response.status === 404) {
        return {
          success: true,
          plans: [],
          summary: {
            total_monthly_cost: 0,
            total_annual_cost: 0,
            count_by_category: {},
            enabled_count: 0,
            total_count: 0,
          },
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        plans: [],
        summary: {
          total_monthly_cost: 0,
          total_annual_cost: 0,
          count_by_category: {},
          enabled_count: 0,
          total_count: 0,
        },
        error: `Failed to fetch plans: ${errorText}`,
      }
    }

    interface AllPlansResult {
      plans?: SubscriptionPlan[]
      summary?: {
        total_monthly_cost: number
        total_annual_cost: number
        count_by_category: Record<string, number>
        enabled_count: number
        total_count: number
      }
    }
    const result = await safeJsonParse<AllPlansResult>(response, { plans: [], summary: undefined })

    // Add provider_name to each plan (it's in the provider field)
    const plansWithProviderName = (result.plans || []).map((plan: SubscriptionPlan) => ({
      ...plan,
      provider_name: plan.provider,
    }))

    return {
      success: true,
      plans: plansWithProviderName,
      summary: result.summary || {
        total_monthly_cost: 0,
        total_annual_cost: 0,
        count_by_category: {},
        enabled_count: 0,
        total_count: 0,
      },
    }
  } catch (error) {
    return {
      success: false,
      plans: [],
      summary: {
        total_monthly_cost: 0,
        total_annual_cost: 0,
        count_by_category: {},
        enabled_count: 0,
        total_count: 0,
      },
      error: logError("getAllPlansForCostDashboard", error),
    }
  }
}

/**
 * Create a custom plan
 */
export async function createCustomPlan(
  orgSlug: string,
  provider: string,
  plan: PlanCreate
): Promise<{
  success: boolean
  plan?: SubscriptionPlan
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetch(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(plan),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create plan: ${errorText}` }
    }

    const result = await safeJsonParse<{ plan?: SubscriptionPlan }>(response, { plan: undefined })
    return { success: true, plan: result.plan }
  } catch (error) {
    return { success: false, error: logError("createCustomPlan", error) }
  }
}

/**
 * Update a plan
 */
export async function updatePlan(
  orgSlug: string,
  provider: string,
  subscriptionId: string,
  updates: PlanUpdate
): Promise<{
  success: boolean
  plan?: SubscriptionPlan
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Validate subscription ID
    if (!subscriptionId || typeof subscriptionId !== "string" || subscriptionId.trim().length < 1) {
      return { success: false, error: "Invalid subscription ID" }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetch(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${subscriptionId}`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to update plan: ${errorText}` }
    }

    const result = await safeJsonParse<{ plan?: SubscriptionPlan }>(response, { plan: undefined })
    return { success: true, plan: result.plan }
  } catch (error) {
    return { success: false, error: logError("updatePlan", error) }
  }
}

/**
 * Toggle plan enabled/disabled
 */
export async function togglePlan(
  orgSlug: string,
  provider: string,
  subscriptionId: string,
  enabled: boolean
): Promise<{
  success: boolean
  error?: string
}> {
  const result = await updatePlan(orgSlug, provider, subscriptionId, { is_enabled: enabled })
  return { success: result.success, error: result.error }
}

/**
 * Delete a plan
 */
export async function deletePlan(
  orgSlug: string,
  provider: string,
  subscriptionId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Validate subscription ID
    if (!subscriptionId || typeof subscriptionId !== "string" || subscriptionId.trim().length < 1) {
      return { success: false, error: "Invalid subscription ID" }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetch(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${subscriptionId}`,
      {
        method: "DELETE",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to delete plan: ${errorText}` }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: logError("deletePlan", error) }
  }
}

/**
 * Reset provider to default plans
 */
export async function resetProvider(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans_seeded: number
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, plans_seeded: 0, error: "Invalid provider name" }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, plans_seeded: 0, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetch(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/reset`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, plans_seeded: 0, error: `Failed to reset: ${errorText}` }
    }

    const result = await safeJsonParse<{ plans_seeded?: number }>(response, { plans_seeded: 0 })
    return { success: true, plans_seeded: result.plans_seeded || 0 }
  } catch (error) {
    return { success: false, plans_seeded: 0, error: logError("resetProvider", error) }
  }
}
