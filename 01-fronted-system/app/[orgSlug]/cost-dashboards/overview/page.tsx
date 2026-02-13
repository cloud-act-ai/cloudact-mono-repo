"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { getOrgSlug } from "@/lib/utils"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import {
  DollarSign,
  Brain,
  Cloud,
  Wallet,
  ChevronRight,
} from "lucide-react"

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
  getDefaultFilters,
  type CostFiltersState,
} from "@/components/costs"
import {
  getDateInfo,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  type ProviderData,
  // Design tokens
  CATEGORY_COLORS,
  DEFAULT_COLOR,
  getMonoShade,
} from "@/lib/costs"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import { useDailyTrendData, useCostSummary, useRollingAvgLabel } from "@/hooks/use-cost-dashboard"

export default function CostOverviewPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use unified filters from context
  const {
    totalCosts: cachedTotalCosts,
    providerBreakdown: cachedProviders,
    hierarchy: cachedHierarchy,
    currency: cachedCurrency,
    isLoading: isCostLoading,
    error: contextError,
    refresh: refreshCostData,
    availableFilters,
    // Unified filter API (all client-side, instant)
    filters: contextFilters,
    setUnifiedFilters,
    getFilteredTimeSeries,
    getFilteredProviderBreakdown,
    getFilteredCategoryBreakdown,
  } = useCostData()

  // BUG-FIX: Use ref to avoid infinite loop - setUnifiedFilters changes on every state update
  const setUnifiedFiltersRef = React.useRef(setUnifiedFilters)
  setUnifiedFiltersRef.current = setUnifiedFilters

  // Mount: Reset stale filters from previous page. Unmount: Clean up all filters.
  useEffect(() => {
    // Clear any category/provider/hierarchy filters from previous page
    setUnifiedFiltersRef.current({
      categories: undefined,
      providers: undefined,
      hierarchyEntityId: undefined,
      hierarchyEntityName: undefined,
      hierarchyLevelCode: undefined,
      hierarchyPath: undefined,
      hierarchyPathNames: undefined,
    })
    // Reset local filter state
    setFilters(getDefaultFilters())

    return () => {
      setUnifiedFiltersRef.current({
        categories: undefined,
        providers: undefined,
        hierarchyEntityId: undefined,
        hierarchyEntityName: undefined,
        hierarchyLevelCode: undefined,
        hierarchyPath: undefined,
        hierarchyPathNames: undefined,
      })
    }
  }, []) // Empty deps - only run on mount/unmount

  // Extract time range from unified filters
  const timeRange = contextFilters.timeRange
  const customRange = contextFilters.customRange

  // Local state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState<CostFiltersState>(getDefaultFilters)

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
  // This filters the 365-day cache by the selected time range
  const timeFilteredProviders = useMemo(() => {
    return getFilteredProviderBreakdown()
  }, [getFilteredProviderBreakdown])

  // Client-side filtered providers - apply additional provider selection filter
  const filteredProviders = useMemo(() => {
    if (!hasProviderFilter) return timeFilteredProviders

    // Filter time-filtered providers by selected provider names
    const selectedProviders = new Set(filters.providers.map(p => p.toLowerCase()))
    return timeFilteredProviders.filter(p =>
      selectedProviders.has(p.provider.toLowerCase())
    )
  }, [timeFilteredProviders, filters.providers, hasProviderFilter])

  // Use cached or client-side filtered data
  const totalSummary = cachedTotalCosts
  const providers = filteredProviders
  const hierarchy = cachedHierarchy
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY
  const isLoading = isCostLoading
  const error = contextError

  // Available providers for filter dropdown
  const availableProviders = useMemo(() => {
    return cachedProviders.map(p => p.provider)
  }, [cachedProviders])

  // Handle filter changes - sync to unified context for provider/category/hierarchy filters
  // FILTER-008 FIX: Sync local filters to context for consistent filtering
  // TYPE-002 FIX: Validate categories before casting to avoid runtime type mismatches
  // HIERARCHY-FILTER-FIX: Sync hierarchy filters to unified context
  const handleFiltersChange = useCallback((newFilters: CostFiltersState) => {
    setFilters(newFilters)
    // Validate and filter to only allowed category values
    const validCategories = ["genai", "cloud", "subscription"] as const
    const safeCategories = newFilters.categories.filter(
      (c): c is "genai" | "cloud" | "subscription" => validCategories.includes(c as typeof validCategories[number])
    )
    // Sync all filters to unified context (provider, category, hierarchy)
    // HIERARCHY-FILTER-BUG-FIX: Include new 5-field hierarchy model fields
    // These are set by CostFilters when user selects hierarchy entities
    setUnifiedFilters({
      providers: newFilters.providers.length > 0 ? newFilters.providers : undefined,
      categories: safeCategories.length > 0 ? safeCategories : undefined,
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

  // Shared hooks — eliminates duplicated trend/summary logic across all cost pages
  const rollingAvgLabel = useRollingAvgLabel(timeRange, customRange)
  const dailyTrendData = useDailyTrendData()
  const summaryData = useCostSummary(dailyTrendData, timeRange)

  // PERF-001 FIX: Memoize dateInfo to avoid redundant calculations
  const dateInfo = useMemo(() => getDateInfo(), [])

  // TYPE-001 FIX: Safely map filtered providers to ProviderData shape
  // This ensures type safety without unsafe `as` assertions
  const safeProviders = useMemo((): ProviderData[] => {
    return providers.map((p) => ({
      provider: p.provider ?? "",
      total_cost: Number.isFinite(p.total_cost) ? p.total_cost : 0,
      percentage: Number.isFinite(p.percentage) ? p.percentage : 0,
      record_count: Number.isFinite(p.record_count) ? p.record_count : 0,
    }))
  }, [providers])

  // Convert providers to table rows using centralized helper
  // PERF-001 FIX: Use memoized dateInfo instead of calling getDateInfo() again
  const tableRows = useMemo(() => {
    return transformProvidersToTableRows(safeProviders, dateInfo, {
      names: {},
      colors: {},
      defaultColor: DEFAULT_COLOR, // COLOR-001 fix
    })
  }, [safeProviders, dateInfo])

  // Ring chart segments - uses TIME-FILTERED category breakdown
  // BUG-001 FIX: Use getFilteredCategoryBreakdown() to respect time range filter
  const ringSegments = useMemo(() => {
    // When provider filter is active, show filtered providers in ring
    if (hasProviderFilter && filteredProviders.length > 0) {
      return filteredProviders
        .filter(p => p.total_cost > 0)
        .slice(0, 6)
        .map((p, index) => ({
          key: p.provider,
          name: p.provider,
          value: p.total_cost,
          color: getMonoShade(index, "genai"),
        }))
    }

    // BUG-001 FIX: Use time-filtered category breakdown instead of 365-day totals
    const categoryBreakdown = getFilteredCategoryBreakdown()
    const categoryMap = new Map(categoryBreakdown.map(c => [c.category.toLowerCase(), c.total_cost]))

    return [
      { key: "genai", name: "GenAI", value: categoryMap.get("genai") ?? 0, color: CATEGORY_COLORS.genai },
      { key: "cloud", name: "Cloud", value: categoryMap.get("cloud") ?? 0, color: CATEGORY_COLORS.cloud },
      { key: "subscription", name: "Subscriptions", value: categoryMap.get("subscription") ?? 0, color: CATEGORY_COLORS.subscription },
    ].filter(s => s.value > 0)
  }, [getFilteredCategoryBreakdown, hasProviderFilter, filteredProviders])

  // Helper to filter providers by category using availableFilters
  // FILTER-FIX: Use timeFilteredProviders (respects time range) as base, then apply provider filter
  const getProvidersByCategory = useCallback((category: "genai" | "cloud" | "subscription") => {
    // Use availableFilters to get category info from backend
    // BUG-008 FIX: Check p.id exists to prevent runtime error on null/undefined
    const categoryProviderIds = new Set(
      availableFilters.providers
        .filter(p => p.category === category && p.id)
        .map(p => p.id.toLowerCase())
    )
    // FILTER-FIX: Use filteredProviders which is already time-filtered + optional provider filter
    return filteredProviders.filter(p =>
      categoryProviderIds.has(p.provider.toLowerCase())
    )
  }, [availableFilters.providers, filteredProviders])

  // Top 5 Cost Drivers by Category (using unified filter data)
  const top5GenAI = useMemo(() => {
    const genaiProviders = getProvidersByCategory("genai")
    return transformProvidersToBreakdownItems(
      genaiProviders.sort((a, b) => b.total_cost - a.total_cost).slice(0, 5),
      { names: {}, colors: {}, defaultColor: "#10A37F" }
    )
  }, [getProvidersByCategory])

  const top5Cloud = useMemo(() => {
    const cloudProviders = getProvidersByCategory("cloud")
    return transformProvidersToBreakdownItems(
      cloudProviders.sort((a, b) => b.total_cost - a.total_cost).slice(0, 5),
      { names: {}, colors: {}, defaultColor: "#4285F4" }
    )
  }, [getProvidersByCategory])

  const top5Subscription = useMemo(() => {
    const subProviders = getProvidersByCategory("subscription")
    return transformProvidersToBreakdownItems(
      subProviders.sort((a, b) => b.total_cost - a.total_cost).slice(0, 5),
      { names: {}, colors: {}, defaultColor: "#FF6C5E" }
    )
  }, [getProvidersByCategory])

  // Check if data is truly empty (not just loading)
  const isEmpty = !isLoading && !totalSummary && providers.length === 0

  return (
    <CostDashboardShell
      title="Cost Overview"
      subtitle="Unified view of all spending"
      icon={DollarSign}
      loading={isLoading}
      loadingMessage="Loading cost overview..."
      error={error}
      errorAction={{ label: "Try again", onClick: handleRefresh }}
      isEmpty={isEmpty}
      emptyState={{
        icon: DollarSign,
        title: "No cost data yet",
        description: "Connect your providers and run pipelines to see your cost data here.",
        action: { label: "Connect Providers", href: `/${orgSlug}/integrations` },
      }}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      filterActions={
        <>
          <CostFilters
            value={filters}
            onChange={handleFiltersChange}
            hierarchy={hierarchy}
            availableProviders={availableProviders}
            availableCategories={availableFilters.categories}
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

      {/* Daily Cost Trend Chart - Full Width */}
      {dailyTrendData.length > 0 && (
        <div className="animate-fade-up animation-delay-100">
          <DailyTrendChart
            title="Cost Trend"
            subtitle={`${rollingAvgLabel} overlay on ${timeRange === "365" || timeRange === "ytd" ? "monthly" : timeRange === "90" ? "weekly" : "daily"} spend`}
            data={dailyTrendData.map(d => ({
              date: d.date,
              label: d.label,
              value: d.value,
            }))}
            timeRange={timeRange}
            height={320}
            mobileHeight={240}
            loading={isLoading}
          />
        </div>
      )}

      {/* Row 1: Total Spend (Pie) + Top 5 GenAI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-200">
        {/* Total Spend Ring Chart */}
        {ringSegments.length > 0 && (
          <CostRingChart
            title="Total Spend"
            segments={ringSegments}
            centerLabel={timeRange === "mtd" ? "MTD" : timeRange === "ytd" ? "YTD" : `${timeRange}d`}
            insight={`Spending across ${ringSegments.length} cost ${ringSegments.length > 1 ? "categories" : "category"} in selected period.`}
            size={200}
            thickness={22}
            titleColor="#90FCA6"
            className="premium-card"
          />
        )}

        {/* Top 5 GenAI Cost Drivers */}
        {top5GenAI.length > 0 ? (
          <CostBreakdownChart
            title="Top 5 GenAI Cost Drivers"
            items={top5GenAI}
            countLabel="providers"
            maxItems={5}
            showOthers={false}
            className="premium-card"
          />
        ) : (
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-[#10A37F]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-[var(--text-tertiary)]">No GenAI costs yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Top 5 Cloud + Top 5 Subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-300">
        {/* Top 5 Cloud Cost Drivers */}
        {top5Cloud.length > 0 ? (
          <CostBreakdownChart
            title="Top 5 Cloud Cost Drivers"
            items={top5Cloud}
            countLabel="services"
            maxItems={5}
            showOthers={false}
            className="premium-card"
          />
        ) : (
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Cloud className="h-6 w-6 sm:h-8 sm:w-8 text-[#4285F4]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-[var(--text-tertiary)]">No cloud costs yet</p>
            </div>
          </div>
        )}

        {/* Top 5 Subscription Cost Drivers */}
        {top5Subscription.length > 0 ? (
          <CostBreakdownChart
            title="Top 5 Subscription Cost Drivers"
            items={top5Subscription}
            countLabel="subscriptions"
            maxItems={5}
            showOthers={false}
            className="premium-card"
          />
        ) : (
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-[#FF6C5E]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-[var(--text-tertiary)]">No subscription costs yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Access Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 animate-fade-up animation-delay-400">
        <Link
          href={`/${orgSlug}/cost-dashboards/genai-costs`}
          className="premium-card bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-3.5 sm:p-5 group"
          aria-label="View GenAI costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#10A37F]/10">
                <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-[#10A37F]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">GenAI Costs</h3>
                <p className="text-xs sm:text-xs text-[var(--text-tertiary)]">LLM API usage</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" aria-hidden="true" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/cloud-costs`}
          className="premium-card bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-3.5 sm:p-5 group"
          aria-label="View cloud costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#4285F4]/10">
                <Cloud className="h-4 w-4 sm:h-5 sm:w-5 text-[#4285F4]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">Cloud Costs</h3>
                <p className="text-xs sm:text-xs text-[var(--text-tertiary)]">GCP, AWS, Azure</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" aria-hidden="true" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/subscription-costs`}
          className="premium-card bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-3.5 sm:p-5 group"
          aria-label="View subscription costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#FF6C5E]/10">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-[#FF6C5E]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">Subscription Costs</h3>
                <p className="text-xs sm:text-xs text-[var(--text-tertiary)]">SaaS & software</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" aria-hidden="true" />
          </div>
        </Link>
      </div>

      {/* Provider Details Table */}
      {tableRows.length > 0 && (
        <div className="animate-fade-up animation-delay-500">
          <CostDataTable
            title="Provider Details"
            rows={tableRows}
            showCount
            countLabel="providers"
            maxRows={10}
          />
        </div>
      )}
    </CostDashboardShell>
  )
}
