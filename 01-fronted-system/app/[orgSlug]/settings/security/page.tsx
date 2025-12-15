"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Loader2,
  AlertTriangle,
  Shield,
  Key,
  CheckCircle2,
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
      setTimeout(() => setSuccess(null), 6000)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsResettingPassword(false)
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
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
          <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-muted border-[#007A78]/30">
          <CheckCircle2 className="h-4 w-4 text-[#007A78]" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      <div className="health-card shadow-sm">
        <div className="health-card-header mb-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#8E8E93]" />
            <h2 className="text-[22px] font-bold text-black">Security</h2>
          </div>
          <p className="text-[13px] sm:text-[15px] text-[#8E8E93] mt-1">Manage your password and security settings</p>
        </div>
        <div className="health-card-content space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-[#E5E5EA] rounded-xl bg-gray-50">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-[#8E8E93]" />
              <div>
                <p className="text-[15px] font-medium text-black">Password</p>
                <p className="text-[13px] text-[#8E8E93]">Reset your password via email</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleResetPassword} disabled={isResettingPassword} className="h-[36px] px-4 rounded-xl text-[15px] border border-[#E5E5EA] hover:bg-white shadow-sm transition-colors">
              {isResettingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
