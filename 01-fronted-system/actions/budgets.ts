"use server"

/**
 * Budget Planning Server Actions
 *
 * Server actions for managing budgets — CRUD, variance, allocation tree, breakdowns.
 * Uses the budget API endpoints from the backend.
 */

import { logError } from "@/lib/utils"
import { getCachedApiKey } from "@/lib/auth-cache"
import {
  getApiServiceUrl,
  fetchWithTimeout,
  safeJsonParse,
  extractErrorMessage,
} from "@/lib/api/helpers"
import { getHierarchyTree, type HierarchyTreeResponse } from "@/actions/hierarchy"

// ============================================
// Types
// ============================================

export type BudgetCategory = "cloud" | "genai" | "subscription" | "total"
export type BudgetType = "monetary" | "token" | "seat"
export type PeriodType = "monthly" | "quarterly" | "yearly" | "custom"
export type BudgetStatus = "on_track" | "approaching" | "exceeded"

/** Common period filter params for budget analytics endpoints */
export interface BudgetPeriodFilter {
  period_type?: string
  period_start?: string
  period_end?: string
}

export interface Budget {
  budget_id: string
  org_slug: string
  hierarchy_entity_id: string
  hierarchy_entity_name: string
  hierarchy_path?: string | null
  hierarchy_level_code: string
  category: BudgetCategory
  budget_type: BudgetType
  budget_amount: number
  currency: string
  period_type: PeriodType
  period_start: string
  period_end: string
  provider?: string | null
  notes?: string | null
  is_active: boolean
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at?: string | null
}

export interface BudgetListResponse {
  budgets: Budget[]
  total: number
}

export interface BudgetCreateRequest {
  hierarchy_entity_id: string
  hierarchy_entity_name: string
  hierarchy_path?: string
  hierarchy_level_code: string
  category: BudgetCategory
  budget_type?: BudgetType
  budget_amount: number
  currency?: string
  period_type: PeriodType
  period_start: string
  period_end: string
  provider?: string
  notes?: string
}

export interface BudgetUpdateRequest {
  hierarchy_entity_name?: string
  hierarchy_path?: string
  budget_amount?: number
  currency?: string
  period_type?: PeriodType
  period_start?: string
  period_end?: string
  provider?: string
  notes?: string
  is_active?: boolean
}

export interface BudgetVarianceItem {
  budget_id: string
  hierarchy_entity_id: string
  hierarchy_entity_name: string
  hierarchy_path?: string | null
  hierarchy_level_code: string
  category: string
  budget_type: string
  budget_amount: number
  actual_amount: number
  variance: number
  variance_percent: number
  currency: string
  period_type: string
  period_start: string
  period_end: string
  provider?: string | null
  is_over_budget: boolean
}

export interface BudgetSummaryResponse {
  org_slug: string
  items: BudgetVarianceItem[]
  total_budget: number
  total_actual: number
  total_variance: number
  total_variance_percent: number
  currency: string
  budgets_over: number
  budgets_under: number
  budgets_total: number
}

export interface AllocationNode {
  budget_id: string
  hierarchy_entity_id: string
  hierarchy_entity_name: string
  hierarchy_level_code: string
  category: string
  budget_amount: number
  allocated_to_children: number
  unallocated: number
  actual_amount: number
  variance: number
  currency: string
  children: AllocationNode[]
}

export interface AllocationTreeResponse {
  org_slug: string
  roots: AllocationNode[]
  total_budget: number
  total_allocated: number
  currency: string
}

export interface CategoryBreakdownItem {
  category: string
  budget_amount: number
  actual_amount: number
  variance: number
  variance_percent: number
  budget_count: number
  currency: string
  is_over_budget: boolean
}

export interface CategoryBreakdownResponse {
  org_slug: string
  items: CategoryBreakdownItem[]
  currency: string
}

export interface ProviderBreakdownItem {
  provider: string
  category: string
  budget_amount: number
  actual_amount: number
  variance: number
  variance_percent: number
  currency: string
  is_over_budget: boolean
}

export interface ProviderBreakdownResponse {
  org_slug: string
  category?: string | null
  items: ProviderBreakdownItem[]
  currency: string
}

// ============================================
// Top-Down Allocation Types
// ============================================

export interface ChildAllocationItem {
  hierarchy_entity_id: string
  hierarchy_entity_name: string
  hierarchy_path?: string
  hierarchy_level_code: string
  percentage: number
  provider?: string
  notes?: string
}

export interface TopDownAllocationRequest {
  hierarchy_entity_id: string
  hierarchy_entity_name: string
  hierarchy_path?: string
  hierarchy_level_code: string
  category: BudgetCategory
  budget_type?: BudgetType
  budget_amount: number
  currency?: string
  period_type: PeriodType
  period_start: string
  period_end: string
  provider?: string
  notes?: string
  allocations: ChildAllocationItem[]
}

export interface ChildAllocationResult {
  budget: Budget
  allocation_id: string
  allocated_amount: number
  allocation_percentage: number
}

export interface TopDownAllocationResponse {
  parent_budget: Budget
  children: ChildAllocationResult[]
  total_allocated: number
  total_allocated_percentage: number
  unallocated_amount: number
  unallocated_percentage: number
}

// ============================================
// Helper
// ============================================

async function budgetFetch(
  orgSlug: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const apiKey = await getCachedApiKey(orgSlug)
  if (!apiKey) throw new Error("No API key found for organization")

  const baseUrl = getApiServiceUrl()
  const url = `${baseUrl}/api/v1/budgets/${orgSlug}${path}`

  return fetchWithTimeout(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...options.headers,
    },
  })
}

// ============================================
// CRUD Actions
// ============================================

export async function getBudgets(
  orgSlug: string,
  params?: {
    category?: BudgetCategory
    hierarchy_entity_id?: string
    is_active?: boolean
    period_type?: PeriodType
  },
): Promise<{ data?: BudgetListResponse; error?: string }> {
  try {
    const searchParams = new URLSearchParams()
    if (params?.category) searchParams.set("category", params.category)
    if (params?.hierarchy_entity_id) searchParams.set("hierarchy_entity_id", params.hierarchy_entity_id)
    if (params?.is_active !== undefined) searchParams.set("is_active", String(params.is_active))
    if (params?.period_type) searchParams.set("period_type", params.period_type)

    const qs = searchParams.toString()
    const response = await budgetFetch(orgSlug, qs ? `?${qs}` : "")

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<BudgetListResponse>(response, { budgets: [], total: 0 })
    return { data }
  } catch (error) {
    logError("getBudgets", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch budgets" }
  }
}

export async function createBudget(
  orgSlug: string,
  request: BudgetCreateRequest,
): Promise<{ data?: Budget; error?: string }> {
  try {
    const response = await budgetFetch(orgSlug, "", {
      method: "POST",
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<Budget>(response, { budget_id: "" } as Budget)
    return { data }
  } catch (error) {
    logError("createBudget", error)
    return { error: error instanceof Error ? error.message : "Failed to create budget" }
  }
}

export async function updateBudget(
  orgSlug: string,
  budgetId: string,
  request: BudgetUpdateRequest,
): Promise<{ data?: Budget; error?: string }> {
  try {
    const response = await budgetFetch(orgSlug, `/${budgetId}`, {
      method: "PUT",
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<Budget>(response, { budget_id: "" } as Budget)
    return { data }
  } catch (error) {
    logError("updateBudget", error)
    return { error: error instanceof Error ? error.message : "Failed to update budget" }
  }
}

export async function deleteBudget(
  orgSlug: string,
  budgetId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await budgetFetch(orgSlug, `/${budgetId}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    return { success: true }
  } catch (error) {
    logError("deleteBudget", error)
    return { error: error instanceof Error ? error.message : "Failed to delete budget" }
  }
}

export async function createTopDownAllocation(
  orgSlug: string,
  request: TopDownAllocationRequest,
): Promise<{ data?: TopDownAllocationResponse; error?: string }> {
  try {
    const response = await budgetFetch(orgSlug, "/allocate", {
      method: "POST",
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<TopDownAllocationResponse>(response, null as unknown as TopDownAllocationResponse)
    if (!data) return { error: "Invalid response from server" }
    return { data }
  } catch (error) {
    logError("createTopDownAllocation", error)
    return { error: error instanceof Error ? error.message : "Failed to create budget allocation" }
  }
}

// ============================================
// Read Actions (Analytics)
// ============================================

export async function getBudgetSummary(
  orgSlug: string,
  params?: { category?: string; hierarchy_entity_id?: string } & BudgetPeriodFilter,
): Promise<{ data?: BudgetSummaryResponse; error?: string }> {
  try {
    const searchParams = new URLSearchParams()
    if (params?.category) searchParams.set("category", params.category)
    if (params?.hierarchy_entity_id) searchParams.set("hierarchy_entity_id", params.hierarchy_entity_id)
    if (params?.period_type) searchParams.set("period_type", params.period_type)
    if (params?.period_start) searchParams.set("period_start", params.period_start)
    if (params?.period_end) searchParams.set("period_end", params.period_end)

    const qs = searchParams.toString()
    const response = await budgetFetch(orgSlug, `/summary${qs ? `?${qs}` : ""}`)

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<BudgetSummaryResponse>(response, null as unknown as BudgetSummaryResponse)
    if (!data) return { error: "Invalid response from server" }
    return { data }
  } catch (error) {
    logError("getBudgetSummary", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch budget summary" }
  }
}

export async function getAllocationTree(
  orgSlug: string,
  params?: { category?: string; root_entity_id?: string } & BudgetPeriodFilter,
): Promise<{ data?: AllocationTreeResponse; error?: string }> {
  try {
    const searchParams = new URLSearchParams()
    if (params?.category) searchParams.set("category", params.category)
    if (params?.root_entity_id) searchParams.set("root_entity_id", params.root_entity_id)
    if (params?.period_type) searchParams.set("period_type", params.period_type)
    if (params?.period_start) searchParams.set("period_start", params.period_start)
    if (params?.period_end) searchParams.set("period_end", params.period_end)

    const qs = searchParams.toString()
    const response = await budgetFetch(orgSlug, `/allocation-tree${qs ? `?${qs}` : ""}`)

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<AllocationTreeResponse>(response, null as unknown as AllocationTreeResponse)
    if (!data) return { error: "Invalid response from server" }
    return { data }
  } catch (error) {
    logError("getAllocationTree", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch allocation tree" }
  }
}

export async function getCategoryBreakdown(
  orgSlug: string,
  params?: { hierarchy_entity_id?: string } & BudgetPeriodFilter,
): Promise<{ data?: CategoryBreakdownResponse; error?: string }> {
  try {
    const searchParams = new URLSearchParams()
    if (params?.hierarchy_entity_id) searchParams.set("hierarchy_entity_id", params.hierarchy_entity_id)
    if (params?.period_type) searchParams.set("period_type", params.period_type)
    if (params?.period_start) searchParams.set("period_start", params.period_start)
    if (params?.period_end) searchParams.set("period_end", params.period_end)
    const qs = searchParams.toString()
    const response = await budgetFetch(orgSlug, `/by-category${qs ? `?${qs}` : ""}`)

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<CategoryBreakdownResponse>(response, null as unknown as CategoryBreakdownResponse)
    if (!data) return { error: "Invalid response from server" }
    return { data }
  } catch (error) {
    logError("getCategoryBreakdown", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch category breakdown" }
  }
}

export async function getProviderBreakdown(
  orgSlug: string,
  params?: { category?: string; hierarchy_entity_id?: string } & BudgetPeriodFilter,
): Promise<{ data?: ProviderBreakdownResponse; error?: string }> {
  try {
    const searchParams = new URLSearchParams()
    if (params?.category) searchParams.set("category", params.category)
    if (params?.hierarchy_entity_id) searchParams.set("hierarchy_entity_id", params.hierarchy_entity_id)
    if (params?.period_type) searchParams.set("period_type", params.period_type)
    if (params?.period_start) searchParams.set("period_start", params.period_start)
    if (params?.period_end) searchParams.set("period_end", params.period_end)

    const qs = searchParams.toString()
    const response = await budgetFetch(orgSlug, `/by-provider${qs ? `?${qs}` : ""}`)

    if (!response.ok) {
      const errorText = await response.text()
      return { error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<ProviderBreakdownResponse>(response, null as unknown as ProviderBreakdownResponse)
    if (!data) return { error: "Invalid response from server" }
    return { data }
  } catch (error) {
    logError("getProviderBreakdown", error)
    return { error: error instanceof Error ? error.message : "Failed to fetch provider breakdown" }
  }
}

// ============================================
// Combined Page Data Loader
// ============================================

/** Response type for the combined budget page data loader */
export interface BudgetPageData {
  summary: BudgetSummaryResponse | null
  budgetList: BudgetListResponse | null
  allocationTree: AllocationTreeResponse | null
  categoryBreakdown: CategoryBreakdownResponse | null
  providerBreakdown: ProviderBreakdownResponse | null
  hierarchyTree: HierarchyTreeResponse | null
  error: string | null
}

/**
 * Load all budget page data in a single server action.
 *
 * Runs all 6 API calls in parallel (within one server action) to avoid
 * Next.js flight protocol serialization which forces sequential execution
 * when calling multiple server actions from the client.
 *
 * Result: ~6s load time instead of ~30s.
 */
export async function loadBudgetPageData(
  orgSlug: string,
  params?: {
    category?: string
    hierarchyEntityId?: string
    periodType?: string
  },
): Promise<BudgetPageData> {
  try {
    // Run ALL fetches in parallel within this single server action
    const [summaryRes, listRes, treeRes, catRes, provRes, hierRes] = await Promise.all([
      getBudgetSummary(orgSlug, {
        category: params?.category,
        hierarchy_entity_id: params?.hierarchyEntityId,
        period_type: params?.periodType as PeriodType | undefined,
      }),
      getBudgets(orgSlug, {
        category: params?.category as BudgetCategory | undefined,
        hierarchy_entity_id: params?.hierarchyEntityId,
        period_type: params?.periodType as PeriodType | undefined,
      }),
      getAllocationTree(orgSlug, {
        category: params?.category,
        root_entity_id: params?.hierarchyEntityId,
        period_type: params?.periodType,
      }),
      getCategoryBreakdown(orgSlug, {
        hierarchy_entity_id: params?.hierarchyEntityId,
        period_type: params?.periodType as PeriodType | undefined,
      }),
      getProviderBreakdown(orgSlug, {
        category: params?.category,
        hierarchy_entity_id: params?.hierarchyEntityId,
        period_type: params?.periodType as PeriodType | undefined,
      }),
      getHierarchyTree(orgSlug),
    ])

    // Collect errors from critical endpoints
    const errors: string[] = []
    if (summaryRes.error) errors.push(summaryRes.error)
    if (listRes.error) errors.push(listRes.error)

    return {
      summary: summaryRes.data ?? null,
      budgetList: listRes.data ?? null,
      allocationTree: treeRes.data ?? null,
      categoryBreakdown: catRes.data ?? null,
      providerBreakdown: provRes.data ?? null,
      hierarchyTree: hierRes.success && hierRes.data ? hierRes.data : null,
      error: errors.length > 0 ? errors[0] : null,
    }
  } catch (error) {
    logError("loadBudgetPageData", error)
    return {
      summary: null,
      budgetList: null,
      allocationTree: null,
      categoryBreakdown: null,
      providerBreakdown: null,
      hierarchyTree: null,
      error: error instanceof Error ? error.message : "Failed to load budget data",
    }
  }
}
