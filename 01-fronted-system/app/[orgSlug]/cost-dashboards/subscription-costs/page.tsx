"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import { Wallet } from "lucide-react"
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
  SAAS_PROVIDER_CONFIG,
  type ProviderData,
  // FinOps constants
  FINOPS,
  calculateAllForecasts,
  // Design tokens
  SUBSCRIPTION_CHART_PALETTE,
  getProviderColor,
  DEFAULT_COLOR,
} from "@/lib/costs"

export default function SubscriptionCostsPage() {
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

  // Lazy-load Subscription trend data on mount (optimization - not fetched on dashboard)
  useEffect(() => {
    if (!isCategoryTrendLoaded("subscription")) {
      fetchCategoryTrend("subscription")
    }
  }, [fetchCategoryTrend, isCategoryTrendLoaded])

  // Local state - Subscription costs page (category fixed to "subscription")
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

  // Get SaaS providers from cached data (instant, no backend call)
  const saasProviders = useMemo(() => {
    return getFilteredProviders('subscription')
  }, [getFilteredProviders])

  // Client-side filtered providers (instant, no backend call)
  const filteredProviders = useMemo(() => {
    if (!hasProviderFilter) return saasProviders

    // Filter SaaS providers by selected providers (instant client-side)
    const selectedProviders = new Set(filters.providers.map(p => p.toLowerCase()))
    return saasProviders.filter(p =>
      selectedProviders.has(p.provider.toLowerCase())
    )
  }, [saasProviders, filters.providers, hasProviderFilter])

  // Use cached or client-side filtered data
  const providers = filteredProviders
  const hierarchy = cachedHierarchy
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY
  const isLoading = isCostLoading
  const error = contextError

  // Available providers for filter dropdown
  const availableProviders = useMemo(() => {
    return saasProviders.map(p => p.provider)
  }, [saasProviders])

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
  // Pass "subscription" category to get Subscription-specific trend data
  const dailyTrendData = useMemo(() => {
    const trendData = getDailyTrendForRange(timeRange, "subscription", customRange)

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

    // No filter - use subscription-specific metrics from totalCosts
    const subscriptionCosts = totalCosts?.subscription
    return {
      mtd: subscriptionCosts?.mtd_cost ?? subscriptionCosts?.total_monthly_cost ?? 0,
      dailyRate: subscriptionCosts?.total_daily_cost ?? 0,
      forecast: subscriptionCosts?.total_monthly_cost ?? 0,
      ytd: subscriptionCosts?.total_annual_cost ?? 0,
      currency: orgCurrency,
    }
  }, [totalCosts, orgCurrency, hasProviderFilter, providers])

  // Convert providers to breakdown items using centralized helper
  const providerBreakdownItems = useMemo(() =>
    transformProvidersToBreakdownItems(
      providers as ProviderData[],
      SAAS_PROVIDER_CONFIG
    ),
    [providers]
  )

  // Convert providers to table rows using centralized helper
  const tableRows = useMemo(() => {
    const dateInfo = getDateInfo()
    return transformProvidersToTableRows(
      providers as ProviderData[],
      dateInfo,
      SAAS_PROVIDER_CONFIG
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
        name: p.provider,
        value: p.total_cost,
        // Use provider-specific color or fall back to chart palette
        // COLOR-001 fix: Use DEFAULT_COLOR constant instead of magic string
        color: getProviderColor(p.provider, "subscription") !== DEFAULT_COLOR
          ? getProviderColor(p.provider, "subscription")
          : SUBSCRIPTION_CHART_PALETTE[index % SUBSCRIPTION_CHART_PALETTE.length],
      }))
  }, [providers])

  // Get subscription count
  const subscriptionCount = useMemo(() => {
    return providers.reduce((acc, p) => acc + (p.record_count ?? 0), 0)
  }, [providers])

  // Check if data is truly empty (not just loading)
  const isEmpty = !isLoading && !totalCosts?.subscription && providers.length === 0

  return (
    <CostDashboardShell
      title="Subscription Costs"
      subtitle="SaaS and recurring service spend"
      icon={Wallet}
      loading={isLoading}
      loadingMessage="Loading subscription costs..."
      error={error}
      errorAction={
        error?.includes("API key")
          ? { label: "Go to Settings", href: `/${orgSlug}/settings/organization` }
          : { label: "Try again", onClick: handleRefresh }
      }
      isEmpty={isEmpty}
      emptyState={{
        icon: Wallet,
        title: "No subscription costs yet",
        description: "Add your SaaS subscriptions (Slack, Notion, Figma, etc.) and run the subscription cost pipeline to see your spend.",
        action: { label: "Add Subscriptions", href: `/${orgSlug}/integrations/subscriptions` },
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
          title="Subscription Daily Cost Trend"
          subtitle={`${rollingAvgLabel} overlay on daily spend`}
          category="subscription"
          timeRange={timeRange}
          showBars={true}
          showLine={true}
          barColor="#FF6C5E"
          lineColor="#10A37F"
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
            title="SaaS Spend"
            segments={ringSegments}
            centerLabel="MTD"
            insight={`${subscriptionCount} subscription${subscriptionCount !== 1 ? "s" : ""} across ${ringSegments.length} provider${ringSegments.length > 1 ? "s" : ""}.`}
            size={200}
            thickness={22}
            titleColor="#FF6C5E"
            className="premium-card"
          />
        )}

        {/* Provider Breakdown */}
        {providerBreakdownItems.length > 0 && (
          <CostBreakdownChart
            title="Cost by Provider"
            items={providerBreakdownItems}
            countLabel="subscriptions"
            maxItems={5}
            className="premium-card"
          />
        )}
      </div>

      {/* Provider Details Table */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Cost Details"
          subtitle={`${subscriptionCount} subscriptions tracked`}
          rows={tableRows}
          showCount
          countLabel="subscriptions"
          maxRows={10}
        />
      )}
    </CostDashboardShell>
  )
}
