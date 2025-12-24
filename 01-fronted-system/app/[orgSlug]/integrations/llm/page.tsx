"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Brain, Sparkles, Cpu, ChevronRight, RefreshCw, AlertCircle, Gem, Zap } from "lucide-react"
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
  brandColor: string
  lightBg: string
}

const LLM_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    backendKey: "OPENAI",
    name: "OpenAI",
    description: "GPT-4, GPT-3.5, DALL-E models",
    icon: <Brain className="h-5 w-5" />,
    href: "llm/openai",
    brandColor: "#10A37F",
    lightBg: "bg-emerald-50",
  },
  {
    id: "anthropic",
    backendKey: "ANTHROPIC",
    name: "Anthropic (Claude)",
    description: "Claude 3.5 Sonnet, Opus, Haiku models",
    icon: <Sparkles className="h-5 w-5" />,
    href: "llm/anthropic",
    brandColor: "#D97706",
    lightBg: "bg-amber-50",
  },
  {
    id: "gemini",
    backendKey: "GEMINI",
    name: "Google Gemini",
    description: "Gemini Pro, Gemini Flash, Gemma models",
    icon: <Gem className="h-5 w-5" />,
    href: "llm/gemini",
    brandColor: "#4285F4",
    lightBg: "bg-blue-50",
  },
  {
    id: "deepseek",
    backendKey: "DEEPSEEK",
    name: "DeepSeek",
    description: "DeepSeek-V3, DeepSeek-Coder models",
    icon: <Cpu className="h-5 w-5" />,
    href: "llm/deepseek",
    brandColor: "#8B5CF6",
    lightBg: "bg-purple-50",
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
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm hover:shadow-md transition-all duration-300 ${!isEnabled && isConnected ? 'opacity-60' : ''}`}>
      {/* Provider Brand Accent */}
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: provider.brandColor }} />

      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Provider Icon with Brand Color */}
            <div
              className={`h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0 ${provider.lightBg} ring-1 ring-black/5`}
            >
              <div style={{ color: provider.brandColor }}>{provider.icon}</div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[16px] font-bold text-black truncate">{provider.name}</h3>
                {isConnected && isEnabled && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#007A78]/10 animate-pulse">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#007A78]" />
                    <span className="text-[10px] font-semibold text-[#007A78] uppercase tracking-wide">Live</span>
                  </div>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">{provider.description}</p>
            </div>
          </div>
        </div>

        {/* Connection Status Badge */}
        {isConnected && isEnabled && (
          <div className="mb-4 flex items-center gap-2 text-[12px]">
            <Badge className="bg-[#007A78] text-white border-0 font-medium px-3 py-1">
              <Check className="h-3 w-3 mr-1.5 stroke-[2.5]" />
              Connected
            </Badge>
            {integration?.last_validated_at && (
              <span className="text-muted-foreground">
                Validated {formatDate(integration.last_validated_at)}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {isConnected && isEnabled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                onValidate(provider.id)
              }}
              disabled={isValidating}
              className="flex-1 h-11 bg-[#007A78]/5 hover:bg-[#007A78]/10 text-muted-foreground text-[14px] font-medium rounded-xl border-0 transition-colors"
              title="Re-validate connection"
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Validate
                </>
              )}
            </Button>
          )}
          <Link href={`/${orgSlug}/integrations/${provider.href}`} className={isConnected && isEnabled ? 'flex-1' : 'w-full'}>
            <Button
              size="sm"
              className={isConnected && isEnabled
                ? "w-full h-11 bg-[#007A78]/5 hover:bg-[#007A78]/10 text-[#007A78] text-[14px] font-semibold rounded-xl border-0 transition-colors"
                : "w-full h-11 bg-[#007A78] hover:bg-[#006664] text-white text-[14px] font-semibold rounded-xl border-0 shadow-sm transition-all hover:shadow-md"
              }
            >
              {isConnected && isEnabled ? (
                <>
                  Configure
                  <ChevronRight className="h-4 w-4 ml-1.5" />
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Connect Now
                </>
              )}
            </Button>
          </Link>
        </div>

        {/* Enable/Disable Toggle */}
        {isConnected && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-muted-foreground">
                {isEnabled ? 'Active' : 'Paused'}
              </span>
              {!isEnabled && (
                <span className="text-[11px] text-muted-foreground">(Usage tracking disabled)</span>
              )}
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => onToggle(provider.id, checked)}
              disabled={isToggling}
              className="data-[state=checked]:bg-[#007A78]"
            />
          </div>
        )}
      </div>
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
        setSuccessMessage(`${providerId.toUpperCase()} validated successfully`)
      } else {
        setError(result.error || `${providerId.toUpperCase()} validation failed`)
      }

      await loadIntegrations()
    } catch (error: unknown) {
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
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#007A78] mx-auto mb-4" />
          <p className="text-[14px] text-muted-foreground">Loading LLM providers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#007A78] to-[#005F5D] flex items-center justify-center shadow-lg">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-[32px] sm:text-[36px] font-bold text-black tracking-tight">LLM Providers</h1>
            <p className="text-[15px] text-muted-foreground mt-0.5">
              Connect API keys for per-token usage tracking and cost analysis
            </p>
          </div>
        </div>

        {/* Connection Summary Badge */}
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-gradient-to-r from-[#007A78]/10 to-[#007A78]/5 border border-[#007A78]/20">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#007A78] animate-pulse" />
            <span className="text-[13px] font-semibold text-[#007A78]">
              {connectedCount} / {LLM_PROVIDERS.length}
            </span>
          </div>
          <span className="text-[13px] text-muted-foreground">providers connected</span>
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
                Complete organization onboarding to configure integrations and start tracking LLM usage.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <Button className="h-11 px-5 bg-[#007A78] text-white text-[14px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors shadow-sm">
                  Go to Settings
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
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

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-5 sm:gap-6">
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

      {/* Security Notice */}
      <div className="rounded-2xl border border-[#007A78]/20 bg-gradient-to-br from-[#F0FDFA] to-white p-6 text-center shadow-sm">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[#007A78]/10 mb-3">
          <svg className="h-6 w-6 text-[#007A78]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <p className="text-[14px] text-muted-foreground font-medium leading-relaxed max-w-2xl mx-auto">
          All credentials are encrypted using <span className="font-bold text-[#007A78]">Google Cloud KMS</span> before storage. Your API keys are never exposed in logs or transmitted unencrypted.
        </p>
      </div>
    </div>
  )
}
