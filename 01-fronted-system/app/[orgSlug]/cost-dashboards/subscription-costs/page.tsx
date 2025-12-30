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
  getDefaultDateRange,
  dateRangeToApiParams,
  type CostSummaryData,
  type DateRange,
} from "@/components/costs"
import {
  getSaaSSubscriptionCosts,
  type SaaSCostSummary,
} from "@/actions/subscription-providers"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"
import {
  getDateInfo,
  aggregateByCategory,
  transformCategoriesToBreakdownItems,
  transformCategoriesToTableRows,
  CATEGORY_CONFIG,
  type CategoryData,
  type RawSubscriptionRecord,
} from "@/lib/costs"

export default function SubscriptionCostsPage() {
  const params = useParams()
  // Handle case where orgSlug could be string[] from catch-all routes
  const orgSlug = Array.isArray(params.orgSlug) ? params.orgSlug[0] : (params.orgSlug ?? "")

  const [summary, setSummary] = useState<SaaSCostSummary | null>(null)
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Convert date range to API parameters
      const { startDate, endDate } = dateRangeToApiParams(dateRange)

      const costsResult = await getSaaSSubscriptionCosts(orgSlug, startDate, endDate)

      if (costsResult.success && costsResult.summary) {
        setSummary(costsResult.summary)
        if (costsResult.currency) {
          setOrgCurrency(costsResult.currency)
        }

        // Build category breakdown using centralized helper
        // Filters to current month and counts unique subscriptions per category
        if (costsResult.data && costsResult.data.length > 0) {
          const dateInfo = getDateInfo()
          const breakdown = aggregateByCategory(
            costsResult.data as RawSubscriptionRecord[],
            dateInfo
          )
          setCategories(breakdown)
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
  }, [orgSlug, dateRange])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle date range change
  const handleDateRangeChange = useCallback((newRange: DateRange) => {
    setDateRange(newRange)
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
        <DateRangeFilter
          value={dateRange}
          onChange={handleDateRangeChange}
          disabled={isLoading || isRefreshing}
        />
      }
    >
      {/* Summary Metrics */}
      <CostSummaryGrid data={summaryData} />

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
