"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Brain, Sparkles, ChevronRight, RefreshCw, AlertCircle, Shield } from "lucide-react"
import Link from "next/link"

import { Switch } from "@/components/ui/switch"
import { ProviderLogo } from "@/components/ui/provider-logo"
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
  href: string
  accent: string
}

const GENAI_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    backendKey: "OPENAI",
    name: "OpenAI",
    description: "GPT-4, GPT-3.5, DALL-E",
    href: "genai/openai",
    accent: "#10A37F",
  },
  {
    id: "anthropic",
    backendKey: "ANTHROPIC",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Opus, Haiku",
    href: "genai/anthropic",
    accent: "#D97706",
  },
  {
    id: "gemini",
    backendKey: "GEMINI",
    name: "Google Gemini",
    description: "Gemini Pro, Flash, Gemma",
    href: "genai/gemini",
    accent: "#4285F4",
  },
  {
    id: "deepseek",
    backendKey: "DEEPSEEK",
    name: "DeepSeek",
    description: "DeepSeek-V3, DeepSeek-Coder",
    href: "genai/deepseek",
    accent: "#8B5CF6",
  },
]

export default function GenAIIntegrationsPage() {
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
      checkBackendOnboarding(orgSlug, { skipValidation: true, timeout: 3000 }),
      hasStoredApiKey(orgSlug),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    const result = await getIntegrations(orgSlug)

    if (result.success && result.integrations) {
      setIntegrations(result.integrations?.integrations || {})
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
        setSuccessMessage(`${providerId.charAt(0).toUpperCase() + providerId.slice(1)} validated successfully`)
      } else {
        const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
        const errorDetail = result.error || result.lastError || "Unknown error"
        setError(`${providerName} validation failed: ${errorDetail}`)
      }

      await loadIntegrations()
    } catch (err: unknown) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(`${providerName} validation error: ${errorMessage}`)
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
        setSuccessMessage(`${providerId.charAt(0).toUpperCase() + providerId.slice(1)} ${enabled ? 'enabled' : 'disabled'}`)
        await loadIntegrations()
      } else {
        const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
        const action = enabled ? 'enable' : 'disable'
        const errorDetail = result.error || "Unknown error"
        setError(`Failed to ${action} ${providerName}: ${errorDetail}`)
      }
    } catch (err: unknown) {
      const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1)
      const action = enabled ? 'enable' : 'disable'
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(`Failed to ${action} ${providerName}: ${errorMessage}`)
    } finally {
      setTogglingProvider(null)
    }
  }

  const connectedProviders = GENAI_PROVIDERS.filter(p => integrations[p.backendKey]?.status === "VALID")
  const unconnectedProviders = GENAI_PROVIDERS.filter(p => integrations[p.backendKey]?.status !== "VALID")

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            GenAI Providers
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
            Connect your AI/ML providers to track usage and costs
          </p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
            <p className="text-[14px] text-slate-500 font-medium">Loading providers...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-0">
      {/* Header */}
      <div className="mb-6 sm:mb-10">
        <h1 className="text-[24px] sm:text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          GenAI Providers
        </h1>
        <p className="text-[13px] sm:text-[15px] text-slate-500 mt-1.5 sm:mt-2 max-w-lg">
          Connect your AI/ML providers to track usage and costs
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 sm:gap-6 py-4 sm:py-5 px-4 sm:px-6 bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
            <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{connectedProviders.length}</p>
            <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Connected</p>
          </div>
        </div>
        <div className="h-6 sm:h-8 w-px bg-slate-200 flex-shrink-0"></div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500" />
          </div>
          <div>
            <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{unconnectedProviders.length}</p>
            <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Available</p>
          </div>
        </div>
      </div>

      {/* Backend Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-slate-600 mt-0.5">
                Complete organization onboarding to configure integrations.
              </p>
              <Link
                href={`/${orgSlug}/settings/organization`}
                className="inline-flex items-center gap-1 mt-2 text-[13px] font-semibold text-slate-900 hover:text-slate-900 transition-colors"
              >
                Go to Settings
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Alerts - with ARIA live regions for screen reader announcements */}
      {error && (
        <div
          className="p-4 rounded-xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6C5E] flex-shrink-0" aria-hidden="true" />
            <p className="text-[14px] font-medium text-[#FF6C5E]">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div
          className="p-4 rounded-xl bg-[#90FCA6]/15 border border-[#90FCA6]/30"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-[#1a7a3a] flex-shrink-0" aria-hidden="true" />
            <p className="text-[14px] font-medium text-[#1a7a3a]">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Connected Providers */}
      {connectedProviders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Connected</h2>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {connectedProviders.map((provider) => {
              const integration = integrations[provider.backendKey]
              const isEnabled = integration?.is_enabled !== false
              const isValidating = validatingProvider === provider.id
              const isToggling = togglingProvider === provider.id

              return (
                <div key={provider.id} className="group relative">
                  {/* Left accent */}
                  <div
                    className="absolute left-0 top-4 bottom-4 w-1 rounded-full"
                    style={{ backgroundColor: provider.accent }}
                  />

                  <div className="pl-5 py-4 pr-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div
                          className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${provider.accent}15` }}
                        >
                          <ProviderLogo provider={provider.id} category="genai" size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-slate-900">{provider.name}</h3>
                            {isEnabled && (
                              <span className="px-2 py-0.5 rounded-full bg-[#90FCA6]/15 text-[#1a7a3a] text-[10px] font-semibold uppercase tracking-wide">
                                Live
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-slate-500 mt-0.5">{provider.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleValidate(provider.id)}
                          disabled={isValidating}
                          aria-label={`Validate ${provider.name} integration`}
                          aria-busy={isValidating}
                          className="h-9 px-3 text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5"
                        >
                          {isValidating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Validate
                        </button>
                        <Link href={`/${orgSlug}/integrations/${provider.href}`}>
                          <button
                            className="h-9 px-3 text-[13px] font-semibold text-slate-900 bg-[#90FCA6] hover:bg-[#B8FDCA] rounded-xl transition-all flex items-center gap-1"
                            aria-label={`Configure ${provider.name} integration`}
                          >
                            Configure
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </Link>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => handleToggle(provider.id, checked)}
                          disabled={isToggling}
                          aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${provider.name} integration`}
                          className="data-[state=checked]:bg-[#90FCA6]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available Providers */}
      {unconnectedProviders.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-[12px] sm:text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Available</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3" role="list" aria-label="Available GenAI providers">
            {unconnectedProviders.map((provider) => (
              <Link
                key={provider.id}
                href={`/${orgSlug}/integrations/${provider.href}`}
                className="group p-4 sm:p-5 bg-white rounded-xl sm:rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all touch-manipulation"
                aria-label={`Connect ${provider.name} - ${provider.description}`}
                role="listitem"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div
                      className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${provider.accent}10` }}
                    >
                      <ProviderLogo provider={provider.id} category="genai" size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[13px] sm:text-[14px] font-semibold text-slate-900 truncate">{provider.name}</h3>
                      <p className="text-[11px] sm:text-[12px] text-slate-500 truncate">{provider.description}</p>
                    </div>
                  </div>
                  <span
                    className="h-8 px-3 text-[11px] sm:text-[12px] font-semibold text-slate-900 bg-[#90FCA6] hover:bg-[#B8FDCA] rounded-lg sm:rounded-xl transition-all flex items-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    Connect
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Security Notice */}
      <div className="p-4 sm:p-6 bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-[#90FCA6]/10 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[16px] font-semibold text-slate-900">Secure Storage</h3>
            <p className="text-[12px] sm:text-[14px] text-slate-600 mt-1.5 sm:mt-2 leading-relaxed">
              All API keys are encrypted using Google Cloud KMS with AES-256 encryption before storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
