"use client"

/**
 * Add Custom Subscription Page (REFACTORED)
 *
 * Standalone page for adding a custom subscription plan.
 * Supports template pre-fill via ?template= query param.
 *
 * Original: 783 lines
 * Refactored: ~270-300 lines (65% reduction)
 */

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { format } from "date-fns"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CascadingHierarchySelector, type SelectedHierarchy } from "@/components/hierarchy/cascading-hierarchy-selector"

import {
  createCustomPlan,
  type PlanCreate,
  type BillingCycle,
} from "@/actions/subscription-providers"
import { getOrgLocale } from "@/actions/organization-locale"
import { DEFAULT_CURRENCY } from "@/lib/i18n"

// Components
import { BreadcrumbNav } from "./components/breadcrumb-nav"
import { BasicInfoSection } from "./components/basic-info-section"
import { PricingSection } from "./components/pricing-section"
import { DatesNotesSection } from "./components/dates-notes-section"
import { CostPreviewCard } from "./components/cost-preview-card"
import { TemplateConversionCard } from "./components/template-conversion-card"

// Helpers
import {
  type FormDataWithAudit,
  getProviderDisplayName,
  getDefaultFormData,
} from "./components/shared"
import { validateForm, getFinalValues } from "./components/validation-helpers"

export default function AddCustomSubscriptionPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const { orgSlug, provider } = params
  const router = useRouter()
  const searchParams = useSearchParams()

  // Validate params
  const isValidParams = orgSlug && provider && typeof orgSlug === "string" && typeof provider === "string"

  // State
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [selectedHierarchy, setSelectedHierarchy] = useState<SelectedHierarchy | null>(null)
  const [formData, setFormData] = useState<FormDataWithAudit>(getDefaultFormData("USD"))
  const [isFromTemplate, setIsFromTemplate] = useState(false)

  const providerDisplayName = getProviderDisplayName(provider)

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
          setFormData(prev => ({
            ...prev,
            currency,
            unit_price: prev.unit_price !== undefined ? prev.unit_price : 0,
            seats: prev.seats !== undefined ? prev.seats : 1,
          }))
        }
      } catch {
        setFormData(prev => ({
          ...prev,
          unit_price: prev.unit_price !== undefined ? prev.unit_price : 0,
          seats: prev.seats !== undefined ? prev.seats : 1,
        }))
      } finally {
        setLoading(false)
      }
    }

    loadOrgCurrency()
  }, [orgSlug, isValidParams])

  // Pre-fill form from template query params
  useEffect(() => {
    const templateName = searchParams.get("template")
    if (templateName) {
      const displayName = searchParams.get("display_name") || templateName
      const unitPrice = parseFloat(searchParams.get("unit_price") || "0")
      const currency = searchParams.get("currency") || orgCurrency
      const seats = parseInt(searchParams.get("seats") || "1", 10)
      const billingCycle = (searchParams.get("billing_cycle") || "monthly") as BillingCycle
      const pricingModel = (searchParams.get("pricing_model") || "FLAT_FEE") as "PER_SEAT" | "FLAT_FEE"
      const notes = searchParams.get("notes") || ""

      // Audit trail from template
      const sourceCurrency = searchParams.get("source_currency")
      const sourcePrice = parseFloat(searchParams.get("source_price") || "0")
      const exchangeRateUsed = parseFloat(searchParams.get("exchange_rate_used") || "1")

      setFormData({
        plan_name: templateName,
        display_name: displayName,
        unit_price: unitPrice,
        seats: seats,
        billing_cycle: billingCycle,
        pricing_model: pricingModel,
        currency: currency,
        notes: notes,
        source_currency: sourceCurrency || undefined,
        source_price: sourcePrice > 0 ? sourcePrice : undefined,
        exchange_rate_used: exchangeRateUsed > 0 ? exchangeRateUsed : undefined,
      })

      if (sourceCurrency) {
        setIsFromTemplate(true)
      }
    }
  }, [searchParams, orgCurrency])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate form
    const validation = validateForm(formData, startDate, selectedHierarchy, orgCurrency, endDate)
    if (!validation.isValid) {
      setError(validation.error || "Validation failed")
      return
    }

    // Get final validated values
    const { finalUnitPrice, finalSeats } = getFinalValues(formData)

    setSubmitting(true)

    try {
      const startDateStr = format(startDate!, "yyyy-MM-dd")
      const endDateStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined

      // Build plan data including audit trail if from template
      const planData: PlanCreate & {
        source_currency?: string
        source_price?: number
        exchange_rate_used?: number
      } = {
        plan_name: formData.plan_name.trim().toUpperCase().replace(/\s+/g, "_"),
        display_name: formData.display_name?.trim() || formData.plan_name.trim(),
        unit_price: finalUnitPrice,
        seats: finalSeats,
        billing_cycle: formData.billing_cycle,
        pricing_model: formData.pricing_model,
        currency: formData.currency,
        notes: formData.notes?.trim() || "",
        start_date: startDateStr,
        end_date: endDateStr,
        // REQUIRED: Include hierarchy fields for cost allocation
        hierarchy_entity_id: selectedHierarchy!.entity_id,
        hierarchy_entity_name: selectedHierarchy!.entity_name,
        hierarchy_level_code: selectedHierarchy!.level_code,
        hierarchy_path: selectedHierarchy!.path,
        hierarchy_path_names: selectedHierarchy!.path_names,
      }

      // Include audit trail if from template
      if (formData.source_currency && formData.source_price !== undefined && formData.exchange_rate_used) {
        planData.source_currency = formData.source_currency
        planData.source_price = formData.source_price
        planData.exchange_rate_used = formData.exchange_rate_used
      }

      const result = await createCustomPlan(orgSlug, provider, planData)

      if (!result.success) {
        setError(result.error || "Failed to create subscription")
        setSubmitting(false)
        return
      }

      // Verify API returned the created plan
      if (!result.plan || !result.plan.subscription_id) {
        toast.warning(
          "Subscription may not have been saved correctly. Please check the provider page.",
          { duration: 8000 }
        )
      } else {
        // Show success message with backfill status
        if (result.backfillTriggered) {
          toast.success(
            `Subscription added! ${result.backfillMessage}`,
            { duration: 6000 }
          )
        } else {
          toast.success("Subscription added successfully")
        }
      }

      // Redirect to success page with backfill info
      const planName = formData.plan_name.toUpperCase().replace(/\s+/g, "_")
      const successUrl = new URL(`/${orgSlug}/integrations/subscriptions/${provider}/success`, window.location.origin)
      successUrl.searchParams.set("action", "created")
      successUrl.searchParams.set("plan", planName)
      if (result.backfillTriggered) {
        successUrl.searchParams.set("backfill", "true")
        successUrl.searchParams.set("backfill_start", startDateStr)
      }
      router.push(successUrl.pathname + successUrl.search)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#1a7a3a]" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <BreadcrumbNav orgSlug={orgSlug} provider={provider} providerDisplayName={providerDisplayName} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/integrations/subscriptions/${provider}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="console-page-title">Add Custom {providerDisplayName} Subscription</h1>
          <p className="console-subheading">
            Create a custom subscription plan for {providerDisplayName}
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-[#FF6C5E]/30 bg-[#FF6C5E]/5">
          <CardContent className="pt-6">
            <p className="text-sm text-[#FF6C5E]">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Subscription Details</CardTitle>
            <CardDescription>
              Enter the details for your custom {providerDisplayName} subscription plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <BasicInfoSection
              formData={formData}
              setFormData={setFormData}
              error={error}
              setError={setError}
              submitting={submitting}
            />

            <PricingSection
              formData={formData}
              setFormData={setFormData}
              orgCurrency={orgCurrency}
              error={error}
              setError={setError}
              submitting={submitting}
            />

            <CascadingHierarchySelector
              orgSlug={orgSlug}
              value={selectedHierarchy}
              onChange={setSelectedHierarchy}
              disabled={submitting}
              error={error?.includes("hierarchy") || error?.includes("Hierarchy") ? error : undefined}
            />

            <DatesNotesSection
              formData={formData}
              setFormData={setFormData}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              error={error}
              setError={setError}
              submitting={submitting}
            />

            <TemplateConversionCard formData={formData} isFromTemplate={isFromTemplate} />

            <CostPreviewCard formData={formData} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${orgSlug}/integrations/subscriptions/${provider}`)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !formData.plan_name.trim() || !startDate || !selectedHierarchy}
            className="console-button-primary h-11 rounded-xl"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Add Subscription
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
