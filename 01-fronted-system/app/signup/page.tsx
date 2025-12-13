"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Cloud, Loader2, Phone, Globe, DollarSign } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES } from "@/lib/i18n"

const ORG_TYPES = [
  { value: "personal", label: "Personal" },
  { value: "startup", label: "Startup" },
  { value: "agency", label: "Agency" },
  { value: "company", label: "Company" },
  { value: "educational", label: "Educational" },
]

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
  { code: "+7", country: "Russia/Kazakhstan" },
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

// Sanitize organization name to prevent XSS and SQL injection
function sanitizeOrgName(name: string): string {
  return name
    .replace(/<[^>]*>/g, "")  // Remove HTML tags
    .replace(/[<>"'&;]/g, "") // Remove potentially dangerous characters
    .trim()
    .slice(0, 100)            // Limit length
}

// Validate organization name
function isValidOrgName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 2 &&
         trimmed.length <= 100 &&
         !/<script|<\/script|javascript:|on\w+=/i.test(trimmed)
}

// Phone number length requirements by country code
const PHONE_LENGTH_BY_COUNTRY: Record<string, { min: number; max: number }> = {
  '+1': { min: 10, max: 10 },      // US/Canada
  '+91': { min: 10, max: 10 },     // India
  '+44': { min: 10, max: 11 },     // UK
  '+61': { min: 9, max: 9 },       // Australia
  '+49': { min: 10, max: 11 },     // Germany
  '+33': { min: 9, max: 9 },       // France
  '+81': { min: 10, max: 10 },     // Japan
  '+86': { min: 11, max: 11 },     // China
  '+65': { min: 8, max: 8 },       // Singapore
  '+971': { min: 9, max: 9 },      // UAE
  '+55': { min: 10, max: 11 },     // Brazil
  '+52': { min: 10, max: 10 },     // Mexico
  '+7': { min: 10, max: 10 },      // Russia/Kazakhstan
}

// Validate phone number with country-specific rules
function isValidPhone(phone: string, countryCode: string): boolean {
  // Extract digits only (allows formatting like spaces, dashes, parens)
  const digitsOnly = phone.replace(/\D/g, "")

  // Must have at least some digits
  if (digitsOnly.length === 0) return false

  // Get expected length for this country code
  const expected = PHONE_LENGTH_BY_COUNTRY[countryCode] || { min: 7, max: 15 }

  return digitsOnly.length >= expected.min && digitsOnly.length <= expected.max
}

// Get expected phone format hint for country
function getPhoneHint(countryCode: string): string {
  const expected = PHONE_LENGTH_BY_COUNTRY[countryCode]
  if (!expected) return "7-15 digits"
  if (expected.min === expected.max) return `${expected.min} digits`
  return `${expected.min}-${expected.max} digits`
}

/**
 * Validate redirect URL to prevent open redirect attacks.
 * Only allows relative paths that don't escape to external sites.
 */
function isValidRedirect(url: string | null): url is string {
  if (!url) return false
  // Must start with /
  if (!url.startsWith("/")) return false
  // Reject protocol-relative URLs (//evil.com)
  if (url.startsWith("//")) return false
  // Reject URLs with encoded characters that could bypass checks
  if (url.includes("\\")) return false
  // Reject URLs with @ which could indicate user@host
  if (url.includes("@")) return false
  // Reject URLs with control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(url)) return false
  return true
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get("redirect")
  const redirectTo = isValidRedirect(rawRedirect) ? rawRedirect : null
  const prefillEmail = searchParams.get("email")

  // Check if user is coming from an invite - they don't need company info
  const isInviteFlow = redirectTo?.startsWith("/invite/")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [countryCode, setCountryCode] = useState("+1")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyType, setCompanyType] = useState("company")
  const [currency, setCurrency] = useState("USD")
  const [timezone, setTimezone] = useState("UTC")
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Pre-fill email from query param (e.g., from invite link)
  useEffect(() => {
    if (prefillEmail) {
      setEmail(decodeURIComponent(prefillEmail))
    }
  }, [prefillEmail])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setServerError(null)

    // Validate phone number with country-specific rules
    if (!isValidPhone(phoneNumber, countryCode)) {
      const hint = getPhoneHint(countryCode)
      const country = COUNTRY_CODES.find(c => c.code === countryCode)?.country || "your country"
      setServerError(`Please enter a valid phone number for ${country} (${hint})`)
      setIsLoading(false)
      return
    }

    // For invite flow, skip company validation
    // For normal signup, company name is required
    if (!isInviteFlow && !isValidOrgName(companyName)) {
      setServerError("Please enter a valid company name (2-100 characters, no special tags)")
      setIsLoading(false)
      return
    }

    const sanitizedCompanyName = isInviteFlow ? "" : sanitizeOrgName(companyName)
    const fullPhone = `${countryCode} ${phoneNumber.trim()}`

    try {
      const supabase = createClient()

      // For invite flow, redirect back to invite; otherwise go to billing
      const finalRedirect = redirectTo || "/onboarding/billing"

      // Normalize email - trim whitespace and lowercase
      const normalizedEmail = email.trim().toLowerCase()

      // Build user metadata - only include company info for non-invite signup
      const userData: Record<string, string> = {
        phone: fullPhone,
        signup_completed_at: new Date().toISOString(),
      }

      if (!isInviteFlow) {
        userData.pending_company_name = sanitizedCompanyName
        userData.pending_company_type = companyType
        userData.pending_currency = currency
        userData.pending_timezone = timezone
      }

      // Signup with user_metadata (use normalizedEmail for consistency)
      const { data: authData, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${finalRedirect}`,
          data: userData,
        },
      })

      if (signupError) throw new Error(signupError.message)
      if (!authData.user) throw new Error("Signup failed")

      console.log("[v0] Signup successful, user:", authData.user.id)
      if (isInviteFlow) {
        console.log("[v0] Invite flow - redirecting back to invite")
      } else {
        console.log("[v0] Company info stored in metadata:", sanitizedCompanyName, companyType)
      }

      // Sign in to establish session
      const { error: signinError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signinError) {
        console.error("[v0] Auto-signin failed:", signinError.message)
        const loginUrl = `/login?redirect=${encodeURIComponent(finalRedirect)}&message=Please sign in to continue`
        router.push(loginUrl)
        return
      }

      console.log("[v0] Auto-signin successful, redirecting to billing")

      // Success - redirect to billing page for plan selection
      window.location.href = finalRedirect
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : "An error occurred during signup")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-[480px] space-y-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A78] text-white shadow-lg">
          <Cloud className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isInviteFlow ? "Create your account" : "Create your account"}
          </h1>
          <p className="text-sm text-gray-600">
            {isInviteFlow ? "Sign up to accept your team invite" : `Start your ${DEFAULT_TRIAL_DAYS}-day free trial`}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-lg">
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Account Section */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Account</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 focus:border-[#007A78] focus:ring-[#007A78]"
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 focus:border-[#007A78] focus:ring-[#007A78]"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Phone Number with Country Code */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Phone number
              </Label>
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode} disabled={isLoading}>
                  <SelectTrigger className="w-24 h-10 justify-center focus:border-[#007A78] focus:ring-[#007A78]">
                    <SelectValue className="text-center">{countryCode}</SelectValue>
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
                  placeholder="555 123 4567"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="h-10 flex-1 focus:border-[#007A78] focus:ring-[#007A78]"
                  disabled={isLoading}
                  autoComplete="tel-national"
                />
              </div>
            </div>
          </div>

          {/* Company Section - Only show for non-invite flow */}
          {!isInviteFlow && (
            <div className="space-y-3 pt-3 border-t">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Company</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-sm font-medium text-gray-700">
                    Company name
                  </Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Acme Inc."
                    required
                    minLength={2}
                    maxLength={100}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="h-10 focus:border-[#007A78] focus:ring-[#007A78]"
                    disabled={isLoading}
                    autoComplete="organization"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="companyType" className="text-sm font-medium text-gray-700">
                    Company type
                  </Label>
                  <select
                    id="companyType"
                    value={companyType}
                    onChange={(e) => setCompanyType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading}
                    aria-label="Select company type"
                  >
                    {ORG_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Currency and Timezone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="currency" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    Currency
                  </Label>
                  <Select value={currency} onValueChange={setCurrency} disabled={isLoading}>
                    <SelectTrigger className="h-10 focus:border-[#007A78] focus:ring-[#007A78]">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.symbol} {c.code} - {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="timezone" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    Timezone
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone} disabled={isLoading}>
                    <SelectTrigger className="h-10 focus:border-[#007A78] focus:ring-[#007A78]">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {SUPPORTED_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {serverError && (
            <Alert variant="destructive" className="py-2 bg-[#FFF5F3] border-[#FF6E50]">
              <AlertDescription className="text-sm text-[#FF6E50]">{serverError}</AlertDescription>
            </Alert>
          )}

          <button type="submit" className="cloudact-btn-primary w-full h-10 text-sm font-semibold" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : isInviteFlow ? (
              "Create account & accept invite"
            ) : (
              "Continue to plan selection"
            )}
          </button>

          <p className="text-center text-xs text-gray-600">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </p>
        </form>
      </div>

      <div className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[#007A78] hover:text-[#005F5D] hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  )
}

function SignupFormFallback() {
  return (
    <div className="w-full max-w-[480px] space-y-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A78] text-white shadow-lg">
          <Cloud className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-600">Start your {DEFAULT_TRIAL_DAYS}-day free trial</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-5 shadow-lg flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
      <Suspense fallback={<SignupFormFallback />}>
        <SignupForm />
      </Suspense>
    </div>
  )
}
