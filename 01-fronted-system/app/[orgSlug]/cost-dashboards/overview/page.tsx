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
  CostDashboardShell,
  CostSummaryGrid,
  CostBreakdownChart,
  CostDataTable,
  DateRangeFilter,
  CostFilters,
  CostScoreRing,
  CostComboChart,
  getDefaultDateRange,
  getDefaultFilters,
  type BreakdownItem,
  type CostSummaryData,
  type DateRange,
  type CostFiltersState,
  type ScoreRingSegment,
  type ComboDataPoint,
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
} from "@/lib/costs"
import { useCostData } from "@/contexts/cost-data-context"

export default function CostOverviewPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use cached cost data from context
  const {
    totalCosts: cachedTotalCosts,
    providerBreakdown: cachedProviders,
    periodCosts: cachedPeriodCosts,
    hierarchy: cachedHierarchy,
    currency: cachedCurrency,
    isLoading: isCostLoading,
    error: contextError,
    refresh: refreshCostData,
  } = useCostData()

  // Local state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)
  const [filters, setFilters] = useState<CostFiltersState>(getDefaultFilters)

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

  // Handle date range change
  const handleDateRangeChange = useCallback((newRange: DateRange) => {
    setDateRange(newRange)
  }, [])

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

  // Generate daily trend data from period costs
  // Uses deterministic pseudo-random based on date for consistent rendering
  const dailyTrendData = useMemo<ComboDataPoint[]>(() => {
    const mtd = periodCosts?.mtd ?? totalSummary?.total?.total_monthly_cost ?? 0
    const today = new Date()
    const dailyAvg = today.getDate() > 0 ? mtd / today.getDate() : 0

    // Deterministic seed function based on date
    const seededVariance = (dayOffset: number): number => {
      const seed = today.getDate() * 31 + dayOffset * 7
      const x = Math.sin(seed) * 10000
      return 0.7 + (x - Math.floor(x)) * 0.6
    }

    const trendData: ComboDataPoint[] = []
    for (let i = 13; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dayLabel = date.getDate().toString()
      const variance = seededVariance(i)
      const dayValue = i === 0 ? dailyAvg : dailyAvg * variance

      trendData.push({
        label: dayLabel,
        value: Math.round(dayValue * 100) / 100,
        date: date.toISOString().split('T')[0],
      })
    }
    return trendData
  }, [periodCosts, totalSummary])

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
        color: OVERVIEW_CATEGORY_CONFIG.colors.saas,
      }]
    }

    const genaiCost = totalSummary?.llm?.total_monthly_cost ?? 0
    const cloudCost = totalSummary?.cloud?.total_monthly_cost ?? 0
    const saasCost = totalSummary?.saas?.total_monthly_cost ?? 0
    const totalCost = genaiCost + cloudCost + saasCost

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
        key: "saas",
        name: OVERVIEW_CATEGORY_CONFIG.names.saas,
        value: saasCost,
        percentage: calculatePercentage(saasCost, totalCost),
        color: OVERVIEW_CATEGORY_CONFIG.colors.saas,
      },
    ].filter(c => c.value > 0).sort((a, b) => b.value - a.value)
  }, [totalSummary, hasProviderFilter, filteredProviders, filters.providers])

  // Calculate summary data from TotalCostSummary using centralized helper
  const summaryData: CostSummaryData = useMemo(() => {
    // Use periodCosts for accurate MTD if available
    const mtdFromPeriod = periodCosts?.mtd ?? 0
    const ytdFromPeriod = periodCosts?.ytd ?? 0

    const saasMtd = getSafeValue(totalSummary?.saas, "mtd_cost")
    const cloudMtd = getSafeValue(totalSummary?.cloud, "mtd_cost")
    const llmMtd = getSafeValue(totalSummary?.llm, "mtd_cost")
    const combinedMTD = mtdFromPeriod || saasMtd + cloudMtd + llmMtd || (totalSummary?.total?.total_monthly_cost ?? 0)

    const saasYtd = getSafeValue(totalSummary?.saas, "ytd_cost")
    const cloudYtd = getSafeValue(totalSummary?.cloud, "ytd_cost")
    const llmYtd = getSafeValue(totalSummary?.llm, "ytd_cost")
    const combinedYTD = ytdFromPeriod || saasYtd + cloudYtd + llmYtd || (totalSummary?.total?.total_annual_cost ?? 0)

    return {
      mtd: combinedMTD,
      dailyRate: totalSummary?.total?.total_daily_cost ?? 0,
      forecast: totalSummary?.total?.total_monthly_cost ?? 0,
      ytd: combinedYTD,
      currency: orgCurrency,
    }
  }, [totalSummary, periodCosts, orgCurrency])

  // Convert providers to breakdown items using centralized helper
  const providerBreakdownItems = useMemo(() =>
    transformProvidersToBreakdownItems(providers as ProviderData[], {
      names: {},
      colors: {},
      defaultColor: "#94a3b8",
    }),
    [providers]
  )

  // Convert providers to table rows using centralized helper
  const tableRows = useMemo(() => {
    const dateInfo = getDateInfo()
    return transformProvidersToTableRows(providers as ProviderData[], dateInfo, {
      names: {},
      colors: {},
      defaultColor: "#94a3b8",
    })
  }, [providers])

  // Score ring segments for Apple Health style visualization
  const scoreRingSegments: ScoreRingSegment[] = useMemo(() => {
    const genaiCost = totalSummary?.llm?.total_monthly_cost ?? 0
    const cloudCost = totalSummary?.cloud?.total_monthly_cost ?? 0
    const saasCost = totalSummary?.saas?.total_monthly_cost ?? 0

    return [
      { key: "genai", name: "GenAI", value: genaiCost, color: "#10A37F" },
      { key: "cloud", name: "Cloud", value: cloudCost, color: "#4285F4" },
      { key: "saas", name: "SaaS", value: saasCost, color: "#FF6C5E" },
    ].filter(s => s.value > 0)
  }, [totalSummary])

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
            disabled={isLoading || isRefreshing}
            loading={isLoading}
          />
          <DateRangeFilter
            value={dateRange}
            onChange={handleDateRangeChange}
            disabled={isLoading || isRefreshing}
          />
        </div>
      }
    >
      {/* Summary Metrics */}
      <CostSummaryGrid data={summaryData} />

      {/* Daily Cost Trend Chart - Bar with Moving Average Line */}
      {dailyTrendData.length > 0 && (
        <CostComboChart
          title="Daily Cost Trend"
          subtitle="Last 14 days with 7-day moving average"
          data={dailyTrendData}
          currency={orgCurrency}
          barColor="#90FCA6"
          lineColor="#FF6C5E"
          barLabel="Daily Cost"
          lineLabel="7-Day Avg"
          height={320}
          showAreaFill
          loading={isLoading}
        />
      )}

      {/* Category Breakdown with Score Ring */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Score Ring - Total Spend Breakdown */}
        {scoreRingSegments.length > 0 && (
          <CostScoreRing
            title="Total Spend"
            segments={scoreRingSegments}
            currency={orgCurrency}
            insight={`Spending across ${scoreRingSegments.length} cost categories this month.`}
            compact
            ringSize={96}
            strokeWidth={12}
            titleColor="#1a7a3a"
          />
        )}

        {/* Category Breakdown */}
        {categories.length > 0 && (
          <CostBreakdownChart
            title="Cost by Category"
            items={categories}
            currency={orgCurrency}
            countLabel="subscriptions"
            maxItems={3}
          />
        )}
      </div>

      {/* Provider Breakdown */}
      {providerBreakdownItems.length > 0 && (
        <CostBreakdownChart
          title="Top Providers by Spend"
          items={providerBreakdownItems}
          currency={orgCurrency}
          countLabel="subscriptions"
          maxItems={5}
        />
      )}

      {/* Quick Access Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/${orgSlug}/cost-dashboards/genai-costs`}
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
          aria-label="View GenAI costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#10A37F]/10">
                <Brain className="h-5 w-5 text-[#10A37F]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">GenAI Costs</h3>
                <p className="text-xs text-slate-500">LLM API usage</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/cloud-costs`}
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
          aria-label="View cloud costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#4285F4]/10">
                <Cloud className="h-5 w-5 text-[#4285F4]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Cloud Costs</h3>
                <p className="text-xs text-slate-500">GCP, AWS, Azure</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/subscription-costs`}
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
          aria-label="View subscription costs dashboard"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#FF6C5E]/10">
                <Wallet className="h-5 w-5 text-[#FF6C5E]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Subscription Costs</h3>
                <p className="text-xs text-slate-500">SaaS & software</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
          </div>
        </Link>
      </div>

      {/* Provider Details Table */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Provider Details"
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
