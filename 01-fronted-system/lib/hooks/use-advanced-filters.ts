"use client"

/**
 * useAdvancedFilters — Shared filter state hook for budgets, alerts, and cost pages.
 *
 * Provides a unified filter state that dispatches to different backend endpoints
 * depending on the page. Each page picks which filters to expose in the UI
 * and maps the filter state to its own API call parameters.
 *
 * Server-side filters: category, hierarchyEntityId, periodType (trigger re-fetch)
 * Client-side filters: search, status (applied to already-fetched data)
 */

import { useState, useMemo, useCallback } from "react"

// ============================================
// Filter Types (shared across all pages)
// ============================================

export type FilterCategory = "cloud" | "genai" | "subscription" | "total" | "all"
export type FilterPeriod = "monthly" | "quarterly" | "yearly" | "custom" | "all"
export type FilterStatus = "all" | "over" | "under" | "active" | "inactive" | "paused"
export type FilterTimeRange = "7" | "14" | "30" | "90" | "365" | "mtd" | "ytd" | "custom" | "all"

export interface AdvancedFilterState {
  /** Text search — client-side filtering on names/labels */
  search: string
  /** Cost category filter — server-side where supported */
  category: FilterCategory
  /** Period type filter — server-side for budgets */
  periodType: FilterPeriod
  /** Status filter — client-side (over/under budget, active/inactive alert) */
  status: FilterStatus
  /** Hierarchy entity filter — server-side */
  hierarchyEntityId: string // "all" or entity ID
  /** Provider filter — server-side or client-side */
  provider: string // "all" or provider name
  /** Time range — server-side for costs/alerts */
  timeRange: FilterTimeRange
  /** Custom date range (when timeRange = "custom") */
  customStartDate?: string
  customEndDate?: string
}

export const DEFAULT_FILTERS: AdvancedFilterState = {
  search: "",
  category: "all",
  periodType: "all",
  status: "all",
  hierarchyEntityId: "all",
  provider: "all",
  timeRange: "all",
}

/** Which filters are enabled for a given page */
export interface FilterConfig {
  search?: boolean
  category?: boolean
  periodType?: boolean
  status?: boolean
  hierarchyEntity?: boolean
  provider?: boolean
  timeRange?: boolean
}

// ============================================
// Hook
// ============================================

export function useAdvancedFilters(config?: FilterConfig) {
  const [filters, setFilters] = useState<AdvancedFilterState>(DEFAULT_FILTERS)

  /** Count of active (non-default) filters */
  const activeCount = useMemo(() => {
    let count = 0
    if (filters.search) count++
    if (config?.category === true && filters.category !== "all") count++
    if (config?.periodType === true && filters.periodType !== "all") count++
    if (config?.status === true && filters.status !== "all") count++
    if (config?.hierarchyEntity === true && filters.hierarchyEntityId !== "all") count++
    if (config?.provider === true && filters.provider !== "all") count++
    if (config?.timeRange === true && filters.timeRange !== "all") count++
    return count
  }, [filters, config])

  /** Update one or more filter fields */
  const updateFilters = useCallback((partial: Partial<AdvancedFilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
  }, [])

  /** Reset all filters to defaults */
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  // Server-side filter params (for API calls)
  const serverParams = useMemo(() => ({
    category: filters.category !== "all" ? filters.category : undefined,
    hierarchyEntityId: filters.hierarchyEntityId !== "all" ? filters.hierarchyEntityId : undefined,
    periodType: filters.periodType !== "all" ? filters.periodType : undefined,
    provider: filters.provider !== "all" ? filters.provider : undefined,
    timeRange: filters.timeRange !== "all" ? filters.timeRange : undefined,
    customStartDate: filters.customStartDate,
    customEndDate: filters.customEndDate,
  }), [filters.category, filters.hierarchyEntityId, filters.periodType, filters.provider, filters.timeRange, filters.customStartDate, filters.customEndDate])

  // Client-side filter params (for post-fetch filtering)
  const clientParams = useMemo(() => ({
    search: filters.search.toLowerCase(),
    status: filters.status,
  }), [filters.search, filters.status])

  /** Check if server-side filters changed (triggers re-fetch) */
  const serverFilterKey = useMemo(
    () => JSON.stringify(serverParams),
    [serverParams]
  )

  return {
    filters,
    setFilters,
    updateFilters,
    clearFilters,
    activeCount,
    serverParams,
    clientParams,
    serverFilterKey,
  }
}

// ============================================
// Client-side filter helpers
// ============================================

/** Generic search filter on multiple string fields */
export function matchesSearch<T>(item: T, fields: (keyof T)[], query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return fields.some((field) => {
    const val = item[field]
    return typeof val === "string" && val.toLowerCase().includes(q)
  })
}

/** Budget-specific status filter */
export function matchesBudgetStatus(isOverBudget: boolean, status: FilterStatus): boolean {
  if (status === "all") return true
  if (status === "over") return isOverBudget
  if (status === "under") return !isOverBudget
  return true
}

/** Alert-specific status filter */
export function matchesAlertStatus(isActive: boolean, isPaused: boolean, status: FilterStatus): boolean {
  if (status === "all") return true
  if (status === "active") return isActive && !isPaused
  if (status === "inactive") return !isActive
  if (status === "paused") return isPaused
  return true
}
