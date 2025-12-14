"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2,
  Save,
  AlertTriangle,
  User,
  Mail,
  Phone,
  Globe,
  CheckCircle2,
} from "lucide-react"
import { logError } from "@/lib/utils"
import { COUNTRY_CODES } from "@/lib/constants/countries"

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

export default function ProfilePage() {
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

  useEffect(() => {
    document.title = "Settings | CloudAct.ai"
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
      const errorMessage = logError("ProfilePage:fetchProfile", error)
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
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-muted border-green-500/50">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      <div className="health-card shadow-sm">
        <div className="health-card-header mb-6">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#8E8E93]" />
            <h2 className="text-[22px] font-bold text-black">Personal Information</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">Update your personal details and preferences</p>
        </div>
        <div className="health-card-content space-y-4 sm:space-y-6">
          {/* Email - Read Only */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[13px] sm:text-[15px] font-medium text-gray-700 flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#8E8E93]" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              className="h-10 px-3 text-[15px] bg-gray-50 text-gray-500 border border-[#E5E5EA] rounded-lg"
            />
            <p className="text-[13px] text-[#8E8E93]">
              Email address cannot be changed. Contact support if you need to update it.
            </p>
          </div>

          <Separator />

          {/* Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-[13px] sm:text-[15px] font-medium text-gray-700">First Name</Label>
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
              <Label htmlFor="lastName" className="text-[13px] sm:text-[15px] font-medium text-gray-700">Last Name</Label>
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
            <Label htmlFor="phone" className="text-[13px] sm:text-[15px] font-medium text-gray-700 flex items-center gap-2">
              <Phone className="h-4 w-4 text-[#8E8E93]" />
              Phone Number <span className="text-[#FF3B30]">*</span>
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
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="555 123 4567"
                className="h-10 px-3 text-[15px] border border-[#E5E5EA] rounded-lg flex-1 focus:border-[#8E8E93] focus:ring-1 focus:ring-[#8E8E93]"
              />
            </div>
            <p className="text-[13px] text-[#8E8E93]">
              Used for account recovery and notifications.
            </p>
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-[13px] sm:text-[15px] font-medium text-gray-700 flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#8E8E93]" />
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
            <p className="text-[13px] text-[#8E8E93]">
              Used for displaying times in your local timezone.
            </p>
          </div>
        </div>
        <div className="pt-4 sm:pt-6 border-t border-[#E5E5EA]">
          <Button onClick={handleSave} disabled={isSaving} className="h-[36px] px-4 bg-[#8E8E93] text-white rounded-xl text-[15px] font-semibold hover:bg-[#6E6E73] shadow-sm transition-colors">
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
    </div>
  )
}
