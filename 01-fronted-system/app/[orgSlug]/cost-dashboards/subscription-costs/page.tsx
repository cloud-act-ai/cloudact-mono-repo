"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import { Wallet } from "lucide-react"
import { getOrgSlug } from "@/lib/utils"

import {
  CostDashboardShell,
  CostSummaryGrid,
  CostBreakdownChart,
  CostDataTable,
  TimeRangeFilter,
  CostFilters,
  CostScoreRing,
  CostComboChart,
  getRollingAverageLabel,
  DEFAULT_TIME_RANGE,
  type CostSummaryData,
  type CostFiltersState,
  type ScoreRingSegment,
  type ComboDataPoint,
  type CustomDateRange,
} from "@/components/costs"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import { useCostData, type TimeRange } from "@/contexts/cost-data-context"
import {
  getDateInfo,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  SAAS_PROVIDER_CONFIG,
  type ProviderData,
} from "@/lib/costs"

export default function SubscriptionCostsPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use cached cost data from context
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
    availableFilters,
  } = useCostData()

  // Lazy-load Subscription trend data on mount (optimization - not fetched on dashboard)
  useEffect(() => {
    if (!isCategoryTrendLoaded("subscription")) {
      fetchCategoryTrend("subscription")
    }
  }, [fetchCategoryTrend, isCategoryTrendLoaded])

  // Local state - Subscription costs page (category fixed to "subscription")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE)
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined)
  const [filters, setFilters] = useState<CostFiltersState>({
    department: undefined,
    project: undefined,
    team: undefined,
    providers: [],
    categories: [], // Category fixed by page, not user-filterable
  })

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
  const dailyTrendData = useMemo<ComboDataPoint[]>(() => {
    const trendData = getDailyTrendForRange(timeRange, "subscription", customRange)

    // Transform to ComboDataPoint format with lineValue for rolling average
    return trendData.map((point) => ({
      label: point.label,
      value: point.value,
      lineValue: point.rollingAvg,
      date: point.date,
    }))
  }, [getDailyTrendForRange, timeRange, customRange])

  // Prepare summary data from cached totalCosts.subscription
  const summaryData: CostSummaryData = useMemo(() => {
    // Use subscription-specific metrics from totalCosts
    const subscriptionCosts = totalCosts?.subscription
    return {
      mtd: subscriptionCosts?.mtd_cost ?? subscriptionCosts?.total_monthly_cost ?? 0,
      dailyRate: subscriptionCosts?.total_daily_cost ?? 0,
      forecast: subscriptionCosts?.total_monthly_cost ?? 0,
      ytd: subscriptionCosts?.total_annual_cost ?? 0,
      currency: orgCurrency,
    }
  }, [totalCosts, orgCurrency])

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

  // Score ring segments for provider breakdown
  // Filter first to avoid showing empty segments, then slice for top 6
  const scoreRingSegments: ScoreRingSegment[] = useMemo(() => {
    const fallbackColors = ["#FF6C5E", "#10A37F", "#4285F4", "#7C3AED", "#F24E1E", "#FBBC04", "#00CED1", "#FF69B4"]
    return providers
      .filter(p => p.total_cost > 0)
      .slice(0, 6)
      .map((p, index) => ({
        key: p.provider,
        name: p.provider,
        value: p.total_cost,
        color: SAAS_PROVIDER_CONFIG.colors[p.provider.toLowerCase()] || fallbackColors[index % fallbackColors.length],
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
            onChange={setTimeRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            size="sm"
          />
        </div>
      }
    >
      {/* Summary Metrics */}
      <CostSummaryGrid data={summaryData} />

      {/* Daily Cost Trend Chart - Bar with Moving Average Line */}
      {dailyTrendData.length > 0 && (
        <CostComboChart
          title="Subscription Daily Cost Trend"
          subtitle={`${rollingAvgLabel} overlay on daily spend`}
          data={dailyTrendData}
          currency={orgCurrency}
          barColor="#FF6C5E"
          lineColor="#10A37F"
          barLabel="Daily Cost"
          lineLabel={rollingAvgLabel}
          height={320}
          showAreaFill
          loading={isLoading}
        />
      )}

      {/* Provider Breakdown with Score Ring */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Score Ring - Provider Breakdown */}
        {scoreRingSegments.length > 0 && (
          <CostScoreRing
            title="SaaS Spend"
            segments={scoreRingSegments}
            currency={orgCurrency}
            insight={`${subscriptionCount} subscription${subscriptionCount !== 1 ? "s" : ""} across ${scoreRingSegments.length} provider${scoreRingSegments.length > 1 ? "s" : ""}.`}
            compact
            ringSize={96}
            strokeWidth={12}
            titleColor="#FF6C5E"
          />
        )}

        {/* Provider Breakdown */}
        {providerBreakdownItems.length > 0 && (
          <CostBreakdownChart
            title="Cost by Provider"
            items={providerBreakdownItems}
            currency={orgCurrency}
            countLabel="subscriptions"
            maxItems={4}
          />
        )}
      </div>

      {/* Provider Details Table */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Cost Details"
          subtitle={`${subscriptionCount} subscriptions tracked`}
          rows={tableRows}
          currency={orgCurrency}
          showCount={true}
          countLabel="subscriptions"
          maxRows={10}
        />
      )}
    </CostDashboardShell>
  )
}
