"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Cloud, ChevronRight, RefreshCw, AlertCircle, Server, Database, Zap } from "lucide-react"
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
  brandColor: string
  lightBg: string
  href: string
  comingSoon?: boolean
}

const CLOUD_PROVIDERS: ProviderConfig[] = [
  {
    id: "gcp",
    backendKey: "GCP_SA",
    name: "Google Cloud Platform",
    description: "Service Account for GCP Billing and BigQuery",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.19 2.38a9.344 9.344 0 0 1 9.426 9.428 9.344 9.344 0 0 1-9.426 9.428 9.344 9.344 0 0 1-9.426-9.428A9.344 9.344 0 0 1 12.19 2.38m-.012 2.544a6.751 6.751 0 0 0-6.768 6.76c0 1.745.675 3.408 1.9 4.686l4.796-4.796v-.001a2.423 2.423 0 0 1-.489-1.449c0-1.326 1.07-2.4 2.392-2.4a2.385 2.385 0 0 1 1.447.49v.001l4.796-4.796a6.733 6.733 0 0 0-4.686-1.9 6.705 6.705 0 0 0-3.388.905m0 9.56a2.388 2.388 0 0 1-2.398-2.396c0-.492.149-.965.424-1.364l-1.904-1.904A5.844 5.844 0 0 0 6.388 12c0 3.197 2.593 5.79 5.79 5.79.927 0 1.802-.224 2.578-.619l-1.904-1.904c-.399.275-.872.424-1.364.424m9.228-2.396a5.844 5.844 0 0 0-1.912-3.182l-1.904 1.904c.275.399.424.872.424 1.364a2.388 2.388 0 0 1-2.398 2.398c-.492 0-.965-.149-1.364-.424l-1.904 1.904a5.807 5.807 0 0 0 2.578.619 5.798 5.798 0 0 0 5.79-5.79z"/>
      </svg>
    ),
    brandColor: "#4285F4",
    lightBg: "bg-blue-50",
    href: "cloud-providers/gcp",
  },
  {
    id: "aws",
    backendKey: "AWS",
    name: "Amazon Web Services",
    description: "IAM Role for AWS Cost Explorer",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.144.224-.304.272-.479.047-.175.08-.391.08-.646v-.311a6.67 6.67 0 0 0-.734-.112 5.972 5.972 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.295.837.295zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.782c.151 0 .255.025.312.08.064.048.112.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.216-.151-.256-.223a.562.562 0 0 1-.064-.247v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.415-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.239-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.199.484.484 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.726 3.726 0 0 0-1.532-.312c-.455 0-.815.072-1.061.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167z"/>
      </svg>
    ),
    brandColor: "#FF9900",
    lightBg: "bg-orange-50",
    href: "cloud-providers/aws",
    comingSoon: true,
  },
  {
    id: "azure",
    backendKey: "AZURE",
    name: "Microsoft Azure",
    description: "Service Principal for Azure Cost Management",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.05 16.95L8.5 15.5 10.3 6.9 15.25 8.35 13.05 16.95ZM22.5 17.5L13.4 20.1 10.15 7.5 19.25 4.9 22.5 17.5ZM1.5 15.5L10.6 12.9 8.8 4.3 1.5 6.5V15.5Z"/>
      </svg>
    ),
    brandColor: "#0078D4",
    lightBg: "bg-sky-50",
    href: "cloud-providers/azure",
    comingSoon: true,
  },
]

function CloudProviderCard({
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

  if (provider.comingSoon) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm opacity-60">
        {/* Provider Brand Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-muted" />

        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className={`h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0 ${provider.lightBg} ring-1 ring-black/5`}>
                <div style={{ color: provider.brandColor }}>{provider.icon}</div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-black truncate">{provider.name}</h3>
                <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">{provider.description}</p>
              </div>
            </div>
          </div>
          <Badge className="bg-muted text-muted-foreground border-0 text-[11px] font-semibold px-3 py-1">
            Coming Soon
          </Badge>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm hover:shadow-md transition-all duration-300 ${!isEnabled && isConnected ? 'opacity-60' : ''}`}>
      {/* Provider Brand Accent */}
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: provider.brandColor }} />

      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Provider Icon with Brand Color */}
            <div className={`h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0 ${provider.lightBg} ring-1 ring-black/5`}>
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

  const connectedCount = Object.values(integrations).filter(
    (i) => i.status === "VALID"
  ).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#007A78] mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading cloud providers...</p>
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
            <Cloud className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-[32px] sm:text-[36px] font-bold text-black tracking-tight">Cloud Providers</h1>
            <p className="text-[15px] text-muted-foreground mt-0.5">
              Connect your cloud infrastructure for unified cost tracking and analytics
            </p>
          </div>
        </div>

        {/* Connection Summary Badge */}
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-gradient-to-r from-[#007A78]/10 to-[#007A78]/5 border border-[#007A78]/20">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#007A78] animate-pulse" />
            <span className="text-[13px] font-semibold text-[#007A78]">
              {connectedCount} / {CLOUD_PROVIDERS.filter(p => !p.comingSoon).length}
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
                Complete organization onboarding to configure integrations and start tracking costs.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
        {CLOUD_PROVIDERS.map((provider) => (
          <CloudProviderCard
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
          All credentials are encrypted using <span className="font-bold text-[#007A78]">Google Cloud KMS</span> before storage. Your service account keys are never exposed in logs or transmitted unencrypted.
        </p>
      </div>
    </div>
  )
}
