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
import {
  ArrowLeft,
  Plus,
  Loader2,
  CreditCard,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Pencil,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
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

import {
  getProviderPlans,
  createCustomPlan,
  updatePlan,
  togglePlan,
  deletePlan,
  SubscriptionPlan,
  PlanCreate,
  PlanUpdate,
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

export default function ProviderDetailPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const { orgSlug, provider } = params

  // Validate params
  const isValidParams = orgSlug && provider && typeof orgSlug === "string" && typeof provider === "string"

  // State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState<{ open: boolean; plan: SubscriptionPlan | null }>({
    open: false,
    plan: null,
  })
  const [showDeleteDialog, setShowDeleteDialog] = useState<{ open: boolean; plan: SubscriptionPlan | null }>({
    open: false,
    plan: null,
  })
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)

  // Add form state
  const [newPlan, setNewPlan] = useState<PlanCreate>({
    plan_name: "",
    display_name: "",
    unit_price_usd: 0,
    seats: 0,
    billing_period: "monthly",
    notes: "",
  })

  // Edit form state
  const [editPlanData, setEditPlanData] = useState<PlanUpdate>({
    display_name: "",
    quantity: 0,
    unit_price_usd: 0,
    seats: 0,
    billing_period: "monthly",
    notes: "",
  })

  // Reset form to initial state
  const resetNewPlanForm = () => {
    setNewPlan({
      plan_name: "",
      display_name: "",
      unit_price_usd: 0,
      seats: 0,
      billing_period: "monthly",
      notes: "",
    })
  }

  // Handle add dialog open/close
  const handleAddDialogOpenChange = (open: boolean) => {
    setShowAddDialog(open)
    if (open) {
      setError(null) // Clear error when opening
    } else {
      // Reset form when closing
      resetNewPlanForm()
    }
  }

  // Load plans from API service (BigQuery)
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

    const result = await getProviderPlans(orgSlug, provider)

    // Check if component is still mounted before updating state
    if (isMounted && !isMounted()) return

    if (result.success) {
      setPlans(result.plans || [])
      setTotalMonthlyCost(result.total_monthly_cost || 0)
    } else {
      setPlans([])
      setTotalMonthlyCost(0)

      if (result.error?.includes("API key not found")) {
        setError("Backend not configured. Please complete organization onboarding in Settings to enable subscription tracking.")
      } else {
        setError(result.error || "Failed to load plans")
      }
    }

    setLoading(false)
  }, [orgSlug, provider, isValidParams])

  useEffect(() => {
    let mounted = true
    loadPlans(() => mounted)
    return () => { mounted = false }
  }, [loadPlans])

  // Toggle plan enabled/disabled
  const handleToggle = async (plan: SubscriptionPlan) => {
    setToggling(plan.subscription_id)
    const result = await togglePlan(orgSlug, provider, plan.subscription_id, !plan.is_enabled)
    if (result.success) {
      setError(null) // Clear error on success
    } else {
      setError(result.error || "Failed to toggle plan")
    }
    await loadPlans()
    setToggling(null) // Clear toggling state after reload completes
  }

  // Delete plan (only custom plans can be deleted)
  const handleDelete = async () => {
    if (!showDeleteDialog.plan) return
    setDeleting(showDeleteDialog.plan.subscription_id)
    const result = await deletePlan(orgSlug, provider, showDeleteDialog.plan.subscription_id)
    setShowDeleteDialog({ open: false, plan: null })
    if (result.success) {
      setError(null) // Clear error on success
    } else {
      setError(result.error || "Failed to delete plan")
    }
    await loadPlans()
    setDeleting(null) // Clear deleting state after reload completes
  }

  // Handle edit dialog open/close
  const handleEditDialogOpenChange = (open: boolean, plan?: SubscriptionPlan) => {
    if (open && plan) {
      // Pre-fill form with existing plan data
      setEditPlanData({
        display_name: plan.display_name || plan.plan_name,
        quantity: plan.quantity || 1,
        unit_price_usd: plan.unit_price_usd,
        seats: plan.seats || 1,
        billing_period: plan.billing_period,
        notes: plan.notes || "",
      })
      setShowEditDialog({ open: true, plan })
    } else {
      setShowEditDialog({ open: false, plan: null })
    }
    if (open) {
      setError(null) // Clear error when opening
    }
  }

  // Edit plan via API service
  const handleEdit = async () => {
    if (!showEditDialog.plan) return

    // Validate inputs
    if (editPlanData.unit_price_usd !== undefined && editPlanData.unit_price_usd < 0) {
      setError("Price cannot be negative")
      return
    }
    if (editPlanData.quantity !== undefined && editPlanData.quantity < 0) {
      setError("Quantity cannot be negative")
      return
    }
    if (editPlanData.seats !== undefined && editPlanData.seats < 0) {
      setError("Seats cannot be negative")
      return
    }

    setEditing(true)
    setError(null)

    try {
      const result = await updatePlan(
        orgSlug,
        provider,
        showEditDialog.plan.subscription_id,
        editPlanData
      )

      if (!result.success) {
        setError(result.error || "Failed to update plan")
        return
      }

      setShowEditDialog({ open: false, plan: null })
      await loadPlans()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
    } finally {
      setEditing(false)
    }
  }

  // Add custom plan via API service
  const handleAdd = async () => {
    if (!newPlan.plan_name.trim()) return

    // Validate inputs
    if (newPlan.unit_price_usd < 0) {
      setError("Price cannot be negative")
      return
    }
    if ((newPlan.seats ?? 0) < 0) {
      setError("Seats cannot be negative")
      return
    }

    setAdding(true)
    setError(null)

    try {
      const result = await createCustomPlan(orgSlug, provider, {
        plan_name: newPlan.plan_name.toUpperCase().replace(/\s+/g, "_"),
        display_name: newPlan.display_name || newPlan.plan_name,
        unit_price_usd: newPlan.unit_price_usd,
        seats: newPlan.seats,
        billing_period: newPlan.billing_period,
        notes: newPlan.notes,
      })

      if (!result.success) {
        setError(result.error || "Failed to create plan")
        return
      }

      setShowAddDialog(false)
      resetNewPlanForm()
      await loadPlans()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
    } finally {
      setAdding(false)
    }
  }

  const providerDisplayName = getProviderDisplayName(provider)
  const enabledPlans = plans.filter(p => p.is_enabled)
  const activePlansCount = enabledPlans.length

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/subscriptions`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
            <CreditCard className="h-6 w-6 text-[#007A78]" />
          </div>
          <div>
            <h1 className="console-page-title">{providerDisplayName}</h1>
            <p className="console-subheading">
              Manage subscription plans for {providerDisplayName}
            </p>
          </div>
        </div>
        {plans.length > 0 && (
          <Button onClick={() => handleAddDialogOpenChange(true)} className="console-button-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Subscription
          </Button>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[#007A78]">
              {formatCurrency(totalMonthlyCost)}
            </div>
            <p className="text-sm text-muted-foreground">Monthly Cost</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{activePlansCount}</div>
            <p className="text-sm text-muted-foreground">Active Plans</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{plans.length}</div>
            <p className="text-sm text-muted-foreground">Total Plans</p>
          </CardContent>
        </Card>
      </div>

      {/* Plans Table */}
      <Card className="console-table-card">
        <CardHeader>
          <CardTitle className="console-card-title">{providerDisplayName} Plans</CardTitle>
          <CardDescription>
            Toggle plans on/off to include them in cost tracking. Click a row to see more details.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {plans.length === 0 ? (
            <div className="text-center py-12 px-6">
              <CreditCard className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No plans yet</h3>
              <p className="text-slate-500 mb-4">
                Enable this provider in Settings → Integrations → Subscription Providers to seed default plans,
                or add a custom subscription below.
              </p>
              <Button onClick={() => handleAddDialogOpenChange(true)} className="console-button-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Subscription
              </Button>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="console-table-header-row grid grid-cols-12 gap-4 px-4 py-3 border-b bg-slate-50/50">
                <div className="col-span-1 console-table-header">Active</div>
                <div className="col-span-3 console-table-header">Plan Name</div>
                <div className="col-span-2 console-table-header text-right">Cost</div>
                <div className="col-span-2 console-table-header">Billing</div>
                <div className="col-span-2 console-table-header text-right">Seats</div>
                <div className="col-span-2 console-table-header text-right">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {plans.map((plan) => (
                  <div key={plan.subscription_id}>
                    {/* Main Row */}
                    <div
                      className="console-table-row grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-[#F0FDFA] cursor-pointer transition-colors"
                      onClick={() => setExpandedRow(expandedRow === plan.subscription_id ? null : plan.subscription_id)}
                    >
                      <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={plan.is_enabled}
                          onCheckedChange={() => handleToggle(plan)}
                          disabled={toggling === plan.subscription_id}
                          className="data-[state=checked]:bg-[#007A78]"
                        />
                      </div>
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {plan.display_name || plan.plan_name}
                          </span>
                          {plan.is_custom && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              Custom
                            </Badge>
                          )}
                          {expandedRow === plan.subscription_id ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 text-right font-medium text-[#007A78]">
                        {formatCurrency(plan.unit_price_usd)}
                      </div>
                      <div className="col-span-2">
                        <Badge variant="outline" className="capitalize bg-slate-50">
                          {plan.billing_period}
                        </Badge>
                      </div>
                      <div className="col-span-2 text-right text-slate-600">
                        {plan.seats || 1}
                      </div>
                      <div className="col-span-2 text-right flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#007A78] hover:bg-[#007A78]/10"
                          onClick={() => handleEditDialogOpenChange(true, plan)}
                          title="Edit plan"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {plan.is_custom && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => setShowDeleteDialog({ open: true, plan })}
                            title="Delete plan"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Details Row */}
                    {expandedRow === plan.subscription_id && (
                      <div className="bg-slate-50/50 px-4 py-4 border-t border-slate-100">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {plan.yearly_price_usd !== undefined && plan.yearly_price_usd > 0 && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Yearly Price</span>
                              <span className="font-medium">{formatCurrency(plan.yearly_price_usd)}</span>
                              {plan.yearly_discount_pct && plan.yearly_discount_pct > 0 && (
                                <span className="text-green-600 text-xs ml-1">({plan.yearly_discount_pct}% off)</span>
                              )}
                            </div>
                          )}
                          {plan.storage_limit_gb !== undefined && plan.storage_limit_gb > 0 && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Storage</span>
                              <span className="font-medium">{plan.storage_limit_gb} GB</span>
                            </div>
                          )}
                          {plan.monthly_limit !== undefined && plan.monthly_limit !== null && (
                            <div>
                              <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Monthly Limit</span>
                              <span className="font-medium">
                                {typeof plan.monthly_limit === "string" ? plan.monthly_limit : plan.monthly_limit.toLocaleString()}
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
                ))}
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
                value={newPlan.plan_name}
                onChange={(e) => setNewPlan({ ...newPlan, plan_name: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                This will be converted to uppercase (e.g., ENTERPRISE)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name (optional)</Label>
              <Input
                id="display_name"
                placeholder="e.g., Enterprise Plan"
                value={newPlan.display_name}
                onChange={(e) => setNewPlan({ ...newPlan, display_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost">Monthly Cost ($) *</Label>
                <Input
                  id="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newPlan.unit_price_usd === 0 ? "" : newPlan.unit_price_usd}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value)
                    setNewPlan({ ...newPlan, unit_price_usd: e.target.value === "" ? 0 : (isNaN(parsed) ? 0 : parsed) })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing">Billing Period</Label>
                <Select
                  value={newPlan.billing_period}
                  onValueChange={(value) => setNewPlan({ ...newPlan, billing_period: value })}
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
            <div className="space-y-2">
              <Label htmlFor="seats">Seats</Label>
              <Input
                id="seats"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={newPlan.seats === 0 ? "" : newPlan.seats}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10)
                  setNewPlan({ ...newPlan, seats: e.target.value === "" ? 0 : (isNaN(parsed) || parsed < 0 ? 0 : parsed) })
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g., Team subscription for design team"
                value={newPlan.notes}
                onChange={(e) => setNewPlan({ ...newPlan, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleAddDialogOpenChange(false)} disabled={adding}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding || !newPlan.plan_name.trim()}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {providerDisplayName} Subscription</DialogTitle>
            <DialogDescription>
              Update subscription details for &quot;{showEditDialog.plan?.display_name || showEditDialog.plan?.plan_name || ""}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_display_name">Display Name (optional)</Label>
              <Input
                id="edit_display_name"
                placeholder="e.g., Enterprise Plan"
                value={editPlanData.display_name}
                onChange={(e) => setEditPlanData({ ...editPlanData, display_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_cost">Monthly Cost ($) *</Label>
                <Input
                  id="edit_cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={editPlanData.unit_price_usd === 0 ? "" : editPlanData.unit_price_usd}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value)
                    setEditPlanData({ ...editPlanData, unit_price_usd: e.target.value === "" ? 0 : (isNaN(parsed) ? 0 : parsed) })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_billing">Billing Period</Label>
                <Select
                  value={editPlanData.billing_period}
                  onValueChange={(value) => setEditPlanData({ ...editPlanData, billing_period: value })}
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_quantity">Quantity</Label>
                <Input
                  id="edit_quantity"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={editPlanData.quantity === 0 ? "" : editPlanData.quantity}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10)
                    setEditPlanData({ ...editPlanData, quantity: e.target.value === "" ? 0 : (isNaN(parsed) || parsed < 0 ? 0 : parsed) })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_seats">Seats</Label>
                <Input
                  id="edit_seats"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={editPlanData.seats === 0 ? "" : editPlanData.seats}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10)
                    setEditPlanData({ ...editPlanData, seats: e.target.value === "" ? 0 : (isNaN(parsed) || parsed < 0 ? 0 : parsed) })
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_notes">Notes (optional)</Label>
              <Input
                id="edit_notes"
                placeholder="e.g., Team subscription for design team"
                value={editPlanData.notes}
                onChange={(e) => setEditPlanData({ ...editPlanData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleEditDialogOpenChange(false)} disabled={editing}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={editing}
              className="console-button-primary"
            >
              {editing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Update Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog.open}
        onOpenChange={(open) => setShowDeleteDialog({ open, plan: open ? showDeleteDialog.plan : null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{showDeleteDialog.plan?.display_name || showDeleteDialog.plan?.plan_name || "this plan"}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog({ open: false, plan: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting !== null}
            >
              {deleting === showDeleteDialog.plan?.subscription_id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
