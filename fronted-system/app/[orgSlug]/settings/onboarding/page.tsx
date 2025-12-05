"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  AlertTriangle,
  Building2,
  Key,
  Users,
  RefreshCw,
  Cloud,
  CheckCircle2,
} from "lucide-react"
import { checkBackendOnboarding, getApiKeyInfo, onboardToBackend, saveApiKey, hasStoredApiKey } from "@/actions/backend-onboarding"
import { Input } from "@/components/ui/input"

export default function OnboardingPage() {
  const router = useRouter()
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState("")

  // Backend integration state
  const [backendOnboarded, setBackendOnboarded] = useState(false)
  const [backendOnboardingError, setBackendOnboardingError] = useState<string | null>(null)
  const [isRetryingOnboarding, setIsRetryingOnboarding] = useState(false)
  const [loadingBackendStatus, setLoadingBackendStatus] = useState(false)
  const [apiKeyFingerprint, setApiKeyFingerprint] = useState<string | null>(null)

  // Manual API key entry state
  const [manualApiKey, setManualApiKey] = useState("")
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)

  // Organization member count
  const [memberCount, setMemberCount] = useState<number>(0)

  // Organization subscription data from Supabase (source of truth)
  const [orgData, setOrgData] = useState<{
    plan: string
    billing_status: string
    pipelines_per_day_limit: number
    seat_limit: number
    providers_limit: number
  } | null>(null)

  // Check if user is owner
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    document.title = "Onboarding & Quota | CloudAct.ai"
  }, [])

  // Load backend status and org info
  const loadBackendStatus = useCallback(async () => {
    setLoadingBackendStatus(true)
    setBackendOnboardingError(null)

    try {
      const supabase = createClient()

      // Fetch organization data with subscription limits
      const { data: org } = await supabase
        .from("organizations")
        .select("plan, billing_status, pipelines_per_day_limit, seat_limit, providers_limit")
        .eq("org_slug", orgSlug)
        .single()

      if (org) {
        setOrgData({
          plan: org.plan || "starter",
          billing_status: org.billing_status || "trialing",
          pipelines_per_day_limit: org.pipelines_per_day_limit || 6,
          seat_limit: org.seat_limit || 2,
          providers_limit: org.providers_limit || 3,
        })
      }

      // Fetch member count for this organization via inner join
      const { count } = await supabase
        .from("organization_members")
        .select("*, organizations!inner(org_slug)", { count: "exact", head: true })
        .eq("organizations.org_slug", orgSlug)

      if (count !== null) {
        setMemberCount(count)
      }

      // Check if backend is onboarded via Supabase and if API key exists
      const [onboardingStatus] = await Promise.all([
        checkBackendOnboarding(orgSlug),
        hasStoredApiKey(orgSlug),
      ])

      setBackendOnboarded(onboardingStatus.onboarded)

      if (onboardingStatus.onboarded) {
        // Get API key info for fingerprint
        const result = await getApiKeyInfo(orgSlug)
        if (result.success) {
          setApiKeyFingerprint(result.apiKeyFingerprint || onboardingStatus.apiKeyFingerprint || null)
        } else if (onboardingStatus.apiKeyFingerprint) {
          setApiKeyFingerprint(onboardingStatus.apiKeyFingerprint)
        }
      }
    } catch {
      setBackendOnboardingError("Failed to check backend status")
    } finally {
      setLoadingBackendStatus(false)
    }
  }, [orgSlug])

  const checkOwnerAndLoad = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setEmail(user.email || "")

      // Check if user is owner
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role, organizations!inner(org_slug)")
        .eq("user_id", user.id)
        .eq("organizations.org_slug", orgSlug)
        .single()

      if (membership?.role !== "owner") {
        // Not owner, redirect to profile
        router.push(`/${orgSlug}/settings/profile`)
        return
      }

      setIsOwner(true)
      await loadBackendStatus()
    } catch {
      setError("Failed to verify access")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug, router, loadBackendStatus])

  useEffect(() => {
    void checkOwnerAndLoad()
  }, [checkOwnerAndLoad])

  // Retry backend onboarding if it failed previously
  const handleRetryOnboarding = async () => {
    setIsRetryingOnboarding(true)
    setBackendOnboardingError(null)
    setError(null)

    try {
      // Get org info from Supabase
      const supabase = createClient()
      const { data: org } = await supabase
        .from("organizations")
        .select("org_name, plan")
        .eq("org_slug", orgSlug)
        .single()

      if (!org) {
        setBackendOnboardingError("Organization not found")
        return
      }

      // Map Supabase plan to backend plan enum
      const planMapping: Record<string, string> = {
        starter: "STARTER",
        professional: "PROFESSIONAL",
        scale: "SCALE",
        enterprise: "SCALE",
      }
      const backendPlan = planMapping[org.plan?.toLowerCase() || "starter"] || "STARTER"

      // Retry onboarding
      const result = await onboardToBackend({
        orgSlug,
        companyName: org.org_name,
        adminEmail: email,
        subscriptionPlan: backendPlan as "STARTER" | "PROFESSIONAL" | "SCALE",
      })

      if (result.success) {
        setBackendOnboarded(true)
        setApiKeyFingerprint(result.apiKeyFingerprint || null)
        setSuccess("Backend connection successful! Your API key has been saved.")
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setBackendOnboardingError(result.error || "Backend onboarding failed")
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Backend onboarding failed"
      setBackendOnboardingError(errorMsg)
    } finally {
      setIsRetryingOnboarding(false)
    }
  }

  // Handle manual API key save
  const handleSaveApiKey = async () => {
    if (!manualApiKey.trim()) {
      setBackendOnboardingError("Please enter an API key")
      return
    }

    setIsSavingApiKey(true)
    setBackendOnboardingError(null)
    setError(null)

    try {
      const result = await saveApiKey(orgSlug, manualApiKey.trim())

      if (result.success) {
        setApiKeyFingerprint(manualApiKey.trim().slice(-4))
        setManualApiKey("") // Clear input
        setSuccess("API key saved successfully!")
        setTimeout(() => setSuccess(null), 4000)
        // Reload status to verify
        await loadBackendStatus()
      } else {
        setBackendOnboardingError(result.error || "Failed to save API key")
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Failed to save API key"
      setBackendOnboardingError(errorMsg)
    } finally {
      setIsSavingApiKey(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  if (!isOwner) {
    return null
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-muted border-green-500/50">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      {/* Organization Info Card */}
      <Card className="console-stat-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#007A78]" />
            <CardTitle className="console-card-title">Organization Details</CardTitle>
          </div>
          <CardDescription className="console-subheading">
            Your organization information and subscription plan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="console-label text-gray-500">Organization Slug</Label>
              <div className="p-3 bg-muted/50 rounded-lg border">
                <code className="console-small font-mono">{orgSlug}</code>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="console-label text-gray-500">Subscription Plan</Label>
              <div className="p-3 bg-muted/50 rounded-lg border flex items-center gap-2">
                <Badge variant="secondary" className="console-badge console-badge-teal uppercase">
                  {orgData?.plan || "starter"}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    orgData?.billing_status === "active"
                      ? "console-badge console-badge-success"
                      : orgData?.billing_status === "trialing"
                        ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                        : "console-badge console-badge-warning"
                  }
                >
                  {orgData?.billing_status || "trialing"}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="console-label text-gray-500">Team Members</Label>
              <div className="p-3 bg-muted/50 rounded-lg border flex items-center gap-2">
                <Users className="h-4 w-4 text-[#007A78]" />
                <span className="console-metric text-lg">{memberCount}</span>
                <span className="console-small text-gray-500">
                  / {orgData?.seat_limit || 2} seats
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Limits Card */}
      <Card className="console-stat-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-[#007A78]" />
            <CardTitle className="console-card-title">Subscription Limits</CardTitle>
          </div>
          <CardDescription className="console-subheading">
            Your current plan limits for pipeline operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg bg-[#F0FDFA] border-[#007A78]/20">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-[#007A78]" />
                <span className="console-body font-medium text-[#007A78]">Daily Pipelines</span>
              </div>
              <p className="console-metric text-[#007A78]">
                {orgData?.pipelines_per_day_limit || 6}
              </p>
              <p className="console-small text-[#007A78]/70">pipelines per day</p>
            </div>
            <div className="p-4 border rounded-lg bg-[#FFF5F3] border-[#FF6E50]/20">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-[#FF6E50]" />
                <span className="console-body font-medium text-[#FF6E50]">Monthly Pipelines</span>
              </div>
              <p className="console-metric text-[#FF6E50]">
                {(orgData?.pipelines_per_day_limit || 6) * 30}
              </p>
              <p className="console-small text-[#FF6E50]/70">pipelines per month</p>
            </div>
            <div className="p-4 border rounded-lg bg-[#F0FDFA] border-[#007A78]/20">
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="h-4 w-4 text-[#007A78]" />
                <span className="console-body font-medium text-[#007A78]">Providers</span>
              </div>
              <p className="console-metric text-[#007A78]">
                {orgData?.providers_limit || 3}
              </p>
              <p className="console-small text-[#007A78]/70">integrations allowed</p>
            </div>
            <div className="p-4 border rounded-lg bg-[#FFF5F3] border-[#FF6E50]/20">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-[#FF6E50]" />
                <span className="console-body font-medium text-[#FF6E50]">Concurrent</span>
              </div>
              <p className="console-metric text-[#FF6E50]">1</p>
              <p className="console-small text-[#FF6E50]/70">running at once</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backend Integration Status Card */}
      <Card className={`console-stat-card ${!backendOnboarded && !loadingBackendStatus ? "border-amber-500/50" : ""}`}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-[#007A78]" />
            <CardTitle className="console-card-title">Pipeline Backend Connection</CardTitle>
          </div>
          <CardDescription className="console-subheading">
            Connection status for data processing and analytics pipelines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingBackendStatus ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[#007A78]" />
              <span className="ml-2 console-small text-gray-500">Checking backend status...</span>
            </div>
          ) : backendOnboarded ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="console-body font-medium text-green-800 dark:text-green-200">Connected</p>
                    <p className="console-small text-green-600 dark:text-green-400">
                      Backend services are ready for pipeline operations
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="console-badge console-badge-success">
                    Active
                  </Badge>
                </div>
              </div>

              {/* API Key Fingerprint - Internal use only */}
              {apiKeyFingerprint && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="console-body font-medium text-gray-500">Internal API Key</p>
                      <p className="console-small text-gray-500/70">Used internally for pipeline operations - no action needed</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-muted rounded console-small font-mono text-gray-500">
                        ••••{apiKeyFingerprint}
                      </code>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleRetryOnboarding}
                  disabled={isRetryingOnboarding}
                  className="console-button-secondary"
                >
                  {isRetryingOnboarding ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Re-sync Connection
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-4 border rounded-lg bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="console-body font-medium text-amber-800 dark:text-amber-200">Not Connected</p>
                    <p className="console-small text-amber-600 dark:text-amber-400">
                      Backend onboarding is required for pipeline operations
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="console-badge console-badge-warning">
                  Pending
                </Badge>
              </div>

              {backendOnboardingError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{backendOnboardingError}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleRetryOnboarding}
                  disabled={isRetryingOnboarding}
                  className="console-button-primary"
                >
                  {isRetryingOnboarding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Cloud className="mr-2 h-4 w-4" />
                      Connect to Backend
                    </>
                  )}
                </Button>
              </div>

              {/* Manual API Key Entry */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="console-body font-medium mb-2">Already have an API key?</h4>
                <p className="console-small text-gray-500 mb-3">
                  If you received an API key from a previous onboarding or from an administrator, you can enter it here.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={`${orgSlug.replace(/-/g, "_")}_api_...`}
                    value={manualApiKey}
                    onChange={(e) => setManualApiKey(e.target.value)}
                    className="console-input font-mono"
                  />
                  <Button
                    variant="outline"
                    onClick={handleSaveApiKey}
                    disabled={isSavingApiKey || !manualApiKey.trim()}
                    className="console-button-secondary"
                  >
                    {isSavingApiKey ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4 mr-2" />
                    )}
                    Save Key
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
