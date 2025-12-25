"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Cloud, Loader2, Phone, Globe, DollarSign, Mail, Lock, Building2, Briefcase } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES, isValidCurrency, isValidTimezone, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/i18n"
import { COUNTRY_CODES } from "@/lib/constants/countries"
import { isValidPhone, getPhoneHint } from "@/lib/utils/phone"
import { sanitizeOrgName, isValidOrgName } from "@/lib/utils/validation"

const ORG_TYPES = [
  { value: "personal", label: "Personal" },
  { value: "startup", label: "Startup" },
  { value: "agency", label: "Agency" },
  { value: "company", label: "Company" },
  { value: "educational", label: "Educational" },
]

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
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [timezone, setTimezone] = useState("UTC")
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Pre-fill email from query param (e.g., from invite link)
  useEffect(() => {
    if (prefillEmail) {
      try {
        const decoded = decodeURIComponent(prefillEmail)
        // Basic email validation before pre-filling
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (emailRegex.test(decoded) && decoded.length <= 254) {
          setEmail(decoded)
        }
      } catch {
        // Invalid URL encoding, ignore
      }
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
        // Validate and fallback to defaults for i18n fields
        userData.pending_currency = isValidCurrency(currency) ? currency : DEFAULT_CURRENCY
        userData.pending_timezone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE
      }

      // Signup with user_metadata (use normalizedEmail for consistency)
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const { data: authData, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${origin}${finalRedirect}`,
          data: userData,
        },
      })

      if (signupError) throw new Error(signupError.message)
      if (!authData.user) throw new Error("Signup failed")

      // Signup successful - user ID and company info stored in metadata

      // Sign in to establish session (use normalized email to match signup)
      const { error: signinError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (signinError) {
        const loginUrl = `/login?redirect=${encodeURIComponent(finalRedirect)}&message=Please sign in to continue`
        setIsLoading(false)
        router.push(loginUrl)
        return
      }

      // Success - redirect to billing page for plan selection
      if (typeof window !== "undefined") window.location.href = finalRedirect
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : "An error occurred during signup")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-[480px] space-y-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint text-black shadow-lg shadow-mint/20">
          <Cloud className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[#1C1C1E] tracking-tight">
            {isInviteFlow ? "Create your account" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            {isInviteFlow ? "Sign up to accept your team invite" : `Start your ${DEFAULT_TRIAL_DAYS}-day free trial`}
          </p>
        </div>
      </div>

      <div className="glass-card p-6">
        {/* suppressHydrationWarning: Password manager extensions (LastPass, 1Password, etc.)
            inject elements into forms before React hydrates, causing harmless mismatches */}
        <form onSubmit={onSubmit} className="space-y-4" suppressHydrationWarning>
          {/* Account Section */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Your Details</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2" suppressHydrationWarning>
                <Label htmlFor="email" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 focus:border-mint focus:ring-mint"
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2" suppressHydrationWarning>
                <Label htmlFor="password" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
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
                  className="h-10 focus:border-mint focus:ring-mint"
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
                  <SelectTrigger className="w-24 h-10 justify-center focus:border-mint focus:ring-mint">
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
                  className="h-10 flex-1 focus:border-mint focus:ring-mint"
                  disabled={isLoading}
                  autoComplete="tel-national"
                />
              </div>
            </div>
          </div>

          {/* Company Section - Only show for non-invite flow */}
          {!isInviteFlow && (
            <div className="space-y-3 pt-3 border-t">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Organization Details</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
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
                    className="h-10 focus:border-mint focus:ring-mint"
                    disabled={isLoading}
                    autoComplete="organization"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="companyType" className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    Company type
                  </Label>
                  <select
                    id="companyType"
                    value={companyType}
                    onChange={(e) => setCompanyType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                    <SelectTrigger className="h-10 focus:border-mint focus:ring-mint">
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
                    <SelectTrigger className="h-10 focus:border-mint focus:ring-mint">
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
            <Alert variant="destructive" className="py-2 bg-[var(--cloudact-bg-coral)] border-coral">
              <AlertDescription className="text-sm text-coral">{serverError}</AlertDescription>
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
        <Link href="/login" className="font-semibold text-ca-blue hover:text-ca-blue-dark hover:underline">
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint text-black shadow-lg">
          <Cloud className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-600">Start your {DEFAULT_TRIAL_DAYS}-day free trial</p>
        </div>
      </div>
      <div className="glass-card p-5 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-mint-dark" />
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center mesh-gradient p-4">
      <Suspense fallback={<SignupFormFallback />}>
        <SignupForm />
      </Suspense>
    </div>
  )
}
