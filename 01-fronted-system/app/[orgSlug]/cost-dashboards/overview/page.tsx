import { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { CheckCircle2, AlertCircle, LogIn, TrendingUp, TrendingDown, DollarSign, Sparkles, AlertTriangle, ArrowUpRight, ArrowDownRight, Brain, Cloud, Wallet, Target, Zap, ChevronRight } from "lucide-react"
import { CostChart } from "@/components/dashboard/cost-chart"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

interface OrganizationData {
  id: string
  org_name: string
  org_slug: string
  plan: string
  billing_status: string
  default_currency?: string
  default_timezone?: string
}

interface DashboardData {
  organization: OrganizationData
  memberCount: number
  userRole: string
}

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug } = await params
  return {
    title: `Cost Overview | ${orgSlug}`,
    description: "Consolidated cost overview for all services",
  }
}

export default async function CostOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ success?: string }>
}) {
  const { orgSlug } = await params
  const { success } = await searchParams
  const supabase = await createClient()

  let userResult, orgResult

  try {
    const results = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("organizations")
        .select("id, org_name, org_slug, plan, billing_status, default_currency, default_timezone")
        .eq("org_slug", orgSlug)
        .single()
    ])

    userResult = results[0]
    orgResult = results[1]
  } catch {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center p-4 min-h-[60vh]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto px-6 py-10 text-center space-y-6">
            <AlertCircle className="h-14 w-14 text-[var(--cloudact-coral)] mx-auto" />
            <div className="space-y-2">
              <h2 className="text-[22px] font-bold text-slate-900">Failed to load dashboard</h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed">Please try refreshing the page</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const user = userResult.data?.user
  const org = orgResult.data

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center p-4 min-h-[60vh]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto px-6 py-10 text-center space-y-6">
            <AlertCircle className="h-14 w-14 text-[var(--cloudact-coral)] mx-auto" />
            <div className="space-y-2">
              <h2 className="text-[22px] font-bold text-slate-900">Not authenticated</h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed">Please sign in to access the dashboard</p>
            </div>
            <Link href="/login" className="console-button-primary inline-flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center p-4 min-h-[60vh]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto px-6 py-10 text-center space-y-6">
            <AlertCircle className="h-14 w-14 text-[var(--cloudact-coral)] mx-auto" />
            <div className="space-y-2">
              <h2 className="text-[22px] font-bold text-slate-900">Organization not found</h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed">The organization you're looking for doesn't exist</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  let membershipResult, memberCountResult

  try {
    const results = await Promise.all([
      supabase
        .from("organization_members")
        .select("role")
        .eq("org_id", org.id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org.id)
        .eq("status", "active")
    ])

    membershipResult = results[0]
    memberCountResult = results[1]
  } catch {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center p-4 min-h-[60vh]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto px-6 py-10 text-center space-y-6">
            <AlertCircle className="h-14 w-14 text-[var(--cloudact-coral)] mx-auto" />
            <div className="space-y-2">
              <h2 className="text-[22px] font-bold text-slate-900">Failed to load membership data</h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed">Please try refreshing the page</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const data: DashboardData = {
    organization: org,
    memberCount: memberCountResult.count || 0,
    userRole: membershipResult.data?.role || "read_only",
  }

  // Mock cost data - replace with real data from your backend
  const currentMonthTotal = 18450.32
  const lastMonthTotal = 16234.56
  const monthOverMonthChange = ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
  const isIncreasing = monthOverMonthChange > 0

  const costBreakdown = [
    { category: "GenAI", amount: 8234.50, percentage: 44.6, icon: Brain, color: "text-[var(--cloudact-mint-text)]", bgColor: "bg-[var(--cloudact-mint)]/10" },
    { category: "Cloud", amount: 6512.82, percentage: 35.3, icon: Cloud, color: "text-[var(--cloudact-coral)]", bgColor: "bg-[var(--cloudact-coral)]/10" },
    { category: "SaaS", amount: 3703.00, percentage: 20.1, icon: Wallet, color: "text-[#8E8E93]", bgColor: "bg-[#8E8E93]/10" },
  ]

  const topCostDrivers = [
    { name: "OpenAI GPT-4", category: "GenAI", cost: 4234.56, trend: 12.5, icon: Brain },
    { name: "GCP Compute Engine", category: "Cloud", cost: 3456.78, trend: -5.2, icon: Cloud },
    { name: "Anthropic Claude", category: "GenAI", cost: 2890.34, trend: 18.9, icon: Brain },
    { name: "AWS S3 Storage", category: "Cloud", cost: 1678.90, trend: 3.4, icon: Cloud },
    { name: "Slack Enterprise", category: "SaaS", cost: 1234.50, trend: 0, icon: Wallet },
  ]

  const budgets = [
    { category: "GenAI", budget: 10000, actual: 8234.50, color: "teal" as const },
    { category: "Cloud", budget: 7000, actual: 6512.82, color: "coral" as const },
    { category: "SaaS", budget: 4000, actual: 3703.00, color: "default" as const },
  ]

  const recommendations = [
    {
      title: "Switch to Reserved Instances",
      impact: "Save $450/month",
      category: "Cloud",
      description: "GCP Compute shows consistent usage patterns"
    },
    {
      title: "Optimize Token Usage",
      impact: "Save $320/month",
      category: "GenAI",
      description: "Reduce redundant API calls by 15%"
    },
    {
      title: "Review Inactive SaaS Licenses",
      impact: "Save $180/month",
      category: "SaaS",
      description: "8 inactive Slack licenses detected"
    },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {success === "true" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--cloudact-mint)]/10 border border-[var(--cloudact-mint)]/20 animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-[var(--cloudact-mint-text)] flex-shrink-0" />
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--cloudact-mint-text)]">Subscription Successful!</h3>
            <p className="text-[13px] text-[var(--cloudact-mint-text)]/80 leading-relaxed">
              Your subscription has been activated. You now have full access.
            </p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          Cost Overview
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Unified view of all your cloud and SaaS spending
        </p>
      </div>

      {/* Current Month Summary */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          Current Month Summary
        </h2>
      </div>

      {/* Hero Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Cost - Hero Card */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-dark)] text-white relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
          </div>

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-5 w-5 text-white/80" />
                  <span className="text-[13px] font-semibold text-white/80 uppercase tracking-wide">Total Costs This Month</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[48px] font-bold text-white leading-none tracking-tight">
                    ${currentMonthTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h2>
                </div>
              </div>

              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg ${
                isIncreasing ? 'bg-[var(--cloudact-coral)]/20 backdrop-blur-sm' : 'bg-white/20 backdrop-blur-sm'
              }`}>
                {isIncreasing ? (
                  <TrendingUp className="h-4 w-4 text-white" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-white" />
                )}
                <span className="text-[15px] font-bold text-white">
                  {isIncreasing ? '+' : ''}{monthOverMonthChange.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-white/80">
              <span className="text-[13px]">vs last month:</span>
              <span className="text-[15px] font-semibold text-white">
                ${lastMonthTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span className={`text-[13px] ml-1 ${isIncreasing ? 'text-[var(--cloudact-coral)]' : 'text-white'}`}>
                ({isIncreasing ? '+' : ''}{(currentMonthTotal - lastMonthTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })})
              </span>
            </div>
          </div>
        </div>

        {/* Month Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="h-10 w-10 rounded-full bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
              </div>
              <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">December 2025</span>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">Daily Average</span>
                <span className="text-[17px] font-bold text-slate-900">$821.35</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">Projected Total</span>
                <span className="text-[17px] font-bold text-[var(--cloudact-coral)]">$19,456</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">Days Remaining</span>
                <span className="text-[17px] font-bold text-slate-900">8 days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Breakdown by Category */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          Cost Breakdown by Category
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {costBreakdown.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.category} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 group hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className={`h-12 w-12 rounded-xl ${item.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <Icon className={`h-6 w-6 ${item.color}`} />
                </div>
                <Badge variant={item.category === "GenAI" ? "success" : item.category === "Cloud" ? "warning" : "outline"}>
                  {item.percentage.toFixed(1)}%
                </Badge>
              </div>

              <h3 className="text-[15px] font-semibold text-muted-foreground mb-2">{item.category}</h3>
              <div className="text-[32px] font-bold text-slate-900 leading-none mb-4">
                ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">% of Total</span>
                  <span className={`font-semibold ${item.color}`}>{item.percentage.toFixed(1)}%</span>
                </div>
                <Progress value={item.percentage} max={100} variant={item.category === "GenAI" ? "teal" : item.category === "Cloud" ? "coral" : "default"} size="lg" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Spending Trends */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          Spending Trends
        </h2>
      </div>

      {/* Chart and Top Drivers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending Trend Chart */}
        <div className="lg:col-span-2 h-[380px]">
          <CostChart />
        </div>

        {/* Top Cost Drivers */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-full bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-[var(--cloudact-coral)]" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900">Top Cost Drivers</h3>
          </div>

          <div className="space-y-3">
            {topCostDrivers.slice(0, 5).map((driver, idx) => {
              const Icon = driver.icon
              const trendPositive = driver.trend > 0
              return (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#F5F5F7] hover:bg-[var(--cloudact-mint)]/5 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-[#8E8E93]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900 truncate">{driver.name}</p>
                    <p className="text-[11px] text-muted-foreground">{driver.category}</p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-[14px] font-bold text-slate-900">
                      ${driver.cost.toLocaleString('en-US')}
                    </p>
                    {driver.trend !== 0 && (
                      <div className={`flex items-center gap-0.5 justify-end ${trendPositive ? 'text-[var(--cloudact-coral)]' : 'text-[var(--cloudact-mint-text)]'}`}>
                        {trendPositive ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        <span className="text-[11px] font-semibold">
                          {Math.abs(driver.trend).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <Link
            href={`/${orgSlug}/cost-dashboards/genai-costs`}
            className="mt-4 flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-900 hover:text-black transition-colors"
          >
            View All Details
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Budget Tracking */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          Budget Tracking
        </h2>
      </div>

      {/* Budget vs Actual */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-full bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
          </div>
          <h3 className="text-[20px] font-bold text-slate-900">Budget vs Actual</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {budgets.map((budget) => {
            const percentage = (budget.actual / budget.budget) * 100
            const isOverBudget = percentage > 100
            const isNearLimit = percentage > 85 && percentage <= 100

            return (
              <div key={budget.category} className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-slate-900">{budget.category}</span>
                  {isOverBudget && (
                    <Badge variant="warning" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Over Budget
                    </Badge>
                  )}
                  {isNearLimit && !isOverBudget && (
                    <Badge variant="outline" className="gap-1 text-[var(--cloudact-coral)] border-[var(--cloudact-coral)]/20">
                      <AlertCircle className="h-3 w-3" />
                      Near Limit
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-muted-foreground">Actual</span>
                    <span className={`text-[20px] font-bold ${isOverBudget ? 'text-[var(--cloudact-coral)]' : 'text-slate-900'}`}>
                      ${budget.actual.toLocaleString('en-US')}
                    </span>
                  </div>
                  <Progress
                    value={budget.actual}
                    max={budget.budget}
                    variant={isOverBudget ? "coral" : budget.color}
                    size="lg"
                  />
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-muted-foreground">Budget</span>
                    <span className="text-[15px] font-semibold text-[#8E8E93]">
                      ${budget.budget.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E5E5EA]">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Remaining</span>
                    <span className={`text-[15px] font-bold ${isOverBudget ? 'text-[var(--cloudact-coral)]' : 'text-[var(--cloudact-mint-text)]'}`}>
                      {isOverBudget ? '-' : ''}${Math.abs(budget.budget - budget.actual).toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Optimization */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          Cost Optimization
        </h2>
      </div>

      {/* Cost Optimization Recommendations */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 bg-gradient-to-br from-[#F5F5F7] to-white">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-dark)] flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-[20px] font-bold text-slate-900">Cost Optimization Opportunities</h3>
            <p className="text-[13px] text-muted-foreground">Potential savings: <span className="font-semibold text-[var(--cloudact-mint-text)]">$950/month</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommendations.map((rec, idx) => (
            <div key={idx} className="p-5 rounded-xl bg-white border border-[#E5E5EA] hover:border-[var(--cloudact-mint)]/30 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-3">
                <Badge variant="success" className="gap-1">
                  <TrendingDown className="h-3 w-3" />
                  {rec.impact}
                </Badge>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[var(--cloudact-mint-text)] group-hover:translate-x-1 transition-all" />
              </div>

              <h4 className="text-[15px] font-bold text-slate-900 mb-2 group-hover:text-[var(--cloudact-mint-text)] transition-colors">
                {rec.title}
              </h4>
              <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                {rec.description}
              </p>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide">
                  {rec.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Access */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          Quick Access
        </h2>
      </div>

      {/* Quick Access Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          href={`/${orgSlug}/cost-dashboards/subscription-costs`}
          className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:bg-[var(--cloudact-mint)]/5 transition-all"
        >
          <div className="h-10 w-10 rounded-full bg-[var(--cloudact-coral)]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Wallet className="h-5 w-5 text-[var(--cloudact-coral)]" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-1">Subscription Costs</h3>
          <p className="text-[13px] text-muted-foreground">SaaS & software</p>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/genai-costs`}
          className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:bg-[var(--cloudact-mint)]/5 transition-all"
        >
          <div className="h-10 w-10 rounded-full bg-[var(--cloudact-mint)]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Brain className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-1">GenAI Costs</h3>
          <p className="text-[13px] text-muted-foreground">LLM API usage</p>
        </Link>

        <Link
          href={`/${orgSlug}/cost-dashboards/cloud-costs`}
          className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:bg-[var(--cloudact-mint)]/5 transition-all"
        >
          <div className="h-10 w-10 rounded-full bg-[var(--cloudact-coral)]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Cloud className="h-5 w-5 text-[var(--cloudact-coral)]" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-1">Cloud Costs</h3>
          <p className="text-[13px] text-muted-foreground">GCP, AWS, Azure</p>
        </Link>

        <Link
          href={`/${orgSlug}/pipelines/subscription-runs`}
          className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:bg-[var(--cloudact-mint)]/5 transition-all"
        >
          <div className="h-10 w-10 rounded-full bg-[var(--cloudact-mint)]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <TrendingUp className="h-5 w-5 text-[var(--cloudact-mint-text)]" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-1">Run Pipelines</h3>
          <p className="text-[13px] text-muted-foreground">Update data</p>
        </Link>
      </div>
    </div>
  )
}
