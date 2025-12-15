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
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/i18n"

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

// Category colors - Teal family for categories (NOT coral)
const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-[#007A78]/12 text-[#007A78] border-0",
  design: "bg-[#14B8A6]/12 text-[#14B8A6] border-0",
  productivity: "bg-[#005F5D]/12 text-[#005F5D] border-0",
  communication: "bg-[#007A78]/10 text-[#007A78] border-0",
  development: "bg-[#14B8A6]/10 text-[#14B8A6] border-0",
  cloud: "bg-[#005F5D]/10 text-[#005F5D] border-0",
  other: "bg-[#8E8E93]/12 text-[#8E8E93] border-0",
}

type PlanWithProvider = SubscriptionPlan & { provider_name: string }

export default function SubscriptionsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [plans, setPlans] = useState<PlanWithProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>("USD")
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

  // Summary: costs from pipeline data (cost_data_standard_1_2 table) - no fallback
  // Pipeline must run to populate costs. Plan summary provides metadata (counts, categories)
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
    : planSummary
      ? {
          total_daily_cost: 0,
          total_monthly_cost: 0,
          total_annual_cost: 0,
          ytd_cost: 0,
          mtd_cost: 0,
          forecast_monthly_cost: 0,
          forecast_annual_cost: 0,
          count_by_category: planSummary.count_by_category,
          enabled_count: planSummary.enabled_count,
          total_count: planSummary.total_count,
        }
      : null

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch both plan details and actual costs in parallel - OPTIMIZED
      // Both API calls run simultaneously to minimize loading time
      const supabase = createClient()
      const [plansResult, costsResult, orgResult] = await Promise.all([
        getAllPlansForCostDashboard(orgSlug),
        getSaaSSubscriptionCosts(orgSlug),
        supabase
          .from("organizations")
          .select("default_currency")
          .eq("org_slug", orgSlug)
          .single(),
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

      // Load org's default currency
      if (orgResult.data?.default_currency) {
        setOrgCurrency(orgResult.data.default_currency)
      }
    } catch (err) {
      // Handle unexpected errors during parallel fetching
      console.error("Error loading subscription data:", err)
      setError("Failed to load subscription data. Please try again.")
      setPlans([])
      setPlanSummary(null)
      setCostSummary(null)
    } finally {
      setIsLoading(false)
    }
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
      <div className="space-y-6 sm:space-y-8">
        {/* Header - Apple Health Style */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Subscription Costs</h1>
            <p className="text-[15px] text-[#8E8E93] mt-1">
              View your SaaS subscription costs and usage
            </p>
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton count={4} showDescription />
        </div>

        {/* Table Skeleton */}
        <div className="metric-card p-0 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5">
            <h2 className="text-[17px] font-semibold text-black">All Subscriptions</h2>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">
              View and manage all your SaaS subscriptions
            </p>
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            <TableSkeleton rows={8} columns={8} />
          </div>
        </div>
      </div>
    )
  }

  // Show error state if API key is missing or other error
  if (error) {
    return (
      <div className="space-y-6 sm:space-y-8">
        {/* Header - Apple Health Style */}
        <div>
          <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Subscription Costs</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">
            View your SaaS subscription costs and usage
          </p>
        </div>

        {/* Error Card - Apple Health Style */}
        <div className="metric-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-black text-[15px]">{error}</h3>
              <p className="text-[13px] text-[#8E8E93] mt-1">
                {error.includes("API key") ? (
                  <>
                    Please complete organization onboarding in{" "}
                    <Link href={`/${orgSlug}/settings/onboarding`} className="text-[#007A78] hover:underline font-medium">
                      Settings → Onboarding
                    </Link>{" "}
                    to enable subscription tracking.
                  </>
                ) : (
                  "Please try again later or contact support if the issue persists."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header - Apple Health Style */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Subscription Costs</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">
            View your SaaS subscription costs and usage
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            variant="ghost"
            size="sm"
            className="h-[36px] px-4 text-[15px] text-[#8E8E93] hover:bg-[#F5F5F7] rounded-xl"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
            <Button className="h-[36px] px-4 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Manage Providers</span>
              <span className="sm:hidden">Manage</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards - Apple Health Style Pinned Cards */}
      {summary && (
        <div className="space-y-6">
          <h2 className="text-[22px] font-bold text-black">Cost Summary</h2>
          {/* Row 1: Actual Costs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Daily Cost */}
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral">
                  <DollarSign className="h-[18px] w-[18px]" />
                  <span>Daily Cost</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.total_daily_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Current daily rate</div>
              </div>
            </div>

            {/* Month-to-Date */}
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral">
                  <Calendar className="h-[18px] w-[18px]" />
                  <span>Month-to-Date</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.mtd_cost || summary.total_monthly_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Actual spent this month</div>
              </div>
            </div>

            {/* Year-to-Date */}
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-dark">
                  <TrendingUp className="h-[18px] w-[18px]" />
                  <span>YTD {new Date().getFullYear()}</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.ytd_cost || 0, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Jan 1 - today actual</div>
              </div>
            </div>

            {/* Active Plans */}
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral">
                  <Wallet className="h-[18px] w-[18px]" />
                  <span>Active Plans</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">
                  {summary.enabled_count}<span className="text-[#8E8E93] text-[18px] font-normal"> / {summary.total_count}</span>
                </div>
                <div className="metric-card-description mt-1">Subscriptions enabled</div>
              </div>
            </div>
          </div>

          {/* Row 2: Forecasted Costs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Monthly Forecast */}
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-light">
                  <TrendingUp className="h-[18px] w-[18px]" />
                  <span>Monthly Forecast</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.forecast_monthly_cost || summary.total_monthly_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">Projected full month</div>
              </div>
            </div>

            {/* Annual Forecast */}
            <div className="metric-card">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-coral-dark">
                  <ArrowUpRight className="h-[18px] w-[18px]" />
                  <span>Annual {new Date().getFullYear()}</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{formatCurrency(summary.forecast_annual_cost || summary.total_annual_cost, orgCurrency)}</div>
                <div className="metric-card-description mt-1">YTD + projected to Dec 31</div>
              </div>
            </div>

            {/* Categories */}
            <div className="metric-card col-span-2 lg:col-span-1">
              <div className="metric-card-header">
                <div className="metric-card-label metric-card-label-neutral">
                  <List className="h-[18px] w-[18px]" />
                  <span>Categories</span>
                </div>
              </div>
              <div className="metric-card-content">
                <div className="metric-card-value">{Object.keys(summary.count_by_category).length}</div>
                <div className="metric-card-description mt-1">Active categories</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans Table - Apple Health Style */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-4">All Subscriptions</h2>
        <div className="metric-card p-0 overflow-hidden">
          {plans.length === 0 ? (
            <div className="text-center py-12 sm:py-16 px-4 sm:px-6">
              <div className="inline-flex p-4 rounded-2xl bg-[#007A78]/10 mb-4">
                <Wallet className="h-12 w-12 text-[#007A78]" />
              </div>
              <h3 className="text-[20px] font-semibold text-black mb-2">No subscriptions yet</h3>
              <p className="text-[15px] text-[#8E8E93] mb-6 max-w-md mx-auto">
                Enable providers from Integrations to start tracking your SaaS costs.
              </p>
              <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
                <Button className="h-[44px] px-6 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold shadow-sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Enable Providers
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[900px]">
              <TableHeader>
                <TableRow className="border-b border-[#E5E5EA]">
                  <TableHead className="console-table-header">Status</TableHead>
                  <TableHead className="console-table-header">Plan</TableHead>
                  <TableHead className="console-table-header">Provider</TableHead>
                  <TableHead className="console-table-header">Category</TableHead>
                  <TableHead className="console-table-header text-right">Cost</TableHead>
                  <TableHead className="console-table-header">Billing</TableHead>
                  <TableHead className="console-table-header text-right">Seats</TableHead>
                  <TableHead className="console-table-header text-right">Total</TableHead>
                  <TableHead className="console-table-header text-right">Actions</TableHead>
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

                  // Status badge color mapping - CloudAct Design System
                  const statusColors: Record<string, string> = {
                    active: "bg-[#F0FDFA] text-[#007A78] border-0",
                    pending: "bg-[#FF6E50]/10 text-[#FF6E50] border-0",
                    cancelled: "bg-[#8E8E93]/12 text-[#8E8E93] border-0",
                    expired: "bg-[#FF6E50]/10 text-[#E55A3C] border-0"
                  }

                  return (
                    <TableRow key={plan.subscription_id} className={`console-table-row ${!isActive ? "opacity-60" : ""}`}>
                      <TableCell className="console-table-cell">
                        <div className="flex flex-col gap-1.5">
                          <Badge
                            className={`capitalize text-[11px] font-semibold px-2.5 py-1 ${statusColors[plan.status] || statusColors.cancelled}`}
                          >
                            {plan.status}
                          </Badge>
                          {isPending && plan.start_date && (
                            <span className="text-[11px] text-[#FF6E50] font-medium whitespace-nowrap">
                              Starts {format(new Date(plan.start_date), 'MMM d')}
                            </span>
                          )}
                          {plan.end_date && (
                            <span className="text-[11px] text-[#8E8E93] font-medium whitespace-nowrap">
                              Ends {format(new Date(plan.end_date), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="console-table-cell">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="font-semibold text-black text-[15px]">{plan.display_name || plan.plan_name}</div>
                            <div className="text-[13px] text-[#8E8E93]">{plan.plan_name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="console-table-cell">
                        {integrationPath ? (
                          <Link href={`/${orgSlug}/settings/integrations/${integrationPath}`}>
                            <span className="text-[#007A78] hover:underline cursor-pointer flex items-center gap-1 font-medium text-[15px] transition-colors">
                              {plan.provider_name}
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </span>
                          </Link>
                        ) : (
                          <Link href={`/${orgSlug}/subscriptions/${plan.provider_name}`}>
                            <span className="text-[#007A78] hover:underline cursor-pointer flex items-center gap-1 font-medium text-[15px] transition-colors">
                              {plan.provider_name}
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </span>
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="console-table-cell">
                        <Badge
                          className={`capitalize text-[11px] font-semibold px-2.5 py-1 ${CATEGORY_COLORS[category]}`}
                        >
                          {category}
                        </Badge>
                      </TableCell>
                      <TableCell className="console-table-cell text-right">
                        <div className="whitespace-nowrap">
                          <span className="font-semibold text-black text-[15px]">{formatCurrency(plan.unit_price_usd ?? 0, orgCurrency)}</span>
                          {plan.pricing_model && (
                            <div className="text-[11px] text-[#8E8E93] font-medium">
                              {plan.pricing_model === 'PER_SEAT' ? '/seat' : 'flat fee'}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="console-table-cell">
                        <Badge className="capitalize text-[11px] font-semibold px-2.5 py-1 bg-[#F5F5F7] text-[#8E8E93] border-0 whitespace-nowrap">
                          {formatBillingCycle(plan.billing_cycle)}
                        </Badge>
                      </TableCell>
                      <TableCell className="console-table-cell text-right">
                        {plan.seats ? (
                          <div className="flex items-center justify-end gap-1.5 text-black font-semibold text-[15px]">
                            <Users className="h-4 w-4 text-[#FF6E50]" />
                            <span>{plan.seats}</span>
                          </div>
                        ) : (
                          <span className="text-[#C7C7CC] font-medium">-</span>
                        )}
                      </TableCell>
                      <TableCell className="console-table-cell text-right">
                        <span className={`whitespace-nowrap ${isActive ? "text-black font-bold text-[17px]" : "text-[#C7C7CC] font-medium"}`}>
                          {formatCurrency(totalCost, orgCurrency)}
                        </span>
                      </TableCell>
                      <TableCell className="console-table-cell text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/${orgSlug}/subscriptions/${plan.provider_name}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 text-[#007A78] hover:bg-[#007A78]/10 transition-all rounded-lg"
                              title="Edit plan"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/${orgSlug}/subscriptions/${plan.provider_name}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 text-[#8E8E93] hover:text-[#FF6E50] hover:bg-[#FF6E50]/10 transition-all rounded-lg"
                              title="End subscription"
                            >
                              <CalendarX className="h-4 w-4" />
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
        </div>
      </div>
    </div>
  )
}
