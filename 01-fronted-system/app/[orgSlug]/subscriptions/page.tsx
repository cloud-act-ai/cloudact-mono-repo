"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Wallet,
  TrendingUp,
  DollarSign,
  Calendar,
  Users,
  ArrowUpRight,
  Brain,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Cloud,
  Plus,
  AlertCircle,
  RefreshCw,
  Pencil,
  CalendarX,
  List,
} from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CardSkeleton } from "@/components/ui/card-skeleton"
import { TableSkeleton } from "@/components/ui/table-skeleton"
import {
  getAllPlansForCostDashboard,
  getSaaSSubscriptionCosts,
  type SubscriptionPlan,
  type SaaSCostSummary,
} from "@/actions/subscription-providers"

// Category icon mapping
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ai: Brain,
  design: Palette,
  productivity: FileText,
  communication: MessageSquare,
  development: Code,
  cloud: Cloud,
  other: Wallet,
}

// Category colors - CloudAct brand colors only (Teal and Coral)
const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-[#F0FDFA] text-[#007A78] border-[#007A78]",
  design: "bg-[#FFF5F3] text-[#FF6E50] border-[#FF6E50]",
  productivity: "bg-[#F0FDFA] text-[#005F5D] border-[#007A78]",
  communication: "bg-[#FFF5F3] text-[#E55A3C] border-[#FF6E50]",
  development: "bg-[#F0FDFA] text-[#007A78] border-[#14B8A6]",
  cloud: "bg-[#FFF5F3] text-[#FF6E50] border-[#FF8A73]",
  other: "bg-gray-100 text-gray-800 border-gray-300",
}

type PlanWithProvider = SubscriptionPlan & { provider_name: string }

export default function SubscriptionsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [plans, setPlans] = useState<PlanWithProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Plan summary from saas_subscription_plans table (for counts, etc.)
  const [planSummary, setPlanSummary] = useState<{
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  } | null>(null)
  // Cost summary from Polars API (cost_data_standard_1_2) - SOURCE OF TRUTH for costs
  const [costSummary, setCostSummary] = useState<SaaSCostSummary | null>(null)

  // Merged summary: costs from Polars API, counts from plans
  const summary = costSummary
    ? {
        total_daily_cost: costSummary.total_daily_cost,
        total_monthly_cost: costSummary.total_monthly_cost,
        total_annual_cost: costSummary.total_annual_cost,
        ytd_cost: costSummary.ytd_cost,
        mtd_cost: costSummary.mtd_cost,
        forecast_monthly_cost: costSummary.forecast_monthly_cost,
        forecast_annual_cost: costSummary.forecast_annual_cost,
        count_by_category: planSummary?.count_by_category || {},
        enabled_count: planSummary?.enabled_count || 0,
        total_count: planSummary?.total_count || 0,
      }
    : planSummary ? { ...planSummary, total_daily_cost: 0, ytd_cost: 0, mtd_cost: 0, forecast_monthly_cost: 0, forecast_annual_cost: 0 } : null

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Fetch both plan details and actual costs in parallel
    const [plansResult, costsResult] = await Promise.all([
      getAllPlansForCostDashboard(orgSlug),
      getSaaSSubscriptionCosts(orgSlug),
    ])

    if (plansResult.success) {
      setPlans(plansResult.plans)
      setPlanSummary(plansResult.summary)
    } else {
      setError(plansResult.error || "Failed to load subscription data")
      setPlans([])
      setPlanSummary(null)
    }

    // Cost data is optional - may not exist if pipeline hasn't run
    if (costsResult.success && costsResult.summary) {
      setCostSummary(costsResult.summary)
    } else {
      setCostSummary(null)
    }

    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadData()

    // Auto-refresh every 30 seconds to catch newly enabled providers
    const interval = setInterval(() => {
      loadData()
    }, 30000)

    return () => clearInterval(interval)
  }, [loadData])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  const formatBillingCycle = (cycle?: string) => {
    if (!cycle || cycle.trim() === "") return "Monthly"
    return cycle.charAt(0).toUpperCase() + cycle.slice(1)
  }

  // Calculate monthly equivalent based on billing cycle
  const getMonthlyEquivalent = (plan: PlanWithProvider): number => {
    const price = plan.unit_price_usd ?? 0
    if (!plan.billing_cycle) return price
    switch (plan.billing_cycle.toLowerCase()) {
      case "annual":
      case "yearly":
        return price / 12
      case "quarterly":
        return price / 3
      default:
        return price
    }
  }

  // Calculate total cost based on pricing model
  const getTotalCost = (plan: PlanWithProvider): number => {
    const basePrice = plan.unit_price_usd ?? 0
    if (plan.pricing_model === 'PER_SEAT' && plan.seats) {
      return basePrice * plan.seats
    }
    return basePrice // FLAT_FEE
  }

  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 rounded-xl bg-[#007A78] flex-shrink-0">
              <Wallet className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Subscription Costs</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
                View your SaaS subscription costs and usage
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <CardSkeleton count={4} showDescription />
        </div>

        {/* Table Skeleton */}
        <Card className="border border-gray-200 bg-white rounded-xl shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900">All Subscriptions</CardTitle>
            <CardDescription className="text-xs sm:text-sm text-gray-600">
              View and manage all your SaaS subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <TableSkeleton rows={8} columns={8} />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error state if API key is missing or other error
  if (error) {
    return (
      <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#007A78] flex-shrink-0">
            <Wallet className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Subscription Costs</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
              View your SaaS subscription costs and usage
            </p>
          </div>
        </div>

        {/* Error Card */}
        <Card className="border border-amber-300 bg-amber-50 rounded-xl">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 text-sm sm:text-base">{error}</h3>
                <p className="text-xs sm:text-sm text-amber-800 mt-1">
                  {error.includes("API key") ? (
                    <>
                      Please complete organization onboarding in{" "}
                      <Link href={`/${orgSlug}/settings/onboarding`} className="underline hover:no-underline font-medium">
                        Settings &gt; Onboarding
                      </Link>{" "}
                      to enable subscription tracking.
                    </>
                  ) : (
                    "Please try again later or contact support if the issue persists."
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#007A78] flex-shrink-0">
            <Wallet className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Subscription Costs</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
              View your SaaS subscription costs and usage
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 text-xs sm:text-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
            <Button className="bg-[#007A78] text-white hover:bg-[#005F5D] text-xs sm:text-sm">
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Manage Providers</span>
              <span className="sm:hidden">Manage</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards - Two Rows: Light shades with visible borders */}
      {summary && (
        <div className="space-y-4 sm:space-y-5">
          {/* Row 1: Actual Costs - Light teal shades with borders */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Daily Cost */}
            <div className="bg-[#007A78]/5 border-2 border-[#007A78] rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Daily Cost</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(summary.total_daily_cost)}</p>
              <p className="text-xs text-gray-500 mt-1.5">Current daily rate</p>
            </div>

            {/* Month-to-Date */}
            <div className="bg-[#007A78]/5 border-2 border-[#007A78] rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Month-to-Date</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(summary.mtd_cost || summary.total_monthly_cost)}</p>
              <p className="text-xs text-gray-500 mt-1.5">Actual spent this month</p>
            </div>

            {/* Year-to-Date */}
            <div className="bg-[#007A78]/5 border-2 border-[#007A78] rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">YTD {new Date().getFullYear()}</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(summary.ytd_cost || 0)}</p>
              <p className="text-xs text-gray-500 mt-1.5">Jan 1 - today actual</p>
            </div>

            {/* Active Plans - Coral shade */}
            <div className="bg-[#FF6E50]/5 border-2 border-[#FF6E50] rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#FF6E50] flex items-center justify-center flex-shrink-0">
                  <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Active Plans</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">
                {summary.enabled_count} / {summary.total_count}
              </p>
              <p className="text-xs text-gray-500 mt-1.5">Subscriptions enabled</p>
            </div>
          </div>

          {/* Row 2: Forecasted Costs - Lighter shades with borders */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Monthly Forecast */}
            <div className="bg-[#007A78]/5 border-2 border-[#007A78]/60 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Monthly Forecast</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(summary.forecast_monthly_cost || summary.total_monthly_cost)}</p>
              <p className="text-xs text-gray-500 mt-1.5">Projected full month</p>
            </div>

            {/* Annual Forecast */}
            <div className="bg-[#007A78]/5 border-2 border-[#007A78]/60 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#007A78] flex items-center justify-center flex-shrink-0">
                  <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Annual {new Date().getFullYear()}</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(summary.forecast_annual_cost || summary.total_annual_cost)}</p>
              <p className="text-xs text-gray-500 mt-1.5">YTD + projected to Dec 31</p>
            </div>

            {/* Categories */}
            <div className="bg-[#FF6E50]/5 border-2 border-[#FF6E50]/60 rounded-xl p-4 sm:p-5 col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#FF6E50] flex items-center justify-center flex-shrink-0">
                  <List className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Categories</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{Object.keys(summary.count_by_category).length}</p>
              <p className="text-xs text-gray-500 mt-1.5">Active categories</p>
            </div>
          </div>
        </div>
      )}

      {/* Plans Table - Light shades with strong borders */}
      <Card className="border-2 border-[#007A78] bg-[#007A78]/5 rounded-xl overflow-hidden">
        <CardHeader className="border-b-2 border-[#007A78]/30 bg-[#007A78]/10 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#007A78] flex items-center justify-center">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-gray-900">All Subscriptions</CardTitle>
              <CardDescription className="text-xs sm:text-sm text-gray-600">
                View and manage all your SaaS subscriptions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {plans.length === 0 ? (
            <div className="text-center py-12 sm:py-16 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
              <div className="inline-flex p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-[#007A78]/10 to-[#FF6E50]/10 mb-3 sm:mb-4">
                <Wallet className="h-10 w-10 sm:h-12 sm:w-12 text-[#007A78]" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No subscriptions yet</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 max-w-md mx-auto">
                Enable providers from Integrations to start tracking your SaaS costs.
              </p>
              <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
                <Button className="bg-gradient-to-r from-[#007A78] to-[#005F5D] text-white hover:from-[#005F5D] hover:to-[#004544] text-sm transition-all">
                  <Plus className="h-4 w-4 mr-2" />
                  Enable Providers
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[900px]">
              <TableHeader>
                <TableRow className="border-b-2 border-[#007A78]/30 bg-[#007A78]/5">
                  <TableHead className="text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Status</TableHead>
                  <TableHead className="text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Plan</TableHead>
                  <TableHead className="text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Provider</TableHead>
                  <TableHead className="text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Category</TableHead>
                  <TableHead className="text-right text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Cost</TableHead>
                  <TableHead className="text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Billing</TableHead>
                  <TableHead className="text-right text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Seats</TableHead>
                  <TableHead className="text-right text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4 border-r-2 border-[#007A78]/20">Total</TableHead>
                  <TableHead className="text-right text-xs font-bold text-gray-700 uppercase tracking-wider px-4 py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const category = plan.category && plan.category.trim() !== "" ? plan.category : "other"
                  const CategoryIcon = CATEGORY_ICONS[category] || Wallet
                  const totalCost = getTotalCost(plan)
                  const isActive = plan.status === 'active' || plan.status === 'pending'
                  const isPending = plan.status === 'pending' || (plan.start_date && new Date(plan.start_date) > new Date())

                  // Map SaaS provider to integration page (only for LLM providers with API integrations)
                  const providerMapping: Record<string, string> = {
                    chatgpt_plus: "openai",
                    claude_pro: "anthropic",
                    gemini_advanced: "gemini",
                    copilot: "openai", // GitHub Copilot uses OpenAI models
                  }
                  const integrationPath = providerMapping[plan.provider_name]

                  // Status badge color mapping - CloudAct brand colors only
                  const statusColors: Record<string, string> = {
                    active: "bg-[#007A78] text-white border-0",
                    pending: "bg-[#FF6E50] text-white border-0",
                    cancelled: "bg-gray-400 text-white border-0",
                    expired: "bg-gray-500 text-white border-0"
                  }

                  return (
                    <TableRow key={plan.subscription_id} className={`border-b-2 border-[#007A78]/10 hover:bg-[#007A78]/5 transition-all ${!isActive ? "opacity-60 bg-gray-50" : ""}`}>
                      <TableCell className="px-4 py-4 border-r-2 border-[#007A78]/10">
                        <div className="flex flex-col gap-1.5">
                          <Badge
                            className={`capitalize text-xs font-semibold px-2.5 py-1 ${statusColors[plan.status] || statusColors.cancelled}`}
                          >
                            {plan.status}
                          </Badge>
                          {isPending && plan.start_date && (
                            <span className="text-xs text-[#FF6E50] font-semibold whitespace-nowrap">
                              Starts {format(new Date(plan.start_date), 'MMM d')}
                            </span>
                          )}
                          {plan.end_date && (
                            <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
                              Ends {format(new Date(plan.end_date), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 border-r-2 border-[#007A78]/10">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-[#007A78] flex-shrink-0">
                            <CategoryIcon className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-sm">{plan.display_name || plan.plan_name}</div>
                            <div className="text-xs text-gray-500">{plan.plan_name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 border-r-2 border-[#007A78]/10">
                        {integrationPath ? (
                          <Link href={`/${orgSlug}/settings/integrations/${integrationPath}`}>
                            <span className="text-gray-900 hover:text-[#007A78] hover:underline cursor-pointer flex items-center gap-1 font-semibold text-sm transition-colors">
                              {plan.provider_name}
                              <ArrowUpRight className="h-3.5 w-3.5 text-[#007A78]" />
                            </span>
                          </Link>
                        ) : (
                          <Link href={`/${orgSlug}/subscriptions/${plan.provider_name}`}>
                            <span className="text-gray-900 hover:text-[#007A78] hover:underline cursor-pointer flex items-center gap-1 font-semibold text-sm transition-colors">
                              {plan.provider_name}
                              <ArrowUpRight className="h-3.5 w-3.5 text-[#007A78]" />
                            </span>
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 border-r-2 border-[#007A78]/10">
                        <Badge
                          className={`capitalize text-xs font-semibold px-2.5 py-1 border-2 ${CATEGORY_COLORS[category]}`}
                        >
                          {category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-gray-900 px-4 py-4 border-r-2 border-[#007A78]/10">
                        <div className="whitespace-nowrap">
                          {formatCurrency(plan.unit_price_usd ?? 0)}
                          {plan.pricing_model && (
                            <div className="text-xs text-gray-500 font-medium">
                              {plan.pricing_model === 'PER_SEAT' ? '/seat' : 'flat fee'}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 border-r-2 border-[#007A78]/10">
                        <Badge className="capitalize text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-300 whitespace-nowrap">
                          {formatBillingCycle(plan.billing_cycle)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-4 py-4 border-r-2 border-[#007A78]/10">
                        {plan.seats ? (
                          <div className="flex items-center justify-end gap-1.5 text-gray-900 font-bold text-sm">
                            <Users className="h-4 w-4 text-[#007A78]" />
                            <span>{plan.seats}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 font-medium">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right px-4 py-4 border-r-2 border-[#007A78]/10 bg-[#FF6E50]/5">
                        <span className={`whitespace-nowrap ${isActive ? "text-gray-900 font-bold text-lg" : "text-gray-400 font-semibold"}`}>
                          {formatCurrency(totalCost)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right px-4 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/${orgSlug}/subscriptions/${plan.provider_name}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 sm:h-9 sm:w-9 text-[#007A78] hover:bg-[#007A78] hover:text-white transition-all rounded-lg border border-[#007A78]/30"
                              title="Edit plan"
                            >
                              <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                          </Link>
                          <Link href={`/${orgSlug}/subscriptions/${plan.provider_name}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 sm:h-9 sm:w-9 text-[#FF6E50] hover:bg-[#FF6E50] hover:text-white transition-all rounded-lg border border-[#FF6E50]/30"
                              title="End subscription"
                            >
                              <CalendarX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
