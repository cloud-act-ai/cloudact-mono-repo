"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Mail, Lock, ArrowRight, Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AuthLayout } from "@/components/auth/auth-layout"

/**
 * Validate redirect URL to prevent open redirect attacks.
 * Only allows relative paths that don't escape to external sites.
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

  useEffect(() => {
    // Just show error message if redirected with a reason - don't clear any session
    if (reason === 'session_expired') {
      setError("Your session has expired. Please sign in again.")
    } else if (reason === 'auth_error') {
      setError("Authentication error. Please try again or contact support.")
    }
    setSessionCleared(true)
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
      const normalizedEmail = email.trim().toLowerCase()

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (authError) throw new Error(authError.message)
      if (!authData.user) throw new Error("Login failed")

      // Update last login timestamp (non-blocking, errors logged but not thrown)
      // Fire-and-forget with proper error handling - don't block navigation
      void (async () => {
        try {
          await supabase.rpc("update_last_login", { p_user_id: authData.user.id })
        } catch (err: unknown) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[Login] Failed to update last login:", err)
          }
        }
      })()

      if (redirectTo) {
        if (typeof window !== "undefined") {
          setIsLoading(false) // Reset before redirect
          window.location.href = redirectTo
        }
        return
      }

      const { data: orgData, error: orgError } = await supabase
        .from("organization_members")
        .select(`org_id, organizations!inner(org_slug)`)
        .eq("user_id", authData.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()

      if (orgError) {
        console.error("[Login] Failed to fetch organization:", orgError)
        // Still redirect to onboarding if we can't determine org
      }

      // Safe extraction of org_slug with proper type checking
      let targetPath = "/onboarding/billing"
      if (orgData?.organizations) {
        const orgs = orgData.organizations
        const org = Array.isArray(orgs) ? orgs[0] : orgs
        if (org && typeof org === "object" && "org_slug" in org && typeof org.org_slug === "string") {
          targetPath = `/${org.org_slug}/dashboard`
        }
      }

      if (typeof window !== "undefined") {
        setIsLoading(false) // Reset before redirect
        window.location.href = targetPath
      }
    } catch (err: unknown) {
      setError("Invalid email or password")
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout variant="login">
      <div className="space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="space-y-2 sm:space-y-3">
          <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0a0a0b] dark:text-white tracking-[-0.02em] leading-tight">
            Welcome back
          </h1>
          <p className="text-[14px] sm:text-[15px] text-gray-500 dark:text-white/60 leading-relaxed">
            Sign in to continue tracking your cloud spend
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handlePasswordLogin} className="space-y-4 sm:space-y-5" suppressHydrationWarning>
          {/* Email Field */}
          <div className="space-y-1.5 sm:space-y-2" suppressHydrationWarning>
            <label
              htmlFor="email"
              className="block text-[12px] sm:text-[13px] font-semibold text-[#0a0a0b] dark:text-white/80 tracking-wide uppercase"
            >
              Email address
            </label>
            <div className="relative group">
              <div className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'email' ? 'text-[#16a34a]' : 'text-gray-400 dark:text-white/40'}`}>
                <Mail className="h-[16px] sm:h-[18px] w-[16px] sm:w-[18px]" strokeWidth={2} />
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
                className="w-full h-[48px] sm:h-[52px] pl-10 sm:pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-[14px] sm:text-[15px] text-[#0a0a0b] dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none transition-all duration-200 hover:border-gray-200 dark:hover:border-white/20 focus:border-[#90FCA6] focus:bg-white dark:focus:bg-white/10 focus:ring-4 focus:ring-[#90FCA6]/10"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5 sm:space-y-2" suppressHydrationWarning>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-[12px] sm:text-[13px] font-semibold text-[#0a0a0b] dark:text-white/80 tracking-wide uppercase"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[12px] sm:text-[13px] font-medium text-gray-500 dark:text-white/50 hover:text-[#16a34a] dark:hover:text-[#90FCA6] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative group">
              <div className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'password' ? 'text-[#16a34a]' : 'text-gray-400 dark:text-white/40'}`}>
                <Lock className="h-[16px] sm:h-[18px] w-[16px] sm:w-[18px]" strokeWidth={2} />
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
                className="w-full h-[48px] sm:h-[52px] pl-10 sm:pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-[14px] sm:text-[15px] text-[#0a0a0b] dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none transition-all duration-200 hover:border-gray-200 dark:hover:border-white/20 focus:border-[#90FCA6] focus:bg-white dark:focus:bg-white/10 focus:ring-4 focus:ring-[#90FCA6]/10"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FFF5F3] dark:bg-[#FF6C5E]/10 border border-[#FF6C5E]/20">
              <p className="text-[13px] sm:text-[14px] font-medium text-[#CC4F35] dark:text-[#FF6C5E]">{error}</p>
            </div>
          )}

          {/* Submit Button - Mint */}
          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#90FCA6] text-[#0a0a0b] font-semibold text-[14px] sm:text-[15px] transition-all duration-300 hover:bg-[#6EE890] hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none overflow-hidden"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </span>
          </button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100 dark:border-white/10" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white dark:bg-[var(--cloudact-obsidian,#0a0a0b)] text-gray-400 dark:text-white/40 text-[12px] sm:text-[13px]">New to CloudAct?</span>
          </div>
        </div>

        {/* Sign Up Link */}
        <Link
          href="/signup"
          className="group flex items-center justify-center gap-2 sm:gap-3 w-full h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl border-2 border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 text-[14px] sm:text-[15px] font-semibold text-[#0a0a0b] dark:text-white transition-all duration-300 hover:border-[#90FCA6] hover:bg-[#90FCA6]/5 dark:hover:bg-[#90FCA6]/10"
        >
          <Sparkles className="h-4 w-4 text-[#90FCA6]" />
          <span>Start your free trial</span>
          <ArrowRight className="h-4 w-4 text-gray-400 dark:text-white/40 transition-all duration-300 group-hover:text-[#16a34a] dark:group-hover:text-[#90FCA6] group-hover:translate-x-1" />
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
      <div className="space-y-6 sm:space-y-8">
        <div className="space-y-2 sm:space-y-3">
          <div className="h-8 sm:h-10 w-48 bg-gray-100 dark:bg-white/10 rounded-xl animate-pulse" />
          <div className="h-4 sm:h-5 w-64 bg-gray-100 dark:bg-white/10 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-4 sm:space-y-5">
          <div className="h-[48px] sm:h-[52px] bg-gray-100 dark:bg-white/10 rounded-xl sm:rounded-2xl animate-pulse" />
          <div className="h-[48px] sm:h-[52px] bg-gray-100 dark:bg-white/10 rounded-xl sm:rounded-2xl animate-pulse" />
          <div className="h-[48px] sm:h-[52px] bg-gray-100 dark:bg-white/10 rounded-xl sm:rounded-2xl animate-pulse" />
        </div>
      </div>
    </AuthLayout>
  )
}
