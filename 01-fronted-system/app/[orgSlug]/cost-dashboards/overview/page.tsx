"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
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
  CostInsightsCard,
  CostPeriodSelector,
  CostPeriodMetricsGrid,
  getDefaultDateRange,
  getDefaultFilters,
  dateRangeToApiParams,
  getPeriodDates,
  type BreakdownItem,
  type CostSummaryData,
  type DateRange,
  type CostFiltersState,
  type HierarchyEntity,
  type ScoreRingSegment,
  type PeriodType,
  type PeriodCostData,
} from "@/components/costs"
import { getTotalCosts, getCostByProvider, getExtendedPeriodCosts, type TotalCostSummary, type ProviderBreakdown, type PeriodCostsData } from "@/actions/costs"
import { getSaaSSubscriptionCosts, type SaaSCostSummary, type SaaSCostFilterParams } from "@/actions/subscription-providers"
import { getHierarchy } from "@/actions/hierarchy"
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

export default function CostOverviewPage() {
  const params = useParams()
  // Handle case where orgSlug could be string[] from catch-all routes
  const orgSlug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : (params.orgSlug ?? "")

  const [totalSummary, setTotalSummary] = useState<TotalCostSummary | null>(null)
  const [saasSummary, setSaasSummary] = useState<SaaSCostSummary | null>(null)
  const [providers, setProviders] = useState<ProviderBreakdown[]>([])
  const [categories, setCategories] = useState<BreakdownItem[]>([])
  const [periodCosts, setPeriodCosts] = useState<PeriodCostsData | null>(null)
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
      const apiFilters = {
        departmentId: filters.department,
        projectId: filters.project,
        teamId: filters.team,
        providers: filters.providers.length > 0 ? filters.providers : undefined,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
      }

      // SaaS filter params (same structure but different type for now)
      const saasFilters: SaaSCostFilterParams = {
        departmentId: filters.department,
        projectId: filters.project,
        teamId: filters.team,
        providers: filters.providers.length > 0 ? filters.providers : undefined,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
      }

      // Load hierarchy in parallel with cost data (only on first load)
      const hierarchyPromise = hierarchyLoaded
        ? Promise.resolve(null)
        : getHierarchy(orgSlug)

      // Pass filters to backend API - load ALL data in parallel including extended period costs
      const [costsResult, providersResult, saasResult, hierarchyResult, periodCostsResult] = await Promise.all([
        getTotalCosts(orgSlug, startDate, endDate, apiFilters),
        getCostByProvider(orgSlug, startDate, endDate, apiFilters),
        getSaaSSubscriptionCosts(orgSlug, startDate, endDate, saasFilters),
        hierarchyPromise,
        getExtendedPeriodCosts(orgSlug, "total", apiFilters),
      ])

      // Set period costs data
      if (periodCostsResult.success && periodCostsResult.data) {
        setPeriodCosts(periodCostsResult.data)
      }

      // Process hierarchy data if loaded - always mark as loaded to prevent re-fetching
      if (hierarchyResult) {
        if (hierarchyResult.success && hierarchyResult.data?.entities) {
          const entities: HierarchyEntity[] = hierarchyResult.data.entities.map((h) => ({
            entity_id: h.entity_id,
            entity_name: h.entity_name,
            entity_type: h.entity_type as "department" | "project" | "team",
            parent_id: h.parent_id,
          }))
          setHierarchy(entities)
        }
        // Always mark as loaded even on failure to prevent infinite fetch loops
        setHierarchyLoaded(true)
      }

      // Check if filters are active
      const hasActiveFilters = filters.providers.length > 0 ||
        filters.department || filters.project || filters.team ||
        filters.categories.length > 0

      // Store filtered providers for use in summary calculation
      let filteredProviders: ProviderBreakdown[] = []

      if (hasActiveFilters && providersResult.success) {
        // Use filtered provider breakdown when filters are active
        filteredProviders = providersResult.data
          .filter(p => p.provider && p.provider.trim() !== "" && p.provider !== "Unknown" && p.total_cost > 0)
          .slice(0, 10)
        setProviders(filteredProviders)
        // Keep available providers from unfiltered source for filter dropdown
        if (saasResult.success && saasResult.summary?.by_provider && saasResult.summary.by_provider.length > 0) {
          setAvailableProviders(saasResult.summary.by_provider.map(p => p.provider))
        } else {
          setAvailableProviders(filteredProviders.map(p => p.provider))
        }
      } else if (saasResult.success && saasResult.summary?.by_provider && saasResult.summary.by_provider.length > 0) {
        // No filters active - use SaaS summary which includes all provider data
        const validProviders: ProviderBreakdown[] = saasResult.summary.by_provider
          .slice(0, 10)
          .map(p => ({
            provider: p.provider,
            total_cost: p.total_cost,
            record_count: p.record_count ?? 0,
            percentage: p.percentage ?? 0,
          }))

        setProviders(validProviders)
        filteredProviders = validProviders
        // Extract unique provider names for filter
        setAvailableProviders(validProviders.map(p => p.provider))
      } else if (providersResult.success) {
        // Fallback to providersResult
        const validProviders = providersResult.data
          .filter(p => p.provider && p.provider.trim() !== "" && p.provider !== "Unknown" && p.total_cost > 0)
          .slice(0, 10)
        setProviders(validProviders)
        filteredProviders = validProviders
        // Extract unique provider names for filter
        setAvailableProviders(validProviders.map(p => p.provider))
      }

      if (saasResult.success) {
        setSaasSummary(saasResult.summary)
      }

      // When filters are active, compute summary from filtered provider data
      // This ensures MTD, YTD, charts all reflect the filtered selection
      if (hasActiveFilters && filteredProviders.length > 0) {
        // Calculate totals from filtered providers
        const filteredTotalCost = filteredProviders.reduce((sum, p) => sum + p.total_cost, 0)
        const filteredRecordCount = filteredProviders.reduce((sum, p) => sum + p.record_count, 0)

        // Calculate date-based metrics for filtered data
        const today = new Date()
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
        const currentDay = today.getDate()
        const daysRemaining = daysInMonth - currentDay
        const dailyRate = currentDay > 0 ? filteredTotalCost / currentDay : 0
        const forecastMonthly = filteredTotalCost + (dailyRate * daysRemaining)

        // Calculate YTD estimate based on days elapsed in year
        const startOfYearDate = new Date(today.getFullYear(), 0, 1)
        const daysElapsedInYear = Math.ceil((today.getTime() - startOfYearDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        const daysInYear = today.getFullYear() % 4 === 0 ? 366 : 365
        // Extrapolate from current period to full year if we have data
        const dailyRateForYear = daysElapsedInYear > 0 ? filteredTotalCost / currentDay : 0
        const ytdEstimate = dailyRateForYear * daysElapsedInYear

        // Create filtered total summary for use in metrics
        // Include mtd_cost and ytd_cost fields for getSafeValue helper compatibility
        const filteredSummary = {
          saas: {
            total_daily_cost: dailyRate,
            total_monthly_cost: filteredTotalCost,
            total_annual_cost: filteredTotalCost * 12,
            mtd_cost: filteredTotalCost,
            ytd_cost: ytdEstimate,
            record_count: filteredRecordCount,
            providers: filteredProviders.map(p => p.provider),
          },
          cloud: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, mtd_cost: 0, ytd_cost: 0, record_count: 0, providers: [] },
          llm: { total_daily_cost: 0, total_monthly_cost: 0, total_annual_cost: 0, mtd_cost: 0, ytd_cost: 0, record_count: 0, providers: [] },
          total: { total_daily_cost: dailyRate, total_monthly_cost: forecastMonthly, total_annual_cost: filteredTotalCost * 12 },
          date_range: costsResult.data?.date_range || { start: "", end: "" },
          currency: costsResult.data?.currency || "USD",
          query_time_ms: 0,
        } as TotalCostSummary
        setTotalSummary(filteredSummary)
        if (filteredSummary.currency) {
          setOrgCurrency(filteredSummary.currency)
        }

        // Build category breakdown from filtered providers
        // Since we're filtering by specific providers, show them as a single category
        const categoryList: BreakdownItem[] = [{
          key: "filtered",
          name: filters.providers.length === 1 ? filters.providers[0] : "Selected Providers",
          value: filteredTotalCost,
          percentage: 100,
          count: filteredRecordCount,
          color: OVERVIEW_CATEGORY_CONFIG.colors.saas,
        }]
        setCategories(categoryList)
      } else {
        // No filters - use backend data as before
        if (costsResult.success && costsResult.data) {
          setTotalSummary(costsResult.data)
          if (costsResult.data.currency) {
            setOrgCurrency(costsResult.data.currency)
          }
        }

        // Build category breakdown from total costs data using centralized helpers
        const genaiCost = costsResult.data?.llm?.total_monthly_cost ?? 0
        const cloudCost = costsResult.data?.cloud?.total_monthly_cost ?? 0
        const saasCost = costsResult.data?.saas?.total_monthly_cost ?? 0
        const totalCost = genaiCost + cloudCost + saasCost

        // Calculate unique subscription count from SaaS data
        let saasSubscriptionCount = 0
        if (saasResult.success && saasResult.data && saasResult.data.length > 0) {
          const uniqueResourceIds = new Set(
            saasResult.data.map(r => r.ResourceId || r.ServiceName || 'unknown')
          )
          saasSubscriptionCount = uniqueResourceIds.size
        }

        if (totalCost > 0) {
          const categoryList: BreakdownItem[] = [
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
              count: saasSubscriptionCount,
              color: OVERVIEW_CATEGORY_CONFIG.colors.saas,
            },
          ].filter(c => c.value > 0).sort((a, b) => b.value - a.value)
          setCategories(categoryList)
        } else {
          setCategories([])
        }
      }
    } catch (err) {
      console.error("Cost overview error:", err)
      setError(err instanceof Error ? err.message : "Failed to load cost data")
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

  // Handle filter changes - triggers data reload via loadData dependency
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

  // Calculate summary data from TotalCostSummary using centralized helper
  const summaryData: CostSummaryData = useMemo(() => {
    const saasMtd = getSafeValue(totalSummary?.saas, "mtd_cost")
    const cloudMtd = getSafeValue(totalSummary?.cloud, "mtd_cost")
    const llmMtd = getSafeValue(totalSummary?.llm, "mtd_cost")
    const combinedMTD = saasMtd + cloudMtd + llmMtd || (totalSummary?.total?.total_monthly_cost ?? 0)

    const saasYtd = getSafeValue(totalSummary?.saas, "ytd_cost")
    const cloudYtd = getSafeValue(totalSummary?.cloud, "ytd_cost")
    const llmYtd = getSafeValue(totalSummary?.llm, "ytd_cost")
    const combinedYTD = saasYtd + cloudYtd + llmYtd || (totalSummary?.total?.total_annual_cost ?? 0)

    return {
      mtd: combinedMTD,
      dailyRate: totalSummary?.total?.total_daily_cost ?? 0,
      forecast: totalSummary?.total?.total_monthly_cost ?? 0,
      ytd: combinedYTD,
      currency: orgCurrency,
    }
  }, [totalSummary, orgCurrency])

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

  // Insights data - MTD vs previous month
  const insightsData = useMemo(() => {
    const mtd = summaryData.mtd
    const forecast = summaryData.forecast
    const ytd = summaryData.ytd

    // Calculate average daily spend
    const today = new Date()
    const daysElapsed = today.getDate()
    const avgDaily = daysElapsed > 0 ? mtd / daysElapsed : 0

    return {
      currentSpend: mtd,
      averageDaily: avgDaily,
      forecast,
      ytd,
    }
  }, [summaryData])

  const isEmpty = !totalSummary && !saasSummary && providers.length === 0

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

      {/* Extended Period Metrics */}
      {periodCosts && (
        <CostPeriodMetricsGrid
          data={{
            yesterday: periodCosts.yesterday,
            wtd: periodCosts.wtd,
            lastWeek: periodCosts.lastWeek,
            mtd: periodCosts.mtd,
            previousMonth: periodCosts.previousMonth,
            last2Months: periodCosts.last2Months,
            ytd: periodCosts.ytd,
            fytd: periodCosts.fytd,
            fyForecast: periodCosts.fyForecast,
            // 30-day period data
            last30Days: periodCosts.last30Days,
            previous30Days: periodCosts.previous30Days,
            november: periodCosts.november,
            december: periodCosts.december,
          }}
          currency={orgCurrency}
          loading={isLoading}
          variant="full"
          compact
        />
      )}

      {/* Apple Health Style - Score Ring and Insights Row */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Score Ring - Total Spend Breakdown */}
        {scoreRingSegments.length > 0 && (
          <CostScoreRing
            title="Total Spend"
            segments={scoreRingSegments}
            currency={orgCurrency}
            insight={`Your spending is distributed across ${scoreRingSegments.length} categories this period.`}
            compact
            ringSize={88}
            strokeWidth={10}
            titleColor="#1a7a3a"
          />
        )}

        {/* Spend Insights Card */}
        <CostInsightsCard
          title="Spending Trend"
          currentValue={insightsData.currentSpend}
          currentLabel="MTD Spend"
          averageValue={insightsData.averageDaily * 30}
          averageLabel="Projected"
          insight={
            insightsData.forecast > insightsData.currentSpend * 1.1
              ? "Your spending is on track to exceed projections this month."
              : insightsData.forecast < insightsData.currentSpend * 0.9
                ? "Great job! You're spending less than projected."
                : "Your spending is in line with projections."
          }
          currency={orgCurrency}
          primaryColor="#10A37F"
          compact
        />
      </div>

      {/* Category Breakdown */}
      {categories.length > 0 && (
        <CostBreakdownChart
          title="Cost by Category"
          items={categories}
          currency={orgCurrency}
          countLabel="subscriptions"
          maxItems={5}
        />
      )}

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
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#10A37F]/10">
                <Brain className="h-5 w-5 text-[#10A37F]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">GenAI Costs</h3>
                <p className="text-xs text-slate-500">LLM API usage</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/cloud-costs`}
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#4285F4]/10">
                <Cloud className="h-5 w-5 text-[#4285F4]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Cloud Costs</h3>
                <p className="text-xs text-slate-500">GCP, AWS, Azure</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
          </div>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/subscription-costs`}
          className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#FF6C5E]/10">
                <Wallet className="h-5 w-5 text-[#FF6C5E]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Subscription Costs</h3>
                <p className="text-xs text-slate-500">SaaS & software</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
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
