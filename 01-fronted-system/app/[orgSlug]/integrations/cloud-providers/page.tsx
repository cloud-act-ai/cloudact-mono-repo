"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Cloud, ChevronRight, RefreshCw, AlertCircle, Server, Shield } from "lucide-react"
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
  accent: string
  href: string
  comingSoon?: boolean
}

const CLOUD_PROVIDERS: ProviderConfig[] = [
  {
    id: "gcp",
    backendKey: "GCP_SA",
    name: "Google Cloud",
    description: "Service Account for GCP Billing",
    accent: "#4285F4",
    href: "cloud-providers/gcp",
  },
  {
    id: "aws",
    backendKey: "AWS_IAM",
    name: "Amazon Web Services",
    description: "IAM Role for Cost Explorer",
    accent: "#FF9900",
    href: "cloud-providers/aws",
  },
  {
    id: "azure",
    backendKey: "AZURE",
    name: "Microsoft Azure",
    description: "Service Principal for Cost Management",
    accent: "#0078D4",
    href: "cloud-providers/azure",
  },
  {
    id: "oci",
    backendKey: "OCI",
    name: "Oracle Cloud",
    description: "API Key for Cost Analysis",
    accent: "#F80000",
    href: "cloud-providers/oci",
  },
]

export default function CloudProvidersPage() {
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
        setSuccessMessage(`${providerId.toUpperCase()} validated successfully`)
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
        setSuccessMessage(`${providerId.toUpperCase()} ${enabled ? 'enabled' : 'disabled'}`)
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

  const connectedProviders = CLOUD_PROVIDERS.filter(p => !p.comingSoon && integrations[p.backendKey]?.status === "VALID")
  const availableProviders = CLOUD_PROVIDERS.filter(p => !p.comingSoon && integrations[p.backendKey]?.status !== "VALID")
  const comingSoonProviders = CLOUD_PROVIDERS.filter(p => p.comingSoon)

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-12 w-12 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
            <Cloud className="h-6 w-6 text-[#1a7a3a]" />
          </div>
          <div>
            <h1 className="text-[32px] font-bold text-black tracking-tight">
              Cloud Providers
            </h1>
            <p className="text-[15px] text-slate-500 mt-1">
              Connect your cloud accounts to start tracking costs
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-[#1a7a3a]" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
          <Cloud className="h-6 w-6 text-[#1a7a3a]" />
        </div>
        <div>
          <h1 className="text-[32px] font-bold text-black tracking-tight">
            Cloud Providers
          </h1>
          <p className="text-[15px] text-slate-500 mt-1">
            Connect your cloud accounts to start tracking costs
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 py-5 px-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center">
            <Check className="h-5 w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <p className="text-[24px] font-bold text-black leading-none">{connectedProviders.length}</p>
            <p className="text-[13px] text-slate-500 font-medium mt-1">Connected</p>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Cloud className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-[24px] font-bold text-black leading-none">{availableProviders.length}</p>
            <p className="text-[13px] text-slate-500 font-medium mt-1">Available</p>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Server className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[24px] font-bold text-black leading-none">{comingSoonProviders.length}</p>
            <p className="text-[13px] text-slate-500 font-medium mt-1">Coming Soon</p>
          </div>
        </div>
      </div>

      {/* Backend Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-black">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-slate-600 mt-1">
                Complete organization onboarding to configure integrations.
              </p>
              <Link
                href={`/${orgSlug}/settings/organization`}
                className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-semibold text-slate-900 hover:text-black transition-colors"
              >
                Go to Settings
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="p-5 rounded-2xl bg-red-50 border border-red-200 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <p className="text-[14px] font-medium text-red-700 mt-2">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-5 rounded-2xl bg-[#90FCA6]/10 border border-[#90FCA6]/30 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/20 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <p className="text-[14px] font-semibold text-[#1a7a3a] mt-2">{successMessage}</p>
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
                <div key={provider.id} className="group relative hover:bg-slate-50/50 transition-colors">
                  {/* Left accent */}
                  <div
                    className="absolute left-0 top-5 bottom-5 w-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: provider.accent }}
                  />

                  <div className="pl-6 py-5 pr-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div
                          className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${provider.accent}15` }}
                        >
                          <ProviderLogo provider={provider.id} category="cloud" size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-black">{provider.name}</h3>
                            {isEnabled && (
                              <span className="px-2.5 py-1 rounded-full bg-[#90FCA6]/15 text-[#1a7a3a] text-[10px] font-semibold uppercase">
                                Connected
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] text-slate-500 mt-1">{provider.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleValidate(provider.id)}
                          disabled={isValidating}
                          className="h-10 px-4 text-[13px] font-medium text-slate-600 hover:text-black hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-2"
                        >
                          {isValidating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Validate
                        </button>
                        <Link href={`/${orgSlug}/integrations/${provider.href}`}>
                          <button className="h-10 px-4 text-[13px] font-semibold text-black bg-[#90FCA6] hover:bg-[#6EE890] rounded-xl transition-colors flex items-center gap-1.5">
                            Configure
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </Link>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => handleToggle(provider.backendKey, checked)}
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
      {availableProviders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Available</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {availableProviders.map((provider) => (
              <Link
                key={provider.id}
                href={`/${orgSlug}/integrations/${provider.href}`}
                className="group p-5 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${provider.accent}15` }}
                    >
                      <ProviderLogo provider={provider.id} category="cloud" size={24} />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-black">{provider.name}</h3>
                      <p className="text-[13px] text-slate-500 mt-0.5">{provider.description}</p>
                    </div>
                  </div>
                  <button className="h-10 px-4 text-[13px] font-semibold text-black bg-[#90FCA6] hover:bg-[#6EE890] rounded-xl transition-colors">
                    Connect
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Coming Soon */}
      {comingSoonProviders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">Coming Soon</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {comingSoonProviders.map((provider) => (
              <div
                key={provider.id}
                className="p-5 bg-slate-50 rounded-2xl border border-slate-200 opacity-70"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center bg-white border border-slate-200"
                    >
                      <ProviderLogo provider={provider.id} category="cloud" size={24} fallbackColor="#94a3b8" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-700">{provider.name}</h3>
                      <p className="text-[13px] text-slate-500 mt-0.5">{provider.description}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
                    Soon
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Notice */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
            <Shield className="h-6 w-6 text-[#1a7a3a]" />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-black">Secure Storage</h3>
            <p className="text-[14px] text-slate-600 mt-2 leading-relaxed">
              All service account credentials are encrypted using Google Cloud KMS with AES-256 encryption.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
