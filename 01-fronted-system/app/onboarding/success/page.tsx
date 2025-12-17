"use client"

import { useEffect, useState, Suspense, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Cloud, Loader2, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { completeOnboarding } from "@/actions/organization"
import { Alert, AlertDescription } from "@/components/ui/alert"

// Validate Stripe session ID format
function isValidSessionId(sessionId: string | null): sessionId is string {
  if (!sessionId) return false
  // Stripe checkout session IDs start with "cs_" followed by alphanumeric chars
  return /^cs_[a-zA-Z0-9_]+$/.test(sessionId)
}

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")

  const [status, setStatus] = useState<"processing" | "success" | "error">("processing")
  const [error, setError] = useState<string | null>(null)
  const [orgSlug, setOrgSlug] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  // Prevent duplicate processing and back button issues
  const processingRef = useRef(false)
  const hasProcessedRef = useRef(false)

  const processCheckout = useCallback(async (isRetry = false) => {
    // Prevent duplicate processing
    if (processingRef.current && !isRetry) return
    processingRef.current = true

    // Validate session ID format before making request
    if (!isValidSessionId(sessionId)) {
      setStatus("error")
      setError("Invalid checkout session. Please try again from the billing page.")
      processingRef.current = false
      return
    }

    try {
      // Prevent back button re-processing by replacing history state
      if (typeof window !== "undefined" && !hasProcessedRef.current) {
        window.history.replaceState({ processing: true }, "", window.location.href)
      }

      // Check if user is authenticated
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // CRITICAL FIX: Preserve session_id in login redirect
        const currentUrl = `/onboarding/success?session_id=${encodeURIComponent(sessionId)}`
        router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`)
        processingRef.current = false
        return
      }

      // Call server action to complete onboarding
      // This will verify the checkout session and create the organization
      const result = await completeOnboarding(sessionId)

      if (!result.success) {
        setStatus("error")
        setError(result.error || "Failed to complete setup")
        processingRef.current = false
        return
      }

      hasProcessedRef.current = true
      setOrgSlug(result.orgSlug || null)
      setStatus("success")

      // Show success toast
      toast.success("Organization created!", {
        description: "Redirecting to your dashboard...",
        duration: 3000,
      })

      // Redirect to dashboard after a short delay
      // Note: This timeout doesn't need cleanup since it only runs after success
      // and the component will be unmounted by the redirect
      setTimeout(() => {
        router.push(`/${result.orgSlug}/dashboard?welcome=true`)
      }, 2000)

    } catch (err: unknown) {
      console.error("[v0] Checkout processing error:", err)
      setStatus("error")
      setError(err instanceof Error ? err.message : "Something went wrong. Please contact support.")
    } finally {
      processingRef.current = false
      setIsRetrying(false)
    }
  }, [sessionId, router])

  // Retry handler
  const handleRetry = useCallback(() => {
    setIsRetrying(true)
    setStatus("processing")
    setError(null)
    processCheckout(true)
  }, [processCheckout])

  useEffect(() => {
    // Check if we're coming back via back button after processing
    if (typeof window !== "undefined") {
      const state = window.history.state
      if (state?.processing && hasProcessedRef.current) {
        // Already processed, redirect to appropriate page
        if (orgSlug) {
          router.push(`/${orgSlug}/dashboard`)
        }
        return
      }
    }

    processCheckout()
  }, [processCheckout, orgSlug, router])

  if (status === "processing") {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
          <Loader2 className="h-10 w-10 animate-spin text-[#007A78]" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Setting up your organization...</h1>
          <p className="text-gray-600">
            Please wait while we complete your setup. This may take a moment.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-gray-600">
          <p>Creating your organization...</p>
          <p>Setting up your workspace...</p>
          <p>Configuring your subscription...</p>
        </div>
      </div>
    )
  }

  if (status === "error") {
    // Determine if error is retryable
    const isRetryable = error?.includes("network") ||
                        error?.includes("timeout") ||
                        error?.includes("temporarily") ||
                        error?.includes("Something went wrong")

    return (
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFF5F3]">
          <AlertTriangle className="h-10 w-10 text-[#FF6E50]" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Setup Failed</h1>
          <Alert variant="destructive" className="bg-[#FFF5F3] border-[#FF6E50]">
            <AlertDescription className="text-[#FF6E50]">{error}</AlertDescription>
          </Alert>
        </div>
        <div className="flex gap-4">
          {isRetryable && isValidSessionId(sessionId) ? (
            <button
              className="cloudact-btn-secondary"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </>
              )}
            </button>
          ) : (
            <button className="cloudact-btn-secondary" onClick={() => router.push("/onboarding/billing")}>
              Back to Billing
            </button>
          )}
          <button className="cloudact-btn-primary" onClick={() => router.push("/contact")}>
            Contact Support
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-md">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
        <CheckCircle className="h-10 w-10 text-[#007A78]" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Welcome aboard!</h1>
        <p className="text-gray-600">
          Your organization has been created successfully. Redirecting you to your dashboard...
        </p>
      </div>
      <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
    </div>
  )
}

function SuccessFallback() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
        <Loader2 className="h-10 w-10 animate-spin text-[#007A78]" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Loading...</h1>
        <p className="text-gray-600">Please wait...</p>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <div className="flex min-h-svh w-full flex-col bg-white">
      {/* Header with Logo */}
      <div className="flex items-center gap-2 p-6 md:p-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A78] text-white shadow">
          <Cloud className="h-5 w-5" />
        </div>
        <span className="font-semibold text-gray-900">CloudAct.ai</span>
      </div>

      {/* Main Content Centered */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 -mt-20">
        <Suspense fallback={<SuccessFallback />}>
          <SuccessContent />
        </Suspense>
      </div>
    </div>
  )
}
