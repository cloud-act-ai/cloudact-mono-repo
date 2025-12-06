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
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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
  togglePlan,
  type SubscriptionPlan,
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

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-purple-100 text-purple-700 border-purple-200",
  design: "bg-pink-100 text-pink-700 border-pink-200",
  productivity: "bg-blue-100 text-blue-700 border-blue-200",
  communication: "bg-green-100 text-green-700 border-green-200",
  development: "bg-orange-100 text-orange-700 border-orange-200",
  cloud: "bg-cyan-100 text-cyan-700 border-cyan-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
}

type PlanWithProvider = SubscriptionPlan & { provider_name: string }

export default function SubscriptionsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [plans, setPlans] = useState<PlanWithProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  } | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await getAllPlansForCostDashboard(orgSlug)

    if (result.success) {
      setPlans(result.plans)
      setSummary(result.summary)
    } else {
      setError(result.error || "Failed to load subscription data")
      setPlans([])
      setSummary(null)
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

  const handleToggle = async (plan: PlanWithProvider) => {
    setToggling(plan.subscription_id)
    const result = await togglePlan(orgSlug, plan.provider_name, plan.subscription_id, !plan.is_enabled)
    setToggling(null)
    if (!result.success) {
      setError(result.error || "Failed to toggle plan")
    }
    await loadData()
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

  // Calculate monthly equivalent based on billing period
  const getMonthlyEquivalent = (plan: PlanWithProvider): number => {
    const price = plan.unit_price_usd || 0
    if (!plan.billing_period) return price
    switch (plan.billing_period.toLowerCase()) {
      case "annual":
      case "yearly":
        return price / 12
      case "quarterly":
        return price / 3
      default:
        return price
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
                <Wallet className="h-6 w-6 text-[#007A78]" />
              </div>
              <h1 className="console-page-title">Subscription Costs</h1>
            </div>
            <p className="console-subheading ml-12">
              View your SaaS subscription costs and usage
            </p>
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-4">
          <CardSkeleton count={4} showDescription />
        </div>

        {/* Table Skeleton */}
        <Card className="console-table-card">
          <CardHeader>
            <CardTitle className="console-card-title">All Subscriptions</CardTitle>
            <CardDescription>
              View and manage all your SaaS subscriptions. Toggle to enable/disable cost tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={8} columns={8} />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error state if API key is missing or other error
  if (error) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
                <Wallet className="h-6 w-6 text-[#007A78]" />
              </div>
              <h1 className="console-page-title">Subscription Costs</h1>
            </div>
            <p className="console-subheading ml-12">
              View your SaaS subscription costs and usage
            </p>
          </div>
        </div>

        {/* Error Card */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-900">{error}</h3>
                <p className="text-sm text-amber-700 mt-1">
                  {error.includes("API key") ? (
                    <>
                      Please complete organization onboarding in{" "}
                      <Link href={`/${orgSlug}/settings/onboarding`} className="underline hover:no-underline">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
              <Wallet className="h-6 w-6 text-[#007A78]" />
            </div>
            <h1 className="console-page-title">Subscription Costs</h1>
          </div>
          <p className="console-subheading ml-12">
            View your SaaS subscription costs and usage
          </p>
        </div>
        <Button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="text-[#007A78] border-[#007A78]/30 hover:bg-[#007A78]/5"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
          <Button className="console-button-primary">
            <Plus className="h-4 w-4 mr-2" />
            Manage Providers
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Monthly Cost</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-[#007A78]" />
                <span className="console-metric-teal">{formatCurrency(summary.total_monthly_cost)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Annual Cost</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#FF6E50]" />
                <span className="console-metric-coral">{formatCurrency(summary.total_annual_cost)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Active Plans</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-gray-900">
                  {summary.enabled_count} / {summary.total_count}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Categories</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {summary.count_by_category && Object.keys(summary.count_by_category).length > 0 ? (
                  Object.entries(summary.count_by_category).map(([cat, count]) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className={`text-xs capitalize ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}
                    >
                      {cat}: {count}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-gray-400">No categories</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plans Table */}
      <Card className="console-table-card">
        <CardHeader>
          <CardTitle className="console-card-title">All Subscriptions</CardTitle>
          <CardDescription>
            View and manage all your SaaS subscriptions. Toggle to enable/disable cost tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No subscriptions yet</h3>
              <p className="text-slate-500 mb-4">
                Enable providers from Integrations to start tracking your SaaS costs.
              </p>
              <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
                <Button className="console-button-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Enable Providers
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Active</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Monthly Equiv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const category = plan.category && plan.category.trim() !== "" ? plan.category : "other"
                  const CategoryIcon = CATEGORY_ICONS[category] || Wallet
                  const monthlyEquiv = getMonthlyEquivalent(plan)

                  // Map SaaS provider to integration page (only for LLM providers with API integrations)
                  const providerMapping: Record<string, string> = {
                    chatgpt_plus: "openai",
                    claude_pro: "anthropic",
                    gemini_advanced: "gemini",
                    copilot: "openai", // GitHub Copilot uses OpenAI models
                  }
                  const integrationPath = providerMapping[plan.provider_name]

                  return (
                    <TableRow key={plan.subscription_id} className={!plan.is_enabled ? "opacity-50" : ""}>
                      <TableCell>
                        <Switch
                          checked={plan.is_enabled}
                          onCheckedChange={() => handleToggle(plan)}
                          disabled={toggling === plan.subscription_id}
                          className="data-[state=checked]:bg-[#007A78]"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-[#F0FDFA]">
                            <CategoryIcon className="h-4 w-4 text-[#007A78]" />
                          </div>
                          <div>
                            <div className="font-medium">{plan.display_name || plan.plan_name}</div>
                            <div className="text-xs text-gray-500">{plan.plan_name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {integrationPath ? (
                          <Link href={`/${orgSlug}/settings/integrations/${integrationPath}`}>
                            <span className="hover:text-[#007A78] hover:underline cursor-pointer flex items-center gap-1">
                              {plan.provider_name}
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </span>
                          </Link>
                        ) : (
                          <Link href={`/${orgSlug}/subscriptions/${plan.provider_name}`}>
                            <span className="hover:text-[#007A78] hover:underline cursor-pointer flex items-center gap-1">
                              {plan.provider_name}
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </span>
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize ${CATEGORY_COLORS[category]}`}
                        >
                          {category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(plan.unit_price_usd || 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {formatBillingCycle(plan.billing_period)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {plan.seats ? (
                          <div className="flex items-center justify-end gap-1">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            <span>{plan.seats}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={plan.is_enabled ? "text-[#007A78] font-medium" : "text-gray-400"}>
                          {formatCurrency(monthlyEquiv)}/mo
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
