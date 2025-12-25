"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Command, Loader2 } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    try {
      const supabase = createClient()

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) throw updateError

      // Get user's org to redirect properly
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Use maybeSingle() to handle 0 or 1 rows gracefully
        const { data: memberData, error: memberError } = await supabase
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
    } catch {
      // Use generic error message for security
      setError("Failed to reset password. Please request a new reset link.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-6">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-black shadow-lg">
            <Command className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">Reset Password</h1>
            <p className="text-gray-600">Enter your new password</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-8 shadow-lg">
          {/* suppressHydrationWarning: Password manager extensions inject elements before React hydrates */}
          <form onSubmit={handleSubmit} className="space-y-5" suppressHydrationWarning>
            <div className="space-y-2" suppressHydrationWarning>
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 focus:border-mint focus:ring-mint"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2" suppressHydrationWarning>
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 focus:border-mint focus:ring-mint"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="py-3 bg-[var(--cloudact-bg-coral)] border-coral">
                <AlertDescription className="text-sm text-coral">{error}</AlertDescription>
              </Alert>
            )}

            <button type="submit" className="cloudact-btn-primary w-full h-11 text-base font-semibold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
