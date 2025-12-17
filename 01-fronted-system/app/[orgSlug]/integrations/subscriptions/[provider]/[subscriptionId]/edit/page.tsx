"use client"

/**
 * Edit Subscription Page
 *
 * Full-page form (not a modal) for editing a subscription with version history.
 * Creates a new version when changes are saved (old row gets end_date, new row starts from effective_date).
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  Loader2,
  Check,
  ChevronRight,
  Info,
  Calendar,
} from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { DatePicker } from "@/components/ui/date-picker"

import {
  getProviderPlans,
  editPlanWithVersion,
  SubscriptionPlan,
  PlanUpdate,
} from "@/actions/subscription-providers"
import { getOrgLocale } from "@/actions/organization-locale"
import { formatCurrency, formatDateOnly } from "@/lib/i18n"

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

export default function EditSubscriptionPage() {
  const params = useParams<{ orgSlug: string; provider: string; subscriptionId: string }>()
  const router = useRouter()
  const { orgSlug, provider, subscriptionId } = params

  // Validate params
  const isValidParams = orgSlug && provider && subscriptionId &&
    typeof orgSlug === "string" && typeof provider === "string" && typeof subscriptionId === "string"

  // State
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [effectiveDate, setEffectiveDate] = useState<Date | undefined>(new Date())
  const [orgCurrency, setOrgCurrency] = useState("USD")

  // Edit form state
  const [editData, setEditData] = useState<PlanUpdate>({
    display_name: "",
    unit_price: 0,
    seats: 0,
    billing_cycle: "monthly",
    pricing_model: "FLAT_FEE",
    notes: "",
  })

  // Load current plan and org locale
  useEffect(() => {
    if (!isValidParams) {
      setError("Invalid page parameters")
      setLoading(false)
      return
    }

    let mounted = true

    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Fetch org locale and plans in parallel
        const [localeResult, plansResult] = await Promise.all([
          getOrgLocale(orgSlug),
          getProviderPlans(orgSlug, provider)
        ])

        if (!mounted) return

        // Set org currency
        if (localeResult.success && localeResult.locale) {
          setOrgCurrency(localeResult.locale.default_currency)
        }

        // Find current plan by subscription ID
        if (plansResult.success) {
          const plan = plansResult.plans.find(p => p.subscription_id === subscriptionId)
          if (plan) {
            setCurrentPlan(plan)
            // Pre-fill form with current plan data
            setEditData({
              display_name: plan.display_name || plan.plan_name,
              unit_price: plan.unit_price,
              seats: plan.seats ?? 0,
              billing_cycle: plan.billing_cycle,
              pricing_model: plan.pricing_model || "FLAT_FEE",
              notes: plan.notes || "",
            })
          } else {
            setError(`Subscription not found: ${subscriptionId}`)
          }
        } else {
          setError(plansResult.error || "Failed to load subscription")
        }
      } catch (err) {
        console.error("Error loading data:", err)
        if (mounted) {
          setError("Failed to load subscription. Please try again.")
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadData()

    return () => { mounted = false }
  }, [orgSlug, provider, subscriptionId, isValidParams])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPlan) {
      setError("No plan data available")
      return
    }

    if (!effectiveDate) {
      setError("Start date is required")
      return
    }

    // Validate inputs
    if (editData.unit_price !== undefined && editData.unit_price < 0) {
      setError("Price cannot be negative")
      return
    }
    if (editData.seats !== undefined && editData.seats < 0) {
      setError("Seats cannot be negative")
      return
    }
    // Validate seats for PER_SEAT plans
    if (editData.pricing_model === 'PER_SEAT' && (editData.seats ?? 0) < 1) {
      setError("Per-seat plans require at least 1 seat")
      return
    }
    // Validate upper bound for seats
    if (editData.seats !== undefined && editData.seats > 10000) {
      setError("Seats cannot exceed 10,000")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const effectiveDateStr = format(effectiveDate, "yyyy-MM-dd")
      const result = await editPlanWithVersion(
        orgSlug,
        provider,
        subscriptionId,
        effectiveDateStr,
        editData
      )

      if (!result.success) {
        setError(result.error || "Failed to update subscription")
        toast.error(result.error || "Failed to update subscription")
        setSaving(false)
        return
      }

      // Verify API returned the new version
      if (!result.newPlan) {
        toast.warning(
          "Update may not have been saved correctly. Please verify on the provider page.",
          { duration: 8000 }
        )
      } else {
        toast.success("Subscription updated successfully")
      }

      // Redirect to success page
      const planName = editData.display_name || currentPlan.plan_name
      router.push(`/${orgSlug}/integrations/subscriptions/${provider}/success?action=updated&plan=${encodeURIComponent(planName)}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const providerDisplayName = getProviderDisplayName(provider)

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>

        {/* Form Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!currentPlan) {
    return (
      <div className="p-6 space-y-6">
        <Card className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <CardContent className="pt-6">
            <p className="text-sm text-[#FF6E50]">{error || "Subscription not found"}</p>
            <div className="mt-4">
              <Link href={`/${orgSlug}/integrations/subscriptions/${provider}`}>
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to {providerDisplayName}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link
          href={`/${orgSlug}/integrations/subscriptions`}
          className="text-[#007A78] hover:text-[#005F5D] transition-colors focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded truncate max-w-[200px]"
          title="Subscription Providers"
        >
          Subscription Providers
        </Link>
        <ChevronRight className="h-4 w-4 text-[#8E8E93] flex-shrink-0" aria-hidden="true" />
        <Link
          href={`/${orgSlug}/integrations/subscriptions/${provider}`}
          className="text-[#007A78] hover:text-[#005F5D] transition-colors focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded truncate max-w-[200px]"
          title={providerDisplayName}
        >
          {providerDisplayName}
        </Link>
        <ChevronRight className="h-4 w-4 text-[#8E8E93] flex-shrink-0" aria-hidden="true" />
        <span className="text-gray-900 font-medium truncate max-w-[300px]" title={currentPlan.display_name || currentPlan.plan_name}>
          {currentPlan.display_name || currentPlan.plan_name}
        </span>
        <ChevronRight className="h-4 w-4 text-[#8E8E93] flex-shrink-0" aria-hidden="true" />
        <span className="text-gray-900 font-medium">Edit</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/integrations/subscriptions/${provider}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="console-page-title">Edit Subscription</h1>
          <p className="console-subheading">
            Update {currentPlan.display_name || currentPlan.plan_name} subscription details
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <CardContent className="pt-6">
            <p className="text-sm text-[#FF6E50]">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Info Banner - Version History */}
      <Card className="border-[#007A78]/20 bg-[#007A78]/5">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-[#007A78] flex-shrink-0" />
            <p className="text-sm text-[#005F5D]">
              Changes will create a new version. Current plan ends the day before the start date, and the new version starts on the selected date.
            </p>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        {/* Current Plan Details (Read-only) */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="console-card-title">Current Plan Details</CardTitle>
            <CardDescription>Read-only information about the current subscription</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Plan Name</span>
                <span className="font-medium">{currentPlan.display_name || currentPlan.plan_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Status</span>
                <Badge variant="outline" className="capitalize text-xs">{currentPlan.status}</Badge>
              </div>
              {currentPlan.start_date && (
                <div>
                  <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Start Date</span>
                  <span className="font-medium">{formatDateOnly(currentPlan.start_date)}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Current Price</span>
                <span className="font-medium text-[#FF6E50]">
                  {formatCurrency(currentPlan.unit_price, orgCurrency)}/{currentPlan.billing_cycle}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Current Seats</span>
                <span className="font-medium">{currentPlan.seats ?? 0}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs uppercase tracking-wide mb-1">Current Monthly Cost</span>
                <span className="font-medium">{(() => {
                  let monthlyCost = currentPlan.unit_price * (currentPlan.seats ?? 1)
                  if (currentPlan.pricing_model === 'FLAT_FEE') monthlyCost = currentPlan.unit_price
                  if (currentPlan.billing_cycle === 'annual') monthlyCost = monthlyCost / 12
                  if (currentPlan.billing_cycle === 'quarterly') monthlyCost = monthlyCost / 3
                  return formatCurrency(monthlyCost, orgCurrency)
                })()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle className="console-card-title">New Version Details</CardTitle>
            <CardDescription>Changes will take effect on the start date you select below</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Start Date for New Version */}
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date *</Label>
              <DatePicker
                date={effectiveDate}
                onSelect={setEffectiveDate}
                placeholder="Select start date"
                minDate={new Date()}
                disabled={saving}
                data-testid="edit-start-date-picker"
              />
              <p className="text-xs text-slate-500">
                <Calendar className="h-3 w-3 inline mr-1" />
                Current plan ends {effectiveDate ? format(new Date(effectiveDate.getTime() - 86400000), 'MMM d, yyyy') : 'day before start date'}. New version starts on this date.
              </p>
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_price">Unit Price ({orgCurrency}) *</Label>
                <Input
                  id="unit_price"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={editData.unit_price === 0 ? "" : editData.unit_price}
                  onFocus={(e) => {
                    // Select all text to allow immediate replacement when typing
                    e.target.select()
                    // For number inputs, also explicitly set selection range
                    const input = e.target as HTMLInputElement
                    if (input.value) {
                      setTimeout(() => input.setSelectionRange(0, input.value.length), 0)
                    }
                  }}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value)
                    setEditData({ ...editData, unit_price: e.target.value === "" ? 0 : (isNaN(parsed) ? 0 : Math.max(0, parsed)) })
                  }}
                  disabled={saving}
                  data-testid="edit-price-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="seats">Seats *</Label>
                <Input
                  id="seats"
                  type="number"
                  min={0}
                  max={10000}
                  step="1"
                  placeholder="0"
                  value={editData.seats === 0 ? "" : editData.seats}
                  onFocus={(e) => {
                    // Select all text to allow immediate replacement when typing
                    e.target.select()
                    // For number inputs, also explicitly set selection range
                    const input = e.target as HTMLInputElement
                    if (input.value) {
                      setTimeout(() => input.setSelectionRange(0, input.value.length), 0)
                    }
                  }}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10)
                    const bounded = Math.min(10000, Math.max(0, isNaN(parsed) ? 0 : parsed))
                    setEditData({ ...editData, seats: e.target.value === "" ? 0 : bounded })
                  }}
                  disabled={saving}
                  data-testid="edit-seats-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing_cycle">Billing Cycle</Label>
                <Select
                  value={editData.billing_cycle}
                  onValueChange={(value) => setEditData({ ...editData, billing_cycle: value })}
                  disabled={saving}
                >
                  <SelectTrigger id="billing_cycle" data-testid="edit-billing-select">
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
                <Label htmlFor="pricing_model">Pricing Model</Label>
                <Select
                  value={editData.pricing_model}
                  onValueChange={(value) => setEditData({ ...editData, pricing_model: value as 'PER_SEAT' | 'FLAT_FEE' })}
                  disabled={saving}
                >
                  <SelectTrigger id="pricing_model" data-testid="edit-pricing-model-select">
                    <SelectValue placeholder="Select pricing model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT_FEE">Flat Fee</SelectItem>
                    <SelectItem value="PER_SEAT">Per Seat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g., Price increase due to plan upgrade"
                maxLength={500}
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                disabled={saving}
                data-testid="edit-notes-input"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Link href={`/${orgSlug}/integrations/subscriptions/${provider}`}>
                <Button type="button" variant="outline" disabled={saving}>
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={saving || !effectiveDate}
                className="h-[36px] px-4 bg-[#007A78] text-white hover:bg-[#006664] rounded-xl text-[15px] font-semibold disabled:bg-[#E5E5EA] disabled:text-[#C7C7CC]"
                data-testid="edit-subscription-submit-btn"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
