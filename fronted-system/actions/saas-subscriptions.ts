"use server"

/**
 * SaaS Subscription Management Server Actions
 *
 * Handles CRUD operations for SaaS subscriptions (Canva, Adobe, ChatGPT Plus, etc.)
 * These are fixed monthly/annual fee subscriptions, NOT per-usage API costs.
 *
 * Stored in Supabase (not BigQuery) since this is org metadata, not usage data.
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

// ============================================
// Types
// ============================================

export interface SaaSSubscription {
  id: string
  org_id: string
  provider_name: string // e.g., "canva", "adobe", "chatgpt_plus"
  display_name: string // e.g., "Canva Pro", "Adobe Creative Cloud"
  billing_cycle: "monthly" | "annual" | "quarterly" | "custom"
  cost_per_cycle: number // e.g., 12.99
  currency: string // e.g., "USD"
  seats?: number // Number of licenses/seats
  renewal_date?: string // Next billing date
  category?: string // e.g., "design", "productivity", "ai", "development"
  notes?: string
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface SaaSSubscriptionCreate {
  provider_name: string
  display_name: string
  billing_cycle: "monthly" | "annual" | "quarterly" | "custom"
  cost_per_cycle: number
  currency?: string
  seats?: number
  renewal_date?: string
  category?: string
  notes?: string
}

export interface SaaSSubscriptionUpdate {
  display_name?: string
  billing_cycle?: "monthly" | "annual" | "quarterly" | "custom"
  cost_per_cycle?: number
  currency?: string
  seats?: number
  renewal_date?: string
  category?: string
  notes?: string
  is_enabled?: boolean
}

// NOTE: COMMON_SAAS_PROVIDERS moved to lib/saas-providers.ts
// Server actions can only export async functions

// ============================================
// Input Validation
// ============================================

function isValidOrgSlug(orgSlug: string): boolean {
  if (!orgSlug || typeof orgSlug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)
}

// ============================================
// Authorization Helper
// ============================================

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

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("org_slug", orgSlug)
    .single()

  if (orgError || !org) {
    return { authorized: false, userId: user.id, error: "Organization not found" }
  }

  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("id, role, status")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (memberError || !membership) {
    return { authorized: false, userId: user.id, error: "Not a member of this organization" }
  }

  return { authorized: true, userId: user.id, orgId: org.id }
}

// ============================================
// CRUD Operations
// ============================================

/**
 * List all SaaS subscriptions for an organization
 */
export async function listSaaSSubscriptions(
  orgSlug: string
): Promise<{
  success: boolean
  subscriptions?: SaaSSubscription[]
  count?: number
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("saas_subscriptions")
      .select("*")
      .eq("org_id", authResult.orgId)
      .order("display_name", { ascending: true })

    if (error) {
      // Table might not exist yet
      if (error.code === "42P01") {
        return { success: true, subscriptions: [], count: 0 }
      }
      console.error("[SaaSSubscriptions] List error:", error)
      return { success: false, error: "Failed to list subscriptions" }
    }

    return {
      success: true,
      subscriptions: data as SaaSSubscription[],
      count: data?.length || 0
    }
  } catch (err: any) {
    console.error("[SaaSSubscriptions] List error:", err)
    return { success: false, error: err.message || "Failed to list subscriptions" }
  }
}

/**
 * Create a new SaaS subscription
 */
export async function createSaaSSubscription(
  orgSlug: string,
  subscription: SaaSSubscriptionCreate
): Promise<{
  success: boolean
  subscription?: SaaSSubscription
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug" }
    }

    if (!subscription.provider_name?.trim()) {
      return { success: false, error: "Provider name is required" }
    }

    if (!subscription.display_name?.trim()) {
      return { success: false, error: "Display name is required" }
    }

    if (subscription.cost_per_cycle < 0) {
      return { success: false, error: "Cost must be non-negative" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const adminClient = createServiceRoleClient()
    const { data, error } = await adminClient
      .from("saas_subscriptions")
      .insert({
        org_id: authResult.orgId,
        provider_name: subscription.provider_name.toLowerCase().replace(/\s+/g, "_"),
        display_name: subscription.display_name.trim(),
        billing_cycle: subscription.billing_cycle || "monthly",
        cost_per_cycle: subscription.cost_per_cycle,
        currency: subscription.currency || "USD",
        seats: subscription.seats,
        renewal_date: subscription.renewal_date,
        category: subscription.category,
        notes: subscription.notes,
        is_enabled: true,
      })
      .select()
      .single()

    if (error) {
      console.error("[SaaSSubscriptions] Create error:", error)
      return { success: false, error: "Failed to create subscription" }
    }

    return { success: true, subscription: data as SaaSSubscription }
  } catch (err: any) {
    console.error("[SaaSSubscriptions] Create error:", err)
    return { success: false, error: err.message || "Failed to create subscription" }
  }
}

/**
 * Update a SaaS subscription
 */
export async function updateSaaSSubscription(
  orgSlug: string,
  subscriptionId: string,
  updates: SaaSSubscriptionUpdate
): Promise<{
  success: boolean
  subscription?: SaaSSubscription
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug" }
    }

    if (!subscriptionId) {
      return { success: false, error: "Subscription ID is required" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const adminClient = createServiceRoleClient()
    const { data, error } = await adminClient
      .from("saas_subscriptions")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("org_id", authResult.orgId)
      .select()
      .single()

    if (error) {
      console.error("[SaaSSubscriptions] Update error:", error)
      return { success: false, error: "Failed to update subscription" }
    }

    return { success: true, subscription: data as SaaSSubscription }
  } catch (err: any) {
    console.error("[SaaSSubscriptions] Update error:", err)
    return { success: false, error: err.message || "Failed to update subscription" }
  }
}

/**
 * Delete a SaaS subscription
 */
export async function deleteSaaSSubscription(
  orgSlug: string,
  subscriptionId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug" }
    }

    if (!subscriptionId) {
      return { success: false, error: "Subscription ID is required" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const adminClient = createServiceRoleClient()
    const { error } = await adminClient
      .from("saas_subscriptions")
      .delete()
      .eq("id", subscriptionId)
      .eq("org_id", authResult.orgId)

    if (error) {
      console.error("[SaaSSubscriptions] Delete error:", error)
      return { success: false, error: "Failed to delete subscription" }
    }

    return { success: true }
  } catch (err: any) {
    console.error("[SaaSSubscriptions] Delete error:", err)
    return { success: false, error: err.message || "Failed to delete subscription" }
  }
}

/**
 * Toggle subscription enabled state
 */
export async function toggleSaaSSubscription(
  orgSlug: string,
  subscriptionId: string,
  enabled: boolean
): Promise<{
  success: boolean
  enabled?: boolean
  error?: string
}> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization slug" }
    }

    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return { success: false, error: authResult.error || "Not authorized" }
    }

    const adminClient = createServiceRoleClient()
    const { error } = await adminClient
      .from("saas_subscriptions")
      .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)
      .eq("org_id", authResult.orgId)

    if (error) {
      console.error("[SaaSSubscriptions] Toggle error:", error)
      return { success: false, error: "Failed to toggle subscription" }
    }

    return { success: true, enabled }
  } catch (err: any) {
    console.error("[SaaSSubscriptions] Toggle error:", err)
    return { success: false, error: err.message || "Failed to toggle subscription" }
  }
}

/**
 * Get subscription summary (total cost, count by category)
 */
export async function getSaaSSubscriptionSummary(
  orgSlug: string
): Promise<{
  success: boolean
  summary?: {
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  }
  error?: string
}> {
  try {
    const result = await listSaaSSubscriptions(orgSlug)
    if (!result.success || !result.subscriptions) {
      return { success: false, error: result.error }
    }

    const subs = result.subscriptions
    const enabledSubs = subs.filter(s => s.is_enabled)

    // Calculate monthly equivalent costs
    let totalMonthly = 0
    for (const sub of enabledSubs) {
      switch (sub.billing_cycle) {
        case "monthly":
          totalMonthly += sub.cost_per_cycle
          break
        case "annual":
          totalMonthly += sub.cost_per_cycle / 12
          break
        case "quarterly":
          totalMonthly += sub.cost_per_cycle / 3
          break
        default:
          totalMonthly += sub.cost_per_cycle // Assume monthly for custom
      }
    }

    // Count by category
    const countByCategory: Record<string, number> = {}
    for (const sub of subs) {
      const cat = sub.category || "other"
      countByCategory[cat] = (countByCategory[cat] || 0) + 1
    }

    return {
      success: true,
      summary: {
        total_monthly_cost: Math.round(totalMonthly * 100) / 100,
        total_annual_cost: Math.round(totalMonthly * 12 * 100) / 100,
        count_by_category: countByCategory,
        enabled_count: enabledSubs.length,
        total_count: subs.length,
      }
    }
  } catch (err: any) {
    console.error("[SaaSSubscriptions] Summary error:", err)
    return { success: false, error: err.message || "Failed to get summary" }
  }
}
