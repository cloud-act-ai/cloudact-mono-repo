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
  getDefaultDateRange,
  getDefaultFilters,
  dateRangeToApiParams,
  type BreakdownItem,
  type CostSummaryData,
  type DateRange,
  type CostFiltersState,
  type HierarchyEntity,
} from "@/components/costs"
import { getTotalCosts, getCostByProvider, type TotalCostSummary, type ProviderBreakdown } from "@/actions/costs"
import { getSaaSSubscriptionCosts, type SaaSCostSummary } from "@/actions/subscription-providers"
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
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)
  const [filters, setFilters] = useState<CostFiltersState>(getDefaultFilters)
  const [hierarchy, setHierarchy] = useState<HierarchyEntity[]>([])
  const [availableProviders, setAvailableProviders] = useState<string[]>([])

  // Load hierarchy data once on mount
  useEffect(() => {
    async function loadHierarchy() {
      try {
        const result = await getHierarchy(orgSlug)
        if (result.success && result.data) {
          const entities: HierarchyEntity[] = result.data.map((h: { entity_id: string; entity_name: string; entity_type: string; parent_id?: string }) => ({
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

      // TODO: Pass filters to API when backend supports filtering
      // For now, filters are applied client-side
      const [costsResult, providersResult, saasResult] = await Promise.all([
        getTotalCosts(orgSlug),
        getCostByProvider(orgSlug, startDate, endDate),
        getSaaSSubscriptionCosts(orgSlug, startDate, endDate),
      ])

      if (costsResult.success && costsResult.data) {
        setTotalSummary(costsResult.data)
        if (costsResult.data.currency) {
          setOrgCurrency(costsResult.data.currency)
        }
      }

      // Use backend-calculated provider breakdown (no client-side aggregation)
      if (saasResult.success && saasResult.summary?.by_provider && saasResult.summary.by_provider.length > 0) {
        const validProviders: ProviderBreakdown[] = saasResult.summary.by_provider
          .slice(0, 10)
          .map(p => ({
            provider: p.provider,
            total_cost: p.total_cost,
            record_count: p.record_count ?? 0,
            percentage: p.percentage ?? 0,
          }))

        setProviders(validProviders)
        // Extract unique provider names for filter
        setAvailableProviders(validProviders.map(p => p.provider))
      } else if (providersResult.success) {
        const validProviders = providersResult.data
          .filter(p => p.provider && p.provider.trim() !== "" && p.provider !== "Unknown" && p.total_cost > 0)
          .slice(0, 10)
        setProviders(validProviders)
        // Extract unique provider names for filter
        setAvailableProviders(validProviders.map(p => p.provider))
      }

      if (saasResult.success) {
        setSaasSummary(saasResult.summary)
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
      }
    } catch (err) {
      console.error("Cost overview error:", err)
      setError(err instanceof Error ? err.message : "Failed to load cost data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug, dateRange])

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
    // TODO: Reload data with filters when backend supports it
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
