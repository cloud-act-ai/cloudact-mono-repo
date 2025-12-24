"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Server,
  Brain,
  CreditCard,
  ChevronRight,
  Cloud,
  Sparkles,
  Cpu,
  Gem,
  Check,
  Loader2,
  Shield,
  Zap,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Database,
  AlertCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getIntegrations } from "@/actions/integrations"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import { getAllProviders, type ProviderInfo } from "@/actions/subscription-providers"

interface Integration {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED"
  is_enabled?: boolean
}

interface IntegrationCategory {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  providers: ProviderConfig[]
}

interface ProviderConfig {
  id: string
  name: string
  icon: React.ReactNode
  category?: string
}

const ALL_PROVIDERS: ProviderConfig[] = [
  { id: "gcp", name: "Google Cloud", icon: <Cloud className="h-4 w-4" />, category: "cloud" },
  { id: "aws", name: "AWS", icon: <Server className="h-4 w-4" />, category: "cloud" },
  { id: "azure", name: "Azure", icon: <Database className="h-4 w-4" />, category: "cloud" },
  { id: "openai", name: "OpenAI", icon: <Brain className="h-4 w-4" />, category: "llm" },
  { id: "anthropic", name: "Claude", icon: <Sparkles className="h-4 w-4" />, category: "llm" },
  { id: "gemini", name: "Gemini", icon: <Gem className="h-4 w-4" />, category: "llm" },
  { id: "deepseek", name: "DeepSeek", icon: <Cpu className="h-4 w-4" />, category: "llm" },
  { id: "slack", name: "Slack", icon: <MessageSquare className="h-4 w-4" />, category: "saas" },
  { id: "notion", name: "Notion", icon: <FileText className="h-4 w-4" />, category: "saas" },
  { id: "figma", name: "Figma", icon: <Palette className="h-4 w-4" />, category: "saas" },
  { id: "github", name: "GitHub", icon: <Code className="h-4 w-4" />, category: "saas" },
  { id: "canva", name: "Canva", icon: <Palette className="h-4 w-4" />, category: "saas" },
]

const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  {
    id: "cloud-providers",
    name: "Cloud Providers",
    description: "Connect GCP, AWS, or Azure for cloud cost tracking",
    icon: Server,
    href: "cloud-providers",
    providers: ALL_PROVIDERS.filter((p) => p.category === "cloud"),
  },
  {
    id: "llm",
    name: "LLM Providers",
    description: "Connect OpenAI, Anthropic, Gemini, or DeepSeek for AI cost tracking",
    icon: Brain,
    href: "llm",
    providers: ALL_PROVIDERS.filter((p) => p.category === "llm"),
  },
  {
    id: "subscriptions",
    name: "Subscription Providers",
    description: "Track SaaS subscription costs like Slack, Canva, and more",
    icon: CreditCard,
    href: "subscriptions",
    providers: ALL_PROVIDERS.filter((p) => p.category === "saas"),
  },
]

function ProviderConstellation({
  connectedProviders,
  integrations,
}: {
  connectedProviders: string[]
  integrations: Record<string, Integration>
}) {
  const positions = [
    { x: "50%", y: "10%", delay: 0 },
    { x: "15%", y: "25%", delay: 0.1 },
    { x: "85%", y: "25%", delay: 0.2 },
    { x: "30%", y: "45%", delay: 0.3 },
    { x: "70%", y: "45%", delay: 0.4 },
    { x: "20%", y: "65%", delay: 0.5 },
    { x: "80%", y: "65%", delay: 0.6 },
    { x: "40%", y: "80%", delay: 0.7 },
    { x: "60%", y: "80%", delay: 0.8 },
    { x: "10%", y: "50%", delay: 0.9 },
    { x: "90%", y: "50%", delay: 1.0 },
    { x: "50%", y: "90%", delay: 1.1 },
  ]

  return (
    <div className="relative h-[400px] overflow-hidden rounded-3xl bg-gradient-to-br from-[#007A78]/5 via-[#FF6E50]/5 to-[#007A78]/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,122,120,0.1)_0%,transparent_70%)]" />

      {ALL_PROVIDERS.slice(0, 12).map((provider, index) => {
        const pos = positions[index]
        const isConnected = connectedProviders.includes(provider.id)
        const providerKey = provider.id === "gcp" ? "GCP_SA" : provider.id.toUpperCase()
        const isEnabled = integrations[providerKey]?.is_enabled !== false

        return (
          <div
            key={provider.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-float"
            style={{
              left: pos.x,
              top: pos.y,
              animationDelay: `${pos.delay}s`,
            }}
          >
            <div
              className={`relative group transition-all duration-300 ${
                isConnected && isEnabled ? "scale-110" : "scale-100"
              }`}
            >
              {isConnected && isEnabled && (
                <div className="absolute inset-0 rounded-full bg-[#007A78]/20 animate-ping" />
              )}
              <div
                className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-300 backdrop-blur-sm ${
                  isConnected && isEnabled
                    ? "bg-[#007A78] text-white shadow-lg shadow-[#007A78]/30"
                    : "bg-white/80 text-muted-foreground border border-border"
                }`}
              >
                <div className="text-lg">{provider.icon}</div>
              </div>
              {isConnected && isEnabled && (
                <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#007A78] border-2 border-white flex items-center justify-center">
                  <Check className="h-3 w-3 text-white stroke-[3]" />
                </div>
              )}
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs font-medium text-muted-foreground">{provider.name}</p>
              </div>
            </div>
          </div>
        )
      })}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center space-y-3">
          <h2 className="text-4xl font-bold bg-gradient-to-r from-[#007A78] to-[#FF6E50] bg-clip-text text-transparent">
            Integration Hub
          </h2>
          <p className="text-sm text-muted-foreground font-medium">
            {connectedProviders.length} of {ALL_PROVIDERS.length} providers connected
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translate(-50%, -50%) translateY(0px);
          }
          50% {
            transform: translate(-50%, -50%) translateY(-10px);
          }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

function QuickStats({
  connected,
  pending,
  available,
}: {
  connected: number
  pending: number
  available: number
}) {
  const stats = [
    { label: "Connected", value: connected, color: "bg-[#007A78]", icon: Check },
    { label: "Pending", value: pending, color: "bg-[#FF6E50]", icon: Loader2 },
    { label: "Available", value: available, color: "bg-muted-foreground/20", icon: Zap },
  ]

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div key={stat.label} className="metric-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`h-10 w-10 rounded-xl ${stat.color}/10 flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${stat.color.replace("/20", "")}`} />
              </div>
              <p className="text-3xl font-bold text-black">{stat.value}</p>
            </div>
            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
          </div>
        )
      })}
    </div>
  )
}

function CategoryCard({
  category,
  orgSlug,
  connectedCount,
  totalCount,
}: {
  category: IntegrationCategory
  orgSlug: string
  connectedCount: number
  totalCount: number
}) {
  const Icon = category.icon

  return (
    <Link href={`/${orgSlug}/integrations/${category.href}`}>
      <div className="metric-card p-6 transition-all cursor-pointer hover:border-[#007A78]/30 hover:shadow-xl group">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-4 flex-1">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#007A78] to-[#007A78]/80 text-white shadow-lg shadow-[#007A78]/20">
              <Icon className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-black mb-1">{category.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">{category.description}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#007A78] transition-colors flex-shrink-0" />
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {category.providers.slice(0, 6).map((provider) => (
            <div
              key={provider.id}
              className="h-10 w-10 rounded-lg bg-white border border-border flex items-center justify-center text-muted-foreground hover:border-[#007A78]/30 transition-colors"
              title={provider.name}
            >
              {provider.icon}
            </div>
          ))}
          {category.providers.length > 6 && (
            <div className="h-10 w-10 rounded-lg bg-muted-foreground/5 border border-border flex items-center justify-center text-xs font-semibold text-muted-foreground">
              +{category.providers.length - 6}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#007A78] animate-pulse" />
            <span className="text-sm font-medium text-muted-foreground">
              {connectedCount} of {totalCount} connected
            </span>
          </div>
          <span className="text-sm font-semibold text-[#007A78] group-hover:underline">
            Configure
          </span>
        </div>
      </div>
    </Link>
  )
}

function SecurityBadge() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#007A78] to-[#005F5D] p-6 text-white">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative flex items-start gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
          <Shield className="h-7 w-7 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold mb-2">Enterprise-Grade Security</h3>
          <p className="text-sm text-white/80 leading-relaxed mb-3">
            All credentials are encrypted using Google Cloud KMS before storage. Your integration keys
            are protected with industry-standard encryption and never stored in plain text.
          </p>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-white/90 flex-shrink-0" />
            <span className="text-xs font-medium text-white/90">AES-256 Encryption</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [integrations, setIntegrations] = useState<Record<string, Integration>>({})
  const [saasProviders, setSaasProviders] = useState<ProviderInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)

    const [onboardingStatus, apiKeyResult, integrationsResult, saasResult] = await Promise.all([
      checkBackendOnboarding(orgSlug),
      hasStoredApiKey(orgSlug),
      getIntegrations(orgSlug),
      getAllProviders(orgSlug),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    if (integrationsResult.success && integrationsResult.integrations) {
      setIntegrations(integrationsResult.integrations.integrations || {})
    }

    if (saasResult.success && saasResult.providers) {
      setSaasProviders(saasResult.providers)
    }

    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const getConnectedCount = (categoryId: string) => {
    if (categoryId === "cloud-providers") {
      return Object.entries(integrations).filter(
        ([key, int]) =>
          (key === "GCP_SA" || key === "AWS" || key === "AZURE") &&
          int.status === "VALID" &&
          int.is_enabled !== false
      ).length
    } else if (categoryId === "llm") {
      return Object.entries(integrations).filter(
        ([key, int]) =>
          (key === "OPENAI" || key === "ANTHROPIC" || key === "GEMINI" || key === "DEEPSEEK") &&
          int.status === "VALID" &&
          int.is_enabled !== false
      ).length
    } else if (categoryId === "subscriptions") {
      return saasProviders.filter((p) => p.is_enabled && p.plan_count > 0).length
    }
    return 0
  }

  const allConnectedProviders = Object.entries(integrations)
    .filter(([, int]) => int.status === "VALID" && int.is_enabled !== false)
    .map(([key]) => {
      if (key === "GCP_SA") return "gcp"
      return key.toLowerCase()
    })
    .concat(saasProviders.filter((p) => p.is_enabled && p.plan_count > 0).map((p) => p.provider))

  const connectedCount = allConnectedProviders.length
  const pendingCount = Object.values(integrations).filter((int) => int.status === "PENDING").length
  const availableCount = ALL_PROVIDERS.length - connectedCount

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-[#007A78] mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Loading integrations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">
          Integrations
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          Connect your cloud providers, LLM APIs, and subscription services
        </p>
      </div>

      {(!backendConnected || !hasApiKey) && (
        <div className="health-card bg-[#FF6E50]/10 p-5 border-[#FF6E50]/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#FF6E50] mt-0.5 flex-shrink-0" />
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold text-black">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Complete organization onboarding to configure integrations.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="inline-flex items-center gap-2 h-11 px-4 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors">
                  Go to Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <ProviderConstellation connectedProviders={allConnectedProviders} integrations={integrations} />

      <QuickStats connected={connectedCount} pending={pendingCount} available={availableCount} />

      <div>
        <h2 className="text-2xl font-bold text-black mb-5">Integration Categories</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {INTEGRATION_CATEGORIES.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              orgSlug={orgSlug}
              connectedCount={getConnectedCount(category.id)}
              totalCount={category.providers.length}
            />
          ))}
        </div>
      </div>

      <SecurityBadge />
    </div>
  )
}
