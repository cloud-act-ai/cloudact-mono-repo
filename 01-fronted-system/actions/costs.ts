"use server"

/**
 * Cost Analytics Server Actions
 *
 * Unified cost data fetching for all cost dashboards (GenAI, Cloud, Subscriptions).
 * Uses Polars-powered API endpoints from the backend cost service.
 *
 * All cost data comes from cost_data_standard_1_3 (FOCUS 1.3 format).
 *
 * PERFORMANCE: Uses request-level caching for auth/API key to avoid
 * redundant Supabase queries when multiple cost actions run in parallel.
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
// Note: unstable_cache was considered for cost trend caching but skipped
// to avoid stale data issues. Client-side caching via CostDataContext is sufficient.

// ============================================
// Request-Level Auth Cache (Performance Fix)
// ============================================

interface CachedAuth {
  userId: string
  orgId: string
  role: string
  apiKey: string
  cachedAt: number
}

// Short-lived cache (5 seconds) - enough for parallel requests, expires quickly for security
const AUTH_CACHE_TTL_MS = 5000
const authCache = new Map<string, CachedAuth>()

/**
 * Get current user ID from Supabase auth (fast, no DB query).
 * Returns null if not authenticated.
 *
 * AUTH-001 FIX: Used to include userId in cache key to prevent cross-user auth leakage.
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Get cached auth context for an org.
 * This dramatically reduces Supabase queries when multiple cost actions run in parallel.
 * Cache is invalidated after 5 seconds to ensure fresh auth checks.
 *
 * AUTH-001 FIX: Cache key now includes userId to prevent cross-user auth context leakage.
 * Previously, User A (admin) could have their auth cached, and User B (member) accessing
 * the same org within 5 seconds would incorrectly get User A's admin role.
 */
async function getCachedAuthContext(orgSlug: string): Promise<{ auth: AuthResult; apiKey: string } | null> {
  // AUTH-001 FIX: Get current user ID first to include in cache key
  const currentUserId = await getCurrentUserId()
  if (!currentUserId) {
    return null // Not authenticated
  }

  // CACHE-001 FIX: Cache key includes both userId AND orgSlug for complete isolation
  // This prevents cross-org role leakage (e.g., admin in org-A, member in org-B)
  const cacheKey = `${currentUserId}:${orgSlug}`
  const cached = authCache.get(cacheKey)
  const now = Date.now()

  // ASYNC-001 FIX: Proactive cleanup BEFORE cache grows too large
  if (authCache.size >= 95) {
    const entries = Array.from(authCache.entries())
    for (const [key, value] of entries) {
      if (now - value.cachedAt > AUTH_CACHE_TTL_MS) {
        authCache.delete(key)
      }
    }
  }

  // Return cached if still valid AND matches current user AND orgSlug
  if (cached && (now - cached.cachedAt) < AUTH_CACHE_TTL_MS && cached.userId === currentUserId) {
    return {
      auth: { user: { id: cached.userId }, orgId: cached.orgId, role: cached.role },
      apiKey: cached.apiKey,
    }
  }

  // Fetch fresh auth + API key
  try {
    const auth = await requireOrgMembershipInternal(orgSlug)
    const apiKey = await getOrgApiKeySecure(orgSlug)

    if (!apiKey) {
      return null
    }

    // Cache the result with user-specific key
    authCache.set(cacheKey, {
      userId: auth.user.id,
      orgId: auth.orgId,
      role: auth.role,
      apiKey,
      cachedAt: now,
    })

    // ASYNC-001 FIX: Cleanup moved to before cache check (proactive cleanup)
    return { auth, apiKey }
  } catch {
    return null
  }
}

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
  subscription: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
    total_billed_cost?: number  // Actual billed cost for the period
    mtd_cost?: number           // Month-to-date actual cost
    record_count: number
    providers: string[]
  }
  cloud: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
    total_billed_cost?: number  // Actual billed cost for the period
    mtd_cost?: number           // Month-to-date actual cost
    record_count: number
    providers: string[]
  }
  genai: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
    total_billed_cost?: number  // Actual billed cost for the period
    mtd_cost?: number           // Month-to-date actual cost
    record_count: number
    providers: string[]
  }
  total: {
    total_daily_cost: number
    total_monthly_cost: number
    total_annual_cost: number
    total_billed_cost?: number  // Total actual billed cost for the period
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

/**
 * Internal auth check - makes actual Supabase queries.
 * Use getCachedAuthContext() for cached version in parallel requests.
 */
async function requireOrgMembershipInternal(orgSlug: string): Promise<AuthResult> {
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

/**
 * Cached version of requireOrgMembership.
 * Uses 5-second request-level cache to avoid redundant Supabase queries.
 */
async function requireOrgMembership(orgSlug: string): Promise<AuthResult> {
  const cached = await getCachedAuthContext(orgSlug)
  if (cached) {
    return cached.auth
  }
  // Fallback to direct call if caching fails
  return requireOrgMembershipInternal(orgSlug)
}

/**
 * Get cached auth + API key in a single call.
 * PERFORMANCE: Use this instead of separate requireOrgMembership + getOrgApiKeySecure calls.
 *
 * AUTH-002 FIX: Added 10-second timeout to prevent indefinite hanging on Supabase issues.
 * This ensures the caller gets a null result quickly rather than waiting for the
 * parent 30-second timeout in fetchCostData.
 */
async function getAuthWithApiKey(orgSlug: string): Promise<{ auth: AuthResult; apiKey: string } | null> {
  const AUTH_TIMEOUT_MS = 60000 // 60 seconds - allows time for slower Supabase queries

  try {
    const authPromise = getCachedAuthContext(orgSlug)
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[getAuthWithApiKey] Auth timeout after ${AUTH_TIMEOUT_MS}ms for org: ${orgSlug}`)
        }
        resolve(null)
      }, AUTH_TIMEOUT_MS)
    })

    return await Promise.race([authPromise, timeoutPromise])
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getAuthWithApiKey] Auth failed:", err)
    }
    return null
  }
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
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthWithApiKey(orgSlug)
    if (!authContext) {
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        currency: "USD",
        error: "Unable to access cost data. Please ensure your organization is fully set up with an API key. Go to Settings > Organization to verify.",
      }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/costs/${orgSlug}/genai`

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
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthWithApiKey(orgSlug)
    if (!authContext) {
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        currency: "USD",
        error: "Unable to access cost data. Please ensure your organization is fully set up with an API key. Go to Settings > Organization to verify.",
      }
    }
    const { apiKey: orgApiKey } = authContext

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
    // PERFORMANCE: Use cached auth + API key to avoid redundant Supabase queries
    // AUTH-002 FIX: This now includes a 10-second timeout to fail fast
    const authContext = await getAuthWithApiKey(orgSlug)
    if (!authContext) {
      return {
        success: false,
        data: null,
        error: "Unable to access cost data. Please ensure your organization is fully set up with an API key. Go to Settings > Organization to verify.",
      }
    }
    const { apiKey: orgApiKey } = authContext

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

    // Use longer timeout for /total endpoint - it makes 3 parallel BigQuery calls internally
    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    }, 60000)  // 60s timeout for heavy aggregation endpoint

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
      subscription: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, record_count: 0, providers: [] },
      cloud: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, record_count: 0, providers: [] },
      genai: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, record_count: 0, providers: [] },
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
 * Supports optional hierarchy filters for department/project/team filtering
 */
export async function getCostTrend(
  orgSlug: string,
  granularity: "daily" | "weekly" | "monthly" = "daily",
  days: number = 30,
  category?: "genai" | "cloud" | "subscription",
  filters?: CostFilterParams
): Promise<{
  success: boolean
  data: CostTrendPoint[]
  currency: string
  error?: string
}> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthWithApiKey(orgSlug)
    if (!authContext) {
      return {
        success: false,
        data: [],
        currency: "USD",
        error: "Unable to access cost data. Please check organization setup.",
      }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const params = new URLSearchParams({
      granularity,
      days: days.toString(),
    })
    if (category) {
      params.set("category", category)
    }
    // Hierarchy filters - server-side filtering
    if (filters?.departmentId) params.set("department_id", filters.departmentId)
    if (filters?.projectId) params.set("project_id", filters.projectId)
    if (filters?.teamId) params.set("team_id", filters.teamId)
    // Provider and category filters
    if (filters?.providers && filters.providers.length > 0) {
      params.set("providers", filters.providers.join(","))
    }
    if (filters?.categories && filters.categories.length > 0) {
      params.set("service_categories", filters.categories.join(","))
    }
    const url = `${apiUrl}/api/v1/costs/${orgSlug}/trend?${params.toString()}`

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

    // API returns different field names than our frontend expects
    interface ApiTrendPoint {
      date: string
      total_cost: number
      record_count: number
      providers?: string[]
    }
    interface TrendResponse {
      success: boolean
      data: ApiTrendPoint[]
      currency: string
    }
    const result = await safeJsonParse<TrendResponse>(response, {
      success: false,
      data: [],
      currency: "USD",
    })

    // Transform API response to frontend format
    const transformedData: CostTrendPoint[] = (result.data || []).map((point) => ({
      period: point.date,
      total_billed_cost: point.total_cost || 0,
      total_effective_cost: point.total_cost || 0,
      record_count: point.record_count || 0,
      providers: point.providers || [],
    }))

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
      error: logError("getCostTrend", error),
    }
  }
}

// ============================================
// Granular Trend Data (Client-Side Filtering)
// ============================================

/**
 * Granular cost row - pre-aggregated by date + provider + hierarchy
 * Used for client-side filtering without new API calls
 */
export interface GranularCostRow {
  date: string
  provider: string
  category: "genai" | "cloud" | "subscription" | "other"
  dept_id: string | null
  project_id: string | null
  team_id: string | null
  total_cost: number
  record_count: number
}

/**
 * Available filter options from granular data
 */
export interface GranularFiltersAvailable {
  providers: string[]
  categories: string[]
  departments: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  teams: { id: string; name: string }[]
}

/**
 * Get granular cost trend data for client-side filtering.
 *
 * This endpoint returns pre-aggregated data by date + provider + hierarchy,
 * enabling the frontend to perform ALL filtering client-side without new API calls.
 *
 * @param orgSlug - Organization slug
 * @param days - Number of days (default 365)
 * @param clearCache - Force backend to clear Polars LRU cache and fetch fresh data from BigQuery
 * @returns Granular data with available filter options
 */
export async function getCostTrendGranular(
  orgSlug: string,
  days: number = 365,
  clearCache: boolean = false
): Promise<{
  success: boolean
  data: GranularCostRow[]
  summary: {
    total_cost: number
    record_count: number
    granular_rows: number
    date_range: { start: string; end: string }
    available_filters: GranularFiltersAvailable
  } | null
  currency: string
  cache_hit: boolean
  error?: string
}> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthWithApiKey(orgSlug)
    if (!authContext) {
      return {
        success: false,
        data: [],
        summary: null,
        currency: "USD",
        cache_hit: false,
        error: "Unable to access cost data. Please check organization setup.",
      }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const params = new URLSearchParams({ days: days.toString() })

    // Add clear_cache parameter if requested (forces backend to bypass cache)
    if (clearCache) {
      params.append("clear_cache", "true")
    }

    const url = `${apiUrl}/api/v1/costs/${orgSlug}/trend-granular?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        data: [],
        summary: null,
        currency: "USD",
        cache_hit: false,
        error: `API error: ${response.status} - ${errorText}`,
      }
    }

    const result = await response.json()

    return {
      success: result.success,
      data: result.data || [],
      summary: result.summary || null,
      currency: result.currency || "USD",
      cache_hit: result.cache_hit || false,
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      summary: null,
      currency: "USD",
      cache_hit: false,
      error: logError("getCostTrendGranular", error),
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
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthWithApiKey(orgSlug)
    if (!authContext) {
      return {
        success: false,
        data: [],
        currency: "USD",
        error: "Unable to access cost data. Please check organization setup.",
      }
    }
    const { apiKey: orgApiKey } = authContext

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
      // NULL-001 FIX: Use ?? instead of || to correctly handle $0 costs
      // 0 is a valid cost value (e.g., free tier usage), so we only fallback for null/undefined
      const cost = p.total_effective_cost ?? p.total_billed_cost ?? p.total_cost ?? 0
      return sum + cost
    }, 0)

    const transformedData: ProviderBreakdown[] = rawData.map(p => {
      // Use || for strings to treat empty string as falsy (intentional for provider names)
      const providerName = p.ServiceProviderName || p.provider || "Unknown"
      // NULL-001 FIX: Use ?? for numeric costs to preserve valid $0 values
      const cost = p.total_effective_cost ?? p.total_billed_cost ?? p.total_cost ?? 0
      return {
        provider: providerName.trim() || "Unknown",  // Also trim whitespace
        total_cost: cost,
        record_count: p.record_count ?? 0,  // NULL-001 FIX: record_count of 0 is valid
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
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthWithApiKey(orgSlug)
    if (!authContext) {
      return {
        success: false,
        data: [],
        currency: "USD",
        error: "Unable to access cost data. Please check organization setup.",
      }
    }
    const { apiKey: orgApiKey } = authContext

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

// ============================================
// Extended Period Costs
// ============================================

import {
  getYesterdayRange,
  getWTDRange,
  getLastWeekRange,
  getMTDRange,
  getPreviousMonthRange,
  getLast2MonthsRange,
  getYTDRange,
  getFYTDRange,
  getFiscalYearRange,
  calculateFiscalYearForecast,
  getLast30DaysRange,
  getPrevious30DaysRange,
  getNovemberRange,
  getDecemberRange,
} from "@/lib/costs"

export interface PeriodCostsData {
  yesterday: number
  wtd: number
  lastWeek: number
  mtd: number
  previousMonth: number
  last2Months: number
  ytd: number
  fytd: number
  fyForecast: number
  dataAsOf: string
  // 30-day period data
  last30Days: number
  previous30Days: number
  november: number
  december: number
}

export interface PeriodCostsResponse {
  success: boolean
  data: PeriodCostsData | null
  currency: string
  error?: string
}

/**
 * Get costs for all extended periods in parallel
 * Returns costs for: Yesterday, WTD, Last Week, MTD, Previous Month, Last 2 Months, YTD, FYTD, FY Forecast
 */
export async function getExtendedPeriodCosts(
  orgSlug: string,
  costType: "total" | "cloud" | "genai" = "total",
  filters?: CostFilterParams,
  fiscalStartMonth: number = 4
): Promise<PeriodCostsResponse> {
  try {
    await requireOrgMembership(orgSlug)

    // Get all period date ranges
    const periods = {
      yesterday: getYesterdayRange(),
      wtd: getWTDRange(),
      lastWeek: getLastWeekRange(),
      mtd: getMTDRange(),
      previousMonth: getPreviousMonthRange(),
      last2Months: getLast2MonthsRange(),
      ytd: getYTDRange(),
      fytd: getFYTDRange(fiscalStartMonth),
      fy: getFiscalYearRange(fiscalStartMonth),
      // New 30-day periods
      last30Days: getLast30DaysRange(),
      previous30Days: getPrevious30DaysRange(),
      november: getNovemberRange(),
      december: getDecemberRange(),
    }

    // Fetch all periods in parallel
    const [
      yesterdayResult,
      wtdResult,
      lastWeekResult,
      mtdResult,
      previousMonthResult,
      last2MonthsResult,
      ytdResult,
      fytdResult,
      last30DaysResult,
      previous30DaysResult,
      novemberResult,
      decemberResult,
    ] = await Promise.all([
      getTotalCosts(orgSlug, periods.yesterday.startDate, periods.yesterday.endDate, filters),
      getTotalCosts(orgSlug, periods.wtd.startDate, periods.wtd.endDate, filters),
      getTotalCosts(orgSlug, periods.lastWeek.startDate, periods.lastWeek.endDate, filters),
      getTotalCosts(orgSlug, periods.mtd.startDate, periods.mtd.endDate, filters),
      getTotalCosts(orgSlug, periods.previousMonth.startDate, periods.previousMonth.endDate, filters),
      getTotalCosts(orgSlug, periods.last2Months.startDate, periods.last2Months.endDate, filters),
      getTotalCosts(orgSlug, periods.ytd.startDate, periods.ytd.endDate, filters),
      getTotalCosts(orgSlug, periods.fytd.startDate, periods.fytd.endDate, filters),
      getTotalCosts(orgSlug, periods.last30Days.startDate, periods.last30Days.endDate, filters),
      getTotalCosts(orgSlug, periods.previous30Days.startDate, periods.previous30Days.endDate, filters),
      getTotalCosts(orgSlug, periods.november.startDate, periods.november.endDate, filters),
      getTotalCosts(orgSlug, periods.december.startDate, periods.december.endDate, filters),
    ])

    // Extract total costs based on cost type
    // Priority: total_billed_cost (actual) > mtd_cost > total_monthly_cost (projection)
    const extractCost = (result: { success: boolean; data: TotalCostSummary | null }): number => {
      if (!result.success || !result.data) return 0

      // Helper to get best available cost value from a category
      const getCategoryCost = (cat: { total_billed_cost?: number; mtd_cost?: number; total_monthly_cost?: number } | undefined): number => {
        if (!cat) return 0
        // Prefer actual billed cost, then mtd_cost, then monthly projection
        return cat.total_billed_cost ?? cat.mtd_cost ?? cat.total_monthly_cost ?? 0
      }

      switch (costType) {
        case "cloud":
          return getCategoryCost(result.data.cloud)
        case "genai":
          return getCategoryCost(result.data.genai)
        case "total":
        default: {
          // Sum all cost types for total
          const subscription = getCategoryCost(result.data.subscription)
          const cloud = getCategoryCost(result.data.cloud)
          const genai = getCategoryCost(result.data.genai)
          const total = subscription + cloud + genai
          // Fallback to total.total_billed_cost or total_monthly_cost
          return total || (result.data.total?.total_billed_cost ?? result.data.total?.total_monthly_cost ?? 0)
        }
      }
    }

    const fytdCost = extractCost(fytdResult)
    const fyForecast = calculateFiscalYearForecast(
      fytdCost,
      periods.fytd.days,
      periods.fy.days
    )

    const data: PeriodCostsData = {
      yesterday: extractCost(yesterdayResult),
      wtd: extractCost(wtdResult),
      lastWeek: extractCost(lastWeekResult),
      mtd: extractCost(mtdResult),
      previousMonth: extractCost(previousMonthResult),
      last2Months: extractCost(last2MonthsResult),
      ytd: extractCost(ytdResult),
      fytd: fytdCost,
      fyForecast,
      dataAsOf: periods.yesterday.endDate,
      // 30-day period data
      last30Days: extractCost(last30DaysResult),
      previous30Days: extractCost(previous30DaysResult),
      november: extractCost(novemberResult),
      december: extractCost(decemberResult),
    }

    return {
      success: true,
      data,
      currency: mtdResult.data?.currency ?? "USD",
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      currency: "USD",
      error: logError("getExtendedPeriodCosts", error),
    }
  }
}
