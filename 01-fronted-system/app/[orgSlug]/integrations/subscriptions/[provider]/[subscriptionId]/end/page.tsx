"use client"

/**
 * End Subscription Page
 *
 * Confirmation page for ending a SaaS subscription.
 * Provides subscription summary, end date picker, and warning about cost calculations.
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, CalendarX, Loader2, ChevronRight, AlertTriangle } from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DatePicker } from "@/components/ui/date-picker"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getProviderPlans,
  endSubscription,
  SubscriptionPlan,
} from "@/actions/subscription-providers"
import { getOrgLocale } from "@/actions/organization-locale"
import { formatCurrency, DEFAULT_CURRENCY } from "@/lib/i18n"

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

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

export default function EndSubscriptionPage() {
  const params = useParams<{ orgSlug: string; provider: string; subscriptionId: string }>()
  const router = useRouter()
  const { orgSlug, provider, subscriptionId } = params

  // Validate params
  const isValidParams = orgSlug && provider && subscriptionId &&
    typeof orgSlug === "string" && typeof provider === "string" && typeof subscriptionId === "string"

  // State
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY)
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<Date | undefined>(new Date())

  const providerDisplayName = getProviderDisplayName(provider)

  // Load plan details and org currency
  useEffect(() => {
    if (!isValidParams) {
      setError("Invalid page parameters")
      setLoading(false)
      return
    }

    let mounted = true

    const loadData = async () => {
      try {
        // Fetch org locale and plan details in parallel
        const [localeResult, plansResult] = await Promise.all([
          getOrgLocale(orgSlug),
          getProviderPlans(orgSlug, provider)
        ])

        if (!mounted) return

        // Set currency from org locale
        if (localeResult.success && localeResult.locale) {
          setCurrency(localeResult.locale.default_currency)
        }

        // Find the specific plan by subscription ID
        if (plansResult.success && plansResult.plans) {
          const foundPlan = plansResult.plans.find(p => p.subscription_id === subscriptionId)
          if (foundPlan) {
            setPlan(foundPlan)
          } else {
            setError("Subscription not found")
          }
        } else {
          setError(plansResult.error || "Failed to load subscription details")
        }
      } catch (err) {
        if (mounted) {
          setError("Failed to load subscription details")
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadData()

    return () => { mounted = false }
  }, [orgSlug, provider, subscriptionId, isValidParams])

  // Handle end subscription
  const handleEndSubscription = async () => {
    if (!plan || !endDate) {
      setError("End date is required")
      return
    }

    setEnding(true)
    setError(null)

    try {
      const endDateStr = format(endDate, "yyyy-MM-dd")
      const result = await endSubscription(
        orgSlug,
        provider,
        subscriptionId,
        endDateStr
      )

      if (!result.success) {
        setError(result.error || "Failed to end subscription")
        setEnding(false)
        return
      }

      toast.success("Subscription ended successfully")
      // Redirect to success page
      router.push(`/${orgSlug}/integrations/subscriptions/${provider}?action=ended&plan=${encodeURIComponent(plan.plan_name)}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(errorMessage)
    } finally {
      setEnding(false)
    }
  }

  // Calculate monthly cost for display
  const getMonthlyDisplayCost = (p: SubscriptionPlan): number => {
    let monthlyCost = p.unit_price * (p.seats ?? 1)
    if (p.pricing_model === 'FLAT_FEE') monthlyCost = p.unit_price
    if (p.billing_cycle === 'annual') monthlyCost = monthlyCost / 12
    if (p.billing_cycle === 'quarterly') monthlyCost = monthlyCost / 3
    return monthlyCost
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Breadcrumb Skeleton */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Header Skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-64" />
        </div>

        {/* Card Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !plan) {
    return (
      <div className="p-6 space-y-6">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <Link
            href={`/${orgSlug}/integrations/subscriptions`}
            className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors"
          >
            Subscription Providers
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Link
            href={`/${orgSlug}/integrations/subscriptions/${provider}`}
            className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors"
          >
            {providerDisplayName}
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-gray-900 font-medium">End Subscription</span>
        </nav>

        <Card className="border-[#FF6C5E]/30 bg-[#FF6C5E]/5">
          <CardContent className="pt-6">
            <p className="text-sm text-[#FF6C5E]">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!plan) return null

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link
          href={`/${orgSlug}/integrations/subscriptions`}
          className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2 rounded truncate max-w-[200px]"
          title="Subscription Providers"
        >
          Subscription Providers
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <Link
          href={`/${orgSlug}/integrations/subscriptions/${provider}`}
          className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2 rounded truncate max-w-[200px]"
          title={providerDisplayName}
        >
          {providerDisplayName}
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <span className="text-gray-900 font-medium truncate max-w-[300px]" title={plan.display_name || plan.plan_name}>
          {plan.display_name || plan.plan_name}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <span className="text-gray-900 font-medium">End Subscription</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/integrations/subscriptions/${provider}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="console-page-title">End Subscription</h1>
      </div>

      {/* Warning Banner */}
      <Card className="border-[#FF6C5E]/30 bg-[#FF6C5E]/5">
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#FF6C5E] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[#E55A3C] mb-1">
                This action will end your subscription
              </p>
              <p className="text-sm text-[#FF6C5E]">
                Cost calculations will stop after the end date you select. This change cannot be undone automatically - you'll need to create a new subscription to resume tracking.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="console-card-title">Subscription Summary</CardTitle>
          <CardDescription>
            Review the details before ending this subscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs uppercase tracking-wide">Plan Name</span>
              <span className="font-medium text-slate-900">{plan.display_name || plan.plan_name}</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs uppercase tracking-wide">Status</span>
              <Badge variant="outline" className="capitalize">
                {plan.status}
              </Badge>
            </div>
            {plan.start_date && (
              <div className="space-y-1">
                <span className="text-muted-foreground block text-xs uppercase tracking-wide">Start Date</span>
                <span className="font-medium">{format(new Date(plan.start_date), 'MMM d, yyyy')}</span>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs uppercase tracking-wide">Monthly Cost</span>
              <span className="font-medium text-[#FF6C5E]">
                {formatCurrency(getMonthlyDisplayCost(plan), currency)}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs uppercase tracking-wide">Seats</span>
              <span className="font-medium">{plan.seats ?? 0}</span>
            </div>
            {plan.owner_email && (
              <div className="space-y-1">
                <span className="text-muted-foreground block text-xs uppercase tracking-wide">Owner</span>
                <span className="font-medium">{plan.owner_email}</span>
              </div>
            )}
            {plan.billing_cycle && (
              <div className="space-y-1">
                <span className="text-muted-foreground block text-xs uppercase tracking-wide">Billing Cycle</span>
                <Badge variant="outline" className="capitalize">
                  {plan.billing_cycle}
                </Badge>
              </div>
            )}
            {plan.pricing_model && (
              <div className="space-y-1">
                <span className="text-muted-foreground block text-xs uppercase tracking-wide">Pricing Model</span>
                <span className="font-medium">
                  {plan.pricing_model === 'PER_SEAT' ? 'Per Seat' : 'Flat Fee'}
                </span>
              </div>
            )}
          </div>

          {/* End Date Picker */}
          <div className="space-y-2 pt-4 border-t">
            <label className="text-sm font-medium text-slate-900">
              End Date <span className="text-[#FF6C5E]">*</span>
            </label>
            <DatePicker
              date={endDate}
              onSelect={setEndDate}
              placeholder="Select end date"
              disabled={ending}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Costs will stop being calculated after this date. The subscription will be marked as cancelled.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="rounded-lg bg-[#FF6C5E]/5 border border-[#FF6C5E]/30 p-3">
              <p className="text-sm text-[#FF6C5E]">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/${orgSlug}/integrations/subscriptions/${provider}`)}
              disabled={ending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEndSubscription}
              disabled={ending || !endDate}
              className="min-w-[160px] bg-[#FF6C5E] text-white hover:bg-[#E55A3C] rounded-xl"
            >
              {ending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ending...
                </>
              ) : (
                <>
                  <CalendarX className="h-4 w-4 mr-2" />
                  End Subscription
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
