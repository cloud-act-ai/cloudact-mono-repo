"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Cloud,
  Play,
  Settings,
  BarChart3,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Zap,
  Users,
  Database,
  Loader2,
  RefreshCw,
  Brain,
  Wallet,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getPipelineRuns } from "@/actions/pipelines"
import { getIntegrations } from "@/actions/integrations"
import type { PipelineRunSummary } from "@/lib/api/backend"

// New unified chart library
import {
  CostTrendChart,
  CostRingChart,
  CostBreakdownChart,
  useChartConfig,
} from "@/components/charts"

// Non-chart components from costs
import {
  CostSummaryGrid,
  TimeRangeFilter,
  type CostSummaryData,
} from "@/components/costs"

import { getDateInfo, OVERVIEW_CATEGORY_CONFIG, transformProvidersToBreakdownItems } from "@/lib/costs"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"

interface QuickAction {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  color: "teal" | "coral" | "purple"
}

interface IntegrationItem {
  name: string
  provider: string
  status: "connected" | "pending" | "not_connected"
}

// Move color classes outside component to prevent recreation on every render
const QUICK_ACTION_COLOR_CLASSES = {
  teal: "from-[#90FCA6]/10 to-[#90FCA6]/5 border-[#90FCA6]/20 hover:shadow-[0_8px_24px_rgba(144,252,166,0.15)]",
  coral: "from-[#FF6C5E]/10 to-[#FF6C5E]/5 border-[#FF6C5E]/20 hover:shadow-[0_8px_24px_rgba(255,108,94,0.15)]",
  purple: "from-purple-500/10 to-purple-500/5 border-purple-500/20 hover:shadow-[0_8px_24px_rgba(168,85,247,0.15)]",
} as const

const QUICK_ACTION_ICON_CLASSES = {
  teal: "bg-[#90FCA6] text-[#1a7a3a]",
  coral: "bg-[#FF6C5E] text-white",
  purple: "bg-purple-500 text-white",
} as const

export default function DashboardPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  // Use unified filters from context (all client-side, instant)
  const {
    totalCosts: costSummary,
    periodCosts,
    currency: contextCurrency,
    isLoading: isCostLoading,
    refresh: refreshCostData,
    availableFilters,
    filters: contextFilters,
    setUnifiedFilters,
    getFilteredTimeSeries,
    getFilteredCategoryBreakdown,
    getFilteredProviderBreakdown,
  } = useCostData()

  // Use chart config - ensure context is active
  useChartConfig()

  const [greeting, setGreeting] = useState("")
  const [isLocalLoading, setIsLocalLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [recentPipelines, setRecentPipelines] = useState<PipelineRunSummary[]>([])
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([])

  // Extract time range from unified filters
  const timeRange = contextFilters.timeRange
  const customRange = contextFilters.customRange

  // Time range handlers using unified filters (instant, no API call)
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setUnifiedFilters({ timeRange: range, customRange: range === "custom" ? customRange : undefined })
  }, [setUnifiedFilters, customRange])

  const handleCustomRangeChange = useCallback((range: CustomDateRange | undefined) => {
    setUnifiedFilters({ customRange: range })
  }, [setUnifiedFilters])

  // Load non-cost data (pipelines, integrations)
  const loadNonCostData = useCallback(async () => {
    try {
      const [pipelinesResult, integrationsResult] = await Promise.all([
        getPipelineRuns(orgSlug, { limit: 5 }),
        getIntegrations(orgSlug),
      ])

      if (pipelinesResult.success && pipelinesResult.data?.runs) {
        setRecentPipelines(pipelinesResult.data.runs.slice(0, 5))
      }

      if (integrationsResult.success && integrationsResult.integrations) {
        const integrationList: IntegrationItem[] = []
        const intData = integrationsResult.integrations.integrations

        // Map provider names to display names
        const providerNames: Record<string, string> = {
          OPENAI: "OpenAI",
          ANTHROPIC: "Anthropic",
          GEMINI: "Google Gemini",
          DEEPSEEK: "DeepSeek",
          GCP_SA: "Google Cloud",
          AWS_IAM: "AWS",
          AZURE: "Azure",
          OCI: "Oracle Cloud",
        }

        for (const [key, value] of Object.entries(intData)) {
          if (value.status === "NOT_CONFIGURED") {
            continue
          }

          const status = value.status === "VALID"
            ? "connected"
            : value.status === "PENDING"
            ? "pending"
            : "not_connected"

          integrationList.push({
            name: providerNames[key] || key,
            provider: key,
            status,
          })
        }

        integrationList.sort((a, b) => {
          const order = { connected: 0, pending: 1, not_connected: 2 }
          return order[a.status] - order[b.status]
        })

        setIntegrations(integrationList.slice(0, 4))
      }
    } catch (err) {
      console.error("[Dashboard] Failed to load data:", err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLocalLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting("Good morning")
    else if (hour < 18) setGreeting("Good afternoon")
    else setGreeting("Good evening")

    loadNonCostData()
  }, [loadNonCostData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([refreshCostData(), loadNonCostData()])
    setIsRefreshing(false)
  }

  const isLoading = isCostLoading || isLocalLoading

  // Check if we have any cost data
  const hasData = costSummary && (
    (costSummary.genai?.total_monthly_cost ?? 0) > 0 ||
    (costSummary.cloud?.total_monthly_cost ?? 0) > 0 ||
    (costSummary.subscription?.total_monthly_cost ?? 0) > 0
  )

  // Helper to filter providers by category using TIME-FILTERED data from context
  // FILTER-008 FIX: Use getFilteredProviderBreakdown for time-filtered provider data
  const getProvidersByCategory = useCallback((category: "genai" | "cloud" | "subscription") => {
    const categoryProviderIds = new Set(
      availableFilters.providers
        .filter(p => p.category === category)
        .map(p => p.id.toLowerCase())
    )
    // Use time-filtered providers instead of 365-day cached data
    const filteredProviders = getFilteredProviderBreakdown()
    return filteredProviders.filter(p =>
      categoryProviderIds.has(p.provider.toLowerCase())
    )
  }, [availableFilters.providers, getFilteredProviderBreakdown])

  // Get filtered time series data (all categories)
  const filteredDailyData = useMemo(() => {
    const timeSeries = getFilteredTimeSeries()
    if (!timeSeries || timeSeries.length === 0) return []

    // Calculate overall average
    const totalCost = timeSeries.reduce((sum, d) => sum + (Number.isFinite(d.total) ? d.total : 0), 0)
    const avgDaily = timeSeries.length > 0 ? totalCost / timeSeries.length : 0
    const rollingAvg = Number.isFinite(avgDaily) ? avgDaily : 0

    return timeSeries.map((point) => ({
      date: point.date,
      // FORMAT-001 FIX: Use undefined to respect user's browser locale
      label: new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: point.total,
      rollingAvg: Math.round(rollingAvg * 100) / 100,
    }))
  }, [getFilteredTimeSeries])

  // BUG-002 FIX: Get category-specific totals from TIME-FILTERED granular data
  // Use context's getFilteredCategoryBreakdown() for actual time-filtered values
  const categoryTotals = useMemo(() => {
    const totals = { genai: 0, cloud: 0, subscription: 0 }

    // Get time-filtered category breakdown from context
    const categoryBreakdown = getFilteredCategoryBreakdown()

    if (categoryBreakdown && categoryBreakdown.length > 0) {
      for (const cat of categoryBreakdown) {
        const key = cat.category.toLowerCase() as keyof typeof totals
        if (key in totals) {
          totals[key] = cat.total_cost
        }
      }
    }

    return totals
  // PERF-003 FIX: Removed redundant timeRange dep - getFilteredCategoryBreakdown already handles it
  }, [getFilteredCategoryBreakdown])

  // Legacy compatibility values (used by ringSegments and categoryBreakdown)
  const genaiCost = categoryTotals.genai
  const cloudCost = categoryTotals.cloud
  const subscriptionCost = categoryTotals.subscription

  // Prepare summary data from FILTERED daily trend data
  const summaryData: CostSummaryData = useMemo(() => {
    const dateInfo = getDateInfo()

    // Calculate totals from filtered daily data
    const filteredTotal = filteredDailyData.reduce((sum, d) => sum + d.value, 0)
    const filteredDailyAvg = filteredDailyData.length > 0 ? filteredTotal / filteredDailyData.length : 0

    // For MTD: use filtered total if time range is mtd, otherwise show filtered period total
    const totalMtd = timeRange === "mtd"
      ? filteredTotal
      : (periodCosts?.mtd ?? filteredTotal)

    // Daily rate from filtered data
    const dailyRate = filteredDailyAvg

    // Forecast: current spend + (daily rate * remaining days)
    const daysRemaining = dateInfo.daysInMonth - dateInfo.daysElapsed
    const forecast = (periodCosts?.mtd ?? filteredTotal) + (dailyRate * daysRemaining)

    // YTD: use filtered total for ytd range, otherwise show period ytd
    const ytd = timeRange === "ytd"
      ? filteredTotal
      : (periodCosts?.ytd ?? costSummary?.total?.total_annual_cost ?? filteredTotal)

    return {
      mtd: filteredTotal, // Show filtered period total as "Period Spend"
      dailyRate: dailyRate,
      forecast: forecast,
      ytd: ytd,
      currency: contextCurrency,
    }
  }, [filteredDailyData, timeRange, costSummary, periodCosts, contextCurrency])

  // Prepare ring chart segments from FILTERED category data
  const ringSegments = useMemo(() => {
    return [
      { key: "genai", name: OVERVIEW_CATEGORY_CONFIG.names.genai, value: genaiCost, color: OVERVIEW_CATEGORY_CONFIG.colors.genai },
      { key: "cloud", name: OVERVIEW_CATEGORY_CONFIG.names.cloud, value: cloudCost, color: OVERVIEW_CATEGORY_CONFIG.colors.cloud },
      { key: "subscription", name: OVERVIEW_CATEGORY_CONFIG.names.subscription, value: subscriptionCost, color: OVERVIEW_CATEGORY_CONFIG.colors.subscription },
    ]
  }, [genaiCost, cloudCost, subscriptionCost])

  // Prepare breakdown items for category chart from FILTERED data
  const categoryBreakdown = useMemo(() => {
    return [
      {
        key: "genai",
        name: OVERVIEW_CATEGORY_CONFIG.names.genai,
        value: genaiCost,
        count: costSummary?.genai?.providers?.length ?? 0,
        color: OVERVIEW_CATEGORY_CONFIG.colors.genai,
      },
      {
        key: "cloud",
        name: OVERVIEW_CATEGORY_CONFIG.names.cloud,
        value: cloudCost,
        count: costSummary?.cloud?.providers?.length ?? 0,
        color: OVERVIEW_CATEGORY_CONFIG.colors.cloud,
      },
      {
        key: "subscription",
        name: OVERVIEW_CATEGORY_CONFIG.names.subscription,
        value: subscriptionCost,
        count: costSummary?.subscription?.providers?.length ?? 0,
        color: OVERVIEW_CATEGORY_CONFIG.colors.subscription,
      },
    ].sort((a, b) => b.value - a.value)
  }, [genaiCost, cloudCost, subscriptionCost, costSummary])

  // BUG-003/004/005 FIX: Top 5 Cost Drivers - use time-filtered data
  // Uses getFilteredProviderBreakdown() from context for actual time-filtered provider costs

  const top5GenAI = useMemo(() => {
    const genaiProviders = getProvidersByCategory("genai")
    return transformProvidersToBreakdownItems(
      genaiProviders.sort((a, b) => b.total_cost - a.total_cost).slice(0, 5),
      { names: {}, colors: {}, defaultColor: "#10A37F" }
    )
  }, [getProvidersByCategory])

  const top5Cloud = useMemo(() => {
    const cloudProviders = getProvidersByCategory("cloud")
    return transformProvidersToBreakdownItems(
      cloudProviders.sort((a, b) => b.total_cost - a.total_cost).slice(0, 5),
      { names: {}, colors: {}, defaultColor: "#4285F4" }
    )
  }, [getProvidersByCategory])

  const top5Subscription = useMemo(() => {
    const subProviders = getProvidersByCategory("subscription")
    return transformProvidersToBreakdownItems(
      subProviders.sort((a, b) => b.total_cost - a.total_cost).slice(0, 5),
      { names: {}, colors: {}, defaultColor: "#FF6C5E" }
    )
  }, [getProvidersByCategory])

  // Memoize quickActions
  const quickActions: QuickAction[] = useMemo(() => [
    {
      title: "Run Pipeline",
      description: "Execute data pipelines to sync costs",
      href: `/${orgSlug}/pipelines`,
      icon: <Play className="h-5 w-5" />,
      color: "teal",
    },
    {
      title: "View Analytics",
      description: "Deep dive into cost trends",
      href: `/${orgSlug}/cost-dashboards/overview`,
      icon: <BarChart3 className="h-5 w-5" />,
      color: "purple",
    },
    {
      title: "Manage Settings",
      description: "Configure integrations and team",
      href: `/${orgSlug}/settings/organization`,
      icon: <Settings className="h-5 w-5" />,
      color: "coral",
    },
  ], [orgSlug])

  const getPipelineIcon = (pipelineId: string) => {
    if (pipelineId.includes("openai") || pipelineId.includes("anthropic") || pipelineId.includes("gemini")) {
      return <Brain className="h-4 w-4" />
    }
    if (pipelineId.includes("gcp") || pipelineId.includes("aws") || pipelineId.includes("azure")) {
      return <Cloud className="h-4 w-4" />
    }
    if (pipelineId.includes("saas") || pipelineId.includes("subscription")) {
      return <Wallet className="h-4 w-4" />
    }
    return <Database className="h-4 w-4" />
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
      case "success":
        return "bg-[#90FCA6]/10 text-[#1a7a3a] border-[#90FCA6]/20"
      case "running":
      case "in_progress":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20"
      case "failed":
      case "error":
        return "bg-red-500/10 text-red-600 border-red-500/20"
      default:
        return "bg-slate-100 text-slate-600 border-slate-200"
    }
  }

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return "Unknown"
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return "Invalid date"

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()

    if (diffMs < 0) return "Just now"

    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--cloudact-mint-text)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 lg:space-y-10">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-[22px] sm:text-[28px] lg:text-[32px] font-bold text-slate-900 tracking-tight leading-tight">
            {greeting}
          </h1>
          <p className="text-[13px] sm:text-[14px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
            Here&#39;s what&#39;s happening with your cloud costs today.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <TimeRangeFilter
            value={timeRange}
            onChange={handleTimeRangeChange}
            customRange={customRange}
            onCustomRangeChange={handleCustomRangeChange}
            size="sm"
          />
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="h-8 sm:h-9 px-3 flex-shrink-0"
            aria-label={isRefreshing ? "Clearing cache..." : "Clear cache and reload data"}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Clearing..." : "Clear Cache"}
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="animate-fade-up">
        <CostSummaryGrid data={summaryData} />
      </div>

      {/* Daily Cost Trend Chart */}
      {filteredDailyData.length > 0 && (
        <div className="animate-fade-up animation-delay-100">
          <CostTrendChart
            title="Daily Cost Trend"
            subtitle="Daily spend with period average"
            data={filteredDailyData.map(d => ({
              date: d.date,
              label: d.label,
              value: d.value,
              rollingAvg: d.rollingAvg,
            }))}
            showBars={true}
            showLine={true}
            barColor="#90FCA6"
            lineColor="#FF6C5E"
            lineLabel={`${filteredDailyData.length}-day Avg`}
            enableZoom={true}
            height={320}
            loading={isLoading}
          />
        </div>
      )}

      {/* Row 1: Total Spend (Pie) + Top 5 GenAI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-200">
        {/* Total Spend Ring Chart */}
        <CostRingChart
          title="Total Spend"
          segments={ringSegments}
          centerLabel="MTD"
          insight={!hasData
            ? "No cost data yet. Connect providers and run pipelines."
            : `Spending across ${ringSegments.filter(s => s.value > 0).length} cost categories.`
          }
          showChevron
          onClick={() => window.location.href = `/${orgSlug}/cost-dashboards/overview`}
          size={200}
          thickness={22}
          titleColor="#1a7a3a"
          className="premium-card"
        />

        {/* Top 5 GenAI Cost Drivers */}
        {top5GenAI.length > 0 ? (
          <CostBreakdownChart
            title="Top 5 GenAI Cost Drivers"
            items={top5GenAI}
            countLabel="providers"
            maxItems={5}
            showOthers={false}
            className="premium-card"
          />
        ) : (
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-[#10A37F]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-slate-500">No GenAI costs yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Top 5 Cloud + Top 5 Subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 animate-fade-up animation-delay-300">
        {/* Top 5 Cloud Cost Drivers */}
        {top5Cloud.length > 0 ? (
          <CostBreakdownChart
            title="Top 5 Cloud Cost Drivers"
            items={top5Cloud}
            countLabel="services"
            maxItems={5}
            showOthers={false}
            className="premium-card"
          />
        ) : (
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Cloud className="h-6 w-6 sm:h-8 sm:w-8 text-[#4285F4]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-slate-500">No cloud costs yet</p>
            </div>
          </div>
        )}

        {/* Top 5 Subscription Cost Drivers */}
        {top5Subscription.length > 0 ? (
          <CostBreakdownChart
            title="Top 5 Subscription Cost Drivers"
            items={top5Subscription}
            countLabel="subscriptions"
            maxItems={5}
            showOthers={false}
            className="premium-card"
          />
        ) : (
          <div className="premium-card bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
            <div className="text-center">
              <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-[#FF6C5E]/40 mx-auto mb-1.5 sm:mb-2" />
              <p className="text-xs sm:text-sm text-slate-500">No subscription costs yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Integration Status */}
      <Card>
        <CardHeader className="border-b border-border pb-3 sm:pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[15px] sm:text-[17px] font-bold text-slate-900">Connected Integrations</CardTitle>
            <Link href={`/${orgSlug}/integrations`}>
              <button className="inline-flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-slate-900 hover:text-black transition-colors">
                Manage
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {integrations.length > 0 ? (
              integrations.map((integration) => (
                <div
                  key={integration.provider}
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-r from-white to-[#90FCA6]/5 border border-border hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md sm:rounded-lg bg-[#90FCA6]/10 shrink-0">
                      {integration.provider.includes("GCP") || integration.provider.includes("AWS") || integration.provider.includes("AZURE") ? (
                        <Cloud className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#1a7a3a]" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#1a7a3a]" />
                      )}
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                      {integration.name}
                    </span>
                  </div>
                  <Badge
                    variant={
                      integration.status === "connected"
                        ? "success"
                        : integration.status === "pending"
                        ? "warning"
                        : "outline"
                    }
                    className="text-[10px] sm:text-[11px] shrink-0"
                  >
                    {integration.status === "connected"
                      ? "Connected"
                      : integration.status === "pending"
                      ? "Pending"
                      : "Error"}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-4 sm:py-6">
                <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-slate-300 mx-auto mb-1.5 sm:mb-2" />
                <p className="text-xs sm:text-sm text-slate-500">No integrations configured</p>
                <Link href={`/${orgSlug}/integrations`} className="inline-block mt-2">
                  <button className="inline-flex items-center gap-2 h-8 sm:h-9 px-3 sm:px-4 bg-[#90FCA6] text-slate-900 text-xs sm:text-[13px] font-semibold rounded-lg hover:bg-[#B8FDCA] transition-colors">
                    Add Integration
                  </button>
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h2 className="text-[11px] sm:text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-3 sm:mb-4">Quick Actions</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <Card
                className={`group cursor-pointer transition-all duration-300 bg-gradient-to-br border ${QUICK_ACTION_COLOR_CLASSES[action.color]} hover:-translate-y-1`}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-0 sm:space-y-4">
                    <div
                      className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg sm:rounded-xl ${QUICK_ACTION_ICON_CLASSES[action.color]} shadow-lg transition-transform duration-200 group-hover:scale-110 shrink-0`}
                    >
                      {action.icon}
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <h3 className="text-[14px] sm:text-[16px] font-bold text-slate-900">{action.title}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Pipeline Runs */}
      <div>
        <h2 className="text-[11px] sm:text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-3 sm:mb-4">Recent Pipeline Runs</h2>
        <Card>
          <CardContent className="p-0">
            {recentPipelines.length > 0 ? (
              <div className="divide-y divide-border">
                {recentPipelines.map((pipeline) => (
                  <div
                    key={pipeline.pipeline_logging_id}
                    className="flex items-start gap-2.5 sm:gap-4 p-3 sm:p-4 hover:bg-[#90FCA6]/5 transition-colors"
                  >
                    <div
                      className={`flex h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-lg sm:rounded-xl border ${getStatusColor(pipeline.status)}`}
                    >
                      {getPipelineIcon(pipeline.pipeline_id)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-[13px] sm:text-[15px] font-semibold text-slate-900 truncate">{pipeline.pipeline_id}</p>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">
                            {pipeline.duration_ms
                              ? `Duration: ${(pipeline.duration_ms / 1000).toFixed(1)}s`
                              : pipeline.error_message
                              ? pipeline.error_message.slice(0, 50)
                              : "Running..."}
                          </p>
                        </div>
                        <Badge
                          variant={
                            pipeline.status === "COMPLETED" ? "success"
                            : pipeline.status === "FAILED" ? "destructive"
                            : "outline"
                          }
                          className="text-[9px] sm:text-[10px] flex-shrink-0"
                        >
                          {pipeline.status === "COMPLETED" && <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />}
                          {pipeline.status === "FAILED" && <AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />}
                          {pipeline.status === "RUNNING" && <Activity className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1 animate-pulse" />}
                          {pipeline.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                        <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        {formatTimeAgo(pipeline.start_time)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 sm:p-8 text-center">
                <Database className="h-8 w-8 sm:h-10 sm:w-10 text-slate-300 mx-auto mb-2 sm:mb-3" />
                <p className="text-xs sm:text-sm font-medium text-slate-900">No pipeline runs yet</p>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-1">Run a pipeline to see activity here</p>
              </div>
            )}
            <div className="border-t border-border p-3 sm:p-4 bg-[#90FCA6]/5">
              <Link href={`/${orgSlug}/pipelines`}>
                <button className="w-full inline-flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-slate-900 hover:text-black transition-colors">
                  View All Pipelines
                  <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom CTA Section */}
      <Card className="relative overflow-hidden border-2 border-[#90FCA6]/20 bg-gradient-to-br from-[#90FCA6]/5 via-white to-[#FF6C5E]/5">
        <CardContent className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
            <div className="space-y-1 sm:space-y-2 text-center sm:text-left">
              <div className="flex items-center gap-1.5 sm:gap-2 justify-center sm:justify-start">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-[#1a7a3a]" />
                <h3 className="text-[15px] sm:text-[17px] font-bold text-slate-900">Invite Your Team</h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Collaborate on cost optimization with your team members
              </p>
            </div>
            <Link href={`/${orgSlug}/settings/members`}>
              <button className="inline-flex items-center gap-1.5 sm:gap-2 h-9 sm:h-11 px-4 sm:px-6 bg-[#90FCA6] text-slate-900 text-xs sm:text-[13px] font-semibold rounded-lg sm:rounded-xl hover:bg-[#B8FDCA] shadow-sm hover:shadow-md transition-all">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                Manage Team
              </button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
