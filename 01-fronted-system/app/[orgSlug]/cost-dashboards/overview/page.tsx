"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  TrendingUp,
  DollarSign,
  Calendar,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Brain,
  Cloud,
  Wallet,
  ChevronRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getTotalCosts, getCostByProvider, type TotalCostSummary, type ProviderBreakdown } from "@/actions/costs"
import { getSaaSSubscriptionCosts, type SaaSCostSummary } from "@/actions/subscription-providers"
import { formatCurrency } from "@/lib/i18n"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// Category colors for horizontal bars
const CATEGORY_COLORS: Record<string, string> = {
  genai: "bg-[#10A37F]",
  cloud: "bg-[#4285F4]",
  saas: "bg-[#FF6C5E]",
}

// Category display info
const CATEGORY_INFO: Record<string, { name: string; icon: React.ElementType; color: string }> = {
  genai: { name: "GenAI", icon: Brain, color: "text-[#10A37F]" },
  cloud: { name: "Cloud", icon: Cloud, color: "text-[#4285F4]" },
  saas: { name: "SaaS", icon: Wallet, color: "text-[#FF6C5E]" },
}

interface CostCategory {
  category: string
  total_cost: number
  percentage: number
  subscriptionCount?: number  // Unique subscriptions, not daily rows
}

export default function CostOverviewPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [totalSummary, setTotalSummary] = useState<TotalCostSummary | null>(null)
  const [saasSummary, setSaasSummary] = useState<SaaSCostSummary | null>(null)
  const [providers, setProviders] = useState<ProviderBreakdown[]>([])
  const [categories, setCategories] = useState<CostCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Get current month date range for filtering
      const now = new Date()
      const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
      const startDate = startOfMonth.toISOString().split('T')[0]  // YYYY-MM-DD
      const endDate = now.toISOString().split('T')[0]  // Today

      const [costsResult, providersResult, saasResult] = await Promise.all([
        getTotalCosts(orgSlug),
        getCostByProvider(orgSlug, startDate, endDate),  // Filter to current month
        getSaaSSubscriptionCosts(orgSlug),
      ])

      if (costsResult.success && costsResult.data) {
        setTotalSummary(costsResult.data)
        // Use currency from API response
        if (costsResult.data.currency) {
          setOrgCurrency(costsResult.data.currency)
        }
      }

      // Calculate provider breakdown from SaaS data with correct unique subscription count
      // This replaces getCostByProvider which returns row counts, not subscription counts
      if (saasResult.success && saasResult.data && saasResult.data.length > 0) {
        // Filter to current month only
        const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
        const currentMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59))

        const providerMap: Record<string, { totalCost: number; uniqueIds: Set<string> }> = {}

        for (const row of saasResult.data) {
          // Filter to current month
          const chargeDate = row.ChargePeriodStart ? new Date(row.ChargePeriodStart) : null
          if (!chargeDate || chargeDate < currentMonthStart || chargeDate > currentMonthEnd) {
            continue
          }

          const provider = row.ServiceProviderName || row.ProviderName || "Unknown"
          const resourceId = row.ResourceId || row.ServiceName || "unknown"

          if (!providerMap[provider]) {
            providerMap[provider] = { totalCost: 0, uniqueIds: new Set() }
          }
          providerMap[provider].totalCost += row.EffectiveCost || 0
          providerMap[provider].uniqueIds.add(resourceId)
        }

        const totalProviderCost = Object.values(providerMap).reduce((sum, p) => sum + p.totalCost, 0)

        const validProviders: ProviderBreakdown[] = Object.entries(providerMap)
          .filter(([name, _]) => name && name.trim() !== "" && name !== "Unknown")
          .map(([name, data]) => ({
            provider: name,
            total_cost: data.totalCost,
            record_count: data.uniqueIds.size,  // Unique subscriptions, not rows!
            percentage: totalProviderCost > 0 ? (data.totalCost / totalProviderCost) * 100 : 0,
          }))
          .filter(p => p.total_cost > 0)
          .sort((a, b) => b.total_cost - a.total_cost)
          .slice(0, 10)

        setProviders(validProviders)
      } else if (providersResult.success) {
        // Fallback to API data if no SaaS data (but filter out invalid entries)
        const validProviders = providersResult.data
          .filter(p => p.provider && p.provider.trim() !== "" && p.provider !== "Unknown" && p.total_cost > 0)
          .slice(0, 10)
        setProviders(validProviders)
      }

      if (saasResult.success) {
        setSaasSummary(saasResult.summary)
      }

      // Build category breakdown from total costs data
      const genaiCost = costsResult.data?.llm?.total_monthly_cost || 0
      const cloudCost = costsResult.data?.cloud?.total_monthly_cost || 0
      const saasCost = costsResult.data?.saas?.total_monthly_cost || 0
      const totalCost = genaiCost + cloudCost + saasCost

      // Calculate unique subscription count from SaaS data (not row count)
      let saasSubscriptionCount = 0
      if (saasResult.success && saasResult.data && saasResult.data.length > 0) {
        const uniqueResourceIds = new Set(
          saasResult.data.map(r => r.ResourceId || r.ServiceName || 'unknown')
        )
        saasSubscriptionCount = uniqueResourceIds.size
      }

      if (totalCost > 0) {
        const categoryList: CostCategory[] = [
          { category: "genai", total_cost: genaiCost, percentage: (genaiCost / totalCost) * 100 },
          { category: "cloud", total_cost: cloudCost, percentage: (cloudCost / totalCost) * 100 },
          { category: "saas", total_cost: saasCost, percentage: (saasCost / totalCost) * 100, subscriptionCount: saasSubscriptionCount },
        ].filter(c => c.total_cost > 0).sort((a, b) => b.total_cost - a.total_cost)
        setCategories(categoryList)
      }
    } catch (err) {
      // FIX: ERR-002 - Log actual error for debugging
      console.error("Cost overview error:", err)
      setError(err instanceof Error ? err.message : "Failed to load cost data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  // Calculate max cost for horizontal bar scaling
  const maxCategoryCost = Math.max(...categories.map(c => c.total_cost), 1)

  // Calculate combined totals from TotalCostSummary
  const combinedDaily = totalSummary?.total?.total_daily_cost || 0
  const combinedMonthly = totalSummary?.total?.total_monthly_cost || 0
  const combinedAnnual = totalSummary?.total?.total_annual_cost || 0

  // FIX: STATE-002, STATE-003 - Use actual MTD/YTD from API instead of naive calculations
  // Aggregate MTD from all cost types (saas, cloud, llm)
  const saasMtd = (totalSummary?.saas as { mtd_cost?: number })?.mtd_cost || 0
  const cloudMtd = (totalSummary?.cloud as { mtd_cost?: number })?.mtd_cost || 0
  const llmMtd = (totalSummary?.llm as { mtd_cost?: number })?.mtd_cost || 0
  const combinedMTD = saasMtd + cloudMtd + llmMtd || combinedMonthly

  // Aggregate YTD from all cost types
  const saasYtd = (totalSummary?.saas as { ytd_cost?: number })?.ytd_cost || 0
  const cloudYtd = (totalSummary?.cloud as { ytd_cost?: number })?.ytd_cost || 0
  const llmYtd = (totalSummary?.llm as { ytd_cost?: number })?.ytd_cost || 0
  const combinedYTD = saasYtd + cloudYtd + llmYtd || combinedAnnual

  // Forecast is the monthly total (projected based on current daily rate)
  const combinedForecast = combinedMonthly

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--cloudact-mint-text)]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">{error}</h3>
              <p className="text-[13px] text-slate-600 mt-0.5">
                Please try again later.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header - Mobile optimized */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[var(--cloudact-mint)]/10">
            <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--cloudact-mint-text)]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Cost Overview</h1>
            <p className="text-xs sm:text-sm text-slate-500">Unified view of all spending</p>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="h-10 sm:h-9 w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Scorecards - Mobile optimized Apple Health Style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Month to Date */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--cloudact-coral)]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">MTD</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(combinedMTD, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
            {new Date().toLocaleString("default", { month: "short" })}
          </div>
        </div>

        {/* Daily Rate */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--cloudact-mint-text)]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">Daily</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(combinedDaily, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">per day</div>
        </div>

        {/* Monthly Forecast */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--cloudact-coral)]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">Forecast</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(combinedForecast, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">this month</div>
        </div>

        {/* YTD */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--cloudact-mint-text)]" />
            <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">YTD</span>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            {formatCurrency(combinedYTD, orgCurrency)}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">year to date</div>
        </div>
      </div>

      {/* Horizontal Bar Chart - Category Breakdown */}
      {categories.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-6">
            Cost by Category
          </h2>
          <div className="space-y-4">
            {categories.map((category) => {
              const percentage = (category.total_cost / maxCategoryCost) * 100
              const barColor = CATEGORY_COLORS[category.category] || "bg-slate-400"
              const info = CATEGORY_INFO[category.category]
              const Icon = info?.icon || DollarSign

              return (
                <div key={category.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${info?.color || "text-slate-500"}`} />
                      <span className="text-sm font-medium text-slate-700">{info?.name || category.category}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      {formatCurrency(category.total_cost, orgCurrency)}
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    {category.subscriptionCount !== undefined && category.subscriptionCount > 0 && (
                      <span>{category.subscriptionCount} subscription{category.subscriptionCount !== 1 ? "s" : ""}</span>
                    )}
                    <span>{category.percentage.toFixed(1)}% of total</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Provider Breakdown - Horizontal Bars */}
      {providers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-6">
            Top Providers by Spend
          </h2>
          <div className="space-y-4">
            {providers.slice(0, 5).map((provider) => {
              const maxProviderCost = Math.max(...providers.map(p => p.total_cost), 1)
              const percentage = (provider.total_cost / maxProviderCost) * 100

              return (
                <div key={provider.provider} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{provider.provider}</span>
                    <span className="text-sm font-bold text-slate-900">
                      {formatCurrency(provider.total_cost, orgCurrency)}
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--cloudact-mint)] rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{provider.record_count} subscription{provider.record_count !== 1 ? "s" : ""}</span>
                    {/* FIX: EDGE-004 - Handle NaN percentage */}
                    <span>{(provider.percentage ?? 0).toFixed(1)}% of total</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
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

      {/* Empty State */}
      {!totalSummary && !saasSummary && providers.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex p-4 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-4">
            <DollarSign className="h-10 w-10 text-[var(--cloudact-mint-text)]" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No cost data yet</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Connect your providers and run pipelines to see your cost data here.
          </p>
          <Link href={`/${orgSlug}/integrations`}>
            <Button className="console-button-primary">
              Connect Providers
            </Button>
          </Link>
        </div>
      )}

      {/* Data Table - Provider Summary */}
      {providers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              Provider Details
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {providers.reduce((acc, p) => acc + p.record_count, 0)} subscription{providers.reduce((acc, p) => acc + p.record_count, 0) !== 1 ? "s" : ""}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase">Provider</TableHead>
                <TableHead className="text-xs font-semibold uppercase">Subscriptions</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Daily Rate</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Monthly Est.</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Annual Est.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.slice(0, 10).map((provider) => {
                // Calculate days elapsed for accurate daily rate
                const now = new Date()
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                const daysElapsed = now.getDate()

                // Daily rate = total cost / days elapsed
                const dailyRate = daysElapsed > 0 ? provider.total_cost / daysElapsed : 0
                // Monthly forecast = daily rate * days in month
                const monthlyForecast = dailyRate * daysInMonth
                // Annual forecast = monthly * 12
                const annualForecast = monthlyForecast * 12

                return (
                  <TableRow key={provider.provider}>
                    <TableCell className="font-medium">{provider.provider || "Unknown"}</TableCell>
                    <TableCell className="text-slate-500">{provider.record_count}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(dailyRate, orgCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(monthlyForecast, orgCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCurrency(annualForecast, orgCurrency)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
