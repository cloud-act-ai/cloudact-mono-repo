"use client"

/**
 * Add Subscription from Template Page
 *
 * Shows available plan templates for a provider.
 * Fetches org currency from Supabase and formats pricing accordingly.
 * Redirects to custom form with template data on selection.
 */

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Plus,
  CreditCard,
  ChevronRight,
  Brain,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Cloud,
  HelpCircle,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

import {
  getAvailablePlans,
  type AvailablePlan,
} from "@/actions/subscription-providers"
import { getOrgLocale } from "@/actions/organization-locale"
import { formatCurrency, convertFromUSD, getExchangeRate, DEFAULT_CURRENCY } from "@/lib/i18n"

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

// Category icon mapping
const categoryIcons: Record<string, React.ReactNode> = {
  ai: <Brain className="h-8 w-8" />,
  design: <Palette className="h-8 w-8" />,
  productivity: <FileText className="h-8 w-8" />,
  communication: <MessageSquare className="h-8 w-8" />,
  development: <Code className="h-8 w-8" />,
  cloud: <Cloud className="h-8 w-8" />,
  other: <CreditCard className="h-8 w-8" />,
}

export default function AddFromTemplatePage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const router = useRouter()
  const { orgSlug, provider } = params

  // Validate params
  const isValidParams = orgSlug && provider && typeof orgSlug === "string" && typeof provider === "string"

  // State
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)

  // Load org currency and available plans
  const loadData = useCallback(async (isMounted?: () => boolean) => {
    if (!isValidParams) {
      if (!isMounted || isMounted()) {
        setError("Invalid page parameters")
        setLoading(false)
      }
      return
    }

    if (!isMounted || isMounted()) setLoading(true)
    if (!isMounted || isMounted()) setError(null)
    if (!isMounted || isMounted()) setTemplateError(null)

    try {
      // Fetch org locale and available plans in parallel
      const [localeResult, plansResult] = await Promise.all([
        getOrgLocale(orgSlug),
        getAvailablePlans(orgSlug, provider),
      ])

      // Check if component is still mounted
      if (isMounted && !isMounted()) return

      // Set org currency (default to USD if not found)
      if (localeResult.success && localeResult.locale) {
        setOrgCurrency(localeResult.locale.default_currency || "USD")
      } else {
        setOrgCurrency("USD")
      }

      // Set available plans
      if (plansResult.success) {
        setAvailablePlans(plansResult.plans || [])
      } else {
        setAvailablePlans([])
        if (plansResult.error?.includes("Invalid provider name")) {
          setTemplateError(`Provider "${provider}" is not recognized. Please check the provider name and try again.`)
        } else {
          setTemplateError(plansResult.error || "Failed to load available plans")
        }
      }
    } catch {
      if (!isMounted || isMounted()) {
        setTemplateError("Failed to load template data. Please try again.")
        setAvailablePlans([])
      }
    } finally {
      if (!isMounted || isMounted()) setLoading(false)
    }
  }, [orgSlug, provider, isValidParams])

  useEffect(() => {
    let mounted = true
    loadData(() => mounted)
    return () => { mounted = false }
  }, [loadData])

  // Handle template selection - redirect to custom form with query params
  const handleSelectTemplate = (template: AvailablePlan) => {
    // Convert USD price to org currency
    const convertedPrice = convertFromUSD(template.unit_price, orgCurrency)
    const exchangeRate = getExchangeRate(orgCurrency)
    const convertedYearlyPrice = template.yearly_price
      ? convertFromUSD(template.yearly_price, orgCurrency)
      : undefined

    const searchParams = new URLSearchParams({
      template: template.plan_name,
      display_name: template.display_name || template.plan_name,
      // Pass converted price in org's currency
      unit_price: convertedPrice.toString(),
      currency: orgCurrency,
      seats: (template.seats || 1).toString(),
      billing_cycle: template.billing_cycle,
      pricing_model: template.pricing_model,
      notes: template.notes || "",
      // Audit trail - original USD price
      source_currency: "USD",
      source_price: template.unit_price.toString(),
      exchange_rate_used: exchangeRate.toString(),
    })

    // Add yearly price if available
    if (convertedYearlyPrice !== undefined) {
      searchParams.set("yearly_price", convertedYearlyPrice.toString())
      if (template.yearly_price) {
        searchParams.set("source_yearly_price", template.yearly_price.toString())
      }
    }

    router.push(`/${orgSlug}/integrations/subscriptions/${provider}/add/custom?${searchParams.toString()}`)
  }

  const providerDisplayName = getProviderDisplayName(provider)

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
        </div>

        {/* Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Breadcrumb Navigation - simplified on mobile */}
      <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto pb-1" aria-label="Breadcrumb">
        <Link
          href={`/${orgSlug}/integrations/subscriptions`}
          className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2 rounded truncate max-w-[100px] sm:max-w-[200px] flex-shrink-0"
          title="Subscription Providers"
        >
          <span className="hidden sm:inline">Subscription Providers</span>
          <span className="sm:hidden">Subscriptions</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <Link
          href={`/${orgSlug}/integrations/subscriptions/${provider}`}
          className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2 rounded truncate max-w-[100px] sm:max-w-[200px] flex-shrink-0"
          title={providerDisplayName}
        >
          {providerDisplayName}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <span className="text-gray-900 font-medium truncate max-w-[80px] sm:max-w-[300px] flex-shrink-0" title="Add Subscription">
          Add
        </span>
      </nav>

      {/* Header - stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href={`/${orgSlug}/integrations/subscriptions/${provider}`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight">Choose a Plan Template</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">
              Select a predefined plan for {providerDisplayName}
            </p>
          </div>
        </div>
        <Link href={`/${orgSlug}/integrations/subscriptions/${provider}/add/custom`} className="self-start sm:self-auto ml-11 sm:ml-0">
          <Button
            variant="outline"
            className="h-10 sm:h-9 border-[#90FCA6]/30 text-[#1a7a3a] hover:bg-[#90FCA6]/5 rounded-xl text-sm"
          >
            <Plus className="h-4 w-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Create Custom</span>
            <span className="sm:hidden">Custom</span>
          </Button>
        </Link>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-[#FF6C5E]/30 bg-[#FF6C5E]/5">
          <CardContent className="pt-6">
            <p className="text-sm text-[#FF6C5E]">{error}</p>
            <p className="text-xs text-[#FF6C5E] mt-1">
              Make sure the provider is enabled and API service is running.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Template Loading Error */}
      {templateError && (
        <Card className="border-[#FF6C5E]/30 bg-[#FF6C5E]/5">
          <CardContent className="py-8 text-center">
            <div className="inline-flex p-4 rounded-2xl bg-[#FF6C5E]/10 mb-4">
              <CreditCard className="h-12 w-12 text-[#FF6C5E]" />
            </div>
            <h3 className="text-[20px] font-semibold text-[#FF6C5E] mb-2">Failed to Load Templates</h3>
            <p className="text-[15px] text-[#FF6C5E]/80 mb-6">
              {templateError}
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                className="border-[#FF6C5E]/30 text-[#FF6C5E] hover:bg-[#FF6C5E]/5 rounded-xl"
                onClick={() => loadData(() => true)}
              >
                Try Again
              </Button>
              <Link href={`/${orgSlug}/integrations/subscriptions/${provider}/add/custom`}>
                <Button className="h-[44px] px-6 bg-[#90FCA6] text-black hover:bg-[#006664] rounded-xl text-[15px] font-semibold shadow-sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Custom Plan
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Cards */}
      {!templateError && availablePlans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="inline-flex p-4 rounded-2xl bg-[#8E8E93]/10 mb-4">
              <CreditCard className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-[20px] font-semibold text-black mb-2">No templates available</h3>
            <p className="text-[15px] text-muted-foreground mb-6">
              No predefined templates found for {providerDisplayName}. You can create a custom subscription plan instead.
            </p>
            <Link href={`/${orgSlug}/integrations/subscriptions/${provider}/add/custom`}>
              <Button className="h-[44px] px-6 bg-[#90FCA6] text-black hover:bg-[#006664] rounded-xl text-[15px] font-semibold shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Custom Plan
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : !templateError ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availablePlans.map((plan, index) => (
            <Card
              key={`${plan.plan_name}-${index}`}
              className="console-table-card hover:border-[#90FCA6] hover:shadow-md transition-all cursor-pointer group"
              onClick={() => handleSelectTemplate(plan)}
            >
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#90FCA6]/10 to-[#B8FDCA]/10 text-[#1a7a3a]">
                    {plan.category && categoryIcons[plan.category] ? categoryIcons[plan.category] : categoryIcons.other}
                  </div>
                  <Badge variant="outline" className="capitalize text-xs">
                    {plan.billing_cycle}
                  </Badge>
                </div>
                <CardTitle className="console-card-title text-lg">
                  {plan.display_name || plan.plan_name}
                </CardTitle>
                {plan.notes && (
                  <CardDescription className="text-sm line-clamp-2">
                    {plan.notes}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Pricing - converted to org currency */}
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-2xl font-bold text-[#FF6C5E]">
                      {formatCurrency(convertFromUSD(plan.unit_price, orgCurrency), orgCurrency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {plan.pricing_model === 'PER_SEAT' ? 'per seat' : 'flat fee'} / {plan.billing_cycle}
                    </div>
                    {/* Show original USD price for reference if different currency */}
                    {orgCurrency !== "USD" && (
                      <div className="text-xs text-slate-400 mt-1">
                        (${plan.unit_price.toFixed(2)} USD)
                      </div>
                    )}
                  </div>
                  {plan.seats && plan.seats > 0 && (
                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">{plan.seats}</div>
                      <div className="text-xs text-muted-foreground">seats</div>
                    </div>
                  )}
                </div>

                {/* Discount Badge */}
                {plan.discount_type && plan.discount_value && plan.discount_value > 0 && (
                  <Badge variant="outline" className="text-xs bg-[#F0FDFA] text-[#1a7a3a] border-[#90FCA6]/20">
                    {plan.discount_type === 'percent' ? `${plan.discount_value}% off` : `${formatCurrency(convertFromUSD(plan.discount_value, orgCurrency), orgCurrency)} discount`}
                  </Badge>
                )}

                {/* Select Button */}
                <Button
                  className="w-full h-[40px] bg-[#90FCA6] text-black hover:bg-[#006664] rounded-xl text-[15px] font-semibold group-hover:bg-[#006664]"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectTemplate(plan)
                  }}
                >
                  Select Template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Custom Plan CTA */}
      {!templateError && availablePlans.length > 0 && (
        <Card className="border-[#90FCA6]/20 bg-[#90FCA6]/5">
          <CardContent className="py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base mb-0.5 sm:mb-1">Don't see your plan?</h3>
                <p className="text-xs sm:text-sm text-foreground">
                  Create a custom subscription with your own pricing.
                </p>
              </div>
              <Link href={`/${orgSlug}/integrations/subscriptions/${provider}/add/custom`} className="self-start sm:self-auto">
                <Button
                  variant="outline"
                  className="h-10 sm:h-9 border-[#90FCA6]/30 text-[#1a7a3a] hover:bg-[#90FCA6]/5 rounded-xl"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Custom
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Documentation */}
      <Card className="border-slate-200 mt-6">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <HelpCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-2">
                Adding a Subscription Plan
              </h3>
              <div className="text-[13px] text-slate-600 space-y-2">
                <p><strong>Templates:</strong> Pre-configured plans based on standard {providerDisplayName} pricing. Select a template to auto-fill pricing details, then customize as needed.</p>
                <p><strong>Custom Plans:</strong> Create your own plan if you have negotiated pricing, enterprise agreements, or a plan not listed above.</p>
                <p><strong>Currency:</strong> Prices are automatically converted to your organization's default currency ({orgCurrency}). Original USD pricing is preserved for audit purposes.</p>
                <p className="text-[12px] text-amber-700 bg-amber-50 p-2 rounded-lg mt-3">
                  <strong>Tip:</strong> After selecting a template, you can modify the number of seats, billing cycle, and assign the subscription to a department/project/team for cost allocation.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
