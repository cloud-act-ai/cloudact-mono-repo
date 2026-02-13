"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Brain,
  CreditCard,
  ChevronRight,
  Cloud,
  Shield,
  AlertCircle,
} from "lucide-react"
import { getIntegrations } from "@/actions/integrations"
import { LoadingState } from "@/components/ui/loading-state"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import { getAllProviders, type ProviderInfo } from "@/actions/subscription-providers"
import { ProviderLogo } from "@/components/ui/provider-logo"

interface Integration {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED" | "EXPIRED"
  is_enabled?: boolean
}

interface IntegrationCategory {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
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
  { id: "gcp", name: "Google Cloud", icon: <ProviderLogo provider="gcp" size={16} />, category: "cloud" },
  { id: "aws", name: "AWS", icon: <ProviderLogo provider="aws" size={16} />, category: "cloud" },
  { id: "azure", name: "Azure", icon: <ProviderLogo provider="azure" size={16} />, category: "cloud" },
  { id: "openai", name: "OpenAI", icon: <ProviderLogo provider="openai" size={16} />, category: "genai" },
  { id: "anthropic", name: "Claude", icon: <ProviderLogo provider="anthropic" size={16} />, category: "genai" },
  { id: "gemini", name: "Gemini", icon: <ProviderLogo provider="gemini" size={16} />, category: "genai" },
  { id: "deepseek", name: "DeepSeek", icon: <ProviderLogo provider="deepseek" size={16} />, category: "genai" },
  { id: "slack", name: "Slack", icon: <ProviderLogo provider="slack" size={16} />, category: "saas" },
  { id: "notion", name: "Notion", icon: <ProviderLogo provider="notion" size={16} />, category: "saas" },
  { id: "figma", name: "Figma", icon: <ProviderLogo provider="figma" size={16} />, category: "saas" },
  { id: "github", name: "GitHub", icon: <ProviderLogo provider="github" size={16} />, category: "saas" },
  { id: "canva", name: "Canva", icon: <ProviderLogo provider="canva" size={16} />, category: "saas" },
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
    id: "genai",
    name: "GenAI Providers",
    description: "OpenAI, Claude, Gemini usage",
    icon: Brain,
    href: "genai",
    accent: "coral", // Maps to --cloudact-coral
    providers: ALL_PROVIDERS.filter((p) => p.category === "genai"),
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
    } else if (categoryId === "genai") {
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
  const genaiCount = getConnectedCount("genai")
  const saasCount = getConnectedCount("subscriptions")

  if (isLoading) {
    return (
      <div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6 space-y-4 sm:space-y-6 lg:space-y-8">
          {/* Header - Same pattern as dashboard */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6]/30 to-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[#90FCA6]/20">
                <Shield className="h-5 w-5 sm:h-7 sm:w-7 text-[#1a7a3a]" />
              </div>
              <div>
                <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
                  Integrations
                </h1>
                <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
                  Connect cloud providers, LLM APIs, and subscription services
                </p>
              </div>
            </div>
          </div>
          <LoadingState message="Loading integrations..." />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6 space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Premium Header with enhanced typography */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6]/30 to-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[#90FCA6]/20">
            <Shield className="h-5 w-5 sm:h-7 sm:w-7 text-[#1a7a3a]" />
          </div>
          <div>
            <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
              Integrations
            </h1>
            <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
              Connect cloud providers, LLM APIs, and subscription services
            </p>
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
              <h3 className="text-[14px] font-semibold text-slate-900">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[12px] text-slate-600 mt-1">
                Complete organization onboarding to configure integrations.
              </p>
              <Link
                href={`/${orgSlug}/settings/organization`}
                className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold text-slate-900 hover:text-slate-700 transition-colors"
              >
                Go to Settings
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row - Ultra-premium styling - Mobile: 2x2 grid, Desktop: flex row */}
      <div className="relative overflow-hidden py-4 px-4 sm:py-5 sm:px-6 bg-white/[0.98] backdrop-blur-sm rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        {/* Top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--cloudact-mint)] via-[var(--cloudact-mint-light)]/50 to-transparent" />

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-gradient-to-r from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] shadow-[0_0_8px_rgba(144,252,166,0.5)] animate-pulse"></div>
            <span className="text-[12px] sm:text-[13px] text-slate-600">
              <span className="font-bold text-slate-900">{connectedCount}</span> Connected
            </span>
          </div>
          <div className="hidden sm:block h-6 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent"></div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
              <Cloud className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#1a7a3a]" />
            </div>
            <span className="text-[12px] sm:text-[13px] text-slate-600">
              <span className="font-bold text-slate-900">{cloudCount}</span> Cloud
            </span>
          </div>
          <div className="hidden sm:block h-6 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent"></div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[var(--cloudact-coral)]/10 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#FF6C5E]" />
            </div>
            <span className="text-[12px] sm:text-[13px] text-slate-600">
              <span className="font-bold text-slate-900">{genaiCount}</span> GenAI
            </span>
          </div>
          <div className="hidden sm:block h-6 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent"></div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-500" />
            </div>
            <span className="text-[12px] sm:text-[13px] text-slate-600">
              <span className="font-bold text-slate-900">{saasCount}</span> SaaS
            </span>
          </div>
        </div>
      </div>

      {/* Integration Categories - Ultra-premium styling */}
      <div className="space-y-5">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Categories</h2>

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
                <div className="relative p-4 sm:p-6 bg-white/[0.98] backdrop-blur-sm rounded-xl sm:rounded-2xl border border-slate-200/80 hover:border-slate-300 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300">
                  {/* Left accent bar - always visible with opacity animation */}
                  <div
                    className="absolute left-0 top-3 bottom-3 sm:top-4 sm:bottom-4 w-1 rounded-full transition-all duration-300 opacity-30 group-hover:opacity-100"
                    style={{ backgroundColor: getAccentStyle(category.accent).css }}
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div
                        className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:scale-105"
                        style={{ backgroundColor: `${getAccentStyle(category.accent).css}15` }}
                      >
                        <Icon className="h-5 w-5 sm:h-7 sm:w-7" style={{ color: getAccentStyle(category.accent).css }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] sm:text-[16px] font-bold text-slate-900 group-hover:text-[#1a7a3a] transition-colors">{category.name}</h3>
                        <p className="text-[11px] sm:text-[12px] text-slate-500 mt-0.5 sm:mt-1">{category.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 flex-shrink-0 ml-14 sm:ml-0">
                      {/* Provider icons - premium styling - hidden on mobile */}
                      <div className="hidden md:flex items-center gap-1.5">
                        {category.providers.slice(0, 4).map((provider) => (
                          <div
                            key={provider.id}
                            className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:shadow-sm transition-all duration-200"
                          >
                            {provider.icon}
                          </div>
                        ))}
                        {category.providers.length > 4 && (
                          <span className="text-[11px] text-slate-500 font-semibold ml-1.5 bg-slate-100 px-2 py-0.5 rounded-full">
                            +{category.providers.length - 4}
                          </span>
                        )}
                      </div>

                      {/* Status badge - premium gradient */}
                      <div className="flex items-center gap-2 sm:gap-3">
                        {connected > 0 ? (
                          <span
                            className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs sm:text-[11px] font-bold shadow-sm transition-all duration-200"
                            style={{
                              backgroundColor: `${getAccentStyle(category.accent).css}20`,
                              color: category.accent === 'mint' ? '#1a7a3a' : category.accent === 'coral' ? '#FF6C5E' : '#007AFF'
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full mr-1 sm:mr-1.5 inline-block animate-pulse" style={{ backgroundColor: getAccentStyle(category.accent).css }} />
                            {connected} active
                          </span>
                        ) : (
                          <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-slate-100 to-slate-50 text-slate-500 text-xs sm:text-[11px] font-semibold border border-slate-200/50">
                            Not configured
                          </span>
                        )}
                        <div className="h-8 w-8 rounded-lg bg-slate-50 group-hover:bg-[var(--cloudact-mint)]/10 flex items-center justify-center transition-all duration-200">
                          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-[#1a7a3a] group-hover:translate-x-0.5 transition-all duration-200" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Security Notice - Ultra-premium styling */}
      <div className="relative overflow-hidden p-4 sm:p-6 bg-white/[0.98] backdrop-blur-sm rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--cloudact-mint)]/[0.03] to-transparent" />

        <div className="relative flex items-start gap-3 sm:gap-4">
          <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)]/15 to-[var(--cloudact-mint-light)]/15 border border-[var(--cloudact-mint)]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Shield className="h-5 w-5 sm:h-7 sm:w-7 text-[#1a7a3a]" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[16px] font-bold text-slate-900">Enterprise Security</h3>
            <p className="text-[12px] sm:text-[13px] text-slate-600 mt-1.5 sm:mt-2 leading-relaxed">
              All credentials are encrypted using Google Cloud KMS. Your integration keys are protected with AES-256 encryption and never stored in plain text.
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
