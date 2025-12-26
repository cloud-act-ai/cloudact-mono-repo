"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  AlertCircle,
  User,
  Mail,
  Phone,
  Globe,
  Check,
  Key,
  Shield,
  Trash2,
  Building2,
  Users,
  Save,
} from "lucide-react"
import { logError } from "@/lib/utils"
import { COUNTRY_CODES } from "@/lib/constants/countries"
import {
  getOwnedOrganizations,
  requestAccountDeletion,
} from "@/actions/account"

// Parse phone to extract country code and number
function parsePhone(phone: string | null): { countryCode: string; phoneNumber: string } {
  if (!phone) return { countryCode: "+1", phoneNumber: "" }

  const match = phone.match(/^(\+\d{1,4})\s*(.*)$/)
  if (match) {
    const code = match[1]
    const number = match[2].trim()
    const known = COUNTRY_CODES.find(c => c.code === code)
    if (known) {
      return { countryCode: code, phoneNumber: number }
    }
  }

  return { countryCode: "+1", phoneNumber: phone.replace(/^\+1\s*/, "") }
}

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central European (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
]

export default function PersonalSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "danger">("profile")

  // Profile fields
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [countryCode, setCountryCode] = useState("+1")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [timezone, setTimezone] = useState("UTC")

  // Security fields
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  // Account deletion state
  interface OwnedOrg {
    id: string
    org_name: string
    org_slug: string
    member_count: number
    has_other_members: boolean
  }
  const [ownedOrgs, setOwnedOrgs] = useState<OwnedOrg[]>([])
  const [loadingOwnedOrgs, setLoadingOwnedOrgs] = useState(false)
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false)
  const [deletionRequested, setDeletionRequested] = useState(false)

  useEffect(() => {
    document.title = "Personal Settings | CloudAct.ai"
  }, [])

  const fetchProfile = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setEmail(user.email || "")

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, timezone")
        .eq("id", user.id)
        .single()

      if (profile) {
        const nameParts = (profile.full_name || "").split(" ")
        setFirstName(nameParts[0] || "")
        setLastName(nameParts.slice(1).join(" ") || "")
        const { countryCode: parsedCode, phoneNumber: parsedNumber } = parsePhone(profile.phone)
        setCountryCode(parsedCode)
        setPhoneNumber(parsedNumber)
        setTimezone(profile.timezone || "UTC")
      }
    } catch (error: unknown) {
      const errorMessage = logError("PersonalSettingsPage:fetchProfile", error)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  // Clear success after timeout
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      if (!phoneNumber.trim()) {
        setError("Phone number is required")
        setIsSaving(false)
        return
      }

      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
      const fullPhone = `${countryCode} ${phoneNumber.trim()}`

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: fullPhone,
          timezone,
        })
        .eq("id", user.id)

      if (updateError) throw updateError

      setSuccess("Profile updated successfully!")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetPassword = async () => {
    setIsResettingPassword(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset email")
      }

      setSuccess(data.message || "Password reset email sent! Check your inbox.")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsResettingPassword(false)
    }
  }

  const loadOwnedOrganizations = useCallback(async () => {
    setLoadingOwnedOrgs(true)
    try {
      const result = await getOwnedOrganizations()
      if (result.success && result.data) {
        setOwnedOrgs(result.data)
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingOwnedOrgs(false)
    }
  }, [])

  useEffect(() => {
    void loadOwnedOrganizations()
  }, [loadOwnedOrganizations])

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
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#90FCA6] to-[#B8FDCA] flex items-center justify-center shadow-sm">
            <User className="h-6 w-6 text-black" />
          </div>
          <h1 className="text-[32px] font-bold text-black tracking-tight leading-none">
            Personal Settings
          </h1>
        </div>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg ml-[60px]">
          Manage your profile, security, and account settings
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center">
            <User className="h-5 w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <p className="text-[14px] text-slate-600 font-medium">Account</p>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#90FCA6]/15">
              <div className="h-1.5 w-1.5 rounded-full bg-[#1a7a3a]" />
              <p className="text-[12px] text-[#1a7a3a] font-semibold">Active</p>
            </div>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Shield className="h-5 w-5 text-slate-500" />
          </div>
          <div>
            <p className="text-[14px] text-slate-600 font-medium">Security</p>
            <p className="text-[12px] text-slate-500 font-medium">Protected</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[13px] font-medium text-rose-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 rounded-xl bg-[#90FCA6]/15 border border-[#90FCA6]/20 flex items-center gap-3">
          <Check className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
          <p className="text-[13px] font-medium text-[#1a7a3a]">{success}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-8 p-1 bg-slate-50/80 rounded-xl w-fit border border-slate-200/50">
        {[
          { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
          { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
          { id: "danger", label: "Danger Zone", icon: <AlertCircle className="h-4 w-4" />, danger: true },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "profile" | "security" | "danger")}
            className={`h-9 px-4 text-[13px] font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === tab.id
                ? tab.danger
                  ? "bg-[#FF6C5E] text-white shadow-sm"
                  : "bg-white text-black shadow-sm border border-slate-200/50"
                : tab.danger
                  ? "text-[#FF6C5E] hover:text-[#E55A3C]"
                  : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[13px] font-semibold text-black uppercase tracking-wide">
              Personal Information
            </h2>
          </div>

          <div className="metric-card shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="metric-card-content space-y-6">
              {/* Email - Read Only */}
              <div className="group relative">
                <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-[#90FCA6]/40 opacity-60" />
                <div className="pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-[#1a7a3a]" />
                    <label className="text-[13px] font-medium text-slate-700">Email Address</label>
                  </div>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full h-11 px-4 text-[14px] bg-slate-50 text-slate-500 border border-slate-200 rounded-xl cursor-not-allowed"
                  />
                  <p className="text-[12px] text-slate-400 mt-1.5">Contact support to update your email</p>
                </div>
              </div>

              <div className="h-px bg-slate-100"></div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-medium text-slate-700 mb-2 block">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter first name"
                    className="w-full h-11 px-4 text-[14px] bg-white border border-slate-200 rounded-xl focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-medium text-slate-700 mb-2 block">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter last name"
                    className="w-full h-11 px-4 text-[14px] bg-white border border-slate-200 rounded-xl focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6] transition-colors"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <label className="text-[13px] font-medium text-slate-700">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-[100px] h-11 text-[13px] border-slate-200 rounded-xl">
                      <SelectValue>{countryCode}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={`${c.code}-${c.country}`} value={c.code}>
                          {c.country} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="555 123 4567"
                    className="flex-1 h-11 px-4 text-[14px] bg-white border border-slate-200 rounded-xl focus:border-[#90FCA6] focus:ring-1 focus:ring-[#90FCA6] transition-colors"
                  />
                </div>
                <p className="text-[12px] text-slate-400 mt-1.5">Used for account recovery and notifications</p>
              </div>

              {/* Timezone */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-slate-400" />
                  <label className="text-[13px] font-medium text-slate-700">Timezone</label>
                </div>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-full h-11 text-[13px] border-slate-200 rounded-xl">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Save Button */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="console-button-primary h-11 px-6 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <section className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[13px] font-semibold text-black uppercase tracking-wide">
              Authentication
            </h2>
          </div>

          <div className="metric-card shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="metric-card-content">
              <div className="group relative">
                <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-[#90FCA6] opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="pl-5 py-5 pr-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="h-11 w-11 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
                      <Key className="h-5 w-5 text-[#1a7a3a]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-semibold text-black tracking-tight">Password</h3>
                      <p className="text-[12px] text-slate-500 mt-0.5">Reset your password via email verification</p>
                    </div>
                  </div>
                  <button
                    onClick={handleResetPassword}
                    disabled={isResettingPassword}
                    className="console-button-primary h-11 px-6 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResettingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Reset Password"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Security Tips */}
          <div className="metric-card shadow-sm bg-gradient-to-br from-[#90FCA6]/5 via-slate-50 to-white border-[#90FCA6]/10">
            <div className="metric-card-content">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-white border border-[#90FCA6]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Shield className="h-5 w-5 text-[#1a7a3a]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-black mb-2">Security Tips</h3>
                  <ul className="text-[13px] text-slate-600 space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="text-[#1a7a3a] font-bold">•</span>
                      <span>Use a strong, unique password for your account</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#1a7a3a] font-bold">•</span>
                      <span>Never share your password or reset links with anyone</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#1a7a3a] font-bold">•</span>
                      <span>Log out when using shared or public devices</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Danger Zone Tab */}
      {activeTab === "danger" && (
        <section className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[13px] font-semibold text-[#FF6C5E] uppercase tracking-wide">
              Danger Zone
            </h2>
          </div>

          {/* Owned Organizations Warning */}
          {loadingOwnedOrgs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : ownedOrgs.length > 0 && (
            <div className="metric-card shadow-sm border-2 border-amber-200/50 bg-gradient-to-br from-amber-50/50 to-white">
              <div className="metric-card-content">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-amber-800">Organizations You Own</h3>
                    <p className="text-[12px] text-amber-600">Transfer or delete these before deleting your account</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {ownedOrgs.map((org) => (
                    <div key={org.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-amber-600" />
                        <div>
                          <p className="text-[14px] font-medium text-amber-900">{org.org_name}</p>
                          <div className="flex items-center gap-1 text-[12px] text-amber-600">
                            <Users className="h-3 w-3" />
                            <span>{org.member_count} member{org.member_count !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Delete Account Card */}
          <div className="metric-card shadow-sm border-2 border-[#FF6C5E]/30 bg-gradient-to-br from-rose-50/50 to-white">
            <div className="metric-card-content">
              <div className="group relative">
                <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-[#FF6C5E] opacity-60" />
                <div className="pl-5 py-5 pr-5">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-11 w-11 rounded-xl bg-[#FF6C5E]/10 flex items-center justify-center flex-shrink-0">
                      <Trash2 className="h-5 w-5 text-[#FF6C5E]" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-[#FF6C5E]">Delete Account</h3>
                      <p className="text-[12px] text-rose-600 mt-0.5">Permanently delete your account and all data</p>
                    </div>
                  </div>

                  {deletionRequested ? (
                    <div className="p-4 rounded-xl bg-[#90FCA6]/15 border border-[#90FCA6]/30 flex items-start gap-3">
                      <Mail className="h-4 w-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-semibold text-[#1a7a3a]">Verification email sent!</p>
                        <p className="text-[12px] text-[#1a7a3a]/80 mt-1">
                          Check your inbox and click the confirmation link. The link expires in 30 minutes.
                        </p>
                      </div>
                    </div>
                  ) : ownedOrgs.length > 0 ? (
                    <div className="p-4 rounded-xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 flex items-center gap-3">
                      <AlertCircle className="h-4 w-4 text-[#FF6C5E] flex-shrink-0" />
                      <p className="text-[13px] text-[#FF6C5E]">
                        You own {ownedOrgs.length} organization{ownedOrgs.length !== 1 ? "s" : ""}.
                        Transfer or delete them first.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 flex items-center gap-3">
                      <AlertCircle className="h-4 w-4 text-[#FF6C5E] flex-shrink-0" />
                      <p className="text-[13px] text-[#FF6C5E]">
                        This action is permanent and cannot be undone. Your data will be lost forever.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="metric-card shadow-sm border-2 border-[#FF6C5E]/30 bg-gradient-to-br from-rose-50/50 to-white">
            <div className="px-6 py-4 border-t border-[#FF6C5E]/10 bg-[#FF6C5E]/5">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={ownedOrgs.length > 0 || isRequestingDeletion || deletionRequested}
                    className="h-11 px-6 text-[13px] font-semibold bg-[#FF6C5E] hover:bg-[#E55A3C] text-white rounded-xl transition-all hover:shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRequestingDeletion ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Requesting...
                      </>
                    ) : deletionRequested ? (
                      <>
                        <Mail className="h-4 w-4" />
                        Check Email
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Delete Account
                      </>
                    )}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Request Account Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                      We will send a verification email to <span className="font-medium">{email}</span>.
                      Click the link to confirm deletion.
                      <span className="block mt-2 text-rose-600 font-medium">
                        This action is permanent and cannot be undone.
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRequestAccountDeletion}
                      className="bg-rose-500 hover:bg-rose-600 text-white"
                    >
                      Send Verification Email
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
