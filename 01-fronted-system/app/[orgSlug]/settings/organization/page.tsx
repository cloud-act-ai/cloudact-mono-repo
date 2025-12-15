"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2,
  Save,
  AlertTriangle,
  Globe,
  DollarSign,
  CheckCircle2,
  Clock,
} from "lucide-react"
import { logError } from "@/lib/utils"
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES } from "@/lib/i18n/constants"
import { getOrgLocale, updateOrgLocale } from "@/actions/organization-locale"

export default function OrganizationSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Locale fields
  const [currency, setCurrency] = useState("USD")
  const [timezone, setTimezone] = useState("UTC")

  // Track original values to detect changes
  const [originalCurrency, setOriginalCurrency] = useState("USD")
  const [originalTimezone, setOriginalTimezone] = useState("UTC")

  useEffect(() => {
    document.title = "Organization Settings | CloudAct.ai"
  }, [])

  const fetchLocale = useCallback(async () => {
    try {
      setIsLoading(true)
      const result = await getOrgLocale(orgSlug)

      if (!result.success || !result.locale) {
        setError(result.error || "Failed to fetch organization locale")
        return
      }

      // Set current values
      setCurrency(result.locale.default_currency)
      setTimezone(result.locale.default_timezone)

      // Track original values
      setOriginalCurrency(result.locale.default_currency)
      setOriginalTimezone(result.locale.default_timezone)
    } catch (err: unknown) {
      const errorMessage = logError("OrganizationSettingsPage:fetchLocale", err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    void fetchLocale()
  }, [fetchLocale])

  const hasChanges = currency !== originalCurrency || timezone !== originalTimezone

  const handleSave = async () => {
    if (!hasChanges) {
      setError("No changes to save")
      return
    }

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await updateOrgLocale(orgSlug, currency, timezone)

      if (!result.success) {
        setError(result.error || "Failed to update organization locale")
        return
      }

      // Update original values after successful save
      setOriginalCurrency(currency)
      setOriginalTimezone(timezone)

      setSuccess("Organization locale updated successfully!")
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setCurrency(originalCurrency)
    setTimezone(originalTimezone)
    setError(null)
    setSuccess(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-[#007A78]/5 border-[#007A78]/30">
          <CheckCircle2 className="h-4 w-4 text-[#007A78]" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      <div className="metric-card shadow-sm">
        <div className="metric-card-header mb-6">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#8E8E93]" />
            <h2 className="text-[22px] font-bold text-black">Organization Locale</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">
            Configure currency and timezone for your organization. These settings affect all cost
            calculations and time displays.
          </p>
        </div>

        <div className="metric-card-content space-y-4 sm:space-y-6">
          {/* Currency Selection */}
          <div className="space-y-2">
            <Label htmlFor="currency" className="text-[13px] sm:text-[15px] font-medium text-gray-700 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#8E8E93]" />
              Currency <span className="text-[#FF6E50]">*</span>
            </Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency" className="h-10 text-[15px] border border-[#E5E5EA] rounded-lg">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {SUPPORTED_CURRENCIES.map((curr) => (
                  <SelectItem key={curr.code} value={curr.code}>
                    {curr.symbol} {curr.name} ({curr.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[13px] text-[#8E8E93]">
              All costs and billing will be displayed in this currency. This setting affects cost
              calculations across integrations and analytics.
            </p>
          </div>

          <Separator />

          {/* Timezone Selection */}
          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-[13px] sm:text-[15px] font-medium text-gray-700 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#8E8E93]" />
              Timezone <span className="text-[#FF6E50]">*</span>
            </Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone" className="h-10 text-[15px] border border-[#E5E5EA] rounded-lg">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {SUPPORTED_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label} ({tz.offset})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[13px] text-[#8E8E93]">
              Used for displaying timestamps in dashboards, reports, and activity logs. Pipeline
              schedules and billing dates use this timezone.
            </p>
          </div>

          {hasChanges && (
            <Alert className="bg-[#007A78]/5 border-[#007A78]/20">
              <AlertTriangle className="h-4 w-4 text-[#007A78]" />
              <AlertDescription className="text-[#005F5D]">
                You have unsaved changes. Click Save to apply or Reset to discard.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="pt-4 sm:pt-6 border-t border-[#E5E5EA] flex gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="cloudact-btn-primary h-[36px] px-4"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>

          {hasChanges && (
            <Button
              onClick={handleReset}
              disabled={isSaving}
              variant="outline"
              className="cloudact-btn-secondary h-[36px] px-4"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Information Card */}
      <div className="metric-card shadow-sm bg-[#007A78]/5 border-[#007A78]/20">
        <div className="metric-card-content">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#007A78] mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <h3 className="text-[15px] font-semibold text-[#005F5D]">Important Notes</h3>
              <ul className="text-[13px] text-[#007A78] space-y-1 list-disc list-inside">
                <li>
                  Currency changes affect how costs are displayed but do not convert historical data.
                </li>
                <li>
                  Timezone changes affect future timestamps and scheduled pipeline runs.
                </li>
                <li>
                  These settings sync to backend BigQuery for cost calculations and pipeline
                  scheduling.
                </li>
                <li>
                  All team members will see costs and times in the organization&apos;s locale.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
