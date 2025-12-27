"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Mail, Lock, ArrowRight, Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AuthLayout } from "@/components/auth/auth-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"

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

function LoginForm() {
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get("redirect") || searchParams.get("redirectTo")
  const redirectTo = isValidRedirect(rawRedirect) ? rawRedirect : null
  const reason = searchParams.get("reason")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionCleared, setSessionCleared] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Clear any stale sessions when arriving at login page
  // This prevents "Invalid Refresh Token" errors from persisting
  useEffect(() => {
    const clearStaleSession = async () => {
      try {
        const supabase = createClient()
        // Sign out to clear any invalid/stale tokens
        await supabase.auth.signOut({ scope: 'local' })
        setSessionCleared(true)

        // Show message if redirected due to session expiry
        if (reason === 'session_expired') {
          setError("Your session has expired. Please sign in again.")
        } else if (reason === 'auth_error') {
          setError("Authentication error. Please sign in again.")
        }
      } catch {
        setSessionCleared(true)
      }
    }

    clearStaleSession()
  }, [reason])

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    let supabase
    try {
      supabase = createClient()
    } catch (configError) {
      setError("Supabase is not configured. Please set up .env.local with your Supabase credentials.")
      setIsLoading(false)
      return
    }

    try {

      // Normalize email to match signup flow
      const normalizedEmail = email.trim().toLowerCase()

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (authError) throw new Error(authError.message)
      if (!authData.user) throw new Error("Login failed")

      // Update last login timestamp (ignore errors)
      try {
        await supabase.rpc("update_last_login", { p_user_id: authData.user.id })
      } catch {
        // Ignore - function may not exist yet
      }

      // If there's a redirect parameter (e.g., from invite), go there
      if (redirectTo) {
        if (typeof window !== "undefined") window.location.href = redirectTo
        return
      }

      // Otherwise, check if user has an organization
      // Use maybeSingle() to handle 0 or 1 rows gracefully
      const { data: orgData, error: orgError } = await supabase
        .from("organization_members")
        .select(`org_id, organizations!inner(org_slug)`)
        .eq("user_id", authData.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()

      if (orgData?.organizations) {
        // Handle case where it might be returned as an array or object depending on relationship inference
        const org = (Array.isArray(orgData.organizations)
          ? orgData.organizations[0]
          : orgData.organizations) as { org_slug: string }

        if (typeof window !== "undefined") window.location.href = `/${org.org_slug}/dashboard`
      } else {
        if (typeof window !== "undefined") window.location.href = "/onboarding/billing"
      }
    } catch (err: unknown) {
      // Use generic error message to prevent account enumeration attacks
      setError("Invalid email or password")
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout variant="login">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-[32px] font-bold text-[#0a0a0b] tracking-[-0.02em] leading-tight">
            Welcome back
          </h1>
          <p className="text-[15px] text-gray-500 leading-relaxed">
            Sign in to your account to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handlePasswordLogin} className="space-y-5" suppressHydrationWarning>
          {/* Email Field */}
          <div className="space-y-2" suppressHydrationWarning>
            <label
              htmlFor="email"
              className="block text-[13px] font-semibold text-[#0a0a0b] tracking-wide"
            >
              Email address
            </label>
            <div className="relative group">
              <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'email' ? 'text-[#1a7a3a]' : 'text-gray-400'}`}>
                <Mail className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-[52px] pl-12 pr-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-2" suppressHydrationWarning>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-[13px] font-semibold text-[#0a0a0b] tracking-wide"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[13px] font-medium text-gray-500 hover:text-[#0a0a0b] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative group">
              <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'password' ? 'text-[#1a7a3a]' : 'text-gray-400'}`}>
                <Lock className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-[52px] pl-12 pr-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-[15px] text-[#0a0a0b] placeholder:text-gray-400 outline-none transition-all duration-200 hover:border-gray-200 focus:border-[#90FCA6] focus:bg-white focus:ring-4 focus:ring-[#90FCA6]/10"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-4 rounded-2xl bg-[#FFF5F3] border border-[#FF6C5E]/20">
              <p className="text-[14px] font-medium text-[#CC4F35]">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full h-[52px] rounded-2xl bg-[#0a0a0b] text-white font-semibold text-[15px] transition-all duration-300 hover:bg-[#1a1a1b] hover:shadow-xl hover:shadow-black/10 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none overflow-hidden"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </span>
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-400 text-[13px]">New to CloudAct?</span>
          </div>
        </div>

        {/* Sign Up Link */}
        <Link
          href="/signup"
          className="group flex items-center justify-center gap-3 w-full h-[52px] rounded-2xl border-2 border-gray-100 bg-white text-[15px] font-semibold text-[#0a0a0b] transition-all duration-300 hover:border-[#90FCA6] hover:bg-[#90FCA6]/5"
        >
          <Sparkles className="h-4 w-4 text-[#90FCA6]" />
          <span>Start your free trial</span>
          <ArrowRight className="h-4 w-4 text-gray-400 transition-all duration-300 group-hover:text-[#1a7a3a] group-hover:translate-x-1" />
        </Link>
      </div>
    </AuthLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginFormFallback() {
  return (
    <AuthLayout variant="login">
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="h-10 w-48 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-5 w-64 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-5">
          <div className="h-[52px] bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-[52px] bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-[52px] bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    </AuthLayout>
  )
}
