"use client"

/**
 * Cost Data Context
 *
 * Provides centralized cost data caching across all cost dashboard pages.
 * Data is fetched once when the org layout mounts and cached in memory.
 * Pages consume cached data and can apply client-side filters.
 * Manual refresh is available via the refresh button.
 *
 * Benefits:
 * - Single fetch on initial load (no redundant API calls)
 * - Instant navigation between cost pages
 * - Client-side filtering on cached data
 * - Refresh only when explicitly requested
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"

import {
  getTotalCosts,
  getCostByProvider,
  getExtendedPeriodCosts,
  getCostTrend,
  type TotalCostSummary,
  type ProviderBreakdown,
  type PeriodCostsData,
  type CostFilterParams,
  type CostTrendPoint,
} from "@/actions/costs"
import { getHierarchy } from "@/actions/hierarchy"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import { dateRangeToApiParams, getDefaultDateRange } from "@/components/costs"
import type { HierarchyEntity } from "@/components/costs"
import {
  filterCloudProviders,
  filterGenAIProviders,
  CLOUD_PROVIDER_SET,
  GENAI_PROVIDER_SET,
} from "@/lib/costs"

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

export interface CostDataState {
  // Core cost data
  totalCosts: TotalCostSummary | null
  providerBreakdown: ProviderBreakdown[]
  periodCosts: PeriodCostsData | null
  hierarchy: HierarchyEntity[]

  // Daily trend data (365 days)
  dailyTrendData: CostTrendPoint[]

  // Metadata
  currency: string
  lastFetchedAt: Date | null
  dataAsOf: string | null
  cachedDateRange: { start: string; end: string } | null

  // Loading states
  isLoading: boolean
  isInitialized: boolean
  error: string | null
}

export interface CostDataContextValue extends CostDataState {
  // Actions
  refresh: () => Promise<void>
  fetchIfNeeded: () => Promise<void>

  // Filter application (client-side)
  getFilteredData: (filters: CostFilterParams) => {
    totalCosts: TotalCostSummary | null
    providerBreakdown: ProviderBreakdown[]
  }

  // Get providers filtered by type (cloud, llm, saas)
  getFilteredProviders: (providerType: "cloud" | "llm" | "saas") => ProviderBreakdown[]

  // Get daily trend data filtered by time range with rolling average
  getDailyTrendForRange: (timeRange: TimeRange) => DailyTrendDataPoint[]

  // Check if cached data covers a date range
  isCachedForDateRange: (start: string, end: string) => boolean

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

export function CostDataProvider({ children, orgSlug }: CostDataProviderProps) {
  // State
  const [state, setState] = useState<CostDataState>({
    totalCosts: null,
    providerBreakdown: [],
    periodCosts: null,
    hierarchy: [],
    dailyTrendData: [],
    currency: DEFAULT_CURRENCY,
    lastFetchedAt: null,
    dataAsOf: null,
    cachedDateRange: null,
    isLoading: false,
    isInitialized: false,
    error: null,
  })

  // Fetch all cost data
  const fetchCostData = useCallback(async () => {
    if (!orgSlug) return

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      // Get default date range (MTD)
      const dateRange = getDefaultDateRange()
      const { startDate, endDate } = dateRangeToApiParams(dateRange)

      // Fetch all data in parallel (including 365-day trend data)
      const [
        totalCostsResult,
        providerResult,
        periodCostsResult,
        hierarchyResult,
        dailyTrendResult,
      ] = await Promise.all([
        getTotalCosts(orgSlug, startDate, endDate),
        getCostByProvider(orgSlug, startDate, endDate),
        getExtendedPeriodCosts(orgSlug, "total"),
        getHierarchy(orgSlug),
        getCostTrend(orgSlug, "daily", 365),
      ])

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

      // Update state with fetched data
      setState({
        totalCosts: totalCostsResult.success ? totalCostsResult.data : null,
        providerBreakdown: providerResult.success && providerResult.data ? providerResult.data : [],
        periodCosts: periodCostsResult.success ? periodCostsResult.data : null,
        hierarchy: hierarchyEntities,
        dailyTrendData: dailyTrendResult.success && dailyTrendResult.data ? dailyTrendResult.data : [],
        currency:
          totalCostsResult.data?.currency ||
          (providerResult.success && providerResult.currency ? providerResult.currency : null) ||
          DEFAULT_CURRENCY,
        lastFetchedAt: new Date(),
        dataAsOf: periodCostsResult.data?.dataAsOf || null,
        cachedDateRange: { start: startDate, end: endDate },
        isLoading: false,
        isInitialized: true,
        error: totalCostsResult.error || providerResult.error || null,
      })
    } catch (err) {
      console.error("Cost data fetch error:", err)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInitialized: true,
        error: err instanceof Error ? err.message : "Failed to load cost data",
      }))
    }
  }, [orgSlug])

  // Fetch if not initialized
  const fetchIfNeeded = useCallback(async () => {
    if (!state.isInitialized && !state.isLoading) {
      await fetchCostData()
    }
  }, [state.isInitialized, state.isLoading, fetchCostData])

  // Refresh (always fetches fresh data)
  const refresh = useCallback(async () => {
    await fetchCostData()
  }, [fetchCostData])

  // Client-side filter application
  const getFilteredData = useCallback(
    (filters: CostFilterParams) => {
      let filteredProviders = [...state.providerBreakdown]

      // Apply provider filter
      if (filters.providers && filters.providers.length > 0) {
        const providerSet = new Set(
          filters.providers.map((p) => p.toLowerCase())
        )
        filteredProviders = filteredProviders.filter((p) =>
          providerSet.has(p.provider.toLowerCase())
        )
      }

      // Recalculate totals based on filtered providers
      if (filters.providers && filters.providers.length > 0) {
        const filteredTotal = filteredProviders.reduce(
          (sum, p) => sum + p.total_cost,
          0
        )

        // Create filtered summary (approximation based on provider filter)
        if (state.totalCosts) {
          const ratio =
            state.totalCosts.total.total_monthly_cost > 0
              ? filteredTotal / state.totalCosts.total.total_monthly_cost
              : 0

          const filteredTotalCosts: TotalCostSummary = {
            ...state.totalCosts,
            total: {
              ...state.totalCosts.total,
              total_daily_cost:
                state.totalCosts.total.total_daily_cost * ratio,
              total_monthly_cost:
                state.totalCosts.total.total_monthly_cost * ratio,
              total_annual_cost:
                state.totalCosts.total.total_annual_cost * ratio,
              total_billed_cost:
                (state.totalCosts.total.total_billed_cost || 0) * ratio,
            },
          }

          return {
            totalCosts: filteredTotalCosts,
            providerBreakdown: filteredProviders,
          }
        }
      }

      return {
        totalCosts: state.totalCosts,
        providerBreakdown: filteredProviders,
      }
    },
    [state.totalCosts, state.providerBreakdown]
  )

  // Get providers filtered by type (cloud, llm, saas) - client-side filtering
  const getFilteredProviders = useCallback(
    (providerType: "cloud" | "llm" | "saas"): ProviderBreakdown[] => {
      const providers = state.providerBreakdown

      switch (providerType) {
        case "cloud":
          return filterCloudProviders(providers)
        case "llm":
          return filterGenAIProviders(providers)
        case "saas":
          // SaaS = providers that are NOT cloud AND NOT GenAI
          return providers.filter((p) => {
            if (!p.provider) return false
            const providerLower = p.provider.toLowerCase()
            return (
              !CLOUD_PROVIDER_SET.has(providerLower) &&
              !GENAI_PROVIDER_SET.has(providerLower)
            )
          })
        default:
          return providers
      }
    },
    [state.providerBreakdown]
  )

  // Get daily trend data filtered by time range with rolling average
  const getDailyTrendForRange = useCallback(
    (timeRange: TimeRange): DailyTrendDataPoint[] => {
      const trendData = state.dailyTrendData
      if (!trendData || trendData.length === 0) return []

      // Filter out any items with missing period and sort by date (ascending)
      const validData = trendData.filter((d) => d && d.period)
      if (validData.length === 0) return []

      const sortedData = [...validData].sort((a, b) =>
        (a.period || "").localeCompare(b.period || "")
      )

      // Calculate date range based on time range type
      const today = new Date()
      let startDate: Date
      let days: number

      switch (timeRange) {
        case "mtd":
          // Month to date - from 1st of current month
          startDate = new Date(today.getFullYear(), today.getMonth(), 1)
          days = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
          break
        case "ytd":
          // Year to date - from Jan 1st
          startDate = new Date(today.getFullYear(), 0, 1)
          days = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
          break
        case "qtd":
          // Quarter to date - from start of current quarter
          const quarterMonth = Math.floor(today.getMonth() / 3) * 3
          startDate = new Date(today.getFullYear(), quarterMonth, 1)
          days = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
          break
        case "last_month":
          // Last full month
          const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
          startDate = lastMonthStart
          days = lastMonthEnd.getDate()
          break
        default:
          // Numeric days (365, 90, 30, 14, 7)
          days = parseInt(timeRange, 10) || 30
          startDate = new Date(today)
          startDate.setDate(startDate.getDate() - days + 1)
      }

      // Format startDate as YYYY-MM-DD for comparison
      const startDateStr = startDate.toISOString().split("T")[0]

      // Filter data by date range
      const filteredData = sortedData.filter((d) => d.period >= startDateStr)

      if (filteredData.length === 0) return []

      // Calculate rolling average window based on number of days
      // 365+ days → 30-day rolling avg
      // 90+ days → 14-day rolling avg
      // 30+ days → 7-day rolling avg
      // <30 days → 3-day rolling avg
      const avgWindow = days >= 365 ? 30 : days >= 90 ? 14 : days >= 30 ? 7 : 3

      // Transform and calculate rolling averages
      return filteredData.map((point, index, arr) => {
        const date = new Date(point.period)
        const cost = point.total_billed_cost || point.total_effective_cost || 0

        // Calculate rolling average
        const windowStart = Math.max(0, index - avgWindow + 1)
        const windowData = arr.slice(windowStart, index + 1)
        const rollingAvg =
          windowData.reduce(
            (sum, d) => sum + (d.total_billed_cost || d.total_effective_cost || 0),
            0
          ) / windowData.length

        // Format label based on number of days in range
        let label: string
        if (days >= 180) {
          // For long ranges, show month abbreviation
          label = date.toLocaleDateString("en-US", { month: "short" })
          // Only show month label on first day of each month or first data point
          const prevDate = index > 0 ? new Date(arr[index - 1].period) : null
          if (prevDate && prevDate.getMonth() === date.getMonth()) {
            label = date.getDate().toString()
          }
        } else if (days >= 60) {
          // For medium ranges, show "Mon D" on week starts
          const dayOfWeek = date.getDay()
          if (dayOfWeek === 0 || index === 0) {
            label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          } else {
            label = date.getDate().toString()
          }
        } else {
          // For shorter ranges, show day of month
          label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        }

        return {
          date: point.period,
          label,
          value: cost,
          rollingAvg: Math.round(rollingAvg * 100) / 100,
        }
      })
    },
    [state.dailyTrendData]
  )

  // Check if cached data covers a date range
  const isCachedForDateRange = useCallback(
    (start: string, end: string): boolean => {
      if (!state.cachedDateRange) return false
      return (
        state.cachedDateRange.start <= start && state.cachedDateRange.end >= end
      )
    },
    [state.cachedDateRange]
  )

  // Auto-fetch on mount if not initialized
  useEffect(() => {
    if (orgSlug && !state.isInitialized && !state.isLoading) {
      fetchCostData()
    }
  }, [orgSlug, state.isInitialized, state.isLoading, fetchCostData])

  // Context value
  const value = useMemo<CostDataContextValue>(
    () => ({
      ...state,
      orgSlug,
      refresh,
      fetchIfNeeded,
      getFilteredData,
      getFilteredProviders,
      getDailyTrendForRange,
      isCachedForDateRange,
    }),
    [state, orgSlug, refresh, fetchIfNeeded, getFilteredData, getFilteredProviders, getDailyTrendForRange, isCachedForDateRange]
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
 * Hook to get daily trend data for a specific time range
 */
export function useDailyTrend(timeRange: TimeRange = "30") {
  const { getDailyTrendForRange, dailyTrendData, isLoading, error, currency } = useCostData()
  const trendData = getDailyTrendForRange(timeRange)

  // Calculate summary stats for the selected range
  const summary = {
    totalCost: trendData.reduce((sum, d) => sum + d.value, 0),
    averageDailyCost: trendData.length > 0
      ? trendData.reduce((sum, d) => sum + d.value, 0) / trendData.length
      : 0,
    dataPoints: trendData.length,
    hasData: dailyTrendData.length > 0,
  }

  return { trendData, summary, isLoading, error, currency }
}
