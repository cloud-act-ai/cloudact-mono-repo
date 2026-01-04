"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import { Brain } from "lucide-react"
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
  GENAI_PROVIDER_CONFIG,
  type ProviderData,
  // FinOps constants
  FINOPS,
  calculateAllForecasts,
  // Design tokens
  GENAI_CHART_PALETTE,
  getProviderColor,
  DEFAULT_COLOR,
} from "@/lib/costs"

export default function GenAICostsPage() {
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
  } = useCostData()

  // Extract time range from unified filters
  const timeRange = contextFilters.timeRange
  const customRange = contextFilters.customRange

  // Set category filter on mount (genai page is fixed to genai category)
  // CTX-002 FIX: Add cleanup to reset categories on unmount
  useEffect(() => {
    setUnifiedFilters({ categories: ["genai"] })

    // Cleanup: reset categories when leaving this page
    return () => {
      setUnifiedFilters({ categories: undefined })
    }
  }, [setUnifiedFilters])

  // Local state - GenAI costs page (category fixed to "genai")
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

  // Get GenAI providers from availableFilters (using unified filter data)
  const genaiProviders = useMemo(() => {
    const categoryProviderIds = new Set(
      availableFilters.providers
        .filter(p => p.category === "genai")
        .map(p => p.id.toLowerCase())
    )
    return cachedProviders.filter(p =>
      categoryProviderIds.has(p.provider.toLowerCase())
    )
  }, [availableFilters.providers, cachedProviders])

  // Client-side filtered providers (instant, no backend call)
  const filteredProviders = useMemo(() => {
    if (!hasProviderFilter) return genaiProviders

    // Filter GenAI providers by selected providers (instant client-side)
    const selectedProviders = new Set(filters.providers.map(p => p.toLowerCase()))
    return genaiProviders.filter(p =>
      selectedProviders.has(p.provider.toLowerCase())
    )
  }, [genaiProviders, filters.providers, hasProviderFilter])

  // Use cached or client-side filtered data
  const providers = filteredProviders
  const hierarchy = cachedHierarchy
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY
  const isLoading = isCostLoading
  const error = contextError

  // Available providers for filter dropdown
  const availableProviders = useMemo(() => {
    return genaiProviders.map(p => p.provider)
  }, [genaiProviders])

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

  // Get daily trend data from unified filters (instant client-side filtering)
  // Category is already set to "genai" via setUnifiedFilters on mount
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
      const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

      return {
        label,
        value: point.total,
        lineValue: Math.round(rollingAvg * 100) / 100,
        date: point.date,
      }
    })
  }, [getFilteredTimeSeries])

  // Prepare summary data - uses filtered providers when filter is active
  const summaryData: CostSummaryData = useMemo(() => {
    // When provider filter is active, calculate from filtered providers
    if (hasProviderFilter && providers.length > 0) {
      const filteredTotal = providers.reduce((sum, p) => sum + p.total_cost, 0)
      // Use FinOps standard calculations (data is 365-day total)
      const { dailyRate, monthlyForecast, annualForecast } = calculateAllForecasts(
        filteredTotal,
        FINOPS.DAYS_PER_YEAR
      )
      return {
        mtd: filteredTotal,
        dailyRate,
        forecast: monthlyForecast,
        ytd: annualForecast,
        currency: orgCurrency,
      }
    }

    // No filter - use GenAI-specific metrics from totalCosts
    const genaiCosts = totalCosts?.genai
    return {
      mtd: genaiCosts?.mtd_cost ?? genaiCosts?.total_monthly_cost ?? 0,
      dailyRate: genaiCosts?.total_daily_cost ?? 0,
      forecast: genaiCosts?.total_monthly_cost ?? 0,
      ytd: genaiCosts?.total_annual_cost ?? 0,
      currency: orgCurrency,
    }
  }, [totalCosts, orgCurrency, hasProviderFilter, providers])

  // Convert providers to breakdown items using centralized helper
  const providerBreakdownItems = useMemo(() =>
    transformProvidersToBreakdownItems(
      providers as ProviderData[],
      GENAI_PROVIDER_CONFIG
    ),
    [providers]
  )

  // Convert providers to table rows using centralized helper
  const tableRows = useMemo(() => {
    const dateInfo = getDateInfo()
    return transformProvidersToTableRows(
      providers as ProviderData[],
      dateInfo,
      GENAI_PROVIDER_CONFIG
    )
  }, [providers])

  // Ring chart segments for LLM provider breakdown
  // Filter first to avoid showing empty segments, then slice for top 6
  // Uses centralized design tokens for consistent colors
  const ringSegments = useMemo(() => {
    return providers
      .filter(p => p.total_cost > 0)
      .slice(0, 6)
      .map((p, index) => ({
        key: p.provider,
        name: GENAI_PROVIDER_CONFIG.names[p.provider.toLowerCase()] || p.provider,
        value: p.total_cost,
        // Use provider-specific color or fall back to chart palette
        // COLOR-001 fix: Use DEFAULT_COLOR constant instead of magic string
        color: getProviderColor(p.provider, "genai") !== DEFAULT_COLOR
          ? getProviderColor(p.provider, "genai")
          : GENAI_CHART_PALETTE[index % GENAI_CHART_PALETTE.length],
      }))
  }, [providers])

  // Check if data is truly empty (not just loading)
  const isEmpty = !isLoading && !totalCosts?.genai && providers.length === 0

  return (
    <CostDashboardShell
      title="GenAI Costs"
      subtitle="LLM API usage and spend"
      icon={Brain}
      loading={isLoading}
      loadingMessage="Loading GenAI costs..."
      error={error}
      errorAction={
        error?.includes("API key")
          ? { label: "Go to Settings", href: `/${orgSlug}/settings/organization` }
          : { label: "Try again", onClick: handleRefresh }
      }
      isEmpty={isEmpty}
      emptyState={{
        icon: Brain,
        title: "No GenAI costs yet",
        description: "Connect your LLM providers (OpenAI, Anthropic, etc.) and run the GenAI cost pipeline to see your usage data.",
        action: { label: "Connect Providers", href: `/${orgSlug}/integrations/genai` },
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
          title="GenAI Daily Cost Trend"
          subtitle={`${rollingAvgLabel} overlay on daily spend`}
          data={dailyTrendData.map(d => ({
            date: d.date,
            label: d.label,
            value: d.value,
            rollingAvg: d.lineValue,
          }))}
          showBars={true}
          showLine={true}
          barColor="#10A37F"
          lineColor="#FF6C5E"
          enableZoom={true}
          height={320}
          loading={isLoading}
        />
      )}

      {/* Provider Breakdown with Ring Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-200">
        {/* Ring Chart - LLM Provider Breakdown */}
        {ringSegments.length > 0 && (
          <CostRingChart
            title="LLM Spend"
            segments={ringSegments}
            centerLabel="MTD"
            insight={`Spending across ${ringSegments.length} AI provider${ringSegments.length > 1 ? "s" : ""}.`}
            size={200}
            thickness={22}
            titleColor="#10A37F"
            className="premium-card"
          />
        )}

        {/* Provider Breakdown inline */}
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
          typeLabel="Service"
          showCount={false}
          maxRows={10}
        />
      )}
    </CostDashboardShell>
  )
}
