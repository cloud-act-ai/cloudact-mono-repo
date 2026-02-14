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

// Premium components - same as dashboard/pipeline pages
import { StatRow } from "@/components/ui/stat-row"
import { PremiumCard, SectionHeader } from "@/components/ui/premium-card"
import { LoadingState } from "@/components/ui/loading-state"
import { site } from "@/lib/site"

export default function SecurityPage() {
  const router = useRouter()
  useParams()

  const [isLoading, setIsLoading] = useState(true)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState("")

  useEffect(() => {
    document.title = `Security | ${site.name}`
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

  // Stats for StatRow component - same pattern as dashboard/pipelines
  const stats = [
    { icon: Shield, value: "Protected", label: "Account", color: "mint" as const },
    { icon: Lock, value: "Set", label: "Password", color: "slate" as const },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header - Same pattern as dashboard */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center flex-shrink-0 shadow-sm">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
            </div>
            <div>
              <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
                Security
              </h1>
              <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
                Manage your password and account security
              </p>
            </div>
          </div>
        </div>
        <LoadingState message="Loading security settings..." />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header - Same pattern as dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
          </div>
          <div>
            <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
              Security
            </h1>
            <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
              Manage your password and account security
            </p>
          </div>
        </div>
      </div>

      {/* Stats Row - Using StatRow component like pipelines */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm">
        <StatRow stats={stats} size="md" />
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[12px] font-medium text-rose-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-[#90FCA6]/15 border border-[#90FCA6]/20 flex items-center gap-3">
          <Check className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
          <p className="text-[12px] font-medium text-[#1a7a3a]">{success}</p>
        </div>
      )}

      {/* Password Section */}
      <div className="space-y-4 sm:space-y-6">
        <SectionHeader title="Authentication" icon={Key} />

        <PremiumCard hover={true}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="h-11 w-11 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
                <Key className="h-5 w-5 text-[#1a7a3a]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-semibold text-slate-900 tracking-tight">
                  Password
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Reset your password via email verification
                </p>
              </div>
            </div>

            <button
              onClick={handleResetPassword}
              disabled={isResettingPassword}
              className="h-11 px-6 text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#B8FDCA] text-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
        </PremiumCard>
      </div>

      {/* Security Tips */}
      <div className="space-y-4 sm:space-y-6">
        <SectionHeader title="Security Best Practices" icon={Shield} />

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
            <PremiumCard key={idx} hover={true}>
              <div className="flex items-start gap-3">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${tip.accent}15` }}
                >
                  <div style={{ color: tip.accent }}>{tip.icon}</div>
                </div>
                <div>
                  <h3 className="text-[12px] font-semibold text-slate-900">{tip.title}</h3>
                  <p className="text-[11px] text-slate-600 mt-0.5">{tip.description}</p>
                </div>
              </div>
            </PremiumCard>
          ))}
        </div>
      </div>

      {/* Info Footer */}
      <PremiumCard hover={false} className="bg-gradient-to-br from-[#90FCA6]/5 via-slate-50 to-white border-[#90FCA6]/10">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-white border border-[#90FCA6]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Shield className="h-5 w-5 text-[#1a7a3a]" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900 mb-1">
              Your account is protected
            </h3>
            <p className="text-[12px] text-slate-600 leading-relaxed">
              All passwords are encrypted using industry-standard hashing algorithms.
              We never store your password in plain text.
            </p>
          </div>
        </div>
      </PremiumCard>
    </div>
  )
}
