"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Wallet,
  TrendingUp,
  DollarSign,
  Calendar,
  RefreshCw,
  AlertCircle,
  Sparkles,
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
import {
  getSaaSSubscriptionCosts,
  type SaaSCostSummary,
} from "@/actions/subscription-providers"
import { formatCurrency } from "@/lib/i18n"
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// Category colors for horizontal bars
const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-[#10A37F]",
  design: "bg-[#F24E1E]",
  productivity: "bg-[#4285F4]",
  communication: "bg-[#4A154B]",
  development: "bg-[#181717]",
  cloud: "bg-[#3ECF8E]",
  other: "bg-slate-400",
}

// Category display names
const CATEGORY_NAMES: Record<string, string> = {
  ai: "AI & ML",
  design: "Design",
  productivity: "Productivity",
  communication: "Communication",
  development: "Development",
  cloud: "Cloud & Infrastructure",
  other: "Other",
}

interface CategoryBreakdown {
  category: string
  total_cost: number
  count: number
  percentage: number
}

export default function SubscriptionCostsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [summary, setSummary] = useState<SaaSCostSummary | null>(null)
  const [categories, setCategories] = useState<CategoryBreakdown[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const costsResult = await getSaaSSubscriptionCosts(orgSlug)

      if (costsResult.success && costsResult.summary) {
        setSummary(costsResult.summary)
        // Use currency from API response (FIX: STATE-001)
        if (costsResult.currency) {
          setOrgCurrency(costsResult.currency)
        }

        // Build category breakdown from subscriptions data if available
        // FIX: Only use CURRENT MONTH data to match summary.mtd_cost
        // Count UNIQUE subscriptions per category (by ResourceId), not total daily rows
        if (costsResult.data && costsResult.data.length > 0) {
          const categoryMap: Record<string, { total: number; uniqueIds: Set<string> }> = {}
          const mtdCost = costsResult.summary.mtd_cost || 0

          // Get current month boundaries for filtering
          const now = new Date()
          const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
          const currentMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59))

          for (const sub of costsResult.data) {
            // Filter to current month only using ChargePeriodStart
            const chargeDate = sub.ChargePeriodStart ? new Date(sub.ChargePeriodStart) : null
            if (!chargeDate || chargeDate < currentMonthStart || chargeDate > currentMonthEnd) {
              continue // Skip rows outside current month
            }

            const category = sub.ServiceCategory?.toLowerCase() || "other"
            const resourceId = sub.ResourceId || sub.ServiceName || 'unknown'
            if (!categoryMap[category]) {
              categoryMap[category] = { total: 0, uniqueIds: new Set() }
            }
            categoryMap[category].total += sub.EffectiveCost || 0
            categoryMap[category].uniqueIds.add(resourceId)
          }

          const breakdown: CategoryBreakdown[] = Object.entries(categoryMap)
            .map(([cat, data]) => ({
              category: cat,
              total_cost: data.total,
              count: data.uniqueIds.size,  // Unique subscriptions, not rows
              percentage: mtdCost > 0 ? (data.total / mtdCost) * 100 : 0,
            }))
            .sort((a, b) => b.total_cost - a.total_cost)

          setCategories(breakdown)
        }
      } else {
        setError(costsResult.error || "Failed to load subscription costs")
      }
    } catch (err) {
      // FIX: ERR-001 - Log actual error for debugging
      console.error("Subscription costs error:", err)
      setError(err instanceof Error ? err.message : "Failed to load subscription cost data")
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
                {error.includes("API key") ? (
                  <>
                    Please complete organization onboarding in{" "}
                    <Link href={`/${orgSlug}/settings/organization`} className="underline">
                      Settings
                    </Link>.
                  </>
                ) : (
                  "Please try again later."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--cloudact-mint)]/10">
            <Wallet className="h-6 w-6 text-[var(--cloudact-mint-text)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Costs</h1>
            <p className="text-sm text-slate-500">SaaS and recurring service spend</p>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="h-9"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Scorecards - Apple Health Style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Month to Date */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-[var(--cloudact-coral)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">MTD Spend</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.mtd_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {new Date().toLocaleString("default", { month: "long" })}
          </div>
        </div>

        {/* Daily Rate */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Daily Rate</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.total_daily_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">per day</div>
        </div>

        {/* Monthly Forecast */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-[var(--cloudact-coral)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Forecast</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.forecast_monthly_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">this month</div>
        </div>

        {/* YTD */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">YTD {new Date().getFullYear()}</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatCurrency(summary?.ytd_cost || 0, orgCurrency)}
          </div>
          <div className="text-xs text-slate-500 mt-1">year to date</div>
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
              const displayName = CATEGORY_NAMES[category.category] || category.category

              return (
                <div key={category.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{displayName}</span>
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
                    <span>{category.count} subscription{category.count !== 1 ? "s" : ""}</span>
                    <span>{category.percentage.toFixed(1)}% of total</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!summary && categories.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex p-4 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-4">
            <Wallet className="h-10 w-10 text-[var(--cloudact-mint-text)]" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No subscription costs yet</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Add your SaaS subscriptions (Slack, Notion, Figma, etc.) and run the subscription cost pipeline to see your spend.
          </p>
          <Link href={`/${orgSlug}/integrations/subscriptions`}>
            <Button className="console-button-primary">
              Add Subscriptions
            </Button>
          </Link>
        </div>
      )}

      {/* Data Table */}
      {categories.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              Cost Details
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {summary?.record_count || categories.reduce((acc, c) => acc + c.count, 0)} subscriptions tracked
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase">Category</TableHead>
                <TableHead className="text-xs font-semibold uppercase">Subscriptions</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Daily Rate</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Monthly Est.</TableHead>
                <TableHead className="text-xs font-semibold uppercase text-right">Annual Est.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => {
                // Calculate days elapsed in current month (for accurate daily rate)
                const now = new Date()
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                const daysElapsed = now.getDate() // Days so far this month

                // Daily rate = MTD cost / days elapsed
                const dailyRate = daysElapsed > 0 ? category.total_cost / daysElapsed : 0
                // Monthly forecast = daily rate * days in month
                const monthlyForecast = dailyRate * daysInMonth
                // Annual forecast = monthly forecast * 12
                const annualForecast = monthlyForecast * 12

                return (
                  <TableRow key={category.category}>
                    <TableCell className="font-medium">
                      {CATEGORY_NAMES[category.category] || category.category}
                    </TableCell>
                    <TableCell className="text-slate-500">{category.count}</TableCell>
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
