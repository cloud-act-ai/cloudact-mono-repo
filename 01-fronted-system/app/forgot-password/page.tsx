"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { Loader2, Mail, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react"
import { AuthLayout } from "@/components/auth/auth-layout"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

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

      setSuccess(true)
    } catch {
      // Use generic error message to prevent email enumeration
      setError("Failed to send reset email. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout variant="login">
        <div className="space-y-6 sm:space-y-8">
          {/* Success Header */}
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#90FCA6]/20">
                <CheckCircle2 className="h-6 w-6 text-[#16a34a]" />
              </div>
            </div>
            <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0a0a0b] dark:text-white tracking-[-0.02em] leading-tight">
              Check your email
            </h1>
            <p className="text-[14px] sm:text-[15px] text-gray-500 dark:text-white/60 leading-relaxed">
              We've sent a password reset link to{" "}
              <span className="font-medium text-[#0a0a0b] dark:text-white">{email}</span>
            </p>
          </div>

          {/* Instructions */}
          <div className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
            <p className="text-[13px] sm:text-[14px] text-gray-600 dark:text-white/70 leading-relaxed">
              Click the link in the email to reset your password. The link will expire in 24 hours.
            </p>
          </div>

          {/* Back to Login Button */}
          <Link
            href="/login"
            className="group flex items-center justify-center gap-2 sm:gap-3 w-full h-[48px] sm:h-[52px] rounded-xl sm:rounded-2xl bg-[#90FCA6] text-[#0a0a0b] font-semibold text-[14px] sm:text-[15px] transition-all duration-300 hover:bg-[#6EE890] hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Login
          </Link>

          {/* Resend hint */}
          <p className="text-center text-[12px] sm:text-[13px] text-gray-400 dark:text-white/40">
            Didn't receive the email?{" "}
            <button
              type="button"
              onClick={() => setSuccess(false)}
              className="font-medium text-gray-500 dark:text-white/50 hover:text-[#16a34a] dark:hover:text-[#90FCA6] transition-colors"
            >
              Try again
            </button>
          </p>
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
            Forgot password?
          </h1>
          <p className="text-[14px] sm:text-[15px] text-gray-500 dark:text-white/60 leading-relaxed">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" suppressHydrationWarning>
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
                  Sending...
                </>
              ) : (
                <>
                  Send Reset Link
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
