"use client"

/**
 * Provider Detail Page
 *
 * Shows all subscription plans for a specific provider.
 * Uses API service to fetch seeded plans from BigQuery.
 */

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Pencil,
  Brain,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Cloud,
  CalendarX,
  Info,
  CreditCard,
} from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CardSkeleton } from "@/components/ui/card-skeleton"

import {
  getProviderPlans,
  getProviderMeta,
  getSaaSSubscriptionCosts,
  SubscriptionPlan,
  type ProviderMeta,
  type SaaSCostSummary,
  type SaaSCostRecord,
} from "@/actions/subscription-providers"
import { formatCurrency, formatDateOnly } from "@/lib/i18n"
import { getOrgLocale } from "@/actions/organization-locale"

// Provider display names
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  chatgpt_plus: "ChatGPT Plus",
  claude_pro: "Claude Pro",
  gemini_advanced: "Gemini Advanced",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
  windsurf: "Windsurf",
  replit: "Replit",
  v0: "v0",
  lovable: "Lovable",
  canva: "Canva",
  adobe_cc: "Adobe Creative Cloud",
  figma: "Figma",
  miro: "Miro",
  notion: "Notion",
  confluence: "Confluence",
  asana: "Asana",
  monday: "Monday.com",
  slack: "Slack",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  supabase: "Supabase",
}

// Provider aliases - redirect old/incorrect provider names to canonical names
// Example: chatgpt_enterprise → chatgpt_plus (all ChatGPT plans live under chatgpt_plus)
const PROVIDER_ALIASES: Record<string, string> = {
  chatgpt_enterprise: "chatgpt_plus",
  chatgpt_team: "chatgpt_plus",
  chatgpt_free: "chatgpt_plus",
  claude_enterprise: "claude_pro",
  claude_team: "claude_pro",
  claude_free: "claude_pro",
}

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

function getCanonicalProvider(provider: string): string {
  return PROVIDER_ALIASES[provider.toLowerCase()] || provider.toLowerCase()
}

// Category icon mapping
const categoryIcons: Record<string, React.ReactNode> = {
  ai: <Brain className="h-6 w-6" />,
  design: <Palette className="h-6 w-6" />,
  productivity: <FileText className="h-6 w-6" />,
  communication: <MessageSquare className="h-6 w-6" />,
  development: <Code className="h-6 w-6" />,
  cloud: <Cloud className="h-6 w-6" />,
  other: <CreditCard className="h-6 w-6" />,
}

export default function ProviderDetailPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const { orgSlug, provider: rawProvider } = params

  // Canonicalize provider name (handle aliases like chatgpt_enterprise → chatgpt_plus)
  const provider = rawProvider ? getCanonicalProvider(rawProvider) : rawProvider

  // Track if we redirected from an alias
  const isAliased = rawProvider && rawProvider !== provider

  // Validate params
  const isValidParams = orgSlug && provider && typeof orgSlug === "string" && typeof provider === "string"

  // State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0)  // From plan data (fallback)
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [providerMeta, setProviderMeta] = useState<ProviderMeta | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [orgCurrency, setOrgCurrency] = useState<string>("USD")

  // Cost data from Polars (source of truth for costs)
  const [costSummary, setCostSummary] = useState<SaaSCostSummary | null>(null)
  const [costRecords, setCostRecords] = useState<SaaSCostRecord[]>([])

  // Effective monthly cost: prefer Polars data, fallback to plan calculation
  const effectiveMonthlyCost = costSummary?.total_monthly_cost ?? totalMonthlyCost

  // Load plans from BigQuery and costs from Polars (source of truth for costs)
  const loadPlans = useCallback(async (isMounted?: () => boolean) => {
    if (!isValidParams) {
      if (!isMounted || isMounted()) {
        setError("Invalid page parameters")
        setLoading(false)
      }
      return
    }

    if (!isMounted || isMounted()) setLoading(true)
    if (!isMounted || isMounted()) setError(null)

    try {
      // Fetch provider meta, plans, costs, and org locale in parallel - OPTIMIZED
      // - Plans from saas_subscription_plans (BigQuery) for plan details
      // - Costs from cost_data_standard_1_2 (Polars) for actual costs
      // - Locale for currency formatting
      // All four calls run simultaneously to minimize loading time
      const [metaResult, plansResult, costsResult, localeResult] = await Promise.all([
        getProviderMeta(orgSlug, provider),
        getProviderPlans(orgSlug, provider),
        getSaaSSubscriptionCosts(orgSlug, undefined, undefined, provider),  // Filter by provider
        getOrgLocale(orgSlug)
      ])

      // Check if component is still mounted before updating state
      if (isMounted && !isMounted()) return

      // Set org currency for formatting
      if (localeResult.success && localeResult.locale) {
        setOrgCurrency(localeResult.locale.default_currency)
      }

      // Set provider meta (for icon display)
      if (metaResult.success && metaResult.provider) {
        setProviderMeta(metaResult.provider)
      }

      // Set cost data from Polars (source of truth for costs)
      if (costsResult.success) {
        setCostSummary(costsResult.summary)
        setCostRecords(costsResult.data || [])
      } else {
        setCostSummary(null)
        setCostRecords([])
      }

      if (plansResult.success) {
        setPlans(plansResult.plans || [])
        setTotalMonthlyCost(plansResult.total_monthly_cost || 0)  // Fallback if no Polars data
      } else {
        setPlans([])
        setTotalMonthlyCost(0)

        if (plansResult.error?.includes("API key not found")) {
          setError("Backend not configured. Please complete organization onboarding in Settings to enable subscription tracking.")
        } else if (plansResult.error?.includes("Invalid provider name")) {
          setError(`Provider "${provider}" is not recognized. Please check the provider name and try again.`)
        } else {
          setError(plansResult.error || "Failed to load plans")
        }
      }
    } catch (err) {
      // Handle unexpected errors during parallel fetching
      console.error("Error loading provider data:", err)
      if (!isMounted || isMounted()) {
        setError("Failed to load provider data. Please try again.")
        setPlans([])
        setTotalMonthlyCost(0)
        setCostSummary(null)
        setCostRecords([])
      }
    } finally {
      if (!isMounted || isMounted()) setLoading(false)
    }
  }, [orgSlug, provider, isValidParams])

  useEffect(() => {
    let mounted = true
    loadPlans(() => mounted)
    return () => { mounted = false }
  }, [loadPlans])

  const providerDisplayName = getProviderDisplayName(provider)
  // Filter plans based on showDeleted toggle
  const visiblePlans = showDeleted
    ? plans // Show all plans including cancelled/expired
    : plans.filter(p => p.status === 'active' || p.status === 'pending')
  // Total active seats = sum of all seats from active plans
  const totalActiveSeats = plans.filter(p => p.status === 'active').reduce((sum, p) => sum + (p.seats ?? 0), 0)
  const activeSubscriptionsCount = plans.filter(p => p.status === 'active' && (p.seats ?? 0) > 0).length
  const deletedPlansCount = plans.filter(p => p.status === 'cancelled' || p.status === 'expired').length

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
              <CreditCard className="h-6 w-6 text-[#007A78]" />
            </div>
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-10 w-48" />
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton count={3} />
        </div>

        {/* Plans Table Skeleton */}
        <Card className="console-table-card">
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="px-0">
            {/* Table Header */}
            <div className="console-table-header-row grid grid-cols-12 gap-4 px-4 py-3 border-b bg-slate-50/50">
              {[1, 3, 2, 2, 2, 2].map((span, i) => (
                <div key={i} className={`col-span-${span}`}>
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
            {/* Table Rows */}
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 px-4 py-3.5">
                  <div className="col-span-1"><Skeleton className="h-6 w-10" /></div>
                  <div className="col-span-3"><Skeleton className="h-6 w-full" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-20 ml-auto" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-16" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-12 ml-auto" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-16 ml-auto" /></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link
          href={`/${orgSlug}/settings/integrations/subscriptions`}
          className="text-[#007A78] hover:text-[#005F5D] transition-colors focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded truncate max-w-[200px]"
          title="Subscriptions"
        >
          Subscriptions
        </Link>
        <ChevronRight className="h-4 w-4 text-[#8E8E93] flex-shrink-0" aria-hidden="true" />
        <span className="text-gray-900 font-medium truncate max-w-[300px]" title={providerDisplayName}>{providerDisplayName}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/subscriptions`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#FF6E50]/10 to-[#FF8A73]/10 text-[#FF6E50]">
            {/* Get category from first plan if available, otherwise use default icon */}
            {plans.length > 0 && plans[0].category ? categoryIcons[plans[0].category] || categoryIcons.other : <CreditCard className="h-6 w-6" />}
          </div>
          <div>
            <h1 className="console-page-title">{providerDisplayName}</h1>
            <p className="console-subheading">
              Manage subscription plans for {providerDisplayName}
            </p>
          </div>
        </div>
        {plans.length > 0 && (
          <div className="flex items-center gap-2">
            <Link href={`/${orgSlug}/subscriptions/${provider}/add`}>
              <Button className="h-[36px] px-4 bg-[#FF6E50] text-white hover:bg-[#E55A3C] rounded-xl text-[15px] font-semibold" data-testid="add-from-template-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add from Template
              </Button>
            </Link>
            <Link href={`/${orgSlug}/subscriptions/${provider}/add/custom`}>
              <Button variant="outline" className="border-[#FF6E50]/30 text-[#FF6E50] hover:bg-[#FF6E50]/5 rounded-xl" data-testid="add-custom-subscription-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Provider Alias Info Banner */}
      {isAliased && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                All {rawProvider.replace(/_/g, " ")} plans are managed under <strong>{getProviderDisplayName(provider)}</strong>.
                You&apos;re viewing the correct provider page.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <Card className="border-red-200 bg-red-50 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-100"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardContent className="pt-6 pr-10">
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-xs text-red-500 mt-1">
              Make sure the provider is enabled and API service is running.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Info Banner - Cost Update Timing */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              New changes to subscription costs will be reflected within 24 hours once the scheduler runs every day at midnight.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="console-stat-card border-[#FF6E50]/20">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[#FF6E50]">{formatCurrency(effectiveMonthlyCost, orgCurrency)}</div>
            <p className="text-sm text-muted-foreground">Monthly Cost</p>
            {costSummary && (
              <p className="text-xs text-muted-foreground mt-1">From pipeline data</p>
            )}
          </CardContent>
        </Card>
        <Card className="console-stat-card border-[#FF6E50]/20">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[#FF6E50]">{totalActiveSeats}</div>
            <p className="text-sm text-muted-foreground">Total Active Seats</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card border-[#FF6E50]/20">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[#FF6E50]">{activeSubscriptionsCount}</div>
            <p className="text-sm text-muted-foreground">Active Subscriptions</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card border-[#FF6E50]/20">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[#FF6E50]">{visiblePlans.length}</div>
            <p className="text-sm text-muted-foreground">Available Plans</p>
          </CardContent>
        </Card>
      </div>

      {/* Plans Table */}
      <Card className="console-table-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="console-card-title">{providerDisplayName} Plans</CardTitle>
              <CardDescription>
                Toggle plans on/off to include them in cost tracking. Click a row to see more details.
              </CardDescription>
            </div>
            {deletedPlansCount > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="show-deleted" className="text-sm text-slate-500 cursor-pointer" data-testid="show-deleted-label">
                  Show cancelled ({deletedPlansCount})
                </label>
                <input
                  id="show-deleted"
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#007A78] focus:ring-[#007A78] cursor-pointer"
                  data-testid="show-deleted-checkbox"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {visiblePlans.length === 0 ? (
            <div className="text-center py-12 px-6">
              <div className="inline-flex p-4 rounded-2xl bg-[#007A78]/10 mb-4">
                <CreditCard className="h-12 w-12 text-[#007A78]" />
              </div>
              <h3 className="text-[20px] font-semibold text-black mb-2">No subscriptions yet</h3>
              <p className="text-[15px] text-[#8E8E93] mb-6">
                Choose a predefined plan or create a custom one.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link href={`/${orgSlug}/subscriptions/${provider}/add`}>
                  <Button className="h-[44px] px-6 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold shadow-sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add from Template
                  </Button>
                </Link>
                <Link href={`/${orgSlug}/subscriptions/${provider}/add/custom`}>
                  <Button variant="outline" className="h-[44px] px-6 border-[#007A78]/30 text-[#007A78] hover:bg-[#007A78]/5 rounded-xl" data-testid="add-custom-subscription-empty-btn">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Subscription
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="console-table-header-row grid grid-cols-12 gap-4 px-4 py-3 border-b bg-slate-50/50">
                <div className="col-span-1 console-table-header">Status</div>
                <div className="col-span-3 console-table-header">Plan Name</div>
                <div className="col-span-2 console-table-header text-right">Cost</div>
                <div className="col-span-2 console-table-header">Billing</div>
                <div className="col-span-2 console-table-header text-right">Seats</div>
                <div className="col-span-2 console-table-header text-right">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {visiblePlans.map((plan) => {
                  // A plan is truly "active" only if it has seats assigned
                  const hasActiveSeats = (plan.seats ?? 0) > 0
                  const isActive = (plan.status === 'active' || plan.status === 'pending') && hasActiveSeats
                  const isPending = plan.status === 'pending' || (plan.start_date && new Date(plan.start_date) > new Date())
                  // Display status: show "inactive" for plans with 0 seats
                  const displayStatus = hasActiveSeats ? plan.status : 'inactive'
                  const statusColors: Record<string, string> = {
                    active: "bg-green-100 text-green-700 border-green-200",
                    inactive: "bg-slate-100 text-slate-600 border-slate-200",
                    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
                    cancelled: "bg-gray-100 text-gray-700 border-gray-200",
                    expired: "bg-red-100 text-red-700 border-red-200"
                  }

                  return (
                  <div key={plan.subscription_id} data-testid={`plan-row-${plan.subscription_id}`}>
                    {/* Main Row */}
                    <div
                      className={`console-table-row grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-[#F0FDFA] cursor-pointer transition-colors ${!isActive ? "opacity-50" : ""}`}
                      onClick={() => setExpandedRow(expandedRow === plan.subscription_id ? null : plan.subscription_id)}
                      data-testid={`plan-row-clickable-${plan.subscription_id}`}
                    >
                      <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                        <Badge
                          variant="outline"
                          className={`capitalize text-xs ${statusColors[displayStatus] || statusColors.inactive}`}
                        >
                          {displayStatus}
                        </Badge>
                      </div>
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 truncate max-w-[200px]" title={plan.display_name || plan.plan_name}>
                            {plan.display_name || plan.plan_name}
                          </span>
                          {isPending && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200"
                              title="This plan will become active when the start date arrives"
                            >
                              Pending {plan.start_date && `(${format(new Date(plan.start_date), 'MMM d')})`}
                            </Badge>
                          )}
                          {expandedRow === plan.subscription_id ? (
                            <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="font-medium text-[#FF6E50]">
                          {formatCurrency(plan.unit_price_usd, orgCurrency)}
                        </div>
                        {plan.pricing_model && (
                          <div className="text-xs text-slate-500">
                            {plan.pricing_model === 'PER_SEAT' ? '/seat' : 'flat fee'}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Badge variant="outline" className="capitalize bg-slate-50">
                          {plan.billing_cycle}
                        </Badge>
                      </div>
                      <div className="col-span-2 text-right text-slate-600">
                        {plan.seats ?? 0}
                      </div>
                      <div className="col-span-2 text-right flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/${orgSlug}/subscriptions/${provider}/${plan.subscription_id}/edit`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#FF6E50] hover:bg-[#FF6E50]/10"
                            title="Edit plan"
                            aria-label="Edit plan"
                            data-testid={`edit-plan-${plan.subscription_id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/${orgSlug}/subscriptions/${provider}/${plan.subscription_id}/end`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-amber-600 hover:bg-amber-50"
                            title="End subscription"
                            aria-label="End subscription"
                            data-testid={`end-plan-${plan.subscription_id}`}
                          >
                            <CalendarX className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/* Expanded Details Row */}
                    {expandedRow === plan.subscription_id && (
                      <div className="bg-slate-50/50 px-4 py-4 border-t border-slate-100">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {plan.start_date && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Start Date</span>
                              <span className="font-medium">{formatDateOnly(plan.start_date)}</span>
                            </div>
                          )}
                          {plan.renewal_date && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Renewal Date</span>
                              <span className="font-medium">{formatDateOnly(plan.renewal_date)}</span>
                            </div>
                          )}
                          {plan.owner_email && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Owner</span>
                              <span className="font-medium">{plan.owner_email}</span>
                            </div>
                          )}
                          {plan.department && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Department</span>
                              <span className="font-medium">{plan.department}</span>
                            </div>
                          )}
                          {plan.contract_id && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Contract ID</span>
                              <span className="font-medium">{plan.contract_id}</span>
                            </div>
                          )}
                          {plan.currency && plan.currency !== 'USD' && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Currency</span>
                              <span className="font-medium">{plan.currency}</span>
                            </div>
                          )}
                          {plan.auto_renew !== undefined && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Auto Renew</span>
                              <Badge variant={plan.auto_renew ? "default" : "outline"}>
                                {plan.auto_renew ? "Yes" : "No"}
                              </Badge>
                            </div>
                          )}
                          {plan.discount_type && plan.discount_value !== undefined && plan.discount_value > 0 && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Discount</span>
                              <span className="font-medium text-green-600">
                                {plan.discount_type === 'percent' ? `${plan.discount_value}%` : formatCurrency(plan.discount_value, orgCurrency)}
                              </span>
                            </div>
                          )}
                          {plan.category && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Category</span>
                              <Badge variant="outline" className="capitalize">{plan.category}</Badge>
                            </div>
                          )}
                          {plan.notes && (
                            <div className="col-span-2 md:col-span-4">
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Notes</span>
                              <span className="text-slate-700">{plan.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>

              {/* Add Custom Subscription Footer */}
              <div className="px-4 py-4 border-t border-slate-200 bg-slate-50/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    Don&apos;t see your subscription plan?
                  </p>
                  <Link href={`/${orgSlug}/subscriptions/${provider}/add/custom`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[#FF6E50] border-[#FF6E50]/30 hover:bg-[#FF6E50]/5 rounded-xl"
                      data-testid="add-custom-subscription-footer-btn"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom Subscription
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
