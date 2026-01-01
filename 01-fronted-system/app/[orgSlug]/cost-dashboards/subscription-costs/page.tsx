"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { Wallet } from "lucide-react"

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
  type CostSummaryData,
  type DateRange,
  type CostFiltersState,
  type HierarchyEntity,
  type ScoreRingSegment,
  type PeriodType,
  type PeriodCostData,
} from "@/components/costs"
import {
  getSaaSSubscriptionCosts,
  type SaaSCostSummary,
  type SaaSCostFilterParams,
} from "@/actions/subscription-providers"
import { getExtendedPeriodCosts, type PeriodCostsData, type CostFilterParams } from "@/actions/costs"
import { getHierarchy } from "@/actions/hierarchy"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import {
  getDateInfo,
  transformCategoriesToBreakdownItems,
  transformCategoriesToTableRows,
  CATEGORY_CONFIG,
  type CategoryData,
} from "@/lib/costs"

export default function SubscriptionCostsPage() {
  const params = useParams()
  // Handle case where orgSlug could be string[] from catch-all routes
  const orgSlug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : (params.orgSlug ?? "")

  const [summary, setSummary] = useState<SaaSCostSummary | null>(null)
  const [categories, setCategories] = useState<CategoryData[]>([])
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

  // Load hierarchy data once on mount
  useEffect(() => {
    async function loadHierarchy() {
      try {
        const result = await getHierarchy(orgSlug)
        if (result.success && result.data?.entities) {
          const entities: HierarchyEntity[] = result.data.entities.map((h) => ({
            entity_id: h.entity_id,
            entity_name: h.entity_name,
            entity_type: h.entity_type as "department" | "project" | "team",
            parent_id: h.parent_id,
          }))
          setHierarchy(entities)
        }
      } catch (err) {
        console.error("Failed to load hierarchy:", err)
      }
    }
    if (orgSlug) {
      loadHierarchy()
    }
  }, [orgSlug])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Convert date range to API parameters
      const { startDate, endDate } = dateRangeToApiParams(dateRange)

      // Convert UI filters to API filter params (client-side filtering for SaaS costs)
      const apiFilters: SaaSCostFilterParams = {
        departmentId: filters.department,
        projectId: filters.project,
        teamId: filters.team,
        providers: filters.providers.length > 0 ? filters.providers : undefined,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
      }

      // Convert to CostFilterParams for extended period costs
      const costApiFilters: CostFilterParams = {
        departmentId: filters.department,
        projectId: filters.project,
        teamId: filters.team,
        providers: filters.providers.length > 0 ? filters.providers : undefined,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
      }

      // Fetch costs and period costs in parallel
      const [costsResult, periodCostsResult] = await Promise.all([
        getSaaSSubscriptionCosts(orgSlug, startDate, endDate, apiFilters),
        getExtendedPeriodCosts(orgSlug, "total", costApiFilters), // Use total to get SaaS costs
      ])

      // Set period costs data
      if (periodCostsResult.success && periodCostsResult.data) {
        setPeriodCosts(periodCostsResult.data)
      }

      if (costsResult.success && costsResult.summary) {
        setSummary(costsResult.summary)
        if (costsResult.currency) {
          setOrgCurrency(costsResult.currency)
        }

        // Use backend-calculated category breakdown (no client-side aggregation)
        if (costsResult.summary.by_category && costsResult.summary.by_category.length > 0) {
          const breakdown: CategoryData[] = costsResult.summary.by_category.map(c => ({
            category: c.category,
            total_cost: c.total_cost,
            count: c.record_count,
            percentage: c.percentage,
          }))
          setCategories(breakdown)
        }

        // Set available providers from SaaS data
        if (costsResult.summary.by_provider && costsResult.summary.by_provider.length > 0) {
          setAvailableProviders(costsResult.summary.by_provider.map(p => p.provider))
        }
      } else {
        setError(costsResult.error || "Failed to load subscription costs")
      }
    } catch (err) {
      console.error("Subscription costs error:", err)
      setError(err instanceof Error ? err.message : "Failed to load subscription cost data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug, dateRange, filters])

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

  // Convert categories to breakdown items using centralized helper
  const categoryBreakdownItems = useMemo(() =>
    transformCategoriesToBreakdownItems(categories, CATEGORY_CONFIG),
    [categories]
  )

  // Convert categories to table rows using centralized helper
  const tableRows = useMemo(() => {
    const dateInfo = getDateInfo()
    return transformCategoriesToTableRows(categories, dateInfo, CATEGORY_CONFIG)
  }, [categories])

  // Score ring segments for category breakdown
  const scoreRingSegments: ScoreRingSegment[] = useMemo(() => {
    const categoryColors: Record<string, string> = {
      "productivity": "#FF6C5E",
      "development": "#10A37F",
      "communication": "#4285F4",
      "design": "#F24E1E",
      "marketing": "#7C3AED",
      "analytics": "#FBBC04",
    }

    return categories.slice(0, 4).map((c, index) => ({
      key: c.category,
      name: c.category,
      value: c.total_cost,
      color: categoryColors[c.category.toLowerCase()] || ["#FF6C5E", "#10A37F", "#4285F4", "#7C3AED"][index] || "#94a3b8",
    })).filter(s => s.value > 0)
  }, [categories])

  // Insights data for subscription costs
  const insightsData = useMemo(() => {
    const mtd = summary?.mtd_cost ?? 0
    const forecast = summary?.forecast_monthly_cost ?? 0
    const subscriptionCount = summary?.record_count ?? categories.reduce((acc, c) => acc + (c.count ?? 0), 0)

    return {
      currentSpend: mtd,
      forecast,
      subscriptionCount,
    }
  }, [summary, categories])

  const isEmpty = !summary && categories.length === 0

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
          }}
          currency={orgCurrency}
          loading={isLoading}
          variant="full"
          compact
        />
      )}

      {/* Apple Health Style - Score Ring and Insights Row */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Score Ring - Category Breakdown */}
        {scoreRingSegments.length > 0 && (
          <CostScoreRing
            title="SaaS Spend"
            segments={scoreRingSegments}
            currency={orgCurrency}
            insight={`${insightsData.subscriptionCount} active subscription${insightsData.subscriptionCount !== 1 ? "s" : ""} across ${scoreRingSegments.length} categories.`}
            compact
            ringSize={88}
            strokeWidth={10}
            titleColor="#FF6C5E"
          />
        )}

        {/* Subscription Insights Card */}
        <CostInsightsCard
          title="Subscription Trend"
          currentValue={insightsData.currentSpend}
          currentLabel="MTD Spend"
          averageValue={insightsData.forecast}
          averageLabel="Forecast"
          insight={
            insightsData.forecast > insightsData.currentSpend * 1.1
              ? "Subscription costs are projected to increase. Review for unused licenses."
              : insightsData.forecast < insightsData.currentSpend * 0.9
                ? "SaaS spending is well-managed this period!"
                : "Subscription costs are stable and predictable."
          }
          currency={orgCurrency}
          primaryColor="#FF6C5E"
          compact
        />
      </div>

      {/* Category Breakdown Chart */}
      {categoryBreakdownItems.length > 0 && (
        <CostBreakdownChart
          title="Cost by Category"
          items={categoryBreakdownItems}
          currency={orgCurrency}
          countLabel="subscriptions"
          maxItems={7}
        />
      )}

      {/* Category Details Table */}
      {tableRows.length > 0 && (
        <CostDataTable
          title="Cost Details"
          subtitle={`${summary?.record_count || categories.reduce((acc, c) => acc + (c.count ?? 0), 0)} subscriptions tracked`}
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
