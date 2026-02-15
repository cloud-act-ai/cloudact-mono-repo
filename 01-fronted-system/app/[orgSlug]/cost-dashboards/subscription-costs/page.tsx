"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import { Wallet } from "lucide-react"
import { getOrgSlug } from "@/lib/utils"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

import {
  DailyTrendChart,
  CostRingChart,
  CostBreakdownChart,
  CostDataTable,
} from "@/components/charts"
import {
  CostDashboardShell,
  CostSummaryGrid,
  TimeRangeFilter,
  CostFilters,
  type CostFiltersState,
} from "@/components/costs"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import {
  getDateInfo,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  SAAS_PROVIDER_CONFIG,
  CATEGORY_COLORS,
  type ProviderData,
  // Design tokens
  getMonoShade,
} from "@/lib/costs"
import { useDailyTrendData, useCostSummary, useRollingAvgLabel } from "@/hooks/use-cost-dashboard"

export default function SubscriptionCostsPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use unified filters from context (all client-side, instant)
  const {
    // totalCosts removed - BUG-008 FIX uses filtered data instead
    hierarchy: cachedHierarchy,
    currency: cachedCurrency,
    isLoading: isCostLoading,
    error: contextError,
    clearBackendCache,
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

  // Set category filter on mount (subscription page is fixed to subscription category)
  // CTX-002 FIX: Add cleanup to reset categories on unmount
  // SYNC-001 & STATE-001 FIX: Reset local filters and clear context provider filter on mount
  // PAGE-002 FIX: Reset ALL hierarchy fields on mount/unmount
  useEffect(() => {
    // Clear any provider/hierarchy filters from previous page, set category to subscription
    setUnifiedFiltersRef.current({
      categories: ["subscription"],
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

  // Local state - Subscription costs page (category fixed to "subscription")
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
  // so getFilteredProviderBreakdown() returns only subscription providers
  const timeFilteredProviders = useMemo(() => {
    return getFilteredProviderBreakdown()
  }, [getFilteredProviderBreakdown])

  // CHART-FIX: Removed redundant page-level category filter.
  // The context-level filter (state.filters.categories = ["subscription"]) already
  // filters granular data by row.category, so timeFilteredProviders only
  // contains subscription providers.
  const saasProviders = timeFilteredProviders

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

  const handleClearCache = async () => {
    setIsRefreshing(true)
    try {
      await clearBackendCache()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Shared hooks — eliminates duplicated trend/summary logic
  const rollingAvgLabel = useRollingAvgLabel(timeRange, customRange)
  const dailyTrendData = useDailyTrendData()
  const summaryData = useCostSummary(dailyTrendData, timeRange)

  // PERF-001 FIX: Memoize dateInfo to avoid redundant calculations
  const dateInfo = useMemo(() => getDateInfo(), [])

  // Convert providers to breakdown items using centralized helper
  const providerBreakdownItems = useMemo(() =>
    transformProvidersToBreakdownItems(
      providers as ProviderData[],
      { names: SAAS_PROVIDER_CONFIG.names, colors: {}, defaultColor: CATEGORY_COLORS.subscription }
    ),
    [providers]
  )

  // Convert providers to table rows using centralized helper
  const tableRows = useMemo(() => {
    return transformProvidersToTableRows(
      providers as ProviderData[],
      dateInfo,
      { names: SAAS_PROVIDER_CONFIG.names, colors: {}, defaultColor: CATEGORY_COLORS.subscription }
    )
  }, [providers, dateInfo])

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
        color: getMonoShade(index, "subscription"),
      }))
  }, [providers])

  // Get subscription count
  const subscriptionCount = useMemo(() => {
    return providers.reduce((acc, p) => acc + (p.record_count ?? 0), 0)
  }, [providers])

  // Check if data is truly empty (not just loading)
  // BUG-008 FIX: Use filtered data (providers, dailyTrendData) instead of unfiltered totalCosts
  // This ensures empty state shows when filters return no data
  const isEmpty = !isLoading && providers.length === 0 && dailyTrendData.length === 0

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
          : { label: "Try again", onClick: handleClearCache }
      }
      isEmpty={isEmpty}
      emptyState={{
        icon: Wallet,
        title: "No subscription costs yet",
        description: "Add your SaaS subscriptions (Slack, Notion, Figma, etc.) and run the subscription cost pipeline to see your spend.",
        action: { label: "Add Subscriptions", href: `/${orgSlug}/integrations/subscriptions` },
      }}
      onRefresh={handleClearCache}
      isRefreshing={isRefreshing}
      filterActions={
        <>
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
        </>
      }
    >
      {/* Summary Metrics */}
      <div className="animate-fade-up">
        <CostSummaryGrid data={summaryData} />
      </div>

      {/* Daily Cost Trend Chart - Bar with Moving Average Line */}
      {dailyTrendData.length > 0 && (
        <div className="animate-fade-up animation-delay-100">
        <DailyTrendChart
          title="Subscription Cost Trend"
          subtitle={`${rollingAvgLabel} overlay on ${timeRange === "365" || timeRange === "ytd" ? "monthly" : timeRange === "90" ? "weekly" : "daily"} spend`}
          data={dailyTrendData.map(d => ({
            date: d.date,
            label: d.label,
            value: d.value,
          }))}
          timeRange={timeRange}
          category="subscription"
          height={320}
          mobileHeight={240}
          loading={isLoading}
        />
        </div>
      )}

      {/* Provider Breakdown with Ring Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-200">
        {/* Ring Chart - Provider Breakdown */}
        {ringSegments.length > 0 && (
          <CostRingChart
            title="SaaS Spend"
            segments={ringSegments}
            centerLabel={timeRange === "mtd" ? "MTD" : timeRange === "ytd" ? "YTD" : timeRange === "qtd" ? "QTD" : timeRange === "custom" ? "Custom" : timeRange === "last_month" ? "Last Mo" : `${timeRange}d`}
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
        <div className="animate-fade-up animation-delay-300">
          <CostDataTable
            title="Cost Details"
            subtitle={`${subscriptionCount} subscriptions tracked`}
            rows={tableRows}
            showCount
            countLabel="subscriptions"
            maxRows={10}
          />
        </div>
      )}
    </CostDashboardShell>
  )
}
