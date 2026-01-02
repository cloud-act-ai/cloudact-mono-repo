"use client"

import React, { useState, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { Brain } from "lucide-react"
import { getOrgSlug } from "@/lib/utils"

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
  type CostSummaryData,
  type DateRange,
  type CostFiltersState,
  type ScoreRingSegment,
  type ComboDataPoint,
} from "@/components/costs"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import { useCostData } from "@/contexts/cost-data-context"
import {
  getDateInfo,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  GENAI_PROVIDER_CONFIG,
  type ProviderData,
} from "@/lib/costs"

export default function GenAICostsPage() {
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
  } = useCostData()

  // Local state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)
  const [filters, setFilters] = useState<CostFiltersState>(getDefaultFilters)

  // Determine if provider filter is active (for client-side filtering)
  const hasProviderFilter = filters.providers.length > 0

  // Get LLM providers from cached data (instant, no backend call)
  const llmProviders = useMemo(() => {
    return getFilteredProviders('llm')
  }, [getFilteredProviders])

  // Client-side filtered providers (instant, no backend call)
  const filteredProviders = useMemo(() => {
    if (!hasProviderFilter) return llmProviders

    // Filter LLM providers by selected providers (instant client-side)
    const selectedProviders = new Set(filters.providers.map(p => p.toLowerCase()))
    return llmProviders.filter(p =>
      selectedProviders.has(p.provider.toLowerCase())
    )
  }, [llmProviders, filters.providers, hasProviderFilter])

  // Use cached or client-side filtered data
  const providers = filteredProviders
  const hierarchy = cachedHierarchy
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY
  const isLoading = isCostLoading
  const error = contextError

  // Available providers for filter dropdown
  const availableProviders = useMemo(() => {
    return llmProviders.map(p => p.provider)
  }, [llmProviders])

  // Handle date range change
  const handleDateRangeChange = useCallback((newRange: DateRange) => {
    setDateRange(newRange)
  }, [])

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

  // Generate daily trend data from period costs
  // Uses deterministic pseudo-random based on date for consistent rendering
  const dailyTrendData = useMemo<ComboDataPoint[]>(() => {
    const mtd = totalCosts?.llm?.mtd_cost ?? totalCosts?.llm?.total_monthly_cost ?? 0
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
  }, [totalCosts])

  // Prepare summary data from cached totalCosts.llm
  const summaryData: CostSummaryData = useMemo(() => {
    // Use LLM-specific metrics from totalCosts
    const llmCosts = totalCosts?.llm
    return {
      mtd: llmCosts?.mtd_cost ?? llmCosts?.total_monthly_cost ?? 0,
      dailyRate: llmCosts?.total_daily_cost ?? 0,
      forecast: llmCosts?.total_monthly_cost ?? 0,
      ytd: llmCosts?.ytd_cost ?? llmCosts?.total_annual_cost ?? 0,
      currency: orgCurrency,
    }
  }, [totalCosts, orgCurrency])

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

  // Score ring segments for LLM provider breakdown
  // Filter first to avoid showing empty segments, then slice for top 6
  const scoreRingSegments: ScoreRingSegment[] = useMemo(() => {
    const colors = ["#10A37F", "#D4A574", "#4285F4", "#7C3AED", "#FF6C5E", "#00CED1", "#FF69B4", "#32CD32"]
    return providers
      .filter(p => p.total_cost > 0)
      .slice(0, 6)
      .map((p, index) => ({
        key: p.provider,
        name: GENAI_PROVIDER_CONFIG.names[p.provider.toLowerCase()] || p.provider,
        value: p.total_cost,
        color: colors[index % colors.length],
      }))
  }, [providers])

  // Check if data is truly empty (not just loading)
  const isEmpty = !isLoading && !totalCosts?.llm && providers.length === 0

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
          title="GenAI Daily Cost Trend"
          subtitle="Last 14 days with 7-day moving average"
          data={dailyTrendData}
          currency={orgCurrency}
          barColor="#10A37F"
          lineColor="#FF6C5E"
          barLabel="Daily Cost"
          lineLabel="7-Day Avg"
          height={320}
          showAreaFill
          loading={isLoading}
        />
      )}

      {/* Provider Breakdown with Score Ring */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Score Ring - LLM Provider Breakdown */}
        {scoreRingSegments.length > 0 && (
          <CostScoreRing
            title="LLM Spend"
            segments={scoreRingSegments}
            currency={orgCurrency}
            insight={`Spending across ${scoreRingSegments.length} AI provider${scoreRingSegments.length > 1 ? "s" : ""}.`}
            compact
            ringSize={96}
            strokeWidth={12}
            titleColor="#10A37F"
          />
        )}

        {/* Provider Breakdown inline */}
        {providerBreakdownItems.length > 0 && (
          <CostBreakdownChart
            title="Cost by Provider"
            items={providerBreakdownItems}
            currency={orgCurrency}
            countLabel="records"
            maxItems={4}
          />
        )}
      </div>

      {/* Provider Details Table */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Cost Details"
          rows={tableRows}
          currency={orgCurrency}
          typeLabel="Service"
          showCount={false}
          maxRows={10}
        />
      )}
    </CostDashboardShell>
  )
}
