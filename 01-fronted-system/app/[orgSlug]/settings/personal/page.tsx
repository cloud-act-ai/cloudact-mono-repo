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
  Save,
  AlertTriangle,
  User,
  Mail,
  Phone,
  Globe,
  CheckCircle2,
  Key,
  Shield,
  Trash2,
  Building2,
  Users,
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

  // Try to match country code at start
  const match = phone.match(/^(\+\d{1,4})\s*(.*)$/)
  if (match) {
    const code = match[1]
    const number = match[2].trim()
    // Check if it's a known country code
    const known = COUNTRY_CODES.find(c => c.code === code)
    if (known) {
      return { countryCode: code, phoneNumber: number }
    }
  }

  // Default: assume US/CA and use the whole string as number
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
  useParams()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setEmail(user.email || "")

      // Fetch profile data
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, timezone")
        .eq("id", user.id)
        .single()

      if (profile) {
        // Split full_name into first and last name
        const nameParts = (profile.full_name || "").split(" ")
        setFirstName(nameParts[0] || "")
        setLastName(nameParts.slice(1).join(" ") || "")
        // Parse phone into country code and number
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

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      // Validate phone number (required)
      if (!phoneNumber.trim()) {
        setError("Phone number is required")
        setIsSaving(false)
        return
      }

      // Combine first and last name
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")

      // Combine country code and phone number
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
      setTimeout(() => setSuccess(null), 4000)
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
      setTimeout(() => setSuccess(null), 6000)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsResettingPassword(false)
    }
  }

  // Load owned organizations
  const loadOwnedOrganizations = useCallback(async () => {
    setLoadingOwnedOrgs(true)
    try {
      const result = await getOwnedOrganizations()
      if (result.success && result.data) {
        setOwnedOrgs(result.data)
      }
    } catch (err: unknown) {
    } finally {
      setLoadingOwnedOrgs(false)
    }
  }, [])

  // Load owned orgs when viewing danger zone
  useEffect(() => {
    void loadOwnedOrganizations()
  }, [loadOwnedOrganizations])

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
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Personal Settings</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          Manage your personal profile and security settings
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-muted border-[#007A78]/30">
          <CheckCircle2 className="h-4 w-4 text-[#007A78]" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full sm:w-auto flex-wrap touch-manipulation">
          <TabsTrigger value="profile" className="cursor-pointer">Profile</TabsTrigger>
          <TabsTrigger value="security" className="cursor-pointer">Security</TabsTrigger>
          <TabsTrigger value="danger" className="text-[#FF6E50] data-[state=active]:text-[#FF6E50] cursor-pointer">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <div className="metric-card shadow-sm">
            <div className="metric-card-header mb-6">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-[22px] font-bold text-black">Personal Information</h2>
              </div>
              <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">Update your personal details and preferences</p>
            </div>
            <div className="metric-card-content space-y-4 sm:space-y-6">
              {/* Email - Read Only */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="h-10 px-3 text-[15px] bg-[#007A78]/5 text-muted-foreground border border-[#E5E5EA] rounded-lg"
                />
                <p className="text-[13px] text-muted-foreground">
                  Email address cannot be changed. Contact support if you need to update it.
                </p>
              </div>

              <Separator />

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-[13px] sm:text-[15px] font-medium text-foreground">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter your first name"
                    className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#8E8E93] focus:ring-1 focus:ring-[#8E8E93]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-[13px] sm:text-[15px] font-medium text-foreground">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter your last name"
                    className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg focus:border-[#8E8E93] focus:ring-1 focus:ring-[#8E8E93]"
                  />
                </div>
              </div>

              {/* Phone Number with Country Code */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone Number <span className="text-[#FF6E50]">*</span>
                </Label>
                <div className="flex gap-2">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-[90px] sm:w-24 h-10 text-[15px] border border-[#E5E5EA] rounded-lg">
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
                  <Input
                    id="phone"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="555 123 4567"
                    className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg flex-1 focus:border-[#8E8E93] focus:ring-1 focus:ring-[#8E8E93]"
                  />
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Used for account recovery and notifications.
                </p>
              </div>

              {/* Timezone */}
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-[13px] sm:text-[15px] font-medium text-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Timezone
                </Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone" className="h-10 text-[15px] border border-[#E5E5EA] rounded-lg">
                    <SelectValue placeholder="Select your timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[13px] text-muted-foreground">
                  Used for displaying times in your local timezone.
                </p>
              </div>
            </div>
            <div className="pt-4 sm:pt-6 border-t border-border">
              <Button onClick={handleSave} disabled={isSaving} className="console-button-primary h-11 px-4">
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
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div className="metric-card shadow-sm">
            <div className="metric-card-header mb-6">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-[22px] font-bold text-black">Security</h2>
              </div>
              <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1">Manage your password and security settings</p>
            </div>
            <div className="metric-card-content space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-border rounded-xl bg-[#007A78]/5">
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-[15px] font-medium text-black">Password</p>
                    <p className="text-[13px] text-muted-foreground">Reset your password via email</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleResetPassword}
                  disabled={isResettingPassword}
                  className="console-button-secondary h-11 px-4"
                >
                  {isResettingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Security Info Card */}
          <div className="metric-card shadow-sm bg-[#007A78]/5 border-[#007A78]/20">
            <div className="metric-card-content">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-[#007A78] mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="text-[15px] font-semibold text-[#005F5D]">Security Tips</h3>
                  <ul className="text-[13px] text-[#007A78] space-y-1 list-disc list-inside">
                    <li>Use a strong, unique password for your account</li>
                    <li>Never share your password or reset links with anyone</li>
                    <li>Check your email regularly for security notifications</li>
                    <li>Log out when using shared or public devices</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="danger" className="space-y-6">
          {/* Danger Zone Header */}
          <div className="pt-4 sm:pt-6">
            <h2 className="text-[22px] font-bold text-[#FF6E50] mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </h2>
          </div>

          {/* Owned Organizations Warning */}
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
                  Go to Organization Settings &gt; Danger Zone to manage them.
                </p>
              </div>
              <div className="metric-card-content space-y-3">
                {ownedOrgs.map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between p-3 border border-border rounded-xl bg-[#007A78]/5"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-[15px] font-medium text-black">{org.org_name}</p>
                        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                          <Users className="h-3 w-3" />
                          <span>{org.member_count} member{org.member_count !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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
        </TabsContent>
      </Tabs>
    </div>
  )
}
