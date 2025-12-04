"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
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
        const { data: memberData } = await supabase
          .from("organization_members")
          .select("org_id, organizations(org_slug)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .single()

        if (memberData && memberData.organizations) {
          const org = memberData.organizations as any
          router.push(`/${org.org_slug}/dashboard?password_reset=true`)
          return
        }
      }

      // No org found, go to onboarding
      router.push("/onboarding/organization")
    } catch (err: any) {
      setError(err.message || "Failed to reset password")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-white p-6 font-sans antialiased">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A78] text-white shadow-sm">
            <Command className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reset Password</h1>
            <p className="text-sm text-gray-600">Enter your new password</p>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter new password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="focus:border-[#007A78] focus:ring-[#007A78]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-gray-700">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="focus:border-[#007A78] focus:ring-[#007A78]"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="py-2 bg-[#FFF5F3] border-[#FF6E50]">
                <AlertDescription className="text-[#FF6E50]">{error}</AlertDescription>
              </Alert>
            )}

            <button type="submit" className="cloudact-btn-primary w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
