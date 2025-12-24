"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Check, Brain, Palette, FileText, MessageSquare, Code, Cloud, CreditCard, ChevronRight, ChevronDown, ChevronUp, AlertCircle, Plus, Wallet, Sparkles, Zap } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import {
  getAllProviders,
  enableProvider,
  disableProvider,
  type ProviderInfo,
} from "@/actions/subscription-providers"

// Category brand colors
const CATEGORY_COLORS: Record<string, { brand: string; light: string }> = {
  ai: { brand: "#8B5CF6", light: "bg-purple-50" },
  design: { brand: "#EC4899", light: "bg-pink-50" },
  productivity: { brand: "#10B981", light: "bg-emerald-50" },
  communication: { brand: "#3B82F6", light: "bg-blue-50" },
  development: { brand: "#F59E0B", light: "bg-amber-50" },
  cloud: { brand: "#06B6D4", light: "bg-cyan-50" },
  other: { brand: "#007A78", light: "bg-teal-50" },
}

function SubscriptionProviderCard({
  provider,
  orgSlug,
  onToggle,
  isToggling,
}: {
  provider: ProviderInfo
  orgSlug: string
  onToggle: (provider: string, enabled: boolean) => void
  isToggling: boolean
}) {
  const router = useRouter()

  const categoryIcons: Record<string, React.ReactNode> = {
    ai: <Brain className="h-5 w-5" />,
    design: <Palette className="h-5 w-5" />,
    productivity: <FileText className="h-5 w-5" />,
    communication: <MessageSquare className="h-5 w-5" />,
    development: <Code className="h-5 w-5" />,
    cloud: <Cloud className="h-5 w-5" />,
    other: <CreditCard className="h-5 w-5" />,
  }

  const icon = categoryIcons[provider.category] || categoryIcons.other
  const colors = CATEGORY_COLORS[provider.category] || CATEGORY_COLORS.other
  const hasPlans = provider.is_enabled && provider.plan_count > 0

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm hover:shadow-md transition-all duration-300`}>
      {/* Provider Brand Accent */}
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: colors.brand }} />

      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Provider Icon with Category Color */}
            <div className={`h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.light} ring-1 ring-black/5`}>
              <div style={{ color: colors.brand }}>{icon}</div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[16px] font-bold text-black truncate">{provider.display_name}</h3>
                {hasPlans && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#007A78]/10 animate-pulse">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#007A78]" />
                    <span className="text-[10px] font-semibold text-[#007A78] uppercase tracking-wide">Active</span>
                  </div>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground capitalize leading-relaxed">{provider.category}</p>
            </div>
          </div>
        </div>

        {/* Plan Status Badge */}
        {provider.is_enabled && (
          <div className="mb-4 flex items-center gap-2 text-[12px]">
            {hasPlans ? (
              <>
                <Badge className="bg-[#007A78] text-white border-0 font-medium px-3 py-1">
                  <Check className="h-3 w-3 mr-1.5 stroke-[2.5]" />
                  {provider.plan_count} Plan{provider.plan_count !== 1 ? 's' : ''} Configured
                </Badge>
              </>
            ) : (
              <Badge className="bg-[#FF6E50]/10 text-[#FF6E50] border-0 font-medium px-3 py-1">
                <AlertCircle className="h-3 w-3 mr-1.5" />
                No Plans Added
              </Badge>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            className={`w-full h-11 inline-flex items-center justify-center gap-2 text-[14px] font-semibold rounded-xl transition-all duration-300 ${
              provider.is_enabled
                ? hasPlans
                  ? "bg-[#007A78]/5 hover:bg-[#007A78]/10 text-[#007A78]"
                  : "bg-[#007A78] hover:bg-[#006664] text-white shadow-sm hover:shadow-md"
                : "bg-[#007A78] hover:bg-[#006664] text-white shadow-sm hover:shadow-md"
            }`}
            onClick={(e) => {
              e.stopPropagation()
              if (!provider.is_enabled) {
                onToggle(provider.provider, true)
              } else {
                router.push(`/${orgSlug}/integrations/subscriptions/${provider.provider}`)
              }
            }}
            disabled={isToggling}
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : provider.is_enabled ? (
              hasPlans ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Manage Plans
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Plans
                </>
              )
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Setup Provider
              </>
            )}
          </button>
        </div>

        {/* Status Toggle - Only show if enabled */}
        {provider.is_enabled && (
          <div
            className="flex items-center justify-between mt-4 pt-4 border-t border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-muted-foreground">
                {hasPlans ? 'Tracking Active' : 'Ready to Configure'}
              </span>
            </div>
            <Switch
              checked={provider.is_enabled}
              onCheckedChange={(checked) => onToggle(provider.provider, checked)}
              disabled={isToggling}
              className="data-[state=checked]:bg-[#007A78]"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function SubscriptionIntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const isValidOrgSlug = orgSlug && typeof orgSlug === 'string' && /^[a-zA-Z0-9_-]{2,100}$/.test(orgSlug)

  const [subscriptionProviders, setSubscriptionProviders] = useState<ProviderInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null)
  const [showAllProviders, setShowAllProviders] = useState(false)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)
  const INITIAL_PROVIDERS_COUNT = 20

  const loadData = useCallback(async () => {
    if (!isValidOrgSlug) {
      setError("Invalid organization. Please check the URL.")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const [onboardingStatus, apiKeyResult] = await Promise.all([
      checkBackendOnboarding(orgSlug),
      hasStoredApiKey(orgSlug),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    const result = await getAllProviders(orgSlug)
    if (result.success && result.providers) {
      setSubscriptionProviders(result.providers)
    } else {
      setError(result.error || "Failed to load providers")
    }

    setIsLoading(false)
  }, [orgSlug, isValidOrgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  const handleToggle = async (provider: string, enabled: boolean) => {
    const previousProviders = [...subscriptionProviders]
    setSubscriptionProviders(prev =>
      prev.map(p => p.provider === provider ? { ...p, is_enabled: enabled } : p)
    )

    setTogglingProvider(provider)
    setError(null)
    setSuccessMessage(null)

    try {
      const displayName = provider.replace(/_/g, ' ')
      let success = false
      let errorMsg: string | undefined

      if (enabled) {
        const result = await enableProvider(orgSlug, provider)
        success = result.success
        if (result.success) {
          setSuccessMessage(
            `${displayName} enabled${result.plans_seeded ? ` (${result.plans_seeded} plans seeded)` : ''}`
          )
        } else {
          errorMsg = result.error
        }
      } else {
        const result = await disableProvider(orgSlug, provider)
        success = result.success
        if (result.success) {
          setSuccessMessage(`${displayName} disabled`)
          if (result.partial_failure) {
            setError(result.partial_failure)
          }
        } else {
          errorMsg = result.error
        }
      }

      setTogglingProvider(null)

      if (success) {
        await loadData()
      } else {
        setSubscriptionProviders(previousProviders)
        setError(errorMsg || `Failed to ${enabled ? 'enable' : 'disable'} provider`)
      }
    } catch {
      setSubscriptionProviders(previousProviders)
      setTogglingProvider(null)
      setError(`Failed to ${enabled ? 'enable' : 'disable'} provider`)
    }
  }

  const enabledCount = subscriptionProviders.filter(p => p.is_enabled).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#007A78] mx-auto mb-4" />
          <p className="text-[15px] text-muted-foreground">Loading providers...</p>
        </div>
      </div>
    )
  }

  const configuredCount = subscriptionProviders.filter(p => p.is_enabled && p.plan_count > 0).length

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#007A78] to-[#005F5D] flex items-center justify-center shadow-lg">
            <CreditCard className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-[32px] sm:text-[36px] font-bold text-black tracking-tight">Subscription Providers</h1>
            <p className="text-[15px] text-muted-foreground mt-0.5">
              Track fixed-cost SaaS subscriptions and manage plans across your organization
            </p>
          </div>
        </div>

        {/* Connection Summary Badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-gradient-to-r from-[#007A78]/10 to-[#007A78]/5 border border-[#007A78]/20">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#007A78] animate-pulse" />
              <span className="text-[13px] font-semibold text-[#007A78]">
                {configuredCount} / {subscriptionProviders.length}
              </span>
            </div>
            <span className="text-[13px] text-muted-foreground">providers with plans</span>
          </div>

          <Link href={`/${orgSlug}/cost-dashboards/subscription-costs`}>
            <button className="h-10 px-5 inline-flex items-center justify-center gap-2 bg-[#FF6E50] hover:bg-[#E55A3C] text-white text-[13px] font-semibold rounded-full transition-all shadow-sm hover:shadow-md">
              <Wallet className="h-4 w-4" />
              View Costs
            </button>
          </Link>
        </div>
      </div>

      {/* Backend Connection Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="rounded-2xl border border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-[#FF6E50]/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-[#FF6E50]" />
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="text-[16px] font-bold text-black">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Complete organization onboarding to manage subscription providers securely.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="h-11 px-5 inline-flex items-center gap-2 bg-[#007A78] hover:bg-[#005F5D] text-white text-[14px] font-semibold rounded-xl transition-colors shadow-sm">
                  Go to Settings
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="rounded-2xl border border-[#FF6E50]/30 bg-[#FF6E50]/10 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] flex-shrink-0" />
            <p className="text-[14px] font-semibold text-[#FF6E50]">{error}</p>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {successMessage && (
        <div className="rounded-2xl border border-[#007A78]/30 bg-[#007A78]/10 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-[#007A78] flex-shrink-0" />
            <p className="text-[14px] font-semibold text-[#007A78]">{successMessage}</p>
          </div>
        </div>
      )}

      {subscriptionProviders.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-20 text-center shadow-sm">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[#007A78]/10 mb-6">
            <CreditCard className="h-8 w-8 text-[#007A78]" />
          </div>
          <h3 className="text-[20px] font-bold text-black mb-2">
            No subscription providers available
          </h3>
          <p className="text-[14px] text-muted-foreground max-w-sm mx-auto">
            No providers available in the catalog. Contact support if you need custom providers.
          </p>
        </div>
      ) : (
        <>
          {/* Provider Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-5 sm:gap-6">
            {(showAllProviders ? subscriptionProviders : subscriptionProviders.slice(0, INITIAL_PROVIDERS_COUNT)).map((provider) => (
              <SubscriptionProviderCard
                key={provider.provider}
                provider={provider}
                orgSlug={orgSlug}
                onToggle={handleToggle}
                isToggling={togglingProvider === provider.provider}
              />
            ))}
          </div>

          {subscriptionProviders.length > INITIAL_PROVIDERS_COUNT && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setShowAllProviders(!showAllProviders)}
                className="h-11 px-6 inline-flex items-center justify-center gap-2 bg-[#007A78]/5 hover:bg-[#007A78]/10 text-[#007A78] text-[14px] font-semibold rounded-xl transition-colors"
              >
                {showAllProviders ? (
                  <>Show Less <ChevronUp className="h-4 w-4" /></>
                ) : (
                  <>Show {subscriptionProviders.length - INITIAL_PROVIDERS_COUNT} More <ChevronDown className="h-4 w-4" /></>
                )}
              </button>
            </div>
          )}

          {/* Add Custom Provider */}
          <div className="rounded-2xl border border-[#007A78]/20 bg-gradient-to-br from-[#F0FDFA] to-white p-8 text-center shadow-sm">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[#007A78]/10 mb-4">
              <Plus className="h-6 w-6 text-[#007A78]" />
            </div>
            <h3 className="text-[18px] font-bold text-black mb-2">
              Can't find your provider?
            </h3>
            <p className="text-[14px] text-muted-foreground mb-6 max-w-md mx-auto">
              Add a custom subscription to track any SaaS tool not in our catalog.
            </p>
            <Link href={`/${orgSlug}/integrations/subscriptions/custom/add`}>
              <button className="h-11 px-6 inline-flex items-center justify-center gap-2 bg-[#007A78] hover:bg-[#006664] text-white text-[14px] font-semibold rounded-xl transition-colors shadow-sm hover:shadow-md">
                <Plus className="h-4 w-4" />
                Add Custom Provider
              </button>
            </Link>
          </div>

          {/* Security Notice */}
          <div className="rounded-2xl border border-[#007A78]/20 bg-gradient-to-br from-[#F0FDFA] to-white p-6 text-center shadow-sm">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[#007A78]/10 mb-3">
              <svg className="h-6 w-6 text-[#007A78]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-[14px] text-muted-foreground font-medium leading-relaxed max-w-2xl mx-auto">
              All subscription data is stored securely with <span className="font-bold text-[#007A78]">enterprise-grade encryption</span>. Your billing information is never exposed.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
