"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Brain, Sparkles, Cpu, ChevronRight, RefreshCw, AlertCircle, Gem, Shield } from "lucide-react"
import Link from "next/link"

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
  accent: string
}

const LLM_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    backendKey: "OPENAI",
    name: "OpenAI",
    description: "GPT-4, GPT-3.5, DALL-E",
    icon: <Brain className="h-5 w-5" />,
    href: "llm/openai",
    accent: "#10A37F",
  },
  {
    id: "anthropic",
    backendKey: "ANTHROPIC",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Opus, Haiku",
    icon: <Sparkles className="h-5 w-5" />,
    href: "llm/anthropic",
    accent: "#D97706",
  },
  {
    id: "gemini",
    backendKey: "GEMINI",
    name: "Google Gemini",
    description: "Gemini Pro, Flash, Gemma",
    icon: <Gem className="h-5 w-5" />,
    href: "llm/gemini",
    accent: "#4285F4",
  },
  {
    id: "deepseek",
    backendKey: "DEEPSEEK",
    name: "DeepSeek",
    description: "DeepSeek-V3, DeepSeek-Coder",
    icon: <Cpu className="h-5 w-5" />,
    href: "llm/deepseek",
    accent: "#8B5CF6",
  },
]

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
        setError(result.error || `Validation failed`)
      }

      await loadIntegrations()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to validate")
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
        setError(result.error || `Failed to toggle`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to toggle")
    } finally {
      setTogglingProvider(null)
    }
  }

  const connectedProviders = LLM_PROVIDERS.filter(p => integrations[p.backendKey]?.status === "VALID")
  const unconnectedProviders = LLM_PROVIDERS.filter(p => integrations[p.backendKey]?.status !== "VALID")

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            LLM Providers
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
            Connect your AI/ML providers to track usage and costs
          </p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-[#8B5CF6]" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          LLM Providers
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Connect your AI/ML providers to track usage and costs
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <p className="text-[24px] font-bold text-slate-900 leading-none">{connectedProviders.length}</p>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">Connected</p>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <p className="text-[24px] font-bold text-slate-900 leading-none">{unconnectedProviders.length}</p>
            <p className="text-[12px] text-slate-500 font-medium mt-0.5">Available</p>
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
                className="inline-flex items-center gap-1 mt-2 text-[13px] font-semibold text-[#007AFF] hover:text-[#0051D5]"
              >
                Go to Settings
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-[14px] font-medium text-red-700">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-[#90FCA6]/5 border border-[#90FCA6]/20">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-[#1a7a3a] flex-shrink-0" />
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
                          <div style={{ color: provider.accent }}>{provider.icon}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-slate-900">{provider.name}</h3>
                            {isEnabled && (
                              <span className="px-2 py-0.5 rounded-full bg-[#90FCA6]/10 text-[#1a7a3a] text-[10px] font-semibold uppercase">
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
                          className="h-9 px-3 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          {isValidating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Validate
                        </button>
                        <Link href={`/${orgSlug}/integrations/${provider.href}`}>
                          <button className="h-9 px-3 text-[13px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1">
                            Configure
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </Link>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => handleToggle(provider.id, checked)}
                          disabled={isToggling}
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
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Available</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {unconnectedProviders.map((provider) => (
              <Link
                key={provider.id}
                href={`/${orgSlug}/integrations/${provider.href}`}
                className="group p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${provider.accent}10` }}
                    >
                      <div style={{ color: provider.accent }}>{provider.icon}</div>
                    </div>
                    <div>
                      <h3 className="text-[14px] font-semibold text-slate-900">{provider.name}</h3>
                      <p className="text-[12px] text-slate-500">{provider.description}</p>
                    </div>
                  </div>
                  <button className="h-8 px-3 text-[12px] font-semibold text-black bg-[#90FCA6] hover:bg-[#B8FDCA] rounded-lg transition-colors">
                    Connect
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Security Notice */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Secure Storage</h3>
            <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
              All API keys are encrypted using Google Cloud KMS with AES-256 encryption before storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
