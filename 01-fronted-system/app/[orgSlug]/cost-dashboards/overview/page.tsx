"use client"

import React, { useState, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { getOrgSlug } from "@/lib/utils"
import {
  DollarSign,
  Brain,
  Cloud,
  Wallet,
  ChevronRight,
} from "lucide-react"

import {
  CostTrendChart,
  CostRingChart,
  CostBreakdownChart,
  CostDataTable,
  type BreakdownItem,
} from "@/components/charts"
import {
  CostDashboardShell,
  CostSummaryGrid,
  TimeRangeFilter,
  CostFilters,
  getDefaultFilters,
  getRollingAverageLabel,
  type CostSummaryData,
  type CostFiltersState,
} from "@/components/costs"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import {
  getDateInfo,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  getSafeValue,
  calculatePercentage,
  OVERVIEW_CATEGORY_CONFIG,
  type ProviderData,
  // FinOps constants
  FINOPS,
  calculateAllForecasts,
  // Design tokens
  OVERVIEW_CHART_PALETTE,
  DEFAULT_CHART_PALETTE,
  CATEGORY_COLORS,
  DEFAULT_COLOR,
} from "@/lib/costs"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"

export default function CostOverviewPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use unified filters from context
  const {
    totalCosts: cachedTotalCosts,
    providerBreakdown: cachedProviders,
    periodCosts: cachedPeriodCosts,
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

  // Local state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState<CostFiltersState>(getDefaultFilters)

  // Time range handlers using unified filters (instant, no API call)
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setUnifiedFilters({ timeRange: range, customRange: range === "custom" ? customRange : undefined })
  }, [setUnifiedFilters, customRange])

  const handleCustomRangeChange = useCallback((range: CustomDateRange | undefined) => {
    setUnifiedFilters({ customRange: range })
  }, [setUnifiedFilters])

  // Determine if provider filter is active (for client-side filtering)
  const hasProviderFilter = filters.providers.length > 0

  // Client-side filtered providers (instant, no backend call)
  const filteredProviders = useMemo(() => {
    if (!hasProviderFilter) return cachedProviders

    // Filter cached providers by selected providers (instant client-side)
    const selectedProviders = new Set(filters.providers.map(p => p.toLowerCase()))
    return cachedProviders.filter(p =>
      selectedProviders.has(p.provider.toLowerCase())
    )
  }, [cachedProviders, filters.providers, hasProviderFilter])

  // Use cached or client-side filtered data
  const totalSummary = cachedTotalCosts
  const providers = filteredProviders
  const periodCosts = cachedPeriodCosts
  const hierarchy = cachedHierarchy
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY
  const isLoading = isCostLoading
  const error = contextError

  // Available providers for filter dropdown
  const availableProviders = useMemo(() => {
    return cachedProviders.map(p => p.provider)
  }, [cachedProviders])

  // Handle filter changes - triggers data reload via loadData dependency
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
      // Format label based on data length
      const label = timeSeries.length >= 60
        ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

      return {
        label,
        value: point.total,
        lineValue: Math.round(rollingAvg * 100) / 100,
        date: point.date,
      }
    })
  }, [getFilteredTimeSeries])

  // Build category breakdown from total costs data
  const categories = useMemo<BreakdownItem[]>(() => {
    if (hasProviderFilter && filteredProviders && filteredProviders.length > 0) {
      const filteredTotalCost = filteredProviders.reduce((sum, p) => sum + p.total_cost, 0)
      const filteredRecordCount = filteredProviders.reduce((sum, p) => sum + p.record_count, 0)
      return [{
        key: "filtered",
        name: filters.providers.length === 1 ? filters.providers[0] : "Selected Providers",
        value: filteredTotalCost,
        percentage: 100,
        count: filteredRecordCount,
        color: OVERVIEW_CATEGORY_CONFIG.colors.subscription,
      }]
    }

    // Use total_billed_cost for actual totals (NOT total_monthly_cost which is a forecast!)
    const genaiCost = totalSummary?.genai?.total_billed_cost ?? 0
    const cloudCost = totalSummary?.cloud?.total_billed_cost ?? 0
    const subscriptionCost = totalSummary?.subscription?.total_billed_cost ?? 0
    const totalCost = genaiCost + cloudCost + subscriptionCost

    if (totalCost === 0) return []

    return [
      {
        key: "genai",
        name: OVERVIEW_CATEGORY_CONFIG.names.genai,
        value: genaiCost,
        percentage: calculatePercentage(genaiCost, totalCost),
        color: OVERVIEW_CATEGORY_CONFIG.colors.genai,
      },
      {
        key: "cloud",
        name: OVERVIEW_CATEGORY_CONFIG.names.cloud,
        value: cloudCost,
        percentage: calculatePercentage(cloudCost, totalCost),
        color: OVERVIEW_CATEGORY_CONFIG.colors.cloud,
      },
      {
        key: "subscription",
        name: OVERVIEW_CATEGORY_CONFIG.names.subscription,
        value: subscriptionCost,
        percentage: calculatePercentage(subscriptionCost, totalCost),
        color: OVERVIEW_CATEGORY_CONFIG.colors.subscription,
      },
    ].filter(c => c.value > 0).sort((a, b) => b.value - a.value)
  }, [totalSummary, hasProviderFilter, filteredProviders, filters.providers])

  // Calculate summary data - uses filtered providers when filter is active
  const summaryData: CostSummaryData = useMemo(() => {
    // When provider filter is active, calculate from filtered providers
    if (hasProviderFilter && filteredProviders.length > 0) {
      const filteredTotal = filteredProviders.reduce((sum, p) => sum + p.total_cost, 0)
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

    // No filter - use full totals from context
    const mtdFromPeriod = periodCosts?.mtd ?? 0
    const ytdFromPeriod = periodCosts?.ytd ?? 0

    const subscriptionMtd = getSafeValue(totalSummary?.subscription, "mtd_cost")
    const cloudMtd = getSafeValue(totalSummary?.cloud, "mtd_cost")
    const genaiMtd = getSafeValue(totalSummary?.genai, "mtd_cost")
    const combinedMTD = mtdFromPeriod || subscriptionMtd + cloudMtd + genaiMtd || (totalSummary?.total?.total_monthly_cost ?? 0)

    const subscriptionYtd = getSafeValue(totalSummary?.subscription, "ytd_cost")
    const cloudYtd = getSafeValue(totalSummary?.cloud, "ytd_cost")
    const genaiYtd = getSafeValue(totalSummary?.genai, "ytd_cost")
    const combinedYTD = ytdFromPeriod || subscriptionYtd + cloudYtd + genaiYtd || (totalSummary?.total?.total_annual_cost ?? 0)

    return {
      mtd: combinedMTD,
      dailyRate: totalSummary?.total?.total_daily_cost ?? 0,
      forecast: totalSummary?.total?.total_monthly_cost ?? 0,
      ytd: combinedYTD,
      currency: orgCurrency,
    }
  }, [totalSummary, periodCosts, orgCurrency, hasProviderFilter, filteredProviders])

  // Convert providers to breakdown items using centralized helper
  const providerBreakdownItems = useMemo(() =>
    transformProvidersToBreakdownItems(providers as ProviderData[], {
      names: {},
      colors: {},
      defaultColor: DEFAULT_COLOR, // COLOR-001 fix
    }),
    [providers]
  )

  // Convert providers to table rows using centralized helper
  const tableRows = useMemo(() => {
    const dateInfo = getDateInfo()
    return transformProvidersToTableRows(providers as ProviderData[], dateInfo, {
      names: {},
      colors: {},
      defaultColor: DEFAULT_COLOR, // COLOR-001 fix
    })
  }, [providers])

  // Ring chart segments - shows filtered providers when filter active, otherwise category breakdown
  // Uses centralized design tokens for consistent colors
  const ringSegments = useMemo(() => {
    // When provider filter is active, show filtered providers in ring
    if (hasProviderFilter && filteredProviders.length > 0) {
      return filteredProviders
        .filter(p => p.total_cost > 0)
        .slice(0, 6)
        .map((p, i) => ({
          key: p.provider,
          name: p.provider,
          value: p.total_cost,
          color: DEFAULT_CHART_PALETTE[i % DEFAULT_CHART_PALETTE.length],
        }))
    }

    // No filter - show category breakdown using actual billed costs
    const genaiCost = totalSummary?.genai?.total_billed_cost ?? 0
    const cloudCost = totalSummary?.cloud?.total_billed_cost ?? 0
    const subscriptionCost = totalSummary?.subscription?.total_billed_cost ?? 0

    return [
      { key: "genai", name: "GenAI", value: genaiCost, color: CATEGORY_COLORS.genai },
      { key: "cloud", name: "Cloud", value: cloudCost, color: CATEGORY_COLORS.cloud },
      { key: "subscription", name: "Subscriptions", value: subscriptionCost, color: CATEGORY_COLORS.subscription },
    ].filter(s => s.value > 0)
  }, [totalSummary, hasProviderFilter, filteredProviders])

  // Helper to filter providers by category using availableFilters
  const getProvidersByCategory = useCallback((category: "genai" | "cloud" | "subscription") => {
    // Use availableFilters to get category info from backend
    const categoryProviderIds = new Set(
      availableFilters.providers
        .filter(p => p.category === category)
        .map(p => p.id.toLowerCase())
    )
    // Filter cachedProviders by category
    return cachedProviders.filter(p =>
      categoryProviderIds.has(p.provider.toLowerCase())
    )
  }, [availableFilters.providers, cachedProviders])

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
      headerActions={
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
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
        </div>
      }
    >
      {/* Summary Metrics */}
      <div className="animate-fade-up">
        <CostSummaryGrid data={summaryData} />
      </div>

      {/* Row 1: Total Spend (Pie) + Top 5 GenAI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-100">
        {/* Total Spend Ring Chart */}
        {ringSegments.length > 0 && (
          <CostRingChart
            title="Total Spend"
            segments={ringSegments}
            centerLabel="MTD"
            insight={`Spending across ${ringSegments.length} cost categories this month.`}
            size={200}
            thickness={22}
            titleColor="#1a7a3a"
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
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-[#10A37F]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-slate-500">No GenAI costs yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Top 5 Cloud + Top 5 Subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-200">
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
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Cloud className="h-6 w-6 sm:h-8 sm:w-8 text-[#4285F4]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-slate-500">No cloud costs yet</p>
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
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-[#FF6C5E]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-slate-500">No subscription costs yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Daily Cost Trend Chart - Full Width (75% visual weight) */}
      {dailyTrendData.length > 0 && (
        <div className="animate-fade-up animation-delay-300">
          <CostTrendChart
            title="Daily Cost Trend"
            subtitle={`${rollingAvgLabel} overlay on daily spend`}
            data={dailyTrendData.map(d => ({
              date: d.date,
              label: d.label,
              value: d.value,
              rollingAvg: d.lineValue,
            }))}
            showBars={true}
            showLine={true}
            barColor="#90FCA6"
            lineColor="#FF6C5E"
            enableZoom={true}
            height={360}
            loading={isLoading}
          />
        </div>
      )}

      {/* Quick Access Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 animate-fade-up animation-delay-400">
        <Link
          href={`/${orgSlug}/cost-dashboards/genai-costs`}
          className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3.5 sm:p-5 group"
          aria-label="View GenAI costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#10A37F]/10">
                <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-[#10A37F]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900">GenAI Costs</h3>
                <p className="text-[10px] sm:text-xs text-slate-500">LLM API usage</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/cloud-costs`}
          className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3.5 sm:p-5 group"
          aria-label="View cloud costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#4285F4]/10">
                <Cloud className="h-4 w-4 sm:h-5 sm:w-5 text-[#4285F4]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900">Cloud Costs</h3>
                <p className="text-[10px] sm:text-xs text-slate-500">GCP, AWS, Azure</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/subscription-costs`}
          className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3.5 sm:p-5 group"
          aria-label="View subscription costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#FF6C5E]/10">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-[#FF6C5E]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900">Subscription Costs</h3>
                <p className="text-[10px] sm:text-xs text-slate-500">SaaS & software</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
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
            countLabel="subscriptions"
            maxRows={10}
          />
        </div>
      )}
    </CostDashboardShell>
  )
}
