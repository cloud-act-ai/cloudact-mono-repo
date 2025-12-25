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
  Loader2,
  Shield,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Database,
  AlertCircle,
} from "lucide-react"
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
  accent: string
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

// Use semantic accent names that map to CSS variables in globals.css
const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  {
    id: "cloud-providers",
    name: "Cloud Providers",
    description: "GCP, AWS, Azure billing data",
    icon: Cloud,
    href: "cloud-providers",
    accent: "mint", // Maps to --cloudact-mint
    providers: ALL_PROVIDERS.filter((p) => p.category === "cloud"),
  },
  {
    id: "llm",
    name: "LLM Providers",
    description: "OpenAI, Claude, Gemini usage",
    icon: Brain,
    href: "llm",
    accent: "coral", // Maps to --cloudact-coral
    providers: ALL_PROVIDERS.filter((p) => p.category === "llm"),
  },
  {
    id: "subscriptions",
    name: "SaaS Subscriptions",
    description: "Track software costs",
    icon: CreditCard,
    href: "subscriptions",
    accent: "blue", // Maps to --cloudact-blue
    providers: ALL_PROVIDERS.filter((p) => p.category === "saas"),
  },
]

// Accent color mapping - uses CSS variables for consistency
const accentStyles: Record<string, {
  css: string;  // CSS variable name
  bg: string;   // Background class
  iconBg: string;  // Icon container class
}> = {
  mint: {
    css: "var(--cloudact-mint)",
    bg: "bg-gradient-mint",
    iconBg: "bg-[#90FCA6]/15 text-mint-text",
  },
  coral: {
    css: "var(--cloudact-coral)",
    bg: "bg-gradient-coral",
    iconBg: "bg-[#FF6C5E]/15 text-coral",
  },
  blue: {
    css: "var(--cloudact-blue)",
    bg: "bg-gradient-blue",
    iconBg: "bg-[#007AFF]/15 text-ca-blue",
  },
}

// Helper to get accent style safely
const getAccentStyle = (accent: string) => {
  return accentStyles[accent] || accentStyles.mint;
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
      checkBackendOnboarding(orgSlug, { skipValidation: true, timeout: 3000 }),
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
  const cloudCount = getConnectedCount("cloud-providers")
  const llmCount = getConnectedCount("llm")
  const saasCount = getConnectedCount("subscriptions")

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#6EE890]" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight">Integrations</h1>
        <p className="text-[15px] text-slate-500">
          Connect cloud providers, LLM APIs, and subscription services
        </p>
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

      {/* Stats Row */}
      <div className="flex flex-wrap items-center gap-6 py-4 px-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-[#90FCA6]"></div>
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-slate-900">{connectedCount}</span> Connected
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[#1a7a3a]">{cloudCount}</span> Cloud
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[#FF6C5E]">{llmCount}</span> LLM
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-slate-400" />
          <span className="text-[14px] text-slate-600">
            <span className="font-semibold text-[#8B5CF6]">{saasCount}</span> SaaS
          </span>
        </div>
      </div>

      {/* Integration Categories */}
      <div className="space-y-4">
        <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Categories</h2>

        <div className="space-y-3">
          {INTEGRATION_CATEGORIES.map((category) => {
            const Icon = category.icon
            const connected = getConnectedCount(category.id)

            return (
              <Link
                key={category.id}
                href={`/${orgSlug}/integrations/${category.href}`}
                className="group block"
              >
                <div className="relative p-5 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all">
                  {/* Left accent */}
                  <div
                    className="absolute left-0 top-5 bottom-5 w-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: getAccentStyle(category.accent).css }}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center ${getAccentStyle(category.accent).iconBg}`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-[16px] font-semibold text-slate-900">{category.name}</h3>
                        <p className="text-[13px] text-slate-500 mt-0.5">{category.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Provider icons */}
                      <div className="hidden sm:flex items-center gap-1">
                        {category.providers.slice(0, 4).map((provider) => (
                          <div
                            key={provider.id}
                            className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400"
                          >
                            {provider.icon}
                          </div>
                        ))}
                        {category.providers.length > 4 && (
                          <span className="text-[12px] text-slate-400 font-medium ml-1">
                            +{category.providers.length - 4}
                          </span>
                        )}
                      </div>

                      {/* Status badge */}
                      <div className="flex items-center gap-3">
                        {connected > 0 ? (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${getAccentStyle(category.accent).iconBg}`}
                          >
                            {connected} active
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold">
                            Not configured
                          </span>
                        )}
                        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Security Notice */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#B8FDCA]/10 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-[#6EE890]" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Enterprise Security</h3>
            <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
              All credentials are encrypted using Google Cloud KMS. Your integration keys are protected with AES-256 encryption and never stored in plain text.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
