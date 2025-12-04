"use client"

/**
 * Provider Detail Page
 *
 * Shows all plans for a specific subscription provider.
 * Plans are fetched from BigQuery via API service.
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  Check,
  Trash2,
  Pencil,
  RefreshCw,
  CreditCard,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Textarea } from "@/components/ui/textarea"

import {
  getProviderPlans,
  createCustomPlan,
  updatePlan,
  togglePlan,
  deletePlan,
  resetProvider,
  getProviderMeta,
  type SubscriptionPlan,
  type PlanCreate,
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

// Category colors
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  ai: { bg: "bg-purple-100", text: "text-purple-700" },
  design: { bg: "bg-pink-100", text: "text-pink-700" },
  productivity: { bg: "bg-blue-100", text: "text-blue-700" },
  communication: { bg: "bg-green-100", text: "text-green-700" },
  development: { bg: "bg-orange-100", text: "text-orange-700" },
  other: { bg: "bg-gray-100", text: "text-gray-700" },
}

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

function getCategoryStyle(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

export default function ProviderDetailPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const router = useRouter()
  const { orgSlug, provider } = params

  // State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Operation states
  const [togglingPlan, setTogglingPlan] = useState<string | null>(null)
  const [deletingPlan, setDeletingPlan] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState<{ open: boolean; plan: SubscriptionPlan | null }>({
    open: false,
    plan: null,
  })
  const [creating, setCreating] = useState(false)

  // Create form state
  const [newPlan, setNewPlan] = useState<PlanCreate>({
    plan_name: "",
    display_name: "",
    unit_price_usd: 0,
    quantity: 1,
    billing_period: "monthly",
    notes: "",
    seats: 1,
  })

  // Load plans
  const loadPlans = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getProviderPlans(orgSlug, provider)
      if (result.success) {
        setPlans(result.plans)
        setTotalMonthlyCost(result.total_monthly_cost)
      } else {
        setError(result.error || "Failed to load plans")
      }
    } catch (err) {
      setError("Failed to load plans")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlans()
  }, [orgSlug, provider])

  // Toggle plan
  const handleTogglePlan = async (plan: SubscriptionPlan) => {
    setTogglingPlan(plan.subscription_id)
    try {
      const result = await togglePlan(orgSlug, provider, plan.subscription_id, !plan.is_enabled)
      if (result.success) {
        await loadPlans()
      } else {
        setError(result.error || "Failed to toggle plan")
      }
    } finally {
      setTogglingPlan(null)
    }
  }

  // Delete plan
  const handleDeletePlan = async () => {
    if (!showDeleteDialog.plan) return

    setDeletingPlan(showDeleteDialog.plan.subscription_id)
    try {
      const result = await deletePlan(orgSlug, provider, showDeleteDialog.plan.subscription_id)
      if (result.success) {
        setShowDeleteDialog({ open: false, plan: null })
        await loadPlans()
      } else {
        setError(result.error || "Failed to delete plan")
      }
    } finally {
      setDeletingPlan(null)
    }
  }

  // Create plan
  const handleCreatePlan = async () => {
    if (!newPlan.plan_name || !newPlan.unit_price_usd) {
      setError("Plan name and price are required")
      return
    }

    setCreating(true)
    try {
      const result = await createCustomPlan(orgSlug, provider, newPlan)
      if (result.success) {
        setShowCreateDialog(false)
        setNewPlan({
          plan_name: "",
          display_name: "",
          unit_price_usd: 0,
          quantity: 1,
          billing_period: "monthly",
          notes: "",
          seats: 1,
        })
        await loadPlans()
      } else {
        setError(result.error || "Failed to create plan")
      }
    } finally {
      setCreating(false)
    }
  }

  // Reset to defaults
  const handleReset = async () => {
    if (!confirm("This will delete all existing plans and re-seed defaults. Continue?")) {
      return
    }

    setResetting(true)
    try {
      const result = await resetProvider(orgSlug, provider)
      if (result.success) {
        await loadPlans()
      } else {
        setError(result.error || "Failed to reset")
      }
    } finally {
      setResetting(false)
    }
  }

  const providerDisplayName = getProviderDisplayName(provider)
  const enabledPlans = plans.filter(p => p.is_enabled)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/settings/integrations`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
            <CreditCard className="h-6 w-6 text-[#007A78]" />
          </div>
          <h1 className="console-page-title">{providerDisplayName} Plans</h1>
        </div>
        <p className="console-subheading ml-12">
          Manage subscription plans for {providerDisplayName}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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
            <div className="text-2xl font-bold">{enabledPlans.length}</div>
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

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button onClick={() => setShowCreateDialog(true)} className="console-button-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add Plan
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            disabled={resetting}
          >
            {resetting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Reset to Defaults
          </Button>
        </div>
        <Button onClick={loadPlans} variant="ghost" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
        </div>
      ) : plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Plans Yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first {providerDisplayName} plan to start tracking costs.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const categoryStyle = getCategoryStyle(plan.category)
            const isToggling = togglingPlan === plan.subscription_id

            return (
              <Card
                key={plan.subscription_id}
                className={`console-stat-card ${!plan.is_enabled ? "opacity-60" : ""}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{plan.plan_name}</CardTitle>
                      <CardDescription>
                        {plan.display_name || plan.notes || "No description"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {plan.is_custom && (
                        <Badge variant="outline" className="text-xs">Custom</Badge>
                      )}
                      <Badge className={`${categoryStyle.bg} ${categoryStyle.text}`}>
                        {plan.category}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Price */}
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-[#007A78]">
                        {formatCurrency(plan.unit_price_usd)}
                      </span>
                      <span className="text-muted-foreground">/{plan.billing_period}</span>
                    </div>

                    {/* Details */}
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Quantity</span>
                        <span>{plan.quantity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Seats</span>
                        <span>{plan.seats}</span>
                      </div>
                      {plan.daily_limit && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Daily Limit</span>
                          <span>{plan.daily_limit}</span>
                        </div>
                      )}
                      {plan.monthly_limit && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monthly Limit</span>
                          <span>{plan.monthly_limit}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.is_enabled}
                          onCheckedChange={() => handleTogglePlan(plan)}
                          disabled={isToggling}
                        />
                        <span className="text-sm text-muted-foreground">
                          {plan.is_enabled ? "Enabled" : "Disabled"}
                        </span>
                        {isToggling && <Loader2 className="h-3 w-3 animate-spin" />}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => setShowDeleteDialog({ open: true, plan })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Plan Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Plan</DialogTitle>
            <DialogDescription>
              Create a custom plan for {providerDisplayName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plan_name">Plan Name *</Label>
              <Input
                id="plan_name"
                placeholder="e.g., ENTERPRISE"
                value={newPlan.plan_name}
                onChange={(e) => setNewPlan({ ...newPlan, plan_name: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                placeholder="e.g., Enterprise Plan"
                value={newPlan.display_name}
                onChange={(e) => setNewPlan({ ...newPlan, display_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_price">Price (USD) *</Label>
                <Input
                  id="unit_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPlan.unit_price_usd}
                  onChange={(e) => setNewPlan({ ...newPlan, unit_price_usd: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_period">Billing Period</Label>
                <Select
                  value={newPlan.billing_period}
                  onValueChange={(value) => setNewPlan({ ...newPlan, billing_period: value })}
                >
                  <SelectTrigger id="billing_period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  value={newPlan.quantity}
                  onChange={(e) => setNewPlan({ ...newPlan, quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seats">Seats</Label>
                <Input
                  id="seats"
                  type="number"
                  min="1"
                  value={newPlan.seats}
                  onChange={(e) => setNewPlan({ ...newPlan, seats: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes / Description</Label>
              <Textarea
                id="notes"
                placeholder="Plan description or limits info"
                value={newPlan.notes}
                onChange={(e) => setNewPlan({ ...newPlan, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePlan} disabled={creating} className="console-button-primary">
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Plan
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
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the {showDeleteDialog.plan?.plan_name} plan?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog({ open: false, plan: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePlan}
              disabled={deletingPlan === showDeleteDialog.plan?.subscription_id}
            >
              {deletingPlan === showDeleteDialog.plan?.subscription_id ? (
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
