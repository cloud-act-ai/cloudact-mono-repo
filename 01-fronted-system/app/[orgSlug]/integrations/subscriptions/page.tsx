"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Check, Brain, Palette, FileText, MessageSquare, Code, Cloud, CreditCard, ChevronRight, ChevronDown, ChevronUp, AlertCircle, Plus, Wallet } from "lucide-react"
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

  return (
    <div className="metric-card p-5 transition-all">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${provider.is_enabled ? 'bg-[#007A78]/10' : 'bg-[#007A78]/5'}`}>
            <div className={provider.is_enabled ? 'text-[#007A78]' : 'text-muted-foreground'}>
              {icon}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-black truncate">{provider.display_name}</p>
            <p className="text-[13px] text-muted-foreground capitalize">{provider.category}</p>
          </div>
        </div>
        {provider.is_enabled && provider.plan_count > 0 && (
          <Badge className="bg-[#007A78] text-white border-0 text-[11px] font-medium flex-shrink-0">
            {provider.plan_count} plan{provider.plan_count !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {provider.is_enabled && (
        <button
          className="w-full h-11 mb-4 inline-flex items-center justify-center gap-2 bg-[#007A78] hover:bg-[#006664] text-white text-[15px] font-semibold rounded-xl border-0 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/${orgSlug}/integrations/subscriptions/${provider.provider}`)
          }}
        >
          Manage Plans
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <div
        className="flex items-center justify-between pt-4 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[12px] font-medium text-muted-foreground">{provider.is_enabled ? 'Enabled' : 'Disabled'}</span>
        <Switch
          checked={provider.is_enabled}
          onCheckedChange={(checked) => onToggle(provider.provider, checked)}
          disabled={isToggling}
          className="data-[state=checked]:bg-[#007A78]"
        />
      </div>
    </div>
  )
}

export default function SubscriptionIntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  // Validate orgSlug early to prevent API calls with undefined/invalid values
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
    // Guard against invalid orgSlug
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
          // Check for partial failure
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
        <Loader2 className="h-10 w-10 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Subscription Providers</h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            Track fixed-cost SaaS subscriptions and manage plans
          </p>
        </div>
        <Link href={`/${orgSlug}/cost-dashboards/subscription-costs`}>
          <button className="h-11 px-5 inline-flex items-center justify-center gap-2 bg-[#FF6E50] hover:bg-[#E55A3C] text-white text-[15px] font-semibold rounded-xl transition-colors">
            <Wallet className="h-5 w-5" />
            View Costs
          </button>
        </Link>
      </div>

      {(!backendConnected || !hasApiKey) && (
        <div className="health-card bg-[#FF6E50]/5 border-[#FF6E50]/20">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-[#FF6E50]/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-6 w-6 text-[#FF6E50]" />
            </div>
            <div className="space-y-2 flex-1">
              <h3 className="text-[17px] font-semibold text-[#1C1C1E]">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[15px] text-[#3C3C43]">
                Complete organization onboarding to manage subscription providers securely.
              </p>
            </div>
            <Link href={`/${orgSlug}/settings/organization`}>
              <button className="h-11 px-4 inline-flex items-center gap-2 bg-[#007A78] hover:bg-[#006664] text-white text-[15px] font-semibold rounded-xl transition-colors">
                Go to Settings
              </button>
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="health-card bg-[#FF6E50]/5 border-[#FF6E50]/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] flex-shrink-0" />
            <p className="text-[15px] font-medium text-[#FF6E50]">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="health-card bg-[#007A78]/5 border-[#007A78]/20">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-[#007A78] flex-shrink-0" />
            <p className="text-[15px] font-medium text-[#007A78]">{successMessage}</p>
          </div>
        </div>
      )}

      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007A78]/10 border border-[#007A78]/20 flex-shrink-0">
        <Check className="h-4 w-4 text-[#007A78] stroke-[2.5] flex-shrink-0" />
        <span className="text-[13px] text-muted-foreground">Active:</span>
        <span className="text-[13px] font-bold text-[#007A78]">{enabledCount} / {subscriptionProviders.length}</span>
      </div>

      {subscriptionProviders.length === 0 ? (
        <div className="metric-card py-16 text-center">
          <div className="inline-flex p-5 rounded-2xl bg-[#007A78]/10 mb-6">
            <CreditCard className="h-10 w-10 text-[#007A78]" />
          </div>
          <h3 className="text-[20px] font-bold text-foreground mb-2">
            No subscription providers available
          </h3>
          <p className="text-[15px] text-muted-foreground max-w-sm mx-auto">
            No providers available in the catalog. Contact support if you need custom providers.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                className="h-11 px-6 inline-flex items-center justify-center gap-2 bg-[#007A78]/5 hover:bg-[#007A78]/10 text-muted-foreground text-[15px] font-medium rounded-xl border-0 transition-colors"
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
          <div className="health-card p-6 text-center mt-8">
            <p className="text-[15px] text-muted-foreground mb-4">
              Can't find your provider? Add a custom subscription to track any SaaS tool.
            </p>
            <Link href={`/${orgSlug}/integrations/subscriptions/custom/add`}>
              <button className="h-11 px-5 inline-flex items-center justify-center gap-2 bg-[#007A78] hover:bg-[#006664] text-white text-[15px] font-semibold rounded-xl transition-colors">
                <Plus className="h-5 w-5" />
                Add Custom Provider
              </button>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
