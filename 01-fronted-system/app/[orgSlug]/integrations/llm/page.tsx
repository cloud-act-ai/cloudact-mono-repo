"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Brain, Sparkles, Cpu, ChevronRight, RefreshCw, AlertCircle, Gem } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { getIntegrations, validateIntegration, IntegrationProvider, toggleIntegrationEnabled } from "@/actions/integrations"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"

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

const LLM_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    backendKey: "OPENAI",
    name: "OpenAI",
    description: "GPT-4, GPT-3.5, DALL-E models",
    icon: <Brain className="h-5 w-5" />,
    href: "llm/openai",
  },
  {
    id: "anthropic",
    backendKey: "ANTHROPIC",
    name: "Anthropic (Claude)",
    description: "Claude 3.5 Sonnet, Opus, Haiku models",
    icon: <Sparkles className="h-5 w-5" />,
    href: "llm/anthropic",
  },
  {
    id: "gemini",
    backendKey: "GEMINI",
    name: "Google Gemini",
    description: "Gemini Pro, Gemini Flash, Gemma models",
    icon: <Gem className="h-5 w-5" />,
    href: "llm/gemini",
  },
  {
    id: "deepseek",
    backendKey: "DEEPSEEK",
    name: "DeepSeek",
    description: "DeepSeek-V3, DeepSeek-Coder models",
    icon: <Cpu className="h-5 w-5" />,
    href: "llm/deepseek",
  },
]

function LLMProviderCard({
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
    <div className={`metric-card p-5 transition-all ${!isEnabled && isConnected ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-[#007A78]/10' : 'bg-[#F5F5F7]'}`}>
            <div className={isEnabled ? 'text-[#007A78]' : 'text-[#8E8E93]'}>{provider.icon}</div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-black truncate">{provider.name}</p>
            <p className="text-[13px] text-[#8E8E93] line-clamp-1">{provider.description}</p>
          </div>
        </div>
        {isConnected && isEnabled && (
          <Badge className="bg-[#007A78] text-white border-0 text-[11px] font-medium">
            <Check className="h-3 w-3 mr-1 stroke-[2.5]" />
            Connected
          </Badge>
        )}
      </div>

      {integration?.last_validated_at && isConnected && isEnabled && (
        <div className="text-[12px] text-[#8E8E93] mb-3">
          Last validated: {formatDate(integration.last_validated_at)}
        </div>
      )}

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
            className="flex-1 h-[36px] bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#8E8E93] text-[15px] font-medium rounded-xl border-0"
            title="Re-validate"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
        <Link href={`/${orgSlug}/integrations/${provider.href}`} className={isConnected && isEnabled ? 'flex-1' : 'w-full'}>
          <Button
            size="sm"
            className={isConnected
              ? "w-full h-[36px] bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#8E8E93] text-[15px] font-medium rounded-xl border-0"
              : "w-full h-[36px] bg-[#007A78] hover:bg-[#006664] text-white text-[15px] font-semibold rounded-xl border-0"
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

      {isConnected && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#E5E5EA]">
          <span className="text-[12px] font-medium text-[#8E8E93]">{isEnabled ? 'Enabled' : 'Disabled'}</span>
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

export default function LLMIntegrationsPage() {
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

  const loadIntegrations = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [onboardingStatus, apiKeyResult] = await Promise.all([
      checkBackendOnboarding(orgSlug),
      hasStoredApiKey(orgSlug),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

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

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

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

  const connectedCount = LLM_PROVIDERS.filter(p =>
    integrations[p.backendKey]?.status === "VALID"
  ).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">LLM Providers</h1>
        <p className="text-[15px] text-[#8E8E93] mt-1">
          Connect API keys for per-token usage tracking and cost analysis
        </p>
      </div>

      {(!backendConnected || !hasApiKey) && (
        <div className="health-card bg-[#FF6E50]/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold text-black">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-[#8E8E93]">
                Complete organization onboarding to configure integrations.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="inline-flex items-center gap-2 h-[36px] px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors">
                  Go to Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="health-card bg-[#FF6E50]/10 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] flex-shrink-0" />
            <p className="text-[15px] font-medium text-[#FF6E50]">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="health-card bg-[#007A78]/10 p-4">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-[#007A78] flex-shrink-0" />
            <p className="text-[15px] font-medium text-[#007A78]">{successMessage}</p>
          </div>
        </div>
      )}

      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007A78]/10 border border-[#007A78]/20">
        <Check className="h-4 w-4 text-[#007A78] stroke-[2.5]" />
        <span className="text-[13px] text-[#8E8E93]">Connected:</span>
        <span className="text-[13px] font-bold text-[#007A78]">{connectedCount} / {LLM_PROVIDERS.length}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {LLM_PROVIDERS.map((provider) => (
          <LLMProviderCard
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

      <div className="health-card p-6 text-center">
        <p className="text-[13px] text-[#8E8E93] font-medium">
          All credentials are encrypted using Google Cloud KMS before storage.
        </p>
      </div>
    </div>
  )
}
