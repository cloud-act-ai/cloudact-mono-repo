"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
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
  Save,
  AlertTriangle,
  Globe,
  DollarSign,
  CheckCircle2,
  Clock,
  Building2,
  Trash2,
  ArrowRightLeft,
  Users,
  User,
  Mail,
  UserCog,
  RefreshCw,
  Server,
  Key,
  ImageIcon,
  Link as LinkIcon,
  Phone,
  MapPin,
} from "lucide-react"
import Image from "next/image"
import { logError } from "@/lib/utils"
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES, FISCAL_YEAR_OPTIONS, getFiscalYearFromTimezone } from "@/lib/i18n/constants"
import {
  getOrgLocale,
  updateOrgLocale,
  updateFiscalYear,
  getOrgLogo,
  updateOrgLogo,
  getOrgContactDetails,
  updateOrgContactDetails,
  type OrgContactDetails,
} from "@/actions/organization-locale"
import {
  getOwnedOrganizations,
  getEligibleTransferMembers,
  transferOwnership,
  deleteOrganization,
  requestAccountDeletion,
} from "@/actions/account"
import {
  checkBackendOnboarding,
  syncSubscriptionToBackend,
  onboardToBackend,
  getOrgDataForReonboarding,
} from "@/actions/backend-onboarding"
import { getBillingInfo } from "@/actions/stripe"

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

  // Locale fields
  const [currency, setCurrency] = useState("USD")
  const [timezone, setTimezone] = useState("UTC")
  const [logoUrl, setLogoUrl] = useState("")
  const [fiscalYearStart, setFiscalYearStart] = useState(1) // 1=Jan, 4=Apr, 7=Jul, 10=Oct

  // Track original values to detect changes
  const [originalCurrency, setOriginalCurrency] = useState("USD")
  const [originalTimezone, setOriginalTimezone] = useState("UTC")
  const [originalLogoUrl, setOriginalLogoUrl] = useState("")
  const [originalFiscalYearStart, setOriginalFiscalYearStart] = useState(1)
  const [isSavingLogo, setIsSavingLogo] = useState(false)
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
  const [isBillingSyncing, setIsBillingSyncing] = useState(false)

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
      const result = await checkBackendOnboarding(orgSlug)
      setBackendOnboarded(result.onboarded)
      setApiKeyFingerprint(result.apiKeyFingerprint || null)
      setApiKeyValid(result.apiKeyValid)
      setBackendError(result.error || null)
    } catch (err: unknown) {
      console.error("Failed to load backend status:", err)
      setBackendError("Failed to check backend connection status")
    } finally {
      setLoadingBackendStatus(false)
    }
  }, [orgSlug])

  // Handle resync backend connection
  const handleResync = async () => {
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
          // After successful re-onboarding, sync Stripe billing data to BigQuery
          try {
            // Fetch current billing info from Stripe
            const { data: billingInfo, error: billingError } = await getBillingInfo(orgSlug)

            if (billingError || !billingInfo) {
              console.warn("[Re-onboarding] Failed to fetch billing info:", billingError)
              // Non-blocking - show success but warn about billing sync
              setSuccess(
                onboardResult.apiKey
                  ? `Backend connection restored! New API key: ${onboardResult.apiKey.slice(0, 20)}... (Save this key!) Warning: Billing sync failed - ${billingError || "no billing data"}`
                  : `Backend connection restored! Warning: Billing sync failed - ${billingError || "no billing data"}`
              )
              await loadBackendStatus()
              setTimeout(() => setSuccess(null), 10000)
              return
            }

            // Extract subscription details if available
            if (billingInfo.subscription) {
              const sub = billingInfo.subscription

              // Get actual plan limits from Supabase (set by Stripe webhooks)
              const supabase = createClient()
              const { data: orgLimits } = await supabase
                .from("organizations")
                .select("seat_limit, providers_limit, pipelines_per_day_limit")
                .eq("org_slug", orgSlug)
                .single()

              // Use actual limits from Supabase (not hardcoded defaults!)
              const dailyLimit = orgLimits?.pipelines_per_day_limit || 6
              const monthlyLimit = dailyLimit * 30

              // Sync billing data to backend with actual limits
              const syncResult = await syncSubscriptionToBackend({
                orgSlug,
                planName: sub.plan.id,
                billingStatus: sub.status,
                dailyLimit,
                monthlyLimit,
                seatLimit: orgLimits?.seat_limit,
                providersLimit: orgLimits?.providers_limit,
                syncType: 'reconciliation',
              })

              if (syncResult.success) {
                setSuccess(
                  onboardResult.apiKey
                    ? `Backend connection restored! New API key: ${onboardResult.apiKey.slice(0, 20)}... (Save this key!) Billing data synced.`
                    : "Backend connection restored and billing data synced successfully!"
                )
              } else {
                console.warn("[Re-onboarding] Billing sync failed:", syncResult.error)
                setSuccess(
                  onboardResult.apiKey
                    ? `Backend connection restored! New API key: ${onboardResult.apiKey.slice(0, 20)}... (Save this key!) Warning: Billing sync ${syncResult.queued ? 'queued for retry' : 'failed'}.`
                    : `Backend connection restored! Warning: Billing sync ${syncResult.queued ? 'queued for retry' : 'failed'}.`
                )
              }
            } else {
              // No active subscription - just show re-onboarding success
              setSuccess(
                onboardResult.apiKey
                  ? `Backend connection restored! New API key: ${onboardResult.apiKey.slice(0, 20)}... (Save this key!) No active subscription to sync.`
                  : "Backend connection restored successfully! No active subscription to sync."
              )
            }
          } catch (syncErr: unknown) {
            console.error("[Re-onboarding] Billing sync error:", syncErr)
            setSuccess(
              onboardResult.apiKey
                ? `Backend connection restored! New API key: ${onboardResult.apiKey.slice(0, 20)}... (Save this key!) Warning: Billing sync error.`
                : "Backend connection restored! Warning: Billing sync error."
            )
          }

          await loadBackendStatus()
          // Keep success message longer for API key display
          setTimeout(() => setSuccess(null), 10000)
        } else {
          setError(onboardResult.error || "Failed to re-onboard organization")
        }
      } else {
        // Just sync subscription/locale data to backend
        // First, get actual billing info and limits from Supabase
        const supabase = createClient()
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("plan, billing_status, seat_limit, providers_limit, pipelines_per_day_limit")
          .eq("org_slug", orgSlug)
          .single()

        if (orgError || !orgData) {
          setError("Failed to fetch organization data")
          return
        }

        // Use actual limits from Supabase (not hardcoded defaults!)
        const dailyLimit = orgData.pipelines_per_day_limit || 6
        const monthlyLimit = dailyLimit * 30

        const result = await syncSubscriptionToBackend({
          orgSlug,
          billingStatus: orgData.billing_status || "active",
          planName: orgData.plan || "starter",
          dailyLimit,
          monthlyLimit,
          seatLimit: orgData.seat_limit,
          providersLimit: orgData.providers_limit,
          syncType: "reconciliation",
        })

        if (result.success) {
          setSuccess(`Backend connection resynced! (Daily limit: ${dailyLimit}, Monthly: ${monthlyLimit})`)
          await loadBackendStatus()
          setTimeout(() => setSuccess(null), 4000)
        } else {
          setError(result.error || "Failed to resync backend connection")
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resync backend connection")
    } finally {
      setIsResyncing(false)
    }
  }

  // Handle billing sync only (without re-onboarding)
  const handleSyncBilling = async () => {
    setIsBillingSyncing(true)
    setError(null)
    setSuccess(null)

    try {
      // Fetch current billing info from Stripe
      const { data: billingInfo, error: billingError } = await getBillingInfo(orgSlug)

      if (billingError || !billingInfo) {
        setError(`Failed to fetch billing info: ${billingError || "no billing data"}`)
        return
      }

      // If there's an active subscription, sync to backend
      if (billingInfo.subscription) {
        const sub = billingInfo.subscription

        // Get actual plan limits from Supabase (set by Stripe webhooks)
        const supabase = createClient()
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("seat_limit, providers_limit, pipelines_per_day_limit")
          .eq("org_slug", orgSlug)
          .single()

        if (orgError || !orgData) {
          setError("Failed to fetch organization limits")
          return
        }

        // Use actual limits from Supabase (not hardcoded defaults!)
        const dailyLimit = orgData.pipelines_per_day_limit || 6
        const monthlyLimit = dailyLimit * 30  // Monthly = daily * 30

        // Sync billing data to backend with actual limits
        const syncResult = await syncSubscriptionToBackend({
          orgSlug,
          planName: sub.plan.id,
          billingStatus: sub.status,
          dailyLimit,
          monthlyLimit,
          seatLimit: orgData.seat_limit,
          providersLimit: orgData.providers_limit,
          syncType: 'reconciliation',
        })

        if (syncResult.success) {
          setSuccess(`Billing data synced successfully! (Daily limit: ${dailyLimit}, Monthly: ${monthlyLimit})`)
        } else {
          setError(`Billing sync failed: ${syncResult.error || "Unknown error"}`)
        }
      } else {
        setSuccess("No active subscription to sync.")
      }

      setTimeout(() => setSuccess(null), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sync billing data")
    } finally {
      setIsBillingSyncing(false)
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
      console.error("Failed to load contact details:", err)
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
      console.error("Failed to load owned orgs:", err)
    } finally {
      setLoadingOwnedOrgs(false)
    }
  }, [])

  const fetchLocale = useCallback(async () => {
    try {
      setIsLoading(true)
      const [localeResult, logoResult] = await Promise.all([
        getOrgLocale(orgSlug),
        getOrgLogo(orgSlug)
      ])

      if (!localeResult.success || !localeResult.locale) {
        setError(localeResult.error || "Failed to fetch organization locale")
        return
      }

      // Set current values
      setCurrency(localeResult.locale.default_currency)
      setTimezone(localeResult.locale.default_timezone)

      // Track original values
      setOriginalCurrency(localeResult.locale.default_currency)
      setOriginalTimezone(localeResult.locale.default_timezone)

      // Set fiscal year (default based on timezone if not set)
      const fiscalYear = localeResult.locale.fiscal_year_start_month || getFiscalYearFromTimezone(localeResult.locale.default_timezone)
      setFiscalYearStart(fiscalYear)
      setOriginalFiscalYearStart(fiscalYear)

      // Set logo URL
      if (logoResult.success) {
        setLogoUrl(logoResult.logoUrl || "")
        setOriginalLogoUrl(logoResult.logoUrl || "")
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
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setEmail(user.email || "")
      await loadOwnedOrganizations()
    } catch (err: unknown) {
      console.error("Error loading user:", err)
    }
  }, [loadOwnedOrganizations, router])

  useEffect(() => {
    fetchLocale()
    loadUserAndOrgs()
    loadBackendStatus()
    loadContactDetails()
  }, [fetchLocale, loadUserAndOrgs, loadBackendStatus, loadContactDetails])

  const hasLocaleChanges = currency !== originalCurrency || timezone !== originalTimezone
  const hasLogoChanges = logoUrl !== originalLogoUrl
  const hasFiscalYearChanges = fiscalYearStart !== originalFiscalYearStart
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

  const handleSaveLogo = async () => {
    if (!hasLogoChanges) return

    setIsSavingLogo(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await updateOrgLogo(orgSlug, logoUrl || null)

      if (!result.success) {
        setError(result.error || "Failed to update logo")
        return
      }

      setOriginalLogoUrl(logoUrl)
      setSuccess("Logo updated successfully!")
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSavingLogo(false)
    }
  }

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
    setError(null)
    setSuccess(null)

    if (!hasLocaleChanges) {
      setError("No changes to save")
      return
    }

    setIsSaving(true)

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
    } catch (err: unknown) {
      console.error("Failed to load transfer members:", err)
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Organization Settings</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          Manage your organization locale and settings
        </p>
      </div>

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

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full sm:w-auto flex-wrap touch-manipulation">
          <TabsTrigger value="general" className="cursor-pointer">General</TabsTrigger>
          <TabsTrigger value="contact" className="cursor-pointer">Contact Details</TabsTrigger>
          <TabsTrigger value="backend" className="cursor-pointer">Backend</TabsTrigger>
          <TabsTrigger value="danger" className="text-[#FF6E50] data-[state=active]:text-[#FF6E50] cursor-pointer">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
      {/* Organization Branding */}
      <div className="metric-card shadow-sm">
        <div className="metric-card-header mb-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-[22px] font-bold text-black">Organization Branding</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">
            Customize your organization&apos;s appearance in the sidebar
          </p>
        </div>

        <div className="metric-card-content space-y-4 sm:space-y-6">
          {/* Logo Preview & URL Input */}
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Logo Preview */}
            <div className="flex-shrink-0">
              <Label className="text-[13px] sm:text-[15px] font-medium text-foreground mb-2 block">
                Logo Preview
              </Label>
              <div className="h-20 w-20 rounded-lg border-2 border-dashed border-[#E5E5EA] flex items-center justify-center bg-[#007A78]/5 overflow-hidden">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Organization logo"
                    width={80}
                    height={80}
                    className="object-contain max-h-full max-w-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      setLogoUrl("")
                    }}
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Logo URL Input */}
            <div className="flex-1 space-y-2">
              <Label htmlFor="logoUrl" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                Logo URL
              </Label>
              <Input
                id="logoUrl"
                type="url"
                value={logoUrl}
                onChange={(e) => { setLogoUrl(e.target.value); setError(null); }}
                placeholder="https://example.com/logo.png"
                className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
              />
              <p className="text-[13px] text-muted-foreground">
                Enter a URL to your organization&apos;s logo (PNG, JPG, SVG). Must be HTTPS.
                The logo will appear in the sidebar next to your organization name.
              </p>
            </div>
          </div>

          {hasLogoChanges && (
            <Alert className="bg-[#007A78]/5 border-[#007A78]/20">
              <AlertTriangle className="h-4 w-4 text-[#007A78]" />
              <AlertDescription className="text-[#005F5D]">
                Logo URL has been changed. Click Save Logo to apply.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="pt-4 sm:pt-6 border-t border-border flex gap-3">
          <Button
            onClick={handleSaveLogo}
            disabled={isSavingLogo || !hasLogoChanges}
            className="console-button-primary h-11 px-4"
          >
            {isSavingLogo ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Logo
              </>
            )}
          </Button>

          {hasLogoChanges && (
            <Button
              onClick={() => setLogoUrl(originalLogoUrl)}
              disabled={isSavingLogo}
              variant="outline"
              className="console-button-secondary h-11 px-4"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Organization Locale */}
      <div className="metric-card shadow-sm">
        <div className="metric-card-header mb-6">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-[22px] font-bold text-black">Organization Locale</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">
            Configure currency and timezone for your organization. These settings affect all cost
            calculations and time displays.
          </p>
        </div>

        <div className="metric-card-content space-y-4 sm:space-y-6">
          {/* Currency Selection */}
          <div className="space-y-2">
            <Label htmlFor="currency" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Currency <span className="text-[#FF6E50]">*</span>
            </Label>
            <Select value={currency} onValueChange={(val) => { setCurrency(val); setError(null); }}>
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
            <p className="text-[13px] text-muted-foreground">
              All costs and billing will be displayed in this currency. This setting affects cost
              calculations across integrations and analytics.
            </p>
          </div>

          <Separator />

          {/* Timezone Selection */}
          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timezone <span className="text-[#FF6E50]">*</span>
            </Label>
            <Select value={timezone} onValueChange={handleTimezoneChange}>
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
            <p className="text-[13px] text-muted-foreground">
              Used for displaying timestamps in dashboards, reports, and activity logs. Pipeline
              schedules and billing dates use this timezone.
            </p>
          </div>

          {/* Fiscal Year Start */}
          <div className="space-y-2">
            <Label htmlFor="fiscal-year" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Fiscal Year Start
            </Label>
            <div className="flex gap-3">
              <Select value={fiscalYearStart.toString()} onValueChange={(val) => { setFiscalYearStart(parseInt(val)); setError(null); }}>
                <SelectTrigger id="fiscal-year" className="h-10 text-[15px] border border-[#E5E5EA] rounded-lg flex-1">
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
              <Button
                onClick={handleSaveFiscalYear}
                disabled={isSavingFiscalYear || !hasFiscalYearChanges}
                className="h-11 px-4 bg-[#007A78] hover:bg-[#006664] text-white text-[15px] font-semibold rounded-xl"
              >
                {isSavingFiscalYear ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              When your fiscal year begins. Auto-suggested based on timezone: India/Japan/UK = April, Australia = July, others = January.
              Affects cost analytics reporting periods.
            </p>
          </div>

          {hasLocaleChanges && (
            <Alert className="bg-[#007A78]/5 border-[#007A78]/20">
              <AlertTriangle className="h-4 w-4 text-[#007A78]" />
              <AlertDescription className="text-[#005F5D]">
                You have unsaved changes. Click Save to apply or Reset to discard.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="pt-4 sm:pt-6 border-t border-border flex gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasLocaleChanges}
            className="console-button-primary h-11 px-4"
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

          {hasLocaleChanges && (
            <Button
              onClick={handleReset}
              disabled={isSaving}
              variant="outline"
              className="console-button-secondary h-11 px-4"
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
        </TabsContent>

        <TabsContent value="contact" className="space-y-6">
      {/* Contact Details */}
      <div className="metric-card shadow-sm">
        <div className="metric-card-header mb-6">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-[22px] font-bold text-black">Contact Details</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">
            Business contact person and address for your organization
          </p>
        </div>

        <div className="metric-card-content space-y-6">
          {loadingContactDetails ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[#007A78]" />
              <span className="text-[15px] text-muted-foreground">Loading contact details...</span>
            </div>
          ) : (
            <>
              {/* Business Person Section */}
              <div className="space-y-4">
                <h3 className="text-[15px] font-medium text-black flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-muted-foreground" />
                  Business Contact Person
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessPersonName" className="text-[13px] font-medium text-foreground">
                      Full Name
                    </Label>
                    <Input
                      id="businessPersonName"
                      type="text"
                      value={contactDetails.business_person_name || ""}
                      onChange={(e) => updateContactField("business_person_name", e.target.value)}
                      placeholder="John Smith"
                      className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessPersonPosition" className="text-[13px] font-medium text-foreground">
                      Position / Title
                    </Label>
                    <Input
                      id="businessPersonPosition"
                      type="text"
                      value={contactDetails.business_person_position || ""}
                      onChange={(e) => updateContactField("business_person_position", e.target.value)}
                      placeholder="CTO, Finance Manager"
                      className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessPersonDepartment" className="text-[13px] font-medium text-foreground">
                      Department
                    </Label>
                    <Input
                      id="businessPersonDepartment"
                      type="text"
                      value={contactDetails.business_person_department || ""}
                      onChange={(e) => updateContactField("business_person_department", e.target.value)}
                      placeholder="Engineering, Finance"
                      className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact Info Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Business Email
                  </Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={contactDetails.contact_email || ""}
                    onChange={(e) => updateContactField("contact_email", e.target.value)}
                    placeholder="contact@company.com"
                    className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactPhone" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Business Phone
                  </Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={contactDetails.contact_phone || ""}
                    onChange={(e) => updateContactField("contact_phone", e.target.value)}
                    placeholder="+1 234-567-8900"
                    className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                  />
                </div>
              </div>

              <Separator />

              {/* Address Section */}
              <div className="space-y-4">
                <h3 className="text-[15px] font-medium text-black flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Business Address
                </h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="addressLine1" className="text-[13px] font-medium text-foreground">
                      Street Address
                    </Label>
                    <Input
                      id="addressLine1"
                      type="text"
                      value={contactDetails.business_address_line1 || ""}
                      onChange={(e) => updateContactField("business_address_line1", e.target.value)}
                      placeholder="123 Main Street"
                      className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="addressLine2" className="text-[13px] font-medium text-foreground">
                      Address Line 2 <span className="text-muted-foreground">(Optional)</span>
                    </Label>
                    <Input
                      id="addressLine2"
                      type="text"
                      value={contactDetails.business_address_line2 || ""}
                      onChange={(e) => updateContactField("business_address_line2", e.target.value)}
                      placeholder="Suite 100, Floor 2"
                      className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city" className="text-[13px] font-medium text-foreground">
                        City
                      </Label>
                      <Input
                        id="city"
                        type="text"
                        value={contactDetails.business_city || ""}
                        onChange={(e) => updateContactField("business_city", e.target.value)}
                        placeholder="San Francisco"
                        className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state" className="text-[13px] font-medium text-foreground">
                        State / Province
                      </Label>
                      <Input
                        id="state"
                        type="text"
                        value={contactDetails.business_state || ""}
                        onChange={(e) => updateContactField("business_state", e.target.value)}
                        placeholder="CA"
                        className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="postalCode" className="text-[13px] font-medium text-foreground">
                        Postal Code
                      </Label>
                      <Input
                        id="postalCode"
                        type="text"
                        value={contactDetails.business_postal_code || ""}
                        onChange={(e) => updateContactField("business_postal_code", e.target.value)}
                        placeholder="94102"
                        className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="country" className="text-[13px] font-medium text-foreground">
                        Country Code
                      </Label>
                      <Input
                        id="country"
                        type="text"
                        value={contactDetails.business_country || ""}
                        onChange={(e) => updateContactField("business_country", e.target.value.toUpperCase())}
                        placeholder="US"
                        maxLength={2}
                        className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#007A78] focus:ring-1 focus:ring-[#007A78] uppercase"
                      />
                      <p className="text-[11px] text-muted-foreground">ISO 3166-1 (e.g., US, GB, IN)</p>
                    </div>
                  </div>
                </div>
              </div>

              {hasContactChanges && (
                <Alert className="bg-[#007A78]/5 border-[#007A78]/20">
                  <AlertTriangle className="h-4 w-4 text-[#007A78]" />
                  <AlertDescription className="text-[#005F5D]">
                    You have unsaved changes. Click Save to apply or Reset to discard.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <div className="pt-4 sm:pt-6 border-t border-border flex gap-3">
          <Button
            onClick={handleSaveContactDetails}
            disabled={isSavingContactDetails || !hasContactChanges}
            className="console-button-primary h-11 px-4"
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
              className="console-button-secondary h-11 px-4"
            >
              Reset
            </Button>
          )}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="backend" className="space-y-6">
      {/* Backend Connection */}
      <div className="metric-card shadow-sm">
        <div className="metric-card-header mb-6">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-[22px] font-bold text-black">Backend Connection</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">
            Status of your BigQuery backend connection and API key
          </p>
        </div>

        <div className="metric-card-content space-y-4">
          {loadingBackendStatus ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[#007A78]" />
              <span className="text-[15px] text-muted-foreground">Checking connection status...</span>
            </div>
          ) : (
            <>
              {/* Backend Error Alert */}
              {backendError && (
                <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
                  <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
                  <AlertDescription className="text-[#FF6E50]">
                    {backendError}
                  </AlertDescription>
                </Alert>
              )}

              {/* Connection Status */}
              <div className={`flex items-center justify-between p-4 border rounded-xl ${
                backendOnboarded && apiKeyValid !== false
                  ? 'border-border bg-[#007A78]/5'
                  : 'border-[#FF6E50]/30 bg-[#FF6E50]/5'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${
                    backendOnboarded && apiKeyValid !== false ? 'bg-[#007A78]' : 'bg-[#FF6E50]'
                  }`} />
                  <div>
                    <p className="text-[15px] font-medium text-black">
                      {backendOnboarded && apiKeyValid !== false ? "Connected" : "Not Connected"}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {apiKeyValid === false
                        ? "API key is invalid or inactive in backend"
                        : backendOnboarded
                          ? "BigQuery dataset is active and synced"
                          : "Backend onboarding required"}
                    </p>
                  </div>
                </div>
                {backendOnboarded && apiKeyValid !== false && (
                  <Badge className="flex-shrink-0 bg-[#007A78]/10 text-[#007A78] border-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                )}
                {apiKeyValid === false && (
                  <Badge className="flex-shrink-0 bg-[#FF6E50]/10 text-[#FF6E50] border-0">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Invalid
                  </Badge>
                )}
              </div>

              {/* API Key Fingerprint */}
              {apiKeyFingerprint && (
                <div className={`flex items-center justify-between p-4 border rounded-xl ${
                  apiKeyValid === false ? 'border-[#FF6E50]/30 bg-[#FF6E50]/5' : 'border-border bg-[#007A78]/5'
                }`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Key className={`h-5 w-5 flex-shrink-0 ${apiKeyValid === false ? 'text-[#FF6E50]' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-black">API Key</p>
                      <p className={`text-[13px] font-mono truncate ${apiKeyValid === false ? 'text-[#FF6E50]' : 'text-muted-foreground'}`}>
                        ••••••••{apiKeyFingerprint}
                        {apiKeyValid === false && " (invalid)"}
                      </p>
                    </div>
                  </div>
                  {apiKeyValid === true && (
                    <Badge className="flex-shrink-0 ml-3 bg-[#007A78]/10 text-[#007A78] border-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Valid
                    </Badge>
                  )}
                </div>
              )}

              {/* Help text for invalid API key */}
              {apiKeyValid === false && (
                <div className="p-4 border border-[#007A78]/20 rounded-lg bg-[#007A78]/5">
                  <p className="text-[13px] text-[#005F5D]">
                    <strong>How to fix:</strong> Your API key may have been rotated or deactivated.
                    Try clicking &quot;Resync Connection&quot; below, or contact support if the issue persists.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="pt-4 sm:pt-6 border-t border-border flex flex-col sm:flex-row gap-3">
          <div>
            <Button
              onClick={handleResync}
              disabled={isResyncing || loadingBackendStatus}
              variant={(!backendOnboarded || apiKeyValid === false) ? "default" : "outline"}
              className={`h-11 px-4 rounded-xl ${
                (!backendOnboarded || apiKeyValid === false)
                  ? "console-button-primary"
                  : "console-button-secondary"
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
            <p className="text-[12px] text-muted-foreground mt-2">
              {(!backendOnboarded || apiKeyValid === false)
                ? "Re-onboard your organization to generate a new API key and restore backend connection"
                : "Re-synchronize your organization's locale and subscription data with the backend"}
            </p>
          </div>

          {/* Billing Sync Button - Only show when backend is connected */}
          {backendOnboarded && apiKeyValid !== false && (
            <div>
              <Button
                onClick={handleSyncBilling}
                disabled={isBillingSyncing || loadingBackendStatus}
                variant="outline"
                className="h-11 px-4 rounded-xl border border-[#007A78]/30 text-[#007A78] hover:bg-[#007A78]/5"
              >
                {isBillingSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Billing
                  </>
                )}
              </Button>
              <p className="text-[12px] text-muted-foreground mt-2">
                Refresh billing data from Stripe and sync to backend
              </p>
            </div>
          )}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="danger" className="space-y-6">
      {/* Danger Zone Section */}
      <div className="pt-4 sm:pt-6">
        <h2 className="text-[22px] font-bold text-[#FF6E50] mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </h2>

        {/* Owned Organizations Management */}
        {loadingOwnedOrgs ? (
          <div className="metric-card shadow-sm border-[#FF6E50]/30">
            <div className="metric-card-content py-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
                <span className="ml-2 text-[15px] text-muted-foreground">Loading organizations...</span>
              </div>
            </div>
          </div>
        ) : ownedOrgs.length > 0 ? (
          <div className="metric-card shadow-sm border-[#FF6E50]/30 mb-6">
            <div className="metric-card-header mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#FF6E50]" />
                <h3 className="text-[18px] font-bold text-[#FF6E50]">Organizations You Own</h3>
              </div>
              <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">
                You must transfer ownership or delete these organizations before you can delete your account.
              </p>
            </div>
            <div className="metric-card-content space-y-4">
              {ownedOrgs.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between p-4 border border-border rounded-xl bg-[#007A78]/5"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-[15px] font-medium text-black">{org.org_name}</p>
                      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{org.member_count} member{org.member_count !== 1 ? "s" : ""}</span>
                        <Badge variant="outline" className="flex-shrink-0 ml-2 bg-[#007A78]/12 text-[#007A78] border-0">Owner</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {org.has_other_members ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openTransferDialog(org)}
                        className="console-button-secondary h-11"
                      >
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transfer
                      </Button>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteOrgDialog(org)}
                      className="h-11 rounded-xl bg-[#FF6E50] hover:bg-[#E55A3C] text-white shadow-sm"
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
                Transfer ownership of &quot;{selectedOrgForTransfer?.org_name}&quot; to another member.
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
                This will permanently delete &quot;{selectedOrgForDelete?.org_name}&quot; and all associated data.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Alert variant="destructive" className="mb-4 border-[#FF6E50]/30 bg-[#FF6E50]/5">
                <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
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
                  deleteConfirmName.toLowerCase() !== selectedOrgForDelete?.org_name.toLowerCase() ||
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

        {/* Account Deletion Card */}
        <div className="metric-card shadow-sm border-[#FF6E50]/30">
          <div className="metric-card-header mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#FF6E50]" />
              <h3 className="text-[18px] font-bold text-[#FF6E50]">Delete Account</h3>
            </div>
            <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">Permanently delete your account and all associated data</p>
          </div>
          <div className="metric-card-content">
            {deletionRequested ? (
              <Alert className="bg-muted border-[#007A78]/30">
                <Mail className="h-4 w-4 text-[#007A78]" />
                <AlertDescription>
                  <p className="font-medium text-foreground">Verification email sent!</p>
                  <p className="text-sm mt-1">
                    Please check your inbox and click the confirmation link to complete account deletion.
                    The link will expire in 30 minutes.
                  </p>
                </AlertDescription>
              </Alert>
            ) : ownedOrgs.length > 0 ? (
              <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
                <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
                <AlertDescription>
                  You own {ownedOrgs.length} organization{ownedOrgs.length !== 1 ? "s" : ""}.
                  Please transfer ownership or delete them before deleting your account.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
                <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
                <AlertDescription>
                  Deleting your account will permanently remove you from all organizations and cannot be
                  undone. Your data will be lost forever.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <div className="pt-4 border-t border-[#E5E5EA]">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={ownedOrgs.length > 0 || isRequestingDeletion || deletionRequested}
                  className="bg-[#FF6E50] hover:bg-[#E55A3C] text-white shadow-sm"
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
