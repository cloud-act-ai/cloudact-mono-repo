"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import { Cloud } from "lucide-react"
import { getOrgSlug } from "@/lib/utils"

import {
  CostTrendChart,
  CostRingChart,
  CostBreakdownChart,
  CostDataTable,
} from "@/components/charts"
import {
  CostDashboardShell,
  CostSummaryGrid,
  TimeRangeFilter,
  CostFilters,
  getRollingAverageLabel,
  type CostSummaryData,
  type CostFiltersState,
} from "@/components/costs"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import {
  getDateInfo,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  CLOUD_PROVIDER_CONFIG,
  type ProviderData,
  // FinOps constants
  FINOPS,
  calculateAllForecasts,
  // Design tokens
  CLOUD_CHART_PALETTE,
  getProviderColor,
  DEFAULT_COLOR,
} from "@/lib/costs"

export default function CloudCostsPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use unified filters from context (all client-side, instant)
  const {
    totalCosts,
    providerBreakdown: cachedProviders,
    hierarchy: cachedHierarchy,
    currency: cachedCurrency,
    isLoading: isCostLoading,
    error: contextError,
    refresh: refreshCostData,
    availableFilters,
    // Unified filter API (NEW - all client-side, instant)
    filters: contextFilters,
    setUnifiedFilters,
    getFilteredTimeSeries,
    getFilteredProviderBreakdown,
  } = useCostData()

  // Extract time range from unified filters
  const timeRange = contextFilters.timeRange
  const customRange = contextFilters.customRange

  // INFINITE-LOOP-FIX: Use ref to avoid infinite loop when setUnifiedFilters identity changes
  // The ref pattern allows us to call setUnifiedFilters without it being a dependency
  const setUnifiedFiltersRef = React.useRef(setUnifiedFilters)
  setUnifiedFiltersRef.current = setUnifiedFilters

  // Set category filter on mount (cloud page is fixed to cloud category)
  // CTX-002 FIX: Add cleanup to reset categories on unmount
  // SYNC-001 & STATE-001 FIX: Reset local filters and clear context provider filter on mount
  useEffect(() => {
    // Clear any provider filter from previous page, set category to cloud
    setUnifiedFiltersRef.current({ categories: ["cloud"], providers: undefined })
    // Reset local filter state to defaults
    setFilters({
      department: undefined,
      project: undefined,
      team: undefined,
      providers: [],
      categories: [],
    })

    // Cleanup: reset categories and providers when leaving this page
    return () => {
      setUnifiedFiltersRef.current({ categories: undefined, providers: undefined })
    }
  }, []) // Empty deps - only run on mount/unmount

  // Local state - Cloud costs page (category fixed to "cloud")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState<CostFiltersState>({
    department: undefined,
    project: undefined,
    team: undefined,
    providers: [],
    categories: [], // Category fixed by page, not user-filterable
  })

  // Time range handlers using unified filters (instant, no API call)
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setUnifiedFilters({ timeRange: range, customRange: range === "custom" ? customRange : undefined })
  }, [setUnifiedFilters, customRange])

  const handleCustomRangeChange = useCallback((range: CustomDateRange | undefined) => {
    setUnifiedFilters({ customRange: range })
  }, [setUnifiedFilters])

  // Determine if provider filter is active (for client-side filtering)
  const hasProviderFilter = filters.providers.length > 0

  // FILTER-FIX: Use time-filtered providers from context (respects time range)
  // CHART-FIX: The context already filters by category (set in useEffect),
  // so getFilteredProviderBreakdown() returns only cloud providers
  const timeFilteredProviders = useMemo(() => {
    return getFilteredProviderBreakdown()
  }, [getFilteredProviderBreakdown])

  // CHART-FIX: Removed redundant page-level category filter.
  // The context-level filter (state.filters.categories = ["cloud"]) already
  // filters granular data by row.category, so timeFilteredProviders only
  // contains cloud providers.
  const cloudProviders = timeFilteredProviders

  // Client-side filtered providers (instant, no backend call)
  const filteredProviders = useMemo(() => {
    if (!hasProviderFilter) return cloudProviders

    // Filter Cloud providers by selected providers (instant client-side)
    const selectedProviders = new Set(filters.providers.map(p => p.toLowerCase()))
    return cloudProviders.filter(p =>
      selectedProviders.has(p.provider.toLowerCase())
    )
  }, [cloudProviders, filters.providers, hasProviderFilter])

  // Use cached or client-side filtered data
  const providers = filteredProviders
  const hierarchy = cachedHierarchy
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY
  const isLoading = isCostLoading
  const error = contextError

  // Available providers for filter dropdown
  const availableProviders = useMemo(() => {
    return cloudProviders.map(p => p.provider)
  }, [cloudProviders])

  // Handle filter changes - sync to unified context for provider filters
  // FILTER-008 FIX: Sync local filters to context for consistent filtering
  const handleFiltersChange = useCallback((newFilters: CostFiltersState) => {
    setFilters(newFilters)
    // Sync provider filter to unified context (category is fixed for this page)
    setUnifiedFilters({
      providers: newFilters.providers.length > 0 ? newFilters.providers : undefined,
    })
  }, [setUnifiedFilters])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshCostData()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Get rolling average label based on selected time range
  const rollingAvgLabel = useMemo(() => getRollingAverageLabel(timeRange, customRange), [timeRange, customRange])

  // Get daily trend data from unified filters (instant client-side filtering)
  // Category is already set to "cloud" via setUnifiedFilters on mount
  const dailyTrendData = useMemo(() => {
    const timeSeries = getFilteredTimeSeries()
    if (!timeSeries || timeSeries.length === 0) return []

    // Calculate rolling average (overall period average as flat reference line)
    const totalCost = timeSeries.reduce((sum, d) => sum + (Number.isFinite(d.total) ? d.total : 0), 0)
    const avgDaily = timeSeries.length > 0 ? totalCost / timeSeries.length : 0
    const rollingAvg = Number.isFinite(avgDaily) ? avgDaily : 0

    // Transform to chart format
    return timeSeries.map((point) => {
      const date = new Date(point.date)
      // LOCALE-001 FIX: Use undefined to respect user's browser locale
      const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" })

      return {
        label,
        value: point.total,
        lineValue: Math.round(rollingAvg * 100) / 100,
        date: point.date,
      }
    })
  }, [getFilteredTimeSeries])

  // PERF-001 FIX: Memoize dateInfo to avoid redundant calculations
  const dateInfo = useMemo(() => getDateInfo(), [])

  // FILTER-FIX: Calculate summary data from TIME-FILTERED daily trend data
  const summaryData: CostSummaryData = useMemo(() => {
    // Calculate totals from time-filtered daily data (respects time range filter)
    const filteredTotal = dailyTrendData.reduce((sum, d) => sum + d.value, 0)
    const daysInPeriod = dailyTrendData.length || 1

    // Calculate daily rate from filtered data
    const dailyRate = filteredTotal / daysInPeriod

    // Use FinOps standard calculations for forecasts
    const { monthlyForecast, annualForecast } = calculateAllForecasts(
      filteredTotal,
      daysInPeriod
    )

    // CALC-001 FIX: Only show YTD when timeRange is "ytd", otherwise show period total
    // Projecting a short period average to entire YTD is statistically unreliable
    const ytdValue = timeRange === "ytd" ? filteredTotal : filteredTotal

    return {
      mtd: filteredTotal,       // Period spend (from filtered data)
      dailyRate: dailyRate,     // Daily average (from filtered data)
      forecast: monthlyForecast,
      ytd: ytdValue,
      currency: orgCurrency,
    }
  }, [dailyTrendData, timeRange, orgCurrency])

  // Convert providers to breakdown items using centralized helper
  const providerBreakdownItems = useMemo(() =>
    transformProvidersToBreakdownItems(
      providers as ProviderData[],
      CLOUD_PROVIDER_CONFIG
    ),
    [providers]
  )

  // Convert providers to table rows using centralized helper
  const tableRows = useMemo(() => {
    const dateInfo = getDateInfo()
    return transformProvidersToTableRows(
      providers as ProviderData[],
      dateInfo,
      CLOUD_PROVIDER_CONFIG
    )
  }, [providers])

  // Ring chart segments for provider breakdown
  // Filter first to avoid showing empty segments, then slice for top 6
  // Uses centralized design tokens for consistent colors
  const ringSegments = useMemo(() => {
    return providers
      .filter(p => p.total_cost > 0)
      .slice(0, 6)
      .map((p, index) => ({
        key: p.provider,
        name: CLOUD_PROVIDER_CONFIG.names[p.provider.toLowerCase()] || p.provider,
        value: p.total_cost,
        // Use provider-specific color or fall back to chart palette
        // COLOR-001 fix: Use DEFAULT_COLOR constant instead of magic string
        color: getProviderColor(p.provider, "cloud") !== DEFAULT_COLOR
          ? getProviderColor(p.provider, "cloud")
          : CLOUD_CHART_PALETTE[index % CLOUD_CHART_PALETTE.length],
      }))
  }, [providers])

  // Check if data is truly empty (not just loading)
  const isEmpty = !isLoading && !totalCosts?.cloud && providers.length === 0

  return (
    <CostDashboardShell
      title="Cloud Costs"
      subtitle="Infrastructure spend across providers"
      icon={Cloud}
      loading={isLoading}
      loadingMessage="Loading cloud costs..."
      error={error}
      errorAction={
        error?.includes("API key")
          ? { label: "Go to Settings", href: `/${orgSlug}/settings/organization` }
          : { label: "Try again", onClick: handleRefresh }
      }
      isEmpty={isEmpty}
      emptyState={{
        icon: Cloud,
        title: "No cloud costs yet",
        description: "Connect your cloud providers (GCP, AWS, Azure) and run the cloud cost pipeline to see your infrastructure spend.",
        action: { label: "Connect Providers", href: `/${orgSlug}/integrations/cloud-providers` },
      }}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      headerActions={
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <CostFilters
            value={filters}
            onChange={handleFiltersChange}
            hierarchy={hierarchy}
            availableProviders={availableProviders}
            availableCategories={[]} // Category fixed by page - don't show category filter
            disabled={isLoading || isRefreshing}
            loading={isLoading}
          />
          <TimeRangeFilter
            value={timeRange}
            onChange={handleTimeRangeChange}
            customRange={customRange}
            onCustomRangeChange={handleCustomRangeChange}
            size="sm"
          />
        </div>
      }
    >
      {/* Summary Metrics */}
      <CostSummaryGrid data={summaryData} />

      {/* Daily Cost Trend Chart - Bar with Moving Average Line */}
      {dailyTrendData.length > 0 && (
        <CostTrendChart
          title="Cloud Daily Cost Trend"
          subtitle={`${rollingAvgLabel} overlay on daily spend`}
          data={dailyTrendData.map(d => ({
            date: d.date,
            label: d.label,
            value: d.value,
            rollingAvg: d.lineValue,
          }))}
          showBars={true}
          showLine={true}
          barColor="#4285F4"
          lineColor="#FF6C5E"
          enableZoom={true}
          height={320}
          loading={isLoading}
        />
      )}

      {/* Provider Breakdown with Ring Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-200">
        {/* Ring Chart - Provider Breakdown */}
        {ringSegments.length > 0 && (
          <CostRingChart
            title="Cloud Spend"
            segments={ringSegments}
            centerLabel="MTD"
            insight={`Spending across ${ringSegments.length} cloud provider${ringSegments.length > 1 ? "s" : ""}.`}
            size={200}
            thickness={22}
            titleColor="#4285F4"
            className="premium-card"
          />
        )}

        {/* Provider Breakdown */}
        {providerBreakdownItems.length > 0 && (
          <CostBreakdownChart
            title="Cost by Provider"
            items={providerBreakdownItems}
            countLabel="records"
            maxItems={5}
            className="premium-card"
          />
        )}
      </div>

      {/* Provider Details Table */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Cost Details"
          rows={tableRows}
          showType
          typeLabel="Type"
          showCount={false}
          maxRows={10}
        />
      )}
    </CostDashboardShell>
  )
}
