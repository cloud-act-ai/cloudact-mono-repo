"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, UserPlus, AlertTriangle, CheckCircle2, Building2, Clock, Mail } from "lucide-react"
import { getInviteInfo, acceptInvite } from "@/actions/members"

interface InviteData {
  email: string
  role: string
  status: string
  expiresAt: string
  isExpired: boolean
  organization: {
    name: string
    slug: string
  }
}

// Invite token validation (64 hex chars from randomBytes(32).toString("hex"))
// Must match server-side validation in actions/members.ts
function isValidInviteToken(token: string): boolean {
  if (!token || typeof token !== "string") return false
  return /^[0-9a-f]{64}$/i.test(token)
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [isLoading, setIsLoading] = useState(true)
  const [isAccepting, setIsAccepting] = useState(false)
  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)

  const fetchInviteAndAuth = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Validate token format before making server call
      if (!isValidInviteToken(token)) {
        setError("Invalid invite link")
        setIsLoading(false)
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      setIsAuthenticated(!!user)
      setCurrentUserEmail(user?.email || null)

      const result = await getInviteInfo(token)

      if (!result.success) {
        setError(result.error || "Invalid invite")
        setIsLoading(false)
        return
      }

      setInviteData(result.data!)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load invite")
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchInviteAndAuth()
  }, [fetchInviteAndAuth])

  const handleAccept = async () => {
    setIsAccepting(true)
    setError(null)

    try {
      const result = await acceptInvite(token)

      if (!result.success) {
        if (result.requiresAuth) {
          router.push("/login?redirect=/invite/" + token)
          return
        }
        setError(result.error || "Failed to accept invite")
        setIsAccepting(false)
        return
      }

      setSuccess(result.message || "Successfully joined!")

      setTimeout(() => {
        if (typeof window === "undefined") return
        if (result.orgSlug) {
          // Use window.location.href for a hard navigation to ensure fresh state
          window.location.href = "/" + result.orgSlug + "/dashboard"
        } else {
          window.location.href = "/"
        }
      }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept invite")
      setIsAccepting(false)
    }
  }

  const handleSignIn = () => {
    // Use URLSearchParams for proper URL encoding
    const params = new URLSearchParams({ redirect: `/invite/${token}` })
    router.push(`/login?${params.toString()}`)
  }

  const handleSignUp = () => {
    // Use URLSearchParams for proper URL encoding
    const email = inviteData?.email || ""
    const params = new URLSearchParams({
      redirect: `/invite/${token}`,
      email: email
    })
    router.push(`/signup?${params.toString()}`)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#6EE890]" />
          <p className="text-sm text-gray-600">Loading invite...</p>
        </div>
      </div>
    )
  }

  if (error && !inviteData) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md bg-white">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF5F3]">
              <AlertTriangle className="h-6 w-6 text-[#FF6C5E]" />
            </div>
            <CardTitle className="text-gray-900">Invalid Invite</CardTitle>
            <CardDescription className="text-gray-600">{error}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <button className="cloudact-btn-primary" onClick={() => router.push("/")}>Go Home</button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md bg-white">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F0FDFA]">
              <CheckCircle2 className="h-6 w-6 text-[#6EE890]" />
            </div>
            <CardTitle className="text-gray-900">Welcome!</CardTitle>
            <CardDescription className="text-gray-600">{success}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-600">Redirecting to your dashboard...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isInviteValid = inviteData && inviteData.status === "pending" && !inviteData.isExpired
  const emailMismatch = isAuthenticated && currentUserEmail && inviteData &&
    currentUserEmail.toLowerCase() !== inviteData.email.toLowerCase()

  return (
    <div className="flex min-h-svh items-center justify-center bg-white p-4">
      <Card className="w-full max-w-md bg-white">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F0FDFA]">
            <UserPlus className="h-6 w-6 text-[#6EE890]" />
          </div>
          <CardTitle className="text-gray-900">Team Invitation</CardTitle>
          <CardDescription className="text-gray-600">
            You have been invited to join an organization
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Building2 className="h-5 w-5 text-gray-700" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{inviteData?.organization.name}</p>
                <p className="text-sm text-gray-600">Organization</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Mail className="h-5 w-5 text-gray-700" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{inviteData?.email}</p>
                <p className="text-sm text-gray-600">Invited email</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Role</span>
              <Badge variant="secondary" className="capitalize bg-gray-100 text-gray-700">
                {inviteData?.role === "read_only" ? "Read Only" : inviteData?.role}
              </Badge>
            </div>
          </div>

          {inviteData?.status !== "pending" && (
            <Alert variant="destructive" className="bg-[#FFF5F3] border-[#FF6C5E]">
              <AlertTriangle className="h-4 w-4 text-[#FF6C5E]" />
              <AlertDescription className="text-[#FF6C5E]">
                This invite has already been {inviteData?.status}.
              </AlertDescription>
            </Alert>
          )}

          {inviteData?.isExpired && (
            <Alert variant="destructive" className="bg-[#FFF5F3] border-[#FF6C5E]">
              <Clock className="h-4 w-4 text-[#FF6E50]" />
              <AlertDescription className="text-[#FF6C5E]">
                This invite has expired. Please ask the organization owner for a new invite.
              </AlertDescription>
            </Alert>
          )}

          {emailMismatch && (
            <Alert className="bg-[#F0FDFA] border-[#90FCA6]">
              <AlertTriangle className="h-4 w-4 text-[#6EE890]" />
              <AlertDescription className="text-gray-700">
                You are signed in as <strong>{currentUserEmail}</strong>, but this invite was sent to{" "}
                <strong>{inviteData?.email}</strong>. Please sign in with the correct account.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="bg-[#FFF5F3] border-[#FF6C5E]">
              <AlertDescription className="text-[#FF6C5E]">{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {isInviteValid && (
            <>
              {isAuthenticated ? (
                emailMismatch ? (
                  <button className="cloudact-btn-secondary w-full" onClick={handleSignIn}>
                    Sign in with different account
                  </button>
                ) : (
                  <button onClick={handleAccept} disabled={isAccepting} className="cloudact-btn-primary w-full">
                    {isAccepting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Accept Invitation
                      </>
                    )}
                  </button>
                )
              ) : (
                <>
                  <button onClick={handleSignUp} className="cloudact-btn-primary w-full">
                    Create Account & Join
                  </button>
                  <p className="text-center text-sm text-gray-600">
                    Already have an account?{" "}
                    <button
                      onClick={handleSignIn}
                      className="font-semibold text-[#007AFF] hover:text-[#0051D5] hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </>
              )}
            </>
          )}

          {!isInviteValid && (
            <button className="cloudact-btn-secondary w-full" onClick={() => router.push("/")}>
              Go Home
            </button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
