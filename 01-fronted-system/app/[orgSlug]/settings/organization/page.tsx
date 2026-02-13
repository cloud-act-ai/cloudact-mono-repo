"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Trash2,
  ArrowRightLeft,
  Users,
  User,
  UserCog,
  RefreshCw,
  Key,
  Sparkles,
  Shield,
  Activity,
  Save,
  Mail,
} from "lucide-react"
import { logError } from "@/lib/utils"
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES, FISCAL_YEAR_OPTIONS, SUPPORTED_DATE_FORMATS, getFiscalYearFromTimezone, DEFAULT_CURRENCY, DEFAULT_DATE_FORMAT } from "@/lib/i18n/constants"
import {
  getOrgLocale,
  updateOrgLocale,
  updateFiscalYear,
  getOrgLogo,
  getOrgContactDetails,
  updateOrgContactDetails,
  getOrgName,
  updateOrgName,
  type OrgContactDetails,
} from "@/actions/organization-locale"
import { LogoUpload } from "@/components/ui/logo-upload"
import {
  getOwnedOrganizations,
  getEligibleTransferMembers,
  transferOwnership,
  deleteOrganization,
  requestAccountDeletion,
} from "@/actions/account"
import {
  checkBackendOnboarding,
  onboardToBackend,
  getOrgDataForReonboarding,
} from "@/actions/backend-onboarding"

// Premium components - same as dashboard/pipeline pages
import { StatRow } from "@/components/ui/stat-row"
// Premium components available: PremiumCard, SectionHeader
// Currently using custom components matching dashboard/pipeline patterns
import { LoadingState } from "@/components/ui/loading-state"

interface OwnedOrg {
  id: string
  org_name: string
  org_slug: string
  member_count: number
  has_other_members: boolean
}

interface TransferMember {
  user_id: string
  email: string
  full_name: string | null
  role: string
}

export default function OrganizationSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Organization name fields
  const [orgName, setOrgName] = useState("")
  const [originalOrgName, setOriginalOrgName] = useState("")
  const [isSavingOrgName, setIsSavingOrgName] = useState(false)

  // Locale fields
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [timezone, setTimezone] = useState("UTC")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [fiscalYearStart, setFiscalYearStart] = useState(1) // 1=Jan, 4=Apr, 7=Jul, 10=Oct
  const [dateFormat, setDateFormat] = useState(DEFAULT_DATE_FORMAT)

  // Track original values to detect changes
  const [originalCurrency, setOriginalCurrency] = useState(DEFAULT_CURRENCY)
  const [originalTimezone, setOriginalTimezone] = useState("UTC")
  const [originalFiscalYearStart, setOriginalFiscalYearStart] = useState(1)
  const [originalDateFormat, setOriginalDateFormat] = useState(DEFAULT_DATE_FORMAT)
  const [isSavingFiscalYear, setIsSavingFiscalYear] = useState(false)

  // Danger zone state
  const [email, setEmail] = useState("")
  const [ownedOrgs, setOwnedOrgs] = useState<OwnedOrg[]>([])
  const [loadingOwnedOrgs, setLoadingOwnedOrgs] = useState(false)

  // Transfer ownership state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [selectedOrgForTransfer, setSelectedOrgForTransfer] = useState<OwnedOrg | null>(null)
  const [transferMembers, setTransferMembers] = useState<TransferMember[]>([])
  const [loadingTransferMembers, setLoadingTransferMembers] = useState(false)
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>("")
  const [isTransferring, setIsTransferring] = useState(false)

  // Delete org state
  const [deleteOrgDialogOpen, setDeleteOrgDialogOpen] = useState(false)
  const [selectedOrgForDelete, setSelectedOrgForDelete] = useState<OwnedOrg | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [isDeletingOrg, setIsDeletingOrg] = useState(false)

  // Account deletion state
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false)
  const [deletionRequested, setDeletionRequested] = useState(false)

  // Backend connection state
  const [backendOnboarded, setBackendOnboarded] = useState(false)
  const [apiKeyFingerprint, setApiKeyFingerprint] = useState<string | null>(null)
  const [apiKeyValid, setApiKeyValid] = useState<boolean | undefined>(undefined)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [isResyncing, setIsResyncing] = useState(false)
  const [loadingBackendStatus, setLoadingBackendStatus] = useState(true)

  // Contact details state
  const [contactDetails, setContactDetails] = useState<OrgContactDetails>({
    business_person_name: null,
    business_person_position: null,
    business_person_department: null,
    contact_email: null,
    contact_phone: null,
    business_address_line1: null,
    business_address_line2: null,
    business_city: null,
    business_state: null,
    business_postal_code: null,
    business_country: null,
  })
  const [originalContactDetails, setOriginalContactDetails] = useState<OrgContactDetails>({
    business_person_name: null,
    business_person_position: null,
    business_person_department: null,
    contact_email: null,
    contact_phone: null,
    business_address_line1: null,
    business_address_line2: null,
    business_city: null,
    business_state: null,
    business_postal_code: null,
    business_country: null,
  })
  const [loadingContactDetails, setLoadingContactDetails] = useState(true)
  const [isSavingContactDetails, setIsSavingContactDetails] = useState(false)

  useEffect(() => {
    document.title = "Organization Settings | CloudAct.ai"
  }, [])

  // Load backend connection status
  const loadBackendStatus = useCallback(async () => {
    setLoadingBackendStatus(true)
    setBackendError(null)
    try {
      const result = await checkBackendOnboarding(orgSlug, { timeout: 5000 })
      setBackendOnboarded(result.onboarded)
      setApiKeyFingerprint(result.apiKeyFingerprint || null)
      setApiKeyValid(result.apiKeyValid)
      setBackendError(result.error || null)
    } catch {
      setBackendError("Failed to check backend connection status")
    } finally {
      setLoadingBackendStatus(false)
    }
  }, [orgSlug])

  // Handle resync backend connection
  const handleResync = async () => {
    // Prevent double-clicks while resyncing
    if (isResyncing) return
    setIsResyncing(true)
    setError(null)
    setSuccess(null)

    try {
      // Check if we need to re-onboard (not onboarded or API key invalid)
      const needsOnboarding = !backendOnboarded || apiKeyValid === false

      if (needsOnboarding) {
        // Get org data using server action (bypasses RLS)
        const orgDataResult = await getOrgDataForReonboarding(orgSlug)

        if (!orgDataResult.success || !orgDataResult.data) {
          setError(orgDataResult.error || "Failed to get organization data for re-onboarding")
          return
        }

        const { orgName, adminEmail, currency: orgCurrency, timezone: orgTimezone } = orgDataResult.data

        // Call onboardToBackend to regenerate API key
        const onboardResult = await onboardToBackend({
          orgSlug,
          companyName: orgName,
          adminEmail,
          subscriptionPlan: "STARTER",
          defaultCurrency: orgCurrency,
          defaultTimezone: orgTimezone,
        })

        if (onboardResult.success) {
          // Show success message (subscription data is managed in Supabase now)
          setSuccess(
            onboardResult.apiKey
              ? `Backend connection restored! New API key: ${onboardResult.apiKey.slice(0, 20)}... (Save this key!)`
              : "Backend connection restored successfully!"
          )

          await loadBackendStatus()
          // Keep success message longer for API key display
          setTimeout(() => setSuccess(null), 10000)
        } else {
          setError(onboardResult.error || "Failed to re-onboard organization")
        }
      } else {
        // Backend is already connected - show confirmation
        // (Subscription data is managed in Supabase, no sync needed)
        setSuccess("Backend connection verified successfully!")
        setTimeout(() => setSuccess(null), 4000)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resync backend connection")
    } finally {
      setIsResyncing(false)
    }
  }

  // Load contact details
  const loadContactDetails = useCallback(async () => {
    setLoadingContactDetails(true)
    try {
      const result = await getOrgContactDetails(orgSlug)
      if (result.success && result.contactDetails) {
        setContactDetails(result.contactDetails)
        setOriginalContactDetails(result.contactDetails)
      }
    } catch (err: unknown) {
      // Silently fail - contact details are non-critical
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to load contact details:", err)
      }
    } finally {
      setLoadingContactDetails(false)
    }
  }, [orgSlug])

  // Load owned organizations
  const loadOwnedOrganizations = useCallback(async () => {
    setLoadingOwnedOrgs(true)
    try {
      const result = await getOwnedOrganizations()
      if (result.success && result.data) {
        setOwnedOrgs(result.data)
      }
    } catch (err: unknown) {
      // Silently fail - owned orgs list is non-critical
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to load owned organizations:", err)
      }
    } finally {
      setLoadingOwnedOrgs(false)
    }
  }, [])

  const fetchLocale = useCallback(async () => {
    setIsLoading(true)
    try {
      // Wrap Promise.all in try-catch to handle individual failures
      let localeResult, logoResult, nameResult
      try {
        [localeResult, logoResult, nameResult] = await Promise.all([
          getOrgLocale(orgSlug),
          getOrgLogo(orgSlug),
          getOrgName(orgSlug)
        ])
      } catch {
        setError("Failed to load organization settings")
        return
      }

      if (!localeResult.success || !localeResult.locale) {
        setError(localeResult.error || "Failed to fetch organization locale")
        return
      }

      // Set current values
      setCurrency(localeResult.locale.default_currency)
      setTimezone(localeResult.locale.default_timezone)
      setDateFormat(localeResult.locale.date_format || DEFAULT_DATE_FORMAT)

      // Track original values
      setOriginalCurrency(localeResult.locale.default_currency)
      setOriginalTimezone(localeResult.locale.default_timezone)
      setOriginalDateFormat(localeResult.locale.date_format || DEFAULT_DATE_FORMAT)

      // Set fiscal year (default based on timezone if not set)
      const fiscalYear = localeResult.locale.fiscal_year_start_month || getFiscalYearFromTimezone(localeResult.locale.default_timezone)
      setFiscalYearStart(fiscalYear)
      setOriginalFiscalYearStart(fiscalYear)

      // Set org name
      if (nameResult.success && nameResult.orgName) {
        setOrgName(nameResult.orgName)
        setOriginalOrgName(nameResult.orgName)
      }

      // Set logo URL
      if (logoResult.success) {
        setLogoUrl(logoResult.logoUrl || null)
      }
    } catch (err: unknown) {
      const errorMessage = logError("OrganizationSettingsPage:fetchLocale", err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  const loadUserAndOrgs = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      // Handle auth errors (e.g., invalid refresh token)
      // Only redirect for truly invalid sessions, not transient errors
      if (authError) {
        const isSessionError = authError.message?.includes("Refresh Token") ||
                               authError.message?.includes("JWT") ||
                               authError.status === 400

        if (isSessionError) {
          // Log in development
          if (process.env.NODE_ENV === "development") {
            console.warn(`[OrgSettings] Auth error:`, authError.message)
          }
          // Only redirect if this is a persistent issue
          // Give the session a chance to refresh first
          await new Promise(resolve => setTimeout(resolve, 500))
          const { data: { user: retryUser } } = await supabase.auth.getUser()
          if (!retryUser) {
            window.location.href = `/login?redirectTo=/${orgSlug}/settings/organization&reason=session_expired`
            return
          }
          // Session recovered, continue
          setEmail(retryUser.email || "")
          await loadOwnedOrganizations()
          return
        }
      }

      if (!user) {
        router.push("/login")
        return
      }

      setEmail(user.email || "")
      await loadOwnedOrganizations()
    } catch (err: unknown) {
      // Check if it's an auth error - only redirect for persistent issues
      if (err instanceof Error && (err.message?.includes("Refresh Token") || err.message?.includes("JWT"))) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[OrgSettings] Caught auth error:`, err.message)
        }
        // Retry once before redirecting
        const supabase = createClient()
        const { data: { user: retryUser } } = await supabase.auth.getUser()
        if (!retryUser) {
          window.location.href = `/login?redirectTo=/${orgSlug}/settings/organization&reason=session_expired`
        }
      }
    }
  }, [loadOwnedOrganizations, router, orgSlug])

  useEffect(() => {
    fetchLocale()
    loadUserAndOrgs()
    loadBackendStatus()
    loadContactDetails()
  }, [fetchLocale, loadUserAndOrgs, loadBackendStatus, loadContactDetails])

  const hasLocaleChanges = currency !== originalCurrency || timezone !== originalTimezone || dateFormat !== originalDateFormat
  const hasFiscalYearChanges = fiscalYearStart !== originalFiscalYearStart
  const hasOrgNameChanges = orgName !== originalOrgName && orgName.trim().length >= 2
  const hasContactChanges =
    contactDetails.business_person_name !== originalContactDetails.business_person_name ||
    contactDetails.business_person_position !== originalContactDetails.business_person_position ||
    contactDetails.business_person_department !== originalContactDetails.business_person_department ||
    contactDetails.contact_email !== originalContactDetails.contact_email ||
    contactDetails.contact_phone !== originalContactDetails.contact_phone ||
    contactDetails.business_address_line1 !== originalContactDetails.business_address_line1 ||
    contactDetails.business_address_line2 !== originalContactDetails.business_address_line2 ||
    contactDetails.business_city !== originalContactDetails.business_city ||
    contactDetails.business_state !== originalContactDetails.business_state ||
    contactDetails.business_postal_code !== originalContactDetails.business_postal_code ||
    contactDetails.business_country !== originalContactDetails.business_country

  const handleSaveFiscalYear = async () => {
    if (!hasFiscalYearChanges) return

    setIsSavingFiscalYear(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await updateFiscalYear(orgSlug, fiscalYearStart)

      if (!result.success) {
        setError(result.error || "Failed to update fiscal year")
        return
      }

      setOriginalFiscalYearStart(fiscalYearStart)
      setSuccess("Fiscal year updated successfully!")
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSavingFiscalYear(false)
    }
  }

  const handleSaveOrgName = async () => {
    if (!hasOrgNameChanges) return

    setIsSavingOrgName(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await updateOrgName(orgSlug, orgName.trim())

      if (!result.success) {
        setError(result.error || "Failed to update organization name")
        return
      }

      setOriginalOrgName(result.orgName || orgName.trim())
      setOrgName(result.orgName || orgName.trim())
      setSuccess("Organization name updated successfully!")
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSavingOrgName(false)
    }
  }

  // Auto-update fiscal year when timezone changes
  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone)
    setError(null)
    // If fiscal year hasn't been manually changed, auto-update based on timezone
    if (fiscalYearStart === originalFiscalYearStart) {
      const suggestedFiscalYear = getFiscalYearFromTimezone(newTimezone)
      setFiscalYearStart(suggestedFiscalYear)
    }
  }

  const handleSave = async () => {
    // Prevent double-clicks while saving
    if (isSaving) return
    setError(null)
    setSuccess(null)

    if (!hasLocaleChanges) {
      setError("No changes to save")
      return
    }

    setIsSaving(true)

    try {
      const result = await updateOrgLocale(orgSlug, currency, timezone, dateFormat)

      if (!result.success) {
        setError(result.error || "Failed to update organization locale")
        return
      }

      // Update original values after successful save
      setOriginalCurrency(currency)
      setOriginalTimezone(timezone)
      setOriginalDateFormat(dateFormat)

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
    setDateFormat(originalDateFormat)
    setError(null)
    setSuccess(null)
  }

  const handleSaveContactDetails = async () => {
    setError(null)
    setSuccess(null)

    if (!hasContactChanges) {
      setError("No changes to save")
      return
    }

    setIsSavingContactDetails(true)

    try {
      const result = await updateOrgContactDetails(orgSlug, contactDetails)

      if (!result.success) {
        setError(result.error || "Failed to update contact details")
        return
      }

      // Update original values after successful save
      setOriginalContactDetails(contactDetails)

      setSuccess("Contact details updated successfully!")
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSavingContactDetails(false)
    }
  }

  const handleResetContactDetails = () => {
    setContactDetails(originalContactDetails)
    setError(null)
    setSuccess(null)
  }

  // Helper to update a single contact field
  const updateContactField = (field: keyof OrgContactDetails, value: string) => {
    setError(null)
    setContactDetails(prev => ({
      ...prev,
      [field]: value || null,
    }))
  }

  // Open transfer dialog and load members
  const openTransferDialog = async (org: OwnedOrg) => {
    setSelectedOrgForTransfer(org)
    setTransferDialogOpen(true)
    setLoadingTransferMembers(true)
    setSelectedNewOwner("")

    try {
      const result = await getEligibleTransferMembers(org.id)
      if (result.success && result.data) {
        setTransferMembers(result.data)
      } else {
        setTransferMembers([])
      }
    } catch {
      setTransferMembers([])
    } finally {
      setLoadingTransferMembers(false)
    }
  }

  // Handle ownership transfer
  const handleTransferOwnership = async () => {
    if (!selectedOrgForTransfer || !selectedNewOwner) return

    setIsTransferring(true)
    setError(null)

    try {
      const result = await transferOwnership(selectedOrgForTransfer.id, selectedNewOwner)
      if (result.success) {
        setSuccess(`Ownership of "${selectedOrgForTransfer.org_name}" transferred successfully!`)
        setTransferDialogOpen(false)
        setSelectedOrgForTransfer(null)
        await loadOwnedOrganizations()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to transfer ownership")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to transfer ownership")
    } finally {
      setIsTransferring(false)
    }
  }

  // Open delete org dialog
  const openDeleteOrgDialog = (org: OwnedOrg) => {
    setSelectedOrgForDelete(org)
    setDeleteConfirmName("")
    setDeleteOrgDialogOpen(true)
  }

  // Handle org deletion
  const handleDeleteOrg = async () => {
    if (!selectedOrgForDelete) return

    setIsDeletingOrg(true)
    setError(null)

    try {
      const result = await deleteOrganization(selectedOrgForDelete.id, deleteConfirmName)
      if (result.success) {
        setSuccess(`Organization "${selectedOrgForDelete.org_name}" deleted successfully!`)
        setDeleteOrgDialogOpen(false)
        setSelectedOrgForDelete(null)
        await loadOwnedOrganizations()
        if (selectedOrgForDelete.org_slug === orgSlug) {
          // Redirect to home since current org was deleted
          router.push("/")
        }
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to delete organization")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete organization")
    } finally {
      setIsDeletingOrg(false)
    }
  }

  // Request account deletion
  const handleRequestAccountDeletion = async () => {
    setIsRequestingDeletion(true)
    setError(null)

    try {
      const result = await requestAccountDeletion()
      if (result.success) {
        setDeletionRequested(true)
        setSuccess(result.message || "Verification email sent!")
      } else {
        setError(result.error || "Failed to request account deletion")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request account deletion")
    } finally {
      setIsRequestingDeletion(false)
    }
  }

  // Stats for StatRow component - same pattern as dashboard/pipelines
  const stats = [
    { icon: Building2, value: "Active", label: "Organization", color: "mint" as const },
    { icon: Activity, value: backendOnboarded ? "Connected" : "Pending", label: "Backend", color: backendOnboarded ? "mint" as const : "amber" as const },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6]/30 to-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[#90FCA6]/20">
            <Building2 className="h-5 w-5 sm:h-7 sm:w-7 text-[#1a7a3a]" />
          </div>
          <div>
            <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
              Organization Settings
            </h1>
            <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
              Manage your organization locale, branding, and backend configuration
            </p>
          </div>
        </div>
        <LoadingState message="Loading organization settings..." />
      </div>
    )
  }

  return (
    <div className="console-page-inner">
      {/* Premium Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6]/30 to-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[#90FCA6]/20">
          <Building2 className="h-5 w-5 sm:h-7 sm:w-7 text-[#1a7a3a]" />
        </div>
        <div>
          <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
            Organization Settings
          </h1>
          <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
            Manage your organization locale, branding, and backend configuration
          </p>
        </div>
      </div>

      {/* Stats Row - Using StatRow component like pipelines */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm">
        <StatRow stats={stats} size="md" />
      </div>

      {error && (
        <Alert variant="destructive" className="border-[#FF6C5E]/30 bg-[#FF6C5E]/10 animate-in slide-in-from-top-2 duration-300">
          <AlertTriangle className="h-4 w-4 text-[#FF6C5E]" />
          <AlertDescription className="text-[#FF6C5E]">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-[#90FCA6]/15 border-[#90FCA6]/30 animate-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="h-4 w-4 text-[#1a7a3a]" />
          <AlertDescription className="text-[#1a7a3a] font-medium">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        {/* Tab Navigation - Premium border-bottom tabs (genai-runs pattern) */}
        <div className="border-b border-slate-200 mb-6 sm:mb-8">
          <TabsList className="w-full sm:w-auto flex gap-0.5 sm:gap-1 -mb-px h-auto bg-transparent p-0 overflow-x-auto scrollbar-hide">
            <TabsTrigger
              value="general"
              className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-medium whitespace-nowrap border-b-2 transition-all touch-manipulation rounded-none data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 data-[state=inactive]:hover:border-slate-300 data-[state=inactive]:bg-transparent data-[state=active]:border-[var(--cloudact-mint-dark)] data-[state=active]:text-[#1a7a3a] data-[state=active]:bg-[var(--cloudact-mint)]/5 data-[state=active]:shadow-none min-w-fit"
            >
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">General</span>
              <span className="sm:hidden">General</span>
            </TabsTrigger>
            <TabsTrigger
              value="contact"
              className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-medium whitespace-nowrap border-b-2 transition-all touch-manipulation rounded-none data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 data-[state=inactive]:hover:border-slate-300 data-[state=inactive]:bg-transparent data-[state=active]:border-[var(--cloudact-mint-dark)] data-[state=active]:text-[#1a7a3a] data-[state=active]:bg-[var(--cloudact-mint)]/5 data-[state=active]:shadow-none min-w-fit"
            >
              <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Contact</span>
              <span className="sm:hidden">Contact</span>
            </TabsTrigger>
            <TabsTrigger
              value="backend"
              className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-medium whitespace-nowrap border-b-2 transition-all touch-manipulation rounded-none data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 data-[state=inactive]:hover:border-slate-300 data-[state=inactive]:bg-transparent data-[state=active]:border-[var(--cloudact-mint-dark)] data-[state=active]:text-[#1a7a3a] data-[state=active]:bg-[var(--cloudact-mint)]/5 data-[state=active]:shadow-none min-w-fit"
            >
              <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Backend</span>
              <span className="sm:hidden">Backend</span>
            </TabsTrigger>
            <TabsTrigger
              value="danger"
              className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-medium whitespace-nowrap border-b-2 transition-all touch-manipulation rounded-none data-[state=inactive]:border-transparent data-[state=inactive]:text-[#FF6C5E] data-[state=inactive]:hover:text-[#FF6C5E]/80 data-[state=inactive]:hover:border-[#FF6C5E]/50 data-[state=inactive]:bg-transparent data-[state=active]:border-[#FF6C5E] data-[state=active]:text-[#FF6C5E] data-[state=active]:bg-[#FF6C5E]/5 data-[state=active]:shadow-none min-w-fit"
            >
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Danger Zone</span>
              <span className="sm:hidden">Danger</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Organization Details - Premium Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900">Organization Details</h2>
              <p className="text-[12px] text-slate-500">
                Your organization name and unique identifier
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor="orgName" className="text-[13px] font-medium text-foreground">
              Organization Name <span className="text-[#FF6C5E]">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="orgName"
                type="text"
                value={orgName}
                onChange={(e) => { setOrgName(e.target.value); setError(null); }}
                placeholder="Enter organization name"
                maxLength={100}
                className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6] flex-1"
              />
              {hasOrgNameChanges && (
                <Button
                  onClick={handleSaveOrgName}
                  disabled={isSavingOrgName}
                  size="sm"
                  className="h-10 px-3 bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 font-medium rounded-lg"
                >
                  {isSavingOrgName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Displayed in sidebar and throughout the app (2-100 characters)
            </p>
          </div>

          {/* Organization Slug (Read-only) */}
          <div className="space-y-2">
            <Label htmlFor="orgSlugDisplay" className="text-[13px] font-medium text-foreground">
              Organization Slug
            </Label>
            <Input
              id="orgSlugDisplay"
              type="text"
              value={orgSlug}
              readOnly
              disabled
              className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
            />
            <p className="text-[12px] text-muted-foreground">
              Unique identifier used in URLs (cannot be changed)
            </p>
          </div>
        </div>
      </div>

      {/* Organization Branding - Premium Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900">Organization Logo</h2>
              <p className="text-[12px] text-slate-500">
                Upload or link your organization's logo (displayed in sidebar)
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <LogoUpload
            orgSlug={orgSlug}
            currentLogoUrl={logoUrl}
            onLogoChange={(newUrl) => setLogoUrl(newUrl)}
            onError={(err) => {
              setError(err)
              setTimeout(() => setError(null), 5000)
            }}
            onSuccess={(msg) => {
              setSuccess(msg)
              setTimeout(() => setSuccess(null), 4000)
            }}
          />
        </div>
      </div>

      {/* Organization Locale - Premium Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900">Locale Settings</h2>
              <p className="text-[12px] text-slate-500">
                Configure currency, timezone, date format, and fiscal year
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Currency Selection */}
          <div className="space-y-2">
            <Label htmlFor="currency" className="text-[13px] font-medium text-foreground">
              Currency <span className="text-[#FF6C5E]">*</span>
            </Label>
            <Select value={currency} onValueChange={(val) => { setCurrency(val); setError(null); }}>
              <SelectTrigger id="currency" className="h-10 text-[13px] border border-[#E5E5EA] rounded-lg hover:border-[#90FCA6] transition-colors">
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
            <p className="text-[12px] text-muted-foreground">
              All costs displayed in this currency
            </p>
          </div>

          {/* Timezone Selection */}
          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-[13px] font-medium text-foreground">
              Timezone <span className="text-[#FF6C5E]">*</span>
            </Label>
            <Select value={timezone} onValueChange={handleTimezoneChange}>
              <SelectTrigger id="timezone" className="h-10 text-[13px] border border-[#E5E5EA] rounded-lg hover:border-[#90FCA6] transition-colors">
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
            <p className="text-[12px] text-muted-foreground">
              Used for dashboards and pipeline schedules
            </p>
          </div>

          {/* Fiscal Year Start */}
          <div className="space-y-2">
            <Label htmlFor="fiscal-year" className="text-[13px] font-medium text-foreground">
              Fiscal Year Start
            </Label>
            <div className="flex gap-2">
              <Select value={fiscalYearStart.toString()} onValueChange={(val) => { setFiscalYearStart(parseInt(val)); setError(null); }}>
                <SelectTrigger id="fiscal-year" className="h-10 text-[13px] border border-[#E5E5EA] rounded-lg flex-1 hover:border-[#90FCA6] transition-colors">
                  <SelectValue placeholder="Select fiscal year start" />
                </SelectTrigger>
                <SelectContent>
                  {FISCAL_YEAR_OPTIONS.map((fy) => (
                    <SelectItem key={fy.month} value={fy.month.toString()}>
                      {fy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFiscalYearChanges && (
                <Button
                  onClick={handleSaveFiscalYear}
                  disabled={isSavingFiscalYear}
                  size="sm"
                  className="h-10 px-3 bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 font-medium rounded-lg"
                >
                  {isSavingFiscalYear ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Auto-suggested based on timezone
            </p>
          </div>

          {/* Date Format */}
          <div className="space-y-2">
            <Label htmlFor="date-format" className="text-[13px] font-medium text-foreground">
              Date Format
            </Label>
            <Select value={dateFormat} onValueChange={(val) => { setDateFormat(val); setError(null); }}>
              <SelectTrigger id="date-format" className="h-10 text-[13px] border border-[#E5E5EA] rounded-lg hover:border-[#90FCA6] transition-colors">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_DATE_FORMATS.map((df) => (
                  <SelectItem key={df.value} value={df.value}>
                    <span className="flex items-center gap-2">
                      {df.label}
                      <span className="text-muted-foreground text-xs">({df.example})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground">
              How dates are displayed throughout the app
            </p>
          </div>

          {hasLocaleChanges && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertDescription className="text-amber-800 text-[12px]">
                You have unsaved locale changes
              </AlertDescription>
            </Alert>
          )}
        </div>

        {hasLocaleChanges && (
          <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-6 border-t border-black/[0.04] flex gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="h-11 px-6 text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#B8FDCA] text-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
            <Button
              onClick={handleReset}
              disabled={isSaving}
              variant="outline"
              className="h-11 px-5 text-[12px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all"
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Information Note - Premium */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#90FCA6]/10 to-transparent border border-[#90FCA6]/20">
        <p className="text-[12px] text-slate-900/70 leading-relaxed">
          <strong className="text-[#1a7a3a] font-semibold">Note:</strong> Currency and timezone changes affect how data is displayed.
          Settings sync to BigQuery for cost calculations. All team members share these locale settings.
        </p>
      </div>
        </TabsContent>

        <TabsContent value="contact" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Contact Details - Premium Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
              <User className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900">Contact Details</h2>
              <p className="text-[12px] text-slate-500">
                Business contact person and address
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {loadingContactDetails ? (
            <div className="flex items-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#90FCA6]" />
              <span className="text-[13px] text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <>
              {/* Business Person Section */}
              <div className="space-y-4">
                <h3 className="text-[13px] font-medium text-slate-700">
                  Contact Person
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessPersonName" className="text-[12px] font-medium text-foreground">
                      Full Name
                    </Label>
                    <Input
                      id="businessPersonName"
                      type="text"
                      value={contactDetails.business_person_name || ""}
                      onChange={(e) => updateContactField("business_person_name", e.target.value)}
                      placeholder="John Smith"
                      className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessPersonPosition" className="text-[12px] font-medium text-foreground">
                      Position / Title
                    </Label>
                    <Input
                      id="businessPersonPosition"
                      type="text"
                      value={contactDetails.business_person_position || ""}
                      onChange={(e) => updateContactField("business_person_position", e.target.value)}
                      placeholder="CTO, Finance Manager"
                      className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessPersonDepartment" className="text-[12px] font-medium text-foreground">
                      Department
                    </Label>
                    <Input
                      id="businessPersonDepartment"
                      type="text"
                      value={contactDetails.business_person_department || ""}
                      onChange={(e) => updateContactField("business_person_department", e.target.value)}
                      placeholder="Engineering, Finance"
                      className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Info Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail" className="text-[12px] font-medium text-foreground">
                    Business Email
                  </Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={contactDetails.contact_email || ""}
                    onChange={(e) => updateContactField("contact_email", e.target.value)}
                    placeholder="contact@company.com"
                    className="h-10 px-3 text-[13px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactPhone" className="text-[12px] font-medium text-foreground">
                    Business Phone
                  </Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={contactDetails.contact_phone || ""}
                    onChange={(e) => updateContactField("contact_phone", e.target.value)}
                    placeholder="+1 234-567-8900"
                    className="h-10 px-3 text-[13px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                  />
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <h3 className="text-[13px] font-medium text-slate-700">
                  Business Address
                </h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="addressLine1" className="text-[12px] font-medium text-foreground">
                      Street Address
                    </Label>
                    <Input
                      id="addressLine1"
                      type="text"
                      value={contactDetails.business_address_line1 || ""}
                      onChange={(e) => updateContactField("business_address_line1", e.target.value)}
                      placeholder="123 Main Street"
                      className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="addressLine2" className="text-[12px] font-medium text-foreground">
                      Address Line 2 <span className="text-muted-foreground">(Optional)</span>
                    </Label>
                    <Input
                      id="addressLine2"
                      type="text"
                      value={contactDetails.business_address_line2 || ""}
                      onChange={(e) => updateContactField("business_address_line2", e.target.value)}
                      placeholder="Suite 100, Floor 2"
                      className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city" className="text-[12px] font-medium text-foreground">
                        City
                      </Label>
                      <Input
                        id="city"
                        type="text"
                        value={contactDetails.business_city || ""}
                        onChange={(e) => updateContactField("business_city", e.target.value)}
                        placeholder="San Francisco"
                        className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state" className="text-[12px] font-medium text-foreground">
                        State / Province
                      </Label>
                      <Input
                        id="state"
                        type="text"
                        value={contactDetails.business_state || ""}
                        onChange={(e) => updateContactField("business_state", e.target.value)}
                        placeholder="CA"
                        className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="postalCode" className="text-[12px] font-medium text-foreground">
                        Postal Code
                      </Label>
                      <Input
                        id="postalCode"
                        type="text"
                        value={contactDetails.business_postal_code || ""}
                        onChange={(e) => updateContactField("business_postal_code", e.target.value)}
                        placeholder="94102"
                        className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="country" className="text-[12px] font-medium text-foreground">
                        Country Code
                      </Label>
                      <Input
                        id="country"
                        type="text"
                        value={contactDetails.business_country || ""}
                        onChange={(e) => updateContactField("business_country", e.target.value.toUpperCase())}
                        placeholder="US"
                        maxLength={2}
                        className="h-10 px-3 text-[14px] border border-[#E5E5EA] rounded-lg focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6] uppercase"
                      />
                      <p className="text-[11px] text-muted-foreground">ISO 3166-1 (e.g., US, GB, IN)</p>
                    </div>
                  </div>
                </div>
              </div>

              {hasContactChanges && (
                <Alert className="bg-[#90FCA6]/15 border-[#90FCA6]/30 animate-in slide-in-from-top-2">
                  <AlertTriangle className="h-4 w-4 text-[#1a7a3a]" />
                  <AlertDescription className="text-[#1a7a3a] font-medium">
                    You have unsaved changes. Click Save to apply or Reset to discard.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-6 border-t border-black/[0.04] flex gap-3">
          <Button
            onClick={handleSaveContactDetails}
            disabled={isSavingContactDetails || !hasContactChanges}
            className="h-11 px-6 text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#B8FDCA] text-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50"
          >
            {isSavingContactDetails ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Contact Details
              </>
            )}
          </Button>

          {hasContactChanges && (
            <Button
              onClick={handleResetContactDetails}
              disabled={isSavingContactDetails}
              variant="outline"
              className="h-11 px-5 text-[12px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all"
            >
              Reset
            </Button>
          )}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="backend" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Backend Connection - Premium Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900">Backend Connection</h2>
              <p className="text-[12px] text-slate-500">
                BigQuery backend status and API key
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-4">
          {loadingBackendStatus ? (
            <div className="flex items-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#90FCA6]" />
              <span className="text-[13px] text-muted-foreground">Checking connection...</span>
            </div>
          ) : (
            <>
              {/* Backend Error Alert */}
              {backendError && (
                <Alert variant="destructive" className="border-[#FF6C5E]/30 bg-[#FF6C5E]/10 animate-in slide-in-from-top-2">
                  <AlertTriangle className="h-4 w-4 text-[#FF6C5E]" />
                  <AlertDescription className="text-[#FF6C5E] font-medium">
                    {backendError}
                  </AlertDescription>
                </Alert>
              )}

              {/* Connection Status */}
              <div className={`flex items-center justify-between p-5 border-2 rounded-2xl transition-all ${
                backendOnboarded && apiKeyValid !== false
                  ? 'border-[#90FCA6]/30 bg-gradient-to-br from-[#90FCA6]/10 to-white'
                  : 'border-[#FF6C5E]/30 bg-gradient-to-br from-[#FF6C5E]/10 to-white'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`relative h-4 w-4 rounded-full ${
                    backendOnboarded && apiKeyValid !== false ? 'bg-[#1a7a3a]' : 'bg-[#FF6C5E]'
                  }`}>
                    <div className={`absolute inset-0 rounded-full ${
                      backendOnboarded && apiKeyValid !== false ? 'bg-[#1a7a3a]' : 'bg-[#FF6C5E]'
                    } animate-ping opacity-75`} />
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold text-slate-900">
                      {backendOnboarded && apiKeyValid !== false ? "Connected" : "Not Connected"}
                    </p>
                    <p className="text-[12px] text-slate-600">
                      {apiKeyValid === false
                        ? "API key is invalid or inactive in backend"
                        : backendOnboarded
                          ? "BigQuery dataset is active and synced"
                          : "Backend onboarding required"}
                    </p>
                  </div>
                </div>
                {backendOnboarded && apiKeyValid !== false && (
                  <Badge className="flex-shrink-0 bg-[#90FCA6]/15 text-[#1a7a3a] border-0 px-3 py-1 font-semibold">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                )}
                {apiKeyValid === false && (
                  <Badge className="flex-shrink-0 bg-[#FF6C5E] text-white border-0 px-3 py-1 font-semibold">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Invalid
                  </Badge>
                )}
              </div>

              {/* API Key Fingerprint */}
              {apiKeyFingerprint && (
                <div className={`flex items-center justify-between p-5 border-2 rounded-2xl transition-all ${
                  apiKeyValid === false
                    ? 'border-[#FF6C5E]/30 bg-gradient-to-br from-[#FF6C5E]/10 to-white'
                    : 'border-[#90FCA6]/30 bg-gradient-to-br from-[#90FCA6]/10 to-white'
                }`}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      apiKeyValid === false ? 'bg-[#FF6C5E]/15' : 'bg-[#90FCA6]/15'
                    }`}>
                      <Key className={`h-5 w-5 ${apiKeyValid === false ? 'text-[#FF6C5E]' : 'text-[#1a7a3a]'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-slate-900">API Key</p>
                      <p className={`text-[12px] font-mono truncate ${apiKeyValid === false ? 'text-[#FF6C5E]' : 'text-slate-600'}`}>
                        ••••••••{apiKeyFingerprint}
                        {apiKeyValid === false && " (invalid)"}
                      </p>
                    </div>
                  </div>
                  {apiKeyValid === true && (
                    <Badge className="flex-shrink-0 ml-3 bg-[#90FCA6]/15 text-[#1a7a3a] border-0 font-semibold">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Valid
                    </Badge>
                  )}
                </div>
              )}

              {/* Help text for invalid API key */}
              {apiKeyValid === false && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[12px] text-slate-600">
                    <strong className="text-slate-700">How to fix:</strong> Your API key may have been rotated or deactivated.
                    Try "Resync Connection" below or contact support.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-6 border-t border-black/[0.04] flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Button
              onClick={handleResync}
              disabled={isResyncing || loadingBackendStatus}
              className={`h-11 px-6 text-[12px] font-semibold rounded-xl transition-all ${
                (!backendOnboarded || apiKeyValid === false)
                  ? "bg-[#90FCA6] hover:bg-[#B8FDCA] text-slate-900 shadow-sm hover:shadow-md"
                  : "border-2 border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:shadow-sm"
              }`}
            >
              {isResyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {(!backendOnboarded || apiKeyValid === false) ? "Re-onboarding..." : "Resyncing..."}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {(!backendOnboarded || apiKeyValid === false) ? "Re-onboard & Regenerate API Key" : "Resync Connection"}
                </>
              )}
            </Button>
            <p className="text-[11px] text-slate-900/50 mt-2">
              {(!backendOnboarded || apiKeyValid === false)
                ? "Re-onboard your organization to generate a new API key and restore backend connection"
                : "Re-synchronize your organization's locale and subscription data with the backend"}
            </p>
          </div>

        </div>
      </div>
        </TabsContent>

        <TabsContent value="danger" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Danger Zone Section - Premium */}
      <div>
        {/* Premium Danger Zone Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#FF6C5E] via-[#FF6C5E] to-[#E55A3C] flex items-center justify-center shadow-lg shadow-[#FF6C5E]/25 ring-4 ring-[#FF6C5E]/10">
            <AlertTriangle className="h-7 w-7 text-white" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-[#FF6C5E] tracking-tight">Danger Zone</h2>
            <p className="text-[12px] text-slate-900/50 mt-1">
              Irreversible actions that require careful consideration
            </p>
          </div>
        </div>

        {/* Owned Organizations Management */}
        {loadingOwnedOrgs ? (
          <div className="bg-white rounded-2xl border-2 border-[#FF6C5E]/20 shadow-sm overflow-hidden">
            <div className="p-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF6C5E]" />
                <span className="ml-2 text-[14px] text-slate-900/50">Loading organizations...</span>
              </div>
            </div>
          </div>
        ) : ownedOrgs.length > 0 ? (
          <div className="bg-white rounded-2xl border-2 border-[#FF6C5E]/20 shadow-sm overflow-hidden mb-6">
            <div className="p-6 sm:p-8 border-b border-[#FF6C5E]/10 bg-gradient-to-r from-[#FF6C5E]/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#FF6C5E]/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-[#FF6C5E]" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#FF6C5E] tracking-tight">Organizations You Own</h3>
                  <p className="text-[12px] text-slate-900/50">
                    Transfer ownership or delete before deleting your account
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 sm:p-8 space-y-4">
              {ownedOrgs.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between p-4 sm:p-5 border-2 border-black/[0.04] rounded-2xl bg-gradient-to-br from-white to-[#FF6C5E]/[0.02] hover:border-[#FF6C5E]/20 transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-black/[0.03] flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-slate-900/40" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-slate-900">{org.org_name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-900/50">
                        <Users className="h-3 w-3" />
                        <span>{org.member_count} member{org.member_count !== 1 ? "s" : ""}</span>
                        <Badge className="ml-1 bg-[#FF6C5E]/10 text-[#FF6C5E] border-0 text-xs font-semibold px-2 py-0.5">Owner</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {org.has_other_members ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openTransferDialog(org)}
                        className="h-11 px-5 text-[12px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all"
                      >
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transfer
                      </Button>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteOrgDialog(org)}
                      className="h-11 px-5 text-[12px] font-semibold rounded-xl bg-[#FF6C5E] hover:bg-[#E55A4E] text-white shadow-sm hover:shadow-md transition-all"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Transfer Ownership Dialog */}
        <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transfer Ownership</DialogTitle>
              <DialogDescription>
                Transfer ownership of "{selectedOrgForTransfer?.org_name}" to another member.
                You will become a collaborator after the transfer.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {loadingTransferMembers ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : transferMembers.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No other members available. Invite someone to the organization first, or delete the organization instead.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <Label>Select new owner</Label>
                  <Select value={selectedNewOwner} onValueChange={setSelectedNewOwner}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a member" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            <UserCog className="h-4 w-4" />
                            <span>{member.full_name || member.email}</span>
                            <span className="text-muted-foreground">({member.role})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleTransferOwnership}
                disabled={!selectedNewOwner || isTransferring}
              >
                {isTransferring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  "Transfer Ownership"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Organization Dialog */}
        <Dialog open={deleteOrgDialogOpen} onOpenChange={setDeleteOrgDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete Organization</DialogTitle>
              <DialogDescription>
                This will permanently delete "{selectedOrgForDelete?.org_name}" and all associated data.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Alert variant="destructive" className="mb-4 border-[#FF6C5E]/30 bg-[#FF6C5E]/5">
                <AlertTriangle className="h-4 w-4 text-[#FF6C5E]" />
                <AlertDescription>
                  All organization data, members, invites, and settings will be permanently deleted.
                  {selectedOrgForDelete?.member_count && selectedOrgForDelete.member_count > 1 && (
                    <span className="block mt-1">
                      This will affect {selectedOrgForDelete.member_count - 1} other member(s).
                    </span>
                  )}
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="confirmName">
                  Type <span className="font-bold">{selectedOrgForDelete?.org_name}</span> to confirm
                </Label>
                <Input
                  id="confirmName"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder="Type organization name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOrgDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteOrg}
                disabled={
                  !selectedOrgForDelete?.org_name ||
                  deleteConfirmName.toLowerCase() !== selectedOrgForDelete.org_name.toLowerCase() ||
                  isDeletingOrg
                }
              >
                {isDeletingOrg ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Organization
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Account Deletion Card - Premium */}
        <div className="bg-white rounded-2xl border-2 border-[#FF6C5E]/20 shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-[#FF6C5E]/10 bg-gradient-to-r from-[#FF6C5E]/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#FF6C5E]/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-[#FF6C5E]" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-[#FF6C5E] tracking-tight">Delete Account</h3>
                <p className="text-[12px] text-slate-900/50">
                  Permanently delete your account and all associated data
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8">
            {deletionRequested ? (
              <div className="p-5 rounded-2xl bg-gradient-to-r from-[#90FCA6]/10 to-transparent border border-[#90FCA6]/20">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-[#1a7a3a] mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#1a7a3a]">Verification email sent!</p>
                    <p className="text-[12px] text-slate-900/60 mt-1">
                      Please check your inbox and click the confirmation link to complete account deletion.
                      The link will expire in 30 minutes.
                    </p>
                  </div>
                </div>
              </div>
            ) : ownedOrgs.length > 0 ? (
              <div className="p-5 rounded-2xl bg-gradient-to-r from-[#FF6C5E]/10 to-transparent border border-[#FF6C5E]/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-[#FF6C5E] mt-0.5" />
                  <p className="text-[12px] text-[#FF6C5E] font-medium">
                    You own {ownedOrgs.length} organization{ownedOrgs.length !== 1 ? "s" : ""}.
                    Please transfer ownership or delete them before deleting your account.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-gradient-to-r from-[#FF6C5E]/10 to-transparent border border-[#FF6C5E]/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-[#FF6C5E] mt-0.5" />
                  <p className="text-[12px] text-[#FF6C5E] font-medium">
                    Deleting your account will permanently remove you from all organizations and cannot be
                    undone. Your data will be lost forever.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-4 border-t border-black/[0.04]">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={ownedOrgs.length > 0 || isRequestingDeletion || deletionRequested}
                  className="h-11 px-6 text-[12px] font-semibold rounded-xl bg-[#FF6C5E] hover:bg-[#E55A4E] text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                >
                  {isRequestingDeletion ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Requesting...
                    </>
                  ) : deletionRequested ? (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Check Email
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Account
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Request Account Deletion</AlertDialogTitle>
                  <AlertDialogDescription>
                    We will send a verification email to <span className="font-medium">{email}</span>.
                    You must click the link in the email to confirm the deletion.
                    <span className="block mt-2 text-destructive">
                      This action is permanent and cannot be undone.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRequestAccountDeletion}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Send Verification Email
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
