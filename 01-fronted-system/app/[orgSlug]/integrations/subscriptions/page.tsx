"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Loader2, Check, Brain, Palette, FileText, MessageSquare, Code, Cloud,
  ChevronRight, ChevronDown, AlertCircle, Plus, ArrowUpRight,
  TrendingUp, Settings2, Layers, Search, X, HelpCircle, BookOpen
} from "lucide-react"
import Link from "next/link"

import { ProviderLogo } from "@/components/ui/provider-logo"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"
import {
  getAllProviders,
  enableProvider,
  disableProvider,
  type ProviderInfo,
} from "@/actions/subscription-providers"

// Category configuration with refined colors
const CATEGORIES: Record<string, { icon: React.ReactNode; label: string; accent: string }> = {
  ai: { icon: <Brain className="h-4 w-4" />, label: "AI & ML", accent: "#8B5CF6" },
  design: { icon: <Palette className="h-4 w-4" />, label: "Design", accent: "#EC4899" },
  productivity: { icon: <FileText className="h-4 w-4" />, label: "Productivity", accent: "#10B981" },
  communication: { icon: <MessageSquare className="h-4 w-4" />, label: "Communication", accent: "#3B82F6" },
  development: { icon: <Code className="h-4 w-4" />, label: "Development", accent: "#F59E0B" },
  cloud: { icon: <Cloud className="h-4 w-4" />, label: "Cloud", accent: "#06B6D4" },
  other: { icon: <Layers className="h-4 w-4" />, label: "Other", accent: "#64748B" },
}

// Tracking Card - For providers with active plans
function TrackingCard({
  provider,
  orgSlug,
}: {
  provider: ProviderInfo
  orgSlug: string
}) {
  const router = useRouter()
  const category = CATEGORIES[provider.category] || CATEGORIES.other

  return (
    <div className="group relative">
      {/* Subtle left accent */}
      <div
        className="absolute left-0 top-4 bottom-4 w-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: category.accent }}
      />

      <div className="pl-5 py-4 pr-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors rounded-r-xl">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* Icon */}
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
            style={{ backgroundColor: `${category.accent}12` }}
          >
            <ProviderLogo provider={provider.provider} category={provider.category} size={22} fallbackColor={category.accent} />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-slate-900 truncate tracking-tight">
              {provider.display_name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[12px] text-slate-500 font-medium">{category.label}</span>
              <span className="text-slate-300">·</span>
              <span className="text-[12px] font-semibold text-[#1a7a3a]">
                {provider.plan_count} plan{provider.plan_count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/${orgSlug}/integrations/subscriptions/${provider.provider}`)}
            className="h-9 px-4 text-[13px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5"
          >
            Manage
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Setup Card - For enabled providers without plans
function SetupCard({
  provider,
  orgSlug,
  onDisable,
  isToggling,
}: {
  provider: ProviderInfo
  orgSlug: string
  onDisable: () => void
  isToggling: boolean
}) {
  const router = useRouter()
  const category = CATEGORIES[provider.category] || CATEGORIES.other

  return (
    <div className="group p-4 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/30 hover:border-amber-300 hover:bg-amber-50/50 transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${category.accent}15` }}
          >
            <ProviderLogo provider={provider.provider} category={provider.category} size={20} fallbackColor={category.accent} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900 truncate">{provider.display_name}</h3>
            <p className="text-[11px] text-amber-600 font-medium mt-0.5">Needs configuration</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/${orgSlug}/integrations/subscriptions/${provider.provider}`)}
            className="h-8 px-3 text-[12px] font-semibold bg-[#FF6C5E] hover:bg-[#E55A3C] text-white rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Plans
          </button>
          <button
            onClick={onDisable}
            disabled={isToggling}
            className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// Available Card - Compact card for providers not yet enabled
function AvailableCard({
  provider,
  onEnable,
  isToggling,
}: {
  provider: ProviderInfo
  onEnable: () => void
  isToggling: boolean
}) {
  const category = CATEGORIES[provider.category] || CATEGORIES.other

  return (
    <button
      onClick={onEnable}
      disabled={isToggling}
      className="group w-full p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all text-left disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
          style={{ backgroundColor: `${category.accent}10` }}
        >
          {isToggling ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <div className="opacity-70 group-hover:opacity-100 transition-opacity">
              <ProviderLogo provider={provider.provider} category={provider.category} size={18} fallbackColor={category.accent} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-medium text-slate-700 group-hover:text-slate-900 truncate transition-colors">
            {provider.display_name}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{category.label}</p>
        </div>
        <Plus className="h-4 w-4 text-slate-300 group-hover:text-[#1a7a3a] transition-colors flex-shrink-0" />
      </div>
    </button>
  )
}

export default function SubscriptionIntegrationsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const isValidOrgSlug = orgSlug && typeof orgSlug === 'string' && /^[a-zA-Z0-9_-]{2,100}$/.test(orgSlug)

  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAllAvailable, setShowAllAvailable] = useState(false)

  const loadData = useCallback(async () => {
    if (!isValidOrgSlug) {
      setError("Invalid organization. Please check the URL.")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const [onboardingStatus, apiKeyResult, providersResult] = await Promise.all([
      checkBackendOnboarding(orgSlug, { skipValidation: true, timeout: 3000 }),
      hasStoredApiKey(orgSlug),
      getAllProviders(orgSlug),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    if (providersResult.success && providersResult.providers) {
      setProviders(providersResult.providers)
    } else {
      setError(providersResult.error || "Failed to load providers")
    }

    setIsLoading(false)
  }, [orgSlug, isValidOrgSlug])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  const handleToggle = async (provider: string, enabled: boolean) => {
    const previousProviders = [...providers]
    setProviders(prev => prev.map(p => p.provider === provider ? { ...p, is_enabled: enabled } : p))
    setTogglingProvider(provider)
    setError(null)

    try {
      const displayName = provider.replace(/_/g, ' ')
      const result = enabled ? await enableProvider(orgSlug, provider) : await disableProvider(orgSlug, provider)

      if (result.success) {
        setSuccessMessage(enabled
          ? `${displayName} enabled${'plans_seeded' in result && result.plans_seeded ? ` with ${result.plans_seeded} plans` : ''}`
          : `${displayName} disabled`
        )
        await loadData()
      } else {
        setProviders(previousProviders)
        setError(result.error || `Failed to ${enabled ? 'enable' : 'disable'} provider`)
      }
    } catch {
      setProviders(previousProviders)
      setError(`Failed to ${enabled ? 'enable' : 'disable'} provider`)
    } finally {
      setTogglingProvider(null)
    }
  }

  // Categorize providers
  const trackingProviders = providers.filter(p => p.is_enabled && p.plan_count > 0)
  const setupProviders = providers.filter(p => p.is_enabled && p.plan_count === 0)
  const availableProviders = providers.filter(p => !p.is_enabled)

  // Filter available by search
  const filteredAvailable = searchQuery
    ? availableProviders.filter(p =>
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableProviders

  const displayedAvailable = showAllAvailable ? filteredAvailable : filteredAvailable.slice(0, 12)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading providers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-0">
      {/* Header */}
      <div className="mb-6 sm:mb-10">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 mb-4 sm:mb-6">
          <div>
            <h1 className="text-[24px] sm:text-[32px] font-bold text-slate-900 tracking-tight leading-none">
              Subscriptions
            </h1>
            <p className="text-[13px] sm:text-[15px] text-slate-500 mt-1.5 sm:mt-2 max-w-lg">
              Track your SaaS spending across all providers
            </p>
          </div>
          <Link href={`/${orgSlug}/cost-dashboards/subscription-costs`}>
            <button className="h-10 sm:h-11 w-full sm:w-auto px-4 sm:px-5 bg-[#90FCA6] hover:bg-[#B8FDCA] text-black text-[12px] sm:text-[13px] font-semibold rounded-lg sm:rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm touch-manipulation">
              <TrendingUp className="h-4 w-4" />
              View Costs
              <ArrowUpRight className="h-3.5 w-3.5 opacity-50" />
            </button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide pb-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
              <Check className="h-4 w-4 sm:h-5 sm:w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{trackingProviders.length}</p>
              <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Tracking</p>
            </div>
          </div>

          {setupProviders.length > 0 && (
            <>
              <div className="h-6 sm:h-8 w-px bg-slate-200 flex-shrink-0"></div>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-amber-100 flex items-center justify-center">
                  <Settings2 className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{setupProviders.length}</p>
                  <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Setup</p>
                </div>
              </div>
            </>
          )}

          <div className="h-6 sm:h-8 w-px bg-slate-200 flex-shrink-0"></div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center">
              <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-[18px] sm:text-[24px] font-bold text-slate-900 leading-none">{availableProviders.length}</p>
              <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium mt-0.5">Available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Backend Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-slate-900">
                {!backendConnected ? "Backend not connected" : "API key missing"}
              </h3>
              <p className="text-[13px] text-slate-600 mt-1">
                Complete organization setup to start tracking subscriptions.
              </p>
              <Link href={`/${orgSlug}/settings/organization`}>
                <button className="mt-3 h-9 px-4 bg-slate-900 text-white text-[12px] font-semibold rounded-lg hover:bg-slate-800 transition-colors">
                  Go to Settings
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[13px] font-medium text-rose-700">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 rounded-xl bg-[#90FCA6]/5 border border-[#90FCA6]/20 flex items-center gap-3">
          <Check className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
          <p className="text-[13px] font-medium text-[#1a7a3a]">{successMessage}</p>
        </div>
      )}

      {/* Tracking Section */}
      {trackingProviders.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
              Active Tracking
            </h2>
            <span className="text-[11px] text-[#1a7a3a] font-semibold bg-[#90FCA6]/10 px-2 py-0.5 rounded-full">
              {trackingProviders.length}
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
            {trackingProviders.map((provider) => (
              <TrackingCard
                key={provider.provider}
                provider={provider}
                orgSlug={orgSlug}
              />
            ))}
          </div>
        </section>
      )}

      {/* Setup Section */}
      {setupProviders.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
              Needs Configuration
            </h2>
            <span className="text-[11px] text-amber-600 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">
              {setupProviders.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {setupProviders.map((provider) => (
              <SetupCard
                key={provider.provider}
                provider={provider}
                orgSlug={orgSlug}
                onDisable={() => handleToggle(provider.provider, false)}
                isToggling={togglingProvider === provider.provider}
              />
            ))}
          </div>
        </section>
      )}

      {/* Available Section */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[12px] sm:text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
              Available Providers
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
              {availableProviders.length}
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search providers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 sm:h-9 w-full sm:w-64 pl-9 pr-4 text-[14px] sm:text-[13px] bg-slate-100 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {displayedAvailable.map((provider) => (
            <AvailableCard
              key={provider.provider}
              provider={provider}
              onEnable={() => handleToggle(provider.provider, true)}
              isToggling={togglingProvider === provider.provider}
            />
          ))}
        </div>

        {filteredAvailable.length > 12 && !showAllAvailable && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowAllAvailable(true)}
              className="h-10 px-6 text-[13px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors inline-flex items-center gap-2"
            >
              Show {filteredAvailable.length - 12} more providers
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}

        {filteredAvailable.length === 0 && searchQuery && (
          <div className="py-12 text-center">
            <p className="text-[14px] text-slate-500">No providers match "{searchQuery}"</p>
          </div>
        )}
      </section>

      {/* Add Custom */}
      <div className="mt-12 p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200 text-center">
        <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Plus className="h-5 w-5 text-slate-600" />
        </div>
        <h3 className="text-[16px] font-semibold text-slate-900 mb-1">
          Can't find your provider?
        </h3>
        <p className="text-[13px] text-slate-500 mb-5 max-w-sm mx-auto">
          Add custom subscriptions to track any SaaS tool not in our catalog.
        </p>
        <Link href={`/${orgSlug}/integrations/subscriptions/custom/add`}>
          <button className="h-10 px-5 bg-[#90FCA6] hover:bg-[#B8FDCA] text-black text-[13px] font-semibold rounded-xl transition-colors inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Custom Provider
          </button>
        </Link>
      </div>

      {/* Help Documentation */}
      <div className="mt-8 p-6 rounded-2xl bg-white border border-slate-200">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-slate-900 mb-3">
              How Subscription Tracking Works
            </h3>
            <div className="space-y-3 text-[13px] text-slate-600">
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 flex-shrink-0 mt-0.5">1</span>
                <p><strong>Enable a Provider:</strong> Click on any provider from the "Available Providers" section to enable tracking. For example, enable "Slack" to start tracking your Slack subscription.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 flex-shrink-0 mt-0.5">2</span>
                <p><strong>Add Subscription Plans:</strong> After enabling, click "Add Plans" to configure your subscription details - plan type (Pro, Team, Enterprise), number of seats, billing cycle (monthly/annual), and pricing.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 flex-shrink-0 mt-0.5">3</span>
                <p><strong>Assign to Hierarchy:</strong> Optionally assign subscriptions to departments, projects, or teams for detailed cost allocation and chargeback reporting.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 flex-shrink-0 mt-0.5">4</span>
                <p><strong>Track Costs:</strong> View aggregated costs in the <Link href={`/${orgSlug}/cost-dashboards/subscription-costs`} className="text-[#007AFF] font-medium hover:underline">Subscription Costs Dashboard</Link>. Costs are calculated daily based on your plan configurations.</p>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-[12px] text-amber-800">
                  <strong>Tip:</strong> Use the same currency across all subscriptions (matching your organization's default currency) for accurate cost comparisons. Currency can be set in <Link href={`/${orgSlug}/settings/organization`} className="text-[#007AFF] font-medium hover:underline">Organization Settings</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
