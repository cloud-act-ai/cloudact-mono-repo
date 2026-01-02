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
    getDailyTrendForRange,
    availableFilters,
  } = useCostData()

  // Local state - GenAI costs page (category fixed to "genai")
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

  // Get GenAI providers from cached data (instant, no backend call)
  const genaiProviders = useMemo(() => {
    return getFilteredProviders('genai')
  }, [getFilteredProviders])

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

  // Get daily trend data from context (real data from backend)
  // Pass "genai" category to get GenAI-specific trend data
  const dailyTrendData = useMemo<ComboDataPoint[]>(() => {
    const trendData = getDailyTrendForRange(timeRange, "genai", customRange)

    // Transform to ComboDataPoint format with lineValue for rolling average
    return trendData.map((point) => ({
      label: point.label,
      value: point.value,
      lineValue: point.rollingAvg,
      date: point.date,
    }))
  }, [getDailyTrendForRange, timeRange, customRange])

  // Prepare summary data from cached totalCosts.genai
  const summaryData: CostSummaryData = useMemo(() => {
    // Use GenAI-specific metrics from totalCosts
    const genaiCosts = totalCosts?.genai
    return {
      mtd: genaiCosts?.mtd_cost ?? genaiCosts?.total_monthly_cost ?? 0,
      dailyRate: genaiCosts?.total_daily_cost ?? 0,
      forecast: genaiCosts?.total_monthly_cost ?? 0,
      ytd: genaiCosts?.total_annual_cost ?? 0,
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
          title="GenAI Daily Cost Trend"
          subtitle={`${rollingAvgLabel} overlay on daily spend`}
          data={dailyTrendData}
          currency={orgCurrency}
          barColor="#10A37F"
          lineColor="#FF6C5E"
          barLabel="Daily Cost"
          lineLabel={rollingAvgLabel}
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
