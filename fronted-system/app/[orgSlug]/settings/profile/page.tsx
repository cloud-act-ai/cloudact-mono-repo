"use client"

import { useState, useEffect } from "react"
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

// Comprehensive country codes for phone number selection
// Order: US/CA first, India second, popular countries, then alphabetical
const COUNTRY_CODES = [
  // Top countries
  { code: "+1", country: "US/Canada" },
  { code: "+91", country: "India" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+49", country: "Germany" },
  { code: "+33", country: "France" },
  { code: "+81", country: "Japan" },
  { code: "+86", country: "China" },
  { code: "+65", country: "Singapore" },
  { code: "+971", country: "UAE" },
  { code: "+55", country: "Brazil" },
  { code: "+52", country: "Mexico" },
  { code: "+31", country: "Netherlands" },
  { code: "+34", country: "Spain" },
  { code: "+39", country: "Italy" },
  // Separator - rest alphabetical
  { code: "+93", country: "Afghanistan" },
  { code: "+355", country: "Albania" },
  { code: "+213", country: "Algeria" },
  { code: "+376", country: "Andorra" },
  { code: "+244", country: "Angola" },
  { code: "+54", country: "Argentina" },
  { code: "+374", country: "Armenia" },
  { code: "+43", country: "Austria" },
  { code: "+994", country: "Azerbaijan" },
  { code: "+973", country: "Bahrain" },
  { code: "+880", country: "Bangladesh" },
  { code: "+375", country: "Belarus" },
  { code: "+32", country: "Belgium" },
  { code: "+501", country: "Belize" },
  { code: "+229", country: "Benin" },
  { code: "+975", country: "Bhutan" },
  { code: "+591", country: "Bolivia" },
  { code: "+387", country: "Bosnia" },
  { code: "+267", country: "Botswana" },
  { code: "+673", country: "Brunei" },
  { code: "+359", country: "Bulgaria" },
  { code: "+855", country: "Cambodia" },
  { code: "+237", country: "Cameroon" },
  { code: "+56", country: "Chile" },
  { code: "+57", country: "Colombia" },
  { code: "+506", country: "Costa Rica" },
  { code: "+385", country: "Croatia" },
  { code: "+53", country: "Cuba" },
  { code: "+357", country: "Cyprus" },
  { code: "+420", country: "Czech Rep" },
  { code: "+45", country: "Denmark" },
  { code: "+593", country: "Ecuador" },
  { code: "+20", country: "Egypt" },
  { code: "+503", country: "El Salvador" },
  { code: "+372", country: "Estonia" },
  { code: "+251", country: "Ethiopia" },
  { code: "+358", country: "Finland" },
  { code: "+995", country: "Georgia" },
  { code: "+233", country: "Ghana" },
  { code: "+30", country: "Greece" },
  { code: "+502", country: "Guatemala" },
  { code: "+504", country: "Honduras" },
  { code: "+852", country: "Hong Kong" },
  { code: "+36", country: "Hungary" },
  { code: "+354", country: "Iceland" },
  { code: "+62", country: "Indonesia" },
  { code: "+98", country: "Iran" },
  { code: "+964", country: "Iraq" },
  { code: "+353", country: "Ireland" },
  { code: "+972", country: "Israel" },
  { code: "+225", country: "Ivory Coast" },
  { code: "+962", country: "Jordan" },
  { code: "+7", country: "Kazakhstan" },
  { code: "+254", country: "Kenya" },
  { code: "+82", country: "South Korea" },
  { code: "+965", country: "Kuwait" },
  { code: "+996", country: "Kyrgyzstan" },
  { code: "+856", country: "Laos" },
  { code: "+371", country: "Latvia" },
  { code: "+961", country: "Lebanon" },
  { code: "+218", country: "Libya" },
  { code: "+370", country: "Lithuania" },
  { code: "+352", country: "Luxembourg" },
  { code: "+853", country: "Macau" },
  { code: "+60", country: "Malaysia" },
  { code: "+960", country: "Maldives" },
  { code: "+356", country: "Malta" },
  { code: "+373", country: "Moldova" },
  { code: "+377", country: "Monaco" },
  { code: "+976", country: "Mongolia" },
  { code: "+382", country: "Montenegro" },
  { code: "+212", country: "Morocco" },
  { code: "+95", country: "Myanmar" },
  { code: "+977", country: "Nepal" },
  { code: "+64", country: "New Zealand" },
  { code: "+505", country: "Nicaragua" },
  { code: "+234", country: "Nigeria" },
  { code: "+389", country: "N. Macedonia" },
  { code: "+47", country: "Norway" },
  { code: "+968", country: "Oman" },
  { code: "+92", country: "Pakistan" },
  { code: "+507", country: "Panama" },
  { code: "+595", country: "Paraguay" },
  { code: "+51", country: "Peru" },
  { code: "+63", country: "Philippines" },
  { code: "+48", country: "Poland" },
  { code: "+351", country: "Portugal" },
  { code: "+974", country: "Qatar" },
  { code: "+40", country: "Romania" },
  { code: "+7", country: "Russia" },
  { code: "+966", country: "Saudi Arabia" },
  { code: "+381", country: "Serbia" },
  { code: "+421", country: "Slovakia" },
  { code: "+386", country: "Slovenia" },
  { code: "+27", country: "South Africa" },
  { code: "+94", country: "Sri Lanka" },
  { code: "+46", country: "Sweden" },
  { code: "+41", country: "Switzerland" },
  { code: "+886", country: "Taiwan" },
  { code: "+992", country: "Tajikistan" },
  { code: "+255", country: "Tanzania" },
  { code: "+66", country: "Thailand" },
  { code: "+216", country: "Tunisia" },
  { code: "+90", country: "Turkey" },
  { code: "+993", country: "Turkmenistan" },
  { code: "+256", country: "Uganda" },
  { code: "+380", country: "Ukraine" },
  { code: "+598", country: "Uruguay" },
  { code: "+998", country: "Uzbekistan" },
  { code: "+58", country: "Venezuela" },
  { code: "+84", country: "Vietnam" },
  { code: "+967", country: "Yemen" },
  { code: "+260", country: "Zambia" },
  { code: "+263", country: "Zimbabwe" },
]

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
  const params = useParams()
  const orgSlug = params.orgSlug as string

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

  useEffect(() => {
    fetchProfile()
  }, [orgSlug])

  const fetchProfile = async () => {
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
    } catch (err) {
      const errorMessage = logError("ProfilePage:fetchProfile", err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
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
    <div className="space-y-6">
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

      <Card className="console-stat-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#007A78]" />
            <CardTitle className="console-card-title">Personal Information</CardTitle>
          </div>
          <CardDescription className="console-subheading">Update your personal details and preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email - Read Only */}
          <div className="space-y-2">
            <Label htmlFor="email" className="console-label flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              className="console-input bg-muted/50 text-gray-500"
            />
            <p className="console-small text-gray-500">
              Email address cannot be changed. Contact support if you need to update it.
            </p>
          </div>

          <Separator />

          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="console-label">First Name</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
                className="console-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="console-label">Last Name</Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
                className="console-input"
              />
            </div>
          </div>

          {/* Phone Number with Country Code */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="console-label flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-500" />
              Phone Number <span className="text-[#FF6E50]">*</span>
            </Label>
            <div className="flex gap-2">
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger className="w-24 h-10">
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
                className="console-input flex-1"
              />
            </div>
            <p className="console-small text-gray-500">
              Used for account recovery and notifications.
            </p>
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <Label htmlFor="timezone" className="console-label flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-500" />
              Timezone
            </Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
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
            <p className="console-small text-gray-500">
              Used for displaying times in your local timezone.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isSaving} className="console-button-primary">
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
        </CardFooter>
      </Card>
    </div>
  )
}
