"use client"

/**
 * Provider Detail Page
 *
 * Shows all subscription plans for a specific provider.
 * Uses API service to fetch seeded plans from BigQuery.
 */

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Pencil,
  Brain,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Cloud,
  CalendarX,
  Info,
  CreditCard,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Premium components - same as dashboard/pipeline pages
import { StatRow } from "@/components/ui/stat-row"
import { PremiumCard, SectionHeader } from "@/components/ui/premium-card"
import { LoadingState } from "@/components/ui/loading-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

import {
  getProviderPlans,
  getProviderMeta,
  getAvailablePlans,
  createCustomPlan,
  SubscriptionPlan,
  type ProviderMeta,
  type AvailablePlan,
  type PlanCreate,
  type BillingCycle,
} from "@/actions/subscription-providers"
import { getHierarchy, type HierarchyEntity } from "@/actions/hierarchy"
import { formatCurrency, formatDateOnly, convertFromUSD, getExchangeRate, getCurrencySymbol, DEFAULT_CURRENCY } from "@/lib/i18n"
import { getOrgLocale } from "@/actions/organization-locale"

// Provider display names
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  chatgpt_plus: "ChatGPT Plus",
  claude_pro: "Claude Pro",
  gemini_advanced: "Gemini Advanced",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
  windsurf: "Windsurf",
  replit: "Replit",
  v0: "v0",
  lovable: "Lovable",
  canva: "Canva",
  adobe_cc: "Adobe Creative Cloud",
  figma: "Figma",
  miro: "Miro",
  notion: "Notion",
  confluence: "Confluence",
  asana: "Asana",
  monday: "Monday.com",
  slack: "Slack",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  supabase: "Supabase",
}

// Provider aliases - redirect old/incorrect provider names to canonical names
// Example: chatgpt_enterprise → chatgpt_plus (all ChatGPT plans live under chatgpt_plus)
const PROVIDER_ALIASES: Record<string, string> = {
  chatgpt_enterprise: "chatgpt_plus",
  chatgpt_team: "chatgpt_plus",
  chatgpt_free: "chatgpt_plus",
  claude_enterprise: "claude_pro",
  claude_team: "claude_pro",
  claude_free: "claude_pro",
}

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

function getCanonicalProvider(provider: string): string {
  return PROVIDER_ALIASES[provider.toLowerCase()] || provider.toLowerCase()
}

// Category icon mapping
const categoryIcons: Record<string, React.ReactNode> = {
  ai: <Brain className="h-6 w-6" />,
  design: <Palette className="h-6 w-6" />,
  productivity: <FileText className="h-6 w-6" />,
  communication: <MessageSquare className="h-6 w-6" />,
  development: <Code className="h-6 w-6" />,
  cloud: <Cloud className="h-6 w-6" />,
  other: <CreditCard className="h-6 w-6" />,
}

// Extended form data to include audit trail and hierarchy
interface FormDataWithAudit {
  plan_name: string
  display_name: string
  unit_price: number | undefined
  seats: number | undefined
  billing_cycle: BillingCycle
  pricing_model: 'PER_SEAT' | 'FLAT_FEE'
  currency: string
  notes: string
  source_currency?: string
  source_price?: number
  exchange_rate_used?: number
  // N-level hierarchy fields for cost allocation (v14.0)
  hierarchy_entity_id?: string
  hierarchy_entity_name?: string
  hierarchy_level_code?: string
  hierarchy_path?: string
  hierarchy_path_names?: string
}

// Hierarchy entity for N-level dropdown
interface HierarchyOption {
  entity_id: string
  entity_name: string
  level_code: string
  path: string
  path_names: string[]
  depth: number
}

export default function ProviderDetailPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const _router = useRouter()
  const { orgSlug, provider: rawProvider } = params

  // Canonicalize provider name (handle aliases like chatgpt_enterprise → chatgpt_plus)
  const provider = rawProvider ? getCanonicalProvider(rawProvider) : rawProvider

  // Track if we redirected from an alias
  const isAliased = rawProvider && rawProvider !== provider

  // Validate params
  const isValidParams = orgSlug && provider && typeof orgSlug === "string" && typeof provider === "string"

  // State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [_totalMonthlyCost, setTotalMonthlyCost] = useState(0)  // From plan data
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [_providerMeta, setProviderMeta] = useState<ProviderMeta | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)

  // Sheet state
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false)
  const [customSheetOpen, setCustomSheetOpen] = useState(false)
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())

  // Custom form state
  const [formData, setFormData] = useState<FormDataWithAudit>({
    plan_name: "",
    display_name: "",
    unit_price: undefined,
    seats: undefined,
    billing_cycle: "monthly",
    pricing_model: "FLAT_FEE",
    currency: "USD",
    notes: "",
    source_currency: undefined,
    source_price: undefined,
    exchange_rate_used: undefined,
  })
  const [isFromTemplate, setIsFromTemplate] = useState(false)

  // N-level hierarchy state for cost allocation dropdown
  const [hierarchyEntities, setHierarchyEntities] = useState<HierarchyOption[]>([])
  const [loadingHierarchy, setLoadingHierarchy] = useState(false)

  // Load plans from BigQuery
  const loadPlans = useCallback(async (isMounted?: () => boolean) => {
    if (!isValidParams) {
      if (!isMounted || isMounted()) {
        setError("Invalid page parameters")
        setLoading(false)
      }
      return
    }

    if (!isMounted || isMounted()) setLoading(true)
    if (!isMounted || isMounted()) setError(null)

    try {
      // Fetch provider meta, plans, and org locale in parallel
      const [metaResult, plansResult, localeResult] = await Promise.all([
        getProviderMeta(orgSlug, provider),
        getProviderPlans(orgSlug, provider),
        getOrgLocale(orgSlug)
      ])

      // Check if component is still mounted before updating state
      if (isMounted && !isMounted()) return

      // Set org currency for formatting
      if (localeResult.success && localeResult.locale) {
        setOrgCurrency(localeResult.locale.default_currency)
      }

      // Set provider meta (for icon display)
      if (metaResult.success && metaResult.provider) {
        setProviderMeta(metaResult.provider)
      }

      if (plansResult.success) {
        setPlans(plansResult.plans || [])
        setTotalMonthlyCost(plansResult.total_monthly_cost || 0)
      } else {
        setPlans([])
        setTotalMonthlyCost(0)

        if (plansResult.error?.includes("API key not found")) {
          setError("Backend not configured. Please complete organization onboarding in Settings to enable subscription tracking.")
        } else if (plansResult.error?.includes("Invalid provider name")) {
          setError(`Provider "${provider}" is not recognized. Please check the provider name and try again.`)
        } else {
          setError(plansResult.error || "Failed to load plans")
        }
      }
    } catch {
      // Handle unexpected errors during parallel fetching
      if (!isMounted || isMounted()) {
        setError("Failed to load provider data. Please try again.")
        setPlans([])
        setTotalMonthlyCost(0)
      }
    } finally {
      if (!isMounted || isMounted()) setLoading(false)
    }
  }, [orgSlug, provider, isValidParams])

  useEffect(() => {
    let mounted = true
    loadPlans(() => mounted)
    return () => { mounted = false }
  }, [loadPlans])

  // Open template sheet and load available templates
  const openTemplateSheet = async () => {
    setTemplateSheetOpen(true)
    setLoadingTemplates(true)
    try {
      const result = await getAvailablePlans(orgSlug, provider)
      if (result.success) {
        setAvailablePlans(result.plans || [])
      } else {
        setAvailablePlans([])
      }
    } catch {
      setAvailablePlans([])
    } finally {
      setLoadingTemplates(false)
    }
  }

  // Handle template selection - populate form and open custom sheet
  const handleSelectTemplate = (template: AvailablePlan) => {
    const convertedPrice = convertFromUSD(template.unit_price, orgCurrency)
    const exchangeRate = getExchangeRate(orgCurrency)

    setFormData({
      plan_name: template.plan_name,
      display_name: template.display_name || template.plan_name,
      unit_price: convertedPrice,
      seats: template.seats || 1,
      billing_cycle: template.billing_cycle as BillingCycle,
      pricing_model: template.pricing_model,
      currency: orgCurrency,
      notes: template.notes || "",
      source_currency: "USD",
      source_price: template.unit_price,
      exchange_rate_used: exchangeRate,
    })
    setIsFromTemplate(true)
    setStartDate(new Date())
    setTemplateSheetOpen(false)
    loadHierarchy()
    setCustomSheetOpen(true)
  }

  // Load N-level hierarchy entities for cost allocation dropdown
  const loadHierarchy = useCallback(async () => {
    setLoadingHierarchy(true)
    try {
      // Use N-level hierarchy API: getHierarchy(orgSlug) without level filter
      const result = await getHierarchy(orgSlug)

      if (result.success && result.data) {
        // Sort by depth for hierarchical display, then by name
        const sortedEntities = result.data
          .map((e: HierarchyEntity) => ({
            entity_id: e.entity_id,
            entity_name: e.entity_name,
            level_code: e.level_code,
            path: e.path,
            path_names: e.path_names || [],
            depth: e.depth,
          }))
          .sort((a: HierarchyOption, b: HierarchyOption) => {
            if (a.depth !== b.depth) return a.depth - b.depth
            return a.entity_name.localeCompare(b.entity_name)
          })
        setHierarchyEntities(sortedEntities)
      }
    } catch (err) {
      console.error("Failed to load hierarchy:", err)
    } finally {
      setLoadingHierarchy(false)
    }
  }, [orgSlug])

  // Handle N-level hierarchy entity selection
  const handleHierarchyChange = (entityId: string) => {
    if (!entityId) {
      // Clear hierarchy selection
      setFormData({
        ...formData,
        hierarchy_entity_id: undefined,
        hierarchy_entity_name: undefined,
        hierarchy_level_code: undefined,
        hierarchy_path: undefined,
        hierarchy_path_names: undefined,
      })
      return
    }
    const entity = hierarchyEntities.find(e => e.entity_id === entityId)
    if (entity) {
      setFormData({
        ...formData,
        hierarchy_entity_id: entity.entity_id,
        hierarchy_entity_name: entity.entity_name,
        hierarchy_level_code: entity.level_code,
        hierarchy_path: entity.path,
        hierarchy_path_names: entity.path_names.join(" > "),
      })
    }
  }

  // Open custom sheet with empty form
  const openCustomSheet = () => {
    resetForm()
    loadHierarchy()
    setCustomSheetOpen(true)
  }

  // Reset form to initial state
  const resetForm = () => {
    setFormData({
      plan_name: "",
      display_name: "",
      unit_price: undefined,
      seats: undefined,
      billing_cycle: "monthly",
      pricing_model: "FLAT_FEE",
      currency: orgCurrency,
      notes: "",
      source_currency: undefined,
      source_price: undefined,
      exchange_rate_used: undefined,
      hierarchy_entity_id: undefined,
      hierarchy_entity_name: undefined,
      hierarchy_level_code: undefined,
      hierarchy_path: undefined,
      hierarchy_path_names: undefined,
    })
    setIsFromTemplate(false)
    setStartDate(new Date())
    setError(null)
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.plan_name.trim()) {
      setError("Plan name is required")
      return
    }

    if (!startDate) {
      setError("Start date is required")
      return
    }

    if (formData.unit_price === undefined || formData.unit_price < 0) {
      setError("Price must be a valid positive number")
      return
    }

    if (formData.seats === undefined || formData.seats < 0) {
      setError("Seats must be a valid positive number")
      return
    }

    if (formData.pricing_model === 'PER_SEAT' && formData.seats < 1) {
      setError("Per-seat plans require at least 1 seat")
      return
    }

    if (formData.seats > 10000) {
      setError("Seats cannot exceed 10,000")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const startDateStr = format(startDate, "yyyy-MM-dd")

      // Ensure required fields are defined
      if (formData.unit_price === undefined || formData.seats === undefined) {
        setError("Price and seats are required")
        return
      }

      const planData: PlanCreate & {
        source_currency?: string
        source_price?: number
        exchange_rate_used?: number
        // N-level hierarchy fields (v14.0)
        hierarchy_entity_id?: string
        hierarchy_entity_name?: string
        hierarchy_level_code?: string
        hierarchy_path?: string
        hierarchy_path_names?: string
      } = {
        plan_name: formData.plan_name.toUpperCase().replace(/\s+/g, "_"),
        display_name: formData.display_name || formData.plan_name,
        unit_price: formData.unit_price,
        seats: formData.seats,
        billing_cycle: formData.billing_cycle,
        pricing_model: formData.pricing_model,
        currency: formData.currency,
        notes: formData.notes,
        start_date: startDateStr,
      }

      // Add audit trail for currency conversion
      if (formData.source_currency && formData.source_price !== undefined && formData.exchange_rate_used) {
        planData.source_currency = formData.source_currency
        planData.source_price = formData.source_price
        planData.exchange_rate_used = formData.exchange_rate_used
      }

      // Add N-level hierarchy fields for cost allocation
      if (formData.hierarchy_entity_id) {
        planData.hierarchy_entity_id = formData.hierarchy_entity_id
        planData.hierarchy_entity_name = formData.hierarchy_entity_name
        planData.hierarchy_level_code = formData.hierarchy_level_code
        planData.hierarchy_path = formData.hierarchy_path
        planData.hierarchy_path_names = formData.hierarchy_path_names
      }

      const result = await createCustomPlan(orgSlug, provider, planData)

      if (!result.success) {
        setError(result.error || "Failed to create subscription")
        return
      }

      toast.success("Subscription added successfully")
      setCustomSheetOpen(false)
      resetForm()
      // Reload plans
      loadPlans()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const providerDisplayName = getProviderDisplayName(provider)
  // Filter plans based on showDeleted toggle
  const visiblePlans = showDeleted
    ? plans // Show all plans including cancelled/expired
    : plans.filter(p => p.status === 'active' || p.status === 'pending')
  // Total active seats = sum of all seats from active plans
  const totalActiveSeats = plans.filter(p => p.status === 'active').reduce((sum, p) => sum + (p.seats ?? 0), 0)
  const activeSubscriptionsCount = plans.filter(p => p.status === 'active' && (p.seats ?? 0) > 0).length
  const deletedPlansCount = plans.filter(p => p.status === 'cancelled' || p.status === 'expired').length

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header - Same pattern as dashboard */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center flex-shrink-0 shadow-sm">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
            </div>
            <div>
              <h1 className="text-[22px] sm:text-[28px] lg:text-[32px] font-bold text-slate-900 tracking-tight leading-tight">
                {providerDisplayName}
              </h1>
              <p className="text-[13px] sm:text-[14px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
                Manage subscription plans for {providerDisplayName}
              </p>
            </div>
          </div>
        </div>
        <LoadingState message="Loading subscription plans..." />
      </div>
    )
  }

  // Stats for StatRow component - same pattern as dashboard/pipelines
  const stats = [
    { icon: CreditCard, value: String(totalActiveSeats), label: "Active Seats", color: "coral" as const },
    { icon: Check, value: String(activeSubscriptionsCount), label: "Subscriptions", color: "mint" as const },
    { icon: CreditCard, value: String(visiblePlans.length), label: "Plans", color: "slate" as const },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link
          href={`/${orgSlug}/integrations/subscriptions`}
          className="text-[#1a7a3a] hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2 rounded truncate max-w-[200px]"
          title="Subscription Providers"
        >
          Subscription Providers
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <span className="text-gray-900 font-medium truncate max-w-[300px]" title={providerDisplayName}>{providerDisplayName}</span>
      </nav>

      {/* Header - Same pattern as dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <Link href={`/${orgSlug}/integrations/subscriptions`} className="flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center flex-shrink-0 shadow-sm text-[#1a7a3a]">
            {/* Get category from first plan if available, otherwise use default icon */}
            {plans.length > 0 && plans[0].category ? categoryIcons[plans[0].category] || categoryIcons.other : <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />}
          </div>
          <div>
            <h1 className="text-[22px] sm:text-[28px] lg:text-[32px] font-bold text-slate-900 tracking-tight leading-tight">
              {providerDisplayName}
            </h1>
            <p className="text-[13px] sm:text-[14px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
              Manage subscription plans for {providerDisplayName}
            </p>
          </div>
        </div>
        {plans.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 sm:mt-0">
            <Button
              onClick={openTemplateSheet}
              className="h-11 px-5 text-[13px] font-semibold bg-[#90FCA6] hover:bg-[#B8FDCA] text-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2"
              data-testid="add-from-template-btn"
            >
              <Plus className="h-4 w-4" />
              Add from Template
            </Button>
            <Button
              onClick={openCustomSheet}
              className="h-11 px-5 text-[13px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all flex items-center gap-2"
              data-testid="add-custom-subscription-btn"
            >
              <Plus className="h-4 w-4" />
              Add Custom
            </Button>
          </div>
        )}
      </div>

      {/* Stats Row - Using StatRow component like dashboard/pipelines */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm">
        <StatRow stats={stats} size="md" />
      </div>

      {/* Provider Alias Info Banner */}
      {isAliased && (
        <Card className="border-[#90FCA6]/20 bg-[#90FCA6]/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-[#1a7a3a] flex-shrink-0" />
              <p className="text-sm text-[#1a7a3a]">
                All {rawProvider.replace(/_/g, " ")} plans are managed under <strong>{getProviderDisplayName(provider)}</strong>.
                You&apos;re viewing the correct provider page.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <Card className="border-[#FF6C5E]/30 bg-[#FF6C5E]/5 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-[#FF6C5E] hover:text-[#E55A3C] hover:bg-[#FF6C5E]/10"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardContent className="pt-6 pr-10">
            <p className="text-sm text-[#FF6C5E]">{error}</p>
            <p className="text-xs text-[#FF6C5E] mt-1">
              Make sure the provider is enabled and API service is running.
            </p>
          </CardContent>
        </Card>
      )}


      {/* Plans Section */}
      <div className="space-y-4 sm:space-y-6">
        <SectionHeader title={`${providerDisplayName} Plans`} icon={CreditCard} />

        <PremiumCard hover={false}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] text-slate-600">
              Click a row to see more details. Toggle plans to include them in cost tracking.
            </p>
            {deletedPlansCount > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="show-deleted" className="text-sm text-muted-foreground cursor-pointer" data-testid="show-deleted-label">
                  Show cancelled ({deletedPlansCount})
                </label>
                <input
                  id="show-deleted"
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-[#1a7a3a] focus:ring-[#90FCA6] cursor-pointer"
                  data-testid="show-deleted-checkbox"
                />
              </div>
            )}
          </div>
          {visiblePlans.length === 0 ? (
            <div className="text-center py-12 px-6">
              <div className="inline-flex p-4 rounded-2xl bg-[#90FCA6]/10 mb-4">
                <CreditCard className="h-12 w-12 text-[#1a7a3a]" />
              </div>
              <h3 className="text-[20px] font-semibold text-black mb-2">No subscriptions yet</h3>
              <p className="text-[15px] text-muted-foreground mb-6">
                Choose a predefined plan or create a custom one.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <Button
                  onClick={openTemplateSheet}
                  className="console-button-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add from Template
                </Button>
                <Button
                  onClick={openCustomSheet}
                  className="console-button-secondary"
                  data-testid="add-custom-subscription-empty-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Subscription
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="console-table-header-row grid grid-cols-12 gap-4 px-4 py-3 border-b bg-[#90FCA6]/[0.02]">
                <div className="col-span-1 console-table-header">Status</div>
                <div className="col-span-3 console-table-header">Plan Name</div>
                <div className="col-span-2 console-table-header text-right">Cost</div>
                <div className="col-span-2 console-table-header">Billing</div>
                <div className="col-span-2 console-table-header text-right">Seats</div>
                <div className="col-span-2 console-table-header text-right">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {visiblePlans.map((plan) => {
                  // A plan is truly "active" only if it has seats assigned
                  const hasActiveSeats = (plan.seats ?? 0) > 0
                  const isActive = (plan.status === 'active' || plan.status === 'pending') && hasActiveSeats
                  const isPending = plan.status === 'pending' || (plan.start_date && new Date(plan.start_date) > new Date())
                  // Display status: show "inactive" for plans with 0 seats
                  const displayStatus = hasActiveSeats ? plan.status : 'inactive'
                  const statusColors: Record<string, string> = {
                    active: "bg-[#F0FDFA] text-[#1a7a3a] border-[#90FCA6]/20",
                    inactive: "bg-[#90FCA6]/5 text-muted-foreground border-border",
                    pending: "bg-[#FF6C5E]/10 text-[#FF6C5E] border-[#FF6C5E]/20",
                    cancelled: "bg-[#90FCA6]/5 text-muted-foreground border-border",
                    expired: "bg-[#8E8E93]/12 text-muted-foreground border-[#8E8E93]/20"
                  }

                  return (
                  <div key={plan.subscription_id} data-testid={`plan-row-${plan.subscription_id}`}>
                    {/* Main Row */}
                    <div
                      className={`console-table-row grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-[#F0FDFA] cursor-pointer transition-colors ${!isActive ? "opacity-50" : ""}`}
                      onClick={() => setExpandedRow(expandedRow === plan.subscription_id ? null : plan.subscription_id)}
                      data-testid={`plan-row-clickable-${plan.subscription_id}`}
                    >
                      <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                        <Badge
                          variant="outline"
                          className={`capitalize text-xs ${statusColors[displayStatus] || statusColors.inactive}`}
                        >
                          {displayStatus}
                        </Badge>
                      </div>
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 truncate max-w-[200px]" title={plan.display_name || plan.plan_name}>
                            {plan.display_name || plan.plan_name}
                          </span>
                          {isPending && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-[#FF6C5E]/10 text-[#FF6C5E] border-[#FF6C5E]/20"
                              title="This plan will become active when the start date arrives"
                            >
                              Pending {plan.start_date && `(${format(new Date(plan.start_date), 'MMM d')})`}
                            </Badge>
                          )}
                          {expandedRow === plan.subscription_id ? (
                            <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="font-medium text-[#FF6C5E]">
                          {formatCurrency(plan.unit_price, orgCurrency)}
                        </div>
                        {plan.pricing_model && (
                          <div className="text-xs text-muted-foreground">
                            {plan.pricing_model === 'PER_SEAT' ? '/seat' : 'flat fee'}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Badge variant="outline" className="capitalize bg-[#90FCA6]/5">
                          {plan.billing_cycle}
                        </Badge>
                      </div>
                      <div className="col-span-2 text-right text-foreground">
                        {plan.seats ?? 0}
                      </div>
                      <div className="col-span-2 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/${orgSlug}/integrations/subscriptions/${provider}/${plan.subscription_id}/edit`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#1a7a3a] hover:bg-[#90FCA6]/10"
                            title="Edit plan"
                            aria-label="Edit plan"
                            data-testid={`edit-plan-${plan.subscription_id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/${orgSlug}/integrations/subscriptions/${provider}/${plan.subscription_id}/end`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-[#FF6C5E] hover:bg-[#FF6C5E]/10"
                            title="End subscription"
                            aria-label="End subscription"
                            data-testid={`end-plan-${plan.subscription_id}`}
                          >
                            <CalendarX className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/* Expanded Details Row */}
                    {expandedRow === plan.subscription_id && (
                      <div className="bg-[#90FCA6]/[0.02] px-4 py-4 border-t border-border">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {plan.start_date && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Start Date</span>
                              <span className="font-medium">{formatDateOnly(plan.start_date)}</span>
                            </div>
                          )}
                          {plan.renewal_date && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Renewal Date</span>
                              <span className="font-medium">{formatDateOnly(plan.renewal_date)}</span>
                            </div>
                          )}
                          {plan.owner_email && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Owner</span>
                              <span className="font-medium">{plan.owner_email}</span>
                            </div>
                          )}
                          {plan.department && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Department</span>
                              <span className="font-medium">{plan.department}</span>
                            </div>
                          )}
                          {plan.contract_id && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Contract ID</span>
                              <span className="font-medium">{plan.contract_id}</span>
                            </div>
                          )}
                          {plan.currency && plan.currency !== orgCurrency && (
                            <div className="col-span-2 md:col-span-4">
                              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                                <span className="text-[13px] font-medium text-amber-700">
                                  Currency differs from org default ({orgCurrency})
                                </span>
                              </div>
                            </div>
                          )}
                          {plan.auto_renew !== undefined && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Auto Renew</span>
                              <Badge variant={plan.auto_renew ? "default" : "outline"}>
                                {plan.auto_renew ? "Yes" : "No"}
                              </Badge>
                            </div>
                          )}
                          {plan.discount_type && plan.discount_value !== undefined && plan.discount_value > 0 && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Discount</span>
                              <span className="font-medium text-[#1a7a3a]">
                                {plan.discount_type === 'percent' ? `${plan.discount_value}%` : formatCurrency(plan.discount_value, orgCurrency)}
                              </span>
                            </div>
                          )}
                          {plan.category && (
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Category</span>
                              <Badge variant="outline" className="capitalize">{plan.category}</Badge>
                            </div>
                          )}
                          {plan.notes && (
                            <div className="col-span-2 md:col-span-4">
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Notes</span>
                              <span className="text-foreground">{plan.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>

              {/* Add Custom Subscription Footer */}
              <div className="px-4 py-4 border-t border-border bg-[#90FCA6]/[0.02]">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Don&apos;t see your subscription plan?
                  </p>
                  <Button
                    onClick={openCustomSheet}
                    className="console-button-secondary"
                    data-testid="add-custom-subscription-footer-btn"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Subscription
                  </Button>
                </div>
              </div>
            </>
          )}
        </PremiumCard>
      </div>

      {/* Template Sheet - Select from predefined templates */}
      <Sheet open={templateSheetOpen} onOpenChange={setTemplateSheetOpen}>
        <SheetContent side="right" size="xl" className="overflow-y-auto bg-white flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#90FCA6]/10 to-[#B8FDCA]/10">
                <CreditCard className="h-5 w-5 text-[#1a7a3a]" />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-foreground">Select a Template</SheetTitle>
                <SheetDescription className="mt-0.5">
                  Choose a plan for {providerDisplayName}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="px-6 py-5 flex-1 overflow-y-auto">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-[#1a7a3a] mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Loading templates...</p>
                </div>
              </div>
            ) : availablePlans.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="inline-flex p-4 rounded-2xl bg-[#90FCA6]/10 mb-4">
                  <CreditCard className="h-12 w-12 text-[#1a7a3a]" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Templates Available</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                  There are no predefined templates for this provider. Create a custom plan instead.
                </p>
                <Button
                  onClick={() => {
                    setTemplateSheetOpen(false)
                    openCustomSheet()
                  }}
                  className="console-button-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Custom Subscription
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {availablePlans.map((template) => {
                  const convertedPrice = convertFromUSD(template.unit_price, orgCurrency)
                  return (
                    <div
                      key={template.plan_name}
                      className="border border-border rounded-2xl p-5 hover:border-[#90FCA6] hover:shadow-md hover:shadow-[#90FCA6]/5 cursor-pointer transition-all duration-200 group bg-white"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-foreground group-hover:text-[#1a7a3a] truncate transition-colors">
                              {template.display_name || template.plan_name}
                            </h4>
                            <Badge variant="outline" className="capitalize text-[11px] shrink-0 bg-[#90FCA6]/5">
                              {template.billing_cycle}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {template.pricing_model === 'PER_SEAT' ? 'Per seat pricing' : 'Flat fee'}
                            {template.seats && template.seats > 1 && ` • ${template.seats} seats included`}
                          </p>
                          {template.notes && (
                            <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-2">{template.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xl font-bold text-[#FF6C5E]">
                            {formatCurrency(convertedPrice, orgCurrency)}
                          </div>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            /{template.billing_cycle === 'monthly' ? 'mo' : template.billing_cycle === 'annual' ? 'yr' : template.billing_cycle}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs bg-[#90FCA6]/5 text-[#1a7a3a] border-[#90FCA6]/20">
                            {template.seats || 1} seat{(template.seats || 1) > 1 ? 's' : ''}
                          </Badge>
                          {template.category && (
                            <Badge variant="outline" className="text-xs capitalize bg-[#90FCA6]/5">
                              {template.category}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm font-medium text-[#1a7a3a] opacity-0 group-hover:opacity-100 transition-opacity">
                          Select
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-border bg-[#90FCA6]/[0.02] shrink-0">
            <Button
              onClick={() => {
                setTemplateSheetOpen(false)
                openCustomSheet()
              }}
              className="console-button-secondary w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Custom Instead
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Custom Sheet - Add/Edit subscription form */}
      <Sheet open={customSheetOpen} onOpenChange={setCustomSheetOpen}>
        <SheetContent side="right" size="xl" className="overflow-y-auto bg-white flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#90FCA6]/10 to-[#B8FDCA]/10">
                <Plus className="h-5 w-5 text-[#1a7a3a]" />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-foreground">
                  {isFromTemplate ? 'Customize Subscription' : 'Add Custom Subscription'}
                </SheetTitle>
                <SheetDescription className="mt-0.5">
                  {isFromTemplate
                    ? 'Review and customize before adding'
                    : `Create a plan for ${providerDisplayName}`}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 flex-1 overflow-y-auto">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label htmlFor="plan_name">Plan Name *</Label>
              <Input
                id="plan_name"
                value={formData.plan_name}
                onChange={(e) => {
                  setFormData({ ...formData, plan_name: e.target.value })
                  setError(null)
                }}
                placeholder="e.g., PRO, TEAM, ENTERPRISE"
                className="uppercase"
                required
              />
              <p className="text-xs text-muted-foreground">Internal identifier (will be uppercased)</p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="e.g., Professional Plan"
              />
              <p className="text-xs text-muted-foreground">User-friendly name shown in reports</p>
            </div>

            {/* Price and Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price ({getCurrencySymbol(orgCurrency)}) *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.unit_price ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === "") {
                      setFormData({ ...formData, unit_price: undefined })
                    } else {
                      const parsed = parseFloat(value)
                      setFormData({ ...formData, unit_price: isNaN(parsed) ? undefined : Math.max(0, parsed) })
                    }
                    setError(null)
                  }}
                  placeholder="0.00"
                  required
                />
                {isFromTemplate && formData.source_price !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Original: {formatCurrency(formData.source_price, formData.source_currency || 'USD')}
                    {formData.exchange_rate_used && ` (rate: ${formData.exchange_rate_used})`}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={orgCurrency} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={orgCurrency}>{orgCurrency}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Locked to org currency</p>
              </div>
            </div>

            {/* Billing Cycle and Pricing Model */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Billing Cycle *</Label>
                <Select
                  value={formData.billing_cycle}
                  onValueChange={(value) => setFormData({ ...formData, billing_cycle: value as BillingCycle })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pricing Model *</Label>
                <Select
                  value={formData.pricing_model}
                  onValueChange={(value) => setFormData({ ...formData, pricing_model: value as 'FLAT_FEE' | 'PER_SEAT' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT_FEE">Flat Fee</SelectItem>
                    <SelectItem value="PER_SEAT">Per Seat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Seats */}
            <div className="space-y-2">
              <Label htmlFor="seats">Number of Seats *</Label>
              <Input
                id="seats"
                type="number"
                min={formData.pricing_model === 'PER_SEAT' ? 1 : 0}
                max="10000"
                value={formData.seats ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === "") {
                    setFormData({ ...formData, seats: undefined })
                  } else {
                    const parsed = parseInt(value, 10)
                    const bounded = Math.min(10000, Math.max(0, isNaN(parsed) ? 0 : parsed))
                    setFormData({ ...formData, seats: bounded })
                  }
                  setError(null)
                }}
                placeholder="1"
                required
              />
              {formData.pricing_model === 'PER_SEAT' && formData.unit_price !== undefined && formData.seats !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Total: {formatCurrency(formData.unit_price * formData.seats, orgCurrency)}/{formData.billing_cycle}
                </p>
              )}
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <DatePicker
                date={startDate}
                onSelect={setStartDate}
              />
              <p className="text-xs text-muted-foreground">When does this subscription become active?</p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes about this subscription"
              />
            </div>

            {/* Cost Allocation - Hierarchy Selection */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">Cost Allocation</h4>
                <Badge variant="outline" className="text-[10px] bg-[#90FCA6]/10 text-[#1a7a3a] border-[#90FCA6]/30">
                  Optional
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Assign this subscription to a hierarchy entity for cost tracking
              </p>

              {loadingHierarchy ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-[#1a7a3a]" />
                  <span className="text-sm text-muted-foreground">Loading hierarchy...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Cost Allocation Entity</Label>
                  <Select
                    value={formData.hierarchy_entity_id || ""}
                    onValueChange={handleHierarchyChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select hierarchy entity...">
                        {formData.hierarchy_entity_id && formData.hierarchy_path_names ? (
                          <span className="truncate">{formData.hierarchy_path_names}</span>
                        ) : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">
                        <span className="text-muted-foreground">No allocation (org-level)</span>
                      </SelectItem>
                      {hierarchyEntities.map((entity) => (
                        <SelectItem key={entity.entity_id} value={entity.entity_id}>
                          <span style={{ paddingLeft: `${entity.depth * 16}px` }} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground capitalize">[{entity.level_code}]</span>
                            <span>{entity.entity_name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.hierarchy_path && (
                    <p className="text-xs text-muted-foreground">
                      Path: {formData.hierarchy_path}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 rounded-lg">
                <p className="text-sm text-[#FF6C5E]">{error}</p>
              </div>
            )}

          </form>

          {/* Submit Buttons - Fixed Footer */}
          <div className="px-6 py-4 border-t border-border bg-[#90FCA6]/[0.02] shrink-0 flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              onClick={() => {
                setCustomSheetOpen(false)
                resetForm()
              }}
              className="console-button-secondary flex-1"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="subscription-form"
              className="console-button-primary flex-1"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Add Subscription
                </>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
