"use client"

import type React from "react"
import Link from "next/link"
import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Cloud, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  const rawRedirect = searchParams.get("redirect")
  const redirectTo = isValidRedirect(rawRedirect) ? rawRedirect : null

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

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
        window.location.href = redirectTo
        return
      }

      // Otherwise, check if user has an organization
      // Use maybeSingle() to handle 0 or 1 rows gracefully
      console.log("[Auth] Checking org membership for user:", authData.user.id)
      const { data: orgData, error: orgError } = await supabase
        .from("organization_members")
        .select(`org_id, organizations!inner(org_slug)`)
        .eq("user_id", authData.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()

      console.log("[Auth] Org membership result:", orgData, "error:", orgError?.message)

      if (orgError) {
        console.error("[Auth] Failed to fetch organization membership:", orgError.message)
      }

      if (orgData?.organizations) {
        // Handle case where it might be returned as an array or object depending on relationship inference
        const org = (Array.isArray(orgData.organizations) 
          ? orgData.organizations[0] 
          : orgData.organizations) as { org_slug: string }
        
        console.log("[Auth] Found org, redirecting to dashboard:", org.org_slug)
        window.location.href = `/${org.org_slug}/dashboard`
      } else {
        console.log("[Auth] No org found, redirecting to billing")
        window.location.href = "/onboarding/billing"
      }
    } catch (err: unknown) {
      // Use generic error message to prevent account enumeration attacks
      console.error("[Auth] Login error:", err instanceof Error ? err.message : "Unknown error")
      setError("Invalid email or password")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-[420px] space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007A78] text-white shadow-lg">
          <Cloud className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-600">Sign in to access your CloudAct console</p>
        </div>
      </div>

      <div className="glass-card p-8">
        <form onSubmit={handlePasswordLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-[#1C1C1E]">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 bg-white/50 border-black/5 focus:border-[#007A78] focus:ring-[#007A78]/20 transition-all"
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-[#1C1C1E]">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 bg-white/50 border-black/5 focus:border-[#007A78] focus:ring-[#007A78]/20 transition-all"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <Alert variant="destructive" className="py-3 bg-[#FFF5F3] border-[#FF6E50]/30 text-[#FF6E50]">
              <AlertDescription className="text-sm font-medium">{error}</AlertDescription>
            </Alert>
          )}

          <button
            type="submit"
            className="cloudact-btn-primary w-full h-11 text-[15px] shadow-lg shadow-[#007A78]/20 hover:shadow-[#007A78]/30 hover:-translate-y-0.5 transition-all"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <div className="text-center">
            <Link href="/forgot-password" className="text-sm font-medium text-[#007A78] hover:text-[#005F5D] hover:underline">
              Forgot password?
            </Link>
          </div>
        </form>
      </div>

      <div className="text-center text-sm text-gray-600">
        Don't have an account?{" "}
        <Link href="/signup" className="font-semibold text-[#007A78] hover:text-[#005F5D] hover:underline">
          Start free trial
        </Link>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center mesh-gradient p-6">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}

function LoginFormFallback() {
  return (
    <div className="w-full max-w-[420px] space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#007A78] text-white shadow-xl shadow-[#007A78]/20">
          <Cloud className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[#1C1C1E] tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground font-medium">Sign in to access your CloudAct console</p>
        </div>
      </div>
      <div className="glass-card p-8 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    </div>
  )
}
