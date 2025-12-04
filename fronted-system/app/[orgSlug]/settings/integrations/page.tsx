"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, Cloud, Brain, Sparkles, Cpu, ChevronRight, RefreshCw, AlertCircle, Gem, CreditCard, Plus, Pencil, Trash2, X } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getIntegrations, validateIntegration, IntegrationProvider, toggleIntegrationEnabled } from "@/actions/integrations"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import {
  listSaaSSubscriptions,
  createSaaSSubscription,
  updateSaaSSubscription,
  deleteSaaSSubscription,
  toggleSaaSSubscription,
  SaaSSubscription,
  SaaSSubscriptionCreate,
} from "@/actions/saas-subscriptions"
import { COMMON_SAAS_PROVIDERS } from "@/lib/saas-providers"

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

  // SaaS Subscriptions state
  const [saasSubscriptions, setSaasSubscriptions] = useState<SaaSSubscription[]>([])
  const [saasLoading, setSaasLoading] = useState(false)
  const [togglingSaas, setTogglingSaas] = useState<string | null>(null)
  const [deletingSaas, setDeletingSaas] = useState<string | null>(null)
  const [createSaasModal, setCreateSaasModal] = useState(false)
  const [deleteSaasDialog, setDeleteSaasDialog] = useState<{ open: boolean; sub: SaaSSubscription | null }>({ open: false, sub: null })
  const [creatingSaas, setCreatingSaas] = useState(false)
  const [newSaas, setNewSaas] = useState<SaaSSubscriptionCreate & { selectedProvider: string }>({
    provider_name: "",
    display_name: "",
    billing_cycle: "monthly",
    cost_per_cycle: 0,
    currency: "USD",
    category: "",
    selectedProvider: "",
  })

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

  // Load SaaS subscriptions
  const loadSaasSubscriptions = useCallback(async () => {
    setSaasLoading(true)
    const result = await listSaaSSubscriptions(orgSlug)
    if (result.success && result.subscriptions) {
      setSaasSubscriptions(result.subscriptions)
    }
    setSaasLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadSaasSubscriptions()
  }, [loadSaasSubscriptions])

  // Handle SaaS toggle
  const handleSaasToggle = async (sub: SaaSSubscription) => {
    setTogglingSaas(sub.id)
    setError(null)
    const result = await toggleSaaSSubscription(orgSlug, sub.id, !sub.is_enabled)
    setTogglingSaas(null)
    if (result.success) {
      setSuccessMessage(`${sub.display_name} ${!sub.is_enabled ? 'enabled' : 'disabled'}`)
      await loadSaasSubscriptions()
    } else {
      setError(result.error || "Failed to toggle subscription")
    }
  }

  // Handle SaaS delete
  const handleSaasDelete = async () => {
    const sub = deleteSaasDialog.sub
    if (!sub) return
    setDeletingSaas(sub.id)
    const result = await deleteSaaSSubscription(orgSlug, sub.id)
    setDeletingSaas(null)
    setDeleteSaasDialog({ open: false, sub: null })
    if (result.success) {
      setSuccessMessage(`${sub.display_name} deleted`)
      await loadSaasSubscriptions()
    } else {
      setError(result.error || "Failed to delete subscription")
    }
  }

  // Handle SaaS create
  const handleSaasCreate = async () => {
    if (!newSaas.display_name.trim()) {
      setError("Display name is required")
      return
    }
    if (newSaas.cost_per_cycle < 0) {
      setError("Cost must be non-negative")
      return
    }

    setCreatingSaas(true)
    setError(null)

    const { selectedProvider, ...subscriptionData } = newSaas
    const providerName = selectedProvider === "custom" ? newSaas.provider_name : selectedProvider
    const providerInfo = COMMON_SAAS_PROVIDERS.find(p => p.id === selectedProvider)

    const result = await createSaaSSubscription(orgSlug, {
      ...subscriptionData,
      provider_name: providerName,
      display_name: newSaas.display_name || providerInfo?.name || providerName,
      category: newSaas.category || providerInfo?.category,
    })

    setCreatingSaas(false)

    if (result.success) {
      setSuccessMessage(`${newSaas.display_name || providerInfo?.name} added`)
      setCreateSaasModal(false)
      setNewSaas({
        provider_name: "",
        display_name: "",
        billing_cycle: "monthly",
        cost_per_cycle: 0,
        currency: "USD",
        category: "",
        selectedProvider: "",
      })
      await loadSaasSubscriptions()
    } else {
      setError(result.error || "Failed to create subscription")
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

      {/* SaaS Subscriptions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="console-heading">Subscriptions</h2>
            <p className="console-small text-gray-500">Track fixed-cost SaaS subscriptions (Canva, Adobe, ChatGPT Plus, etc.)</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateSaasModal(true)}
            className="console-button-secondary"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Subscription
          </Button>
        </div>

        {saasLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
          </div>
        ) : saasSubscriptions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <CreditCard className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="console-body text-slate-500 mb-3">
                No subscriptions added yet. Track your SaaS spend by adding subscriptions.
              </p>
              <Button variant="outline" size="sm" onClick={() => setCreateSaasModal(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Your First Subscription
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {saasSubscriptions.map((sub) => (
              <Card key={sub.id} className={`transition-all ${!sub.is_enabled ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={sub.is_enabled}
                        onCheckedChange={() => handleSaasToggle(sub)}
                        disabled={togglingSaas === sub.id}
                        className="data-[state=checked]:bg-[#007A78]"
                      />
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[#F0FDFA]">
                          <CreditCard className="h-4 w-4 text-[#007A78]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{sub.display_name}</span>
                            {sub.category && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {sub.category}
                              </Badge>
                            )}
                          </div>
                          <div className="console-small text-gray-500">
                            ${sub.cost_per_cycle.toFixed(2)} / {sub.billing_cycle}
                            {sub.seats && ` (${sub.seats} seats)`}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {sub.currency}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteSaasDialog({ open: true, sub })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Summary */}
            <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-muted/50 console-small">
              <span className="text-gray-500">Total:</span>
              <span className="font-medium text-[#007A78]">
                ${saasSubscriptions.filter(s => s.is_enabled).reduce((sum, s) => {
                  const monthlyEquiv = s.billing_cycle === "annual" ? s.cost_per_cycle / 12 :
                    s.billing_cycle === "quarterly" ? s.cost_per_cycle / 3 : s.cost_per_cycle
                  return sum + monthlyEquiv
                }, 0).toFixed(2)}/mo
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">{saasSubscriptions.filter(s => s.is_enabled).length} active</span>
            </div>
          </div>
        )}
      </div>

      {/* Create SaaS Dialog */}
      <Dialog open={createSaasModal} onOpenChange={setCreateSaasModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Subscription</DialogTitle>
            <DialogDescription>
              Track a new SaaS subscription. This helps you monitor your total software spend.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Service</Label>
              <Select
                value={newSaas.selectedProvider}
                onValueChange={(value) => {
                  const provider = COMMON_SAAS_PROVIDERS.find(p => p.id === value)
                  setNewSaas({
                    ...newSaas,
                    selectedProvider: value,
                    provider_name: value === "custom" ? "" : value,
                    display_name: provider?.name || "",
                    category: provider?.category || "",
                  })
                }}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a service..." />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_SAAS_PROVIDERS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-gray-400">({p.category})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newSaas.selectedProvider === "custom" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Provider ID</Label>
                <Input
                  className="col-span-3"
                  placeholder="e.g., my_saas_tool"
                  value={newSaas.provider_name}
                  onChange={(e) => setNewSaas({ ...newSaas, provider_name: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                />
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Display Name</Label>
              <Input
                className="col-span-3"
                placeholder="e.g., Canva Pro Team"
                value={newSaas.display_name}
                onChange={(e) => setNewSaas({ ...newSaas, display_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Cost</Label>
              <div className="col-span-3 flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="flex-1"
                  value={newSaas.cost_per_cycle}
                  onChange={(e) => setNewSaas({ ...newSaas, cost_per_cycle: parseFloat(e.target.value) || 0 })}
                />
                <Select
                  value={newSaas.billing_cycle}
                  onValueChange={(value) => setNewSaas({ ...newSaas, billing_cycle: value as any })}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Seats</Label>
              <Input
                type="number"
                min="1"
                className="col-span-3"
                placeholder="Optional"
                value={newSaas.seats || ""}
                onChange={(e) => setNewSaas({ ...newSaas, seats: parseInt(e.target.value) || undefined })}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Category</Label>
              <Select
                value={newSaas.category || "other"}
                onValueChange={(value) => setNewSaas({ ...newSaas, category: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="productivity">Productivity</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="cloud">Cloud</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSaasModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaasCreate} disabled={creatingSaas || !newSaas.selectedProvider}>
              {creatingSaas ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete SaaS Dialog */}
      <Dialog open={deleteSaasDialog.open} onOpenChange={(open) => setDeleteSaasDialog({ open, sub: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteSaasDialog.sub?.display_name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSaasDialog({ open: false, sub: null })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSaasDelete} disabled={!!deletingSaas}>
              {deletingSaas ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
