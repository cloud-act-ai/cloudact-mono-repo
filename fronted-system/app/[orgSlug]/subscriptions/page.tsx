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
  Settings,
  ArrowUpRight,
  Brain,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Cloud,
  Plus,
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
import {
  listSaaSSubscriptions,
  toggleSaaSSubscription,
  getSaaSSubscriptionSummary,
  SaaSSubscription,
} from "@/actions/saas-subscriptions"

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

export default function SubscriptionsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [subscriptions, setSubscriptions] = useState<SaaSSubscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  } | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [subsResult, summaryResult] = await Promise.all([
      listSaaSSubscriptions(orgSlug),
      getSaaSSubscriptionSummary(orgSlug),
    ])

    if (subsResult.success && subsResult.subscriptions) {
      setSubscriptions(subsResult.subscriptions)
    }
    if (summaryResult.success && summaryResult.summary) {
      setSummary(summaryResult.summary)
    }
    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = async (sub: SaaSSubscription) => {
    setToggling(sub.id)
    await toggleSaaSSubscription(orgSlug, sub.id, !sub.is_enabled)
    setToggling(null)
    await loadData()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  const formatBillingCycle = (cycle: string) => {
    return cycle.charAt(0).toUpperCase() + cycle.slice(1)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
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
            <h1 className="console-page-title">Subscription Reports</h1>
          </div>
          <p className="console-subheading ml-12">
            View your SaaS subscription costs and usage
          </p>
        </div>
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
              <CardDescription className="console-small">Active Subscriptions</CardDescription>
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
                {Object.entries(summary.count_by_category).map(([cat, count]) => (
                  <Badge
                    key={cat}
                    variant="outline"
                    className={`text-xs capitalize ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}
                  >
                    {cat}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subscriptions Table */}
      <Card className="console-table-card">
        <CardHeader>
          <CardTitle className="console-card-title">All Subscriptions</CardTitle>
          <CardDescription>
            View and manage all your SaaS subscriptions. Toggle to enable/disable cost tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
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
                  <TableHead>Service</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Monthly Equiv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => {
                  const CategoryIcon = CATEGORY_ICONS[sub.category || "other"] || Wallet
                  const monthlyEquiv =
                    sub.billing_cycle === "annual"
                      ? sub.cost_per_cycle / 12
                      : sub.billing_cycle === "quarterly"
                      ? sub.cost_per_cycle / 3
                      : sub.cost_per_cycle

                  // Map SaaS provider to integration page (only for LLM providers with API integrations)
                  const providerMapping: Record<string, string> = {
                    chatgpt_plus: "openai",
                    claude_pro: "anthropic",
                    gemini_advanced: "gemini",
                    copilot: "openai", // GitHub Copilot uses OpenAI models
                  }
                  const integrationPath = providerMapping[sub.provider_name]

                  return (
                    <TableRow key={sub.id} className={!sub.is_enabled ? "opacity-50" : ""}>
                      <TableCell>
                        <Switch
                          checked={sub.is_enabled}
                          onCheckedChange={() => handleToggle(sub)}
                          disabled={toggling === sub.id}
                          className="data-[state=checked]:bg-[#007A78]"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-[#F0FDFA]">
                            <CategoryIcon className="h-4 w-4 text-[#007A78]" />
                          </div>
                          <div>
                            {integrationPath ? (
                              <Link href={`/${orgSlug}/settings/integrations/${integrationPath}`}>
                                <div className="font-medium hover:text-[#007A78] hover:underline cursor-pointer flex items-center gap-1.5">
                                  {sub.display_name}
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </div>
                              </Link>
                            ) : (
                              <div className="font-medium">{sub.display_name}</div>
                            )}
                            <div className="text-xs text-gray-500">{sub.provider_name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize ${CATEGORY_COLORS[sub.category || "other"]}`}
                        >
                          {sub.category || "other"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(sub.cost_per_cycle)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {formatBillingCycle(sub.billing_cycle)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {sub.seats ? (
                          <div className="flex items-center justify-end gap-1">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            <span>{sub.seats}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={sub.is_enabled ? "text-[#007A78] font-medium" : "text-gray-400"}>
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
