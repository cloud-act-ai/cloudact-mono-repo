"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useParams } from "next/navigation"
import { Cloud } from "lucide-react"
import { getOrgSlug } from "@/lib/utils"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

import {
  DailyTrendChart,
  CostRingChart,
  CostBreakdownChart,
  CostDataTable,
} from "@/components/charts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  CostDashboardShell,
  CostSummaryGrid,
  TimeRangeFilter,
  CostFilters,
  type CostFiltersState,
} from "@/components/costs"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import { useDailyTrendData, useCostSummary, useRollingAvgLabel } from "@/hooks/use-cost-dashboard"
import {
  transformProvidersToBreakdownItems,
  CLOUD_PROVIDER_CONFIG,
  CATEGORY_COLORS,
  type ProviderData,
  // Design tokens
  getMonoShade,
  formatCost,
} from "@/lib/costs"
import { getCostByService, type ServiceBreakdown } from "@/actions/costs"

export default function CloudCostsPage() {
  const params = useParams()
  const orgSlug = getOrgSlug(params as { orgSlug?: string | string[] })

  // Use unified filters from context (all client-side, instant)
  const {
    totalCosts,
    hierarchy: cachedHierarchy,
    currency: cachedCurrency,
    isLoading: isCostLoading,
    error: contextError,
    refresh: refreshCostData,
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

  // Set category filter on mount (cloud page is fixed to cloud category)
  // CTX-002 FIX: Add cleanup to reset categories on unmount
  // SYNC-001 & STATE-001 FIX: Reset local filters and clear context provider filter on mount
  // PAGE-002 FIX: Reset ALL hierarchy fields on mount/unmount
  useEffect(() => {
    // Clear any provider/hierarchy filters from previous page, set category to cloud
    setUnifiedFiltersRef.current({
      categories: ["cloud"],
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

  // Local state - Cloud costs page (category fixed to "cloud")
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
  // Service-level breakdown for table (fetched separately)
  const [serviceData, setServiceData] = useState<ServiceBreakdown[]>([])
  // Loading state for services - TODO: Use for table loading indicator
  const [_isLoadingServices, setIsLoadingServices] = useState(false)

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
  // so getFilteredProviderBreakdown() returns only cloud providers
  const timeFilteredProviders = useMemo(() => {
    return getFilteredProviderBreakdown()
  }, [getFilteredProviderBreakdown])

  // CHART-FIX: Removed redundant page-level category filter.
  // The context-level filter (state.filters.categories = ["cloud"]) already
  // filters granular data by row.category, so timeFilteredProviders only
  // contains cloud providers.
  const cloudProviders = timeFilteredProviders

  // Client-side filtered providers (instant, no backend call)
  const filteredProviders = useMemo(() => {
    if (!hasProviderFilter) return cloudProviders

    // Filter Cloud providers by selected providers (instant client-side)
    const selectedProviders = new Set(filters.providers.map(p => p.toLowerCase()))
    return cloudProviders.filter(p =>
      selectedProviders.has(p.provider.toLowerCase())
    )
  }, [cloudProviders, filters.providers, hasProviderFilter])

  // Use cached or client-side filtered data
  const providers = filteredProviders
  const hierarchy = cachedHierarchy
  const orgCurrency = cachedCurrency || DEFAULT_CURRENCY
  const isLoading = isCostLoading
  const error = contextError

  // Available providers for filter dropdown
  const availableProviders = useMemo(() => {
    return cloudProviders.map(p => p.provider)
  }, [cloudProviders])

  // Fetch service-level breakdown for cloud costs table
  // BUG-003 FIX: Include provider filter in API call
  // BUG-005 FIX: Include hierarchy filter in API call
  useEffect(() => {
    async function fetchServices() {
      if (!orgSlug) return
      setIsLoadingServices(true)
      try {
        // Calculate date range based on time range
        const endDate = new Date()
        let startDate = new Date()
        if (timeRange === "custom" && customRange) {
          startDate = new Date(customRange.startDate)
          endDate.setTime(new Date(customRange.endDate).getTime())
        } else if (typeof timeRange === "number") {
          startDate.setDate(startDate.getDate() - timeRange)
        } else if (timeRange === "mtd") {
          startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        } else if (timeRange === "ytd") {
          startDate = new Date(endDate.getFullYear(), 0, 1)
        } else {
          startDate.setDate(startDate.getDate() - 365)
        }

        // BUG-003 FIX: Pass provider filter to API
        // BUG-005 FIX: Pass hierarchy filter to API
        const result = await getCostByService(
          orgSlug,
          startDate.toISOString().split("T")[0],
          endDate.toISOString().split("T")[0],
          {
            categories: ["cloud"],
            providers: filters.providers.length > 0 ? filters.providers : undefined,
            // Hierarchy filters (using CostFilterParams interface)
            hierarchyEntityId: filters.hierarchyEntityId || undefined,
            hierarchyPath: filters.hierarchyPath || undefined,
          }
        )
        if (result.success && result.data) {
          // Sort by cost descending
          const sorted = [...result.data].sort((a, b) => b.total_cost - a.total_cost)
          setServiceData(sorted)
        }
      } catch (err) {
        console.error("Failed to fetch service breakdown:", err)
      } finally {
        setIsLoadingServices(false)
      }
    }
    fetchServices()
  }, [orgSlug, timeRange, customRange, filters.providers, filters.hierarchyEntityId, filters.hierarchyPath])

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

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshCostData()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Shared hooks — eliminates duplicated trend/summary logic
  const rollingAvgLabel = useRollingAvgLabel(timeRange, customRange)
  const dailyTrendData = useDailyTrendData()
  const summaryData = useCostSummary(dailyTrendData, timeRange)

  // Convert providers to breakdown items using centralized helper
  const providerBreakdownItems = useMemo(() =>
    transformProvidersToBreakdownItems(
      providers as ProviderData[],
      { names: CLOUD_PROVIDER_CONFIG.names, colors: {}, defaultColor: CATEGORY_COLORS.cloud }
    ),
    [providers]
  )

  // Convert services to table rows with FOCUS 1.3 cost breakdown
  // Note: API returns 'service' field (not service_name) for service breakdown
  const tableRows = useMemo(() => {
    if (!serviceData || serviceData.length === 0) return []
    // Handle both API formats: 'service' (actual) or 'service_name' (typed)
    return serviceData.map(s => {
      const serviceName = s.service || s.service_name || s.service_category || "Unknown"
      // Get FOCUS cost fields from API response
      const billedCost = s.billed_cost ?? s.total_cost ?? 0
      const effectiveCost = s.effective_cost ?? 0
      const savings = s.savings ?? (billedCost - effectiveCost)
      return {
        key: serviceName,
        name: serviceName,
        type: "GCP",
        // FOCUS 1.3 cost columns
        billedCost: billedCost,
        effectiveCost: effectiveCost,
        savings: savings,
        // Formatted usage (e.g., "7.3M hrs", "122 MB")
        usage: s.usage || undefined,
      }
    })
  }, [serviceData])

  // Ring chart segments for provider breakdown
  // Filter first to avoid showing empty segments, then slice for top 6
  // Uses centralized design tokens for consistent colors
  const ringSegments = useMemo(() => {
    return providers
      .filter(p => p.total_cost > 0)
      .slice(0, 6)
      .map((p, index) => ({
        key: p.provider,
        name: CLOUD_PROVIDER_CONFIG.names[p.provider.toLowerCase()] || p.provider,
        value: p.total_cost,
        color: getMonoShade(index, "cloud"),
      }))
  }, [providers])

  // Check if data is truly empty (not just loading)
  // BUG-004 FIX: Use filtered data (providers, dailyTrendData) instead of unfiltered totalCosts
  // This ensures empty state shows when filters return no data, not just when all data is empty
  const isEmpty = !isLoading && providers.length === 0 && dailyTrendData.length === 0

  return (
    <CostDashboardShell
      title="Cloud Costs"
      subtitle="Infrastructure spend across providers"
      icon={Cloud}
      loading={isLoading}
      loadingMessage="Loading cloud costs..."
      error={error}
      errorAction={
        error?.includes("API key")
          ? { label: "Go to Settings", href: `/${orgSlug}/settings/organization` }
          : { label: "Try again", onClick: handleRefresh }
      }
      isEmpty={isEmpty}
      emptyState={{
        icon: Cloud,
        title: "No cloud costs yet",
        description: "Connect your cloud providers (GCP, AWS, Azure) and run the cloud cost pipeline to see your infrastructure spend.",
        action: { label: "Connect Providers", href: `/${orgSlug}/integrations/cloud-providers` },
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
          title="Cloud Cost Trend"
          subtitle={`${rollingAvgLabel} overlay on ${timeRange === "365" || timeRange === "ytd" ? "monthly" : timeRange === "90" ? "weekly" : "daily"} spend`}
          data={dailyTrendData.map(d => ({
            date: d.date,
            label: d.label,
            value: d.value,
          }))}
          timeRange={timeRange}
          category="cloud"
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
            title="Cloud Spend"
            segments={ringSegments}
            centerLabel={timeRange === "mtd" ? "MTD" : timeRange === "ytd" ? "YTD" : `${timeRange}d`}
            insight={`Spending across ${ringSegments.length} cloud provider${ringSegments.length > 1 ? "s" : ""}.`}
            size={200}
            thickness={22}
            titleColor="#4285F4"
            className="premium-card"
          />
        )}

        {/* Provider Breakdown */}
        {providerBreakdownItems.length > 0 && (
          <CostBreakdownChart
            title="Cost by Provider"
            items={providerBreakdownItems}
            countLabel="services"
            maxItems={5}
            className="premium-card"
          />
        )}
      </div>

      {/* FOCUS 1.3 Cost Breakdown (FinOps Standard) */}
      {totalCosts?.cloud && (
        <Card className="border-slate-200 animate-fade-up animation-delay-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">
              Cost Breakdown (FOCUS 1.3)
            </CardTitle>
            <CardDescription>
              FinOps FOCUS standard: BilledCost → Savings → EffectiveCost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              {/* BilledCost - Gross cost */}
              <div className="text-center p-3 sm:p-4 rounded-lg bg-slate-50">
                <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  BilledCost
                </p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                  {formatCost(totalCosts.cloud.total_billed_cost ?? totalCosts.cloud.mtd_cost ?? 0, orgCurrency)}
                </p>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Gross (before credits)</p>
              </div>

              {/* Savings - Credits applied */}
              <div className="text-center p-3 sm:p-4 rounded-lg bg-emerald-50">
                <p className="text-[10px] sm:text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">
                  Savings
                </p>
                <p className="text-lg sm:text-xl font-bold text-emerald-600 tabular-nums">
                  {totalCosts.cloud.total_savings && totalCosts.cloud.total_savings > 0
                    ? `-${formatCost(totalCosts.cloud.total_savings, orgCurrency)}`
                    : formatCost(totalCosts.cloud.total_savings ?? 0, orgCurrency)}
                </p>
                <p className="text-[10px] sm:text-xs text-emerald-500 mt-1">Credits applied</p>
              </div>

              {/* EffectiveCost - Net cost */}
              <div className="text-center p-3 sm:p-4 rounded-lg bg-blue-50">
                <p className="text-[10px] sm:text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
                  EffectiveCost
                </p>
                <p className="text-lg sm:text-xl font-bold text-blue-700 tabular-nums">
                  {formatCost(totalCosts.cloud.total_effective_cost ?? totalCosts.cloud.mtd_cost ?? 0, orgCurrency)}
                </p>
                <p className="text-[10px] sm:text-xs text-blue-500 mt-1">Net (after credits)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Cost Details Table - FOCUS 1.3 breakdown */}
      {tableRows.length > 0 && (
        <div className="animate-fade-up animation-delay-400">
          <CostDataTable
            title="Service Cost Details"
            subtitle="FOCUS 1.3 cost breakdown by GCP service"
            rows={tableRows}
            showType
            typeLabel="Provider"
            showFocusCost
            showUsage
            maxRows={10}
          />
        </div>
      )}
    </CostDashboardShell>
  )
}
