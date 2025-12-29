"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  Loader2,
  Key,
  Check,
  AlertCircle,
  Shield,
  Lock,
  Eye,
  Fingerprint,
} from "lucide-react"

export default function SecurityPage() {
  const router = useRouter()
  useParams()

  const [isLoading, setIsLoading] = useState(true)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState("")

  useEffect(() => {
    document.title = "Security | CloudAct.ai"
  }, [])

  const fetchUser = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setEmail(user.email || "")
    } catch {
      setError("Failed to load user data")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    void fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [success])

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
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsResettingPassword(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading security settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-0">
      {/* Header */}
      <div className="mb-6 sm:mb-10">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6] to-[#B8FDCA] flex items-center justify-center shadow-sm flex-shrink-0">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-slate-900" />
          </div>
          <h1 className="text-[24px] sm:text-[32px] font-bold text-slate-900 tracking-tight leading-none">
            Security
          </h1>
        </div>
        <p className="text-[13px] sm:text-[15px] text-slate-500 mt-1.5 sm:mt-2 max-w-lg ml-[50px] sm:ml-[60px]">
          Manage your password and account security
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 sm:gap-6 mb-6 sm:mb-8 overflow-x-auto scrollbar-hide pb-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-[#90FCA6]/15 flex items-center justify-center">
            <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <p className="text-[12px] sm:text-[14px] text-slate-600 font-medium">Account</p>
            <div className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-[#90FCA6]/15">
              <div className="h-1.5 w-1.5 rounded-full bg-[#1a7a3a]" />
              <p className="text-[10px] sm:text-[12px] text-[#1a7a3a] font-semibold">Protected</p>
            </div>
          </div>
        </div>
        <div className="h-6 sm:h-8 w-px bg-slate-200 flex-shrink-0"></div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center">
            <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500" />
          </div>
          <div>
            <p className="text-[12px] sm:text-[14px] text-slate-600 font-medium">Password</p>
            <p className="text-[10px] sm:text-[12px] text-slate-500 font-medium">Set</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[13px] font-medium text-rose-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 rounded-xl bg-[#90FCA6]/15 border border-[#90FCA6]/20 flex items-center gap-3">
          <Check className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
          <p className="text-[13px] font-medium text-[#1a7a3a]">{success}</p>
        </div>
      )}

      {/* Password Section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
            Authentication
          </h2>
        </div>

        <div className="metric-card shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="metric-card-content">
            <div className="group relative">
              {/* Left accent */}
              <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-[#90FCA6] opacity-60 group-hover:opacity-100 transition-opacity" />

              <div className="pl-5 py-5 pr-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="h-11 w-11 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
                    <Key className="h-5 w-5 text-[#1a7a3a]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
                      Password
                    </h3>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Reset your password via email verification
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleResetPassword}
                  disabled={isResettingPassword}
                  className="console-button-primary h-11 px-6 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResettingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Tips */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
            Security Best Practices
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: <Lock className="h-4 w-4" />,
              title: "Strong Password",
              description: "Use a unique password with mixed characters",
              accent: "#1a7a3a",
            },
            {
              icon: <Eye className="h-4 w-4" />,
              title: "Never Share",
              description: "Keep your password and reset links private",
              accent: "#007AFF",
            },
            {
              icon: <Shield className="h-4 w-4" />,
              title: "Monitor Activity",
              description: "Check email for security notifications",
              accent: "#1a7a3a",
            },
            {
              icon: <Fingerprint className="h-4 w-4" />,
              title: "Secure Logout",
              description: "Always log out on shared devices",
              accent: "#FF6C5E",
            },
          ].map((tip, idx) => (
            <div
              key={idx}
              className="metric-card p-4 hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-start gap-3">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${tip.accent}15` }}
                >
                  <div style={{ color: tip.accent }}>{tip.icon}</div>
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-900">{tip.title}</h3>
                  <p className="text-[12px] text-slate-600 mt-0.5">{tip.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Info Footer */}
      <div className="mt-10 metric-card shadow-sm bg-gradient-to-br from-[#90FCA6]/5 via-slate-50 to-white border-[#90FCA6]/10">
        <div className="metric-card-content">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-white border border-[#90FCA6]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Shield className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900 mb-1">
                Your account is protected
              </h3>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                All passwords are encrypted using industry-standard hashing algorithms.
                We never store your password in plain text.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
