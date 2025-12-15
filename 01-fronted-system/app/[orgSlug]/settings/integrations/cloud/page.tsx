"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Cloud, AlertCircle, RefreshCw } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { getIntegrations, validateIntegration, toggleIntegrationEnabled } from "@/actions/integrations"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"

interface Integration {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED"
  credential_name?: string
  last_validated_at?: string
  last_error?: string
  is_enabled?: boolean
}

const CLOUD_PROVIDERS = [
  {
    id: "gcp",
    backendKey: "GCP_SA",
    name: "Google Cloud Platform",
    description: "Connect your GCP service account for billing and resource data",
    href: "gcp",
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
  }, [loadIntegrations])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  const handleValidate = async (providerId: string) => {
    setValidatingProvider(providerId)
    setError(null)
    setSuccessMessage(null)

    const result = await validateIntegration(orgSlug, providerId)

    if (result.validationStatus === "VALID") {
      setSuccessMessage(`${providerId.toUpperCase()} validated successfully`)
    } else {
      setError(result.error || `${providerId.toUpperCase()} validation failed`)
    }

    setValidatingProvider(null)
    await loadIntegrations()
  }

  const handleToggle = async (providerId: string, enabled: boolean) => {
    setTogglingProvider(providerId)
    setError(null)
    setSuccessMessage(null)

    const result = await toggleIntegrationEnabled(orgSlug, providerId as "openai" | "anthropic" | "gcp" | "gemini" | "deepseek", enabled)

    if (result.success) {
      setSuccessMessage(`${providerId.toUpperCase()} ${enabled ? "enabled" : "disabled"}`)
    } else {
      setError(result.error || `Failed to toggle ${providerId}`)
    }

    setTogglingProvider(null)
    await loadIntegrations()
  }

  const connectedCount = CLOUD_PROVIDERS.filter(
    (p) => integrations[p.backendKey]?.status === "VALID"
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
        <h1 className="console-page-title">Cloud Providers</h1>
        <p className="console-subheading">
          Connect your cloud accounts for billing and resource tracking.
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted console-small w-fit">
        <Check className="h-4 w-4 text-[#007A78]" />
        <span className="text-gray-500">Connected:</span>
        <span className="font-medium text-[#007A78]">{connectedCount} / {CLOUD_PROVIDERS.length}</span>
      </div>

      {(!backendConnected || !hasApiKey) && (
        <Alert className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <AlertCircle className="h-4 w-4 text-[#FF6E50]" />
          <AlertTitle className="text-[#E55A3C]">
            {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
          </AlertTitle>
          <AlertDescription className="text-[#FF6E50]">
            {!backendConnected
              ? "Your organization is not connected to the pipeline backend."
              : "Your organization API key is missing."}
            <div className="mt-3">
              <Link href={`/${orgSlug}/settings/onboarding`}>
                <Button variant="outline" size="sm" className="border-[#007A78] text-[#007A78] hover:bg-[#007A78]/10">
                  <Cloud className="h-4 w-4 mr-2" />
                  Go to Onboarding Settings
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <AlertCircle className="h-4 w-4 text-[#FF6E50]" />
          <AlertTitle className="text-[#FF6E50]">Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-[#007A78]/30 bg-[#007A78]/5">
          <Check className="h-4 w-4 text-[#007A78]" />
          <AlertTitle className="text-[#007A78]">Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CLOUD_PROVIDERS.map((provider) => {
          const integration = integrations[provider.backendKey]
          const isConnected = integration?.status === "VALID"
          const isEnabled = integration?.is_enabled !== false

          return (
            <Card key={provider.id} className={`console-stat-card transition-all hover:shadow-md ${!isEnabled ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isConnected ? 'bg-[#F0FDFA] text-[#007A78]' : 'bg-gray-100 text-gray-400'}`}>
                      <Cloud className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="console-card-title">{provider.name}</CardTitle>
                      <CardDescription className="console-small">{provider.description}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={isConnected ? "default" : "secondary"} className={isConnected ? "bg-[#F0FDFA] text-[#007A78]" : ""}>
                      {isConnected ? "Connected" : "Not Connected"}
                    </Badge>
                    {isConnected && (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-gray-500">{isEnabled ? 'Enabled' : 'Disabled'}</span>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => handleToggle(provider.id, checked)}
                          disabled={togglingProvider === provider.id}
                          className="data-[state=checked]:bg-[#007A78]"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isConnected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleValidate(provider.id)}
                        disabled={validatingProvider === provider.id}
                      >
                        {validatingProvider === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Link href={`/${orgSlug}/settings/integrations/${provider.href}`}>
                      <Button variant="outline" size="sm">
                        {isConnected ? "Manage" : "Connect"}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
