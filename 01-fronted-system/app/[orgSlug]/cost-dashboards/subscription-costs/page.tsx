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
  Sparkles,
  TrendingDown,
  Zap,
  Target,
} from "lucide-react"
import { format, differenceInDays, addMonths } from "date-fns"

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
import { DEFAULT_CURRENCY } from "@/lib/i18n/constants"

// SaaS provider logos and metadata
const SAAS_PROVIDERS = [
  { name: "Slack", category: "communication", color: "#4A154B" },
  { name: "Notion", category: "productivity", color: "#000000" },
  { name: "Figma", category: "design", color: "#F24E1E" },
  { name: "GitHub", category: "development", color: "#181717" },
  { name: "Linear", category: "productivity", color: "#5E6AD2" },
  { name: "Vercel", category: "cloud", color: "#000000" },
  { name: "ChatGPT", category: "ai", color: "#10A37F" },
  { name: "Claude", category: "ai", color: "#D97757" },
  { name: "Stripe", category: "other", color: "#635BFF" },
  { name: "Supabase", category: "cloud", color: "#3ECF8E" },
  { name: "Google Workspace", category: "productivity", color: "#4285F4" },
  { name: "Zoom", category: "communication", color: "#2D8CFF" },
]

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

// Category colors - CloudAct Standard (Dark green text #1a7a3a for readability)
const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/20",
  design: "bg-[var(--cloudact-blue)]/10 text-[var(--cloudact-blue)] border border-[var(--cloudact-blue)]/20",
  productivity: "bg-[var(--cloudact-mint)]/15 text-[#1a7a3a] border border-[var(--cloudact-mint)]/30",
  communication: "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/20",
  development: "bg-[var(--cloudact-blue)]/10 text-[var(--cloudact-blue)] border border-[var(--cloudact-blue)]/20",
  cloud: "bg-[var(--cloudact-mint)]/15 text-[#1a7a3a] border border-[var(--cloudact-mint)]/30",
  other: "bg-slate-100 text-slate-600 border border-slate-200",
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  ai: "from-[var(--cloudact-mint)]/20 to-[var(--cloudact-mint-dark)]/5",
  design: "from-[var(--cloudact-coral)]/20 to-[var(--cloudact-coral)]/5",
  productivity: "from-[var(--cloudact-mint)]/15 to-transparent",
  communication: "from-[var(--cloudact-coral)]/15 to-transparent",
  development: "from-[var(--cloudact-mint)]/20 to-[var(--cloudact-mint-dark)]/5",
  cloud: "from-[var(--cloudact-coral)]/20 to-[var(--cloudact-coral)]/5",
  other: "from-slate-200/50 to-transparent",
}

type PlanWithProvider = SubscriptionPlan & { provider_name: string }

export default function SubscriptionCostsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [plans, setPlans] = useState<PlanWithProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)
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
          .select("locale_currency")
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

      if (orgResult.data?.locale_currency) {
        setOrgCurrency(orgResult.data.locale_currency)
      }
    } catch {
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

  // Calculate savings opportunities
  const calculateSavingsOpportunities = () => {
    const opportunities = []

    // Find subscriptions renewing soon
    const renewingSoon = plans.filter(p => {
      if (!p.renewal_date || p.status !== 'active') return false
      const daysUntilRenewal = differenceInDays(new Date(p.renewal_date), new Date())
      return daysUntilRenewal >= 0 && daysUntilRenewal <= 30
    })

    if (renewingSoon.length > 0) {
      opportunities.push({
        type: 'renewal',
        title: `${renewingSoon.length} subscription${renewingSoon.length > 1 ? 's' : ''} renewing soon`,
        description: 'Review before auto-renewal',
        icon: Clock,
        color: 'coral',
        count: renewingSoon.length,
      })
    }

    // Find unused seats (seats but low usage indicator would require usage data)
    const seatedPlans = plans.filter(p => p.status === 'active' && p.seats && p.seats > 5)
    if (seatedPlans.length > 0) {
      opportunities.push({
        type: 'seats',
        title: `${seatedPlans.length} plan${seatedPlans.length > 1 ? 's' : ''} with multi-seat pricing`,
        description: 'Review seat utilization',
        icon: Users,
        color: 'teal',
        count: seatedPlans.length,
      })
    }

    return opportunities
  }

  const savingsOpportunities = calculateSavingsOpportunities()

  // Group plans by category for breakdown
  const categoryBreakdown = plans.reduce((acc, plan) => {
    if (plan.status !== 'active') return acc
    const category = plan.category || 'other'
    if (!acc[category]) {
      acc[category] = { count: 0, totalCost: 0, plans: [] }
    }
    acc[category].count++
    acc[category].totalCost += getTotalCost(plan)
    acc[category].plans.push(plan)
    return acc
  }, {} as Record<string, { count: number; totalCost: number; plans: PlanWithProvider[] }>)

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            Subscription Costs
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
            Track your SaaS and subscription spending
          </p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--cloudact-mint-text)]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            Subscription Costs
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
            Track your SaaS and subscription spending
          </p>
        </div>

        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">{error}</h3>
              <p className="text-[13px] text-slate-600 mt-0.5">
                {error.includes("API key") ? (
                  <>
                    Please complete organization onboarding in{" "}
                    <Link href={`/${orgSlug}/settings/organization`} className="text-[var(--cloudact-blue)] hover:text-[#0056B3] font-medium">
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
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero Section with Provider Logos Grid */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--cloudact-mint)] via-[var(--cloudact-mint-dark)] to-[var(--cloudact-mint-dark)] p-8 sm:p-10">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--cloudact-coral)]/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-2xl"></div>

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <Badge className="bg-[var(--cloudact-coral)] text-white border-0 px-3 py-1 text-[11px] font-semibold">
                  SaaS Analytics
                </Badge>
              </div>
              <h1 className="text-[36px] sm:text-[42px] font-bold text-white tracking-tight mb-2">
                Subscription Costs
              </h1>
              <p className="text-[17px] text-white/80 max-w-2xl">
                Track and optimize your SaaS spending across all tools
              </p>

              {/* Quick Stats */}
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                    <div className="text-[13px] text-white/70 font-medium mb-1">Monthly</div>
                    <div className="text-[24px] font-bold text-white">{formatCurrency(summary.total_monthly_cost, orgCurrency)}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                    <div className="text-[13px] text-white/70 font-medium mb-1">Active</div>
                    <div className="text-[24px] font-bold text-white">{summary.enabled_count}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                    <div className="text-[13px] text-white/70 font-medium mb-1">Categories</div>
                    <div className="text-[24px] font-bold text-white">{Object.keys(summary.count_by_category).length}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                    <div className="text-[13px] text-white/70 font-medium mb-1">YTD {new Date().getFullYear()}</div>
                    <div className="text-[24px] font-bold text-white">{formatCurrency(summary.ytd_cost || 0, orgCurrency)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                variant="ghost"
                className="h-11 px-4 text-[15px] bg-white/10 text-white hover:bg-white/20 border border-white/20 rounded-xl backdrop-blur-sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Link href={`/${orgSlug}/integrations/subscriptions`}>
                <Button className="bg-white text-[#000000] hover:bg-white/90 h-11 px-4 rounded-xl text-[15px] font-semibold shadow-lg">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Add Provider</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Provider Logos Showcase */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="text-[13px] text-white/60 font-medium mb-4">POPULAR SAAS PROVIDERS</div>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-3">
              {SAAS_PROVIDERS.map((provider) => (
                <div
                  key={provider.name}
                  className="aspect-square bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center p-3 border border-white/10 hover:bg-white/20 transition-all group"
                  title={provider.name}
                >
                  <div className="w-full h-full rounded-lg bg-white/90 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <span className="text-[10px] font-bold text-slate-700">{provider.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cost Breakdown by Category */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">Cost Breakdown by Category</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(categoryBreakdown)
              .sort((a, b) => b[1].totalCost - a[1].totalCost)
              .map(([category, data]) => {
                const CategoryIcon = CATEGORY_ICONS[category] || Wallet
                const percentage = summary ? (data.totalCost / summary.total_monthly_cost) * 100 : 0
                return (
                  <div
                    key={category}
                    className="metric-card group hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${CATEGORY_GRADIENTS[category]} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                    <div className="relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-xl ${CATEGORY_COLORS[category]}`}>
                          <CategoryIcon className="h-5 w-5" />
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-muted-foreground font-medium mb-0.5">
                            {data.count} {data.count === 1 ? 'subscription' : 'subscriptions'}
                          </div>
                          <div className="text-[13px] font-semibold text-[#1a7a3a]">
                            {percentage.toFixed(1)}% of total
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-[15px] font-semibold text-slate-900 capitalize">{category}</h3>
                        <div className="text-[28px] font-bold text-slate-900 tracking-tight">
                          {formatCurrency(data.totalCost, orgCurrency)}
                        </div>
                        <div className="text-[13px] text-muted-foreground">per month</div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] rounded-full transition-all"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Savings Opportunities */}
      {savingsOpportunities.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">Savings Opportunities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savingsOpportunities.map((opportunity, idx) => {
              const Icon = opportunity.icon
              return (
                <div
                  key={idx}
                  className="metric-card bg-gradient-to-br from-white to-[var(--cloudact-coral)]/5 border-l-4 border-[var(--cloudact-coral)] hover:shadow-xl transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-[var(--cloudact-coral)]/10 group-hover:bg-[var(--cloudact-coral)]/20 transition-colors">
                      <Icon className="h-6 w-6 text-[var(--cloudact-coral)]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-[var(--cloudact-coral)] text-white border-0 px-2 py-0.5 text-[11px] font-semibold">
                          {opportunity.count}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                          Action Required
                        </span>
                      </div>
                      <h3 className="text-[15px] font-semibold text-slate-900 mb-1">{opportunity.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{opportunity.description}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detailed Cost Metrics */}
      {summary && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">Detailed Metrics</h2>
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
          </div>
        </div>
      )}

      {/* Subscription Renewal Timeline */}
      {plans.filter(p => p.status === 'active' && p.renewal_date).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">Upcoming Renewals</h2>
          <div className="metric-card p-6">
            <div className="space-y-4">
              {plans
                .filter(p => p.status === 'active' && p.renewal_date)
                .sort((a, b) => new Date(a.renewal_date!).getTime() - new Date(b.renewal_date!).getTime())
                .slice(0, 5)
                .map((plan) => {
                  const daysUntilRenewal = differenceInDays(new Date(plan.renewal_date!), new Date())
                  const isUrgent = daysUntilRenewal <= 7
                  return (
                    <div
                      key={plan.subscription_id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`p-2.5 rounded-lg ${isUrgent ? 'bg-[var(--cloudact-coral)]/10' : 'bg-[var(--cloudact-mint)]/10'}`}>
                          <CalendarDays className={`h-5 w-5 ${isUrgent ? 'text-[var(--cloudact-coral)]' : 'text-[var(--cloudact-mint-text)]'}`} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-[15px]">{plan.display_name || plan.plan_name}</div>
                          <div className="text-[13px] text-muted-foreground">{plan.provider_name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[15px] font-bold ${isUrgent ? 'text-[var(--cloudact-coral)]' : 'text-[var(--cloudact-mint-text)]'}`}>
                          {daysUntilRenewal === 0 ? 'Today' : daysUntilRenewal === 1 ? 'Tomorrow' : `${daysUntilRenewal} days`}
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          {format(new Date(plan.renewal_date!), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <div className="ml-6 text-right">
                        <div className="text-[17px] font-bold text-slate-900">{formatCurrency(getTotalCost(plan), orgCurrency)}</div>
                        <div className="text-[11px] text-muted-foreground">{formatBillingCycle(plan.billing_cycle)}</div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* All Subscriptions Table */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">All Subscriptions</h2>
        <div className="metric-card p-0 overflow-hidden">
          {/* Empty State */}
          {plans.length === 0 && (
            <div className="text-center py-12 sm:py-16 px-4 sm:px-6">
              <div className="inline-flex p-4 rounded-2xl bg-[var(--cloudact-mint)]/10 mb-4">
                <Wallet className="h-12 w-12 text-[var(--cloudact-mint-text)]" />
              </div>
              <h3 className="text-[20px] font-semibold text-slate-900 mb-2">No subscriptions yet</h3>
              <p className="text-[15px] text-muted-foreground mb-6 max-w-md mx-auto">
                Enable providers from Integrations to start tracking your SaaS costs.
              </p>
              <Link href={`/${orgSlug}/integrations/subscriptions`}>
                <Button className="console-button-primary h-11 px-6 rounded-xl text-[15px] font-semibold shadow-sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Enable Providers
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile card view */}
          {plans.length > 0 && (
            <div className="md:hidden divide-y divide-[#E5E5EA]">
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
                  active: "bg-[var(--cloudact-mint-light)] text-[var(--cloudact-mint-text)] border border-[var(--cloudact-mint)]/10",
                  pending: "bg-[var(--cloudact-mint)]/5 text-[var(--cloudact-mint-text)] border border-[var(--cloudact-mint)]/10",
                  cancelled: "bg-[var(--cloudact-mint)]/5 text-muted-foreground border border-border",
                  expired: "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/10"
                }

                return (
                  <div key={plan.subscription_id} className={!isActive ? "opacity-60" : ""}>
                    <button
                      onClick={() => toggleRowExpansion(plan.subscription_id)}
                      className="w-full p-4 text-left touch-manipulation hover:bg-[var(--cloudact-mint)]/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge
                              className={`capitalize text-[11px] font-semibold px-2 py-0.5 ${statusColors[plan.status] || statusColors.cancelled}`}
                            >
                              {plan.status}
                            </Badge>
                            <Badge
                              className={`capitalize text-[11px] font-semibold px-2 py-0.5 ${CATEGORY_COLORS[category]}`}
                            >
                              {category}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-slate-900 text-[15px] truncate">
                            {plan.display_name || plan.plan_name}
                          </h3>
                          <p className="text-[13px] text-muted-foreground mt-0.5">{plan.provider_name}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`font-bold text-[17px] ${isActive ? "text-slate-900" : "text-[#C7C7CC]"}`}>
                            {formatCurrency(totalCost, orgCurrency)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            billed {formatBillingCycle(plan.billing_cycle).toLowerCase()}
                          </div>
                          {plan.seats && (
                            <div className="flex items-center justify-end gap-1 mt-1 text-[11px] text-muted-foreground">
                              <Users className="h-3 w-3" />
                              <span>{plan.seats} seats</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Date info */}
                      <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                        {isPending && plan.start_date && (
                          <span className="text-[var(--cloudact-coral)] font-medium">
                            Starts {format(new Date(plan.start_date), 'MMM d')}
                          </span>
                        )}
                        {plan.end_date && (
                          <span className="text-muted-foreground font-medium">
                            Ends {format(new Date(plan.end_date), 'MMM d')}
                          </span>
                        )}
                      </div>

                      {/* Expand indicator */}
                      <div className="flex items-center justify-center mt-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[#C7C7CC]" />
                        )}
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-[var(--cloudact-mint)]/5 space-y-3">
                        {/* Price breakdown */}
                        <div className="p-3 bg-white rounded-xl border border-border">
                          <div className="flex items-center gap-2 mb-2">
                            <CreditCard className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                            <span className="text-[11px] font-medium text-muted-foreground uppercase">Pricing</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[13px]">
                              <span className="text-muted-foreground">Unit Price:</span>
                              <span className="font-semibold text-slate-900">{formatCurrency(plan.unit_price ?? 0, orgCurrency)}</span>
                            </div>
                            <div className="flex justify-between text-[13px]">
                              <span className="text-muted-foreground">Model:</span>
                              <span className="font-medium text-slate-900">{plan.pricing_model === 'PER_SEAT' ? 'Per Seat' : 'Flat Fee'}</span>
                            </div>
                            {plan.seats && (
                              <div className="flex justify-between text-[13px]">
                                <span className="text-muted-foreground">Seats:</span>
                                <span className="font-medium text-slate-900">{plan.seats}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[13px] pt-1 border-t border-border mt-1">
                              <span className="text-muted-foreground font-medium">Total:</span>
                              <span className="font-bold text-slate-900">{formatCurrency(totalCost, orgCurrency)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Dates */}
                        <div className="p-3 bg-white rounded-xl border border-border">
                          <div className="flex items-center gap-2 mb-2">
                            <CalendarDays className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                            <span className="text-[11px] font-medium text-muted-foreground uppercase">Schedule</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[11px] text-muted-foreground">Start Date</p>
                              <p className="text-[13px] font-semibold text-slate-900">
                                {plan.start_date ? format(new Date(plan.start_date), 'MMM d, yyyy') : '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground">Renewal</p>
                              <p className="text-[13px] font-semibold text-slate-900">
                                {plan.renewal_date ? format(new Date(plan.renewal_date), 'MMM d, yyyy') : '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground">End Date</p>
                              <p className="text-[13px] font-semibold text-slate-900">
                                {plan.end_date ? format(new Date(plan.end_date), 'MMM d, yyyy') : 'Active'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground">Currency</p>
                              <p className="text-[13px] font-semibold text-slate-900">{plan.currency || orgCurrency}</p>
                            </div>
                          </div>
                        </div>

                        {/* Subscription ID */}
                        <div className="p-3 bg-white rounded-xl border border-border">
                          <p className="text-[11px] text-muted-foreground uppercase mb-1">Subscription ID</p>
                          <p className="text-[12px] font-mono text-slate-900 break-all">{plan.subscription_id}</p>
                        </div>

                        {/* Description if available */}
                        {plan.description && (
                          <div className="p-3 bg-white rounded-xl border border-border">
                            <p className="text-[11px] text-muted-foreground uppercase mb-1">Description</p>
                            <p className="text-[13px] text-slate-900">{plan.description}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`} className="flex-1">
                            <Button
                              size="sm"
                              className="console-button-primary w-full h-11 rounded-xl text-[13px] font-semibold"
                            >
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Edit Plan
                            </Button>
                          </Link>
                          <Link href={`/${orgSlug}/pipelines/subscription-runs`} className="flex-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="console-button-secondary w-full h-11 rounded-xl text-[13px] font-medium"
                            >
                              View Runs
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Desktop table view */}
          {plans.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-border">
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
                    active: "bg-[#B8FDCA] text-[#1a7a3a] border border-[var(--cloudact-mint)]/20",
                    pending: "bg-[var(--cloudact-mint)]/10 text-[#1a7a3a] border border-[var(--cloudact-mint)]/20",
                    cancelled: "bg-slate-100 text-slate-600 border border-slate-200",
                    expired: "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] border border-[var(--cloudact-coral)]/20"
                  }

                  return (
                    <React.Fragment key={plan.subscription_id}>
                      <TableRow
                        className={`console-table-row cursor-pointer hover:bg-[var(--cloudact-mint)]/5 touch-manipulation ${!isActive ? "opacity-60" : ""}`}
                        onClick={() => toggleRowExpansion(plan.subscription_id)}
                      >
                        <TableCell className="console-table-cell">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
                              <span className="text-[11px] text-[var(--cloudact-coral)] font-medium whitespace-nowrap">
                                Starts {format(new Date(plan.start_date), 'MMM d')}
                              </span>
                            )}
                            {plan.end_date && (
                              <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
                                Ends {format(new Date(plan.end_date), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="font-semibold text-slate-900 text-[15px]">{plan.display_name || plan.plan_name}</div>
                              <div className="text-[13px] text-muted-foreground">{plan.plan_name}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell" onClick={(e) => e.stopPropagation()}>
                          {integrationPath ? (
                            <Link href={`/${orgSlug}/integrations/genai`}>
                              <span className="text-[var(--cloudact-blue)] hover:underline cursor-pointer flex items-center gap-1 font-medium text-[15px] transition-colors">
                                {plan.provider_name}
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </span>
                            </Link>
                          ) : (
                            <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
                              <span className="text-[var(--cloudact-blue)] hover:underline cursor-pointer flex items-center gap-1 font-medium text-[15px] transition-colors">
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
                            <span className="font-semibold text-slate-900 text-[15px]">{formatCurrency(plan.unit_price ?? 0, orgCurrency)}</span>
                            {plan.pricing_model && (
                              <div className="text-[11px] text-muted-foreground font-medium">
                                {plan.pricing_model === 'PER_SEAT' ? '/seat' : 'flat fee'}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell">
                          <Badge className="capitalize text-[11px] font-semibold px-2.5 py-1 bg-[var(--cloudact-mint)]/5 text-muted-foreground border-0 whitespace-nowrap">
                            {formatBillingCycle(plan.billing_cycle)}
                          </Badge>
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          {plan.seats ? (
                            <div className="flex items-center justify-end gap-1.5 text-slate-900 font-semibold text-[15px]">
                              <Users className="h-4 w-4 text-[var(--cloudact-coral)]" />
                              <span>{plan.seats}</span>
                            </div>
                          ) : (
                            <span className="text-[#C7C7CC] font-medium">-</span>
                          )}
                        </TableCell>
                        <TableCell className="console-table-cell text-right">
                          <div className="whitespace-nowrap">
                            <span className={`${isActive ? "text-slate-900 font-bold text-[17px]" : "text-[#C7C7CC] font-medium"}`}>
                              {formatCurrency(totalCost, orgCurrency)}
                            </span>
                            <div className="text-[11px] text-muted-foreground font-medium">
                              billed {formatBillingCycle(plan.billing_cycle).toLowerCase()}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="console-table-cell text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 text-[var(--cloudact-mint-text)] hover:bg-[var(--cloudact-mint)]/10 transition-all rounded-xl"
                                title="Edit plan"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 text-muted-foreground hover:text-[var(--cloudact-coral)] hover:bg-[var(--cloudact-coral)]/10 transition-all rounded-xl"
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
                        <TableRow className="bg-[var(--cloudact-mint)]/5">
                          <TableCell colSpan={10} className="px-4 sm:px-6 py-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {/* Subscription ID */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-mint)]/10">
                                  <Hash className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Subscription ID</p>
                                  <p className="text-[13px] font-mono text-slate-900 mt-0.5 break-all">{plan.subscription_id}</p>
                                </div>
                              </div>

                              {/* Start Date */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-mint)]/10">
                                  <CalendarDays className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Start Date</p>
                                  <p className="text-[13px] font-semibold text-slate-900 mt-0.5">
                                    {plan.start_date ? format(new Date(plan.start_date), 'MMM d, yyyy') : '-'}
                                  </p>
                                </div>
                              </div>

                              {/* Renewal Date */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-coral)]/10">
                                  <Clock className="h-4 w-4 text-[var(--cloudact-coral)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Renewal Date</p>
                                  <p className="text-[13px] font-semibold text-slate-900 mt-0.5">
                                    {plan.renewal_date ? format(new Date(plan.renewal_date), 'MMM d, yyyy') : '-'}
                                  </p>
                                </div>
                              </div>

                              {/* End Date */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-mint)]/10">
                                  <CalendarX className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">End Date</p>
                                  <p className="text-[13px] font-semibold text-slate-900 mt-0.5">
                                    {plan.end_date ? format(new Date(plan.end_date), 'MMM d, yyyy') : 'Active'}
                                  </p>
                                </div>
                              </div>

                              {/* Pricing Model */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-mint)]/10">
                                  <CreditCard className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Pricing Model</p>
                                  <p className="text-[13px] font-semibold text-slate-900 mt-0.5">
                                    {plan.pricing_model === 'PER_SEAT' ? 'Per Seat' : 'Flat Fee'}
                                  </p>
                                </div>
                              </div>

                              {/* Currency */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-mint)]/10">
                                  <DollarSign className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Currency</p>
                                  <p className="text-[13px] font-semibold text-slate-900 mt-0.5">{plan.currency || orgCurrency}</p>
                                </div>
                              </div>

                              {/* Category */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-mint)]/10">
                                  <Tag className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Category</p>
                                  <p className="text-[13px] font-semibold text-slate-900 mt-0.5 capitalize">{category}</p>
                                </div>
                              </div>

                              {/* Monthly Cost Breakdown */}
                              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-border">
                                <div className="p-2 rounded-lg bg-[var(--cloudact-coral)]/10">
                                  <TrendingUp className="h-4 w-4 text-[var(--cloudact-coral)]" />
                                </div>
                                <div>
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Monthly Cost</p>
                                  <p className="text-[13px] font-semibold text-slate-900 mt-0.5">
                                    {formatCurrency(totalCost, orgCurrency)}
                                    {plan.seats && plan.seats > 1 && (
                                      <span className="text-[11px] text-muted-foreground font-normal ml-1">
                                        ({plan.seats} × {formatCurrency(plan.unit_price ?? 0, orgCurrency)})
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Description if available */}
                            {plan.description && (
                              <div className="mt-4 p-3 bg-white rounded-xl border border-border">
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                                <p className="text-[13px] text-slate-900">{plan.description}</p>
                              </div>
                            )}

                            {/* Quick Actions */}
                            <div className="mt-4 flex items-center gap-3">
                              <Link href={`/${orgSlug}/integrations/subscriptions/${plan.provider_name}`}>
                                <Button
                                  size="sm"
                                  className="console-button-primary h-11 px-4 rounded-xl text-[13px] font-semibold"
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Edit Plan
                                </Button>
                              </Link>
                              <Link href={`/${orgSlug}/pipelines/subscription-runs`}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="console-button-secondary h-11 px-4 rounded-xl text-[13px] font-medium"
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
