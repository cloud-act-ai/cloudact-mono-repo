"use client"

/**
 * Add Custom Provider Page
 *
 * Allows users to create a new SaaS provider not in the default list
 * and add their first subscription plan.
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Plus,
  Brain,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Cloud,
  CreditCard,
} from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"

import {
  createCustomProviderWithPlan,
} from "@/actions/subscription-providers"
import { getOrgLocale } from "@/actions/organization-locale"
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from "@/lib/i18n"

// Categories with icons
const CATEGORIES = [
  { value: "ai", label: "AI / Machine Learning", icon: Brain },
  { value: "design", label: "Design", icon: Palette },
  { value: "productivity", label: "Productivity", icon: FileText },
  { value: "communication", label: "Communication", icon: MessageSquare },
  { value: "development", label: "Development", icon: Code },
  { value: "cloud", label: "Cloud / Infrastructure", icon: Cloud },
  { value: "other", label: "Other", icon: CreditCard },
]

interface FormData {
  // Provider fields
  provider_name: string
  category: string
  // Plan fields
  plan_name: string
  display_name: string
  unit_price: number
  seats: number
  billing_cycle: string
  pricing_model: string
  currency: string
  notes: string
}

export default function AddCustomProviderPage() {
  const params = useParams<{ orgSlug: string }>()
  const { orgSlug } = params
  const router = useRouter()

  const isValidParams = orgSlug && typeof orgSlug === "string"

  // State
  const [orgCurrency, setOrgCurrency] = useState<string>("USD")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())

  // Form state
  const [formData, setFormData] = useState<FormData>({
    provider_name: "",
    category: "other",
    plan_name: "",
    display_name: "",
    unit_price: 0,
    seats: 1,
    billing_cycle: "monthly",
    pricing_model: "FLAT_FEE",
    currency: "USD",
    notes: "",
  })

  // Fetch org currency on mount
  useEffect(() => {
    async function loadOrgCurrency() {
      if (!isValidParams) {
        setError("Invalid page parameters")
        setLoading(false)
        return
      }

      try {
        const result = await getOrgLocale(orgSlug)
        if (result.success && result.locale) {
          const currency = result.locale.default_currency || "USD"
          setOrgCurrency(currency)
          setFormData(prev => ({ ...prev, currency }))
        }
      } catch (err) {
        console.error("Failed to load org currency:", err)
      } finally {
        setLoading(false)
      }
    }

    loadOrgCurrency()
  }, [orgSlug, isValidParams])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.provider_name.trim()) {
      setError("Provider name is required")
      return
    }

    if (!formData.plan_name.trim()) {
      setError("Plan name is required")
      return
    }

    if (!startDate) {
      setError("Start date is required")
      return
    }

    if (formData.unit_price < 0) {
      setError("Price cannot be negative")
      return
    }

    if ((formData.seats ?? 0) < 0) {
      setError("Seats cannot be negative")
      return
    }

    if (formData.pricing_model === 'PER_SEAT' && (formData.seats ?? 0) < 1) {
      setError("Per-seat plans require at least 1 seat")
      return
    }

    if ((formData.seats ?? 0) > 10000) {
      setError("Seats cannot exceed 10,000")
      return
    }

    if (formData.currency !== orgCurrency) {
      setError(`Currency must match organization default (${orgCurrency})`)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const startDateStr = format(startDate, "yyyy-MM-dd")

      // Generate provider slug from name
      const providerSlug = formData.provider_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")

      const result = await createCustomProviderWithPlan(orgSlug, {
        provider: providerSlug,
        display_name: formData.provider_name,
        category: formData.category,
        plan: {
          plan_name: formData.plan_name.toUpperCase().replace(/\s+/g, "_"),
          display_name: formData.display_name || formData.plan_name,
          unit_price: formData.unit_price,
          seats: formData.seats,
          billing_cycle: formData.billing_cycle,
          pricing_model: formData.pricing_model as "PER_SEAT" | "FLAT_FEE",
          currency: formData.currency,
          notes: formData.notes,
          start_date: startDateStr,
        },
      })

      if (!result.success) {
        setError(result.error || "Failed to create provider")
        toast.error(result.error || "Failed to create provider")
        return
      }

      toast.success(`${formData.provider_name} added successfully`)

      // Redirect to the new provider's page
      router.push(`/${orgSlug}/integrations/subscriptions/${providerSlug}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link
          href={`/${orgSlug}/integrations/subscriptions`}
          className="text-[#007A78] hover:text-[#005F5D] transition-colors"
        >
          Subscription Providers
        </Link>
        <ChevronRight className="h-4 w-4 text-[#8E8E93]" />
        <span className="text-gray-900 font-medium">Add Custom Provider</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/integrations/subscriptions`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-[28px] font-bold text-black tracking-tight">Add Custom Provider</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">
            Track a SaaS subscription not in our default list
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

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Provider Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Provider Details</CardTitle>
            <CardDescription>
              Enter the name and category of the SaaS provider you want to track.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider Name */}
            <div className="space-y-2">
              <Label htmlFor="provider_name">Provider Name *</Label>
              <Input
                id="provider_name"
                placeholder="e.g., Airtable, Mixpanel, Hotjar"
                maxLength={50}
                value={formData.provider_name}
                onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                disabled={submitting}
                required
              />
              <p className="text-xs text-slate-500">
                The name of the SaaS service you want to track.
              </p>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
                disabled={submitting}
                required
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(({ value, label, icon: Icon }) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>First Subscription Plan</CardTitle>
            <CardDescription>
              Add your first subscription plan for this provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label htmlFor="plan_name">Plan Name *</Label>
              <Input
                id="plan_name"
                placeholder="e.g., Pro, Team, Enterprise"
                maxLength={50}
                value={formData.plan_name}
                onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                disabled={submitting}
                required
              />
              <p className="text-xs text-slate-500">
                This will be converted to uppercase (e.g., PRO). Max 50 characters.
              </p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name (optional)</Label>
              <Input
                id="display_name"
                placeholder="e.g., Pro Plan"
                maxLength={100}
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                disabled={submitting}
              />
            </div>

            {/* Price and Billing Cycle */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_price">Unit Price *</Label>
                <div className="relative">
                  <Input
                    id="unit_price"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={formData.unit_price === 0 ? "" : formData.unit_price}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value)
                      setFormData({
                        ...formData,
                        unit_price: e.target.value === "" ? 0 : (isNaN(parsed) ? 0 : Math.max(0, parsed))
                      })
                    }}
                    disabled={submitting}
                    required
                    className="pl-8"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    {SUPPORTED_CURRENCIES.find(c => c.code === formData.currency)?.symbol || "$"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Price in {formData.currency}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_cycle">Billing Cycle *</Label>
                <Select
                  value={formData.billing_cycle}
                  onValueChange={(value) => setFormData({ ...formData, billing_cycle: value })}
                  disabled={submitting}
                  required
                >
                  <SelectTrigger id="billing_cycle">
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

            {/* Pricing Model and Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pricing_model">Pricing Model *</Label>
                <Select
                  value={formData.pricing_model}
                  onValueChange={(value) => setFormData({ ...formData, pricing_model: value })}
                  disabled={submitting}
                  required
                >
                  <SelectTrigger id="pricing_model">
                    <SelectValue placeholder="Select pricing model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT_FEE">Flat Fee</SelectItem>
                    <SelectItem value="PER_SEAT">Per Seat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <div className="flex items-center h-10 px-3 rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                  <span className="font-medium">{formData.currency}</span>
                  <span className="ml-2 text-slate-400">
                    ({getCurrencySymbol(formData.currency)})
                  </span>
                  <span className="ml-auto text-xs text-slate-400">Locked</span>
                </div>
                <p className="text-xs text-slate-500">
                  Currency is set to your organization's default ({orgCurrency}).
                </p>
              </div>
            </div>

            {/* Seats */}
            <div className="space-y-2">
              <Label htmlFor="seats">Seats *</Label>
              <Input
                id="seats"
                type="number"
                min={0}
                max={10000}
                step="1"
                placeholder="1"
                value={formData.seats === 0 ? "" : formData.seats}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10)
                  const bounded = Math.min(10000, Math.max(0, isNaN(parsed) ? 0 : parsed))
                  setFormData({ ...formData, seats: e.target.value === "" ? 0 : bounded })
                }}
                disabled={submitting}
                required
              />
              <p className="text-xs text-slate-500">
                {formData.pricing_model === 'PER_SEAT'
                  ? 'Number of seats for this subscription (minimum 1 for per-seat plans)'
                  : 'Number of seats for tracking purposes'}
              </p>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date *</Label>
              <DatePicker
                date={startDate}
                onSelect={setStartDate}
                placeholder="Select start date"
                disabled={submitting}
              />
              <p className="text-xs text-slate-500">
                When did this subscription start?
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Any additional notes..."
                maxLength={500}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                disabled={submitting}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end gap-3">
          <Link href={`/${orgSlug}/integrations/subscriptions`}>
            <Button type="button" variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-[#007A78] hover:bg-[#006664] text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Provider
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
