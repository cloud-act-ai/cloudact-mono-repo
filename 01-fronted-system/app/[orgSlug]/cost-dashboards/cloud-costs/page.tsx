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
} from "@/lib/costs"

export default function CloudCostsPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use cached cost data from context (including time range for zoom sync)
  const {
    totalCosts,
    hierarchy: cachedHierarchy,
    currency: cachedCurrency,
    isLoading: isCostLoading,
    error: contextError,
    refresh: refreshCostData,
    getFilteredProviders,
    getDailyTrendForRange,
    fetchCategoryTrend,
    isCategoryTrendLoaded,
    availableFilters: _availableFilters,
    selectedTimeRange: timeRange,
    selectedCustomRange: customRange,
    setTimeRange: contextSetTimeRange,
  } = useCostData()

  // Lazy-load Cloud trend data on mount (optimization - not fetched on dashboard)
  useEffect(() => {
    if (!isCategoryTrendLoaded("cloud")) {
      fetchCategoryTrend("cloud")
    }
  }, [fetchCategoryTrend, isCategoryTrendLoaded])

  // Local state - Cloud costs page (category fixed to "cloud")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState<CostFiltersState>({
    department: undefined,
    project: undefined,
    team: undefined,
    providers: [],
    categories: [], // Category fixed by page, not user-filterable
  })

  // Time range handlers that sync with context (for zoom integration)
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    contextSetTimeRange(range, range === "custom" ? customRange : undefined)
  }, [contextSetTimeRange, customRange])

  const handleCustomRangeChange = useCallback((range: CustomDateRange | undefined) => {
    contextSetTimeRange(timeRange, range)
  }, [contextSetTimeRange, timeRange])

  // Determine if provider filter is active (for client-side filtering)
  const hasProviderFilter = filters.providers.length > 0

  // Get Cloud providers from cached data (instant, no backend call)
  const cloudProviders = useMemo(() => {
    return getFilteredProviders('cloud')
  }, [getFilteredProviders])

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

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: CostFiltersState) => {
    setFilters(newFilters)
  }, [])

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

  // Get daily trend data from context (real data from backend)
  // Pass "cloud" category to get Cloud-specific trend data
  const dailyTrendData = useMemo(() => {
    const trendData = getDailyTrendForRange(timeRange, "cloud", customRange)

    // Transform to chart format with lineValue for rolling average
    return trendData.map((point) => ({
      label: point.label,
      value: point.value,
      lineValue: point.rollingAvg,
      date: point.date,
    }))
  }, [getDailyTrendForRange, timeRange, customRange])

  // Prepare summary data - uses filtered providers when filter is active
  const summaryData: CostSummaryData = useMemo(() => {
    // When provider filter is active, calculate from filtered providers
    if (hasProviderFilter && providers.length > 0) {
      const filteredTotal = providers.reduce((sum, p) => sum + p.total_cost, 0)
      const estimatedDailyRate = filteredTotal / 30
      return {
        mtd: filteredTotal,
        dailyRate: estimatedDailyRate,
        forecast: filteredTotal,
        ytd: filteredTotal * 12,
        currency: orgCurrency,
      }
    }

    // No filter - use Cloud-specific metrics from totalCosts
    const cloudCosts = totalCosts?.cloud
    return {
      mtd: cloudCosts?.mtd_cost ?? cloudCosts?.total_monthly_cost ?? 0,
      dailyRate: cloudCosts?.total_daily_cost ?? 0,
      forecast: cloudCosts?.total_monthly_cost ?? 0,
      ytd: cloudCosts?.total_annual_cost ?? 0,
      currency: orgCurrency,
    }
  }, [totalCosts, orgCurrency, hasProviderFilter, providers])

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
  const ringSegments = useMemo(() => {
    const colors = ["#4285F4", "#FF9900", "#00A4EF", "#F80000", "#10A37F", "#7C3AED", "#00CED1", "#FF69B4"]
    return providers
      .filter(p => p.total_cost > 0)
      .slice(0, 6)
      .map((p, index) => ({
        key: p.provider,
        name: CLOUD_PROVIDER_CONFIG.names[p.provider.toLowerCase()] || p.provider,
        value: p.total_cost,
        color: colors[index % colors.length],
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
          category="cloud"
          timeRange={timeRange}
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
