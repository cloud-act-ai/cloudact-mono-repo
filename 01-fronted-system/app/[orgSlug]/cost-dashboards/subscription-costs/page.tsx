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
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Hash,
  CalendarDays,
  Tag,
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

// Category colors - CloudAct Standard (Teal/Coral/Neutral)
const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-[#007A78]/10 text-[#007A78] border border-[#007A78]/10",
  design: "bg-[#007A78]/5 text-[#007A78] border border-[#007A78]/10",
  productivity: "bg-[#F0FDFA] text-[#007A78] border border-[#007A78]/10",
  communication: "bg-[#007A78]/5 text-[#005F5D] border border-[#007A78]/10",
  development: "bg-[#F0FDFA] text-[#005F5D] border border-[#007A78]/10",
  cloud: "bg-[#007A78]/10 text-[#007A78] border border-[#007A78]/10",
  other: "bg-[#F5F5F7] text-[#8E8E93] border border-[#E5E5EA]",
}

type PlanWithProvider = SubscriptionPlan & { provider_name: string }

export default function SubscriptionCostsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [plans, setPlans] = useState<PlanWithProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>("USD")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [planSummary, setPlanSummary] = useState<{
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  } | null>(null)
  const [costSummary, setCostSummary] = useState<SaaSCostSummary | null>(null)

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

      if (costsResult.success && costsResult.summary) {
        setCostSummary(costsResult.summary)
      } else {
        setCostSummary(null)
      }

      if (orgResult.data?.default_currency) {
        setOrgCurrency(orgResult.data.default_currency)
      }
    } catch (err) {
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

  const getTotalCost = (plan: PlanWithProvider): number => {
    const basePrice = plan.unit_price ?? 0
    if (plan.pricing_model === 'PER_SEAT' && plan.seats) {
      return basePrice * plan.seats
    }
    return basePrice
  }

  const toggleRowExpansion = (subscriptionId: string) => {
    setExpandedRow(expandedRow === subscriptionId ? null : subscriptionId)
  }

  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Subscription Costs</h1>
            <p className="text-[15px] text-[#8E8E93] mt-1">
              View your SaaS subscription costs and usage
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton count={4} showDescription />
        </div>

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

  if (error) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Subscription Costs</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">
            View your SaaS subscription costs and usage
          </p>
        </div>

        <div className="metric-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-black text-[15px]">{error}</h3>
              <p className="text-[13px] text-[#8E8E93] mt-1">
                {error.includes("API key") ? (
                  <>
                    Please complete organization onboarding in{" "}
                    <Link href={`/${orgSlug}/settings/organization`} className="text-[#007A78] hover:underline font-medium">
                      Settings → Organization
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
          <Link href={`/${orgSlug}/integrations/subscriptions`}>
            <Button className="h-[36px] px-4 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Manage Providers</span>
              <span className="sm:hidden">Manage</span>
            </Button>
          </Link>
        </div>
      </div>

      {summary && (
        <div className="space-y-6">
          <h2 className="text-[22px] font-bold text-black">Cost Summary</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
              <Link href={`/${orgSlug}/integrations/subscriptions`}>
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
                  <TableHead className="console-table-header w-10"></TableHead>
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
                  const isExpanded = expandedRow === plan.subscription_id

                  const providerMapping: Record<string, string> = {
                    chatgpt_plus: "openai",
                    claude_pro: "anthropic",
                    gemini_advanced: "gemini",
                    copilot: "openai",
                  }
                  const integrationPath = providerMapping[plan.provider_name]

                  const statusColors: Record<string, string> = {
                    active: "bg-[#F0FDFA] text-[#007A78] border border-[#007A78]/10",
                    pending: "bg-[#007A78]/5 text-[#007A78] border border-[#007A78]/10",
                    cancelled: "bg-[#F5F5F7] text-[#8E8E93] border border-[#E5E5EA]",
                    expired: "bg-[#FF6E50]/10 text-[#FF6E50] border border-[#FF6E50]/10"
                  }

                  return (
                    <React.Fragment key={plan.subscription_id}>
                      <TableRow
                        className={`console-table-row cursor-pointer hover:bg-[#F5F5F7]/50 ${!isActive ? "opacity-60" : ""}`}
                        onClick={() => toggleRowExpansion(plan.subscription_id)}
                      >
                        <TableCell className="console-table-cell">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-[#8E8E93]" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-[#C7C7CC]" />
                          )}
                        </TableCell>
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
                        <TableCell className="console-table-cell" onClick={(e) => e.stopPropagation()}>
                          {integrationPath ? (
                            <Link href={`/${orgSlug}/integrations/llm`}>
                              <span className="text-[#007A78] hover:underline cursor-pointer flex items-center gap-1 font-medium text-[15px] transition-colors">
                                {plan.provider_name}
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </span>
                            </Link>
                          ) : (
                            <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
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
                            <span className="font-semibold text-black text-[15px]">{formatCurrency(plan.unit_price ?? 0, orgCurrency)}</span>
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
                        <TableCell className="console-table-cell text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 text-[#007A78] hover:bg-[#007A78]/10 transition-all rounded-lg"
                                title="Edit plan"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
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

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <TableRow className="bg-[#F5F5F7]/50">
                          <TableCell colSpan={10} className="px-4 sm:px-6 py-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {/* Subscription ID */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#007A78]/10">
                                  <Hash className="h-4 w-4 text-[#007A78]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">Subscription ID</p>
                                  <p className="text-[13px] font-mono text-black mt-0.5 break-all">{plan.subscription_id}</p>
                                </div>
                              </div>

                              {/* Start Date */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#007A78]/10">
                                  <CalendarDays className="h-4 w-4 text-[#007A78]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">Start Date</p>
                                  <p className="text-[13px] font-semibold text-black mt-0.5">
                                    {plan.start_date ? format(new Date(plan.start_date), 'MMM d, yyyy') : '-'}
                                  </p>
                                </div>
                              </div>

                              {/* Renewal Date */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#FF6E50]/10">
                                  <Clock className="h-4 w-4 text-[#FF6E50]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">Renewal Date</p>
                                  <p className="text-[13px] font-semibold text-black mt-0.5">
                                    {plan.renewal_date ? format(new Date(plan.renewal_date), 'MMM d, yyyy') : '-'}
                                  </p>
                                </div>
                              </div>

                              {/* End Date */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#8E8E93]/10">
                                  <CalendarX className="h-4 w-4 text-[#8E8E93]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">End Date</p>
                                  <p className="text-[13px] font-semibold text-black mt-0.5">
                                    {plan.end_date ? format(new Date(plan.end_date), 'MMM d, yyyy') : 'Active'}
                                  </p>
                                </div>
                              </div>

                              {/* Pricing Model */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#007A78]/10">
                                  <CreditCard className="h-4 w-4 text-[#007A78]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">Pricing Model</p>
                                  <p className="text-[13px] font-semibold text-black mt-0.5">
                                    {plan.pricing_model === 'PER_SEAT' ? 'Per Seat' : 'Flat Fee'}
                                  </p>
                                </div>
                              </div>

                              {/* Currency */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#007A78]/10">
                                  <DollarSign className="h-4 w-4 text-[#007A78]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">Currency</p>
                                  <p className="text-[13px] font-semibold text-black mt-0.5">{plan.currency || orgCurrency}</p>
                                </div>
                              </div>

                              {/* Category */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#007A78]/10">
                                  <Tag className="h-4 w-4 text-[#007A78]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">Category</p>
                                  <p className="text-[13px] font-semibold text-black mt-0.5 capitalize">{category}</p>
                                </div>
                              </div>

                              {/* Monthly Cost Breakdown */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <div className="p-2 rounded-lg bg-[#FF6E50]/10">
                                  <TrendingUp className="h-4 w-4 text-[#FF6E50]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide">Monthly Cost</p>
                                  <p className="text-[13px] font-semibold text-black mt-0.5">
                                    {formatCurrency(totalCost, orgCurrency)}
                                    {plan.seats && plan.seats > 1 && (
                                      <span className="text-[11px] text-[#8E8E93] font-normal ml-1">
                                        ({plan.seats} × {formatCurrency(plan.unit_price ?? 0, orgCurrency)})
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Description if available */}
                            {plan.description && (
                              <div className="mt-4 p-3 bg-white rounded-xl border border-[#E5E5EA]">
                                <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1">Description</p>
                                <p className="text-[13px] text-black">{plan.description}</p>
                              </div>
                            )}

                            {/* Quick Actions */}
                            <div className="mt-4 flex items-center gap-3">
                              <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
                                <Button
                                  size="sm"
                                  className="h-[36px] px-4 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[13px] font-semibold"
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Edit Plan
                                </Button>
                              </Link>
                              <Link href={`/${orgSlug}/pipelines/subscription-runs`}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-[36px] px-4 rounded-xl text-[13px] font-medium border-[#E5E5EA] text-[#8E8E93] hover:bg-[#F5F5F7]"
                                >
                                  View Pipeline Runs
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
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
