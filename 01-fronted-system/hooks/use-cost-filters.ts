"use client"

/**
 * useCostFilters - Shared hook for cost dashboard filtering
 *
 * Provides consistent filter state management across all cost pages:
 * - Default time range: 365 days
 * - Category presets for specific cost types (genai, cloud, saas)
 * - Reusable filter state with proper defaults
 */

import { useState, useCallback, useMemo } from "react"
import type { TimeRange } from "@/contexts/cost-data-context"
import type { CostFiltersState } from "@/components/costs"

// ============================================
// Types
// ============================================

export type CostCategory = "genai" | "cloud" | "subscription"

export interface UseCostFiltersOptions {
  /** Default time range - defaults to "365" */
  defaultTimeRange?: TimeRange
  /** Default category filter - sets category filter on mount */
  defaultCategory?: CostCategory
  /** Default categories (array) - for pages that show multiple categories */
  defaultCategories?: CostCategory[]
}

export interface UseCostFiltersReturn {
  /** Current time range */
  timeRange: TimeRange
  /** Set time range */
  setTimeRange: (range: TimeRange) => void
  /** Current filter state */
  filters: CostFiltersState
  /** Set filters */
  setFilters: (filters: CostFiltersState) => void
  /** Update specific filter fields */
  updateFilters: (updates: Partial<CostFiltersState>) => void
  /** Reset filters to defaults */
  resetFilters: () => void
  /** Check if any non-time filters are active */
  hasActiveFilters: boolean
  /** Check if provider filter is active */
  hasProviderFilter: boolean
}

// ============================================
// Constants
// ============================================

/** Default time range for all cost pages */
export const DEFAULT_TIME_RANGE: TimeRange = "365"

/** Time range options for cost filters */
export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; shortLabel: string }[] = [
  { value: "365", label: "Last 365 Days", shortLabel: "1Y" },
  { value: "ytd", label: "Year to Date", shortLabel: "YTD" },
  { value: "qtd", label: "This Quarter", shortLabel: "QTD" },
  { value: "90", label: "Last 90 Days", shortLabel: "90D" },
  { value: "mtd", label: "Month to Date", shortLabel: "MTD" },
  { value: "30", label: "Last 30 Days", shortLabel: "30D" },
  { value: "last_month", label: "Last Month", shortLabel: "LM" },
  { value: "14", label: "Last 14 Days", shortLabel: "14D" },
  { value: "7", label: "Last 7 Days", shortLabel: "7D" },
]

// ============================================
// Helper Functions
// ============================================

/**
 * Create default filter state with optional category preset
 */
export function createDefaultFilters(options?: UseCostFiltersOptions): CostFiltersState {
  const categories: string[] = []

  // Set default category if provided
  if (options?.defaultCategory) {
    categories.push(options.defaultCategory)
  } else if (options?.defaultCategories && options.defaultCategories.length > 0) {
    categories.push(...options.defaultCategories)
  }

  return {
    department: undefined,
    project: undefined,
    team: undefined,
    providers: [],
    categories,
  }
}

/**
 * Get display label for time range
 */
export function getTimeRangeLabel(timeRange: TimeRange): string {
  const option = TIME_RANGE_OPTIONS.find((opt) => opt.value === timeRange)
  return option?.label || "Last 365 Days"
}

/**
 * Get short label for time range
 */
export function getTimeRangeShortLabel(timeRange: TimeRange): string {
  const option = TIME_RANGE_OPTIONS.find((opt) => opt.value === timeRange)
  return option?.shortLabel || "1Y"
}

// ============================================
// Hook
// ============================================

export function useCostFilters(options?: UseCostFiltersOptions): UseCostFiltersReturn {
  const defaultTimeRange = options?.defaultTimeRange ?? DEFAULT_TIME_RANGE

  // Initialize state with defaults
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultTimeRange)
  const [filters, setFiltersState] = useState<CostFiltersState>(() =>
    createDefaultFilters(options)
  )

  // Memoize default filters for reset
  const initialFilters = useMemo(() => createDefaultFilters(options), [
    options?.defaultCategory,
    options?.defaultCategories,
  ])

  // Set filters handler
  const setFilters = useCallback((newFilters: CostFiltersState) => {
    setFiltersState(newFilters)
  }, [])

  // Partial update handler
  const updateFilters = useCallback((updates: Partial<CostFiltersState>) => {
    setFiltersState(prev => ({ ...prev, ...updates }))
  }, [])

  // Reset handler
  const resetFilters = useCallback(() => {
    setFiltersState(initialFilters)
    setTimeRange(defaultTimeRange)
  }, [initialFilters, defaultTimeRange])

  // Check if any non-time filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.department ||
      filters.project ||
      filters.team ||
      filters.providers.length > 0 ||
      // Only count categories as active if different from default
      (options?.defaultCategory
        ? filters.categories.length !== 1 || filters.categories[0] !== options.defaultCategory
        : filters.categories.length > 0)
    )
  }, [filters, options?.defaultCategory])

  // Check if provider filter is active
  const hasProviderFilter = useMemo(() => {
    return filters.providers.length > 0
  }, [filters.providers])

  return {
    timeRange,
    setTimeRange,
    filters,
    setFilters,
    updateFilters,
    resetFilters,
    hasActiveFilters,
    hasProviderFilter,
  }
}

export default useCostFilters
