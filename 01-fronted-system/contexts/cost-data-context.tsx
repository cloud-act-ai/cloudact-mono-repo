"use client"

/**
 * Cost Data Context - Unified Filter Architecture
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ONE FETCH, ALL FILTERS CLIENT-SIDE                                      │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  FRONTEND: granularData (365 days) → ALL filters client-side (instant)  │
 * │  BACKEND:  Polars cache (until midnight org TZ) → BigQuery              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * USE CACHE (instant):           NEW API (fetch):
 * - Time: 7d/30d/90d/365d/etc    - Initial load
 * - Provider filter              - Custom range > 365 days
 * - Category filter              - clearBackendCache()
 * - Hierarchy filter             - Org changed
 * - Custom ≤ 365 days
 *
 * KEY FUNCTIONS:
 * - setUnifiedFilters()    → All filter changes (instant)
 * - getFilteredGranularData()  → Filtered data for charts/tables
 * - clearBackendCache()    → Force fresh from BigQuery
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

import {
  getTotalCosts,
  getCostByProvider,
  getExtendedPeriodCosts,
  getCostTrendGranular,
  type TotalCostSummary,
  type ProviderBreakdown,
  type PeriodCostsData,
  type GranularCostRow,
  type GranularFiltersAvailable,
} from "@/actions/costs"
import { getHierarchy } from "@/actions/hierarchy"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import type { HierarchyEntity } from "@/components/costs"
import {
  applyGranularFilters,
  granularToTimeSeries,
  granularToProviderBreakdown,
  granularToCategoryBreakdown,
  granularTotalCost,
} from "@/lib/costs"
// Note: Provider categorization now comes from backend (totalCosts.genai/cloud/subscription.providers)
// No hardcoded provider sets needed!

// ============================================
// Types
// ============================================

/** Time range options for filtering dashboard data */
export type TimeRange =
  | "mtd"        // Month to Date
  | "ytd"        // Year to Date
  | "qtd"        // Quarter to Date
  | "last_month" // Last full month
  | "365"        // Last 365 days
  | "90"         // Last 90 days
  | "30"         // Last 30 days
  | "14"         // Last 14 days
  | "7"          // Last 7 days
  | "custom"     // Custom date range

/** Custom date range for when TimeRange is "custom" */
export interface CustomDateRange {
  startDate: string  // YYYY-MM-DD format
  endDate: string    // YYYY-MM-DD format
}

/** Daily trend data point with rolling average */
export interface DailyTrendDataPoint {
  /** Date in YYYY-MM-DD format */
  date: string
  /** Label for X-axis (e.g., "Jan 1", "15") */
  label: string
  /** Daily cost value */
  value: number
  /** Rolling average value (calculated based on time range) */
  rollingAvg: number
}

/** Available filter options derived from backend data */
export interface AvailableFilters {
  /** Categories with data (genai, cloud, subscription) */
  categories: Array<{
    id: string
    name: string
    color: string
    providerCount: number
    totalCost: number
  }>
  /** All providers grouped by category */
  providers: Array<{
    id: string
    name: string
    category: "genai" | "cloud" | "subscription"
    totalCost: number
  }>
  /** Hierarchy entities (from getHierarchy) */
  hierarchy: HierarchyEntity[]
}


/**
 * Unified filters - ALL filters are client-side on granular data.
 * No distinction between "hierarchy filters" and "other filters".
 * Time range, provider, category, hierarchy - all the same.
 */
export interface UnifiedFilters {
  // Time filters
  timeRange: TimeRange
  customRange?: CustomDateRange
  // Provider/Category filters
  providers?: string[]
  categories?: ("genai" | "cloud" | "subscription" | "other")[]
  // Hierarchy filters (same as above - just another filter dimension)
  departmentId?: string
  projectId?: string
  teamId?: string
}


export interface CostDataState {
  // SOURCE OF TRUTH: 365 days of granular data
  granularData: GranularCostRow[]
  granularFiltersAvailable: GranularFiltersAvailable | null

  // UNIFIED FILTERS (all client-side, instant)
  filters: UnifiedFilters

  // Aggregated data (derived from granularData)
  totalCosts: TotalCostSummary | null
  providerBreakdown: ProviderBreakdown[]
  periodCosts: PeriodCostsData | null
  hierarchy: HierarchyEntity[]
  availableFilters: AvailableFilters

  // Metadata
  currency: string
  lastFetchedAt: Date | null
  dataAsOf: string | null
  cachedDateRange: { start: string; end: string } | null
  cacheVersion: number
  isStale: boolean

  // Loading states
  isLoading: boolean
  isInitialized: boolean
  error: string | null
}

export interface CostDataContextValue extends CostDataState {
  // ============================================
  // UNIFIED FILTER ACTIONS (ALL client-side, instant)
  // ============================================

  /**
   * Set unified filters - ALL filter types in one call.
   * NO API calls. Instant client-side filtering.
   *
   * @example
   * setUnifiedFilters({
   *   timeRange: "30",
   *   providers: ["openai"],
   *   categories: ["genai"],
   *   departmentId: "DEPT001",
   * })
   */
  setUnifiedFilters: (filters: Partial<UnifiedFilters>) => void

  /**
   * Get filtered granular data based on current unified filters.
   * Returns the filtered data for charts/tables.
   */
  getFilteredGranularData: () => GranularCostRow[]

  /**
   * Get time series from filtered granular data.
   * Aggregates by date for trend charts.
   */
  getFilteredTimeSeries: () => { date: string; total: number }[]

  /**
   * Get provider breakdown from filtered granular data.
   */
  getFilteredProviderBreakdown: () => { provider: string; total_cost: number; percentage: number }[]

  /**
   * Get category breakdown from filtered granular data.
   */
  getFilteredCategoryBreakdown: () => { category: string; total_cost: number; percentage: number }[]

  /**
   * Get total cost from filtered granular data.
   */
  getFilteredTotalCost: () => number

  // ============================================
  // CORE ACTIONS
  // ============================================
  refresh: () => Promise<void>
  fetchIfNeeded: () => Promise<void>
  invalidateCache: () => void

  /**
   * Clear backend Polars LRU cache and fetch fresh data from BigQuery.
   * Use this when:
   * - Backend data has changed (new pipeline run, schema changes)
   * - User explicitly requests fresh data via "Clear Cache" button
   * - Debugging data inconsistencies between dashboard and BigQuery
   *
   * This is MORE expensive than refresh() as it bypasses backend Polars caching.
   */
  clearBackendCache: () => Promise<void>

  // ============================================
  // CHART HELPERS (used by chart library components)
  // ============================================

  /**
   * Get providers filtered by category.
   * Used by CostBreakdownChart and CostDataTable.
   */
  getFilteredProviders: (category: "cloud" | "genai" | "subscription") => ProviderBreakdown[]

  // Current org
  orgSlug: string
}

// ============================================
// Context
// ============================================

const CostDataContext = createContext<CostDataContextValue | null>(null)

// ============================================
// Hook
// ============================================

export function useCostData(): CostDataContextValue {
  const context = useContext(CostDataContext)
  if (!context) {
    throw new Error("useCostData must be used within a CostDataProvider")
  }
  return context
}

// Optional hook that returns null if context is not available
export function useCostDataOptional(): CostDataContextValue | null {
  return useContext(CostDataContext)
}

// ============================================
// Provider
// ============================================

interface CostDataProviderProps {
  children: ReactNode
  orgSlug: string
}

// ============================================
// L1 Cache Decision Logic
// ============================================
//
// L1 CACHE = granularData (365 days, all dimensions)
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  L1-USE-CACHE (instant, no API call):                          │
// │  ├── Time range: 7d, 14d, 30d, 90d, 365d, mtd, qtd, ytd       │
// │  ├── Provider filter change                                    │
// │  ├── Category filter change                                    │
// │  ├── Hierarchy filter change (dept/proj/team)                 │
// │  └── Custom range WITHIN 365 days                             │
// ├─────────────────────────────────────────────────────────────────┤
// │  L1-NO-CACHE (requires new API call):                          │
// │  ├── Initial load (no data yet)                               │
// │  ├── Custom range BEYOND 365 days                             │
// │  ├── Explicit refresh requested                               │
// │  └── Organization changed                                      │
// └─────────────────────────────────────────────────────────────────┘

type L1CacheDecision = "L1_USE_CACHE" | "L1_NO_CACHE"

/**
 * Determine if a custom date range is within the L1 cached 365-day window.
 */
function isRangeWithinL1Cache(
  customRange: CustomDateRange | undefined,
  cachedRange: { start: string; end: string } | null
): boolean {
  if (!customRange || !cachedRange) return true // Non-custom ranges always use L1 cache

  const requestedStart = new Date(customRange.startDate).getTime()
  const requestedEnd = new Date(customRange.endDate).getTime()
  const cachedStart = new Date(cachedRange.start).getTime()
  const cachedEnd = new Date(cachedRange.end).getTime()

  // Check if requested range is fully within L1 cached range
  return requestedStart >= cachedStart && requestedEnd <= cachedEnd
}

/**
 * Determine L1 cache decision.
 *
 * @returns
 * - "L1_USE_CACHE" → Filter existing granularData (instant, no API call)
 * - "L1_NO_CACHE" → Fetch new granularData from backend
 */
function getL1CacheDecision(
  filters: UnifiedFilters,
  cachedRange: { start: string; end: string } | null,
  hasGranularData: boolean
): L1CacheDecision {
  // L1-NO-CACHE: Initial load (no data yet)
  if (!hasGranularData || !cachedRange) {
    return "L1_NO_CACHE"
  }

  // L1-USE-CACHE: Standard preset ranges (7d, 30d, 90d, 365d, mtd, ytd, etc.)
  if (filters.timeRange !== "custom") {
    return "L1_USE_CACHE"
  }

  // L1-USE-CACHE: Custom range WITHIN 365-day cached window
  if (isRangeWithinL1Cache(filters.customRange, cachedRange)) {
    return "L1_USE_CACHE"
  }

  // L1-NO-CACHE: Custom range BEYOND 365 days
  return "L1_NO_CACHE"
}


// ============================================
// Time Range to DateRange Conversion
// ============================================

/**
 * Check if a time range is within last 365 days (L1 cache boundary).
 * Returns true for all preset ranges (7d, 30d, 90d, mtd, ytd, etc.)
 * and custom ranges that fall within 365 days from today.
 */
function isWithin365Days(
  timeRange: TimeRange,
  customRange?: CustomDateRange
): boolean {
  // All preset ranges (7, 14, 30, 90, 365, mtd, ytd, qtd, last_month)
  // are by definition within the last 365 days
  if (timeRange !== "custom") {
    return true
  }

  // Custom range - check if within 365-day window
  if (!customRange) return true

  const today = new Date()
  const startOf365 = new Date(today)
  startOf365.setDate(startOf365.getDate() - 365)

  const requestedStart = new Date(customRange.startDate)
  return requestedStart >= startOf365
}

/**
 * Convert TimeRange + CustomDateRange to a DateRange object for filtering.
 * Used by granular filter functions.
 */
function timeRangeToDateRange(
  timeRange: TimeRange,
  customRange?: CustomDateRange
): { start: Date; end: Date } {
  const today = new Date()
  today.setHours(23, 59, 59, 999) // End of today

  let startDate: Date
  let endDate: Date = today

  switch (timeRange) {
    case "custom":
      if (customRange?.startDate && customRange?.endDate) {
        startDate = new Date(customRange.startDate)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(customRange.endDate)
        endDate.setHours(23, 59, 59, 999)
      } else {
        // Fallback to 30 days if no custom range
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 30)
        startDate.setHours(0, 0, 0, 0)
      }
      break
    case "mtd":
      // Month to date
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
      startDate.setHours(0, 0, 0, 0)
      break
    case "ytd":
      // Year to date
      startDate = new Date(today.getFullYear(), 0, 1)
      startDate.setHours(0, 0, 0, 0)
      break
    case "qtd":
      // Quarter to date
      const quarterMonth = Math.floor(today.getMonth() / 3) * 3
      startDate = new Date(today.getFullYear(), quarterMonth, 1)
      startDate.setHours(0, 0, 0, 0)
      break
    case "last_month":
      // Last full month
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(today.getFullYear(), today.getMonth(), 0)
      endDate.setHours(23, 59, 59, 999)
      break
    default:
      // Numeric days (365, 90, 30, 14, 7)
      const days = parseInt(timeRange, 10) || 30
      startDate = new Date(today)
      startDate.setDate(startDate.getDate() - days + 1)
      startDate.setHours(0, 0, 0, 0)
  }

  return { start: startDate, end: endDate }
}

export function CostDataProvider({ children, orgSlug }: CostDataProviderProps) {
  // Track in-flight requests to prevent duplicate fetches
  const isFetchingRef = useRef(false)

  // Track mounted state to prevent setState after unmount (CRITICAL: STATE-001 fix)
  const isMountedRef = useRef(true)

  // AbortController for main fetchCostData (CACHE-005 fix)
  const mainFetchAbortRef = useRef<AbortController | null>(null)

  // Track previous orgSlug to detect org changes (CACHE-004 fix)
  const prevOrgSlugRef = useRef<string>(orgSlug)

  // State
  const [state, setState] = useState<CostDataState>({
    // L1 CACHE: Granular Data (365 days, all dimensions)
    granularData: [],
    granularFiltersAvailable: null,

    // UNIFIED FILTERS (all client-side, instant)
    filters: {
      timeRange: "365",
      customRange: undefined,
      providers: undefined,
      categories: undefined,
      departmentId: undefined,
      projectId: undefined,
      teamId: undefined,
    },

    // Aggregated data (populated from backend, filtered client-side)
    totalCosts: null,
    providerBreakdown: [],
    periodCosts: null,
    hierarchy: [],
    availableFilters: {
      categories: [],
      providers: [],
      hierarchy: [],
    },

    // Metadata
    currency: DEFAULT_CURRENCY,
    lastFetchedAt: null,
    dataAsOf: null,
    cachedDateRange: null,
    cacheVersion: 0,
    isStale: false,
    isLoading: false,
    isInitialized: false,
    error: null,
  })

  /**
   * Fetch all cost data from backend (365 days of granular data).
   *
   * This is the primary data fetch that populates the L1 cache (granularData).
   * After this fetch, ALL filters (time, provider, category, hierarchy) are
   * applied client-side via getFilteredGranularData().
   *
   * @param clearBackendCache - If true, bypasses backend Polars LRU cache
   * @param filtersOverride - Optional filters to use instead of state.filters (CTX-005 fix)
   */
  const fetchCostData = useCallback(async (
    clearBackendCache: boolean = false,
    filtersOverride?: UnifiedFilters
  ) => {
    if (!orgSlug) return

    // Prevent duplicate fetches if already in progress
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    // Cancel any in-flight request (CACHE-005 fix)
    if (mainFetchAbortRef.current) {
      mainFetchAbortRef.current.abort()
    }
    mainFetchAbortRef.current = new AbortController()

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      // Calculate 365-day date range for consistent data
      const today = new Date()
      const startOfRange = new Date(today)
      startOfRange.setDate(startOfRange.getDate() - 365)

      const endDate = today.toISOString().split("T")[0]
      const startDate = startOfRange.toISOString().split("T")[0]

      // CTX-005 FIX: Use filtersOverride if provided to avoid stale closure
      // When setUnifiedFilters calls fetchCostData, React hasn't committed
      // the state update yet, so state.filters would be stale.
      const effectiveFilters = filtersOverride ?? state.filters

      // Build hierarchy filters from unified filters for API calls
      const { departmentId, projectId, teamId } = effectiveFilters
      const apiFilters = (departmentId || projectId || teamId)
        ? { departmentId, projectId, teamId }
        : undefined

      // Log fetch in dev mode
      if (process.env.NODE_ENV === "development") {
        console.log(`[CostData] Fetching 365-day data: ${startDate} to ${endDate}`, {
          filters: apiFilters,
          clearBackendCache,
        })
      }

      // Fetch core data in parallel with consistent 365-day range
      // Granular data is the L1 cache source for client-side filtering
      const [
        totalCostsResult,
        providerResult,
        periodCostsResult,
        hierarchyResult,
        granularResult,
      ] = await Promise.all([
        getTotalCosts(orgSlug, startDate, endDate, apiFilters),
        getCostByProvider(orgSlug, startDate, endDate, apiFilters),
        getExtendedPeriodCosts(orgSlug, "total", apiFilters),
        getHierarchy(orgSlug),
        getCostTrendGranular(orgSlug, 365, clearBackendCache),
      ])

      // Check if request was cancelled while waiting for API (CACHE-005 fix)
      if (mainFetchAbortRef.current?.signal.aborted || !isMountedRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[CostData] Fetch aborted or unmounted, skipping state update`)
        }
        return
      }

      // Extract hierarchy entities
      const hierarchyEntities: HierarchyEntity[] =
        hierarchyResult.success && hierarchyResult.data?.entities
          ? hierarchyResult.data.entities.map((h) => ({
              entity_id: h.entity_id,
              entity_name: h.entity_name,
              entity_type: h.entity_type as "department" | "project" | "team",
              parent_id: h.parent_id,
            }))
          : []

      // Build available filters from backend data (DYNAMIC - no hardcoding!)
      const totalCosts = totalCostsResult.success ? totalCostsResult.data : null
      const providerData = providerResult.success && providerResult.data ? providerResult.data : []

      // Build category list from backend response
      const categoryConfigs = [
        { id: "genai", name: "GenAI", color: "#10A37F", data: totalCosts?.genai },
        { id: "cloud", name: "Cloud", color: "#4285F4", data: totalCosts?.cloud },
        { id: "subscription", name: "Subscription", color: "#FF6C5E", data: totalCosts?.subscription },
      ]

      const availableCategories = categoryConfigs
        .filter(cat => cat.data && (cat.data.providers?.length > 0 || cat.data.total_monthly_cost > 0))
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          color: cat.color,
          providerCount: cat.data?.providers?.length ?? 0,
          totalCost: cat.data?.total_monthly_cost ?? 0,
        }))

      // Build provider list with category from backend (derived from totalCosts structure)
      // IMPORTANT: Normalize all provider names to lowercase for case-insensitive matching
      const genaiProviders = new Set(
        (totalCosts?.genai?.providers ?? []).map(p => p.toLowerCase())
      )
      const cloudProviders = new Set(
        (totalCosts?.cloud?.providers ?? []).map(p => p.toLowerCase())
      )
      const subscriptionProviders = new Set(
        (totalCosts?.subscription?.providers ?? []).map(p => p.toLowerCase())
      )

      const availableProviders = providerData.map(p => {
        const providerLower = p.provider.toLowerCase()
        let category: "genai" | "cloud" | "subscription" = "subscription"

        // Use backend's categorization from totalCosts (case-insensitive)
        if (genaiProviders.has(providerLower)) {
          category = "genai"
        } else if (cloudProviders.has(providerLower)) {
          category = "cloud"
        } else if (subscriptionProviders.has(providerLower)) {
          category = "subscription"
        }
        // If not in any backend list, defaults to "subscription" (uncategorized)

        return {
          id: p.provider,
          name: p.provider,
          category,
          totalCost: p.total_cost,
        }
      })

      const availableFilters: AvailableFilters = {
        categories: availableCategories,
        providers: availableProviders,
        hierarchy: hierarchyEntities,
      }

      // Extract granular data for L1 cache
      const granularData = granularResult.success && granularResult.data ? granularResult.data : []
      const granularFiltersAvailable = granularResult.success && granularResult.summary?.available_filters
        ? granularResult.summary.available_filters
        : null

      // Log successful fetch in dev mode
      if (process.env.NODE_ENV === "development") {
        console.log(`[CostData] Data loaded:`, {
          providers: providerData.length,
          categories: availableCategories.length,
          granularRows: granularData.length,
          granularCacheHit: granularResult.cache_hit,
          cachedRange: `${startDate} to ${endDate}`,
        })
      }

      // Update state with fetched data
      setState((prev) => ({
        ...prev,
        // L1 Cache: Granular data for client-side filtering
        granularData,
        granularFiltersAvailable,
        // Aggregated data from backend
        totalCosts,
        providerBreakdown: providerData,
        periodCosts: periodCostsResult.success ? periodCostsResult.data : null,
        hierarchy: hierarchyEntities,
        availableFilters,
        currency:
          totalCosts?.currency ||
          (providerResult.success && providerResult.currency ? providerResult.currency : null) ||
          DEFAULT_CURRENCY,
        lastFetchedAt: new Date(),
        dataAsOf: periodCostsResult.data?.dataAsOf || null,
        cachedDateRange: { start: startDate, end: endDate },
        cacheVersion: prev.cacheVersion + 1,
        isStale: false,
        isLoading: false,
        isInitialized: true,
        error: totalCostsResult.error || providerResult.error || granularResult.error || null,
      }))
    } catch (err) {
      console.error("Cost data fetch error:", err)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInitialized: true,
        error: err instanceof Error ? err.message : "Failed to load cost data",
      }))
    } finally {
      // Clear fetching flag to allow future fetches (e.g., clear cache)
      isFetchingRef.current = false
    }
  }, [orgSlug, state.filters])

  // Fetch if not initialized
  const fetchIfNeeded = useCallback(async () => {
    if (!state.isInitialized && !state.isLoading) {
      await fetchCostData()
    }
  }, [state.isInitialized, state.isLoading, fetchCostData])

  // Clear cache and fetch fresh data (used by "Clear Cache" button)
  const refresh = useCallback(async () => {
    // Mark as stale first for immediate UI feedback
    setState((prev) => ({ ...prev, isStale: true }))
    await fetchCostData()
  }, [fetchCostData])

  /**
   * Clear backend Polars LRU cache and fetch fresh data from BigQuery.
   *
   * Use this when:
   * - Backend data has changed (new pipeline run, schema changes)
   * - User explicitly requests fresh data via "Clear Cache" button
   * - Debugging data inconsistencies between dashboard and BigQuery
   *
   * This passes clear_cache=true to the API, which invalidates the
   * backend Polars LRU cache (TTL: 300s) and queries BigQuery directly.
   */
  const clearBackendCache = useCallback(async () => {
    // Mark as stale first for immediate UI feedback
    setState((prev) => ({ ...prev, isStale: true }))

    if (process.env.NODE_ENV === "development") {
      console.log(`[CostData] Clearing backend Polars cache and fetching fresh data`)
    }

    // Pass clearBackendCache=true to tell backend to bypass its cache
    await fetchCostData(true)
  }, [fetchCostData])

  // Invalidate cache (marks data as stale without fetching)
  const invalidateCache = useCallback(() => {
    setState((prev) => ({ ...prev, isStale: true }))
  }, [])




  // Get providers filtered by category - uses dynamic data from backend
  const getFilteredProviders = useCallback(
    (category: "cloud" | "genai" | "subscription"): ProviderBreakdown[] => {
      // Category key matches backend response directly
      const categoryKey = category

      // Use availableFilters which has category info from backend
      const categoryProviderIds = new Set(
        state.availableFilters.providers
          .filter(p => p.category === categoryKey)
          .map(p => p.id.toLowerCase())
      )

      // Filter providerBreakdown using dynamic category data
      return state.providerBreakdown.filter(p =>
        categoryProviderIds.has(p.provider.toLowerCase())
      )
    },
    [state.providerBreakdown, state.availableFilters.providers]
  )


  // ============================================
  // UNIFIED FILTER FUNCTIONS (ALL client-side, instant)
  // ============================================

  /**
   * Set unified filters - ALL filter types in one call.
   * NO API calls for filter changes within 365 days.
   *
   * L1_USE_CACHE: Time range, provider, category, hierarchy filters
   * L1_NO_CACHE: Initial load, custom range > 365 days, explicit refresh
   */
  const setUnifiedFilters = useCallback((newFilters: Partial<UnifiedFilters>) => {
    // Merge with current filters
    const updatedFilters: UnifiedFilters = {
      ...state.filters,
      ...newFilters,
    }

    // Check cache decision
    const decision = getL1CacheDecision(
      updatedFilters,
      state.cachedDateRange,
      state.granularData.length > 0
    )

    if (decision === "L1_USE_CACHE") {
      // Instant - just update filters, no API call
      setState((prev) => ({
        ...prev,
        filters: updatedFilters,
      }))

      if (process.env.NODE_ENV === "development") {
        console.log(`[CostData] L1_USE_CACHE: Filters updated (instant)`, updatedFilters)
      }
      return
    }

    // L1_NO_CACHE - need to fetch new data
    setState((prev) => ({
      ...prev,
      filters: updatedFilters,
      isStale: true,
    }))

    if (process.env.NODE_ENV === "development") {
      console.log(`[CostData] L1_NO_CACHE: Fetching new data for filters`, updatedFilters)
    }

    // CTX-005 FIX: Pass updatedFilters directly to avoid stale closure
    // React batches state updates, so state.filters would still be old when fetchCostData runs
    fetchCostData(false, updatedFilters)
  }, [state.filters, state.cachedDateRange, state.granularData.length, fetchCostData])

  /**
   * Get filtered granular data based on current unified filters.
   * Returns the filtered data for charts/tables.
   */
  const getFilteredGranularData = useCallback((): GranularCostRow[] => {
    if (!state.granularData || state.granularData.length === 0) return []

    // Convert TimeRange to DateRange for filtering
    const dateRange = timeRangeToDateRange(state.filters.timeRange, state.filters.customRange)

    // Apply all filters
    return applyGranularFilters(state.granularData, {
      dateRange: { start: dateRange.start, end: dateRange.end, label: "" },
      providers: state.filters.providers,
      categories: state.filters.categories,
      departmentId: state.filters.departmentId,
      projectId: state.filters.projectId,
      teamId: state.filters.teamId,
    })
  }, [state.granularData, state.filters])

  /**
   * Get time series from filtered granular data.
   * Aggregates by date for trend charts.
   */
  const getFilteredTimeSeries = useCallback((): { date: string; total: number }[] => {
    const filtered = getFilteredGranularData()
    return granularToTimeSeries(filtered)
  }, [getFilteredGranularData])

  /**
   * Get provider breakdown from filtered granular data.
   */
  const getFilteredProviderBreakdown = useCallback((): { provider: string; total_cost: number; percentage: number }[] => {
    const filtered = getFilteredGranularData()
    return granularToProviderBreakdown(filtered)
  }, [getFilteredGranularData])

  /**
   * Get category breakdown from filtered granular data.
   */
  const getFilteredCategoryBreakdown = useCallback((): { category: string; total_cost: number; percentage: number }[] => {
    const filtered = getFilteredGranularData()
    return granularToCategoryBreakdown(filtered)
  }, [getFilteredGranularData])

  /**
   * Get total cost from filtered granular data.
   */
  const getFilteredTotalCost = useCallback((): number => {
    const filtered = getFilteredGranularData()
    return granularTotalCost(filtered)
  }, [getFilteredGranularData])

  // Detect org slug changes and reset cache (CACHE-004 fix)
  // This ensures data for wrong org is not shown when switching orgs
  useEffect(() => {
    if (orgSlug !== prevOrgSlugRef.current) {
      // Org changed - clear all cached data
      if (process.env.NODE_ENV === "development") {
        console.log(`[CostData] Org changed from ${prevOrgSlugRef.current} to ${orgSlug}, resetting cache`)
      }

      // Reset state to initial values (including granularData and filters)
      setState({
        // L1 Cache (granular data)
        granularData: [],
        granularFiltersAvailable: null,
        // Unified filters
        filters: {
          timeRange: "365",
          customRange: undefined,
          providers: undefined,
          categories: undefined,
          departmentId: undefined,
          projectId: undefined,
          teamId: undefined,
        },
        // Aggregated data
        totalCosts: null,
        providerBreakdown: [],
        periodCosts: null,
        hierarchy: [],
        availableFilters: { categories: [], providers: [], hierarchy: [] },
        // Metadata
        currency: DEFAULT_CURRENCY,
        lastFetchedAt: null,
        dataAsOf: null,
        cachedDateRange: null,
        cacheVersion: 0,
        isStale: false,
        isLoading: false,
        isInitialized: false,
        error: null,
      })

      // Update previous org slug
      prevOrgSlugRef.current = orgSlug
    }
  }, [orgSlug])

  // Auto-fetch on mount if not initialized
  useEffect(() => {
    if (orgSlug && !state.isInitialized && !state.isLoading) {
      fetchCostData()
    }
  }, [orgSlug, state.isInitialized, state.isLoading, fetchCostData])

  // Cleanup on unmount: set mounted flag, abort pending requests
  // CRITICAL: STATE-001 & CACHE-005 fix
  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      // Abort any pending main fetch requests (CACHE-005 fix)
      if (mainFetchAbortRef.current) {
        mainFetchAbortRef.current.abort()
      }
    }
  }, [])

  // Context value
  const value = useMemo<CostDataContextValue>(
    () => ({
      ...state,
      orgSlug,
      // Core actions
      refresh,
      fetchIfNeeded,
      invalidateCache,
      clearBackendCache,  // Force backend Polars cache clear
      // Unified filter actions (ALL client-side, instant)
      setUnifiedFilters,
      getFilteredGranularData,
      getFilteredTimeSeries,
      getFilteredProviderBreakdown,
      getFilteredCategoryBreakdown,
      getFilteredTotalCost,
      // Chart component helpers (still used by chart library)
      getFilteredProviders,
    }),
    [
      state,
      orgSlug,
      refresh,
      fetchIfNeeded,
      invalidateCache,
      clearBackendCache,
      setUnifiedFilters,
      getFilteredGranularData,
      getFilteredTimeSeries,
      getFilteredProviderBreakdown,
      getFilteredCategoryBreakdown,
      getFilteredTotalCost,
      getFilteredProviders,
    ]
  )

  return (
    <CostDataContext.Provider value={value}>
      {children}
    </CostDataContext.Provider>
  )
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Hook to get period costs from cached data
 */
export function usePeriodCosts() {
  const { periodCosts, currency, isLoading, error } = useCostData()
  return { periodCosts, currency, isLoading, error }
}

/**
 * Hook to get provider breakdown from cached data
 */
export function useProviderBreakdown() {
  const { providerBreakdown, currency, isLoading, error } = useCostData()
  return { providers: providerBreakdown, currency, isLoading, error }
}

/**
 * Hook to get total costs summary from cached data
 */
export function useTotalCosts() {
  const { totalCosts, currency, isLoading, error } = useCostData()
  return { totalCosts, currency, isLoading, error }
}

/**
 * Hook to get hierarchy from cached data
 */
export function useHierarchy() {
  const { hierarchy, isLoading } = useCostData()
  return { hierarchy, isLoading }
}

/**
 * Hook to get daily trend data using unified filters.
 * Uses getFilteredTimeSeries() which applies current unified filters.
 *
 * To change the time range or other filters, use setUnifiedFilters() from useCostData().
 */
export function useDailyTrend() {
  const { getFilteredTimeSeries, granularData, isLoading, error, currency } = useCostData()
  const timeSeries = getFilteredTimeSeries()

  // Transform to DailyTrendDataPoint format with labels
  const trendData: DailyTrendDataPoint[] = timeSeries.map((point) => {
    const date = new Date(point.date)
    return {
      date: point.date,
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: point.total,
      rollingAvg: 0, // Calculated below
    }
  })

  // Calculate rolling average
  const totalCost = trendData.reduce((sum, d) => sum + d.value, 0)
  const avgDaily = trendData.length > 0 ? totalCost / trendData.length : 0
  trendData.forEach(d => { d.rollingAvg = Math.round(avgDaily * 100) / 100 })

  // Calculate summary stats for the selected range
  const summary = {
    totalCost,
    averageDailyCost: avgDaily,
    dataPoints: trendData.length,
    hasData: granularData.length > 0,
  }

  return { trendData, summary, isLoading, error, currency }
}
