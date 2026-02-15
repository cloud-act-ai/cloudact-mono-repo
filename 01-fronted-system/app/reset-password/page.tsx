"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Lock, ArrowRight, AlertCircle, ArrowLeft } from "lucide-react"
import { AuthLayout } from "@/components/auth/auth-layout"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Session state - wait for Supabase to process the recovery token from URL
  const [isSessionReady, setIsSessionReady] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const sessionReadyRef = useRef(false)

  // Handle recovery token from URL hash and establish session
  useEffect(() => {
    const supabase = createClient()
    let timeoutId: NodeJS.Timeout

    const markSessionReady = () => {
      sessionReadyRef.current = true
      setIsSessionReady(true)
      setIsCheckingSession(false)
    }

    const processRecoveryToken = async () => {
      // Check for hash fragment with access_token (implicit flow)
      const hash = window.location.hash
      if (hash && hash.includes("access_token") && hash.includes("type=recovery")) {
        // Parse the hash to get the tokens
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get("access_token")
        const refreshToken = params.get("refresh_token")

        if (accessToken && refreshToken) {
          // Set the session from the hash tokens
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (data.session && !error) {
            markSessionReady()
            // Clear the hash from URL for cleaner display
            window.history.replaceState(null, "", window.location.pathname)
            return true
          }
        }
      }

      // Fallback: check if we already have a valid session
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        markSessionReady()
        return true
      }

      return false
    }

    // Listen for auth state changes (PASSWORD_RECOVERY event)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
          markSessionReady()
          if (timeoutId) clearTimeout(timeoutId)
        }
      }
    )

    // Process the recovery token
    processRecoveryToken().then((hasSession) => {
      if (!hasSession) {
        // Wait for token processing, then show error if no session
        timeoutId = setTimeout(() => {
          // Use ref to avoid stale closure
          if (!sessionReadyRef.current) {
            setSessionError("Invalid or expired reset link. Please request a new one.")
            setIsCheckingSession(false)
          }
        }, 8000) // 8 second timeout for token processing
      }
    })

    return () => {
      subscription.unsubscribe()
      if (timeoutId) clearTimeout(timeoutId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      setIsLoading(false)
      return
    }

    if (!/[A-Z]/.test(password)) {
      setError("Password must contain at least one uppercase letter")
      setIsLoading(false)
      return
    }

    if (!/[a-z]/.test(password)) {
      setError("Password must contain at least one lowercase letter")
      setIsLoading(false)
      return
    }

    if (!/[0-9]/.test(password)) {
      setError("Password must contain at least one number")
      setIsLoading(false)
      return
    }

    try {
      const supabase = createClient()

      // Verify session is still valid before updating
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError("Your session has expired. Please request a new reset link.")
        setIsLoading(false)
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        console.error("[reset-password] Update failed:", updateError.message)
        throw updateError
      }

      // Get user's org to redirect properly
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Use maybeSingle() to handle 0 or 1 rows gracefully
        const { data: memberData } = await supabase
          .from("organization_members")
          .select("org_id, organizations(org_slug)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle()

        if (memberData?.organizations) {
          const orgs = Array.isArray(memberData.organizations) ? memberData.organizations[0] : memberData.organizations
          const org = orgs as { org_slug: string }
          router.push(`/${org.org_slug}/dashboard?password_reset=true`)
          return
        }
      }

      // No org found, go to onboarding
      router.push("/onboarding/billing")
    } catch (err) {
      // Provide specific error messages for common issues
      const errorMessage = err instanceof Error ? err.message : "Unknown error"

      if (errorMessage.includes("expired") || errorMessage.includes("invalid")) {
        setError("Your reset link has expired. Please request a new one.")
      } else if (errorMessage.includes("same_password") || errorMessage.includes("different")) {
        setError("New password must be different from your current password.")
      } else if (errorMessage.includes("weak") || errorMessage.includes("strength")) {
        setError("Password is too weak. Please use a stronger password.")
      } else {
        setError("Failed to reset password. Please request a new reset link.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading state while checking session
  if (isCheckingSession) {
    return (
      <AuthLayout variant="login">
        <div className="space-y-6 sm:space-y-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#90FCA6]/20">
              <Loader2 className="h-8 w-8 text-[#16a34a] animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0a0a0b] dark:text-white tracking-[-0.02em]">
                Verifying Link
              </h1>
              <p className="text-[14px] sm:text-[15px] text-gray-500 dark:text-white/60">
                Please wait while we verify your reset link...
              </p>
            </div>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // Show error if session could not be established
  if (sessionError) {
    return (
      <AuthLayout variant="login">
        <div className="space-y-6 sm:space-y-8">
          {/* Error Header */}
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6C5E]/10">
                <AlertCircle className="h-6 w-6 text-[#FF6C5E]" />
              </div>
            </div>
            <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0a0a0b] dark:text-white tracking-[-0.02em] leading-tight">
              Link Expired
            </h1>
            <p className="text-[14px] sm:text-[15px] text-gray-500 dark:text-white/60 leading-relaxed">
              {sessionError}
            </p>
          </div>

          {/* Instructions */}
          <div className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
            <p className="text-[13px] sm:text-[14px] text-gray-600 dark:text-white/70 leading-relaxed">
              Password reset links expire after 24 hours. Please request a new link to reset your password.
            </p>
          </div>

          {/* Request New Link Button */}
          <Link
            href="/forgot-password"
            className="group flex items-center justify-center gap-2 sm:gap-3 w-full h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#90FCA6] text-[#0a0a0b] font-semibold text-[14px] sm:text-[15px] transition-all duration-300 hover:bg-[#6EE890] hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5"
          >
            Request New Link
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100 dark:border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-[var(--cloudact-obsidian,#0a0a0b)] text-gray-400 dark:text-white/40 text-[12px] sm:text-[13px]">
                Remember your password?
              </span>
            </div>
          </div>

          {/* Back to Login Link */}
          <Link
            href="/login"
            className="group flex items-center justify-center gap-2 sm:gap-3 w-full h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl border-2 border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 text-[14px] sm:text-[15px] font-semibold text-[#0a0a0b] dark:text-white transition-all duration-300 hover:border-[#90FCA6] hover:bg-[#90FCA6]/5 dark:hover:bg-[#90FCA6]/10"
          >
            <ArrowLeft className="h-4 w-4 text-gray-400 dark:text-white/40 transition-all duration-300 group-hover:text-[#16a34a] dark:group-hover:text-[#90FCA6] group-hover:-translate-x-1" />
            <span>Back to Sign in</span>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout variant="login">
      <div className="space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="space-y-2 sm:space-y-3">
          <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0a0a0b] dark:text-white tracking-[-0.02em] leading-tight">
            Reset Password
          </h1>
          <p className="text-[14px] sm:text-[15px] text-gray-500 dark:text-white/60 leading-relaxed">
            Enter your new password below
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" suppressHydrationWarning>
          {/* New Password Field */}
          <div className="space-y-1.5 sm:space-y-2" suppressHydrationWarning>
            <label
              htmlFor="password"
              className="block text-[12px] sm:text-[13px] font-semibold text-[#0a0a0b] dark:text-white/80 tracking-wide uppercase"
            >
              New Password
            </label>
            <div className="relative group">
              <div className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'password' ? 'text-[#16a34a]' : 'text-gray-400 dark:text-white/40'}`}>
                <Lock className="h-[16px] sm:h-[18px] w-[16px] sm:w-[18px]" strokeWidth={2} />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Min 8 characters"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-[48px] sm:h-[52px] pl-10 sm:pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-[14px] sm:text-[15px] text-[#0a0a0b] dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none transition-all duration-200 hover:border-gray-200 dark:hover:border-white/20 focus:border-[#90FCA6] focus:bg-white dark:focus:bg-white/10 focus:ring-4 focus:ring-[#90FCA6]/10"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-1.5 sm:space-y-2" suppressHydrationWarning>
            <label
              htmlFor="confirmPassword"
              className="block text-[12px] sm:text-[13px] font-semibold text-[#0a0a0b] dark:text-white/80 tracking-wide uppercase"
            >
              Confirm Password
            </label>
            <div className="relative group">
              <div className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focusedField === 'confirmPassword' ? 'text-[#16a34a]' : 'text-gray-400 dark:text-white/40'}`}>
                <Lock className="h-[16px] sm:h-[18px] w-[16px] sm:w-[18px]" strokeWidth={2} />
              </div>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setFocusedField('confirmPassword')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-[48px] sm:h-[52px] pl-10 sm:pl-12 pr-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-[14px] sm:text-[15px] text-[#0a0a0b] dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none transition-all duration-200 hover:border-gray-200 dark:hover:border-white/20 focus:border-[#90FCA6] focus:bg-white dark:focus:bg-white/10 focus:ring-4 focus:ring-[#90FCA6]/10"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FFF5F3] dark:bg-[#FF6C5E]/10 border border-[#FF6C5E]/20">
              <p className="text-[13px] sm:text-[14px] font-medium text-[#CC4F35] dark:text-[#FF6C5E]">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#90FCA6] text-[#0a0a0b] font-semibold text-[14px] sm:text-[15px] transition-all duration-300 hover:bg-[#6EE890] hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none overflow-hidden"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  Reset Password
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </span>
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}
