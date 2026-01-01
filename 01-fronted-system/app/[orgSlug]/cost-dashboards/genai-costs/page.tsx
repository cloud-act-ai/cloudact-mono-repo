"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { Brain } from "lucide-react"

import {
  CostDashboardShell,
  CostSummaryGrid,
  CostBreakdownChart,
  CostDataTable,
  DateRangeFilter,
  CostFilters,
  CostScoreRing,
  CostInsightsCard,
  CostPeriodSelector,
  getDefaultDateRange,
  getDefaultFilters,
  dateRangeToApiParams,
  getPeriodDates,
  type CostSummaryData,
  type DateRange,
  type CostFiltersState,
  type HierarchyEntity,
  type ScoreRingSegment,
  type PeriodType,
} from "@/components/costs"
import { getGenAICosts, getCostByProvider, type CostSummary, type ProviderBreakdown, type CostFilterParams } from "@/actions/costs"
import { getHierarchy } from "@/actions/hierarchy"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import {
  getDateInfo,
  filterGenAIProviders,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  GENAI_PROVIDER_CONFIG,
  type ProviderData,
} from "@/lib/costs"

export default function GenAICostsPage() {
  const params = useParams()
  // Handle case where orgSlug could be string[] from catch-all routes
  const orgSlug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : (params.orgSlug ?? "")

  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [providers, setProviders] = useState<ProviderBreakdown[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)
  const [filters, setFilters] = useState<CostFiltersState>(getDefaultFilters)
  const [hierarchy, setHierarchy] = useState<HierarchyEntity[]>([])
  const [availableProviders, setAvailableProviders] = useState<string[]>([])
  const [period, setPeriod] = useState<PeriodType>("M")

  // Track if hierarchy has been loaded to avoid re-fetching on filter/date changes
  const [hierarchyLoaded, setHierarchyLoaded] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Convert date range to API parameters
      const { startDate, endDate } = dateRangeToApiParams(dateRange)

      // Convert UI filters to API filter params
      const apiFilters: CostFilterParams = {
        departmentId: filters.department,
        projectId: filters.project,
        teamId: filters.team,
        providers: filters.providers.length > 0 ? filters.providers : undefined,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
      }

      // Check if filters are active
      const hasActiveFilters = filters.providers.length > 0 ||
        filters.department || filters.project || filters.team

      // Load hierarchy in parallel with cost data (only on first load)
      const hierarchyPromise = hierarchyLoaded
        ? Promise.resolve(null)
        : getHierarchy(orgSlug)

      const [costsResult, providersResult, hierarchyResult] = await Promise.all([
        getGenAICosts(orgSlug, startDate, endDate, apiFilters),
        getCostByProvider(orgSlug, startDate, endDate, apiFilters),
        hierarchyPromise,
      ])

      // Process hierarchy data if loaded
      if (hierarchyResult && hierarchyResult.success && hierarchyResult.data?.entities) {
        const entities: HierarchyEntity[] = hierarchyResult.data.entities.map((h) => ({
          entity_id: h.entity_id,
          entity_name: h.entity_name,
          entity_type: h.entity_type as "department" | "project" | "team",
          parent_id: h.parent_id,
        }))
        setHierarchy(entities)
        setHierarchyLoaded(true)
      }

      // Get currency from result
      if (costsResult.currency) {
        setOrgCurrency(costsResult.currency)
      }

      // Filter to only LLM providers using centralized helper (single filter call)
      let filteredProviders: ProviderBreakdown[] = []
      if (providersResult.success && providersResult.data) {
        filteredProviders = filterGenAIProviders(providersResult.data)
        setProviders(filteredProviders)
        // Use same filtered result for dropdown options (avoids duplicate filter call)
        setAvailableProviders(filteredProviders.map(p => p.provider))
      }

      // When filters are active, compute summary from filtered provider data
      // This ensures MTD, YTD, charts all reflect the filtered selection
      if (hasActiveFilters && filteredProviders.length > 0) {
        const filteredTotalCost = filteredProviders.reduce((sum, p) => sum + p.total_cost, 0)
        const filteredRecordCount = filteredProviders.reduce((sum, p) => sum + p.record_count, 0)

        // Calculate date-based metrics for filtered data
        const today = new Date()
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
        const currentDay = today.getDate()
        const daysRemaining = daysInMonth - currentDay
        const dailyRate = currentDay > 0 ? filteredTotalCost / currentDay : 0
        const forecastMonthly = filteredTotalCost + (dailyRate * daysRemaining)
        const currentMonth = today.getMonth() + 1
        const ytdEstimate = filteredTotalCost // Use MTD as YTD estimate when filtered

        // Create filtered summary
        const filteredSummary: CostSummary = {
          total_daily_cost: dailyRate,
          total_monthly_cost: forecastMonthly,
          total_annual_cost: filteredTotalCost * 12,
          total_billed_cost: filteredTotalCost,
          mtd_cost: filteredTotalCost,
          ytd_cost: ytdEstimate,
          forecast_monthly_cost: forecastMonthly,
          forecast_annual_cost: filteredTotalCost * 12,
          providers: filteredProviders.map(p => p.provider),
          service_categories: ["LLM"],
          record_count: filteredRecordCount,
          date_range: costsResult.summary?.date_range || { start: "", end: "" },
        }
        setSummary(filteredSummary)
      } else if (costsResult.success) {
        // No filters - use backend data
        setSummary(costsResult.summary)
      } else {
        setError(costsResult.error || "Failed to load GenAI costs")
      }
    } catch (err) {
      console.error("GenAI costs error:", err)
      setError(err instanceof Error ? err.message : "Failed to load GenAI cost data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug, dateRange, filters, hierarchyLoaded])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle date range change
  const handleDateRangeChange = useCallback((newRange: DateRange) => {
    setDateRange(newRange)
  }, [])

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: CostFiltersState) => {
    setFilters(newFilters)
  }, [])

  // Handle period change - updates dateRange which triggers data reload
  const handlePeriodChange = useCallback((newPeriod: PeriodType) => {
    setPeriod(newPeriod)
    const { startDate, endDate, label } = getPeriodDates(newPeriod)
    setDateRange({
      preset: "custom",
      start: startDate,
      end: endDate,
      label,
    })
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadData()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Prepare summary data - memoized
  const summaryData: CostSummaryData = useMemo(() => ({
    mtd: summary?.mtd_cost ?? 0,
    dailyRate: summary?.total_daily_cost ?? 0,
    forecast: summary?.forecast_monthly_cost ?? 0,
    ytd: summary?.ytd_cost ?? 0,
    currency: orgCurrency,
  }), [summary, orgCurrency])

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
  const scoreRingSegments: ScoreRingSegment[] = useMemo(() => {
    return providers.slice(0, 4).map((p, index) => ({
      key: p.provider,
      name: GENAI_PROVIDER_CONFIG.names[p.provider.toLowerCase()] || p.provider,
      value: p.total_cost,
      color: ["#10A37F", "#D4A574", "#4285F4", "#7C3AED"][index] || "#94a3b8",
    })).filter(s => s.value > 0)
  }, [providers])

  // Insights data for GenAI costs
  const insightsData = useMemo(() => {
    const mtd = summary?.mtd_cost ?? 0
    const forecast = summary?.forecast_monthly_cost ?? 0
    const daily = summary?.total_daily_cost ?? 0

    return {
      currentSpend: mtd,
      forecast,
      dailyRate: daily,
    }
  }, [summary])

  const isEmpty = !summary && providers.length === 0

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
          <CostPeriodSelector
            value={period}
            onChange={handlePeriodChange}
            size="sm"
          />
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

      {/* Apple Health Style - Score Ring and Insights Row */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Score Ring - LLM Provider Breakdown */}
        {scoreRingSegments.length > 0 && (
          <CostScoreRing
            title="LLM Spend"
            segments={scoreRingSegments}
            currency={orgCurrency}
            insight={`API usage costs across ${scoreRingSegments.length} LLM provider${scoreRingSegments.length > 1 ? "s" : ""}.`}
            compact
            ringSize={88}
            strokeWidth={10}
            titleColor="#10A37F"
          />
        )}

        {/* GenAI Insights Card */}
        <CostInsightsCard
          title="AI Usage Trend"
          currentValue={insightsData.currentSpend}
          currentLabel="MTD Spend"
          averageValue={insightsData.forecast}
          averageLabel="Forecast"
          insight={
            insightsData.forecast > insightsData.currentSpend * 1.2
              ? "LLM API usage is growing. Consider reviewing token efficiency."
              : insightsData.forecast < insightsData.currentSpend * 0.8
                ? "AI costs are well-optimized this period!"
                : "LLM usage is tracking within expected patterns."
          }
          currency={orgCurrency}
          primaryColor="#10A37F"
          compact
        />
      </div>

      {/* Provider Breakdown Chart */}
      {providerBreakdownItems.length > 0 && (
        <CostBreakdownChart
          title="Cost by Provider"
          items={providerBreakdownItems}
          currency={orgCurrency}
          countLabel="records"
          maxItems={5}
        />
      )}

      {/* Provider Details Table */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Cost Details"
          subtitle={`${summary?.record_count || 0} records from ${summary?.date_range?.start || "-"} to ${summary?.date_range?.end || "-"}`}
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
