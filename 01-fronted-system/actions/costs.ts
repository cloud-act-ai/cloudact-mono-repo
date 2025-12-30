"use server"

/**
 * Cost Analytics Server Actions
 *
 * Unified cost data fetching for all cost dashboards (GenAI, Cloud, Subscriptions).
 * Uses Polars-powered API endpoints from the backend cost service.
 *
 * All cost data comes from cost_data_standard_1_3 (FOCUS 1.3 format).
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { logError } from "@/lib/utils"
import { getOrgApiKeySecure } from "@/actions/backend-onboarding"
import {
  getApiServiceUrl,
  fetchWithTimeout,
  safeJsonParse,
  extractErrorMessage,
  isValidOrgSlug as isValidOrgSlugHelper,
} from "@/lib/api/helpers"

// ============================================
// Types
// ============================================

export interface CostSummary {
  total_daily_cost: number
  total_monthly_cost: number
  total_annual_cost: number
  total_billed_cost: number
  ytd_cost: number
  mtd_cost: number
  forecast_monthly_cost: number
  forecast_annual_cost: number
  providers: string[]
  service_categories: string[]
  record_count: number
  date_range: {
    start: string
    end: string
  }
}

export interface CostRecord {
  // Core identity
  ServiceProviderName: string
  ServiceCategory: string
  ServiceName: string
  ServiceSubcategory: string

  // Cost fields
  BilledCost: number
  EffectiveCost: number
  BillingCurrency: string

  // Time
  ChargePeriodStart: string
  ChargePeriodEnd: string

  // Run rates (calculated)
  MonthlyRunRate: number
  AnnualRunRate: number
}

export interface ProviderBreakdown {
  provider: string
  total_cost: number
  record_count: number
  percentage: number
}

export interface ServiceBreakdown {
  service_category: string
  service_name: string
  provider: string
  total_cost: number
  record_count: number
}

export interface CostTrendPoint {
  period: string
  total_billed_cost: number
  total_effective_cost: number
  record_count: number
  providers: string[]
}

export interface CostDataResponse {
  success: boolean
  data: CostRecord[]
  summary: CostSummary | null
  cache_hit: boolean
  query_time_ms: number
  currency: string
  error?: string
}

export interface TotalCostSummary {
  saas: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
    record_count: number
    providers: string[]
  }
  cloud: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
    record_count: number
    providers: string[]
  }
  llm: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
    record_count: number
    providers: string[]
  }
  total: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
  }
  date_range: {
    start: string
    end: string
  }
  currency: string
  query_time_ms: number
}

/**
 * Filter parameters for cost queries
 */
export interface CostFilterParams {
  /** Filter by department ID (hierarchy) */
  departmentId?: string
  /** Filter by project ID (hierarchy) */
  projectId?: string
  /** Filter by team ID (hierarchy) */
  teamId?: string
  /** Filter by providers (comma-separated) */
  providers?: string[]
  /** Filter by service categories (comma-separated) */
  categories?: string[]
}

// ============================================
// Auth Helpers
// ============================================

const isValidOrgSlug = isValidOrgSlugHelper

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

// ============================================
// GenAI/LLM Costs
// ============================================

/**
 * Get GenAI/LLM API costs (OpenAI, Anthropic, Google, etc.)
 * Source: cost_data_standard_1_3 filtered by LLM providers
 */
export async function getGenAICosts(
  orgSlug: string,
  startDate?: string,
  endDate?: string,
  filters?: CostFilterParams
): Promise<CostDataResponse> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        currency: "USD",
        error: "Organization API key not found. Please complete organization onboarding.",
      }
    }

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/costs/${orgSlug}/llm`

    const params = new URLSearchParams()
    if (startDate) params.append("start_date", startDate)
    if (endDate) params.append("end_date", endDate)
    // Hierarchy filters
    if (filters?.departmentId) params.append("department_id", filters.departmentId)
    if (filters?.projectId) params.append("project_id", filters.projectId)
    if (filters?.teamId) params.append("team_id", filters.teamId)
    // Provider and category filters
    if (filters?.providers && filters.providers.length > 0) {
      params.append("providers", filters.providers.join(","))
    }
    if (filters?.categories && filters.categories.length > 0) {
      params.append("service_categories", filters.categories.join(","))
    }
    if (params.toString()) url += `?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      // 404 means no data found for this org/date range - this is NOT an error
      if (response.status === 404) {
        return {
          success: true,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
        }
      }
      // 400 indicates validation error
      if (response.status === 400) {
        const errorText = await response.text()
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: `Invalid request: ${extractErrorMessage(errorText)}`,
        }
      }
      // 401/403 indicate auth issues
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: "Authentication failed. Please check your API key.",
        }
      }
      // 429 indicates rate limiting
      if (response.status === 429) {
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: "Too many requests. Please wait a moment and try again.",
        }
      }
      // 5xx errors indicate server issues
      if (response.status >= 500) {
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: "Cost service is temporarily unavailable. Please try again later.",
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        currency: "USD",
        error: `Failed to fetch GenAI costs: ${extractErrorMessage(errorText)}`,
      }
    }

    const result = await safeJsonParse<CostDataResponse>(response, {
      success: false,
      data: [],
      summary: null,
      cache_hit: false,
      query_time_ms: 0,
      currency: "USD",
    })

    return result
  } catch (error) {
    return {
      success: false,
      data: [],
      summary: null,
      cache_hit: false,
      query_time_ms: 0,
      currency: "USD",
      error: logError("getGenAICosts", error),
    }
  }
}

// ============================================
// Cloud Costs
// ============================================

/**
 * Get Cloud infrastructure costs (GCP, AWS, Azure)
 * Source: cost_data_standard_1_3 filtered by cloud providers
 */
export async function getCloudCosts(
  orgSlug: string,
  startDate?: string,
  endDate?: string,
  filters?: CostFilterParams
): Promise<CostDataResponse> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        currency: "USD",
        error: "Organization API key not found. Please complete organization onboarding.",
      }
    }

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/costs/${orgSlug}/cloud`

    const params = new URLSearchParams()
    if (startDate) params.append("start_date", startDate)
    if (endDate) params.append("end_date", endDate)
    // Hierarchy filters
    if (filters?.departmentId) params.append("department_id", filters.departmentId)
    if (filters?.projectId) params.append("project_id", filters.projectId)
    if (filters?.teamId) params.append("team_id", filters.teamId)
    // Provider and category filters
    if (filters?.providers && filters.providers.length > 0) {
      params.append("providers", filters.providers.join(","))
    }
    if (filters?.categories && filters.categories.length > 0) {
      params.append("service_categories", filters.categories.join(","))
    }
    if (params.toString()) url += `?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      // 404 means no data found for this org/date range - this is NOT an error
      if (response.status === 404) {
        return {
          success: true,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
        }
      }
      // 400 indicates validation error
      if (response.status === 400) {
        const errorText = await response.text()
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: `Invalid request: ${extractErrorMessage(errorText)}`,
        }
      }
      // 401/403 indicate auth issues
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: "Authentication failed. Please check your API key.",
        }
      }
      // 429 indicates rate limiting
      if (response.status === 429) {
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: "Too many requests. Please wait a moment and try again.",
        }
      }
      // 5xx errors indicate server issues
      if (response.status >= 500) {
        return {
          success: false,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
          currency: "USD",
          error: "Cost service is temporarily unavailable. Please try again later.",
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        currency: "USD",
        error: `Failed to fetch cloud costs: ${extractErrorMessage(errorText)}`,
      }
    }

    const result = await safeJsonParse<CostDataResponse>(response, {
      success: false,
      data: [],
      summary: null,
      cache_hit: false,
      query_time_ms: 0,
      currency: "USD",
    })

    return result
  } catch (error) {
    return {
      success: false,
      data: [],
      summary: null,
      cache_hit: false,
      query_time_ms: 0,
      currency: "USD",
      error: logError("getCloudCosts", error),
    }
  }
}

// ============================================
// Total Costs (Combined)
// ============================================

/**
 * Get total costs across all categories (SaaS, Cloud, LLM)
 * Returns aggregated summary for dashboard overview
 */
export async function getTotalCosts(
  orgSlug: string,
  startDate?: string,
  endDate?: string,
  filters?: CostFilterParams
): Promise<{
  success: boolean
  data: TotalCostSummary | null
  error?: string
}> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        data: null,
        error: "Organization API key not found. Please complete organization onboarding.",
      }
    }

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/costs/${orgSlug}/total`

    const params = new URLSearchParams()
    if (startDate) params.append("start_date", startDate)
    if (endDate) params.append("end_date", endDate)
    // Hierarchy filters
    if (filters?.departmentId) params.append("department_id", filters.departmentId)
    if (filters?.projectId) params.append("project_id", filters.projectId)
    if (filters?.teamId) params.append("team_id", filters.teamId)
    // Provider and category filters
    if (filters?.providers && filters.providers.length > 0) {
      params.append("providers", filters.providers.join(","))
    }
    if (filters?.categories && filters.categories.length > 0) {
      params.append("service_categories", filters.categories.join(","))
    }
    if (params.toString()) url += `?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      // 404 means no data found - this is NOT an error
      if (response.status === 404) {
        return { success: true, data: null }
      }
      // 400 indicates validation error
      if (response.status === 400) {
        const errorText = await response.text()
        return {
          success: false,
          data: null,
          error: `Invalid request: ${extractErrorMessage(errorText)}`,
        }
      }
      // 401/403 indicate auth issues
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          data: null,
          error: "Authentication failed. Please check your API key.",
        }
      }
      // 429 indicates rate limiting
      if (response.status === 429) {
        return {
          success: false,
          data: null,
          error: "Too many requests. Please wait a moment and try again.",
        }
      }
      // 5xx errors indicate server issues
      if (response.status >= 500) {
        return {
          success: false,
          data: null,
          error: "Cost service is temporarily unavailable. Please try again later.",
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        data: null,
        error: `Failed to fetch total costs: ${extractErrorMessage(errorText)}`,
      }
    }

    const result = await safeJsonParse<TotalCostSummary>(response, {
      saas: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, record_count: 0, providers: [] },
      cloud: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, record_count: 0, providers: [] },
      llm: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, record_count: 0, providers: [] },
      total: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0 },
      date_range: { start: "", end: "" },
      currency: "USD",
      query_time_ms: 0,
    })

    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: logError("getTotalCosts", error),
    }
  }
}

// ============================================
// Cost Trend
// ============================================

/**
 * Get cost trend over time
 */
export async function getCostTrend(
  orgSlug: string,
  granularity: "daily" | "weekly" | "monthly" = "daily",
  days: number = 30
): Promise<{
  success: boolean
  data: CostTrendPoint[]
  currency: string
  error?: string
}> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        data: [],
        currency: "USD",
        error: "Organization API key not found.",
      }
    }

    const apiUrl = getApiServiceUrl()
    const url = `${apiUrl}/api/v1/costs/${orgSlug}/trend?granularity=${granularity}&days=${days}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      // 404 means no data found - this is NOT an error
      if (response.status === 404) {
        return { success: true, data: [], currency: "USD" }
      }
      // 400 indicates validation error
      if (response.status === 400) {
        const errorText = await response.text()
        return {
          success: false,
          data: [],
          currency: "USD",
          error: `Invalid request: ${extractErrorMessage(errorText)}`,
        }
      }
      // 401/403 indicate auth issues
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Authentication failed. Please check your API key.",
        }
      }
      // 429 indicates rate limiting
      if (response.status === 429) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Too many requests. Please wait a moment and try again.",
        }
      }
      // 5xx errors indicate server issues
      if (response.status >= 500) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Cost service is temporarily unavailable. Please try again later.",
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        data: [],
        currency: "USD",
        error: `Failed to fetch cost trend: ${extractErrorMessage(errorText)}`,
      }
    }

    interface TrendResponse {
      success: boolean
      data: CostTrendPoint[]
      currency: string
    }
    const result = await safeJsonParse<TrendResponse>(response, {
      success: false,
      data: [],
      currency: "USD",
    })

    return {
      success: result.success,
      data: result.data || [],
      currency: result.currency || "USD",
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      currency: "USD",
      error: logError("getCostTrend", error),
    }
  }
}

// ============================================
// Cost by Provider
// ============================================

/**
 * Get cost breakdown by provider
 */
export async function getCostByProvider(
  orgSlug: string,
  startDate?: string,
  endDate?: string,
  filters?: CostFilterParams
): Promise<{
  success: boolean
  data: ProviderBreakdown[]
  currency: string
  error?: string
}> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        data: [],
        currency: "USD",
        error: "Organization API key not found.",
      }
    }

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/costs/${orgSlug}/by-provider`

    const params = new URLSearchParams()
    if (startDate) params.append("start_date", startDate)
    if (endDate) params.append("end_date", endDate)
    // Hierarchy filters
    if (filters?.departmentId) params.append("department_id", filters.departmentId)
    if (filters?.projectId) params.append("project_id", filters.projectId)
    if (filters?.teamId) params.append("team_id", filters.teamId)
    // Provider and category filters
    if (filters?.providers && filters.providers.length > 0) {
      params.append("providers", filters.providers.join(","))
    }
    if (filters?.categories && filters.categories.length > 0) {
      params.append("service_categories", filters.categories.join(","))
    }
    if (params.toString()) url += `?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      // 404 means no data found - this is NOT an error
      if (response.status === 404) {
        return { success: true, data: [], currency: "USD" }
      }
      // 400 indicates validation error
      if (response.status === 400) {
        const errorText = await response.text()
        return {
          success: false,
          data: [],
          currency: "USD",
          error: `Invalid request: ${extractErrorMessage(errorText)}`,
        }
      }
      // 401/403 indicate auth issues
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Authentication failed. Please check your API key.",
        }
      }
      // 429 indicates rate limiting
      if (response.status === 429) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Too many requests. Please wait a moment and try again.",
        }
      }
      // 5xx errors indicate server issues
      if (response.status >= 500) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Cost service is temporarily unavailable. Please try again later.",
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        data: [],
        currency: "USD",
        error: `Failed to fetch cost by provider: ${extractErrorMessage(errorText)}`,
      }
    }

    // API returns BigQuery column names, need to transform to frontend interface
    interface ApiProviderData {
      ServiceProviderName?: string
      provider?: string  // Fallback if already transformed
      total_billed_cost?: number
      total_effective_cost?: number
      total_cost?: number  // Fallback if already transformed
      record_count: number
      service_categories?: string[]
      percentage?: number
    }
    interface ProviderResponse {
      success: boolean
      data: ApiProviderData[]
      currency: string
    }
    const result = await safeJsonParse<ProviderResponse>(response, {
      success: false,
      data: [],
      currency: "USD",
    })

    // Transform API response to frontend interface
    const rawData = result.data || []
    const totalCost = rawData.reduce((sum, p) => {
      // Use || to treat empty/0 as falsy
      const cost = p.total_effective_cost || p.total_billed_cost || p.total_cost || 0
      return sum + cost
    }, 0)

    const transformedData: ProviderBreakdown[] = rawData.map(p => {
      // Use || to treat empty string as falsy (not just null/undefined)
      const providerName = p.ServiceProviderName || p.provider || "Unknown"
      const cost = p.total_effective_cost || p.total_billed_cost || p.total_cost || 0
      return {
        provider: providerName.trim() || "Unknown",  // Also trim whitespace
        total_cost: cost,
        record_count: p.record_count || 0,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      }
    })

    return {
      success: result.success,
      data: transformedData,
      currency: result.currency || "USD",
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      currency: "USD",
      error: logError("getCostByProvider", error),
    }
  }
}

// ============================================
// Cost by Service
// ============================================

/**
 * Get cost breakdown by service
 */
export async function getCostByService(
  orgSlug: string,
  startDate?: string,
  endDate?: string,
  filters?: CostFilterParams
): Promise<{
  success: boolean
  data: ServiceBreakdown[]
  currency: string
  error?: string
}> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        data: [],
        currency: "USD",
        error: "Organization API key not found.",
      }
    }

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/costs/${orgSlug}/by-service`

    const params = new URLSearchParams()
    if (startDate) params.append("start_date", startDate)
    if (endDate) params.append("end_date", endDate)
    // Hierarchy filters
    if (filters?.departmentId) params.append("department_id", filters.departmentId)
    if (filters?.projectId) params.append("project_id", filters.projectId)
    if (filters?.teamId) params.append("team_id", filters.teamId)
    // Provider and category filters
    if (filters?.providers && filters.providers.length > 0) {
      params.append("providers", filters.providers.join(","))
    }
    if (filters?.categories && filters.categories.length > 0) {
      params.append("service_categories", filters.categories.join(","))
    }
    if (params.toString()) url += `?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      // 404 means no data found - this is NOT an error
      if (response.status === 404) {
        return { success: true, data: [], currency: "USD" }
      }
      // 400 indicates validation error
      if (response.status === 400) {
        const errorText = await response.text()
        return {
          success: false,
          data: [],
          currency: "USD",
          error: `Invalid request: ${extractErrorMessage(errorText)}`,
        }
      }
      // 401/403 indicate auth issues
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Authentication failed. Please check your API key.",
        }
      }
      // 429 indicates rate limiting
      if (response.status === 429) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Too many requests. Please wait a moment and try again.",
        }
      }
      // 5xx errors indicate server issues
      if (response.status >= 500) {
        return {
          success: false,
          data: [],
          currency: "USD",
          error: "Cost service is temporarily unavailable. Please try again later.",
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        data: [],
        currency: "USD",
        error: `Failed to fetch cost by service: ${extractErrorMessage(errorText)}`,
      }
    }

    interface ServiceResponse {
      success: boolean
      data: ServiceBreakdown[]
      currency: string
    }
    const result = await safeJsonParse<ServiceResponse>(response, {
      success: false,
      data: [],
      currency: "USD",
    })

    return {
      success: result.success,
      data: result.data || [],
      currency: result.currency || "USD",
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      currency: "USD",
      error: logError("getCostByService", error),
    }
  }
}
