"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Mail, Lock, Phone, Building2, Briefcase, DollarSign, Globe, ArrowRight, ChevronDown, CheckCircle2, Shield, User } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AuthLayout } from "@/components/auth/auth-layout"
import { checkSignupRateLimit, logSignupSuccess, logSignupFailure } from "@/actions/auth"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES, isValidCurrency, isValidTimezone, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/i18n"
import { COUNTRY_CODES } from "@/lib/constants/countries"
import { isValidPhone, getPhoneHint, formatPhoneNumber, getPhonePlaceholder } from "@/lib/utils/phone"
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
 */
function isValidRedirect(url: string | null): url is string {
  if (!url) return false
  if (!url.startsWith("/")) return false
  if (url.startsWith("//")) return false
  if (url.includes("\\")) return false
  if (url.includes("@")) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(url)) return false
  return true
}

// Custom Select Component
function PremiumSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  icon: Icon,
  focused,
  onFocus,
  onBlur,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  focused?: boolean
  onFocus?: () => void
  onBlur?: () => void
}) {
  return (
    <div className="relative group">
      {Icon && (
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused ? 'text-[#16a34a]' : 'text-gray-400'}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </div>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`w-full h-[48px] sm:h-[52px] ${Icon ? 'pl-12' : 'pl-4'} pr-10 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
    </div>
  )
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get("redirect")
  const redirectTo = isValidRedirect(rawRedirect) ? rawRedirect : null
  const prefillEmail = searchParams.get("email")
  const isInviteFlow = redirectTo?.startsWith("/invite/")

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [countryCode, setCountryCode] = useState("+1")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyType, setCompanyType] = useState("company")
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)

  // Format phone number as user types (country-aware formatting)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value, countryCode)
    setPhoneNumber(formatted)
  }

  // Reset phone formatting when country changes
  const handleCountryChange = (newCountryCode: string) => {
    setCountryCode(newCountryCode)
    // Re-format existing phone number for new country
    if (phoneNumber) {
      const formatted = formatPhoneNumber(phoneNumber, newCountryCode)
      setPhoneNumber(formatted)
    }
  }

  useEffect(() => {
    if (prefillEmail) {
      try {
        const decoded = decodeURIComponent(prefillEmail)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (emailRegex.test(decoded) && decoded.length <= 254) {
          setEmail(decoded)
        }
      } catch (decodeError) {
        // Invalid URL encoding - log for debugging but don't surface to user
        if (process.env.NODE_ENV === "development") {
          console.warn("[Signup] Failed to decode prefill email:", decodeError)
        }
      }
    }
  }, [prefillEmail])

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    // Validate first name
    if (!firstName.trim() || firstName.trim().length < 1) {
      setServerError("Please enter your first name")
      return
    }
    // Validate last name
    if (!lastName.trim() || lastName.trim().length < 1) {
      setServerError("Please enter your last name")
      return
    }
    if (!isValidPhone(phoneNumber, countryCode)) {
      const hint = getPhoneHint(countryCode)
      const country = COUNTRY_CODES.find(c => c.code === countryCode)?.country || "your country"
      setServerError(`Please enter a valid phone number for ${country} (${hint})`)
      return
    }
    setServerError(null)
    setStep(2)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null) // AUTH-001 FIX: Clear error before validation
    setIsLoading(true)

    // FIX EDGE-002: Validate phone for ALL flows including invite flow
    if (!isValidPhone(phoneNumber, countryCode)) {
      const hint = getPhoneHint(countryCode)
      const country = COUNTRY_CODES.find(c => c.code === countryCode)?.country || "your country"
      setServerError(`Please enter a valid phone number for ${country} (${hint})`)
      setIsLoading(false)
      return
    }

    // Check rate limiting first
    const normalizedEmail = email.trim().toLowerCase()
    const rateLimitCheck = await checkSignupRateLimit(normalizedEmail)
    if (!rateLimitCheck.allowed) {
      setServerError(rateLimitCheck.error || "Too many signup attempts. Please try again later.")
      setIsLoading(false)
      return
    }

    if (!isInviteFlow && !isValidOrgName(companyName)) {
      setServerError("Please enter a valid company name (2-100 characters)")
      setIsLoading(false)
      return
    }

    const sanitizedCompanyName = isInviteFlow ? "" : sanitizeOrgName(companyName)
    const fullPhone = `${countryCode} ${phoneNumber.trim()}`

    try {
      const supabase = createClient()
      const finalRedirect = redirectTo || "/onboarding/billing"

      // Combine first and last name for full_name (used by database trigger)
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")

      const userData: Record<string, string> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName, // Required by handle_new_user() trigger
        phone: fullPhone,
        signup_completed_at: new Date().toISOString(),
      }

      if (!isInviteFlow) {
        userData.pending_company_name = sanitizedCompanyName
        userData.pending_company_type = companyType
        userData.pending_currency = isValidCurrency(currency) ? currency : DEFAULT_CURRENCY
        userData.pending_timezone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE
      }

      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const { data: authData, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${origin}${finalRedirect}`,
          data: userData,
        },
      })

      if (signupError) {
        await logSignupFailure(normalizedEmail, signupError.message)
        throw new Error(signupError.message)
      }
      if (!authData.user) {
        await logSignupFailure(normalizedEmail, "No user returned")
        throw new Error("Signup failed")
      }

      // Log signup success
      await logSignupSuccess(normalizedEmail, authData.user.id)

      // AUTH-002 FIX: Wrap signin in try-catch to handle partial auth state gracefully
      try {
        const { error: signinError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (signinError) {
          // Signup succeeded but signin failed - redirect to login with helpful message
          const loginUrl = `/login?redirect=${encodeURIComponent(finalRedirect)}&message=Account created! Please sign in to continue`
          setIsLoading(false)
          if (typeof window !== "undefined") {
            window.location.href = loginUrl
          }
          return
        }
      } catch (signinErr) {
        // Signin threw exception - still redirect to login since account was created
        console.warn("[Signup] Auto-signin failed after signup:", signinErr)
        const loginUrl = `/login?redirect=${encodeURIComponent(finalRedirect)}&message=Account created! Please sign in to continue`
        setIsLoading(false)
        if (typeof window !== "undefined") {
          window.location.href = loginUrl
        }
        return
      }

      // AUTH-003 FIX: Reset loading state before navigation
      setIsLoading(false)
      // Use window.location for full page navigation after auth
      if (typeof window !== "undefined") window.location.href = finalRedirect
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : "An error occurred during signup")
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout variant="signup">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0a0a0b] tracking-[-0.02em] leading-tight">
            {isInviteFlow ? "Join your team" : step === 1 ? "Create your account" : "Set up organization"}
          </h1>
          <p className="text-[14px] sm:text-[15px] text-gray-500 leading-relaxed">
            {isInviteFlow
              ? "Sign up to accept your team invitation"
              : step === 1
              ? `${DEFAULT_TRIAL_DAYS} days free. No credit card required.`
              : "Configure your workspace settings"}
          </p>
        </div>

        {/* Progress Steps */}
        {!isInviteFlow && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all duration-300 ${step >= 1 ? 'bg-[#90FCA6] text-[#0a0a0b]' : 'bg-gray-100 text-gray-400'}`}>
                {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : '1'}
              </div>
              <span className={`text-[13px] font-medium ${step >= 1 ? 'text-[#0a0a0b]' : 'text-gray-400'}`}>Account</span>
            </div>
            <div className="flex-1 h-[2px] bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full bg-[#90FCA6] transition-all duration-500 ${step >= 2 ? 'w-full' : 'w-0'}`} />
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all duration-300 ${step >= 2 ? 'bg-[#90FCA6] text-[#0a0a0b]' : 'bg-gray-100 text-gray-400'}`}>
                2
              </div>
              <span className={`text-[13px] font-medium ${step >= 2 ? 'text-[#0a0a0b]' : 'text-gray-400'}`}>Organization</span>
            </div>
          </div>
        )}

        {/* Form */}
        {step === 1 ? (
          <form onSubmit={isInviteFlow ? onSubmit : handleNextStep} className="space-y-4" suppressHydrationWarning>
            {/* First Name and Last Name Row */}
            <div className="grid grid-cols-2 gap-3">
              {/* First Name Field */}
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                  First name
                </label>
                <div className="relative">
                  <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'firstName' ? 'text-[#16a34a]' : 'text-gray-400'}`}>
                    <User className="h-[18px] w-[18px]" strokeWidth={2} />
                  </div>
                  <input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    required
                    minLength={1}
                    maxLength={50}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onFocus={() => setFocusedField('firstName')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full h-[48px] sm:h-[52px] pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                    disabled={isLoading}
                    autoComplete="given-name"
                  />
                </div>
              </div>

              {/* Last Name Field */}
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                  Last name
                </label>
                <div className="relative">
                  <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'lastName' ? 'text-[#16a34a]' : 'text-gray-400'}`}>
                    <User className="h-[18px] w-[18px]" strokeWidth={2} />
                  </div>
                  <input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    required
                    minLength={1}
                    maxLength={50}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onFocus={() => setFocusedField('lastName')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full h-[48px] sm:h-[52px] pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                    disabled={isLoading}
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5" suppressHydrationWarning>
              <label htmlFor="email" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                Email address
              </label>
              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'email' ? 'text-[#16a34a]' : 'text-gray-400'}`}>
                  <Mail className="h-[18px] w-[18px]" strokeWidth={2} />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full h-[48px] sm:h-[52px] pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5" suppressHydrationWarning>
              <label htmlFor="password" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'password' ? 'text-[#16a34a]' : 'text-gray-400'}`}>
                  <Lock className="h-[18px] w-[18px]" strokeWidth={2} />
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full h-[48px] sm:h-[52px] pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div className="space-y-1.5">
              <label htmlFor="phone" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                Phone number
              </label>
              <div className="flex gap-2">
                <div className="relative w-[100px] sm:w-[110px]">
                  <select
                    value={countryCode}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    disabled={isLoading}
                    className="w-full h-[48px] sm:h-[52px] pl-3 pr-8 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10 appearance-none cursor-pointer"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={`${c.code}-${c.country}`} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative flex-1">
                  <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'phone' ? 'text-[#16a34a]' : 'text-gray-400'}`}>
                    <Phone className="h-[18px] w-[18px]" strokeWidth={2} />
                  </div>
                  <input
                    id="phone"
                    type="tel"
                    placeholder={getPhonePlaceholder(countryCode)}
                    required
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full h-[48px] sm:h-[52px] pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                    disabled={isLoading}
                    autoComplete="tel-national"
                  />
                </div>
              </div>
            </div>

            {/* Error Alert */}
            {serverError && (
              <div className="p-3 rounded-xl bg-[#FFF5F3] border border-[#FF6C5E]/20">
                <p className="text-[13px] font-medium text-[#CC4F35]">{serverError}</p>
              </div>
            )}

            {/* Submit Button - Mint */}
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#90FCA6] text-[#0a0a0b] font-semibold text-[14px] sm:text-[15px] transition-all duration-300 hover:bg-[#6EE890] hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isInviteFlow ? "Creating account..." : "Processing..."}
                  </>
                ) : (
                  <>
                    {isInviteFlow ? "Create account & accept invite" : "Continue"}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" suppressHydrationWarning>
            {/* Company Name */}
            <div className="space-y-1.5">
              <label htmlFor="companyName" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                Company name
              </label>
              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'company' ? 'text-[#16a34a]' : 'text-gray-400'}`}>
                  <Building2 className="h-[18px] w-[18px]" strokeWidth={2} />
                </div>
                <input
                  id="companyName"
                  type="text"
                  placeholder="Acme Inc."
                  required
                  minLength={2}
                  maxLength={100}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onFocus={() => setFocusedField('company')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full h-[48px] sm:h-[52px] pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[14px] sm:text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                  disabled={isLoading}
                  autoComplete="organization"
                />
              </div>
            </div>

            {/* Company Type */}
            <div className="space-y-1.5">
              <label htmlFor="companyType" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                Company type
              </label>
              <PremiumSelect
                id="companyType"
                value={companyType}
                onChange={setCompanyType}
                options={ORG_TYPES}
                disabled={isLoading}
                icon={Briefcase}
                focused={focusedField === 'companyType'}
                onFocus={() => setFocusedField('companyType')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            {/* Currency and Timezone Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="currency" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                  Currency
                </label>
                <PremiumSelect
                  id="currency"
                  value={currency}
                  onChange={setCurrency}
                  options={SUPPORTED_CURRENCIES.map((c) => ({
                    value: c.code,
                    label: `${c.symbol} ${c.code}`,
                  }))}
                  disabled={isLoading}
                  icon={DollarSign}
                  focused={focusedField === 'currency'}
                  onFocus={() => setFocusedField('currency')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="timezone" className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                  Timezone
                </label>
                <PremiumSelect
                  id="timezone"
                  value={timezone}
                  onChange={setTimezone}
                  options={SUPPORTED_TIMEZONES.map((tz) => ({
                    value: tz.value,
                    label: tz.label,
                  }))}
                  disabled={isLoading}
                  icon={Globe}
                  focused={focusedField === 'timezone'}
                  onFocus={() => setFocusedField('timezone')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>

            {/* Error Alert */}
            {serverError && (
              <div className="p-3 rounded-xl bg-[#FFF5F3] border border-[#FF6C5E]/20">
                <p className="text-[13px] font-medium text-[#CC4F35]">{serverError}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isLoading}
                className="w-1/3 h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-white text-[14px] sm:text-[15px] font-semibold text-gray-600 transition-all duration-200 hover:border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex-1 h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#90FCA6] text-[#0a0a0b] font-semibold text-[14px] sm:text-[15px] transition-all duration-300 hover:bg-[#6EE890] hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create account
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Security Note */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
          <Shield className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-gray-500 leading-relaxed">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="text-[#0a0a0b] font-medium hover:underline">Terms of Service</Link>
            {" "}and{" "}
            <Link href="/privacy" className="text-[#0a0a0b] font-medium hover:underline">Privacy Policy</Link>
          </p>
        </div>

        {/* Sign In Link */}
        <div className="text-center text-[14px] text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#0a0a0b] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  )
}

function SignupFormFallback() {
  return (
    <AuthLayout variant="signup">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-56 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-4">
          {/* First Name and Last Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="h-[48px] bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-[48px] bg-gray-100 rounded-xl animate-pulse" />
          </div>
          <div className="h-[48px] bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-[48px] bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-[48px] bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-[48px] bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    </AuthLayout>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFormFallback />}>
      <SignupForm />
    </Suspense>
  )
}
