"use client"

/**
 * Provider Detail Page
 *
 * Shows all subscription plans for a specific provider.
 * Uses API service to fetch seeded plans from BigQuery.
 */

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  Plus,
  Loader2,
  CreditCard,
  Check,
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
} from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
// Switch removed - no longer using toggle
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { CardSkeleton } from "@/components/ui/card-skeleton"

import { DatePicker } from "@/components/ui/date-picker"
import {
  getProviderPlans,
  getProviderMeta,
  createCustomPlan,
  editPlanWithVersion,
  endSubscription,
  getAvailablePlans,
  getSaaSSubscriptionCosts,
  SubscriptionPlan,
  PlanCreate,
  PlanUpdate,
  type ProviderMeta,
  type AvailablePlan,
  type SaaSCostSummary,
  type SaaSCostRecord,
} from "@/actions/subscription-providers"

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

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
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

export default function ProviderDetailPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const { orgSlug, provider } = params

  // Validate params
  const isValidParams = orgSlug && provider && typeof orgSlug === "string" && typeof provider === "string"

  // State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0)  // From plan data (fallback)
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [providerMeta, setProviderMeta] = useState<ProviderMeta | null>(null)
  // Cost data from Polars (source of truth for costs)
  const [costSummary, setCostSummary] = useState<SaaSCostSummary | null>(null)
  const [costRecords, setCostRecords] = useState<SaaSCostRecord[]>([])

  // Effective monthly cost: prefer Polars data, fallback to plan calculation
  const effectiveMonthlyCost = costSummary?.total_monthly_cost ?? totalMonthlyCost

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState<{ open: boolean; plan: SubscriptionPlan | null }>({
    open: false,
    plan: null,
  })
  const [showEndDialog, setShowEndDialog] = useState<{ open: boolean; plan: SubscriptionPlan | null }>({
    open: false,
    plan: null,
  })
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [ending, setEnding] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Date states
  const [addStartDate, setAddStartDate] = useState<Date | undefined>(new Date())
  const [editEffectiveDate, setEditEffectiveDate] = useState<Date | undefined>(new Date())
  const [endDate, setEndDate] = useState<Date | undefined>(new Date())

  // Add form state
  const [newPlan, setNewPlan] = useState<PlanCreate>({
    plan_name: "",
    display_name: "",
    unit_price_usd: 0,
    seats: 1,
    billing_cycle: "monthly",
    pricing_model: "FLAT_FEE",
    currency: "USD",
    notes: "",
  })

  // Edit form state
  const [editPlanData, setEditPlanData] = useState<PlanUpdate>({
    display_name: "",
    unit_price_usd: 0,
    seats: 0,
    billing_cycle: "monthly",
    pricing_model: "FLAT_FEE",
    currency: "USD",
    notes: "",
  })

  // Reset form to initial state
  const resetNewPlanForm = () => {
    setNewPlan({
      plan_name: "",
      display_name: "",
      unit_price_usd: 0,
      seats: 1,
      billing_cycle: "monthly",
      pricing_model: "FLAT_FEE",
      currency: "USD",
      notes: "",
    })
  }

  // Handle add dialog open/close
  const handleAddDialogOpenChange = (open: boolean) => {
    setShowAddDialog(open)
    if (open) {
      // Reset date when opening
      setAddStartDate(new Date())
    } else {
      // Reset form and clear error when closing
      resetNewPlanForm()
      setError(null)
    }
  }

  // Load available template plans
  const loadAvailablePlans = async () => {
    setLoadingTemplates(true)
    setError(null)
    const result = await getAvailablePlans(orgSlug, provider)

    if (result.success) {
      setAvailablePlans(result.plans || [])
    } else {
      setError(result.error || "Failed to load available plans")
      setAvailablePlans([])
    }
    setLoadingTemplates(false)
  }

  // Handle template dialog open
  const handleTemplateDialogOpen = async () => {
    setShowTemplateDialog(true)
    await loadAvailablePlans()
  }

  // Handle template selection - pre-fill add form with template data
  const handleSelectTemplate = (template: AvailablePlan) => {
    setNewPlan({
      plan_name: template.plan_name,
      display_name: template.display_name || template.plan_name,
      unit_price_usd: template.unit_price_usd,
      seats: template.seats || 1, // Use template seats or default to 1
      billing_cycle: template.billing_cycle,
      pricing_model: template.pricing_model,
      currency: "USD", // Available plans don't have currency field
      notes: template.notes || "",
    })
    setShowTemplateDialog(false)
    setShowAddDialog(true)
  }

  // Load plans from BigQuery and costs from Polars (source of truth for costs)
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

    // Fetch provider meta, plans, and costs in parallel
    // - Plans from saas_subscription_plans (BigQuery) for plan details
    // - Costs from cost_data_standard_1_2 (Polars) for actual costs
    const [metaResult, plansResult, costsResult] = await Promise.all([
      getProviderMeta(orgSlug, provider),
      getProviderPlans(orgSlug, provider),
      getSaaSSubscriptionCosts(orgSlug, undefined, undefined, provider)  // Filter by provider
    ])

    // Check if component is still mounted before updating state
    if (isMounted && !isMounted()) return

    // Set provider meta (for icon display)
    if (metaResult.success && metaResult.provider) {
      setProviderMeta(metaResult.provider)
    }

    // Set cost data from Polars (source of truth for costs)
    if (costsResult.success) {
      setCostSummary(costsResult.summary)
      setCostRecords(costsResult.data || [])
    } else {
      setCostSummary(null)
      setCostRecords([])
    }

    if (plansResult.success) {
      setPlans(plansResult.plans || [])
      setTotalMonthlyCost(plansResult.total_monthly_cost || 0)  // Fallback if no Polars data
    } else {
      setPlans([])
      setTotalMonthlyCost(0)

      if (plansResult.error?.includes("API key not found")) {
        setError("Backend not configured. Please complete organization onboarding in Settings to enable subscription tracking.")
      } else {
        setError(plansResult.error || "Failed to load plans")
      }
    }

    setLoading(false)
  }, [orgSlug, provider, isValidParams])

  useEffect(() => {
    let mounted = true
    loadPlans(() => mounted)
    return () => { mounted = false }
  }, [loadPlans])

  // Handle edit dialog open/close
  const handleEditDialogOpenChange = (open: boolean, plan?: SubscriptionPlan) => {
    if (open && plan) {
      // Pre-fill form with existing plan data
      setEditPlanData({
        display_name: plan.display_name || plan.plan_name,
        unit_price_usd: plan.unit_price_usd,
        seats: plan.seats ?? 0,
        billing_cycle: plan.billing_cycle,
        pricing_model: plan.pricing_model || "FLAT_FEE",
        currency: plan.currency || "USD",
        notes: plan.notes || "",
      })
      setShowEditDialog({ open: true, plan })
      setEditEffectiveDate(new Date()) // Reset effective date
      setError(null) // Clear error when opening
    } else {
      setShowEditDialog({ open: false, plan: null })
      setError(null) // Clear error when closing
    }
  }

  // Edit plan via API service (creates new version)
  const handleEdit = async () => {
    if (!showEditDialog.plan) return
    if (!editEffectiveDate) {
      setError("Effective date is required")
      return
    }

    // Validate inputs
    if (editPlanData.unit_price_usd !== undefined && editPlanData.unit_price_usd < 0) {
      setError("Price cannot be negative")
      return
    }
    if (editPlanData.seats !== undefined && editPlanData.seats < 0) {
      setError("Seats cannot be negative")
      return
    }
    // Validate seats for PER_SEAT plans
    if (editPlanData.pricing_model === 'PER_SEAT' && (editPlanData.seats ?? 0) < 1) {
      setError("Per-seat plans require at least 1 seat")
      return
    }
    // Validate upper bound for seats
    if (editPlanData.seats !== undefined && editPlanData.seats > 10000) {
      setError("Seats cannot exceed 10,000")
      return
    }

    setEditing(true)
    setError(null)

    try {
      const effectiveDateStr = format(editEffectiveDate, "yyyy-MM-dd")
      const result = await editPlanWithVersion(
        orgSlug,
        provider,
        showEditDialog.plan.subscription_id,
        effectiveDateStr,
        editPlanData
      )

      if (!result.success) {
        setError(result.error || "Failed to update plan")
        toast.error(result.error || "Failed to update plan")
        return
      }

      setShowEditDialog({ open: false, plan: null })
      toast.success("Subscription updated successfully")
      await loadPlans()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setEditing(false)
    }
  }

  // End subscription (soft delete with end date)
  const handleEndSubscription = async () => {
    if (!showEndDialog.plan) return
    if (!endDate) {
      setError("End date is required")
      return
    }

    setEnding(true)
    setError(null)

    try {
      const endDateStr = format(endDate, "yyyy-MM-dd")
      const result = await endSubscription(
        orgSlug,
        provider,
        showEndDialog.plan.subscription_id,
        endDateStr
      )

      if (!result.success) {
        setError(result.error || "Failed to end subscription")
        toast.error(result.error || "Failed to end subscription")
        return
      }

      setShowEndDialog({ open: false, plan: null })
      toast.success("Subscription ended successfully")
      await loadPlans()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setEnding(false)
    }
  }

  // Add custom plan via API service
  const handleAdd = async () => {
    if (!newPlan.plan_name.trim()) return
    if (!addStartDate) {
      setError("Start date is required")
      return
    }

    // Validate inputs
    if (newPlan.unit_price_usd < 0) {
      setError("Price cannot be negative")
      return
    }
    if ((newPlan.seats ?? 0) < 0) {
      setError("Seats cannot be negative")
      return
    }
    // Validate seats for PER_SEAT plans
    if (newPlan.pricing_model === 'PER_SEAT' && (newPlan.seats ?? 0) < 1) {
      setError("Per-seat plans require at least 1 seat")
      return
    }
    // Validate upper bound for seats
    if ((newPlan.seats ?? 0) > 10000) {
      setError("Seats cannot exceed 10,000")
      return
    }

    setAdding(true)
    setError(null)

    try {
      const startDateStr = format(addStartDate, "yyyy-MM-dd")
      const result = await createCustomPlan(orgSlug, provider, {
        plan_name: newPlan.plan_name.toUpperCase().replace(/\s+/g, "_"),
        display_name: newPlan.display_name || newPlan.plan_name,
        unit_price_usd: newPlan.unit_price_usd,
        seats: newPlan.seats,
        billing_cycle: newPlan.billing_cycle,
        pricing_model: newPlan.pricing_model,
        currency: newPlan.currency,
        notes: newPlan.notes,
        start_date: startDateStr,
      })

      if (!result.success) {
        setError(result.error || "Failed to create plan")
        toast.error(result.error || "Failed to create plan")
        return
      }

      setShowAddDialog(false) // This will trigger handleAddDialogOpenChange which resets form
      toast.success("Subscription added successfully")
      await loadPlans()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setAdding(false)
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
      <div className="p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
              <CreditCard className="h-6 w-6 text-[#007A78]" />
            </div>
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-10 w-48" />
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton count={3} />
        </div>

        {/* Plans Table Skeleton */}
        <Card className="console-table-card">
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="px-0">
            {/* Table Header */}
            <div className="console-table-header-row grid grid-cols-12 gap-4 px-4 py-3 border-b bg-slate-50/50">
              {[1, 3, 2, 2, 2, 2].map((span, i) => (
                <div key={i} className={`col-span-${span}`}>
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
            {/* Table Rows */}
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 px-4 py-3.5">
                  <div className="col-span-1"><Skeleton className="h-6 w-10" /></div>
                  <div className="col-span-3"><Skeleton className="h-6 w-full" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-20 ml-auto" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-16" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-12 ml-auto" /></div>
                  <div className="col-span-2"><Skeleton className="h-6 w-16 ml-auto" /></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/${orgSlug}/settings/integrations/subscriptions`} className="hover:text-[#007A78]">Subscriptions</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900 font-medium">{providerDisplayName}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/subscriptions`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10 text-[#007A78]">
            {/* Get category from first plan if available, otherwise use default icon */}
            {plans.length > 0 && plans[0].category ? categoryIcons[plans[0].category] || categoryIcons.other : <CreditCard className="h-6 w-6" />}
          </div>
          <div>
            <h1 className="console-page-title">{providerDisplayName}</h1>
            <p className="console-subheading">
              Manage subscription plans for {providerDisplayName}
            </p>
          </div>
        </div>
        {plans.length > 0 && (
          <div className="flex items-center gap-2">
            <Button type="button" onClick={handleTemplateDialogOpen} className="console-button-primary" data-testid="add-from-template-btn">
              <Plus className="h-4 w-4 mr-2" />
              Add from Template
            </Button>
            <Button type="button" onClick={() => handleAddDialogOpenChange(true)} variant="outline" className="border-[#007A78]/30 text-[#007A78] hover:bg-[#007A78]/5" data-testid="add-custom-subscription-btn">
              <Plus className="h-4 w-4 mr-2" />
              Add Custom
            </Button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-red-200 bg-red-50 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-100"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardContent className="pt-6 pr-10">
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-xs text-red-500 mt-1">
              Make sure the provider is enabled and API service is running.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Info Banner - Cost Update Timing */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              New changes to subscription costs will be reflected within 24 hours once the scheduler runs every day at midnight.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[#007A78]">{formatCurrency(effectiveMonthlyCost)}</div>
            <p className="text-sm text-muted-foreground">Monthly Cost</p>
            {costSummary && (
              <p className="text-xs text-muted-foreground mt-1">From pipeline data</p>
            )}
          </CardContent>
        </Card>
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalActiveSeats}</div>
            <p className="text-sm text-muted-foreground">Total Active Seats</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{activeSubscriptionsCount}</div>
            <p className="text-sm text-muted-foreground">Active Subscriptions</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{visiblePlans.length}</div>
            <p className="text-sm text-muted-foreground">Available Plans</p>
          </CardContent>
        </Card>
      </div>

      {/* Plans Table */}
      <Card className="console-table-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="console-card-title">{providerDisplayName} Plans</CardTitle>
              <CardDescription>
                Toggle plans on/off to include them in cost tracking. Click a row to see more details.
              </CardDescription>
            </div>
            {deletedPlansCount > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="show-deleted" className="text-sm text-slate-500 cursor-pointer">
                  Show cancelled ({deletedPlansCount})
                </label>
                <input
                  id="show-deleted"
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#007A78] focus:ring-[#007A78] cursor-pointer"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {visiblePlans.length === 0 ? (
            <div className="text-center py-12 px-6">
              <CreditCard className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No subscriptions yet</h3>
              <p className="text-slate-500 mb-6">
                Choose a predefined plan or create a custom one.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={handleTemplateDialogOpen} className="console-button-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add from Template
                </Button>
                <Button onClick={() => handleAddDialogOpenChange(true)} variant="outline" className="border-[#007A78]/30 text-[#007A78] hover:bg-[#007A78]/5">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Subscription
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="console-table-header-row grid grid-cols-12 gap-4 px-4 py-3 border-b bg-slate-50/50">
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
                    active: "bg-green-100 text-green-700 border-green-200",
                    inactive: "bg-slate-100 text-slate-600 border-slate-200",
                    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
                    cancelled: "bg-gray-100 text-gray-700 border-gray-200",
                    expired: "bg-red-100 text-red-700 border-red-200"
                  }

                  return (
                  <div key={plan.subscription_id}>
                    {/* Main Row */}
                    <div
                      className={`console-table-row grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-[#F0FDFA] cursor-pointer transition-colors ${!isActive ? "opacity-50" : ""}`}
                      onClick={() => setExpandedRow(expandedRow === plan.subscription_id ? null : plan.subscription_id)}
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
                              className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200"
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
                        <div className="font-medium text-[#007A78]">
                          {formatCurrency(plan.unit_price_usd)}
                        </div>
                        {plan.pricing_model && (
                          <div className="text-xs text-slate-500">
                            {plan.pricing_model === 'PER_SEAT' ? '/seat' : 'flat fee'}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Badge variant="outline" className="capitalize bg-slate-50">
                          {plan.billing_cycle}
                        </Badge>
                      </div>
                      <div className="col-span-2 text-right text-slate-600">
                        {plan.seats ?? 0}
                      </div>
                      <div className="col-span-2 text-right flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#007A78] hover:bg-[#007A78]/10"
                          onClick={() => handleEditDialogOpenChange(true, plan)}
                          title="Edit plan"
                          aria-label="Edit plan"
                          data-testid={`edit-plan-${plan.subscription_id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-600 hover:bg-amber-50"
                          onClick={() => {
                            setEndDate(new Date())
                            setShowEndDialog({ open: true, plan })
                          }}
                          title="End subscription"
                          aria-label="End subscription"
                          data-testid={`end-plan-${plan.subscription_id}`}
                        >
                          <CalendarX className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Details Row */}
                    {expandedRow === plan.subscription_id && (
                      <div className="bg-slate-50/50 px-4 py-4 border-t border-slate-100">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {plan.start_date && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Start Date</span>
                              <span className="font-medium">{new Date(plan.start_date).toLocaleDateString()}</span>
                            </div>
                          )}
                          {plan.renewal_date && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Renewal Date</span>
                              <span className="font-medium">{new Date(plan.renewal_date).toLocaleDateString()}</span>
                            </div>
                          )}
                          {plan.owner_email && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Owner</span>
                              <span className="font-medium">{plan.owner_email}</span>
                            </div>
                          )}
                          {plan.department && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Department</span>
                              <span className="font-medium">{plan.department}</span>
                            </div>
                          )}
                          {plan.contract_id && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Contract ID</span>
                              <span className="font-medium">{plan.contract_id}</span>
                            </div>
                          )}
                          {plan.currency && plan.currency !== 'USD' && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Currency</span>
                              <span className="font-medium">{plan.currency}</span>
                            </div>
                          )}
                          {plan.auto_renew !== undefined && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Auto Renew</span>
                              <Badge variant={plan.auto_renew ? "default" : "outline"}>
                                {plan.auto_renew ? "Yes" : "No"}
                              </Badge>
                            </div>
                          )}
                          {plan.discount_type && plan.discount_value !== undefined && plan.discount_value > 0 && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Discount</span>
                              <span className="font-medium text-green-600">
                                {plan.discount_type === 'percent' ? `${plan.discount_value}%` : formatCurrency(plan.discount_value)}
                              </span>
                            </div>
                          )}
                          {plan.category && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Category</span>
                              <Badge variant="outline" className="capitalize">{plan.category}</Badge>
                            </div>
                          )}
                          {plan.notes && (
                            <div className="col-span-2 md:col-span-4">
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Notes</span>
                              <span className="text-slate-700">{plan.notes}</span>
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
              <div className="px-4 py-4 border-t border-slate-200 bg-slate-50/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    Don&apos;t see your subscription plan?
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddDialogOpenChange(true)}
                    className="text-[#007A78] border-[#007A78]/30 hover:bg-[#007A78]/5"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Subscription
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Custom Subscription Dialog */}
      <Dialog open={showAddDialog} onOpenChange={handleAddDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom {providerDisplayName} Subscription</DialogTitle>
            <DialogDescription>
              Add a custom subscription plan for {providerDisplayName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plan_name">Plan Name *</Label>
              <Input
                id="plan_name"
                placeholder="e.g., Enterprise"
                maxLength={50}
                value={newPlan.plan_name}
                onChange={(e) => setNewPlan({ ...newPlan, plan_name: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                This will be converted to uppercase (e.g., ENTERPRISE). Max 50 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name (optional)</Label>
              <Input
                id="display_name"
                placeholder="e.g., Enterprise Plan"
                maxLength={100}
                value={newPlan.display_name}
                onChange={(e) => setNewPlan({ ...newPlan, display_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost">Unit Price ($) *</Label>
                <Input
                  id="cost"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={newPlan.unit_price_usd === 0 ? "" : newPlan.unit_price_usd}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value)
                    setNewPlan({ ...newPlan, unit_price_usd: e.target.value === "" ? 0 : (isNaN(parsed) ? 0 : Math.max(0, parsed)) })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing">Billing Cycle</Label>
                <Select
                  value={newPlan.billing_cycle}
                  onValueChange={(value) => setNewPlan({ ...newPlan, billing_cycle: value })}
                >
                  <SelectTrigger id="billing">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pricing_model">Pricing Model</Label>
                <Select
                  value={newPlan.pricing_model}
                  onValueChange={(value) => setNewPlan({ ...newPlan, pricing_model: value as 'PER_SEAT' | 'FLAT_FEE' })}
                >
                  <SelectTrigger id="pricing_model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT_FEE">Flat Fee</SelectItem>
                    <SelectItem value="PER_SEAT">Per Seat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={newPlan.currency}
                  onValueChange={(value) => setNewPlan({ ...newPlan, currency: value })}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seats">Seats</Label>
              <Input
                id="seats"
                type="number"
                min={0}
                max={10000}
                step="1"
                placeholder="0"
                value={newPlan.seats === 0 ? "" : newPlan.seats}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10)
                  const bounded = Math.min(10000, Math.max(0, isNaN(parsed) ? 0 : parsed))
                  setNewPlan({ ...newPlan, seats: e.target.value === "" ? 0 : bounded })
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <DatePicker
                date={addStartDate}
                onSelect={setAddStartDate}
                placeholder="Select start date"
              />
              <p className="text-xs text-slate-500">
                When does this subscription start? Future dates will show as &quot;Pending&quot;.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g., Team subscription for design team"
                maxLength={500}
                value={newPlan.notes}
                onChange={(e) => setNewPlan({ ...newPlan, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleAddDialogOpenChange(false)} disabled={adding}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={adding || !newPlan.plan_name.trim() || !addStartDate}
              className="console-button-primary"
            >
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Add Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subscription Dialog */}
      <Dialog
        open={showEditDialog.open}
        onOpenChange={(open) => handleEditDialogOpenChange(open, open ? showEditDialog.plan ?? undefined : undefined)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {providerDisplayName} Subscription</DialogTitle>
            <DialogDescription>
              Changes will create a new version. Current plan ends day before effective date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Current Plan Details (Read-only) */}
            {showEditDialog.plan && (
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Current Plan Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-slate-500">Plan:</span>
                    <span className="ml-2 font-medium">{showEditDialog.plan.display_name || showEditDialog.plan.plan_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Status:</span>
                    <Badge variant="outline" className="ml-2 capitalize text-xs">{showEditDialog.plan.status}</Badge>
                  </div>
                  {showEditDialog.plan.start_date && (
                    <div>
                      <span className="text-slate-500">Started:</span>
                      <span className="ml-2">{format(new Date(showEditDialog.plan.start_date), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Price:</span>
                    <span className="ml-2 font-medium text-[#007A78]">{formatCurrency(showEditDialog.plan.unit_price_usd)}/{showEditDialog.plan.billing_cycle}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Seats:</span>
                    <span className="ml-2">{showEditDialog.plan.seats ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Monthly Cost:</span>
                    <span className="ml-2 font-medium">{(() => {
                      const plan = showEditDialog.plan
                      let monthlyCost = plan.unit_price_usd * (plan.seats ?? 1)
                      if (plan.pricing_model === 'FLAT_FEE') monthlyCost = plan.unit_price_usd
                      if (plan.billing_cycle === 'annual') monthlyCost = monthlyCost / 12
                      if (plan.billing_cycle === 'quarterly') monthlyCost = monthlyCost / 3
                      return formatCurrency(monthlyCost)
                    })()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Effective Date */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Changes (creates new version)</p>
              <Label>Effective Date *</Label>
              <DatePicker
                date={editEffectiveDate}
                onSelect={setEditEffectiveDate}
                placeholder="Select effective date"
                minDate={new Date()}
              />
              <p className="text-xs text-slate-500">
                Current plan ends {editEffectiveDate ? format(new Date(editEffectiveDate.getTime() - 86400000), 'MMM d, yyyy') : 'day before effective date'}. New plan starts on effective date.
              </p>
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_cost">New Price ($)</Label>
                <Input
                  id="edit_cost"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={editPlanData.unit_price_usd === 0 ? "" : editPlanData.unit_price_usd}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value)
                    setEditPlanData({ ...editPlanData, unit_price_usd: e.target.value === "" ? 0 : (isNaN(parsed) ? 0 : Math.max(0, parsed)) })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_seats">New Seats</Label>
                <Input
                  id="edit_seats"
                  type="number"
                  min={0}
                  max={10000}
                  step="1"
                  placeholder="0"
                  value={editPlanData.seats === 0 ? "" : editPlanData.seats}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10)
                    const bounded = Math.min(10000, Math.max(0, isNaN(parsed) ? 0 : parsed))
                    setEditPlanData({ ...editPlanData, seats: e.target.value === "" ? 0 : bounded })
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_billing">Billing Cycle</Label>
                <Select
                  value={editPlanData.billing_cycle}
                  onValueChange={(value) => setEditPlanData({ ...editPlanData, billing_cycle: value })}
                >
                  <SelectTrigger id="edit_billing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_pricing_model">Pricing Model</Label>
                <Select
                  value={editPlanData.pricing_model}
                  onValueChange={(value) => setEditPlanData({ ...editPlanData, pricing_model: value as 'PER_SEAT' | 'FLAT_FEE' })}
                >
                  <SelectTrigger id="edit_pricing_model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT_FEE">Flat Fee</SelectItem>
                    <SelectItem value="PER_SEAT">Per Seat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_notes">Notes (optional)</Label>
              <Input
                id="edit_notes"
                placeholder="e.g., Team subscription for design team"
                maxLength={500}
                value={editPlanData.notes}
                onChange={(e) => setEditPlanData({ ...editPlanData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleEditDialogOpenChange(false)} disabled={editing}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEdit}
              disabled={editing || !editEffectiveDate}
              className="console-button-primary"
            >
              {editing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Update Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End Subscription Dialog */}
      <Dialog
        open={showEndDialog.open}
        onOpenChange={(open) => setShowEndDialog({ open, plan: open ? showEndDialog.plan : null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Subscription</DialogTitle>
            <DialogDescription>
              Set an end date for this subscription. Costs will stop being calculated after this date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Subscription Details (Read-only) */}
            {showEndDialog.plan && (
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Subscription Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-slate-500">Plan:</span>
                    <span className="ml-2 font-medium">{showEndDialog.plan.display_name || showEndDialog.plan.plan_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Status:</span>
                    <Badge variant="outline" className="ml-2 capitalize text-xs">{showEndDialog.plan.status}</Badge>
                  </div>
                  {showEndDialog.plan.start_date && (
                    <div>
                      <span className="text-slate-500">Started:</span>
                      <span className="ml-2">{format(new Date(showEndDialog.plan.start_date), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Monthly Cost:</span>
                    <span className="ml-2 font-medium">{(() => {
                      const plan = showEndDialog.plan
                      let monthlyCost = plan.unit_price_usd * (plan.seats ?? 1)
                      if (plan.pricing_model === 'FLAT_FEE') monthlyCost = plan.unit_price_usd
                      if (plan.billing_cycle === 'annual') monthlyCost = monthlyCost / 12
                      if (plan.billing_cycle === 'quarterly') monthlyCost = monthlyCost / 3
                      return formatCurrency(monthlyCost)
                    })()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Seats:</span>
                    <span className="ml-2">{showEndDialog.plan.seats ?? 0}</span>
                  </div>
                  {showEndDialog.plan.owner_email && (
                    <div>
                      <span className="text-slate-500">Owner:</span>
                      <span className="ml-2">{showEndDialog.plan.owner_email}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* End Date Selection */}
            <div className="space-y-2 pt-2 border-t">
              <Label>When should this subscription end? *</Label>
              <DatePicker
                date={endDate}
                onSelect={setEndDate}
                placeholder="Select end date"
              />
              <p className="text-xs text-slate-500">
                Costs will stop being calculated after this date.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowEndDialog({ open: false, plan: null })} disabled={ending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleEndSubscription}
              disabled={ending || !endDate}
            >
              {ending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CalendarX className="h-4 w-4 mr-2" />
              )}
              End Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add from Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a Plan Template</DialogTitle>
            <DialogDescription>
              Select a predefined plan for {providerDisplayName}. You can customize seats and dates in the next step.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
              </div>
            ) : availablePlans.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">No templates available for this provider.</p>
                <Button onClick={() => { setShowTemplateDialog(false); handleAddDialogOpenChange(true) }} className="mt-4 console-button-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Custom Plan
                </Button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {availablePlans.map((plan, index) => (
                  <button
                    key={`${plan.plan_name}-${index}`}
                    onClick={() => handleSelectTemplate(plan)}
                    className="w-full text-left p-4 rounded-lg border border-slate-200 hover:border-[#007A78] hover:bg-[#F0FDFA] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900">{plan.display_name || plan.plan_name}</h4>
                        <Badge variant="outline" className="capitalize text-xs">{plan.billing_cycle}</Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-[#007A78]">{formatCurrency(plan.unit_price_usd)}</div>
                        <div className="text-xs text-slate-500">
                          {plan.pricing_model === 'PER_SEAT' ? '/seat' : 'flat fee'}
                        </div>
                      </div>
                    </div>
                    {plan.notes && (
                      <p className="text-sm text-slate-600">{plan.notes}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
