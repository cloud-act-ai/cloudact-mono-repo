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
  Brain,
  Wallet,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getPipelineRuns } from "@/actions/pipelines"
import { getIntegrations } from "@/actions/integrations"
import { listEnabledProviders } from "@/actions/subscription-providers"
import type { PipelineRunSummary } from "@/lib/api/backend"

// New unified chart library
import {
  DailyTrendChart,
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
  type?: "api" | "subscription"
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
  // FIX-CUSTOM-001: When range is "custom", don't include customRange in the update.
  // The customRange is already set by handleCustomRangeChange before this is called.
  // Using the closure value would cause a race condition (stale value).
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    if (range === "custom") {
      // Only set timeRange - customRange is already set by handleCustomRangeChange
      setUnifiedFilters({ timeRange: range })
    } else {
      // Clear customRange when switching to preset range
      setUnifiedFilters({ timeRange: range, customRange: undefined })
    }
  }, [setUnifiedFilters])

  const handleCustomRangeChange = useCallback((range: CustomDateRange | undefined) => {
    setUnifiedFilters({ customRange: range })
  }, [setUnifiedFilters])

  // Load non-cost data (pipelines, integrations, subscription providers)
  const loadNonCostData = useCallback(async () => {
    try {
      const [pipelinesResult, integrationsResult, subscriptionProvidersResult] = await Promise.all([
        getPipelineRuns(orgSlug, { limit: 5 }),
        getIntegrations(orgSlug),
        listEnabledProviders(orgSlug),
      ])

      if (pipelinesResult.success && pipelinesResult.data?.runs) {
        setRecentPipelines(pipelinesResult.data.runs.slice(0, 5))
      }

      const integrationList: IntegrationItem[] = []

      // Add API integrations (LLM + Cloud)
      if (integrationsResult.success && integrationsResult.integrations) {
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
            type: "api",
          })
        }
      }

      // Add subscription providers (SaaS subscriptions)
      if (subscriptionProvidersResult.success && subscriptionProvidersResult.providers) {
        for (const provider of subscriptionProvidersResult.providers) {
          // Format display name (e.g., "chatgpt" -> "ChatGPT", "chatgpt_plus" -> "Chatgpt Plus")
          const displayName = provider.provider_name
            .split('_')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ')

          integrationList.push({
            name: displayName,
            provider: `SUB_${provider.provider_name.toUpperCase()}`,
            status: "connected",
            type: "subscription",
          })
        }
      }

      integrationList.sort((a, b) => {
        const order = { connected: 0, pending: 1, not_connected: 2 }
        return order[a.status] - order[b.status]
      })

      setIntegrations(integrationList.slice(0, 6)) // Show up to 6 integrations
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
  // Rolling average is calculated by DailyTrendChart component internally
  const filteredDailyData = useMemo(() => {
    const timeSeries = getFilteredTimeSeries()
    if (!timeSeries || timeSeries.length === 0) return []

    return timeSeries.map((point) => ({
      date: point.date,
      // FORMAT-001 FIX: Use undefined to respect user's browser locale
      label: new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: Number.isFinite(point.total) ? point.total : 0,
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
  // TODO: Use this for category breakdown chart component
  const _categoryBreakdown = useMemo(() => {
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
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto py-4 sm:py-5 lg:py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--cloudact-mint-text)]" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6 space-y-6 sm:space-y-8 lg:space-y-10">
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
        <div className="flex items-center gap-3 sm:gap-4">
          <TimeRangeFilter
            value={timeRange}
            onChange={handleTimeRangeChange}
            customRange={customRange}
            onCustomRangeChange={handleCustomRangeChange}
            size="sm"
          />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Separator line below filters */}
      <div className="h-px bg-gradient-to-r from-slate-200 via-slate-200/60 to-transparent" />

      {/* Summary Metrics */}
      <div className="animate-fade-up">
        <CostSummaryGrid data={summaryData} timeRange={timeRange} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION: Daily Cost Trend
          Executive-grade time series with rolling average overlay
          ═══════════════════════════════════════════════════════════════ */}
      {filteredDailyData.length > 0 && (
        <section className="animate-fade-up animation-delay-100">
          {/* Section Header - Enterprise style */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-[#90FCA6]" />
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Cost Trend Analysis
              </h2>
            </div>
            {/* Data freshness indicator */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live data</span>
            </div>
          </div>
          <DailyTrendChart
            title="Cost Trend"
            subtitle={timeRange === "365" || timeRange === "ytd"
              ? "Monthly spend with 3-month rolling average"
              : timeRange === "90"
              ? "Weekly spend with 4-week rolling average"
              : "Daily spend with 7-day rolling average"}
            data={filteredDailyData.map(d => ({
              date: d.date,
              label: d.label,
              value: d.value,
            }))}
            timeRange={timeRange}
            barColor="#90FCA6"
            lineColor="#FF6C5E"
            height={320}
            mobileHeight={240}
            loading={isLoading}
          />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION: Cost Distribution
          Total spend breakdown + Top GenAI drivers
          ═══════════════════════════════════════════════════════════════ */}
      <section className="animate-fade-up animation-delay-200">
        {/* Section Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-1 rounded-full bg-[#FF6C5E]" />
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Cost Distribution
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Total Spend Ring Chart */}
          <CostRingChart
            title="Total Spend by Category"
            segments={ringSegments}
            centerLabel={timeRange === "mtd" ? "MTD" : timeRange === "ytd" ? "YTD" : timeRange === "custom" ? "Period" : timeRange === "365" ? "365D" : timeRange === "90" ? "90D" : timeRange === "30" ? "30D" : "Total"}
            insight={!hasData
              ? "No cost data yet. Connect providers and run pipelines."
              : `Spending across ${ringSegments.filter(s => s.value > 0).length} cost categories.`
            }
            showChevron
            onClick={() => window.location.href = `/${orgSlug}/cost-dashboards/overview`}
            size={180}
            thickness={20}
            titleColor="#0f172a"
          />

          {/* Top 5 GenAI Cost Drivers */}
          {top5GenAI.length > 0 ? (
            <CostBreakdownChart
              title="Top GenAI Providers"
              items={top5GenAI}
              countLabel="providers"
              maxItems={5}
              showOthers={false}
            />
          ) : (
            <Card className="flex items-center justify-center min-h-[200px]">
              <div className="text-center px-6 py-8">
                <div className="mx-auto w-12 h-12 rounded-xl bg-[#10A37F]/10 flex items-center justify-center mb-3">
                  <Brain className="h-6 w-6 text-[#10A37F]/60" />
                </div>
                <p className="text-sm font-medium text-slate-900 mb-1">No GenAI costs yet</p>
                <p className="text-xs text-slate-500">Connect OpenAI, Anthropic, or other LLM providers</p>
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION: Top Cost Drivers
          Cloud infrastructure + SaaS subscriptions breakdown
          ═══════════════════════════════════════════════════════════════ */}
      <section className="animate-fade-up animation-delay-300">
        {/* Section Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-1 rounded-full bg-[#4285F4]" />
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Top Cost Drivers
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Top 5 Cloud Cost Drivers */}
          {top5Cloud.length > 0 ? (
            <CostBreakdownChart
              title="Top Cloud Providers"
              items={top5Cloud}
              countLabel="services"
              maxItems={5}
              showOthers={false}
            />
          ) : (
            <Card className="flex items-center justify-center min-h-[200px]">
              <div className="text-center px-6 py-8">
                <div className="mx-auto w-12 h-12 rounded-xl bg-[#4285F4]/10 flex items-center justify-center mb-3">
                  <Cloud className="h-6 w-6 text-[#4285F4]/60" />
                </div>
                <p className="text-sm font-medium text-slate-900 mb-1">No cloud costs yet</p>
                <p className="text-xs text-slate-500">Connect AWS, GCP, or Azure accounts</p>
              </div>
            </Card>
          )}

          {/* Top 5 Subscription Cost Drivers */}
          {top5Subscription.length > 0 ? (
            <CostBreakdownChart
              title="Top SaaS Subscriptions"
              items={top5Subscription}
              countLabel="subscriptions"
              maxItems={5}
              showOthers={false}
            />
          ) : (
            <Card className="flex items-center justify-center min-h-[200px]">
              <div className="text-center px-6 py-8">
                <div className="mx-auto w-12 h-12 rounded-xl bg-[#FF6C5E]/10 flex items-center justify-center mb-3">
                  <Wallet className="h-6 w-6 text-[#FF6C5E]/60" />
                </div>
                <p className="text-sm font-medium text-slate-900 mb-1">No subscription costs yet</p>
                <p className="text-xs text-slate-500">Add your SaaS subscriptions to track</p>
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION: Integration Status
          Connected providers and services overview
          ═══════════════════════════════════════════════════════════════ */}
      <section className="animate-fade-up animation-delay-400">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-emerald-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Connected Integrations
            </h2>
          </div>
          <Link href={`/${orgSlug}/integrations`}>
            <button className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors group">
              Manage All
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </Link>
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {integrations.length > 0 ? (
                integrations.map((integration) => (
                  <div
                    key={integration.provider}
                    className="group flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-white border border-slate-100 hover:border-[#90FCA6]/30 hover:shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl transition-colors ${
                        integration.status === "connected"
                          ? "bg-emerald-50 group-hover:bg-emerald-100"
                          : "bg-slate-50 group-hover:bg-slate-100"
                      }`}>
                        {integration.type === "subscription" ? (
                          <Wallet className={`h-4 w-4 ${integration.status === "connected" ? "text-emerald-600" : "text-slate-400"}`} />
                        ) : integration.provider.includes("GCP") || integration.provider.includes("AWS") || integration.provider.includes("AZURE") || integration.provider.includes("OCI") ? (
                          <Cloud className={`h-4 w-4 ${integration.status === "connected" ? "text-emerald-600" : "text-slate-400"}`} />
                        ) : (
                          <Zap className={`h-4 w-4 ${integration.status === "connected" ? "text-emerald-600" : "text-slate-400"}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-900 truncate block">
                          {integration.name}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {integration.type === "subscription" ? "SaaS" : "API"}
                        </span>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                      integration.status === "connected"
                        ? "bg-emerald-50 text-emerald-700"
                        : integration.status === "pending"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        integration.status === "connected"
                          ? "bg-emerald-500"
                          : integration.status === "pending"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`} />
                      {integration.status === "connected" ? "Active" : integration.status === "pending" ? "Pending" : "Error"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                    <Zap className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">No integrations configured</p>
                  <p className="text-xs text-slate-500 mb-4">Connect your first provider to start tracking costs</p>
                  <Link href={`/${orgSlug}/integrations`}>
                    <button className="inline-flex items-center gap-2 h-9 px-4 bg-[#90FCA6] text-slate-900 text-sm font-medium rounded-lg hover:bg-[#6EE890] shadow-sm hover:shadow transition-all">
                      Add Integration
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION: Quick Actions
          Primary action cards for common workflows
          ═══════════════════════════════════════════════════════════════ */}
      <section className="animate-fade-up animation-delay-500">
        {/* Section Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1 w-1 rounded-full bg-blue-500" />
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Quick Actions
          </h2>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <Card
                className={`group cursor-pointer transition-all duration-300 bg-gradient-to-br border ${QUICK_ACTION_COLOR_CLASSES[action.color]} hover:-translate-y-1 hover:shadow-lg`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-0 sm:space-y-3">
                    <div
                      className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl ${QUICK_ACTION_ICON_CLASSES[action.color]} shadow-md transition-transform duration-200 group-hover:scale-105 shrink-0`}
                    >
                      {action.icon}
                    </div>
                    <div className="space-y-0.5">
                      <h3 className="text-sm sm:text-[15px] font-semibold text-slate-900">{action.title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{action.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION: Recent Pipeline Runs
          Activity feed for pipeline executions
          ═══════════════════════════════════════════════════════════════ */}
      <section className="animate-fade-up animation-delay-600">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recent Pipeline Runs
            </h2>
          </div>
          {recentPipelines.length > 0 && (
            <span className="text-[10px] text-slate-400">
              {recentPipelines.filter(p => p.status === "COMPLETED").length}/{recentPipelines.length} completed
            </span>
          )}
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {recentPipelines.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {recentPipelines.map((pipeline) => (
                  <div
                    key={pipeline.pipeline_logging_id}
                    className="group flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div
                      className={`flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl border transition-colors ${getStatusColor(pipeline.status)}`}
                    >
                      {getPipelineIcon(pipeline.pipeline_id)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{pipeline.pipeline_id}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {pipeline.duration_ms
                              ? `Completed in ${(pipeline.duration_ms / 1000).toFixed(1)}s`
                              : pipeline.error_message
                              ? pipeline.error_message.slice(0, 50)
                              : "Processing..."}
                          </p>
                        </div>
                        <Badge
                          variant={
                            pipeline.status === "COMPLETED" ? "success"
                            : pipeline.status === "FAILED" ? "destructive"
                            : "outline"
                          }
                          className="text-[10px] flex-shrink-0"
                        >
                          {pipeline.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {pipeline.status === "FAILED" && <AlertCircle className="h-3 w-3 mr-1" />}
                          {pipeline.status === "RUNNING" && <Activity className="h-3 w-3 mr-1 animate-pulse" />}
                          {pipeline.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(pipeline.start_time)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                  <Database className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-900 mb-1">No pipeline runs yet</p>
                <p className="text-xs text-slate-500">Run a pipeline to see activity here</p>
              </div>
            )}
            <div className="border-t border-slate-100 p-3.5 sm:p-4 bg-slate-50/50">
              <Link href={`/${orgSlug}/pipelines`}>
                <button className="w-full inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors group">
                  View All Pipelines
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION: Team Collaboration CTA
          Encourage team onboarding
          ═══════════════════════════════════════════════════════════════ */}
      <section className="animate-fade-up animation-delay-700">
        <Card className="relative overflow-hidden border border-slate-100 bg-gradient-to-r from-slate-50 via-white to-[#90FCA6]/5">
          {/* Subtle shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-1000 pointer-events-none" />

          <CardContent className="relative p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-[#90FCA6]/15 shrink-0">
                  <Users className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm sm:text-base font-semibold text-slate-900">
                    Invite Your Team
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Collaborate on cost optimization with your team members
                  </p>
                </div>
              </div>
              <Link href={`/${orgSlug}/settings/members`}>
                <button className="inline-flex items-center gap-2 h-10 px-5 bg-[#90FCA6] text-slate-900 text-sm font-medium rounded-lg hover:bg-[#6EE890] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                  <Users className="h-4 w-4" />
                  Manage Team
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
    </main>
  )
}
