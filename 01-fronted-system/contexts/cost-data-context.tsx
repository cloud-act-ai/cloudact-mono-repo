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
  getCostTrendGranular,
  type TotalCostSummary,
  type ProviderBreakdown,
  type PeriodCostsData,
  type GranularCostRow,
  type GranularFiltersAvailable,
} from "@/actions/costs"
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
  getFilteredProviderBreakdown: () => { provider: string; total_cost: number; percentage: number; record_count: number }[]

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

// ============================================
// PERF-001: Calculate Period Costs from Granular Data (Client-Side)
// ============================================
// This eliminates 12 API calls by computing period costs from cached granular data
//
// BEFORE: getExtendedPeriodCosts → 12 parallel getTotalCosts API calls → 12 BigQuery queries
// AFTER:  calculatePeriodCostsFromGranular → Single pass over cached data (instant)

interface PeriodRange {
  startDate: string
  endDate: string
}

/**
 * Calculate cost for a specific period from granular data.
 * Filters granular rows by date range and sums total_cost.
 *
 * @param granularData - Cached 365 days of granular cost data
 * @param period - Start and end date (YYYY-MM-DD format)
 * @returns Total cost for the period
 */
function calculatePeriodCost(granularData: GranularCostRow[], period: PeriodRange): number {
  if (!granularData || granularData.length === 0) return 0

  const startTs = new Date(period.startDate).getTime()
  const endTs = new Date(period.endDate).getTime()

  let total = 0
  for (const row of granularData) {
    if (!row.date) continue
    const rowTs = new Date(row.date).getTime()
    if (rowTs >= startTs && rowTs <= endTs) {
      total += row.total_cost || 0
    }
  }

  return total
}

/**
 * Calculate all period costs from granular data in a single pass.
 * PERF-001: This replaces 12 separate API calls with instant client-side calculation.
 *
 * @param granularData - Cached 365 days of granular cost data
 * @param fiscalStartMonth - Fiscal year start month (1-12, default 4 = April)
 * @returns PeriodCostsData with all period totals
 */
function calculatePeriodCostsFromGranular(
  granularData: GranularCostRow[],
  fiscalStartMonth: number = 4
): PeriodCostsData {
  // Get all period date ranges (same as getExtendedPeriodCosts used)
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
    last30Days: getLast30DaysRange(),
    previous30Days: getPrevious30DaysRange(),
    november: getNovemberRange(),
    december: getDecemberRange(),
  }

  // Calculate all period costs from granular data (single-pass friendly)
  const fytdCost = calculatePeriodCost(granularData, periods.fytd)
  const fyForecast = calculateFiscalYearForecast(
    fytdCost,
    periods.fytd.days,
    periods.fy.days
  )

  return {
    yesterday: calculatePeriodCost(granularData, periods.yesterday),
    wtd: calculatePeriodCost(granularData, periods.wtd),
    lastWeek: calculatePeriodCost(granularData, periods.lastWeek),
    mtd: calculatePeriodCost(granularData, periods.mtd),
    previousMonth: calculatePeriodCost(granularData, periods.previousMonth),
    last2Months: calculatePeriodCost(granularData, periods.last2Months),
    ytd: calculatePeriodCost(granularData, periods.ytd),
    fytd: fytdCost,
    fyForecast,
    dataAsOf: periods.yesterday.endDate,
    last30Days: calculatePeriodCost(granularData, periods.last30Days),
    previous30Days: calculatePeriodCost(granularData, periods.previous30Days),
    november: calculatePeriodCost(granularData, periods.november),
    december: calculatePeriodCost(granularData, periods.december),
  }
}

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
    case "qtd": {
      // Quarter to date
      const quarterMonth = Math.floor(today.getMonth() / 3) * 3
      startDate = new Date(today.getFullYear(), quarterMonth, 1)
      startDate.setHours(0, 0, 0, 0)
      break
    }
    case "last_month":
      // Last full month
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(today.getFullYear(), today.getMonth(), 0)
      endDate.setHours(23, 59, 59, 999)
      break
    default: {
      // Numeric days (365, 90, 30, 14, 7)
      const days = parseInt(timeRange, 10) || 30
      startDate = new Date(today)
      startDate.setDate(startDate.getDate() - days + 1)
      startDate.setHours(0, 0, 0, 0)
    }
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
   * @param filtersOverride - Optional filters to use instead of state.filters (CTX-001 fix)
   */
  const fetchCostData = useCallback(async (
    clearBackendCache: boolean = false,
    filtersOverride?: UnifiedFilters
  ) => {
    if (!orgSlug) return

    // Prevent duplicate fetches if already in progress
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    // Cancel any in-flight request (ENT-002 fix)
    if (mainFetchAbortRef.current) {
      mainFetchAbortRef.current.abort()
    }
    const abortController = new AbortController()
    mainFetchAbortRef.current = abortController

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      // Calculate 365-day date range for consistent data
      const today = new Date()
      const startOfRange = new Date(today)
      startOfRange.setDate(startOfRange.getDate() - 365)

      // TZ-005 FIX: Use local date formatting instead of toISOString() to avoid timezone shifts
      // toISOString() converts to UTC which can shift the date by one day for users in
      // negative UTC offsets (e.g., 2024-01-15 00:00:00 PST becomes 2024-01-14 in UTC)
      const formatLocalDate = (d: Date): string => {
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        return `${year}-${month}-${day}`
      }
      const endDate = formatLocalDate(today)
      const startDate = formatLocalDate(startOfRange)

      // CTX-001 FIX: Use filtersOverride if provided to avoid stale closure
      // When setUnifiedFilters calls fetchCostData, React hasn't committed
      // the state update yet, so state.filters would be stale.
      // We read from ref to get latest filters without re-creating callback
      const effectiveFilters = filtersOverride

      // Build hierarchy filters from unified filters for API calls
      const departmentId = effectiveFilters?.departmentId
      const projectId = effectiveFilters?.projectId
      const teamId = effectiveFilters?.teamId
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

      // ENT-003 FIX: Add timeout wrapper (30 seconds)
      // BUG-005 FIX: Store timeout ID to clear it when fetch completes, and abort on timeout
      const FETCH_TIMEOUT_MS = 30000
      let timeoutId: NodeJS.Timeout | null = null
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          // Abort the controller when timeout fires to stop any pending requests
          abortController.abort()
          reject(new Error("Request timeout after 30 seconds"))
        }, FETCH_TIMEOUT_MS)
      })

      // PERF-001: Fetch core data in parallel (reduced from 5+12=17 to 4 API calls)
      // Period costs now calculated client-side from granular data
      const fetchPromise = Promise.all([
        getTotalCosts(orgSlug, startDate, endDate, apiFilters),
        getCostByProvider(orgSlug, startDate, endDate, apiFilters),
        getHierarchy(orgSlug),
        getCostTrendGranular(orgSlug, 365, clearBackendCache),
      ])

      // Race between fetch and timeout (ENT-003 fix)
      const [
        totalCostsResult,
        providerResult,
        hierarchyResult,
        granularResult,
      ] = await Promise.race([fetchPromise, timeoutPromise])

      // BUG-005 FIX: Clear timeout when fetch completes successfully
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      // STATE-001 FIX: Check abort/unmount IMMEDIATELY after await
      if (abortController.signal.aborted || !isMountedRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[CostData] Fetch aborted or unmounted, skipping state update`)
        }
        return
      }

      // Extract hierarchy entities (N-level: uses level_code)
      // HIERARCHY-DEBUG: Log hierarchy fetch result for debugging filter visibility
      if (process.env.NODE_ENV === "development") {
        console.log(`[CostData] Hierarchy fetch result:`, {
          success: hierarchyResult.success,
          error: hierarchyResult.error,
          entityCount: hierarchyResult.data?.entities?.length ?? 0,
          entities: hierarchyResult.data?.entities?.slice(0, 3).map(e => ({
            entity_id: e.entity_id,
            entity_name: e.entity_name,
            level_code: e.level_code,
          })),
        })
      }
      const hierarchyEntities: HierarchyEntity[] =
        hierarchyResult.success && hierarchyResult.data?.entities
          ? hierarchyResult.data.entities.map((h) => ({
              entity_id: h.entity_id,
              entity_name: h.entity_name,
              level_code: h.level_code, // N-level hierarchy
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

      // DATA-002 FIX: Safe extraction with validation for unexpected API structures
      const availableCategories = categoryConfigs
        .filter(cat => {
          if (!cat.data || typeof cat.data !== "object") return false
          const hasProviders = Array.isArray(cat.data.providers) && cat.data.providers.length > 0
          const hasCost = typeof cat.data.total_monthly_cost === "number" && cat.data.total_monthly_cost > 0
          return hasProviders || hasCost
        })
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

        // FILTER-001 FIX: Normalize id to lowercase for consistent filtering
        // Keep name as original case for display
        return {
          id: providerLower,
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

      // PERF-001: Calculate period costs from granular data (client-side)
      // This replaces 12 API calls with instant client-side calculation
      const periodCosts = calculatePeriodCostsFromGranular(granularData)

      // Log successful fetch in dev mode
      if (process.env.NODE_ENV === "development") {
        console.log(`[CostData] Data loaded (PERF-001: 17→4 API calls):`, {
          providers: providerData.length,
          categories: availableCategories.length,
          granularRows: granularData.length,
          granularCacheHit: granularResult.cache_hit,
          cachedRange: `${startDate} to ${endDate}`,
          periodCostsCalculated: 'client-side',
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
        periodCosts, // PERF-001: Now calculated client-side
        hierarchy: hierarchyEntities,
        availableFilters,
        // CALC-003 FIX: Use ?? instead of || to handle null properly
        currency:
          totalCosts?.currency ??
          (providerResult.success ? providerResult.currency : null) ??
          DEFAULT_CURRENCY,
        lastFetchedAt: new Date(),
        dataAsOf: periodCosts.dataAsOf || null,
        cachedDateRange: { start: startDate, end: endDate },
        cacheVersion: prev.cacheVersion + 1,
        isStale: false,
        isLoading: false,
        isInitialized: true,
        error: totalCostsResult.error || providerResult.error || granularResult.error || null,
      }))
    } catch (err) {
      // ERR-002 FIX: Improved error handling with structured logging and clear error state
      const errorMessage = err instanceof Error ? err.message : "Failed to load cost data"
      const errorContext = {
        orgSlug,
        timestamp: new Date().toISOString(),
        errorType: err instanceof Error ? err.name : "Unknown",
      }

      console.error("[CostData] Fetch failed:", errorMessage, errorContext)

      // Always set error state so UI can show error message to user
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInitialized: true,
        error: errorMessage,
        // ERR-002 FIX: Clear stale data on error to prevent showing outdated info
        isStale: true,
      }))
    } finally {
      // Clear fetching flag to allow future fetches (e.g., clear cache)
      isFetchingRef.current = false
    }
  // CTX-001 FIX: Remove state.filters from deps to prevent infinite loop.
  // Filters are passed via filtersOverride parameter when needed.
  }, [orgSlug])

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
   *
   * BUG-FIX: Use functional setState to avoid dependency on state.filters
   * This prevents infinite loops when components have setUnifiedFilters in useEffect deps
   */
  const setUnifiedFilters = useCallback((newFilters: Partial<UnifiedFilters>) => {
    setState((prev) => {
      // Merge with current filters using functional update
      const updatedFilters: UnifiedFilters = {
        ...prev.filters,
        ...newFilters,
      }

      // Check cache decision using prev state
      const decision = getL1CacheDecision(
        updatedFilters,
        prev.cachedDateRange,
        prev.granularData.length > 0
      )

      if (decision === "L1_USE_CACHE") {
        // Instant - just update filters, no API call
        if (process.env.NODE_ENV === "development") {
          console.log(`[CostData] L1_USE_CACHE: Filters updated (instant)`, updatedFilters)
        }
        return {
          ...prev,
          filters: updatedFilters,
          cacheVersion: prev.cacheVersion + 1,
        }
      }

      // L1_NO_CACHE - need to fetch new data
      if (process.env.NODE_ENV === "development") {
        console.log(`[CostData] L1_NO_CACHE: Fetching new data for filters`, updatedFilters)
      }

      // Schedule fetch after state update
      // Use setTimeout to ensure state is committed before fetch
      setTimeout(() => fetchCostData(false, updatedFilters), 0)

      return {
        ...prev,
        filters: updatedFilters,
        isStale: true,
      }
    })
  }, [fetchCostData]) // BUG-FIX: Only depend on fetchCostData, not state

  /**
   * Get filtered granular data based on current unified filters.
   * Returns the filtered data for charts/tables.
   */
  const getFilteredGranularData = useCallback((): GranularCostRow[] => {
    if (!state.granularData || state.granularData.length === 0) {
      return []
    }

    // Convert TimeRange to DateRange for filtering
    const dateRange = timeRangeToDateRange(state.filters.timeRange, state.filters.customRange)

    // Apply all filters
    const filtered = applyGranularFilters(state.granularData, {
      dateRange: { start: dateRange.start, end: dateRange.end, label: "" },
      providers: state.filters.providers,
      categories: state.filters.categories,
      departmentId: state.filters.departmentId,
      projectId: state.filters.projectId,
      teamId: state.filters.teamId,
    })

    return filtered
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
  const getFilteredProviderBreakdown = useCallback((): { provider: string; total_cost: number; percentage: number; record_count: number }[] => {
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
 * FIX-012: Use undefined locale to respect user's browser locale
 * FIX-016: Memoize transformation to prevent recalculation on every render
 */
export function useDailyTrend() {
  const { getFilteredTimeSeries, granularData, isLoading, error, currency } = useCostData()

  // FIX-016: Memoize time series to prevent recalculation
  const timeSeries = useMemo(() => getFilteredTimeSeries(), [getFilteredTimeSeries])

  // FIX-016: Memoize the entire transformation
  const { trendData, summary } = useMemo(() => {
    // Transform to DailyTrendDataPoint format with labels
    const data: DailyTrendDataPoint[] = timeSeries.map((point) => {
      const date = new Date(point.date)
      return {
        date: point.date,
        // FIX-012: Use undefined locale to respect user's browser locale
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: point.total,
        rollingAvg: 0, // Calculated below
      }
    })

    // Calculate rolling average
    const totalCost = data.reduce((sum, d) => sum + d.value, 0)
    const avgDaily = data.length > 0 ? totalCost / data.length : 0
    data.forEach(d => { d.rollingAvg = Math.round(avgDaily * 100) / 100 })

    // Calculate summary stats for the selected range
    const summaryData = {
      totalCost,
      averageDailyCost: avgDaily,
      dataPoints: data.length,
      hasData: granularData.length > 0,
    }

    return { trendData: data, summary: summaryData }
  }, [timeSeries, granularData.length])

  return { trendData, summary, isLoading, error, currency }
}
