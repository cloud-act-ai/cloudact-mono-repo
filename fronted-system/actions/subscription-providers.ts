"use server"

/**
 * Subscription Providers Server Actions
 *
 * Actions for managing SaaS subscription providers:
 * - Supabase: saas_subscription_meta (which providers are enabled)
 * - API Service: BigQuery plans (seeded + custom plans)
 */

import { createClient } from "@/lib/supabase/server"
import { requireOrgMembership, requireRole } from "@/lib/auth"
import { logError } from "@/lib/utils"
import { getPipelineBackendClient } from "@/lib/api/backend"

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
    const { user, orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("saas_subscription_meta")
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
    const { user, orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("saas_subscription_meta")
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
    const { user, orgId } = await requireRole(orgSlug, "admin")
    const supabase = await createClient()

    // 1. Upsert to Supabase meta table
    const { error: metaError } = await supabase
      .from("saas_subscription_meta")
      .upsert(
        {
          org_id: orgId,
          provider_name: provider.toLowerCase(),
          is_enabled: true,
          enabled_at: new Date().toISOString(),
        },
        { onConflict: "org_id,provider_name" }
      )

    if (metaError) {
      return { success: false, plans_seeded: 0, error: metaError.message }
    }

    // 2. Call API to seed default plans
    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    if (!orgApiKey) {
      // If no API key, just enable the provider without seeding
      return {
        success: true,
        plans_seeded: 0,
        error: "Provider enabled but no API key found - plans not seeded"
      }
    }

    try {
      const client = getPipelineBackendClient({ orgApiKey })
      const response = await fetch(
        `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider.toLowerCase()}/enable`,
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
          success: true, // Meta table was updated
          plans_seeded: 0,
          error: `Provider enabled but seeding failed: ${errorText}`
        }
      }

      const result = await response.json()
      return {
        success: true,
        plans_seeded: result.plans_seeded || 0,
      }
    } catch (apiError) {
      // Meta table was updated, but API call failed
      return {
        success: true,
        plans_seeded: 0,
        error: `Provider enabled but API call failed: ${apiError}`
      }
    }
  } catch (error) {
    return { success: false, plans_seeded: 0, error: logError("enableProvider", error) }
  }
}

/**
 * Disable a provider - updates meta table
 */
export async function disableProvider(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const { user, orgId } = await requireRole(orgSlug, "admin")
    const supabase = await createClient()

    const { error } = await supabase
      .from("saas_subscription_meta")
      .update({ is_enabled: false })
      .eq("org_id", orgId)
      .eq("provider_name", provider.toLowerCase())

    if (error) {
      return { success: false, error: error.message }
    }

    // Also call API to disable plans in BigQuery
    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    if (orgApiKey) {
      try {
        const client = getPipelineBackendClient({ orgApiKey })
        await fetch(
          `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider.toLowerCase()}/disable`,
          {
            method: "POST",
            headers: {
              "X-API-Key": orgApiKey,
              "Content-Type": "application/json",
            },
          }
        )
      } catch (apiError) {
        // Ignore API errors - meta table was updated
        console.warn("API disable call failed:", apiError)
      }
    }

    return { success: true }
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
    const { user, orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    // Get enabled providers from meta table
    const { data: metaData, error: metaError } = await supabase
      .from("saas_subscription_meta")
      .select("provider_name, is_enabled")
      .eq("org_id", orgId)

    const enabledMap = new Map<string, boolean>()
    if (metaData) {
      metaData.forEach(m => enabledMap.set(m.provider_name, m.is_enabled))
    }

    // Get plan counts from API if available
    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    let planCounts = new Map<string, number>()

    if (orgApiKey) {
      try {
        const client = getPipelineBackendClient({ orgApiKey })
        const response = await fetch(
          `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers`,
          {
            headers: { "X-API-Key": orgApiKey },
          }
        )

        if (response.ok) {
          const result = await response.json()
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
    const { user } = await requireOrgMembership(orgSlug)

    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    if (!orgApiKey) {
      return {
        success: false,
        plans: [],
        total_monthly_cost: 0,
        error: "Organization API key not found"
      }
    }

    const client = getPipelineBackendClient({ orgApiKey })
    const response = await fetch(
      `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider.toLowerCase()}/plans`,
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

    const result = await response.json()
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
    const { user } = await requireRole(orgSlug, "admin")

    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = getPipelineBackendClient({ orgApiKey })
    const response = await fetch(
      `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider.toLowerCase()}/plans`,
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

    const result = await response.json()
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
    const { user } = await requireRole(orgSlug, "admin")

    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = getPipelineBackendClient({ orgApiKey })
    const response = await fetch(
      `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider.toLowerCase()}/plans/${subscriptionId}`,
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

    const result = await response.json()
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
    const { user } = await requireRole(orgSlug, "admin")

    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const client = getPipelineBackendClient({ orgApiKey })
    const response = await fetch(
      `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider.toLowerCase()}/plans/${subscriptionId}`,
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
    const { user } = await requireRole(orgSlug, "admin")

    const orgApiKey = user.user_metadata?.org_api_keys?.[orgSlug]
    if (!orgApiKey) {
      return { success: false, plans_seeded: 0, error: "Organization API key not found" }
    }

    const client = getPipelineBackendClient({ orgApiKey })
    const response = await fetch(
      `${client.baseUrl}/api/v1/subscriptions/${orgSlug}/providers/${provider.toLowerCase()}/reset`,
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

    const result = await response.json()
    return { success: true, plans_seeded: result.plans_seeded || 0 }
  } catch (error) {
    return { success: false, plans_seeded: 0, error: logError("resetProvider", error) }
  }
}
