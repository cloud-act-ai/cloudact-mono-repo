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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
  transformProvidersToBreakdownItems,
  CLOUD_PROVIDER_CONFIG,
  type ProviderData,
  // FinOps constants
  calculateAllForecasts,
  // Design tokens
  CLOUD_CHART_PALETTE,
  getProviderColor,
  DEFAULT_COLOR,
  formatCost,
} from "@/lib/costs"
import { getCostByService, type ServiceBreakdown } from "@/actions/costs"

export default function CloudCostsPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use unified filters from context (all client-side, instant)
  const {
    totalCosts,
    hierarchy: cachedHierarchy,
    currency: cachedCurrency,
    isLoading: isCostLoading,
    error: contextError,
    refresh: refreshCostData,
    // Unified filter API (all client-side, instant)
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
  // PAGE-002 FIX: Reset ALL hierarchy fields on mount/unmount
  useEffect(() => {
    // Clear any provider/hierarchy filters from previous page, set category to cloud
    setUnifiedFiltersRef.current({
      categories: ["cloud"],
      providers: undefined,
      // PAGE-002 FIX: Clear all 5 hierarchy fields
      hierarchyEntityId: undefined,
      hierarchyEntityName: undefined,
      hierarchyLevelCode: undefined,
      hierarchyPath: undefined,
      hierarchyPathNames: undefined,
    })
    // Reset local filter state to defaults (including all 5 hierarchy fields)
    setFilters({
      department: undefined,
      project: undefined,
      team: undefined,
      hierarchyEntityId: undefined,
      hierarchyEntityName: undefined,
      hierarchyLevelCode: undefined,
      hierarchyPath: undefined,
      hierarchyPathNames: undefined,
      providers: [],
      categories: [],
    })

    // Cleanup: reset categories, providers, and hierarchy filters when leaving this page
    return () => {
      setUnifiedFiltersRef.current({
        categories: undefined,
        providers: undefined,
        // PAGE-002 FIX: Clear all 5 hierarchy fields on unmount
        hierarchyEntityId: undefined,
        hierarchyEntityName: undefined,
        hierarchyLevelCode: undefined,
        hierarchyPath: undefined,
        hierarchyPathNames: undefined,
      })
    }
  }, []) // Empty deps - only run on mount/unmount

  // Local state - Cloud costs page (category fixed to "cloud")
  const [isRefreshing, setIsRefreshing] = useState(false)
  // PAGE-003 FIX: Include all 5 hierarchy fields in initial state
  const [filters, setFilters] = useState<CostFiltersState>({
    department: undefined,
    project: undefined,
    team: undefined,
    hierarchyEntityId: undefined,
    hierarchyEntityName: undefined,
    hierarchyLevelCode: undefined,
    hierarchyPath: undefined,
    hierarchyPathNames: undefined,
    providers: [],
    categories: [], // Category fixed by page, not user-filterable
  })
  // Service-level breakdown for table (fetched separately)
  const [serviceData, setServiceData] = useState<ServiceBreakdown[]>([])
  const [isLoadingServices, setIsLoadingServices] = useState(false)

  // Time range handlers using unified filters (instant, no API call)
  // FIX-CUSTOM-001: When range is "custom", don't include customRange in the update.
  // The customRange is already set by handleCustomRangeChange before this is called.
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    if (range === "custom") {
      setUnifiedFilters({ timeRange: range })
    } else {
      setUnifiedFilters({ timeRange: range, customRange: undefined })
    }
  }, [setUnifiedFilters])

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

  // Fetch service-level breakdown for cloud costs table
  // BUG-003 FIX: Include provider filter in API call
  // BUG-005 FIX: Include hierarchy filter in API call
  useEffect(() => {
    async function fetchServices() {
      if (!orgSlug) return
      setIsLoadingServices(true)
      try {
        // Calculate date range based on time range
        const endDate = new Date()
        let startDate = new Date()
        if (timeRange === "custom" && customRange) {
          startDate = new Date(customRange.startDate)
          endDate.setTime(new Date(customRange.endDate).getTime())
        } else if (typeof timeRange === "number") {
          startDate.setDate(startDate.getDate() - timeRange)
        } else if (timeRange === "mtd") {
          startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        } else if (timeRange === "ytd") {
          startDate = new Date(endDate.getFullYear(), 0, 1)
        } else {
          startDate.setDate(startDate.getDate() - 365)
        }

        // BUG-003 FIX: Pass provider filter to API
        // BUG-005 FIX: Pass hierarchy filter to API
        const result = await getCostByService(
          orgSlug,
          startDate.toISOString().split("T")[0],
          endDate.toISOString().split("T")[0],
          {
            categories: ["cloud"],
            providers: filters.providers.length > 0 ? filters.providers : undefined,
            // Hierarchy filters (using CostFilterParams interface)
            hierarchyEntityId: filters.hierarchyEntityId || undefined,
            hierarchyPath: filters.hierarchyPath || undefined,
          }
        )
        if (result.success && result.data) {
          // Sort by cost descending
          const sorted = [...result.data].sort((a, b) => b.total_cost - a.total_cost)
          setServiceData(sorted)
        }
      } catch (err) {
        console.error("Failed to fetch service breakdown:", err)
      } finally {
        setIsLoadingServices(false)
      }
    }
    fetchServices()
  }, [orgSlug, timeRange, customRange, filters.providers, filters.hierarchyEntityId, filters.hierarchyPath])

  // Handle filter changes - sync to unified context for provider/hierarchy filters
  // FILTER-008 FIX: Sync local filters to context for consistent filtering
  // PAGE-001 FIX: Sync ALL 5 hierarchy filters to unified context
  const handleFiltersChange = useCallback((newFilters: CostFiltersState) => {
    setFilters(newFilters)
    // Sync all filters to unified context (provider, hierarchy; category fixed for this page)
    // PAGE-001 FIX: Include all 5 hierarchy model fields
    setUnifiedFilters({
      providers: newFilters.providers.length > 0 ? newFilters.providers : undefined,
      // Unified N-level hierarchy filters (all 5 fields)
      hierarchyEntityId: newFilters.hierarchyEntityId || undefined,
      hierarchyEntityName: newFilters.hierarchyEntityName || undefined,
      hierarchyLevelCode: newFilters.hierarchyLevelCode || undefined,
      hierarchyPath: newFilters.hierarchyPath || undefined,
      hierarchyPathNames: newFilters.hierarchyPathNames || undefined,
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
    return timeSeries
      .filter((point) => {
        // EDGE-001 FIX: Skip entries with invalid dates
        if (!point.date) return false
        const date = new Date(point.date)
        return !isNaN(date.getTime())
      })
      .map((point) => {
        const date = new Date(point.date)
        // LOCALE-001 FIX: Use undefined to respect user's browser locale
        // BUG-001 FIX: Format label based on data length - short format for large datasets
        const label = timeSeries.length >= 90
          ? date.toLocaleDateString(undefined, { day: "numeric" })  // Just day number for 90+ days
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })

        return {
          label,
          value: Number.isFinite(point.total) ? point.total : 0, // EDGE-001 FIX: Validate value
          lineValue: Math.round(rollingAvg * 100) / 100,
          date: point.date,
        }
      })
  }, [getFilteredTimeSeries])


  // FILTER-FIX: Calculate summary data from TIME-FILTERED daily trend data
  const summaryData: CostSummaryData = useMemo(() => {
    // Calculate totals from time-filtered daily data (respects time range filter)
    const filteredTotal = dailyTrendData.reduce((sum, d) => sum + d.value, 0)
    const daysInPeriod = dailyTrendData.length || 1

    // Calculate daily rate from filtered data
    const dailyRate = filteredTotal / daysInPeriod

    // Use FinOps standard calculations for forecasts
    const { monthlyForecast } = calculateAllForecasts(
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

  // Convert services to table rows with FOCUS 1.3 cost breakdown
  // Note: API returns 'service' field (not service_name) for service breakdown
  const tableRows = useMemo(() => {
    if (!serviceData || serviceData.length === 0) return []
    // Handle both API formats: 'service' (actual) or 'service_name' (typed)
    return serviceData.map(s => {
      const serviceName = s.service || s.service_name || s.service_category || "Unknown"
      // Get FOCUS cost fields from API response
      const billedCost = s.billed_cost ?? s.total_cost ?? 0
      const effectiveCost = s.effective_cost ?? 0
      const savings = s.savings ?? (billedCost - effectiveCost)
      return {
        key: serviceName,
        name: serviceName,
        type: "GCP",
        // FOCUS 1.3 cost columns
        billedCost: billedCost,
        effectiveCost: effectiveCost,
        savings: savings,
        // Formatted usage (e.g., "7.3M hrs", "122 MB")
        usage: s.usage || undefined,
      }
    })
  }, [serviceData])

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
  // BUG-004 FIX: Use filtered data (providers, dailyTrendData) instead of unfiltered totalCosts
  // This ensures empty state shows when filters return no data, not just when all data is empty
  const isEmpty = !isLoading && providers.length === 0 && dailyTrendData.length === 0

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

      {/* FOCUS 1.3 Cost Breakdown (FinOps Standard) */}
      {totalCosts?.cloud && (
        <Card className="border-slate-200 animate-fade-up animation-delay-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">
              Cost Breakdown (FOCUS 1.3)
            </CardTitle>
            <CardDescription>
              FinOps FOCUS standard: BilledCost → Savings → EffectiveCost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              {/* BilledCost - Gross cost */}
              <div className="text-center p-3 sm:p-4 rounded-lg bg-slate-50">
                <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  BilledCost
                </p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCost(totalCosts.cloud.total_billed_cost ?? totalCosts.cloud.mtd_cost ?? 0, orgCurrency)}
                </p>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Gross (before credits)</p>
              </div>

              {/* Savings - Credits applied */}
              <div className="text-center p-3 sm:p-4 rounded-lg bg-emerald-50">
                <p className="text-[10px] sm:text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">
                  Savings
                </p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-600 tabular-nums">
                  {totalCosts.cloud.total_savings && totalCosts.cloud.total_savings > 0
                    ? `-${formatCost(totalCosts.cloud.total_savings, orgCurrency)}`
                    : formatCost(totalCosts.cloud.total_savings ?? 0, orgCurrency)}
                </p>
                <p className="text-[10px] sm:text-xs text-emerald-500 mt-1">Credits applied</p>
              </div>

              {/* EffectiveCost - Net cost */}
              <div className="text-center p-3 sm:p-4 rounded-lg bg-blue-50">
                <p className="text-[10px] sm:text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
                  EffectiveCost
                </p>
                <p className="text-xl sm:text-2xl font-bold text-blue-700 tabular-nums">
                  {formatCost(totalCosts.cloud.total_effective_cost ?? totalCosts.cloud.mtd_cost ?? 0, orgCurrency)}
                </p>
                <p className="text-[10px] sm:text-xs text-blue-500 mt-1">Net (after credits)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
            centerLabel={timeRange === "mtd" ? "MTD" : timeRange === "ytd" ? "YTD" : `${timeRange}d`}
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
            countLabel="services"
            maxItems={5}
            className="premium-card"
          />
        )}
      </div>

      {/* Service Cost Details Table - FOCUS 1.3 breakdown */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Service Cost Details"
          subtitle="FOCUS 1.3 cost breakdown by GCP service"
          rows={tableRows}
          showType
          typeLabel="Provider"
          showFocusCost
          showUsage
          maxRows={10}
        />
      )}
    </CostDashboardShell>
  )
}
