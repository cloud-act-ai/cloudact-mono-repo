"use server"

/**
 * Quota Management Server Actions
 *
 * Provides functions to check quota usage and limits.
 * Used for displaying soft warnings when approaching limits.
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getCachedApiKey } from "@/lib/auth-cache"

export interface QuotaUsage {
  // Pipeline quotas
  pipelinesRunToday: number
  dailyLimit: number
  pipelinesRunMonth: number
  monthlyLimit: number
  concurrentRunning: number
  concurrentLimit: number

  // Resource quotas
  teamMembers: number
  seatLimit: number
  configuredProviders: number
  providersLimit: number

  // Calculated percentages
  dailyUsagePercent: number
  monthlyUsagePercent: number
  seatUsagePercent: number
  providerUsagePercent: number

  // Warning levels
  dailyWarningLevel: 'ok' | 'warning' | 'critical' | 'exceeded'
  monthlyWarningLevel: 'ok' | 'warning' | 'critical' | 'exceeded'
  concurrentWarningLevel: 'ok' | 'warning' | 'critical' | 'exceeded'
  seatWarningLevel: 'ok' | 'warning' | 'critical' | 'exceeded'
  providerWarningLevel: 'ok' | 'warning' | 'critical' | 'exceeded'

  // Calculated percentages for concurrent
  concurrentUsagePercent: number
}

function getWarningLevel(current: number, limit: number): 'ok' | 'warning' | 'critical' | 'exceeded' {
  if (limit === 0) return 'ok'
  const percent = (current / limit) * 100

  if (current >= limit) return 'exceeded'
  if (percent >= 90) return 'critical'
  if (percent >= 80) return 'warning'
  return 'ok'
}

/**
 * Get quota usage for an organization.
 * Returns current usage, limits, and warning levels.
 */
export async function getQuotaUsage(orgSlug: string): Promise<{
  success: boolean
  data?: QuotaUsage
  error?: string
}> {
  try {
    const supabase = await createClient()
    const adminClient = createServiceRoleClient()

    // Verify user is authenticated and has access
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Get organization data with limits
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select(`
        id,
        org_slug,
        seat_limit,
        providers_limit,
        pipelines_per_day_limit,
        integration_openai_status,
        integration_anthropic_status,
        integration_gcp_status
      `)
      .eq("org_slug", orgSlug)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    // Verify user is member of org
    const { data: membership, error: memberError } = await adminClient
      .from("organization_members")
      .select("id")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (memberError || !membership) {
      return { success: false, error: "Not a member of this organization" }
    }

    // Get member count
    const { count: memberCount } = await adminClient
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "active")

    // Count configured providers
    const configuredProviders = [
      org.integration_openai_status === 'VALID',
      org.integration_anthropic_status === 'VALID',
      org.integration_gcp_status === 'VALID',
    ].filter(Boolean).length

    // Get pipeline usage from backend API
    // Backend endpoint: GET /api/v1/organizations/{org}/quota
    let pipelinesRunToday = 0
    let pipelinesRunMonth = 0
    let concurrentRunning = 0
    let backendDailyLimit = 0
    let backendMonthlyLimit = 0
    let backendConcurrentLimit = 20

    try {
      const apiKey = await getCachedApiKey(orgSlug)
      if (apiKey) {
        const apiServiceUrl = process.env.NEXT_PUBLIC_API_SERVICE_URL || "http://localhost:8000"
        const response = await fetch(`${apiServiceUrl}/api/v1/organizations/${orgSlug}/quota`, {
          method: "GET",
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json"
          },
          cache: "no-store"
        })

        if (response.ok) {
          const quotaData = await response.json()
          pipelinesRunToday = quotaData.pipelinesRunToday || 0
          pipelinesRunMonth = quotaData.pipelinesRunMonth || 0
          concurrentRunning = quotaData.concurrentRunning || 0
          backendDailyLimit = quotaData.dailyLimit || 0
          backendMonthlyLimit = quotaData.monthlyLimit || 0
          backendConcurrentLimit = quotaData.concurrentLimit || 20
        }
      }
    } catch (quotaError) {
      // Backend quota check failed - use defaults from Supabase
      if (process.env.NODE_ENV === "development") {
        console.warn("[getOrgQuotaUsage] Backend quota check failed:", quotaError)
      }
    }

    const seatLimit = org.seat_limit || 2
    const providersLimit = org.providers_limit || 3
    // Use backend limits if available, otherwise fall back to Supabase/defaults
    const dailyLimit = backendDailyLimit || org.pipelines_per_day_limit || 6
    const monthlyLimit = backendMonthlyLimit || (dailyLimit * 30)

    const quotaUsage: QuotaUsage = {
      // Pipeline quotas
      pipelinesRunToday,
      dailyLimit,
      pipelinesRunMonth,
      monthlyLimit,
      concurrentRunning,
      concurrentLimit: backendConcurrentLimit,

      // Resource quotas
      teamMembers: memberCount || 0,
      seatLimit,
      configuredProviders,
      providersLimit,

      // Calculated percentages
      dailyUsagePercent: dailyLimit > 0 ? Math.round((pipelinesRunToday / dailyLimit) * 100) : 0,
      monthlyUsagePercent: monthlyLimit > 0 ? Math.round((pipelinesRunMonth / monthlyLimit) * 100) : 0,
      concurrentUsagePercent: backendConcurrentLimit > 0 ? Math.round((concurrentRunning / backendConcurrentLimit) * 100) : 0,
      seatUsagePercent: seatLimit > 0 ? Math.round(((memberCount || 0) / seatLimit) * 100) : 0,
      providerUsagePercent: providersLimit > 0 ? Math.round((configuredProviders / providersLimit) * 100) : 0,

      // Warning levels
      dailyWarningLevel: getWarningLevel(pipelinesRunToday, dailyLimit),
      monthlyWarningLevel: getWarningLevel(pipelinesRunMonth, monthlyLimit),
      concurrentWarningLevel: getWarningLevel(concurrentRunning, backendConcurrentLimit),
      seatWarningLevel: getWarningLevel(memberCount || 0, seatLimit),
      providerWarningLevel: getWarningLevel(configuredProviders, providersLimit),
    }

    return { success: true, data: quotaUsage }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to get quota usage"
    return { success: false, error: errorMessage }
  }
}

/**
 * Check if adding a new team member would exceed the limit.
 */
export async function canAddTeamMember(orgSlug: string): Promise<{
  canAdd: boolean
  currentCount: number
  limit: number
  message?: string
}> {
  const result = await getQuotaUsage(orgSlug)

  if (!result.success || !result.data) {
    // SECURITY: Fail closed - don't allow adding when we can't verify limits
    return { canAdd: false, currentCount: 0, limit: 0, message: "Could not verify limits. Please try again." }
  }

  const { teamMembers, seatLimit } = result.data

  if (teamMembers >= seatLimit) {
    return {
      canAdd: false,
      currentCount: teamMembers,
      limit: seatLimit,
      message: `Team member limit reached (${teamMembers}/${seatLimit}). Upgrade your plan to add more members.`
    }
  }

  return {
    canAdd: true,
    currentCount: teamMembers,
    limit: seatLimit,
    message: teamMembers >= seatLimit - 1
      ? `Warning: Adding this member will reach your team limit (${teamMembers + 1}/${seatLimit}).`
      : undefined
  }
}

/**
 * Check if adding a new integration would exceed the limit.
 */
export async function canAddIntegration(orgSlug: string): Promise<{
  canAdd: boolean
  currentCount: number
  limit: number
  message?: string
}> {
  const result = await getQuotaUsage(orgSlug)

  if (!result.success || !result.data) {
    // SECURITY: Fail closed - don't allow adding when we can't verify limits
    return { canAdd: false, currentCount: 0, limit: 0, message: "Could not verify limits. Please try again." }
  }

  const { configuredProviders, providersLimit } = result.data

  if (configuredProviders >= providersLimit) {
    return {
      canAdd: false,
      currentCount: configuredProviders,
      limit: providersLimit,
      message: `Integration limit reached (${configuredProviders}/${providersLimit}). Upgrade your plan to add more integrations.`
    }
  }

  return {
    canAdd: true,
    currentCount: configuredProviders,
    limit: providersLimit,
    message: configuredProviders >= providersLimit - 1
      ? `Warning: Adding this integration will reach your limit (${configuredProviders + 1}/${providersLimit}).`
      : undefined
  }
}
