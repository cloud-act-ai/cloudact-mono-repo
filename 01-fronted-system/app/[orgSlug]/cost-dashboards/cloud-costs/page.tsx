"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { Cloud } from "lucide-react"

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
  type CostSummaryData,
  type DateRange,
  type CostFiltersState,
  type HierarchyEntity,
} from "@/components/costs"
import { getCloudCosts, getCostByProvider, type CostSummary, type ProviderBreakdown, type CostFilterParams } from "@/actions/costs"
import { getHierarchy } from "@/actions/hierarchy"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import {
  getDateInfo,
  filterCloudProviders,
  transformProvidersToBreakdownItems,
  transformProvidersToTableRows,
  CLOUD_PROVIDER_CONFIG,
  type ProviderData,
} from "@/lib/costs"

export default function CloudCostsPage() {
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

      // Convert UI filters to API filter params
      const apiFilters: CostFilterParams = {
        departmentId: filters.department,
        projectId: filters.project,
        teamId: filters.team,
        providers: filters.providers.length > 0 ? filters.providers : undefined,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
      }

      const [costsResult, providersResult] = await Promise.all([
        getCloudCosts(orgSlug, startDate, endDate, apiFilters),
        getCostByProvider(orgSlug, startDate, endDate, apiFilters),
      ])

      if (costsResult.success) {
        setSummary(costsResult.summary)
        if (costsResult.currency) {
          setOrgCurrency(costsResult.currency)
        }
      } else {
        setError(costsResult.error || "Failed to load cloud costs")
      }

      if (providersResult.success && providersResult.data) {
        // Filter to only cloud providers using centralized helper
        const filtered = filterCloudProviders(providersResult.data)
        setProviders(filtered)
        // Set available providers for filter dropdown
        setAvailableProviders(filtered.map(p => p.provider))
      }
    } catch (err) {
      console.error("Cloud costs error:", err)
      setError(err instanceof Error ? err.message : "Failed to load cloud cost data")
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
      CLOUD_PROVIDER_CONFIG
    ),
    [providers]
  )

  // Convert providers to table rows using centralized helper
  const tableRows = useMemo(() => {
    const dateInfo = getDateInfo()
    return transformProvidersToTableRows(
      providers as ProviderData[],
      dateInfo,
      CLOUD_PROVIDER_CONFIG
    )
  }, [providers])

  const isEmpty = !summary && providers.length === 0

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
          typeLabel="Type"
          showCount={false}
          maxRows={10}
        />
      )}
    </CostDashboardShell>
  )
}
