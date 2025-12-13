"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Check, Cloud, Brain, Sparkles, Cpu, ChevronRight, ChevronDown, ChevronUp, RefreshCw, AlertCircle, Gem, CreditCard, Plus, Palette, FileText, MessageSquare, Code } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { getIntegrations, validateIntegration, IntegrationProvider, toggleIntegrationEnabled } from "@/actions/integrations"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import {
  getAllProviders,
  enableProvider,
  disableProvider,
  type ProviderInfo,
} from "@/actions/subscription-providers"

// ============================================
// Types
// ============================================

interface Integration {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED"
  credential_name?: string
  last_validated_at?: string
  last_error?: string
  created_at?: string
  is_enabled?: boolean
}

interface ProviderConfig {
  id: string
  backendKey: string
  name: string
  description: string
  icon: React.ReactNode
  href: string
}

// ============================================
// Provider Configs
// ============================================

const PROVIDERS: ProviderConfig[] = [
  {
    id: "gcp",
    backendKey: "GCP_SA",
    name: "Google Cloud Platform",
    description: "Service Account for GCP Billing and BigQuery",
    icon: <Cloud className="h-5 w-5" />,
    href: "gcp",
  },
  {
    id: "openai",
    backendKey: "OPENAI",
    name: "OpenAI",
    description: "GPT-4, GPT-3.5, DALL-E models",
    icon: <Brain className="h-5 w-5" />,
    href: "openai",
  },
  {
    id: "anthropic",
    backendKey: "ANTHROPIC",
    name: "Anthropic (Claude)",
    description: "Claude 3.5 Sonnet, Opus, Haiku models",
    icon: <Sparkles className="h-5 w-5" />,
    href: "anthropic",
  },
  {
    id: "gemini",
    backendKey: "GEMINI",
    name: "Google Gemini",
    description: "Gemini Pro, Gemini Flash, Gemma models",
    icon: <Gem className="h-5 w-5" />,
    href: "gemini",
  },
  {
    id: "deepseek",
    backendKey: "DEEPSEEK",
    name: "DeepSeek",
    description: "DeepSeek-V3, DeepSeek-Coder models",
    icon: <Cpu className="h-5 w-5" />,
    href: "deepseek",
  },
]

// ============================================
// Status Badge Component (only shown for connected providers)
// ============================================

function ConnectedBadge() {
  return (
    <Badge variant="default" className="bg-[#007A78] text-white border-0 font-medium">
      <Check className="h-3 w-3 mr-1 stroke-[2.5]" />
      Connected
    </Badge>
  )
}

// ============================================
// Integration Overview Card
// ============================================

function IntegrationOverviewCard({
  provider,
  integration,
  orgSlug,
  onValidate,
  onToggle,
  isValidating,
  isToggling,
}: {
  provider: ProviderConfig
  integration?: Integration
  orgSlug: string
  onValidate: (providerId: string) => void
  onToggle: (providerId: string, enabled: boolean) => void
  isValidating: boolean
  isToggling: boolean
}) {
  const status = integration?.status || "NOT_CONFIGURED"
  const isConnected = status === "VALID"
  const isEnabled = integration?.is_enabled !== false

  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 ${!isEnabled && isConnected ? 'opacity-50' : ''}`}>
      {/* Header with icon, title, description, and status */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isEnabled ? 'bg-[#007A78]/10' : 'bg-gray-100'}`}>
            <div className={isEnabled ? 'text-[#007A78]' : 'text-gray-400'}>
              {provider.icon}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{provider.name}</p>
            <p className="text-xs text-gray-500 line-clamp-1">{provider.description}</p>
          </div>
        </div>
        {isConnected && isEnabled && (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-[#007A78]/10 text-[#007A78] whitespace-nowrap flex-shrink-0">
            Connected
          </span>
        )}
      </div>

      {/* Last validated date */}
      {integration?.last_validated_at && isConnected && isEnabled && (
        <div className="text-xs text-gray-500 mb-3">
          Last validated: {formatDate(integration.last_validated_at)}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {isConnected && isEnabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              onValidate(provider.id)
            }}
            disabled={isValidating}
            className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg border-0"
            title="Re-validate"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
        <Link href={`/${orgSlug}/settings/integrations/${provider.href}`} className={isConnected && isEnabled ? 'flex-1' : 'w-full'}>
          <Button
            variant={isConnected ? "ghost" : "outline"}
            size="sm"
            className={isConnected
              ? "w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg border-0"
              : "w-full py-2 px-4 bg-[#007A78] hover:bg-[#005F5D] text-white text-sm font-medium rounded-lg border-0"
            }
          >
            {isConnected ? (
              <>
                Configure
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </Link>
      </div>

      {/* Enable/Disable toggle - moved to bottom for mobile */}
      {isConnected && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs font-medium text-gray-600">{isEnabled ? 'Enabled' : 'Disabled'}</span>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => onToggle(provider.id, checked)}
            disabled={isToggling}
            className="data-[state=checked]:bg-[#007A78]"
          />
        </div>
      )}
    </div>
  )
}

// ============================================
// Subscription Provider Card Component
// ============================================

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
    <div
      className={`bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 ${provider.is_enabled ? 'cursor-pointer' : 'opacity-50'}`}
      onClick={() => {
        if (provider.is_enabled) {
          router.push(`/${orgSlug}/subscriptions/${provider.provider}`)
        }
      }}
    >
      {/* Header with icon, title, and category */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${provider.is_enabled ? 'bg-[#007A78]/10' : 'bg-gray-100'}`}>
          <div className={provider.is_enabled ? 'text-[#007A78]' : 'text-gray-400'}>
            {icon}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{provider.display_name}</p>
          <p className="text-xs text-gray-500 capitalize">{provider.category}</p>
        </div>
        {provider.is_enabled && provider.plan_count > 0 && (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-[#007A78]/10 text-[#007A78] whitespace-nowrap flex-shrink-0">
            {provider.plan_count} plan{provider.plan_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Action button */}
      {provider.is_enabled && (
        <button
          className="w-full py-2 px-4 bg-[#007A78] hover:bg-[#005F5D] text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/${orgSlug}/subscriptions/${provider.provider}`)
          }}
          data-testid={`manage-plans-btn-${provider.provider}`}
        >
          Manage Plans
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Enable/Disable toggle */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs font-medium text-gray-600">{provider.is_enabled ? 'Enabled' : 'Disabled'}</span>
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

// ============================================
// Main Page Component
// ============================================

export default function IntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [integrations, setIntegrations] = useState<Record<string, Integration>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [validatingProvider, setValidatingProvider] = useState<string | null>(null)
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)

  // Subscription Providers state
  const [subscriptionProviders, setSubscriptionProviders] = useState<ProviderInfo[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [togglingSubscriptionProvider, setTogglingSubscriptionProvider] = useState<string | null>(null)
  const [showAllProviders, setShowAllProviders] = useState(false)
  const INITIAL_PROVIDERS_COUNT = 20

  // Load integrations and check backend status
  const loadIntegrations = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Check backend connection status first
    const [onboardingStatus, apiKeyResult] = await Promise.all([
      checkBackendOnboarding(orgSlug),
      hasStoredApiKey(orgSlug),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    // Load integrations even if backend not connected (shows current Supabase status)
    const result = await getIntegrations(orgSlug)

    if (result.success && result.integrations) {
      setIntegrations(result.integrations.integrations)
    } else {
      setError(result.error || "Failed to load integrations")
    }

    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    void loadIntegrations()
  }, [orgSlug, loadIntegrations])

  // Clear messages after delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Handle validate
  const handleValidate = async (providerId: string) => {
    try {
      setValidatingProvider(providerId)
      setError(null)
      setSuccessMessage(null)

      const result = await validateIntegration(orgSlug, providerId)

      if (result.validationStatus === "VALID") {
        setSuccessMessage(`${providerId.toUpperCase()} validated successfully`)
      } else {
        setError(result.error || `${providerId.toUpperCase()} validation failed`)
      }

      await loadIntegrations()
    } catch (error: unknown) {
      console.error("[Integrations] Validation error:", error)
      setError(error instanceof Error ? error.message : "Failed to validate integration")
    } finally {
      setValidatingProvider(null)
    }
  }

  // Handle toggle enable/disable
  const handleToggle = async (providerId: string, enabled: boolean) => {
    try {
      setTogglingProvider(providerId)
      setError(null)
      setSuccessMessage(null)

      const result = await toggleIntegrationEnabled(orgSlug, providerId as IntegrationProvider, enabled)

      if (result.success) {
        setSuccessMessage(`${providerId.toUpperCase()} ${enabled ? 'enabled' : 'disabled'} successfully`)
        await loadIntegrations()
      } else {
        setError(result.error || `Failed to ${enabled ? 'enable' : 'disable'} ${providerId.toUpperCase()}`)
      }
    } catch (error: unknown) {
      console.error("[Integrations] Toggle error:", error)
      setError(error instanceof Error ? error.message : "Failed to toggle integration")
    } finally {
      setTogglingProvider(null)
    }
  }

  // Load subscription providers
  const loadSubscriptionProviders = useCallback(async () => {
    setProvidersLoading(true)
    const result = await getAllProviders(orgSlug)
    if (result.success && result.providers) {
      setSubscriptionProviders(result.providers)
    }
    setProvidersLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadSubscriptionProviders()
  }, [loadSubscriptionProviders])

  // Handle subscription provider toggle
  const handleSubscriptionProviderToggle = async (provider: string, enabled: boolean) => {
    // Optimistic update: update local state immediately for instant feedback
    const previousProviders = [...subscriptionProviders]
    setSubscriptionProviders(prev =>
      prev.map(p => p.provider === provider ? { ...p, is_enabled: enabled } : p)
    )

    setTogglingSubscriptionProvider(provider)
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
        } else {
          errorMsg = result.error
        }
      }

      setTogglingSubscriptionProvider(null)

      if (success) {
        // Refresh to get accurate data from server
        await loadSubscriptionProviders()
      } else {
        // Revert optimistic update on failure
        setSubscriptionProviders(previousProviders)
        setError(errorMsg || `Failed to ${enabled ? 'enable' : 'disable'} provider`)
      }
    } catch (error) {
      // Revert optimistic update on error
      setSubscriptionProviders(previousProviders)
      setTogglingSubscriptionProvider(null)
      setError(`Failed to ${enabled ? 'enable' : 'disable'} provider`)
    }
  }

  // Count connected integrations
  const connectedCount = Object.values(integrations).filter(
    (i) => i.status === "VALID"
  ).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto">
        {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Integrations</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Connect your LLM providers and cloud accounts. Credentials are encrypted using Google Cloud KMS.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[#007A78]/10 border border-[#007A78]/20">
          <Check className="h-4 w-4 text-[#007A78] stroke-[2.5]" />
          <span className="text-xs sm:text-sm text-gray-700">Connected:</span>
          <span className="text-xs sm:text-sm font-bold text-[#007A78]">{connectedCount} / {PROVIDERS.length}</span>
        </div>

        {/* Backend Connection Warning */}
        {(!backendConnected || !hasApiKey) && (
          <Alert className="border border-[#FF6E50]/30 bg-[#FFF5F3]">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[#FF6E50]" />
            <AlertTitle className="text-sm sm:text-base text-gray-900 font-semibold">
              {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
            </AlertTitle>
            <AlertDescription className="text-xs sm:text-sm text-gray-700">
              {!backendConnected ? (
                <>
                  Your organization is not connected to the pipeline backend.
                  Integrations cannot be configured until backend onboarding is complete.
                </>
              ) : (
                <>
                  Your organization API key is missing.
                  This is required to configure and use integrations.
                </>
              )}
              <div className="mt-3">
                <Link href={`/${orgSlug}/settings/onboarding`}>
                  <Button variant="outline" size="sm" className="bg-white border border-[#FF6E50] text-[#FF6E50] hover:bg-[#FFF5F3] font-medium text-xs sm:text-sm">
                    <Cloud className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    Go to Onboarding Settings
                  </Button>
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="border border-[#FF6E50]/30 bg-[#FFF5F3]">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[#FF6E50]" />
            <AlertTitle className="text-sm sm:text-base text-gray-900 font-semibold">Error</AlertTitle>
            <AlertDescription className="text-xs sm:text-sm text-gray-700">{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="border border-[#007A78]/30 bg-[#007A78]/5">
            <Check className="h-4 w-4 sm:h-5 sm:w-5 text-[#007A78]" />
            <AlertTitle className="text-sm sm:text-base text-gray-900 font-semibold">Success</AlertTitle>
            <AlertDescription className="text-xs sm:text-sm text-gray-700">{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Cloud Providers */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Cloud Providers</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Connect your cloud infrastructure</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {PROVIDERS.filter((p) => p.id === "gcp").map((provider) => (
              <IntegrationOverviewCard
                key={provider.id}
                provider={provider}
                integration={integrations[provider.backendKey]}
                orgSlug={orgSlug}
                onValidate={handleValidate}
                onToggle={handleToggle}
                isValidating={validatingProvider === provider.id}
                isToggling={togglingProvider === provider.id}
              />
            ))}
          </div>
        </div>

        {/* LLM Providers */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">LLM Providers</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Connect API keys for per-token usage tracking and cost analysis</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {PROVIDERS.filter((p) => p.id !== "gcp").map((provider) => (
              <IntegrationOverviewCard
                key={provider.id}
                provider={provider}
                integration={integrations[provider.backendKey]}
                orgSlug={orgSlug}
                onValidate={handleValidate}
                onToggle={handleToggle}
                isValidating={validatingProvider === provider.id}
                isToggling={togglingProvider === provider.id}
              />
            ))}
          </div>
        </div>

        {/* Subscription Providers */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Subscription Providers</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Track fixed-cost SaaS subscriptions. Enable providers to manage plans.</p>
            </div>
            <Link href={`/${orgSlug}/subscriptions`}>
              <Button variant="outline" size="sm" className="bg-[#007A78] hover:bg-[#005F5D] text-white border-0 font-medium h-9 px-4 text-xs sm:text-sm">
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                Add Provider
              </Button>
            </Link>
          </div>

          {providersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
            </div>
          ) : subscriptionProviders.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 bg-white rounded-xl py-12 text-center">
              <div className="inline-flex p-4 rounded-2xl bg-[#8E8E93]/10 mb-4">
                <CreditCard className="h-12 w-12 text-[#8E8E93]" />
              </div>
              <h3 className="text-[20px] font-semibold text-black mb-2">
                No subscription providers available
              </h3>
              <p className="text-[15px] text-[#8E8E93]">
                Add providers to start tracking SaaS subscriptions
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {(showAllProviders ? subscriptionProviders : subscriptionProviders.slice(0, INITIAL_PROVIDERS_COUNT)).map((provider) => (
                  <SubscriptionProviderCard
                    key={provider.provider}
                    provider={provider}
                    orgSlug={orgSlug}
                    onToggle={handleSubscriptionProviderToggle}
                    isToggling={togglingSubscriptionProvider === provider.provider}
                  />
                ))}
              </div>
              {subscriptionProviders.length > INITIAL_PROVIDERS_COUNT && !showAllProviders && (
                <div className="mt-6 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllProviders(true)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium border-0 h-9 px-4 text-xs sm:text-sm"
                  >
                    Show {subscriptionProviders.length - INITIAL_PROVIDERS_COUNT} more providers
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
              {showAllProviders && subscriptionProviders.length > INITIAL_PROVIDERS_COUNT && (
                <div className="mt-6 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllProviders(false)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium border-0 h-9 px-4 text-xs sm:text-sm"
                  >
                    Show less
                    <ChevronUp className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Security Note */}
        <div className="rounded-xl border border-gray-200 p-4 sm:p-6 bg-white">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Check className="h-4 w-4 sm:h-5 sm:w-5 text-[#007A78] stroke-[2.5]" />
            Security
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            All credentials are encrypted using Google Cloud KMS before storage. We never store plaintext API keys or secrets.
            Credentials are decrypted only when needed to make API calls on your behalf.
          </p>
        </div>
      </div>
    </div>
  )
}
