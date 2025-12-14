"use client"

import type React from "react"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Command, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
    } catch (err: unknown) {
      // Use generic error message to prevent email enumeration
      console.error("[Auth] Forgot password error:", err instanceof Error ? err.message : "Unknown error")
      setError("Failed to send reset email. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-6">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007A78] text-white shadow-lg">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-gray-900">Check your email</h1>
              <p className="text-gray-600">
                We've sent a password reset link to <span className="font-medium text-gray-900">{email}</span>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-8 shadow-lg">
            <p className="text-sm text-gray-600 mb-4">
              Click the link in the email to reset your password. The link will expire in 1 hour.
            </p>
            <Link href="/login" className="cloudact-btn-secondary w-full h-11 text-base font-semibold">
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-6">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007A78] text-white shadow-lg">
            <Command className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">Forgot Password?</h1>
            <p className="text-gray-600">Enter your email and we'll send you a reset link</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 focus:border-[#007A78] focus:ring-[#007A78]"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="py-3 bg-[#FFF5F3] border-[#FF6E50]">
                <AlertDescription className="text-sm text-[#FF6E50]">{error}</AlertDescription>
              </Alert>
            )}

            <button type="submit" className="cloudact-btn-primary w-full h-11 text-base font-semibold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>
        </div>

        <div className="text-center text-sm text-gray-600">
          Remember your password?{" "}
          <Link href="/login" className="font-semibold text-[#007A78] hover:text-[#005F5D] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
