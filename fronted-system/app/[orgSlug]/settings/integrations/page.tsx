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
    <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
      <Check className="h-3 w-3 mr-1" />
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
    <Card className={`console-stat-card transition-all hover:shadow-md ${!isEnabled && isConnected ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isEnabled ? 'bg-[#F0FDFA] text-[#007A78]' : 'bg-gray-100 text-gray-400'}`}>{provider.icon}</div>
            <div>
              <CardTitle className="console-card-title">{provider.name}</CardTitle>
              <CardDescription className="console-small">{provider.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{isEnabled ? 'Enabled' : 'Disabled'}</span>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => onToggle(provider.id, checked)}
                  disabled={isToggling}
                  className="data-[state=checked]:bg-[#007A78]"
                />
              </div>
            )}
            {isConnected && isEnabled && <ConnectedBadge />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center justify-between">
          <div className="console-small text-gray-500">
            {integration?.last_validated_at && isConnected && (
              <span>Last validated: {formatDate(integration.last_validated_at)}</span>
            )}
          </div>
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
                className="h-8 px-2 hover:bg-[#F0FDFA] hover:text-[#007A78]"
                title="Re-validate"
              >
                {isValidating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-[#007A78]" />
                )}
              </Button>
            )}
            <Link href={`/${orgSlug}/settings/integrations/${provider.href}`}>
              <Button variant={isConnected ? "ghost" : "outline"} size="sm" className={isConnected ? "h-8 hover:bg-[#F0FDFA]" : "h-8 console-button-secondary"}>
                {isConnected ? (
                  <ChevronRight className="h-4 w-4 text-[#007A78]" />
                ) : (
                  "Connect"
                )}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
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
    <Card
      className={`console-stat-card transition-all hover:shadow-md cursor-pointer ${!provider.is_enabled ? 'opacity-60' : ''}`}
      onClick={() => {
        if (provider.is_enabled) {
          router.push(`/${orgSlug}/subscriptions/${provider.provider}`)
        }
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${provider.is_enabled ? 'bg-[#F0FDFA] text-[#007A78]' : 'bg-gray-100 text-gray-400'}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="console-card-title">{provider.display_name}</CardTitle>
              <CardDescription className="console-small capitalize">{provider.category}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-gray-500">{provider.is_enabled ? 'Enabled' : 'Disabled'}</span>
            <Switch
              checked={provider.is_enabled}
              onCheckedChange={(checked) => onToggle(provider.provider, checked)}
              disabled={isToggling}
              className="data-[state=checked]:bg-[#007A78]"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center justify-between">
          <div className="console-small text-gray-500">
            {provider.is_enabled && provider.plan_count > 0 && (
              <Badge variant="outline" className="bg-[#F0FDFA] text-[#007A78] border-[#007A78]/20">
                {provider.plan_count} plan{provider.plan_count !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {provider.is_enabled && (
              <Button variant="ghost" size="sm" className="h-8 hover:bg-[#F0FDFA]">
                <ChevronRight className="h-4 w-4 text-[#007A78]" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
  }, [orgSlug])

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
    } catch (err: any) {
      console.error("[Integrations] Validation error:", err)
      setError(err.message || "Failed to validate integration")
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
    } catch (err: any) {
      console.error("[Integrations] Toggle error:", err)
      setError(err.message || "Failed to toggle integration")
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
    setTogglingSubscriptionProvider(provider)
    setError(null)
    setSuccessMessage(null)

    const result = enabled
      ? await enableProvider(orgSlug, provider)
      : await disableProvider(orgSlug, provider)

    setTogglingSubscriptionProvider(null)

    if (result.success) {
      setSuccessMessage(
        enabled
          ? `${provider.replace(/_/g, ' ')} enabled${result.plans_seeded ? ` (${result.plans_seeded} plans seeded)` : ''}`
          : `${provider.replace(/_/g, ' ')} disabled`
      )
      await loadSubscriptionProviders()
    } else {
      setError(result.error || `Failed to ${enabled ? 'enable' : 'disable'} provider`)
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
    <div className="space-y-6">
      <div>
        <h1 className="console-page-title">Integrations</h1>
        <p className="console-subheading">
          Connect your LLM providers and cloud accounts. Credentials are encrypted using Google Cloud KMS.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted console-small w-fit">
        <Check className="h-4 w-4 text-green-600" />
        <span className="text-gray-500">Connected:</span>
        <span className="font-medium text-green-600">{connectedCount} / {PROVIDERS.length}</span>
      </div>

      {/* Backend Connection Warning */}
      {(!backendConnected || !hasApiKey) && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-900/10">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">
            {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
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
                <Button variant="outline" size="sm" className="border-amber-500 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/20">
                  <Cloud className="h-4 w-4 mr-2" />
                  Go to Onboarding Settings
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-500/20 bg-green-500/5">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-600">Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Cloud Providers */}
      <div>
        <h2 className="console-heading mb-3">Cloud Providers</h2>
        <div className="grid gap-4 md:grid-cols-2">
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
      <div>
        <h2 className="console-heading mb-3">LLM Providers</h2>
        <p className="console-small text-gray-500 mb-3">Connect API keys for per-token usage tracking and cost analysis</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="console-heading">Subscription Providers</h2>
            <p className="console-small text-gray-500">Track fixed-cost SaaS subscriptions. Enable providers to manage plans.</p>
          </div>
          <Link href={`/${orgSlug}/subscriptions`}>
            <Button variant="outline" size="sm" className="border-[#007A78] text-[#007A78] hover:bg-[#F0FDFA]">
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </Link>
        </div>

        {providersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
          </div>
        ) : subscriptionProviders.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <CreditCard className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="console-body text-slate-500">
                No subscription providers available.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              <div className="mt-4 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllProviders(true)}
                  className="text-[#007A78] hover:bg-[#F0FDFA]"
                >
                  Show {subscriptionProviders.length - INITIAL_PROVIDERS_COUNT} more providers
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
            {showAllProviders && subscriptionProviders.length > INITIAL_PROVIDERS_COUNT && (
              <div className="mt-4 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllProviders(false)}
                  className="text-gray-500 hover:bg-gray-100"
                >
                  Show less
                  <ChevronUp className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Security Note */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <h3 className="console-body font-medium mb-2 flex items-center gap-2">
          <Check className="h-4 w-4 text-green-600" />
          Security
        </h3>
        <p className="console-small text-gray-500">
          All credentials are encrypted using Google Cloud KMS before storage. We never store plaintext API keys or secrets.
          Credentials are decrypted only when needed to make API calls on your behalf.
        </p>
      </div>
    </div>
  )
}
